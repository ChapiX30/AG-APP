/** Extrae título/cuerpo/tag/meta de un payload FCM. */
import { getNotifTipoMeta } from './notificationMeta';
import { registerMessagingSW } from './firebase';

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

/** Tras esto el toast de Windows se oculta solo (sigue en el centro de actividades). */
const AUTO_CLOSE_MS = 8_000;

export function buildNotificationOptions(parsed: ReturnType<typeof parseFcmDisplayPayload>) {
  const high = parsed.urgency === 'high';
  return {
    body: parsed.body,
    icon: '/notification-icon.png',
    badge: '/notification-icon.png',
    // Tag único: si se reusa, Windows a menudo no vuelve a mostrar el toast.
    tag: `${parsed.tag || 'ag-aviso'}-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    vibrate: high ? [180, 80, 180] : [160, 70, 160],
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
      { action: 'open', title: parsed.actionOpen || 'Abrir' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };
}

/** Toast de Windows (como el de AG App con Abrir Drive / Descartar). */
export async function showOsPushNotification(
  title: string,
  options: ReturnType<typeof buildNotificationOptions>,
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const closeLater = (reg: ServiceWorkerRegistration, tag?: string) => {
    if (!tag) return;
    window.setTimeout(() => {
      void reg.getNotifications({ tag }).then((list) => list.forEach((n) => n.close()));
    }, AUTO_CLOSE_MS);
  };

  const trySw = async (reg: ServiceWorkerRegistration) => {
    await reg.showNotification(title, options as NotificationOptions);
    closeLater(reg, options.tag);
  };

  try {
    const fcmReg = await registerMessagingSW();
    if (fcmReg) {
      await trySw(fcmReg);
      return;
    }
  } catch (e) {
    console.warn('[push] FCM SW showNotification:', e);
  }

  try {
    if ('serviceWorker' in navigator) {
      await trySw(await navigator.serviceWorker.ready);
      return;
    }
  } catch (e) {
    console.warn('[push] ready SW showNotification:', e);
  }

  try {
    const { actions: _a, vibrate: _v, ...rest } = options;
    const n = new Notification(title, rest as NotificationOptions);
    window.setTimeout(() => n.close(), AUTO_CLOSE_MS);
  } catch (e) {
    console.warn('[push] Notification fallback:', e);
  }
}
