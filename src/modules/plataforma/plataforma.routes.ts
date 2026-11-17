import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtUserPayload } from '../../types/auth.js';
import {
  ensurePlataforma, getBranding, getConfigPlataforma, getLogo, guardarConfigPlataforma, guardarLogo, PERMISO_SUPERADMIN
} from './plataforma.service.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('').transform(() => null));
const url = z.string().trim().url().max(300).nullish().or(z.literal('').transform(() => null));

const configSchema = z.object({
  nombreComercial: z.string().trim().min(2).max(120),
  razonSocial: z.string().trim().max(200).nullish(),
  nit: z.string().trim().max(30).nullish(),
  correoSoporte: z.string().trim().email().max(200).nullish().or(z.literal('').transform(() => null)),
  telefono: z.string().trim().max(40).nullish(),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  colorAcento: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  urlAdmin: url,
  urlPortal: url,
  licencia: z.object({
    plan: z.string().trim().max(60).nullish(),
    inicio: fecha,
    vencimiento: fecha,
    maxUsuarios: z.coerce.number().int().positive().nullish(),
    estado: z.enum(['ACTIVA', 'SUSPENDIDA'])
  })
});

async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as JwtUserPayload | undefined;
  if (!user?.permissions?.includes(PERMISO_SUPERADMIN)) {
    return reply.code(403).send({ message: 'Solo el Super Admin puede configurar la plataforma' });
  }
}

const usuarioId = (request: FastifyRequest) => {
  const sub = (request.user as JwtUserPayload | undefined)?.sub;
  return sub ? Number(sub) : null;
};

export async function plataformaRoutes(app: FastifyInstance) {
  ensurePlataforma().catch((err) => app.log.error(err, 'No se pudo preparar la configuracion de plataforma'));

  // Public: login screens and the client portal read the brand before anyone signs in.
  app.get('/branding', async () => getBranding());

  app.get('/logo', async (_request, reply) => {
    const logo = await getLogo();
    if (!logo) return reply.code(404).send({ message: 'Sin logo' });
    return reply
      .header('Content-Type', logo.mime)
      .header('Cache-Control', 'public, max-age=86400')
      .header('X-Content-Type-Options', 'nosniff')
      .send(logo.contenido);
  });

  app.get('/config', { preHandler: [app.authenticate, requireSuperAdmin] }, async () => getConfigPlataforma());

  app.put('/config', { preHandler: [app.authenticate, requireSuperAdmin] }, async (request) =>
    guardarConfigPlataforma(configSchema.parse(request.body), usuarioId(request)));

  app.put('/logo', { preHandler: [app.authenticate, requireSuperAdmin] }, async (request) => {
    const body = z.object({ archivo: z.object({ mimeType: z.string(), base64: z.string().min(10) }).nullable() }).parse(request.body);
    return guardarLogo(body.archivo, usuarioId(request));
  });
}
