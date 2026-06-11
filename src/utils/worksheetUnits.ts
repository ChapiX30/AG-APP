/**
 * Unidades por magnitud para hojas de trabajo (metrología).
 */

export const unidadesPorMagnitud: Record<string, string[] | Record<string, string[]>> = {
  Acustica: ["dB", "dB(A)", "dB(C)", "dB(Z)", "dB SPL", "Hz", "Pa", "kPa"],
  Dimensional: ["m", "cm", "mm", "µm", "in", "µin", "mil", "min", "°", "rad", "mrad"],
  Fuerza: ["N", "kN", "kgf", "gf", "lbf", "ozf"],
  Flujo: [
    "m³/h", "m³/min", "L/min", "L/h", "slpm", "scfm", "cfh", "gpm", "ccm", "SCMH", "SCFH",
  ],
  Frecuencia: ["Hz", "kHz", "MHz", "GHz", "RPM", "cpm", "rad/s"],
  Presión: ["Pa", "kPa", "MPa", "bar", "mbar", "psi", "InH2O", "mmH₂O", "mmHg", "Torr", "atm"],
  Quimica: ["pH", "µS", "µS/cm", "mS/cm", "S/m", "mg/L", "ppm", "ppb", "NTU", "mol/L"],
  Electrica: {
    DC: ["mV", "V", "kV", "A", "µA", "mA", "Ω", "kΩ", "MΩ"],
    AC: ["mV", "V", "kV", "A", "µA", "mA", "Ω", "kΩ", "MΩ"],
    Otros: ["Hz", "kHz", "MHz", "°C", "°F", "F", "µF", "nF", "pF", "H", "mH"],
  },
  Temperatura: ["°C", "°F", "K"],
  Optica: ["BRIX", "°", "lux", "lx", "cd", "lm", "cd/m²", "%T", "OD"],
  Masa: ["mg", "g", "kg", "lb", "oz", "ton"],
  Tiempo: ["ms", "s", "min", "h", "d"],
  "Reporte de Diagnostico": ["check"],
  Velocidad: ["m/s", "mm/s", "km/h", "ft/s", "in/s"],
  Vacio: ["Pa", "mbar", "Torr", "mmHg", "micron", "inHg", "atm"],
  Vibracion: ["g", "m/s²", "mm/s", "µm", "Hz", "ips", "rad/s"],
  "Par Torsional": ["N·m", "N*cm", "cN·m", "kgf·cm", "kgf·m", "lbf·ft", "lbf·in", "oz·in", "oz·ft"],
  Humedad: ["% HR", "%", "°C Punto de Rocío", "°F Punto de Rocío", "g/m³", "ppm(v)"],
  Dureza: ["HB", "HRC", "HRB", "HV", "HSD", "Shore A", "Shore D", "HR15N", "HR30N"],
  Volumen: ["mL", "L", "cm³", "dm³", "m³", "gal", "fl oz", "in³"],
};

export function getUnidadesForMagnitud(magnitud: string): string[] {
  if (!magnitud) return [];
  if (magnitud === "Electrica") {
    const e = unidadesPorMagnitud.Electrica as Record<string, string[]>;
    return [...e.DC, ...e.AC, ...e.Otros];
  }
  const u = unidadesPorMagnitud[magnitud];
  return Array.isArray(u) ? u : [];
}
