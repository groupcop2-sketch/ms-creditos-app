import { z } from 'zod';
import { libranzaWorkflowService, WORKFLOW_PASOS_DEF } from './libranza-workflow.service.js';
import { SecurityError } from '../security/security.service.js';
const paso2Schema = z.object({
    salarioBruto: z.coerce.number().positive().optional(),
    descuentosLey: z.coerce.number().nonnegative().optional(),
    otrosDescuentos: z.coerce.number().nonnegative().optional(),
    tasaEA: z.coerce.number().nonnegative().optional()
});
const paso6Schema = z.object({
    radicadoNumero: z.string().trim().optional(),
    contactoPagaduria: z.string().trim().optional(),
    correoPagaduria: z.string().trim().email().optional(),
    observacion: z.string().trim().optional()
});
const paso7Schema = z.object({
    montoDesembolso: z.coerce.number().positive().optional(),
    bancoDestino: z.string().trim().optional(),
    numeroCuenta: z.string().trim().optional()
});
const paso8y9Schema = z.object({
    totalRecaudado: z.coerce.number().positive(),
    capital: z.coerce.number().positive(),
    interes: z.coerce.number().nonnegative().default(0),
    seguro: z.coerce.number().nonnegative().default(0),
    referenciaNomina: z.string().trim().optional(),
    fechaRecaudo: z.string().optional()
});
export async function libranzaWorkflowRoutes(app) {
    // 1. Arquitectura y definición del flujo de 10 pasos
    app.get('/arquitectura', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Obtener definición de los 5 actores y 10 pasos de la arquitectura de libranza'
        }
    }, async (_req, reply) => {
        return reply.send({
            success: true,
            descripcion: 'Flujo completo de ciclo de vida de crédito de libranza e integración contable NIIF',
            actores: [
                { id: 'Cliente', descripcion: 'Solicitante y deudor del crédito' },
                { id: 'Financiera', descripcion: 'Entidad financiera otorgante y orquestadora' },
                { id: 'Motor Crediticio', descripcion: 'Motor de validación de identidad, capacidad Ley 1527 y políticas' },
                { id: 'Empleador / Entidad Pagadora', descripcion: 'Empresa o pagaduría que retiene y gira por nómina' },
                { id: 'Contabilidad', descripcion: 'Núcleo contable NIIF y motor de eventos de doble partida' }
            ],
            pasos: WORKFLOW_PASOS_DEF
        });
    });
    // 2. Consultar el estado del flujo de 10 pasos para un crédito
    app.get('/:creditoId/estado', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Consultar avance y trazabilidad de los 10 pasos para un crédito'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.creditoId);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const estado = await libranzaWorkflowService.getWorkflowEstado(creditoId);
        return reply.send({ success: true, data: estado });
    });
    // 3. Paso 2: Valida identidad, capacidad (Ley 1527) y política (Financiera -> Motor Crediticio)
    app.post('/:creditoId/paso-2-validar-motor', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Paso 2: Validar capacidad (Ley 1527 de 2012) e identidad con el Motor Crediticio'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.creditoId);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const body = paso2Schema.parse(req.body || {});
        const usuarioId = req.user?.id_usuario;
        const res = await libranzaWorkflowService.ejecutarPaso2ValidacionMotor(creditoId, {
            ...body,
            usuarioId
        });
        return reply.send({
            success: true,
            message: 'Validación del motor crediticio y Ley 1527 procesada.',
            data: res
        });
    });
    // 4. Paso 6: Notificar libranza y cuota (Financiera -> Empleador / Entidad Pagadora)
    app.post('/:creditoId/paso-6-notificar-pagaduria', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Paso 6: Notificar formalmente la libranza y cuota al Empleador / Pagaduría'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.creditoId);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const body = paso6Schema.parse(req.body || {});
        const usuarioId = req.user?.id_usuario;
        const res = await libranzaWorkflowService.ejecutarPaso6NotificarPagaduria(creditoId, {
            ...body,
            usuarioId
        });
        return reply.send({
            success: true,
            message: 'Libranza y cuota notificada y radicada ante la entidad pagadora.',
            data: res
        });
    });
    // 5. Paso 7: Registra desembolso en Contabilidad (Financiera -> Contabilidad)
    app.post('/:creditoId/paso-7-desembolso-contable', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Paso 7: Desembolsar y registrar en Contabilidad NIIF (LIBRANZA_DESEMBOLSO)'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.creditoId);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const body = paso7Schema.parse(req.body || {});
        const usuarioId = req.user?.id_usuario;
        const res = await libranzaWorkflowService.ejecutarPaso7DesembolsoContable(creditoId, {
            ...body,
            usuarioId
        });
        return reply.send({
            success: true,
            message: 'Desembolso, cartera e intereses por devengar registrados en contabilidad NIIF.',
            data: res
        });
    });
    // 6. Pasos 8 y 9: Giro de nómina y aplicación de pago contable (Empleador -> Financiera -> Contabilidad)
    app.post('/:creditoId/paso-8-9-recaudo-nomina', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Pasos 8 y 9: Recibir giro de nómina y aplicar en Contabilidad NIIF (LIBRANZA_RECAUDO)'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.creditoId);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const body = paso8y9Schema.parse(req.body);
        const usuarioId = req.user?.id_usuario;
        const res = await libranzaWorkflowService.ejecutarPaso8y9RecaudoNomina(creditoId, {
            ...body,
            usuarioId
        });
        return reply.send({
            success: true,
            message: 'Giro de nómina recibido y aplicado a capital, intereses y seguros en Contabilidad NIIF.',
            data: res
        });
    });
    // 7. Paso 10: Actualizar saldo y consultar estado de cuenta (Financiera -> Cliente)
    app.get('/:creditoId/estado-cuenta', {
        schema: {
            tags: ['Libranza Workflow'],
            summary: 'Paso 10: Consultar estado de cuenta actualizado con trazabilidad contable NIIF'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.creditoId);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const estadoCuenta = await libranzaWorkflowService.getEstadoCuentaCliente(creditoId);
        return reply.send({ success: true, data: estadoCuenta });
    });
}
