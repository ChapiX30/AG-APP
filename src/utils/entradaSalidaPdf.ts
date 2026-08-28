import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { saveAs } from 'file-saver';
import labLogo from '../assets/lab_logo.png';
import {
  planSalidaPdfPages,
} from './entradaSalidaPdfLogic';

export type SalidaPdfItem = {
  descripcion: string;
  marca: string;
  modelo: string;
  serie: string;
  idInterno: string;
  certificado: string;
  cliente: string;
  ordenCompra: string;
};

const PAGE_W = 612;
const PAGE_H = 792;
const BLUE = rgb(0.141, 0.392, 0.639);
const LIGHT = rgb(0.91, 0.941, 0.969);
const CUT_BG = rgb(0.957, 0.969, 0.984);
const RED = rgb(0.69, 0, 0);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.18, 0.18, 0.18);

function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  const raw = String(text ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').trim();
  if (!raw) return '';
  if (font.widthOfTextAtSize(raw, size) <= maxW) return raw;
  let t = raw;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxW) {
    t = t.slice(0, -1);
  }
  return `${t}...`;
}

type DrawArgs = {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  logo: PDFImage | null;
  cliente: string;
  oc: string;
  folio: string;
  fecha: string;
  copyLabel: string;
  pageLabel: string;
  summary: string;
  items: Array<SalidaPdfItem | undefined>;
  startNo: number;
  rowCount: number;
  pageIndex: number;
  contentPages: number;
  isLast: boolean;
  compact: boolean;
  box: { left: number; right: number; top: number; height: number };
};

function drawForm(args: DrawArgs) {
  const {
    page, font, fontBold, logo, cliente, oc, folio, fecha,
    copyLabel, pageLabel, summary, items, startNo, rowCount, pageIndex, contentPages, isLast, compact, box,
  } = args;
  const left = box.left;
  const right = box.right;
  const width = right - left;
  const bottom = box.top - box.height;
  const barH = compact ? 34 : 40;
  const copyH = compact ? 14 : 18;
  const infoH = compact ? 26 : 30;
  const footerH = isLast ? (compact ? 46 : 58) : (compact ? 24 : 30);
  const gap = compact ? 5 : 7;

  let y = box.top;

  page.drawRectangle({
    x: left, y: y - barH, width, height: barH, color: BLUE,
  });

  let textLeft = left + 8;
  if (logo) {
    const maxH = compact ? 22 : 28;
    const maxW = compact ? 36 : 44;
    const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const imgY = y - barH + (barH - h) / 2;
    page.drawRectangle({
      x: left + 4, y: imgY - 1.5, width: w + 6, height: h + 3, color: rgb(1, 1, 1),
    });
    page.drawImage(logo, { x: left + 7, y: imgY, width: w, height: h });
    textLeft = left + w + 16;
  }

  const sideW = 78;
  page.drawText('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.', {
    x: textLeft,
    y: y - (compact ? 12 : 14),
    size: compact ? 6 : 6.5,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('HOJA DE ENTRADA Y SALIDA DE EQUIPOS', {
    x: textLeft,
    y: y - (compact ? 24 : 28),
    size: compact ? 8.5 : 10,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText('AG-CAL-F28-00', {
    x: right - sideW,
    y: y - (compact ? 12 : 14),
    size: 7,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`Pag. ${pageLabel}`, {
    x: right - sideW,
    y: y - (compact ? 24 : 28),
    size: 7,
    font,
    color: rgb(1, 1, 1),
  });

  y -= barH;
  page.drawRectangle({
    x: left, y: y - copyH, width, height: copyH, color: LIGHT,
    borderColor: BLUE, borderWidth: 0.6,
  });
  page.drawText(copyLabel.toUpperCase(), {
    x: left + 8, y: y - copyH + 4, size: compact ? 6.5 : 7.5, font: fontBold, color: BLUE,
  });
  const sum = fitText(summary, fontBold, compact ? 6.5 : 7.5, width * 0.48);
  page.drawText(sum, {
    x: right - 8 - fontBold.widthOfTextAtSize(sum, compact ? 6.5 : 7.5),
    y: y - copyH + 4,
    size: compact ? 6.5 : 7.5,
    font: fontBold,
    color: BLUE,
  });

  y -= copyH;
  const colsInfo = [
    { k: 'CLIENTE', v: cliente, w: width * 0.46 },
    { k: 'OC', v: oc || 'N/A', w: width * 0.16 },
    { k: 'FECHA', v: fecha, w: width * 0.18 },
    { k: 'FOLIO', v: folio, w: width * 0.2 },
  ];
  page.drawRectangle({
    x: left, y: y - infoH, width, height: infoH,
    borderColor: LINE, borderWidth: 0.5,
  });
  let ix = left;
  colsInfo.forEach((c, i) => {
    if (i > 0) {
      page.drawLine({
        start: { x: ix, y: y },
        end: { x: ix, y: y - infoH },
        thickness: 0.4,
        color: rgb(0.75, 0.75, 0.75),
      });
    }
    page.drawText(c.k, {
      x: ix + 5, y: y - 9, size: 5.5, font: fontBold, color: MUTED,
    });
    const valSize = c.k === 'FOLIO' ? 10 : 8;
    const valColor = c.k === 'FOLIO' ? RED : INK;
    page.drawText(fitText(c.v, fontBold, valSize, c.w - 10), {
      x: ix + 5, y: y - 21, size: valSize, font: fontBold, color: valColor,
    });
    ix += c.w;
  });

  y -= infoH + gap;
  const tableBottom = bottom + footerH + gap;
  const tableH = Math.max(40, y - tableBottom);
  const headH = compact ? 13 : 16;
  const rowH = (tableH - headH) / rowCount;

  const colW = {
    no: 28,
    marca: compact ? 70 : 78,
    mod: compact ? 66 : 72,
    ser: compact ? 70 : 78,
    id: compact ? 50 : 54,
    cert: compact ? 74 : 82,
  };
  const descW = width - colW.no - colW.marca - colW.mod - colW.ser - colW.id - colW.cert;
  const colX = [
    left,
    left + colW.no,
    left + colW.no + descW,
    left + colW.no + descW + colW.marca,
    left + colW.no + descW + colW.marca + colW.mod,
    left + colW.no + descW + colW.marca + colW.mod + colW.ser,
    left + colW.no + descW + colW.marca + colW.mod + colW.ser + colW.id,
  ];
  const headers = ['NO.', 'DESCRIPCION', 'MARCA', 'MODELO', 'SERIE', 'ID', 'CERTIFICADO'];

  page.drawRectangle({
    x: left, y: y - headH, width, height: headH, color: BLUE,
  });
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: colX[i] + 3, y: y - headH + 4, size: compact ? 6 : 6.5, font: fontBold, color: rgb(1, 1, 1),
    });
  });

  let ry = y - headH;
  for (let i = 0; i < rowCount; i++) {
    ry -= rowH;
    page.drawRectangle({
      x: left, y: ry, width, height: rowH,
      borderColor: LINE, borderWidth: 0.45,
    });
    colX.slice(1).forEach((vx) => {
      page.drawLine({
        start: { x: vx, y: ry },
        end: { x: vx, y: ry + rowH },
        thickness: 0.45,
        color: LINE,
      });
    });
    const it = items[i];
    const ty = ry + Math.max(3, (rowH - 7) / 2);
    const no = String(startNo + i).padStart(2, '0');
    page.drawText(no, {
      x: colX[0] + 6, y: ty, size: compact ? 7 : 7.5, font, color: MUTED,
    });
    if (it) {
      const cells: Array<[string, number, number]> = [
        [it.descripcion, colX[1], descW],
        [it.marca, colX[2], colW.marca],
        [it.modelo, colX[3], colW.mod],
        [it.serie, colX[4], colW.ser],
        [it.idInterno, colX[5], colW.id],
        [it.certificado, colX[6], colW.cert],
      ];
      cells.forEach(([val, x, w]) => {
        page.drawText(fitText(val, font, compact ? 7 : 7.5, w - 6), {
          x: x + 3, y: ty, size: compact ? 7 : 7.5, font, color: INK,
        });
      });
    }
  }
  page.drawRectangle({
    x: left, y: ry, width, height: y - ry,
    borderColor: LINE, borderWidth: 0.6,
  });

  const fy = bottom + footerH;
  if (isLast) {
    const boxW = (width - 8) / 2;
    const boxes = [
      { x: left, title: 'ENTREGO', sub: 'Nombre y firma - Laboratorio' },
      { x: left + boxW + 8, title: 'RECIBIO', sub: 'Nombre y firma - Cliente' },
    ];
    boxes.forEach((b) => {
      page.drawRectangle({
        x: b.x, y: bottom, width: boxW, height: footerH,
        borderColor: LINE, borderWidth: 0.6,
      });
      page.drawText(b.title, {
        x: b.x + 7, y: fy - 12, size: compact ? 6.5 : 7.5, font: fontBold, color: BLUE,
      });
      page.drawLine({
        start: { x: b.x + 8, y: bottom + 14 },
        end: { x: b.x + boxW - 8, y: bottom + 14 },
        thickness: 0.5,
        color: LINE,
      });
      page.drawText(b.sub, {
        x: b.x + 7, y: bottom + 5, size: 5.5, font, color: MUTED,
      });
    });
  } else {
    page.drawRectangle({
      x: left, y: bottom, width, height: footerH,
      color: LIGHT, borderColor: BLUE, borderWidth: 0.6,
    });
    const msg = `Continua en hoja ${pageIndex + 2} de ${contentPages} - no firmar esta hoja`;
    const size = compact ? 7 : 8.5;
    const tw = fontBold.widthOfTextAtSize(msg, size);
    page.drawText(msg, {
      x: left + (width - tw) / 2,
      y: bottom + footerH / 2 - 3,
      size,
      font: fontBold,
      color: BLUE,
    });
  }
}

function drawCut(page: PDFPage, fontBold: PDFFont) {
  const y = PAGE_H / 2;
  page.drawRectangle({
    x: 18, y: y - 12, width: PAGE_W - 36, height: 24, color: CUT_BG,
  });
  page.drawLine({
    start: { x: 18, y },
    end: { x: PAGE_W - 18, y },
    thickness: 0.8,
    color: BLUE,
    dashArray: [4, 3],
  });
  const label = 'CORTAR AQUI';
  const size = 7;
  const tw = fontBold.widthOfTextAtSize(label, size);
  page.drawRectangle({
    x: (PAGE_W - tw) / 2 - 8, y: y - 6, width: tw + 16, height: 12, color: CUT_BG,
  });
  page.drawText(label, {
    x: (PAGE_W - tw) / 2, y: y - 3, size, font: fontBold, color: BLUE,
  });
}

export async function generateEntradaSalidaPdf(opts: {
  items: SalidaPdfItem[];
  folio: string;
  esParcial?: boolean;
}): Promise<void> {
  const { items, folio, esParcial = false } = opts;
  const cliente = items[0]?.cliente || 'Sin cliente';
  const oc = items[0]?.ordenCompra || '';
  const fecha = new Date().toLocaleDateString('es-MX');
  const plan = planSalidaPdfPages(cliente, items.length);
  const estado = esParcial ? 'salida parcial' : 'salida completa';

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    const logoBytes = await fetch(labLogo).then((res) => res.arrayBuffer());
    logo = await pdfDoc.embedPng(logoBytes);
  } catch (e) {
    console.warn('No se pudo cargar el logo para PDF', e);
  }

  const copies = plan.fullPage
    ? (['Original - Cliente', 'Copia - Laboratorio'] as const)
    : (['split'] as const);

  for (const copy of copies) {
    for (let pageIndex = 0; pageIndex < plan.contentPages; pageIndex++) {
      const start = pageIndex * plan.rowsPerPage;
      const slice = items.slice(start, start + plan.rowsPerPage);
      const padded: Array<SalidaPdfItem | undefined> = [
        ...slice,
        ...Array.from({ length: plan.rowsPerPage - slice.length }, () => undefined),
      ];
      const from = start + 1;
      const to = start + slice.length;
      const summary = `${items.length} equipos · ${from}-${to} de ${items.length} · ${estado}`;
      const pageLabel = `${pageIndex + 1}/${plan.contentPages}`;
      const isLast = pageIndex === plan.contentPages - 1;
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

      const common = {
        page, font, fontBold, logo, cliente, oc, folio, fecha,
        pageLabel, summary, items: padded, startNo: start + 1,
        rowCount: plan.rowsPerPage, pageIndex, contentPages: plan.contentPages, isLast,
      };

      if (copy === 'split') {
        drawForm({
          ...common,
          copyLabel: 'Original - Cliente',
          compact: true,
          box: { left: 18, right: PAGE_W - 18, top: PAGE_H - 14, height: 360 },
        });
        drawCut(page, fontBold);
        drawForm({
          ...common,
          copyLabel: 'Copia - Laboratorio',
          compact: true,
          box: { left: 18, right: PAGE_W - 18, top: 374, height: 360 },
        });
      } else {
        drawForm({
          ...common,
          copyLabel: copy,
          compact: false,
          box: { left: 18, right: PAGE_W - 18, top: PAGE_H - 16, height: PAGE_H - 32 },
        });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `Salida_${folio}.pdf`);
}
