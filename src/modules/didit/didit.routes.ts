import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  crearSesionDidit,
  procesarDiditWebhook,
  obtenerEstadoDidit
} from './didit.service.js';

type PortalJwtPayload = {
  portal: true;
  clienteId: number;
};

async function authenticatePortal(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const user = request.user as unknown as PortalJwtPayload | undefined;
    if (!user?.portal || !user.clienteId) {
      return reply.code(401).send({ message: 'No autorizado' });
    }
  } catch {
    return reply.code(401).send({ message: 'No autorizado' });
  }
}

const crearSesionSchema = z.object({
  creditoId: z.coerce.number().int().positive(),
  callbackUrl: z.string().url().optional()
});

export async function diditRoutes(app: FastifyInstance) {
  /**
   * 1. POST /session
   * Creates a Didit KYC session server-side.
   * Returns { url, session_id } ONLY (DIDIT_API_KEY never touches the browser).
   */
  app.post('/session', { preHandler: [authenticatePortal] }, async (request, reply) => {
    const user = request.user as unknown as PortalJwtPayload;
    const body = crearSesionSchema.parse(request.body);

    const result = await crearSesionDidit({
      creditoId: body.creditoId,
      clienteId: user.clienteId,
      callbackUrl: body.callbackUrl
    });

    return reply.code(201).send({
      url: result.url,
      session_id: result.session_id
    });
  });

  /**
   * 2. POST /webhook
   * Didit Webhook receiver.
   * Validates X-Signature-V2 HMAC, checks freshness <= 300s, dedupes event_id,
   * updates the credit/verification state, and returns 2xx within 5s.
   */
  const handleWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const sigHeader = (request.headers['x-signature-v2'] as string) || '';
    const payload = request.body as Record<string, unknown>;

    const result = await procesarDiditWebhook(payload, sigHeader);
    return reply.code(result.status).send(result.message);
  };

  app.post('/webhook', handleWebhook);
  app.post('/webhooks/didit', handleWebhook);

  /**
   * 3. GET /estado/:creditoId
   * Returns current Didit verification details and credit state.
   */
  app.get('/estado/:creditoId', { preHandler: [authenticatePortal] }, async (request) => {
    const params = z.object({ creditoId: z.coerce.number().int().positive() }).parse(request.params);
    return obtenerEstadoDidit(params.creditoId);
  });
}
