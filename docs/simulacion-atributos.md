# Simulacion por atributos del producto

El motor src/modules/creditos/calculo-producto.ts se comparte entre simulacion, radicacion, aprobacion y liquidacion definitiva.

- INTERES CORRIENTE representa un porcentaje mensual vencido; se aplica al saldo del capital real financiado. Debe existir exactamente uno.
- Los atributos CREDITO se financian una vez. La base habitual de porcentajes es el monto solicitado; no se acumulan porcentajes sobre otros cargos.
- Los atributos CUOTA distintos del interes se suman a cada cuota, sin aumentar el principal.
- Las formulas consultan operacion, base_calculo, valores, porcentaje y limites del producto. Se admite porcentaje, valor fijo, valor por plazo y base por valor/divisor.
- IVA se agrega una sola vez cuando aplica, utilizando el parametro financiero vigente. SMLMV tambien se consulta cuando la formula lo requiere. No se siembran parametros durante la simulacion.
- Los importes se redondean a dos decimales; la ultima cuota ajusta el capital para cerrar el saldo en cero.
- La tasa del simulador viene del producto. Una tasa negociada se aplica unicamente en la aprobacion explicita.

POST /api/v1/portal/simulacion es publico, recibe idProductoCredito, montoSolicitado y plazo. Devuelve resumen, atributos y plan sin datos de clientes. Los formularios del portal consultan este endpoint y descartan respuestas obsoletas.

La funcion SQL existente generar_amortizacion(numeric,numeric,integer) queda intacta para compatibilidad con consumidores externos. Las llamadas de esta API se sustituyen por el motor compartido, porque esa firma no contiene el producto ni permite incorporar cargos por cuota. No se requiere una migracion de base de datos para este cambio.

Los creditos historicos y las liquidaciones ya guardadas no se recalculan con este cambio. Una nueva liquidacion consulta configuracion vigente y guarda su desglose/plan como snapshot. El calendario de cobro utiliza capital, tasa, plazo y cargos de esa liquidacion. El tratamiento quincenal conserva la conversion existente de tasa mensual/2.

Pruebas: node --test scripts/test-calculo-producto.mjs
Compilacion: npm run build

Verificacion de solo lectura con Libranza Plus configurado: solicitado 10.000.000, fianza 1,2%, seguro 1,5%, afiliacion 112.054, corretaje 1.600.000, capital real 11.982.054, interes mensual 2,13%, plazo 24, cuota inicial 642.871,99.

Cada atributo debe configurar exactamente un campo: porcentaje o valor. Null/cadena vacia indican ausencia; cero es valido. El dato poblado selecciona el calculo aunque el nombre de la formula no coincida. En configuraciones por valor se conservan las operaciones explicitas de valor por plazo y base por valor/divisor. INTERES CORRIENTE requiere porcentaje mensual. La API valida tanto altas como ediciones y el motor rechaza configuraciones ambiguas preexistentes.
