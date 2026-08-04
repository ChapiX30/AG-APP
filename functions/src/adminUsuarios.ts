import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const SUPER_ADMIN_EMAILS = new Set([
  "jesus.sustaita@agsolutions.com",
  "admin@agsolutions.com",
  "mgaese08@gmail.com",
]);

const ALLOWED_PUESTOS = new Set([
  "Metrólogo",
  "Calidad",
  "Logistica",
  "Administrativo",
  "Gerente",
]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRoleText(puesto?: string, role?: string): string {
  return `${puesto || ""} ${role || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function canManageUsers(email: string, puesto: string, role: string): boolean {
  if (SUPER_ADMIN_EMAILS.has(normalizeEmail(email))) return true;
  const text = normalizeRoleText(puesto, role);
  return (
    text.includes("admin") ||
    text.includes("gerente") ||
    text.includes("manager") ||
    text.includes("calidad")
  );
}

async function assertCallerCanManage(
  context: functions.https.CallableContext,
): Promise<{ uid: string; email: string }> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");
  }

  const email = normalizeEmail(context.auth.token.email || "");
  const db = admin.firestore();
  const userSnap = await db.collection("usuarios").doc(context.auth.uid).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "No tienes permiso para gestionar usuarios.",
    );
  }

  const data = userSnap.data() || {};
  if (data.activo === false) {
    throw new functions.https.HttpsError("permission-denied", "Tu cuenta está desactivada.");
  }

  const puesto = String(data.puesto || "");
  const role = String(data.role || data.rol || "");
  if (!canManageUsers(email, puesto, role)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Solo administradores pueden gestionar usuarios.",
    );
  }

  return { uid: context.auth.uid, email };
}

function randomPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function runAdminCrearUsuario(
  data: {
    email?: string;
    nombre?: string;
    puesto?: string;
  } | undefined,
  context: functions.https.CallableContext,
) {
  const caller = await assertCallerCanManage(context);

  const email = normalizeEmail(String(data?.email || ""));
  const nombre = String(data?.nombre || "").trim();
  const puesto = String(data?.puesto || "").trim();

  if (!email || !email.includes("@")) {
    throw new functions.https.HttpsError("invalid-argument", "Correo inválido.");
  }
  if (nombre.length < 2) {
    throw new functions.https.HttpsError("invalid-argument", "Nombre requerido.");
  }
  if (!ALLOWED_PUESTOS.has(puesto)) {
    throw new functions.https.HttpsError("invalid-argument", "Puesto no válido.");
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let userRecord: admin.auth.UserRecord;
  let createdAuth = false;

  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      throw new functions.https.HttpsError("internal", "No se pudo verificar el correo en Auth.");
    }
    userRecord = await auth.createUser({
      email,
      emailVerified: false,
      password: randomPassword(),
      displayName: nombre,
      disabled: false,
    });
    createdAuth = true;
  }

  const uid = userRecord.uid;
  const existing = await db.collection("usuarios").doc(uid).get();
  if (existing.exists && existing.data()?.activo !== false) {
    throw new functions.https.HttpsError(
      "already-exists",
      "Ese correo ya tiene una cuenta autorizada en la app.",
    );
  }

  await db.collection("usuarios").doc(uid).set(
    {
      nombre,
      name: nombre,
      correo: email,
      email,
      puesto,
      role: puesto,
      activo: true,
      creado: admin.firestore.FieldValue.serverTimestamp(),
      creadoPor: caller.uid,
      creadoPorEmail: caller.email,
    },
    { merge: true },
  );

  if (userRecord.disabled) {
    await auth.updateUser(uid, { disabled: false });
  }

  return {
    uid,
    email,
    createdAuth,
    message: createdAuth
      ? "Usuario creado. Debe establecer su contraseña con el enlace de recuperación."
      : "Cuenta Auth existente autorizada en la app.",
  };
}

export async function runAdminSetUsuarioActivo(
  data: {
    uid?: string;
    activo?: boolean;
  } | undefined,
  context: functions.https.CallableContext,
) {
  const caller = await assertCallerCanManage(context);

  const uid = String(data?.uid || "").trim();
  const activo = data?.activo === true;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid requerido.");
  }
  if (uid === caller.uid && !activo) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "No puedes desactivar tu propia cuenta.",
    );
  }

  const db = admin.firestore();
  const ref = db.collection("usuarios").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Usuario no encontrado.");
  }

  await ref.set(
    {
      activo,
      actualizadoActivoEn: admin.firestore.FieldValue.serverTimestamp(),
      actualizadoActivoPor: caller.uid,
    },
    { merge: true },
  );

  // El id del doc a veces no es el Auth uid (perfiles viejos). Intenta por uid y por correo.
  try {
    await admin.auth().updateUser(uid, { disabled: !activo });
  } catch {
    const email = normalizeEmail(String(snap.data()?.email || snap.data()?.correo || ""));
    if (email) {
      try {
        const byEmail = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(byEmail.uid, { disabled: !activo });
      } catch (err) {
        console.warn("No se pudo actualizar disabled en Auth:", err);
      }
    }
  }

  return { uid, activo };
}

/**
 * Si el perfil histórico está bajo otro id (p. ej. por correo) y no bajo auth.uid,
 * copia los datos al doc canónico `usuarios/{uid}` para que las reglas de seguridad funcionen.
 */
export async function runMigrarMiPerfilUid(
  _data: unknown,
  context: functions.https.CallableContext,
) {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");
  }

  const uid = context.auth.uid;
  const email = normalizeEmail(context.auth.token.email || "");
  if (!email) {
    throw new functions.https.HttpsError("failed-precondition", "La cuenta no tiene correo.");
  }

  const db = admin.firestore();
  const uidRef = db.collection("usuarios").doc(uid);
  const uidSnap = await uidRef.get();
  if (uidSnap.exists) {
    const data = uidSnap.data() || {};
    if (data.activo === false) {
      throw new functions.https.HttpsError("permission-denied", "Tu cuenta está desactivada.");
    }
    return { migrated: false, uid };
  }

  let legacy: admin.firestore.QueryDocumentSnapshot | null = null;
  for (const field of ["email", "correo"] as const) {
    const snap = await db.collection("usuarios").where(field, "==", email).limit(1).get();
    if (!snap.empty) {
      legacy = snap.docs[0];
      break;
    }
  }

  if (!legacy) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Tu cuenta no está autorizada. Solo el administrador puede dar de alta usuarios.",
    );
  }

  const data = legacy.data() || {};
  if (data.activo === false) {
    throw new functions.https.HttpsError("permission-denied", "Tu cuenta está desactivada.");
  }

  await uidRef.set(
    {
      ...data,
      email,
      correo: email,
      activo: true,
      migradoDe: legacy.id,
      migradoEn: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { migrated: true, uid, from: legacy.id };
}
