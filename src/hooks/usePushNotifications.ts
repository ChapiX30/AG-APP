import { useEffect } from 'react';
import { getFcmToken, onForegroundMessage } from '../utils/firebase';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';

export function usePushNotifications(uid: string, email: string) {
    useEffect(() => {
        if (!uid) return;

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        (async () => {
            const vapidKey = 'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';
            const token = await getFcmToken(vapidKey);
            if (token) {
                // Guardamos el token en un MAPA para soportar múltiples dispositivos (PC, Celular, etc)
                await setDoc(doc(db, 'usuarios', uid), {
                    fcmTokens: { [token]: true }, // Usamos objeto para merge automático
                    fcmToken: token, // Retrocompatibilidad
                    email: email || null,
                    lastTokenUpdate: new Date().toISOString()
                }, { merge: true });

                localStorage.setItem('fcmToken', token);
            }
        })();

        onForegroundMessage((payload) => {
            console.log("Primer plano:", payload);
            if (Notification.permission === 'granted') {
                new Notification(payload?.notification?.title || 'Aviso AG', {
                    body: payload?.notification?.body,
                    icon: '/bell.png',
                });
            }
        });
    }, [uid, email]);
}