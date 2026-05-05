// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCOsmnfM950uNrUnCjQsRtAc2jiUESYxqI",
    authDomain: "agg1-b7f40.firebaseapp.com",
    projectId: "agg1-b7f40",
    storageBucket: "agg1-b7f40.firebasestorage.app",
    messagingSenderId: "985878845659",
    appId: "1:985878845659:web:6639e7da9d82ffcaae94fe",
});

const messaging = firebase.messaging();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formatea una fecha "YYYY-MM-DD" a texto legible en español.
 * Si no viene, devuelve cadena vacía.
 */
function formatFecha(fechaStr) {
    if (!fechaStr) return '';
    try {
        const [y, m, d] = fechaStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const diff = Math.ceil((date - hoy) / 86400000);
        if (diff === 0) return 'Hoy';
        if (diff === 1) return 'Mañana';
        if (diff === -1) return 'Ayer';
        return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
        return fechaStr;
    }
}

/**
 * Elige el ícono/badge según tipo de notificación.
 */
function resolveIcon(type) {
    const icons = {
        error:   '/icons/notif-error.png',
        warning: '/icons/notif-warning.png',
        success: '/icons/notif-success.png',
    };
    return icons[type] || '/icons/notif-info.png';
}

// ─── Notificación en SEGUNDO PLANO / PANTALLA BLOQUEADA / APP CERRADA ─────────
messaging.onBackgroundMessage(function (payload) {
    console.log('[SW] Mensaje en segundo plano:', payload);

    const notif = payload?.notification || {};
    const data  = payload?.data        || {};

    // ── Textos ────────────────────────────────────────────────────────────────
    const title  = notif.title || data.title || 'AG Solutions';
    const type   = data.type  || 'info';

    // Cuerpo enriquecido con datos del servicio
    const lineas = [];
    if (notif.body || data.body) lineas.push(notif.body || data.body);
    if (data.cliente)            lineas.push(`🏢 ${data.cliente}`);
    if (data.fecha)              lineas.push(`📅 ${formatFecha(data.fecha)}${data.horaInicio ? ' · ' + data.horaInicio : ''}`);
    if (data.tipo)               lineas.push(`🔧 ${data.tipo.charAt(0).toUpperCase() + data.tipo.slice(1)}`);
    const body = lineas.join('\n') || 'Tienes un nuevo aviso';

    // ── Configuración de la notificación ─────────────────────────────────────
    const notificationOptions = {
        body,
        icon:    resolveIcon(type),
        badge:   '/icons/badge-mono.png',   // ícono monocromático para la barra de estado de Android
        image:   data.imageUrl || undefined, // imagen grande opcional (banner)

        // "tag" agrupa notificaciones del mismo servicio (no se duplican)
        tag:      data.serviceId ? `servicio-${data.serviceId}` : (data.notifId || 'ag-notif'),
        renotify: true,   // suena aunque el tag ya exista

        data,
        vibrate:  [300, 100, 300, 100, 200],   // patrón distintivo
        timestamp: data.timestamp ? Number(data.timestamp) : Date.now(),

        // Permanece hasta que el usuario la toca (especialmente útil en error)
        requireInteraction: type === 'error' || type === 'warning',

        // Acciones (máx 2 en Android Chrome)
        actions: [
            { action: 'open',    title: '📂 Ver servicio' },
            { action: 'dismiss', title: '✖ Descartar'    },
        ],

        // Datos extra para el click handler
        silent: false,
    };

    return self.registration.showNotification(title, notificationOptions);
});

// ─── Click en la notificación ─────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const data = event.notification.data || {};

    // Si tenemos el ID del servicio, navegamos directo a él
    const path = data.serviceId
        ? `/servicios?id=${data.serviceId}`
        : (data.url || '/servicios');

    const urlToOpen = self.location.origin + path;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Si ya hay una pestaña abierta de la app, la enfocamos
            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    client.focus();
                    // Enviamos mensaje a la app para que navegue al servicio
                    if (data.serviceId) {
                        client.postMessage({ type: 'NAVIGATE_TO_SERVICE', serviceId: data.serviceId });
                    }
                    return;
                }
            }
            // Si no hay pestaña abierta, abrimos una nueva
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});

// ─── Notificación de prueba al instalar el SW (opcional, útil para debug) ────
self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(clients.claim());
});