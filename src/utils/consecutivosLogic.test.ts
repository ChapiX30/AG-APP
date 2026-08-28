import assert from "node:assert/strict";
import {
  certificadoConflictEquipmentId,
  consecutivoDocEstaTomado,
  consecutivoDocId,
  certEnUsoError,
  formatConsecutivo,
  normalizeCertificado,
  normalizeEquipmentId,
  normalizeHuecos,
  parseConsecutivo,
  pickLowestHueco,
  pickNextConsecutivoNumero,
  variantesCertificado,
} from "./consecutivosLogic.ts";

assert.deepEqual(normalizeHuecos([3, 1, 2]), [3, 1, 2]);
assert.deepEqual(normalizeHuecos({ 0: 5, 1: 2 }), [5, 2]);
assert.deepEqual(normalizeHuecos(null), []);
assert.deepEqual(normalizeHuecos([0, -1, "x"]), []);

assert.equal(pickLowestHueco([10, 3, 7]), 3);
assert.equal(pickLowestHueco([]), null);
assert.equal(pickLowestHueco({ 0: 8, 1: 4 }), 4);

assert.deepEqual(parseConsecutivo("AGD-0105-26"), {
  prefijo: "AGD",
  numero: 105,
  anio: "26",
});
assert.deepEqual(parseConsecutivo("AGDT-0001-26"), {
  prefijo: "AGDT",
  numero: 1,
  anio: "26",
});
assert.equal(parseConsecutivo("malo"), null);

assert.equal(formatConsecutivo("AGD", 5, "26"), "AGD-0005-26");
assert.equal(consecutivoDocId("AGD", 5, "26"), "AGD_26_0005");

assert.equal(normalizeCertificado("agd - 0005 - 26"), "AGD-0005-26");
assert.deepEqual(variantesCertificado("AGD-0005-26"), [
  "AGD-0005-26",
  "AGD - 0005 - 26",
]);

assert.equal(normalizeEquipmentId(" ep-45996 "), "EP-45996");
assert.equal(
  certificadoConflictEquipmentId(
    [
      { docId: "a", equipmentId: "EP-23226" },
      { docId: "b", equipmentId: "EP-45996" },
    ],
    "EP-45996"
  ),
  "EP-23226"
);
assert.equal(
  certificadoConflictEquipmentId(
    [{ docId: "a", equipmentId: "EP-23226" }],
    "EP-45996",
    "a"
  ),
  null
);
assert.equal(
  certificadoConflictEquipmentId([{ docId: "a", equipmentId: "EP-23226" }], "EP-23226"),
  null
);
assert.match(certEnUsoError("AGP-1403-26", "EP-23226", "EP-45996"), /^CERT_EN_USO:/);

assert.equal(consecutivoDocEstaTomado(null), false);
assert.equal(consecutivoDocEstaTomado({ worksheetConfirmado: false }), false);
assert.equal(consecutivoDocEstaTomado({ worksheetConfirmado: true }), true);
assert.equal(consecutivoDocEstaTomado({ equipoId: "EP-23226" }), true);

const skipped = pickNextConsecutivoNumero({ huecos: [3, 16, 699], valor: 1472 }, new Set([3, 16]));
assert.ok(skipped);
assert.equal(skipped.numero, 699);
assert.equal(skipped.esReciclado, true);
assert.deepEqual(skipped.nextState, { huecos: [], valor: 1472 });

const nextNew = pickNextConsecutivoNumero({ huecos: [3], valor: 1472 }, new Set([3]));
assert.ok(nextNew);
assert.equal(nextNew.numero, 1473);
assert.equal(nextNew.esReciclado, false);
assert.equal(nextNew.nextState.valor, 1473);

const none = pickNextConsecutivoNumero({ huecos: [1, 2], valor: 2 }, new Set([1, 2, 3, 4]), 2);
assert.equal(none, null);

console.log("consecutivosLogic.test.ts: OK");
