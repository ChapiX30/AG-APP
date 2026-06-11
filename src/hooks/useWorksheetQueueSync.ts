import { useEffect, useRef } from "react";
import { runAllWorksheetQueues, getTotalWorksheetQueueCount } from "../utils/worksheetQueueRunner";
import { dispatchWorksheetQueueSync } from "../utils/worksheetEvents";

type UserLike = { id?: string; name?: string; email?: string } | null;

function buildSyncMessage(result: {
  recovered: number;
  offlineUploaded: number;
  pendingProcessed: number;
}): string | undefined {
  const parts: string[] = [];
  if (result.recovered > 0) {
    parts.push(
      `${result.recovered} hoja${result.recovered > 1 ? "s" : ""} preparada${result.recovered > 1 ? "s" : ""} en el dispositivo`
    );
  }
  const uploaded = result.offlineUploaded + result.pendingProcessed;
  if (uploaded > 0) {
    parts.push(`${uploaded} sincronizada${uploaded > 1 ? "s" : ""} con la nube`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Recupera hojas locales y sincroniza con Firebase al iniciar sesión,
 * al reconectar, al volver a la app y tras guardar — sin abrir Drive.
 */
export function useWorksheetQueueSync(user: UserLike, isAuthenticated: boolean) {
  const runningRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const sync = async () => {
    const u = userRef.current;
    if (!isAuthenticated || !u || runningRef.current) return;
    runningRef.current = true;
    try {
      const result = await runAllWorksheetQueues(u);
      const uploaded = result.offlineUploaded + result.pendingProcessed;
      dispatchWorksheetQueueSync({
        pendingCount: getTotalWorksheetQueueCount(),
        uploaded,
        recovered: result.recovered,
        message: buildSyncMessage(result),
      });
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const schedule = (ms: number) => window.setTimeout(sync, ms);
    const tImmediate = schedule(300);
    const tRetry = schedule(3000);

    const onOnline = () => schedule(500);
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(400);
    };
    const onSaveComplete = () => schedule(600);

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("ag-worksheet-save-complete", onSaveComplete);

    return () => {
      window.clearTimeout(tImmediate);
      window.clearTimeout(tRetry);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("ag-worksheet-save-complete", onSaveComplete);
    };
  }, [isAuthenticated, user?.id]);
}
