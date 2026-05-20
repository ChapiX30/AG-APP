import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

/** Evita enlazar Drive con filas cuyo id/folio/certificado están vacíos (matcheo masivo). */
export const isLinkableWorksheetId = (id: string): boolean => {
  const t = (id || "").trim();
  return t.length >= 2;
};

/** Primer token del nombre de archivo (sin extensión ni sufijo duplicado). */
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
  /** worksheets/* con fileMetadata.completed === true */
  completedIds: Set<string>;
  /** worksheets/* con fileMetadata.reviewed === true */
  reviewedIds: Set<string>;
  /** certificados/* — PDF firmado enlazado por nombre */
  certificadoIds: Set<string>;
}

/** Índice de estado real en Drive (colección fileMetadata, misma fuente que DriveScreen). */
export const buildDriveTruthIndex = async (): Promise<DriveTruthIndex> => {
  const completedIds = new Set<string>();
  const reviewedIds = new Set<string>();
  const certificadoIds = new Set<string>();

  const snap = await getDocs(collection(db, "fileMetadata"));
  snap.forEach((docSnap) => {
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

/**
 * ¿La fila realmente completó el flujo en Drive?
 * - worksheets: fileMetadata.completed o reviewed
 * - certificados: archivo en ruta certificados o pdfURL + Firmado
 */
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

export interface ReconcileRowPreview {
  docId: string;
  linkIds: string[];
  equipo?: string;
  cliente?: string;
  before: { cargado_drive?: string; status_certificado?: string };
}

export interface ReconcileWorksheetDriveResult {
  scanned: number;
  candidates: number;
  corrected: number;
  skippedVerified: number;
  previews: ReconcileRowPreview[];
}

/** Resuelve una única hoja; evita actualizar filas con id/folio vacíos. */
export const resolveWorksheetDoc = async (
  possibleId: string
): Promise<DocumentSnapshot | null> => {
  if (!isLinkableWorksheetId(possibleId)) return null;
  const tryQueries = [
    query(collection(db, "hojasDeTrabajo"), where("certificado", "==", possibleId)),
    query(collection(db, "hojasDeTrabajo"), where("id", "==", possibleId)),
    query(collection(db, "hojasDeTrabajo"), where("folio", "==", possibleId)),
  ];
  for (const q of tryQueries) {
    const snap = await getDocs(q);
    if (snap.size === 1) return snap.docs[0];
    if (snap.size > 1) {
      const sorted = [...snap.docs].sort((a, b) => {
        const ta = new Date(
          a.data().createdAt || a.data().fechaEntrada || 0
        ).getTime();
        const tb = new Date(
          b.data().createdAt || b.data().fechaEntrada || 0
        ).getTime();
        return tb - ta;
      });
      return sorted[0];
    }
  }
  return null;
};

/**
 * Reconcilia hojasDeTrabajo contra fileMetadata (fuente de verdad de DriveScreen).
 * Solo escribe filas donde Drive confirma que NO están completadas.
 *
 * La reconciliación periódica (cada 5 min) corre en Cloud Function
 * `scheduledDriveReconcile`; el tablero solo usa esto para acción manual / vista previa.
 */
export const reconcileWorksheetDriveFlags = async (
  rows: { docId: string; [key: string]: unknown }[],
  options?: { dryRun?: boolean; maxWrites?: number }
): Promise<ReconcileWorksheetDriveResult> => {
  const dryRun = options?.dryRun ?? false;
  const maxWrites = options?.maxWrites ?? 400;
  const index = await buildDriveTruthIndex();

  const previews: ReconcileRowPreview[] = [];
  let candidates = 0;
  let skippedVerified = 0;

  const toFix: { docId: string; preview: ReconcileRowPreview }[] = [];

  for (const row of rows) {
    if (!shouldResetWorksheetDriveFlags(row, index)) continue;
    candidates++;
    const preview: ReconcileRowPreview = {
      docId: row.docId,
      linkIds: getWorksheetLinkIds(row),
      equipo: String(row.equipo ?? ""),
      cliente: String(row.cliente ?? ""),
      before: {
        cargado_drive: String(row.cargado_drive ?? ""),
        status_certificado: String(row.status_certificado ?? ""),
      },
    };
    previews.push(preview);
    toFix.push({ docId: row.docId, preview });
  }

  for (const row of rows) {
    if (!isDriveMarkedInFirestore(row)) continue;
    if (isRowActuallyCompleteInDrive(row, index)) skippedVerified++;
  }

  if (dryRun || toFix.length === 0) {
    return {
      scanned: rows.length,
      candidates,
      corrected: 0,
      skippedVerified,
      previews,
    };
  }

  let corrected = 0;
  const patch = resetDriveFieldsPatch();
  const batch = writeBatch(db);
  let batchCount = 0;

  for (const item of toFix.slice(0, maxWrites)) {
    batch.update(doc(db, "hojasDeTrabajo", item.docId), patch);
    batchCount++;
    corrected++;
    if (batchCount >= 450) break;
  }

  if (batchCount > 0) await batch.commit();

  return {
    scanned: rows.length,
    candidates,
    corrected,
    skippedVerified,
    previews,
  };
};

/** Verifica un archivo concreto en fileMetadata (misma clave que DriveScreen). */
export const getFileMetadataDriveStatus = async (
  fullPath: string
): Promise<{ completed: boolean; reviewed: boolean } | null> => {
  const docId = fullPath.replace(/\//g, "_");
  const snap = await getDoc(doc(db, "fileMetadata", docId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    completed: data.completed === true,
    reviewed: data.reviewed === true,
  };
};
