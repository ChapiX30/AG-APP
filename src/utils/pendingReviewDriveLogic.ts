const normalizeCargadoDrive = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/** PDF en Drive (subida o marcado manual); no implica revisión de calidad. */
export const isWorksheetUploadedToDrive = (value: unknown): boolean => {
  const v = normalizeCargadoDrive(value);
  return v === "si" || v === "realizado";
};

/** Metrólogo declaró la hoja terminada (Por revisar). */
export const isWorksheetRealizado = (value: unknown): boolean =>
  normalizeCargadoDrive(value) === "realizado";

/** @deprecated Prefer isWorksheetUploadedToDrive / isWorksheetRealizado */
export const isWorksheetCargadoDrive = isWorksheetUploadedToDrive;

/** Hojas de servicio (HSDG) no pasan por revisión de calidad en Drive. */
export const isServiceSheetDrivePath = (
  fullPath: string,
  fileName?: string
): boolean => {
  const path = String(fullPath || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/");
  const name = String(fileName || "")
    .trim()
    .toUpperCase();
  if (path.includes("hojas de servicio")) return true;
  if (name.startsWith("HSDG-") || name.startsWith("HSDG.")) return true;
  return false;
};

export const isMetadataPendingReview = (data: Record<string, unknown>): boolean =>
  data.reviewed !== true && data.completed === true;

/** Solo certificados/hojas de trabajo pendientes de revisión de calidad. */
export const qualifiesForPendingReviewList = (
  data: Record<string, unknown>,
  fullPath?: string,
  fileName?: string
): boolean => {
  const path = String(fullPath || data.filePath || "");
  const name = String(fileName || data.name || "");
  if (isServiceSheetDrivePath(path, name)) return false;
  return isMetadataPendingReview(data);
};

/** Pendiente de revisión solo para certificados/hojas de trabajo, no hojas de servicio. */
export const isWorksheetPendingReviewFile = (
  meta: Record<string, unknown>,
  fullPath?: string,
  fileName?: string
): boolean => {
  const path = String(fullPath || meta.filePath || "");
  const name = String(fileName || meta.name || "");
  if (isServiceSheetDrivePath(path, name)) return false;
  return isMetadataPendingReview(meta);
};

export const shouldTreatAsPendingReview = (
  meta: Record<string, unknown>,
  worksheetRow?: Record<string, unknown> | null
): boolean => {
  if (isMetadataPendingReview(meta)) return true;
  if (!worksheetRow || meta.reviewed === true) return false;
  return isWorksheetRealizado(worksheetRow.cargado_drive);
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
