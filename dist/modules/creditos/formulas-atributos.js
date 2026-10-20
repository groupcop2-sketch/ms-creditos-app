export const clave = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
export const numeroOpcional = (value) => value == null || (typeof value === 'string' && !value.trim()) ? null : Number(value);
export function operacionFormula(row) {
    if (row.expresion?.trim())
        return 'PERSONALIZADA';
    if (row.operacion)
        return row.operacion === 'MULTIPLICAR_DIVIDIR' ? 'BASE_POR_VALOR_DIV_VALOR2' : row.operacion;
    const texto = clave((row.formula_codigo ?? '') + ' ' + (row.tipo_calculo ?? ''));
    if (texto.includes('VALOR2'))
        return 'BASE_POR_VALOR_DIV_VALOR2';
    if (texto.includes('PLAZO') && texto.includes('VALOR'))
        return 'VALOR_POR_PLAZO';
    return texto.includes('%') || texto.includes('PORCENTAJE') ? 'PORCENTAJE' : 'VALOR_FIJO';
}
const operaciones = new Set(['PORCENTAJE', 'PORCENTAJE_POR_PLAZO', 'VALOR_FIJO', 'VALOR_POR_PLAZO', 'BASE_MUL_VALOR', 'BASE_MUL_VALOR_POR_PLAZO', 'BASE_DIV_VALOR', 'BASE_POR_VALOR_DIV_VALOR2', 'BASE_POR_VALOR_DIV_VALOR2_POR_PLAZO', 'BASE_DIV_VALOR_MUL_VALOR2', 'BASE_DIV_VALOR_MUL_VALOR2_POR_PLAZO', 'PERSONALIZADA']);
export function modoAtributo(row) {
    const explicito = row.modo_calculo ?? row.modoCalculo;
    if (explicito)
        return explicito;
    const op = operacionFormula(row);
    if (row.expresion?.trim() || (row.operacion && !['PORCENTAJE', 'VALOR_FIJO'].includes(op)) || numeroOpcional(row.valor2) !== null)
        return 'FORMULA';
    return numeroOpcional(row.porcentaje) !== null && !(Number(row.porcentaje) === 0 && Number(row.valor) > 0) ? 'PORCENTAJE' : 'VALOR_FIJO';
}
// Arithmetic only: no eval, JavaScript, function calls or property access.
export function evaluarExpresion(expression, variables, soloSintaxis = false) {
    if (!expression.trim() || expression.length > 512)
        throw new Error('Expresion de formula vacia o demasiado larga');
    const tokens = expression.toUpperCase().match(/(?:\d+(?:\.\d+)?|\.\d+)|[A-Z_][A-Z_0-9]*|[()+*/-]|\S/g) ?? [];
    if (tokens.length > 256)
        throw new Error('Expresion demasiado compleja');
    let pos = 0;
    function atom(depth) {
        if (depth > 32)
            throw new Error('Expresion demasiado anidada');
        const token = tokens[pos++];
        if (token === '+' || token === '-')
            return (token === '-' ? -1 : 1) * atom(depth + 1);
        if (token === '(') {
            const value = sum(depth + 1);
            if (tokens[pos++] !== ')')
                throw new Error('Parentesis no balanceados');
            return value;
        }
        if (token && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token))
            return Number(token);
        if (token && Object.hasOwn(variables, token))
            return variables[token];
        throw new Error('Token de formula no permitido: ' + (token ?? 'fin de expresion'));
    }
    function product(depth) {
        let value = atom(depth);
        while (tokens[pos] === '*' || tokens[pos] === '/') {
            const op = tokens[pos++];
            const right = atom(depth);
            if (!soloSintaxis && op === '/' && right === 0)
                throw new Error('Division por cero en la formula');
            value = soloSintaxis ? 1 : op === '*' ? value * right : value / right;
        }
        return value;
    }
    function sum(depth) {
        let value = product(depth);
        while (tokens[pos] === '+' || tokens[pos] === '-') {
            const op = tokens[pos++];
            const right = product(depth);
            value = op === '+' ? value + right : value - right;
        }
        return value;
    }
    const result = sum(0);
    if (pos !== tokens.length || !Number.isFinite(result))
        throw new Error('Expresion de formula invalida');
    return result;
}
export function configurarAtributo(row, validarFormula = true) {
    let valor = numeroOpcional(row.valor), porcentaje = numeroOpcional(row.porcentaje);
    const valor2 = numeroOpcional(row.valor2);
    for (const value of [valor, porcentaje, valor2])
        if (value !== null && (!Number.isFinite(value) || value < 0))
            throw new Error('Parametros invalidos en ' + row.nombre);
    const modo = modoAtributo(row);
    if (modo !== 'FORMULA') {
        if (valor !== null && valor > 0 && porcentaje === 0)
            porcentaje = null;
        if (porcentaje !== null && porcentaje > 0 && valor === 0)
            valor = null;
        if ((valor !== null) === (porcentaje !== null))
            throw new Error('El atributo ' + row.nombre + ' debe tener solo uno: porcentaje o valor fijo');
        if ((modo === 'PORCENTAJE' && porcentaje === null) || (modo === 'VALOR_FIJO' && valor === null))
            throw new Error('Falta el dato del modo de calculo seleccionado: ' + row.nombre);
    }
    else if (validarFormula) {
        const op = operacionFormula(row);
        if (!operaciones.has(op))
            throw new Error('Operacion de formula no soportada: ' + op);
        const necesitaPorcentaje = row.requiere_porcentaje || op.startsWith('PORCENTAJE') || /\bPORCENTAJE\b/.test(row.expresion ?? '');
        const necesitaValor = row.requiere_valor || /VALOR|BASE_MUL|BASE_DIV/.test(op) && !op.startsWith('PORCENTAJE') && op !== 'PERSONALIZADA' || /\bVALOR1?\b/.test(row.expresion ?? '');
        const necesitaValor2 = row.requiere_valor2 || op.includes('VALOR2') || /\bVALOR2\b/.test(row.expresion ?? '');
        if (necesitaValor && valor === null || necesitaValor2 && valor2 === null || necesitaPorcentaje && porcentaje === null)
            throw new Error('Faltan parametros de la formula de ' + row.nombre);
        if ((op.includes('BASE_DIV_VALOR') && valor === 0) || (op.includes('DIV_VALOR2') && valor2 === 0))
            throw new Error('El divisor debe ser distinto de cero en ' + row.nombre);
        if (op === 'PERSONALIZADA')
            evaluarExpresion(row.expresion ?? '', { BASE: 1, VALOR: 1, VALOR1: 1, VALOR2: 1, PLAZO: 1, PORCENTAJE: 1 }, true);
    }
    if (clave(row.nombre).includes('INTERES CORRIENTE') && (modo !== 'PORCENTAJE' || porcentaje === null))
        throw new Error('INTERES CORRIENTE requiere un porcentaje mensual');
    return { modoCalculo: modo, valor, porcentaje, valor2 };
}
export function evaluarFormula(row, base, plazo) {
    const config = configurarAtributo(row);
    const v1 = config.valor ?? 0, v2 = config.valor2 ?? 0, porcentaje = config.porcentaje ?? 0;
    const op = operacionFormula(row);
    let result;
    switch (op) {
        case 'PORCENTAJE':
        case 'PORCENTAJE_POR_PLAZO':
            result = base * porcentaje / 100;
            break;
        case 'VALOR_FIJO':
        case 'VALOR_POR_PLAZO':
            result = v1;
            break;
        case 'BASE_MUL_VALOR':
        case 'BASE_MUL_VALOR_POR_PLAZO':
            result = base * v1;
            break;
        case 'BASE_DIV_VALOR':
            if (!v1)
                throw new Error('Division por cero');
            result = base / v1;
            break;
        case 'BASE_POR_VALOR_DIV_VALOR2':
        case 'BASE_POR_VALOR_DIV_VALOR2_POR_PLAZO':
            if (!v2)
                throw new Error('Division por cero');
            result = base * v1 / v2;
            break;
        case 'BASE_DIV_VALOR_MUL_VALOR2':
        case 'BASE_DIV_VALOR_MUL_VALOR2_POR_PLAZO':
            if (!v1)
                throw new Error('Division por cero');
            result = base / v1 * v2;
            break;
        case 'PERSONALIZADA':
            result = evaluarExpresion(row.expresion ?? '', { BASE: base, VALOR: v1, VALOR1: v1, VALOR2: v2, PLAZO: plazo, PORCENTAJE: porcentaje });
            break;
        default: throw new Error('Operacion no soportada: ' + op);
    }
    const plazoIntegrado = op.endsWith('_POR_PLAZO') || op === 'VALOR_POR_PLAZO';
    if (plazoIntegrado || (row.multiplica_por_plazo && op !== 'PERSONALIZADA'))
        result *= plazo;
    if (!Number.isFinite(result))
        throw new Error('Resultado de formula invalido');
    return result;
}
