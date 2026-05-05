// src/utils/firebaseConsecutivos.ts
import { db } from "./firebase";
import { doc, runTransaction, collection, Timestamp } from "firebase/firestore";
import { getPrefijo } from "./prefijos";

export async function generarConsecutivo(magnitud: string, anio: string, usuario: string) {
    const prefijo = getPrefijo(magnitud);
    const contadorRef = doc(db, "contadores", prefijo);
    let consecutivoFinal = "";

    await runTransaction(db, async (transaction) => {
        const contadorDoc = await transaction.get(contadorRef);
        let nuevo = 1;
        let esReciclado = false;

        if (!contadorDoc.exists()) {
            transaction.set(contadorRef, { valor: 1, anio: anio, huecos: [] });
        } else {
            const data = contadorDoc.data();
            const huecos: number[] = data.huecos || [];

            // CORRECCIÓN CRÍTICA:
            // Si la base de datos no tiene año (datos viejos), asumimos que son del "25".
            // Así, al comparar con "26", sabrá que son diferentes y reiniciará.
            const anioRegistrado = data.anio || "25";

            // 1. REVISAR SI HAY HUECOS (Solo si es el mismo año)
            if (anioRegistrado === anio && huecos.length > 0) {
                huecos.sort((a, b) => a - b);
                nuevo = huecos[0];
                esReciclado = true;
                const nuevosHuecos = huecos.slice(1);
                transaction.update(contadorRef, { huecos: nuevosHuecos });

            } else {
                // 2. SI NO HAY HUECOS
                const ultimoValor = data.valor || 0;

                if (anioRegistrado !== anio) {
                    // ¡AÑO NUEVO DETECTADO! (Ej. 25 vs 26)
                    nuevo = 1;
                    // Reiniciamos valor a 1, actualizamos el año y borramos huecos viejos
                    transaction.update(contadorRef, { valor: 1, anio: anio, huecos: [] });
                } else {
                    // Mismo año, seguimos contando
                    nuevo = ultimoValor + 1;
                    transaction.update(contadorRef, { valor: nuevo, anio: anio });
                }
            }
        }

        const consecutivoStr = `${prefijo}-${String(nuevo).padStart(4, "0")}-${anio}`;
        consecutivoFinal = consecutivoStr;

        // Guardar historial
        const consRef = collection(db, "consecutivos");
        const nuevoDocHistorial = doc(consRef);

        transaction.set(nuevoDocHistorial, {
            consecutivo: consecutivoStr,
            usuario,
            magnitud,
            prefijo,
            fecha: Timestamp.now(), // Usa la fecha real del servidor
            fechaCreacion: Timestamp.now(),
            esReciclado: esReciclado
        });
    });

    return consecutivoFinal;
}