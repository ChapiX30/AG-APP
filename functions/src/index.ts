import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { addDays, addMonths, addYears, isValid, parseISO, format } from "date-fns";
import { es } from "date-fns/locale";
import { jsPDF } from "jspdf";
import { getPatronCertificadoUrl } from "./certificadoAccess";
import { formatMailError, getMailConfig, sendAgMail } from "./mailTransport";

admin.initializeApp();

export { getPatronCertificadoUrl };
const db = admin.firestore();

// ==================================================================
// 1. LÓGICA DE FECHAS
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
            if (!getMailConfig()) {
                console.error("Monitor diario: correo no configurado (gmail.user / gmail.pass).");
                return null;
            }
            await sendAgMail({
                fromName: "AGbot System",
                to: "calidad@ese-ag.mx",
                subject: "🔔 Reporte Diario de Vencimientos",
                html: `<h2>Equipos para hoy (${addDays(hoy, 0).toLocaleDateString()}):</h2>${reporteHTML}`,
            });
        } catch (e) {
            console.error("Monitor diario:", formatMailError(e));
        }
        return null;
    });

// ==================================================================
// 5. PUENTE API PARA EXCEL
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
// 7. SISTEMA DE NOTIFICACIONES PUSH (CALIDAD - MULTIDISPOSITIVO)
// ==================================================================
export const enviarNotificacionCalidad = functions.firestore
    .document('notificaciones/{notificacionId}')
    .onWrite(async (change, context) => {
        if (!change.after.exists) return null;

        const nuevaNotificacion = change.after.data();
        const tipo = nuevaNotificacion?.tipo;
        const tiposPush = new Set([
            'asignacion_calidad',
            'revision_calidad',
            'vencimiento_equipo',
            'vencimiento_cliente',
            'prestamo_patron_tecnico',
            'prestamo_patron_calidad',
        ]);
        if (!nuevaNotificacion || !tipo || !tiposPush.has(tipo)) {
            return null;
        }

        if (nuevaNotificacion.fcmSent === true) {
            return null;
        }

        const collectTokensForUser = async (usuarioId: string): Promise<string[]> => {
            const userDoc = await db.collection('usuarios').doc(usuarioId).get();
            if (!userDoc.exists) return [];
            const userData = userDoc.data();
            const tokensObj = userData?.fcmTokens || {};
            const activeFromMap = Object.keys(tokensObj).filter((token) => tokensObj[token] === true);
            const legacyToken =
                typeof userData?.fcmToken === 'string' && userData.fcmToken.length > 0
                    ? userData.fcmToken
                    : null;
            return [
                ...new Set([
                    ...activeFromMap,
                    ...(legacyToken && !activeFromMap.includes(legacyToken) ? [legacyToken] : []),
                ]),
            ];
        };

        const recipientIds: string[] = Array.isArray(nuevaNotificacion.destinatarios)
            ? nuevaNotificacion.destinatarios.filter(
                  (id: unknown) => typeof id === 'string' && id.length > 0
              )
            : nuevaNotificacion.usuarioId
              ? [nuevaNotificacion.usuarioId]
              : [];

        if (recipientIds.length === 0) return null;

        try {
            const tokenSet = new Set<string>();
            for (const uid of recipientIds) {
                const tokens = await collectTokensForUser(uid);
                tokens.forEach((t) => tokenSet.add(t));
            }

            const tokensArray = [...tokenSet];
            if (tokensArray.length === 0) {
                console.log(
                    `Notificación ${context.params.notificacionId}: sin tokens FCM para destinatarios.`
                );
                return null;
            }

            const servicioId = nuevaNotificacion.servicioId || nuevaNotificacion.worksheetDocId || '';
            const servicioTag = servicioId || context.params.notificacionId;
            const title = String(
                nuevaNotificacion.title || nuevaNotificacion.titulo || 'Aviso AG'
            );
            const body = String(nuevaNotificacion.body || nuevaNotificacion.mensaje || '');
            const url =
                tipo === 'revision_calidad'
                    ? '/drive'
                    : tipo === 'vencimiento_equipo' || tipo === 'vencimiento_cliente'
                      ? '/vencimientos'
                      : '/calendario';

            const payload = {
                data: {
                    title,
                    body,
                    url,
                    servicioId: servicioId || '',
                    tipo,
                    tag: servicioTag,
                },
                android: {
                    priority: 'high' as const,
                    notification: {
                        title,
                        body,
                        tag: servicioTag,
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            alert: { title, body },
                            'thread-id': servicioTag,
                        },
                    },
                },
                webpush: {
                    headers: { Urgency: 'high' },
                    data: {
                        title,
                        body,
                        url,
                        servicioId: servicioId || '',
                        tipo,
                    },
                },
                tokens: tokensArray,
            };

            const response = await admin.messaging().sendEachForMulticast(payload);
            console.log(
                `Push ${tipo} ${context.params.notificacionId}. Éxitos: ${response.successCount}, Fallos: ${response.failureCount}`
            );

            await change.after.ref.set(
                {
                    fcmSent: true,
                    fcmSentAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            return null;
        } catch (error) {
            console.error('Error crítico al enviar Push Notification Multicast:', error);
            return null;
        }
    });

// ==================================================================
// 8. ALERTAS DE VENCIMIENTO (Correo + estado en Firestore)
// ==================================================================
const buildHtmlAlertaVencimiento = (data: FirebaseFirestore.DocumentData): string => {
    const equipos = Array.isArray(data.equipos) ? data.equipos : [];
    const filas = equipos
        .map((eq: Record<string, unknown>) => {
            const vence = eq.fechaVencimiento
                ? format(parseISO(String(eq.fechaVencimiento)), "dd/MM/yyyy", { locale: es })
                : "N/A";
            return `<tr>
                <td style="padding:8px;border:1px solid #e2e8f0;">${eq.descripcion || "—"}</td>
                <td style="padding:8px;border:1px solid #e2e8f0;font-family:monospace;">${eq.equipoId || "—"}</td>
                <td style="padding:8px;border:1px solid #e2e8f0;">${vence}</td>
                <td style="padding:8px;border:1px solid #e2e8f0;text-transform:uppercase;">${eq.status || "—"}</td>
            </tr>`;
        })
        .join("");

    return `
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
            <div style="background:linear-gradient(135deg,#2464A3,#1d5082);color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
                <h2 style="margin:0;font-size:18px;">Alerta de vencimiento — AG</h2>
                <p style="margin:8px 0 0;opacity:0.9;font-size:13px;">Cliente: <strong>${data.cliente || "—"}</strong></p>
            </div>
            <div style="padding:20px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p>Hola <strong>${data.destinatarioNombre || "equipo"}</strong>,</p>
                <p>${data.mensajeCorto || "Hay equipos que requieren tu atención."}</p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;background:#fff;">
                    <thead>
                        <tr style="background:#e2e8f0;">
                            <th style="padding:8px;text-align:left;">Equipo</th>
                            <th style="padding:8px;text-align:left;">ID</th>
                            <th style="padding:8px;text-align:left;">Vence</th>
                            <th style="padding:8px;text-align:left;">Estado</th>
                        </tr>
                    </thead>
                    <tbody>${filas}</tbody>
                </table>
                <p style="margin-top:20px;font-size:12px;color:#64748b;">Por favor contacta al cliente para programar recolección o servicio.</p>
            </div>
        </div>`;
};

export const procesarAlertaVencimiento = functions.firestore
    .document("alertasVencimiento/{alertaId}")
    .onCreate(async (snap, context) => {
        const data = snap.data();
        if (!data || data.estado === "enviado") return null;

        const email = String(data.destinatarioEmail || "").trim();
        if (!email) {
            await snap.ref.update({
                estado: "error",
                error: "Sin correo de destinatario",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        const subject = String(
            data.titulo || `Alerta de vencimiento — ${data.cliente || "Cliente"}`
        );

        if (!getMailConfig()) {
            await snap.ref.update({
                estado: "error",
                error:
                    "Correo no configurado en Firebase. Ejecute: firebase functions:config:set gmail.user=\"...\" gmail.pass=\"...\" y despliegue functions.",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            return null;
        }

        try {
            await sendAgMail({
                fromName: "AG Sistema de Vencimientos",
                to: email,
                subject: `🔔 ${subject}`,
                html: buildHtmlAlertaVencimiento(data),
            });

            await snap.ref.update({
                estado: "enviado",
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            const mensaje = formatMailError(error);
            console.error(`Error enviando alerta ${context.params.alertaId}:`, mensaje);
            await snap.ref.update({
                estado: "error",
                error: mensaje,
                procesadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        return null;
    });

// ==================================================================
// 9. VIGILANTE DE ACTUALIZACIONES PJLA (Importado desde archivo externo)
// ==================================================================
export { procesarAlertaHojaServicio } from "./hojaServicioMail";
export * from "./pjlaWatcher";
export { scheduledDriveReconcile } from "./scheduledDriveReconcile";