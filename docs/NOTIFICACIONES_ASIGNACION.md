# Notificaciones de asignación — despliegue

## Causa del duplicado (corregida)

1. **Bandeja del sistema (push):** FCM enviaba payload con `notification` y el service worker también llamaba `showNotification` → dos avisos en segundo plano.
2. **Firestore:** `addDoc` sin id fijo + lista `servicios` desactualizada al guardar de nuevo → varios documentos para la misma asignación → varios triggers de la Cloud Function.

## Cambios

- Documentos idempotentes: `notificaciones/asignacion_{servicioId}_{uid}` con `setDoc` + `merge`.
- Cloud Function `enviarNotificacionCalidad`: `onWrite`, omite si `fcmSent === true`, mensaje **solo `data`** en web, marca `fcmSent` tras enviar.
- SW y primer plano: un solo `showNotification` / `Notification` con título/cuerpo desde `data`.

## Qué debes hacer

### 1. Cloud Functions (obligatorio)

```bash
cd functions
npm run build
firebase deploy --only functions:enviarNotificacionCalidad
```

### 2. Cliente web (obligatorio)

```bash
npm run build
```

Publica el build (hosting o servidor que uses). Incluye `public/firebase-messaging-sw.js` actualizado.

### 3. Navegador de cada usuario asignado

- Cerrar pestañas duplicadas de la app (cada pestaña puede mostrar push en primer plano).
- **Recargar con caché limpio** una vez (Ctrl+Shift+R) para cargar el SW nuevo.
- En DevTools → Application → Service Workers: *Unregister* el SW viejo si sigue el duplicado, luego recargar.
- Opcional: volver a aceptar permisos de notificaciones si el SW no se actualiza.

### 4. Verificación

1. Asignar **una** persona nueva a un servicio desde **Servicios** (Friday).
2. En Firestore debe existir **un** doc `notificaciones/asignacion_{servicioId}_{uid}` con `fcmSent: true` tras unos segundos.
3. El usuario asignado debe ver **un** aviso en la bandeja del SO y **una** entrada en el panel de notificaciones de la app.
4. Repetir guardado sin cambiar personas: no debe crear otro push (mismo doc, `fcmSent` ya true hasta nueva asignación).
