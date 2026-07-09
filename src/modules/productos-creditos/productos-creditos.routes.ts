import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import {
  createProductoAtributo,
  createProductoCredito,
  createProductoDocumento,
  createProductoEtapa,
  listProductoAtributos,
  listProductoDocumentos,
  listProductoEtapas,
  listProductosCredito,
  listProductosCreditoCatalogs,
  updateProductoEtapa
} from './productos-creditos.service.js';

const productoSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().trim().nullable().optional(),
  idTipoCredito: z.coerce.number().int().positive(),
  tipoTasa: z.enum(['FIJA', 'DIFERENCIAL', 'VARIABLE']).nullable().optional(),
  idLibranzera: z.coerce.number().int().positive().nullable().optional(),
  montoMinimo: z.coerce.number().nonnegative().nullable().optional(),
  montoMaximo: z.coerce.number().nonnegative().nullable().optional(),
  salarioMinimo: z.coerce.number().nonnegative().nullable().optional(),
  salarioMaximo: z.coerce.number().nonnegative().nullable().optional(),
  plazoMinimo: z.coerce.number().int().positive().nullable().optional(),
  plazoMaximo: z.coerce.number().int().positive().nullable().optional(),
  modeloPlazo: z.string().trim().nullable().optional(),
  permiteCreditoMultiple: z.boolean().nullable().optional(),
  interesAjustable: z.boolean().nullable().optional(),
  permiteRefinanciacion: z.boolean().nullable().optional(),
  permiteRetanqueo: z.boolean().nullable().optional(),
  requiereCodeudor: z.boolean().nullable().optional(),
  numeroCodeudores: z.coerce.number().int().nonnegative().nullable().optional(),
  formatoCredito: z.string().trim().nullable().optional(),
  formatoRequisitos: z.string().trim().nullable().optional(),
  formatoCodeudores: z.string().trim().nullable().optional(),
  proveedorFirma: z.string().trim().nullable().optional(),
  periodoGracia: z.coerce.number().int().nonnegative().nullable().optional(),
  periodicidad: z.enum(['MENSUAL', 'QUINCENAL']).nullable().optional(),
  diaCorte: z.coerce.number().int().min(1).max(31).nullable().optional(),
  diaPagoOportuno: z.coerce.number().int().min(1).max(31).nullable().optional(),
  ajustarFinSemana: z.boolean().nullable().optional(),
  moraDespuesVencimiento: z.coerce.number().int().min(0).nullable().optional(),
  tasaMoraMensual: z.coerce.number().min(0).nullable().optional(),
  primeraCuotaMesSiguiente: z.boolean().nullable().optional(),
  observacionCalendario: z.string().trim().nullable().optional(),
  idEstado: z.coerce.number().int().positive().nullable().optional()
});

const atributoSchema = z.object({
  idTipoAtributo: z.coerce.number().int().positive(),
  idTipoCalculo: z.coerce.number().int().positive(),
  nombre: z.string().min(1),
  valor: z.coerce.number().nullable().optional(),
  porcentaje: z.coerce.number().nullable().optional(),
  minimo: z.coerce.number().nullable().optional(),
  maximo: z.coerce.number().nullable().optional(),
  aplicaIva: z.boolean().nullable().optional(),
  obligatorio: z.boolean().nullable().optional(),
  proveedor: z.string().trim().nullable().optional(),
  prioridad: z.coerce.number().int().positive().nullable().optional()
});

const documentoSchema = z.object({
  idDocumentoCredito: z.coerce.number().int().positive(),
  obligatorio: z.boolean().nullable().optional(),
  grupo: z.string().trim().nullable().optional(),
  prioridad: z.coerce.number().int().positive().nullable().optional(),
  aplicaA: z.string().trim().nullable().optional(),
  requiereFirma: z.boolean().nullable().optional(),
  requiereValidacion: z.boolean().nullable().optional()
});

const etapaSchema = z.object({
  idEtapaCredito: z.coerce.number().int().positive(),
  orden: z.coerce.number().int().positive(),
  obligatoria: z.boolean().nullable().optional(),
  permiteDevolucion: z.boolean().nullable().optional(),
  responsable: z.string().trim().nullable().optional(),
  slaHoras: z.coerce.number().int().positive().nullable().optional()
});

function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(permission)) {
      return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
    }
  };
}

export async function productosCreditosRoutes(app: FastifyInstance) {
  app.get('/catalogos', { preHandler: [app.authenticate] }, async () => listProductosCreditoCatalogs());

  app.get('/', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async () =>
    listProductosCredito()
  );

  app.post('/', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
    const body = productoSchema.parse(request.body);
    return createProductoCredito(body);
  });

  app.get('/:id/atributos', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listProductoAtributos(params.id);
  });

  app.post('/:id/atributos', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = atributoSchema.parse(request.body);
    return createProductoAtributo(params.id, body);
  });

  app.get('/:id/documentos', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listProductoDocumentos(params.id);
  });

  app.post('/:id/documentos', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = documentoSchema.parse(request.body);
    return createProductoDocumento(params.id, body);
  });

  app.get('/:id/etapas', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listProductoEtapas(params.id);
  });

  app.post('/:id/etapas', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = etapaSchema.parse(request.body);
    return createProductoEtapa(params.id, body);
  });

  app.put('/:id/etapas/:etapaId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      etapaId: z.coerce.number().int().positive()
    }).parse(request.params);
    const body = etapaSchema.parse(request.body);
    return updateProductoEtapa(params.id, params.etapaId, body);
  });
}
