/**
 * Lógica de reconciliación Drive ↔ hojasDeTrabajo (Admin SDK).
 * Reglas espejo de src/utils/worksheetDriveSync.ts (cliente).
 */
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const isLinkableWorksheetId = (id: string): boolean => {
  const t = (id || "").trim();
  return t.length >= 2;
};

export const extractWorksheetLinkId = (fileName: string): string =>
  fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/\s*\(\d+\)/, "")
    .split(/[_ ]/)[0]
    .trim();

export const getWorksheetLinkIds = (row: Record<string, unknown>): string[] => {
  const candidates = [row.id, row.folio, row.folioSalida, row.certificado]
    .map((v) => String(v ?? "").trim())
    .filter(isLinkableWorksheetId);
  return [...new Set(candidates)];
};

export interface DriveTruthIndex {
  completedIds: Set<string>;
  reviewedIds: Set<string>;
  certificadoIds: Set<string>;
}

const FILE_METADATA_PATH_PREFIXES = ["worksheets/", "certificados/"] as const;

const loadRelevantFileMetadata = async (db: Firestore) => {
  const seen = new Set<string>();
  const docs: QueryDocumentSnapshot[] = [];
  for (const prefix of FILE_METADATA_PATH_PREFIXES) {
    const snap = await db
      .collection("fileMetadata")
      .where("filePath", ">=", prefix)
      .where("filePath", "<=", `${prefix}\uf8ff`)
      .get();
    for (const docSnap of snap.docs) {
      if (!seen.has(docSnap.id)) {
        seen.add(docSnap.id);
        docs.push(docSnap);
      }
    }
  }
  return docs;
};

export const buildDriveTruthIndex = async (
  db: Firestore
): Promise<DriveTruthIndex> => {
  const completedIds = new Set<string>();
  const reviewedIds = new Set<string>();
  const certificadoIds = new Set<string>();

  const metadataDocs = await loadRelevantFileMetadata(db);
  metadataDocs.forEach((docSnap) => {
    const data = docSnap.data();
    const rawName = String(data.name || "");
    const fullPath = String(data.filePath || "");
    const linkId = extractWorksheetLinkId(rawName);
    if (!isLinkableWorksheetId(linkId)) return;

    if (fullPath.includes("certificados")) {
      certificadoIds.add(linkId);
      if (data.reviewed === true) reviewedIds.add(linkId);
      return;
    }

    if (fullPath.includes("worksheets")) {
      if (data.completed === true) completedIds.add(linkId);
      if (data.reviewed === true) reviewedIds.add(linkId);
    }
  });

  return { completedIds, reviewedIds, certificadoIds };
};

const isDriveMarkedInFirestore = (row: Record<string, unknown>): boolean => {
  const drive = String(row.cargado_drive ?? "")
    .trim()
    .toLowerCase();
  const cert = String(row.status_certificado ?? "").trim();
  const driveMarked = drive === "si" || drive === "realizado";
  const certMarked =
    cert === "Generado" ||
    cert === "Firmado" ||
    cert === "Finalizado";
  return driveMarked || certMarked;
};

export const isRowActuallyCompleteInDrive = (
  row: Record<string, unknown>,
  index: DriveTruthIndex
): boolean => {
  const linkIds = getWorksheetLinkIds(row);
  const certStatus = String(row.status_certificado ?? "").trim();
  const pdfURL = String(row.pdfURL ?? "").trim();

  if (certStatus === "Firmado" && pdfURL.length > 20) return true;

  if (linkIds.length === 0) return false;

  if (linkIds.some((id) => index.reviewedIds.has(id))) return true;
  if (linkIds.some((id) => index.completedIds.has(id))) return true;
  if (linkIds.some((id) => index.certificadoIds.has(id))) return true;

  return false;
};

export const shouldResetWorksheetDriveFlags = (
  row: Record<string, unknown>,
  index: DriveTruthIndex
): boolean => {
  if (!isDriveMarkedInFirestore(row)) return false;
  return !isRowActuallyCompleteInDrive(row, index);
};

export const resetDriveFieldsPatch = () => ({
  cargado_drive: "No",
  status_certificado: "Pendiente de Certificado",
  lastUpdated: new Date().toISOString(),
});

export interface ReconcileWorksheetDriveResult {
  scanned: number;
  candidates: number;
  corrected: number;
  skippedVerified: number;
  errors: number;
}

const FIRESTORE_BATCH_LIMIT = 450;

/**
 * Reconcilia filas de hojasDeTrabajo contra fileMetadata.
 * Solo escribe filas sin respaldo real en Drive (misma seguridad que el cliente).
 */
export const reconcileWorksheetDriveFlags = async (
  db: Firestore,
  rows: { docId: string; [key: string]: unknown }[],
  options?: { dryRun?: boolean; maxWrites?: number }
): Promise<ReconcileWorksheetDriveResult> => {
  const dryRun = options?.dryRun ?? false;
  const maxWrites = options?.maxWrites ?? 400;
  const index = await buildDriveTruthIndex(db);

  let candidates = 0;
  let skippedVerified = 0;
  const toFix: string[] = [];

  for (const row of rows) {
    if (isDriveMarkedInFirestore(row) && isRowActuallyCompleteInDrive(row, index)) {
      skippedVerified++;
    }
    if (!shouldResetWorksheetDriveFlags(row, index)) continue;
    candidates++;
    toFix.push(row.docId);
  }

  if (dryRun || toFix.length === 0) {
    return {
      scanned: rows.length,
      candidates,
      corrected: 0,
      skippedVerified,
      errors: 0,
    };
  }

  const patch = resetDriveFieldsPatch();
  const docIds = toFix.slice(0, maxWrites);
  let corrected = 0;
  let errors = 0;

  for (let i = 0; i < docIds.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = docIds.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    for (const docId of chunk) {
      batch.update(db.collection("hojasDeTrabajo").doc(docId), patch);
    }
    try {
      await batch.commit();
      corrected += chunk.length;
    } catch (err) {
      console.error("scheduledDriveReconcile batch commit failed:", err);
      errors += chunk.length;
    }
  }

  return {
    scanned: rows.length,
    candidates,
    corrected,
    skippedVerified,
    errors,
  };
};

const DRIVE_MARKED_CARGADO = ["Si", "Realizado"] as const;
const DRIVE_MARKED_CERT = ["Generado", "Firmado", "Finalizado"] as const;

/** Solo filas marcadas en Drive/certificado (candidatas a reconciliación). */
export const loadDriveReconcileCandidateRows = async (
  db: Firestore
): Promise<{ docId: string; [key: string]: unknown }[]> => {
  const byId = new Map<string, { docId: string; [key: string]: unknown }>();

  const [driveSnap, certSnap] = await Promise.all([
    db.collection("hojasDeTrabajo").where("cargado_drive", "in", [...DRIVE_MARKED_CARGADO]).get(),
    db.collection("hojasDeTrabajo").where("status_certificado", "in", [...DRIVE_MARKED_CERT]).get(),
  ]);

  for (const d of driveSnap.docs) {
    byId.set(d.id, { docId: d.id, ...d.data() });
  }
  for (const d of certSnap.docs) {
    if (!byId.has(d.id)) byId.set(d.id, { docId: d.id, ...d.data() });
  }

  return [...byId.values()];
};
