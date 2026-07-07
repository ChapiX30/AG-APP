import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useMemo } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, db } from "../utils/firebase";
import { doc, getDoc } from "firebase/firestore";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  puesto: string;
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

export const loadUserProfile = async (uid: string, email: string): Promise<AuthUser> => {
  try {
    const docSnap = await getDoc(doc(db, "usuarios", uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: uid,
        name: String(data.name || data.nombre || email),
        email,
        puesto: String(data.puesto || data.cargo || "").trim(),
        role: String(data.role || data.rol || "").trim(),
      };
    }
  } catch (err) {
    console.warn("No se pudo cargar el perfil de Firestore; se usa perfil básico.", err);
  }

  return { id: uid, name: email, email, puesto: "", role: "" };
};

let authPersistencePromise: Promise<void> | null = null;

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
            try {
              const profile = await loadUserProfile(
                firebaseUser.uid,
                firebaseUser.email || ""
              );
              if (!cancelled) setUser(profile);
            } catch (err) {
              console.warn("No se pudo restaurar el perfil de sesión:", err);
              if (!cancelled) {
                setUser({
                  id: firebaseUser.uid,
                  name: firebaseUser.email || "Usuario",
                  email: firebaseUser.email || "",
                  puesto: "",
                  role: "",
                });
              }
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

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    await ensureAuthPersistence();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return loadUserProfile(cred.user.uid, cred.user.email || email);
  }, []);

  const completeLogin = useCallback((profile: AuthUser) => {
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
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
