import { z } from 'zod';
import { createProductoAtributo, createTipoCalculoCredito, createParametroFinanciero, createProductoCredito, createProductoCreditoVersion, createProductoDocumento, saveProductoConvenio, createProductoEtapa, deleteProductoAtributo, deleteProductoCredito, deleteProductoConvenio, deleteProductoDocumento, deleteProductoEtapa, listParametrosFinancieros, listProductoAtributos, listProductoConvenios, listProductoDocumentos, listProductoEtapas, listProductosCredito, listProductosCreditoCatalogs, updateProductoAtributo, updateProductoCredito, updateProductoCreditoEstado, updateProductoDocumento, updateProductoEtapa } from './productos-creditos.service.js';
const productoSchema = z.object({
    nombre: z.string().min(1),
    descripcion: z.string().trim().nullable().optional(),
    idTipoCredito: z.coerce.number().int().positive(),
    tipoTasa: z.enum(['FIJA', 'DIFERENCIAL', 'VARIABLE']).nullable().optional(),
    idLibranzera: z.coerce.number().int().positive().nullable().optional(),
    montoMinimo: z.coerce.number().nonnegative().nullable().optional(),
    montoMaximo: z.coerce.number().nonnegative().nullable().optional(),
    salarioMinimo: z.coerce.number().nonnegative().nullable().optional(),
    salarioMaximo: z.coerce.number().nonnegative().nullable().optional(),
    plazoMinimo: z.coerce.number().int().positive().nullable().optional(),
    plazoMaximo: z.coerce.number().int().positive().nullable().optional(),
    modeloPlazo: z.string().trim().nullable().optional(),
    permiteCreditoMultiple: z.boolean().nullable().optional(),
    interesAjustable: z.boolean().nullable().optional(),
    permiteRefinanciacion: z.boolean().nullable().optional(),
    permiteRetanqueo: z.boolean().nullable().optional(),
    requiereCodeudor: z.boolean().nullable().optional(),
    numeroCodeudores: z.coerce.number().int().nonnegative().nullable().optional(),
    formatoCredito: z.string().trim().nullable().optional(),
    formatoRequisitos: z.string().trim().nullable().optional(),
    formatoCodeudores: z.string().trim().nullable().optional(),
    proveedorFirma: z.string().trim().nullable().optional(),
    periodoGracia: z.coerce.number().int().nonnegative().nullable().optional(),
    periodicidad: z.enum(['MENSUAL', 'QUINCENAL']).nullable().optional(),
    diaCorte: z.coerce.number().int().min(1).max(31).nullable().optional(),
    diaPagoOportuno: z.coerce.number().int().min(1).max(31).nullable().optional(),
    ajustarFinSemana: z.boolean().nullable().optional(),
    moraDespuesVencimiento: z.coerce.number().int().min(0).nullable().optional(),
    tasaMoraMensual: z.coerce.number().min(0).nullable().optional(),
    primeraCuotaMesSiguiente: z.boolean().nullable().optional(),
    observacionCalendario: z.string().trim().nullable().optional(),
    porcentajeEndeudamientoMaximo: z.coerce.number().min(0).max(100).nullable().optional(),
    antiguedadMinimaMeses: z.coerce.number().int().min(0).nullable().optional(),
    requiereEmpleadoActivo: z.boolean().nullable().optional(),
    bloqueaEmbargos: z.boolean().nullable().optional(),
    idEstado: z.coerce.number().int().positive().nullable().optional()
});
const parametroSchema = z.object({
    codigo: z.string().min(1),
    nombre: z.string().min(1),
    valor: z.coerce.number(),
    unidad: z.enum(['VALOR', 'PORCENTAJE']),
    vigenciaDesde: z.string().min(1),
    vigenciaHasta: z.string().nullable().optional()
});
const estadoProductoSchema = z.object({
    activo: z.boolean()
});
const formulaSchema = z.object({
    nombre: z.string().min(1),
    codigo: z.string().trim().nullable().optional(),
    baseCalculo: z.enum(['VALOR_CREDITO', 'VALOR_DESEMBOLSO', 'SALDO', 'SMLMV', 'CUOTA', 'VALOR']).nullable().optional(),
    operacion: z.enum(['VALOR_FIJO', 'PORCENTAJE', 'VALOR_POR_PLAZO', 'BASE_POR_VALOR_DIV_VALOR2']).nullable().optional(),
    requiereValor: z.boolean().nullable().optional(),
    requiereValor2: z.boolean().nullable().optional(),
    requierePorcentaje: z.boolean().nullable().optional(),
    aplicaMinimo: z.boolean().nullable().optional(),
    aplicaMaximo: z.boolean().nullable().optional()
});
const atributoSchema = z.object({
    idTipoAtributo: z.coerce.number().int().positive(),
    idTipoCalculo: z.coerce.number().int().positive(),
    nombre: z.string().min(1),
    valor: z.coerce.number().nullable().optional(),
    porcentaje: z.coerce.number().nullable().optional(),
    valor2: z.coerce.number().nullable().optional(),
    minimo: z.coerce.number().nullable().optional(),
    maximo: z.coerce.number().nullable().optional(),
    aplicaIva: z.boolean().nullable().optional(),
    obligatorio: z.boolean().nullable().optional(),
    proveedor: z.string().trim().nullable().optional(),
    prioridad: z.coerce.number().int().positive().nullable().optional()
});
const convenioSchema = z.object({
    idEmpresa: z.coerce.number().int().positive(),
    cupoTotal: z.coerce.number().nonnegative().nullable().optional(),
    cupoUsado: z.coerce.number().nonnegative().nullable().optional(),
    porcentajeEndeudamientoMaximo: z.coerce.number().min(0).max(100).nullable().optional(),
    requiereValidacionPagaduria: z.boolean().nullable().optional(),
    vigenciaDesde: z.string().trim().nullable().optional(),
    vigenciaHasta: z.string().trim().nullable().optional(),
    activo: z.boolean().nullable().optional(),
    observacion: z.string().trim().nullable().optional()
});
const documentoSchema = z.object({
    idDocumentoCredito: z.coerce.number().int().positive(),
    obligatorio: z.boolean().nullable().optional(),
    grupo: z.string().trim().nullable().optional(),
    prioridad: z.coerce.number().int().positive().nullable().optional(),
    aplicaA: z.string().trim().nullable().optional(),
    requiereFirma: z.boolean().nullable().optional(),
    requiereValidacion: z.boolean().nullable().optional()
});
const etapaSchema = z.object({
    idEtapaCredito: z.coerce.number().int().positive(),
    orden: z.coerce.number().int().positive(),
    obligatoria: z.boolean().nullable().optional(),
    permiteDevolucion: z.boolean().nullable().optional(),
    responsable: z.string().trim().nullable().optional(),
    slaHoras: z.coerce.number().int().positive().nullable().optional()
});
function requirePermission(permission) {
    return async (request, reply) => {
        const user = request.user;
        if (!user?.permissions?.includes(permission)) {
            return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
        }
    };
}
export async function productosCreditosRoutes(app) {
    app.get('/catalogos', { preHandler: [app.authenticate] }, async () => listProductosCreditoCatalogs());
    app.get('/parametros', { preHandler: [app.authenticate] }, async () => listParametrosFinancieros());
    app.post('/parametros', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const body = parametroSchema.parse(request.body);
        return createParametroFinanciero(body);
    });
    app.post('/formulas', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const body = formulaSchema.parse(request.body);
        return createTipoCalculoCredito(body);
    });
    app.get('/', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async () => listProductosCredito());
    app.post('/', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const body = productoSchema.parse(request.body);
        return createProductoCredito(body);
    });
    app.put('/:id', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = productoSchema.parse(request.body);
        return updateProductoCredito(params.id, body);
    });
    app.patch('/:id/estado', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = estadoProductoSchema.parse(request.body);
        return updateProductoCreditoEstado(params.id, body.activo);
    });
    app.post('/:id/versiones', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return createProductoCreditoVersion(params.id);
    });
    app.delete('/:id', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return deleteProductoCredito(params.id);
    });
    app.get('/:id/atributos', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return listProductoAtributos(params.id);
    });
    app.post('/:id/atributos', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = atributoSchema.parse(request.body);
        return createProductoAtributo(params.id, body);
    });
    app.put('/:id/atributos/:atributoId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({
            id: z.coerce.number().int().positive(),
            atributoId: z.coerce.number().int().positive()
        }).parse(request.params);
        const body = atributoSchema.parse(request.body);
        return updateProductoAtributo(params.id, params.atributoId, body);
    });
    app.delete('/:id/atributos/:atributoId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({
            id: z.coerce.number().int().positive(),
            atributoId: z.coerce.number().int().positive()
        }).parse(request.params);
        return deleteProductoAtributo(params.id, params.atributoId);
    });
    app.get('/:id/convenios', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return listProductoConvenios(params.id);
    });
    app.post('/:id/convenios', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = convenioSchema.parse(request.body);
        return saveProductoConvenio(params.id, body);
    });
    app.delete('/:id/convenios/:convenioId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive(), convenioId: z.coerce.number().int().positive() }).parse(request.params);
        return deleteProductoConvenio(params.id, params.convenioId);
    });
    app.get('/:id/documentos', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return listProductoDocumentos(params.id);
    });
    app.post('/:id/documentos', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = documentoSchema.parse(request.body);
        return createProductoDocumento(params.id, body);
    });
    app.put('/:id/documentos/:documentoId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({
            id: z.coerce.number().int().positive(),
            documentoId: z.coerce.number().int().positive()
        }).parse(request.params);
        const body = documentoSchema.parse(request.body);
        return updateProductoDocumento(params.id, params.documentoId, body);
    });
    app.delete('/:id/documentos/:documentoId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({
            id: z.coerce.number().int().positive(),
            documentoId: z.coerce.number().int().positive()
        }).parse(request.params);
        return deleteProductoDocumento(params.id, params.documentoId);
    });
    app.get('/:id/etapas', { preHandler: [app.authenticate, requirePermission('productos-creditos:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return listProductoEtapas(params.id);
    });
    app.post('/:id/etapas', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = etapaSchema.parse(request.body);
        return createProductoEtapa(params.id, body);
    });
    app.put('/:id/etapas/:etapaId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({
            id: z.coerce.number().int().positive(),
            etapaId: z.coerce.number().int().positive()
        }).parse(request.params);
        const body = etapaSchema.parse(request.body);
        return updateProductoEtapa(params.id, params.etapaId, body);
    });
    app.delete('/:id/etapas/:etapaId', { preHandler: [app.authenticate, requirePermission('productos-creditos:create')] }, async (request) => {
        const params = z.object({
            id: z.coerce.number().int().positive(),
            etapaId: z.coerce.number().int().positive()
        }).parse(request.params);
        return deleteProductoEtapa(params.id, params.etapaId);
    });
}
