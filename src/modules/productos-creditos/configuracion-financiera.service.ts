import type { ClientLike } from '../../lib/db.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

async function withClient<T>(runner: (client: ClientLike) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

// ==========================================
// 1. BANCOS / ENTIDADES BANCARIAS
// ==========================================
export interface BancoRow {
  id: number;
  nombre: string;
  codigo: string | null;
  fecCreacion: string;
  fecActualizacion: string | null;
}

export interface CreateBancoInput {
  nombre: string;
  codigo?: string | null;
}

export async function listBancos(search?: string): Promise<BancoRow[]> {
  return withClient(async (client) => {
    let query = `
      SELECT id_banco as id, des_banco as nombre, codigo, fec_creacion, fec_actualizacion
      FROM "Creditos"."TBL_BANCOS"
    `;
    const params: unknown[] = [];
    if (search && search.trim()) {
      params.push(`%${search.trim().toUpperCase()}%`);
      query += ` WHERE UPPER(des_banco) LIKE $1 OR codigo LIKE $1`;
    }
    query += ` ORDER BY des_banco ASC`;

    const res = await client.query<{
      id: number;
      nombre: string;
      codigo: string | null;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(query, params);

    return res.rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      codigo: r.codigo,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    }));
  });
}

export async function createBanco(input: CreateBancoInput): Promise<BancoRow> {
  return withClient(async (client) => {
    const trimmed = input.nombre.trim();
    if (!trimmed) throw new SecurityError('El nombre del banco es obligatorio', 400);

    const res = await client.query<{
      id_banco: number;
      des_banco: string;
      codigo: string | null;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `INSERT INTO "Creditos"."TBL_BANCOS" (des_banco, codigo, fec_creacion)
       VALUES ($1, $2, NOW())
       RETURNING id_banco, des_banco, codigo, fec_creacion, fec_actualizacion`,
      [trimmed, input.codigo?.trim() || null]
    );

    const r = res.rows[0];
    return {
      id: r.id_banco,
      nombre: r.des_banco,
      codigo: r.codigo,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function updateBanco(id: number, input: CreateBancoInput): Promise<BancoRow> {
  return withClient(async (client) => {
    const trimmed = input.nombre.trim();
    if (!trimmed) throw new SecurityError('El nombre del banco es obligatorio', 400);

    const res = await client.query<{
      id_banco: number;
      des_banco: string;
      codigo: string | null;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `UPDATE "Creditos"."TBL_BANCOS"
       SET des_banco = $1, codigo = $2, fec_actualizacion = NOW()
       WHERE id_banco = $3
       RETURNING id_banco, des_banco, codigo, fec_creacion, fec_actualizacion`,
      [trimmed, input.codigo?.trim() || null, id]
    );

    if (!res.rowCount) throw new SecurityError('Banco no encontrado', 404);
    const r = res.rows[0];
    return {
      id: r.id_banco,
      nombre: r.des_banco,
      codigo: r.codigo,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function deleteBanco(id: number): Promise<boolean> {
  return withClient(async (client) => {
    const res = await client.query(`DELETE FROM "Creditos"."TBL_BANCOS" WHERE id_banco = $1`, [id]);
    if (!res.rowCount) throw new SecurityError('Banco no encontrado', 404);
    return true;
  });
}

// ==========================================
// 2. TASAS DE REFERENCIA (USURA / DTF / MORA)
// ==========================================
export interface TasaReferenciaRow {
  id: number;
  tipoTasa: string;
  mes: string;
  ano: number;
  base: number;
  tasaEa: number;
  tasaDiaria: number;
  tasaSemanal: number;
  tasaMensual: number;
  tasaQuincenal: number;
  tasaBimestral: number;
  tasaTrimestral: number;
  tasaCuatrimestral: number;
  resolucion: string | null;
  modalidad: string | null;
  fuente: string | null;
  fecVigenciaDesde: string | null;
  fecVigenciaHasta: string | null;
}

export interface CreateTasaInput {
  tipoTasa?: string; // 'USURA' | 'DTF' | 'MORA'
  mes: string;
  ano: number;
  base?: number; // 365 | 360
  tasaEa: number;
  resolucion?: string | null;
  modalidad?: string | null;
  fuente?: string | null;
  fecVigenciaDesde?: string | null;
  fecVigenciaHasta?: string | null;
}

export function calculatePeriodRates(eaPercentage: number, base: number = 365) {
  const r = eaPercentage / 100;
  const diaria = Math.pow(1 + r, 1 / base) - 1;
  const semanal = Math.pow(1 + r, 7 / 365) - 1;
  const quincenal = Math.pow(1 + r, 1 / 24) - 1;
  const mensual = Math.pow(1 + r, 1 / 12) - 1;
  const bimestral = Math.pow(1 + r, 1 / 6) - 1;
  const trimestral = Math.pow(1 + r, 1 / 4) - 1;
  const cuatrimestral = Math.pow(1 + r, 1 / 3) - 1;

  return {
    diaria: Number((diaria * 100).toFixed(5)),
    semanal: Number((semanal * 100).toFixed(5)),
    quincenal: Number((quincenal * 100).toFixed(5)),
    mensual: Number((mensual * 100).toFixed(5)),
    bimestral: Number((bimestral * 100).toFixed(5)),
    trimestral: Number((trimestral * 100).toFixed(5)),
    cuatrimestral: Number((cuatrimestral * 100).toFixed(5))
  };
}

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

export async function listTasas(tipoTasa: string = 'USURA', ano?: number): Promise<TasaReferenciaRow[]> {
  return withClient(async (client) => {
    let query = `
      SELECT id_tasa, tipo_tasa, mes, ano, base,
             tasa_ea, tasa_diaria, tasa_semanal, tasa_mensual, tasa_quincenal,
             tasa_bimestral, tasa_trimestral, tasa_cuatrimestral,
             resolucion, modalidad, fuente, fec_vigencia_desde, fec_vigencia_hasta
      FROM "Creditos"."TBL_TASAS_REFERENCIA"
      WHERE tipo_tasa = $1
    `;
    const params: unknown[] = [tipoTasa.toUpperCase()];

    if (ano) {
      params.push(ano);
      query += ` AND ano = $2`;
    }

    query += ` ORDER BY ano DESC, 
      CASE UPPER(mes)
        WHEN 'DICIEMBRE' THEN 12
        WHEN 'NOVIEMBRE' THEN 11
        WHEN 'OCTUBRE' THEN 10
        WHEN 'SEPTIEMBRE' THEN 9
        WHEN 'AGOSTO' THEN 8
        WHEN 'JULIO' THEN 7
        WHEN 'JUNIO' THEN 6
        WHEN 'MAYO' THEN 5
        WHEN 'ABRIL' THEN 4
        WHEN 'MARZO' THEN 3
        WHEN 'FEBRERO' THEN 2
        WHEN 'ENERO' THEN 1
        ELSE 0
      END DESC, base DESC`;

    const res = await client.query<{
      id_tasa: number;
      tipo_tasa: string;
      mes: string;
      ano: number;
      base: number;
      tasa_ea: string;
      tasa_diaria: string;
      tasa_semanal: string;
      tasa_mensual: string;
      tasa_quincenal: string;
      tasa_bimestral: string;
      tasa_trimestral: string;
      tasa_cuatrimestral: string;
      resolucion: string | null;
      modalidad: string | null;
      fuente: string | null;
      fec_vigencia_desde: string | null;
      fec_vigencia_hasta: string | null;
    }>(query, params);

    return res.rows.map((r) => ({
      id: r.id_tasa,
      tipoTasa: r.tipo_tasa,
      mes: r.mes,
      ano: r.ano,
      base: r.base,
      tasaEa: Number(r.tasa_ea),
      tasaDiaria: Number(r.tasa_diaria),
      tasaSemanal: Number(r.tasa_semanal),
      tasaMensual: Number(r.tasa_mensual),
      tasaQuincenal: Number(r.tasa_quincenal),
      tasaBimestral: Number(r.tasa_bimestral),
      tasaTrimestral: Number(r.tasa_trimestral),
      tasaCuatrimestral: Number(r.tasa_cuatrimestral),
      resolucion: r.resolucion,
      modalidad: r.modalidad,
      fuente: r.fuente,
      fecVigenciaDesde: r.fec_vigencia_desde,
      fecVigenciaHasta: r.fec_vigencia_hasta
    }));
  });
}

export async function createOrUpdateTasa(input: CreateTasaInput): Promise<TasaReferenciaRow> {
  return withClient(async (client) => {
    const tipo = (input.tipoTasa || 'USURA').toUpperCase();
    const mes = input.mes.trim().toUpperCase();
    const ano = Number(input.ano);
    const base = Number(input.base) === 360 ? 360 : 365;
    const ea = Number(input.tasaEa);

    if (isNaN(ea) || ea <= 0) throw new SecurityError('La tasa E.A. debe ser un número positivo', 400);

    const periods = calculatePeriodRates(ea, base);

    const res = await client.query<{
      id_tasa: number;
      tipo_tasa: string;
      mes: string;
      ano: number;
      base: number;
      tasa_ea: string;
      tasa_diaria: string;
      tasa_semanal: string;
      tasa_mensual: string;
      tasa_quincenal: string;
      tasa_bimestral: string;
      tasa_trimestral: string;
      tasa_cuatrimestral: string;
      resolucion: string | null;
      modalidad: string | null;
      fuente: string | null;
      fec_vigencia_desde: string | null;
      fec_vigencia_hasta: string | null;
    }>(
      `INSERT INTO "Creditos"."TBL_TASAS_REFERENCIA"
       (tipo_tasa, mes, ano, base, tasa_ea, tasa_diaria, tasa_semanal, tasa_mensual, tasa_quincenal, tasa_bimestral, tasa_trimestral, tasa_cuatrimestral, resolucion, modalidad, fuente, fec_vigencia_desde, fec_vigencia_hasta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (tipo_tasa, mes, ano, base) DO UPDATE SET
         tasa_ea = EXCLUDED.tasa_ea,
         tasa_diaria = EXCLUDED.tasa_diaria,
         tasa_semanal = EXCLUDED.tasa_semanal,
         tasa_mensual = EXCLUDED.tasa_mensual,
         tasa_quincenal = EXCLUDED.tasa_quincenal,
         tasa_bimestral = EXCLUDED.tasa_bimestral,
         tasa_trimestral = EXCLUDED.tasa_trimestral,
         tasa_cuatrimestral = EXCLUDED.tasa_cuatrimestral,
         resolucion = COALESCE(EXCLUDED.resolucion, "Creditos"."TBL_TASAS_REFERENCIA".resolucion),
         modalidad = COALESCE(EXCLUDED.modalidad, "Creditos"."TBL_TASAS_REFERENCIA".modalidad),
         fuente = COALESCE(EXCLUDED.fuente, "Creditos"."TBL_TASAS_REFERENCIA".fuente),
         fec_vigencia_desde = COALESCE(EXCLUDED.fec_vigencia_desde, "Creditos"."TBL_TASAS_REFERENCIA".fec_vigencia_desde),
         fec_vigencia_hasta = COALESCE(EXCLUDED.fec_vigencia_hasta, "Creditos"."TBL_TASAS_REFERENCIA".fec_vigencia_hasta),
         fec_actualizacion = NOW()
       RETURNING *`,
      [
        tipo, mes, ano, base, ea,
        periods.diaria, periods.semanal, periods.mensual, periods.quincenal,
        periods.bimestral, periods.trimestral, periods.cuatrimestral,
        input.resolucion || null, input.modalidad || 'CONSUMO Y ORDINARIO',
        input.fuente || 'MANUAL', input.fecVigenciaDesde || null, input.fecVigenciaHasta || null
      ]
    );

    const r = res.rows[0];
    return {
      id: r.id_tasa,
      tipoTasa: r.tipo_tasa,
      mes: r.mes,
      ano: r.ano,
      base: r.base,
      tasaEa: Number(r.tasa_ea),
      tasaDiaria: Number(r.tasa_diaria),
      tasaSemanal: Number(r.tasa_semanal),
      tasaMensual: Number(r.tasa_mensual),
      tasaQuincenal: Number(r.tasa_quincenal),
      tasaBimestral: Number(r.tasa_bimestral),
      tasaTrimestral: Number(r.tasa_trimestral),
      tasaCuatrimestral: Number(r.tasa_cuatrimestral),
      resolucion: r.resolucion,
      modalidad: r.modalidad,
      fuente: r.fuente,
      fecVigenciaDesde: r.fec_vigencia_desde,
      fecVigenciaHasta: r.fec_vigencia_hasta
    };
  });
}

export async function deleteTasa(id: number): Promise<boolean> {
  return withClient(async (client) => {
    const res = await client.query(`DELETE FROM "Creditos"."TBL_TASAS_REFERENCIA" WHERE id_tasa = $1`, [id]);
    if (!res.rowCount) throw new SecurityError('Tasa no encontrada', 404);
    return true;
  });
}

// ------------------------------------------
// VALIDACIÓN Y SINCRONIZACIÓN CON DATOS.GOV.CO
// ------------------------------------------
export async function validarEndpointDatosGovCo(urlOrInput?: string) {
  let targetUrl = (urlOrInput || '').trim();

  // If input is just an ID like "pare-7x5i", expand it
  if (!targetUrl || targetUrl.length === 9 && targetUrl.includes('-')) {
    const id = targetUrl || 'pare-7x5i';
    targetUrl = `https://www.datos.gov.co/resource/${id}.json?$order=vigencia_desde%20DESC&$limit=5`;
  } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://www.datos.gov.co/resource/${targetUrl}`;
  }

  // Replace placeholder if user passed verbatim string
  targetUrl = targetUrl.replace(/\[id_del_dataset\]/g, 'pare-7x5i');
  if (!targetUrl.includes('.json')) {
    targetUrl += '.json';
  }

  try {
    const resp = await fetch(targetUrl, { headers: { 'User-Agent': 'CreditosApp/1.0' } });
    if (!resp.ok) {
      return {
        valido: false,
        url: targetUrl,
        statusCode: resp.status,
        mensaje: `Error al consultar endpoint (${resp.status}: ${resp.statusText})`,
        muestra: []
      };
    }

    const data = await resp.json();
    if (!Array.isArray(data)) {
      return {
        valido: false,
        url: targetUrl,
        statusCode: resp.status,
        mensaje: 'La respuesta no contiene una lista de registros JSON válida.',
        muestra: data
      };
    }

    return {
      valido: true,
      url: targetUrl,
      totalRegistrosRetornados: data.length,
      columnasDetectadas: data.length > 0 ? Object.keys(data[0]) : [],
      muestra: data.slice(0, 3),
      mensaje: `Endpoint validado con éxito. Se obtuvieron ${data.length} registros.`
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valido: false,
      url: targetUrl,
      mensaje: `Fallo de conexión: ${msg}`,
      muestra: []
    };
  }
}

export async function sincronizarTasasDesdeDatosGovCo(urlOrDataset?: string) {
  // Por defecto consultamos el dataset oficial certificado de la Superfinanciera en datos.gov.co
  // pare-7x5i: Tasa de Interés Bancario Corriente (TIBC)
  let endpoint = (urlOrDataset || '').trim();
  if (!endpoint || endpoint === 'pare-7x5i') {
    endpoint = `https://www.datos.gov.co/resource/pare-7x5i.json?modalidad=CONSUMO%20Y%20ORDINARIO&$order=vigencia_desde%20DESC&$limit=20`;
  } else if (!endpoint.startsWith('http')) {
    endpoint = `https://www.datos.gov.co/resource/${endpoint}.json?$order=vigencia_desde%20DESC&$limit=20`;
  }

  const resp = await fetch(endpoint);
  if (!resp.ok) {
    throw new SecurityError(`No se pudo conectar a datos.gov.co: ${resp.statusText}`, 502);
  }

  const rows = await resp.json() as Array<Record<string, string>>;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new SecurityError('El dataset no retornó registros para sincronizar', 400);
  }

  let sincronizados = 0;
  for (const item of rows) {
    // Detect column containing the rate (interes_bancario_corriente, tasa, etc.)
    const rateStr = item.interes_bancario_corriente || item.tasa || item.valor || '';
    const numericRate = parseFloat(rateStr.replace('%', '').replace(',', '.').trim());
    if (isNaN(numericRate) || numericRate <= 0) continue;

    // Detect date
    const dateStr = item.vigencia_desde || item.fecha_vigencia || item.fechacorte || item.fecha_resolucion;
    const dateObj = dateStr ? new Date(dateStr) : new Date();
    const ano = dateObj.getFullYear();
    const mesIndex = dateObj.getMonth();
    const mes = MONTH_NAMES[mesIndex];

    // For TIBC consumption & ordinary, Usury = 1.5 * IBC
    const isIbc = !!item.interes_bancario_corriente;
    const usuraEa = isIbc ? Number((numericRate * 1.5).toFixed(2)) : numericRate;

    const resolucion = item.resolucion || null;
    const modalidad = item.modalidad || 'CONSUMO Y ORDINARIO';

    // Insert both base 365 and base 360
    await createOrUpdateTasa({
      tipoTasa: 'USURA',
      mes,
      ano,
      base: 365,
      tasaEa: usuraEa,
      resolucion,
      modalidad,
      fuente: 'DATOS.GOV.CO (SFC)',
      fecVigenciaDesde: item.vigencia_desde ? item.vigencia_desde.split('T')[0] : null,
      fecVigenciaHasta: item.vigencia_hasta ? item.vigencia_hasta.split('T')[0] : null
    });

    await createOrUpdateTasa({
      tipoTasa: 'USURA',
      mes,
      ano,
      base: 360,
      tasaEa: usuraEa,
      resolucion,
      modalidad,
      fuente: 'DATOS.GOV.CO (SFC)',
      fecVigenciaDesde: item.vigencia_desde ? item.vigencia_desde.split('T')[0] : null,
      fecVigenciaHasta: item.vigencia_hasta ? item.vigencia_hasta.split('T')[0] : null
    });

    sincronizados += 2;
  }

  return {
    mensaje: `Sincronización completada exitosamente. Se actualizaron ${sincronizados} registros de tasas.`,
    tasasActualizadas: sincronizados,
    registros: await listTasas('USURA')
  };
}

// ==========================================
// 3. PLAZOS DE PAGO (POR DÍAS Y POR MESES)
// ==========================================
export interface PlazoPagoRow {
  id: number;
  plazo: number;
  unidad: 'DIAS' | 'MESES';
  descripcion: string | null;
  activo: boolean;
  orden: number;
  fecCreacion: string;
  fecActualizacion: string | null;
}

export interface CreatePlazoInput {
  plazo: number;
  unidad?: 'DIAS' | 'MESES';
  descripcion?: string | null;
  activo?: boolean;
  orden?: number;
}

export async function listPlazos(unidad?: string): Promise<PlazoPagoRow[]> {
  return withClient(async (client) => {
    let query = `
      SELECT id_plazo as id, plazo, unidad, descripcion, activo, orden, fec_creacion, fec_actualizacion
      FROM "Creditos"."TBL_PLAZOS_PAGO"
    `;
    const params: unknown[] = [];
    if (unidad && (unidad === 'DIAS' || unidad === 'MESES')) {
      params.push(unidad);
      query += ` WHERE unidad = $1`;
    }
    query += ` ORDER BY unidad ASC, plazo ASC`;

    const res = await client.query<{
      id: number;
      plazo: number;
      unidad: 'DIAS' | 'MESES';
      descripcion: string | null;
      activo: boolean;
      orden: number;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(query, params);

    return res.rows.map((r) => ({
      id: r.id,
      plazo: r.plazo,
      unidad: r.unidad,
      descripcion: r.descripcion,
      activo: r.activo,
      orden: r.orden,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    }));
  });
}

export async function createPlazo(input: CreatePlazoInput): Promise<PlazoPagoRow> {
  return withClient(async (client) => {
    const p = Number(input.plazo);
    if (isNaN(p) || p <= 0) throw new SecurityError('El plazo debe ser un número entero mayor a 0', 400);
    const unidad = input.unidad === 'MESES' ? 'MESES' : 'DIAS';
    const desc = input.descripcion?.trim() || `${p} ${unidad === 'MESES' ? 'meses' : 'días'}`;

    const res = await client.query<{
      id_plazo: number;
      plazo: number;
      unidad: 'DIAS' | 'MESES';
      descripcion: string | null;
      activo: boolean;
      orden: number;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `INSERT INTO "Creditos"."TBL_PLAZOS_PAGO" (plazo, unidad, descripcion, activo, orden, fec_creacion)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (plazo, unidad) DO UPDATE SET
         descripcion = EXCLUDED.descripcion,
         activo = EXCLUDED.activo,
         fec_actualizacion = NOW()
       RETURNING *`,
      [p, unidad, desc, input.activo ?? true, input.orden ?? 0]
    );

    const r = res.rows[0];
    return {
      id: r.id_plazo,
      plazo: r.plazo,
      unidad: r.unidad,
      descripcion: r.descripcion,
      activo: r.activo,
      orden: r.orden,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function updatePlazo(id: number, input: CreatePlazoInput): Promise<PlazoPagoRow> {
  return withClient(async (client) => {
    const p = Number(input.plazo);
    if (isNaN(p) || p <= 0) throw new SecurityError('El plazo debe ser un número mayor a 0', 400);
    const unidad = input.unidad === 'MESES' ? 'MESES' : 'DIAS';
    const desc = input.descripcion?.trim() || `${p} ${unidad === 'MESES' ? 'meses' : 'días'}`;

    const res = await client.query<{
      id_plazo: number;
      plazo: number;
      unidad: 'DIAS' | 'MESES';
      descripcion: string | null;
      activo: boolean;
      orden: number;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `UPDATE "Creditos"."TBL_PLAZOS_PAGO"
       SET plazo = $1, unidad = $2, descripcion = $3, activo = $4, orden = $5, fec_actualizacion = NOW()
       WHERE id_plazo = $6
       RETURNING *`,
      [p, unidad, desc, input.activo ?? true, input.orden ?? 0, id]
    );

    if (!res.rowCount) throw new SecurityError('Plazo no encontrado', 404);
    const r = res.rows[0];
    return {
      id: r.id_plazo,
      plazo: r.plazo,
      unidad: r.unidad,
      descripcion: r.descripcion,
      activo: r.activo,
      orden: r.orden,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function deletePlazo(id: number): Promise<boolean> {
  return withClient(async (client) => {
    const res = await client.query(`DELETE FROM "Creditos"."TBL_PLAZOS_PAGO" WHERE id_plazo = $1`, [id]);
    if (!res.rowCount) throw new SecurityError('Plazo no encontrado', 404);
    return true;
  });
}

// ==========================================
// 4. FORMATOS DE CRÉDITO Y ESTRUCTURA DE CAMPOS
// ==========================================
export const CAMPOS_FORMATO_CREDITO_CATALOG = [
  { key: 'valorCreditoSolicitar', label: 'Valor del crédito al solicitar', default: true },
  { key: 'valorDesembolso', label: 'Valor de desembolso', default: true },
  { key: 'valorCuota', label: 'Valor de la cuota', default: true },
  { key: 'plazo', label: 'Plazo', default: true },
  { key: 'tasaInteresSolicitar', label: 'Tasa de interés al solicitar', default: true },
  { key: 'atributosCreditoSolicitar', label: 'Atributos del crédito al solicitar', default: true },
  { key: 'planAmortizacionSolicitar', label: 'Plan de amortización al solicitar', default: true },
  { key: 'tasaInteres', label: 'Tasa de interés', default: true },
  { key: 'valorCredito', label: 'Valor del crédito', default: true },
  { key: 'primeraCuota', label: 'Primera cuota', default: true },
  { key: 'interesAjustable', label: 'Interés ajustable', default: true },
  { key: 'metodo', label: 'Método', default: true },
  { key: 'cartera', label: 'Cartera', default: true },
  { key: 'calificacionRiesgo', label: 'Calificación de riesgo', default: true },
  { key: 'saldoCredito', label: 'Saldo del crédito', default: true },
  { key: 'atributosCredito', label: 'Atributos del crédito', default: true },
  { key: 'planAmortizacion', label: 'Plan de amortización', default: true },
  { key: 'documentosCredito', label: 'Documentos del crédito', default: true },
  { key: 'extractos', label: 'Extractos', default: true }
];

export interface FormatoCreditoRow {
  id: number;
  nombre: string;
  descripcion: string | null;
  campos: Record<string, boolean>;
  numRequisitos: number;
  activo: boolean;
  fecCreacion: string;
  fecActualizacion: string | null;
}

export interface CreateFormatoCreditoInput {
  nombre: string;
  descripcion?: string | null;
  campos: Record<string, boolean>;
  activo?: boolean;
}

export async function listFormatosCredito(): Promise<FormatoCreditoRow[]> {
  return withClient(async (client) => {
    const res = await client.query<{
      id_formato_credito: number;
      nombre: string;
      descripcion: string | null;
      campos: Record<string, boolean> | string;
      num_requisitos: number;
      activo: boolean;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(`
      SELECT id_formato_credito, nombre, descripcion, campos, num_requisitos, activo, fec_creacion, fec_actualizacion
      FROM "Creditos"."TBL_FORMATOS_CREDITO"
      ORDER BY id_formato_credito ASC
    `);

    return res.rows.map((r) => {
      const parsedCampos = typeof r.campos === 'string' ? JSON.parse(r.campos) : (r.campos || {});
      return {
        id: r.id_formato_credito,
        nombre: r.nombre,
        descripcion: r.descripcion,
        campos: parsedCampos,
        numRequisitos: r.num_requisitos,
        activo: r.activo,
        fecCreacion: r.fec_creacion,
        fecActualizacion: r.fec_actualizacion
      };
    });
  });
}

export async function getFormatoCredito(id: number): Promise<FormatoCreditoRow> {
  return withClient(async (client) => {
    const res = await client.query<{
      id_formato_credito: number;
      nombre: string;
      descripcion: string | null;
      campos: Record<string, boolean> | string;
      num_requisitos: number;
      activo: boolean;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `SELECT id_formato_credito, nombre, descripcion, campos, num_requisitos, activo, fec_creacion, fec_actualizacion
       FROM "Creditos"."TBL_FORMATOS_CREDITO"
       WHERE id_formato_credito = $1`,
      [id]
    );

    if (!res.rowCount) throw new SecurityError('Formato de crédito no encontrado', 404);
    const r = res.rows[0];
    const parsedCampos = typeof r.campos === 'string' ? JSON.parse(r.campos) : (r.campos || {});
    return {
      id: r.id_formato_credito,
      nombre: r.nombre,
      descripcion: r.descripcion,
      campos: parsedCampos,
      numRequisitos: r.num_requisitos,
      activo: r.activo,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function createFormatoCredito(input: CreateFormatoCreditoInput): Promise<FormatoCreditoRow> {
  return withClient(async (client) => {
    const nombre = input.nombre.trim();
    if (!nombre) throw new SecurityError('El nombre del formato es obligatorio', 400);

    const campos = input.campos || {};
    // Calculate number of selected requirements
    const numRequisitos = Object.values(campos).filter(Boolean).length;

    const res = await client.query<{
      id_formato_credito: number;
      nombre: string;
      descripcion: string | null;
      campos: Record<string, boolean> | string;
      num_requisitos: number;
      activo: boolean;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `INSERT INTO "Creditos"."TBL_FORMATOS_CREDITO" (nombre, descripcion, campos, num_requisitos, activo, fec_creacion)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (nombre) DO UPDATE SET
         descripcion = EXCLUDED.descripcion,
         campos = EXCLUDED.campos,
         num_requisitos = EXCLUDED.num_requisitos,
         activo = EXCLUDED.activo,
         fec_actualizacion = NOW()
       RETURNING *`,
      [nombre, input.descripcion?.trim() || null, JSON.stringify(campos), numRequisitos, input.activo ?? true]
    );

    const r = res.rows[0];
    const parsedCampos = typeof r.campos === 'string' ? JSON.parse(r.campos) : (r.campos || {});
    return {
      id: r.id_formato_credito,
      nombre: r.nombre,
      descripcion: r.descripcion,
      campos: parsedCampos,
      numRequisitos: r.num_requisitos,
      activo: r.activo,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function updateFormatoCredito(id: number, input: CreateFormatoCreditoInput): Promise<FormatoCreditoRow> {
  return withClient(async (client) => {
    const nombre = input.nombre.trim();
    if (!nombre) throw new SecurityError('El nombre del formato es obligatorio', 400);

    const campos = input.campos || {};
    const numRequisitos = Object.values(campos).filter(Boolean).length;

    const res = await client.query<{
      id_formato_credito: number;
      nombre: string;
      descripcion: string | null;
      campos: Record<string, boolean> | string;
      num_requisitos: number;
      activo: boolean;
      fec_creacion: string;
      fec_actualizacion: string | null;
    }>(
      `UPDATE "Creditos"."TBL_FORMATOS_CREDITO"
       SET nombre = $1, descripcion = $2, campos = $3, num_requisitos = $4, activo = $5, fec_actualizacion = NOW()
       WHERE id_formato_credito = $6
       RETURNING *`,
      [nombre, input.descripcion?.trim() || null, JSON.stringify(campos), numRequisitos, input.activo ?? true, id]
    );

    if (!res.rowCount) throw new SecurityError('Formato de crédito no encontrado', 404);
    const r = res.rows[0];
    const parsedCampos = typeof r.campos === 'string' ? JSON.parse(r.campos) : (r.campos || {});
    return {
      id: r.id_formato_credito,
      nombre: r.nombre,
      descripcion: r.descripcion,
      campos: parsedCampos,
      numRequisitos: r.num_requisitos,
      activo: r.activo,
      fecCreacion: r.fec_creacion,
      fecActualizacion: r.fec_actualizacion
    };
  });
}

export async function deleteFormatoCredito(id: number): Promise<boolean> {
  return withClient(async (client) => {
    const res = await client.query(`DELETE FROM "Creditos"."TBL_FORMATOS_CREDITO" WHERE id_formato_credito = $1`, [id]);
    if (!res.rowCount) throw new SecurityError('Formato de crédito no encontrado', 404);
    return true;
  });
}
