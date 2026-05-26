import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { differenceInDays, parseISO } from 'date-fns'; 
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
import { 
  ArrowLeft, User, Package, Plus, Loader2, AlertTriangle, 
  Camera, X, Save, FileText, Briefcase, Info, Printer
} from 'lucide-react'; 
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import {
  COLLECTION_PATRONES,
  formatPatronNombre,
  isPatronUnavailable,
} from '../utils/patronLink';

// ==================================================================
// --- 1. CONFIGURACIÓN Y ESTILOS ---
// ==================================================================

const COLLECTION_NAME_PATRONES = COLLECTION_PATRONES;

const styles = `
  :root { --primary: #2563eb; --bg-page: #f8fafc; --text-main: #1e293b; }
  body { background: var(--bg-page); color: var(--text-main); font-family: sans-serif; }
  .layout-container { max-width: 1200px; margin: 0 auto; padding: 20px; padding-bottom: 100px; }
  .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
  
  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; gap: 8px; transition: all 0.2s; }
  .btn-primary { background: var(--primary); color: white; box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.3); }
  .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
  .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; transform: none; box-shadow: none; }

  .btn-success { background: #10b981; color: white; box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.3); }
  .btn-success:hover { background: #059669; transform: translateY(-1px); }
  .btn-success:disabled { background: #94a3b8; cursor: not-allowed; }

  .btn-danger { background: #fee2e2; color: #b91c1c; }
  .btn-secondary { background: white; border: 1px solid #cbd5e1; color: #475569; }
  .btn-secondary:hover { background: #f1f5f9; border-color: #94a3b8; }
  
  .input-control { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 5px; background-color: #ffffff !important; color: #1e293b !important; font-size: 0.95rem; }
  .input-control:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
  label { font-weight: 600; color: #475569; font-size: 0.85rem; margin-bottom: 4px; display: block; }
  
  .modern-table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .modern-table th { text-align: left; padding: 12px 16px; background: #f8fafc; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; border-bottom: 1px solid #e2e8f0; letter-spacing: 0.05em; }
  .modern-table td { padding: 10px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 0.9rem; vertical-align: middle; }
  
  .status-badge { padding: 4px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
  .status-vencido { background: #fecaca; color: #991b1b; }
  .status-vigente { background: #dcfce7; color: #166534; }
  .status-pendiente { background: #f1f5f9; color: #64748b; }
  .status-proximo { background: #fef9c3; color: #854d0e; }
  .status-critico { background: #ffedd5; color: #c2410c; }

  .field-error { color: #dc2626; font-size: 0.75rem; margin-top: 4px; font-weight: 500; }
  .help-text { color: #64748b; font-size: 0.8rem; margin-top: 4px; line-height: 1.4; }
  .etiquetadora-chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px dashed #cbd5e1; background: #f8fafc; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; }
  .etiquetadora-chip:hover { border-color: var(--primary); background: #eff6ff; }
  .etiquetadora-chip.is-own { border-style: solid; border-color: #93c5fd; background: #eff6ff; }
  .etiquetadora-chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .empty-state { text-align: center; padding: 32px 16px; color: #94a3b8; }
  .empty-state svg { margin: 0 auto 12px; opacity: 0.5; }
  
  .floating-bar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 1100px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); padding: 16px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); display: flex; gap: 12px; justify-content: space-between; align-items: center; z-index: 50; border: 1px solid #e2e8f0; }
  
  .scanner-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.9); z-index: 100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
  .scanner-box { background: white; padding: 24px; width: 90%; max-width: 500px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
  .scanner-video { width: 100%; border-radius: 12px; background: black; margin-bottom: 16px; overflow: hidden; }

  option.opt-vencido { color: #dc2626; font-weight: bold; background-color: #fef2f2; }
  option.opt-unavailable { color: #94a3b8; font-style: italic; background-color: #f8fafc; }
`;

// ==================================================================
// --- 2. TIPOS E INTERFACES ---
// ==================================================================

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
  manualTools: (ToolItem & { isVencida?: boolean, isUnavailable?: boolean })[]; 
};

// ==================================================================
// --- 3. CATÁLOGOS Y HELPERS ---
// ==================================================================

const BACKPACK_CATALOG = {
  mochila_abraham: { nombre: 'Mochila 1 (Abraham)', ownerKey: 'abraham', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017166' } ] },
  mochila_Dante: { nombre: 'Mochila 2 (Dante)', ownerKey: 'dante', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVEPNEU0017947' } ] },
  mochila_Angel: { nombre: 'Mochila 3 (Angel)', ownerKey: 'angel', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700130' } ] },
  mochila_Edgar: { nombre: 'Mochila 4 (Edgar)', ownerKey: 'edgar', items: [ { herramienta: 'Desarmador Plano', qty: "1", marca: 'Urrea', modelo: 'S/M', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '8"', serie: 'N/A' }, { herramienta: 'Destornillador ESD', qty: "4", marca: 'Urrea', modelo: 'S/M', serie: 'Sm' }, { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700114' } ] },
  mochila_Mario: { nombre: 'Mochila 5 (Mario)', ownerKey: 'mario', items: [ { herramienta: 'Perica', qty: "1", marca: 'Pretul', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Urrea', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Rojo', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Verde', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Gris', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0023514' }, { herramienta: 'Cepillo', qty: "2", marca: 'S/M', modelo: 'S/M', serie: 'S/N' } ] },
  mochila_Ricardo: { nombre: 'Mochila 6 (Ricardo)', ownerKey: 'ricardo', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017933' } ] },
};

/** Etiquetadoras por persona — solo se ofrecen al agregar patrón manual (no van en kits). */
const ETIQUETADORAS_CATALOG: { persona: string; ownerKey: string; item: ToolItem }[] = [
  { persona: 'Abraham', ownerKey: 'abraham', item: { herramienta: 'Etiquetadora Epson', qty: '1', marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700459' } },
  { persona: 'Dante', ownerKey: 'dante', item: { herramienta: 'Etiquetadora Epson', qty: '1', marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X1Y00150' } },
  { persona: 'Angel', ownerKey: 'angel', item: { herramienta: 'Etiquetadora Epson', qty: '1', marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700192' } },
  { persona: 'Edgar', ownerKey: 'edgar', item: { herramienta: 'Etiquetadora Epson', qty: '1', marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700191' } },
];

const resolveBackpackIdForUsuario = (usuarioNombre: string): string | null => {
  if (!usuarioNombre) return null;
  const lower = usuarioNombre.toLowerCase();
  for (const [id, backpack] of Object.entries(BACKPACK_CATALOG)) {
    if (lower.includes(backpack.ownerKey)) return id;
  }
  return null;
};

const resolveOwnerKeyForUsuario = (usuarioNombre: string): string | null => {
  if (!usuarioNombre) return null;
  const lower = usuarioNombre.toLowerCase();
  for (const backpack of Object.values(BACKPACK_CATALOG)) {
    if (lower.includes(backpack.ownerKey)) return backpack.ownerKey;
  }
  return null;
};

const isEtiquetadoraInList = (tools: ToolItem[], serie: string) =>
  tools.some(t => t.serie === serie && (t.herramienta.toLowerCase().includes('etiquetadora') || t.herramienta.toLowerCase().includes('impresora')));

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
      const key = `${item.herramienta.trim()}|${item.marca.trim()}|${item.modelo.trim()}|${item.serie.trim()}`;
      if (aggregator.has(key)) {
        const existing = aggregator.get(key)!;
        existing.qty = String((Number(existing.qty) || 0) + (Number(item.qty) || 0)); 
      } else {
        aggregator.set(key, { ...item, qty: String(item.qty) });
      }
    }
  }
  return Array.from(aggregator.values());
}

const cleanToolNameForPdf = (name: string): string => {
  if (!name) return '';
  return name.replace(/^AG-\d+\s+-\s+/, '').replace(/^\*+\s*-\s+/, '');
};

// ==================================================================
// --- 4. GENERADORES DE PDF ---
// ==================================================================

async function generateCelesticaPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const response = await fetch('/template.pdf');
    if (!response.ok) throw new Error("No se encontró template.pdf en la carpeta public");
    
    const existingPdfBytes = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 9;
    const color = rgb(0, 0, 0);

    // Obtener la fecha actual para el parche de impresión
    const now = new Date();
    const currentDateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

    // Filtrar herramientas disponibles
    const availableTools = allTools.filter(tool => 
        !['fuera_servicio', 'en_mantenimiento'].includes(tool.estadoProceso || '')
    );

    // Agrupar en bloques de 30 para paginación
    const toolChunks: ToolItem[][] = [];
    for (let i = 0; i < availableTools.length; i += 30) {
        toolChunks.push(availableTools.slice(i, i + 30));
    }
    
    if (toolChunks.length === 0) toolChunks.push([]);

    for (let i = 0; i < toolChunks.length; i++) {
        let page;
        if (i === 0) {
            page = pdfDoc.getPages()[0];
        } else {
            const tempDoc = await PDFDocument.load(existingPdfBytes);
            const [copiedPage] = await pdfDoc.copyPages(tempDoc, [0]);
            page = pdfDoc.addPage(copiedPage);
        }

        const { height } = page.getSize();

        // Mapeo de campos de cabecera
        page.drawText(data.fecha || '', { x: 60, y: height - 82, size: fontSize, font, color });
        page.drawText(data.usuario || '', { x: 320, y: height - 82, size: fontSize, font, color });
        page.drawText(data.gafeteContratista || '', { x: 490, y: height - 80, size: fontSize, font, color });
        page.drawText(data.companiaDepto || '', { x: 320, y: height - 114, size: fontSize, font, color });
        page.drawText(data.noEmpleado || '', { x: 500, y: height - 114, size: fontSize, font, color });

        // --- INICIO DEL PARCHE DE FECHA DE IMPRESIÓN ---
        // Dibuja un rectángulo blanco para tapar la fecha vieja (ajusta x, y, width, height si es necesario)
        page.drawRectangle({ x: 420, y: height - 55, width: 170, height: 15, color: rgb(1, 1, 1) }); 
        // Dibuja la fecha nueva
        page.drawText(`Fecha de Impresion ${currentDateStr}`, { x: 420, y: height - 50, size: fontSize, font, color });
        // --- FIN DEL PARCHE ---

        let yStartTable = height - 222; 
        
        toolChunks[i].forEach((tool, index) => {
          const y = yStartTable - (index * 16.7);
          page.drawText(cleanToolNameForPdf(tool.herramienta).substring(0, 42), { x: 40, y, size: fontSize, font, color });
          page.drawText(String(tool.qty), { x: 270, y, size: fontSize, font, color });
          page.drawText(tool.marca.substring(0, 15), { x: 310, y, size: fontSize, font, color });
          page.drawText(tool.modelo.substring(0, 15), { x: 400, y, size: fontSize, font, color });
          page.drawText(tool.serie.substring(0, 15), { x: 480, y, size: fontSize, font, color });
        });
    }
    
    const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
    saveAs(blob, `Registro_Celestica_${data.usuario}.pdf`);
  } catch (error: any) { 
    console.error(error);
    alert('Error generando PDF Celestica: ' + error.message); 
  }
}

async function generateGenericPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 50;
    page.drawText('Registro de Salida de Herramienta', { x: 50, y, size: 18, font: fontBold });
    y -= 30;
    page.drawText(`Fecha: ${data.fecha}`, { x: 50, y, size: 10, font });
    page.drawText(`Usuario: ${data.usuario}`, { x: 250, y, size: 10, font });
    y -= 30;
    
    const headers = ['Herramienta', 'Cant', 'Marca', 'Modelo', 'Serie'];
    const xPos = [50, 250, 300, 400, 500];
    
    headers.forEach((h, i) => page.drawText(h, { x: xPos[i], y, size: 10, font: fontBold }));
    y -= 15;

    allTools.forEach(t => {
        if (y < 50) { page = pdfDoc.addPage(); y = height - 50; }
        page.drawText(cleanToolNameForPdf(t.herramienta).substring(0, 35), { x: 50, y, size: 9, font });
        page.drawText(String(t.qty), { x: 250, y, size: 9, font });
        page.drawText(t.marca.substring(0, 15), { x: 300, y, size: 9, font });
        page.drawText(t.modelo.substring(0, 15), { x: 400, y, size: 9, font });
        page.drawText(t.serie.substring(0, 15), { x: 500, y, size: 9, font });
        y -= 15;
    });

    const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
    saveAs(blob, `Registro_Generico_${data.usuario}.pdf`);
  } catch (e) { alert('Error generando PDF Genérico.'); }
}

// ==================================================================
// --- 5. COMPONENTE PRINCIPAL ---
// ==================================================================

const NormasScreen = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<{ id: string; nombre: string; }[]>([]);
  const [isLoadingMetrologos, setIsLoadingMetrologos] = useState(true);
  const [patronesMap, setPatronesMap] = useState<Map<string, PatronBase>>(new Map());
  const [patronesScannerMap, setPatronesScannerMap] = useState<Map<string, PatronBase>>(new Map());
  const [isSavingBatch, setIsSavingBatch] = useState(false); 
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const { register, control, handleSubmit, setValue, watch, trigger, getValues, formState: { errors } } = useForm<FormInputs>({
    defaultValues: { 
        fecha: new Date().toISOString().split('T')[0], 
        selectedBackpacks: [], 
        manualTools: [], 
        companiaDepto: 'Equipos y Servicios AG' 
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'manualTools' });
  const watchedBackpacks = watch('selectedBackpacks');
  const watchedManualTools = watch('manualTools');
  const watchedUsuario = watch('usuario');
  const usuarioOwnerKey = useMemo(() => resolveOwnerKeyForUsuario(watchedUsuario || ''), [watchedUsuario]);
  const buildPatronMaps = (patronesSnap: Awaited<ReturnType<typeof getDocs>>) => {
    const mapDropdown = new Map<string, PatronBase>();
    const mapScanner = new Map<string, PatronBase>();

    patronesSnap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, string | undefined>;
      const fechaReal = d.fecha || d.fechaVencimiento || '';
      const p: PatronBase = {
        id: docSnap.id,
        noControl: d.noControl || 'S/N',
        nombre: formatPatronNombre(d.noControl || 'S/N', d.descripcion, d.nombre),
        marca: d.marca || '',
        modelo: d.modelo || '',
        serie: d.serie || '',
        fechaVencimiento: fechaReal,
        status: getVencimientoStatus(fechaReal),
        estadoProceso: (d.estadoProceso as PatronBase['estadoProceso']) || 'operativo',
        usuarioEnUso: d.usuarioEnUso || d.usuarioAsignado,
      };
      if (p.nombre) mapDropdown.set(p.nombre, p);
      if (p.noControl !== 'S/N') mapScanner.set(p.noControl, p);
    });

    return { mapDropdown, mapScanner };
  };

  const reloadPatrones = async () => {
    const patronesSnap = await getDocs(query(collection(db, COLLECTION_NAME_PATRONES)));
    const { mapDropdown, mapScanner } = buildPatronMaps(patronesSnap);
    setPatronesMap(mapDropdown);
    setPatronesScannerMap(mapScanner);
    return { mapDropdown, mapScanner };
  };

  const appendPatronToForm = useCallback((p: PatronBase, sourceLabel: string) => {
    const manualTools = getValues('manualTools') || [];
    if (manualTools.some(t => t.herramienta === p.nombre)) {
      setLinkNotice(`El patrón ${p.noControl} ya está en la lista.`);
      return;
    }
    if (isPatronUnavailable(p.estadoProceso)) {
      setLinkNotice(`El patrón ${p.noControl} no está disponible (${p.estadoProceso.replace(/_/g, ' ')}).`);
      return;
    }
    append({
      herramienta: p.nombre,
      qty: '1',
      marca: p.marca,
      modelo: p.modelo,
      serie: p.serie,
      isVencida: p.status === 'vencido' || p.status === 'critico',
      isUnavailable: false,
      estadoProceso: p.estadoProceso,
    });
    setLinkNotice(`${sourceLabel}: ${p.noControl} agregado a la hoja.`);
  }, [append, getValues]);

  const aggregatedTools = useMemo(() => aggregateTools(watchedBackpacks || []), [watchedBackpacks]);
  const isAnyPatronVencido = useMemo(() => watchedManualTools.some(tool => tool.isVencida), [watchedManualTools]);

  // Auto-seleccionar mochila del metrólogo responsable
  useEffect(() => {
    const backpackId = resolveBackpackIdForUsuario(watchedUsuario || '');
    if (backpackId) {
      setValue('selectedBackpacks', [backpackId]);
    }
  }, [watchedUsuario, setValue]);

  const handleAddManualRow = () => {
    append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '' });
  };

  const handleAddEtiquetadora = (etiq: typeof ETIQUETADORAS_CATALOG[number]) => {
    if (isEtiquetadoraInList(watchedManualTools, etiq.item.serie)) {
      alert(`La etiquetadora de ${etiq.persona} ya está en la lista.`);
      return;
    }
    append({ ...etiq.item, isVencida: false, isUnavailable: false });
  };

  // Carga inicial de datos de Firebase
  useEffect(() => {
    const initData = async () => {
      setIsLoadingMetrologos(true);
      try {
        const usersQ = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const usersSnap = await getDocs(usersQ);
        setMetrologos(usersSnap.docs.map(d => ({ id: d.id, nombre: d.data().name || d.data().nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)));

        const patronesSnap = await getDocs(query(collection(db, COLLECTION_NAME_PATRONES)));
        const { mapDropdown, mapScanner } = buildPatronMaps(patronesSnap);
        setPatronesMap(mapDropdown);
        setPatronesScannerMap(mapScanner);
      } catch (e) { console.error("Error carga inicial", e); }
      finally { setIsLoadingMetrologos(false); }
    };
    initData();
  }, []);

  const sortedPatronOptions = useMemo(() => {
      return Array.from(patronesMap.values()).sort((a, b) => 
          a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' })
      );
  }, [patronesMap]);

  // --- FUNCIÓN PARA DESCARGAR PDF ---
  const handlePdf = async (type: 'cel' | 'gen') => {
    const isValid = await trigger(['usuario', 'noEmpleado']);
    if (!isValid) return alert("Por favor completa los datos del responsable.");

    const data = getValues();
    const allTools = [...aggregatedTools, ...watchedManualTools];

    if (allTools.length === 0) return alert("No hay equipos en la lista.");
    
    if (isAnyPatronVencido) {
        const proceed = window.confirm("¡ATENCIÓN! Hay equipos vencidos en la lista. ¿Deseas generar el PDF de todos modos?");
        if (!proceed) return;
    }

    if (type === 'cel') {
        await generateCelesticaPdf(data, allTools);
    } else {
        await generateGenericPdf(data, allTools);
    }
  };

  const handleScan = (code: string) => {
    if (!code) return;
    const p = patronesScannerMap.get(code);
    if (!p) {
      setLinkNotice(`Patrón no encontrado: ${code}. Escanea el No. de Control registrado en Programa.`);
      return;
    }
    stopScan();
    
    if (watchedManualTools.some(t => t.herramienta === p.nombre)) {
      setLinkNotice(`El patrón ${p.noControl} ya está en la lista.`);
      return;
    }
    if (isPatronUnavailable(p.estadoProceso)) {
      setLinkNotice(`NO DISPONIBLE: ${p.noControl} está ${p.estadoProceso.replace(/_/g, ' ')}.`);
      return;
    }

    append({
        herramienta: p.nombre, qty: '1', marca: p.marca, modelo: p.modelo, serie: p.serie,
        isVencida: p.status === 'vencido' || p.status === 'critico',
        isUnavailable: false,
        estadoProceso: p.estadoProceso,
    });
    setLinkNotice(`Patrón ${p.noControl} agregado desde escaneo.`);
  };

  const stopScan = () => {
    if (scannerControlsRef.current) { scannerControlsRef.current.stop(); scannerControlsRef.current = null; }
    setIsScannerOpen(false);
  };

  useEffect(() => {
    if (isScannerOpen && videoRef.current) {
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoDevice(undefined, videoRef.current, (res, err, ctrl) => {
            if (res) { handleScan(res.getText()); ctrl.stop(); }
            if (ctrl) scannerControlsRef.current = ctrl;
        }).catch(() => setIsScannerOpen(false));
    }
    return () => { if (scannerControlsRef.current) scannerControlsRef.current.stop(); };
  }, [isScannerOpen]);

  const handleRegistrarSalida = async () => {
    if (!(await trigger('usuario'))) return alert('Falta Usuario');
    const usuario = getValues('usuario');
    const tools = watchedManualTools.filter(t => patronesMap.has(t.herramienta));
    
    if (!tools.length) return alert('Debes agregar al menos un patrón manualmente para registrar salida en base de datos.');
    if (!window.confirm(`¿Confirmar salida de ${tools.length} equipos a ${usuario}?`)) return;

    setIsSavingBatch(true);
    try {
        const batch = writeBatch(db);
        tools.forEach(t => {
            const pid = patronesMap.get(t.herramienta)?.id;
            if (pid) {
                batch.update(doc(db, COLLECTION_NAME_PATRONES, pid), {
                    estadoProceso: 'en_servicio',
                    usuarioEnUso: usuario,
                    usuarioAsignado: usuario,
                    ubicacionActual: `Planta - ${usuario}`,
                    fechaPrestamo: new Date().toISOString().split('T')[0]
                });
            }
        });
        await batch.commit();
        await reloadPatrones();
        alert('Salida registrada correctamente en Firebase.');
        setValue('manualTools', []);
        setLinkNotice('Salida registrada. Los estados se sincronizaron con Programa de Calibración.');
    } catch (e) { alert('Error al guardar en base de datos.'); } 
    finally { setIsSavingBatch(false); }
  };

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-[#f8fafc]">
      <style>{styles}</style>
      
      {/* DATALIST con filtro para ocultar los ya seleccionados */}
      <datalist id="patrones-list">
        {sortedPatronOptions.map(op => {
            const isSelected = watchedManualTools.some(t => t.herramienta === op.nombre);
            if (isSelected) return null; // Si ya lo tomó, desaparece de las opciones sugeridas
            return (
                <option key={op.id} value={op.nombre}>
                    {op.status === 'vencido' ? '(VENCIDO)' : ''}
                </option>
            );
        })}
      </datalist>

      {isScannerOpen && (
        <div className="scanner-overlay" onClick={stopScan}>
          <div className="scanner-box" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4 text-gray-900 text-lg text-center">Escanear Patrón</h3>
            <video ref={videoRef} className="scanner-video" />
            <button className="btn btn-danger w-full" onClick={stopScan}><X size={18} /> Cancelar</button>
          </div>
        </div>
      )}

      <div className="layout-container">
        {linkNotice && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span>{linkNotice}</span>
            <button type="button" onClick={() => setLinkNotice(null)} className="text-blue-600 hover:text-blue-800 shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8 rounded-2xl bg-[#0050d8] text-white px-5 py-4 shadow-md">
           <div className="flex items-center gap-4">
              <button className="rounded-full p-3 bg-white/15 hover:bg-white/25 transition-colors" onClick={() => navigateTo('menu')} aria-label="Volver al menú">
                <ArrowLeft size={22} />
              </button>
              <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Equipos y Servicios AG</p>
                  <h1 className="text-2xl font-bold">Hoja de Herramienta</h1>
                  <p className="text-white/80 text-sm">Registro de salida · Laboratorio de Metrología</p>
              </div>
           </div>
           <div className="flex items-center gap-3">
             <div className="text-right hidden sm:block bg-white/10 px-4 py-2 rounded-lg border border-white/20">
                <span className="text-xs font-bold text-white/70 block uppercase">Hoy</span>
                <div className="font-mono font-bold text-lg">{new Date().toLocaleDateString()}</div>
             </div>
           </div>
        </div>

        {/* RESPONSABLE */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6 border-b pb-4">
              <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><User size={24}/></div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Responsable</h2>
                <p className="help-text mb-0">Datos que aparecen en el registro de salida y en los PDF.</p>
              </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="normas-fecha">Fecha de salida *</label>
                <div className="relative">
                  <input id="normas-fecha" type="date" className="input-control" {...register('fecha', { required: true })} aria-required="true" />
                </div>
            </div>
            <div>
                <label htmlFor="normas-usuario">Metrólogo / Técnico *</label>
                <select id="normas-usuario" {...register('usuario', { required: 'Selecciona un metrólogo' })} className="input-control" aria-invalid={!!errors.usuario} disabled={isLoadingMetrologos}>
                  <option value="">{isLoadingMetrologos ? 'Cargando metrólogos...' : '-- Seleccionar --'}</option>
                  {metrologos.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                </select>
                {errors.usuario && <p className="field-error" role="alert">{String(errors.usuario.message)}</p>}
            </div>
            <div>
                 <label htmlFor="normas-empleado">No. Empleado *</label>
                 <input id="normas-empleado" className="input-control" {...register('noEmpleado', { required: 'Número de empleado requerido' })} placeholder="Ej: 1234" aria-invalid={!!errors.noEmpleado} />
                 {errors.noEmpleado && <p className="field-error" role="alert">{String(errors.noEmpleado.message)}</p>}
            </div>
            <div>
                 <label htmlFor="normas-compania">Compañía</label>
                 <input id="normas-compania" className="input-control" {...register('companiaDepto')} />
            </div>
            <div className="md:col-span-2">
                 <label htmlFor="normas-gafete">Gafete (opcional)</label>
                 <input id="normas-gafete" className="input-control" {...register('gafeteContratista')} placeholder="Solo si aplica para el cliente" />
            </div>
          </div>
        </div>

        {/* KITS */}
        <div className="card">
            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Briefcase size={24}/></div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Kits Rápidos (Mochilas)</h2>
                  <p className="help-text mb-0">Herramientas fijas del kit. Las etiquetadoras se agregan solo como patrón manual.</p>
                </div>
            </div>
            {!watchedUsuario && (
              <p className="help-text mb-4 flex items-center gap-2"><Info size={14}/> Selecciona un metrólogo para resaltar su mochila automáticamente.</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6" role="group" aria-label="Selección de mochilas">
              <Controller name="selectedBackpacks" control={control} render={({ field }) => (
                  <>
                    {Object.entries(BACKPACK_CATALOG).map(([id, backpack]) => {
                        const isSelected = field.value.includes(id);
                        const isOwnKit = usuarioOwnerKey === backpack.ownerKey;
                        return (
                        <label key={id} className={`border p-4 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${isSelected ? 'bg-blue-50 border-blue-500 shadow-md' : 'hover:bg-gray-50'} ${isOwnKit && watchedUsuario ? 'ring-2 ring-blue-200' : ''}`}>
                          <input type="checkbox" className="sr-only" checked={isSelected} aria-label={backpack.nombre}
                            onChange={e => field.onChange(e.target.checked ? [...field.value, id] : field.value.filter(v => v !== id))} />
                          <Package size={28} className={isSelected ? 'text-blue-600' : 'text-gray-400'} aria-hidden="true" />
                          <div>
                              <span className={`block font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-600'}`}>{backpack.nombre}</span>
                              <span className="text-xs text-gray-400">{backpack.items.length} pzas</span>
                              {isOwnKit && watchedUsuario && <span className="text-xs text-blue-600 font-semibold">Tu kit</span>}
                          </div>
                        </label>
                        );
                    })}
                  </>
              )} />
            </div>
            
            {aggregatedTools.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border">
                    <h3 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2"><Info size={16}/> Resumen de Herramientas en Kits</h3>
                    <table className="modern-table bg-white rounded-lg">
                        <thead><tr><th>Herramienta</th><th className="text-center">Cant.</th><th>Marca</th><th>Modelo</th></tr></thead>
                        <tbody>
                            {aggregatedTools.map((t, i) => (
                                <tr key={i}>
                                    <td className="font-medium">{t.herramienta}</td>
                                    <td className="text-center font-bold text-blue-700">{t.qty}</td>
                                    <td>{t.marca}</td>
                                    <td>{t.modelo}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* ESCANEO MANUAL */}
        <div className="card">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 border-b pb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Camera size={24}/></div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Patrones y Equipo Extra</h2>
                      <p className="help-text mb-0">Patrones de calibración, equipo prestado o etiquetadora si la llevas.</p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button type="button" className="btn btn-secondary" onClick={() => setIsScannerOpen(true)} aria-label="Escanear código de patrón"><Camera size={18}/> Escanear</button>
                    <button type="button" className="btn btn-secondary" onClick={handleAddManualRow} aria-label="Agregar patrón manual"><Plus size={18}/> Patrón manual</button>
                </div>
            </div>
            
            {fields.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Printer size={18} className="text-slate-600"/>
                      <h3 className="text-sm font-bold text-slate-700">Etiquetadoras por persona</h3>
                    </div>
                    <p className="help-text mb-3">No todos tienen impresora asignada; agrega la que uses o la que prestes.</p>
                    <div className="flex flex-wrap gap-2">
                      {ETIQUETADORAS_CATALOG.map(etiq => {
                        const yaAgregada = isEtiquetadoraInList(watchedManualTools, etiq.item.serie);
                        const esPropia = usuarioOwnerKey === etiq.ownerKey;
                        return (
                          <button
                            key={etiq.ownerKey}
                            type="button"
                            className={`etiquetadora-chip ${esPropia ? 'is-own' : ''}`}
                            disabled={yaAgregada}
                            onClick={() => handleAddEtiquetadora(etiq)}
                            title={yaAgregada ? 'Ya en la lista' : `Agregar etiquetadora de ${etiq.persona}`}
                          >
                            <Printer size={14}/>
                            <span><strong>{etiq.persona}</strong> · {etiq.item.serie}</span>
                            {esPropia && <span className="text-blue-600 text-xs">(tuya)</span>}
                          </button>
                        );
                      })}
                    </div>
                </div>
            )}

            {isAnyPatronVencido && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3">
                    <AlertTriangle size={24}/> 
                    <div><strong>Equipos Vencidos:</strong> Hay equipos con calibración expirada en tu lista manual.</div>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="modern-table" style={{ minWidth: '800px' }}>
                    <thead>
                        <tr>
                            <th className="w-8">#</th>
                            <th>Patrón / Equipo (Busca o escribe)</th>
                            <th style={{ width: '70px' }}>Cant</th>
                            <th>Marca</th>
                            <th>Modelo</th>
                            <th>Serie</th>
                            <th className="w-24">Estado</th>
                            <th className="w-12"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {fields.length === 0 && (
                            <tr>
                              <td colSpan={8}>
                                <div className="empty-state">
                                  <Package size={40}/>
                                  <p className="font-medium text-gray-500">Sin patrones ni equipo extra</p>
                                  <p className="text-sm mt-1">Usa <strong>Escanear</strong> o <strong>Patrón manual</strong> para agregar equipos de calibración o una etiquetadora.</p>
                                </div>
                              </td>
                            </tr>
                        )}
                        {fields.map((item, index) => {
                             const selectedTool = watchedManualTools[index]?.herramienta;
                             const current = patronesMap.get(selectedTool);
                             return (
                                <tr key={item.id} className={current?.status === 'vencido' ? 'bg-red-50' : ''}>
                                    <td className="font-bold text-gray-400 text-center">{index + 1}</td>
                                    <td>
                                        <Controller name={`manualTools.${index}.herramienta`} control={control} render={({ field }) => (
                                            <input 
                                                {...field}
                                                list="patrones-list"
                                                className="input-control text-sm px-2 py-1.5"
                                                placeholder="Escribe o selecciona..."
                                                autoComplete="off"
                                                onChange={e => {
                                                    field.onChange(e.target.value);
                                                    const p = patronesMap.get(e.target.value);
                                                    if (p) {
                                                        if (isPatronUnavailable(p.estadoProceso)) {
                                                          setLinkNotice(`Atención: ${p.noControl} está ${p.estadoProceso.replace(/_/g, ' ')}.`);
                                                        }
                                                        setValue(`manualTools.${index}.marca`, p.marca);
                                                        setValue(`manualTools.${index}.modelo`, p.modelo);
                                                        setValue(`manualTools.${index}.serie`, p.serie);
                                                        setValue(`manualTools.${index}.isVencida`, p.status === 'vencido' || p.status === 'critico');
                                                        setValue(`manualTools.${index}.estadoProceso`, p.estadoProceso);
                                                    } else {
                                                        setValue(`manualTools.${index}.isVencida`, false);
                                                        setValue(`manualTools.${index}.estadoProceso`, undefined);
                                                    }
                                                }}
                                            />
                                        )} />
                                    </td>
                                    <td>
                                        <input type="number" className="input-control text-sm px-2 py-1.5" {...register(`manualTools.${index}.qty`)} />
                                    </td>
                                    <td>
                                        <input className="input-control text-sm px-2 py-1.5" placeholder="Marca" {...register(`manualTools.${index}.marca`)} />
                                    </td>
                                    <td>
                                        <input className="input-control text-sm px-2 py-1.5" placeholder="Modelo" {...register(`manualTools.${index}.modelo`)} />
                                    </td>
                                    <td>
                                        <input className="input-control text-sm px-2 py-1.5" placeholder="Serie" {...register(`manualTools.${index}.serie`)} />
                                    </td>
                                    <td className="text-center">
                                        {current ? (
                                          <span className={`status-badge status-${['vencido','vigente','pendiente'].includes(current.status) ? current.status : current.status === 'critico' ? 'critico' : current.status === 'proximo' ? 'proximo' : 'pendiente'}`}>
                                            {current.status === 'critico' ? 'crítico' : current.status === 'proximo' ? 'próximo' : current.status}
                                          </span>
                                        ) : watchedManualTools[index]?.herramienta ? (
                                          <span className="status-badge status-pendiente">manual</span>
                                        ) : (
                                          <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td>
                                        <button type="button" onClick={() => remove(index)} className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors" aria-label={`Quitar fila ${index + 1}`}><X size={18}/></button>
                                    </td>
                                </tr>
                             )
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* BARRA DE ACCIONES */}
        <div className="floating-bar">
            <div className="hidden md:block text-sm font-medium text-gray-600">
                <span>Kit: <strong>{aggregatedTools.length}</strong></span>
                <span className="mx-2 text-gray-300">|</span>
                <span>Manual: <strong>{fields.length}</strong></span>
                <span className="mx-2 text-gray-300">|</span>
                <span>Total: <strong className="text-blue-600">{aggregatedTools.length + fields.length}</strong></span>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
                <button 
                    type="button" 
                    className="btn btn-success flex-1" 
                    onClick={handleRegistrarSalida} 
                    disabled={isSavingBatch || (fields.length === 0)}
                >
                    {isSavingBatch ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} Registrar en Sistema
                </button>
                
                <button 
                    type="button" 
                    className="btn btn-primary flex-1" 
                    onClick={() => handlePdf('cel')}
                >
                    <FileText size={20}/> Celestica
                </button>
                
                <button 
                    type="button" 
                    className="btn btn-secondary flex-1" 
                    onClick={() => handlePdf('gen')}
                >
                    <FileText size={20}/> Genérico
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default NormasScreen;