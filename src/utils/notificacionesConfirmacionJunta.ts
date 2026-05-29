import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface NotificarConfirmacionAsistenciaParams {
  servicioId: string;
  eventoTitulo: string;
  eventoFecha?: string;
  confirmadoPorNombre: string;
  confirmadoPorUid: string;
}

async function getCalidadDestinatarios(): Promise<string[]> {
  const usersSnap = await getDocs(collection(db, 'usuarios'));
  return usersSnap.docs
    .filter(d => {
      const rol = String(d.data().role || d.data().puesto || '').toLowerCase();
      return (
        rol.includes('calidad') ||
        rol.includes('quality') ||
        rol.includes('admin') ||
        rol.includes('gerente')
      );
    })
    .map(d => d.id);
}

/** Notifica a calidad cuando alguien confirma asistencia a una junta o actividad. */
export async function notificarCalidadConfirmacionAsistencia(
  params: NotificarConfirmacionAsistenciaParams,
): Promise<void> {
  const { servicioId, eventoTitulo, eventoFecha, confirmadoPorNombre, confirmadoPorUid } = params;

  const destinatarios = await getCalidadDestinatarios();
  const filtered = destinatarios.filter(uid => uid !== confirmadoPorUid);
  if (filtered.length === 0) return;

  const title = 'Asistencia confirmada';
  const fechaTxt = eventoFecha ? ` (${eventoFecha})` : '';
  const body = `${confirmadoPorNombre} confirmó asistencia a "${eventoTitulo}"${fechaTxt}.`;

  const docId = `confirmacion_${servicioId}_${confirmadoPorUid}`.replace(/\//g, '_');

  await setDoc(
    doc(db, 'notificaciones', docId),
    {
      type: 'info',
      title,
      body,
      autorNombre: confirmadoPorNombre,
      autorUid: confirmadoPorUid,
      readBy: [],
      destinatarios: filtered,
      timestamp: serverTimestamp(),
      global: false,
      tipo: 'confirmacion_asistencia',
      servicioId,
      fcmSent: false,
      titulo: title,
      mensaje: body,
      leido: false,
      fecha: new Date().toISOString(),
      fcmData: {
        title,
        body,
        type: 'info',
        servicioId,
        url: '/servicios',
      },
    },
    { merge: true },
  );
}
