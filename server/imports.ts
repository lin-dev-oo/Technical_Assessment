import express, { type Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { MAX_BYTES, parseUpload, type CommentValues } from './csv.js';

type Version = CommentValues & { version: number; proposalRevision: number; uploadLabel: string; sessionLabel: string; alternativeId?: number };
type Review = { accepted: Version; alternatives: Version[]; proposalRevision: number };
type Draft = { rows: CommentValues[]; uploadLabel: string; sessionLabel: string; expected: Record<number, [number, number] | null>; reviews: Record<number, Review> };
const fields = ['postId', 'name', 'email', 'body'] as const;
const differs = (a: CommentValues, b: CommentValues) => fields.some(field => a[field] !== b[field]);
const key = (id: string) => `import:${id}`;

// Browser imports are staged as request data, never as accepted rows or cell locks.
// Stored alternatives from earlier versions are included for conflict recovery.
export async function attachImports(app: Express, pool: Pool) {
  await pool.query('ALTER TABLE upload_requests ADD COLUMN IF NOT EXISTS draft json');

  async function prepare(client: PoolClient, rows: CommentValues[], uploadLabel: string, sessionLabel: string): Promise<Draft> {
    const ids = rows.map(row => row.id);
    const current = (await client.query(`SELECT id, "postId", name, email, body, version, proposal_revision AS "proposalRevision", upload_label AS "uploadLabel", session_label AS "sessionLabel" FROM comments WHERE id = ANY($1::integer[])`, [ids])).rows as Version[];
    const alternatives = (await client.query(`SELECT alternative_id AS "alternativeId", comment_id AS id, "postId", name, email, body, upload_label AS "uploadLabel", session_label AS "sessionLabel" FROM alternatives WHERE comment_id = ANY($1::integer[]) ORDER BY alternative_id`, [ids])).rows as Version[];
    const accepted = new Map(current.map(row => [row.id, row]));
    const expected: Draft['expected'] = {};
    const reviews: Draft['reviews'] = {};
    for (const row of rows) {
      const saved = accepted.get(row.id);
      expected[row.id] = saved ? [saved.version, saved.proposalRevision] : null;
      if (saved && differs(saved, row)) {
        const pending = alternatives.filter(item => item.id === row.id);
        reviews[row.id] = { accepted: saved, proposalRevision: saved.proposalRevision, alternatives: pending.some(item => !differs(item, row)) ? pending : [...pending, { ...row, version: 0, proposalRevision: 0, alternativeId: 0, uploadLabel, sessionLabel }] };
      }
    }
    return { rows, uploadLabel, sessionLabel, expected, reviews };
  }
  const reviewOutcome = (draft: Draft) => ({ status: 'review_required', conflicts: Object.keys(draft.reviews).length, conflictIds: draft.rows.filter(row => draft.reviews[row.id]).map(row => row.id), reviews: draft.reviews });
  async function apply(client: PoolClient, draft: Draft, choices: Map<number, 'accepted' | number>) {
    const incoming = draft.rows.filter(row => draft.expected[row.id] === null);
    const inserted = incoming.length;
    let updated = 0, unchanged = 0;
    const changedIds = incoming.map(row => row.id);
    if (incoming.length) await client.query(`INSERT INTO comments (id, "postId", name, email, body, upload_label, session_label)
      SELECT id, "postId", name, email, body, $2, $3 FROM json_to_recordset($1::json)
      AS incoming(id integer, "postId" integer, name text, email text, body text)`, [JSON.stringify(incoming), draft.uploadLabel, draft.sessionLabel]);
    for (const row of draft.rows) {
      const review = draft.reviews[row.id];
      if (draft.expected[row.id] === null) {
        continue;
      } else if (review) {
        const selected = choices.get(row.id)!;
        const chosen = selected === 'accepted' ? review.accepted : review.alternatives.find(item => item.alternativeId === selected)!;
        if (differs(chosen, review.accepted)) {
          await client.query('UPDATE comments SET "postId"=$2, name=$3, email=$4, body=$5, version=version+1, upload_label=$6, session_label=$7 WHERE id=$1', [row.id, chosen.postId, chosen.name, chosen.email, chosen.body, chosen.uploadLabel, chosen.sessionLabel]);
          updated++; changedIds.push(row.id);
        } else unchanged++;
        // Only legacy alternatives actually shown in this versioned review are closed.
        if (review.alternatives.some(item => item.alternativeId !== 0)) {
          await client.query('DELETE FROM alternatives WHERE comment_id=$1', [row.id]);
          await client.query('UPDATE comments SET proposal_revision=proposal_revision+1 WHERE id=$1', [row.id]);
          if (!changedIds.includes(row.id)) changedIds.push(row.id);
        }
      } else unchanged++;
    }
    return { outcome: { status: 'completed', inserted, updated, unchanged, conflicts: 0 }, changedIds };
  }

  app.post('/api/imports', async (req, res) => {
    const id = req.get('x-upload-id');
    if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) { res.status(400).json({ status: 'invalid_identity', message: 'Choose the file again.' }); return; }
    const hash = createHash('sha256');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const piece of req) { const chunk = Buffer.from(piece); hash.update(chunk); size += chunk.length; if (size <= MAX_BYTES) chunks.push(chunk); else chunks.length = 0; }
    const digest = hash.digest('hex');
    const parsed = size > MAX_BYTES ? { ok: false as const, errors: [{ message: 'The file exceeds the 5 MB upload limit.' }] } : parseUpload(Buffer.concat(chunks));
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const previous = (await client.query('SELECT digest, http_status, outcome FROM upload_requests WHERE id=$1', [key(id)])).rows[0];
      if (previous) { await client.query('COMMIT'); res.status(previous.digest === digest ? previous.http_status : 409).json(previous.digest === digest ? previous.outcome : { status: 'identity_reused', message: 'Choose the file again.' }); return; }
      if (!parsed.ok) {
        const outcome = { status: 'rejected', errors: parsed.errors };
        await client.query('INSERT INTO upload_requests (id,digest,http_status,outcome) VALUES ($1,$2,422,$3)', [key(id), digest, JSON.stringify(outcome)]);
        await client.query('COMMIT'); res.status(422).json(outcome); return;
      }
      let label = req.get('x-upload-label') || 'CSV upload';
      try { label = decodeURIComponent(label); } catch { /* Retain a usable filename. */ }
      const draft = await prepare(client, parsed.comments, label.slice(0,160), (req.get('x-session-label') || 'Browser session').slice(0,80));
      const staged = Object.keys(draft.reviews).length > 0;
      const result = staged ? { outcome: reviewOutcome(draft), changedIds: [] as number[] } : await apply(client, draft, new Map());
      await client.query('INSERT INTO upload_requests (id,digest,http_status,outcome,draft) VALUES ($1,$2,200,$3,$4)', [key(id), digest, JSON.stringify(result.outcome), staged ? JSON.stringify(draft) : null]);
      await client.query('COMMIT');
      if (result.changedIds.length) app.emit('committed', result.changedIds);
      res.json(result.outcome);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  app.post('/api/imports/:id/reject', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const request = (await client.query('SELECT outcome,draft FROM upload_requests WHERE id=$1', [key(req.params.id)])).rows[0];
      if (!request) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found' }); return; }
      const outcome = request.draft ? { status: 'rejected_upload', message: 'No records were changed.' } : request.outcome;
      if (request.draft) await client.query('UPDATE upload_requests SET draft=NULL,outcome=$2 WHERE id=$1', [key(req.params.id), JSON.stringify(outcome)]);
      await client.query('COMMIT'); res.json(outcome);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  app.post('/api/imports/:id/refresh', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const request = (await client.query('SELECT outcome,draft FROM upload_requests WHERE id=$1', [key(req.params.id)])).rows[0];
      if (!request) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found' }); return; }
      if (!request.draft) { await client.query('COMMIT'); res.json(request.outcome); return; }
      const draft = request.draft as Draft;
      const current = await prepare(client, draft.rows, draft.uploadLabel, draft.sessionLabel);
      const outcome = reviewOutcome(current);
      await client.query('UPDATE upload_requests SET draft=$2,outcome=$3 WHERE id=$1', [key(req.params.id), JSON.stringify(current), JSON.stringify(outcome)]);
      await client.query('COMMIT'); res.json(outcome);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });

  app.post('/api/imports/:id/commit', express.json({ limit: '2mb' }), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(71422301)');
      const request = (await client.query('SELECT outcome,draft FROM upload_requests WHERE id=$1', [key(req.params.id)])).rows[0];
      if (!request) { await client.query('COMMIT'); res.status(404).json({ status: 'not_found' }); return; }
      if (!request.draft) { await client.query('COMMIT'); res.json(request.outcome); return; }
      const draft = request.draft as Draft;
      const current = await prepare(client, draft.rows, draft.uploadLabel, draft.sessionLabel);
      if (draft.rows.some(row => JSON.stringify(draft.expected[row.id]) !== JSON.stringify(current.expected[row.id]))) {
        const outcome = reviewOutcome(current);
        await client.query('UPDATE upload_requests SET draft=$2,outcome=$3 WHERE id=$1', [key(req.params.id), JSON.stringify(current), JSON.stringify(outcome)]);
        await client.query('COMMIT'); res.status(409).json({ ...outcome, status: 'stale_import' }); return;
      }
      const supplied: unknown = req.body?.choices;
      if (!Array.isArray(supplied) || supplied.length > draft.rows.length) { await client.query('COMMIT'); res.status(422).json({ status: 'invalid_choices' }); return; }
      const choices = new Map<number, 'accepted' | number>();
      for (const item of supplied) {
        if (!item || !Number.isInteger(item.id) || choices.has(item.id) || !draft.reviews[item.id] || !(item.selected === 'accepted' || Number.isInteger(item.selected)) || (item.selected !== 'accepted' && !draft.reviews[item.id].alternatives.some(version => version.alternativeId === item.selected))) { await client.query('COMMIT'); res.status(422).json({ status: 'invalid_choices' }); return; }
        const reviewed = draft.reviews[item.id];
        if (item.expectedVersion !== reviewed.accepted.version || item.expectedProposalRevision !== reviewed.proposalRevision) { await client.query('COMMIT'); res.status(409).json({ ...reviewOutcome(draft), status: 'stale_import' }); return; }
        choices.set(item.id, item.selected);
      }
      if (Object.keys(draft.reviews).some(id => !choices.has(Number(id)))) { await client.query('COMMIT'); res.status(422).json({ status: 'incomplete_review' }); return; }
      const result = await apply(client, draft, choices);
      await client.query('UPDATE upload_requests SET draft=NULL,outcome=$2 WHERE id=$1', [key(req.params.id), JSON.stringify(result.outcome)]);
      await client.query('COMMIT');
      if (result.changedIds.length) app.emit('committed', result.changedIds);
      res.json(result.outcome);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
}
