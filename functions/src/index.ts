import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { addDays, addMonths, addYears, isValid, parseISO, format } from "date-fns";
import { es } from "date-fns/locale";

admin.initializeApp();

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
const AGBOT_AUDITOR_FIELDS = ["fecha", "frecuenciaCalibracion", "id", "certificado"] as const;

const sameAgbotVencimiento = (stored: unknown, next: Date | null): boolean => {
    if (!stored && !next) return true;
    if (!stored || !next) return false;
    const storedMs =
        typeof (stored as { toDate?: () => Date }).toDate === "function"
            ? (stored as { toDate: () => Date }).toDate().getTime()
            : stored instanceof Date
              ? stored.getTime()
              : null;
    return storedMs !== null && storedMs === next.getTime();
};

export const agbotAuditorCalibraciones = functions.firestore
    .document("hojasDeTrabajo/{docId}")
    .onWrite(async (change: any, context: any) => {
        if (!change.after.exists) return null;

        const data = change.after.data();
        const before = change.before.exists ? change.before.data() : null;

        if (data._agbotChecked === true && before) {
            const relevantUnchanged = AGBOT_AUDITOR_FIELDS.every(
                (field) => data[field] === before[field]
            );
            if (relevantUnchanged) return null;
        } else if (data._agbotChecked === true) {
            return null;
        }

        const fechaCalibracion = data.fecha ? parseISO(data.fecha) : null;
        const frecuencia = data.frecuenciaCalibracion || "N/A";
        let fechaVencimiento: Date | null = null;
        let agbotStatus = "VIGENTE";

        if (fechaCalibracion && isValid(fechaCalibracion)) {
            fechaVencimiento = calcularProximoVencimiento(fechaCalibracion, frecuencia);
        } else {
            agbotStatus = "ERROR_FECHA";
        }

        const equipoIdNormalizado = (data.id || data.certificado || "S/N").trim().toUpperCase();

        // Evita writes (y re-invocaciones) cuando el resultado ya está correcto.
        if (
            data._agbotChecked === true &&
            data._agbotStatus === agbotStatus &&
            data._equipoIdNormalizado === equipoIdNormalizado &&
            sameAgbotVencimiento(data._fechaVencimiento, fechaVencimiento)
        ) {
            return null;
        }

        return change.after.ref.update({
            _fechaVencimiento: fechaVencimiento,
            _agbotChecked: true,
            _agbotStatus: agbotStatus,
            _equipoIdNormalizado: equipoIdNormalizado,
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
            const { getMailConfig, sendAgMail } = require("./mailTransport");
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
            const { formatMailError } = require("./mailTransport");
            console.error("Monitor diario:", formatMailError(e));
        }
        return null;
    });

// ==================================================================
// 5. PUENTE API PARA EXCEL (master auto / Power Query)
// ==================================================================
/** Clave que ya usa Formato master auto Presion.xlsm (no cambiar sin actualizar Excel). */
const EXCEL_API_KEY = "TU_CLAVE_SECRETA_AG_APP_2026";

const normalizeLugarExcel = (raw: unknown): string => {
    const t = String(raw || "").trim().toLowerCase();
    if (t === "laboratorio" || t === "lab") return "Laboratorio";
    if (t === "sitio" || t.includes("sitio") || t.includes("campo")) return "Sitio";
    if (raw === "Laboratorio" || raw === "Sitio") return String(raw);
    return String(raw || "").trim() || "Sitio";
};

/** El master solo distingue 6 vs 12 meses en EDATE. */
const normalizeFrecuenciaExcel = (raw: unknown): string => {
    const t = String(raw || "").toLowerCase();
    if (t.includes("6 mes") || t.includes("semestr")) return "6 meses";
    if (t.includes("3 mes") || t.includes("trimest")) return "3 meses";
    if (t.includes("2 año") || t.includes("24 mes") || t.includes("bianual")) return "24 meses";
    return "12 meses";
};

type ExcelHistorialRow = {
    Name: string;
    certificado: string;
    cliente: string;
    equipo: string;
    marca: string;
    modelo: string;
    serie: string;
    id: string;
    fecha: string;
    tecnico: string;
    lugarCalibracion: string;
    frecuenciaCalibracion: string;
    /** Fecha de recepción (hoja de trabajo; suele llenarse en Laboratorio). */
    fechaRecepcion: string;
    /** Datos de contacto del catálogo `clientes` (join por nombre). */
    domicilio: string;
    contacto: string;
    correo: string;
    telefono: string;
};

const mapHojaToExcelRow = (d: {[key: string]: any}): ExcelHistorialRow => ({
    Name: "historial",
    certificado: String(d.certificado || d.folio || "-").trim() || "-",
    cliente: String(d.clienteNombre || d.cliente || "Sin Cliente").trim(),
    equipo: String(d.equipo || d.equipoDescripcion || "Equipo").trim(),
    marca: String(d.marca || d.equipoMarca || "").trim(),
    modelo: String(d.modelo || d.equipoModelo || "").trim(),
    // WorkSheetScreen guarda numeroSerie (no "serie")
    serie: String(d.numeroSerie || d.serie || d.equipoSerie || "").trim(),
    id: String(d.id || d.idInterno || "").trim(),
    fecha: String(d.fecha || d.fechaServicio || "").trim(),
    tecnico: String(d.nombre || d.tecnico || d.tecnicoResponsable || "").trim(),
    lugarCalibracion: normalizeLugarExcel(d.lugarCalibracion),
    frecuenciaCalibracion: normalizeFrecuenciaExcel(d.frecuenciaCalibracion),
    fechaRecepcion: String(d.fechaRecepcion || d.fechaEntrada || "").trim(),
    domicilio: "",
    contacto: "",
    correo: "",
    telefono: "",
});

/** Normaliza razón social para cruzar hoja de trabajo ↔ catálogo clientes. */
const normalizeClienteNombreExcel = (raw: unknown): string => {
    const base = String(raw || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^A-Z0-9]+/g, " ")
        .replace(/\b(S A DE C V|SA DE CV|S DE RL DE CV|S DE R L DE C V|SAPI DE CV|SA|CV)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return base;
};

type ExcelClienteRow = {
    id: string;
    Nombre: string;
    Domicilio: string;
    Contacto: string;
    Correo: string;
    Telefono: string;
    nombre: string;
    direccion: string;
    contacto: string;
    email: string;
    telefono: string;
};

const enrichHistorialConClientes = (
    historial: ExcelHistorialRow[],
    clientes: ExcelClienteRow[],
): ExcelHistorialRow[] => {
    const byExact = new Map<string, ExcelClienteRow>();
    const byNorm = new Map<string, ExcelClienteRow>();
    for (const c of clientes) {
        const nombre = String(c.Nombre || "").trim();
        if (!nombre) continue;
        const exact = nombre.toUpperCase();
        if (!byExact.has(exact)) byExact.set(exact, c);
        const norm = normalizeClienteNombreExcel(nombre);
        if (norm && !byNorm.has(norm)) byNorm.set(norm, c);
    }

    const resolve = (clienteNombre: string): ExcelClienteRow | undefined => {
        const key = String(clienteNombre || "").trim().toUpperCase();
        if (!key) return undefined;
        if (byExact.has(key)) return byExact.get(key);
        const norm = normalizeClienteNombreExcel(clienteNombre);
        if (norm && byNorm.has(norm)) return byNorm.get(norm);
        if (norm) {
            for (const [cand, row] of byNorm) {
                if (cand.startsWith(norm) || norm.startsWith(cand)) return row;
            }
        }
        return undefined;
    };

    return historial.map((row) => {
        const hit = resolve(row.cliente);
        if (!hit) return row;
        return {
            ...row,
            domicilio: String(hit.Domicilio || "").trim(),
            contacto: String(hit.Contacto || "").trim(),
            correo: String(hit.Correo || "").trim(),
            telefono: String(hit.Telefono || "").trim(),
        };
    });
};

/** Vigencia de patrón alineada a ProgramaCalibracion (fecha / fechaVencimiento / partes). */
const resolvePatronVencimiento = (d: {[key: string]: any}): string => {
    const partes = Array.isArray(d.partesCalibracion) ? d.partesCalibracion : [];
    if (partes.length > 1) {
        const fechas = partes
            .map((p: any) => String(p?.fechaVencimiento || "").trim())
            .filter(Boolean)
            .sort();
        if (fechas.length) return fechas[0];
    }
    if (partes.length === 1 && partes[0]?.fechaVencimiento) {
        return String(partes[0].fechaVencimiento).trim();
    }
    return String(d.fecha || d.fechaVencimiento || "").trim();
};

const resolvePatronUltimaCal = (d: {[key: string]: any}): string => {
    const partes = Array.isArray(d.partesCalibracion) ? d.partesCalibracion : [];
    if (partes[0]?.fechaUltimaCalibracion) return String(partes[0].fechaUltimaCalibracion).trim();
    return String(d.fechaUltimaCalibracion || "").trim();
};

const resolvePatronNoCert = (d: {[key: string]: any}): string => {
    const partes = Array.isArray(d.partesCalibracion) ? d.partesCalibracion : [];
    for (const parte of partes) {
        const n = String(parte?.noCertificado || "").trim();
        if (n) return n;
    }
    const root = String(d.noCertificado || d.certificacion || d.numeroCertificado || "").trim();
    if (root) return root;
    // Recepción de cert a menudo deja el número solo en historial: "Lab: … | Cert: 1-24842"
    const hist = Array.isArray(d.historial) ? d.historial : [];
    for (const h of hist) {
        const desc = String(h?.descripcion || h?.detalle || "");
        const m = /Cert\s*:\s*([A-Z0-9][A-Z0-9\-\/\.]{2,48})/i.exec(desc);
        if (m?.[1] && m[1] !== "—") return m[1].trim();
    }
    return "";
};

const statusVigenciaPatron = (fechaVence: string, estadoProceso: string): string => {
    const estado = String(estadoProceso || "").toLowerCase();
    // Solo estados que realmente impiden usar el patrón en certificado.
    // en_servicio / en_prestamo / en_uso: siguen vigentes por fecha (no marcar "No disponible").
    const bloqueo = new Set([
        "en_calibracion",
        "en_mantenimiento",
        "con_falla",
        "baja",
        "fuera_servicio",
        "cuarentena",
    ]);
    if (bloqueo.has(estado)) {
        return `No disponible (${estadoProceso})`;
    }
    if (!fechaVence || fechaVence === "Por Comprar") return "Sin fecha";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaVence);
    if (!m) return "Sin fecha";
    const vence = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    vence.setHours(0, 0, 0, 0);
    const days = Math.round((vence.getTime() - hoy.getTime()) / 86400000);
    if (days < 0) return "Vencido";
    if (days <= 30) return "Por Vencer";
    return "Vigente";
};

type ExcelPatronRow = {
    noControl: string;
    descripcion: string;
    marca: string;
    modelo: string;
    serie: string;
    noCertificado: string;
    fechaUltimaCalibracion: string;
    fechaVencimiento: string;
    estadoProceso: string;
    statusVigencia: string;
    laboratorio: string;
};

const mapPatronToExcelRow = (docId: string, d: {[key: string]: any}): ExcelPatronRow => {
    const fechaVencimiento = resolvePatronVencimiento(d);
    const estadoProceso = String(d.estadoProceso || "").trim();
    return {
        noControl: String(d.noControl || docId || "").trim().toUpperCase(),
        descripcion: String(d.descripcion || d.nombre || "").trim(),
        marca: String(d.marca || "").trim(),
        modelo: String(d.modelo || "").trim(),
        serie: String(d.serie || "").trim(),
        noCertificado: resolvePatronNoCert(d),
        fechaUltimaCalibracion: resolvePatronUltimaCal(d),
        fechaVencimiento,
        estadoProceso,
        statusVigencia: statusVigenciaPatron(fechaVencimiento, estadoProceso),
        laboratorio: String(d.laboratorioCalibracion || d.ubicacion || d.ubicacionActual || "").trim(),
    };
};

export const obtenerDatosExcel = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }

    const secretKey = String(req.query.key || "");
    if (secretKey !== EXCEL_API_KEY) {
        res.status(403).send("Acceso denegado.");
        return;
    }

    try {
        const prefijo = String(req.query.prefijo || "")
            .trim()
            .toUpperCase();
        const formato = String(req.query.formato || "json").toLowerCase();

        const [clientesSnapshot, historialSnapshot, patronesSnapshot] = await Promise.all([
            db.collection("clientes").get(),
            db.collection("hojasDeTrabajo").get(),
            db.collection("patronesCalibracion").get(),
        ]);

        const clientes = clientesSnapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            const nombre = String(d.nombre || "").trim();
            const domicilio = String(d.direccion || d.domicilio || "").trim();
            const contacto = String(d.contacto || "").trim();
            const correo = String(d.email || d.correo || "").trim();
            const telefono = String(d.telefono || "").trim();
            return {
                id: docSnap.id,
                // Columnas alineadas a BD_Clientes del master
                Nombre: nombre,
                Domicilio: domicilio,
                Contacto: contacto,
                Correo: correo,
                Telefono: telefono,
                // aliases legacy
                nombre,
                direccion: domicilio,
                contacto,
                email: correo,
                telefono,
            };
        });

        let historial = enrichHistorialConClientes(
            historialSnapshot.docs.map((docSnap) => mapHojaToExcelRow(docSnap.data())),
            clientes,
        );

        if (prefijo) {
            historial = historial.filter((row) =>
                String(row.certificado).toUpperCase().startsWith(prefijo)
            );
        }

        const patrones = patronesSnapshot.docs.map((docSnap) => mapPatronToExcelRow(docSnap.id, docSnap.data()));

        // Tabla plana lista para Power Query / sync script (mismas columnas que AG_Historial)
        if (formato === "tabla" || formato === "historial") {
            res.json(historial);
            return;
        }

        if (formato === "clientes") {
            res.json(clientes);
            return;
        }

        if (formato === "patrones") {
            res.json(patrones);
            return;
        }

        res.json({
            clientes,
            historial,
            patrones,
            meta: {
                clientesCount: clientes.length,
                historialCount: historial.length,
                patronesCount: patrones.length,
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("obtenerDatosExcel:", error);
        res.status(500).send("Error interno.");
    }
});

// ==================================================================
// 6. REGENERADOR AUTOMÁTICO DE PDF (DISEÑO PROFESIONAL AG)
// ==================================================================
export const agbotRegenerarPDF = functions.firestore
    .document("hojasDeTrabajo/{docId}")
    .onUpdate(async (change, context) => {
        const { runAgbotRegenerarPDF } = require("./agbotRegenerarPdf");
        return runAgbotRegenerarPDF(change);
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
            'vacacion_pendiente',
            'vacacion_rechazada',
            'vacacion_progreso',
            'vacacion_aprobada',
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
                      : tipo === 'vacacion_pendiente' ||
                          tipo === 'vacacion_rechazada' ||
                          tipo === 'vacacion_progreso' ||
                          tipo === 'vacacion_aprobada'
                        ? '/solicitud-vacaciones'
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

        const { getMailConfig, sendAgMail, formatMailError } = require("./mailTransport");
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
// 9. FUNCIONES CON CARGA DIFERIDA (evita timeout al desplegar)
// ==================================================================
export const getPatronCertificadoUrl = functions.https.onCall(async (data, context) => {
    const { runGetPatronCertificadoUrl } = require("./certificadoAccess");
    return runGetPatronCertificadoUrl(data, context);
});

export const procesarAlertaHojaServicio = functions.firestore
    .document("alertasHojaServicio/{alertaId}")
    .onCreate(async (snap, context) => {
        const { runProcesarAlertaHojaServicio } = require("./hojaServicioMail");
        return runProcesarAlertaHojaServicio(snap, context);
    });

export const procesarAlertaVacaciones = functions.firestore
    .document("alertasVacaciones/{alertaId}")
    .onCreate(async (snap, context) => {
        const { runProcesarAlertaVacaciones } = require("./vacacionSolicitudMail");
        return runProcesarAlertaVacaciones(snap, context);
    });

export const procesarAlertaVacacionesPaso = functions.firestore
    .document("alertasVacacionesPaso/{alertaId}")
    .onCreate(async (snap, context) => {
        const { runProcesarAlertaVacacionesPaso } = require("./vacacionPasoMail");
        return runProcesarAlertaVacacionesPaso(snap, context);
    });

export const onVacacionAprobadaFinal = functions.firestore
    .document("solicitudesVacaciones/{solicitudId}")
    .onUpdate(async (change, context) => {
        const { runOnVacacionAprobadaFinal } = require("./vacacionAprobacionFinal");
        return runOnVacacionAprobadaFinal(change, context);
    });

export const checkPJLAUpdates = functions.pubsub
    .schedule("every 24 hours")
    .timeZone("America/Monterrey")
    .onRun(async () => {
        const { runCheckPJLAUpdates } = require("./pjlaWatcher");
        await runCheckPJLAUpdates();
        return null;
    });

export const scheduledDriveReconcile = functions
    .runWith({ timeoutSeconds: 300, memory: "256MB" })
    // Runs once daily at 03:00 America/Mexico_City (cost reduction; Friday still reconciles on open).
    .pubsub.schedule("0 3 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const { runScheduledDriveReconcile } = require("./scheduledDriveReconcile");
        return runScheduledDriveReconcile();
    });