import crypto from 'node:crypto';
import type { ClientLike } from '../../lib/db.js';
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
  idEmpleadoEmpresa?: number | null;
  idEmpresa?: number | null;
  montoSolicitado: number;
  plazo: number;
  tasa?: number | null;
}

export interface RegistrarLiquidacionDefinitivaInput {
  observacion?: string | null;
  usuarioId?: number | null;
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

interface LiquidacionDefinitivaCreditoRow {
  id_credito_liquidacion_final: number;
  id_credito: number;
  numero_version: number;
  estado: string;
  monto_solicitado: string;
  monto_aprobado: string | null;
  plazo: number;
  tasa_mensual: string;
  cuota: string;
  cargos_financiados: string;
  descuentos_desembolso: string;
  iva: string;
  valor_desembolso: string;
  valor_credito: string;
  total_intereses: string;
  total_pagar: string;
  conceptos: unknown;
  plan_pagos: unknown;
  observacion: string | null;
  usuario: string | null;
  fec_creacion: Date;
}

interface EvaluacionCreditoRow {
  id_credito_evaluacion: number;
  recomendacion: string;
  puntaje: number;
  nivel_riesgo: string;
  bloqueos: unknown;
  alertas: unknown;
  positivos: unknown;
  metricas: unknown;
  observacion: string | null;
  usuario: string | null;
  fec_creacion: Date;
}

interface DecisionCreditoRow {
  id_credito_decision: number;
  decision: string;
  monto_aprobado: string | null;
  plazo_aprobado: number | null;
  tasa_aprobada: string | null;
  cuota_aprobada: string | null;
  observacion: string | null;
  id_usuario: number | null;
  requiere_comite: boolean | null;
  votos_requeridos: number | null;
  estado_comite: string | null;
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
  numero_orden: string | null;
  estado_desembolso: string | null;
  fecha_orden: string | null;
  fecha_ejecucion: string | null;
  comprobante_pago: string | null;
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
  capital_causado: string;
  interes_causado: string;
  cargos_causados: string;
  mora_causada: string;
  fecha_causacion: string | null;
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
  tipo_recaudo: string | null;
  periodo_nomina: string | null;
  estado_pago: string | null;
  observacion: string | null;
  usuario: string | null;
  soportes: number;
  soporte_nombre: string | null;
  soporte_mime_type: string | null;
  fec_creacion: Date;
}

interface CreditoMovimientoContableRow {
  id_credito_movimiento: number;
  fecha_movimiento: string;
  tipo_movimiento: string;
  concepto: string;
  debito: string;
  credito: string;
  saldo_contable: string;
  cartera_causada: string;
  interes_causado: string;
  mora_causada: string;
  recaudo_aplicado: string;
  referencia_tipo: string | null;
  referencia_id: number | null;
  observacion: string | null;
  usuario: string | null;
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
  numeroOrden?: string | null;
  comprobantePago?: string | null;
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
  tipoRecaudo?: string | null;
  periodoNomina?: string | null;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface RegistrarRecaudoMasivoInput {
  fechaPago: string;
  periodoNomina: string;
  referenciaLote?: string | null;
  observacion?: string | null;
  usuarioId?: number | null;
  pagos: Array<{
    creditoId?: number | null;
    consecutivo?: string | null;
    identificacionCliente?: string | null;
    valorPago: number;
    referenciaPago?: string | null;
    observacion?: string | null;
  }>;
}

export interface CausarCreditoInput {
  fechaCorte: string;
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface AnularOperacionCreditoInput {
  observacion?: string | null;
  usuarioId?: number | null;
}

export interface ReversarPagoInput {
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
  porcentaje_endeudamiento_maximo: string | null;
  antiguedad_minima_meses: number | null;
  requiere_empleado_activo: boolean | null;
  bloquea_embargos: boolean | null;
}

interface SimulacionAtributoRow {
  id_producto_atributo: number;
  nombre: string;
  tipo_atributo: string;
  tipo_calculo: string;
  valor: string | null;
  porcentaje: string | null;
  valor2: string | null;
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

async function withClient<T>(runner: (client: ClientLike) => Promise<T>) {
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



async function ensureCreditoConveniosTable(client: ClientLike) {
  await client.query([
    'create table if not exists "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" (',
    'id_producto_convenio serial primary key,',
    'id_producto_credito integer not null references "Creditos"."TBL_PRODUCTOS_CREDITO"(id_producto_credito) on delete cascade,',
    'id_empresa integer not null references "Creditos"."TBL_EMPRESAS"(id_empresa),',
    'cupo_total numeric(18,2) null,',
    'cupo_usado numeric(18,2) not null default 0,',
    'porcentaje_endeudamiento_maximo numeric(8,4) null,',
    'requiere_validacion_pagaduria boolean not null default true,',
    'vigencia_desde date null,',
    'vigencia_hasta date null,',
    'activo boolean not null default true,',
    'observacion text null,',
    'fec_creacion timestamp not null default now(),',
    'unique (id_producto_credito, id_empresa)',
    ')'
  ].join(' '));
}

async function validarConvenioProducto(client: ClientLike, productoId: number, empresaId: number | null | undefined, monto: number) {
  await ensureCreditoConveniosTable(client);
  const total = await client.query<{ total: number }>('select count(*)::int as total from "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" where id_producto_credito = $1', [productoId]);
  if (!total.rows[0]?.total) return { requerido: false, alertas: [] as string[], bloqueos: [] as string[], convenio: null as null | Record<string, unknown> };
  const alertas: string[] = [];
  const bloqueos: string[] = [];
  if (!empresaId) {
    bloqueos.push('Este producto requiere empresa con convenio activo.');
    return { requerido: true, alertas, bloqueos, convenio: null };
  }
  const result = await client.query<{ id_producto_convenio: number; empresa: string; cupo_total: string | null; cupo_usado: string | null; vigencia_desde: string | null; vigencia_hasta: string | null; activo: boolean; requiere_validacion_pagaduria: boolean }>(
    'select c.*, e.v_razon_social as empresa from "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" c inner join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa where c.id_producto_credito = $1 and c.id_empresa = $2 limit 1',
    [productoId, empresaId]
  );
  if (!result.rowCount) {
    bloqueos.push('La empresa seleccionada no tiene convenio para este producto.');
    return { requerido: true, alertas, bloqueos, convenio: null };
  }
  const row = result.rows[0];
  const today = new Date().toISOString().slice(0, 10);
  if (!row.activo) bloqueos.push('El convenio con la empresa esta inactivo.');
  if (row.vigencia_desde && row.vigencia_desde > today) bloqueos.push('El convenio aun no esta vigente.');
  if (row.vigencia_hasta && row.vigencia_hasta < today) bloqueos.push('El convenio esta vencido.');
  const cupoTotal = row.cupo_total ? Number(row.cupo_total) : null;
  const cupoUsado = row.cupo_usado ? Number(row.cupo_usado) : 0;
  const cupoDisponible = cupoTotal === null ? null : Math.max(cupoTotal - cupoUsado, 0);
  if (cupoDisponible !== null && monto > cupoDisponible) bloqueos.push('El monto solicitado supera el cupo disponible del convenio.');
  if (cupoDisponible !== null && monto <= cupoDisponible && monto >= cupoDisponible * 0.9) alertas.push('El credito consume mas del 90% del cupo disponible del convenio.');
  return { requerido: true, alertas, bloqueos, convenio: { id: row.id_producto_convenio, empresa: row.empresa, cupoTotal, cupoUsado, cupoDisponible, requiereValidacionPagaduria: row.requiere_validacion_pagaduria } };
}

async function ensureProductoReglasColumns(client: ClientLike) {
  await client.query(`
    alter table "Creditos"."TBL_PRODUCTOS_CREDITO"
      add column if not exists porcentaje_endeudamiento_maximo numeric(8,4) null,
      add column if not exists antiguedad_minima_meses integer null,
      add column if not exists requiere_empleado_activo boolean not null default true,
      add column if not exists bloquea_embargos boolean not null default true
  `);
}

async function evaluarCapacidadLibranza(client: ClientLike, product: SimulacionProductoRow, input: { idEmpleadoEmpresa?: number | null }, cuota: number) {
  const reglas = {
    porcentajeEndeudamientoMaximo: product.porcentaje_endeudamiento_maximo ? Number(product.porcentaje_endeudamiento_maximo) : 40,
    antiguedadMinimaMeses: product.antiguedad_minima_meses ?? 0,
    requiereEmpleadoActivo: product.requiere_empleado_activo ?? true,
    bloqueaEmbargos: product.bloquea_embargos ?? true
  };
  const alertas: string[] = [];
  const bloqueos: string[] = [];
  if (!input.idEmpleadoEmpresa) {
    alertas.push('Selecciona un empleado para calcular capacidad de pago y reglas de libranza.');
    return { aprobado: true, requiereRevision: true, alertas, bloqueos, reglas, empleado: null, capacidad: null };
  }
  const empleado = await client.query<{ id_empleado_empresa: number; nombre: string | null; salario: string | null; neto: string | null; tiene_embargos: boolean | null; fecha_ingreso: string | null; estado: string | null }>(
    `select emp.id_empleado_empresa, emp.v_nombre_completo as nombre, emp.val_salario as salario, emp.val_neto as neto,
        emp.ind_tiene_embargos as tiene_embargos, emp.fec_ingreso::text as fecha_ingreso, est.v_descripcion as estado
       from "Creditos"."TBL_EMPLEADOS_EMPRESA" emp
       left join "Creditos"."TBL_ESTADOS" est on est.id_estado = emp.id_estado
       where emp.id_empleado_empresa = $1 limit 1`,
    [input.idEmpleadoEmpresa]
  );
  if (!empleado.rowCount) {
    bloqueos.push('Empleado asociado no encontrado.');
    return { aprobado: false, requiereRevision: false, alertas, bloqueos, reglas, empleado: null, capacidad: null };
  }
  const row = empleado.rows[0];
  const salario = row.salario ? Number(row.salario) : 0;
  const neto = row.neto ? Number(row.neto) : salario;
  const base = neto > 0 ? neto : salario;
  const capacidadMaxima = roundMoney(base * (reglas.porcentajeEndeudamientoMaximo / 100));
  const usoCapacidad = capacidadMaxima > 0 ? roundMoney((cuota / capacidadMaxima) * 100) : null;
  const estadoActivo = normalizeKey(row.estado ?? '') === 'ACTIVO';
  const fechaIngreso = row.fecha_ingreso ? new Date(row.fecha_ingreso + 'T00:00:00') : null;
  const antiguedadMeses = fechaIngreso && !Number.isNaN(fechaIngreso.getTime())
    ? Math.max(0, (new Date().getFullYear() - fechaIngreso.getFullYear()) * 12 + (new Date().getMonth() - fechaIngreso.getMonth()))
    : null;

  if (reglas.requiereEmpleadoActivo && !estadoActivo) bloqueos.push('El empleado no esta activo en la pagaduria.');
  if (reglas.bloqueaEmbargos && row.tiene_embargos) bloqueos.push('El empleado registra embargos y el producto los bloquea.');
  if (reglas.antiguedadMinimaMeses > 0 && (antiguedadMeses === null || antiguedadMeses < reglas.antiguedadMinimaMeses)) bloqueos.push('Antiguedad insuficiente: requiere ' + reglas.antiguedadMinimaMeses + ' meses.');
  if (capacidadMaxima <= 0) bloqueos.push('No hay salario/neto disponible para calcular capacidad.');
  if (capacidadMaxima > 0 && cuota > capacidadMaxima) bloqueos.push('La cuota supera la capacidad maxima permitida (' + reglas.porcentajeEndeudamientoMaximo + '%).');
  if (usoCapacidad !== null && usoCapacidad >= 90 && cuota <= capacidadMaxima) alertas.push('La cuota queda muy cerca del limite de capacidad.');

  return {
    aprobado: bloqueos.length === 0,
    requiereRevision: alertas.length > 0,
    alertas,
    bloqueos,
    reglas,
    empleado: { id: row.id_empleado_empresa, nombre: row.nombre, salario: roundMoney(salario), neto: roundMoney(base), estado: row.estado, tieneEmbargos: Boolean(row.tiene_embargos), antiguedadMeses },
    capacidad: { base: roundMoney(base), cuota, capacidadMaxima, disponible: roundMoney(Math.max(capacidadMaxima - cuota, 0)), usoCapacidad }
  };
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


function inferFormulaRuntime(row: { tipo_calculo: string; formula_codigo?: string | null; base_calculo?: string | null; operacion?: string | null }) {
  const key = normalizeKey(`${row.formula_codigo ?? ''} ${row.tipo_calculo}`);
  const base = row.base_calculo ?? (key.includes('DESEMBOLSO') ? 'VALOR_DESEMBOLSO' : key.includes('SALDO') ? 'SALDO' : key.includes('SMLMV') ? 'SMLMV' : key.includes('CUOTA') ? 'CUOTA' : 'VALOR_CREDITO');
  const operacion = row.operacion ?? (key.includes('VALOR2') ? 'BASE_POR_VALOR_DIV_VALOR2' : key.includes('PLAZO') && key.includes('VALOR') ? 'VALOR_POR_PLAZO' : key.includes('%') ? 'PORCENTAJE' : 'VALOR_FIJO');
  return { base, operacion };
}

function getFormulaBase(base: string, context: { monto: number; valorCredito: number; valorDesembolso: number; saldo: number; smlmv: number; cuota: number }) {
  if (base === 'VALOR_DESEMBOLSO') return context.valorDesembolso;
  if (base === 'SALDO') return context.saldo;
  if (base === 'SMLMV') return context.smlmv;
  if (base === 'CUOTA') return context.cuota;
  if (base === 'VALOR') return context.monto;
  return context.valorCredito;
}

function calculateFormulaValue(row: SimulacionAtributoRow, context: { monto: number; valorCredito: number; valorDesembolso: number; saldo: number; smlmv: number; cuota: number; plazo: number }) {
  const formula = inferFormulaRuntime(row);
  const base = getFormulaBase(formula.base, context);
  const valor = row.valor ? Number(row.valor) : 0;
  const valor2 = row.valor2 ? Number(row.valor2) : 0;
  const porcentaje = row.porcentaje ? Number(row.porcentaje) : null;
  if (formula.operacion === 'PORCENTAJE') return porcentaje !== null ? (base * porcentaje) / 100 : 0;
  if (formula.operacion === 'VALOR_POR_PLAZO') return valor * context.plazo;
  if (formula.operacion === 'BASE_POR_VALOR_DIV_VALOR2') return valor2 ? (base * valor) / valor2 : 0;
  return valor;
}
function calculateInstallment(principal: number, monthlyRate: number, months: number) {
  if (monthlyRate <= 0) return principal / months;
  return principal * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

async function getActiveStateId(client: ClientLike) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );
  return result.rows[0]?.id_estado ?? null;
}


async function ensureParametrosFinancierosTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_PARAMETROS_FINANCIEROS" (
      id_parametro_financiero serial primary key,
      codigo varchar(40) not null,
      nombre varchar(120) not null,
      valor numeric(18,6) not null,
      unidad varchar(20) not null default 'VALOR',
      vigencia_desde date not null,
      vigencia_hasta date null,
      activo boolean not null default true,
      fec_creacion timestamp not null default now()
    )
  `);
  await client.query('create index if not exists idx_parametros_financieros_codigo_vigencia on "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, vigencia_desde, vigencia_hasta)');
  await client.query(`
    insert into "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, nombre, valor, unidad, vigencia_desde)
    select 'SMLMV', 'Salario minimo legal mensual vigente', 1300000, 'VALOR', date '2024-01-01'
    where not exists (select 1 from "Creditos"."TBL_PARAMETROS_FINANCIEROS" where codigo = 'SMLMV')
  `);
  await client.query(`
    insert into "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, nombre, valor, unidad, vigencia_desde)
    select 'IVA', 'Impuesto al valor agregado', 19, 'PORCENTAJE', date '2024-01-01'
    where not exists (select 1 from "Creditos"."TBL_PARAMETROS_FINANCIEROS" where codigo = 'IVA')
  `);
}

async function getParametroFinanciero(client: ClientLike, codigo: string, fecha = new Date()) {
  await ensureParametrosFinancierosTable(client);
  const result = await client.query<{ valor: string }>(
    `select valor
     from "Creditos"."TBL_PARAMETROS_FINANCIEROS"
     where codigo = $1
       and activo = true
       and vigencia_desde <= $2::date
       and (vigencia_hasta is null or vigencia_hasta >= $2::date)
     order by vigencia_desde desc
     limit 1`,
    [codigo, fecha]
  );
  return result.rows[0]?.valor ? Number(result.rows[0].valor) : null;
}

async function ensureCreditoMovimientosContablesTable(client: ClientLike) {
  await client.query([
    'create table if not exists "Creditos"."TBL_CREDITO_MOVIMIENTOS_CONTABLES" (',
    'id_credito_movimiento serial primary key,',
    'id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,',
    'fecha_movimiento date not null,',
    'tipo_movimiento varchar(40) not null,',
    'concepto varchar(180) not null,',
    'debito numeric(18,2) not null default 0,',
    'credito numeric(18,2) not null default 0,',
    'saldo_contable numeric(18,2) not null default 0,',
    'cartera_causada numeric(18,2) not null default 0,',
    'interes_causado numeric(18,2) not null default 0,',
    'mora_causada numeric(18,2) not null default 0,',
    'recaudo_aplicado numeric(18,2) not null default 0,',
    'referencia_tipo varchar(60) null,',
    'referencia_id integer null,',
    'observacion text null,',
    'id_usuario integer null,',
    'fec_creacion timestamp without time zone not null default now()',
    ')'
  ].join(' '));
}

async function ensureCreditoPagoAplicacionesTable(client: ClientLike) {
  await ensureCreditoPagosTable(client);
  await ensureCreditoCuotasTable(client);
  await client.query([
    'create table if not exists "Creditos"."TBL_CREDITO_PAGO_APLICACIONES" (',
    'id_credito_pago_aplicacion serial primary key,',
    'id_credito_pago integer not null references "Creditos"."TBL_CREDITO_PAGOS"(id_credito_pago) on delete cascade,',
    'id_credito_cuota integer not null references "Creditos"."TBL_CREDITO_CUOTAS"(id_credito_cuota) on delete cascade,',
    'valor_aplicado numeric(18,2) not null,',
    'mora_aplicada numeric(18,2) not null default 0,',
    'cargos_aplicados numeric(18,2) not null default 0,',
    'interes_aplicado numeric(18,2) not null default 0,',
    'capital_aplicado numeric(18,2) not null default 0,',
    'reversado boolean not null default false,',
    'fec_creacion timestamp without time zone not null default now()',
    ')'
  ].join(' '));
}

async function registrarMovimientoContable(client: ClientLike, input: { creditoId: number; fecha: string; tipo: string; concepto: string; debito?: number; credito?: number; carteraCausada?: number; interesCausado?: number; moraCausada?: number; recaudoAplicado?: number; referenciaTipo?: string | null; referenciaId?: number | null; observacion?: string | null; usuarioId?: number | null }) {
  await ensureCreditoMovimientosContablesTable(client);
  const saldo = await client.query<{ saldo: string }>(
    `select coalesce(saldo_contable, 0)::numeric as saldo from "Creditos"."TBL_CREDITO_MOVIMIENTOS_CONTABLES" where id_credito = $1 order by fecha_movimiento desc, id_credito_movimiento desc limit 1`,
    [input.creditoId]
  );
  const debito = roundMoney(input.debito ?? 0);
  const credito = roundMoney(input.credito ?? 0);
  const saldoContable = roundMoney(Number(saldo.rows[0]?.saldo ?? 0) + debito - credito);
  await client.query(
    `insert into "Creditos"."TBL_CREDITO_MOVIMIENTOS_CONTABLES" (id_credito, fecha_movimiento, tipo_movimiento, concepto, debito, credito, saldo_contable, cartera_causada, interes_causado, mora_causada, recaudo_aplicado, referencia_tipo, referencia_id, observacion, id_usuario) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [input.creditoId, input.fecha, input.tipo, input.concepto, debito, credito, saldoContable, roundMoney(input.carteraCausada ?? 0), roundMoney(input.interesCausado ?? 0), roundMoney(input.moraCausada ?? 0), roundMoney(input.recaudoAplicado ?? 0), input.referenciaTipo ?? null, input.referenciaId ?? null, input.observacion?.trim() || null, input.usuarioId ?? null]
  );
}
async function ensureCreditoHistorialTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_HISTORIAL" (
      id_credito_historial serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_credito_etapa integer null references "Creditos"."TBL_CREDITO_ETAPAS"(id_credito_etapa) on delete set null,
      accion varchar(80) not null,
      estado_anterior varchar(40) null,
      estado_nuevo varchar(40) null,
      observacion text null,
      estado_pago varchar(30) not null default 'APLICADO',
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function ensureCreditoDocumentoArchivosTable(client: ClientLike) {
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

async function ensureCreditoEvaluacionesTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_EVALUACIONES" (
      id_credito_evaluacion serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      recomendacion varchar(20) not null,
      puntaje integer not null,
      nivel_riesgo varchar(20) not null,
      bloqueos jsonb not null default '[]'::jsonb,
      alertas jsonb not null default '[]'::jsonb,
      positivos jsonb not null default '[]'::jsonb,
      metricas jsonb not null default '{}'::jsonb,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp not null default now()
    )
  `);
}

async function ensureCreditoLiquidacionesFinalesTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" (
      id_credito_liquidacion_final serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      numero_version integer not null,
      estado varchar(30) not null default 'VIGENTE',
      monto_solicitado numeric(18,2) not null,
      monto_aprobado numeric(18,2) null,
      plazo integer not null,
      tasa_mensual numeric(10,4) not null default 0,
      cuota numeric(18,2) not null,
      cargos_financiados numeric(18,2) not null default 0,
      descuentos_desembolso numeric(18,2) not null default 0,
      iva numeric(18,2) not null default 0,
      valor_desembolso numeric(18,2) not null,
      valor_credito numeric(18,2) not null,
      total_intereses numeric(18,2) not null default 0,
      total_pagar numeric(18,2) not null default 0,
      conceptos jsonb not null default '[]'::jsonb,
      plan_pagos jsonb not null default '[]'::jsonb,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now(),
      unique (id_credito, numero_version)
    )
  `);
}

async function ensureCreditoDecisionesTable(client: ClientLike) {
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
      requiere_comite boolean not null default false,
      votos_requeridos integer null,
      estado_comite varchar(30) null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
  await client.query(`alter table "Creditos"."TBL_CREDITO_DECISIONES" add column if not exists requiere_comite boolean not null default false`);
  await client.query(`alter table "Creditos"."TBL_CREDITO_DECISIONES" add column if not exists votos_requeridos integer null`);
  await client.query(`alter table "Creditos"."TBL_CREDITO_DECISIONES" add column if not exists estado_comite varchar(30) null`);
}

async function ensureComiteAprobacionConfigTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_COMITE_CONFIG" (
      id_comite_config serial primary key,
      monto_desde numeric(18,2) not null,
      votos_requeridos integer not null default 2,
      activo boolean not null default true,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
  await client.query(`
    insert into "Creditos"."TBL_CREDITO_COMITE_CONFIG" (monto_desde, votos_requeridos, activo)
    select 50000000, 2, true
    where not exists (select 1 from "Creditos"."TBL_CREDITO_COMITE_CONFIG")
  `);
}

async function getComiteAprobacionConfig(client: ClientLike, monto: number) {
  await ensureComiteAprobacionConfigTable(client);
  const config = await client.query<{ monto_desde: string; votos_requeridos: number }>(
    `select monto_desde, votos_requeridos
     from "Creditos"."TBL_CREDITO_COMITE_CONFIG"
     where activo = true and $1 >= monto_desde
     order by monto_desde desc
     limit 1`,
    [monto]
  );
  return config.rows[0] ?? null;
}

async function ensureCreditoFirmasTable(client: ClientLike) {
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

async function ensureCreditoDesembolsosTable(client: ClientLike) {
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
  await client.query(`
    alter table "Creditos"."TBL_CREDITO_DESEMBOLSOS"
      add column if not exists numero_orden varchar(80) null,
      add column if not exists estado_desembolso varchar(30) not null default 'EJECUTADO',
      add column if not exists fecha_orden date null,
      add column if not exists fecha_ejecucion date null,
      add column if not exists comprobante_pago text null
  `);
}

async function ensureCreditoCuotasTable(client: ClientLike) {
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
      add column if not exists capital_causado numeric(18,2) not null default 0,
      add column if not exists interes_causado numeric(18,2) not null default 0,
      add column if not exists cargos_causados numeric(18,2) not null default 0,
      add column if not exists mora_causada numeric(18,2) not null default 0,
      add column if not exists fecha_causacion date null,
      add column if not exists fecha_ultimo_pago date null
  `);
}

async function ensureCreditoPagosTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_PAGOS" (
      id_credito_pago serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      fecha_pago date not null,
      valor_pago numeric(18,2) not null,
      saldo_favor numeric(18,2) not null default 0,
      medio_pago varchar(80) null,
      referencia_pago varchar(160) null,
      tipo_recaudo varchar(30) null,
      periodo_nomina varchar(20) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now(),
      constraint chk_credito_pago_valor check (valor_pago > 0)
    )
  `);
  await client.query(`
    alter table "Creditos"."TBL_CREDITO_PAGOS"
      add column if not exists saldo_favor numeric(18,2) not null default 0,
      add column if not exists tipo_recaudo varchar(30) null,
      add column if not exists periodo_nomina varchar(20) null,
      add column if not exists estado_pago varchar(30) not null default 'APLICADO'
  `);
}

async function ensureCreditoPagoSoportesTable(client: ClientLike) {
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

async function ensureCalendarioParamColumns(client: ClientLike) {
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

async function recalcularMoraCredito(client: ClientLike, creditoId: number) {
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

async function ensureCreditoFondeoTable(client: ClientLike) {
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
  client: ClientLike,
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

function mapLiquidacionDefinitiva(row: LiquidacionDefinitivaCreditoRow) {
  return {
    id: row.id_credito_liquidacion_final,
    creditoId: row.id_credito,
    version: row.numero_version,
    estado: row.estado,
    montoSolicitado: Number(row.monto_solicitado),
    montoAprobado: row.monto_aprobado ? Number(row.monto_aprobado) : null,
    plazo: row.plazo,
    tasaMensual: Number(row.tasa_mensual),
    cuota: Number(row.cuota),
    cargosFinanciados: Number(row.cargos_financiados),
    descuentosDesembolso: Number(row.descuentos_desembolso),
    iva: Number(row.iva),
    valorDesembolso: Number(row.valor_desembolso),
    valorCredito: Number(row.valor_credito),
    totalIntereses: Number(row.total_intereses),
    totalPagar: Number(row.total_pagar),
    conceptos: Array.isArray(row.conceptos) ? row.conceptos : [],
    planPagos: Array.isArray(row.plan_pagos) ? row.plan_pagos : [],
    observacion: row.observacion,
    usuario: row.usuario,
    fecha: row.fec_creacion
  };
}

function clasificarConceptoLiquidacion(row: LiquidacionCreditoRow) {
  const texto = [row.nombre, row.tipo_atributo, row.tipo_calculo].filter(Boolean).join(' ').toUpperCase();
  const valor = roundMoney(Number(row.valor_calculado ?? 0));
  if (texto.includes('INTERES') || texto.includes('INTERES')) return { valor, clase: 'INTERES' as const };
  if (texto.includes('DESEMBOLSO') || texto.includes('DESCUENTO')) return { valor, clase: 'DESCUENTO_DESEMBOLSO' as const };
  return { valor, clase: 'CARGO_FINANCIADO' as const };
}

async function construirLiquidacionDefinitiva(client: ClientLike, creditoId: number) {
  const creditoResult = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1`, [creditoId]);
  if (!creditoResult.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);
  const credito = creditoResult.rows[0];

  const decisionResult = await client.query<DecisionCreditoRow>(
    `select d.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
     from "Creditos"."TBL_CREDITO_DECISIONES" d
     left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = d.id_usuario
     where d.id_credito = $1 and d.decision = 'APROBADO'
     order by d.fec_creacion desc, d.id_credito_decision desc
     limit 1`,
    [creditoId]
  );
  const decision = decisionResult.rows[0] ?? null;

  const conceptosResult = await client.query<LiquidacionCreditoRow>(
    `select *
     from "Creditos"."TBL_CREDITO_LIQUIDACION"
     where id_credito = $1
     order by id_credito_liquidacion`,
    [creditoId]
  );

  const montoSolicitado = roundMoney(Number(credito.val_monto_solicitado));
  const montoAprobado = decision?.monto_aprobado ? roundMoney(Number(decision.monto_aprobado)) : montoSolicitado;
  const plazo = decision?.plazo_aprobado ?? credito.num_plazo;
  const tasaMensual = decision?.tasa_aprobada ? Number(decision.tasa_aprobada) : credito.val_tasa ? Number(credito.val_tasa) : 0;

  let cargosFinanciados = 0;
  let descuentosDesembolso = 0;
  let iva = 0;
  const porcentajeIva = await getParametroFinanciero(client, 'IVA') ?? 19;
  const conceptos = conceptosResult.rows.map((row) => {
    const clasificacion = clasificarConceptoLiquidacion(row);
    if (clasificacion.clase === 'CARGO_FINANCIADO') cargosFinanciados += clasificacion.valor;
    if (clasificacion.clase === 'DESCUENTO_DESEMBOLSO') descuentosDesembolso += clasificacion.valor;
    if (row.aplica_iva) iva += roundMoney(clasificacion.valor * (porcentajeIva / 100));
    return {
      id: row.id_credito_liquidacion,
      nombre: row.nombre,
      tipoAtributo: row.tipo_atributo,
      tipoCalculo: row.tipo_calculo,
      valor: row.valor ? Number(row.valor) : null,
      porcentaje: row.porcentaje ? Number(row.porcentaje) : null,
      valorCalculado: clasificacion.valor,
      aplicaIva: row.aplica_iva,
      clase: clasificacion.clase
    };
  });
  cargosFinanciados = roundMoney(cargosFinanciados + iva);
  descuentosDesembolso = roundMoney(descuentosDesembolso);
  iva = roundMoney(iva);

  const valorCredito = roundMoney(montoAprobado + cargosFinanciados);
  const valorDesembolso = roundMoney(Math.max(montoAprobado - descuentosDesembolso, 0));
  const cuota = roundMoney(decision?.cuota_aprobada ? Number(decision.cuota_aprobada) : calculateInstallment(valorCredito, tasaMensual / 100, plazo));
  const amortizacion = await client.query<{ cuota: string; capital: string; interes: string; saldo: string }>(
    'select * from "Creditos".generar_amortizacion($1, $2, $3)',
    [valorCredito, tasaMensual * 12, plazo]
  );
  const planPagos = amortizacion.rows.map((row, index) => ({
    numero: index + 1,
    cuota: roundMoney(Number(row.cuota)),
    capital: roundMoney(Number(row.capital)),
    interes: roundMoney(Number(row.interes)),
    saldo: roundMoney(Number(row.saldo))
  }));

  return {
    montoSolicitado,
    montoAprobado,
    plazo,
    tasaMensual: roundMoney(tasaMensual),
    cuota,
    cargosFinanciados,
    descuentosDesembolso,
    iva,
    valorDesembolso,
    valorCredito,
    totalIntereses: roundMoney(planPagos.reduce((total, row) => total + row.interes, 0)),
    totalPagar: roundMoney(planPagos.reduce((total, row) => total + row.cuota, 0)),
    conceptos,
    planPagos
  };
}
async function generarCuotasDefinitivas(client: ClientLike, credito: CreditoRow, input: RegistrarDesembolsoInput) {
  await ensureCreditoCuotasTable(client);

  const periodicidad = input.periodicidad ?? 'MENSUAL';
  const plazo = Math.max(1, Number(credito.num_plazo));
  const liquidacionFinal = await client.query<{ valor_credito: string }>(
    `select valor_credito
     from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES"
     where id_credito = $1 and estado = 'VIGENTE'
     order by numero_version desc, id_credito_liquidacion_final desc
     limit 1`,
    [credito.id_credito]
  );
  const principal = roundMoney(liquidacionFinal.rows[0]?.valor_credito ? Number(liquidacionFinal.rows[0].valor_credito) : input.valorDesembolso || Number(credito.val_monto_solicitado));
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

async function generateCreditoConsecutivo(client: ClientLike) {
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
      `select a.*, ta.des_tipo_atributo as tipo_atributo, tc.des_tipo_calculo as tipo_calculo, tc.codigo as formula_codigo, tc.base_calculo, tc.operacion, tc.aplica_minimo, tc.aplica_maximo
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

    const smlmv = await getParametroFinanciero(client, 'SMLMV') ?? 1300000;
    const iva = await getParametroFinanciero(client, 'IVA') ?? 0;

    const atributos = atributosResult.rows.map((row) => {
      const porcentaje = row.porcentaje ? Number(row.porcentaje) : null;
      const valorBase = row.valor ? Number(row.valor) : 0;
      let valorCalculado = calculateFormulaValue(row, { monto, valorCredito: monto, valorDesembolso: monto, saldo: monto, smlmv, cuota: 0, plazo });
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

    const convenio = await validarConvenioProducto(client, input.idProductoCredito, input.idEmpresa, monto);
    const evaluacion = await evaluarCapacidadLibranza(client, product, input, cuota);
    evaluacion.bloqueos.push(...convenio.bloqueos);
    evaluacion.alertas.push(...convenio.alertas);
    evaluacion.aprobado = evaluacion.bloqueos.length === 0;

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
      const convenio = await validarConvenioProducto(client, input.idProductoCredito, input.idEmpresa, monto);
      if (convenio.bloqueos.length) throw new SecurityError('Solicitud bloqueada por convenio: ' + convenio.bloqueos.join(' '), 400);
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


function normalizeJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function mapCreditoEvaluacion(row: EvaluacionCreditoRow) {
  return {
    id: row.id_credito_evaluacion,
    recomendacion: row.recomendacion,
    puntaje: Number(row.puntaje),
    nivelRiesgo: row.nivel_riesgo,
    bloqueos: normalizeJsonArray(row.bloqueos),
    alertas: normalizeJsonArray(row.alertas),
    positivos: normalizeJsonArray(row.positivos),
    metricas: row.metricas && typeof row.metricas === 'object' ? row.metricas : {},
    observacion: row.observacion,
    usuario: row.usuario,
    fecha: row.fec_creacion
  };
}

function construirEvaluacionCredito(input: {
  credito: ReturnType<typeof mapCredito>;
  documentos: Awaited<ReturnType<typeof listCreditoDocumentos>>;
  etapas: Awaited<ReturnType<typeof listCreditoEtapas>>;
  liquidacion: LiquidacionCreditoRow[];
  decisiones: DecisionCreditoRow[];
  perfil: PerfilClienteCreditoRow | null;
}) {
  const bloqueos: string[] = [];
  const alertas: string[] = [];
  const positivos: string[] = [];
  let puntaje = 100;
  const docsObligatorios = input.documentos.filter((doc) => doc.obligatorio);
  const docsPendientes = docsObligatorios.filter((doc) => doc.estadoDocumento !== 'APROBADO');
  if (docsPendientes.length) {
    bloqueos.push('Hay documentos obligatorios pendientes o sin aprobar.');
    puntaje -= Math.min(30, docsPendientes.length * 10);
  } else if (docsObligatorios.length) {
    positivos.push('Documentacion obligatoria aprobada.');
  }
  const salario = input.perfil?.portal_salario ? Number(input.perfil.portal_salario) : input.perfil?.empleado_salario ? Number(input.perfil.empleado_salario) : null;
  const neto = input.perfil?.portal_neto ? Number(input.perfil.portal_neto) : salario;
  if (!salario && !neto) {
    alertas.push('No hay salario o ingreso neto para estudio financiero.');
    puntaje -= 15;
  }
  if (input.perfil?.portal_tiene_embargos) {
    bloqueos.push('El cliente reporta embargos.');
    puntaje -= 25;
  }
  if (input.perfil && input.perfil.portal_correo_confirmado === false) {
    alertas.push('Correo del cliente sin confirmar.');
    puntaje -= 5;
  }
  const cuota = input.credito.cuotaEstimada ?? 0;
  const base = neto || salario || 0;
  const usoCapacidad = base > 0 && cuota > 0 ? roundMoney((cuota / base) * 100) : null;
  if (usoCapacidad !== null) {
    if (usoCapacidad > 50) {
      bloqueos.push('La cuota supera el 50% del ingreso base registrado.');
      puntaje -= 25;
    } else if (usoCapacidad > 40) {
      alertas.push('La cuota supera el 40% del ingreso base registrado.');
      puntaje -= 15;
    } else {
      positivos.push('Cuota dentro de capacidad preliminar.');
    }
  }
  const cargos = input.liquidacion.reduce((total, row) => total + Number(row.valor_calculado ?? 0), 0);
  const relacionCargos = input.credito.montoSolicitado > 0 ? roundMoney((cargos / input.credito.montoSolicitado) * 100) : 0;
  if (relacionCargos > 25) {
    alertas.push('Los cargos superan el 25% del monto solicitado.');
    puntaje -= 10;
  }
  const ultimaDecision = input.decisiones[0]?.decision ?? null;
  if (ultimaDecision === 'APROBADO') positivos.push('Existe decision aprobada registrada.');
  if (ultimaDecision === 'RECHAZADO') bloqueos.push('Existe una decision rechazada registrada.');
  const etapasRechazadas = input.etapas.filter((etapa) => etapa.estadoEtapa === 'RECHAZADA');
  if (etapasRechazadas.length) bloqueos.push('El flujo tiene etapas rechazadas.');
  puntaje = Math.max(0, Math.min(100, puntaje));
  const recomendacion = bloqueos.length ? 'RECHAZAR' : alertas.length || puntaje < 80 ? 'REVISAR' : 'APROBAR';
  return {
    recomendacion,
    puntaje,
    nivelRiesgo: puntaje >= 85 ? 'BAJO' : puntaje >= 65 ? 'MEDIO' : 'ALTO',
    bloqueos,
    alertas,
    positivos,
    metricas: {
      ingresoBase: base || null,
      cuota,
      usoCapacidad,
      cargos: roundMoney(cargos),
      relacionCargos
    }
  };
}

export async function getCreditoExpediente(creditoId: number) {
  return withClient(async (client) => {
    await ensureCreditoHistorialTable(client);
    await ensureCreditoDecisionesTable(client);
    await ensureCreditoLiquidacionesFinalesTable(client);
    await ensureCreditoEvaluacionesTable(client);
    await ensureCreditoDesembolsosTable(client);
    await ensureCreditoFondeoTable(client);
    await ensureCreditoCuotasTable(client);
    await ensureCreditoPagosTable(client);
    await ensureCreditoPagoSoportesTable(client);
    await ensureCreditoMovimientosContablesTable(client);
    await ensureCalendarioParamColumns(client);

    const creditoResult = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1`, [creditoId]);
    if (!creditoResult.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);

    const credito = mapCredito(creditoResult.rows[0]);
    await recalcularMoraCredito(client, creditoId);

    const [documentos, etapas, liquidacion, liquidacionesDefinitivas, historial, decisiones, evaluaciones, desembolsos, fondeos, cuotas, pagos, movimientosContables, calendario, perfil] = await Promise.all([
      listCreditoDocumentos(creditoId),
      listCreditoEtapas(creditoId),
      client.query<LiquidacionCreditoRow>(
        `select *
         from "Creditos"."TBL_CREDITO_LIQUIDACION"
         where id_credito = $1
         order by id_credito_liquidacion`,
        [creditoId]
      ),
      client.query<LiquidacionDefinitivaCreditoRow>(
        `select l.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = l.id_usuario
         where l.id_credito = $1
         order by l.numero_version desc, l.id_credito_liquidacion_final desc`,
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
      client.query<EvaluacionCreditoRow>(
        `select e.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_EVALUACIONES" e
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = e.id_usuario
         where e.id_credito = $1
         order by e.fec_creacion desc, e.id_credito_evaluacion desc`,
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
      client.query<CreditoMovimientoContableRow>(
        `select m.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_MOVIMIENTOS_CONTABLES" m
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = m.id_usuario
         where m.id_credito = $1
         order by m.fecha_movimiento, m.id_credito_movimiento`,
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

    const mappedLiquidacionesDefinitivas = liquidacionesDefinitivas.rows.map(mapLiquidacionDefinitiva);
    const votosComiteCredito = new Set(
      decisiones.rows
        .filter((row) => row.decision === 'APROBADO' && row.requiere_comite && ['PENDIENTE', 'APROBADO'].includes(row.estado_comite ?? ''))
        .map((row) => row.id_usuario ?? row.id_credito_decision)
    ).size;

    const evaluacionAutomatica = construirEvaluacionCredito({
      credito,
      documentos,
      etapas: mappedEtapas,
      liquidacion: liquidacion.rows,
      decisiones: decisiones.rows,
      perfil: perfil.rows[0] ?? null
    });

    return {
      credito,
      evaluacionAutomatica,
      etapaActual: currentStage,
      sugerenciaCalendario,
      documentos,
      etapas: mappedEtapas,
      liquidacionDefinitiva: mappedLiquidacionesDefinitivas[0] ?? null,
      liquidacionesDefinitivas: mappedLiquidacionesDefinitivas,
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
      evaluaciones: evaluaciones.rows.map(mapCreditoEvaluacion),
      decisiones: decisiones.rows.map((row) => ({
        id: row.id_credito_decision,
        decision: row.decision,
        montoAprobado: row.monto_aprobado ? Number(row.monto_aprobado) : null,
        plazoAprobado: row.plazo_aprobado,
        tasaAprobada: row.tasa_aprobada ? Number(row.tasa_aprobada) : null,
        cuotaAprobada: row.cuota_aprobada ? Number(row.cuota_aprobada) : null,
        observacion: row.observacion,
        requiereComite: row.requiere_comite ?? false,
        votosRequeridos: row.votos_requeridos,
        votosActuales: row.requiere_comite ? votosComiteCredito : null,
        estadoComite: row.estado_comite,
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
        numeroOrden: row.numero_orden,
        estadoDesembolso: row.estado_desembolso ?? 'EJECUTADO',
        fechaOrden: row.fecha_orden,
        fechaEjecucion: row.fecha_ejecucion,
        comprobantePago: row.comprobante_pago,
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
        capitalCausado: Number(row.capital_causado ?? 0),
        interesCausado: Number(row.interes_causado ?? 0),
        cargosCausados: Number(row.cargos_causados ?? 0),
        moraCausada: Number(row.mora_causada ?? 0),
        fechaCausacion: row.fecha_causacion,
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
      extracto: movimientosContables.rows.map((row) => ({
        id: row.id_credito_movimiento,
        fecha: row.fecha_movimiento,
        tipo: row.tipo_movimiento,
        concepto: row.concepto,
        debito: Number(row.debito),
        credito: Number(row.credito),
        saldoContable: Number(row.saldo_contable),
        carteraCausada: Number(row.cartera_causada),
        interesCausado: Number(row.interes_causado),
        moraCausada: Number(row.mora_causada),
        recaudoAplicado: Number(row.recaudo_aplicado),
        referenciaTipo: row.referencia_tipo,
        referenciaId: row.referencia_id,
        observacion: row.observacion,
        usuario: row.usuario,
        fechaRegistro: row.fec_creacion
      })),
      pagos: pagos.rows.map((row) => ({
        id: row.id_credito_pago,
        fechaPago: row.fecha_pago,
        valorPago: Number(row.valor_pago),
        saldoFavor: Number(row.saldo_favor ?? 0),
        medioPago: row.medio_pago,
        referenciaPago: row.referencia_pago,
        tipoRecaudo: row.tipo_recaudo ?? (row.medio_pago === 'NOMINA' ? 'NOMINA' : 'MANUAL'),
        periodoNomina: row.periodo_nomina,
        estadoPago: row.estado_pago ?? 'APLICADO',
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
      await ensureCreditoPagoAplicacionesTable(client);
      await ensureCreditoMovimientosContablesTable(client);

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
          id_credito, fecha_pago, valor_pago, medio_pago, referencia_pago, tipo_recaudo, periodo_nomina, observacion, id_usuario
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        returning id_credito_pago`,
        [
          creditoId,
          input.fechaPago,
          roundMoney(input.valorPago),
          input.medioPago?.trim() || null,
          input.referenciaPago?.trim() || null,
          input.tipoRecaudo?.trim() || (input.medioPago?.trim() === 'NOMINA' ? 'NOMINA' : 'MANUAL'),
          input.periodoNomina?.trim() || null,
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

        await client.query(
          `insert into "Creditos"."TBL_CREDITO_PAGO_APLICACIONES" (
            id_credito_pago, id_credito_cuota, valor_aplicado, mora_aplicada, cargos_aplicados, interes_aplicado, capital_aplicado
          ) values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            pagoCreado.rows[0].id_credito_pago,
            cuota.id_credito_cuota,
            roundMoney(aplicado),
            roundMoney(moraAplicada),
            roundMoney(cargosAplicados),
            roundMoney(interesAplicado),
            roundMoney(capitalAplicado)
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

      const valorAplicado = roundMoney(input.valorPago - restante);
      if (valorAplicado > 0) {
        await registrarMovimientoContable(client, {
          creditoId,
          fecha: input.fechaPago,
          tipo: 'RECAUDO',
          concepto: 'Recaudo aplicado a cartera',
          credito: valorAplicado,
          recaudoAplicado: valorAplicado,
          referenciaTipo: 'PAGO',
          referenciaId: pagoCreado.rows[0].id_credito_pago,
          observacion: input.referenciaPago?.trim() || input.observacion?.trim() || null,
          usuarioId: input.usuarioId
        });
      }

      await addCreditoHistory(
        client,
        creditoId,
        null,
        'PAGO_REGISTRADO',
        credito.rows[0].estado,
        restante > 0 ? 'PAGO_CON_SALDO_A_FAVOR' : 'PAGO_APLICADO',
        `${roundMoney(input.valorPago)} aplicado a cartera por ${input.tipoRecaudo?.trim() || (input.medioPago?.trim() === 'NOMINA' ? 'NOMINA' : 'MANUAL')}${input.periodoNomina?.trim() ? ' periodo ' + input.periodoNomina.trim() : ''}${restante > 0 ? `; saldo sin aplicar ${restante}` : ''}`,
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

export async function registrarRecaudoMasivo(input: RegistrarRecaudoMasivoInput) {
  if (!input.fechaPago) throw new SecurityError('La fecha del recaudo es obligatoria', 400);
  if (!input.periodoNomina?.trim()) throw new SecurityError('El periodo de nomina es obligatorio', 400);
  if (!input.pagos.length) throw new SecurityError('Debes enviar al menos un pago para aplicar', 400);

  const resultados: Array<{ fila: number; aplicado: boolean; creditoId: number | null; consecutivo: string | null; valorPago: number; mensaje: string }> = [];
  for (const [index, item] of input.pagos.entries()) {
    const fila = index + 1;
    try {
      if (!Number.isFinite(item.valorPago) || item.valorPago <= 0) throw new SecurityError('El valor debe ser mayor a cero', 400);
      const credito = await withClient(async (client) => {
        const result = await client.query<{ id_credito: number; consecutivo: string }>(
          `select id_credito, consecutivo
           from "Creditos"."TBL_CREDITOS"
           where ($1::int is not null and id_credito = $1)
              or ($2::varchar is not null and consecutivo = $2)
              or ($3::varchar is not null and v_identificacion_cliente = $3)
           order by id_credito desc
           limit 1`,
          [item.creditoId ?? null, item.consecutivo?.trim() || null, item.identificacionCliente?.trim() || null]
        );
        return result.rows[0] ?? null;
      });
      if (!credito) throw new SecurityError('Credito no encontrado para la fila', 404);
      await registrarPagoCredito(credito.id_credito, {
        fechaPago: input.fechaPago,
        valorPago: item.valorPago,
        medioPago: 'NOMINA',
        tipoRecaudo: 'NOMINA',
        periodoNomina: input.periodoNomina,
        referenciaPago: item.referenciaPago?.trim() || input.referenciaLote?.trim() || null,
        observacion: item.observacion?.trim() || input.observacion?.trim() || 'Recaudo masivo de nomina',
        usuarioId: input.usuarioId ?? null
      });
      resultados.push({ fila, aplicado: true, creditoId: credito.id_credito, consecutivo: credito.consecutivo, valorPago: roundMoney(item.valorPago), mensaje: 'Aplicado' });
    } catch (error) {
      resultados.push({ fila, aplicado: false, creditoId: item.creditoId ?? null, consecutivo: item.consecutivo?.trim() || null, valorPago: Number(item.valorPago || 0), mensaje: error instanceof Error ? error.message : 'No se pudo aplicar el pago' });
    }
  }

  const aplicados = resultados.filter((item) => item.aplicado);
  const rechazados = resultados.filter((item) => !item.aplicado);
  return {
    referenciaLote: input.referenciaLote?.trim() || null,
    periodoNomina: input.periodoNomina,
    fechaPago: input.fechaPago,
    totalFilas: resultados.length,
    aplicados: aplicados.length,
    rechazados: rechazados.length,
    valorAplicado: roundMoney(aplicados.reduce((total, item) => total + item.valorPago, 0)),
    valorRechazado: roundMoney(rechazados.reduce((total, item) => total + item.valorPago, 0)),
    resultados
  };
}
export async function reversarPagoCredito(pagoId: number, input: ReversarPagoInput = {}) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoPagoAplicacionesTable(client);
      await ensureCreditoMovimientosContablesTable(client);
      const pago = await client.query<CreditoPagoRow & { id_credito: number }>(
        `select p.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario, 0::int as soportes, null::varchar as soporte_nombre, null::varchar as soporte_mime_type
         from "Creditos"."TBL_CREDITO_PAGOS" p
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = p.id_usuario
         where p.id_credito_pago = $1
         for update of p`,
        [pagoId]
      );
      if (!pago.rowCount) throw new SecurityError('Pago no encontrado', 404);
      if (pago.rows[0].estado_pago === 'REVERSADO') throw new SecurityError('Este pago ya fue reversado', 400);
      const creditoId = pago.rows[0].id_credito;

      const aplicaciones = await client.query<{ id_credito_pago_aplicacion: number; id_credito_cuota: number; valor_aplicado: string; mora_aplicada: string; cargos_aplicados: string; interes_aplicado: string; capital_aplicado: string }>(
        `select * from "Creditos"."TBL_CREDITO_PAGO_APLICACIONES" where id_credito_pago = $1 and reversado = false order by id_credito_pago_aplicacion for update`,
        [pagoId]
      );
      if (!aplicaciones.rowCount) throw new SecurityError('Este pago no tiene detalle de aplicacion para reverso automatico', 400);

      for (const app of aplicaciones.rows) {
        const cuota = await client.query<CreditoCuotaRow>('select * from "Creditos"."TBL_CREDITO_CUOTAS" where id_credito_cuota = $1 for update', [app.id_credito_cuota]);
        if (!cuota.rowCount) continue;
        const nuevoPagado = Math.max(0, roundMoney(Number(cuota.rows[0].valor_pagado) - Number(app.valor_aplicado)));
        const nuevoEstado = nuevoPagado <= 0 ? 'PENDIENTE' : 'ABONO_PARCIAL';
        await client.query(
          `update "Creditos"."TBL_CREDITO_CUOTAS"
           set mora_pagada = greatest(0, mora_pagada - $2),
               cargos_pagados = greatest(0, cargos_pagados - $3),
               interes_pagado = greatest(0, interes_pagado - $4),
               capital_pagado = greatest(0, capital_pagado - $5),
               valor_pagado = $6,
               estado = $7
           where id_credito_cuota = $1`,
          [app.id_credito_cuota, Number(app.mora_aplicada), Number(app.cargos_aplicados), Number(app.interes_aplicado), Number(app.capital_aplicado), nuevoPagado, nuevoEstado]
        );
      }

      await client.query('update "Creditos"."TBL_CREDITO_PAGO_APLICACIONES" set reversado = true where id_credito_pago = $1', [pagoId]);
      await client.query("update \"Creditos\".\"TBL_CREDITO_PAGOS\" set estado_pago = 'REVERSADO' where id_credito_pago = $1", [pagoId]);
      await recalcularMoraCredito(client, creditoId);

      const valorReversado = roundMoney(aplicaciones.rows.reduce((total, app) => total + Number(app.valor_aplicado), 0));
      await registrarMovimientoContable(client, {
        creditoId,
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'REVERSO_PAGO',
        concepto: 'Reverso de pago aplicado',
        debito: valorReversado,
        recaudoAplicado: -valorReversado,
        referenciaTipo: 'PAGO',
        referenciaId: pagoId,
        observacion: input.observacion?.trim() || 'Reverso de pago',
        usuarioId: input.usuarioId
      });

      await addCreditoHistory(client, creditoId, null, 'PAGO_REVERSADO', 'APLICADO', 'REVERSADO', input.observacion?.trim() || `Pago ${pagoId} reversado por ${valorReversado}`, input.usuarioId);
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

export async function registrarLiquidacionDefinitiva(creditoId: number, input: RegistrarLiquidacionDefinitivaInput = {}) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoDecisionesTable(client);
      await ensureComiteAprobacionConfigTable(client);
      await ensureCreditoLiquidacionesFinalesTable(client);
      const credito = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1 for update of c`, [creditoId]);
      if (!credito.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);

      const liquidacion = await construirLiquidacionDefinitiva(client, creditoId);
      const versionResult = await client.query<{ version: number }>(
        'select coalesce(max(numero_version), 0) + 1 as version from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" where id_credito = $1',
        [creditoId]
      );
      const version = Number(versionResult.rows[0]?.version ?? 1);

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" (
          id_credito, numero_version, estado, monto_solicitado, monto_aprobado, plazo, tasa_mensual, cuota,
          cargos_financiados, descuentos_desembolso, iva, valor_desembolso, valor_credito, total_intereses, total_pagar,
          conceptos, plan_pagos, observacion, id_usuario
        ) values ($1,$2,'VIGENTE',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18)`,
        [creditoId, version, liquidacion.montoSolicitado, liquidacion.montoAprobado, liquidacion.plazo, liquidacion.tasaMensual, liquidacion.cuota, liquidacion.cargosFinanciados, liquidacion.descuentosDesembolso, liquidacion.iva, liquidacion.valorDesembolso, liquidacion.valorCredito, liquidacion.totalIntereses, liquidacion.totalPagar, JSON.stringify(liquidacion.conceptos), JSON.stringify(liquidacion.planPagos), input.observacion?.trim() || null, input.usuarioId ?? null]
      );

      await addCreditoHistory(client, creditoId, null, 'LIQUIDACION_DEFINITIVA', null, 'REGISTRADA', input.observacion?.trim() || `Liquidacion definitiva version ${version}: desembolso ${roundMoney(liquidacion.valorDesembolso)}`, input.usuarioId);

      await client.query('commit');
      return getCreditoExpediente(creditoId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
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
      if (!input.bancoDestino?.trim()) throw new SecurityError('El banco destino es obligatorio para desembolso', 400);
      if (!input.tipoCuenta?.trim()) throw new SecurityError('El tipo de cuenta destino es obligatorio para desembolso', 400);
      if (!input.numeroCuenta?.trim()) throw new SecurityError('El numero de cuenta destino es obligatorio para desembolso', 400);
      if (!input.referenciaPago?.trim()) throw new SecurityError('La referencia o comprobante del pago es obligatoria para desembolso', 400);
      await ensureCreditoLiquidacionesFinalesTable(client);
      const liquidacionFinal = await client.query<LiquidacionDefinitivaCreditoRow>(
        `select l.*, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
         from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l
         left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = l.id_usuario
         where l.id_credito = $1 and l.estado = 'VIGENTE'
         order by l.numero_version desc, l.id_credito_liquidacion_final desc
         limit 1`,
        [creditoId]
      );
      if (!liquidacionFinal.rowCount) {
        throw new SecurityError('Antes de desembolsar debes registrar la liquidacion definitiva del credito', 400);
      }
      const valorLiquidado = Number(liquidacionFinal.rows[0].valor_desembolso);
      if (Math.abs(roundMoney(input.valorDesembolso) - roundMoney(valorLiquidado)) > 1) {
        throw new SecurityError('El valor a desembolsar debe coincidir con la liquidacion definitiva: ' + roundMoney(valorLiquidado), 400);
      }
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

      const numeroOrden = input.numeroOrden?.trim() || 'OD-' + credito.rows[0].consecutivo + '-' + new Date().getTime();
      await client.query(
        `insert into "Creditos"."TBL_CREDITO_DESEMBOLSOS" (
          id_credito, valor_desembolso, fecha_desembolso, banco_destino,
          tipo_cuenta, numero_cuenta, referencia_pago, numero_orden, estado_desembolso,
          fecha_orden, fecha_ejecucion, comprobante_pago, observacion, id_usuario
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,'EJECUTADO',current_date,$3,$9,$10,$11)`,
        [
          creditoId,
          roundMoney(input.valorDesembolso),
          input.fechaDesembolso,
          input.bancoDestino?.trim() || null,
          input.tipoCuenta?.trim() || null,
          input.numeroCuenta?.trim() || null,
          input.referenciaPago?.trim() || null,
          numeroOrden,
          input.comprobantePago?.trim() || input.referenciaPago?.trim() || null,
          input.observacion?.trim() || null,
          input.usuarioId ?? null
        ]
      );

      await client.query(
        `update "Creditos"."TBL_CREDITOS"
         set v_estado_solicitud = 'DESEMBOLSADO',
             v_valor_pendiente = (select valor_credito from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" where id_credito = $1 and estado = 'VIGENTE' order by numero_version desc, id_credito_liquidacion_final desc limit 1),
             fec_actualizacion = now()
         where id_credito = $1`,
        [creditoId]
      );

      await generarCuotasDefinitivas(client, credito.rows[0], input);

      const valorCreditoContable = await client.query<{ valor_credito: string }>(
        `select valor_credito
         from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES"
         where id_credito = $1 and estado = 'VIGENTE'
         order by numero_version desc, id_credito_liquidacion_final desc
         limit 1`,
        [creditoId]
      );
      const valorCartera = roundMoney(Number(valorCreditoContable.rows[0]?.valor_credito ?? input.valorDesembolso));
      await registrarMovimientoContable(client, {
        creditoId,
        fecha: input.fechaDesembolso,
        tipo: 'DESEMBOLSO',
        concepto: 'Desembolso y constitucion de cartera',
        debito: valorCartera,
        carteraCausada: valorCartera,
        referenciaTipo: 'DESEMBOLSO',
        referenciaId: null,
        observacion: numeroOrden,
        usuarioId: input.usuarioId
      });

      await addCreditoHistory(
        client,
        creditoId,
        null,
        'DESEMBOLSO_REGISTRADO',
        credito.rows[0].estado,
        'DESEMBOLSADO',
        input.observacion?.trim() || `Orden ${numeroOrden} ejecutada por ${roundMoney(input.valorDesembolso)}`,
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

export async function causarCredito(creditoId: number, input: CausarCreditoInput) {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoCuotasTable(client);
      await ensureCreditoMovimientosContablesTable(client);
      if (!input.fechaCorte) throw new SecurityError('La fecha de corte de causacion es obligatoria', 400);
      const credito = await client.query<CreditoRow>(`${creditoSelect} where c.id_credito = $1 for update of c`, [creditoId]);
      if (!credito.rowCount) throw new SecurityError('Solicitud de credito no encontrada', 404);
      await recalcularMoraCredito(client, creditoId);
      const cuotas = await client.query<CreditoCuotaRow>(
        `select * from "Creditos"."TBL_CREDITO_CUOTAS"
         where id_credito = $1 and fecha_corte <= $2::date and estado <> 'PAGADA'
         order by numero_cuota for update`,
        [creditoId, input.fechaCorte]
      );
      let capital = 0;
      let interes = 0;
      let cargos = 0;
      let mora = 0;
      let cuotasCausadas = 0;
      for (const cuota of cuotas.rows) {
        const capitalPendiente = Math.max(0, Number(cuota.capital) - Number(cuota.capital_causado ?? 0));
        const interesPendiente = Math.max(0, Number(cuota.interes) - Number(cuota.interes_causado ?? 0));
        const cargosPendientes = Math.max(0, Number(cuota.cargos) - Number(cuota.cargos_causados ?? 0));
        const moraPendiente = Math.max(0, Number(cuota.valor_mora) - Number(cuota.mora_causada ?? 0));
        if (capitalPendiente + interesPendiente + cargosPendientes + moraPendiente <= 0) continue;
        await client.query(
          `update "Creditos"."TBL_CREDITO_CUOTAS"
           set capital_causado = capital_causado + $2,
               interes_causado = interes_causado + $3,
               cargos_causados = cargos_causados + $4,
               mora_causada = mora_causada + $5,
               fecha_causacion = $6
           where id_credito_cuota = $1`,
          [cuota.id_credito_cuota, roundMoney(capitalPendiente), roundMoney(interesPendiente), roundMoney(cargosPendientes), roundMoney(moraPendiente), input.fechaCorte]
        );
        capital += capitalPendiente;
        interes += interesPendiente;
        cargos += cargosPendientes;
        mora += moraPendiente;
        cuotasCausadas += 1;
      }
      const total = roundMoney(capital + interes + cargos + mora);
      if (total <= 0) throw new SecurityError('No hay valores pendientes por causar hasta la fecha indicada', 400);
      await registrarMovimientoContable(client, {
        creditoId,
        fecha: input.fechaCorte,
        tipo: 'CAUSACION',
        concepto: 'Causacion periodica de cartera',
        debito: total,
        carteraCausada: roundMoney(capital + cargos),
        interesCausado: roundMoney(interes),
        moraCausada: roundMoney(mora),
        referenciaTipo: 'CAUSACION',
        referenciaId: null,
        observacion: input.observacion?.trim() || `Causacion de ${cuotasCausadas} cuotas`,
        usuarioId: input.usuarioId
      });
      await addCreditoHistory(client, creditoId, null, 'CAUSACION_CARTERA', null, 'CAUSADO', input.observacion?.trim() || `Causacion ${input.fechaCorte}: ${total}`, input.usuarioId);
      await client.query('commit');
      return getCreditoExpediente(creditoId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}
export async function anularLiquidacionDefinitiva(liquidacionId: number, input: AnularOperacionCreditoInput = {}) {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoLiquidacionesFinalesTable(client);
      await ensureCreditoDesembolsosTable(client);
      const liquidacion = await client.query<LiquidacionDefinitivaCreditoRow>(
        `select l.*, null::varchar as usuario from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l where id_credito_liquidacion_final = $1 for update`,
        [liquidacionId]
      );
      if (!liquidacion.rowCount) throw new SecurityError('Liquidacion definitiva no encontrada', 404);
      const row = liquidacion.rows[0];
      if (row.estado === 'ANULADA') throw new SecurityError('Esta liquidacion ya esta anulada', 400);
      const desembolsos = await client.query<{ total: string }>(
        `select count(*)::int as total from "Creditos"."TBL_CREDITO_DESEMBOLSOS" where id_credito = $1 and estado_desembolso <> 'ANULADO'`,
        [row.id_credito]
      );
      if (Number(desembolsos.rows[0]?.total ?? 0) > 0) throw new SecurityError('No puedes anular la liquidacion porque ya tiene desembolso registrado', 400);
      await client.query(`update "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" set estado = 'ANULADA', observacion = coalesce(observacion, '') || $2 where id_credito_liquidacion_final = $1`, [liquidacionId, input.observacion?.trim() ? ' / Anulada: ' + input.observacion.trim() : ' / Anulada']);
      await addCreditoHistory(client, row.id_credito, null, 'LIQUIDACION_ANULADA', 'VIGENTE', 'ANULADA', input.observacion?.trim() || `Liquidacion version ${row.numero_version} anulada`, input.usuarioId);
      await client.query('commit');
      return getCreditoExpediente(row.id_credito);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function anularDesembolsoCredito(desembolsoId: number, input: AnularOperacionCreditoInput = {}) {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      await ensureCreditoHistorialTable(client);
      await ensureCreditoDesembolsosTable(client);
      await ensureCreditoCuotasTable(client);
      await ensureCreditoPagosTable(client);
      await ensureCreditoMovimientosContablesTable(client);
      const desembolso = await client.query<DesembolsoCreditoRow & { id_credito: number }>(
        `select d.*, null::varchar as usuario from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d where id_credito_desembolso = $1 for update`,
        [desembolsoId]
      );
      if (!desembolso.rowCount) throw new SecurityError('Desembolso no encontrado', 404);
      const row = desembolso.rows[0];
      if (row.estado_desembolso === 'ANULADO') throw new SecurityError('Este desembolso ya esta anulado', 400);
      const pagos = await client.query<{ total: string }>(`select count(*)::int as total from "Creditos"."TBL_CREDITO_PAGOS" where id_credito = $1 and estado_pago <> 'REVERSADO'`, [row.id_credito]);
      if (Number(pagos.rows[0]?.total ?? 0) > 0) throw new SecurityError('No puedes anular el desembolso porque ya existen pagos aplicados', 400);
      const saldo = await client.query<{ saldo: string }>('select coalesce(sum(valor_cuota + valor_mora - valor_pagado), 0)::numeric as saldo from "Creditos"."TBL_CREDITO_CUOTAS" where id_credito = $1', [row.id_credito]);
      const valorReverso = roundMoney(Number(saldo.rows[0]?.saldo ?? row.valor_desembolso));
      await client.query('delete from "Creditos"."TBL_CREDITO_CUOTAS" where id_credito = $1', [row.id_credito]);
      await client.query(`update "Creditos"."TBL_CREDITO_DESEMBOLSOS" set estado_desembolso = 'ANULADO', observacion = coalesce(observacion, '') || $2 where id_credito_desembolso = $1`, [desembolsoId, input.observacion?.trim() ? ' / Anulado: ' + input.observacion.trim() : ' / Anulado']);
      await client.query(`update "Creditos"."TBL_CREDITOS" set v_estado_solicitud = 'EN_APROBACION', v_valor_pendiente = 0, fec_actualizacion = now() where id_credito = $1`, [row.id_credito]);
      await registrarMovimientoContable(client, { creditoId: row.id_credito, fecha: new Date().toISOString().slice(0, 10), tipo: 'REVERSO_DESEMBOLSO', concepto: 'Anulacion de desembolso', credito: valorReverso, carteraCausada: -valorReverso, referenciaTipo: 'DESEMBOLSO', referenciaId: desembolsoId, observacion: input.observacion?.trim() || row.numero_orden || null, usuarioId: input.usuarioId });
      await addCreditoHistory(client, row.id_credito, null, 'DESEMBOLSO_ANULADO', 'DESEMBOLSADO', 'ANULADO', input.observacion?.trim() || `Desembolso ${desembolsoId} anulado`, input.usuarioId);
      await client.query('commit');
      return getCreditoExpediente(row.id_credito);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}
export async function registrarEvaluacionCredito(creditoId: number, input: { observacion?: string | null; usuarioId?: number | null } = {}) {
  return withClient(async (client) => {
    await ensureCreditoEvaluacionesTable(client);
    const expediente = await getCreditoExpediente(creditoId);
    const evaluacion = expediente.evaluacionAutomatica;
    if (!evaluacion) throw new SecurityError('No fue posible calcular la evaluacion del credito', 400);
    await client.query(
      `insert into "Creditos"."TBL_CREDITO_EVALUACIONES" (
        id_credito, recomendacion, puntaje, nivel_riesgo, bloqueos, alertas, positivos, metricas, observacion, id_usuario
      ) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)`,
      [creditoId, evaluacion.recomendacion, evaluacion.puntaje, evaluacion.nivelRiesgo, JSON.stringify(evaluacion.bloqueos), JSON.stringify(evaluacion.alertas), JSON.stringify(evaluacion.positivos), JSON.stringify(evaluacion.metricas), input.observacion?.trim() || null, input.usuarioId ?? null]
    );
    return getCreditoExpediente(creditoId);
  });
}

async function validarLimiteAprobacionUsuario(client: ClientLike, usuarioId: number | null | undefined, monto: number) {
  if (!usuarioId) throw new SecurityError('No fue posible identificar el usuario que aprueba el credito', 403);
  await client.query(`alter table "Creditos"."TBL_ROLES" add column if not exists monto_maximo_aprobacion numeric(18,2) null`);
  const roles = await client.query<{ rol: string; monto_maximo_aprobacion: string | null }>(
    `select r.v_nom_rol as rol, r.monto_maximo_aprobacion
     from "Creditos"."TBL_USUARIO_ROLES" ur
     inner join "Creditos"."TBL_ROLES" r on r.id_rol = ur.id_rol
     where ur.id_usuario = $1`,
    [usuarioId]
  );
  if (roles.rows.some((row) => row.rol.toLowerCase().includes('admin'))) return;
  const limite = Math.max(0, ...roles.rows.map((row) => row.monto_maximo_aprobacion ? Number(row.monto_maximo_aprobacion) : 0));
  if (limite <= 0 || monto > limite) {
    throw new SecurityError(`El usuario no tiene cupo de aprobacion para este monto. Limite autorizado: ${roundMoney(limite)}`, 403);
  }
}
export async function decideCredito(creditoId: number, input: DecideCreditoInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureCreditoEvaluacionesTable(client);
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
        await validarLimiteAprobacionUsuario(client, input.usuarioId, monto);
      }
      const cuota = input.cuotaAprobada ?? (tasa ? calculateInstallment(monto, tasa / 100, plazo) : monto / plazo);
      const expedienteEvaluacion = await getCreditoExpediente(creditoId);
      if (input.decision === 'APROBADO' && expedienteEvaluacion.evaluacionAutomatica?.recomendacion === 'RECHAZAR') {
        throw new SecurityError('La evaluacion automatica recomienda rechazar: ' + expedienteEvaluacion.evaluacionAutomatica.bloqueos.join(' '), 400);
      }
      if (expedienteEvaluacion.evaluacionAutomatica) {
        const evaluacion = expedienteEvaluacion.evaluacionAutomatica;
        await client.query(
          `insert into "Creditos"."TBL_CREDITO_EVALUACIONES" (
            id_credito, recomendacion, puntaje, nivel_riesgo, bloqueos, alertas, positivos, metricas, observacion, id_usuario
          ) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)`,
          [creditoId, evaluacion.recomendacion, evaluacion.puntaje, evaluacion.nivelRiesgo, JSON.stringify(evaluacion.bloqueos), JSON.stringify(evaluacion.alertas), JSON.stringify(evaluacion.positivos), JSON.stringify(evaluacion.metricas), 'Evaluacion registrada antes de decision ' + input.decision, input.usuarioId ?? null]
        );
      }

      const configComite = input.decision === 'APROBADO' ? await getComiteAprobacionConfig(client, roundMoney(monto)) : null;
      const requiereComite = Boolean(configComite);
      const votosRequeridos = configComite?.votos_requeridos ?? null;
      let estadoComite: string | null = requiereComite ? 'PENDIENTE' : input.decision === 'APROBADO' ? 'NO_REQUIERE' : null;
      let votosActuales = 0;

      if (requiereComite) {
        const votoExistente = await client.query(
          `select 1
           from "Creditos"."TBL_CREDITO_DECISIONES"
           where id_credito = $1 and decision = 'APROBADO' and requiere_comite = true
             and estado_comite in ('PENDIENTE', 'APROBADO') and id_usuario = $2
           limit 1`,
          [creditoId, input.usuarioId ?? null]
        );
        if (votoExistente.rowCount) throw new SecurityError('Este usuario ya registro voto de aprobacion para el comite de este credito', 400);

        const votos = await client.query<{ total: string }>(
          `select count(distinct coalesce(id_usuario, id_credito_decision))::text as total
           from "Creditos"."TBL_CREDITO_DECISIONES"
           where id_credito = $1 and decision = 'APROBADO' and requiere_comite = true
             and estado_comite in ('PENDIENTE', 'APROBADO')`,
          [creditoId]
        );
        votosActuales = Number(votos.rows[0]?.total ?? 0) + 1;
        estadoComite = votosActuales >= (votosRequeridos ?? 2) ? 'APROBADO' : 'PENDIENTE';
      }

      await client.query(
        `insert into "Creditos"."TBL_CREDITO_DECISIONES" (
          id_credito, decision, monto_aprobado, plazo_aprobado, tasa_aprobada, cuota_aprobada, observacion, id_usuario, requiere_comite, votos_requeridos, estado_comite
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          creditoId,
          input.decision,
          input.decision === 'APROBADO' ? roundMoney(monto) : null,
          input.decision === 'APROBADO' ? plazo : null,
          input.decision === 'APROBADO' ? tasa : null,
          input.decision === 'APROBADO' ? roundMoney(cuota) : null,
          input.observacion?.trim() || null,
          input.usuarioId ?? null,
          requiereComite,
          votosRequeridos,
          estadoComite
        ]
      );

      if (requiereComite && estadoComite === 'APROBADO') {
        await client.query(
          `update "Creditos"."TBL_CREDITO_DECISIONES"
           set estado_comite = 'APROBADO'
           where id_credito = $1 and decision = 'APROBADO' and requiere_comite = true and estado_comite = 'PENDIENTE'`,
          [creditoId]
        );
      }

      const aprobacionFinal = input.decision === 'APROBADO' && (!requiereComite || estadoComite === 'APROBADO');
      const estadoSolicitud = input.decision === 'APROBADO'
        ? (aprobacionFinal ? 'EN_APROBACION' : 'COMITE_PENDIENTE')
        : input.decision === 'RECHAZADO'
          ? 'RECHAZADO'
          : 'DEVUELTO';

      await client.query(
        `update "Creditos"."TBL_CREDITOS"
         set val_monto_solicitado = case when $2 = true then $3 else val_monto_solicitado end,
             num_plazo = case when $2 = true then $4 else num_plazo end,
             val_tasa = case when $2 = true then $5 else val_tasa end,
             val_cuota_estimada = case when $2 = true then $6 else val_cuota_estimada end,
             v_valor_credito = case when $2 = true then $3 else v_valor_credito end,
             v_cant_meses = case when $2 = true then $4 else v_cant_meses end,
             v_valor_taza_mensual = case when $2 = true then $5 else v_valor_taza_mensual end,
             v_valor_cuota = case when $2 = true then $6 else v_valor_cuota end,
             v_estado_solicitud = $7,
             fec_actualizacion = now()
         where id_credito = $1`,
        [creditoId, aprobacionFinal, roundMoney(monto), plazo, tasa, roundMoney(cuota), estadoSolicitud]
      );

      await addCreditoHistory(
        client,
        creditoId,
        null,
        `DECISION_${input.decision}`,
        row.estado,
        estadoSolicitud,
        input.observacion?.trim() || (requiereComite && estadoComite === 'PENDIENTE' ? `Comite pendiente ${votosActuales}/${votosRequeridos}` : `Decision ${input.decision.toLowerCase()} registrada`),
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
