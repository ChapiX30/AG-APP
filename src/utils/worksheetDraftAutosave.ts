/**
 * Borrador local de hoja de trabajo (localStorage).
 * Complementa backup_worksheet_data (solo errores al guardar).
 * Se borra únicamente tras guardado en línea confirmado.
 */

export const WORKSHEET_DRAFT_KEY = "ag_worksheet_draft";

export interface WorksheetDraftEnvelope {
  state: Record<string, unknown>;
  savedAt: number;
  certificado: string;
}

export function saveWorksheetDraft(state: Record<string, unknown>): void {
  try {
    const envelope: WorksheetDraftEnvelope = {
      state,
      savedAt: Date.now(),
      certificado: String(state.certificado || ""),
    };
    localStorage.setItem(WORKSHEET_DRAFT_KEY, JSON.stringify(envelope));
  } catch (e) {
    console.warn("[WorksheetDraft] No se pudo guardar borrador:", e);
  }
}

export function loadWorksheetDraft(): WorksheetDraftEnvelope | null {
  try {
    const raw = localStorage.getItem(WORKSHEET_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorksheetDraftEnvelope;
    if (!parsed?.state || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorksheetDraft(): void {
  try {
    localStorage.removeItem(WORKSHEET_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
