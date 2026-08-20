import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useNavigation } from './useNavigation';
import { registerFcmToken } from '../utils/fcmTokenStorage';
import { screenFromPushUrl, screenFromNotifTipo } from '../utils/notificationMeta';
import { showInAppPushToast } from '../components/PushInAppToast';

/** Push FCM nativo en Android (APK). No afecta el flujo web. */
export function useNativePushNotifications(uid: string, email: string) {
  const { navigateTo } = useNavigation();

  useEffect(() => {
    if (!uid) return;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    let active = true;
    const listeners: { remove: () => Promise<void> }[] = [];

    const resolveScreen = (data: Record<string, unknown>) => {
      const screen =
        (typeof data.screen === 'string' && data.screen) ||
        screenFromPushUrl(typeof data.url === 'string' ? data.url : undefined) ||
        screenFromNotifTipo(typeof data.tipo === 'string' ? data.tipo : undefined);
      return screen || null;
    };

    const setup = async () => {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') {
        console.warn('Push Android: permiso de notificaciones denegado.');
        return;
      }

      // Canales modernos (Android 8+)
      try {
        await PushNotifications.createChannel({
          id: 'ag_alerts',
          name: 'Avisos AG',
          description: 'Notificaciones operativas del laboratorio',
          importance: 4,
          visibility: 1,
          vibration: true,
        });
        await PushNotifications.createChannel({
          id: 'ag_alerts_high',
          name: 'Avisos urgentes AG',
          description: 'Asignaciones, revisiones y alertas prioritarias',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
      } catch (e) {
        console.warn('No se pudieron crear canales Android:', e);
      }

      listeners.push(
        await PushNotifications.addListener('registration', async (token) => {
          if (!active) return;
          try {
            await registerFcmToken(uid, email || null, token.value, 'android');
          } catch (e) {
            console.warn('No se pudo guardar token FCM Android:', e);
          }
        })
      );

      listeners.push(
        await PushNotifications.addListener('registrationError', (err) => {
          console.warn('FCM Android registration error:', err);
        })
      );

      listeners.push(
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          if (!active) return;
          const data = (notification.data || {}) as Record<string, unknown>;
          const title = notification.title || String(data.title || 'Aviso AG');
          const body = notification.body || String(data.body || '');
          const screen = resolveScreen(data);
          showInAppPushToast(title, body, () => {
            if (screen) navigateTo(screen);
          });
        })
      );

      listeners.push(
        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = (action.notification.data || {}) as Record<string, unknown>;
          const screen = resolveScreen(data);
          if (screen) navigateTo(screen);
        })
      );

      await PushNotifications.register();
    };

    setup().catch((e) => console.warn('Push Android setup:', e));

    return () => {
      active = false;
      listeners.forEach((l) => {
        l.remove().catch(() => {});
      });
    };
  }, [uid, email, navigateTo]);
}
