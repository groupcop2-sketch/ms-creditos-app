import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

/**
 * Company bank accounts used as "medio de pago" for disbursements, plus the automatic
 * egress consecutive (CE-000001) stamped on every disbursement.
 */
let schemaLista: Promise<void> | null = null;
export function ensureEgresosSchema(ensureDesembolsosTable: () => Promise<void>) {
  schemaLista ??= (async () => {
    await pool.query(`
      create table if not exists "Creditos"."TBL_CUENTAS_EGRESO" (
        id_cuenta_egreso serial primary key,
        banco varchar(180) not null,
        tipo_cuenta varchar(40) not null,
        numero_cuenta varchar(60) not null,
        titular varchar(200) null,
        activo boolean not null default true,
        fec_creacion timestamp without time zone not null default now(),
        unique (banco, numero_cuenta)
      )
    `);
    await pool.query('create sequence if not exists "Creditos".seq_comprobante_egreso');
    await ensureDesembolsosTable();
    const cols = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'Creditos' and table_name = 'TBL_CREDITO_DESEMBOLSOS'
         and column_name in ('numero_egreso', 'id_cuenta_egreso', 'medio_pago', 'fecha_consignacion')`
    );
    // ALTER takes an exclusive lock even when nothing changes; only run it when a column is missing.
    if (cols.rowCount !== 4) {
      await pool.query(`
        alter table "Creditos"."TBL_CREDITO_DESEMBOLSOS"
          add column if not exists numero_egreso varchar(20) null unique,
          add column if not exists id_cuenta_egreso integer null references "Creditos"."TBL_CUENTAS_EGRESO"(id_cuenta_egreso),
          add column if not exists medio_pago varchar(260) null,
          add column if not exists fecha_consignacion date null
      `);
    }
  })().catch((err) => { schemaLista = null; throw err; });
  return schemaLista;
}

export const formatNumeroEgreso = (n: number) => `CE-${String(n).padStart(6, '0')}`;

type CuentaRow = { id_cuenta_egreso: number; banco: string; tipo_cuenta: string; numero_cuenta: string; titular: string | null; activo: boolean };
const mapCuenta = (r: CuentaRow) => ({
  id: r.id_cuenta_egreso,
  banco: r.banco,
  tipoCuenta: r.tipo_cuenta,
  numeroCuenta: r.numero_cuenta,
  titular: r.titular,
  activo: r.activo,
  etiqueta: `${r.banco} - ${r.tipo_cuenta} ${r.numero_cuenta}`
});

export async function listCuentasEgreso(soloActivas = false) {
  const result = await pool.query<CuentaRow>(
    `select * from "Creditos"."TBL_CUENTAS_EGRESO" ${soloActivas ? 'where activo' : ''} order by activo desc, banco, numero_cuenta`
  );
  return result.rows.map(mapCuenta);
}

export type CuentaEgresoInput = { banco: string; tipoCuenta: string; numeroCuenta: string; titular?: string | null; activo?: boolean };

export async function guardarCuentaEgreso(input: CuentaEgresoInput, id?: number) {
  const values = [input.banco.trim(), input.tipoCuenta.trim(), input.numeroCuenta.replace(/\s+/g, ''), input.titular?.trim() || null, input.activo ?? true];
  try {
    const result = id
      ? await pool.query<CuentaRow>(
          `update "Creditos"."TBL_CUENTAS_EGRESO" set banco=$1, tipo_cuenta=$2, numero_cuenta=$3, titular=$4, activo=$5
           where id_cuenta_egreso = $6 returning *`, [...values, id])
      : await pool.query<CuentaRow>(
          `insert into "Creditos"."TBL_CUENTAS_EGRESO" (banco, tipo_cuenta, numero_cuenta, titular, activo)
           values ($1,$2,$3,$4,$5) returning *`, values);
    if (!result.rowCount) throw new SecurityError('Cuenta no encontrada', 404);
    return mapCuenta(result.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new SecurityError('Esa cuenta ya está registrada', 409);
    throw err;
  }
}

/** Preview only: the real number is taken with nextval inside the disbursement transaction. */
export async function siguienteNumeroEgreso() {
  const r = await pool.query<{ last_value: string; is_called: boolean }>('select last_value, is_called from "Creditos".seq_comprobante_egreso');
  const last = Number(r.rows[0].last_value);
  return { numeroEgreso: formatNumeroEgreso(r.rows[0].is_called ? last + 1 : last) };
}
