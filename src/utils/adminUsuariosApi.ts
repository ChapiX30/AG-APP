import { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { app } from "./firebaseApp";
import { auth, db } from "./firebase";

export type AdminCrearUsuarioRequest = {
  email: string;
  nombre: string;
  puesto: string;
};

export type AdminCrearUsuarioResponse = {
  uid: string;
  email: string;
  createdAuth: boolean;
  message: string;
};

export type AdminSetUsuarioActivoRequest = {
  uid: string;
  activo: boolean;
};

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFns() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app, "us-central1");
  }
  return functionsInstance;
}

export function adminUsuariosErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "functions/unauthenticated":
        return "Debes iniciar sesión.";
      case "functions/permission-denied":
        return err.message || "No tienes permiso para gestionar usuarios.";
      case "functions/already-exists":
        return "Ese correo ya está autorizado en la app.";
      case "functions/invalid-argument":
        return err.message || "Datos inválidos.";
      case "functions/not-found":
        return "Servicio de usuarios no disponible. Hay que desplegar las Cloud Functions.";
      case "functions/failed-precondition":
        return err.message || "Operación no permitida.";
      case "functions/internal":
      case "functions/unavailable":
        return "No se pudo completar la acción en el servidor. Si acabas de activar esta función, despliega las Cloud Functions e intenta de nuevo.";
      case "permission-denied":
        return "No tienes permiso para cambiar el estado de este usuario.";
      default:
        return err.message && err.message !== "internal"
          ? err.message
          : "Error al gestionar usuarios. Revisa que las Cloud Functions estén desplegadas.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Error inesperado al gestionar usuarios.";
}

export async function adminCrearUsuario(
  payload: AdminCrearUsuarioRequest,
): Promise<AdminCrearUsuarioResponse> {
  const callable = httpsCallable<AdminCrearUsuarioRequest, AdminCrearUsuarioResponse>(
    getFns(),
    "adminCrearUsuario",
  );
  const result = await callable(payload);

  try {
    await sendPasswordResetEmail(auth, payload.email.trim().toLowerCase());
  } catch (err) {
    console.warn("Usuario creado, pero no se pudo enviar el correo de contraseña:", err);
  }

  return result.data;
}

/**
 * Activa/desactiva en Firestore. Si la Cloud Function está desplegada,
 * también deshabilita la cuenta en Firebase Auth.
 */
export async function adminSetUsuarioActivo(
  payload: AdminSetUsuarioActivoRequest,
): Promise<{ uid: string; activo: boolean }> {
  const { uid, activo } = payload;

  try {
    const callable = httpsCallable<AdminSetUsuarioActivoRequest, { uid: string; activo: boolean }>(
      getFns(),
      "adminSetUsuarioActivo",
    );
    const result = await callable(payload);
    return result.data;
  } catch (err) {
    const code = err instanceof FirebaseError ? err.code : "";
    const canFallback =
      code === "functions/not-found" ||
      code === "functions/internal" ||
      code === "functions/unavailable" ||
      code === "functions/deadline-exceeded" ||
      code === "";

    if (!canFallback && code.startsWith("functions/")) {
      throw err;
    }
    console.warn("Cloud Function adminSetUsuarioActivo no disponible; fallback Firestore:", err);
  }

  await setDoc(
    doc(db, "usuarios", uid),
    {
      activo,
      actualizadoActivoEn: new Date().toISOString(),
    },
    { merge: true },
  );

  return { uid, activo };
}

/** Vincula perfiles legacy (doc ≠ uid) al documento canónico usuarios/{uid}. */
export async function migrarMiPerfilUid(): Promise<void> {
  const callable = httpsCallable(getFns(), "migrarMiPerfilUid");
  await callable({});
}
