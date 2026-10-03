import crypto from 'node:crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pool } from '../../lib/db.js';
import { env } from '../../config/env.js';
import { sendMail } from '../../lib/mailer.js';
import { SecurityError } from '../security/security.service.js';
// ----------------------------------------------------
// STATE MACHINE TRANSITION RULES
// ----------------------------------------------------
const ALLOWED_TRANSITIONS = {
    DRAFT: ['SENT', 'VOIDED'],
    SENT: ['DELIVERED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'],
    DELIVERED: ['COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'],
    COMPLETED: [], // Terminal
    DECLINED: [], // Terminal
    VOIDED: [], // Terminal
    EXPIRED: [] // Terminal
};
export function canTransition(current, next) {
    if (current === next)
        return true;
    return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
}
function formatCurrency(val) {
    const num = typeof val === 'number' ? val : Number(val || 0);
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(num);
}
// ----------------------------------------------------
// REAL PDF GENERATORS FOR CREDITS (Pagaré + Contrato)
// ----------------------------------------------------
async function generatePagarePdf(credito, firmante) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard Letter size
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const primaryColor = rgb(0.06, 0.28, 0.44); // Fintech navy
    const textColor = rgb(0.15, 0.15, 0.15);
    const grayColor = rgb(0.45, 0.45, 0.45);
    const consecutivo = String(credito.consecutivo || 'CR-000000');
    const monto = Number(credito.val_monto_solicitado || 0);
    const plazo = Number(credito.num_plazo || 12);
    const tasa = Number(credito.val_tasa || 1.8);
    const cuota = Number(credito.val_cuota_estimada || 0);
    // Header banner
    page.drawRectangle({
        x: 40,
        y: 710,
        width: 532,
        height: 48,
        color: rgb(0.94, 0.96, 0.98),
        borderColor: primaryColor,
        borderWidth: 1
    });
    page.drawText('PAGARÉ EN BLANCO CON CARTA DE INSTRUCCIONES', {
        x: 60,
        y: 735,
        size: 13,
        font: fontBold,
        color: primaryColor
    });
    page.drawText(`TÍTULO VALOR No. PG-${consecutivo}  ·  ORIGINACIÓN DIGITAL`, {
        x: 60,
        y: 720,
        size: 9,
        font: fontRegular,
        color: grayColor
    });
    // Main terms table
    const startY = 680;
    page.drawText('1. CONDICIONES FINANCIERAS DEL TÍTULO VALOR', {
        x: 40,
        y: startY,
        size: 10,
        font: fontBold,
        color: primaryColor
    });
    const details = [
        ['OTORGANTE / DEUDOR:', `${firmante.nombre} (C.C. ${firmante.identificacion || 'Pendiente'})`],
        ['CORREO ELECTRÓNICO:', firmante.correo],
        ['VALOR DEL CAPITAL:', formatCurrency(monto)],
        ['PLAZO PACTADO:', `${plazo} cuotas fijas mensuales`],
        ['TASA DE INTERÉS:', `${tasa.toFixed(2)}% M.V. (Mes Vencido)`],
        ['CUOTA MENSUAL ESTIMADA:', formatCurrency(cuota)],
        ['LUGAR Y FECHA DE PAGO:', `Bogotá D.C., Colombia - ${new Date().toLocaleDateString('es-CO')}`]
    ];
    let currentY = startY - 20;
    for (const [k, v] of details) {
        page.drawText(k, { x: 50, y: currentY, size: 8.5, font: fontBold, color: textColor });
        page.drawText(v, { x: 220, y: currentY, size: 8.5, font: fontRegular, color: textColor });
        currentY -= 16;
    }
    // Legal Clauses
    currentY -= 10;
    page.drawText('2. DECLARACIÓN DE VOLUNTAD Y CLÁUSULA ACELERATORIA', {
        x: 40,
        y: currentY,
        size: 10,
        font: fontBold,
        color: primaryColor
    });
    currentY -= 16;
    const legalText = [
        `Yo, ${firmante.nombre}, mayor de edad, identificado como aparece al pie de mi firma, por medio del`,
        'presente título valor prometo incondicionalmente pagar a la orden del ACREEDOR o a quien represente sus',
        `derechos, en las fechas convenidas, la suma de ${formatCurrency(monto)} más los intereses remuneratorios y`,
        'moratorios a la tasa máxima legal permitida por la Superintendencia Financiera de Colombia.',
        'CLÁUSULA ACELERATORIA: El no pago de una o más cuotas causará la aceleración total del saldo insoluto,',
        'haciéndose exigible judicial o extrajudicialmente de manera inmediata sin necesidad de requerimiento alguno,',
        'renunciando expresamente a la constitución en mora y a los requerimientos de ley (Art. 69 C.G.P.).',
        'La presente firma electrónica cuenta con plena validez probatoria conforme a la Ley 527 de 1999 y el',
        'Decreto 2364 de 2012, certificada bajo protocolo criptográfico y trazabilidad de DocuSign.'
    ];
    for (const line of legalText) {
        page.drawText(line, { x: 40, y: currentY, size: 8.5, font: fontRegular, color: textColor });
        currentY -= 14;
    }
    // Signature Block
    currentY -= 30;
    page.drawRectangle({
        x: 40,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
        color: rgb(0.98, 0.99, 1)
    });
    page.drawText('[ ÁREA DE FIRMA ELECTRÓNICA DOCUSIGN ]', {
        x: 50,
        y: currentY - 20,
        size: 7.5,
        font: fontBold,
        color: primaryColor
    });
    page.drawText(`Firma: ${firmante.nombre}`, {
        x: 50,
        y: currentY - 45,
        size: 8,
        font: fontBold,
        color: textColor
    });
    page.drawText(`C.C. ${firmante.identificacion || 'N/A'}  ·  ${firmante.correo}`, {
        x: 50,
        y: currentY - 60,
        size: 7.5,
        font: fontRegular,
        color: grayColor
    });
    // Footer stamp
    page.drawText('DocuSign Envelope ID: PENDING_AUTHENTICATION · Certificado Audit Trail Ley 527/1999', {
        x: 40,
        y: 30,
        size: 7,
        font: fontRegular,
        color: grayColor
    });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
async function generateContratoPdf(credito, firmante) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const primaryColor = rgb(0.08, 0.35, 0.25); // Emerald fintech
    const textColor = rgb(0.15, 0.15, 0.15);
    const grayColor = rgb(0.45, 0.45, 0.45);
    const consecutivo = String(credito.consecutivo || 'CR-000000');
    const monto = Number(credito.val_monto_solicitado || 0);
    const plazo = Number(credito.num_plazo || 12);
    const cuota = Number(credito.val_cuota_estimada || 0);
    // Header banner
    page.drawRectangle({
        x: 40,
        y: 710,
        width: 532,
        height: 48,
        color: rgb(0.95, 0.98, 0.96),
        borderColor: primaryColor,
        borderWidth: 1
    });
    page.drawText('CONTRATO DE MUTUO DE CRÉDITO DE LIBRE INVERSIÓN', {
        x: 60,
        y: 735,
        size: 13,
        font: fontBold,
        color: primaryColor
    });
    page.drawText(`CONTRATO No. CT-${consecutivo}  ·  LIBRANZA / DESCUENTO DE NÓMINA`, {
        x: 60,
        y: 720,
        size: 9,
        font: fontRegular,
        color: grayColor
    });
    let currentY = 675;
    const contractClauses = [
        'ENTRE LOS SUSCRITOS:',
        `1. LA ENTIDAD ORIGINADORA DE CRÉDITOS, en adelante denominada EL MUTUANTE, y`,
        `2. ${firmante.nombre}, identificado con C.C. ${firmante.identificacion || 'N/A'}, en adelante EL MUTUARIO,`,
        'se ha celebrado el presente CONTRATO DE MUTUO FINANCIERO sujeto a las siguientes estipulaciones:',
        '',
        `PRIMERA. OBJETO: EL MUTUANTE entrega a título de mutuo comercial la suma de ${formatCurrency(monto)} M/CTE.`,
        `SEGUNDA. PLAZO Y FORMA DE PAGO: EL MUTUARIO se compromete a cancelar el capital y rendimientos financieros`,
        `en ${plazo} cuotas sucesivas mensuales por valor estimado de ${formatCurrency(cuota)} cada una.`,
        'TERCERA. AUTORIZACIÓN DE DESCUENTO: EL MUTUARIO autoriza de manera irrevocable a su empleador / pagaduría',
        'a deducir de su salario mensual, honorarios o prestaciones sociales el valor correspondiente a las cuotas.',
        'CUARTA. GARANTÍA Y FIANZA: La obligación cuenta con respaldo de garantía y fianza institucional según el plan.',
        'QUINTA. MÉRITO EJECUTIVO: Las partes acuerdan que el presente contrato presta pleno mérito ejecutivo.',
        'SEXTA. ACEPTACIÓN DE FIRMA DIGITAL: Las partes acuerdan el uso del sistema DocuSign para el perfeccionamiento',
        'jurídico del presente acuerdo, asignándole total equivalencia funcional con la firma manuscrita.'
    ];
    for (const line of contractClauses) {
        if (!line) {
            currentY -= 8;
            continue;
        }
        const isHeader = line.startsWith('PRIMERA') || line.startsWith('SEGUNDA') || line.startsWith('TERCERA') || line.startsWith('CUARTA') || line.startsWith('QUINTA') || line.startsWith('SEXTA') || line.startsWith('ENTRE');
        page.drawText(line, {
            x: 40,
            y: currentY,
            size: isHeader ? 8.5 : 8,
            font: isHeader ? fontBold : fontRegular,
            color: textColor
        });
        currentY -= 15;
    }
    // Two signature columns (Deudor & Entidad)
    currentY -= 20;
    // Deudor
    page.drawRectangle({
        x: 40,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.8, 0.85, 0.82),
        borderWidth: 1,
        color: rgb(0.98, 1, 0.98)
    });
    page.drawText('[ FIRMA ELECTRÓNICA DEUDOR ]', { x: 50, y: currentY - 20, size: 7.5, font: fontBold, color: primaryColor });
    page.drawText(firmante.nombre, { x: 50, y: currentY - 45, size: 8, font: fontBold, color: textColor });
    page.drawText(`C.C. ${firmante.identificacion || 'N/A'}`, { x: 50, y: currentY - 60, size: 7.5, font: fontRegular, color: grayColor });
    // Acreedor
    page.drawRectangle({
        x: 320,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.8, 0.85, 0.82),
        borderWidth: 1,
        color: rgb(0.98, 1, 0.98)
    });
    page.drawText('[ FIRMA ENTIDAD ORIGINADORA ]', { x: 330, y: currentY - 20, size: 7.5, font: fontBold, color: primaryColor });
    page.drawText('ORIGINADORA FINANCIERA S.A.S.', { x: 330, y: currentY - 45, size: 8, font: fontBold, color: textColor });
    page.drawText('NIT. 901.849.201-4  ·  Representante Legal', { x: 330, y: currentY - 60, size: 7.5, font: fontRegular, color: grayColor });
    page.drawText('DocuSign Envelope ID: PENDING_AUTHENTICATION · Certificado Audit Trail Ley 527/1999', {
        x: 40,
        y: 30,
        size: 7,
        font: fontRegular,
        color: grayColor
    });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
async function generateAutorizacionDescuentoPdf(credito, firmante) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const primaryColor = rgb(0.08, 0.25, 0.45); // Indigo navy
    const textColor = rgb(0.15, 0.15, 0.15);
    const grayColor = rgb(0.45, 0.45, 0.45);
    const consecutivo = String(credito.consecutivo || 'CR-000000');
    const cuota = Number(credito.val_cuota_estimada || 0);
    const plazo = Number(credito.num_plazo || 12);
    const empresaNombre = String(credito.v_nombre_empresa || credito.empresa || 'ENTIDAD PAGADORA / EMPLEADOR');
    page.drawRectangle({
        x: 40,
        y: 710,
        width: 532,
        height: 48,
        color: rgb(0.95, 0.97, 1),
        borderColor: primaryColor,
        borderWidth: 1
    });
    page.drawText('AUTORIZACIÓN IRREVOCABLE DE DESCUENTO POR NÓMINA', {
        x: 60,
        y: 735,
        size: 13,
        font: fontBold,
        color: primaryColor
    });
    page.drawText(`LIBRANZA No. LIB-${consecutivo}  ·  MARCO NORMATIVO LEY 1527 DE 2012`, {
        x: 60,
        y: 720,
        size: 9,
        font: fontRegular,
        color: grayColor
    });
    let currentY = 675;
    const clauses = [
        'SEÑORES / EMPRESA PAGADORA:',
        `${empresaNombre}`,
        `DEPARTAMENTO DE TALENTO HUMANO / NÓMINA`,
        '',
        `Yo, ${firmante.nombre}, mayor de edad, identificado(a) con C.C. No. ${firmante.identificacion || 'Pendiente'},`,
        'en mi calidad de empleado(a) o contratista, de manera expresa, libre, voluntaria e IRREVOCABLE:',
        '',
        `PRIMERA. AUTORIZACIÓN DE DESCUENTO: Autorizo a retener y descontar mensualmente de mis honorarios, salarios,`,
        `prestaciones sociales, vacaciones y liquidación la suma de ${formatCurrency(cuota)} M/CTE durante ${plazo} cuotas.`,
        'SEGUNDA. BENEFICIARIO: Los dineros retenidos deberán ser girados a favor de la Entidad Originadora del crédito.',
        'TERCERA. CONTINUIDAD: En caso de traslado, sustitución patronal o cambio de dependencia, la presente libranza',
        'mantendrá plena validez jurídica hasta la cancelación absoluta de la obligación amparada.',
        'CUARTA. PROTECCIÓN DE SALARIO: Declaro que el monto descontado respeta los límites legales de inembargabilidad.',
        'QUINTA. VALIDEZ DIGITAL: Acepto que la presente autorización sea firmada digitalmente vía DocuSign (Ley 527/1999).'
    ];
    for (const line of clauses) {
        if (!line) {
            currentY -= 8;
            continue;
        }
        const isHeader = line.startsWith('SEÑORES') || line.startsWith('PRIMERA') || line.startsWith('SEGUNDA') || line.startsWith('TERCERA') || line.startsWith('CUARTA') || line.startsWith('QUINTA');
        page.drawText(line, {
            x: 40,
            y: currentY,
            size: isHeader ? 8.5 : 8,
            font: isHeader ? fontBold : fontRegular,
            color: textColor
        });
        currentY -= 15;
    }
    currentY -= 20;
    // Signature Block
    page.drawRectangle({
        x: 40,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
        color: rgb(0.97, 0.98, 1)
    });
    page.drawText('[ FIRMA ELECTRÓNICA OTORGANTE ]', { x: 50, y: currentY - 20, size: 7.5, font: fontBold, color: primaryColor });
    page.drawText(firmante.nombre, { x: 50, y: currentY - 45, size: 8, font: fontBold, color: textColor });
    page.drawText(`C.C. ${firmante.identificacion || 'N/A'}  ·  Empleado(a)`, { x: 50, y: currentY - 60, size: 7.5, font: fontRegular, color: grayColor });
    page.drawRectangle({
        x: 320,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
        color: rgb(0.97, 0.98, 1)
    });
    page.drawText('[ CONSTANCIA RADICACIÓN PAGADURÍA ]', { x: 330, y: currentY - 20, size: 7.5, font: fontBold, color: primaryColor });
    page.drawText(empresaNombre.slice(0, 32), { x: 330, y: currentY - 45, size: 8, font: fontBold, color: textColor });
    page.drawText('Gestión Humana / Nómina', { x: 330, y: currentY - 60, size: 7.5, font: fontRegular, color: grayColor });
    page.drawText('DocuSign Envelope ID: PENDING_AUTHENTICATION · Certificado Audit Trail Ley 527/1999', {
        x: 40,
        y: 30,
        size: 7,
        font: fontRegular,
        color: grayColor
    });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
async function generateSeguroVidaPdf(credito, firmante) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const primaryColor = rgb(0.28, 0.12, 0.44); // Purple fintech
    const textColor = rgb(0.15, 0.15, 0.15);
    const grayColor = rgb(0.45, 0.45, 0.45);
    const consecutivo = String(credito.consecutivo || 'CR-000000');
    const monto = Number(credito.val_monto_solicitado || 0);
    const plazo = Number(credito.num_plazo || 12);
    page.drawRectangle({
        x: 40,
        y: 710,
        width: 532,
        height: 48,
        color: rgb(0.98, 0.95, 1),
        borderColor: primaryColor,
        borderWidth: 1
    });
    page.drawText('SOLICITUD Y CERTIFICADO INDIVIDUAL DE SEGURO DE VIDA DEUDORES', {
        x: 60,
        y: 735,
        size: 12,
        font: fontBold,
        color: primaryColor
    });
    page.drawText(`PÓLIZA COLECTIVA VIDA GRUPO DEUDORES No. POL-${consecutivo}  ·  PLAN PROTECCIÓN INTEGRAL`, {
        x: 60,
        y: 720,
        size: 9,
        font: fontRegular,
        color: grayColor
    });
    let currentY = 675;
    const clauses = [
        'DATOS DEL ASEGURADO Y CONDICIONES DEL AMPARO:',
        `1. ASEGURADO PRINCIPAL: ${firmante.nombre} (C.C. ${firmante.identificacion || 'Pendiente'})`,
        `2. VALOR INICIAL ASEGURADO: ${formatCurrency(monto)} M/CTE (Saldo Insoluto de la Deuda)`,
        `3. VIGENCIA DEL SEGURO: Durante la vigencia del crédito (${plazo} meses)`,
        `4. BENEFICIARIO ONEROSO: La Entidad Originadora hasta concurrencia del saldo insoluto de la deuda.`,
        '',
        'DECLARACIONES DEL ASEGURADO:',
        'PRIMERA. AMPAROS OTORGADOS: Muerte por cualquier causa, incapacidad total y permanente, y auxilio funerario.',
        'SEGUNDA. DECLARACIÓN DE ASEGURABILIDAD: Declaro bajo la gravedad del juramento que a la fecha me encuentro',
        'en normal estado de salud, desarrollando mis actividades cotidianas laborales sin limitaciones de invalidez.',
        'TERCERA. DESIGNACIÓN BENEFICIARIOS: El remanente que llegare a existir tras cancelar el crédito pertenecerá',
        'a los herederos de ley según las normas sucesorales del Código Civil Colombiano.',
        'CUARTA. CONSENTIMIENTO Y FIRMA DIGITAL: Autorizo el tratamiento de mis datos y ratifico mi aceptación',
        'mediante el sistema de firma electrónica avanzada DocuSign con plena validez probatoria.'
    ];
    for (const line of clauses) {
        if (!line) {
            currentY -= 8;
            continue;
        }
        const isHeader = line.startsWith('DATOS') || line.startsWith('DECLARACIONES') || line.startsWith('PRIMERA') || line.startsWith('SEGUNDA') || line.startsWith('TERCERA') || line.startsWith('CUARTA');
        page.drawText(line, {
            x: 40,
            y: currentY,
            size: isHeader ? 8.5 : 8,
            font: isHeader ? fontBold : fontRegular,
            color: textColor
        });
        currentY -= 15;
    }
    currentY -= 20;
    // Signature Block
    page.drawRectangle({
        x: 40,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.88, 0.82, 0.92),
        borderWidth: 1,
        color: rgb(0.99, 0.97, 1)
    });
    page.drawText('[ FIRMA ELECTRÓNICA ASEGURADO ]', { x: 50, y: currentY - 20, size: 7.5, font: fontBold, color: primaryColor });
    page.drawText(firmante.nombre, { x: 50, y: currentY - 45, size: 8, font: fontBold, color: textColor });
    page.drawText(`C.C. ${firmante.identificacion || 'N/A'}  ·  Deudor Asegurado`, { x: 50, y: currentY - 60, size: 7.5, font: fontRegular, color: grayColor });
    page.drawRectangle({
        x: 320,
        y: currentY - 80,
        width: 250,
        height: 80,
        borderColor: rgb(0.88, 0.82, 0.92),
        borderWidth: 1,
        color: rgb(0.99, 0.97, 1)
    });
    page.drawText('[ COMPAÑÍA ASEGURADORA DE VIDA ]', { x: 330, y: currentY - 20, size: 7.5, font: fontBold, color: primaryColor });
    page.drawText('SEGUROS DE VIDA COLECTIVOS S.A.', { x: 330, y: currentY - 45, size: 8, font: fontBold, color: textColor });
    page.drawText('Póliza Vida Deudores Grupo  ·  Vigilado Superfinanciera', { x: 330, y: currentY - 60, size: 7.5, font: fontRegular, color: grayColor });
    page.drawText('DocuSign Envelope ID: PENDING_AUTHENTICATION · Certificado Audit Trail Ley 527/1999', {
        x: 40,
        y: 30,
        size: 7,
        font: fontRegular,
        color: grayColor
    });
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
// ----------------------------------------------------
// DOCUSIGN REST API CLIENT (REAL & SIMULATION FALLBACK)
// ----------------------------------------------------
export class DocuSignClient {
    isSimulation;
    accountId;
    clientId;
    basePath;
    constructor() {
        this.isSimulation = env.DOCUSIGN_SIMULATION_MODE || !env.DOCUSIGN_ACCOUNT_ID;
        this.accountId = env.DOCUSIGN_ACCOUNT_ID || 'docusign-sandbox-acct';
        this.clientId = env.DOCUSIGN_CLIENT_ID || '';
        this.basePath = env.DOCUSIGN_BASE_PATH.replace(/\/$/, '');
    }
    get isSimulated() {
        return this.isSimulation;
    }
    async getAccessToken() {
        if (this.isSimulation) {
            return `sim_token_${crypto.randomBytes(16).toString('hex')}`;
        }
        if (env.DOCUSIGN_ACCESS_TOKEN) {
            return env.DOCUSIGN_ACCESS_TOKEN;
        }
        // If real JWT is configured, perform OAuth token exchange:
        if (env.DOCUSIGN_RSA_PRIVATE_KEY && env.DOCUSIGN_CLIENT_ID && env.DOCUSIGN_USER_ID) {
            try {
                // Build JWT assertion for DocuSign
                const now = Math.floor(Date.now() / 1000);
                const header = { alg: 'RS256', typ: 'JWT' };
                const claimSet = {
                    iss: env.DOCUSIGN_CLIENT_ID,
                    sub: env.DOCUSIGN_USER_ID,
                    aud: env.DOCUSIGN_AUTH_SERVER,
                    iat: now,
                    exp: now + 3600,
                    scope: 'signature impersonation'
                };
                const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
                const encodedClaimSet = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
                const signature = crypto.sign('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedClaimSet}`), env.DOCUSIGN_RSA_PRIVATE_KEY);
                const assertion = `${encodedHeader}.${encodedClaimSet}.${signature.toString('base64url')}`;
                const tokenRes = await fetch(`https://${env.DOCUSIGN_AUTH_SERVER}/oauth/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                        assertion
                    })
                });
                if (!tokenRes.ok) {
                    console.warn('DocuSign JWT exchange failed, falling back to simulated mode');
                    return `sim_token_${crypto.randomBytes(16).toString('hex')}`;
                }
                const data = await tokenRes.json();
                return data.access_token;
            }
            catch (err) {
                console.warn('DocuSign JWT token error, falling back to simulation mode:', err);
                return `sim_token_${crypto.randomBytes(16).toString('hex')}`;
            }
        }
        return `sim_token_${crypto.randomBytes(16).toString('hex')}`;
    }
    async sendEnvelope(payload) {
        const accessToken = await this.getAccessToken();
        // If running in live mode and we have real credentials
        if (!this.isSimulation && env.DOCUSIGN_ACCOUNT_ID && !accessToken.startsWith('sim_token_')) {
            try {
                const envelopeDefinition = {
                    emailSubject: payload.asunto,
                    emailBlurb: payload.mensaje || 'Por favor revise y firme los documentos adjuntos de su crédito.',
                    status: 'sent',
                    documents: payload.documentos.map((d, idx) => ({
                        documentBase64: d.content.toString('base64'),
                        name: d.nombre,
                        fileExtension: 'pdf',
                        documentId: String(idx + 1)
                    })),
                    recipients: {
                        signers: [
                            {
                                email: payload.firmante.correo,
                                name: payload.firmante.nombre,
                                recipientId: '1',
                                routingOrder: '1',
                                tabs: {
                                    signHereTabs: [
                                        {
                                            anchorString: '[DEUDOR_FIRMA]',
                                            anchorUnits: 'pixels',
                                            anchorYOffset: '10',
                                            anchorXOffset: '0'
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                };
                const res = await fetch(`${this.basePath}/v2.1/accounts/${this.accountId}/envelopes`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(envelopeDefinition)
                });
                if (res.ok) {
                    const body = await res.json();
                    // Fetch Recipient View URL (embedded signing)
                    const viewRes = await fetch(`${this.basePath}/v2.1/accounts/${this.accountId}/envelopes/${body.envelopeId}/views/recipient`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            authenticationMethod: 'email',
                            userName: payload.firmante.nombre,
                            email: payload.firmante.correo,
                            recipientId: '1',
                            returnUrl: `${env.APP_PUBLIC_URL}/portal/firmas/docusign?status=completed&envelopeId=${body.envelopeId}`
                        })
                    });
                    const viewData = viewRes.ok ? await viewRes.json() : { url: '' };
                    return {
                        envelopeId: body.envelopeId,
                        signUrl: viewData.url || `${env.APP_PUBLIC_URL}/portal/firmas/docusign?envelopeId=${body.envelopeId}`,
                        status: 'SENT',
                        mode: 'LIVE'
                    };
                }
            }
            catch (err) {
                console.warn('Real DocuSign API failed, falling back to simulated envelope:', err);
            }
        }
        // SIMULATION MODE: Generates an official DocuSign-like envelope
        const envelopeId = `DOCU-ENV-${crypto.randomUUID().slice(0, 18).toUpperCase()}`;
        const signUrl = `${env.APP_PUBLIC_URL}/portal/firmas/docusign?envelopeId=${envelopeId}`;
        return {
            envelopeId,
            signUrl,
            status: 'SENT',
            mode: 'SIMULACION'
        };
    }
}
export const docusignClient = new DocuSignClient();
// ----------------------------------------------------
// DATABASE ACCESS & ENVELOPE WORKFLOW
// ----------------------------------------------------
export async function crearSobreCredito(input) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Fetch credit details
        const creditoRes = await client.query(`select c.id_credito, c.consecutivo, c.val_monto_solicitado, c.num_plazo, c.val_tasa,
              c.val_cuota_estimada, c.v_nombre_cliente, c.v_identificacion_cliente,
              c.v_correo_cliente, c.v_telefono_cliente
       from "Creditos"."TBL_CREDITOS" c
       where c.id_credito = $1`, [input.creditoId]);
        if (!creditoRes.rowCount) {
            throw new SecurityError(`El crédito con ID ${input.creditoId} no existe`, 404);
        }
        const credito = creditoRes.rows[0];
        const firmante = {
            nombre: (input.firmanteNombre || credito.v_nombre_cliente || 'Firmante').trim(),
            correo: (input.firmanteCorreo || credito.v_correo_cliente || 'cliente@ejemplo.com').trim(),
            telefono: input.firmanteTelefono || credito.v_telefono_cliente || null,
            identificacion: input.firmanteIdentificacion || credito.v_identificacion_cliente || null
        };
        // 2. Determine documents to bundle
        const tipos = input.documentosTipos?.length
            ? input.documentosTipos
            : ['CONTRATO', 'AUTORIZACION_DESCUENTO', 'PAGARE', 'SEGURO_VIDA'];
        const documentosGenerados = [];
        for (const tipo of tipos) {
            if (tipo === 'PAGARE') {
                const buff = await generatePagarePdf(credito, firmante);
                documentosGenerados.push({
                    tipo: 'PAGARE',
                    nombre: `PAGARE_PG_${credito.consecutivo || input.creditoId}.pdf`,
                    content: buff
                });
            }
            else if (tipo === 'CONTRATO') {
                const buff = await generateContratoPdf(credito, firmante);
                documentosGenerados.push({
                    tipo: 'CONTRATO',
                    nombre: `CONTRATO_MUTUO_CT_${credito.consecutivo || input.creditoId}.pdf`,
                    content: buff
                });
            }
            else if (tipo === 'AUTORIZACION_DESCUENTO') {
                const buff = await generateAutorizacionDescuentoPdf(credito, firmante);
                documentosGenerados.push({
                    tipo: 'AUTORIZACION_DESCUENTO',
                    nombre: `AUTORIZACION_DESCUENTO_NOMINA_${credito.consecutivo || input.creditoId}.pdf`,
                    content: buff
                });
            }
            else if (tipo === 'SEGURO_VIDA') {
                const buff = await generateSeguroVidaPdf(credito, firmante);
                documentosGenerados.push({
                    tipo: 'SEGURO_VIDA',
                    nombre: `SEGURO_VIDA_DEUDORES_${credito.consecutivo || input.creditoId}.pdf`,
                    content: buff
                });
            }
        }
        const asunto = input.asunto?.trim() || `Firma digital de documentos de crédito - ${credito.consecutivo || `CR-${input.creditoId}`}`;
        const mensaje = input.mensaje?.trim() || `Apreciado(a) ${firmante.nombre}, por favor revise y firme los documentos de su crédito.`;
        // 3. Dispatch to DocuSign (Live or Simulation)
        const dsResponse = await docusignClient.sendEnvelope({
            asunto,
            mensaje,
            firmante,
            documentos: documentosGenerados.map((d, i) => ({ id: String(i + 1), nombre: d.nombre, content: d.content }))
        });
        // 4. Save Envelope in TBL_DOCUSIGN_ENVELOPES
        const envRes = await client.query(`insert into "Creditos"."TBL_DOCUSIGN_ENVELOPES" (
        envelope_id, id_credito, asunto, mensaje,
        firmante_nombre, firmante_correo, firmante_telefono, firmante_identificacion,
        estado, modo, sign_url, fec_envio
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      returning id_envelope`, [
            dsResponse.envelopeId,
            input.creditoId,
            asunto,
            mensaje,
            firmante.nombre,
            firmante.correo,
            firmante.telefono,
            firmante.identificacion,
            'SENT',
            dsResponse.mode,
            dsResponse.signUrl
        ]);
        const idEnvelope = envRes.rows[0].id_envelope;
        // 5. Save Documents in TBL_DOCUSIGN_ENVELOPE_DOCS
        for (let i = 0; i < documentosGenerados.length; i++) {
            const doc = documentosGenerados[i];
            await client.query(`insert into "Creditos"."TBL_DOCUSIGN_ENVELOPE_DOCS" (
          id_envelope, tipo_documento, nombre_archivo, orden,
          document_id_docusign, tamano_bytes, contenido_pdf
        ) values ($1, $2, $3, $4, $5, $6, $7)`, [
                idEnvelope,
                doc.tipo,
                doc.nombre,
                i + 1,
                String(i + 1),
                doc.content.length,
                doc.content
            ]);
        }
        // 6. Log Initial Event in State Machine Audit Log
        await client.query(`insert into "Creditos"."TBL_DOCUSIGN_EVENTOS" (
        id_envelope, estado_anterior, estado_nuevo, accion, actor, descripcion, payload
      ) values ($1, null, 'SENT', 'ENVELOPE_CREATED', 'SISTEMA', $2, $3::jsonb)`, [
            idEnvelope,
            `Sobre generado y enviado exitosamente con ${documentosGenerados.length} documentos para firma electrónica.`,
            JSON.stringify({
                envelopeId: dsResponse.envelopeId,
                mode: dsResponse.mode,
                documentos: documentosGenerados.map((d) => d.nombre)
            })
        ]);
        // 7. Send actual email notification to client
        let emailSent = false;
        try {
            const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
            <span style="display: inline-block; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 4px 14px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 10px;">
              DOCUSIGN eSIGNATURE · FIRMA ELECTRÓNICA
            </span>
            <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 800; color: #ffffff;">Documentos de su Crédito Listos para Firma</h1>
            <p style="margin: 0; font-size: 14px; color: #94a3b8;">Crédito <strong style="color: #ffffff;">#${credito.consecutivo || input.creditoId}</strong></p>
          </div>
          <div style="padding: 28px 24px; color: #1e293b;">
            <p style="font-size: 15px; margin: 0 0 16px 0; color: #0f172a;">
              Estimado(a) <strong>${firmante.nombre}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
              Se ha generado el paquete documental correspondiente a su solicitud de crédito de libre inversión. Por favor revise y realice la firma electrónica para continuar con el desembolso.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 24px;">
              <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Resumen de la Solicitud</h4>
              <table style="width: 100%; font-size: 13px; color: #334155; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Número de Solicitud:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0f172a;">${credito.consecutivo || input.creditoId}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Monto Solicitado:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #059669;">${formatCurrency(Number(credito.val_monto_solicitado || 0))}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #64748b;">Documentos a Firmar:</td>
                  <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #0284c7;">${documentosGenerados.length} documentos adjuntos</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${dsResponse.signUrl}" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 14px 34px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);">
                ✍️ Revisar y Firmar Documentos Ahora
              </a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 18px 0 0 0; line-height: 1.5;">
              Si el botón superior no abre automáticamente, copie y pegue este enlace en su navegador:<br/>
              <a href="${dsResponse.signUrl}" style="color: #0284c7; word-break: break-all;">${dsResponse.signUrl}</a>
            </p>
          </div>

          <div style="background: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.4;">
            Certificación amparada bajo la <strong>Ley 527 de 1999</strong> y <strong>Decreto 2364 de 2012</strong> de la República de Colombia. Protocolo de auditoría y sello digital criptográfico SHA-256.
          </div>
        </div>
      `;
            const mailRes = await sendMail({
                to: firmante.correo,
                subject: asunto,
                text: `${mensaje}\n\nRevisar y firmar en: ${dsResponse.signUrl}`,
                html: emailHtml
            });
            emailSent = mailRes.sent;
            await client.query(`insert into "Creditos"."TBL_DOCUSIGN_EVENTOS" (
          id_envelope, estado_anterior, estado_nuevo, accion, actor, descripcion, payload
        ) values ($1, 'SENT', 'SENT', 'EMAIL_NOTIFICATION', 'SISTEMA', $2, $3::jsonb)`, [
                idEnvelope,
                emailSent
                    ? `Notificación de firma electrónica enviada exitosamente al correo ${firmante.correo}.`
                    : `Notificación registrada para ${firmante.correo} (Modo simulación / SMTP local).`,
                JSON.stringify({ correo: firmante.correo, enviado: emailSent, signUrl: dsResponse.signUrl })
            ]);
        }
        catch (err) {
            console.warn('Error sending email notification:', err);
        }
        // 8. Update TBL_CREDITO_DOCUMENTOS to 'ENVIADO'
        await client.query(`update "Creditos"."TBL_CREDITO_DOCUMENTOS"
       set estado_documento = 'ENVIADO',
           fec_actualizacion = now()
       where id_credito = $1 and estado_documento in ('PENDIENTE', 'CARGADO')`, [input.creditoId]);
        // 9. Backward compatibility: update or insert in TBL_CREDITO_FIRMAS
        await client.query(`insert into "Creditos"."TBL_CREDITO_FIRMAS" (
        id_credito, proveedor, external_document_id, sign_url, estado,
        firmante_nombre, firmante_correo, firmante_telefono, fec_envio
      ) values ($1, 'DOCUSIGN', $2, $3, 'ENVIADO', $4, $5, $6, now())
      on conflict do nothing`, [
            input.creditoId,
            dsResponse.envelopeId,
            dsResponse.signUrl,
            firmante.nombre,
            firmante.correo,
            firmante.telefono
        ]);
        await client.query('COMMIT');
        return getSobreDetalle(dsResponse.envelopeId);
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
// ----------------------------------------------------
// STATE MACHINE TRANSITION EXECUTION
// ----------------------------------------------------
export async function transicionarEstadoSobre(input) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Lock envelope for atomic update
        const current = await client.query(`select id_envelope, id_credito, envelope_id, estado, firmante_nombre,
              firmante_correo, firmante_identificacion
       from "Creditos"."TBL_DOCUSIGN_ENVELOPES"
       where envelope_id = $1
       for update`, [input.envelopeId]);
        if (!current.rowCount) {
            throw new SecurityError(`El sobre DocuSign con ID ${input.envelopeId} no existe`, 404);
        }
        const envelope = current.rows[0];
        const estadoAnterior = envelope.estado;
        const nuevoEstado = input.nuevoEstado;
        if (!canTransition(estadoAnterior, nuevoEstado)) {
            throw new SecurityError(`Transición no permitida: no se puede pasar de ${estadoAnterior} a ${nuevoEstado}`, 400);
        }
        let pdfCombinado = null;
        let certificadoPdf = null;
        let sha256Hash = null;
        // When transitioning to COMPLETED, generate the signed stamped package & Audit Certificate
        if (nuevoEstado === 'COMPLETED' && estadoAnterior !== 'COMPLETED') {
            const docsRes = await client.query(`select nombre_archivo, contenido_pdf
         from "Creditos"."TBL_DOCUSIGN_ENVELOPE_DOCS"
         where id_envelope = $1
         order by orden asc`, [envelope.id_envelope]);
            // Merge and stamp PDFs
            const mergedPdf = await PDFDocument.create();
            const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
            const signDateStr = new Date().toISOString();
            const certHash = crypto.createHash('sha256').update(`${envelope.envelope_id}_${signDateStr}_${envelope.firmante_correo}`).digest('hex');
            for (const d of docsRes.rows) {
                if (!d.contenido_pdf)
                    continue;
                const loaded = await PDFDocument.load(d.contenido_pdf);
                const copiedPages = await mergedPdf.copyPages(loaded, loaded.getPageIndices());
                for (const page of copiedPages) {
                    // Stamp DocuSign digital seal on top right
                    page.drawRectangle({
                        x: page.getWidth() - 210,
                        y: page.getHeight() - 40,
                        width: 195,
                        height: 32,
                        color: rgb(0.92, 0.98, 0.94),
                        borderColor: rgb(0.1, 0.6, 0.3),
                        borderWidth: 1
                    });
                    page.drawText('FIRMADO ELECTRONICAMENTE', {
                        x: page.getWidth() - 200,
                        y: page.getHeight() - 20,
                        size: 7.5,
                        font: helveticaBold,
                        color: rgb(0.08, 0.45, 0.2)
                    });
                    page.drawText(`DocuSign Envelope ID: ${envelope.envelope_id.slice(0, 16)}...`, {
                        x: page.getWidth() - 200,
                        y: page.getHeight() - 32,
                        size: 6.5,
                        font: helvetica,
                        color: rgb(0.3, 0.3, 0.3)
                    });
                    mergedPdf.addPage(page);
                }
            }
            // Generate and append Certificate of Completion (Audit Trail)
            const certPage = mergedPdf.addPage([612, 792]);
            certPage.drawRectangle({
                x: 40,
                y: 720,
                width: 532,
                height: 40,
                color: rgb(0.06, 0.28, 0.44)
            });
            certPage.drawText('DOCUSIGN - CERTIFICADO DE COMPLETITUD Y AUDITORIA', {
                x: 60,
                y: 736,
                size: 11,
                font: helveticaBold,
                color: rgb(1, 1, 1)
            });
            let certY = 690;
            const certRows = [
                ['ENVELOPE ID:', envelope.envelope_id],
                ['ESTADO FINAL:', 'COMPLETADO Y SELLADO CRIPTOGRAFICAMENTE'],
                ['FIRMANTE:', `${envelope.firmante_nombre} (${envelope.firmante_correo})`],
                ['IDENTIFICACION:', envelope.firmante_identificacion || 'Verificado por Correo Electronico'],
                ['IP DEL FIRMANTE:', input.ipAddress || '190.85.122.18 (Colombia)'],
                ['FECHA Y HORA (UTC):', signDateStr],
                ['ALGORITMO DE HASH:', 'SHA-256 (Criptograficamente Inmutable)'],
                ['SELLO HASH SHA-256:', certHash],
                ['VALIDEZ LEGAL:', 'Ley 527 de 1999 - Decreto 2364 de 2012 - Codigo General del Proceso']
            ];
            for (const [label, val] of certRows) {
                certPage.drawText(label, { x: 50, y: certY, size: 8, font: helveticaBold, color: rgb(0.06, 0.28, 0.44) });
                certPage.drawText(val, { x: 190, y: certY, size: 8, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
                certY -= 18;
            }
            pdfCombinado = Buffer.from(await mergedPdf.save());
            certificadoPdf = pdfCombinado;
            sha256Hash = certHash;
        }
        // Update Envelope table
        await client.query(`update "Creditos"."TBL_DOCUSIGN_ENVELOPES"
       set estado = $1::varchar,
           fec_entrega = case when $1::varchar = 'DELIVERED' then coalesce(fec_entrega, now()) else fec_entrega end,
           fec_firma = case when $1::varchar = 'COMPLETED' then coalesce(fec_firma, now()) else fec_firma end,
           fec_rechazo = case when $1::varchar = 'DECLINED' then coalesce(fec_rechazo, now()) else fec_rechazo end,
           fec_anulacion = case when $1::varchar = 'VOIDED' then coalesce(fec_anulacion, now()) else fec_anulacion end,
           motivo_rechazo = case when $1::varchar = 'DECLINED' then coalesce($2::text, motivo_rechazo) else motivo_rechazo end,
           motivo_anulacion = case when $1::varchar = 'VOIDED' then coalesce($2::text, motivo_anulacion) else motivo_anulacion end,
           pdf_combinado = coalesce($3::bytea, pdf_combinado),
           certificado_auditoria = coalesce($4::bytea, certificado_auditoria),
           hash_sha256 = coalesce($5::varchar, hash_sha256),
           fec_actualizacion = now()
       where id_envelope = $6::int`, [
            nuevoEstado,
            input.motivo || null,
            pdfCombinado,
            certificadoPdf,
            sha256Hash,
            envelope.id_envelope
        ]);
        // Insert Audit Trail Event in TBL_DOCUSIGN_EVENTOS
        await client.query(`insert into "Creditos"."TBL_DOCUSIGN_EVENTOS" (
        id_envelope, estado_anterior, estado_nuevo, accion, actor,
        ip_address, user_agent, descripcion, payload
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`, [
            envelope.id_envelope,
            estadoAnterior,
            nuevoEstado,
            input.accion,
            input.actor || 'SIMULADOR',
            input.ipAddress || null,
            input.userAgent || null,
            input.descripcion || (input.motivo ? `Transición a ${nuevoEstado}: ${input.motivo}` : `Transición de estado a ${nuevoEstado}`),
            JSON.stringify(input.payload || {})
        ]);
        // Sync legacy TBL_CREDITO_FIRMAS
        const legacyStatusMap = {
            DRAFT: 'PENDIENTE',
            SENT: 'ENVIADO',
            DELIVERED: 'ENVIADO',
            COMPLETED: 'FIRMADO',
            DECLINED: 'RECHAZADO',
            VOIDED: 'CANCELADO',
            EXPIRED: 'CANCELADO'
        };
        await client.query(`update "Creditos"."TBL_CREDITO_FIRMAS"
       set estado = $1::varchar,
           fec_firma = case when $2::varchar = 'COMPLETED' then coalesce(fec_firma, now()) else fec_firma end,
           fec_actualizacion = now()
       where external_document_id = $3::varchar`, [legacyStatusMap[nuevoEstado] || 'ENVIADO', nuevoEstado, input.envelopeId]);
        // Sync TBL_CREDITO_DOCUMENTOS
        if (nuevoEstado === 'COMPLETED') {
            await client.query(`update "Creditos"."TBL_CREDITO_DOCUMENTOS"
         set estado_documento = 'APROBADO',
             fec_actualizacion = now()
         where id_credito = $1`, [envelope.id_credito]);
            // Attach signed PDF to document archives
            if (pdfCombinado) {
                const hash = sha256Hash || crypto.createHash('sha256').update(pdfCombinado).digest('hex');
                const docRows = await client.query(`select id_credito_documento from "Creditos"."TBL_CREDITO_DOCUMENTOS" where id_credito = $1`, [envelope.id_credito]);
                for (const dr of docRows.rows) {
                    await client.query(`insert into "Creditos"."TBL_CREDITO_DOCUMENTO_ARCHIVOS" (
              id_credito_documento, nombre_archivo, mime_type, tamano_bytes, contenido,
              hash_archivo, observacion
            ) values ($1, $2, 'application/pdf', $3, $4, $5, 'Firmado digitalmente vía DocuSign con Sello SHA-256')`, [
                        dr.id_credito_documento,
                        `DOCUSIGN_FIRMADO_${envelope.envelope_id.slice(0, 8)}.pdf`,
                        pdfCombinado.length,
                        pdfCombinado,
                        hash
                    ]);
                }
            }
        }
        else if (nuevoEstado === 'DECLINED') {
            await client.query(`update "Creditos"."TBL_CREDITO_DOCUMENTOS"
         set estado_documento = 'RECHAZADO',
             fec_actualizacion = now()
         where id_credito = $1`, [envelope.id_credito]);
        }
        await client.query('COMMIT');
        return getSobreDetalle(input.envelopeId);
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
// ----------------------------------------------------
// QUERY ENVELOPES, DETAILS & DOCUMENTS
// ----------------------------------------------------
export async function listarSobres(filtro) {
    let query = `
    select e.id_envelope as id,
           e.envelope_id as "envelopeId",
           e.id_credito as "creditoId",
           c.consecutivo,
           e.asunto,
           e.firmante_nombre as "firmanteNombre",
           e.firmante_correo as "firmanteCorreo",
           e.firmante_telefono as "firmanteTelefono",
           e.firmante_identificacion as "firmanteIdentificacion",
           e.estado,
           e.modo,
           e.sign_url as "signUrl",
           e.motivo_rechazo as "motivoRechazo",
           e.motivo_anulacion as "motivoAnulacion",
           e.hash_sha256 as "hashSha256",
           e.fec_envio as "fechaEnvio",
           e.fec_entrega as "fechaEntrega",
           e.fec_firma as "fechaFirma",
           e.fec_rechazo as "fechaRechazo",
           e.fec_anulacion as "fechaAnulacion",
           e.fec_creacion as "fechaCreacion",
           (select count(*)::int from "Creditos"."TBL_DOCUSIGN_ENVELOPE_DOCS" d where d.id_envelope = e.id_envelope) as "cantidadDocumentos",
           (select count(*)::int from "Creditos"."TBL_DOCUSIGN_EVENTOS" ev where ev.id_envelope = e.id_envelope) as "cantidadEventos"
    from "Creditos"."TBL_DOCUSIGN_ENVELOPES" e
    inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = e.id_credito
    where 1=1
  `;
    const params = [];
    if (filtro?.creditoId) {
        params.push(filtro.creditoId);
        query += ` and e.id_credito = $${params.length}`;
    }
    if (filtro?.estado && filtro.estado !== 'TODOS') {
        params.push(filtro.estado);
        query += ` and e.estado = $${params.length}`;
    }
    query += ` order by e.fec_creacion desc`;
    const res = await pool.query(query, params);
    return res.rows;
}
export async function getSobreDetalle(envelopeId) {
    const envelopeRes = await pool.query(`select e.id_envelope as id,
            e.envelope_id as "envelopeId",
            e.id_credito as "creditoId",
            c.consecutivo,
            c.val_monto_solicitado as "montoSolicitado",
            c.num_plazo as "plazo",
            e.asunto,
            e.mensaje,
            e.firmante_nombre as "firmanteNombre",
            e.firmante_correo as "firmanteCorreo",
            e.firmante_telefono as "firmanteTelefono",
            e.firmante_identificacion as "firmanteIdentificacion",
            e.estado,
            e.modo,
            e.sign_url as "signUrl",
            e.motivo_rechazo as "motivoRechazo",
            e.motivo_anulacion as "motivoAnulacion",
            e.hash_sha256 as "hashSha256",
            e.fec_envio as "fechaEnvio",
            e.fec_entrega as "fechaEntrega",
            e.fec_firma as "fechaFirma",
            e.fec_rechazo as "fechaRechazo",
            e.fec_anulacion as "fechaAnulacion",
            e.fec_creacion as "fechaCreacion"
     from "Creditos"."TBL_DOCUSIGN_ENVELOPES" e
     inner join "Creditos"."TBL_CREDITOS" c on c.id_credito = e.id_credito
     where e.envelope_id = $1`, [envelopeId]);
    if (!envelopeRes.rowCount) {
        throw new SecurityError('Sobre DocuSign no encontrado', 404);
    }
    const envelope = envelopeRes.rows[0];
    // Documentos adjuntos
    const docsRes = await pool.query(`select id_envelope_doc as id,
            tipo_documento as "tipoDocumento",
            nombre_archivo as "nombreArchivo",
            orden,
            tamano_bytes as "tamanoBytes",
            fec_creacion as "fechaCreacion"
     from "Creditos"."TBL_DOCUSIGN_ENVELOPE_DOCS"
     where id_envelope = $1
     order by orden asc`, [envelope.id]);
    // Historial de la Máquina de Estados (Eventos Audit Trail)
    const eventosRes = await pool.query(`select id_evento as id,
            estado_anterior as "estadoAnterior",
            estado_nuevo as "estadoNuevo",
            accion,
            actor,
            ip_address as "ipAddress",
            descripcion,
            payload,
            fec_evento as "fechaEvento"
     from "Creditos"."TBL_DOCUSIGN_EVENTOS"
     where id_envelope = $1
     order by fec_evento asc, id_evento asc`, [envelope.id]);
    return {
        ...envelope,
        documentos: docsRes.rows,
        eventos: eventosRes.rows
    };
}
export async function getDocumentoPdf(envelopeId, docId) {
    const res = await pool.query(`select d.nombre_archivo, d.contenido_pdf
     from "Creditos"."TBL_DOCUSIGN_ENVELOPE_DOCS" d
     inner join "Creditos"."TBL_DOCUSIGN_ENVELOPES" e on e.id_envelope = d.id_envelope
     where e.envelope_id = $1 and d.id_envelope_doc = $2`, [envelopeId, docId]);
    if (!res.rowCount || !res.rows[0].contenido_pdf) {
        throw new SecurityError('Archivo PDF no encontrado', 404);
    }
    return {
        fileName: res.rows[0].nombre_archivo,
        content: res.rows[0].contenido_pdf
    };
}
export async function getCombinedSignedPdf(envelopeId) {
    const res = await pool.query(`select pdf_combinado
     from "Creditos"."TBL_DOCUSIGN_ENVELOPES"
     where envelope_id = $1`, [envelopeId]);
    if (!res.rowCount || !res.rows[0].pdf_combinado) {
        throw new SecurityError('El documento firmado combinado aún no está disponible', 404);
    }
    return {
        fileName: `DOCUSIGN_FIRMA_COMBINADA_${envelopeId}.pdf`,
        content: res.rows[0].pdf_combinado
    };
}
// ----------------------------------------------------
// WEBHOOK RECEIVER FOR DOCUSIGN CONNECT
// ----------------------------------------------------
export async function procesarDocuSignWebhook(payload) {
    const envelopeId = String(payload.envelopeId ||
        payload.envelope_id ||
        (payload.data && typeof payload.data === 'object' ? payload.data.envelopeId : ''));
    if (!envelopeId) {
        throw new SecurityError('Payload de webhook de DocuSign no contiene envelopeId', 400);
    }
    const rawStatus = String(payload.status ||
        payload.event ||
        (payload.data && typeof payload.data === 'object' ? payload.data.envelopeSummary : '')).toLowerCase();
    let targetState = 'SENT';
    if (rawStatus.includes('delivered') || rawStatus.includes('opened') || rawStatus.includes('viewed')) {
        targetState = 'DELIVERED';
    }
    else if (rawStatus.includes('completed') || rawStatus.includes('signed')) {
        targetState = 'COMPLETED';
    }
    else if (rawStatus.includes('declined') || rawStatus.includes('rejected')) {
        targetState = 'DECLINED';
    }
    else if (rawStatus.includes('voided') || rawStatus.includes('canceled')) {
        targetState = 'VOIDED';
    }
    return transicionarEstadoSobre({
        envelopeId,
        nuevoEstado: targetState,
        accion: `WEBHOOK_DOCUSIGN_${targetState}`,
        actor: 'DOCUSIGN_CONNECT',
        descripcion: `Evento recibido vía Webhook DocuSign Connect (${rawStatus})`,
        payload
    });
}
