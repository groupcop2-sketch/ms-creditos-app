import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtUserPayload } from '../../types/auth.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
import { normalizeStage } from './soportes-cliente.js';

/**
 * One permission per credit stage, assigned to roles in Seguridad → Roles. A user can only work
 * (approve, return, reject and the stage's own actions) the stages their roles allow.
 */
// descripcion: max 50 chars (TBL_PERMISOS.v_desc_rol is varchar(50)).
export const PERMISOS_ETAPA = [
  { code: 'creditos:etapa-radicacion', etapa: 'Radicación', descripcion: 'Trabajar etapa Radicación', match: (k: string) => k.includes('RADIC') },
  { code: 'creditos:etapa-validacion', etapa: 'Validación documental', descripcion: 'Trabajar etapa Validación documental', match: (k: string) => k.includes('VALIDACION') && k.includes('DOCUMENT') },
  { code: 'creditos:etapa-estudio', etapa: 'Estudio de crédito', descripcion: 'Trabajar etapa Estudio de crédito', match: (k: string) => k.includes('ESTUDIO') || k.includes('ANALISIS') },
  { code: 'creditos:etapa-visacion', etapa: 'Visación', descripcion: 'Trabajar etapa Visación y envío a firma', match: (k: string) => k.includes('APROB') || k.includes('COMITE') || k.includes('VISACION') },
  { code: 'creditos:etapa-desembolso', etapa: 'Desembolso', descripcion: 'Trabajar etapa Desembolso (egreso y fondeo)', match: (k: string) => k.includes('DESEMBOLS') }
] as const;

export type PermisoEtapa = (typeof PERMISOS_ETAPA)[number]['code'];

export function permisoDeEtapa(nombreEtapa: string) {
  const key = normalizeStage(nombreEtapa);
  return PERMISOS_ETAPA.find((p) => p.match(key)) ?? null;
}

export function assertPermisoEtapa(permisos: string[] | undefined, nombreEtapa: string) {
  const permiso = permisoDeEtapa(nombreEtapa);
  if (permiso && !permisos?.includes(permiso.code)) {
    throw new SecurityError(`Tu rol no tiene permiso para trabajar la etapa ${permiso.etapa}`, 403);
  }
}

/**
 * Creates missing permissions in one transaction. Each permission created now is granted to every role
 * that already has `copiarDe`, so nobody loses access on upgrade; later removals in Roles are respected.
 */
export async function sembrarPermisos(permisos: ReadonlyArray<{ code: string; descripcion: string }>, copiarDe: string) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const permiso of permisos) {
      const existe = await client.query('select 1 from "Creditos"."TBL_PERMISOS" where lower(v_nom_permiso) = lower($1)', [permiso.code]);
      if (existe.rowCount) continue;
      const creado = await client.query<{ id_permiso: number }>(
        'insert into "Creditos"."TBL_PERMISOS" (v_nom_permiso, v_desc_rol, fec_creacion) values ($1, $2, now()) returning id_permiso',
        [permiso.code, permiso.descripcion]
      );
      await client.query(
        `insert into "Creditos"."TBL_ROL_SUBMODULO_PERMISO" (v_nom_submodulo, id_rol, id_sub_modulo, id_estado, id_permiso)
         select distinct rsp.v_nom_submodulo, rsp.id_rol, rsp.id_sub_modulo, rsp.id_estado, $1::int
         from "Creditos"."TBL_ROL_SUBMODULO_PERMISO" rsp
         inner join "Creditos"."TBL_PERMISOS" p on p.id_permiso = rsp.id_permiso
         where p.v_nom_permiso = $2`,
        [creado.rows[0].id_permiso, copiarDe]
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

let semillaLista: Promise<void> | null = null;
export function ensurePermisosEtapa() {
  semillaLista ??= sembrarPermisos(PERMISOS_ETAPA, 'creditos:create').catch((err) => { semillaLista = null; throw err; });
  return semillaLista;
}

/** Route preHandler: 403 naming the stage when the user's roles lack its permission. */
export function requirePermisoEtapa(code: PermisoEtapa) {
  const etapa = PERMISOS_ETAPA.find((p) => p.code === code)!.etapa;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as JwtUserPayload | undefined;
    if (!user?.permissions?.includes(code)) {
      return reply.code(403).send({ message: `Tu rol no tiene permiso para trabajar la etapa ${etapa}` });
    }
  };
}
