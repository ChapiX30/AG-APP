/**
 * Guardados en segundo plano persistidos en localStorage.
 * Evita perder el trabajo si se cierra/recarga la app antes de terminar el upload.
 */

export const PENDING_SAVES_KEY = "ag_pending_background_saves";

export interface PersistedBackgroundSaveJob {
  id: string;
  timestamp: number;
  state: Record<string, unknown>;
  electricalValues: Record<string, { patron: string; instrumento: string }>;
  localExc: { p1: string; p2: string; p3: string; p4: string; p5: string };
  user: { id?: string; name?: string; email?: string } | null;
  worksheetId?: string;
  magnitudConsecutivo?: string;
}

export function getPendingSaves(): PersistedBackgroundSaveJob[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SAVES_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePendingList(list: PersistedBackgroundSaveJob[]): void {
  try {
    localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[PendingSaves] No se pudo persistir:", e);
  }
}

export function addPendingSave(job: PersistedBackgroundSaveJob): void {
  const list = getPendingSaves().filter((j) => j.id !== job.id);
  list.push(job);
  savePendingList(list);
}

export function removePendingSave(id: string): void {
  savePendingList(getPendingSaves().filter((j) => j.id !== id));
}

export function getPendingSaveCount(): number {
  return getPendingSaves().length;
}
