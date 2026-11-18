import express from 'express';
import type { Pool } from 'pg';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MAX_BYTES, parseUpload } from './csv.js';

export async function createApp(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS comments (
    id integer PRIMARY KEY CHECK (id > 0), "postId" integer NOT NULL CHECK ("postId" > 0),
    name text NOT NULL, email text NOT NULL, body text NOT NULL,
    version integer NOT NULL DEFAULT 1
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS upload_requests (
    id text PRIMARY KEY, digest text NOT NULL, http_status integer NOT NULL,
    outcome json NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  const app = express();
  app.get('/api/health', async (_req, res) => { await pool.query('SELECT 1'); res.json({ status: 'ok' }); });
  app.get('/api/sample', (_req, res) => res.download(path.resolve('data.csv')));
  app.get('/api/comments', async (req, res) => {
    const pageSize = [10, 25, 50].includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 25;
    const requested = Number(req.query.page);
    const requestedPage = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const numeric = /^\d+$/.test(query) ? Number(query) : NaN;
    const numericId = Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 2147483647 ? numeric : null;
    // strpos treats %, _ and backslashes as ordinary search text, unlike LIKE patterns.
    const filter = `WHERE $1 = '' OR strpos(lower(name), lower($1)) > 0
      OR strpos(lower(email), lower($1)) > 0 OR strpos(lower(body), lower($1)) > 0
      OR id = $2 OR "postId" = $2`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const { rows: [{ total }] } = await client.query(`SELECT count(*)::integer AS total FROM comments ${filter}`, [query, numericId]);
      const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
      const { rows: comments } = await client.query(`SELECT id, "postId", name, email, body, version FROM comments ${filter} ORDER BY id LIMIT $3 OFFSET $4`, [query, numericId, pageSize, (page - 1) * pageSize]);
      await client.query('COMMIT');
      res.json({ comments, total, page, pageSize });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.post('/api/uploads', async (req, res) => {
    const requestId = req.get('x-upload-id');
    if (!requestId || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) { res.status(400).json({ status: 'invalid_identity', message: 'Supply a unique X-Upload-Id (1–128 letters, numbers, underscores or hyphens).' }); return; }
    const hash = createHash('sha256');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const piece of req) {
      const chunk = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
      hash.update(chunk); size += chunk.length;
      if (size <= MAX_BYTES) chunks.push(chunk); else chunks.length = 0;
    }
    const digest = hash.digest('hex');
    const parsed = size > MAX_BYTES
      ? { ok: false as const, errors: [{ message: 'The file exceeds the 5 MB upload limit.' }] }
      : parseUpload(Buffer.concat(chunks));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // All dataset mutations use this transaction-scoped lock. Never acquire while receiving/parsing files.
      await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const previous = (await client.query('SELECT digest, http_status, outcome FROM upload_requests WHERE id = $1', [requestId])).rows[0];
      if (previous) {
        await client.query('COMMIT');
        if (previous.digest !== digest) res.status(409).json({ status: 'identity_reused', message: 'This upload identity was already used for another file. Choose the file again to start a new import.' });
        else res.status(previous.http_status).json(previous.outcome);
        return;
      }
      const finish = async (status: number, outcome: object) => {
        await client.query('INSERT INTO upload_requests (id, digest, http_status, outcome) VALUES ($1, $2, $3, $4)', [requestId, digest, status, JSON.stringify(outcome)]);
        await client.query('COMMIT');
        res.status(status).json(outcome);
      };
      if (!parsed.ok) { await finish(422, { status: 'rejected', errors: parsed.errors }); return; }
      const existing = await client.query('SELECT id, "postId", name, email, body FROM comments WHERE id = ANY($1::integer[])', [parsed.comments.map(comment => comment.id)]);
      const accepted = new Map(existing.rows.map(comment => [comment.id, comment]));
      const changed = parsed.comments.filter(comment => {
        const current = accepted.get(comment.id);
        return current && (current.postId !== comment.postId || current.name !== comment.name || current.email !== comment.email || current.body !== comment.body);
      });
      if (changed.length) {
        await finish(409, { status: 'unsupported_conflict', message: 'This file changes existing comments. Conflict review is not available yet. No comments were changed. Keep the accepted values or remove these IDs and try a new file.', errors: changed.map(comment => ({ field: 'id', message: `Comment ${comment.id} differs from its accepted version.` })) });
        return;
      }
      const incoming = parsed.comments.filter(comment => !accepted.has(comment.id));
      await client.query(`INSERT INTO comments (id, "postId", name, email, body)
        SELECT id, "postId", name, email, body FROM json_to_recordset($1::json)
        AS incoming(id integer, "postId" integer, name text, email text, body text)`, [JSON.stringify(incoming)]);
      await finish(200, { status: 'completed', inserted: incoming.length, unchanged: parsed.comments.length - incoming.length });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.use(express.static(path.resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(503).json({ status: 'unavailable', message: 'The service is unavailable. Retry this request shortly.' });
  });
  return app;
}
