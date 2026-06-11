/**
 * Comprueba si Firestore responde (no basta con navigator.onLine en planta).
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const PING_TIMEOUT_MS = 6000;

export async function isFirebaseReachable(): Promise<boolean> {
  if (!navigator.onLine) return false;

  try {
    await Promise.race([
      getDoc(doc(db, "_meta", "connectivity")),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("firebase_ping_timeout")), PING_TIMEOUT_MS)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** true si conviene intentar guardado directo (online + Firestore responde) */
export async function canSaveDirectlyToFirebase(): Promise<boolean> {
  return isFirebaseReachable();
}
