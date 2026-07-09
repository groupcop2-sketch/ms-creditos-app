import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import { createInversion, createSocio, listInversiones, listSocios, listSociosCatalogs } from './socios.service.js';

const direccionSchema = z.object({
  idTipoVia: z.coerce.number().int().positive(),
  numPrincipal: z.coerce.number().int().positive().nullable().optional(),
  idLetraPrincipal: z.coerce.number().int().positive().nullable().optional(),
  bis: z.string().trim().nullable().optional(),
  letraBis: z.coerce.number().int().positive().nullable().optional(),
  cuadrantePrincipal: z.string().trim().nullable().optional(),
  numSecundario: z.coerce.number().int().positive().nullable().optional(),
  idLetraSecundaria: z.coerce.number().int().positive().nullable().optional(),
  cuadranteSecundario: z.string().trim().nullable().optional(),
  complemento: z.string().trim().nullable().optional(),
  barrio: z.string().trim().nullable().optional(),
  idCiudad: z.coerce.number().int().positive(),
  esPrincipal: z.boolean().nullable().optional()
});

const socioSchema = z.object({
  identificacion: z.string().min(1),
  primerNombre: z.string().min(1),
  segundoNombre: z.string().trim().nullable().optional(),
  primerApellido: z.string().min(1),
  segundoApellido: z.string().trim().nullable().optional(),
  telefono: z.string().min(1),
  correo: z.string().email(),
  direccion: direccionSchema.nullable().optional(),
  idCiudad: z.coerce.number().int().positive().nullable().optional(),
  idTipoIdentificacion: z.coerce.number().int().positive(),
  fechaNacimiento: z.string().trim().nullable().optional(),
  idBanco: z.coerce.number().int().positive().nullable().optional(),
  idTipoCuenta: z.coerce.number().int().positive().nullable().optional(),
  numeroCuenta: z.string().trim().nullable().optional(),
  idEstado: z.coerce.number().int().positive().nullable().optional()
});

const inversionSchema = z.object({
  monto: z.coerce.number().positive(),
  fechaInversion: z.string().min(1),
  plazo: z.coerce.number().int().positive(),
  idTasaInversion: z.coerce.number().int().positive(),
  idEstado: z.coerce.number().int().positive().nullable().optional()
});

function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(permission)) {
      return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
    }
  };
}

export async function sociosRoutes(app: FastifyInstance) {
  app.get('/catalogos', { preHandler: [app.authenticate] }, async () =>
    listSociosCatalogs()
  );

  app.get('/', { preHandler: [app.authenticate, requirePermission('socios:read')] }, async () =>
    listSocios()
  );

  app.post('/', { preHandler: [app.authenticate, requirePermission('socios:create')] }, async (request) => {
    const body = socioSchema.parse(request.body);
    return createSocio(body);
  });

  app.get('/inversiones', { preHandler: [app.authenticate, requirePermission('socios:investments:read')] }, async () =>
    listInversiones()
  );

  app.get('/:id/inversiones', { preHandler: [app.authenticate, requirePermission('socios:investments:read')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return listInversiones(params.id);
  });

  app.post('/:id/inversiones', { preHandler: [app.authenticate, requirePermission('socios:investments:create')] }, async (request) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = inversionSchema.parse(request.body);
    return createInversion(params.id, body);
  });
}
