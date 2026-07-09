import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

interface CatalogRow {
  id: number;
  nombre: string;
}

export interface CreateCreditoInput {
  idProductoCredito: number;
  idLibranzera?: number | null;
  idEmpresa?: number | null;
  idEmpleadoEmpresa?: number | null;
  idComercial?: number | null;
  identificacionCliente: string;
  nombreCliente: string;
  correoCliente?: string | null;
  telefonoCliente?: string | null;
  montoSolicitado: number;
  plazo: number;
  tasa?: number | null;
}

export interface SimularCreditoInput {
  idProductoCredito: number;
  montoSolicitado: number;
  plazo: number;
  tasa?: number | null;
}

interface CreditoRow {
  id_credito: number;
  consecutivo: string;
  id_producto_credito: number;
  producto: string;
  tipo_credito: string;
  id_libranzera: number | null;
  libranzera: string | null;
  id_empresa: number | null;
  empresa: string | null;
  id_empleado_empresa: number | null;
  empleado: string | null;
  id_comercial: number | null;
  comercial: string | null;
  v_identificacion_cliente: string;
  v_nombre_cliente: string;
  v_correo_cliente: string | null;
  v_telefono_cliente: string | null;
  val_monto_solicitado: string;
  num_plazo: number;
  tipo_tasa: string | null;
  val_tasa: string | null;
  val_cuota_estimada: string | null;
  estado: string | null;
  fec_radicacion: Date;
  documentos: number;
  etapas: number;
}

interface DocumentoCreditoRow {
  id_credito_documento: number;
  id_credito: number;
  documento: string;
  obligatorio: boolean;
  aplica_a: string;
  prioridad: number;
  requiere_firma: boolean;
  requiere_validacion: boolean;
  estado_documento: string;
  v_archivo_url: string | null;
  archivo_nombre: string | null;
  archivo_mime: string | null;
  archivo_tamano: number | null;
}

interface EtapaCreditoRow {
  id_credito_etapa: number;
  id_credito?: number;
  etapa: string;
  orden: number;
  obligatoria: boolean;
  permite_devolucion: boolean;
  responsable: string | null;
  sla_horas: number | null;
  estado_etapa: string;
  fec_inicio: Date | null;
  fec_fin: Date | null;
}

interface HistorialCreditoRow {
  id_credito_historial: number;
  accion: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  observacion: string | null;
  usuario: string | null;
  fec_creacion: Date;
}

interface LiquidacionCreditoRow {
  id_credito_liquidacion: number;
  nombre: string;
  tipo_atributo: string | null;
  tipo_calculo: string | null;
  valor: string | null;
  porcentaje: string | null;
  valor_calculado: string | null;
  aplica_iva: boolean;
}

interface DecisionCreditoRow {
  id_credito_decision: number;
  decision: string;
  monto_aprobado: string | null;
  plazo_aprobado: number | null;
  tasa_aprobada: string | null;
  cuota_aprobada: string | null;
  observacion: string | null;
  usuario: string | null;
  fec_creacion: Date;
}

interface DesembolsoCreditoRow {
  id_credito_desembolso: number;
  valor_desembolso: string;
  fecha_desembolso: string;
  banco_destino: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  referencia_pago: string | null;
  observacion: string | null;
  usuario: string | null;
  fec_creacion: Date;
}

interface FondeoCreditoRow {
  id_credito_fondeo: number;
  id_inversion: number;
  id_inversionista: number;
  inversionista: string;
  valor_asignado: string;
  fecha_asignacion: string;
  observacion: string | null;
  usuario: string | null;
}

interface CreditoCuotaRow {
  id_credito_cuota: number;
  numero_cuota: number;
  fecha_corte: string;
  fecha_pago_oportuno: string;
  fecha_vencimiento: string;
  saldo_inicial: string;
  capital: string;
  interes: string;
  cargos: string;
  valor_cuota: string;
  saldo_final: string;
  capital_pagado: string;
  interes_pagado: string;
  cargos_pagados: string;
  mora_pagada: string;
  valor_pagado: string;
  dias_mora: number;
  valor_mora: string;
  fecha_ultimo_pago: string | null;
  estado: string;
  periodicidad: string;
  observacion: string | null;
}

interface CreditoPagoRow {
  id_credito_pago: number;
  fecha_pago: string;
  valor_pago: string;
  saldo_favor: string;
  medio_pago: string | null;
  referencia_pago: string | null;
  observacion: string | null;
  usuario: string | null;
  soportes: number;
  soporte_nombre: string | null;
  soporte_mime_type: string | null;
  fec_creacion: Date;
}

interface CreditoPagoSoporteFileRow {
  nombre_archivo: string;
  mime_type: string;
  contenido: Buffer;
}

interface FondeoDisponibleRow {
  id_inversion: number;
  id_inversionista: number;
  inversionista: string;
  fecha_inversion: string;
  monto_inversion: string;
  monto_asignado: string;
  saldo_disponible: string;
  tasa: string;
  plazo: number;
}

interface InversionFondeoRow {
  id_inversion: number;
  saldo_disponible: string;
  inversionista: string;
}

interface PerfilClienteCreditoRow {
  id_cliente_portal: number | null;
  portal_nombre: string | null;
  portal_correo: string | null;
  portal_telefono: string | null;
  portal_cargo: string | null;
  portal_fecha_ingreso: string | null;
  portal_salario: string | null;
  portal_neto: string | null;
  portal_tiene_embargos: boolean | null;
  portal_correo_confirmado: boolean | null;
  portal_tipo_contrato: string | null;
  empleado_nombre: string | null;
  empleado_cargo: string | null;
  empleado_salario: string | null;
  empleado_banco: string | null;
  empleado_tipo_cuenta: string | null;
  empleado_cuenta_nomina: string | null;
  empleado_estado_civil: string | null;
  empleado_personas_cargo: number | null;
  empleado_tipo_vivienda: string | null;
  empresa_nit: string | null;
  empresa_razon_social: string | null;
  empresa_codigo: string | null;
  empresa_correo: string | null;
  empresa_telefono: string | null;
  empresa_representante: string | null;
}

interface CalendarioCreditoRow {
  producto_periodicidad: string | null;
  producto_dia_corte: number | null;
  producto_dia_pago_oportuno: number | null;
  producto_ajustar_fin_semana: boolean | null;
  producto_mora_despues_vencimiento: number | null;
  producto_tasa_mora_mensual: string | null;
  producto_primera_cuota_mes_siguiente: boolean | null;
  producto_observacion_calendario: string | null;
  empresa_periodicidad_nomina: string | null;
  empresa_dia_corte_nomina: number | null;
  empresa_dia_pago_nomina: number | null;
  empresa_segundo_dia_pago_nomina: number | null;
  empresa_dia_descuento_libranza: number | null;
  empresa_ajustar_fin_semana: boolean | null;
  empresa_observacion_calendario: string | null;
}

export interface UpdateCreditoEtapaInput {
  estado: 'EN_PROCESO' | 'APROBADA' | 'DEVUELTA' | 'RECHAZADA';
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface DecideCreditoInput {
  decision: 'APROBADO' | 'RECHAZADO' | 'DEVUELTO';
  montoAprobado?: number | null;
  plazoAprobado?: number | null;
  tasaAprobada?: number | null;
  cuotaAprobada?: number | null;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface RegistrarDesembolsoInput {
  valorDesembolso: number;
  fechaDesembolso: string;
  fechaPrimeraCuota?: string | null;
  diaCorte?: number | null;
  diaPagoOportuno?: number | null;
  periodicidad?: 'MENSUAL' | 'QUINCENAL' | null;
  ajustarFinSemana?: boolean | null;
  moraDespuesVencimiento?: number | null;
  observacionCalendario?: string | null;
  idInversion?: number | null;
  valorFondeo?: number | null;
  bancoDestino?: string | null;
  tipoCuenta?: string | null;
  numeroCuenta?: string | null;
  referenciaPago?: string | null;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface AsignarFondeoInput {
  idInversion: number;
  valorAsignado: number;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface RegistrarPagoInput {
  fechaPago: string;
  valorPago: number;
  medioPago?: string | null;
  referenciaPago?: string | null;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface UpdateCreditoDocumentoInput {
  estado: 'PENDIENTE' | 'CARGADO' | 'APROBADO' | 'RECHAZADO';
  archivoUrl?: string | null;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface UploadCreditoDocumentoInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface UploadCreditoPagoSoporteInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
  observacion?: string | null;
  usuarioId?: number | null;
}

interface SimulacionProductoRow {
  id_producto_credito: number;
  nombre: string;
  tipo_tasa: string | null;
  monto_minimo: string | null;
  monto_maximo: string | null;
  plazo_minimo: number | null;
  plazo_maximo: number | null;
}

interface SimulacionAtributoRow {
  id_producto_atributo: number;
  nombre: string;
  tipo_atributo: string;
  tipo_calculo: string;
  valor: string | null;
  porcentaje: string | null;
  minimo: string | null;
  maximo: string | null;
  aplica_iva: boolean;
  obligatorio: boolean;
  prioridad: number;
}

interface AmortizacionDbRow {
  cuota_numero: number | null;
  cuota: string;
  interes: string;
  abono: string;
  saldo: string;
}

async function withClient<T>(runner: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function nullableNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function isDocumentationStage(value: string) {
  const key = normalizeKey(value);
  return key.includes('DOCUMENT') || key.includes('SOPORTE') || key.includes('FIRMA');
}

function isApprovalStage(value: string) {
  const key = normalizeKey(value);
  return key.includes('APROB') || key.includes('COMITE') || key.includes('ANALISIS') || key.includes('ESTUDIO');
}

function isSignatureStage(value: string) {
  const key = normalizeKey(value);
  return key.includes('FIRMA') || key.includes('LEGALIZ');
}

function isDisbursementStage(value: string) {
  const key = normalizeKey(value);
  return key.includes('DESEMBOL');
}

function calculateInstallment(principal: number, monthlyRate: number, months: number) {
  if (monthlyRate <= 0) return principal / months;
  return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

async function getActiveStateId(client: PoolClient) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );
  return result.rows[0]?.id_estado ?? null;
}

async function ensureCreditoHistorialTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_HISTORIAL" (
      id_credito_historial serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_credito_etapa integer null references "Creditos"."TBL_CREDITO_ETAPAS"(id_credito_etapa) on delete set null,
      accion varchar(80) not null,
      estado_anterior varchar(40) null,
      estado_nuevo varchar(40) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function ensureCreditoDocumentoArchivosTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS" (
      id_credito_documento_archivo serial primary key,
      id_credito_documento integer not null references "Creditos"."TBL_CREDITO_DOCUMENTOS"(id_credito_documento) on delete cascade,
      nombre_archivo varchar(240) not null,
      mime_type varchar(120) not null,
      tamano_bytes integer not null,
      contenido bytea not null,
      hash_archivo varchar(64) not null,
      id_usuario integer null,
      observacion text null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function ensureCreditoDecisionesTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_DECISIONES" (
      id_credito_decision serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      decision varchar(40) not null,
      monto_aprobado numeric(18,2) null,
      plazo_aprobado integer null,
      tasa_aprobada numeric(10,4) null,
      cuota_aprobada numeric(18,2) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function ensureCreditoFirmasTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_FIRMAS" (
      id_credito_firma serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_documento_generado integer not null references "Creditos"."TBL_DOCUMENTOS_GENERADOS"(id_documento_generado) on delete cascade,
      proveedor varchar(40) not null default 'ZAPSIGN',
      external_document_id varchar(180) null,
      sign_url text null,
      estado varchar(40) not null default 'PENDIENTE',
      firmante_nombre varchar(220) not null,
      firmante_correo varchar(180) null,
      firmante_telefono varchar(80) null,
      nombre_archivo_firmado varchar(240) null,
      pdf_firmado bytea null,
      certificado_pdf bytea null,
      hash_firmado varchar(64) null,
      webhook_payload jsonb null,
      error_mensaje text null,
      id_usuario integer null,
      fec_envio timestamp without time zone null,
      fec_firma timestamp without time zone null,
      fec_creacion timestamp without time zone not null default now(),
      fec_actualizacion timestamp without time zone null
    )
  `);
}

async function ensureCreditoDesembolsosTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_DESEMBOLSOS" (
      id_credito_desembolso serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      valor_desembolso numeric(18,2) not null,
      fecha_desembolso date not null,
      banco_destino varchar(180) null,
      tipo_cuenta varchar(80) null,
      numero_cuenta varchar(80) null,
      referencia_pago varchar(160) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function ensureCreditoCuotasTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_CUOTAS" (
      id_credito_cuota serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      numero_cuota integer not null,
      fecha_corte date not null,
      fecha_pago_oportuno date not null,
      fecha_vencimiento date not null,
      saldo_inicial numeric(18,2) not null,
      capital numeric(18,2) not null,
      interes numeric(18,2) not null,
      cargos numeric(18,2) not null default 0,
      valor_cuota numeric(18,2) not null,
      saldo_final numeric(18,2) not null,
      estado varchar(30) not null default 'PENDIENTE',
      periodicidad varchar(20) not null default 'MENSUAL',
      observacion text null,
      fec_creacion timestamp without time zone not null default now(),
      unique (id_credito, numero_cuota)
    )
  `);
  await client.query(`
    alter table "Creditos"."TBL_CREDITO_CUOTAS"
      add column if not exists capital_pagado numeric(18,2) not null default 0,
      add column if not exists interes_pagado numeric(18,2) not null default 0,
      add column if not exists cargos_pagados numeric(18,2) not null default 0,
      add column if not exists mora_pagada numeric(18,2) not null default 0,
      add column if not exists valor_pagado numeric(18,2) not null default 0,
      add column if not exists dias_mora integer not null default 0,
      add column if not exists valor_mora numeric(18,2) not null default 0,
      add column if not exists fecha_ultimo_pago date null
  `);
}

async function ensureCreditoPagosTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_PAGOS" (
      id_credito_pago serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      fecha_pago date not null,
      valor_pago numeric(18,2) not null,
      saldo_favor numeric(18,2) not null default 0,
      medio_pago varchar(80) null,
      referencia_pago varchar(160) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now(),
      constraint chk_credito_pago_valor check (valor_pago > 0)
    )
  `);
  await client.query(`
    alter table "Creditos"."TBL_CREDITO_PAGOS"
      add column if not exists saldo_favor numeric(18,2) not null default 0
  `);
}

async function ensureCreditoPagoSoportesTable(client: PoolClient) {
  await ensureCreditoPagosTable(client);
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_PAGO_SOPORTES" (
      id_credito_pago_soporte serial primary key,
      id_credito_pago integer not null references "Creditos"."TBL_CREDITO_PAGOS"(id_credito_pago) on delete cascade,
      nombre_archivo varchar(240) not null,
      mime_type varchar(120) not null,
      tamano_bytes integer not null,
      contenido bytea not null,
      hash_archivo varchar(64) not null,
      id_usuario integer null,
      observacion text null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function ensureCalendarioParamColumns(client: PoolClient) {
  await client.query(`
    alter table "Creditos"."TBL_PRODUCTOS_CREDITO"
      add column if not exists periodicidad varchar(20) null,
      add column if not exists dia_corte integer null,
      add column if not exists dia_pago_oportuno integer null,
      add column if not exists ajustar_fin_semana boolean null,
      add column if not exists mora_despues_vencimiento integer null,
      add column if not exists tasa_mora_mensual numeric(8,4) null,
      add column if not exists primera_cuota_mes_siguiente boolean null,
      add column if not exists observacion_calendario text null
  `);
  await client.query(`
    alter table "Creditos"."TBL_EMPRESAS"
      add column if not exists periodicidad_nomina varchar(20) null,
      add column if not exists dia_corte_nomina integer null,
      add column if not exists dia_pago_nomina integer null,
      add column if not exists segundo_dia_pago_nomina integer null,
      add column if not exists dia_descuento_libranza integer null,
      add column if not exists ajustar_fin_semana boolean null,
      add column if not exists observacion_calendario text null
  `);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateWithDay(base: Date, day: number) {
  const safeDay = Math.min(day, lastDayOfMonth(base.getFullYear(), base.getMonth()));
  return new Date(base.getFullYear(), base.getMonth(), safeDay);
}

function addPeriods(base: Date, index: number, periodicidad: 'MENSUAL' | 'QUINCENAL') {
  if (periodicidad === 'QUINCENAL') {
    const date = new Date(base);
    date.setDate(date.getDate() + (index * 15));
    return date;
  }
  return new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
}

function adjustWeekend(value: Date, enabled: boolean) {
  if (!enabled) return value;
  const adjusted = new Date(value);
  if (adjusted.getDay() === 6) adjusted.setDate(adjusted.getDate() + 2);
  if (adjusted.getDay() === 0) adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}

function diffDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.floor((endUtc - startUtc) / 86400000));
}

async function recalcularMoraCredito(client: PoolClient, creditoId: number) {
  await ensureCreditoCuotasTable(client);
  await ensureCalendarioParamColumns(client);

  const config = await client.query<{ tasa_mora_mensual: string | null; mora_despues_vencimiento: number | null }>(
    `select p.tasa_mora_mensual, p.mora_despues_vencimiento
     from "Creditos"."TBL_CREDITOS" c
     left join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
     where c.id_credito = $1
     limit 1`,
    [creditoId]
  );
  const tasaMoraMensual = Number(config.rows[0]?.tasa_mora_mensual ?? 2);
  const diasGraciaMora = Number(config.rows[0]?.mora_despues_vencimiento ?? 0);
  const today = parseLocalDate(formatLocalDate(new Date()));

  const cuotas = await client.query<CreditoCuotaRow>(
    `select *
     from "Creditos"."TBL_CREDITO_CUOTAS"
     where id_credito = $1
     order by numero_cuota`,
    [creditoId]
  );

  for (const cuota of cuotas.rows) {
    if (cuota.estado === 'PAGADA') {
      await client.query(
        `update "Creditos"."TBL_CREDITO_CUOTAS"
         set dias_mora = 0, valor_mora = 0
         where id_credito_cuota = $1`,
        [cuota.id_credito_cuota]
      );
      continue;
    }

    const vencimiento = parseLocalDate(cuota.fecha_vencimiento);
    const pagoOportuno = parseLocalDate(cuota.fecha_pago_oportuno);
    const diasVencidos = diffDays(vencimiento, today);
    const diasMora = Math.max(0, diasVencidos - diasGraciaMora);
    const valorPagadoSinMora = Math.max(0, Number(cuota.valor_pagado) - Number(cuota.mora_pagada));
    const baseMora = Math.max(0, Number(cuota.valor_cuota) - valorPagadoSinMora);
    const valorMora = diasMora > 0 ? roundMoney(baseMora * (tasaMoraMensual / 100) / 30 * diasMora) : 0;
    const tieneAbono = Number(cuota.valor_pagado) > 0;
    const estado = diasMora > 0
      ? 'EN_MORA'
      : today > pagoOportuno
        ? 'VENCIDA'
        : tieneAbono
          ? 'ABONO_PARCIAL'
          : 'PENDIENTE';

    await client.query(
      `update "Creditos"."TBL_CREDITO_CUOTAS"
       set dias_mora = $2,
           valor_mora = $3,
           estado = $4
       where id_credito_cuota = $1`,
      [cuota.id_credito_cuota, diasMora, valorMora, estado]
    );
  }

  const saldo = await client.query<{ saldo: string }>(
    `select coalesce(sum(valor_cuota + valor_mora - valor_pagado), 0)::numeric as saldo
     from "Creditos"."TBL_CREDITO_CUOTAS"
     where id_credito = $1`,
    [creditoId]
  );
  await client.query(
    `update "Creditos"."TBL_CREDITOS"
     set v_valor_pendiente = $2,
         fec_actualizacion = now()
     where id_credito = $1 and v_estado_solicitud <> 'PAGADO'`,
    [creditoId, roundMoney(Number(saldo.rows[0]?.saldo ?? 0))]
  );
}

async function ensureCreditoFondeoTable(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_FONDEO" (
      id_credito_fondeo serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_inversion integer not null references "Creditos"."TBL_INVERSIONES"(id_inversion),
      valor_asignado numeric(18,2) not null,
      fecha_asignacion date not null default current_date,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now(),
      constraint chk_credito_fondeo_valor check (valor_asignado > 0)
    )
  `);
}

async function addCreditoHistory(
  client: PoolClient,
  creditoId: number,
  etapaId: number | null,
  accion: string,
  estadoAnterior: string | null,
  estadoNuevo: string | null,
  observacion: string | null,
  usuarioId?: number | null
) {
  await ensureCreditoHistorialTable(client);
  await client.query(
    `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
      id_credito, id_credito_etapa, accion, estado_anterior, estado_nuevo, observacion, id_usuario
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [creditoId, etapaId, accion, estadoAnterior, estadoNuevo, observacion, usuarioId ?? null]
  );
}

async function generarCuotasDefinitivas(client: PoolClient, credito: CreditoRow, input: RegistrarDesembolsoInput) {
  await ensureCreditoCuotasTable(client);

  const periodicidad = input.periodicidad ?? 'MENSUAL';
  const plazo = Math.max(1, Number(credito.num_plazo));
  const principal = roundMoney(input.valorDesembolso || Number(credito.val_monto_solicitado));
  const tasaMensual = credito.val_tasa ? Number(credito.val_tasa) / 100 : 0;
  const tasaPeriodo = periodicidad === 'QUINCENAL' ? tasaMensual / 2 : tasaMensual;
  const cuotaBase = roundMoney(calculateInstallment(principal, tasaPeriodo, plazo));
  const cargosTotal = 0;
  const cargosPorCuota = roundMoney(cargosTotal / plazo);
  const desembolsoDate = parseLocalDate(input.fechaDesembolso);
  const primeraCuotaDate = input.fechaPrimeraCuota
    ? parseLocalDate(input.fechaPrimeraCuota)
    : addPeriods(desembolsoDate, 1, periodicidad);
  const diaCorte = input.diaCorte ?? Math.min(25, lastDayOfMonth(primeraCuotaDate.getFullYear(), primeraCuotaDate.getMonth()));
  const diaPago = input.diaPagoOportuno ?? primeraCuotaDate.getDate();
  const ajustarFinSemana = input.ajustarFinSemana ?? true;
  const moraDespues = input.moraDespuesVencimiento ?? 0;

  await client.query('delete from "Creditos"."TBL_CREDITO_CUOTAS" where id_credito = $1', [credito.id_credito]);

  let saldo = principal;
  for (let index = 0; index < plazo; index += 1) {
    const base = addPeriods(primeraCuotaDate, index, periodicidad);
    const fechaCorte = adjustWeekend(dateWithDay(base, diaCorte), ajustarFinSemana);
    const fechaPagoOportuno = adjustWeekend(dateWithDay(base, diaPago), ajustarFinSemana);
    const fechaVencimiento = new Date(fechaPagoOportuno);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + moraDespues);

    const interes = roundMoney(saldo * tasaPeriodo);
    const capital = index === plazo - 1 ? saldo : roundMoney(cuotaBase - interes);
    const valorCuota = roundMoney(capital + interes + cargosPorCuota);
    const saldoFinal = Math.max(0, roundMoney(saldo - capital));

    await client.query(
      `insert into "Creditos"."TBL_CREDITO_CUOTAS" (
        id_credito, numero_cuota, fecha_corte, fecha_pago_oportuno, fecha_vencimiento,
        saldo_inicial, capital, interes, cargos, valor_cuota, saldo_final,
        estado, periodicidad, observacion
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDIENTE',$12,$13)`,
      [
        credito.id_credito,
        index + 1,
        formatLocalDate(fechaCorte),
        formatLocalDate(fechaPagoOportuno),
        formatLocalDate(fechaVencimiento),
        saldo,
        capital,
        interes,
        cargosPorCuota,
        valorCuota,
        saldoFinal,
        periodicidad,
        input.observacionCalendario?.trim() || null
      ]
    );

    saldo = saldoFinal;
  }
}

async function generateCreditoConsecutivo(client: PoolClient) {
  const result = await client.query<{ next_value: number }>(
    `select coalesce(max(substring(consecutivo from '[0-9]+$')::int), 0) + 1 as next_value
     from "Creditos"."TBL_CREDITOS"
     where consecutivo ~ '^CR-[0-9]+$'`
  );

  return `CR-${String(result.rows[0]?.next_value ?? 1).padStart(6, '0')}`;
}

function mapCredito(row: CreditoRow) {
  return {
    id: row.id_credito,
    consecutivo: row.consecutivo,
    idProductoCredito: row.id_producto_credito,
    producto: row.producto,
    tipoCredito: row.tipo_credito,
    idLibranzera: row.id_libranzera,
    libranzera: row.libranzera,
    idEmpresa: row.id_empresa,
    empresa: row.empresa,
    idEmpleadoEmpresa: row.id_empleado_empresa,
    empleado: row.empleado,
    idComercial: row.id_comercial,
    comercial: row.comercial,
    identificacionCliente: row.v_identificacion_cliente,
    nombreCliente: row.v_nombre_cliente,
    correoCliente: row.v_correo_cliente,
    telefonoCliente: row.v_telefono_cliente,
    montoSolicitado: Number(row.val_monto_solicitado),
    plazo: row.num_plazo,
    tipoTasa: row.tipo_tasa,
    tasa: row.val_tasa ? Number(row.val_tasa) : null,
    cuotaEstimada: row.val_cuota_estimada ? Number(row.val_cuota_estimada) : null,
    estado: row.estado,
    fechaRadicacion: row.fec_radicacion,
    documentos: Number(row.documentos ?? 0),
    etapas: Number(row.etapas ?? 0)
  };
}

const creditoSelect = `
  select c.*, p.nombre as producto, tc.des_tipo_credito as tipo_credito,
    l.v_razon_social as libranzera, em.v_razon_social as empresa,
    emp.v_nombre_completo as empleado,
    concat_ws(' ', co.v_primer_nombre, co.v_primer_apell) as comercial,
    e.v_descripcion as estado,
    (select count(*)::int from "Creditos"."TBL_CREDITO_DOCUMENTOS" d where d.id_credito = c.id_credito) as documentos,
    (select count(*)::int from "Creditos"."TBL_CREDITO_ETAPAS" et where et.id_credito = c.id_credito) as etapas
  from "Creditos"."TBL_CREDITOS" c
  inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
  inner join "Creditos"."TBL_TIPOS_CREDITO" tc on tc.id_tipo_credito = p.id_tipo_credito
  left join "Creditos"."TBL_LIBRANZERAS" l on l.id_libranzera = c.id_libranzera
  left join "Creditos"."TBL_EMPRESAS" em on em.id_empresa = c.id_empresa
  left join "Creditos"."TBL_EMPLEADOS_EMPRESA" emp on emp.id_empleado_empresa = c.id_empleado_empresa
  left join "Creditos"."TBL_COMERCIALES" co on co.id_comercial = c.id_comercial
  left join "Creditos"."TBL_ESTADOS" e on e.id_estado = c.id_estado
`;

export async function listCreditosCatalogs() {
  return withClient(async (client) => {
    const productos = await client.query<CatalogRow>('select id_producto_credito as id, concat(coalesce(consecutivo, \'AUTO\'), \' - \', nombre) as nombre from "Creditos"."TBL_PRODUCTOS_CREDITO" order by nombre');
    const libranzeras = await client.query<CatalogRow>('select id_libranzera as id, v_razon_social as nombre from "Creditos"."TBL_LIBRANZERAS" order by v_razon_social');
    const empresas = await client.query<CatalogRow>('select id_empresa as id, v_razon_social as nombre from "Creditos"."TBL_EMPRESAS" order by v_razon_social');
    const empleados = await client.query<CatalogRow>(`select id_empleado_empresa as id, concat_ws(' - ', v_identificacion, v_nombre_completo) as nombre from "Creditos"."TBL_EMPLEADOS_EMPRESA" order by v_nombre_completo`);
    const comerciales = await client.query<CatalogRow>(`select id_comercial as id, concat_ws(' ', v_primer_nombre, v_primer_apell) as nombre from "Creditos"."TBL_COMERCIALES" order by v_primer_nombre, v_primer_apell`);

    return {
      productos: productos.rows,
      libranzeras: libranzeras.rows,
      empresas: empresas.rows,
      empleados: empleados.rows,
      comerciales: comerciales.rows
    };
  });
}

export async function listCreditos() {
  return withClient(async (client) => {
    const result = await client.query<CreditoRow>(`${creditoSelect} order by c.fec_radicacion desc, c.id_credito desc`);
    return result.rows.map(mapCredito);
  });
}

export async function simularCredito(input: SimularCreditoInput) {
  return withClient(async (client) => {
    const producto = await client.query<SimulacionProductoRow>(
      `select id_producto_credito, nombre, tipo_tasa, monto_minimo, monto_maximo, plazo_minimo, plazo_maximo
       from "Creditos"."TBL_PRODUCTOS_CREDITO"
       where id_producto_credito = $1 limit 1`,
      [input.idProductoCredito]
    );
    if (!producto.rowCount) throw new SecurityError('Producto de credito no encontrado', 404);

    const monto = nullableNumber(input.montoSolicitado);
    const plazo = nullableNumber(input.plazo);
    const tasaSolicitada = nullableNumber(input.tasa);
    if (!monto || monto <= 0) throw new SecurityError('El monto solicitado debe ser mayor a cero', 400);
    if (!plazo || plazo <= 0) throw new SecurityError('El plazo debe ser mayor a cero', 400);

    const product = producto.rows[0];
    const minMonto = product.monto_minimo ? Number(product.monto_minimo) : null;
    const maxMonto = product.monto_maximo ? Number(product.monto_maximo) : null;
    if (minMonto !== null && monto < minMonto) throw new SecurityError(`El monto minimo para este producto es ${minMonto}`, 400);
    if (maxMonto !== null && monto > maxMonto) throw new SecurityError(`El monto maximo para este producto es ${maxMonto}`, 400);
    if (product.plazo_minimo !== null && plazo < product.plazo_minimo) throw new SecurityError(`El plazo minimo para este producto es ${product.plazo_minimo} meses`, 400);
    if (product.plazo_maximo !== null && plazo > product.plazo_maximo) throw new SecurityError(`El plazo maximo para este producto es ${product.plazo_maximo} meses`, 400);

    const atributosResult = await client.query<SimulacionAtributoRow>(
      `select a.*, ta.des_tipo_atributo as tipo_atributo, tc.des_tipo_calculo as tipo_calculo
       from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a
       inner join "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" ta on ta.id_tipo_atributo = a.id_tipo_atributo
       inner join "Creditos"."TBL_TIPOS_CALCULO_CREDITO" tc on tc.id_tipo_calculo = a.id_tipo_calculo
       where a.id_producto_credito = $1
       order by a.prioridad, a.nombre`,
      [input.idProductoCredito]
    );

    const tasaProducto = atributosResult.rows
      .map((row) => {
        const key = normalizeKey(`${row.nombre} ${row.tipo_atributo} ${row.tipo_calculo}`);
        return key.includes('INTERES') && row.porcentaje ? Number(row.porcentaje) : null;
      })
      .find((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const tasa = tasaSolicitada ?? tasaProducto ?? 0;
    if (tasa <= 0) {
      throw new SecurityError('Este producto no tiene una tasa de interes configurada', 400);
    }

    const atributos = atributosResult.rows.map((row) => {
      const porcentaje = row.porcentaje ? Number(row.porcentaje) : null;
      const valorBase = row.valor ? Number(row.valor) : 0;
      let valorCalculado = porcentaje !== null ? (monto * porcentaje) / 100 : valorBase;
      const minimo = row.minimo ? Number(row.minimo) : null;
      const maximo = row.maximo ? Number(row.maximo) : null;
      if (minimo !== null && valorCalculado < minimo) valorCalculado = minimo;
      if (maximo !== null && valorCalculado > maximo) valorCalculado = maximo;

      const key = normalizeKey(`${row.nombre} ${row.tipo_atributo} ${row.tipo_calculo}`);
      const esInteres = key.includes('INTERES');
      const esDescuento = key.includes('DESEMBOLSO') || key.includes('DESCUENTO');
      const sumaAlCredito = !esInteres && !esDescuento;

      return {
        id: row.id_producto_atributo,
        nombre: row.nombre,
        tipoAtributo: row.tipo_atributo,
        tipoCalculo: row.tipo_calculo,
        valor: row.valor ? Number(row.valor) : null,
        porcentaje,
        valorCalculado: roundMoney(valorCalculado),
        aplicaIva: row.aplica_iva,
        obligatorio: row.obligatorio,
        prioridad: row.prioridad,
        sumaAlCredito,
        esDescuento
      };
    });

    const cargosFinanciados = atributos
      .filter((item) => item.sumaAlCredito)
      .reduce((total, item) => total + item.valorCalculado, 0);
    const descuentosDesembolso = atributos
      .filter((item) => item.esDescuento)
      .reduce((total, item) => total + item.valorCalculado, 0);
    const valorCredito = roundMoney(monto + cargosFinanciados);
    const valorDesembolso = roundMoney(Math.max(monto - descuentosDesembolso, 0));
    const tasaMensual = tasa / 100;
    const cuota = roundMoney(calculateInstallment(valorCredito, tasaMensual, plazo));

    const amortizacionDb = await client.query<AmortizacionDbRow>(
      'select * from "Creditos".generar_amortizacion($1, $2, $3)',
      [valorCredito, tasa * 12, plazo]
    );
    const plan = amortizacionDb.rows.map((row, index) => ({
      numero: row.cuota_numero ?? index + 1,
      saldoInicial: index === 0 ? valorCredito : Number(amortizacionDb.rows[index - 1]?.saldo ?? 0),
      capital: Number(row.abono),
      interes: Number(row.interes),
      cuota: Number(row.cuota),
      saldoFinal: Number(row.saldo)
    }));

    return {
      producto: {
        id: product.id_producto_credito,
        nombre: product.nombre,
        tipoTasa: product.tipo_tasa,
        montoMinimo: minMonto,
        montoMaximo: maxMonto,
        plazoMinimo: product.plazo_minimo,
        plazoMaximo: product.plazo_maximo
      },
      resumen: {
        montoSolicitado: roundMoney(monto),
        valorDesembolso,
        valorCredito,
        cargosFinanciados: roundMoney(cargosFinanciados),
        descuentosDesembolso: roundMoney(descuentosDesembolso),
        plazo,
        tasaMensual: tasa,
        cuotaEstimada: cuota,
        totalIntereses: roundMoney(plan.reduce((total, item) => total + item.interes, 0)),
        totalPagar: roundMoney(plan.reduce((total, item) => total + item.cuota, 0))
      },
      atributos,
      plan
    };
  });
}

export async function createCredito(input: CreateCreditoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      const product = await client.query<{ id_producto_credito: number; id_tipo_credito: number; nombre: string; id_libranzera: number | null; tipo_tasa: string | null }>(
        'select id_producto_credito, id_tipo_credito, nombre, id_libranzera, tipo_tasa from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1 limit 1',
        [input.idProductoCredito]
      );
      if (!product.rowCount) throw new SecurityError('Producto de credito no encontrado', 404);

      const monto = nullableNumber(input.montoSolicitado);
      const plazo = nullableNumber(input.plazo);
      if (!monto || monto <= 0) throw new SecurityError('El monto solicitado debe ser mayor a cero', 400);
      if (!plazo || plazo <= 0) throw new SecurityError('El plazo debe ser mayor a cero', 400);

      const stateId = await getActiveStateId(client);
      const consecutivo = await generateCreditoConsecutivo(client);
      const systemUser = await client.query<{ id_usuario: number }>('select id_usuario from "Creditos"."TBL_USUARIOS" order by id_usuario limit 1');
      let legacyTipoCredito = await client.query<{ id_tipo_credito: number }>(
        'select id_tipo_credito from "Creditos"."TBL_TIPO_CREDITOS" where upper(v_descripcion) = $1 limit 1',
        ['LIBRANZA']
      );
      if (!legacyTipoCredito.rowCount) {
        legacyTipoCredito = await client.query<{ id_tipo_credito: number }>(
          `insert into "Creditos"."TBL_TIPO_CREDITOS" (v_descripcion, v_sigla, fec_creacion)
           values ('LIBRANZA', 'LIB', now()) returning id_tipo_credito`
        );
      }
      const tasaProductoResult = await client.query<{ porcentaje: string | null }>(
        `select a.porcentaje
         from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a
         inner join "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" ta on ta.id_tipo_atributo = a.id_tipo_atributo
         inner join "Creditos"."TBL_TIPOS_CALCULO_CREDITO" tc on tc.id_tipo_calculo = a.id_tipo_calculo
         where a.id_producto_credito = $1
           and (
             upper(coalesce(a.nombre, '') || ' ' || coalesce(ta.des_tipo_atributo, '') || ' ' || coalesce(tc.des_tipo_calculo, '')) like '%INTERES%'
             or upper(coalesce(a.nombre, '') || ' ' || coalesce(ta.des_tipo_atributo, '') || ' ' || coalesce(tc.des_tipo_calculo, '')) like '%INTERÉS%'
           )
           and a.porcentaje is not null
         order by a.prioridad, a.id_producto_atributo
         limit 1`,
        [input.idProductoCredito]
      );
      const tasa = nullableNumber(input.tasa) ?? (tasaProductoResult.rows[0]?.porcentaje ? Number(tasaProductoResult.rows[0].porcentaje) : null);
      const cuotaBase = monto / plazo;
      const cuotaConInteres = tasa ? cuotaBase + ((monto * (tasa / 100)) / plazo) : cuotaBase;
      const legacyCliente = Number(input.identificacionCliente.replace(/\D/g, '')) || 0;

      const created = await client.query<{ id_credito: number }>(
        `insert into "Creditos"."TBL_CREDITOS" (
          v_cod_credito, v_nom_credito, v_cliente, v_valor_credito, v_cant_meses,
          v_cant_meses_pagadas, v_valor_taza_mensual, v_valor_pendiente, v_valor_cuota,
          v_fecha_ultimo_pago, v_fecha_corte, fec_creacion, fec_actualizacion, id_tipo_credito, id_estado_credito,
          id_usuario,
          consecutivo, id_producto_credito, id_libranzera, id_empresa, id_empleado_empresa, id_comercial,
          v_identificacion_cliente, v_nombre_cliente, v_correo_cliente, v_telefono_cliente,
          val_monto_solicitado, num_plazo, tipo_tasa, val_tasa, val_cuota_estimada, id_estado,
          v_estado_solicitud
        ) values (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          current_date,current_date,current_date,current_date,$10,$11,
          $12,
          $13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,
          $23,$24,$25,$26,$27,$28,
          'SOLICITADO'
        )
        returning id_credito`,
        [
          consecutivo,
          product.rows[0].nombre,
          legacyCliente,
          monto,
          plazo,
          0,
          tasa,
          monto,
          cuotaConInteres,
          legacyTipoCredito.rows[0].id_tipo_credito,
          stateId,
          systemUser.rows[0]?.id_usuario ?? 1,
          consecutivo,
          input.idProductoCredito,
          input.idLibranzera ?? product.rows[0].id_libranzera,
          input.idEmpresa ?? null,
          input.idEmpleadoEmpresa ?? null,
          input.idComercial ?? null,
          input.identificacionCliente.trim(),
          input.nombreCliente.trim(),
          nullableText(input.correoCliente),
          nullableText(input.telefonoCliente),
          monto,
          plazo,
          product.rows[0].tipo_tasa,
          tasa,
          cuotaConInteres,
          stateId
        ]
      );

      const creditoId = created.rows[0].id_credito;

      await addCreditoHistory(client, creditoId, null, 'RADICACION', null, 'SOLICITADO', 'Solicitud de credito radicada', systemUser.rows[0]?.id_usuario ?? 1);

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_DOCUMENTOS" (
          id_credito, id_documento_credito, obligatorio, aplica_a, prioridad, requiere_firma, requiere_validacion
        )
        select $1, id_documento_credito, obligatorio, aplica_a, prioridad, requiere_firma, requiere_validacion
        from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS"
        where id_producto_credito = $2`,
        [creditoId, input.idProductoCredito]
      );

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_ETAPAS" (
          id_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas,
          estado_etapa, fec_inicio
        )
        select $1, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas,
          case when orden = 1 then 'EN_PROCESO' else 'PENDIENTE' end,
          case when orden = 1 then now() else null end
        from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS"
        where id_producto_credito = $2`,
        [creditoId, input.idProductoCredito]
      );

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_LIQUIDACION" (
          id_credito, id_producto_atributo, nombre, tipo_atributo, tipo_calculo, valor, porcentaje,
          valor_calculado, aplica_iva
        )
        select $1, a.id_producto_atributo, a.nombre, ta.des_tipo_atributo, tc.des_tipo_calculo, a.valor, a.porcentaje,
          case
            when a.porcentaje is not null then round(($2::numeric * a.porcentaje) / 100, 2)
            else a.valor
          end,
          a.aplica_iva
        from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a
        inner join "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" ta on ta.id_tipo_atributo = a.id_tipo_atributo
        inner join "Creditos"."TBL_TIPOS_CALCULO_CREDITO" tc on tc.id_tipo_calculo = a.id_tipo_calculo
        where a.id_producto_credito = $3`,
        [creditoId, monto, input.idProductoCredito]
      );

      await client.query('commit');

      const result = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1`, [creditoId]);
      return mapCredito(result.rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function listCreditoDocumentos(creditoId: number) {
  return withClient(async (client) => {
    await ensureCreditoDocumentoArchivosTable(client);
    const result = await client.query<DocumentoCreditoRow>(
      `select cd.*, d.des_documento as documento
        , latest.nombre_archivo as archivo_nombre
        , latest.mime_type as archivo_mime
        , latest.tamano_bytes as archivo_tamano
       from "Creditos"."TBL_CREDITO_DOCUMENTOS" cd
       inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = cd.id_documento_credito
       left join lateral (
         select nombre_archivo, mime_type, tamano_bytes
         from "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS" a
         where a.id_credito_documento = cd.id_credito_documento
         order by a.fec_creacion desc, a.id_credito_documento_archivo desc
         limit 1
       ) latest on true
       where cd.id_credito = $1
       order by cd.prioridad, d.des_documento`,
      [creditoId]
    );

    return result.rows.map((row) => ({
      id: row.id_credito_documento,
      documento: row.documento,
      obligatorio: row.obligatorio,
      aplicaA: row.aplica_a,
      prioridad: row.prioridad,
      requiereFirma: row.requiere_firma,
      requiereValidacion: row.requiere_validacion,
      estadoDocumento: row.estado_documento,
      archivoUrl: row.v_archivo_url,
      archivoNombre: row.archivo_nombre,
      archivoMime: row.archivo_mime,
      archivoTamano: row.archivo_tamano
    }));
  });
}

export async function listCreditoEtapas(creditoId: number) {
  return withClient(async (client) => {
    const result = await client.query<EtapaCreditoRow>(
      `select ce.*, e.des_etapa as etapa
       from "Creditos"."TBL_CREDITO_ETAPAS" ce
       inner join "Creditos"."TBL_ETAPAS_CREDITO" e on e.id_etapa_credito = ce.id_etapa_credito
       where ce.id_credito = $1
       order by ce.orden`,
      [creditoId]
    );

    return result.rows.map((row) => ({
      id: row.id_credito_etapa,
      etapa: row.etapa,
      orden: row.orden,
      obligatoria: row.obligatoria,
      permiteDevolucion: row.permite_devolucion,
      responsable: row.responsable,
      slaHoras: row.sla_horas,
      estadoEtapa: row.estado_etapa,
      fechaInicio: row.fec_inicio,
      fechaFin: row.fec_fin
    }));
  });
}

export async function getCreditoExpediente(creditoId: number) {
  return withClient(async (client) => {
    await ensureCreditoHistorialTable(client);
    await ensureCreditoDecisionesTable(client);
    await ensureCreditoDesembolsosTable(client);
    await ensureCreditoFondeoTable(client);
    await ensureCreditoCuotasTable(client);
    await ensureCreditoPagosTable(client);
    await ensureCreditoPagoSoportesTable(client);
    await ensureCalendarioParamColumns(client);

    const creditoResult = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1`, [creditoId]);
    if (!creditoResult.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);

    const credito = mapCredito(creditoResult.rows[0]);
    await recalcularMoraCredito(client, creditoId);

    const [documentos, etapas, liquidacion, historial, decisiones, desembolsos, fondeos, cuotas, pagos, calendario, perfil] = await Promise.all([
      listCreditoDocumentos(creditoId),
      listCreditoEtapas(creditoId),
      client.query<LiquidacionCreditoRow>(
        `select *
         from "Creditos"."TBL_CREDITO_LIQUIDACION"
         where id_credito = $1
         order by id_credito_liquidacion`,
        [creditoId]
      ),
      client.query<HistorialCreditoRow>(
        `select h.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_HISTORIAL" h
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = h.id_usuario
         where h.id_credito = $1
         order by h.fec_creacion desc, h.id_credito_historial desc`,
        [creditoId]
      ),
      client.query<DecisionCreditoRow>(
        `select d.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_DECISIONES" d
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = d.id_usuario
         where d.id_credito = $1
         order by d.fec_creacion desc, d.id_credito_decision desc`,
        [creditoId]
      ),
      client.query<DesembolsoCreditoRow>(
        `select d.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = d.id_usuario
         where d.id_credito = $1
         order by d.fecha_desembolso desc, d.id_credito_desembolso desc`,
        [creditoId]
      ),
      client.query<FondeoCreditoRow>(
        `select f.id_credito_fondeo, f.id_inversion, inv.id_inversionista,
          i.v_nombre_completo as inversionista, f.valor_asignado,
          f.fecha_asignacion::text as fecha_asignacion, f.observacion,
          coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_FONDEO" f
         inner join "Creditos"."TBL_INVERSIONES" inv on inv.id_inversion = f.id_inversion
         inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = f.id_usuario
         where f.id_credito = $1
         order by f.fecha_asignacion desc, f.id_credito_fondeo desc`,
        [creditoId]
      ),
      client.query<CreditoCuotaRow>(
        `select *
         from "Creditos"."TBL_CREDITO_CUOTAS"
         where id_credito = $1
         order by numero_cuota`,
        [creditoId]
      ),
      client.query<CreditoPagoRow>(
        `select p.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario,
          (select count(*)::int from "Creditos"."TBL_CREDITO_PAGO_SOPORTES" s where s.id_credito_pago = p.id_credito_pago) as soportes,
          (
            select s.nombre_archivo
            from "Creditos"."TBL_CREDITO_PAGO_SOPORTES" s
            where s.id_credito_pago = p.id_credito_pago
            order by s.fec_creacion desc, s.id_credito_pago_soporte desc
            limit 1
          ) as soporte_nombre,
          (
            select s.mime_type
            from "Creditos"."TBL_CREDITO_PAGO_SOPORTES" s
            where s.id_credito_pago = p.id_credito_pago
            order by s.fec_creacion desc, s.id_credito_pago_soporte desc
            limit 1
          ) as soporte_mime_type
         from "Creditos"."TBL_CREDITO_PAGOS" p
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = p.id_usuario
         where p.id_credito = $1
         order by p.fecha_pago desc, p.id_credito_pago desc`,
        [creditoId]
      ),
      client.query<CalendarioCreditoRow>(
        `select
          p.periodicidad as producto_periodicidad,
          p.dia_corte as producto_dia_corte,
          p.dia_pago_oportuno as producto_dia_pago_oportuno,
          p.ajustar_fin_semana as producto_ajustar_fin_semana,
          p.mora_despues_vencimiento as producto_mora_despues_vencimiento,
          p.tasa_mora_mensual as producto_tasa_mora_mensual,
          p.primera_cuota_mes_siguiente as producto_primera_cuota_mes_siguiente,
          p.observacion_calendario as producto_observacion_calendario,
          e.periodicidad_nomina as empresa_periodicidad_nomina,
          e.dia_corte_nomina as empresa_dia_corte_nomina,
          e.dia_pago_nomina as empresa_dia_pago_nomina,
          e.segundo_dia_pago_nomina as empresa_segundo_dia_pago_nomina,
          e.dia_descuento_libranza as empresa_dia_descuento_libranza,
          e.ajustar_fin_semana as empresa_ajustar_fin_semana,
          e.observacion_calendario as empresa_observacion_calendario
         from "Creditos"."TBL_CREDITOS" c
         left join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
         left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
         where c.id_credito = $1
         limit 1`,
        [creditoId]
      ),
      client.query<PerfilClienteCreditoRow>(
        `select
          cp.id_cliente_portal,
          cp.v_nombre_completo as portal_nombre,
          cp.v_correo as portal_correo,
          cp.v_telefono as portal_telefono,
          cp.v_cargo as portal_cargo,
          cp.fec_ingreso::text as portal_fecha_ingreso,
          cp.val_salario as portal_salario,
          cp.val_neto as portal_neto,
          cp.ind_tiene_embargos as portal_tiene_embargos,
          cp.ind_correo_confirmado as portal_correo_confirmado,
          tc.des_tipo_contrato as portal_tipo_contrato,
          emp.v_nombre_completo as empleado_nombre,
          emp.v_cargo as empleado_cargo,
          emp.val_salario as empleado_salario,
          b.des_banco as empleado_banco,
          tcu.des_tipo_cuenta as empleado_tipo_cuenta,
          emp.v_cuenta_nomina as empleado_cuenta_nomina,
          ec.des_estado_civil as empleado_estado_civil,
          emp.num_personas_cargo as empleado_personas_cargo,
          tv.des_tipo_vivienda as empleado_tipo_vivienda,
          e.v_nit as empresa_nit,
          e.v_razon_social as empresa_razon_social,
          e.v_codigo as empresa_codigo,
          e.v_correo as empresa_correo,
          e.v_telefono as empresa_telefono,
          e.v_representante_legal as empresa_representante
         from (select $1::varchar as identificacion, $2::int as id_empresa, $3::int as id_empleado_empresa) base
         left join "Creditos"."TBL_CLIENTES_PORTAL" cp on cp.v_identificacion = base.identificacion
         left join "Creditos"."TBL_TIPO_CONTRATO" tc on tc.id_tipo_contrato = cp.id_tipo_contrato
         left join "Creditos"."TBL_EMPLEADOS_EMPRESA" emp on emp.id_empleado_empresa = base.id_empleado_empresa
           or (emp.v_identificacion = base.identificacion and (base.id_empresa is null or emp.id_empresa = base.id_empresa))
         left join "Creditos"."TBL_BANCOS" b on b.id_banco = emp.id_banco
         left join "Creditos"."TBL_TIPO_CUENTAS" tcu on tcu.id_tipo_cuenta = emp.id_tipo_cuenta
         left join "Creditos"."TBL_ESTADO_CIVIL" ec on ec.id_estado_civil = emp.id_estado_civil
         left join "Creditos"."TBL_TIPO_VIVIENDA" tv on tv.id_tipo_vivienda = emp.id_tipo_vivienda
         left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = coalesce(base.id_empresa, cp.id_empresa, emp.id_empresa)
         limit 1`,
        [credito.identificacionCliente, credito.idEmpresa, credito.idEmpleadoEmpresa]
      )
    ]);

    const mappedEtapas = etapas;
    const currentStage = mappedEtapas.find((item) => item.estadoEtapa === 'EN_PROCESO')
      ?? mappedEtapas.find((item) => item.estadoEtapa === 'PENDIENTE')
      ?? mappedEtapas[mappedEtapas.length - 1]
      ?? null;
    const calendarioRow = calendario.rows[0] ?? null;
    const sugerenciaCalendario = {
      periodicidad: calendarioRow?.empresa_periodicidad_nomina ?? calendarioRow?.producto_periodicidad ?? 'MENSUAL',
      diaCorte: calendarioRow?.empresa_dia_corte_nomina ?? calendarioRow?.producto_dia_corte ?? 25,
      diaPagoOportuno: calendarioRow?.empresa_dia_descuento_libranza ?? calendarioRow?.empresa_dia_pago_nomina ?? calendarioRow?.producto_dia_pago_oportuno ?? 30,
      segundoDiaPagoNomina: calendarioRow?.empresa_segundo_dia_pago_nomina ?? null,
      ajustarFinSemana: calendarioRow?.empresa_ajustar_fin_semana ?? calendarioRow?.producto_ajustar_fin_semana ?? true,
      moraDespuesVencimiento: calendarioRow?.producto_mora_despues_vencimiento ?? 0,
      tasaMoraMensual: calendarioRow?.producto_tasa_mora_mensual ? Number(calendarioRow.producto_tasa_mora_mensual) : 2,
      primeraCuotaMesSiguiente: calendarioRow?.producto_primera_cuota_mes_siguiente ?? true,
      observacionCalendario: [calendarioRow?.producto_observacion_calendario, calendarioRow?.empresa_observacion_calendario].filter(Boolean).join(' / ') || null,
      origen: calendarioRow?.empresa_periodicidad_nomina || calendarioRow?.empresa_dia_pago_nomina || calendarioRow?.empresa_dia_descuento_libranza
        ? 'EMPRESA'
        : calendarioRow?.producto_periodicidad || calendarioRow?.producto_dia_corte || calendarioRow?.producto_dia_pago_oportuno
          ? 'PRODUCTO'
          : 'DEFECTO'
    };

    return {
      credito,
      etapaActual: currentStage,
      sugerenciaCalendario,
      documentos,
      etapas: mappedEtapas,
      liquidacion: liquidacion.rows.map((row) => ({
        id: row.id_credito_liquidacion,
        nombre: row.nombre,
        tipoAtributo: row.tipo_atributo,
        tipoCalculo: row.tipo_calculo,
        valor: row.valor ? Number(row.valor) : null,
        porcentaje: row.porcentaje ? Number(row.porcentaje) : null,
        valorCalculado: row.valor_calculado ? Number(row.valor_calculado) : null,
        aplicaIva: row.aplica_iva
      })),
      historial: historial.rows.map((row) => ({
        id: row.id_credito_historial,
        accion: row.accion,
        estadoAnterior: row.estado_anterior,
        estadoNuevo: row.estado_nuevo,
        observacion: row.observacion,
        usuario: row.usuario,
        fecha: row.fec_creacion
      })),
      decisiones: decisiones.rows.map((row) => ({
        id: row.id_credito_decision,
        decision: row.decision,
        montoAprobado: row.monto_aprobado ? Number(row.monto_aprobado) : null,
        plazoAprobado: row.plazo_aprobado,
        tasaAprobada: row.tasa_aprobada ? Number(row.tasa_aprobada) : null,
        cuotaAprobada: row.cuota_aprobada ? Number(row.cuota_aprobada) : null,
        observacion: row.observacion,
        usuario: row.usuario,
        fecha: row.fec_creacion
      })),
      desembolsos: desembolsos.rows.map((row) => ({
        id: row.id_credito_desembolso,
        valorDesembolso: Number(row.valor_desembolso),
        fechaDesembolso: row.fecha_desembolso,
        bancoDestino: row.banco_destino,
        tipoCuenta: row.tipo_cuenta,
        numeroCuenta: row.numero_cuenta,
        referenciaPago: row.referencia_pago,
        observacion: row.observacion,
        usuario: row.usuario,
        fechaRegistro: row.fec_creacion
      })),
      fondeos: fondeos.rows.map((row) => ({
        id: row.id_credito_fondeo,
        idInversion: row.id_inversion,
        idInversionista: row.id_inversionista,
        inversionista: row.inversionista,
        valorAsignado: Number(row.valor_asignado),
        fechaAsignacion: row.fecha_asignacion,
        observacion: row.observacion,
        usuario: row.usuario
      })),
      cuotas: cuotas.rows.map((row) => ({
        id: row.id_credito_cuota,
        numero: row.numero_cuota,
        fechaCorte: row.fecha_corte,
        fechaPagoOportuno: row.fecha_pago_oportuno,
        fechaVencimiento: row.fecha_vencimiento,
        saldoInicial: Number(row.saldo_inicial),
        capital: Number(row.capital),
        interes: Number(row.interes),
        cargos: Number(row.cargos),
        valorCuota: Number(row.valor_cuota),
        diasMora: Number(row.dias_mora),
        valorMora: Number(row.valor_mora),
        valorPagado: Number(row.valor_pagado),
        saldoCuota: Math.max(0, Number(row.valor_cuota) + Number(row.valor_mora) - Number(row.valor_pagado)),
        capitalPagado: Number(row.capital_pagado),
        interesPagado: Number(row.interes_pagado),
        cargosPagados: Number(row.cargos_pagados),
        moraPagada: Number(row.mora_pagada),
        fechaUltimoPago: row.fecha_ultimo_pago,
        saldoFinal: Number(row.saldo_final),
        estado: row.estado,
        periodicidad: row.periodicidad,
        observacion: row.observacion
      })),
      pagos: pagos.rows.map((row) => ({
        id: row.id_credito_pago,
        fechaPago: row.fecha_pago,
        valorPago: Number(row.valor_pago),
        saldoFavor: Number(row.saldo_favor ?? 0),
        medioPago: row.medio_pago,
        referenciaPago: row.referencia_pago,
        observacion: row.observacion,
        usuario: row.usuario,
        soportes: Number(row.soportes ?? 0),
        soporteNombre: row.soporte_nombre,
        soporteMimeType: row.soporte_mime_type,
        fechaRegistro: row.fec_creacion
      })),
      perfilCliente: perfil.rows[0] ? {
        portal: {
          id: perfil.rows[0].id_cliente_portal,
          nombre: perfil.rows[0].portal_nombre,
          correo: perfil.rows[0].portal_correo,
          telefono: perfil.rows[0].portal_telefono,
          cargo: perfil.rows[0].portal_cargo,
          tipoContrato: perfil.rows[0].portal_tipo_contrato,
          fechaIngreso: perfil.rows[0].portal_fecha_ingreso,
          salario: perfil.rows[0].portal_salario ? Number(perfil.rows[0].portal_salario) : null,
          neto: perfil.rows[0].portal_neto ? Number(perfil.rows[0].portal_neto) : null,
          tieneEmbargos: perfil.rows[0].portal_tiene_embargos,
          correoConfirmado: perfil.rows[0].portal_correo_confirmado
        },
        empleado: {
          nombre: perfil.rows[0].empleado_nombre,
          cargo: perfil.rows[0].empleado_cargo,
          salario: perfil.rows[0].empleado_salario ? Number(perfil.rows[0].empleado_salario) : null,
          banco: perfil.rows[0].empleado_banco,
          tipoCuenta: perfil.rows[0].empleado_tipo_cuenta,
          cuentaNomina: perfil.rows[0].empleado_cuenta_nomina,
          estadoCivil: perfil.rows[0].empleado_estado_civil,
          personasCargo: perfil.rows[0].empleado_personas_cargo,
          tipoVivienda: perfil.rows[0].empleado_tipo_vivienda
        },
        empresa: {
          nit: perfil.rows[0].empresa_nit,
          razonSocial: perfil.rows[0].empresa_razon_social,
          codigo: perfil.rows[0].empresa_codigo,
          correo: perfil.rows[0].empresa_correo,
          telefono: perfil.rows[0].empresa_telefono,
          representanteLegal: perfil.rows[0].empresa_representante
        }
      } : null,
      siguienteAccion: currentStage
        ? `Gestionar etapa: ${currentStage.etapa}`
        : 'Credito sin etapas configuradas'
    };
  });
}

export async function updateCreditoEtapa(etapaId: number, input: UpdateCreditoEtapaInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      const etapaResult = await client.query<EtapaCreditoRow & { id_credito: number }>(
        `select ce.*, e.des_etapa as etapa
         from "Creditos"."TBL_CREDITO_ETAPAS" ce
         inner join "Creditos"."TBL_ETAPAS_CREDITO" e on e.id_etapa_credito = ce.id_etapa_credito
         where ce.id_credito_etapa = $1
         for update`,
        [etapaId]
      );
      if (!etapaResult.rowCount) throw new SecurityError('Etapa de credito no encontrada', 404);

      const etapa = etapaResult.rows[0];
      const previousState = etapa.estado_etapa;
      const nextState = input.estado;
      const finishDate = ['APROBADA', 'DEVUELTA', 'RECHAZADA'].includes(nextState) ? 'now()' : 'null';

      if (nextState === 'APROBADA') {
        const previousPending = await client.query<{ total: string }>(
          `select count(*)::int as total
           from "Creditos"."TBL_CREDITO_ETAPAS"
           where id_credito = $1 and orden < $2 and estado_etapa <> 'APROBADA'`,
          [etapa.id_credito, etapa.orden]
        );
        if (Number(previousPending.rows[0]?.total ?? 0) > 0) {
          throw new SecurityError('Primero debes aprobar las etapas anteriores del credito', 400);
        }

        if (isDocumentationStage(etapa.etapa)) {
          const pendingDocs = await client.query<{ total: string }>(
            `select count(*)::int as total
             from "Creditos"."TBL_CREDITO_DOCUMENTOS"
             where id_credito = $1
               and obligatorio = true
               and (
                 estado_documento = 'PENDIENTE'
                 or estado_documento = 'RECHAZADO'
                 or (requiere_validacion = true and estado_documento <> 'APROBADO')
               )`,
            [etapa.id_credito]
          );
          if (Number(pendingDocs.rows[0]?.total ?? 0) > 0) {
            throw new SecurityError('No puedes aprobar documentacion: hay documentos obligatorios pendientes, rechazados o sin validacion', 400);
          }
        }

        if (isApprovalStage(etapa.etapa)) {
          const decision = await client.query<{ decision: string }>(
            `select decision
             from "Creditos"."TBL_CREDITO_DECISIONES"
             where id_credito = $1
             order by fec_creacion desc, id_credito_decision desc
             limit 1`,
            [etapa.id_credito]
          );
          if (!decision.rowCount || decision.rows[0].decision !== 'APROBADO') {
            throw new SecurityError('Antes de aprobar esta etapa debes registrar una decision aprobada del credito', 400);
          }
        }

        if (isSignatureStage(etapa.etapa)) {
          await ensureCreditoFirmasTable(client);
          const pendingSignatures = await client.query<{ total: string }>(
            `select count(*)::int as total
             from "Creditos"."TBL_CREDITO_FIRMAS"
             where id_credito = $1 and estado <> 'FIRMADO'`,
            [etapa.id_credito]
          );
          if (Number(pendingSignatures.rows[0]?.total ?? 0) > 0) {
            throw new SecurityError('No puedes aprobar firma: hay documentos enviados que aun no estan firmados', 400);
          }
        }

        if (isDisbursementStage(etapa.etapa)) {
          await ensureCreditoDesembolsosTable(client);
          await ensureCreditoFondeoTable(client);
          const fondeo = await client.query<{ total: string; valor: string }>(
            `select count(*)::int as total, coalesce(sum(valor_asignado), 0)::numeric as valor
             from "Creditos"."TBL_CREDITO_FONDEO"
             where id_credito = $1`,
            [etapa.id_credito]
          );
          if (Number(fondeo.rows[0]?.total ?? 0) === 0) {
            throw new SecurityError('Antes de aprobar desembolso debes asignar el fondeo de uno o varios inversionistas', 400);
          }
          const desembolso = await client.query<{ total: string }>(
            `select count(*)::int as total
             from "Creditos"."TBL_CREDITO_DESEMBOLSOS"
             where id_credito = $1`,
            [etapa.id_credito]
          );
          if (Number(desembolso.rows[0]?.total ?? 0) === 0) {
            throw new SecurityError('Antes de aprobar desembolso debes registrar la transferencia o pago realizado', 400);
          }
        }
      }

      await client.query(
        `update "Creditos"."TBL_CREDITO_ETAPAS"
         set estado_etapa = $1,
             fec_inicio = coalesce(fec_inicio, now()),
             fec_fin = case when $2::boolean then now() else null end,
             fec_actualizacion = now()
         where id_credito_etapa = $3`,
        [nextState, finishDate === 'now()', etapaId]
      );

      await addCreditoHistory(
        client,
        etapa.id_credito,
        etapaId,
        `ETAPA_${nextState}`,
        previousState,
        nextState,
        input.observacion?.trim() || null,
        input.usuarioId
      );

      if (nextState === 'APROBADA') {
        const nextEtapa = await client.query<{ id_credito_etapa: number }>(
          `select id_credito_etapa
           from "Creditos"."TBL_CREDITO_ETAPAS"
           where id_credito = $1 and orden > $2 and estado_etapa = 'PENDIENTE'
           order by orden
           limit 1`,
          [etapa.id_credito, etapa.orden]
        );
        if (nextEtapa.rowCount) {
          await client.query(
            `update "Creditos"."TBL_CREDITO_ETAPAS"
             set estado_etapa = 'EN_PROCESO', fec_inicio = coalesce(fec_inicio, now()), fec_actualizacion = now()
             where id_credito_etapa = $1`,
            [nextEtapa.rows[0].id_credito_etapa]
          );
          await addCreditoHistory(client, etapa.id_credito, nextEtapa.rows[0].id_credito_etapa, 'ETAPA_INICIADA', 'PENDIENTE', 'EN_PROCESO', 'Etapa iniciada automaticamente', input.usuarioId);
        } else {
          await client.query(
            `update "Creditos"."TBL_CREDITOS"
             set v_estado_solicitud = 'APROBADO', fec_actualizacion = now()
             where id_credito = $1`,
            [etapa.id_credito]
          );
          await addCreditoHistory(client, etapa.id_credito, null, 'CREDITO_APROBADO', null, 'APROBADO', 'Todas las etapas fueron aprobadas', input.usuarioId);
        }
      }

      if (nextState === 'RECHAZADA') {
        await client.query(
          `update "Creditos"."TBL_CREDITOS"
           set v_estado_solicitud = 'RECHAZADO', fec_actualizacion = now()
           where id_credito = $1`,
          [etapa.id_credito]
        );
      }

      await client.query('commit');
      return getCreditoExpediente(etapa.id_credito);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function listOpcionesFondeo() {
  return withClient(async (client) => {
    await ensureCreditoFondeoTable(client);
    const result = await client.query<FondeoDisponibleRow>(
      `select inv.id_inversion, inv.id_inversionista, i.v_nombre_completo as inversionista,
        inv.fec_inversion::text as fecha_inversion, inv.val_monto as monto_inversion,
        coalesce(sum(f.valor_asignado), 0)::numeric as monto_asignado,
        (inv.val_monto - coalesce(sum(f.valor_asignado), 0))::numeric as saldo_disponible,
        inv.val_taza as tasa, inv.num_plazo as plazo
       from "Creditos"."TBL_INVERSIONES" inv
       inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
       left join "Creditos"."TBL_CREDITO_FONDEO" f on f.id_inversion = inv.id_inversion
       group by inv.id_inversion, inv.id_inversionista, i.v_nombre_completo, inv.fec_inversion, inv.val_monto, inv.val_taza, inv.num_plazo
       having (inv.val_monto - coalesce(sum(f.valor_asignado), 0)) > 0
       order by i.v_nombre_completo, inv.fec_inversion`
    );

    return result.rows.map((row) => ({
      idInversion: row.id_inversion,
      idInversionista: row.id_inversionista,
      inversionista: row.inversionista,
      fechaInversion: row.fecha_inversion,
      montoInversion: Number(row.monto_inversion),
      montoAsignado: Number(row.monto_asignado),
      saldoDisponible: Number(row.saldo_disponible),
      tasa: Number(row.tasa),
      plazo: row.plazo
    }));
  });
}

export async function asignarFondeoCredito(creditoId: number, input: AsignarFondeoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoFondeoTable(client);
      const credito = await client.query<{ id_credito: number }>(
        'select id_credito from "Creditos"."TBL_CREDITOS" where id_credito = $1 for update',
        [creditoId]
      );
      if (!credito.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);
      if (!Number.isFinite(input.valorAsignado) || input.valorAsignado <= 0) {
        throw new SecurityError('El valor de fondeo debe ser mayor a cero', 400);
      }

      const inversion = await client.query<{ id_inversion: number; saldo_disponible: string; inversionista: string }>(
        `select inv.id_inversion, i.v_nombre_completo as inversionista,
          (inv.val_monto - coalesce(sum(f.valor_asignado), 0))::numeric as saldo_disponible
         from "Creditos"."TBL_INVERSIONES" inv
         inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
         left join "Creditos"."TBL_CREDITO_FONDEO" f on f.id_inversion = inv.id_inversion
         where inv.id_inversion = $1
         group by inv.id_inversion, inv.val_monto, i.v_nombre_completo
         for update of inv`,
        [input.idInversion]
      );
      if (!inversion.rowCount) throw new SecurityError('Inversion no encontrada', 404);
      const saldo = Number(inversion.rows[0].saldo_disponible);
      if (input.valorAsignado > saldo) {
        throw new SecurityError(`La inversion solo tiene ${saldo} disponible para fondear`, 400);
      }

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_FONDEO" (
          id_credito, id_inversion, valor_asignado, observacion, id_usuario
        ) values ($1,$2,$3,$4,$5)`,
        [
          creditoId,
          input.idInversion,
          roundMoney(input.valorAsignado),
          input.observacion?.trim() || null,
          input.usuarioId ?? null
        ]
      );

      await addCreditoHistory(
        client,
        creditoId,
        null,
        'FONDEO_ASIGNADO',
        null,
        'ASIGNADO',
        input.observacion?.trim() || `${inversion.rows[0].inversionista}: ${roundMoney(input.valorAsignado)}`,
        input.usuarioId
      );

      await client.query('commit');
      return getCreditoExpediente(creditoId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function registrarPagoCredito(creditoId: number, input: RegistrarPagoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoCuotasTable(client);
      await ensureCreditoPagosTable(client);

      const credito = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1 for update of c`, [creditoId]);
      if (!credito.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);
      if (!Number.isFinite(input.valorPago) || input.valorPago <= 0) {
        throw new SecurityError('El valor del pago debe ser mayor a cero', 400);
      }
      if (!input.fechaPago) throw new SecurityError('La fecha del pago es obligatoria', 400);

      await recalcularMoraCredito(client, creditoId);

      const cuotas = await client.query<CreditoCuotaRow>(
        `select *
         from "Creditos"."TBL_CREDITO_CUOTAS"
         where id_credito = $1 and estado <> 'PAGADA'
         order by numero_cuota
         for update`,
        [creditoId]
      );
      if (!cuotas.rowCount) {
        throw new SecurityError('Este credito no tiene cuotas pendientes para aplicar pagos', 400);
      }

      const pagoCreado = await client.query<{ id_credito_pago: number }>(
        `insert into "Creditos"."TBL_CREDITO_PAGOS" (
          id_credito, fecha_pago, valor_pago, medio_pago, referencia_pago, observacion, id_usuario
        ) values ($1,$2,$3,$4,$5,$6,$7)
        returning id_credito_pago`,
        [
          creditoId,
          input.fechaPago,
          roundMoney(input.valorPago),
          input.medioPago?.trim() || null,
          input.referenciaPago?.trim() || null,
          input.observacion?.trim() || null,
          input.usuarioId ?? null
        ]
      );

      let restante = roundMoney(input.valorPago);
      for (const cuota of cuotas.rows) {
        if (restante <= 0) break;

        const saldoCuota = Math.max(0, roundMoney(Number(cuota.valor_cuota) + Number(cuota.valor_mora) - Number(cuota.valor_pagado)));
        if (saldoCuota <= 0) continue;

        const aplicado = Math.min(restante, saldoCuota);
        const nuevoPagado = roundMoney(Number(cuota.valor_pagado) + aplicado);
        const nuevoEstado = nuevoPagado >= roundMoney(Number(cuota.valor_cuota) + Number(cuota.valor_mora)) ? 'PAGADA' : cuota.estado;

        const moraPendiente = Math.max(0, Number(cuota.valor_mora) - Number(cuota.mora_pagada));
        const capitalPendiente = Math.max(0, Number(cuota.capital) - Number(cuota.capital_pagado));
        const interesPendiente = Math.max(0, Number(cuota.interes) - Number(cuota.interes_pagado));
        const cargosPendientes = Math.max(0, Number(cuota.cargos) - Number(cuota.cargos_pagados));
        let porAplicar = aplicado;
        const moraAplicada = Math.min(porAplicar, moraPendiente);
        porAplicar = roundMoney(porAplicar - moraAplicada);
        const cargosAplicados = Math.min(porAplicar, cargosPendientes);
        porAplicar = roundMoney(porAplicar - cargosAplicados);
        const interesAplicado = Math.min(porAplicar, interesPendiente);
        porAplicar = roundMoney(porAplicar - interesAplicado);
        const capitalAplicado = Math.min(porAplicar, capitalPendiente);

        await client.query(
          `update "Creditos"."TBL_CREDITO_CUOTAS"
           set mora_pagada = mora_pagada + $2,
               cargos_pagados = cargos_pagados + $3,
               interes_pagado = interes_pagado + $4,
               capital_pagado = capital_pagado + $5,
               valor_pagado = $6,
               fecha_ultimo_pago = $7,
               estado = $8
           where id_credito_cuota = $1`,
          [
            cuota.id_credito_cuota,
            roundMoney(moraAplicada),
            roundMoney(cargosAplicados),
            roundMoney(interesAplicado),
            roundMoney(capitalAplicado),
            nuevoPagado,
            input.fechaPago,
            nuevoEstado
          ]
        );

        restante = roundMoney(restante - aplicado);
      }

      if (restante > 0) {
        await client.query(
          `update "Creditos"."TBL_CREDITO_PAGOS"
           set saldo_favor = $2
           where id_credito_pago = $1`,
          [pagoCreado.rows[0].id_credito_pago, restante]
        );
      }

      const saldoPendiente = await client.query<{ saldo: string }>(
        `select coalesce(sum(valor_cuota + valor_mora - valor_pagado), 0)::numeric as saldo
         from "Creditos"."TBL_CREDITO_CUOTAS"
         where id_credito = $1`,
        [creditoId]
      );

      await client.query(
        `update "Creditos"."TBL_CREDITOS"
         set v_valor_pendiente = $2,
             v_estado_solicitud = case when $2::numeric <= 0 then 'PAGADO' else v_estado_solicitud end,
             fec_actualizacion = now()
         where id_credito = $1`,
        [creditoId, roundMoney(Number(saldoPendiente.rows[0]?.saldo ?? 0))]
      );

      await addCreditoHistory(
        client,
        creditoId,
        null,
        'PAGO_REGISTRADO',
        credito.rows[0].estado,
        restante > 0 ? 'PAGO_CON_SALDO_A_FAVOR' : 'PAGO_APLICADO',
        `${roundMoney(input.valorPago)} aplicado a cartera${restante > 0 ? `; saldo sin aplicar ${restante}` : ''}`,
        input.usuarioId
      );

      await client.query('commit');
      return getCreditoExpediente(creditoId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function uploadCreditoPagoSoporte(pagoId: number, input: UploadCreditoPagoSoporteInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoPagoSoportesTable(client);

      const pago = await client.query<{ id_credito_pago: number; id_credito: number; valor_pago: string }>(
        `select id_credito_pago, id_credito, valor_pago
         from "Creditos"."TBL_CREDITO_PAGOS"
         where id_credito_pago = $1
         for update`,
        [pagoId]
      );
      if (!pago.rowCount) throw new SecurityError('Pago no encontrado', 404);

      const hash = crypto.createHash('sha256').update(input.content).digest('hex');
      await client.query(
        `insert into "Creditos"."TBL_CREDITO_PAGO_SOPORTES" (
          id_credito_pago, nombre_archivo, mime_type, tamano_bytes, contenido,
          hash_archivo, id_usuario, observacion
        ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          pagoId,
          input.fileName,
          input.mimeType,
          input.content.length,
          input.content,
          hash,
          input.usuarioId ?? null,
          input.observacion?.trim() || null
        ]
      );

      await addCreditoHistory(
        client,
        pago.rows[0].id_credito,
        null,
        'SOPORTE_PAGO_CARGADO',
        null,
        'CARGADO',
        input.observacion?.trim() || `Soporte de pago ${pagoId}: ${input.fileName}`,
        input.usuarioId
      );

      await client.query('commit');
      return getCreditoExpediente(pago.rows[0].id_credito);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function getCreditoPagoSoporteArchivo(pagoId: number) {
  return withClient(async (client) => {
    await ensureCreditoPagoSoportesTable(client);
    const result = await client.query<CreditoPagoSoporteFileRow>(
      `select nombre_archivo, mime_type, contenido
       from "Creditos"."TBL_CREDITO_PAGO_SOPORTES"
       where id_credito_pago = $1
       order by fec_creacion desc, id_credito_pago_soporte desc
       limit 1`,
      [pagoId]
    );
    if (!result.rowCount) throw new SecurityError('Este pago no tiene soporte cargado', 404);
    return result.rows[0];
  });
}

export async function registrarDesembolso(creditoId: number, input: RegistrarDesembolsoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoDesembolsosTable(client);
      await ensureCreditoFondeoTable(client);
      const credito = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1 for update of c`, [creditoId]);
      if (!credito.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);
      if (!Number.isFinite(input.valorDesembolso) || input.valorDesembolso <= 0) {
        throw new SecurityError('El valor desembolsado debe ser mayor a cero', 400);
      }
      if (!input.fechaDesembolso) throw new SecurityError('La fecha de desembolso es obligatoria', 400);
      if (input.idInversion) {
        const valorFondeo = input.valorFondeo ?? input.valorDesembolso;
        if (!Number.isFinite(valorFondeo) || valorFondeo <= 0) {
          throw new SecurityError('El valor fondeado debe ser mayor a cero', 400);
        }

        const inversion = await client.query<InversionFondeoRow>(
          `select inv.id_inversion, i.v_nombre_completo as inversionista,
            (inv.val_monto - coalesce(sum(f.valor_asignado), 0))::numeric as saldo_disponible
           from "Creditos"."TBL_INVERSIONES" inv
           inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
           left join "Creditos"."TBL_CREDITO_FONDEO" f on f.id_inversion = inv.id_inversion
           where inv.id_inversion = $1
           group by inv.id_inversion, inv.val_monto, i.v_nombre_completo
           for update of inv`,
          [input.idInversion]
        );
        if (!inversion.rowCount) throw new SecurityError('Inversion no encontrada', 404);
        const saldo = Number(inversion.rows[0].saldo_disponible);
        if (valorFondeo > saldo) {
          throw new SecurityError(`La inversion solo tiene ${saldo} disponible para fondear`, 400);
        }

        await client.query(
          `insert into "Creditos"."TBL_CREDITO_FONDEO" (
            id_credito, id_inversion, valor_asignado, observacion, id_usuario
          ) values ($1,$2,$3,$4,$5)`,
          [
            creditoId,
            input.idInversion,
            roundMoney(valorFondeo),
            input.observacion?.trim() || 'Asignado desde registro de desembolso',
            input.usuarioId ?? null
          ]
        );

        await addCreditoHistory(
          client,
          creditoId,
          null,
          'FONDEO_ASIGNADO',
          null,
          'ASIGNADO',
          `${inversion.rows[0].inversionista}: ${roundMoney(valorFondeo)}`,
          input.usuarioId
        );
      }

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_DESEMBOLSOS" (
          id_credito, valor_desembolso, fecha_desembolso, banco_destino,
          tipo_cuenta, numero_cuenta, referencia_pago, observacion, id_usuario
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          creditoId,
          roundMoney(input.valorDesembolso),
          input.fechaDesembolso,
          input.bancoDestino?.trim() || null,
          input.tipoCuenta?.trim() || null,
          input.numeroCuenta?.trim() || null,
          input.referenciaPago?.trim() || null,
          input.observacion?.trim() || null,
          input.usuarioId ?? null
        ]
      );

      await client.query(
        `update "Creditos"."TBL_CREDITOS"
         set v_estado_solicitud = 'DESEMBOLSADO',
             v_valor_pendiente = val_monto_solicitado,
             fec_actualizacion = now()
         where id_credito = $1`,
        [creditoId]
      );

      await generarCuotasDefinitivas(client, credito.rows[0], input);

      await addCreditoHistory(
        client,
        creditoId,
        null,
        'DESEMBOLSO_REGISTRADO',
        credito.rows[0].estado,
        'DESEMBOLSADO',
        input.observacion?.trim() || `Desembolso registrado por ${roundMoney(input.valorDesembolso)}`,
        input.usuarioId
      );

      await client.query('commit');
      return getCreditoExpediente(creditoId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function decideCredito(creditoId: number, input: DecideCreditoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoDecisionesTable(client);
      const credito = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1 for update of c`, [creditoId]);
      if (!credito.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);

      const row = credito.rows[0];
      const monto = input.montoAprobado ?? Number(row.val_monto_solicitado);
      const plazo = input.plazoAprobado ?? row.num_plazo;
      const tasa = input.tasaAprobada ?? (row.val_tasa ? Number(row.val_tasa) : null);
      if (input.decision === 'APROBADO') {
        if (!monto || monto <= 0) throw new SecurityError('El monto aprobado debe ser mayor a cero', 400);
        if (!plazo || plazo <= 0) throw new SecurityError('El plazo aprobado debe ser mayor a cero', 400);
      }
      const cuota = input.cuotaAprobada ?? (tasa ? calculateInstallment(monto, tasa / 100, plazo) : monto / plazo);

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_DECISIONES" (
          id_credito, decision, monto_aprobado, plazo_aprobado, tasa_aprobada, cuota_aprobada, observacion, id_usuario
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          creditoId,
          input.decision,
          input.decision === 'APROBADO' ? roundMoney(monto) : null,
          input.decision === 'APROBADO' ? plazo : null,
          input.decision === 'APROBADO' ? tasa : null,
          input.decision === 'APROBADO' ? roundMoney(cuota) : null,
          input.observacion?.trim() || null,
          input.usuarioId ?? null
        ]
      );

      const estadoSolicitud = input.decision === 'APROBADO'
        ? 'EN_APROBACION'
        : input.decision === 'RECHAZADO'
          ? 'RECHAZADO'
          : 'DEVUELTO';

      await client.query(
        `update "Creditos"."TBL_CREDITOS"
         set val_monto_solicitado = case when $2 = 'APROBADO' then $3 else val_monto_solicitado end,
             num_plazo = case when $2 = 'APROBADO' then $4 else num_plazo end,
             val_tasa = case when $2 = 'APROBADO' then $5 else val_tasa end,
             val_cuota_estimada = case when $2 = 'APROBADO' then $6 else val_cuota_estimada end,
             v_valor_credito = case when $2 = 'APROBADO' then $3 else v_valor_credito end,
             v_cant_meses = case when $2 = 'APROBADO' then $4 else v_cant_meses end,
             v_valor_taza_mensual = case when $2 = 'APROBADO' then $5 else v_valor_taza_mensual end,
             v_valor_cuota = case when $2 = 'APROBADO' then $6 else v_valor_cuota end,
             v_estado_solicitud = $7,
             fec_actualizacion = now()
         where id_credito = $1`,
        [creditoId, input.decision, roundMoney(monto), plazo, tasa, roundMoney(cuota), estadoSolicitud]
      );

      await addCreditoHistory(
        client,
        creditoId,
        null,
        `DECISION_${input.decision}`,
        row.estado,
        estadoSolicitud,
        input.observacion?.trim() || `Decision ${input.decision.toLowerCase()} registrada`,
        input.usuarioId
      );

      if (input.decision === 'RECHAZADO') {
        await client.query(
          `update "Creditos"."TBL_CREDITO_ETAPAS"
           set estado_etapa = case when estado_etapa = 'EN_PROCESO' then 'RECHAZADA' else estado_etapa end,
               fec_fin = case when estado_etapa = 'EN_PROCESO' then now() else fec_fin end,
               fec_actualizacion = now()
           where id_credito = $1`,
          [creditoId]
        );
      }

      await client.query('commit');
      return getCreditoExpediente(creditoId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function updateCreditoDocumento(documentoId: number, input: UpdateCreditoDocumentoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoDocumentoArchivosTable(client);
      const current = await client.query<DocumentoCreditoRow>(
        `select cd.*, d.des_documento as documento
         from "Creditos"."TBL_CREDITO_DOCUMENTOS" cd
         inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = cd.id_documento_credito
         where cd.id_credito_documento = $1
         for update`,
        [documentoId]
      );
      if (!current.rowCount) throw new SecurityError('Documento de credito no encontrado', 404);

      const row = current.rows[0];
      await client.query(
        `update "Creditos"."TBL_CREDITO_DOCUMENTOS"
         set estado_documento = $1,
             v_archivo_url = coalesce($2, v_archivo_url),
             fec_actualizacion = now()
         where id_credito_documento = $3`,
        [input.estado, input.archivoUrl?.trim() || null, documentoId]
      );

      await addCreditoHistory(
        client,
        row.id_credito,
        null,
        `DOCUMENTO_${input.estado}`,
        row.estado_documento,
        input.estado,
        input.observacion?.trim() || row.documento,
        input.usuarioId
      );

      await client.query('commit');
      return getCreditoExpediente(row.id_credito);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function uploadCreditoDocumento(documentoId: number, input: UploadCreditoDocumentoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoDocumentoArchivosTable(client);
      const current = await client.query<DocumentoCreditoRow>(
        `select cd.*, d.des_documento as documento
         from "Creditos"."TBL_CREDITO_DOCUMENTOS" cd
         inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = cd.id_documento_credito
         where cd.id_credito_documento = $1
         for update`,
        [documentoId]
      );
      if (!current.rowCount) throw new SecurityError('Documento de credito no encontrado', 404);
      const row = current.rows[0];
      const hash = crypto.createHash('sha256').update(input.content).digest('hex');

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS" (
          id_credito_documento, nombre_archivo, mime_type, tamano_bytes, contenido,
          hash_archivo, id_usuario, observacion
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          documentoId,
          input.fileName,
          input.mimeType,
          input.content.length,
          input.content,
          hash,
          input.usuarioId ?? null,
          input.observacion?.trim() || null
        ]
      );

      await client.query(
        `update "Creditos"."TBL_CREDITO_DOCUMENTOS"
         set estado_documento = 'CARGADO',
             v_archivo_url = $1,
             fec_actualizacion = now()
         where id_credito_documento = $2`,
        [`db:${hash}`, documentoId]
      );

      await addCreditoHistory(
        client,
        row.id_credito,
        null,
        'DOCUMENTO_CARGADO',
        row.estado_documento,
        'CARGADO',
        input.observacion?.trim() || `${row.documento}: ${input.fileName}`,
        input.usuarioId
      );

      await client.query('commit');
      return getCreditoExpediente(row.id_credito);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function getCreditoDocumentoArchivo(documentoId: number) {
  return withClient(async (client) => {
    await ensureCreditoDocumentoArchivosTable(client);
    const result = await client.query<{
      nombre_archivo: string;
      mime_type: string;
      contenido: Buffer;
    }>(
      `select nombre_archivo, mime_type, contenido
       from "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS"
       where id_credito_documento = $1
       order by fec_creacion desc, id_credito_documento_archivo desc
       limit 1`,
      [documentoId]
    );
    if (!result.rowCount) throw new SecurityError('Este documento no tiene archivo cargado', 404);
    return result.rows[0];
  });
}
