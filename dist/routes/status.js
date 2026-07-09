import { supabase } from '../lib/supabase.js';
export async function statusRoutes(app) {
    app.get('/status', async () => {
        const { data, error } = await supabase.from('profiles').select('id').limit(1);
        return {
            status: error ? 'degraded' : 'ok',
            database: 'supabase',
            timestamp: new Date().toISOString(),
            supabase: {
                connected: !error,
                error: error?.message ?? null
            },
            sample: data?.[0] ?? null
        };
    });
}
