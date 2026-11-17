import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import * as svc from './utilitarios.service.js';

function requirePermission(permission: 'utilitarios:read' | 'utilitarios:config') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(permission)) {
      return reply.code(403).send({ message: 'Tu rol no tiene permiso para esta acción de Utilitarios' });
    }
  };
}

const key = z.object({ key: z.string().regex(/^[a-z-]{2,40}$/) });
const keyId = key.extend({ id: z.coerce.number().int().positive() });
const cuerpo = z.object({ valores: z.record(z.string(), z.union([z.string(), z.number(), z.null()])), padreId: z.number().int().positive().nullish() });

export async function utilitariosRoutes(app: FastifyInstance) {
  // Awaited so the "activo" columns exist before any combo query filters by them.
  await svc.ensureUtilitarios().catch((err) => app.log.error(err, 'No se pudo preparar Utilitarios'));
  const read = { preHandler: [app.authenticate, requirePermission('utilitarios:read')] };
  const config = { preHandler: [app.authenticate, requirePermission('utilitarios:config')] };

  app.get('/catalogos', read, async () => svc.listarCatalogos());
  app.get('/catalogos/:key', read, async (req) => {
    const f = z.object({ q: z.string().max(100).optional(), padre: z.coerce.number().int().positive().optional(), limite: z.coerce.number().int().optional() }).parse(req.query);
    return svc.listarOpciones(key.parse(req.params).key, f);
  });
  app.post('/catalogos/:key', config, async (req) => svc.crearOpcion(key.parse(req.params).key, cuerpo.parse(req.body)));
  app.put('/catalogos/:key/:id', config, async (req) => {
    const p = keyId.parse(req.params);
    return svc.editarOpcion(p.key, p.id, cuerpo.parse(req.body));
  });
  app.patch('/catalogos/:key/:id/activo', config, async (req) => {
    const p = keyId.parse(req.params);
    return svc.cambiarActivo(p.key, p.id, z.object({ activo: z.boolean() }).parse(req.body).activo);
  });
}
