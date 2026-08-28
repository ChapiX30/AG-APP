import assert from "node:assert/strict";
import {
  isMexicoMROClient,
  planSalidaPdfPages,
  ROWS_FULL,
  ROWS_SPLIT,
} from "./entradaSalidaPdfLogic.ts";

assert.equal(isMexicoMROClient("MEXICO MRO. MANAGEMENT S DE RL DE CV"), true);
assert.equal(isMexicoMROClient("Mexico MRO Management"), true);
assert.equal(isMexicoMROClient("MX MRO SERVICES"), true);
assert.equal(isMexicoMROClient("RUHRPUMPEN SA DE CV"), false);
assert.equal(isMexicoMROClient(""), false);

const mroMany = planSalidaPdfPages("MEXICO MRO. MANAGEMENT S DE RL DE CV", 28);
assert.equal(mroMany.fullPage, true);
assert.equal(mroMany.rowsPerPage, ROWS_FULL);
assert.equal(mroMany.contentPages, 2);
assert.equal(mroMany.printedPages, 4);

const mroFew = planSalidaPdfPages("Mexico MRO Management", 5);
assert.equal(mroFew.contentPages, 1);
assert.equal(mroFew.printedPages, 2);

const otherMany = planSalidaPdfPages("RUHRPUMPEN SA DE CV", 9);
assert.equal(otherMany.fullPage, false);
assert.equal(otherMany.rowsPerPage, ROWS_SPLIT);
assert.equal(otherMany.contentPages, 2);
assert.equal(otherMany.printedPages, 2);

const otherFew = planSalidaPdfPages("RUHRPUMPEN SA DE CV", 3);
assert.equal(otherFew.contentPages, 1);
assert.equal(otherFew.printedPages, 1);

console.log("entradaSalidaPdf tests ok");
