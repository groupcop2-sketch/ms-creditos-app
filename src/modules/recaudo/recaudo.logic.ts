/** Pure logic of payroll collection: file parsing, reconciliation, amounts in words, payroll dates. No DB. */

export type PlantillaArchivo = {
  separador: string; // ';' | ',' | '|' | 'tab'
  filaEncabezado: number;
  mapeo: Record<string, CampoArchivo | ''>;
  novedades: Record<string, string>;
};
export type CampoArchivo = 'identificacion' | 'valor' | 'credito' | 'nombre' | 'novedad' | 'periodo' | 'fecha';

export type FilaArchivo = { fila: number; identificacion: string; valor: number; credito: string | null; nombre: string; novedad: string; datos: Record<string, string> };
export type ErrorFila = { fila: number; motivo: string };

export type DetalleCobro = { idCredito: number; consecutivo: string; identificacion: string; nombre: string; total: number };

export type Resultado = 'COMPLETO' | 'PARCIAL' | 'EXCEDENTE' | 'NOVEDAD' | 'CERO' | 'FALTANTE' | 'NO_ENCONTRADO' | 'DUPLICADO';
export type FilaConciliada = {
  fila: number | null;
  identificacion: string;
  nombreArchivo: string | null;
  idCredito: number | null;
  consecutivo: string | null;
  nombre: string | null;
  cobrado: number | null;
  valor: number;
  novedad: string | null;
  resultado: Resultado;
  detalle: string;
  datos: Record<string, string> | null;
};

export const RESULTADOS_APLICABLES: ReadonlySet<Resultado> = new Set(['COMPLETO', 'PARCIAL', 'EXCEDENTE']);
export const RESULTADOS_REVISION: ReadonlySet<Resultado> = new Set(['NO_ENCONTRADO', 'DUPLICADO']);

const round = (n: number) => Math.round(n * 100) / 100;
const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** Accepts 1.234.567,89 · 1,234,567.89 · 1234567.89 · 312.400 (thousands) · $ 312.400. */
export function parseMoney(raw: unknown): number {
  let s = String(raw ?? '').trim().replace(/[$\s]/g, '');
  if (!s) return Number.NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (ld > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

const sep = (p: PlantillaArchivo) => (p.separador === 'tab' ? '\t' : p.separador);

/** Splits one line honoring double quotes (Excel exports quote fields that contain the separator). */
function splitLinea(line: string, separador: string) {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
    else if (ch === separador && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function encabezados(texto: string, p: Pick<PlantillaArchivo, 'separador' | 'filaEncabezado'>) {
  const lines = texto.replace(/^﻿/, '').split(/\r?\n/);
  return splitLinea(lines[Math.max(0, p.filaEncabezado - 1)] ?? '', sep(p as PlantillaArchivo)).filter(Boolean);
}

export function validarPlantilla(p: PlantillaArchivo): string | null {
  const usados = Object.values(p.mapeo);
  for (const [campo, nombre] of [['identificacion', 'Identificación'], ['valor', 'Valor descontado']] as const) {
    const n = usados.filter((v) => v === campo).length;
    if (n !== 1) return `${nombre} debe estar en exactamente una columna (hoy en ${n})`;
  }
  return null;
}

export function parseArchivo(texto: string, p: PlantillaArchivo) {
  const lines = texto.replace(/^﻿/, '').split(/\r?\n/);
  const hi = Math.max(0, p.filaEncabezado - 1);
  const errores: ErrorFila[] = [];
  const filas: FilaArchivo[] = [];
  if (lines.length <= hi || !lines[hi].trim()) return { encabezados: [] as string[], filas, errores: [{ fila: hi + 1, motivo: 'No se encontró la fila de encabezados' }] };
  const headers = splitLinea(lines[hi], sep(p));
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLinea(lines[i], sep(p));
    const datos: Record<string, string> = {};
    const campos: Partial<Record<CampoArchivo, string>> = {};
    headers.forEach((h, j) => {
      datos[h] = cells[j] ?? '';
      const campo = p.mapeo[h];
      if (campo) campos[campo] = cells[j] ?? '';
    });
    const fila = i + 1;
    const identificacion = soloDigitos(campos.identificacion ?? '');
    // Rows with no ID and no value are footers (totals, signatures): skip silently.
    if (!identificacion && !campos.valor?.trim()) continue;
    if (!identificacion) { errores.push({ fila, motivo: 'Sin identificación' }); continue; }
    const valor = parseMoney(campos.valor);
    if (!Number.isFinite(valor) || valor < 0) { errores.push({ fila, motivo: `Valor no válido: "${campos.valor ?? ''}"` }); continue; }
    filas.push({
      fila, identificacion, valor: round(valor),
      credito: campos.credito?.trim() || null,
      nombre: campos.nombre?.trim() ?? '',
      novedad: (campos.novedad ?? '').trim().toUpperCase(),
      datos
    });
  }
  return { encabezados: headers, filas, errores };
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

/**
 * Matches each file row with the frozen collection detail. When an employee has several credits and the
 * row carries no credit number, the oldest credit (lowest id) is used first, per Ley 1527 art. 6 order.
 */
export function conciliar(detalle: DetalleCobro[], filas: FilaArchivo[], novedades: Record<string, string>): FilaConciliada[] {
  const ordenado = [...detalle].sort((a, b) => a.idCredito - b.idCredito);
  const usados = new Set<number>();
  const out: FilaConciliada[] = [];
  const mismoCredito = (d: DetalleCobro, ref: string) => {
    const r = ref.trim().toUpperCase();
    return d.consecutivo.toUpperCase() === r || String(d.idCredito) === r || soloDigitos(d.consecutivo) === soloDigitos(r);
  };
  for (const f of filas) {
    const delEmpleado = ordenado.filter((d) => d.identificacion === f.identificacion);
    const base = { fila: f.fila, identificacion: f.identificacion, nombreArchivo: f.nombre || null, valor: f.valor, novedad: f.novedad || null, datos: f.datos };
    const d = f.credito
      ? delEmpleado.find((x) => mismoCredito(x, f.credito!))
      : delEmpleado.find((x) => !usados.has(x.idCredito)) ?? delEmpleado[0];
    if (!d) {
      out.push({ ...base, idCredito: null, consecutivo: null, nombre: null, cobrado: null, resultado: 'NO_ENCONTRADO',
        detalle: f.credito && delEmpleado.length ? `El crédito ${f.credito} no es de esta identificación en la cuenta de cobro` : 'Sin crédito en la cuenta de cobro de esta empresa' });
      continue;
    }
    const cred = { idCredito: d.idCredito, consecutivo: d.consecutivo, nombre: d.nombre, cobrado: d.total };
    if (usados.has(d.idCredito)) { out.push({ ...base, ...cred, resultado: 'DUPLICADO', detalle: 'Ese crédito ya viene en otra fila' }); continue; }
    usados.add(d.idCredito);
    let resultado: Resultado, detalle = '';
    if (f.valor === 0) {
      resultado = f.novedad ? 'NOVEDAD' : 'CERO';
      detalle = f.novedad ? (novedades[f.novedad] ?? `Código ${f.novedad} sin equivalencia`) : 'Descontó $0 sin novedad: diferencia a reclamar';
    } else if (f.valor < round(d.total)) { resultado = 'PARCIAL'; detalle = `Falta ${money(d.total - f.valor)}; queda pendiente para el próximo cobro`; }
    else if (f.valor > round(d.total)) { resultado = 'EXCEDENTE'; detalle = `${money(f.valor - d.total)} queda como saldo a favor`; }
    else resultado = 'COMPLETO';
    out.push({ ...base, ...cred, resultado, detalle });
  }
  for (const d of ordenado) {
    if (usados.has(d.idCredito)) continue;
    out.push({ fila: null, identificacion: d.identificacion, nombreArchivo: null, idCredito: d.idCredito, consecutivo: d.consecutivo, nombre: d.nombre,
      cobrado: d.total, valor: 0, novedad: null, resultado: 'FALTANTE', detalle: 'No viene en el archivo: diferencia a reclamar', datos: null });
  }
  return out;
}

/* ---------- Amount in Spanish words (collection notice) ---------- */
const U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function hasta999(n: number) {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100), r = n % 100, out: string[] = [];
  if (h) out.push(C[h]);
  if (r && r < 30) out.push(U[r]);
  else if (r) out.push(D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : ''));
  return out.join(' ');
}
const apocope = (s: string) => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
export function letras(valor: number) {
  const n = Math.round(valor);
  if (n === 0) return 'CERO PESOS';
  const milMillones = Math.floor(n / 1e9), mm = Math.floor((n % 1e9) / 1e6), mil = Math.floor((n % 1e6) / 1000), resto = n % 1000, out: string[] = [];
  if (milMillones) out.push((milMillones === 1 ? 'mil' : apocope(hasta999(milMillones)) + ' mil') + (mm ? '' : ' millones'));
  if (mm) out.push(milMillones ? apocope(hasta999(mm)) + ' millones' : mm === 1 ? 'un millón' : apocope(hasta999(mm)) + ' millones');
  if (mil) out.push(mil === 1 ? 'mil' : apocope(hasta999(mil)) + ' mil');
  if (resto) out.push(apocope(hasta999(resto)));
  return (out.join(' ') + ((milMillones || mm) && !mil && !resto ? ' de pesos' : ' pesos')).toUpperCase();
}

/* ---------- Payroll dates ---------- */
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function finDePeriodo(periodo: string) {
  const [y, m] = periodo.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m, 0)));
}
export function periodoSiguiente(periodo: string) {
  const [y, m] = periodo.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
/** Pay day of the period from the company calendar (default: last day). Weekend → previous Friday when ajustar. */
export function fechaPagoNomina(periodo: string, diaPago: number | null, ajustarFinSemana: boolean | null) {
  const [y, m] = periodo.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, m - 1, Math.min(diaPago || ultimo, ultimo)));
  if (ajustarFinSemana) while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}
/** Ley 1527 art. 6: the employer remits within 3 business days after paying the payroll. */
// shortcut: skips weekends only, not Colombian holidays; add a holiday calendar when one exists in the DB.
export function fechaLimiteGiro(fechaPago: string, diasHabiles = 3) {
  const d = new Date(fechaPago + 'T00:00:00Z');
  let n = 0;
  while (n < diasHabiles) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++; }
  return iso(d);
}
