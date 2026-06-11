/**
 * Orquesta cola offline + guardados pendientes al iniciar la app.
 */

import {
  getPendingSaves,
  removePendingSave,
  type PersistedBackgroundSaveJob,
} from "./worksheetPendingSaves";
import { getOfflineQueueCount } from "./worksheetOfflineQueue";
import { persistWorksheetJob } from "./worksheetPersist";
import { processWorksheetOfflineQueue } from "./worksheetSaveProcessor";
import { canSaveDirectlyToFirebase } from "./firebaseConnectivity";
import { recoverAllLocalWorksheets } from "./worksheetRecover";
import type { BackgroundSaveJob } from "../types/worksheet";

type UserLike = { id?: string; name?: string; email?: string } | null;

function toBackgroundJob(p: PersistedBackgroundSaveJob): BackgroundSaveJob {
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

export interface WorksheetQueueRunSummary {
  recovered: number;
  pendingProcessed: number;
  offlineUploaded: number;
  offlineFailed: number;
  totalPendingInStorage: number;
}

export async function runAllWorksheetQueues(
  user: UserLike
): Promise<WorksheetQueueRunSummary> {
  const summary: WorksheetQueueRunSummary = {
    recovered: 0,
    pendingProcessed: 0,
    offlineUploaded: 0,
    offlineFailed: 0,
    totalPendingInStorage: getOfflineQueueCount(),
  };

  const recoverResult = await recoverAllLocalWorksheets();
  summary.recovered = recoverResult.recovered;
  summary.totalPendingInStorage =
    getOfflineQueueCount() + getPendingSaves().length;

  if (!(await canSaveDirectlyToFirebase())) {
    return summary;
  }

  const pending = getPendingSaves();
  for (const p of pending) {
    try {
      await persistWorksheetJob(toBackgroundJob(p));
      removePendingSave(p.id);
      summary.pendingProcessed++;
    } catch (e) {
      if (e instanceof Error && e.message === "OFFLINE_QUEUED") {
        removePendingSave(p.id);
        summary.pendingProcessed++;
      } else {
        console.error("[QueueRunner] pending save:", e);
      }
    }
  }

  const offlineResult = await processWorksheetOfflineQueue(user);
  summary.offlineUploaded = offlineResult.uploaded;
  summary.offlineFailed = offlineResult.failed;
  summary.totalPendingInStorage = getOfflineQueueCount() + getPendingSaves().length;

  return summary;
}

export function getTotalWorksheetQueueCount(): number {
  return getOfflineQueueCount() + getPendingSaves().length;
}
