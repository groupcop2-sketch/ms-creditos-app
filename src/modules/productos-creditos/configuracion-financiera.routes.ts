import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  listBancos,
  createBanco,
  updateBanco,
  deleteBanco,
  listTasas,
  createOrUpdateTasa,
  deleteTasa,
  validarEndpointDatosGovCo,
  sincronizarTasasDesdeDatosGovCo,
  listPlazos,
  createPlazo,
  updatePlazo,
  deletePlazo,
  listFormatosCredito,
  getFormatoCredito,
  createFormatoCredito,
  updateFormatoCredito,
  deleteFormatoCredito,
  CAMPOS_FORMATO_CREDITO_CATALOG,
  listFianzas,
  getFianza,
  createFianza,
  updateFianza,
  deleteFianza,
  listParametrosFinancieros,
  getParametroFinanciero,
  createParametroFinanciero,
  updateParametroFinanciero,
  deleteParametroFinanciero
} from './configuracion-financiera.service.js';

const bancoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  codigo: z.string().trim().nullable().optional()
});

const tasaSchema = z.object({
  tipoTasa: z.string().optional().default('USURA'),
  mes: z.string().min(1, 'El mes es requerido'),
  ano: z.coerce.number().int().positive(),
  base: z.coerce.number().int().optional().default(365),
  tasaEa: z.coerce.number().positive('La tasa E.A. debe ser positiva'),
  resolucion: z.string().nullable().optional(),
  modalidad: z.string().nullable().optional(),
  fuente: z.string().nullable().optional(),
  fecVigenciaDesde: z.string().nullable().optional(),
  fecVigenciaHasta: z.string().nullable().optional()
});

const plazoSchema = z.object({
  plazo: z.coerce.number().int().positive('El plazo debe ser mayor a 0'),
  unidad: z.enum(['DIAS', 'MESES']).default('DIAS'),
  descripcion: z.string().trim().nullable().optional(),
  activo: z.boolean().optional().default(true),
  orden: z.coerce.number().int().optional().default(0)
});

const formatoSchema = z.object({
  nombre: z.string().min(1, 'El nombre del formato es requerido'),
  descripcion: z.string().trim().nullable().optional(),
  campos: z.record(z.string(), z.boolean()).default({}),
  activo: z.boolean().optional().default(true)
});

export async function configuracionFinancieraRoutes(app: FastifyInstance) {
  // ==========================================
  // BANCOS
  // ==========================================
  app.get('/bancos', async (request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) => {
    const list = await listBancos(request.query.search);
    return reply.send(list);
  });

  app.post('/bancos', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = bancoSchema.parse(request.body);
    const created = await createBanco(parsed);
    return reply.code(201).send(created);
  });

  app.put('/bancos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const parsed = bancoSchema.parse(request.body);
    const updated = await updateBanco(id, parsed);
    return reply.send(updated);
  });

  app.delete('/bancos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    await deleteBanco(id);
    return reply.code(204).send();
  });

  // ==========================================
  // TASAS DE REFERENCIA (USURA / DTF / MORA)
  // ==========================================
  app.get('/tasas', async (request: FastifyRequest<{ Querystring: { tipo?: string; ano?: string } }>, reply: FastifyReply) => {
    const tipo = request.query.tipo || 'USURA';
    const ano = request.query.ano ? parseInt(request.query.ano, 10) : undefined;
    const list = await listTasas(tipo, ano);
    return reply.send(list);
  });

  app.post('/tasas', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = tasaSchema.parse(request.body);
    const saved = await createOrUpdateTasa(parsed);
    return reply.code(201).send(saved);
  });

  app.delete('/tasas/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    await deleteTasa(id);
    return reply.code(204).send();
  });

  app.post('/tasas/validar-endpoint', async (request: FastifyRequest<{ Body: { url?: string } }>, reply: FastifyReply) => {
    const body = (request.body as { url?: string }) || {};
    const res = await validarEndpointDatosGovCo(body.url);
    return reply.send(res);
  });

  app.post('/tasas/sincronizar', async (request: FastifyRequest<{ Body: { url?: string } }>, reply: FastifyReply) => {
    const body = (request.body as { url?: string }) || {};
    const res = await sincronizarTasasDesdeDatosGovCo(body.url);
    return reply.send(res);
  });

  // ==========================================
  // PLAZOS DE PAGO (POR DÍAS Y POR MESES)
  // ==========================================
  app.get('/plazos', async (request: FastifyRequest<{ Querystring: { unidad?: string } }>, reply: FastifyReply) => {
    const list = await listPlazos(request.query.unidad);
    return reply.send(list);
  });

  app.post('/plazos', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = plazoSchema.parse(request.body);
    const created = await createPlazo(parsed);
    return reply.code(201).send(created);
  });

  app.put('/plazos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const parsed = plazoSchema.parse(request.body);
    const updated = await updatePlazo(id, parsed);
    return reply.send(updated);
  });

  app.delete('/plazos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    await deletePlazo(id);
    return reply.code(204).send();
  });

  // ==========================================
  // FORMATOS DE CRÉDITO
  // ==========================================
  app.get('/formatos/campos-catalogo', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(CAMPOS_FORMATO_CREDITO_CATALOG);
  });

  app.get('/formatos', async (_request: FastifyRequest, reply: FastifyReply) => {
    const list = await listFormatosCredito();
    return reply.send(list);
  });

  app.get('/formatos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const item = await getFormatoCredito(id);
    return reply.send(item);
  });

  app.post('/formatos', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = formatoSchema.parse(request.body);
    const created = await createFormatoCredito(parsed);
    return reply.code(201).send(created);
  });

  app.put('/formatos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const parsed = formatoSchema.parse(request.body);
    const updated = await updateFormatoCredito(id, parsed);
    return reply.send(updated);
  });

  app.delete('/formatos/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    await deleteFormatoCredito(id);
    return reply.code(204).send();
  });

  // ==========================================
  // 5. FIANZAS Y CALIFICACIONES (Screenshots 1 & 2)
  // ==========================================
  app.get('/fianzas', async (request: FastifyRequest<{ Querystring: { search?: string } }>, reply: FastifyReply) => {
    const list = await listFianzas(request.query.search);
    return reply.send(list);
  });

  app.get('/fianzas/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const item = await getFianza(id);
    return reply.send(item);
  });

  app.post('/fianzas', async (request: FastifyRequest, reply: FastifyReply) => {
    const fianzaSchema = z.object({
      nombre: z.string().min(1, 'El nombre es requerido'),
      activo: z.boolean().optional().default(true),
      calificaciones: z.array(z.object({
        letra: z.string().min(1, 'La letra / categoría es requerida'),
        porcentaje: z.coerce.number()
      })).default([])
    });
    const parsed = fianzaSchema.parse(request.body);
    const created = await createFianza(parsed);
    return reply.code(201).send(created);
  });

  app.put('/fianzas/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const fianzaSchema = z.object({
      nombre: z.string().min(1, 'El nombre es requerido'),
      activo: z.boolean().optional().default(true),
      calificaciones: z.array(z.object({
        letra: z.string().min(1, 'La letra / categoría es requerida'),
        porcentaje: z.coerce.number()
      })).default([])
    });
    const parsed = fianzaSchema.parse(request.body);
    const updated = await updateFianza(id, parsed);
    return reply.send(updated);
  });

  app.delete('/fianzas/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    await deleteFianza(id);
    return reply.code(204).send();
  });

  // ==========================================
  // 6. TIPOS DE SALARIOS Y PARÁMETROS (SMMLV, IVA - Screenshot 3)
  // ==========================================
  app.get('/salarios', async (request: FastifyRequest<{ Querystring: { search?: string; tipo?: 'SALARIOS' | 'IVA' | 'TODOS' } }>, reply: FastifyReply) => {
    const list = await listParametrosFinancieros(request.query.search, request.query.tipo);
    return reply.send(list);
  });

  app.get('/salarios/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const item = await getParametroFinanciero(id);
    return reply.send(item);
  });

  app.post('/salarios', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramSchema = z.object({
      codigo: z.string().min(1, 'El código es requerido'),
      nombre: z.string().min(1, 'El nombre es requerido'),
      valor: z.coerce.number(),
      unidad: z.enum(['VALOR', 'PORCENTAJE']).default('VALOR'),
      vigenciaDesde: z.string().optional(),
      vigenciaHasta: z.string().nullable().optional(),
      activo: z.boolean().optional().default(true)
    });
    const parsed = paramSchema.parse(request.body);
    const created = await createParametroFinanciero(parsed);
    return reply.code(201).send(created);
  });

  app.put('/salarios/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    const paramSchema = z.object({
      codigo: z.string().optional(),
      nombre: z.string().optional(),
      valor: z.coerce.number().optional(),
      unidad: z.enum(['VALOR', 'PORCENTAJE']).optional(),
      vigenciaDesde: z.string().optional(),
      vigenciaHasta: z.string().nullable().optional(),
      activo: z.boolean().optional()
    });
    const parsed = paramSchema.parse(request.body);
    const updated = await updateParametroFinanciero(id, parsed);
    return reply.send(updated);
  });

  app.delete('/salarios/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const id = parseInt(request.params.id, 10);
    await deleteParametroFinanciero(id);
    return reply.code(204).send();
  });
}
