import { collection, doc, getDoc, getDocs, query, setDoc, where, limit } from "firebase/firestore";
import { db } from "./firebase";
import {
  buildWorksheetPdfStoragePath,
  getTechnicianFolderFromWorksheet,
} from "./worksheetPdfGenerator";
import { normalizeDriveDate } from "./driveFileMetadata";
import { isWorksheetCargadoDrive } from "./pendingReviewDriveLogic";
export {
  getParentFolderFromPath,
  isMetadataPendingReview,
  isWorksheetCargadoDrive,
  normalizeDriveFullPath,
  resolveTechnicianGroupKey,
  shouldTreatAsPendingReview,
  type DriveGroupingFields,
} from "./pendingReviewDriveLogic";

/** Límite alto en vista global Por Revisar (evita excluir técnicos por `limit(400)`). */
export const PENDING_REVIEW_METADATA_LIMIT = 2500;

export interface PendingReviewBackfillPatch {
  metaId: string;
  filePath: string;
  completed: true;
  completedByName: string;
  uploadedBy: string;
}

async function writePendingReviewMetadata(
  metaId: string,
  filePath: string,
  row: Record<string, unknown>,
  existing: Record<string, unknown>
): Promise<PendingReviewBackfillPatch | null> {
  if (existing.reviewed === true) return null;
  if (existing.completed === true && existing.reviewed !== true) return null;

  const tech = getTechnicianFolderFromWorksheet(row);
  const cert = String(row.certificado || row.folio || existing.name || "").trim();
  const equipmentId = String(row.id || "").trim();
  const completedByName =
    String(existing.completedByName || "").trim() || tech;
  const uploadedBy = String(existing.uploadedBy || "").trim() || tech;
  const fileName =
    String(existing.name || "").trim() ||
    (cert && equipmentId
      ? `${cert}_${equipmentId}.pdf`
      : filePath.split("/").pop() || "archivo.pdf");
  const now = normalizeDriveDate(new Date());

  await setDoc(
    doc(db, "fileMetadata", metaId),
    {
      name: fileName,
      filePath,
      completed: true,
      completedByName,
      uploadedBy,
      reviewed: false,
      reviewedByName: existing.reviewedByName ?? null,
      updated: now,
      ...(existing.created ? {} : { created: now }),
    },
    { merge: true }
  );

  return {
    metaId,
    filePath,
    completed: true,
    completedByName,
    uploadedBy,
  };
}

/** Sincroniza fileMetadata.completed desde hojas con cargado_drive Si/Realizado. */
export async function syncPendingReviewFromWorksheets(
  storageRoot: string = "worksheets",
  options?: { maxWrites?: number }
): Promise<PendingReviewBackfillPatch[]> {
  const maxWrites = options?.maxWrites ?? 300;
  const patches: PendingReviewBackfillPatch[] = [];

  try {
    const [siSnap, realizadoSnap] = await Promise.all([
      getDocs(
        query(collection(db, "hojasDeTrabajo"), where("cargado_drive", "==", "Si"), limit(500))
      ),
      getDocs(
        query(
          collection(db, "hojasDeTrabajo"),
          where("cargado_drive", "==", "Realizado"),
          limit(500)
        )
      ),
    ]);

    const rowsById = new Map<string, Record<string, unknown>>();
    for (const snap of [siSnap, realizadoSnap]) {
      snap.docs.forEach((d) => {
        rowsById.set(d.id, { ...d.data(), docId: d.id });
      });
    }

    const rows = Array.from(rowsById.values());
    const BATCH_SIZE = 25;

    for (let i = 0; i < rows.length && patches.length < maxWrites; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchPatches = await Promise.all(
        batch.map(async (row) => {
          try {
            const tech = getTechnicianFolderFromWorksheet(row);
            const cert = String(row.certificado || row.folio || "").trim();
            const equipmentId = String(row.id || "").trim();
            if (!cert && !equipmentId) return null;

            const filePath = buildWorksheetPdfStoragePath(tech, cert, equipmentId);
            if (!filePath.startsWith(storageRoot)) return null;

            const metaId = filePath.replace(/\//g, "_");
            const existing = await getDoc(doc(db, "fileMetadata", metaId));
            const data = (existing.data() || {}) as Record<string, unknown>;

            return writePendingReviewMetadata(metaId, filePath, row, data);
          } catch (err) {
            console.error("syncPendingReviewFromWorksheets row", err);
            return null;
          }
        })
      );

      for (const patch of batchPatches) {
        if (patch && patches.length < maxWrites) patches.push(patch);
      }
    }

    return patches;
  } catch (err) {
    console.error("syncPendingReviewFromWorksheets", err);
    return patches;
  }
}

/** Marca un archivo concreto como completado si su hoja tiene cargado_drive Si/Realizado. */
export async function syncSingleFilePendingReviewFromWorksheet(
  fullPath: string,
  row: Record<string, unknown>
): Promise<void> {
  if (!isWorksheetCargadoDrive(row.cargado_drive)) return;

  const metaId = fullPath.replace(/\//g, "_");
  const existing = await getDoc(doc(db, "fileMetadata", metaId));
  const data = (existing.data() || {}) as Record<string, unknown>;
  await writePendingReviewMetadata(metaId, fullPath, row, data);
}
