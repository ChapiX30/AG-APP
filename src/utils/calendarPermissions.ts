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

/** Cualquier persona asignada puede confirmar (juntas: asistencia; demás: enterado / de acuerdo). */
export const canAcknowledgeAssignedEvent = (
  user: CalendarPermissionUser,
  _eventTipo?: string,
  isAssigned?: boolean,
): boolean => Boolean(isAssigned);

type RosterUser = {
  id?: string;
  email?: string;
  correo?: string;
  nombre?: string;
  name?: string;
};

const addIdentityKey = (keys: Set<string>, value?: string | null) => {
  if (value) keys.add(String(value).toLowerCase());
};

/** Claves de identidad (id Firestore, auth uid, email/correo) para cruzar con `personas`. */
export const buildUserIdentityKeys = (
  user: CalendarPermissionUser,
  authUid?: string | null,
  usersList: RosterUser[] = [],
): Set<string> => {
  const keys = new Set<string>();
  addIdentityKey(keys, user?.id);
  addIdentityKey(keys, user?.uid);
  addIdentityKey(keys, user?.email);
  addIdentityKey(keys, user?.correo);
  addIdentityKey(keys, authUid);

  const authEmail = getCalendarUserEmail(user);
  const rosterMatch = usersList.find(
    u =>
      (authUid && u.id === authUid) ||
      (user?.id && u.id === user.id) ||
      (authEmail && getCalendarUserEmail(u as CalendarPermissionUser) === authEmail),
  );
  if (rosterMatch) {
    addIdentityKey(keys, rosterMatch.id);
    addIdentityKey(keys, rosterMatch.email);
    addIdentityKey(keys, rosterMatch.correo);
  }

  return keys;
};

export const resolvePersonaEntry = (
  personaRef: string,
  usersList: RosterUser[] = [],
): RosterUser | null =>
  usersList.find(
    u =>
      u.id === personaRef ||
      getCalendarUserEmail(u as CalendarPermissionUser) === normalizeText(personaRef) ||
      getCalendarUserName(u as CalendarPermissionUser) === normalizeText(personaRef),
  ) ?? null;

/**
 * Coincide uid de auth, id de documento usuarios, email/correo o nombre en `personas`.
 * Tolera entradas legacy (email o nombre en lugar de id).
 */
export const isUserAssignedToEvent = (
  user: CalendarPermissionUser,
  personas: string[] = [],
  authUid?: string | null,
  usersList: RosterUser[] = [],
): boolean => {
  if (!personas.length) return false;
  const keys = buildUserIdentityKeys(user, authUid, usersList);

  return personas.some(personaRef => {
    const ref = String(personaRef).toLowerCase();
    if (keys.has(ref)) return true;

    const assigned = resolvePersonaEntry(personaRef, usersList);
    if (!assigned) return false;

    const assignedKeys = buildUserIdentityKeys(assigned as CalendarPermissionUser, assigned.id, usersList);
    for (const k of keys) {
      if (assignedKeys.has(k)) return true;
    }
    return false;
  });
};

/** Id estable en Firestore para guardar en `enterados` (preferir doc usuarios sobre auth uid). */
export const resolveAckUserId = (
  user: CalendarPermissionUser,
  authUid?: string | null,
  usersList: RosterUser[] = [],
): string | null => {
  if (user?.id) return user.id;
  if (!authUid) return null;
  return usersList.find(u => u.id === authUid)?.id ?? authUid;
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
