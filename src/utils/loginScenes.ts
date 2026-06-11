/** Escena de carga para metrólogos según especialidad / usuario. */
export type MetrologyScene = "electrical" | "dimensional" | "torque";

export const METROLOGY_SCENE_MSG: Record<MetrologyScene, { title: string; sub: string }> = {
  electrical: {
    title: "Preparando estación",
    sub: "Cargando patrones y referencias eléctricas",
  },
  dimensional: {
    title: "Preparando estación",
    sub: "Verificando bloques patrón y calibración dimensional",
  },
  torque: {
    title: "Preparando estación",
    sub: "Cargando patrones de torque y referencia",
  },
};

/** Nombre normalizado para comparar sin acentos ni espacios extra. */
export const normalizePersonName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

/**
 * Mapa de prueba por nombre completo.
 * Ampliar aquí cuando haya más metrólogos con escena definida.
 */
const SCENE_BY_FULL_NAME: Record<string, MetrologyScene> = {
  "edgar amador": "electrical",
  "ricardo dominguez": "dimensional",
  "abraham ginez": "torque",
};

const matchesFullName = (normalized: string, fullNameKey: string): boolean => {
  const parts = fullNameKey.split(" ").filter(Boolean);
  return parts.length >= 2 && parts.every((part) => normalized.includes(part));
};

/** Resuelve escena metrológica por nombre del usuario (fallback: eléctrica). */
export const resolveMetrologyScene = (name: string): MetrologyScene => {
  const normalized = normalizePersonName(name);
  if (!normalized) return "electrical";

  const exact = SCENE_BY_FULL_NAME[normalized];
  if (exact) return exact;

  for (const [key, scene] of Object.entries(SCENE_BY_FULL_NAME)) {
    if (matchesFullName(normalized, key)) return scene;
  }

  return "electrical";
};
