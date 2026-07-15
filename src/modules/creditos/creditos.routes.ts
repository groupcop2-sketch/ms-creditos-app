import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import {
  createCredito,
  anularDesembolsoCredito,
  anularLiquidacionDefinitiva,
  causarCredito,
  decideCredito,
  asignarFondeoCredito,
  getCreditoDocumentoArchivo,
  getCreditoPagoSoporteArchivo,
  getCreditoExpediente,
  listOpcionesFondeo,
  listCreditoDocumentos,
  listCreditoEtapas,
  listCreditos,
  listCreditosCatalogs,
  registrarDesembolso,
  registrarPagoCredito,
  registrarRecaudoMasivo,
  reversarPagoCredito,
  registrarEvaluacionCredito,
  registrarLiquidacionDefinitiva,
  simularCredito,
  uploadCreditoDocumento,
  uploadCreditoPagoSoporte,
  updateCreditoDocumento,
  updateCreditoEtapa
} from './creditos.service.js';

const creditoSchema = z.object({
  idProductoCredito: z.coerce.number().int().positive(),
  idLibranzera: z.coerce.number().int().positive().nullable().optional(),
  idEmpresa: z.coerce.number().int().positive().nullable().optional(),
  idEmpleadoEmpresa: z.coerce.number().int().positive().nullable().optional(),
  idComercial: z.coerce.number().int().positive().nullable().optional(),
  identificacionCliente: z.string().trim().min(1),
  nombreCliente: z.string().trim().min(1),
  correoCliente: z.string().trim().nullable().optional(),
  telefonoCliente: z.string().trim().nullable().optional(),
  montoSolicitado: z.coerce.number().positive(),
  plazo: z.coerce.number().int().positive(),
  tasa: z.coerce.number().nonnegative().nullable().optional()
});

const simulacionSchema = z.object({
  idProductoCredito: z.coerce.number().int().positive(),
  idEmpleadoEmpresa: z.coerce.number().int().positive().nullable().optional(),
  montoSolicitado: z.coerce.number().positive(),
  plazo: z.coerce.number().int().positive(),
  tasa: z.coerce.number().nonnegative().nullable().optional()
});

const etapaUpdateSchema = z.object({
  estado: z.enum(['EN_PROCESO', 'APROBADA', 'DEVUELTA', 'RECHAZADA']),
  observacion: z.string().trim().nullable().optional()
});

const documentoUpdateSchema = z.object({
  estado: z.enum(['PENDIENTE', 'CARGADO', 'APROBADO', 'RECHAZADO']),
  archivoUrl: z.string().trim().nullable().optional(),
  observacion: z.string().trim().nullable().optional()
});

const evaluacionSchema = z.object({
  observacion: z.string().trim().nullable().optional()
});

const liquidacionDefinitivaSchema = z.object({
  observacion: z.string().trim().nullable().optional()
});

const decisionSchema = z.object({
  decision: z.enum(['APROBADO', 'RECHAZADO', 'DEVUELTO']),
  montoAprobado: z.coerce.number().positive().nullable().optional(),
  plazoAprobado: z.coerce.number().int().positive().nullable().optional(),
  tasaAprobada: z.coerce.number().nonnegative().nullable().optional(),
  cuotaAprobada: z.coerce.number().positive().nullable().optional(),
  observacion: z.string().trim().nullable().optional()
});

const desembolsoSchema = z.object({
  valorDesembolso: z.coerce.number().positive(),
  fechaDesembolso: z.string().trim().min(1),
  fechaPrimeraCuota: z.string().trim().nullable().optional(),
  diaCorte: z.coerce.number().int().min(1).max(31).nullable().optional(),
  diaPagoOportuno: z.coerce.number().int().min(1).max(31).nullable().optional(),
  periodicidad: z.enum(['MENSUAL', 'QUINCENAL']).nullable().optional(),
  ajustarFinSemana: z.boolean().nullable().optional(),
  moraDespuesVencimiento: z.coerce.number().int().min(0).nullable().optional(),
  observacionCalendario: z.string().trim().nullable().optional(),
  idInversion: z.coerce.number().int().positive().nullable().optional(),
  valorFondeo: z.coerce.number().positive().nullable().optional(),
  bancoDestino: z.string().trim().nullable().optional(),
  tipoCuenta: z.string().trim().nullable().optional(),
  numeroCuenta: z.string().trim().nullable().optional(),
  referenciaPago: z.string().trim().nullable().optional(),
  numeroOrden: z.string().trim().nullable().optional(),
  comprobantePago: z.string().trim().nullable().optional(),
  observacion: z.string().trim().nullable().optional()
});

const fondeoSchema = z.object({
  idInversion: z.coerce.number().int().positive(),
  valorAsignado: z.coerce.number().positive(),
  observacion: z.string().trim().nullable().optional()
});

const pagoSchema = z.object({
  fechaPago: z.string().trim().min(1),
  valorPago: z.coerce.number().positive(),
  medioPago: z.string().trim().nullable().optional(),
  referenciaPago: z.string().trim().nullable().optional(),
  tipoRecaudo: z.enum(['NOMINA', 'MANUAL']).nullable().optional(),
  periodoNomina: z.string().trim().nullable().optional(),
  observacion: z.string().trim().nullable().optional()
});

const causacionSchema = z.object({
  fechaCorte: z.string().trim().min(1),
  observacion: z.string().trim().nullable().optional()
});

const anulacionOperacionSchema = z.object({
  observacion: z.string().trim().nullable().optional()
});

const reversoPagoSchema = z.object({
  observacion: z.string().trim().nullable().optional()
});

const recaudoMasivoSchema = z.object({
  fechaPago: z.string().trim().min(1),
  periodoNomina: z.string().trim().min(1),
  referenciaLote: z.string().trim().nullable().optional(),
  observacion: z.string().trim().nullable().optional(),
  pagos: z.array(z.object({
    creditoId: z.coerce.number().int().positive().nullable().optional(),
    consecutivo: z.string().trim().nullable().optional(),
    identificacionCliente: z.string().trim().nullable().optional(),
    valorPago: z.coerce.number().positive(),
    referenciaPago: z.string().trim().nullable().optional(),
    observacion: z.string().trim().nullable().optional()
  })).min(1)
});

function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(permission)) {
      return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
    }
  };
}

export async function creditosRoutes(app: FastifyInstance) {
  app.get('/catalogos', { preHandler: [app.authenticate] }, async () => listCreditosCatalogs());

  app.get('/', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async () => listCreditos());

  app.get('/fondeo/opciones', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async () => listOpcionesFondeo());

  app.post('/simular', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
    const body = simulacionSchema.parse(request.body);
    return simularCredito(body);
  });

  app.post('/', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const body = creditoSchema.parse(request.body);
    return createCredito(body);
  });

  app.get('/:id/documentos', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listCreditoDocumentos(params.id);
  });

  app.get('/:id/etapas', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listCreditoEtapas(params.id);
  });

  app.get('/:id/expediente', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return getCreditoExpediente(params.id);
  });

  app.post('/:id/evaluacion', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = evaluacionSchema.parse(request.body ?? {});
    const user = request.user as JwtUserPayload | undefined;
    return registrarEvaluacionCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/:id/liquidacion-definitiva', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = liquidacionDefinitivaSchema.parse(request.body ?? {});
    const user = request.user as JwtUserPayload | undefined;
    return registrarLiquidacionDefinitiva(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/liquidaciones/:id/anulacion', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = anulacionOperacionSchema.parse(request.body ?? {});
    const user = request.user as JwtUserPayload | undefined;
    return anularLiquidacionDefinitiva(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/desembolsos/:id/anulacion', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = anulacionOperacionSchema.parse(request.body ?? {});
    const user = request.user as JwtUserPayload | undefined;
    return anularDesembolsoCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/:id/causacion', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = causacionSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return causarCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/:id/decision', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = decisionSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return decideCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/:id/desembolso', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = desembolsoSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return registrarDesembolso(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/:id/fondeo', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = fondeoSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return asignarFondeoCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/recaudos/masivo', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const body = recaudoMasivoSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return registrarRecaudoMasivo({ ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/:id/pagos', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = pagoSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return registrarPagoCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/pagos/:id/reverso', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = reversoPagoSchema.parse(request.body ?? {});
    const user = request.user as JwtUserPayload | undefined;
    return reversarPagoCredito(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/pagos/:id/soporte', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const file = await request.file();
    if (!file) throw new Error('Debes seleccionar un soporte');
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) throw new Error('Solo se permiten PDF, JPG o PNG');
    const user = request.user as JwtUserPayload | undefined;
    return uploadCreditoPagoSoporte(params.id, {
      fileName: file.filename,
      mimeType: file.mimetype,
      content: await file.toBuffer(),
      usuarioId: user?.sub ? Number(user.sub) : null
    });
  });

  app.get('/pagos/:id/soporte', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const file = await getCreditoPagoSoporteArchivo(params.id);
    return reply
      .header('Content-Type', file.mime_type)
      .header('Content-Disposition', `inline; filename="${file.nombre_archivo}"`)
      .send(file.contenido);
  });

  app.patch('/etapas/:id', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = etapaUpdateSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return updateCreditoEtapa(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.patch('/documentos/:id', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = documentoUpdateSchema.parse(request.body);
    const user = request.user as JwtUserPayload | undefined;
    return updateCreditoDocumento(params.id, { ...body, usuarioId: user?.sub ? Number(user.sub) : null });
  });

  app.post('/documentos/:id/archivo', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const file = await request.file();
    if (!file) throw new Error('Debes seleccionar un archivo');
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) throw new Error('Solo se permiten PDF, JPG o PNG');
    const user = request.user as JwtUserPayload | undefined;
    return uploadCreditoDocumento(params.id, {
      fileName: file.filename,
      mimeType: file.mimetype,
      content: await file.toBuffer(),
      usuarioId: user?.sub ? Number(user.sub) : null
    });
  });

  app.get('/documentos/:id/archivo', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const file = await getCreditoDocumentoArchivo(params.id);
    return reply
      .header('Content-Type', file.mime_type)
      .header('Content-Disposition', `inline; filename="${file.nombre_archivo}"`)
      .send(file.contenido);
  });
}


