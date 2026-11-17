// Run: npx tsx scripts/test-recaudo-logic.mts  (pure logic, no DB)
import assert from 'node:assert/strict';
import { conciliar, fechaLimiteGiro, fechaPagoNomina, letras, parseArchivo, parseMoney, periodoSiguiente, validarPlantilla, type PlantillaArchivo } from '../src/modules/recaudo/recaudo.logic.ts';

assert.equal(parseMoney('1.234.567,89'), 1234567.89);
assert.equal(parseMoney('1,234,567.89'), 1234567.89);
assert.equal(parseMoney('312.400'), 312400);
assert.equal(parseMoney('$ 455.900'), 455900);
assert.equal(parseMoney('1234.5'), 1234.5);
assert.ok(Number.isNaN(parseMoney('')));

assert.equal(letras(1776500), 'UN MILLÓN SETECIENTOS SETENTA Y SEIS MIL QUINIENTOS PESOS');
assert.equal(letras(1000000), 'UN MILLÓN DE PESOS');
assert.equal(letras(21000), 'VEINTIÚN MIL PESOS');
assert.equal(letras(101), 'CIENTO UN PESOS');
assert.equal(letras(2500000000), 'DOS MIL QUINIENTOS MILLONES DE PESOS');

assert.equal(fechaPagoNomina('2026-11', null, false), '2026-11-30');
assert.equal(fechaPagoNomina('2026-02', 30, false), '2026-02-28');
assert.equal(fechaPagoNomina('2026-11', 29, true), '2026-11-27'); // Sunday → Friday
assert.equal(fechaLimiteGiro('2026-11-30'), '2026-12-03');
assert.equal(fechaLimiteGiro('2026-11-27'), '2026-12-02'); // Fri → Wed
assert.equal(periodoSiguiente('2026-12'), '2027-01');

const plantilla: PlantillaArchivo = {
  separador: ';', filaEncabezado: 1,
  mapeo: { DOCUMENTO: 'identificacion', NOMBRES: 'nombre', LIBRANZA: 'credito', VALOR_DESC: 'valor', NOV: 'novedad' },
  novedades: { IN: 'Incapacidad' }
};
assert.equal(validarPlantilla(plantilla), null);
assert.match(validarPlantilla({ ...plantilla, mapeo: { A: 'valor' } })!, /Identificación/);

const archivo = '﻿DOCUMENTO;NOMBRES;LIBRANZA;VALOR_DESC;NOV\n1.020.345.678;ANA;CR-1045;312.400;\n79856321;"GOMEZ; CARLOS";;455.900;\n79856321;GOMEZ CARLOS;;150.000;\n52987456;LUISA;;200.000;\n43765219;MARTA;;0;IN\n80123456;PEDRO;;250.000;\n55;X;;abc;\n;;;;\nTOTAL;;;;';
const { filas, errores } = parseArchivo(archivo, plantilla);
assert.equal(filas.length, 6);
assert.deepEqual(errores.map((e) => e.fila), [8]); // bad value; blank row and "TOTAL" footer (no ID digits, no value) are skipped
assert.equal(filas[1].nombre, 'GOMEZ; CARLOS');

const detalle = [
  { idCredito: 1045, consecutivo: 'CR-1045', identificacion: '1020345678', nombre: 'Ana', total: 312400 },
  { idCredito: 1051, consecutivo: 'CR-1051', identificacion: '79856321', nombre: 'Carlos', total: 455900 },
  { idCredito: 1088, consecutivo: 'CR-1088', identificacion: '79856321', nombre: 'Carlos', total: 150000 },
  { idCredito: 1060, consecutivo: 'CR-1060', identificacion: '52987456', nombre: 'Luisa', total: 268300 },
  { idCredito: 1070, consecutivo: 'CR-1070', identificacion: '43765219', nombre: 'Marta', total: 198600 },
  { idCredito: 1074, consecutivo: 'CR-1074', identificacion: '1032456987', nombre: 'Diego', total: 521000 }
];
const r = conciliar(detalle, filas, plantilla.novedades);
assert.deepEqual(r.map((x) => `${x.identificacion}:${x.idCredito}:${x.resultado}`), [
  '1020345678:1045:COMPLETO', '79856321:1051:COMPLETO', '79856321:1088:COMPLETO', '52987456:1060:PARCIAL',
  '43765219:1070:NOVEDAD', '80123456:null:NO_ENCONTRADO', '1032456987:1074:FALTANTE'
]);
assert.equal(r[4].detalle, 'Incapacidad');
console.log('recaudo.logic: all assertions passed');
