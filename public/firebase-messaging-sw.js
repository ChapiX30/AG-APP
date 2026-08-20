/* global firebase, clients, self */
/**
 * FCM Service Worker — notificaciones premium en pantalla de bloqueo / segundo plano.
 * Data-only desde Cloud Functions → un solo showNotification (sin duplicados).
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCOsmnfM950uNrUnCjQsRtAc2jiUESYxqI',
  authDomain: 'agg1-b7f40.firebaseapp.com',
  projectId: 'agg1-b7f40',
  storageBucket: 'agg1-b7f40.firebasestorage.app',
  messagingSenderId: '985878845659',
  appId: '1:985878845659:web:6639e7da9d82ffcaae94fe',
});

const messaging = firebase.messaging();

const TIPO_META = {
  asignacion_calidad: { url: '/calendario', screen: 'calendario', urgency: 'high', actionOpen: 'Ver servicio', label: 'Asignación' },
  revision_calidad: { url: '/drive', screen: 'drive', urgency: 'high', actionOpen: 'Abrir Drive', label: 'Revisión' },
  prestamo_patron_tecnico: { url: '/control-prestamos', screen: 'control-prestamos', urgency: 'normal', actionOpen: 'Ver préstamo', label: 'Préstamo' },
  prestamo_patron_calidad: { url: '/control-prestamos', screen: 'control-prestamos', urgency: 'normal', actionOpen: 'Ver préstamo', label: 'Préstamo' },
  vacacion_pendiente: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'high', actionOpen: 'Revisar', label: 'Vacaciones' },
  vacacion_rechazada: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'high', actionOpen: 'Ver detalle', label: 'Vacaciones' },
  vacacion_progreso: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'normal', actionOpen: 'Ver estado', label: 'Vacaciones' },
  vacacion_aprobada: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'normal', actionOpen: 'Abrir', label: 'Vacaciones' },
  aviso_global: { url: '/', screen: 'menu', urgency: 'normal', actionOpen: 'Abrir app', label: 'Aviso general' },
  recordatorio_confirmacion_junta: { url: '/calendario', screen: 'calendario', urgency: 'high', actionOpen: 'Confirmar', label: 'Junta' },
  confirmacion_asistencia: { url: '/calendario', screen: 'calendario', urgency: 'high', actionOpen: 'Ver junta', label: 'Junta' },
};

function metaForTipo(tipo) {
  return TIPO_META[tipo] || {
    url: '/',
    screen: 'menu',
    urgency: 'normal',
    actionOpen: 'Abrir',
    label: 'Aviso',
  };
}

function parseFcmPayload(payload) {
  const data = payload.data || {};
  const tipo = data.tipo || '';
  const meta = metaForTipo(tipo);
  const title = data.title || payload?.notification?.title || 'Aviso AG';
  const body = data.body || payload?.notification?.body || '';
  const servicioId = data.servicioId || '';
  const tag = data.tag || (servicioId ? `${tipo || 'aviso'}-${servicioId}` : tipo || 'ag-aviso');
  const urgency = data.urgency || meta.urgency;
  const url = data.url || meta.url;
  const screen = data.screen || meta.screen;
  const actionOpen = data.actionOpen || meta.actionOpen;
  return { title, body, servicioId, tag, tipo, urgency, url, screen, actionOpen, label: meta.label, data };
}

function buildOptions(parsed) {
  const high = parsed.urgency === 'high';
  const vibrate = high ? [180, 80, 180, 80, 240] : parsed.urgency === 'low' ? [120] : [160, 70, 160];
  return {
    body: parsed.body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: parsed.tag,
    renotify: high,
    requireInteraction: high,
    vibrate,
    timestamp: Date.now(),
    data: {
      ...(parsed.data || {}),
      url: parsed.url,
      screen: parsed.screen,
      servicioId: parsed.servicioId,
      tipo: parsed.tipo,
      title: parsed.title,
      body: parsed.body,
    },
    actions: [
      { action: 'open', title: parsed.actionOpen },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };
}

messaging.onBackgroundMessage(function (payload) {
  const parsed = parseFcmPayload(payload);
  return self.registration.showNotification(parsed.title, buildOptions(parsed));
});

async function focusOrOpen(url, screen) {
  const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of all) {
    try {
      await client.focus();
      client.postMessage({ type: 'AG_PUSH_NAV', url, screen });
      if ('navigate' in client && typeof client.navigate === 'function') {
        try {
          await client.navigate(url);
        } catch (_) {
          /* SPA: el postMessage basta */
        }
      }
      return;
    } catch (_) {
      /* siguiente cliente */
    }
  }
  await clients.openWindow(url || '/');
}

self.addEventListener('notificationclick', function (event) {
  const action = event.action;
  event.notification.close();
  if (action === 'dismiss') return;

  const data = event.notification.data || {};
  const url = data.url || '/';
  const screen = data.screen || '';

  event.waitUntil(focusOrOpen(url, screen));
});

self.addEventListener('notificationclose', function () {
  /* reservado: analytics futuros */
});
