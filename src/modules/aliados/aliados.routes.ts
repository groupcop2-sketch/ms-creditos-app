import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import { createAliado, listAliados, listAliadosCatalogs } from './aliados.service.js';

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

const aliadoSchema = z.object({
  identificacion: z.string().min(1),
  primerNombre: z.string().min(1),
  segundoNombre: z.string().trim().nullable().optional(),
  primerApellido: z.string().min(1),
  segundoApellido: z.string().trim().nullable().optional(),
  telefono: z.string().min(1),
  correo: z.string().email(),
  fechaNacimiento: z.string().trim().nullable().optional(),
  logoUrl: z.string().trim().nullable().optional(),
  idTipoIdentificacion: z.coerce.number().int().positive(),
  direccion: direccionSchema.nullable().optional(),
  idBanco: z.coerce.number().int().positive().nullable().optional(),
  idTipoCuenta: z.coerce.number().int().positive().nullable().optional(),
  numeroCuenta: z.string().trim().nullable().optional(),
  representante: z.object({
    idTipoIdentificacion: z.coerce.number().int().positive().nullable().optional(),
    identificacion: z.string().trim().nullable().optional(),
    primerNombre: z.string().trim().nullable().optional(),
    segundoNombre: z.string().trim().nullable().optional(),
    primerApellido: z.string().trim().nullable().optional(),
    segundoApellido: z.string().trim().nullable().optional(),
    genero: z.string().trim().nullable().optional(),
    telefono: z.string().trim().nullable().optional(),
    correo: z.string().email().nullable().optional().or(z.literal('')),
    idCiudad: z.coerce.number().int().positive().nullable().optional()
  }).nullable().optional(),
  camara: z.object({
    numero: z.string().trim().nullable().optional(),
    libro: z.string().trim().nullable().optional(),
    idCiudad: z.coerce.number().int().positive().nullable().optional(),
    rees: z.string().trim().nullable().optional(),
    runeol: z.string().trim().nullable().optional()
  }).nullable().optional(),
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

export async function aliadosRoutes(app: FastifyInstance) {
  app.get('/catalogos', { preHandler: [app.authenticate] }, async () =>
    listAliadosCatalogs()
  );

  app.get('/', { preHandler: [app.authenticate, requirePermission('aliados:read')] }, async () =>
    listAliados()
  );

  app.post('/', { preHandler: [app.authenticate, requirePermission('aliados:create')] }, async (request) => {
    const body = aliadoSchema.parse(request.body);
    return createAliado(body);
  });
}
