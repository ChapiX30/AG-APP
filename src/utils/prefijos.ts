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
    "Vibracion Trazable": "AGVBT",
    // etc.
};

export function getPrefijo(magnitud: string): string {
    return prefijos[magnitud] || "AGX";
}
