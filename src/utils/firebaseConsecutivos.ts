import { db } from "./firebase";
import { doc, runTransaction, setDoc, collection, Timestamp } from "firebase/firestore";
import { getPrefijo } from "./prefijos";

export async function generarConsecutivo(magnitud: string, anio: string, usuario: string) {
    const prefijo = getPrefijo(magnitud);
    const contadorRef = doc(db, "contadores", prefijo);
    let consecutivoFinal = "";

    await runTransaction(db, async (transaction) => {
        const contadorDoc = await transaction.get(contadorRef);

        let ultimo = 0;
        if (contadorDoc.exists()) {
            ultimo = contadorDoc.data().valor || 0;
        }
        const nuevo = ultimo + 1;
        transaction.set(contadorRef, { valor: nuevo });

        const consecutivoStr = `${prefijo}-${String(nuevo).padStart(4, "0")}-${anio}`;
        consecutivoFinal = consecutivoStr;

        // Guarda en consecutivos (histórico)
        const consRef = collection(db, "consecutivos");
        transaction.set(doc(consRef), {
            consecutivo: consecutivoStr,
            usuario,
            magnitud,
            fecha: Timestamp.now(),
        });
    });

    return consecutivoFinal;
}
