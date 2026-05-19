import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from './firebase';

export interface ServicioAutoItem {
  id: string;
  estado?: string;
  fecha?: string;
  horaInicio?: string;
  personas?: string[];
}

/** Combines servicio `fecha` (yyyy-MM-dd) and `horaInicio` (HH:mm) in local time. */
export function getServicioStartDate(fecha: string, horaInicio: string): Date | null {
  if (!fecha || !horaInicio) return null;
  const [year, month, day] = fecha.split('-').map(Number);
  const [hour, minute] = horaInicio.split(':').map(Number);
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/** True when assigned start time has passed and service is still scheduled. */
export function shouldAutoStartServicio(
  servicio: ServicioAutoItem,
  now: Date = new Date(),
  userId?: string
): boolean {
  if (servicio.estado !== 'programado') return false;
  if (userId && (!Array.isArray(servicio.personas) || !servicio.personas.includes(userId))) {
    return false;
  }
  const start = getServicioStartDate(servicio.fecha || '', servicio.horaInicio || '');
  if (!start) return false;
  return now.getTime() >= start.getTime();
}

/** Moves assigned `programado` services to `en_proceso` once start time is reached. */
export async function autoStartServiciosIfDue(
  servicios: ServicioAutoItem[],
  userId: string
): Promise<number> {
  if (!userId) return 0;
  const now = new Date();
  const due = servicios.filter((s) => shouldAutoStartServicio(s, now, userId));
  let updated = 0;

  for (const servicio of due) {
    try {
      await updateDoc(doc(db, 'servicios', servicio.id), {
        estado: 'en_proceso',
        ultimaActualizacion: serverTimestamp(),
      });
      updated += 1;
    } catch (error) {
      console.error('[servicioAutomation] auto-start failed:', servicio.id, error);
    }
  }

  return updated;
}

export function formatHoraFin(date: Date): string {
  return format(date, 'HH:mm');
}

/** Finalizes linked servicio(s) after hoja de servicio is saved/signed. */
export async function finalizeServicioFromHoja(opts: {
  servicioId?: string;
  clienteId?: string;
  fecha: string;
  userId: string;
  finalizedAt: Date;
}): Promise<string[]> {
  const { servicioId, clienteId, fecha, userId, finalizedAt } = opts;
  if (!userId) return [];

  const horaFin = formatHoraFin(finalizedAt);
  const payload = {
    estado: 'finalizado' as const,
    horaFin,
    ultimaActualizacion: serverTimestamp(),
  };

  if (servicioId) {
    await updateDoc(doc(db, 'servicios', servicioId), payload);
    return [servicioId];
  }

  if (!clienteId || !fecha) return [];

  const snap = await getDocs(
    query(
      collection(db, 'servicios'),
      where('clienteId', '==', clienteId),
      where('fecha', '==', fecha),
      where('personas', 'array-contains', userId)
    )
  );

  const updatedIds: string[] = [];
  for (const servicioDoc of snap.docs) {
    const estado = (servicioDoc.data().estado || '').toLowerCase();
    if (['finalizado', 'cancelado'].includes(estado)) continue;
    await updateDoc(servicioDoc.ref, payload);
    updatedIds.push(servicioDoc.id);
  }

  return updatedIds;
}
