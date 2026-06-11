/**
 * Procesamiento de cola offline y confirmación de consecutivos.
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { db, storage } from "./firebase";
import { writeDriveFileMetadata } from "./driveFileMetadata";
import { getTechnicianFolderName } from "./worksheetPdfGenerator";
import { syncServicioInicioFromWorksheetRecord } from "./servicioAutomation";
import { confirmarWorksheet } from "./firebaseConsecutivos";
import { canSaveDirectlyToFirebase } from "./firebaseConnectivity";
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  type OfflineQueueItem,
} from "./worksheetOfflineQueue";

export interface QueueProcessResult {
  uploaded: number;
  failed: number;
  errors: string[];
}

type UserLike = { id?: string; name?: string; email?: string } | null;

async function uploadFotoIfNeeded(
  item: OfflineQueueItem,
  updates: Record<string, string>
): Promise<void> {
  const foto = item.fotoEquipoBase64;
  const cert = String(item.data?.certificado || "");
  const eqId = String(item.data?.id || "SINID");
  if (!foto) return;

  const imgData = foto.startsWith("data:") ? foto : `data:image/jpeg;base64,${foto}`;
  const imgBlob = await fetch(imgData).then((r) => r.blob());
  const fotoRef = ref(storage, `worksheets/fotos/${cert}_${eqId}.jpg`);
  await uploadBytes(fotoRef, imgBlob);
  updates.fotoEquipoURL = await getDownloadURL(fotoRef);
}

async function processOneOfflineItem(
  item: OfflineQueueItem,
  user: UserLike
): Promise<void> {
  const binaryStr = atob(item.pdfBlob);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const pdfRef = ref(storage, item.nombreArchivo);
  const uploadResult = await uploadBytes(pdfRef, blob);
  const pdfURL = await getDownloadURL(pdfRef);

  try {
    const uploadedBy =
      getTechnicianFolderName(user) ||
      item.nombreArchivo.split("/")[1] ||
      "Desconocido";
    await writeDriveFileMetadata(item.nombreArchivo, uploadResult, uploadedBy, {
      workDate: item.data?.fecha as string | undefined,
      ubicacion_real:
        item.data?.lugarCalibracion === "sitio" ? "Servicio en Sitio" : "Laboratorio",
    });
  } catch (metaErr) {
    console.error("[SaveProcessor] metadata Drive:", metaErr);
  }

  const updates: Record<string, string> = { pdfURL, cargado_drive: "Si", status: "completed" };
  await uploadFotoIfNeeded(item, updates);

  const fullData = { ...item.data, ...updates };

  let docRefId = item.finalDocId;
  if (docRefId) {
    await updateDoc(doc(db, "hojasDeTrabajo", docRefId), fullData);
  } else {
    const newDoc = await addDoc(collection(db, "hojasDeTrabajo"), fullData);
    docRefId = newDoc.id;
  }

  try {
    await syncServicioInicioFromWorksheetRecord({
      fecha: String(fullData.fecha || ""),
      cliente: String(fullData.cliente || ""),
      lugarCalibracion: String(fullData.lugarCalibracion || ""),
      createdAt: String(fullData.createdAt || ""),
      timestamp: typeof fullData.timestamp === "number" ? fullData.timestamp : item.timestamp,
    });
  } catch (syncErr) {
    console.error("[SaveProcessor] sync servicio:", syncErr);
  }

  const cert = String(item.data?.certificado || "");
  const mag =
    item.magnitudConsecutivo ||
    String(item.data.magnitudConsecutivo || item.data.magnitud || "");
  if (cert && mag) {
    try {
      await confirmarWorksheet(cert, mag);
    } catch (e) {
      console.warn("[SaveProcessor] confirmarWorksheet:", e);
    }
  }
}

export async function processWorksheetOfflineQueue(
  user: UserLike
): Promise<QueueProcessResult> {
  const result: QueueProcessResult = { uploaded: 0, failed: 0, errors: [] };
  if (!(await canSaveDirectlyToFirebase())) return result;

  const queue = getOfflineQueue();
  for (const item of queue) {
    try {
      await processOneOfflineItem(item, user);
      removeFromOfflineQueue(item.id);
      result.uploaded++;
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      console.error("[SaveProcessor] Error en cola offline:", err);
    }
  }
  return result;
}

export async function tryConfirmarWorksheet(
  certificado: string,
  magnitudConsecutivo?: string
): Promise<void> {
  if (!certificado || !magnitudConsecutivo) return;
  try {
    await confirmarWorksheet(certificado, magnitudConsecutivo);
  } catch (e) {
    console.warn("[SaveProcessor] confirmarWorksheet:", e);
  }
}
