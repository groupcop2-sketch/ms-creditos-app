import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstudio } from '../src/modules/creditos/estudio-credito.ts';

test('libranza: (salario - aportes)/2 - deducciones, por porcentaje', () => {
  const r = calcularEstudio('LIBRANZA', { salario: 3000000, aportesLey: 240000, deduccionesNomina: 300000 }, 70);
  assert.equal(r.netoBase, 2760000);
  assert.equal(r.minimoVariable, 1380000);
  assert.equal(r.disponible, 1080000);
  assert.equal(r.cuotaMaxima, 756000);
});

test('libre inversion: (ingresos - centrales)/2, por porcentaje', () => {
  const r = calcularEstudio('LIBRE_INVERSION', { ingresosDemostrables: 5000000, obligacionesCentrales: 1000000 }, 50);
  assert.equal(r.minimoVariable, null);
  assert.equal(r.disponible, 2000000);
  assert.equal(r.cuotaMaxima, 1000000);
});

test('disponible negativo da cuota maxima 0 y porcentaje invalido falla', () => {
  assert.equal(calcularEstudio('LIBRANZA', { salario: 1000000, aportesLey: 80000, deduccionesNomina: 900000 }, 70).cuotaMaxima, 0);
  assert.throws(() => calcularEstudio('LIBRANZA', { salario: 1 }, 0));
  assert.throws(() => calcularEstudio('LIBRANZA', { salario: 1 }, 101));
});

import { validarModalidad } from '../src/modules/creditos/soportes-cliente.ts';

test('modalidad: efectivo, compra de cartera y mixto', () => {
  assert.deepEqual(validarModalidad('EFECTIVO', 1000, []), { totalCompras: 0, efectivo: 1000 });
  assert.deepEqual(validarModalidad('COMPRA_CARTERA', 1000, [{ valor: 600 }, { valor: 400 }]), { totalCompras: 1000, efectivo: 0 });
  assert.deepEqual(validarModalidad('MIXTO', 1000, [{ valor: 600 }]), { totalCompras: 600, efectivo: 400 });
  assert.throws(() => validarModalidad('EFECTIVO', 1000, [{ valor: 1 }]));
  assert.throws(() => validarModalidad('COMPRA_CARTERA', 1000, []));
  assert.throws(() => validarModalidad('COMPRA_CARTERA', 1000, [{ valor: 900 }]));
  assert.throws(() => validarModalidad('MIXTO', 1000, [{ valor: 1000 }]));
  assert.throws(() => validarModalidad('MIXTO', 1000, [{ valor: 0 }]));
});

import { calcularFaltantes } from '../src/modules/creditos/soportes-cliente.ts';

test('faltantes: identidad siempre y un certificado por deuda', () => {
  assert.equal(calcularFaltantes([], []).length, 3);
  const f = calcularFaltantes([{ id: 7 }], [{ tipo: 'CEDULA_FRENTE', idCompraCartera: null }]);
  assert.deepEqual(f, [
    { tipo: 'CEDULA_REVERSO', idCompraCartera: null },
    { tipo: 'FOTO_ROSTRO', idCompraCartera: null },
    { tipo: 'CERTIFICADO_COMPRA_CARTERA', idCompraCartera: 7 }
  ]);
  assert.equal(calcularFaltantes([{ id: 7 }], [
    { tipo: 'CEDULA_FRENTE', idCompraCartera: null }, { tipo: 'CEDULA_REVERSO', idCompraCartera: null },
    { tipo: 'FOTO_ROSTRO', idCompraCartera: null }, { tipo: 'CERTIFICADO_COMPRA_CARTERA', idCompraCartera: 7 }
  ]).length, 0);
});

import { construirCartaVisacion } from '../src/modules/creditos/visacion.ts';

test('carta de visacion: llena datos y marca los faltantes', () => {
  const datos = { consecutivo: 'CR-1', empresa: 'ACME S.A.S.', nit: '900.1', trabajador: 'Ana Ruiz', cedula: '123', cargo: '', tipoContrato: 'Indefinido', monto: 10000000, cuota: 1089065, plazo: 24, representante: 'Luis', telefonoEmpresa: '300', correoEmpresa: 'rh@acme.co' };
  const extras = { ciudad: 'Barranquilla', entidadFinanciera: 'Banco X', entidadOperadora: 'Operadora Y', firmanteNombre: 'Luis', firmanteCargo: 'Representante Legal' };
  const carta = construirCartaVisacion(datos, extras, new Date(2026, 10, 17));
  assert.match(carta, /^Barranquilla, 17 de noviembre de 2026/);
  assert.match(carta, /la empresa ACME S\.A\.S\. con NIT 900\.1/);
  assert.match(carta, /Cargo que desempeña: \[Cargo\]/);
  assert.match(carta, /girar dichos recursos a favor de Operadora Y/);
  assert.match(carta, /Plazo en meses: 24/);
});

import { evaluarLicencia } from '../src/modules/plataforma/plataforma.service.ts';
import { permisoDeEtapa } from '../src/modules/creditos/permisos-etapa.ts';
import { formatNumeroEgreso } from '../src/modules/creditos/egresos.ts';

test('licencia: vigente, vencida, suspendida, sin limites y cupo de usuarios', () => {
  const base = { licencia_estado: 'ACTIVA', licencia_vencimiento: '2026-11-30', licencia_max_usuarios: 5 };
  const ok = evaluarLicencia(base, 3, '2026-11-17');
  assert.equal(ok.vigente, true);
  assert.equal(ok.diasRestantes, 13);
  assert.equal(ok.cupoLleno, false);
  assert.equal(evaluarLicencia(base, 5, '2026-11-30').vigente, true, 'el ultimo dia sigue vigente');
  assert.equal(evaluarLicencia(base, 5, '2026-11-17').cupoLleno, true);
  const vencida = evaluarLicencia(base, 1, '2026-12-01');
  assert.equal(vencida.vigente, false);
  assert.match(vencida.motivo, /venció el 2026-11-30/);
  assert.equal(evaluarLicencia({ ...base, licencia_estado: 'SUSPENDIDA' }, 1, '2026-11-17').vigente, false);
  const libre = evaluarLicencia({ licencia_estado: 'ACTIVA', licencia_vencimiento: null, licencia_max_usuarios: null }, 999, '2030-01-01');
  assert.deepEqual([libre.vigente, libre.diasRestantes, libre.cupoLleno], [true, null, false]);
});

test('permiso por etapa: cada etapa del flujo tiene su permiso', () => {
  assert.equal(permisoDeEtapa('Radicacion')?.code, 'creditos:etapa-radicacion');
  assert.equal(permisoDeEtapa('Validación documental')?.code, 'creditos:etapa-validacion');
  assert.equal(permisoDeEtapa('Estudio de credito')?.code, 'creditos:etapa-estudio');
  assert.equal(permisoDeEtapa('Aprobación')?.code, 'creditos:etapa-visacion');
  assert.equal(permisoDeEtapa('Visación')?.code, 'creditos:etapa-visacion');
  assert.equal(permisoDeEtapa('Desembolso')?.code, 'creditos:etapa-desembolso');
  assert.equal(permisoDeEtapa('Firma de documentos'), null);
});

test('consecutivo de egreso con 6 digitos', () => {
  assert.equal(formatNumeroEgreso(1), 'CE-000001');
  assert.equal(formatNumeroEgreso(1061), 'CE-001061');
});
