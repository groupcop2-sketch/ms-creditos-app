import { ensureSecurityCatalog } from './security.service.js';
export async function bootstrapSecurityModule() {
    try {
        return await ensureSecurityCatalog();
    }
    catch (error) {
        console.warn('No se pudo inicializar el catálogo de seguridad con Supabase:', error);
        return null;
    }
}
