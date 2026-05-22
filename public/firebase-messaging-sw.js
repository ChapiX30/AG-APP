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

messaging.onBackgroundMessage(function (payload) {
    console.log('[SW] Recibido:', payload);
    
    const title = payload?.notification?.title || "Notificación de AG-APP";
    const servicioId = payload?.data?.servicioId || '';
    const options = {
        body: payload?.notification?.body || "",
        icon: '/bell.png',
        badge: '/bell.png',
        tag: servicioId ? `asignacion-${servicioId}` : 'ag-aviso',
        renotify: true,
        vibrate: [200, 100, 200],
        data: payload.data || {},
        actions: [
            { action: 'open', title: 'Ver Detalles' }
        ]
    };

    self.registration.showNotification(title, options);
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