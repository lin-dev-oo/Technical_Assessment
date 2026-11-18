import { Pool } from 'pg';
import { createApp } from './app.js';
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://comments:comments@localhost:5433/comments' });
const app = await createApp(pool);
const server = app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('Comments is ready on port ' + (process.env.PORT ?? 3000)));
async function shutdown() { server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
