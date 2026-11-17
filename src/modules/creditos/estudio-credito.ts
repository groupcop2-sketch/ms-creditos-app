import type { ClientLike } from '../../lib/db.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
import { assertEtapaAbierta, esEtapaEstudio } from './soportes-cliente.js';

export type TipoEstudio = 'LIBRANZA' | 'LIBRE_INVERSION';

export type VariablesEstudio = {
  // Libranza
  salario?: number;
  aportesLey?: number;
  deduccionesNomina?: number;
  // Libre inversión
  ingresosDemostrables?: number;
  obligacionesCentrales?: number;
};

export type ResultadoEstudio = {
  netoBase: number;
  minimoVariable: number | null;
  disponible: number;
  cuotaMaxima: number;
};

export const PORCENTAJE_ESTUDIO_DEFECTO = 70;

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: number | undefined) => (Number.isFinite(value) ? Number(value) : 0);

/**
 * Libranza:        (salario - aportes de ley) / 2 = mínimo variable; mínimo variable - deducciones de nómina = disponible.
 * Libre inversión: (ingresos demostrables - obligaciones en centrales) / 2 = disponible.
 * Cuota máxima = disponible (nunca negativo) × porcentaje / 100.
 */
export function calcularEstudio(tipo: TipoEstudio, variables: VariablesEstudio, porcentaje: number): ResultadoEstudio {
  if (!(porcentaje > 0 && porcentaje <= 100)) throw new SecurityError('El porcentaje debe estar entre 1 y 100', 400);

  if (tipo === 'LIBRANZA') {
    const netoBase = num(variables.salario) - num(variables.aportesLey);
    const minimoVariable = netoBase / 2;
    const disponible = minimoVariable - num(variables.deduccionesNomina);
    return {
      netoBase: round2(netoBase),
      minimoVariable: round2(minimoVariable),
      disponible: round2(disponible),
      cuotaMaxima: round2((Math.max(0, disponible) * porcentaje) / 100)
    };
  }

  const netoBase = num(variables.ingresosDemostrables) - num(variables.obligacionesCentrales);
  const disponible = netoBase / 2;
  return {
    netoBase: round2(netoBase),
    minimoVariable: null,
    disponible: round2(disponible),
    cuotaMaxima: round2((Math.max(0, disponible) * porcentaje) / 100)
  };
}

let estudiosTablaLista = false;
export async function ensureCreditoEstudiosTable(client: { query: (text: string) => Promise<unknown> } = pool) {
  if (estudiosTablaLista) return;
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_ESTUDIOS" (
      id_credito_estudio serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      tipo_estudio varchar(30) not null,
      variables jsonb not null,
      porcentaje numeric(6,2) not null,
      neto_base numeric(18,2) not null,
      minimo_variable numeric(18,2) null,
      disponible numeric(18,2) not null,
      cuota_maxima numeric(18,2) not null,
      cuota_solicitada numeric(18,2) null,
      viable boolean not null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
  estudiosTablaLista = true;
}

type EstudioRow = {
  id_credito_estudio: number;
  tipo_estudio: TipoEstudio;
  variables: VariablesEstudio;
  porcentaje: string;
  neto_base: string;
  minimo_variable: string | null;
  disponible: string;
  cuota_maxima: string;
  cuota_solicitada: string | null;
  viable: boolean;
  observacion: string | null;
  usuario: string | null;
  fec_creacion: string;
};

const toNumberOrNull = (value: string | null) => (value == null ? null : Number(value));

function mapEstudio(row: EstudioRow) {
  return {
    id: row.id_credito_estudio,
    tipo: row.tipo_estudio,
    variables: row.variables,
    porcentaje: Number(row.porcentaje),
    netoBase: Number(row.neto_base),
    minimoVariable: toNumberOrNull(row.minimo_variable),
    disponible: Number(row.disponible),
    cuotaMaxima: Number(row.cuota_maxima),
    cuotaSolicitada: toNumberOrNull(row.cuota_solicitada),
    viable: row.viable,
    observacion: row.observacion,
    usuario: row.usuario,
    fecha: row.fec_creacion
  };
}

export async function listCreditoEstudios(creditoId: number) {
  await ensureCreditoEstudiosTable();
  const result = await pool.query<EstudioRow>(
    `select e.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
     from "Creditos"."TBL_CREDITO_ESTUDIOS" e
     left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = e.id_usuario
     where e.id_credito = $1
     order by e.fec_creacion desc, e.id_credito_estudio desc`,
    [creditoId]
  );
  return result.rows.map(mapEstudio);
}

export async function registrarEstudioCredito(
  creditoId: number,
  input: { tipo: TipoEstudio; variables: VariablesEstudio; porcentaje?: number; observacion?: string | null; usuarioId?: number | null }
) {
  await ensureCreditoEstudiosTable();
  const credito = await pool.query<{ val_cuota_estimada: string | null }>(
    'select val_cuota_estimada from "Creditos"."TBL_CREDITOS" where id_credito = $1',
    [creditoId]
  );
  if (!credito.rowCount) throw new SecurityError('Credito no encontrado', 404);
  await assertEtapaAbierta(creditoId, esEtapaEstudio, 'registrar otro estudio');

  const porcentaje = input.porcentaje ?? PORCENTAJE_ESTUDIO_DEFECTO;
  // Recalculated here: the server never trusts totals sent by the browser.
  const resultado = calcularEstudio(input.tipo, input.variables, porcentaje);
  const cuotaSolicitada = toNumberOrNull(credito.rows[0].val_cuota_estimada);
  const viable = cuotaSolicitada == null ? resultado.cuotaMaxima > 0 : cuotaSolicitada <= resultado.cuotaMaxima;

  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_ESTUDIOS" (
      id_credito, tipo_estudio, variables, porcentaje, neto_base, minimo_variable, disponible,
      cuota_maxima, cuota_solicitada, viable, observacion, id_usuario
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      creditoId,
      input.tipo,
      JSON.stringify(input.variables),
      porcentaje,
      resultado.netoBase,
      resultado.minimoVariable,
      resultado.disponible,
      resultado.cuotaMaxima,
      cuotaSolicitada,
      viable,
      input.observacion?.trim() || null,
      input.usuarioId ?? null
    ]
  );

  return listCreditoEstudios(creditoId);
}

export async function hasEstudioCredito(client: ClientLike, creditoId: number) {
  await ensureCreditoEstudiosTable(client);
  const result = await client.query<{ total: number }>(
    'select count(*)::int as total from "Creditos"."TBL_CREDITO_ESTUDIOS" where id_credito = $1',
    [creditoId]
  );
  return Number(result.rows[0]?.total ?? 0) > 0;
}
