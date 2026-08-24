import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getFcmToken, subscribeForegroundMessage } from '../utils/firebase';
import { registerFcmToken } from '../utils/fcmTokenStorage';
import {
  buildNotificationOptions,
  parseFcmDisplayPayload,
  showSystemPushNotification,
} from '../utils/pushNotificationDisplay';
import { screenFromPushUrl } from '../utils/notificationMeta';
import { useNativePushNotifications } from './useNativePushNotifications';
import { useNavigation } from './useNavigation';

const VAPID_KEY =
  'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';

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

    (async () => {
      // Moderno: no forzar el prompt al cargar. Solo registrar token si ya hay permiso.
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') {
        const token = await getFcmToken(VAPID_KEY);
        if (cancelled) return;
        if (token) {
          try {
            await registerFcmToken(uid, email || null, token, 'web');
          } catch (e) {
            console.warn('No se pudo guardar token FCM web:', e);
          }
        }
      }

      unsubscribeForeground = await subscribeForegroundMessage((payload) => {
        if (cancelled) return;
        const parsed = parseFcmDisplayPayload(payload);
        void showSystemPushNotification(parsed.title, buildNotificationOptions(parsed));
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
