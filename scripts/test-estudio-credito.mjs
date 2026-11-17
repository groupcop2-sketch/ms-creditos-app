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
