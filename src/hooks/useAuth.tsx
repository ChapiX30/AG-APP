import { useState, createContext, useContext, ReactNode } from 'react';
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Traer datos adicionales de Firestore (usuarios)
      const docRef = doc(db, "usuarios", userCredential.user.uid);
      const docSnap = await getDoc(docRef);

      let name = userCredential.user.email || "";
      let role = "";
      if (docSnap.exists()) {
        const data = docSnap.data();
        name = data.nombre || name;
        role = data.puesto || "";
      }

      setUser({
        id: userCredential.user.uid,
        name,
        email: userCredential.user.email || "",
        role,
      });

      return true;
    } catch (e) {
      return false;
    }
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
