import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { sendMail } from '../../lib/mailer.js';
import { pool } from '../../lib/db.js';
import { createCredito, simularCredito } from '../creditos/creditos.service.js';
import { SecurityError } from '../security/security.service.js';

export interface PortalRegisterInput {
  identificacion: string;
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido?: string | null;
  segundoApellido?: string | null;
  correo: string;
  telefono?: string | null;
  password: string;
  idTipoIdentificacion?: number | null;
}

export interface PortalLaborProfileInput {
  codigoEmpresa: string;
  cargo: string;
  idTipoContrato: number;
  fechaIngreso: string;
  salario: number;
  neto: number;
  tieneEmbargos: boolean;
}

export interface PortalLoginInput {
  identificacion: string;
  password: string;
}

export interface PortalForgotPasswordInput {
  correo: string;
}

export interface PortalResetPasswordInput {
  token: string;
  password: string;
}

export interface PortalConfirmEmailInput {
  token: string;
}

export interface PortalSimularCreditoInput {
  idProductoCredito: number;
  montoSolicitado: number;
  plazo: number;
  codigoVendedor?: string | null;
}

interface ClientePortalRow {
  id_cliente_portal: number;
  id_empresa: number | null;
  empresa: string | null;
  codigo_empresa: string | null;
  id_empleado_empresa: number | null;
  v_identificacion: string;
  v_nombre_completo: string;
  v_correo: string;
  v_telefono: string | null;
  v_password_hash: string;
  v_cargo: string | null;
  tipo_contrato: string | null;
  fec_ingreso: string | null;
  val_salario: string | null;
  val_neto: string | null;
  ind_tiene_embargos: boolean;
  ind_correo_confirmado: boolean;
  estado: string | null;
}

function nullableText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function nullableNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeText(value: string) {
  return value.trim();
}

function fullName(input: PortalRegisterInput) {
  return [input.primerNombre, input.segundoNombre, input.primerApellido, input.segundoApellido]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(' ');
}

function mapCliente(row: ClientePortalRow) {
  return {
    id: row.id_cliente_portal,
    idEmpresa: row.id_empresa,
    empresa: row.empresa,
    codigoEmpresa: row.codigo_empresa,
    idEmpleadoEmpresa: row.id_empleado_empresa,
    identificacion: row.v_identificacion,
    nombreCompleto: row.v_nombre_completo,
    correo: row.v_correo,
    telefono: row.v_telefono,
    cargo: row.v_cargo,
    tipoContrato: row.tipo_contrato,
    fechaIngreso: row.fec_ingreso,
    salario: row.val_salario ? Number(row.val_salario) : null,
    neto: row.val_neto ? Number(row.val_neto) : null,
    tieneEmbargos: row.ind_tiene_embargos,
    correoConfirmado: row.ind_correo_confirmado,
    perfilCompleto: Boolean(row.id_empresa && row.id_empleado_empresa && row.v_cargo && row.tipo_contrato && row.fec_ingreso && row.val_salario),
    estado: row.estado
  };
}

const clienteSelect = `
  select cp.*, e.v_razon_social as empresa, e.v_codigo as codigo_empresa,
    tc.des_tipo_contrato as tipo_contrato, est.v_descripcion as estado
  from "Creditos"."TBL_CLIENTES_PORTAL" cp
  left join "Creditos"."TBL_EMPRESAS" e on e.id_empresa = cp.id_empresa
  left join "Creditos"."TBL_TIPO_CONTRATO" tc on tc.id_tipo_contrato = cp.id_tipo_contrato
  left join "Creditos"."TBL_ESTADOS" est on est.id_estado = cp.id_estado
`;

async function getActiveStateId() {
  const result = await pool.query<{ id_estado: number }>(
    'select id_estado from "Creditos"."TBL_ESTADOS" where lower(v_descripcion) = $1 limit 1',
    ['activo']
  );
  return result.rows[0]?.id_estado ?? null;
}

export async function listPortalCatalogs() {
  const [tiposIdentificacion, tiposContrato] = await Promise.all([
    pool.query('select id_tip_identificacion as id, v_sigla_identificacion as sigla, v_des_identificacion as descripcion from "Creditos"."TBL_TIP_IDENTIFICACIONES" order by v_des_identificacion'),
    pool.query('select id_tipo_contrato as id, des_tipo_contrato as nombre from "Creditos"."TBL_TIPO_CONTRATO" order by des_tipo_contrato')
  ]);

  return {
    tiposIdentificacion: tiposIdentificacion.rows,
    tiposContrato: tiposContrato.rows
  };
}

export async function registerPortalClient(input: PortalRegisterInput) {
  const duplicate = await pool.query(
    'select 1 from "Creditos"."TBL_CLIENTES_PORTAL" where lower(v_correo) = lower($1) or v_identificacion = $2 limit 1',
    [normalizeText(input.correo), normalizeText(input.identificacion)]
  );
  if (duplicate.rowCount) throw new SecurityError('Ya existe un cliente registrado con ese correo o identificacion', 409);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const stateId = await getActiveStateId();
    const name = fullName(input);
    const passwordHash = await bcrypt.hash(input.password, 10);

    const created = await client.query<{ id_cliente_portal: number }>(
      `insert into "Creditos"."TBL_CLIENTES_PORTAL" (
        id_empresa, id_empleado_empresa, id_tip_identificacion, v_identificacion,
        v_primer_nombre, v_segundo_nombre, v_primer_apellido, v_segundo_apellido,
        v_nombre_completo, v_correo, v_telefono, v_password_hash, v_cargo,
        id_tipo_contrato, fec_ingreso, val_salario, val_neto, ind_tiene_embargos, id_estado
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      returning id_cliente_portal`,
      [
        null,
        null,
        input.idTipoIdentificacion ?? null,
        normalizeText(input.identificacion),
        normalizeText(input.primerNombre),
        nullableText(input.segundoNombre),
        nullableText(input.primerApellido),
        nullableText(input.segundoApellido),
        name,
        normalizeText(input.correo),
        nullableText(input.telefono),
        passwordHash,
        null,
        null,
        null,
        null,
        null,
        false,
        stateId
      ]
    );

    const token = crypto.randomBytes(32).toString('hex');
    await client.query(
      `insert into "Creditos"."TBL_CLIENTE_TOKENS" (id_cliente_portal, tipo_token, token, fec_expira)
       values ($1, 'CONFIRMAR_CORREO', $2, now() + interval '24 hours')`,
      [created.rows[0].id_cliente_portal, token]
    );

    await client.query('commit');

    const cliente = await getPortalClientById(created.rows[0].id_cliente_portal);
    const confirmUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/portal?confirm=${token}`;
    let emailSent = false;
    try {
      const mail = await sendMail({
      to: cliente.correo,
      subject: 'Bienvenido al portal de creditos P&S',
      text: `Hola ${cliente.nombreCompleto}. Tu registro fue creado. Activa tu cuenta en este enlace: ${confirmUrl}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#172231">
          <h2>Bienvenido, ${cliente.nombreCompleto}</h2>
          <p>Tu registro en el portal de creditos fue creado correctamente.</p>
          <p>Activa tu cuenta para ingresar y completar tu información laboral.</p>
          <p><a href="${confirmUrl}" style="display:inline-block;background:#164d83;color:white;padding:12px 18px;border-radius:6px;text-decoration:none">Activar cuenta</a></p>
          <p style="color:#5d6e7c;font-size:13px">Si el boton no abre, copia este enlace: ${confirmUrl}</p>
        </div>
      `
      });
      emailSent = mail.sent;
    } catch {
      // El registro no debe fallar si SMTP esta mal configurado.
    }
    return { cliente, confirmationToken: emailSent ? undefined : token };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function completePortalLaborProfile(clienteId: number, input: PortalLaborProfileInput) {
  const empresaResult = await pool.query<{ id_empresa: number }>(
    'select id_empresa from "Creditos"."TBL_EMPRESAS" where upper(v_codigo) = upper($1) limit 1',
    [normalizeText(input.codigoEmpresa)]
  );
  if (!empresaResult.rowCount) throw new SecurityError('Codigo de empresa no encontrado', 404);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const employeeResult = await client.query<{ id_empleado_empresa: number }>(
      `insert into "Creditos"."TBL_EMPLEADOS_EMPRESA" (
        id_empresa, id_tip_identificacion, v_identificacion, v_primer_nombre, v_segundo_nombre,
        v_primer_apellido, v_segundo_apellido, v_nombre_completo, v_correo, v_telefono,
        v_cargo, id_tipo_contrato, val_salario, fec_ingreso, ind_tiene_embargos, id_estado
      )
      select $1, cp.id_tip_identificacion, cp.v_identificacion, cp.v_primer_nombre, cp.v_segundo_nombre,
        cp.v_primer_apellido, cp.v_segundo_apellido, cp.v_nombre_completo, cp.v_correo, cp.v_telefono,
        $2, $3, $4, $5, $6, cp.id_estado
      from "Creditos"."TBL_CLIENTES_PORTAL" cp where cp.id_cliente_portal = $7
      on conflict (id_empresa, v_identificacion) do update set
        v_cargo = excluded.v_cargo, id_tipo_contrato = excluded.id_tipo_contrato,
        val_salario = excluded.val_salario, fec_ingreso = excluded.fec_ingreso,
        ind_tiene_embargos = excluded.ind_tiene_embargos, fec_actualizacion = now()
      returning id_empleado_empresa`,
      [empresaResult.rows[0].id_empresa, normalizeText(input.cargo), input.idTipoContrato, input.salario,
        input.fechaIngreso, input.tieneEmbargos, clienteId]
    );

    await client.query(
      `update "Creditos"."TBL_CLIENTES_PORTAL" set
        id_empresa = $1, id_empleado_empresa = $2, v_cargo = $3, id_tipo_contrato = $4,
        fec_ingreso = $5, val_salario = $6, val_neto = $7, ind_tiene_embargos = $8,
        fec_actualizacion = now()
       where id_cliente_portal = $9`,
      [empresaResult.rows[0].id_empresa, employeeResult.rows[0].id_empleado_empresa, normalizeText(input.cargo),
        input.idTipoContrato, input.fechaIngreso, input.salario, input.neto, input.tieneEmbargos, clienteId]
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return getPortalClientById(clienteId);
}

export async function loginPortalClient(input: PortalLoginInput) {
  const result = await pool.query<ClientePortalRow>(
    `${clienteSelect} where cp.v_identificacion = $1 or lower(cp.v_correo) = lower($1) limit 1`,
    [normalizeText(input.identificacion)]
  );
  if (!result.rowCount) throw new SecurityError('Credenciales invalidas', 401);

  const ok = await bcrypt.compare(input.password, result.rows[0].v_password_hash);
  if (!ok) throw new SecurityError('Credenciales invalidas', 401);
  if (!result.rows[0].ind_correo_confirmado) {
    throw new SecurityError('Debes activar tu cuenta desde el enlace enviado a tu correo', 403);
  }

  return mapCliente(result.rows[0]);
}

export async function getPortalClientById(clienteId: number) {
  const result = await pool.query<ClientePortalRow>(`${clienteSelect} where cp.id_cliente_portal = $1 limit 1`, [clienteId]);
  if (!result.rowCount) throw new SecurityError('Cliente no encontrado', 404);
  return mapCliente(result.rows[0]);
}

export async function confirmPortalEmail(input: PortalConfirmEmailInput) {
  const tokenResult = await pool.query<{ id_cliente_token: number; id_cliente_portal: number }>(
    `select id_cliente_token, id_cliente_portal
     from "Creditos"."TBL_CLIENTE_TOKENS"
     where token = $1 and tipo_token = 'CONFIRMAR_CORREO' and usado = false and fec_expira > now()
     limit 1`,
    [normalizeText(input.token)]
  );
  if (!tokenResult.rowCount) throw new SecurityError('Token de activacion invalido o vencido', 400);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      'update "Creditos"."TBL_CLIENTES_PORTAL" set ind_correo_confirmado = true, fec_actualizacion = now() where id_cliente_portal = $1',
      [tokenResult.rows[0].id_cliente_portal]
    );
    await client.query(
      'update "Creditos"."TBL_CLIENTE_TOKENS" set usado = true where id_cliente_token = $1',
      [tokenResult.rows[0].id_cliente_token]
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return getPortalClientById(tokenResult.rows[0].id_cliente_portal);
}

export async function requestPortalPasswordReset(input: PortalForgotPasswordInput) {
  const result = await pool.query<ClientePortalRow>(
    `${clienteSelect} where lower(cp.v_correo) = lower($1) limit 1`,
    [normalizeText(input.correo)]
  );

  if (!result.rowCount) {
    return { sent: true };
  }

  const cliente = mapCliente(result.rows[0]);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `insert into "Creditos"."TBL_CLIENTE_TOKENS" (id_cliente_portal, tipo_token, token, fec_expira)
     values ($1, 'RECUPERAR_PASSWORD', $2, now() + interval '1 hour')`,
    [cliente.id, token]
  );

  const resetUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, '')}/portal?reset=${token}`;
  const mail = await sendMail({
    to: cliente.correo,
    subject: 'Recupera tu contraseña del portal P&S',
    text: `Para cambiar tu contraseña entra a este enlace: ${resetUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#172231">
        <h2>Recuperar contraseña</h2>
        <p>Recibimos una solicitud para cambiar tu contraseña del portal.</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#164d83;color:white;padding:12px 18px;border-radius:6px;text-decoration:none">Cambiar contraseña</a></p>
        <p>Este enlace vence en 1 hora.</p>
      </div>
    `
  });

  return {
    sent: true,
    emailSent: mail.sent,
    resetUrl: mail.sent ? undefined : resetUrl
  };
}

export async function resetPortalPassword(input: PortalResetPasswordInput) {
  const tokenResult = await pool.query<{ id_cliente_token: number; id_cliente_portal: number }>(
    `select id_cliente_token, id_cliente_portal
     from "Creditos"."TBL_CLIENTE_TOKENS"
     where token = $1 and tipo_token = 'RECUPERAR_PASSWORD' and usado = false and fec_expira > now()
     limit 1`,
    [normalizeText(input.token)]
  );
  if (!tokenResult.rowCount) throw new SecurityError('Token invalido o vencido', 400);

  const passwordHash = await bcrypt.hash(input.password, 10);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      'update "Creditos"."TBL_CLIENTES_PORTAL" set v_password_hash = $1, fec_actualizacion = now() where id_cliente_portal = $2',
      [passwordHash, tokenResult.rows[0].id_cliente_portal]
    );
    await client.query(
      'update "Creditos"."TBL_CLIENTE_TOKENS" set usado = true where id_cliente_token = $1',
      [tokenResult.rows[0].id_cliente_token]
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return { updated: true };
}

export async function listPortalProductosCredito() {
  const result = await pool.query(
    `select p.id_producto_credito as id, p.nombre, p.descripcion, p.monto_minimo, p.monto_maximo,
      p.plazo_minimo, p.plazo_maximo, p.tipo_tasa, tc.des_tipo_credito as tipo_credito,
      (
        select a.porcentaje
        from "Creditos"."TBL_PRODUCTO_CREDITO_ATRIBUTOS" a
        where a.id_producto_credito = p.id_producto_credito
          and (upper(a.nombre) like '%INTERES%' or upper(a.nombre) like '%INTERÉS%')
          and a.porcentaje is not null
        order by a.prioridad, a.id_producto_atributo
        limit 1
      ) as tasa_mensual
     from "Creditos"."TBL_PRODUCTOS_CREDITO" p
     inner join "Creditos"."TBL_TIPOS_CREDITO" tc on tc.id_tipo_credito = p.id_tipo_credito
     order by tasa_mensual desc nulls last, p.nombre`
  );

  return result.rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    montoMinimo: row.monto_minimo ? Number(row.monto_minimo) : null,
    montoMaximo: row.monto_maximo ? Number(row.monto_maximo) : null,
    plazoMinimo: row.plazo_minimo,
    plazoMaximo: row.plazo_maximo,
    tipoTasa: row.tipo_tasa,
    tipoCredito: row.tipo_credito,
    tasaMensual: row.tasa_mensual ? Number(row.tasa_mensual) : null
  }));
}

export async function listPortalCreditos(clienteId: number) {
  const cliente = await getPortalClientById(clienteId);
  const result = await pool.query<{
    id_credito: number;
    consecutivo: string;
    producto: string;
    monto: string;
    plazo: number;
    cuota: string | null;
    estado: string;
    fecha: Date;
  }>(
    `select c.id_credito, c.consecutivo, p.nombre as producto,
      c.val_monto_solicitado as monto, c.num_plazo as plazo,
      c.val_cuota_estimada as cuota,
      coalesce(c.v_estado_solicitud, 'SOLICITADO') as estado,
      c.fec_radicacion as fecha
     from "Creditos"."TBL_CREDITOS" c
     inner join "Creditos"."TBL_PRODUCTOS_CREDITO" p on p.id_producto_credito = c.id_producto_credito
     where c.v_identificacion_cliente = $1
     order by c.fec_radicacion desc, c.id_credito desc`,
    [cliente.identificacion]
  );

  const creditos = result.rows.map((row) => ({
    id: row.id_credito,
    consecutivo: row.consecutivo,
    producto: row.producto,
    monto: Number(row.monto),
    plazo: row.plazo,
    cuota: row.cuota ? Number(row.cuota) : null,
    estado: row.estado,
    fecha: row.fecha
  }));
  const normalized = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

  return {
    resumen: {
      activos: creditos.filter((item) => ['ACTIVO', 'DESEMBOLSADO', 'VIGENTE'].includes(normalized(item.estado))).length,
      solicitados: creditos.filter((item) => ['SOLICITADO', 'RADICADO', 'PENDIENTE', 'EN ESTUDIO', 'EN_ESTUDIO'].includes(normalized(item.estado))).length,
      aprobados: creditos.filter((item) => ['APROBADO', 'APROBADA'].includes(normalized(item.estado))).length,
      rechazados: creditos.filter((item) => ['RECHAZADO', 'RECHAZADA', 'NEGADO', 'NEGADA'].includes(normalized(item.estado))).length
    },
    creditos
  };
}

export async function simularPortalCredito(clienteId: number, input: PortalSimularCreditoInput) {
  await getPortalClientById(clienteId);
  if (nullableText(input.codigoVendedor)) await findComercialByCode(input.codigoVendedor!);
  return simularCredito(input);
}

export async function crearSolicitudPortalCredito(clienteId: number, input: PortalSimularCreditoInput) {
  const cliente = await getPortalClientById(clienteId);
  const comercial = nullableText(input.codigoVendedor)
    ? await findComercialByCode(input.codigoVendedor!)
    : null;
  return createCredito({
    idProductoCredito: input.idProductoCredito,
    idEmpresa: cliente.idEmpresa,
    idEmpleadoEmpresa: cliente.idEmpleadoEmpresa,
    identificacionCliente: cliente.identificacion,
    nombreCliente: cliente.nombreCompleto,
    correoCliente: cliente.correo,
    telefonoCliente: cliente.telefono,
    idComercial: comercial?.id_comercial ?? null,
    montoSolicitado: input.montoSolicitado,
    plazo: input.plazo
  });
}

async function findComercialByCode(codigo: string) {
  const result = await pool.query<{ id_comercial: number; v_nombre_completo: string }>(
    `select id_comercial, v_nombre_completo
     from "Creditos"."TBL_COMERCIALES"
     where upper(v_codigo_vendedor) = upper($1)
     limit 1`,
    [normalizeText(codigo)]
  );
  if (!result.rowCount) throw new SecurityError('El codigo del vendedor no existe', 404);
  return result.rows[0];
}
