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
        new Notification(title, {
          body,
          icon: '/bell.png',
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
