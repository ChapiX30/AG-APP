/**
 * Emparejado hoja de trabajo ↔ hoja de servicio.
 * Evita duplicar IDs y deja de exigir coincidencia literal de nombre de cliente.
 */

const LEGAL_SUFFIX_RE =
  /\b(?:s\.?\s*a\.?\s*(?:de\s*)?c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?(?:\s*de\s*c\.?\s*v\.?)?|s\.?a\.?s\.?|inc\.?)\b/gi;

export function normalizeClienteKey(nombre?: string): string {
  return (nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Nombre comparable: acentos, espacios y sufijos legales (S.A. de C.V., etc.). */
export function canonicalizeClienteNombre(nombre?: string): string {
  return normalizeClienteKey(nombre)
    .replace(LEGAL_SUFFIX_RE, " ")
    .replace(/[.,;()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type EmpresaCatalogo = {
  id: string;
  nombre: string;
};

function nombresEquivalentes(a?: string, b?: string): boolean {
  const ka = canonicalizeClienteNombre(a);
  const kb = canonicalizeClienteNombre(b);
  return Boolean(ka && kb && ka === kb);
}

/**
 * True si la hoja pertenece a la empresa de la hoja de servicio.
 * Prioridad: clienteId → nombre canónico → coincidencia única en catálogo.
 */
export function hojaPerteneceAEmpresa(
  row: { cliente?: string; clienteId?: string },
  empresaNombre: string,
  empresaId?: string,
  catalogo: EmpresaCatalogo[] = []
): boolean {
  const rowClienteId = (row.clienteId || "").trim();
  const serviceClienteId = (empresaId || "").trim();
  if (rowClienteId && serviceClienteId && rowClienteId === serviceClienteId) return true;

  if (nombresEquivalentes(row.cliente, empresaNombre)) return true;

  const rowKey = canonicalizeClienteNombre(row.cliente);
  if (!rowKey || rowKey.length < 5) return false;

  const hits = catalogo.filter((emp) => {
    const empKey = canonicalizeClienteNombre(emp.nombre);
    if (!empKey) return false;
    if (empKey === rowKey) return true;
    const shorter = rowKey.length <= empKey.length ? rowKey : empKey;
    const longer = rowKey.length <= empKey.length ? empKey : rowKey;
    return shorter.length >= 6 && longer.includes(shorter);
  });

  if (hits.length !== 1) return false;
  if (serviceClienteId && hits[0].id === serviceClienteId) return true;
  return nombresEquivalentes(hits[0].nombre, empresaNombre);
}

export function esCalibracionSitio(data: {
  lugarCalibracion?: string;
  ubicacion_real?: string;
}): boolean {
  const lugar = String(data.lugarCalibracion || "").toLowerCase();
  const ubicacion = String(data.ubicacion_real || "").toLowerCase();
  return lugar.includes("sitio") || ubicacion.includes("sitio");
}

/** Parte IDs pegados en un mismo registro: "EP-1, EP-2" / "EP-1; EP-2". */
export function splitEquipoIds(raw?: string): string[] {
  return String(raw || "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Clave estable: EP-001, EP 1, ep–1 → EP-1 */
export function normalizeEquipoIdKey(id: string): string {
  const s = String(id || "")
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, "");
  const m = s.match(/^([A-Z]+)[-_]?0*([0-9]+)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}
