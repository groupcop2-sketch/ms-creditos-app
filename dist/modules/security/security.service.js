import bcrypt from 'bcryptjs';
import { pool } from '../../lib/db.js';
export class SecurityError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'SecurityError';
    }
}
const securityPermissions = [
    { name: 'auth:login', description: 'Iniciar sesion' },
    { name: 'auth:me', description: 'Consultar perfil autenticado' },
    { name: 'usuarios:read', description: 'Listar usuarios' },
    { name: 'usuarios:create', description: 'Crear usuarios' },
    { name: 'usuarios:update', description: 'Actualizar usuarios' },
    { name: 'usuarios:assign-roles', description: 'Asignar roles a usuarios' },
    { name: 'usuarios:change-password', description: 'Cambiar contrasena de usuarios' },
    { name: 'roles:read', description: 'Listar roles' },
    { name: 'roles:create', description: 'Crear roles' },
    { name: 'roles:update', description: 'Actualizar roles' },
    { name: 'roles:assign-permissions', description: 'Asignar permisos a roles' },
    { name: 'permisos:read', description: 'Listar permisos' },
    { name: 'permisos:create', description: 'Crear permisos' },
    { name: 'permisos:update', description: 'Actualizar permisos' },
    { name: 'modulos:read', description: 'Listar modulos y submodulos' },
    { name: 'modulos:create', description: 'Crear modulos' },
    { name: 'modulos:update', description: 'Actualizar modulos' },
    { name: 'submodulos:create', description: 'Crear submodulos' },
    { name: 'submodulos:update', description: 'Actualizar submodulos' }
];
function normalizeText(value) {
    return value.trim();
}
function isBcryptHash(value) {
    return /^\$2[aby]?\$\d{2}\$/.test(value);
}
async function withClient(runner) {
    const client = await pool.connect();
    try {
        return await runner(client);
    }
    finally {
        client.release();
    }
}
async function getActiveStateId(client = pool) {
    const result = await client.query('select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1', ['activo']);
    if (!result.rowCount) {
        throw new SecurityError('No existe el estado Activo en la tabla TBL_ESTADOS', 500);
    }
    return result.rows[0].id_estado;
}
async function ensureModule(client, name, description) {
    const existing = await client.query('select id_modulo from "Creditos"."TBL_MODULOS" where lower(v_nom_modulo) = lower($1) limit 1', [name]);
    if (existing.rowCount) {
        return existing.rows[0].id_modulo;
    }
    const created = await client.query('insert into "Creditos"."TBL_MODULOS" (v_nom_modulo, v_desc_modulo, fec_creacion) values ($1, $2, now()) returning id_modulo', [name, description]);
    return created.rows[0].id_modulo;
}
async function ensureSubmodule(client, moduleId, name, description, link) {
    const existing = await client.query('select id_sub_modulo from "Creditos"."TBL_SUB_MODULOS" where lower(v_nom_sub_modulo) = lower($1) and id_modulo = $2 limit 1', [name, moduleId]);
    if (existing.rowCount) {
        return existing.rows[0].id_sub_modulo;
    }
    const created = await client.query('insert into "Creditos"."TBL_SUB_MODULOS" (v_nom_sub_modulo, v_desc_modulo, v_link_submodulo, fec_creacion, id_modulo) values ($1, $2, $3, now(), $4) returning id_sub_modulo', [name, description, link, moduleId]);
    return created.rows[0].id_sub_modulo;
}
async function ensurePermission(client, name, description) {
    const existing = await client.query('select id_permiso from "Creditos"."TBL_PERMISOS" where lower(v_nom_permiso) = lower($1) limit 1', [name]);
    if (existing.rowCount) {
        return existing.rows[0].id_permiso;
    }
    const created = await client.query('insert into "Creditos"."TBL_PERMISOS" (v_nom_permiso, v_desc_rol, fec_creacion) values ($1, $2, now()) returning id_permiso', [name, description]);
    return created.rows[0].id_permiso;
}
export async function ensureSecurityCatalog() {
    return withClient(async (client) => {
        const activeStateId = await getActiveStateId(client);
        const moduleId = await ensureModule(client, 'Seguridad', 'Modulo de usuarios, roles y permisos');
        const submodules = {
            usuarios: await ensureSubmodule(client, moduleId, 'Usuarios', 'Administracion de usuarios', '/security/usuarios'),
            roles: await ensureSubmodule(client, moduleId, 'Roles', 'Administracion de roles', '/security/roles'),
            permisos: await ensureSubmodule(client, moduleId, 'Permisos', 'Administracion de permisos', '/security/permisos'),
            modulos: await ensureSubmodule(client, moduleId, 'Modulos', 'Administracion de modulos', '/security/modulos'),
            submodulos: await ensureSubmodule(client, moduleId, 'Submodulos', 'Administracion de submodulos', '/security/submodulos')
        };
        const permissions = {};
        for (const permission of securityPermissions) {
            permissions[permission.name] = await ensurePermission(client, permission.name, permission.description);
        }
        const adminRole = await client.query('select id_rol from "Creditos"."TBL_ROLES" where lower(v_nom_rol) = lower($1) limit 1', ['Administrador']);
        let adminRoleId = adminRole.rows[0]?.id_rol;
        if (!adminRoleId) {
            const createdRole = await client.query('insert into "Creditos"."TBL_ROLES" (v_nom_rol, v_desc_perfil, fec_creacion) values ($1, $2, now()) returning id_rol', ['Administrador', 'Acceso total al sistema']);
            adminRoleId = createdRole.rows[0].id_rol;
        }
        for (const permission of securityPermissions) {
            const submoduleKey = permission.name.split(':')[0];
            const submoduleId = submodules[submoduleKey];
            if (submoduleId) {
                const existingAssignment = await client.query('select 1 from "Creditos"."TBL_ROL_SUBMODULO_PERMISO" where id_rol = $1 and id_permiso = $2 and id_sub_modulo = $3 limit 1', [adminRoleId, permissions[permission.name], submoduleId]);
                if (!existingAssignment.rowCount) {
                    await client.query('insert into "Creditos"."TBL_ROL_SUBMODULO_PERMISO" (v_nom_submodulo, id_rol, id_sub_modulo, id_estado, id_permiso) values ($1, $2, $3, $4, $5)', [submoduleKey, adminRoleId, submoduleId, activeStateId, permissions[permission.name]]);
                }
            }
        }
        return { moduleId, submodules, permissions, activeStateId, adminRoleId };
    });
}
export async function hasUsers() {
    return withClient(async (client) => {
        const result = await client.query('select 1 from "Creditos"."TBL_USUARIOS" limit 1');
        return (result.rowCount ?? 0) > 0;
    });
}
async function getStateIdOrActive(client, idEstado) {
    if (idEstado) {
        return idEstado;
    }
    return getActiveStateId(client);
}
async function getUserRoles(client, userId) {
    const result = await client.query('select distinct r.id_rol, r.v_nom_rol from "Creditos"."TBL_USUARIO_ROLES" ur inner join "Creditos"."TBL_ROLES" r on r.id_rol = ur.id_rol where ur.id_usuario = $1 order by r.v_nom_rol', [userId]);
    return result.rows.map((row) => row.v_nom_rol);
}
async function getUserPermissions(client, userId) {
    const result = await client.query('select distinct permiso from "Creditos".fn_permisos_usuario($1) order by permiso', [userId]);
    return result.rows.map((row) => row.permiso);
}
async function mapUserProfile(client, userId) {
    const userResult = await client.query('select u.id_usuario, u.v_primer_nombre, u.v_segundo_nombre, u.v_primer_apellido, u.v_segundo_apellido, u.v_nom_completo, u.v_nom_usuario, u.v_correo, u.v_telefono, u.v_identificacion, u.id_tip_identificacion, u.id_estado, e.v_descripcion as estado, coalesce(array_agg(distinct r.v_nom_rol) filter (where r.v_nom_rol is not null), array[]::varchar[]) as roles from "Creditos"."TBL_USUARIOS" u inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = u.id_estado left join "Creditos"."TBL_USUARIO_ROLES" ur on ur.id_usuario = u.id_usuario left join "Creditos"."TBL_ROLES" r on r.id_rol = ur.id_rol where u.id_usuario = $1 group by u.id_usuario, u.v_primer_nombre, u.v_segundo_nombre, u.v_primer_apellido, u.v_segundo_apellido, u.v_nom_completo, u.v_nom_usuario, u.v_correo, u.v_telefono, u.v_identificacion, u.id_tip_identificacion, u.id_estado, e.v_descripcion', [userId]);
    if (!userResult.rowCount) {
        throw new SecurityError('Usuario no encontrado', 404);
    }
    const user = userResult.rows[0];
    const permissions = await getUserPermissions(client, userId);
    return {
        id: user.id_usuario,
        username: user.v_nom_usuario,
        fullName: user.v_nom_completo,
        email: user.v_correo,
        phone: user.v_telefono,
        identification: user.v_identificacion,
        roles: user.roles ?? [],
        permissions
    };
}
export async function authenticateUser(username, password) {
    return withClient(async (client) => {
        const result = await client.query('select u.id_usuario, u.v_nom_usuario, u.v_nom_completo, u.v_correo, u.v_telefono, u.v_identificacion, u.v_contraseña, e.v_descripcion as estado from "Creditos"."TBL_USUARIOS" u inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = u.id_estado where lower(u.v_nom_usuario) = lower($1) or lower(u.v_correo) = lower($1) order by case when lower(e.v_descripcion) = $2 then 0 else 1 end, u.id_usuario asc limit 1', [normalizeText(username), 'activo']);
        if (!result.rowCount) {
            throw new SecurityError('Credenciales invalidas', 401);
        }
        const user = result.rows[0];
        if (user.estado.toLowerCase() !== 'activo') {
            throw new SecurityError('El usuario no esta activo', 403);
        }
        const matches = isBcryptHash(user.v_contraseña)
            ? await bcrypt.compare(password, user.v_contraseña)
            : user.v_contraseña === password;
        if (!matches) {
            throw new SecurityError('Credenciales invalidas', 401);
        }
        if (!isBcryptHash(user.v_contraseña)) {
            const upgradedHash = await bcrypt.hash(user.v_contraseña, 12);
            await client.query('update "Creditos"."TBL_USUARIOS" set v_contraseña = $1, fec_actualizacion = now() where id_usuario = $2', [upgradedHash, user.id_usuario]);
        }
        return mapUserProfile(client, user.id_usuario);
    });
}
export async function getCurrentUser(userId) {
    return withClient(async (client) => mapUserProfile(client, userId));
}
export async function listUsers() {
    return withClient(async (client) => {
        const result = await client.query('select u.id_usuario, u.v_primer_nombre, u.v_segundo_nombre, u.v_primer_apellido, u.v_segundo_apellido, u.v_nom_completo, u.v_nom_usuario, u.v_correo, u.v_telefono, u.v_identificacion, u.id_tip_identificacion, u.id_estado, e.v_descripcion as estado, coalesce(array_agg(distinct r.v_nom_rol) filter (where r.v_nom_rol is not null), array[]::varchar[]) as roles from "Creditos"."TBL_USUARIOS" u inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = u.id_estado left join "Creditos"."TBL_USUARIO_ROLES" ur on ur.id_usuario = u.id_usuario left join "Creditos"."TBL_ROLES" r on r.id_rol = ur.id_rol group by u.id_usuario, u.v_primer_nombre, u.v_segundo_nombre, u.v_primer_apellido, u.v_segundo_apellido, u.v_nom_completo, u.v_nom_usuario, u.v_correo, u.v_telefono, u.v_identificacion, u.id_tip_identificacion, u.id_estado, e.v_descripcion order by u.v_nom_completo');
        return result.rows.map((user) => ({
            id: user.id_usuario,
            primerNombre: user.v_primer_nombre,
            segundoNombre: user.v_segundo_nombre,
            primerApellido: user.v_primer_apellido,
            segundoApellido: user.v_segundo_apellido,
            nombreCompleto: user.v_nom_completo,
            nombreUsuario: user.v_nom_usuario,
            correo: user.v_correo,
            telefono: user.v_telefono,
            identificacion: user.v_identificacion,
            idTipoIdentificacion: user.id_tip_identificacion,
            idEstado: user.id_estado,
            estado: user.estado,
            roles: user.roles ?? []
        }));
    });
}
export async function createUser(input) {
    return withClient(async (client) => {
        await ensureRoleApprovalLimitColumn(client);
        const duplicates = await client.query('select 1 from "Creditos"."TBL_USUARIOS" where lower(v_nom_usuario) = lower($1) or lower(v_correo) = lower($2) or v_identificacion = $3 limit 1', [normalizeText(input.nombreUsuario), normalizeText(input.correo), normalizeText(input.identificacion)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe un usuario con ese nombre, correo o identificacion', 409);
        }
        const passwordHash = await bcrypt.hash(input.contrasena, 12);
        const stateId = await getStateIdOrActive(client, input.idEstado);
        const created = await client.query('insert into "Creditos"."TBL_USUARIOS" (v_primer_nombre, v_segundo_nombre, v_primer_apellido, v_segundo_apellido, v_nom_completo, v_nom_usuario, v_correo, v_telefono, v_identificacion, v_contraseña, fec_creacion, id_estado, id_tip_identificacion) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11, $12) returning id_usuario', [
            normalizeText(input.primerNombre),
            input.segundoNombre?.trim() || null,
            input.primerApellido?.trim() || null,
            input.segundoApellido?.trim() || null,
            normalizeText(input.nombreCompleto),
            normalizeText(input.nombreUsuario),
            normalizeText(input.correo),
            normalizeText(input.telefono),
            normalizeText(input.identificacion),
            passwordHash,
            stateId,
            input.idTipoIdentificacion
        ]);
        if (input.roleIds?.length) {
            await replaceUserRoles(created.rows[0].id_usuario, input.roleIds);
        }
        return getCurrentUser(created.rows[0].id_usuario);
    });
}
export async function updateUser(userId, input) {
    return withClient(async (client) => {
        const existing = await client.query('select id_usuario from "Creditos"."TBL_USUARIOS" where id_usuario = $1 limit 1', [userId]);
        if (!existing.rowCount) {
            throw new SecurityError('Usuario no encontrado', 404);
        }
        const duplicates = await client.query('select 1 from "Creditos"."TBL_USUARIOS" where id_usuario <> $1 and (lower(v_nom_usuario) = lower($2) or lower(v_correo) = lower($3) or v_identificacion = $4) limit 1', [userId, normalizeText(input.nombreUsuario), normalizeText(input.correo), normalizeText(input.identificacion)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe otro usuario con ese nombre, correo o identificacion', 409);
        }
        const stateId = await getStateIdOrActive(client, input.idEstado);
        await client.query('update "Creditos"."TBL_USUARIOS" set v_primer_nombre = $1, v_segundo_nombre = $2, v_primer_apellido = $3, v_segundo_apellido = $4, v_nom_completo = $5, v_nom_usuario = $6, v_correo = $7, v_telefono = $8, v_identificacion = $9, fec_actualizacion = now(), id_estado = $10, id_tip_identificacion = $11 where id_usuario = $12', [
            normalizeText(input.primerNombre),
            input.segundoNombre?.trim() || null,
            input.primerApellido?.trim() || null,
            input.segundoApellido?.trim() || null,
            normalizeText(input.nombreCompleto),
            normalizeText(input.nombreUsuario),
            normalizeText(input.correo),
            normalizeText(input.telefono),
            normalizeText(input.identificacion),
            stateId,
            input.idTipoIdentificacion,
            userId
        ]);
        return getCurrentUser(userId);
    });
}
export async function changeUserPassword(userId, password) {
    return withClient(async (client) => {
        const hash = await bcrypt.hash(password, 12);
        const result = await client.query('update "Creditos"."TBL_USUARIOS" set v_contraseña = $1, fec_actualizacion = now() where id_usuario = $2', [hash, userId]);
        if (!result.rowCount) {
            throw new SecurityError('Usuario no encontrado', 404);
        }
        return { updated: true };
    });
}
export async function replaceUserRoles(userId, roleIds) {
    return withClient(async (client) => {
        const validRoles = Array.from(new Set(roleIds));
        if (!validRoles.length) {
            throw new SecurityError('Debes enviar al menos un rol', 400);
        }
        await client.query('delete from "Creditos"."TBL_USUARIO_ROLES" where id_usuario = $1', [userId]);
        for (const roleId of validRoles) {
            await client.query('insert into "Creditos"."TBL_USUARIO_ROLES" (id_usuario, id_rol) values ($1, $2)', [userId, roleId]);
        }
        return getCurrentUser(userId);
    });
}
async function ensureRoleApprovalLimitColumn(client) {
    await client.query(`alter table "Creditos"."TBL_ROLES" add column if not exists monto_maximo_aprobacion numeric(18,2) null`);
    await client.query(`update "Creditos"."TBL_ROLES" set monto_maximo_aprobacion = null where lower(v_nom_rol) like '%admin%'`);
}
export async function listRoles() {
    return withClient(async (client) => {
        const result = await client.query('select id_rol, v_nom_rol, v_desc_perfil from "Creditos"."TBL_ROLES" order by v_nom_rol');
        return result.rows.map((role) => ({
            id: role.id_rol,
            nombre: role.v_nom_rol,
            descripcion: role.v_desc_perfil
        }));
    });
}
export async function createRole(input) {
    return withClient(async (client) => {
        const duplicates = await client.query('select 1 from "Creditos"."TBL_ROLES" where lower(v_nom_rol) = lower($1) limit 1', [normalizeText(input.nombre)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe un rol con ese nombre', 409);
        }
        const created = await client.query('insert into "Creditos"."TBL_ROLES" (v_nom_rol, v_desc_perfil, fec_creacion) values ($1, $2, now()) returning id_rol', [normalizeText(input.nombre), normalizeText(input.descripcion)]);
        return {
            id: created.rows[0].id_rol,
            nombre: input.nombre,
            descripcion: input.descripcion
        };
    });
}
export async function updateRole(roleId, input) {
    return withClient(async (client) => {
        await ensureRoleApprovalLimitColumn(client);
        const existing = await client.query('select 1 from "Creditos"."TBL_ROLES" where id_rol = $1 limit 1', [roleId]);
        if (!existing.rowCount) {
            throw new SecurityError('Rol no encontrado', 404);
        }
        const duplicates = await client.query('select 1 from "Creditos"."TBL_ROLES" where id_rol <> $1 and lower(v_nom_rol) = lower($2) limit 1', [roleId, normalizeText(input.nombre)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe otro rol con ese nombre', 409);
        }
        await client.query('update "Creditos"."TBL_ROLES" set v_nom_rol = $1, v_desc_perfil = $2, fec_actualizacion = now() where id_rol = $3', [normalizeText(input.nombre), normalizeText(input.descripcion), roleId]);
        return { updated: true };
    });
}
export async function replaceRolePermissions(roleId, permissionIds) {
    return withClient(async (client) => {
        const uniquePermissionIds = Array.from(new Set(permissionIds));
        if (!uniquePermissionIds.length) {
            throw new SecurityError('Debes enviar al menos un permiso', 400);
        }
        const catalog = await ensureSecurityCatalog();
        await client.query('delete from "Creditos"."TBL_ROL_SUBMODULO_PERMISO" where id_rol = $1', [roleId]);
        const permissionLookup = await client.query('select id_permiso, v_nom_permiso, v_desc_rol from "Creditos"."TBL_PERMISOS" where id_permiso = any($1::int[])', [uniquePermissionIds]);
        if (permissionLookup.rowCount !== uniquePermissionIds.length) {
            throw new SecurityError('Uno o mas permisos no existen', 404);
        }
        for (const permission of permissionLookup.rows) {
            const prefix = permission.v_nom_permiso.split(':')[0];
            const submoduleId = catalog.submodules[prefix];
            if (!submoduleId) {
                throw new SecurityError(`No existe submodulo de seguridad para el permiso ${permission.v_nom_permiso}`, 409);
            }
            await client.query('insert into "Creditos"."TBL_ROL_SUBMODULO_PERMISO" (v_nom_submodulo, id_rol, id_sub_modulo, id_estado, id_permiso) values ($1, $2, $3, $4, $5)', [prefix, roleId, submoduleId, catalog.activeStateId, permission.id_permiso]);
        }
        return { updated: true };
    });
}
export async function listPermissions() {
    return withClient(async (client) => {
        const result = await client.query('select id_permiso, v_nom_permiso, v_desc_rol from "Creditos"."TBL_PERMISOS" order by v_nom_permiso');
        return result.rows.map((permission) => ({
            id: permission.id_permiso,
            nombre: permission.v_nom_permiso,
            descripcion: permission.v_desc_rol
        }));
    });
}
export async function listIdentificationTypes() {
    return withClient(async (client) => {
        const result = await client.query('select id_tip_identificacion, v_des_identificacion, v_sigla_identificacion, v_cod_dane from "Creditos"."TBL_TIP_IDENTIFICACIONES" order by v_sigla_identificacion');
        return result.rows.map((type) => ({
            id: type.id_tip_identificacion,
            descripcion: type.v_des_identificacion,
            sigla: type.v_sigla_identificacion,
            codigoDane: type.v_cod_dane
        }));
    });
}
export async function createPermission(input) {
    return withClient(async (client) => {
        const duplicates = await client.query('select 1 from "Creditos"."TBL_PERMISOS" where lower(v_nom_permiso) = lower($1) limit 1', [normalizeText(input.nombre)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe un permiso con ese nombre', 409);
        }
        const created = await client.query('insert into "Creditos"."TBL_PERMISOS" (v_nom_permiso, v_desc_rol, fec_creacion) values ($1, $2, now()) returning id_permiso', [normalizeText(input.nombre), normalizeText(input.descripcion)]);
        return {
            id: created.rows[0].id_permiso,
            nombre: input.nombre,
            descripcion: input.descripcion
        };
    });
}
export async function createModule(input) {
    return withClient(async (client) => {
        const duplicates = await client.query('select 1 from "Creditos"."TBL_MODULOS" where lower(v_nom_modulo) = lower($1) limit 1', [normalizeText(input.nombre)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe un modulo con ese nombre', 409);
        }
        const created = await client.query('insert into "Creditos"."TBL_MODULOS" (v_nom_modulo, v_desc_modulo, fec_creacion) values ($1, $2, now()) returning id_modulo', [normalizeText(input.nombre), normalizeText(input.descripcion)]);
        return {
            id: created.rows[0].id_modulo,
            nombre: normalizeText(input.nombre),
            descripcion: normalizeText(input.descripcion),
            submodules: []
        };
    });
}
export async function createSubmodule(input) {
    return withClient(async (client) => {
        const moduleExists = await client.query('select 1 from "Creditos"."TBL_MODULOS" where id_modulo = $1 limit 1', [input.idModulo]);
        if (!moduleExists.rowCount) {
            throw new SecurityError('Modulo no encontrado', 404);
        }
        const duplicates = await client.query('select 1 from "Creditos"."TBL_SUB_MODULOS" where id_modulo = $1 and lower(v_nom_sub_modulo) = lower($2) limit 1', [input.idModulo, normalizeText(input.nombre)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe un submodulo con ese nombre en el modulo seleccionado', 409);
        }
        const created = await client.query('insert into "Creditos"."TBL_SUB_MODULOS" (v_nom_sub_modulo, v_desc_modulo, v_link_submodulo, fec_creacion, id_modulo) values ($1, $2, $3, now(), $4) returning id_sub_modulo', [normalizeText(input.nombre), normalizeText(input.descripcion), normalizeText(input.link), input.idModulo]);
        return {
            id: created.rows[0].id_sub_modulo,
            nombre: normalizeText(input.nombre),
            descripcion: normalizeText(input.descripcion),
            link: normalizeText(input.link),
            roles: [],
            permissions: []
        };
    });
}
export async function updatePermission(permissionId, input) {
    return withClient(async (client) => {
        const existing = await client.query('select 1 from "Creditos"."TBL_PERMISOS" where id_permiso = $1 limit 1', [permissionId]);
        if (!existing.rowCount) {
            throw new SecurityError('Permiso no encontrado', 404);
        }
        const duplicates = await client.query('select 1 from "Creditos"."TBL_PERMISOS" where id_permiso <> $1 and lower(v_nom_permiso) = lower($2) limit 1', [permissionId, normalizeText(input.nombre)]);
        if (duplicates.rowCount) {
            throw new SecurityError('Ya existe otro permiso con ese nombre', 409);
        }
        await client.query('update "Creditos"."TBL_PERMISOS" set v_nom_permiso = $1, v_desc_rol = $2, fec_actualizacion = now() where id_permiso = $3', [normalizeText(input.nombre), normalizeText(input.descripcion), permissionId]);
        return { updated: true };
    });
}
export async function getRolePermissions(roleId) {
    return withClient(async (client) => {
        const result = await client.query('select p.id_permiso, p.v_nom_permiso, p.v_desc_rol from "Creditos"."TBL_ROL_SUBMODULO_PERMISO" rsp inner join "Creditos"."TBL_PERMISOS" p on p.id_permiso = rsp.id_permiso inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = rsp.id_estado where rsp.id_rol = $1 and lower(e.v_descripcion) = $2 order by p.v_nom_permiso', [roleId, 'activo']);
        return result.rows.map((row) => {
            const item = row;
            return {
                id: item.id_permiso,
                nombre: item.v_nom_permiso,
                descripcion: item.v_desc_rol
            };
        });
    });
}
export async function listSecurityCatalogTree() {
    return withClient(async (client) => {
        const result = await client.query('select m.id_modulo, m.v_nom_modulo, m.v_desc_modulo, sm.id_sub_modulo, sm.v_nom_sub_modulo, sm.v_desc_modulo as v_desc_sub_modulo, sm.v_link_submodulo, p.id_permiso, p.v_nom_permiso, p.v_desc_rol as v_desc_permiso, r.v_nom_rol from "Creditos"."TBL_MODULOS" m left join "Creditos"."TBL_SUB_MODULOS" sm on sm.id_modulo = m.id_modulo left join "Creditos"."TBL_ROL_SUBMODULO_PERMISO" rsp on rsp.id_sub_modulo = sm.id_sub_modulo left join "Creditos"."TBL_PERMISOS" p on p.id_permiso = rsp.id_permiso left join "Creditos"."TBL_ROLES" r on r.id_rol = rsp.id_rol order by m.v_nom_modulo, sm.v_nom_sub_modulo, p.v_nom_permiso, r.v_nom_rol');
        const moduleMap = new Map();
        const submoduleMap = new Map();
        for (const row of result.rows) {
            let module = moduleMap.get(row.id_modulo);
            if (!module) {
                module = {
                    id: row.id_modulo,
                    nombre: row.v_nom_modulo,
                    descripcion: row.v_desc_modulo,
                    submodules: []
                };
                moduleMap.set(row.id_modulo, module);
            }
            if (!row.id_sub_modulo) {
                continue;
            }
            let submodule = submoduleMap.get(row.id_sub_modulo);
            if (!submodule) {
                submodule = {
                    id: row.id_sub_modulo,
                    nombre: row.v_nom_sub_modulo ?? 'Sin nombre',
                    descripcion: row.v_desc_sub_modulo ?? '',
                    link: row.v_link_submodulo ?? '',
                    roles: [],
                    permissions: []
                };
                submoduleMap.set(row.id_sub_modulo, submodule);
                module.submodules.push(submodule);
            }
            if (row.v_nom_rol && !submodule.roles.includes(row.v_nom_rol)) {
                submodule.roles.push(row.v_nom_rol);
            }
            if (row.id_permiso && row.v_nom_permiso && !submodule.permissions.some((item) => item.id === row.id_permiso)) {
                submodule.permissions.push({
                    id: row.id_permiso,
                    nombre: row.v_nom_permiso,
                    descripcion: row.v_desc_permiso ?? ''
                });
            }
        }
        return Array.from(moduleMap.values());
    });
}
export async function listUserModuleAccessTree(userId) {
    return withClient(async (client) => {
        const accessResult = await client.query('select modulo, submodulo, permiso from "Creditos".fn_permisos_usuario($1)', [userId]);
        if (!accessResult.rowCount) {
            return [];
        }
        const moduleNames = Array.from(new Set(accessResult.rows.map((row) => row.modulo.toLowerCase())));
        const submoduleNames = Array.from(new Set(accessResult.rows.map((row) => row.submodulo.toLowerCase())));
        const catalogResult = await client.query('select m.id_modulo, m.v_nom_modulo, m.v_desc_modulo, sm.id_sub_modulo, sm.v_nom_sub_modulo, sm.v_desc_modulo as v_desc_sub_modulo, sm.v_link_submodulo from "Creditos"."TBL_MODULOS" m inner join "Creditos"."TBL_SUB_MODULOS" sm on sm.id_modulo = m.id_modulo where lower(m.v_nom_modulo) = any($1::text[]) and lower(sm.v_nom_sub_modulo) = any($2::text[]) order by m.v_nom_modulo, sm.v_nom_sub_modulo', [moduleNames, submoduleNames]);
        const permissionsBySubmodule = new Map();
        for (const row of accessResult.rows) {
            const key = `${row.modulo.toLowerCase()}::${row.submodulo.toLowerCase()}`;
            const permissions = permissionsBySubmodule.get(key) ?? [];
            if (!permissions.some((permission) => permission.nombre === row.permiso)) {
                permissions.push({
                    id: permissions.length + 1,
                    nombre: row.permiso,
                    descripcion: row.permiso
                });
            }
            permissionsBySubmodule.set(key, permissions);
        }
        const moduleMap = new Map();
        for (const row of catalogResult.rows) {
            let module = moduleMap.get(row.id_modulo);
            if (!module) {
                module = {
                    id: row.id_modulo,
                    nombre: row.v_nom_modulo,
                    descripcion: row.v_desc_modulo,
                    submodules: []
                };
                moduleMap.set(row.id_modulo, module);
            }
            const key = `${row.v_nom_modulo.toLowerCase()}::${row.v_nom_sub_modulo.toLowerCase()}`;
            module.submodules.push({
                id: row.id_sub_modulo,
                nombre: row.v_nom_sub_modulo,
                descripcion: row.v_desc_sub_modulo,
                link: row.v_link_submodulo,
                roles: [],
                permissions: permissionsBySubmodule.get(key) ?? []
            });
        }
        return Array.from(moduleMap.values());
    });
}
export async function listUsersForSelection() {
    return withClient(async (client) => {
        const result = await client.query('select id_usuario, v_nom_completo, v_nom_usuario from "Creditos"."TBL_USUARIOS" order by v_nom_completo');
        return result.rows.map((user) => ({
            id: user.id_usuario,
            nombreCompleto: user.v_nom_completo,
            nombreUsuario: user.v_nom_usuario
        }));
    });
}
