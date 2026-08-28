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

export function normalizeEquipmentId(id: string): string {
  return String(id || "").replace(/\s+/g, "").toUpperCase();
}

export function certEnUsoError(cert: string, existingId: string, incomingId: string): string {
  return `CERT_EN_USO: El certificado ${cert} ya pertenece a ${existingId}. No se puede asignar a ${incomingId}.`;
}

/** Folio ya tomado por otro equipo (omite exceptDocId, p. ej. la hoja que se está editando). */
export function certificadoConflictEquipmentId(
  occupants: Array<{ docId?: string; equipmentId?: string }>,
  incomingId: string,
  exceptDocId?: string | null
): string | null {
  const incoming = normalizeEquipmentId(incomingId);
  for (const row of occupants) {
    if (exceptDocId && row.docId === exceptDocId) continue;
    const existing = normalizeEquipmentId(row.equipmentId || "");
    if (existing && incoming && existing !== incoming) return existing;
  }
  return null;
}

/** Consecutivo ya ligado a una hoja o a un ID de equipo: no reciclar. */
export function consecutivoDocEstaTomado(
  data: { worksheetConfirmado?: unknown; equipoId?: unknown } | null | undefined
): boolean {
  if (!data) return false;
  if (data.worksheetConfirmado === true) return true;
  return Boolean(normalizeEquipmentId(String(data.equipoId || "")));
}

export type ContadorConsecutivoState = {
  huecos: number[];
  valor: number;
};

/** Elige el siguiente número libre, saltando ocupados (huecos primero). */
export function pickNextConsecutivoNumero(
  state: ContadorConsecutivoState,
  ocupados: Set<number>,
  maxSkips = 12
): { numero: number; esReciclado: boolean; nextState: ContadorConsecutivoState } | null {
  let huecos = [...state.huecos].filter((n) => n > 0).sort((a, b) => a - b);
  let valor = Number(state.valor) || 0;
  for (let i = 0; i < maxSkips; i++) {
    const esReciclado = huecos.length > 0;
    const numero = esReciclado ? huecos[0] : valor + 1;
    if (!ocupados.has(numero)) {
      return {
        numero,
        esReciclado,
        nextState: esReciclado
          ? { huecos: huecos.slice(1), valor }
          : { huecos, valor: numero },
      };
    }
    if (esReciclado) huecos = huecos.slice(1);
    else valor = numero;
  }
  return null;
}
