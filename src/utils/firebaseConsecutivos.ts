// src/utils/firebaseConsecutivos.ts
import { db } from "./firebase";
import {
    doc,
    runTransaction,
    collection,
    Timestamp,
    query,
    where,
    getDocs,
    deleteDoc,
    getDoc,
    updateDoc,
    arrayUnion,
    increment,
} from "firebase/firestore";
import { getPrefijo } from "./prefijos";

// ─────────────────────────────────────────────────────────────────────────────
// generarConsecutivo
// Genera el siguiente consecutivo para una magnitud/año dados.
// El documento en "consecutivos" se crea con worksheetConfirmado: false.
// Solo se considera "completo" una vez que confirmarWorksheet() sea llamado
// desde la pantalla de la hoja de trabajo al guardarse exitosamente.
// ─────────────────────────────────────────────────────────────────────────────
export async function generarConsecutivo(
    magnitud: string,
    anio: string,
    usuario: string
): Promise<string> {
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
            const anioRegistrado = data.anio || "25";

            if (anioRegistrado === anio && huecos.length > 0) {
                // Llenar hueco más antiguo primero
                huecos.sort((a, b) => a - b);
                nuevo = huecos[0];
                esReciclado = true;
                transaction.update(contadorRef, { huecos: huecos.slice(1) });
            } else {
                const ultimoValor = data.valor || 0;

                if (anioRegistrado !== anio) {
                    // Año nuevo: reiniciar contador
                    nuevo = 1;
                    transaction.update(contadorRef, { valor: 1, anio: anio, huecos: [] });
                } else {
                    nuevo = ultimoValor + 1;
                    transaction.update(contadorRef, { valor: nuevo, anio: anio });
                }
            }
        }

        const consecutivoStr = `${prefijo}-${String(nuevo).padStart(4, "0")}-${anio}`;
        consecutivoFinal = consecutivoStr;

        // Guardar en historial marcado como NO confirmado.
        // worksheetConfirmado se pondrá en true cuando la worksheet se guarde.
        const nuevoDocHistorial = doc(collection(db, "consecutivos"));
        transaction.set(nuevoDocHistorial, {
            consecutivo: consecutivoStr,
            usuario,
            magnitud,
            prefijo,
            fecha: Timestamp.now(),
            fechaCreacion: Timestamp.now(),
            esReciclado,
            worksheetConfirmado: false,   // <── clave del mecanismo
        });
    });

    return consecutivoFinal;
}

// ─────────────────────────────────────────────────────────────────────────────
// confirmarWorksheet
// Llama esta función desde tu pantalla/hook de trabajo DESPUÉS de que la
// worksheet se haya guardado correctamente en Firestore.
// Marca el consecutivo como confirmado para que no sea tratado como huérfano.
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmarWorksheet(
    consecutivo: string,
    magnitud: string
): Promise<void> {
    const q = query(
        collection(db, "consecutivos"),
        where("consecutivo", "==", consecutivo),
        where("magnitud", "==", magnitud)
    );
    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
        await updateDoc(docSnap.ref, { worksheetConfirmado: true });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// auditarHuerfanos
// Busca consecutivos de esta magnitud que tengan worksheetConfirmado: false
// y que lleven más de N minutos sin confirmarse (por defecto 10 min).
//
// Para cada huérfano encontrado:
//   1. Elimina el documento de "consecutivos"
//   2. Registra el número como hueco en el contador correspondiente
//      (solo si es del año actual, para no alterar contadores de otros años)
//
// Devuelve la lista de consecutivos que fueron limpiados, para que la UI
// pueda notificar al usuario si lo desea.
// ─────────────────────────────────────────────────────────────────────────────
export async function auditarHuerfanos(
    magnitud: string,
    anio: string,
    toleranciaMinutos: number = 10
): Promise<string[]> {
    const prefijo = getPrefijo(magnitud);
    const limiteMs = toleranciaMinutos * 60 * 1000;
    const ahora = Date.now();
    const limpiados: string[] = [];

    // Buscar todos los consecutivos no confirmados de esta magnitud
    const q = query(
        collection(db, "consecutivos"),
        where("magnitud", "==", magnitud),
        where("worksheetConfirmado", "==", false)
    );

    const snap = await getDocs(q);

    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const fechaCreacion: Timestamp = data.fechaCreacion;

        // Solo procesar si ya pasó el tiempo de tolerancia
        if (!fechaCreacion) continue;
        const edadMs = ahora - fechaCreacion.toMillis();
        if (edadMs < limiteMs) continue;

        const consecutivoStr: string = data.consecutivo;

        // Extraer número y año del consecutivo (formato: PREFIJO-NNNN-AA)
        const partes = consecutivoStr.split("-");
        if (partes.length < 3) continue;

        const anioDelDoc = partes[partes.length - 1];
        const numeroStr = partes[partes.length - 2];
        const numero = parseInt(numeroStr, 10);
        if (isNaN(numero)) continue;

        // Solo meter al hueco si el año coincide con el año actual del contador
        const contadorRef = doc(db, "contadores", prefijo);
        const contadorSnap = await getDoc(contadorRef);

        if (contadorSnap.exists()) {
            const contadorData = contadorSnap.data();
            const anioEnContador = contadorData.anio || "25";

            if (anioEnContador === anioDelDoc && anioDelDoc === anio) {
                const valorActual: number = contadorData.valor || 0;

                if (valorActual === numero) {
                    // Es el último: decrementar directamente
                    await updateDoc(contadorRef, { valor: increment(-1) });
                } else {
                    // Está en medio: registrar como hueco
                    await updateDoc(contadorRef, { huecos: arrayUnion(numero) });
                }
            }
            // Si es de un año distinto, simplemente borramos el doc sin tocar el contador
        }

        // Borrar el consecutivo huérfano
        await deleteDoc(docSnap.ref);
        limpiados.push(consecutivoStr);
    }

    return limpiados;
}