import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getFcmToken, registerMessagingSW, subscribeForegroundMessage } from '../utils/firebase';
import { registerFcmToken } from '../utils/fcmTokenStorage';
import {
  buildNotificationOptions,
  parseFcmDisplayPayload,
} from '../utils/pushNotificationDisplay';
import { screenFromPushUrl } from '../utils/notificationMeta';
import { useNativePushNotifications } from './useNativePushNotifications';
import { useNavigation } from './useNavigation';

const VAPID_KEY =
  'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';

/**
 * Muestra el mismo toast de Windows que en segundo plano:
 * logo AG + título + cuerpo + "Abrir Drive" / "Descartar".
 * Debe ir por Service Worker (actions no funcionan en new Notification).
 */
async function showOsPushLikeBackground(
  title: string,
  options: ReturnType<typeof buildNotificationOptions>,
) {
  if (Notification.permission !== 'granted') return;

  const opts = {
    ...options,
    // Tag único para que Windows vuelva a mostrar el toast aunque el título se repita
    tag: `${options.tag || 'ag-aviso'}-${Date.now()}`,
    renotify: true,
  };

  try {
    const fcmReg = await registerMessagingSW();
    if (fcmReg) {
      await fcmReg.showNotification(title, opts as NotificationOptions);
      return;
    }
  } catch (e) {
    console.warn('showNotification FCM SW:', e);
  }

  try {
    if ('serviceWorker' in navigator) {
      const ready = await navigator.serviceWorker.ready;
      await ready.showNotification(title, opts as NotificationOptions);
      return;
    }
  } catch (e) {
    console.warn('showNotification ready SW:', e);
  }

  // Último recurso (sin botones)
  try {
    const { actions: _a, vibrate: _v, ...rest } = opts;
    new Notification(title, rest as NotificationOptions);
  } catch (e) {
    console.warn('Notification fallback:', e);
  }
}

/** Web Push (PWA / navegador). Solo corre fuera del APK. */
function useWebPushNotifications(uid: string, email: string) {
  const { navigateTo } = useNavigation();

  useEffect(() => {
    if (!uid) return;
    if (Capacitor.isNativePlatform()) return;

    let unsubscribeForeground: (() => void) | undefined;
    let cancelled = false;

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'AG_PUSH_NAV') return;
      const screen =
        (typeof event.data.screen === 'string' && event.data.screen) ||
        screenFromPushUrl(event.data.url);
      if (screen) navigateTo(screen as Parameters<typeof navigateTo>[0]);
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    (async () => {
      const token = await getFcmToken(VAPID_KEY);
      if (cancelled) return;
      if (token) {
        try {
          await registerFcmToken(uid, email || null, token, 'web');
        } catch (e) {
          console.warn('No se pudo guardar token FCM web:', e);
        }
      }

      unsubscribeForeground = await subscribeForegroundMessage((payload) => {
        if (cancelled) return;
        // Pestaña oculta: el SW (onBackgroundMessage) pinta el mismo toast.
        if (document.visibilityState === 'hidden') return;
        const parsed = parseFcmDisplayPayload(payload);
        void showOsPushLikeBackground(parsed.title, buildNotificationOptions(parsed));
      });
    })();

    return () => {
      cancelled = true;
      unsubscribeForeground?.();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, [uid, email, navigateTo]);
}

/** Registra push: web en navegador, FCM nativo en APK Android. */
export function usePushNotifications(uid: string, email: string) {
  useWebPushNotifications(uid, email);
  useNativePushNotifications(uid, email);
}

/** Activa permisos + token desde un gesto del usuario (panel de notificaciones). */
export async function enableWebPushFromUserGesture(
  uid: string,
  email?: string | null,
): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Capacitor.isNativePlatform()) return 'unsupported';

  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') return 'denied';

  const token = await getFcmToken(VAPID_KEY);
  if (token && uid) {
    await registerFcmToken(uid, email || null, token, 'web');
  }
  return 'granted';
}
