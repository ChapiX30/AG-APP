import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useMemo } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  setPersistence,
  inMemoryPersistence,
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
  const docSnap = await getDoc(doc(db, "usuarios", uid));
  let name = email;
  let puesto = "";
  let role = "";
  if (docSnap.exists()) {
    const data = docSnap.data();
    name = String(data.name || data.nombre || name);
    puesto = String(data.puesto || data.cargo || "").trim();
    role = String(data.role || data.rol || "").trim();
  }
  return { id: uid, name, email, puesto, role };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);

  // Sin sesión al recargar: no restaurar usuario desde Firebase (comportamiento original)
  useEffect(() => {
    void setPersistence(auth, inMemoryPersistence);
    void firebaseSignOut(auth);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
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
    }),
    [user, login, completeLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
