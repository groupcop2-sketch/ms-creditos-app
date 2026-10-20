import { configurarAtributo, evaluarExpresion, type ModoCalculo } from '../creditos/formulas-atributos.js';
import type { ClientLike } from '../../lib/db.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

interface CatalogRow {
  id: number;
  nombre: string;
}

interface FormulaCatalogRow extends CatalogRow {
  expresion: string | null;
  multiplica_por_plazo: boolean | null;
  codigo: string | null;
  base_calculo: string | null;
  operacion: string | null;
  requiere_valor: boolean | null;
  requiere_valor2: boolean | null;
  requiere_porcentaje: boolean | null;
  aplica_minimo: boolean | null;
  aplica_maximo: boolean | null;
  activo: boolean | null;
}

export interface CreateProductoCreditoInput {
  nombre: string;
  descripcion?: string | null;
  idTipoCredito: number;
  tipoTasa?: string | null;
  idLibranzera?: number | null;
  montoMinimo?: number | null;
  montoMaximo?: number | null;
  salarioMinimo?: number | null;
  salarioMaximo?: number | null;
  plazoMinimo?: number | null;
  plazoMaximo?: number | null;
  modeloPlazo?: string | null;
  permiteCreditoMultiple?: boolean | null;
  interesAjustable?: boolean | null;
  permiteRefinanciacion?: boolean | null;
  permiteRetanqueo?: boolean | null;
  requiereCodeudor?: boolean | null;
  numeroCodeudores?: number | null;
  formatoCredito?: string | null;
  formatoRequisitos?: string | null;
  formatoCodeudores?: string | null;
  proveedorFirma?: string | null;
  periodoGracia?: number | null;
  periodicidad?: 'MENSUAL' | 'QUINCENAL' | null;
  diaCorte?: number | null;
  diaPagoOportuno?: number | null;
  ajustarFinSemana?: boolean | null;
  moraDespuesVencimiento?: number | null;
  tasaMoraMensual?: number | null;
  primeraCuotaMesSiguiente?: boolean | null;
  observacionCalendario?: string | null;
  porcentajeEndeudamientoMaximo?: number | null;
  antiguedadMinimaMeses?: number | null;
  requiereEmpleadoActivo?: boolean | null;
  bloqueaEmbargos?: boolean | null;
  idEstado?: number | null;
}

export interface CreateProductoAtributoInput {
  modoCalculo?: ModoCalculo | null;
  tipoLimite?: 'MONTO' | 'EDAD' | null;
  idTipoAtributo: number;
  idTipoCalculo: number;
  nombre: string;
  valor?: number | null;
  porcentaje?: number | null;
  valor2?: number | null;
  minimo?: number | null;
  maximo?: number | null;
  aplicaIva?: boolean | null;
  obligatorio?: boolean | null;
  proveedor?: string | null;
  prioridad?: number | null;
}

export interface CreateProductoDocumentoInput {
  idDocumentoCredito: number;
  obligatorio?: boolean | null;
  grupo?: string | null;
  prioridad?: number | null;
  aplicaA?: string | null;
  requiereFirma?: boolean | null;
  requiereValidacion?: boolean | null;
}

export interface CreateProductoConvenioInput {
  idEmpresa: number;
  cupoTotal?: number | null;
  cupoUsado?: number | null;
  porcentajeEndeudamientoMaximo?: number | null;
  requiereValidacionPagaduria?: boolean | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  activo?: boolean | null;
  observacion?: string | null;
}

interface ProductoConvenioRow {
  id_producto_convenio: number;
  id_producto_credito: number;
  id_empresa: number;
  empresa: string;
  nit: string | null;
  cupo_total: string | null;
  cupo_usado: string | null;
  porcentaje_endeudamiento_maximo: string | null;
  requiere_validacion_pagaduria: boolean;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  activo: boolean;
  observacion: string | null;
}

export interface CreateProductoEtapaInput {
  idEtapaCredito: number;
  orden: number;
  obligatoria?: boolean | null;
  permiteDevolucion?: boolean | null;
  responsable?: string | null;
  slaHoras?: number | null;
}

interface ProductoRow {
  id_producto_credito: number;
  consecutivo: string | null;
  nombre: string;
  descripcion: string | null;
  id_tipo_credito: number;
  tipo_credito: string;
  id_libranzera: number | null;
  libranzera: string | null;
  monto_minimo: string | null;
  monto_maximo: string | null;
  salario_minimo: string | null;
  salario_maximo: string | null;
  plazo_minimo: number | null;
  plazo_maximo: number | null;
  modelo_plazo: string;
  tipo_tasa: string;
  permite_credito_multiple: boolean;
  interes_ajustable: boolean;
  permite_refinanciacion: boolean;
  permite_retanqueo: boolean;
  requiere_codeudor: boolean;
  numero_codeudores: number;
  formato_credito: string | null;
  formato_requisitos: string | null;
  formato_codeudores: string | null;
  proveedor_firma: string | null;
  periodo_gracia: number | null;
  periodicidad: string | null;
  dia_corte: number | null;
  dia_pago_oportuno: number | null;
  ajustar_fin_semana: boolean | null;
  mora_despues_vencimiento: number | null;
  tasa_mora_mensual: string | null;
  primera_cuota_mes_siguiente: boolean | null;
  observacion_calendario: string | null;
  estado: string | null;
  activo: boolean | null;
  version: number | null;
  id_producto_base: number | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  porcentaje_endeudamiento_maximo: string | null;
  antiguedad_minima_meses: number | null;
  requiere_empleado_activo: boolean | null;
  bloquea_embargos: boolean | null;
  atributos: number;
  documentos: number;
  etapas: number;
}

interface AtributoRow {
  modo_calculo?: ModoCalculo | null;
  tipo_limite?: 'MONTO' | 'EDAD' | null;
  id_producto_atributo: number;
  id_tipo_atributo?: number;
  id_tipo_calculo?: number;
  tipo_atributo: string;
  tipo_calculo: string;
  nombre: string;
  valor: string | null;
  porcentaje: string | null;
  valor2: string | null;
  minimo: string | null;
  maximo: string | null;
  aplica_iva: boolean;
  obligatorio: boolean;
  proveedor: string | null;
  prioridad: number;
}

interface DocumentoRow {
  id_producto_documento: number;
  documento: string;
  obligatorio: boolean;
  grupo: string | null;
  prioridad: number;
  aplica_a: string;
  requiere_firma: boolean;
  requiere_validacion: boolean;
}

interface EtapaRow {
  id_producto_etapa: number;
  id_etapa_credito: number;
  etapa: string;
  orden: number;
  obligatoria: boolean;
  permite_devolucion: boolean;
  responsable: string | null;
  sla_horas: number | null;
}

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function nullableNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function withClient<T>(runner: (client: ClientLike) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}


async function ensureFormulaColumns(client: ClientLike) {
  await client.query(`
    alter table "Creditos"."TBL_TIPOS_CALCULO_CREDITO"
      add column if not exists codigo varchar(80) null,
      add column if not exists base_calculo varchar(40) null,
      add column if not exists operacion varchar(40) null,
      add column if not exists requiere_valor boolean null,
      add column if not exists requiere_valor2 boolean null,
      add column if not exists requiere_porcentaje boolean null,
      add column if not exists aplica_minimo boolean null,
      add column if not exists aplica_maximo boolean null,
      add column if not exists activo boolean null,
      add column if not exists expresion text null,
      add column if not exists multiplica_por_plazo boolean null
  `);
  await client.query(`
    alter table "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
      add column if not exists valor2 numeric(18,6) null,
      add column if not exists modo_calculo varchar(20) null,
      add column if not exists tipo_limite varchar(10) null
  `);

  const seedFormulas = [
    { nombre: 'SEGURO DE VIDA', codigo: 'SEG_VIDA', base: 'VALOR_CREDITO', op: 'BASE_POR_VALOR_DIV_VALOR2', rv: true, rv2: true, rp: false },
    { nombre: 'SEGURO DE VIDA DEUDORES', codigo: 'SEG_VIDA_DEUD', base: 'VALOR_CREDITO', op: 'BASE_POR_VALOR_DIV_VALOR2', rv: true, rv2: true, rp: false },
    { nombre: 'FIANZA', codigo: 'FIANZA', base: 'VALOR_CREDITO', op: 'PORCENTAJE', rv: false, rv2: false, rp: true },
    { nombre: 'SMMLV * %', codigo: 'SMMLV_PORC', base: 'SMLMV', op: 'PORCENTAJE', rv: false, rv2: false, rp: true },
    { nombre: 'VALOR CRÉDITO * %', codigo: 'VAL_CRED_PORC', base: 'VALOR_CREDITO', op: 'PORCENTAJE', rv: false, rv2: false, rp: true },
    { nombre: 'VALOR SALDO * %', codigo: 'VAL_SALDO_PORC', base: 'SALDO', op: 'PORCENTAJE', rv: false, rv2: false, rp: true },
    { nombre: '(VALOR DESEMBOLSO * VALOR) / VALOR2', codigo: 'DESEMB_DIV', base: 'VALOR_DESEMBOLSO', op: 'BASE_POR_VALOR_DIV_VALOR2', rv: true, rv2: true, rp: false },
    { nombre: 'Base * valor / valor2', codigo: 'BASE_MULT_DIV', base: 'VALOR_CREDITO', op: 'BASE_POR_VALOR_DIV_VALOR2', rv: true, rv2: true, rp: false }
  ];

  for (const sf of seedFormulas) {
    await client.query(`
      insert into "Creditos"."TBL_TIPOS_CALCULO_CREDITO" (des_tipo_calculo, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo)
      select $1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::boolean, $6::boolean, $7::boolean, true, true, true
      where not exists (
        select 1 from "Creditos"."TBL_TIPOS_CALCULO_CREDITO"
        where upper(des_tipo_calculo) = upper($1::varchar) or upper(coalesce(codigo, '')) = upper($2::varchar)
      )
    `, [sf.nombre, sf.codigo, sf.base, sf.op, sf.rv, sf.rv2, sf.rp]);
  }
}

function formulaCodeFromName(nombre: string) {
  return normalizeKey(nombre).replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function inferFormulaConfig(input: { nombre: string; codigo?: string | null; baseCalculo?: string | null; operacion?: string | null; requiereValor?: boolean | null; requiereValor2?: boolean | null; requierePorcentaje?: boolean | null; aplicaMinimo?: boolean | null; aplicaMaximo?: boolean | null; activo?: boolean | null; expresion?: string | null; multiplicaPorPlazo?: boolean | null }) {
  const key = normalizeKey(`${input.codigo ?? ''} ${input.nombre}`);
  let baseCalculo = input.baseCalculo;
  let operacion = input.operacion;
  if (!baseCalculo) baseCalculo = key.includes('DESEMBOLSO') ? 'VALOR_DESEMBOLSO' : key.includes('SALDO') ? 'SALDO' : key.includes('SMLMV') ? 'SMLMV' : key.includes('CUOTA') ? 'CUOTA' : 'VALOR_CREDITO';
  if (!operacion) operacion = key.includes('VALOR2') ? 'BASE_POR_VALOR_DIV_VALOR2' : key.includes('PLAZO') && key.includes('VALOR') ? 'VALOR_POR_PLAZO' : key.includes('%') ? 'PORCENTAJE' : 'VALOR_FIJO';
  return {
    codigo: input.codigo ?? formulaCodeFromName(input.nombre),
    baseCalculo,
    operacion,
    requiereValor: input.requiereValor ?? (operacion === 'PERSONALIZADA' ? /\bVALOR1?\b/.test(input.expresion ?? '') : operacion.includes('VALOR')),
    requiereValor2: input.requiereValor2 ?? (operacion.includes('VALOR2') || /\bVALOR2\b/.test(input.expresion ?? '')),
    requierePorcentaje: input.requierePorcentaje ?? (operacion.startsWith('PORCENTAJE') || /\bPORCENTAJE\b/.test(input.expresion ?? '')),
    aplicaMinimo: input.aplicaMinimo ?? true,
    aplicaMaximo: input.aplicaMaximo ?? true,
    expresion: input.expresion?.trim() || null,
    multiplicaPorPlazo: input.multiplicaPorPlazo ?? false,
    activo: input.activo ?? true
  };
}

function mapFormulaCatalog(row: FormulaCatalogRow) {
  const cfg = inferFormulaConfig({ nombre: row.nombre, codigo: row.codigo, baseCalculo: row.base_calculo, operacion: row.operacion, requiereValor: row.requiere_valor, requiereValor2: row.requiere_valor2, requierePorcentaje: row.requiere_porcentaje, aplicaMinimo: row.aplica_minimo, aplicaMaximo: row.aplica_maximo, activo: row.activo, expresion: row.expresion, multiplicaPorPlazo: row.multiplica_por_plazo });
  return { id: row.id, nombre: row.nombre, ...cfg };
}

export async function createTipoCalculoCredito(input: { nombre: string; codigo?: string | null; baseCalculo?: string | null; operacion?: string | null; requiereValor?: boolean | null; requiereValor2?: boolean | null; requierePorcentaje?: boolean | null; aplicaMinimo?: boolean | null; aplicaMaximo?: boolean | null; expresion?: string | null; multiplicaPorPlazo?: boolean | null }) {
  return withClient(async (client) => {
    await ensureFormulaColumns(client);
    const cfg = inferFormulaConfig(input);
    if (cfg.operacion === 'PERSONALIZADA' || cfg.expresion) {
      try { evaluarExpresion(cfg.expresion ?? '', {BASE:1,VALOR:1,VALOR1:1,VALOR2:1,PLAZO:1,PORCENTAJE:1}, true); }
      catch (error) { throw new SecurityError(error instanceof Error ? error.message : 'Expresion invalida', 400); }
    }
    const result = await client.query<FormulaCatalogRow>(
      `insert into "Creditos"."TBL_TIPOS_CALCULO_CREDITO" (des_tipo_calculo, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo, expresion, multiplica_por_plazo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)
       returning id_tipo_calculo as id, des_tipo_calculo as nombre, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo, expresion, multiplica_por_plazo`,
      [input.nombre.trim(), cfg.codigo, cfg.baseCalculo, cfg.operacion, cfg.requiereValor, cfg.requiereValor2, cfg.requierePorcentaje, cfg.aplicaMinimo, cfg.aplicaMaximo, cfg.expresion, cfg.multiplicaPorPlazo]
    );
    return mapFormulaCatalog(result.rows[0]);
  });
}

interface ParametroFinancieroRow {
  id_parametro_financiero: number;
  codigo: string;
  nombre: string;
  valor: string;
  unidad: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  activo: boolean;
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
  await client.query(`insert into "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, nombre, valor, unidad, vigencia_desde) select 'SMLMV', 'Salario minimo legal mensual vigente', 1300000, 'VALOR', date '2024-01-01' where not exists (select 1 from "Creditos"."TBL_PARAMETROS_FINANCIEROS" where codigo = 'SMLMV')`);
  await client.query(`insert into "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, nombre, valor, unidad, vigencia_desde) select 'IVA', 'Impuesto al valor agregado', 19, 'PORCENTAJE', date '2024-01-01' where not exists (select 1 from "Creditos"."TBL_PARAMETROS_FINANCIEROS" where codigo = 'IVA')`);
}

function mapParametro(row: ParametroFinancieroRow) {
  return { id: row.id_parametro_financiero, codigo: row.codigo, nombre: row.nombre, valor: Number(row.valor), unidad: row.unidad, vigenciaDesde: row.vigencia_desde, vigenciaHasta: row.vigencia_hasta, activo: row.activo };
}

export async function listParametrosFinancieros() {
  return withClient(async (client) => {
    await ensureParametrosFinancierosTable(client);
    const result = await client.query<ParametroFinancieroRow>('select * from "Creditos"."TBL_PARAMETROS_FINANCIEROS" order by codigo, vigencia_desde desc');
    return result.rows.map(mapParametro);
  });
}

export async function createParametroFinanciero(input: { codigo: string; nombre: string; valor: number; unidad: string; vigenciaDesde: string; vigenciaHasta?: string | null }) {
  return withClient(async (client) => {
    await ensureParametrosFinancierosTable(client);
    const result = await client.query<ParametroFinancieroRow>(
      'insert into "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, nombre, valor, unidad, vigencia_desde, vigencia_hasta) values ($1,$2,$3,$4,$5,$6) returning *',
      [input.codigo.trim().toUpperCase(), input.nombre.trim(), input.valor, input.unidad, input.vigenciaDesde, input.vigenciaHasta ?? null]
    );
    return mapParametro(result.rows[0]);
  });
}

async function ensureProductoConveniosTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" (
      id_producto_convenio serial primary key,
      id_producto_credito integer not null references "Creditos"."TBL_PRODUCTOS_CREDITO"(id_producto_credito) on delete cascade,
      id_empresa integer not null references "Creditos"."TBL_EMPRESAS"(id_empresa),
      cupo_total numeric(18,2) null,
      cupo_usado numeric(18,2) not null default 0,
      porcentaje_endeudamiento_maximo numeric(8,4) null,
      requiere_validacion_pagaduria boolean not null default true,
      vigencia_desde date null,
      vigencia_hasta date null,
      activo boolean not null default true,
      observacion text null,
      fec_creacion timestamp not null default now(),
      unique (id_producto_credito, id_empresa)
    )
  `);
}

function mapProductoConvenio(row: ProductoConvenioRow) {
  return {
    id: row.id_producto_convenio,
    idProductoCredito: row.id_producto_credito,
    idEmpresa: row.id_empresa,
    empresa: row.empresa,
    nit: row.nit,
    cupoTotal: row.cupo_total ? Number(row.cupo_total) : null,
    cupoUsado: row.cupo_usado ? Number(row.cupo_usado) : 0,
    cupoDisponible: row.cupo_total ? Math.max(Number(row.cupo_total) - Number(row.cupo_usado ?? 0), 0) : null,
    porcentajeEndeudamientoMaximo: row.porcentaje_endeudamiento_maximo ? Number(row.porcentaje_endeudamiento_maximo) : null,
    requiereValidacionPagaduria: row.requiere_validacion_pagaduria,
    vigenciaDesde: row.vigencia_desde,
    vigenciaHasta: row.vigencia_hasta,
    activo: row.activo,
    observacion: row.observacion
  };
}

async function getActiveStateId(client: ClientLike) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );
  return result.rows[0]?.id_estado ?? null;
}

async function ensureProductoCalendarioColumns(client: ClientLike) {
  await client.query(`
    alter table "Creditos"."TBL_PRODUCTOS_CREDITO"
      add column if not exists periodicidad varchar(20) null,
      add column if not exists dia_corte integer null,
      add column if not exists dia_pago_oportuno integer null,
      add column if not exists ajustar_fin_semana boolean null,
      add column if not exists mora_despues_vencimiento integer null,
      add column if not exists tasa_mora_mensual numeric(8,4) null,
      add column if not exists primera_cuota_mes_siguiente boolean null,
      add column if not exists observacion_calendario text null,
      add column if not exists activo boolean not null default true,
      add column if not exists version integer not null default 1,
      add column if not exists id_producto_base integer null,
      add column if not exists vigencia_desde date null,
      add column if not exists vigencia_hasta date null,
      add column if not exists porcentaje_endeudamiento_maximo numeric(8,4) null,
      add column if not exists antiguedad_minima_meses integer null,
      add column if not exists requiere_empleado_activo boolean not null default true,
      add column if not exists bloquea_embargos boolean not null default true
  `);
}

function mapProducto(row: ProductoRow) {
  return {
    id: row.id_producto_credito,
    consecutivo: row.consecutivo,
    nombre: row.nombre,
    descripcion: row.descripcion,
    idTipoCredito: row.id_tipo_credito,
    tipoCredito: row.tipo_credito,
    idLibranzera: row.id_libranzera,
    libranzera: row.libranzera,
    montoMinimo: row.monto_minimo ? Number(row.monto_minimo) : null,
    montoMaximo: row.monto_maximo ? Number(row.monto_maximo) : null,
    salarioMinimo: row.salario_minimo ? Number(row.salario_minimo) : null,
    salarioMaximo: row.salario_maximo ? Number(row.salario_maximo) : null,
    plazoMinimo: row.plazo_minimo,
    plazoMaximo: row.plazo_maximo,
    modeloPlazo: row.modelo_plazo,
    tipoTasa: row.tipo_tasa,
    permiteCreditoMultiple: row.permite_credito_multiple,
    interesAjustable: row.interes_ajustable,
    permiteRefinanciacion: row.permite_refinanciacion,
    permiteRetanqueo: row.permite_retanqueo,
    requiereCodeudor: row.requiere_codeudor,
    numeroCodeudores: row.numero_codeudores,
    formatoCredito: row.formato_credito,
    formatoRequisitos: row.formato_requisitos,
    formatoCodeudores: row.formato_codeudores,
    proveedorFirma: row.proveedor_firma,
    periodoGracia: row.periodo_gracia,
    periodicidad: row.periodicidad,
    diaCorte: row.dia_corte,
    diaPagoOportuno: row.dia_pago_oportuno,
    ajustarFinSemana: row.ajustar_fin_semana,
    moraDespuesVencimiento: row.mora_despues_vencimiento,
    tasaMoraMensual: row.tasa_mora_mensual ? Number(row.tasa_mora_mensual) : null,
    primeraCuotaMesSiguiente: row.primera_cuota_mes_siguiente,
    observacionCalendario: row.observacion_calendario,
    estado: row.estado,
    activo: row.activo ?? true,
    version: row.version ?? 1,
    idProductoBase: row.id_producto_base,
    vigenciaDesde: row.vigencia_desde,
    vigenciaHasta: row.vigencia_hasta,
    porcentajeEndeudamientoMaximo: row.porcentaje_endeudamiento_maximo ? Number(row.porcentaje_endeudamiento_maximo) : null,
    antiguedadMinimaMeses: row.antiguedad_minima_meses,
    requiereEmpleadoActivo: row.requiere_empleado_activo ?? true,
    bloqueaEmbargos: row.bloquea_embargos ?? true,
    atributos: Number(row.atributos ?? 0),
    documentos: Number(row.documentos ?? 0),
    etapas: Number(row.etapas ?? 0)
  };
}

const productoSelect = `
  select p.*, tc.des_tipo_credito as tipo_credito, l.v_razon_social as libranzera, e.v_descripcion as estado,
    (select count(*)::int from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a where a.id_producto_credito = p.id_producto_credito) as atributos,
    (select count(*)::int from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" d where d.id_producto_credito = p.id_producto_credito) as documentos,
    (select count(*)::int from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" et where et.id_producto_credito = p.id_producto_credito) as etapas
  from "Creditos"."TBL_PRODUCTOS_CREDITO" p
  inner join "Creditos"."TBL_TIPOS_CREDITO" tc on tc.id_tipo_credito = p.id_tipo_credito
  left join "Creditos"."TBL_LIBRANZERAS" l on l.id_libranzera = p.id_libranzera
  left join "Creditos"."TBL_ESTADOS" e on e.id_estado = p.id_estado
`;

export async function listProductosCreditoCatalogs() {
  return withClient(async (client) => {
    await ensureFormulaColumns(client);
    const [tiposCredito, tiposAtributo, tiposCalculo, documentos, etapas, libranzeras] = await Promise.all([
      client.query<CatalogRow>('select id_tipo_credito as id, des_tipo_credito as nombre from "Creditos"."TBL_TIPOS_CREDITO" order by des_tipo_credito'),
      client.query<CatalogRow>('select id_tipo_atributo as id, des_tipo_atributo as nombre from "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" order by des_tipo_atributo'),
      client.query<FormulaCatalogRow>('select id_tipo_calculo as id, des_tipo_calculo as nombre, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo, expresion, multiplica_por_plazo from "Creditos"."TBL_TIPOS_CALCULO_CREDITO" where coalesce(activo, true) = true order by des_tipo_calculo'),
      client.query<CatalogRow>('select id_documento_credito as id, des_documento as nombre from "Creditos"."TBL_DOCUMENTOS_CREDITO" order by des_documento'),
      client.query<CatalogRow>('select id_etapa_credito as id, des_etapa as nombre from "Creditos"."TBL_ETAPAS_CREDITO" order by id_etapa_credito'),
      client.query<CatalogRow>('select id_libranzera as id, v_razon_social as nombre from "Creditos"."TBL_LIBRANZERAS" order by v_razon_social')
    ]);
    return { tiposCredito: tiposCredito.rows, tiposAtributo: tiposAtributo.rows, tiposCalculo: tiposCalculo.rows.map(mapFormulaCatalog), documentos: documentos.rows, etapas: etapas.rows, libranzeras: libranzeras.rows };
  });
}

export async function listProductosCredito() {
  return withClient(async (client) => {
    await ensureProductoCalendarioColumns(client);
    const result = await client.query<ProductoRow>(`${productoSelect} order by p.nombre`);
    return result.rows.map(mapProducto);
  });
}

export async function updateProductoCredito(productoId: number, input: CreateProductoCreditoInput) {
  return withClient(async (client) => {
    await ensureProductoCalendarioColumns(client);
    await ensureProducto(client, productoId);
    const stateId = input.idEstado ?? await getActiveStateId(client);
    await client.query(
      `update "Creditos"."TBL_PRODUCTOS_CREDITO"
       set nombre = $2, descripcion = $3, id_tipo_credito = $4, tipo_tasa = $5, id_libranzera = $6,
           monto_minimo = $7, monto_maximo = $8, salario_minimo = $9, salario_maximo = $10,
           plazo_minimo = $11, plazo_maximo = $12, modelo_plazo = $13, permite_credito_multiple = $14,
           interes_ajustable = $15, permite_refinanciacion = $16, permite_retanqueo = $17, requiere_codeudor = $18,
           numero_codeudores = $19, formato_credito = $20, formato_requisitos = $21, formato_codeudores = $22,
           proveedor_firma = $23, periodo_gracia = $24, periodicidad = $25, dia_corte = $26, dia_pago_oportuno = $27,
           ajustar_fin_semana = $28, mora_despues_vencimiento = $29, tasa_mora_mensual = $30,
           primera_cuota_mes_siguiente = $31, observacion_calendario = $32, id_estado = coalesce($33, id_estado),
           porcentaje_endeudamiento_maximo = $34, antiguedad_minima_meses = $35,
           requiere_empleado_activo = $36, bloquea_embargos = $37
       where id_producto_credito = $1`,
      [
        productoId, input.nombre.trim(), nullableText(input.descripcion), input.idTipoCredito, nullableText(input.tipoTasa) ?? 'FIJA',
        input.idLibranzera ?? null, nullableNumber(input.montoMinimo), nullableNumber(input.montoMaximo),
        nullableNumber(input.salarioMinimo), nullableNumber(input.salarioMaximo), nullableNumber(input.plazoMinimo),
        nullableNumber(input.plazoMaximo), nullableText(input.modeloPlazo) ?? 'MESES', Boolean(input.permiteCreditoMultiple),
        Boolean(input.interesAjustable), Boolean(input.permiteRefinanciacion), Boolean(input.permiteRetanqueo),
        Boolean(input.requiereCodeudor), nullableNumber(input.numeroCodeudores) ?? 0, nullableText(input.formatoCredito),
        nullableText(input.formatoRequisitos), nullableText(input.formatoCodeudores), nullableText(input.proveedorFirma),
        nullableNumber(input.periodoGracia), input.periodicidad ?? 'MENSUAL', nullableNumber(input.diaCorte) ?? 25,
        nullableNumber(input.diaPagoOportuno) ?? 30, input.ajustarFinSemana ?? true, nullableNumber(input.moraDespuesVencimiento) ?? 0,
        nullableNumber(input.tasaMoraMensual) ?? 2, input.primeraCuotaMesSiguiente ?? true, nullableText(input.observacionCalendario), stateId, nullableNumber(input.porcentajeEndeudamientoMaximo) ?? 40, nullableNumber(input.antiguedadMinimaMeses) ?? 0, input.requiereEmpleadoActivo ?? true, input.bloqueaEmbargos ?? true
      ]
    );
    const result = await client.query<ProductoRow>(`${productoSelect} where p.id_producto_credito = $1`, [productoId]);
    return mapProducto(result.rows[0]);
  });
}

export async function deleteProductoCredito(productoId: number) {
  return withClient(async (client) => {
    await ensureProductoCalendarioColumns(client);
    await ensureProducto(client, productoId);
    const linked = await client.query('select 1 from "Creditos"."TBL_CREDITOS" where id_producto_credito = $1 limit 1', [productoId]);
    if (linked.rowCount) throw new SecurityError('No se puede eliminar un producto con creditos asociados. Inactivalo o crea una nueva version.', 409);
    await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1', [productoId]);
    await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1', [productoId]);
    await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1', [productoId]);
    await client.query('delete from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1', [productoId]);
    return { deleted: true };
  });
}

export async function updateProductoCreditoEstado(productoId: number, activo: boolean) {
  return withClient(async (client) => {
    await ensureProductoCalendarioColumns(client);
    await ensureProducto(client, productoId);
    await client.query('update "Creditos"."TBL_PRODUCTOS_CREDITO" set activo = $2, vigencia_hasta = case when $2 = false then current_date else null end where id_producto_credito = $1', [productoId, activo]);
    const result = await client.query<ProductoRow>(`${productoSelect} where p.id_producto_credito = $1`, [productoId]);
    return mapProducto(result.rows[0]);
  });
}

export async function createProductoCreditoVersion(productoId: number) {
  return withClient(async (client) => {
    await ensureProductoCalendarioColumns(client);
    await ensureFormulaColumns(client);
    await ensureProducto(client, productoId);
    const base = await client.query<{ id_producto_base: number | null }>('select id_producto_base from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1', [productoId]);
    const baseId = base.rows[0]?.id_producto_base ?? productoId;
    const nextVersion = await client.query<{ version: number }>('select coalesce(max(version), 0) + 1 as version from "Creditos"."TBL_PRODUCTOS_CREDITO" where coalesce(id_producto_base, id_producto_credito) = $1', [baseId]);
    const version = nextVersion.rows[0]?.version ?? 2;
    const consecutivo = await generateProductoConsecutivo(client);
    const created = await client.query<{ id_producto_credito: number }>(`
      insert into "Creditos"."TBL_PRODUCTOS_CREDITO" (
        consecutivo, nombre, descripcion, id_tipo_credito, tipo_tasa, id_libranzera, monto_minimo, monto_maximo,
        salario_minimo, salario_maximo, plazo_minimo, plazo_maximo, modelo_plazo,
        permite_credito_multiple, interes_ajustable, permite_refinanciacion, permite_retanqueo,
        requiere_codeudor, numero_codeudores, formato_credito, formato_requisitos,
        formato_codeudores, proveedor_firma, periodo_gracia,
        periodicidad, dia_corte, dia_pago_oportuno, ajustar_fin_semana,
        mora_despues_vencimiento, tasa_mora_mensual, primera_cuota_mes_siguiente, observacion_calendario,
        id_estado, activo, version, id_producto_base, vigencia_desde,
        porcentaje_endeudamiento_maximo, antiguedad_minima_meses, requiere_empleado_activo, bloquea_embargos
      )
      select $2, nombre || ' v' || $3, descripcion, id_tipo_credito, tipo_tasa, id_libranzera, monto_minimo, monto_maximo,
        salario_minimo, salario_maximo, plazo_minimo, plazo_maximo, modelo_plazo,
        permite_credito_multiple, interes_ajustable, permite_refinanciacion, permite_retanqueo,
        requiere_codeudor, numero_codeudores, formato_credito, formato_requisitos,
        formato_codeudores, proveedor_firma, periodo_gracia,
        periodicidad, dia_corte, dia_pago_oportuno, ajustar_fin_semana,
        mora_despues_vencimiento, tasa_mora_mensual, primera_cuota_mes_siguiente, observacion_calendario,
        id_estado, true, $3, $4, current_date,
        porcentaje_endeudamiento_maximo, antiguedad_minima_meses, requiere_empleado_activo, bloquea_embargos
      from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1
      returning id_producto_credito`, [productoId, consecutivo, version, baseId]);
    const newId = created.rows[0].id_producto_credito;
    await client.query('insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad, modo_calculo, tipo_limite) select $2, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad, modo_calculo, tipo_limite from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1', [productoId, newId]);
    await client.query('insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion) select $2, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1', [productoId, newId]);
    await client.query('insert into "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" (id_producto_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas) select $2, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1', [productoId, newId]);
    await client.query('update "Creditos"."TBL_PRODUCTOS_CREDITO" set activo = false, vigencia_hasta = current_date where id_producto_credito = $1', [productoId]);
    const result = await client.query<ProductoRow>(`${productoSelect} where p.id_producto_credito = $1`, [newId]);
    return mapProducto(result.rows[0]);
  });
}

export async function createProductoCredito(input: CreateProductoCreditoInput) {
  return withClient(async (client) => {
    await ensureProductoCalendarioColumns(client);
    const stateId = input.idEstado ?? await getActiveStateId(client);
    const consecutivo = await generateProductoConsecutivo(client);
    const created = await client.query<{ id_producto_credito: number }>(
      `insert into "Creditos"."TBL_PRODUCTOS_CREDITO" (
        consecutivo, nombre, descripcion, id_tipo_credito, tipo_tasa, id_libranzera, monto_minimo, monto_maximo,
        salario_minimo, salario_maximo, plazo_minimo, plazo_maximo, modelo_plazo,
        permite_credito_multiple, interes_ajustable, permite_refinanciacion, permite_retanqueo,
        requiere_codeudor, numero_codeudores, formato_credito, formato_requisitos,
        formato_codeudores, proveedor_firma, periodo_gracia,
        periodicidad, dia_corte, dia_pago_oportuno, ajustar_fin_semana,
        mora_despues_vencimiento, tasa_mora_mensual, primera_cuota_mes_siguiente, observacion_calendario,
        id_estado
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24,
        $25, $26, $27, $28,
        $29, $30, $31, $32,
        $33
      ) returning id_producto_credito`,
      [
        consecutivo,
        input.nombre.trim(),
        nullableText(input.descripcion),
        input.idTipoCredito,
        nullableText(input.tipoTasa) ?? 'FIJA',
        input.idLibranzera ?? null,
        nullableNumber(input.montoMinimo),
        nullableNumber(input.montoMaximo),
        nullableNumber(input.salarioMinimo),
        nullableNumber(input.salarioMaximo),
        nullableNumber(input.plazoMinimo),
        nullableNumber(input.plazoMaximo),
        nullableText(input.modeloPlazo) ?? 'MESES',
        Boolean(input.permiteCreditoMultiple),
        Boolean(input.interesAjustable),
        Boolean(input.permiteRefinanciacion),
        Boolean(input.permiteRetanqueo),
        Boolean(input.requiereCodeudor),
        nullableNumber(input.numeroCodeudores) ?? 0,
        nullableText(input.formatoCredito),
        nullableText(input.formatoRequisitos),
        nullableText(input.formatoCodeudores),
        nullableText(input.proveedorFirma),
        nullableNumber(input.periodoGracia),
        input.periodicidad ?? 'MENSUAL',
        nullableNumber(input.diaCorte) ?? 25,
        nullableNumber(input.diaPagoOportuno) ?? 30,
        input.ajustarFinSemana ?? true,
        nullableNumber(input.moraDespuesVencimiento) ?? 0,
        nullableNumber(input.tasaMoraMensual) ?? 2,
        input.primeraCuotaMesSiguiente ?? true,
        nullableText(input.observacionCalendario),
        stateId
      ]
    );

    const result = await client.query<ProductoRow>(`${productoSelect} where p.id_producto_credito = $1`, [created.rows[0].id_producto_credito]);
    return mapProducto(result.rows[0]);
  });
}

async function generateProductoConsecutivo(client: ClientLike) {
  const result = await client.query<{ next_value: number }>(
    `select coalesce(max(substring(consecutivo from '[0-9]+$')::int), 0) + 1 as next_value
     from "Creditos"."TBL_PRODUCTOS_CREDITO"
     where consecutivo ~ '^PC-[0-9]+$'`
  );

  return `PC-${String(result.rows[0]?.next_value ?? 1).padStart(6, '0')}`;
}

export async function listProductoAtributos(productoId: number) {
  return withClient(async (client) => {
    const result = await client.query<AtributoRow>(
      `select a.*, ta.des_tipo_atributo as tipo_atributo, tc.des_tipo_calculo as tipo_calculo
       from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a
       inner join "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" ta on ta.id_tipo_atributo = a.id_tipo_atributo
       inner join "Creditos"."TBL_TIPOS_CALCULO_CREDITO" tc on tc.id_tipo_calculo = a.id_tipo_calculo
       where a.id_producto_credito = $1 order by a.prioridad, a.nombre`,
      [productoId]
    );
    return result.rows.map((row) => ({ modoCalculo: row.modo_calculo ?? null, tipoLimite: row.tipo_limite ?? 'MONTO', id: row.id_producto_atributo, idTipoAtributo: row.id_tipo_atributo, idTipoCalculo: row.id_tipo_calculo, tipoAtributo: row.tipo_atributo, tipoCalculo: row.tipo_calculo, nombre: row.nombre, valor: row.valor ? Number(row.valor) : null, porcentaje: row.porcentaje ? Number(row.porcentaje) : null, valor2: row.valor2 ? Number(row.valor2) : null, minimo: row.minimo ? Number(row.minimo) : null, maximo: row.maximo ? Number(row.maximo) : null, aplicaIva: row.aplica_iva, obligatorio: row.obligatorio, proveedor: row.proveedor, prioridad: row.prioridad }));
  });
}

async function validarEntradaAtributo(client: ClientLike, input: CreateProductoAtributoInput) {
  const result = await client.query<Record<string, any>>('select * from "Creditos"."TBL_TIPOS_CALCULO_CREDITO" where id_tipo_calculo = $1', [input.idTipoCalculo]);
  if (!result.rowCount) throw new SecurityError('Formula asociada no encontrada', 400);
  try {
    const formula = result.rows[0];
    const config = configurarAtributo({ ...formula, ...input, tipo_calculo: formula.des_tipo_calculo });
    if (input.tipoLimite === 'EDAD' && [input.minimo, input.maximo].some(value => value != null && (!Number.isInteger(value) || value < 0 || value > 120))) throw new Error('Los limites de edad deben ser enteros entre 0 y 120');
    if (input.minimo != null && input.maximo != null && input.maximo > 0 && input.minimo > input.maximo) throw new Error('El limite minimo no puede superar al maximo');
    return { ...input, modoCalculo: config.modoCalculo, valor: config.valor, porcentaje: config.porcentaje, valor2: config.modoCalculo === 'FORMULA' ? config.valor2 : null };
  } catch (error) { throw new SecurityError(error instanceof Error ? error.message : 'Configuracion de atributo invalida', 400); }
}

export async function updateProductoAtributo(productoId: number, productoAtributoId: number, input: CreateProductoAtributoInput) {
  return withClient(async (client) => {
    await ensureFormulaColumns(client);
    await ensureProducto(client, productoId);
    if (input.tipoLimite == null) {
      const previo = await client.query<{tipo_limite: 'MONTO' | 'EDAD' | null}>('select tipo_limite from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1 and id_producto_atributo = $2', [productoId, productoAtributoId]);
      input = { ...input, tipoLimite: previo.rows[0]?.tipo_limite ?? 'MONTO' };
    }
    input = await validarEntradaAtributo(client, input);
    let updated = await client.query(
      `update "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
       set id_tipo_atributo = $3, id_tipo_calculo = $4, nombre = $5, valor = $6, porcentaje = $7, valor2 = $8, minimo = $9, maximo = $10, aplica_iva = $11, obligatorio = $12, proveedor = $13, prioridad = $14, modo_calculo = $15, tipo_limite = $16
       where id_producto_credito = $1 and id_producto_atributo = $2`,
      [productoId, productoAtributoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1, input.modoCalculo ?? null, input.tipoLimite ?? 'MONTO']
    );
    if (!updated.rowCount) {
      updated = await client.query(
        `update "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
         set id_tipo_atributo = $3, id_tipo_calculo = $4, nombre = $5, valor = $6, porcentaje = $7, valor2 = $8, minimo = $9, maximo = $10, aplica_iva = $11, obligatorio = $12, proveedor = $13, prioridad = $14, modo_calculo = $15, tipo_limite = $16
         where id_producto_credito = $1 and id_tipo_atributo = $2`,
        [productoId, productoAtributoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1, input.modoCalculo ?? null, input.tipoLimite ?? 'MONTO']
      );
    }
    if (!updated.rowCount) {
      await client.query(
        `insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad, modo_calculo, tipo_limite)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [productoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1, input.modoCalculo ?? null, input.tipoLimite ?? 'MONTO']
      );
    }
    return listProductoAtributos(productoId);
  });
}

export async function deleteProductoAtributo(productoId: number, productoAtributoId: number) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    let deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1 and id_producto_atributo = $2', [productoId, productoAtributoId]);
    if (!deleted.rowCount) {
      deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1 and id_tipo_atributo = $2', [productoId, productoAtributoId]);
    }
    if (!deleted.rowCount) throw new SecurityError('Atributo del producto no encontrado', 404);
    return listProductoAtributos(productoId);
  });
}

export async function createProductoAtributo(productoId: number, input: CreateProductoAtributoInput) {
  return withClient(async (client) => {
    await ensureFormulaColumns(client);
    await ensureProducto(client, productoId);
    input = await validarEntradaAtributo(client, input);
    await client.query(
      `insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad, modo_calculo, tipo_limite)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [productoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1, input.modoCalculo ?? null, input.tipoLimite ?? 'MONTO']
    );
    return listProductoAtributos(productoId);
  });
}

export async function listProductoDocumentos(productoId: number) {
  return withClient(async (client) => {
    const result = await client.query<DocumentoRow>(
      `select pd.*, d.des_documento as documento
       from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" pd
       inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = pd.id_documento_credito
       where pd.id_producto_credito = $1 order by pd.prioridad, d.des_documento`,
      [productoId]
    );
    return result.rows.map((row) => ({ id: row.id_producto_documento, documento: row.documento, obligatorio: row.obligatorio, grupo: row.grupo, prioridad: row.prioridad, aplicaA: row.aplica_a, requiereFirma: row.requiere_firma, requiereValidacion: row.requiere_validacion }));
  });
}

export async function updateProductoDocumento(productoId: number, productoDocumentoId: number, input: CreateProductoDocumentoInput) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    let updated = await client.query(
      `update "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS"
       set id_documento_credito = $3,
           obligatorio = $4,
           grupo = $5,
           prioridad = $6,
           aplica_a = $7,
           requiere_firma = $8,
           requiere_validacion = $9
       where id_producto_credito = $1 and id_producto_documento = $2`,
      [productoId, productoDocumentoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]
    );
    if (!updated.rowCount) {
      updated = await client.query(
        `update "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS"
         set id_documento_credito = $3,
             obligatorio = $4,
             grupo = $5,
             prioridad = $6,
             aplica_a = $7,
             requiere_firma = $8,
             requiere_validacion = $9
         where id_producto_credito = $1 and id_documento_credito = $2`,
        [productoId, productoDocumentoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]
      );
    }
    if (!updated.rowCount) {
      await client.query(
        `insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [productoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]
      );
    }
    return listProductoDocumentos(productoId);
  });
}

export async function deleteProductoDocumento(productoId: number, productoDocumentoId: number) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    let deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1 and id_producto_documento = $2', [productoId, productoDocumentoId]);
    if (!deleted.rowCount) {
      deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1 and id_documento_credito = $2', [productoId, productoDocumentoId]);
    }
    if (!deleted.rowCount) throw new SecurityError('Documento del producto no encontrado', 404);
    return listProductoDocumentos(productoId);
  });
}

export async function createProductoDocumento(productoId: number, input: CreateProductoDocumentoInput) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    await client.query(
      `insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [productoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]
    );
    return listProductoDocumentos(productoId);
  });
}

export async function listProductoConvenios(productoId: number) {
  return withClient(async (client) => {
    await ensureProductoConveniosTable(client);
    await ensureProducto(client, productoId);
    const result = await client.query<ProductoConvenioRow>(
      `select c.*, e.v_razon_social as empresa, e.v_nit as nit
       from "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" c
       inner join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where c.id_producto_credito = $1
       order by e.v_razon_social`,
      [productoId]
    );
    return result.rows.map(mapProductoConvenio);
  });
}

export async function saveProductoConvenio(productoId: number, input: CreateProductoConvenioInput) {
  return withClient(async (client) => {
    await ensureProductoConveniosTable(client);
    await ensureProducto(client, productoId);
    const empresa = await client.query('select 1 from "Creditos"."TBL_EMPRESAS" where id_empresa = $1 limit 1', [input.idEmpresa]);
    if (!empresa.rowCount) throw new SecurityError('Empresa del convenio no encontrada', 404);
    await client.query(
      `insert into "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" (
        id_producto_credito, id_empresa, cupo_total, cupo_usado, porcentaje_endeudamiento_maximo,
        requiere_validacion_pagaduria, vigencia_desde, vigencia_hasta, activo, observacion
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (id_producto_credito, id_empresa) do update set
        cupo_total = excluded.cupo_total,
        cupo_usado = excluded.cupo_usado,
        porcentaje_endeudamiento_maximo = excluded.porcentaje_endeudamiento_maximo,
        requiere_validacion_pagaduria = excluded.requiere_validacion_pagaduria,
        vigencia_desde = excluded.vigencia_desde,
        vigencia_hasta = excluded.vigencia_hasta,
        activo = excluded.activo,
        observacion = excluded.observacion`,
      [productoId, input.idEmpresa, nullableNumber(input.cupoTotal), nullableNumber(input.cupoUsado) ?? 0, nullableNumber(input.porcentajeEndeudamientoMaximo), input.requiereValidacionPagaduria ?? true, input.vigenciaDesde ?? null, input.vigenciaHasta ?? null, input.activo ?? true, nullableText(input.observacion)]
    );
    return listProductoConvenios(productoId);
  });
}

export async function deleteProductoConvenio(productoId: number, convenioId: number) {
  return withClient(async (client) => {
    await ensureProductoConveniosTable(client);
    await ensureProducto(client, productoId);
    const deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" where id_producto_credito = $1 and id_producto_convenio = $2', [productoId, convenioId]);
    if (!deleted.rowCount) throw new SecurityError('Convenio del producto no encontrado', 404);
    return listProductoConvenios(productoId);
  });
}

export async function listProductoEtapas(productoId: number) {
  return withClient(async (client) => {
    const result = await client.query<EtapaRow>(
      `select pe.*, e.des_etapa as etapa
       from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" pe
       inner join "Creditos"."TBL_ETAPAS_CREDITO" e on e.id_etapa_credito = pe.id_etapa_credito
       where pe.id_producto_credito = $1 order by pe.orden`,
      [productoId]
    );
    return result.rows.map((row) => ({ id: row.id_producto_etapa, idEtapaCredito: row.id_etapa_credito, etapa: row.etapa, orden: row.orden, obligatoria: row.obligatoria, permiteDevolucion: row.permite_devolucion, responsable: row.responsable, slaHoras: row.sla_horas }));
  });
}

export async function createProductoEtapa(productoId: number, input: CreateProductoEtapaInput) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    await client.query(
      `insert into "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" (id_producto_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [productoId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]
    );
    return listProductoEtapas(productoId);
  });
}

export async function updateProductoEtapa(productoId: number, productoEtapaId: number, input: CreateProductoEtapaInput) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    let updated = await client.query(
      `update "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS"
       set id_etapa_credito = $3,
           orden = $4,
           obligatoria = $5,
           permite_devolucion = $6,
           responsable = $7,
           sla_horas = $8
       where id_producto_credito = $1 and id_producto_etapa = $2`,
      [productoId, productoEtapaId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]
    );
    if (!updated.rowCount) {
      updated = await client.query(
        `update "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS"
         set id_etapa_credito = $3,
             orden = $4,
             obligatoria = $5,
             permite_devolucion = $6,
             responsable = $7,
             sla_horas = $8
         where id_producto_credito = $1 and id_etapa_credito = $2`,
        [productoId, productoEtapaId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]
      );
    }
    if (!updated.rowCount) {
      await client.query(
        `insert into "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" (id_producto_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [productoId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]
      );
    }
    return listProductoEtapas(productoId);
  });
}

export async function deleteProductoEtapa(productoId: number, productoEtapaId: number) {
  return withClient(async (client) => {
    await ensureProducto(client, productoId);
    let deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1 and id_producto_etapa = $2', [productoId, productoEtapaId]);
    if (!deleted.rowCount) {
      deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1 and id_etapa_credito = $2', [productoId, productoEtapaId]);
    }
    if (!deleted.rowCount) throw new SecurityError('Etapa del producto no encontrada', 404);
    return listProductoEtapas(productoId);
  });
}

async function ensureProducto(client: ClientLike, productoId: number) {
  const exists = await client.query('select 1 from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1 limit 1', [productoId]);
  if (!exists.rowCount) throw new SecurityError('Producto de credito no encontrado', 404);
}

export interface TblAtributoRow {
  id: number;
  nombre: string;
  descripcion: string;
  aplicaA: string;
  tipoFormula: string;
  valorDefault: number;
  valor2Default?: number;
  porcentajeDefault: number;
  minimoDefault: number;
  maximoDefault: number;
  proveedorDefault: string;
  prioridadDefault: number;
  aplicaIvaDefault: boolean;
  obligatorioDefault: boolean;
  activo: boolean;
}

export interface SaveTblAtributoInput {
  nombre: string;
  descripcion?: string | null;
  aplicaA?: string | null;
  tipoFormula?: string | null;
  valorDefault?: number | null;
  valor2Default?: number | null;
  porcentajeDefault?: number | null;
  minimoDefault?: number | null;
  maximoDefault?: number | null;
  proveedorDefault?: string | null;
  prioridadDefault?: number | null;
  aplicaIvaDefault?: boolean | null;
  obligatorioDefault?: boolean | null;
  activo?: boolean | null;
}

async function ensureTblAtributosTable(client: ClientLike) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "Creditos"."tbl_atributos" (
      id_atributo SERIAL PRIMARY KEY,
      nombre VARCHAR(180) NOT NULL UNIQUE,
      descripcion VARCHAR(250) NULL,
      aplica_a VARCHAR(50) DEFAULT 'CREDITO',
      tipo_formula VARCHAR(80) DEFAULT 'Manual',
      valor_default NUMERIC(18,2) DEFAULT 0,
      valor2_default NUMERIC(18,2) NULL,
      porcentaje_default NUMERIC(10,4) DEFAULT 0,
      minimo_default NUMERIC(18,2) DEFAULT 0,
      maximo_default NUMERIC(18,2) DEFAULT 0,
      proveedor_default VARCHAR(120) NULL,
      prioridad_default INTEGER DEFAULT 1,
      aplica_iva_default BOOLEAN DEFAULT FALSE,
      obligatorio_default BOOLEAN DEFAULT FALSE,
      activo BOOLEAN DEFAULT TRUE,
      fec_creacion TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    );
  `);
}

interface TblAtributoDbRow {
  id_atributo: number;
  nombre: string;
  descripcion: string | null;
  aplica_a: string | null;
  tipo_formula: string | null;
  valor_default: string | number | null;
  valor2_default: string | number | null;
  porcentaje_default: string | number | null;
  minimo_default: string | number | null;
  maximo_default: string | number | null;
  proveedor_default: string | null;
  prioridad_default: number | null;
  aplica_iva_default: boolean | null;
  obligatorio_default: boolean | null;
  activo: boolean | null;
}

function mapTblAtributo(row: TblAtributoDbRow): TblAtributoRow {
  return {
    id: row.id_atributo,
    nombre: row.nombre,
    descripcion: row.descripcion || '',
    aplicaA: row.aplica_a || 'CREDITO',
    tipoFormula: row.tipo_formula || 'Porcentaje',
    valorDefault: Number(row.valor_default || 0),
    valor2Default: row.valor2_default !== null && row.valor2_default !== undefined ? Number(row.valor2_default) : 0,
    porcentajeDefault: Number(row.porcentaje_default || 0),
    minimoDefault: Number(row.minimo_default || 0),
    maximoDefault: Number(row.maximo_default || 0),
    proveedorDefault: row.proveedor_default || '',
    prioridadDefault: row.prioridad_default || 1,
    aplicaIvaDefault: Boolean(row.aplica_iva_default),
    obligatorioDefault: Boolean(row.obligatorio_default),
    activo: row.activo !== false
  };
}

export async function listTblAtributos(): Promise<TblAtributoRow[]> {
  return withClient(async (client) => {
    await ensureTblAtributosTable(client);
    const result = await client.query<TblAtributoDbRow>(`
      select id_atributo, nombre, descripcion, aplica_a, tipo_formula,
             valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
             proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default,
             coalesce(activo, true) as activo
      from "Creditos"."tbl_atributos"
      order by prioridad_default asc, id_atributo asc
    `);
    return result.rows.map(mapTblAtributo);
  });
}

export async function createTblAtributo(input: SaveTblAtributoInput): Promise<TblAtributoRow> {
  return withClient(async (client) => {
    await ensureTblAtributosTable(client);
    const result = await client.query<TblAtributoDbRow>(`
      insert into "Creditos"."tbl_atributos" (
        nombre, descripcion, aplica_a, tipo_formula,
        valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
        proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default, activo
      ) values (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14
      )
      returning id_atributo, nombre, descripcion, aplica_a, tipo_formula,
                valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
                proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default,
                coalesce(activo, true) as activo
    `, [
      input.nombre.trim().toUpperCase(),
      input.descripcion?.trim() || null,
      input.aplicaA || 'CREDITO',
      input.tipoFormula || 'Porcentaje',
      nullableNumber(input.valorDefault) ?? 0,
      nullableNumber(input.valor2Default) ?? 0,
      nullableNumber(input.porcentajeDefault) ?? 0,
      nullableNumber(input.minimoDefault) ?? 0,
      nullableNumber(input.maximoDefault) ?? 0,
      input.proveedorDefault?.trim() || null,
      input.prioridadDefault ?? 1,
      Boolean(input.aplicaIvaDefault),
      Boolean(input.obligatorioDefault),
      input.activo !== false
    ]);

    return mapTblAtributo(result.rows[0]);
  });
}

export async function updateTblAtributo(id: number, input: SaveTblAtributoInput): Promise<TblAtributoRow> {
  return withClient(async (client) => {
    await ensureTblAtributosTable(client);
    let result = await client.query<TblAtributoDbRow>(`
      update "Creditos"."tbl_atributos"
      set nombre = $2,
          descripcion = $3,
          aplica_a = $4,
          tipo_formula = $5,
          valor_default = $6,
          valor2_default = $7,
          porcentaje_default = $8,
          minimo_default = $9,
          maximo_default = $10,
          proveedor_default = $11,
          prioridad_default = $12,
          aplica_iva_default = $13,
          obligatorio_default = $14,
          activo = coalesce($15, activo)
      where id_atributo = $1 or upper(nombre) = upper($2)
      returning id_atributo, nombre, descripcion, aplica_a, tipo_formula,
                valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
                proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default,
                coalesce(activo, true) as activo
    `, [
      id,
      input.nombre.trim().toUpperCase(),
      input.descripcion?.trim() || null,
      input.aplicaA || 'CREDITO',
      input.tipoFormula || 'Porcentaje',
      nullableNumber(input.valorDefault) ?? 0,
      nullableNumber(input.valor2Default) ?? 0,
      nullableNumber(input.porcentajeDefault) ?? 0,
      nullableNumber(input.minimoDefault) ?? 0,
      nullableNumber(input.maximoDefault) ?? 0,
      input.proveedorDefault?.trim() || null,
      input.prioridadDefault ?? 1,
      Boolean(input.aplicaIvaDefault),
      Boolean(input.obligatorioDefault),
      input.activo ?? null
    ]);

    if (!result.rowCount) {
      result = await client.query<TblAtributoDbRow>(`
        insert into "Creditos"."tbl_atributos" (
          nombre, descripcion, aplica_a, tipo_formula,
          valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
          proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default, activo
        ) values (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13, coalesce($14, true)
        )
        returning id_atributo, nombre, descripcion, aplica_a, tipo_formula,
                  valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
                  proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default,
                  coalesce(activo, true) as activo
      `, [
        input.nombre.trim().toUpperCase(),
        input.descripcion?.trim() || null,
        input.aplicaA || 'CREDITO',
        input.tipoFormula || 'Porcentaje',
        nullableNumber(input.valorDefault) ?? 0,
        nullableNumber(input.valor2Default) ?? 0,
        nullableNumber(input.porcentajeDefault) ?? 0,
        nullableNumber(input.minimoDefault) ?? 0,
        nullableNumber(input.maximoDefault) ?? 0,
        input.proveedorDefault?.trim() || null,
        input.prioridadDefault ?? 1,
        Boolean(input.aplicaIvaDefault),
        Boolean(input.obligatorioDefault),
        input.activo ?? null
      ]);
    }

    return mapTblAtributo(result.rows[0]);
  });
}

export async function updateTblAtributoEstado(id: number, activo: boolean): Promise<TblAtributoRow> {
  return withClient(async (client) => {
    await ensureTblAtributosTable(client);
    const result = await client.query<TblAtributoDbRow>(`
      update "Creditos"."tbl_atributos"
      set activo = $2
      where id_atributo = $1
      returning id_atributo, nombre, descripcion, aplica_a, tipo_formula,
                valor_default, valor2_default, porcentaje_default, minimo_default, maximo_default,
                proveedor_default, prioridad_default, aplica_iva_default, obligatorio_default,
                coalesce(activo, true) as activo
    `, [id, activo]);

    if (!result.rowCount) throw new SecurityError('Atributo maestro no encontrado', 404);
    return mapTblAtributo(result.rows[0]);
  });
}

export async function deleteTblAtributo(id: number): Promise<{ deleted: boolean }> {
  return withClient(async (client) => {
    await ensureTblAtributosTable(client);
    const result = await client.query('delete from "Creditos"."tbl_atributos" where id_atributo = $1', [id]);
    if (!result.rowCount) throw new SecurityError('Atributo maestro no encontrado', 404);
    return { deleted: true };
  });
}

