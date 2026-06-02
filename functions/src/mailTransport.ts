import * as functions from "firebase-functions/v1";
import nodemailer from "nodemailer";

export interface MailConfig {
    user: string;
    pass: string;
    from: string;
}

/** Lee credenciales Gmail desde Firebase config o variables de entorno (emulador). */
export function getMailConfig(): MailConfig | null {
    const cfg = (functions.config().gmail || {}) as Record<string, string>;
    const user = String(process.env.GMAIL_USER || cfg.user || "").trim();
    // Gmail App Passwords: quitar espacios si se copió "abcd efgh ijkl mnop"
    const pass = String(process.env.GMAIL_PASS || cfg.pass || "")
        .trim()
        .replace(/\s+/g, "");
    const from = String(process.env.GMAIL_FROM || cfg.from || user).trim();
    if (!user || !pass) return null;
    return { user, pass, from };
}

export function formatMailError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (
        msg.includes("535") ||
        msg.includes("BadCredentials") ||
        msg.includes("Invalid login") ||
        msg.includes("EAUTH")
    ) {
        return (
            "Gmail rechazó el acceso SMTP. Cree una contraseña de aplicación en Google " +
            "y configúrela en Firebase: firebase functions:config:set gmail.user=\"cuenta@gmail.com\" " +
            'gmail.pass="xxxx xxxx xxxx xxxx" — luego firebase deploy --only functions'
        );
    }
    return msg.length > 480 ? `${msg.slice(0, 480)}…` : msg;
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(config: MailConfig): nodemailer.Transporter {
    if (!cachedTransporter) {
        cachedTransporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user: config.user, pass: config.pass },
        });
    }
    return cachedTransporter;
}

export interface AgMailAttachment {
    filename: string;
    content: Buffer;
    contentType?: string;
}

export async function sendAgMail(options: {
    to: string | string[];
    subject: string;
    html: string;
    fromName?: string;
    attachments?: AgMailAttachment[];
}): Promise<void> {
    const config = getMailConfig();
    if (!config) {
        throw new Error(
            "Correo no configurado en el servidor. Configure gmail.user y gmail.pass en Firebase Functions."
        );
    }

    const transporter = getTransporter(config);
    const fromLabel = options.fromName || "AG Sistema";
    await transporter.sendMail({
        from: `"${fromLabel}" <${config.from}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType || "application/pdf",
        })),
    });
}
