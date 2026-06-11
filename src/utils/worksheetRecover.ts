/**
 * Recupera hojas atascadas en borrador / pending saves → cola offline con PDF.
 */

import type { BackgroundSaveJob } from "../types/worksheet";
import { getOfflineQueue, findOfflineQueueBySearch } from "./worksheetOfflineQueue";
import {
  getPendingSaves,
  removePendingSave,
  type PersistedBackgroundSaveJob,
} from "./worksheetPendingSaves";
import { loadWorksheetDraft } from "./worksheetDraftAutosave";
import { persistWorksheetToOfflineQueue } from "./worksheetPersist";

const BACKUP_KEY = "backup_worksheet_data";

export function normalizeCertificado(cert: string): string {
  return cert.replace(/\s+/g, "").toUpperCase();
}

export function isConsecutivoLike(term: string): boolean {
  const n = normalizeCertificado(term);
  return /^AG[A-Z]{0,4}-\d{3,4}-\d{2}$/i.test(n);
}

function pendingToJob(p: PersistedBackgroundSaveJob): BackgroundSaveJob {
  return {
    id: p.id,
    state: p.state as BackgroundSaveJob["state"],
    electricalValues: p.electricalValues,
    localExc: p.localExc,
    user: p.user,
    worksheetId: p.worksheetId,
    magnitudConsecutivo: p.magnitudConsecutivo,
  };
}

export interface RecoverAllSummary {
  recovered: number;
  certificados: string[];
}

/** Recupera todas las hojas atascadas (pending + respaldo) → cola offline con PDF. */
export async function recoverAllLocalWorksheets(): Promise<RecoverAllSummary> {
  const certificados: string[] = [];
  let recovered = 0;

  for (const p of [...getPendingSaves()]) {
    const cert = String(p.state?.certificado || "");
    if (!cert || findOfflineQueueBySearch(cert)) continue;
    try {
      await persistWorksheetToOfflineQueue(pendingToJob(p));
      removePendingSave(p.id);
      recovered++;
      certificados.push(cert);
    } catch (e) {
      console.error("[RecoverAll] pending:", cert, e);
    }
  }

  const backupRaw = localStorage.getItem(BACKUP_KEY);
  if (backupRaw) {
    try {
      const backup = JSON.parse(backupRaw) as BackgroundSaveJob["state"];
      const cert = String(backup.certificado || "");
      if (cert && !findOfflineQueueBySearch(cert)) {
        await persistWorksheetToOfflineQueue({
          id: `recover_${Date.now()}`,
          state: backup,
          electricalValues: {},
          localExc: { p1: "", p2: "", p3: "", p4: "", p5: "" },
          user: null,
        });
        localStorage.removeItem(BACKUP_KEY);
        recovered++;
        certificados.push(cert);
      }
    } catch (e) {
      console.error("[RecoverAll] backup:", e);
    }
  }

  return { recovered, certificados };
}

/** Intenta reconstruir cola offline desde pending/backup si falta el certificado. */
export async function recoverWorksheetByCertificado(
  certificado: string,
  magnitudConsecutivo?: string
): Promise<boolean> {
  const target = normalizeCertificado(certificado);
  if (!target) return false;

  if (findOfflineQueueBySearch(target)) return true;

  const pending = getPendingSaves().find(
    (p) => normalizeCertificado(String(p.state?.certificado || "")) === target
  );
  if (pending) {
    await persistWorksheetToOfflineQueue(pendingToJob(pending));
    removePendingSave(pending.id);
    return true;
  }

  const backupRaw = localStorage.getItem(BACKUP_KEY);
  if (backupRaw) {
    try {
      const backup = JSON.parse(backupRaw) as BackgroundSaveJob["state"];
      if (normalizeCertificado(String(backup.certificado || "")) === target) {
        await persistWorksheetToOfflineQueue({
          id: `recover_${Date.now()}`,
          state: backup,
          electricalValues: {},
          localExc: { p1: "", p2: "", p3: "", p4: "", p5: "" },
          user: null,
          magnitudConsecutivo,
        });
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  const draft = loadWorksheetDraft();
  if (draft?.state) {
    const cert = normalizeCertificado(String(draft.state.certificado || ""));
    if (cert === target) {
      await persistWorksheetToOfflineQueue({
        id: `recover_draft_${Date.now()}`,
        state: draft.state as BackgroundSaveJob["state"],
        electricalValues: {},
        localExc: { p1: "", p2: "", p3: "", p4: "", p5: "" },
        user: null,
        magnitudConsecutivo,
      });
      return true;
    }
  }

  return false;
}

export function listOfflineCertificados(): string[] {
  return getOfflineQueue()
    .map((i) => String(i.data?.certificado || ""))
    .filter(Boolean);
}
