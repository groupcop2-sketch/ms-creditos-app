import { z } from 'zod';
import { iniciarVerificacionJumio, obtenerEstadoVerificacionJumio, procesarJumioWebhook, simularCompletarVerificacion } from './jumio.service.js';
async function authenticatePortal(request, reply) {
    try {
        await request.jwtVerify();
        const user = request.user;
        if (!user?.portal || !user.clienteId) {
            return reply.code(401).send({ message: 'No autorizado' });
        }
    }
    catch {
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
export async function jumioRoutes(app) {
    // Iniciar verificación biométrica Jumio para un crédito
    app.post('/iniciar', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        const body = iniciarSchema.parse(request.body);
        return iniciarVerificacionJumio(body.creditoId, user.clienteId);
    });
    // Consultar estado de verificación biométrica de un crédito
    app.get('/estado/:creditoId', { preHandler: [authenticatePortal] }, async (request) => {
        const params = z.object({ creditoId: z.coerce.number().int().positive() }).parse(request.params);
        return obtenerEstadoVerificacionJumio(params.creditoId);
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
