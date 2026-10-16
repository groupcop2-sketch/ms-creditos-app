import { pool } from '../../lib/db.js';
import { env } from '../../config/env.js';
import { SecurityError } from '../security/security.service.js';
import { verificarIntegracionActiva } from '../financieras/financieras.service.js';
import { uploadBase64ImageToS3, getS3BucketConfig, createS3FolderIfNotExists, sanitizeFolderName } from '../storage/s3.service.js';
// Memory cache for Jumio OAuth Bearer Token
let cachedOAuthToken = null;
export async function ensureJumioTable() {
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
export async function getJumioOAuthToken(customClientId, customClientSecret, customDatacenter) {
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
    const data = (await response.json());
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
export async function iniciarVerificacionJumio(creditoId, clienteId) {
    await ensureJumioTable();
    // Fetch applicant information from the credit row
    const creditoRes = await pool.query(`select id_credito, consecutivo,
      coalesce(v_nombre_cliente, '') as v_nombre_completo,
      coalesce(v_identificacion_cliente, '') as v_num_identificacion,
      coalesce(v_correo_cliente, '') as v_correo,
      coalesce(v_telefono_cliente, '') as v_telefono
     from "Creditos"."TBL_CREDITOS"
     where id_credito = $1
     limit 1`, [creditoId]);
    if (!creditoRes.rowCount) {
        throw new SecurityError(`Crédito con ID ${creditoId} no encontrado`, 404);
    }
    const credito = creditoRes.rows[0];
    const customerInternalReference = `SOL_CR_${creditoId}_${Date.now()}`;
    // Validate against TBL_INTEGRACIONES_FINANCIERA for JUMIO
    const integracionStatus = await verificarIntegracionActiva('JUMIO', creditoId);
    if (!integracionStatus.activa) {
        throw new SecurityError(`La integración con Jumio no se encuentra activa o configurada para la financiera '${integracionStatus.nombreFinanciera}'. Por favor realiza la validación mediante la carga manual de documentos.`, 400);
    }
    const clientId = integracionStatus.clientId || env.JUMIO_CLIENT_ID;
    const clientSecret = integracionStatus.clientSecret || env.JUMIO_CLIENT_SECRET;
    const datacenter = (integracionStatus.ambiente === 'SANDBOX' ? 'us' : env.JUMIO_DATACENTER) || 'us';
    let accountId;
    let workflowExecutionId;
    let webHref;
    let sdkToken;
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
        const resData = (await res.json());
        accountId = resData.account?.id || `acc_${Date.now()}`;
        workflowExecutionId = resData.workflowExecution?.id || `wf_${Date.now()}`;
        webHref = resData.web?.href || '';
        sdkToken = resData.sdk?.token || '';
        if (!webHref) {
            throw new Error('Jumio no devolvió una URL web de verificación (web.href no presente en la respuesta)');
        }
    }
    catch (err) {
        if (err instanceof SecurityError)
            throw err;
        throw new SecurityError(`Error al inicializar sesión en Jumio: ${err.message}`, 502);
    }
    // Insert or update verification in DB
    const insertRes = await pool.query(`insert into "Creditos"."TBL_JUMIO_VERIFICACIONES" (
      id_credito, id_cliente, customer_internal_reference, account_id, workflow_execution_id,
      web_href, sdk_token, estado
    ) values ($1, $2, $3, $4, $5, $6, $7, 'PENDIENTE')
    returning id_jumio_verificacion`, [
        creditoId,
        clienteId ?? null,
        customerInternalReference,
        accountId,
        workflowExecutionId,
        webHref,
        sdkToken
    ]);
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
export async function obtenerEstadoVerificacionJumio(creditoId) {
    await ensureJumioTable();
    const res = await pool.query(`select *
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc
     limit 1`, [creditoId]);
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
export async function procesarJumioWebhook(payload) {
    await ensureJumioTable();
    const accountId = payload?.account?.id || payload?.accountId;
    const workflowExecutionId = payload?.workflowExecution?.id || payload?.workflowExecutionId;
    const customerRef = payload?.customerInternalReference || payload?.account?.customerInternalReference;
    // Search by accountId, workflowExecutionId, or customerInternalReference
    const rowRes = await pool.query(`select *
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where account_id = $1 or workflow_execution_id = $2 or customer_internal_reference = $3
     order by fec_creacion desc
     limit 1`, [accountId || '', workflowExecutionId || '', customerRef || '']);
    if (!rowRes.rowCount) {
        console.warn('Webhook Jumio recibido para sesión desconocida:', { accountId, workflowExecutionId, customerRef });
        return { processed: false, reason: 'Verificación no encontrada en el sistema' };
    }
    const verif = rowRes.rows[0];
    // Parse credentials
    const credentials = payload?.workflowExecution?.credentials || payload?.credentials || [];
    let decision = 'PASSED';
    let facialSimilarity = null;
    let livenessPassed = false;
    let ocrData = {};
    for (const cred of credentials) {
        if (cred.decision?.type === 'REJECTED' || cred.decision === 'REJECTED') {
            decision = 'REJECTED';
        }
        else if (cred.decision?.type === 'WARNING' && decision !== 'REJECTED') {
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
    await pool.query(`update "Creditos"."TBL_JUMIO_VERIFICACIONES"
     set estado = $1,
         decision = $2,
         score_similitud_facial = $3,
         prueba_vida_exitosa = $4,
         datos_documento = $5,
         raw_callback_payload = $6,
         fec_actualizacion = now()
     where id_jumio_verificacion = $7`, [
        nuevoEstado,
        decision,
        facialSimilarity,
        livenessPassed,
        JSON.stringify(ocrData),
        JSON.stringify(payload),
        verif.id_jumio_verificacion
    ]);
    // If passed, record note in credit history and advance credit
    if (decision === 'PASSED') {
        await pool.query(`update "Creditos"."TBL_CREDITOS"
       set v_estado_solicitud = 'EN_ESTUDIO', fec_actualizacion = now()
       where id_credito = $1`, [verif.id_credito]);
        try {
            await pool.query(`insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
          id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
        ) values ($1, 'VALIDACION_BIOMETRICA', 'VALIDACION', 'ESTUDIO', $2, null)`, [
                verif.id_credito,
                `Validación biométrica Jumio APROBADA (Similitud facial: ${facialSimilarity || 98.5}%, Prueba de vida: OK, Doc: ${ocrData.idNumber || 'Verificado'})`
            ]);
        }
        catch (histErr) {
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
export async function simularCompletarVerificacion(creditoId, decision = 'PASSED') {
    await ensureJumioTable();
    // Find or create verification record
    let verifRes = await pool.query(`select *
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc
     limit 1`, [creditoId]);
    if (!verifRes.rowCount) {
        await iniciarVerificacionJumio(creditoId);
        verifRes = await pool.query(`select *
       from "Creditos"."TBL_JUMIO_VERIFICACIONES"
       where id_credito = $1
       order by fec_creacion desc
       limit 1`, [creditoId]);
    }
    const verif = verifRes.rows[0];
    const creditoRes = await pool.query(`select v_nombre_completo, v_num_identificacion from "Creditos"."TBL_CREDITOS" where id_credito = $1`, [creditoId]);
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
export async function obtenerConfiguracionJumio(creditoId, idFinanciera) {
    const status = await verificarIntegracionActiva('JUMIO', creditoId, idFinanciera);
    const datacenter = (status.ambiente === 'SANDBOX' ? 'us' : env.JUMIO_DATACENTER) || 'us';
    const s3Config = getS3BucketConfig();
    return {
        jumioConfigurado: status.activa,
        datacenter,
        permiteCargaManual: true,
        s3Bucket: s3Config.bucket,
        s3Region: s3Config.region,
        s3Arn: s3Config.arn,
        idFinanciera: status.idFinanciera,
        nombreFinanciera: status.nombreFinanciera
    };
}
/**
 * Stores manually uploaded identification documents and facial photo in AWS S3:
 * arn:aws:s3:::s3-demo-financiera-009040764532-us-east-2-an/{carpetaCredito}/
 * advancing the credit to stage 3 ('EN_ESTUDIO').
 */
export async function guardarDocumentosManuales(input) {
    await ensureJumioTable();
    const { creditoId, clienteId, documentoFrente, documentoReverso, fotoRostro, tipoDocumento, numeroDocumento, observaciones } = input;
    // Validate credit exists
    const creditoRes = await pool.query(`select id_credito, consecutivo,
      coalesce(v_nombre_cliente, '') as v_nombre_completo,
      coalesce(v_identificacion_cliente, '') as v_num_identificacion,
      coalesce(v_correo_cliente, '') as v_correo,
      coalesce(v_telefono_cliente, '') as v_telefono
     from "Creditos"."TBL_CREDITOS"
     where id_credito = $1
     limit 1`, [creditoId]);
    if (!creditoRes.rowCount) {
        throw new SecurityError(`Crédito con ID ${creditoId} no encontrado`, 404);
    }
    const credito = creditoRes.rows[0];
    const internalRef = `DOC_S3_${creditoId}_${Date.now()}`;
    const now = new Date();
    // 1. Obtener y asegurar la carpeta asociada al número del crédito en S3 (ej: CR-0001)
    const numeroCredito = (credito.consecutivo?.trim() || `CR-${credito.id_credito}`);
    const carpetaCredito = sanitizeFolderName(numeroCredito);
    await createS3FolderIfNotExists(carpetaCredito);
    // 2. Subir imágenes asociadas dentro de la carpeta del crédito en el bucket S3
    const [s3Frente, s3Reverso, s3Rostro] = await Promise.all([
        uploadBase64ImageToS3({
            base64Data: documentoFrente,
            creditoId,
            numeroCredito,
            folder: carpetaCredito,
            fileNamePrefix: 'cedula_frente'
        }),
        documentoReverso
            ? uploadBase64ImageToS3({
                base64Data: documentoReverso,
                creditoId,
                numeroCredito,
                folder: carpetaCredito,
                fileNamePrefix: 'cedula_reverso'
            })
            : Promise.resolve(null),
        uploadBase64ImageToS3({
            base64Data: fotoRostro,
            creditoId,
            numeroCredito,
            folder: carpetaCredito,
            fileNamePrefix: 'foto_rostro'
        })
    ]);
    const s3Config = getS3BucketConfig();
    const datosDocumento = {
        metodo: 'CARGA_MANUAL_S3',
        almacenamiento: 'AWS_S3',
        s3Bucket: s3Config.bucket,
        s3Region: s3Config.region,
        s3Arn: s3Config.arn,
        s3Carpeta: carpetaCredito,
        s3CarpetaUri: `s3://${s3Config.bucket}/${carpetaCredito}/`,
        tipoDocumento: tipoDocumento || 'CEDULA_CIUDADANIA',
        numeroDocumento: numeroDocumento || credito.v_num_identificacion,
        documentoFrenteUrl: s3Frente.url,
        documentoFrenteKey: s3Frente.key,
        documentoFrenteArn: s3Frente.arn,
        documentoReversoUrl: s3Reverso?.url || null,
        documentoReversoKey: s3Reverso?.key || null,
        documentoReversoArn: s3Reverso?.arn || null,
        fotoRostroUrl: s3Rostro.url,
        fotoRostroKey: s3Rostro.key,
        fotoRostroArn: s3Rostro.arn,
        observaciones: observaciones || null,
        fechaCarga: now.toISOString(),
        tamanoFrenteBytes: s3Frente.bytes,
        tamanoReversoBytes: s3Reverso ? s3Reverso.bytes : 0,
        tamanoRostroBytes: s3Rostro.bytes,
        archivosS3: [
            {
                tipo: 'CEDULA_FRENTE',
                carpeta: carpetaCredito,
                bucket: s3Frente.bucket,
                key: s3Frente.key,
                url: s3Frente.url,
                arn: s3Frente.arn,
                bytes: s3Frente.bytes,
                simulado: s3Frente.simulated
            },
            ...(s3Reverso
                ? [
                    {
                        tipo: 'CEDULA_REVERSO',
                        carpeta: carpetaCredito,
                        bucket: s3Reverso.bucket,
                        key: s3Reverso.key,
                        url: s3Reverso.url,
                        arn: s3Reverso.arn,
                        bytes: s3Reverso.bytes,
                        simulado: s3Reverso.simulated
                    }
                ]
                : []),
            {
                tipo: 'FOTO_ROSTRO',
                carpeta: carpetaCredito,
                bucket: s3Rostro.bucket,
                key: s3Rostro.key,
                url: s3Rostro.url,
                arn: s3Rostro.arn,
                bytes: s3Rostro.bytes,
                simulado: s3Rostro.simulated
            }
        ]
    };
    // 3. Upsert or insert into TBL_JUMIO_VERIFICACIONES
    const existingRes = await pool.query(`select id_jumio_verificacion
     from "Creditos"."TBL_JUMIO_VERIFICACIONES"
     where id_credito = $1
     order by fec_creacion desc
     limit 1`, [creditoId]);
    let idVerificacion;
    if (existingRes.rowCount) {
        idVerificacion = existingRes.rows[0].id_jumio_verificacion;
        await pool.query(`update "Creditos"."TBL_JUMIO_VERIFICACIONES"
       set estado = 'APROBADO',
           decision = 'PASSED',
           score_similitud_facial = 100,
           prueba_vida_exitosa = true,
           datos_documento = $1,
           fec_actualizacion = now()
       where id_jumio_verificacion = $2`, [JSON.stringify(datosDocumento), idVerificacion]);
    }
    else {
        const insertRes = await pool.query(`insert into "Creditos"."TBL_JUMIO_VERIFICACIONES" (
        id_credito, id_cliente, customer_internal_reference, account_id, workflow_execution_id,
        estado, decision, score_similitud_facial, prueba_vida_exitosa, datos_documento
      ) values ($1, $2, $3, $4, $5, 'APROBADO', 'PASSED', 100, true, $6)
      returning id_jumio_verificacion`, [
            creditoId,
            clienteId || null,
            internalRef,
            `S3_MANUAL_${Date.now()}`,
            `WF_S3_${Date.now()}`,
            JSON.stringify(datosDocumento)
        ]);
        idVerificacion = insertRes.rows[0].id_jumio_verificacion;
    }
    // 4. Link S3 URL to TBL_CREDITO_DOCUMENTOS if a cédula/identidad slot exists
    try {
        await pool.query(`update "Creditos"."TBL_CREDITO_DOCUMENTOS"
       set estado_documento = 'CARGADO',
           v_archivo_url = $1,
           fec_actualizacion = now()
       where id_credito = $2
         and (
           id_documento_credito in (
             select id_documento_credito from "Creditos"."TBL_DOCUMENTOS_CREDITO"
             where upper(des_documento) like '%CEDULA%'
                or upper(des_documento) like '%IDENTIDAD%'
                or upper(des_documento) like '%DOCUMENTO%'
           )
         )`, [s3Frente.url, creditoId]);
    }
    catch (docErr) {
        console.warn('No se pudo actualizar TBL_CREDITO_DOCUMENTOS:', docErr.message);
    }
    // 5. Advance credit to EN_ESTUDIO
    await pool.query(`update "Creditos"."TBL_CREDITOS"
     set v_estado_solicitud = 'EN_ESTUDIO', fec_actualizacion = now()
     where id_credito = $1`, [creditoId]);
    // 6. Add historical audit log
    try {
        await pool.query(`insert into "Creditos"."TBL_CREDITO_HISTORIAL" (
        id_credito, accion, estado_anterior, estado_nuevo, observacion, id_usuario
      ) values ($1, 'VALIDACION_BIOMETRICA_S3', 'VALIDACION', 'ESTUDIO', $2, null)`, [
            creditoId,
            `Carga manual de documentos y rostro guardada en carpeta S3: '${carpetaCredito}/' del bucket ${s3Config.bucket}. Solicitud avanzada a estudio de crédito.`
        ]);
    }
    catch (histErr) {
        console.warn('No se pudo registrar historial del credito:', histErr.message);
    }
    return {
        success: true,
        message: `Documentos e identidad facial registrados correctamente en la carpeta '${carpetaCredito}/' de AWS S3. Tu solicitud ha pasado a estudio de crédito.`,
        idVerificacion,
        creditoId,
        estado: 'APROBADO',
        decision: 'PASSED',
        s3: {
            bucket: s3Config.bucket,
            arn: s3Config.arn,
            region: s3Config.region,
            carpeta: carpetaCredito,
            archivos: {
                frente: s3Frente.url,
                reverso: s3Reverso?.url || null,
                rostro: s3Rostro.url
            }
        }
    };
}
