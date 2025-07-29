// src/utils/prefijos.ts

const prefijos: Record<string, string> = {
    "Dimensional": "AGD",
    "Acustica": "AGAC",
    "Electrica": "AGEL",
    "Flujo": "AGFL",
    "Frecuencia": "AGFRT",
    "Fuerza": "AGF",
    "Humedad": "AGH",
    "Masa": "AGM",
    "Par Torsional": "AGPT",
    "Presion": "AGP",
    "Temperatura": "AGT",
    // etc.
};

export function getPrefijo(magnitud: string): string {
    return prefijos[magnitud] || "AGX";
}
