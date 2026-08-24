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
  asignacion_calidad: { url: '/calendario', screen: 'calendario', urgency: 'high', actionOpen: 'Ver servicio' },
  revision_calidad: { url: '/drive', screen: 'drive', urgency: 'high', actionOpen: 'Abrir Drive' },
  prestamo_patron_tecnico: { url: '/control-prestamos', screen: 'control-prestamos', urgency: 'normal', actionOpen: 'Ver préstamo' },
  prestamo_patron_calidad: { url: '/control-prestamos', screen: 'control-prestamos', urgency: 'normal', actionOpen: 'Ver préstamo' },
  vacacion_pendiente: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'high', actionOpen: 'Revisar' },
  vacacion_rechazada: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'high', actionOpen: 'Ver detalle' },
  vacacion_progreso: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'normal', actionOpen: 'Ver estado' },
  vacacion_aprobada: { url: '/solicitud-vacaciones', screen: 'solicitud-vacaciones', urgency: 'normal', actionOpen: 'Abrir' },
  aviso_global: { url: '/', screen: 'menu', urgency: 'normal', actionOpen: 'Abrir app' },
  recordatorio_confirmacion_junta: { url: '/calendario', screen: 'calendario', urgency: 'high', actionOpen: 'Confirmar' },
  confirmacion_asistencia: { url: '/calendario', screen: 'calendario', urgency: 'high', actionOpen: 'Ver junta' },
};

function metaForTipo(tipo) {
  return TIPO_META[tipo] || { url: '/', screen: 'menu', urgency: 'normal', actionOpen: 'Abrir' };
}

function parseFcmPayload(payload) {
  const data = payload.data || {};
  const tipo = data.tipo || '';
  const meta = metaForTipo(tipo);
  const title = data.title || payload?.notification?.title || 'Aviso AG';
  const body = data.body || payload?.notification?.body || '';
  const servicioId = data.servicioId || '';
  const tag = `${data.tag || tipo || 'ag-aviso'}-${Date.now()}`;
  const url = data.url || meta.url;
  const screen = data.screen || meta.screen;
  const urgency = data.urgency || meta.urgency;
  const actionOpen = data.actionOpen || meta.actionOpen;
  return { title, body, servicioId, tag, tipo, urgency, url, screen, actionOpen, data };
}

function buildOptions(parsed) {
  const high = parsed.urgency === 'high';
  return {
    body: parsed.body,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: parsed.tag,
    renotify: true,
    requireInteraction: high,
    vibrate: high ? [180, 80, 180] : [160, 70, 160],
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
      return;
    } catch (_) {
      /* siguiente */
    }
  }
  await clients.openWindow(url || '/');
}

self.addEventListener('notificationclick', function (event) {
  const action = event.action;
  event.notification.close();
  if (action === 'dismiss') return;

  const data = event.notification.data || {};
  event.waitUntil(focusOrOpen(data.url || '/', data.screen || ''));
});
