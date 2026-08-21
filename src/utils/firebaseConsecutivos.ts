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
import { getPrefijo, getMagnitudFromPrefijo } from "./prefijos";
import { extractMagnitudFromConsecutivo } from "./magnitudWorksheet";
export type { ConsecutivoPartes } from "./consecutivosLogic";
export {
    consecutivoDocId,
    normalizeHuecos,
    parseConsecutivo,
    formatConsecutivo,
    normalizeCertificado,
    variantesCertificado,
    pickLowestHueco,
} from "./consecutivosLogic";
import {
    consecutivoDocId,
    normalizeHuecos,
    parseConsecutivo,
    formatConsecutivo,
    normalizeCertificado,
    variantesCertificado,
} from "./consecutivosLogic";

const RECONCILE_COOLDOWN_MS = 30 * 60 * 1000;
/** Huérfanos sin hoja: se pueden reutilizar al generar (evita saltar números). */
export const GRACE_RECLAMAR_HUERFANOS_MIN = 20;

/** Magnitudes posibles para localizar el doc en `consecutivos` (prefijo, hint, alias). */
export function resolveMagnitudesConsecutivo(cert: string, hint?: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (m?: string) => {
        const t = (m || "").trim();
        if (!t || seen.has(t)) return;
        seen.add(t);
        out.push(t);
    };

    add(hint);
    const parsed = parseConsecutivo(cert);
    if (parsed) add(getMagnitudFromPrefijo(parsed.prefijo) ?? undefined);

    const fromCert = extractMagnitudFromConsecutivo(cert);
    add(fromCert);
    if (fromCert === "Presión") add("Presion");
    if (fromCert === "Reporte de Diagnostico") add("Reporte Diagnostico");

    return out;
}

/** ¿Ya hay hoja guardada con este certificado? */
export async function hojaTrabajoExiste(consecutivo: string): Promise<boolean> {
    const variantes = variantesCertificado(consecutivo);
    if (variantes.length === 0) return false;

    // Consultas en paralelo (antes eran secuenciales y sumaban latencia al generar).
    const snaps = await Promise.all(
        variantes.flatMap((variant) => [
            getDocs(
                query(collection(db, "hojasDeTrabajo"), where("certificado", "==", variant), limit(1))
            ),
            getDocs(query(collection(db, "hojasDeTrabajo"), where("folio", "==", variant), limit(1))),
        ])
    );
    return snaps.some((snap) => !snap.empty);
}

function timestampMillis(value: unknown): number {
    if (!value) return 0;
    if (value instanceof Timestamp) return value.toMillis();
    if (typeof value === "object" && value !== null && "toMillis" in value) {
        try {
            return (value as Timestamp).toMillis();
        } catch {
            return 0;
        }
    }
    return 0;
}

/** Última actividad del doc de consecutivo (heartbeat evita reclamar hojas en uso). */
function lastActivoMillis(data: Record<string, unknown>): number {
    return Math.max(
        timestampMillis(data.lastActivo),
        timestampMillis(data.fecha),
        timestampMillis(data.fechaCreacion)
    );
}

/**
 * Marca el consecutivo como en uso (hoja abierta / autosave).
 * Evita que otro técnico lo reclame mientras se está llenando.
 */
export async function tocarConsecutivoActivo(consecutivo: string): Promise<void> {
    const cert = normalizeCertificado(consecutivo);
    if (!cert) return;
    const parsed = parseConsecutivo(cert);
    if (!parsed) return;

    const canonicalRef = doc(
        db,
        "consecutivos",
        consecutivoDocId(parsed.prefijo, parsed.numero, parsed.anio)
    );
    const now = Timestamp.now();

    try {
        const snap = await getDoc(canonicalRef);
        if (snap.exists()) {
            await updateDoc(canonicalRef, { lastActivo: now, fecha: now });
            return;
        }
        const q = query(collection(db, "consecutivos"), where("consecutivo", "==", cert), limit(5));
        const legacy = await getDocs(q);
        await Promise.all(legacy.docs.map((d) => updateDoc(d.ref, { lastActivo: now, fecha: now })));
    } catch (e) {
        console.warn("[Consecutivos] tocarConsecutivoActivo:", e);
    }
}

/** Borra docs legacy con el mismo folio, dejando solo el ID canónico. */
async function purgeDuplicateConsecutivoDocs(cert: string, keepId: string): Promise<void> {
    const snap = await getDocs(
        query(collection(db, "consecutivos"), where("consecutivo", "==", cert))
    );
    await Promise.all(
        snap.docs.filter((d) => d.id !== keepId).map((d) => deleteDoc(d.ref))
    );
}

async function certificadosConHoja(certs: string[]): Promise<Set<string>> {
    const existentes = new Set<string>();
    const unicos = [...new Set(certs.flatMap((c) => variantesCertificado(c)))];
    for (let i = 0; i < unicos.length; i += 30) {
        const chunk = unicos.slice(i, i + 30);
        const snap = await getDocs(
            query(collection(db, "hojasDeTrabajo"), where("certificado", "in", chunk))
        );
        snap.forEach((d) => {
            const c = String(d.data().certificado || "").replace(/\s+/g, "").toUpperCase();
            if (c) existentes.add(c);
        });
        const snapFolio = await getDocs(
            query(collection(db, "hojasDeTrabajo"), where("folio", "in", chunk))
        );
        snapFolio.forEach((d) => {
            const c = String(d.data().folio || d.data().certificado || "")
                .replace(/\s+/g, "")
                .toUpperCase();
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

const MAX_GEN_RETRIES = 8;

async function generarConsecutivoUnaVez(
    magnitud: string,
    anio: string,
    usuario: string
): Promise<{ cert: string; docId: string }> {
    const prefijo = getPrefijo(magnitud);
    const contadorRef = doc(db, "contadores", prefijo);
    let consecutivoFinal = "";
    let historialId = "";

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
        historialId = consecutivoDocId(prefijo, nuevo, anio);
        const now = Timestamp.now();

        // ID canónico: un solo doc por folio (evita duplicados en el historial).
        const historialRef = doc(db, "consecutivos", historialId);
        transaction.set(historialRef, {
            consecutivo: consecutivoStr,
            usuario,
            magnitud,
            prefijo,
            fecha: now,
            fechaCreacion: now,
            lastActivo: now,
            esReciclado,
            worksheetConfirmado: false,
        });
    });

    if (consecutivoFinal && historialId) {
        await purgeDuplicateConsecutivoDocs(consecutivoFinal, historialId);
    }

    return { cert: consecutivoFinal, docId: historialId };
}

/**
 * Auditoría/reconciliación pesada fuera del clic de generar (no bloquea calibración).
 * Corre al abrir la magnitud y en background tras asignar.
 */
function scheduleConsecutivoMaintenance(magnitud: string, anio: string): void {
    void (async () => {
        try {
            await auditarHuerfanos(magnitud, anio, GRACE_RECLAMAR_HUERFANOS_MIN);
            // Sin force: respeta cooldown de 30 min (el escaneo de hojas es lo más caro).
            await reconciliarContadorHuecos(magnitud, anio, false);
        } catch (e) {
            console.warn("[Consecutivos] background maintenance:", e);
        }
    })();
}

export async function generarConsecutivo(
    magnitud: string,
    anio: string,
    usuario: string
): Promise<string> {
    // Ruta rápida: solo asigna. La limpieza de huérfanos/huecos no espera aquí
    // (ya corre al abrir la magnitud + background tras generar).
    for (let intento = 0; intento < MAX_GEN_RETRIES; intento++) {
        const { cert } = await generarConsecutivoUnaVez(magnitud, anio, usuario);
        if (!(await hojaTrabajoExiste(cert))) {
            scheduleConsecutivoMaintenance(magnitud, anio);
            return cert;
        }

        console.warn(`[Consecutivos] ${cert} ya tiene hoja; confirmando y reasignando`);
        await confirmarWorksheet(cert, magnitud);
        await reconciliarContadorHuecos(magnitud, anio, true);
    }

    throw new Error("No se pudo asignar un consecutivo disponible. Intenta de nuevo.");
}

export async function confirmarWorksheet(
    consecutivo: string,
    magnitud?: string
): Promise<boolean> {
    const cert = normalizeCertificado(consecutivo);
    if (!cert) return false;

    const parsed = parseConsecutivo(cert);
    if (parsed) {
        const canonicalRef = doc(
            db,
            "consecutivos",
            consecutivoDocId(parsed.prefijo, parsed.numero, parsed.anio)
        );
        try {
            const canonical = await getDoc(canonicalRef);
            if (canonical.exists()) {
                await updateDoc(canonicalRef, { worksheetConfirmado: true });
                await purgeDuplicateConsecutivoDocs(cert, canonicalRef.id);
                return true;
            }
        } catch (e) {
            console.warn("[Consecutivos] confirmar canonical:", e);
        }
    }

    const magnitudes = resolveMagnitudesConsecutivo(cert, magnitud);
    for (const mag of magnitudes) {
        const snap = await getDocs(
            query(
                collection(db, "consecutivos"),
                where("consecutivo", "==", cert),
                where("magnitud", "==", mag)
            )
        );
        if (snap.empty) continue;
        await Promise.all(
            snap.docs.map((docSnap) =>
                updateDoc(docSnap.ref, { worksheetConfirmado: true })
            )
        );
        return true;
    }

    const snap = await getDocs(
        query(collection(db, "consecutivos"), where("consecutivo", "==", cert))
    );
    if (snap.empty) return false;

    await Promise.all(
        snap.docs.map((docSnap) => updateDoc(docSnap.ref, { worksheetConfirmado: true }))
    );
    return true;
}

/**
 * Reconcilia en segundo plano todos los contadores del año que aún tienen huecos.
 */
export async function reconciliarContadoresConHuecos(anio?: string): Promise<number> {
    const year = anio || new Date().getFullYear().toString().slice(-2);
    const snap = await getDocs(collection(db, "contadores"));
    let reconciliados = 0;

    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (String(data.anio || year) !== year) continue;

        const huecos = normalizeHuecos(data.huecos);
        if (huecos.length === 0) continue;

        const magnitud = getMagnitudFromPrefijo(docSnap.id);
        if (!magnitud) continue;

        const r = await reconciliarContadorHuecos(magnitud, year, true);
        if (r) reconciliados++;
    }

    return reconciliados;
}

export async function auditarHuerfanos(
    magnitud: string,
    anio: string,
    toleranciaMinutos: number = GRACE_RECLAMAR_HUERFANOS_MIN
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
        const edadMs = ahora - lastActivoMillis(data as Record<string, unknown>);
        if (edadMs < limiteMs) continue;

        const consecutivoStr: string = data.consecutivo;
        const parsed = parseConsecutivo(consecutivoStr);
        if (!parsed) continue;

        const { numero, anio: anioDelDoc } = parsed;

        if (await hojaTrabajoExiste(consecutivoStr)) {
            await confirmarWorksheet(consecutivoStr, magnitud);
            const canonicalId = consecutivoDocId(parsed.prefijo, numero, parsed.anio);
            // Solo borra copias legacy si ya quedó el canónico confirmado.
            if (docSnap.id !== canonicalId) {
                const canonicalSnap = await getDoc(doc(db, "consecutivos", canonicalId));
                if (canonicalSnap.exists()) {
                    await deleteDoc(docSnap.ref);
                }
            }
            continue;
        }

        const contadorRef = doc(db, "contadores", prefijo);
        const contadorSnap = await getDoc(contadorRef);

        if (contadorSnap.exists()) {
            const contadorData = contadorSnap.data();
            const anioEnContador = contadorData.anio || "25";

            if (anioEnContador === anioDelDoc && anioDelDoc === anio) {
                if (await hojaTrabajoExiste(consecutivoStr)) {
                    await confirmarWorksheet(consecutivoStr, magnitud);
                    continue;
                }

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
