import crypto from 'node:crypto';
import { pool } from '../../lib/db.js';
import { guardarDocumentoOBase64 } from '../storage/s3.service.js';
import { SecurityError } from '../security/security.service.js';

const MAX_BYTES = 15 * 1024 * 1024;
export const MIME_ADICIONALES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await pool.query(`
    create table if not exists "Creditos"."TBL_CREDITO_DOCUMENTOS_ADICIONALES" (
      id_documento_adicional serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      descripcion varchar(200) not null,
      nombre_archivo varchar(240) not null,
      mime_type varchar(160) not null,
      tamano_bytes integer not null,
      contenido bytea not null,
      hash_archivo varchar(64) not null,
      almacenamiento varchar(30) not null,
      s3_bucket varchar(200) null,
      s3_key text null,
      url_archivo text null,
      id_usuario integer null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
  tablaLista = true;
}

export async function listDocumentosAdicionales(creditoId: number) {
  await ensureTabla();
  const result = await pool.query<{
    id_documento_adicional: number; descripcion: string; nombre_archivo: string; mime_type: string;
    tamano_bytes: number; almacenamiento: string; s3_key: string | null; fec_creacion: string; usuario: string | null;
  }>(
    `select d.id_documento_adicional, d.descripcion, d.nombre_archivo, d.mime_type, d.tamano_bytes, d.almacenamiento,
       d.s3_key, d.fec_creacion, coalesce(u.v_nom_completo, u.v_nom_usuario) as usuario
     from "Creditos"."TBL_CREDITO_DOCUMENTOS_ADICIONALES" d
     left join "Creditos"."TBL_USUARIOS" u on u.id_usuario = d.id_usuario
     where d.id_credito = $1 order by d.fec_creacion desc`,
    [creditoId]
  );
  return result.rows.map((row) => ({
    id: row.id_documento_adicional,
    descripcion: row.descripcion,
    nombreArchivo: row.nombre_archivo,
    mimeType: row.mime_type,
    tamanoBytes: row.tamano_bytes,
    almacenamiento: row.almacenamiento,
    rutaBucket: row.s3_key,
    fecha: row.fec_creacion,
    usuario: row.usuario
  }));
}

/**
 * Stores an extra document in the credit's storage folder (AWS S3 bucket when the integration is active,
 * same folder as the client's files) and keeps a copy in the database so it can always be downloaded.
 */
export async function subirDocumentoAdicional(
  creditoId: number,
  input: { descripcion: string; fileName: string; mimeType: string; content: Buffer; usuarioId?: number | null }
) {
  if (!MIME_ADICIONALES.includes(input.mimeType)) throw new SecurityError('Formato no permitido: PDF, imagen, Word o Excel', 400);
  if (!input.content.length) throw new SecurityError('El archivo está vacío', 400);
  if (input.content.length > MAX_BYTES) throw new SecurityError('El archivo supera 15 MB', 400);
  const descripcion = input.descripcion.trim().slice(0, 200) || input.fileName;
  await ensureTabla();
  const credito = await pool.query<{ consecutivo: string | null }>('select consecutivo from "Creditos"."TBL_CREDITOS" where id_credito = $1', [creditoId]);
  if (!credito.rowCount) throw new SecurityError('Credito no encontrado', 404);

  const storage = await guardarDocumentoOBase64({
    buffer: input.content,
    fileName: input.fileName,
    contentType: input.mimeType,
    creditoId,
    numeroCredito: credito.rows[0].consecutivo || `CR-${creditoId}`,
    metadata: { 'tipo-documento': 'ADICIONAL', descripcion: descripcion.normalize('NFD').replace(/[^\x20-\x7e]/g, '') }
  });
  const enS3 = storage.storage === 'AWS_S3';

  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_DOCUMENTOS_ADICIONALES"
      (id_credito, descripcion, nombre_archivo, mime_type, tamano_bytes, contenido, hash_archivo,
       almacenamiento, s3_bucket, s3_key, url_archivo, id_usuario)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      creditoId, descripcion, input.fileName.slice(0, 240), input.mimeType, input.content.length, input.content,
      crypto.createHash('sha256').update(input.content).digest('hex'),
      storage.storage, enS3 ? storage.bucket : null, enS3 ? storage.key : null,
      enS3 ? storage.url : null, // the base64 fallback URL would just duplicate `contenido`
      input.usuarioId ?? null
    ]
  );
  await pool.query(
    `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (id_credito, accion, observacion, id_usuario)
     values ($1, 'DOCUMENTO_ADICIONAL', $2, $3)`,
    [creditoId, `${descripcion}: ${input.fileName} (${enS3 ? `AWS S3 ${storage.key}` : 'base de datos'})`, input.usuarioId ?? null]
  ).catch(() => undefined); // history is informative; the file is already stored

  return listDocumentosAdicionales(creditoId);
}

export async function getDocumentoAdicionalArchivo(documentoId: number) {
  await ensureTabla();
  const result = await pool.query<{ nombre_archivo: string; mime_type: string; contenido: Buffer }>(
    'select nombre_archivo, mime_type, contenido from "Creditos"."TBL_CREDITO_DOCUMENTOS_ADICIONALES" where id_documento_adicional = $1',
    [documentoId]
  );
  if (!result.rowCount) throw new SecurityError('Documento no encontrado', 404);
  return result.rows[0];
}
