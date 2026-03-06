// functions/src/index.ts
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { addDays, addMonths, addYears, isValid, parseISO, format } from "date-fns";
import { es } from "date-fns/locale";

// --- NUEVAS IMPORTACIONES PARA GOOGLE DRIVE ---
import * as corsLib from "cors";
import { google } from "googleapis";
const cors = corsLib({ origin: true });
// ----------------------------------------------

admin.initializeApp();
const db = admin.firestore();

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
// 2. LÓGICA DE FECHAS (Cerebro Matemático)
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
// 3. EL AUDITOR (Se activa al guardar/editar una hoja de trabajo)
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
// 4. EL MONITOR MULTI-ALERTA (Corre todos los días a las 8 AM)
// ==================================================================
export const agbotMonitorDiario = functions.pubsub
    .schedule("0 8 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async (context: any) => {
        const hoy = new Date();

        const objetivos = [
            { dias: 0, titulo: "🔥 VENCEN HOY", color: "#e74c3c" },
            { dias: 10, titulo: "🚨 URGENTE (10 días)", color: "#e67e22" },
            { dias: 30, titulo: "⚠️ ACCIÓN (30 días)", color: "#f1c40f" },
            { dias: 60, titulo: "📅 PLANEACIÓN (60 días)", color: "#3498db" }
        ];

        let reporteHTML = "";
        let totalEquipos = 0;

        for (const obj of objetivos) {
            const fechaTarget = addDays(hoy, obj.dias);
            const start = new Date(fechaTarget); start.setHours(0, 0, 0, 0);
            const end = new Date(fechaTarget); end.setHours(23, 59, 59, 999);

            const snapshot = await db.collection("hojasDeTrabajo")
                .where("_fechaVencimiento", ">=", start)
                .where("_fechaVencimiento", "<=", end)
                .get();

            if (!snapshot.empty) {
                totalEquipos += snapshot.size;
                reporteHTML += `
                <h3 style="color: ${obj.color}; border-bottom: 2px solid ${obj.color}; margin-top: 20px;">
                    ${obj.titulo} (${snapshot.size} equipos)
                </h3>
                <ul>
            `;

                snapshot.docs.forEach(doc => {
                    const d = doc.data();
                    const cliente = d.cliente || d.clienteNombre || "Sin Cliente";
                    const equipo = d.equipo || d.nombre || d.descripcion || "Equipo";
                    const id = d.id || d.certificado || "S/N";
                    const vence = d._fechaVencimiento ? format(d._fechaVencimiento.toDate(), 'dd/MM/yyyy', { locale: es }) : "Fecha inválida";

                    reporteHTML += `<li><strong>${cliente}</strong>: ${equipo} (${id}) - ${vence}</li>`;
                });

                reporteHTML += `</ul>`;
            }
        }

        if (totalEquipos === 0) {
            console.log("AGbot: Nada relevante para reportar hoy.");
            return null;
        }

        const payloadPush = {
            notification: {
                title: `🔔 AGbot: ${totalEquipos} equipos a revisión`,
                body: `Se han detectado equipos próximos a vencer. Revisa tu correo.`,
            },
            topic: "admin_notifications"
        };

        try {
            await admin.messaging().send(payloadPush);
            console.log("Notificación push enviada con éxito a admin_notifications.");
        } catch (pushError) {
            console.error("Error al enviar la notificación push:", pushError);
        }

        const htmlFinal = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #2c3e50;">🤖 Reporte Diario de Inteligencia</h2>
            <p>He analizado el sistema y detecté <strong>${totalEquipos} eventos</strong> relevantes para hoy:</p>
            ${reporteHTML}
            <hr style="margin-top: 30px; border: 0; border-top: 1px solid #eee;">
            <p style="font-size: 12px; color: #999;">Generado automáticamente por AGbot System</p>
        </div>
    `;

        try {
            await transporter.sendMail({
                from: '"AGbot System" <eseagmaster@gmail.com>',
                to: "calidad@ese-ag.mx",
                subject: `🔔 Reporte Diario: ${totalEquipos} equipos requieren atención`,
                html: htmlFinal
            });
            console.log("Correo enviado con éxito.");
        } catch (e) { console.error(e); }
        return null;
    });

// ==================================================================
// 5. PUENTE API PARA EXCEL (Conexión en Vivo)
// ==================================================================
export const obtenerDatosExcel = functions.https.onRequest(async (req, res) => {
    const secretKey = req.query.key;
    if (secretKey !== "TU_CLAVE_SECRETA_AG_APP_2026") {
        res.status(403).send("Acceso denegado: Clave incorrecta.");
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
            requerimientos: doc.data().requerimientos || ""
        }));

        const historialSnapshot = await db.collection("hojasDeTrabajo").get();
        const historial = historialSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
                certificado: d.folio || d.certificado || doc.id,
                cliente: d.clienteNombre || d.cliente || "Sin Cliente",
                instrumento: d.equipoDescripcion || d.equipo || d.descripcion || "Equipo",
                marca: d.equipoMarca || d.marca || "",
                modelo: d.equipoModelo || d.modelo || "",
                serie: d.equipoSerie || d.serie || "",
                id_interno: d.idInterno || d.id || "S/N",
                fecha: d.fechaServicio || d.fecha || "",
                tecnico: d.tecnicoResponsable || d.tecnico || d.responsable || ""
            };
        });

        res.json({ clientes, historial });

    } catch (error) {
        console.error("Error en obtenerDatosExcel:", error);
        res.status(500).send("Error interno del servidor al obtener datos.");
    }
});

// ==================================================================
// 6. NUEVO: SUSCRIBIR TOKENS AL TÓPICO AUTOMÁTICAMENTE
// ==================================================================
export const gestionarSuscripcionNotificaciones = functions.firestore
    .document("usuarios/{uid}")
    .onWrite(async (change, context) => {
        const data = change.after.data();
        const previousData = change.before.data();

        const nuevoToken = data?.fcmToken;
        const tokenViejo = previousData?.fcmToken;

        if (nuevoToken && nuevoToken !== tokenViejo) {
            try {
                await admin.messaging().subscribeToTopic([nuevoToken], "admin_notifications");
                console.log(`Token suscrito exitosamente al tópico admin_notifications para el usuario ${context.params.uid}`);
            } catch (error) {
                console.error("Error suscribiendo al tópico:", error);
            }
        }

        if (!nuevoToken && tokenViejo) {
            try {
                await admin.messaging().unsubscribeFromTopic([tokenViejo], "admin_notifications");
                console.log(`Token removido del tópico admin_notifications`);
            } catch (error) {
                console.error("Error desuscribiendo del tópico:", error);
            }
        }

        return null;
    });

// ==================================================================
// 7. NUEVO: NOTIFICACIÓN INMEDIATA POR NUEVA HOJA DE TRABAJO
// ==================================================================
export const notificarNuevaHoja = functions.firestore
    .document("hojasDeTrabajo/{docId}")
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        const cliente = data.cliente || data.clienteNombre || "Nuevo Cliente";
        const equipo = data.equipo || data.descripcion || "un equipo";

        const payload = {
            notification: {
                title: "📝 Nueva Hoja de Trabajo Registrada",
                body: `Se ha registrado un servicio de ${equipo} para: ${cliente}`,
            },
            topic: "admin_notifications",
        };

        try {
            await admin.messaging().send(payload);
            console.log("Notificación de nueva hoja enviada al tópico.");
        } catch (error) {
            console.error("Error enviando notificación de nueva hoja:", error);
        }
        return null;
    });

// ==================================================================
// 8. NUEVO: BUSCADOR DE SCHEDULES EN GOOGLE DRIVE
// ==================================================================
export const buscarPdfDrive = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const idEquipo = req.query.id as string;
            if (!idEquipo) {
                res.status(400).json({ error: "Falta el ID del equipo" });
                return;
            }

            // ⚠️ IMPORTANTE: Necesitas una API Key de Google Cloud con acceso a la API de Drive
            const drive = google.drive({
                version: 'v3',
                auth: 'TU_API_KEY_DE_GOOGLE_CLOUD_AQUI' // Reemplaza esto con tu clave real
            });

            const folderId = '18jCk68E2ASBEtFOVtGJAYP0K98Qj8Fy5';

            const driveRes = await drive.files.list({
                q: `'${folderId}' in parents and name contains 'Schedule' and name contains '${idEquipo}' and mimeType = 'application/pdf'`,
                fields: 'files(id, name, webViewLink)',
                orderBy: 'modifiedTime desc',
                pageSize: 1
            });

            const files = driveRes.data.files;

            if (files && files.length > 0) {
                res.status(200).json({ fileUrl: files[0].webViewLink, fileName: files[0].name });
            } else {
                res.status(404).json({ message: "No se encontró un Schedule para este ID" });
            }

        } catch (error: any) {
            console.error("Error buscando en Drive:", error);
            res.status(500).json({ error: "Error al conectar con Google Drive", detalle: error.message });
        }
    });
});