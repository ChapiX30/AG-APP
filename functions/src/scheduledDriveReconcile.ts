/**
 * Reconciliación Drive en segundo plano (sin tablero abierto).
 *
 * Despliegue (requiere plan Blaze para funciones programadas):
 *   firebase deploy --only functions:scheduledDriveReconcile
 *
 * Logs:
 *   firebase functions:log --only scheduledDriveReconcile
 */
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {
  loadAllHojasDeTrabajoRows,
  reconcileWorksheetDriveFlags,
} from "./lib/worksheetDriveSync";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const scheduledDriveReconcile = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("every 5 minutes")
  .timeZone("America/Mexico_City")
  .onRun(async () => {
    const started = Date.now();
    try {
      const rows = await loadAllHojasDeTrabajoRows(db);
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
        })
      );

      return null;
    } catch (err) {
      console.error("scheduledDriveReconcile fatal:", err);
      throw err;
    }
  });
