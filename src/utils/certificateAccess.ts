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
  email?: string;
} | null;

const QUALITY_EMAIL_ALLOWLIST = ['eaaese07@gmail.com'];

function normalizeRoleText(role?: string): string {
  return (role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function roleMatchesAny(roleText: string, tokens: string[]): boolean {
  return tokens.some((t) => roleText.includes(t));
}

/** Lectura / previsualización de certificado de patrón. */
export function canViewPatronCertificate(user: CertificateAuthUser): boolean {
  const email = (user?.email || '').toLowerCase();
  if (QUALITY_EMAIL_ALLOWLIST.includes(email)) return true;
  const roleText = normalizeRoleText(user?.role);
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
  const roleText = normalizeRoleText(user?.role);
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

export function patronHasCertificate(
  item: {
    certificadoStoragePath?: string;
    certificadoUrl?: string;
  } | null | undefined
): boolean {
  if (!item) return false;
  return Boolean(item.certificadoStoragePath?.trim() || item.certificadoUrl?.trim());
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

export function buildCertificateStoragePath(patronId: string, file: File): string {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const safeExt = ALLOWED_CERTIFICATE_EXT.has(ext) ? ext : 'pdf';
  const uuid = crypto.randomUUID();
  return `${CERT_STORAGE_PREFIX}/${patronId}/${uuid}.${safeExt}`;
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
