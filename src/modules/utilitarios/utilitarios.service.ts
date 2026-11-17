import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';
import { sembrarPermisos } from '../creditos/permisos-etapa.js';
import { CATALOGOS, catalogo, type Catalogo } from './utilitarios.registry.js';

export const PERMISOS_UTILITARIOS = [
  { code: 'utilitarios:read', descripcion: 'Ver tablas de utilitarios (catálogos)' },
  { code: 'utilitarios:config', descripcion: 'Agregar y editar opciones de catálogos' }
] as const;

const q = (name: string) => `"${name.replace(/"/g, '')}"`;
const T = (c: Catalogo) => `"Creditos".${q(c.tabla)}`;

type Meta = { columnas: Set<string>; largo: Record<string, number | null> };
const metas = new Map<string, Meta>();

let listo: Promise<void> | null = null;
/**
 * Additive only: adds "activo boolean default true" to editable catalogs that lack it (metadata-only in
 * PostgreSQL 11+, no table rewrite) and seeds the two permissions. Checked once per process.
 */
export function ensureUtilitarios() {
  listo ??= (async () => {
    const cols = await pool.query<{ table_name: string; column_name: string; character_maximum_length: number | null }>(
      `select table_name, column_name, character_maximum_length from information_schema.columns
       where table_schema = 'Creditos' and table_name = any($1::text[])`, [CATALOGOS.map((c) => c.tabla)]);
    for (const c of CATALOGOS) {
      const propias = cols.rows.filter((r) => r.table_name === c.tabla);
      if (c.activo?.tipo === 'bool' && !propias.some((r) => r.column_name === 'activo')) {
        await pool.query(`alter table ${T(c)} add column if not exists activo boolean not null default true`);
        propias.push({ table_name: c.tabla, column_name: 'activo', character_maximum_length: null });
      }
      metas.set(c.key, { columnas: new Set(propias.map((r) => r.column_name)), largo: Object.fromEntries(propias.map((r) => [r.column_name, r.character_maximum_length])) });
    }
    await sembrarPermisos(PERMISOS_UTILITARIOS, 'roles:update');
  })().catch((err) => { listo = null; throw err; });
  return listo;
}

function get(key: string) {
  const c = catalogo(key);
  if (!c) throw new SecurityError('Tabla de utilitarios no encontrada', 404);
  return c;
}
const activoSql = (c: Catalogo, alias = '') =>
  !c.activo ? 'true' : c.activo.tipo === 'bool' ? `${alias}activo` : `coalesce(${alias}id_estado, 1) = 1`;

/** Rows of other tables pointing at each option, through real foreign keys. */
async function usos(c: Catalogo): Promise<{ porId: Map<number, number>; sabe: boolean }> {
  const fks = await pool.query<{ tabla: string; col: string }>(
    `select cl.relname as tabla, att.attname as col
     from pg_constraint con
     join pg_class cl on cl.oid = con.conrelid
     join pg_namespace n on n.oid = cl.relnamespace
     join pg_class rf on rf.oid = con.confrelid
     join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f' and n.nspname = 'Creditos' and rf.relname = $1 and array_length(con.conkey, 1) = 1`, [c.tabla]);
  const porId = new Map<number, number>();
  for (const fk of fks.rows) {
    const r = await pool.query<{ id: number; n: number }>(
      `select ${q(fk.col)} as id, count(*)::int as n from "Creditos".${q(fk.tabla)} where ${q(fk.col)} is not null group by 1`);
    for (const row of r.rows) porId.set(Number(row.id), (porId.get(Number(row.id)) ?? 0) + row.n);
  }
  return { porId, sabe: fks.rowCount! > 0 };
}

export async function listarCatalogos() {
  await ensureUtilitarios();
  const out = [];
  for (const c of CATALOGOS) {
    const r = await pool.query<{ total: number; activos: number }>(
      `select count(*)::int as total, count(*) filter (where ${activoSql(c)})::int as activos from ${T(c)}`);
    out.push({ key: c.key, titulo: c.titulo, descripcion: c.descripcion, grupo: c.grupo, sistema: Boolean(c.sistema), total: r.rows[0].total, activos: r.rows[0].activos });
  }
  return out;
}

export async function listarOpciones(key: string, filtro: { q?: string; padre?: number; limite?: number }) {
  await ensureUtilitarios();
  const c = get(key);
  const meta = metas.get(c.key)!;
  const where: string[] = [];
  const params: unknown[] = [];
  if (filtro.q?.trim()) {
    params.push(`%${filtro.q.trim()}%`);
    where.push(`(${c.campos.map((f) => `${q(f.col)}::text ilike $${params.length}`).join(' or ')})`);
  }
  if (c.padre && filtro.padre) { params.push(filtro.padre); where.push(`${q(c.padre.col)} = $${params.length}`); }
  const limite = Math.min(Math.max(filtro.limite ?? 300, 1), 1000);
  const cols = [q(c.id) + ' as id', ...c.campos.map((f) => q(f.col)), `${activoSql(c)} as activo`, ...(c.padre ? [q(c.padre.col)] : [])];
  const sql = `select ${cols.join(', ')} from ${T(c)} ${where.length ? 'where ' + where.join(' and ') : ''}`;
  const [filas, total, u] = await Promise.all([
    pool.query(`${sql} order by ${c.activo ? `${activoSql(c)} desc, ` : ''}${q(c.etiqueta)} limit ${limite}`, params),
    pool.query<{ n: number }>(`select count(*)::int as n from ${T(c)} ${where.length ? 'where ' + where.join(' and ') : ''}`, params),
    usos(c)
  ]);
  return {
    catalogo: {
      key: c.key, titulo: c.titulo, descripcion: c.descripcion, grupo: c.grupo, sistema: Boolean(c.sistema), editable: !c.sistema,
      desactivable: Boolean(c.activo), padre: c.padre ?? null, usoConocido: u.sabe,
      campos: c.campos.map((f) => ({ ...f, max: Math.min(f.max, meta.largo[f.col] ?? f.max) }))
    },
    total: total.rows[0].n,
    filas: filas.rows.map((r) => ({
      id: Number(r.id),
      valores: Object.fromEntries(c.campos.map((f) => [f.col, r[f.col] ?? ''])),
      padreId: c.padre ? r[c.padre.col] ?? null : null,
      activo: Boolean(r.activo),
      enUso: u.sabe ? u.porId.get(Number(r.id)) ?? 0 : null
    }))
  };
}

function validar(c: Catalogo, valores: Record<string, unknown>) {
  const meta = metas.get(c.key)!;
  const limpio: Record<string, string | null> = {};
  for (const f of c.campos) {
    let v = String(valores[f.col] ?? '').trim().replace(/\s+/g, ' ');
    if (f.mayus) v = v.toUpperCase();
    const max = Math.min(f.max, meta.largo[f.col] ?? f.max);
    if (f.requerido && !v) throw new SecurityError(`${f.label} es obligatorio`, 400);
    if (v.length > max) throw new SecurityError(`${f.label} admite máximo ${max} caracteres`, 400);
    limpio[f.col] = v || null;
  }
  return limpio;
}

async function assertNoDuplicado(c: Catalogo, etiqueta: string | null, padre: number | null, excluirId?: number) {
  const params: unknown[] = [etiqueta];
  let extra = '';
  if (c.padre) { params.push(padre); extra += ` and ${q(c.padre.col)} is not distinct from $${params.length}`; }
  if (excluirId) { params.push(excluirId); extra += ` and ${q(c.id)} <> $${params.length}`; }
  const r = await pool.query<{ v: string }>(`select ${q(c.etiqueta)}::text as v from ${T(c)} where lower(trim(${q(c.etiqueta)}::text)) = lower($1)${extra} limit 1`, params);
  if (r.rowCount) throw new SecurityError(`Ya existe «${r.rows[0].v}» en ${c.titulo.toLowerCase()}`, 409);
}

function assertEditable(c: Catalogo) {
  if (c.sistema) throw new SecurityError(`${c.titulo} es una tabla del sistema: el código depende de sus valores y no se edita desde aquí`, 403);
}

export async function crearOpcion(key: string, body: { valores: Record<string, unknown>; padreId?: number | null }) {
  await ensureUtilitarios();
  const c = get(key);
  assertEditable(c);
  const meta = metas.get(c.key)!;
  const valores = validar(c, body.valores);
  if (c.padre && !body.padreId) throw new SecurityError(`Selecciona ${c.padre.label.toLowerCase()}`, 400);
  await assertNoDuplicado(c, valores[c.etiqueta], body.padreId ?? null);
  const cols = Object.keys(valores);
  const vals: unknown[] = Object.values(valores);
  if (c.padre) { cols.push(c.padre.col); vals.push(body.padreId); }
  for (const fecha of ['fec_creacion', 'fecha_creacion']) if (meta.columnas.has(fecha)) { cols.push(fecha); vals.push(new Date()); }
  if (c.activo?.tipo === 'estado') { cols.push('id_estado'); vals.push(1); }
  const sql = `insert into ${T(c)} (${cols.map(q).join(', ')}) values (${vals.map((_, i) => `$${i + 1}`).join(', ')}) returning ${q(c.id)} as id`;
  try {
    return { id: Number((await pool.query(sql, vals)).rows[0].id) };
  } catch (err) {
    // Tables seeded with explicit ids leave the sequence behind: realign it once and retry.
    if ((err as { code?: string; constraint?: string }).code === '23505' && /pkey/i.test((err as { constraint?: string }).constraint ?? '')) {
      await pool.query(`select setval(pg_get_serial_sequence($1, $2), (select coalesce(max(${q(c.id)}), 0) from ${T(c)}))`, [`"Creditos".${q(c.tabla)}`, c.id]);
      return { id: Number((await pool.query(sql, vals)).rows[0].id) };
    }
    throw err;
  }
}

export async function editarOpcion(key: string, id: number, body: { valores: Record<string, unknown>; padreId?: number | null }) {
  await ensureUtilitarios();
  const c = get(key);
  assertEditable(c);
  const meta = metas.get(c.key)!;
  const valores = validar(c, body.valores);
  await assertNoDuplicado(c, valores[c.etiqueta], c.padre ? body.padreId ?? null : null, id);
  const sets = Object.keys(valores).map((col, i) => `${q(col)} = $${i + 2}`);
  const vals: unknown[] = [id, ...Object.values(valores)];
  if (c.padre && body.padreId) { vals.push(body.padreId); sets.push(`${q(c.padre.col)} = $${vals.length}`); }
  for (const fecha of ['fec_actualizacion', 'fecha_actualizacion']) if (meta.columnas.has(fecha)) sets.push(`${q(fecha)} = now()`);
  const r = await pool.query(`update ${T(c)} set ${sets.join(', ')} where ${q(c.id)} = $1`, vals);
  if (!r.rowCount) throw new SecurityError('Opción no encontrada', 404);
  return { id };
}

/** Inactive options disappear from the combos; records that already use them keep their value. */
export async function cambiarActivo(key: string, id: number, activo: boolean) {
  await ensureUtilitarios();
  const c = get(key);
  assertEditable(c);
  if (!c.activo) throw new SecurityError(`${c.titulo} no se puede desactivar`, 400);
  const set = c.activo.tipo === 'bool' ? 'activo = $2' : 'id_estado = case when $2 then 1 else 2 end';
  const r = await pool.query(`update ${T(c)} set ${set} where ${q(c.id)} = $1`, [id, activo]);
  if (!r.rowCount) throw new SecurityError('Opción no encontrada', 404);
  return { id, activo };
}
