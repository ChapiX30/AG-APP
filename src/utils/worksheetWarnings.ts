/**
 * Rangos ambientales de calibración según la norma de método de cada magnitud.
 * ISO/IEC 17025 solo pide registrar condiciones; los límites numéricos
 * vienen de la norma técnica (EURAMET, OIML, ISO, IEC).
 *
 * HR omitida (hMin/hMax undefined) = la norma no fija banda de humedad,
 * solo temperatura. No se avisa por HR en esos casos.
 */

export type EnvLimits = {
  tMin: number;
  tMax: number;
  hMin?: number;
  hMax?: number;
};

/** Fallback: banda 18–28 °C que aparece en ISO 376, ISO 6789 y EURAMET cg-17. */
export const ENV_LIMITS: EnvLimits = { tMin: 18, tMax: 28 };

const ENV_POR_MAGNITUD: Record<string, EnvLimits> = {
  // EURAMET cg-17: 18–28 °C, estable ±1 °C. HR se registra si afecta densidad del aire.
  Presión: { tMin: 18, tMax: 28 },
  Vacio: { tMin: 18, tMax: 28 },
  Flujo: { tMin: 18, tMax: 28 },

  // OIML R 111: 18–27 °C; HR 40–60 % (clases E y F, antiestática / corrosión).
  Masa: { tMin: 18, tMax: 27, hMin: 40, hMax: 60 },

  // ISO 1: temperatura de referencia 20 °C. Ventana de trabajo 20±2 °C
  // para instrumentos de taller (pie de rey, micrometro). HR 40–60 % habitual.
  Dimensional: { tMin: 18, tMax: 22, hMin: 40, hMax: 60 },

  // ISO 376: 18–28 °C, estable ±1 °C. Sin banda de HR.
  Fuerza: { tMin: 18, tMax: 28 },

  // ISO 6789: 18–28 °C, estable ±1 °C; HR ≤ 90 %.
  "Par Torsional": { tMin: 18, tMax: 28, hMax: 90 },

  // ISO 4787: (20±3) °C y HR 30–80 %.
  Volumen: { tMin: 17, tMax: 23, hMin: 30, hMax: 80 },

  // IEC 61672-3 ensayos periódicos: 20–26 °C, 25–70 % HR.
  Acustica: { tMin: 20, tMax: 26, hMin: 25, hMax: 70 },

  // ISO 6508-1 (Rockwell): 10–35 °C. Sin banda de HR.
  Dureza: { tMin: 10, tMax: 35 },

  // Condiciones de referencia típicas de DMM / IEC (23±5 °C).
  Electrica: { tMin: 18, tMax: 28, hMin: 20, hMax: 80 },
  Frecuencia: { tMin: 18, tMax: 28, hMin: 20, hMax: 80 },
  Tiempo: { tMin: 18, tMax: 28, hMin: 20, hMax: 80 },

  // Ambiente del laboratorio (el mesurando va en baño / generador).
  Temperatura: { tMin: 18, tMax: 28 },
  Humedad: { tMin: 18, tMax: 28 },

  Optica: { tMin: 18, tMax: 28, hMin: 20, hMax: 80 },
  Vibracion: { tMin: 18, tMax: 28 },
  Velocidad: { tMin: 18, tMax: 28 },
  Quimica: { tMin: 15, tMax: 30, hMin: 20, hMax: 80 },
};

const MAGNITUD_ALIAS: Record<string, string> = {
  Presion: "Presión",
};

export function envLimitsForMagnitud(magnitud: string | undefined): EnvLimits | null {
  if (!magnitud?.trim()) return null;
  const key = MAGNITUD_ALIAS[magnitud] ?? magnitud;
  return ENV_POR_MAGNITUD[key] ?? ENV_LIMITS;
}

export function isOutOfEnvRange(raw: string | undefined, min: number, max: number): boolean {
  if (!raw?.trim()) return false;
  const n = Number(raw);
  return Number.isFinite(n) && (n < min || n > max);
}

export function formatEnteredNumber(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw.trim();
}

export function countNumericLines(text: string): number {
  return text.split("\n").filter((l) => /\d/.test(l)).length;
}

export function puntosMedicionAviso(opts: {
  magnitud: string;
  count: number;
  contexto?: string;
}): string {
  const { magnitud, count, contexto } = opts;
  if (magnitud === "Masa") {
    return `Se recomiendan al menos 3 puntos de linealidad. Hay ${count}.`;
  }
  if (contexto) {
    return `Se recomiendan al menos 3 puntos en ${contexto}. Hay ${count}.`;
  }
  return `Se recomiendan al menos 3 puntos en el alcance (${magnitud}). Hay ${count}.`;
}

export function envRangeStatus(
  magnitud: string | undefined,
  tempAmbiente: string,
  humedadRelativa: string,
): { tempOut: boolean; hrOut: boolean; summary: string } {
  const limits = envLimitsForMagnitud(magnitud);
  if (!limits) {
    return { tempOut: false, hrOut: false, summary: "" };
  }

  const tempOut = isOutOfEnvRange(tempAmbiente, limits.tMin, limits.tMax);
  const hrOut =
    limits.hMin != null && limits.hMax != null
      ? isOutOfEnvRange(humedadRelativa, limits.hMin, limits.hMax)
      : limits.hMax != null
        ? isOutOfEnvRange(humedadRelativa, Number.NEGATIVE_INFINITY, limits.hMax)
        : limits.hMin != null
          ? isOutOfEnvRange(humedadRelativa, limits.hMin, Number.POSITIVE_INFINITY)
          : false;

  const parts: string[] = [];
  if (tempOut) {
    parts.push(`${formatEnteredNumber(tempAmbiente)} °C (${limits.tMin}–${limits.tMax})`);
  }
  if (hrOut) {
    if (limits.hMin != null && limits.hMax != null) {
      parts.push(`${formatEnteredNumber(humedadRelativa)} % HR (${limits.hMin}–${limits.hMax})`);
    } else if (limits.hMax != null) {
      parts.push(`${formatEnteredNumber(humedadRelativa)} % HR (máx. ${limits.hMax})`);
    } else if (limits.hMin != null) {
      parts.push(`${formatEnteredNumber(humedadRelativa)} % HR (mín. ${limits.hMin})`);
    }
  }
  return { tempOut, hrOut, summary: parts.join(" · ") };
}
