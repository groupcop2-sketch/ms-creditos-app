import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';

export async function statusRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    const result = await pool.query<{ now: string; database_name: string }>(
      'select now()::text as now, current_database() as database_name'
    );

    return {
      status: 'ok',
      database: result.rows[0]?.database_name ?? 'unknown',
      timestamp: result.rows[0]?.now ?? new Date().toISOString()
    };
  });
}
