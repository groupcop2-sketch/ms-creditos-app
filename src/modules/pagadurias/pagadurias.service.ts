import type { ClientLike } from '../../lib/db.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

interface Queryable {
  query<T>(text: string, values?: unknown[]): Promise<{ rowCount: number; rows: T[] }>;
}

export interface CreateEmpresaInput {
  nit: string;
  razonSocial: string;
  vendedor?: string | null;
  domicilio?: string | null;
  correo?: string | null;
  telefono?: string | null;
  representanteLegal?: string | null;
  telefonoRepresentante?: string | null;
  tipoIdentificacionRepresentante?: string | null;
  identificacionRepresentante?: string | null;
  correoRepresentante?: string | null;
  codigo?: string | null;
  contactoCargo?: string | null;
  contactoNombre?: string | null;
  contactoCorreo?: string | null;
  contactoTelefono?: string | null;
  fechaConstitucion?: string | null;
  capitalSociedad?: number | null;
  fechaVenta?: string | null;
  ventasFecha?: number | null;
  naturaleza?: string | null;
  camaraNumero?: string | null;
  camaraLibro?: string | null;
  camaraCiudad?: string | null;
  periodicidadNomina?: 'MENSUAL' | 'QUINCENAL' | null;
  diaCorteNomina?: number | null;
  diaPagoNomina?: number | null;
  segundoDiaPagoNomina?: number | null;
  diaDescuentoLibranza?: number | null;
  ajustarFinSemana?: boolean | null;
  observacionCalendario?: string | null;
  direccion?: CreateDireccionInput | null;
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

export interface CreateEmpleadoInput {
  idTipoIdentificacion?: number | null;
  identificacion: string;
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido?: string | null;
  segundoApellido?: string | null;
  nombreCompleto?: string | null;
  correo?: string | null;
  telefono?: string | null;
  cargo?: string | null;
  idTipoContrato?: number | null;
  salario?: number | null;
  idBanco?: number | null;
  idTipoCuenta?: number | null;
  cuentaNomina?: string | null;
  tieneEmbargos?: boolean | null;
  idEstadoCivil?: number | null;
  personasCargo?: number | null;
  idTipoVivienda?: number | null;
  fechaIngreso?: string | null;
  idEstado?: number | null;
}

interface EmpresaRow {
  id_empresa: number;
  v_nit: string;
  v_razon_social: string;
  v_vendedor: string | null;
  v_domicilio: string | null;
  v_correo: string | null;
  v_telefono: string | null;
  v_representante_legal: string | null;
  v_telefono_representante: string | null;
  v_tipo_identificacion_representante: string | null;
  v_identificacion_representante: string | null;
  v_correo_representante: string | null;
  v_codigo: string | null;
  v_contacto_cargo: string | null;
  v_contacto_nombre: string | null;
  v_contacto_correo: string | null;
  v_contacto_telefono: string | null;
  fec_constitucion: string | null;
  val_capital_sociedad: string | null;
  fec_venta: string | null;
  val_ventas_fecha: string | null;
  v_naturaleza: string | null;
  v_camara_numero: string | null;
  v_camara_libro: string | null;
  v_camara_ciudad: string | null;
  id_estado: number | null;
  estado: string | null;
  empleados: number;
  direccion_compuesta: string | null;
  id_direccion: number | null;
  periodicidad_nomina: string | null;
  dia_corte_nomina: number | null;
  dia_pago_nomina: number | null;
  segundo_dia_pago_nomina: number | null;
  dia_descuento_libranza: number | null;
  ajustar_fin_semana: boolean | null;
  observacion_calendario: string | null;
}

interface AddressCatalogRow {
  id: number;
  nombre: string;
}

interface DireccionRow {
  id_direccion: number;
  direccion_compuesta: string;
}

interface EmpleadoRow {
  id_empleado_empresa: number;
  id_empresa: number;
  id_tip_identificacion: number | null;
  v_identificacion: string;
  v_primer_nombre: string;
  v_segundo_nombre: string | null;
  v_primer_apellido: string | null;
  v_segundo_apellido: string | null;
  v_nombre_completo: string;
  v_correo: string | null;
  v_telefono: string | null;
  v_cargo: string | null;
  id_tipo_contrato: number | null;
  tipo_contrato: string | null;
  val_salario: string | null;
  id_banco: number | null;
  banco: string | null;
  id_tipo_cuenta: number | null;
  tipo_cuenta: string | null;
  v_cuenta_nomina: string | null;
  ind_tiene_embargos: boolean;
  id_estado_civil: number | null;
  estado_civil: string | null;
  num_personas_cargo: number;
  id_tipo_vivienda: number | null;
  tipo_vivienda: string | null;
  fec_ingreso: string | null;
  id_estado: number | null;
  estado: string | null;
}

function normalizeText(value: string) {
  return value.trim();
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function nullableNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function withClient<T>(runner: (client: ClientLike) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

async function getActiveStateId(client: Queryable = pool) {
  const result = await client.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );

  return result.rows[0]?.id_estado ?? null;
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

async function ensureEmpresaCalendarioColumns(client: ClientLike) {
  await client.query(`
    alter table "Creditos"."TBL_EMPRESAS"
      add column if not exists periodicidad_nomina varchar(20) null,
      add column if not exists dia_corte_nomina integer null,
      add column if not exists dia_pago_nomina integer null,
      add column if not exists segundo_dia_pago_nomina integer null,
      add column if not exists dia_descuento_libranza integer null,
      add column if not exists ajustar_fin_semana boolean null,
      add column if not exists observacion_calendario text null
  `);
}

async function getEmpresaEntityTypeId(client: Queryable = pool) {
  await client.query(
    `insert into "Creditos"."TBL_TIPO_ENTIDADES" (des_tipo_entidad, fec_creacion)
     select 'EMPRESA', now()
     where not exists (select 1 from "Creditos"."TBL_TIPO_ENTIDADES" where lower(des_tipo_entidad) = 'empresa')`
  );

  const result = await client.query<{ id_tipo_entidad: number }>(
    'select id_tipo_entidad from "Creditos"."TBL_TIPO_ENTIDADES" where lower(des_tipo_entidad) = $1 limit 1',
    ['empresa']
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

async function upsertEmpresaDireccion(client: ClientLike, empresaId: number, input: CreateDireccionInput) {
  const tipoEntidadId = await getEmpresaEntityTypeId(client);
  const currentPrincipal = await client.query<{ id_direccion: number }>(
    'select id_direccion from "Creditos"."TBL_DIRECCIONES" where id_tipo_entidad = $1 and id_entidad = $2 and coalesce(es_principal, false) = true limit 1',
    [tipoEntidadId, empresaId]
  );

  if (input.esPrincipal ?? true) {
    await client.query(
      'update "Creditos"."TBL_DIRECCIONES" set es_principal = false where id_tipo_entidad = $1 and id_entidad = $2',
      [tipoEntidadId, empresaId]
    );
  }

  const values = [
    tipoEntidadId,
    empresaId,
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
    'update "Creditos"."TBL_EMPRESAS" set v_domicilio = $1, fec_actualizacion = now() where id_empresa = $2',
    [buildDireccionText(input), empresaId]
  );
}

function mapEmpresa(row: EmpresaRow) {
  return {
    id: row.id_empresa,
    nit: row.v_nit,
    razonSocial: row.v_razon_social,
    vendedor: row.v_vendedor,
    domicilio: row.v_domicilio,
    direccionCompuesta: row.direccion_compuesta,
    idDireccion: row.id_direccion,
    correo: row.v_correo,
    telefono: row.v_telefono,
    representanteLegal: row.v_representante_legal,
    telefonoRepresentante: row.v_telefono_representante,
    tipoIdentificacionRepresentante: row.v_tipo_identificacion_representante,
    identificacionRepresentante: row.v_identificacion_representante,
    correoRepresentante: row.v_correo_representante,
    codigo: row.v_codigo,
    contactoCargo: row.v_contacto_cargo,
    contactoNombre: row.v_contacto_nombre,
    contactoCorreo: row.v_contacto_correo,
    contactoTelefono: row.v_contacto_telefono,
    fechaConstitucion: row.fec_constitucion,
    capitalSociedad: row.val_capital_sociedad ? Number(row.val_capital_sociedad) : null,
    fechaVenta: row.fec_venta,
    ventasFecha: row.val_ventas_fecha ? Number(row.val_ventas_fecha) : null,
    naturaleza: row.v_naturaleza,
    camaraNumero: row.v_camara_numero,
    camaraLibro: row.v_camara_libro,
    camaraCiudad: row.v_camara_ciudad,
    idEstado: row.id_estado,
    estado: row.estado,
    empleados: Number(row.empleados ?? 0),
    periodicidadNomina: row.periodicidad_nomina,
    diaCorteNomina: row.dia_corte_nomina,
    diaPagoNomina: row.dia_pago_nomina,
    segundoDiaPagoNomina: row.segundo_dia_pago_nomina,
    diaDescuentoLibranza: row.dia_descuento_libranza,
    ajustarFinSemana: row.ajustar_fin_semana,
    observacionCalendario: row.observacion_calendario
  };
}

function mapEmpleado(row: EmpleadoRow) {
  return {
    id: row.id_empleado_empresa,
    idEmpresa: row.id_empresa,
    idTipoIdentificacion: row.id_tip_identificacion,
    identificacion: row.v_identificacion,
    primerNombre: row.v_primer_nombre,
    segundoNombre: row.v_segundo_nombre,
    primerApellido: row.v_primer_apellido,
    segundoApellido: row.v_segundo_apellido,
    nombreCompleto: row.v_nombre_completo,
    correo: row.v_correo,
    telefono: row.v_telefono,
    cargo: row.v_cargo,
    idTipoContrato: row.id_tipo_contrato,
    tipoContrato: row.tipo_contrato,
    salario: row.val_salario ? Number(row.val_salario) : null,
    idBanco: row.id_banco,
    banco: row.banco,
    idTipoCuenta: row.id_tipo_cuenta,
    tipoCuenta: row.tipo_cuenta,
    cuentaNomina: row.v_cuenta_nomina,
    tieneEmbargos: row.ind_tiene_embargos,
    idEstadoCivil: row.id_estado_civil,
    estadoCivil: row.estado_civil,
    personasCargo: row.num_personas_cargo,
    idTipoVivienda: row.id_tipo_vivienda,
    tipoVivienda: row.tipo_vivienda,
    fechaIngreso: row.fec_ingreso,
    idEstado: row.id_estado,
    estado: row.estado
  };
}

const empresaSelect = `
  select e.*, coalesce(est.v_descripcion, 'Sin estado') as estado,
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
      c.v_nom_ciudad
    )) as direccion_compuesta,
    (select count(*)::int from "Creditos"."TBL_EMPLEADOS_EMPRESA" emp where emp.id_empresa = e.id_empresa) as empleados
  from "Creditos"."TBL_EMPRESAS" e
  left join "Creditos"."TBL_ESTADOS" est on est.id_estado = e.id_estado
  left join "Creditos"."TBL_TIPO_ENTIDADES" te on lower(te.des_tipo_entidad) = 'empresa'
  left join "Creditos"."TBL_DIRECCIONES" dir on dir.id_tipo_entidad = te.id_tipo_entidad and dir.id_entidad = e.id_empresa and coalesce(dir.es_principal, false) = true
  left join "Creditos"."TBL_TIPO_VIA" tv on tv.id_tipo_via = dir.id_tipo_via
  left join "Creditos"."TBL_LETRA_DIR" lp on lp.id_letra_dir = dir.id_letra_principal
  left join "Creditos"."TBL_LETRA_DIR" lb on lb.id_letra_dir = dir.letra_bis
  left join "Creditos"."TBL_LETRA_DIR" ls on ls.id_letra_dir = dir.id_letra_secundaria
  left join "Creditos"."TBL_CIUDADES" c on c.id_ciudad = dir.id_ciudad
`;

export async function listEmpresas() {
  return withClient(async (client) => {
    await ensureEmpresaCalendarioColumns(client);
    const result = await client.query<EmpresaRow>(
      `${empresaSelect} order by e.v_razon_social`
    );

    return result.rows.map(mapEmpresa);
  });
}

export async function listAddressCatalogs() {
  return withClient(async (client) => {
    const [tiposVia, letras, ciudades] = await Promise.all([
      client.query<AddressCatalogRow>(
        'select id_tipo_via as id, des_tipo_via as nombre from "Creditos"."TBL_TIPO_VIA" order by des_tipo_via'
      ),
      client.query<AddressCatalogRow>(
        'select id_letra_dir as id, des_letra as nombre from "Creditos"."TBL_LETRA_DIR" order by des_letra'
      ),
      client.query<AddressCatalogRow>(
        'select id_ciudad as id, v_nom_ciudad as nombre from "Creditos"."TBL_CIUDADES" order by v_nom_ciudad limit 300'
      )
    ]);

    return {
      tiposVia: tiposVia.rows,
      letras: letras.rows,
      ciudades: ciudades.rows
    };
  });
}

export async function listEmployeeCatalogs() {
  return withClient(async (client) => {
    const [tiposContrato, bancos, tiposCuenta, estadosCivil, tiposVivienda] = await Promise.all([
      client.query<AddressCatalogRow>(
        'select id_tipo_contrato as id, des_tipo_contrato as nombre from "Creditos"."TBL_TIPO_CONTRATO" order by des_tipo_contrato'
      ),
      client.query<AddressCatalogRow>(
        'select id_banco as id, des_banco as nombre from "Creditos"."TBL_BANCOS" order by des_banco'
      ),
      client.query<AddressCatalogRow>(
        'select id_tipo_cuenta as id, des_tipo_cuenta as nombre from "Creditos"."TBL_TIPO_CUENTAS" order by des_tipo_cuenta'
      ),
      client.query<AddressCatalogRow>(
        'select id_estado_civil as id, des_estado_civil as nombre from "Creditos"."TBL_ESTADO_CIVIL" order by des_estado_civil'
      ),
      client.query<AddressCatalogRow>(
        'select id_tipo_vivienda as id, des_tipo_vivienda as nombre from "Creditos"."TBL_TIPO_VIVIENDA" order by des_tipo_vivienda'
      )
    ]);

    return {
      tiposContrato: tiposContrato.rows,
      bancos: bancos.rows,
      tiposCuenta: tiposCuenta.rows,
      estadosCivil: estadosCivil.rows,
      tiposVivienda: tiposVivienda.rows
    };
  });
}

export async function getEmpresa(empresaId: number) {
  return withClient(async (client) => {
    await ensureEmpresaCalendarioColumns(client);
    const result = await client.query<EmpresaRow>(
      `${empresaSelect} where e.id_empresa = $1 limit 1`,
      [empresaId]
    );

    if (!result.rowCount) {
      throw new SecurityError('Empresa no encontrada', 404);
    }

    return mapEmpresa(result.rows[0]);
  });
}

export async function createEmpresa(input: CreateEmpresaInput) {
  return withClient(async (client) => {
    await ensureEmpresaCalendarioColumns(client);
    const duplicates = await client.query(
      'select 1 from "Creditos"."TBL_EMPRESAS" where lower(v_nit) = lower($1) limit 1',
      [normalizeText(input.nit)]
    );

    if (duplicates.rowCount) {
      throw new SecurityError('Ya existe una empresa con ese NIT', 409);
    }

    const stateId = input.idEstado ?? await getActiveStateId(client);
    const created = await client.query<{ id_empresa: number }>(
      `insert into "Creditos"."TBL_EMPRESAS" (
        v_nit, v_razon_social, v_vendedor, v_domicilio, v_correo, v_telefono,
        v_representante_legal, v_telefono_representante, v_tipo_identificacion_representante,
        v_identificacion_representante, v_correo_representante, v_codigo,
        v_contacto_cargo, v_contacto_nombre, v_contacto_correo, v_contacto_telefono,
        fec_constitucion, val_capital_sociedad, fec_venta, val_ventas_fecha,
        v_naturaleza, v_camara_numero, v_camara_libro, v_camara_ciudad,
        periodicidad_nomina, dia_corte_nomina, dia_pago_nomina, segundo_dia_pago_nomina,
        dia_descuento_libranza, ajustar_fin_semana, observacion_calendario,
        id_estado
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24,
        $25, $26, $27, $28,
        $29, $30, $31,
        $32
      ) returning id_empresa`,
      [
        normalizeText(input.nit),
        normalizeText(input.razonSocial),
        nullableText(input.vendedor),
        nullableText(input.domicilio),
        nullableText(input.correo),
        nullableText(input.telefono),
        nullableText(input.representanteLegal),
        nullableText(input.telefonoRepresentante),
        nullableText(input.tipoIdentificacionRepresentante),
        nullableText(input.identificacionRepresentante),
        nullableText(input.correoRepresentante),
        nullableText(input.codigo),
        nullableText(input.contactoCargo),
        nullableText(input.contactoNombre),
        nullableText(input.contactoCorreo),
        nullableText(input.contactoTelefono),
        input.fechaConstitucion || null,
        nullableNumber(input.capitalSociedad),
        input.fechaVenta || null,
        nullableNumber(input.ventasFecha),
        nullableText(input.naturaleza),
        nullableText(input.camaraNumero),
        nullableText(input.camaraLibro),
        nullableText(input.camaraCiudad),
        input.periodicidadNomina ?? 'MENSUAL',
        nullableNumber(input.diaCorteNomina) ?? 25,
        nullableNumber(input.diaPagoNomina) ?? 30,
        nullableNumber(input.segundoDiaPagoNomina),
        nullableNumber(input.diaDescuentoLibranza),
        input.ajustarFinSemana ?? true,
        nullableText(input.observacionCalendario),
        stateId
      ]
    );

    if (input.direccion) {
      await upsertEmpresaDireccion(client, created.rows[0].id_empresa, input.direccion);
    }

    return getEmpresa(created.rows[0].id_empresa);
  });
}

export async function updateEmpresa(empresaId: number, input: CreateEmpresaInput) {
  return withClient(async (client) => {
    await ensureEmpresaCalendarioColumns(client);
    const exists = await client.query('select 1 from "Creditos"."TBL_EMPRESAS" where id_empresa = $1 limit 1', [empresaId]);
    if (!exists.rowCount) {
      throw new SecurityError('Empresa no encontrada', 404);
    }

    const duplicates = await client.query(
      'select 1 from "Creditos"."TBL_EMPRESAS" where lower(v_nit) = lower($1) and id_empresa <> $2 limit 1',
      [normalizeText(input.nit), empresaId]
    );

    if (duplicates.rowCount) {
      throw new SecurityError('Ya existe una empresa con ese NIT', 409);
    }

    await client.query(
      `update "Creditos"."TBL_EMPRESAS" set
        v_nit = $2, v_razon_social = $3, v_vendedor = $4, v_domicilio = $5, v_correo = $6, v_telefono = $7,
        v_representante_legal = $8, v_telefono_representante = $9, v_tipo_identificacion_representante = $10,
        v_identificacion_representante = $11, v_correo_representante = $12, v_codigo = $13,
        v_contacto_cargo = $14, v_contacto_nombre = $15, v_contacto_correo = $16, v_contacto_telefono = $17,
        fec_constitucion = $18, val_capital_sociedad = $19, fec_venta = $20, val_ventas_fecha = $21,
        v_naturaleza = $22, v_camara_numero = $23, v_camara_libro = $24, v_camara_ciudad = $25,
        periodicidad_nomina = $26, dia_corte_nomina = $27, dia_pago_nomina = $28, segundo_dia_pago_nomina = $29,
        dia_descuento_libranza = $30, ajustar_fin_semana = $31, observacion_calendario = $32,
        fec_actualizacion = now()
       where id_empresa = $1`,
      [
        empresaId,
        normalizeText(input.nit),
        normalizeText(input.razonSocial),
        nullableText(input.vendedor),
        nullableText(input.domicilio),
        nullableText(input.correo),
        nullableText(input.telefono),
        nullableText(input.representanteLegal),
        nullableText(input.telefonoRepresentante),
        nullableText(input.tipoIdentificacionRepresentante),
        nullableText(input.identificacionRepresentante),
        nullableText(input.correoRepresentante),
        nullableText(input.codigo),
        nullableText(input.contactoCargo),
        nullableText(input.contactoNombre),
        nullableText(input.contactoCorreo),
        nullableText(input.contactoTelefono),
        input.fechaConstitucion || null,
        nullableNumber(input.capitalSociedad),
        input.fechaVenta || null,
        nullableNumber(input.ventasFecha),
        nullableText(input.naturaleza),
        nullableText(input.camaraNumero),
        nullableText(input.camaraLibro),
        nullableText(input.camaraCiudad),
        input.periodicidadNomina ?? 'MENSUAL',
        nullableNumber(input.diaCorteNomina) ?? 25,
        nullableNumber(input.diaPagoNomina) ?? 30,
        nullableNumber(input.segundoDiaPagoNomina),
        nullableNumber(input.diaDescuentoLibranza),
        input.ajustarFinSemana ?? true,
        nullableText(input.observacionCalendario)
      ]
    );

    if (input.direccion) {
      await upsertEmpresaDireccion(client, empresaId, input.direccion);
    }

    return getEmpresa(empresaId);
  });
}

export async function updateEmpresaEstado(empresaId: number, activo: boolean) {
  return withClient(async (client) => {
    await ensureEmpresaCalendarioColumns(client);
    const stateId = activo ? await getActiveStateId(client) : await getInactiveStateId(client);
    const updated = await client.query(
      'update "Creditos"."TBL_EMPRESAS" set id_estado = $2, fec_actualizacion = now() where id_empresa = $1 returning id_empresa',
      [empresaId, stateId]
    );
    if (!updated.rowCount) {
      throw new SecurityError('Empresa no encontrada', 404);
    }
    return getEmpresa(empresaId);
  });
}

export async function listEmpleadosEmpresa(empresaId: number) {
  return withClient(async (client) => {
    const result = await client.query<EmpleadoRow>(
      `select emp.*, coalesce(est.v_descripcion, 'Sin estado') as estado,
        tc.des_tipo_contrato as tipo_contrato,
        b.des_banco as banco,
        tcu.des_tipo_cuenta as tipo_cuenta,
        ec.des_estado_civil as estado_civil,
        tv.des_tipo_vivienda as tipo_vivienda
       from "Creditos"."TBL_EMPLEADOS_EMPRESA" emp
       left join "Creditos"."TBL_ESTADOS" est on est.id_estado = emp.id_estado
       left join "Creditos"."TBL_TIPO_CONTRATO" tc on tc.id_tipo_contrato = emp.id_tipo_contrato
       left join "Creditos"."TBL_BANCOS" b on b.id_banco = emp.id_banco
       left join "Creditos"."TBL_TIPO_CUENTAS" tcu on tcu.id_tipo_cuenta = emp.id_tipo_cuenta
       left join "Creditos"."TBL_ESTADO_CIVIL" ec on ec.id_estado_civil = emp.id_estado_civil
       left join "Creditos"."TBL_TIPO_VIVIENDA" tv on tv.id_tipo_vivienda = emp.id_tipo_vivienda
       where emp.id_empresa = $1
       order by emp.v_nombre_completo`,
      [empresaId]
    );

    return result.rows.map(mapEmpleado);
  });
}

export async function createEmpleadoEmpresa(empresaId: number, input: CreateEmpleadoInput) {
  return withClient(async (client) => createEmpleadoEmpresaWithClient(client, empresaId, input));
}

async function createEmpleadoEmpresaWithClient(client: ClientLike, empresaId: number, input: CreateEmpleadoInput) {
  const empresa = await client.query('select 1 from "Creditos"."TBL_EMPRESAS" where id_empresa = $1 limit 1', [empresaId]);
  if (!empresa.rowCount) {
    throw new SecurityError('Empresa no encontrada', 404);
  }

  const stateId = input.idEstado ?? await getActiveStateId(client);
  const fullName = nullableText(input.nombreCompleto) ??
    [input.primerNombre, input.segundoNombre, input.primerApellido, input.segundoApellido]
      .map((item) => item?.trim())
      .filter(Boolean)
      .join(' ');

  const created = await client.query<EmpleadoRow>(
    `insert into "Creditos"."TBL_EMPLEADOS_EMPRESA" (
      id_empresa, id_tip_identificacion, v_identificacion, v_primer_nombre, v_segundo_nombre,
      v_primer_apellido, v_segundo_apellido, v_nombre_completo, v_correo, v_telefono,
      v_cargo, id_tipo_contrato, val_salario, id_banco, id_tipo_cuenta, v_cuenta_nomina,
      ind_tiene_embargos, id_estado_civil, num_personas_cargo, id_tipo_vivienda,
      fec_ingreso, id_estado
    ) values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20,
      $21, $22
    )
    on conflict (id_empresa, v_identificacion) do update set
      id_tip_identificacion = excluded.id_tip_identificacion,
      v_primer_nombre = excluded.v_primer_nombre,
      v_segundo_nombre = excluded.v_segundo_nombre,
      v_primer_apellido = excluded.v_primer_apellido,
      v_segundo_apellido = excluded.v_segundo_apellido,
      v_nombre_completo = excluded.v_nombre_completo,
      v_correo = excluded.v_correo,
      v_telefono = excluded.v_telefono,
      v_cargo = excluded.v_cargo,
      id_tipo_contrato = excluded.id_tipo_contrato,
      val_salario = excluded.val_salario,
      id_banco = excluded.id_banco,
      id_tipo_cuenta = excluded.id_tipo_cuenta,
      v_cuenta_nomina = excluded.v_cuenta_nomina,
      ind_tiene_embargos = excluded.ind_tiene_embargos,
      id_estado_civil = excluded.id_estado_civil,
      num_personas_cargo = excluded.num_personas_cargo,
      id_tipo_vivienda = excluded.id_tipo_vivienda,
      fec_ingreso = excluded.fec_ingreso,
      id_estado = excluded.id_estado,
      fec_actualizacion = now()
    returning *`,
    [
      empresaId,
      input.idTipoIdentificacion ?? null,
      normalizeText(input.identificacion),
      normalizeText(input.primerNombre),
      nullableText(input.segundoNombre),
      nullableText(input.primerApellido),
      nullableText(input.segundoApellido),
      fullName,
      nullableText(input.correo),
      nullableText(input.telefono),
      nullableText(input.cargo),
      input.idTipoContrato ?? null,
      nullableNumber(input.salario),
      input.idBanco ?? null,
      input.idTipoCuenta ?? null,
      nullableText(input.cuentaNomina),
      Boolean(input.tieneEmbargos),
      input.idEstadoCivil ?? null,
      nullableNumber(input.personasCargo) ?? 0,
      input.idTipoVivienda ?? null,
      input.fechaIngreso || null,
      stateId
    ]
  );

  return mapEmpleado({ ...created.rows[0], estado: null });
}

export async function bulkCreateEmpleadosEmpresa(empresaId: number, empleados: CreateEmpleadoInput[]) {
  return withClient(async (client) => {
    const results = [];
    for (const empleado of empleados) {
      results.push(await createEmpleadoEmpresaWithClient(client, empresaId, empleado));
    }

    return {
      total: results.length,
      empleados: results
    };
  });
}
