import { z } from 'zod';
import { bulkCreateEmpleadosEmpresa, createEmpleadoEmpresa, createEmpresa, getEmpresa, listAddressCatalogs, listEmployeeCatalogs, listEmpleadosEmpresa, listEmpresas } from './pagadurias.service.js';
const direccionSchema = z.object({
    idTipoVia: z.coerce.number().int().positive(),
    numPrincipal: z.coerce.number().int().positive().nullable().optional(),
    idLetraPrincipal: z.coerce.number().int().positive().nullable().optional(),
    bis: z.string().trim().nullable().optional(),
    letraBis: z.coerce.number().int().positive().nullable().optional(),
    cuadrantePrincipal: z.string().trim().nullable().optional(),
    numSecundario: z.coerce.number().int().positive().nullable().optional(),
    idLetraSecundaria: z.coerce.number().int().positive().nullable().optional(),
    cuadranteSecundario: z.string().trim().nullable().optional(),
    complemento: z.string().trim().nullable().optional(),
    barrio: z.string().trim().nullable().optional(),
    idCiudad: z.coerce.number().int().positive(),
    esPrincipal: z.boolean().nullable().optional()
});
const empresaSchema = z.object({
    nit: z.string().min(1),
    razonSocial: z.string().min(1),
    vendedor: z.string().trim().nullable().optional(),
    domicilio: z.string().trim().nullable().optional(),
    correo: z.string().trim().nullable().optional(),
    telefono: z.string().trim().nullable().optional(),
    representanteLegal: z.string().trim().nullable().optional(),
    telefonoRepresentante: z.string().trim().nullable().optional(),
    tipoIdentificacionRepresentante: z.string().trim().nullable().optional(),
    identificacionRepresentante: z.string().trim().nullable().optional(),
    correoRepresentante: z.string().trim().nullable().optional(),
    codigo: z.string().trim().nullable().optional(),
    contactoCargo: z.string().trim().nullable().optional(),
    contactoNombre: z.string().trim().nullable().optional(),
    contactoCorreo: z.string().trim().nullable().optional(),
    contactoTelefono: z.string().trim().nullable().optional(),
    fechaConstitucion: z.string().trim().nullable().optional(),
    capitalSociedad: z.coerce.number().nonnegative().nullable().optional(),
    fechaVenta: z.string().trim().nullable().optional(),
    ventasFecha: z.coerce.number().nonnegative().nullable().optional(),
    naturaleza: z.string().trim().nullable().optional(),
    camaraNumero: z.string().trim().nullable().optional(),
    camaraLibro: z.string().trim().nullable().optional(),
    camaraCiudad: z.string().trim().nullable().optional(),
    periodicidadNomina: z.enum(['MENSUAL', 'QUINCENAL']).nullable().optional(),
    diaCorteNomina: z.coerce.number().int().min(1).max(31).nullable().optional(),
    diaPagoNomina: z.coerce.number().int().min(1).max(31).nullable().optional(),
    segundoDiaPagoNomina: z.coerce.number().int().min(1).max(31).nullable().optional(),
    diaDescuentoLibranza: z.coerce.number().int().min(1).max(31).nullable().optional(),
    ajustarFinSemana: z.boolean().nullable().optional(),
    observacionCalendario: z.string().trim().nullable().optional(),
    direccion: direccionSchema.nullable().optional(),
    idEstado: z.coerce.number().int().positive().nullable().optional()
});
const empleadoSchema = z.object({
    idTipoIdentificacion: z.coerce.number().int().positive().nullable().optional(),
    identificacion: z.string().min(1),
    primerNombre: z.string().min(1),
    segundoNombre: z.string().trim().nullable().optional(),
    primerApellido: z.string().trim().nullable().optional(),
    segundoApellido: z.string().trim().nullable().optional(),
    nombreCompleto: z.string().trim().nullable().optional(),
    correo: z.string().trim().nullable().optional(),
    telefono: z.string().trim().nullable().optional(),
    cargo: z.string().trim().nullable().optional(),
    idTipoContrato: z.coerce.number().int().positive().nullable().optional(),
    salario: z.coerce.number().nonnegative().nullable().optional(),
    idBanco: z.coerce.number().int().positive().nullable().optional(),
    idTipoCuenta: z.coerce.number().int().positive().nullable().optional(),
    cuentaNomina: z.string().trim().nullable().optional(),
    tieneEmbargos: z.boolean().nullable().optional(),
    idEstadoCivil: z.coerce.number().int().positive().nullable().optional(),
    personasCargo: z.coerce.number().int().nonnegative().nullable().optional(),
    idTipoVivienda: z.coerce.number().int().positive().nullable().optional(),
    fechaIngreso: z.string().trim().nullable().optional(),
    idEstado: z.coerce.number().int().positive().nullable().optional()
});
const bulkEmpleadoSchema = z.object({
    empleados: z.array(empleadoSchema).min(1).max(1000)
});
function parseBody(schema, body) {
    return schema.parse(body);
}
function requirePermission(permission) {
    return async (request, reply) => {
        const user = request.user;
        if (!user?.permissions?.includes(permission)) {
            return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
        }
    };
}
export async function pagaduriasRoutes(app) {
    app.get('/catalogos-direccion', { preHandler: [app.authenticate] }, async () => listAddressCatalogs());
    app.get('/catalogos-empleados', { preHandler: [app.authenticate] }, async () => listEmployeeCatalogs());
    app.get('/', { preHandler: [app.authenticate, requirePermission('empresas:read')] }, async () => listEmpresas());
    app.post('/', { preHandler: [app.authenticate, requirePermission('empresas:create')] }, async (request) => {
        const body = parseBody(empresaSchema, request.body);
        return createEmpresa(body);
    });
    app.get('/:id', { preHandler: [app.authenticate, requirePermission('empresas:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return getEmpresa(params.id);
    });
    app.get('/:id/empleados', { preHandler: [app.authenticate, requirePermission('empresas:employees:read')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return listEmpleadosEmpresa(params.id);
    });
    app.post('/:id/empleados', { preHandler: [app.authenticate, requirePermission('empresas:employees:create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = parseBody(empleadoSchema, request.body);
        return createEmpleadoEmpresa(params.id, body);
    });
    app.post('/:id/empleados/carga-masiva', { preHandler: [app.authenticate, requirePermission('empresas:employees:bulk-create')] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        const body = parseBody(bulkEmpleadoSchema, request.body);
        return bulkCreateEmpleadosEmpresa(params.id, body.empleados);
    });
}
