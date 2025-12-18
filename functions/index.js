// functions/index.js
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https'; // <--- AGREGADO: Importamos onRequest

admin.initializeApp();

/**
 * 1. FUNCION ORIGINAL: NOTIFICACIONES
 * Dispara en creación/edición de servicios/{id}.
 */
export const notificarAsignacion = onDocumentWritten(
    {
        document: 'servicios/{id}',
        region: 'us-central1'
    },
    async (event) => {
        const after = event.data?.after?.data();
        if (!after) return;

        const personas = Array.isArray(after.personas) ? after.personas : [];
        if (personas.length === 0) return;

        const tokens = new Set();

        await Promise.all(personas.map(async (pid) => {
            const str = (pid || '').toString();
            const isEmail = str.includes('@');

            if (!isEmail) {
                const snap = await admin.firestore().collection('usuarios').doc(str).get();
                if (snap.exists) {
                    const t = snap.get('fcmToken');
                    if (t) tokens.add(t);
                }
            } else {
                const q = await admin.firestore().collection('usuarios').where('email', '==', str.toLowerCase()).get();
                q.forEach(d => {
                    const t = d.get('fcmToken');
                    if (t) tokens.add(t);
                });
            }
        }));

        if (tokens.size === 0) return;

        const servicioId = event.params.id;
        const titulo = 'Nuevo servicio asignado';
        const cuerpo = after.elemento ? `Se te asignó: ${after.elemento}` : 'Revisa tus servicios';

        const message = {
            tokens: Array.from(tokens),
            notification: { title: titulo, body: cuerpo },
            data: {
                servicioId: servicioId || '',
                url: '/friday'
            }
        };

        const resp = await admin.messaging().sendEachForMulticast(message);

        // Limpieza de tokens inválidos (opcional)
        const invalid = [];
        resp.responses.forEach((r, i) => {
            if (!r.success && r.error?.code?.includes('registration-token-not-registered')) {
                invalid.push(message.tokens[i]);
            }
        });
        if (invalid.length) console.log('Tokens inválidos:', invalid.length);
    }
);

/**
 * 2. NUEVA FUNCION: PUENTE PARA EXCEL
 * Esta función genera una URL pública que devuelve tus clientes en formato JSON limpio.
 */
export const apiClientesExcel = onRequest(
    {
        cors: true,       // Permite acceso desde cualquier lado
        region: 'us-central1'
    },
    async (req, res) => {
        try {
            // Obtenemos la colección completa de clientes
            const snapshot = await admin.firestore().collection('clientes').get();

            // Mapeamos los datos para que queden listos para Excel (tabla plana)
            const listado = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ID: doc.id, // ID oculto por si lo necesitas
                    Nombre: data.nombre || "Sin Nombre",
                    Direccion: data.direccion || "N/A",
                    Contacto: data.contacto || "",
                    Email: data.email || data.correo || "", // Busca ambas variantes por si acaso
                    Telefono: data.telefono || ""
                };
            });

            // Devolvemos la lista en formato JSON
            res.status(200).json(listado);

        } catch (error) {
            console.error("Error al exportar clientes:", error);
            res.status(500).send("Error interno: " + error.message);
        }
    }
);