import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { addYears, addMonths, differenceInDays, parseISO, isValid, format } from "date-fns";
import { es } from "date-fns/locale";

admin.initializeApp();
const db = admin.firestore();

// --- 1. CONFIGURACIÓN DEL CORREO (NODEMAILER) ---
// Te recomiendo usar SendGrid, Outlook o Gmail con "App Password"
const transporter = nodemailer.createTransport({
  service: "gmail", 
  auth: {
    user: "tu_correo_sistema@gmail.com", // Pon aquí el correo que envía
    pass: "tu_contraseña_de_aplicacion"  // NO uses tu contraseña normal, genera un App Password en Google
  }
});

// --- HELPER: CALCULAR FECHAS (Igual que en tu Frontend) ---
const calcularVencimiento = (fechaStr: string, frecuenciaStr: string): Date | null => {
    if (!fechaStr || !frecuenciaStr) return null;
    try {
      const fechaBase = parseISO(fechaStr);
      if (!isValid(fechaBase)) return null;
      const freq = frecuenciaStr.toLowerCase();
      
      if (freq.includes('1 año')) return addYears(fechaBase, 1);
      if (freq.includes('2 años')) return addYears(fechaBase, 2);
      if (freq.includes('3 meses')) return addMonths(fechaBase, 3);
      if (freq.includes('6 meses')) return addMonths(fechaBase, 6);
      return addYears(fechaBase, 1);
    } catch (e) { return null; }
};

// --- 2. FUNCIÓN PROGRAMADA (CRON JOB) ---
// Se ejecuta todos los días a las 8:00 AM (Timezone America/Mexico_City)
export const checkVencimientosDiario = functions.pubsub
  .schedule("0 8 * * *")
  .timeZone("America/Mexico_City")
  .onRun(async (context) => {
    
    const hoy = new Date();
    const equiposAvisar: any[] = [];
    
    // Leer Base de Datos
    const snapshot = await db.collection("hojasDeTrabajo").get();

    snapshot.forEach(doc => {
        const data = doc.data();
        const vencimiento = calcularVencimiento(data.fecha, data.frecuenciaCalibracion);

        if (vencimiento) {
            const diasRestantes = differenceInDays(vencimiento, hoy);
            
            // RANGO DE ALERTA: Entre 59 y 61 días (para asegurar que agarre el día 60)
            if (diasRestantes >= 59 && diasRestantes <= 61) {
                equiposAvisar.push({
                    cliente: data.cliente || "Sin Cliente",
                    equipo: data.equipo || data.nombre || "Equipo s/n",
                    id: data.id || data.certificado || "S/N",
                    fechaVenc: format(vencimiento, 'dd/MM/yyyy', { locale: es })
                });
            }
        }
    });

    if (equiposAvisar.length === 0) {
        console.log("No hay equipos por vencer en 60 días hoy.");
        return null;
    }

    // --- 3. AGRUPAR POR EMPRESA ---
    const reportePorCliente: Record<string, any[]> = {};
    
    equiposAvisar.forEach(item => {
        if (!reportePorCliente[item.cliente]) {
            reportePorCliente[item.cliente] = [];
        }
        reportePorCliente[item.cliente].push(item);
    });

    // --- 4. GENERAR HTML DEL CORREO ---
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #d35400;">⚠️ Alerta de Vencimientos (60 días)</h2>
        <p>Hola Calidad,</p>
        <p>El sistema ha detectado que los siguientes equipos vencerán en aproximadamente 2 meses. Por favor gestionar reprogramación.</p>
        <hr style="border: 0; border-top: 1px solid #eee;">
    `;

    // Iteramos por cada cliente para crear su sección
    for (const [cliente, equipos] of Object.entries(reportePorCliente)) {
        htmlContent += `
            <div style="margin-bottom: 25px; background: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 5px solid #2980b9;">
                <h3 style="margin-top: 0; color: #2c3e50;">🏢 ${cliente}</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <thead style="background: #eecda3;">
                        <tr>
                            <th style="padding: 8px; text-align: left;">ID</th>
                            <th style="padding: 8px; text-align: left;">Equipo</th>
                            <th style="padding: 8px; text-align: right;">Vence</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        equipos.forEach((eq: any) => {
            htmlContent += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 8px;"><strong>${eq.id}</strong></td>
                    <td style="padding: 8px;">${eq.equipo}</td>
                    <td style="padding: 8px; text-align: right; color: #c0392b;">${eq.fechaVenc}</td>
                </tr>
            `;
        });

        htmlContent += `
                    </tbody>
                </table>
            </div>
        `;
    }

    htmlContent += `
        <p style="font-size: 12px; color: #777;">Este es un mensaje automático del Sistema de Gestión ESE-AG.</p>
      </div>
    `;

    // --- 5. ENVIAR CORREO ---
    const mailOptions = {
        from: '"Sistema Metrología" <tu_correo_sistema@gmail.com>',
        to: "calidad@ese-ag.mx",
        subject: `🔔 Vencimientos Próximos: ${equiposAvisar.length} Equipos a 60 días`,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Correo enviado exitosamente a Calidad.");
    } catch (error) {
        console.error("Error enviando correo:", error);
    }

    return null;
});