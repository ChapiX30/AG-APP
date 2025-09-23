// /public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// 🔥 Pega aquí tu configuración de Firebase web:
firebase.initializeApp({
    apiKey: "AIzaSyCOsmnfM950uNrUnCjQsRtAc2jiUESYxqI",
    authDomain: "agg1-b7f40.firebaseapp.com",
    projectId: "agg1-b7f40",
    storageBucket: "agg1-b7f40.firebasestorage.app",
    messagingSenderId: "985878845659",
    appId: "1:985878845659:web:6639e7da9d82ffcaae94fe",
});

// Inicializa messaging
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload?.notification?.title || "Nuevo servicio asignado";
    const notificationOptions = {
        body: payload?.notification?.body || "",
        icon: '/bell.png', // Cambia por el icono que quieras
        // badge: '/badge.png' // (opcional) otro icono pequeño
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
