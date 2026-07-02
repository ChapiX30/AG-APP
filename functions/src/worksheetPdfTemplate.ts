import * as fs from "node:fs";
import * as path from "node:path";
import type { jsPDF } from "jspdf";

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

const WORKSHEET_ALIASES: Record<string, string> = {
  Presion: "Presión",
  "Presion Trazable": "Presión",
  "Reporte Diagnostico": "Reporte de Diagnostico",
  AcusticaTrazable: "Acustica",
};

function toWorksheetMagnitud(magnitud: string): string {
  const trimmed = (magnitud || "").trim();
  if (!trimmed) return "";
  if (WORKSHEET_ALIASES[trimmed]) return WORKSHEET_ALIASES[trimmed];
  const trazableMatch = trimmed.match(/^(.+?)\s+Trazable$/i);
  if (trazableMatch) {
    const base = trazableMatch[1].trim();
    return WORKSHEET_ALIASES[base] ?? toWorksheetMagnitud(base);
  }
  return WORKSHEET_ALIASES[trimmed] ?? trimmed;
}

let cachedLogoDataUrl = "";
function getLogoDataUrl(): string {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const candidates = [
    path.join(__dirname, "../assets/lab_logo.png"),
    path.join(__dirname, "../../assets/lab_logo.png"),
  ];
  for (const logoPath of candidates) {
    if (fs.existsSync(logoPath)) {
      cachedLogoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
      return cachedLogoDataUrl;
    }
  }
  return "";
}

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
    tempAmbiente: (data.tempAmbiente as string | number) ?? "",
    humedadRelativa: (data.humedadRelativa as string | number) ?? "",
    condicionEquipo: (data.condicionEquipo as WorksheetPdfFormData["condicionEquipo"]) || "",
    descripcionDano: String(data.descripcionDano || "").trim(),
    fotoEquipoBase64: String(data.fotoEquipoBase64 || "").trim(),
  };
};

export const generateTemplatePDF = (
  formData: WorksheetPdfFormData,
  JsPDF: typeof jsPDF
) => {
  // @ts-ignore
  const doc = new JsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const logoAg = getLogoDataUrl();

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginBottom = 55;
  const marginLeft = 40;
  const marginRight = pageWidth - 40;
  const contentWidth = marginRight - marginLeft;

  const tableWidth = 500;
  const tableX = (pageWidth - tableWidth) / 2;

  const BRAND_R = 36;
  const BRAND_G = 100;
  const BRAND_B = 163;
  const LABEL_GRAY_R = 139;
  const LABEL_GRAY_G = 141;
  const LABEL_GRAY_B = 140;
  const LOGO_WIDTH = 55;
  const LOGO_HEIGHT = LOGO_WIDTH * (408 / 454);

  let currentY = 60;

  const drawHeaderBase = () => {
    if (logoAg) {
      doc.addImage(logoAg, "PNG", marginLeft, 25, LOGO_WIDTH, LOGO_HEIGHT);
    }

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
    v1Lines.forEach((line: string, lineIdx: number) => {
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
      v2Lines.forEach((line: string, lineIdx: number) => {
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
    let p1 = "-", p2 = "-", p3 = "-", p4 = "-", p5 = "-";
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
      const colHalfWidth = tableWidth / 2 - 20;

      if (isHeaderLine) {
        const headerText = pLine.trim() || iLine.trim();
        const headerLines = doc.splitTextToSize(headerText, tableWidth - 20);
        const rowHeight = Math.max(18, headerLines.length * 12 + 6);
        checkPageBreak(rowHeight);
        doc.setDrawColor(200);
        doc.setFillColor(240, 240, 240);
        doc.setFont("helvetica", "bold");
        doc.rect(tableX, currentY, tableWidth, rowHeight, "FD");
        doc.setTextColor(0, 0, 100);
        doc.text(headerLines, tableX + 10, currentY + 12);
        doc.setTextColor(0, 0, 0);
        currentY += rowHeight;
        continue;
      }

      const pLines = pLine.trim() ? doc.splitTextToSize(pLine, colHalfWidth) : [""];
      const iLines = iLine.trim() ? doc.splitTextToSize(iLine, colHalfWidth) : [""];
      const rowHeight = Math.max(18, Math.max(pLines.length, iLines.length) * 12 + 6);
      checkPageBreak(rowHeight);
      doc.setDrawColor(200);
      doc.setFont("helvetica", "normal");
      doc.setFillColor(245, 250, 255);
      doc.rect(tableX, currentY, tableWidth / 2, rowHeight, "FD");
      doc.setFillColor(255, 252, 245);
      doc.rect(tableX + tableWidth / 2, currentY, tableWidth / 2, rowHeight, "FD");
      doc.setTextColor(0, 0, 0);
      doc.text(pLines, tableX + 10, currentY + 12);
      doc.text(iLines, tableX + tableWidth / 2 + 10, currentY + 12);
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
    const imgData = formData.fotoEquipoBase64.startsWith("data:")
      ? formData.fotoEquipoBase64
      : `data:image/jpeg;base64,${formData.fotoEquipoBase64}`;
    const imgFormat = imgData.includes("image/png") ? "PNG" : "JPEG";
    const maxImgWidth = Math.min(contentWidth, 280);
    const maxImgHeight = 210;
    const imgBlockHeight = maxImgHeight + 34;

    checkPageBreak(imgBlockHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Evidencia Fotográfica del Equipo:", marginLeft, currentY);
    currentY += 16;

    try {
      doc.addImage(imgData, imgFormat, marginLeft, currentY, maxImgWidth, maxImgHeight, undefined, "MEDIUM");
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

  const notasText = formData.notas?.trim()
    ? formData.notas.trim()
    : "Sin observaciones adicionales.";
  const notasLines = doc.splitTextToSize(notasText, contentWidth - 20);
  const notasHeight = notasLines.length * 14 + 34;

  checkPageBreak(notasHeight + 12);
  const notesY = currentY + 12;

  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(marginLeft, notesY - 15, contentWidth, notasHeight, "FD");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Observaciones / Notas:", marginLeft + 10, notesY + 2);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text(notasLines, marginLeft + 10, notesY + 18);

  drawFooter();
  return doc;
};
