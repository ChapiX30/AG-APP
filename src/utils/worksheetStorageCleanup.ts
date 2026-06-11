/**
 * Borra PDF/fotos de Storage al deshacer un consecutivo.
 */

import { ref, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

function pathFromDownloadUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function deleteByPath(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* archivo ya ausente */
  }
}

export async function deleteStorageFileByUrl(url: string | undefined | null): Promise<void> {
  if (!url || typeof url !== "string") return;
  const path = pathFromDownloadUrl(url);
  if (path) await deleteByPath(path);
}

export async function deleteWorksheetStorageForHoja(
  certificado: string,
  hojaData?: { pdfURL?: string; fotoEquipoURL?: string; id?: string }
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (hojaData?.pdfURL) tasks.push(deleteStorageFileByUrl(hojaData.pdfURL));
  if (hojaData?.fotoEquipoURL) tasks.push(deleteStorageFileByUrl(hojaData.fotoEquipoURL));

  const eqId = hojaData?.id?.trim() || "SINID";
  if (certificado) {
    tasks.push(deleteByPath(`worksheets/fotos/${certificado}_${eqId}.jpg`));
  }

  await Promise.all(tasks);
}
