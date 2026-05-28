import assert from "node:assert/strict";
import {
  getParentFolderFromPath,
  isMetadataPendingReview,
  isWorksheetCargadoDrive,
  isWorksheetRealizado,
  isWorksheetUploadedToDrive,
  normalizeDriveFullPath,
  resolveTechnicianGroupKey,
  shouldTreatAsPendingReview,
} from "./pendingReviewDriveLogic";

const ABRAHAM_PATH = "worksheets/Abraham Ginez/CERT-001_EQ-123.pdf";

assert.equal(getParentFolderFromPath(ABRAHAM_PATH), "Abraham Ginez");

assert.equal(
  normalizeDriveFullPath("Abraham Ginez/CERT-001_EQ-123.pdf", "CERT-001_EQ-123.pdf", "worksheets"),
  ABRAHAM_PATH
);

assert.equal(
  resolveTechnicianGroupKey({
    fullPath: ABRAHAM_PATH,
    parentFolder: "Abraham Ginez",
    uploadedBy: "Sistema",
    completedByName: "Otro Usuario",
  }),
  "Abraham Ginez"
);

assert.equal(
  resolveTechnicianGroupKey({
    fullPath: ABRAHAM_PATH,
    worksheetTechnician: "Abraham Ginez",
    uploadedBy: "Sistema",
  }),
  "Abraham Ginez"
);

assert.equal(isWorksheetUploadedToDrive("Si"), true);
assert.equal(isWorksheetUploadedToDrive("Realizado"), true);
assert.equal(isWorksheetUploadedToDrive("No"), false);
assert.equal(isWorksheetCargadoDrive("Si"), true);

assert.equal(isWorksheetRealizado("Realizado"), true);
assert.equal(isWorksheetRealizado("Si"), false);
assert.equal(isWorksheetRealizado("No"), false);

assert.equal(isMetadataPendingReview({ completed: true, reviewed: false }), true);
assert.equal(isMetadataPendingReview({ completed: true, reviewed: true }), false);

assert.equal(
  shouldTreatAsPendingReview({ completed: false }, { cargado_drive: "Si" }),
  false
);

assert.equal(
  shouldTreatAsPendingReview({ completed: false }, { cargado_drive: "Realizado" }),
  true
);

console.log("pendingReviewDrive.test.ts: OK");
