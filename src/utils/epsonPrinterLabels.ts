import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type EpsonPrinterLabels = Record<string, string>;

const EPSON_PRINTERS_DOC_PATH = ["config", "epsonPrinters"] as const;
const LOCAL_CACHE_KEY = "ag_epson_printer_labels";

export function normalizePrinterMac(mac: string): string {
  return mac.trim().toUpperCase();
}

export function loadCachedPrinterLabels(): EpsonPrinterLabels {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "{}") as EpsonPrinterLabels;
  } catch {
    return {};
  }
}

function cachePrinterLabels(labels: EpsonPrinterLabels) {
  localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(labels));
}

export function subscribeEpsonPrinterLabels(
  onChange: (labels: EpsonPrinterLabels) => void,
  onError?: (error: unknown) => void
): () => void {
  const ref = doc(db, ...EPSON_PRINTERS_DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      const labels = (snap.data()?.labels as EpsonPrinterLabels | undefined) ?? {};
      cachePrinterLabels(labels);
      onChange(labels);
    },
    (error) => onError?.(error)
  );
}

export async function saveEpsonPrinterLabel(
  mac: string,
  label: string,
  updatedBy?: string
): Promise<void> {
  const key = normalizePrinterMac(mac);
  const ref = doc(db, ...EPSON_PRINTERS_DOC_PATH);
  const snap = await getDoc(ref);
  const labels: EpsonPrinterLabels = {
    ...((snap.data()?.labels as EpsonPrinterLabels | undefined) ?? {}),
  };

  const trimmed = label.trim();
  if (trimmed) {
    labels[key] = trimmed;
  } else {
    delete labels[key];
  }

  await setDoc(
    ref,
    {
      labels,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy?.trim() || "",
    },
    { merge: true }
  );
}
