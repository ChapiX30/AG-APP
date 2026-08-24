import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { getFcmToken, subscribeForegroundMessage } from '../utils/firebase';
import { registerFcmToken } from '../utils/fcmTokenStorage';
import {
  buildNotificationOptions,
  parseFcmDisplayPayload,
  showOsPushNotification,
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
      if (!('Notification' in window)) return;

      // Siempre intentar registrar token si hay permiso (o pedirlo).
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          /* ignore */
        }
      }

      if (Notification.permission === 'granted') {
        const token = await getFcmToken(VAPID_KEY);
        if (cancelled) return;
        if (token) {
          try {
            await registerFcmToken(uid, email || null, token, 'web');
            console.info('[push] token web registrado');
          } catch (e) {
            console.warn('[push] No se pudo guardar token FCM web:', e);
          }
        } else {
          console.warn('[push] No se obtuvo token FCM (revisa permiso / SW)');
        }
      }

      unsubscribeForeground = await subscribeForegroundMessage((payload) => {
        if (cancelled) return;
        const parsed = parseFcmDisplayPayload(payload);

        // 1) Toast de Windows (bandeja), aunque la app esté abierta.
        void showOsPushNotification(parsed.title, buildNotificationOptions(parsed));

        // 2) Respaldo visible en la app (toast simple, no tarjeta "NUEVO AVISO").
        toast(
          (t) => (
            <button
              type="button"
              className="text-left text-sm font-medium"
              onClick={() => {
                toast.dismiss(t.id);
                if (parsed.screen) navigateTo(parsed.screen as Parameters<typeof navigateTo>[0]);
              }}
            >
              <span className="block font-semibold">{parsed.title}</span>
              {parsed.body ? <span className="block opacity-80 mt-0.5 line-clamp-2">{parsed.body}</span> : null}
            </button>
          ),
          { duration: 6000, position: 'top-center' },
        );
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
