// src/utils/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// --- FCM (Web Push) ---
import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";

export const firebaseConfig = {
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

/**
 * Caché persistente (IndexedDB): al recargar no se vuelve a pagar la lectura
 * de las colecciones ya sincronizadas. Si el entorno no la soporta se usa memoria.
 */
const createDb = () => {
    try {
        return initializeFirestore(app, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
    } catch (e) {
        console.warn("Firestore sin caché persistente, se usa memoria:", e);
        return getFirestore(app);
    }
};

export const db = createDb();
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
        // Ligar el token al SW de FCM (no al de la PWA), si no el push no llega en segundo plano.
        const swReg = await registerMessagingSW();

        const messaging = await messagingPromise;
        if (!messaging) return null;

        if ("Notification" in window && Notification.permission === "default") {
            try { await Notification.requestPermission(); } catch { }
        }
        if ("Notification" in window && Notification.permission !== "granted") {
            return null;
        }

        const token = await getToken(
            messaging,
            swReg ? { vapidKey, serviceWorkerRegistration: swReg } : { vapidKey }
        );
        return token || null;
    } catch (e) {
        console.warn("No se pudo obtener token FCM:", e);
        return null;
    }
}

let foregroundUnsubscribe: (() => void) | null = null;

/**
 * Un solo listener de primer plano (evita duplicados si varios componentes montan el hook).
 * Devuelve función de limpieza para useEffect.
 */
export async function subscribeForegroundMessage(
    cb: (payload: any) => void
): Promise<() => void> {
    try {
        const messaging = await messagingPromise;
        if (!messaging) return () => {};

        if (foregroundUnsubscribe) {
            foregroundUnsubscribe();
            foregroundUnsubscribe = null;
        }

        foregroundUnsubscribe = onMessage(messaging, cb);
        return () => {
            if (foregroundUnsubscribe) {
                foregroundUnsubscribe();
                foregroundUnsubscribe = null;
            }
        };
    } catch (e) {
        console.warn("subscribeForegroundMessage error:", e);
        return () => {};
    }
}

/** @deprecated Usar subscribeForegroundMessage (retorna cleanup). */
export async function onForegroundMessage(cb: (payload: any) => void) {
    await subscribeForegroundMessage(cb);
}
