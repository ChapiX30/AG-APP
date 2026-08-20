import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useMemo, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, db } from "../utils/firebase";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { migrarMiPerfilUid } from "../utils/adminUsuariosApi";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  puesto: string;
}

/** Cuenta Auth válida pero no autorizada / desactivada en la app. */
export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

interface AuthContextType {
  user: AuthUser | null;
  /** Autentica en Firebase y devuelve el perfil sin activar la sesión en la app. */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Activa la sesión tras la animación de entrada (mantiene LoginScreen montado). */
  completeLogin: (profile: AuthUser) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  authReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const profileFromData = (
  uid: string,
  email: string,
  data: Record<string, unknown>,
  fallbackDisplayName?: string | null,
): AuthUser => {
  const rawName = String(data.name || data.nombre || "").trim();
  const displayFallback = String(fallbackDisplayName || "").trim();
  const puesto = String(data.puesto || data.cargo || data.position || "").trim();
  const role = String(data.role || data.rol || data.position || "").trim();
  const resolvedName =
    (rawName && !rawName.includes("@") ? rawName : "") ||
    (displayFallback && !displayFallback.includes("@") ? displayFallback : "") ||
    email;
  return {
    id: uid,
    name: resolvedName,
    email,
    puesto,
    role,
  };
};

const findUsuarioData = async (
  uid: string,
  email: string,
): Promise<Record<string, unknown> | null> => {
  const byUid = await getDoc(doc(db, "usuarios", uid));
  if (byUid.exists()) {
    return byUid.data() as Record<string, unknown>;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  for (const field of ["email", "correo"] as const) {
    const snap = await getDocs(
      query(collection(db, "usuarios"), where(field, "==", normalized), limit(1)),
    );
    if (!snap.empty) {
      return snap.docs[0].data() as Record<string, unknown>;
    }
    // Algunos docs guardan el correo con mayúsculas distintas
    if (email !== normalized) {
      const snapExact = await getDocs(
        query(collection(db, "usuarios"), where(field, "==", email.trim()), limit(1)),
      );
      if (!snapExact.empty) {
        return snapExact.docs[0].data() as Record<string, unknown>;
      }
    }
  }

  return null;
};

/**
 * Solo permite entrar si existe registro autorizado en `usuarios` y no está desactivado.
 * Ya no se acepta un perfil "fantasma" solo por tener cuenta en Firebase Auth.
 */
export const loadUserProfile = async (
  uid: string,
  email: string,
  fallbackDisplayName?: string | null,
): Promise<AuthUser> => {
  const readProfile = async (): Promise<AuthUser | null> => {
    try {
      const byUid = await getDoc(doc(db, "usuarios", uid));
      if (byUid.exists()) {
        const data = byUid.data() as Record<string, unknown>;
        if (data.activo === false) {
          throw new AccessDeniedError(
            "Tu cuenta está desactivada. Contacta al administrador.",
          );
        }
        return profileFromData(uid, email, data, fallbackDisplayName);
      }
    } catch (err) {
      if (err instanceof AccessDeniedError) throw err;
      console.warn("No se pudo leer usuarios/{uid}:", err);
      throw new AccessDeniedError(
        "No se pudo verificar tu acceso. Revisa tu conexión o contacta al administrador.",
      );
    }
    return null;
  };

  let profile = await readProfile();
  if (profile) return profile;

  // Perfil legacy u otro id: intenta vincular a usuarios/{uid} vía Admin SDK.
  try {
    await migrarMiPerfilUid();
    profile = await readProfile();
    if (profile) return profile;
  } catch (err) {
    if (err instanceof AccessDeniedError) throw err;
    const msg = err instanceof Error ? err.message : "";
    if (/autorizada|desactivada|permission-denied|functions\/permission-denied/i.test(msg)) {
      throw new AccessDeniedError(
        msg.includes("desactivada")
          ? "Tu cuenta está desactivada. Contacta al administrador."
          : "Tu cuenta no está autorizada. Solo el administrador puede dar de alta usuarios.",
      );
    }
    console.warn("No se pudo migrar/vincular perfil de usuario:", err);
  }

  // Último recurso: lectura por correo (antes de desplegar la function de migración).
  try {
    const data = await findUsuarioData(uid, email);
    if (data) {
      if (data.activo === false) {
        throw new AccessDeniedError(
          "Tu cuenta está desactivada. Contacta al administrador.",
        );
      }
      return profileFromData(uid, email, data, fallbackDisplayName);
    }
  } catch (err) {
    if (err instanceof AccessDeniedError) throw err;
  }

  throw new AccessDeniedError(
    "Tu cuenta no está autorizada. Solo el administrador puede dar de alta usuarios.",
  );
};

let authPersistencePromise: Promise<void> | null = null;

/** Sin actividad → cerrar sesión (web y app). */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_CHECK_MS = 15_000;
const ACTIVITY_STORAGE_KEY = "ag_last_activity_at";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "keydown",
  "touchstart",
  "mousemove",
  "scroll",
  "wheel",
];

const readLastActivity = (): number => {
  try {
    const n = Number(localStorage.getItem(ACTIVITY_STORAGE_KEY) || 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const writeLastActivity = (ts = Date.now()) => {
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(ts));
  } catch {
    /* ignore */
  }
};

const clearLastActivity = () => {
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

const isIdleExpired = (lastActivityAt: number): boolean => {
  if (!lastActivityAt) return false;
  return Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS;
};

const ensureAuthPersistence = (): Promise<void> => {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence).catch((err) => {
      authPersistencePromise = null;
      throw err;
    });
  }
  return authPersistencePromise;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const logoutRef = useRef<() => Promise<void>>(async () => {});

  const logout = useCallback(async () => {
    clearLastActivity();
    lastActivityRef.current = 0;
    await firebaseSignOut(auth);
    setUser(null);
  }, []);

  logoutRef.current = logout;

  const markActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    // No escribir en cada mousemove: como máximo cada ~20s
    const stored = readLastActivity();
    if (!stored || now - stored > 20_000) {
      writeLastActivity(now);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    void (async () => {
      try {
        await ensureAuthPersistence();
      } catch (err) {
        console.warn("Error configurando persistencia de sesión:", err);
      }

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        void (async () => {
          if (cancelled) return;

          if (firebaseUser) {
            const last = readLastActivity();
            if (isIdleExpired(last)) {
              console.info("Sesión cerrada por inactividad (al restaurar).");
              clearLastActivity();
              try {
                await firebaseSignOut(auth);
              } catch {
                /* ignore */
              }
              if (!cancelled) setUser(null);
              if (!cancelled) setAuthReady(true);
              return;
            }

            try {
              const profile = await loadUserProfile(
                firebaseUser.uid,
                firebaseUser.email || "",
                firebaseUser.displayName,
              );
              if (!cancelled) {
                writeLastActivity(Date.now());
                lastActivityRef.current = Date.now();
                setUser(profile);
              }
            } catch (err) {
              console.warn("Sesión rechazada (usuario no autorizado o inactivo):", err);
              try {
                await firebaseSignOut(auth);
              } catch {
                /* ignore */
              }
              if (!cancelled) setUser(null);
            }
          } else if (!cancelled) {
            setUser(null);
          }

          if (!cancelled) setAuthReady(true);
        })();
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /* Vigilancia de inactividad: 5 min sin uso → logout */
  useEffect(() => {
    if (!user) return;

    const onActivity = () => markActivity();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const last = Math.max(lastActivityRef.current, readLastActivity());
      if (isIdleExpired(last)) {
        console.info("Sesión cerrada por inactividad (al volver a la app).");
        void logoutRef.current();
        return;
      }
      markActivity();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const intervalId = window.setInterval(() => {
      const last = Math.max(lastActivityRef.current, readLastActivity());
      if (isIdleExpired(last)) {
        console.info("Sesión cerrada por inactividad.");
        void logoutRef.current();
      }
    }, IDLE_CHECK_MS);

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [user, markActivity]);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    await ensureAuthPersistence();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    try {
      const profile = await loadUserProfile(
        cred.user.uid,
        cred.user.email || email,
        cred.user.displayName,
      );
      writeLastActivity(Date.now());
      lastActivityRef.current = Date.now();
      return profile;
    } catch (err) {
      try {
        await firebaseSignOut(auth);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }, []);

  const completeLogin = useCallback((profile: AuthUser) => {
    writeLastActivity(Date.now());
    lastActivityRef.current = Date.now();
    setUser(profile);
  }, []);

  const value = useMemo(
    () => ({
      user,
      login,
      completeLogin,
      logout,
      isAuthenticated: !!user,
      authReady,
    }),
    [user, login, completeLogin, logout, authReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
