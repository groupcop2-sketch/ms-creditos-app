import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listFinancieras,
  getFinancieraById,
  createFinanciera,
  updateFinanciera,
  listIntegraciones,
  createIntegracion,
  listIntegracionesByFinanciera,
  upsertIntegracionFinanciera,
  toggleIntegracionFinanciera,
  verificarIntegracionActiva
} from './financieras.service.js';

const createFinancieraSchema = z.object({
  nit: z.string().trim().min(3),
  razonSocial: z.string().trim().min(3),
  sigla: z.string().trim().optional().nullable(),
  correo: z.string().trim().email().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  sitioWeb: z.string().trim().optional().nullable(),
  idLibranzera: z.coerce.number().int().positive().optional().nullable(),
  indActivo: z.boolean().optional()
});

const updateFinancieraSchema = createFinancieraSchema.partial();

const createIntegracionSchema = z.object({
  codigo: z.string().trim().min(2),
  nombre: z.string().trim().min(2),
  tipo: z.string().trim().min(2),
  descripcion: z.string().trim().optional().nullable(),
  urlBase: z.string().trim().optional().nullable(),
  configuracionSchema: z.any().optional()
});

const upsertIntegracionFinancieraSchema = z.object({
  idIntegracion: z.coerce.number().int().positive(),
  ambiente: z.string().trim().optional(),
  clientId: z.string().trim().optional().nullable(),
  clientSecret: z.string().trim().optional().nullable(),
  accountId: z.string().trim().optional().nullable(),
  apiKey: z.string().trim().optional().nullable(),
  urlBase: z.string().trim().optional().nullable(),
  webhookUrl: z.string().trim().optional().nullable(),
  datosConexion: z.any().optional(),
  indActivo: z.boolean().optional(),
  indModoPrueba: z.boolean().optional()
});

export async function financierasRoutes(app: FastifyInstance) {
  // 1. Listar todas las financieras
  app.get('/', async () => {
    return listFinancieras();
  });

  // 2. Obtener detalle de una financiera
  app.get('/:id', async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return getFinancieraById(params.id);
  });

  // 3. Crear una nueva financiera
  app.post('/', async (request) => {
    const body = createFinancieraSchema.parse(request.body);
    return createFinanciera(body);
  });

  // 4. Actualizar una financiera
  app.put('/:id', async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = updateFinancieraSchema.parse(request.body);
    return updateFinanciera(params.id, body);
  });

  // 5. Catálogo maestro de integraciones
  app.get('/catalogo/integraciones', async () => {
    return listIntegraciones();
  });

  // 6. Registrar una nueva integración en el catálogo maestro
  app.post('/catalogo/integraciones', async (request) => {
    const body = createIntegracionSchema.parse(request.body);
    return createIntegracion(body);
  });

  // 7. Listar integraciones configuradas para una financiera
  app.get('/:id/integraciones', async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listIntegracionesByFinanciera(params.id);
  });

  // 8. Guardar / Actualizar credenciales de una integración para una financiera
  app.post('/:id/integraciones', async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = upsertIntegracionFinancieraSchema.parse(request.body);
    return upsertIntegracionFinanciera(params.id, body);
  });

  // 9. Activar / Desactivar switch de una integración
  app.patch('/:id/integraciones/:idIntegracion/toggle', async (request) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      idIntegracion: z.coerce.number().int().positive()
    }).parse(request.params);
    const body = z.object({ indActivo: z.boolean() }).parse(request.body);
    return toggleIntegracionFinanciera(params.id, params.idIntegracion, body.indActivo);
  });

  // 10. Consulta pública / portal para verificar si una integración está activa
  app.get('/verificar', async (request) => {
    const query = z.object({
      codigo: z.string().trim().default('JUMIO'),
      creditoId: z.coerce.number().int().positive().optional(),
      idFinanciera: z.coerce.number().int().positive().optional()
    }).parse(request.query);

    return verificarIntegracionActiva(query.codigo, query.creditoId, query.idFinanciera);
  });
}
