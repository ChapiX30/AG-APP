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

function parseFcmPayload(payload) {
    const data = payload.data || {};
    return {
        title: data.title || payload?.notification?.title || 'Notificación de AG-APP',
        body: data.body || payload?.notification?.body || '',
        servicioId: data.servicioId || '',
        url: data.url || '/calendario',
    };
}

// Data-only desde Cloud Functions: una sola showNotification (evita duplicado con auto-display FCM).
messaging.onBackgroundMessage(function (payload) {
    console.log('[SW] Recibido:', payload);
    const { title, body, servicioId, url } = parseFcmPayload(payload);
    const options = {
        body,
        icon: '/bell.png',
        badge: '/bell.png',
        tag: servicioId ? `asignacion-${servicioId}` : 'ag-aviso',
        renotify: false,
        vibrate: [200, 100, 200],
        data: { ...(payload.data || {}), url, servicioId },
        actions: [
            { action: 'open', title: 'Ver Detalles' }
        ]
    };

    return self.registration.showNotification(title, options);
});

// Al hacer click en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            if (clientList.length > 0) {
                return clientList[0].focus().then(client => client.navigate(urlToOpen));
            }
            return clients.openWindow(urlToOpen);
        })
    );
});