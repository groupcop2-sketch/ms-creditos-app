import { ensureSecurityCatalog } from './security.service.js';

export async function bootstrapSecurityModule() {
  return ensureSecurityCatalog();
}
