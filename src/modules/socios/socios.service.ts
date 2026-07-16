import type { ClientLike } from '../../lib/db.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

interface Queryable {
  query<T>(text: string, values?: unknown[]): Promise<{ rowCount: number; rows: T[] }>;
}

export interface CreateSocioInput {
  identificacion: string;
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido: string;
  segundoApellido?: string | null;
  telefono: string;
  correo: string;
  direccion?: CreateDireccionInput | null;
  idCiudad?: number | null;
  idTipoIdentificacion: number;
  fechaNacimiento?: string | null;
  idBanco?: number | null;
  idTipoCuenta?: number | null;
  numeroCuenta?: string | null;
  idEstado?: number | null;
}

export interface CreateInversionInput {
  monto: number;
  fechaInversion: string;
  plazo: number;
  idTasaInversion: number;
  idEstado?: number | null;
}

export interface CreateDireccionInput {
  idTipoVia: number;
  numPrincipal?: number | null;
  idLetraPrincipal?: number | null;
  bis?: string | null;
  letraBis?: number | null;
  cuadrantePrincipal?: string | null;
  numSecundario?: number | null;
  idLetraSecundaria?: number | null;
  cuadranteSecundario?: string | null;
  complemento?: string | null;
  barrio?: string | null;
  idCiudad: number;
  esPrincipal?: boolean | null;
}

interface SocioRow {
  id_inversionista: number;
  v_identificacion: string;
  v_primer_nombre: string;
  v_seg_nombre: string;
  v_primer_apell: string;
  v_seg_apell: string;
  v_telefono: string;
  v_correo: string;
  v_nombre_completo: string;
  v_direccion: string;
  id_ciudad: number;
  ciudad: string;
  id_estado: number;
  estado: string;
  id_tip_identificacion: number;
  tipo_identificacion: string;
  fec_nacimiento: string | null;
  direccion_compuesta: string | null;
  id_direccion: number | null;
  id_banco: number | null;
  banco: string | null;
  id_tipo_cuenta: number | null;
  tipo_cuenta: string | null;
  num_cuenta: string | null;
  inversiones: number;
  monto_invertido: string | null;
  monto_asignado: string | null;
  saldo_disponible: string | null;
}

interface InversionRow {
  id_inversion: number;
  val_monto: string;
  fec_inversion: string;
  num_plazo: number;
  val_taza: string;
  id_tasa_inversion: number | null;
  tasa_nombre: string | null;
  id_inversionista: number;
  id_estado: number;
  estado: string;
  monto_asignado: string | null;
  saldo_disponible: string | null;
  creditos: string | null;
}

interface CatalogRow {
  id: number;
  nombre: string;
}

interface RateCatalogRow {
  id: number;
  nombre: string;
  tasa: string;
  plazo: number | null;
}

function normalizeText(value: string) {
  return value.trim();
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function nullableDate(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  const latinDate = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (latinDate) {
    return `${latinDate[3]}-${latinDate[2]}-${latinDate[1]}`;
  }
  return normalized;
}

async function withClient<T>(runner: (client: ClientLike) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

async function ensureCreditoFondeoTable(client: ClientLike) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_FONDEO" (
      id_credito_fondeo serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_inversion integer not null references "Creditos"."TBL_INVERSIONES"(id_inversion),
      valor_asignado numeric(18,2) not null,
      fecha_asignacion timestamptz not null default now(),
      observacion text,
      id_usuario integer,
      constraint chk_credito_fondeo_valor check (valor_asignado > 0)
    )
  `);
}

async function ensureInversionistasTableShape(client: ClientLike) {
  await client.query(`
    alter table "Creditos"."TBL_INVERSIONISTAS"
      alter column v_primer_nombre type varchar(80),
      alter column v_seg_nombre type varchar(80),
      alter column v_primer_apell type varchar(80),
      alter column v_seg_apell type varchar(80),
      alter column v_telefono type varchar(30),
      alter column v_correo type varchar(160),
      alter column v_nombre_completo type varchar(220),
      alter column v_direccion type varchar(260)
  `);
}

function nullableNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function getActiveStateId(client: Queryable = pool) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );

  return result.rows[0]?.id_estado;
}

async function getInactiveStateId(client: Queryable = pool) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) in ($1, $2) order by case when lower(v_descripcion) = $1 then 0 else 1 end limit 1',
    ['inactivo', 'inactiva']
  );

  if (!result.rowCount) {
    throw new SecurityError('No existe el estado Inactivo en TBL_ESTADOS', 400);
  }

  return result.rows[0].id_estado;
}

async function getInversionistaEntityTypeId(client: Queryable = pool) {
  await client.query(
    `insert into "Creditos"."TBL_TIPO_ENTIDADES" (des_tipo_entidad, fec_creacion)
     select 'INVERSIONISTA', now()
     where not exists (select 1 from "Creditos"."TBL_TIPO_ENTIDADES" where lower(des_tipo_entidad) = 'inversionista')`
  );

  const result = await client.query<{ id_tipo_entidad: number }>(
    'select id_tipo_entidad from "Creditos"."TBL_TIPO_ENTIDADES" where lower(des_tipo_entidad) = $1 limit 1',
    ['inversionista']
  );

  return result.rows[0].id_tipo_entidad;
}

function buildDireccionText(input: CreateDireccionInput) {
  return [
    input.numPrincipal,
    input.idLetraPrincipal ? `L${input.idLetraPrincipal}` : null,
    input.bis,
    input.letraBis ? `BIS ${input.letraBis}` : null,
    input.cuadrantePrincipal,
    input.numSecundario ? `# ${input.numSecundario}` : null,
    input.idLetraSecundaria ? `L${input.idLetraSecundaria}` : null,
    input.cuadranteSecundario,
    input.complemento,
    input.barrio
  ].filter(Boolean).join(' ');
}

async function upsertSocioDireccion(client: ClientLike, socioId: number, input: CreateDireccionInput) {
  const tipoEntidadId = await getInversionistaEntityTypeId(client);
  const currentPrincipal = await client.query<{ id_direccion: number }>(
    'select id_direccion from "Creditos"."TBL_DIRECCIONES" where id_tipo_entidad = $1 and id_entidad = $2 and coalesce(es_principal, false) = true limit 1',
    [tipoEntidadId, socioId]
  );

  if (input.esPrincipal ?? true) {
    await client.query(
      'update "Creditos"."TBL_DIRECCIONES" set es_principal = false where id_tipo_entidad = $1 and id_entidad = $2',
      [tipoEntidadId, socioId]
    );
  }

  const values = [
    tipoEntidadId,
    socioId,
    input.idTipoVia,
    nullableNumber(input.numPrincipal),
    nullableNumber(input.idLetraPrincipal),
    nullableText(input.bis),
    nullableNumber(input.letraBis),
    nullableText(input.cuadrantePrincipal),
    nullableNumber(input.numSecundario),
    nullableNumber(input.idLetraSecundaria),
    nullableText(input.cuadranteSecundario),
    nullableText(input.complemento),
    nullableText(input.barrio),
    input.idCiudad,
    input.esPrincipal ?? true
  ];

  if (currentPrincipal.rowCount && (input.esPrincipal ?? true)) {
    await client.query(
      `update "Creditos"."TBL_DIRECCIONES" set
        id_tipo_via = $3, num_principal = $4, id_letra_principal = $5, bis = $6,
        letra_bis = $7, cuadrante_principal = $8, num_secundario = $9,
        id_letra_secundaria = $10, cuadrante_secundario = $11, complemento = $12,
        des_barrio = $13, id_ciudad = $14, es_principal = $15
       where id_direccion = $16`,
      [...values, currentPrincipal.rows[0].id_direccion]
    );
  } else {
    await client.query(
      `insert into "Creditos"."TBL_DIRECCIONES" (
        id_tipo_entidad, id_entidad, id_tipo_via, num_principal, id_letra_principal,
        bis, letra_bis, cuadrante_principal, num_secundario, id_letra_secundaria,
        cuadrante_secundario, complemento, des_barrio, id_ciudad, es_principal, fec_creacion
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, now()
      )`,
      values
    );
  }

  await client.query(
    'update "Creditos"."TBL_INVERSIONISTAS" set v_direccion = $1, id_ciudad = $2, fec_actualizacion = now() where id_inversionista = $3',
    [buildDireccionText(input), input.idCiudad, socioId]
  );
}

function buildFullName(input: CreateSocioInput) {
  return [input.primerNombre, input.segundoNombre, input.primerApellido, input.segundoApellido]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(' ');
}

function mapSocio(row: SocioRow) {
  return {
    id: row.id_inversionista,
    identificacion: row.v_identificacion,
    primerNombre: row.v_primer_nombre,
    segundoNombre: row.v_seg_nombre,
    primerApellido: row.v_primer_apell,
    segundoApellido: row.v_seg_apell,
    telefono: row.v_telefono,
    correo: row.v_correo,
    nombreCompleto: row.v_nombre_completo,
    direccion: row.v_direccion,
    idCiudad: row.id_ciudad,
    ciudad: row.ciudad,
    idEstado: row.id_estado,
    estado: row.estado,
    idTipoIdentificacion: row.id_tip_identificacion,
    tipoIdentificacion: row.tipo_identificacion,
    fechaNacimiento: row.fec_nacimiento,
    direccionCompuesta: row.direccion_compuesta,
    idDireccion: row.id_direccion,
    idBanco: row.id_banco,
    banco: row.banco,
    idTipoCuenta: row.id_tipo_cuenta,
    tipoCuenta: row.tipo_cuenta,
    numeroCuenta: row.num_cuenta,
    inversiones: Number(row.inversiones ?? 0),
    montoInvertido: row.monto_invertido ? Number(row.monto_invertido) : 0,
    montoAsignado: row.monto_asignado ? Number(row.monto_asignado) : 0,
    saldoDisponible: row.saldo_disponible ? Number(row.saldo_disponible) : 0
  };
}

function mapInversion(row: InversionRow) {
  return {
    id: row.id_inversion,
    monto: Number(row.val_monto),
    fechaInversion: row.fec_inversion,
    plazo: row.num_plazo,
    tasa: Number(row.val_taza),
    idTasaInversion: row.id_tasa_inversion,
    tasaNombre: row.tasa_nombre,
    idSocio: row.id_inversionista,
    idEstado: row.id_estado,
    estado: row.estado,
    montoAsignado: row.monto_asignado ? Number(row.monto_asignado) : 0,
    saldoDisponible: row.saldo_disponible ? Number(row.saldo_disponible) : Number(row.val_monto),
    creditos: row.creditos ? row.creditos.split('||').filter(Boolean) : []
  };
}

const socioSelect = `
  select i.*, c.v_nom_ciudad as ciudad, e.v_descripcion as estado,
    ti.v_sigla_identificacion as tipo_identificacion,
    dir.id_direccion,
    trim(concat_ws(' ',
      tv.des_tipo_via,
      dir.num_principal,
      lp.des_letra,
      dir.bis,
      lb.des_letra,
      dir.cuadrante_principal,
      '#',
      dir.num_secundario,
      ls.des_letra,
      dir.cuadrante_secundario,
      dir.complemento,
      dir.des_barrio,
      cdir.v_nom_ciudad
    )) as direccion_compuesta,
    bp.id_banco,
    b.des_banco as banco,
    bp.id_tipo_cuenta,
    tc.des_tipo_cuenta as tipo_cuenta,
    bp.num_cuenta,
    (select count(*)::int from "Creditos"."TBL_INVERSIONES" inv where inv.id_inversionista = i.id_inversionista) as inversiones,
    (select coalesce(sum(inv.val_monto), 0)::numeric from "Creditos"."TBL_INVERSIONES" inv where inv.id_inversionista = i.id_inversionista) as monto_invertido,
    (select coalesce(sum(f.valor_asignado), 0)::numeric
      from "Creditos"."TBL_INVERSIONES" inv
      left join "Creditos"."TBL_CREDITO_FONDEO" f on f.id_inversion = inv.id_inversion
      where inv.id_inversionista = i.id_inversionista) as monto_asignado,
    (select coalesce(sum(inv.val_monto), 0)::numeric - coalesce(sum(f.valor_asignado), 0)::numeric
      from "Creditos"."TBL_INVERSIONES" inv
      left join "Creditos"."TBL_CREDITO_FONDEO" f on f.id_inversion = inv.id_inversion
      where inv.id_inversionista = i.id_inversionista) as saldo_disponible
  from "Creditos"."TBL_INVERSIONISTAS" i
  inner join "Creditos"."TBL_CIUDADES" c on c.id_ciudad = i.id_ciudad
  inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = i.id_estado
  inner join "Creditos"."TBL_TIP_IDENTIFICACIONES" ti on ti.id_tip_identificacion = i.id_tip_identificacion
  left join "Creditos"."TBL_TIPO_ENTIDADES" te on lower(te.des_tipo_entidad) = 'inversionista'
  left join "Creditos"."TBL_DIRECCIONES" dir on dir.id_tipo_entidad = te.id_tipo_entidad and dir.id_entidad = i.id_inversionista and coalesce(dir.es_principal, false) = true
  left join "Creditos"."TBL_TIPO_VIA" tv on tv.id_tipo_via = dir.id_tipo_via
  left join "Creditos"."TBL_LETRA_DIR" lp on lp.id_letra_dir = dir.id_letra_principal
  left join "Creditos"."TBL_LETRA_DIR" lb on lb.id_letra_dir = dir.letra_bis
  left join "Creditos"."TBL_LETRA_DIR" ls on ls.id_letra_dir = dir.id_letra_secundaria
  left join "Creditos"."TBL_CIUDADES" cdir on cdir.id_ciudad = dir.id_ciudad
  left join lateral (
    select *
    from "Creditos"."TBL_BANCO_PERSONAS" bp0
    where bp0.id_inversionista = i.id_inversionista
    order by bp0.fec_creacion desc
    limit 1
  ) bp on true
  left join "Creditos"."TBL_BANCOS" b on b.id_banco = bp.id_banco
  left join "Creditos"."TBL_TIPO_CUENTAS" tc on tc.id_tipo_cuenta = bp.id_tipo_cuenta
`;

export async function listSociosCatalogs() {
  return withClient(async (client) => {
    const [tasasInversion, bancos, tiposCuenta] = await Promise.all([
      client.query<RateCatalogRow>(
        `select id_tasa_inversion as id, v_nombre as nombre, val_tasa as tasa, num_plazo as plazo
         from "Creditos"."TBL_TASAS_INVERSION"
         where id_estado is null or id_estado = coalesce((select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = 'activo' limit 1), id_estado)
         order by v_nombre`
      ),
      client.query<CatalogRow>(
        'select id_banco as id, des_banco as nombre from "Creditos"."TBL_BANCOS" order by des_banco'
      ),
      client.query<CatalogRow>(
        'select id_tipo_cuenta as id, des_tipo_cuenta as nombre from "Creditos"."TBL_TIPO_CUENTAS" order by des_tipo_cuenta'
      )
    ]);

    return {
      tasasInversion: tasasInversion.rows.map((item) => ({
        ...item,
        tasa: Number(item.tasa)
      })),
      bancos: bancos.rows,
      tiposCuenta: tiposCuenta.rows
    };
  });
}

export async function listSocios() {
  return withClient(async (client) => {
    await ensureCreditoFondeoTable(client);
    await ensureInversionistasTableShape(client);
    const result = await client.query<SocioRow>(`${socioSelect} order by i.v_nombre_completo`);
    return result.rows.map(mapSocio);
  });
}

export async function createSocio(input: CreateSocioInput) {
  return withClient(async (client) => {
    await ensureCreditoFondeoTable(client);
    await ensureInversionistasTableShape(client);
    await client.query('begin');

    try {
      const duplicate = await client.query(
        'select 1 from "Creditos"."TBL_INVERSIONISTAS" where v_identificacion = $1 limit 1',
        [normalizeText(input.identificacion)]
      );

      if (duplicate.rowCount) {
        throw new SecurityError('Ya existe un socio con esa identificacion', 409);
      }

      const stateId = input.idEstado ?? await getActiveStateId(client);
      const cityId = input.direccion?.idCiudad ?? input.idCiudad;
      if (!cityId) {
        throw new SecurityError('La ciudad del socio es obligatoria', 400);
      }

      const created = await client.query<{ id_inversionista: number }>(
        `insert into "Creditos"."TBL_INVERSIONISTAS" (
        v_identificacion, v_primer_nombre, v_seg_nombre, v_primer_apell, v_seg_apell,
        v_telefono, v_correo, v_num_principal, v_pri_num_casa, v_seg_num_casa,
        v_nombre_completo, v_direccion, fec_creacion, id_ciudad, id_estado,
        id_tip_identificacion, fec_nacimiento
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, now(), $13, $14,
        $15, $16
      ) returning id_inversionista`,
        [
          normalizeText(input.identificacion),
          normalizeText(input.primerNombre),
          nullableText(input.segundoNombre) ?? '',
          normalizeText(input.primerApellido),
          nullableText(input.segundoApellido) ?? '',
          normalizeText(input.telefono),
          normalizeText(input.correo),
          '',
          '',
          '',
          buildFullName(input),
          input.direccion ? buildDireccionText(input.direccion) : '',
          cityId,
          stateId,
          input.idTipoIdentificacion,
          nullableDate(input.fechaNacimiento)
        ]
      );

      if (input.direccion) {
        await upsertSocioDireccion(client, created.rows[0].id_inversionista, input.direccion);
      }

      if (input.idBanco && input.idTipoCuenta && nullableText(input.numeroCuenta)) {
        await client.query(
          `insert into "Creditos"."TBL_BANCO_PERSONAS" (id_banco, id_inversionista, id_tipo_cuenta, num_cuenta, fec_creacion)
         values ($1, $2, $3, $4, now())
         on conflict do nothing`,
          [input.idBanco, created.rows[0].id_inversionista, input.idTipoCuenta, nullableText(input.numeroCuenta)]
        );
      }

      const result = await client.query<SocioRow>(`${socioSelect} where i.id_inversionista = $1`, [created.rows[0].id_inversionista]);
      await client.query('commit');
      return mapSocio(result.rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function updateSocio(socioId: number, input: CreateSocioInput) {
  return withClient(async (client) => {
    await ensureCreditoFondeoTable(client);
    await ensureInversionistasTableShape(client);
    await client.query('begin');

    try {
      const exists = await client.query('select 1 from "Creditos"."TBL_INVERSIONISTAS" where id_inversionista = $1 limit 1', [socioId]);
      if (!exists.rowCount) {
        throw new SecurityError('Socio no encontrado', 404);
      }

      const duplicate = await client.query(
        'select 1 from "Creditos"."TBL_INVERSIONISTAS" where v_identificacion = $1 and id_inversionista <> $2 limit 1',
        [normalizeText(input.identificacion), socioId]
      );

      if (duplicate.rowCount) {
        throw new SecurityError('Ya existe un socio con esa identificacion', 409);
      }

      const cityId = input.direccion?.idCiudad ?? input.idCiudad;
      if (!cityId) {
        throw new SecurityError('La ciudad del socio es obligatoria', 400);
      }

      await client.query(
        `update "Creditos"."TBL_INVERSIONISTAS" set
          v_identificacion = $2, v_primer_nombre = $3, v_seg_nombre = $4, v_primer_apell = $5, v_seg_apell = $6,
          v_telefono = $7, v_correo = $8, v_nombre_completo = $9, v_direccion = $10, id_ciudad = $11,
          id_tip_identificacion = $12, fec_nacimiento = $13, fec_actualizacion = now()
         where id_inversionista = $1`,
        [
          socioId,
          normalizeText(input.identificacion),
          normalizeText(input.primerNombre),
          nullableText(input.segundoNombre) ?? '',
          normalizeText(input.primerApellido),
          nullableText(input.segundoApellido) ?? '',
          normalizeText(input.telefono),
          normalizeText(input.correo),
          buildFullName(input),
          input.direccion ? buildDireccionText(input.direccion) : '',
          cityId,
          input.idTipoIdentificacion,
          nullableDate(input.fechaNacimiento)
        ]
      );

      if (input.direccion) {
        await upsertSocioDireccion(client, socioId, input.direccion);
      }

      if (input.idBanco && input.idTipoCuenta && nullableText(input.numeroCuenta)) {
        await client.query(
          `insert into "Creditos"."TBL_BANCO_PERSONAS" (id_banco, id_inversionista, id_tipo_cuenta, num_cuenta, fec_creacion)
           values ($1, $2, $3, $4, now())`,
          [input.idBanco, socioId, input.idTipoCuenta, nullableText(input.numeroCuenta)]
        );
      }

      const result = await client.query<SocioRow>(`${socioSelect} where i.id_inversionista = $1`, [socioId]);
      await client.query('commit');
      return mapSocio(result.rows[0]);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function updateSocioEstado(socioId: number, activo: boolean) {
  return withClient(async (client) => {
    await ensureInversionistasTableShape(client);
    const stateId = activo ? await getActiveStateId(client) : await getInactiveStateId(client);
    const updated = await client.query(
      'update "Creditos"."TBL_INVERSIONISTAS" set id_estado = $2, fec_actualizacion = now() where id_inversionista = $1 returning id_inversionista',
      [socioId, stateId]
    );
    if (!updated.rowCount) {
      throw new SecurityError('Socio no encontrado', 404);
    }
    const result = await client.query<SocioRow>(`${socioSelect} where i.id_inversionista = $1`, [socioId]);
    return mapSocio(result.rows[0]);
  });
}

export async function listInversiones(socioId?: number) {
  return withClient(async (client) => {
    await ensureCreditoFondeoTable(client);
    const result = await client.query<InversionRow>(
      `select inv.*, e.v_descripcion as estado, tasa.v_nombre as tasa_nombre,
        coalesce(sum(f.valor_asignado), 0)::numeric as monto_asignado,
        (inv.val_monto - coalesce(sum(f.valor_asignado), 0))::numeric as saldo_disponible,
        string_agg(distinct concat(c.consecutivo, ' - ', c.v_nombre_cliente, ' - ', f.valor_asignado), '||') filter (where f.id_credito_fondeo is not null) as creditos
       from "Creditos"."TBL_INVERSIONES" inv
       inner join "Creditos"."TBL_ESTADOS" e on e.id_estado = inv.id_estado
       left join "Creditos"."TBL_TASAS_INVERSION" tasa on tasa.id_tasa_inversion = inv.id_tasa_inversion
       left join "Creditos"."TBL_CREDITO_FONDEO" f on f.id_inversion = inv.id_inversion
       left join "Creditos"."TBL_CREDITOS" c on c.id_credito = f.id_credito
       where ($1::int is null or inv.id_inversionista = $1)
       group by inv.id_inversion, e.v_descripcion, tasa.v_nombre
       order by inv.fec_inversion desc`,
      [socioId ?? null]
    );

    return result.rows.map(mapInversion);
  });
}

export async function createInversion(socioId: number, input: CreateInversionInput) {
  return withClient(async (client) => {
    const exists = await client.query('select 1 from "Creditos"."TBL_INVERSIONISTAS" where id_inversionista = $1 limit 1', [socioId]);
    if (!exists.rowCount) {
      throw new SecurityError('Socio no encontrado', 404);
    }

    const stateId = input.idEstado ?? await getActiveStateId(client);
    const tasa = await client.query<{ id_tasa_inversion: number; val_tasa: string }>(
      'select id_tasa_inversion, val_tasa from "Creditos"."TBL_TASAS_INVERSION" where id_tasa_inversion = $1 limit 1',
      [input.idTasaInversion]
    );

    if (!tasa.rowCount) {
      throw new SecurityError('Tasa de inversion no encontrada', 404);
    }

    const created = await client.query<InversionRow>(
      `insert into "Creditos"."TBL_INVERSIONES" (
        val_monto, fec_inversion, num_plazo, val_taza, id_inversionista, id_estado, id_tasa_inversion
      ) values ($1, $2, $3, $4, $5, $6, $7)
      returning *,
        (select v_descripcion from "Creditos"."TBL_ESTADOS" where id_estado = $6) as estado,
        (select v_nombre from "Creditos"."TBL_TASAS_INVERSION" where id_tasa_inversion = $7) as tasa_nombre`,
      [input.monto, input.fechaInversion, input.plazo, Number(tasa.rows[0].val_tasa), socioId, stateId, input.idTasaInversion]
    );

    return mapInversion(created.rows[0]);
  });
}
