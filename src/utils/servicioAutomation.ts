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

type ServicioDocMatch = { id: string; data: Record<string, unknown> };

const ESTADOS_EXCLUIDOS_SYNC = new Set(['finalizado', 'cancelado', 'reprogramacion', 'reprogramado']);

/** yyyy-MM-dd — misma normalización que TV / calendario */
export function normalizeServicioFecha(fecha?: string): string {
  return (fecha || '').trim().slice(0, 10);
}

export function normalizeClienteNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isServicioActivoParaSync(estado?: string): boolean {
  const key = (estado || '').toLowerCase();
  return !ESTADOS_EXCLUIDOS_SYNC.has(key);
}

function clienteNombreDesdeDoc(data: Record<string, unknown>): string {
  return String(data.cliente || data.empresa || '');
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

async function queryServiciosPorClienteId(
  fecha: string,
  clienteId: string
): Promise<ServicioDocMatch[]> {
  const snap = await getDocs(
    query(
      collection(db, 'servicios'),
      where('clienteId', '==', clienteId),
      where('fecha', '==', fecha)
    )
  );
  return snap.docs
    .filter((d) => isServicioActivoParaSync(d.data().estado as string | undefined))
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

async function queryServiciosPorClienteNombre(
  fecha: string,
  clienteNombre: string
): Promise<ServicioDocMatch[]> {
  const norm = normalizeClienteNombre(clienteNombre);
  const snap = await getDocs(query(collection(db, 'servicios'), where('fecha', '==', fecha)));
  return snap.docs
    .filter((d) => {
      const data = d.data();
      if (!isServicioActivoParaSync(data.estado as string | undefined)) return false;
      return normalizeClienteNombre(clienteNombreDesdeDoc(data as Record<string, unknown>)) === norm;
    })
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
}

/** Resuelve clienteId desde catálogo por nombre (fallback si solo hay texto). */
async function resolveClienteIdPorNombre(clienteNombre: string): Promise<string | undefined> {
  const norm = normalizeClienteNombre(clienteNombre);
  if (!norm) return undefined;
  const snap = await getDocs(collection(db, 'clientes'));
  for (const d of snap.docs) {
    const data = d.data();
    const candidatos = [data.nombre, data.razonSocial, data.empresa].filter(Boolean).map(String);
    if (candidatos.some((c) => normalizeClienteNombre(c) === norm)) {
      return d.id;
    }
  }
  return undefined;
}

/**
 * Busca servicios activos del día por cliente (ID o nombre).
 * Prioridad: clienteId → nombre → clienteId resuelto desde catálogo.
 */
export async function findServiciosActivosDelDia(opts: {
  fecha: string;
  clienteId?: string;
  clienteNombre?: string;
}): Promise<ServicioDocMatch[]> {
  const fecha = normalizeServicioFecha(opts.fecha);
  if (!fecha) return [];

  if (opts.clienteId?.trim()) {
    const porId = await queryServiciosPorClienteId(fecha, opts.clienteId.trim());
    if (porId.length > 0) return porId;
  }

  const nombre = opts.clienteNombre?.trim();
  if (nombre) {
    const porNombre = await queryServiciosPorClienteNombre(fecha, nombre);
    if (porNombre.length > 0) return porNombre;

    const resolvedId = await resolveClienteIdPorNombre(nombre);
    if (resolvedId) {
      const porIdResuelto = await queryServiciosPorClienteId(fecha, resolvedId);
      if (porIdResuelto.length > 0) return porIdResuelto;
    }
  }

  return [];
}

export function isSitioWorksheetRecord(data: {
  lugarCalibracion?: string;
}): boolean {
  return String(data.lugarCalibracion || '').toLowerCase().includes('sitio');
}

export function worksheetStartedAtFromRecord(data: {
  createdAt?: string;
  timestamp?: number;
}): Date {
  if (typeof data.timestamp === 'number' && data.timestamp > 0) {
    return new Date(data.timestamp);
  }
  if (data.createdAt) {
    const parsed = new Date(data.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Sincroniza inicio del servicio a partir de datos de hoja de trabajo (sitio).
 * Usar en guardado online, cola offline y recuperación desde Hoja de Servicio.
 */
export async function syncServicioInicioFromWorksheetRecord(
  data: {
    fecha?: string;
    cliente?: string;
    clienteId?: string;
    lugarCalibracion?: string;
    createdAt?: string;
    timestamp?: number;
  },
  startedAtOverride?: Date
): Promise<string[]> {
  if (!isSitioWorksheetRecord(data)) return [];

  const fecha = normalizeServicioFecha(data.fecha);
  const clienteNombre = data.cliente?.trim();
  if (!fecha || !clienteNombre) return [];

  return registerServicioInicioFromWorksheet({
    fecha,
    clienteId: data.clienteId?.trim(),
    clienteNombre,
    startedAt: startedAtOverride ?? worksheetStartedAtFromRecord(data),
  });
}

/**
 * Primera hoja de trabajo en sitio: reemplaza horaInicio con la hora real e inicia el servicio.
 */
export async function registerServicioInicioFromWorksheet(opts: {
  fecha: string;
  clienteId?: string;
  clienteNombre?: string;
  startedAt: Date;
}): Promise<string[]> {
  const servicios = await findServiciosActivosDelDia(opts);
  if (servicios.length === 0) return [];

  const horaInicio = formatHoraFin(opts.startedAt);
  const updatedIds: string[] = [];

  for (const servicio of servicios) {
    if (servicio.data.inicioRealRegistrado === true) continue;

    const estado = String(servicio.data.estado || '').toLowerCase();
    const payload: Record<string, unknown> = {
      horaInicio,
      inicioRealRegistrado: true,
      ultimaActualizacion: serverTimestamp(),
    };
    if (estado === 'programado') {
      payload.estado = 'en_proceso';
    }

    await updateDoc(doc(db, 'servicios', servicio.id), payload);
    updatedIds.push(servicio.id);
  }

  return updatedIds;
}

/** Finalizes servicio(s) after hoja de servicio is saved — match by cliente + fecha. */
export async function finalizeServicioFromHoja(opts: {
  servicioId?: string;
  clienteId?: string;
  clienteNombre?: string;
  fecha: string;
  finalizedAt: Date;
}): Promise<string[]> {
  const fecha = normalizeServicioFecha(opts.fecha);
  const horaFin = formatHoraFin(opts.finalizedAt);
  const payload = {
    estado: 'finalizado' as const,
    horaFin,
    ultimaActualizacion: serverTimestamp(),
  };

  if (opts.servicioId?.trim()) {
    try {
      await updateDoc(doc(db, 'servicios', opts.servicioId.trim()), payload);
      return [opts.servicioId.trim()];
    } catch (error) {
      console.error('[servicioAutomation] finalize by servicioId failed:', opts.servicioId, error);
    }
  }

  if (!fecha) return [];

  const servicios = await findServiciosActivosDelDia({
    fecha,
    clienteId: opts.clienteId,
    clienteNombre: opts.clienteNombre,
  });
  const updatedIds: string[] = [];

  for (const servicio of servicios) {
    await updateDoc(doc(db, 'servicios', servicio.id), payload);
    updatedIds.push(servicio.id);
  }

  return updatedIds;
}
