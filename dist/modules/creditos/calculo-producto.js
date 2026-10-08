const key = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const numeric = (value) => value == null || (typeof value === 'string' && !value.trim()) ? null : Number(value);
export function validarValorAtributo(input) {
    const valor = numeric(input.valor);
    const porcentaje = numeric(input.porcentaje);
    if ((valor !== null) === (porcentaje !== null))
        throw new Error('El atributo ' + input.nombre + ' debe tener solo uno: porcentaje o valor fijo');
    if ([valor, porcentaje].some(value => value !== null && (!Number.isFinite(value) || value < 0)))
        throw new Error('El porcentaje o valor del atributo ' + input.nombre + ' debe ser un numero mayor o igual a cero');
    if (key(input.nombre).includes('INTERES CORRIENTE') && porcentaje === null)
        throw new Error('INTERES CORRIENTE requiere un porcentaje mensual');
    return { valor, porcentaje };
}
export function installment(principal, rate, months) {
    return rate === 0 ? principal / months : principal * rate / (1 - Math.pow(1 + rate, -months));
}
export function calcularProducto(monto, plazo, rows, smlmv, iva, tasaAprobada) {
    if (!Number.isFinite(monto) || monto <= 0 || !Number.isInteger(plazo) || plazo <= 0)
        throw new Error('Monto o plazo invalido');
    rows.forEach(validarValorAtributo);
    const intereses = rows.filter(r => key(r.nombre).includes('INTERES CORRIENTE'));
    if (intereses.length !== 1 || numeric(intereses[0].porcentaje) == null)
        throw new Error('El producto debe tener un unico atributo de INTERES CORRIENTE con porcentaje mensual');
    const tasa = tasaAprobada ?? Number(intereses[0].porcentaje);
    if (!Number.isFinite(tasa) || tasa < 0)
        throw new Error('La tasa de interes mensual configurada es invalida');
    const rate = tasa / 100;
    function evaluar(row, cuota, saldo) {
        const formula = key((row.formula_codigo ?? '') + ' ' + row.tipo_calculo);
        const base = row.base_calculo ?? (formula.includes('SMLMV') ? 'SMLMV' : formula.includes('SALDO') ? 'SALDO' : formula.includes('CUOTA') ? 'CUOTA' : 'VALOR_CREDITO');
        // VALOR_CREDITO/VALOR/VALOR_DESEMBOLSO use the requested amount, never the financed charges.
        const valorBase = base === 'SMLMV' ? smlmv : base === 'SALDO' ? saldo : base === 'CUOTA' ? cuota : monto;
        const configurado = validarValorAtributo(row);
        // The populated field selects percentage vs value, even if the formula label is stale.
        const operacionValor = row.operacion ?? (formula.includes('VALOR2') ? 'BASE_POR_VALOR_DIV_VALOR2' : formula.includes('PLAZO') ? 'VALOR_POR_PLAZO' : 'VALOR_FIJO');
        const op = configurado.porcentaje !== null ? 'PORCENTAJE' : operacionValor === 'PORCENTAJE' ? 'VALOR_FIJO' : operacionValor;
        let valor;
        if (op === 'PORCENTAJE')
            valor = valorBase * Number(row.porcentaje ?? 0) / 100;
        else if (op === 'VALOR_POR_PLAZO')
            valor = Number(row.valor ?? 0) * plazo;
        else if (op === 'BASE_POR_VALOR_DIV_VALOR2') {
            if (!Number(row.valor2))
                throw new Error('La formula de ' + row.nombre + ' requiere un divisor distinto de cero');
            valor = valorBase * Number(row.valor ?? 0) / Number(row.valor2);
        }
        else if (op === 'VALOR_FIJO')
            valor = Number(row.valor ?? 0);
        else
            throw new Error('Operacion de formula no soportada: ' + op);
        if (row.aplica_minimo !== false && row.minimo != null)
            valor = Math.max(valor, Number(row.minimo));
        if (row.aplica_maximo !== false && row.maximo != null)
            valor = Math.min(valor, Number(row.maximo));
        if (!Number.isFinite(valor) || valor < 0)
            throw new Error('Valor de atributo invalido: ' + row.nombre);
        return money(valor * (row.aplica_iva ? 1 + iva / 100 : 1));
    }
    const atributos = rows.map(row => {
        const esInteres = row.id_producto_atributo === intereses[0].id_producto_atributo;
        const tipo = key(row.tipo_atributo).trim();
        const esDescuento = !esInteres && (tipo.includes('DESEMBOLSO') || tipo.includes('DESCUENTO'));
        const sumaALaCuota = !esInteres && tipo === 'CUOTA';
        const sumaAlCredito = !esInteres && tipo === 'CREDITO';
        if (!esInteres && !esDescuento && !sumaALaCuota && !sumaAlCredito)
            throw new Error('Tipo de atributo no soportado: ' + row.tipo_atributo);
        if (sumaAlCredito && row.base_calculo === 'CUOTA')
            throw new Error('Un cargo financiado no puede depender de la cuota: ' + row.nombre);
        return { id: row.id_producto_atributo, nombre: row.nombre, tipoAtributo: row.tipo_atributo, tipoCalculo: row.tipo_calculo,
            valor: numeric(row.valor), porcentaje: esInteres ? tasa : numeric(row.porcentaje), aplicaIva: row.aplica_iva,
            obligatorio: row.obligatorio, prioridad: row.prioridad, sumaAlCredito, sumaALaCuota, esDescuento,
            valorCalculado: esInteres ? 0 : evaluar(row, 0, monto) };
    });
    const cargosFinanciados = money(atributos.filter(a => a.sumaAlCredito).reduce((s, a) => s + a.valorCalculado, 0));
    const descuentosDesembolso = money(atributos.filter(a => a.esDescuento).reduce((s, a) => s + a.valorCalculado, 0));
    const valorCredito = money(monto + cargosFinanciados);
    const cuotaBase = money(installment(valorCredito, rate, plazo));
    let saldo = valorCredito;
    const plan = Array.from({ length: plazo }, (_, index) => {
        const saldoInicial = saldo;
        const interes = money(saldo * rate);
        const capital = index === plazo - 1 ? saldo : Math.min(saldo, money(cuotaBase - interes));
        const cargos = money(rows.filter(r => atributos.find(a => a.id === r.id_producto_atributo)?.sumaALaCuota).reduce((s, r) => s + evaluar(r, cuotaBase, saldo), 0));
        saldo = money(Math.max(0, saldo - capital));
        return { numero: index + 1, saldoInicial, capital, interes, cargos, cuota: money(capital + interes + cargos), saldoFinal: saldo };
    });
    for (const a of atributos) {
        if (a.sumaALaCuota)
            a.valorCalculado = evaluar(rows.find(r => r.id_producto_atributo === a.id), cuotaBase, valorCredito);
        if (a.id === intereses[0].id_producto_atributo)
            a.valorCalculado = plan[0].interes;
    }
    return { resumen: { montoSolicitado: money(monto), valorDesembolso: money(Math.max(0, monto - descuentosDesembolso)), valorCredito,
            cargosFinanciados, descuentosDesembolso, plazo, tasaMensual: tasa, cuotaBase, cargosPorCuota: plan[0].cargos,
            cuotaEstimada: plan[0].cuota, totalIntereses: money(plan.reduce((s, p) => s + p.interes, 0)), totalPagar: money(plan.reduce((s, p) => s + p.cuota, 0)) }, atributos, plan };
}
