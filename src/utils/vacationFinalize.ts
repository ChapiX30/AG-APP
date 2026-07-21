import { deleteField, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { SolicitudVacacionesDoc } from './vacationWorkflow';

/**
 * Pide al servidor (Cloud Function onVacacionAprobadaFinal) que reenvíe el PDF por correo.
 * Un solo camino de envío; evita duplicar alertasVacaciones desde el cliente.
 */
export async function requestVacationRhEmailRetry(solicitud: SolicitudVacacionesDoc): Promise<void> {
  if (!solicitud.id) {
    throw new Error('Falta el id de la solicitud.');
  }
  if (solicitud.estado !== 'aprobada') {
    throw new Error('La solicitud debe estar aprobada para reenviar el correo.');
  }

  const patch: Record<string, unknown> = {
    correoEnviado: false,
    correoRhProcesando: deleteField(),
    reintentarCorreoRh: true,
    pdfIntentos: 0,
    updatedAt: serverTimestamp(),
  };

  if (!solicitud.pdfStoragePath) {
    patch.pdfGenerado = false;
    patch.pdfStoragePath = deleteField();
    patch.pdfProcesando = deleteField();
  }

  await updateDoc(doc(db, 'solicitudesVacaciones', solicitud.id), patch);
}
