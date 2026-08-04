/** Helpers para mediciones eléctricas multi-canal (Canal 1, 2, 3… por unidad). */

export const MAX_CANALES_ELECTRICOS = 8;

export type CanalesPorUnidad = Record<string, number>;

export function canalLabel(index: number): string {
  return String(Math.max(0, index) + 1); // 1, 2, 3…
}

export function normalizeNumCanales(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '1'), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_CANALES_ELECTRICOS, Math.floor(n));
}

export function normalizeCanalesPorUnidad(
  units: string[],
  raw: unknown,
  legacyNumCanales?: unknown
): CanalesPorUnidad {
  const out: CanalesPorUnidad = {};
  const fromMap =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const legacy = legacyNumCanales !== undefined ? normalizeNumCanales(legacyNumCanales) : 1;

  for (const unit of units) {
    if (fromMap[unit] !== undefined) {
      out[unit] = normalizeNumCanales(fromMap[unit]);
    } else {
      out[unit] = legacy > 1 ? legacy : 1;
    }
  }
  return out;
}

export function canalesDeUnidad(canalesPorUnidad: CanalesPorUnidad | undefined, unit: string): number {
  return normalizeNumCanales(canalesPorUnidad?.[unit] ?? 1);
}

/** Clave interna en electricalValues. */
export function electricalSectionKey(unit: string, canalIndex: number, numCanales: number): string {
  if (numCanales <= 1) return unit;
  return `${unit}||${canalLabel(canalIndex)}`;
}

/** Encabezado que va a medicionPatron / PDF (línea con ":"). */
export function electricalSectionHeader(unit: string, canalIndex: number, numCanales: number): string {
  if (numCanales <= 1) return `${unit}:`;
  return `${unit} · Canal ${canalLabel(canalIndex)}:`;
}

export function listElectricalSections(
  units: string[],
  canalesPorUnidad: CanalesPorUnidad | number = {}
): { key: string; unit: string; canalIndex: number; numCanales: number; header: string; label: string }[] {
  const map =
    typeof canalesPorUnidad === 'number'
      ? Object.fromEntries(units.map((u) => [u, canalesPorUnidad]))
      : canalesPorUnidad;

  const out: {
    key: string;
    unit: string;
    canalIndex: number;
    numCanales: number;
    header: string;
    label: string;
  }[] = [];

  for (const unit of units) {
    const n = canalesDeUnidad(map, unit);
    for (let i = 0; i < n; i++) {
      out.push({
        key: electricalSectionKey(unit, i, n),
        unit,
        canalIndex: i,
        numCanales: n,
        header: electricalSectionHeader(unit, i, n),
        label: n <= 1 ? unit : `${unit} · Canal ${canalLabel(i)}`,
      });
    }
  }
  return out;
}

function extractSectionValue(fullText: string, header: string): string {
  if (!fullText) return '';
  const headerNorm = header.replace(/:$/, '').trim().toLowerCase();
  const lines = fullText.split('\n');
  let inSection = false;
  let extracted = '';
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader = trimmed.endsWith(':');
    if (isHeader) {
      const name = trimmed.slice(0, -1).trim().toLowerCase();
      if (name === headerNorm) {
        inSection = true;
        continue;
      }
      if (inSection) break;
      continue;
    }
    if (inSection) {
      extracted += line + '\n';
    }
  }
  return extracted.trim();
}

/** Headers legacy: "VDC · Canal A" → índice 0 */
function legacyLetterHeader(unit: string, canalIndex: number): string {
  return `${unit} · Canal ${String.fromCharCode(65 + canalIndex)}:`;
}

export function parseElectricalValuesFromText(
  units: string[],
  canalesPorUnidad: CanalesPorUnidad | number,
  medicionPatron: string,
  medicionInstrumento: string
): Record<string, { patron: string; instrumento: string }> {
  const result: Record<string, { patron: string; instrumento: string }> = {};
  const sections = listElectricalSections(units, canalesPorUnidad);

  for (const s of sections) {
    let patron = extractSectionValue(medicionPatron, s.header);
    let instrumento = extractSectionValue(medicionInstrumento, s.header);

    // Compat: hojas con Canal A/B o sin canales
    if (!patron && !instrumento && s.numCanales > 1) {
      patron = extractSectionValue(medicionPatron, legacyLetterHeader(s.unit, s.canalIndex));
      instrumento = extractSectionValue(medicionInstrumento, legacyLetterHeader(s.unit, s.canalIndex));
    }
    if (s.canalIndex === 0 && !patron && !instrumento) {
      patron = extractSectionValue(medicionPatron, `${s.unit}:`);
      instrumento = extractSectionValue(medicionInstrumento, `${s.unit}:`);
    }

    result[s.key] = { patron, instrumento };
  }
  return result;
}

export function buildElectricalMeasurementTexts(
  units: string[],
  canalesPorUnidad: CanalesPorUnidad | number,
  electricalValues: Record<string, { patron: string; instrumento: string }>
): { medicionPatron: string; medicionInstrumento: string } {
  let textoPatron = '';
  let textoInstrumento = '';
  for (const s of listElectricalSections(units, canalesPorUnidad)) {
    const vals = electricalValues[s.key] || { patron: '', instrumento: '' };
    if (vals.patron?.trim()) {
      textoPatron += `${s.header}\n${vals.patron.trim()}\n\n`;
    }
    if (vals.instrumento?.trim()) {
      textoInstrumento += `${s.header}\n${vals.instrumento.trim()}\n\n`;
    }
  }
  return {
    medicionPatron: textoPatron.trim(),
    medicionInstrumento: textoInstrumento.trim(),
  };
}

/** Texto PDF: "VDC: 2 (1, 2); mADC: 3 (1, 2, 3)" — solo unidades con >1 canal. */
export function formatCanalesPorUnidadPdfLabel(
  units: string[],
  canalesPorUnidad: CanalesPorUnidad | undefined
): string {
  const parts: string[] = [];
  for (const unit of units) {
    const n = canalesDeUnidad(canalesPorUnidad, unit);
    if (n <= 1) continue;
    const nums = Array.from({ length: n }, (_, i) => canalLabel(i)).join(', ');
    parts.push(`${unit}: ${n} (${nums})`);
  }
  return parts.join('; ');
}

export function hasMultiCanal(
  units: string[],
  canalesPorUnidad: CanalesPorUnidad | undefined
): boolean {
  return units.some((u) => canalesDeUnidad(canalesPorUnidad, u) > 1);
}
