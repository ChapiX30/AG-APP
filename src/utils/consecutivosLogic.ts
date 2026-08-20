/**
 * Lógica pura de consecutivos (sin Firebase) — testeable en Node.
 */

export type ConsecutivoPartes = {
  prefijo: string;
  numero: number;
  anio: string;
};

/** ID estable por folio → no se crean docs duplicados del mismo consecutivo. */
export function consecutivoDocId(prefijo: string, numero: number, anio: string): string {
  return `${prefijo}_${anio}_${String(numero).padStart(4, "0")}`;
}

/** Firestore a veces devuelve huecos como objeto {0: n, 1: m} en lugar de array. */
export function normalizeHuecos(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  return [];
}

export function parseConsecutivo(consecutivo: string): ConsecutivoPartes | null {
  const partes = consecutivo.trim().split("-");
  if (partes.length < 3) return null;
  const anio = partes[partes.length - 1];
  const numero = parseInt(partes[partes.length - 2], 10);
  const prefijo = partes.slice(0, -2).join("-");
  if (!prefijo || isNaN(numero)) return null;
  return { prefijo, numero, anio };
}

export function formatConsecutivo(prefijo: string, numero: number, anio: string): string {
  return `${prefijo}-${String(numero).padStart(4, "0")}-${anio}`;
}

export function normalizeCertificado(consecutivo: string): string {
  return consecutivo.replace(/\s+/g, "").toUpperCase();
}

/** Variantes de escritura del mismo folio (con/sin espacios). */
export function variantesCertificado(consecutivo: string): string[] {
  const cert = normalizeCertificado(consecutivo);
  if (!cert) return [];
  const spaced = cert.replace(/^([A-Z0-9]+)-(\d+)-(\d+)$/i, "$1 - $2 - $3");
  return spaced !== cert ? [cert, spaced] : [cert];
}

/** Menor hueco disponible (o null si no hay). */
export function pickLowestHueco(huecos: unknown): number | null {
  const list = normalizeHuecos(huecos).sort((a, b) => a - b);
  return list.length > 0 ? list[0] : null;
}
