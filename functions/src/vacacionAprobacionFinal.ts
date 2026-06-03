import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { format } from "date-fns";
import { buildVacationPdfBuffer } from "./vacacionPdfBuild";

const db = admin.firestore();

/**
 * Cuando Jorge (u otro) marca la solicitud como aprobada, el servidor genera el PDF
 * y lo sube a Storage (evita error storage/unauthorized en el cliente).
 */
export const onVacacionAprobadaFinal = functions.firestore
    .document("solicitudesVacaciones/{solicitudId}")
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        if (!after) return null;

        if (after.estado !== "aprobada" || after.pdfStoragePath || after.pdfProcesando === true) {
            return null;
        }

        const solicitudId = context.params.solicitudId;
        const docRef = change.after.ref;

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

            await docRef.update({
                pdfStoragePath: storagePath,
                pdfGenerado: true,
                pdfProcesando: admin.firestore.FieldValue.delete(),
                pdfError: admin.firestore.FieldValue.delete(),
            });

            const correoRh = String(
                after.correoRh || "eseagmaster@gmail.com"
            ).trim();

            await db.collection("alertasVacaciones").add({
                estado: "pendiente",
                solicitudId,
                destinatarioEmail: correoRh,
                destinatarioNombre: "Recursos Humanos",
                solicitanteNombre: after.solicitanteNombre || "Colaborador",
                diasVacaciones: after.diasVacaciones,
                fechaInicio: after.fechaInicio,
                fechaFin: after.fechaFin,
                storagePath,
                titulo: `Solicitud de vacaciones — ${after.solicitanteNombre || "Colaborador"}`,
                mensajeCorto: `Se adjunta el formato AG-ADM-F12 autorizado para ${after.solicitanteNombre} (${after.diasVacaciones} día(s)).`,
                creadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`Vacaciones ${solicitudId}: PDF generado y correo encolado.`);
        } catch (error) {
            const mensaje =
                error instanceof Error ? error.message : String(error);
            console.error(`Vacaciones ${solicitudId} PDF:`, mensaje);
            await docRef.update({
                pdfGenerado: false,
                pdfProcesando: admin.firestore.FieldValue.delete(),
                pdfError: mensaje.slice(0, 500),
            });
        }

        return null;
    });
