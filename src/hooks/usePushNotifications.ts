import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getFcmToken, subscribeForegroundMessage } from '../utils/firebase';
import { registerFcmToken } from '../utils/fcmTokenStorage';
import { parseFcmDisplayPayload } from '../utils/pushNotificationDisplay';
import { useNativePushNotifications } from './useNativePushNotifications';

const VAPID_KEY =
  'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';

/** Web Push (PWA / navegador). Solo corre fuera del APK. */
function useWebPushNotifications(uid: string, email: string) {
  useEffect(() => {
    if (!uid) return;
    if (Capacitor.isNativePlatform()) return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    let unsubscribeForeground: (() => void) | undefined;

    (async () => {
      const token = await getFcmToken(VAPID_KEY);
      if (token) {
        try {
          await registerFcmToken(uid, email || null, token, 'web');
        } catch (e) {
          console.warn('No se pudo guardar token FCM web:', e);
        }
      }

      unsubscribeForeground = await subscribeForegroundMessage((payload) => {
        if (Notification.permission !== 'granted') return;
        if (document.visibilityState === 'hidden') return;
        const { title, body, tag } = parseFcmDisplayPayload(payload);
        // Como antes del commit "menu" (sin toast in-app ni actions rotos).
        new Notification(title, {
          body,
          icon: '/pwa-192.png',
          tag,
        });
      });
    })();

    return () => {
      unsubscribeForeground?.();
    };
  }, [uid, email]);
}

/** Registra push: web en navegador, FCM nativo en APK Android. */
export function usePushNotifications(uid: string, email: string) {
  useWebPushNotifications(uid, email);
  useNativePushNotifications(uid, email);
}

/** Activa permisos + token desde el panel de notificaciones del menú. */
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
