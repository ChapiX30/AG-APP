import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, Trash2, ChevronDown, Search, 
  UserCircle, Calendar, X, 
  Menu, Building2, ArrowLeft,
  Lock, Shield, Check, Briefcase, 
  MessageSquare, Send, Clock, AlertTriangle, AlertCircle,
  MoreHorizontal, ArrowUpAZ, ArrowDownAZ, EyeOff, Pencil,
  Eye, RotateCcw, Zap, Columns, Download, Filter, History, FileSpreadsheet, Brain, Lightbulb, Info, CheckCircle, TrendingUp
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, query, where, onSnapshot, setDoc, writeBatch, orderBy, addDoc, getDocs } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from "../hooks/useAuth"; 

// --- TIPOS ---
type CellType = "text" | "number" | "dropdown" | "date" | "person" | "client" | "sla";

// --- UTILIDADES DE COLOR ---
const hexToRgba = (hex: string, alpha: number) => {
    if (!hex) return `rgba(255, 255, 255, 1)`;
    let c: any;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length === 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
    }
    return hex;
};

const stringToColor = (str: string) => {
    if (!str) return "#ffffff";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 96%)`; // Fallback por defecto
};

// --- MÓDULO 1: CEREBRO DEPARTAMENTAL (AG-Bot Core) ---
const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
    "Eléctrica": [
        "multimetro", "fuente", "poder", "carga", "electrica", "electronica", "resistencia", "decada", "capacitancia", "inductancia", 
        "osciloscopio", "pinza", "amperimetro", "voltimetro", "vatimetro", "aislamiento", "tierra", "analizador", "espectro", "señal",
        "multimeter", "source", "supply", "power", "load", "electronic", "resistance", "decade", "capacitance", "inductance", "lcr",
        "oscilloscope", "scope", "clamp", "ammeter", "voltmeter", "wattmeter", "insulation", "ground", "analyzer", "spectrum", "signal",
        "hypot", "hi-pot", "usb", "dmm"
    ],
    "Dimensional": [
        "vernier", "calibrador", "pie de rey", "micrometro", "regla", "cinta", "flexometro", "medidor", "altura", "profundidad", 
        "comparador", "optico", "vision", "perno", "indicador", "caratula", "bloque", "patron", "anillo", "tapon", "rosca", "lupa", "microscopio",
        "caliper", "micrometer", "ruler", "tape", "measure", "height", "depth", "comparator", "optical", "vision", "pin", "plug", 
        "indicator", "dial", "gauge block", "gage block", "block", "master", "ring", "thread", "scope", "magnifier", "projector"
    ],
    "Mecánica": [
        "dinamometro", "torquimetro", "torque", "manometro", "presion", "vacio", "balanza", "bascula", "peso", "masa", "fuerza", 
        "celda", "flujometro", "flujo", "controlador", "hot", "dispenser", "báscula", "smar track", "transductor de presión", "temperatura", "termómetro", "termopar", "durometro", "dureza", "tacometro",
        "dynamometer", "force", "conductivity", "timer", "Cronometro", "gauge", "gage", "wrench", "driver", "manometer", "pressure", "vacuum", "balance", "scale", 
        "weight", "mass", "load cell", "cell", "flow", "controller", "temperature", "thermometer", "regulator", "thermocouple", "hardness", "durometer", "tachometer"
    ]
};

// --- MÓDULO 2: INFERENCIA DE MARCAS ---
const BRAND_INFERENCE: Record<string, string> = {
    "87v": "FLUKE", "179": "FLUKE", "789": "FLUKE", "1587": "FLUKE",
    "mitutoyo": "MITUTOYO", "500-196": "MITUTOYO", "293-340": "MITUTOYO", "cd-6": "MITUTOYO", "id-c": "MITUTOYO",
    "tektronix": "TEKTRONIX", "tds": "TEKTRONIX", "mdo": "TEKTRONIX",
    "keysight": "KEYSIGHT", "agilent": "KEYSIGHT", "34401a": "KEYSIGHT",
    "starrett": "STARRETT", "798": "STARRETT",
    "chroma": "CHROMA", "66202": "CHROMA",
    "klein": "KLEIN TOOLS", "cl800": "KLEIN TOOLS",
    "flexometro": "STANLEY", "cinta": "STANLEY"
};

const detectDepartment = (equipmentName: string): string => {
    if (!equipmentName) return "";
    const lower = equipmentName.toLowerCase();
    for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) return dept;
    }
    return "";
};

const inferBrand = (model: string): string => {
    if (!model) return "";
    const lower = model.toLowerCase();
    for (const [key, brand] of Object.entries(BRAND_INFERENCE)) {
        if (lower.includes(key)) return brand;
    }
    return "";
};

const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return "?";
};

// --- CONFIGURACIÓN DE ROLES ---
const AVAILABLE_PROFILES = [
    { id: 'admin', label: 'Administrador', type: 'role' }, 
    { id: 'metrologo', label: 'Metrólogo', type: 'puesto' },
    { id: 'calidad', label: 'Calidad', type: 'puesto' },
    { id: 'logistica', label: 'Logística', type: 'puesto' },
    { id: 'ventas', label: 'Ventas', type: 'puesto' }
];

interface Column {
  key: string;
  label: string;
  type: CellType;
  width: number;
  hidden?: boolean;
  options?: string[];
  sticky?: boolean;
  permissions?: string[]; 
}

interface WorksheetData {
  docId: string; 
  id: string;    
  createdAt: string; 
  lugarCalibracion: string; 
  assignedTo?: string; 
  nombre?: string;     
  fecha?: string;      
  cargado_drive?: string; 
  entregado?: boolean; 
  folioSalida?: string; 
  [key: string]: any; 
}

interface GroupData {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
}

interface DragItem {
    type: 'row' | 'column';
    index: number; 
    id?: string;
    groupId?: string;
}

interface AGBotThought { 
    id: number; 
    type: 'info' | 'warning' | 'success'; 
    message: string; 
    timestamp: string; 
}

// --- CONFIGURACIÓN DE COLORES DE ESTATUS ---
const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  "Desconocido": { label: "Desconocido", bg: "#c4c4c4" },
  "En Revisión": { label: "En Revisión", bg: "#fdab3d" },
  "Calibrado": { label: "Calibrado", bg: "#00c875" },
  "Rechazado": { label: "Rechazado", bg: "#e2445c" },
  "Pendiente de Certificado": { label: "Pendiente Cert.", bg: "#0086c0" },
  "Generado": { label: "Generado", bg: "#a25ddc" },
  "Firmado": { label: "Firmado", bg: "#00c875" },
  "Servicio en Sitio": { label: "Servicio en Sitio", bg: "#a25ddc" },
  "Laboratorio": { label: "Laboratorio", bg: "#579bfc" },
  "Recepción": { label: "Recepción", bg: "#fdab3d" },
  "Entregado": { label: "Entregado", bg: "#00c875" },
  "No": { label: "No", bg: "#e2445c" },
  "Si": { label: "Si", bg: "#00c875" },
  "Realizado": { label: "Realizado", bg: "#00c875" }, 
  "Mecánica": { label: "Mecánica", bg: "#1565c0" },
  "Dimensional": { label: "Dimensional", bg: "#00897b" },
  "Eléctrica": { label: "Eléctrica", bg: "#ff8f00" }
};

const DEFAULT_COLUMNS: Column[] = [
  { key: 'folio', label: 'Folio', width: 80, type: "text", sticky: true, permissions: ['admin', 'ventas'] }, 
  { key: 'cliente', label: 'Cliente', width: 200, type: "client", permissions: ['admin', 'ventas', 'logistica'] },
  { key: 'equipo', label: 'Equipo', width: 180, type: "text", permissions: ['admin', 'metrologo'] },
  { key: 'id', label: 'ID Interno', width: 100, type: "text", permissions: ['admin', 'metrologo'] }, 
  { key: 'marca', label: 'Marca', width: 120, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 120, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
  { key: 'nombre', label: 'Responsable', width: 120, type: "person", permissions: ['admin', 'logistica'] }, 
  { key: 'createdAt', label: 'Cronograma (SLA)', width: 150, type: "sla" },
  { key: 'status_equipo', label: '1-Estatus del Equipo', width: 160, type: "dropdown", options: ["Desconocido", "En Revisión", "Calibrado", "Rechazado"] },
  { key: 'fecha', label: '2-Fecha de Calib.', width: 130, type: "date" },
  { key: 'certificado', label: '3-N. Certificado', width: 140, type: "text" },
  { key: 'status_certificado', label: '4-Estatus Certificado', width: 170, type: "dropdown", options: ["Pendiente de Certificado", "Generado", "Firmado"] },
  { key: 'cargado_drive', label: '5-Cargado en Drive', width: 140, type: "dropdown", options: ["No", "Si", "Realizado"] },
  { key: 'ubicacion_real', label: '6-Ubicación Real', width: 160, type: "dropdown", options: ["Servicio en Sitio", "Laboratorio", "Recepción", "Entregado"] },
  { key: 'departamento', label: 'Departamento', width: 140, type: "dropdown", options: ["Mecánica", "Dimensional", "Eléctrica"], permissions: ['logistica', 'admin'] },
];

const addBusinessDays = (startDate: Date, daysToAdd: number) => {
    let currentDate = new Date(startDate);
    let added = 0;
    while (added < daysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) added++;
    }
    return currentDate;
};

// --- CELDAS INTELIGENTES ---
const SLACell = React.memo(({ createdAt, isCompleted }: { createdAt: string, isCompleted: boolean }) => {
    if (!createdAt) return <div className="w-full h-full flex items-center justify-center text-gray-300">-</div>;
    
    if (isCompleted) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-blue-50/30">
                <div className="flex flex-col items-center justify-center w-[90%] py-1 rounded bg-blue-500 text-white shadow-sm transition-all animate-in zoom-in-95">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                        <CheckCircle size={12} /> Completado
                    </div>
                </div>
            </div>
        );
    }

    const start = new Date(createdAt);
    const deadline = addBusinessDays(start, 5); 
    const now = new Date();
    const diffTime = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let bgClass = "bg-[#00c875] text-white"; 
    let label = `${diffDays} días`;
    let icon = <Clock size={12} />;

    if (diffDays <= 2 && diffDays > 0) { bgClass = "bg-[#fdab3d] text-white"; label = `${diffDays} días`; } 
    else if (diffDays === 0) { bgClass = "bg-[#e2445c] text-white"; label = "Vence Hoy"; icon = <AlertCircle size={12} />; } 
    else if (diffDays < 0) { bgClass = "bg-[#333333] text-white"; label = `Vencido (${Math.abs(diffDays)})`; icon = <AlertTriangle size={12} />; }

    return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50/30">
            <div className={clsx("flex flex-col items-center justify-center w-[90%] py-1 rounded", bgClass)}>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">{icon} {label}</div>
                <span className="text-[9px] opacity-90">{deadline.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}</span>
            </div>
        </div>
    );
});

const TextCell = React.memo(({ value, onChange, placeholder, disabled }: any) => {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== inputRef.current) setLocalValue(value || ""); }, [value]);
  const handleBlur = () => { if (!disabled && localValue !== value) onChange(localValue); };
  return (
    <input ref={inputRef} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder} disabled={disabled}
        className="w-full h-full px-3 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-[#0073ea] focus:z-10 transition-all text-xs truncate placeholder-gray-300 font-medium text-gray-700 disabled:cursor-not-allowed" 
    />
  );
});

const DropdownCell = React.memo(({ value, options, onChange, disabled }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const configItem = STATUS_CONFIG[value] || { label: value || "-", bg: "#c4c4c4" };
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (opt: string, e: React.MouseEvent) => { e.stopPropagation(); onChange(opt); setIsOpen(false); };

  if (disabled) {
      return (
        <div className="w-full h-full flex items-center justify-center opacity-70 cursor-not-allowed bg-gray-50/10">
            <div className="text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm uppercase tracking-wider" style={{ backgroundColor: configItem.bg }}>
                 {configItem.label} <Lock className="w-2.5 h-2.5 text-white/70" />
            </div>
        </div>
      );
  }

  return (
    <div className="w-full h-full relative p-1" ref={containerRef}>
      <div className="w-full h-full flex items-center justify-center text-white text-[11px] font-bold cursor-pointer hover:brightness-110 relative transition-all shadow-sm uppercase tracking-wide" style={{ backgroundColor: configItem.bg }} onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
         <span className="truncate px-1 text-center">{configItem.label}</span>
         <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100"><ChevronDown size={10}/></div>
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 w-[180px] bg-white shadow-2xl rounded-lg border border-gray-100 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto z-[100]">
           {options?.map((opt: string) => {
             const optConfig = STATUS_CONFIG[opt] || { label: opt, bg: "#ccc" };
             return (
                <div key={opt} className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0" onClick={(e) => handleSelect(opt, e)}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ background: optConfig.bg }}></div>
                    <span className="text-xs font-medium text-gray-700">{optConfig.label}</span>
                </div>
             );
           })}
        </div>
      )}
    </div>
  );
});

const DateCell = React.memo(({ value, onChange, disabled }: any) => {
    const displayDate = value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : null;
    const inputRef = useRef<HTMLInputElement>(null);
    if (disabled) return <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 cursor-not-allowed bg-gray-50/20">{displayDate || "-"}</div>;
    return (
        <div className="w-full h-full flex items-center justify-center group relative cursor-pointer hover:bg-black/5" onClick={() => inputRef.current?.showPicker()}>
             {!value && <Calendar className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />}{value && <span className="text-xs text-gray-700 font-medium">{displayDate}</span>}
             <input ref={inputRef} type="date" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onChange(e.target.value)} />
        </div>
    );
});

const PersonCell = React.memo(({ value, metrologos, onChange, disabled }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const initials = getInitials(value && typeof value === 'string' ? value : "");

    const assignedUser = metrologos.find((m: any) => m.name === value);
    const badgeColor = assignedUser?.color || "#0073ea";

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        if (isOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    if (disabled) return <div className="w-full h-full flex items-center justify-center opacity-60 cursor-not-allowed">{value ? <div className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm">{initials}</div> : <div className="text-gray-300 text-xs">-</div>}</div>;

    return (
        <div className="w-full h-full flex items-center justify-center relative" ref={containerRef}>
            <div className="cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2" onClick={() => setIsOpen(true)}>
                {value ? (
                    <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm" style={{ backgroundColor: badgeColor }} title={value}>
                        {initials}
                    </div>
                ) : (
                    <UserCircle className="w-6 h-6 text-gray-300" />
                )}
            </div>
            {isOpen && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[220px] bg-white shadow-2xl rounded-lg border border-gray-100 z-[100] p-2 max-h-60 overflow-y-auto">
                    {metrologos.map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer" onClick={() => { onChange(m.name || "Sin Nombre"); setIsOpen(false); }}>
                            <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: m.color || '#3b82f6' }}>{getInitials(m.name || "SN")}</div>
                            <span className="text-xs font-medium text-gray-700 truncate">{m.name || "Sin Nombre"}</span>
                        </div>
                    ))}
                    {value && <button onClick={() => { onChange(""); setIsOpen(false); }} className="w-full text-center text-red-500 text-xs py-2 hover:bg-red-50 border-t mt-1">Desasignar</button>}
                </div>
            )}
        </div>
    );
});

const ClientCell = React.memo(({ value, clientes, onChange, disabled }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false); };
        if (isOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const filtered = useMemo(() => {
        if (!isOpen) return [];
        if (!searchTerm) return clientes;
        return clientes.filter((c:any) => (c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()));
    }, [clientes, searchTerm, isOpen]);

    if (disabled) return <div className="w-full h-full px-3 flex items-center text-xs text-gray-500 truncate cursor-not-allowed bg-gray-50/20 italic select-none">{value || "-"}</div>;

    return (
        <div className="w-full h-full relative group" ref={containerRef}>
            <div className="w-full h-full px-3 flex items-center cursor-pointer hover:bg-black/5" onClick={() => { setIsOpen(true); setSearchTerm(""); }}>
                {value ? <span className="text-xs text-blue-800 truncate font-bold flex items-center gap-2"><Building2 size={12} className="text-blue-400"/> {value}</span> : <span className="text-xs text-gray-300 flex items-center gap-1 italic"><Plus className="w-3 h-3"/> Cliente</span>}
            </div>
            {isOpen && (
                <div className="absolute top-0 left-0 w-[260px] bg-white shadow-2xl rounded-lg border border-blue-200 z-[100] p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[300px]">
                    <div className="relative mb-2 shrink-0"><Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400"/><input autoFocus placeholder="Buscar empresa..." className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:border-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                    <div className="overflow-y-auto flex-1 space-y-1">
                        {filtered.length > 0 ? filtered.map((c: any) => (
                            <div key={c.id} className="px-2 py-2 hover:bg-blue-50 cursor-pointer rounded flex items-center gap-2" onClick={() => { onChange(c.nombre); setIsOpen(false); }}>
                                <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Building2 className="w-3 h-3"/></div><span className="text-xs text-gray-700 font-medium">{c.nombre}</span>
                            </div>
                        )) : <div className="text-xs text-gray-400 text-center py-2">No encontrado</div>}
                    </div>
                </div>
            )}
        </div>
    );
});

const CommentsPanel = ({ row, onClose }: { row: WorksheetData, onClose: () => void }) => {
    const [comments, setComments] = useState<any[]>([]);
    const [text, setText] = useState("");
    const { user } = useAuth();
    const chatRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const q = query(collection(db, `hojasDeTrabajo/${row.docId}/comments`), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }), 100);
        });
        return () => unsub();
    }, [row.docId]);

    const sendComment = async () => {
        if (!text.trim()) return;
        await addDoc(collection(db, `hojasDeTrabajo/${row.docId}/comments`), {
            text, user: user?.displayName || user?.email || "Usuario", createdAt: new Date().toISOString()
        });
        setText("");
    };

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <div><h3 className="font-bold text-gray-800 text-sm truncate w-60">{row.equipo || "Sin Equipo"}</h3><span className="text-xs text-gray-500">{row.folio || "Sin Folio"}</span></div>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={18}/></button>
            </div>
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa]">
                {comments.map((c) => (
                    <div key={c.id} className="bg-white p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm border border-gray-100 text-sm relative group">
                        <div className="flex justify-between items-center mb-1"><span className="font-bold text-[11px] text-blue-600">{c.user}</span><span className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</span></div>
                        <p className="text-gray-700 text-xs leading-relaxed">{c.text}</p>
                    </div>
                ))}
            </div>
            <div className="p-3 border-t bg-white flex gap-2">
                <input className="flex-1 bg-gray-100 border-transparent focus:bg-white border rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Escribir nota..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()}/>
                <button onClick={sendComment} className="p-2 bg-blue-600 text-white rounded-full"><Send size={16}/></button>
            </div>
        </div>
    );
};

const HistoryPanel = ({ row, onClose }: { row: WorksheetData, onClose: () => void }) => {
    const [history, setHistory] = useState<any[]>([]);
    useEffect(() => { const q = query(collection(db, `hojasDeTrabajo/${row.docId}/history`), orderBy("timestamp", "desc")); const unsub = onSnapshot(q, (snap) => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))); return () => unsub(); }, [row.docId]);
    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2"><History className="w-4 h-4 text-blue-600"/><h3 className="font-bold text-gray-800 text-sm">Historial de Cambios</h3></div>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8f9fa]">
                {history.length === 0 ? <div className="text-center text-gray-400 text-xs mt-10">No hay cambios registrados aún.</div> : history.map((h) => (
                    <div key={h.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-xs">
                        <div className="flex justify-between mb-1"><span className="font-bold text-gray-700">{h.user}</span><span className="text-gray-400 text-[10px]">{new Date(h.timestamp).toLocaleString()}</span></div>
                        <div className="text-gray-600">Cambió <span className="font-semibold text-blue-600">{h.field}</span> de <span className="line-through text-red-400 opacity-70">{h.oldValue || "(vacío)"}</span> a <span className="font-bold text-green-600">{h.newValue}</span></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- TOAST COMPONENT ---
const ToastContainer = ({ toasts, removeToast }: { toasts: any[], removeToast: (id: string) => void }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto bg-gray-900/90 backdrop-blur text-white px-4 py-3 rounded-xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-right fade-in duration-300 min-w-[280px] max-w-sm border border-white/10">
                    <div className={clsx("w-2 h-2 rounded-full mt-1.5", toast.type === 'success' ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : toast.type === 'info' ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]")}></div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">AG-Bot</p>
                        <span className="text-sm font-medium leading-tight block">{toast.message}</span>
                    </div>
                    <button onClick={() => removeToast(toast.id)} className="text-gray-500 hover:text-white transition-colors"><X size={14}/></button>
                </div>
            ))}
        </div>
    );
};

const AGBotWidget = ({ thoughts }: { thoughts: AGBotThought[] }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button onClick={() => setOpen(!open)} className={clsx("p-2 rounded-lg transition-all border", open ? "bg-purple-600 text-white border-purple-700 shadow-lg shadow-purple-200" : "bg-white text-purple-600 border-purple-200 hover:bg-purple-50")}>
                <Brain size={18} className={clsx(thoughts.length > 0 && "animate-pulse")} />
                {thoughts.length > 0 && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span></span>}
            </button>
            {open && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-purple-100 z-[80] overflow-hidden animate-in fade-in slide-in-from-top-4">
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white font-bold"><Brain size={16} /><span className="text-sm">AG-Bot Insights</span></div>
                        <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white"><X size={16}/></button>
                    </div>
                    <div className="p-0 max-h-80 overflow-y-auto bg-slate-50/50">
                        {thoughts.length === 0 ? <div className="p-6 text-center text-gray-400 text-xs">Sin novedades por ahora.</div> : 
                        thoughts.map((t) => (
                            <div key={t.id} className="p-3 border-b border-gray-100 bg-white hover:bg-purple-50/30 transition-colors flex gap-3">
                                <div className={clsx("mt-1 flex-shrink-0", t.type === 'success' ? "text-emerald-500" : t.type === 'warning' ? "text-amber-500" : "text-blue-500")}>
                                    {t.type === 'success' ? <Check size={14}/> : t.type === 'warning' ? <AlertTriangle size={14}/> : <Info size={14}/>}
                                </div>
                                <div><p className="text-xs text-gray-700 leading-snug">{t.message}</p><span className="text-[10px] text-gray-400 mt-1 block">{new Date(t.timestamp).toLocaleTimeString()}</span></div>
                            </div>
                        ))}
                    </div>
                    <div className="p-2 bg-gray-50 border-t border-gray-200 text-center"><span className="text-[10px] text-gray-400 font-medium">Sistema Activo & Aprendiendo</span></div>
                </div>
            )}
        </div>
    );
};

// --- BOARD ROW ---
const BoardRow = React.memo(({ row, columns, color, isSelected, onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd, userRole, onOpenComments, index, groupId, onOpenHistory }: any) => {
    const handleCellChange = useCallback((key: string, value: any) => { 
        if (key === "equipo") { const autoDept = detectDepartment(value); if (autoDept && (!row.departamento || row.departamento === "")) onUpdateRow(row.docId, "departamento", autoDept); }
        onUpdateRow(row.docId, key, value); 
    }, [row.docId, row.departamento, onUpdateRow]);
    
    let currentStickyLeft = 40; const checkPermission = (col: Column) => (!col.permissions || col.permissions.length === 0 || col.permissions.includes(userRole));
    const responsibleName = row.nombre || row.assignedTo;
    
    // LÓGICA DE COLOR DE FONDO PERSONALIZADO
    const rowBackgroundColor = useMemo(() => { 
        if (!responsibleName) return isSelected ? "#f0f9ff" : "white"; 
        const userObj = metrologos.find((m: any) => m.name === responsibleName);
        if (userObj && userObj.color) {
             return isSelected ? hexToRgba(userObj.color, 0.25) : hexToRgba(userObj.color, 0.12);
        }
        return stringToColor(responsibleName); 
    }, [responsibleName, isSelected, metrologos]);

    return (
        <div id={`row-${row.docId}`} className="flex border-b border-[#d0d4e4] group transition-colors h-[40px] hover:bg-gray-50/80" draggable="true" onDragStart={(e) => onDragStart(e, { type: 'row', index, id: row.docId, groupId })} onDragOver={(e) => e.preventDefault()} onDragEnd={onDragEnd} onDrop={(e) => { e.stopPropagation(); onDrop(e, { type: 'row', index, id: row.docId, groupId }); }} style={{ backgroundColor: rowBackgroundColor }}>
            <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
            <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4] sticky left-1.5 z-20 flex items-center justify-center" style={{ backgroundColor: rowBackgroundColor }}>
                 <div className="w-full h-full flex items-center justify-center relative group/control">
                    <div className="hidden group-hover/control:flex gap-1 absolute bg-white shadow-lg p-1 rounded-md border border-gray-200 z-50 left-full ml-1">
                        <button onClick={() => onOpenComments(row)} className="p-1 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded" title="Comentarios"><MessageSquare size={14}/></button>
                        <button onClick={() => onOpenHistory(row)} className="p-1 hover:bg-purple-50 text-gray-500 hover:text-purple-600 rounded" title="Historial"><History size={14}/></button>
                    </div>
                    <button onClick={() => onOpenComments(row)} className={clsx("p-1 rounded text-gray-300 hover:text-blue-600 transition-colors", isSelected ? "hidden" : "block")}><MessageSquare size={14} /></button>
                    <div className={clsx("absolute inset-0 items-center justify-center bg-inherit", isSelected ? "flex" : "hidden group-hover/control:flex")}><input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.docId)} className="rounded border-gray-300 text-[#0073ea] cursor-pointer w-4 h-4" /></div>
                 </div>
            </div>
            {columns.filter((c: Column) => !c.hidden).map((col: Column) => {
                const style: React.CSSProperties = { width: col.width };
                if (col.sticky) { style.position = 'sticky'; style.left = currentStickyLeft + 1.5; style.zIndex = 15; style.backgroundColor = rowBackgroundColor; currentStickyLeft += col.width; }
                const canEdit = checkPermission(col);
                let cellValue = row[col.key];
                if (col.key === 'folio') { if (groupId === 'laboratorio') cellValue = row.folioSalida || ""; else cellValue = row.folio || ""; }
                
                if (col.key === 'createdAt') {
                    const isDone = row.status_certificado === 'Generado' || row.status_certificado === 'Firmado' || row.cargado_drive === 'Si' || row.cargado_drive === 'Realizado';
                    return (<div key={col.key} style={style} className={clsx("flex-shrink-0 border-r border-[#d0d4e4] relative flex items-center", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]")}><SLACell createdAt={row.createdAt} isCompleted={isDone} /></div>);
                }

                return (
                    <div key={col.key} style={style} className={clsx("flex-shrink-0 border-r border-[#d0d4e4] relative flex items-center", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]")}>
                        {col.key === 'createdAt' ? <SLACell createdAt={row.createdAt} isCompleted={false} /> :
                         col.type === 'dropdown' ? <DropdownCell value={cellValue} options={col.options!} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         col.type === 'date' ? <DateCell value={cellValue} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         col.type === 'person' ? <PersonCell value={cellValue} metrologos={metrologos} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         col.type === 'client' ? <ClientCell value={cellValue} clientes={clientes} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         <TextCell value={cellValue} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} />}
                    </div>
                );
            })}
             <div className="flex-1 border-b border-transparent min-w-[50px]"></div>
        </div>
    );
});

// --- MENÚ DE OPCIONES DE COLUMNA ---
const ColumnOptions = ({ colKey, onClose, onSort, onHide, onRename, onPermissions, currentLabel, onFilter, uniqueValues }: any) => {
    useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
    return (
        <div className="absolute top-8 right-0 w-60 bg-white shadow-2xl rounded-lg border border-gray-200 z-[80] overflow-hidden animate-in fade-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
             <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">Opciones: {currentLabel}</div>
             <div className="py-1">
                 <button onClick={() => onSort(colKey, 'asc')} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 text-gray-700"><ArrowUpAZ size={14}/> Ordenar Ascendente</button>
                 <button onClick={() => onSort(colKey, 'desc')} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 text-gray-700"><ArrowDownAZ size={14}/> Ordenar Descendente</button>
             </div>
             <div className="border-t border-gray-100 py-1">
                 <div className="px-4 py-2">
                    <span className="text-xs font-bold text-gray-400 uppercase mb-1 block">Filtrar por:</span>
                    <select className="w-full text-xs border border-gray-300 rounded p-1" onChange={(e) => onFilter(colKey, e.target.value)}>
                        <option value="">Todos</option>
                        {uniqueValues.map((v: string) => <option key={v} value={v}>{v || "(Vacío)"}</option>)}
                    </select>
                 </div>
             </div>
             <div className="border-t border-gray-100 py-1">
                 <button onClick={() => onRename(colKey)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 text-gray-700"><Pencil size={14}/> Renombrar columna</button>
                 <button onClick={() => onPermissions(colKey)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm flex items-center gap-2 text-gray-700"><Shield size={14}/> Configuración de permisos</button>
             </div>
             <div className="border-t border-gray-100 py-1">
                 <button onClick={() => onHide(colKey)} className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm flex items-center gap-2 text-red-600"><EyeOff size={14}/> Ocultar columna</button>
             </div>
        </div>
    );
};

const PermissionMenu = ({ x, y, column, onClose, onTogglePermission }: any) => {
    const currentPermissions = column.permissions || [];
    useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
    return (
        <div className="fixed z-[90] bg-white shadow-xl rounded-lg border border-gray-200 w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-100" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center"><span className="text-xs font-bold text-gray-500 uppercase">Permisos de Edición</span><Shield className="w-3 h-3 text-blue-500"/></div>
            <div className="p-1 max-h-60 overflow-y-auto">
                {AVAILABLE_PROFILES.map(profile => {
                    const isAllowed = currentPermissions.includes(profile.id);
                    return (
                        <div key={profile.id} onClick={() => onTogglePermission(profile.id)} className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50 rounded cursor-pointer transition-colors">
                            <div className={clsx("w-4 h-4 border rounded flex items-center justify-center transition-colors shadow-sm", isAllowed ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white")}>{isAllowed && <Check className="w-3 h-3 text-white"/>}</div>
                            <div className="flex items-center gap-2">{profile.type === 'role' ? <Shield className="w-3 h-3 text-orange-500"/> : <Briefcase className="w-3 h-3 text-gray-400"/>}<span className="text-sm text-gray-700">{profile.label}</span></div>
                        </div>
                    );
                })}
            </div>
            <div className="bg-blue-50 px-3 py-2 text-[10px] text-blue-800 border-t border-blue-100 leading-tight">Marca quién puede editar esta columna.</div>
        </div>
    );
};

const HiddenColumnsBar = ({ hiddenColumns, onUnhide }: { hiddenColumns: Column[], onUnhide: (key: string) => void }) => {
    if (hiddenColumns.length === 0) return null;
    return (
        <div className="bg-[#fff9e6] border-b border-[#ffeebb] px-6 py-2 flex items-center gap-3 animate-in slide-in-from-top-2">
            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide flex items-center gap-1"><EyeOff size={12}/> Columnas Ocultas:</span>
            <div className="flex gap-2 flex-wrap">
                {hiddenColumns.map(col => (
                    <button 
                        key={col.key} 
                        onClick={() => onUnhide(col.key)}
                        className="flex items-center gap-1 bg-white border border-orange-200 text-orange-800 px-2 py-0.5 rounded-full text-[10px] hover:bg-orange-50 transition-colors shadow-sm"
                        title="Clic para mostrar"
                    >
                        {col.label} <X size={10} className="text-orange-400"/>
                    </button>
                ))}
            </div>
        </div>
    );
};

const FridayScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    const { user } = useAuth();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [sidebarAbierto, setSidebarAbierto] = useState(false); 
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [userRole, setUserRole] = useState<string>("admin"); 
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
    const [currentUserName, setCurrentUserName] = useState<string>("");

    const [rows, setRows] = useState<WorksheetData[]>([]);
    const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
    const [groupsConfig, setGroupsConfig] = useState<GroupData[]>([
        { id: "sitio", name: "Servicios en Sitio", color: "#0073ea", collapsed: false },
        { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false }
    ]);
    const [metrologos, setMetrologos] = useState<any[]>([]); 
    const [clientes, setClientes] = useState<any[]>([]); 
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const dragItemRef = useRef<DragItem | null>(null); 
    const [isThinking, setIsThinking] = useState(false);
    
    // UI States
    const [permissionMenu, setPermissionMenu] = useState<{ x: number, y: number, colKey: string } | null>(null);
    const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
    const [activeCommentRow, setActiveCommentRow] = useState<WorksheetData | null>(null);
    const [activeHistoryRow, setActiveHistoryRow] = useState<WorksheetData | null>(null);
    const [toasts, setToasts] = useState<any[]>([]);
    const [agBotThoughts, setAgBotThoughts] = useState<AGBotThought[]>([]); 
    const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

    // --- ESTADOS PARA RESIZING ---
    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef<{ startX: number, startWidth: number, key: string } | null>(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const fetchUser = async () => {
            if (user?.email) {
                const q = query(collection(db, "usuarios"), where("email", "==", user.email));
                const snap = await getDocs(q);
                if (!snap.empty) setCurrentUserName(snap.docs[0].data().nombre || user.displayName || "Yo");
                else setCurrentUserName(user.displayName || "Yo");
            }
        };
        fetchUser();
    }, [user]);

    // --- CARGA DE DATOS ---
    useEffect(() => {
        setIsLoadingData(true);
        const unsubBoard = onSnapshot(doc(db, "tableros", "principal"), (snap) => {
            if (snap.exists() && snap.data().columns) {
                const savedCols = snap.data().columns;
                const uniqueKeys = new Set();
                const merged: Column[] = [];

                savedCols.forEach((c: any) => {
                    if (!uniqueKeys.has(c.key)) {
                        const def = DEFAULT_COLUMNS.find(d => d.key === c.key);
                        merged.push({ ...(def || {}), ...c });
                        uniqueKeys.add(c.key);
                    }
                });

                DEFAULT_COLUMNS.forEach(def => {
                    if (!uniqueKeys.has(def.key)) {
                        merged.push(def);
                        uniqueKeys.add(def.key);
                    }
                });
                setColumns(merged);
            } else { setColumns(DEFAULT_COLUMNS); }
        });

        const unsubMetrologos = onSnapshot(query(collection(db, "usuarios"), orderBy("name")), (snap) => {
            setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubClientes = onSnapshot(query(collection(db, "clientes"), orderBy("nombre")), (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        let q;
        if (currentYear === 2025) {
             const start = "2025-01-01T00:00:00";
             const end = "2025-12-31T23:59:59";
             q = query(collection(db, "hojasDeTrabajo"), where("createdAt", ">=", start), where("createdAt", "<=", end), orderBy("createdAt", "desc"));
        } else {
             const start = "2026-01-01T00:00:00";
             const end = "2026-12-31T23:59:59";
             q = query(collection(db, "hojasDeTrabajo"), where("createdAt", ">=", start), where("createdAt", "<=", end), orderBy("createdAt", "desc"));
        }

        const unsubRows = onSnapshot(q, (snapshot) => {
            let newRows: WorksheetData[] = [];
            snapshot.forEach(doc => { 
                const data = doc.data();
                newRows.push({ 
                    ...data, 
                    docId: doc.id, 
                    id: data.id || "", 
                    nombre: data.nombre || data.assignedTo, 
                    fecha: data.fecha || data.fecha_calib,
                    cargado_drive: data.cargado_drive || "No",
                    status_certificado: data.status_certificado || "Pendiente de Certificado",
                    entregado: data.entregado === true,
                    folioSalida: data.folioSalida 
                } as WorksheetData); 
            });
            setRows(newRows);
            setIsLoadingData(false);
        });

        return () => { unsubBoard(); unsubMetrologos(); unsubRows(); unsubClientes(); };
    }, [currentYear]); 

    // --- CEREBRO DE I.A. (AG-Bot Core) ---
    useEffect(() => {
        if (isLoadingData || rows.length === 0) return;

        const runAGBot = async () => {
            const batch = writeBatch(db);
            let updateCount = 0;
            const currentHour = new Date().getHours();
            const isNightMode = currentHour >= 19;
            const newThoughts: AGBotThought[] = [];

            const electCount = rows.filter(r => r.departamento === 'Eléctrica').length;
            if(electCount > rows.length * 0.4 && Math.random() > 0.95) {
                 newThoughts.push({id: Date.now(), type: 'info', message: `Carga alta en Eléctrica detectada (${electCount} equipos).`, timestamp: new Date().toISOString()});
            }

            rows.forEach(row => {
                let needsUpdate = false;
                const updates: any = {};

                if (!row.departamento || row.departamento === "") {
                    const detected = detectDepartment(row.equipo || "");
                    if (detected) {
                        updates.departamento = detected;
                        needsUpdate = true;
                    }
                }
                
                if ((!row.marca || row.marca === "") && row.modelo) {
                    const inferredBrand = inferBrand(row.modelo);
                    if (inferredBrand) {
                        updates.marca = inferredBrand;
                        needsUpdate = true;
                    }
                }

                if (row.folio && row.folio !== row.folio.trim().toUpperCase()) {
                    updates.folio = row.folio.trim().toUpperCase();
                    needsUpdate = true;
                }
                if (row.cliente && row.cliente !== row.cliente.trim().toUpperCase()) {
                    updates.cliente = row.cliente.trim().toUpperCase();
                    needsUpdate = true;
                }

                const driveStatus = (row.cargado_drive || "").toLowerCase();
                const isDriveDone = driveStatus === 'si' || driveStatus === 'realizado';
                if (isDriveDone && (row.status_certificado === 'Pendiente de Certificado' || row.status_certificado === '')) {
                    updates.status_certificado = 'Generado';
                    needsUpdate = true;
                    showToast(`🤖 AG-Bot: Certificado generado para ${row.folio}`, 'success');
                    newThoughts.push({id: Date.now(), type: 'success', message: `Certificado generado automáticamente para ${row.folio}`, timestamp: new Date().toISOString()});
                }

                if (row.status_equipo === 'Rechazado' && row.status_certificado === 'Generado') {
                    updates.status_certificado = 'N/A';
                    needsUpdate = true;
                    showToast(`🤖 AG-Bot: Corrección lógica aplicada a ${row.folio}`, 'info');
                }

                if (row.lugarCalibracion === 'sitio') {
                    if (row.status_equipo !== 'Calibrado') { updates.status_equipo = 'Calibrado'; needsUpdate = true; }
                    if (row.ubicacion_real !== 'Servicio en Sitio') { updates.ubicacion_real = 'Servicio en Sitio'; needsUpdate = true; }
                }
                if (row.lugarCalibracion === 'laboratorio') {
                    if (row.entregado === true && row.ubicacion_real !== 'Entregado') { updates.ubicacion_real = 'Entregado'; needsUpdate = true; }
                    else if (!row.entregado && (!row.ubicacion_real || row.ubicacion_real === "")) { updates.ubicacion_real = 'Laboratorio'; needsUpdate = true; }
                }

                if (isNightMode) {
                    if (!row.status_equipo) { updates.status_equipo = "Desconocido"; needsUpdate = true; }
                    if (!row.cargado_drive) { updates.cargado_drive = "No"; needsUpdate = true; }
                }
                
                if (row.fecha && row.status_equipo === 'En Revisión') {
                    updates.status_equipo = 'Calibrado';
                    needsUpdate = true;
                    showToast(`🤖 AG-Bot: Equipo ${row.folio} marcado como Calibrado`, 'success');
                }

                if (needsUpdate) {
                    const rowRef = doc(db, "hojasDeTrabajo", row.docId);
                    updates.lastUpdated = new Date().toISOString(); 
                    batch.update(rowRef, updates);
                    updateCount++;
                }
            });

            if (newThoughts.length > 0) setAgBotThoughts(prev => [...newThoughts, ...prev].slice(0, 10));

            if (updateCount > 0) {
                setIsThinking(true);
                await batch.commit();
                setTimeout(() => setIsThinking(false), 1000);
            }
        };

        const timer = setTimeout(runAGBot, 2000);
        return () => clearTimeout(timer);

    }, [rows, isLoadingData]); 

    const showToast = (message: string, type: 'success' | 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

    const handleSort = (key: string, direction: 'asc' | 'desc') => {
        setSortConfig({ key, direction });
        setActiveColumnMenu(null);
    };

    const handleHide = async (key: string) => {
        const newCols = columns.map(c => c.key === key ? { ...c, hidden: true } : c);
        setColumns(newCols);
        setActiveColumnMenu(null);
        await setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
    };

    const handleUnhide = async (key: string) => {
        const newCols = columns.map(c => c.key === key ? { ...c, hidden: false } : c);
        setColumns(newCols);
        await setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
    };

    const handleResetLayout = async () => {
        if(confirm("¿Restablecer vista original? (Aparecerá ID y todo por defecto)")) {
             setColumns(DEFAULT_COLUMNS);
             await setDoc(doc(db, "tableros", "principal"), { columns: DEFAULT_COLUMNS });
        }
    };

    const handleRename = async (key: string) => {
        const newName = prompt("Nuevo nombre:");
        if (newName) {
            const newCols = columns.map(c => c.key === key ? { ...c, label: newName } : c);
            setColumns(newCols);
            await setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
        }
        setActiveColumnMenu(null);
    };

    const handleAddColumn = async () => {
        const name = prompt("Nombre de la nueva columna:");
        if (!name) return;
        const newKey = `col_${Date.now()}`;
        const newCol: Column = { key: newKey, label: name, type: 'text', width: 150 };
        const newColumns = [...columns, newCol];
        setColumns(newColumns); 
        await setDoc(doc(db, "tableros", "principal"), { columns: newColumns }, { merge: true });
    };
    
    const handleFilter = (key: string, value: string) => {
        setActiveFilters(prev => ({ ...prev, [key]: value }));
        setActiveColumnMenu(null);
    };

    const handleExportCSV = () => {
        const headers = columns.filter(c => !c.hidden).map(c => c.label).join(",");
        const csvRows = groupedRows.flatMap(group => group.rows).map(row => {
            return columns.filter(c => !c.hidden).map(c => {
                let val = row[c.key] || "";
                if(c.key === 'folio' && row.lugarCalibracion === 'laboratorio') val = row.folioSalida || "";
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(",");
        }).join("\n");
        
        const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + csvRows;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `tablero_${currentYear}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    const handleOpenPermissions = (e: any, key: string) => {
        setPermissionMenu({ x: e.clientX, y: e.clientY, colKey: key });
        setActiveColumnMenu(null);
    };

    const handleTogglePermission = async (roleId: string) => {
        if (!permissionMenu) return;
        const targetCol = columns.find(c => c.key === permissionMenu.colKey);
        if (!targetCol) return;
        let currentPerms = targetCol.permissions || [];
        if (currentPerms.includes(roleId)) currentPerms = currentPerms.filter(p => p !== roleId);
        else currentPerms = [...currentPerms, roleId];
        const newCols = columns.map(c => c.key === permissionMenu.colKey ? { ...c, permissions: currentPerms } : c);
        setColumns(newCols);
        await setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
    };

    const handleAddRow = useCallback(async (groupId: string) => {
        const docRef = doc(collection(db, "hojasDeTrabajo"));
        let initialStatus = 'Desconocido';
        let initialLocation = '';

        if (groupId === 'sitio') {
            initialStatus = 'Calibrado';
            initialLocation = 'Servicio en Sitio';
        } else if (groupId === 'laboratorio') {
            initialLocation = 'Laboratorio';
        }

        const newRowData = {
            id: "", folio: "", cliente: "", equipo: "", 
            lugarCalibracion: groupId, 
            status_equipo: initialStatus, 
            ubicacion_real: initialLocation,
            nombre: currentUserName, assignedTo: currentUserName, 
            createdAt: new Date().toISOString(), status_certificado: 'Pendiente de Certificado'
        };
        await setDoc(docRef, newRowData);
        showToast("Fila agregada correctamente", 'success');
    }, [currentUserName]);

    // --- MANEJO DE ACTUALIZACIONES (CON MAGIA DE GRUPOS) ---
    const handleUpdateRow = useCallback(async (rowId: string, key: string, value: any) => {
        // 1. Optimistic Update (UI Inmediata)
        setRows(prevRows => prevRows.map(r => {
            if (r.docId === rowId) {
                const updated = { ...r, [key]: value };
                
                // --- LÓGICA DE SALTO DE GRUPO ---
                if (key === "ubicacion_real") {
                    if (value === "Servicio en Sitio") updated.lugarCalibracion = "sitio";
                    if (value === "Laboratorio") updated.lugarCalibracion = "laboratorio";
                    if (value === "Recepción") updated.lugarCalibracion = "laboratorio";
                }
                return updated;
            }
            return r;
        }));
        
        // 2. Preparar batch para Firebase
        const batch = writeBatch(db);
        const rowRef = doc(db, "hojasDeTrabajo", rowId);
        
        let updates: any = { [key]: value, lastUpdated: new Date().toISOString() };

        // --- SINCRONIZACIÓN CON DB ---
        if (key === "ubicacion_real") {
            if (value === "Servicio en Sitio") updates.lugarCalibracion = "sitio";
            else if (value === "Laboratorio" || value === "Recepción") updates.lugarCalibracion = "laboratorio";
        }

        batch.update(rowRef, updates);
        
        // Historial
        const oldValue = rows.find(r => r.docId === rowId)?.[key];
        const historyRef = collection(db, `hojasDeTrabajo/${rowId}/history`);
        const historyDoc = doc(historyRef);
        batch.set(historyDoc, {
            field: key,
            oldValue: oldValue || "",
            newValue: value,
            user: currentUserName,
            timestamp: new Date().toISOString()
        });

        await batch.commit();
        showToast("Cambio guardado", 'success');
    }, [rows, currentUserName]);

    const handleDeleteSelected = async () => {
        if (!confirm(`¿Eliminar ${selectedIds.size} elementos?`)) return; 
        const batch = writeBatch(db);
        selectedIds.forEach(id => { batch.delete(doc(db, "hojasDeTrabajo", id)); });
        setSelectedIds(new Set());
        await batch.commit();
        showToast("Elementos eliminados", 'success');
    };

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    }, []);

    // --- FUNCIONES DE RESIZING (MONDAY STYLE) ---
    const startResize = (e: React.MouseEvent, colKey: string, currentWidth: number) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizingRef.current = { startX: e.clientX, startWidth: currentWidth, key: colKey };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingRef.current) return;
        const { startX, startWidth, key } = resizingRef.current;
        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff); 

        setColumns(prevCols => prevCols.map(col => 
            col.key === key ? { ...col, width: newWidth } : col
        ));
    }, []);

    const handleMouseUp = useCallback(async () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Guardar configuración en Firebase
        if (resizingRef.current) {
            // NOTA: Aquí accedemos al estado más reciente de columns via setColumns callback o ref si fuera necesario.
            // Para simplificar, guardamos la actualización "ciega" basada en el último render o esperamos.
            // En React 18+ batching ayuda. Lo ideal es guardar el estado actual de columns.
            // Aquí usamos un pequeño hack: esperar al re-render o guardar manualmente.
            // Para asegurar persistencia, guardaremos el estado actual `columns` en el próximo ciclo o directamente aquí si tenemos acceso.
        }
        resizingRef.current = null;
    }, []);

    // Efecto para guardar columnas cuando termina el resize
    useEffect(() => {
        if (!isResizing && resizingRef.current === null) {
            // Guardar solo si hubo cambios significativos, o periódicamente. 
            // Para simplicidad, guardamos siempre que isResizing cambia a false.
            const saveColumns = async () => {
                 await setDoc(doc(db, "tableros", "principal"), { columns: columns }, { merge: true });
            };
            saveColumns();
        }
    }, [isResizing, columns]);


    const onDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
        if (item.type === 'column' && columns[item.index].sticky) { e.preventDefault(); return; }
        dragItemRef.current = item;
        e.dataTransfer.effectAllowed = "move";
        if (e.target instanceof HTMLElement) e.target.style.opacity = '0.5';
    }, [columns]);

    const onDragEnd = (e: React.DragEvent) => {
        if (e.target instanceof HTMLElement) e.target.style.opacity = '1';
        dragItemRef.current = null;
    };

    const onDrop = useCallback(async (e: React.DragEvent, target: DragItem) => {
        e.preventDefault();
        const dragItem = dragItemRef.current;
        if (!dragItem) return;

        if (dragItem.type === 'column' && target.type === 'column') {
             const fromIdx = dragItem.index;
             const toIdx = target.index;
             if(columns[toIdx].sticky || columns[fromIdx].sticky) return;
             
             let newCols = [...columns];
             const [moved] = newCols.splice(fromIdx, 1);
             newCols.splice(toIdx, 0, moved);
             
             setColumns(newCols);
             setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
        }
    }, [columns]); 

    // --- BUSCADOR ULTRA ROBUSTO ---
    const groupedRows = useMemo(() => {
        let filtered = rows.filter(r => {
            if (search) {
                const s = search.toLowerCase();
                const matches = (
                    (r.cliente || "").toLowerCase().includes(s) || 
                    (r.folio || "").toLowerCase().includes(s) || 
                    (r.equipo || "").toLowerCase().includes(s) ||
                    (r.id || "").toLowerCase().includes(s) ||
                    (r.marca || "").toLowerCase().includes(s) ||
                    (r.modelo || "").toLowerCase().includes(s) ||
                    (r.serie || "").toLowerCase().includes(s) ||
                    (r.nombre || "").toLowerCase().includes(s) ||
                    (r.assignedTo || "").toLowerCase().includes(s) ||
                    (r.folioSalida || "").toLowerCase().includes(s) 
                );
                if (!matches) return false;
            }
            for (const [key, val] of Object.entries(activeFilters)) {
                if (val && r[key] !== val) return false;
            }
            return true;
        });

        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const valA = a[sortConfig.key!] || "";
                const valB = b[sortConfig.key!] || "";
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return groupsConfig.map(group => ({
            ...group,
            rows: filtered.filter(r => (r.lugarCalibracion || "").toLowerCase() === group.id)
        }));
    }, [rows, groupsConfig, search, sortConfig, activeFilters]);

    let headerStickyOffset = 40; 
    const hiddenColumns = columns.filter(c => c.hidden);

    return (
        <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338] overflow-hidden">
             <div className={clsx("flex-shrink-0 bg-white h-full z-50 transition-all duration-300 ease-in-out overflow-hidden border-r border-[#d0d4e4]", sidebarAbierto ? "w-64 opacity-100" : "w-0 opacity-0 border-none")}>
                <div className="w-64 h-full"><SidebarFriday onNavigate={navigateTo} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} /></div>
             </div>
             {isMobile && sidebarAbierto && (<div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarAbierto(false)}></div>)}

            <div className="flex-1 flex flex-col min-w-0 bg-white relative transition-all duration-300">
                <div className="px-6 py-4 border-b border-[#d0d4e4] flex justify-between items-center bg-white sticky top-0 z-40 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSidebarAbierto(!sidebarAbierto)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"><Menu className="w-6 h-6"/></button>
                            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="Regresar al Menú"><ArrowLeft className="w-6 h-6"/></button>
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold leading-tight flex items-center gap-2 text-gray-800">
                                Tablero Principal 
                                <div className="inline-flex bg-gray-100 rounded-lg p-1 ml-3 border border-gray-200">
                                    <button onClick={() => setCurrentYear(2025)} className={clsx("px-3 py-0.5 rounded-md text-xs font-bold transition-all", currentYear === 2025 ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}>2025</button>
                                    <button onClick={() => setCurrentYear(2026)} className={clsx("px-3 py-0.5 rounded-md text-xs font-bold transition-all", currentYear === 2026 ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}>2026</button>
                                </div>
                            </h1>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input placeholder="Buscar todo..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none hover:shadow-sm transition-shadow bg-gray-50 w-64" value={search} onChange={e => setSearch(e.target.value)} /></div>
                        
                        <div className={clsx("p-2 rounded-lg transition-all", isThinking ? "text-purple-600 bg-purple-50 animate-pulse" : "text-gray-400")} title="AG-Bot Activo">
                            <Brain size={18}/>
                        </div>

                        <AGBotWidget thoughts={agBotThoughts} />

                        <button onClick={handleExportCSV} className="p-2 text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors flex items-center gap-2" title="Exportar a Excel"><Download size={18}/><span className="text-xs font-bold hidden md:inline">Exportar</span></button>
                        <button onClick={handleResetLayout} className="p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 rounded-lg transition-colors" title="Restablecer vista original"><RotateCcw size={18}/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white" id="main-board-scroll">
                    <div className="inline-block min-w-full pb-32">
                        <HiddenColumnsBar hiddenColumns={hiddenColumns} onUnhide={handleUnhide} />

                        <div className="flex border-b border-[#d0d4e4] sticky top-0 z-30 bg-white shadow-sm h-[36px]">
                            <div className="w-1.5 bg-white sticky left-0 z-30"></div>
                            <div className="w-[40px] border-r border-[#d0d4e4] bg-white sticky left-1.5 z-30 flex items-center justify-center"><input type="checkbox" className="rounded border-gray-300" /></div>
                            
                            {columns.filter(c => !c.hidden).map((col, index) => {
                                const style: React.CSSProperties = { width: col.width, zIndex: col.sticky ? 30 : undefined };
                                if (col.sticky) { style.position = 'sticky'; style.left = headerStickyOffset + 1.5; headerStickyOffset += col.width; }
                                const isLocked = col.permissions && col.permissions.length > 0 && !col.permissions.includes(userRole);
                                return (
                                <div 
                                    key={col.key} 
                                    draggable={!col.sticky && !isResizing} // PREVIENE CONFLICTO DRAG vs RESIZE
                                    onDragStart={(e) => onDragStart(e, { type: 'column', index })} 
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragEnd={onDragEnd} 
                                    onDrop={(e) => onDrop(e, { type: 'column', index })} 
                                    style={style} 
                                    className={clsx("px-2 text-[11px] font-bold text-gray-500 flex items-center justify-center border-r border-transparent hover:bg-gray-50 select-none bg-white group hover:text-gray-800 transition-colors uppercase tracking-wide relative", col.sticky ? "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]" : "cursor-pointer")}
                                >
                                    <span className="truncate flex items-center gap-1 flex-1 justify-center">
                                        {col.label} {isLocked && <Lock className="w-2.5 h-2.5 text-gray-300" />}
                                        {activeFilters[col.key] && <Filter size={10} className="text-blue-500 fill-blue-500"/>}
                                    </span>
                                    <button onClick={(e) => { e.stopPropagation(); setActiveColumnMenu(activeColumnMenu === col.key ? null : col.key); }} className="p-0.5 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1">
                                        <MoreHorizontal className="w-3 h-3 text-gray-500" />
                                    </button>
                                    
                                    {/* --- RESIZER MONDAY STYLE --- */}
                                    {!col.sticky && (
                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-50 transition-colors opacity-0 hover:opacity-100"
                                            onMouseDown={(e) => startResize(e, col.key, col.width)}
                                            onClick={(e) => e.stopPropagation()}
                                        ></div>
                                    )}

                                    {activeColumnMenu === col.key && (
                                        <ColumnOptions 
                                            colKey={col.key} 
                                            currentLabel={col.label} 
                                            uniqueValues={[...new Set(rows.map(r => r[col.key] || ""))].sort()}
                                            onClose={() => setActiveColumnMenu(null)} 
                                            onSort={handleSort} 
                                            onHide={handleHide} 
                                            onRename={handleRename} 
                                            onFilter={handleFilter}
                                            onPermissions={(k:string) => handleOpenPermissions(window.event, k)}
                                        />
                                    )}
                                </div>
                            )})}
                            <div className="px-2 border-r border-transparent flex items-center justify-center cursor-pointer hover:bg-gray-50 group transition-colors" onClick={handleAddColumn} title="Agregar columna">
                                <Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <div className="flex-1 border-b border-gray-100 min-w-[50px]"></div>
                        </div>

                        <div className="px-4 mt-6">
                            {isLoadingData ? <div className="p-10 text-center text-gray-400">Cargando tablero...</div> : (
                                groupedRows.map((group) => (
                                    <div key={group.id} className="mb-10">
                                        <div className="flex items-center mb-2 group sticky left-0 z-10 p-2 rounded hover:bg-gray-50 transition-colors">
                                            <ChevronDown className={clsx("w-5 h-5 transition-transform cursor-pointer p-0.5 rounded hover:bg-gray-200", group.collapsed && "-rotate-90")} style={{ color: group.color }} onClick={() => { const newConf = groupsConfig.map(g => g.id === group.id ? {...g, collapsed: !g.collapsed} : g); setGroupsConfig(newConf); }}/>
                                            <h2 className="text-lg font-medium ml-2 px-1 text-gray-800" style={{ color: group.color }}>{group.name}</h2>
                                            <span className="ml-3 text-xs text-gray-400 font-light border border-gray-200 px-2 py-0.5 rounded-full">{group.rows.length}</span>
                                        </div>
                                        {!group.collapsed && (
                                            <div className="shadow-sm rounded-tr-md rounded-tl-md overflow-hidden border-l border-t border-r border-[#d0d4e4] min-h-[50px]">
                                                {group.rows.map((row, rIndex) => (
                                                    <BoardRow 
                                                        key={row.docId} 
                                                        row={row} 
                                                        index={rIndex}
                                                        groupId={group.id}
                                                        columns={columns} 
                                                        color={group.color} 
                                                        isSelected={selectedIds.has(row.docId)} 
                                                        onToggleSelect={toggleSelect} 
                                                        onUpdateRow={handleUpdateRow} 
                                                        metrologos={metrologos} 
                                                        clientes={clientes} 
                                                        onDragStart={onDragStart} 
                                                        onDrop={onDrop} 
                                                        onDragEnd={onDragEnd} 
                                                        userRole={userRole} 
                                                        onOpenComments={setActiveCommentRow}
                                                        onOpenHistory={setActiveHistoryRow}
                                                    />
                                                ))}
                                                <div className="flex h-[40px] border-b border-[#d0d4e4] bg-white group hover:bg-gray-50">
                                                    <div className="sticky left-0 z-20 flex bg-white group-hover:bg-gray-50">
                                                        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }}></div>
                                                        <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4]"></div>
                                                        {columns.filter(c => c.sticky && !c.hidden).map(c => ( <div key={c.key} style={{width: c.width}} className="border-r border-[#d0d4e4] flex-shrink-0"></div> ))}
                                                    </div>
                                                    <div className="flex-1 flex items-center px-2 relative">
                                                        <input type="text" placeholder="+ Nuevo Equipo" className="outline-none text-sm w-[200px] h-full placeholder-gray-400 bg-transparent absolute left-2" onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRow(group.id); (e.target as HTMLInputElement).value = ''; } }} />
                                                        <button onClick={() => handleAddRow(group.id)} className="ml-[200px] text-xs bg-blue-600 text-white px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity font-medium shadow-sm">Agregar</button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {selectedIds.size > 0 && (
                   <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-2xl rounded-lg border border-gray-200 px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
                       <div className="flex items-center gap-3 border-r border-gray-200 pr-6"><div className="bg-[#0073ea] text-white text-xs font-bold w-6 h-6 rounded flex items-center justify-center">{selectedIds.size}</div><span className="text-sm font-medium text-gray-700">Seleccionados</span></div>
                       <button onClick={handleDeleteSelected} className="flex flex-col items-center gap-1 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /><span className="text-[10px]">Eliminar</span></button>
                       <button onClick={() => setSelectedIds(new Set())} className="ml-2 hover:bg-gray-100 p-1 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                   </div>
                )}

                {permissionMenu && (<PermissionMenu x={permissionMenu.x} y={permissionMenu.y} column={columns.find(c => c.key === permissionMenu.colKey)!} onClose={() => setPermissionMenu(null)} onTogglePermission={handleTogglePermission}/>)}
                {activeCommentRow && (<CommentsPanel row={activeCommentRow} onClose={() => setActiveCommentRow(null)} />)}
                {activeHistoryRow && (<HistoryPanel row={activeHistoryRow} onClose={() => setActiveHistoryRow(null)} />)}
                <ToastContainer toasts={toasts} removeToast={removeToast} />
            </div>
        </div>
    );
};

export default FridayScreen;