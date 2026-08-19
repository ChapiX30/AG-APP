/**
 * Mete en hojas de servicio ya guardadas los IDs de sitio que se habían quedado fuera
 * (nombre de cliente distinto, listados grandes, folio no etiquetado).
 * Se ejecuta una vez por versión con el usuario autenticado.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { writeDriveFileMetadata } from "./driveFileMetadata";
import {
  esCalibracionSitio,
  hojaPerteneceAEmpresa,
  normalizeEquipoIdKey,
  splitEquipoIds,
  type EmpresaCatalogo,
} from "./hojaServicioMatch";

export const HSDG_REPAIR_KEY = "hsdg_id_repair_v2";

export type EquipoServicio = {
  id: string;
  docId: string;
  estado: "CALIBRADO" | "RECHAZADO";
};

export type RepairHojaServicioResult = {
  folio: string;
  empresa: string;
  fecha: string;
  added: number;
  tagged: number;
  ids: string[];
};

export type RepairHojasServicioResult = {
  skipped: boolean;
  sheets: RepairHojaServicioResult[];
  addedIds: number;
  taggedDocs: number;
};

type HojaRow = Record<string, unknown> & { _docId: string };
type ServicioRow = Record<string, unknown> & { _docId: string };

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKey(raw: unknown): string {
  return String(raw || "").trim().slice(0, 10);
}

function isHsdg(folio: unknown): boolean {
  return /^HSDG[-.]?\d+/i.test(String(folio || "").trim());
}

function idsEnHojaServicio(equiposCalibrados: unknown): Set<string> {
  const keys = new Set<string>();
  const groups = equiposCalibrados && typeof equiposCalibrados === "object" ? equiposCalibrados as Record<string, unknown> : {};
  for (const lista of Object.values(groups)) {
    if (!Array.isArray(lista)) continue;
    for (const eq of lista) {
      const raw = eq && typeof eq === "object" ? (eq as { id?: string }).id : "";
      for (const id of splitEquipoIds(raw)) {
        const key = normalizeEquipoIdKey(id);
        if (key) keys.add(key);
      }
    }
  }
  return keys;
}

function cloneEquipos(equiposCalibrados: unknown): Record<string, EquipoServicio[]> {
  const out: Record<string, EquipoServicio[]> = {};
  const groups = equiposCalibrados && typeof equiposCalibrados === "object" ? equiposCalibrados as Record<string, unknown> : {};
  for (const [tecnico, lista] of Object.entries(groups)) {
    if (!Array.isArray(lista)) continue;
    out[tecnico] = lista.map((eq) => ({
      id: String((eq as EquipoServicio)?.id || ""),
      docId: String((eq as EquipoServicio)?.docId || ""),
      estado: (eq as EquipoServicio)?.estado === "RECHAZADO" ? "RECHAZADO" : "CALIBRADO",
    }));
  }
  return out;
}

function tecnicoDeHoja(data: Record<string, unknown>): string {
  return String(data.tecnicoResponsable || data.tecnico || data.nombre || "Sin Técnico").trim() || "Sin Técnico";
}

function estadoDeHoja(data: Record<string, unknown>): "CALIBRADO" | "RECHAZADO" {
  return String(data.certificado || "").toUpperCase().includes("AGRD-") ? "RECHAZADO" : "CALIBRADO";
}

async function fetchDocs(q: ReturnType<typeof query>): Promise<HojaRow[]> {
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

function resolverServicio(
  hoja: HojaRow,
  servicios: ServicioRow[],
  servicioPorFolio: Map<string, ServicioRow>,
  catalogo: EmpresaCatalogo[]
): ServicioRow | null {
  const folio = String(hoja.folio || "");
  if (isHsdg(folio)) {
    const hit = servicioPorFolio.get(folio.toUpperCase());
    if (hit) return hit;
  }
  const fecha = dateKey(hoja.fecha) || dateKey(hoja.fecha_calib);
  const candidatos = servicios.filter(
    (s) =>
      dateKey(s.fecha) === fecha &&
      hojaPerteneceAEmpresa(hoja, String(s.empresa || ""), String(s.empresaId || ""), catalogo)
  );
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length > 1) {
    const idsHoja = splitEquipoIds(String(hoja.id || "")).map(normalizeEquipoIdKey);
    const conOverlap = candidatos.filter((s) => {
      const ya = idsEnHojaServicio(s.equiposCalibrados);
      return idsHoja.some((id) => ya.has(id));
    });
    if (conOverlap.length === 1) return conOverlap[0];
    return [...candidatos].sort((a, b) => {
      return idsEnHojaServicio(b.equiposCalibrados).size - idsEnHojaServicio(a.equiposCalibrados).size;
    })[0];
  }
  return null;
}

async function regenerarPdfSiSePuede(
  servicio: ServicioRow,
  equipos: Record<string, EquipoServicio[]>
): Promise<void> {
  const folio = String(servicio.folio || servicio._docId);
  try {
    const mod = await import("../components/HojaDeServicioScreen");
    const generar = (mod as { generarPDFFormal?: Function }).generarPDFFormal;
    if (!generar) return;
    const blob = await generar({
      campos: {
        folio,
        fecha: servicio.fecha,
        empresa: servicio.empresa,
        direccion: servicio.direccion,
        contacto: servicio.contacto,
        telefono: servicio.telefono,
        correo: servicio.correo,
        comentarios: servicio.comentarios,
        calidadServicio: servicio.calidadServicio,
        tecnicoResponsable: servicio.tecnicoResponsable,
      },
      firmaTecnico: servicio.firmaTecnico || "",
      firmaCliente: servicio.firmaCliente || "",
      equiposCalibrados: equipos,
      outputType: "blob",
    });
    if (!blob) return;
    const storagePath = `worksheets/Hojas de Servicio/${folio}.pdf`;
    const storageRef = ref(storage, storagePath);
    const uploadResult = await uploadBytes(storageRef, blob as Blob);
    const downloadURL = await getDownloadURL(uploadResult.ref);
    try {
      await writeDriveFileMetadata(storagePath, uploadResult, String(servicio.tecnicoResponsable || "Sistema"), {
        workDate: dateKey(servicio.fecha),
      });
    } catch {
      /* metadata opcional */
    }
    await updateDoc(doc(db, "hojasDeServicio", folio), { url: downloadURL });
  } catch (err) {
    console.warn(`[repararHojasServicio] No se regeneró PDF de ${folio}:`, err);
  }
}

let inFlight: Promise<RepairHojasServicioResult> | null = null;

export function ensureHojasServicioIdsReparados(): Promise<RepairHojasServicioResult> {
  if (!inFlight) {
    inFlight = repararHojasServicioIds().catch((err) => {
      inFlight = null;
      throw err;
    });
  }
  return inFlight;
}

export async function repararHojasServicioIds(): Promise<RepairHojasServicioResult> {
  const empty: RepairHojasServicioResult = { skipped: true, sheets: [], addedIds: 0, taggedDocs: 0 };
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(HSDG_REPAIR_KEY) === "done") {
      return empty;
    }
  } catch {
    /* ignore */
  }

  const since = daysAgoIso(60);
  const [clientesSnap, servicios] = await Promise.all([
    getDocs(collection(db, "clientes")),
    fetchDocs(query(collection(db, "hojasDeServicio"), where("fecha", ">=", since))),
  ]);

  const catalogo: EmpresaCatalogo[] = clientesSnap.docs.map((d) => {
    const data = d.data() as { nombre?: string; razonSocial?: string };
    return { id: d.id, nombre: data.nombre || data.razonSocial || "" };
  });

  const serviciosHsdg = (servicios as ServicioRow[]).filter((s) => isHsdg(s.folio || s._docId));
  if (serviciosHsdg.length === 0) {
    try {
      localStorage.setItem(HSDG_REPAIR_KEY, "done");
    } catch {
      /* ignore */
    }
    return { skipped: false, sheets: [], addedIds: 0, taggedDocs: 0 };
  }

  const [hojasFecha, hojasCalib] = await Promise.all([
    fetchDocs(query(collection(db, "hojasDeTrabajo"), where("fecha", ">=", since))),
    fetchDocs(query(collection(db, "hojasDeTrabajo"), where("fecha_calib", ">=", since))).catch(() => [] as HojaRow[]),
  ]);
  const hojasById = new Map<string, HojaRow>();
  for (const h of [...hojasFecha, ...hojasCalib]) {
    if (!hojasById.has(h._docId)) hojasById.set(h._docId, h);
  }

  const servicioPorFolio = new Map<string, ServicioRow>();
  for (const s of serviciosHsdg) {
    servicioPorFolio.set(String(s.folio || s._docId).toUpperCase(), s);
  }

  type Bucket = {
    servicio: ServicioRow;
    equipos: Record<string, EquipoServicio[]>;
    seen: Set<string>;
    added: string[];
    tagDocIds: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  const getBucket = (servicio: ServicioRow): Bucket => {
    const folio = String(servicio.folio || servicio._docId);
    let bucket = buckets.get(folio);
    if (!bucket) {
      const equipos = cloneEquipos(servicio.equiposCalibrados);
      bucket = {
        servicio,
        equipos,
        seen: idsEnHojaServicio(equipos),
        added: [],
        tagDocIds: new Set(),
      };
      buckets.set(folio, bucket);
    }
    return bucket;
  };

  for (const hoja of hojasById.values()) {
    if (!esCalibracionSitio(hoja)) continue;
    const ids = splitEquipoIds(String(hoja.id || ""));
    if (ids.length === 0) continue;
    const servicio = resolverServicio(hoja, serviciosHsdg, servicioPorFolio, catalogo);
    if (!servicio) continue;

    const folio = String(servicio.folio || servicio._docId);
    const bucket = getBucket(servicio);
    const needsTag =
      !isHsdg(hoja.folio) ||
      String(hoja.folio).toUpperCase() !== folio.toUpperCase() ||
      hoja.servicioVinculado !== true;

    const tecnico = tecnicoDeHoja(hoja);
    if (!bucket.equipos[tecnico]) bucket.equipos[tecnico] = [];
    const estado = estadoDeHoja(hoja);

    for (const raw of ids) {
      const key = normalizeEquipoIdKey(raw);
      if (!key || bucket.seen.has(key)) continue;
      bucket.seen.add(key);
      bucket.equipos[tecnico].push({
        id: raw.trim().toUpperCase(),
        docId: hoja._docId,
        estado,
      });
      bucket.added.push(raw.trim().toUpperCase());
    }
    if (needsTag) bucket.tagDocIds.add(hoja._docId);
  }

  const sheets: RepairHojaServicioResult[] = [];
  let addedIds = 0;
  let taggedDocs = 0;

  for (const [folio, bucket] of buckets) {
    if (bucket.added.length === 0 && bucket.tagDocIds.size === 0) continue;

    if (bucket.added.length > 0) {
      const payload: Record<string, unknown> = {
        equiposCalibrados: bucket.equipos,
        fechaModificacion: Timestamp.now(),
      };
      await updateDoc(doc(db, "hojasDeServicio", folio), payload);
      const total = Object.values(bucket.equipos).reduce((n, lista) => n + lista.length, 0);
      try {
        await updateDoc(doc(db, "folderMetadata", folio), { expectedFiles: total });
      } catch {
        /* no metadata */
      }
      await regenerarPdfSiSePuede(bucket.servicio, bucket.equipos);
    }

    const docIds = [...bucket.tagDocIds];
    for (let i = 0; i < docIds.length; i += 400) {
      const chunk = docIds.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.update(doc(db, "hojasDeTrabajo", id), {
          folio,
          servicioVinculado: true,
        });
      }
      await batch.commit();
    }

    addedIds += bucket.added.length;
    taggedDocs += docIds.length;
    sheets.push({
      folio,
      empresa: String(bucket.servicio.empresa || ""),
      fecha: dateKey(bucket.servicio.fecha),
      added: bucket.added.length,
      tagged: docIds.length,
      ids: bucket.added.sort(),
    });
  }

  try {
    localStorage.setItem(HSDG_REPAIR_KEY, "done");
  } catch {
    /* ignore */
  }

  return { skipped: false, sheets, addedIds, taggedDocs };
}

export function mensajeReparacionHojasServicio(r: RepairHojasServicioResult): string | null {
  if (r.skipped || (r.addedIds === 0 && r.taggedDocs === 0)) return null;
  if (r.addedIds > 0) {
    const n = r.sheets.filter((s) => s.added > 0).length;
    return `Se metieron ${r.addedIds} ID(s) que faltaban en ${n} hoja(s) de servicio.`;
  }
  return `Se vincularon ${r.taggedDocs} hoja(s) de trabajo a su folio HSDG.`;
}
