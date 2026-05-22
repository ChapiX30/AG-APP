import { doc, getDoc, setDoc } from "firebase/firestore";
import { getMetadata, type UploadResult } from "firebase/storage";
import { parseDateRobust } from "./calibrationShared";
import { db } from "./firebase";
import { extractWorksheetLinkId, resolveWorksheetDoc } from "./worksheetDriveSync";

/** Normaliza Timestamp / ISO / Storage RFC3339 a string ISO para fileMetadata. */
export function normalizeDriveDate(value: unknown, fallback = new Date()): string {
  const parsed = parseDateRobust(value);
  return parsed ? parsed.toISOString() : fallback.toISOString();
}

const toDateKeyLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fecha de trabajo desde hojasDeTrabajo (calibración / entrada). */
export function extractWorkDateFromWorksheet(data: Record<string, unknown>): string | undefined {
  const raw = data.fecha || data.fecha_calib || data.fechaEntrada || data.fechaRecepcion;
  const parsed = parseDateRobust(raw);
  return parsed ? toDateKeyLocal(parsed) : undefined;
}

/** Prefiere workDate almacenado; cae a created/updated si no hay fecha de trabajo. */
export function resolveFileWorkDate(
  meta: Record<string, unknown>,
  fallbacks: unknown[] = []
): string | undefined {
  for (const candidate of [meta.workDate, meta.fecha, ...fallbacks]) {
    const parsed = parseDateRobust(candidate);
    if (parsed) return toDateKeyLocal(parsed);
  }
  return undefined;
}

export async function fetchWorkDateFromWorksheetFileName(
  rawName: string
): Promise<string | undefined> {
  try {
    const possibleId = extractWorksheetLinkId(rawName);
    const wsDoc = await resolveWorksheetDoc(possibleId);
    if (!wsDoc) return undefined;
    return extractWorkDateFromWorksheet(wsDoc.data());
  } catch {
    return undefined;
  }
}

export async function enrichFilesWithWorkDates<
  T extends { rawName?: string; name: string; workDate?: string; fullPath: string }
>(files: T[]): Promise<T[]> {
  const missing = files.filter((f) => !f.workDate);
  if (missing.length === 0) return files;

  const resolved = new Map<string, string>();
  await Promise.all(
    missing.map(async (f) => {
      const workDate = await fetchWorkDateFromWorksheetFileName(f.rawName || f.name);
      if (workDate) resolved.set(f.fullPath, workDate);
    })
  );

  if (resolved.size === 0) return files;

  await Promise.all(
    [...resolved.entries()].map(([fullPath, workDate]) =>
      setDoc(
        doc(db, "fileMetadata", fullPath.replace(/\//g, "_")),
        { workDate },
        { merge: true }
      ).catch(() => {})
    )
  );

  return files.map((f) => {
    const workDate = f.workDate || resolved.get(f.fullPath);
    return workDate ? { ...f, workDate } : f;
  });
}

const normalizeText = (text: string) =>
  text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

const generateSearchTokens = (text: string): string[] => {
  if (!text) return [];
  const normalized = normalizeText(text);
  const parts = normalized.split(/[_ \-\.]+/).filter((p) => p.length > 0);
  return [...new Set([normalized, ...parts])];
};

/** Same display-name cleaning DriveScreen uses for search tokens. */
const cleanFileName = (rawName: string) => {
  if (!rawName) return "Sin Nombre";
  let name = rawName.replace(/^worksheets_/, "");
  const indexAG = name.indexOf("_AG");
  if (indexAG !== -1) return name.substring(indexAG + 1);
  const firstUnderscore = name.indexOf("_");
  if (firstUnderscore !== -1) {
    const firstPart = name.substring(0, firstUnderscore);
    if (firstPart.includes(" ")) return name.substring(firstUnderscore + 1);
  }
  return name;
};

/** Writes fileMetadata after Storage upload (same shape as DriveScreen.processFiles). */
export async function writeDriveFileMetadata(
  fullPath: string,
  uploadResult: UploadResult,
  uploadedBy: string,
  options?: { ubicacion_real?: string; workDate?: string }
): Promise<void> {
  const fileName = fullPath.split("/").pop() || fullPath;
  const docId = fullPath.replace(/\//g, "_");
  const existing = await getDoc(doc(db, "fileMetadata", docId));
  const existingData = existing.exists() ? existing.data() : {};
  const meta = await getMetadata(uploadResult.ref);

  await setDoc(
    doc(db, "fileMetadata", docId),
    {
      name: fileName,
      filePath: fullPath,
      size: meta.size,
      contentType: meta.contentType,
      updated: normalizeDriveDate(meta.updated || meta.timeCreated),
      created: existingData.created
        ? normalizeDriveDate(existingData.created)
        : normalizeDriveDate(meta.timeCreated || meta.updated),
      uploadedBy: uploadedBy || "Desconocido",
      keywords: generateSearchTokens(cleanFileName(fileName)),
      completed: existingData.completed || false,
      completedByName: existingData.completedByName || null,
      reviewed: existingData.reviewed || false,
      reviewedByName: existingData.reviewedByName || null,
      notas: existingData.notas || "",
      ubicacion_real:
        options?.ubicacion_real ||
        existingData.ubicacion_real ||
        existingData.ubicacion ||
        "",
      workDate:
        options?.workDate ||
        existingData.workDate ||
        extractWorkDateFromWorksheet(existingData),
    },
    { merge: true }
  );
}
