import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';
import { SecurityError } from '../security/security.service.js';

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

export interface UploadBase64ImageOptions {
  base64Data: string;
  creditoId: number;
  numeroCredito?: string;
  folder?: string;
  fileNamePrefix: 'cedula_frente' | 'cedula_reverso' | 'foto_rostro' | string;
}

export interface UploadBufferOptions {
  buffer: Buffer;
  folder: string;
  fileName: string;
  contentType: string;
  creditoId?: number;
  metadata?: Record<string, string>;
}

// En entornos Lambda/Vercel, process.env.AWS_REGION es reservado por el runtime (suele ser us-east-1).
// Usamos prioritariamente env.AWS_S3_REGION o 'us-east-2' para apuntar al datacenter real del bucket.
const targetRegion = env.AWS_S3_REGION || 'us-east-2';
const targetBucket = env.AWS_S3_BUCKET || 's3-demo-financiera-009040764532-us-east-2-an';

// Credentials evaluation
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
export function getS3BucketConfig() {
  return {
    bucket: targetBucket,
    region: targetRegion,
    arn: `arn:aws:s3:::${targetBucket}`,
    hasCredentials: hasExplicitAwsCredentials
  };
}

/**
 * Crea una carpeta explícita en S3 asociada al número del crédito:
 * ej: Key: "CR-0001/"
 */
export async function createS3FolderIfNotExists(folderName: string): Promise<string> {
  const cleanFolder = sanitizeFolderName(folderName);
  const folderKey = `${cleanFolder}/`;
  const s3 = getS3Client();

  try {
    const command = new PutObjectCommand({
      Bucket: targetBucket,
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
    console.log(`[AWS S3] Carpeta creada/verificada en S3: ${folderKey} en bucket ${targetBucket}`);
  } catch (err: any) {
    console.error(`[AWS S3] Error creando carpeta ${folderKey}:`, err);
    throw new SecurityError(
      `Error conectando con AWS S3 al crear la carpeta '${folderKey}' en el bucket '${targetBucket}': ${err.message || 'Fallo de autenticación o permisos'}. Asegúrate de configurar AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en las variables de entorno de Vercel.`,
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
 * arn:aws:s3:::s3-demo-financiera-009040764532-us-east-2-an/{carpetaCredito}/{documento}.jpg
 */
export async function uploadBase64ImageToS3(
  options: UploadBase64ImageOptions
): Promise<S3UploadResult> {
  const { base64Data, creditoId, fileNamePrefix, folder, numeroCredito } = options;

  if (!base64Data) {
    throw new SecurityError(`Datos de imagen vacíos para el archivo ${fileNamePrefix}`, 400);
  }

  const rawFolder = folder || numeroCredito || `CR-${creditoId}`;
  const cleanFolder = sanitizeFolderName(rawFolder);

  const { buffer, mimeType, extension } = parseBase64Image(base64Data);
  const timestamp = Date.now();
  const key = `${cleanFolder}/${fileNamePrefix}_${timestamp}.${extension}`;
  const canonicalUrl = `https://${targetBucket}.s3.${targetRegion}.amazonaws.com/${key}`;
  const s3Uri = `s3://${targetBucket}/${key}`;
  const arn = `arn:aws:s3:::${targetBucket}/${key}`;

  const s3 = getS3Client();

  try {
    const command = new PutObjectCommand({
      Bucket: targetBucket,
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
      bucket: targetBucket,
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
      `[AWS S3 ERROR] Fallo al subir imagen al bucket ${targetBucket} (${key}):`,
      err
    );

    throw new SecurityError(
      `Error al subir ${fileNamePrefix} al bucket S3 '${targetBucket}': ${err.message || 'Fallo de conexión'}. Asegúrate de configurar las variables AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en Vercel y que tengan permisos en el bucket.`,
      500
    );
  }
}

/**
 * Sube un buffer binario directamente dentro de la carpeta del crédito en S3
 */
export async function uploadBufferToS3(options: UploadBufferOptions): Promise<S3UploadResult> {
  const { buffer, folder, fileName, contentType, creditoId, metadata = {} } = options;
  const cleanFolder = sanitizeFolderName(folder);
  const cleanFileName = fileName.replace(/[/\\?%*:|"<> ]/g, '_');
  const key = `${cleanFolder}/${cleanFileName}`;
  const canonicalUrl = `https://${targetBucket}.s3.${targetRegion}.amazonaws.com/${key}`;
  const s3Uri = `s3://${targetBucket}/${key}`;
  const arn = `arn:aws:s3:::${targetBucket}/${key}`;

  const s3 = getS3Client();

  try {
    const command = new PutObjectCommand({
      Bucket: targetBucket,
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
      bucket: targetBucket,
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
    console.error(`[AWS S3 ERROR] Fallo al subir buffer (${key}):`, err);
    throw new SecurityError(
      `Error al subir documento al bucket S3 '${targetBucket}': ${err.message || 'Fallo de conexión'}. Asegúrate de configurar AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en Vercel.`,
      500
    );
  }
}
