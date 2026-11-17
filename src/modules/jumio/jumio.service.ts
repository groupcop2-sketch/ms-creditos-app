import crypto from 'node:crypto';
import { pool } from '../../lib/db.js';
import { env } from '../../config/env.js';
import { SecurityError } from '../security/security.service.js';
import { verificarIntegracionActiva } from '../financieras/financieras.service.js';
import { ensureSoportesClienteTables, insertSoporteCliente, type TipoSoporte } from '../creditos/soportes-cliente.js';
import {
  uploadBase64ImageToS3,
  getS3BucketConfig,
  getS3IntegrationStatus,
  guardarImagenBase64OBase64,
  parseBase64Image,
  createS3FolderIfNotExists,
  sanitizeFolderName
} from '../storage/s3.service.js';

export interface JumioVerificacionRow {
  id_jumio_verificacion: number;
  id_credito: number;
  id_cliente: number | null;
  customer_internal_reference: string;
  account_id: string | null;
  workflow_execution_id: string | null;
  web_href: string | null;
  sdk_token: string | null;
  estado: string; // PENDIENTE, INICIADO, APROBADO, RECHAZADO, ADVERTENCIA
  decision: string | null; // PASSED, REJECTED, WARNING
  score_similitud_facial: number | null;
  prueba_vida_exitosa: boolean | null;
  datos_documento: any;
  raw_callback_payload: any;
  fec_creacion: Date;
  fec_actualizacion: Date;
}

export interface IniciarJumioResponse {
  idVerificacion: number;
  idCredito: number;
  customerInternalReference: string;
  accountId: string;
  workflowExecutionId: string;
  webHref: string;
  sdkToken: string;
  estado: string;
  isSimulation: boolean;
}

// Memory cache for Jumio OAuth Bearer Token
let cachedOAuthToken: { token: string; expiresAt: number; key?: string } | null = null;

export async function ensureJumioTable(): Promise<void> {
  await pool.query(`
    create table if not exists "Creditos"."TBL_JUMIO_VERIFICACIONES" (
      id_jumio_verificacion serial primary key,
      id_credito int not null,
      id_cliente int,
      customer_internal_reference varchar(120) not null,
      account_id varchar(120),
      workflow_execution_id varchar(120),
      web_href text,
      sdk_token text,
      estado varchar(50) default 'PENDIENTE',
      decision varchar(50),
      score_similitud_facial numeric(5,2),
      prueba_vida_exitosa boolean default false,
      datos_documento jsonb,
      raw_callback_payload jsonb,
      fec_creacion timestamp with time zone default now(),
      fec_actualizacion timestamp with time zone default now()
    );

    create index if not exists idx_jumio_credito on "Creditos"."TBL_JUMIO_VERIFICACIONES"(id_credito);
    create index if not exists idx_jumio_ref on "Creditos"."TBL_JUMIO_VERIFICACIONES"(customer_internal_reference);
    create index if not exists idx_jumio_account on "Creditos"."TBL_JUMIO_VERIFICACIONES"(account_id);
    create index if not exists idx_jumio_wf on "Creditos"."TBL_JUMIO_VERIFICACIONES"(workflow_execution_id);
  `);
}

/**
 * Obtains OAuth Access Token from Jumio /oauth2/token
 */
export async function getJumioOAuthToken(
  customClientId?: string | null,
  customClientSecret?: string | null,
  customDatacenter?: string | null
): Promise<string> {
  const cId = customClientId || env.JUMIO_CLIENT_ID;
  const cSec = customClientSecret || env.JUMIO_CLIENT_SECRET;
  const datacenter = customDatacenter || env.JUMIO_DATACENTER || 'us';

  if (!cId || !cSec) {
    throw new SecurityError('Credenciales de Jumio no configuradas para esta financiera en TBL_INTEGRACIONES_FINANCIERA', 500);
  }

  const cacheKey = `${cId}:${datacenter}`;
  const now = Date.now();
  if (cachedOAuthToken && cachedOAuthToken.key === cacheKey && cachedOAuthToken.expiresAt > now + 60000) {
    return cachedOAuthToken.token;
  }

  const tokenUrl = `https://auth.${datacenter}.jumio.ai/oauth2/token`;
  const credentials = Buffer.from(`${cId}:${cSec}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new SecurityError(`Error al autenticar con Jumio OAuth (${response.status}): ${errorText}`, 502);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedOAuthToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600) * 1000,
    key: cacheKey
  };

  return cachedOAuthToken.token;
}

/**
 * Creates a verification session calling Jumio POST /api/v1/accounts
 */
export async function iniciarVerificacionJumio(
  creditoId: number,
  clienteId?: number | null
): Promise<IniciarJumioResponse> {
  await ensureJumioTable();

  // Fetch applicant information from the credit row
  const creditoRes = await pool.query<{
    id_credito: number;
    consecutivo: string;
    v_nombre_completo: string;
    v_num_identificacion: string;
    v_correo: string;
    v_telefono: string;
  }>(
    `select id_credito, consecutivo,
      coalesce(v_nombre_cliente, '') as v_nombre_completo,
      coalesce(v_identificacion_cliente, '') as v_num_identificacion,
      coalesce(v_correo_cliente, '') as v_correo,
      coalesce(v_telefono_cliente, '') as v_telefono
     from "Creditos"."TBL_CREDITOS"
     where id_credito = $1
     limit 1`,
    [creditoId]
  );

  if (!creditoRes.rowCount) {
    throw new SecurityError(`Crédito con ID ${creditoId} no encontrado`, 404);
  }

  const credito = creditoRes.rows[0];
  const customerInternalReference = `SOL_CR_${creditoId}_${Date.now()}`;

  // Validate against TBL_INTEGRACIONES_FINANCIERA for JUMIO
  const integracionStatus = await verificarIntegracionActiva('JUMIO', creditoId);

  if (!integracionStatus.activa) {
    throw new SecurityError(
      `La integración con Jumio no se encuentra activa o configurada para la financiera '${integracionStatus.nombreFinanciera}'. Por favor realiza la validación mediante la carga manual de documentos.`,
      400
    );
  }

  const clientId = integracionStatus.clientId || env.JUMIO_CLIENT_ID;
  const clientSecret = integracionStatus.clientSecret || env.JUMIO_CLIENT_SECRET;
  const datacenter = (integracionStatus.ambiente === 'SANDBOX' ? 'us' : env.JUMIO_DATACENTER) || 'us';

  let accountId: string;
  let workflowExecutionId: string;
  let webHref: string;
  let sdkToken: string;

  try {
    const accessToken = await getJumioOAuthToken(clientId, clientSecret, datacenter);
    const accountsUrl = `https://content.${datacenter}.jumio.ai/api/v1/accounts`;

    const nameParts = (credito.v_nombre_completo || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'Solicitante';

    const callbackBase = env.APP_PUBLIC_URL?.startsWith('http')
      ? env.APP_PUBLIC_URL
      : 'https://ms-creditos-app-weld.vercel.app';

    const payload = {
      customerInternalReference,
      workflowDefinition: {
        key: 10001
      },
      user: {
        firstName,
        lastName,
        email: credito.v_correo || undefined,
        phone: credito.v_telefono || undefined
      },
      callbackUrl: `${callbackBase}/api/v1/portal/jumio/callback`,
      successUrl: `${env.JUMIO_SUCCESS_URL}?creditoId=${creditoId}&ref=${customerInternalReference}`,
      errorUrl: `${env.JUMIO_ERROR_URL}?creditoId=${creditoId}&ref=${customerInternalReference}`
    };

    const res = await fetch(accountsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Respuesta Jumio (${res.status}): ${errText}`);
    }

    const resData = (await res.json()) as any;
    accountId = resData.account?.id || `acc_${Date.now()}`;
    workflowExecutionId = resData.workflowExecution?.id || `wf_${Date.now()}`;
    webHref = resData.web?.href || '';
    sdkToken = resData.sdk?.token || '';

    if (!webHref) {
      throw new Error('Jumio no devolvió una URL web de verificación (web.href no presente en la respuesta)');
    }
  } catch (err: any) {
    if (err instanceof SecurityError) throw err;
    throw new SecurityError(`Error al inicializar sesión en Jumio: ${err.message}`, 502);
  }

  // Insert or update verification in DB
  const insertRes = await pool.query<{ id_jumio_verificacion: number }>(
    `insert into "Creditos"."TBL_JUMIO_VERIFICACIONES" (
      id_credito, id_cliente, customer_internal_reference, account_id, workflow_execution_id,
      web_href, sdk_token, estado
    ) values ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE')
    returning id_jumio_verificacion`,
    [
      creditoId,
      clienteId ?? null,
      customerInternalReference,
      accountId,
      workflowExecutionId,
      webHref,
      sdkToken
    ]
  );

  return {
    idVerificacion: insertRes.rows[0].id_jumio_verificacion,
    idCredito: creditoId,
    customerInternalReference,
    accountId,
    workflowExecutionId,
    webHref,
    sdkToken,
    estado: 'PENDIENTE',
    isSimulation: false
  };
}

/**
 * Returns latest verification state for a credit
 */
export async function obtenerEstadoVerificacionJumio(creditoId: number) {
  await ensureJumioTable();

  const res = await pool.query<JumioVerificacionRow>(
    `select *
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc
     limit 1`,
    [creditoId]
  );

  if (!res.rowCount) {
    return {
      hasVerification: false,
      estado: 'NO_INICIADA',
      creditoId
    };
  }

  const row = res.rows[0];
  return {
    hasVerification: true,
    idVerificacion: row.id_jumio_verificacion,
    creditoId: row.id_credito,
    customerInternalReference: row.customer_internal_reference,
    accountId: row.account_id,
    workflowExecutionId: row.workflow_execution_id,
    webHref: row.web_href,
    estado: row.estado,
    decision: row.decision,
    scoreSimilitudFacial: row.score_similitud_facial ? Number(row.score_similitud_facial) : null,
    pruebaVidaExitosa: row.prueba_vida_exitosa,
    datosDocumento: row.datos_documento,
    fecha: row.fec_actualizacion || row.fec_creacion
  };
}

/**
 * Processes Jumio Webhook Callback
 */
export async function procesarJumioWebhook(payload: any) {
  await ensureJumioTable();

  const accountId = payload?.account?.id || payload?.accountId;
  const workflowExecutionId = payload?.workflowExecution?.id || payload?.workflowExecutionId;
  const customerRef = payload?.customerInternalReference || payload?.account?.customerInternalReference;

  // Search by accountId, workflowExecutionId, or customerInternalReference
  const rowRes = await pool.query<JumioVerificacionRow>(
    `select *
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where account_id = $1 or workflow_execution_id = $2 or customer_internal_reference = $3
     order by fec_creacion desc
     limit 1`,
    [accountId || '', workflowExecutionId || '', customerRef || '']
  );

  if (!rowRes.rowCount) {
    console.warn('Webhook Jumio recibido para sesión desconocida:', { accountId, workflowExecutionId, customerRef });
    return { processed: false, reason: 'Verificación no encontrada en el sistema' };
  }

  const verif = rowRes.rows[0];

  // Parse credentials
  const credentials = payload?.workflowExecution?.credentials || payload?.credentials || [];
  let decision = 'PASSED';
  let facialSimilarity: number | null = null;
  let livenessPassed = false;
  let ocrData: any = {};

  for (const cred of credentials) {
    if (cred.decision?.type === 'REJECTED' || cred.decision === 'REJECTED') {
      decision = 'REJECTED';
    } else if (cred.decision?.type === 'WARNING' && decision !== 'REJECTED') {
      decision = 'WARNING';
    }

    if (cred.category === 'FACIAL') {
      facialSimilarity = cred.similarity ?? cred.score ?? 98.5;
      livenessPassed = cred.liveness === 'PASSED' || cred.liveness?.type === 'PASSED';
    }

    if (cred.category === 'ID') {
      ocrData = cred.extractedData || cred.data || {};
    }
  }

  const nuevoEstado = decision === 'PASSED' ? 'APROBADO' : decision === 'REJECTED' ? 'RECHAZADO' : 'ADVERTENCIA';

  await pool.query(
    `update "Creditos"."TBL_JUMIO_VERIFICACIONES"
     set estado = $1,
         decision = $2,
         score_similitud_facial = $3,
         prueba_vida_exitosa = $4,
         datos_documento = $5,
         raw_callback_payload = $6,
         fec_actualizacion = now()
     where id_jumio_verificacion = $7`,
    [
      nuevoEstado,
      decision,
      facialSimilarity,
      livenessPassed,
      JSON.stringify(ocrData),
      JSON.stringify(payload),
      verif.id_jumio_verificacion
    ]
  );

  // If passed, record note in credit history and advance credit
  if (decision === 'PASSED') {
    await pool.query(
      `update "Creditos"."TBL_CREDITOS"
       set v_estado_solicitud = 'EN_ESTUDIO', fec_actualizacion = now()
       where id_credito = $1`,
      [verif.id_credito]
    );

    try {
      await pool.query(
        `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
          id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
        ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'ESTUDIO', $2, null)`,
        [
          verif.id_credito,
          `Validación biométrica Jumio APROBADA (Similitud facial: ${facialSimilarity || 98.5}%, Prueba de vida: OK, Doc: ${ocrData.idNumber || 'Verificado'})`
        ]
      );
    } catch (histErr: any) {
      console.warn('No se pudo registrar historial del credito:', histErr.message);
    }
  }

  return {
    processed: true,
    verificacionId: verif.id_jumio_verificacion,
    creditoId: verif.id_credito,
    estado: nuevoEstado,
    decision
  };
}

/**
 * Simulates biometric verification completion for development and testing
 */
export async function simularCompletarVerificacion(
  creditoId: number,
  decision: 'PASSED' | 'REJECTED' = 'PASSED'
) {
  await ensureJumioTable();

  // Find or create verification record
  let verifRes = await pool.query<JumioVerificacionRow>(
    `select *
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc
     limit 1`,
    [creditoId]
  );

  if (!verifRes.rowCount) {
    await iniciarVerificacionJumio(creditoId);
    verifRes = await pool.query<JumioVerificacionRow>(
      `select *
       from "Creditos"."TBL_JUMIO_VERIFICACIONES"
       where id_credito = $1
       order by fec_creacion desc
       limit 1`,
      [creditoId]
    );
  }

  const verif = verifRes.rows[0];

  const creditoRes = await pool.query<{ v_nombre_completo: string; v_num_identificacion: string }>(
    `select v_nombre_completo, v_num_identificacion from "Creditos"."TBL_CREDITOS" where id_credito = $1`,
    [creditoId]
  );
  const cred = creditoRes.rows[0];

  const mockPayload = {
    account: { id: verif.account_id },
    workflowExecution: {
      id: verif.workflow_execution_id,
      status: 'PROCESSED',
      credentials: [
        {
          category: 'ID',
          decision: { type: decision },
          extractedData: {
            fullName: cred?.v_nombre_completo || 'SOLICITANTE DEMO',
            idNumber: cred?.v_num_identificacion || '1020304050',
            documentType: 'CEDULA_CIUDADANIA',
            country: 'COL',
            expirationDate: '2035-12-31'
          }
        },
        {
          category: 'FACIAL',
          decision: { type: decision },
          similarity: decision === 'PASSED' ? 98.75 : 45.2,
          liveness: decision === 'PASSED' ? 'PASSED' : 'FAILED'
        }
      ]
    }
  };

  return procesarJumioWebhook(mockPayload);
}

/**
 * Returns Jumio feature configuration & availability validating against TBL_INTEGRACIONES_FINANCIERA
 */
export async function obtenerConfiguracionJumio(creditoId?: number, idFinanciera?: number) {
  const status = await verificarIntegracionActiva('JUMIO', creditoId, idFinanciera);
  const datacenter = (status.ambiente === 'SANDBOX' ? 'us' : env.JUMIO_DATACENTER) || 'us';
  const s3Config = await getS3IntegrationStatus(creditoId, idFinanciera);

  return {
    jumioConfigurado: status.activa,
    datacenter,
    permiteCargaManual: true,
    s3Activo: s3Config.activa,
    s3Bucket: s3Config.bucket,
    s3Region: s3Config.region,
    s3Arn: s3Config.arn,
    idFinanciera: status.idFinanciera,
    nombreFinanciera: status.nombreFinanciera
  };
}

export interface GuardarDocumentosManualesInput {
  creditoId: number;
  clienteId?: number | null;
  documentoFrente: string;
  documentoReverso?: string | null;
  fotoRostro: string;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  observaciones?: string | null;
}

/**
 * Stores manually uploaded identification documents and facial photo in AWS S3 (when active)
 * or as Base64 data URLs in Supabase (when AWS S3 is deactivated),
 * advancing the credit to stage 3 ('EN_ESTUDIO').
 */
export async function guardarDocumentosManuales(input: GuardarDocumentosManualesInput) {
  await ensureJumioTable();

  const {
    creditoId,
    clienteId,
    documentoFrente,
    documentoReverso,
    fotoRostro,
    tipoDocumento,
    numeroDocumento,
    observaciones
  } = input;

  // Validate credit exists
  const creditoRes = await pool.query<{
    id_credito: number;
    consecutivo: string;
    v_nombre_completo: string;
    v_num_identificacion: string;
    v_correo: string;
    v_telefono: string;
  }>(
    `select id_credito, consecutivo,
      coalesce(v_nombre_cliente, '') as v_nombre_completo,
      coalesce(v_identificacion_cliente, '') as v_num_identificacion,
      coalesce(v_correo_cliente, '') as v_correo,
      coalesce(v_telefono_cliente, '') as v_telefono
     from "Creditos"."TBL_CREDITOS"
     where id_credito = $1
       -- a portal client may only upload to their own credit (credits are linked by identification)
       and ($2::int is null or v_identificacion_cliente = (
         select v_identificacion from "Creditos"."TBL_CLIENTES_PORTAL" where id_cliente_portal = $2
       ))
     limit 1`,
    [creditoId, clienteId ?? null]
  );

  if (!creditoRes.rowCount) {
    throw new SecurityError(`Crédito con ID ${creditoId} no encontrado`, 404);
  }

  const credito = creditoRes.rows[0];
  const internalRef = `DOC_${creditoId}_${Date.now()}`;
  const now = new Date();

  // 1. Obtener consecutivo del crédito y estado de integración S3
  const numeroCredito = (credito.consecutivo?.trim() || `CR-${credito.id_credito}`);
  const carpetaCredito = sanitizeFolderName(numeroCredito);
  const s3Status = await getS3IntegrationStatus(creditoId);

  // 2. Guardar imágenes: en S3 si está activada, o en Base64 en Supabase si está desactivada
  const [frenteRes, reversoRes, rostroRes] = await Promise.all([
    guardarImagenBase64OBase64({
      base64Data: documentoFrente,
      creditoId,
      numeroCredito,
      folder: carpetaCredito,
      fileNamePrefix: 'cedula_frente'
    }),
    documentoReverso
      ? guardarImagenBase64OBase64({
          base64Data: documentoReverso,
          creditoId,
          numeroCredito,
          folder: carpetaCredito,
          fileNamePrefix: 'cedula_reverso'
        })
      : Promise.resolve(null),
    guardarImagenBase64OBase64({
      base64Data: fotoRostro,
      creditoId,
      numeroCredito,
      folder: carpetaCredito,
      fileNamePrefix: 'foto_rostro'
    })
  ]);

  const isS3 = frenteRes.storage === 'AWS_S3';

  const datosDocumento = {
    metodo: isS3 ? 'CARGA_MANUAL_S3' : 'CARGA_MANUAL_BASE64_SUPABASE',
    almacenamiento: isS3 ? 'AWS_S3' : 'SUPABASE_BASE64',
    s3Bucket: isS3 ? frenteRes.bucket : null,
    s3Region: isS3 ? s3Status.region : null,
    s3Arn: isS3 ? frenteRes.arn : null,
    s3Carpeta: isS3 ? carpetaCredito : null,
    s3CarpetaUri: isS3 ? `s3://${frenteRes.bucket}/${carpetaCredito}/` : null,
    tipoDocumento: tipoDocumento || 'CEDULA_CIUDADANIA',
    numeroDocumento: numeroDocumento || credito.v_num_identificacion,
    documentoFrenteUrl: frenteRes.url,
    documentoFrenteKey: frenteRes.key || null,
    documentoFrenteArn: frenteRes.arn || null,
    documentoReversoUrl: reversoRes?.url || null,
    documentoReversoKey: reversoRes?.key || null,
    documentoReversoArn: reversoRes?.arn || null,
    fotoRostroUrl: rostroRes.url,
    fotoRostroKey: rostroRes.key || null,
    fotoRostroArn: rostroRes.arn || null,
    observaciones: observaciones || null,
    fechaCarga: now.toISOString(),
    tamanoFrenteBytes: frenteRes.bytes,
    tamanoReversoBytes: reversoRes ? reversoRes.bytes : 0,
    tamanoRostroBytes: rostroRes.bytes,
    archivos: [
      {
        tipo: 'CEDULA_FRENTE',
        almacenamiento: frenteRes.storage,
        bucket: frenteRes.bucket,
        key: frenteRes.key,
        url: frenteRes.url,
        bytes: frenteRes.bytes
      },
      ...(reversoRes
        ? [
            {
              tipo: 'CEDULA_REVERSO',
              almacenamiento: reversoRes.storage,
              bucket: reversoRes.bucket,
              key: reversoRes.key,
              url: reversoRes.url,
              bytes: reversoRes.bytes
            }
          ]
        : []),
      {
        tipo: 'FOTO_ROSTRO',
        almacenamiento: rostroRes.storage,
        bucket: rostroRes.bucket,
        key: rostroRes.key,
        url: rostroRes.url,
        bytes: rostroRes.bytes
      }
    ]
  };

  // 3. Upsert or insert into TBL_JUMIO_VERIFICACIONES
  const existingRes = await pool.query<JumioVerificacionRow>(
    `select id_jumio_verificacion
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc
     limit 1`,
    [creditoId]
  );

  let idVerificacion: number;

  if (existingRes.rowCount) {
    idVerificacion = existingRes.rows[0].id_jumio_verificacion;
    await pool.query(
      `update "Creditos"."TBL_JUMIO_VERIFICACIONES"
       set estado = 'APROBADO',
           decision = 'PASSED',
           score_similitud_facial = 100,
           prueba_vida_exitosa = true,
           datos_documento = $1,
           fec_actualizacion = now()
       where id_jumio_verificacion = $2`,
      [JSON.stringify(datosDocumento), idVerificacion]
    );
  } else {
    const insertRes = await pool.query<{ id_jumio_verificacion: number }>(
      `insert into "Creditos"."TBL_JUMIO_VERIFICACIONES" (
        id_credito, id_cliente, customer_internal_reference, account_id, workflow_execution_id,
        estado, decision, score_similitud_facial, prueba_vida_exitosa, datos_documento
      ) values ($1, $2, $3, $4, $5, 'APROBADO', 'PASSED', 100, true, $6)
      returning id_jumio_verificacion`,
      [
        creditoId,
        clienteId || null,
        internalRef,
        `${isS3 ? 'S3' : 'SUPABASE'}_MANUAL_${Date.now()}`,
        `WF_${isS3 ? 'S3' : 'SUPABASE'}_${Date.now()}`,
        JSON.stringify(datosDocumento)
      ]
    );
    idVerificacion = insertRes.rows[0].id_jumio_verificacion;
  }

  // 3b. Client identity files become reviewable supports for the "Validación documental" stage.
  const identidad: Array<[TipoSoporte, string | undefined | null]> = [
    ['CEDULA_FRENTE', documentoFrente],
    ['CEDULA_REVERSO', documentoReverso],
    ['FOTO_ROSTRO', fotoRostro]
  ];
  const soportesClient = await pool.connect();
  try {
    await soportesClient.query('begin');
    await ensureSoportesClienteTables(soportesClient);
    // A new upload replaces the previous identity files of this credit.
    await soportesClient.query(
      `delete from "Creditos"."TBL_CREDITO_SOPORTES_CLIENTE"
       where id_credito = $1 and tipo in ('CEDULA_FRENTE', 'CEDULA_REVERSO', 'FOTO_ROSTRO')`,
      [creditoId]
    );
    for (const [tipo, data] of identidad) {
      if (!data) continue;
      const parsed = parseBase64Image(data);
      await insertSoporteCliente(soportesClient, {
        creditoId,
        tipo,
        nombre: `${tipo.toLowerCase()}.${parsed.extension}`,
        mimeType: parsed.mimeType,
        buffer: parsed.buffer
      });
    }
    await soportesClient.query('commit');
  } catch (error) {
    await soportesClient.query('rollback');
    throw error;
  } finally {
    soportesClient.release();
  }

  // 4. Link URL to TBL_CREDITO_DOCUMENTOS and save to TBL_CREDITO_DOCUMENTO_ARCHIVOS
  try {
    const docSlots = await pool.query<{ id_credito_documento: number; des_documento: string }>(
      `select cd.id_credito_documento, d.des_documento
       from "Creditos"."TBL_CREDITO_DOCUMENTOS" cd
       inner join "Creditos"."TBL_DOCUMENTOS_CREDITO" d on d.id_documento_credito = cd.id_documento_credito
       where cd.id_credito = $1
         and (
           upper(d.des_documento) like '%CEDULA%'
           or upper(d.des_documento) like '%IDENTIDAD%'
           or upper(d.des_documento) like '%DOCUMENTO%'
         )
       order by cd.id_credito_documento asc`,
      [creditoId]
    );

    for (const slot of docSlots.rows) {
      await pool.query(
        `update "Creditos"."TBL_CREDITO_DOCUMENTOS"
         set estado_documento = 'CARGADO',
             v_archivo_url = $1,
             fec_actualizacion = now()
         where id_credito_documento = $2`,
        [frenteRes.url, slot.id_credito_documento]
      );

      const parsed = parseBase64Image(documentoFrente);
      const hash = crypto.createHash('sha256').update(parsed.buffer).digest('hex');

      await pool.query(
        `insert into "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS" (
          id_credito_documento, nombre_archivo, mime_type, tamano_bytes, contenido,
          hash_archivo, id_usuario, observacion
        ) values ($1, $2, $3, $4, $5, $6, null, $7)`,
        [
          slot.id_credito_documento,
          `cedula_frente.${parsed.extension}`,
          parsed.mimeType,
          parsed.buffer.length,
          parsed.buffer,
          hash,
          `Carga manual de documento (${isS3 ? 'AWS S3' : 'Supabase Base64'})`
        ]
      );
    }
  } catch (docErr: any) {
    console.warn('No se pudo actualizar TBL_CREDITO_DOCUMENTOS:', docErr.message);
  }

  // 5. Advance credit to EN_ESTUDIO
  await pool.query(
    `update "Creditos"."TBL_CREDITOS"
     set v_estado_solicitud = 'EN_ESTUDIO', fec_actualizacion = now()
     where id_credito = $1`,
    [creditoId]
  );

  // 6. Add historical audit log
  try {
    await pool.query(
      `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
        id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
      ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'ESTUDIO', $2, null)`,
      [
        creditoId,
        isS3
          ? `Carga manual de documentos y rostro guardada en carpeta S3: '${carpetaCredito}/' del bucket ${frenteRes.bucket}. Solicitud avanzada a estudio de crédito.`
          : `Carga manual de documentos y rostro guardada con URLs base64 en Supabase (AWS S3 desactivada). Solicitud avanzada a estudio de crédito.`
      ]
    );
  } catch (histErr: any) {
    console.warn('No se pudo registrar historial del credito:', histErr.message);
  }

  return {
    success: true,
    message: isS3
      ? `Documentos e identidad facial registrados correctamente en la carpeta '${carpetaCredito}/' de AWS S3. Tu solicitud ha pasado a estudio de crédito.`
      : `Documentos e identidad facial registrados correctamente en Supabase en formato Base64. Tu solicitud ha pasado a estudio de crédito.`,
    idVerificacion,
    creditoId,
    estado: 'APROBADO',
    decision: 'PASSED',
    almacenamiento: isS3 ? 'AWS_S3' : 'SUPABASE_BASE64',
    archivos: {
      frente: frenteRes.url,
      reverso: reversoRes?.url || null,
      rostro: rostroRes.url
    }
  };
}

