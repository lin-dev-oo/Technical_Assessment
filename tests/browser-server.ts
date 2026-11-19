import { Pool } from 'pg';
import { createApp } from '../server/app.js';
import { attachRealtime } from '../server/realtime.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Set TEST_DATABASE_URL to a dedicated database ending in _test. Browser tests reset its public schema.');
const pool = new Pool({ connectionString: url });
await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
const app = await createApp(pool);
const server = app.listen(3100, '0.0.0.0');
const stopRealtime = attachRealtime(app, server);
function shutdown() { stopRealtime(); server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
