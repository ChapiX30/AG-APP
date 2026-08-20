/**
 * Procesamiento de cola offline y confirmación de consecutivos.
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc, query, where, getDocs } from "firebase/firestore";
import { db, storage } from "./firebase";
import { writeDriveFileMetadata } from "./driveFileMetadata";
import { getTechnicianFolderName } from "./worksheetPdfGenerator";
import { syncServicioInicioFromWorksheetRecord } from "./servicioAutomation";
import {
  confirmarWorksheet,
  resolveMagnitudesConsecutivo,
  normalizeCertificado,
} from "./firebaseConsecutivos";
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
  const cert = String(item.data?.certificado || "").trim();
  const incomingId = String(item.data?.id || "")
    .trim()
    .toUpperCase();

  let docRefId = item.finalDocId;
  if (!docRefId && cert) {
    try {
      const qCert = query(collection(db, "hojasDeTrabajo"), where("certificado", "==", cert));
      const existing = await getDocs(qCert);
      if (!existing.empty) {
        const d = existing.docs[0];
        const existingId = String(d.data().id || "")
          .trim()
          .toUpperCase();
        if (existingId && incomingId && existingId !== incomingId) {
          throw new Error(
            `CERT_EN_USO: El certificado ${cert} ya pertenece a ${existingId}. No se puede asignar a ${incomingId}.`
          );
        }
        docRefId = d.id;
      }
    } catch (lookupErr) {
      if (lookupErr instanceof Error && lookupErr.message.startsWith("CERT_EN_USO:")) {
        throw lookupErr;
      }
      console.warn("[SaveProcessor] lookup certificado:", lookupErr);
    }
  }

  // Firestore primero: evita PDF huérfano si el certificado ya es de otro equipo.
  const fechaCalib = String(item.data?.fecha_calib || item.data?.fecha || "").trim();
  const tecnicoNombre = String(
    item.data?.tecnicoResponsable || item.data?.tecnico || item.data?.nombre || ""
  ).trim();
  const baseData: Record<string, unknown> = {
    ...item.data,
    status: "completed",
    ...(fechaCalib ? { fecha_calib: fechaCalib } : {}),
    ...(tecnicoNombre
      ? { tecnico: tecnicoNombre, tecnicoResponsable: tecnicoNombre }
      : {}),
  };
  if (docRefId) {
    await updateDoc(doc(db, "hojasDeTrabajo", docRefId), baseData);
  } else {
    const newDoc = await addDoc(collection(db, "hojasDeTrabajo"), baseData);
    docRefId = newDoc.id;
  }

  const binaryStr = atob(item.pdfBlob);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const pdfRef = ref(storage, item.nombreArchivo);
  const uploadResult = await uploadBytes(pdfRef, blob);
  const pdfURL = await getDownloadURL(pdfRef);

  let driveMetaOk = false;
  const uploadedBy =
    getTechnicianFolderName(user) ||
    item.nombreArchivo.split("/")[1] ||
    "Desconocido";
  for (let attempt = 0; attempt < 3 && !driveMetaOk; attempt++) {
    try {
      await writeDriveFileMetadata(item.nombreArchivo, uploadResult, uploadedBy, {
        workDate: item.data?.fecha as string | undefined,
        ubicacion_real:
          item.data?.lugarCalibracion === "sitio" ? "Servicio en Sitio" : "Laboratorio",
      });
      driveMetaOk = true;
    } catch (metaErr) {
      console.error(`[SaveProcessor] metadata Drive intento ${attempt + 1}:`, metaErr);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  const updates: Record<string, string> = {
    pdfURL,
    cargado_drive: driveMetaOk ? "Si" : "Pendiente",
    status: "completed",
  };
  await uploadFotoIfNeeded(item, updates);
  await updateDoc(doc(db, "hojasDeTrabajo", docRefId), updates);

  const fullData = { ...baseData, ...updates };

  try {
    await syncServicioInicioFromWorksheetRecord({
      fecha: String(fullData.fecha || ""),
      cliente: String(fullData.cliente || ""),
      clienteId: typeof fullData.clienteId === "string" ? fullData.clienteId : undefined,
      lugarCalibracion: String(fullData.lugarCalibracion || ""),
      createdAt: String(fullData.createdAt || ""),
      timestamp: typeof fullData.timestamp === "number" ? fullData.timestamp : item.timestamp,
    });
  } catch (syncErr) {
    console.error("[SaveProcessor] sync servicio:", syncErr);
  }

  const mag =
    item.magnitudConsecutivo ||
    String(item.data.magnitudConsecutivo || item.data.magnitud || "");
  if (cert) {
    await tryConfirmarWorksheet(cert, mag || undefined);
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
      // Conflicto de certificado: no reintentar en loop (hay que regenerar consecutivo).
      if (msg.startsWith("CERT_EN_USO:")) {
        removeFromOfflineQueue(item.id);
      }
    }
  }
  return result;
}

export async function tryConfirmarWorksheet(
  certificado: string,
  magnitudConsecutivo?: string
): Promise<void> {
  const cert = normalizeCertificado(certificado);
  if (!cert) return;

  const candidatos = resolveMagnitudesConsecutivo(cert, magnitudConsecutivo);
  try {
    const ok = await confirmarWorksheet(cert, magnitudConsecutivo);
    if (!ok && candidatos.length > 0) {
      console.warn(
        `[SaveProcessor] Sin doc en consecutivos para ${cert} (magnitudes: ${candidatos.join(", ")})`
      );
    }
  } catch (e) {
    console.warn("[SaveProcessor] confirmarWorksheet:", e);
  }
}
