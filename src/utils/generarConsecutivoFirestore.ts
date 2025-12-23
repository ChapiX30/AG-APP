// src/utils/generarConsecutivoFirestore.ts
import { db } from './firebase';
import { doc, runTransaction, Timestamp } from "firebase/firestore";

// Definimos la estructura del documento en la colección 'contadores' para tener autocompletado y seguridad
interface ContadorData {
    valor: number;
    anio: string;
}

/**
 * Genera un consecutivo único con formato MAGNITUD-0000-AA.
 * Reinicia el contador automáticamente si detecta un cambio de año.
 * * @param magnitud Prefijo del contador (ej. "AGD", "AGEL")
 * @param anio Año en formato string (ej. "25" o "2025")
 * @param usuario ID o nombre del usuario que genera el folio
 */
export async function generarConsecutivoFirestore(magnitud: string, anio: string, usuario: string): Promise<string> {
    const docRef = doc(db, "contadores", magnitud);

    try {
        const consecutivo = await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            
            let nuevoValor = 1;
            
            if (!docSnap.exists()) {
                // CASO 1: El contador no existe. Lo creamos desde cero.
                transaction.set(docRef, { valor: 1, anio: anio });
            } else {
                // CASO 2: El contador existe. Verificamos si cambiamos de año.
                const data = docSnap.data() as ContadorData;
                
                // Si 'data.anio' no existe (datos viejos), asumimos que son del año actual para no reiniciar por error.
                const anioRegistrado = data.anio || anio; 

                if (anioRegistrado !== anio) {
                    // ¡Cambio de año! Reiniciamos a 1
                    nuevoValor = 1;
                } else {
                    // Mismo año, incrementamos
                    nuevoValor = (data.valor || 0) + 1;
                }

                transaction.update(docRef, { 
                    valor: nuevoValor,
                    anio: anio // Actualizamos el año siempre para mantenerlo sincronizado
                });
            }

            // Formateo: AGD-0001-25
            // padStart(4, "0") asegura que siempre sean 4 dígitos (0001, 0010, 0100, etc.)
            const consecutivoStr = `${magnitud}-${nuevoValor.toString().padStart(4, "0")}-${anio}`;

            // (Opcional) Guardar historial en colección aparte para auditoría
            const histRef = doc(db, "consecutivos", consecutivoStr);
            transaction.set(histRef, {
                consecutivo: consecutivoStr,
                magnitud,
                anio,
                usuario,
                fechaCreacion: Timestamp.now() // Usamos Timestamp de Firestore que es más preciso
            });

            return consecutivoStr;
        });

        return consecutivo;

    } catch (error) {
        console.error("Error al generar consecutivo:", error);
        throw new Error("No se pudo generar el folio, por favor intente de nuevo.");
    }
}