/**
 * Reconciliación Drive en segundo plano (sin tablero abierto).
 * Programada 1×/día (03:00 America/Mexico_City); el tablero Friday
 * sigue haciendo un respaldo al abrir / periódicamente.
 *
 * Despliegue (requiere plan Blaze para funciones programadas):
 *   firebase deploy --only functions:scheduledDriveReconcile
 *
 * Logs:
 *   firebase functions:log --only scheduledDriveReconcile
 */
import * as admin from "firebase-admin";
import {
  loadDriveReconcileCandidateRows,
  reconcileWorksheetDriveFlags,
} from "./lib/worksheetDriveSync";

export async function runScheduledDriveReconcile(): Promise<null> {
  const started = Date.now();
  const db = admin.firestore();
  try {
    const rows = await loadDriveReconcileCandidateRows(db);
    const result = await reconcileWorksheetDriveFlags(db, rows, {
      maxWrites: 400,
    });

    const elapsedMs = Date.now() - started;
    console.log(
      JSON.stringify({
        event: "scheduledDriveReconcile",
        elapsedMs,
        scanned: result.scanned,
        candidates: result.candidates,
        corrected: result.corrected,
        skippedVerified: result.skippedVerified,
        errors: result.errors,
      }),
    );

    return null;
  } catch (err) {
    console.error("scheduledDriveReconcile fatal:", err);
    throw err;
  }
}
