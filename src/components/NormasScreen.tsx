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
  Camera, X, Save, FileText, Briefcase, Info
} from 'lucide-react'; 
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

// ==================================================================
// --- 1. CONFIGURACIÓN Y ESTILOS ---
// ==================================================================

const COLLECTION_NAME_PATRONES = "patronesCalibracion"; 

const styles = `
  :root { --primary: #2563eb; --bg-page: #f8fafc; --text-main: #1e293b; }
  body { background: var(--bg-page); color: var(--text-main); font-family: sans-serif; }
  .layout-container { max-width: 1200px; margin: 0 auto; padding: 20px; padding-bottom: 100px; }
  .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
  
  /* Botones mejorados */
  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; gap: 8px; transition: all 0.2s; }
  .btn-primary { background: var(--primary); color: white; box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.3); }
  .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
  .btn-success { background: #10b981; color: white; box-shadow: 0 4px 14px 0 rgba(16, 185, 129, 0.3); }
  .btn-success:hover { background: #059669; transform: translateY(-1px); }
  .btn-danger { background: #fee2e2; color: #b91c1c; }
  .btn-secondary { background: white; border: 1px solid #cbd5e1; color: #475569; }
  .btn-secondary:hover { background: #f1f5f9; border-color: #94a3b8; }
  
  /* Inputs forzados a blanco para corregir error visual */
  .input-control { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 5px; background-color: #ffffff !important; color: #1e293b !important; font-size: 0.95rem; }
  .input-control:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
  label { font-weight: 600; color: #475569; font-size: 0.85rem; margin-bottom: 4px; display: block; }
  
  /* Tablas */
  .modern-table { width: 100%; border-collapse: separate; border-spacing: 0; }
  .modern-table th { text-align: left; padding: 12px 16px; background: #f8fafc; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700; border-bottom: 1px solid #e2e8f0; letter-spacing: 0.05em; }
  .modern-table td { padding: 14px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 0.9rem; }
  .modern-table tr:last-child td { border-bottom: none; }
  
  .status-badge { padding: 4px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
  .status-vencido { background: #fecaca; color: #991b1b; }
  .status-vigente { background: #dcfce7; color: #166534; }
  .status-pendiente { background: #f1f5f9; color: #64748b; }
  
  .floating-bar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 1100px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); padding: 16px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); display: flex; gap: 12px; justify-content: space-between; align-items: center; z-index: 50; border: 1px solid #e2e8f0; }
  
  .scanner-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.9); z-index: 100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
  .scanner-box { background: white; padding: 24px; width: 90%; max-width: 500px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
  .scanner-video { width: 100%; border-radius: 12px; background: black; margin-bottom: 16px; overflow: hidden; }

  /* Estilos para las opciones del Select */
  option.opt-vencido { color: #dc2626; font-weight: bold; background-color: #fef2f2; }
  option.opt-unavailable { color: #94a3b8; font-style: italic; background-color: #f8fafc; }
  option.opt-normal { color: #1e293b; }
`;

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

// CATALOGO DE MOCHILAS
const BACKPACK_CATALOG = {
  mochila_abraham: { nombre: 'Mochila 1 (Abraham)', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017166' }, { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700459' } ] },
  mochila_Dante: { nombre: 'Mochila 2 (Dante)', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVEPNEU0017947' }, { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X1Y00150' } ] },
  mochila_Angel: { nombre: 'Mochila 3 (Angel)', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700130' }, { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700192' } ] },
  mochila_Edgar: { nombre: 'Mochila 4 (Edgar)', items: [ { herramienta: 'Desarmador Plano', qty: "1", marca: 'Urrea', modelo: 'S/M', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Husky', modelo: '8"', serie: 'N/A' }, { herramienta: 'Destornillador ESD', qty: "4", marca: 'Urrea', modelo: 'S/M', serie: 'Sm' }, { herramienta: 'Impresora', qty: "1", marca: 'Epson', modelo: 'LW-PX400', serie: 'X69X2700191' }, { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'Fossibot', modelo: 'DT2', serie: 'DT220240700114' } ] },
  mochila_Daniel: { nombre: 'Mochila 5 (Daniel)', items: [ { herramienta: 'Perica', qty: "1", marca: 'Pretul', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'Urrea', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinza Electrica', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Rojo', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Verde', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Gris', qty: "1", marca: 'Husky', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0023514' }, { herramienta: 'Cepillo', qty: "2", marca: 'S/M', modelo: 'S/M', serie: 'S/N' } ] },
  mochila_Ricardo: { nombre: 'Mochila 6 (Ricardo)', items: [ { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '6"', serie: 'N/A' }, { herramienta: 'Perica', qty: "1", marca: 'FOY', modelo: '10"', serie: 'N/A' }, { herramienta: 'Desarmadores', qty: "4", marca: 'sm', modelo: 'sm', serie: 'Sm' }, { herramienta: 'Set Relojero', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/M' }, { herramienta: 'Pinzas', qty: "5", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Azul', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Set llaves Allen Rojo', qty: "1", marca: 'S/M', modelo: 'S/M', serie: 'S/N' }, { herramienta: 'Tablet', qty: "1", marca: 'BlackView', modelo: 'Active 8 Pro', serie: 'ACTIVE8PNEU0017933' } ] },
};

// --- Helpers ---

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

// --- PDF Generators ---
async function generateCelesticaPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const existingPdfBytes = await fetch('/template.pdf').then(res => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const firstPage = pdfDoc.getPages()[0];
    const { height } = firstPage.getSize();
    const fontSize = 9;
    const color = rgb(0, 0, 0);

    firstPage.drawText(data.fecha, { x: 60, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.usuario, { x: 320, y: height - 82, size: fontSize, font, color });
    firstPage.drawText(data.gafeteContratista, { x: 490, y: height - 80, size: fontSize, font, color });
    firstPage.drawText(data.companiaDepto, { x: 320, y: height - 114, size: fontSize, font, color });
    firstPage.drawText(data.noEmpleado, { x: 500, y: height - 114, size: fontSize, font, color });

    let yStartTable = height - 222; 
    const availableTools = allTools.filter(tool => 
        !['en_proceso', 'fuera_servicio', 'en_servicio', 'en_prestamo', 'en_mantenimiento'].includes(tool.estadoProceso || '')
    );

    availableTools.slice(0, 30).forEach((tool, index) => {
      const y = yStartTable - (index * 16.7);
      firstPage.drawText(cleanToolNameForPdf(tool.herramienta), { x: 40, y, size: fontSize, font, color });
      firstPage.drawText(String(tool.qty), { x: 270, y, size: fontSize, font, color });
      firstPage.drawText(tool.marca, { x: 310, y, size: fontSize, font, color });
      firstPage.drawText(tool.modelo, { x: 400, y, size: fontSize, font, color });
      firstPage.drawText(tool.serie, { x: 480, y, size: fontSize, font, color });
    });
    
    const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
    saveAs(blob, `Registro_Celestica_${data.usuario}.pdf`);
  } catch (error) { alert('Error generando PDF Celestica. Revisa la consola.'); }
}

async function generateGenericPdf(data: FormInputs, allTools: ToolItem[]) {
  try {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let y = height - 50;
    page.drawText('Registro de Herramienta', { x: 50, y, size: 18, font: fontBold });
    y -= 30;
    page.drawText(`Fecha: ${data.fecha}`, { x: 50, y, size: 10, font });
    page.drawText(`Usuario: ${data.usuario}`, { x: 200, y, size: 10, font });
    y -= 20;
    
    const headers = ['Herramienta', 'Qty', 'Marca', 'Modelo', 'Serie'];
    const xPos = [50, 200, 250, 350, 450];
    
    headers.forEach((h, i) => page.drawText(h, { x: xPos[i], y, size: 10, font: fontBold }));
    y -= 15;

    allTools.forEach(t => {
        if (y < 50) { page = pdfDoc.addPage(); y = height - 50; }
        page.drawText(cleanToolNameForPdf(t.herramienta).substring(0, 30), { x: 50, y, size: 9, font });
        page.drawText(String(t.qty), { x: 200, y, size: 9, font });
        page.drawText(t.marca, { x: 250, y, size: 9, font });
        page.drawText(t.modelo, { x: 350, y, size: 9, font });
        page.drawText(t.serie, { x: 450, y, size: 9, font });
        y -= 15;
    });

    const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
    saveAs(blob, `Registro_Generico_${data.usuario}.pdf`);
  } catch (e) { alert('Error generando PDF Genérico.'); }
}

// ==================================================================
// --- 2. COMPONENTE PRINCIPAL ---
// ==================================================================

const NormasScreen = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<{ id: string; nombre: string; }[]>([]);
  const [patronesMap, setPatronesMap] = useState<Map<string, PatronBase>>(new Map());
  const [patronesScannerMap, setPatronesScannerMap] = useState<Map<string, PatronBase>>(new Map());
  const [isSavingBatch, setIsSavingBatch] = useState(false); 
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const { register, control, handleSubmit, setValue, watch, trigger, getValues, formState: { errors } } = useForm<FormInputs>({
    defaultValues: { fecha: new Date().toISOString().split('T')[0], selectedBackpacks: [], manualTools: [], companiaDepto: 'Equipos y Servicios AG' }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'manualTools' });
  const watchedBackpacks = watch('selectedBackpacks');
  const watchedManualTools = watch('manualTools');
  const aggregatedTools = useMemo(() => aggregateTools(watchedBackpacks || []), [watchedBackpacks]);
  
  const isAnyPatronVencido = useMemo(() => watchedManualTools.some(tool => tool.isVencida || tool.isUnavailable), [watchedManualTools]);

  useEffect(() => {
    const initData = async () => {
      try {
        const usersQ = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const usersSnap = await getDocs(usersQ);
        setMetrologos(usersSnap.docs.map(d => ({ id: d.id, nombre: d.data().name || d.data().nombre })));

        const patronesQ = query(collection(db, COLLECTION_NAME_PATRONES));
        const patronesSnap = await getDocs(patronesQ);
        const mapDropdown = new Map<string, PatronBase>();
        const mapScanner = new Map<string, PatronBase>();

        patronesSnap.forEach((doc) => {
          const d = doc.data() as any;
          const fechaReal = d.fecha || d.fechaVencimiento || '';
          
          const p: PatronBase = {
              id: doc.id,
              noControl: d.noControl || 'S/N',
              nombre: `${d.noControl} - ${d.descripcion}`,
              marca: d.marca, modelo: d.modelo, serie: d.serie,
              fechaVencimiento: fechaReal,
              status: getVencimientoStatus(fechaReal),
              estadoProceso: d.estadoProceso || 'operativo',
              usuarioEnUso: d.usuarioEnUso || d.usuarioAsignado
          };
          if (p.nombre) mapDropdown.set(p.nombre, p);
          if (p.noControl !== 'S/N') mapScanner.set(p.noControl, p);
        });
        setPatronesMap(mapDropdown);
        setPatronesScannerMap(mapScanner);
      } catch (e) { console.error("Error carga inicial", e); }
    };
    initData();
  }, []);

  // --- ORDENAMIENTO DE LISTA ---
  const sortedPatronOptions = useMemo(() => {
      return Array.from(patronesMap.values()).sort((a, b) => {
          // Orden natural (ej: AG-2 antes que AG-10)
          return a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [patronesMap]);

  const handleScan = (code: string) => {
    if (!code) return;
    const p = patronesScannerMap.get(code);
    if (!p) return alert(`No encontrado: ${code}`);
    stopScan();
    
    if (getValues('manualTools').some(t => t.herramienta === p.nombre)) return alert('Ya está en lista');
    if (['en_servicio', 'en_prestamo', 'fuera_servicio'].includes(p.estadoProceso)) return alert(`NO DISPONIBLE: ${p.estadoProceso}`);

    append({
        herramienta: p.nombre, qty: '1', marca: p.marca, modelo: p.modelo, serie: p.serie,
        isVencida: p.status === 'vencido' || p.status === 'critico',
        isUnavailable: false
    });
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
    if (!tools.length) return alert('Lista vacía');
    if (!window.confirm(`¿Salida de ${tools.length} equipos a ${usuario}?`)) return;

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
                    ubicacion: `Planta - ${usuario}`,
                    fechaPrestamo: new Date().toISOString().split('T')[0]
                });
            }
        });
        await batch.commit();
        alert('Salida Exitosa');
        setValue('manualTools', []);
    } catch (e) { alert('Error al guardar'); } 
    finally { setIsSavingBatch(false); }
  };

  return (
    <>
      <style>{styles}</style>
      {isScannerOpen && (
        <div className="scanner-overlay" onClick={stopScan}>
          <div className="scanner-box" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4 text-gray-900 text-lg">Escanear Código</h3>
            <video ref={videoRef} className="scanner-video" />
            <button className="btn btn-danger w-full" onClick={stopScan}><X size={18} /> Cancelar</button>
          </div>
        </div>
      )}

      <div className="layout-container">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
           <div className="flex items-center gap-4">
              <button className="btn btn-secondary rounded-full p-3 shadow-sm" onClick={() => navigateTo('/')}><ArrowLeft size={24} /></button>
              <div>
                  <h1 className="text-2xl font-bold text-gray-900">Registro de Salida</h1>
                  <p className="text-gray-500 text-sm">Control de herramientas y patrones</p>
              </div>
           </div>
           <div className="text-right hidden sm:block bg-white px-4 py-2 rounded-lg border border-gray-200">
              <span className="text-xs font-bold text-gray-400 block uppercase">Fecha Actual</span>
              <div className="font-mono font-bold text-lg text-gray-800">{new Date().toLocaleDateString()}</div>
           </div>
        </div>

        {/* DATOS RESPONSABLE */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6 border-b pb-4">
              <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><User size={24}/></div>
              <h2 className="text-lg font-bold text-gray-800">Información del Responsable</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label>Metrólogo / Técnico</label>
                <select {...register('usuario', { required: true })} className="input-control bg-white">
                  <option value="">-- Seleccionar --</option>
                  {metrologos.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                </select>
                {errors.usuario && <span className="text-red-500 text-xs mt-1 block">Este campo es requerido</span>}
            </div>
            <div>
                 <label>Compañía</label>
                 <input className="input-control bg-white" {...register('companiaDepto')} />
            </div>
            <div>
                 <label>No. Empleado</label>
                 <input className="input-control bg-white" {...register('noEmpleado')} />
            </div>
            <div>
                 <label>Gafete (Opcional)</label>
                 <input className="input-control bg-white" {...register('gafeteContratista')} />
            </div>
          </div>
        </div>

        {/* KITS RÁPIDOS */}
        <div className="card">
            <div className="flex items-center gap-3 mb-6 border-b pb-4">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Briefcase size={24}/></div>
                <h2 className="text-lg font-bold text-gray-800">Kits Rápidos</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <Controller name="selectedBackpacks" control={control} render={({ field }) => (
                  <>
                    {Object.entries(BACKPACK_CATALOG).map(([id, backpack]) => (
                        <label key={id} className={`border p-4 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${field.value.includes(id) ? 'bg-blue-50 border-blue-500 shadow-md' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" className="hidden" checked={field.value.includes(id)} 
                            onChange={e => field.onChange(e.target.checked ? [...field.value, id] : field.value.filter(v => v !== id))} />
                          <Package size={28} className={field.value.includes(id) ? 'text-blue-600' : 'text-gray-400'} />
                          <div>
                              <span className={`block font-semibold ${field.value.includes(id) ? 'text-blue-900' : 'text-gray-600'}`}>{backpack.nombre}</span>
                              <span className="text-xs text-gray-400">{backpack.items.length} items</span>
                          </div>
                        </label>
                    ))}
                  </>
              )} />
            </div>
            
            {/* TABLA DE CONTENIDO MOCHILAS */}
            {aggregatedTools.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Info size={16}/> Contenido de Kits Seleccionados</h3>
                    <div className="overflow-x-auto">
                        <table className="modern-table bg-white rounded-lg overflow-hidden shadow-sm">
                            <thead><tr><th>Herramienta</th><th className="text-center">Cant.</th><th>Marca</th><th>Modelo</th></tr></thead>
                            <tbody>
                                {aggregatedTools.map((t, i) => (
                                    <tr key={i}>
                                        <td className="font-medium text-gray-900">{t.herramienta}</td>
                                        <td className="text-center font-bold bg-blue-50 text-blue-700">{t.qty}</td>
                                        <td>{t.marca}</td>
                                        <td>{t.modelo}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>

        {/* ESCANEO INDIVIDUAL */}
        <div className="card">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Camera size={24}/></div>
                    <h2 className="text-lg font-bold text-gray-800">Escaneo Individual</h2>
                </div>
                <div className="flex gap-2">
                    <button type="button" className="btn btn-secondary" onClick={() => setIsScannerOpen(true)}><Camera size={18}/> Escanear</button>
                    <button type="button" className="btn btn-secondary" onClick={() => append({ herramienta: '', qty: '1', marca: '', modelo: '', serie: '' })}><Plus size={18}/> Manual</button>
                </div>
            </div>
            
            {isAnyPatronVencido && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3"><AlertTriangle size={24}/> <strong>Atención:</strong> Hay equipos vencidos o no disponibles en la lista.</div>}

            <div className="overflow-x-auto">
                <table className="modern-table">
                    <thead><tr><th className="w-12">#</th><th>Equipo / Patrón</th><th>Estado</th><th>Serie</th><th className="w-12"></th></tr></thead>
                    <tbody>
                        {fields.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-8 text-gray-400 italic">No hay equipos individuales agregados.</td></tr>
                        )}
                        {fields.map((item, index) => {
                             const current = patronesMap.get(watchedManualTools[index]?.herramienta);
                             const isBad = current?.status === 'vencido';
                             return (
                                <tr key={item.id} className={isBad ? 'bg-red-50' : ''}>
                                    <td className="font-bold text-gray-400">{index + 1}</td>
                                    <td style={{ minWidth: '300px' }}>
                                        <Controller name={`manualTools.${index}.herramienta`} control={control} render={({ field }) => (
                                            <select 
                                                {...field} 
                                                className="input-control text-sm bg-white text-gray-900" 
                                                onChange={e => {
                                                    field.onChange(e.target.value);
                                                    const p = patronesMap.get(e.target.value);
                                                    if (p) {
                                                        setValue(`manualTools.${index}.marca`, p.marca);
                                                        setValue(`manualTools.${index}.modelo`, p.modelo);
                                                        setValue(`manualTools.${index}.serie`, p.serie);
                                                        setValue(`manualTools.${index}.isVencida`, p.status === 'vencido');
                                                        setValue(`manualTools.${index}.isUnavailable`, p.estadoProceso !== 'operativo');
                                                    }
                                                }}
                                            >
                                                <option value="">-- Buscar Patrón --</option>
                                                {sortedPatronOptions.map(op => {
                                                    const isVencido = op.status === 'vencido' || op.status === 'critico';
                                                    const isUnavailable = op.estadoProceso !== 'operativo';
                                                    return (
                                                        <option 
                                                            key={op.id} 
                                                            value={op.nombre} 
                                                            disabled={isUnavailable}
                                                            className={isVencido ? 'opt-vencido' : (isUnavailable ? 'opt-unavailable' : 'opt-normal')}
                                                            style={{
                                                                color: isVencido ? '#dc2626' : (isUnavailable ? '#94a3b8' : '#1e293b'),
                                                                fontWeight: isVencido ? 'bold' : 'normal',
                                                                fontStyle: isUnavailable ? 'italic' : 'normal'
                                                            }}
                                                        >
                                                            {op.nombre} {isUnavailable ? `(${op.estadoProceso.toUpperCase()})` : ''} {isVencido ? '(VENCIDO)' : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        )} />
                                    </td>
                                    <td>{current ? <span className={`status-badge status-${current.status}`}>{current.status}</span> : '-'}</td>
                                    <td className="font-mono text-xs text-gray-500">{watch(`manualTools.${index}.serie`)}</td>
                                    <td><button type="button" onClick={() => remove(index)} className="text-red-500 hover:bg-red-50 p-2 rounded-full transition"><X size={20}/></button></td>
                                </tr>
                             )
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* BARRA FLOTANTE */}
        <div className="floating-bar">
            <div className="hidden md:block text-sm text-gray-500 font-medium">
                Total Equipos: <strong className="text-gray-900">{aggregatedTools.length + fields.length}</strong>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
                {fields.length > 0 && (
                    <button type="button" className="btn btn-success flex-1 md:flex-none" onClick={handleRegistrarSalida} disabled={isAnyPatronVencido || isSavingBatch}>
                        {isSavingBatch ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} Registrar Salida
                    </button>
                )}
                <button type="button" className="btn btn-primary flex-1 md:flex-none" onClick={() => handlePdf('cel')} disabled={isAnyPatronVencido}><FileText size={20}/> Celestica</button>
                <button type="button" className="btn btn-secondary flex-1 md:flex-none" onClick={() => handlePdf('gen')} disabled={isAnyPatronVencido}><FileText size={20}/> Genérico</button>
            </div>
        </div>
      </div>
    </>
  );
};

export default NormasScreen;