import { z } from 'zod';
import { contabilidadService } from './contabilidad.service.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
const simularCapacidadSchema = z.object({
    gross_income: z.coerce.number().positive(),
    legal_deductions: z.coerce.number().nonnegative(),
    other_payroll_deductions: z.coerce.number().nonnegative().default(0),
    requested_amount: z.coerce.number().positive(),
    requested_term_months: z.coerce.number().int().positive(),
    annual_effective_rate: z.coerce.number().nonnegative().optional().default(0.225)
});
const sincronizarDesembolsoSchema = z.object({
    montoPrincipal: z.coerce.number().positive().optional(),
    montoDesembolsadoNeto: z.coerce.number().positive().optional(),
    comisionOriginacion: z.coerce.number().nonnegative().optional(),
    fechaDesembolso: z.string().optional()
});
const sincronizarRecaudoSchema = z.object({
    referenciaPago: z.string().trim().min(1),
    totalRecaudado: z.coerce.number().positive(),
    capitalAplicado: z.coerce.number().positive(),
    interesAplicado: z.coerce.number().nonnegative().default(0),
    seguroAplicado: z.coerce.number().nonnegative().default(0),
    fechaPago: z.string().optional()
});
export async function contabilidadRoutes(app) {
    // 1. Estado y diagnóstico de conexión con la API de Contabilidad
    app.get('/status', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Consultar estado del motor contable y plantillas activas'
        }
    }, async (_req, reply) => {
        const status = await contabilidadService.getStatus();
        return reply.send({ success: true, data: status });
    });
    // 2. Simulación de capacidad de endeudamiento Ley 1527 (Paso 2)
    app.post('/simular-capacidad', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Evaluar capacidad de endeudamiento según Ley 1527 de 2012 (Límite 50%)'
        }
    }, async (req, reply) => {
        const body = simularCapacidadSchema.parse(req.body);
        const result = await contabilidadService.validarCapacidadLey1527(body);
        return reply.send({ success: true, data: result });
    });
    // 3. Consultar comprobantes contables de un crédito
    app.get('/creditos/:id/comprobantes', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Consultar comprobantes contables (desembolso, recaudo) asociados a un crédito'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.id);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const creditoQuery = await pool.query(`select consecutivo from "Creditos"."TBL_CREDITOS" where id_credito = $1`, [creditoId]);
        const consecutivo = creditoQuery.rows[0]?.consecutivo || `CR-${creditoId}`;
        const comprobantes = await contabilidadService.getComprobantes(consecutivo);
        return reply.send({
            success: true,
            creditoId,
            consecutivo,
            count: comprobantes.length,
            data: comprobantes
        });
    });
    // 4. Sincronizar o despachar desembolso contable manual / reintento (Paso 7)
    app.post('/creditos/:id/sincronizar-desembolso', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Despachar evento contable LIBRANZA_DESEMBOLSO para un crédito'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.id);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const body = sincronizarDesembolsoSchema.parse(req.body || {});
        const credRes = await pool.query(`select c.id_credito, c.consecutivo, c.val_monto_solicitado, d.valor_desembolso, d.fecha_desembolso
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_CREDITO_DESEMBOLSOS" d on d.id_credito = c.id_credito
       where c.id_credito = $1
       order by d.id_credito_desembolso desc limit 1`, [creditoId]);
        if (!credRes.rowCount)
            throw new SecurityError('Crédito no encontrado', 404);
        const row = credRes.rows[0];
        const montoPrincipal = body.montoPrincipal ?? Number(row.val_monto_solicitado);
        const montoNeto = body.montoDesembolsadoNeto ?? (row.valor_desembolso ? Number(row.valor_desembolso) : montoPrincipal);
        const comision = body.comisionOriginacion ?? Math.max(0, montoPrincipal - montoNeto);
        const response = await contabilidadService.registrarDesembolsoContable({
            creditoId,
            consecutivo: row.consecutivo || `CR-${creditoId}`,
            montoPrincipal,
            comisionOriginacion: comision,
            montoDesembolsadoNeto: montoNeto,
            fechaDesembolso: body.fechaDesembolso || row.fecha_desembolso || new Date().toISOString().slice(0, 10)
        });
        return reply.send({
            success: true,
            message: 'Desembolso contabilizado exitosamente en NexusERP',
            data: response.data
        });
    });
    // 5. Sincronizar recaudo contable manual / reporte nómina (Paso 9)
    app.post('/creditos/:id/sincronizar-recaudo', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Despachar evento contable LIBRANZA_RECAUDO por nómina'
        }
    }, async (req, reply) => {
        const creditoId = Number(req.params.id);
        if (!Number.isFinite(creditoId))
            throw new SecurityError('ID de crédito inválido', 400);
        const body = sincronizarRecaudoSchema.parse(req.body);
        const credRes = await pool.query(`select consecutivo from "Creditos"."TBL_CREDITOS" where id_credito = $1`, [creditoId]);
        if (!credRes.rowCount)
            throw new SecurityError('Crédito no encontrado', 404);
        const consecutivo = credRes.rows[0].consecutivo || `CR-${creditoId}`;
        const response = await contabilidadService.registrarRecaudoContable({
            creditoId,
            consecutivo,
            referenciaPago: body.referenciaPago,
            totalRecaudado: body.totalRecaudado,
            capitalAplicado: body.capitalAplicado,
            interesAplicado: body.interesAplicado,
            seguroAplicado: body.seguroAplicado,
            fechaPago: body.fechaPago || new Date().toISOString().slice(0, 10)
        });
        return reply.send({
            success: true,
            message: 'Recaudo contabilizado exitosamente en NexusERP',
            data: response.data
        });
    });
    // 6. Consultar balance de comprobación
    app.get('/balance-comprobacion', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Consultar Balance de Comprobación NIIF de la entidad financiera'
        }
    }, async (_req, reply) => {
        const balance = await contabilidadService.getTrialBalance();
        return reply.send(balance);
    });
    // 7. Catálogo PUC NIIF
    app.get('/puc', {
        schema: {
            tags: ['Contabilidad NIIF'],
            summary: 'Consultar Catálogo de Cuentas PUC NIIF de la financiera'
        }
    }, async (_req, reply) => {
        const chart = await contabilidadService.getChartOfAccounts();
        return reply.send(chart);
    });
}
