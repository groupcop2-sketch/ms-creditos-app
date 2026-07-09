import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import {
  createComercial,
  createLibranzera,
  listComerciales,
  listComercialesCatalogs,
  listLibranzeras,
  updateComercial,
  updateComercialEstado
} from './comerciales.service.js';

const contactoSchema = z.object({
  idTipoIdentificacion: z.coerce.number().int().positive().nullable().optional(),
  identificacion: z.string().trim().nullable().optional(),
  nombre: z.string().trim().nullable().optional(),
  genero: z.string().trim().nullable().optional(),
  idCiudad: z.coerce.number().int().positive().nullable().optional(),
  telefono: z.string().trim().nullable().optional(),
  correo: z.string().email().nullable().optional().or(z.literal(''))
});

const libranzeraSchema = z.object({
  nit: z.string().min(1),
  razonSocial: z.string().min(1),
  domicilio: z.string().trim().nullable().optional(),
  sitioWeb: z.string().trim().nullable().optional(),
  correo: z.string().email().nullable().optional().or(z.literal('')),
  telefono: z.string().trim().nullable().optional(),
  telefonoCallcenter: z.string().trim().nullable().optional(),
  camaraNumero: z.string().trim().nullable().optional(),
  camaraLibro: z.string().trim().nullable().optional(),
  camaraIdCiudad: z.coerce.number().int().positive().nullable().optional(),
  fechaConstitucion: z.string().trim().nullable().optional(),
  ciiu: z.string().trim().nullable().optional(),
  runeol: z.string().trim().nullable().optional(),
  representanteLegal: contactoSchema.nullable().optional(),
  representanteCartera: contactoSchema.nullable().optional(),
  idBanco: z.coerce.number().int().positive().nullable().optional(),
  idTipoCuenta: z.coerce.number().int().positive().nullable().optional(),
  numeroCuenta: z.string().trim().nullable().optional(),
  idEstado: z.coerce.number().int().positive().nullable().optional()
});

const comercialSchema = z.object({
  idLibranzera: z.coerce.number().int().positive(),
  identificacion: z.string().min(1),
  primerNombre: z.string().min(1),
  segundoNombre: z.string().trim().nullable().optional(),
  primerApellido: z.string().min(1),
  segundoApellido: z.string().trim().nullable().optional(),
  fechaNacimiento: z.string().trim().nullable().optional(),
  telefono: z.string().min(1),
  correo: z.string().email(),
  codigoVendedor: z.string().min(1),
  idTipoIdentificacion: z.coerce.number().int().positive(),
  idRolVendedor: z.coerce.number().int().positive().nullable().optional(),
  idFormulaComercial: z.coerce.number().int().positive().nullable().optional(),
  tipoComision: z.enum(['PORCENTAJE', 'VALOR_FIJO']).nullable().optional(),
  valorComision: z.coerce.number().nonnegative().nullable().optional(),
  domicilio: z.string().trim().nullable().optional(),
  idCiudad: z.coerce.number().int().positive().nullable().optional(),
  idBanco: z.coerce.number().int().positive().nullable().optional(),
  idTipoCuenta: z.coerce.number().int().positive().nullable().optional(),
  numeroCuenta: z.string().trim().nullable().optional(),
  idEstado: z.coerce.number().int().positive().nullable().optional()
});

const estadoComercialSchema = z.object({
  activo: z.boolean()
});

function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(permission)) {
      return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
    }
  };
}

export async function comercialesRoutes(app: FastifyInstance) {
  app.get('/catalogos', { preHandler: [app.authenticate] }, async () =>
    listComercialesCatalogs()
  );

  app.get('/libranzeras', { preHandler: [app.authenticate, requirePermission('libranzeras:read')] }, async () =>
    listLibranzeras()
  );

  app.post('/libranzeras', { preHandler: [app.authenticate, requirePermission('libranzeras:create')] }, async (request) => {
    const body = libranzeraSchema.parse(request.body);
    return createLibranzera(body);
  });

  app.get('/vendedores', { preHandler: [app.authenticate, requirePermission('comerciales:read')] }, async () =>
    listComerciales()
  );

  app.post('/vendedores', { preHandler: [app.authenticate, requirePermission('comerciales:create')] }, async (request) => {
    const body = comercialSchema.parse(request.body);
    return createComercial(body);
  });

  app.patch('/vendedores/:id', { preHandler: [app.authenticate, requirePermission('comerciales:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = comercialSchema.parse(request.body);
    return updateComercial(params.id, body);
  });

  app.patch('/vendedores/:id/estado', { preHandler: [app.authenticate, requirePermission('comerciales:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = estadoComercialSchema.parse(request.body);
    return updateComercialEstado(params.id, body.activo);
  });
}
