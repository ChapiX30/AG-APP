/**
 * Ilustraciones e iconografía de magnitudes (Consecutivos, MagnitudeDetail, etc.)
 */

const magnitudImages: Record<string, string> = {
  Acustica: "/images/acustica.png",
  Dimensional: "/images/dimensional.png",
  Temperatura: "/images/temperatura.png",
  Humedad: "/images/humedad.png",
  Flujo: "/images/flujo.png",
  Presion: "/images/presion.png",
  Fuerza: "/images/fuerza.png",
  Electrica: "/images/electrica.png",
  Frecuencia: "/images/frecuencia.png",
  Dureza: "/images/dureza.png",
  Volumen: "/images/volumen.png",
  "Par Torsional": "/images/par-torsional.png",
  Optica: "/images/optica.png",
  Quimica: "/images/quimica.png",
  Tiempo: "/images/tiempo.png",
  Masa: "/images/masa.png",
  "Reporte Diagnostico": "/images/default.png",
  Vibracion: "/images/vibracion-trazable.png",
  "Par Torsional Trazable": "/images/par-torsional-trazable.png",
  "Temperatura Trazable": "/images/temperatura-trazable.png",
  "Humedad Trazable": "/images/humedad-trazable.png",
  "Flujo Trazable": "/images/flujo-trazable.png",
  "Presion Trazable": "/images/presion-trazable.png",
  "Fuerza Trazable": "/images/fuerza-trazable.png",
  "Frecuencia Trazable": "/images/frecuencia-trazable.png",
  "Dureza Trazable": "/images/dureza-trazable.png",
  "Volumen Trazable": "/images/volumen-trazable.png",
  "Optica Trazable": "/images/optica-trazable.png",
  "Vibracion Trazable": "/images/vibracion-trazable.png",
  "Masa Trazable": "/images/masa.png",
  "Acustica Trazable": "/images/acustica.png",
  "Dimensional Trazable": "/images/dimensional.png",
  "Electrica Trazable": "/images/electrica.png",
};

const idToDisplayName: Record<string, string> = {
  acustica: "Acustica",
  dimensional: "Dimensional",
  electrica: "Electrica",
  flujo: "Flujo",
  frecuencia: "Frecuencia",
  fuerza: "Fuerza",
  humedad: "Humedad",
  masa: "Masa",
  "par-torsional": "Par Torsional",
  presion: "Presion",
  quimica: "Quimica",
  "reporte diagnostico": "Reporte Diagnostico",
  temperatura: "Temperatura",
  tiempo: "Tiempo",
  volumen: "Volumen",
  optica: "Optica",
  vibracion: "Vibracion",
  dureza: "Dureza",
};

function normalizeMagnitudKey(raw: string): string {
  const base = raw.replace(/\s*trazable\s*/gi, " ").trim();
  const lower = base.toLowerCase();
  if (idToDisplayName[lower]) return idToDisplayName[lower];
  if (lower.includes("par") && lower.includes("torsional")) return "Par Torsional";
  if (lower.includes("reporte")) return "Reporte Diagnostico";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function getMagnitudImageSrc(idOrName: string): string | null {
  const direct = magnitudImages[idOrName];
  if (direct) return direct;

  const compact = idOrName.replace(/\s/g, "");
  const compactHit = magnitudImages[compact];
  if (compactHit) return compactHit;

  const display = normalizeMagnitudKey(idOrName);
  if (magnitudImages[display]) return magnitudImages[display];

  const trazableName = `${display} Trazable`;
  if (/trazable/i.test(idOrName) && magnitudImages[trazableName]) {
    return magnitudImages[trazableName];
  }

  return magnitudImages[display] || null;
}

export function isTrazableMagnitudId(idOrName: string): boolean {
  return /trazable/i.test(idOrName);
}
