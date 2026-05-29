import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface NotificarPrestamoPatronParams {
  patronId: string;
  noControl: string;
  descripcion: string;
  tecnicoNombre: string;
  tecnicoUid?: string | null;
  autorNombre?: string;
  autorUid?: string;
}

async function getCalidadDestinatarios(): Promise<string[]> {
  const usersSnap = await getDocs(collection(db, 'usuarios'));
  const destinatarios = usersSnap.docs
    .filter((d) => {
      const rol = String(d.data().role || d.data().puesto || '').toLowerCase();
      return (
        rol.includes('calidad') ||
        rol.includes('quality') ||
        rol.includes('admin') ||
        rol.includes('gerente')
      );
    })
    .map((d) => d.id);

  return destinatarios.length > 0 ? destinatarios : usersSnap.docs.map((d) => d.id);
}

/** Resuelve uid de usuario por nombre (name / nombre). */
export async function resolveUsuarioUidByNombre(nombre: string): Promise<string | null> {
  const normalized = (nombre || '').trim().toLowerCase();
  if (!normalized) return null;

  const usersSnap = await getDocs(collection(db, 'usuarios'));
  const match = usersSnap.docs.find((d) => {
    const n = String(d.data().name || d.data().nombre || '')
      .trim()
      .toLowerCase();
    return n === normalized;
  });

  return match?.id ?? null;
}

/**
 * Notifica al técnico (recordatorio de devolución) y a calidad (solicitar devolución)
 * cuando un patrón sale a planta.
 */
export async function notificarPrestamoPatronEnPlanta(
  params: NotificarPrestamoPatronParams
): Promise<void> {
  const {
    patronId,
    noControl,
    descripcion,
    tecnicoNombre,
    tecnicoUid,
    autorNombre = 'Sistema',
    autorUid = '',
  } = params;

  const safePatron = (patronId || noControl || 'patron').replace(/\//g, '_');
  const equipoLabel = `${descripcion || 'Patrón'} (${noControl || '—'})`;

  const tecnicoUidResolved =
    tecnicoUid || (await resolveUsuarioUidByNombre(tecnicoNombre));

  if (tecnicoUidResolved) {
    const titleTecnico = 'Patrón en planta — devolución pendiente';
    const bodyTecnico = `Tienes asignado ${equipoLabel}. Recuerda devolverlo al laboratorio cuando termines.`;

    await setDoc(
      doc(db, 'notificaciones', `prestamo_tecnico_${safePatron}_${tecnicoUidResolved}`),
      {
        type: 'warning',
        title: titleTecnico,
        body: bodyTecnico,
        destinatarios: [tecnicoUidResolved],
        readBy: [],
        timestamp: serverTimestamp(),
        autorNombre,
        autorUid,
        leido: false,
        fecha: new Date().toISOString(),
        tipo: 'prestamo_patron_tecnico',
        patronId: safePatron,
        noControl,
        tecnicoNombre,
        fcmSent: false,
      },
      { merge: true }
    );
  }

  const destinatariosCalidad = await getCalidadDestinatarios();
  if (destinatariosCalidad.length === 0) return;

  const titleCalidad = 'Patrón en planta — solicitar devolución';
  const bodyCalidad = `${tecnicoNombre} retiró ${equipoLabel}. Solicita su devolución cuando corresponda.`;

  await setDoc(
    doc(db, 'notificaciones', `prestamo_calidad_${safePatron}`),
    {
      type: 'info',
      title: titleCalidad,
      body: bodyCalidad,
      destinatarios: destinatariosCalidad,
      readBy: [],
      timestamp: serverTimestamp(),
      autorNombre,
      autorUid,
      leido: false,
      fecha: new Date().toISOString(),
      tipo: 'prestamo_patron_calidad',
      patronId: safePatron,
      noControl,
      tecnicoNombre,
      fcmSent: false,
    },
    { merge: true }
  );
}

/** Alias usado en pantallas de calibración/préstamo. */
export const notificarPrestamoPatronPlanta = notificarPrestamoPatronEnPlanta;
