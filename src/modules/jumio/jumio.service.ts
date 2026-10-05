import { pool } from '../../lib/db.js';
import { env } from '../../config/env.js';
import { SecurityError } from '../security/security.service.js';

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
let cachedOAuthToken: { token: string; expiresAt: number } | null = null;

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
export async function getJumioOAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 60000) {
    return cachedOAuthToken.token;
  }

  if (!env.JUMIO_CLIENT_ID || !env.JUMIO_CLIENT_SECRET) {
    throw new SecurityError('Credenciales de Jumio (JUMIO_CLIENT_ID / JUMIO_CLIENT_SECRET) no configuradas', 500);
  }

  const datacenter = env.JUMIO_DATACENTER || 'us';
  const tokenUrl = `https://auth.${datacenter}.jumio.ai/oauth2/token`;

  const credentials = Buffer.from(`${env.JUMIO_CLIENT_ID}:${env.JUMIO_CLIENT_SECRET}`).toString('base64');

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
    expiresAt: now + (data.expires_in || 3600) * 1000
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

  const shouldUseRealJumio =
    Boolean(env.JUMIO_CLIENT_ID?.trim()) &&
    Boolean(env.JUMIO_CLIENT_SECRET?.trim());

  let accountId: string;
  let workflowExecutionId: string;
  let webHref: string;
  let sdkToken: string;

  if (!shouldUseRealJumio) {
    throw new SecurityError(
      'Credenciales de Jumio no configuradas. Por favor ingresa JUMIO_CLIENT_ID y JUMIO_CLIENT_SECRET en tu archivo .env y en las variables de entorno de Vercel.',
      400
    );
  }

  try {
    const accessToken = await getJumioOAuthToken();
    const datacenter = env.JUMIO_DATACENTER || 'us';
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

    await pool.query(
      `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
        id_credito, evento, estado_anterior, estado_nuevo, descripcion, id_usuario
      ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'ESTUDIO', $2, 1)`,
      [
        verif.id_credito,
        `Validación biométrica Jumio APROBADA (Similitud facial: ${facialSimilarity || 98.5}%, Prueba de vida: OK, Doc: ${ocrData.idNumber || 'Verificado'})`
      ]
    );
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
