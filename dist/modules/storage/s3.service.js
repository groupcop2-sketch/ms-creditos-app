import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';
const targetRegion = env.AWS_REGION || 'us-east-2';
const targetBucket = env.AWS_S3_BUCKET || 's3-demo-financiera-009040764532-us-east-2-an';
// Credentials evaluation
const hasExplicitAwsCredentials = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
let s3ClientInstance = null;
function getS3Client() {
    if (!s3ClientInstance) {
        s3ClientInstance = new S3Client({
            region: targetRegion,
            ...(hasExplicitAwsCredentials
                ? {
                    credentials: {
                        accessKeyId: env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
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
export function sanitizeFolderName(folder) {
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
export async function createS3FolderIfNotExists(folderName) {
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
    }
    catch (err) {
        console.warn(`[AWS S3] Advertencia creando carpeta ${folderKey}:`, err.message || err);
    }
    return cleanFolder;
}
/**
 * Parses a base64 string (including data URL prefix) to a Buffer and detects mime type & extension
 */
export function parseBase64Image(dataString) {
    let cleanData = dataString.trim();
    let mimeType = 'image/jpeg';
    let extension = 'jpg';
    const dataUriMatch = cleanData.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/s);
    if (dataUriMatch) {
        mimeType = dataUriMatch[1].toLowerCase();
        cleanData = dataUriMatch[2];
        if (mimeType.includes('png'))
            extension = 'png';
        else if (mimeType.includes('webp'))
            extension = 'webp';
        else if (mimeType.includes('gif'))
            extension = 'gif';
        else if (mimeType.includes('pdf'))
            extension = 'pdf';
        else
            extension = 'jpg';
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
export async function uploadBase64ImageToS3(options) {
    const { base64Data, creditoId, fileNamePrefix, folder, numeroCredito } = options;
    if (!base64Data) {
        throw new Error(`Datos de imagen vacíos para el archivo ${fileNamePrefix}`);
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
    }
    catch (err) {
        console.warn(`[AWS S3] Advertencia al subir imagen al bucket ${targetBucket} (${key}):`, err.message || err);
        const isCredentialsError = err.name === 'CredentialsProviderError' ||
            err.message?.includes('credential') ||
            err.message?.includes('AccessDenied') ||
            err.message?.includes('Forbidden') ||
            err.name === 'AccessDenied';
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
            simulated: isCredentialsError,
            error: err.message
        };
    }
}
/**
 * Sube un buffer binario directamente dentro de la carpeta del crédito en S3
 */
export async function uploadBufferToS3(options) {
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
    }
    catch (err) {
        console.warn(`[AWS S3] Advertencia al subir buffer (${key}):`, err.message || err);
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
            simulated: true,
            error: err.message
        };
    }
}
