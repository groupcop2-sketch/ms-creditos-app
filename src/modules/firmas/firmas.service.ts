import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { pool } from '../../lib/db.js';
import { SecurityError } from '../security/security.service.js';

type FirmaEstado = 'PENDIENTE' | 'ENVIADO' | 'FIRMADO' | 'RECHAZADO' | 'CANCELADO' | 'ERROR';

export interface CrearFirmaInput {
  creditoId: number;
  documentoGeneradoId: number;
  firmanteNombre: string;
  firmanteCorreo?: string | null;
  firmanteTelefono?: string | null;
  usuarioId?: number | null;
}

async function withClient<T>(runner: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

async function ensureFirmaTables(client: PoolClient) {
  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_FIRMAS" (
      id_credito_firma serial primary key,
      id_credito integer not null references "Creditos"."TBL_CREDITOS"(id_credito) on delete cascade,
      id_documento_generado integer not null references "Creditos"."TBL_DOCUMENTOS_GENERADOS"(id_documento_generado) on delete cascade,
      proveedor varchar(40) not null default 'ZAPSIGN',
      external_document_id varchar(180) null,
      sign_url text null,
      estado varchar(40) not null default 'PENDIENTE',
      firmante_nombre varchar(220) not null,
      firmante_correo varchar(180) null,
      firmante_telefono varchar(80) null,
      nombre_archivo_firmado varchar(240) null,
      pdf_firmado bytea null,
      certificado_pdf bytea null,
      hash_firmado varchar(64) null,
      webhook_payload jsonb null,
      error_mensaje text null,
      id_usuario integer null,
      fec_envio timestamp without time zone null,
      fec_firma timestamp without time zone null,
      fec_creacion timestamp without time zone not null default now(),
      fec_actualizacion timestamp without time zone null
    )
  `);

  await client.query(`
    create table if not exists "Creditos"."TBL_CREDITO_FIRMA_EVENTOS" (
      id_credito_firma_evento serial primary key,
      id_credito_firma integer not null references "Creditos"."TBL_CREDITO_FIRMAS"(id_credito_firma) on delete cascade,
      evento varchar(80) not null,
      estado_anterior varchar(40) null,
      estado_nuevo varchar(40) null,
      payload jsonb null,
      fec_creacion timestamp without time zone not null default now()
    )
  `);
}

async function addFirmaEvent(client: PoolClient, firmaId: number, evento: string, previo: string | null, nuevo: string | null, payload: unknown) {
  await client.query(
    `insert into "Creditos"."TBL_CREDITO_FIRMA_EVENTOS" (
      id_credito_firma, evento, estado_anterior, estado_nuevo, payload
    ) values ($1, $2, $3, $4, $5::jsonb)`,
    [firmaId, evento, previo, nuevo, JSON.stringify(payload ?? {})]
  );
}

async function callZapSign(input: {
  fileName: string;
  content: Buffer;
  signerName: string;
  signerEmail?: string | null;
  signerPhone?: string | null;
}) {
  if (!env.ZAPSIGN_API_TOKEN) {
    const token = crypto.randomBytes(18).toString('hex');
    return {
      externalId: `mock_${token}`,
      signUrl: `${env.APP_PUBLIC_URL}/portal?firma=${token}`,
      raw: { mode: 'mock', token }
    };
  }

  const payload = {
    name: input.fileName,
    base64_pdf: input.content.toString('base64'),
    signers: [
      {
        name: input.signerName,
        email: input.signerEmail || '',
        phone_country: '57',
        phone_number: input.signerPhone || ''
      }
    ]
  };

  const response = await fetch(`${env.ZAPSIGN_API_URL.replace(/\/$/, '')}/docs/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.ZAPSIGN_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new SecurityError(String(body.detail || body.message || 'ZapSign no pudo crear el documento'), 502);
  }

  const firstSigner = Array.isArray(body.signers) ? body.signers[0] as Record<string, unknown> : null;
  return {
    externalId: String(body.token || body.open_id || body.id || ''),
    signUrl: firstSigner?.sign_url ? String(firstSigner.sign_url) : (body.sign_url ? String(body.sign_url) : null),
    raw: body
  };
}

function findPayloadValue(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested: string | null = findPayloadValue(value as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }

  return null;
}

function mapZapSignStatus(value: string | null): FirmaEstado {
  const normalized = (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (['SIGNED', 'ASSINADO', 'FIRMADO', 'COMPLETED', 'DONE'].some((item) => normalized.includes(item))) return 'FIRMADO';
  if (['REJECTED', 'RECUSADO', 'RECHAZADO'].some((item) => normalized.includes(item))) return 'RECHAZADO';
  if (['CANCELED', 'CANCELLED', 'CANCELADO'].some((item) => normalized.includes(item))) return 'CANCELADO';
  if (['ERROR', 'FAILED'].some((item) => normalized.includes(item))) return 'ERROR';
  return 'ENVIADO';
}

async function downloadRemoteFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new SecurityError('No se pudo descargar el PDF firmado desde ZapSign', 502);
  return Buffer.from(await response.arrayBuffer());
}

export async function crearFirma(input: CrearFirmaInput) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureFirmaTables(client);
      const document = await client.query<{
        nombre_archivo: string;
        contenido_pdf: Buffer;
      }>(
        `select nombre_archivo, contenido_pdf
         from "Creditos"."TBL_DOCUMENTOS_GENERADOS"
         where id_documento_generado = $1 and id_credito = $2`,
        [input.documentoGeneradoId, input.creditoId]
      );
      if (!document.rowCount) throw new SecurityError('Documento generado no encontrado para este credito', 404);

      const firma = await client.query<{ id_credito_firma: number }>(
        `insert into "Creditos"."TBL_CREDITO_FIRMAS" (
          id_credito, id_documento_generado, proveedor, estado, firmante_nombre,
          firmante_correo, firmante_telefono, id_usuario
        ) values ($1, $2, 'ZAPSIGN', 'PENDIENTE', $3, $4, $5, $6)
        returning id_credito_firma`,
        [
          input.creditoId,
          input.documentoGeneradoId,
          input.firmanteNombre.trim(),
          input.firmanteCorreo?.trim() || null,
          input.firmanteTelefono?.trim() || null,
          input.usuarioId ?? null
        ]
      );
      const firmaId = firma.rows[0].id_credito_firma;
      await addFirmaEvent(client, firmaId, 'CREADA', null, 'PENDIENTE', {});

      const zapsign = await callZapSign({
        fileName: document.rows[0].nombre_archivo,
        content: document.rows[0].contenido_pdf,
        signerName: input.firmanteNombre,
        signerEmail: input.firmanteCorreo,
        signerPhone: input.firmanteTelefono
      });

      await client.query(
        `update "Creditos"."TBL_CREDITO_FIRMAS"
         set external_document_id = $1, sign_url = $2, estado = 'ENVIADO',
             webhook_payload = $3::jsonb, fec_envio = now(), fec_actualizacion = now()
         where id_credito_firma = $4`,
        [zapsign.externalId, zapsign.signUrl, JSON.stringify(zapsign.raw), firmaId]
      );
      await addFirmaEvent(client, firmaId, 'ENVIADA', 'PENDIENTE', 'ENVIADO', zapsign.raw);

      await client.query('commit');
      return getFirma(firmaId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function listFirmasCredito(creditoId: number) {
  return withClient(async (client) => {
    await ensureFirmaTables(client);
    const result = await client.query(
      `select f.id_credito_firma as id, f.id_credito as "creditoId",
        f.id_documento_generado as "documentoGeneradoId", f.proveedor,
        f.external_document_id as "externalDocumentId", f.sign_url as "signUrl",
        f.estado, f.firmante_nombre as "firmanteNombre",
        f.firmante_correo as "firmanteCorreo", f.firmante_telefono as "firmanteTelefono",
        g.nombre_archivo as "documento", f.nombre_archivo_firmado as "documentoFirmado",
        f.fec_envio as "fechaEnvio", f.fec_firma as "fechaFirma"
       from "Creditos"."TBL_CREDITO_FIRMAS" f
       inner join "Creditos"."TBL_DOCUMENTOS_GENERADOS" g on g.id_documento_generado = f.id_documento_generado
       where f.id_credito = $1
       order by f.fec_creacion desc, f.id_credito_firma desc`,
      [creditoId]
    );
    return result.rows;
  });
}

export async function getFirma(firmaId: number) {
  const result = await pool.query(
    `select f.id_credito_firma as id, f.id_credito as "creditoId",
      f.id_documento_generado as "documentoGeneradoId", f.proveedor,
      f.external_document_id as "externalDocumentId", f.sign_url as "signUrl",
      f.estado, f.firmante_nombre as "firmanteNombre",
      f.firmante_correo as "firmanteCorreo", f.firmante_telefono as "firmanteTelefono",
      f.fec_envio as "fechaEnvio", f.fec_firma as "fechaFirma"
     from "Creditos"."TBL_CREDITO_FIRMAS" f where f.id_credito_firma = $1`,
    [firmaId]
  );
  if (!result.rowCount) throw new SecurityError('Solicitud de firma no encontrada', 404);
  return result.rows[0];
}

export async function marcarFirmaSimulada(firmaId: number, estado: FirmaEstado) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureFirmaTables(client);
      const current = await client.query<{ estado: string }>(
        `select estado from "Creditos"."TBL_CREDITO_FIRMAS" where id_credito_firma = $1 for update`,
        [firmaId]
      );
      if (!current.rowCount) throw new SecurityError('Solicitud de firma no encontrada', 404);
      await client.query(
        `update "Creditos"."TBL_CREDITO_FIRMAS"
         set estado = $1, fec_firma = case when $1 = 'FIRMADO' then now() else fec_firma end,
             fec_actualizacion = now()
         where id_credito_firma = $2`,
        [estado, firmaId]
      );
      await addFirmaEvent(client, firmaId, 'SINCRONIZACION_MANUAL', current.rows[0].estado, estado, { mode: 'manual' });
      await client.query('commit');
      return getFirma(firmaId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function procesarWebhookZapSign(payload: Record<string, unknown>) {
  return withClient(async (client) => {
    await client.query('begin');

    try {
      await ensureFirmaTables(client);
      const externalId = findPayloadValue(payload, ['token', 'document_token', 'doc_token', 'open_id', 'id', 'document_id']);
      if (!externalId) throw new SecurityError('Webhook de ZapSign sin identificador de documento', 400);

      const current = await client.query<{
        id_credito_firma: number;
        estado: string;
      }>(
        `select id_credito_firma, estado
         from "Creditos"."TBL_CREDITO_FIRMAS"
         where external_document_id = $1
         order by id_credito_firma desc
         limit 1
         for update`,
        [externalId]
      );
      if (!current.rowCount) throw new SecurityError('Firma no encontrada para el webhook recibido', 404);

      const status = mapZapSignStatus(findPayloadValue(payload, ['status', 'event', 'event_type', 'document_status']));
      const signedUrl = findPayloadValue(payload, ['signed_file', 'signed_pdf', 'signed_file_url', 'download_url', 'original_file']);
      let signedPdf: Buffer | null = null;
      let signedHash: string | null = null;

      if (status === 'FIRMADO' && signedUrl) {
        signedPdf = await downloadRemoteFile(signedUrl);
        signedHash = crypto.createHash('sha256').update(signedPdf).digest('hex');
      }

      await client.query(
        `update "Creditos"."TBL_CREDITO_FIRMAS"
         set estado = $1,
             webhook_payload = $2::jsonb,
             pdf_firmado = coalesce($3, pdf_firmado),
             nombre_archivo_firmado = case when $3 is not null then coalesce(nombre_archivo_firmado, 'documento-firmado.pdf') else nombre_archivo_firmado end,
             hash_firmado = coalesce($4, hash_firmado),
             fec_firma = case when $1 = 'FIRMADO' then coalesce(fec_firma, now()) else fec_firma end,
             fec_actualizacion = now()
         where id_credito_firma = $5`,
        [status, JSON.stringify(payload), signedPdf, signedHash, current.rows[0].id_credito_firma]
      );
      await addFirmaEvent(client, current.rows[0].id_credito_firma, 'WEBHOOK_ZAPSIGN', current.rows[0].estado, status, payload);

      await client.query('commit');
      return getFirma(current.rows[0].id_credito_firma);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

export async function getPdfFirmado(firmaId: number) {
  return withClient(async (client) => {
    await ensureFirmaTables(client);
    const result = await client.query<{
      nombre_archivo_firmado: string | null;
      pdf_firmado: Buffer | null;
    }>(
      `select nombre_archivo_firmado, pdf_firmado
       from "Creditos"."TBL_CREDITO_FIRMAS"
       where id_credito_firma = $1`,
      [firmaId]
    );
    if (!result.rowCount || !result.rows[0].pdf_firmado) throw new SecurityError('La firma no tiene PDF firmado almacenado', 404);
    return {
      fileName: result.rows[0].nombre_archivo_firmado || `firma-${firmaId}.pdf`,
      content: result.rows[0].pdf_firmado
    };
  });
}
