export interface WorksheetQueueSyncDetail {
  pendingCount: number;
  uploaded: number;
  recovered?: number;
  certificado?: string;
  message?: string;
}

export interface WorksheetSaveCompleteDetail {
  certificado: string;
  success: boolean;
  queuedOffline?: boolean;
  message?: string;
}

export function dispatchWorksheetQueueSync(detail: WorksheetQueueSyncDetail): void {
  window.dispatchEvent(new CustomEvent("ag-worksheet-queue-sync", { detail }));
}

export function dispatchWorksheetSaveComplete(detail: WorksheetSaveCompleteDetail): void {
  window.dispatchEvent(new CustomEvent("ag-worksheet-save-complete", { detail }));
}
