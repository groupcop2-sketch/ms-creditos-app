import type { ClientLike } from '../../lib/db.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

export type ModalidadDesembolso = 'EFECTIVO' | 'COMPRA_CARTERA' | 'MIXTO';
export type TipoSoporte = 'CEDULA_FRENTE' | 'CEDULA_REVERSO' | 'FOTO_ROSTRO' | 'CERTIFICADO_COMPRA_CARTERA';

export type ArchivoBase64 = { nombre: string; mimeType: string; base64: string };
export type CompraCarteraInput = { entidad: string; valor: number; archivo: ArchivoBase64 };

const MAX_ARCHIVO_BYTES = 8 * 1024 * 1024;
const MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Accepts the pool or a checked-out client; only used for statements whose rows we do not read.
type Db = { query: (text: string, values?: unknown[]) => Promise<unknown> };

let tablasListas: Promise<void> | null = null;

/**
 * Creates the tables/columns once per process. ALTER TABLE takes an exclusive lock on TBL_CREDITOS even with
 * IF NOT EXISTS, so it only runs when a column is really missing.
 */
export function ensureSoportesClienteTables(_client?: Db) {
  tablasListas ??= crearTablasSoportes().catch((error) => {
    tablasListas = null;
    throw error;
  });
  return tablasListas;
}

async function crearTablasSoportes() {
  const client = pool;
  const columnas = await pool.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'Creditos' and table_name = 'TBL_CREDITOS'
       and column_name in ('modalidad_desembolso', 'val_compra_cartera', 'val_efectivo')`
  );
  if (columnas.rowCount !== 3) {
    await client.query(`
      alter table "Creditos"."TBL_CREDITOS"
        add column if not exists modalidad_desembolso varchar(20) not null default 'EFECTIVO',
        add column if not exists val_compra_cartera numeric(18,2) not null default 0,
        add column if not exists val_efectivo numeric(18,2) null
    `);
  }
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_COMPRAS_CARTERA" (
      id_compra_cartera serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      entidad varchar(160) not null,
      valor numeric(18,2) not null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE" (
      id_soporte serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_compra_cartera integer null references "Creditos"."TBL_CREDITO_COMPRAS_CARTERA"(id_compra_cartera) on delete cascade,
      tipo varchar(40) not null,
      nombre_archivo varchar(240) not null,
      mime_type varchar(120) not null,
      tamano_bytes integer not null,
      contenido bytea not null,
      estado varchar(20) not null default 'PENDIENTE',
      observacion text null,
      id_usuario_revision integer null,
      fec_revision timestamp without time zone null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

export function decodeArchivo(archivo: ArchivoBase64) {
  const mimeType = archivo.mimeType.toLowerCase();
  if (!MIME_PERMITIDOS.includes(mimeType)) throw new SecurityError('Formato no permitido: sube un PDF o una imagen (JPG, PNG, WEBP)', 400);
  const buffer = Buffer.from(archivo.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buffer.length) throw new SecurityError(`El archivo ${archivo.nombre} esta vacio`, 400);
  if (buffer.length > MAX_ARCHIVO_BYTES) throw new SecurityError(`El archivo ${archivo.nombre} supera 8 MB`, 400);
  return { nombre: archivo.nombre.slice(0, 240), mimeType, buffer };
}

/** Validates the disbursement mode against the requested amount; returns the cash part. */
export function validarModalidad(modalidad: ModalidadDesembolso, montoSolicitado: number, compras: { valor: number }[]) {
  const totalCompras = Math.round(compras.reduce((sum, item) => sum + item.valor, 0) * 100) / 100;
  if (modalidad === 'EFECTIVO') {
    if (compras.length) throw new SecurityError('La modalidad efectivo no lleva compras de cartera', 400);
    return { totalCompras: 0, efectivo: montoSolicitado };
  }
  if (!compras.length) throw new SecurityError('Agrega al menos una deuda a comprar con su certificado', 400);
  if (compras.some((item) => !(item.valor > 0))) throw new SecurityError('Cada compra de cartera debe tener un valor mayor a cero', 400);
  if (modalidad === 'COMPRA_CARTERA' && totalCompras !== montoSolicitado) {
    throw new SecurityError('En compra de cartera el monto solicitado debe ser igual a la suma de las deudas', 400);
  }
  if (modalidad === 'MIXTO' && totalCompras >= montoSolicitado) {
    throw new SecurityError('En mixto la suma de las deudas debe ser menor al monto solicitado para dejar una parte en efectivo', 400);
  }
  return { totalCompras, efectivo: Math.round((montoSolicitado - totalCompras) * 100) / 100 };
}

export async function insertSoporteCliente(
  client: Db,
  input: { creditoId: number; tipo: TipoSoporte; nombre: string; mimeType: string; buffer: Buffer; compraCarteraId?: number | null }
) {
  await client.query(
    `insert into "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE"
      (id_credito, id_compra_cartera, tipo, nombre_archivo, mime_type, tamano_bytes, contenido)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [input.creditoId, input.compraCarteraId ?? null, input.tipo, input.nombre, input.mimeType, input.buffer.length, input.buffer]
  );
}

/** Saves disbursement mode, debts to purchase and their certificates in one transaction. */
export async function guardarModalidadCredito(
  creditoId: number,
  modalidad: ModalidadDesembolso,
  montoSolicitado: number,
  compras: CompraCarteraInput[]
) {
  const { totalCompras, efectivo } = validarModalidad(modalidad, montoSolicitado, compras);
  const archivos = compras.map((item) => decodeArchivo(item.archivo));
  const client = await pool.connect();
  try {
    await client.query('begin');
    await ensureSoportesClienteTables(client);
    await client.query(
      `update "Creditos"."TBL_CREDITOS"
       set modalidad_desembolso = $2, val_compra_cartera = $3, val_efectivo = $4, fec_actualizacion = now()
       where id_credito = $1`,
      [creditoId, modalidad, totalCompras, efectivo]
    );
    for (const [index, compra] of compras.entries()) {
      const inserted = await client.query<{ id_compra_cartera: number }>(
        `insert into "Creditos"."TBL_CREDITO_COMPRAS_CARTERA" (id_credito, entidad, valor)
         values ($1,$2,$3) returning id_compra_cartera`,
        [creditoId, compra.entidad.trim().slice(0, 160), compra.valor]
      );
      await insertSoporteCliente(client, {
        creditoId,
        tipo: 'CERTIFICADO_COMPRA_CARTERA',
        compraCarteraId: inserted.rows[0].id_compra_cartera,
        ...archivos[index]
      });
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

const normalizeStage = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const esEtapaValidacionDocumental = (key: string) => key.includes('VALIDACION') && key.includes('DOCUMENT');
export const esEtapaEstudio = (key: string) => key.includes('ESTUDIO') || key.includes('ANALISIS');

/** Throws when the credit stage matching `match` is already approved (closed stages are read-only). */
export async function assertEtapaAbierta(creditoId: number, match: (key: string) => boolean, accion: string) {
  const result = await pool.query<{ des_etapa: string; estado_etapa: string }>(
    `select e.des_etapa, ce.estado_etapa
     from "Creditos"."TBL_CREDITO_ETAPAS" ce
     inner join "Creditos"."TBL_ETAPAS_CREDITO" e on e.id_etapa_credito = ce.id_etapa_credito
     where ce.id_credito = $1`,
    [creditoId]
  );
  const etapa = result.rows.find((row) => match(normalizeStage(row.des_etapa)));
  if (etapa?.estado_etapa === 'APROBADA') {
    throw new SecurityError(`La etapa ${etapa.des_etapa} ya fue aprobada: no se puede ${accion}`, 409);
  }
}

const IDENTIDAD: TipoSoporte[] = ['CEDULA_FRENTE', 'CEDULA_REVERSO', 'FOTO_ROSTRO'];

/** Required slots without any uploaded file: the three identity files plus one certificate per debt. */
export function calcularFaltantes(compras: { id: number }[], soportes: { tipo: TipoSoporte; idCompraCartera: number | null }[]) {
  const faltantes: Array<{ tipo: TipoSoporte; idCompraCartera: number | null }> = [];
  for (const tipo of IDENTIDAD) {
    if (!soportes.some((item) => item.tipo === tipo)) faltantes.push({ tipo, idCompraCartera: null });
  }
  for (const compra of compras) {
    if (!soportes.some((item) => item.tipo === 'CERTIFICADO_COMPRA_CARTERA' && item.idCompraCartera === compra.id)) {
      faltantes.push({ tipo: 'CERTIFICADO_COMPRA_CARTERA', idCompraCartera: compra.id });
    }
  }
  return faltantes;
}

/** Files not yet approved plus required files never uploaded. */
export async function countSoportesClientePendientes(client: ClientLike, creditoId: number) {
  await ensureSoportesClienteTables(client);
  const compras = await client.query<{ id: number }>(
    'select id_compra_cartera as id from "Creditos"."TBL_CREDITO_COMPRAS_CARTERA" where id_credito = $1',
    [creditoId]
  );
  const soportes = await client.query<{ tipo: TipoSoporte; idCompraCartera: number | null; estado: string }>(
    `select tipo, id_compra_cartera as "idCompraCartera", estado
     from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE" where id_credito = $1`,
    [creditoId]
  );
  return soportes.rows.filter((item) => item.estado !== 'APROBADO').length + calcularFaltantes(compras.rows, soportes.rows).length;
}

/** Client upload (portal): fills a missing slot or replaces a pending/rejected file; approved files are locked. */
export async function subirSoporteCliente(
  creditoId: number,
  input: { tipo: TipoSoporte; idCompraCartera?: number | null; archivo: ArchivoBase64 }
) {
  const archivo = decodeArchivo(input.archivo);
  await assertEtapaAbierta(creditoId, esEtapaValidacionDocumental, 'cambiar documentos');
  if (input.tipo === 'FOTO_ROSTRO' && !archivo.mimeType.startsWith('image/')) {
    throw new SecurityError('La foto del rostro debe ser una imagen', 400);
  }
  const compraId = input.tipo === 'CERTIFICADO_COMPRA_CARTERA' ? input.idCompraCartera ?? null : null;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await ensureSoportesClienteTables(client);
    if (input.tipo === 'CERTIFICADO_COMPRA_CARTERA') {
      const compra = await client.query(
        'select 1 from "Creditos"."TBL_CREDITO_COMPRAS_CARTERA" where id_compra_cartera = $1 and id_credito = $2',
        [compraId, creditoId]
      );
      if (!compra.rowCount) throw new SecurityError('La deuda indicada no pertenece a esta solicitud', 400);
    }
    const actual = await client.query<{ estado: string }>(
      `select estado from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE"
       where id_credito = $1 and tipo = $2 and id_compra_cartera is not distinct from $3`,
      [creditoId, input.tipo, compraId]
    );
    if (actual.rows.some((item) => item.estado === 'APROBADO')) {
      throw new SecurityError('Este documento ya fue aprobado y no se puede reemplazar', 409);
    }
    await client.query(
      `delete from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE"
       where id_credito = $1 and tipo = $2 and id_compra_cartera is not distinct from $3`,
      [creditoId, input.tipo, compraId]
    );
    await insertSoporteCliente(client, { creditoId, tipo: input.tipo, compraCarteraId: compraId, ...archivo });
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return listSoportesCliente(creditoId);
}

export async function listSoportesCliente(creditoId: number) {
  await ensureSoportesClienteTables();
  const [credito, compras, soportes] = await Promise.all([
    pool.query<{ modalidad_desembolso: ModalidadDesembolso; val_compra_cartera: string; val_efectivo: string | null; val_monto_solicitado: string | null }>(
      `select modalidad_desembolso, val_compra_cartera, val_efectivo, val_monto_solicitado
       from "Creditos"."TBL_CREDITOS" where id_credito = $1`,
      [creditoId]
    ),
    pool.query<{ id_compra_cartera: number; entidad: string; valor: string }>(
      `select id_compra_cartera, entidad, valor from "Creditos"."TBL_CREDITO_COMPRAS_CARTERA"
       where id_credito = $1 order by id_compra_cartera`,
      [creditoId]
    ),
    pool.query<{
      id_soporte: number; id_compra_cartera: number | null; tipo: TipoSoporte; nombre_archivo: string; mime_type: string;
      tamano_bytes: number; estado: string; observacion: string | null; fec_revision: string | null; fec_creacion: string; usuario: string | null;
    }>(
      `select s.id_soporte, s.id_compra_cartera, s.tipo, s.nombre_archivo, s.mime_type, s.tamano_bytes, s.estado,
              s.observacion, s.fec_revision, s.fec_creacion, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
       from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE" s
       left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = s.id_usuario_revision
       where s.id_credito = $1
       order by s.id_compra_cartera nulls first, s.tipo, s.id_soporte`,
      [creditoId]
    )
  ]);
  if (!credito.rowCount) throw new SecurityError('Credito no encontrado', 404);
  const row = credito.rows[0];
  const comprasMapped = compras.rows.map((item) => ({ id: item.id_compra_cartera, entidad: item.entidad, valor: Number(item.valor) }));
  return {
    modalidad: row.modalidad_desembolso,
    valorCompraCartera: Number(row.val_compra_cartera),
    valorEfectivo: row.val_efectivo == null ? Number(row.val_monto_solicitado ?? 0) : Number(row.val_efectivo),
    compras: comprasMapped,
    faltantes: calcularFaltantes(comprasMapped, soportes.rows.map((item) => ({ tipo: item.tipo, idCompraCartera: item.id_compra_cartera }))),
    soportes: soportes.rows.map((item) => ({
      id: item.id_soporte,
      idCompraCartera: item.id_compra_cartera,
      tipo: item.tipo,
      nombreArchivo: item.nombre_archivo,
      mimeType: item.mime_type,
      tamanoBytes: item.tamano_bytes,
      estado: item.estado,
      observacion: item.observacion,
      revisadoPor: item.usuario,
      fechaRevision: item.fec_revision,
      fechaCarga: item.fec_creacion
    }))
  };
}

export async function getSoporteClienteArchivo(soporteId: number) {
  await ensureSoportesClienteTables();
  const result = await pool.query<{ nombre_archivo: string; mime_type: string; contenido: Buffer }>(
    'select nombre_archivo, mime_type, contenido from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE" where id_soporte = $1',
    [soporteId]
  );
  if (!result.rowCount) throw new SecurityError('Documento no encontrado', 404);
  return result.rows[0];
}

export async function revisarSoporteCliente(
  soporteId: number,
  input: { estado: 'APROBADO' | 'RECHAZADO'; observacion?: string | null; usuarioId?: number | null }
) {
  await ensureSoportesClienteTables();
  if (input.estado === 'RECHAZADO' && !input.observacion?.trim()) {
    throw new SecurityError('Indica el motivo del rechazo para que el cliente sepa que corregir', 400);
  }
  const soporte = await pool.query<{ id_credito: number }>(
    'select id_credito from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE" where id_soporte = $1',
    [soporteId]
  );
  if (!soporte.rowCount) throw new SecurityError('Documento no encontrado', 404);
  await assertEtapaAbierta(soporte.rows[0].id_credito, esEtapaValidacionDocumental, 'revisar documentos');
  const result = await pool.query<{ id_credito: number }>(
    `update "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE"
     set estado = $2, observacion = $3, id_usuario_revision = $4, fec_revision = now()
     where id_soporte = $1 returning id_credito`,
    [soporteId, input.estado, input.observacion?.trim() || null, input.usuarioId ?? null]
  );
  if (!result.rowCount) throw new SecurityError('Documento no encontrado', 404);
  return listSoportesCliente(result.rows[0].id_credito);
}
