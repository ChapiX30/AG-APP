import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { VACATION_RH_EMAILS, resolveRhEmailsFromDoc } from "./vacacionEmails";
import { formatMailError, getMailConfig, sendAgMail } from "./mailTransport";

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatFecha(iso: string): string {
    if (!iso) return "—";
    try {
        const d = parseISO(iso);
        return format(d, "dd 'de' MMMM yyyy", { locale: es });
    } catch {
        return iso;
    }
}

function getRhEmailsFromAlerta(data: FirebaseFirestore.DocumentData): string[] {
    const extra = Array.isArray(data.destinatarios)
        ? data.destinatarios.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
        : [];
    const fromDoc = extra.length > 0 ? extra : resolveRhEmailsFromDoc(data);
    return [...new Set([...VACATION_RH_EMAILS, ...fromDoc])];
}

/** Envía el PDF AG-ADM-F12 solo a Recursos Humanos (dos correos fijos). */
export async function sendVacationRhPdfMail(params: {
    pdfBuffer: Buffer;
    solicitudId: string;
    data: FirebaseFirestore.DocumentData;
}): Promise<{ enviados: string[]; adjunto: boolean }> {
    const emails = getRhEmailsFromAlerta({ destinatarios: VACATION_RH_EMAILS });
    if (!getMailConfig()) {
        throw new Error("Correo no configurado (gmail.user / gmail.pass)");
    }

    const nombre = String(params.data.solicitanteNombre || "Colaborador");
    const subject = `Solicitud de vacaciones — ${nombre} (AG-ADM-F12)`;
    const html = buildHtmlVacaciones({
        ...params.data,
        mensajeCorto: `Se adjunta el formato AG-ADM-F12 autorizado para ${nombre} (${params.data.diasVacaciones} día(s)).`,
    });
    const filename = `Vacaciones_${nombre.replace(/\s+/g, "_")}_AG-ADM-F12.pdf`;
    const attachments = [
        {
            filename,
            content: params.pdfBuffer,
            contentType: "application/pdf",
        },
    ];

    const enviados: string[] = [];
    for (const to of emails) {
        await sendAgMail({
            fromName: "AG Recursos Humanos",
            to,
            subject: `📋 ${subject}`,
            html,
            attachments,
        });
        enviados.push(to);
    }

    await admin
        .firestore()
        .collection("solicitudesVacaciones")
        .doc(params.solicitudId)
        .set({ correoEnviado: true, correosRhEnviados: enviados }, { merge: true });

    return { enviados, adjunto: true };
}

function buildHtmlVacaciones(data: FirebaseFirestore.DocumentData): string {
    return `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
            <div style="background:linear-gradient(135deg,#2464A3,#1d5082);color:#fff;padding:22px 24px;border-radius:12px 12px 0 0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Equipos y Servicios AG</p>
                <h2 style="margin:0;font-size:20px;">Solicitud de Vacaciones — AG-ADM-F12</h2>
            </div>
            <div style="padding:22px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">
                <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(String(data.mensajeCorto || "Se adjunta el formato autorizado."))}</p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;">
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;width:40%;">Colaborador</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${escapeHtml(String(data.solicitanteNombre || "—"))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Días</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(String(data.diasVacaciones ?? "—"))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Inicio</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(formatFecha(String(data.fechaInicio || "")))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Fin</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(formatFecha(String(data.fechaFin || "")))}</td></tr>
                </table>
                <p style="margin:16px 0 0;font-size:12px;color:#64748b;">El documento PDF firmado va <strong>adjunto</strong> a este correo.</p>
            </div>
            <div style="padding:14px 24px;background:#1e293b;color:#94a3b8;font-size:11px;border-radius:0 0 12px 12px;text-align:center;">
                Equipos y Servicios Especializados AG · Recursos Humanos
            </div>
        </div>`;
}

async function downloadPdfFromStorage(storagePath: string): Promise<Buffer | null> {
    try {
        const bucket = admin.storage().bucket();
        const [buffer] = await bucket.file(storagePath).download();
        return buffer;
    } catch (e) {
        console.error("PDF vacaciones no encontrado:", storagePath, e);
        return null;
    }
}

export const procesarAlertaVacaciones = functions.firestore
    .document("alertasVacaciones/{alertaId}")
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data || data.estado === "enviado" || data.estado === "omitido") return null;

        const emails = getRhEmailsFromAlerta(data);
        if (emails.length === 0) {
            await snap.ref.update({
                estado: "error",
                error: "Sin correo de destino RH",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        if (!getMailConfig()) {
            await snap.ref.update({
                estado: "error",
                error:
                    "Correo no configurado en Firebase. Configure gmail.user y gmail.pass.",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        const nombre = String(data.solicitanteNombre || "Colaborador");
        const subject = `Solicitud de vacaciones — ${nombre} (AG-ADM-F12)`;

        try {
            const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
            const storagePath = String(data.storagePath || "");
            if (storagePath) {
                const pdfBuffer = await downloadPdfFromStorage(storagePath);
                if (pdfBuffer) {
                    attachments.push({
                        filename: `Vacaciones_${nombre.replace(/\s+/g, "_")}_AG-ADM-F12.pdf`,
                        content: pdfBuffer,
                        contentType: "application/pdf",
                    });
                }
            }

            if (attachments.length === 0) {
                throw new Error(
                    `No se pudo adjuntar el PDF (${storagePath || "sin ruta"}). Revise Storage y la función onVacacionAprobadaFinal.`,
                );
            }

            const enviados: string[] = [];
            for (const to of emails) {
                await sendAgMail({
                    fromName: "AG Recursos Humanos",
                    to,
                    subject: `📋 ${subject}`,
                    html: buildHtmlVacaciones(data),
                    attachments,
                });
                enviados.push(to);
            }

            await snap.ref.update({
                estado: "enviado",
                destinatariosEnviados: enviados,
                adjuntoEnviado: true,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });

            if (data.solicitudId) {
                await admin
                    .firestore()
                    .collection("solicitudesVacaciones")
                    .doc(String(data.solicitudId))
                    .set({ correoEnviado: true }, { merge: true });
            }
        } catch (error) {
            const mensaje = formatMailError(error);
            console.error(`Error vacaciones ${context.params.alertaId}:`, mensaje);
            await snap.ref.update({
                estado: "error",
                error: mensaje,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return null;
    });
