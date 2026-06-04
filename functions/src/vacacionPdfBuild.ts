import * as fs from "fs";
import * as path from "path";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const AG_BLUE = rgb(36 / 255, 100 / 255, 163 / 255);
const AG_BLUE_DARK = rgb(29 / 255, 80 / 255, 130 / 255);
const TEXT = rgb(0.1, 0.12, 0.16);
const TEXT_MUTED = rgb(0.4, 0.44, 0.5);
const BORDER = rgb(0.78, 0.82, 0.88);
const ROW_ALT = rgb(0.97, 0.98, 0.99);

function loadLogoBytes(): Uint8Array | null {
    const candidates = [
        path.join(__dirname, "../assets/lab_logo.png"),
        path.join(__dirname, "../../assets/lab_logo.png"),
        path.join(__dirname, "../../../src/assets/lab_logo.png"),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return fs.readFileSync(p);
        } catch {
            /* ignore */
        }
    }
    return null;
}

function formatFechaLarga(isoDate: string): string {
    try {
        return format(parseISO(isoDate), "d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
        return isoDate || "—";
    }
}

function formatFechaCorta(isoDate: string): string {
    try {
        return format(parseISO(isoDate), "dd/MM/yyyy", { locale: es });
    } catch {
        return isoDate || "—";
    }
}

function inferFlowType(data: FirebaseFirestore.DocumentData): "operativo" | "calidad" {
    if (data.tipoFlujo === "calidad" || data.tipoFlujo === "operativo") {
        return data.tipoFlujo;
    }
    const p = String(data.solicitantePuesto || "").toLowerCase();
    return p.includes("calidad") ? "calidad" : "operativo";
}

function wrapText(text: string, maxChars: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (next.length > maxChars) {
            if (line) lines.push(line);
            line = w;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

function drawHeader(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    logoImg: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
) {
    const { width, height } = page.getSize();
    const bandH = 96;

    page.drawRectangle({
        x: 0,
        y: height - bandH,
        width,
        height: bandH,
        color: AG_BLUE,
    });

    const logoY = height - bandH + 22;
    if (logoImg) {
        const maxW = 100;
        const maxH = 48;
        const scale = Math.min(maxW / logoImg.width, maxH / logoImg.height, 1);
        page.drawImage(logoImg, {
            x: MARGIN,
            y: logoY,
            width: logoImg.width * scale,
            height: logoImg.height * scale,
        });
    }

    const textX = logoImg ? MARGIN + 112 : MARGIN;
    page.drawText("EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.", {
        x: textX,
        y: height - 38,
        size: 10.5,
        font: fontBold,
        color: rgb(1, 1, 1),
    });
    page.drawText("Departamento de Recursos Humanos", {
        x: textX,
        y: height - 54,
        size: 9,
        font,
        color: rgb(0.88, 0.92, 0.98),
    });

    const codigo = "AG-ADM-F12-00";
    const codigoW = fontBold.widthOfTextAtSize(codigo, 8);
    page.drawRectangle({
        x: width - MARGIN - codigoW - 20,
        y: height - bandH + 28,
        width: codigoW + 20,
        height: 22,
        color: rgb(1, 1, 1),
    });
    page.drawText(codigo, {
        x: width - MARGIN - codigoW - 10,
        y: height - bandH + 35,
        size: 8,
        font: fontBold,
        color: AG_BLUE_DARK,
    });
}

function drawTitleBlock(page: PDFPage, fontBold: PDFFont, y: number): number {
    const { width } = page.getSize();
    const titulo = "SOLICITUD DE VACACIONES";
    const size = 16;
    const w = fontBold.widthOfTextAtSize(titulo, size);
    page.drawText(titulo, {
        x: (width - w) / 2,
        y,
        size,
        font: fontBold,
        color: TEXT,
    });
    page.drawRectangle({
        x: (width - w) / 2 - 24,
        y: y - 10,
        width: w + 48,
        height: 3,
        color: AG_BLUE,
    });
    return y - 32;
}

function drawDataGrid(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    yTop: number,
    data: FirebaseFirestore.DocumentData,
): number {
    const { width } = page.getSize();
    const tableX = MARGIN;
    const tableW = width - MARGIN * 2;
    const rowH = 22;
    const rows: [string, string][] = [
        ["Nombre del colaborador", String(data.solicitanteNombre || "—")],
        ["Puesto", String(data.solicitantePuesto || "—")],
        ["Días solicitados", String(data.diasVacaciones ?? "—")],
        ["Periodo", `${formatFechaCorta(String(data.fechaInicio || ""))} al ${formatFechaCorta(String(data.fechaFin || ""))}`],
        ["Fecha de solicitud", formatFechaCorta(String(data.fechaSolicitud || ""))],
    ];

    const tableH = rowH * (rows.length + 1);
    const tableY = yTop - tableH;

    page.drawText("Datos del colaborador", {
        x: tableX,
        y: yTop + 6,
        size: 10,
        font: fontBold,
        color: AG_BLUE,
    });

    page.drawRectangle({
        x: tableX,
        y: tableY,
        width: tableW,
        height: tableH,
        borderColor: BORDER,
        borderWidth: 1,
    });

    page.drawRectangle({
        x: tableX,
        y: tableY + tableH - rowH,
        width: tableW,
        height: rowH,
        color: AG_BLUE,
    });
    page.drawText("Concepto", {
        x: tableX + 10,
        y: tableY + tableH - rowH + 7,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
    });
    page.drawText("Detalle", {
        x: tableX + tableW * 0.38,
        y: tableY + tableH - rowH + 7,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    let rowY = tableY + tableH - rowH * 2;
    for (let i = 0; i < rows.length; i++) {
        if (i % 2 === 0) {
            page.drawRectangle({
                x: tableX + 0.5,
                y: rowY,
                width: tableW - 1,
                height: rowH,
                color: ROW_ALT,
            });
        }
        page.drawText(rows[i][0], {
            x: tableX + 10,
            y: rowY + 7,
            size: 8.5,
            font: fontBold,
            color: TEXT_MUTED,
        });
        const val = rows[i][1];
        const valLines = wrapText(val, 48);
        page.drawText(valLines[0], {
            x: tableX + tableW * 0.38,
            y: rowY + 7,
            size: 9,
            font: i === 0 ? fontBold : font,
            color: TEXT,
        });
        rowY -= rowH;
    }

    return tableY - 20;
}

function drawBodyText(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    yStart: number,
    data: FirebaseFirestore.DocumentData,
): number {
    const { width } = page.getSize();
    const boxX = MARGIN;
    const boxW = width - MARGIN * 2;
    const pad = 14;
    const dias = data.diasVacaciones ?? "—";
    const inicioTxt = formatFechaLarga(String(data.fechaInicio || ""));
    const finTxt = formatFechaLarga(String(data.fechaFin || ""));

    const parrafos = [
        "A QUIEN CORRESPONDA:",
        "",
        `Por medio del presente solicito el goce de ${dias} día(s) de vacaciones, del ${inicioTxt} al ${finTxt}, conforme a los días que me corresponden según la Ley Federal del Trabajo.`,
        "",
        "Manifiesto haber tomado las medidas necesarias para el cumplimiento de mis responsabilidades y la cobertura del área en la que laboro, informando con la debida antelación para los ajustes que la empresa requiera.",
    ];

    let contentH = pad * 2;
    const lines: { text: string; bold: boolean }[] = [];
    for (const p of parrafos) {
        if (!p) {
            contentH += 6;
            continue;
        }
        const isSaludo = p.startsWith("A QUIEN");
        for (const wl of wrapText(p, 78)) {
            lines.push({ text: wl, bold: isSaludo });
            contentH += 13;
        }
    }

    const comentario = String(data.comentarioSolicitante || "").trim();
    if (comentario) {
        contentH += 8;
        for (const wl of wrapText(`Observaciones: ${comentario}`, 76)) {
            lines.push({ text: wl, bold: false });
            contentH += 13;
        }
    }

    const boxH = contentH + 6;
    const boxY = yStart - boxH;

    page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        borderColor: BORDER,
        borderWidth: 0.75,
        color: rgb(1, 1, 1),
    });

    let y = yStart - pad - 10;
    for (const ln of lines) {
        page.drawText(ln.text, {
            x: boxX + pad,
            y,
            size: ln.bold ? 10 : 9.5,
            font: ln.bold ? fontBold : font,
            color: TEXT,
        });
        y -= 13;
    }

    return boxY - 22;
}

function drawSignatureBlock(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    y: number,
    data: FirebaseFirestore.DocumentData,
): number {
    page.drawText("Atentamente", {
        x: MARGIN,
        y,
        size: 10,
        font: fontBold,
        color: TEXT,
    });
    y -= 40;

    const sigW = 220;
    page.drawLine({
        start: { x: MARGIN, y: y + 6 },
        end: { x: MARGIN + sigW, y: y + 6 },
        thickness: 1,
        color: AG_BLUE,
    });
    page.drawText(String(data.solicitanteNombre || "—"), {
        x: MARGIN,
        y: y - 12,
        size: 11,
        font: fontBold,
        color: TEXT,
    });
    page.drawText(String(data.solicitantePuesto || "Solicitante"), {
        x: MARGIN,
        y: y - 26,
        size: 9,
        font,
        color: TEXT_MUTED,
    });
    page.drawText("Firma del solicitante", {
        x: MARGIN,
        y: y - 40,
        size: 7.5,
        font,
        color: TEXT_MUTED,
    });

    return y - 58;
}

function drawAuthTable(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    y: number,
    data: FirebaseFirestore.DocumentData,
): number {
    const { width } = page.getSize();
    const tableX = MARGIN;
    const tableW = width - MARGIN * 2;
    const col1 = 128;
    const col2 = tableW - col1 - 78;
    const rowH = 28;
    const headerH = 24;

    const aprob = (data.aprobaciones || {}) as Record<
        string,
        { nombre?: string; fecha?: string }
    >;
    const flujo = inferFlowType(data);
    const rows =
        flujo === "calidad"
            ? [{ label: "Jefe inmediato", key: "jorge" }]
            : [
                  { label: "Calidad", key: "calidad" },
                  { label: "Autorización intermedia", key: "edgar" },
                  { label: "Jefe inmediato", key: "jorge" },
              ];

    const tableH = headerH + rows.length * rowH;
    const tableY = y - tableH;

    page.drawText("Cadena de autorización", {
        x: tableX,
        y: y + 6,
        size: 10,
        font: fontBold,
        color: AG_BLUE,
    });

    page.drawRectangle({
        x: tableX,
        y: tableY,
        width: tableW,
        height: tableH,
        borderColor: BORDER,
        borderWidth: 1,
    });

    page.drawRectangle({
        x: tableX,
        y: tableY + tableH - headerH,
        width: tableW,
        height: headerH,
        color: AG_BLUE_DARK,
    });

    const headers = ["Área / nivel", "Autorizó", "Fecha"];
    let hx = tableX + 8;
    page.drawText(headers[0], {
        x: hx,
        y: tableY + tableH - headerH + 8,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1),
    });
    hx = tableX + col1 + 8;
    page.drawText(headers[1], { x: hx, y: tableY + tableH - headerH + 8, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    hx = tableX + col1 + col2 + 8;
    page.drawText(headers[2], { x: hx, y: tableY + tableH - headerH + 8, size: 8, font: fontBold, color: rgb(1, 1, 1) });

    page.drawLine({
        start: { x: tableX + col1, y: tableY },
        end: { x: tableX + col1, y: tableY + tableH },
        thickness: 0.5,
        color: BORDER,
    });
    page.drawLine({
        start: { x: tableX + col1 + col2, y: tableY },
        end: { x: tableX + col1 + col2, y: tableY + tableH },
        thickness: 0.5,
        color: BORDER,
    });

    let rowY = tableY + tableH - headerH - rowH;
    for (let i = 0; i < rows.length; i++) {
        const rec = aprob[rows[i].key];
        const ok = Boolean(rec?.nombre);
        if (i > 0) {
            page.drawLine({
                start: { x: tableX, y: rowY + rowH },
                end: { x: tableX + tableW, y: rowY + rowH },
                thickness: 0.5,
                color: BORDER,
            });
        }
        if (i % 2 === 0) {
            page.drawRectangle({
                x: tableX + 0.5,
                y: rowY,
                width: tableW - 1,
                height: rowH,
                color: ROW_ALT,
            });
        }
        page.drawText(rows[i].label, {
            x: tableX + 8,
            y: rowY + 10,
            size: 8.5,
            font: fontBold,
            color: TEXT,
        });
        page.drawText(rec?.nombre || "Pendiente", {
            x: tableX + col1 + 8,
            y: rowY + 10,
            size: 9,
            font: ok ? fontBold : font,
            color: ok ? TEXT : TEXT_MUTED,
        });
        page.drawText(rec?.fecha ? formatFechaCorta(rec.fecha) : "—", {
            x: tableX + col1 + col2 + 8,
            y: rowY + 10,
            size: 9,
            font,
            color: TEXT_MUTED,
        });
        if (ok) {
            page.drawText("✓", {
                x: tableX + col1 + col2 - 14,
                y: rowY + 10,
                size: 10,
                font: fontBold,
                color: rgb(0.12, 0.55, 0.35),
            });
        }
        rowY -= rowH;
    }

    return tableY - 8;
}

function drawApprovedStamp(page: PDFPage, fontBold: PDFFont) {
    const { width, height } = page.getSize();
    const stamp = "APROBADO";
    const size = 42;
    const w = fontBold.widthOfTextAtSize(stamp, size);
    const x = width - MARGIN - w - 20;
    const y = height * 0.38;
    page.drawRectangle({
        x: x - 12,
        y: y - 8,
        width: w + 24,
        height: size + 16,
        borderColor: rgb(0.12, 0.55, 0.35),
        borderWidth: 2,
        color: rgb(0.94, 0.99, 0.96),
        opacity: 0.85,
    });
    page.drawText(stamp, {
        x,
        y,
        size,
        font: fontBold,
        color: rgb(0.1, 0.5, 0.32),
        opacity: 0.35,
    });
}

function drawFooter(page: PDFPage, font: PDFFont) {
    const { width } = page.getSize();
    page.drawLine({
        start: { x: MARGIN, y: 40 },
        end: { x: width - MARGIN, y: 40 },
        thickness: 0.5,
        color: BORDER,
    });
    const foot =
        "Documento generado electrónicamente · Equipos y Servicios Especializados AG · AG-ADM-F12";
    const fw = font.widthOfTextAtSize(foot, 7);
    page.drawText(foot, {
        x: (width - fw) / 2,
        y: 26,
        size: 7,
        font,
        color: TEXT_MUTED,
    });
}

/** PDF AG-ADM-F12 — formato corporativo (servidor). */
export async function buildVacationPdfBuffer(
    data: FirebaseFirestore.DocumentData,
): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const { height } = page.getSize();

    let logoImg = null;
    const logoBytes = loadLogoBytes();
    if (logoBytes) {
        try {
            logoImg = await pdfDoc.embedPng(logoBytes);
        } catch (e) {
            console.warn("Logo vacaciones no embebido:", e);
        }
    }

    drawHeader(page, font, fontBold, logoImg);

    let y = height - 96 - 28;
    y = drawTitleBlock(page, fontBold, y);
    y = drawDataGrid(page, font, fontBold, y, data);
    y = drawBodyText(page, font, fontBold, y, data);
    y = drawSignatureBlock(page, font, fontBold, y, data);
    drawAuthTable(page, font, fontBold, y, data);

    if (String(data.estado || "") === "aprobada") {
        drawApprovedStamp(page, fontBold);
    }

    drawFooter(page, font);

    return Buffer.from(await pdfDoc.save());
}
