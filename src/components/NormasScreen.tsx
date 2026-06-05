import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { differenceInDays, parseISO } from 'date-fns'; 
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore'; 
import { db } from '../utils/firebase';
import { 
  ArrowLeft, Package, Plus, Loader2, AlertTriangle, 
  Camera, X, Save, FileText, Briefcase, Info, Printer
} from 'lucide-react'; 
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import {
  COLLECTION_PATRONES,
  formatPatronNombre,
  isPatronCalibracionVencido,
  isPatronUnavailable,
} from '../utils/patronLink';
import labLogo from '../assets/lab_logo.png';

const AG_BLUE = '#2464A3';
const COLLECTION_NAME_PATRONES = COLLECTION_PATRONES;
const INPUT_CLASS =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/15 transition-colors';
const TABLE_INPUT = `${INPUT_CLASS} py-1.5`;

const FormField = ({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1.5">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-600 mt-1" role="alert">{error}</p>}
  </div>
);

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

const STATUS_BADGE: Record<PatronBase['status'] | 'manual', string> = {
  vigente: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vencido: 'bg-red-50 text-red-700 border-red-200',
  critico: 'bg-orange-50 text-orange-700 border-orange-200',
  proximo: 'bg-amber-50 text-amber-700 border-amber-200',
  pendiente: 'bg-slate-100 text-slate-600 border-slate-200',
  manual: 'bg-slate-100 text-slate-500 border-slate-200',
};

const statusLabel = (status: PatronBase['status']) =>
  status === 'critico' ? 'crítico' : status === 'proximo' ? 'próximo' : status;

// ==================================================================
// --- 3. CATÁLOGOS Y HELPERS ---
// ==================================================================

const BACKPACK_CATALOG = {
  mochila_abraham: { nombre: 'Mochila 1 (Abraham)', ownerKey: 'abraham', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017166' } ] },
  mochila_Dante: { nombre: 'Mochila 2 (Dante)', ownerKey: 'dante', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVEPNEU0017947' } ] },
  mochila_Angel: { nombre: 'Mochila 3 (Angel)', ownerKey: 'angel', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700130' } ] },
  mochila_Edgar: { nombre: 'Mochila 4 (Edgar)', ownerKey: 'edgar', items: [ { herramienta: 'Desarmador Plano', qty: "1", marca: 'Urrea', modelo: 'S/M', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '8"', serie: 'N/A' }, { herramienta: 'Destornillador ESD', qty: "4", marca: 'Urrea', modelo: 'S/M', serie: 'Sm' }, { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700114' } ] },
  mochila_Mario: { nombre: 'Mochila 5 (Mario)', ownerKey: 'mario', items: [ { herramienta: 'Perica', qty: "1", marca: 'Pretul', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Urrea', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Rojo', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Verde', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Gris', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'CUBOT', modelo: 'TAB-KINKONG-S', serie: 'TKKS251119004059' }, { herramienta: 'Cepillo', qty: "2", marca: 'S/M', modelo: 'S/M', serie: 'S/N' } ] },
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
    if (isPatronCalibracionVencido(fecha)) return 'vencido';
    try {
        const dias = differenceInDays(parseISO(fecha), new Date());
        if (dias >= 0 && dias <= 7) return 'critico';
        if (dias > 7 && dias <= 30) return 'proximo';
        return 'vigente';
    } catch {
        return 'pendiente';
    }
};

const patronEstaVencido = (p: PatronBase) => isPatronCalibracionVencido(p.fechaVencimiento);

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

    // La plantilla puede incluir hojas en blanco; conservar solo la primera como base
    while (pdfDoc.getPageCount() > 1) {
      pdfDoc.removePage(pdfDoc.getPageCount() - 1);
    }

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

        // Fecha de impresión en el pie del documento (abajo a la derecha)
        page.drawRectangle({ x: 395, y: 30, width: 185, height: 18, color: rgb(1, 1, 1) });
        page.drawText(`Fecha de Impresión ${currentDateStr}`, { x: 400, y: 36, size: fontSize, font, color });

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

    // Por si quedó alguna hoja sin usar
    while (pdfDoc.getPageCount() > toolChunks.length) {
      pdfDoc.removePage(pdfDoc.getPageCount() - 1);
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

  const { register, control, setValue, watch, trigger, getValues, formState: { errors } } = useForm<FormInputs>({
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
    if (patronEstaVencido(p)) {
      setLinkNotice(`El patrón ${p.noControl} está vencido. No puede salir a servicio hasta recalibrarlo.`);
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
      isVencida: false,
      isUnavailable: false,
      estadoProceso: p.estadoProceso,
    });
    setLinkNotice(`${sourceLabel}: ${p.noControl} agregado a la hoja.`);
  }, [append, getValues]);

  const aggregatedTools = useMemo(() => aggregateTools(watchedBackpacks || []), [watchedBackpacks]);
  const hasPatronVencidoEnLista = useMemo(
    () => watchedManualTools.some(t => {
      const p = patronesMap.get(t.herramienta);
      return p ? patronEstaVencido(p) : false;
    }),
    [watchedManualTools, patronesMap],
  );

  // Auto-seleccionar mochila del metrólogo responsable
  useEffect(() => {
    if (!watchedUsuario) {
      setValue('selectedBackpacks', []);
      return;
    }
    const backpackId = resolveBackpackIdForUsuario(watchedUsuario);
    if (backpackId) setValue('selectedBackpacks', [backpackId]);
  }, [watchedUsuario, setValue]);

  const handleAddManualRow = () => {
    append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '' });
  };

  const handleAddEtiquetadora = (etiq: typeof ETIQUETADORAS_CATALOG[number]) => {
    if (isEtiquetadoraInList(watchedManualTools, etiq.item.serie)) {
      setLinkNotice(`La etiquetadora de ${etiq.persona} ya está en la lista.`);
      return;
    }
    append({ ...etiq.item, isVencida: false, isUnavailable: false });
    setLinkNotice(`Etiquetadora de ${etiq.persona} agregada.`);
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

    if (hasPatronVencidoEnLista) {
      setLinkNotice('Hay patrones vencidos en la lista. Retírelos antes de generar el PDF.');
      return;
    }

    if (type === 'cel') {
        await generateCelesticaPdf(data, allTools);
    } else {
        await generateGenericPdf(data, allTools);
    }
  };

  const stopScan = useCallback(() => {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setIsScannerOpen(false);
  }, []);

  const handleScan = useCallback((code: string) => {
    if (!code) return;
    const p = patronesScannerMap.get(code);
    if (!p) {
      setLinkNotice(`Patrón no encontrado: ${code}. Escanea el No. de Control registrado en Programa.`);
      return;
    }
    stopScan();
    appendPatronToForm(p, 'Escaneo');
  }, [patronesScannerMap, stopScan, appendPatronToForm]);

  useEffect(() => {
    if (!isScannerOpen || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let mounted = true;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, (res, _err, ctrl) => {
        if (!mounted) return;
        if (res) {
          handleScan(res.getText());
          ctrl?.stop();
        }
        if (ctrl) scannerControlsRef.current = ctrl;
      })
      .catch(() => setIsScannerOpen(false));

    return () => {
      mounted = false;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [isScannerOpen, handleScan]);

  const handleRegistrarSalida = async () => {
    if (!(await trigger('usuario'))) return alert('Falta Usuario');
    const usuario = getValues('usuario');
    const tools = watchedManualTools.filter(t => patronesMap.has(t.herramienta));

    if (!tools.length) return alert('Debes agregar al menos un patrón manualmente para registrar salida en base de datos.');

    const vencidos = tools.filter(t => {
      const p = patronesMap.get(t.herramienta);
      return p && patronEstaVencido(p);
    });
    if (vencidos.length > 0) {
      setLinkNotice('No se puede registrar salida: hay patrones vencidos en la lista.');
      return;
    }

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

  const totalEquipos = aggregatedTools.length + fields.length;

  return (
    <div className="min-h-full w-full flex-shrink-0 bg-[#eef2f7] text-slate-800 font-sans">
      <datalist id="patrones-list">
        {sortedPatronOptions.map(op => {
          const isSelected = watchedManualTools.some(t => t.herramienta === op.nombre);
          if (isSelected || patronEstaVencido(op)) return null;
          return <option key={op.id} value={op.nombre} />;
        })}
      </datalist>

      {isScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4" onClick={stopScan}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 text-center mb-4">Escanear patrón</h3>
            <video ref={videoRef} className="w-full rounded-lg bg-black mb-4" />
            <button
              type="button"
              onClick={stopScan}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
            >
              <X size={18} /> Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigateTo('menu')}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            aria-label="Volver al menú"
          >
            <ArrowLeft size={20} />
          </button>
          <img src={labLogo} alt="Equipos y Servicios AG" className="h-10 w-auto object-contain" />
          <div className="flex-1 min-w-0 border-l border-slate-200 pl-4">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">Hoja de Herramienta</h1>
            <p className="text-xs sm:text-sm text-slate-500 truncate">
              Registro de salida · Laboratorio de Metrología
            </p>
          </div>
          <span className="hidden sm:inline-block text-xs text-slate-500 font-medium tabular-nums">
            {new Date().toLocaleDateString('es-MX')}
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 pb-8">
        {linkNotice && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span>{linkNotice}</span>
            <button type="button" onClick={() => setLinkNotice(null)} className="text-blue-600 hover:text-blue-800 shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-base font-semibold text-slate-900">1. Responsable del servicio</h2>
            <p className="text-sm text-slate-500 mt-0.5">Datos que aparecen en el registro de salida y en los PDF.</p>
          </div>
          <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Fecha de salida" required>
              <input id="normas-fecha" type="date" className={INPUT_CLASS} {...register('fecha', { required: true })} />
            </FormField>
            <FormField label="Metrólogo / Técnico" required error={errors.usuario?.message as string}>
              <select
                id="normas-usuario"
                {...register('usuario', { required: 'Selecciona un metrólogo' })}
                className={INPUT_CLASS}
                disabled={isLoadingMetrologos}
              >
                <option value="">{isLoadingMetrologos ? 'Cargando metrólogos...' : 'Seleccionar metrólogo'}</option>
                {metrologos.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
            </FormField>
            <FormField label="No. de empleado" required error={errors.noEmpleado?.message as string}>
              <input id="normas-empleado" className={INPUT_CLASS} {...register('noEmpleado', { required: 'Número de empleado requerido' })} placeholder="Ej. 1234" />
            </FormField>
            <FormField label="Compañía">
              <input id="normas-compania" className={INPUT_CLASS} {...register('companiaDepto')} />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Gafete de contratista (opcional)">
                <input id="normas-gafete" className={INPUT_CLASS} {...register('gafeteContratista')} placeholder="Solo si aplica para el cliente" />
              </FormField>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Briefcase size={18} style={{ color: AG_BLUE }} />
              2. Kits de herramienta (mochilas)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Herramientas fijas del kit. Las etiquetadoras se agregan en la sección de patrones.
            </p>
          </div>
          <div className="p-5 sm:p-6">
            {!watchedUsuario && (
              <p className="text-sm text-slate-500 mb-4 flex items-center gap-2">
                <Info size={14} /> Seleccione un metrólogo para asignar su mochila automáticamente.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="group" aria-label="Selección de mochilas">
              <Controller
                name="selectedBackpacks"
                control={control}
                render={({ field }) => (
                  <>
                    {Object.entries(BACKPACK_CATALOG).map(([id, backpack]) => {
                      const isSelected = field.value.includes(id);
                      const isOwnKit = usuarioOwnerKey === backpack.ownerKey;
                      return (
                        <label
                          key={id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-[#2464A3]/40 bg-[#2464A3]/5'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          } ${isOwnKit && watchedUsuario ? 'ring-1 ring-[#2464A3]/30' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-[#2464A3] focus:ring-[#2464A3]/30"
                            checked={isSelected}
                            onChange={e => field.onChange(
                              e.target.checked ? [...field.value, id] : field.value.filter(v => v !== id)
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-800">{backpack.nombre}</span>
                            <span className="text-xs text-slate-500">{backpack.items.length} piezas</span>
                            {isOwnKit && watchedUsuario && (
                              <span className="text-xs font-medium" style={{ color: AG_BLUE }}>Kit asignado</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </>
                )}
              />
            </div>

            {aggregatedTools.length > 0 && (
              <div className="mt-5 rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Resumen del kit seleccionado
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Herramienta</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 w-16">Cant.</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Marca</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Modelo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedTools.map((t, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{t.herramienta}</td>
                          <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{t.qty}</td>
                          <td className="px-4 py-2.5 text-slate-600">{t.marca}</td>
                          <td className="px-4 py-2.5 text-slate-600">{t.modelo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Camera size={18} style={{ color: AG_BLUE }} />
                3. Patrones y equipo adicional
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Patrones de calibración, equipo prestado o etiquetadora.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Camera size={16} /> Escanear
              </button>
              <button
                type="button"
                onClick={handleAddManualRow}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Plus size={16} /> Agregar fila
              </button>
            </div>
          </div>

          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-2">
              <Printer size={16} className="text-slate-500" />
              Etiquetadoras
            </h3>
            <p className="text-xs text-slate-500 mb-3">Agregue la impresora que lleva o la que presta.</p>
            <div className="flex flex-wrap gap-2">
              {ETIQUETADORAS_CATALOG.map(etiq => {
                const yaAgregada = isEtiquetadoraInList(watchedManualTools, etiq.item.serie);
                const esPropia = usuarioOwnerKey === etiq.ownerKey;
                return (
                  <button
                    key={etiq.ownerKey}
                    type="button"
                    disabled={yaAgregada}
                    onClick={() => handleAddEtiquetadora(etiq)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      esPropia
                        ? 'border-[#2464A3]/40 bg-[#2464A3]/5 text-slate-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Printer size={14} />
                    <span>{etiq.persona} · {etiq.item.serie}</span>
                    {esPropia && <span style={{ color: AG_BLUE }}>(propia)</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {hasPatronVencidoEnLista && (
            <div className="mx-5 sm:mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <span><strong>Patrones vencidos:</strong> Retire los equipos vencidos de la lista para poder registrar salida o generar PDF.</span>
            </div>
          )}

          <div className="p-5 sm:p-6 overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500 w-8">#</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Patrón / Equipo</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500 w-16">Cant.</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Marca</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Modelo</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Serie</th>
                  <th className="text-center px-2 py-2 text-xs font-semibold text-slate-500 w-24">Estado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Package size={36} className="mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-medium text-slate-500">Sin patrones ni equipo adicional</p>
                      <p className="text-xs mt-1 text-slate-400">Use Escanear, Agregar fila o seleccione una etiquetadora.</p>
                    </td>
                  </tr>
                )}
                {fields.map((item, index) => {
                  const selectedTool = watchedManualTools[index]?.herramienta;
                  const current = patronesMap.get(selectedTool);
                  const badgeKey = current?.status ?? (watchedManualTools[index]?.herramienta ? 'manual' : null);
                  return (
                    <tr key={item.id} className={`border-b border-slate-100 ${current?.status === 'vencido' ? 'bg-red-50/50' : ''}`}>
                      <td className="px-2 py-2 text-center text-xs text-slate-400 font-medium">{index + 1}</td>
                      <td className="px-2 py-2">
                        <Controller
                          name={`manualTools.${index}.herramienta`}
                          control={control}
                          render={({ field }) => (
                            <input
                              {...field}
                              list="patrones-list"
                              className={TABLE_INPUT}
                              placeholder="Buscar o escribir..."
                              autoComplete="off"
                              onChange={e => {
                                const valor = e.target.value;
                                const p = patronesMap.get(valor);
                                if (p && patronEstaVencido(p)) {
                                  field.onChange('');
                                  setValue(`manualTools.${index}.marca`, '');
                                  setValue(`manualTools.${index}.modelo`, '');
                                  setValue(`manualTools.${index}.serie`, '');
                                  setValue(`manualTools.${index}.qty`, '1');
                                  setValue(`manualTools.${index}.isVencida`, false);
                                  setValue(`manualTools.${index}.estadoProceso`, undefined);
                                  setLinkNotice(`El patrón ${p.noControl} está vencido. No puede seleccionarse.`);
                                  return;
                                }
                                field.onChange(valor);
                                if (p) {
                                  if (isPatronUnavailable(p.estadoProceso)) {
                                    setLinkNotice(`Atención: ${p.noControl} está ${p.estadoProceso.replace(/_/g, ' ')}.`);
                                  }
                                  setValue(`manualTools.${index}.marca`, p.marca);
                                  setValue(`manualTools.${index}.modelo`, p.modelo);
                                  setValue(`manualTools.${index}.serie`, p.serie);
                                  setValue(`manualTools.${index}.isVencida`, false);
                                  setValue(`manualTools.${index}.estadoProceso`, p.estadoProceso);
                                } else {
                                  setValue(`manualTools.${index}.isVencida`, false);
                                  setValue(`manualTools.${index}.estadoProceso`, undefined);
                                }
                              }}
                            />
                          )}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={1} className={TABLE_INPUT} {...register(`manualTools.${index}.qty`)} />
                      </td>
                      <td className="px-2 py-2">
                        <input className={TABLE_INPUT} placeholder="Marca" {...register(`manualTools.${index}.marca`)} />
                      </td>
                      <td className="px-2 py-2">
                        <input className={TABLE_INPUT} placeholder="Modelo" {...register(`manualTools.${index}.modelo`)} />
                      </td>
                      <td className="px-2 py-2">
                        <input className={TABLE_INPUT} placeholder="Serie" {...register(`manualTools.${index}.serie`)} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {badgeKey ? (
                          <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase ${STATUS_BADGE[badgeKey]}`}>
                            {badgeKey === 'manual' ? 'manual' : statusLabel(badgeKey)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label={`Quitar fila ${index + 1}`}
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="text-sm text-slate-600">
            <p>
              Kit: <span className="font-semibold text-slate-800">{aggregatedTools.length}</span>
              {' · '}
              Manual: <span className="font-semibold text-slate-800">{fields.length}</span>
              {' · '}
              Total: <span className="font-semibold" style={{ color: AG_BLUE }}>{totalEquipos}</span>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleRegistrarSalida}
              disabled={isSavingBatch || fields.length === 0 || hasPatronVencidoEnLista}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSavingBatch ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Registrar salida
            </button>
            <button
              type="button"
              onClick={() => handlePdf('cel')}
              disabled={hasPatronVencidoEnLista}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: AG_BLUE }}
            >
              <FileText size={18} /> PDF Celestica
            </button>
            <button
              type="button"
              onClick={() => handlePdf('gen')}
              disabled={hasPatronVencidoEnLista}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={18} /> PDF Genérico
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default NormasScreen;