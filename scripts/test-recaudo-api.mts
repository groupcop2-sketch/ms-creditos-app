// Read-only smoke test of the recaudo module against the running local API (the DB is shared: no writes).
// Run: npx tsx scripts/test-recaudo-api.mts
import '../src/config/env.ts';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createSigner } from 'fast-jwt';
import { PDFDocument } from 'pdf-lib';
const { env } = await import('../src/config/env.ts');
const { pool } = await import('../src/lib/db.ts');
const { generarPdfCuentaCobro } = await import('../src/modules/recaudo/recaudo.pdf.ts');

const API = 'http://127.0.0.1:4000/api/v1/recaudo';
const sign = createSigner({ key: env.JWT_SECRET, expiresIn: 60_000 });
const token = (permissions: string[]) => sign({ sub: '0', username: 'smoke-test', roles: [], permissions });
const todos = ['recaudo:read', 'recaudo:cobro', 'recaudo:aplicar', 'recaudo:config', 'recaudo:cierre'];
const get = async (path: string, perms = todos) => fetch(API + path, { headers: { authorization: `Bearer ${token(perms)}` } });
const post = async (path: string, body: unknown, perms = todos) =>
  fetch(API + path, { method: 'POST', headers: { authorization: `Bearer ${token(perms)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

// Schema and permissions exist.
const tablas = await pool.query(`select table_name from information_schema.tables where table_schema = 'Creditos' and table_name like 'TBL_RECAUDO%' or table_name like 'TBL_CUENTA%COBRO%' order by 1`);
console.log('tablas:', tablas.rows.map((r) => r.table_name).join(', '));
assert.equal(tablas.rows.length, 7);
const permisos = await pool.query(`select p.v_nom_permiso, array_agg(distinct r.v_nom_rol) roles from "Creditos"."TBL_PERMISOS" p
  left join "Creditos"."TBL_ROL_SUBMODULO_PERMISO" rsp on rsp.id_permiso = p.id_permiso left join "Creditos"."TBL_ROLES" r on r.id_rol = rsp.id_rol
  where p.v_nom_permiso like 'recaudo:%' group by 1 order by 1`).catch(async () => pool.query(`select v_nom_permiso from "Creditos"."TBL_PERMISOS" where v_nom_permiso like 'recaudo:%'`));
console.log('permisos:', permisos.rows.map((r) => `${r.v_nom_permiso}${r.roles ? ' → ' + r.roles.join('/') : ''}`).join(' | '));
assert.equal(permisos.rows.length, 5);

// Permission gate.
assert.equal((await get('/periodos/2026-11', [])).status, 403);
assert.equal((await post('/cierres/2026-11', {}, ['recaudo:read'])).status, 403);
assert.equal((await get('/periodos/2026-13')).status, 400);

// Read endpoints.
const periodo = await (await get('/periodos/2026-11')).json();
console.log('periodo 2026-11:', periodo.nombre, '· empresas con cobro:', periodo.empresas.length);
const cierre = await get('/cierres/2026-11');
assert.equal(cierre.status, 200);
const c = await cierre.json();
console.log('cierre: listo =', c.listo, '· totales =', JSON.stringify(c.totales));
assert.equal((await get('/lotes?periodo=2026-11')).status, 200);
const empresa = await pool.query<{ id_empresa: number }>('select id_empresa from "Creditos"."TBL_EMPRESAS" order by id_empresa limit 1');
const vp = await (await get(`/cuentas-cobro/vista-previa?empresaId=${empresa.rows[0].id_empresa}&periodo=2026-11`)).json();
console.log('vista previa empresa', empresa.rows[0].id_empresa, '→ créditos:', vp.detalle.length, 'límite giro:', vp.fechaLimiteGiro);

// Template test (pure, no writes).
const probar = await (await post('/plantillas/probar', {
  plantilla: { separador: ';', filaEncabezado: 1, mapeo: { CEDULA: 'identificacion', VALOR: 'valor' }, novedades: {} },
  texto: 'CEDULA;VALOR\n123;1.000\n456;abc'
})).json();
assert.equal(probar.filas, 1);
assert.equal(probar.totalErrores, 1);

// Batch on a company without template is refused before any write.
const sinPlantilla = await post('/lotes/conciliar', { empresaId: empresa.rows[0].id_empresa, periodo: '2026-11', texto: 'A;B\n1;2' });
console.log('conciliar sin formato →', sinPlantilla.status, (await sinPlantilla.json()).message);

// PDF renders (offline, sample data) and is a valid PDF with the right page count.
const pdf = await generarPdfCuentaCobro({
  consecutivo: 'CC-000001', periodoNombre: 'Noviembre 2026', fechaEmision: '2026-11-17', fechaPagoNomina: '2026-11-30', fechaLimiteGiro: '2026-12-03',
  emisor: { nombre: 'Creditos App', nit: '900.000.000-1', correo: 'cartera@example.com', telefono: null, logo: null },
  empresa: { nombre: 'Industrias Andinas S.A.S.', nit: '900.123.456-7', contacto: 'Paula Restrepo', correo: 'nomina@example.com' },
  cuentaGiro: { banco: 'Bancolombia', tipo: 'AHORROS', numero: '123-456789-01', titular: 'Creditos App' },
  detalle: Array.from({ length: 45 }, (_, i) => ({ identificacion: String(1020345678 + i), nombre: `Empleado de prueba número ${i + 1} con nombre largo`, credito: `CR-${1045 + i}`, numeroCuota: 7, totalCuotas: 36, cuotasPendientes: i % 7 === 0 ? 2 : 1, valorCuota: 312400, mora: i % 7 === 0 ? 18500 : 0, total: 312400 + (i % 7 === 0 ? 18500 : 0), saldoCapital: 6840000 })),
  total: 45 * 312400 + 7 * 18500
});
const doc = await PDFDocument.load(pdf);
console.log('pdf: páginas =', doc.getPageCount(), '· bytes =', pdf.length);
assert.ok(doc.getPageCount() >= 2);
writeFileSync(process.argv[2] ?? 'cuenta-cobro-prueba.pdf', pdf);
await pool.end();
console.log('recaudo api: all checks passed');
