import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../utils/firebase";
import { doc, getDoc } from "firebase/firestore";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
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

const loadUserProfile = async (uid: string, email: string): Promise<User> => {
  const docSnap = await getDoc(doc(db, "usuarios", uid));
  let name = email;
  let role = "";
  if (docSnap.exists()) {
    const data = docSnap.data();
    name = data.nombre || name;
    role = data.puesto || "";
  }
  return { id: uid, name, email, role };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const loadedUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        loadedUidRef.current = null;
        setUser(null);
        return;
      }
      if (loadedUidRef.current === firebaseUser.uid) return;
      loadedUidRef.current = firebaseUser.uid;
      try {
        setUser(await loadUserProfile(
          firebaseUser.uid,
          firebaseUser.email || "",
        ));
      } catch {
        loadedUidRef.current = null;
        setUser(null);
      }
    });
    return () => unsub();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await loadUserProfile(cred.user.uid, cred.user.email || email);
    loadedUidRef.current = cred.user.uid;
    setUser(profile);
    return true;
  };

  const logout = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
