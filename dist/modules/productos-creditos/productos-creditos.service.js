import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
function normalizeKey(value) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
function nullableText(value) {
    const normalized = value?.trim();
    return normalized || null;
}
function nullableNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
async function ensureFormulaColumns(client) {
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
      add column if not exists activo boolean null
  `);
    await client.query(`
    alter table "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
      add column if not exists valor2 numeric(18,6) null
  `);
}
function formulaCodeFromName(nombre) {
    return normalizeKey(nombre).replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}
function inferFormulaConfig(input) {
    const key = normalizeKey(`${input.codigo ?? ''} ${input.nombre}`);
    let baseCalculo = input.baseCalculo;
    let operacion = input.operacion;
    if (!baseCalculo)
        baseCalculo = key.includes('DESEMBOLSO') ? 'VALOR_DESEMBOLSO' : key.includes('SALDO') ? 'SALDO' : key.includes('SMLMV') ? 'SMLMV' : key.includes('CUOTA') ? 'CUOTA' : 'VALOR_CREDITO';
    if (!operacion)
        operacion = key.includes('VALOR2') ? 'BASE_POR_VALOR_DIV_VALOR2' : key.includes('PLAZO') && key.includes('VALOR') ? 'VALOR_POR_PLAZO' : key.includes('%') ? 'PORCENTAJE' : 'VALOR_FIJO';
    return {
        codigo: input.codigo ?? formulaCodeFromName(input.nombre),
        baseCalculo,
        operacion,
        requiereValor: input.requiereValor ?? ['VALOR_FIJO', 'VALOR_POR_PLAZO', 'BASE_POR_VALOR_DIV_VALOR2'].includes(operacion),
        requiereValor2: input.requiereValor2 ?? operacion === 'BASE_POR_VALOR_DIV_VALOR2',
        requierePorcentaje: input.requierePorcentaje ?? operacion === 'PORCENTAJE',
        aplicaMinimo: input.aplicaMinimo ?? true,
        aplicaMaximo: input.aplicaMaximo ?? true,
        activo: input.activo ?? true
    };
}
function mapFormulaCatalog(row) {
    const cfg = inferFormulaConfig({ nombre: row.nombre, codigo: row.codigo, baseCalculo: row.base_calculo, operacion: row.operacion, requiereValor: row.requiere_valor, requiereValor2: row.requiere_valor2, requierePorcentaje: row.requiere_porcentaje, aplicaMinimo: row.aplica_minimo, aplicaMaximo: row.aplica_maximo, activo: row.activo });
    return { id: row.id, nombre: row.nombre, ...cfg };
}
export async function createTipoCalculoCredito(input) {
    return withClient(async (client) => {
        await ensureFormulaColumns(client);
        const cfg = inferFormulaConfig(input);
        const result = await client.query(`insert into "Creditos"."TBL_TIPOS_CALCULO_CREDITO" (des_tipo_calculo, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       returning id_tipo_calculo as id, des_tipo_calculo as nombre, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo`, [input.nombre.trim(), cfg.codigo, cfg.baseCalculo, cfg.operacion, cfg.requiereValor, cfg.requiereValor2, cfg.requierePorcentaje, cfg.aplicaMinimo, cfg.aplicaMaximo]);
        return mapFormulaCatalog(result.rows[0]);
    });
}
async function ensureParametrosFinancierosTable(client) {
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
function mapParametro(row) {
    return { id: row.id_parametro_financiero, codigo: row.codigo, nombre: row.nombre, valor: Number(row.valor), unidad: row.unidad, vigenciaDesde: row.vigencia_desde, vigenciaHasta: row.vigencia_hasta, activo: row.activo };
}
export async function listParametrosFinancieros() {
    return withClient(async (client) => {
        await ensureParametrosFinancierosTable(client);
        const result = await client.query('select * from "Creditos"."TBL_PARAMETROS_FINANCIEROS" order by codigo, vigencia_desde desc');
        return result.rows.map(mapParametro);
    });
}
export async function createParametroFinanciero(input) {
    return withClient(async (client) => {
        await ensureParametrosFinancierosTable(client);
        const result = await client.query('insert into "Creditos"."TBL_PARAMETROS_FINANCIEROS" (codigo, nombre, valor, unidad, vigencia_desde, vigencia_hasta) values ($1,$2,$3,$4,$5,$6) returning *', [input.codigo.trim().toUpperCase(), input.nombre.trim(), input.valor, input.unidad, input.vigenciaDesde, input.vigenciaHasta ?? null]);
        return mapParametro(result.rows[0]);
    });
}
async function ensureProductoConveniosTable(client) {
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
function mapProductoConvenio(row) {
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
async function getActiveStateId(client) {
    const result = await client.query('select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1', ['activo']);
    return result.rows[0]?.id_estado ?? null;
}
async function ensureProductoCalendarioColumns(client) {
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
function mapProducto(row) {
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
        const [tiposCredito, tiposAtributo, tiposCalculo, documentos, etapas, libranzeras] = await Promise.all([
            client.query('select id_tipo_credito as id, des_tipo_credito as nombre from "Creditos"."TBL_TIPOS_CREDITO" order by des_tipo_credito'),
            client.query('select id_tipo_atributo as id, des_tipo_atributo as nombre from "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" order by des_tipo_atributo'),
            client.query('select id_tipo_calculo as id, des_tipo_calculo as nombre, codigo, base_calculo, operacion, requiere_valor, requiere_valor2, requiere_porcentaje, aplica_minimo, aplica_maximo, activo from "Creditos"."TBL_TIPOS_CALCULO_CREDITO" where coalesce(activo, true) = true order by des_tipo_calculo'),
            client.query('select id_documento_credito as id, des_documento as nombre from "Creditos"."TBL_DOCUMENTOS_CREDITO" order by des_documento'),
            client.query('select id_etapa_credito as id, des_etapa as nombre from "Creditos"."TBL_ETAPAS_CREDITO" order by id_etapa_credito'),
            client.query('select id_libranzera as id, v_razon_social as nombre from "Creditos"."TBL_LIBRANZERAS" order by v_razon_social')
        ]);
        return { tiposCredito: tiposCredito.rows, tiposAtributo: tiposAtributo.rows, tiposCalculo: tiposCalculo.rows.map(mapFormulaCatalog), documentos: documentos.rows, etapas: etapas.rows, libranzeras: libranzeras.rows };
    });
}
export async function listProductosCredito() {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        const result = await client.query(`${productoSelect} order by p.nombre`);
        return result.rows.map(mapProducto);
    });
}
export async function updateProductoCredito(productoId, input) {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        await ensureProducto(client, productoId);
        const stateId = input.idEstado ?? await getActiveStateId(client);
        await client.query(`update "Creditos"."TBL_PRODUCTOS_CREDITO"
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
       where id_producto_credito = $1`, [
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
        ]);
        const result = await client.query(`${productoSelect} where p.id_producto_credito = $1`, [productoId]);
        return mapProducto(result.rows[0]);
    });
}
export async function deleteProductoCredito(productoId) {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        await ensureProducto(client, productoId);
        const linked = await client.query('select 1 from "Creditos"."TBL_CREDITOS" where id_producto_credito = $1 limit 1', [productoId]);
        if (linked.rowCount)
            throw new SecurityError('No se puede eliminar un producto con creditos asociados. Inactivalo o crea una nueva version.', 409);
        await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1', [productoId]);
        await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1', [productoId]);
        await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1', [productoId]);
        await client.query('delete from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1', [productoId]);
        return { deleted: true };
    });
}
export async function updateProductoCreditoEstado(productoId, activo) {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        await ensureProducto(client, productoId);
        await client.query('update "Creditos"."TBL_PRODUCTOS_CREDITO" set activo = $2, vigencia_hasta = case when $2 = false then current_date else null end where id_producto_credito = $1', [productoId, activo]);
        const result = await client.query(`${productoSelect} where p.id_producto_credito = $1`, [productoId]);
        return mapProducto(result.rows[0]);
    });
}
export async function createProductoCreditoVersion(productoId) {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        await ensureFormulaColumns(client);
        await ensureProducto(client, productoId);
        const base = await client.query('select id_producto_base from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1', [productoId]);
        const baseId = base.rows[0]?.id_producto_base ?? productoId;
        const nextVersion = await client.query('select coalesce(max(version), 0) + 1 as version from "Creditos"."TBL_PRODUCTOS_CREDITO" where coalesce(id_producto_base, id_producto_credito) = $1', [baseId]);
        const version = nextVersion.rows[0]?.version ?? 2;
        const consecutivo = await generateProductoConsecutivo(client);
        const created = await client.query(`
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
        await client.query('insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad) select $2, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1', [productoId, newId]);
        await client.query('insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion) select $2, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1', [productoId, newId]);
        await client.query('insert into "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" (id_producto_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas) select $2, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1', [productoId, newId]);
        await client.query('update "Creditos"."TBL_PRODUCTOS_CREDITO" set activo = false, vigencia_hasta = current_date where id_producto_credito = $1', [productoId]);
        const result = await client.query(`${productoSelect} where p.id_producto_credito = $1`, [newId]);
        return mapProducto(result.rows[0]);
    });
}
export async function createProductoCredito(input) {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        const stateId = input.idEstado ?? await getActiveStateId(client);
        const consecutivo = await generateProductoConsecutivo(client);
        const created = await client.query(`insert into "Creditos"."TBL_PRODUCTOS_CREDITO" (
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
      ) returning id_producto_credito`, [
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
        ]);
        const result = await client.query(`${productoSelect} where p.id_producto_credito = $1`, [created.rows[0].id_producto_credito]);
        return mapProducto(result.rows[0]);
    });
}
async function generateProductoConsecutivo(client) {
    const result = await client.query(`select coalesce(max(substring(consecutivo from '[0-9]+$')::int), 0) + 1 as next_value
     from "Creditos"."TBL_PRODUCTOS_CREDITO"
     where consecutivo ~ '^PC-[0-9]+$'`);
    return `PC-${String(result.rows[0]?.next_value ?? 1).padStart(6, '0')}`;
}
export async function listProductoAtributos(productoId) {
    return withClient(async (client) => {
        const result = await client.query(`select a.*, ta.des_tipo_atributo as tipo_atributo, tc.des_tipo_calculo as tipo_calculo
       from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a
       inner join "Creditos"."TBL_TIPOS_ATRIBUTO_CREDITO" ta on ta.id_tipo_atributo = a.id_tipo_atributo
       inner join "Creditos"."TBL_TIPOS_CALCULO_CREDITO" tc on tc.id_tipo_calculo = a.id_tipo_calculo
       where a.id_producto_credito = $1 order by a.prioridad, a.nombre`, [productoId]);
        return result.rows.map((row) => ({ id: row.id_producto_atributo, tipoAtributo: row.tipo_atributo, tipoCalculo: row.tipo_calculo, nombre: row.nombre, valor: row.valor ? Number(row.valor) : null, porcentaje: row.porcentaje ? Number(row.porcentaje) : null, valor2: row.valor2 ? Number(row.valor2) : null, minimo: row.minimo ? Number(row.minimo) : null, maximo: row.maximo ? Number(row.maximo) : null, aplicaIva: row.aplica_iva, obligatorio: row.obligatorio, proveedor: row.proveedor, prioridad: row.prioridad }));
    });
}
export async function updateProductoAtributo(productoId, productoAtributoId, input) {
    return withClient(async (client) => {
        await ensureFormulaColumns(client);
        await ensureProducto(client, productoId);
        let updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
       set id_tipo_atributo = $3, id_tipo_calculo = $4, nombre = $5, valor = $6, porcentaje = $7, valor2 = $8, minimo = $9, maximo = $10, aplica_iva = $11, obligatorio = $12, proveedor = $13, prioridad = $14
       where id_producto_credito = $1 and id_producto_atributo = $2`, [productoId, productoAtributoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1]);
        if (!updated.rowCount) {
            updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
         set id_tipo_atributo = $3, id_tipo_calculo = $4, nombre = $5, valor = $6, porcentaje = $7, valor2 = $8, minimo = $9, maximo = $10, aplica_iva = $11, obligatorio = $12, proveedor = $13, prioridad = $14
         where id_producto_credito = $1 and id_tipo_atributo = $2`, [productoId, productoAtributoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1]);
        }
        if (!updated.rowCount) {
            await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [productoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1]);
        }
        return listProductoAtributos(productoId);
    });
}
export async function deleteProductoAtributo(productoId, productoAtributoId) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        let deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1 and id_producto_atributo = $2', [productoId, productoAtributoId]);
        if (!deleted.rowCount) {
            deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" where id_producto_credito = $1 and id_tipo_atributo = $2', [productoId, productoAtributoId]);
        }
        if (!deleted.rowCount)
            throw new SecurityError('Atributo del producto no encontrado', 404);
        return listProductoAtributos(productoId);
    });
}
export async function createProductoAtributo(productoId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, valor2, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [productoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.valor2), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1]);
        return listProductoAtributos(productoId);
    });
}
export async function listProductoDocumentos(productoId) {
    return withClient(async (client) => {
        const result = await client.query(`select pd.*, d.des_documento as documento
       from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" pd
       inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = pd.id_documento_credito
       where pd.id_producto_credito = $1 order by pd.prioridad, d.des_documento`, [productoId]);
        return result.rows.map((row) => ({ id: row.id_producto_documento, documento: row.documento, obligatorio: row.obligatorio, grupo: row.grupo, prioridad: row.prioridad, aplicaA: row.aplica_a, requiereFirma: row.requiere_firma, requiereValidacion: row.requiere_validacion }));
    });
}
export async function updateProductoDocumento(productoId, productoDocumentoId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        let updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS"
       set id_documento_credito = $3,
           obligatorio = $4,
           grupo = $5,
           prioridad = $6,
           aplica_a = $7,
           requiere_firma = $8,
           requiere_validacion = $9
       where id_producto_credito = $1 and id_producto_documento = $2`, [productoId, productoDocumentoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]);
        if (!updated.rowCount) {
            updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS"
         set id_documento_credito = $3,
             obligatorio = $4,
             grupo = $5,
             prioridad = $6,
             aplica_a = $7,
             requiere_firma = $8,
             requiere_validacion = $9
         where id_producto_credito = $1 and id_documento_credito = $2`, [productoId, productoDocumentoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]);
        }
        if (!updated.rowCount) {
            await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`, [productoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]);
        }
        return listProductoDocumentos(productoId);
    });
}
export async function deleteProductoDocumento(productoId, productoDocumentoId) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        let deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1 and id_producto_documento = $2', [productoId, productoDocumentoId]);
        if (!deleted.rowCount) {
            deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" where id_producto_credito = $1 and id_documento_credito = $2', [productoId, productoDocumentoId]);
        }
        if (!deleted.rowCount)
            throw new SecurityError('Documento del producto no encontrado', 404);
        return listProductoDocumentos(productoId);
    });
}
export async function createProductoDocumento(productoId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`, [productoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]);
        return listProductoDocumentos(productoId);
    });
}
export async function listProductoConvenios(productoId) {
    return withClient(async (client) => {
        await ensureProductoConveniosTable(client);
        await ensureProducto(client, productoId);
        const result = await client.query(`select c.*, e.v_razon_social as empresa, e.v_nit as nit
       from "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" c
       inner join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where c.id_producto_credito = $1
       order by e.v_razon_social`, [productoId]);
        return result.rows.map(mapProductoConvenio);
    });
}
export async function saveProductoConvenio(productoId, input) {
    return withClient(async (client) => {
        await ensureProductoConveniosTable(client);
        await ensureProducto(client, productoId);
        const empresa = await client.query('select 1 from "Creditos"."TBL_EMPRESAS" where id_empresa = $1 limit 1', [input.idEmpresa]);
        if (!empresa.rowCount)
            throw new SecurityError('Empresa del convenio no encontrada', 404);
        await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" (
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
        observacion = excluded.observacion`, [productoId, input.idEmpresa, nullableNumber(input.cupoTotal), nullableNumber(input.cupoUsado) ?? 0, nullableNumber(input.porcentajeEndeudamientoMaximo), input.requiereValidacionPagaduria ?? true, input.vigenciaDesde ?? null, input.vigenciaHasta ?? null, input.activo ?? true, nullableText(input.observacion)]);
        return listProductoConvenios(productoId);
    });
}
export async function deleteProductoConvenio(productoId, convenioId) {
    return withClient(async (client) => {
        await ensureProductoConveniosTable(client);
        await ensureProducto(client, productoId);
        const deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_CONVENIOS" where id_producto_credito = $1 and id_producto_convenio = $2', [productoId, convenioId]);
        if (!deleted.rowCount)
            throw new SecurityError('Convenio del producto no encontrado', 404);
        return listProductoConvenios(productoId);
    });
}
export async function listProductoEtapas(productoId) {
    return withClient(async (client) => {
        const result = await client.query(`select pe.*, e.des_etapa as etapa
       from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" pe
       inner join "Creditos"."TBL_ETAPAS_CREDITO" e on e.id_etapa_credito = pe.id_etapa_credito
       where pe.id_producto_credito = $1 order by pe.orden`, [productoId]);
        return result.rows.map((row) => ({ id: row.id_producto_etapa, idEtapaCredito: row.id_etapa_credito, etapa: row.etapa, orden: row.orden, obligatoria: row.obligatoria, permiteDevolucion: row.permite_devolucion, responsable: row.responsable, slaHoras: row.sla_horas }));
    });
}
export async function createProductoEtapa(productoId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" (id_producto_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas)
       values ($1,$2,$3,$4,$5,$6,$7)`, [productoId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]);
        return listProductoEtapas(productoId);
    });
}
export async function updateProductoEtapa(productoId, productoEtapaId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        let updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS"
       set id_etapa_credito = $3,
           orden = $4,
           obligatoria = $5,
           permite_devolucion = $6,
           responsable = $7,
           sla_horas = $8
       where id_producto_credito = $1 and id_producto_etapa = $2`, [productoId, productoEtapaId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]);
        if (!updated.rowCount) {
            updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS"
         set id_etapa_credito = $3,
             orden = $4,
             obligatoria = $5,
             permite_devolucion = $6,
             responsable = $7,
             sla_horas = $8
         where id_producto_credito = $1 and id_etapa_credito = $2`, [productoId, productoEtapaId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]);
        }
        if (!updated.rowCount) {
            await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" (id_producto_credito, id_etapa_credito, orden, obligatoria, permite_devolucion, responsable, sla_horas)
         values ($1,$2,$3,$4,$5,$6,$7)`, [productoId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]);
        }
        return listProductoEtapas(productoId);
    });
}
export async function deleteProductoEtapa(productoId, productoEtapaId) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        let deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1 and id_producto_etapa = $2', [productoId, productoEtapaId]);
        if (!deleted.rowCount) {
            deleted = await client.query('delete from "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS" where id_producto_credito = $1 and id_etapa_credito = $2', [productoId, productoEtapaId]);
        }
        if (!deleted.rowCount)
            throw new SecurityError('Etapa del producto no encontrada', 404);
        return listProductoEtapas(productoId);
    });
}
async function ensureProducto(client, productoId) {
    const exists = await client.query('select 1 from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1 limit 1', [productoId]);
    if (!exists.rowCount)
        throw new SecurityError('Producto de credito no encontrado', 404);
}
