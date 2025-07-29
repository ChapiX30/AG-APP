// src/utils/generarConsecutivoFirestore.ts
import { db } from './firebase'; // Asegúrate que esta ruta es la correcta en tu proyecto
import { doc, runTransaction } from "firebase/firestore";

// magnitud es el prefijo, ejemplo: AGD, AGEL, etc.
export async function generarConsecutivoFirestore(magnitud: string, anio: string, usuario: string) {
    const docRef = doc(db, "contadores", magnitud);

    const consecutivo = await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists()) {
            throw new Error("Contador no encontrado para esta magnitud");
        }
        const valorActual = docSnap.data().valor || 0;
        const nuevoValor = valorActual + 1;
        transaction.update(docRef, { valor: nuevoValor });

        // Ejemplo: AGD-0001-25
        const consecutivoStr = `${magnitud}-${nuevoValor.toString().padStart(4, "0")}-${anio}`;

        // (Opcional) Guardar historial
        const histRef = doc(db, "consecutivos", consecutivoStr);
        transaction.set(histRef, {
            consecutivo: consecutivoStr,
            magnitud,
            anio,
            usuario,
            fecha: new Date()
        });

        return consecutivoStr;
    });

    return consecutivo;
}
