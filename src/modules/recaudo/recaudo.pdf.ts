import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { letras } from './recaudo.logic.js';

export type CuentaCobroPdf = {
  consecutivo: string;
  periodoNombre: string;
  fechaEmision: string;
  fechaPagoNomina: string;
  fechaLimiteGiro: string;
  emisor: { nombre: string; nit: string | null; correo: string | null; telefono: string | null; logo: { mime: string; contenido: Buffer } | null };
  empresa: { nombre: string; nit: string | null; contacto: string | null; correo: string | null };
  cuentaGiro: { banco: string; tipo: string; numero: string; titular: string | null } | null;
  detalle: Array<{ identificacion: string; nombre: string; credito: string; numeroCuota: number; totalCuotas: number; cuotasPendientes: number; valorCuota: number; mora: number; total: number; saldoCapital: number }>;
  total: number;
};

const NAVY = rgb(0.078, 0.196, 0.361);
const GOLD = rgb(0.54, 0.42, 0.16);
const INK = rgb(0.07, 0.1, 0.16);
const MUTED = rgb(0.35, 0.4, 0.47);
const LINE = rgb(0.87, 0.89, 0.93);
const BAND = rgb(0.96, 0.97, 0.98);

// Standard PDF fonts only encode WinAnsi; anything outside Latin-1 would throw.
const latin = (s: string | null | undefined) => String(s ?? '').replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '?');
const money = (n: number) => '$ ' + Math.round(n).toLocaleString('es-CO');
const fecha = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

function fit(font: PDFFont, text: string, size: number, max: number) {
  let t = latin(text);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > max) t = t.slice(0, -1);
  return t + '...';
}
function wrap(font: PDFFont, text: string, size: number, max: number) {
  const words = latin(text).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(next, size) > max && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Collection notice for one payroll office and period: A4 landscape, header repeated on every page. */
export async function generarPdfCuentaCobro(c: CuentaCobroPdf): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cuenta de cobro ${c.consecutivo}`);
  pdf.setAuthor(latin(c.emisor.nombre));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try {
    if (c.emisor.logo?.mime === 'image/png') logo = await pdf.embedPng(c.emisor.logo.contenido);
    else if (c.emisor.logo?.mime === 'image/jpeg') logo = await pdf.embedJpg(c.emisor.logo.contenido);
  } catch { logo = null; } // WEBP or a broken file: fall back to the name only

  const W = 842, H = 595, M = 36, right = W - M;
  const cols = [
    { t: 'Identificación', w: 88, num: true }, { t: 'Empleado', w: 190 }, { t: 'Crédito', w: 72 }, { t: 'Cuota', w: 62, num: true },
    { t: 'Valor cuota', w: 86, num: true }, { t: 'Mora', w: 70, num: true }, { t: 'Total a descontar', w: 100, num: true }, { t: 'Saldo capital', w: 96, num: true }
  ];
  const tableW = cols.reduce((s, x) => s + x.w, 0);
  const txt = (p: PDFPage, s: string, x: number, y: number, size = 9, f = font, color = INK) => p.drawText(latin(s), { x, y, size, font: f, color });
  const txtR = (p: PDFPage, s: string, xr: number, y: number, size = 9, f = font, color = INK) => p.drawText(latin(s), { x: xr - f.widthOfTextAtSize(latin(s), size), y, size, font: f, color });

  const pages: PDFPage[] = [];
  const header = (p: PDFPage) => {
    let x = M;
    if (logo) {
      const h = 34, w = Math.min(120, (logo.width / logo.height) * h);
      p.drawImage(logo, { x, y: H - M - h, width: w, height: h });
      x += w + 10;
    }
    txt(p, fit(bold, c.emisor.nombre, 15, 330), x, H - M - 14, 15, bold);
    txt(p, [c.emisor.nit ? `NIT ${c.emisor.nit}` : null, c.emisor.correo, c.emisor.telefono].filter(Boolean).join('  ·  '), x, H - M - 28, 8.5, font, MUTED);
    txtR(p, 'CUENTA DE COBRO', right, H - M - 8, 8.5, bold, GOLD);
    txtR(p, c.consecutivo, right, H - M - 26, 18, bold);
    txtR(p, `Emitida el ${fecha(c.fechaEmision)}`, right, H - M - 38, 8.5, font, MUTED);
    p.drawLine({ start: { x: M, y: H - M - 46 }, end: { x: right, y: H - M - 46 }, thickness: 1.5, color: NAVY });
    return H - M - 46;
  };
  const tableHead = (p: PDFPage, y: number) => {
    p.drawRectangle({ x: M, y: y - 18, width: tableW, height: 18, color: BAND });
    let x = M;
    for (const col of cols) {
      if (col.num) txtR(p, col.t, x + col.w - 6, y - 12, 7.5, bold, MUTED); else txt(p, col.t, x + 6, y - 12, 7.5, bold, MUTED);
      x += col.w;
    }
    return y - 18;
  };

  // Page 1: parties and summary.
  let page = pdf.addPage([W, H]);
  pages.push(page);
  let y = header(page) - 18;
  const bloques: Array<[string, string[]]> = [
    ['PAGADURÍA', [c.empresa.nombre, c.empresa.nit ? `NIT ${c.empresa.nit}` : '', c.empresa.contacto ?? '', c.empresa.correo ?? ''].filter(Boolean)],
    ['PERIODO DE NÓMINA', [c.periodoNombre, `Pago de nómina: ${fecha(c.fechaPagoNomina)}`]],
    ['GIRAR A', c.cuentaGiro
      ? [`${c.cuentaGiro.banco} · ${c.cuentaGiro.tipo}`, `No. ${c.cuentaGiro.numero}`, c.cuentaGiro.titular ? `Titular: ${c.cuentaGiro.titular}` : '', `Fecha límite de giro: ${fecha(c.fechaLimiteGiro)}`].filter(Boolean)
      : ['Cuenta por confirmar con el área de cartera', `Fecha límite de giro: ${fecha(c.fechaLimiteGiro)}`]]
  ];
  const colW = (right - M) / 3;
  bloques.forEach(([titulo, lineas], i) => {
    const x = M + i * colW;
    txt(page, titulo, x, y, 7.5, bold, MUTED);
    lineas.forEach((l, j) => txt(page, fit(j === 0 ? bold : font, l, 9.5, colW - 16), x, y - 14 - j * 12, 9.5, j === 0 ? bold : font));
  });
  y -= 14 + 4 * 12 + 8;
  const empleados = new Set(c.detalle.map((d) => d.identificacion)).size;
  page.drawRectangle({ x: M, y: y - 26, width: right - M, height: 26, color: BAND });
  txt(page, `Empleados: ${empleados}`, M + 12, y - 17, 10, bold);
  txt(page, `Créditos: ${c.detalle.length}`, M + 140, y - 17, 10, bold);
  txtR(page, `Total a descontar: ${money(c.total)}`, right - 12, y - 17, 11, bold, NAVY);
  y -= 26 + 14;
  y = tableHead(page, y);

  for (const d of c.detalle) {
    if (y < M + 40) {
      page = pdf.addPage([W, H]);
      pages.push(page);
      y = tableHead(page, header(page) - 14);
    }
    const valores = [
      d.identificacion, d.nombre, d.credito,
      d.cuotasPendientes > 1 ? `${d.numeroCuota}/${d.totalCuotas} (+${d.cuotasPendientes - 1})` : `${d.numeroCuota}/${d.totalCuotas}`,
      money(d.valorCuota), d.mora ? money(d.mora) : '-', money(d.total), money(d.saldoCapital)
    ];
    let x = M;
    cols.forEach((col, i) => {
      const f = i === 6 ? bold : font;
      if (col.num) txtR(page, fit(f, valores[i], 8.5, col.w - 8), x + col.w - 6, y - 12, 8.5, f); else txt(page, fit(f, valores[i], 8.5, col.w - 10), x + 6, y - 12, 8.5, f);
      x += col.w;
    });
    page.drawLine({ start: { x: M, y: y - 17 }, end: { x: M + tableW, y: y - 17 }, thickness: 0.5, color: LINE });
    y -= 17;
  }

  // Totals, amount in words and remittance notes (need ~90pt).
  if (y < M + 100) { page = pdf.addPage([W, H]); pages.push(page); y = header(page) - 20; }
  page.drawLine({ start: { x: M, y: y - 2 }, end: { x: M + tableW, y: y - 2 }, thickness: 1.2, color: NAVY });
  txt(page, 'TOTAL', M + 6, y - 15, 9.5, bold);
  const xTotal = M + cols.slice(0, 7).reduce((s, col) => s + col.w, 0);
  txtR(page, money(c.total), xTotal - 6, y - 15, 9.5, bold);
  y -= 34;
  for (const l of wrap(font, `Son: ${letras(c.total)} M/CTE.`, 9.5, right - M)) { txt(page, l, M, y, 9.5, bold); y -= 13; }
  y -= 6;
  const notas = [
    'Responda con el archivo de descuentos aplicados: identificación, número de crédito, valor descontado y código de novedad cuando no se descuente.',
    'Según el artículo 6 de la Ley 1527 de 2012, el empleador gira lo descontado dentro de los 3 días hábiles siguientes al pago de la nómina.'
  ];
  for (const n of notas) for (const l of wrap(font, n, 8.5, right - M)) { txt(page, l, M, y, 8.5, font, MUTED); y -= 11; }

  pages.forEach((p, i) => txtR(p, `${c.consecutivo} · Página ${i + 1} de ${pages.length}`, right, M - 14, 7.5, font, MUTED));
  return Buffer.from(await pdf.save());
}
