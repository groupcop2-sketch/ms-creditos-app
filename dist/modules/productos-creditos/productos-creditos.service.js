import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
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
      add column if not exists observacion_calendario text null
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
            client.query('select id_tipo_calculo as id, des_tipo_calculo as nombre from "Creditos"."TBL_TIPOS_CALCULO_CREDITO" order by des_tipo_calculo'),
            client.query('select id_documento_credito as id, des_documento as nombre from "Creditos"."TBL_DOCUMENTOS_CREDITO" order by des_documento'),
            client.query('select id_etapa_credito as id, des_etapa as nombre from "Creditos"."TBL_ETAPAS_CREDITO" order by id_etapa_credito'),
            client.query('select id_libranzera as id, v_razon_social as nombre from "Creditos"."TBL_LIBRANZERAS" order by v_razon_social')
        ]);
        return { tiposCredito: tiposCredito.rows, tiposAtributo: tiposAtributo.rows, tiposCalculo: tiposCalculo.rows, documentos: documentos.rows, etapas: etapas.rows, libranzeras: libranzeras.rows };
    });
}
export async function listProductosCredito() {
    return withClient(async (client) => {
        await ensureProductoCalendarioColumns(client);
        const result = await client.query(`${productoSelect} order by p.nombre`);
        return result.rows.map(mapProducto);
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
        return result.rows.map((row) => ({ id: row.id_producto_atributo, tipoAtributo: row.tipo_atributo, tipoCalculo: row.tipo_calculo, nombre: row.nombre, valor: row.valor ? Number(row.valor) : null, porcentaje: row.porcentaje ? Number(row.porcentaje) : null, minimo: row.minimo ? Number(row.minimo) : null, maximo: row.maximo ? Number(row.maximo) : null, aplicaIva: row.aplica_iva, obligatorio: row.obligatorio, proveedor: row.proveedor, prioridad: row.prioridad }));
    });
}
export async function createProductoAtributo(productoId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" (id_producto_credito, id_tipo_atributo, id_tipo_calculo, nombre, valor, porcentaje, minimo, maximo, aplica_iva, obligatorio, proveedor, prioridad)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [productoId, input.idTipoAtributo, input.idTipoCalculo, input.nombre.trim(), nullableNumber(input.valor), nullableNumber(input.porcentaje), nullableNumber(input.minimo), nullableNumber(input.maximo), Boolean(input.aplicaIva), Boolean(input.obligatorio), nullableText(input.proveedor), nullableNumber(input.prioridad) ?? 1]);
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
export async function createProductoDocumento(productoId, input) {
    return withClient(async (client) => {
        await ensureProducto(client, productoId);
        await client.query(`insert into "Creditos"."TBL_PRODUCTO_CREDITO_DOCUMENTOS" (id_producto_credito, id_documento_credito, obligatorio, grupo, prioridad, aplica_a, requiere_firma, requiere_validacion)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`, [productoId, input.idDocumentoCredito, input.obligatorio ?? true, nullableText(input.grupo), nullableNumber(input.prioridad) ?? 1, nullableText(input.aplicaA) ?? 'CLIENTE', Boolean(input.requiereFirma), Boolean(input.requiereValidacion)]);
        return listProductoDocumentos(productoId);
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
        const updated = await client.query(`update "Creditos"."TBL_PRODUCTO_CREDITO_ETAPAS"
       set id_etapa_credito = $3,
           orden = $4,
           obligatoria = $5,
           permite_devolucion = $6,
           responsable = $7,
           sla_horas = $8
       where id_producto_credito = $1 and id_producto_etapa = $2`, [productoId, productoEtapaId, input.idEtapaCredito, input.orden, input.obligatoria ?? true, input.permiteDevolucion ?? true, nullableText(input.responsable), nullableNumber(input.slaHoras)]);
        if (!updated.rowCount)
            throw new SecurityError('Etapa del producto no encontrada', 404);
        return listProductoEtapas(productoId);
    });
}
async function ensureProducto(client, productoId) {
    const exists = await client.query('select 1 from "Creditos"."TBL_PRODUCTOS_CREDITO" where id_producto_credito = $1 limit 1', [productoId]);
    if (!exists.rowCount)
        throw new SecurityError('Producto de credito no encontrado', 404);
}
