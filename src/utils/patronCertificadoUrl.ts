import { FirebaseError } from 'firebase/app';
import { doc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebaseApp';
import { db, storage } from './firebase';
import {
  extractStoragePathFromDownloadUrl,
  isReadablePatronCertificatePath,
  isUsableLegacyCertificadoUrl,
  patronCertificadoErrorMessage,
  PatronCertificadoErrorCode,
  resolvePatronCertificateStoragePath,
} from './certificateAccess';

type GetPatronCertificadoUrlRequest = { patronId: string };
type GetPatronCertificadoUrlResponse = { url: string; expiresInSeconds: number };

export type PatronCertificadoMeta = {
  certificadoStoragePath?: string;
  certificadoUrl?: string;
};

export class PatronCertificadoError extends Error {
  readonly code: PatronCertificadoErrorCode;

  constructor(message: string, code: PatronCertificadoErrorCode) {
    super(message || patronCertificadoErrorMessage(code));
    this.name = 'PatronCertificadoError';
    this.code = code;
  }
}

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFns() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app, 'us-central1');
  }
  return functionsInstance;
}

function classifyCallableError(err: unknown): PatronCertificadoErrorCode | 'retry-fallback' {
  if (err instanceof PatronCertificadoError) return err.code;
  if (!(err instanceof FirebaseError)) {
    return 'retry-fallback';
  }

  switch (err.code) {
    case 'functions/permission-denied':
    case 'functions/unauthenticated':
      return 'permission-denied';
    case 'functions/failed-precondition':
      return 'retry-fallback';
    case 'functions/not-found':
      if (typeof err.message === 'string' && err.message.includes('Patrón no encontrado')) {
        return 'no-certificate';
      }
      // Archivo inexistente en ruta nueva: permitir respaldo legacy / Storage SDK
      return 'retry-fallback';
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
    case 'functions/internal':
      return 'retry-fallback';
    default:
      if (err.code.startsWith('functions/')) return 'retry-fallback';
      if (err.code === 'unavailable' || err.code === 'network-request-failed') return 'network';
      return 'retry-fallback';
  }
}

async function callSignedUrlFunction(patronId: string): Promise<string> {
  const callable = httpsCallable<GetPatronCertificadoUrlRequest, GetPatronCertificadoUrlResponse>(
    getFns(),
    'getPatronCertificadoUrl'
  );
  const result = await callable({ patronId });
  const url = result.data?.url?.trim();
  if (!url) {
    throw new PatronCertificadoError('Respuesta inválida del servicio de certificados.', 'function-unavailable');
  }
  return url;
}

async function loadPatronCertificadoMeta(
  patronId: string,
  meta?: PatronCertificadoMeta
): Promise<PatronCertificadoMeta> {
  const storagePath = meta?.certificadoStoragePath?.trim() || '';
  const legacyUrl = meta?.certificadoUrl?.trim() || '';
  if (storagePath || legacyUrl) {
    return { certificadoStoragePath: storagePath, certificadoUrl: legacyUrl };
  }

  const snap = await getDoc(doc(db, 'patronesCalibracion', patronId));
  if (!snap.exists()) {
    throw new PatronCertificadoError('Patrón no encontrado.', 'unknown');
  }
  const data = snap.data();
  return {
    certificadoStoragePath: typeof data.certificadoStoragePath === 'string' ? data.certificadoStoragePath.trim() : '',
    certificadoUrl: typeof data.certificadoUrl === 'string' ? data.certificadoUrl.trim() : '',
  };
}

async function tryStorageDownloadURL(storagePath: string): Promise<string | null> {
  if (!isReadablePatronCertificatePath(storagePath)) return null;
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch (err) {
    console.error('Respaldo Storage: no se pudo obtener certificado (sin URL en log)', err);
    return null;
  }
}

/**
 * Resuelve URL de visualización con degradación controlada:
 * 1) Cloud Function (URL firmada)
 * 2) certificadoUrl legacy si es HTTP(S) válida
 * 3) getDownloadURL desde ruta Storage (usuario autenticado + reglas)
 */
export async function resolvePatronCertificadoUrl(
  patronId: string,
  meta?: PatronCertificadoMeta
): Promise<string> {
  const patronMeta = await loadPatronCertificadoMeta(patronId, meta);
  const storagePath = resolvePatronCertificateStoragePath(patronMeta);
  const legacyUrl = patronMeta.certificadoUrl?.trim() || '';

  if (!storagePath && !legacyUrl) {
    throw new PatronCertificadoError('No hay certificado asociado a este patrón.', 'no-certificate');
  }

  try {
    return await callSignedUrlFunction(patronId);
  } catch (err) {
    const classified = classifyCallableError(err);
    if (classified === 'permission-denied') {
      throw new PatronCertificadoError('Sin permiso para ver certificados.', 'permission-denied');
    }
    if (classified === 'network') {
      throw new PatronCertificadoError('Error de conexión al solicitar el certificado.', 'network');
    }
    console.warn('getPatronCertificadoUrl no disponible o falló; usando respaldo local.');
  }

  const pathFromLegacy = legacyUrl ? extractStoragePathFromDownloadUrl(legacyUrl) : null;
  const resolvedPath = storagePath || pathFromLegacy;
  if (resolvedPath) {
    const downloadUrl = await tryStorageDownloadURL(resolvedPath);
    if (downloadUrl) return downloadUrl;
  }

  if (legacyUrl && isUsableLegacyCertificadoUrl(legacyUrl)) {
    return legacyUrl;
  }

  throw new PatronCertificadoError(
    'No se pudo cargar el certificado. Despliegue la función getPatronCertificadoUrl o verifique reglas de Storage.',
    'function-unavailable'
  );
}

/** Alias usado por ProgramaCalibracionScreen. */
export type PatronCertificateMeta = PatronCertificadoMeta & { patronId: string };

export function certificateLoadErrorMessage(err: unknown): string {
  if (err instanceof PatronCertificadoError) return err.message;
  if (err instanceof FirebaseError) {
    if (err.code === 'storage/unauthorized' || err.code === 'storage/unauthenticated') {
      return 'Sin permiso para acceder al archivo en Storage.';
    }
    if (err.code === 'unavailable' || err.code === 'network-request-failed') {
      return 'Error de conexión. Revise su red e intente de nuevo.';
    }
  }
  return 'No se pudo cargar el certificado. Verifique permisos o conexión.';
}

export async function resolvePatronCertificadoPreviewUrl(meta: PatronCertificateMeta): Promise<string> {
  return resolvePatronCertificadoUrl(meta.patronId, meta);
}

/** URL firmada de corta duración; no persistir ni registrar en consola. */
export async function fetchPatronCertificadoSignedUrl(
  patronId: string,
  meta?: PatronCertificadoMeta
): Promise<string> {
  return resolvePatronCertificadoUrl(patronId, meta);
}
