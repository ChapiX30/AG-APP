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
