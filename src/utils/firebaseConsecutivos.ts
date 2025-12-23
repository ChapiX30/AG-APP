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
        let esReciclado = false; // Bandera para saber si sacamos el número del reciclaje

        if (!contadorDoc.exists()) {
            transaction.set(contadorRef, { valor: 1, anio: anio, huecos: [] });
        } else {
            const data = contadorDoc.data();

            // 1. REVISAR SI HAY HUECOS (Números borrados intermedios)
            // Asegúrate de que 'huecos' sea un array de números
            const huecos: number[] = data.huecos || [];

            // Verificamos si el año coincide. Si cambiamos de año, ignoramos los huecos del año viejo.
            const anioRegistrado = data.anio || anio;

            if (anioRegistrado === anio && huecos.length > 0) {
                // TOMA EL HUECO MÁS PEQUEÑO (Para llenar en orden 184, luego 185...)
                huecos.sort((a, b) => a - b);
                nuevo = huecos[0];
                esReciclado = true;

                // Quitamos ese número de la lista de huecos
                const nuevosHuecos = huecos.slice(1);
                transaction.update(contadorRef, { huecos: nuevosHuecos });

            } else {
                // 2. SI NO HAY HUECOS, COMPORTAMIENTO NORMAL
                const ultimoValor = data.valor || 0;

                if (anioRegistrado !== anio) {
                    nuevo = 1; // Año Nuevo
                    // Al cambiar de año, limpiamos los huecos viejos también
                    transaction.update(contadorRef, { valor: 1, anio: anio, huecos: [] });
                } else {
                    nuevo = ultimoValor + 1; // Siguiente número
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
            fecha: Timestamp.now(),
            fechaCreacion: Timestamp.now(),
            esReciclado: esReciclado // Opcional: para que sepas cuáles fueron rellenos
        });
    });

    return consecutivoFinal;
}