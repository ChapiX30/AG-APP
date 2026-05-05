import React, { useEffect, useRef, useState, useCallback, useReducer, useMemo } from "react";
import { useNavigation } from "../hooks/useNavigation";
import {
  ArrowLeft, Save, X, Calendar, MapPin, Mail, Building2, Wrench, Tag, Hash,
  Loader2, NotebookPen, Search, Calculator, ArrowRightLeft, AlertTriangle,
  CheckCircle2, WifiOff, AlertOctagon, Printer, Settings2, FileText, Info, Scale,
  Camera, ShieldCheck, ShieldAlert, CloudOff, CloudUpload, CheckSquare, XCircle, Upload
} from "lucide-react";
import type { jsPDF } from "jspdf"; 
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { storage, db } from "../utils/firebase";
import { collection, addDoc, query, getDocs, where, doc, getDoc, updateDoc } from "firebase/firestore";
import masterCelestica from "../data/masterCelestica.json";
import masterTechops from "../data/masterTechops.json";
import html2canvas from 'html2canvas'; 
import { isBefore, format, addMonths, addYears, parseISO, addBusinessDays, isAfter, differenceInBusinessDays, isValid } from "date-fns"; 
import { es } from 'date-fns/locale'; 
import { unit } from 'mathjs';
import logoAg from '../assets/lab_logo.png'; 
import ToastNotification from "./ToastNotification"; 
import { QRCodeSVG } from 'qrcode.react';

// --- IMPORTS DE CAPACITOR ---
import { Capacitor } from '@capacitor/core';
import EpsonLabel from '../utils/EpsonPlugin';

// ====================================================================
// 1. COMPONENTE DE ETIQUETA (HÍBRIDO: ANDROID APK + WEB)
// ====================================================================

interface LabelData {
  id: string;
  fechaCal: string;
  fechaSug: string;
  calibro: string;
  certificado: string;
}

const LabelPrinterButton: React.FC<{ data: LabelData, logo: string }> = ({ data, logo }) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tapeSize, setTapeSize] = useState<"24mm" | "12mm">("24mm");
  const [showOptions, setShowOptions] = useState(false);

 const handlePrintAction = async () => {
  if (!labelRef.current) return;
  setIsGenerating(true);

  try {
    if (Capacitor.isNativePlatform()) {
      await EpsonLabel.printLabel({
        id: data.id.trim(),
        fechaCal: data.fechaCal,
        fechaSug: data.fechaSug,
        certificado: data.certificado.trim(),
        calibro: data.calibro,
        tapeSize: "24mm",
      });
    } else {
      await new Promise(resolve => setTimeout(resolve, 300));
      const originalCanvas = await html2canvas(labelRef.current, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: true,
      });
      const link = document.createElement('a');
      link.download = `ETIQUETA_${data.id}.png`;
      link.href = originalCanvas.toDataURL('image/png');
      link.click();
    }
    
    setIsGenerating(false);
    setShowOptions(false);

  } catch (error: any) {
    console.error("Error al generar etiqueta", error);
    alert("Error: " + (error.message || error));
    setIsGenerating(false);
  }
};

  return (
    <div className="relative">
      <div className="flex bg-slate-900 text-white rounded-lg overflow-hidden shadow-lg border border-slate-700">
        <button onClick={() => handlePrintAction()} disabled={isGenerating} className="flex items-center gap-2 px-4 py-2 hover:bg-slate-800 transition-all disabled:opacity-50">
            {isGenerating ? <Loader2 className="animate-spin w-4 h-4"/> : <Printer className="w-4 h-4"/>}
            <span className="font-bold text-sm">Etiqueta {tapeSize}</span>
        </button>
        <button onClick={() => setShowOptions(!showOptions)} className="px-2 bg-slate-800 border-l border-slate-700 hover:bg-slate-700 transition-colors">
            <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {showOptions && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 w-48">
            <div className="space-y-1">
                <button onClick={() => setTapeSize("24mm")} className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between ${tapeSize === "24mm" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700"}`}><span>24mm (Grande)</span> {tapeSize === "24mm" && <CheckCircle2 className="w-3 h-3"/>}</button>
                <button onClick={() => setTapeSize("12mm")} className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between ${tapeSize === "12mm" ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700"}`}><span>12mm (Pequeña)</span> {tapeSize === "12mm" && <CheckCircle2 className="w-3 h-3"/>}</button>
            </div>
        </div>
      )}

      {/* RENDERIZADO VISUAL DE LA ETIQUETA WEB */}
      <div style={{ position: 'absolute', opacity: 0, zIndex: -100, pointerEvents: 'none', left: 0, top: 0 }}>
        {tapeSize === "24mm" && (
            <div ref={labelRef} style={{ width: '500px', height: '240px', backgroundColor: 'white', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif', border: '2px solid black', padding: '0' }}>
                <div style={{ height: '70px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '3px solid black', padding: '5px' }}>
                    <img src={logo} alt="Logo" style={{ height: '100%', width: 'auto', objectFit: 'contain' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', padding: '5px 12px' }}>
                    <div style={{ fontSize: '38px', fontWeight: '900', color: 'black', textAlign: 'center', lineHeight: '1', marginBottom: '8px' }}>{data.id}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid black', borderBottom: '2px solid black', padding: '4px 0', marginBottom: '6px' }}>
                        <div style={{ textAlign: 'left' }}><div style={{ fontSize: '11px', fontWeight: 'bold', color: 'black' }}>CALIBRADO</div><div style={{ fontSize: '18px', fontWeight: 'bold', color: 'black' }}>{data.fechaCal}</div></div>
                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: '11px', fontWeight: 'bold', color: 'black' }}>VENCE</div><div style={{ fontSize: '18px', fontWeight: '900', color: 'black' }}>{data.fechaSug}</div></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'black' }}>CERT: {data.certificado}</div>
                            <div>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', backgroundColor: 'black', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                                TEC: {data.calibro.substring(0,4)}
                              </span>
                            </div>
                        </div>
                        <div style={{ padding: '2px', backgroundColor: 'white' }}>
                            <QRCodeSVG 
                                value={`https://ag-app-two.vercel.app/?share=${data.certificado}`} 
                                size={45} 
                                level="M" 
                            />
                        </div>
                    </div>
                </div>
            </div>
        )}
        {tapeSize === "12mm" && (
             <div ref={labelRef} style={{ width: '600px', height: '90px', backgroundColor: 'white', display: 'flex', alignItems: 'center', fontFamily: 'Arial, sans-serif', border: '1px solid black' }}>
                <div style={{ width: '110px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '3px solid black', padding: '2px' }}>
                    <img src={logo} alt="Logo" style={{ height: '90%', width: 'auto', objectFit: 'contain' }} />
                </div>
                <div style={{ flex: 1, paddingLeft: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: 'black', lineHeight: '0.9' }}>{data.id}</div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'black' }}>CAL: {data.fechaCal}</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: 'black' }}>VEN: {data.fechaSug}</div>
                        <QRCodeSVG 
                            value={`https://ag-app-two.vercel.app/?share=${data.certificado}`} 
                            size={30} 
                            level="M" 
                            style={{ marginLeft: '10px' }}
                        />
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// MODAL CONVERTIDOR
// ====================================================================

const UnitConverterModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [category, setCategory] = useState<string>("Par Torsional (Torque)");
  const [amount, setAmount] = useState<string>("1");
  const [fromUnit, setFromUnit] = useState<string>("N*m");
  const [toUnit, setToUnit] = useState<string>("lbf*in");
  const [result, setResult] = useState<string>("");

  const UNIT_CATEGORIES: Record<string, { value: string, label: string }[]> = {
    "Par Torsional (Torque)": [
        { value: "N*m", label: "N·m (Newton metro)" },
        { value: "lbf*in", label: "lbf·in (Libra fuerza pulgada)" },
        { value: "lbf*ft", label: "lbf·ft (Libra fuerza pie)" },
        { value: "kgf*cm", label: "kgf·cm (Kilogramo fuerza cm)" }
    ],
    "Presión": [
        { value: "psi", label: "PSI" },
        { value: "bar", label: "Bar" },
        { value: "kPa", label: "kPa" },
        { value: "Pa", label: "Pascal" }
    ],
    "Longitud": [
        { value: "mm", label: "Milímetros" },
        { value: "in", label: "Pulgadas" },
        { value: "cm", label: "Centímetros" },
        { value: "m", label: "Metros" }
    ]
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    const units = UNIT_CATEGORIES[newCategory];
    if (units && units.length >= 2) {
      setFromUnit(units[0].value);
      setToUnit(units[1].value);
    }
    setResult(""); 
  };

  useEffect(() => { calculate(); }, [amount, fromUnit, toUnit, category]);

  const calculate = () => {
    if (!amount || isNaN(Number(amount))) { setResult("-"); return; }
    try {
      const val = unit(Number(amount), fromUnit);
      const converted = val.to(toUnit);
      setResult(converted.toNumber().toLocaleString('en-US', { maximumFractionDigits: 6 }));
    } catch (err) { setResult("-"); }
  };

  const handleSwap = () => { const temp = fromUnit; setFromUnit(toUnit); setToUnit(temp); };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[90vh]">
        <div className="bg-gray-900 text-white p-4 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-400" /> Convertidor</h3>
          <button onClick={onClose}><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.keys(UNIT_CATEGORIES).map((cat) => (
                <button key={cat} onClick={() => handleCategoryChange(cat)} className={`px-3 py-2 text-sm rounded-lg border transition-all text-left truncate ${category === cat ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-900'}`}>{cat}</button>
              ))}
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 bg-gray-50 p-6 rounded-xl border border-gray-200">
            <div className="w-full md:w-1/2 space-y-3">
              <label className="block text-sm font-bold text-gray-700">De:</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-3 text-lg font-mono border border-gray-300 rounded-lg text-gray-900" placeholder="0" />
              <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900">{UNIT_CATEGORIES[category]?.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}</select>
            </div>
            <div className="flex md:flex-col items-center justify-center gap-2 text-gray-400 shrink-0"><button onClick={handleSwap} className="p-2 hover:bg-gray-200 rounded-full"><ArrowRightLeft className="w-5 h-5" /></button></div>
            <div className="w-full md:w-1/2 space-y-3">
              <label className="block text-sm font-bold text-gray-700">A:</label>
              <div className="w-full p-3 text-lg font-mono font-bold bg-blue-50 text-blue-900 border border-blue-100 rounded-lg flex items-center min-h-[54px]">{result || "-"}</div>
              <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900">{UNIT_CATEGORIES[category]?.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}</select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// 3. TIPOS Y LÓGICA DE NEGOCIO
// ====================================================================

type ClienteRecord = { id: string; nombre: string; requerimientos?: string; }
type MasterRecord = { A: string; B: string; C: string; D: string; E: string; };

interface WorksheetState {
  lugarCalibracion: "Sitio" | "Laboratorio" | "";
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
  idBlocked: boolean;
  idErrorMessage: string;
  permitirExcepcion: boolean;
  isMasterData: boolean;
  fieldsLocked: boolean;
  condicionEquipo: "buenas" | "dano" | "";
  descripcionDano: string;
  fotoEquipoBase64: string;
  fotoEquipoURL: string;
}

type WorksheetAction =
  | { type: 'SET_FIELD'; field: keyof WorksheetState; payload: string | string[] | number | boolean }
  | { type: 'SET_USER_NAME'; payload: string }
  | { type: 'SET_CONSECUTIVE'; consecutive: string; magnitud: string }
  | { type: 'SET_MAGNITUD'; payload: string }
  | { type: 'SET_CLIENTE'; payload: string }
  | { type: 'AUTOCOMPLETE_SUCCESS'; payload: Partial<WorksheetState> }
  | { type: 'AUTOCOMPLETE_FAIL' }
  | { type: 'SET_ID_BLOCKED'; message: string }
  | { type: 'CLEAR_ID_BLOCK' }
  | { type: 'SET_EXCEPCION'; payload: boolean }
  | { type: 'RESTORE_BACKUP'; payload: WorksheetState }
  | { type: 'CHANGE_CONDICION'; condicion: "buenas" | "dano" | "" };

// ====================================================================
// OFFLINE QUEUE HELPERS
// ====================================================================
const OFFLINE_QUEUE_KEY = 'ag_offline_save_queue';

interface OfflineQueueItem {
  id: string;
  timestamp: number;
  data: any;
  pdfBlob: string;
  nombreArchivo: string;
  finalDocId: string | null;
  worksheetId: string | undefined;
}

const getOfflineQueue = (): OfflineQueueItem[] => {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
};
const saveOfflineQueue = (q: OfflineQueueItem[]) => {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
};
const addToOfflineQueue = (item: OfflineQueueItem) => {
  const q = getOfflineQueue();
  q.push(item);
  saveOfflineQueue(q);
};
const removeFromOfflineQueue = (id: string) => {
  const q = getOfflineQueue().filter(i => i.id !== id);
  saveOfflineQueue(q);
};

// ====================================================================
// COMPONENTE SEARCH SELECT (Rediseñado: Más Pro, con Botón de Borrar)
// ====================================================================

interface ClienteSearchSelectProps {
    clientes: ClienteRecord[];
    onSelect: (cliente: string) => void;
    currentValue: string;
    hasError?: boolean;
}

const ClienteSearchSelect: React.FC<ClienteSearchSelectProps> = ({ clientes, onSelect, currentValue, hasError }) => {
    const [localSearch, setLocalSearch] = useState(currentValue);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setLocalSearch(currentValue); }, [currentValue]);

    const filteredAndGroupedClientes = React.useMemo(() => {
        const term = (localSearch || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (!term && !isOpen) return {};

        const grouped: Record<string, ClienteRecord[]> = {};
        const filtered = clientes
            .filter(cliente => cliente.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        filtered.forEach(cliente => {
            const firstLetter = cliente.nombre.charAt(0).toUpperCase();
            if (!grouped[firstLetter]) grouped[firstLetter] = [];
            grouped[firstLetter].push(cliente);
        });
        return grouped;
    }, [clientes, localSearch, isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => { document.removeEventListener("mousedown", handleClickOutside); };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalSearch(val);
        onSelect(val);
        setIsOpen(true);
    };

    const handleSelectCliente = (nombre: string) => {
        setLocalSearch(nombre);
        onSelect(nombre);
        setIsOpen(false);
    };

    // Novedad: Botón para limpiar rápidamente la selección
    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLocalSearch("");
        onSelect("");
        setIsOpen(true);
        inputRef.current?.focus();
    };

    const sortedLetters = Object.keys(filteredAndGroupedClientes).sort();

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative flex items-center">
                <input 
                    ref={inputRef}
                    type="text" 
                    value={localSearch} 
                    onChange={handleChange} 
                    onFocus={() => setIsOpen(true)} 
                    placeholder="Buscar o seleccionar cliente..."
                    className={`w-full p-4 border rounded-xl pr-12 outline-none transition-all duration-200 bg-white text-gray-900 font-medium ${
                        isOpen 
                            ? 'rounded-b-none border-b-0 shadow-lg border-blue-400 ring-1 ring-blue-400' 
                            : 'shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    } ${hasError ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} 
                />
                
                {/* Lógica condicional: Si hay texto, muestra la "X" para borrar. Si no, la Lupa. */}
                {localSearch ? (
                    <button 
                        type="button" 
                        onClick={handleClear}
                        className="absolute right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Borrar selección"
                    >
                        <X className="w-5 h-5" />
                    </button>
                ) : (
                    <Search className="absolute right-4 w-5 h-5 text-gray-400 pointer-events-none" />
                )}
            </div>
            
            {isOpen && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 max-h-72 overflow-y-auto rounded-b-xl shadow-2xl custom-scrollbar">
                    {sortedLetters.length > 0 ? (
                        sortedLetters.map(letter => (
                            <div key={letter}>
                                <div className="sticky top-0 bg-slate-100 px-4 py-2 text-sm font-bold text-blue-800 border-b border-gray-200 shadow-sm z-10 backdrop-blur-sm bg-opacity-90">
                                    {letter}
                                </div>
                                <ul>
                                    {filteredAndGroupedClientes[letter].map(cliente => (
                                        <li key={cliente.id} 
                                            className="px-5 py-3 cursor-pointer hover:bg-blue-50 text-gray-700 hover:text-blue-900 text-sm truncate transition-colors duration-150 font-medium border-b border-gray-50 last:border-0" 
                                            onClick={() => handleSelectCliente(cliente.nombre)}>
                                            {cliente.nombre}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <div className="p-6 text-center text-gray-500 text-sm font-medium flex flex-col items-center gap-2">
                            <Search className="w-6 h-6 text-gray-300" />
                            No se encontraron clientes.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ====================================================================

const getLocalISODate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getUserName = (user: any) => user ? (user.displayName || user.name || user.email?.split("@")[0] || "Sin Usuario") : "Sin Usuario";

const extractMagnitudFromConsecutivo = (consecutivo: string): string => {
  if (!consecutivo) return "";
  const m: Record<string, string> = { 
    AGAC: "Acustica", AGD: "Dimensional", AGF: "Fuerza", AGP: "Presión", 
    AGEL: "Electrica", AGT: "Temperatura", AGM: "Masa", AGVBT: "Vibracion", 
    AGQ: "Quimica", AGOT: "Optica", AGFL: "Flujo", AGRD: "Reporte de Diagnostico", 
    AGTI: "Tiempo", VE: "Velocidad", AGPT: "Par Torsional", AGH: "Humedad" 
  };
  
  const parts = consecutivo.split("-");
  if (parts.length > 0 && m[parts[0]]) return m[parts[0]];
  if (parts.length >= 2 && m[parts[1]]) return m[parts[1]];

  const keys = Object.keys(m).sort((a, b) => b.length - a.length);
  for (const code of keys) {
    if (consecutivo.includes(code)) return m[code];
  }
  
  return "";
};

const magnitudesDisponibles = [
  "Acustica", "Dimensional", "Electrica", "Flujo", "Frecuencia", "Fuerza", "Humedad", "Masa", "Optica", "Par Torsional", "Presión", "Quimica", "Reporte de Diagnostico", "Temperatura", "Tiempo", "Vacio", "Velocidad", "Vibracion"
];

const unidadesPorMagnitud: Record<string, any> = {
  Acustica: ["dB", "Hz", "Pa"], Dimensional: ["m", "cm", "mm", "in", "min", "°", "µm"], Fuerza: ["N", "kgf", "lbf"],
  Flujo: ["m3/h", "slpm", "lpm", "scfm", "cfh", "m3/pm", "gpm", "ccm", "SCMH", "SCFH"], Frecuencia: ["RPM", "Hz", "kHz", "MHz", "GHz", "rad/s"],
  Presión: ["kPa", "bar", "mBar", "psi", "InH2O", "MPa", "Pa", "mmH20"], Quimica: ["µS", "pH"],
  Electrica: { DC: ["mV", "V", "A", "µA", "mA", "Ω"], AC: ["mV", "V", "A", "µA", "mA", "Ω"], Otros: ["Hz", "kHz", "MHz", "°C", "°F"] },
  Temperatura: ["°C", "°F", "°K"], Optica: ["BRIX", "°"], Masa: ["g", "kg", "lb"], Tiempo: ["s", "min", "h"],
  "Reporte de Diagnostico": ["check"], Velocidad: ["m/s", "km/h"], Vacio: ["atm", "Psi", "mbar", "Torr", "mmHg", "micron", "inHg"],
  Vibracion: ["g", "rad/s"], "Par Torsional": ["N*m", "Lbf*ft", "kgf*cm", "Lbf*in", "c*N", "oz*in", "oz*ft"],
  Humedad: ["% HR", "%", "°C Punto de Rocío"]
};

const findTechopsById = (id: string): MasterRecord | null => {
  const normalized = String(id).trim();
  const records = (masterTechops as MasterRecord[]).filter((r) => String(r.A ?? "").trim() === normalized);
  return records.length > 0 ? records[0] : null;
};

const findCelesticaById = (id: string): MasterRecord | null => {
  const normalized = String(id).trim();
  const records = (masterCelestica as MasterRecord[]).filter((r) => String(r.A ?? "").trim() === normalized);
  return records.length > 0 ? records[0] : null;
};

const isMexicoMROClient = (cliente?: string) => {
  if (!cliente) return false;
  const n = cliente.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (n.includes("mexico") || n.includes("mx")) && n.includes("mro");
};

function calcularSiguienteFecha(fechaUltima: string, frecuencia: string): Date | null {
  if (!fechaUltima || !frecuencia) return null;
  const parts = fechaUltima.split('-');
  if (parts.length !== 3) return null;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(date.getTime())) return null;
  const lowerFrecuencia = frecuencia.toLowerCase();
  if (lowerFrecuencia.includes("mes")) {
    let meses = lowerFrecuencia.includes("3") ? 3 : lowerFrecuencia.includes("6") ? 6 : 0;
    return meses > 0 ? addMonths(date, meses) : null;
  }
  if (lowerFrecuencia.includes("año") || lowerFrecuencia.includes("ano")) {
    let años = lowerFrecuencia.includes("2") ? 2 : lowerFrecuencia.includes("3") ? 3 : 1;
    return addYears(date, años);
  }
  return null;
}

// --- GENERADOR DE PDF ---
const generateTemplatePDF = (formData: WorksheetState, JsPDF: typeof jsPDF) => {
  // @ts-ignore
  const doc = new JsPDF({ orientation: "p", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.width; 
  const pageHeight = doc.internal.pageSize.height; 
  const marginBottom = 40; 
  const marginLeft = 40;
  const marginRight = pageWidth - 40;
  
  const tableWidth = 500; 
  const tableX = (pageWidth - tableWidth) / 2; 

  let currentY = 60; 

  const drawHeaderBase = () => {
    doc.addImage(logoAg, 'PNG', marginLeft, 25, 100, 45);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 153); 
    doc.text("Equipos y Servicios Especializados AG", marginLeft + 110, 50, { align: "left" });
    
    doc.setDrawColor(0, 51, 153);
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
      doc.text("AG-CAL-F39-00", marginLeft, pageHeight - 20);
      doc.text(`Página ${i} de ${totalPages}`, marginRight - 50, pageHeight - 20);
    }
  };

  const checkPageBreak = (heightNeeded: number) => {
    if (currentY + heightNeeded > pageHeight - marginBottom) {
      doc.addPage();
      drawHeaderBase(); 
      currentY = 100; 

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Mediciones (Continuación)", marginLeft, currentY);
      currentY += 25;
      
      doc.setDrawColor(200);
      doc.setFillColor(230, 235, 245); 
      doc.setLineWidth(0.5);
      doc.rect(tableX, currentY, tableWidth, 20, 'FD');
      
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      
      if (formData.magnitud === "Masa") {
        doc.text("Parámetro", tableX + 20, currentY + 14);
        doc.text("Valor", tableX + (tableWidth/2) + 20, currentY + 14);
      } else {
        doc.text("Medición Patrón", tableX + 20, currentY + 14);
        doc.text("Medición Instrumento", tableX + (tableWidth/2) + 20, currentY + 14);
      }
      currentY += 20; 
      return true;
    }
    return false;
  };

  drawHeaderBase();
  currentY = 100; 
  
  const col1X = marginLeft;
  // CORRECCIÓN PDF: Damos más espacio a la columna 1 (35pt más a la derecha)
  const col2X = pageWidth / 2 + 35; 

  doc.setFillColor(245, 247, 250); 
  doc.rect(marginLeft, currentY - 12, pageWidth - 80, 25, 'F');

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Nombre:", marginLeft + 10, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(formData.nombre || "-", marginLeft + 65, currentY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Fecha:", col2X, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(formData.fecha || "-", col2X + 45, currentY + 5);
  
  currentY += 35; 

  const infoData = [
    { l: "Cliente:", v: formData.cliente, l2: "N. Certificado:", v2: formData.certificado },
    { l: "Equipo:", v: formData.equipo, l2: "ID:", v2: formData.id },
    { l: "Marca:", v: formData.marca, l2: "Modelo:", v2: formData.modelo },
    { l: "N. Serie:", v: formData.numeroSerie, l2: "Ubicación:", v2: formData.lugarCalibracion },
    { l: "Magnitud:", v: formData.magnitud, l2: "Unidad:", v2: Array.isArray(formData.unidad) ? formData.unidad.join(', ') : formData.unidad },
    { l: "Alcance:", v: formData.alcance, l2: "Resolución:", v2: formData.resolucion },
    { l: "Frecuencia:", v: formData.frecuenciaCalibracion, l2: "Recepción:", v2: formData.fechaRecepcion || "N/A" },
    { l: "Temp. Amb:", v: `${formData.tempAmbiente || "-"} °C`, l2: "Humedad:", v2: `${formData.humedadRelativa || "-"} %` },
    { l: "Condición:", v: formData.condicionEquipo === "buenas" ? "Buenas condiciones" : formData.condicionEquipo === "dano" ? "Presenta daño/anomalía" : "-", l2: "", v2: "" },
  ];

  doc.setFontSize(10);
  
  // Función para truncar el texto si sigue siendo inmenso (para no empalmar)
  const formatText = (text: any, maxLength: number) => {
    const str = String(text || "-");
    return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
  };

  infoData.forEach((row, index) => {
    checkPageBreak(20);
    
    if (index % 2 === 0) {
       doc.setFillColor(252, 252, 252);
       doc.rect(marginLeft, currentY - 11, pageWidth - 80, 16, 'F');
    }

    doc.setFont("helvetica", "bold");
    doc.text(row.l, col1X + 5, currentY + 1);
    doc.setFont("helvetica", "normal");
    // Ahora la columna 1 soporta hasta 45 caracteres antes de recortarse
    doc.text(formatText(row.v, 45), col1X + 75, currentY + 1);

    doc.setFont("helvetica", "bold");
    doc.text(row.l2, col2X, currentY + 1);
    doc.setFont("helvetica", "normal");
    doc.text(formatText(row.v2, 40), col2X + 80, currentY + 1);
    
    currentY += 16;
  });

  currentY += 20;

  // --- CABECERA DE MEDICIONES ---
  checkPageBreak(40); 
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setFillColor(230, 235, 245); 
  doc.rect(marginLeft, currentY - 14, pageWidth - 80, 20, 'F'); 
  doc.text("Resultados de Mediciones", marginLeft + 10, currentY);
  currentY += 25;

  const isMasa = formData.magnitud === "Masa";
  
  if (isMasa) {
      const excLines = (formData.excentricidad || "").split('\n');
      let p1="-", p2="-", p3="-", p4="-", p5="-";
      excLines.forEach(l => {
           if (l.startsWith('1')) p1 = l.substring(l.indexOf(':')+1).trim() || "-";
           else if (l.startsWith('2')) p2 = l.substring(l.indexOf(':')+1).trim() || "-";
           else if (l.startsWith('3')) p3 = l.substring(l.indexOf(':')+1).trim() || "-";
           else if (l.startsWith('4')) p4 = l.substring(l.indexOf(':')+1).trim() || "-";
           else if (l.startsWith('5')) p5 = l.substring(l.indexOf(':')+1).trim() || "-";
      });

      checkPageBreak(130);
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0,0,0);
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
      doc.line(boxX + boxSize/2, boxY, boxX + boxSize/2, boxY + boxSize);
      doc.line(boxX, boxY + boxSize/2, boxX + boxSize, boxY + boxSize/2);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);

      doc.text(`3: ${p3}`, boxX - 35, boxY + 10);
      doc.text(`4: ${p4}`, boxX + boxSize + 5, boxY + 10);
      doc.setFont("helvetica", "bold");
      doc.text(`1: ${p1}`, boxX + boxSize/2 - 12, boxY + boxSize/2 - 5);
      doc.setFont("helvetica", "normal");
      doc.text(`2: ${p2}`, boxX - 35, boxY + boxSize - 5);
      doc.text(`5: ${p5}`, boxX + boxSize + 5, boxY + boxSize - 5);

      currentY += boxSize + 25;

      checkPageBreak(40);
      doc.setFillColor(50, 80, 160); 
      doc.setTextColor(255, 255, 255); 
      doc.rect(tableX, currentY, tableWidth, 20, 'FD');
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      
      doc.text("Parámetro", tableX + 20, currentY + 14);
      doc.text("Valor", tableX + (tableWidth/2) + 20, currentY + 14);
      currentY += 20;
      doc.setTextColor(0,0,0); 

      const masaData = [
          ["Linealidad", formData.linealidad || "-"],
          ["Repetibilidad", formData.repetibilidad || "-"]
      ];
      
      masaData.forEach(([param, val]) => {
           const paramLines = doc.splitTextToSize(val, tableWidth/2 - 20);
           const rowHeight = Math.max(20, paramLines.length * 15 + 10);
           checkPageBreak(rowHeight);

           doc.setFontSize(10);
           doc.setDrawColor(200);
           doc.rect(tableX, currentY, tableWidth/2, rowHeight);
           doc.rect(tableX + tableWidth/2, currentY, tableWidth/2, rowHeight);
           
           doc.setFont("helvetica", "bold");
           doc.text(param, tableX + 10, currentY + 14);
           doc.setFont("helvetica", "normal");
           doc.text(paramLines, tableX + tableWidth/2 + 10, currentY + 14);
           currentY += rowHeight;
      });

  } else {
    doc.setDrawColor(0);
    doc.setFillColor(50, 80, 160); 
    doc.setTextColor(255, 255, 255); 
    doc.setLineWidth(0.1);

    checkPageBreak(30);
    doc.rect(tableX, currentY, tableWidth, 20, 'FD');
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
      
    doc.text("Medición Patrón", tableX + 20, currentY + 14);
    doc.text("Medición Instrumento", tableX + (tableWidth/2) + 20, currentY + 14);
    currentY += 20;
    doc.setTextColor(0,0,0); 

    const patronRaw = (formData.medicionPatron || "").split('\n');
    const instrumentoRaw = (formData.medicionInstrumento || "").split('\n');
    const maxLines = Math.max(patronRaw.length, instrumentoRaw.length);
    const loopLimit = maxLines > 0 ? maxLines : 1;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10); 

    for (let i = 0; i < loopLimit; i++) {
      const pLine = patronRaw[i] || "";
      const iLine = instrumentoRaw[i] || "";
      
      const isHeaderLine = (pLine.trim().endsWith(':') || iLine.trim().endsWith(':'));
      const rowHeight = 18; 
      checkPageBreak(rowHeight);

      doc.setDrawColor(200);
      if (isHeaderLine) {
        doc.setFillColor(240, 240, 240); 
        doc.setFont("helvetica", "bold");
        doc.rect(tableX, currentY, tableWidth, rowHeight, 'FD'); 
        doc.setTextColor(0, 0, 100); 
      } else {
        doc.setFillColor(255, 255, 255);
        doc.setFont("helvetica", "normal");
        doc.rect(tableX, currentY, tableWidth/2, rowHeight); 
        doc.rect(tableX + tableWidth/2, currentY, tableWidth/2, rowHeight);
        doc.setTextColor(0, 0, 0);
      }
      
      doc.text(pLine, tableX + 10, currentY + 12);
      doc.text(iLine, tableX + (tableWidth/2) + 10, currentY + 12);
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
    doc.rect(marginLeft, currentY, pageWidth - 80, 20, 'FD');
    doc.setTextColor(180, 0, 0);
    doc.text("⚠ Daño / Anomalía Detectada:", marginLeft + 8, currentY + 14);
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
      const imgData = formData.fotoEquipoBase64.startsWith('data:') 
        ? formData.fotoEquipoBase64 
        : `data:image/jpeg;base64,${formData.fotoEquipoBase64}`;
      const maxImgWidth = 300;
      const maxImgHeight = 200;
      doc.addImage(imgData, 'JPEG', marginLeft, currentY, maxImgWidth, maxImgHeight, undefined, 'MEDIUM');
      currentY += maxImgHeight + 16;
    } catch(imgErr) {
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
  doc.rect(marginLeft, notesY - 15, pageWidth - 80, notasHeight, 'FD');

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

const initialState: WorksheetState = {
  lugarCalibracion: "", frecuenciaCalibracion: "", fecha: getLocalISODate(), fechaRecepcion: "", certificado: "",
  nombre: "", cliente: "", id: "", equipo: "", marca: "", modelo: "", numeroSerie: "", magnitud: "", unidad: [],
  alcance: "", resolucion: "", medicionPatron: "", medicionInstrumento: "", excentricidad: "", linealidad: "",
  repetibilidad: "", notas: "", tempAmbiente: "", humedadRelativa: "", idBlocked: false, idErrorMessage: "",
  permitirExcepcion: false, isMasterData: false, fieldsLocked: false,
  condicionEquipo: "", descripcionDano: "", fotoEquipoBase64: "", fotoEquipoURL: "",
};

function worksheetReducer(state: WorksheetState, action: WorksheetAction): WorksheetState {
  switch (action.type) {
    case 'SET_FIELD': return { ...state, [action.field]: action.payload };
    case 'SET_USER_NAME': return { ...state, nombre: action.payload };
    case 'SET_CONSECUTIVE': return { ...state, certificado: action.consecutive, magnitud: action.magnitud, unidad: [] };
    case 'SET_MAGNITUD': return { ...state, magnitud: action.payload, unidad: [] };
    case 'SET_CLIENTE':
      const cel = (action.payload || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("celestica");
      return { ...state, cliente: action.payload, id: cel ? "EP-" : "", equipo: "", marca: "", modelo: "", numeroSerie: "", fieldsLocked: false };
    case 'AUTOCOMPLETE_SUCCESS': return { ...state, ...action.payload, isMasterData: true, fieldsLocked: true };
    case 'AUTOCOMPLETE_FAIL':
      const isCelestica = state.cliente.toLowerCase().includes("celestica");
      return { ...state, isMasterData: false, fieldsLocked: false, equipo: (isCelestica && !state.id) ? "" : state.equipo, marca: (isCelestica && !state.id) ? "" : state.marca, modelo: (isCelestica && !state.id) ? "" : state.numeroSerie };
    case 'SET_ID_BLOCKED': return { ...state, idBlocked: true, idErrorMessage: action.message };
    case 'CLEAR_ID_BLOCK': return { ...state, idBlocked: false, idErrorMessage: "" };
    case 'SET_EXCEPCION': return { ...state, permitirExcepcion: action.payload };
    case 'RESTORE_BACKUP': return { ...action.payload };
    case 'CHANGE_CONDICION': {
      return { ...state, condicionEquipo: action.condicion };
    }
    default: return state;
  }
}

// ====================================================================
// 4. COMPONENTE PRINCIPAL (WORKSHEET)
// ====================================================================

export const WorkSheetScreen: React.FC<{ worksheetId?: string }> = ({ worksheetId }) => {
  const { currentConsecutive, goBack, currentUser, currentMagnitude } = useNavigation();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(worksheetReducer, initialState);
  const [isSaving, setIsSaving] = useState(false);
  const [listaClientes, setListaClientes] = useState<ClienteRecord[]>([]);
  const [tipoElectrica, setTipoElectrica] = useState<"DC" | "AC" | "Otros">("DC");
  const [showConverter, setShowConverter] = useState(false);
  
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null);
  const [isSearchingPdf, setIsSearchingPdf] = useState(false);
  
  const hiddenLabelRef = useRef<HTMLDivElement>(null);
  const [tapeSize, setTapeSize] = useState<"24mm" | "12mm">("24mm");
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [metrologyWarning, setMetrologyWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'warning'} | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [pendingUploads, setPendingUploads] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingQueueRef = useRef(false);

  const [electricalValues, setElectricalValues] = useState<Record<string, { patron: string, instrumento: string }>>({});

  const [localExc, setLocalExc] = useState({ p1: '', p2: '', p3: '', p4: '', p5: '' });

  useEffect(() => {
      if (state.magnitud === 'Masa' && state.excentricidad) {
          const next = { p1: '', p2: '', p3: '', p4: '', p5: '' };
          const lines = state.excentricidad.split('\n');
          lines.forEach(line => {
               if (line.startsWith('1')) next.p1 = line.substring(line.indexOf(':')+1).trim() || '';
               else if (line.startsWith('2')) next.p2 = line.substring(line.indexOf(':')+1).trim() || '';
               else if (line.startsWith('3')) next.p3 = line.substring(line.indexOf(':')+1).trim() || '';
               else if (line.startsWith('4')) next.p4 = line.substring(line.indexOf(':')+1).trim() || '';
               else if (line.startsWith('5')) next.p5 = line.substring(line.indexOf(':')+1).trim() || '';
          });
          setLocalExc(prev => (JSON.stringify(prev) !== JSON.stringify(next) ? next : prev));
      }
  }, [state.excentricidad, state.magnitud]);

  const handleExcChangeLocal = (key: keyof typeof localExc, val: string) => {
      setLocalExc(prev => ({ ...prev, [key]: val }));
  };

  const syncMasaToGlobalState = useCallback(() => {
      if (state.magnitud !== "Masa") return;
      const str = `1 (Centro): ${localExc.p1}\n2 (Inf Izq): ${localExc.p2}\n3 (Sup Izq): ${localExc.p3}\n4 (Sup Der): ${localExc.p4}\n5 (Inf Der): ${localExc.p5}`;
      if (state.excentricidad !== str) {
          dispatch({ type: 'SET_FIELD', field: 'excentricidad', payload: str });
      }
  }, [localExc, state.magnitud, state.excentricidad]);

  const activeClientNotes = useMemo(() => {
    const found = listaClientes.find(c => c.nombre === state.cliente);
    return found?.requerimientos || "";
  }, [state.cliente, listaClientes]);

  const nextCalibrationStr = useMemo(() => {
      if (!state.fecha || !state.frecuenciaCalibracion) return null;
      const nextDate = calcularSiguienteFecha(state.fecha, state.frecuenciaCalibracion);
      if (!nextDate) return null;
      return format(nextDate, "dd/MM/yyyy");
  }, [state.fecha, state.frecuenciaCalibracion]);

  useEffect(() => {
    const updatePendingCount = () => {
      setPendingUploads(getOfflineQueue().length);
    };

    const processOfflineQueue = async () => {
      if (processingQueueRef.current) return;
      const queue = getOfflineQueue();
      if (queue.length === 0) return;
      processingQueueRef.current = true;
      let uploaded = 0;
      for (const item of queue) {
        try {
          const { jsPDF: JsPDF } = await import("jspdf");
          const binaryStr = atob(item.pdfBlob);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const pdfRef = ref(storage, item.nombreArchivo);
          await uploadBytes(pdfRef, blob);
          const pdfURL = await getDownloadURL(pdfRef);
          const fullData = { ...item.data, pdfURL, cargado_drive: "Si", status: "completed" };
          if (item.finalDocId) {
            await updateDoc(doc(db, "hojasDeTrabajo", item.finalDocId), fullData);
          } else {
            await addDoc(collection(db, "hojasDeTrabajo"), fullData);
          }
          removeFromOfflineQueue(item.id);
          uploaded++;
        } catch (err) {
          console.error("Error procesando cola offline:", err);
        }
      }
      processingQueueRef.current = false;
      updatePendingCount();
      if (uploaded > 0) {
        setToast({ message: `☁️ ${uploaded} hoja${uploaded > 1 ? 's' : ''} de trabajo subida${uploaded > 1 ? 's' : ''} correctamente al reconectarse.`, type: 'success' });
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(processOfflineQueue, 1500);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updatePendingCount();
    if (navigator.onLine) {
      setTimeout(processOfflineQueue, 2000);
    }

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (worksheetId) {
      const fetchWorksheet = async () => {
        const docRef = doc(db, "hojasDeTrabajo", worksheetId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          dispatch({ type: 'RESTORE_BACKUP', payload: docSnap.data() as WorksheetState });
        }
      };
      fetchWorksheet();
    }
  }, [worksheetId]);

  useEffect(() => {
    if (state.magnitud === "Electrica" && state.unidad.length > 0) {
        const newValues: Record<string, { patron: string, instrumento: string }> = {};
        const extractValue = (fullText: string, unit: string) => {
            if (!fullText) return "";
            const lines = fullText.split('\n');
            let inSection = false;
            let extracted = '';
            for (const line of lines) {
              if (line.trim().startsWith(`${unit}:`)) {
                inSection = true;
                continue;
              }
              if (inSection) {
                if (line.trim() === '' || /^[a-zA-Z0-9]+:/.test(line.trim())) break;
                extracted += line + '\n';
              }
            }
            return extracted.trim();
        };
        state.unidad.forEach(u => {
            newValues[u] = {
                patron: extractValue(state.medicionPatron, u),
                instrumento: extractValue(state.medicionInstrumento, u)
            };
        });
        setElectricalValues(newValues);
    }
  }, [state.magnitud, state.unidad, state.medicionPatron, state.medicionInstrumento]); 

  const syncElectricalToGlobalState = useCallback(() => {
    if (state.magnitud !== "Electrica") return;
    let textoPatron = "";
    let textoInstrumento = "";
    state.unidad.forEach(u => {
        const vals = electricalValues[u] || { patron: "", instrumento: "" };
        if (vals.patron) textoPatron += `${u}:\n${vals.patron}\n\n`;
        if (vals.instrumento) textoInstrumento += `${u}:\n${vals.instrumento}\n\n`;
    });
    if (state.medicionPatron !== textoPatron.trim()) {
        dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: textoPatron.trim() });
    }
    if (state.medicionInstrumento !== textoInstrumento.trim()) {
        dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: textoInstrumento.trim() });
    }
  }, [electricalValues, state.magnitud, state.unidad, state.medicionPatron, state.medicionInstrumento]);

  const handleLocalElectricChange = (unit: string, type: 'patron' | 'instrumento', value: string) => {
    setElectricalValues(prev => ({
        ...prev,
        [unit]: { ...prev[unit], [type]: value }
    }));
  };

  useEffect(() => {
      if(!state.magnitud || (!state.tempAmbiente && !state.humedadRelativa)) {
          setMetrologyWarning(null);
          return;
      }
      const limits = { tMin: 18, tMax: 26, hMin: 30, hMax: 70 }; 
      const temp = Number(state.tempAmbiente);
      const hr = Number(state.humedadRelativa);
      let warning = "";

      if (state.tempAmbiente && (temp < limits.tMin || temp > limits.tMax)) {
          warning += `Temp fuera de rango (${limits.tMin}-${limits.tMax}°C). `;
      }
      if (state.humedadRelativa && (hr < limits.hMin || hr > limits.hMax)) {
          warning += `HR% fuera de rango (${limits.hMin}-${limits.hMax}%). `;
      }
      if (warning) { setMetrologyWarning(warning.trim()); } else { setMetrologyWarning(null); }
  }, [state.tempAmbiente, state.humedadRelativa, state.magnitud]);

  useEffect(() => {
    const backup = localStorage.getItem('backup_worksheet_data');
    if (backup && !worksheetId) { 
      try {
        const parsedBackup = JSON.parse(backup) as WorksheetState;
        if (window.confirm("Se encontró una hoja de trabajo no guardada. ¿Desea restaurarla?")) { dispatch({ type: 'RESTORE_BACKUP', payload: parsedBackup }); }
        localStorage.removeItem('backup_worksheet_data'); 
      } catch (e) { console.error("Error al restaurar respaldo", e); localStorage.removeItem('backup_worksheet_data'); }
    }
  }, [worksheetId]);

  const validarIdEnPeriodo = useCallback(async () => {
    dispatch({ type: 'CLEAR_ID_BLOCK' });
    const id = state.id?.trim(); 
    const cliente = state.cliente;
    if (!id || !cliente) return;

    const q = query(collection(db, "hojasDeTrabajo"), where("id", "==", id), where("cliente", "==", cliente));
    const docs = await getDocs(q);
    if (docs.empty) return;

    let maxFecha: Date | null = null; 
    let frecuenciaAnterior: string | undefined = undefined; 
    let maxFechaString: string | undefined = undefined;
    
    docs.forEach(doc => {
      const data = doc.data(); 
      if (data.fecha) {
        const parts = data.fecha.split('-');
        if (parts.length === 3) {
          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          if (!isNaN(dateObj.getTime())) {
            if (!maxFecha || dateObj.getTime() > maxFecha.getTime()) { maxFecha = dateObj; frecuenciaAnterior = data.frecuenciaCalibracion; maxFechaString = data.fecha; }
          }
        }
      }
    });

    if (!maxFecha || !frecuenciaAnterior) return;
    const nextAllowed = calcularSiguienteFecha(maxFechaString!, frecuenciaAnterior);
    if (!nextAllowed) return;

    if (isBefore(new Date(), nextAllowed)) {
      dispatch({ type: 'SET_ID_BLOCKED', message: `⛔️ Este equipo fue calibrado el ${format(maxFecha, "dd/MM/yyyy")} (Frecuencia: ${frecuenciaAnterior}). Próxima calibración permitida: ${format(nextAllowed, "dd/MM/yyyy")}.` });
    }
  }, [state.id, state.cliente]);

  useEffect(() => { validarIdEnPeriodo(); }, [validarIdEnPeriodo]);

  const cargarEmpresas = async () => {
    try {
      const qs = await getDocs(collection(db, "clientes"));
      setListaClientes(qs.docs.map((d) => ({ 
          id: d.id, 
          nombre: d.data().nombre || "Sin nombre",
          requerimientos: d.data().requerimientos || "" 
      })));
    } catch { setListaClientes([{ id: "1", nombre: "ERROR AL CARGAR CLIENTES" }]); }
  };

  useEffect(() => {
    const u = currentUser || user; dispatch({ type: 'SET_USER_NAME', payload: getUserName(u) }); cargarEmpresas();
  }, [currentUser, user]);

  useEffect(() => {
    const cert = currentConsecutive || ""; dispatch({ type: 'SET_CONSECUTIVE', consecutive: cert, magnitud: extractMagnitudFromConsecutivo(cert) });
  }, [currentConsecutive]);

  useEffect(() => { if (currentMagnitude) dispatch({ type: 'SET_MAGNITUD', payload: currentMagnitude }); }, [currentMagnitude]);

  const unidadesDisponibles = React.useMemo(() => {
    if (state.magnitud === "Electrica") return [...unidadesPorMagnitud.Electrica.DC, ...unidadesPorMagnitud.Electrica.AC, ...unidadesPorMagnitud.Electrica.Otros] as string[];
    return (state.magnitud && unidadesPorMagnitud[state.magnitud]) ? unidadesPorMagnitud[state.magnitud] as string[] : [];
  }, [state.magnitud]);

  const handleIdBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const newId = String(e.target.value || "").trim();
    let masterFound = false;
    if (state.cliente.toLowerCase().includes("celestica") && newId) {
      const rec = findCelesticaById(newId);
      if (rec) { masterFound = true; dispatch({ type: 'AUTOCOMPLETE_SUCCESS', payload: { equipo: rec.B ?? "", marca: rec.C ?? "", modelo: rec.D ?? "", numeroSerie: rec.E ?? "" }}); }
    }
    if (isMexicoMROClient(state.cliente) && newId && !masterFound) {
      const rec = findTechopsById(newId);
      if (rec) { masterFound = true; dispatch({ type: 'AUTOCOMPLETE_SUCCESS', payload: { equipo: rec.B ?? "", marca: rec.C ?? "", modelo: rec.D ?? "", numeroSerie: rec.E ?? "" }}); }
    }
    if (!masterFound) dispatch({ type: 'AUTOCOMPLETE_FAIL' });

    if (newId.startsWith("EP-")) {
      setIsSearchingPdf(true);
      setLastPdfUrl(null);
      try {
        const cloudFunctionUrl = `https://us-central1-TU-PROYECTO.cloudfunctions.net/buscarPdfDrive?id=${newId}`;
        const response = await fetch(cloudFunctionUrl);

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (data.fileUrl) {
              setLastPdfUrl(data.fileUrl);
              setToast({ message: "Certificado anterior (Schedule) localizado en Drive.", type: 'success' });
            }
          }
        }
      } catch (error) {
        console.error("Error buscando el PDF en Drive:", error);
      } finally {
        setIsSearchingPdf(false);
      }
    }

    validarIdEnPeriodo();
  };

  const handleToggleElectrica = (unidadBase: string) => {
    let unidadFinal = unidadBase;
    const admiteSufijo = ["V", "mV", "kV", "A", "mA", "µA"].includes(unidadBase);
    if (admiteSufijo) {
      if (tipoElectrica === "DC") unidadFinal = `${unidadBase}DC`;
      if (tipoElectrica === "AC") unidadFinal = `${unidadBase}AC`;
    }
    const yaExiste = state.unidad.includes(unidadFinal);
    let nuevasUnidades = [];
    if (yaExiste) { nuevasUnidades = state.unidad.filter(u => u !== unidadFinal); } else { nuevasUnidades = [...state.unidad, unidadFinal]; }
    dispatch({ type: 'SET_FIELD', field: 'unidad', payload: nuevasUnidades });
    if(validationErrors.unidad && nuevasUnidades.length > 0) { setValidationErrors({...validationErrors, unidad: false}); }
  };

  const sanitize = (str: string) => str.replace(/<script.*?>.*?<\/script>/gi, '').trim();

  const validarContenidoMedicion = (texto: string): { valido: boolean, error?: string } => {
    if (!texto) return { valido: true }; 
    const lineas = texto.split('\n').filter(l => l.trim() !== '' && !l.trim().endsWith(':')); 
    const regexProhibido = /^(ok|pasa|bien|cumple|n\/a|\.|-|\*|x|\?|pendiente|tbd)$/i;
    
    for (const linea of lineas) {
        const limpia = linea.trim();
        if (regexProhibido.test(limpia)) {
            return { valido: false, error: `No se permite texto genérico como "${limpia}". Ingrese valores numéricos reales.` };
        }
        if (!/\d/.test(limpia)) {
             return { valido: false, error: `La medición "${limpia}" no contiene números. Se requieren valores reales.` };
        }
    }
    return { valido: true };
  };

  const handleSave = useCallback(async () => {
    syncElectricalToGlobalState();
    syncMasaToGlobalState();

    const errors: Record<string, boolean> = {};
    const requiredFields = ["lugarCalibracion", "certificado", "nombre", "cliente", "id", "equipo", "marca", "magnitud", "unidad", "alcance", "resolucion"];
    let hasError = false;
    
    requiredFields.forEach(field => {
       const val = state[field as keyof WorksheetState];
       if (Array.isArray(val) ? val.length === 0 : !val || String(val).trim() === "") {
           errors[field] = true;
           hasError = true;
       }
    });

    const camposAValidar: { campo: string, valor: string, nombre: string }[] = [];

    if (state.magnitud === "Masa") {
        camposAValidar.push(
            { campo: 'excentricidad', valor: state.excentricidad, nombre: 'Excentricidad' },
            { campo: 'linealidad', valor: state.linealidad, nombre: 'Linealidad' },
            { campo: 'repetibilidad', valor: state.repetibilidad, nombre: 'Repetibilidad' }
        );
    } else if (state.magnitud === "Electrica") {
        state.unidad.forEach(u => {
            const vals = electricalValues[u] || { patron: "", instrumento: "" };
            camposAValidar.push(
                { campo: `patron_${u}`, valor: vals.patron, nombre: `Patrón (${u})` },
                { campo: `instrumento_${u}`, valor: vals.instrumento, nombre: `Instrumento (${u})` }
            );
        });
    } else {
        camposAValidar.push(
            { campo: 'medicionPatron', valor: state.medicionPatron, nombre: 'Medición Patrón' },
            { campo: 'medicionInstrumento', valor: state.medicionInstrumento, nombre: 'Medición Instrumento' }
        );
    }

    for (const item of camposAValidar) {
        const check = validarContenidoMedicion(item.valor);
        if (!check.valido) {
            setToast({ message: `Error en ${item.nombre}: ${check.error}`, type: 'error' });
            return;
        }
    }

    let advertenciaNorma = "";
    
    if (state.magnitud === "Masa") {
         const lineasLinealidad = state.linealidad.split('\n').filter(l => /\d/.test(l));
         if (lineasLinealidad.length < 3) {
             advertenciaNorma = `Para MASA (Linealidad), se recomiendan mínimo 3 puntos. Detectados: ${lineasLinealidad.length}.`;
         }
    } else if (state.magnitud === "Electrica") {
        for (const u of state.unidad) {
             const vals = electricalValues[u];
             const lineas = (vals?.patron || "").split('\n').filter(l => /\d/.test(l));
             if (lineas.length < 3) {
                 advertenciaNorma = `Para ELÉCTRICA (${u}), se recomiendan mínimo 3 puntos de medición.`;
                 break;
             }
        }
    } else {
        const lineas = state.medicionPatron.split('\n').filter(l => /\d/.test(l));
        if (lineas.length < 3) {
             advertenciaNorma = `Para ${state.magnitud}, la norma sugiere cubrir el alcance (mínimo 3 puntos). Solo detecté ${lineas.length}.`;
        }
    }

    if (advertenciaNorma) {
        if (!window.confirm(`⚠️ ADVERTENCIA DE NORMA (ISO 17025):\n\n${advertenciaNorma}\n\n¿Deseas guardar de todos modos?`)) {
            return;
        }
    }

    if (state.fechaRecepcion && state.fecha && new Date(state.fechaRecepcion) > new Date(state.fecha)) {
      errors.fecha = true;
      errors.fechaRecepcion = true;
      setToast({ message: "La fecha de recepción debe ser antes de la fecha de calibración.", type: 'error' });
      hasError = true;
    }

    if (hasError) {
        setValidationErrors(errors);
        setToast({ message: "Completa los campos obligatorios para continuar.", type: 'error' });
        return; 
    }
    setValidationErrors({});

    if (!state.permitirExcepcion) {
        const idToCheck = state.id?.trim();
        const clientToCheck = state.cliente;
        setIsSaving(true); 
        try {
            const q = query(collection(db, "hojasDeTrabajo"), where("id", "==", idToCheck), where("cliente", "==", clientToCheck));
            const docs = await getDocs(q);
            if (!docs.empty) {
                let maxFecha: Date | null = null;
                let frecuenciaAnterior: string | undefined = undefined;
                docs.forEach(doc => {
                  const data = doc.data(); 
                  if (data.fecha) {
                      const parts = data.fecha.split('-');
                      if (parts.length === 3) {
                          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                          if (!isNaN(dateObj.getTime())) {
                            if (!maxFecha || dateObj.getTime() > maxFecha.getTime()) { 
                                maxFecha = dateObj; 
                                frecuenciaAnterior = data.frecuenciaCalibracion; 
                            }
                          }
                      }
                  }
                });

                if (maxFecha && frecuenciaAnterior) {
                    const nextAllowed = calcularSiguienteFecha(format(maxFecha, "yyyy-MM-dd"), frecuenciaAnterior);
                    if (nextAllowed && isBefore(new Date(), nextAllowed)) {
                        setIsSaving(false);
                        setToast({ message: `⛔️ ERROR: Equipo calibrado recientemente. Habilita 'Permitir excepción' para continuar.`, type: 'error' });
                        return; 
                    }
                }
            }
        } catch (err) {
            console.error("Error verificando fechas:", err);
        }
    }

    setIsSaving(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdfDoc = generateTemplatePDF(state, jsPDF as any); 
      const blob = pdfDoc.output("blob");
      const nombreArchivo = `worksheets/${getUserName(currentUser || user)}/${state.certificado}_${state.id || "SINID"}.pdf`;

      let finalDocId = worksheetId || null;
      let existingData: any = null;

      if (!finalDocId) {
          if (navigator.onLine) {
            const q = query(collection(db, "hojasDeTrabajo"), where("certificado", "==", state.certificado));
            if (!(await getDocs(q)).empty && !worksheetId) {
              setIsSaving(false);
              setToast({ message: "El número de certificado ya existe.", type: 'error' });
              return;
            }

            const qDupe = query(
                collection(db, "hojasDeTrabajo"),
                where("id", "==", state.id.trim()),
                where("cliente", "==", state.cliente)
            );
            const dupeDocs = await getDocs(qDupe);
            let bestMatchDate = -1;
            dupeDocs.forEach(d => {
                const data = d.data();
                if (!data.pdfURL || data.status_certificado === 'Pendiente de Certificado' || data.status_equipo === 'Desconocido' || data.status_equipo === 'Recepción') {
                    const docTime = new Date(data.createdAt || data.fechaEntrada || 0).getTime();
                    if (docTime > bestMatchDate) {
                        bestMatchDate = docTime;
                        finalDocId = d.id;
                        existingData = data;
                    }
                }
            });
          }
      }

      const sanitizedState: WorksheetState = { ...state };
      for (const key in sanitizedState) {
        if (typeof sanitizedState[key as keyof WorksheetState] === 'string') {
          sanitizedState[key as keyof WorksheetState] = sanitize(sanitizedState[key as keyof WorksheetState] as string) as never;
        }
      }

      const lugarNormalizado = sanitizedState.lugarCalibracion.toLowerCase() === "sitio" ? "sitio" : "laboratorio";

      const fullData: any = { 
          ...sanitizedState, 
          lugarCalibracion: lugarNormalizado, 
          folio: sanitizedState.certificado, 
          serie: sanitizedState.numeroSerie, 
          status: "completed",
          priority: "medium",
          status_equipo: "Calibrado",        
          status_certificado: "Generado",    
          cargado_drive: "Pendiente",               
          timestamp: Date.now(), 
          createdAt: existingData?.createdAt || new Date().toISOString(), 
          userId: currentUser?.uid || user?.uid || "unknown" 
      };
      
      if (!fullData.fechaRecepcion && existingData?.fechaEntrada) {
          fullData.fechaRecepcion = existingData.fechaEntrada;
          fullData.fechaEntrada = existingData.fechaEntrada;
      }

      if (state.fotoEquipoBase64 && navigator.onLine) {
        try {
          const imgData = state.fotoEquipoBase64.startsWith('data:') ? state.fotoEquipoBase64 : `data:image/jpeg;base64,${state.fotoEquipoBase64}`;
          const imgBlob = await fetch(imgData).then(r => r.blob());
          const fotoRef = ref(storage, `worksheets/fotos/${state.certificado}_${state.id || "SINID"}.jpg`);
          await uploadBytes(fotoRef, imgBlob);
          fullData.fotoEquipoURL = await getDownloadURL(fotoRef);
        } catch (fotoErr) {
          console.error("Error subiendo foto:", fotoErr);
        }
      }

      if (navigator.onLine) {
        const pdfRef = ref(storage, nombreArchivo);
        await uploadBytes(pdfRef, blob);
        const pdfURL = await getDownloadURL(pdfRef);
        fullData.pdfURL = pdfURL;
        fullData.cargado_drive = "Si";

        if (finalDocId) {
          await updateDoc(doc(db, "hojasDeTrabajo", finalDocId), fullData);
        } else {
          await addDoc(collection(db, "hojasDeTrabajo"), fullData);
        }

        setToast({ message: "✅ Guardado e impreso correctamente.", type: 'success' });
        localStorage.removeItem('backup_worksheet_data');

        try {
          // @ts-ignore
          await generateAndPrintLabel(hiddenLabelRef, tapeSize);
        } catch (printError) {
          console.error("Error al imprimir:", printError);
          setToast({ message: "⚠️ Guardado OK, pero falló la impresión.", type: 'warning' });
        }

        setTimeout(() => goBack(), 1500);

      } else {
        const pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const queueItem: OfflineQueueItem = {
          id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: Date.now(),
          data: fullData,
          pdfBlob: pdfBase64,
          nombreArchivo,
          finalDocId,
          worksheetId,
        };

        addToOfflineQueue(queueItem);
        setPendingUploads(getOfflineQueue().length);
        localStorage.removeItem('backup_worksheet_data');

        setToast({ 
          message: "📵 Sin conexión. Hoja guardada localmente. Se subirá automáticamente cuando haya internet.", 
          type: 'warning' 
        });

        try {
          // @ts-ignore
          await generateAndPrintLabel(hiddenLabelRef, tapeSize);
        } catch {}

        setTimeout(() => goBack(), 2000);
      }

    } catch (e: any) {
      console.error("Error al guardar:", e);
      localStorage.setItem('backup_worksheet_data', JSON.stringify(state));
      setToast({ message: `Error inesperado: ${e.message || e}. Se guardó copia local.`, type: 'warning' });
    } finally {
      setIsSaving(false);
    }
  }, [state, currentUser, user, goBack, worksheetId, electricalValues, syncElectricalToGlobalState, syncMasaToGlobalState]);

  const slaInfo = React.useMemo(() => {
    if (state.lugarCalibracion !== "Laboratorio" || !state.fechaRecepcion || !state.fecha) {
      return null;
    }
    const recepcion = parseISO(state.fechaRecepcion);
    const calibracion = parseISO(state.fecha);
    const fechaLimite = addBusinessDays(recepcion, 5);
    const esTardio = isAfter(calibracion, fechaLimite);
    const diasHabiliesTomados = differenceInBusinessDays(calibracion, recepcion);

    return {
      esTardio,
      fechaLimiteStr: format(fechaLimite, "dd/MM/yyyy"),
      diasTomados: diasHabiliesTomados
    };
  }, [state.lugarCalibracion, state.fechaRecepcion, state.fecha]);

  const inputClass = (fieldName: string) => `w-full p-4 border rounded-lg transition-all focus:ring-2 focus:ring-blue-500 text-gray-900 ${validationErrors[fieldName] ? "border-red-500 bg-red-50 focus:ring-red-500" : "border-gray-200 bg-white"}`;

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      dispatch({ type: 'SET_FIELD', field: 'fotoEquipoBase64', payload: base64 });
    };
    reader.readAsDataURL(file);
  };

  const labelData: LabelData = React.useMemo(() => {
    const nextDate = calcularSiguienteFecha(state.fecha, state.frecuenciaCalibracion);
    const fCalObj = state.fecha ? parseISO(state.fecha) : new Date();
    const fSugObj = nextDate ? nextDate : addYears(fCalObj, 1);

    return {
        id: state.id || "PENDIENTE",
        certificado: state.certificado || "PENDIENTE",
        fechaCal: state.fecha ? format(fCalObj, "yyyy-MMM-dd", { locale: es }).toUpperCase().replace('.', '') : "---",
        fechaSug: isValid(fSugObj) ? format(fSugObj, "yyyy-MMM-dd", { locale: es }).toUpperCase().replace('.', '') : "---",
        calibro: state.nombre 
          ? state.nombre.split(' ').map(n => n[0]).join('.').toUpperCase() 
          : "A.A"
    };
  }, [state.fecha, state.frecuenciaCalibracion, state.id, state.certificado, state.nombre]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 relative">
      
      {toast && <ToastNotification message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-lg sticky top-0 z-40">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center"><Tag className="w-6 h-6" /></div>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  Hoja de Trabajo {worksheetId ? "(Edición)" : ""}
                  <div className={`w-3 h-3 rounded-full shadow-md ${isOnline ? 'bg-green-400' : 'bg-orange-400 animate-pulse'}`} title={isOnline ? "Online" : "Offline - Guardando Localmente"}></div>
                </h1>
                <p className="text-blue-100 text-sm flex items-center gap-2">
                  Consecutivo: {state.certificado || "SIN CERTIFICADO"}
                  {!isOnline && <span className="text-xs bg-orange-500/80 px-2 py-0.5 rounded text-white flex items-center gap-1"><WifiOff className="w-3 h-3"/> Offline</span>}
                  {pendingUploads > 0 && isOnline && (
                    <span className="text-xs bg-yellow-500/90 px-2 py-0.5 rounded text-white flex items-center gap-1 animate-pulse">
                      <CloudUpload className="w-3 h-3"/> Subiendo {pendingUploads} pendiente{pendingUploads > 1 ? 's' : ''}…
                    </span>
                  )}
                  {pendingUploads > 0 && !isOnline && (
                    <span className="text-xs bg-orange-600/90 px-2 py-0.5 rounded text-white flex items-center gap-1">
                      <CloudOff className="w-3 h-3"/> {pendingUploads} en cola offline
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            
            <LabelPrinterButton data={labelData} logo={logoAg} />

            <button onClick={() => setShowConverter(true)} className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-all bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95">
              <Calculator className="w-4 h-4" /><span className="text-sm font-medium hidden md:inline">Convertidor</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <div className={activeClientNotes ? "lg:col-span-8 transition-all duration-300" : "lg:col-span-10 lg:col-start-2 transition-all duration-300"}>
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900">Información de Calibración</h2>
                <p className="text-gray-600 mt-1">Complete los datos obligatorios marcados con *.</p>
              </div>
              <div className="p-8 space-y-8">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><MapPin className="w-4 h-4 text-orange-500" /><span>Lugar de Calibración*</span></label>
                  <div className={`grid grid-cols-3 gap-4 text-gray-700 p-1 rounded-lg ${validationErrors.lugarCalibracion ? 'bg-red-50 border border-red-200' : ''}`}>
                    {["Sitio", "Laboratorio"].map((opt) => (
                      <button key={opt} onClick={() => { 
                          dispatch({ type: 'SET_FIELD', field: 'lugarCalibracion', payload: opt });
                          if(validationErrors.lugarCalibracion) setValidationErrors({...validationErrors, lugarCalibracion: false});
                      }}
                        className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${state.lugarCalibracion === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>{opt}</button>
                    ))}
                  </div>
                </div>
                {state.lugarCalibracion === "Laboratorio" && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                    <label className="block font-semibold text-sm text-gray-700 mb-1">Fecha de Recepción</label>
                    <input type="date" className={`w-full border rounded px-3 py-2 text-sm text-gray-900 bg-white ${validationErrors.fechaRecepcion ? 'border-red-500 bg-red-50' : ''}`} value={state.fechaRecepcion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fechaRecepcion', payload: e.target.value })} />
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Calendar className="w-4 h-4 text-green-500" /><span>Frecuencia*</span></label>
                    <select value={state.frecuenciaCalibracion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'frecuenciaCalibracion', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white">
                      <option value="">Seleccionar...</option><option value="3 meses">3 meses</option><option value="6 meses">6 meses</option><option value="1 año">1 año</option><option value="2 años">2 años</option><option value="3 años">3 años</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Calendar className="w-4 h-4 text-blue-500" /><span>Fecha*</span></label>
                    <input type="date" value={state.fecha} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fecha', payload: e.target.value })} className={`w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${validationErrors.fecha ? 'border-red-500 bg-red-50' : ''}`} />
                    
                    {/* UI: RECUADRO DE PRÓXIMA CALIBRACIÓN */}
                    {nextCalibrationStr && (
                      <div className="mt-2 p-3 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 text-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                        <Calendar className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Próxima Calibración: {nextCalibrationStr}</p>
                          <p className="text-xs opacity-90 mt-0.5">Calculada según la fecha y frecuencia indicada.</p>
                        </div>
                      </div>
                    )}

                    {slaInfo && (
                      <div className={`mt-2 p-3 rounded-lg border text-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-1 ${
                        slaInfo.esTardio 
                          ? "bg-red-50 border-red-200 text-red-800" 
                          : "bg-green-50 border-green-200 text-green-800"
                      }`}>
                        {slaInfo.esTardio ? (
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-bold">
                            {slaInfo.esTardio ? "Fuera de Tiempo Compromiso" : "Dentro de Tiempo Compromiso"}
                          </p>
                          <p className="text-xs opacity-90 mt-1">
                            {slaInfo.esTardio 
                              ? `La fecha límite era el ${slaInfo.fechaLimiteStr} (5 días hábiles).` 
                              : `Estás en el día ${Math.max(0, slaInfo.diasTomados)} de 5 hábiles permitidos.`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-purple-500" /><span>N.Certificado*</span></label><input type="text" value={state.certificado} readOnly className={`w-full p-4 border rounded-lg bg-gray-50 text-gray-800 ${validationErrors.certificado ? 'border-red-500 ring-1 ring-red-500' : ''}`} placeholder="Automático" /></div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Mail className="w-4 h-4 text-red-500" /><span>Nombre*</span></label><input type="text" value={state.nombre} readOnly className={`w-full p-4 border rounded-lg bg-gray-50 text-gray-800 ${validationErrors.nombre ? 'border-red-500 ring-1 ring-red-500' : ''}`} /></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Building2 className="w-4 h-4 text-indigo-500" /><span>Cliente*</span></label><ClienteSearchSelect clientes={listaClientes} onSelect={(v) => { dispatch({ type: 'SET_CLIENTE', payload: v }); if(validationErrors.cliente) setValidationErrors({...validationErrors, cliente: false}); }} currentValue={state.cliente} hasError={validationErrors.cliente} /></div>
                  
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-gray-500" /><span>ID*</span></label>
                    <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={state.id} 
                          onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'id', payload: e.target.value }); if(validationErrors.id) setValidationErrors({...validationErrors, id: false}); }} 
                          onBlur={handleIdBlur} 
                          className={`flex-1 p-4 border-2 rounded-lg transition-all text-gray-900 bg-white ${
                              state.idBlocked 
                                  ? (state.permitirExcepcion ? "border-orange-400 bg-orange-50 focus:ring-orange-500" : "border-red-500 bg-red-50 text-red-700") 
                                  : (validationErrors.id ? "border-red-500 bg-red-50" : "border-gray-200 focus:ring-blue-500")
                          }`} 
                          placeholder="ID" 
                        />
                        <button
                          type="button"
                          onClick={() => lastPdfUrl && window.open(lastPdfUrl, '_blank')}
                          disabled={!lastPdfUrl || isSearchingPdf}
                          className={`px-4 rounded-lg border flex items-center justify-center transition-all shadow-sm ${
                            lastPdfUrl 
                              ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:scale-105 active:scale-95" 
                              : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                          }`}
                          title={lastPdfUrl ? "Ver Schedule en Drive" : "No se encontró PDF"}
                        >
                          {isSearchingPdf ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </button>
                    </div>
                    
                    {state.idBlocked && (
                        <p className={`mt-2 text-sm font-medium animate-pulse ${state.permitirExcepcion ? "text-orange-600" : "text-red-600"}`}>
                            {state.permitirExcepcion ? "⚠️ Advertencia: Guardando bajo excepción." : state.idErrorMessage}
                        </p>
                    )}
                    
                    <div className="mt-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={state.permitirExcepcion} 
                              onChange={(e) => dispatch({ type: 'SET_EXCEPCION', payload: e.target.checked })} 
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" 
                              disabled={!state.idBlocked} 
                             />
                            <span className={`text-sm ${state.idBlocked ? 'text-gray-900 font-bold' : 'text-gray-400'}`}>
                              Permitir excepción de fecha
                            </span>
                        </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Wrench className="w-4 h-4 text-yellow-500" /><span>Equipo*</span></label><input type="text" value={state.equipo} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'equipo', payload: e.target.value }); if(validationErrors.equipo) setValidationErrors({...validationErrors, equipo: false}); }} readOnly={state.fieldsLocked} className={inputClass('equipo')} /></div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Tag className="w-4 h-4 text-pink-500" /><span>Marca*</span></label><input type="text" value={state.marca} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'marca', payload: e.target.value }); if(validationErrors.marca) setValidationErrors({...validationErrors, marca: false}); }} readOnly={state.fieldsLocked} className={inputClass('marca')} /></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-teal-500" /><span>Modelo</span></label><input type="text" value={state.modelo} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'modelo', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200 text-gray-900 bg-white" /></div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-purple-500" /><span>Nº Serie</span></label><input type="text" value={state.numeroSerie} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'numeroSerie', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200 text-gray-900 bg-white" /></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <Tag className="w-4 h-4 text-blue-500" /><span>Magnitud*</span>
                    </label>
                    {currentMagnitude ? (
                      <div className="relative">
                        <input type="text" value={state.magnitud} readOnly 
                          className="w-full p-4 border border-gray-300 rounded-lg bg-gray-100 text-gray-900 font-bold" />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 font-medium">Auto</div>
                      </div>
                    ) : (
                      <select value={state.magnitud} 
                        onChange={(e) => { 
                          dispatch({ type: 'SET_MAGNITUD', payload: e.target.value }); 
                          if(validationErrors.magnitud) setValidationErrors({...validationErrors, magnitud: false}); 
                        }} 
                        className={`w-full p-4 border rounded-lg outline-none bg-white text-gray-900 appearance-none cursor-pointer ${validationErrors.magnitud ? "border-red-500 ring-1 ring-red-500" : "border-gray-300 focus:ring-2 focus:ring-blue-500"}`}>
                        <option value="" className="text-gray-400">Seleccionar...</option>
                        {magnitudesDisponibles.map(m => <option key={m} value={m} className="text-gray-900">{m}</option>)}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <Tag className="w-4 h-4 text-violet-500" /><span>Unidad*</span>
                    </label>
                    {state.magnitud === "Electrica" ? (
                      <div className={`p-4 border rounded-lg bg-white ${validationErrors.unidad ? "border-red-500 bg-red-50" : "border-gray-200"}`}>
                        <div className="font-bold text-gray-800 mb-3 text-sm">Tipo Eléctrico</div>
                        <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-lg mb-4">
                          {(["DC", "AC", "Otros"] as const).map((tipo) => (
                            <button key={tipo} onClick={() => setTipoElectrica(tipo)}
                              className={`py-1.5 text-sm font-medium rounded-md transition-all ${tipoElectrica === tipo ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"}`}>
                              {tipo}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {unidadesPorMagnitud.Electrica[tipoElectrica].map((u: string) => {
                            let checkValue = u;
                            if (["V", "mV", "kV", "A", "mA", "µA"].includes(u)) {
                               if (tipoElectrica === "DC") checkValue = `${u}DC`;
                               if (tipoElectrica === "AC") checkValue = `${u}AC`;
                            }
                            const isChecked = state.unidad.includes(checkValue);
                            return (
                              <label key={u} className={`flex items-center space-x-2 p-2 rounded border cursor-pointer transition-all ${isChecked ? "bg-blue-50 border-blue-200" : "border-transparent hover:bg-gray-50"}`}>
                                <input type="checkbox" checked={isChecked} onChange={() => handleToggleElectrica(u)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                <span className={`text-sm ${isChecked ? "font-bold text-blue-800" : "text-gray-700"}`}>{u}</span>
                              </label>
                            );
                          })}
                        </div>
                        {state.unidad.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                            Seleccionado: <span className="font-medium text-blue-600">{state.unidad.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <select multiple value={state.unidad} 
                        onChange={(e) => { 
                          dispatch({ type: 'SET_FIELD', field: 'unidad', payload: Array.from(e.target.selectedOptions, o => o.value) }); 
                          if(validationErrors.unidad) setValidationErrors({...validationErrors, unidad: false}); 
                        }} 
                        disabled={!state.magnitud} 
                        className={`w-full p-4 border rounded-lg bg-white text-gray-900 outline-none h-[150px] ${validationErrors.unidad ? "border-red-500" : "border-gray-300 focus:ring-2 focus:ring-blue-500"}`}>
                        {!state.magnitud && <option value="" disabled>Seleccione magnitud primero</option>}
                        {unidadesDisponibles.map(u => <option key={u} value={u} className="p-1">{u}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Alcance*</label>
                  <input 
                      type="text" 
                      className={inputClass('alcance')} 
                      value={state.alcance} 
                      onChange={e => {
                           dispatch({ type: 'SET_FIELD', field: 'alcance', payload: e.target.value });
                           if(validationErrors.alcance) setValidationErrors({...validationErrors, alcance: false});
                      }} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Resolución*</label>
                  <input 
                      type="text" 
                      className={inputClass('resolucion')} 
                      value={state.resolucion} 
                      onChange={e => {
                           dispatch({ type: 'SET_FIELD', field: 'resolucion', payload: e.target.value });
                           if(validationErrors.resolucion) setValidationErrors({...validationErrors, resolucion: false});
                      }} 
                  />
                </div>

                {/* ============================================================ */}
                {/* SECCIÓN: CONDICIÓN DEL EQUIPO + FOTO                         */}
                {/* ============================================================ */}
                <div className="rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-gray-800 to-slate-700 px-6 py-4 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-white font-bold text-sm">Inspección Visual del Equipo</h3>
                      <p className="text-gray-300 text-xs mt-0.5">¿El equipo presenta daños, golpes o anomalías visibles?</p>
                    </div>
                  </div>
                  <div className="p-6 bg-white space-y-5">
                    {/* Botones de condición */}
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'CHANGE_CONDICION', condicion: 'buenas' })}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all font-semibold text-sm ${
                          state.condicionEquipo === 'buenas'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-md'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-emerald-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${state.condicionEquipo === 'buenas' ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                          <CheckSquare className={`w-5 h-5 ${state.condicionEquipo === 'buenas' ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="text-left">
                          <div className="font-bold">Buenas condiciones</div>
                          <div className="text-xs font-normal opacity-70">Sin daños aparentes</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'CHANGE_CONDICION', condicion: 'dano' })}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all font-semibold text-sm ${
                          state.condicionEquipo === 'dano'
                            ? 'border-red-500 bg-red-50 text-red-800 shadow-md'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-red-300'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${state.condicionEquipo === 'dano' ? 'bg-red-100' : 'bg-gray-100'}`}>
                          <ShieldAlert className={`w-5 h-5 ${state.condicionEquipo === 'dano' ? 'text-red-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="text-left">
                          <div className="font-bold">Presenta daño / anomalía</div>
                          <div className="text-xs font-normal opacity-70">Requiere diagnóstico</div>
                        </div>
                      </button>
                    </div>

                    {/* Descripción del daño */}
                    {state.condicionEquipo === 'dano' && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
                          <AlertOctagon className="w-4 h-4" />
                          Descripción del daño o anomalía*
                        </label>
                        <textarea
                          value={state.descripcionDano}
                          onChange={e => dispatch({ type: 'SET_FIELD', field: 'descripcionDano', payload: e.target.value })}
                          rows={3}
                          placeholder="Ej: Golpe visible en la parte frontal, dial dañado, fuga de aceite..."
                          className="w-full p-3 border-2 border-red-200 rounded-xl resize-y focus:ring-2 focus:ring-red-400 text-sm bg-red-50 text-red-900 placeholder-red-300"
                        />
                      </div>
                    )}

                    {/* SECCIÓN FOTO */}
                    <div className="border-t border-gray-100 pt-5">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                        <Camera className="w-4 h-4 text-blue-500" />
                        Foto del equipo
                        <span className="text-xs font-normal text-gray-400">(evidencia visual — opcional)</span>
                      </label>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleFotoChange}
                      />

                      {!state.fotoEquipoBase64 ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all text-blue-600 hover:border-blue-400"
                        >
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <Upload className="w-6 h-6 text-blue-500" />
                          </div>
                          <div className="text-sm font-semibold">Tomar foto o subir imagen</div>
                          <div className="text-xs text-blue-400">Se incrustará en el PDF final</div>
                        </button>
                      ) : (
                        <div className="relative rounded-xl overflow-hidden border-2 border-emerald-300 shadow-md">
                          <img
                            src={state.fotoEquipoBase64}
                            alt="Foto del equipo"
                            className="w-full max-h-64 object-contain bg-gray-100"
                          />
                          <div className="absolute top-2 right-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="bg-white/90 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-white flex items-center gap-1"
                            >
                              <Camera className="w-3 h-3" /> Cambiar
                            </button>
                            <button
                              type="button"
                              onClick={() => dispatch({ type: 'SET_FIELD', field: 'fotoEquipoBase64', payload: '' })}
                              className="bg-white/90 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-white flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" /> Quitar
                            </button>
                          </div>
                          <div className="bg-emerald-600 text-white text-xs px-3 py-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Foto cargada · Se incluirá en el PDF
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {state.magnitud === "Masa" ? (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                       <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                           <Scale className="w-5 h-5 text-indigo-600"/> 
                           Parámetros de Medición MASA
                       </h3>
                    </div>
                    <div className="p-6 space-y-8">
                      {/* --- DISEÑO VISUAL EXCENTRICIDAD --- */}
                      <div>
                        <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                          <NotebookPen className="w-4 h-4 text-purple-500" /><span>Excentricidad</span>
                        </label>
                        <div className="relative w-full max-w-xl mx-auto h-[320px] border-2 border-gray-300 rounded-xl bg-white shadow-sm flex items-center justify-center overflow-hidden">
                           
                           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-full h-[2px] bg-gray-200"></div>
                           </div>
                           <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="h-full w-[2px] bg-gray-200"></div>
                           </div>
                           
                           <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                             <line x1="0" y1="0" x2="100%" y2="100%" stroke="#d1d5db" strokeWidth="2" strokeDasharray="8" />
                             <line x1="100%" y1="0" x2="0" y2="100%" stroke="#d1d5db" strokeWidth="2" strokeDasharray="8" />
                           </svg>
                           
                           <div className="absolute top-8 left-8 flex flex-col items-center">
                              <span className="text-xs font-bold text-gray-500 mb-1 bg-white px-2 rounded-full border">3 (Sup. Izq)</span>
                              <input type="text" value={localExc.p3} onChange={e => handleExcChangeLocal('p3', e.target.value)} onBlur={syncMasaToGlobalState} className="w-24 text-center text-sm p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/90 shadow-sm text-gray-900 font-medium" placeholder="0.000" />
                           </div>

                           <div className="absolute top-8 right-8 flex flex-col items-center">
                              <span className="text-xs font-bold text-gray-500 mb-1 bg-white px-2 rounded-full border">4 (Sup. Der)</span>
                              <input type="text" value={localExc.p4} onChange={e => handleExcChangeLocal('p4', e.target.value)} onBlur={syncMasaToGlobalState} className="w-24 text-center text-sm p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/90 shadow-sm text-gray-900 font-medium" placeholder="0.000" />
                           </div>

                           <div className="absolute flex flex-col items-center z-10 bg-white p-2 rounded-full shadow-lg border border-blue-100">
                              <span className="text-sm font-bold text-blue-700 mb-1">1 (Centro)</span>
                              <input type="text" value={localExc.p1} onChange={e => handleExcChangeLocal('p1', e.target.value)} onBlur={syncMasaToGlobalState} className="w-28 text-center text-base p-2 border-2 border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-600 bg-blue-50 text-gray-900 font-bold" placeholder="0.000" />
                           </div>

                           <div className="absolute bottom-8 left-8 flex flex-col items-center">
                              <input type="text" value={localExc.p2} onChange={e => handleExcChangeLocal('p2', e.target.value)} onBlur={syncMasaToGlobalState} className="w-24 text-center text-sm p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/90 shadow-sm text-gray-900 font-medium" placeholder="0.000" />
                              <span className="text-xs font-bold text-gray-500 mt-1 bg-white px-2 rounded-full border">2 (Inf. Izq)</span>
                           </div>

                           <div className="absolute bottom-8 right-8 flex flex-col items-center">
                              <input type="text" value={localExc.p5} onChange={e => handleExcChangeLocal('p5', e.target.value)} onBlur={syncMasaToGlobalState} className="w-24 text-center text-sm p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/90 shadow-sm text-gray-900 font-medium" placeholder="0.000" />
                              <span className="text-xs font-bold text-gray-500 mt-1 bg-white px-2 rounded-full border">5 (Inf. Der)</span>
                           </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                            <NotebookPen className="w-4 h-4 text-pink-500" /><span>Linealidad (Presiona Enter para nueva línea)</span>
                          </label>
                          <textarea 
                            value={state.linealidad} 
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'linealidad', payload: e.target.value })} 
                            className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-300 min-h-[140px] font-mono text-sm shadow-inner resize-y text-gray-900 bg-white" 
                            rows={6} 
                            placeholder="Punto 1: 10.000 g&#10;Punto 2: 20.000 g&#10;Punto 3: 30.000 g..." 
                          />
                        </div>
                        <div>
                          <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                            <NotebookPen className="w-4 h-4 text-orange-500" /><span>Repetibilidad (Presiona Enter para nueva línea)</span>
                          </label>
                          <textarea 
                            value={state.repetibilidad} 
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'repetibilidad', payload: e.target.value })} 
                            className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-300 min-h-[140px] font-mono text-sm shadow-inner resize-y text-gray-900 bg-white" 
                            rows={6} 
                            placeholder="Lectura 1: 5.001 g&#10;Lectura 2: 5.002 g&#10;Lectura 3: 5.001 g..." 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : state.magnitud === "Electrica" && state.unidad.length > 0 ? (
                  <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-blue-500"/> 
                            Mediciones por Unidad Eléctrica (Scroll ilimitado)
                        </h3>
                    </div>
                
                    <div className="grid grid-cols-12 gap-6 mb-2 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <div className="col-span-2 flex items-center">Unidad</div>
                        <div className="col-span-5 pl-1">Medición Patrón</div>
                        <div className="col-span-5 pl-1">Medición Instrumento</div>
                    </div>
                
                    <div className="space-y-4">
                    {state.unidad.map((u) => (
                        <div key={u} className="grid grid-cols-12 gap-6 items-start">
                            <div className="col-span-2 pt-2">
                                <div className="text-sm font-bold text-blue-800 bg-blue-100 py-3 px-2 rounded-lg flex items-center justify-center text-center break-words shadow-sm border border-blue-200">
                                    {u}
                                </div>
                            </div>
                
                            <div className="col-span-5">
                                <textarea 
                                  placeholder="Ej: 10.00&#10;10.01&#10;10.02" 
                                  value={electricalValues[u]?.patron || ""}
                                  onChange={(e) => handleLocalElectricChange(u, 'patron', e.target.value)}
                                  onBlur={syncElectricalToGlobalState}
                                  rows={6} 
                                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[160px] shadow-sm font-mono leading-relaxed text-gray-900 bg-white" 
                                />
                            </div>
                
                            <div className="col-span-5">
                                <textarea 
                                  placeholder="Ej: 9.99&#10;10.00&#10;10.01"
                                  value={electricalValues[u]?.instrumento || ""}
                                  onChange={(e) => handleLocalElectricChange(u, 'instrumento', e.target.value)}
                                  onBlur={syncElectricalToGlobalState}
                                  rows={6} 
                                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[160px] shadow-sm font-mono leading-relaxed text-gray-900 bg-white" 
                                />
                            </div>
                        </div>
                    ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-teal-400" /><span>Medición Patrón</span></label><textarea value={state.medicionPatron} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: e.target.value })} rows={6} className="w-full p-2 border rounded resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 border-gray-200 text-gray-900 bg-white" /></div>
                    <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-blue-400" /><span>Medición Instrumento</span></label><textarea value={state.medicionInstrumento} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: e.target.value })} rows={6} className="w-full p-2 border rounded resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 border-gray-200 text-gray-900 bg-white" /></div>
                  </div>
                )}
                
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-gray-400" /><span>Notas Técnicas</span></label><textarea value={state.notas} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'notas', payload: e.target.value })} className="w-full p-4 border rounded-lg resize-y min-h-[100px] focus:ring-2 focus:ring-blue-500 border-gray-200 text-gray-900 bg-white" rows={4} placeholder="Notas y observaciones multilínea..." /></div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-sky-400" /><span>Temp. Ambiente (°C)</span></label><input type="number" value={state.tempAmbiente} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'tempAmbiente', payload: e.target.value })} className={inputClass('tempAmbiente')} /></div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-pink-400" /><span>HR%</span></label><input type="number" value={state.humedadRelativa} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'humedadRelativa', payload: e.target.value })} className={inputClass('humedadRelativa')} /></div>
                  
                  {metrologyWarning && (
                    <div className="lg:col-span-2 mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5 text-yellow-600"/>
                        <div>
                            <p className="font-bold text-sm">Condiciones Ambientales Fuera de Norma</p>
                            <p className="text-xs mt-1">{metrologyWarning}</p>
                        </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {activeClientNotes && (
            <div className="lg:col-span-4 sticky top-24 animate-in fade-in slide-in-from-right duration-500">
               <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 shadow-sm ring-1 ring-yellow-200">
                  <div className="flex items-center gap-3 mb-4 border-b border-yellow-200 pb-3">
                     <div className="p-2 bg-yellow-100 rounded-lg text-yellow-700">
                        <FileText className="w-6 h-6" />
                     </div>
                     <div>
                        <h3 className="font-bold text-yellow-900 text-lg">Requerimientos</h3>
                        <p className="text-xs text-yellow-700 font-medium">Notas específicas del cliente</p>
                     </div>
                  </div>
                  
                  <div className="prose prose-sm text-yellow-900 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                     <p className="whitespace-pre-wrap leading-relaxed">{activeClientNotes}</p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-yellow-200 flex items-center gap-2 text-xs text-yellow-600">
                      <Info className="w-4 h-4" />
                      <span>Verifica estos puntos antes de calibrar.</span>
                  </div>
               </div>
            </div>
          )}

        </div>

        <div className="bg-gray-50 px-8 py-6 border-t border-gray-200 mt-8 rounded-lg">
          <div className="flex justify-end space-x-4">
            <button onClick={() => goBack()} className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all flex items-center space-x-2" disabled={isSaving}><X className="w-4 h-4" /><span>Cancelar</span></button>
            <button 
              onClick={handleSave} 
              disabled={isSaving || (state.idBlocked && !state.permitirExcepcion)} 
              className={`px-6 py-3 text-white font-medium rounded-lg transition-all flex items-center space-x-2 shadow-lg 
              ${(isSaving || (state.idBlocked && !state.permitirExcepcion)) 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800'}`}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? "Guardando e imprimiendo..." : "Guardar e Imprimir"}</span>
            </button>
          </div>
        </div>
      </div>

      {showConverter && <UnitConverterModal onClose={() => setShowConverter(false)} />}
      
      {/* CAPACITOR HIDDEN LABEL REF */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div 
          ref={hiddenLabelRef}
          style={{
            width: tapeSize === "24mm" ? "576px" : "288px",
            padding: "24px",
            backgroundColor: "white",
            fontFamily: "Arial, sans-serif"
          }}
        >
          {/* AQUÍ TAMBIÉN ESTÁ EL LOGO PARA LA IMPRESIÓN NATIVA DE EPSON */}
          <div style={{ 
            borderBottom: '3px solid black', 
            paddingBottom: '10px', 
            marginBottom: '10px', 
            display: 'flex', 
            justifyContent: 'center' 
          }}>
             <img src={logoAg} alt="Logo" style={{ height: tapeSize === "24mm" ? '80px' : '40px', objectFit: 'contain' }} />
          </div>
          
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '12px',
            color: '#000'
          }}>
            <div style={{ 
              fontSize: tapeSize === "24mm" ? "32px" : "20px",
              fontWeight: "bold" 
            }}>
              {state.id || "PENDIENTE"}
            </div>
            <div style={{ fontSize: tapeSize === "24mm" ? "16px" : "12px" }}>
              Cal: {state.fecha ? format(parseISO(state.fecha), "yyyy-MMM-dd", { locale: es }).toUpperCase() : "N/A"}
            </div>
            <div style={{ fontSize: tapeSize === "24mm" ? "16px" : "12px" }}>
              Prox: {labelData.fechaSug || "N/A"}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: tapeSize === "24mm" ? "16px" : "12px", fontWeight: 'bold' }}>
                      Cert: {state.certificado || "Pendiente"}
                    </div>
                    <div style={{ fontSize: tapeSize === "24mm" ? "14px" : "10px" }}>
                      Tec: {labelData.calibro}
                    </div>
                </div>
                <div style={{ padding: '2px', backgroundColor: 'white' }}>
                    <QRCodeSVG 
                        value={`https://ag-app-two.vercel.app/?share=${state.certificado || 'PENDIENTE'}`} 
                        size={tapeSize === "24mm" ? 60 : 40} 
                        level="M" 
                    />
                </div>
            </div>

          </div>
        </div>
      </div>
      
    </div>
  );
};

export default WorkSheetScreen;