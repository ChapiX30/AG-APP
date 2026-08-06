import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const ALLOWED_ROOTS = ["worksheets", "certificados"] as const;
const MAX_MOVES = 80;
const QUALITY_EMAIL_ALLOWLIST = ["eaaese07@gmail.com", "edgar.metrologo@ejemplo.com"];

type MoveItem = {
  fromPath: string;
  toPath: string;
};

type MoveDriveItemsRequest = {
  /** Solo comprueba que la function esté viva (warmup del cliente). */
  ping?: boolean;
  moves?: MoveItem[];
  folderMoves?: Array<{ fromFolder: string; toFolder: string }>;
};

type StorageFile = ReturnType<ReturnType<typeof admin.storage>["bucket"]>["file"] extends (
  name: string
) => infer F
  ? F
  : never;

function normalizeRoleText(puesto?: string, role?: string): string {
  return `${puesto || ""} ${role || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function canMoveDrive(puesto: string, role: string, email: string): boolean {
  const normalizedEmail = (email || "").toLowerCase();
  if (QUALITY_EMAIL_ALLOWLIST.includes(normalizedEmail)) return true;
  const text = normalizeRoleText(puesto, role);
  return ["calidad", "quality", "admin", "gerente", "manager"].some((t) =>
    text.includes(t)
  );
}

function metaIdFromPath(storagePath: string): string {
  return storagePath.replace(/\//g, "_");
}

function normalizeStoragePath(path: string): string {
  return String(path || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

function assertSafeDrivePath(path: string): string {
  const normalized = normalizeStoragePath(path);
  if (!normalized || normalized.includes("..")) {
    throw new functions.https.HttpsError("invalid-argument", "Ruta inválida.");
  }
  const root = normalized.split("/")[0];
  if (!ALLOWED_ROOTS.includes(root as (typeof ALLOWED_ROOTS)[number])) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Solo se pueden mover rutas de worksheets/ o certificados/."
    );
  }
  return normalized;
}

function extractWorksheetLinkId(fileName: string): string {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/\s*\(\d+\)/, "")
    .split(/[_ ]/)[0]
    .trim();
}

function isLinkableWorksheetId(id: string): boolean {
  return (id || "").trim().length >= 2;
}

async function assertCallerCanMove(
  context: functions.https.CallableContext
): Promise<void> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");
  }
  const db = admin.firestore();
  const userSnap = await db.collection("usuarios").doc(context.auth.uid).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError("permission-denied", "Perfil no encontrado.");
  }
  const data = userSnap.data() || {};
  if (data.activo === false) {
    throw new functions.https.HttpsError("permission-denied", "Cuenta desactivada.");
  }
  const email = String(context.auth.token.email || data.email || data.correo || "");
  if (!canMoveDrive(String(data.puesto || ""), String(data.role || data.rol || ""), email)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Solo calidad/admin pueden mover archivos en Drive."
    );
  }
}

async function firebaseDownloadUrl(file: StorageFile): Promise<string> {
  const [metadata] = await file.getMetadata();
  const custom = { ...(metadata.metadata || {}) } as Record<string, string>;
  let token = custom.firebaseStorageDownloadTokens;
  if (!token) {
    token = crypto.randomUUID();
    custom.firebaseStorageDownloadTokens = token;
    await file.setMetadata({ metadata: custom });
  } else if (token.includes(",")) {
    token = token.split(",")[0]!.trim();
  }
  const encoded = encodeURIComponent(file.name);
  return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encoded}?alt=media&token=${token}`;
}

async function resolveWorksheetRef(possibleId: string) {
  if (!isLinkableWorksheetId(possibleId)) return null;
  const db = admin.firestore();
  const tryQueries = [
    db.collection("hojasDeTrabajo").where("certificado", "==", possibleId).limit(2),
    db.collection("hojasDeTrabajo").where("id", "==", possibleId).limit(2),
    db.collection("hojasDeTrabajo").where("folio", "==", possibleId).limit(2),
  ];
  if (/^\d+$/.test(possibleId)) {
    tryQueries.push(
      db.collection("hojasDeTrabajo").where("id", "==", Number(possibleId)).limit(2)
    );
  }
  for (const q of tryQueries) {
    const snap = await q.get();
    if (snap.size === 1) return snap.docs[0].ref;
    if (snap.size > 1) {
      const sorted = [...snap.docs].sort((a, b) => {
        const ta = new Date(
          String(a.data().createdAt || a.data().fechaEntrada || 0)
        ).getTime();
        const tb = new Date(
          String(b.data().createdAt || b.data().fechaEntrada || 0)
        ).getTime();
        return tb - ta;
      });
      return sorted[0]!.ref;
    }
  }
  return null;
}

async function moveOneObject(
  bucket: StorageFile["bucket"],
  fromPath: string,
  toPath: string
): Promise<{ fromPath: string; toPath: string }> {
  if (fromPath === toPath) {
    return { fromPath, toPath };
  }
  if (toPath.startsWith(fromPath + "/")) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "No se puede mover una ruta dentro de sí misma."
    );
  }

  const src = bucket.file(fromPath);
  const dest = bucket.file(toPath);
  const [exists] = await src.exists();
  if (!exists) {
    throw new functions.https.HttpsError("not-found", `No existe: ${fromPath}`);
  }

  await src.copy(dest);
  await src.delete({ ignoreNotFound: true });

  const fileName = toPath.split("/").pop() || "";

  if (fileName !== ".keep") {
    const db = admin.firestore();
    const oldId = metaIdFromPath(fromPath);
    const newId = metaIdFromPath(toPath);
    const oldSnap = await db.collection("fileMetadata").doc(oldId).get();
    const data = oldSnap.exists ? oldSnap.data() || {} : {};
    const batch = db.batch();
    if (oldSnap.exists) batch.delete(db.collection("fileMetadata").doc(oldId));
    batch.set(
      db.collection("fileMetadata").doc(newId),
      {
        ...data,
        filePath: toPath,
        name: fileName,
        updated: new Date().toISOString(),
      },
      { merge: true }
    );
    await batch.commit();

    try {
      const downloadUrl = await firebaseDownloadUrl(dest);
      const linkId = extractWorksheetLinkId(fileName);
      const wsRef = await resolveWorksheetRef(linkId);
      if (wsRef) {
        await wsRef.update({ pdfURL: downloadUrl });
      }
    } catch (err) {
      console.warn("driveMove worksheet sync skipped:", err);
    }
  }

  return { fromPath, toPath };
}

async function expandFolderMove(
  bucket: StorageFile["bucket"],
  fromFolder: string,
  toFolder: string
): Promise<MoveItem[]> {
  const prefix = fromFolder.endsWith("/") ? fromFolder : `${fromFolder}/`;
  const [files] = await bucket.getFiles({ prefix });
  const moves: MoveItem[] = [];
  for (const file of files) {
    const fromPath = file.name;
    if (!fromPath.startsWith(prefix)) continue;
    const relative = fromPath.slice(prefix.length);
    if (!relative) continue;
    moves.push({ fromPath, toPath: `${toFolder}/${relative}` });
  }
  return moves;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx]!);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function runMoveDriveItems(
  data: MoveDriveItemsRequest | undefined,
  context: functions.https.CallableContext
) {
  await assertCallerCanMove(context);

  if (data?.ping === true) {
    return { ok: true, ping: true };
  }

  const bucket = admin.storage().bucket();
  const moves: MoveItem[] = [];

  for (const m of data?.moves || []) {
    moves.push({
      fromPath: assertSafeDrivePath(m.fromPath),
      toPath: assertSafeDrivePath(m.toPath),
    });
  }

  for (const fm of data?.folderMoves || []) {
    const fromFolder = assertSafeDrivePath(fm.fromFolder);
    const toFolder = assertSafeDrivePath(fm.toFolder);
    if (toFolder === fromFolder || toFolder.startsWith(fromFolder + "/")) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No puedes mover una carpeta dentro de sí misma."
      );
    }
    const expanded = await expandFolderMove(bucket, fromFolder, toFolder);
    moves.push(...expanded);
  }

  if (moves.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "No hay elementos para mover.");
  }
  if (moves.length > MAX_MOVES) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Máximo ${MAX_MOVES} archivos por operación.`
    );
  }

  const failed: Array<{ fromPath: string; toPath: string; error: string }> = [];
  const moved: Array<{ fromPath: string; toPath: string }> = [];

  await mapPool(moves, 6, async (m) => {
    try {
      const result = await moveOneObject(bucket, m.fromPath, m.toPath);
      moved.push({ fromPath: result.fromPath, toPath: result.toPath });
    } catch (err: any) {
      failed.push({
        fromPath: m.fromPath,
        toPath: m.toPath,
        error: err?.message || String(err),
      });
    }
  });

  if (moved.length === 0) {
    throw new functions.https.HttpsError(
      "internal",
      failed[0]?.error || "No se pudo mover ningún archivo."
    );
  }

  return {
    movedCount: moved.length,
    failedCount: failed.length,
    moved,
    failed,
  };
}
