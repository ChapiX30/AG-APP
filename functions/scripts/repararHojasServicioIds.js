/**
 * Repara IDs de hojas de trabajo en sitio que no quedaron en su hoja de servicio.
 *
 * Uso (desde /functions):
 *   node scripts/repararHojasServicioIds.js           # diagnóstico
 *   node scripts/repararHojasServicioIds.js --apply    # escribe Firestore
 */
const path = require("path");
const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const SINCE = process.argv.find((a) => a.startsWith("--since="))?.slice(8) || "2026-07-01";
const PROJECT_ID = "agg1-b7f40";

const saPath = path.join(__dirname, "..", "service-account.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(saPath)),
    projectId: PROJECT_ID,
  });
}
const db = admin.firestore();

const LEGAL_SUFFIX_RE =
  /\b(?:s\.?\s*a\.?\s*(?:de\s*)?c\.?\s*v\.?|s\.?\s*de\s*r\.?\s*l\.?(?:\s*de\s*c\.?\s*v\.?)?|s\.?a\.?s\.?|inc\.?)\b/gi;

function normalizeClienteKey(nombre) {
  return String(nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function canonicalizeClienteNombre(nombre) {
  return normalizeClienteKey(nombre)
    .replace(LEGAL_SUFFIX_RE, " ")
    .replace(/[.,;()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nombresEquivalentes(a, b) {
  const ka = canonicalizeClienteNombre(a);
  const kb = canonicalizeClienteNombre(b);
  return Boolean(ka && kb && ka === kb);
}

function hojaPerteneceAEmpresa(row, empresaNombre, empresaId, catalogo) {
  const rowClienteId = String(row.clienteId || "").trim();
  const serviceClienteId = String(empresaId || "").trim();
  if (rowClienteId && serviceClienteId && rowClienteId === serviceClienteId) return true;
  if (nombresEquivalentes(row.cliente, empresaNombre)) return true;

  const rowKey = canonicalizeClienteNombre(row.cliente);
  if (!rowKey || rowKey.length < 5) return false;

  const hits = catalogo.filter((emp) => {
    const empKey = canonicalizeClienteNombre(emp.nombre);
    if (!empKey) return false;
    if (empKey === rowKey) return true;
    const shorter = rowKey.length <= empKey.length ? rowKey : empKey;
    const longer = rowKey.length <= empKey.length ? empKey : rowKey;
    return shorter.length >= 6 && longer.includes(shorter);
  });
  if (hits.length !== 1) return false;
  if (serviceClienteId && hits[0].id === serviceClienteId) return true;
  return nombresEquivalentes(hits[0].nombre, empresaNombre);
}

function esCalibracionSitio(data) {
  const lugar = String(data.lugarCalibracion || "").toLowerCase();
  const ubicacion = String(data.ubicacion_real || "").toLowerCase();
  return lugar.includes("sitio") || ubicacion.includes("sitio");
}

function splitEquipoIds(raw) {
  return String(raw || "")
    .split(/[,;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEquipoIdKey(id) {
  const s = String(id || "")
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, "");
  const m = s.match(/^([A-Z]+)[-_]?0*([0-9]+)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}

function isHsdg(folio) {
  return /^HSDG[-.]?\d+/i.test(String(folio || "").trim());
}

function dateKey(raw) {
  return String(raw || "").trim().slice(0, 10);
}

function idsEnHojaServicio(equiposCalibrados) {
  const keys = new Set();
  const groups = equiposCalibrados && typeof equiposCalibrados === "object" ? equiposCalibrados : {};
  for (const lista of Object.values(groups)) {
    if (!Array.isArray(lista)) continue;
    for (const eq of lista) {
      for (const id of splitEquipoIds(eq && eq.id)) {
        const key = normalizeEquipoIdKey(id);
        if (key) keys.add(key);
      }
    }
  }
  return keys;
}

function estadoDeHoja(data) {
  const cert = String(data.certificado || "").toUpperCase();
  return cert.includes("AGRD-") ? "RECHAZADO" : "CALIBRADO";
}

function tecnicoDeHoja(data) {
  return String(data.tecnicoResponsable || data.tecnico || data.nombre || "Sin Técnico").trim() || "Sin Técnico";
}

async function fetchAll(colName) {
  const snap = await db.collection(colName).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function main() {
  console.log(APPLY ? "MODO: APPLY (escribe Firestore)" : "MODO: diagnóstico (sin escribir)");
  console.log("Desde fecha:", SINCE);

  const [clientes, serviciosRaw, hojasRaw] = await Promise.all([
    fetchAll("clientes"),
    fetchAll("hojasDeServicio"),
    fetchAll("hojasDeTrabajo"),
  ]);

  const catalogo = clientes.map((c) => ({ id: c.id, nombre: c.nombre || c.razonSocial || "" }));

  const servicios = serviciosRaw
    .filter((s) => isHsdg(s.folio || s.id) && dateKey(s.fecha) >= SINCE)
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.folio || "").localeCompare(String(a.folio || "")));

  const hojasSitio = hojasRaw.filter((h) => esCalibracionSitio(h) && (dateKey(h.fecha) >= SINCE || dateKey(h.fecha_calib) >= SINCE));

  console.log(`Clientes: ${catalogo.length}`);
  console.log(`Hojas de servicio desde ${SINCE}: ${servicios.length}`);
  console.log(`Hojas de trabajo en sitio desde ${SINCE}: ${hojasSitio.length}`);

  const servicioPorFolio = new Map();
  for (const s of servicios) {
    const folio = String(s.folio || s.id);
    servicioPorFolio.set(folio.toUpperCase(), s);
  }

  const cambios = []; // { folio, empresa, fecha, add, tagDocs }

  function resolverServicio(hoja) {
    const folio = String(hoja.folio || "");
    if (isHsdg(folio)) {
      const hit = servicioPorFolio.get(folio.toUpperCase());
      if (hit) return hit;
    }
    const fecha = dateKey(hoja.fecha) || dateKey(hoja.fecha_calib);
    const candidatos = servicios.filter(
      (s) =>
        dateKey(s.fecha) === fecha &&
        hojaPerteneceAEmpresa(hoja, s.empresa || "", s.empresaId, catalogo)
    );
    if (candidatos.length === 1) return candidatos[0];
    if (candidatos.length > 1) {
      const idsHoja = splitEquipoIds(hoja.id).map(normalizeEquipoIdKey);
      const conOverlap = candidatos.filter((s) => {
        const ya = idsEnHojaServicio(s.equiposCalibrados);
        return idsHoja.some((id) => ya.has(id));
      });
      if (conOverlap.length === 1) return conOverlap[0];
      return [...candidatos].sort((a, b) => {
        const na = idsEnHojaServicio(a.equiposCalibrados).size;
        const nb = idsEnHojaServicio(b.equiposCalibrados).size;
        return nb - na;
      })[0];
    }
    return null;
  }

  const porFolio = new Map();
  const sinServicio = [];

  for (const hoja of hojasSitio) {
    const ids = splitEquipoIds(hoja.id);
    if (ids.length === 0) continue;
    const servicio = resolverServicio(hoja);
    if (!servicio) {
      sinServicio.push({
        docId: hoja.id,
        equipoId: ids.join(", "),
        cliente: hoja.cliente || "",
        fecha: dateKey(hoja.fecha) || dateKey(hoja.fecha_calib),
        folioActual: hoja.folio || "",
      });
      continue;
    }
    const folio = String(servicio.folio || servicio.id);
    if (!porFolio.has(folio)) {
      porFolio.set(folio, {
        servicio,
        missing: [],
        already: 0,
        tagDocs: [],
      });
    }
    const bucket = porFolio.get(folio);
    const ya = idsEnHojaServicio(servicio.equiposCalibrados);
    const missingIds = ids.filter((raw) => !ya.has(normalizeEquipoIdKey(raw)));
    const needsTag = !isHsdg(hoja.folio) || String(hoja.folio).toUpperCase() !== folio.toUpperCase() || hoja.servicioVinculado !== true;

    if (missingIds.length === 0) {
      bucket.already += ids.length;
      if (needsTag) bucket.tagDocs.push(hoja);
      continue;
    }

    bucket.missing.push({
      hoja,
      missingIds,
      needsTag,
    });
    if (needsTag) bucket.tagDocs.push(hoja);
  }

  let totalMissingIds = 0;
  let hojasConFaltantes = 0;
  const reporte = [];

  for (const [folio, bucket] of porFolio) {
    if (bucket.missing.length === 0 && bucket.tagDocs.length === 0) continue;
    const s = bucket.servicio;
    const actuales = idsEnHojaServicio(s.equiposCalibrados).size;
    const nuevos = [];
    const equipos = { ...(s.equiposCalibrados && typeof s.equiposCalibrados === "object" ? s.equiposCalibrados : {}) };
    for (const key of Object.keys(equipos)) {
      equipos[key] = Array.isArray(equipos[key]) ? [...equipos[key]] : [];
    }

    const seen = idsEnHojaServicio(equipos);
    for (const item of bucket.missing) {
      const tecnico = tecnicoDeHoja(item.hoja);
      if (!equipos[tecnico]) equipos[tecnico] = [];
      const estado = estadoDeHoja(item.hoja);
      for (const raw of item.missingIds) {
        const key = normalizeEquipoIdKey(raw);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        equipos[tecnico].push({
          id: String(raw).trim().toUpperCase(),
          docId: item.hoja.id,
          estado,
        });
        nuevos.push(String(raw).trim().toUpperCase());
      }
    }

    totalMissingIds += nuevos.length;
    if (nuevos.length) hojasConFaltantes += 1;

    reporte.push({
      folio,
      empresa: s.empresa || "",
      fecha: dateKey(s.fecha),
      enHoja: actuales,
      aAgregar: nuevos.length,
      ids: nuevos.sort(),
      tagDocs: [...new Set(bucket.tagDocs.map((h) => h.id))].length,
      equipos,
      tagDocIds: [...new Set(bucket.tagDocs.map((h) => h.id))],
    });
  }

  reporte.sort((a, b) => b.aAgregar - a.aAgregar || String(b.fecha).localeCompare(String(a.fecha)));

  console.log("\n=== Hojas de servicio con IDs faltantes ===");
  for (const r of reporte.filter((x) => x.aAgregar > 0)) {
    console.log(
      `\n${r.folio}  ${r.fecha}  ${r.empresa}\n  ya tenía ${r.enHoja} IDs → +${r.aAgregar}  (etiquetar ${r.tagDocs} docs)\n  ${r.ids.join(", ")}`
    );
  }

  const soloTag = reporte.filter((x) => x.aAgregar === 0 && x.tagDocs > 0);
  if (soloTag.length) {
    console.log("\n=== Ya estaban en la hoja, pero sin folio HSDG ===");
    for (const r of soloTag) {
      console.log(`${r.folio}  ${r.fecha}  ${r.empresa}  docs a etiquetar: ${r.tagDocs}`);
    }
  }

  if (sinServicio.length) {
    console.log(`\n=== Sitio sin hoja de servicio del día (${sinServicio.length}) ===`);
    const preview = sinServicio.slice(0, 40);
    for (const h of preview) {
      console.log(`  ${h.fecha} | ${h.cliente} | ${h.equipoId} | folio=${h.folioActual || "-"}`);
    }
    if (sinServicio.length > 40) console.log(`  … y ${sinServicio.length - 40} más`);
  }

  console.log("\nResumen:");
  console.log(`  Hojas de servicio a completar: ${hojasConFaltantes}`);
  console.log(`  IDs a meter: ${totalMissingIds}`);
  console.log(`  Docs a etiquetar con HSDG: ${reporte.reduce((n, r) => n + r.tagDocs, 0)}`);
  console.log(`  Sitio sin servicio del día: ${sinServicio.length}`);

  if (!APPLY) {
    console.log("\nSin cambios. Corre con --apply para escribir.");
    return;
  }

  let writes = 0;
  for (const r of reporte) {
    if (r.aAgregar > 0) {
      await db.collection("hojasDeServicio").doc(r.folio).update({
        equiposCalibrados: r.equipos,
        fechaModificacion: admin.firestore.Timestamp.now(),
      });
      writes += 1;
      const metaRef = db.collection("folderMetadata").doc(r.folio);
      const meta = await metaRef.get();
      if (meta.exists) {
        const total = Object.values(r.equipos).reduce((n, lista) => n + (Array.isArray(lista) ? lista.length : 0), 0);
        await metaRef.update({ expectedFiles: total });
      }
    }
    const uniqueDocIds = r.tagDocIds;
    for (let i = 0; i < uniqueDocIds.length; i += 400) {
      const chunk = uniqueDocIds.slice(i, i + 400);
      const batch = db.batch();
      for (const docId of chunk) {
        batch.update(db.collection("hojasDeTrabajo").doc(docId), {
          folio: r.folio,
          servicioVinculado: true,
        });
      }
      await batch.commit();
      writes += chunk.length;
    }
  }

  console.log(`\nListo. Escrituras aproximadas: ${writes}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
