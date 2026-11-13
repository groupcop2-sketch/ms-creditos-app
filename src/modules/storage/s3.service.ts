import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';
import { SecurityError } from '../security/security.service.js';
import { verificarIntegracionActiva } from '../financieras/financieras.service.js';

export interface S3UploadResult {
  success: boolean;
  bucket: string;
  folder: string;
  key: string;
  url: string;
  s3Uri: string;
  arn: string;
  bytes: number;
  contentType: string;
  etag?: string;
  simulated?: boolean;
  error?: string;
}

export interface S3IntegrationConfig {
  activa: boolean;
  bucket: string;
  region: string;
  arn: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export interface StorageUploadResult {
  success: boolean;
  storage: 'AWS_S3' | 'SUPABASE_BASE64';
  url: string;
  bucket?: string;
  folder?: string;
  key?: string;
  arn?: string;
  bytes: number;
  contentType: string;
  etag?: string;
}

export interface UploadBase64ImageOptions {
  base64Data: string;
  creditoId: number;
  numeroCredito?: string;
  folder?: string;
  fileNamePrefix: 'cedula_frente' | 'cedula_reverso' | 'foto_rostro' | string;
  s3Config?: Partial<S3IntegrationConfig>;
}

export interface UploadBufferOptions {
  buffer: Buffer;
  folder: string;
  fileName: string;
  contentType: string;
  creditoId?: number;
  metadata?: Record<string, string>;
  s3Config?: Partial<S3IntegrationConfig>;
}

// Configuración predeterminada de fallback desde variables de entorno
const targetRegion = env.AWS_S3_REGION || 'us-east-2';
const targetBucket = env.AWS_S3_BUCKET || 's3-demo-financiera-009040764532-us-east-2-an';

const hasExplicitAwsCredentials = Boolean(
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
);

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: targetRegion,
      ...(hasExplicitAwsCredentials
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
              ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {})
            }
          }
        : {})
    });
  }
  return s3ClientInstance;
}

/**
 * Crea una instancia de cliente S3 dinámica basada en la configuración de la integración o fallback
 */
export function createS3ClientFromConfig(config?: Partial<S3IntegrationConfig>): S3Client {
  const region = config?.region || targetRegion;
  const creds = config?.credentials;
  const accessKeyId = creds?.accessKeyId || env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = creds?.secretAccessKey || env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = creds?.sessionToken || env.AWS_SESSION_TOKEN;

  if (accessKeyId && secretAccessKey) {
    return new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {})
      }
    });
  }

  return getS3Client();
}

/**
 * Obtiene el estado de activación y credenciales de la integración AWS_S3 para un crédito o financiera
 */
export async function getS3IntegrationStatus(
  creditoId?: number | null,
  idFinanciera?: number | null
): Promise<S3IntegrationConfig> {
  try {
    const status = await verificarIntegracionActiva('AWS_S3', creditoId, idFinanciera);
    const bucket =
      status.accountId?.trim() ||
      (status.datosConexion?.bucket as string)?.trim() ||
      env.AWS_S3_BUCKET ||
      's3-demo-financiera-009040764532-us-east-2-an';
    const region =
      status.urlBase?.trim() ||
      (status.datosConexion?.region as string)?.trim() ||
      env.AWS_S3_REGION ||
      'us-east-2';
    const arn = `arn:aws:s3:::${bucket}`;

    if (!status.activa) {
      return {
        activa: false,
        bucket,
        region,
        arn
      };
    }

    const accessKeyId = status.clientId?.trim() || env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = status.clientSecret?.trim() || env.AWS_SECRET_ACCESS_KEY || '';
    const sessionToken = status.apiKey?.trim() || env.AWS_SESSION_TOKEN || undefined;

    return {
      activa: Boolean(accessKeyId && secretAccessKey),
      bucket,
      region,
      arn,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
              sessionToken
            }
          : undefined
    };
  } catch (err: any) {
    console.warn('[AWS S3] Error al verificar estado de integración S3, usando valores por defecto:', err.message);
    return {
      activa: hasExplicitAwsCredentials,
      bucket: targetBucket,
      region: targetRegion,
      arn: `arn:aws:s3:::${targetBucket}`,
      credentials: hasExplicitAwsCredentials
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: env.AWS_SESSION_TOKEN || undefined
          }
        : undefined
    };
  }
}

/**
 * Normaliza el nombre de la carpeta para S3 evitando caracteres no permitidos
 */
export function sanitizeFolderName(folder: string): string {
  return folder
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[/\\?%*:|"<> ]/g, '-');
}

/**
 * Returns general AWS S3 bucket configuration info
 */
export function getS3BucketConfig(config?: Partial<S3IntegrationConfig>) {
  const bucket = config?.bucket || targetBucket;
  const region = config?.region || targetRegion;
  const hasCreds = Boolean(config?.credentials?.accessKeyId || hasExplicitAwsCredentials);
  return {
    bucket,
    region,
    arn: `arn:aws:s3:::${bucket}`,
    hasCredentials: hasCreds
  };
}

/**
 * Crea una carpeta explícita en S3 asociada al número del crédito:
 * ej: Key: "CR-0001/"
 */
export async function createS3FolderIfNotExists(
  folderName: string,
  config?: Partial<S3IntegrationConfig>
): Promise<string> {
  const cleanFolder = sanitizeFolderName(folderName);
  const folderKey = `${cleanFolder}/`;
  const bucket = config?.bucket || targetBucket;
  const s3 = config?.credentials ? createS3ClientFromConfig(config) : getS3Client();

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: folderKey,
      Body: Buffer.alloc(0),
      ContentType: 'application/x-directory',
      Metadata: {
        'tipo-objeto': 'carpeta-credito',
        'carpeta-credito': cleanFolder,
        'fecha-creacion': new Date().toISOString()
      }
    });

    await s3.send(command);
    console.log(`[AWS S3] Carpeta creada/verificada en S3: ${folderKey} en bucket ${bucket}`);
  } catch (err: any) {
    console.error(`[AWS S3] Error creando carpeta ${folderKey} en bucket ${bucket}:`, err);
    throw new SecurityError(
      `Error conectando con AWS S3 al crear la carpeta '${folderKey}' en el bucket '${bucket}': ${err.message || 'Fallo de autenticación o permisos'}.`,
      500
    );
  }

  return cleanFolder;
}

/**
 * Parses a base64 string (including data URL prefix) to a Buffer and detects mime type & extension
 */
export function parseBase64Image(dataString: string): {
  buffer: Buffer;
  mimeType: string;
  extension: string;
} {
  let cleanData = dataString.trim();
  let mimeType = 'image/jpeg';
  let extension = 'jpg';

  const dataUriMatch = cleanData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/s);
  if (dataUriMatch) {
    mimeType = dataUriMatch[1].toLowerCase();
    cleanData = dataUriMatch[2];
    if (mimeType.includes('png')) extension = 'png';
    else if (mimeType.includes('webp')) extension = 'webp';
    else if (mimeType.includes('gif')) extension = 'gif';
    else if (mimeType.includes('pdf')) extension = 'pdf';
    else extension = 'jpg';
  }

  // Remove potential whitespace/newlines inside base64 payload
  const sanitized = cleanData.replace(/\s/g, '');
  const buffer = Buffer.from(sanitized, 'base64');

  return { buffer, mimeType, extension };
}

/**
 * Sube una imagen base64 directamente dentro de la carpeta del crédito en el bucket S3:
 * arn:aws:s3:::{targetBucket}/{carpetaCredito}/{documento}.jpg
 */
export async function uploadBase64ImageToS3(
  options: UploadBase64ImageOptions
): Promise<S3UploadResult> {
  const { base64Data, creditoId, fileNamePrefix, folder, numeroCredito, s3Config } = options;

  if (!base64Data) {
    throw new SecurityError(`Datos de imagen vacíos para el archivo ${fileNamePrefix}`, 400);
  }

  const rawFolder = folder || numeroCredito || `CR-${creditoId}`;
  const cleanFolder = sanitizeFolderName(rawFolder);
  const bucket = s3Config?.bucket || targetBucket;
  const region = s3Config?.region || targetRegion;

  const { buffer, mimeType, extension } = parseBase64Image(base64Data);
  const timestamp = Date.now();
  const key = `${cleanFolder}/${fileNamePrefix}_${timestamp}.${extension}`;
  const canonicalUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  const s3Uri = `s3://${bucket}/${key}`;
  const arn = `arn:aws:s3:::${bucket}/${key}`;

  const s3 = s3Config?.credentials ? createS3ClientFromConfig(s3Config) : getS3Client();

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        'credito-id': String(creditoId),
        'numero-credito': cleanFolder,
        'tipo-documento': fileNamePrefix,
        'fecha-subida': new Date().toISOString()
      }
    });

    const response = await s3.send(command);

    return {
      success: true,
      bucket,
      folder: cleanFolder,
      key,
      url: canonicalUrl,
      s3Uri,
      arn,
      bytes: buffer.length,
      contentType: mimeType,
      etag: response.ETag,
      simulated: false
    };
  } catch (err: any) {
    console.error(
      `[AWS S3 ERROR] Fallo al subir imagen al bucket ${bucket} (${key}):`,
      err
    );

    throw new SecurityError(
      `Error al subir ${fileNamePrefix} al bucket S3 '${bucket}': ${err.message || 'Fallo de conexión'}.`,
      500
    );
  }
}

/**
 * Sube un buffer binario directamente dentro de la carpeta del crédito en S3
 */
export async function uploadBufferToS3(options: UploadBufferOptions): Promise<S3UploadResult> {
  const { buffer, folder, fileName, contentType, creditoId, metadata = {}, s3Config } = options;
  const cleanFolder = sanitizeFolderName(folder);
  const cleanFileName = fileName.replace(/[/\\?%*:|"<> ]/g, '_');
  const bucket = s3Config?.bucket || targetBucket;
  const region = s3Config?.region || targetRegion;
  const key = `${cleanFolder}/${cleanFileName}`;
  const canonicalUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  const s3Uri = `s3://${bucket}/${key}`;
  const arn = `arn:aws:s3:::${bucket}/${key}`;

  const s3 = s3Config?.credentials ? createS3ClientFromConfig(s3Config) : getS3Client();

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        ...(creditoId ? { 'credito-id': String(creditoId) } : {}),
        'numero-credito': cleanFolder,
        'fecha-subida': new Date().toISOString(),
        ...metadata
      }
    });

    const response = await s3.send(command);

    return {
      success: true,
      bucket,
      folder: cleanFolder,
      key,
      url: canonicalUrl,
      s3Uri,
      arn,
      bytes: buffer.length,
      contentType,
      etag: response.ETag,
      simulated: false
    };
  } catch (err: any) {
    console.error(`[AWS S3 ERROR] Fallo al subir buffer (${key}) a bucket ${bucket}:`, err);
    throw new SecurityError(
      `Error al subir documento al bucket S3 '${bucket}': ${err.message || 'Fallo de conexión'}.`,
      500
    );
  }
}

/**
 * Guarda un buffer binario en AWS S3 si la integración está activada para el crédito.
 * Cuando AWS S3 está desactivada (o si la subida falla), guarda el documento como una URL base64 en Supabase.
 */
export async function guardarDocumentoOBase64(options: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  creditoId: number;
  numeroCredito?: string;
  folder?: string;
  metadata?: Record<string, string>;
}): Promise<StorageUploadResult> {
  const { buffer, fileName, contentType, creditoId, numeroCredito, folder, metadata } = options;
  const rawFolder = folder || numeroCredito || `CR-${creditoId}`;
  const cleanFolder = sanitizeFolderName(rawFolder);

  const s3Status = await getS3IntegrationStatus(creditoId);

  if (s3Status.activa && s3Status.credentials) {
    try {
      await createS3FolderIfNotExists(cleanFolder, s3Status);
      const s3Res = await uploadBufferToS3({
        buffer,
        fileName,
        contentType,
        folder: cleanFolder,
        creditoId,
        metadata,
        s3Config: s3Status
      });

      return {
        success: true,
        storage: 'AWS_S3',
        url: s3Res.url,
        bucket: s3Res.bucket,
        folder: s3Res.folder,
        key: s3Res.key,
        arn: s3Res.arn,
        bytes: s3Res.bytes,
        contentType: s3Res.contentType,
        etag: s3Res.etag
      };
    } catch (err: any) {
      console.warn(`[AWS S3] Falló subida a bucket ${s3Status.bucket} (${err.message}). Guardando documento como URL base64 en Supabase.`);
    }
  } else {
    console.log(`[AWS S3] Integración desactivada para crédito ${creditoId}. Guardando como URL base64 en Supabase.`);
  }

  // AWS S3 desactivada -> Data URL base64 en Supabase
  const base64Data = buffer.toString('base64');
  const base64Url = `data:${contentType};base64,${base64Data}`;

  return {
    success: true,
    storage: 'SUPABASE_BASE64',
    url: base64Url,
    bucket: 'supabase',
    folder: cleanFolder,
    key: `${cleanFolder}/${fileName}`,
    arn: `supabase://Creditos/TBL_CREDITO_DOCUMENTOS/${creditoId}/${fileName}`,
    bytes: buffer.length,
    contentType
  };
}

/**
 * Guarda una imagen base64 en AWS S3 si la integración está activada para el crédito.
 * Cuando AWS S3 está desactivada (o si la subida falla), guarda la imagen como una URL base64 en Supabase.
 */
export async function guardarImagenBase64OBase64(options: {
  base64Data: string;
  fileNamePrefix: 'cedula_frente' | 'cedula_reverso' | 'foto_rostro' | string;
  creditoId: number;
  numeroCredito?: string;
  folder?: string;
}): Promise<StorageUploadResult> {
  const { base64Data, fileNamePrefix, creditoId, numeroCredito, folder } = options;
  const rawFolder = folder || numeroCredito || `CR-${creditoId}`;
  const cleanFolder = sanitizeFolderName(rawFolder);
  const { buffer, mimeType, extension } = parseBase64Image(base64Data);

  const s3Status = await getS3IntegrationStatus(creditoId);

  if (s3Status.activa && s3Status.credentials) {
    try {
      await createS3FolderIfNotExists(cleanFolder, s3Status);
      const s3Res = await uploadBase64ImageToS3({
        base64Data,
        creditoId,
        numeroCredito,
        folder: cleanFolder,
        fileNamePrefix,
        s3Config: s3Status
      });

      return {
        success: true,
        storage: 'AWS_S3',
        url: s3Res.url,
        bucket: s3Res.bucket,
        folder: s3Res.folder,
        key: s3Res.key,
        arn: s3Res.arn,
        bytes: s3Res.bytes,
        contentType: s3Res.contentType,
        etag: s3Res.etag
      };
    } catch (err: any) {
      console.warn(`[AWS S3] Falló subida a S3 de ${fileNamePrefix} (${err.message}). Guardando como URL base64 en Supabase.`);
    }
  } else {
    console.log(`[AWS S3] Integración desactivada para crédito ${creditoId}. Guardando ${fileNamePrefix} como URL base64 en Supabase.`);
  }

  // AWS S3 desactivada -> Data URL base64 en Supabase
  const base64Url = `data:${mimeType};base64,${buffer.toString('base64')}`;

  return {
    success: true,
    storage: 'SUPABASE_BASE64',
    url: base64Url,
    bucket: 'supabase',
    folder: cleanFolder,
    key: `${cleanFolder}/${fileNamePrefix}.${extension}`,
    arn: `supabase://Creditos/TBL_CREDITO_DOCUMENTOS/${creditoId}/${fileNamePrefix}`,
    bytes: buffer.length,
    contentType: mimeType
  };
}
