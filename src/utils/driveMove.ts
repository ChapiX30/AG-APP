import { FirebaseError } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
  type StorageReference,
} from "firebase/storage";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { app } from "./firebaseApp";
import { db, storage } from "./firebase";
import {
  extractWorksheetLinkId,
  resolveWorksheetDoc,
} from "./worksheetDriveSync";

export type DriveMoveSpec = {
  fromPath: string;
  toPath: string;
  /** URL existente (acelera el fallback cliente). */
  sourceUrl?: string;
};

export type DriveFolderMoveSpec = {
  fromFolder: string;
  toFolder: string;
};

export type DriveMoveResult = {
  ok: boolean;
  movedCount: number;
  failedCount: number;
  via: "server" | "client";
  error?: string;
};

type ServerMoveResponse = {
  movedCount: number;
  failedCount: number;
  moved: Array<{ fromPath: string; toPath: string }>;
  failed: Array<{ fromPath: string; toPath: string; error: string }>;
};

let functionsInstance: ReturnType<typeof getFunctions> | null = null;
/**
 * null = aún no sabemos; true = function desplegada; false = no usar server esta sesión.
 * Empezamos en null y preferimos cliente hasta confirmar que el server existe (warmup).
 */
let serverMoveAvailable: boolean | null = null;
let warmupPromise: Promise<void> | null = null;

function getFns() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app, "us-central1");
  }
  return functionsInstance;
}

/** Llama una vez al entrar a Drive (calidad). Si la CF existe, los siguientes moves van por servidor. */
export function warmupDriveMoveServer(): void {
  if (serverMoveAvailable !== null || warmupPromise) return;
  warmupPromise = (async () => {
    try {
      const callable = httpsCallable<{ ping: boolean }, { ok?: boolean }>(
        getFns(),
        "moveDriveItems"
      );
      await callable({ ping: true });
      serverMoveAvailable = true;
    } catch (err) {
      if (isServerMoveUnavailable(err)) {
        serverMoveAvailable = false;
        return;
      }
      // Function responde (auth/permission/etc.) = está desplegada
      serverMoveAvailable = true;
    }
  })();
}

function metaIdFromPath(storagePath: string): string {
  return storagePath.replace(/\//g, "_");
}

function isServerMoveUnavailable(err: unknown): boolean {
  if (!(err instanceof FirebaseError)) return false;
  return (
    err.code === "functions/not-found" ||
    err.code === "functions/unimplemented" ||
    err.code === "functions/unavailable" ||
    (err.code === "functions/internal" &&
      /not found|does not exist|NOT_FOUND/i.test(err.message || ""))
  );
}

async function syncWorksheetPdfUrl(fileName: string, downloadUrl: string) {
  try {
    const possibleId = extractWorksheetLinkId(fileName);
    const wsDoc = await resolveWorksheetDoc(possibleId);
    if (wsDoc) {
      await updateDoc(wsDoc.ref, { pdfURL: downloadUrl });
    }
  } catch (err) {
    console.warn("[driveMove] worksheet sync skipped:", err);
  }
}

async function rewriteFileMetadata(fromPath: string, toPath: string, name: string) {
  const oldId = metaIdFromPath(fromPath);
  const newId = metaIdFromPath(toPath);
  const old = await getDoc(doc(db, "fileMetadata", oldId));
  const data = old.exists() ? old.data() : {};
  if (old.exists()) await deleteDoc(doc(db, "fileMetadata", oldId));
  await setDoc(
    doc(db, "fileMetadata", newId),
    {
      ...data,
      filePath: toPath,
      name,
      updated: new Date().toISOString(),
    },
    { merge: true }
  );
}

/** Copia en el bucket vía Cloud Function (sin pasar el archivo por el navegador). */
async function moveViaServer(payload: {
  moves?: DriveMoveSpec[];
  folderMoves?: DriveFolderMoveSpec[];
}): Promise<ServerMoveResponse> {
  if (serverMoveAvailable === false) {
    throw new FirebaseError("functions/not-found", "moveDriveItems disabled this session");
  }
  const callable = httpsCallable<
    {
      moves?: Array<{ fromPath: string; toPath: string }>;
      folderMoves?: DriveFolderMoveSpec[];
    },
    ServerMoveResponse
  >(getFns(), "moveDriveItems");

  const result = await callable({
    moves: payload.moves?.map(({ fromPath, toPath }) => ({ fromPath, toPath })),
    folderMoves: payload.folderMoves,
  });
  serverMoveAvailable = true;
  return result.data;
}

async function moveOneFileClient(spec: DriveMoveSpec): Promise<void> {
  const { fromPath, toPath, sourceUrl } = spec;
  if (fromPath === toPath) return;

  const fileName = toPath.split("/").pop() || "";
  const url = sourceUrl || (await getDownloadURL(ref(storage, fromPath)));
  const blob = await (await fetch(url)).blob();
  const newRef = ref(storage, toPath);
  await uploadBytes(newRef, blob);

  if (fileName !== ".keep") {
    await rewriteFileMetadata(fromPath, toPath, fileName);
    // Sync no bloquea el return percibido del batch (se lanza en paralelo abajo)
    void getDownloadURL(newRef)
      .then((newUrl) => syncWorksheetPdfUrl(fileName, newUrl))
      .catch(() => undefined);
  }

  await deleteObject(ref(storage, fromPath));
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<{ ok: number; fail: number; firstError?: string }> {
  let ok = 0;
  let fail = 0;
  let firstError: string | undefined;
  let next = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (next < items.length) {
        const idx = next++;
        const item = items[idx]!;
        try {
          await worker(item);
          ok++;
        } catch (err: any) {
          fail++;
          if (!firstError) firstError = err?.message || String(err);
        }
      }
    }
  );
  await Promise.all(runners);
  return { ok, fail, firstError };
}

async function collectFolderFilesClient(
  folderPath: string
): Promise<StorageReference[]> {
  const out: StorageReference[] = [];
  const walk = async (folderRef: StorageReference) => {
    const res = await listAll(folderRef);
    out.push(...res.items);
    for (const prefix of res.prefixes) {
      await walk(prefix);
    }
  };
  await walk(ref(storage, folderPath));
  return out;
}

async function moveFolderViaClient(
  fromFolder: string,
  toFolder: string
): Promise<DriveMoveResult> {
  if (toFolder === fromFolder || toFolder.startsWith(fromFolder + "/")) {
    return {
      ok: false,
      movedCount: 0,
      failedCount: 1,
      via: "client",
      error: "No puedes mover una carpeta dentro de sí misma",
    };
  }
  const items = await collectFolderFilesClient(fromFolder);
  const prefix = fromFolder.endsWith("/") ? fromFolder : `${fromFolder}/`;
  const moves: DriveMoveSpec[] = items.map((item) => {
    const relative = item.fullPath.startsWith(prefix)
      ? item.fullPath.slice(prefix.length)
      : item.name;
    return { fromPath: item.fullPath, toPath: `${toFolder}/${relative}` };
  });

  const { ok, fail, firstError } = await mapPool(moves, 3, moveOneFileClient);
  return {
    ok: ok > 0,
    movedCount: ok,
    failedCount: fail,
    via: "client",
    error: fail > 0 ? firstError : undefined,
  };
}

async function moveFilesViaClient(moves: DriveMoveSpec[]): Promise<DriveMoveResult> {
  const { ok, fail, firstError } = await mapPool(moves, 3, moveOneFileClient);
  return {
    ok: ok > 0,
    movedCount: ok,
    failedCount: fail,
    via: "client",
    error: fail > 0 ? firstError : undefined,
  };
}

/**
 * Mueve archivos/carpetas en Drive.
 * - Si la CF `moveDriveItems` está desplegada (detectada por warmup), usa copia GCS en servidor.
 * - Si no, usa fallback cliente paralelo (más rápido que el download/upload secuencial anterior).
 */
export async function moveDriveItems(payload: {
  moves?: DriveMoveSpec[];
  folderMoves?: DriveFolderMoveSpec[];
}): Promise<DriveMoveResult> {
  const moves = payload.moves || [];
  const folderMoves = payload.folderMoves || [];
  if (moves.length === 0 && folderMoves.length === 0) {
    return { ok: false, movedCount: 0, failedCount: 0, via: "client", error: "Sin elementos" };
  }

  // Solo intentamos servidor cuando ya sabemos que existe (warmup) o ya funcionó antes.
  if (serverMoveAvailable === true) {
    try {
      const data = await moveViaServer({ moves, folderMoves });
      return {
        ok: data.movedCount > 0,
        movedCount: data.movedCount,
        failedCount: data.failedCount,
        via: "server",
        error: data.failed[0]?.error,
      };
    } catch (err) {
      if (isServerMoveUnavailable(err)) {
        serverMoveAvailable = false;
      } else {
        const message =
          err instanceof FirebaseError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Error al mover en servidor";
        // Error de lógica/permiso con server vivo: no enmascarar con cliente
        return {
          ok: false,
          movedCount: 0,
          failedCount: moves.length || 1,
          via: "server",
          error: message,
        };
      }
    }
  }

  // Fallback / ruta por defecto: cliente paralelo
  let movedCount = 0;
  let failedCount = 0;
  let firstError: string | undefined;

  if (moves.length > 0) {
    const r = await moveFilesViaClient(moves);
    movedCount += r.movedCount;
    failedCount += r.failedCount;
    firstError = r.error;
  }

  for (const fm of folderMoves) {
    const r = await moveFolderViaClient(fm.fromFolder, fm.toFolder);
    movedCount += r.movedCount;
    failedCount += r.failedCount;
    if (!firstError && r.error) firstError = r.error;
  }

  return {
    ok: movedCount > 0,
    movedCount,
    failedCount,
    via: "client",
    error: firstError,
  };
}

/** Atajo: un solo archivo (mover o renombrar). */
export async function moveDriveFile(spec: DriveMoveSpec): Promise<DriveMoveResult> {
  return moveDriveItems({ moves: [spec] });
}

/** Atajo: carpeta completa. */
export async function moveDriveFolder(
  fromFolder: string,
  toFolder: string
): Promise<DriveMoveResult> {
  return moveDriveItems({ folderMoves: [{ fromFolder, toFolder }] });
}
