/**
 * Canonical magnitudes for hojas de trabajo (WorkSheetScreen).
 * Consecutivos may use sub-types (e.g. "Masa Trazable"); the worksheet must use
 * the general magnitude so units, validation, and Firestore stay consistent.
 */

const WORKSHEET_ALIASES: Record<string, string> = {
  Presion: "Presión",
  "Presion Trazable": "Presión",
  "Reporte Diagnostico": "Reporte de Diagnostico",
  AcusticaTrazable: "Acustica",
};

/** Consecutivo prefix → worksheet magnitud (match longest prefix first). */
const PREFIJO_WORKSHEET: Record<string, string> = {
  AGACT: "Acustica",
  AGAC: "Acustica",
  AGDT: "Dimensional",
  AGD: "Dimensional",
  AGDUT: "Dureza",
  AGELT: "Electrica",
  AGEL: "Electrica",
  AGFLT: "Flujo",
  AGFL: "Flujo",
  AGFRT: "Frecuencia",
  AGFR: "Frecuencia",
  AGFT: "Fuerza",
  AGF: "Fuerza",
  AGMT: "Masa",
  AGM: "Masa",
  AGOT: "Optica",
  AGPTT: "Par Torsional",
  AGPT: "Par Torsional",
  AGPRT: "Presión",
  AGP: "Presión",
  AGTT: "Temperatura",
  AGT: "Temperatura",
  AGTI: "Tiempo",
  AGVT: "Volumen",
  AGVBT: "Vibracion",
  AGRD: "Reporte de Diagnostico",
  AGH: "Humedad",
  AGQ: "Quimica",
  VE: "Velocidad",
};

const PREFIJO_KEYS_DESC = Object.keys(PREFIJO_WORKSHEET).sort((a, b) => b.length - a.length);

export function toWorksheetMagnitud(magnitud: string): string {
  const trimmed = (magnitud || "").trim();
  if (!trimmed) return "";

  if (WORKSHEET_ALIASES[trimmed]) return WORKSHEET_ALIASES[trimmed];

  const trazableMatch = trimmed.match(/^(.+?)\s+Trazable$/i);
  if (trazableMatch) {
    const base = trazableMatch[1].trim();
    return WORKSHEET_ALIASES[base] ?? toWorksheetMagnitud(base);
  }

  return WORKSHEET_ALIASES[trimmed] ?? trimmed;
}

/** Canonical magnitudes for worksheet UI (matches unidadesPorMagnitud keys). */
export const WORKSHEET_MAGNITUDES = [
  "Acustica", "Dimensional", "Electrica", "Flujo", "Frecuencia", "Fuerza", "Humedad", "Masa", "Optica", "Par Torsional", "Presión", "Quimica", "Reporte de Diagnostico", "Temperatura", "Tiempo", "Vacio", "Velocidad", "Vibracion",
] as const;

export function extractMagnitudFromConsecutivo(consecutivo: string): string {
  if (!consecutivo) return "";

  const parts = consecutivo.split("-");
  if (parts.length > 0 && PREFIJO_WORKSHEET[parts[0]]) {
    return PREFIJO_WORKSHEET[parts[0]];
  }

  for (const code of PREFIJO_KEYS_DESC) {
    if (consecutivo.includes(code)) return PREFIJO_WORKSHEET[code];
  }

  return "";
}
