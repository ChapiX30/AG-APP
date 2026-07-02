import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import fetch from "node-fetch";
import {
    firestoreToWorksheetPdfForm,
    generateTemplatePDF,
    type WorksheetPdfFormData,
} from "./worksheetPdfTemplate";

const PDF_RELEVANT_FIELDS = [
    "cliente",
    "equipo",
    "medicionPatron",
    "medicionInstrumento",
    "notas",
    "excentricidad",
    "linealidad",
    "repetibilidad",
    "descripcionDano",
    "condicionEquipo",
    "fotoEquipoURL",
    "fotoEquipoBase64",
] as const;

function hasPdfRelevantChanges(
    data: FirebaseFirestore.DocumentData,
    dataAnterior: FirebaseFirestore.DocumentData,
): boolean {
    return PDF_RELEVANT_FIELDS.some((field) => data[field] !== dataAnterior[field]);
}

async function attachPhotoFromUrl(form: WorksheetPdfFormData, fotoUrl: string): Promise<void> {
    if (form.fotoEquipoBase64 || !fotoUrl) return;
    try {
        const resp = await fetch(fotoUrl);
        if (!resp.ok) return;
        const buffer = await resp.buffer();
        const contentType = resp.headers.get("content-type") || "image/jpeg";
        form.fotoEquipoBase64 = `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch {
        /* optional enrichment */
    }
}

/** Regenera PDF de hoja de trabajo con la plantilla completa (notas, imagen, paginación). */
export async function runAgbotRegenerarPDF(
    change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
): Promise<{ success: boolean } | null> {
    const data = change.after.data();
    const dataAnterior = change.before.data();
    if (!data || !dataAnterior) return null;

    if (!hasPdfRelevantChanges(data, dataAnterior)) {
        return null;
    }

    console.log(`Regenerando PDF en Storage para el folio: ${data.certificado}`);

    try {
        const { jsPDF } = require("jspdf");
        const form = firestoreToWorksheetPdfForm(data as Record<string, unknown>);
        await attachPhotoFromUrl(form, String(data.fotoEquipoURL || ""));

        const pdfDoc = generateTemplatePDF(form, jsPDF);
        const pdfBuffer = Buffer.from(pdfDoc.output("arraybuffer"));
        const technician = String(data.nombre || data.assignedTo || "Sistema").trim();
        const rutaStorage = `worksheets/${technician}/${data.certificado}_${data.id}.pdf`;
        const bucket = admin.storage().bucket();

        await bucket.file(rutaStorage).save(pdfBuffer, {
            contentType: "application/pdf",
            metadata: { cacheControl: "no-cache, max-age=0" },
        });

        const metaId = rutaStorage.replace(/\//g, "_");
        await admin.firestore().collection("fileMetadata").doc(metaId).set(
            {
                updated: admin.firestore.FieldValue.serverTimestamp(),
                size: pdfBuffer.length,
            },
            { merge: true },
        );

        return { success: true };
    } catch (error) {
        console.error("Error regenerando PDF:", error);
        return null;
    }
}
