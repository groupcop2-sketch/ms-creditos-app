import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
export function isMailConfigured() {
    return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
export async function sendMail(input) {
    if (!isMailConfigured()) {
        return { sent: false };
    }
    const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 8000,
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
        }
    });
    const sendPromise = transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text
    });
    try {
        await Promise.race([
            sendPromise,
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('SMTP timeout')), 9000);
            })
        ]);
    }
    finally {
        transporter.close();
    }
    return { sent: true };
}
