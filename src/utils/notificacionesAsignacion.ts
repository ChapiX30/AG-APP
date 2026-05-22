import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type EventoAsignacion = 'nueva' | 'actualizada';

/** Id determinístico: un doc por servicio + usuario (reintentos no duplican). */
export function notificacionAsignacionDocId(servicioId: string, uid: string): string {
  const safeServicio = (servicioId || 'sin_servicio').replace(/\//g, '_');
  const safeUid = (uid || 'sin_uid').replace(/\//g, '_');
  return `asignacion_${safeServicio}_${safeUid}`;
}

export interface CrearNotificacionAsignacionParams {
  uid: string;
  servicioId: string;
  titulo: string;
  mensaje: string;
  evento: EventoAsignacion;
  autorNombre?: string;
  autorUid?: string;
}

/**
 * Crea o actualiza la notificación de asignación (merge).
 * Resetea fcmSent para que la Cloud Function envíe push una sola vez.
 */
export async function crearNotificacionAsignacion(
  params: CrearNotificacionAsignacionParams
): Promise<void> {
  const {
    uid,
    servicioId,
    titulo,
    mensaje,
    evento,
    autorNombre = 'Calidad',
    autorUid = '',
  } = params;

  const docId = notificacionAsignacionDocId(servicioId, uid);
  await setDoc(
    doc(db, 'notificaciones', docId),
    {
      type: 'info',
      title: titulo,
      body: mensaje,
      destinatarios: [uid],
      readBy: [],
      timestamp: serverTimestamp(),
      autorNombre,
      autorUid,
      usuarioId: uid,
      titulo,
      mensaje,
      leido: false,
      fecha: new Date().toISOString(),
      tipo: 'asignacion_calidad',
      servicioId,
      eventoAsignacion: evento,
      fcmSent: false,
    },
    { merge: true }
  );
}
