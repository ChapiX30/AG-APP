import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export function recordatorioJuntaDocId(servicioId: string, uid: string): string {
  const safeServicio = (servicioId || 'sin_servicio').replace(/\//g, '_');
  const safeUid = (uid || 'sin_uid').replace(/\//g, '_');
  return `recordatorio_junta_${safeServicio}_${safeUid}`;
}

export interface RecordatorioConfirmacionJuntaParams {
  uid: string;
  servicioId: string;
  eventoTitulo: string;
  eventoFecha?: string;
}

/** Crea o actualiza recordatorio de confirmación de asistencia a junta. */
export async function upsertRecordatorioConfirmacionJunta(
  params: RecordatorioConfirmacionJuntaParams,
): Promise<void> {
  const { uid, servicioId, eventoTitulo, eventoFecha } = params;
  const fechaTxt = eventoFecha ? ` (${eventoFecha})` : '';
  const title = 'Recuerda confirmar asistencia';
  const body = `Confirma tu asistencia a "${eventoTitulo}"${fechaTxt}. Ingresa al Calendario.`;

  await setDoc(
    doc(db, 'notificaciones', recordatorioJuntaDocId(servicioId, uid)),
    {
      type: 'warning',
      title,
      body,
      destinatarios: [uid],
      readBy: [],
      timestamp: serverTimestamp(),
      autorNombre: 'Calendario',
      autorUid: '',
      usuarioId: uid,
      titulo: title,
      mensaje: body,
      leido: false,
      fecha: new Date().toISOString(),
      tipo: 'recordatorio_confirmacion_junta',
      servicioId,
      navigateTo: 'calendario',
      fcmSent: false,
    },
    { merge: true },
  );
}

/** Elimina el recordatorio cuando el usuario ya confirmó. */
export async function eliminarRecordatorioConfirmacionJunta(
  servicioId: string,
  uid: string,
): Promise<void> {
  if (!servicioId || !uid) return;
  try {
    await deleteDoc(doc(db, 'notificaciones', recordatorioJuntaDocId(servicioId, uid)));
  } catch {
    /* puede no existir */
  }
}

/** Coincide uid de auth, id de documento o email en enterados. */
export function usuarioYaConfirmoJunta(
  enterados: string[] = [],
  uid?: string,
  email?: string,
): boolean {
  const keys = new Set([uid, email].filter(Boolean).map(s => String(s).toLowerCase()));
  if (!keys.size) return false;
  return enterados.some(e => keys.has(String(e).toLowerCase()));
}
