/**
 * Puntos de calibración y dictamen aproximado en hoja de trabajo.
 *
 * Clase = (resolución / alcance) × 100 → 8 / 5 / 3 puntos (misma regla que Presión).
 * U expandida (k=2) solo con resolución: u(res) = res / (2√3), U = k · u(res).
 * EMP aprox. = resolución (equivalente a clase × alcance) si no hay EMP de cliente.
 * Dictamen por punto: |error| + U ≤ EMP → PASA. Global: todos los puntos con lectura.
 */

export type DictamenPunto = "PASA" | "NO PASA" | "";

export interface PuntoMedicion {
  patron: string;
  instrumento: string;
}

export interface AlcanceResolucionSpec {
  alcance: number;
  resolucion: number;
  clase: number;
  nPuntos: number;
  empAprox: number;
  uExpandida: number;
}

export interface DictamenPuntoCalc {
  error: number | null;
  u: number | null;
  eMasU: number | null;
  emp: number | null;
  dictamen: DictamenPunto;
}

export interface DictamenGlobal {
  dictamen: "PASA" | "NO PASA" | "PENDIENTE";
  evaluados: number;
  fallidos: number;
  clase: number | null;
  nPuntos: number | null;
  empAprox: number | null;
  uExpandida: number | null;
}

const K_COVERAGE = 2;

export function parseNumericToken(raw: string): number | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  const cleaned = t
    .replace(/[^\d,.\-eE+]/g, " ")
    .trim()
    .replace(/\s+/g, "");
  if (!cleaned) return null;

  let nstr = cleaned;
  const hasComma = nstr.includes(",");
  const hasDot = nstr.includes(".");
  if (hasComma && hasDot) {
    if (nstr.lastIndexOf(",") > nstr.lastIndexOf(".")) {
      nstr = nstr.replace(/\./g, "").replace(",", ".");
    } else {
      nstr = nstr.replace(/,/g, "");
    }
  } else if (hasComma) {
    nstr = nstr.replace(",", ".");
  }

  const n = Number(nstr);
  return Number.isFinite(n) ? n : null;
}

/** Extrae el valor de escala (el número más grande) de textos tipo "0-100 psi" o "100". */
export function parseAlcanceValue(raw: string): number | null {
  const matches = String(raw || "").match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches?.length) return null;
  let max: number | null = null;
  for (const m of matches) {
    const n = parseNumericToken(m);
    if (n == null || n <= 0) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

export function parseResolucionValue(raw: string): number | null {
  const n = parseNumericToken(String(raw || "").match(/-?\d+(?:[.,]\d+)?/)?.[0] || "");
  return n != null && n > 0 ? n : null;
}

export function nPuntosDesdeClase(clase: number): number {
  if (!Number.isFinite(clase) || clase <= 0) return 5;
  if (clase <= 0.6) return 8;
  if (clase <= 2.5) return 5;
  return 3;
}

/** U expandida k=2 a partir de resolución (distribución rectangular de media división). */
export function uExpandidaDesdeResolucion(resolucion: number): number {
  if (!(resolucion > 0)) return 0;
  const uRes = resolucion / (2 * Math.sqrt(3));
  return K_COVERAGE * uRes;
}

export function buildAlcanceResolucionSpec(
  alcanceRaw: string,
  resolucionRaw: string
): AlcanceResolucionSpec | null {
  const alcance = parseAlcanceValue(alcanceRaw);
  const resolucion = parseResolucionValue(resolucionRaw);
  if (alcance == null || resolucion == null) return null;
  if (resolucion > alcance) return null;
  const clase = (resolucion / alcance) * 100;
  return {
    alcance,
    resolucion,
    clase,
    nPuntos: nPuntosDesdeClase(clase),
    empAprox: resolucion,
    uExpandida: uExpandidaDesdeResolucion(resolucion),
  };
}

export function decimalsForResolution(resolucion: number): number {
  if (!(resolucion > 0)) return 2;
  const r = resolucion.toString().toLowerCase();
  if (r.includes("e")) {
    const n = Math.ceil(-Math.log10(resolucion));
    return Math.max(0, Math.min(8, n));
  }
  const frac = r.split(".")[1];
  if (!frac) return 0;
  return Math.min(8, frac.length);
}

export function formatPuntoValue(value: number, resolucion: number): string {
  const d = decimalsForResolution(resolucion);
  const rounded = resolucion > 0 ? Math.round(value / resolucion) * resolucion : value;
  let s = rounded.toFixed(d);
  if (d > 0) s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return s;
}

function uniqueSorted(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (!out.length || Math.abs(out[out.length - 1] - v) > 1e-9) out.push(v);
  }
  return out;
}

/** Puntos equidistantes 0-excluido: 20,40,…,alcance (N según clase). */
export function generatePuntosNominales(spec: AlcanceResolucionSpec): string[] {
  const { alcance, resolucion, nPuntos } = spec;
  const raw: number[] = [];
  for (let i = 1; i <= nPuntos; i++) {
    raw.push((alcance * i) / nPuntos);
  }
  raw[raw.length - 1] = alcance;
  const rounded = uniqueSorted(
    raw.map((v) => (resolucion > 0 ? Math.round(v / resolucion) * resolucion : v))
  );
  if (rounded[rounded.length - 1] !== alcance) {
    const last = resolucion > 0 ? Math.round(alcance / resolucion) * resolucion : alcance;
    if (!rounded.length || Math.abs(rounded[rounded.length - 1] - last) > 1e-9) {
      rounded.push(last);
    } else {
      rounded[rounded.length - 1] = last;
    }
  }
  return rounded.filter((v) => v > 0).map((v) => formatPuntoValue(v, resolucion));
}

export function tokenizeMedicionField(texto: string): string[] {
  const lines = String(texto || "").split(/\r?\n/);
  const tokens: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.endsWith(":")) continue;
    const commaCount = (trimmed.match(/,/g) || []).length;
    if (commaCount >= 2 || /;/.test(trimmed) || (commaCount >= 1 && /\s/.test(trimmed))) {
      for (const part of trimmed.split(/[;,\t]+/)) {
        const p = part.trim();
        if (p) tokens.push(p);
      }
      continue;
    }
    tokens.push(trimmed);
  }
  return tokens;
}

/** Parte un campo conservando filas vacías (para que Agregar punto no se pierda al sincronizar). */
function splitMedicionLines(texto: string): string[] {
  if (texto == null || texto === "") return [];
  return String(texto).split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed.endsWith(":")) return "";
    const commaCount = (trimmed.match(/,/g) || []).length;
    if (trimmed && (commaCount >= 2 || /;/.test(trimmed))) {
      return trimmed
        .split(/[;,\t]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .join("\n");
    }
    return trimmed;
  });
}

export function parseMedicionPairs(patron: string, instrumento: string): PuntoMedicion[] {
  const pRaw = splitMedicionLines(patron);
  const iRaw = splitMedicionLines(instrumento);
  const p = pRaw.flatMap((cell) => (cell.includes("\n") ? cell.split("\n") : [cell]));
  const i = iRaw.flatMap((cell) => (cell.includes("\n") ? cell.split("\n") : [cell]));
  const n = Math.max(p.length, i.length);
  if (n === 0) return [];
  const rows: PuntoMedicion[] = [];
  for (let idx = 0; idx < n; idx++) {
    rows.push({ patron: p[idx] || "", instrumento: i[idx] || "" });
  }
  return rows;
}

export function serializeMedicionPairs(rows: PuntoMedicion[]): {
  medicionPatron: string;
  medicionInstrumento: string;
} {
  return {
    medicionPatron: rows.map((r) => r.patron).join("\n"),
    medicionInstrumento: rows.map((r) => r.instrumento).join("\n"),
  };
}

export function calcDictamenPunto(
  row: PuntoMedicion,
  spec: AlcanceResolucionSpec | null,
  empOverride: number | null
): DictamenPuntoCalc {
  const patron = parseNumericToken(row.patron);
  const inst = parseNumericToken(row.instrumento);
  if (patron == null || inst == null) {
    return { error: null, u: null, eMasU: null, emp: spec?.empAprox ?? null, dictamen: "" };
  }
  const error = inst - patron;
  const u = spec?.uExpandida ?? null;
  const emp = empOverride != null && empOverride > 0 ? empOverride : spec?.empAprox ?? null;
  const eMasU = u != null ? Math.abs(error) + u : Math.abs(error);
  let dictamen: DictamenPunto = "";
  if (emp != null && emp > 0) {
    dictamen = eMasU <= emp + 1e-12 ? "PASA" : "NO PASA";
  }
  return { error, u, eMasU, emp, dictamen };
}

export function calcDictamenGlobal(
  rows: PuntoMedicion[],
  spec: AlcanceResolucionSpec | null,
  empOverride: number | null
): DictamenGlobal {
  const calcs = rows.map((r) => calcDictamenPunto(r, spec, empOverride));
  const evaluados = calcs.filter((c) => c.dictamen !== "");
  const fallidos = evaluados.filter((c) => c.dictamen === "NO PASA").length;
  let dictamen: DictamenGlobal["dictamen"] = "PENDIENTE";
  if (evaluados.length > 0) dictamen = fallidos > 0 ? "NO PASA" : "PASA";
  return {
    dictamen,
    evaluados: evaluados.length,
    fallidos,
    clase: spec?.clase ?? null,
    nPuntos: spec?.nPuntos ?? null,
    empAprox: empOverride != null && empOverride > 0 ? empOverride : spec?.empAprox ?? null,
    uExpandida: spec?.uExpandida ?? null,
  };
}

export function formatMetrologyNumber(value: number | null, resolucion: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const d = Math.max(decimalsForResolution(resolucion && resolucion > 0 ? resolucion : 0.01) + 1, 2);
  return value.toFixed(Math.min(6, d));
}
