import assert from "node:assert/strict";
import {
  consecutivoDocId,
  formatConsecutivo,
  normalizeCertificado,
  normalizeHuecos,
  parseConsecutivo,
  pickLowestHueco,
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

console.log("consecutivosLogic.test.ts: OK");
