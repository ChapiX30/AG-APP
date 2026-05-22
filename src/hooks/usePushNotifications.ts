import { useEffect } from 'react';
import { getFcmToken, subscribeForegroundMessage } from '../utils/firebase';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { parseFcmDisplayPayload } from '../utils/pushNotificationDisplay';

export function usePushNotifications(uid: string, email: string) {
    useEffect(() => {
        if (!uid) return;

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        let unsubscribeForeground: (() => void) | undefined;

        (async () => {
            const vapidKey = 'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';
            const token = await getFcmToken(vapidKey);
            if (token) {
                const prev = localStorage.getItem('fcmToken');
                const fcmTokens: Record<string, boolean> = { [token]: true };
                if (prev && prev !== token) {
                    fcmTokens[prev] = false;
                }
                await setDoc(doc(db, 'usuarios', uid), {
                    fcmTokens,
                    fcmToken: token,
                    email: email || null,
                    lastTokenUpdate: new Date().toISOString(),
                }, { merge: true });
                localStorage.setItem('fcmToken', token);
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