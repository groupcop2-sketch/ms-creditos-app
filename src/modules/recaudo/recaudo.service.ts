import { createHash } from 'node:crypto';
import { pool, type ClientLike } from '../../lib/db.js';
import { isMailConfigured, sendMail } from '../../lib/mailer.js';
import { SecurityError } from '../security/security.service.js';
import { aplicarPagoCreditoTx, ensureEgresos, recalcularMoraCredito, reversarPagoCreditoTx } from '../creditos/creditos.service.js';
import { getConfigPlataforma, getLogo } from '../plataforma/plataforma.service.js';
import { ensureRecaudo } from './recaudo.schema.js';
import { generarPdfCuentaCobro } from './recaudo.pdf.js';
import {
  RESULTADOS_APLICABLES, RESULTADOS_REVISION, conciliar, fechaLimiteGiro, fechaPagoNomina, finDePeriodo, parseArchivo, periodoSiguiente,
  validarPlantilla, type DetalleCobro, type FilaConciliada, type PlantillaArchivo
} from './recaudo.logic.js';

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombrePeriodo = (p: string) => { const [y, m] = p.split('-').map(Number); const n = MESES[m - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${y}`; };
/** Pool or transaction client: read helpers accept either. */
type Db = Pick<ClientLike, 'query'>;
const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);
const hoy = () => new Date().toISOString().slice(0, 10);

function assertPeriodo(periodo: string) {
  if (!PERIODO.test(periodo)) throw new SecurityError('El periodo debe tener formato AAAA-MM', 400);
}

async function tx<T>(run: (client: ClientLike) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await run(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function assertPeriodoAbierto(periodo: string, client: Db = pool) {
  const r = await client.query<{ estado: string }>('select estado from "Creditos"."TBL_RECAUDO_CIERRES" where periodo = $1', [periodo]);
  if (r.rows[0]?.estado === 'CERRADO') throw new SecurityError(`${nombrePeriodo(periodo)} está cerrado. Reábrelo en Cierre del mes para hacer cambios.`, 409);
}

/* ---------- Collection detail (what each company must deduct) ---------- */

type FilaDetalle = {
  id_credito: number; consecutivo: string; identificacion: string; nombre: string; id_credito_cuota: number | null;
  numero_cuota: number; total_cuotas: number; cuotas_pendientes: number; valor_cuota: string; mora: string; total: string; saldo_capital: string;
};

/** Every unpaid installment due up to the end of the period, one row per credit (older unpaid ones carry over). */
async function calcularDetalle(client: Db, empresaId: number, periodo: string) {
  const r = await client.query<FilaDetalle>(
    `select c.id_credito,
            coalesce(nullif(c.consecutivo::text, ''), 'CR-' || c.id_credito) as consecutivo,
            regexp_replace(coalesce(c.v_identificacion_cliente, ''), '\\D', '', 'g') as identificacion,
            coalesce(c.v_nombre_cliente, '') as nombre,
            (array_agg(q.id_credito_cuota order by q.numero_cuota desc) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date))[1] as id_credito_cuota,
            max(q.numero_cuota) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date) as numero_cuota,
            count(*)::int as total_cuotas,
            (count(*) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date))::int as cuotas_pendientes,
            coalesce(sum(q.valor_cuota - greatest(0, q.valor_pagado - q.mora_pagada)) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date), 0) as valor_cuota,
            coalesce(sum(greatest(0, q.valor_mora - q.mora_pagada)) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date), 0) as mora,
            coalesce(sum(q.valor_cuota + q.valor_mora - q.valor_pagado) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date), 0) as total,
            coalesce(sum(greatest(0, q.capital - q.capital_pagado)), 0) as saldo_capital
     from "Creditos"."TBL_CREDITOS" c
     inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
     where c.id_empresa = $1
     group by c.id_credito
     having count(*) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date) > 0
     order by c.v_nombre_cliente, c.id_credito`,
    [empresaId, finDePeriodo(periodo)]
  );
  return r.rows.filter((x) => num(x.total) > 0);
}

/* ---------- Period overview ---------- */

type CuentaRow = {
  id_cuenta_cobro: number; consecutivo: string; id_empresa: number; periodo: string; fecha_emision: string; fecha_pago_nomina: string; fecha_limite_giro: string;
  total: string; recibido: string; estado: string; id_cuenta_egreso: number | null; envios: number; fecha_ultimo_envio: string | null; correo_ultimo_envio: string | null;
};
const fechas = (a = '') => `to_char(${a}fecha_emision, 'YYYY-MM-DD') as fecha_emision, to_char(${a}fecha_pago_nomina, 'YYYY-MM-DD') as fecha_pago_nomina, to_char(${a}fecha_limite_giro, 'YYYY-MM-DD') as fecha_limite_giro`;
const DATE_COLS = fechas();
const mapCuenta = (c: CuentaRow) => ({
  id: c.id_cuenta_cobro, consecutivo: c.consecutivo, empresaId: c.id_empresa, periodo: c.periodo, fechaEmision: c.fecha_emision,
  fechaPagoNomina: c.fecha_pago_nomina, fechaLimiteGiro: c.fecha_limite_giro, total: num(c.total), recibido: num(c.recibido), estado: c.estado,
  idCuentaEgreso: c.id_cuenta_egreso, envios: c.envios, fechaUltimoEnvio: c.fecha_ultimo_envio, correoUltimoEnvio: c.correo_ultimo_envio
});

type EmpresaRow = { id_empresa: number; v_razon_social: string; v_nit: string | null; v_correo: string | null; v_contacto_correo: string | null; v_contacto_nombre: string | null; dia_pago_nomina: number | null; ajustar_fin_semana: boolean | null };
const EMPRESA_COLS = 'e.id_empresa, e.v_razon_social, e.v_nit, e.v_correo, e.v_contacto_correo, e.v_contacto_nombre, e.dia_pago_nomina, e.ajustar_fin_semana';
const correoEmpresa = (e: EmpresaRow) => e.v_contacto_correo?.trim() || e.v_correo?.trim() || null;

async function empresa(client: Db, id: number) {
  const r = await client.query<EmpresaRow>(`select ${EMPRESA_COLS} from "Creditos"."TBL_EMPRESAS" e where e.id_empresa = $1`, [id]);
  if (!r.rowCount) throw new SecurityError('Empresa no encontrada', 404);
  return r.rows[0];
}

export async function resumenPeriodo(periodo: string) {
  assertPeriodo(periodo);
  await ensureRecaudo();
  const fin = finDePeriodo(periodo);
  // Companies with something to collect this period, plus those that already have a notice.
  const empresas = await pool.query<EmpresaRow & { creditos: number; por_cobrar: string; tiene_plantilla: boolean }>(
    `with deuda as (
       select c.id_empresa, count(distinct c.id_credito)::int as creditos, sum(q.valor_cuota + q.valor_mora - q.valor_pagado) as por_cobrar
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
       where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $2::date and c.id_empresa is not null
       group by c.id_empresa
     )
     select ${EMPRESA_COLS}, coalesce(d.creditos, 0) as creditos, coalesce(d.por_cobrar, 0) as por_cobrar,
            exists (select 1 from "Creditos"."TBL_RECAUDO_PLANTILLAS" p where p.id_empresa = e.id_empresa) as tiene_plantilla
     from "Creditos"."TBL_EMPRESAS" e
     left join deuda d on d.id_empresa = e.id_empresa
     where d.id_empresa is not null
        or exists (select 1 from "Creditos"."TBL_CUENTAS_COBRO" cc where cc.id_empresa = e.id_empresa and cc.periodo = $1 and cc.estado <> 'ANULADA')
     order by e.v_razon_social`,
    [periodo, fin]
  );
  const cuentas = await pool.query<CuentaRow & { creditos: number }>(
    `select cc.*, ${fechas('cc.')},
            (select count(*)::int from "Creditos"."TBL_CUENTA_COBRO_DETALLE" d where d.id_cuenta_cobro = cc.id_cuenta_cobro) as creditos
     from "Creditos"."TBL_CUENTAS_COBRO" cc where cc.periodo = $1 and cc.estado <> 'ANULADA'`,
    [periodo]
  );
  const porEmpresa = new Map(cuentas.rows.map((c) => [c.id_empresa, c]));
  const cierre = await pool.query<{ estado: string; fecha_cierre: string }>('select estado, fecha_cierre from "Creditos"."TBL_RECAUDO_CIERRES" where periodo = $1', [periodo]);
  return {
    periodo, nombre: nombrePeriodo(periodo),
    cierre: cierre.rows[0] ? { estado: cierre.rows[0].estado, fecha: cierre.rows[0].fecha_cierre } : null,
    empresas: empresas.rows.map((e) => {
      const c = porEmpresa.get(e.id_empresa);
      const pago = fechaPagoNomina(periodo, e.dia_pago_nomina, e.ajustar_fin_semana);
      return {
        id: e.id_empresa, nombre: e.v_razon_social, nit: e.v_nit, correo: correoEmpresa(e), tienePlantilla: e.tiene_plantilla,
        creditos: c ? c.creditos : e.creditos,
        cobrado: c ? num(c.total) : round(num(e.por_cobrar)),
        recibido: c ? num(c.recibido) : 0,
        fechaPagoNomina: c?.fecha_pago_nomina ?? pago,
        fechaLimiteGiro: c?.fecha_limite_giro ?? fechaLimiteGiro(pago),
        cuenta: c ? mapCuenta(c) : null,
        estado: c?.estado ?? 'SIN_GENERAR'
      };
    })
  };
}

/* ---------- Collection notices ---------- */

export async function vistaPreviaCobro(empresaId: number, periodo: string) {
  assertPeriodo(periodo);
  await ensureRecaudo();
  const e = await empresa(pool, empresaId);
  const detalle = await calcularDetalle(pool, empresaId, periodo);
  const pago = fechaPagoNomina(periodo, e.dia_pago_nomina, e.ajustar_fin_semana);
  return { empresaId, periodo, fechaPagoNomina: pago, fechaLimiteGiro: fechaLimiteGiro(pago), detalle: detalle.map(mapDetalleCalc), total: round(detalle.reduce((s, d) => s + num(d.total), 0)) };
}
const mapDetalleCalc = (d: FilaDetalle) => ({
  idCredito: d.id_credito, consecutivo: d.consecutivo, identificacion: d.identificacion, nombre: d.nombre, numeroCuota: d.numero_cuota,
  totalCuotas: d.total_cuotas, cuotasPendientes: d.cuotas_pendientes, valorCuota: num(d.valor_cuota), mora: num(d.mora), total: num(d.total), saldoCapital: num(d.saldo_capital)
});

export async function generarCuentaCobro(input: { empresaId: number; periodo: string; fechaPagoNomina?: string | null; idCuentaEgreso?: number | null; usuarioId: number | null }) {
  assertPeriodo(input.periodo);
  await ensureRecaudo();
  await ensureEgresos();
  const id = await tx(async (client) => {
    await assertPeriodoAbierto(input.periodo, client);
    const e = await empresa(client, input.empresaId);
    await client.query('select id_empresa from "Creditos"."TBL_EMPRESAS" where id_empresa = $1 for update', [input.empresaId]);
    const existe = await client.query<{ consecutivo: string }>(
      `select consecutivo from "Creditos"."TBL_CUENTAS_COBRO" where id_empresa = $1 and periodo = $2 and estado <> 'ANULADA'`, [input.empresaId, input.periodo]);
    if (existe.rowCount) throw new SecurityError(`Ya existe la cuenta de cobro ${existe.rows[0].consecutivo} para ${e.v_razon_social} en ${nombrePeriodo(input.periodo)}`, 409);

    const creditos = await client.query<{ id_credito: number }>(
      `select distinct c.id_credito from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
       where c.id_empresa = $1 and q.estado <> 'PAGADA'`, [input.empresaId]);
    for (const c of creditos.rows) await recalcularMoraCredito(client, c.id_credito);

    const detalle = await calcularDetalle(client, input.empresaId, input.periodo);
    if (!detalle.length) throw new SecurityError(`${e.v_razon_social} no tiene cuotas por cobrar en ${nombrePeriodo(input.periodo)}`, 400);
    const total = round(detalle.reduce((s, d) => s + num(d.total), 0));
    const pago = input.fechaPagoNomina || fechaPagoNomina(input.periodo, e.dia_pago_nomina, e.ajustar_fin_semana);
    let cuentaEgreso = input.idCuentaEgreso ?? null;
    if (cuentaEgreso) {
      const ok = await client.query('select 1 from "Creditos"."TBL_CUENTAS_EGRESO" where id_cuenta_egreso = $1 and activo', [cuentaEgreso]);
      if (!ok.rowCount) throw new SecurityError('La cuenta para el giro no existe o está inactiva', 400);
    } else {
      cuentaEgreso = (await client.query<{ id_cuenta_egreso: number }>('select id_cuenta_egreso from "Creditos"."TBL_CUENTAS_EGRESO" where activo order by id_cuenta_egreso limit 1')).rows[0]?.id_cuenta_egreso ?? null;
    }
    const seq = await client.query<{ n: string }>(`select nextval('"Creditos".seq_cuenta_cobro') as n`);
    const consecutivo = 'CC-' + String(seq.rows[0].n).padStart(6, '0');
    const cuenta = await client.query<{ id_cuenta_cobro: number }>(
      `insert into "Creditos"."TBL_CUENTAS_COBRO" (consecutivo, id_empresa, periodo, fecha_pago_nomina, fecha_limite_giro, total, id_cuenta_egreso, id_usuario)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id_cuenta_cobro`,
      [consecutivo, input.empresaId, input.periodo, pago, fechaLimiteGiro(pago), total, cuentaEgreso, input.usuarioId]
    );
    const idCuenta = cuenta.rows[0].id_cuenta_cobro;
    for (const d of detalle) {
      await client.query(
        `insert into "Creditos"."TBL_CUENTA_COBRO_DETALLE" (id_cuenta_cobro, id_credito, id_credito_cuota, identificacion, nombre, consecutivo_credito,
           numero_cuota, total_cuotas, cuotas_pendientes, valor_cuota, mora, total, saldo_capital)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [idCuenta, d.id_credito, d.id_credito_cuota, d.identificacion, d.nombre, d.consecutivo, d.numero_cuota, d.total_cuotas, d.cuotas_pendientes,
          num(d.valor_cuota), num(d.mora), num(d.total), num(d.saldo_capital)]
      );
    }
    return idCuenta;
  });
  return getCuentaCobro(id);
}

export async function getCuentaCobro(id: number) {
  await ensureRecaudo();
  const r = await pool.query<CuentaRow>(`select *, ${DATE_COLS} from "Creditos"."TBL_CUENTAS_COBRO" where id_cuenta_cobro = $1`, [id]);
  if (!r.rowCount) throw new SecurityError('Cuenta de cobro no encontrada', 404);
  const c = r.rows[0];
  const e = await empresa(pool, c.id_empresa);
  const detalle = await pool.query(
    `select id_credito, consecutivo_credito, identificacion, nombre, numero_cuota, total_cuotas, cuotas_pendientes, valor_cuota, mora, total, saldo_capital
     from "Creditos"."TBL_CUENTA_COBRO_DETALLE" where id_cuenta_cobro = $1 order by nombre, id_credito`, [id]);
  await ensureEgresos();
  const cuentaGiro = c.id_cuenta_egreso
    ? (await pool.query<{ banco: string; tipo_cuenta: string; numero_cuenta: string; titular: string | null }>(
      'select banco, tipo_cuenta, numero_cuenta, titular from "Creditos"."TBL_CUENTAS_EGRESO" where id_cuenta_egreso = $1', [c.id_cuenta_egreso])).rows[0] ?? null
    : null;
  return {
    ...mapCuenta(c),
    periodoNombre: nombrePeriodo(c.periodo),
    empresa: { id: e.id_empresa, nombre: e.v_razon_social, nit: e.v_nit, contacto: e.v_contacto_nombre, correo: correoEmpresa(e) },
    cuentaGiro: cuentaGiro ? { banco: cuentaGiro.banco, tipo: cuentaGiro.tipo_cuenta, numero: cuentaGiro.numero_cuenta, titular: cuentaGiro.titular } : null,
    detalle: detalle.rows.map((d) => ({
      idCredito: d.id_credito, consecutivo: d.consecutivo_credito, identificacion: d.identificacion, nombre: d.nombre, numeroCuota: d.numero_cuota,
      totalCuotas: d.total_cuotas, cuotasPendientes: d.cuotas_pendientes, valorCuota: num(d.valor_cuota), mora: num(d.mora), total: num(d.total), saldoCapital: num(d.saldo_capital)
    }))
  };
}

export async function pdfCuentaCobro(id: number) {
  const c = await getCuentaCobro(id);
  const [cfg, logo] = await Promise.all([getConfigPlataforma(), getLogo()]);
  const buffer = await generarPdfCuentaCobro({
    consecutivo: c.consecutivo, periodoNombre: c.periodoNombre, fechaEmision: c.fechaEmision, fechaPagoNomina: c.fechaPagoNomina, fechaLimiteGiro: c.fechaLimiteGiro,
    emisor: { nombre: cfg.razonSocial || cfg.nombreComercial, nit: cfg.nit, correo: cfg.correoSoporte, telefono: cfg.telefono, logo: logo ? { mime: logo.mime, contenido: Buffer.from(logo.contenido) } : null },
    empresa: { nombre: c.empresa.nombre, nit: c.empresa.nit, contacto: c.empresa.contacto, correo: c.empresa.correo },
    cuentaGiro: c.cuentaGiro,
    detalle: c.detalle.map((d) => ({ ...d, credito: d.consecutivo })),
    total: c.total
  });
  return { buffer, nombre: `${c.consecutivo}.pdf`, cuenta: c };
}

/** Excel-compatible CSV (semicolon + BOM, as Excel in Spanish locale expects). */
export async function csvCuentaCobro(id: number) {
  const c = await getCuentaCobro(id);
  const q = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = [
    ['Identificacion', 'Empleado', 'Credito', 'Cuota', 'Total cuotas', 'Valor cuota', 'Mora', 'Total a descontar', 'Saldo capital', 'Valor descontado', 'Novedad'],
    ...c.detalle.map((d) => [d.identificacion, d.nombre, d.consecutivo, d.numeroCuota, d.totalCuotas, d.valorCuota, d.mora, d.total, d.saldoCapital, '', ''])
  ];
  return { texto: '﻿' + filas.map((f) => f.map(q).join(';')).join('\r\n'), nombre: `${c.consecutivo}.csv` };
}

export async function enviarCuentaCobro(id: number, input: { manual?: boolean; usuarioId: number | null }) {
  const c = await getCuentaCobro(id);
  if (c.estado === 'ANULADA') throw new SecurityError('La cuenta de cobro está anulada', 409);
  let destino = 'Envío manual';
  if (!input.manual) {
    if (!c.empresa.correo) throw new SecurityError(`${c.empresa.nombre} no tiene correo registrado. Agrégalo en Empresas o márcala como enviada manualmente.`, 400);
    if (!isMailConfigured()) throw new SecurityError('El correo (SMTP) no está configurado. Descarga el PDF, envíalo tú y márcala como enviada manualmente.', 409);
    const [{ buffer, nombre }, csv, cfg] = await Promise.all([pdfCuentaCobro(id), csvCuentaCobro(id), getConfigPlataforma()]);
    const money = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
    const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
    const parrafos = [
      'Buen día,',
      `Adjuntamos la cuenta de cobro ${c.consecutivo} de ${c.periodoNombre} por ${money(c.total)} (${c.detalle.length} créditos).`,
      `Fecha límite de giro: ${c.fechaLimiteGiro}.`,
      'Al pagar la nómina, por favor responda con el archivo de descuentos aplicados. El Excel adjunto tiene las columnas para diligenciar.',
      cfg.nombreComercial
    ];
    const r = await sendMail({
      to: c.empresa.correo,
      subject: `Cuenta de cobro ${c.consecutivo} · Libranzas ${c.periodoNombre}`,
      text: parrafos.join('\n\n'),
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1a2a;max-width:560px">${parrafos.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`,
      attachments: [
        { filename: nombre, content: buffer, contentType: 'application/pdf' },
        { filename: csv.nombre, content: Buffer.from(csv.texto, 'utf8'), contentType: 'text/csv' }
      ]
    });
    if (!r.sent) throw new SecurityError('No se pudo enviar el correo. Intenta de nuevo o márcala como enviada manualmente.', 502);
    destino = c.empresa.correo;
  }
  await pool.query(
    `update "Creditos"."TBL_CUENTAS_COBRO"
     set envios = envios + 1, fecha_ultimo_envio = now(), correo_ultimo_envio = $2,
         estado = case when estado = 'GENERADA' then 'ENVIADA' else estado end
     where id_cuenta_cobro = $1`, [id, destino]);
  return getCuentaCobro(id);
}

export async function anularCuentaCobro(id: number, motivo: string) {
  const c = await getCuentaCobro(id);
  await assertPeriodoAbierto(c.periodo);
  const lote = await pool.query(`select 1 from "Creditos"."TBL_RECAUDO_LOTES" where id_cuenta_cobro = $1 and estado = 'APLICADO'`, [id]);
  if (lote.rowCount) throw new SecurityError('La cuenta de cobro tiene un lote aplicado. Reversa el lote antes de anularla.', 409);
  await pool.query(`update "Creditos"."TBL_CUENTAS_COBRO" set estado = 'ANULADA', motivo_anulacion = $2 where id_cuenta_cobro = $1`, [id, motivo]);
  return getCuentaCobro(id);
}

/** The company did not remit this period: the whole notice becomes a difference to claim (Ley 1527 art. 6). */
export async function marcarNoGiro(id: number) {
  const c = await getCuentaCobro(id);
  await assertPeriodoAbierto(c.periodo);
  if (!['GENERADA', 'ENVIADA'].includes(c.estado)) throw new SecurityError('Solo una cuenta de cobro sin pagos aplicados puede marcarse como «no giró»', 409);
  await pool.query(`update "Creditos"."TBL_CUENTAS_COBRO" set estado = 'NO_GIRO' where id_cuenta_cobro = $1`, [id]);
  return getCuentaCobro(id);
}

/* ---------- File templates per company ---------- */

const mapPlantilla = (p: { separador: string; fila_encabezado: number; mapeo: PlantillaArchivo['mapeo']; novedades: Record<string, string>; archivo_ejemplo: string | null; fec_actualizacion: string }) => ({
  separador: p.separador, filaEncabezado: p.fila_encabezado, mapeo: p.mapeo, novedades: p.novedades, archivoEjemplo: p.archivo_ejemplo, actualizada: p.fec_actualizacion
});

export async function getPlantilla(empresaId: number) {
  await ensureRecaudo();
  const r = await pool.query('select * from "Creditos"."TBL_RECAUDO_PLANTILLAS" where id_empresa = $1', [empresaId]);
  return r.rows[0] ? mapPlantilla(r.rows[0]) : null;
}

export async function guardarPlantilla(empresaId: number, p: PlantillaArchivo & { archivoEjemplo?: string | null }, usuarioId: number | null) {
  await ensureRecaudo();
  await empresa(pool, empresaId);
  const error = validarPlantilla(p);
  if (error) throw new SecurityError(error, 400);
  const novedades = Object.fromEntries(Object.entries(p.novedades).map(([k, v]) => [k.trim().toUpperCase(), v.trim()]).filter(([k, v]) => k && v));
  await pool.query(
    `insert into "Creditos"."TBL_RECAUDO_PLANTILLAS" (id_empresa, separador, fila_encabezado, mapeo, novedades, archivo_ejemplo, id_usuario)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id_empresa) do update set separador = excluded.separador, fila_encabezado = excluded.fila_encabezado, mapeo = excluded.mapeo,
       novedades = excluded.novedades, archivo_ejemplo = excluded.archivo_ejemplo, id_usuario = excluded.id_usuario, fec_actualizacion = now()`,
    [empresaId, p.separador, p.filaEncabezado, JSON.stringify(p.mapeo), JSON.stringify(novedades), p.archivoEjemplo?.slice(0, 200_000) ?? null, usuarioId]
  );
  return getPlantilla(empresaId);
}

/* ---------- Payment files (batches) ---------- */

async function cuentaVigente(client: Db, empresaId: number, periodo: string) {
  const r = await client.query<CuentaRow>(
    `select *, ${DATE_COLS} from "Creditos"."TBL_CUENTAS_COBRO" where id_empresa = $1 and periodo = $2 and estado <> 'ANULADA'`, [empresaId, periodo]);
  if (!r.rowCount) throw new SecurityError(`Primero genera la cuenta de cobro de ${nombrePeriodo(periodo)} para esta empresa`, 409);
  return r.rows[0];
}

async function prepararConciliacion(client: Db, empresaId: number, periodo: string, texto: string) {
  assertPeriodo(periodo);
  const plantilla = await getPlantilla(empresaId);
  if (!plantilla) throw new SecurityError('La empresa no tiene formato de archivo configurado. Configúralo en Formatos por empresa.', 409);
  const cuenta = await cuentaVigente(client, empresaId, periodo);
  const det = await client.query<{ id_credito: number; consecutivo_credito: string; identificacion: string; nombre: string; total: string }>(
    'select id_credito, consecutivo_credito, identificacion, nombre, total from "Creditos"."TBL_CUENTA_COBRO_DETALLE" where id_cuenta_cobro = $1', [cuenta.id_cuenta_cobro]);
  const detalle: DetalleCobro[] = det.rows.map((d) => ({ idCredito: d.id_credito, consecutivo: d.consecutivo_credito, identificacion: d.identificacion, nombre: d.nombre, total: num(d.total) }));
  const parsed = parseArchivo(texto, plantilla);
  const items = conciliar(detalle, parsed.filas, plantilla.novedades);
  const totalArchivo = round(parsed.filas.reduce((s, f) => s + f.valor, 0));
  const aplicables = items.filter((i) => RESULTADOS_APLICABLES.has(i.resultado));
  return {
    cuenta, plantilla, parsed, items,
    totales: {
      totalArchivo,
      aplicar: round(aplicables.reduce((s, i) => s + i.valor, 0)),
      pagos: aplicables.length,
      revision: round(items.filter((i) => RESULTADOS_REVISION.has(i.resultado)).reduce((s, i) => s + i.valor, 0))
    },
    hash: createHash('sha256').update(`${empresaId}|${periodo}|${texto.replace(/\r\n/g, '\n').trim()}`).digest('hex')
  };
}

const vistaConciliacion = (c: Awaited<ReturnType<typeof prepararConciliacion>>) => ({
  cuenta: mapCuenta(c.cuenta), encabezados: c.parsed.encabezados, errores: c.parsed.errores, items: c.items.map(({ datos: _d, ...i }) => i), totales: c.totales
});

/** Dry run: nothing is written. */
export async function conciliarArchivo(input: { empresaId: number; periodo: string; texto: string }) {
  await ensureRecaudo();
  const c = await prepararConciliacion(pool, input.empresaId, input.periodo, input.texto);
  const previo = await pool.query<{ id_lote: number }>(`select id_lote from "Creditos"."TBL_RECAUDO_LOTES" where hash = $1 and estado = 'APLICADO'`, [c.hash]);
  return { ...vistaConciliacion(c), loteExistente: previo.rows[0]?.id_lote ?? null };
}

export async function aplicarLote(input: { empresaId: number; periodo: string; texto: string; nombreArchivo?: string | null; fechaGiro: string; valorGirado: number; usuarioId: number | null }) {
  await ensureRecaudo();
  const id = await tx(async (client) => {
    await assertPeriodoAbierto(input.periodo, client);
    await client.query('select id_empresa from "Creditos"."TBL_EMPRESAS" where id_empresa = $1 for update', [input.empresaId]);
    const c = await prepararConciliacion(client, input.empresaId, input.periodo, input.texto);
    if (c.parsed.errores.length) throw new SecurityError(`El archivo tiene ${c.parsed.errores.length} filas que no se pudieron leer. Corrígelas antes de aplicar.`, 409);
    if (round(input.valorGirado) !== c.totales.totalArchivo) {
      throw new SecurityError(`El archivo suma $${c.totales.totalArchivo.toLocaleString('es-CO')} y el giro registrado es $${round(input.valorGirado).toLocaleString('es-CO')}. Deben coincidir.`, 409);
    }
    if (!['GENERADA', 'ENVIADA'].includes(c.cuenta.estado)) {
      throw new SecurityError(c.cuenta.estado === 'NO_GIRO' ? 'La cuenta está marcada como «no giró».' : 'Esta cuenta de cobro ya tiene un lote aplicado. Reversa ese lote para cargar otro archivo.', 409);
    }
    const dup = await client.query(`select 1 from "Creditos"."TBL_RECAUDO_LOTES" where hash = $1 and estado = 'APLICADO'`, [c.hash]);
    if (dup.rowCount) throw new SecurityError('Este archivo ya fue aplicado. Un archivo no se puede aplicar dos veces.', 409);

    const lote = await client.query<{ id_lote: number }>(
      `insert into "Creditos"."TBL_RECAUDO_LOTES" (id_empresa, id_cuenta_cobro, periodo, nombre_archivo, archivo, hash, fecha_giro, valor_girado, total_archivo, filas, id_usuario)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id_lote`,
      [input.empresaId, c.cuenta.id_cuenta_cobro, input.periodo, input.nombreArchivo?.slice(0, 200) ?? null, Buffer.from(input.texto, 'utf8'), c.hash,
        input.fechaGiro, round(input.valorGirado), c.totales.totalArchivo, c.parsed.filas.length, input.usuarioId]
    );
    const idLote = lote.rows[0].id_lote;
    let aplicado = 0, pagos = 0;
    for (const item of c.items) {
      let pagoId: number | null = null;
      if (RESULTADOS_APLICABLES.has(item.resultado) && item.idCredito) {
        try {
          const r = await aplicarPagoCreditoTx(client, item.idCredito, {
            fechaPago: input.fechaGiro, valorPago: item.valor, medioPago: 'NOMINA', tipoRecaudo: 'NOMINA', periodoNomina: input.periodo,
            referenciaPago: `LOTE-${idLote}`, observacion: `Recaudo nómina ${c.cuenta.consecutivo}, fila ${item.fila}`, usuarioId: input.usuarioId
          });
          pagoId = r.pagoId;
        } catch (err) {
          throw new SecurityError(`Fila ${item.fila} (${item.consecutivo}): ${err instanceof Error ? err.message : 'no se pudo aplicar'}`, 409);
        }
        aplicado += item.valor; pagos++;
      }
      await insertarFila(client, idLote, item, pagoId);
    }
    const completo = c.items.every((i) => i.resultado === 'COMPLETO' || i.resultado === 'EXCEDENTE');
    await client.query(`update "Creditos"."TBL_RECAUDO_LOTES" set total_aplicado = $2, pagos = $3 where id_lote = $1`, [idLote, round(aplicado), pagos]);
    await client.query(
      `update "Creditos"."TBL_CUENTAS_COBRO" set recibido = recibido + $2, estado = $3 where id_cuenta_cobro = $1`,
      [c.cuenta.id_cuenta_cobro, round(aplicado), completo ? 'CONCILIADA' : 'CONCILIADA_PARCIAL']);
    return idLote;
  });
  return getLote(id);
}

async function insertarFila(client: Db, idLote: number, i: FilaConciliada, pagoId: number | null) {
  await client.query(
    `insert into "Creditos"."TBL_RECAUDO_LOTE_FILAS" (id_lote, fila, datos, identificacion, nombre, valor, cobrado, novedad, id_credito, resultado, detalle, id_credito_pago)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [idLote, i.fila, i.datos ? JSON.stringify(i.datos) : null, i.identificacion, i.nombre ?? i.nombreArchivo, i.valor, i.cobrado, i.novedad, i.idCredito, i.resultado, i.detalle, pagoId]
  );
}

type LoteRow = {
  id_lote: number; id_empresa: number; empresa: string; id_cuenta_cobro: number; consecutivo: string; periodo: string; nombre_archivo: string | null; fecha_giro: string;
  valor_girado: string; total_archivo: string; total_aplicado: string; filas: number; pagos: number; estado: string; motivo_reverso: string | null; fec_creacion: string; usuario: string | null;
};
const LOTE_SELECT = `select l.id_lote, l.id_empresa, e.v_razon_social as empresa, l.id_cuenta_cobro, cc.consecutivo, l.periodo, l.nombre_archivo, to_char(l.fecha_giro, 'YYYY-MM-DD') as fecha_giro,
    l.valor_girado, l.total_archivo, l.total_aplicado, l.filas, l.pagos, l.estado, l.motivo_reverso, l.fec_creacion, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
  from "Creditos"."TBL_RECAUDO_LOTES" l
  inner join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = l.id_empresa
  inner join "Creditos"."TBL_CUENTAS_COBRO" cc on cc.id_cuenta_cobro = l.id_cuenta_cobro
  left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = l.id_usuario`;
const mapLote = (l: LoteRow) => ({
  id: l.id_lote, codigo: 'L-' + String(l.id_lote).padStart(4, '0'), empresaId: l.id_empresa, empresa: l.empresa, cuentaCobroId: l.id_cuenta_cobro, consecutivo: l.consecutivo,
  periodo: l.periodo, nombreArchivo: l.nombre_archivo, fechaGiro: l.fecha_giro, valorGirado: num(l.valor_girado), totalArchivo: num(l.total_archivo),
  totalAplicado: num(l.total_aplicado), filas: l.filas, pagos: l.pagos, estado: l.estado, motivoReverso: l.motivo_reverso, fecha: l.fec_creacion, usuario: l.usuario
});

export async function listarLotes(periodo: string) {
  assertPeriodo(periodo);
  await ensureRecaudo();
  const r = await pool.query<LoteRow>(`${LOTE_SELECT} where l.periodo = $1 order by l.id_lote desc`, [periodo]);
  return r.rows.map(mapLote);
}

export async function getLote(id: number) {
  await ensureRecaudo();
  const r = await pool.query<LoteRow>(`${LOTE_SELECT} where l.id_lote = $1`, [id]);
  if (!r.rowCount) throw new SecurityError('Lote no encontrado', 404);
  const filas = await pool.query(
    `select id_lote_fila, fila, identificacion, nombre, valor, cobrado, novedad, id_credito, resultado, detalle, id_credito_pago, resuelta, revisada
     from "Creditos"."TBL_RECAUDO_LOTE_FILAS" where id_lote = $1 order by fila nulls last, id_lote_fila`, [id]);
  return {
    ...mapLote(r.rows[0]),
    items: filas.rows.map((f) => ({
      id: f.id_lote_fila, fila: f.fila, identificacion: f.identificacion, nombre: f.nombre, valor: num(f.valor), cobrado: f.cobrado == null ? null : num(f.cobrado),
      novedad: f.novedad, idCredito: f.id_credito, resultado: f.resultado, detalle: f.detalle, pagoId: f.id_credito_pago, resuelta: f.resuelta, revisada: f.revisada
    }))
  };
}

export async function reversarLote(id: number, motivo: string, usuarioId: number | null) {
  await ensureRecaudo();
  await tx(async (client) => {
    const l = await client.query<{ periodo: string; estado: string; id_cuenta_cobro: number; total_aplicado: string }>(
      'select periodo, estado, id_cuenta_cobro, total_aplicado from "Creditos"."TBL_RECAUDO_LOTES" where id_lote = $1 for update', [id]);
    if (!l.rowCount) throw new SecurityError('Lote no encontrado', 404);
    if (l.rows[0].estado !== 'APLICADO') throw new SecurityError('El lote ya fue reversado', 409);
    await assertPeriodoAbierto(l.rows[0].periodo, client);
    const pagos = await client.query<{ id_credito_pago: number }>(
      'select id_credito_pago from "Creditos"."TBL_RECAUDO_LOTE_FILAS" where id_lote = $1 and id_credito_pago is not null order by id_lote_fila desc', [id]);
    for (const p of pagos.rows) await reversarPagoCreditoTx(client, p.id_credito_pago, { observacion: `Reverso del lote L-${String(id).padStart(4, '0')}: ${motivo}`, usuarioId });
    await client.query(
      `update "Creditos"."TBL_RECAUDO_LOTES" set estado = 'REVERSADO', motivo_reverso = $2, id_usuario_reverso = $3, fecha_reverso = now() where id_lote = $1`, [id, motivo, usuarioId]);
    await client.query(
      `update "Creditos"."TBL_CUENTAS_COBRO"
       set recibido = greatest(0, recibido - $2), estado = case when envios > 0 then 'ENVIADA' else 'GENERADA' end
       where id_cuenta_cobro = $1`, [l.rows[0].id_cuenta_cobro, num(l.rows[0].total_aplicado)]);
  });
  return getLote(id);
}

async function filaEnRevision(client: Db, filaId: number) {
  const r = await client.query<{ id_lote: number; periodo: string; estado: string; resultado: string; resuelta: boolean; valor: string; id_cuenta_cobro: number; identificacion: string }>(
    `select f.id_lote, l.periodo, l.estado, f.resultado, f.resuelta, f.valor, l.id_cuenta_cobro, f.identificacion
     from "Creditos"."TBL_RECAUDO_LOTE_FILAS" f inner join "Creditos"."TBL_RECAUDO_LOTES" l on l.id_lote = f.id_lote
     where f.id_lote_fila = $1 for update of f`, [filaId]);
  const f = r.rows[0];
  if (!f) throw new SecurityError('Fila no encontrada', 404);
  if (f.estado !== 'APLICADO' || !RESULTADOS_REVISION.has(f.resultado as never) || f.resuelta) throw new SecurityError('Esta fila no está pendiente de revisión', 409);
  await assertPeriodoAbierto(f.periodo, client);
  return f;
}

/** Money received that matches no credit: kept as "saldo por identificar" so the period can close. */
export async function dejarPorIdentificar(filaId: number) {
  await tx(async (client) => {
    await filaEnRevision(client, filaId);
    await client.query('update "Creditos"."TBL_RECAUDO_LOTE_FILAS" set resuelta = true where id_lote_fila = $1', [filaId]);
  });
  return { ok: true };
}

/** Applies a row in review to a credit chosen by the user. */
export async function asignarFila(filaId: number, creditoId: number, usuarioId: number | null) {
  const idLote = await tx(async (client) => {
    const f = await filaEnRevision(client, filaId);
    const cred = await client.query('select 1 from "Creditos"."TBL_CREDITOS" where id_credito = $1', [creditoId]);
    if (!cred.rowCount) throw new SecurityError('Crédito no encontrado', 404);
    const lote = await client.query<{ fecha_giro: string }>(`select to_char(fecha_giro, 'YYYY-MM-DD') as fecha_giro from "Creditos"."TBL_RECAUDO_LOTES" where id_lote = $1`, [f.id_lote]);
    const r = await aplicarPagoCreditoTx(client, creditoId, {
      fechaPago: lote.rows[0].fecha_giro, valorPago: num(f.valor), medioPago: 'NOMINA', tipoRecaudo: 'NOMINA', periodoNomina: f.periodo,
      referenciaPago: `LOTE-${f.id_lote}`, observacion: `Pago sin identificar (cédula ${f.identificacion}) asignado manualmente`, usuarioId
    });
    await client.query('update "Creditos"."TBL_RECAUDO_LOTE_FILAS" set resuelta = true, id_credito = $2, id_credito_pago = $3 where id_lote_fila = $1', [filaId, creditoId, r.pagoId]);
    await client.query('update "Creditos"."TBL_RECAUDO_LOTES" set total_aplicado = total_aplicado + $2, pagos = pagos + 1 where id_lote = $1', [f.id_lote, num(f.valor)]);
    await client.query('update "Creditos"."TBL_CUENTAS_COBRO" set recibido = recibido + $2 where id_cuenta_cobro = $1', [f.id_cuenta_cobro, num(f.valor)]);
    return f.id_lote;
  });
  return getLote(idLote);
}

export async function marcarNovedadesRevisadas(periodo: string) {
  assertPeriodo(periodo);
  await assertPeriodoAbierto(periodo);
  const r = await pool.query(
    `update "Creditos"."TBL_RECAUDO_LOTE_FILAS" f set revisada = true
     from "Creditos"."TBL_RECAUDO_LOTES" l
     where l.id_lote = f.id_lote and l.periodo = $1 and l.estado = 'APLICADO' and f.resultado = 'NOVEDAD' and not f.revisada`, [periodo]);
  return { revisadas: r.rowCount ?? 0 };
}

/* ---------- Monthly close ---------- */

type ResumenCuenta = { pagadas: number; conSaldo: number; arrastre: number; reclamar: number; novedades: number; favor: number };

async function resumenCuentas(client: Db, periodo: string) {
  const cuentas = await client.query<CuentaRow & { empresa: string }>(
    `select cc.*, to_char(cc.fecha_limite_giro, 'YYYY-MM-DD') as fecha_limite_giro, e.v_razon_social as empresa
     from "Creditos"."TBL_CUENTAS_COBRO" cc inner join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = cc.id_empresa
     where cc.periodo = $1 and cc.estado <> 'ANULADA' order by e.v_razon_social`, [periodo]);
  const filas = await client.query<{ id_cuenta_cobro: number; resultado: string; valor: string; cobrado: string | null }>(
    `select l.id_cuenta_cobro, f.resultado, f.valor, f.cobrado
     from "Creditos"."TBL_RECAUDO_LOTE_FILAS" f inner join "Creditos"."TBL_RECAUDO_LOTES" l on l.id_lote = f.id_lote
     where l.periodo = $1 and l.estado = 'APLICADO'`, [periodo]);
  return cuentas.rows.map((c) => {
    let r: ResumenCuenta | null = null;
    if (c.estado === 'NO_GIRO') {
      r = { pagadas: 0, conSaldo: 0, arrastre: num(c.total), reclamar: num(c.total), novedades: 0, favor: 0 };
    } else if (c.estado === 'CONCILIADA' || c.estado === 'CONCILIADA_PARCIAL') {
      r = { pagadas: 0, conSaldo: 0, arrastre: 0, reclamar: 0, novedades: 0, favor: 0 };
      for (const f of filas.rows.filter((x) => x.id_cuenta_cobro === c.id_cuenta_cobro)) {
        const valor = num(f.valor), cobrado = num(f.cobrado);
        if (f.resultado === 'COMPLETO') r.pagadas++;
        else if (f.resultado === 'EXCEDENTE') { r.pagadas++; r.favor += valor - cobrado; }
        else if (f.resultado === 'PARCIAL') { r.conSaldo++; r.arrastre += cobrado - valor; }
        else if (f.resultado === 'NOVEDAD') { r.conSaldo++; r.arrastre += cobrado; r.novedades++; }
        else if (f.resultado === 'CERO' || f.resultado === 'FALTANTE') { r.conSaldo++; r.arrastre += cobrado; r.reclamar += cobrado; }
      }
    }
    return { cuenta: { ...mapCuenta(c), empresa: c.empresa }, resumen: r };
  });
}

export async function estadoCierre(periodo: string) {
  assertPeriodo(periodo);
  await ensureRecaudo();
  const general = await resumenPeriodo(periodo);
  const cuentas = await resumenCuentas(pool, periodo);
  const revision = await pool.query<{ id_lote_fila: number; id_lote: number; identificacion: string; nombre: string | null; valor: string; detalle: string | null; empresa: string }>(
    `select f.id_lote_fila, f.id_lote, f.identificacion, f.nombre, f.valor, f.detalle, e.v_razon_social as empresa
     from "Creditos"."TBL_RECAUDO_LOTE_FILAS" f
     inner join "Creditos"."TBL_RECAUDO_LOTES" l on l.id_lote = f.id_lote
     inner join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = l.id_empresa
     where l.periodo = $1 and l.estado = 'APLICADO' and f.resultado in ('NO_ENCONTRADO', 'DUPLICADO') and not f.resuelta
     order by f.id_lote, f.fila`, [periodo]);
  const novedades = await pool.query<{ pendientes: number; total: number }>(
    `select count(*) filter (where not f.revisada)::int as pendientes, count(*)::int as total
     from "Creditos"."TBL_RECAUDO_LOTE_FILAS" f inner join "Creditos"."TBL_RECAUDO_LOTES" l on l.id_lote = f.id_lote
     where l.periodo = $1 and l.estado = 'APLICADO' and f.resultado = 'NOVEDAD'`, [periodo]);
  const porIdentificar = await pool.query<{ valor: string }>(
    `select coalesce(sum(f.valor), 0) as valor from "Creditos"."TBL_RECAUDO_LOTE_FILAS" f inner join "Creditos"."TBL_RECAUDO_LOTES" l on l.id_lote = f.id_lote
     where l.periodo = $1 and l.estado = 'APLICADO' and f.resultado in ('NO_ENCONTRADO', 'DUPLICADO') and f.resuelta and f.id_credito_pago is null`, [periodo]);
  const cierre = await pool.query('select * from "Creditos"."TBL_RECAUDO_CIERRES" where periodo = $1', [periodo]);

  const sinCuenta = general.empresas.filter((e) => !e.cuenta).map((e) => ({ id: e.id, nombre: e.nombre }));
  const sinEnviar = cuentas.filter((c) => c.cuenta.estado === 'GENERADA').map((c) => ({ id: c.cuenta.id, empresaId: c.cuenta.empresaId, nombre: c.cuenta.empresa, consecutivo: c.cuenta.consecutivo }));
  const sinPago = cuentas.filter((c) => !c.resumen).map((c) => ({ id: c.cuenta.id, empresaId: c.cuenta.empresaId, nombre: c.cuenta.empresa, consecutivo: c.cuenta.consecutivo }));
  const sinVencer = cuentas.filter((c) => c.cuenta.fechaLimiteGiro >= hoy()).map((c) => ({ nombre: c.cuenta.empresa, fechaLimiteGiro: c.cuenta.fechaLimiteGiro }));
  const nov = novedades.rows[0];
  const sum = (k: keyof ResumenCuenta) => round(cuentas.reduce((s, c) => s + (c.resumen?.[k] ?? 0), 0));
  return {
    periodo, nombre: nombrePeriodo(periodo), siguiente: periodoSiguiente(periodo),
    cierre: cierre.rows[0] ? { estado: cierre.rows[0].estado, fecha: cierre.rows[0].fecha_cierre, totales: cierre.rows[0].totales, motivoReapertura: cierre.rows[0].motivo_reapertura } : null,
    chequeos: {
      sinCuenta, sinEnviar, sinPago,
      revision: revision.rows.map((r) => ({ id: r.id_lote_fila, lote: 'L-' + String(r.id_lote).padStart(4, '0'), identificacion: r.identificacion, nombre: r.nombre, valor: num(r.valor), detalle: r.detalle, empresa: r.empresa })),
      novedadesPendientes: nov.pendientes, novedadesTotal: nov.total,
      sinVencer
    },
    listo: !sinCuenta.length && !sinEnviar.length && !sinPago.length && !revision.rowCount && !nov.pendientes,
    totales: {
      recaudado: round(cuentas.reduce((s, c) => s + c.cuenta.recibido, 0)),
      cuotasPagadas: sum('pagadas'), cuotasConSaldo: sum('conSaldo'), arrastre: sum('arrastre'), reclamar: sum('reclamar'), saldoFavor: sum('favor'),
      porIdentificar: num(porIdentificar.rows[0].valor)
    },
    cuentas: cuentas.map((c) => ({ ...c.cuenta, resumen: c.resumen }))
  };
}

const rangoMora = (dias: number) => (dias <= 0 ? 'AL_DIA' : dias <= 30 ? '1-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '90+');

export async function cerrarPeriodo(periodo: string, usuarioId: number | null) {
  const estado = await estadoCierre(periodo);
  if (estado.cierre?.estado === 'CERRADO') throw new SecurityError(`${estado.nombre} ya está cerrado`, 409);
  if (!estado.listo) throw new SecurityError('Hay pendientes antes de cerrar. Revisa la lista de Cierre del mes.', 409);
  if (!estado.cuentas.length) throw new SecurityError(`${estado.nombre} no tiene cuentas de cobro: no hay nada que cerrar.`, 409);
  await tx(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext('recaudo-cierre-' || $1))`, [periodo]);
    await assertPeriodoAbierto(periodo, client);
    const creditos = await client.query<{ id_credito: number; id_empresa: number }>(
      `select distinct d.id_credito, cc.id_empresa from "Creditos"."TBL_CUENTA_COBRO_DETALLE" d
       inner join "Creditos"."TBL_CUENTAS_COBRO" cc on cc.id_cuenta_cobro = d.id_cuenta_cobro
       where cc.periodo = $1 and cc.estado <> 'ANULADA'`, [periodo]);
    for (const c of creditos.rows) await recalcularMoraCredito(client, c.id_credito);
    const cierre = await client.query<{ id_cierre: number }>(
      `insert into "Creditos"."TBL_RECAUDO_CIERRES" (periodo, estado, totales, id_usuario, fecha_cierre)
       values ($1, 'CERRADO', $2, $3, now())
       on conflict (periodo) do update set estado = 'CERRADO', totales = excluded.totales, id_usuario = excluded.id_usuario, fecha_cierre = now()
       returning id_cierre`, [periodo, JSON.stringify(estado.totales), usuarioId]);
    const idCierre = cierre.rows[0].id_cierre;
    await client.query('delete from "Creditos"."TBL_RECAUDO_CIERRE_CARTERA" where id_cierre = $1', [idCierre]);
    // Portfolio snapshot at period end: balances and days past due per credit.
    await client.query(
      `insert into "Creditos"."TBL_RECAUDO_CIERRE_CARTERA" (id_cierre, id_credito, id_empresa, saldo_capital, saldo_pendiente, cuotas_vencidas, dias_mora, rango_mora)
       select $1, q.id_credito, max(c.id_empresa),
              coalesce(sum(greatest(0, q.capital - q.capital_pagado)), 0),
              coalesce(sum(q.valor_cuota + q.valor_mora - q.valor_pagado) filter (where q.estado <> 'PAGADA'), 0),
              (count(*) filter (where q.estado <> 'PAGADA' and q.fecha_vencimiento <= $3::date))::int,
              coalesce(max(q.dias_mora) filter (where q.estado <> 'PAGADA'), 0),
              'AL_DIA'
       from "Creditos"."TBL_CREDITO_CUOTAS" q inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       where q.id_credito = any($2::int[])
       group by q.id_credito`, [idCierre, creditos.rows.map((c) => c.id_credito), finDePeriodo(periodo)]);
    const cartera = await client.query<{ id_cierre_cartera: number; dias_mora: number }>('select id_cierre_cartera, dias_mora from "Creditos"."TBL_RECAUDO_CIERRE_CARTERA" where id_cierre = $1', [idCierre]);
    for (const r of cartera.rows) await client.query('update "Creditos"."TBL_RECAUDO_CIERRE_CARTERA" set rango_mora = $2 where id_cierre_cartera = $1', [r.id_cierre_cartera, rangoMora(r.dias_mora)]);
  });

  // Next month's notices, ready to review and send. A company with nothing due next month is skipped.
  const siguiente = periodoSiguiente(periodo);
  const borradores: Array<{ empresa: string; consecutivo?: string; error?: string }> = [];
  for (const c of estado.cuentas) {
    try {
      const nueva = await generarCuentaCobro({ empresaId: c.empresaId, periodo: siguiente, usuarioId });
      borradores.push({ empresa: c.empresa, consecutivo: nueva.consecutivo });
    } catch (err) {
      borradores.push({ empresa: c.empresa, error: err instanceof Error ? err.message : 'No se pudo generar' });
    }
  }
  return { ...(await estadoCierre(periodo)), borradores };
}

export async function reabrirPeriodo(periodo: string, motivo: string, usuarioId: number | null) {
  assertPeriodo(periodo);
  await ensureRecaudo();
  await tx(async (client) => {
    const c = await client.query<{ id_cierre: number; estado: string }>('select id_cierre, estado from "Creditos"."TBL_RECAUDO_CIERRES" where periodo = $1 for update', [periodo]);
    if (c.rows[0]?.estado !== 'CERRADO') throw new SecurityError(`${nombrePeriodo(periodo)} no está cerrado`, 409);
    await client.query(
      `update "Creditos"."TBL_RECAUDO_CIERRES" set estado = 'REABIERTO', motivo_reapertura = $2, fecha_reapertura = now(), id_usuario_reapertura = $3 where id_cierre = $1`,
      [c.rows[0].id_cierre, motivo, usuarioId]);
    await client.query('delete from "Creditos"."TBL_RECAUDO_CIERRE_CARTERA" where id_cierre = $1', [c.rows[0].id_cierre]);
    // Next-month notices that nobody sent or paid yet are regenerated at the next close.
    await client.query(
      `update "Creditos"."TBL_CUENTAS_COBRO" cc set estado = 'ANULADA', motivo_anulacion = $2
       where cc.periodo = $1 and cc.estado = 'GENERADA' and cc.envios = 0
         and not exists (select 1 from "Creditos"."TBL_RECAUDO_LOTES" l where l.id_cuenta_cobro = cc.id_cuenta_cobro)`,
      [periodoSiguiente(periodo), `Reapertura de ${nombrePeriodo(periodo)}: ${motivo}`]);
  });
  return estadoCierre(periodo);
}
