import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase.js';

export async function statusRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    // Especificamos el esquema 'Creditos' y la tabla 'TBL_USUARIOS'
    const { data, error } = await supabase.schema('Creditos').from('TBL_USUARIOS').select('*');

    return {
      status: error ? 'degraded' : 'ok',
      database: 'supabase',
      timestamp: new Date().toISOString(),
      supabase: {
        connected: !error,
        error: error?.message ?? null
      },
      usuarios: data ?? []
    };
  });
}
