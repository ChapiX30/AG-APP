/**
 * Persistencia de hojas de trabajo (online, cola offline, reintentos).
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, query, getDocs, where, doc, updateDoc } from "firebase/firestore";
import { db, storage } from "./firebase";
import { writeDriveFileMetadata } from "./driveFileMetadata";
import { generateTemplatePDF, getTechnicianFolderName } from "./worksheetPdfGenerator";
import { syncServicioInicioFromWorksheetRecord } from "./servicioAutomation";
import { toWorksheetMagnitud } from "./magnitudWorksheet";
import { canSaveDirectlyToFirebase } from "./firebaseConnectivity";
import { addToOfflineQueue, isRetriableNetworkError } from "./worksheetOfflineQueue";
import { tryConfirmarWorksheet } from "./worksheetSaveProcessor";
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
    let textoPatron = "";
    let textoInstrumento = "";
    merged.unidad.forEach((u) => {
      const vals = job.electricalValues[u] || { patron: "", instrumento: "" };
      if (vals.patron) textoPatron += `${u}:\n${vals.patron}\n\n`;
      if (vals.instrumento) textoInstrumento += `${u}:\n${vals.instrumento}\n\n`;
    });
    merged = {
      ...merged,
      medicionPatron: textoPatron.trim(),
      medicionInstrumento: textoInstrumento.trim(),
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
}

async function prepareSavePayload(job: BackgroundSaveJob): Promise<PreparedSavePayload> {
  const state = mergeJobState(job);
  const user = job.user;
  const worksheetId = job.worksheetId;

  const { jsPDF } = await import("jspdf");
  const pdfDoc = generateTemplatePDF(state, jsPDF as Parameters<typeof generateTemplatePDF>[1]);
  const blob = pdfDoc.output("blob");
  const technicianName = getTechnicianFolderName(user);
  const nombreArchivo = `worksheets/${technicianName}/${state.certificado}_${state.id || "SINID"}.pdf`;

  let finalDocId: string | null = worksheetId || null;
  let existingData: Record<string, unknown> | null = null;
  const firebaseOk = navigator.onLine ? await canSaveDirectlyToFirebase() : false;

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

  const fullData: Record<string, unknown> = {
    ...stateForFirestore,
    lugarCalibracion: lugarNormalizado,
    folio: stateForFirestore.certificado,
    serie: stateForFirestore.numeroSerie,
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
  };
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
  const { state, fullData, blob, nombreArchivo, finalDocId, fotoEquipoBase64, lugarNormalizado } =
    payload;

  const firebaseOk = navigator.onLine ? await canSaveDirectlyToFirebase() : false;
  if (!firebaseOk) {
    enqueueOfflineFromPayload(job, payload);
  }

  let docRefId = finalDocId;

  try {
    if (docRefId) {
      await updateDoc(doc(db, "hojasDeTrabajo", docRefId), fullData);
    } else {
      const newDoc = await addDoc(collection(db, "hojasDeTrabajo"), fullData);
      docRefId = newDoc.id;
    }
  } catch (e) {
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
    try {
      await writeDriveFileMetadata(nombreArchivo, uploadResult, getTechnicianFolderName(job.user), {
        ubicacion_real: lugarNormalizado === "sitio" ? "Servicio en Sitio" : "Laboratorio",
        workDate: state.fecha,
      });
    } catch (metaErr) {
      console.error("[WorkSheet] Error al registrar metadata en Drive:", metaErr);
    }
    updates.cargado_drive = "Si";

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
      lugarCalibracion: lugarNormalizado,
      createdAt: fullData.createdAt as string,
      timestamp: fullData.timestamp as number,
    });
  } catch (syncErr) {
    console.error("[WorkSheet] No se pudo sincronizar inicio del servicio:", syncErr);
  }
}
