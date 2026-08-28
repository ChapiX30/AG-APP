import assert from "node:assert/strict";
import {
  buildAlcanceResolucionSpec,
  generatePuntosNominales,
  parseAlcanceValue,
  parseResolucionValue,
} from "./worksheetPuntosDictamen.ts";

assert.equal(parseResolucionValue(".01"), 0.01);
assert.equal(parseResolucionValue("0.01"), 0.01);
assert.equal(parseResolucionValue(",01"), 0.01);
assert.equal(parseAlcanceValue("1"), 1);
assert.equal(parseAlcanceValue("0-1"), 1);
assert.equal(parseAlcanceValue("0-100 psi"), 100);
assert.equal(parseAlcanceValue("1 MPa"), 1);

const specMpa = buildAlcanceResolucionSpec("1", ".01");
assert.ok(specMpa);
assert.equal(specMpa.alcance, 1);
assert.equal(specMpa.resolucion, 0.01);
assert.equal(specMpa.nPuntos, 5);

const puntos = generatePuntosNominales(specMpa);
assert.deepEqual(puntos, ["0.2", "0.4", "0.6", "0.8", "1"]);

assert.equal(buildAlcanceResolucionSpec("1", ".01") != null, true);
assert.equal(buildAlcanceResolucionSpec("100", "1") != null, true);

console.log("worksheetPuntosDictamen.test.ts: ok");
