/** Shared helpers for ProgramaCalibracion ↔ Normas (Hoja de Herramienta). */
export const COLLECTION_PATRONES = 'patronesCalibracion';

export const PATRONES_UNAVAILABLE_ESTADOS = [
  'en_servicio',
  'en_prestamo',
  'en_uso',
  'en_calibracion',
  'en_mantenimiento',
  'fuera_servicio',
  'con_falla',
] as const;

export function formatPatronNombre(
  noControl: string,
  descripcion?: string,
  nombre?: string,
): string {
  return `${noControl} - ${descripcion || nombre || 'Sin descripción'}`;
}

export function isPatronUnavailable(estado?: string): boolean {
  if (!estado) return false;
  return (PATRONES_UNAVAILABLE_ESTADOS as readonly string[]).includes(estado);
}

/** ID estable de documento Firestore a partir del No. de control (p. ej. AG-001). */
export function patronFirestoreDocId(noControl: string): string {
  const normalized = (noControl || '').trim().toUpperCase().replace(/\//g, '-').replace(/\s+/g, '_');
  return normalized || `patron-${crypto.randomUUID()}`;
}
