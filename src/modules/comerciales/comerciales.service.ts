import type { PoolClient } from 'pg';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

interface CatalogRow {
  id: number;
  nombre: string;
}

interface TextCatalogRow {
  id: string;
  nombre: string;
}

export interface CreateLibranzeraInput {
  nit: string;
  razonSocial: string;
  domicilio?: string | null;
  sitioWeb?: string | null;
  correo?: string | null;
  telefono?: string | null;
  telefonoCallcenter?: string | null;
  camaraNumero?: string | null;
  camaraLibro?: string | null;
  camaraIdCiudad?: number | null;
  fechaConstitucion?: string | null;
  ciiu?: string | null;
  runeol?: string | null;
  representanteLegal?: ContactoLibranzeraInput | null;
  representanteCartera?: ContactoLibranzeraInput | null;
  idBanco?: number | null;
  idTipoCuenta?: number | null;
  numeroCuenta?: string | null;
  idEstado?: number | null;
}

export interface ContactoLibranzeraInput {
  idTipoIdentificacion?: number | null;
  identificacion?: string | null;
  nombre?: string | null;
  genero?: string | null;
  idCiudad?: number | null;
  telefono?: string | null;
  correo?: string | null;
}

export interface CreateComercialInput {
  idLibranzera: number;
  identificacion: string;
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido: string;
  segundoApellido?: string | null;
  fechaNacimiento?: string | null;
  telefono: string;
  correo: string;
  codigoVendedor: string;
  idTipoIdentificacion: number;
  idRolVendedor?: number | null;
  idFormulaComercial?: number | null;
  tipoComision?: 'PORCENTAJE' | 'VALOR_FIJO' | null;
  valorComision?: number | null;
  domicilio?: string | null;
  idCiudad?: number | null;
  idBanco?: number | null;
  idTipoCuenta?: number | null;
  numeroCuenta?: string | null;
  idEstado?: number | null;
}

export type UpdateComercialInput = CreateComercialInput;

interface LibranzeraRow {
  id_libranzera: number;
  v_nit: string;
  v_razon_social: string;
  v_domicilio: string | null;
  v_sitio_web: string | null;
  v_correo: string | null;
  v_telefono: string | null;
  v_telefono_callcenter: string | null;
  camara_numero: string | null;
  camara_libro: string | null;
  camara_id_ciudad: number | null;
  camara_ciudad: string | null;
  fec_constitucion: string | null;
  v_ciiu: string | null;
  v_runeol: string | null;
  rl_nombre: string | null;
  rc_nombre: string | null;
  id_estado: number | null;
  estado: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  v_num_cuenta: string | null;
  vendedores: number;
}

interface ComercialRow {
  id_comercial: number;
  id_libranzera: number;
  libranzera: string;
  v_identificacion: string;
  v_nombre_completo: string;
  v_telefono: string;
  v_correo: string;
  v_codigo_vendedor: string;
  fec_nacimiento: string | null;
  tipo_identificacion: string;
  rol_vendedor: string | null;
  formula_comercial: string | null;
  tipo_comision: string | null;
  valor_comision: string | null;
  v_direccion: string | null;
  ciudad: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  v_num_cuenta: string | null;
  estado: string | null;
}

function normalizeText(value: string) {
  return value.trim();
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

async function withClient<T>(runner: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

async function getActiveStateId(client: PoolClient) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );
  return result.rows[0]?.id_estado ?? null;
}

async function getInactiveStateId(client: PoolClient) {
  const result = await client.query<{ id_estado: number }>(
    `select id_estado from "Creditos"."TBL_ESTADOS"
     where lower(v_descripcion) in ('inactivo', 'inactiva')
     order by id_estado limit 1`
  );
  if (result.rows[0]?.id_estado) return result.rows[0].id_estado;
  const created = await client.query<{ id_estado: number }>(
    `insert into "Creditos"."TBL_ESTADOS" (v_descripcion)
     values ('Inactivo')
     returning id_estado`
  );
  return created.rows[0].id_estado;
}

async function ensureAsesoresTables(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_ROLES_VENDEDOR" (
      id_rol_vendedor serial primary key,
      des_rol_vendedor varchar(120) not null unique,
      id_estado integer null
    )
  `);
  await client.query(`
    create table if not exists "Creditos"."TBL_FORMULAS_COMERCIAL" (
      id_formula_comercial serial primary key,
      des_formula varchar(120) not null unique,
      id_estado integer null
    )
  `);
  await client.query(`
    insert into "Creditos"."TBL_FORMULAS_COMERCIAL" (des_formula)
    values ('Porcentaje'), ('Valor fijo')
    on conflict (des_formula) do nothing
  `);
  await client.query(`
    create table if not exists "Creditos"."TBL_ASESORES" (
      id_asesor serial primary key,
      id_libranzera integer not null references "Creditos"."TBL_LIBRANZERAS"(id_libranzera),
      v_identificacion varchar(40) not null,
      v_primer_nombre varchar(80) not null,
      v_seg_nombre varchar(80) null,
      v_primer_apell varchar(80) not null,
      v_seg_apell varchar(80) null,
      v_nombre_completo varchar(260) not null,
      fec_nacimiento date null,
      v_telefono varchar(60) not null,
      v_correo varchar(180) not null,
      v_codigo_vendedor varchar(60) not null,
      id_tip_identificacion integer not null references "Creditos"."TBL_TIP_IDENTIFICACIONES"(id_tip_identificacion),
      id_rol_vendedor integer null references "Creditos"."TBL_ROLES_VENDEDOR"(id_rol_vendedor),
      id_formula_comercial integer null references "Creditos"."TBL_FORMULAS_COMERCIAL"(id_formula_comercial),
      tipo_comision varchar(20) not null default 'PORCENTAJE',
      valor_comision numeric(18,4) not null default 0,
      v_direccion varchar(260) null,
      id_ciudad integer null references "Creditos"."TBL_CIUDADES"(id_ciudad),
      id_banco integer null references "Creditos"."TBL_BANCOS"(id_banco),
      id_tipo_cuenta integer null references "Creditos"."TBL_TIPO_CUENTAS"(id_tipo_cuenta),
      v_num_cuenta varchar(80) null,
      id_estado integer null references "Creditos"."TBL_ESTADOS"(id_estado),
      fec_creacion timestamp without time zone not null default now(),
      fec_actualizacion timestamp without time zone null
    )
  `);
  await client.query(`
    alter table "Creditos"."TBL_ASESORES"
      add column if not exists tipo_comision varchar(20) not null default 'PORCENTAJE',
      add column if not exists valor_comision numeric(18,4) not null default 0
  `);
}

function fullName(input: CreateComercialInput) {
  return [input.primerNombre, input.segundoNombre, input.primerApellido, input.segundoApellido]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(' ');
}

function mapLibranzera(row: LibranzeraRow) {
  return {
    id: row.id_libranzera,
    nit: row.v_nit,
    razonSocial: row.v_razon_social,
    domicilio: row.v_domicilio,
    sitioWeb: row.v_sitio_web,
    correo: row.v_correo,
    telefono: row.v_telefono,
    telefonoCallcenter: row.v_telefono_callcenter,
    camaraNumero: row.camara_numero,
    camaraLibro: row.camara_libro,
    camaraIdCiudad: row.camara_id_ciudad,
    camaraCiudad: row.camara_ciudad,
    fechaConstitucion: row.fec_constitucion,
    ciiu: row.v_ciiu,
    runeol: row.v_runeol,
    representanteLegal: row.rl_nombre,
    representanteCartera: row.rc_nombre,
    banco: row.banco,
    tipoCuenta: row.tipo_cuenta,
    numeroCuenta: row.v_num_cuenta,
    estado: row.estado,
    vendedores: Number(row.vendedores ?? 0)
  };
}

function mapComercial(row: ComercialRow) {
  return {
    id: row.id_comercial,
    idLibranzera: row.id_libranzera,
    libranzera: row.libranzera,
    identificacion: row.v_identificacion,
    nombreCompleto: row.v_nombre_completo,
    telefono: row.v_telefono,
    correo: row.v_correo,
    codigoVendedor: row.v_codigo_vendedor,
    fechaNacimiento: row.fec_nacimiento,
    tipoIdentificacion: row.tipo_identificacion,
    rolVendedor: row.rol_vendedor,
    formulaComercial: row.formula_comercial,
    tipoComision: row.tipo_comision,
    valorComision: row.valor_comision ? Number(row.valor_comision) : null,
    domicilio: row.v_direccion,
    ciudad: row.ciudad,
    banco: row.banco,
    tipoCuenta: row.tipo_cuenta,
    numeroCuenta: row.v_num_cuenta,
    estado: row.estado
  };
}

const libranzeraSelect = `
  select l.*, est.v_descripcion as estado, c.v_nom_ciudad as camara_ciudad,
    b.des_banco as banco, tc.des_tipo_cuenta as tipo_cuenta, lc.v_num_cuenta,
    (
      coalesce((select count(*)::int from "Creditos"."TBL_ASESORES" a where a.id_libranzera = l.id_libranzera), 0)
      + coalesce((select count(*)::int from "Creditos"."TBL_COMERCIALES" co where co.id_libranzera = l.id_libranzera), 0)
    ) as vendedores
  from "Creditos"."TBL_LIBRANZERAS" l
  left join "Creditos"."TBL_ESTADOS" est on est.id_estado = l.id_estado
  left join "Creditos"."TBL_CIUDADES" c on c.id_ciudad = l.camara_id_ciudad
  left join lateral (
    select * from "Creditos"."TBL_LIBRANZERA_CUENTAS" cta
    where cta.id_libranzera = l.id_libranzera
    order by cta.es_principal desc, cta.id_libranzera_cuenta desc
    limit 1
  ) lc on true
  left join "Creditos"."TBL_BANCOS" b on b.id_banco = lc.id_banco
  left join "Creditos"."TBL_TIPO_CUENTAS" tc on tc.id_tipo_cuenta = lc.id_tipo_cuenta
`;

const comercialSelect = `
  select co.*, l.v_razon_social as libranzera, ti.v_sigla_identificacion as tipo_identificacion,
    rv.des_rol_vendedor as rol_vendedor, fc.des_formula as formula_comercial,
    ci.v_nom_ciudad as ciudad, b.des_banco as banco, tc.des_tipo_cuenta as tipo_cuenta,
    est.v_descripcion as estado
  from (
    select id_asesor as id_comercial, id_libranzera, v_identificacion, v_primer_nombre, v_seg_nombre,
      v_primer_apell, v_seg_apell, v_nombre_completo, fec_nacimiento, v_telefono, v_correo,
      v_codigo_vendedor, id_tip_identificacion, id_rol_vendedor, id_formula_comercial,
      tipo_comision, valor_comision, v_direccion, id_ciudad, id_banco, id_tipo_cuenta,
      v_num_cuenta, id_estado
    from "Creditos"."TBL_ASESORES"
    union all
    select id_comercial, id_libranzera, v_identificacion, v_primer_nombre, v_seg_nombre,
      v_primer_apell, v_seg_apell, v_nombre_completo, fec_nacimiento, v_telefono, v_correo,
      v_codigo_vendedor, id_tip_identificacion, id_rol_vendedor, id_formula_comercial,
      null::varchar as tipo_comision, null::numeric as valor_comision,
      v_direccion, id_ciudad, id_banco, id_tipo_cuenta, v_num_cuenta, id_estado
    from "Creditos"."TBL_COMERCIALES"
  ) co
  inner join "Creditos"."TBL_LIBRANZERAS" l on l.id_libranzera = co.id_libranzera
  inner join "Creditos"."TBL_TIP_IDENTIFICACIONES" ti on ti.id_tip_identificacion = co.id_tip_identificacion
  left join "Creditos"."TBL_ROLES_VENDEDOR" rv on rv.id_rol_vendedor = co.id_rol_vendedor
  left join "Creditos"."TBL_FORMULAS_COMERCIAL" fc on fc.id_formula_comercial = co.id_formula_comercial
  left join "Creditos"."TBL_CIUDADES" ci on ci.id_ciudad = co.id_ciudad
  left join "Creditos"."TBL_BANCOS" b on b.id_banco = co.id_banco
  left join "Creditos"."TBL_TIPO_CUENTAS" tc on tc.id_tipo_cuenta = co.id_tipo_cuenta
  left join "Creditos"."TBL_ESTADOS" est on est.id_estado = co.id_estado
`;

export async function listComercialesCatalogs() {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const [bancos, tiposCuenta, rolesVendedor, formulas, libranzeras, generos] = await Promise.all([
      client.query<CatalogRow>('select id_banco as id, des_banco as nombre from "Creditos"."TBL_BANCOS" order by des_banco'),
      client.query<CatalogRow>('select id_tipo_cuenta as id, des_tipo_cuenta as nombre from "Creditos"."TBL_TIPO_CUENTAS" order by des_tipo_cuenta'),
      client.query<CatalogRow>('select id_rol_vendedor as id, des_rol_vendedor as nombre from "Creditos"."TBL_ROLES_VENDEDOR" order by des_rol_vendedor'),
      client.query<CatalogRow>('select id_formula_comercial as id, des_formula as nombre from "Creditos"."TBL_FORMULAS_COMERCIAL" order by des_formula'),
      client.query<CatalogRow>('select id_libranzera as id, v_razon_social as nombre from "Creditos"."TBL_LIBRANZERAS" order by v_razon_social'),
      client.query<TextCatalogRow>('select cod_genero as id, des_genero as nombre from "Creditos"."TBL_GENEROS" order by des_genero')
    ]);

    return {
      bancos: bancos.rows,
      tiposCuenta: tiposCuenta.rows,
      rolesVendedor: rolesVendedor.rows,
      formulas: formulas.rows,
      libranzeras: libranzeras.rows,
      generos: generos.rows
    };
  });
}

export async function listLibranzeras() {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const result = await client.query<LibranzeraRow>(`${libranzeraSelect} order by l.v_razon_social`);
    return result.rows.map(mapLibranzera);
  });
}

export async function createLibranzera(input: CreateLibranzeraInput) {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const duplicate = await client.query('select 1 from "Creditos"."TBL_LIBRANZERAS" where lower(v_nit) = lower($1) limit 1', [normalizeText(input.nit)]);
    if (duplicate.rowCount) throw new SecurityError('Ya existe una libranzera con ese NIT', 409);

    const stateId = input.idEstado ?? await getActiveStateId(client);
    const created = await client.query<{ id_libranzera: number }>(
      `insert into "Creditos"."TBL_LIBRANZERAS" (
        v_nit, v_razon_social, v_domicilio, v_sitio_web, v_correo, v_telefono, v_telefono_callcenter,
        camara_numero, camara_libro, camara_id_ciudad, fec_constitucion, v_ciiu, v_runeol,
        rl_id_tip_identificacion, rl_identificacion, rl_nombre, rl_genero, rl_id_ciudad,
        rc_id_tip_identificacion, rc_identificacion, rc_nombre, rc_genero, rc_id_ciudad, rc_telefono, rc_correo,
        id_estado
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25,
        $26
      ) returning id_libranzera`,
      [
        normalizeText(input.nit),
        normalizeText(input.razonSocial),
        nullableText(input.domicilio),
        nullableText(input.sitioWeb),
        nullableText(input.correo),
        nullableText(input.telefono),
        nullableText(input.telefonoCallcenter),
        nullableText(input.camaraNumero),
        nullableText(input.camaraLibro),
        input.camaraIdCiudad ?? null,
        input.fechaConstitucion || null,
        nullableText(input.ciiu),
        nullableText(input.runeol),
        input.representanteLegal?.idTipoIdentificacion ?? null,
        nullableText(input.representanteLegal?.identificacion),
        nullableText(input.representanteLegal?.nombre),
        nullableText(input.representanteLegal?.genero),
        input.representanteLegal?.idCiudad ?? null,
        input.representanteCartera?.idTipoIdentificacion ?? null,
        nullableText(input.representanteCartera?.identificacion),
        nullableText(input.representanteCartera?.nombre),
        nullableText(input.representanteCartera?.genero),
        input.representanteCartera?.idCiudad ?? null,
        nullableText(input.representanteCartera?.telefono),
        nullableText(input.representanteCartera?.correo),
        stateId
      ]
    );

    if (input.idBanco && input.idTipoCuenta && nullableText(input.numeroCuenta)) {
      await client.query(
        `insert into "Creditos"."TBL_LIBRANZERA_CUENTAS" (id_libranzera, id_banco, id_tipo_cuenta, v_num_cuenta, es_principal)
         values ($1, $2, $3, $4, true)`,
        [created.rows[0].id_libranzera, input.idBanco, input.idTipoCuenta, nullableText(input.numeroCuenta)]
      );
    }

    const result = await client.query<LibranzeraRow>(`${libranzeraSelect} where l.id_libranzera = $1`, [created.rows[0].id_libranzera]);
    return mapLibranzera(result.rows[0]);
  });
}

export async function listComerciales() {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const result = await client.query<ComercialRow>(`${comercialSelect} order by co.v_nombre_completo`);
    return result.rows.map(mapComercial);
  });
}

export async function createComercial(input: CreateComercialInput) {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const exists = await client.query('select 1 from "Creditos"."TBL_LIBRANZERAS" where id_libranzera = $1 limit 1', [input.idLibranzera]);
    if (!exists.rowCount) throw new SecurityError('Libranzera no encontrada', 404);

    const stateId = input.idEstado ?? await getActiveStateId(client);
    const created = await client.query<{ id_comercial: number }>(
      `insert into "Creditos"."TBL_ASESORES" (
        id_libranzera, v_identificacion, v_primer_nombre, v_seg_nombre, v_primer_apell, v_seg_apell,
        v_nombre_completo, fec_nacimiento, v_telefono, v_correo, v_codigo_vendedor,
        id_tip_identificacion, id_rol_vendedor, id_formula_comercial, tipo_comision, valor_comision, v_direccion, id_ciudad,
        id_banco, id_tipo_cuenta, v_num_cuenta, id_estado
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22
      ) returning id_asesor as id_comercial`,
      [
        input.idLibranzera,
        normalizeText(input.identificacion),
        normalizeText(input.primerNombre),
        nullableText(input.segundoNombre),
        normalizeText(input.primerApellido),
        nullableText(input.segundoApellido),
        fullName(input),
        input.fechaNacimiento || null,
        normalizeText(input.telefono),
        normalizeText(input.correo),
        normalizeText(input.codigoVendedor),
        input.idTipoIdentificacion,
        input.idRolVendedor ?? null,
        input.idFormulaComercial ?? null,
        input.tipoComision ?? 'PORCENTAJE',
        input.valorComision ?? 0,
        nullableText(input.domicilio),
        input.idCiudad ?? null,
        input.idBanco ?? null,
        input.idTipoCuenta ?? null,
        nullableText(input.numeroCuenta),
        stateId
      ]
    );

    const result = await client.query<ComercialRow>(`${comercialSelect} where co.id_comercial = $1`, [created.rows[0].id_comercial]);
    return mapComercial(result.rows[0]);
  });
}

export async function updateComercial(comercialId: number, input: UpdateComercialInput) {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const exists = await client.query<{ id_asesor: number }>(
      'select id_asesor from "Creditos"."TBL_ASESORES" where id_asesor = $1 limit 1',
      [comercialId]
    );
    if (!exists.rowCount) {
      throw new SecurityError('Este asesor no existe en TBL_ASESORES o es un registro antiguo no editable desde esta pantalla', 404);
    }

    const libranzera = await client.query('select 1 from "Creditos"."TBL_LIBRANZERAS" where id_libranzera = $1 limit 1', [input.idLibranzera]);
    if (!libranzera.rowCount) throw new SecurityError('Libranzera no encontrada', 404);

    await client.query(
      `update "Creditos"."TBL_ASESORES"
       set id_libranzera = $2,
           v_identificacion = $3,
           v_primer_nombre = $4,
           v_seg_nombre = $5,
           v_primer_apell = $6,
           v_seg_apell = $7,
           v_nombre_completo = $8,
           fec_nacimiento = $9,
           v_telefono = $10,
           v_correo = $11,
           v_codigo_vendedor = $12,
           id_tip_identificacion = $13,
           id_rol_vendedor = $14,
           id_formula_comercial = $15,
           tipo_comision = $16,
           valor_comision = $17,
           v_direccion = $18,
           id_ciudad = $19,
           id_banco = $20,
           id_tipo_cuenta = $21,
           v_num_cuenta = $22,
           fec_actualizacion = now()
       where id_asesor = $1`,
      [
        comercialId,
        input.idLibranzera,
        normalizeText(input.identificacion),
        normalizeText(input.primerNombre),
        nullableText(input.segundoNombre),
        normalizeText(input.primerApellido),
        nullableText(input.segundoApellido),
        fullName(input),
        input.fechaNacimiento || null,
        normalizeText(input.telefono),
        normalizeText(input.correo),
        normalizeText(input.codigoVendedor),
        input.idTipoIdentificacion,
        input.idRolVendedor ?? null,
        input.idFormulaComercial ?? null,
        input.tipoComision ?? 'PORCENTAJE',
        input.valorComision ?? 0,
        nullableText(input.domicilio),
        input.idCiudad ?? null,
        input.idBanco ?? null,
        input.idTipoCuenta ?? null,
        nullableText(input.numeroCuenta)
      ]
    );

    const result = await client.query<ComercialRow>(`${comercialSelect} where co.id_comercial = $1`, [comercialId]);
    return mapComercial(result.rows[0]);
  });
}

export async function updateComercialEstado(comercialId: number, activo: boolean) {
  return withClient(async (client) => {
    await ensureAsesoresTables(client);
    const stateId = activo ? await getActiveStateId(client) : await getInactiveStateId(client);
    const updated = await client.query<{ id_asesor: number }>(
      `update "Creditos"."TBL_ASESORES"
       set id_estado = $2, fec_actualizacion = now()
       where id_asesor = $1
       returning id_asesor`,
      [comercialId, stateId]
    );
    if (!updated.rowCount) {
      throw new SecurityError('Este asesor no existe en TBL_ASESORES o es un registro antiguo no editable desde esta pantalla', 404);
    }
    const result = await client.query<ComercialRow>(`${comercialSelect} where co.id_comercial = $1`, [comercialId]);
    return mapComercial(result.rows[0]);
  });
}
