// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFcmToken, onForegroundMessage } from '../utils/firebase';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { toast } from 'react-toastify';

// ─── Íconos por tipo para el toast in-app ────────────────────────────────────
const TYPE_ICONS: Record<string, string> = {
    info:    '🔵',
    warning: '⚠️',
    success: '✅',
    error:   '🚨',
};

// ─── Etiquetas de tipo para el toast in-app ───────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
    asignacion: '🗓️ Nueva asignación',
    info:       '🔵 Aviso',
    warning:    '⚠️ Advertencia',
    success:    '✅ Completado',
    error:      '🚨 Error',
};

export function usePushNotifications(uid: string, email: string) {
    useEffect(() => {
        if (!uid && !email) return;

        // Pedir permiso si aún no se ha decidido
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { /* silently ignore */ });
        }

        (async () => {
            const vapidKey = 'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';
            if (!vapidKey) return;

            // Registrar el Service Worker explícitamente para poder pasárselo a FCM
            let swRegistration: ServiceWorkerRegistration | undefined;
            if ('serviceWorker' in navigator) {
                try {
                    swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                } catch (err) {
                    console.warn('[Push] Error registrando SW:', err);
                }
            }

            const token = await getFcmToken(vapidKey, swRegistration);
            if (token) {
                // Guardamos el token como mapa { token: true } para soportar
                // múltiples dispositivos por usuario (PC + celular + tablet)
                await setDoc(doc(db, 'usuarios', uid), {
                    fcmTokens:    { [token]: true },
                    fcmToken:     token,           // compatibilidad con campo original
                    email:        email || null,
                    notifEnabled: true,
                }, { merge: true });

                localStorage.setItem('fcmToken', token);
            }

            // ─── Escucha mensajes del SW (ej: navegación directa a servicio) ──
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data?.type === 'NAVIGATE_TO_SERVICE') {
                        // Emite evento global para que la app reaccione (ej: abrir modal)
                        window.dispatchEvent(
                            new CustomEvent('ag:navigate-to-service', {
                                detail: { serviceId: event.data.serviceId }
                            })
                        );
                    }
                });
            }
        })();

        // ─── Mensajes cuando la app está en PRIMER PLANO ─────────────────────
        // En primer plano FCM NO muestra notificación nativa automáticamente,
        // así que la mostramos como toast in-app enriquecido.
        onForegroundMessage((payload) => {
            console.log('[Push] Mensaje en primer plano:', payload);

            const notif = payload?.notification || {};
            const data  = (payload?.data || {}) as Record<string, string>;

            const type   = data.type || 'info';
            const icon   = TYPE_ICONS[type]   || '🔔';
            const label  = TYPE_LABELS[type]  || TYPE_LABELS['info'];
            const title  = notif.title || data.title || 'AG Solutions';
            const body   = notif.body  || data.body  || '';

            // Construimos un mensaje compacto pero informativo
            const lineas: string[] = [`${label}: ${title}`];
            if (body)            lineas.push(body);
            if (data.cliente)    lineas.push(`🏢 ${data.cliente}`);
            if (data.fecha)      lineas.push(`📅 ${data.fecha}${data.horaInicio ? ' · ' + data.horaInicio : ''}`);

            const msg = lineas.join('\n');

            const toastOptions = {
                style: { whiteSpace: 'pre-line' as const },
            };

            switch (type) {
                case 'error':      toast.error(msg,   { ...toastOptions, autoClose: 9000 }); break;
                case 'warning':    toast.warning(msg, { ...toastOptions, autoClose: 7000 }); break;
                case 'success':    toast.success(msg, { ...toastOptions, autoClose: 5000 }); break;
                case 'asignacion': toast.info(msg,    { ...toastOptions, autoClose: 7000 }); break;
                default:           toast.info(msg,    { ...toastOptions, autoClose: 5000 }); break;
            }
        });
    }, [uid, email]);
}