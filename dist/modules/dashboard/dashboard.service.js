import { pool } from '../../lib/db.js';
async function ensureCarteraReportColumns() {
    await pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_PAGOS" (
      id_credito_pago serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      fecha_pago date not null,
      valor_pago numeric(18,2) not null,
      saldo_favor numeric(18,2) not null default 0,
      medio_pago varchar(80) null,
      referencia_pago varchar(160) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
    await pool.query(`
    alter table "Creditos"."TBL_CREDITO_PAGOS"
      add column if not exists saldo_favor numeric(18,2) not null default 0
  `);
}
async function ensureOperationalDashboardTables() {
    await pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_DECISIONES" (
      id_credito_decision serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      decision varchar(40) not null,
      monto_aprobado numeric(18,2) null,
      plazo_aprobado integer null,
      tasa_aprobada numeric(10,4) null,
      cuota_aprobada numeric(18,2) null,
      observacion text null,
      id_usuario integer null,
      requiere_comite boolean not null default false,
      votos_requeridos integer null,
      estado_comite varchar(30) null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
    await pool.query(`alter table "Creditos"."TBL_CREDITO_DECISIONES" add column if not exists requiere_comite boolean not null default false`);
    await pool.query(`alter table "Creditos"."TBL_CREDITO_DECISIONES" add column if not exists votos_requeridos integer null`);
    await pool.query(`alter table "Creditos"."TBL_CREDITO_DECISIONES" add column if not exists estado_comite varchar(30) null`);
    await pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_DESEMBOLSOS" (
      id_credito_desembolso serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      valor_desembolso numeric(18,2) not null,
      fecha_desembolso date not null,
      banco_destino varchar(120) null,
      tipo_cuenta varchar(40) null,
      numero_cuenta varchar(80) null,
      referencia_pago varchar(160) null,
      numero_orden varchar(80) null,
      estado_desembolso varchar(30) not null default 'EJECUTADO',
      fecha_orden date null,
      fecha_ejecucion date null,
      comprobante_pago varchar(180) null,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
    await pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" (
      id_credito_liquidacion_final serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      numero_version integer not null,
      estado varchar(30) not null default 'VIGENTE',
      monto_solicitado numeric(18,2) not null,
      monto_aprobado numeric(18,2) null,
      plazo integer not null,
      tasa_mensual numeric(10,4) not null default 0,
      cuota numeric(18,2) not null,
      cargos_financiados numeric(18,2) not null default 0,
      descuentos_desembolso numeric(18,2) not null default 0,
      iva numeric(18,2) not null default 0,
      valor_desembolso numeric(18,2) not null,
      valor_credito numeric(18,2) not null,
      total_intereses numeric(18,2) not null default 0,
      total_pagar numeric(18,2) not null default 0,
      conceptos jsonb not null default '[]'::jsonb,
      plan_pagos jsonb not null default '[]'::jsonb,
      observacion text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}
export async function getDashboardGerencial(filters) {
    await ensureCarteraReportColumns();
    await ensureOperationalDashboardTables();
    const params = [filters.fechaInicio || null, filters.fechaFin || null];
    const creditFilter = `($1::date is null or c.fec_radicacion::date >= $1::date)
    and ($2::date is null or c.fec_radicacion::date <= $2::date)`;
    const [indicators, investors, states, monthly, companies, products, carteraResumen, vencida, proximos, recaudoMensual, carteraEmpresas, carteraProductos, carteraSocios, desembolsos, comitePendiente, liquidacionesPendientes, documentosPendientes, moraEdades, pendientesRol, recaudoPagaduria] = await Promise.all([
        pool.query(`select count(*)::int as solicitudes,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto_solicitado,
        coalesce(sum(c.v_valor_pendiente), 0)::numeric as saldo_cartera,
        coalesce(sum(greatest(c.v_valor_credito - c.v_valor_pendiente, 0)), 0)::numeric as recaudo,
        coalesce(avg(c.val_cuota_estimada), 0)::numeric as cuota_promedio
       from "Creditos"."TBL_CREDITOS" c where ${creditFilter}`, params),
        pool.query(`select coalesce(sum(val_monto), 0)::numeric as capital
       from "Creditos"."TBL_INVERSIONES"
       where ($1::date is null or fec_inversion::date >= $1::date)
         and ($2::date is null or fec_inversion::date <= $2::date)`, params),
        pool.query(`select coalesce(c.v_estado_solicitud, 'SOLICITADO') as estado,
        count(*)::int as cantidad, coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c where ${creditFilter}
       group by coalesce(c.v_estado_solicitud, 'SOLICITADO') order by cantidad desc`, params),
        pool.query(`select to_char(date_trunc('month', c.fec_radicacion), 'YYYY-MM') as periodo,
        count(*)::int as cantidad, coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c where ${creditFilter}
       group by date_trunc('month', c.fec_radicacion)
       order by date_trunc('month', c.fec_radicacion)`, params),
        pool.query(`select coalesce(e.v_razon_social, 'Sin empresa') as empresa,
        count(*)::int as cantidad, coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ${creditFilter}
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by monto desc limit 8`, params),
        pool.query(`select p.nombre as producto, count(*)::int as cantidad,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
       where ${creditFilter}
       group by p.nombre order by monto desc limit 6`, params),
        pool.query(`select
        coalesce((select sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0))
          from "Creditos"."TBL_CREDITO_CUOTAS" q
          where q.estado in ('VENCIDA', 'EN_MORA')), 0)::numeric as cartera_vencida,
        coalesce((select sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0))
          from "Creditos"."TBL_CREDITO_CUOTAS" q
          where q.estado <> 'PAGADA' and q.fecha_vencimiento between current_date and current_date + interval '15 days'), 0)::numeric as proximos_vencimientos,
        coalesce((select sum(p.valor_pago - p.saldo_favor)
          from "Creditos"."TBL_CREDITO_PAGOS" p
          where p.fecha_pago = current_date), 0)::numeric as recaudo_hoy,
        coalesce((select sum(p.valor_pago - p.saldo_favor)
          from "Creditos"."TBL_CREDITO_PAGOS" p
          where date_trunc('month', p.fecha_pago::timestamp) = date_trunc('month', current_date::timestamp)), 0)::numeric as recaudo_mes,
        coalesce((select sum(p.saldo_favor) from "Creditos"."TBL_CREDITO_PAGOS" p), 0)::numeric as saldo_favor`),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente, coalesce(e.v_razon_social, 'Sin empresa') as empresa,
        min(q.fecha_vencimiento)::text as fecha_vencimiento, max(q.dias_mora)::int as dias_mora,
        sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0))::numeric as saldo
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where q.estado in ('VENCIDA', 'EN_MORA')
       group by c.consecutivo, c.v_nombre_cliente, coalesce(e.v_razon_social, 'Sin empresa')
       order by saldo desc limit 10`),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente, pc.nombre as producto,
        q.fecha_vencimiento::text as fecha_vencimiento,
        greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       where q.estado <> 'PAGADA' and q.fecha_vencimiento between current_date and current_date + interval '15 days'
       order by q.fecha_vencimiento, saldo desc limit 10`),
        pool.query(`select to_char(date_trunc('month', fecha_pago), 'YYYY-MM') as periodo,
        coalesce(sum(valor_pago - saldo_favor), 0)::numeric as valor,
        coalesce(sum(saldo_favor), 0)::numeric as saldo_favor
       from "Creditos"."TBL_CREDITO_PAGOS"
       where ($1::date is null or fecha_pago >= $1::date)
         and ($2::date is null or fecha_pago <= $2::date)
       group by date_trunc('month', fecha_pago)
       order by date_trunc('month', fecha_pago)`, params),
        pool.query(`select coalesce(e.v_razon_social, 'Sin empresa') as nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where q.estado <> 'PAGADA'
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by saldo desc limit 10`),
        pool.query(`select pc.nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       where q.estado <> 'PAGADA'
       group by pc.nombre
       order by saldo desc limit 10`),
        pool.query(`select i.v_nombre_completo as nombre, count(distinct f.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) * (f.valor_asignado / nullif(c.val_monto_solicitado, 0))), 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_FONDEO" f
       inner join "Creditos"."TBL_INVERSIONES" inv on inv.id_inversion = f.id_inversion
       inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = f.id_credito
       inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
       where q.estado <> 'PAGADA'
       group by i.v_nombre_completo
       order by saldo desc limit 10`),
        pool.query(`select count(*)::int as cantidad,
        coalesce(sum(valor_desembolso), 0)::numeric as valor,
        count(*) filter (where comprobante_pago is null or comprobante_pago = '')::int as pendientes_comprobante
       from "Creditos"."TBL_CREDITO_DESEMBOLSOS"
       where estado_desembolso <> 'ANULADO'
         and ($1::date is null or fecha_desembolso >= $1::date)
         and ($2::date is null or fecha_desembolso <= $2::date)`, params),
        pool.query(`select count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c
       where c.v_estado_solicitud = 'COMITE_PENDIENTE'`),
        pool.query(`select count(*)::int as cantidad, coalesce(sum(l.valor_desembolso), 0)::numeric as valor_desembolso
       from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l
       where l.estado = 'VIGENTE'
         and not exists (
           select 1 from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d
           where d.id_credito = l.id_credito and d.estado_desembolso <> 'ANULADO'
         )`),
        pool.query(`select count(*)::int as cantidad
       from "Creditos"."TBL_CREDITO_DOCUMENTOS"
       where estado_documento not in ('APROBADO', 'VALIDADO')`).catch(() => ({ rows: [{ cantidad: '0' }] })),
        pool.query(`select case
          when q.dias_mora between 1 and 30 then '1-30'
          when q.dias_mora between 31 and 60 then '31-60'
          when q.dias_mora between 61 and 90 then '61-90'
          when q.dias_mora > 90 then '+90'
          else 'Sin mora'
        end as rango,
        count(distinct q.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       where q.estado <> 'PAGADA'
       group by 1
       order by min(q.dias_mora)`),
        pool.query(`select case
          when c.v_estado_solicitud in ('SOLICITADO', 'RADICADO', 'DOCUMENTOS') then 'Asesor'
          when c.v_estado_solicitud in ('EN_ESTUDIO', 'ESTUDIO', 'ANALISIS') then 'Analista'
          when c.v_estado_solicitud = 'COMITE_PENDIENTE' then 'Comite'
          when c.v_estado_solicitud in ('EN_APROBACION', 'APROBADO') then 'Tesoreria'
          when c.v_estado_solicitud in ('DESEMBOLSADO', 'EN_CARTERA') then 'Cartera'
          else 'Operacion'
        end as rol,
        count(*)::int as cantidad,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as valor
       from "Creditos"."TBL_CREDITOS" c
       where coalesce(c.v_estado_solicitud, '') not in ('RECHAZADO', 'CANCELADO', 'PAGADO')
       group by 1
       order by cantidad desc`),
        pool.query(`select coalesce(e.v_razon_social, 'Sin empresa') as nombre,
        coalesce(sum(p.valor_pago - p.saldo_favor), 0)::numeric as valor,
        count(*)::int as pagos
       from "Creditos"."TBL_CREDITO_PAGOS" p
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = p.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ($1::date is null or p.fecha_pago >= $1::date)
         and ($2::date is null or p.fecha_pago <= $2::date)
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by valor desc limit 8`, params)
    ]);
    const row = indicators.rows[0];
    const desembolsoRow = desembolsos.rows[0];
    const comiteRow = comitePendiente.rows[0];
    const liquidacionRow = liquidacionesPendientes.rows[0];
    const documentosRow = documentosPendientes.rows[0];
    const alertas = [
        { tipo: 'COMITE', titulo: 'Aprobaciones de comite', cantidad: Number(comiteRow?.cantidad ?? 0), valor: Number(comiteRow?.monto ?? 0), severidad: Number(comiteRow?.cantidad ?? 0) > 0 ? 'ALTA' : 'INFO' },
        { tipo: 'LIQUIDACION', titulo: 'Liquidaciones sin desembolso', cantidad: Number(liquidacionRow?.cantidad ?? 0), valor: Number(liquidacionRow?.valor_desembolso ?? 0), severidad: Number(liquidacionRow?.cantidad ?? 0) > 0 ? 'MEDIA' : 'INFO' },
        { tipo: 'DESEMBOLSO', titulo: 'Desembolsos sin comprobante', cantidad: Number(desembolsoRow?.pendientes_comprobante ?? 0), valor: 0, severidad: Number(desembolsoRow?.pendientes_comprobante ?? 0) > 0 ? 'MEDIA' : 'INFO' },
        { tipo: 'DOCUMENTOS', titulo: 'Documentos pendientes', cantidad: Number(documentosRow?.cantidad ?? 0), valor: 0, severidad: Number(documentosRow?.cantidad ?? 0) > 0 ? 'MEDIA' : 'INFO' }
    ];
    return {
        indicadores: {
            solicitudes: Number(row.solicitudes),
            montoSolicitado: Number(row.monto_solicitado),
            capitalInversionistas: Number(investors.rows[0]?.capital ?? 0),
            saldoCartera: Number(row.saldo_cartera),
            recaudo: Number(row.recaudo),
            cuotaPromedio: Number(row.cuota_promedio),
            carteraVencida: Number(carteraResumen.rows[0]?.cartera_vencida ?? 0),
            proximosVencimientos: Number(carteraResumen.rows[0]?.proximos_vencimientos ?? 0),
            recaudoHoy: Number(carteraResumen.rows[0]?.recaudo_hoy ?? 0),
            recaudoMes: Number(carteraResumen.rows[0]?.recaudo_mes ?? 0),
            saldoFavor: Number(carteraResumen.rows[0]?.saldo_favor ?? 0),
            desembolsosPeriodo: Number(desembolsoRow?.valor ?? 0),
            cantidadDesembolsos: Number(desembolsoRow?.cantidad ?? 0),
            comitePendiente: Number(comiteRow?.cantidad ?? 0),
            valorComitePendiente: Number(comiteRow?.monto ?? 0),
            liquidacionesPendientes: Number(liquidacionRow?.cantidad ?? 0),
            valorLiquidacionesPendientes: Number(liquidacionRow?.valor_desembolso ?? 0),
            documentosPendientes: Number(documentosRow?.cantidad ?? 0)
        },
        estados: states.rows.map((item) => ({ estado: item.estado, cantidad: Number(item.cantidad), monto: Number(item.monto) })),
        mensual: monthly.rows.map((item) => ({ periodo: item.periodo, cantidad: Number(item.cantidad), monto: Number(item.monto) })),
        empresas: companies.rows.map((item) => ({ empresa: item.empresa, cantidad: Number(item.cantidad), monto: Number(item.monto) })),
        productos: products.rows.map((item) => ({ producto: item.producto, cantidad: Number(item.cantidad), monto: Number(item.monto) })),
        cartera: {
            vencida: vencida.rows.map((item) => ({ credito: item.credito, cliente: item.cliente, empresa: item.empresa, fechaVencimiento: item.fecha_vencimiento, diasMora: item.dias_mora, saldo: Number(item.saldo) })),
            proximosVencimientos: proximos.rows.map((item) => ({ credito: item.credito, cliente: item.cliente, producto: item.producto, fechaVencimiento: item.fecha_vencimiento, saldo: Number(item.saldo) })),
            recaudoMensual: recaudoMensual.rows.map((item) => ({ periodo: item.periodo, valor: Number(item.valor), saldoFavor: Number(item.saldo_favor) })),
            porEmpresa: carteraEmpresas.rows.map((item) => ({ nombre: item.nombre, cantidad: Number(item.cantidad), saldo: Number(item.saldo), vencido: Number(item.vencido) })),
            porProducto: carteraProductos.rows.map((item) => ({ nombre: item.nombre, cantidad: Number(item.cantidad), saldo: Number(item.saldo), vencido: Number(item.vencido) })),
            porSocio: carteraSocios.rows.map((item) => ({ nombre: item.nombre, cantidad: Number(item.cantidad), saldo: Number(item.saldo) }))
        },
        moraEdades: moraEdades.rows.map((item) => ({ rango: item.rango, cantidad: Number(item.cantidad), saldo: Number(item.saldo) })),
        pendientesRol: pendientesRol.rows.map((item) => ({ rol: item.rol, cantidad: Number(item.cantidad), valor: Number(item.valor) })),
        recaudoPagaduria: recaudoPagaduria.rows.map((item) => ({ nombre: item.nombre, valor: Number(item.valor), pagos: Number(item.pagos) })),
        alertas
    };
}
export async function getReporteCartera(filters) {
    await ensureCarteraReportColumns();
    const params = [
        filters.fechaInicio || null,
        filters.fechaFin || null,
        filters.idEmpresa || null,
        filters.idProducto || null,
        filters.idSocio || null,
        filters.estado || null
    ];
    const cuotaFilter = `($1::date is null or q.fecha_vencimiento >= $1::date)
    and ($2::date is null or q.fecha_vencimiento <= $2::date)
    and ($3::int is null or c.id_empresa = $3::int)
    and ($4::int is null or c.id_producto_credito = $4::int)
    and ($5::int is null or exists (
      select 1 from "Creditos"."TBL_CREDITO_FONDEO" fx
      inner join "Creditos"."TBL_INVERSIONES" ix on ix.id_inversion = fx.id_inversion
      where fx.id_credito = c.id_credito and ix.id_inversionista = $5::int
    ))
    and ($6::varchar is null or q.estado = $6::varchar)`;
    const [catalogos, resumen, cuotas, recaudos, empresas, productos, socios] = await Promise.all([
        Promise.all([
            pool.query('select id_empresa as id, v_razon_social as nombre from "Creditos"."TBL_EMPRESAS" order by v_razon_social'),
            pool.query('select id_producto_credito as id, nombre from "Creditos"."TBL_PRODUCTOS_CREDITO" order by nombre'),
            pool.query('select id_inversionista as id, v_nombre_completo as nombre from "Creditos"."TBL_INVERSIONISTAS" order by v_nombre_completo')
        ]),
        pool.query(`select
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo_total,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as saldo_vencido,
        coalesce(sum(case when q.estado <> 'PAGADA' and q.fecha_vencimiento between current_date and current_date + interval '15 days' then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as saldo_proximo,
        count(*) filter (where q.estado <> 'PAGADA')::int as cuotas_pendientes,
        coalesce((select sum(p.saldo_favor) from "Creditos"."TBL_CREDITO_PAGOS" p), 0)::numeric as saldo_favor
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       where ${cuotaFilter}`, params),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente,
        coalesce(e.v_razon_social, 'Sin empresa') as empresa, pc.nombre as producto,
        q.numero_cuota, q.fecha_vencimiento::text as fecha_vencimiento, q.estado, q.dias_mora,
        q.valor_cuota, q.valor_mora, q.valor_pagado,
        greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ${cuotaFilter}
       order by q.fecha_vencimiento, q.estado, saldo desc
       limit 300`, params),
        pool.query(`select p.fecha_pago::text as fecha_pago, c.consecutivo as credito, c.v_nombre_cliente as cliente,
        p.valor_pago, p.saldo_favor, p.medio_pago
       from "Creditos"."TBL_CREDITO_PAGOS" p
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = p.id_credito
       where ($1::date is null or p.fecha_pago >= $1::date)
         and ($2::date is null or p.fecha_pago <= $2::date)
         and ($3::int is null or c.id_empresa = $3::int)
         and ($4::int is null or c.id_producto_credito = $4::int)
         and ($5::int is null or exists (
           select 1 from "Creditos"."TBL_CREDITO_FONDEO" fx
           inner join "Creditos"."TBL_INVERSIONES" ix on ix.id_inversion = fx.id_inversion
           where fx.id_credito = c.id_credito and ix.id_inversionista = $5::int
         ))
       order by p.fecha_pago desc, p.id_credito_pago desc
       limit 120`, params),
        pool.query(`select coalesce(e.v_razon_social, 'Sin empresa') as nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ${cuotaFilter}
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by saldo desc limit 50`, params),
        pool.query(`select pc.nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       where ${cuotaFilter}
       group by pc.nombre
       order by saldo desc limit 50`, params),
        pool.query(`select i.v_nombre_completo as nombre, count(distinct f.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) * (f.valor_asignado / nullif(c.val_monto_solicitado, 0))), 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_FONDEO" f
       inner join "Creditos"."TBL_INVERSIONES" inv on inv.id_inversion = f.id_inversion
       inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = f.id_credito
       inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
       where ${cuotaFilter}
       group by i.v_nombre_completo
       order by saldo desc limit 50`, params)
    ]);
    const row = resumen.rows[0];
    return {
        filtros: {
            empresas: catalogos[0].rows,
            productos: catalogos[1].rows,
            socios: catalogos[2].rows,
            estados: ['PENDIENTE', 'ABONO_PARCIAL', 'VENCIDA', 'EN_MORA', 'PAGADA']
        },
        resumen: {
            saldoTotal: Number(row?.saldo_total ?? 0),
            saldoVencido: Number(row?.saldo_vencido ?? 0),
            saldoProximo: Number(row?.saldo_proximo ?? 0),
            cuotasPendientes: Number(row?.cuotas_pendientes ?? 0),
            saldoFavor: Number(row?.saldo_favor ?? 0)
        },
        cuotas: cuotas.rows.map((item) => ({
            credito: item.credito,
            cliente: item.cliente,
            empresa: item.empresa,
            producto: item.producto,
            numeroCuota: item.numero_cuota,
            fechaVencimiento: item.fecha_vencimiento,
            estado: item.estado,
            diasMora: item.dias_mora,
            valorCuota: Number(item.valor_cuota),
            valorMora: Number(item.valor_mora),
            valorPagado: Number(item.valor_pagado),
            saldo: Number(item.saldo)
        })),
        recaudos: recaudos.rows.map((item) => ({
            fechaPago: item.fecha_pago,
            credito: item.credito,
            cliente: item.cliente,
            valorPago: Number(item.valor_pago),
            saldoFavor: Number(item.saldo_favor),
            medioPago: item.medio_pago
        })),
        porEmpresa: empresas.rows.map((item) => ({ nombre: item.nombre, cantidad: Number(item.cantidad), saldo: Number(item.saldo), vencido: Number(item.vencido) })),
        porProducto: productos.rows.map((item) => ({ nombre: item.nombre, cantidad: Number(item.cantidad), saldo: Number(item.saldo), vencido: Number(item.vencido) })),
        porSocio: socios.rows.map((item) => ({ nombre: item.nombre, cantidad: Number(item.cantidad), saldo: Number(item.saldo) }))
    };
}
export async function getReporteOperativo(filters) {
    await ensureCarteraReportColumns();
    await ensureOperationalDashboardTables();
    const params = [filters.fechaInicio || null, filters.fechaFin || null, filters.idEmpresa || null, filters.idProducto || null, filters.estado || null];
    const creditoFilter = `($1::date is null or c.fec_radicacion::date >= $1::date)
    and ($2::date is null or c.fec_radicacion::date <= $2::date)
    and ($3::int is null or c.id_empresa = $3::int)
    and ($4::int is null or c.id_producto_credito = $4::int)
    and ($5::varchar is null or c.v_estado_solicitud = $5::varchar)`;
    const [catalogos, resumen, solicitudes, desembolsos, liquidaciones, comite] = await Promise.all([
        Promise.all([
            pool.query('select id_empresa as id, v_razon_social as nombre from "Creditos"."TBL_EMPRESAS" order by v_razon_social'),
            pool.query('select id_producto_credito as id, nombre from "Creditos"."TBL_PRODUCTOS_CREDITO" order by nombre'),
            pool.query(`select distinct coalesce(v_estado_solicitud, 'SOLICITADO') as estado from "Creditos"."TBL_CREDITOS" order by 1`)
        ]),
        pool.query(`select
        count(*)::int as solicitudes,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto_solicitado,
        count(*) filter (where c.v_estado_solicitud in ('APROBADO', 'EN_APROBACION', 'DESEMBOLSADO', 'EN_CARTERA'))::int as aprobadas,
        count(*) filter (where c.v_estado_solicitud = 'RECHAZADO')::int as rechazadas,
        count(*) filter (where c.v_estado_solicitud = 'COMITE_PENDIENTE')::int as comite_pendiente,
        coalesce((select count(*) from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l where l.estado = 'VIGENTE' and not exists (select 1 from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d where d.id_credito = l.id_credito and d.estado_desembolso <> 'ANULADO')), 0)::int as liquidaciones_pendientes,
        coalesce((select sum(l.valor_desembolso) from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l where l.estado = 'VIGENTE' and not exists (select 1 from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d where d.id_credito = l.id_credito and d.estado_desembolso <> 'ANULADO')), 0)::numeric as valor_liquidaciones_pendientes,
        coalesce((select count(*) from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d where d.estado_desembolso <> 'ANULADO' and ($1::date is null or d.fecha_desembolso >= $1::date) and ($2::date is null or d.fecha_desembolso <= $2::date)), 0)::int as desembolsos,
        coalesce((select sum(d.valor_desembolso) from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d where d.estado_desembolso <> 'ANULADO' and ($1::date is null or d.fecha_desembolso >= $1::date) and ($2::date is null or d.fecha_desembolso <= $2::date)), 0)::numeric as valor_desembolsado
       from "Creditos"."TBL_CREDITOS" c
       where ${creditoFilter}`, params),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente, coalesce(e.v_razon_social, 'Sin empresa') as empresa, pc.nombre as producto,
        coalesce(c.v_estado_solicitud, 'SOLICITADO') as estado, c.fec_radicacion::text as fecha, c.val_monto_solicitado as monto, c.num_plazo as plazo, c.val_cuota_estimada as cuota
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ${creditoFilter}
       order by c.fec_radicacion desc, c.id_credito desc
       limit 300`, params),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente, coalesce(e.v_razon_social, 'Sin empresa') as empresa, d.fecha_desembolso::text as fecha_desembolso,
        d.valor_desembolso, d.banco_destino, d.numero_orden, d.estado_desembolso, d.comprobante_pago
       from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = d.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where d.estado_desembolso <> 'ANULADO'
         and ($1::date is null or d.fecha_desembolso >= $1::date)
         and ($2::date is null or d.fecha_desembolso <= $2::date)
         and ($3::int is null or c.id_empresa = $3::int)
         and ($4::int is null or c.id_producto_credito = $4::int)
       order by d.fecha_desembolso desc, d.id_credito_desembolso desc
       limit 200`, params),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente, coalesce(e.v_razon_social, 'Sin empresa') as empresa, l.numero_version as version,
        l.fec_creacion::text as fecha, l.valor_desembolso, l.valor_credito, l.cuota
       from "Creditos"."TBL_CREDITO_LIQUIDACIONES_FINALES" l
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = l.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where l.estado = 'VIGENTE'
         and not exists (select 1 from "Creditos"."TBL_CREDITO_DESEMBOLSOS" d where d.id_credito = l.id_credito and d.estado_desembolso <> 'ANULADO')
         and ($3::int is null or c.id_empresa = $3::int)
         and ($4::int is null or c.id_producto_credito = $4::int)
       order by l.fec_creacion desc
       limit 200`, params),
        pool.query(`select c.consecutivo as credito, c.v_nombre_cliente as cliente, coalesce(e.v_razon_social, 'Sin empresa') as empresa, c.val_monto_solicitado as monto,
        count(distinct d.id_usuario)::int::text as votos, max(d.votos_requeridos) as votos_requeridos, max(d.fec_creacion)::text as fecha
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       left join "Creditos"."TBL_CREDITO_DECISIONES" d on d.id_credito = c.id_credito and d.requiere_comite = true and d.estado_comite in ('PENDIENTE', 'APROBADO')
       where c.v_estado_solicitud = 'COMITE_PENDIENTE'
         and ($3::int is null or c.id_empresa = $3::int)
         and ($4::int is null or c.id_producto_credito = $4::int)
       group by c.consecutivo, c.v_nombre_cliente, coalesce(e.v_razon_social, 'Sin empresa'), c.val_monto_solicitado
       order by fecha desc nulls last
       limit 200`, params)
    ]);
    const row = resumen.rows[0];
    return {
        filtros: { empresas: catalogos[0].rows, productos: catalogos[1].rows, estados: catalogos[2].rows.map((item) => item.estado) },
        resumen: {
            solicitudes: Number(row?.solicitudes ?? 0), montoSolicitado: Number(row?.monto_solicitado ?? 0), aprobadas: Number(row?.aprobadas ?? 0), rechazadas: Number(row?.rechazadas ?? 0),
            comitePendiente: Number(row?.comite_pendiente ?? 0), liquidacionesPendientes: Number(row?.liquidaciones_pendientes ?? 0), valorLiquidacionesPendientes: Number(row?.valor_liquidaciones_pendientes ?? 0),
            desembolsos: Number(row?.desembolsos ?? 0), valorDesembolsado: Number(row?.valor_desembolsado ?? 0)
        },
        solicitudes: solicitudes.rows.map((item) => ({ credito: item.credito, cliente: item.cliente, empresa: item.empresa, producto: item.producto, estado: item.estado, fecha: item.fecha, monto: Number(item.monto), plazo: item.plazo, cuota: item.cuota ? Number(item.cuota) : null })),
        desembolsos: desembolsos.rows.map((item) => ({ credito: item.credito, cliente: item.cliente, empresa: item.empresa, fechaDesembolso: item.fecha_desembolso, valorDesembolso: Number(item.valor_desembolso), bancoDestino: item.banco_destino, numeroOrden: item.numero_orden, estadoDesembolso: item.estado_desembolso, comprobantePago: item.comprobante_pago })),
        liquidacionesPendientes: liquidaciones.rows.map((item) => ({ credito: item.credito, cliente: item.cliente, empresa: item.empresa, version: item.version, fecha: item.fecha, valorDesembolso: Number(item.valor_desembolso), valorCredito: Number(item.valor_credito), cuota: Number(item.cuota) })),
        comite: comite.rows.map((item) => ({ credito: item.credito, cliente: item.cliente, empresa: item.empresa, monto: Number(item.monto), votos: Number(item.votos), votosRequeridos: item.votos_requeridos, fecha: item.fecha }))
    };
}
