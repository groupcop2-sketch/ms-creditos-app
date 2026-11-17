import { pool } from '../../lib/db.js';
import { isMailConfigured, sendMail } from '../../lib/mailer.js';
import { getUrlPortal } from '../plataforma/plataforma.service.js';

export const TIPO_SOPORTE_LABEL: Record<string, string> = {
  CEDULA_FRENTE: 'Foto de la cédula (frente)',
  CEDULA_REVERSO: 'Foto de la cédula (reverso)',
  FOTO_ROSTRO: 'Foto del rostro (selfie)',
  CERTIFICADO_COMPRA_CARTERA: 'Certificado de compra de cartera'
};

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Aviso = {
  creditoId: number;
  /** What was rejected, e.g. "Foto de la cédula (frente)" or "la etapa Estudio de crédito". */
  que: string;
  resultado: 'RECHAZADO' | 'DEVUELTO';
  motivo: string;
  usuarioId?: number | null;
};

/**
 * Emails the client why a document or a stage of their credit was rejected/returned, and logs the
 * attempt in the credit history. Never throws: the rejection is already saved, the email is a courtesy.
 */
export async function notificarRechazoCliente(aviso: Aviso) {
  try {
    const c = await pool.query<{ consecutivo: string; v_nombre_cliente: string; v_correo_cliente: string | null }>(
      'select consecutivo, v_nombre_cliente, v_correo_cliente from "Creditos"."TBL_CREDITOS" where id_credito = $1',
      [aviso.creditoId]
    );
    const credito = c.rows[0];
    if (!credito) return { enviado: false, detalle: 'Crédito no encontrado' };
    const correo = credito.v_correo_cliente?.trim();

    let enviado = false;
    let detalle: string;
    if (!correo) detalle = 'el cliente no tiene correo registrado';
    else if (!isMailConfigured()) detalle = 'el servidor de correo (SMTP) no está configurado';
    else {
      const accion = aviso.resultado === 'DEVUELTO' ? 'devuelto para corrección' : 'rechazado';
      const nombre = credito.v_nombre_cliente.split(' ')[0] || credito.v_nombre_cliente;
      const portal = (await getUrlPortal())?.replace(/\/$/, '');
      const subject = `Crédito ${credito.consecutivo}: ${aviso.que} ${accion}`;
      const text = [
        `Hola ${nombre},`,
        '',
        `Revisamos tu solicitud de crédito ${credito.consecutivo} y ${aviso.que} fue ${accion}.`,
        '',
        `Motivo: ${aviso.motivo}`,
        '',
        portal ? `Ingresa al portal para corregirlo: ${portal}` : 'Ingresa al portal de clientes para corregirlo.',
        '',
        'Si tienes dudas, responde a este correo.'
      ].join('\n');
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f1a2a;max-width:560px">
        <p>Hola ${esc(nombre)},</p>
        <p>Revisamos tu solicitud de crédito <strong>${esc(credito.consecutivo)}</strong> y <strong>${esc(aviso.que)}</strong> fue ${accion}.</p>
        <p style="margin:16px 0;padding:12px 16px;border-left:4px solid #b42318;background:#fdecea"><strong>Motivo:</strong> ${esc(aviso.motivo)}</p>
        <p>${portal ? `Ingresa al <a href="${esc(portal)}">portal de clientes</a> para corregirlo.` : 'Ingresa al portal de clientes para corregirlo.'}</p>
        <p style="color:#5a6577">Si tienes dudas, responde a este correo.</p>
      </div>`;
      try {
        enviado = (await sendMail({ to: correo, subject, text, html })).sent;
        detalle = enviado ? `enviado a ${correo}` : 'no se pudo enviar';
      } catch (err) {
        detalle = `error al enviar: ${err instanceof Error ? err.message : 'desconocido'}`;
      }
    }

    await pool.query(
      `insert into "Creditos"."TBL_CREDITO_HISTORIAL" (id_credito, accion, observacion, id_usuario) values ($1, $2, $3, $4)`,
      [aviso.creditoId, enviado ? 'CORREO_CLIENTE_ENVIADO' : 'CORREO_CLIENTE_NO_ENVIADO', `${aviso.que} ${aviso.resultado.toLowerCase()}: ${aviso.motivo} (correo ${detalle})`, aviso.usuarioId ?? null]
    ).catch(() => undefined);
    return { enviado, detalle };
  } catch (err) {
    return { enviado: false, detalle: err instanceof Error ? err.message : 'error' };
  }
}
