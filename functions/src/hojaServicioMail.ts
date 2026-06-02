import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { formatMailError, getMailConfig, sendAgMail } from "./mailTransport";

type EquipoRow = { id?: string; estado?: string };
type GrupoEquipo = { tecnico?: string; equipos?: EquipoRow[] };

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatFechaServicio(fecha: string): string {
    if (!fecha) return "—";
    try {
        const d = new Date(`${fecha}T12:00:00`);
        return d.toLocaleDateString("es-MX", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    } catch {
        return fecha;
    }
}

function buildHtmlHojaServicio(data: FirebaseFirestore.DocumentData): string {
    const grupos = (Array.isArray(data.gruposEquipos) ? data.gruposEquipos : []) as GrupoEquipo[];
    const filasEquipos = grupos
        .map((grupo) => {
            const items = Array.isArray(grupo.equipos) ? grupo.equipos : [];
            const chips = items
                .map((eq) => {
                    const rechazado = String(eq.estado || "").toUpperCase() === "RECHAZADO";
                    const bg = rechazado ? "#fee2e2" : "#dcfce7";
                    const color = rechazado ? "#991b1b" : "#166534";
                    return `<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${bg};color:${color};">${escapeHtml(String(eq.id || "—"))}</span>`;
                })
                .join("");
            return `
                <tr>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;vertical-align:top;font-weight:600;color:#1e40af;">${escapeHtml(String(grupo.tecnico || "Técnico"))}</td>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;">${chips || "—"}</td>
                </tr>`;
        })
        .join("");

    const pdfLink = data.pdfURL
        ? `<p style="margin:16px 0;"><a href="${escapeHtml(String(data.pdfURL))}" style="display:inline-block;background:#2464A3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Ver PDF en línea</a></p>`
        : "";

    return `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
            <div style="background:linear-gradient(135deg,#2464A3,#1d5082);color:#fff;padding:22px 24px;border-radius:12px 12px 0 0;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;">Equipos y Servicios AG</p>
                <h2 style="margin:0;font-size:20px;">Hoja de Servicio Técnico</h2>
                <p style="margin:10px 0 0;font-size:14px;opacity:0.95;">Folio <strong>${escapeHtml(String(data.folio || "—"))}</strong></p>
            </div>
            <div style="padding:22px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;">
                <p style="margin:0 0 16px;">Estimado(a) <strong>${escapeHtml(String(data.destinatarioNombre || data.contacto || "cliente"))}</strong>,</p>
                <p style="margin:0 0 16px;line-height:1.5;">${escapeHtml(String(data.mensajeCorto || "Adjuntamos la hoja de servicio del día indicado."))}</p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;margin-bottom:16px;">
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;width:38%;">Empresa</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;">${escapeHtml(String(data.empresa || "—"))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Fecha de servicio</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(formatFechaServicio(String(data.fecha || "")))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Técnico(s)</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(String(data.tecnicoResponsable || "—"))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Calidad del servicio</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#2464A3;">${escapeHtml(String(data.calidadServicio || "—"))}</td></tr>
                    <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#64748b;">Total equipos</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(String(data.totalEquipos ?? "—"))}</td></tr>
                </table>
                ${data.comentarios ? `<p style="margin:0 0 16px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;"><strong>Observaciones:</strong><br/>${escapeHtml(String(data.comentarios))}</p>` : ""}
                <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1e40af;">Equipos atendidos en sitio</p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;margin-bottom:8px;">
                    <thead><tr style="background:#e2e8f0;">
                        <th style="padding:8px 12px;text-align:left;">Técnico</th>
                        <th style="padding:8px 12px;text-align:left;">Equipos</th>
                    </tr></thead>
                    <tbody>${filasEquipos || '<tr><td colspan="2" style="padding:12px;border:1px solid #e2e8f0;">Sin equipos registrados</td></tr>'}</tbody>
                </table>
                <p style="margin:12px 0 0;font-size:12px;color:#64748b;">El documento PDF firmado va <strong>adjunto</strong> a este correo.</p>
                ${pdfLink}
            </div>
            <div style="padding:14px 24px;background:#1e293b;color:#94a3b8;font-size:11px;border-radius:0 0 12px 12px;text-align:center;">
                Equipos y Servicios Especializados AG · Monterrey, N.L.
            </div>
        </div>`;
}

async function downloadPdfFromStorage(storagePath: string): Promise<Buffer | null> {
    try {
        const bucket = admin.storage().bucket();
        const [buffer] = await bucket.file(storagePath).download();
        return buffer;
    } catch (e) {
        console.error("No se pudo descargar PDF para adjunto:", storagePath, e);
        return null;
    }
}

export const procesarAlertaHojaServicio = functions.firestore
    .document("alertasHojaServicio/{alertaId}")
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data || data.estado === "enviado") return null;

        const email = String(data.destinatarioEmail || "").trim();
        if (!email) {
            await snap.ref.update({
                estado: "error",
                error: "Sin correo del cliente",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        if (!getMailConfig()) {
            await snap.ref.update({
                estado: "error",
                error:
                    "Correo no configurado en Firebase. Configure gmail.user y gmail.pass y despliegue functions.",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        const folio = String(data.folio || "servicio");
        const subject = `Hoja de Servicio ${folio} — ${data.empresa || "Cliente AG"}`;

        try {
            const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
            const storagePath = String(data.storagePath || "");
            if (storagePath) {
                const pdfBuffer = await downloadPdfFromStorage(storagePath);
                if (pdfBuffer) {
                    attachments.push({
                        filename: `HojaServicio_${folio}.pdf`,
                        content: pdfBuffer,
                        contentType: "application/pdf",
                    });
                }
            }

            await sendAgMail({
                fromName: "AG Hoja de Servicio",
                to: email,
                subject: `📋 ${subject}`,
                html: buildHtmlHojaServicio(data),
                attachments,
            });

            await snap.ref.update({
                estado: "enviado",
                adjuntoEnviado: attachments.length > 0,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            const mensaje = formatMailError(error);
            console.error(`Error hoja servicio ${context.params.alertaId}:`, mensaje);
            await snap.ref.update({
                estado: "error",
                error: mensaje,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return null;
    });
