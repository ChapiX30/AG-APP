import { isCalidadRole } from './patronCalibracion';

export type CalendarPermissionUser = {
  id?: string;
  uid?: string;
  email?: string;
  correo?: string;
  nombre?: string;
  name?: string;
  displayName?: string;
  puesto?: string;
  role?: string;
  position?: string;
} | null;

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const getCalendarUserName = (user: CalendarPermissionUser): string => {
  if (!user) return '';
  return normalizeText(
    String(user.nombre || user.name || user.displayName || ''),
  );
};

export const getCalendarUserEmail = (user: CalendarPermissionUser): string => {
  if (!user) return '';
  return normalizeText(String(user.email || user.correo || ''));
};

export const getCalendarUserRole = (user: CalendarPermissionUser): string => {
  if (!user) return '';
  return normalizeText(
    String(user.puesto || user.role || user.position || ''),
  );
};

/** Edgar Amador — por nombre, email o coincidencia parcial robusta. */
export const isEdgarAmador = (user: CalendarPermissionUser): boolean => {
  const name = getCalendarUserName(user);
  const email = getCalendarUserEmail(user);
  if (!name && !email) return false;
  return (
    name === 'edgar amador' ||
    (name.includes('edgar') && name.includes('amador')) ||
    (email.includes('edgar') && (email.includes('amador') || email.includes('eaaese')))
  );
};

/** Jorge Amador — por nombre o email. */
export const isJorgeAmador = (user: CalendarPermissionUser): boolean => {
  const name = getCalendarUserName(user);
  const email = getCalendarUserEmail(user);
  if (!name && !email) return false;
  return (
    name === 'jorge amador' ||
    (name.includes('jorge') && name.includes('amador')) ||
    email.includes('jorge')
  );
};

/** Calidad, admin o gerente (misma regla que avisos de patrones). */
export const canSeeAllCalendarEvents = (user: CalendarPermissionUser): boolean =>
  isCalidadRole(getCalendarUserRole(user));

/** Edición completa del calendario: calidad/admin/gerente o Jorge (no Edgar). */
export const canEditCalendarEvents = (user: CalendarPermissionUser): boolean =>
  canSeeAllCalendarEvents(user) || isJorgeAmador(user);

/** Confirmar asistencia en juntas (Calidad / Jorge). */
export const canConfirmJuntaAsistencia = (user: CalendarPermissionUser): boolean =>
  canSeeAllCalendarEvents(user) || isJorgeAmador(user);

/**
 * Confirmación como asignado: en juntas solo Calidad/Jorge;
 * en otras actividades (p. ej. Gantt PT) también Edgar con "estar de acuerdo".
 */
export const canAcknowledgeAssignedEvent = (
  user: CalendarPermissionUser,
  eventTipo?: string,
  isAssigned?: boolean,
): boolean => {
  if (!isAssigned || !user) return false;
  if (eventTipo === 'junta') return canConfirmJuntaAsistencia(user);
  return true;
};

/** Resuelve quién creó el servicio (varios campos legacy en Firestore). */
export const getEventCreatorKeys = (event: {
  createdBy?: string;
  creadoPor?: string;
  userId?: string;
  createdByEmail?: string;
  creadoPorEmail?: string;
} | null | undefined): string[] => {
  if (!event) return [];
  return [
    event.createdBy,
    event.creadoPor,
    event.userId,
    event.createdByEmail,
    event.creadoPorEmail,
  ]
    .filter(Boolean)
    .map(s => String(s).toLowerCase());
};

export const getEventCreatorDisplay = (
  event: {
    createdBy?: string;
    creadoPor?: string;
    userId?: string;
    createdByEmail?: string;
    creadoPorEmail?: string;
    creadoPorNombre?: string;
    createdByName?: string;
  } | null | undefined,
  usersList: { id?: string; email?: string; correo?: string; nombre?: string; name?: string }[] = [],
): string | null => {
  if (!event) return null;
  if (event.creadoPorNombre || event.createdByName) {
    return event.creadoPorNombre || event.createdByName || null;
  }
  const keys = getEventCreatorKeys(event);
  if (!keys.length) return null;
  for (const key of keys) {
    const u = usersList.find(
      u =>
        String(u.id).toLowerCase() === key ||
        String(u.email || u.correo || '').toLowerCase() === key,
    );
    if (u) return u.nombre || u.name || key;
  }
  return keys[0];
};
