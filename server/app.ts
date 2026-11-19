import express from 'express';
import { attachImports } from './imports.js';
import type { Pool, PoolClient } from 'pg';
import path from 'node:path';
import { validateFields } from './csv.js';

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
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
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
      const datasetTotal = query ? (await client.query('SELECT count(*)::integer AS total FROM comments')).rows[0].total : total;
      const conflictIds = (await client.query('SELECT DISTINCT comment_id FROM alternatives ORDER BY comment_id')).rows.map(row => row.comment_id as number);
      const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
      const { rows: comments } = await client.query(`SELECT id, "postId", name, email, body, version, proposal_revision AS "proposalRevision", (SELECT count(*)::integer FROM alternatives WHERE comment_id = comments.id) AS "pendingCount" FROM comments ${filter} ORDER BY id LIMIT $3 OFFSET $4`, [query, numericId, pageSize, (page - 1) * pageSize]);
      await client.query('COMMIT');
      res.json({ comments, total, datasetTotal, conflictIds, page, pageSize });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.get('/api/comments/:id/review', async (req, res) => {
    const id = commentId(req.params.id);
    if (!id) { res.status(400).json({ status: 'invalid_request', message: 'Supply a valid record ID.' }); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const review = await readReview(client, id);
      await client.query('COMMIT');
      if (!review) res.status(404).json({ status: 'not_found', message: 'Record not found.' });
      else res.json(review);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.post('/api/comments/:id/edit', express.json({ limit: '5mb' }), async (req, res) => {
    const id = commentId(req.params.id);
    const { expectedVersion, postId, name, email, body } = req.body ?? {};
    if (!id || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      res.status(400).json({ status: 'invalid_request', message: 'Supply a record ID and its accepted version.' }); return;
    }
    const errors = validateFields({ id, postId, name, email, body });
    if (typeof postId !== 'number' && !errors.some(error => error.field === 'postId')) errors.push({ field: 'postId', message: 'Use a positive whole number.' });
    if (Object.hasOwn(req.body, 'id')) errors.push({ field: 'id', message: 'Record IDs cannot be changed.' });
    if (errors.length) { res.status(422).json({ status: 'rejected', errors }); return; }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const review = await readReview(client, id);
      if (!review) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found', message: 'Record not found.' }); return; }
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
      if (!review) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found', message: 'Record not found.' }); return; }
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
  await attachImports(app, pool);
  app.use(express.static(path.resolve('dist')));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(503).json({ status: 'unavailable', message: 'The service is unavailable. Retry this request shortly.' });
  });
  return app;
}
