import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { format } from 'date-fns';
import { db, storage } from './firebase';
import { generateVacationRequestPdf } from './vacationPdfGenerator';
import { enqueueVacationRhEmail } from './vacationNotify';
import type { SolicitudVacacionesDoc } from './vacationWorkflow';

/**
 * Tras la aprobación final (Jorge): genera PDF, sube a Storage y encola correo a RH.
 * No depende solo de Cloud Functions (más fiable en producción).
 */
export async function finalizeVacationAfterApproval(
  solicitud: SolicitudVacacionesDoc,
): Promise<{ storagePath: string }> {
  if (!solicitud.id) {
    throw new Error('Falta el id de la solicitud.');
  }

  const merged: SolicitudVacacionesDoc = {
    ...solicitud,
    estado: 'aprobada',
  };

  const pdfBytes = await generateVacationRequestPdf(merged);
  const fechaStamp = format(new Date(), 'yyyy-MM-dd');
  const storagePath = `vacaciones/${solicitud.id}/AG-ADM-F12_${fechaStamp}.pdf`;

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, pdfBytes, {
    contentType: 'application/pdf',
    cacheControl: 'no-cache',
  });

  await updateDoc(doc(db, 'solicitudesVacaciones', solicitud.id), {
    pdfStoragePath: storagePath,
    pdfGenerado: true,
    pdfError: null,
    correoEnviado: false,
    updatedAt: serverTimestamp(),
  });

  await enqueueVacationRhEmail({
    solicitudId: solicitud.id,
    solicitanteNombre: solicitud.solicitanteNombre,
    diasVacaciones: solicitud.diasVacaciones,
    fechaInicio: solicitud.fechaInicio,
    fechaFin: solicitud.fechaFin,
    storagePath,
  });

  return { storagePath };
}

/** Reintenta solo el correo RH si el PDF ya está en Storage. */
export async function retryVacationRhEmail(solicitud: SolicitudVacacionesDoc): Promise<void> {
  if (!solicitud.id || !solicitud.pdfStoragePath) {
    throw new Error('No hay PDF guardado para enviar.');
  }
  await enqueueVacationRhEmail({
    solicitudId: solicitud.id,
    solicitanteNombre: solicitud.solicitanteNombre,
    diasVacaciones: solicitud.diasVacaciones,
    fechaInicio: solicitud.fechaInicio,
    fechaFin: solicitud.fechaFin,
    storagePath: solicitud.pdfStoragePath,
  });
}
