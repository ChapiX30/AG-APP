/**
 * Hoja de trabajo — calibración y guardado (Drive / Friday / hoja de servicio).
 */
import React, { useEffect, useRef, useState, useCallback, useReducer, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigation } from "../hooks/useNavigation";
import {
  Save, X, Calendar, MapPin, Mail, Building2, Wrench, Tag, Hash,
  Loader2, NotebookPen, Search, Calculator, ArrowRightLeft, AlertTriangle,
  CheckCircle2, WifiOff, AlertOctagon, FileText, Info, Scale,
  Camera, ShieldCheck, ShieldAlert, CloudOff, CloudUpload, CheckSquare, XCircle, Upload, ChevronDown
} from "lucide-react";
import type { jsPDF } from "jspdf"; 
import { useAuth } from "../hooks/useAuth";
import { useAppDialog } from "../hooks/useAppDialog";
import { db } from "../utils/firebase";
import { collection, addDoc, query, getDocs, where, doc, getDoc, updateDoc } from "firebase/firestore";
import masterCelestica from "../data/masterCelestica.json";
import masterTechops from "../data/masterTechops.json";
import { isBefore, format, addYears, parseISO, addBusinessDays, isAfter, differenceInBusinessDays, isValid } from "date-fns"; 
import { es } from 'date-fns/locale'; 
import { unit } from 'mathjs';
import logoAg from '../assets/lab_logo.png'; 
import ToastNotification from "./ToastNotification"; 
import { QRCodeSVG } from 'qrcode.react';
import {
  LabelPrinterButton,
  calcularSiguienteFecha,
  formatLabelDate,
  formatTechnicianInitials,
  type LabelData,
  type LabelDateFormat,
} from "./LabelPrinterButton";
import { extractMagnitudFromConsecutivo, toWorksheetMagnitud, WORKSHEET_MAGNITUDES } from "../utils/magnitudWorksheet";
import {
  buildElectricalMeasurementTexts,
  canalesDeUnidad,
  listElectricalSections,
  MAX_CANALES_ELECTRICOS,
  normalizeCanalesPorUnidad,
  normalizeNumCanales,
  parseElectricalValuesFromText,
  type CanalesPorUnidad,
} from "../utils/electricalChannels";
import {
  saveWorksheetDraft,
  loadWorksheetDraft,
  clearWorksheetDraft,
} from "../utils/worksheetDraftAutosave";
import { getTechnicianFolderName } from "../utils/worksheetPdfGenerator";
import { unidadesPorMagnitud } from "../utils/worksheetUnits";
import { addPendingSave, removePendingSave, markPendingSaveInFlight, clearPendingSaveInFlight } from "../utils/worksheetPendingSaves";
import { persistWorksheetJob, persistWorksheetToOfflineQueue } from "../utils/worksheetPersist";
import { processWorksheetOfflineQueue } from "../utils/worksheetSaveProcessor";
import { getTotalWorksheetQueueCount } from "../utils/worksheetQueueRunner";
import {
  dispatchWorksheetQueueSync,
  dispatchWorksheetSaveComplete,
} from "../utils/worksheetEvents";
import { canSaveDirectlyToFirebase } from "../utils/firebaseConnectivity";
import { isRetriableNetworkError } from "../utils/worksheetOfflineQueue";
import type { WorksheetState, BackgroundSaveJob } from "../types/worksheet";
import { FlowScreenHeader } from "./worksheet-flow/FlowScreenHeader";
import { FlowCard, FlowSection } from "./worksheet-flow/FlowCard";
import { MedicionPuntosTable } from "./worksheet-flow/MedicionPuntosTable";
import { accentFromMagnitude } from "./worksheet-flow/flowTheme";
import {
  getHoyFechaLocal,
  pickClienteFromAsignacionHoy,
} from "../utils/servicioAutomation";
import { canonicalizeClienteNombre } from "../utils/hojaServicioMatch";
import { tocarConsecutivoActivo, assertCertificadoLibreParaEquipo } from "../utils/firebaseConsecutivos";
import {
  countNumericLines,
  envRangeStatus,
  puntosMedicionAviso,
} from "../utils/worksheetWarnings";

// ====================================================================
// LabelPrinterButton y helpers de etiqueta: ver ./LabelPrinterButton

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
        { value: "kgf*cm", label: "kgf·cm (Kilogramo fuerza cm)" },
        { value: "kgf*m", label: "kgf·m (Kilogramo fuerza metro)" },
        { value: "oz*in", label: "oz·in (Onza fuerza pulgada)" },
    ],
    "Presión": [
        { value: "psi", label: "PSI" },
        { value: "bar", label: "Bar" },
        { value: "kPa", label: "kPa" },
        { value: "MPa", label: "MPa" },
        { value: "Pa", label: "Pascal" },
        { value: "mmHg", label: "mmHg" },
        { value: "atm", label: "atm" },
    ],
    "Longitud": [
        { value: "mm", label: "Milímetros" },
        { value: "cm", label: "Centímetros" },
        { value: "m", label: "Metros" },
        { value: "in", label: "Pulgadas" },
        { value: "ft", label: "Pies" },
        { value: "um", label: "Micrómetros (µm)" },
    ],
    "Masa": [
        { value: "mg", label: "Miligramos" },
        { value: "g", label: "Gramos" },
        { value: "kg", label: "Kilogramos" },
        { value: "lb", label: "Libras" },
        { value: "oz", label: "Onzas" },
        { value: "tonne", label: "Toneladas métricas" },
    ],
    "Fuerza": [
        { value: "N", label: "Newton (N)" },
        { value: "kN", label: "Kilonewton (kN)" },
        { value: "lbf", label: "Libra fuerza (lbf)" },
        { value: "kgf", label: "Kilogramo fuerza (kgf)" },
        { value: "poundforce", label: "Pound-force" },
    ],
    "Temperatura": [
        { value: "degC", label: "°C (Celsius)" },
        { value: "degF", label: "°F (Fahrenheit)" },
        { value: "K", label: "Kelvin (K)" },
    ],
    "Volumen": [
        { value: "mL", label: "Mililitros" },
        { value: "L", label: "Litros" },
        { value: "cm^3", label: "Centímetros cúbicos" },
        { value: "m^3", label: "Metros cúbicos" },
        { value: "gal", label: "Galones (US)" },
        { value: "in^3", label: "Pulgadas cúbicas" },
    ],
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

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[90vh] [color-scheme:light]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Convertidor de unidades"
      >
        <div className="bg-gray-900 text-white p-3 sm:p-4 flex justify-between items-center shrink-0 gap-3">
          <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 min-w-0">
            <Calculator className="w-5 h-5 text-blue-400 shrink-0" />
            <span className="truncate">Convertidor</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2.5 -mr-1 rounded-xl hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all touch-manipulation"
            aria-label="Cerrar convertidor"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain">
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.keys(UNIT_CATEGORIES).map((cat) => (
                <button type="button" key={cat} onClick={() => handleCategoryChange(cat)} className={`px-3 py-2 text-xs sm:text-sm rounded-lg border transition-all text-left truncate touch-manipulation ${category === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-900 border-gray-200 hover:border-blue-300'}`}>{cat}</button>
              ))}
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 bg-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200">
            <div className="w-full md:w-1/2 space-y-3">
              <label className="block text-sm font-bold text-gray-700">De:</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-3 text-lg font-mono border border-gray-300 rounded-lg bg-white text-gray-900 caret-gray-900 [color-scheme:light]" placeholder="0" />
              <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 [color-scheme:light]">{UNIT_CATEGORIES[category]?.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}</select>
            </div>
            <div className="flex md:flex-col items-center justify-center gap-2 text-gray-400 shrink-0"><button type="button" onClick={handleSwap} className="p-2 hover:bg-gray-200 rounded-full touch-manipulation"><ArrowRightLeft className="w-5 h-5" /></button></div>
            <div className="w-full md:w-1/2 space-y-3">
              <label className="block text-sm font-bold text-gray-700">A:</label>
              <div className="w-full p-3 text-lg font-mono font-bold bg-blue-50 text-blue-900 border border-blue-100 rounded-lg flex items-center min-h-[54px]">{result || "-"}</div>
              <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 [color-scheme:light]">{UNIT_CATEGORIES[category]?.map((u) => (<option key={u.value} value={u.value}>{u.label}</option>))}</select>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ====================================================================
// 3. TIPOS Y LÓGICA DE NEGOCIO
// ====================================================================

type ClienteRecord = {
  id: string;
  nombre: string;
  requerimientos?: string;
  formatoFechaEtiqueta?: LabelDateFormat;
};
type MasterRecord = { A: string; B: string; C: string; D: string; E: string; };

type WorksheetAction =
  | { type: 'SET_FIELD'; field: keyof WorksheetState; payload: string | string[] | number | boolean | Record<string, number> }
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
// BACKGROUND SAVE QUEUE (serializa guardados sin bloquear UI)
// ====================================================================
type BgSaveToastFn = (t: { message: string; type: "success" | "error" | "warning" }) => void;

let bgSaveQueue: BackgroundSaveJob[] = [];
let bgSaveRunning = false;
let bgSaveToast: BgSaveToastFn | null = null;

const enqueueBackgroundSave = (job: BackgroundSaveJob, onToast: BgSaveToastFn) => {
  addPendingSave({
    id: job.id,
    timestamp: Date.now(),
    state: job.state as unknown as Record<string, unknown>,
    electricalValues: job.electricalValues,
    localExc: job.localExc,
    user: job.user,
    worksheetId: job.worksheetId,
    magnitudConsecutivo: job.magnitudConsecutivo,
  });
  markPendingSaveInFlight(job.id);
  bgSaveToast = onToast;
  bgSaveQueue.push(job);
  void drainBackgroundSaveQueue();
};

async function drainBackgroundSaveQueue() {
  if (bgSaveRunning) return;
  bgSaveRunning = true;
  while (bgSaveQueue.length > 0) {
    const job = bgSaveQueue.shift()!;
    const cert = job.state.certificado || "";
    try {
      await persistWorksheetJob(job);
      removePendingSave(job.id);
      clearWorksheetDraft();
      localStorage.removeItem("backup_worksheet_data");
      bgSaveToast?.({ message: "✅ Hoja de trabajo guardada correctamente.", type: "success" });
      dispatchWorksheetSaveComplete({
        certificado: cert,
        success: true,
        message: `Hoja ${cert} guardada correctamente.`,
      });
      dispatchWorksheetQueueSync({
        pendingCount: getTotalWorksheetQueueCount(),
        uploaded: 1,
        certificado: cert,
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "OFFLINE_QUEUED") {
        removePendingSave(job.id);
        clearWorksheetDraft();
        bgSaveToast?.({
          message: "Guardado en cola offline. Se subirá al reconectar.",
          type: "warning",
        });
        dispatchWorksheetSaveComplete({
          certificado: cert,
          success: true,
          queuedOffline: true,
          message: `Hoja ${cert} en cola offline.`,
        });
        dispatchWorksheetQueueSync({
          pendingCount: getTotalWorksheetQueueCount(),
          uploaded: 0,
          certificado: cert,
        });
        continue;
      }
      console.error("Error guardado en segundo plano:", e);
      clearPendingSaveInFlight(job.id);
      localStorage.setItem("backup_worksheet_data", JSON.stringify(job.state));
      saveWorksheetDraft(job.state as unknown as Record<string, unknown>);
      const conflictMsg =
        e instanceof Error && e.message.startsWith("CERT_EN_USO:")
          ? e.message.replace(/^CERT_EN_USO:\s*/, "")
          : null;
      bgSaveToast?.({
        message: conflictMsg
          ? `⚠️ ${conflictMsg}`
          : "Error al guardar. Se conservó borrador y respaldo local.",
        type: "warning",
      });
      dispatchWorksheetSaveComplete({
        certificado: cert,
        success: false,
        message: conflictMsg || `Error al guardar ${cert}. Revisa borrador local.`,
      });
    }
  }
  bgSaveRunning = false;
}

/** Guarda en cola local en segundo plano y regresa de inmediato a la pantalla anterior. */
function scheduleOfflineSaveAndGoBack(
  job: BackgroundSaveJob,
  goBack: () => void,
  onPendingCount: (n: number) => void
) {
  addPendingSave({
    id: job.id,
    timestamp: Date.now(),
    state: job.state as unknown as Record<string, unknown>,
    electricalValues: job.electricalValues,
    localExc: job.localExc,
    user: job.user,
    worksheetId: job.worksheetId,
    magnitudConsecutivo: job.magnitudConsecutivo,
  });
  markPendingSaveInFlight(job.id);

  const cert = job.state.certificado || "";
  dispatchWorksheetSaveComplete({
    certificado: cert,
    success: true,
    queuedOffline: true,
    message: `Hoja ${cert} guardada localmente. Puedes seguir calibrando.`,
  });
  dispatchWorksheetQueueSync({
    pendingCount: getTotalWorksheetQueueCount(),
    uploaded: 0,
    certificado: cert,
  });
  onPendingCount(getTotalWorksheetQueueCount());
  goBack();

  void (async () => {
    try {
      await persistWorksheetToOfflineQueue(job);
      removePendingSave(job.id);
      clearWorksheetDraft();
      localStorage.removeItem("backup_worksheet_data");
      dispatchWorksheetQueueSync({
        pendingCount: getTotalWorksheetQueueCount(),
        uploaded: 0,
        certificado: cert,
      });
    } catch (e) {
      console.error("Guardado offline en segundo plano:", e);
      clearPendingSaveInFlight(job.id);
      saveWorksheetDraft(job.state as unknown as Record<string, unknown>);
    }
  })();
}

// ====================================================================
// COMPONENTE SEARCH SELECT 
// ====================================================================

interface ClienteSearchSelectProps {
    clientes: ClienteRecord[];
    onSelect: (cliente: string) => void;
    currentValue: string;
    hasError?: boolean;
    onBlurDraft?: () => void;
}

const ClienteSearchSelect: React.FC<ClienteSearchSelectProps> = ({ clientes, onSelect, currentValue, hasError, onBlurDraft }) => {
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
                    onBlur={() => onBlurDraft?.()}
                    placeholder="Buscar o seleccionar cliente..."
                    className={`w-full p-4 border rounded-lg pr-12 outline-none transition-all duration-200 bg-white text-gray-900 font-semibold shadow-inner ${
                        isOpen 
                            ? 'rounded-b-none border-b-0 shadow-lg border-blue-400 ring-1 ring-blue-400' 
                            : 'focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    } ${hasError ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} 
                />
                
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
                                            className="px-5 py-3 cursor-pointer hover:bg-blue-50 text-gray-700 hover:text-blue-900 text-sm break-words whitespace-normal transition-colors duration-150 font-medium border-b border-gray-50 last:border-0" 
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

const parseWorksheetDate = (fecha: string): Date => {
    if (!fecha) return new Date(NaN);
    const iso = parseISO(fecha);
    if (isValid(iso)) return iso;
    const parts = fecha.split("-");
    if (parts.length === 3) {
        const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(dateObj.getTime())) return dateObj;
    }
    return new Date(NaN);
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


/** Date input con ícono visible (el nativo a veces no se ve). */
const WorksheetDateInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
}> = ({ value, onChange, className = "", hasError = false }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      /* algunos navegadores bloquean showPicker fuera de gesto directo */
    }
    el.focus();
    el.click();
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full pr-12 text-gray-900 font-semibold bg-white shadow-inner focus:ring-2 focus:ring-blue-500 outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 ${
          hasError ? "border-red-500 bg-red-50" : ""
        } ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        title="Abrir calendario"
        aria-label="Abrir calendario"
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 active:scale-95 transition-all pointer-events-auto"
      >
        <Calendar className="w-5 h-5" />
      </button>
    </div>
  );
};

// Quitamos la inicialización de la fecha aquí
const initialState: WorksheetState = {
  lugarCalibracion: "", frecuenciaCalibracion: "", fecha: "", fechaRecepcion: "", certificado: "",
  nombre: "", cliente: "", id: "", equipo: "", marca: "", modelo: "", numeroSerie: "", magnitud: "", unidad: [],
  canalesPorUnidad: {},
  alcance: "", resolucion: "", medicionPatron: "", medicionInstrumento: "", excentricidad: "", linealidad: "",
  repetibilidad: "", notas: "", tempAmbiente: "", humedadRelativa: "", idBlocked: false, idErrorMessage: "",
  permitirExcepcion: false, isMasterData: false, fieldsLocked: false,
  condicionEquipo: "", descripcionDano: "", fotoEquipoBase64: "", fotoEquipoURL: "",
};

// Función para inicializar el estado incluyendo la fecha actual si no existe
const initWorksheet = (initial: WorksheetState): WorksheetState => {
  const legacy = (initial as WorksheetState & { numCanales?: number }).numCanales;
  return {
    ...initial,
    fecha: initial.fecha || getLocalISODate(),
    canalesPorUnidad: normalizeCanalesPorUnidad(
      initial.unidad || [],
      initial.canalesPorUnidad,
      legacy
    ),
  };
};

function worksheetReducer(state: WorksheetState, action: WorksheetAction): WorksheetState {
  switch (action.type) {
    case 'SET_FIELD': return { ...state, [action.field]: action.payload };
    case 'SET_USER_NAME': return { ...state, nombre: action.payload };
    case 'SET_CONSECUTIVE': {
      const nextMag = toWorksheetMagnitud(action.magnitud);
      const magnitud = nextMag || state.magnitud;
      return {
        ...state,
        certificado: action.consecutive,
        magnitud,
        ...(nextMag && nextMag !== state.magnitud
          ? { unidad: [], canalesPorUnidad: {} }
          : {}),
      };
    }
    case 'SET_MAGNITUD': {
      const nextMag = toWorksheetMagnitud(action.payload);
      if (!nextMag || nextMag === state.magnitud) return state;
      return {
        ...state,
        magnitud: nextMag,
        unidad: [],
        canalesPorUnidad: {},
      };
    }
    case 'SET_CLIENTE':
      const cel = (action.payload || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("celestica");
      return { ...state, cliente: action.payload, id: cel ? "EP-" : "", equipo: "", marca: "", modelo: "", numeroSerie: "", fieldsLocked: false };
    case 'AUTOCOMPLETE_SUCCESS': {
      const payload = action.payload;
      // Verificamos si alguno de los campos clave viene vacío
      const faltaInfo = !payload.equipo || !payload.marca || !payload.modelo || !payload.numeroSerie;
      return { 
        ...state, 
        ...payload, 
        isMasterData: true, 
        // Si falta información, fieldsLocked será false para permitir edición manual
        fieldsLocked: !faltaInfo 
      };
    }
    case 'AUTOCOMPLETE_FAIL':
      const isCelestica = state.cliente.toLowerCase().includes("celestica");
      return { ...state, isMasterData: false, fieldsLocked: false, equipo: (isCelestica && !state.id) ? "" : state.equipo, marca: (isCelestica && !state.id) ? "" : state.marca, modelo: (isCelestica && !state.id) ? "" : state.modelo };
    case 'SET_ID_BLOCKED': return { ...state, idBlocked: true, idErrorMessage: action.message };
    case 'CLEAR_ID_BLOCK': return { ...state, idBlocked: false, idErrorMessage: "" };
    case 'SET_EXCEPCION': return { ...state, permitirExcepcion: action.payload };
    case 'RESTORE_BACKUP': {
      const payload = action.payload;
      const legacy = (payload as WorksheetState & { numCanales?: number }).numCanales;
      return {
        ...payload,
        magnitud: toWorksheetMagnitud(payload.magnitud || ""),
        canalesPorUnidad: normalizeCanalesPorUnidad(
          payload.unidad || [],
          payload.canalesPorUnidad,
          legacy
        ),
      };
    }
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
  const { currentConsecutive, goBack, selectedMagnitude } = useNavigation();
  const { user } = useAuth();
  const { confirm } = useAppDialog();
  
  // Usamos el initWorksheet
  const [state, dispatch] = useReducer(worksheetReducer, initialState, initWorksheet);
  
  const [isSaving, setIsSaving] = useState(false);
  const lastDraftSaveRef = useRef(0);
  const draftRestoredRef = useRef(false);
  const clientePrefillDoneRef = useRef(false);
  const clienteRef = useRef(state.cliente);
  clienteRef.current = state.cliente;
  const [draftHydrationDone, setDraftHydrationDone] = useState(Boolean(worksheetId));
  const DRAFT_AUTOSAVE_MS = 45000;
  const [listaClientes, setListaClientes] = useState<ClienteRecord[]>([]);
  const [tipoElectrica, setTipoElectrica] = useState<"DC" | "AC" | "Otros">("DC");
  const [showConverter, setShowConverter] = useState(false);
  
  const hiddenLabelRef = useRef<HTMLDivElement>(null);
  const [tapeSize, setTapeSize] = useState<"24mm" | "12mm">("24mm");
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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
      setPendingUploads(getTotalWorksheetQueueCount());
    };

    const runQueue = async () => {
      if (processingQueueRef.current || !(await canSaveDirectlyToFirebase())) return;
      processingQueueRef.current = true;
      try {
        const result = await processWorksheetOfflineQueue(user);
        updatePendingCount();
        if (result.uploaded > 0) {
          setToast({
            message: `☁️ ${result.uploaded} hoja${result.uploaded > 1 ? "s" : ""} subida${result.uploaded > 1 ? "s" : ""} correctamente.`,
            type: "success",
          });
        }
      } finally {
        processingQueueRef.current = false;
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(runQueue, 1500);
    };
    const handleOffline = () => setIsOnline(false);
    const handleQueueSync = () => updatePendingCount();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("ag-worksheet-queue-sync", handleQueueSync);

    updatePendingCount();
    void canSaveDirectlyToFirebase().then((ok) => {
      if (ok) setTimeout(runQueue, 2000);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("ag-worksheet-queue-sync", handleQueueSync);
    };
  }, [user]);

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
      const canales = normalizeCanalesPorUnidad(
        state.unidad,
        state.canalesPorUnidad
      );
      setElectricalValues(
        parseElectricalValuesFromText(
          state.unidad,
          canales,
          state.medicionPatron,
          state.medicionInstrumento
        )
      );
    }
    // canalesPorUnidad se migra en handleCanalesUnidadChange
  }, [state.magnitud, state.unidad, state.medicionPatron, state.medicionInstrumento]);

  const syncElectricalToGlobalState = useCallback(() => {
    if (state.magnitud !== "Electrica") return;
    const canales = normalizeCanalesPorUnidad(state.unidad, state.canalesPorUnidad);
    const texts = buildElectricalMeasurementTexts(state.unidad, canales, electricalValues);
    if (state.medicionPatron !== texts.medicionPatron) {
      dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: texts.medicionPatron });
    }
    if (state.medicionInstrumento !== texts.medicionInstrumento) {
      dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: texts.medicionInstrumento });
    }
  }, [electricalValues, state.magnitud, state.unidad, state.canalesPorUnidad, state.medicionPatron, state.medicionInstrumento]);

  const handleLocalElectricChange = (key: string, type: 'patron' | 'instrumento', value: string) => {
    setElectricalValues(prev => ({
        ...prev,
        [key]: { ...prev[key], [type]: value }
    }));
  };

  const handleCanalesUnidadChange = (unit: string, raw: number) => {
    const next = normalizeNumCanales(raw);
    const prev = canalesDeUnidad(state.canalesPorUnidad, unit);
    if (next === prev) return;

    const nextMap: CanalesPorUnidad = {
      ...normalizeCanalesPorUnidad(state.unidad, state.canalesPorUnidad),
      [unit]: next,
    };

    const migrated: Record<string, { patron: string; instrumento: string }> = { ...electricalValues };
    // Limpiar claves viejas de esta unidad y migrar
    for (const key of Object.keys(migrated)) {
      if (key === unit || key.startsWith(`${unit}||`)) delete migrated[key];
    }
    for (let i = 0; i < next; i++) {
      const newKey = next <= 1 ? unit : `${unit}||${i + 1}`;
      if (prev <= 1) {
        migrated[newKey] = i === 0
          ? (electricalValues[unit] || { patron: "", instrumento: "" })
          : { patron: "", instrumento: "" };
      } else if (next <= 1) {
        migrated[unit] = electricalValues[`${unit}||1`] || electricalValues[unit] || { patron: "", instrumento: "" };
        break;
      } else {
        const oldKey = `${unit}||${i + 1}`;
        // también intentar legacy letter keys
        const legacyKey = `${unit}||${String.fromCharCode(65 + i)}`;
        migrated[newKey] = electricalValues[oldKey] || electricalValues[legacyKey] || { patron: "", instrumento: "" };
      }
    }

    setElectricalValues(migrated);
    const texts = buildElectricalMeasurementTexts(state.unidad, nextMap, migrated);
    dispatch({ type: 'SET_FIELD', field: 'canalesPorUnidad', payload: nextMap });
    dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: texts.medicionPatron });
    dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: texts.medicionInstrumento });
  };

  const electricalSections = useMemo(
    () =>
      state.magnitud === "Electrica"
        ? listElectricalSections(
            state.unidad,
            normalizeCanalesPorUnidad(state.unidad, state.canalesPorUnidad)
          )
        : [],
    [state.magnitud, state.unidad, state.canalesPorUnidad]
  );

  const envRange = useMemo(
    () => envRangeStatus(state.magnitud, state.tempAmbiente, state.humedadRelativa),
    [state.magnitud, state.tempAmbiente, state.humedadRelativa],
  );

  const flushDraftNow = useCallback(() => {
    if (worksheetId) return;
    if (!state.certificado && !state.id && !state.cliente) return;
    saveWorksheetDraft(state as unknown as Record<string, unknown>);
    lastDraftSaveRef.current = Date.now();
  }, [state, worksheetId]);

  useEffect(() => {
    if (worksheetId) return;
    const hasContent = Boolean(state.certificado || state.id || state.cliente);
    if (!hasContent) return;
    const now = Date.now();
    if (now - lastDraftSaveRef.current < DRAFT_AUTOSAVE_MS) return;
    lastDraftSaveRef.current = now;
    saveWorksheetDraft(state as unknown as Record<string, unknown>);
  }, [state, worksheetId]);

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

    const fechaReferencia = parseWorksheetDate(state.fecha);
    if (isBefore(fechaReferencia, nextAllowed)) {
      dispatch({ type: 'SET_ID_BLOCKED', message: `⛔️ Este equipo fue calibrado el ${format(maxFecha, "dd/MM/yyyy")} (Frecuencia: ${frecuenciaAnterior}). Próxima calibración permitida: ${format(nextAllowed, "dd/MM/yyyy")}.` });
    }
  }, [state.id, state.cliente, state.fecha]);

  useEffect(() => {
    const timer = setTimeout(() => { validarIdEnPeriodo(); }, 450);
    return () => clearTimeout(timer);
  }, [validarIdEnPeriodo]);

  const cargarEmpresas = async () => {
    try {
      const qs = await getDocs(collection(db, "clientes"));
      setListaClientes(qs.docs.map((d) => ({ 
          id: d.id, 
          nombre: d.data().nombre || "Sin nombre",
          requerimientos: d.data().requerimientos || "",
          formatoFechaEtiqueta: (d.data().formatoFechaEtiqueta as LabelDateFormat | undefined) || "full",
      })));
    } catch { setListaClientes([{ id: "1", nombre: "ERROR AL CARGAR CLIENTES" }]); }
  };

  useEffect(() => {
    if (user) dispatch({ type: 'SET_USER_NAME', payload: getTechnicianFolderName(user) });
    cargarEmpresas();
  }, [user]);

  useEffect(() => {
    const cert = currentConsecutive || ""; 
    dispatch({ type: 'SET_CONSECUTIVE', consecutive: cert, magnitud: extractMagnitudFromConsecutivo(cert) });
    
    // Aquí inyectamos la fecha correcta cuando se pide un consecutivo nuevo
    if (!worksheetId && cert) {
       dispatch({ type: 'SET_FIELD', field: 'fecha', payload: getLocalISODate() });
    }
  }, [currentConsecutive, worksheetId]);

  // Heartbeat: evita que otro técnico reclame este folio mientras la hoja está abierta.
  useEffect(() => {
    const cert = (state.certificado || currentConsecutive || "").trim();
    if (!cert || worksheetId) return;

    void tocarConsecutivoActivo(cert);
    const interval = window.setInterval(() => {
      void tocarConsecutivoActivo(cert);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [state.certificado, currentConsecutive, worksheetId]);

  useEffect(() => {
    if (!selectedMagnitude) return;
    const magnitudFromCert = extractMagnitudFromConsecutivo(currentConsecutive || "");
    if (magnitudFromCert) return;
    dispatch({ type: 'SET_MAGNITUD', payload: selectedMagnitude });
  }, [selectedMagnitude, currentConsecutive]);

  useEffect(() => {
    if (worksheetId || draftRestoredRef.current) {
      setDraftHydrationDone(true);
      return;
    }

    const restoreDrafts = async () => {
      const backup = localStorage.getItem("backup_worksheet_data");
      if (backup) {
        try {
          const parsedBackup = JSON.parse(backup) as WorksheetState;
          if (await confirm({
            title: 'Respaldo encontrado',
            message: 'Se encontró una hoja de trabajo no guardada (respaldo de error). ¿Desea restaurarla?',
          })) {
            dispatch({ type: "RESTORE_BACKUP", payload: parsedBackup });
          }
          localStorage.removeItem("backup_worksheet_data");
        } catch (e) {
          console.error("Error al restaurar respaldo", e);
          localStorage.removeItem("backup_worksheet_data");
        }
        draftRestoredRef.current = true;
        setDraftHydrationDone(true);
        return;
      }

      const draft = loadWorksheetDraft();
      if (!draft?.state) {
        draftRestoredRef.current = true;
        setDraftHydrationDone(true);
        return;
      }
      const draftCert = String(draft.certificado || "");
      const navCert = currentConsecutive || "";
      if (navCert && draftCert && draftCert !== navCert) {
        draftRestoredRef.current = true;
        setDraftHydrationDone(true);
        return;
      }

      dispatch({ type: "RESTORE_BACKUP", payload: draft.state as WorksheetState });
      draftRestoredRef.current = true;
      setDraftHydrationDone(true);
      setToast({
        message: "Se restauró automáticamente el borrador local de la hoja.",
        type: "warning",
      });
    };

    void restoreDrafts();
  }, [worksheetId, currentConsecutive, confirm]);

  // Prefill cliente desde la asignación de hoy (editable; no pisa borrador/edición).
  useEffect(() => {
    if (worksheetId || !draftHydrationDone || !user?.id || clientePrefillDoneRef.current) return;
    if (clienteRef.current?.trim()) {
      clientePrefillDoneRef.current = true;
      return;
    }

    let cancelled = false;

    const prefillClienteFromAsignacion = async () => {
      try {
        const hoy = getHoyFechaLocal();
        const snap = await getDocs(
          query(collection(db, "servicios"), where("personas", "array-contains", user.id))
        );
        if (cancelled || clientePrefillDoneRef.current || clienteRef.current?.trim()) return;

        const servicios = snap.docs.map((d) => {
          const data = d.data() as {
            cliente?: string;
            fecha?: string;
            estado?: string;
            horaInicio?: string;
          };
          return {
            cliente: data.cliente,
            fecha: data.fecha,
            estado: data.estado,
            horaInicio: data.horaInicio,
          };
        });

        const nombreAsignado = pickClienteFromAsignacionHoy(servicios, hoy);
        if (!nombreAsignado) {
          clientePrefillDoneRef.current = true;
          return;
        }

        const matched = listaClientes.find(
          (c) => canonicalizeClienteNombre(c.nombre) === canonicalizeClienteNombre(nombreAsignado)
        );
        const finalNombre = matched?.nombre || nombreAsignado;

        if (!clienteRef.current?.trim()) {
          dispatch({ type: "SET_CLIENTE", payload: finalNombre });
        }
        clientePrefillDoneRef.current = true;
      } catch (e) {
        console.error("Error al prellenar cliente desde asignación:", e);
        clientePrefillDoneRef.current = true;
      }
    };

    void prefillClienteFromAsignacion();
    return () => {
      cancelled = true;
    };
  }, [worksheetId, draftHydrationDone, user?.id, listaClientes]);

  const unidadesDisponibles = React.useMemo(() => {
    if (state.magnitud === "Electrica") return [...unidadesPorMagnitud.Electrica.DC, ...unidadesPorMagnitud.Electrica.AC, ...unidadesPorMagnitud.Electrica.Otros] as string[];
    return (state.magnitud && unidadesPorMagnitud[state.magnitud]) ? unidadesPorMagnitud[state.magnitud] as string[] : [];
  }, [state.magnitud]);

  /** Toma F. Entrada de Friday (logística) → Fecha de Recepción cuando es Laboratorio. */
  const applyFechaEntradaFromFriday = useCallback(
    async (overrides?: { id?: string; cliente?: string; lugar?: string }) => {
      const id = String(overrides?.id ?? state.id ?? "").trim();
      const cliente = String(overrides?.cliente ?? state.cliente ?? "").trim();
      const lugar = String(overrides?.lugar ?? state.lugarCalibracion ?? "");
      if (!id || !cliente || lugar !== "Laboratorio" || !navigator.onLine) return;

      try {
        const qFriday = query(
          collection(db, "hojasDeTrabajo"),
          where("id", "==", id),
          where("cliente", "==", cliente)
        );
        const snaps = await getDocs(qFriday);
        if (snaps.empty) return;

        let bestDate = "";
        let bestTime = -1;
        snaps.forEach((snap) => {
          const data = snap.data();
          // Misma heurística que al guardar: fila abierta de Friday (aún sin calibrar/PDF).
          const isOpen =
            !data.pdfURL ||
            data.status_certificado === "Pendiente de Certificado" ||
            data.status_equipo === "Desconocido" ||
            data.status_equipo === "Recepción";
          if (!isOpen) return;

          const fechaRaw = String(data.fechaEntrada || data.fechaRecepcion || "")
            .trim()
            .split("T")[0];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) return;

          const docTime = new Date(String(data.createdAt || data.fechaEntrada || 0)).getTime();
          if (docTime > bestTime) {
            bestTime = docTime;
            bestDate = fechaRaw;
          }
        });

        if (!bestDate) return;
        if (bestDate === state.fechaRecepcion) return;

        dispatch({ type: "SET_FIELD", field: "fechaRecepcion", payload: bestDate });
      } catch (err) {
        console.error("No se pudo leer F. Entrada de Friday:", err);
      }
    },
    [state.id, state.cliente, state.lugarCalibracion, state.fechaRecepcion]
  );

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

    await applyFechaEntradaFromFriday({ id: newId });
  };

  const handleToggleElectrica = (unidadBase: string) => {
    let unidadFinal = unidadBase;
    const admiteSufijo = ["V", "mV", "kV", "A", "mA", "µA"].includes(unidadBase);
    if (admiteSufijo) {
      if (tipoElectrica === "DC") unidadFinal = `${unidadBase}DC`;
      if (tipoElectrica === "AC") unidadFinal = `${unidadBase}AC`;
    }
    const yaExiste = state.unidad.includes(unidadFinal);
    let nuevasUnidades: string[] = [];
    let nextCanales = { ...normalizeCanalesPorUnidad(state.unidad, state.canalesPorUnidad) };
    if (yaExiste) {
      nuevasUnidades = state.unidad.filter(u => u !== unidadFinal);
      delete nextCanales[unidadFinal];
    } else {
      nuevasUnidades = [...state.unidad, unidadFinal];
      nextCanales[unidadFinal] = 1;
    }
    dispatch({ type: 'SET_FIELD', field: 'unidad', payload: nuevasUnidades });
    dispatch({ type: 'SET_FIELD', field: 'canalesPorUnidad', payload: nextCanales });
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

  const buildLabelData = useCallback((): LabelData => {
    const nextDate = calcularSiguienteFecha(state.fecha, state.frecuenciaCalibracion);
    const fCalObj = state.fecha ? parseISO(state.fecha) : new Date();
    const fSugObj = nextDate ? nextDate : addYears(fCalObj, 1);
    const clienteCfg = listaClientes.find(c => c.nombre === state.cliente);
    const dateMode: LabelDateFormat = clienteCfg?.formatoFechaEtiqueta || "full";
    return {
      id: state.id || "PENDIENTE",
      certificado: state.certificado || "PENDIENTE",
      fechaCal: state.fecha ? formatLabelDate(fCalObj, dateMode) : "---",
      fechaSug: isValid(fSugObj) ? formatLabelDate(fSugObj, dateMode) : "---",
      calibro: formatTechnicianInitials(state.nombre),
      labelType: state.magnitud === "Reporte de Diagnostico" ? "rechazado" : "calibrado",
    };
  }, [state.fecha, state.frecuenciaCalibracion, state.id, state.certificado, state.nombre, state.cliente, state.magnitud, listaClientes]);

  const handleSave = useCallback(async () => {
    syncElectricalToGlobalState();
    syncMasaToGlobalState();

    const errors: Record<string, boolean> = {};
    const requiredFields = ["lugarCalibracion", "certificado", "nombre", "cliente", "id", "equipo", "marca", "magnitud", "unidad", "alcance", "resolucion", "condicionEquipo"];
    let hasError = false;

    requiredFields.forEach((field) => {
      const val = state[field as keyof WorksheetState];
      if (Array.isArray(val) ? val.length === 0 : !val || String(val).trim() === "") {
        errors[field] = true;
        hasError = true;
      }
    });

    if (state.condicionEquipo === "dano" && !state.descripcionDano?.trim()) {
      errors.descripcionDano = true;
      hasError = true;
    }

    const camposAValidar: { campo: string; valor: string; nombre: string }[] = [];

    if (state.magnitud === "Masa") {
      const excStr = `1 (Centro): ${localExc.p1}\n2 (Inf Izq): ${localExc.p2}\n3 (Sup Izq): ${localExc.p3}\n4 (Sup Der): ${localExc.p4}\n5 (Inf Der): ${localExc.p5}`;
      camposAValidar.push(
        { campo: "excentricidad", valor: excStr, nombre: "Excentricidad" },
        { campo: "linealidad", valor: state.linealidad, nombre: "Linealidad" },
        { campo: "repetibilidad", valor: state.repetibilidad, nombre: "Repetibilidad" }
      );
    } else if (state.magnitud === "Electrica") {
      const sections = listElectricalSections(
        state.unidad,
        normalizeCanalesPorUnidad(state.unidad, state.canalesPorUnidad)
      );
      sections.forEach((s) => {
        const vals = electricalValues[s.key] || { patron: "", instrumento: "" };
        camposAValidar.push(
          { campo: `patron_${s.key}`, valor: vals.patron, nombre: `Patrón (${s.label})` },
          { campo: `instrumento_${s.key}`, valor: vals.instrumento, nombre: `Instrumento (${s.label})` }
        );
      });
    } else {
      camposAValidar.push(
        { campo: "medicionPatron", valor: state.medicionPatron, nombre: "Medición Patrón" },
        { campo: "medicionInstrumento", valor: state.medicionInstrumento, nombre: "Medición Instrumento" }
      );
    }

    for (const item of camposAValidar) {
      if (!item.valor?.trim()) {
        errors[item.campo] = true;
        hasError = true;
        continue;
      }
      const check = validarContenidoMedicion(item.valor);
      if (!check.valido) {
        setToast({ message: `Error en ${item.nombre}: ${check.error}`, type: "error" });
        return;
      }
    }

    let avisoPuntos = "";

    if (state.magnitud === "Masa") {
      const n = countNumericLines(state.linealidad);
      if (n < 3) avisoPuntos = puntosMedicionAviso({ magnitud: "Masa", count: n });
    } else if (state.magnitud === "Electrica") {
      for (const s of listElectricalSections(
        state.unidad,
        normalizeCanalesPorUnidad(state.unidad, state.canalesPorUnidad)
      )) {
        const n = countNumericLines(electricalValues[s.key]?.patron || "");
        if (n < 3) {
          avisoPuntos = puntosMedicionAviso({ magnitud: "Electrica", count: n, contexto: s.label });
          break;
        }
      }
    } else {
      const n = countNumericLines(state.medicionPatron);
      if (n < 3) avisoPuntos = puntosMedicionAviso({ magnitud: state.magnitud, count: n });
    }

    if (avisoPuntos) {
      if (!(await confirm({
        title: 'Puntos de medición',
        message: avisoPuntos,
        variant: 'warning',
        confirmLabel: 'Guardar',
      }))) {
        return;
      }
    }

    if (state.fechaRecepcion && state.fecha && new Date(state.fechaRecepcion) > new Date(state.fecha)) {
      errors.fecha = true;
      errors.fechaRecepcion = true;
      setToast({ message: "La fecha de recepción debe ser antes de la fecha de calibración.", type: "error" });
      hasError = true;
    }

    if (hasError) {
      setValidationErrors(errors);
      setToast({ message: "Completa los campos obligatorios para continuar.", type: "error" });
      return;
    }
    setValidationErrors({});

    setIsSaving(true);

    const clienteCatalogo = listaClientes.find((c) => {
      if (c.nombre === state.cliente) return true;
      const typed = canonicalizeClienteNombre(state.cliente);
      const catalog = canonicalizeClienteNombre(c.nombre);
      return Boolean(typed && catalog && typed === catalog);
    });

    const saveJob: BackgroundSaveJob = {
      id: `save_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      state: {
        ...state,
        cliente: clienteCatalogo?.nombre || state.cliente,
        clienteId: clienteCatalogo?.id || state.clienteId || "",
      },
      electricalValues: { ...electricalValues },
      localExc: { ...localExc },
      user,
      worksheetId,
      magnitudConsecutivo: selectedMagnitude || undefined,
    };

    try {
      const firebaseOk = navigator.onLine ? await canSaveDirectlyToFirebase() : false;

      if (!firebaseOk) {
        setToast({ message: "Sin red: guardando en segundo plano…", type: "warning" });
        scheduleOfflineSaveAndGoBack(saveJob, goBack, setPendingUploads);
        return;
      }

      if (firebaseOk) {
        if (!state.permitirExcepcion && state.id?.trim() && state.cliente) {
          const qPeriodo = query(
            collection(db, "hojasDeTrabajo"),
            where("id", "==", state.id.trim()),
            where("cliente", "==", state.cliente)
          );
          const docs = await getDocs(qPeriodo);
          if (!docs.empty) {
            let maxFecha: Date | null = null;
            let frecuenciaAnterior: string | undefined;
            docs.forEach((docSnap) => {
              const data = docSnap.data();
              if (data.fecha) {
                const parts = data.fecha.split("-");
                if (parts.length === 3) {
                  const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                  if (!isNaN(dateObj.getTime()) && (!maxFecha || dateObj.getTime() > maxFecha.getTime())) {
                    maxFecha = dateObj;
                    frecuenciaAnterior = data.frecuenciaCalibracion;
                  }
                }
              }
            });
            if (maxFecha && frecuenciaAnterior) {
              const nextAllowed = calcularSiguienteFecha(format(maxFecha, "yyyy-MM-dd"), frecuenciaAnterior);
              const fechaReferencia = parseWorksheetDate(state.fecha);
              if (nextAllowed && isBefore(fechaReferencia, nextAllowed)) {
                setToast({
                  message: "⛔️ ERROR: Equipo calibrado recientemente. Habilita 'Permitir excepción' para continuar.",
                  type: "error",
                });
                return;
              }
            }
          }
        }

        const cert = String(state.certificado || "").trim();
        if (cert) {
          try {
            await assertCertificadoLibreParaEquipo(cert, String(state.id || ""), worksheetId || null);
          } catch (conflict) {
            const msg =
              conflict instanceof Error && conflict.message.startsWith("CERT_EN_USO:")
                ? conflict.message.replace(/^CERT_EN_USO:\s*/, "")
                : "El número de certificado ya pertenece a otro equipo. Genera un consecutivo nuevo.";
            setToast({ message: msg, type: "error" });
            return;
          }
        }
      }

      enqueueBackgroundSave(
        saveJob,
        (t) => {
          setToast(t);
          if (t.type === "success" || t.type === "warning") {
            setPendingUploads(getTotalWorksheetQueueCount());
          }
        }
      );
      goBack();
    } catch (e: unknown) {
      console.error("Error al validar/guardar:", e);
      const shouldQueueOffline =
        !navigator.onLine ||
        isRetriableNetworkError(e) ||
        (navigator.onLine && !(await canSaveDirectlyToFirebase()));
      if (shouldQueueOffline) {
        setToast({ message: "Sin red: guardando en segundo plano…", type: "warning" });
        scheduleOfflineSaveAndGoBack(saveJob, goBack, setPendingUploads);
        return;
      }
      localStorage.setItem("backup_worksheet_data", JSON.stringify(state));
      saveWorksheetDraft(state as unknown as Record<string, unknown>);
      setToast({ message: "Error al guardar. Se conservó borrador y respaldo local.", type: "warning" });
    } finally {
      setIsSaving(false);
    }
  }, [
    state,
    user,
    goBack,
    worksheetId,
    electricalValues,
    localExc,
    syncElectricalToGlobalState,
    syncMasaToGlobalState,
    selectedMagnitude,
  ]);

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

  // Modificado inputClass para mayor legibilidad
  const inputClass = (fieldName: string, opts?: { warn?: boolean }) => {
    const isError = Boolean(validationErrors[fieldName]);
    const tone = isError
      ? "border-red-500 bg-red-50 focus:ring-red-500"
      : opts?.warn
        ? "border-amber-400 bg-white focus:ring-amber-400"
        : "border-gray-200 bg-white";
    return `w-full p-4 border rounded-lg transition-all focus:ring-2 focus:ring-blue-500 text-gray-900 font-semibold shadow-inner ${tone}`;
  };

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

  const labelData = buildLabelData();

  const flowAccent = accentFromMagnitude(state.magnitud || selectedMagnitude);

  return (
    <div className="min-h-full w-full flex-shrink-0 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50 relative pb-28 [color-scheme:light]">
      
      {toast && <ToastNotification message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <FlowScreenHeader
        accent={flowAccent === "trazable" ? "trazable" : "worksheet"}
        title={`Hoja de Trabajo${worksheetId ? " (Edición)" : ""}`}
        subtitle={
          <>
            <span className="font-mono font-semibold">{state.certificado || "SIN CERTIFICADO"}</span>
            <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-orange-400 animate-pulse"}`} />
            {!isOnline && (
              <span className="text-xs bg-orange-500/80 px-2 py-0.5 rounded-full text-white flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline
              </span>
            )}
            {pendingUploads > 0 && isOnline && (
              <span className="text-xs bg-amber-500/90 px-2 py-0.5 rounded-full text-white flex items-center gap-1">
                <CloudUpload className="w-3 h-3" /> Subiendo {pendingUploads}…
              </span>
            )}
            {pendingUploads > 0 && !isOnline && (
              <span className="text-xs bg-orange-600/90 px-2 py-0.5 rounded-full text-white flex items-center gap-1">
                <CloudOff className="w-3 h-3" /> {pendingUploads} en cola
              </span>
            )}
          </>
        }
        onBack={goBack}
        iconVariant="brand"
        icon={<img src={logoAg} alt="AG Lab" className="w-full h-full object-contain" />}
        rightSlot={
          <>
            <LabelPrinterButton data={labelData} logo={logoAg} />
            <button
              type="button"
              onClick={() => setShowConverter(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all bg-white/10 text-white border border-white/20 hover:bg-white/20 active:scale-95"
            >
              <Calculator className="w-4 h-4" />
              <span className="text-sm font-medium hidden md:inline">Convertidor</span>
            </button>
          </>
        }
      />

      <div className="p-4 sm:p-6">
        
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <div className={activeClientNotes ? "lg:col-span-8 transition-all duration-300" : "lg:col-span-10 lg:col-start-2 transition-all duration-300"}>
            <FlowCard
              accent={flowAccent === "trazable" ? "trazable" : "worksheet"}
              title="Información de Calibración"
              description="Complete los datos obligatorios marcados con *"
              icon={<NotebookPen className="w-5 h-5" />}
              bodyClassName="space-y-8"
            >
                <FlowSection icon={<MapPin className="w-4 h-4" />} title="Ubicación" accentClass="text-orange-500">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><span>Lugar de Calibración*</span></label>
                  <div className={`grid grid-cols-2 gap-3 sm:gap-4 text-gray-700 p-1 rounded-lg ${validationErrors.lugarCalibracion ? 'bg-red-50 border border-red-200' : ''}`}>
                    {["Sitio", "Laboratorio"].map((opt) => (
                      <button key={opt} onClick={() => { 
                          dispatch({ type: 'SET_FIELD', field: 'lugarCalibracion', payload: opt });
                          if(validationErrors.lugarCalibracion) setValidationErrors({...validationErrors, lugarCalibracion: false});
                          if (opt === "Laboratorio") {
                            void applyFechaEntradaFromFriday({ lugar: "Laboratorio" });
                          }
                      }}
                        className={`min-h-11 py-3 px-4 rounded-lg border-2 font-medium transition-all ${state.lugarCalibracion === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>{opt}</button>
                    ))}
                  </div>
                </div>
                {state.lugarCalibracion === "Laboratorio" && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                    <label className="block font-semibold text-sm text-gray-700 mb-1">Fecha de Recepción</label>
                    <WorksheetDateInput
                      value={state.fechaRecepcion}
                      onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'fechaRecepcion', payload: v })}
                      hasError={!!validationErrors.fechaRecepcion}
                      className="border rounded-xl px-3 py-2.5 text-sm border-gray-300"
                    />
                  </div>
                )}
                </FlowSection>
                
                <FlowSection icon={<Calendar className="w-4 h-4" />} title="Programación" accentClass="text-green-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><Calendar className="w-4 h-4 text-green-500" /><span>Frecuencia*</span></label>
                    <select value={state.frecuenciaCalibracion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'frecuenciaCalibracion', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 font-semibold shadow-inner bg-white border-slate-300">
                      <option value="">Seleccionar...</option><option value="1 mes">1 mes</option><option value="3 meses">3 meses</option><option value="6 meses">6 meses</option><option value="1 año">1 año</option><option value="2 años">2 años</option><option value="3 años">3 años</option>
                    </select>
                  </div>
                  
                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><Calendar className="w-4 h-4 text-blue-500" /><span>Fecha*</span></label>
                    <WorksheetDateInput
                      value={state.fecha}
                      onChange={(v) => dispatch({ type: 'SET_FIELD', field: 'fecha', payload: v })}
                      hasError={!!validationErrors.fecha}
                      className="p-4 border rounded-lg border-indigo-200"
                    />
                    
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
                </FlowSection>

                <FlowSection icon={<Hash className="w-4 h-4" />} title="Identificación" accentClass="text-purple-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><Hash className="w-4 h-4 text-purple-500" /><span>N.Certificado*</span></label>
                    <input type="text" value={state.certificado} readOnly className={`w-full p-4 border rounded-lg bg-white text-gray-900 font-semibold shadow-inner ${validationErrors.certificado ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'}`} placeholder="Automático" />
                  </div>
                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><Mail className="w-4 h-4 text-red-500" /><span>Nombre Técnico*</span></label>
                    <input type="text" value={state.nombre} readOnly className={`w-full p-4 border rounded-lg bg-white text-gray-900 font-semibold shadow-inner ${validationErrors.nombre ? 'border-red-500 ring-1 ring-red-500' : 'border-indigo-200'}`} />
                  </div>
                </div>
                </FlowSection>

                <FlowSection icon={<Building2 className="w-4 h-4" />} title="Cliente y Equipo" accentClass="text-blue-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><Building2 className="w-4 h-4 text-indigo-500" /><span>Cliente*</span></label>
                    <ClienteSearchSelect clientes={listaClientes} onSelect={(v) => { dispatch({ type: 'SET_CLIENTE', payload: v }); if(validationErrors.cliente) setValidationErrors({...validationErrors, cliente: false}); }} currentValue={state.cliente} hasError={validationErrors.cliente} onBlurDraft={flushDraftNow} />
                  </div>
                  
                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><Hash className="w-4 h-4 text-gray-500" /><span>ID*</span></label>
                    <input 
                      type="text" 
                      value={state.id} 
                      onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'id', payload: e.target.value }); if(validationErrors.id) setValidationErrors({...validationErrors, id: false}); }} 
                      onBlur={(e) => { handleIdBlur(e); flushDraftNow(); }}
                      className={`w-full p-4 border rounded-lg transition-all text-gray-900 font-semibold shadow-inner bg-white ${
                          state.idBlocked 
                              ? (state.permitirExcepcion ? "border-orange-400 bg-orange-50 focus:ring-orange-500" : "border-red-500 bg-red-50 text-red-700") 
                              : (validationErrors.id ? "border-red-500 bg-red-50" : "border-indigo-200 focus:ring-blue-500")
                      }`} 
                      placeholder="ID" 
                    />
                    
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
                            <span className={`text-sm ${state.idBlocked ? 'text-indigo-900 font-bold' : 'text-gray-400'}`}>
                              Permitir excepción de fecha
                            </span>
                        </label>
                    </div>
                  </div>
                </div>

                {/* --- SECCIÓN EQUIPO / MARCA --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><Wrench className="w-4 h-4 text-yellow-500" /><span>Equipo*</span></label>
                    <input type="text" value={state.equipo} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'equipo', payload: e.target.value }); if(validationErrors.equipo) setValidationErrors({...validationErrors, equipo: false}); }} onBlur={flushDraftNow} readOnly={state.fieldsLocked} className={inputClass('equipo')} />
                  </div>
                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><Tag className="w-4 h-4 text-pink-500" /><span>Marca*</span></label>
                    <input type="text" value={state.marca} onChange={(e) => { dispatch({ type: 'SET_FIELD', field: 'marca', payload: e.target.value }); if(validationErrors.marca) setValidationErrors({...validationErrors, marca: false}); }} readOnly={state.fieldsLocked} className={inputClass('marca')} />
                  </div>
                </div>

                {/* --- SECCIÓN MODELO / SERIE --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><Hash className="w-4 h-4 text-teal-500" /><span>Modelo</span></label>
                    <input type="text" value={state.modelo} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'modelo', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-slate-300 text-gray-900 font-semibold shadow-inner bg-white" />
                  </div>
                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><NotebookPen className="w-4 h-4 text-purple-500" /><span>Nº Serie</span></label>
                    <input type="text" value={state.numeroSerie} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'numeroSerie', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-indigo-200 text-gray-900 font-semibold shadow-inner bg-white" />
                  </div>
                </div>

                {/* --- SECCIÓN MAGNITUD / UNIDAD --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3">
                      <Tag className="w-4 h-4 text-blue-500" /><span>Magnitud*</span>
                    </label>
                    {selectedMagnitude && (
                      <p className="text-xs text-slate-500 mb-2">
                        Sugerida por navegación: {toWorksheetMagnitud(selectedMagnitude)} — puede cambiarla abajo.
                      </p>
                    )}
                    <select value={state.magnitud}
                        onChange={(e) => {
                          dispatch({ type: 'SET_MAGNITUD', payload: e.target.value });
                          if(validationErrors.magnitud) setValidationErrors({...validationErrors, magnitud: false});
                        }}
                        onBlur={flushDraftNow}
                        className={`w-full p-4 border rounded-lg outline-none bg-white text-gray-900 font-semibold shadow-inner appearance-none cursor-pointer ${validationErrors.magnitud ? "border-red-500 ring-1 ring-red-500" : "border-slate-300 focus:ring-2 focus:ring-blue-500"}`}>
                        <option value="" className="text-gray-400">Seleccionar...</option>
                        {WORKSHEET_MAGNITUDES.map((m) => <option key={m} value={m} className="text-gray-900">{m}</option>)}
                      </select>
                  </div>

                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3">
                      <Tag className="w-4 h-4 text-violet-500" /><span>Unidad*</span>
                    </label>
                    {state.magnitud === "Electrica" ? (
                      <div className={`p-4 border rounded-lg bg-white shadow-inner ${validationErrors.unidad ? "border-red-500 bg-red-50" : "border-indigo-200"}`}>
                        <div className="font-bold text-gray-800 mb-3 text-sm">Tipo Eléctrico</div>
                        <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-lg mb-4">
                          {(["DC", "AC", "Otros"] as const).map((tipo) => (
                            <button key={tipo} onClick={() => setTipoElectrica(tipo)}
                              className={`min-h-10 py-2 text-sm font-medium rounded-md transition-all ${tipoElectrica === tipo ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"}`}>
                              {tipo}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                          {unidadesPorMagnitud.Electrica[tipoElectrica].map((u: string) => {
                            let checkValue = u;
                            if (["V", "mV", "kV", "A", "mA", "µA"].includes(u)) {
                               if (tipoElectrica === "DC") checkValue = `${u}DC`;
                               if (tipoElectrica === "AC") checkValue = `${u}AC`;
                            }
                            const isChecked = state.unidad.includes(checkValue);
                            return (
                              <label key={u} className={`flex items-center space-x-2 min-h-11 p-2.5 rounded border cursor-pointer transition-all ${isChecked ? "bg-blue-50 border-blue-200" : "border-transparent hover:bg-gray-50"}`}>
                                <input type="checkbox" checked={isChecked} onChange={() => handleToggleElectrica(u)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                                <span className={`text-sm ${isChecked ? "font-bold text-blue-800" : "text-gray-700"}`}>{u}</span>
                              </label>
                            );
                          })}
                        </div>
                        {state.unidad.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                            <p className="text-xs text-gray-500">
                              Seleccionado: <span className="font-medium text-blue-600">{state.unidad.join(", ")}</span>
                            </p>
                            {state.unidad.map((u) => {
                              const nCanales = canalesDeUnidad(state.canalesPorUnidad, u);
                              return (
                                <div
                                  key={`canales-${u}`}
                                  className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <span className="text-sm font-bold text-amber-950">{u}</span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                      Canales
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Array.from({ length: MAX_CANALES_ELECTRICOS }, (_, i) => i + 1).map((n) => {
                                      const active = nCanales === n;
                                      return (
                                        <button
                                          key={`${u}-ch-${n}`}
                                          type="button"
                                          onClick={() => handleCanalesUnidadChange(u, n)}
                                          className={`min-w-[2.25rem] px-2.5 py-1.5 rounded-md text-xs font-bold border transition-all ${
                                            active
                                              ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                                              : "bg-white text-gray-700 border-gray-200 hover:border-amber-300"
                                          }`}
                                        >
                                          {n}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
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
                        className={`w-full p-4 border rounded-lg bg-white text-gray-900 font-semibold shadow-inner outline-none h-[150px] ${validationErrors.unidad ? "border-red-500" : "border-indigo-200 focus:ring-2 focus:ring-blue-500"}`}>
                        {!state.magnitud && <option value="" disabled>Seleccione magnitud primero</option>}
                        {unidadesDisponibles.map(u => <option key={u} value={u} className="p-1">{u}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* --- SECCIÓN ALCANCE / RESOLUCIÓN --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><Tag className="w-4 h-4 text-gray-500"/><span>Alcance*</span></label>
                    <input 
                        type="text" 
                        className={inputClass('alcance')} 
                        value={state.alcance} 
                        onChange={e => {
                             dispatch({ type: 'SET_FIELD', field: 'alcance', payload: e.target.value });
                             if(validationErrors.alcance) setValidationErrors({...validationErrors, alcance: false});
                        }}
                        onBlur={flushDraftNow}
                    />
                  </div>
                  <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><Tag className="w-4 h-4 text-gray-500"/><span>Resolución*</span></label>
                    <input 
                        type="text" 
                        className={inputClass('resolucion')} 
                        value={state.resolucion} 
                        onChange={e => {
                             dispatch({ type: 'SET_FIELD', field: 'resolucion', payload: e.target.value });
                             if(validationErrors.resolucion) setValidationErrors({...validationErrors, resolucion: false});
                        }}
                        onBlur={flushDraftNow}
                    />
                  </div>
                </div>
                </FlowSection>

                <FlowSection icon={<ShieldCheck className="w-4 h-4" />} title="Inspección Visual" accentClass="text-emerald-500">
                <div className="rounded-2xl border border-slate-200 shadow-md overflow-hidden">
                  <div className="bg-gradient-to-r from-gray-800 to-slate-700 px-6 py-4 flex items-center gap-3 rounded-t-2xl">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-white font-bold text-sm">Inspección Visual del Equipo</h3>
                      <p className="text-gray-300 text-xs mt-0.5">¿El equipo presenta daños, golpes o anomalías visibles?</p>
                    </div>
                  </div>
                  <div className="p-6 bg-white space-y-5 rounded-b-2xl">
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
                </FlowSection>

                <FlowSection icon={<Scale className="w-4 h-4" />} title="Mediciones" accentClass="text-indigo-500">
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
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                          <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3">
                            <NotebookPen className="w-4 h-4 text-pink-500" /><span>Linealidad (Presiona Enter para nueva línea)</span>
                          </label>
                          <textarea 
                            value={state.linealidad} 
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'linealidad', payload: e.target.value })} 
                            className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-slate-300 min-h-[140px] font-mono text-sm shadow-inner resize-y text-gray-900 font-semibold bg-white" 
                            rows={6} 
                            placeholder="Punto 1: 10.000 g&#10;Punto 2: 20.000 g&#10;Punto 3: 30.000 g..." 
                          />
                        </div>
                        <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                          <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3">
                            <NotebookPen className="w-4 h-4 text-orange-500" /><span>Repetibilidad (Presiona Enter para nueva línea)</span>
                          </label>
                          <textarea 
                            value={state.repetibilidad} 
                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'repetibilidad', payload: e.target.value })} 
                            className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 border-indigo-200 min-h-[140px] font-mono text-sm shadow-inner resize-y text-gray-900 font-semibold bg-white" 
                            rows={6} 
                            placeholder="Lectura 1: 5.001 g&#10;Lectura 2: 5.002 g&#10;Lectura 3: 5.001 g..." 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : state.magnitud === "Electrica" && state.unidad.length > 0 ? (
                  <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-blue-500"/> 
                            Mediciones por Unidad Eléctrica
                        </h3>
                    </div>
                
                    <div className="hidden sm:grid grid-cols-12 gap-6 mb-2 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <div className="col-span-2 flex items-center">Unidad / Canal</div>
                        <div className="col-span-5 pl-1">Medición Patrón</div>
                        <div className="col-span-5 pl-1">Medición Instrumento</div>
                    </div>
                
                    <div className="space-y-4">
                    {electricalSections.map((s) => (
                        <div key={s.key} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-6 items-start">
                            <div className="sm:col-span-2 sm:pt-2">
                                <div className={`text-sm font-bold py-3 px-2 rounded-lg flex flex-col items-center justify-center text-center break-words shadow-sm border ${
                                  s.numCanales > 1
                                    ? "text-amber-900 bg-amber-50 border-amber-200"
                                    : "text-blue-800 bg-blue-100 border-blue-200"
                                }`}>
                                    <span>{s.unit}</span>
                                    {s.numCanales > 1 && (
                                      <span className="text-[11px] font-extrabold mt-1 tracking-wide">
                                        Canal {s.canalIndex + 1}
                                      </span>
                                    )}
                                </div>
                            </div>
                
                            <div className="sm:col-span-5">
                                <label className="sm:hidden mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Medición Patrón</label>
                                <textarea 
                                  placeholder="Ej: 10.00&#10;10.01&#10;10.02" 
                                  value={electricalValues[s.key]?.patron || ""}
                                  onChange={(e) => handleLocalElectricChange(s.key, 'patron', e.target.value)}
                                  onBlur={syncElectricalToGlobalState}
                                  rows={6} 
                                  className="w-full p-3 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[140px] sm:min-h-[160px] shadow-sm font-mono font-semibold leading-relaxed text-gray-900 bg-white" 
                                />
                            </div>
                
                            <div className="sm:col-span-5">
                                <label className="sm:hidden mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Medición Instrumento</label>
                                <textarea 
                                  placeholder="Ej: 9.99&#10;10.00&#10;10.01"
                                  value={electricalValues[s.key]?.instrumento || ""}
                                  onChange={(e) => handleLocalElectricChange(s.key, 'instrumento', e.target.value)}
                                  onBlur={syncElectricalToGlobalState}
                                  rows={6} 
                                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[160px] shadow-sm font-mono font-semibold leading-relaxed text-gray-900 bg-white" 
                                />
                            </div>
                        </div>
                    ))}
                    </div>
                  </div>
                ) : state.magnitud === "Presión" ? (
                  <MedicionPuntosTable
                    alcance={state.alcance}
                    resolucion={state.resolucion}
                    medicionPatron={state.medicionPatron}
                    medicionInstrumento={state.medicionInstrumento}
                    onChange={(patron, instrumento) => {
                      dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: patron });
                      dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: instrumento });
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                      <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><NotebookPen className="w-4 h-4 text-teal-400" /><span>Medición Patrón</span></label>
                      <textarea value={state.medicionPatron} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: e.target.value })} rows={6} className="w-full p-3 border rounded resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 border-slate-300 text-gray-900 font-semibold shadow-inner bg-white" />
                    </div>
                    <div className="bg-indigo-50/40 p-5 rounded-xl border border-indigo-100 shadow-sm">
                      <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><NotebookPen className="w-4 h-4 text-blue-400" /><span>Medición Instrumento</span></label>
                      <textarea value={state.medicionInstrumento} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: e.target.value })} rows={6} className="w-full p-3 border rounded resize-y min-h-[150px] focus:ring-2 focus:ring-blue-500 border-indigo-200 text-gray-900 font-semibold shadow-inner bg-white" />
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-gray-400" /><span>Notas Técnicas</span></label>
                  <textarea value={state.notas} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'notas', payload: e.target.value })} className="w-full p-4 border rounded-lg resize-y min-h-[100px] focus:ring-2 focus:ring-blue-500 border-gray-200 text-gray-900 font-medium bg-white shadow-inner" rows={4} placeholder="Notas y observaciones multilínea..." />
                </div>
                
                {/* --- SECCIÓN TEMPERATURA / HR --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                  <div className={`p-5 rounded-xl border shadow-sm transition-colors ${envRange.tempOut ? "bg-amber-50/70 border-amber-300 ring-1 ring-amber-200/70" : "bg-slate-50 border-slate-200"}`}>
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 mb-3"><NotebookPen className="w-4 h-4 text-sky-400" /><span>Temp. Ambiente (°C)</span></label>
                    <input type="number" value={state.tempAmbiente} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'tempAmbiente', payload: e.target.value })} className={inputClass('tempAmbiente', { warn: envRange.tempOut })} />
                  </div>
                  <div className={`p-5 rounded-xl border shadow-sm transition-colors ${envRange.hrOut ? "bg-amber-50/70 border-amber-300 ring-1 ring-amber-200/70" : "bg-indigo-50/40 border-indigo-100"}`}>
                    <label className="flex items-center space-x-2 text-sm font-bold text-indigo-900 mb-3"><NotebookPen className="w-4 h-4 text-pink-400" /><span>HR%</span></label>
                    <input type="number" value={state.humedadRelativa} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'humedadRelativa', payload: e.target.value })} className={inputClass('humedadRelativa', { warn: envRange.hrOut })} />
                  </div>

                  {(envRange.tempOut || envRange.hrOut) && (
                    <div className="lg:col-span-2 flex items-center gap-3 rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-white px-3.5 py-2.5 animate-in fade-in slide-in-from-top-1">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-sm text-slate-700 leading-snug min-w-0">
                        <span className="font-semibold text-slate-900">Fuera de rango</span>
                        <span className="text-slate-500"> · </span>
                        <span className="tabular-nums text-slate-600">{envRange.summary}</span>
                      </p>
                    </div>
                  )}
                </div>
                </FlowSection>
            </FlowCard>
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

      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => goBack()}
            className="w-full sm:w-auto min-h-11 px-5 py-3 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
            disabled={isSaving}
          >
            <X className="w-4 h-4" /><span>Cancelar</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (state.idBlocked && !state.permitirExcepcion)}
            className={`w-full sm:w-auto min-h-11 px-6 py-3 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg ${
              isSaving || (state.idBlocked && !state.permitirExcepcion)
                ? "bg-slate-400 cursor-not-allowed"
                : flowAccent === "trazable"
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-orange-500/25"
                  : "bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 shadow-blue-500/25"
            }`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? "Guardando…" : "Guardar Hoja"}</span>
          </button>
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
