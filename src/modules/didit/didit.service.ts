import crypto from 'node:crypto';
import { pool } from '../../lib/db.js';
import { env } from '../../config/env.js';
import { SecurityError } from '../security/security.service.js';
import { verificarIntegracionActiva } from '../financieras/financieras.service.js';

// Configuration value (NOT an env var, per Didit specifications)
export const DIDIT_WORKFLOW_ID = 'e42a2607-2f9f-475e-a5b8-0cbfc0213b06'; // "Free KYC"
export const DIDIT_BASE_URL = 'https://verification.didit.me/v3';

export interface DiditSessionRow {
  id_didit_verificacion: number;
  id_credito: number;
  id_cliente: number | null;
  session_id: string;
  session_token: string | null;
  url: string | null;
  workflow_id: string;
  vendor_data: string;
  estado: string;
  decision: string | null;
  score_similitud_facial: number | null;
  liveness_score: number | null;
  datos_documento: any;
  raw_decision: any;
  raw_webhook_payload: any;
  fec_creacion: Date;
  fec_actualizacion: Date;
}

/**
 * Initializes database tables for Didit verification sessions and webhook idempotency.
 */
export async function ensureDiditTables(): Promise<void> {
  await pool.query(`
    create table if not exists "Creditos"."TBL_DIDIT_VERIFICACIONES" (
      id_didit_verificacion serial primary key,
      id_credito int not null,
      id_cliente int,
      session_id varchar(120) not null unique,
      session_token text,
      url text,
      workflow_id varchar(120) not null,
      vendor_data varchar(120) not null,
      estado varchar(50) default 'Not Started',
      decision varchar(50),
      score_similitud_facial numeric(5,2),
      liveness_score numeric(5,2),
      datos_documento jsonb,
      raw_decision jsonb,
      raw_webhook_payload jsonb,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now()
    );

    create index if not exists idx_didit_credito on "Creditos"."TBL_DIDIT_VERIFICACIONES"(id_credito);
    create index if not exists idx_didit_session on "Creditos"."TBL_DIDIT_VERIFICACIONES"(session_id);
    create index if not exists idx_didit_vendor on "Creditos"."TBL_DIDIT_VERIFICACIONES"(vendor_data);

    -- Atomic & durable table for webhook idempotency
    create table if not exists "Creditos"."TBL_DIDIT_WEBHOOK_EVENTS" (
      event_id varchar(120) primary key,
      session_id varchar(120),
      status varchar(50),
      received_at timestamp with time zone default now()
    );
  `);
}

/**
 * Creates a server-side Didit verification session.
 * The DIDIT_API_KEY is retrieved from TBL_INTEGRACIONES_FINANCIERA (or env) and kept strictly on the backend.
 */
export async function crearSesionDidit(params: {
  creditoId: number;
  clienteId?: number;
  vendorData?: string;
  callbackUrl?: string;
}): Promise<{ url: string; session_id: string; session_token?: string }> {
  await ensureDiditTables();

  // Verify credit exists
  const creditoRes = await pool.query<{
    id_credito: number;
    consecutivo: number | null;
    v_estado_solicitud: string | null;
    id_financiera: number | null;
    v_nombre_cliente: string | null;
    v_identificacion_cliente: string | null;
    v_correo_cliente: string | null;
    v_telefono_cliente: string | null;
  }>(
    `select id_credito, consecutivo, v_estado_solicitud, id_financiera,
            coalesce(v_nombre_cliente, '') as v_nombre_cliente,
            coalesce(v_identificacion_cliente, '') as v_identificacion_cliente,
            coalesce(v_correo_cliente, '') as v_correo_cliente,
            coalesce(v_telefono_cliente, '') as v_telefono_cliente
     from "Creditos"."TBL_CREDITOS"
     where id_credito = $1
     limit 1`,
    [params.creditoId]
  );

  if (!creditoRes.rowCount) {
    throw new SecurityError(`Crédito con ID ${params.creditoId} no encontrado`, 404);
  }

  const credito = creditoRes.rows[0];

  // Validate Didit integration for this credit's financiera
  const integracionStatus = await verificarIntegracionActiva('DIDIT', params.creditoId, credito.id_financiera);
  if (!integracionStatus.activa) {
    throw new SecurityError(
      `La integración con Didit no se encuentra activa o configurada para la financiera '${integracionStatus.nombreFinanciera}'. Por favor realiza la validación mediante la carga manual de documentos.`,
      400
    );
  }

  const apiKey =
    integracionStatus.apiKey ||
    integracionStatus.clientId ||
    env.DIDIT_API_KEY ||
    process.env.DIDIT_API_KEY;

  if (!apiKey) {
    throw new SecurityError('DIDIT_API_KEY no configurado en la entidad financiera ni en el servidor', 500);
  }

  // Workflow ID: from client_id (if not equal to api_key), or datosConexion.workflow_id, or default
  const workflowId =
    (integracionStatus.clientId && integracionStatus.clientId !== apiKey ? integracionStatus.clientId : null) ||
    integracionStatus.datosConexion?.workflow_id ||
    DIDIT_WORKFLOW_ID;

  const baseUrl = integracionStatus.urlBase || DIDIT_BASE_URL;

  const clienteId = params.clienteId || null;
  const vendorData = params.vendorData || `credito:${params.creditoId}:cliente:${clienteId || 0}`;

  const callbackBase = params.callbackUrl ||
    (env.APP_PUBLIC_URL?.startsWith('http')
      ? `${env.APP_PUBLIC_URL}/?didit=done`
      : 'https://portal-creditos-three.vercel.app/?didit=done');

  const createSessionUrl = `${baseUrl.replace(/\/+$/, '')}/session/`;
  const requestBody = {
    workflow_id: workflowId,
    vendor_data: vendorData,
    callback: callbackBase,
    metadata: {
      creditoId: params.creditoId,
      clienteId: clienteId || null,
      documento: credito.v_identificacion_cliente || null,
      nombre: credito.v_nombre_cliente || null
    }
  };

  const response = await fetch(createSessionUrl, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new SecurityError(`Error al crear sesión Didit (${response.status}): ${detail}`, 502);
  }

  const sessionData = (await response.json()) as {
    session_id: string;
    session_token?: string;
    url: string;
    status?: string;
  };

  // Record session in database
  await pool.query(
    `insert into "Creditos"."TBL_DIDIT_VERIFICACIONES" (
      id_credito, id_cliente, session_id, session_token, url,
      workflow_id, vendor_data, estado
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (session_id) do update set
      url = excluded.url,
      session_token = excluded.session_token,
      estado = excluded.estado,
      fec_actualizacion = now()`,
    [
      params.creditoId,
      clienteId ?? null,
      sessionData.session_id,
      sessionData.session_token ?? null,
      sessionData.url,
      workflowId,
      vendorData,
      sessionData.status || 'Not Started'
    ]
  );

  return {
    url: sessionData.url,
    session_id: sessionData.session_id,
    session_token: sessionData.session_token
  };
}

/**
 * Whole-number floats (1.0) -> integers (1), recursively.
 * Matches Didit's server canonicalisation for X-Signature-V2.
 */
export function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)])
    );
  }
  if (typeof v === 'number' && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

/**
 * Recursive lexicographic key sort (array order preserved).
 */
export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

/**
 * Verifies X-Signature-V2 HMAC, checks freshness, dedupes event_id, and processes decision.
 */
export async function procesarDiditWebhook(
  rawBody: string | Record<string, unknown>,
  signatureHeader: string
): Promise<{ status: number; message: string }> {
  await ensureDiditTables();

  const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

  // Extract credit id to find financiera configuration
  let creditoId: number | null = null;
  if (parsed.metadata?.creditoId) {
    creditoId = Number(parsed.metadata.creditoId);
  } else if (typeof parsed.vendor_data === 'string') {
    const match = parsed.vendor_data.match(/credito:(\d+)/);
    if (match) creditoId = Number(match[1]);
  }

  const sessionId = String(parsed.session_id || '');
  if (!creditoId && sessionId) {
    const prev = await pool.query<{ id_credito: number }>(
      `select id_credito from "Creditos"."TBL_DIDIT_VERIFICACIONES" where session_id = $1 limit 1`,
      [sessionId]
    );
    if (prev.rowCount) {
      creditoId = prev.rows[0].id_credito;
    }
  }

  // Determine webhook secret (either from financiera's client_secret or server env)
  let webhookSecret = env.DIDIT_WEBHOOK_SECRET || process.env.DIDIT_WEBHOOK_SECRET;
  if (creditoId) {
    const integracionStatus = await verificarIntegracionActiva('DIDIT', creditoId);
    if (integracionStatus.clientSecret) {
      webhookSecret = integracionStatus.clientSecret;
    }
  }

  if (!webhookSecret) {
    console.error('Didit Webhook: Webhook secret no configurado en la financiera ni en el servidor');
    return { status: 500, message: 'Webhook secret not configured' };
  }

  // 1. Canonicalise: shortenFloats -> sortKeys -> JSON.stringify with unescaped Unicode
  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));

  // 2. Constant-time HMAC-SHA256 compare against X-Signature-V2
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(canonical, 'utf8')
    .digest('hex');

  const sig = signatureHeader || '';
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  ) {
    console.warn('Didit Webhook: Firma inválida', { sig, expectedLen: expected.length });
    return { status: 401, message: 'bad sig' };
  }

  // 3. Freshness — check the SIGNED parsed.timestamp field (never unsigned header)
  const ts = Number(parsed.timestamp);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.warn('Didit Webhook: Timestamp fuera del umbral de 300 segundos (stale)');
    return { status: 401, message: 'stale' };
  }

  // 4. Idempotency — dedupe on event_id using atomic PostgreSQL insert
  const eventId = String(parsed.event_id || '');
  if (eventId) {
    try {
      const insertEvent = await pool.query(
        `insert into "Creditos"."TBL_DIDIT_WEBHOOK_EVENTS" (event_id, session_id, status)
         values ($1, $2, $3)
         on conflict (event_id) do nothing
         returning event_id`,
        [eventId, parsed.session_id || null, parsed.status || null]
      );
      if (insertEvent.rowCount === 0) {
        // Event already processed
        return { status: 200, message: 'ok (already processed)' };
      }
    } catch (dbErr: any) {
      console.warn('Didit Webhook: Error en chequeo de idempotencia', dbErr.message);
    }
  }

  // 5. Apply decision covering ALL statuses (case-sensitive)
  const decision = parsed.decision || {};

  // Extract V3 plural arrays safely
  const idVerifications = Array.isArray(decision.id_verifications) ? decision.id_verifications : [];
  const livenessChecks = Array.isArray(decision.liveness_checks) ? decision.liveness_checks : [];
  const faceMatches = Array.isArray(decision.face_matches) ? decision.face_matches : [];

  const firstId = idVerifications[0] || {};
  const firstLiveness = livenessChecks[0] || {};
  const firstFaceMatch = faceMatches[0] || {};

  const facialSimilarity = firstFaceMatch.score != null ? Number(firstFaceMatch.score) : null;
  const livenessScore = firstLiveness.score != null ? Number(firstLiveness.score) : null;

  // Retrieve current verification record
  const verifRes = await pool.query<DiditSessionRow>(
    `select * from "Creditos"."TBL_DIDIT_VERIFICACIONES"
     where session_id = $1 or vendor_data = $2
     order by fec_creacion desc limit 1`,
    [sessionId, parsed.vendor_data || '']
  );

  const verif = verifRes.rows[0];
  creditoId = verif?.id_credito || creditoId;

  // Update TBL_DIDIT_VERIFICACIONES
  if (verif) {
    await pool.query(
      `update "Creditos"."TBL_DIDIT_VERIFICACIONES"
       set estado = $1,
           decision = $2,
           score_similitud_facial = coalesce($3, score_similitud_facial),
           liveness_score = coalesce($4, liveness_score),
           datos_documento = $5,
           raw_decision = $6,
           raw_webhook_payload = $7,
           fec_actualizacion = now()
       where id_didit_verificacion = $8`,
      [
        parsed.status,
        parsed.status,
        facialSimilarity,
        livenessScore,
        JSON.stringify(firstId),
        JSON.stringify(decision),
        JSON.stringify(parsed),
        verif.id_didit_verificacion
      ]
    );
  }

  // Dispatch exact case-sensitive status state machine
  switch (parsed.status) {
    case 'Approved':
      if (creditoId) {
        await pool.query(
          `update "Creditos"."TBL_CREDITOS"
           set v_estado_solicitud = 'EN_ESTUDIO', fec_actualizacion = now()
           where id_credito = $1`,
          [creditoId]
        );

        try {
          const docNum = firstId.document_number || firstId.document_type || 'Doc Verificado';
          await pool.query(
            `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
              id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
            ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'ESTUDIO', $2, null)`,
            [
              creditoId,
              `Validación de identidad Didit KYC APROBADA (Sesión: ${sessionId}, ${docNum}, Score Facial: ${facialSimilarity ?? 'N/A'})`
            ]
          );
        } catch (histErr: any) {
          console.warn('Didit Webhook: No se pudo registrar historial:', histErr.message);
        }
      }
      break;

    case 'Declined':
      if (creditoId) {
        await pool.query(
          `update "Creditos"."TBL_CREDITOS"
           set v_estado_solicitud = 'RECHAZADO', fec_actualizacion = now()
           where id_credito = $1`,
          [creditoId]
        );

        try {
          await pool.query(
            `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
              id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
            ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'RECHAZADO', $2, null)`,
            [
              creditoId,
              `Validación de identidad Didit KYC RECHAZADA (Sesión: ${sessionId})`
            ]
          );
        } catch (histErr: any) {
          console.warn('Didit Webhook: No se pudo registrar historial:', histErr.message);
        }
      }
      break;

    case 'In Review':
      if (creditoId) {
        try {
          await pool.query(
            `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
              id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
            ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'EN_REVISION', $2, null)`,
            [
              creditoId,
              `Validación Didit KYC en revisión manual (Sesión: ${sessionId})`
            ]
          );
        } catch (histErr: any) {
          console.warn('Didit Webhook: No se pudo registrar historial:', histErr.message);
        }
      }
      break;

    case 'Resubmitted':
      console.log('Didit Webhook: Resubmitted info:', parsed.resubmit_info?.nodes_to_resubmit);
      break;

    case 'Kyc Expired':
      console.log('Didit Webhook: KYC expirado para vendor_data:', parsed.vendor_data);
      break;

    case 'Not Started':
    case 'In Progress':
    case 'Awaiting User':
    case 'Abandoned':
    case 'Expired':
    default:
      // Status update noted; no extra DB state changes required
      break;
  }

  // 6. Return 2xx within 5 seconds
  return { status: 200, message: 'ok' };
}

/**
 * Returns current Didit verification status for a given credit.
 */
export async function obtenerEstadoDidit(creditoId: number): Promise<{
  configurado: boolean;
  activa: boolean;
  nombreFinanciera: string;
  verificacion: DiditSessionRow | null;
}> {
  await ensureDiditTables();

  const integracionStatus = await verificarIntegracionActiva('DIDIT', creditoId);
  const configurado = Boolean(
    integracionStatus.apiKey ||
    integracionStatus.clientId ||
    env.DIDIT_API_KEY ||
    process.env.DIDIT_API_KEY
  );

  const res = await pool.query<DiditSessionRow>(
    `select * from "Creditos"."TBL_DIDIT_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc limit 1`,
    [creditoId]
  );

  return {
    configurado,
    activa: integracionStatus.activa,
    nombreFinanciera: integracionStatus.nombreFinanciera,
    verificacion: res.rows[0] || null
  };
}
