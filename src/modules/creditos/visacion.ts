import crypto from 'node:crypto';
import { pool } from '../../lib/db.js';
import { isMailConfigured, sendMail } from '../../lib/mailer.js';
import { createTextPdf } from '../documentos/documentos.service.js';
import { SecurityError } from '../security/security.service.js';
import { assertEtapaAbierta, decodeArchivo } from './soportes-cliente.js';

export type DatosVisacion = {
  consecutivo: string;
  empresa: string;
  nit: string;
  trabajador: string;
  cedula: string;
  cargo: string;
  tipoContrato: string;
  monto: number;
  cuota: number;
  plazo: number;
  representante: string;
  telefonoEmpresa: string;
  correoEmpresa: string;
};

export type ExtrasVisacion = {
  ciudad: string;
  entidadFinanciera: string;
  entidadOperadora: string;
  firmanteNombre: string;
  firmanteCargo: string;
};

const esVisacion = (key: string) => key.includes('APROB') || key.includes('COMITE') || key.includes('VISACION');

const money = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

const fechaLarga = (date: Date) => date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const dato = (value: string | null | undefined, placeholder: string) => (value && value.trim() ? value.trim() : placeholder);

/** Formal letter the employer signs to approve the payroll deduction (Ley 1527 de 2012). */
export function construirCartaVisacion(datos: DatosVisacion, extras: ExtrasVisacion, fecha = new Date()) {
  return [
    `${dato(extras.ciudad, '[Ciudad]')}, ${fechaLarga(fecha)}`,
    '',
    'Señores:',
    dato(extras.entidadFinanciera, '[Entidad financiera]'),
    'Ciudad',
    '',
    'Asunto: Aprobación y autorización de descuento por libranza',
    '',
    'Respetados señores:',
    `Por medio de la presente, la empresa ${dato(datos.empresa, '[Razón social]')} con NIT ${dato(datos.nit, '[NIT]')}, identificada como pagadora, se permite manifestar su APROBACIÓN para la aplicación del descuento por libranza del crédito solicitado por nuestro(a) trabajador(a):`,
    '',
    `•  Nombre completo del trabajador: ${dato(datos.trabajador, '[Nombre]')}`,
    `•  Cédula de Ciudadanía: ${dato(datos.cedula, '[Cédula]')}`,
    `•  Cargo que desempeña: ${dato(datos.cargo, '[Cargo]')}`,
    `•  Tipo de contrato: ${dato(datos.tipoContrato, '[Tipo de contrato]')}`,
    `•  Valor total del préstamo: ${money(datos.monto)}`,
    `•  Valor de la cuota mensual: ${money(datos.cuota)}`,
    `•  Plazo en meses: ${datos.plazo}`,
    '',
    `De conformidad con la Ley 1527 de 2012, nuestra empresa se compromete a efectuar el descuento mensual de la cuota mencionada directamente de la nómina del trabajador y a girar dichos recursos a favor de ${dato(extras.entidadOperadora, '[Entidad operadora]')}, siempre y cuando el trabajador mantenga vínculo laboral con nuestra compañía y no se supere el límite legal de afectación del salario.`,
    '',
    'Así mismo, anexamos a la presente la autorización escrita, expresa e irrevocable debidamente firmada por el trabajador, autorizando dichos descuentos.',
    '',
    'Atentamente,',
    '',
    '______________________________________',
    dato(extras.firmanteNombre, '[Nombre del representante legal o persona autorizada]'),
    dato(extras.firmanteCargo, '[Cargo]'),
    dato(datos.empresa, '[Empresa]'),
    [datos.telefonoEmpresa, datos.correoEmpresa].filter(Boolean).join(' · ') || '[Teléfono y correo de contacto]'
  ].join('\n');
}

let visacionesTablaLista = false;
export async function ensureVisacionesTable() {
  if (visacionesTablaLista) return;
  await pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_VISACIONES" (
      id_credito_visacion serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      destinatario varchar(320) not null,
      copia varchar(320) null,
      datos jsonb not null,
      nombre_archivo varchar(240) not null,
      contenido_pdf bytea not null,
      hash_documento varchar(64) not null,
      enviado boolean not null,
      detalle_envio text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
  visacionesTablaLista = true;
}

export async function getDatosVisacion(creditoId: number) {
  const result = await pool.query<{
    consecutivo: string; nombre: string; identificacion: string; monto: string; plazo: number; cuota: string | null;
    monto_aprobado: string | null; plazo_aprobado: number | null; cuota_aprobada: string | null;
    empresa: string | null; nit: string | null; representante: string | null; telefono: string | null;
    correo: string | null; contacto_correo: string | null; correo_representante: string | null; ciudad: string | null;
    cargo: string | null; tipo_contrato: string | null; libranzera: string | null;
  }>(
    `select c.consecutivo, c.v_nombre_cliente as nombre, c.v_identificacion_cliente as identificacion,
       c.val_monto_solicitado as monto, c.num_plazo as plazo, c.val_cuota_estimada as cuota,
       d.monto_aprobado, d.plazo_aprobado, d.cuota_aprobada,
       e.v_razon_social as empresa, e.v_nit as nit, e.v_representante_legal as representante, e.v_telefono as telefono,
       e.v_correo as correo, e.v_contacto_correo as contacto_correo, e.v_correo_representante as correo_representante,
       e.v_camara_ciudad as ciudad,
       coalesce(cp.v_cargo, emp.v_cargo) as cargo,
       coalesce(tc.des_tipo_contrato, tce.des_tipo_contrato) as tipo_contrato,
       l.v_razon_social as libranzera
     from "Creditos"."TBL_CREDITOS" c
     left join lateral (
       select monto_aprobado, plazo_aprobado, cuota_aprobada from "Creditos"."TBL_CREDITO_DECISIONES"
       where id_credito = c.id_credito and decision = 'APROBADO' order by fec_creacion desc limit 1
     ) d on true
     left join "Creditos"."TBL_CLIENTES_PORTAL" cp on cp.v_identificacion = c.v_identificacion_cliente
     left join "Creditos"."TBL_EMPLEADOS_EMPRESA" emp on emp.id_empleado_empresa = c.id_empleado_empresa
     left join "Creditos"."TBL_TIPO_CONTRATO" tc on tc.id_tipo_contrato = cp.id_tipo_contrato
     left join "Creditos"."TBL_TIPO_CONTRATO" tce on tce.id_tipo_contrato = emp.id_tipo_contrato
     left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = coalesce(c.id_empresa, cp.id_empresa, emp.id_empresa)
     left join "Creditos"."TBL_LIBRANZERAS" l on l.id_libranzera = c.id_libranzera
     where c.id_credito = $1`,
    [creditoId]
  ).catch(async (error) => {
    // TBL_CREDITO_DECISIONES is created lazily; a credit that never had a decision may not have it yet.
    if (String(error?.message).includes('TBL_CREDITO_DECISIONES')) throw new SecurityError('Registra primero la decisión del crédito', 400);
    throw error;
  });
  if (!result.rowCount) throw new SecurityError('Credito no encontrado', 404);
  const r = result.rows[0];
  const datos: DatosVisacion = {
    consecutivo: r.consecutivo,
    empresa: r.empresa ?? '',
    nit: r.nit ?? '',
    trabajador: r.nombre ?? '',
    cedula: r.identificacion ?? '',
    cargo: r.cargo ?? '',
    tipoContrato: r.tipo_contrato ?? '',
    monto: Number(r.monto_aprobado ?? r.monto ?? 0),
    cuota: Number(r.cuota_aprobada ?? r.cuota ?? 0),
    plazo: Number(r.plazo_aprobado ?? r.plazo ?? 0),
    representante: r.representante ?? '',
    telefonoEmpresa: r.telefono ?? '',
    correoEmpresa: r.contacto_correo || r.correo || r.correo_representante || ''
  };
  const faltantes = [
    !datos.empresa && 'empresa del trabajador',
    !datos.nit && 'NIT de la empresa',
    !datos.cargo && 'cargo del trabajador',
    !datos.tipoContrato && 'tipo de contrato',
    !datos.correoEmpresa && 'correo de la empresa'
  ].filter(Boolean) as string[];
  return {
    datos,
    usaDecision: r.monto_aprobado != null,
    faltantes,
    sugerencias: {
      para: datos.correoEmpresa,
      ciudad: r.ciudad ?? '',
      entidadFinanciera: r.libranzera ?? '',
      entidadOperadora: r.libranzera ?? '',
      firmanteNombre: datos.representante,
      firmanteCargo: 'Representante Legal'
    }
  };
}

async function generarPdf(creditoId: number, extras: ExtrasVisacion) {
  const { datos } = await getDatosVisacion(creditoId);
  const texto = construirCartaVisacion(datos, extras);
  const pdf = Buffer.from(await createTextPdf('', texto));
  return { datos, pdf, nombreArchivo: `Carta-visacion-${datos.consecutivo}.pdf` };
}

export async function previewCartaVisacion(creditoId: number, extras: ExtrasVisacion) {
  return generarPdf(creditoId, extras);
}

/** Latest signed payroll-deduction authorization uploaded for the credit, attached as the letter's annex. */
async function autorizacionFirmada(creditoId: number) {
  const result = await pool.query<{ nombre_archivo: string; mime_type: string; contenido: Buffer }>(
    `select a.nombre_archivo, a.mime_type, a.contenido
     from "Creditos"."TBL_CREDITO_DOCUMENTOS" cd
     inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = cd.id_documento_credito
     inner join "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS" a on a.id_credito_documento = cd.id_credito_documento
     where cd.id_credito = $1 and upper(d.des_documento) like '%AUTORIZACION%'
     order by a.fec_creacion desc limit 1`,
    [creditoId]
  ).catch(() => ({ rows: [] as Array<{ nombre_archivo: string; mime_type: string; contenido: Buffer }> }));
  return result.rows[0] ?? null;
}

export async function enviarCartaVisacion(
  creditoId: number,
  input: { para: string; copia?: string | null; mensaje?: string | null; extras: ExtrasVisacion; usuarioId?: number | null }
) {
  await assertEtapaAbierta(creditoId, esVisacion, 'enviar otra carta de visación');
  await ensureVisacionesTable();
  const { datos, pdf, nombreArchivo } = await generarPdf(creditoId, input.extras);
  const anexo = await autorizacionFirmada(creditoId);
  const nota = input.mensaje?.trim();
  const texto = [
    `Respetados señores de ${datos.empresa || 'la empresa'}:`,
    '',
    `Adjuntamos la carta de aprobación y autorización de descuento por libranza del crédito ${datos.consecutivo} solicitado por su trabajador(a) ${datos.trabajador}, identificado(a) con cédula ${datos.cedula}.`,
    'Les agradecemos revisarla, firmarla en papel membrete de la empresa y devolverla respondiendo a este correo.',
    ...(nota ? ['', nota] : []),
    ...(anexo ? ['', 'También adjuntamos la autorización de descuento firmada por el trabajador.'] : []),
    '',
    'Cordialmente,',
    input.extras.entidadOperadora || 'Equipo de crédito'
  ].join('\n');
  const html = texto.split('\n').map((line) => (line ? `<p style="margin:0 0 8px">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '<br>')).join('');

  let enviado = false;
  let detalle: string;
  if (!isMailConfigured()) {
    detalle = 'El servidor no tiene configurado el correo (SMTP). La carta quedó generada para descargarla y enviarla manualmente.';
  } else {
    try {
      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [{ filename: nombreArchivo, content: pdf, contentType: 'application/pdf' }];
      if (anexo) attachments.push({ filename: anexo.nombre_archivo, content: anexo.contenido, contentType: anexo.mime_type });
      const res = await sendMail({
        to: input.para,
        cc: input.copia || undefined,
        subject: `Visación de libranza · Crédito ${datos.consecutivo} · ${datos.trabajador}`,
        text: texto,
        html,
        attachments
      });
      enviado = res.sent;
      detalle = enviado ? `Enviada a ${input.para}${input.copia ? ` (copia ${input.copia})` : ''}` : 'No se pudo enviar el correo';
    } catch (error) {
      detalle = `Error enviando el correo: ${error instanceof Error ? error.message : 'desconocido'}`;
    }
  }

  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_VISACIONES"
      (id_credito, destinatario, copia, datos, nombre_archivo, contenido_pdf, hash_documento, enviado, detalle_envio, id_usuario)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      creditoId, input.para, input.copia || null, JSON.stringify({ ...datos, ...input.extras }), nombreArchivo, pdf,
      crypto.createHash('sha256').update(pdf).digest('hex'), enviado, detalle, input.usuarioId ?? null
    ]
  );
  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (id_credito, accion, observacion, id_usuario)
     values ($1, 'CARTA_VISACION', $2, $3)`,
    [creditoId, detalle, input.usuarioId ?? null]
  ).catch(() => undefined); // history is informative; the letter itself is already stored

  return { enviado, detalle, visaciones: await listVisaciones(creditoId) };
}

export async function listVisaciones(creditoId: number) {
  await ensureVisacionesTable();
  const result = await pool.query<{
    id_credito_visacion: number; destinatario: string; copia: string | null; nombre_archivo: string;
    enviado: boolean; detalle_envio: string | null; fec_creacion: string; usuario: string | null;
  }>(
    `select v.id_credito_visacion, v.destinatario, v.copia, v.nombre_archivo, v.enviado, v.detalle_envio, v.fec_creacion,
       coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
     from "Creditos"."TBL_CREDITO_VISACIONES" v
     left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = v.id_usuario
     where v.id_credito = $1 order by v.fec_creacion desc`,
    [creditoId]
  );
  return result.rows.map((row) => ({
    id: row.id_credito_visacion,
    destinatario: row.destinatario,
    copia: row.copia,
    nombreArchivo: row.nombre_archivo,
    enviado: row.enviado,
    detalle: row.detalle_envio,
    fecha: row.fec_creacion,
    usuario: row.usuario
  }));
}

export async function getVisacionPdf(visacionId: number) {
  await ensureVisacionesTable();
  const result = await pool.query<{ nombre_archivo: string; contenido_pdf: Buffer }>(
    'select nombre_archivo, contenido_pdf from "Creditos"."TBL_CREDITO_VISACIONES" where id_credito_visacion = $1',
    [visacionId]
  );
  if (!result.rowCount) throw new SecurityError('Carta no encontrada', 404);
  return result.rows[0];
}

/* ── Aprobación de la empresa ──────────────────────────────────────────────
 * Flow for payroll loans (libranza): letter sent to the employer → employer approves (date + who,
 * optional signed letter) → only then the credit documents go to the client for signature. */

let aprobacionTablaLista: Promise<void> | null = null;
function ensureAprobacionEmpresaTable() {
  aprobacionTablaLista ??= pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_APROBACION_EMPRESA" (
      id_aprobacion_empresa serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      fecha_aprobacion date not null,
      aprobado_por varchar(200) not null,
      cargo varchar(120) null,
      observacion text null,
      nombre_archivo varchar(240) null,
      mime_type varchar(120) null,
      contenido bytea null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `).then(() => undefined).catch((err) => { aprobacionTablaLista = null; throw err; });
  return aprobacionTablaLista;
}

export async function requiereAprobacionEmpresa(creditoId: number) {
  const r = await pool.query<{ tipo: string | null }>(
    `select tc.des_tipo_credito as tipo
     from "Creditos"."TBL_CREDITOS" c
     inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
     left join "Creditos"."TBL_TIPOS_CREDITO" tc on tc.id_tipo_credito = p.id_tipo_credito
     where c.id_credito = $1`,
    [creditoId]
  );
  return /libranza/i.test(r.rows[0]?.tipo ?? '');
}

export async function getAprobacionEmpresa(creditoId: number) {
  await ensureAprobacionEmpresaTable();
  const r = await pool.query<{
    id_aprobacion_empresa: number; fecha_aprobacion: string; aprobado_por: string; cargo: string | null;
    observacion: string | null; nombre_archivo: string | null; fec_creacion: string; usuario: string | null;
  }>(
    `select a.id_aprobacion_empresa, a.fecha_aprobacion::text, a.aprobado_por, a.cargo, a.observacion, a.nombre_archivo,
       a.fec_creacion, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
     from "Creditos"."TBL_CREDITO_APROBACION_EMPRESA" a
     left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = a.id_usuario
     where a.id_credito = $1 order by a.fec_creacion desc limit 1`,
    [creditoId]
  );
  const row = r.rows[0];
  return row ? {
    id: row.id_aprobacion_empresa,
    fechaAprobacion: row.fecha_aprobacion,
    aprobadoPor: row.aprobado_por,
    cargo: row.cargo,
    observacion: row.observacion,
    nombreArchivo: row.nombre_archivo,
    fechaRegistro: row.fec_creacion,
    usuario: row.usuario
  } : null;
}

export async function registrarAprobacionEmpresa(
  creditoId: number,
  input: {
    fechaAprobacion: string; aprobadoPor: string; cargo?: string | null; observacion?: string | null;
    archivo?: { nombre: string; mimeType: string; base64: string } | null; usuarioId?: number | null;
  }
) {
  await ensureVisacionesTable();
  await ensureAprobacionEmpresaTable();
  await assertEtapaAbierta(creditoId, esVisacion, 'registrar la aprobación de la empresa');
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaAprobacion) || input.fechaAprobacion > hoy) {
    throw new SecurityError('La fecha de aprobación de la empresa no puede ser futura', 400);
  }
  const carta = await pool.query('select 1 from "Creditos"."TBL_CREDITO_VISACIONES" where id_credito = $1 limit 1', [creditoId]);
  if (!carta.rowCount) throw new SecurityError('Primero envía la carta de visación a la empresa', 400);
  const archivo = input.archivo ? decodeArchivo(input.archivo) : null;

  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_APROBACION_EMPRESA"
      (id_credito, fecha_aprobacion, aprobado_por, cargo, observacion, nombre_archivo, mime_type, contenido, id_usuario)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [creditoId, input.fechaAprobacion, input.aprobadoPor.trim(), input.cargo?.trim() || null, input.observacion?.trim() || null,
      archivo?.nombre ?? null, archivo?.mimeType ?? null, archivo?.buffer ?? null, input.usuarioId ?? null]
  );
  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (id_credito, accion, observacion, id_usuario) values ($1, 'APROBACION_EMPRESA', $2, $3)`,
    [creditoId, `Empresa aprobó el ${input.fechaAprobacion}: ${input.aprobadoPor.trim()}${input.cargo?.trim() ? ` (${input.cargo.trim()})` : ''}`, input.usuarioId ?? null]
  ).catch(() => undefined);
  return getAprobacionEmpresa(creditoId);
}

export async function getAprobacionEmpresaArchivo(aprobacionId: number) {
  await ensureAprobacionEmpresaTable();
  const r = await pool.query<{ nombre_archivo: string | null; mime_type: string | null; contenido: Buffer | null }>(
    'select nombre_archivo, mime_type, contenido from "Creditos"."TBL_CREDITO_APROBACION_EMPRESA" where id_aprobacion_empresa = $1',
    [aprobacionId]
  );
  const row = r.rows[0];
  if (!row?.contenido) throw new SecurityError('Soporte no encontrado', 404);
  return { nombre: row.nombre_archivo ?? 'aprobacion-empresa', mimeType: row.mime_type ?? 'application/octet-stream', contenido: row.contenido };
}

/** Payroll loans cannot go to the client for signature (or close Visación) until the employer approved. */
export async function assertAprobacionEmpresa(creditoId: number, accion: string) {
  if (!(await requiereAprobacionEmpresa(creditoId))) return;
  if (!(await getAprobacionEmpresa(creditoId))) {
    throw new SecurityError(`Antes de ${accion} registra la aprobación de la empresa en Visación`, 409);
  }
}
