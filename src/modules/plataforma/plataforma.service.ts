import { env } from '../../config/env.js';
import { pool } from '../../lib/db.js';
import { ensureModule, ensureSubmodule, getActiveStateId, SecurityError } from '../security/security.service.js';

/**
 * Platform settings for this installation (one installation per client company): brand (name, logo,
 * colors), URLs and the license we sell. Only users with superadmin:config (our team) can change it.
 */
export const PERMISO_SUPERADMIN = 'superadmin:config';
const ROL_SUPERADMIN = 'SUPER ADMIN';
const LOGO_MIME = ['image/png', 'image/jpeg', 'image/webp']; // no SVG: it could carry scripts
const LOGO_MAX_BYTES = 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

type ConfigRow = {
  nombre_comercial: string; razon_social: string | null; nit: string | null; correo_soporte: string | null; telefono: string | null;
  color_primario: string; color_acento: string; logo_mime: string | null; logo_actualizado: Date | null;
  url_admin: string | null; url_portal: string | null;
  licencia_plan: string | null; licencia_inicio: string | null; licencia_vencimiento: string | null;
  licencia_max_usuarios: number | null; licencia_estado: 'ACTIVA' | 'SUSPENDIDA'; fec_actualizacion: Date | null;
};

let lista: Promise<void> | null = null;
export function ensurePlataforma() {
  lista ??= (async () => {
    await pool.query(`
      create table if not exists "Creditos"."TBL_CONFIG_PLATAFORMA" (
        id smallint primary key default 1 check (id = 1),
        nombre_comercial varchar(120) not null default 'Creditos App',
        razon_social varchar(200) null,
        nit varchar(30) null,
        correo_soporte varchar(200) null,
        telefono varchar(40) null,
        color_primario char(7) not null default '#14325c',
        color_acento char(7) not null default '#c49a45',
        logo bytea null,
        logo_mime varchar(60) null,
        logo_actualizado timestamp without time zone null,
        url_admin text null,
        url_portal text null,
        licencia_plan varchar(60) null,
        licencia_inicio date null,
        licencia_vencimiento date null,
        licencia_max_usuarios integer null check (licencia_max_usuarios is null or licencia_max_usuarios > 0),
        licencia_estado varchar(20) not null default 'ACTIVA' check (licencia_estado in ('ACTIVA', 'SUSPENDIDA')),
        fec_actualizacion timestamp without time zone null,
        id_usuario_actualiza integer null
      )
    `);
    await pool.query('insert into "Creditos"."TBL_CONFIG_PLATAFORMA" (id) values (1) on conflict (id) do nothing');
    await seedSuperAdmin();
  })().catch((err) => { lista = null; throw err; });
  return lista;
}

/** Permission + role SUPER ADMIN, granted to the usernames listed in SUPERADMIN_USUARIOS. Never to other roles. */
async function seedSuperAdmin() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const estado = await getActiveStateId(client);
    const moduloId = await ensureModule(client, 'Super Admin', 'Plataforma y licencia');
    const subId = await ensureSubmodule(client, moduloId, 'Plataforma', 'Marca, URLs y licencia', '/superadmin/plataforma');
    const perm = await client.query<{ id_permiso: number }>('select id_permiso from "Creditos"."TBL_PERMISOS" where lower(v_nom_permiso) = $1', [PERMISO_SUPERADMIN]);
    const permisoId = perm.rows[0]?.id_permiso ?? (await client.query<{ id_permiso: number }>(
      'insert into "Creditos"."TBL_PERMISOS" (v_nom_permiso, v_desc_rol, fec_creacion) values ($1, $2, now()) returning id_permiso',
      [PERMISO_SUPERADMIN, 'Super Admin: marca, URLs y licencia']
    )).rows[0].id_permiso;
    const rol = await client.query<{ id_rol: number }>('select id_rol from "Creditos"."TBL_ROLES" where upper(v_nom_rol) = $1', [ROL_SUPERADMIN]);
    const rolId = rol.rows[0]?.id_rol ?? (await client.query<{ id_rol: number }>(
      'insert into "Creditos"."TBL_ROLES" (v_nom_rol, v_desc_perfil, fec_creacion) values ($1, $2, now()) returning id_rol',
      [ROL_SUPERADMIN, 'Proveedor del software (plataforma y licencia)']
    )).rows[0].id_rol;
    await client.query(
      `insert into "Creditos"."TBL_ROL_SUBMODULO_PERMISO" (v_nom_submodulo, id_rol, id_sub_modulo, id_estado, id_permiso)
       select 'Plataforma', $1, $2, $3, $4
       where not exists (select 1 from "Creditos"."TBL_ROL_SUBMODULO_PERMISO" where id_rol = $1 and id_permiso = $4)`,
      [rolId, subId, estado, permisoId]
    );
    const usuarios = (env.SUPERADMIN_USUARIOS ?? '').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
    if (usuarios.length) {
      await client.query(
        `insert into "Creditos"."TBL_USUARIO_ROLES" (id_usuario, id_rol)
         select u.id_usuario, $1 from "Creditos"."TBL_USUARIOS" u
         where lower(u.v_nom_usuario) = any($2::text[])
           and not exists (select 1 from "Creditos"."TBL_USUARIO_ROLES" ur where ur.id_usuario = u.id_usuario and ur.id_rol = $1)`,
        [rolId, usuarios]
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

async function leerConfig() {
  await ensurePlataforma();
  const r = await pool.query<ConfigRow>(
    `select nombre_comercial, razon_social, nit, correo_soporte, telefono, color_primario, color_acento, logo_mime, logo_actualizado,
       url_admin, url_portal, licencia_plan, licencia_inicio::text, licencia_vencimiento::text, licencia_max_usuarios, licencia_estado, fec_actualizacion
     from "Creditos"."TBL_CONFIG_PLATAFORMA" where id = 1`
  );
  return r.rows[0];
}

async function usuariosActivos() {
  const r = await pool.query<{ total: number }>(
    `select count(*)::int as total from "Creditos"."TBL_USUARIOS" u
     inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = u.id_estado where lower(e.v_descripcion) = 'activo'`
  );
  return r.rows[0].total;
}

/** License check shared by login and user creation. No end date and no limit means unrestricted. */
export function evaluarLicencia(c: Pick<ConfigRow, 'licencia_estado' | 'licencia_vencimiento' | 'licencia_max_usuarios'>, activos: number, fecha = hoy()) {
  const diasRestantes = c.licencia_vencimiento
    ? Math.round((Date.parse(`${c.licencia_vencimiento}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86400000)
    : null;
  const motivo = c.licencia_estado === 'SUSPENDIDA' ? 'La licencia está suspendida'
    : diasRestantes !== null && diasRestantes < 0 ? `La licencia venció el ${c.licencia_vencimiento}`
    : null;
  return {
    vigente: motivo === null,
    motivo,
    diasRestantes,
    usuariosActivos: activos,
    maxUsuarios: c.licencia_max_usuarios,
    cupoLleno: c.licencia_max_usuarios !== null && activos >= c.licencia_max_usuarios
  };
}

export async function getEstadoLicencia() {
  const c = await leerConfig();
  return evaluarLicencia(c, await usuariosActivos());
}

const logoUrl = (c: ConfigRow) => (c.logo_mime ? `/api/v1/plataforma/logo?v=${c.logo_actualizado?.getTime() ?? 0}` : null);

/** Public: what the login screens and the portal need. No license details. */
export async function getBranding() {
  const c = await leerConfig();
  const lic = evaluarLicencia(c, 0);
  return {
    nombreComercial: c.nombre_comercial,
    colorPrimario: c.color_primario,
    colorAcento: c.color_acento,
    logoUrl: logoUrl(c),
    urlPortal: c.url_portal,
    correoSoporte: c.correo_soporte,
    licenciaVigente: lic.vigente
  };
}

export async function getConfigPlataforma() {
  const c = await leerConfig();
  return {
    nombreComercial: c.nombre_comercial,
    razonSocial: c.razon_social,
    nit: c.nit,
    correoSoporte: c.correo_soporte,
    telefono: c.telefono,
    colorPrimario: c.color_primario,
    colorAcento: c.color_acento,
    logoUrl: logoUrl(c),
    urlAdmin: c.url_admin,
    urlPortal: c.url_portal,
    licencia: {
      plan: c.licencia_plan,
      inicio: c.licencia_inicio,
      vencimiento: c.licencia_vencimiento,
      estado: c.licencia_estado,
      ...evaluarLicencia(c, await usuariosActivos())
    },
    fechaActualizacion: c.fec_actualizacion
  };
}

export type ConfigPlataformaInput = {
  nombreComercial: string; razonSocial?: string | null; nit?: string | null; correoSoporte?: string | null; telefono?: string | null;
  colorPrimario: string; colorAcento: string; urlAdmin?: string | null; urlPortal?: string | null;
  licencia: { plan?: string | null; inicio?: string | null; vencimiento?: string | null; maxUsuarios?: number | null; estado: 'ACTIVA' | 'SUSPENDIDA' };
};

export async function guardarConfigPlataforma(input: ConfigPlataformaInput, usuarioId: number | null) {
  await ensurePlataforma();
  if (!HEX.test(input.colorPrimario) || !HEX.test(input.colorAcento)) throw new SecurityError('Los colores deben tener formato #RRGGBB', 400);
  const { inicio, vencimiento } = input.licencia;
  if (inicio && vencimiento && vencimiento < inicio) throw new SecurityError('El vencimiento de la licencia no puede ser anterior al inicio', 400);
  await pool.query(
    `update "Creditos"."TBL_CONFIG_PLATAFORMA" set
       nombre_comercial = $1, razon_social = $2, nit = $3, correo_soporte = $4, telefono = $5,
       color_primario = $6, color_acento = $7, url_admin = $8, url_portal = $9,
       licencia_plan = $10, licencia_inicio = $11, licencia_vencimiento = $12, licencia_max_usuarios = $13, licencia_estado = $14,
       fec_actualizacion = now(), id_usuario_actualiza = $15
     where id = 1`,
    [
      input.nombreComercial.trim(), input.razonSocial?.trim() || null, input.nit?.trim() || null, input.correoSoporte?.trim() || null,
      input.telefono?.trim() || null, input.colorPrimario.toLowerCase(), input.colorAcento.toLowerCase(),
      input.urlAdmin?.trim() || null, input.urlPortal?.trim() || null,
      input.licencia.plan?.trim() || null, inicio || null, vencimiento || null, input.licencia.maxUsuarios ?? null, input.licencia.estado, usuarioId
    ]
  );
  return getConfigPlataforma();
}

export async function guardarLogo(archivo: { mimeType: string; base64: string } | null, usuarioId: number | null) {
  await ensurePlataforma();
  if (!archivo) {
    await pool.query('update "Creditos"."TBL_CONFIG_PLATAFORMA" set logo = null, logo_mime = null, logo_actualizado = now(), id_usuario_actualiza = $1 where id = 1', [usuarioId]);
    return getConfigPlataforma();
  }
  if (!LOGO_MIME.includes(archivo.mimeType)) throw new SecurityError('El logo debe ser PNG, JPG o WEBP', 400);
  const buffer = Buffer.from(archivo.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buffer.length || buffer.length > LOGO_MAX_BYTES) throw new SecurityError('El logo debe pesar menos de 1 MB', 400);
  await pool.query(
    'update "Creditos"."TBL_CONFIG_PLATAFORMA" set logo = $1, logo_mime = $2, logo_actualizado = now(), id_usuario_actualiza = $3 where id = 1',
    [buffer, archivo.mimeType, usuarioId]
  );
  return getConfigPlataforma();
}

export async function getLogo() {
  await ensurePlataforma();
  const r = await pool.query<{ logo: Buffer | null; logo_mime: string | null }>('select logo, logo_mime from "Creditos"."TBL_CONFIG_PLATAFORMA" where id = 1');
  return r.rows[0]?.logo ? { contenido: r.rows[0].logo, mime: r.rows[0].logo_mime ?? 'image/png' } : null;
}

/** Portal URL for client emails: platform setting first, then env. */
export async function getUrlPortal() {
  try {
    return (await leerConfig()).url_portal || env.PORTAL_PUBLIC_URL || null;
  } catch {
    return env.PORTAL_PUBLIC_URL || null;
  }
}

/**
 * Tenant admins can manage users and roles, but not the vendor's SUPER ADMIN access:
 * only a super admin can grant/revoke superadmin:config or edit a role/user that has it.
 */
export async function assertGestionSuperAdmin(callerPermisos: string[] | undefined, target: { roleId?: number; permissionIds?: number[]; userId?: number; roleIds?: number[] }) {
  if (callerPermisos?.includes(PERMISO_SUPERADMIN)) return;
  await ensurePlataforma();
  const r = await pool.query<{ toca: boolean }>(
    `with sp as (select id_permiso from "Creditos"."TBL_PERMISOS" where lower(v_nom_permiso) = $1),
          sr as (select distinct rsp.id_rol from "Creditos"."TBL_ROL_SUBMODULO_PERMISO" rsp where rsp.id_permiso in (select id_permiso from sp))
     select (
       ($2::int is not null and $2 in (select id_rol from sr))
       or exists (select 1 from sp where id_permiso = any($3::int[]))
       or exists (select 1 from sr where id_rol = any($4::int[]))
       or ($5::int is not null and exists (select 1 from "Creditos"."TBL_USUARIO_ROLES" ur where ur.id_usuario = $5 and ur.id_rol in (select id_rol from sr)))
     ) as toca`,
    [PERMISO_SUPERADMIN, target.roleId ?? null, target.permissionIds ?? [], target.roleIds ?? [], target.userId ?? null]
  );
  if (r.rows[0]?.toca) throw new SecurityError('Solo el Super Admin puede gestionar el acceso de Super Admin', 403);
}
