import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  iniciarVerificacionJumio,
  obtenerEstadoVerificacionJumio,
  procesarJumioWebhook,
  simularCompletarVerificacion,
  obtenerConfiguracionJumio,
  guardarDocumentosManuales
} from './jumio.service.js';

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

const iniciarSchema = z.object({
  creditoId: z.coerce.number().int().positive()
});

const simularSchema = z.object({
  creditoId: z.coerce.number().int().positive(),
  decision: z.enum(['PASSED', 'REJECTED']).default('PASSED')
});

const cargarDocumentosSchema = z.object({
  creditoId: z.coerce.number().int().positive(),
  documentoFrente: z.string().min(1, 'La imagen frontal del documento es requerida'),
  documentoReverso: z.string().optional().nullable(),
  fotoRostro: z.string().min(1, 'La fotografía del rostro es requerida'),
  tipoDocumento: z.string().optional().nullable(),
  numeroDocumento: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable()
});

export async function jumioRoutes(app: FastifyInstance) {
  // Consultar configuración disponible de biometría (Jumio vs Carga Manual)
  app.get('/config', async () => {
    return obtenerConfiguracionJumio();
  });

  // Iniciar verificación biométrica Jumio para un crédito
  app.post('/iniciar', { preHandler: [authenticatePortal] }, async (request) => {
    const user = request.user as unknown as PortalJwtPayload;
    const body = iniciarSchema.parse(request.body);
    return iniciarVerificacionJumio(body.creditoId, user.clienteId);
  });

  // Consultar estado de verificación biométrica de un crédito
  app.get('/estado/:creditoId', { preHandler: [authenticatePortal] }, async (request) => {
    const params = z.object({ creditoId: z.coerce.number().int().positive() }).parse(request.params);
    return obtenerEstadoVerificacionJumio(params.creditoId);
  });

  // Carga manual de documento de identidad y foto del rostro (alternativa directa sin Jumio)
  app.post('/cargar-documentos', { preHandler: [authenticatePortal] }, async (request) => {
    const user = request.user as unknown as PortalJwtPayload;
    const body = cargarDocumentosSchema.parse(request.body);
    return guardarDocumentosManuales({
      ...body,
      clienteId: user.clienteId
    });
  });

  // Webhook oficial de Jumio (público / autenticado vía header)
  app.post('/callback', async (request, reply) => {
    const payload = request.body ?? {};
    const resultado = await procesarJumioWebhook(payload);
    return { received: true, ...resultado };
  });

  // Endpoint de prueba / simulación para QA y demostración
  app.post('/simular-resultado', { preHandler: [authenticatePortal] }, async (request) => {
    const body = simularSchema.parse(request.body);
    return simularCompletarVerificacion(body.creditoId, body.decision);
  });
}

