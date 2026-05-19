import { collection, query, where, getDocs, limit, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Busca un documento en `usuarios` por correo institucional.
 * El registro guarda `correo`; documentos antiguos pueden usar `email`.
 *
 * El saludo previo al login requiere reglas Firestore que permitan
 * query/list filtrada por correo sin auth; si no, se omite sin error visible.
 */
export async function findUsuarioDocByCorreo(
  email: string
): Promise<QueryDocumentSnapshot<DocumentData> | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  try {
    let snap = await getDocs(
      query(collection(db, "usuarios"), where("correo", "==", key), limit(1))
    );
    if (snap.empty) {
      snap = await getDocs(
        query(collection(db, "usuarios"), where("email", "==", key), limit(1))
      );
    }
    return snap.empty ? null : snap.docs[0];
  } catch {
    return null;
  }
}
