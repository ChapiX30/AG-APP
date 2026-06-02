import { differenceInDays, parseISO, isValid } from 'date-fns';
import { COLLECTION_PATRONES } from './patronLink';

export { COLLECTION_PATRONES };

/** Días antes del vencimiento en los que se genera aviso (fijo; ampliable vía userPrefs.patronAlertDays). */
export const PATRON_ALERT_DAYS = [30, 15, 7, 3, 1] as const;

export type PatronUrgency = 'vencido' | 'urgente7' | 'proximo30' | 'ok' | 'sin-fecha';

export interface PatronCalibracionRow {
  id?: string;
  noControl: string;
  descripcion?: string;
  nombre?: string;
  marca?: string;
  modelo?: string;
  fecha?: string;
  fechaVencimiento?: string;
  estadoProceso?: string;
}

export function getPatronFechaVencimiento(item: PatronCalibracionRow): string {
  return item.fecha || item.fechaVencimiento || '';
}

export function getPatronUrgency(item: PatronCalibracionRow, refDate = new Date()): PatronUrgency {
  const f = getPatronFechaVencimiento(item);
  if (!f) return 'sin-fecha';
  try {
    const parsed = parseISO(f);
    if (!isValid(parsed)) return 'sin-fecha';
    const days = differenceInDays(parsed, refDate);
    if (days < 0) return 'vencido';
    if (days <= 7) return 'urgente7';
    if (days <= 30) return 'proximo30';
    return 'ok';
  } catch {
    return 'sin-fecha';
  }
}

export function getPatronUrgencyHex(urgency: PatronUrgency): string {
  switch (urgency) {
    case 'vencido':
      return '#dc2626';
    case 'urgente7':
      return '#ea580c';
    case 'proximo30':
      return '#f59e0b';
    case 'ok':
      return '#10b981';
    default:
      return '#94a3b8';
  }
}

export function getPatronUrgencyLabel(urgency: PatronUrgency): string {
  switch (urgency) {
    case 'vencido':
      return 'Vencido';
    case 'urgente7':
      return '≤7 días';
    case 'proximo30':
      return '≤30 días';
    case 'ok':
      return 'Al día';
    default:
      return 'Sin fecha';
  }
}

/** Patrón que requiere atención de calidad (vencido, ≤30 días o día de aviso configurado). */
export function isPatronEnAlerta(
  item: PatronCalibracionRow,
  refDate = new Date(),
  alertDays: readonly number[] = PATRON_ALERT_DAYS,
): boolean {
  const urgency = getPatronUrgency(item, refDate);
  if (urgency === 'vencido' || urgency === 'urgente7' || urgency === 'proximo30') return true;
  const f = getPatronFechaVencimiento(item);
  if (!f) return false;
  try {
    const parsed = parseISO(f);
    if (!isValid(parsed)) return false;
    const days = differenceInDays(parsed, refDate);
    return alertDays.includes(days);
  } catch {
    return false;
  }
}

export function countPatronesEnAlerta(
  patrones: PatronCalibracionRow[],
  alertDays: readonly number[] = PATRON_ALERT_DAYS,
): number {
  return patrones.filter(p => isPatronEnAlerta(p, new Date(), alertDays)).length;
}

export function sortPatronesPorVencimiento(patrones: PatronCalibracionRow[]): PatronCalibracionRow[] {
  return [...patrones].sort((a, b) => {
    const fa = getPatronFechaVencimiento(a) || '9999-12-31';
    const fb = getPatronFechaVencimiento(b) || '9999-12-31';
    return fa.localeCompare(fb);
  });
}

export function isCalidadRole(puestoOrRole: string | undefined): boolean {
  const p = (puestoOrRole || '').toLowerCase();
  return p.includes('calidad') || p.includes('admin') || p.includes('gerente');
}

const PATRON_PANEL_DISMISS_KEY = 'calendarPatronPanelDismiss';

type PatronPanelDismissState = {
  dismissedAt: string;
  anchorPatronKey: string;
  anchorDaysToExpiry: number;
};

/** Patrón en alerta más próximo a vencer (el que define cuándo volver a mostrar el panel). */
export function getNearestPatronEnAlerta(
  patrones: PatronCalibracionRow[],
  refDate = new Date(),
): { patron: PatronCalibracionRow; fecha: string; daysToExpiry: number } | null {
  const sorted = sortPatronesPorVencimiento(
    patrones.filter(p => {
      const u = getPatronUrgency(p, refDate);
      return u !== 'ok' && u !== 'sin-fecha';
    }),
  );
  if (!sorted.length) return null;
  const patron = sorted[0];
  const fecha = getPatronFechaVencimiento(patron);
  let daysToExpiry = 9999;
  try {
    const parsed = parseISO(fecha);
    if (isValid(parsed)) daysToExpiry = differenceInDays(parsed, refDate);
  } catch {
    /* ignore */
  }
  return { patron, fecha, daysToExpiry };
}

function readPatronPanelDismiss(): PatronPanelDismissState | null {
  try {
    const raw = localStorage.getItem(PATRON_PANEL_DISMISS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PatronPanelDismissState;
  } catch {
    return null;
  }
}

/** Guarda cierre del panel (X) ligado al patrón más urgente actual. */
export function savePatronPanelDismiss(patrones: PatronCalibracionRow[]): void {
  const nearest = getNearestPatronEnAlerta(patrones);
  if (!nearest) return;
  const state: PatronPanelDismissState = {
    dismissedAt: refDateYmd(new Date()),
    anchorPatronKey: `${nearest.patron.noControl}|${nearest.fecha}`,
    anchorDaysToExpiry: nearest.daysToExpiry,
  };
  try {
    localStorage.setItem(PATRON_PANEL_DISMISS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function refDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * ¿Mostrar panel de vencimientos? Vuelve a aparecer si cambió el patrón más urgente,
 * pasó un día, o se cruzó un umbral de aviso (30, 15, 7, 3, 1 días antes).
 */
export function shouldShowPatronVencimientosPanel(
  patrones: PatronCalibracionRow[],
  alertDays: readonly number[] = PATRON_ALERT_DAYS,
): boolean {
  const nearest = getNearestPatronEnAlerta(patrones);
  if (!nearest) return false;

  const stored = readPatronPanelDismiss();
  if (!stored) return true;

  const today = refDateYmd(new Date());
  const anchorKey = `${nearest.patron.noControl}|${nearest.fecha}`;

  if (stored.anchorPatronKey !== anchorKey) return true;
  if (stored.dismissedAt !== today) return true;

  const crossedAlertDay = alertDays.some(
    day => stored.anchorDaysToExpiry > day && nearest.daysToExpiry <= day,
  );
  if (crossedAlertDay) return true;

  if (stored.anchorDaysToExpiry > 7 && nearest.daysToExpiry <= 7) return true;
  if (stored.anchorDaysToExpiry > 0 && nearest.daysToExpiry < 0) return true;

  return false;
}

export function clearPatronPanelDismiss(): void {
  try {
    localStorage.removeItem(PATRON_PANEL_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
