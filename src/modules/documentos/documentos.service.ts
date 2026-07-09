import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

export const documentVariables = [
  { key: 'credito.consecutivo', label: 'Consecutivo del credito' },
  { key: 'credito.monto', label: 'Monto solicitado' },
  { key: 'credito.monto_letras', label: 'Monto en letras' },
  { key: 'credito.plazo', label: 'Plazo en meses' },
  { key: 'credito.tasa', label: 'Tasa del credito' },
  { key: 'credito.cuota', label: 'Cuota estimada' },
  { key: 'credito.fecha', label: 'Fecha de radicacion' },
  { key: 'cliente.nombre_completo', label: 'Nombre del cliente' },
  { key: 'cliente.identificacion', label: 'Identificacion del cliente' },
  { key: 'cliente.correo', label: 'Correo del cliente' },
  { key: 'cliente.telefono', label: 'Telefono del cliente' },
  { key: 'empresa.razon_social', label: 'Empresa o pagaduria' },
  { key: 'libranzera.razon_social', label: 'Libranzera' },
  { key: 'producto.nombre', label: 'Producto de credito' }
];

export async function listTemplates() {
  const result = await pool.query(`
    select p.id_plantilla_documento as id, p.codigo, p.nombre, p.descripcion,
      p.tipo_documento as "tipoDocumento", p.modo_plantilla as "modoPlantilla", p.estado,
      count(v.id_version_plantilla)::int as versiones,
      max(v.numero_version)::int as "ultimaVersion"
    from "Creditos"."TBL_PLANTILLAS_DOCUMENTO" p
    left join "Creditos"."TBL_VERSIONES_PLANTILLA" v on v.id_plantilla_documento = p.id_plantilla_documento
    group by p.id_plantilla_documento order by p.orden, p.nombre
  `);
  return result.rows;
}

export async function getTemplate(id: number) {
  const result = await pool.query(
    `select p.id_plantilla_documento as id, p.codigo, p.nombre, p.descripcion,
      p.tipo_documento as "tipoDocumento", p.modo_plantilla as "modoPlantilla", p.estado,
      v.id_version_plantilla as "idVersion", v.numero_version as version,
      v.contenido, v.variables, v.estado as "estadoVersion"
     from "Creditos"."TBL_PLANTILLAS_DOCUMENTO" p
     left join lateral (
       select * from "Creditos"."TBL_VERSIONES_PLANTILLA"
       where id_plantilla_documento = p.id_plantilla_documento
       order by numero_version desc limit 1
     ) v on true where p.id_plantilla_documento = $1`,
    [id]
  );
  if (!result.rowCount) throw new SecurityError('Plantilla no encontrada', 404);
  return result.rows[0];
}

export async function createTemplate(input: {
  codigo: string; nombre: string; descripcion?: string | null; tipoDocumento: string; contenido: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const template = await client.query<{ id: number }>(
      `insert into "Creditos"."TBL_PLANTILLAS_DOCUMENTO"
        (codigo, nombre, descripcion, tipo_documento, estado)
       values (upper($1), $2, $3, upper($4), 'BORRADOR')
       returning id_plantilla_documento as id`,
      [input.codigo.trim(), input.nombre.trim(), input.descripcion?.trim() || null, input.tipoDocumento.trim()]
    );
    await client.query(
      `insert into "Creditos"."TBL_VERSIONES_PLANTILLA"
        (id_plantilla_documento, numero_version, contenido, variables)
       values ($1, 1, $2, $3::jsonb)`,
      [template.rows[0].id, input.contenido, JSON.stringify(extractVariables(input.contenido))]
    );
    await client.query('commit');
    return getTemplate(template.rows[0].id);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTemplateVersion(id: number, contenido: string, publish: boolean) {
  const result = await pool.query<{ id_version_plantilla: number }>(
    `insert into "Creditos"."TBL_VERSIONES_PLANTILLA"
      (id_plantilla_documento, numero_version, contenido, variables, estado, fec_vigencia)
     select $1, coalesce(max(numero_version), 0) + 1, $2, $3::jsonb,
       $4::varchar, case when $4::varchar = 'PUBLICADA' then current_date else null end
     from "Creditos"."TBL_VERSIONES_PLANTILLA" where id_plantilla_documento = $1
     returning id_version_plantilla`,
    [id, contenido, JSON.stringify(extractVariables(contenido)), publish ? 'PUBLICADA' : 'BORRADOR']
  );
  if (publish) {
    await pool.query(
      `update "Creditos"."TBL_PLANTILLAS_DOCUMENTO" set estado = 'PUBLICADA', fec_actualizacion = now()
       where id_plantilla_documento = $1`,
      [id]
    );
  }
  return { idVersion: result.rows[0].id_version_plantilla };
}

export async function generateDocument(templateId: number, creditoId: number) {
  const [template, dataResult] = await Promise.all([
    getPublishedOrLatestVersion(templateId),
    pool.query(
      `select c.consecutivo, c.val_monto_solicitado, c.num_plazo, c.val_tasa, c.val_cuota_estimada,
        c.fec_radicacion, c.v_nombre_cliente, c.v_identificacion_cliente, c.v_correo_cliente,
        c.v_telefono_cliente, e.v_razon_social as empresa, l.v_razon_social as libranzera,
        p.nombre as producto
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       left join "Creditos"."TBL_LIBRANZERAS" l on l.id_libranzera = c.id_libranzera
       where c.id_credito = $1`,
      [creditoId]
    )
  ]);
  if (!dataResult.rowCount) throw new SecurityError('Credito no encontrado', 404);
  const row = dataResult.rows[0];
  const variables: Record<string, string> = {
    'credito.consecutivo': row.consecutivo,
    'credito.monto': money(row.val_monto_solicitado),
    'credito.monto_letras': `${money(row.val_monto_solicitado)} PESOS COLOMBIANOS`,
    'credito.plazo': String(row.num_plazo),
    'credito.tasa': row.val_tasa ? `${row.val_tasa}%` : 'No aplica',
    'credito.cuota': money(row.val_cuota_estimada),
    'credito.fecha': new Date(row.fec_radicacion).toLocaleDateString('es-CO'),
    'cliente.nombre_completo': row.v_nombre_cliente,
    'cliente.identificacion': row.v_identificacion_cliente,
    'cliente.correo': row.v_correo_cliente || '',
    'cliente.telefono': row.v_telefono_cliente || '',
    'empresa.razon_social': row.empresa || '',
    'libranzera.razon_social': row.libranzera || '',
    'producto.nombre': row.producto
  };
  const rendered = renderTemplate(template.contenido, variables);
  const pdf = /<[a-z][\s\S]*>/i.test(rendered)
    ? await createRichPdf(template.nombre, rendered)
    : await createTextPdf(template.nombre, rendered);
  const hash = crypto.createHash('sha256').update(pdf).digest('hex');
  const fileName = `${template.codigo}-${row.consecutivo}.pdf`;
  const created = await pool.query<{ id: number }>(
    `insert into "Creditos"."TBL_DOCUMENTOS_GENERADOS"
      (id_credito, id_version_plantilla, nombre_archivo, contenido_pdf, variables_usadas, hash_documento)
     values ($1, $2, $3, $4, $5::jsonb, $6) returning id_documento_generado as id`,
    [creditoId, template.idVersion, fileName, Buffer.from(pdf), JSON.stringify(variables), hash]
  );
  return { id: created.rows[0].id, fileName, hash };
}

export async function getGeneratedDocument(id: number) {
  const result = await pool.query<{ nombre_archivo: string; contenido_pdf: Buffer }>(
    `select nombre_archivo, contenido_pdf from "Creditos"."TBL_DOCUMENTOS_GENERADOS"
     where id_documento_generado = $1`,
    [id]
  );
  if (!result.rowCount) throw new SecurityError('Documento generado no encontrado', 404);
  return result.rows[0];
}

export async function savePdfBase(templateId: number, fileName: string, content: Buffer) {
  await getTemplate(templateId);
  const pdf = await PDFDocument.load(content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  await pool.query(
    `insert into "Creditos"."TBL_PDF_BASE_PLANTILLA"
      (id_plantilla_documento, nombre_archivo, contenido_pdf, hash_archivo, numero_paginas)
     values ($1, $2, $3, $4, $5)
     on conflict (id_plantilla_documento) do update set
       nombre_archivo = excluded.nombre_archivo, contenido_pdf = excluded.contenido_pdf,
       hash_archivo = excluded.hash_archivo, numero_paginas = excluded.numero_paginas, fec_carga = now()`,
    [templateId, fileName, content, hash, pdf.getPageCount()]
  );
  await pool.query(
    `update "Creditos"."TBL_PLANTILLAS_DOCUMENTO"
     set modo_plantilla = 'PDF_BASE', fec_actualizacion = now() where id_plantilla_documento = $1`,
    [templateId]
  );
  return { fileName, hash, pages: pdf.getPageCount() };
}

export async function getPdfBase(templateId: number) {
  const result = await pool.query<{ nombre_archivo: string; contenido_pdf: Buffer; numero_paginas: number }>(
    `select nombre_archivo, contenido_pdf, numero_paginas
     from "Creditos"."TBL_PDF_BASE_PLANTILLA" where id_plantilla_documento = $1`,
    [templateId]
  );
  if (!result.rowCount) throw new SecurityError('La plantilla no tiene PDF base', 404);
  return result.rows[0];
}

export async function listPdfFields(templateId: number) {
  const result = await pool.query(
    `select id_campo_pdf as id, variable, etiqueta, tipo_campo as tipo,
      pagina, pos_x::float as x, pos_y::float as y, ancho::float as ancho,
      alto::float as alto, tamano_fuente::float as "tamanoFuente",
      alineacion, valor_fijo as "valorFijo"
     from "Creditos"."TBL_CAMPOS_PDF_PLANTILLA"
     where id_plantilla_documento = $1 order by pagina, pos_y, pos_x`,
    [templateId]
  );
  return result.rows;
}

export async function replacePdfFields(templateId: number, fields: Array<{
  variable: string; etiqueta: string; tipo: string; pagina: number;
  x: number; y: number; ancho: number; alto: number; tamanoFuente: number;
}>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      'delete from "Creditos"."TBL_CAMPOS_PDF_PLANTILLA" where id_plantilla_documento = $1',
      [templateId]
    );
    for (const field of fields) {
      await client.query(
        `insert into "Creditos"."TBL_CAMPOS_PDF_PLANTILLA"
          (id_plantilla_documento, variable, etiqueta, tipo_campo, pagina, pos_x, pos_y, ancho, alto, tamano_fuente)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [templateId, field.variable, field.etiqueta, field.tipo, field.pagina,
          field.x, field.y, field.ancho, field.alto, field.tamanoFuente]
      );
    }
    await client.query('commit');
    return listPdfFields(templateId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function generateFromPdfBase(templateId: number, creditoId: number) {
  const [base, fields, template, dataResult] = await Promise.all([
    getPdfBase(templateId),
    listPdfFields(templateId),
    getPublishedOrLatestVersion(templateId),
    pool.query(
      `select c.consecutivo, c.val_monto_solicitado, c.num_plazo, c.val_tasa, c.val_cuota_estimada,
        c.fec_radicacion, c.v_nombre_cliente, c.v_identificacion_cliente, c.v_correo_cliente,
        c.v_telefono_cliente, e.v_razon_social as empresa, l.v_razon_social as libranzera,
        p.nombre as producto
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       left join "Creditos"."TBL_LIBRANZERAS" l on l.id_libranzera = c.id_libranzera
       where c.id_credito = $1`,
      [creditoId]
    )
  ]);
  if (!dataResult.rowCount) throw new SecurityError('Credito no encontrado', 404);
  const row = dataResult.rows[0];
  const variables: Record<string, string> = {
    'credito.consecutivo': row.consecutivo,
    'credito.monto': money(row.val_monto_solicitado),
    'credito.monto_letras': `${money(row.val_monto_solicitado)} PESOS COLOMBIANOS`,
    'credito.plazo': String(row.num_plazo),
    'credito.tasa': row.val_tasa ? `${row.val_tasa}%` : '',
    'credito.cuota': money(row.val_cuota_estimada),
    'credito.fecha': new Date(row.fec_radicacion).toLocaleDateString('es-CO'),
    'cliente.nombre_completo': row.v_nombre_cliente,
    'cliente.identificacion': row.v_identificacion_cliente,
    'cliente.correo': row.v_correo_cliente || '',
    'cliente.telefono': row.v_telefono_cliente || '',
    'empresa.razon_social': row.empresa || '',
    'libranzera.razon_social': row.libranzera || '',
    'producto.nombre': row.producto
  };
  const pdf = await PDFDocument.load(base.contenido_pdf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const field of fields as Array<{ variable: string; tipo: string; pagina: number; x: number; y: number; tamanoFuente: number }>) {
    const page = pdf.getPage(field.pagina - 1);
    if (!page) continue;
    const value = variables[field.variable] ?? '';
    const text = field.tipo === 'CASILLA' ? (['SI', 'TRUE', '1'].includes(value.toUpperCase()) ? 'X' : '') : value;
    page.drawText(text, {
      x: field.x * page.getWidth(),
      y: page.getHeight() - (field.y * page.getHeight()) - field.tamanoFuente,
      size: field.tamanoFuente,
      font,
      color: rgb(0.05, 0.12, 0.2)
    });
  }
  const bytes = await pdf.save();
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const fileName = `${template.codigo}-${row.consecutivo}.pdf`;
  const created = await pool.query<{ id: number }>(
    `insert into "Creditos"."TBL_DOCUMENTOS_GENERADOS"
      (id_credito, id_version_plantilla, nombre_archivo, contenido_pdf, variables_usadas, hash_documento)
     values ($1,$2,$3,$4,$5::jsonb,$6) returning id_documento_generado as id`,
    [creditoId, template.idVersion, fileName, Buffer.from(bytes), JSON.stringify(variables), hash]
  );
  return { id: created.rows[0].id, fileName, hash };
}

function extractVariables(content: string) {
  return [...new Set([...content.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1]))];
}

function renderTemplate(content: string, variables: Record<string, string>) {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

function money(value: string | number | null) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(Number(value ?? 0));
}

async function getPublishedOrLatestVersion(id: number) {
  const result = await pool.query(
    `select p.codigo, p.nombre, v.id_version_plantilla as "idVersion", v.contenido
     from "Creditos"."TBL_PLANTILLAS_DOCUMENTO" p
     inner join lateral (
       select * from "Creditos"."TBL_VERSIONES_PLANTILLA"
       where id_plantilla_documento = p.id_plantilla_documento
       order by (estado = 'PUBLICADA') desc, numero_version desc limit 1
     ) v on true where p.id_plantilla_documento = $1`,
    [id]
  );
  if (!result.rowCount) throw new SecurityError('Plantilla sin versiones', 404);
  return result.rows[0] as { codigo: string; nombre: string; idVersion: number; contenido: string };
}

async function createTextPdf(title: string, content: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595;
  const height = 842;
  const margin = 52;
  const fontSize = 10;
  const lineHeight = 15;
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  page.drawText(title, { x: margin, y, size: 15, font: bold, color: rgb(0.08, 0.25, 0.43) });
  y -= 30;
  for (const paragraph of content.split(/\r?\n/)) {
    if (paragraph === '\f') {
      page = pdf.addPage([width, height]);
      y = height - margin;
      continue;
    }
    const lines = wrapText(paragraph, 92);
    for (const line of lines.length ? lines : ['']) {
      if (y < margin) {
        page = pdf.addPage([width, height]);
        y = height - margin;
      }
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.12, 0.15) });
      y -= lineHeight;
    }
    y -= 5;
  }
  return pdf.save();
}

async function createRichPdf(title: string, html: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595;
  const height = 842;
  const margin = 48;
  const contentWidth = width - (margin * 2);
  let page = pdf.addPage([width, height]);
  let y = height - margin;
  const blocks = parseHtmlBlocks(html);
  const hasHeading = blocks.some((block) => block.type === 'h1');

  if (!hasHeading) {
    page.drawText(title, { x: margin, y, size: 15, font: bold, color: rgb(0.08, 0.25, 0.43) });
    y -= 30;
  }

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };

  for (const block of blocks) {
    if (block.type === 'page-break') {
      newPage();
      continue;
    }
    const size = block.type === 'h1' ? 15 : block.type === 'h2' ? 12 : 10;
    const selectedFont = block.type === 'h1' || block.type === 'h2' ? bold : font;
    const lineHeight = size * 1.45;
    const lines = wrapByWidth(block.text, selectedFont, size, contentWidth);
    const blockHeight = lines.length * lineHeight;
    const usablePageHeight = height - (margin * 2);
    if (blockHeight <= usablePageHeight && y - blockHeight < margin) newPage();

    for (let index = 0; index < lines.length; index++) {
      if (y < margin) newPage();
      const line = lines[index];
      const lineWidth = selectedFont.widthOfTextAtSize(line, size);
      const alignment = block.type === 'h1' ? 'center' : block.align;
      if (alignment === 'justify' && index < lines.length - 1 && line.includes(' ')) {
        drawJustifiedLine(page, line, margin, y, contentWidth, selectedFont, size);
      } else {
        const x = alignment === 'center'
          ? margin + ((contentWidth - lineWidth) / 2)
          : alignment === 'right'
            ? margin + contentWidth - lineWidth
            : margin;
        page.drawText(line, { x, y, size, font: selectedFont, color: rgb(0.08, 0.1, 0.13) });
      }
      y -= lineHeight;
    }
    y -= block.type === 'p' ? 6 : 12;
  }
  return pdf.save();
}

function parseHtmlBlocks(html: string) {
  const normalized = html
    .replace(/<hr[^>]*>/gi, '<page-break></page-break>')
    .replace(/<br\s*\/?>/gi, '\n');
  const blocks: Array<{ type: 'h1' | 'h2' | 'p' | 'page-break'; text: string; align: 'left' | 'center' | 'right' | 'justify' }> = [];
  const pattern = /<(h1|h2|p|li|page-break)([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of normalized.matchAll(pattern)) {
    if (match[1].toLowerCase() === 'page-break') {
      blocks.push({ type: 'page-break', text: '', align: 'left' });
      continue;
    }
    const tag = match[1].toLowerCase();
    const style = match[2] ?? '';
    const alignment = /text-align:\s*(center|right|justify)/i.exec(style)?.[1]?.toLowerCase();
    const text = decodeHtml(match[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    blocks.push({
      type: tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'p',
      text: tag === 'li' ? `- ${text}` : text,
      align: alignment === 'center' || alignment === 'right' || alignment === 'justify' ? alignment : 'left'
    });
  }
  return blocks.length ? blocks : [{ type: 'p' as const, text: htmlToPdfText(html), align: 'left' as const }];
}

function wrapByWidth(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawJustifiedLine(
  page: ReturnType<PDFDocument['addPage']>,
  line: string,
  x: number,
  y: number,
  width: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number
) {
  const words = line.split(' ');
  const wordsWidth = words.reduce((sum, word) => sum + font.widthOfTextAtSize(word, size), 0);
  const spacing = (width - wordsWidth) / Math.max(words.length - 1, 1);
  let cursor = x;
  for (const word of words) {
    page.drawText(word, { x: cursor, y, size, font, color: rgb(0.08, 0.1, 0.13) });
    cursor += font.widthOfTextAtSize(word, size) + spacing;
  }
}

function wrapText(value: string, max: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function htmlToPdfText(value: string) {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value;
  return decodeHtml(value
    .replace(/<hr[^>]*>/gi, '\n\f\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|div|blockquote)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
