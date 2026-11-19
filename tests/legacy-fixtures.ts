import { Pool } from 'pg';
import { parseUpload, type CommentValues } from '../server/csv.js';

// Only fixture setup: the retired upload route must not be recreated for tests.
// These rows represent conflicts already stored by an earlier application version.
export async function seedLegacyAlternatives(values: string | CommentValues[], uploadLabel = 'Earlier upload', sessionLabel = 'Earlier session') {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Legacy fixtures require a dedicated _test database.');
  const parsed = typeof values === 'string' ? parseUpload(Buffer.from(values)) : { ok: true as const, comments: values };
  if (!parsed.ok) throw new Error(`Invalid legacy fixture: ${JSON.stringify(parsed.errors)}`);
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(71422301)');
    for (const row of parsed.comments) {
      await client.query('INSERT INTO alternatives (comment_id, "postId", name, email, body, upload_label, session_label) VALUES ($1,$2,$3,$4,$5,$6,$7)', [row.id, row.postId, row.name, row.email, row.body, uploadLabel, sessionLabel]);
      await client.query('UPDATE comments SET proposal_revision=proposal_revision+1 WHERE id=$1', [row.id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
