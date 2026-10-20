# Simulacion por atributos del producto

El motor calculo-producto.ts se comparte entre simulacion, radicacion, aprobacion y liquidacion. Consulta los atributos y la formula asociada por identificador, sin tasas o cargos fijos del portal.

## Modos

- VALOR_FIJO: usa valor como monto del cargo. No interpreta ese monto como parametro de otra formula.
- PORCENTAJE: aplica porcentaje sobre el monto solicitado.
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

Verificado con los datos vigentes de Libranza Plus: solicitado 10.000.000; seguro (10.000.000/1.000.000)*500*12=60.000; fianza 10.000.000*38%*1,19=4.522.000. A 12 meses: capital real 15.402.000 y cuota 1.466.945,92. A 24 meses: seguro 120.000, capital real 15.462.000 y cuota 828.423,90. Tasa mensual vigente de la comprobacion: 2,1176%.
