/**
 * Persistencia de hojas de trabajo (online, cola offline, reintentos).
 */

import { collection, addDoc, query, getDocs, where, doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";
import { writeDriveFileMetadata } from "./driveFileMetadata";
import {
  buildWorksheetPdfStoragePath,
  generateTemplatePDF,
  getTechnicianFolderName,
} from "./worksheetPdfGenerator";
import { syncServicioInicioFromWorksheetRecord } from "./servicioAutomation";
import { toWorksheetMagnitud } from "./magnitudWorksheet";
import {
  buildElectricalMeasurementTexts,
  normalizeCanalesPorUnidad,
} from "./electricalChannels";
import { canSaveDirectlyToFirebase } from "./firebaseConnectivity";
import { addToOfflineQueue, isRetriableNetworkError } from "./worksheetOfflineQueue";
import { tryConfirmarWorksheet } from "./worksheetSaveProcessor";
import {
  loadCertificadoOccupants,
  reclamarFolioParaEquipo,
} from "./firebaseConsecutivos";
import {
  certificadoConflictEquipmentId,
  certEnUsoError,
  normalizeEquipmentId,
} from "./consecutivosLogic";
import type { BackgroundSaveJob, WorksheetState } from "../types/worksheet";

const sanitizeWorksheetText = (str: string) =>
  str.replace(/<script.*?>.*?<\/script>/gi, "").trim();

function mergeJobState(job: BackgroundSaveJob): WorksheetState {
  let merged = { ...job.state };
  if (merged.magnitud === "Masa") {
    const str = `1 (Centro): ${job.localExc.p1}\n2 (Inf Izq): ${job.localExc.p2}\n3 (Sup Izq): ${job.localExc.p3}\n4 (Sup Der): ${job.localExc.p4}\n5 (Inf Der): ${job.localExc.p5}`;
    merged = { ...merged, excentricidad: str };
  }
  if (merged.magnitud === "Electrica") {
    const canalesPorUnidad = normalizeCanalesPorUnidad(
      merged.unidad,
      merged.canalesPorUnidad,
      (merged as WorksheetState & { numCanales?: number }).numCanales
    );
    const texts = buildElectricalMeasurementTexts(
      merged.unidad,
      canalesPorUnidad,
      job.electricalValues
    );
    merged = {
      ...merged,
      canalesPorUnidad,
      medicionPatron: texts.medicionPatron,
      medicionInstrumento: texts.medicionInstrumento,
    };
  }
  return merged;
}

interface PreparedSavePayload {
  state: WorksheetState;
  fullData: Record<string, unknown>;
  blob: Blob;
  pdfBase64: string;
  nombreArchivo: string;
  finalDocId: string | null;
  fotoEquipoBase64: string | undefined;
  lugarNormalizado: string;
  previousEquipmentId: string;
  previousPdfUrl: string;
}

async function prepareSavePayload(job: BackgroundSaveJob): Promise<PreparedSavePayload> {
  const state = mergeJobState(job);
  const user = job.user;
  const worksheetId = job.worksheetId;

  const { jsPDF } = await import("jspdf");
  const pdfDoc = generateTemplatePDF(state, jsPDF as Parameters<typeof generateTemplatePDF>[1]);
  const blob = pdfDoc.output("blob");
  const technicianName = getTechnicianFolderName(user);
  const nombreArchivo = buildWorksheetPdfStoragePath(
    technicianName,
    String(state.certificado || ""),
    String(state.id || "")
  );

  let finalDocId: string | null = worksheetId || null;
  let existingData: Record<string, unknown> | null = null;
  const firebaseOk = navigator.onLine ? await canSaveDirectlyToFirebase() : false;

  if (finalDocId && firebaseOk && !existingData) {
    try {
      const existingSnap = await getDoc(doc(db, "hojasDeTrabajo", finalDocId));
      if (existingSnap.exists()) existingData = existingSnap.data();
    } catch (e) {
      if (!isRetriableNetworkError(e)) throw e;
    }
  }

  if (!finalDocId && firebaseOk) {
    try {
      const qDupe = query(
        collection(db, "hojasDeTrabajo"),
        where("id", "==", state.id.trim()),
        where("cliente", "==", state.cliente)
      );
      const dupeDocs = await getDocs(qDupe);
      let bestMatchDate = -1;
      dupeDocs.forEach((d) => {
        const data = d.data();
        if (
          !data.pdfURL ||
          data.status_certificado === "Pendiente de Certificado" ||
          data.status_equipo === "Desconocido" ||
          data.status_equipo === "Recepción"
        ) {
          const docTime = new Date(data.createdAt || data.fechaEntrada || 0).getTime();
          if (docTime > bestMatchDate) {
            bestMatchDate = docTime;
            finalDocId = d.id;
            existingData = data;
          }
        }
      });
    } catch (e) {
      if (isRetriableNetworkError(e)) {
        finalDocId = null;
        existingData = null;
      } else {
        throw e;
      }
    }
  }

  if (firebaseOk && state.certificado?.trim()) {
    const occupants = await loadCertificadoOccupants(state.certificado);
    const conflict = certificadoConflictEquipmentId(
      occupants,
      String(state.id || ""),
      finalDocId
    );
    if (conflict) {
      throw new Error(
        certEnUsoError(
          String(state.certificado).trim(),
          conflict,
          normalizeEquipmentId(String(state.id || ""))
        )
      );
    }
    if (!finalDocId) {
      const incoming = normalizeEquipmentId(String(state.id || ""));
      const same = occupants.find((o) => {
        const eq = normalizeEquipmentId(o.equipmentId);
        return !eq || eq === incoming;
      });
      if (same) {
        finalDocId = same.docId;
        try {
          const snap = await getDoc(doc(db, "hojasDeTrabajo", same.docId));
          if (snap.exists()) existingData = snap.data();
        } catch {
          /* el assert ya validó el folio */
        }
      }
    }
  }

  const previousEquipmentId = String(existingData?.id || "").trim();
  const previousPdfUrl = String(existingData?.pdfURL || "").trim();

  const sanitizedState: WorksheetState = {
    ...state,
    magnitud: toWorksheetMagnitud(state.magnitud),
  };
  for (const key in sanitizedState) {
    if (typeof sanitizedState[key as keyof WorksheetState] === "string") {
      sanitizedState[key as keyof WorksheetState] = sanitizeWorksheetText(
        sanitizedState[key as keyof WorksheetState] as string
      ) as never;
    }
  }

  const { fotoEquipoBase64, ...stateForFirestore } = sanitizedState;
  const lugarNormalizado =
    stateForFirestore.lugarCalibracion.toLowerCase() === "sitio" ? "sitio" : "laboratorio";

  const clienteId = String(stateForFirestore.clienteId || existingData?.clienteId || "").trim();

  const tecnicoNombre = String(stateForFirestore.nombre || job.user?.name || "").trim();

  const fullData: Record<string, unknown> = {
    ...stateForFirestore,
    lugarCalibracion: lugarNormalizado,
    folio: stateForFirestore.certificado,
    // Alias usados por Friday / Hoja de Servicio / reconciliación Drive
    fecha_calib: stateForFirestore.fecha,
    serie: stateForFirestore.numeroSerie,
    tecnico: tecnicoNombre,
    tecnicoResponsable: tecnicoNombre,
    status: "completed",
    priority: "medium",
    status_equipo: "Calibrado",
    status_certificado: "Generado",
    cargado_drive: "Pendiente",
    timestamp: Date.now(),
    createdAt: (existingData?.createdAt as string) || new Date().toISOString(),
    userId: user?.id || "unknown",
    magnitudConsecutivo: job.magnitudConsecutivo || "",
  };

  if (clienteId) {
    fullData.clienteId = clienteId;
  } else {
    delete fullData.clienteId;
  }

  if (!fullData.fechaEntrada) {
    fullData.fechaEntrada =
      (existingData?.fechaEntrada as string) ||
      (fullData.fechaRecepcion as string) ||
      (fullData.fecha as string) ||
      new Date().toISOString().split("T")[0];
  }
  if (!fullData.fechaRecepcion && existingData?.fechaEntrada) {
    fullData.fechaRecepcion = existingData.fechaEntrada;
  }

  const pdfBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return {
    state: sanitizedState,
    fullData,
    blob,
    pdfBase64,
    nombreArchivo,
    finalDocId,
    fotoEquipoBase64,
    lugarNormalizado,
    previousEquipmentId,
    previousPdfUrl,
  };
}

function pathFromDownloadUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function deleteStaleWorksheetPdf(opts: {
  technicianFolder: string;
  cert: string;
  previousId: string;
  newId: string;
  previousPdfUrl: string;
  newPath: string;
}): Promise<void> {
  const oldPaths = new Set<string>();
  if (
    opts.previousId &&
    normalizeEquipmentId(opts.previousId) !== normalizeEquipmentId(opts.newId)
  ) {
    oldPaths.add(
      buildWorksheetPdfStoragePath(opts.technicianFolder, opts.cert, opts.previousId)
    );
  }
  if (opts.previousPdfUrl) {
    const fromUrl = pathFromDownloadUrl(opts.previousPdfUrl);
    if (fromUrl) oldPaths.add(fromUrl);
  }
  oldPaths.delete(opts.newPath);
  await Promise.all(
    [...oldPaths].map(async (oldPath) => {
      try {
        await deleteObject(ref(storage, oldPath));
      } catch {
        /* ya no está */
      }
      try {
        await deleteDoc(doc(db, "fileMetadata", oldPath.replace(/\//g, "_")));
      } catch {
        /* ya no está */
      }
    })
  );
}

function writeOfflineQueueItem(
  job: BackgroundSaveJob,
  payload: PreparedSavePayload,
  finalDocId: string | null = payload.finalDocId
): string {
  const queueId = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  addToOfflineQueue({
    id: queueId,
    timestamp: Date.now(),
    data: payload.fullData,
    pdfBlob: payload.pdfBase64,
    nombreArchivo: payload.nombreArchivo,
    finalDocId,
    worksheetId: job.worksheetId,
    magnitudConsecutivo: job.magnitudConsecutivo,
    fotoEquipoBase64: payload.fotoEquipoBase64,
  });
  return queueId;
}

function enqueueOfflineFromPayload(
  job: BackgroundSaveJob,
  payload: PreparedSavePayload,
  finalDocId: string | null = payload.finalDocId
): never {
  writeOfflineQueueItem(job, payload, finalDocId);
  throw new Error("OFFLINE_QUEUED");
}

/** Guarda en cola local de forma síncrona (await antes de salir de pantalla). */
export async function persistWorksheetToOfflineQueue(
  job: BackgroundSaveJob
): Promise<string> {
  const payload = await prepareSavePayload(job);
  return writeOfflineQueueItem(job, payload);
}

export async function persistWorksheetJob(job: BackgroundSaveJob): Promise<void> {
  const payload = await prepareSavePayload(job);
  const {
    state,
    fullData,
    blob,
    nombreArchivo,
    finalDocId,
    fotoEquipoBase64,
    lugarNormalizado,
    previousEquipmentId,
    previousPdfUrl,
  } = payload;

  const firebaseOk = navigator.onLine ? await canSaveDirectlyToFirebase() : false;
  if (!firebaseOk) {
    enqueueOfflineFromPayload(job, payload);
  }

  let docRefId = finalDocId;

  try {
    await reclamarFolioParaEquipo(String(state.certificado || ""), String(state.id || ""));
    if (docRefId) {
      await updateDoc(doc(db, "hojasDeTrabajo", docRefId), fullData);
    } else {
      const newDoc = await addDoc(collection(db, "hojasDeTrabajo"), fullData);
      docRefId = newDoc.id;
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("CERT_EN_USO:")) throw e;
    if (isRetriableNetworkError(e)) {
      enqueueOfflineFromPayload(job, { ...payload, finalDocId: docRefId });
    }
    throw e;
  }

  await tryConfirmarWorksheet(state.certificado, job.magnitudConsecutivo);

  const updates: Record<string, string> = {};

  try {
    if (fotoEquipoBase64) {
      const imgData = fotoEquipoBase64.startsWith("data:")
        ? fotoEquipoBase64
        : `data:image/jpeg;base64,${fotoEquipoBase64}`;
      const imgBlob = await fetch(imgData).then((r) => r.blob());
      const fotoRef = ref(
        storage,
        `worksheets/fotos/${state.certificado}_${state.id || "SINID"}.jpg`
      );
      await uploadBytes(fotoRef, imgBlob);
      updates.fotoEquipoURL = await getDownloadURL(fotoRef);
    }

    const pdfRef = ref(storage, nombreArchivo);
    const uploadResult = await uploadBytes(pdfRef, blob);
    updates.pdfURL = await getDownloadURL(pdfRef);

    let driveMetaOk = false;
    for (let attempt = 0; attempt < 3 && !driveMetaOk; attempt++) {
      try {
        await writeDriveFileMetadata(nombreArchivo, uploadResult, getTechnicianFolderName(job.user), {
          ubicacion_real: lugarNormalizado === "sitio" ? "Servicio en Sitio" : "Laboratorio",
          workDate: state.fecha,
        });
        driveMetaOk = true;
      } catch (metaErr) {
        console.error(`[WorkSheet] metadata Drive intento ${attempt + 1}:`, metaErr);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    updates.cargado_drive = driveMetaOk ? "Si" : "Pendiente";

    await deleteStaleWorksheetPdf({
      technicianFolder: getTechnicianFolderName(job.user),
      cert: String(state.certificado || ""),
      previousId: previousEquipmentId,
      newId: String(state.id || ""),
      previousPdfUrl,
      newPath: nombreArchivo,
    });

    if (docRefId) {
      await updateDoc(doc(db, "hojasDeTrabajo", docRefId), updates);
    }
  } catch (e) {
    if (isRetriableNetworkError(e)) {
      enqueueOfflineFromPayload(job, { ...payload, finalDocId: docRefId });
    }
    throw e;
  }

  try {
    await syncServicioInicioFromWorksheetRecord({
      fecha: state.fecha,
      cliente: state.cliente,
      clienteId: typeof fullData.clienteId === "string" ? fullData.clienteId : undefined,
      lugarCalibracion: lugarNormalizado,
      createdAt: fullData.createdAt as string,
      timestamp: fullData.timestamp as number,
    });
  } catch (syncErr) {
    console.error("[WorkSheet] No se pudo sincronizar inicio del servicio:", syncErr);
  }
}
