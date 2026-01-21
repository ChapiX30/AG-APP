import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { addDays, addMonths, addYears, isValid, parseISO, format } from "date-fns";
import { es } from "date-fns/locale";

admin.initializeApp();
const db = admin.firestore();

// --- 1. CONFIGURACIÓN DEL CORREO ---
const transporter = nodemailer.createTransport({
  service: "gmail", 
  auth: {
    user: "eseagmaster@gmail.com", 
    pass: "hcbqlsbtmppvulv"  // Tu clave
  }
});

// --- 2. LÓGICA DE FECHAS (Cerebro Matemático) ---
const calcularProximoVencimiento = (fechaBase: Date, frecuenciaTexto: string): Date | null => {
  if (!fechaBase || !isValid(fechaBase)) return null;
  const texto = frecuenciaTexto ? frecuenciaTexto.toLowerCase().trim() : "";
  
  if (texto.includes("1 año") || texto.includes("anual") || texto.includes("12 meses")) return addYears(fechaBase, 1);
  if (texto.includes("2 años") || texto.includes("bianual")) return addYears(fechaBase, 2);
  if (texto.includes("6 meses") || texto.includes("semestral")) return addMonths(fechaBase, 6);
  if (texto.includes("3 meses") || texto.includes("trimestral")) return addMonths(fechaBase, 3);
  
  return addYears(fechaBase, 1);
};

// --- 3. EL AUDITOR (Se activa al guardar) ---
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

// --- 4. EL MONITOR MULTI-ALERTA (Cada mañana a las 8 AM) ---
export const agbotMonitorDiario = functions.pubsub
  .schedule("0 8 * * *")
  .timeZone("America/Mexico_City")
  .onRun(async (context: any) => {
    const hoy = new Date();
    
    // DEFINIMOS LOS OBJETIVOS DE BÚSQUEDA
    const objetivos = [
        { dias: 0, titulo: "🔥 VENCEN HOY", color: "#e74c3c" },
        { dias: 10, titulo: "🚨 URGENTE (10 días)", color: "#e67e22" },
        { dias: 30, titulo: "⚠️ ACCIÓN (30 días)", color: "#f1c40f" },
        { dias: 60, titulo: "📅 PLANEACIÓN (60 días)", color: "#3498db" }
    ];

    let reporteHTML = "";
    let totalEquipos = 0;

    // Ejecutamos las búsquedas en paralelo
    for (const obj of objetivos) {
        const fechaTarget = addDays(hoy, obj.dias);
        const start = new Date(fechaTarget); start.setHours(0,0,0,0);
        const end = new Date(fechaTarget); end.setHours(23,59,59,999);

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
                const cliente = d.cliente || "Sin Cliente";
                const equipo = d.equipo || d.nombre || "Equipo";
                const id = d.id || d.certificado || "S/N";
                const vence = format(d._fechaVencimiento.toDate(), 'dd/MM/yyyy', { locale: es });
                
                reporteHTML += `<li><strong>${cliente}</strong>: ${equipo} (${id}) - ${vence}</li>`;
            });
            
            reporteHTML += `</ul>`;
        }
    }

    // Si no encontró nada en ninguna categoría, no manda correo
    if (totalEquipos === 0) {
        console.log("AGbot: Nada relevante para reportar hoy.");
        return null;
    }

    // Encabezado del correo
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