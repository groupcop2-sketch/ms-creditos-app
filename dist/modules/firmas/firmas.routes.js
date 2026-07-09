import { z } from 'zod';
import { env } from '../../config/env.js';
import { crearFirma, getPdfFirmado, listFirmasCredito, marcarFirmaSimulada, procesarWebhookZapSign } from './firmas.service.js';
const firmaSchema = z.object({
    creditoId: z.coerce.number().int().positive(),
    documentoGeneradoId: z.coerce.number().int().positive(),
    firmanteNombre: z.string().trim().min(2),
    firmanteCorreo: z.string().trim().nullable().optional(),
    firmanteTelefono: z.string().trim().nullable().optional()
});
function requirePermission(permission) {
    return async (request, reply) => {
        const user = request.user;
        if (!user?.permissions?.includes(permission)) {
            return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
        }
    };
}
export async function firmasRoutes(app) {
    app.post('/webhooks/zapsign', async (request, reply) => {
        const query = z.object({ secret: z.string().optional() }).parse(request.query);
        const headerSecret = request.headers['x-zapsign-secret'];
        const receivedSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
        if (env.ZAPSIGN_WEBHOOK_SECRET && query.secret !== env.ZAPSIGN_WEBHOOK_SECRET && receivedSecret !== env.ZAPSIGN_WEBHOOK_SECRET) {
            return reply.code(401).send({ message: 'Webhook no autorizado' });
        }
        const payload = z.record(z.string(), z.unknown()).parse(request.body ?? {});
        const firma = await procesarWebhookZapSign(payload);
        return { received: true, firma };
    });
    app.get('/creditos/:id', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return listFirmasCredito(params.id);
    });
    app.post('/', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
        const body = firmaSchema.parse(request.body);
        const user = request.user;
        return crearFirma({ ...body, usuarioId: user?.sub ? Number(user.sub) : null });
    });
    app.patch('/:id/estado', { preHandler: [app.authenticate, requirePermission('creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = z.object({ estado: z.enum(['PENDIENTE', 'ENVIADO', 'FIRMADO', 'RECHAZADO', 'CANCELADO', 'ERROR']) }).parse(request.body);
        return marcarFirmaSimulada(params.id, body.estado);
    });
    app.get('/:id/pdf-firmado', { preHandler: [app.authenticate, requirePermission('creditos:read')] }, async (request, reply) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const file = await getPdfFirmado(params.id);
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `inline; filename="${file.fileName}"`)
            .send(file.content);
    });
}
