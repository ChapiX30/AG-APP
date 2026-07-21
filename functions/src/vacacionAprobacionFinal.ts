import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { format } from "date-fns";
import { buildVacationPdfBuffer } from "./vacacionPdfBuild";
import { sendVacationRhPdfMail } from "./vacacionSolicitudMail";

const MAX_PDF_ATTEMPTS = 3;

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

/**
 * Cuando Jorge (u otro) marca la solicitud como aprobada, el servidor genera el PDF
 * y lo sube a Storage (evita error storage/unauthorized en el cliente).
 *
 * Importante: nunca escribir el mismo doc en el catch de forma ilimitada.
 * Un update con pdfError/correoEnviado=false re-dispara onUpdate y puede
 * generar cientos de miles de invocaciones (visto 2026-07-13).
 */
export async function runOnVacacionAprobadaFinal(
    change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
    context: functions.EventContext,
): Promise<null> {
    const after = change.after.data();
    if (!after) return null;

    if (after.estado !== "aprobada") {
        return null;
    }

    const before = change.before.exists ? change.before.data() : null;
    const solicitudId = context.params.solicitudId as string;
    const docRef = change.after.ref;

    if (after.correoEnviado === true) {
        return null;
    }

    // Bloqueo duro: demasiados intentos fallidos → no volver a escribir el doc.
    const attempts = Number(after.pdfIntentos || 0);
    if (attempts >= MAX_PDF_ATTEMPTS && after.reintentarCorreoRh !== true) {
        console.warn(
            `Vacaciones ${solicitudId}: max intentos PDF/correo (${attempts}), se omite para evitar bucle.`,
        );
        return null;
    }

    // Reintento manual desde cliente (flag one-shot).
    const forceRetry = after.reintentarCorreoRh === true;

    // Solo arrancar trabajo "pesado" en transición a aprobada, o reintento explícito.
    const justApproved = !before || before.estado !== "aprobada";
    const existingPath = String(after.pdfStoragePath || "").trim();

    if (!justApproved && !forceRetry && !after.pdfProcesando) {
        // Updates posteriores (pdfError, metadata, etc.) no deben reintentar solos.
        if (existingPath) {
            // PDF ya existe pero correo no: solo si pidieron reintento explícito.
            return null;
        }
        return null;
    }

    if (after.pdfProcesando === true && !forceRetry) {
        return null;
    }

    // Claim atómico para evitar carreras entre invocaciones concurrentes.
    const claimed = await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const d = snap.data();
        if (!d || d.estado !== "aprobada") return false;
        if (d.correoEnviado === true) return false;
        if (d.pdfProcesando === true && !forceRetry) return false;
        const n = Number(d.pdfIntentos || 0);
        if (n >= MAX_PDF_ATTEMPTS && d.reintentarCorreoRh !== true) return false;
        tx.update(docRef, {
            pdfProcesando: true,
            pdfIntentos: n + 1,
            reintentarCorreoRh: admin.firestore.FieldValue.delete(),
        });
        return true;
    });

    if (!claimed) {
        return null;
    }

    const pathToUse =
        existingPath || `vacaciones/${solicitudId}/AG-ADM-F12_${format(new Date(), "yyyy-MM-dd")}.pdf`;

    try {
        let pdfBuffer: Buffer | null = null;

        if (existingPath) {
            pdfBuffer = await downloadPdfFromStorage(existingPath);
        }

        if (!pdfBuffer) {
            pdfBuffer = await buildVacationPdfBuffer(after);
            const bucket = admin.storage().bucket();
            await bucket.file(pathToUse).save(pdfBuffer, {
                contentType: "application/pdf",
                metadata: { cacheControl: "no-cache, max-age=0" },
            });
        }

        const mailResult = await sendVacationRhPdfMail({
            pdfBuffer,
            solicitudId,
            data: after,
            force: forceRetry,
        });

        await docRef.update({
            pdfStoragePath: pathToUse,
            pdfGenerado: true,
            pdfProcesando: admin.firestore.FieldValue.delete(),
            pdfError: admin.firestore.FieldValue.delete(),
        });

        if (mailResult.omitido) {
            console.log(`Vacaciones ${solicitudId}: PDF listo; correo RH omitido/ya enviado.`);
        } else {
            console.log(
                `Vacaciones ${solicitudId}: PDF y correo RH OK: ${mailResult.enviados.join(", ")}`,
            );
        }
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error(`Vacaciones ${solicitudId} PDF/correo RH:`, mensaje);
        // Una sola escritura de error; el tope pdfIntentos evita bucles infinitos.
        await docRef.update({
            pdfGenerado: false,
            pdfProcesando: admin.firestore.FieldValue.delete(),
            pdfError: mensaje.slice(0, 500),
        });
    }

    return null;
}
