import { differenceInDays, isValid, parseISO } from 'date-fns';

export interface PatronParteCalibracion {
  id: string;
  etiqueta: string;
  descripcion?: string;
  serie?: string;
  cantidadMasas?: number;
  fechaVencimiento?: string;
  fechaUltimaCalibracion?: string;
  laboratorioCalibracion?: string;
  noCertificado?: string;
  certificadoStoragePath?: string;
  estadoParte?: string;
}

export type PatronConPartes = {
  noControl?: string;
  fecha?: string;
  fechaVencimiento?: string;
  estadoProceso?: string;
  partesCalibracion?: PatronParteCalibracion[];
};

export function patronTienePartes(item: PatronConPartes | null | undefined): boolean {
  return (item?.partesCalibracion?.length ?? 0) > 1;
}

export function getParteFechaVencimiento(parte: PatronParteCalibracion): string {
  return parte.fechaVencimiento || '';
}

/** Vencimiento del patrón: la parte más urgente si está dividido. */
export function getPatronFechaVencimientoEfectiva(item: PatronConPartes): string {
  if (patronTienePartes(item)) {
    const fechas = item.partesCalibracion!
      .map(getParteFechaVencimiento)
      .filter(Boolean)
      .sort();
    if (fechas.length) return fechas[0];
  }
  return item.fecha || item.fechaVencimiento || '';
}

export function getPatronEstadoDesdePartes(partes: PatronParteCalibracion[]): string {
  if (partes.some((p) => p.estadoParte === 'en_calibracion')) return 'en_calibracion';
  if (partes.some((p) => p.estadoParte === 'en_mantenimiento' || p.estadoParte === 'con_falla')) {
    return partes.find((p) => p.estadoParte === 'con_falla') ? 'con_falla' : 'en_mantenimiento';
  }
  return 'operativo';
}

export function actualizarParteEnPatron(
  partes: PatronParteCalibracion[],
  parteId: string,
  updates: Partial<PatronParteCalibracion>,
): PatronParteCalibracion[] {
  return partes.map((p) => (p.id === parteId ? { ...p, ...updates } : p));
}

/** Combina catálogo local + Firestore sin perder certificados por parte. */
export function mergePartesCalibracion(
  seed?: PatronParteCalibracion[],
  remote?: PatronParteCalibracion[],
): PatronParteCalibracion[] | undefined {
  if (!seed?.length && !remote?.length) return undefined;
  const map = new Map<string, PatronParteCalibracion>();
  for (const p of seed ?? []) map.set(p.id, { ...p });
  for (const p of remote ?? []) {
    const prev = map.get(p.id);
    map.set(p.id, {
      ...prev,
      ...p,
      certificadoStoragePath: p.certificadoStoragePath || prev?.certificadoStoragePath,
      fechaVencimiento: p.fechaVencimiento || prev?.fechaVencimiento,
      fechaUltimaCalibracion: p.fechaUltimaCalibracion || prev?.fechaUltimaCalibracion,
      laboratorioCalibracion: p.laboratorioCalibracion || prev?.laboratorioCalibracion,
      noCertificado: p.noCertificado || prev?.noCertificado,
      estadoParte: p.estadoParte || prev?.estadoParte,
    });
  }
  return [...map.values()];
}

export function parteEstaVencida(parte: PatronParteCalibracion): boolean {
  const f = getParteFechaVencimiento(parte);
  if (!f) return false;
  try {
    const d = parseISO(f);
    if (!isValid(d)) return false;
    return differenceInDays(d, new Date()) < 0;
  } catch {
    return false;
  }
}
