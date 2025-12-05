import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { differenceInDays, parseISO } from 'date-fns'; 
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
import { 
  ArrowLeft, User, Package, Plus, Loader2, AlertTriangle, 
  Camera, X, Save, FileText, CheckCircle2, AlertCircle, Briefcase 
} from 'lucide-react'; 
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

// ==================================================================
// --- 1. CONFIGURACIÓN Y UTILIDADES (Fuera del Componente) ---
// ==================================================================

const COLLECTION_NAME_PATRONES = "patronesCalibracion"; 

// Interfaces
interface PatronBase {
    id: string; 
    noControl: string; 
    nombre: string; 
    marca: string;
    modelo: string;
    serie: string;
    fechaVencimiento: string;
    status: 'vigente' | 'vencido' | 'critico' | 'proximo' | 'pendiente'; 
    estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio' | 'en_prestamo' | 'en_servicio' | 'en_mantenimiento'; 
    usuarioEnUso?: string; 
}

type ToolItem = {
  herramienta: string;
  qty: string | number;
  marca: string;
  modelo: string;
  serie: string;
  estadoProceso?: PatronBase['estadoProceso']; 
};

type FormInputs = {
  fecha: string;
  usuario: string;
  gafeteContratista: string;
  companiaDepto: string;
  noEmpleado: string;
  selectedBackpacks: string[];
  manualTools: ToolItem & { isVencida?: boolean, isUnavailable?: boolean }[]; 
};

// Datos Estáticos (Catalogos)
const BACKPACK_CATALOG = {
  mochila_abraham: {
    nombre: 'Mochila 1 (Abraham)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017166' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700459' },
    ],
  },
  mochila_Dante: {
    nombre: 'Mochila 2 (Dante)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVEPNEU0017947' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X1Y00150' },
    ],
  },
  mochila_Angel: {
    nombre: 'Mochila 3 (Angel)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700130' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700192' },
    ],
  },
  mochila_Edgar: {
    nombre: 'Mochila 4 (Edgar)',
    items: [
      { herramienta: 'Desarmador Plano', qty: "1", marca: 'Urrea', modelo: 'S/M', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '8"', serie: 'N/A' },
      { herramienta: 'Destornillador ESD', qty: "4", marca: 'Urrea', modelo: 'S/M', serie: 'Sm' },
      { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700191' },
      { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700114' },
    ],
  },
  mochila_Daniel: {
    nombre: 'Mochila 5 (Daniel)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'Pretul', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'Urrea', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Rojo', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Verde', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Gris', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0023514' },
      { herramienta: 'Cepillo', qty: "2", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, 
    ],
  },
  mochila_Ricardo: {
    nombre: 'Mochila 6 (Ricardo)',
    items: [
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' },
      { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' },
      { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' },
      { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' },
      { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' },
      { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017933' },
    ],
 }
};

// --- Helpers de Negocio ---

const getVencimientoStatus = (fecha: string): PatronBase['status'] => {
    if (!fecha || fecha === 'Por Comprar' || fecha === '') return 'pendiente';
    try {
        const dias = differenceInDays(parseISO(fecha), new Date());
        if (dias < 0) return 'vencido';
        if (dias >= 0 && dias <= 7) return 'critico';
        if (dias > 7 && dias <= 30) return 'proximo';
        return 'vigente';
    } catch (error) { return 'pendiente'; }
};

function aggregateTools(backpackIds: string[]): ToolItem[] {
  const aggregator = new Map<string, ToolItem>();
  for (const id of backpackIds) {
    const backpack = BACKPACK_CATALOG[id as keyof typeof BACKPACK_CATALOG];
    if (!backpack) continue;
    for (const item of backpack.items) {
      const cleanTool = item.herramienta.trim();
      const cleanMarca = item.marca.trim();
      const cleanModelo = item.modelo.trim();
      const cleanSerie = item.serie.trim();
      const key = `${cleanTool}|${cleanMarca}|${cleanModelo}|${cleanSerie}`;
      if (aggregator.has(key)) {
        const existing = aggregator.get(key)!;
        const newQty = (Number(existing.qty) || 0) + (Number(item.qty) || 0);
        existing.qty = String(newQty); 
      } else {
        aggregator.set(key, { 
            herramienta: cleanTool, marca: cleanMarca, modelo: cleanModelo, serie: cleanSerie, qty: String(item.qty) 
        });
      }
    }
  }
  return Array.from(aggregator.values());
}

const cleanToolNameForPdf = (name: string): string => {
  if (!name) return '';
  const regexAg = /^AG-\d+\s+-\s+/; 
  if (regexAg.test(name)) return name.replace(regexAg, '');
  const regexAsterisk = /^\*+\s*-\s+/;
  if (regexAsterisk.test(name)) return name.replace(regexAsterisk, '');
  return name;
};

// --- Generadores de PDF (Simplificados para no saturar) ---
const MAX_ITEMS_CELESTICA_PDF = 30;

async function generateCelesticaPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const templateUrl = '/template.pdf'; 
    const existingPdfBytes = await fetch(templateUrl).then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const firstPage = pdfDoc.getPages()[0];
    const { height } = firstPage.getSize();
    const fontSize = 9;
    const color = rgb(0, 0, 0);

    firstPage.drawText(data.fecha, { x: 60, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.usuario,           { x: 320, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.gafeteContratista, { x: 490, y: height - 80, size: fontSize, font, color });
    firstPage.drawText(data.companiaDepto,     { x: 320, y: height - 114, size: fontSize, font, color });
    firstPage.drawText(data.noEmpleado,        { x: 500, y: height - 114, size: fontSize, font, color });

    let yStartTable = height - 222; 
    const rowHeight = 16.7;       
    
    const availableTools = allTools.filter(tool => 
        tool.estadoProceso !== 'en_proceso' && tool.estadoProceso !== 'fuera_servicio' && tool.estadoProceso !== 'en_servicio' 
    );

    availableTools.forEach((tool, index) => {
      if (index >= MAX_ITEMS_CELESTICA_PDF) return; 
      const y = yStartTable - (index * rowHeight);
      firstPage.drawText(cleanToolNameForPdf(tool.herramienta), { x: 40, y, size: fontSize, font, color });
      firstPage.drawText(String(tool.qty), { x: 270, y, size: fontSize, font, color });
      firstPage.drawText(tool.marca, { x: 310, y, size: fontSize, font, color });
      firstPage.drawText(tool.modelo, { x: 400, y, size: fontSize, font, color });
      firstPage.drawText(tool.serie, { x: 480, y, size: fontSize, font, color });
    });
    
    if (allTools.length > availableTools.length) {
        firstPage.drawText(`* NOTA: ${allTools.length - availableTools.length} equipo(s) excluido(s) por estado 'NO DISPONIBLE'.`, { 
            x: 40, y: 80, size: fontSize + 1, font, color: rgb(0.5, 0.5, 0.5) 
        });
    }

    const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
    saveAs(blob, `Registro_Celestica_${data.usuario}.pdf`);
  } catch (error) {
    console.error('Error al generar el PDF de Celestica:', error);
    alert('Error al generar el PDF de Celestica. Revisa la consola.');
  }
}

async function generateGenericPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); 
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const margin = 50;

    // Intentar cargar logo, fallback si falla
    try {
        const logoBytes = await fetch('/lab_logo.png').then(res => res.arrayBuffer());
        const logoImage = await pdfDoc.embedPng(logoBytes);
        const logoDims = logoImage.scale(0.25); 
        page.drawImage(logoImage, { x: margin, y: height - margin - logoDims.height, width: logoDims.width, height: logoDims.height });
    } catch(e) { /* Ignorar error de logo */ }

    page.drawText('Registro de Herramienta o Equipo', { x: margin + 110, y: height - margin - 30, size: 18, font: fontBold });

    let yPos = height - 130;
    const drawField = (label: string, value: string) => {
      if (!value) return; 
      page.drawText(label, { x: margin, y: yPos, size: 9, font: fontBold });
      page.drawText(value, { x: margin + 120, y: yPos, size: 9, font });
      yPos -= 15;
    };
    
    drawField('Fecha:', data.fecha);
    drawField('Usuario:', data.usuario);
    drawField('Compañía:', data.companiaDepto);
    drawField('No. Empleado:', data.noEmpleado);
    drawField('Gafete Contratista:', data.gafeteContratista);

    yPos -= 20;
    const rowHeight = 20;
    const tableMargin = margin - 10;
    const cols = [
      { header: 'Herramienta', x: tableMargin, width: 140 },
      { header: 'Qty', x: tableMargin + 140, width: 30 },
      { header: 'Marca', x: tableMargin + 170, width: 80 },
      { header: 'Modelo', x: tableMargin + 250, width: 90 },
      { header: 'Serie', x: tableMargin + 340, width: 100 },
      { header: 'Estado', x: tableMargin + 440, width: 80 },
    ];

    const drawTableHeader = (p: any) => {
      p.drawRectangle({ x: tableMargin, y: yPos - 5, width: width - 2 * tableMargin, height: rowHeight, color: rgb(0.95, 0.95, 0.95) });
      cols.forEach(col => p.drawText(col.header, { x: col.x + 5, y: yPos, size: 10, font: fontBold }));
      yPos -= rowHeight;
    };

    drawTableHeader(page);

    for (const tool of allTools) {
      if (yPos < margin + rowHeight) {
        page = pdfDoc.addPage([595.28, 841.89]);
        yPos = height - margin;
        drawTableHeader(page);
      }
      const rowData = [
        cleanToolNameForPdf(tool.herramienta), String(tool.qty), tool.marca, tool.modelo, tool.serie, 
        tool.estadoProceso ? tool.estadoProceso.toUpperCase().replace('_', ' ') : 'OPERATIVO'
      ];
      cols.forEach((col, i) => page.drawText(rowData[i], { x: col.x + 5, y: yPos, size: 9, font }));
      page.drawLine({ start: { x: tableMargin, y: yPos - 5 }, end: { x: width - tableMargin, y: yPos - 5 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      yPos -= rowHeight;
    }

    const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
    saveAs(blob, `Registro_Generico_${data.usuario}.pdf`);
  } catch (error) {
    alert('Error al generar el PDF Genérico.');
  }
}

// --- Estilos CSS mejorados (Inyectados como objeto para mantener todo en un archivo) ---
const styles = `
  :root { --primary: #2563eb; --primary-dark: #1e40af; --bg-page: #f3f4f6; --bg-card: #ffffff; --text-main: #111827; --text-muted: #6b7280; --border: #e5e7eb; --danger: #ef4444; --success: #10b981; --warning: #f59e0b; }
  body { background-color: var(--bg-page); color: var(--text-main); font-family: 'Inter', -apple-system, sans-serif; }
  
  .layout-container { max-width: 1200px; margin: 0 auto; padding: 20px; min-height: 100vh; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .header h1 { font-size: 1.5rem; font-weight: 700; color: #1f2937; margin: 0; }
  
  .card { background: var(--bg-card); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 24px; margin-bottom: 24px; border: 1px solid var(--border); transition: transform 0.2s; }
  .card-title { font-size: 1.1rem; font-weight: 600; color: #374151; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
  
  .grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
  .input-group { display: flex; flex-direction: column; gap: 6px; }
  .input-group label { font-size: 0.875rem; font-weight: 500; color: #4b5563; }
  .input-control { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; transition: border-color 0.15s; outline: none; background: #fff; width: 100%; box-sizing: border-box; }
  .input-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
  .error-text { color: var(--danger); font-size: 0.75rem; margin-top: 4px; }

  /* Backpack Grid */
  .backpack-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .backpack-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 10px; background: #f9fafb; position: relative; overflow: hidden; }
  .backpack-card:hover { border-color: var(--primary); background: #eff6ff; }
  .backpack-card.selected { background: #eff6ff; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary); }
  .backpack-card input { position: absolute; opacity: 0; cursor: pointer; height: 100%; width: 100%; top: 0; left: 0; }
  .backpack-icon { color: var(--text-muted); }
  .backpack-card.selected .backpack-icon { color: var(--primary); }

  /* Tables */
  .table-responsive { overflow-x: auto; border-radius: 8px; border: 1px solid var(--border); }
  .modern-table { width: 100%; border-collapse: collapse; min-width: 800px; }
  .modern-table th { background: #f9fafb; text-align: left; padding: 12px 16px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; border-bottom: 1px solid var(--border); }
  .modern-table td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: #1f2937; vertical-align: middle; }
  .modern-table tbody tr:last-child td { border-bottom: none; }
  
  .status-badge { display: inline-flex; padding: 2px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .status-vencido { background: #fecaca; color: #991b1b; }
  .status-critico { background: #fed7aa; color: #9a3412; }
  .status-vigente { background: #bbf7d0; color: #166534; }
  .status-unavailable { background: #e5e7eb; color: #374151; text-decoration: line-through; }
  
  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; border-radius: 8px; font-weight: 500; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; border: none; gap: 8px; }
  .btn-primary { background: var(--primary); color: white; }
  .btn-primary:hover { background: var(--primary-dark); }
  .btn-secondary { background: white; border: 1px solid #d1d5db; color: #374151; }
  .btn-secondary:hover { background: #f3f4f6; }
  .btn-danger { background: #fee2e2; color: #b91c1c; }
  .btn-danger:hover { background: #fecaca; }
  .btn-success { background: var(--success); color: white; }
  .btn-success:hover { background: #059669; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .floating-bar { position: sticky; bottom: 20px; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); padding: 16px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border); z-index: 50; margin-top: 20px; flex-wrap: wrap; gap: 10px; }
  .alert-banner { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 12px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; font-weight: 500; }
  
  .scanner-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .scanner-box { background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 500px; text-align: center; }
  .scanner-video { width: 100%; border-radius: 8px; margin-bottom: 15px; background: #000; }

  @media (max-width: 640px) {
    .header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .floating-bar { flex-direction: column; align-items: stretch; }
    .btn { width: 100%; }
    .table-responsive { box-shadow: inset -10px 0 10px -10px rgba(0,0,0,0.1); }
  }
`;

// ==================================================================
// --- 2. COMPONENTE PRINCIPAL ---
// ==================================================================

const NormasScreen = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<{ id: string; nombre: string; }[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [patronesMap, setPatronesMap] = useState<Map<string, PatronBase>>(new Map());
  const [patronesScannerMap, setPatronesScannerMap] = useState<Map<string, PatronBase>>(new Map());
  const [isSavingBatch, setIsSavingBatch] = useState(false); 

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const { register, control, handleSubmit, setValue, watch, trigger, getValues, formState: { errors } } = useForm<FormInputs>({
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      selectedBackpacks: [],
      manualTools: [],
      companiaDepto: 'Equipos y Servicios AG',
    },
    mode: 'onChange'
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'manualTools' });

  // --- Carga Inicial de Datos ---
  useEffect(() => {
    const initData = async () => {
      setIsLoadingData(true);
      try {
        // 1. Usuarios
        const usersQ = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const usersSnap = await getDocs(usersQ);
        setMetrologos(usersSnap.docs.map(d => ({ id: d.id, nombre: d.data().name || d.data().nombre })));

        // 2. Patrones
        const patronesQ = query(collection(db, COLLECTION_NAME_PATRONES));
        const patronesSnap = await getDocs(patronesQ);
        
        const mapDropdown = new Map<string, PatronBase>();
        const mapScanner = new Map<string, PatronBase>();

        patronesSnap.forEach((doc) => {
          const data = doc.data() as any;
          const descripcion = (data.descripcion || '').trim(); 
          const noControl = data.noControl || 'S/N'; 
          const displayName = `${noControl} - ${descripcion}`; 
          
          const patronData: PatronBase = {
              id: doc.id,
              noControl,
              nombre: displayName,
              marca: data.marca || 'S/M', modelo: data.modelo || 'S/M', serie: data.serie || 'S/N',
              fechaVencimiento: data.fecha,
              status: getVencimientoStatus(data.fecha),
              estadoProceso: data.estadoProceso || 'operativo',
              usuarioEnUso: data.usuarioEnUso 
          };

          if (displayName) mapDropdown.set(displayName, patronData);
          if (noControl !== 'S/N') mapScanner.set(noControl, patronData);
        });

        setPatronesMap(mapDropdown);
        setPatronesScannerMap(mapScanner);
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    initData();
  }, []);

  // --- Observadores y Memoización ---
  const watchedManualTools = watch('manualTools');
  const watchedBackpacks = watch('selectedBackpacks');
  
  const aggregatedTools = useMemo(() => aggregateTools(watchedBackpacks || []), [watchedBackpacks]);
  
  const isAnyPatronVencido = useMemo(() => {
    return watchedManualTools.some(tool => tool.isVencida || tool.isUnavailable);
  }, [watchedManualTools]);

  const sortedPatronOptions = useMemo(() => 
    Array.from(patronesMap.values()).sort((a,b) => a.nombre.localeCompare(b.nombre)),
  [patronesMap]);

  // --- Manejo del Scanner ---
  const handleScanResult = useCallback((code: string) => {
    if (!code) return;
    stopScan();
    const patron = patronesScannerMap.get(code);
    
    if (!patron) { alert(`Patrón "${code}" no encontrado.`); return; }
    
    // Validar duplicados visuales
    const currentTools = getValues('manualTools');
    if (currentTools.some(t => t.herramienta === patron.nombre)) {
        alert(`El patrón "${patron.nombre}" ya está en la lista.`);
        return;
    }

    const isUnavailable = ['en_proceso','fuera_servicio','en_servicio','en_prestamo','en_mantenimiento'].includes(patron.estadoProceso);
    if (isUnavailable) {
        alert(`Patrón "${patron.nombre}" NO DISPONIBLE. Estado: ${patron.estadoProceso.toUpperCase()}.`);
        return;
    }

    append({
      herramienta: patron.nombre, qty: '1', marca: patron.marca, modelo: patron.modelo, serie: patron.serie,
      isVencida: (patron.status === 'vencido' || patron.status === 'critico'),
      isUnavailable: false
    });
  }, [patronesScannerMap, append, getValues]);

  const stopScan = () => {
    if (scannerControlsRef.current) { scannerControlsRef.current.stop(); scannerControlsRef.current = null; }
    setIsScannerOpen(false);
  };

  useEffect(() => {
    if (isScannerOpen && videoRef.current) {
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
            if (result) { handleScanResult(result.getText()); controls.stop(); }
            if (controls) scannerControlsRef.current = controls;
        }).catch(err => { console.error(err); setIsScannerOpen(false); });
    }
    return () => { if (scannerControlsRef.current) scannerControlsRef.current.stop(); };
  }, [isScannerOpen, handleScanResult]);


  // --- Acciones Principales ---
  const handleRegistrarSalida = async () => {
    const isValid = await trigger('usuario'); 
    if (!isValid) return alert('Selecciona un usuario primero.');
    
    const usuario = getValues('usuario');
    const toolsToUpdate = watchedManualTools.filter(t => patronesMap.has(t.herramienta));

    if (!toolsToUpdate.length) return alert('No hay equipos manuales válidos para registrar.');
    if (!window.confirm(`¿Registrar salida de ${toolsToUpdate.length} equipos para ${usuario}?`)) return;

    setIsSavingBatch(true);
    try {
        const batch = writeBatch(db); 
        const fecha = new Date().toISOString().split('T')[0];
        
        toolsToUpdate.forEach(tool => {
            const pid = patronesMap.get(tool.herramienta)?.id;
            if (pid) {
                batch.update(doc(db, COLLECTION_NAME_PATRONES, pid), {
                    estadoProceso: 'en_servicio', usuarioEnUso: usuario, ubicacion: `En Uso - ${usuario}`, fechaPrestamo: fecha
                });
            }
        });

        await batch.commit();
        alert('✅ Salida registrada correctamente.');
        setValue('manualTools', []);
        
        // Recargar datos rápidos
        const q = query(collection(db, COLLECTION_NAME_PATRONES));
        const snap = await getDocs(q);
        const newMap = new Map(patronesMap);
        snap.forEach(d => { 
            const data = d.data() as any;
            const name = `${data.noControl} - ${data.descripcion}`;
            if (newMap.has(name)) newMap.set(name, { ...newMap.get(name)!, estadoProceso: data.estadoProceso, usuarioEnUso: data.usuarioEnUso });
        });
        setPatronesMap(newMap);

    } catch (e) { console.error(e); alert('Error al guardar.'); }
    finally { setIsSavingBatch(false); }
  };

  const handlePdf = async (type: 'cel' | 'gen') => {
    if (isAnyPatronVencido) return alert('No se puede generar PDF con equipos Vencidos o No Disponibles.');
    if (!(await trigger())) return alert('Completa los campos obligatorios.');
    
    const data = getValues();
    const manualClean = data.manualTools.filter(t => t.herramienta).map(t => ({
        ...t, estadoProceso: patronesMap.get(t.herramienta)?.estadoProceso || 'operativo'
    }));
    const all = [...aggregatedTools, ...manualClean];

    if (type === 'cel') generateCelesticaPdf(data, all);
    else generateGenericPdf(data, all);
  };

  // ==================================================================
  // --- 3. RENDERIZADO DEL UI ---
  // ==================================================================

  return (
    <>
      <style>{styles}</style>
      
      {/* --- Modal Scanner --- */}
      {isScannerOpen && (
        <div className="scanner-overlay" onClick={stopScan}>
          <div className="scanner-box" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Escanear Código</h3>
            <video ref={videoRef} className="scanner-video" />
            <button className="btn btn-danger w-full" onClick={stopScan}><X size={18} /> Cancelar</button>
          </div>
        </div>
      )}

      <div className="layout-container">
        {/* --- Header --- */}
        <div className="header">
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <button className="btn btn-secondary rounded-full p-2 w-10 h-10" onClick={() => navigateTo('/')}><ArrowLeft size={20} /></button>
              <div>
                <h1>Registro de Salida</h1>
                <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>Control de herramientas y equipos de medición</p>
              </div>
           </div>
           <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-gray-400">FECHA ACTUAL</span>
              <div className="text-lg font-mono font-semibold">{new Date().toLocaleDateString()}</div>
           </div>
        </div>

        {/* --- Card 1: Datos Usuario --- */}
        <div className="card">
          <div className="card-title"><User size={20} className="text-blue-600" /> Información del Responsable</div>
          <div className="grid-form">
            <div className="input-group">
                <label>Fecha de Registro</label>
                <input type="date" className="input-control" {...register('fecha', { required: "Requerido" })} />
            </div>
            <div className="input-group">
                <label>Metrólogo / Usuario</label>
                <Controller
                  name="usuario" control={control} rules={{ required: "Seleccione un usuario" }}
                  render={({ field }) => (
                    <select {...field} className="input-control" disabled={isLoadingData}>
                      <option value="">{isLoadingData ? 'Cargando...' : '-- Seleccionar --'}</option>
                      {metrologos.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                    </select>
                  )}
                />
                {errors.usuario && <span className="error-text">{errors.usuario.message}</span>}
            </div>
            <div className="input-group">
                <label>Compañía / Depto</label>
                <input className="input-control" {...register('companiaDepto', { required: "Requerido" })} />
            </div>
            <div className="input-group">
                 <label>No. Empleado</label>
                 <input className="input-control" {...register('noEmpleado')} placeholder="Opcional" />
            </div>
             <div className="input-group">
                 <label>Gafete Contratista</label>
                 <input className="input-control" {...register('gafeteContratista')} placeholder="Opcional" />
            </div>
          </div>
        </div>

        {/* --- Card 2: Mochilas --- */}
        <div className="card">
            <div className="card-title"><Briefcase size={20} className="text-blue-600" /> Kits y Mochilas Predefinidas</div>
            <div className="backpack-grid">
              <Controller
                name="selectedBackpacks" control={control}
                render={({ field }) => (
                  <>
                    {Object.entries(BACKPACK_CATALOG).map(([id, backpack]) => {
                      const isSelected = field.value.includes(id);
                      return (
                        <label key={id} className={`backpack-card ${isSelected ? 'selected' : ''}`}>
                          <input type="checkbox" value={id} checked={isSelected}
                            onChange={(e) => {
                                const newVal = e.target.checked ? [...field.value, id] : field.value.filter(v => v !== id);
                                field.onChange(newVal);
                            }}
                          />
                          <Package className="backpack-icon" size={24} />
                          <div>
                              <div className="font-semibold text-sm">{backpack.nombre}</div>
                              <div className="text-xs text-gray-500">{backpack.items.length} items</div>
                          </div>
                          {isSelected && <CheckCircle2 size={16} className="text-blue-600 absolute top-2 right-2" />}
                        </label>
                      );
                    })}
                  </>
                )}
              />
            </div>

            {/* Tabla Resumen Mochilas */}
            {aggregatedTools.length > 0 && (
                <div className="mt-6">
                    <h4 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">Contenido de Kits Seleccionados</h4>
                    <div className="table-responsive">
                        <table className="modern-table">
                            <thead><tr><th>Item</th><th>Cant.</th><th>Marca</th><th>Modelo</th><th>Serie</th></tr></thead>
                            <tbody>
                                {aggregatedTools.map((t, i) => (
                                    <tr key={i}>
                                        <td>{t.herramienta}</td>
                                        <td className="text-center font-bold bg-gray-50">{t.qty}</td>
                                        <td>{t.marca}</td><td>{t.modelo}</td><td className="font-mono text-xs">{t.serie}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* --- Card 3: Herramientas Manuales --- */}
        <div className="card">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 border-bottom pb-4 border-gray-100">
                <div className="card-title mb-0 border-none p-0"><Camera size={20} className="text-blue-600" /> Registro Individual de Patrones</div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={() => setIsScannerOpen(true)}>
                        <Camera size={16} /> Escanear
                    </button>
                    <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={() => append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '' })}>
                        <Plus size={16} /> Agregar Manual
                    </button>
                </div>
            </div>

            {isAnyPatronVencido && (
                <div className="alert-banner">
                    <AlertTriangle size={20} />
                    <span>Atención: Has seleccionado equipos VENCIDOS, CRÍTICOS o NO DISPONIBLES. Revisa la lista.</span>
                </div>
            )}

            <div className="table-responsive">
                <table className="modern-table">
                    <thead>
                        <tr>
                            <th style={{width: '40px'}}>#</th>
                            <th>Patrón / Equipo</th>
                            <th>Estado Calib.</th>
                            <th>Disponibilidad</th>
                            <th style={{width: '60px'}}>Cant.</th>
                            <th>Info Técnica</th>
                            <th style={{width: '80px'}}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {fields.length === 0 && (
                             <tr><td colSpan={7} className="text-center py-8 text-gray-400 italic">No hay equipos manuales agregados. Usa el escáner o agrega manualmente.</td></tr>
                        )}
                        {fields.map((item, index) => {
                            const currentTool = watchedManualTools[index]?.herramienta;
                            const patronData = patronesMap.get(currentTool);
                            const status = patronData?.status || 'pendiente';
                            const proceso = patronData?.estadoProceso || 'operativo';
                            
                            const isUnavailable = ['en_proceso', 'fuera_servicio', 'en_servicio', 'en_prestamo', 'en_mantenimiento'].includes(proceso);
                            
                            return (
                                <tr key={item.id} className={isUnavailable ? 'bg-gray-50' : ''}>
                                    <td className="text-center text-gray-400">{index + 1}</td>
                                    <td style={{ minWidth: '250px' }}>
                                        <Controller
                                            name={`manualTools.${index}.herramienta`} control={control}
                                            render={({ field }) => (
                                                <select {...field} className="input-control text-sm" 
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        field.onChange(val);
                                                        const p = patronesMap.get(val);
                                                        if (p) {
                                                            const badStatus = p.status === 'vencido' || p.status === 'critico';
                                                            const badProcess = ['en_proceso', 'fuera_servicio', 'en_servicio', 'en_prestamo', 'en_mantenimiento'].includes(p.estadoProceso);
                                                            setValue(`manualTools.${index}.qty`, '1');
                                                            setValue(`manualTools.${index}.marca`, p.marca);
                                                            setValue(`manualTools.${index}.modelo`, p.modelo);
                                                            setValue(`manualTools.${index}.serie`, p.serie);
                                                            setValue(`manualTools.${index}.isVencida`, badStatus);
                                                            setValue(`manualTools.${index}.isUnavailable`, badProcess);
                                                        }
                                                    }}
                                                >
                                                    <option value="">-- Buscar Patrón --</option>
                                                    {sortedPatronOptions.map(op => (
                                                        <option key={op.id} value={op.nombre} disabled={op.estadoProceso !== 'operativo' && op.nombre !== currentTool}>
                                                            {op.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            )} 
                                        />
                                        {isUnavailable && <div className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10} /> NO DISPONIBLE ({patronData?.usuarioEnUso || '?'})</div>}
                                    </td>
                                    <td>
                                        <span className={`status-badge status-${status}`}>{status}</span>
                                    </td>
                                    <td>
                                        <span className={`text-xs font-mono uppercase ${isUnavailable ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                            {proceso.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td>
                                        <input type="number" className="input-control text-center p-1" {...register(`manualTools.${index}.qty`)} disabled={isUnavailable} />
                                    </td>
                                    <td>
                                        <div className="text-xs text-gray-500">
                                            <div><span className="font-semibold">Marca:</span> {watch(`manualTools.${index}.marca`)}</div>
                                            <div><span className="font-semibold">Serie:</span> {watch(`manualTools.${index}.serie`)}</div>
                                        </div>
                                    </td>
                                    <td>
                                        <button type="button" className="text-red-500 hover:text-red-700 p-2" onClick={() => remove(index)}><X size={18} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* --- Floating Action Bar --- */}
        <div className="floating-bar">
            <div className="text-sm text-gray-500 hidden sm:block">
                Total Equipos: <b>{aggregatedTools.length + fields.length}</b>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
                {fields.length > 0 && (
                    <button type="button" className="btn btn-success flex-1" onClick={handleRegistrarSalida} disabled={isAnyPatronVencido || isSavingBatch}>
                        {isSavingBatch ? <Loader2 className="animate-spin" size={18}/> : <Save size={18} />} Registrar Salida
                    </button>
                )}
                <button type="button" className="btn btn-primary flex-1" onClick={() => handlePdf('cel')} disabled={isAnyPatronVencido}>
                    <FileText size={18} /> PDF Celestica
                </button>
                <button type="button" className="btn btn-secondary flex-1" onClick={() => handlePdf('gen')} disabled={isAnyPatronVencido}>
                    <FileText size={18} /> PDF Genérico
                </button>
            </div>
        </div>

      </div>
    </>
  );
};

export default NormasScreen;