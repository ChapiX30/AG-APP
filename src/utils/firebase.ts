// src/utils/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// --- FCM (Web Push) ---
import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
    apiKey: "AIzaSyCOsmnfM950uNrUnCjQsRtAc2jiUESYxqI",
    authDomain: "agg1-b7f40.firebaseapp.com",
    projectId: "agg1-b7f40",
    storageBucket: "agg1-b7f40.firebasestorage.app",
    messagingSenderId: "985878845659",
    appId: "1:985878845659:web:6639e7da9d82ffcaae94fe",
};

const app = initializeApp(firebaseConfig);

// Exports existentes
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * Mensajería (FCM) sólo si el navegador lo soporta.
 * Usamos una promesa para evitar errores de SSR / navegadores no compatibles.
 */
export const messagingPromise = (async () => {
    try {
        const supported = await isSupported();
        return supported ? getMessaging(app) : null;
    } catch {
        return null;
    }
})();

/**
 * Registra el Service Worker de FCM.
 * Asegúrate de tener el archivo en: /public/firebase-messaging-sw.js
 */
export async function registerMessagingSW() {
    if (typeof window === "undefined") return null;
    if (!("serviceWorker" in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        return reg;
    } catch (e) {
        console.warn("No se pudo registrar el SW de FCM:", e);
        return null;
    }
}

/**
 * Obtiene el token FCM (Web Push).
 * Debes pasar tu VAPID PUBLIC KEY (Firebase Console → Cloud Messaging → Web Push certificates).
 */
export async function getFcmToken(vapidKey: string) {
    try {
        // 1) Asegura que el SW esté registrado
        await registerMessagingSW();

        // 2) Comprueba soporte y obtiene instancia de messaging
        const messaging = await messagingPromise;
        if (!messaging) return null;

        // 3) IMPORTANTE: el navegador debe tener permiso de Notificación
        if ("Notification" in window && Notification.permission === "default") {
            try { await Notification.requestPermission(); } catch { }
        }

        // 4) Obtén el token
        const token = await getToken(messaging, { vapidKey });
        return token || null;
    } catch (e) {
        console.warn("No se pudo obtener token FCM:", e);
        return null;
    }
}

/**
 * Listener para mensajes recibidos con la app en primer plano.
 * Úsalo para mostrar un banner/toast además de la notificación nativa.
 */
export async function onForegroundMessage(cb: (payload: any) => void) {
    try {
        const messaging = await messagingPromise;
        if (!messaging) return;
        onMessage(messaging, cb);
    } catch (e) {
        console.warn("onForegroundMessage error:", e);
    }
}
