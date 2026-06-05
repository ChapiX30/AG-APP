import { APP_UPDATES, type AppUpdate } from '../config/appUpdates';

const STORAGE_KEY = 'app-updates-seen';
const WIDGET_HIDDEN_KEY = 'novedades-widget-hidden';

type SeenByUser = Record<string, string[]>;

function readAllSeen(): SeenByUser {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenByUser;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllSeen(data: SeenByUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getSeenUpdateIds(uid: string): string[] {
  if (!uid) return [];
  return readAllSeen()[uid] ?? [];
}

export function markUpdateSeen(uid: string, updateId: string): void {
  if (!uid || !updateId) return;
  const all = readAllSeen();
  const seen = new Set(all[uid] ?? []);
  seen.add(updateId);
  all[uid] = [...seen];
  writeAllSeen(all);
}

function userMatchesRoles(user: { role?: string; puesto?: string }, roles?: string[]): boolean {
  if (!roles?.length) return true;
  const haystack = `${user.role ?? ''} ${user.puesto ?? ''}`.toLowerCase();
  return roles.some((r) => haystack.includes(r.toLowerCase()));
}

function resolveUpdates(allUpdates?: AppUpdate[]): AppUpdate[] {
  return allUpdates ?? APP_UPDATES;
}

/** Actualizaciones pendientes para el usuario, de la más reciente a la más antigua. */
export function getPendingUpdates(
  uid: string,
  user?: { role?: string; puesto?: string } | null,
  allUpdates?: AppUpdate[],
): AppUpdate[] {
  if (!uid) return [];
  const seen = new Set(getSeenUpdateIds(uid));
  return resolveUpdates(allUpdates).filter(
    (u) => !seen.has(u.id) && userMatchesRoles(user ?? {}, u.roles),
  );
}

/** La novedad más reciente que el usuario aún no ha visto. */
export function getNextPendingUpdate(
  uid: string,
  user?: { role?: string; puesto?: string } | null,
  allUpdates?: AppUpdate[],
): AppUpdate | null {
  return getPendingUpdates(uid, user, allUpdates)[0] ?? null;
}

/** Todas las novedades visibles para el usuario (más reciente primero). */
export function getUpdatesForUser(
  uid: string,
  user?: { role?: string; puesto?: string } | null,
  allUpdates?: AppUpdate[],
): AppUpdate[] {
  if (!uid) return [];
  return resolveUpdates(allUpdates).filter((u) => userMatchesRoles(user ?? {}, u.roles));
}

export function getUnreadUpdateCount(
  uid: string,
  user?: { role?: string; puesto?: string } | null,
  allUpdates?: AppUpdate[],
): number {
  return getPendingUpdates(uid, user, allUpdates).length;
}

type WidgetHiddenByUser = Record<string, boolean>;

function readWidgetHidden(): WidgetHiddenByUser {
  try {
    const raw = localStorage.getItem(WIDGET_HIDDEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WidgetHiddenByUser;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWidgetHidden(data: WidgetHiddenByUser): void {
  try {
    localStorage.setItem(WIDGET_HIDDEN_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function isNovedadesWidgetHidden(uid: string): boolean {
  if (!uid) return false;
  return !!readWidgetHidden()[uid];
}

export function setNovedadesWidgetHidden(uid: string, hidden: boolean): void {
  if (!uid) return;
  const all = readWidgetHidden();
  if (hidden) all[uid] = true;
  else delete all[uid];
  writeWidgetHidden(all);
}
