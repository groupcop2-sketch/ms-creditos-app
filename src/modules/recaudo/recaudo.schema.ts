import { pool } from '../../lib/db.js';
import { sembrarPermisos } from '../creditos/permisos-etapa.js';

// descripcion: max 50 chars (TBL_PERMISOS.v_desc_rol is varchar(50)).
export const PERMISOS_RECAUDO = [
  { code: 'recaudo:read', descripcion: 'Ver cuentas de cobro, lotes y cierres' },
  { code: 'recaudo:cobro', descripcion: 'Generar y enviar cuentas de cobro' },
  { code: 'recaudo:aplicar', descripcion: 'Cargar y aplicar archivos de pago' },
  { code: 'recaudo:config', descripcion: 'Configurar formatos de archivo por empresa' },
  { code: 'recaudo:cierre', descripcion: 'Cerrar y reabrir el mes de recaudo' }
] as const;
export type PermisoRecaudo = (typeof PERMISOS_RECAUDO)[number]['code'];

const DDL = `
create table if not exists "Creditos"."TBL_RECAUDO_PLANTILLAS" (
  id_plantilla serial primary key,
  id_empresa integer not null unique references "Creditos"."TBL_EMPRESAS"(id_empresa),
  separador varchar(5) not null default ';',
  fila_encabezado integer not null default 1,
  mapeo jsonb not null default '{}'::jsonb,
  novedades jsonb not null default '{}'::jsonb,
  archivo_ejemplo text null,
  id_usuario integer null,
  fec_actualizacion timestamp without time zone not null default now()
);
create sequence if not exists "Creditos".seq_cuenta_cobro;
create table if not exists "Creditos"."TBL_CUENTAS_COBRO" (
  id_cuenta_cobro serial primary key,
  consecutivo varchar(20) not null unique,
  id_empresa integer not null references "Creditos"."TBL_EMPRESAS"(id_empresa),
  periodo char(7) not null,
  fecha_emision date not null default current_date,
  fecha_pago_nomina date not null,
  fecha_limite_giro date not null,
  total numeric(18,2) not null default 0,
  recibido numeric(18,2) not null default 0,
  estado varchar(30) not null default 'GENERADA',
  id_cuenta_egreso integer null,
  envios integer not null default 0,
  fecha_ultimo_envio timestamp without time zone null,
  correo_ultimo_envio varchar(200) null,
  motivo_anulacion text null,
  id_usuario integer null,
  fec_creacion timestamp without time zone not null default now()
);
create unique index if not exists ux_cuentas_cobro_empresa_periodo on "Creditos"."TBL_CUENTAS_COBRO"(id_empresa, periodo) where estado <> 'ANULADA';
create table if not exists "Creditos"."TBL_CUENTA_COBRO_DETALLE" (
  id_detalle serial primary key,
  id_cuenta_cobro integer not null references "Creditos"."TBL_CUENTAS_COBRO"(id_cuenta_cobro) on delete cascade,
  id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito),
  id_credito_cuota integer null,
  identificacion varchar(30) not null,
  nombre varchar(200) not null,
  consecutivo_credito varchar(40) not null,
  numero_cuota integer not null,
  total_cuotas integer not null,
  cuotas_pendientes integer not null default 1,
  valor_cuota numeric(18,2) not null,
  mora numeric(18,2) not null default 0,
  total numeric(18,2) not null,
  saldo_capital numeric(18,2) not null default 0
);
create index if not exists ix_cuenta_cobro_detalle_cuenta on "Creditos"."TBL_CUENTA_COBRO_DETALLE"(id_cuenta_cobro);
create table if not exists "Creditos"."TBL_RECAUDO_LOTES" (
  id_lote serial primary key,
  id_empresa integer not null references "Creditos"."TBL_EMPRESAS"(id_empresa),
  id_cuenta_cobro integer not null references "Creditos"."TBL_CUENTAS_COBRO"(id_cuenta_cobro),
  periodo char(7) not null,
  nombre_archivo varchar(200) null,
  archivo bytea not null,
  hash varchar(64) not null,
  fecha_giro date not null,
  valor_girado numeric(18,2) not null,
  total_archivo numeric(18,2) not null,
  total_aplicado numeric(18,2) not null default 0,
  filas integer not null default 0,
  pagos integer not null default 0,
  estado varchar(20) not null default 'APLICADO',
  motivo_reverso text null,
  id_usuario integer null,
  id_usuario_reverso integer null,
  fec_creacion timestamp without time zone not null default now(),
  fecha_reverso timestamp without time zone null
);
create unique index if not exists ux_recaudo_lote_hash on "Creditos"."TBL_RECAUDO_LOTES"(hash) where estado = 'APLICADO';
create unique index if not exists ux_recaudo_lote_cuenta on "Creditos"."TBL_RECAUDO_LOTES"(id_cuenta_cobro) where estado = 'APLICADO';
create table if not exists "Creditos"."TBL_RECAUDO_LOTE_FILAS" (
  id_lote_fila serial primary key,
  id_lote integer not null references "Creditos"."TBL_RECAUDO_LOTES"(id_lote) on delete cascade,
  fila integer null,
  datos jsonb null,
  identificacion varchar(30) not null,
  nombre varchar(200) null,
  valor numeric(18,2) not null default 0,
  cobrado numeric(18,2) null,
  novedad varchar(40) null,
  id_credito integer null,
  resultado varchar(20) not null,
  detalle text null,
  id_credito_pago integer null,
  resuelta boolean not null default false,
  revisada boolean not null default false
);
create index if not exists ix_recaudo_lote_filas_lote on "Creditos"."TBL_RECAUDO_LOTE_FILAS"(id_lote);
create table if not exists "Creditos"."TBL_RECAUDO_CIERRES" (
  id_cierre serial primary key,
  periodo char(7) not null unique,
  estado varchar(20) not null,
  totales jsonb not null default '{}'::jsonb,
  fecha_cierre timestamp without time zone not null default now(),
  id_usuario integer null,
  motivo_reapertura text null,
  fecha_reapertura timestamp without time zone null,
  id_usuario_reapertura integer null
);
create table if not exists "Creditos"."TBL_RECAUDO_CIERRE_CARTERA" (
  id_cierre_cartera serial primary key,
  id_cierre integer not null references "Creditos"."TBL_RECAUDO_CIERRES"(id_cierre) on delete cascade,
  id_credito integer not null,
  id_empresa integer null,
  saldo_capital numeric(18,2) not null default 0,
  saldo_pendiente numeric(18,2) not null default 0,
  cuotas_vencidas integer not null default 0,
  dias_mora integer not null default 0,
  rango_mora varchar(10) not null
);
`;

let listo: Promise<void> | null = null;
/** Additive only: new tables, indexes and permissions. Runs once per process. */
export function ensureRecaudo() {
  listo ??= (async () => {
    await pool.query(DDL);
    await sembrarPermisos(PERMISOS_RECAUDO, 'creditos:create');
  })().catch((err) => { listo = null; throw err; });
  return listo;
}
