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
    limit,
} from "firebase/firestore";
import { getPrefijo } from "./prefijos";

export type ConsecutivoPartes = {
    prefijo: string;
    numero: number;
    anio: string;
};

const RECONCILE_COOLDOWN_MS = 30 * 60 * 1000;

/** Firestore a veces devuelve huecos como objeto {0: n, 1: m} en lugar de array. */
export function normalizeHuecos(raw: unknown): number[] {
    if (Array.isArray(raw)) {
        return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    }
    if (raw && typeof raw === "object") {
        return Object.values(raw as Record<string, unknown>)
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0);
    }
    return [];
}

export function parseConsecutivo(consecutivo: string): ConsecutivoPartes | null {
    const partes = consecutivo.trim().split("-");
    if (partes.length < 3) return null;
    const anio = partes[partes.length - 1];
    const numero = parseInt(partes[partes.length - 2], 10);
    const prefijo = partes.slice(0, -2).join("-");
    if (!prefijo || isNaN(numero)) return null;
    return { prefijo, numero, anio };
}

export function formatConsecutivo(prefijo: string, numero: number, anio: string): string {
    return `${prefijo}-${String(numero).padStart(4, "0")}-${anio}`;
}

/** ¿Ya hay hoja guardada con este certificado? */
export async function hojaTrabajoExiste(consecutivo: string): Promise<boolean> {
    const cert = consecutivo.replace(/\s+/g, "").toUpperCase();
    if (!cert) return false;

    const snap = await getDocs(
        query(collection(db, "hojasDeTrabajo"), where("certificado", "==", cert), limit(1))
    );
    if (!snap.empty) return true;

    const spaced = cert.replace(/^([A-Z]+)-(\d+)-(\d+)$/i, "$1 - $2 - $3");
    if (spaced !== cert) {
        const snap2 = await getDocs(
            query(collection(db, "hojasDeTrabajo"), where("certificado", "==", spaced), limit(1))
        );
        return !snap2.empty;
    }
    return false;
}

async function certificadosConHoja(certs: string[]): Promise<Set<string>> {
    const existentes = new Set<string>();
    const unicos = [...new Set(certs.map((c) => c.replace(/\s+/g, "").toUpperCase()))];
    for (let i = 0; i < unicos.length; i += 30) {
        const chunk = unicos.slice(i, i + 30);
        const snap = await getDocs(
            query(collection(db, "hojasDeTrabajo"), where("certificado", "in", chunk))
        );
        snap.forEach((d) => {
            const c = String(d.data().certificado || "").replace(/\s+/g, "").toUpperCase();
            if (c) existentes.add(c);
        });
    }
    return existentes;
}

function reconcileCooldownKey(prefijo: string, anio: string) {
    return `consecutivos_reconcile_${prefijo}_${anio}`;
}

/** Máximo número emitido en hojas para prefijo/año (rango por certificado). */
async function maxNumeroEnHojas(prefijo: string, anio: string): Promise<number> {
    const yearSuffix = `-${anio}`;
    const snap = await getDocs(
        query(
            collection(db, "hojasDeTrabajo"),
            where("certificado", ">=", `${prefijo}-`),
            where("certificado", "<=", `${prefijo}-\uf8ff`)
        )
    );
    let max = 0;
    snap.forEach((d) => {
        const parsed = parseConsecutivo(String(d.data().certificado || ""));
        if (!parsed || parsed.prefijo !== prefijo || parsed.anio !== anio) return;
        if (parsed.numero > max) max = parsed.numero;
    });
    return max;
}

export type ReconcileResult = {
    huecosAntes: number;
    huecosDespues: number;
    huecosEliminados: number;
    valorAnterior: number;
    valorNuevo: number;
    confirmados: number;
};

/**
 * Limpia huecos falsos (número ya tiene hoja) y alinea valor con el máximo real del año.
 */
export async function reconciliarContadorHuecos(
    magnitud: string,
    anio: string,
    force = false
): Promise<ReconcileResult | null> {
    const prefijo = getPrefijo(magnitud);
    const key = reconcileCooldownKey(prefijo, anio);

    if (!force) {
        try {
            const last = Number(sessionStorage.getItem(key) || 0);
            if (Date.now() - last < RECONCILE_COOLDOWN_MS) return null;
        } catch {
            /* ignore */
        }
    }

    const contadorRef = doc(db, "contadores", prefijo);
    const contadorSnap = await getDoc(contadorRef);
    if (!contadorSnap.exists()) return null;

    const data = contadorSnap.data();
    const anioContador = String(data.anio || anio);
    if (anioContador !== anio) return null;

    const huecosAntes = normalizeHuecos(data.huecos);
    const valorAnterior = Number(data.valor) || 0;

    const certs = huecosAntes.map((n) => formatConsecutivo(prefijo, n, anio));
    const conHoja = await certificadosConHoja(certs);

    const huecosValidos = huecosAntes.filter((n) => {
        const cert = formatConsecutivo(prefijo, n, anio).replace(/\s+/g, "").toUpperCase();
        return !conHoja.has(cert);
    });

    const maxHojas = await maxNumeroEnHojas(prefijo, anio);
    const valorNuevo = Math.max(valorAnterior, maxHojas);

    const updates: Record<string, unknown> = {};
    if (huecosValidos.length !== huecosAntes.length) {
        updates.huecos = huecosValidos;
    }
    if (valorNuevo !== valorAnterior) {
        updates.valor = valorNuevo;
    }
    if (Object.keys(updates).length > 0) {
        await updateDoc(contadorRef, updates);
    }

    let confirmados = 0;
    for (const n of huecosAntes) {
        const cert = formatConsecutivo(prefijo, n, anio);
        if (!conHoja.has(cert.replace(/\s+/g, "").toUpperCase())) continue;
        await confirmarWorksheet(cert, magnitud);
        confirmados++;
    }

    try {
        sessionStorage.setItem(key, String(Date.now()));
    } catch {
        /* ignore */
    }

    return {
        huecosAntes: huecosAntes.length,
        huecosDespues: huecosValidos.length,
        huecosEliminados: huecosAntes.length - huecosValidos.length,
        valorAnterior,
        valorNuevo,
        confirmados,
    };
}

/** Quita del contador huecos que ya tienen hoja (antes de asignar reciclado). */
async function limpiarHuecosInvalidosEnContador(
    contadorRef: ReturnType<typeof doc>,
    prefijo: string,
    anio: string
): Promise<void> {
    const snap = await getDoc(contadorRef);
    if (!snap.exists()) return;

    const data = snap.data();
    if (String(data.anio || anio) !== anio) return;

    const huecos = normalizeHuecos(data.huecos);
    if (huecos.length === 0) return;

    const certs = huecos.map((n) => formatConsecutivo(prefijo, n, anio));
    const conHoja = await certificadosConHoja(certs);
    const validos = huecos.filter((n) => {
        const cert = formatConsecutivo(prefijo, n, anio).replace(/\s+/g, "").toUpperCase();
        return !conHoja.has(cert);
    });

    if (validos.length !== huecos.length) {
        await updateDoc(contadorRef, { huecos: validos });
    }
}

export async function generarConsecutivo(
    magnitud: string,
    anio: string,
    usuario: string
): Promise<string> {
    const prefijo = getPrefijo(magnitud);
    const contadorRef = doc(db, "contadores", prefijo);
    let consecutivoFinal = "";

    await limpiarHuecosInvalidosEnContador(contadorRef, prefijo, anio);

    await runTransaction(db, async (transaction) => {
        const contadorDoc = await transaction.get(contadorRef);
        let nuevo = 1;
        let esReciclado = false;

        if (!contadorDoc.exists()) {
            transaction.set(contadorRef, { valor: 1, anio: anio, huecos: [] });
        } else {
            const data = contadorDoc.data();
            let huecos = normalizeHuecos(data.huecos);
            const anioRegistrado = data.anio || "25";

            if (anioRegistrado === anio && huecos.length > 0) {
                huecos.sort((a, b) => a - b);
                nuevo = huecos[0];
                esReciclado = true;
                transaction.update(contadorRef, { huecos: huecos.slice(1) });
            } else {
                const ultimoValor = data.valor || 0;

                if (anioRegistrado !== anio) {
                    nuevo = 1;
                    transaction.update(contadorRef, { valor: 1, anio: anio, huecos: [] });
                } else {
                    nuevo = ultimoValor + 1;
                    transaction.update(contadorRef, { valor: nuevo, anio: anio });
                }
            }
        }

        const consecutivoStr = formatConsecutivo(prefijo, nuevo, anio);
        consecutivoFinal = consecutivoStr;

        const nuevoDocHistorial = doc(collection(db, "consecutivos"));
        transaction.set(nuevoDocHistorial, {
            consecutivo: consecutivoStr,
            usuario,
            magnitud,
            prefijo,
            fecha: Timestamp.now(),
            fechaCreacion: Timestamp.now(),
            esReciclado,
            worksheetConfirmado: false,
        });
    });

    return consecutivoFinal;
}

export async function confirmarWorksheet(
    consecutivo: string,
    magnitud?: string
): Promise<void> {
    const cert = consecutivo.replace(/\s+/g, "").toUpperCase();

    const queries = magnitud
        ? [
              query(
                  collection(db, "consecutivos"),
                  where("consecutivo", "==", cert),
                  where("magnitud", "==", magnitud)
              ),
              query(collection(db, "consecutivos"), where("consecutivo", "==", cert)),
          ]
        : [query(collection(db, "consecutivos"), where("consecutivo", "==", cert))];

    for (const q of queries) {
        const snap = await getDocs(q);
        if (snap.empty) continue;
        for (const docSnap of snap.docs) {
            await updateDoc(docSnap.ref, { worksheetConfirmado: true });
        }
        return;
    }
}

export async function auditarHuerfanos(
    magnitud: string,
    anio: string,
    toleranciaMinutos: number = 10
): Promise<string[]> {
    const prefijo = getPrefijo(magnitud);
    const limiteMs = toleranciaMinutos * 60 * 1000;
    const ahora = Date.now();
    const limpiados: string[] = [];

    const q = query(
        collection(db, "consecutivos"),
        where("magnitud", "==", magnitud),
        where("worksheetConfirmado", "==", false)
    );

    const snap = await getDocs(q);

    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const fechaCreacion: Timestamp = data.fechaCreacion;

        if (!fechaCreacion) continue;
        const edadMs = ahora - fechaCreacion.toMillis();
        if (edadMs < limiteMs) continue;

        const consecutivoStr: string = data.consecutivo;
        const parsed = parseConsecutivo(consecutivoStr);
        if (!parsed) continue;

        const { numero, anio: anioDelDoc } = parsed;

        if (await hojaTrabajoExiste(consecutivoStr)) {
            await confirmarWorksheet(consecutivoStr, magnitud);
            await deleteDoc(docSnap.ref);
            continue;
        }

        const contadorRef = doc(db, "contadores", prefijo);
        const contadorSnap = await getDoc(contadorRef);

        if (contadorSnap.exists()) {
            const contadorData = contadorSnap.data();
            const anioEnContador = contadorData.anio || "25";

            if (anioEnContador === anioDelDoc && anioDelDoc === anio) {
                const valorActual: number = contadorData.valor || 0;
                const huecosActuales = normalizeHuecos(contadorData.huecos);

                if (valorActual === numero) {
                    await updateDoc(contadorRef, { valor: increment(-1) });
                } else if (!huecosActuales.includes(numero)) {
                    await updateDoc(contadorRef, { huecos: arrayUnion(numero) });
                }
            }
        }

        await deleteDoc(docSnap.ref);
        limpiados.push(consecutivoStr);
    }

    return limpiados;
}
