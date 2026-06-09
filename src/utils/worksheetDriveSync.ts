import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { getTechnicianFolderFromWorksheet } from "./worksheetPdfGenerator";

/** Evita enlazar Drive con filas cuyo id/folio/certificado están vacíos (matcheo masivo). */
export const isLinkableWorksheetId = (id: string): boolean => {
  const t = (id || "").trim();
  return t.length >= 2;
};

export const EQUIPMENT_ID_RE = /^[A-Za-z]{2,}-\d+$/;

export const isEquipmentIdSearchTerm = (term: string) =>
  EQUIPMENT_ID_RE.test(term.trim());

/** Primer token del nombre de archivo (sin extensión ni sufijo duplicado). */
export const extractWorksheetLinkId = (fileName: string): string =>
  fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/\s*\(\d+\)/, "")
    .split(/[_ ]/)[0]
    .trim();

/** ID de equipo al final del nombre: AGPT-0531-26_EP-52889.pdf → EP-52889 */
export const extractEquipmentIdFromFileName = (fileName: string): string => {
  const base = (fileName || "").replace(/\.[^/.]+$/, "").trim();
  if (!base) return "";
  const segments = base.split(/[_ ]+/).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (EQUIPMENT_ID_RE.test(segments[i])) return segments[i];
  }
  return "";
};

const compactAlphanumeric = (text: string) =>
  (text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** ¿El archivo de Drive corresponde a este ID de equipo (EP-52889, MS-182)? */
export const driveFileMatchesEquipmentId = (
  fileName: string,
  equipmentId: string
): boolean => {
  const id = equipmentId.trim();
  if (!id || !EQUIPMENT_ID_RE.test(id)) return false;
  const idNorm = id.toLowerCase();
  const fromName = extractEquipmentIdFromFileName(fileName).toLowerCase();
  if (fromName === idNorm) return true;

  const hay = (fileName || "").toLowerCase();
  const boundaryRe = new RegExp(
    `(^|[^a-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
    "i"
  );
  if (boundaryRe.test(hay)) return true;

  const compactId = compactAlphanumeric(id);
  const compactName = compactAlphanumeric(fileName);
  return compactId.length >= 4 && compactName.includes(compactId);
};

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

/** True when the worksheet row has no PDF in Firebase Storage yet. */
export const worksheetLacksDrivePdf = (row: Record<string, unknown>): boolean => {
  const pdfURL = String(row.pdfURL ?? "").trim();
  return !pdfURL.includes("firebasestorage.googleapis.com");
};

/** Lookup by Firestore doc id or by id / certificado / folio field. */
export const resolveWorksheetBySearchTerm = async (
  term: string
): Promise<DocumentSnapshot | null> => {
  const t = term.trim();
  if (t.length < 2) return null;

  // ID de equipo (MS-182): priorizar campo id exacto
  if (isEquipmentIdSearchTerm(t)) {
    const target = t.trim();
    const targetNorm = target.toLowerCase();
    const variants = [...new Set([target, target.toUpperCase(), target.toLowerCase()])];

    for (const id of variants) {
      const byId = await getDocs(
        query(collection(db, "hojasDeTrabajo"), where("id", "==", id))
      );
      if (byId.size >= 1) {
        const exact = byId.docs.find(
          (d) => String(d.data().id ?? "").trim().toLowerCase() === targetNorm
        );
        if (exact) return exact;
        if (byId.size === 1) return byId.docs[0];
        const sorted = [...byId.docs].sort((a, b) => {
          const ta = new Date(a.data().createdAt || a.data().fechaEntrada || 0).getTime();
          const tb = new Date(b.data().createdAt || b.data().fechaEntrada || 0).getTime();
          return tb - ta;
        });
        return sorted[0];
      }
    }

    // Respaldo: rango por prefijo y filtro exacto en cliente
    try {
      const upper = target.toUpperCase();
      const rangeSnap = await getDocs(
        query(
          collection(db, "hojasDeTrabajo"),
          where("id", ">=", upper),
          where("id", "<=", upper + "\uf8ff"),
          limit(20)
        )
      );
      const ranged = rangeSnap.docs.find(
        (d) => String(d.data().id ?? "").trim().toLowerCase() === targetNorm
      );
      if (ranged) return ranged;
    } catch {
      /* índice de rango opcional */
    }
  }

  if (t.length >= 12 && /^[A-Za-z0-9]+$/.test(t)) {
    const direct = await getDoc(doc(db, "hojasDeTrabajo", t));
    if (direct.exists()) return direct;
  }

  return resolveWorksheetDoc(t);
};

export interface PendingWorksheetDriveEntry {
  name: string;
  rawName: string;
  url: string;
  fullPath: string;
  updated: string;
  created: string;
  parentFolder: string;
  isPendingWorksheet: true;
  worksheetDocId: string;
  worksheetId?: string;
  worksheetCliente?: string;
  worksheetEquipo?: string;
  notas?: string;
  keywords?: string[];
  size: number;
  contentType: string;
  uploadedBy?: string;
  workDate?: string;
}

/** Virtual Drive row when search matches a hojasDeTrabajo row (con o sin PDF en Drive). */
export const buildPendingWorksheetDriveEntry = (
  wsDoc: DocumentSnapshot,
  options?: { allowWithPdfUrl?: boolean }
): PendingWorksheetDriveEntry | null => {
  const data = wsDoc.data() as Record<string, unknown> | undefined;
  if (!data) return null;

  const lacksPdf = worksheetLacksDrivePdf(data);
  if (!lacksPdf && !options?.allowWithPdfUrl) return null;

  const cert = String(data.certificado || data.folio || "SIN-CERT").trim();
  const equipmentId = String(data.id || "").trim() || "SINID";
  const rawName = `${cert}_${equipmentId}.pdf`;
  const technician = getTechnicianFolderFromWorksheet(data);
  const cliente = String(data.cliente || "").trim();
  const equipo = String(data.equipo || "").trim();
  const folio = String(data.folio || "").trim();

  const notas = lacksPdf
    ? `Hoja sin PDF en Drive — ${cliente || "—"} / ${equipo || "—"}. Use «Generar PDF».`
    : `Hoja ${equipmentId} en Friday — el PDF no está en Drive o está desactualizado. Use «Generar PDF».`;

  return {
    name: `${cert}_${equipmentId}`,
    rawName,
    url: "",
    fullPath: `pending-worksheet/${wsDoc.id}`,
    updated: String(data.lastUpdated || data.fecha || new Date().toISOString()),
    created: String(data.createdAt || data.fechaEntrada || data.fecha || ""),
    parentFolder: technician,
    isPendingWorksheet: true,
    worksheetDocId: wsDoc.id,
    worksheetId: equipmentId,
    worksheetCliente: cliente || undefined,
    worksheetEquipo: equipo || undefined,
    notas,
    keywords: [equipmentId, cert, folio, wsDoc.id].filter(Boolean),
    size: 0,
    contentType: "application/pdf",
    uploadedBy: technician,
    workDate: String(data.fecha || data.fecha_calib || "").trim() || undefined,
  };
};

/**
 * Fila virtual «Sin PDF» solo si Friday confirma que no hay PDF en Storage.
 * Si ya existe PDF (EP-52889 en carpeta), devuelve null y se muestra el archivo real.
 */
export const buildWorksheetSearchEntry = (
  wsDoc: DocumentSnapshot,
  existingFiles: Array<{ rawName?: string; name: string; isPendingWorksheet?: boolean }> = []
): PendingWorksheetDriveEntry | null => {
  const data = wsDoc.data() as Record<string, unknown> | undefined;
  if (!data) return null;

  const equipmentId = String(data.id || "").trim();
  if (
    equipmentId &&
    existingFiles.some(
      (f) =>
        !f.isPendingWorksheet &&
        driveFileMatchesEquipmentId(f.rawName || f.name, equipmentId)
    )
  ) {
    return null;
  }

  if (!worksheetLacksDrivePdf(data)) return null;

  return buildPendingWorksheetDriveEntry(wsDoc);
};

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
  if (/^\d+$/.test(possibleId)) {
    tryQueries.push(
      query(collection(db, "hojasDeTrabajo"), where("id", "==", Number(possibleId)))
    );
  }
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
 * Reconciliación periódica: Cloud Function `scheduledDriveReconcile` (cada 5 min)
 * y respaldo en tablero (AG-Bot al cargar + intervalo cada 5 min con tablero abierto).
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
