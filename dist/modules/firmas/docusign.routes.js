import { z } from 'zod';
import { env } from '../../config/env.js';
import { crearSobreCredito, getCombinedSignedPdf, getDocumentoPdf, getSobreDetalle, listarSobres, procesarDocuSignWebhook, transicionarEstadoSobre } from './docusign.service.js';
function requirePermission(permission) {
    return async (request, reply) => {
        const user = request.user;
        if (!user?.permissions?.includes(permission)) {
            return reply.code(403).send({ message: 'No tienes permisos para realizar esta acción' });
        }
    };
}
const crearSobreSchema = z.object({
    creditoId: z.coerce.number().int().positive(),
    firmanteNombre: z.string().trim().min(2),
    firmanteCorreo: z.string().trim().email(),
    firmanteTelefono: z.string().trim().nullable().optional(),
    firmanteIdentificacion: z.string().trim().nullable().optional(),
    asunto: z.string().trim().optional(),
    mensaje: z.string().trim().optional(),
    documentosTipos: z.array(z.enum(['PAGARE', 'CONTRATO', 'CARTA_INSTRUCCIONES', 'AUTORIZACION_DESCUENTO', 'SEGURO_VIDA'])).optional()
});
const transitionSchema = z.object({
    nuevoEstado: z.enum(['DRAFT', 'SENT', 'DELIVERED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED']),
    accion: z.string().optional(),
    actor: z.string().optional(),
    motivo: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional()
});
export async function docusignRoutes(app) {
    // Webhook for DocuSign Connect (Public / Authenticated via Secret/HMAC)
    app.post('/webhooks', async (request, reply) => {
        const query = z.object({ secret: z.string().optional() }).parse(request.query);
        const headerSecret = request.headers['x-docusign-secret'] || request.headers['x-docusign-signature-1'];
        const receivedSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
        if (env.DOCUSIGN_WEBHOOK_SECRET && query.secret && query.secret !== env.DOCUSIGN_WEBHOOK_SECRET) {
            if (receivedSecret !== env.DOCUSIGN_WEBHOOK_SECRET) {
                return reply.code(401).send({ message: 'Webhook DocuSign no autorizado' });
            }
        }
        const payload = z.record(z.string(), z.unknown()).parse(request.body ?? {});
        const resultado = await procesarDocuSignWebhook(payload);
        return { received: true, envelope: resultado };
    });
    // Public/Protected configuration status
    app.get('/config', async () => {
        return {
            simulationMode: env.DOCUSIGN_SIMULATION_MODE || !env.DOCUSIGN_ACCOUNT_ID,
            accountIdConfigured: Boolean(env.DOCUSIGN_ACCOUNT_ID),
            clientIdConfigured: Boolean(env.DOCUSIGN_CLIENT_ID),
            authServer: env.DOCUSIGN_AUTH_SERVER,
            basePath: env.DOCUSIGN_BASE_PATH,
            webhookConfigured: Boolean(env.DOCUSIGN_WEBHOOK_SECRET),
            documentosSoportados: ['PAGARE', 'CONTRATO', 'CARTA_INSTRUCCIONES'],
            estadosMaquina: ['DRAFT', 'SENT', 'DELIVERED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED']
        };
    });
    // List all envelopes (with filters)
    app.get('/envelopes', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
        const query = z.object({
            creditoId: z.coerce.number().int().positive().optional(),
            estado: z.string().optional()
        }).parse(request.query);
        return listarSobres(query);
    });
    // Get Envelope Detail with documents and State Machine event log
    app.get('/envelopes/:envelopeId', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
        const params = z.object({ envelopeId: z.string() }).parse(request.params);
        return getSobreDetalle(params.envelopeId);
    });
    // Create & Send new Envelope for a credit (Pagaré + Contrato)
    app.post('/envelopes', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
        const body = crearSobreSchema.parse(request.body);
        const user = request.user;
        return crearSobreCredito({
            ...body,
            usuarioId: user?.sub ? Number(user.sub) : null
        });
    });
    // Manual or Simulated State Machine Transition
    app.post('/envelopes/:envelopeId/transition', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
        const params = z.object({ envelopeId: z.string() }).parse(request.params);
        const body = transitionSchema.parse(request.body);
        const user = request.user;
        return transicionarEstadoSobre({
            envelopeId: params.envelopeId,
            nuevoEstado: body.nuevoEstado,
            accion: body.accion || `CAMBIO_ESTADO_${body.nuevoEstado}`,
            actor: body.actor || user?.username || 'USUARIO_PORTAL',
            motivo: body.motivo,
            payload: body.payload
        });
    });
    // Simulation Action Helper (Convenient UI triggers)
    app.post('/envelopes/:envelopeId/simulate-action', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
        const params = z.object({ envelopeId: z.string() }).parse(request.params);
        const body = z.object({
            action: z.enum(['OPEN', 'SIGN', 'DECLINE', 'VOID']),
            motivo: z.string().optional()
        }).parse(request.body);
        const actionMap = {
            OPEN: { estado: 'DELIVERED', accion: 'SIMULAR_APERTURA_CLIENTE', actor: 'SIMULADOR_CLIENTE' },
            SIGN: { estado: 'COMPLETED', accion: 'SIMULAR_FIRMA_CLIENTE', actor: 'SIMULADOR_CLIENTE' },
            DECLINE: { estado: 'DECLINED', accion: 'SIMULAR_RECHAZO_CLIENTE', actor: 'SIMULADOR_CLIENTE' },
            VOID: { estado: 'VOIDED', accion: 'SIMULAR_ANULACION_ADMIN', actor: 'ADMINISTRADOR' }
        };
        const target = actionMap[body.action];
        return transicionarEstadoSobre({
            envelopeId: params.envelopeId,
            nuevoEstado: target.estado,
            accion: target.accion,
            actor: target.actor,
            motivo: body.motivo || (body.action === 'DECLINE' ? 'Rechazado por desacuerdo en condiciones' : undefined)
        });
    });
    // View individual document PDF
    app.get('/envelopes/:envelopeId/docs/:docId/pdf', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request, reply) => {
        const params = z.object({
            envelopeId: z.string(),
            docId: z.coerce.number().int().positive()
        }).parse(request.params);
        const file = await getDocumentoPdf(params.envelopeId, params.docId);
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `inline; filename="${file.fileName}"`)
            .send(file.content);
    });
    // Download combined signed PDF
    app.get('/envelopes/:envelopeId/combined-pdf', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request, reply) => {
        const params = z.object({ envelopeId: z.string() }).parse(request.params);
        const file = await getCombinedSignedPdf(params.envelopeId);
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
            .send(file.content);
    });
}
