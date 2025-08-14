/* public/firebase-messaging-sw.js */
/* Usa compat en el SW: es el patrón más estable para web */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

/** ⚙️ MISMA CONFIG QUE EN src/utils/firebase.ts */
firebase.initializeApp({
  apiKey: "AIzaSyCOsmnfM950uNrUnCjQsRtAc2jiUESYxqI",
  authDomain: "agg1-b7f40.firebaseapp.com",
  projectId: "agg1-b7f40",
  storageBucket: "agg1-b7f40.firebasestorage.app",
  messagingSenderId: "985878845659",
  appId: "1:985878845659:web:6639e7da9d82ffcaae94fe",
});

const messaging = firebase.messaging();

/** 🔕 Llega cuando tu app está cerrada o en segundo plano */
messaging.onBackgroundMessage((payload) => {
  // payload.notification { title, body, image } si lo envías así
  const title = payload?.notification?.title || 'Nuevo servicio asignado';
  const body  = payload?.notification?.body  || 'Toca para abrir';
  const data  = payload?.data || {}; // e.g. { servicioId, url }

  const options = {
    body,
    icon: '/bell.png',    // opcional (coloca bell.png en /public)
    badge: '/bell.png',   // opcional
    data,                 // para usar en notificationclick
  };

  self.registration.showNotification(title, options);
});

/** 🖱️ Al hacer click en la notificación */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification?.data && event.notification.data.url) || '/friday';

  // Abrir o enfocar una pestaña existente con esa URL
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      const clientUrl = new URL(client.url);
      if (clientUrl.pathname === url) {
        return client.focus();
      }
    }
    return clients.openWindow(url);
  })());
});
