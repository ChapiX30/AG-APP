import {
  normalizeServicioDateKey,
  parseDateRobust,
  toDateKey,
} from './calibrationShared';

export interface AsignacionNotificacionParams {
  titulo: string;
  cliente?: string;
  fecha?: string;
  horaInicio?: string;
}

/** Fecha legible para notificaciones: relativa + detalle (ej. "mañana, jue 21 may 2026"). */
export function formatFechaAsignacionNotificacion(fecha?: string): string {
  const key = normalizeServicioDateKey(fecha);
  if (!key) return 'fecha por definir';

  const d = parseDateRobust(key);
  if (!d) return 'fecha por definir';

  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = parseDateRobust(toDateKey(new Date()));
  const diffDays =
    today != null
      ? Math.round((target.getTime() - today.getTime()) / 86400000)
      : null;

  const detalle = target
    .toLocaleDateString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .replace(/\./g, '')
    .trim();

  if (diffDays === 0) return `hoy, ${detalle}`;
  if (diffDays === 1) return `mañana, ${detalle}`;
  if (diffDays === -1) return `ayer, ${detalle}`;
  return detalle;
}

function formatHoraInicio(horaInicio?: string): string {
  const raw = (horaInicio || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return `, ${raw}`;
  const hh = match[1].padStart(2, '0');
  return `, ${hh}:${match[2]}`;
}

/** Cuerpo de notificación de asignación a servicio (español, 1–2 oraciones). */
export function buildMensajeAsignacionServicio(
  params: AsignacionNotificacionParams
): string {
  const titulo = (params.titulo || 'Servicio').replace(/\s+/g, ' ').trim();
  const empresa = (params.cliente || 'sin cliente').replace(/\s+/g, ' ').trim() || 'sin cliente';
  const fechaTxt = formatFechaAsignacionNotificacion(params.fecha);
  const horaTxt = formatHoraInicio(params.horaInicio);
  return `Fuiste asignado a "${titulo}" en ${empresa} el ${fechaTxt}${horaTxt}.`;
}
