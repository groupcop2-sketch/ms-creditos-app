import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

export interface FinancieraRow {
  id_financiera: number;
  v_nit: string;
  v_razon_social: string;
  v_sigla: string | null;
  v_correo: string | null;
  v_telefono: string | null;
  v_direccion: string | null;
  v_sitio_web: string | null;
  id_libranzera: number | null;
  ind_activo: boolean;
  fec_creacion: Date;
  fec_actualizacion: Date;
  total_integraciones?: number;
  integraciones_activas?: string[];
}

export interface IntegracionRow {
  id_integracion: number;
  codigo: string;
  nombre: string;
  tipo: string;
  descripcion: string | null;
  url_base: string | null;
  configuracion_schema: any;
  ind_activo: boolean;
  fec_creacion: Date;
}

export interface IntegracionFinancieraRow {
  id_integracion_financiera: number;
  id_financiera: number;
  id_integracion: number;
  codigo_integracion: string;
  nombre_integracion: string;
  tipo_integracion: string;
  ambiente: string;
  client_id: string | null;
  client_secret: string | null;
  account_id: string | null;
  api_key: string | null;
  url_base: string | null;
  webhook_url: string | null;
  datos_conexion: any;
  ind_activo: boolean;
  ind_modo_prueba: boolean;
  fec_creacion: Date;
  fec_actualizacion: Date;
}

export async function ensureFinancieraTables(): Promise<void> {
  await pool.query(`
    create table if not exists "Creditos"."TBL_FINANCIERA" (
      id_financiera serial primary key,
      v_nit varchar(50) not null unique,
      v_razon_social varchar(255) not null,
      v_sigla varchar(100),
      v_correo varchar(150),
      v_telefono varchar(50),
      v_direccion text,
      v_sitio_web varchar(255),
      id_libranzera int,
      ind_activo boolean default true,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now()
    );

    create table if not exists "Creditos"."TBL_INTEGRACIONES" (
      id_integracion serial primary key,
      codigo varchar(50) not null unique,
      nombre varchar(100) not null,
      tipo varchar(50) not null,
      descripcion text,
      url_base varchar(255),
      configuracion_schema jsonb,
      ind_activo boolean default true,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now()
    );

    create table if not exists "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
      id_integracion_financiera serial primary key,
      id_financiera int not null references "Creditos"."TBL_FINANCIERA"(id_financiera) on delete cascade,
      id_integracion int not null references "Creditos"."TBL_INTEGRACIONES"(id_integracion) on delete cascade,
      ambiente varchar(30) default 'PRODUCCION',
      client_id text,
      client_secret text,
      account_id text,
      api_key text,
      url_base text,
      webhook_url text,
      datos_conexion jsonb default '{}'::jsonb,
      ind_activo boolean default true,
      ind_modo_prueba boolean default false,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now(),
      constraint uq_financiera_integracion unique (id_financiera, id_integracion)
    );
  `);
}

// ==================== FINANCIERAS ====================

export async function listFinancieras(): Promise<FinancieraRow[]> {
  await ensureFinancieraTables();

  const result = await pool.query<FinancieraRow>(`
    select
      f.*,
      coalesce(count(tif.id_integracion_financiera) filter (where tif.ind_activo = true), 0)::int as total_integraciones,
      coalesce(
        array_agg(i.codigo) filter (where tif.ind_activo = true and i.codigo is not null),
        array[]::varchar[]
      ) as integraciones_activas
    from "Creditos"."TBL_FINANCIERA" f
    left join "Creditos"."TBL_INTEGRACIONES_FINANCIERA" tif on tif.id_financiera = f.id_financiera
    left join "Creditos"."TBL_INTEGRACIONES" i on i.id_integracion = tif.id_integracion
    group by f.id_financiera
    order by f.ind_activo desc, f.v_razon_social asc
  `);

  return result.rows;
}

export async function getFinancieraById(id: number): Promise<FinancieraRow> {
  await ensureFinancieraTables();

  const res = await pool.query<FinancieraRow>(
    `select * from "Creditos"."TBL_FINANCIERA" where id_financiera = $1`,
    [id]
  );

  if (!res.rowCount) {
    throw new SecurityError(`Financiera con ID ${id} no encontrada`, 404);
  }

  return res.rows[0];
}

export interface CreateFinancieraInput {
  nit: string;
  razonSocial: string;
  sigla?: string | null;
  correo?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  sitioWeb?: string | null;
  idLibranzera?: number | null;
  indActivo?: boolean;
}

export async function createFinanciera(input: CreateFinancieraInput): Promise<FinancieraRow> {
  await ensureFinancieraTables();

  const nitClean = input.nit.trim();
  const duplicate = await pool.query(
    `select 1 from "Creditos"."TBL_FINANCIERA" where v_nit = $1 limit 1`,
    [nitClean]
  );

  if (duplicate.rowCount) {
    throw new SecurityError(`Ya existe una financiera registrada con el NIT ${nitClean}`, 409);
  }

  const res = await pool.query<FinancieraRow>(
    `insert into "Creditos"."TBL_FINANCIERA" (
      v_nit, v_razon_social, v_sigla, v_correo, v_telefono, v_direccion, v_sitio_web, id_libranzera, ind_activo
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning *`,
    [
      nitClean,
      input.razonSocial.trim(),
      input.sigla?.trim() || null,
      input.correo?.trim() || null,
      input.telefono?.trim() || null,
      input.direccion?.trim() || null,
      input.sitioWeb?.trim() || null,
      input.idLibranzera || null,
      input.indActivo ?? true
    ]
  );

  return res.rows[0];
}

export async function updateFinanciera(id: number, input: Partial<CreateFinancieraInput>): Promise<FinancieraRow> {
  await ensureFinancieraTables();
  await getFinancieraById(id);

  const res = await pool.query<FinancieraRow>(
    `update "Creditos"."TBL_FINANCIERA" set
      v_razon_social = coalesce($1, v_razon_social),
      v_sigla = coalesce($2, v_sigla),
      v_correo = coalesce($3, v_correo),
      v_telefono = coalesce($4, v_telefono),
      v_direccion = coalesce($5, v_direccion),
      v_sitio_web = coalesce($6, v_sitio_web),
      ind_activo = coalesce($7, ind_activo),
      fec_actualizacion = now()
    where id_financiera = $8
    returning *`,
    [
      input.razonSocial?.trim() || null,
      input.sigla !== undefined ? (input.sigla?.trim() || null) : null,
      input.correo !== undefined ? (input.correo?.trim() || null) : null,
      input.telefono !== undefined ? (input.telefono?.trim() || null) : null,
      input.direccion !== undefined ? (input.direccion?.trim() || null) : null,
      input.sitioWeb !== undefined ? (input.sitioWeb?.trim() || null) : null,
      input.indActivo,
      id
    ]
  );

  return res.rows[0];
}

// ==================== CATALOGO DE INTEGRACIONES ====================

export async function listIntegraciones(): Promise<IntegracionRow[]> {
  await ensureFinancieraTables();
  const res = await pool.query<IntegracionRow>(
    `select * from "Creditos"."TBL_INTEGRACIONES" order by id_integracion asc`
  );
  return res.rows;
}

export interface CreateIntegracionInput {
  codigo: string;
  nombre: string;
  tipo: string;
  descripcion?: string | null;
  urlBase?: string | null;
  configuracionSchema?: any;
}

export async function createIntegracion(input: CreateIntegracionInput): Promise<IntegracionRow> {
  await ensureFinancieraTables();

  const codeClean = input.codigo.trim().toUpperCase();
  const res = await pool.query<IntegracionRow>(
    `insert into "Creditos"."TBL_INTEGRACIONES" (
      codigo, nombre, tipo, descripcion, url_base, configuracion_schema
    ) values ($1, $2, $3, $4, $5, $6)
    on conflict (codigo) do update set
      nombre = excluded.nombre,
      tipo = excluded.tipo,
      descripcion = excluded.descripcion,
      url_base = excluded.url_base,
      fec_actualizacion = now()
    returning *`,
    [
      codeClean,
      input.nombre.trim(),
      input.tipo.trim().toUpperCase(),
      input.descripcion?.trim() || null,
      input.urlBase?.trim() || null,
      input.configuracionSchema || {}
    ]
  );

  return res.rows[0];
}

// ==================== INTEGRACIONES POR FINANCIERA ====================

export async function listIntegracionesByFinanciera(idFinanciera: number): Promise<IntegracionFinancieraRow[]> {
  await ensureFinancieraTables();
  await getFinancieraById(idFinanciera);

  // Return all catalog integrations left joined with the financiera's settings
  const res = await pool.query<IntegracionFinancieraRow>(
    `select
      coalesce(tif.id_integracion_financiera, 0) as id_integracion_financiera,
      $1::int as id_financiera,
      i.id_integracion,
      i.codigo as codigo_integracion,
      i.nombre as nombre_integracion,
      i.tipo as tipo_integracion,
      coalesce(tif.ambiente, 'PRODUCCION') as ambiente,
      tif.client_id,
      tif.client_secret,
      tif.account_id,
      tif.api_key,
      coalesce(tif.url_base, i.url_base) as url_base,
      tif.webhook_url,
      coalesce(tif.datos_conexion, '{}'::jsonb) as datos_conexion,
      coalesce(tif.ind_activo, false) as ind_activo,
      coalesce(tif.ind_modo_prueba, false) as ind_modo_prueba,
      coalesce(tif.fec_creacion, now()) as fec_creacion,
      coalesce(tif.fec_actualizacion, now()) as fec_actualizacion
    from "Creditos"."TBL_INTEGRACIONES" i
    left join "Creditos"."TBL_INTEGRACIONES_FINANCIERA" tif
      on tif.id_integracion = i.id_integracion and tif.id_financiera = $1
    where i.ind_activo = true
    order by i.id_integracion asc`,
    [idFinanciera]
  );

  return res.rows;
}

export interface UpsertIntegracionFinancieraInput {
  idIntegracion: number;
  ambiente?: string;
  clientId?: string | null;
  clientSecret?: string | null;
  accountId?: string | null;
  apiKey?: string | null;
  urlBase?: string | null;
  webhookUrl?: string | null;
  datosConexion?: any;
  indActivo?: boolean;
  indModoPrueba?: boolean;
}

export async function upsertIntegracionFinanciera(
  idFinanciera: number,
  input: UpsertIntegracionFinancieraInput
): Promise<IntegracionFinancieraRow> {
  await ensureFinancieraTables();
  await getFinancieraById(idFinanciera);

  const res = await pool.query<{ id_integracion_financiera: number }>(
    `insert into "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
      id_financiera, id_integracion, ambiente, client_id, client_secret,
      account_id, api_key, url_base, webhook_url, datos_conexion, ind_activo, ind_modo_prueba
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    on conflict (id_financiera, id_integracion) do update set
      ambiente = excluded.ambiente,
      client_id = coalesce(excluded.client_id, "TBL_INTEGRACIONES_FINANCIERA".client_id),
      client_secret = coalesce(excluded.client_secret, "TBL_INTEGRACIONES_FINANCIERA".client_secret),
      account_id = coalesce(excluded.account_id, "TBL_INTEGRACIONES_FINANCIERA".account_id),
      api_key = coalesce(excluded.api_key, "TBL_INTEGRACIONES_FINANCIERA".api_key),
      url_base = coalesce(excluded.url_base, "TBL_INTEGRACIONES_FINANCIERA".url_base),
      webhook_url = coalesce(excluded.webhook_url, "TBL_INTEGRACIONES_FINANCIERA".webhook_url),
      datos_conexion = coalesce(excluded.datos_conexion, "TBL_INTEGRACIONES_FINANCIERA".datos_conexion),
      ind_activo = coalesce(excluded.ind_activo, "TBL_INTEGRACIONES_FINANCIERA".ind_activo),
      ind_modo_prueba = coalesce(excluded.ind_modo_prueba, "TBL_INTEGRACIONES_FINANCIERA".ind_modo_prueba),
      fec_actualizacion = now()
    returning id_integracion_financiera`,
    [
      idFinanciera,
      input.idIntegracion,
      input.ambiente || 'PRODUCCION',
      input.clientId ?? null,
      input.clientSecret ?? null,
      input.accountId ?? null,
      input.apiKey ?? null,
      input.urlBase ?? null,
      input.webhookUrl ?? null,
      JSON.stringify(input.datosConexion || {}),
      input.indActivo ?? true,
      input.indModoPrueba ?? false
    ]
  );

  const all = await listIntegracionesByFinanciera(idFinanciera);
  const found = all.find((item) => item.id_integracion === input.idIntegracion);
  return found || (all[0] as IntegracionFinancieraRow);
}

export async function toggleIntegracionFinanciera(
  idFinanciera: number,
  idIntegracion: number,
  indActivo: boolean
) {
  await ensureFinancieraTables();
  await pool.query(
    `insert into "Creditos"."TBL_INTEGRACIONES_FINANCIERA" (
      id_financiera, id_integracion, ind_activo
    ) values ($1, $2, $3)
    on conflict (id_financiera, id_integracion) do update set
      ind_activo = $3,
      fec_actualizacion = now()`,
    [idFinanciera, idIntegracion, indActivo]
  );

  return { success: true, idFinanciera, idIntegracion, indActivo };
}

/**
 * Validates whether an integration is active for a given credit or financiera
 */
export async function verificarIntegracionActiva(
  codigoIntegracion: 'JUMIO' | 'DOCUSIGN' | string,
  creditoId?: number | null,
  idFinancieraParam?: number | null
): Promise<{
  activa: boolean;
  idFinanciera: number;
  nombreFinanciera: string;
  clientId: string | null;
  clientSecret: string | null;
  accountId: string | null;
  ambiente: string;
  urlBase: string | null;
  datosConexion: any;
}> {
  await ensureFinancieraTables();

  let idFinanciera = idFinancieraParam;

  if (!idFinanciera && creditoId) {
    const credRes = await pool.query<{ id_financiera: number | null }>(
      `select id_financiera from "Creditos"."TBL_CREDITOS" where id_credito = $1 limit 1`,
      [creditoId]
    );
    if (credRes.rowCount && credRes.rows[0].id_financiera) {
      idFinanciera = credRes.rows[0].id_financiera;
    }
  }

  // Fallback to active financiera (default P&S)
  if (!idFinanciera) {
    const defFin = await pool.query<{ id_financiera: number }>(
      `select id_financiera from "Creditos"."TBL_FINANCIERA" where ind_activo = true order by id_financiera asc limit 1`
    );
    if (defFin.rowCount) {
      idFinanciera = defFin.rows[0].id_financiera;
    }
  }

  if (!idFinanciera) {
    return {
      activa: false,
      idFinanciera: 0,
      nombreFinanciera: 'Sin Financiera Asignada',
      clientId: null,
      clientSecret: null,
      accountId: null,
      ambiente: 'PRODUCCION',
      urlBase: null,
      datosConexion: {}
    };
  }

  const finRes = await pool.query<{ v_razon_social: string }>(
    `select v_razon_social from "Creditos"."TBL_FINANCIERA" where id_financiera = $1`,
    [idFinanciera]
  );
  const nombreFinanciera = finRes.rows[0]?.v_razon_social || 'Financiera';

  const res = await pool.query<IntegracionFinancieraRow>(
    `select
      tif.*,
      i.codigo as codigo_integracion
    from "Creditos"."TBL_INTEGRACIONES_FINANCIERA" tif
    join "Creditos"."TBL_INTEGRACIONES" i on i.id_integracion = tif.id_integracion
    where tif.id_financiera = $1
      and upper(i.codigo) = upper($2)
      and tif.ind_activo = true
      and i.ind_activo = true
    limit 1`,
    [idFinanciera, codigoIntegracion]
  );

  if (!res.rowCount) {
    return {
      activa: false,
      idFinanciera,
      nombreFinanciera,
      clientId: null,
      clientSecret: null,
      accountId: null,
      ambiente: 'PRODUCCION',
      urlBase: null,
      datosConexion: {}
    };
  }

  const row = res.rows[0];
  const hasClient = Boolean(row.client_id?.trim() || row.api_key?.trim());

  return {
    activa: row.ind_activo && hasClient,
    idFinanciera,
    nombreFinanciera,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    accountId: row.account_id,
    ambiente: row.ambiente,
    urlBase: row.url_base,
    datosConexion: row.datos_conexion || {}
  };
}
