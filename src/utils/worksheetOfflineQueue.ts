/**
 * Cola offline persistente de hojas de trabajo (localStorage).
 * Sobrevive cierre/recarga de la app.
 */

export const OFFLINE_QUEUE_KEY = "ag_offline_save_queue";

export interface OfflineQueueItem {
  id: string;
  timestamp: number;
  data: Record<string, unknown>;
  pdfBlob: string;
  nombreArchivo: string;
  finalDocId: string | null;
  worksheetId: string | undefined;
  /** Magnitud tal como está en colección consecutivos (p. ej. "Presion Trazable") */
  magnitudConsecutivo?: string;
  fotoEquipoBase64?: string;
}

export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveOfflineQueue(q: OfflineQueueItem[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch (e) {
    console.warn("[OfflineQueue] No se pudo persistir cola:", e);
    throw new Error(
      "No hay espacio en el dispositivo para guardar la hoja. Libera espacio o conéctate a internet."
    );
  }
}

export function getOfflineQueueCount(): number {
  return getOfflineQueue().length;
}

const normCert = (c: unknown) =>
  String(c || "")
    .replace(/\s+/g, "")
    .toUpperCase();

export function addToOfflineQueue(item: OfflineQueueItem): void {
  const q = getOfflineQueue();
  const itemCert = normCert(item.data?.certificado);
  const byCert =
    itemCert.length > 0
      ? q.findIndex((i) => normCert(i.data?.certificado) === itemCert)
      : -1;
  if (byCert >= 0) {
    q[byCert] = item;
    saveOfflineQueue(q);
    return;
  }
  if (item.finalDocId) {
    const existingIdx = q.findIndex((i) => i.finalDocId === item.finalDocId);
    if (existingIdx >= 0) {
      q[existingIdx] = item;
      saveOfflineQueue(q);
      return;
    }
  }
  q.push(item);
  saveOfflineQueue(q);
}

export function removeFromOfflineQueue(id: string): void {
  saveOfflineQueue(getOfflineQueue().filter((i) => i.id !== id));
}

/** Errores de red / Firebase que deben ir a cola offline en modo mejorado */
export function isRetriableNetworkError(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("failed to fetch") ||
      msg.includes("offline") ||
      msg.includes("timeout") ||
      msg.includes("internet")
    ) {
      return true;
    }
  }
  const code = (e as { code?: string })?.code;
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "network-request-failed" ||
    code === "cancelled"
  );
}

export function shouldUseOfflineQueue(): boolean {
  return !navigator.onLine;
}

/** Entrada virtual para DriveScreen (hoja solo en dispositivo). */
export interface OfflineDriveEntry {
  name: string;
  rawName: string;
  url: string;
  fullPath: string;
  updated: string;
  created: string;
  parentFolder: string;
  isPendingWorksheet: true;
  isLocalOfflineQueue: true;
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

export function buildOfflineDriveEntry(item: OfflineQueueItem): OfflineDriveEntry {
  const cert = String(item.data?.certificado || "SIN-CERT");
  const equipmentId = String(item.data?.id || "SINID").trim() || "SINID";
  const technician = item.nombreArchivo.split("/")[1] || "Pendiente";
  return {
    name: `${cert}_${equipmentId}`,
    rawName: `${cert}_${equipmentId}.pdf`,
    url: "",
    fullPath: `offline-queue/${item.id}`,
    updated: new Date(item.timestamp).toISOString(),
    created: String(item.data?.createdAt || item.data?.fecha || ""),
    parentFolder: technician,
    isPendingWorksheet: true,
    isLocalOfflineQueue: true,
    worksheetDocId: `offline:${item.id}`,
    worksheetId: equipmentId,
    worksheetCliente: String(item.data?.cliente || ""),
    worksheetEquipo: String(item.data?.equipo || ""),
    notas:
      "Guardada en este dispositivo sin WiFi. Se subirá a Drive al reconectar. No está en la nube todavía.",
    keywords: [cert, equipmentId, cert.replace(/-/g, "")],
    size: 0,
    contentType: "application/pdf",
    uploadedBy: technician,
    workDate: String(item.data?.fecha || ""),
  };
}

export function getAllOfflineDriveEntries(): OfflineDriveEntry[] {
  return getOfflineQueue().map(buildOfflineDriveEntry);
}

const normSearch = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function findOfflineQueueBySearch(term: string): OfflineQueueItem | null {
  const t = normSearch(term);
  if (!t) return null;
  return (
    getOfflineQueue().find((item) => {
      const cert = normSearch(String(item.data?.certificado || ""));
      const id = normSearch(String(item.data?.id || ""));
      const folio = normSearch(String(item.data?.folio || ""));
      return (
        cert.includes(t) ||
        id.includes(t) ||
        folio.includes(t) ||
        cert === t ||
        id === t ||
        t.includes(cert)
      );
    }) || null
  );
}
