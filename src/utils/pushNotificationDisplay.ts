/** Extrae título/cuerpo/tag de un payload FCM (data-only o legacy notification). */
export function parseFcmDisplayPayload(payload: {
  notification?: { title?: string; body?: string };
  data?: Record<string, string | undefined>;
}) {
  const data = payload?.data || {};
  const title =
    data.title ||
    payload?.notification?.title ||
    'Aviso AG';
  const body =
    data.body ||
    payload?.notification?.body ||
    '';
  const servicioId = data.servicioId || '';
  const tag = servicioId ? `asignacion-${servicioId}` : 'ag-aviso';
  return { title, body, servicioId, tag };
}
