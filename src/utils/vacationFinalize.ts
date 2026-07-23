import { deleteField, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { SolicitudVacacionesDoc } from './vacationWorkflow';

/**
 * Pide al servidor (Cloud Function onVacacionAprobadaFinal) que regenere el PDF
 * (si falló) y/o reenvíe el correo a RH.
 */
export async function requestVacationRhEmailRetry(solicitud: SolicitudVacacionesDoc): Promise<void> {
  if (!solicitud.id) {
    throw new Error('Falta el id de la solicitud.');
  }
  if (solicitud.estado !== 'aprobada') {
    throw new Error('La solicitud debe estar aprobada para reenviar el correo.');
  }

  const debeRegenerarPdf = !solicitud.pdfStoragePath || Boolean(solicitud.pdfError);

  const patch: Record<string, unknown> = {
    correoEnviado: false,
    correoRhProcesando: deleteField(),
    reintentarCorreoRh: true,
    pdfIntentos: 0,
    pdfError: deleteField(),
    updatedAt: serverTimestamp(),
  };

  if (debeRegenerarPdf) {
    patch.pdfGenerado = false;
    patch.pdfStoragePath = deleteField();
    patch.pdfProcesando = deleteField();
  }

  await updateDoc(doc(db, 'solicitudesVacaciones', solicitud.id), patch);
}
