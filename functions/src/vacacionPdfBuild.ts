import * as fs from "fs";
import * as path from "path";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const AG_BLUE = rgb(36 / 255, 100 / 255, 163 / 255);
const AG_BLUE_LIGHT = rgb(0.92, 0.96, 0.99);
const TEXT = rgb(0.12, 0.14, 0.18);
const TEXT_MUTED = rgb(0.42, 0.45, 0.5);
const BORDER = rgb(0.82, 0.86, 0.9);

function loadLogoBytes(): Uint8Array | null {
    const candidates = [
        path.join(__dirname, "../assets/lab_logo.png"),
        path.join(__dirname, "../../assets/lab_logo.png"),
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

function formatFechaLarga(isoDate: string): { dia: string; mes: string; anio: string } {
    try {
        const d = parseISO(isoDate);
        return {
            dia: format(d, "d"),
            mes: format(d, "MMMM", { locale: es }).toUpperCase(),
            anio: format(d, "yyyy"),
        };
    } catch {
        return { dia: "—", mes: "—", anio: "—" };
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

function drawHeaderBand(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    logoImg: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
) {
    const { width, height } = page.getSize();
    const bandH = 88;

    page.drawRectangle({
        x: 0,
        y: height - bandH,
        width,
        height: bandH,
        color: AG_BLUE_LIGHT,
    });
    page.drawRectangle({
        x: 0,
        y: height - 4,
        width,
        height: 4,
        color: AG_BLUE,
    });

    const logoX = MARGIN;
    const logoY = height - bandH + 18;
    if (logoImg) {
        const maxW = 118;
        const maxH = 52;
        const scale = Math.min(maxW / logoImg.width, maxH / logoImg.height, 1);
        const w = logoImg.width * scale;
        const h = logoImg.height * scale;
        page.drawImage(logoImg, { x: logoX, y: logoY, width: w, height: h });
    }

    const textX = logoImg ? MARGIN + 128 : MARGIN;
    const textBaseY = height - 32;
    page.drawText("EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.", {
        x: textX,
        y: textBaseY,
        size: 11,
        font: fontBold,
        color: AG_BLUE,
    });
    page.drawText("Departamento de Recursos Humanos", {
        x: textX,
        y: textBaseY - 16,
        size: 9,
        font,
        color: TEXT_MUTED,
    });

    const codigo = "AG-ADM-F12-00";
    const codigoW = font.widthOfTextAtSize(codigo, 8);
    page.drawRectangle({
        x: width - MARGIN - codigoW - 16,
        y: height - bandH + 22,
        width: codigoW + 16,
        height: 20,
        borderColor: AG_BLUE,
        borderWidth: 0.75,
        color: rgb(1, 1, 1),
    });
    page.drawText(codigo, {
        x: width - MARGIN - codigoW - 8,
        y: height - bandH + 28,
        size: 8,
        font: fontBold,
        color: AG_BLUE,
    });
}

function drawTitle(page: PDFPage, fontBold: PDFFont, y: number): number {
    const { width } = page.getSize();
    const titulo = "SOLICITUD DE VACACIONES";
    const size = 15;
    const w = fontBold.widthOfTextAtSize(titulo, size);
    const x = (width - w) / 2;
    page.drawText(titulo, { x, y, size, font: fontBold, color: TEXT });
    page.drawLine({
        start: { x: MARGIN + 40, y: y - 8 },
        end: { x: width - MARGIN - 40, y: y - 8 },
        thickness: 1.2,
        color: AG_BLUE,
    });
    return y - 28;
}

function drawBodyBox(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    yStart: number,
    data: FirebaseFirestore.DocumentData,
): number {
    const { width } = page.getSize();
    const boxX = MARGIN;
    const boxW = width - MARGIN * 2;
    const pad = 16;

    const inicio = formatFechaLarga(String(data.fechaInicio || ""));
    const fin = formatFechaLarga(String(data.fechaFin || ""));
    const dias = data.diasVacaciones ?? "—";

    const parrafos = [
        "A QUIEN CORRESPONDA:",
        "",
        `Por medio del presente solicito ${dias} día(s) de vacaciones, los cuales se harán efectivos del día ${inicio.dia} al día ${fin.dia} de ${fin.mes} del año ${fin.anio}.`,
        "",
        "Estos días se tomarán de los que me corresponden según la Ley Federal del Trabajo.",
        "",
        "He tomado las medidas necesarias para cumplir con mis responsabilidades y se cubra el área donde laboro. Así mismo informo con la debida antelación a fin de que se realicen los cambios o ajustes necesarios para el buen funcionamiento de la empresa.",
    ];

    let contentH = pad * 2;
    const lines: { text: string; bold: boolean; size: number }[] = [];
    for (const p of parrafos) {
        if (!p) {
            contentH += 8;
            continue;
        }
        const isSaludo = p.startsWith("A QUIEN");
        const wrapped = wrapText(p, 82);
        for (const wl of wrapped) {
            lines.push({ text: wl, bold: isSaludo, size: isSaludo ? 10 : 10 });
            contentH += 14;
        }
    }

    const boxH = contentH + 8;
    const boxY = yStart - boxH;

    page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        borderColor: BORDER,
        borderWidth: 1,
        color: rgb(1, 1, 1),
    });

    let y = yStart - pad - 12;
    for (const ln of lines) {
        page.drawText(ln.text, {
            x: boxX + pad,
            y,
            size: ln.size,
            font: ln.bold ? fontBold : font,
            color: TEXT,
        });
        y -= 14;
    }

    return boxY - 24;
}

function drawSignatureBlock(
    page: PDFPage,
    font: PDFFont,
    fontBold: PDFFont,
    y: number,
    data: FirebaseFirestore.DocumentData,
): number {
    const { width } = page.getSize();

    page.drawText("Atentamente", {
        x: MARGIN,
        y,
        size: 10,
        font: fontBold,
        color: TEXT,
    });
    y -= 36;

    const sigW = 240;
    page.drawLine({
        start: { x: MARGIN, y: y + 4 },
        end: { x: MARGIN + sigW, y: y + 4 },
        thickness: 0.75,
        color: AG_BLUE,
    });
    page.drawText(String(data.solicitanteNombre || "—"), {
        x: MARGIN,
        y: y - 14,
        size: 11,
        font: fontBold,
        color: TEXT,
    });
    page.drawText(String(data.solicitantePuesto || "Solicitante"), {
        x: MARGIN,
        y: y - 28,
        size: 9,
        font,
        color: TEXT_MUTED,
    });

    const fechaSol = formatFechaLarga(String(data.fechaSolicitud || ""));
    const fechaTxt = `${fechaSol.dia} de ${fechaSol.mes.charAt(0) + fechaSol.mes.slice(1).toLowerCase()} del ${fechaSol.anio}`;
    const fechaLabel = "Fecha de solicitud:";
    page.drawText(fechaLabel, {
        x: width - MARGIN - 160,
        y: y - 4,
        size: 8,
        font: fontBold,
        color: TEXT_MUTED,
    });
    page.drawText(fechaTxt, {
        x: width - MARGIN - 160,
        y: y - 18,
        size: 9,
        font,
        color: TEXT,
    });

    return y - 52;
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
    const col1 = 130;
    const col2 = tableW - col1 - 72;
    const rowH = 26;
    const headerH = 22;

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

    const tableH = headerH + rows.length * rowH + 4;
    const tableY = y - tableH;

    page.drawText("Autorizaciones", {
        x: tableX,
        y: y + 4,
        size: 11,
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
        color: AG_BLUE,
    });

    const headers = ["Área", "Nombre", "Fecha"];
    let hx = tableX + 8;
    page.drawText(headers[0], { x: hx, y: tableY + tableH - headerH + 7, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    hx = tableX + col1 + 8;
    page.drawText(headers[1], { x: hx, y: tableY + tableH - headerH + 7, size: 8, font: fontBold, color: rgb(1, 1, 1) });
    hx = tableX + col1 + col2 + 8;
    page.drawText(headers[2], { x: hx, y: tableY + tableH - headerH + 7, size: 8, font: fontBold, color: rgb(1, 1, 1) });

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
        if (i > 0) {
            page.drawLine({
                start: { x: tableX, y: rowY + rowH },
                end: { x: tableX + tableW, y: rowY + rowH },
                thickness: 0.5,
                color: BORDER,
            });
        }
        page.drawText(rows[i].label, {
            x: tableX + 8,
            y: rowY + 9,
            size: 9,
            font: fontBold,
            color: TEXT,
        });
        page.drawText(rec?.nombre || "—", {
            x: tableX + col1 + 8,
            y: rowY + 9,
            size: 9,
            font,
            color: TEXT,
        });
        page.drawText(rec?.fecha ? formatFechaCorta(rec.fecha) : "—", {
            x: tableX + col1 + col2 + 8,
            y: rowY + 9,
            size: 9,
            font,
            color: TEXT_MUTED,
        });
        rowY -= rowH;
    }

    return tableY - 12;
}

function drawFooter(page: PDFPage, font: PDFFont) {
    const { width } = page.getSize();
    page.drawLine({
        start: { x: MARGIN, y: 36 },
        end: { x: width - MARGIN, y: 36 },
        thickness: 0.5,
        color: BORDER,
    });
    const foot = "Documento generado electrónicamente · Equipos y Servicios AG";
    const fw = font.widthOfTextAtSize(foot, 7);
    page.drawText(foot, {
        x: (width - fw) / 2,
        y: 22,
        size: 7,
        font,
        color: TEXT_MUTED,
    });
}

/** PDF AG-ADM-F12 — diseño corporativo con logo (servidor). */
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

    drawHeaderBand(page, font, fontBold, logoImg);

    let y = height - 88 - 24;
    y = drawTitle(page, fontBold, y);
    y = drawBodyBox(page, font, fontBold, y, data);
    y = drawSignatureBlock(page, font, fontBold, y, data);
    drawAuthTable(page, font, fontBold, y, data);
    drawFooter(page, font);

    const comentario = String(data.comentarioSolicitante || "").trim();
    if (comentario) {
        /* espacio reservado; comentarios largos en futura versión multipágina */
    }

    return Buffer.from(await pdfDoc.save());
}
