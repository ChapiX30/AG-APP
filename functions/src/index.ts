import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { addDays, addMonths, addYears, isValid, parseISO, format } from "date-fns";
import { es } from "date-fns/locale";
import { jsPDF } from "jspdf";

// NUEVAS IMPORTACIONES PARA GOOGLE DRIVE Y CORS
import { google } from "googleapis";
import * as corsLib from "cors";

admin.initializeApp();
const db = admin.firestore();

// Configuración de CORS para la API de Drive
const cors = corsLib({ origin: true });

// ==================================================================
// 1. CONFIGURACIÓN DEL CORREO
// ==================================================================
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "eseagmaster@gmail.com",
        pass: "hcbqlsbtmppvulv"
    }
});

// ==================================================================
// 2. LÓGICA DE FECHAS
// ==================================================================
const calcularProximoVencimiento = (fechaBase: Date, frecuenciaTexto: string): Date | null => {
    if (!fechaBase || !isValid(fechaBase)) return null;
    const texto = frecuenciaTexto ? frecuenciaTexto.toLowerCase().trim() : "";

    if (texto.includes("1 año") || texto.includes("anual") || texto.includes("12 meses")) return addYears(fechaBase, 1);
    if (texto.includes("2 años") || texto.includes("bianual")) return addYears(fechaBase, 2);
    if (texto.includes("6 meses") || texto.includes("semestral")) return addMonths(fechaBase, 6);
    if (texto.includes("3 meses") || texto.includes("trimestral")) return addMonths(fechaBase, 3);

    return addYears(fechaBase, 1);
};

// ==================================================================
// 3. EL AUDITOR (Firestore Trigger)
// ==================================================================
export const agbotAuditorCalibraciones = functions.firestore
    .document("hojasDeTrabajo/{docId}")
    .onWrite(async (change: any, context: any) => {
        if (!change.after.exists) return null;

        const data = change.after.data();
        if (data._agbotChecked === true) return null;

        const fechaCalibracion = data.fecha ? parseISO(data.fecha) : null;
        const frecuencia = data.frecuenciaCalibracion || "N/A";
        let fechaVencimiento = null;
        let agbotStatus = "VIGENTE";

        if (fechaCalibracion && isValid(fechaCalibracion)) {
            fechaVencimiento = calcularProximoVencimiento(fechaCalibracion, frecuencia);
        } else {
            agbotStatus = "ERROR_FECHA";
        }

        return change.after.ref.update({
            _fechaVencimiento: fechaVencimiento,
            _agbotChecked: true,
            _agbotStatus: agbotStatus,
            _equipoIdNormalizado: (data.id || data.certificado || "S/N").trim().toUpperCase()
        });
    });

// ==================================================================
// 4. EL MONITOR DIARIO (PubSub Schedule)
// ==================================================================
export const agbotMonitorDiario = functions.pubsub
    .schedule("0 8 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async (context: any) => {
        const hoy = new Date();
        const start = new Date(hoy); start.setHours(0, 0, 0, 0);
        const end = new Date(hoy); end.setHours(23, 59, 59, 999);

        const snapshot = await db.collection("hojasDeTrabajo")
            .where("_fechaVencimiento", ">=", start)
            .where("_fechaVencimiento", "<=", end)
            .get();

        if (snapshot.empty) return null;

        let reporteHTML = "<ul>";
        snapshot.docs.forEach(doc => {
            const d = doc.data();
            const fVence = d._fechaVencimiento ? format(d._fechaVencimiento.toDate(), 'dd/MM/yyyy', { locale: es }) : "N/A";
            reporteHTML += `<li>${d.clienteNombre || "Cliente"}: ${d.equipo || "Equipo"} - Vence: ${fVence}</li>`;
        });
        reporteHTML += "</ul>";

        try {
            await transporter.sendMail({
                from: '"AGbot System" <eseagmaster@gmail.com>',
                to: "calidad@ese-ag.mx",
                subject: `🔔 Reporte Diario de Vencimientos`,
                html: `<h2>Equipos para hoy (${addDays(hoy, 0).toLocaleDateString()}):</h2>${reporteHTML}`
            });
        } catch (e) { console.error(e); }
        return null;
    });

// ==================================================================
// 5. PUENTE API PARA EXCEL (Corregido Equipo y Certificado)
// ==================================================================
export const obtenerDatosExcel = functions.https.onRequest(async (req, res) => {
    const secretKey = req.query.key;
    if (secretKey !== "TU_CLAVE_SECRETA_AG_APP_2026") {
        res.status(403).send("Acceso denegado.");
        return;
    }

    try {
        const clientesSnapshot = await db.collection("clientes").get();
        const clientes = clientesSnapshot.docs.map(doc => ({
            id: doc.id,
            nombre: doc.data().nombre || "",
            direccion: doc.data().direccion || "",
            contacto: doc.data().contacto || "",
            email: doc.data().email || "",
            telefono: doc.data().telefono || "",
        }));

        const historialSnapshot = await db.collection("hojasDeTrabajo").get();
        const historial = historialSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
                certificado: d.certificado || "-",
                cliente: d.clienteNombre || d.cliente || "Sin Cliente",
                equipo: d.equipo || "Equipo",
                marca: d.marca || d.equipoMarca || "",
                modelo: d.modelo || d.equipoModelo || "",
                serie: d.serie || d.equipoSerie || "",
                id: d.id || "",
                fecha: d.fecha || "",
                tecnico: d.nombre || "",
                lugarCalibracion: d.lugarCalibracion || "S/M",
                frecuenciaCalibracion: d.frecuenciaCalibracion || "12 meses",
            };
        });

        res.json({ clientes, historial });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).send("Error interno.");
    }
});

// ==================================================================
// 6. REGENERADOR AUTOMÁTICO DE PDF (DISEÑO PROFESIONAL AG)
// ==================================================================
export const agbotRegenerarPDF = functions.firestore
    .document("hojasDeTrabajo/{docId}")
    .onUpdate(async (change: any, context: any) => {
        const data = change.after.data();
        const dataAnterior = change.before.data();

        // Solo regenerar si cambiaron datos críticos
        if (data.cliente === dataAnterior.cliente &&
            data.equipo === dataAnterior.equipo &&
            data.medicionPatron === dataAnterior.medicionPatron &&
            data.medicionInstrumento === dataAnterior.medicionInstrumento) {
            return null;
        }

        console.log(`Regenerando PDF PROFESIONAL en Storage para el folio: ${data.certificado}`);

        try {
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

            const col1X = marginLeft;
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
                { l: "Magnitud:", v: data.magnitud, l2: "Unidad:", v2: Array.isArray(data.unidad) ? data.unidad.join(', ') : data.unidad },
                { l: "Alcance:", v: data.alcance, l2: "Resolución:", v2: data.resolucion },
                { l: "Frecuencia:", v: data.frecuenciaCalibracion, l2: "Recepción:", v2: data.fechaRecepcion || "N/A" },
                { l: "Temp. Amb:", v: `${data.tempAmbiente || "-"} °C`, l2: "Humedad:", v2: `${data.humedadRelativa || "-"} %` },
            ];

            doc.setFontSize(10);
            infoData.forEach(row => {
                doc.setFont("helvetica", "bold");
                doc.text(row.l, col1X, currentY);
                doc.setFont("helvetica", "normal");
                doc.text(String(row.v || "-").substring(0, 35), col1X + 65, currentY);

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
            doc.rect(marginLeft, currentY - 14, pageWidth - 80, 20, 'F');
            doc.text("Resultados de Mediciones", marginLeft + 10, currentY);
            currentY += 20;

            const tableWidth = 500;
            const tableX = (pageWidth - tableWidth) / 2;

            doc.setFillColor(50, 80, 160);
            doc.setDrawColor(0);
            doc.setLineWidth(0.1);
            doc.rect(tableX, currentY, tableWidth, 20, 'FD');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("Medición Patrón", tableX + 20, currentY + 14);
            doc.text("Medición Instrumento", tableX + (tableWidth / 2) + 20, currentY + 14);
            currentY += 20;

            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);

            const patronRaw = (data.medicionPatron || "").split('\n');
            const instrumentoRaw = (data.medicionInstrumento || "").split('\n');
            const maxLines = Math.max(patronRaw.length, instrumentoRaw.length);
            const loopLimit = maxLines > 0 ? maxLines : 1;

            for (let i = 0; i < loopLimit; i++) {
                const pLine = patronRaw[i] || "";
                const iLine = instrumentoRaw[i] || "";

                const isHeaderLine = (pLine.trim().endsWith(':') || iLine.trim().endsWith(':'));
                const rowHeight = 18;

                doc.setDrawColor(200);
                if (isHeaderLine) {
                    doc.setFillColor(240, 240, 240);
                    doc.setFont("helvetica", "bold");
                    doc.rect(tableX, currentY, tableWidth, rowHeight, 'FD');
                    doc.setTextColor(0, 0, 100);
                } else {
                    doc.setFillColor(255, 255, 255);
                    doc.setFont("helvetica", "normal");
                    doc.rect(tableX, currentY, tableWidth / 2, rowHeight);
                    doc.rect(tableX + tableWidth / 2, currentY, tableWidth / 2, rowHeight);
                    doc.setTextColor(0, 0, 0);
                }

                doc.text(pLine, tableX + 10, currentY + 12);
                doc.text(iLine, tableX + (tableWidth / 2) + 10, currentY + 12);
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
                metadata: { cacheControl: "no-cache, max-age=0" }
            });

            console.log("PDF profesional sobrescrito exitosamente en Storage.");

            const metaId = rutaStorage.replace(/\//g, "_");
            await db.collection("fileMetadata").doc(metaId).set({
                updated: admin.firestore.FieldValue.serverTimestamp(),
                size: pdfBuffer.length
            }, { merge: true });

            return { success: true };
        } catch (error) {
            console.error("Error regenerando PDF:", error);
            return null;
        }
    });

// ==================================================================
// 7. DISPARADOR PUSH NOTIFICATIONS (DATA-ONLY PAYLOAD)
// ==================================================================
export const onNewNotificacion = functions.firestore
    .document("notificaciones/{docId}")
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data) return null;

        const { title, body, type, destinatarios } = data;
        
        if (!destinatarios || !Array.isArray(destinatarios) || destinatarios.length === 0) {
            console.log("No hay destinatarios para esta notificación.");
            return null;
        }

        const tokens: string[] = [];

        try {
            const userPromises = destinatarios.map(uid => db.collection("usuarios").doc(uid).get());
            const userDocs = await Promise.all(userPromises);

            userDocs.forEach(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    if (userData?.fcmTokens) {
                        Object.keys(userData.fcmTokens).forEach(token => tokens.push(token));
                    } else if (userData?.fcmToken) {
                        tokens.push(userData.fcmToken);
                    }
                }
            });

            const uniqueTokens = Array.from(new Set(tokens));

            if (uniqueTokens.length === 0) {
                console.log("No se encontraron tokens FCM válidos para los destinatarios.");
                return null;
            }

            const payload = {
                data: {
                    title: title || "AG Solutions",
                    body: body || "Tienes un nuevo aviso en el sistema",
                    type: type || "info",
                    notifId: context.params.docId, 
                },
                tokens: uniqueTokens
            };

            const response = await admin.messaging().sendEachForMulticast(payload);
            console.log(`Notificación Push enviada: ${response.successCount} exitosas, ${response.failureCount} fallidas.`);

        } catch (error) {
            console.error("Error al enviar notificaciones Push FCM:", error);
        }

        return null;
    });

// ==================================================================
// 8. BUSCADOR DE PDF EN GOOGLE DRIVE
// ==================================================================
export const buscarPdfDrive = functions.https.onRequest((req, res) => {
    // Usamos CORS para evitar bloqueos desde el frontend (tablet/web)
    cors(req, res, async () => {
        const idEquipo = req.query.id as string;

        if (!idEquipo) {
            res.status(400).json({ error: "Falta el ID del equipo" });
            return;
        }

        try {
            // Importamos las credenciales localmente para evitar errores de compilación global
            const credentials = require("./service-account.json");

            // 1. Autenticar con Google Drive usando la cuenta de servicio
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ["https://www.googleapis.com/auth/drive.readonly"],
            });

            const drive = google.drive({ version: "v3", auth });

            // 2. Ejecutar la búsqueda.
            // Esto buscará cualquier archivo PDF que contenga el ID (ej: EP-53425) en su nombre.
            const response = await drive.files.list({
                q: `name contains '${idEquipo}' and mimeType = 'application/pdf' and trashed = false`,
                fields: "files(id, name, webViewLink)",
                spaces: "drive",
                pageSize: 1, // Traemos solo el primero que encuentre para agilizar
            });

            const files = response.data.files;

            if (files && files.length > 0) {
                // Se encontró el documento en Drive
                res.status(200).json({ 
                    encontrado: true, 
                    fileUrl: files[0].webViewLink,
                    fileName: files[0].name
                });
            } else {
                // No se encontró ningún PDF con ese ID
                res.status(404).json({ encontrado: false, fileUrl: null });
            }
            
        } catch (error) {
            console.error("Error al buscar el PDF en Drive:", error);
            res.status(500).json({ error: "Error interno del servidor al consultar Google Drive." });
        }
    });
});