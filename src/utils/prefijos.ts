// src/utils/prefijos.ts

const prefijos: Record<string, string> = {
    "Dimensional": "AGD",
    "Dimensional Trazable": "AGDT",
    "Acustica": "AGAC",
    "Acustica Trazable": "AGACT",
    "Dureza Trazable": "AGDUT",
    "Electrica": "AGEL",
    "Electrica Trazable": "AGELT",
    "Flujo": "AGFL",
    "Flujo Trazable": "AGFLT",
    "Frecuencia": "AGFR",
    "Frecuencia Trazable": "AGFRT",
    "Fuerza": "AGF",
    "Fuerza Trazable": "AGFT",
    "Humedad": "AGH",
    "Masa": "AGM",
    "Masa Trazable": "AGMT",
    "Optica Trazable": "AGOT",
    "Par Torsional": "AGPT",
    "Reporte Diagnostico": "AGRD",
    "Par Torsional Trazable": "AGPTT",
    "Presion": "AGP",
    "Presion Trazable": "AGPRT",
    "Temperatura": "AGT",
    "Temperatura Trazable": "AGTT",
    "Tiempo": "AGTI",
    "Quimica": "AGQ",
    "Volumen": "AGV",
    "Volumen Trazable": "AGVT",
    "Vibracion Trazable": "AGVBT",
    // etc.
};

export function getPrefijo(magnitud: string): string {
    return prefijos[magnitud] || "AGX";
}

const PREFIJO_TO_MAGNITUD: Record<string, string> = Object.fromEntries(
    Object.entries(prefijos).map(([mag, pref]) => [pref, mag])
);

const PREFIJO_KEYS_DESC = Object.keys(PREFIJO_TO_MAGNITUD).sort((a, b) => b.length - a.length);

/** Prefijo de certificado (ej. AGD, AGDT) → magnitud del flujo de consecutivos. */
export function getMagnitudFromPrefijo(prefijo: string): string | null {
    const p = (prefijo || "").trim().toUpperCase();
    if (!p) return null;
    if (PREFIJO_TO_MAGNITUD[p]) return PREFIJO_TO_MAGNITUD[p];
    for (const key of PREFIJO_KEYS_DESC) {
        if (p === key) return PREFIJO_TO_MAGNITUD[key];
    }
    return null;
}
