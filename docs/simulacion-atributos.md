# Simulacion por atributos del producto

El motor calculo-producto.ts se comparte entre simulacion, radicacion, aprobacion y liquidacion. Consulta los atributos y la formula asociada por identificador, sin tasas o cargos fijos del portal.

## Modos

- VALOR_FIJO: usa valor como monto del cargo. No interpreta ese monto como parametro de otra formula.
- PORCENTAJE: aplica sobre la base configurada. VALOR_CREDITO usa capital total financiado; VALOR_DESEMBOLSO y VALOR usan monto solicitado. Sin base explicita se conserva monto solicitado.
- FORMULA: evalua operacion, base_calculo, expresion, valor (parametro 1), valor2 (parametro 2), porcentaje y plazo segun la formula asociada. Puede no requerir valor ni porcentaje si su expresion usa BASE y/o PLAZO.
- Sin modo guardado, se conserva compatibilidad con configuraciones antiguas. Un cero inactivo junto a un campo positivo se trata como null. Dos valores positivos son invalidos fuera del modo FORMULA.
- INTERES CORRIENTE debe ser porcentaje mensual vencido y se aplica al saldo del capital real financiado.

Los cargos CREDITO se suman una vez al capital. Los cargos CUOTA se agregan en cada cuota. Las formulas soportan todas las operaciones del editor y expresiones aritmeticas de BASE, VALOR1, VALOR2, PLAZO y PORCENTAJE, mediante un parser limitado sin eval. No se duplica el plazo cuando la operacion ya lo incluye. SALDO y CUOTA se eval?an por periodo; una formula financiada no puede depender circularmente de CUOTA.

IVA se agrega una sola vez despues de calcular el cargo y sus topes monetarios, solo cuando aplica_iva es verdadero. Se lee el parametro IVA vigente; SMLMV se consulta cuando la formula lo requiere. Importes a dos decimales y ajuste final para saldo cero.

## Limites de edad y monto

Aplicar scripts/migrations/20261020-atributos-modo-limites.sql antes del despliegue. Agrega modo_calculo y tipo_limite, sin alterar tasas ni importes. Los limites 18/75 de la fianza de Libranza Plus se clasifican como EDAD conforme a la confirmacion del propietario. EDAD nunca recorta el importe del cargo; MONTO aplica topes monetarios. La simulacion publica muestra el rango y no confirma la edad del solicitante.

El formulario guarda modo y tipo de limite explicitamente y conserva la formula asociada por id. Si un cliente anterior omite tipoLimite al editar, se conserva el tipo guardado. Los limites cero en monto representan un tope no configurado.

## API y validacion

POST /api/v1/portal/simulacion recibe idProductoCredito, montoSolicitado y plazo. Devuelve resumen, atributos y plan sin datos personales. El portal descarta respuestas obsoletas.

La funcion SQL generar_amortizacion(numeric,numeric,integer) queda intacta para consumidores externos. Esta API utiliza el motor compartido. Las liquidaciones ya guardadas no se recalculan; cada nueva liquidacion guarda su desglose y plan.

Pruebas: npm run test:calculo
Compilacion: npm run build

## Capital que incluye cargos sobre si mismo

Los atributos cuya base es VALOR_CREDITO se calculan sobre el capital real financiado, incluyendo esos mismos cargos. Se resuelve en centavos la ecuacion capital = monto solicitado + suma(cargos financiados(capital)); despues se calcula la amortizacion sobre ese capital, con la tasa mensual configurada. No se vuelven a sumar los cargos a la cuota. Las configuraciones sin una solucion conciliable se rechazan.

La afiliacion de Libranza Plus se asocia mediante scripts/migrations/20261020-afiliacion-base-smmlv.sql a (SMMLV * porcentaje/100) * plazo + valor. Se lee el parametro vigente SMLMV o su alias SMMLV, sin un salario hardcodeado. En la verificacion, el parametro SMMLV vale 1.750.905.

Referencia a 12 meses y solicitado 10.000.000: fianza 38% del capital mas IVA; seguro (capital/1.000.000)*500*12; afiliacion (1.750.905*0,2%)*12+7.000; corretaje 8% del desembolso. Resultado mostrado: fianza 9.054.868, seguro 120.144, afiliacion 49.022, corretaje 800.000, capital total 20.024.034 y cuota 1.907.166. Las cuentas y la conciliacion conservan centavos internamente.
