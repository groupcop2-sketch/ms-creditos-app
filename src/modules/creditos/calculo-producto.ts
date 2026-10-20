import { configurarAtributo, evaluarFormula, type ConfiguracionAtributo } from './formulas-atributos.js';
export interface AtributoCalculo extends ConfiguracionAtributo {
  tipo_limite?: 'MONTO' | 'EDAD' | null;
  id_producto_atributo: number; nombre: string; tipo_atributo: string; tipo_calculo: string;
  valor: string | number | null; porcentaje: string | number | null; valor2: string | number | null;
  minimo: string | number | null; maximo: string | number | null;
  aplica_iva: boolean; obligatorio: boolean; prioridad: number;
  formula_codigo?: string | null; base_calculo?: string | null; operacion?: string | null;
  aplica_minimo?: boolean | null; aplica_maximo?: boolean | null;
}
const key = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const numeric = (value: unknown) => value == null || (typeof value === 'string' && !value.trim()) ? null : Number(value);
export function validarValorAtributo(input: ConfiguracionAtributo) {
  const {valor, porcentaje} = configurarAtributo(input, Boolean(input.tipo_calculo || input.operacion || input.expresion));
  return {valor, porcentaje};
}
export function installment(principal: number, rate: number, months: number) {
  return rate === 0 ? principal / months : principal * rate / (1 - Math.pow(1 + rate, -months));
}
export function calcularProducto(monto: number, plazo: number, rows: AtributoCalculo[], smlmv: number, iva: number, tasaAprobada?: number | null) {
  if (!Number.isFinite(monto) || monto <= 0 || !Number.isInteger(plazo) || plazo <= 0) throw new Error('Monto o plazo invalido');
  rows.forEach(row => configurarAtributo(row));
  if (!Number.isFinite(iva) || iva < 0) throw new Error('El IVA configurado es invalido');
  const intereses = rows.filter(r => key(r.nombre).includes('INTERES CORRIENTE'));
  if (intereses.length !== 1 || numeric(intereses[0].porcentaje) == null) throw new Error('El producto debe tener un unico atributo de INTERES CORRIENTE con porcentaje mensual');
  const tasa = tasaAprobada ?? Number(intereses[0].porcentaje);
  if (!Number.isFinite(tasa) || tasa < 0) throw new Error('La tasa de interes mensual configurada es invalida');
  const rate = tasa / 100;
  function evaluar(row: AtributoCalculo, cuota: number, saldo: number, capital = monto) {
    const formula = key((row.formula_codigo ?? '') + ' ' + row.tipo_calculo);
    const base = row.base_calculo ?? (formula.includes('SMLMV') ? 'SMLMV' : formula.includes('SALDO') ? 'SALDO' : formula.includes('CUOTA') ? 'CUOTA' : 'VALOR');
    // Only explicit VALOR_CREDITO uses financed capital; disbursement and VALOR use requested cash.
    const valorBase = base === 'SMLMV' || base === 'SMMLV' ? smlmv : base === 'PLAZO' ? plazo : base === 'SALDO' ? saldo : base === 'CUOTA' ? cuota : base === 'VALOR_CREDITO' ? capital : monto;
    const configurado = configurarAtributo(row);
    let valor = configurado.modoCalculo === 'PORCENTAJE' ? valorBase * (configurado.porcentaje ?? 0) / 100
      : configurado.modoCalculo === 'VALOR_FIJO' ? configurado.valor ?? 0 : evaluarFormula(row, valorBase, plazo);
    // Age eligibility bounds never cap a charge in pesos.
    if (row.tipo_limite !== 'EDAD') {
      if (row.aplica_minimo !== false && row.minimo != null) valor = Math.max(valor, Number(row.minimo));
      if (row.aplica_maximo !== false && row.maximo != null && Number(row.maximo) > 0) valor = Math.min(valor, Number(row.maximo));
    }
    if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor de atributo invalido: ' + row.nombre);
    return money(valor * (row.aplica_iva ? 1 + iva / 100 : 1));
  }
  const atributos = rows.map(row => {
    const esInteres = row.id_producto_atributo === intereses[0].id_producto_atributo;
    const tipo = key(row.tipo_atributo).trim();
    const esDescuento = !esInteres && (tipo.includes('DESEMBOLSO') || tipo.includes('DESCUENTO'));
    const sumaALaCuota = !esInteres && tipo === 'CUOTA';
    const sumaAlCredito = !esInteres && tipo === 'CREDITO';
    if (!esInteres && !esDescuento && !sumaALaCuota && !sumaAlCredito) throw new Error('Tipo de atributo no soportado: ' + row.tipo_atributo);
    if (sumaAlCredito && configurarAtributo(row).modoCalculo === 'FORMULA' && row.base_calculo === 'CUOTA') throw new Error('Un cargo financiado no puede depender de la cuota: ' + row.nombre);
    return { modoCalculo: configurarAtributo(row).modoCalculo, tipoLimite: row.tipo_limite ?? 'MONTO', minimo: numeric(row.minimo), maximo: numeric(row.maximo), id: row.id_producto_atributo, nombre: row.nombre, tipoAtributo: row.tipo_atributo, tipoCalculo: row.tipo_calculo,
      valor: validarValorAtributo(row).valor, porcentaje: esInteres ? tasa : validarValorAtributo(row).porcentaje, aplicaIva: row.aplica_iva,
      obligatorio: row.obligatorio, prioridad: row.prioridad, sumaAlCredito, sumaALaCuota, esDescuento,
      valorCalculado: esInteres ? 0 : evaluar(row, 0, monto) };
  });
  const filasFinanciadas = rows.filter(row => atributos.find(a => a.id === row.id_producto_atributo)?.sumaAlCredito);
  const deudaPara = (capital: number) => money(monto + filasFinanciadas.reduce((total, row) => total + evaluar(row, 0, capital, capital), 0));
  // Solve capital = cash requested + financed charges(capital), at cent precision.
  // This also supports fixed charges, formulas, VAT and monetary caps without duplicating charges.
  let menor = Math.round(monto * 100);
  let mayor = Math.max(menor + 1, Math.round(deudaPara(monto) * 100));
  const diferencia = (centavos: number) => Math.round(deudaPara(centavos / 100) * 100) - centavos;
  let solucion = diferencia(menor) === 0 ? menor : null;
  for (let i = 0; solucion === null && diferencia(mayor) > 0 && i < 60; i++) {
    mayor *= 2;
    if (!Number.isSafeInteger(mayor)) throw new Error('Los cargos financiados no permiten determinar un capital valido');
  }
  if (solucion === null && diferencia(mayor) > 0) throw new Error('No hay solucion para el capital: revisa los porcentajes y formulas financiados');
  for (let i = 0; solucion === null && i < 100; i++) {
    const medio = Math.floor((menor + mayor) / 2);
    const dif = diferencia(medio);
    if (dif === 0) { solucion = medio; break; }
    if (mayor - menor <= 1) {
      if (diferencia(mayor) === 0) solucion = mayor;
      break;
    }
    if (dif > 0) menor = medio; else mayor = medio;
  }
  if (solucion === null) throw new Error('No fue posible conciliar el capital y sus cargos a centavos');
  const valorCredito = solucion / 100;
  for (const atributo of atributos) {
    const row = rows.find(item => item.id_producto_atributo === atributo.id)!;
    if (atributo.sumaAlCredito || atributo.esDescuento) atributo.valorCalculado = evaluar(row, 0, valorCredito, valorCredito);
  }
  const cargosFinanciados = money(atributos.filter(a => a.sumaAlCredito).reduce((total,a) => total+a.valorCalculado,0));
  const descuentosDesembolso = money(atributos.filter(a => a.esDescuento).reduce((total,a) => total+a.valorCalculado,0));
  const cuotaBase = money(installment(valorCredito, rate, plazo));
  let saldo = valorCredito;
  const plan = Array.from({length: plazo}, (_, index) => {
    const saldoInicial = saldo;
    const interes = money(saldo * rate);
    const capital = index === plazo-1 ? saldo : Math.min(saldo, money(cuotaBase-interes));
    const cargos = money(rows.filter(r => atributos.find(a => a.id === r.id_producto_atributo)?.sumaALaCuota).reduce((s,r) => s+evaluar(r, cuotaBase, saldo, valorCredito),0));
    saldo = money(Math.max(0, saldo-capital));
    return { numero: index+1, saldoInicial, capital, interes, cargos, cuota: money(capital+interes+cargos), saldoFinal: saldo };
  });
  for (const a of atributos) {
    if (a.sumaALaCuota) a.valorCalculado = evaluar(rows.find(r => r.id_producto_atributo === a.id)!, cuotaBase, valorCredito, valorCredito);
    if (a.id === intereses[0].id_producto_atributo) a.valorCalculado = plan[0].interes;
  }
  return { resumen: { montoSolicitado: money(monto), valorDesembolso: money(Math.max(0,monto-descuentosDesembolso)), valorCredito,
    cargosFinanciados, descuentosDesembolso, plazo, tasaMensual: tasa, cuotaBase, cargosPorCuota: plan[0].cargos,
    cuotaEstimada: plan[0].cuota, totalIntereses: money(plan.reduce((s,p) => s+p.interes,0)), totalPagar: money(plan.reduce((s,p) => s+p.cuota,0)) }, atributos, plan };
}
