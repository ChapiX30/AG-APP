// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getFcmToken, onForegroundMessage } from '../utils/firebase';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';

export function usePushNotifications(uid: string, email: string) {
    useEffect(() => {
        if (!uid && !email) return;
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { });
        }
        (async () => {
            const vapidKey = 'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';
            if (!vapidKey) return;
            const token = await getFcmToken(vapidKey);
            if (token) {
                await setDoc(doc(db, 'usuarios', uid), { fcmToken: token, email: email || null }, { merge: true });
                localStorage.setItem('fcmToken', token);
            }
        })();
        onForegroundMessage((payload) => {
            // Aquí puedes mostrar un toast/banner visual
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(payload?.notification?.title || 'Notificación', {
                    body: payload?.notification?.body,
                    icon: '/bell.png',
                });
            }
        });
    }, [uid, email]);
}
