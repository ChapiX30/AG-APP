/** Mapea rutas del payload FCM a pantallas internas de la app. */
export function screenFromPushUrl(url?: string): string | null {
  if (!url) return null;
  const path = url.replace(/^\//, '').split('?')[0];
  const allowed = new Set([
    'calendario',
    'drive',
    'vencimientos',
    'solicitud-vacaciones',
  ]);
  return allowed.has(path) ? path : null;
}
