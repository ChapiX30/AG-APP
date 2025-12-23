import React, { useEffect, useRef, useState, useCallback, useReducer } from "react";
import { useNavigation } from "../hooks/useNavigation";
import {
  ArrowLeft,
  Save,
  X,
  Calendar,
  MapPin,
  Mail,
  Building2,
  Wrench,
  Tag,
  Hash,
  Loader2,
  NotebookPen,
  Edit3,
  Search,
  Calculator,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  Wifi,
  WifiOff,
  AlertOctagon,
  Printer // Icono para la impresora
} from "lucide-react";
import type { jsPDF } from "jspdf"; 
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { storage, db } from "../utils/firebase";
import { collection, addDoc, query, getDocs, where, doc, getDoc } from "firebase/firestore";
import masterCelestica from "../data/masterCelestica.json";
import masterTechops from "../data/masterTechops.json";
import {
  isBefore, 
  format, 
  addMonths, 
  addYears, 
  parseISO,
  // --- IMPORTS PARA SLA (Días Hábiles) ---
  addBusinessDays,
  isAfter,
  differenceInBusinessDays
} from "date-fns"; 
import { unit } from 'mathjs';

// ====================================================================
// 1. CONFIGURACIÓN Y UTILIDADES (Toast, Unidades, Tipos)
// ====================================================================

// Componente Toast (Notificación Flotante)
const ToastNotification: React.FC<{ message: string; type: 'success' | 'error' | 'warning'; onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000); 
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-orange-500';
  const icon = type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>;

  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl text-white ${bg} animate-in slide-in-from-bottom-5 duration-300`}>
      {icon}
      <span className="font-medium">{message}</span>
      <button onClick={onClose} className="ml-4 hover:bg-white/20 p-1 rounded"><X className="w-4 h-4"/></button>
    </div>
  );
};

// --- RANGOS DE METROLOGIA ---
const METROLOGY_LIMITS: Record<string, { tMin: number, tMax: number, hMin: number, hMax: number }> = {
  "Dimensional": { tMin: 18, tMax: 22, hMin: 35, hMax: 60 }, 
  "Electrica": { tMin: 18, tMax: 28, hMin: 20, hMax: 70 }, 
  "Masa": { tMin: 18, tMax: 27, hMin: 40, hMax: 60 }, 
  "Presión": { tMin: 15, tMax: 30, hMin: 20, hMax: 80 }, 
  "Temperatura": { tMin: 15, tMax: 30, hMin: 20, hMax: 80 },
  "Par Torsional": { tMin: 18, tMax: 28, hMin: 20, hMax: 75 }, 
  "Fuerza": { tMin: 18, tMax: 28, hMin: 30, hMax: 70 },
  "default": { tMin: 15, tMax: 30, hMin: 20, hMax: 80 }
};

const getMetrologyLimits = (magnitud: string) => {
  return METROLOGY_LIMITS[magnitud] || METROLOGY_LIMITS["default"];
};

type UnitDef = { label: string; value: string };
type Categories = Record<string, UnitDef[]>;

const UNIT_CATEGORIES: Categories = {
  "Par Torsional (Torque)": [
    { label: "Libra-fuerza pulgada (in·lbf)", value: "lbf inch" },
    { label: "Pie-libra fuerza (ft·lbf)", value: "lbf ft" },
    { label: "Newton metro (N·m)", value: "N m" },
    { label: "Kilogramo-fuerza metro (kgf·m)", value: "kgf m" },
    { label: "Kilogramo-fuerza cm (kgf·cm)", value: "kgf cm" },
    { label: "Onza-fuerza pulgada (ozf·in)", value: "ozf inch" }
  ],
  "Presión": [
    { label: "PSI (Libra/pulgada²)", value: "psi" },
    { label: "Bar", value: "bar" },
    { label: "Pascal (Pa)", value: "Pa" },
    { label: "Kilopascal (kPa)", value: "kPa" },
    { label: "Megapascal (MPa)", value: "MPa" },
    { label: "Atmósfera (atm)", value: "atm" },
    { label: "Milímetro de mercurio (mmHg)", value: "mmHg" },
    { label: "Pulgada de agua (inH2O)", value: "inH2O" }
  ],
  "Masa": [
    { label: "Kilogramo (kg)", value: "kg" },
    { label: "Gramo (g)", value: "g" },
    { label: "Miligramo (mg)", value: "mg" },
    { label: "Libra (lb)", value: "lb" },
    { label: "Onza (oz)", value: "oz" },
    { label: "Tonelada métrica (t)", value: "tonne" }
  ],
  "Longitud": [
    { label: "Metro (m)", value: "m" },
    { label: "Centímetro (cm)", value: "cm" },
    { label: "Milímetro (mm)", value: "mm" },
    { label: "Pulgada (in)", value: "inch" },
    { label: "Pie (ft)", value: "ft" },
    { label: "Yarda (yd)", value: "yd" },
    { label: "Milla (mi)", value: "mi" }
  ],
  "Temperatura": [
    { label: "Celsius (°C)", value: "degC" },
    { label: "Fahrenheit (°F)", value: "degF" },
    { label: "Kelvin (K)", value: "K" },
    { label: "Rankine (°R)", value: "degR" }
  ],
  "Volumen": [
    { label: "Litro (L)", value: "L" },
    { label: "Mililitro (mL)", value: "ml" },
    { label: "Metro cúbico (m³)", value: "m3" },
    { label: "Galón US (gal)", value: "gal" },
    { label: "Pie cúbico (ft³)", value: "ft3" },
    { label: "Pulgada cúbica (in³)", value: "in3" }
  ]
};

// ====================================================================
// 2. COMPONENTE MODAL DE CONVERTIDOR
// ====================================================================

const UnitConverterModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [category, setCategory] = useState<string>("Par Torsional (Torque)");
  const [amount, setAmount] = useState<string>("1");
  const [fromUnit, setFromUnit] = useState<string>(UNIT_CATEGORIES["Par Torsional (Torque)"][0].value);
  const [toUnit, setToUnit] = useState<string>(UNIT_CATEGORIES["Par Torsional (Torque)"][1].value);
  const [result, setResult] = useState<string>("");

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

  const handleSwap = () => {
    const temp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(temp);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[90vh]">
        <div className="bg-gray-900 text-white p-4 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-400" /> Convertidor de Unidades</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="mb-6">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Categoría</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.keys(UNIT_CATEGORIES).map((cat) => (
                <button key={cat} onClick={() => handleCategoryChange(cat)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all text-left truncate ${category === cat ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-gray-50 text-gray-900 border-gray-200 hover:bg-gray-100'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 bg-gray-50 p-6 rounded-xl border border-gray-200">
            <div className="w-full md:w-1/2 space-y-3">
              <label className="block text-sm font-bold text-gray-700">De:</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-3 text-lg font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm bg-white text-gray-900" placeholder="0" />
              <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                {UNIT_CATEGORIES[category]?.map((u) => (<option key={u.value} value={u.value} className="text-gray-900 bg-white">{u.label}</option>))}
              </select>
            </div>
            <div className="flex md:flex-col items-center justify-center gap-2 text-gray-400 shrink-0">
               <button onClick={handleSwap} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><ArrowRightLeft className="w-5 h-5 md:rotate-90 text-gray-600" /></button>
            </div>
            <div className="w-full md:w-1/2 space-y-3">
              <label className="block text-sm font-bold text-gray-700">A:</label>
              <div className="w-full p-3 text-lg font-mono font-bold bg-blue-50 text-blue-900 border border-blue-100 rounded-lg flex items-center min-h-[54px]">{result || "-"}</div>
              <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">
                {UNIT_CATEGORIES[category]?.map((u) => (<option key={u.value} value={u.value} className="text-gray-900 bg-white">{u.label}</option>))}
              </select>
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

type ClienteRecord = { id: string; nombre: string; }
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
  | { type: 'RESTORE_BACKUP'; payload: WorksheetState };

// ... Componente de Búsqueda de Cliente ...
interface ClienteSearchSelectProps {
    clientes: ClienteRecord[];
    onSelect: (cliente: string) => void;
    currentValue: string;
    hasError?: boolean;
}

const ClienteSearchSelect: React.FC<ClienteSearchSelectProps> = ({ clientes, onSelect, currentValue, hasError }) => {
    const [searchTerm, setSearchTerm] = useState(currentValue);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const filteredAndGroupedClientes = React.useMemo(() => {
        const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const grouped: Record<string, ClienteRecord[]> = {};
        const filtered = clientes.filter(cliente => cliente.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)).sort((a, b) => a.nombre.localeCompare(b.nombre));
        filtered.forEach(cliente => {
            const firstLetter = cliente.nombre.charAt(0).toUpperCase();
            if (!grouped[firstLetter]) grouped[firstLetter] = [];
            grouped[firstLetter].push(cliente);
        });
        return grouped;
    }, [clientes, searchTerm]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => { document.removeEventListener("mousedown", handleClickOutside); };
    }, []);

    useEffect(() => { setSearchTerm(currentValue); }, [currentValue]);

    const sortedLetters = Object.keys(filteredAndGroupedClientes).sort();

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="relative">
                <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} placeholder="Buscar o seleccionar cliente..."
                    className={`w-full p-4 border rounded-lg pr-10 focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${isOpen ? 'rounded-b-none border-b-0' : ''} ${hasError ? 'border-red-500 bg-red-50 focus:ring-red-500' : 'border-gray-200'}`} />
                <Search className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
            </div>
            {isOpen && (
                <div className="absolute z-20 w-full bg-white border border-gray-300 max-h-80 overflow-y-auto rounded-b-lg shadow-xl">
                    {sortedLetters.length > 0 ? (
                        sortedLetters.map(letter => (
                            <div key={letter}>
                                <div className="sticky top-0 bg-gray-100 px-3 py-2 text-sm font-bold text-blue-700 border-b border-gray-200 shadow-sm">{letter}</div>
                                <ul>
                                    {filteredAndGroupedClientes[letter].map(cliente => (
                                        <li key={cliente.id} className="px-4 py-3 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm truncate transition-colors duration-150" onClick={() => { setSearchTerm(cliente.nombre); onSelect(cliente.nombre); setIsOpen(false); }}>
                                            {cliente.nombre}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (<div className="p-4 text-gray-500 text-sm">No se encontraron clientes.</div>)}
                </div>
            )}
        </div>
    );
};

// ... Funciones Auxiliares (Fechas, PDFs, Mapeos) ...
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
  const m: Record<string, string> = { AGAC: "Acustica", AGD: "Dimensional", AGF: "Fuerza", AGP: "Presión", AGEL: "Electrica", AGT: "Temperatura", AGM: "Masa", AGVBT: "Vibracion", AGQ: "Quimica", AGOT: "Optica", AGFL: "Flujo", AGRD: "Reporte de Diagnostico", AGTI: "Tiempo", VE: "Velocidad", AGPT: "Par Torsional" };
  const parts = consecutivo.split("-");
  if (parts.length >= 2 && m[parts[1]]) return m[parts[1]];
  for (const [code, mag] of Object.entries(m)) { if (consecutivo.includes(code)) return mag; }
  return "";
};

// --- ORDEN ALFABÉTICO ---
const magnitudesDisponibles = [
  "Acustica", 
  "Dimensional", 
  "Electrica", 
  "Flujo", 
  "Frecuencia", 
  "Fuerza", 
  "Masa", 
  "Optica", 
  "Par Torsional", 
  "Presión", 
  "Quimica", 
  "Reporte de Diagnostico", 
  "Temperatura", 
  "Tiempo", 
  "Vacio", 
  "Velocidad", 
  "Vibracion"
];

const unidadesPorMagnitud: Record<string, any> = {
  Acustica: ["dB", "Hz", "Pa"], Dimensional: ["m", "cm", "mm", "in", "min", "°", "µm"], Fuerza: ["N", "kgf", "lbf"],
  Flujo: ["m3/h", "slpm", "lpm", "scfm", "cfh", "m3/pm", "gpm", "ccm", "SCMH", "SCFH"], Frecuencia: ["RPM", "Hz", "kHz", "MHz", "GHz", "rad/s"],
  Presión: ["kPa", "bar", "mBar", "psi", "InH2O", "MPa", "Pa", "mmH20"], Quimica: ["µS", "pH"],
  Electrica: { DC: ["mV", "V", "A", "µA", "mA", "Ω"], AC: ["mV", "V", "A", "µA", "mA", "Ω"], Otros: ["Hz", "kHz", "MHz", "°C", "°F"] },
  Temperatura: ["°C", "°F", "°K"], Optica: ["BRIX", "°"], Masa: ["g", "kg", "lb"], Tiempo: ["s", "min", "h"],
  "Reporte de Diagnostico": ["check"], Velocidad: ["m/s", "km/h"], Vacio: ["atm", "Psi", "mbar", "Torr", "mmHg", "micron", "inHg"],
  Vibracion: ["g", "rad/s"], "Par Torsional": ["N*m", "Lbf*ft", "kgf*cm", "Lbf*in", "c*N", "oz*in", "oz*ft"],
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

const generateTemplatePDF = (formData: WorksheetState, JsPDF: typeof jsPDF) => {
  // @ts-ignore
  const doc = new JsPDF({ orientation:"p", unit: "pt", format: "a4" });
  const marginLeft = 50; const marginRight = 550; const lineHeight = 18; let y = 50;
  
  doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0); doc.setFontSize(16); doc.setFont(undefined, "bold");
  doc.text("Equipos y Servicios Especializados AG", marginLeft, y); y += 20;

  doc.setFontSize(11); doc.setFont(undefined, "normal");
  doc.text(`Fecha: ${formData.fecha}`, marginRight - 100, y);
  doc.setFont(undefined, "bold"); doc.text(`Nombre: ${formData.nombre}`, marginRight - 100, y + 15); y += 35;

  doc.setDrawColor(160); doc.setLineWidth(0.5); doc.line(marginLeft, y, marginRight, y); y += 20;

  const infoPairs = [
    ["Lugar de Calibración", formData.lugarCalibracion], ["N.Certificado", formData.certificado],
    ["Fecha de Recepción", formData.fechaRecepcion], ["Cliente", formData.cliente],
    ["Equipo", formData.equipo], ["ID", formData.id], ["Marca", formData.marca], ["Modelo", formData.modelo],
    ["Número de Serie", formData.numeroSerie], ["Unidad", Array.isArray(formData.unidad) ? formData.unidad.join(', ') : formData.unidad],
    ["Alcance", formData.alcance], ["Resolucion", formData.resolucion], ["Frecuencia de Calibración", formData.frecuenciaCalibracion],
    ["Temp. Ambiente", `${formData.tempAmbiente} °C`], ["HR%", `${formData.humedadRelativa} %`],
  ];

  doc.setFontSize(11); const col2X = marginLeft + 150;
  infoPairs.forEach(([label, value]) => {
    doc.setFont(undefined, "bold"); doc.text(`${label}:`, marginLeft, y);
    doc.setFont(undefined, "normal"); doc.text(`${value || "-"}`, col2X, y); y += lineHeight;
  });
  y += 20;

  const tableTop = y; const tableWidth = 500; const colWidth = tableWidth / 2; const rowHeight = 24; const valueHeight = 60;
  const isMasa = formData.magnitud === "Masa";
  doc.setFillColor(230); doc.setDrawColor(180);
  
  if (isMasa) {
      doc.rect(marginLeft, tableTop, tableWidth, rowHeight, "FD");
      doc.setFont(undefined, "bold"); doc.text("Mediciones de Masa:", marginLeft + 5, tableTop + 16);
      y = tableTop + rowHeight + 10;
      const masaPairs = [ ["Excentricidad:", formData.excentricidad], ["Linealidad:", formData.linealidad], ["Repetibilidad:", formData.repetibilidad] ];
      masaPairs.forEach(([label, value]) => {
          doc.setFont(undefined, "bold"); doc.text(label, marginLeft, y);
          doc.setFont(undefined, "normal"); doc.text(value || "-", marginLeft + 150, y); y += lineHeight;
      });
      y += 30;
  } else {
      doc.rect(marginLeft, tableTop, colWidth, rowHeight, "FD"); doc.rect(marginLeft + colWidth, tableTop, colWidth, rowHeight, "FD");
      doc.setFont(undefined, "bold"); doc.text("Medición Patrón:", marginLeft + 5, tableTop + 16); doc.text("Medición Instrumento:", marginLeft + colWidth + 5, tableTop + 16);
      const valTop = tableTop + rowHeight;
      doc.setFont(undefined, "normal"); doc.rect(marginLeft, valTop, colWidth, valueHeight); doc.rect(marginLeft + colWidth, valTop, colWidth, valueHeight);
      doc.text(doc.splitTextToSize(formData.medicionPatron || "-", colWidth - 10), marginLeft + 5, valTop + 15);
      doc.text(doc.splitTextToSize(formData.medicionInstrumento || "-", colWidth - 10), marginLeft + colWidth + 5, valTop + 15);
      y = valTop + valueHeight + 30;
  }
  
  doc.setFont(undefined, "bold"); doc.setFontSize(12); doc.text("Notas:", marginLeft, y); y += lineHeight;
  doc.setFont(undefined, "normal"); doc.text(doc.splitTextToSize(formData.notas || "-", 500), marginLeft, y);
  doc.setFontSize(10); doc.setFont(undefined, "italic"); doc.text("AG-CAL-F39-00", marginLeft, 790);
  return doc;
};

// ... Reducer y Estado Inicial ...
const initialState: WorksheetState = {
  lugarCalibracion: "", frecuenciaCalibracion: "", fecha: getLocalISODate(), fechaRecepcion: "", certificado: "",
  nombre: "", cliente: "", id: "", equipo: "", marca: "", modelo: "", numeroSerie: "", magnitud: "", unidad: [],
  alcance: "", resolucion: "", medicionPatron: "", medicionInstrumento: "", excentricidad: "", linealidad: "",
  repetibilidad: "", notas: "", tempAmbiente: "", humedadRelativa: "", idBlocked: false, idErrorMessage: "",
  permitirExcepcion: false, isMasterData: false, fieldsLocked: false,
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
      return { ...state, isMasterData: false, fieldsLocked: false, equipo: (isCelestica && !state.id) ? "" : state.equipo, marca: (isCelestica && !state.id) ? "" : state.marca, modelo: (isCelestica && !state.id) ? "" : state.modelo, numeroSerie: (isCelestica && !state.id) ? "" : state.numeroSerie };
    case 'SET_ID_BLOCKED': return { ...state, idBlocked: true, idErrorMessage: action.message };
    case 'CLEAR_ID_BLOCK': return { ...state, idBlocked: false, idErrorMessage: "" };
    case 'SET_EXCEPCION': return { ...state, permitirExcepcion: action.payload };
    case 'RESTORE_BACKUP': return { ...action.payload };
    default: return state;
  }
}

// ====================================================================
// 4. COMPONENTE PRINCIPAL
// ====================================================================

export const WorkSheetScreen: React.FC = () => {
  const { currentConsecutive, goBack, currentUser, currentMagnitude } = useNavigation();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(worksheetReducer, initialState);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [listaClientes, setListaClientes] = useState<ClienteRecord[]>([]);
  const [tipoElectrica, setTipoElectrica] = useState<"DC" | "AC" | "Otros">("DC");
  const [showConverter, setShowConverter] = useState(false);
  
  // -- NUEVO: Estado de Conexión y Metrología --
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [metrologyWarning, setMetrologyWarning] = useState<string | null>(null);

  // Estado para UX y Validación
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'warning'} | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  // Monitor de conexión
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor de Normas de Metrología
  useEffect(() => {
      if(!state.magnitud || (!state.tempAmbiente && !state.humedadRelativa)) {
          setMetrologyWarning(null);
          return;
      }
      const limits = getMetrologyLimits(state.magnitud);
      const temp = Number(state.tempAmbiente);
      const hr = Number(state.humedadRelativa);
      let warning = "";

      if (state.tempAmbiente && (temp < limits.tMin || temp > limits.tMax)) {
          warning += `Temp fuera de rango (${limits.tMin}-${limits.tMax}°C). `;
      }
      if (state.humedadRelativa && (hr < limits.hMin || hr > limits.hMax)) {
          warning += `HR% fuera de rango (${limits.hMin}-${limits.hMax}%). `;
      }

      if (warning) {
          setMetrologyWarning(warning.trim());
      } else {
          setMetrologyWarning(null);
      }

  }, [state.tempAmbiente, state.humedadRelativa, state.magnitud]);

  // Handler especial para Inputs Dinámicos de Eléctrica
  const handleElectricalChange = (targetUnit: string, type: 'Patron' | 'Instrumento', value: string) => {
    const currentText = type === 'Patron' ? state.medicionPatron : state.medicionInstrumento;
    
    const lines = currentText.split('\n');
    const map: Record<string, string> = {};
    lines.forEach(line => {
        const parts = line.split(':');
        if(parts.length >= 2) {
            const k = parts[0].trim();
            const v = parts.slice(1).join(':').trim();
            if(k) map[k] = v;
        }
    });

    map[targetUnit] = value;

    const newText = state.unidad.map(u => {
        const val = map[u] || "";
        return `${u}: ${val}`;
    }).join('\n');

    dispatch({ type: 'SET_FIELD', field: type === 'Patron' ? 'medicionPatron' : 'medicionInstrumento', payload: newText });
  };
  
  // Helper para leer valor actual en modo electrico
  const getElectricalValue = (targetUnit: string, type: 'Patron' | 'Instrumento') => {
      const text = type === 'Patron' ? state.medicionPatron : state.medicionInstrumento;
      const lines = text.split('\n');
      for(const line of lines) {
          const parts = line.split(':');
          if(parts.length >= 2 && parts[0].trim() === targetUnit) {
              return parts.slice(1).join(':').trim();
          }
      }
      return "";
  };


  useEffect(() => {
    const backup = localStorage.getItem('backup_worksheet_data');
    if (backup) {
      try {
        const parsedBackup = JSON.parse(backup) as WorksheetState;
        if (window.confirm("Se encontró una hoja de trabajo no guardada. ¿Desea restaurarla?")) { dispatch({ type: 'RESTORE_BACKUP', payload: parsedBackup }); }
        localStorage.removeItem('backup_worksheet_data'); 
      } catch (e) { console.error("Error al restaurar respaldo", e); localStorage.removeItem('backup_worksheet_data'); }
    }
  }, []);

  const validarIdEnPeriodo = useCallback(async () => {
    if (state.permitirExcepcion) { dispatch({ type: 'CLEAR_ID_BLOCK' }); return; }
    dispatch({ type: 'CLEAR_ID_BLOCK' });
    const id = state.id?.trim(); const cliente = state.cliente;
    if (!id || !cliente) return;

    const q = query(collection(db, "hojasDeTrabajo"), where("id", "==", id), where("cliente", "==", cliente));
    const docs = await getDocs(q);
    if (docs.empty) return;

    let maxFecha: Date | null = null; let frecuenciaAnterior: string | undefined = undefined; let maxFechaString: string | undefined = undefined;
    docs.forEach(doc => {
      const data = doc.data(); const parts = data.fecha.split('-');
      const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (!isNaN(dateObj.getTime())) {
        if (!maxFecha || dateObj.getTime() > maxFecha.getTime()) { maxFecha = dateObj; frecuenciaAnterior = data.frecuenciaCalibracion; maxFechaString = data.fecha; }
      }
    });

    if (!maxFecha || !frecuenciaAnterior) return;
    const nextAllowed = calcularSiguienteFecha(maxFechaString!, frecuenciaAnterior);
    if (!nextAllowed) return;

    if (isBefore(new Date(), nextAllowed)) {
      dispatch({ type: 'SET_ID_BLOCKED', message: `⛔️ Este equipo fue calibrado el ${format(maxFecha, "dd/MM/yyyy")} (Frecuencia: ${frecuenciaAnterior}). Próxima calibración permitida: ${format(nextAllowed, "dd/MM/yyyy")}.` });
    }
  }, [state.id, state.cliente, state.permitirExcepcion]);

  useEffect(() => { validarIdEnPeriodo(); }, [validarIdEnPeriodo]);

  const cargarEmpresas = async () => {
    try {
      const qs = await getDocs(collection(db, "clientes"));
      setListaClientes(qs.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "Sin nombre" })));
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

  // ====================================================================
  // ETIQUETA EPSON 24mm (DISEÑO BASADO EN IMAGEN - TEXTO PURO)
  // ====================================================================
  const handlePrintLabel = async () => {
    if (!state.id || !state.fecha) {
      setToast({ message: "Falta ID o Fecha para imprimir.", type: "warning" });
      return;
    }

    try {
      const nextDate = calcularSiguienteFecha(state.fecha, state.frecuenciaCalibracion);
      const nextDateStr = nextDate ? format(nextDate, "dd/MM/yyyy") : "N/A";
      const fechaCalStr = state.fecha.split("-").reverse().join("/"); // dd/mm/yyyy

      const { jsPDF } = await import("jspdf");

      // Configuración del PDF (Tamaño Cinta Epson 24mm x 60mm)
      // @ts-ignore
      const doc = new jsPDF({
        orientation: "l", // Landscape
        unit: "mm",
        format: [60, 24] 
      });

      // --- DISEÑO ---

      // 1. TÍTULO / HEADER
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("CALIBRADO", 30, 4.5, { align: "center" });

      // Línea divisoria
      doc.setLineWidth(0.3);
      doc.line(2, 6, 58, 6);

      // 2. DATOS (Cuerpo)
      doc.setFontSize(8);

      // RENGLÓN 1: ID
      doc.setFont(undefined, "bold");
      doc.text("ID:", 3, 11);
      doc.setFont(undefined, "normal");
      doc.text(state.id, 16, 11);

      // RENGLÓN 2: FECHA
      doc.setFont(undefined, "bold");
      doc.text("Fecha:", 3, 16);
      doc.setFont(undefined, "normal");
      doc.text(fechaCalStr, 16, 16);

      // RENGLÓN 3: VENCE
      doc.setFont(undefined, "bold");
      doc.text("Vence:", 3, 21);
      doc.setFont(undefined, "bold"); // Vencimiento en negrita
      doc.text(nextDateStr, 16, 21);

      // 3. GENERAR
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');

    } catch (error) {
      console.error("Error generando etiqueta:", error);
      setToast({ message: "Error al generar etiqueta.", type: "error" });
    }
  };

  const handleSave = useCallback(async () => {
    // 1. Validar campos vacíos
    const errors: Record<string, boolean> = {};
    const requiredFields = ["lugarCalibracion", "certificado", "nombre", "cliente", "id", "equipo", "marca", "magnitud", "unidad"];
    let hasError = false;
    
    requiredFields.forEach(field => {
       const val = state[field as keyof WorksheetState];
       if (Array.isArray(val) ? val.length === 0 : !val || String(val).trim() === "") {
           errors[field] = true;
           hasError = true;
       }
    });

    if (hasError) {
        setValidationErrors(errors);
        setToast({ message: "Completa los campos en rojo para continuar.", type: 'error' });
        return;
    }
    setValidationErrors({});

    // 2. VALIDACIÓN BLINDADA DE FECHAS
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
                  const parts = data.fecha.split('-');
                  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                  if (!isNaN(dateObj.getTime())) {
                    if (!maxFecha || dateObj.getTime() > maxFecha.getTime()) { 
                        maxFecha = dateObj; 
                        frecuenciaAnterior = data.frecuenciaCalibracion; 
                    }
                  }
                });

                if (maxFecha && frecuenciaAnterior) {
                    const nextAllowed = calcularSiguienteFecha(format(maxFecha, "yyyy-MM-dd"), frecuenciaAnterior);
                    if (nextAllowed && isBefore(new Date(), nextAllowed)) {
                        setIsSaving(false);
                        setToast({ message: `⛔️ ERROR: Equipo calibrado recientemente (${format(maxFecha, "dd/MM/yyyy")}). No se puede guardar.`, type: 'error' });
                        dispatch({ type: 'SET_ID_BLOCKED', message: `⛔️ Bloqueado por sistema. Última: ${format(maxFecha, "dd/MM/yyyy")}` });
                        return; // <--- AQUÍ DETENEMOS EL GUARDADO
                    }
                }
            }
        } catch (err) {
            console.error("Error verificando fechas:", err);
        }
    }

    setIsSaving(true);
    try {
      if (!navigator.onLine) throw new Error("offline");

      const q = query(collection(db, "hojasDeTrabajo"), where("certificado", "==", state.certificado));
      if (!(await getDocs(q)).empty) {
         setIsSaving(false);
         setToast({ message: "El número de certificado ya existe.", type: 'error' });
         return;
      }

      const { jsPDF } = await import("jspdf");
      const pdfDoc = generateTemplatePDF(state, jsPDF as any); 
      const blob = pdfDoc.output("blob");
      const nombreArchivo = `worksheets/${getUserName(currentUser || user)}/${state.certificado}_${state.id || "SINID"}.pdf`;
      const pdfRef = ref(storage, nombreArchivo);

      await uploadBytes(pdfRef, blob);
      const pdfURL = await getDownloadURL(pdfRef);

      const fullData = { ...state, pdfURL, timestamp: Date.now(), userId: currentUser?.uid || user?.uid || "unknown" };
      
      await addDoc(collection(db, "hojasDeTrabajo"), fullData);

      setToast({ message: "Hoja de trabajo guardada correctamente.", type: 'success' });
      localStorage.removeItem('backup_worksheet_data');
      
      setTimeout(() => goBack(), 1500);

    } catch (e: any) {
      console.error("Error al guardar:", e);
      localStorage.setItem('backup_worksheet_data', JSON.stringify(state));
      let msg = "Error desconocido.";
      if (e.message === "offline" || e.code === "unavailable" || e.message.includes("network")) {
         msg = "Sin conexión. Se guardó una copia local. No cierres sesión.";
      } else {
         msg = `Error: ${e.message || e}`;
      }
      setToast({ message: msg, type: 'warning' });
    } finally {
      setIsSaving(false);
    }
  }, [state, currentUser, user, goBack]);

  const handleTogglePreview = useCallback(async () => {
    const newShow = !showPreview;
    setShowPreview(newShow);
    if (newShow) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      try {
        const { jsPDF } = await import("jspdf");
        setPreviewUrl(URL.createObjectURL(generateTemplatePDF(state, jsPDF as any).output("blob")));
      } catch (e) { console.error(e); setPreviewUrl(null); }
    } else if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    }
  }, [showPreview, previewUrl, state]);

  // ====================================================================
  // LÓGICA DE TIEMPO DE COMPROMISO (SLA)
  // ====================================================================
  const slaInfo = React.useMemo(() => {
    // Solo aplica si es Laboratorio y tenemos ambas fechas
    if (state.lugarCalibracion !== "Laboratorio" || !state.fechaRecepcion || !state.fecha) {
      return null;
    }

    const recepcion = parseISO(state.fechaRecepcion);
    const calibracion = parseISO(state.fecha);

    // Calculamos el límite (5 días hábiles)
    // Nota: addBusinessDays salta sábados y domingos automáticamente
    const fechaLimite = addBusinessDays(recepcion, 5);
    
    // Verificamos si la fecha seleccionada es posterior al límite
    const esTardio = isAfter(calibracion, fechaLimite);
    
    // Días de diferencia (solo hábiles) para mostrar en el mensaje
    const diasHabiliesTomados = differenceInBusinessDays(calibracion, recepcion);

    return {
      esTardio,
      fechaLimiteStr: format(fechaLimite, "dd/MM/yyyy"),
      diasTomados: diasHabiliesTomados
    };
  }, [state.lugarCalibracion, state.fechaRecepcion, state.fecha]);

  const inputClass = (fieldName: string) => `w-full p-4 border rounded-lg transition-all focus:ring-2 focus:ring-blue-500 ${validationErrors[fieldName] ? "border-red-500 bg-red-50 focus:ring-red-500" : "border-gray-200"}`;

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
                  Hoja de Trabajo 
                  <div className={`w-3 h-3 rounded-full shadow-md ${isOnline ? 'bg-green-400' : 'bg-orange-400 animate-pulse'}`} title={isOnline ? "Online" : "Offline - Guardando Localmente"}></div>
                </h1>
                <p className="text-blue-100 text-sm flex items-center gap-2">
                  Consecutivo: {state.certificado || "SIN CERTIFICADO"}
                  {!isOnline && <span className="text-xs bg-orange-500/80 px-2 py-0.5 rounded text-white flex items-center gap-1"><WifiOff className="w-3 h-3"/> Offline</span>}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowConverter(true)} className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-all bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105 active:scale-95">
              <Calculator className="w-4 h-4" /><span className="text-sm font-medium hidden sm:inline">Convertidor</span>
            </button>
            
            {/* BOTÓN ETIQUETA EPSON */}
            <button 
              onClick={handlePrintLabel} 
              className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all active:scale-95"
              title="Imprimir Etiqueta Epson"
            >
              <Printer className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Etiqueta</span>
            </button>

            <button onClick={handleTogglePreview} className="px-4 py-2 text-white hover:bg-white/10 rounded-lg flex items-center space-x-2">
              <Edit3 className="w-4 h-4" /><span className="hidden sm:inline">{showPreview ? "Ocultar" : "Vista"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className={`grid gap-8 ${showPreview ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-4xl mx-auto"}`}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Información de Calibración</h2>
              <p className="text-gray-600 mt-1">Complete los datos. Los cambios se reflejarán automáticamente en Friday.</p>
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
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={state.fechaRecepcion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fechaRecepcion', payload: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Calendar className="w-4 h-4 text-green-500" /><span>Frecuencia*</span></label>
                  <select value={state.frecuenciaCalibracion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'frecuenciaCalibracion', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="">Seleccionar...</option><option value="3 meses">3 meses</option><option value="6 meses">6 meses</option><option value="1 año">1 año</option><option value="2 años">2 años</option><option value="3 años">3 años</option>
                  </select>
                </div>
                
                {/* --- CAMPO DE FECHA CON VALIDACION SLA INTEGRADA --- */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Calendar className="w-4 h-4 text-blue-500" /><span>Fecha*</span></label>
                  <input type="date" value={state.fecha} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fecha', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                  
                  {/* Validación visual de Tiempo Compromiso */}
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
                  <input type="text" value={state.id} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'id', payload: e.target.value }); if(validationErrors.id) setValidationErrors({...validationErrors, id: false}); }} onBlur={handleIdBlur} className={`w-full p-4 border-2 rounded-lg transition-all ${state.idBlocked && !state.permitirExcepcion ? "border-red-500 bg-red-50 text-red-700" : (validationErrors.id ? "border-red-500 bg-red-50" : "border-gray-200 focus:ring-blue-500")}`} placeholder="ID" />
                  {state.idBlocked && !state.permitirExcepcion && <p className="mt-2 text-sm font-medium text-red-600 animate-pulse">{state.idErrorMessage}</p>}
                  <div className="mt-3"><label className="flex items-center gap-2"><input type="checkbox" checked={state.permitirExcepcion} onChange={(e) => dispatch({ type: 'SET_EXCEPCION', payload: e.target.checked })} className="rounded text-blue-600" disabled={!state.idBlocked} /><span className={`text-sm ${state.idBlocked ? 'text-red-700 font-bold' : 'text-gray-500'}`}>Permitir excepción</span></label></div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Wrench className="w-4 h-4 text-yellow-500" /><span>Equipo*</span></label><input type="text" value={state.equipo} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'equipo', payload: e.target.value }); if(validationErrors.equipo) setValidationErrors({...validationErrors, equipo: false}); }} readOnly={state.fieldsLocked} className={inputClass('equipo')} /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Tag className="w-4 h-4 text-pink-500" /><span>Marca*</span></label><input type="text" value={state.marca} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'marca', payload: e.target.value }); if(validationErrors.marca) setValidationErrors({...validationErrors, marca: false}); }} readOnly={state.fieldsLocked} className={inputClass('marca')} /></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-teal-500" /><span>Modelo</span></label><input type="text" value={state.modelo} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'modelo', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-purple-500" /><span>Nº Serie</span></label><input type="text" value={state.numeroSerie} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'numeroSerie', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
              </div>

              {/* --- BLOQUE DE MAGNITUD Y UNIDAD --- */}
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

              <div><label className="block text-sm font-medium text-gray-700 mb-3">Alcance</label><input type="text" className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" value={state.alcance} onChange={e => dispatch({ type: 'SET_FIELD', field: 'alcance', payload: e.target.value })} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-3">Resolución</label><input type="text" className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" value={state.resolucion} onChange={e => dispatch({ type: 'SET_FIELD', field: 'resolucion', payload: e.target.value })} /></div>
              
              {state.magnitud === "Masa" ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-purple-400" /><span>Excentricidad</span></label><input type="text" value={state.excentricidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'excentricidad', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                    <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-pink-400" /><span>Linealidad</span></label><input type="text" value={state.linealidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'linealidad', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                  </div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-orange-400" /><span>Repetibilidad</span></label><input type="text" value={state.repetibilidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'repetibilidad', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                </>
              ) : state.magnitud === "Electrica" && state.unidad.length > 0 ? (
                // --- COLUMNAS DINÁMICAS PARA ELECTRICA ---
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><Calculator className="w-4 h-4 text-blue-500"/> Mediciones por Unidad Eléctrica</h3>
                  <div className="grid grid-cols-12 gap-4 mb-2 px-2 text-xs font-bold text-gray-500 uppercase">
                      <div className="col-span-2">Unidad</div>
                      <div className="col-span-5">Medición Patrón</div>
                      <div className="col-span-5">Medición Instrumento</div>
                  </div>
                  {state.unidad.map((u) => (
                      <div key={u} className="grid grid-cols-12 gap-4 mb-3 items-center">
                          <div className="col-span-2 text-sm font-bold text-blue-800 bg-blue-100 py-2 px-3 rounded-lg flex items-center justify-center">{u}</div>
                          <div className="col-span-5">
                              <input type="text" 
                                placeholder="Valor Patrón"
                                value={getElectricalValue(u, 'Patron')}
                                onChange={(e) => handleElectricalChange(u, 'Patron', e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                              />
                          </div>
                          <div className="col-span-5">
                              <input type="text" 
                                placeholder="Valor Instrumento"
                                value={getElectricalValue(u, 'Instrumento')}
                                onChange={(e) => handleElectricalChange(u, 'Instrumento', e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                              />
                          </div>
                      </div>
                  ))}
                  <div className="text-xs text-gray-400 mt-2 text-center italic">* Los valores se guardan automáticamente combinados para el reporte.</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-teal-400" /><span>Medición Patrón</span></label><textarea value={state.medicionPatron} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: e.target.value })} rows={4} className="w-full p-2 border rounded resize-none overflow-y-auto max-h-40 focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-blue-400" /><span>Medición Instrumento</span></label><textarea value={state.medicionInstrumento} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: e.target.value })} rows={4} className="w-full p-2 border rounded resize-none overflow-y-auto max-h-40 focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                </div>
              )}
              
              <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-gray-400" /><span>Notas</span></label><textarea value={state.notas} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'notas', payload: e.target.value })} className="w-full p-4 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 border-gray-200" rows={2} /></div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-sky-400" /><span>Temp. Ambiente (°C)</span></label><input type="number" value={state.tempAmbiente} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'tempAmbiente', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-pink-400" /><span>HR%</span></label><input type="number" value={state.humedadRelativa} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'humedadRelativa', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-gray-200" /></div>
                
                {/* WARNING DE METROLOGIA (SIN NOMBRE DE NORMA) */}
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
            {showPreview && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden h-full min-h-[1000px]">
                <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-4 border-b border-gray-200"><h2 className="text-lg font-bold text-gray-900">Vista Previa del PDF Real</h2></div>
                <div className="h-full w-full">{previewUrl ? <iframe src={previewUrl} width="100%" className="h-full min-h-[900px]" style={{ border: 'none' }} title="Vista Previa PDF" /> : <div className="p-8 flex items-center justify-center h-[900px]"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><span className="ml-3 text-gray-700">Generando vista previa...</span></div>}</div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-200 mt-8 rounded-lg">
          <div className="flex justify-end space-x-4">
            <button onClick={() => goBack()} className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all flex items-center space-x-2" disabled={isSaving}><X className="w-4 h-4" /><span>Cancelar</span></button>
            <button onClick={handleSave} disabled={isSaving || (state.idBlocked && !state.permitirExcepcion)} className={`px-6 py-3 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-all flex items-center space-x-2 shadow-lg ${isSaving || (state.idBlocked && !state.permitirExcepcion) ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-700'}`}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span>{isSaving ? "Guardando..." : "Guardar"}</span></button>
          </div>
        </div>
      </div>

      {showConverter && <UnitConverterModal onClose={() => setShowConverter(false)} />}
      
    </div>
  );
};

export default WorkSheetScreen;