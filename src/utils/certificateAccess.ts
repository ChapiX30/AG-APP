/** Acceso a certificados de calibración de patrones (Storage + UI). */

/** Prefijo para certificados de patrones (programa de calibración). */
export const CERT_STORAGE_PREFIX = 'calibraciones';
/** Prefijo legacy antes de migración a calibraciones/. */
export const LEGACY_CERT_STORAGE_PREFIX = 'certificados';
export const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;
const ALLOWED_CERTIFICATE_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_CERTIFICATE_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

export type CertificateAuthUser = {
  role?: string;
  puesto?: string;
  email?: string;
} | null;

const QUALITY_EMAIL_ALLOWLIST = ['eaaese07@gmail.com'];

export function normalizeRoleText(...parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roleMatchesAny(roleText: string, tokens: string[]): boolean {
  return tokens.some((t) => roleText.includes(t));
}

/** Texto de rol unificado (puesto + role), alineado con reglas Storage y Cloud Function. */
export function getCertificateUserRoleText(user: CertificateAuthUser): string {
  return normalizeRoleText(user?.puesto, user?.role);
}

/** Lectura / previsualización de certificado de patrón. */
export function canViewPatronCertificate(user: CertificateAuthUser): boolean {
  const email = (user?.email || '').toLowerCase();
  if (QUALITY_EMAIL_ALLOWLIST.includes(email)) return true;
  const roleText = getCertificateUserRoleText(user);
  return roleMatchesAny(roleText, [
    'calidad',
    'quality',
    'admin',
    'gerente',
    'manager',
    'metrologo',
    'tecnico',
    'logistica',
  ]);
}

/** Subida de certificado (recepción de calibración). */
export function canUploadPatronCertificate(user: CertificateAuthUser): boolean {
  const email = (user?.email || '').toLowerCase();
  if (QUALITY_EMAIL_ALLOWLIST.includes(email)) return true;
  const roleText = getCertificateUserRoleText(user);
  return roleMatchesAny(roleText, [
    'calidad',
    'quality',
    'admin',
    'gerente',
    'manager',
    'metrologo',
    'tecnico',
  ]);
}

type PatronCertFields = {
  certificadoStoragePath?: string;
  certificadoUrl?: string;
  partesCalibracion?: Array<{
    etiqueta?: string;
    certificadoStoragePath?: string;
    noCertificado?: string;
  }>;
};

export function patronHasCertificate(item: PatronCertFields | null | undefined): boolean {
  if (!item) return false;
  if (item.certificadoStoragePath?.trim() || item.certificadoUrl?.trim()) return true;
  return (item.partesCalibracion ?? []).some(
    (p) => Boolean(p.certificadoStoragePath?.trim()),
  );
}

export type PatronCertificadoListItem = {
  key: string;
  label: string;
  scope: 'root' | 'parte';
  parteId?: string;
  certificadoStoragePath?: string;
  certificadoUrl?: string;
  noCertificado?: string;
};

/** Certificados visibles (raíz + cada parte; incluye enlaces legacy certificadoUrl). */
export function listPatronCertificados(item: PatronCertFields): PatronCertificadoListItem[] {
  const list: PatronCertificadoListItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (entry: PatronCertificadoListItem) => {
    const dedupe =
      entry.certificadoStoragePath?.trim() ||
      entry.certificadoUrl?.trim() ||
      entry.key;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    list.push(entry);
  };

  for (const parte of item.partesCalibracion ?? []) {
    const path = parte.certificadoStoragePath?.trim();
    if (!path) continue;
    pushUnique({
      key: `parte-${parte.id || parte.etiqueta}`,
      label: parte.etiqueta ? `Certificado — ${parte.etiqueta}` : 'Certificado de parte',
      scope: 'parte',
      parteId: parte.id,
      certificadoStoragePath: path,
      noCertificado: parte.noCertificado,
    });
  }

  const rootPath = item.certificadoStoragePath?.trim() || '';
  const rootUrl = item.certificadoUrl?.trim() || '';

  if (rootPath) {
    pushUnique({
      key: 'root',
      label: 'Certificado',
      scope: 'root',
      certificadoStoragePath: rootPath,
      certificadoUrl: rootUrl || undefined,
    });
  } else if (rootUrl) {
    pushUnique({
      key: 'root-legacy',
      label: 'Certificado',
      scope: 'root',
      certificadoUrl: rootUrl,
    });
  }

  return list;
}

export function validateCertificateFile(file: File): string | null {
  if (file.size > MAX_CERTIFICATE_BYTES) {
    return `El archivo supera el límite de ${MAX_CERTIFICATE_BYTES / (1024 * 1024)} MB.`;
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_CERTIFICATE_EXT.has(ext)) {
    return 'Solo se permiten PDF o imágenes (JPG, PNG, WEBP).';
  }
  if (file.type && !ALLOWED_CERTIFICATE_MIME.has(file.type)) {
    return 'Tipo de archivo no permitido. Use PDF o imagen.';
  }
  return null;
}

export function buildCertificateStoragePath(patronId: string, file: File, parteId?: string): string {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const safeExt = ALLOWED_CERTIFICATE_EXT.has(ext) ? ext : 'pdf';
  const uuid = crypto.randomUUID();
  const safeParte = parteId ? parteId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
  /** Una sola carpeta bajo calibraciones/{patronId}/ — las reglas Storage solo permiten 2 niveles. */
  const fileName = safeParte ? `${safeParte}_${uuid}.${safeExt}` : `${uuid}.${safeExt}`;
  return `${CERT_STORAGE_PREFIX}/${patronId}/${fileName}`;
}

/** Extrae ruta Storage desde URL legacy de Firebase (token embebido). */
export function extractStoragePathFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/o\/(.+)$/);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Rutas de certificado de patrón (excluye subárbol Drive certificados/a/b/...). */
export function isPatronCertificateStoragePath(storagePath: string): boolean {
  if (!storagePath || storagePath.includes('..')) return false;
  const parts = storagePath.split('/').filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return false;
  return parts[0] === CERT_STORAGE_PREFIX || parts[0] === LEGACY_CERT_STORAGE_PREFIX;
}

/** Validación más amplia para respaldo getDownloadURL (rutas legacy irregulares). */
export function isReadablePatronCertificatePath(storagePath: string): boolean {
  if (!storagePath || storagePath.includes('..')) return false;
  const parts = storagePath.split('/').filter(Boolean);
  if (parts.length < 2) return false;
  if (parts[0] !== CERT_STORAGE_PREFIX && parts[0] !== LEGACY_CERT_STORAGE_PREFIX) return false;
  if (parts[0] === LEGACY_CERT_STORAGE_PREFIX && parts.length >= 4) return false;
  return true;
}

export function resolvePatronCertificateStoragePath(meta: {
  certificadoStoragePath?: string;
  certificadoUrl?: string;
}): string | null {
  const direct = meta.certificadoStoragePath?.trim();
  if (direct) return direct;
  const legacyUrl = meta.certificadoUrl?.trim();
  if (!legacyUrl) return null;
  return extractStoragePathFromDownloadUrl(legacyUrl);
}

export function isUsableLegacyCertificadoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export type PatronCertificadoErrorCode =
  | 'no-certificate'
  | 'permission-denied'
  | 'function-unavailable'
  | 'storage-denied'
  | 'network'
  | 'unknown';

export function patronCertificadoErrorMessage(code: PatronCertificadoErrorCode): string {
  switch (code) {
    case 'no-certificate':
      return 'No hay certificado digital asociado a este patrón.';
    case 'permission-denied':
      return 'Sin permiso para ver certificados. Contacte a calidad o administración.';
    case 'function-unavailable':
      return 'El servicio de acceso seguro no está disponible. Verifique despliegue de funciones o conexión.';
    case 'storage-denied':
      return 'No se pudo acceder al archivo. Verifique permisos o reglas de Storage.';
    case 'network':
      return 'Error de conexión. Revise su red e intente de nuevo.';
    default:
      return 'No se pudo cargar el certificado. Verifique permisos o conexión.';
  }
}

