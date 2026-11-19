import express from 'express';
import type { Pool, PoolClient } from 'pg';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MAX_BYTES, parseUpload, validateFields } from './csv.js';

async function readReview(client: PoolClient, id: number) {
  const { rows: [accepted] } = await client.query(`SELECT id, "postId", name, email, body, version,
    proposal_revision AS "proposalRevision", upload_label AS "uploadLabel", session_label AS "sessionLabel"
    FROM comments WHERE id=$1`, [id]);
  if (!accepted) return null;
  const { rows: alternatives } = await client.query(`SELECT alternative_id AS "alternativeId", comment_id AS id,
    "postId", name, email, body, upload_label AS "uploadLabel", session_label AS "sessionLabel"
    FROM alternatives WHERE comment_id=$1 ORDER BY alternative_id`, [id]);
  return { accepted, alternatives, proposalRevision: accepted.proposalRevision };
}

function commentId(value: string) {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

function uploadLabel(value: string | undefined) {
  if (!value) return 'CSV upload';
  // The browser encodes filenames because HTTP header values cannot carry arbitrary Unicode.
  try { return decodeURIComponent(value).slice(0, 160); }
  catch { return value.slice(0, 160); }
}

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
  await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS proposal_revision integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS upload_label text NOT NULL DEFAULT 'Earlier upload',
    ADD COLUMN IF NOT EXISTS session_label text NOT NULL DEFAULT 'Unknown session'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS alternatives (
    alternative_id serial PRIMARY KEY, comment_id integer NOT NULL REFERENCES comments(id),
    "postId" integer NOT NULL, name text NOT NULL, email text NOT NULL, body text NOT NULL,
    upload_label text NOT NULL, session_label text NOT NULL
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS alternatives_comment_id ON alternatives(comment_id)');
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
      const { rows: comments } = await client.query(`SELECT id, "postId", name, email, body, version, proposal_revision AS "proposalRevision", (SELECT count(*)::integer FROM alternatives WHERE comment_id = comments.id) AS "pendingCount" FROM comments ${filter} ORDER BY id LIMIT $3 OFFSET $4`, [query, numericId, pageSize, (page - 1) * pageSize]);
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
      const finish = async (status: number, outcome: object, changedIds: number[] = []) => {
        await client.query('INSERT INTO upload_requests (id, digest, http_status, outcome) VALUES ($1, $2, $3, $4)', [requestId, digest, status, JSON.stringify(outcome)]);
        await client.query('COMMIT');
        if (changedIds.length) app.emit('committed', changedIds);
        res.status(status).json(outcome);
      };
      if (!parsed.ok) { await finish(422, { status: 'rejected', errors: parsed.errors }); return; }
      const existing = await client.query('SELECT id, "postId", name, email, body FROM comments WHERE id = ANY($1::integer[])', [parsed.comments.map(comment => comment.id)]);
      const accepted = new Map(existing.rows.map(comment => [comment.id, comment]));
      const changed = parsed.comments.filter(comment => {
        const current = accepted.get(comment.id);
        return current && (current.postId !== comment.postId || current.name !== comment.name || current.email !== comment.email || current.body !== comment.body);
      });
      const fileLabel = uploadLabel(req.get('x-upload-label'));
      const sessionLabel = (req.get('x-session-label') || 'Browser session').slice(0, 80);
      const changedIds: number[] = [];
      for (const comment of changed) {
        const values = [comment.id, comment.postId, comment.name, comment.email, comment.body];
        const duplicate = await client.query(`SELECT 1 FROM alternatives WHERE comment_id=$1 AND "postId"=$2 AND name=$3 AND email=$4 AND body=$5`, values);
        if (duplicate.rowCount) continue;
        await client.query(`INSERT INTO alternatives (comment_id, "postId", name, email, body, upload_label, session_label) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...values, fileLabel, sessionLabel]);
        await client.query('UPDATE comments SET proposal_revision=proposal_revision+1 WHERE id=$1', [comment.id]);
        changedIds.push(comment.id);
      }
      const incoming = parsed.comments.filter(comment => !accepted.has(comment.id));
      await client.query(`INSERT INTO comments (id, "postId", name, email, body, upload_label, session_label)
        SELECT id, "postId", name, email, body, $2, $3 FROM json_to_recordset($1::json)
        AS incoming(id integer, "postId" integer, name text, email text, body text)`, [JSON.stringify(incoming), fileLabel, sessionLabel]);
      await finish(200, { status: 'completed', inserted: incoming.length, unchanged: parsed.comments.length - incoming.length - changed.length, conflicts: changed.length }, [...changedIds, ...incoming.map(comment => comment.id)]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.get('/api/comments/:id/review', async (req, res) => {
    const id = commentId(req.params.id);
    if (!id) { res.status(400).json({ status: 'invalid_request', message: 'Supply a valid comment ID.' }); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const review = await readReview(client, id);
      await client.query('COMMIT');
      if (!review) res.status(404).json({ status: 'not_found', message: 'Comment not found.' });
      else res.json(review);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.post('/api/comments/:id/edit', express.json({ limit: '5mb' }), async (req, res) => {
    const id = commentId(req.params.id);
    const { expectedVersion, postId, name, email, body } = req.body ?? {};
    if (!id || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      res.status(400).json({ status: 'invalid_request', message: 'Supply a comment ID and its accepted version.' }); return;
    }
    const errors = validateFields({ id, postId, name, email, body });
    if (typeof postId !== 'number' && !errors.some(error => error.field === 'postId')) errors.push({ field: 'postId', message: 'Use a positive whole number.' });
    if (Object.hasOwn(req.body, 'id')) errors.push({ field: 'id', message: 'Comment IDs cannot be changed.' });
    if (errors.length) { res.status(422).json({ status: 'rejected', errors }); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const review = await readReview(client, id);
      if (!review) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found', message: 'Comment not found.' }); return; }
      if (review.alternatives.length || review.accepted.version !== expectedVersion) {
        await client.query('COMMIT'); res.status(409).json({ status: review.alternatives.length ? 'conflicted_edit' : 'stale_edit', review }); return;
      }
      await client.query(`UPDATE comments SET "postId"=$2, name=$3, email=$4, body=$5, version=version+1,
        upload_label='Manual edit', session_label=$6 WHERE id=$1`, [id, postId, name, email, body, (req.get('x-session-label') || 'Browser session').slice(0, 80)]);
      const saved = await readReview(client, id);
      await client.query('COMMIT');
      res.json({ status: 'saved', review: saved });
      app.emit('committed', [id]);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.post('/api/comments/:id/resolve', express.json({ limit: '4kb' }), async (req, res) => {
    const id = commentId(req.params.id);
    const { expectedVersion, expectedProposalRevision, selected } = req.body ?? {};
    if (!id || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !Number.isSafeInteger(expectedProposalRevision) || expectedProposalRevision < 0 ||
      !(selected === 'accepted' || (Number.isSafeInteger(selected) && selected > 0))) {
      res.status(400).json({ status: 'invalid_request', message: 'Choose a version from a current review.' }); return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const review = await readReview(client, id);
      if (!review) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found', message: 'Comment not found.' }); return; }
      if (review.accepted.version !== expectedVersion || review.proposalRevision !== expectedProposalRevision || !review.alternatives.length) {
        await client.query('COMMIT'); res.status(409).json({ status: 'stale_review', review }); return;
      }
      const chosen = selected === 'accepted' ? review.accepted : review.alternatives.find(item => item.alternativeId === selected);
      if (!chosen) { await client.query('COMMIT'); res.status(400).json({ status: 'invalid_selection', message: 'Choose a version from this review.' }); return; }
      if (selected !== 'accepted') {
        await client.query(`UPDATE comments SET "postId"=$2, name=$3, email=$4, body=$5, version=version+1,
          upload_label=$6, session_label=$7 WHERE id=$1`, [id, chosen.postId, chosen.name, chosen.email, chosen.body, chosen.uploadLabel, chosen.sessionLabel]);
      }
      await client.query('DELETE FROM alternatives WHERE comment_id=$1', [id]);
      await client.query('UPDATE comments SET proposal_revision=proposal_revision+1 WHERE id=$1', [id]);
      const resolved = await readReview(client, id);
      await client.query('COMMIT');
      res.json({ status: 'resolved', review: resolved });
      app.emit('committed', [id]);
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
