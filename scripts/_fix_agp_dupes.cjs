/**
 * Reasigna PDFs AGP duplicados a huecos libres (usa token de Firebase CLI).
 * node scripts/_fix_agp_dupes.cjs
 * node scripts/_fix_agp_dupes.cjs --apply
 */
const fs = require("fs");
const os = require("os");
const https = require("https");
const path = require("path");

const PROJECT = "agg1-b7f40";
const BUCKET = "agg1-b7f40.firebasestorage.app";
const APPLY = process.argv.includes("--apply");

const ASSIGNMENTS = [
  {
    keepCert: "AGP-1403-26",
    keepId: "EP-23226",
    moveId: "EP-45996",
    oldPdfName: "AGP-1403-26_EP-45996.pdf",
    newCert: "AGP-0711-26",
    hueco: 711,
    equipo: "Manometro Digital",
    marca: "SMC",
    modelo: "0.5 mPa",
    numeroSerie: "N/A",
  },
  {
    keepCert: "AGP-1408-26",
    keepId: "EP-55669",
    moveId: "EP-46003",
    oldPdfName: "AGP-1408-26_EP-46003.pdf",
    newCert: "AGP-0699-26",
    hueco: 699,
    equipo: "Manometro Digital",
    marca: "SMC",
    modelo: "-70-90 kPa",
    numeroSerie: "N/A",
  },
];

function loadCliToken() {
  const cfgPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const tokens = cfg.tokens || {};
  if (!tokens.access_token) throw new Error("No hay access_token de Firebase CLI");
  if (tokens.expires_at && Date.now() > tokens.expires_at - 60 * 1000) {
    throw new Error("Token vencido. Corre firebase login --reauth");
  }
  return tokens.access_token;
}

function requestJson(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          ...(payload ? { "Content-Type": "application/json" } : {}),
          "Content-Length": payload ? Buffer.byteLength(payload) : 0,
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = raw;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            /* keep raw */
          }
          if (res.statusCode >= 400) {
            const err = new Error(`${method} ${u.pathname} -> ${res.statusCode}`);
            err.status = res.statusCode;
            err.body = parsed;
            reject(err);
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function fsDocUrl(docPath) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`;
}

function fsRunQueryUrl() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
}

function fromFsValue(v) {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ("mapValue" in v) {
    const out = {};
    const fields = v.mapValue.fields || {};
    for (const [k, val] of Object.entries(fields)) out[k] = fromFsValue(val);
    return out;
  }
  return v;
}

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      fields[k] = toFsValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fieldsToObject(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromFsValue(v);
  return out;
}

async function getDoc(token, docPath) {
  try {
    const doc = await requestJson("GET", fsDocUrl(docPath), { headers: authHeaders(token) });
    return { name: doc.name, data: fieldsToObject(doc.fields) };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function queryWhere(token, collection, field, value) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: "EQUAL",
          value: { stringValue: value },
        },
      },
    },
  };
  const rows = await requestJson("POST", fsRunQueryUrl(), {
    headers: authHeaders(token),
    body,
  });
  return (rows || [])
    .filter((r) => r.document)
    .map((r) => ({
      name: r.document.name,
      id: r.document.name.split("/").pop(),
      data: fieldsToObject(r.document.fields),
    }));
}

async function patchDoc(token, docPath, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toFsValue(v);
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  return requestJson("PATCH", `${fsDocUrl(docPath)}?${mask}`, {
    headers: authHeaders(token),
    body: { fields },
  });
}

async function createDoc(token, collection, data, docId) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    fields[k] = toFsValue(v);
  }
  const url = docId
    ? `${fsDocUrl(collection)}?documentId=${encodeURIComponent(docId)}`
    : fsDocUrl(collection);
  return requestJson("POST", url, {
    headers: authHeaders(token),
    body: { fields },
  });
}

async function deleteDoc(token, docPath) {
  return requestJson("DELETE", fsDocUrl(docPath), { headers: authHeaders(token) });
}

function encodeObjectName(name) {
  return encodeURIComponent(name);
}

async function copyStorageObject(token, src, dest) {
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeObjectName(
    src
  )}/copyTo/b/${BUCKET}/o/${encodeObjectName(dest)}`;
  return requestJson("POST", url, { headers: authHeaders(token) });
}

async function getStorageObject(token, objectName) {
  try {
    return await requestJson(
      "GET",
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeObjectName(objectName)}`,
      { headers: authHeaders(token) }
    );
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function deleteStorageObject(token, objectName) {
  return requestJson(
    "DELETE",
    `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeObjectName(objectName)}`,
    { headers: authHeaders(token) }
  );
}

function makeDownloadUrl(objectName, tokenId) {
  const encoded = encodeURIComponent(objectName);
  if (tokenId) {
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media&token=${tokenId}`;
  }
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media`;
}

function metaDocId(filePath) {
  return filePath.replace(/\//g, "_");
}

function sanitizeHoja(t) {
  const skip = new Set(["fotoEquipoBase64", "idBlocked", "idErrorMessage", "permitirExcepcion"]);
  const out = {};
  for (const [k, v] of Object.entries(t || {})) {
    if (skip.has(k) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

async function main() {
  console.log(APPLY ? "MODO: APPLY" : "MODO: inspect");
  const token = loadCliToken();

  const contador = await getDoc(token, "contadores/AGP");
  console.log("contador AGP:", JSON.stringify(contador && contador.data, null, 2));

  for (const a of ASSIGNMENTS) {
    console.log(`\n===== ${a.keepCert} / mover ${a.moveId} -> ${a.newCert} =====`);
    const hojasKeep = await queryWhere(token, "hojasDeTrabajo", "certificado", a.keepCert);
    console.log(
      "hojas keepCert:",
      hojasKeep.map((h) => ({ id: h.id, eq: h.data.id, equipo: h.data.equipo, fecha: h.data.fecha }))
    );
    const files = await queryWhere(token, "fileMetadata", "name", a.oldPdfName);
    console.log(
      "fileMetadata:",
      files.map((f) => ({
        id: f.id,
        filePath: f.data.filePath,
        uploadedBy: f.data.uploadedBy,
        completed: f.data.completed,
      }))
    );
    const newExists = await queryWhere(token, "hojasDeTrabajo", "certificado", a.newCert);
    console.log("newCert used?", newExists.map((h) => h.data.id));
    for (const f of files) {
      const obj = await getStorageObject(token, f.data.filePath);
      console.log("storage exists:", Boolean(obj), f.data.filePath, obj && obj.size);
    }
  }

  if (!APPLY) {
    console.log("\nSin cambios. Corre con --apply para reasignar.");
    return;
  }

  for (const a of ASSIGNMENTS) {
    const keepHojas = await queryWhere(token, "hojasDeTrabajo", "certificado", a.keepCert);
    const template =
      keepHojas.find((h) => String(h.data.id || "").toUpperCase() === a.keepId) || keepHojas[0];
    if (!template) throw new Error(`No hay hoja plantilla para ${a.keepCert}`);

    const files = await queryWhere(token, "fileMetadata", "name", a.oldPdfName);
    if (!files.length) throw new Error(`No está en Drive: ${a.oldPdfName}`);
    const file = files[0];
    const oldPath = String(file.data.filePath || "");
    if (!oldPath) throw new Error(`filePath vacío para ${a.oldPdfName}`);

    const folder = oldPath.split("/").slice(0, -1).join("/");
    const newPdfName = `${a.newCert}_${a.moveId}.pdf`;
    const newPath = `${folder}/${newPdfName}`;

    const already = await queryWhere(token, "hojasDeTrabajo", "certificado", a.newCert);
    if (already.length) throw new Error(`${a.newCert} ya tiene hoja (${already[0].data.id})`);

    console.log(`\nAPPLY ${a.moveId}: ${oldPath} -> ${newPath}`);
    const copied = await copyStorageObject(token, oldPath, newPath);
    console.log("  storage copy OK", copied.size);
    const newObj = await getStorageObject(token, newPath);
    const downloadToken =
      (newObj && newObj.metadata && newObj.metadata.firebaseStorageDownloadTokens) ||
      (copied.metadata && copied.metadata.firebaseStorageDownloadTokens) ||
      "";
    const pdfURL = makeDownloadUrl(newPath, downloadToken);

    const t = sanitizeHoja(template.data);
    const nowIso = new Date().toISOString();
    const hoja = {
      cliente: t.cliente || "",
      clienteId: t.clienteId || "",
      nombre: t.nombre || t.tecnico || "",
      tecnico: t.tecnico || t.nombre || "",
      tecnicoResponsable: t.tecnicoResponsable || t.nombre || "",
      fecha: t.fecha || "",
      fechaRecepcion: t.fechaRecepcion || t.fecha || "",
      fecha_calib: t.fecha_calib || t.fecha || "",
      lugarCalibracion: t.lugarCalibracion || "laboratorio",
      frecuenciaCalibracion: t.frecuenciaCalibracion || "12 meses",
      magnitud: t.magnitud || "Presion",
      unidad: t.unidad || [],
      condicionEquipo: t.condicionEquipo || "buenas",
      status: t.status || "completed",
      cargado_drive: "Si",
      certificado: a.newCert,
      folio: a.newCert,
      id: a.moveId,
      equipo: a.equipo,
      marca: a.marca,
      modelo: a.modelo,
      numeroSerie: a.numeroSerie,
      serie: a.numeroSerie,
      pdfURL,
      createdAt: nowIso,
      lastUpdated: nowIso,
      _agpDupeReassignedFrom: a.keepCert,
      _agpDupeReassignedAt: nowIso,
    };

    const created = await createDoc(token, "hojasDeTrabajo", hoja);
    console.log("  hoja creada", created.name.split("/").pop());

    const newMeta = {
      ...file.data,
      name: newPdfName,
      filePath: newPath,
      updated: nowIso,
      keywords: [a.newCert, a.moveId, a.equipo, String(t.cliente || "")].filter(Boolean),
    };
    await patchDoc(token, `fileMetadata/${metaDocId(newPath)}`, newMeta);
    await deleteDoc(token, `fileMetadata/${file.id}`);
    await deleteStorageObject(token, oldPath);
    console.log("  drive renombrado");

    await createDoc(
      token,
      "consecutivos",
      {
        consecutivo: a.newCert,
        usuario: String(t.nombre || t.tecnico || "Reasignacion hueco"),
        magnitud: "Presion",
        prefijo: "AGP",
        fecha: nowIso,
        fechaCreacion: nowIso,
        lastActivo: nowIso,
        esReciclado: true,
        worksheetConfirmado: true,
      },
      `AGP_26_${String(a.hueco).padStart(4, "0")}`
    );
    console.log("  consecutivo", a.newCert);
  }

  const cSnap = await getDoc(token, "contadores/AGP");
  const huecosRaw = cSnap && cSnap.data && cSnap.data.huecos;
  const huecos = Array.isArray(huecosRaw)
    ? huecosRaw.map(Number)
    : Object.values(huecosRaw || {}).map(Number);
  const used = new Set(ASSIGNMENTS.map((a) => a.hueco));
  await patchDoc(token, "contadores/AGP", { huecos: huecos.filter((n) => !used.has(n)) });
  console.log("\nListo.");
}

main().catch((e) => {
  console.error("FAIL", e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2).slice(0, 2500));
  process.exit(1);
});
