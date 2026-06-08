import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { format } from "date-fns";
import { buildVacationPdfBuffer } from "./vacacionPdfBuild";
import { sendVacationRhPdfMail } from "./vacacionSolicitudMail";

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

        const solicitudId = context.params.solicitudId;
        const docRef = change.after.ref;

        if (after.correoEnviado === true) {
            return null;
        }

        const existingPath = String(after.pdfStoragePath || "").trim();

        if (existingPath && after.pdfProcesando !== true) {
            try {
                const pdfBuffer = await downloadPdfFromStorage(existingPath);
                if (!pdfBuffer) {
                    throw new Error("No se pudo leer el PDF en Storage para enviar a RH.");
                }
                const mailResult = await sendVacationRhPdfMail({
                    pdfBuffer,
                    solicitudId,
                    data: after,
                });
                if (mailResult.omitido) {
                    console.log(`Vacaciones ${solicitudId}: correo RH ya enviado, se omite reenvío.`);
                } else {
                    console.log(`Vacaciones ${solicitudId}: correo RH reenviado (${mailResult.enviados.join(", ")})`);
                }
            } catch (error) {
                const mensaje = error instanceof Error ? error.message : String(error);
                console.error(`Vacaciones ${solicitudId} correo RH:`, mensaje);
                await docRef.update({ pdfError: mensaje.slice(0, 500), correoEnviado: false });
            }
            return null;
        }

        if (after.pdfProcesando === true) {
            return null;
        }

        await docRef.update({ pdfProcesando: true });
        const fechaStamp = format(new Date(), "yyyy-MM-dd");
        const storagePath = `vacaciones/${solicitudId}/AG-ADM-F12_${fechaStamp}.pdf`;

        try {
            const pdfBuffer = await buildVacationPdfBuffer(after);
            const bucket = admin.storage().bucket();
            await bucket.file(storagePath).save(pdfBuffer, {
                contentType: "application/pdf",
                metadata: { cacheControl: "no-cache, max-age=0" },
            });

            const mailResult = await sendVacationRhPdfMail({
                pdfBuffer,
                solicitudId,
                data: after,
            });

            await docRef.update({
                pdfStoragePath: storagePath,
                pdfGenerado: true,
                pdfProcesando: admin.firestore.FieldValue.delete(),
                pdfError: admin.firestore.FieldValue.delete(),
            });

            if (mailResult.omitido) {
                console.log(`Vacaciones ${solicitudId}: PDF generado; correo RH ya estaba enviado.`);
            } else {
                console.log(
                    `Vacaciones ${solicitudId}: PDF generado y enviado a RH: ${mailResult.enviados.join(", ")}`,
                );
            }
        } catch (error) {
            const mensaje =
                error instanceof Error ? error.message : String(error);
            console.error(`Vacaciones ${solicitudId} PDF/correo RH:`, mensaje);
            await docRef.update({
                pdfGenerado: false,
                pdfProcesando: admin.firestore.FieldValue.delete(),
                pdfError: mensaje.slice(0, 500),
                correoEnviado: false,
            });
        }

        return null;
}
