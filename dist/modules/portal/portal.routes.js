import { z } from 'zod';
import { SecurityError } from '../security/security.service.js';
import { confirmPortalEmail, completePortalLaborProfile, crearSolicitudPortalCredito, getPortalClientById, listPortalCatalogs, listPortalCreditos, listPortalProductosCredito, loginPortalClient, requestPortalPasswordReset, registerPortalClient, resetPortalPassword, simularPortalCredito } from './portal.service.js';
const registerSchema = z.object({
    identificacion: z.string().trim().min(4),
    primerNombre: z.string().trim().min(1),
    segundoNombre: z.string().trim().nullable().optional(),
    primerApellido: z.string().trim().nullable().optional(),
    segundoApellido: z.string().trim().nullable().optional(),
    correo: z.string().trim().email(),
    telefono: z.string().trim().nullable().optional(),
    password: z.string().min(8),
    idTipoIdentificacion: z.coerce.number().int().positive().nullable().optional()
});
const laborProfileSchema = z.object({
    codigoEmpresa: z.string().trim().min(1),
    cargo: z.string().trim().min(1),
    idTipoContrato: z.coerce.number().int().positive(),
    fechaIngreso: z.string().trim().min(1),
    salario: z.coerce.number().positive(),
    neto: z.coerce.number().nonnegative(),
    tieneEmbargos: z.boolean()
});
const loginSchema = z.object({
    identificacion: z.string().trim().min(1),
    password: z.string().min(1)
});
const forgotPasswordSchema = z.object({
    correo: z.string().trim().email()
});
const resetPasswordSchema = z.object({
    token: z.string().trim().min(20),
    password: z.string().min(8)
});
const confirmEmailSchema = z.object({
    token: z.string().trim().min(20)
});
const creditoPortalSchema = z.object({
    idProductoCredito: z.coerce.number().int().positive(),
    montoSolicitado: z.coerce.number().positive(),
    plazo: z.coerce.number().int().positive(),
    codigoVendedor: z.string().trim().nullable().optional()
});
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
export async function portalRoutes(app) {
    app.get('/catalogos', async () => listPortalCatalogs());
    app.post('/registro', async (request) => {
        const body = registerSchema.parse(request.body);
        const response = await registerPortalClient(body);
        const token = app.jwt.sign({ portal: true, clienteId: response.cliente.id });
        return {
            token,
            cliente: response.cliente,
            confirmationToken: response.confirmationToken
        };
    });
    app.post('/login', async (request) => {
        const body = loginSchema.parse(request.body);
        const cliente = await loginPortalClient(body);
        const token = app.jwt.sign({ portal: true, clienteId: cliente.id });
        return { token, cliente };
    });
    app.post('/forgot-password', async (request) => {
        const body = forgotPasswordSchema.parse(request.body);
        return requestPortalPasswordReset(body);
    });
    app.post('/reset-password', async (request) => {
        const body = resetPasswordSchema.parse(request.body);
        return resetPortalPassword(body);
    });
    app.post('/confirm-email', async (request) => {
        const body = confirmEmailSchema.parse(request.body);
        return confirmPortalEmail(body);
    });
    app.get('/me', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        return getPortalClientById(user.clienteId);
    });
    app.put('/perfil-laboral', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        const body = laborProfileSchema.parse(request.body);
        return completePortalLaborProfile(user.clienteId, body);
    });
    app.get('/productos', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        const cliente = await getPortalClientById(user.clienteId);
        if (!cliente.perfilCompleto)
            return [];
        return listPortalProductosCredito();
    });
    app.get('/creditos', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        return listPortalCreditos(user.clienteId);
    });
    app.post('/simular', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        const cliente = await getPortalClientById(user.clienteId);
        if (!cliente.perfilCompleto)
            return replyProfileRequired();
        const body = creditoPortalSchema.parse(request.body);
        return simularPortalCredito(user.clienteId, body);
    });
    app.post('/solicitudes', { preHandler: [authenticatePortal] }, async (request) => {
        const user = request.user;
        const cliente = await getPortalClientById(user.clienteId);
        if (!cliente.perfilCompleto)
            return replyProfileRequired();
        const body = creditoPortalSchema.parse(request.body);
        return crearSolicitudPortalCredito(user.clienteId, body);
    });
}
function replyProfileRequired() {
    throw new SecurityError('Completa tu informacion laboral antes de continuar', 409);
}
