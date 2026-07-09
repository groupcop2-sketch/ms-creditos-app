import { z } from 'zod';
import { authenticateUser, changeUserPassword, createModule, createPermission, createRole, createSubmodule, createUser, hasUsers, getCurrentUser, ensureSecurityCatalog, getRolePermissions, listIdentificationTypes, listPermissions, listRoles, listUsers, listSecurityCatalogTree, listUserModuleAccessTree, replaceRolePermissions, replaceUserRoles, SecurityError, updatePermission, updateRole, updateUser } from './security.service.js';
const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1)
});
const userSchema = z.object({
    primerNombre: z.string().min(1),
    segundoNombre: z.string().trim().nullable().optional(),
    primerApellido: z.string().trim().nullable().optional(),
    segundoApellido: z.string().trim().nullable().optional(),
    nombreCompleto: z.string().min(1),
    nombreUsuario: z.string().min(3),
    correo: z.string().email(),
    telefono: z.string().min(5),
    identificacion: z.string().min(4),
    contrasena: z.string().min(8),
    idTipoIdentificacion: z.coerce.number().int().positive(),
    idEstado: z.coerce.number().int().positive().optional(),
    roleIds: z.array(z.coerce.number().int().positive()).optional()
});
const updateUserSchema = userSchema.omit({ contrasena: true, roleIds: true }).extend({
    idEstado: z.coerce.number().int().positive().optional()
});
const passwordSchema = z.object({
    contrasena: z.string().min(8)
});
const roleSchema = z.object({
    nombre: z.string().min(1),
    descripcion: z.string().min(1)
});
const permissionSchema = z.object({
    nombre: z.string().min(1),
    descripcion: z.string().min(1)
});
const moduleSchema = z.object({
    nombre: z.string().min(1),
    descripcion: z.string().min(1)
});
const submoduleSchema = z.object({
    nombre: z.string().min(1),
    descripcion: z.string().min(1),
    link: z.string().min(1),
    idModulo: z.coerce.number().int().positive()
});
const permissionIdsSchema = z.object({
    permissionIds: z.array(z.coerce.number().int().positive()).min(1)
});
const roleIdsSchema = z.object({
    roleIds: z.array(z.coerce.number().int().positive()).min(1)
});
function parseBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new SecurityError(result.error.issues[0]?.message ?? 'Datos invalidos', 400);
    }
    return result.data;
}
function requirePermission(permission) {
    return async (request, reply) => {
        const user = request.user;
        if (!user?.permissions?.includes(permission)) {
            return reply.code(403).send({ message: 'No tienes permisos para realizar esta accion' });
        }
    };
}
export async function securityRoutes(app) {
    app.post('/auth/login', async (request, reply) => {
        const body = parseBody(loginSchema, request.body);
        const user = await authenticateUser(body.username, body.password);
        const token = await reply.jwtSign({
            sub: String(user.id),
            username: user.username,
            roles: user.roles,
            permissions: user.permissions
        });
        return {
            token,
            user
        };
    });
    app.post('/auth/bootstrap', async (request, reply) => {
        const body = parseBody(userSchema, request.body);
        const usersExist = await hasUsers();
        if (usersExist) {
            throw new SecurityError('El sistema ya tiene usuarios creados', 409);
        }
        const catalog = await ensureSecurityCatalog();
        const user = await createUser({
            ...body,
            roleIds: [catalog.adminRoleId]
        });
        const token = await reply.jwtSign({
            sub: String(user.id),
            username: user.username,
            roles: user.roles,
            permissions: user.permissions
        });
        return {
            token,
            user
        };
    });
    app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
        const user = request.user;
        return getCurrentUser(Number(user.sub));
    });
    app.get('/usuarios', { preHandler: [app.authenticate] }, async () => listUsers());
    app.post('/usuarios', { preHandler: [app.authenticate, requirePermission('usuarios:create')] }, async (request) => {
        const body = parseBody(userSchema, request.body);
        return createUser(body);
    });
    app.put('/usuarios/:id', { preHandler: [app.authenticate, requirePermission('usuarios:update')] }, async (request) => {
        const body = parseBody(updateUserSchema, request.body);
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return updateUser(params.id, body);
    });
    app.patch('/usuarios/:id/contrasena', { preHandler: [app.authenticate, requirePermission('usuarios:change-password')] }, async (request) => {
        const body = parseBody(passwordSchema, request.body);
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return changeUserPassword(params.id, body.contrasena);
    });
    app.put('/usuarios/:id/roles', { preHandler: [app.authenticate, requirePermission('usuarios:assign-roles')] }, async (request) => {
        const body = parseBody(roleIdsSchema, request.body);
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return replaceUserRoles(params.id, body.roleIds);
    });
    app.get('/roles', { preHandler: [app.authenticate] }, async () => listRoles());
    app.post('/roles', { preHandler: [app.authenticate, requirePermission('roles:create')] }, async (request) => {
        const body = parseBody(roleSchema, request.body);
        return createRole(body);
    });
    app.put('/roles/:id', { preHandler: [app.authenticate, requirePermission('roles:update')] }, async (request) => {
        const body = parseBody(roleSchema, request.body);
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return updateRole(params.id, body);
    });
    app.get('/roles/:id/permisos', { preHandler: [app.authenticate] }, async (request) => {
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return getRolePermissions(params.id);
    });
    app.put('/roles/:id/permisos', { preHandler: [app.authenticate, requirePermission('roles:assign-permissions')] }, async (request) => {
        const body = parseBody(permissionIdsSchema, request.body);
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return replaceRolePermissions(params.id, body.permissionIds);
    });
    app.get('/permisos', { preHandler: [app.authenticate] }, async () => listPermissions());
    app.get('/catalogo/tipos-identificacion', { preHandler: [app.authenticate] }, async () => listIdentificationTypes());
    app.post('/permisos', { preHandler: [app.authenticate, requirePermission('permisos:create')] }, async (request) => {
        const body = parseBody(permissionSchema, request.body);
        return createPermission(body);
    });
    app.put('/permisos/:id', { preHandler: [app.authenticate, requirePermission('permisos:update')] }, async (request) => {
        const body = parseBody(permissionSchema, request.body);
        const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
        return updatePermission(params.id, body);
    });
    app.get('/catalogo/modulos', { preHandler: [app.authenticate] }, async () => listSecurityCatalogTree());
    app.get('/catalogo/mis-modulos', { preHandler: [app.authenticate] }, async (request) => {
        const user = request.user;
        return listUserModuleAccessTree(Number(user.sub));
    });
    app.post('/modulos', { preHandler: [app.authenticate, requirePermission('modulos:create')] }, async (request) => {
        const body = parseBody(moduleSchema, request.body);
        return createModule(body);
    });
    app.post('/submodulos', { preHandler: [app.authenticate, requirePermission('submodulos:create')] }, async (request) => {
        const body = parseBody(submoduleSchema, request.body);
        return createSubmodule(body);
    });
}
