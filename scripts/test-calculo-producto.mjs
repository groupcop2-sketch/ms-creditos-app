import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularProducto, money } from '../src/modules/creditos/calculo-producto.ts';
const row = (id, nombre, tipo, porcentaje, valor = null, extra = {}) => ({id_producto_atributo:id,nombre,tipo_atributo:tipo,tipo_calculo:porcentaje == null ? 'Valor fijo' : 'PORCENTAJE',porcentaje,valor,valor2:null,minimo:null,maximo:null,aplica_iva:false,obligatorio:true,prioridad:id,...extra});
const plus = [row(1,'INTERES CORRIENTE','CUOTA',2.13),row(2,'FIANZA DE CREDITOS','CREDITO',1.2),row(3,'SEGURO DE VIDA','CREDITO',1.5),row(4,'AFILIACION','CREDITO',null,112054),row(5,'CORRETAJE','CREDITO',null,1600000)];
test('Libranza Plus finances charges on requested amount and applies monthly interest once',()=> {
 const {resumen:r,plan} = calcularProducto(10000000,24,plus,1300000,19);
 assert.equal(r.valorCredito,11982054); assert.equal(r.cargosFinanciados,1982054);assert.equal(r.valorDesembolso,10000000);assert.equal(r.tasaMensual,2.13);
 assert.equal(plan[0].interes,money(11982054*0.0213)); assert.equal(plan.at(-1).saldoFinal,0);assert.equal(money(plan.reduce((s,p)=>s+p.capital,0)),11982054);
 assert.equal(r.cargosPorCuota,0); assert.equal(r.totalPagar,money(plan.reduce((s,p)=>s+p.cuota,0)));
});
test('configuration changes affect subsequent simulations',()=>{const changed=plus.map(r=>({...r})); changed[0].porcentaje=3; changed[1].porcentaje=2;const r=calcularProducto(10000000,24,changed,1300000,19).resumen; assert.equal(r.tasaMensual,3);assert.equal(r.valorCredito,12062054);});
test('installment charges and VAT are separate from financed capital',()=>{const {resumen:r,plan}=calcularProducto(10000000,24,[plus[0],row(2,'CARGO','CUOTA',1,null,{aplica_iva:true})],1300000,19);assert.equal(r.valorCredito,10000000);assert.equal(r.cargosPorCuota,119000);assert.equal(plan[0].cuota,money(r.cuotaBase+119000));});
test('fixed financed charge includes VAT once',()=>{assert.equal(calcularProducto(1000,12,[plus[0],row(2,'CARGO','CREDITO',null,100,{aplica_iva:true})],1300000,19).resumen.valorCredito,1119);});
test('configured formulas, caps and installment base are evaluated',()=>{const r=calcularProducto(10000000,24,[plus[0],row(2,'CARGO','CREDITO',null,10,{operacion:'VALOR_POR_PLAZO',maximo:200}),row(3,'CUOTA','CUOTA',1,null,{base_calculo:'CUOTA'})],1300000,19).resumen;assert.equal(r.valorCredito,10000200);assert.equal(r.cargosPorCuota,money(r.cuotaBase/100));});
test('zero interest amortizes principal; missing/duplicate interest and invalid divisor fail',()=>{const r=calcularProducto(100,3,[row(1,'INTERES CORRIENTE','CUOTA',0)],1300000,19);assert.equal(r.plan.at(-1).saldoFinal,0);assert.equal(r.resumen.totalIntereses,0);assert.throws(()=>calcularProducto(100,3,[],1300000,19));assert.throws(()=>calcularProducto(100,3,[plus[0],{...plus[0],id_producto_atributo:7}],1300000,19));assert.throws(()=>calcularProducto(100,3,[plus[0],row(2,'CARGO','CREDITO',null,1,{operacion:'BASE_POR_VALOR_DIV_VALOR2'})],1300000,19));});
