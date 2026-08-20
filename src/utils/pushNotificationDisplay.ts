/** Extrae título/cuerpo/tag/meta de un payload FCM (data-only o legacy notification). */
import { getNotifTipoMeta } from './notificationMeta';

export function parseFcmDisplayPayload(payload: {
  notification?: { title?: string; body?: string };
  data?: Record<string, string | undefined>;
}) {
  const data = payload?.data || {};
  const tipo = data.tipo || '';
  const meta = getNotifTipoMeta(tipo);
  const title =
    data.title ||
    payload?.notification?.title ||
    'Aviso AG';
  const body =
    data.body ||
    payload?.notification?.body ||
    '';
  const servicioId = data.servicioId || '';
  const tag =
    data.tag ||
    (servicioId ? `${tipo || 'aviso'}-${servicioId}` : tipo || 'ag-aviso');
  const url = data.url || meta.url;
  const screen = data.screen || meta.screen;
  const urgency = (data.urgency as 'low' | 'normal' | 'high') || meta.urgency;
  const actionOpen = data.actionOpen || meta.actionOpen;
  const label = data.label || meta.label;

  return {
    title,
    body,
    servicioId,
    tag,
    tipo,
    url,
    screen,
    urgency,
    actionOpen,
    label,
  };
}

/** Opciones modernas para Notification / showNotification. */
export function buildNotificationOptions(parsed: ReturnType<typeof parseFcmDisplayPayload>) {
  const requireInteraction = parsed.urgency === 'high';
  const vibrate =
    parsed.urgency === 'high'
      ? [180, 80, 180, 80, 240]
      : parsed.urgency === 'low'
        ? [120]
        : [160, 70, 160];

  return {
    body: parsed.body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: parsed.tag,
    renotify: parsed.urgency === 'high',
    requireInteraction,
    vibrate,
    timestamp: Date.now(),
    data: {
      url: parsed.url,
      screen: parsed.screen,
      servicioId: parsed.servicioId,
      tipo: parsed.tipo,
      title: parsed.title,
      body: parsed.body,
    },
    actions: [
      { action: 'open', title: parsed.actionOpen },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };
}
