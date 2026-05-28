import type { jsPDF } from "jspdf";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import logoAg from "../assets/lab_logo.png";
import { db, storage } from "./firebase";
import { writeDriveFileMetadata } from "./driveFileMetadata";
import { toWorksheetMagnitud } from "./magnitudWorksheet";

/** Fields consumed by generateTemplatePDF (shared with WorkSheetScreen). */
export interface WorksheetPdfFormData {
  lugarCalibracion: string;
  frecuenciaCalibracion: string;
  fecha: string;
  fechaRecepcion: string;
  certificado: string;
  nombre: string;
  cliente: string;
  id: string;
  equipo: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  magnitud: string;
  unidad: string[];
  alcance: string;
  resolucion: string;
  medicionPatron: string;
  medicionInstrumento: string;
  excentricidad: string;
  linealidad: string;
  repetibilidad: string;
  notas: string;
  tempAmbiente: string | number;
  humedadRelativa: string | number;
  condicionEquipo: "buenas" | "dano" | "";
  descripcionDano: string;
  fotoEquipoBase64: string;
}

export interface WorksheetPdfReadiness {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

export interface GenerateWorksheetPdfResult {
  ok: boolean;
  pdfURL?: string;
  storagePath?: string;
  missing?: string[];
  warnings?: string[];
  error?: string;
}

export const getTechnicianFolderName = (
  user: { name?: string; displayName?: string; email?: string } | null | undefined
) => user?.name?.trim() || user?.displayName?.trim() || user?.email?.split("@")[0] || "Sin Usuario";

export const getTechnicianFolderFromWorksheet = (data: Record<string, unknown>): string => {
  const fromRow = String(data.nombre || data.assignedTo || "").trim();
  return fromRow || "Sin Usuario";
};

const normalizeLugarCalibracion = (raw: unknown): string => {
  const lugar = String(raw || "").trim();
  const lower = lugar.toLowerCase();
  if (lower === "sitio") return "Sitio";
  if (lower === "laboratorio") return "Laboratorio";
  return lugar;
};

const normalizeUnidad = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((u) => String(u)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
};

/** Maps a hojasDeTrabajo document into PDF form data. */
export const firestoreToWorksheetPdfForm = (
  data: Record<string, unknown>
): WorksheetPdfFormData => {
  const certificado = String(data.certificado || data.folio || "").trim();
  const numeroSerie = String(data.numeroSerie || data.serie || "").trim();
  const fechaRecepcion = String(data.fechaRecepcion || data.fechaEntrada || "").trim();

  return {
    lugarCalibracion: normalizeLugarCalibracion(data.lugarCalibracion),
    frecuenciaCalibracion: String(data.frecuenciaCalibracion || "").trim(),
    fecha: String(data.fecha || data.fecha_calib || "").trim(),
    fechaRecepcion,
    certificado,
    nombre: String(data.nombre || data.assignedTo || "").trim(),
    cliente: String(data.cliente || "").trim(),
    id: String(data.id || "").trim(),
    equipo: String(data.equipo || "").trim(),
    marca: String(data.marca || "").trim(),
    modelo: String(data.modelo || "").trim(),
    numeroSerie,
    magnitud: toWorksheetMagnitud(String(data.magnitud || "")),
    unidad: normalizeUnidad(data.unidad),
    alcance: String(data.alcance || "").trim(),
    resolucion: String(data.resolucion || "").trim(),
    medicionPatron: String(data.medicionPatron || "").trim(),
    medicionInstrumento: String(data.medicionInstrumento || "").trim(),
    excentricidad: String(data.excentricidad || "").trim(),
    linealidad: String(data.linealidad || "").trim(),
    repetibilidad: String(data.repetibilidad || "").trim(),
    notas: String(data.notas || "").trim(),
    tempAmbiente: data.tempAmbiente ?? "",
    humedadRelativa: data.humedadRelativa ?? "",
    condicionEquipo: (data.condicionEquipo as WorksheetPdfFormData["condicionEquipo"]) || "",
    descripcionDano: String(data.descripcionDano || "").trim(),
    fotoEquipoBase64: String(data.fotoEquipoBase64 || "").trim(),
  };
};

export const buildWorksheetPdfStoragePath = (
  technicianFolder: string,
  certificado: string,
  equipmentId: string
): string => {
  const cert = certificado.trim() || "SIN-CERT";
  const id = equipmentId.trim() || "SINID";
  return `worksheets/${technicianFolder}/${cert}_${id}.pdf`;
};

/** Minimum data to build filename + meaningful PDF. Measurements may be empty (shown as "-"). */
export const assessWorksheetPdfReadiness = (
  form: WorksheetPdfFormData
): WorksheetPdfReadiness => {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!form.id.trim()) missing.push("ID del equipo");
  if (!form.certificado.trim()) missing.push("Número de certificado / folio");

  const identityFields: [string, string][] = [
    ["Cliente", form.cliente],
    ["Equipo", form.equipo],
    ["Marca", form.marca],
    ["Modelo", form.modelo],
    ["Magnitud", form.magnitud],
    ["Metrólogo", form.nombre],
    ["Fecha de calibración", form.fecha],
  ];
  for (const [label, value] of identityFields) {
    if (!value?.trim()) warnings.push(`${label} vacío — aparecerá como "-" en el PDF`);
  }

  if (!form.unidad.length) warnings.push("Unidad de medida vacía");

  if (form.magnitud === "Masa") {
    if (!form.excentricidad.trim()) warnings.push("Excentricidad sin datos");
    if (!form.linealidad.trim()) warnings.push("Linealidad sin datos");
    if (!form.repetibilidad.trim()) warnings.push("Repetibilidad sin datos");
  } else if (form.magnitud === "Electrica") {
    if (!form.medicionPatron.trim() && !form.medicionInstrumento.trim()) {
      warnings.push("Mediciones eléctricas vacías");
    }
  } else if (form.magnitud) {
    if (!form.medicionPatron.trim()) warnings.push("Medición patrón vacía");
    if (!form.medicionInstrumento.trim()) warnings.push("Medición instrumento vacía");
  } else {
    warnings.push("Magnitud no definida — tabla de mediciones quedará vacía");
  }

  if (!form.condicionEquipo) warnings.push("Condición del equipo no registrada");

  return { ok: missing.length === 0, missing, warnings };
};

const hasEmptyMeasurementSections = (form: WorksheetPdfFormData): boolean => {
  if (form.magnitud === "Masa") {
    return (
      !form.excentricidad.trim() &&
      !form.linealidad.trim() &&
      !form.repetibilidad.trim()
    );
  }
  return !form.medicionPatron.trim() && !form.medicionInstrumento.trim();
};

export const generateTemplatePDF = (
  formData: WorksheetPdfFormData,
  JsPDF: typeof jsPDF
) => {
  // @ts-ignore
  const doc = new JsPDF({ orientation: "p", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginBottom = 40;
  const marginLeft = 40;
  const marginRight = pageWidth - 40;
  const contentWidth = marginRight - marginLeft;

  const tableWidth = 500;
  const tableX = (pageWidth - tableWidth) / 2;

  const BRAND_R = 0;
  const BRAND_G = 80;
  const BRAND_B = 216;
  const LABEL_GRAY_R = 55;
  const LABEL_GRAY_G = 65;
  const LABEL_GRAY_B = 81;
  const LOGO_WIDTH = 55;
  const LOGO_HEIGHT = LOGO_WIDTH * (408 / 454);

  let currentY = 60;

  const drawHeaderBase = () => {
    doc.addImage(logoAg, "PNG", marginLeft, 25, LOGO_WIDTH, LOGO_HEIGHT);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
    doc.text("Equipos y Servicios Especializados AG", marginLeft + LOGO_WIDTH + 15, 50, {
      align: "left",
    });

    doc.setDrawColor(BRAND_R, BRAND_G, BRAND_B);
    doc.setLineWidth(1);
    doc.line(marginLeft, 80, marginRight, 80);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
  };

  const drawFooter = () => {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100);
      doc.text("Equipos y Servicios AG", marginLeft, pageHeight - 35);
      doc.text("Documento generado electrónicamente", marginLeft, pageHeight - 25);
      doc.text("AG-CAL-F39-00", marginLeft, pageHeight - 15);
      doc.text(`Página ${i} de ${totalPages}`, marginRight - 50, pageHeight - 15);
    }
  };

  const checkPageBreak = (heightNeeded: number) => {
    if (currentY + heightNeeded > pageHeight - marginBottom) {
      doc.addPage();
      drawHeaderBase();
      currentY = 100;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
      doc.text("Mediciones (Continuación)", marginLeft, currentY);
      currentY += 25;

      doc.setDrawColor(200);
      doc.setFillColor(230, 235, 245);
      doc.setLineWidth(0.5);
      doc.rect(tableX, currentY, tableWidth, 20, "FD");

      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);

      if (formData.magnitud === "Masa") {
        doc.text("Parámetro", tableX + 20, currentY + 14);
        doc.text("Valor", tableX + tableWidth / 2 + 20, currentY + 14);
      } else {
        doc.text("Medición Patrón", tableX + 20, currentY + 14);
        doc.text("Medición Instrumento", tableX + tableWidth / 2 + 20, currentY + 14);
      }
      currentY += 20;
      return true;
    }
    return false;
  };

  drawHeaderBase();
  currentY = 100;

  const col1X = marginLeft;
  const col2X = pageWidth / 2 + 35;

  doc.setFillColor(245, 247, 250);
  doc.rect(marginLeft, currentY - 12, contentWidth, 25, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(LABEL_GRAY_R, LABEL_GRAY_G, LABEL_GRAY_B);
  doc.text("Nombre:", marginLeft + 10, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(formData.nombre || "-", marginLeft + 65, currentY + 5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(LABEL_GRAY_R, LABEL_GRAY_G, LABEL_GRAY_B);
  doc.text("Fecha:", col2X, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(formData.fecha || "-", col2X + 45, currentY + 5);

  currentY += 35;

  const infoData = [
    { l: "Cliente:", v: formData.cliente, l2: "N. Certificado:", v2: formData.certificado },
    { l: "Equipo:", v: formData.equipo, l2: "ID:", v2: formData.id },
    { l: "Marca:", v: formData.marca, l2: "Modelo:", v2: formData.modelo },
    { l: "N. Serie:", v: formData.numeroSerie, l2: "Ubicación:", v2: formData.lugarCalibracion },
    {
      l: "Magnitud:",
      v: formData.magnitud,
      l2: "Unidad:",
      v2: Array.isArray(formData.unidad) ? formData.unidad.join(", ") : formData.unidad,
    },
    { l: "Alcance:", v: formData.alcance, l2: "Resolución:", v2: formData.resolucion },
    { l: "Frecuencia:", v: formData.frecuenciaCalibracion, l2: "Recepción:", v2: formData.fechaRecepcion || "N/A" },
    {
      l: "Temp. Amb:",
      v: `${formData.tempAmbiente || "-"} °C`,
      l2: "Humedad:",
      v2: `${formData.humedadRelativa || "-"} %`,
    },
    {
      l: "Condición:",
      v:
        formData.condicionEquipo === "buenas"
          ? "Buenas condiciones"
          : formData.condicionEquipo === "dano"
            ? "Presenta daño/anomalía"
            : "-",
      l2: "",
      v2: "",
    },
  ];

  const col1ValueX = col1X + 75;
  const col1ValueMaxWidth = col2X - col1ValueX - 8;
  const col2ValueX = col2X + 80;
  const col2ValueMaxWidth = marginRight - col2ValueX;
  const infoLineHeight = 12;
  const infoMinRowHeight = 16;

  infoData.forEach((row, index) => {
    const isClienteRow = row.l === "Cliente:" || index === 0;
    const v1Lines = doc.splitTextToSize(String(row.v || "-"), col1ValueMaxWidth);
    const v2Lines = row.l2
      ? doc.splitTextToSize(String(row.v2 || "-"), col2ValueMaxWidth)
      : [];
    const lineCount = Math.max(v1Lines.length, v2Lines.length, 1);
    const rowHeight = Math.max(infoMinRowHeight, lineCount * infoLineHeight + 4);

    checkPageBreak(rowHeight);

    if (index % 2 === 0) {
      doc.setFillColor(252, 252, 252);
      doc.rect(marginLeft, currentY - 11, contentWidth, rowHeight, "F");
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(LABEL_GRAY_R, LABEL_GRAY_G, LABEL_GRAY_B);
    doc.text(row.l, col1X + 5, currentY + 1);

    if (isClienteRow) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
    } else {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
    }
    v1Lines.forEach((line, lineIdx) => {
      doc.text(line, col1ValueX, currentY + 1 + lineIdx * infoLineHeight);
    });

    if (row.l2) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(LABEL_GRAY_R, LABEL_GRAY_G, LABEL_GRAY_B);
      doc.text(row.l2, col2X, currentY + 1);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      v2Lines.forEach((line, lineIdx) => {
        doc.text(line, col2ValueX, currentY + 1 + lineIdx * infoLineHeight);
      });
    }

    currentY += rowHeight;
  });

  currentY += 20;

  checkPageBreak(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
  doc.setFillColor(230, 235, 245);
  doc.rect(marginLeft, currentY - 14, contentWidth, 20, "F");
  doc.text("Resultados de Mediciones", marginLeft + 10, currentY);
  doc.setTextColor(0, 0, 0);
  currentY += 25;

  const isMasa = formData.magnitud === "Masa";

  if (isMasa) {
    const excLines = (formData.excentricidad || "").split("\n");
    let p1 = "-",
      p2 = "-",
      p3 = "-",
      p4 = "-",
      p5 = "-";
    excLines.forEach((l) => {
      if (l.startsWith("1")) p1 = l.substring(l.indexOf(":") + 1).trim() || "-";
      else if (l.startsWith("2")) p2 = l.substring(l.indexOf(":") + 1).trim() || "-";
      else if (l.startsWith("3")) p3 = l.substring(l.indexOf(":") + 1).trim() || "-";
      else if (l.startsWith("4")) p4 = l.substring(l.indexOf(":") + 1).trim() || "-";
      else if (l.startsWith("5")) p5 = l.substring(l.indexOf(":") + 1).trim() || "-";
    });

    checkPageBreak(130);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Excentricidad:", tableX, currentY + 10);
    currentY += 25;

    const boxSize = 80;
    const boxX = pageWidth / 2 - boxSize / 2;
    const boxY = currentY;

    doc.setDrawColor(150);
    doc.setLineWidth(1);
    doc.rect(boxX, boxY, boxSize, boxSize);

    doc.setLineWidth(0.5);
    doc.setDrawColor(200);
    doc.line(boxX + boxSize / 2, boxY, boxX + boxSize / 2, boxY + boxSize);
    doc.line(boxX, boxY + boxSize / 2, boxX + boxSize, boxY + boxSize / 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    doc.text(`3: ${p3}`, boxX - 35, boxY + 10);
    doc.text(`4: ${p4}`, boxX + boxSize + 5, boxY + 10);
    doc.setFont("helvetica", "bold");
    doc.text(`1: ${p1}`, boxX + boxSize / 2 - 12, boxY + boxSize / 2 - 5);
    doc.setFont("helvetica", "normal");
    doc.text(`2: ${p2}`, boxX - 35, boxY + boxSize - 5);
    doc.text(`5: ${p5}`, boxX + boxSize + 5, boxY + boxSize - 5);

    currentY += boxSize + 25;

    checkPageBreak(40);
    doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
    doc.setTextColor(255, 255, 255);
    doc.rect(tableX, currentY, tableWidth, 20, "FD");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");

    doc.text("Parámetro", tableX + 20, currentY + 14);
    doc.text("Valor", tableX + tableWidth / 2 + 20, currentY + 14);
    currentY += 20;
    doc.setTextColor(0, 0, 0);

    const masaData = [
      ["Linealidad", formData.linealidad || "-"],
      ["Repetibilidad", formData.repetibilidad || "-"],
    ];

    masaData.forEach(([param, val]) => {
      const paramLines = doc.splitTextToSize(val, tableWidth / 2 - 20);
      const rowHeight = Math.max(20, paramLines.length * 15 + 10);
      checkPageBreak(rowHeight);

      doc.setFontSize(10);
      doc.setDrawColor(200);
      doc.rect(tableX, currentY, tableWidth / 2, rowHeight);
      doc.rect(tableX + tableWidth / 2, currentY, tableWidth / 2, rowHeight);

      doc.setFont("helvetica", "bold");
      doc.text(param, tableX + 10, currentY + 14);
      doc.setFont("helvetica", "normal");
      doc.text(paramLines, tableX + tableWidth / 2 + 10, currentY + 14);
      currentY += rowHeight;
    });
  } else {
    doc.setDrawColor(0);
    doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
    doc.setTextColor(255, 255, 255);
    doc.setLineWidth(0.1);

    checkPageBreak(30);
    doc.rect(tableX, currentY, tableWidth, 20, "FD");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");

    doc.text("Medición Patrón", tableX + 20, currentY + 14);
    doc.text("Medición Instrumento", tableX + tableWidth / 2 + 20, currentY + 14);
    currentY += 20;
    doc.setTextColor(0, 0, 0);

    const patronRaw = (formData.medicionPatron || "").split("\n");
    const instrumentoRaw = (formData.medicionInstrumento || "").split("\n");
    const maxLines = Math.max(patronRaw.length, instrumentoRaw.length);
    const loopLimit = maxLines > 0 ? maxLines : 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    for (let i = 0; i < loopLimit; i++) {
      const pLine = patronRaw[i] || "";
      const iLine = instrumentoRaw[i] || "";
      const isHeaderLine = pLine.trim().endsWith(":") || iLine.trim().endsWith(":");
      const rowHeight = 18;
      checkPageBreak(rowHeight);

      doc.setDrawColor(200);
      if (isHeaderLine) {
        doc.setFillColor(240, 240, 240);
        doc.setFont("helvetica", "bold");
        doc.rect(tableX, currentY, tableWidth, rowHeight, "FD");
        doc.setTextColor(0, 0, 100);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFillColor(245, 250, 255);
        doc.rect(tableX, currentY, tableWidth / 2, rowHeight, "FD");
        doc.setFillColor(255, 252, 245);
        doc.rect(tableX + tableWidth / 2, currentY, tableWidth / 2, rowHeight, "FD");
        doc.setTextColor(0, 0, 0);
      }

      doc.text(pLine, tableX + 10, currentY + 12);
      doc.text(iLine, tableX + tableWidth / 2 + 10, currentY + 12);
      currentY += rowHeight;
    }
  }

  currentY += 20;

  if (formData.condicionEquipo === "dano" && formData.descripcionDano) {
    checkPageBreak(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setFillColor(255, 240, 240);
    doc.setDrawColor(200, 50, 50);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, currentY, contentWidth, 20, "FD");
    doc.setTextColor(180, 0, 0);
    doc.text("Observación — Daño / Anomalía detectada:", marginLeft + 8, currentY + 14);
    doc.setTextColor(0, 0, 0);
    currentY += 24;
    const danoLines = doc.splitTextToSize(formData.descripcionDano, tableWidth - 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(danoLines, marginLeft + 8, currentY);
    currentY += danoLines.length * 14 + 16;
  }

  if (formData.fotoEquipoBase64) {
    checkPageBreak(220);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Evidencia Fotográfica del Equipo:", marginLeft, currentY);
    currentY += 14;
    try {
      const imgData = formData.fotoEquipoBase64.startsWith("data:")
        ? formData.fotoEquipoBase64
        : `data:image/jpeg;base64,${formData.fotoEquipoBase64}`;
      const maxImgWidth = 300;
      const maxImgHeight = 200;
      doc.addImage(imgData, "JPEG", marginLeft, currentY, maxImgWidth, maxImgHeight, undefined, "MEDIUM");
      currentY += maxImgHeight + 16;
    } catch {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("(No se pudo incrustar la imagen)", marginLeft, currentY);
      currentY += 20;
      doc.setTextColor(0, 0, 0);
    }
  }

  const notasText = formData.notas ? formData.notas.trim() : "Sin observaciones adicionales.";
  const notasLines = doc.splitTextToSize(notasText, tableWidth - 20);
  const notasHeight = notasLines.length * 14 + 30;

  let notesY = currentY + 20;
  const spaceLeftOnPage = pageHeight - marginBottom - currentY;

  if (spaceLeftOnPage > notasHeight + 20) {
    notesY = pageHeight - marginBottom - notasHeight - 10;
  } else {
    checkPageBreak(notasHeight + 20);
    notesY = currentY + 20;
  }

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, notesY - 15, contentWidth, notasHeight, "FD");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Observaciones / Notas:", marginLeft + 10, notesY + 2);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text(notasLines, marginLeft + 10, notesY + 18);

  drawFooter();
  return doc;
};

export async function generateWorksheetPdfBlob(form: WorksheetPdfFormData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdfDoc = generateTemplatePDF(form, jsPDF as typeof jsPDF);
  return pdfDoc.output("blob");
}

async function attachPhotoFromUrl(form: WorksheetPdfFormData, fotoUrl: string): Promise<void> {
  if (form.fotoEquipoBase64 || !fotoUrl) return;
  try {
    const resp = await fetch(fotoUrl);
    if (!resp.ok) return;
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    form.fotoEquipoBase64 = dataUrl;
  } catch {
    /* optional enrichment */
  }
}

/**
 * Generates a worksheet PDF from Firestore data, uploads to Storage,
 * writes fileMetadata, and updates hojasDeTrabajo (pdfURL + cargado_drive).
 */
export async function generateWorksheetPdfFromFirestore(
  docId: string,
  options?: {
    technicianFolder?: string;
    uploadedBy?: string;
    /** When true, proceeds even if measurement sections are empty. */
    allowIncomplete?: boolean;
  }
): Promise<GenerateWorksheetPdfResult> {
  const snap = await getDoc(doc(db, "hojasDeTrabajo", docId));
  if (!snap.exists()) {
    return { ok: false, error: "No se encontró la hoja de trabajo en Firestore." };
  }

  const raw = snap.data() as Record<string, unknown>;
  const form = firestoreToWorksheetPdfForm(raw);
  const readiness = assessWorksheetPdfReadiness(form);

  if (!readiness.ok) {
    return { ok: false, missing: readiness.missing, error: "Faltan datos mínimos para generar el PDF." };
  }

  if (!options?.allowIncomplete && hasEmptyMeasurementSections(form)) {
    return {
      ok: false,
      warnings: readiness.warnings,
      error: "La hoja no tiene mediciones. Complete la Hoja de Trabajo o confirme generación parcial.",
    };
  }

  await attachPhotoFromUrl(form, String(raw.fotoEquipoURL || ""));

  const technicianFolder =
    options?.technicianFolder?.trim() ||
    getTechnicianFolderFromWorksheet(raw) ||
    "Sin Usuario";
  const uploadedBy = options?.uploadedBy?.trim() || technicianFolder;
  const storagePath = buildWorksheetPdfStoragePath(technicianFolder, form.certificado, form.id);

  try {
    const blob = await generateWorksheetPdfBlob(form);
    const pdfRef = ref(storage, storagePath);
    const uploadResult = await uploadBytes(pdfRef, blob);
    const pdfURL = await getDownloadURL(pdfRef);

    const lugarLower = form.lugarCalibracion.toLowerCase();
    try {
      await writeDriveFileMetadata(storagePath, uploadResult, uploadedBy, {
        ubicacion_real: lugarLower === "sitio" ? "Servicio en Sitio" : "Laboratorio",
        workDate: form.fecha,
      });
    } catch (metaErr) {
      console.error("[worksheetPdfGenerator] fileMetadata:", metaErr);
    }

    const patch: Record<string, string> = {
      pdfURL,
      cargado_drive: "Si",
      lastUpdated: new Date().toISOString(),
    };
    const certStatus = String(raw.status_certificado || "").trim();
    if (!certStatus || certStatus === "Pendiente de Certificado") {
      patch.status_certificado = "Generado";
    }

    await updateDoc(doc(db, "hojasDeTrabajo", docId), patch);

    return {
      ok: true,
      pdfURL,
      storagePath,
      warnings: readiness.warnings.length > 0 ? readiness.warnings : undefined,
    };
  } catch (err) {
    console.error("[worksheetPdfGenerator]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al generar o subir el PDF.",
      warnings: readiness.warnings,
    };
  }
}
