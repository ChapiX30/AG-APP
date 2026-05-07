import React, { useState, useEffect, useCallback, useRef, useMemo, useTransition, useDeferredValue } from "react";
import {
  Plus, Trash2, ChevronDown, Search, 
  UserCircle, Calendar, X, 
  Building2, ArrowLeft,
  Lock, Shield, Check, Briefcase, 
  MessageSquare, Send, Clock, AlertTriangle, AlertCircle,
  MoreHorizontal, ArrowUpAZ, ArrowDownAZ, EyeOff, Pencil,
  RotateCcw, Brain, Download, Filter, History, CheckCircle, Info,
  Menu, Users
} from "lucide-react";
import { db } from "../utils/firebase";
import { doc, collection, query, where, onSnapshot, setDoc, writeBatch, orderBy, addDoc, getDocs } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from "../hooks/useAuth"; 

// --- TIPOS ---
type CellType = "text" | "number" | "dropdown" | "date" | "person" | "client" | "sla_manual";

// --- UTILIDADES DE COLOR ---
const hexToRgba = (hex: string, alpha: number) => {
    if (!hex) return `rgba(255, 255, 255, 1)`;
    let c: any;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        c = '0x' + c.join('');
        return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
    }
    return hex;
};

const stringToColor = (str: string) => {
    if (!str) return "#ffffff";
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 96%)`;
};

// --- FIX FECHAS 2025/2026 ---
const extractYear = (dateValue: any, fallbackYear: string): string => {
    if (!dateValue) return fallbackYear;
    if (typeof dateValue === 'object' && typeof dateValue.toDate === 'function') return dateValue.toDate().getFullYear().toString();
    if (typeof dateValue === 'string' && dateValue.length >= 4) return dateValue.substring(0, 4);
    if (dateValue instanceof Date) return dateValue.getFullYear().toString();
    return fallbackYear;
};

// --- MÓDULO 1: CEREBRO DEPARTAMENTAL (AG-Bot Core) ---
const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
    "Eléctrica": ["multimetro", "fuente", "poder", "carga", "electrica", "electronica", "resistencia", "decada", "capacitancia", "inductancia", "osciloscopio", "pinza", "amperimetro", "voltimetro", "vatimetro", "aislamiento", "tierra", "analizador", "espectro", "señal", "multimeter", "source", "supply", "power", "load", "electronic", "resistance", "decade", "capacitance", "inductance", "lcr", "oscilloscope", "scope", "clamp", "ammeter", "voltmeter", "wattmeter", "insulation", "ground", "analyzer", "spectrum", "signal", "hypot", "hi-pot", "usb", "dmm"],
    "Dimensional": ["vernier", "calibrador", "pie de rey", "micrometro", "regla", "cinta", "flexometro", "medidor", "altura", "profundidad", "comparador", "optico", "vision", "perno", "indicador", "caratula", "bloque", "patron", "anillo", "tapon", "rosca", "lupa", "microscopio", "caliper", "micrometer", "ruler", "tape", "measure", "height", "depth", "comparator", "optical", "vision", "pin", "plug", "indicator", "dial", "gauge block", "gage block", "block", "master", "ring", "thread", "scope", "magnifier", "projector"],
    "Mecánica": ["dinamometro", "torquimetro", "torque", "manometro", "presion", "vacio", "balanza", "bascula", "peso", "masa", "fuerza", "celda", "flujometro", "flujo", "controlador", "hot", "dispenser", "báscula", "smar track", "transductor de presión", "temperatura", "termómetro", "termopar", "durometro", "dureza", "tacometro", "dynamometer", "force", "conductivity", "timer", "Cronometro", "gauge", "gage", "wrench", "driver", "manometer", "pressure", "vacuum", "balance", "scale", "weight", "mass", "load cell", "cell", "flow", "controller", "temperature", "thermometer", "regulator", "thermocouple", "hardness", "durometer", "tachometer"]
};

const BRAND_INFERENCE: Record<string, string> = {
    "87v": "FLUKE", "179": "FLUKE", "789": "FLUKE", "1587": "FLUKE", "mitutoyo": "MITUTOYO", "500-196": "MITUTOYO", "293-340": "MITUTOYO", "cd-6": "MITUTOYO", "id-c": "MITUTOYO", "tektronix": "TEKTRONIX", "tds": "TEKTRONIX", "mdo": "TEKTRONIX", "keysight": "KEYSIGHT", "agilent": "KEYSIGHT", "34401a": "KEYSIGHT", "starrett": "STARRETT", "798": "STARRETT", "chroma": "CHROMA", "66202": "CHROMA", "klein": "KLEIN TOOLS", "cl800": "KLEIN TOOLS", "flexometro": "STANLEY", "cinta": "STANLEY"
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
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    else if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return "?";
};

const AVAILABLE_PROFILES = [
    { id: 'admin', label: 'Administrador', type: 'role' }, 
    { id: 'metrologo', label: 'Metrólogo', type: 'puesto' },
    { id: 'calidad', label: 'Calidad', type: 'puesto' },
    { id: 'logistica', label: 'Logística', type: 'puesto' },
    { id: 'ventas', label: 'Ventas', type: 'puesto' }
];

interface Column { key: string; label: string; type: CellType; width: number; hidden?: boolean; options?: string[]; sticky?: boolean; permissions?: string[]; }
interface WorksheetData { docId: string; id: string; createdAt: string; lugarCalibracion: string; assignedTo?: string; nombre?: string; fecha?: string; fechaEntrada?: string; fechaRecepcion?: string; diasPromesa?: number; cargado_drive?: string; entregado?: boolean; folioSalida?: string; [key: string]: any; }
interface GroupData { id: string; name: string; color: string; collapsed: boolean; }
interface DragItem { type: 'row' | 'column'; index: number; id?: string; groupId?: string; }
interface AGBotThought { id: number; type: 'info' | 'warning' | 'success'; message: string; timestamp: string; }

const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  "Desconocido": { label: "Desconocido", bg: "#c4c4c4" }, "En Revisión": { label: "En Revisión", bg: "#fdab3d" }, "Calibrado": { label: "Calibrado", bg: "#00c875" }, "Rechazado": { label: "Rechazado", bg: "#e2445c" }, "Pendiente de Certificado": { label: "Pendiente Cert.", bg: "#0086c0" }, "Generado": { label: "Generado", bg: "#a25ddc" }, "Firmado": { label: "Firmado", bg: "#00c875" }, "Servicio en Sitio": { label: "Servicio en Sitio", bg: "#a25ddc" }, "Laboratorio": { label: "Laboratorio", bg: "#579bfc" }, "Recepción": { label: "Recepción", bg: "#fdab3d" }, "Entregado": { label: "Entregado", bg: "#00c875" }, "No": { label: "No", bg: "#e2445c" }, "Si": { label: "Si", bg: "#00c875" }, "Realizado": { label: "Realizado", bg: "#00c875" }, "Mecánica": { label: "Mecánica", bg: "#1565c0" }, "Dimensional": { label: "Dimensional", bg: "#00897b" }, "Eléctrica": { label: "Eléctrica", bg: "#ff8f00" }
};

const DEFAULT_COLUMNS: Column[] = [
  { key: 'folio', label: 'Folio', width: 80, type: "text", sticky: true, permissions: ['admin', 'ventas'] }, 
  { key: 'cliente', label: 'Cliente', width: 200, type: "client", permissions: ['admin', 'ventas', 'logistica'] },
  { key: 'equipo', label: 'Equipo', width: 180, type: "text", permissions: ['admin', 'metrologo'] },
  { key: 'fechaEntrada', label: 'F. Entrada', width: 130, type: "date", permissions: ['admin', 'logistica', 'ventas'] },
  { key: 'diasPromesa', label: 'Cronograma (SLA)', width: 140, type: "sla_manual" }, 
  { key: 'id', label: 'ID Interno', width: 100, type: "text", permissions: ['admin', 'metrologo'] }, 
  { key: 'marca', label: 'Marca', width: 120, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 120, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
  { key: 'nombre', label: 'Responsable', width: 120, type: "person", permissions: ['admin', 'logistica'] }, 
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

// --- CELDAS UI MONDAY.COM ---
const EditableSLACell = React.memo(({ days, startDate, onChange, isCompleted, disabled }: { days: number, startDate: string, onChange: (val: number) => void, isCompleted: boolean, disabled: boolean }) => {
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    if (isCompleted && !isEditing) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-[#cce5ff]/30 p-1" onClick={() => !disabled && setIsEditing(true)}>
                <div className="w-full h-full flex items-center justify-center rounded-[2px] bg-[#0086c0] text-white shadow-sm transition-all hover:opacity-90">
                    <div className="flex items-center gap-1 text-[12px] font-normal leading-none"><CheckCircle size={12} /> Completado</div>
                </div>
            </div>
        );
    }

    if (isEditing) {
        return (
            <input ref={inputRef} autoFocus type="number" defaultValue={days} onBlur={(e) => { setIsEditing(false); onChange(Number(e.target.value)); }} onKeyDown={(e) => { if(e.key === 'Enter') { setIsEditing(false); onChange(Number((e.target as HTMLInputElement).value)); }}} className="w-full h-full text-center text-[13px] text-[#323338] bg-white outline-none border-[1.5px] border-[#0073ea] rounded-sm" />
        );
    }

    if (!startDate) return <div className="text-[#c4c4c4] text-[13px] text-center w-full">-</div>;

    const start = new Date(startDate + 'T00:00:00'); 
    const deadline = addBusinessDays(start, days || 0); 
    const now = new Date(); now.setHours(0,0,0,0); 
    
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let bgClass = "bg-[#00c875]"; let label = `${diffDays} días`;
    if (diffDays <= 2 && diffDays > 0) bgClass = "bg-[#fdab3d]"; 
    else if (diffDays === 0) { bgClass = "bg-[#e2445c]"; label = "Hoy"; } 
    else if (diffDays < 0) { bgClass = "bg-[#333333]"; label = `Vencido`; }

    return (
        <div className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-[#f5f6f8] p-1" onClick={() => !disabled && setIsEditing(true)}>
            <div className={clsx("flex flex-col items-center justify-center w-full h-full rounded-[2px] text-white overflow-hidden relative shadow-sm hover:opacity-90 transition-opacity", bgClass)}>
                <span className="text-[12px] font-normal leading-none mt-0.5">{label}</span>
                <span className="text-[10px] opacity-90 leading-none mt-1">{deadline.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}</span>
                <div className="absolute top-0 left-0 h-full w-[4px] bg-black/15"></div>
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
    <input ref={inputRef} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => { if(e.key === 'Enter') inputRef.current?.blur(); }} placeholder={placeholder} disabled={disabled} className="w-full h-full px-3 bg-transparent outline-none focus:bg-white focus:ring-[1.5px] focus:ring-[#0073ea] focus:z-10 transition-all text-[13px] truncate placeholder-[#c4c4c4] text-[#323338] disabled:cursor-not-allowed" />
  );
});

const DropdownCell = React.memo(({ value, options, onChange, disabled }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const configItem = STATUS_CONFIG[value] || { label: value || "-", bg: "#c4c4c4" };
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false); };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (opt: string, e: React.MouseEvent) => { e.stopPropagation(); onChange(opt); setIsOpen(false); };

  if (disabled) {
      return (
        <div className="w-full h-full flex items-center justify-center opacity-70 cursor-not-allowed p-[2px]">
            <div className="w-[98%] h-full rounded-[2px] text-white text-[13px] flex items-center justify-center gap-1 shadow-sm relative overflow-hidden" style={{ backgroundColor: configItem.bg }}>
                 <span className="truncate px-1 text-center font-normal">{configItem.label}</span>
                 <div className="absolute right-1 top-1 text-white/70"><Lock size={10}/></div>
            </div>
        </div>
      );
  }

  return (
    <div className="w-full h-full relative p-[2px]" ref={containerRef}>
      <div className="w-full h-full flex items-center justify-center text-white text-[13px] cursor-pointer hover:opacity-90 relative transition-all shadow-sm rounded-[2px]" style={{ backgroundColor: configItem.bg }} onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
         <span className="truncate px-1 text-center font-normal">{configItem.label}</span>
         <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 bg-black/20 rounded-sm p-0.5"><ChevronDown size={12} className="text-white"/></div>
      </div>
      {isOpen && (
        <div className="absolute top-[105%] left-0 w-[200px] bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] rounded-lg border border-[#e6e9ef] py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto z-[100]">
           {options?.map((opt: string) => {
             const optConfig = STATUS_CONFIG[opt] || { label: opt, bg: "#ccc" };
             return (
                <div key={opt} className="px-3 py-1.5 mx-2 my-0.5 hover:bg-[#f5f6f8] cursor-pointer flex items-center gap-2 transition-colors rounded" onClick={(e) => handleSelect(opt, e)}>
                    <div className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: optConfig.bg }}></div>
                    <span className="text-[13px] text-[#323338]">{optConfig.label}</span>
                </div>
             );
           })}
        </div>
      )}
    </div>
  );
});

const DateCell = React.memo(({ value, onChange, disabled }: any) => {
    let displayDate = "-";
    if (value) {
        const d = new Date(value + 'T00:00:00');
        if (!isNaN(d.getTime())) displayDate = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    }
    const inputRef = useRef<HTMLInputElement>(null);
    if (disabled) return <div className="w-full h-full flex items-center justify-center text-[13px] text-[#c4c4c4] cursor-not-allowed bg-[#f5f6f8]">{displayDate}</div>;
    return (
        <div className="w-full h-full flex items-center justify-center group relative cursor-pointer hover:bg-[#f5f6f8]" onClick={() => inputRef.current?.showPicker()}>
             {!value && <Calendar className="w-4 h-4 text-[#c4c4c4] opacity-0 group-hover:opacity-100 transition-opacity" />}
             {value && <span className="text-[13px] text-[#323338]">{displayDate}</span>}
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
        const handleClickOutside = (event: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false); };
        if (isOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    if (disabled) return <div className="w-full h-full flex items-center justify-center opacity-60 cursor-not-allowed">{value ? <div className="w-7 h-7 rounded-full bg-[#c4c4c4] text-white flex items-center justify-center text-[11px] font-medium shadow-sm">{initials}</div> : <div className="text-[#c4c4c4] text-[13px]">-</div>}</div>;

    return (
        <div className="w-full h-full flex items-center justify-center relative" ref={containerRef}>
            <div className="cursor-pointer hover:bg-[#f5f6f8] flex w-full h-full items-center justify-center transition-colors" onClick={() => setIsOpen(true)}>
                {value ? (
                    <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[11px] font-medium border border-white shadow-sm" style={{ backgroundColor: badgeColor }} title={value}>{initials}</div>
                ) : (
                    <UserCircle className="w-6 h-6 text-[#c4c4c4]" />
                )}
            </div>
            {isOpen && (
                <div className="absolute top-[105%] left-1/2 -translate-x-1/2 w-[220px] bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] rounded-lg border border-[#e6e9ef] z-[100] p-2 max-h-60 overflow-y-auto">
                    {metrologos.map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2 p-2 mx-1 my-0.5 hover:bg-[#cce5ff] rounded cursor-pointer" onClick={() => { onChange(m.name || "Sin Nombre"); setIsOpen(false); }}>
                            <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[11px] font-medium shrink-0" style={{ backgroundColor: m.color || '#3b82f6' }}>{getInitials(m.name || "SN")}</div>
                            <span className="text-[13px] text-[#323338] truncate">{m.name || "Sin Nombre"}</span>
                        </div>
                    ))}
                    {value && <button onClick={() => { onChange(""); setIsOpen(false); }} className="w-full text-center text-[#e2445c] text-[13px] py-2 hover:bg-[#fceceb] border-t border-[#e6e9ef] mt-1">Desasignar</button>}
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

    if (disabled) return <div className="w-full h-full px-3 flex items-center text-[13px] text-[#676879] truncate cursor-not-allowed bg-[#f5f6f8] select-none">{value || "-"}</div>;

    return (
        <div className="w-full h-full relative group" ref={containerRef}>
            <div className="w-full h-full px-3 flex items-center cursor-pointer hover:bg-[#f5f6f8] border-[1px] border-transparent hover:border-[#e6e9ef] transition-colors" onClick={() => { setIsOpen(true); setSearchTerm(""); }}>
                {value ? <span className="text-[13px] text-[#323338] truncate">{value}</span> : <span className="text-[13px] text-[#c4c4c4] opacity-0 group-hover:opacity-100 transition-opacity">+ Agregar</span>}
            </div>
            {isOpen && (
                <div className="absolute top-[105%] left-0 w-[260px] bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] rounded-lg border border-[#e6e9ef] z-[100] p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[300px]">
                    <div className="relative mb-2 shrink-0"><Search className="w-3 h-3 absolute left-2 top-2.5 text-[#676879]"/><input autoFocus placeholder="Buscar empresa..." className="w-full pl-7 pr-2 py-1.5 text-[13px] border border-[#c3c6d4] rounded focus:border-[#0073ea] outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                    <div className="overflow-y-auto flex-1 space-y-1">
                        {filtered.length > 0 ? filtered.map((c: any) => (
                            <div key={c.id} className="px-2 py-1.5 hover:bg-[#cce5ff] cursor-pointer rounded flex items-center gap-2 mx-1" onClick={() => { onChange(c.nombre); setIsOpen(false); }}>
                                <span className="text-[13px] text-[#323338]">{c.nombre}</span>
                            </div>
                        )) : <div className="text-[13px] text-[#c4c4c4] text-center py-2">No encontrado</div>}
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
        await addDoc(collection(db, `hojasDeTrabajo/${row.docId}/comments`), { text, user: user?.displayName || user?.email || "Usuario", createdAt: new Date().toISOString() });
        setText("");
    };

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] z-[60] flex flex-col border-l border-[#e6e9ef] animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[#e6e9ef] flex justify-between items-center bg-white">
                <div><h3 className="font-medium text-[#323338] text-[16px] truncate w-60">{row.equipo || "Sin Equipo"}</h3><span className="text-[13px] text-[#676879]">{row.folio || "Sin Folio"}</span></div>
                <button onClick={onClose} className="p-1 hover:bg-[#f5f6f8] rounded text-[#676879]"><X size={18}/></button>
            </div>
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f5f6f8]">
                {comments.map((c) => (
                    <div key={c.id} className="bg-white p-3 rounded shadow-sm border border-[#e6e9ef] text-[13px] relative group">
                        <div className="flex justify-between items-center mb-1"><span className="font-medium text-[#0073ea]">{c.user}</span><span className="text-[11px] text-[#c4c4c4]">{new Date(c.createdAt).toLocaleDateString()}</span></div>
                        <p className="text-[#323338] leading-relaxed">{c.text}</p>
                    </div>
                ))}
            </div>
            <div className="p-3 border-t border-[#e6e9ef] bg-white flex gap-2">
                <input className="flex-1 border-[#c3c6d4] focus:border-[#0073ea] border rounded px-3 py-2 text-[13px] outline-none transition-all" placeholder="Escribir actualización..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()}/>
                <button onClick={sendComment} className="px-3 bg-[#0073ea] hover:bg-[#0060b9] text-white rounded transition-colors flex items-center justify-center"><Send size={16}/></button>
            </div>
        </div>
    );
};

const HistoryPanel = ({ row, onClose }: { row: WorksheetData, onClose: () => void }) => {
    const [history, setHistory] = useState<any[]>([]);
    useEffect(() => { const q = query(collection(db, `hojasDeTrabajo/${row.docId}/history`), orderBy("timestamp", "desc")); const unsub = onSnapshot(q, (snap) => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))); return () => unsub(); }, [row.docId]);
    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] z-[60] flex flex-col border-l border-[#e6e9ef] animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[#e6e9ef] flex justify-between items-center bg-white flex-shrink-0">
                <div className="flex items-center gap-2"><History className="w-4 h-4 text-[#a25ddc]"/><h3 className="font-medium text-[#323338] text-[16px]">Registro de actividad</h3></div>
                <button onClick={onClose} className="p-1 hover:bg-[#f5f6f8] rounded text-[#676879]"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f5f6f8]">
                {history.length === 0 ? <div className="text-center text-[#c4c4c4] text-[13px] mt-10">No hay actividad registrada.</div> : history.map((h) => (
                    <div key={h.id} className="bg-white p-3 rounded border border-[#e6e9ef] shadow-sm text-[13px]">
                        <div className="flex justify-between mb-1"><span className="font-medium text-[#323338]">{h.user}</span><span className="text-[#676879] text-[11px]">{new Date(h.timestamp).toLocaleString()}</span></div>
                        <div className="text-[#323338]">Cambió <span className="font-medium text-[#0073ea]">{h.field}</span> de <span className="line-through text-[#e2445c] opacity-70">{h.oldValue || "(vacío)"}</span> a <span className="font-medium text-[#00c875]">{h.newValue}</span></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ToastContainer = ({ toasts, removeToast }: { toasts: any[], removeToast: (id: string) => void }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto bg-[#323338] text-white px-4 py-3 rounded shadow-[0_4px_17px_rgba(0,0,0,0.15)] flex items-start gap-3 animate-in slide-in-from-right fade-in duration-300 min-w-[280px] max-w-sm">
                    <div className={clsx("w-2 h-2 rounded-full mt-1.5", toast.type === 'success' ? "bg-[#00c875]" : toast.type === 'info' ? "bg-[#0073ea]" : "bg-[#e2445c]")}></div>
                    <div className="flex-1"><span className="text-[13px] font-medium leading-tight block">{toast.message}</span></div>
                    <button onClick={() => removeToast(toast.id)} className="text-[#c4c4c4] hover:text-white transition-colors"><X size={14}/></button>
                </div>
            ))}
        </div>
    );
};

const AGBotWidget = ({ thoughts }: { thoughts: AGBotThought[] }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button onClick={() => setOpen(!open)} className={clsx("p-1.5 rounded transition-all border", open ? "bg-[#a25ddc] text-white border-[#a25ddc] shadow-sm" : "bg-white text-[#a25ddc] border-transparent hover:bg-[#f5f6f8]")}>
                <Brain size={16} className={clsx(thoughts.length > 0 && "animate-pulse")} />
                {thoughts.length > 0 && <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a25ddc] opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#a25ddc]"></span></span>}
            </button>
            {open && (
                <div className="absolute right-0 top-[105%] w-80 bg-white rounded-lg shadow-[0_4px_17px_rgba(0,0,0,0.15)] border border-[#e6e9ef] z-[80] overflow-hidden animate-in fade-in slide-in-from-top-4">
                    <div className="bg-[#a25ddc] p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white font-medium"><Brain size={16} /><span className="text-[14px]">AG-Bot Insights</span></div>
                        <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white"><X size={16}/></button>
                    </div>
                    <div className="p-0 max-h-80 overflow-y-auto bg-white">
                        {thoughts.length === 0 ? <div className="p-6 text-center text-[#c4c4c4] text-[13px]">Sin novedades por ahora.</div> : 
                        thoughts.map((t) => (
                            <div key={t.id} className="p-3 border-b border-[#e6e9ef] hover:bg-[#f5f6f8] transition-colors flex gap-3">
                                <div className={clsx("mt-0.5 flex-shrink-0", t.type === 'success' ? "text-[#00c875]" : t.type === 'warning' ? "text-[#fdab3d]" : "text-[#0073ea]")}>
                                    {t.type === 'success' ? <Check size={14}/> : t.type === 'warning' ? <AlertTriangle size={14}/> : <Info size={14}/>}
                                </div>
                                <div><p className="text-[13px] text-[#323338] leading-snug">{t.message}</p><span className="text-[11px] text-[#c4c4c4] mt-1 block">{new Date(t.timestamp).toLocaleTimeString()}</span></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- BOARD ROW (Componente) ---
const BoardRow = React.memo(({ row, columns, color, isSelected, onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd, userRole, onOpenComments, index, groupId, onOpenHistory }: any) => {
    
    const handleCellChange = useCallback((key: string, value: any) => { 
        let finalKey = key;
        if (key === 'folio' && groupId === 'laboratorio') finalKey = 'folioSalida';
        if (finalKey === "equipo") { 
            const autoDept = detectDepartment(value); 
            if (autoDept && (!row.departamento || row.departamento === "")) onUpdateRow(row.docId, "departamento", autoDept); 
        }
        onUpdateRow(row.docId, finalKey, value); 
    }, [row.docId, row.departamento, onUpdateRow, groupId]);
    
    let currentStickyLeft = 40; 
    const checkPermission = (col: Column) => (!col.permissions || col.permissions.length === 0 || col.permissions.includes(userRole));
    const responsibleName = row.nombre || row.assignedTo;
    
    const rowBackgroundColor = useMemo(() => { 
        if (!responsibleName) return isSelected ? "#cce5ff" : "white"; 
        const userObj = metrologos.find((m: any) => m.name === responsibleName);
        if (userObj && userObj.color) return isSelected ? hexToRgba(userObj.color, 0.25) : hexToRgba(userObj.color, 0.08);
        return isSelected ? "#cce5ff" : "white"; 
    }, [responsibleName, isSelected, metrologos]);

    return (
        <div id={`row-${row.docId}`} className="flex border-b border-[#e6e9ef] group transition-colors h-[36px] hover:bg-[#f5f6f8]" draggable="true" onDragStart={(e) => onDragStart(e, { type: 'row', index, id: row.docId, groupId })} onDragOver={(e) => e.preventDefault()} onDragEnd={onDragEnd} onDrop={(e) => { e.stopPropagation(); onDrop(e, { type: 'row', index, id: row.docId, groupId }); }} style={{ backgroundColor: rowBackgroundColor }}>
            <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
            <div className="w-[40px] flex-shrink-0 border-r border-[#e6e9ef] sticky left-1.5 z-20 flex items-center justify-center bg-inherit">
                 <div className="w-full h-full flex items-center justify-center relative group/control">
                    <div className="hidden group-hover/control:flex gap-1 absolute bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] p-1 rounded border border-[#e6e9ef] z-50 left-[110%] ml-1">
                        <button onClick={() => onOpenComments(row)} className="p-1 hover:bg-[#f5f6f8] text-[#676879] hover:text-[#0073ea] rounded" title="Actualizaciones"><MessageSquare size={14}/></button>
                        <button onClick={() => onOpenHistory(row)} className="p-1 hover:bg-[#f5f6f8] text-[#676879] hover:text-[#a25ddc] rounded" title="Registro"><History size={14}/></button>
                    </div>
                    <button onClick={() => onOpenComments(row)} className={clsx("absolute left-[-16px] text-gray-300 hover:text-[#0073ea] cursor-pointer transition-opacity z-50", isSelected ? "hidden" : "opacity-0 group-hover:opacity-100")}><MessageSquare size={14} className="fill-current"/></button>
                    <div className={clsx("absolute inset-0 items-center justify-center bg-inherit", isSelected ? "flex" : "hidden group-hover/control:flex")}><input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.docId)} className="rounded-[3px] border-[#c4c4c4] text-[#0073ea] cursor-pointer w-3.5 h-3.5 focus:ring-0" /></div>
                 </div>
            </div>
            {columns.filter((c: Column) => !c.hidden).map((col: Column) => {
                const style: React.CSSProperties = { width: col.width };
                if (col.sticky) { style.position = 'sticky'; style.left = currentStickyLeft + 1.5; style.zIndex = 15; style.backgroundColor = rowBackgroundColor; currentStickyLeft += col.width; }
                const canEdit = checkPermission(col);
                
                let cellValue = row[col.key];
                if (col.key === 'folio') { if (groupId === 'laboratorio') cellValue = row.folioSalida || ""; else cellValue = row.folio || ""; }
                
                let customClass = "";
                if (col.key === 'fecha' && row.diasPromesa && row.fechaEntrada && cellValue) {
                     const start = new Date(row.fechaEntrada + 'T00:00:00');
                     const deadline = addBusinessDays(start, row.diasPromesa);
                     const calibDate = new Date(cellValue + 'T00:00:00');
                     calibDate.setHours(0,0,0,0); deadline.setHours(0,0,0,0);
                     if (calibDate > deadline) customClass = "bg-[#fceceb] text-[#e2445c] font-medium border-l-[3px] border-[#e2445c]";
                     else customClass = "bg-[#e5f9f0] text-[#00c875] font-medium border-l-[3px] border-[#00c875]";
                }

                const isWorkDone = row.status_certificado === 'Generado' || row.status_certificado === 'Firmado' || row.cargado_drive === 'Si' || row.cargado_drive === 'Realizado';

                return (
                    <div key={col.key} style={style} className={clsx("flex-shrink-0 border-r border-[#e6e9ef] relative flex items-center transition-colors bg-inherit group/cell", col.sticky && "shadow-[2px_0_4px_rgba(0,0,0,0.02)]")}>
                        <div className={clsx("w-full h-full", customClass)}>
                             {col.type === 'dropdown' ? <DropdownCell value={cellValue} options={col.options!} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'date' ? <DateCell value={cellValue} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'person' ? <PersonCell value={cellValue} metrologos={metrologos} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'client' ? <ClientCell value={cellValue} clientes={clientes} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'sla_manual' ? <EditableSLACell days={cellValue} startDate={row.fechaEntrada} onChange={(v:any) => handleCellChange(col.key, v)} isCompleted={isWorkDone} disabled={!canEdit} /> :
                             <TextCell value={cellValue} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} />}
                        </div>
                    </div>
                );
            })}
             <div className="flex-1 bg-inherit border-b border-transparent min-w-[50px]"></div>
        </div>
    );
});

const ColumnOptions = ({ colKey, onClose, onSort, onHide, onRename, onPermissions, currentLabel, onFilter, uniqueValues }: any) => {
    useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
    return (
        <div className="absolute top-[105%] left-0 w-60 bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] rounded-lg border border-[#e6e9ef] z-[80] overflow-hidden animate-in fade-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
             <div className="py-1">
                 <button onClick={() => onSort(colKey, 'asc')} className="w-full text-left px-4 py-2 hover:bg-[#f5f6f8] text-[13px] flex items-center gap-2 text-[#323338]"><ArrowUpAZ size={14}/> Ordenar Ascendente</button>
                 <button onClick={() => onSort(colKey, 'desc')} className="w-full text-left px-4 py-2 hover:bg-[#f5f6f8] text-[13px] flex items-center gap-2 text-[#323338]"><ArrowDownAZ size={14}/> Ordenar Descendente</button>
             </div>
             <div className="border-t border-[#e6e9ef] py-1">
                 <div className="px-4 py-2">
                    <span className="text-[11px] font-medium text-[#676879] uppercase mb-1 block">Filtrar por:</span>
                    <select className="w-full text-[13px] border border-[#c3c6d4] rounded p-1 outline-none focus:border-[#0073ea]" onChange={(e) => onFilter(colKey, e.target.value)}>
                        <option value="">Todos</option>
                        {uniqueValues.map((v: string) => <option key={v} value={v}>{v || "(Vacío)"}</option>)}
                    </select>
                 </div>
             </div>
             <div className="border-t border-[#e6e9ef] py-1">
                 <button onClick={() => onRename(colKey)} className="w-full text-left px-4 py-2 hover:bg-[#f5f6f8] text-[13px] flex items-center gap-2 text-[#323338]"><Pencil size={14}/> Renombrar columna</button>
                 <button onClick={() => onPermissions(colKey)} className="w-full text-left px-4 py-2 hover:bg-[#f5f6f8] text-[13px] flex items-center gap-2 text-[#323338]"><Shield size={14}/> Configuración de permisos</button>
             </div>
             <div className="border-t border-[#e6e9ef] py-1">
                 <button onClick={() => onHide(colKey)} className="w-full text-left px-4 py-2 hover:bg-[#fceceb] text-[13px] flex items-center gap-2 text-[#e2445c]"><EyeOff size={14}/> Ocultar columna</button>
             </div>
        </div>
    );
};

const PermissionMenu = ({ x, y, column, onClose, onTogglePermission }: any) => {
    const currentPermissions = column.permissions || [];
    useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);
    return (
        <div className="fixed z-[90] bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] rounded-lg border border-[#e6e9ef] w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-100" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#f5f6f8] px-3 py-2 border-b border-[#e6e9ef] flex justify-between items-center"><span className="text-[13px] font-medium text-[#323338]">Permisos de Edición</span><Shield className="w-3 h-3 text-[#0073ea]"/></div>
            <div className="p-1 max-h-60 overflow-y-auto">
                {AVAILABLE_PROFILES.map(profile => {
                    const isAllowed = currentPermissions.includes(profile.id);
                    return (
                        <div key={profile.id} onClick={() => onTogglePermission(profile.id)} className="flex items-center gap-3 px-3 py-2 hover:bg-[#cce5ff] rounded cursor-pointer transition-colors mx-1 my-0.5">
                            <div className={clsx("w-4 h-4 border rounded flex items-center justify-center transition-colors shadow-sm", isAllowed ? "bg-[#0073ea] border-[#0073ea]" : "border-[#c3c6d4] bg-white")}>{isAllowed && <Check className="w-3 h-3 text-white"/>}</div>
                            <div className="flex items-center gap-2">{profile.type === 'role' ? <Shield className="w-3 h-3 text-[#fdab3d]"/> : <Briefcase className="w-3 h-3 text-[#676879]"/>}<span className="text-[13px] text-[#323338]">{profile.label}</span></div>
                        </div>
                    );
                })}
            </div>
            <div className="bg-[#cce5ff]/30 px-3 py-2 text-[11px] text-[#0073ea] border-t border-[#e6e9ef] leading-tight">Marca quién puede editar esta columna.</div>
        </div>
    );
};

const HiddenColumnsBar = ({ hiddenColumns, onUnhide }: { hiddenColumns: Column[], onUnhide: (key: string) => void }) => {
    if (hiddenColumns.length === 0) return null;
    return (
        <div className="bg-[#fceceb] border-b border-[#e2445c]/20 px-6 py-2 flex items-center gap-3 animate-in slide-in-from-top-2 text-[12px]">
            <span className="font-medium text-[#e2445c] flex items-center gap-1"><EyeOff size={14}/> Columnas Ocultas:</span>
            <div className="flex gap-2 flex-wrap">
                {hiddenColumns.map(col => (
                    <button key={col.key} onClick={() => onUnhide(col.key)} className="flex items-center gap-1 bg-white border border-[#e2445c]/30 text-[#e2445c] px-2 py-0.5 rounded text-[11px] hover:bg-[#fceceb] transition-colors shadow-sm" title="Clic para mostrar">
                        {col.label} <X size={10} className="text-[#e2445c]"/>
                    </button>
                ))}
            </div>
        </div>
    );
};

const FridayScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    const { user } = useAuth();
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [userRole, setUserRole] = useState<string>("admin"); 
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
    const [currentUserName, setCurrentUserName] = useState<string>("");

    const [rows, setRows] = useState<WorksheetData[]>([]);
    const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
    const [groupsConfig, setGroupsConfig] = useState<GroupData[]>([
        { id: "sitio", name: "Servicios en Sitio", color: "#e2445c", collapsed: false },
        { id: "laboratorio", name: "Equipos en Laboratorio", color: "#00c875", collapsed: false }
    ]);
    const [metrologos, setMetrologos] = useState<any[]>([]); 
    const [clientes, setClientes] = useState<any[]>([]); 
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const dragItemRef = useRef<DragItem | null>(null); 
    const [isThinking, setIsThinking] = useState(false);
    
    // UI States
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search); 
    const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({}); // PAGINACIÓN MONDAY

    const [permissionMenu, setPermissionMenu] = useState<{ x: number, y: number, colKey: string } | null>(null);
    const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
    const [activeCommentRow, setActiveCommentRow] = useState<WorksheetData | null>(null);
    const [activeHistoryRow, setActiveHistoryRow] = useState<WorksheetData | null>(null);
    const [toasts, setToasts] = useState<any[]>([]);
    const [agBotThoughts, setAgBotThoughts] = useState<AGBotThought[]>([]); 
    const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef<{ startX: number, startWidth: number, key: string } | null>(null);
    const [isPending, startTransition] = useTransition();

    const saveColumnsToFirebase = async (colsToSave: Column[]) => {
        try {
            const cleanColumns = JSON.parse(JSON.stringify(colsToSave));
            await setDoc(doc(db, "tableros", "principal"), { columns: cleanColumns }, { merge: true });
        } catch (error) { showToast("Error al guardar configuración de columnas", "info"); }
    };

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

                DEFAULT_COLUMNS.forEach(def => { if (!uniqueKeys.has(def.key)) { merged.push(def); uniqueKeys.add(def.key); } });
                setColumns(merged);
            } else { setColumns(DEFAULT_COLUMNS); }
        });

        const unsubMetrologos = onSnapshot(query(collection(db, "usuarios"), orderBy("name")), (snap) => { setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); });
        const unsubClientes = onSnapshot(query(collection(db, "clientes"), orderBy("nombre")), (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        const unsubRows = onSnapshot(collection(db, "hojasDeTrabajo"), (snapshot) => {
            startTransition(() => {
                let newRows: WorksheetData[] = [];
                const yearStr = currentYear.toString();
                
                snapshot.forEach(doc => { 
                    const data = doc.data();
                    let recordYear = extractYear(data.createdAt, yearStr);
                    if (recordYear !== yearStr) recordYear = extractYear(data.fechaEntrada, yearStr);
                    if (recordYear !== yearStr) recordYear = extractYear(data.fecha, yearStr);
                    if (recordYear !== yearStr) recordYear = extractYear(data.fecha_calib, yearStr);

                    if (recordYear === yearStr) {
                        newRows.push({ ...data, docId: doc.id, id: data.id || "", nombre: data.nombre || data.assignedTo, fecha: data.fecha || data.fecha_calib, cargado_drive: data.cargado_drive || "No", status_certificado: data.status_certificado || "Pendiente de Certificado", entregado: data.entregado === true, folioSalida: data.folioSalida } as WorksheetData); 
                    }
                });

                newRows.sort((a, b) => {
                    const dateA = (extractYear(a.createdAt, "0") + a.createdAt) || (extractYear(a.fechaEntrada, "0") + a.fechaEntrada);
                    const dateB = (extractYear(b.createdAt, "0") + b.createdAt) || (extractYear(b.fechaEntrada, "0") + b.fechaEntrada);
                    return dateB.localeCompare(dateA);
                });

                setRows(newRows); setIsLoadingData(false);
            });
        });

        return () => { unsubBoard(); unsubMetrologos(); unsubRows(); unsubClientes(); };
    }, [currentYear]); 

    // --- CEREBRO DE AG-BOT ---
    useEffect(() => {
        if (isLoadingData || rows.length === 0) return;

        const runAGBot = async () => {
            const batch = writeBatch(db);
            let updateCount = 0;
            const newThoughts: AGBotThought[] = [];

            rows.forEach(row => {
                let needsUpdate = false;
                const updates: any = {};

                if (!row.departamento || row.departamento === "") {
                    const detected = detectDepartment(row.equipo || "");
                    if (detected) { updates.departamento = detected; needsUpdate = true; }
                }
                
                if ((!row.marca || row.marca === "") && row.modelo) {
                    const inferredBrand = inferBrand(row.modelo);
                    if (inferredBrand) { updates.marca = inferredBrand; needsUpdate = true; }
                }

                if (row.folio && row.folio !== row.folio.trim().toUpperCase()) { updates.folio = row.folio.trim().toUpperCase(); needsUpdate = true; }
                if (row.cliente && row.cliente !== row.cliente.trim().toUpperCase()) { updates.cliente = row.cliente.trim().toUpperCase(); needsUpdate = true; }
                if (row.id && row.id !== row.id.trim().toUpperCase()) { updates.id = row.id.trim().toUpperCase(); needsUpdate = true; }
                if (row.equipo && typeof row.equipo === 'string' && row.equipo !== row.equipo.trim()) { updates.equipo = row.equipo.trim(); needsUpdate = true; }

                const isLab = row.lugarCalibracion?.toLowerCase() === 'laboratorio';
                const isSitio = row.lugarCalibracion?.toLowerCase() === 'sitio';

                if (isSitio) {
                    if (row.status_equipo !== 'Calibrado') { updates.status_equipo = 'Calibrado'; needsUpdate = true; }
                    if (row.ubicacion_real !== 'Servicio en Sitio') { updates.ubicacion_real = 'Servicio en Sitio'; needsUpdate = true; }
                } else if (isLab) {
                    if (row.folioSalida && row.folioSalida.trim() !== "") {
                        if (row.ubicacion_real !== 'Entregado') { updates.ubicacion_real = 'Entregado'; needsUpdate = true; }
                    } else {
                        if (row.ubicacion_real !== 'Laboratorio' && row.ubicacion_real !== 'Recepción') {
                            updates.ubicacion_real = 'Laboratorio'; needsUpdate = true;
                            newThoughts.push({ id: Date.now() + Math.random(), type: 'warning', message: `Ubicación corregida a Laboratorio para ${row.id || 'equipo'}`, timestamp: new Date().toISOString() });
                        }
                    }
                }

                if ((!row.fechaEntrada || row.fechaEntrada === "") && (row.fechaRecepcion && row.fechaRecepcion !== "")) { updates.fechaEntrada = row.fechaRecepcion; needsUpdate = true; } 
                else if (row.fechaEntrada && row.fechaEntrada !== row.fechaRecepcion) { updates.fechaRecepcion = row.fechaEntrada; needsUpdate = true; } 
                else if ((!row.fechaEntrada || row.fechaEntrada === "") && (!row.fechaRecepcion || row.fechaRecepcion === "")) {
                    const fallbackDate = row.createdAt ? row.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];
                    updates.fechaEntrada = fallbackDate; updates.fechaRecepcion = fallbackDate; needsUpdate = true;
                    newThoughts.push({ id: Date.now() + Math.random(), type: 'info', message: `Fecha de entrada auto-asignada para ${row.id || 'equipo'}`, timestamp: new Date().toISOString() });
                }

                if (row.diasPromesa === undefined || row.diasPromesa === null || isNaN(Number(row.diasPromesa))) { updates.diasPromesa = 5; needsUpdate = true; }
                if (!row.status_equipo || row.status_equipo === "") { updates.status_equipo = 'Desconocido'; needsUpdate = true; }

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
                try {
                    await batch.commit();
                    showToast(`🤖 AG-Bot: ${updateCount} dato(s) sincronizado(s)`, 'info');
                } catch(error) { console.error("Error del guardián AG-Bot:", error); }
                setTimeout(() => setIsThinking(false), 1000);
            }
        };

        const timer = setTimeout(runAGBot, 3500); 
        return () => clearTimeout(timer);

    }, [rows, isLoadingData]); 

    const showToast = (message: string, type: 'success' | 'info' | 'error') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };

    const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

    const handleSort = (key: string, direction: 'asc' | 'desc') => { setSortConfig({ key, direction }); setActiveColumnMenu(null); };
    const handleHide = async (key: string) => { const newCols = columns.map(c => c.key === key ? { ...c, hidden: true } : c); setColumns(newCols); setActiveColumnMenu(null); await saveColumnsToFirebase(newCols); };
    const handleUnhide = async (key: string) => { const newCols = columns.map(c => c.key === key ? { ...c, hidden: false } : c); setColumns(newCols); await saveColumnsToFirebase(newCols); };

    const handleResetLayout = async () => {
        if(confirm("¿Restablecer vista original? (Esto borrará configuraciones personales de columnas)")) {
             setColumns(DEFAULT_COLUMNS); await saveColumnsToFirebase(DEFAULT_COLUMNS); window.location.reload(); 
        }
    };

    const handleRename = async (key: string) => {
        const newName = prompt("Nuevo nombre:");
        if (newName) { const newCols = columns.map(c => c.key === key ? { ...c, label: newName } : c); setColumns(newCols); await saveColumnsToFirebase(newCols); }
        setActiveColumnMenu(null);
    };

    const handleAddColumn = async () => {
        const name = prompt("Nombre de la nueva columna:");
        if (!name) return;
        const newKey = `col_${Date.now()}`;
        const newCol: Column = { key: newKey, label: name, type: 'text', width: 150, hidden: false, sticky: false, permissions: [] };
        const newColumns = [...columns, newCol];
        setColumns(newColumns); await saveColumnsToFirebase(newColumns);
        showToast("Columna agregada y guardada", "success");
    };
    
    const handleFilter = (key: string, value: string) => { setActiveFilters(prev => ({ ...prev, [key]: value })); setActiveColumnMenu(null); };

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
        const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `tablero_${currentYear}.csv`); document.body.appendChild(link); link.click();
    };

    const handleOpenPermissions = (e: any, key: string) => { setPermissionMenu({ x: e.clientX, y: e.clientY, colKey: key }); setActiveColumnMenu(null); };

    const handleTogglePermission = async (roleId: string) => {
        if (!permissionMenu) return;
        const targetCol = columns.find(c => c.key === permissionMenu.colKey);
        if (!targetCol) return;
        let currentPerms = targetCol.permissions || [];
        if (currentPerms.includes(roleId)) currentPerms = currentPerms.filter(p => p !== roleId);
        else currentPerms = [...currentPerms, roleId];
        const newCols = columns.map(c => c.key === permissionMenu.colKey ? { ...c, permissions: currentPerms } : c);
        setColumns(newCols); await saveColumnsToFirebase(newCols);
    };

    const handleAddRow = useCallback(async (groupId: string) => {
        const docRef = doc(collection(db, "hojasDeTrabajo"));
        let initialStatus = 'Desconocido'; let initialLocation = '';

        if (groupId === 'sitio') { initialStatus = 'Calibrado'; initialLocation = 'Servicio en Sitio'; } 
        else if (groupId === 'laboratorio') { initialLocation = 'Laboratorio'; }

        const now = new Date();
        const fechaEntradaStr = now.toISOString().split('T')[0]; 
        
        const newRowData = {
            id: "", folio: "", cliente: "", equipo: "", lugarCalibracion: groupId, status_equipo: initialStatus, ubicacion_real: initialLocation,
            nombre: currentUserName, assignedTo: currentUserName, createdAt: now.toISOString(), fechaEntrada: fechaEntradaStr, fechaRecepcion: fechaEntradaStr,
            diasPromesa: 5, status_certificado: 'Pendiente de Certificado'
        };
        await setDoc(docRef, newRowData);
        showToast("Fila agregada correctamente", 'success');
    }, [currentUserName]);

    const handleUpdateRow = useCallback(async (rowId: string, key: string, value: any) => {
        setRows(prevRows => prevRows.map(r => {
            if (r.docId === rowId) {
                const updated = { ...r, [key]: value };
                if (key === "ubicacion_real") {
                    if (value === "Servicio en Sitio") updated.lugarCalibracion = "sitio";
                    if (value === "Laboratorio" || value === "Recepción") updated.lugarCalibracion = "laboratorio";
                }
                return updated;
            }
            return r;
        }));
        
        try {
            const batch = writeBatch(db);
            const rowRef = doc(db, "hojasDeTrabajo", rowId);
            let updates: any = { [key]: value, lastUpdated: new Date().toISOString() };
            
            if (key === "ubicacion_real") {
                if (value === "Servicio en Sitio") updates.lugarCalibracion = "sitio";
                else if (value === "Laboratorio" || value === "Recepción") updates.lugarCalibracion = "laboratorio";
            }
            batch.update(rowRef, updates);
            
            const oldValue = rows.find(r => r.docId === rowId)?.[key];
            const historyRef = collection(db, `hojasDeTrabajo/${rowId}/history`);
            const historyDoc = doc(historyRef);
            batch.set(historyDoc, { field: key, oldValue: oldValue || "", newValue: value, user: currentUserName, timestamp: new Date().toISOString() });

            await batch.commit();
        } catch (error) { showToast("Error de conexión al guardar", 'error'); }
    }, [rows, currentUserName]);

    const handleDeleteSelected = async () => {
        if (!confirm(`¿Eliminar ${selectedIds.size} elementos?`)) return; 
        const batch = writeBatch(db);
        selectedIds.forEach(id => { batch.delete(doc(db, "hojasDeTrabajo", id)); });
        setSelectedIds(new Set()); await batch.commit();
        showToast("Elementos eliminados", 'success');
    };

    const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }, []);

    const startResize = (e: React.MouseEvent, colKey: string, currentWidth: number) => {
        e.preventDefault(); e.stopPropagation(); setIsResizing(true);
        resizingRef.current = { startX: e.clientX, startWidth: currentWidth, key: colKey };
        document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingRef.current) return;
        const { startX, startWidth, key } = resizingRef.current;
        const diff = e.clientX - startX; const newWidth = Math.max(50, startWidth + diff); 
        setColumns(prevCols => prevCols.map(col => col.key === key ? { ...col, width: newWidth } : col));
    }, []);

    const handleMouseUp = useCallback(async () => {
        setIsResizing(false); document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); resizingRef.current = null;
    }, []);

    const onDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
        if (item.type === 'column' && columns[item.index].sticky) { e.preventDefault(); return; }
        dragItemRef.current = item; e.dataTransfer.effectAllowed = "move"; if (e.target instanceof HTMLElement) e.target.style.opacity = '0.5';
    }, [columns]);

    const onDragEnd = (e: React.DragEvent) => { if (e.target instanceof HTMLElement) e.target.style.opacity = '1'; dragItemRef.current = null; };

    const onDrop = useCallback(async (e: React.DragEvent, target: DragItem) => {
        e.preventDefault(); const dragItem = dragItemRef.current; if (!dragItem) return;

        if (dragItem.type === 'column' && target.type === 'column') {
             const fromIdx = dragItem.index; const toIdx = target.index;
             if(columns[toIdx].sticky || columns[fromIdx].sticky) return;
             let newCols = [...columns]; const [moved] = newCols.splice(fromIdx, 1); newCols.splice(toIdx, 0, moved);
             setColumns(newCols); await saveColumnsToFirebase(newCols);
        }
    }, [columns]); 

    const groupedRows = useMemo(() => {
        let filtered = rows.filter(r => {
            if (deferredSearch) {
                const s = deferredSearch.toLowerCase();
                const matches = ((r.cliente || "").toLowerCase().includes(s) || (r.folio || "").toLowerCase().includes(s) || (r.equipo || "").toLowerCase().includes(s) || (r.id || "").toLowerCase().includes(s) || (r.marca || "").toLowerCase().includes(s) || (r.modelo || "").toLowerCase().includes(s) || (r.serie || "").toLowerCase().includes(s) || (r.nombre || "").toLowerCase().includes(s) || (r.assignedTo || "").toLowerCase().includes(s) || (r.folioSalida || "").toLowerCase().includes(s) );
                if (!matches) return false;
            }
            for (const [key, val] of Object.entries(activeFilters)) { if (val && r[key] !== val) return false; }
            return true;
        });

        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const valA = a[sortConfig.key!] || ""; const valB = b[sortConfig.key!] || "";
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1; return 0;
            });
        }

        return groupsConfig.map(group => ({ ...group, rows: filtered.filter(r => (r.lugarCalibracion || "").toLowerCase() === group.id) }));
    }, [rows, groupsConfig, deferredSearch, sortConfig, activeFilters]);

    let headerStickyOffset = 40; 
    const hiddenColumns = columns.filter(c => c.hidden);

    return (
        <div className="flex h-screen bg-white font-sans text-[#323338] w-full overflow-hidden flex-col">
            
            {/* --- TOP BAR (MONDAY STYLE) --- */}
            <div className="flex items-center px-4 pt-3 border-b border-[#e6e9ef] gap-6 text-[14px]">
                <div className="flex items-center gap-2 pb-2 border-b-2 border-transparent cursor-pointer hover:text-[#0073ea] text-[#676879] transition-colors" onClick={() => navigateTo('menu')}>
                    <ArrowLeft size={16} /> <span>Menú</span>
                </div>
                <div className="pb-2 border-b-2 border-[#0073ea] font-medium text-[#0073ea] cursor-pointer flex items-center gap-2">
                    <Menu size={16}/> Tabla Principal
                </div>
                <div className="pb-2 border-b-2 border-transparent hover:text-[#0073ea] text-[#323338] cursor-pointer opacity-80">Dimensional</div>
                <div className="pb-2 border-b-2 border-transparent hover:text-[#0073ea] text-[#323338] cursor-pointer opacity-80">Mecánica</div>
                <div className="pb-2 border-b-2 border-transparent hover:text-[#0073ea] text-[#323338] cursor-pointer opacity-80">Eléctrica</div>
                <div className="pb-2 border-b-2 border-transparent hover:text-[#0073ea] text-[#323338] cursor-pointer opacity-80">Calidad</div>
            </div>

            {/* --- TOOLBAR --- */}
            <div className="px-6 py-3 flex items-center gap-3 bg-white z-40 relative">
                <button className="bg-[#0073ea] hover:bg-[#0060b9] text-white px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-colors shadow-sm flex items-center gap-1">
                    Nuevo folio <ChevronDown size={14}/>
                </button>
                <div className="h-6 w-px bg-[#e6e9ef] mx-1"></div>
                <div className="flex items-center gap-1 text-[13px] text-[#323338] hover:bg-[#f5f6f8] px-2 py-1.5 rounded cursor-pointer transition-colors border border-transparent hover:border-[#e6e9ef]">
                    <Search size={14} className="text-[#676879]"/> <input placeholder="Buscar" className="bg-transparent outline-none w-24 focus:w-40 transition-all text-[13px]" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-[#323338] hover:bg-[#f5f6f8] px-2 py-1.5 rounded cursor-pointer transition-colors border border-transparent hover:border-[#e6e9ef]"><Users size={14} className="text-[#676879]"/> Persona</div>
                <div className="flex items-center gap-1.5 text-[13px] text-[#323338] hover:bg-[#f5f6f8] px-2 py-1.5 rounded cursor-pointer transition-colors border border-transparent hover:border-[#e6e9ef]"><Filter size={14} className="text-[#676879]"/> Filtrar</div>
                <div className="flex items-center gap-1.5 text-[13px] text-[#323338] hover:bg-[#f5f6f8] px-2 py-1.5 rounded cursor-pointer transition-colors border border-transparent hover:border-[#e6e9ef]"><ArrowUpAZ size={14} className="text-[#676879]"/> Ordenar</div>
                
                <div className="ml-auto flex items-center gap-3">
                    <AGBotWidget thoughts={agBotThoughts} />
                    <button onClick={handleExportCSV} className="text-[#676879] hover:bg-[#f5f6f8] p-1.5 rounded transition-colors" title="Exportar a Excel"><Download size={16}/></button>
                    <button onClick={handleResetLayout} className="text-[#676879] hover:bg-[#fceceb] hover:text-[#e2445c] p-1.5 rounded transition-colors" title="Restablecer vistas"><RotateCcw size={16}/></button>
                    <div className="inline-flex bg-[#f5f6f8] rounded-[4px] p-0.5 border border-[#e6e9ef]">
                        <button onClick={() => setCurrentYear(2025)} className={clsx("px-3 py-1 rounded-[3px] text-[13px] font-medium transition-all", currentYear === 2025 ? "bg-white text-[#323338] shadow-sm" : "text-[#676879]")}>2025</button>
                        <button onClick={() => setCurrentYear(2026)} className={clsx("px-3 py-1 rounded-[3px] text-[13px] font-medium transition-all", currentYear === 2026 ? "bg-white text-[#323338] shadow-sm" : "text-[#676879]")}>2026</button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-white px-6 w-full custom-scroll pb-32">
                <div className="inline-block min-w-full pb-32">
                    <HiddenColumnsBar hiddenColumns={hiddenColumns} onUnhide={handleUnhide} />

                    <div className="flex h-[36px] border-y border-[#e6e9ef] sticky top-0 z-30 bg-white shadow-sm">
                        <div className="w-1.5 bg-white sticky left-0 z-30"></div>
                        <div className="w-[40px] border-r border-[#e6e9ef] bg-white sticky left-1.5 z-30 flex items-center justify-center border-l-transparent"><input type="checkbox" className="rounded-[3px] border-[#c4c4c4]" /></div>
                        
                        {columns.filter(c => !c.hidden).map((col, index) => {
                            const style: React.CSSProperties = { width: col.width, zIndex: col.sticky ? 30 : undefined };
                            if (col.sticky) { style.position = 'sticky'; style.left = headerStickyOffset + 1.5; headerStickyOffset += col.width; }
                            const isLocked = col.permissions && col.permissions.length > 0 && !col.permissions.includes(userRole);
                            return (
                            <div key={col.key} draggable={!col.sticky && !isResizing} onDragStart={(e) => onDragStart(e, { type: 'column', index })} onDragOver={(e) => e.preventDefault()} onDragEnd={onDragEnd} onDrop={(e) => onDrop(e, { type: 'column', index })} style={style} 
                                className={clsx("px-2 text-[13px] font-normal text-[#323338] flex items-center justify-center border-r border-transparent hover:bg-[#f5f6f8] hover:border-[#e6e9ef] select-none bg-white group transition-colors relative", col.sticky ? "shadow-[2px_0_4px_rgba(0,0,0,0.02)] border-r-[#e6e9ef]" : "cursor-pointer")}
                            >
                                <span className="truncate flex items-center gap-1 flex-1 justify-center">
                                    {col.label} {isLocked && <Lock className="w-3 h-3 text-[#c4c4c4]" />}
                                    {activeFilters[col.key] && <Filter size={12} className="text-[#0073ea] fill-[#0073ea]"/>}
                                </span>
                                <button onClick={(e) => { e.stopPropagation(); setActiveColumnMenu(activeColumnMenu === col.key ? null : col.key); }} className="p-0.5 rounded hover:bg-[#cce5ff] opacity-0 group-hover:opacity-100 transition-opacity absolute right-1">
                                    <MoreHorizontal className="w-4 h-4 text-[#676879]" />
                                </button>
                                {!col.sticky && (<div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#0073ea] z-50 transition-colors opacity-0 hover:opacity-100" onMouseDown={(e) => startResize(e, col.key, col.width)} onClick={(e) => e.stopPropagation()}></div>)}
                                {activeColumnMenu === col.key && (<ColumnOptions colKey={col.key} currentLabel={col.label} uniqueValues={[...new Set(rows.map(r => r[col.key] || ""))].sort()} onClose={() => setActiveColumnMenu(null)} onSort={handleSort} onHide={handleHide} onRename={handleRename} onFilter={handleFilter} onPermissions={(k:string) => handleOpenPermissions(window.event, k)}/>)}
                            </div>
                        )})}
                        <div className="px-2 border-r border-transparent flex items-center justify-center cursor-pointer hover:bg-[#f5f6f8] group transition-colors" onClick={handleAddColumn} title="Agregar columna">
                            <Plus size={16} className="text-[#676879] group-hover:text-[#0073ea] transition-colors" />
                        </div>
                        <div className="flex-1 min-w-[50px] border-r border-transparent"></div>
                    </div>

                    <div className="px-4 mt-6">
                        {isLoadingData ? (
                            <div className="p-10 flex flex-col items-center justify-center gap-3">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0073ea]"></div>
                                <p className="text-[#c4c4c4] text-[13px] font-medium">Cargando tablero...</p>
                            </div>
                        ) : (
                            groupedRows.map(group => {
                                const limit = visibleLimits[group.id] || 50;
                                const displayedRows = group.rows.slice(0, limit);

                                return (
                                    <div key={group.id} className="mb-10 w-max min-w-full">
                                        <div className="flex items-center mb-1 group sticky left-0 z-10 p-1">
                                            <ChevronDown className={clsx("w-6 h-6 cursor-pointer text-gray-400 hover:bg-[#f5f6f8] rounded p-0.5 transition-transform", group.collapsed && "-rotate-90")} onClick={() => { startTransition(() => { setGroupsConfig(prev => prev.map(g => g.id === group.id ? {...g, collapsed: !g.collapsed} : g)); }); }} style={{ color: group.color }} />
                                            <h2 className="text-[18px] font-medium ml-1" style={{ color: group.color }}>{group.name}</h2>
                                            <span className="ml-2 text-[14px] text-[#676879] font-normal">{group.rows.length} Equipos</span>
                                        </div>
                                        
                                        {!group.collapsed && (
                                            <div className="border-l border-t border-r border-[#e6e9ef] rounded-t-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-white">
                                                {displayedRows.map((row, rIdx) => (
                                                    <BoardRow key={row.docId} row={row} index={rIdx} groupId={group.id} columns={columns} color={group.color} isSelected={selectedIds.has(row.docId)} onToggleSelect={toggleSelect} onUpdateRow={handleUpdateRow} metrologos={metrologos} clientes={clientes} onDragStart={onDragStart} onDrop={onDrop} onDragEnd={onDragEnd} userRole={userRole} onOpenComments={setActiveCommentRow} onOpenHistory={setActiveHistoryRow} />
                                                ))}
                                                
                                                <div className="flex h-[36px] border-b border-[#e6e9ef] bg-white hover:bg-[#f5f6f8] group transition-colors">
                                                    <div className="sticky left-0 z-20 flex bg-white group-hover:bg-[#f5f6f8] transition-colors">
                                                        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }}></div>
                                                        <div className="w-[40px] flex-shrink-0 border-r border-[#e6e9ef]"></div>
                                                        {columns.filter(c => c.sticky && !c.hidden).map(c => ( <div key={c.key} style={{width: c.width}} className="border-r border-[#e6e9ef] flex-shrink-0"></div> ))}
                                                    </div>
                                                    <div className="flex-1 flex items-center px-4 relative w-full">
                                                        <input type="text" placeholder={`+ Agregar Equipo en ${group.name}`} className="outline-none text-[13px] w-full h-full placeholder-[#c4c4c4] bg-transparent font-normal absolute left-4" onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRow(group.id); (e.target as HTMLInputElement).value = ''; } }} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {!group.collapsed && group.rows.length > limit && (
                                            <div className="mt-2 py-2 text-center sticky left-0 z-10 w-full border-t border-transparent">
                                                <button className="text-[13px] text-[#0073ea] hover:underline font-medium" onClick={() => setVisibleLimits(prev => ({...prev, [group.id]: limit + 50}))}>
                                                    Mostrar {Math.min(50, group.rows.length - limit)} elementos más... ({group.rows.length - limit} restantes)
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {selectedIds.size > 0 && (
               <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-[0_4px_17px_rgba(0,0,0,0.15)] rounded-[4px] border border-[#e6e9ef] px-6 py-2 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
                   <div className="flex items-center gap-3 border-r border-[#e6e9ef] pr-6"><div className="bg-[#0073ea] text-white text-[13px] font-medium w-6 h-6 rounded flex items-center justify-center">{selectedIds.size}</div><span className="text-[14px] font-medium text-[#323338]">Seleccionados</span></div>
                   <button onClick={handleDeleteSelected} className="flex flex-col items-center gap-0.5 text-[#676879] hover:text-[#e2445c] transition-colors"><Trash2 className="w-4 h-4" /><span className="text-[10px]">Eliminar</span></button>
                   <button onClick={() => setSelectedIds(new Set())} className="ml-2 hover:bg-[#f5f6f8] p-1 rounded"><X className="w-4 h-4 text-[#676879]" /></button>
               </div>
            )}

            {permissionMenu && (<PermissionMenu x={permissionMenu.x} y={permissionMenu.y} column={columns.find(c => c.key === permissionMenu.colKey)!} onClose={() => setPermissionMenu(null)} onTogglePermission={handleTogglePermission}/>)}
            {activeCommentRow && (<CommentsPanel row={activeCommentRow} onClose={() => setActiveCommentRow(null)} />)}
            {activeHistoryRow && (<HistoryPanel row={activeHistoryRow} onClose={() => setActiveHistoryRow(null)} />)}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </div>
    );
};

export default FridayScreen;