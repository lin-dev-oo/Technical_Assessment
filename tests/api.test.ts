import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { Pool } from 'pg';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { attachRealtime } from '../server/realtime.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.');
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL database name must end in _test; tests reset its public schema.');
const header = 'postId,id,name,email,body\n';

test('serializes two saves from one accepted version and returns the current accepted data to the stale writer', () => withApi(async ({ upload, request, list, pool }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  const edit = { expectedVersion: 1, postId: 2, name: 'Edited', email: 'edit@example.com', body: 'First draft' };
  const responses = await together(pool,
    () => request('/api/comments/1/edit', edit),
    () => request('/api/comments/1/edit', { ...edit, body: 'Second draft' }));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const saved = await responses.find(response => response.status === 200)!.json();
  const stale = await responses.find(response => response.status === 409)!.json();
  assert.equal(saved.status, 'saved');
  assert.equal(saved.review.accepted.version, 2);
  assert.equal(stale.status, 'stale_edit');
  assert.deepEqual(stale.review, saved.review);
  assert.equal((await list()).comments[0].body, saved.review.accepted.body);
  assert.deepEqual(saved.review.alternatives, []);
}));

test('rejects invalid edits and identifier changes without changing accepted values', () => withApi(async ({ upload, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  const valid = { expectedVersion: 1, postId: 2, name: 'Edited', email: 'edit@example.com', body: 'Draft' };
  for (const change of [{ postId: 0 }, { postId: '2' }, { postId: 2147483648 }, { name: ' ' }, { email: 'bad' }, { body: '' }, { body: 'Null\u0000text' }, { id: 2 }]) {
    const response = await request('/api/comments/1/edit', { ...valid, ...change });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).status, 'rejected');
  }
  assert.equal((await list()).comments[0].body, 'Original');
  const response = await request('/api/comments/1/edit', { ...valid, body: '  A quoted, multiline\nbody  ' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).review.accepted.body, '  A quoted, multiline\nbody  ');
}));

test('blocks drafts after a pending conflict arrives until resolution and a deliberate current-version save', () => withApi(async ({ upload, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  const draft = { expectedVersion: 1, postId: 2, name: 'Edited', email: 'edit@example.com', body: 'Draft' };
  await upload('pending', header + '3,1,Alternative,other@example.com,Other body');
  const blocked = await request('/api/comments/1/edit', draft);
  assert.equal(blocked.status, 409);
  const result = await blocked.json();
  assert.equal(result.status, 'conflicted_edit');
  assert.equal(result.review.accepted.body, 'Original');
  assert.equal(result.review.alternatives.length, 1);
  assert.equal((await list()).comments[0].body, 'Original');
  await request('/api/comments/1/resolve', { expectedVersion: 1, expectedProposalRevision: result.review.proposalRevision, selected: result.review.alternatives[0].alternativeId });
  const stale = await request('/api/comments/1/edit', draft);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).status, 'stale_edit');
  const saved = await request('/api/comments/1/edit', { ...draft, expectedVersion: 2 });
  assert.equal(saved.status, 200);
  assert.equal((await list()).comments[0].body, 'Draft');
}));

test('searches the complete accepted dataset with literal case-insensitive text and exact numeric IDs', () => withApi(async ({ upload, list }) => {
  const rows = Array.from({ length: 31 }, (_, i) => `7,${i + 1},Ordinary,user${i + 1}@example.com,Body`);
  rows.push('42,142,MiXeD title,special@example.com,Literal 100%_match');
  await upload('search-fixture', header + rows.join('\n'));
  const ids = async (query: string) => (await list(`?q=${encodeURIComponent(query)}`)).comments.map((row: any) => row.id);
  assert.deepEqual(await ids('mixed'), [142]);
  assert.deepEqual(await ids('SPECIAL@EXAMPLE'), [142]);
  assert.deepEqual(await ids('100%_MATCH'), [142]);
  assert.deepEqual(await ids('100%_missing'), []);
  assert.deepEqual(await ids('42'), [142]);
  assert.deepEqual(await ids('31'), [31]);
  assert.deepEqual(await ids('2147483648'), []);
  assert.deepEqual(await ids('absent'), []);
  assert.deepEqual(await ids('14'), [14]);
  const filtered = await list('?q=ordinary&page=999&pageSize=10');
  assert.equal(filtered.total, 31);
  assert.equal(filtered.datasetTotal, 32);
  assert.equal(filtered.page, 4);
  assert.deepEqual(filtered.comments.map((row: any) => row.id), [31]);
  const first = await list('?q=ordinary&pageSize=25');
  assert.equal(first.total, 31);
  assert.equal(first.comments.length, 25);
  assert.equal(first.comments[0].id, 1);
  assert.equal(first.comments[24].id, 25);
  assert.deepEqual(await list('?q=absent&page=999&pageSize=50'), { comments: [], total: 0, datasetTotal: 32, conflictIds: [], page: 1, pageSize: 50 });
}));

test('imports accepted comments and retains them after reconnecting the service', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  let app = await createApp(pool);
  let server = app.listen(0);
  let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const upload = (id: string, body: string) => fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-upload-id': id }, body });
  const result = await upload('first', header + '1,1,Alice,a@example.com,Hello');
  assert.deepEqual(await result.json(), { status: 'completed', inserted: 1, unchanged: 0, conflicts: 0 });
  await upload('durable-proposal', header + '1,1,Alice,a@example.com,Pending after restart');
  const before = await (await fetch(`${base}/api/comments/1/review`)).json();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
  const secondPool = new Pool({ connectionString: databaseUrl });
  app = await createApp(secondPool);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const page = await (await fetch(`${base}/api/comments`)).json();
    assert.equal(page.total, 1);
    assert.equal(page.comments[0].body, 'Hello');
    assert.deepEqual(await (await fetch(`${base}/api/comments/1/review`)).json(), before);
    assert.deepEqual(await (await upload('first', header + '1,1,Alice,a@example.com,Hello')).json(), { status: 'completed', inserted: 1, unchanged: 0, conflicts: 0 });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await secondPool.end();
  }
});

test('staged atomic imports survive service restart and remain safe to apply or reject', async () => {
  let pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  let server = (await createApp(pool)).listen(0);
  let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, data: object) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const importFile = (id: string, body: string) => fetch(base + '/api/imports', { method: 'POST', headers: { 'x-upload-id': id }, body });
  const list = async () => (await fetch(base + '/api/comments')).json();
  try {
    assert.equal((await importFile('restart-seed', header + '1,1,A,a@example.com,Original')).status, 200);
    const csv = header + '1,1,A,a@example.com,Imported\n1,2,B,b@example.com,New';
    const staged = await (await importFile('restart-apply', csv)).json();
    await importFile('restart-reject', header + '1,1,A,a@example.com,Rejected\n1,3,C,c@example.com,Must stay absent');
    const before = await list();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
    pool = new Pool({ connectionString: databaseUrl });
    server = (await createApp(pool)).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    assert.deepEqual(await list(), before);
    assert.deepEqual(await (await importFile('restart-apply', csv)).json(), staged);
    assert.deepEqual(await (await post('/api/imports/restart-apply/refresh', {})).json(), staged);
    assert.equal((await (await post('/api/imports/restart-reject/reject', {})).json()).status, 'rejected_upload');
    assert.deepEqual(await list(), before);
    const choices = { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] };
    const applied = await (await post('/api/imports/restart-apply/commit', choices)).json();
    assert.deepEqual(applied, { status: 'completed', inserted: 1, updated: 1, unchanged: 0, conflicts: 0 });
    assert.deepEqual(await (await post('/api/imports/restart-apply/commit', choices)).json(), applied);
    assert.equal((await (await post('/api/imports/restart-reject/commit', choices)).json()).status, 'rejected_upload');
    assert.deepEqual((await list()).comments.map((row: any) => [row.id, row.body, row.version]), [[1, 'Imported', 2], [2, 'New', 1]]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});

async function withApi(run: (api: { eventsUrl: string; importFile: (id: string, csv: string) => Promise<Response>; upload: (id: string, csv: string | Buffer) => Promise<Response>; list: (query?: string) => Promise<any>; pool: Pool; request: (path: string, body?: object) => Promise<Response> }) => Promise<void>) {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const app = await createApp(pool);
  const server = app.listen(0);
  const stopRealtime = attachRealtime(app, server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run({
      pool,
      eventsUrl: base.replace('http:', 'ws:') + '/api/events',
      request: (path, body) => fetch(`${base}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined),
      importFile: (id, body) => fetch(`${base}/api/imports`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-upload-id': id }, body }),
      upload: (id, body) => fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-upload-id': id }, body: body as BodyInit }),
      list: async (query = '') => (await fetch(`${base}/api/comments${query}`)).json(),
    });
  } finally { stopRealtime(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
}

test('a resumed connection supersedes still-connected activity without duplicate indicators', () => withApi(async ({ eventsUrl }) => {
  const previous = new WebSocket(eventsUrl);
  const welcome = await new Promise<any>(resolve => previous.on('message', raw => { const message = JSON.parse(raw.toString()); if (message.type === 'session') resolve(message); }));
  assert.equal(typeof welcome.resumeToken, 'string');
  previous.send(JSON.stringify({ type: 'presence', cell: { commentId: 1, field: 'name' } }));
  const closed = new Promise(resolve => previous.once('close', resolve));
  const replacement = new WebSocket(`${eventsUrl}?resume=${welcome.resumeToken}`);
  const updates: any[] = [];
  replacement.on('message', raw => updates.push(JSON.parse(raw.toString())));
  try {
    await new Promise<void>(resolve => replacement.once('open', resolve));
    await closed;
    replacement.send(JSON.stringify({ type: 'presence', cell: { commentId: 1, field: 'body' } }));
    const end = Date.now() + 3000;
    while (!updates.some(item => item.type === 'presence' && item.sessions.length) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
    const active = updates.filter(item => item.type === 'presence' && item.sessions.length);
    assert.equal(active.length, 1);
    assert.equal(active[0].sessions.length, 1);
    assert.equal(active[0].sessions[0].sessionId, welcome.sessionId);
    assert.equal(active[0].sessions[0].cell.field, 'body');
    assert.equal('resumeToken' in active[0].sessions[0], false);
  } finally { previous.terminate(); replacement.terminate(); }
}));

test('validates temporary presence, assigns identities, and closes flooding sessions without writing comments', () => withApi(async ({ eventsUrl, list }) => {
  const observer = new WebSocket(eventsUrl);
  const messages: any[] = [];
  observer.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await new Promise<void>(resolve => observer.once('open', resolve));
  const sender = new WebSocket(eventsUrl);
  const own: any[] = [];
  sender.on('message', raw => own.push(JSON.parse(raw.toString())));
  await new Promise<void>(resolve => sender.once('open', resolve));
  const waitFor = async (condition: () => boolean) => {
    const end = Date.now() + 3000;
    while (!condition() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(condition(), 'Expected protocol outcome within three seconds');
  };
  try {
    await waitFor(() => own.some(item => item.type === 'session') && messages.some(item => item.type === 'session'));
    const identity = own.find(item => item.type === 'session');
    assert.notEqual(identity.sessionId, messages.find(item => item.type === 'session').sessionId);
    assert.notEqual(identity.label, messages.find(item => item.type === 'session').label);
    assert.notEqual(identity.color, messages.find(item => item.type === 'session').color);
    for (const cell of [{ commentId: 0, field: 'body' }, { commentId: 1, field: 'id' }, { commentId: 2147483648, field: 'body' }, { commentId: 1.5, field: 'name' }]) sender.send(JSON.stringify({ type: 'presence', cell }));
    sender.send('{malformed');
    sender.send(JSON.stringify({ type: 'presence', label: 'Spoof', color: 'red', sessionId: 'spoof', cell: { commentId: 1, field: 'body' } }));
    await waitFor(() => messages.some(item => item.type === 'presence' && item.sessions.length === 1));
    const updates = messages.filter(item => item.type === 'presence' && item.sessions.length);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].sessions, [{ sessionId: identity.sessionId, label: identity.label, color: identity.color, cell: { commentId: 1, field: 'body' } }]);
    const closed = new Promise<number>(resolve => sender.once('close', code => resolve(code)));
    for (let i = 0; i < 100; i++) sender.send(JSON.stringify({ type: 'presence', cell: { commentId: 1, field: 'body' } }));
    assert.equal(await closed, 1008);
    await waitFor(() => messages.at(-1)?.type === 'presence' && messages.at(-1).sessions.length === 0);
    assert.equal((await list()).total, 0);
  } finally { sender.terminate(); observer.terminate(); }
}));

test('notifies sockets only for committed dataset changes, excluding retries, no-ops, rejections and rollbacks', () => withApi(async ({ eventsUrl, upload, request, list, pool }) => {
  const csv = header + '1,1,Original,user@example.com,Accepted';
  await upload('seed', csv);
  const socket = new WebSocket(eventsUrl);
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const messages: unknown[] = [];
  const finalNotification = new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Committed notification did not arrive within three seconds.')), 3000);
    socket.on('message', raw => {
      const event = JSON.parse(raw.toString()); if (event.type === 'changed') messages.push(event);
      if (event.ids?.includes(2)) { clearTimeout(deadline); resolve(); }
    });
  });
  try {
    assert.equal((await upload('seed', csv)).status, 200);
    assert.equal((await upload('unchanged', csv)).status, 200);
    assert.equal((await upload('seed', csv + 'different')).status, 409);
    assert.equal((await upload('invalid', header + '0,2,A,bad,')).status, 422);
    await pool.query('ALTER TABLE comments ADD CONSTRAINT notification_failure CHECK (id <> 99)');
    assert.equal((await upload('rollback', header + '1,1,Original,user@example.com,Alternative\n1,99,A,a@example.com,New')).status, 503);
    await pool.query('ALTER TABLE comments DROP CONSTRAINT notification_failure');
    const proposal = header + '1,1,Original,user@example.com,Alternative';
    await upload('proposal', proposal);
    await upload('proposal', proposal);
    await upload('duplicate-proposal', proposal);
    const draft = { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Edited' };
    assert.equal((await request('/api/comments/1/edit', draft)).status, 409);
    const review = await (await request('/api/comments/1/review')).json();
    const decision = { selected: 'accepted', expectedVersion: 1, expectedProposalRevision: review.proposalRevision };
    assert.equal((await request('/api/comments/1/resolve', decision)).status, 200);
    assert.equal((await request('/api/comments/1/resolve', decision)).status, 409);
    assert.equal((await request('/api/comments/1/edit', draft)).status, 200);
    assert.equal((await request('/api/comments/1/edit', draft)).status, 409);
    await upload('final-change', header + '1,2,Final,final@example.com,Done');
    await finalNotification;
    assert.deepEqual(messages, [
      { type: 'changed', ids: [1] }, { type: 'changed', ids: [1] },
      { type: 'changed', ids: [1] }, { type: 'changed', ids: [2] },
    ]);
    const data = await list();
    assert.equal(data.comments[0].body, 'Edited');
    assert.equal(data.comments[0].pendingCount, 0);
    assert.equal(data.comments[1].body, 'Done');
  } finally { socket.terminate(); }
}));

test('validates atomically, counts unchanged comments, retains omitted IDs, and stages changed comments while inserting new IDs', () => withApi(async ({ upload, list }) => {
  await upload('seed', header + '1,1,A,a@b.com,One\n1,2,B,b@b.com,Two');
  const invalid = await upload('invalid', header + '1,3,C,c@b.com,Three\n0,4, ,bad,');
  assert.equal(invalid.status, 422);
  assert.equal((await list()).total, 2);
  const merged = await upload('merge', header + '1,1,A,a@b.com,One\n1,3,C,c@b.com,Three');
  assert.deepEqual(await merged.json(), { status: 'completed', inserted: 1, unchanged: 1, conflicts: 0 });
  const changed = await upload('changed', header + '1,1,A,a@b.com,Changed\n1,4,D,d@b.com,Four');
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { status: 'completed', inserted: 1, unchanged: 0, conflicts: 1, conflictIds: [1] });
  const page = await list();
  assert.deepEqual(page.comments.map((row: any) => [row.id, row.body]), [[1, 'One'], [2, 'Two'], [3, 'Three'], [4, 'Four']]);
}));

test('serializes concurrent retries and different uploads of a previously absent ID without overwriting', () => withApi(async ({ upload, list, pool }) => {
  const csv = header + '1,1,A,a@b.com,One';
  const retries = await together(pool, () => upload('concurrent-retry', csv), () => upload('concurrent-retry', csv));
  assert.deepEqual(await Promise.all(retries.map(response => response.json())), [
    { status: 'completed', inserted: 1, unchanged: 0, conflicts: 0 }, { status: 'completed', inserted: 1, unchanged: 0, conflicts: 0 },
  ]);
  const competing = await together(pool, () => upload('competing-a', header + '1,2,A,a@b.com,Alpha'), () => upload('competing-b', header + '1,2,B,b@b.com,Beta'));
  assert.deepEqual(competing.map(response => response.status).sort(), [200, 200]);
  const results = await Promise.all(competing.map(response => response.json()));
  assert.equal(results.filter(result => result.inserted === 1).length, 1);
  assert.equal(results.filter(result => result.conflicts === 1).length, 1);
  const accepted = (await list()).comments.find((comment: any) => comment.id === 2);
  assert.equal(accepted.body, results[0].inserted === 1 ? 'Alpha' : 'Beta');
}));

test('rolls back database failures and permits a deliberate retry after recovery', () => withApi(async ({ upload, list, pool }) => {
  await pool.query('ALTER TABLE comments ADD CONSTRAINT injected_failure CHECK (id <> 99)');
  const csv = header + '1,3,C,c@b.com,Three\n1,99,D,d@b.com,Ninety nine';
  assert.equal((await upload('rollback', csv)).status, 503);
  assert.equal((await list()).total, 0);
  await pool.query('ALTER TABLE comments DROP CONSTRAINT injected_failure');
  assert.deepEqual(await (await upload('rollback', csv)).json(), { status: 'completed', inserted: 2, unchanged: 0, conflicts: 0 });
}));

test('bounds files at the HTTP boundary and paginates the complete collection in stable ID order', () => withApi(async ({ upload, list }) => {
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
  const rejected = await upload('too-big', big);
  assert.equal(rejected.status, 422);
  assert.deepEqual(await (await upload('too-big', big)).json(), await rejected.json());
  const rows = Array.from({ length: 31 }, (_, i) => `1,${31 - i},Name,n@b.com,Body`).join('\n');
  await upload('many', header + rows);
  const defaultPage = await list();
  assert.equal(defaultPage.pageSize, 25);
  assert.equal(defaultPage.comments.length, 25);
  assert.deepEqual(defaultPage.comments.map((row: any) => row.id), Array.from({ length: 25 }, (_, i) => i + 1));
  const last = await list('?page=999&pageSize=10');
  assert.equal(last.page, 4);
  assert.deepEqual(last.comments.map((row: any) => row.id), [31]);
  assert.equal((await list('?page=1&pageSize=50')).comments.length, 31);
}));

test('returns persistent original outcomes for retries and rejects changed-content identity reuse', () => withApi(async ({ upload, pool }) => {
  const csv = header + '1,1,A,a@b.com,One';
  const first = await (await upload('request-one', csv)).json();
  assert.deepEqual(await (await upload('request-one', csv)).json(), first);
  const reuse = await upload('request-one', header + '1,2,B,b@b.com,Two');
  assert.equal(reuse.status, 409);
  assert.equal((await reuse.json()).status, 'identity_reused');
  const badCsv = header + '0,2,B,b@b.com,Two';
  const rejected = await (await upload('rejected-one', badCsv)).json();
  assert.deepEqual(await (await upload('rejected-one', badCsv)).json(), rejected);
  // Fixture changes accepted data to prove retry identity is independent of current row equality.
  await pool.query("UPDATE comments SET body = 'Later accepted value' WHERE id = 1");
  assert.deepEqual(await (await upload('request-one', csv)).json(), first);
  const changed = await (await upload('conflict-one', csv)).json();
  await pool.query("UPDATE comments SET body = 'One' WHERE id = 1");
  assert.deepEqual(await (await upload('conflict-one', csv)).json(), changed);
}));


test('reviews distinct alternatives together and resolves a complete version without recreating proposals on retry', () => withApi(async ({ upload, list, request }) => {
  await upload('accepted', header + '1,1,A,a@b.com,Accepted');
  const proposed = header + '2,1,B,b@b.com,Alternative';
  const outcome = await (await upload('proposal', proposed)).json();
  await upload('same-values', proposed);
  await upload('another', header + '3,1,C,c@b.com,Third');
  const review = await (await request('/api/comments/1/review')).json();
  assert.equal(review.accepted.body, 'Accepted');
  assert.deepEqual(review.alternatives.map((item: any) => item.body), ['Alternative', 'Third']);
  assert.equal(review.proposalRevision, 2);
  assert.equal((await list()).comments[0].pendingCount, 2);
  const response = await request('/api/comments/1/resolve', { expectedVersion: review.accepted.version, expectedProposalRevision: review.proposalRevision, selected: review.alternatives[0].alternativeId });
  assert.equal(response.status, 200);
  const resolved = await (await request('/api/comments/1/review')).json();
  assert.equal(resolved.accepted.body, 'Alternative');
  assert.equal(resolved.accepted.postId, 2);
  assert.equal(resolved.accepted.version, 2);
  assert.deepEqual(resolved.alternatives, []);
  assert.deepEqual(await (await upload('proposal', proposed)).json(), outcome);
  assert.deepEqual((await (await request('/api/comments/1/review')).json()).alternatives, []);
}));

async function together(pool: Pool, first: () => Promise<Response>, second: () => Promise<Response>) {
    const blocker = await pool.connect();
    await blocker.query('SELECT pg_advisory_lock(71422301)');
    const requests = [first(), second()];
    try {
      const deadline = Date.now() + 5000;
      while (true) {
        const { rows: [{ waiting }] } = await pool.query("SELECT count(*)::integer AS waiting FROM pg_locks WHERE locktype = 'advisory' AND objid = 71422301 AND NOT granted");
        if (waiting === 2) break;
        if (Date.now() > deadline) throw new Error('Both API requests must reach the write barrier before releasing it.');
        await new Promise(resolve => setImmediate(resolve));
      }
    } finally { await blocker.query('SELECT pg_advisory_unlock(71422301)'); blocker.release(); }
    return Promise.all(requests);
  }


test('rejects a review after new alternatives or another resolution, even when accepted values stay unchanged', () => withApi(async ({ upload, request, pool }) => {
  await upload('seed', header + '1,1,A,a@b.com,Accepted');
  await upload('first-proposal', header + '1,1,A,a@b.com,First');
  const first = await (await request('/api/comments/1/review')).json();
  const keep = { expectedVersion: first.accepted.version, expectedProposalRevision: first.proposalRevision, selected: 'accepted' };
  await upload('second-proposal', header + '1,1,A,a@b.com,Second');
  const stale = await request('/api/comments/1/resolve', keep);
  assert.equal(stale.status, 409);
  const refreshed = await stale.json();
  assert.equal(refreshed.status, 'stale_review');
  assert.equal(refreshed.review.alternatives.length, 2);
  const review = refreshed.review;
  const chooseAccepted = { ...keep, expectedProposalRevision: review.proposalRevision };
  const chooseAlternative = { ...chooseAccepted, selected: review.alternatives[0].alternativeId };
  const competing = await together(pool, () => request('/api/comments/1/resolve', chooseAccepted), () => request('/api/comments/1/resolve', chooseAlternative));
  assert.deepEqual(competing.map(item => item.status).sort(), [200, 409]);
  const winner = await (await request('/api/comments/1/review')).json();
  assert.equal(winner.accepted.body, competing[0].status === 200 ? 'Accepted' : 'First');
  assert.deepEqual(winner.alternatives, []);
  await upload('after-resolution', header + '1,1,A,a@b.com,Later');
  const newReview = await (await request('/api/comments/1/review')).json();
  assert.equal(newReview.alternatives.length, 1);
  assert.ok(newReview.proposalRevision > review.proposalRevision);
  assert.equal((await request('/api/comments/1/resolve', chooseAccepted)).status, 409);
  const result = await request('/api/comments/1/resolve', { expectedVersion: newReview.accepted.version, expectedProposalRevision: newReview.proposalRevision, selected: 'accepted' });
  assert.equal(result.status, 200);
  const retained = (await result.json()).review;
  assert.equal(retained.accepted.version, newReview.accepted.version);
  assert.equal(retained.accepted.body, newReview.accepted.body);
  assert.ok(retained.proposalRevision > newReview.proposalRevision);
}));

test('rolls back proposals and revisions when another record fails in the same upload', () => withApi(async ({ upload, request, pool }) => {
  await upload('seed', header + '1,1,A,a@b.com,Accepted');
  await pool.query('ALTER TABLE comments ADD CONSTRAINT injected_failure CHECK (id <> 99)');
  const csv = header + '1,1,A,a@b.com,Alternative\n1,99,B,b@b.com,New';
  assert.equal((await upload('failed-proposals', csv)).status, 503);
  const review = await (await request('/api/comments/1/review')).json();
  assert.equal(review.proposalRevision, 0);
  assert.deepEqual(review.alternatives, []);
  await pool.query('ALTER TABLE comments DROP CONSTRAINT injected_failure');
  assert.deepEqual(await (await upload('failed-proposals', csv)).json(), { status: 'completed', inserted: 1, unchanged: 0, conflicts: 1, conflictIds: [1] });
  assert.equal((await (await request('/api/comments/1/review')).json()).alternatives.length, 1);
}));


test('stages a whole conflicting import and rejects it without changing accepted data or new rows', () => withApi(async ({ upload, importFile, list, request }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  const before = await list();
  const csv = header + '2,1,Changed,a@example.com,Changed\n1,2,New,new@example.com,New body';
  const result = await (await importFile('staged', csv)).json();
  assert.equal(result.status, 'review_required');
  assert.deepEqual(result.conflictIds, [1]);
  assert.deepEqual(await list(), before);
  assert.equal((await (await request('/api/imports/staged/reject', {})).json()).status, 'rejected_upload');
  assert.deepEqual(await list(), before);
  assert.equal((await (await request('/api/imports/staged/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] })).json()).status, 'rejected_upload');
  assert.equal((await (await importFile('staged', csv)).json()).status, 'rejected_upload');
  assert.deepEqual(await list(), before);
}));

test('represents an incoming version identical to a legacy alternative only once', () => withApi(async ({ upload, importFile, request, list }) => {
  await upload('dedup-seed', header + '1,1,A,a@example.com,Original');
  const csv = header + '1,1,A,a@example.com,Changed';
  await upload('legacy-proposal', csv);
  const staged = await (await importFile('matching-proposal', csv)).json();
  const review = staged.reviews[1];
  assert.equal(review.alternatives.length, 1);
  assert.equal(review.alternatives[0].body, 'Changed');
  assert.equal((await request('/api/imports/matching-proposal/commit', { choices: [{ id: 1, selected: review.alternatives[0].alternativeId, expectedVersion: 1, expectedProposalRevision: review.proposalRevision }] })).status, 200);
  assert.equal((await list()).comments[0].body, 'Changed');
  assert.equal((await (await request('/api/comments/1/review')).json()).alternatives.length, 0);
}));

test('requires every conflict choice and commits the entire import once', () => withApi(async ({ upload, importFile, list, request }) => {
  await upload('seed', header + '1,1,A,a@example.com,One\n1,2,B,b@example.com,Two');
  const before = await list();
  await importFile('all', header + '2,1,Changed A,a@example.com,Changed one\n2,2,Changed B,b@example.com,Changed two\n1,3,C,c@example.com,Three');
  const incomplete = await request('/api/imports/all/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] });
  assert.equal(incomplete.status, 422);
  assert.deepEqual(await list(), before);
  const choice = { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }, { id: 2, selected: 'accepted', expectedVersion: 1, expectedProposalRevision: 0 }] };
  const committed = await (await request('/api/imports/all/commit', choice)).json();
  assert.deepEqual(committed, { status: 'completed', inserted: 1, updated: 1, unchanged: 1, conflicts: 0 });
  assert.deepEqual((await list()).comments.map((row: any) => [row.id, row.body]), [[1, 'Changed one'], [2, 'Two'], [3, 'Three']]);
  assert.deepEqual(await (await request('/api/imports/all/commit', choice)).json(), committed);
  assert.equal((await list()).comments[0].version, 2);
}));

test('rejects stale import choices while retaining later edits and keeping new rows staged', () => withApi(async ({ upload, importFile, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  await importFile('stale', header + '1,1,Imported,a@example.com,Imported\n1,2,New,n@example.com,New');
  await request('/api/comments/1/edit', { expectedVersion: 1, postId: 1, name: 'Other user', email: 'a@example.com', body: 'Later edit' });
  const response = await request('/api/imports/stale/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] });
  assert.equal(response.status, 409);
  const refreshed = await response.json();
  assert.equal(refreshed.reviews[1].accepted.body, 'Later edit');
  assert.equal((await list()).total, 1);
  assert.equal((await list()).comments[0].body, 'Later edit');
  assert.equal((await request('/api/imports/stale/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] })).status, 409);
  assert.equal((await request('/api/imports/stale/commit', { choices: [{ id: 1, selected: 'accepted', expectedVersion: 2, expectedProposalRevision: 0 }] })).status, 200);
  assert.equal((await list()).total, 2);
  assert.equal((await list()).comments[0].body, 'Later edit');
}));

test('detects a concurrent insertion into an ID that was new at import review', () => withApi(async ({ upload, importFile, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  await importFile('collision', header + '1,1,A,a@example.com,Changed\n1,2,New,n@example.com,New');
  await importFile('other-insert', header + '1,2,Other,o@example.com,Other');
  const response = await request('/api/imports/collision/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] });
  assert.equal(response.status, 409);
  assert.deepEqual((await response.json()).conflictIds, [1, 2]);
  assert.equal((await list()).comments[0].body, 'Original');
  assert.equal((await list()).comments[1].body, 'Other');
}));

test('serializes competing import commits and rejection without partial application', () => withApi(async ({ pool, upload, importFile, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  const csv = header + '1,1,A,a@example.com,Changed\n1,2,B,b@example.com,New';
  await importFile('race-commit', csv);
  const choices = { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] };
  const duplicates = await together(pool, () => request('/api/imports/race-commit/commit', choices), () => request('/api/imports/race-commit/commit', choices));
  assert.deepEqual(await duplicates[0].json(), await duplicates[1].json());
  assert.equal((await list()).comments[0].version, 2);
  await importFile('race-reject', header + '1,1,A,a@example.com,Last\n1,3,C,c@example.com,Third');
  const results = await together(pool, () => request('/api/imports/race-reject/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 2, expectedProposalRevision: 0 }] }), () => request('/api/imports/race-reject/reject', {}));
  const outcomes = await Promise.all(results.map(result => result.json()));
  assert.equal(outcomes[0].status, outcomes[1].status);
  const data = await list();
  if (outcomes[0].status === 'completed') { assert.equal(data.total, 3); assert.equal(data.comments[0].body, 'Last'); }
  else { assert.equal(data.total, 2); assert.equal(data.comments[0].body, 'Changed'); }
}));

test('rolls back every import choice and insertion on a database failure and permits retry', () => withApi(async ({ pool, upload, importFile, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  await importFile('rollback-import', header + '1,1,A,a@example.com,Changed\n1,99,B,b@example.com,New');
  await pool.query('ALTER TABLE comments ADD CONSTRAINT atomic_failure CHECK (id <> 99)');
  const choices = { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] };
  assert.equal((await request('/api/imports/rollback-import/commit', choices)).status, 503);
  assert.equal((await list()).comments[0].body, 'Original');
  assert.equal((await list()).total, 1);
  await pool.query('ALTER TABLE comments DROP CONSTRAINT atomic_failure');
  assert.equal((await request('/api/imports/rollback-import/commit', choices)).status, 200);
  assert.equal((await list()).total, 2);
  assert.equal((await list()).comments[0].body, 'Changed');
}));

test('rejects forged or duplicated choices and reusing an import ID for changed content', () => withApi(async ({ upload, importFile, request, list }) => {
  await upload('seed', header + '1,1,A,a@example.com,Original');
  const csv = header + '1,1,A,a@example.com,Changed';
  await importFile('choices', csv);
  for (const choices of [[{ id: 1, selected: 999 }], [{ id: 2, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }], [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }, { id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }]]) assert.equal((await request('/api/imports/choices/commit', { choices })).status, 422);
  assert.equal((await importFile('choices', header + '1,1,A,a@example.com,Another')).status, 409);
  assert.equal((await list()).comments[0].body, 'Original');
}));


test('sync heartbeats recover committed revision and unchanged active-cell presence', () => withApi(async ({ eventsUrl, upload, importFile, request }) => {
  await upload('sync-seed', header + '1,1,A,a@example.com,Original');
  const socket = new WebSocket(eventsUrl);
  await new Promise<void>(resolve => socket.once('open', resolve));
  const sync = (cell: null | { commentId: number; field: string }) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', receive); reject(new Error('Missing sync acknowledgment')); }, 3000);
    function receive(raw: any) {
      const message = JSON.parse(raw.toString());
      if (message.type === 'sync') { clearTimeout(timer); socket.off('message', receive); resolve(message); }
    }
    socket.on('message', receive);
    socket.send(JSON.stringify({ type: 'presence', cell }));
  });
  try {
    const first = await sync({ commentId: 1, field: 'body' });
    const again = await sync({ commentId: 1, field: 'body' });
    assert.equal(again.revision, first.revision);
    assert.deepEqual(again.sessions, first.sessions);
    await importFile('sync-draft', header + '1,1,A,a@example.com,Changed');
    assert.equal((await sync(null)).revision, first.revision);
    await request('/api/imports/sync-draft/reject', {});
    assert.equal((await sync(null)).revision, first.revision);
    await importFile('sync-apply', header + '1,1,A,a@example.com,Changed');
    await request('/api/imports/sync-apply/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] });
    assert.notEqual((await sync(null)).revision, first.revision);
  } finally { socket.terminate(); }
}));


test('refreshes a staged import without accepted writes and guards outdated choices', () => withApi(async ({ upload, importFile, request, list }) => {
  await upload('refresh-seed', header + '1,1,A,a@example.com,Original');
  await importFile('live-preview', header + '1,1,A,a@example.com,Imported\n1,2,B,b@example.com,New');
  await request('/api/comments/1/edit', { expectedVersion: 1, postId: 1, name: 'A', email: 'a@example.com', body: 'Later' });
  const before = await list();
  const refreshed = await (await request('/api/imports/live-preview/refresh', {})).json();
  assert.equal(refreshed.reviews[1].accepted.body, 'Later');
  assert.deepEqual(await list(), before);
  assert.equal((await request('/api/imports/live-preview/commit', { choices: [{ id: 1, selected: 0, expectedVersion: 1, expectedProposalRevision: 0 }] })).status, 409);
  await request('/api/comments/1/edit', { expectedVersion: 2, postId: 1, name: 'A', email: 'a@example.com', body: 'Imported' });
  const ready = await (await request('/api/imports/live-preview/refresh', {})).json();
  assert.deepEqual(ready.conflictIds, []);
  assert.equal((await list()).total, 1);
  assert.equal((await request('/api/imports/live-preview/commit', { choices: [] })).status, 200);
  assert.equal((await list()).total, 2);
  assert.equal((await list()).comments[0].version, 3);
}));
