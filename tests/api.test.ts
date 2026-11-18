import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { Pool } from 'pg';
import type { AddressInfo } from 'node:net';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.');
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL database name must end in _test; tests reset its public schema.');
const header = 'postId,id,name,email,body\n';

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
  assert.equal(filtered.page, 4);
  assert.deepEqual(filtered.comments.map((row: any) => row.id), [31]);
  const first = await list('?q=ordinary&pageSize=25');
  assert.equal(first.total, 31);
  assert.equal(first.comments.length, 25);
  assert.equal(first.comments[0].id, 1);
  assert.equal(first.comments[24].id, 25);
  assert.deepEqual(await list('?q=absent&page=999&pageSize=50'), { comments: [], total: 0, page: 1, pageSize: 50 });
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

async function withApi(run: (api: { upload: (id: string, csv: string | Buffer) => Promise<Response>; list: (query?: string) => Promise<any>; pool: Pool; request: (path: string, body?: object) => Promise<Response> }) => Promise<void>) {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const app = await createApp(pool);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run({
      pool,
      request: (path, body) => fetch(`${base}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined),
      upload: (id, body) => fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-upload-id': id }, body: body as BodyInit }),
      list: async (query = '') => (await fetch(`${base}/api/comments${query}`)).json(),
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
}

test('validates atomically, counts unchanged comments, retains omitted IDs, and stages changed comments while inserting new IDs', () => withApi(async ({ upload, list }) => {
  await upload('seed', header + '1,1,A,a@b.com,One\n1,2,B,b@b.com,Two');
  const invalid = await upload('invalid', header + '1,3,C,c@b.com,Three\n0,4, ,bad,');
  assert.equal(invalid.status, 422);
  assert.equal((await list()).total, 2);
  const merged = await upload('merge', header + '1,1,A,a@b.com,One\n1,3,C,c@b.com,Three');
  assert.deepEqual(await merged.json(), { status: 'completed', inserted: 1, unchanged: 1, conflicts: 0 });
  const changed = await upload('changed', header + '1,1,A,a@b.com,Changed\n1,4,D,d@b.com,Four');
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { status: 'completed', inserted: 1, unchanged: 0, conflicts: 1 });
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
  assert.deepEqual(await (await upload('failed-proposals', csv)).json(), { status: 'completed', inserted: 1, unchanged: 0, conflicts: 1 });
  assert.equal((await (await request('/api/comments/1/review')).json()).alternatives.length, 1);
}));
