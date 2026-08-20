/**
 * Metadatos unificados para push (SW / FCM) e inbox in-app.
 * Una sola fuente de verdad: tipo → pantalla, urgencia, etiqueta.
 */

export type NotifUrgency = 'low' | 'normal' | 'high';

export interface NotifTipoMeta {
  screen: string;
  url: string;
  label: string;
  urgency: NotifUrgency;
  actionOpen: string;
}

const DEFAULT_META: NotifTipoMeta = {
  screen: 'menu',
  url: '/',
  label: 'Aviso',
  urgency: 'normal',
  actionOpen: 'Abrir',
};

const BY_TIPO: Record<string, NotifTipoMeta> = {
  asignacion_calidad: {
    screen: 'calendario',
    url: '/calendario',
    label: 'Asignación',
    urgency: 'high',
    actionOpen: 'Ver servicio',
  },
  revision_calidad: {
    screen: 'drive',
    url: '/drive',
    label: 'Revisión',
    urgency: 'high',
    actionOpen: 'Abrir Drive',
  },
  prestamo_patron_tecnico: {
    screen: 'control-prestamos',
    url: '/control-prestamos',
    label: 'Préstamo',
    urgency: 'normal',
    actionOpen: 'Ver préstamo',
  },
  prestamo_patron_calidad: {
    screen: 'control-prestamos',
    url: '/control-prestamos',
    label: 'Préstamo',
    urgency: 'normal',
    actionOpen: 'Ver préstamo',
  },
  vacacion_pendiente: {
    screen: 'solicitud-vacaciones',
    url: '/solicitud-vacaciones',
    label: 'Vacaciones',
    urgency: 'high',
    actionOpen: 'Revisar',
  },
  vacacion_rechazada: {
    screen: 'solicitud-vacaciones',
    url: '/solicitud-vacaciones',
    label: 'Vacaciones',
    urgency: 'high',
    actionOpen: 'Ver detalle',
  },
  vacacion_progreso: {
    screen: 'solicitud-vacaciones',
    url: '/solicitud-vacaciones',
    label: 'Vacaciones',
    urgency: 'normal',
    actionOpen: 'Ver estado',
  },
  vacacion_aprobada: {
    screen: 'solicitud-vacaciones',
    url: '/solicitud-vacaciones',
    label: 'Vacaciones',
    urgency: 'normal',
    actionOpen: 'Abrir',
  },
  aviso_global: {
    screen: 'menu',
    url: '/',
    label: 'Aviso general',
    urgency: 'normal',
    actionOpen: 'Abrir app',
  },
  recordatorio_confirmacion_junta: {
    screen: 'calendario',
    url: '/calendario',
    label: 'Junta',
    urgency: 'high',
    actionOpen: 'Confirmar',
  },
  confirmacion_asistencia: {
    screen: 'calendario',
    url: '/calendario',
    label: 'Junta',
    urgency: 'high',
    actionOpen: 'Ver junta',
  },
};

export function getNotifTipoMeta(tipo?: string | null): NotifTipoMeta {
  if (!tipo) return DEFAULT_META;
  return BY_TIPO[tipo] || DEFAULT_META;
}

/** Rutas permitidas desde push / deep link. */
export const PUSH_SCREEN_ALLOWLIST = new Set([
  'menu',
  'calendario',
  'drive',
  'solicitud-vacaciones',
  'control-prestamos',
  'friday-servicios',
  'programa-calibracion',
  'consecutivos',
]);

export function screenFromPushUrl(url?: string | null): string | null {
  if (!url) return null;
  const path = url.replace(/^\//, '').split('?')[0];
  if (!path || path === '') return 'menu';
  return PUSH_SCREEN_ALLOWLIST.has(path) ? path : null;
}

export function screenFromNotifTipo(tipo?: string | null): string | undefined {
  if (!tipo) return undefined;
  const meta = BY_TIPO[tipo];
  return meta?.screen;
}
