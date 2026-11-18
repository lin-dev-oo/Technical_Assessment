import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { Pool } from 'pg';
import type { AddressInfo } from 'node:net';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL test database.');
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL database name must end in _test; tests reset its public schema.');
const header = 'postId,id,name,email,body\n';

test('imports accepted comments and retains them after reconnecting the service', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  let app = await createApp(pool);
  let server = app.listen(0);
  let base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const upload = (id: string, body: string) => fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-upload-id': id }, body });
  const result = await upload('first', header + '1,1,Alice,a@example.com,Hello');
  assert.deepEqual(await result.json(), { status: 'completed', inserted: 1, unchanged: 0 });
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
    assert.deepEqual(await (await upload('first', header + '1,1,Alice,a@example.com,Hello')).json(), { status: 'completed', inserted: 1, unchanged: 0 });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await secondPool.end();
  }
});

async function withApi(run: (api: { upload: (id: string, csv: string | Buffer) => Promise<Response>; list: (query?: string) => Promise<any>; pool: Pool }) => Promise<void>) {
  const pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const app = await createApp(pool);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run({
      pool,
      upload: (id, body) => fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-upload-id': id }, body: body as BodyInit }),
      list: async (query = '') => (await fetch(`${base}/api/comments${query}`)).json(),
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
}

test('validates atomically, counts unchanged comments, retains omitted IDs, and rejects an entire changed upload', () => withApi(async ({ upload, list }) => {
  await upload('seed', header + '1,1,A,a@b.com,One\n1,2,B,b@b.com,Two');
  const invalid = await upload('invalid', header + '1,3,C,c@b.com,Three\n0,4, ,bad,');
  assert.equal(invalid.status, 422);
  assert.equal((await list()).total, 2);
  const merged = await upload('merge', header + '1,1,A,a@b.com,One\n1,3,C,c@b.com,Three');
  assert.deepEqual(await merged.json(), { status: 'completed', inserted: 1, unchanged: 1 });
  const changed = await upload('changed', header + '1,1,A,a@b.com,Changed\n1,4,D,d@b.com,Four');
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).status, 'unsupported_conflict');
  const page = await list();
  assert.deepEqual(page.comments.map((row: any) => [row.id, row.body]), [[1, 'One'], [2, 'Two'], [3, 'Three']]);
}));

test('serializes concurrent retries and different uploads of a previously absent ID without overwriting', () => withApi(async ({ upload, list, pool }) => {
  async function together(first: () => Promise<Response>, second: () => Promise<Response>) {
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
  const csv = header + '1,1,A,a@b.com,One';
  const retries = await together(() => upload('concurrent-retry', csv), () => upload('concurrent-retry', csv));
  assert.deepEqual(await Promise.all(retries.map(response => response.json())), [
    { status: 'completed', inserted: 1, unchanged: 0 }, { status: 'completed', inserted: 1, unchanged: 0 },
  ]);
  const competing = await together(() => upload('competing-a', header + '1,2,A,a@b.com,Alpha'), () => upload('competing-b', header + '1,2,B,b@b.com,Beta'));
  assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
  const results = await Promise.all(competing.map(response => response.json()));
  assert.equal(results.filter(result => result.status === 'completed').length, 1);
  const accepted = (await list()).comments.find((comment: any) => comment.id === 2);
  assert.equal(accepted.body, competing[0].status === 200 ? 'Alpha' : 'Beta');
}));

test('rolls back database failures and permits a deliberate retry after recovery', () => withApi(async ({ upload, list, pool }) => {
  await pool.query('ALTER TABLE comments ADD CONSTRAINT injected_failure CHECK (id <> 99)');
  const csv = header + '1,3,C,c@b.com,Three\n1,99,D,d@b.com,Ninety nine';
  assert.equal((await upload('rollback', csv)).status, 503);
  assert.equal((await list()).total, 0);
  await pool.query('ALTER TABLE comments DROP CONSTRAINT injected_failure');
  assert.deepEqual(await (await upload('rollback', csv)).json(), { status: 'completed', inserted: 2, unchanged: 0 });
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
