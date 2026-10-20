begin;
alter table "Creditos"."TBL_TIPOS_CALCULO_CREDITO"
  add column if not exists expresion text null,
  add column if not exists multiplica_por_plazo boolean null;
alter table "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
  add column if not exists modo_calculo varchar(20) null check (modo_calculo in ('VALOR_FIJO','PORCENTAJE','FORMULA')),
  add column if not exists tipo_limite varchar(10) null check (tipo_limite in ('MONTO','EDAD'));
-- Confirmed by the owner: these particular stored bounds are ages, not pesos.
update "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS"
set tipo_limite = 'EDAD'
where id_producto_atributo = 2 and id_producto_credito = 2
  and nombre = 'FIANZA DE CREDITOS' and minimo = 18 and maximo = 75
  and tipo_limite is null;
commit;
