// functions/index.js
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

admin.initializeApp();

/**
 * Dispara en creación/edición de servicios/{id}.
 * Si personas[] contiene uids (o emails), busca fcmToken en usuarios/{uid}
 * y envía push.
 */
export const notificarAsignacion = onDocumentWritten(
    {
        document: 'servicios/{id}',
        region: 'us-central1' // ajusta si tu proyecto usa otra región
    },
    async (event) => {
        const after = event.data?.after?.data();
        if (!after) return;

        const personas = Array.isArray(after.personas) ? after.personas : [];
        if (personas.length === 0) return;

        const tokens = new Set();

        // Para cada identificador en personas, intenta:
        // 1) asumiendo que es uid -> usuarios/{uid}.fcmToken
        // 2) si parece email -> buscar usuarios.where('email', '==', email)
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

        // Mensaje de push
        const message = {
            tokens: Array.from(tokens),
            notification: { title: titulo, body: cuerpo },
            data: {
                servicioId: servicioId || '',
                url: '/friday' // 🔗 ruta a abrir al tocar la notificación
            }
        };

        const resp = await admin.messaging().sendEachForMulticast(message);

        // Limpieza opcional: tokens inválidos
        const invalid = [];
        resp.responses.forEach((r, i) => {
            if (!r.success) {
                const code = r.error?.code || '';
                if (code.includes('registration-token-not-registered')) {
                    invalid.push(message.tokens[i]);
                }
            }
        });

        if (invalid.length) {
            // Si usas un array de tokens, aquí los removerías. Con un único fcmToken por usuario
            // podrías borrar el campo si sabes a qué usuario pertenece ese token.
            console.log('Tokens inválidos:', invalid.length);
        }
    }
);
