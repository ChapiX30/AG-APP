const isRealizadoValue = (value: unknown): boolean => {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return v === "si" || v === "realizado";
};

export const isWorksheetCargadoDrive = (value: unknown): boolean => {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return v === "si" || isRealizadoValue(value);
};

export const isMetadataPendingReview = (data: Record<string, unknown>): boolean =>
  data.reviewed !== true && data.completed === true;

export const shouldTreatAsPendingReview = (
  meta: Record<string, unknown>,
  worksheetRow?: Record<string, unknown> | null
): boolean => {
  if (isMetadataPendingReview(meta)) return true;
  if (!worksheetRow || meta.reviewed === true) return false;
  return isWorksheetCargadoDrive(worksheetRow.cargado_drive);
};

/** Normaliza rutas guardadas sin prefijo `worksheets/` (común en metadatos antiguos). */
export function normalizeDriveFullPath(
  filePath: unknown,
  rawName: string,
  currentRoot: string
): string {
  let path = String(filePath || "")
    .trim()
    .replace(/\\/g, "/");
  if (!path) path = String(rawName || "").trim();
  if (!path) return `${currentRoot}/unknown`;

  if (path.startsWith(`${currentRoot}/`)) return path;

  if (!path.startsWith(currentRoot) && path.includes("/")) {
    return `${currentRoot}/${path.replace(/^\/+/, "")}`;
  }

  if (!path.includes("/")) {
    return `${currentRoot}/${path}`;
  }

  return path;
};

export const getParentFolderFromPath = (fullPath: string): string => {
  const parts = fullPath.split("/");
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (parent === "worksheets" || parent === "certificados") return "Raíz";
    return parent;
  }
  return "Raíz";
};

export type DriveGroupingFields = {
  fullPath: string;
  parentFolder?: string;
  worksheetTechnician?: string;
  completedByName?: string;
  uploadedBy?: string;
};

/** Agrupa por carpeta de técnico / hojasDeTrabajo (nombre o assignedTo). */
export const resolveTechnicianGroupKey = (file: DriveGroupingFields): string => {
  const fromWorksheet = file.worksheetTechnician?.trim();
  if (fromWorksheet) return fromWorksheet;

  const folder = file.parentFolder?.trim();
  if (folder && folder !== "Raíz") return folder;

  const fromPath = getParentFolderFromPath(file.fullPath);
  if (fromPath !== "Raíz") return fromPath;

  return (
    file.completedByName?.trim() ||
    file.uploadedBy?.trim() ||
    "Sin técnico"
  );
};
