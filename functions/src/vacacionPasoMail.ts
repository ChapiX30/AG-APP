import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
    approverHintsForStep,
    collectApproverEmailsFromUsers,
    uniqueEmails,
    type VacationMailStep,
} from "./vacacionEmails";
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
        return format(parseISO(iso), "dd 'de' MMMM yyyy", { locale: es });
    } catch {
        return iso;
    }
}

const STEP_LABELS: Record<VacationMailStep, string> = {
    calidad: "Calidad",
    edgar: "Autorización intermedia (Edgar)",
    jorge: "Jefe inmediato (Jorge)",
};

function buildReviewHtml(data: FirebaseFirestore.DocumentData): string {
    const paso = String(data.paso || "jorge") as VacationMailStep;
    const pasoLabel = STEP_LABELS[paso] || paso;
    const nombre = escapeHtml(String(data.solicitanteNombre || "Colaborador"));
    const dias = escapeHtml(String(data.diasVacaciones ?? "—"));
    const inicio = escapeHtml(formatFecha(String(data.fechaInicio || "")));
    const fin = escapeHtml(formatFecha(String(data.fechaFin || "")));
    const appUrl = "https://ag-app.web.app/solicitud-vacaciones";

    return `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
            <div style="background:linear-gradient(135deg,#2464A3,#1d5082);color:#fff;padding:22px 24px;border-radius:12px 12px 0 0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Equipos y Servicios AG</p>
                <h2 style="margin:0;font-size:20px;">Vacaciones — requiere su revisión</h2>
            </div>
            <div style="padding:22px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">
                <p style="margin:0 0 16px;line-height:1.55;font-size:15px;">
                    <strong>Por favor revise esta solicitud</strong> de vacaciones y autorícela o rechácela en la aplicación AG.
                </p>
                <p style="margin:0 0 12px;font-size:13px;color:#475569;">Paso actual: <strong>${escapeHtml(pasoLabel)}</strong></p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;">
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;width:38%;">Colaborador</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${nombre}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Días</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${dias}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Inicio</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${inicio}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Fin</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${fin}</td></tr>
                </table>
                <p style="margin:18px 0 0;">
                    <a href="${appUrl}" style="display:inline-block;background:#2464A3;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Abrir solicitud en AG-APP</a>
                </p>
            </div>
            <div style="padding:14px 24px;background:#1e293b;color:#94a3b8;font-size:11px;border-radius:0 0 12px 12px;text-align:center;">
                Equipos y Servicios Especializados AG
            </div>
        </div>`;
}

function buildStatusHtml(data: FirebaseFirestore.DocumentData): string {
    const tipo = String(data.tipo || "estado");
    const nombre = escapeHtml(String(data.solicitanteNombre || "Colaborador"));
    const mensaje = escapeHtml(String(data.mensaje || ""));
    const titulo =
        tipo === "rechazada"
            ? "Su solicitud de vacaciones fue rechazada"
            : tipo === "aprobada_paso"
              ? "Su solicitud avanzó en el proceso"
              : tipo === "aprobada_final"
                ? "Su solicitud de vacaciones fue aprobada"
                : "Actualización de su solicitud de vacaciones";

    return `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
            <div style="background:#2464A3;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h2 style="margin:0;font-size:18px;">${escapeHtml(titulo)}</h2>
            </div>
            <div style="padding:20px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">
                <p style="margin:0 0 12px;line-height:1.5;">Hola <strong>${nombre}</strong>,</p>
                <p style="margin:0;line-height:1.55;">${mensaje}</p>
            </div>
        </div>`;
}

async function loadAllUsers(): Promise<FirebaseFirestore.DocumentData[]> {
    const snap = await admin.firestore().collection("usuarios").get();
    return snap.docs.map((d) => d.data());
}

async function resolveRecipients(data: FirebaseFirestore.DocumentData): Promise<string[]> {
    const tipo = String(data.tipo || "revision");

    if (tipo === "revision") {
        const explicit = Array.isArray(data.destinatariosRevision)
            ? data.destinatariosRevision
                  .map((e: unknown) => String(e).trim().toLowerCase())
                  .filter((e) => e.includes("@"))
            : [];
        if (explicit.length > 0) return [...new Set(explicit)];

        const paso = String(data.paso || "jorge") as VacationMailStep;
        const users = await loadAllUsers();
        const approvers = collectApproverEmailsFromUsers(users, paso);
        if (approvers.length === 0) {
            console.warn(
                `Vacaciones paso ${paso}: sin correo de autorizador (${approverHintsForStep(paso).join(", ")}).`,
            );
        }
        return approvers;
    }

    if (tipo === "rechazada" || tipo === "aprobada_paso" || tipo === "enviada") {
        const solicitante = String(data.solicitanteEmail || "").trim().toLowerCase();
        const extra = Array.isArray(data.destinatariosExtra)
            ? data.destinatariosExtra.map((e: unknown) => String(e).trim().toLowerCase())
            : [];
        return uniqueEmails(solicitante, extra);
    }

    return [];
}

export async function runProcesarAlertaVacacionesPaso(
    snap: FirebaseFirestore.QueryDocumentSnapshot,
    context: functions.EventContext,
): Promise<null> {
        const data = snap.data();
        if (!data || data.estado === "enviado") return null;

        const tipo = String(data.tipo || "revision");
        if (tipo === "aprobada_final") {
            await snap.ref.update({
                estado: "omitido",
                error: "PDF RH se envía solo al aprobar Jorge (onVacacionAprobadaFinal)",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        const recipients = await resolveRecipients(data);
        if (recipients.length === 0) {
            await snap.ref.update({
                estado: "error",
                error: "Sin destinatarios de correo",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        if (!getMailConfig()) {
            await snap.ref.update({
                estado: "error",
                error: "Correo no configurado (gmail.user / gmail.pass)",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        const nombre = String(data.solicitanteNombre || "Colaborador");

        try {
            if (tipo === "revision") {
                const pasoLabel = STEP_LABELS[String(data.paso) as VacationMailStep] || data.paso;
                await sendAgMail({
                    fromName: "AG Vacaciones",
                    to: recipients,
                    subject: `📋 Vacaciones — por favor revise: ${nombre} (${pasoLabel})`,
                    html: buildReviewHtml(data),
                });
            } else {
                await sendAgMail({
                    fromName: "AG Vacaciones",
                    to: recipients,
                    subject: `Vacaciones — ${nombre}`,
                    html: buildStatusHtml(data),
                });
            }

            await snap.ref.update({
                estado: "enviado",
                destinatariosEnviados: recipients,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            const mensaje = formatMailError(error);
            console.error(`alertasVacacionesPaso ${context.params.alertaId}:`, mensaje);
            await snap.ref.update({
                estado: "error",
                error: mensaje,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return null;
}
