import assert from "node:assert/strict";
import {
  countNumericLines,
  envLimitsForMagnitud,
  envRangeStatus,
  isOutOfEnvRange,
  puntosMedicionAviso,
} from "./worksheetWarnings.ts";

assert.equal(isOutOfEnvRange("", 18, 26), false);
assert.equal(isOutOfEnvRange("22", 18, 26), false);
assert.equal(isOutOfEnvRange("18", 18, 26), false);
assert.equal(isOutOfEnvRange("26", 18, 26), false);
assert.equal(isOutOfEnvRange("2", 18, 26), true);
assert.equal(isOutOfEnvRange("86", 30, 70), true);

assert.equal(countNumericLines(""), 0);
assert.equal(countNumericLines("10\n20\n30"), 3);
assert.equal(countNumericLines("abc\n\n5"), 1);

assert.equal(
  puntosMedicionAviso({ magnitud: "Masa", count: 0 }),
  "Se recomiendan al menos 3 puntos de linealidad. Hay 0.",
);
assert.equal(
  puntosMedicionAviso({ magnitud: "Electrica", count: 1, contexto: "V · Canal 1" }),
  "Se recomiendan al menos 3 puntos en V · Canal 1. Hay 1.",
);
assert.equal(
  puntosMedicionAviso({ magnitud: "Presión", count: 2 }),
  "Se recomiendan al menos 3 puntos en el alcance (Presión). Hay 2.",
);

assert.deepEqual(envLimitsForMagnitud("Presión"), { tMin: 18, tMax: 28 });
assert.deepEqual(envLimitsForMagnitud("Presion"), { tMin: 18, tMax: 28 });
assert.deepEqual(envLimitsForMagnitud("Masa"), { tMin: 18, tMax: 27, hMin: 40, hMax: 60 });
assert.deepEqual(envLimitsForMagnitud("Dimensional"), { tMin: 18, tMax: 22, hMin: 40, hMax: 60 });

// Presión 27 °C entra (EURAMET cg-17 18–28); el rango viejo 18–26 la marcaba mal.
const presionOk = envRangeStatus("Presión", "27", "86");
assert.equal(presionOk.tempOut, false);
assert.equal(presionOk.hrOut, false);

const presionFria = envRangeStatus("Presión", "2", "86");
assert.equal(presionFria.tempOut, true);
assert.equal(presionFria.hrOut, false);
assert.equal(presionFria.summary, "2 °C (18–28)");

const masa = envRangeStatus("Masa", "2", "86");
assert.equal(masa.tempOut, true);
assert.equal(masa.hrOut, true);
assert.equal(masa.summary, "2 °C (18–27) · 86 % HR (40–60)");

const masaOk = envRangeStatus("Masa", "21", "50");
assert.equal(masaOk.tempOut, false);
assert.equal(masaOk.hrOut, false);

const dimCaliente = envRangeStatus("Dimensional", "25", "50");
assert.equal(dimCaliente.tempOut, true);
assert.equal(dimCaliente.summary, "25 °C (18–22)");

const torqueHr = envRangeStatus("Par Torsional", "22", "86");
assert.equal(torqueHr.tempOut, false);
assert.equal(torqueHr.hrOut, false);

const torqueHrAlta = envRangeStatus("Par Torsional", "22", "95");
assert.equal(torqueHrAlta.hrOut, true);
assert.equal(torqueHrAlta.summary, "95 % HR (máx. 90)");

assert.equal(envRangeStatus("", "2", "86").tempOut, false);
assert.equal(envRangeStatus(undefined, "2", "86").hrOut, false);

console.log("worksheetWarnings.test.ts: ok");
