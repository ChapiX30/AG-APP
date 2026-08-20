# Notificaciones push — AG App

## Arquitectura (2026)

1. Firestore `notificaciones/{id}` con `tipo` + `fcmSent: false`
2. Cloud Function `enviarNotificacionCalidad` → FCM **data-only** (web) + notificación nativa Android/iOS
3. Service Worker `firebase-messaging-sw.js` → `showNotification` premium (icono PWA, acciones, urgencia)
4. Primer plano web → toast in-app (no popup nativo redundante)
5. Tap → deep link (`screen` / `url`) vía `postMessage` o Capacitor

## Despliegue

```bash
cd functions && npm run build
firebase deploy --only functions:enviarNotificacionCalidad
```

Cliente: build + hosting. Usuarios: **Ctrl+Shift+R** una vez para refrescar el SW.

## Activar avisos en el navegador

Ya no se pide permiso al cargar. En el panel de notificaciones (campana) aparece **Activar avisos en pantalla de bloqueo** si el permiso está en `default`.

## Tipos con push

`asignacion_calidad`, `revision_calidad`, préstamos, vacaciones, `aviso_global`, juntas (`recordatorio_confirmacion_junta`, `confirmacion_asistencia`).

## Verificar

1. Asignar un servicio → un doc `asignacion_{servicio}_{uid}` con `fcmSent: true`
2. Un aviso en bandeja del SO + una fila en el panel
3. Tap abre la pantalla correcta
