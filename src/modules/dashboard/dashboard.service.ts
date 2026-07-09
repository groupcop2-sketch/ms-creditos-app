import { pool } from '../../lib/db.js';

type DashboardFilters = {
  fechaInicio?: string;
  fechaFin?: string;
};

type CarteraFilters = DashboardFilters & {
  idEmpresa?: number;
  idProducto?: number;
  idSocio?: number;
  estado?: string;
};

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

export async function getDashboardGerencial(filters: DashboardFilters) {
  await ensureCarteraReportColumns();
  const params = [filters.fechaInicio || null, filters.fechaFin || null];
  const creditFilter = `($1::date is null or c.fec_radicacion::date >= $1::date)
    and ($2::date is null or c.fec_radicacion::date <= $2::date)`;

  const [indicators, investors, states, monthly, companies, products, carteraResumen, vencida, proximos, recaudoMensual, carteraEmpresas, carteraProductos, carteraSocios] = await Promise.all([
    pool.query<{
      solicitudes: string;
      monto_solicitado: string;
      saldo_cartera: string;
      recaudo: string;
      cuota_promedio: string;
    }>(
      `select count(*)::int as solicitudes,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto_solicitado,
        coalesce(sum(c.v_valor_pendiente), 0)::numeric as saldo_cartera,
        coalesce(sum(greatest(c.v_valor_credito - c.v_valor_pendiente, 0)), 0)::numeric as recaudo,
        coalesce(avg(c.val_cuota_estimada), 0)::numeric as cuota_promedio
       from "Creditos"."TBL_CREDITOS" c where ${creditFilter}`,
      params
    ),
    pool.query<{ capital: string }>(
      `select coalesce(sum(val_monto), 0)::numeric as capital
       from "Creditos"."TBL_INVERSIONES"
       where ($1::date is null or fec_inversion::date >= $1::date)
         and ($2::date is null or fec_inversion::date <= $2::date)`,
      params
    ),
    pool.query<{ estado: string; cantidad: string; monto: string }>(
      `select coalesce(c.v_estado_solicitud, 'SOLICITADO') as estado,
        count(*)::int as cantidad, coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c where ${creditFilter}
       group by coalesce(c.v_estado_solicitud, 'SOLICITADO') order by cantidad desc`,
      params
    ),
    pool.query<{ periodo: string; cantidad: string; monto: string }>(
      `select to_char(date_trunc('month', c.fec_radicacion), 'YYYY-MM') as periodo,
        count(*)::int as cantidad, coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c where ${creditFilter}
       group by date_trunc('month', c.fec_radicacion)
       order by date_trunc('month', c.fec_radicacion)`,
      params
    ),
    pool.query<{ empresa: string; cantidad: string; monto: string }>(
      `select coalesce(e.v_razon_social, 'Sin empresa') as empresa,
        count(*)::int as cantidad, coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ${creditFilter}
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by monto desc limit 8`,
      params
    ),
    pool.query<{ producto: string; cantidad: string; monto: string }>(
      `select p.nombre as producto, count(*)::int as cantidad,
        coalesce(sum(c.val_monto_solicitado), 0)::numeric as monto
       from "Creditos"."TBL_CREDITOS" c
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
       where ${creditFilter}
       group by p.nombre order by monto desc limit 6`,
      params
    ),
    pool.query<{
      cartera_vencida: string;
      proximos_vencimientos: string;
      recaudo_hoy: string;
      recaudo_mes: string;
      saldo_favor: string;
    }>(
      `select
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
        coalesce((select sum(p.saldo_favor) from "Creditos"."TBL_CREDITO_PAGOS" p), 0)::numeric as saldo_favor`
    ),
    pool.query<{ credito: string; cliente: string; empresa: string; fecha_vencimiento: string; dias_mora: number; saldo: string }>(
      `select c.consecutivo as credito, c.v_nombre_cliente as cliente, coalesce(e.v_razon_social, 'Sin empresa') as empresa,
        min(q.fecha_vencimiento)::text as fecha_vencimiento, max(q.dias_mora)::int as dias_mora,
        sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0))::numeric as saldo
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where q.estado in ('VENCIDA', 'EN_MORA')
       group by c.consecutivo, c.v_nombre_cliente, coalesce(e.v_razon_social, 'Sin empresa')
       order by saldo desc limit 10`
    ),
    pool.query<{ credito: string; cliente: string; producto: string; fecha_vencimiento: string; saldo: string }>(
      `select c.consecutivo as credito, c.v_nombre_cliente as cliente, pc.nombre as producto,
        q.fecha_vencimiento::text as fecha_vencimiento,
        greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       where q.estado <> 'PAGADA' and q.fecha_vencimiento between current_date and current_date + interval '15 days'
       order by q.fecha_vencimiento, saldo desc limit 10`
    ),
    pool.query<{ periodo: string; valor: string; saldo_favor: string }>(
      `select to_char(date_trunc('month', fecha_pago), 'YYYY-MM') as periodo,
        coalesce(sum(valor_pago - saldo_favor), 0)::numeric as valor,
        coalesce(sum(saldo_favor), 0)::numeric as saldo_favor
       from "Creditos"."TBL_CREDITO_PAGOS"
       where ($1::date is null or fecha_pago >= $1::date)
         and ($2::date is null or fecha_pago <= $2::date)
       group by date_trunc('month', fecha_pago)
       order by date_trunc('month', fecha_pago)`,
      params
    ),
    pool.query<{ nombre: string; cantidad: string; saldo: string; vencido: string }>(
      `select coalesce(e.v_razon_social, 'Sin empresa') as nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where q.estado <> 'PAGADA'
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by saldo desc limit 10`
    ),
    pool.query<{ nombre: string; cantidad: string; saldo: string; vencido: string }>(
      `select pc.nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       where q.estado <> 'PAGADA'
       group by pc.nombre
       order by saldo desc limit 10`
    ),
    pool.query<{ nombre: string; cantidad: string; saldo: string }>(
      `select i.v_nombre_completo as nombre, count(distinct f.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) * (f.valor_asignado / nullif(c.val_monto_solicitado, 0))), 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_FONDEO" f
       inner join "Creditos"."TBL_INVERSIONES" inv on inv.id_inversion = f.id_inversion
       inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = f.id_credito
       inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
       where q.estado <> 'PAGADA'
       group by i.v_nombre_completo
       order by saldo desc limit 10`
    )
  ]);

  const row = indicators.rows[0];
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
      saldoFavor: Number(carteraResumen.rows[0]?.saldo_favor ?? 0)
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
    }
  };
}

export async function getReporteCartera(filters: CarteraFilters) {
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
      pool.query<{ id: number; nombre: string }>('select id_empresa as id, v_razon_social as nombre from "Creditos"."TBL_EMPRESAS" order by v_razon_social'),
      pool.query<{ id: number; nombre: string }>('select id_producto_credito as id, nombre from "Creditos"."TBL_PRODUCTOS_CREDITO" order by nombre'),
      pool.query<{ id: number; nombre: string }>('select id_inversionista as id, v_nombre_completo as nombre from "Creditos"."TBL_INVERSIONISTAS" order by v_nombre_completo')
    ]),
    pool.query<{
      saldo_total: string;
      saldo_vencido: string;
      saldo_proximo: string;
      cuotas_pendientes: string;
      saldo_favor: string;
    }>(
      `select
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo_total,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as saldo_vencido,
        coalesce(sum(case when q.estado <> 'PAGADA' and q.fecha_vencimiento between current_date and current_date + interval '15 days' then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as saldo_proximo,
        count(*) filter (where q.estado <> 'PAGADA')::int as cuotas_pendientes,
        coalesce((select sum(p.saldo_favor) from "Creditos"."TBL_CREDITO_PAGOS" p), 0)::numeric as saldo_favor
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       where ${cuotaFilter}`,
      params
    ),
    pool.query<{
      credito: string;
      cliente: string;
      empresa: string;
      producto: string;
      numero_cuota: number;
      fecha_vencimiento: string;
      estado: string;
      dias_mora: number;
      valor_cuota: string;
      valor_mora: string;
      valor_pagado: string;
      saldo: string;
    }>(
      `select c.consecutivo as credito, c.v_nombre_cliente as cliente,
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
       limit 300`,
      params
    ),
    pool.query<{ fecha_pago: string; credito: string; cliente: string; valor_pago: string; saldo_favor: string; medio_pago: string | null }>(
      `select p.fecha_pago::text as fecha_pago, c.consecutivo as credito, c.v_nombre_cliente as cliente,
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
       limit 120`,
      params
    ),
    pool.query<{ nombre: string; cantidad: string; saldo: string; vencido: string }>(
      `select coalesce(e.v_razon_social, 'Sin empresa') as nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = c.id_empresa
       where ${cuotaFilter}
       group by coalesce(e.v_razon_social, 'Sin empresa')
       order by saldo desc limit 50`,
      params
    ),
    pool.query<{ nombre: string; cantidad: string; saldo: string; vencido: string }>(
      `select pc.nombre, count(distinct c.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0)), 0)::numeric as saldo,
        coalesce(sum(case when q.estado in ('VENCIDA', 'EN_MORA') then greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) else 0 end), 0)::numeric as vencido
       from "Creditos"."TBL_CREDITO_CUOTAS" q
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = q.id_credito
       inner join "Creditos"."TBL_PRODUCTOS_CREDITO" pc on pc.id_producto_credito = c.id_producto_credito
       where ${cuotaFilter}
       group by pc.nombre
       order by saldo desc limit 50`,
      params
    ),
    pool.query<{ nombre: string; cantidad: string; saldo: string }>(
      `select i.v_nombre_completo as nombre, count(distinct f.id_credito)::int as cantidad,
        coalesce(sum(greatest(q.valor_cuota + q.valor_mora - q.valor_pagado, 0) * (f.valor_asignado / nullif(c.val_monto_solicitado, 0))), 0)::numeric as saldo
       from "Creditos"."TBL_CREDITO_FONDEO" f
       inner join "Creditos"."TBL_INVERSIONES" inv on inv.id_inversion = f.id_inversion
       inner join "Creditos"."TBL_INVERSIONISTAS" i on i.id_inversionista = inv.id_inversionista
       inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = f.id_credito
       inner join "Creditos"."TBL_CREDITO_CUOTAS" q on q.id_credito = c.id_credito
       where ${cuotaFilter}
       group by i.v_nombre_completo
       order by saldo desc limit 50`,
      params
    )
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
