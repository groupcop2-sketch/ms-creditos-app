begin;
insert into "Creditos"."TBL_TIPOS_CALCULO_CREDITO"
(des_tipo_calculo,codigo,base_calculo,operacion,expresion,requiere_valor,requiere_valor2,requiere_porcentaje,aplica_minimo,aplica_maximo,activo,multiplica_por_plazo)
select 'Afiliacion: SMMLV por porcentaje por plazo mas valor', 'AFILIACION_SMMLV_PLAZO', 'SMLMV', 'PERSONALIZADA', '(BASE * PORCENTAJE / 100) * PLAZO + VALOR1', true,false,true,false,false,true,false
where not exists (select 1 from "Creditos"."TBL_TIPOS_CALCULO_CREDITO" where codigo='AFILIACION_SMMLV_PLAZO');
update "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
set id_tipo_calculo=(select id_tipo_calculo from "Creditos"."TBL_TIPOS_CALCULO_CREDITO" where codigo='AFILIACION_SMMLV_PLAZO' order by id_tipo_calculo limit 1), modo_calculo='FORMULA',valor=7000,porcentaje=0.2,valor2=null
where id_producto_credito=2 and id_producto_atributo=4 and nombre='AFILIACION COOPHUMANA';
commit;
