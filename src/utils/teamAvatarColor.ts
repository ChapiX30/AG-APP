import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

const isDev = import.meta.env.DEV;

function firebaseErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** Distinct team avatar colors (hex). Reused across Servicios and Friday boards. */
export const TEAM_AVATAR_PALETTE: readonly string[] = [
  '#e11d48', // rose
  '#ea580c', // orange
  '#d97706', // amber
  '#16a34a', // green
  '#059669', // emerald
  '#0d9488', // teal
  '#0891b2', // cyan
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#9333ea', // purple
  '#c026d3', // fuchsia
  '#db2777', // pink
  '#475569', // slate
  '#b45309', // brown
  '#0f766e', // dark teal
] as const;

export type TeamAvatarColor = (typeof TEAM_AVATAR_PALETTE)[number];

export const TEAM_COLOR_FIRESTORE_FIELD = 'color' as const;

const PALETTE_SET = new Set(
  TEAM_AVATAR_PALETTE.map((c) => normalizeTeamColor(c))
);

export function normalizeTeamColor(color: string | undefined | null): string {
  if (!color || typeof color !== 'string') return '';
  const trimmed = color.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

export function isPaletteTeamColor(color: string | undefined | null): boolean {
  const n = normalizeTeamColor(color);
  return n.length > 0 && PALETTE_SET.has(n);
}

export function getUserTeamColor(user: { color?: string } | undefined | null): string | undefined {
  const c = normalizeTeamColor(user?.color);
  return c || undefined;
}

export function getAvatarBackgroundStyle(
  color: string | undefined | null
): { backgroundColor?: string } {
  const c = getUserTeamColor({ color: color ?? undefined });
  if (c) return { backgroundColor: c };
  return {};
}

export function getTakenPaletteColors(
  usuarios: { id: string; color?: string }[],
  excludeUserId?: string
): Set<string> {
  const taken = new Set<string>();
  for (const u of usuarios) {
    if (excludeUserId && u.id === excludeUserId) continue;
    const c = normalizeTeamColor(u.color);
    if (c && PALETTE_SET.has(c)) taken.add(c);
  }
  return taken;
}

export function getAvailablePaletteColors(
  usuarios: { id: string; color?: string }[],
  excludeUserId?: string
): string[] {
  const taken = getTakenPaletteColors(usuarios, excludeUserId);
  return TEAM_AVATAR_PALETTE.filter((c) => !taken.has(normalizeTeamColor(c)));
}

export type ClaimTeamColorResult =
  | { ok: true }
  | { ok: false; code: 'invalid' | 'already_set' | 'taken' | 'not_found' | 'unknown'; message: string };

export async function claimTeamAvatarColor(
  /** Firebase Auth uid — must match `usuarios/{uid}` for security rules. */
  authUserId: string,
  color: string,
  options?: { allowDuplicate?: boolean; takenColors?: Set<string> }
): Promise<ClaimTeamColorResult> {
  const normalized = normalizeTeamColor(color);
  if (!PALETTE_SET.has(normalized)) {
    return { ok: false, code: 'invalid', message: 'El color seleccionado no es válido.' };
  }

  if (!authUserId?.trim()) {
    return { ok: false, code: 'not_found', message: 'No se encontró tu sesión de usuario.' };
  }

  if (!options?.allowDuplicate && options?.takenColors?.has(normalized)) {
    return {
      ok: false,
      code: 'taken',
      message: 'Ese color ya fue elegido por otro miembro del equipo.',
    };
  }

  try {
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'usuarios', authUserId);
      const userSnap = await transaction.get(userRef);
      const existing = userSnap.exists()
        ? normalizeTeamColor(userSnap.data()?.[TEAM_COLOR_FIRESTORE_FIELD])
        : '';
      if (existing) {
        throw Object.assign(new Error('already_set'), { code: 'already_set' });
      }

      transaction.set(
        userRef,
        { [TEAM_COLOR_FIRESTORE_FIELD]: normalized },
        { merge: true }
      );
    });
    return { ok: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'already_set') {
      return { ok: false, code: 'already_set', message: 'Ya tienes un color de equipo asignado.' };
    }
    const fbCode = firebaseErrorCode(err);
    if (fbCode === 'permission-denied') {
      console.error('claimTeamAvatarColor: permission-denied', { authUserId, color: normalized, err });
      return {
        ok: false,
        code: 'unknown',
        message: isDev
          ? 'Permiso denegado al guardar color (revisa reglas Firestore en usuarios/{uid}).'
          : 'No se pudo guardar el color. Intenta de nuevo.',
      };
    }
    console.error('claimTeamAvatarColor', { authUserId, color: normalized, fbCode, err });
    return {
      ok: false,
      code: 'unknown',
      message: isDev && fbCode
        ? `No se pudo guardar el color (${fbCode}).`
        : 'No se pudo guardar el color. Intenta de nuevo.',
    };
  }
}
