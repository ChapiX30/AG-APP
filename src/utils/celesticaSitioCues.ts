import { getAuth } from 'firebase/auth';
import { getHoyFechaLocal } from './servicioAutomation';

export type CelesticaSitioCueKey = 'hoja_herramienta' | 'permiso_tr';

export interface CelesticaSitioCueLine {
  sound: string;
  line: string;
}

export interface CelesticaSitioCueDayState {
  dismissed: boolean;
  hoja_herramienta: boolean;
  permiso_tr: boolean;
}

const STORAGE_KEY = 'celesticaSitioCues:v1';
export const CELESTICA_SITIO_CUES_EVENT = 'celestica-sitio-cues-changed';

const EMPTY_DAY: CelesticaSitioCueDayState = {
  dismissed: false,
  hoja_herramienta: false,
  permiso_tr: false,
};

export const CELESTICA_SITIO_CUE_LINES: Record<CelesticaSitioCueKey, CelesticaSitioCueLine[]> = {
  hoja_herramienta: [
    { sound: 'psst', line: 'Hoja de herramienta' },
    { sound: 'hey', line: 'arma la hoja de herramienta' },
    { sound: '¡ojo!', line: 'herramienta antes de entrar' },
    { sound: 'tic', line: 'lista de herramienta' },
  ],
  permiso_tr: [
    { sound: '¡ey!', line: 'Permiso TR' },
    { sound: 'psst', line: 'no se te vaya el Permiso TR' },
    { sound: '¡va!', line: 'Permiso TR de Celestica' },
    { sound: 'toc', line: 'permiso de trabajo' },
  ],
};

export const CELESTICA_SITIO_CUE_META: Record<
  CelesticaSitioCueKey,
  { label: string; screen: string }
> = {
  hoja_herramienta: { label: 'Herramienta', screen: 'normas' },
  permiso_tr: { label: 'Permiso TR', screen: 'permisos-trabajo' },
};

type StoredState = Record<string, Record<string, CelesticaSitioCueDayState>>;

function resolveUid(uid?: string): string {
  return uid || getAuth().currentUser?.uid || '';
}

function readAll(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(CELESTICA_SITIO_CUES_EVENT));
}

function mutateDay(
  uid: string | undefined,
  updater: (day: CelesticaSitioCueDayState) => CelesticaSitioCueDayState
): CelesticaSitioCueDayState {
  const userId = resolveUid(uid);
  const hoy = getHoyFechaLocal();
  if (!userId) return { ...EMPTY_DAY };
  const all = readAll();
  const next = updater({ ...EMPTY_DAY, ...(all[userId]?.[hoy] || {}) });
  all[userId] = { ...(all[userId] || {}), [hoy]: next };
  writeAll(all);
  return next;
}

export function getCelesticaSitioCueState(uid?: string): CelesticaSitioCueDayState {
  const userId = resolveUid(uid);
  if (!userId) return { ...EMPTY_DAY };
  return { ...EMPTY_DAY, ...(readAll()[userId]?.[getHoyFechaLocal()] || {}) };
}

export function getPendingCelesticaSitioCues(uid?: string): CelesticaSitioCueKey[] {
  const state = getCelesticaSitioCueState(uid);
  if (state.dismissed) return [];
  const pending: CelesticaSitioCueKey[] = [];
  if (!state.hoja_herramienta) pending.push('hoja_herramienta');
  if (!state.permiso_tr) pending.push('permiso_tr');
  return pending;
}

export function markCelesticaSitioCueDone(cue: CelesticaSitioCueKey, uid?: string): void {
  mutateDay(uid, (day) => ({ ...day, [cue]: true }));
}

export function dismissCelesticaSitioCuesToday(uid?: string): void {
  mutateDay(uid, (day) => ({ ...day, dismissed: true }));
}

export function pickCelesticaSitioCueLine(
  cue: CelesticaSitioCueKey,
  index: number
): CelesticaSitioCueLine {
  const lines = CELESTICA_SITIO_CUE_LINES[cue];
  return lines[((index % lines.length) + lines.length) % lines.length];
}
