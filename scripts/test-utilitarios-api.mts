// Smoke test of Utilitarios against the running local API. Writes no catalog data (only rejected requests).
// Run: npx tsx scripts/test-utilitarios-api.mts
import '../src/config/env.ts';
import assert from 'node:assert/strict';
import { createSigner } from 'fast-jwt';
const { env } = await import('../src/config/env.ts');
const { pool } = await import('../src/lib/db.ts');
const { CATALOGOS } = await import('../src/modules/utilitarios/utilitarios.registry.ts');

const BASE = 'http://127.0.0.1:4000/api/v1';
const sign = createSigner({ key: env.JWT_SECRET, expiresIn: 60_000 });
const tok = (permissions: string[]) => sign({ sub: '0', username: 'smoke-test', roles: [], permissions });
const ALL = ['utilitarios:read', 'utilitarios:config'];
const call = (path: string, init: RequestInit = {}, perms = ALL) =>
  fetch(BASE + path, { ...init, headers: { authorization: `Bearer ${tok(perms)}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });

// Schema: every editable boolean catalog has "activo"; permissions exist.
const bool = CATALOGOS.filter((c) => c.activo?.tipo === 'bool').map((c) => c.tabla);
const cols = await pool.query(`select table_name from information_schema.columns where table_schema = 'Creditos' and column_name = 'activo' and table_name = any($1::text[])`, [bool]);
assert.equal(cols.rowCount, bool.length, 'faltan columnas activo');
const perms = await pool.query(`select v_nom_permiso from "Creditos"."TBL_PERMISOS" where v_nom_permiso like 'utilitarios:%'`);
assert.equal(perms.rowCount, 2);
console.log(`columnas activo: ${cols.rowCount}/${bool.length} · permisos: ${perms.rows.map((r) => r.v_nom_permiso).join(', ')}`);

// Permission gate.
assert.equal((await call('/utilitarios/catalogos', {}, [])).status, 403);
assert.equal((await call('/utilitarios/catalogos/tipo-contrato', { method: 'POST', body: JSON.stringify({ valores: { des_tipo_contrato: 'X' } }) }, ['utilitarios:read'])).status, 403);

// Lists.
const lista = await (await call('/utilitarios/catalogos')).json();
assert.equal(lista.length, CATALOGOS.length);
console.log('catálogos:', lista.map((c: { titulo: string; total: number }) => `${c.titulo} (${c.total})`).join(' · '));
for (const c of CATALOGOS) {
  const r = await call(`/utilitarios/catalogos/${c.key}?limite=5`);
  assert.equal(r.status, 200, `${c.key} respondió ${r.status}: ${await r.text()}`);
}
console.log(`las ${CATALOGOS.length} tablas cargan`);
const contrato = await (await call('/utilitarios/catalogos/tipo-contrato')).json();
assert.ok(contrato.filas.length > 0 && contrato.catalogo.editable);
console.log('tipo-contrato:', contrato.filas.map((f: { valores: Record<string, string>; enUso: number | null }) => `${f.valores.des_tipo_contrato}=${f.enUso}`).join(', '));
const deps = await (await call('/utilitarios/catalogos/departamentos?q=antioquia')).json();
const ciudades = await (await call(`/utilitarios/catalogos/ciudades?padre=${deps.filas[0].id}&limite=5`)).json();
assert.ok(ciudades.filas.every((f: { padreId: number }) => f.padreId === deps.filas[0].id));
console.log(`ciudades de ${deps.filas[0].valores.v_nom_departamento}: ${ciudades.total}`);

// Rejections (nothing written).
const sistema = await call('/utilitarios/catalogos/estados', { method: 'POST', body: JSON.stringify({ valores: { v_descripcion: 'X' } }) });
assert.equal(sistema.status, 403);
const dup = await call('/utilitarios/catalogos/tipo-contrato', { method: 'POST', body: JSON.stringify({ valores: { des_tipo_contrato: ` ${contrato.filas[0].valores.des_tipo_contrato.toLowerCase()} ` } }) });
assert.equal(dup.status, 409);
const vacio = await call('/utilitarios/catalogos/tipo-contrato', { method: 'POST', body: JSON.stringify({ valores: { des_tipo_contrato: '   ' } }) });
assert.equal(vacio.status, 400);
const sinPadre = await call('/utilitarios/catalogos/ciudades', { method: 'POST', body: JSON.stringify({ valores: { v_nom_ciudad: 'Prueba', v_cod_dane: '99999' } }) });
assert.equal(sinPadre.status, 400);
assert.equal((await call('/utilitarios/catalogos/no-existe')).status, 404);
console.log('rechazos:', sistema.status, (await dup.json()).message, '|', (await vacio.json()).message);

// Combos keep working with the new filter.
const portal = await fetch(BASE + '/portal/catalogos');
assert.equal(portal.status, 200);
const p = await portal.json();
console.log('combos del portal OK:', Object.keys(p).join(', '));
await pool.end();
console.log('utilitarios api: all checks passed');
