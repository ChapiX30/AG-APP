import { doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { normalizeDriveDate } from "./driveFileMetadata";
import {
  extractWorksheetLinkId,
  getWorksheetLinkIds,
  resolveWorksheetDoc,
} from "./worksheetDriveSync";
import {
  buildWorksheetPdfStoragePath,
  getTechnicianFolderFromWorksheet,
} from "./worksheetPdfGenerator";
import { notificarCalidadRevisionPendiente } from "./notificacionesRevisionCalidad";

/** Metrólogo terminó la hoja (no confundir con PDF subido → cargado_drive "Si"). */
const isRealizadoValue = (value: unknown): boolean => {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return v === "realizado";
};

export async function findFileMetadataIdsForWorksheet(
  row: Record<string, unknown>
): Promise<string[]> {
  const linkIds = new Set(getWorksheetLinkIds(row));
  const found: string[] = [];

  const tech = getTechnicianFolderFromWorksheet(row);
  const cert = String(row.certificado || row.folio || "").trim();
  const equipmentId = String(row.id || "").trim();
  if (cert && equipmentId) {
    const path = buildWorksheetPdfStoragePath(tech, cert, equipmentId);
    const metaId = path.replace(/\//g, "_");
    const snap = await getDoc(doc(db, "fileMetadata", metaId));
    if (snap.exists()) found.push(metaId);
  }

  if (found.length > 0) return [...new Set(found)];

  if (linkIds.size === 0) return [];

  const snap = await getDocs(collection(db, "fileMetadata"));
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const fullPath = String(data.filePath || "");
    if (!fullPath.includes("worksheets")) return;
    const linkId = extractWorksheetLinkId(String(data.name || ""));
    if (linkIds.has(linkId)) found.push(docSnap.id);
  });

  return [...new Set(found)];
}

/** Crea fileMetadata.completed aunque el PDF aún no esté en Storage (p. ej. Realizado en tablero). */
async function ensureFileMetadataStubForWorksheet(
  row: Record<string, unknown>,
  completedByName: string
): Promise<string[]> {
  const cert = String(row.certificado || row.folio || "").trim();
  const equipmentId = String(row.id || "").trim();
  if (!cert && !equipmentId) return [];

  const tech = getTechnicianFolderFromWorksheet(row);
  const storagePath = buildWorksheetPdfStoragePath(tech, cert, equipmentId);
  const metaId = storagePath.replace(/\//g, "_");
  const fileName = `${cert || "SIN-CERT"}_${equipmentId || "SINID"}.pdf`;
  const now = normalizeDriveDate(new Date());

  await setDoc(
    doc(db, "fileMetadata", metaId),
    {
      name: fileName,
      filePath: storagePath,
      completed: true,
      completedByName,
      reviewed: false,
      reviewedByName: null,
      uploadedBy: completedByName,
      created: now,
      updated: now,
    },
    { merge: true }
  );

  return [metaId];
}

export interface MarkDriveCompletedOptions {
  notify?: boolean;
  worksheetDocId?: string;
}

/** Marca fileMetadata.completed=true para la hoja vinculada y opcionalmente notifica a calidad. */
export async function markDriveFileCompletedForWorksheet(
  row: Record<string, unknown>,
  completedByName: string,
  options?: MarkDriveCompletedOptions
): Promise<boolean> {
  let metaIds = await findFileMetadataIdsForWorksheet(row);
  if (metaIds.length === 0) {
    metaIds = await ensureFileMetadataStubForWorksheet(row, completedByName);
  }

  const equipmentId = String(row.id || "").trim();
  const cliente = String(row.cliente || "").trim();
  const fecha = String(row.fecha || row.fecha_calib || row.fechaEntrada || "").trim();
  const worksheetDocId =
    options?.worksheetDocId || String(row.docId || "").trim();

  if (metaIds.length === 0) {
    if (options?.notify !== false) {
      await notificarCalidadRevisionPendiente({
        worksheetDocId: worksheetDocId || equipmentId,
        equipmentId,
        cliente,
        fecha,
        tecnicoNombre: completedByName,
      });
    }
    return false;
  }

  let notified = false;

  for (const metaId of metaIds) {
    const ref = doc(db, "fileMetadata", metaId);
    const existing = await getDoc(ref);
    const wasCompleted = existing.data()?.completed === true;

    await setDoc(
      ref,
      {
        completed: true,
        completedByName,
      },
      { merge: true }
    );

    if (!wasCompleted && options?.notify !== false && !notified) {
      await notificarCalidadRevisionPendiente({
        worksheetDocId: worksheetDocId || metaId,
        equipmentId,
        cliente,
        fecha,
        tecnicoNombre: completedByName,
        metaId,
      });
      notified = true;
    }
  }

  return true;
}

/** Marca completado por ruta de archivo en Drive (DriveScreen). */
export async function markDriveFileCompletedByPath(
  fullPath: string,
  completedByName: string,
  options?: { notify?: boolean }
): Promise<void> {
  const metaId = fullPath.replace(/\//g, "_");
  const ref = doc(db, "fileMetadata", metaId);
  const existing = await getDoc(ref);
  const wasCompleted = existing.data()?.completed === true;

  await setDoc(
    ref,
    {
      completed: true,
      completedByName,
    },
    { merge: true }
  );

  if (wasCompleted || options?.notify === false) return;

  const rawName = String(existing.data()?.name || fullPath.split("/").pop() || "");
  const linkId = extractWorksheetLinkId(rawName);
  const wsDoc = await resolveWorksheetDoc(linkId);
  const wsData = (wsDoc?.data() || {}) as Record<string, unknown>;

  await notificarCalidadRevisionPendiente({
    worksheetDocId: wsDoc?.id || metaId,
    equipmentId: String(wsData.id || linkId).trim(),
    cliente: String(wsData.cliente || "").trim(),
    fecha: String(wsData.fecha || wsData.fecha_calib || wsData.fechaEntrada || "").trim(),
    tecnicoNombre: completedByName,
    metaId,
  });
}

export { isRealizadoValue };
