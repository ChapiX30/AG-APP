/**
 * Cuentas de prueba / demo que no deben aparecer en listados de la app.
 * Siguen pudiendo iniciar sesión; solo se ocultan en UI y destinatarios.
 */

type UserLike = {
  name?: string | null;
  nombre?: string | null;
  displayName?: string | null;
  email?: string | null;
  correo?: string | null;
} | null | undefined;

const HIDDEN_NAME_TOKENS = ['prueba', 'test', 'demo', 'temporal', 'ejemplo'] as const;

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** True si el nombre o correo indica cuenta de prueba (p. ej. "Prueba"). */
export function isHiddenTestAccount(user: UserLike): boolean {
  if (!user) return false;
  const name = normalize(
    String(user.name || user.nombre || user.displayName || ''),
  );
  const email = normalize(String(user.email || user.correo || ''));
  const combined = `${name} ${email}`;
  if (!combined.trim()) return false;
  return HIDDEN_NAME_TOKENS.some((token) => combined.includes(token));
}

/** Filtra cuentas de prueba de un arreglo de usuarios. */
export function filterVisibleUsers<T extends UserLike>(users: T[]): T[] {
  return users.filter((u) => !isHiddenTestAccount(u));
}
