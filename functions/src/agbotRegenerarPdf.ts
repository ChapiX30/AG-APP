import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
/** Regenera PDF de hoja de trabajo; jsPDF se carga solo al ejecutar la función. */
export async function runAgbotRegenerarPDF(
    change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
): Promise<{ success: boolean } | null> {
    const data = change.after.data();
    const dataAnterior = change.before.data();
    if (!data || !dataAnterior) return null;

    if (
        data.cliente === dataAnterior.cliente &&
        data.equipo === dataAnterior.equipo &&
        data.medicionPatron === dataAnterior.medicionPatron &&
        data.medicionInstrumento === dataAnterior.medicionInstrumento
    ) {
        return null;
    }

    console.log(`Regenerando PDF PROFESIONAL en Storage para el folio: ${data.certificado}`);

    try {
        const { jsPDF } = require("jspdf");
        const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const marginLeft = 40;
        const marginRight = pageWidth - 40;
        let currentY = 80;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 139);
        doc.text("Equipos y Servicios Especializados AG", pageWidth / 2, 50, { align: "center" });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");

        const col2X = pageWidth / 2 + 20;

        doc.setFont("helvetica", "bold");
        doc.text(`Nombre: ${data.nombre || "-"}`, marginLeft, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(`Fecha: ${data.fecha || "-"}`, col2X, currentY);
        currentY += 25;

        doc.setDrawColor(100);
        doc.setLineWidth(1);
        doc.line(marginLeft, currentY, marginRight, currentY);
        currentY += 20;

        const infoData = [
            { l: "Cliente:", v: data.cliente, l2: "N. Certificado:", v2: data.certificado },
            { l: "Equipo:", v: data.equipo, l2: "ID:", v2: data.id },
            { l: "Marca:", v: data.marca, l2: "Modelo:", v2: data.modelo },
            { l: "N. Serie:", v: data.serie || data.numeroSerie, l2: "Ubicación:", v2: data.lugarCalibracion },
            { l: "Magnitud:", v: data.magnitud, l2: "Unidad:", v2: Array.isArray(data.unidad) ? data.unidad.join(", ") : data.unidad },
            { l: "Alcance:", v: data.alcance, l2: "Resolución:", v2: data.resolucion },
            { l: "Frecuencia:", v: data.frecuenciaCalibracion, l2: "Recepción:", v2: data.fechaRecepcion || "N/A" },
            { l: "Temp. Amb:", v: `${data.tempAmbiente || "-"} °C`, l2: "Humedad:", v2: `${data.humedadRelativa || "-"} %` },
        ];

        doc.setFontSize(10);
        infoData.forEach((row) => {
            doc.setFont("helvetica", "bold");
            doc.text(row.l, marginLeft, currentY);
            doc.setFont("helvetica", "normal");
            doc.text(String(row.v || "-").substring(0, 35), marginLeft + 65, currentY);

            doc.setFont("helvetica", "bold");
            doc.text(row.l2, col2X, currentY);
            doc.setFont("helvetica", "normal");
            doc.text(String(row.v2 || "-").substring(0, 35), col2X + 80, currentY);
            currentY += 16;
        });

        currentY += 15;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setFillColor(220, 220, 220);
        doc.rect(marginLeft, currentY - 14, pageWidth - 80, 20, "F");
        doc.text("Resultados de Mediciones", marginLeft + 10, currentY);
        currentY += 20;

        const tableWidth = 500;
        const tableX = (pageWidth - tableWidth) / 2;

        doc.setFillColor(50, 80, 160);
        doc.setDrawColor(0);
        doc.setLineWidth(0.1);
        doc.rect(tableX, currentY, tableWidth, 20, "FD");

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Medición Patrón", tableX + 20, currentY + 14);
        doc.text("Medición Instrumento", tableX + tableWidth / 2 + 20, currentY + 14);
        currentY += 20;

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        const patronRaw = (data.medicionPatron || "").split("\n");
        const instrumentoRaw = (data.medicionInstrumento || "").split("\n");
        const maxLines = Math.max(patronRaw.length, instrumentoRaw.length);
        const loopLimit = maxLines > 0 ? maxLines : 1;

        for (let i = 0; i < loopLimit; i++) {
            const pLine = patronRaw[i] || "";
            const iLine = instrumentoRaw[i] || "";

            const isHeaderLine = pLine.trim().endsWith(":") || iLine.trim().endsWith(":");
            const rowHeight = 18;

            doc.setDrawColor(200);
            if (isHeaderLine) {
                doc.setFillColor(240, 240, 240);
                doc.setFont("helvetica", "bold");
                doc.rect(tableX, currentY, tableWidth, rowHeight, "FD");
                doc.setTextColor(0, 0, 100);
            } else {
                doc.setFillColor(255, 255, 255);
                doc.setFont("helvetica", "normal");
                doc.rect(tableX, currentY, tableWidth / 2, rowHeight);
                doc.rect(tableX + tableWidth / 2, currentY, tableWidth / 2, rowHeight);
                doc.setTextColor(0, 0, 0);
            }

            doc.text(pLine, tableX + 10, currentY + 12);
            doc.text(iLine, tableX + tableWidth / 2 + 10, currentY + 12);
            currentY += rowHeight;
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100);
        doc.text("AG-CAL-F39-00", marginLeft, pageHeight - 20);

        const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
        const rutaStorage = `worksheets/${data.nombre || "Sistema"}/${data.certificado}_${data.id}.pdf`;
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
