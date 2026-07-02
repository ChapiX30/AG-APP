import React, { useState, useEffect, useCallback, useRef, useMemo, useTransition } from "react";
import { createPortal } from "react-dom";
import { List, type RowComponentProps } from "react-window";
import {
  Plus, Trash2, ChevronDown, Search, 
  UserCircle, Calendar, X, 
  Building2, ArrowLeft,
  Lock, Shield, Check, Briefcase, 
  MessageSquare, Send, Clock, AlertTriangle, AlertCircle,
  MoreHorizontal, ArrowUpAZ, ArrowDownAZ, EyeOff, Eye, Pencil,
  RotateCcw, Brain, Download, Filter, History, CheckCircle, Info, Palette, Loader2, ShieldCheck
} from "lucide-react";
import { db } from "../utils/firebase";
import { reconcileWorksheetDriveFlags } from "../utils/worksheetDriveSync";
import { isRealizadoValue, markDriveFileCompletedForWorksheet } from "../utils/markDriveCompleted";
import { notificarCalidadRevisionPendiente } from "../utils/notificacionesRevisionCalidad";
import { doc, collection, query, where, onSnapshot, setDoc, writeBatch, orderBy, addDoc, getDocs, updateDoc } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';
import { useAppDialog } from '../hooks/useAppDialog';
import { useAuth } from "../hooks/useAuth"; 
import labLogo from '../assets/lab_logo.png';

// --- TIPOS ---
type CellType = "text" | "number" | "dropdown" | "date" | "person" | "client" | "sla_manual";

// --- UTILIDADES ---
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
    return `hsl(${h}, 70%, 96%)`;
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

// NUEVA FUNCIÓN ANTI-SANGRADO DE AÑOS
const getRowYearStr = (row: WorksheetData) => {
    if (row.certificado && typeof row.certificado === 'string') {
        const certMatch = row.certificado.trim().match(/-(\d{2})$/);
        if (certMatch) {
            const yy = certMatch[1];
            if (yy === "25" || yy === "26" || yy === "27") return "20" + yy;
        }
    }
    const fields = [row.fecha, row.fecha_calib, row.fechaEntrada, row.fechaRecepcion, row.createdAt];
    for (const field of fields) {
        if (field && typeof field === 'string') {
            const match = field.match(/(202[4-9])/); 
            if (match) return match[1];
        }
    }
    return "2025"; 
};

const normalizeText = (text: string) =>
    text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

/** Evita enlazar Drive con filas cuyo id/folio/certificado están vacíos (matcheo masivo). */
const isLinkableWorksheetId = (id: string): boolean => {
    const t = (id || "").trim();
    return t.length >= 2;
};

/** Cargado en Drive: solo Si/Realizado si Firestore lo indica; filas nuevas → No. */
const getEffectiveCargadoDrive = (row: WorksheetData): string => {
    const raw = (row.cargado_drive || "").trim();
    if (!raw || raw.toLowerCase() === "pendiente") return "No";
    return raw;
};

/** Certificado alineado con Drive: Generado solo si la carga en Drive está hecha. */
const getEffectiveCertStatus = (row: WorksheetData): string => {
    const raw = (row.status_certificado || "").trim();
    const drive = getEffectiveCargadoDrive(row).toLowerCase();
    const driveDone = drive === "si" || drive === "realizado";
    if (raw.toLowerCase() === "finalizado") return "Firmado";
    if (!raw || raw === "Pendiente de Certificado") {
        return driveDone ? "Generado" : "Pendiente de Certificado";
    }
    if (raw === "Generado" && !driveDone) return "Pendiente de Certificado";
    return raw;
};

/** Cronograma COMPLETADO solo cuando el flujo documental (Drive/cert) terminó. */
const isCronogramaComplete = (row: WorksheetData): boolean => {
    const drive = getEffectiveCargadoDrive(row).toLowerCase();
    const cert = getEffectiveCertStatus(row);
    if (cert === "Firmado") return true;
    if (drive === "si" || drive === "realizado") return true;
    if ((row.ubicacion_real || "").toLowerCase() === "entregado") return true;
    return false;
};

/** Responsable visible; no usar assignedTo si nombre fue desasignado explícitamente (""). */
const getResponsableName = (row: WorksheetData) => {
    if (row.nombre === "") return "";
    return (row.nombre || row.assignedTo || "").trim();
};

const responsableFromFirestore = (data: { nombre?: string; assignedTo?: string }) => {
    if (data.nombre === "") return "";
    return (data.nombre || data.assignedTo || "").trim();
};

const isTechnicianOwnerOfRow = (row: WorksheetData, currentUserName: string): boolean => {
    const me = normalizeText(currentUserName);
    const owner = normalizeText(getResponsableName(row));
    if (!me || !owner) return false;
    return me === owner || owner.includes(me) || me.includes(owner);
};

const getResponsableRowBackground = (
    responsableName: string,
    isSelected: boolean,
    metrologos: { name?: string; color?: string }[]
): string => {
    if (isSelected) return "#f0f7ff";
    if (!responsableName) return "#ffffff";
    const userObj = metrologos.find((m) => m.name === responsableName);
    if (userObj?.color) return hexToRgba(userObj.color, 0.14);
    return stringToColor(responsableName);
};

const isCalidadLogisticaRoleText = (roleStr: string): boolean =>
    (roleStr.includes("calidad") && roleStr.includes("logist")) ||
    roleStr.includes("calidad y logistica") ||
    (roleStr.includes("seguridad") && roleStr.includes("calidad") && roleStr.includes("logist"));

const canUserEditFridayBoard = (profile: {
    nombre?: string;
    name?: string;
    correo?: string;
    email?: string;
    puesto?: string;
    role?: string;
    departamento?: string;
} | null): boolean => {
    if (!profile) return false;
    const nombre = normalizeText(profile.nombre || profile.name || "");
    const correo = normalizeText(profile.correo || profile.email || "");
    const isNoraAmador =
        (nombre.includes("nora") && nombre.includes("amador")) ||
        (correo.includes("nora") && correo.includes("amador"));
    const roleStr = normalizeText(
        [profile.puesto, profile.role, profile.departamento].filter(Boolean).join(" ")
    );
    const puestoNorm = normalizeText(profile.puesto || profile.role || "");
    const isSclPuesto =
        puestoNorm === "calidad" ||
        puestoNorm === "logistica" ||
        puestoNorm === "logística";
    return isCalidadLogisticaRoleText(roleStr) || isSclPuesto || isNoraAmador;
};

const buildRowSearchBlob = (row: WorksheetData) =>
    normalizeText(
        [
            row.cliente, row.folio, row.folioSalida, row.equipo, row.id,
            row.marca, row.modelo, row.serie, row.nombre, row.assignedTo,
            row.certificado, row.status_equipo, row.status_certificado,
        ]
            .filter(Boolean)
            .join(" ")
    );

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

const ROW_HEIGHT_PX = 44;
const VIRTUALIZE_MIN_ROWS = 48;
const VIRTUAL_LIST_MAX_HEIGHT = 520;
const BOARD_POPOVER_Z = 9999;

type PopoverAlign = "left" | "center" | "right";

function computePopoverStyle(
    triggerEl: HTMLElement,
    { minWidth, maxWidth = 360, align = "left", gap = 4 }: { minWidth: number; maxWidth?: number; align?: PopoverAlign; gap?: number }
): React.CSSProperties {
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(Math.max(minWidth, rect.width), maxWidth);
    let left = rect.left;
    if (align === "center") left = rect.left + rect.width / 2 - width / 2;
    else if (align === "right") left = rect.right - width;
    const margin = 8;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    let top = rect.bottom + gap;
    const estHeight = 280;
    if (top + estHeight > window.innerHeight - margin) top = Math.max(margin, rect.top - estHeight - gap);
    return { position: "fixed", top, left, width, zIndex: BOARD_POPOVER_Z };
}

function useCellPopoverPosition(
    isOpen: boolean,
    triggerRef: React.RefObject<HTMLElement | null>,
    options: { minWidth: number; maxWidth?: number; align?: PopoverAlign }
) {
    const [style, setStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden" });
    const { minWidth, maxWidth, align } = options;

    useEffect(() => {
        if (!isOpen || !triggerRef.current) return;
        const update = () => {
            if (triggerRef.current) setStyle(computePopoverStyle(triggerRef.current, { minWidth, maxWidth, align }));
        };
        update();
        const scrollEl = document.getElementById("main-board-scroll");
        scrollEl?.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            scrollEl?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [isOpen, minWidth, maxWidth, align, triggerRef]);

    return style;
}

function usePopoverClickOutside(
    isOpen: boolean,
    onClose: () => void,
    triggerRef: React.RefObject<HTMLElement | null>,
    popoverRef: React.RefObject<HTMLElement | null>
) {
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
            onClose();
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onClose, triggerRef, popoverRef]);
}

const CellPopover = ({
    isOpen, triggerRef, popoverRef, onClose, children, minWidth, maxWidth, align = "left", className,
}: {
    isOpen: boolean;
    triggerRef: React.RefObject<HTMLElement | null>;
    popoverRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    children: React.ReactNode;
    minWidth: number;
    maxWidth?: number;
    align?: PopoverAlign;
    className?: string;
}) => {
    const style = useCellPopoverPosition(isOpen, triggerRef, { minWidth, maxWidth, align });
    usePopoverClickOutside(isOpen, onClose, triggerRef, popoverRef);
    if (!isOpen) return null;
    return createPortal(
        <div ref={popoverRef} style={style} className={className} onMouseDown={(e) => e.stopPropagation()}>
            {children}
        </div>,
        document.body
    );
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

const AVAILABLE_PROFILES = [
    { id: 'admin', label: 'Administrador', type: 'role' }, 
    { id: 'metrologo', label: 'Metrólogo', type: 'puesto' },
    { id: 'calidad', label: 'Calidad', type: 'puesto' },
    { id: 'logistica', label: 'Logística', type: 'puesto' },
    { id: 'ventas', label: 'Ventas', type: 'puesto' }
];

interface Column { key: string; label: string; type: CellType; width: number; hidden?: boolean; options?: string[]; sticky?: boolean; permissions?: string[]; }
interface WorksheetData { docId: string; id: string; createdAt: string; lugarCalibracion: string; assignedTo?: string; nombre?: string; fecha?: string; fechaEntrada?: string; fechaRecepcion?: string; diasPromesa?: number; cargado_drive?: string; entregado?: boolean; folioSalida?: string; [key: string]: any; }
interface GroupData { id: string; name: string; color: string; collapsed: boolean; total?: number; rows?: WorksheetData[] }
interface DragItem { type: 'row' | 'column'; index: number; id?: string; groupId?: string; }
interface AGBotThought { id: number; type: 'info' | 'warning' | 'success'; message: string; timestamp: string; }

/** Reconciliación Drive: servidor `scheduledDriveReconcile` (cada 6 h) + respaldo en tablero (AG-Bot / intervalo). */
const AGBOT_INITIAL_DELAY_MS = 2_000;
const DRIVE_RECONCILE_INTERVAL_MS = 30 * 60 * 1000;
const DRIVE_RECONCILE_INITIAL_MS = 15_000;

const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  "Desconocido": { label: "Desconocido", bg: "#c4c4c4" }, "En Revisión": { label: "En Revisión", bg: "#fdab3d" },
  "Calibrado": { label: "Calibrado", bg: "#00c875" }, "Rechazado": { label: "Rechazado", bg: "#e2445c" },
  "Pendiente de Certificado": { label: "Pendiente Cert.", bg: "#0086c0" }, "Generado": { label: "Generado", bg: "#a25ddc" },
  "Firmado": { label: "Firmado", bg: "#00c875" }, "Servicio en Sitio": { label: "Servicio en Sitio", bg: "#a25ddc" },
  "Laboratorio": { label: "Laboratorio", bg: "#579bfc" }, "Recepción": { label: "Recepción", bg: "#fdab3d" },
  "Entregado": { label: "Entregado", bg: "#00c875" }, "No": { label: "No", bg: "#e2445c" }, "Si": { label: "Si", bg: "#00c875" },
  "Realizado": { label: "Realizado", bg: "#00c875" }, "Mecánica": { label: "Mecánica", bg: "#1565c0" },
  "Dimensional": { label: "Dimensional", bg: "#00897b" }, "Eléctrica": { label: "Eléctrica", bg: "#ff8f00" }
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
    let currentDate = new Date(startDate); let added = 0;
    while (added < daysToAdd) { currentDate.setDate(currentDate.getDate() + 1); const day = currentDate.getDay(); if (day !== 0 && day !== 6) added++; }
    return currentDate;
};

// --- CELDAS ---
const EditableSLACell = React.memo(({ days, startDate, onChange, isCompleted, disabled }: any) => {
    const [isEditing, setIsEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    if (isCompleted && !isEditing) return (
        <div className="w-full h-full flex items-center justify-center bg-blue-50/30" onClick={() => !disabled && setIsEditing(true)}>
            <div className="flex flex-col items-center justify-center w-[90%] py-1 rounded bg-blue-500 text-white shadow-sm transition-all">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide"><CheckCircle size={12} /> Completado</div>
            </div>
        </div>
    );

    if (isEditing) return (
        <input ref={inputRef} autoFocus type="number" defaultValue={days} onBlur={(e) => { setIsEditing(false); onChange(Number(e.target.value)); }} onKeyDown={(e) => { if(e.key === 'Enter') { setIsEditing(false); onChange(Number((e.target as HTMLInputElement).value)); }}} className="w-full h-full text-center font-bold text-blue-600 bg-white outline-none border-2 border-blue-400 rounded" />
    );

    if (!startDate) return <div className="text-gray-300 text-xs text-center w-full">-</div>;

    const start = new Date(startDate + 'T00:00:00'); 
    const deadline = addBusinessDays(start, days || 0); 
    const now = new Date(); now.setHours(0,0,0,0); 
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let bgClass = "bg-[#00c875] text-white"; let label = `${diffDays} días`; let icon = <Clock size={12} />;
    if (diffDays <= 2 && diffDays > 0) { bgClass = "bg-[#fdab3d] text-white"; label = `${diffDays} días`; } 
    else if (diffDays === 0) { bgClass = "bg-[#e2445c] text-white"; label = "Vence Hoy"; icon = <AlertCircle size={12} />; } 
    else if (diffDays < 0) { bgClass = "bg-[#333333] text-white"; label = `Vencido (${Math.abs(diffDays)})`; icon = <AlertTriangle size={12} />; }

    return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50/30 cursor-pointer hover:brightness-95" onClick={() => !disabled && setIsEditing(true)}>
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
  const displayTitle = localValue ? String(localValue) : undefined;
  return (
    <input ref={inputRef} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => { if(e.key === 'Enter') inputRef.current?.blur(); }} placeholder={placeholder} disabled={disabled} title={displayTitle} className="w-full h-full px-3 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-[#2464A3] focus:z-10 transition-all text-[13px] truncate placeholder-gray-400 text-[#323338] disabled:cursor-not-allowed disabled:opacity-60" />
  );
});

const DropdownCell = React.memo(({ value, options, onChange, disabled }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const configItem = STATUS_CONFIG[value] || { label: value || "-", bg: "#c4c4c4" };
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleSelect = (opt: string, e: React.MouseEvent) => { e.stopPropagation(); onChange(opt); setIsOpen(false); };

  if (disabled) return (
      <div className="w-full h-full flex items-center justify-center px-1 opacity-70 cursor-not-allowed">
          <div className="text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 max-w-full" style={{ backgroundColor: configItem.bg }} title={configItem.label}><span className="truncate">{configItem.label}</span> <Lock className="w-2.5 h-2.5 text-white/70 shrink-0" /></div>
      </div>
  );

  return (
    <div className="w-full h-full relative flex items-center justify-center px-1 py-0.5">
      <div
        ref={triggerRef}
        className="w-full max-w-full flex items-center justify-center gap-0.5 text-white text-[11px] font-semibold cursor-pointer hover:brightness-105 relative transition-all rounded-md px-2.5 py-1"
        style={{ backgroundColor: configItem.bg }}
        title={configItem.label}
        onClick={(e) => { e.stopPropagation(); setIsOpen((o) => !o); }}
      >
         <span className="truncate text-center">{configItem.label}</span>
         <ChevronDown size={10} className="shrink-0 opacity-60" />
      </div>
      <CellPopover
        isOpen={isOpen}
        triggerRef={triggerRef}
        popoverRef={popoverRef}
        onClose={() => setIsOpen(false)}
        minWidth={200}
        maxWidth={280}
        align="left"
        className="bg-white shadow-2xl rounded-lg border border-gray-200 py-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
      >
           {options?.map((opt: string) => {
             const optConfig = STATUS_CONFIG[opt] || { label: opt, bg: "#ccc" };
             return (
                <div key={opt} className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0" onClick={(e) => handleSelect(opt, e)}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ background: optConfig.bg }}></div>
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap">{optConfig.label}</span>
                </div>
             );
           })}
      </CellPopover>
    </div>
  );
});

const DateCell = React.memo(({ value, onChange, disabled }: any) => {
    const displayDate = value ? new Date(value + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null;
    const inputRef = useRef<HTMLInputElement>(null);
    if (disabled) return <div className="w-full h-full flex items-center justify-center text-[13px] text-[#8B8D8C] cursor-not-allowed">{displayDate || "-"}</div>;
    return (
        <div className="w-full h-full flex items-center justify-center group relative cursor-pointer hover:bg-[#f5f6f8]" onClick={() => inputRef.current?.showPicker()} title={value ? String(displayDate) : undefined}>
             {!value && <Calendar className="w-4 h-4 text-gray-300 group-hover:text-[#8B8D8C]" />}{value && <span className="text-[13px] text-[#323338]">{displayDate}</span>}
             <input ref={inputRef} type="date" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onChange(e.target.value)} />
        </div>
    );
});

const PersonCell = React.memo(({ value, metrologos, onChange, onUpdateMetrologoColor, disabled }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const initials = getInitials(value && typeof value === 'string' ? value : "");
    const assignedUser = metrologos.find((m: any) => m.name === value);
    const badgeColor = assignedUser?.color || "#cbd5e0";

    if (disabled) return <div className="w-full h-full flex items-center justify-center opacity-60 cursor-not-allowed">{value ? <div className="w-7 h-7 rounded-full bg-gray-400 text-white flex items-center justify-center text-[11px] font-semibold ring-2 ring-white">{initials}</div> : <div className="text-gray-300 text-xs">-</div>}</div>;

    return (
        <div className="w-full h-full flex items-center justify-center relative">
            <div
                ref={triggerRef}
                className="cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                onClick={(e) => { e.stopPropagation(); setIsOpen((o) => !o); }}
            >
                {value ? <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[11px] font-semibold ring-2 ring-white" style={{ backgroundColor: badgeColor }} title={value}>{initials}</div> : <UserCircle className="w-7 h-7 text-gray-300" />}
            </div>
            <CellPopover
                isOpen={isOpen}
                triggerRef={triggerRef}
                popoverRef={popoverRef}
                onClose={() => setIsOpen(false)}
                minWidth={260}
                maxWidth={320}
                align="left"
                className="bg-white shadow-2xl rounded-lg border border-gray-200 p-2 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
            >
                    {metrologos.map((m: any) => (
                        <div
                            key={m.id}
                            className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer min-w-0"
                            onClick={() => { onChange(m.name || "Sin Nombre"); setIsOpen(false); }}
                        >
                            <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: m.color || '#3b82f6' }}>{getInitials(m.name || "SN")}</div>
                            <span className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate pr-1">{m.name || "Sin Nombre"}</span>
                            <div
                                className="relative shrink-0 w-7 h-7 flex items-center justify-center"
                                title="Cambiar color del metrólogo"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10" value={m.color || "#3b82f6"} onChange={(e) => onUpdateMetrologoColor && onUpdateMetrologoColor(m.id, e.target.value)} />
                                <Palette size={16} className="text-gray-400 hover:text-blue-600 transition-colors pointer-events-none" />
                            </div>
                        </div>
                    ))}
                    {value && <button onClick={() => { onChange(""); setIsOpen(false); }} className="w-full text-center text-red-500 text-xs py-2 hover:bg-red-50 border-t mt-1">Desasignar</button>}
            </CellPopover>
        </div>
    );
});

const FridaySelectionBar = ({
    count,
    canEdit,
    metrologos,
    onAssign,
    onDelete,
    onClear,
}: {
    count: number;
    canEdit: boolean;
    metrologos: { id: string; name?: string; color?: string }[];
    onAssign: (name: string) => void;
    onDelete: () => void;
    onClear: () => void;
}) => {
    if (count === 0 || typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] pointer-events-none"
            role="toolbar"
            aria-label="Acciones de filas seleccionadas"
        >
            <div className="pointer-events-auto bg-white shadow-2xl rounded-lg border border-gray-200 px-6 py-3 flex items-center gap-6 animate-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 border-r border-gray-200 pr-6">
                    <div className="bg-[#2464A3] text-white text-xs font-bold w-6 h-6 rounded flex items-center justify-center">
                        {count}
                    </div>
                    <span className="text-sm font-medium text-gray-700">Seleccionados</span>
                </div>
                {canEdit ? (
                    <>
                        <BulkResponsablePicker metrologos={metrologos} onAssign={onAssign} />
                        <button
                            type="button"
                            onClick={onDelete}
                            className="flex flex-col items-center gap-1 text-gray-500 hover:text-red-600 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-[10px]">Eliminar</span>
                        </button>
                    </>
                ) : (
                    <span className="text-xs text-gray-500">Modo lectura</span>
                )}
                <button type="button" onClick={onClear} className="ml-2 hover:bg-gray-100 p-1 rounded" title="Limpiar selección">
                    <X className="w-4 h-4 text-gray-500" />
                </button>
            </div>
        </div>,
        document.body
    );
};

const BulkResponsablePicker = ({ metrologos, onAssign, disabled }: { metrologos: { id: string; name?: string; color?: string }[]; onAssign: (name: string) => void; disabled?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const handleAssign = (name: string) => {
        onAssign(name);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen((o) => !o)}
                className="flex flex-col items-center gap-1 text-gray-500 hover:text-[#2464A3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <UserCircle className="w-4 h-4" />
                <span className="text-[10px]">Responsable</span>
            </button>
            <CellPopover
                isOpen={isOpen}
                triggerRef={triggerRef}
                popoverRef={popoverRef}
                onClose={() => setIsOpen(false)}
                minWidth={260}
                maxWidth={320}
                align="left"
                className="bg-white shadow-2xl rounded-lg border border-gray-200 p-2 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
            >
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 pb-1">Asignar responsable</p>
                {metrologos.map((m) => (
                    <div
                        key={m.id}
                        className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer min-w-0"
                        onClick={() => handleAssign(m.name || "Sin Nombre")}
                    >
                        <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: m.color || "#3b82f6" }}>{getInitials(m.name || "SN")}</div>
                        <span className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate">{m.name || "Sin Nombre"}</span>
                    </div>
                ))}
                <button type="button" onClick={() => handleAssign("")} className="w-full text-center text-red-500 text-xs py-2 hover:bg-red-50 border-t mt-1">Desasignar</button>
            </CellPopover>
        </div>
    );
};

const ClientCell = React.memo(({ value, clientes, onChange, disabled }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const filtered = useMemo(() => { if (!isOpen) return []; if (!searchTerm) return clientes; return clientes.filter((c:any) => (c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase())); }, [clientes, searchTerm, isOpen]);
    if (disabled) return <div className="w-full h-full px-3 flex items-center text-[13px] text-[#8B8D8C] truncate cursor-not-allowed select-none" title={value || undefined}>{value || "-"}</div>;
    return (
        <div className="w-full h-full relative group">
            <div
                ref={triggerRef}
                className="w-full h-full px-3 flex items-center cursor-pointer hover:bg-[#f5f6f8]"
                onClick={(e) => { e.stopPropagation(); setIsOpen(true); setSearchTerm(""); }}
            >
                {value ? <span className="text-[13px] text-[#323338] truncate font-medium flex items-center gap-2 min-w-0" title={value}><Building2 size={12} className="text-[#8B8D8C] shrink-0"/> <span className="truncate">{value}</span></span> : <span className="text-[13px] text-gray-400 flex items-center gap-1"><Plus className="w-3 h-3"/> Cliente</span>}
            </div>
            <CellPopover
                isOpen={isOpen}
                triggerRef={triggerRef}
                popoverRef={popoverRef}
                onClose={() => setIsOpen(false)}
                minWidth={260}
                maxWidth={340}
                align="left"
                className="bg-white shadow-2xl rounded-lg border border-blue-200 p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[300px]"
            >
                    <div className="relative mb-2 shrink-0"><Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400"/><input autoFocus placeholder="Buscar empresa..." className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:border-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                    <div className="overflow-y-auto flex-1 space-y-1">
                        {filtered.length > 0 ? filtered.map((c: any) => (
                            <div key={c.id} className="px-2 py-2 hover:bg-blue-50 cursor-pointer rounded flex items-center gap-2" onClick={() => { onChange(c.nombre); setIsOpen(false); }}><div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Building2 className="w-3 h-3"/></div><span className="text-xs text-gray-700 font-medium">{c.nombre}</span></div>
                        )) : <div className="text-xs text-gray-400 text-center py-2">No encontrado</div>}
                    </div>
            </CellPopover>
        </div>
    );
});

// --- PANELES COMPLEMENTARIOS ---
const CommentsPanel = ({ row, onClose, canPost }: { row: WorksheetData; onClose: () => void; canPost: boolean }) => {
    const [comments, setComments] = useState<any[]>([]); const [text, setText] = useState(""); const { user } = useAuth(); const chatRef = useRef<HTMLDivElement>(null);
    useEffect(() => { const q = query(collection(db, `hojasDeTrabajo/${row.docId}/comments`), orderBy("createdAt", "asc")); const unsub = onSnapshot(q, (snap) => { setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }), 100); }); return () => unsub(); }, [row.docId]);
    const sendComment = async () => { if (!canPost || !text.trim()) return; await addDoc(collection(db, `hojasDeTrabajo/${row.docId}/comments`), { text, user: user?.name || user?.email || "Usuario", createdAt: new Date().toISOString() }); setText(""); };
    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[120] flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50"><div><h3 className="font-bold text-gray-800 text-sm truncate w-60">{row.equipo || "Sin Equipo"}</h3><span className="text-xs text-gray-500">{row.folio || "Sin Folio"}</span></div><button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={18}/></button></div>
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa]">
                {comments.map((c) => (<div key={c.id} className="bg-white p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm border border-gray-100 text-sm relative group"><div className="flex justify-between items-center mb-1"><span className="font-bold text-[11px] text-blue-600">{c.user}</span><span className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</span></div><p className="text-gray-700 text-xs leading-relaxed">{c.text}</p></div>))}
            </div>
            {canPost ? (
                <div className="p-3 border-t bg-white flex gap-2"><input className="flex-1 bg-gray-100 border-transparent focus:bg-white border rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Escribir nota..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment()}/><button onClick={sendComment} className="p-2 bg-blue-600 text-white rounded-full"><Send size={16}/></button></div>
            ) : (
                <div className="p-3 border-t bg-gray-50 text-center text-xs text-gray-500">Modo lectura — no se pueden agregar comentarios</div>
            )}
        </div>
    );
};

const HistoryPanel = ({ row, onClose }: { row: WorksheetData, onClose: () => void }) => {
    const [history, setHistory] = useState<any[]>([]);
    useEffect(() => { const q = query(collection(db, `hojasDeTrabajo/${row.docId}/history`), orderBy("timestamp", "desc")); const unsub = onSnapshot(q, (snap) => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))); return () => unsub(); }, [row.docId]);
    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[120] flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0"><div className="flex items-center gap-2"><History className="w-4 h-4 text-blue-600"/><h3 className="font-bold text-gray-800 text-sm">Historial de Cambios</h3></div><button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={18}/></button></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8f9fa]">
                {history.length === 0 ? <div className="text-center text-gray-400 text-xs mt-10">No hay cambios registrados aún.</div> : history.map((h) => (<div key={h.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-xs"><div className="flex justify-between mb-1"><span className="font-bold text-gray-700">{h.user}</span><span className="text-gray-400 text-[10px]">{new Date(h.timestamp).toLocaleString()}</span></div><div className="text-gray-600">Cambió <span className="font-semibold text-blue-600">{h.field}</span> de <span className="line-through text-red-400 opacity-70">{h.oldValue || "(vacío)"}</span> a <span className="font-bold text-green-600">{h.newValue}</span></div></div>))}
            </div>
        </div>
    );
};

const ToastContainer = ({ toasts, removeToast }: { toasts: any[], removeToast: (id: string) => void }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[120] flex flex-col gap-2 pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto bg-gray-900/90 backdrop-blur text-white px-4 py-3 rounded-xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-right fade-in duration-300 min-w-[280px] max-w-sm border border-white/10">
                    <div className={clsx("w-2 h-2 rounded-full mt-1.5", toast.type === 'success' ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : toast.type === 'info' ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]")}></div>
                    <div className="flex-1"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">AG-Bot</p><span className="text-sm font-medium leading-tight block">{toast.message}</span></div>
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
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex items-center justify-between"><div className="flex items-center gap-2 text-white font-bold"><Brain size={16} /><span className="text-sm">AG-Bot Insights</span></div><button onClick={() => setOpen(false)} className="text-white/80 hover:text-white"><X size={16}/></button></div>
                    <div className="p-0 max-h-80 overflow-y-auto bg-slate-50/50">
                        {thoughts.length === 0 ? <div className="p-6 text-center text-gray-400 text-xs">Sin novedades por ahora.</div> : 
                        thoughts.map((t) => (
                            <div key={t.id} className="p-3 border-b border-gray-100 bg-white hover:bg-purple-50/30 transition-colors flex gap-3">
                                <div className={clsx("mt-1 flex-shrink-0", t.type === 'success' ? "text-emerald-500" : t.type === 'warning' ? "text-amber-500" : "text-blue-500")}>{t.type === 'success' ? <Check size={14}/> : t.type === 'warning' ? <AlertTriangle size={14}/> : <Info size={14}/>}</div>
                                <div><p className="text-xs text-gray-700 leading-snug">{t.message}</p><span className="text-[10px] text-gray-400 mt-1 block">{new Date(t.timestamp).toLocaleTimeString()}</span></div>
                            </div>
                        ))}
                    </div>
                    <div className="p-2 bg-gray-50 border-t border-gray-200 text-center">
                        <span className="text-[10px] text-gray-400 font-medium">
                            Drive: servidor cada 5 min + tablero abierto (AG-Bot)
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- BOARD ROW ---
const BoardRow = React.memo(({ row, columns, color, isSelected, onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd, canEditBoard, currentUserName, onOpenComments, index, groupId, onOpenHistory, onUpdateMetrologoColor }: any) => {
    
    const handleCellChange = useCallback((key: string, value: any) => { 
        let finalKey = key;
        if (key === 'folio' && groupId === 'laboratorio') { finalKey = 'folioSalida'; }
        if (finalKey === "equipo") { 
            const autoDept = detectDepartment(value); 
            if (autoDept && (!row.departamento || row.departamento === "")) { onUpdateRow(row.docId, "departamento", autoDept); }
        }
        onUpdateRow(row.docId, finalKey, value); 
    }, [row.docId, row.departamento, onUpdateRow, groupId]);
    
    let currentStickyLeft = 40;
    const responsableName = getResponsableName(row);
    const rowBackgroundColor = useMemo(
        () => getResponsableRowBackground(responsableName, isSelected, metrologos),
        [responsableName, isSelected, metrologos]
    );

    return (
        <div id={`row-${row.docId}`} className="flex border-b border-[#e6e9ef] group transition-colors hover:!bg-[#f5f6f8]" style={{ backgroundColor: rowBackgroundColor, height: ROW_HEIGHT_PX }} draggable={canEditBoard} onDragStart={canEditBoard ? (e) => onDragStart(e, { type: 'row', index, id: row.docId, groupId }) : undefined} onDragOver={canEditBoard ? (e) => e.preventDefault() : undefined} onDragEnd={canEditBoard ? onDragEnd : undefined} onDrop={canEditBoard ? (e) => { e.stopPropagation(); onDrop(e, { type: 'row', index, id: row.docId, groupId }); } : undefined}>
            <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
            <div className="w-[40px] flex-shrink-0 border-r border-[#e6e9ef] sticky left-1.5 z-20 flex items-center justify-center" style={{ backgroundColor: rowBackgroundColor }}>
                 <div className="w-full h-full flex items-center justify-center relative group/control">
                    <div className="hidden group-hover/control:flex gap-1 absolute bg-white shadow-lg p-1 rounded-md border border-gray-200 z-50 left-full ml-1">
                        <button onClick={() => onOpenComments(row)} className="p-1 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded" title="Comentarios"><MessageSquare size={14}/></button>
                        <button onClick={() => onOpenHistory(row)} className="p-1 hover:bg-purple-50 text-gray-500 hover:text-purple-600 rounded" title="Historial"><History size={14}/></button>
                    </div>
                    <button onClick={() => onOpenComments(row)} className={clsx("p-1 rounded text-gray-300 hover:text-blue-600 transition-colors", isSelected ? "hidden" : "block")}><MessageSquare size={14} /></button>
                    <div className={clsx("absolute inset-0 items-center justify-center bg-inherit", isSelected ? "flex" : "hidden group-hover/control:flex")}><input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.docId)} className="rounded border-gray-300 text-[#2464A3] cursor-pointer w-4 h-4" /></div>
                 </div>
            </div>
            {columns.filter((c: Column) => !c.hidden).map((col: Column) => {
                const style: React.CSSProperties = { width: col.width };
                if (col.sticky) { style.position = 'sticky'; style.left = currentStickyLeft + 1.5; style.zIndex = 15; style.backgroundColor = rowBackgroundColor; currentStickyLeft += col.width; }
                const canEdit =
                    canEditBoard ||
                    (col.key === "cargado_drive" && isTechnicianOwnerOfRow(row, currentUserName));
                
                let cellValue = row[col.key];
                if (col.key === 'folio') { 
                    if (groupId === 'laboratorio') cellValue = row.folioSalida || ""; 
                    else cellValue = row.folio || ""; 
                }
                if (col.key === 'cargado_drive') cellValue = getEffectiveCargadoDrive(row);
                if (col.key === 'status_certificado') cellValue = getEffectiveCertStatus(row);
                
                let customClass = "";
                if (col.key === 'fecha' && row.diasPromesa && row.fechaEntrada && cellValue) {
                     const start = new Date(row.fechaEntrada + 'T00:00:00');
                     const deadline = addBusinessDays(start, row.diasPromesa);
                     const calibDate = new Date(cellValue + 'T00:00:00');
                     calibDate.setHours(0,0,0,0); deadline.setHours(0,0,0,0);
                     if (calibDate > deadline) customClass = "bg-red-50/60 text-red-800 border-l-2 border-red-300";
                     else customClass = "bg-emerald-50/50 text-emerald-800 border-l-2 border-emerald-300";
                }

                const isWorkDone = isCronogramaComplete(row);

                return (
                    <div key={col.key} style={style} className={clsx("flex-shrink-0 border-r border-[#e6e9ef] relative flex items-center transition-colors", col.sticky && "shadow-[1px_0_3px_rgba(0,0,0,0.04)] border-r-[#e6e9ef]")}>
                        <div className={clsx("w-full h-full", customClass)}>
                             {col.type === 'dropdown' ? <DropdownCell value={cellValue} options={col.options!} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'date' ? <DateCell value={cellValue} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'person' ? <PersonCell value={cellValue} metrologos={metrologos} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} onUpdateMetrologoColor={canEditBoard ? onUpdateMetrologoColor : undefined} /> : 
                             col.type === 'client' ? <ClientCell value={cellValue} clientes={clientes} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                             col.type === 'sla_manual' ? <EditableSLACell days={cellValue} startDate={row.fechaEntrada} onChange={(v:any) => handleCellChange(col.key, v)} isCompleted={isWorkDone} disabled={!canEdit} /> :
                             <TextCell value={cellValue} onChange={(v:any) => handleCellChange(col.key, v)} disabled={!canEdit} />}
                        </div>
                    </div>
                );
            })}
             <div className="flex-1 border-b border-transparent min-w-[50px]"></div>
        </div>
    );
}, (prev, next) =>
    prev.row === next.row &&
    prev.isSelected === next.isSelected &&
    prev.index === next.index &&
    prev.groupId === next.groupId &&
    prev.color === next.color &&
    prev.columns === next.columns &&
    prev.canEditBoard === next.canEditBoard &&
    prev.metrologos === next.metrologos &&
    prev.clientes === next.clientes
);

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

type BoardRowSharedProps = {
    rows: WorksheetData[];
    groupId: string;
    groupColor: string;
    columns: Column[];
    selectedIds: Set<string>;
    selectionSignature: string;
    onToggleSelect: (id: string) => void;
    onUpdateRow: (rowId: string, key: string, value: any) => void;
    metrologos: any[];
    clientes: any[];
    onDragStart: (e: React.DragEvent, item: DragItem) => void;
    onDrop: (e: React.DragEvent, target: DragItem) => void;
    onDragEnd: (e: React.DragEvent) => void;
    canEditBoard: boolean;
    currentUserName: string;
    onOpenComments: (row: WorksheetData) => void;
    onOpenHistory: (row: WorksheetData) => void;
    onUpdateMetrologoColor: (userId: string, newColor: string) => void;
};

function VirtualBoardRow({
    index, style, rows, groupId, groupColor, columns, selectedIds,
    onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd,
    canEditBoard, currentUserName, onOpenComments, onOpenHistory, onUpdateMetrologoColor,
}: RowComponentProps<BoardRowSharedProps>) {
    const row = rows[index];
    if (!row) return null;
    return (
        <div style={style}>
            <BoardRow
                key={`${row.docId}-${getResponsableName(row)}`}
                row={row}
                index={index}
                groupId={groupId}
                columns={columns}
                color={groupColor}
                isSelected={selectedIds.has(row.docId)}
                onToggleSelect={onToggleSelect}
                onUpdateRow={onUpdateRow}
                metrologos={metrologos}
                clientes={clientes}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                canEditBoard={canEditBoard}
                currentUserName={currentUserName}
                onOpenComments={onOpenComments}
                onOpenHistory={onOpenHistory}
                onUpdateMetrologoColor={onUpdateMetrologoColor}
            />
        </div>
    );
}

const GroupRowsBody = React.memo(function GroupRowsBody(props: BoardRowSharedProps) {
    const { rows, groupId, groupColor, columns } = props;
    if (rows.length === 0) return null;

    if (rows.length < VIRTUALIZE_MIN_ROWS) {
        return (
            <>
                {rows.map((row, rIndex) => (
                    <BoardRow
                        key={`${row.docId}-${getResponsableName(row)}`}
                        row={row}
                        index={rIndex}
                        groupId={groupId}
                        columns={columns}
                        color={groupColor}
                        isSelected={props.selectedIds.has(row.docId)}
                        onToggleSelect={props.onToggleSelect}
                        onUpdateRow={props.onUpdateRow}
                        metrologos={props.metrologos}
                        clientes={props.clientes}
                        onDragStart={props.onDragStart}
                        onDrop={props.onDrop}
                        onDragEnd={props.onDragEnd}
                        canEditBoard={props.canEditBoard}
                        currentUserName={props.currentUserName}
                        onOpenComments={props.onOpenComments}
                        onOpenHistory={props.onOpenHistory}
                        onUpdateMetrologoColor={props.onUpdateMetrologoColor}
                    />
                ))}
            </>
        );
    }

    const height = Math.min(rows.length * ROW_HEIGHT_PX, VIRTUAL_LIST_MAX_HEIGHT);
    return (
        <List<BoardRowSharedProps>
            rowCount={rows.length}
            rowHeight={ROW_HEIGHT_PX}
            rowComponent={VirtualBoardRow}
            rowProps={props}
            style={{ height, width: "100%" }}
            overscanCount={6}
        />
    );
});

const HiddenColumnsBar = ({ hiddenColumns, onUnhide }: { hiddenColumns: Column[], onUnhide: (key: string) => void }) => {
    if (hiddenColumns.length === 0) return null;
    return (
        <div className="bg-[#fff9e6] border-b border-[#ffeebb] px-6 py-2 flex items-center gap-3 animate-in slide-in-from-top-2">
            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide flex items-center gap-1"><EyeOff size={12}/> Columnas Ocultas:</span>
            <div className="flex gap-2 flex-wrap">
                {hiddenColumns.map(col => (
                    <button key={col.key} onClick={() => onUnhide(col.key)} className="flex items-center gap-1 bg-white border border-orange-200 text-orange-800 px-2 py-0.5 rounded-full text-[10px] hover:bg-orange-50 transition-colors shadow-sm" title="Clic para mostrar">
                        {col.label} <X size={10} className="text-orange-400"/>
                    </button>
                ))}
            </div>
        </div>
    );
};

const FridayScreen: React.FC = () => {
    const { goBack } = useNavigation();
    const { user } = useAuth();
    const { confirm } = useAppDialog();
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [userRole, setUserRole] = useState<string>(""); 
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
    const [currentUserName, setCurrentUserName] = useState<string>("");
    const [currentUserProfile, setCurrentUserProfile] = useState<{
        nombre?: string; name?: string; correo?: string; email?: string;
        puesto?: string; role?: string; departamento?: string;
    } | null>(null);
    const [userProfileResolved, setUserProfileResolved] = useState(false);

    const canEditBoard = useMemo(
        () => (userProfileResolved ? canUserEditFridayBoard(currentUserProfile) : false),
        [currentUserProfile, userProfileResolved]
    );

    const [rows, setRows] = useState<WorksheetData[]>([]);
    const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
    const [groupsConfig, setGroupsConfig] = useState<GroupData[]>([
        { id: "sitio", name: "Servicios en Sitio", color: "#2464A3", collapsed: false },
        { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false }
    ]);
    const [metrologos, setMetrologos] = useState<any[]>([]); 
    const [clientes, setClientes] = useState<any[]>([]); 
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const dragItemRef = useRef<DragItem | null>(null); 
    const [isThinking, setIsThinking] = useState(false);
    const [isReconcilingDrive, setIsReconcilingDrive] = useState(false);
    
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 300);
    const agBotRanRef = useRef(false);
    const driveReconcileInFlightRef = useRef(false);
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
        if (!canEditBoard) return;
        try {
            const cleanColumns = JSON.parse(JSON.stringify(colsToSave));
            await setDoc(doc(db, "tableros", "principal"), { columns: cleanColumns }, { merge: true });
        } catch (error) {
            showToast("Error al guardar configuración de columnas", "info");
        }
    };

    useEffect(() => {
        const fetchUser = async () => {
            setUserProfileResolved(false);
            if (user?.email) {
                const q = query(collection(db, "usuarios"), where("email", "==", user.email));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    const profile = {
                        nombre: data.nombre || data.name || user.name,
                        name: data.name || data.nombre,
                        correo: data.correo || data.email || user.email,
                        email: data.email || data.correo || user.email,
                        puesto: data.puesto || data.role,
                        role: data.role || data.puesto,
                        departamento: data.departamento,
                    };
                    setCurrentUserProfile(profile);
                    setCurrentUserName(profile.nombre || user.name || "Yo");
                    setUserRole((data.role || data.puesto || "").toLowerCase());
                } else {
                    setCurrentUserProfile({
                        nombre: user.name,
                        name: user.name,
                        correo: user.email,
                        email: user.email,
                        puesto: user.role,
                        role: user.role,
                    });
                    setCurrentUserName(user.name || "Yo");
                    setUserRole((user.role || "").toLowerCase());
                }
            } else {
                setCurrentUserProfile(null);
            }
            setUserProfileResolved(true);
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
                savedCols.forEach((c: any) => { if (!uniqueKeys.has(c.key)) { const def = DEFAULT_COLUMNS.find(d => d.key === c.key); merged.push({ ...(def || {}), ...c }); uniqueKeys.add(c.key); } });
                DEFAULT_COLUMNS.forEach(def => { if (!uniqueKeys.has(def.key)) { merged.push(def); uniqueKeys.add(def.key); } });
                setColumns(merged);
            } else { setColumns(DEFAULT_COLUMNS); }
        });
        const unsubMetrologos = onSnapshot(query(collection(db, "usuarios"), orderBy("name")), (snap) => { setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); });
        const unsubClientes = onSnapshot(query(collection(db, "clientes"), orderBy("nombre")), (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;
        const rowsQuery = query(
            collection(db, "hojasDeTrabajo"),
            where("fechaEntrada", ">=", yearStart),
            where("fechaEntrada", "<=", yearEnd)
        );
        const unsubRows = onSnapshot(rowsQuery, (snapshot) => {
            startTransition(() => {
                let newRows: WorksheetData[] = [];
                const yearStr = currentYear.toString();
                
                snapshot.forEach(doc => { 
                    const data = doc.data();
                    const recordYear = getRowYearStr({ ...data, docId: doc.id } as WorksheetData);

                    if (recordYear === yearStr) {
                        const baseRow = { 
                            ...data, docId: doc.id, id: data.id || "", nombre: responsableFromFirestore(data), fecha: data.fecha || data.fecha_calib, entregado: data.entregado === true, folioSalida: data.folioSalida 
                        } as WorksheetData;
                        newRows.push(baseRow); 
                    }
                });

                newRows.sort((a, b) => {
                    const dateA = a.createdAt || a.fechaEntrada || "0"; const dateB = b.createdAt || b.fechaEntrada || "0"; return dateB.localeCompare(dateA);
                });
                setRows(newRows); setIsLoadingData(false);
            });
        });
        return () => { unsubBoard(); unsubMetrologos(); unsubRows(); unsubClientes(); };
    }, [currentYear]); 

    const toReconcileRawRows = useCallback(
        (source: WorksheetData[]) =>
            source.map((r) => ({
                docId: r.docId,
                id: r.id,
                folio: r.folio,
                folioSalida: r.folioSalida,
                certificado: r.certificado,
                equipo: r.equipo,
                cliente: r.cliente,
                cargado_drive: r.cargado_drive,
                status_certificado: r.status_certificado,
                pdfURL: r.pdfURL,
            })),
        []
    );

    const showToast = (message: string, type: 'success' | 'info' | 'error') => {
        const id = Date.now().toString();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };

    const runAutoDriveReconcile = useCallback(
        async (source: "agbot" | "interval" | "manual" = "manual") => {
            if (!canEditBoard || driveReconcileInFlightRef.current) return;
            driveReconcileInFlightRef.current = true;
            if (source === "manual") setIsReconcilingDrive(true);
            try {
                const rawRows = toReconcileRawRows(rows);
                const preview = await reconcileWorksheetDriveFlags(rawRows, { dryRun: true });
                if (preview.candidates === 0) {
                    if (source === "manual") {
                        showToast(
                            `Drive verificado: ${preview.skippedVerified} fila(s) con carga real; ninguna corrección necesaria.`,
                            "success"
                        );
                    }
                    return;
                }
                const sample = preview.previews
                    .slice(0, 5)
                    .map(
                        (p) =>
                            `• ${p.equipo || p.cliente || p.docId.slice(0, 8)} (${p.before.cargado_drive}/${p.before.status_certificado})`
                    )
                    .join("\n");
                const extra = preview.candidates > 5 ? `\n… y ${preview.candidates - 5} más` : "";
                if (source === "manual") {
                    const ok = await confirm({
                        message:
                            `Se verificó fileMetadata (Drive). ${preview.candidates} fila(s) tienen Si/Generado sin archivo realizado.\n` +
                            `${preview.skippedVerified} fila(s) coinciden con Drive y NO se tocarán.\n\n${sample}${extra}\n\n¿Corregir solo las sin respaldo en Drive?`,
                        variant: 'warning',
                    });
                    if (!ok) return;
                }
                const result = await reconcileWorksheetDriveFlags(rawRows);
                if (result.corrected > 0) {
                    const prefix =
                        source === "agbot"
                            ? "🤖 AG-Bot Drive:"
                            : source === "interval"
                              ? "Drive (auto):"
                              : "Drive:";
                    showToast(
                        `${prefix} ${result.corrected} fila(s) corregida(s). ${result.skippedVerified} conservadas (Drive real).`,
                        source === "manual" ? "success" : "info"
                    );
                    if (source === "agbot") {
                        setAgBotThoughts((prev) =>
                            [
                                {
                                    id: Date.now(),
                                    type: "success" as const,
                                    message: `Drive: ${result.corrected} fila(s) reconciliada(s) automáticamente`,
                                    timestamp: new Date().toISOString(),
                                },
                                ...prev,
                            ].slice(0, 10)
                        );
                    }
                }
            } catch (e) {
                console.error("Drive reconcile:", e);
                if (source === "manual") showToast("Error al reconciliar con Drive", "error");
            } finally {
                driveReconcileInFlightRef.current = false;
                if (source === "manual") setIsReconcilingDrive(false);
            }
        },
        [canEditBoard, rows, toReconcileRawRows, confirm]
    );

    const handleReconcileDriveFlags = useCallback(
        async (dryRunOnly = false) => {
            if (!canEditBoard || isReconcilingDrive) return;
            if (dryRunOnly) {
                setIsReconcilingDrive(true);
                try {
                    const rawRows = toReconcileRawRows(rows);
                    const preview = await reconcileWorksheetDriveFlags(rawRows, { dryRun: true });
                    showToast(
                        preview.candidates === 0
                            ? `Drive verificado: ${preview.skippedVerified} fila(s) OK`
                            : `${preview.candidates} fila(s) sin respaldo en Drive (vista previa)`,
                        preview.candidates === 0 ? "success" : "info"
                    );
                } catch (e) {
                    console.error(e);
                    showToast("Error al reconciliar con Drive", "error");
                } finally {
                    setIsReconcilingDrive(false);
                }
                return;
            }
            await runAutoDriveReconcile("manual");
        },
        [canEditBoard, isReconcilingDrive, rows, toReconcileRawRows, runAutoDriveReconcile]
    );

    useEffect(() => {
        if (!userProfileResolved || !canEditBoard || isLoadingData || rows.length === 0 || agBotRanRef.current) return;
        const runAGBot = async () => {
            agBotRanRef.current = true;
            const batch = writeBatch(db); let updateCount = 0; const newThoughts: AGBotThought[] = [];
            rows.forEach(row => {
                let needsUpdate = false; const updates: any = {};
                if (!row.departamento || row.departamento === "") { const detected = detectDepartment(row.equipo || ""); if (detected) { updates.departamento = detected; needsUpdate = true; } }
                if ((!row.marca || row.marca === "") && row.modelo) { const inferredBrand = inferBrand(row.modelo); if (inferredBrand) { updates.marca = inferredBrand; needsUpdate = true; } }
                if (row.folio && row.folio !== row.folio.trim().toUpperCase()) { updates.folio = row.folio.trim().toUpperCase(); needsUpdate = true; }
                if (row.cliente && row.cliente !== row.cliente.trim().toUpperCase()) { updates.cliente = row.cliente.trim().toUpperCase(); needsUpdate = true; }
                if (row.id && row.id !== row.id.trim().toUpperCase()) { updates.id = row.id.trim().toUpperCase(); needsUpdate = true; }
                if (row.equipo && typeof row.equipo === 'string' && row.equipo !== row.equipo.trim()) { updates.equipo = row.equipo.trim(); needsUpdate = true; }

                const isLab = row.lugarCalibracion?.toLowerCase() === 'laboratorio'; const isSitio = row.lugarCalibracion?.toLowerCase() === 'sitio';
                if (isSitio) { if (row.status_equipo !== 'Calibrado') { updates.status_equipo = 'Calibrado'; needsUpdate = true; } if (row.ubicacion_real !== 'Servicio en Sitio') { updates.ubicacion_real = 'Servicio en Sitio'; needsUpdate = true; } } 
                else if (isLab) { if (row.folioSalida && row.folioSalida.trim() !== "") { if (row.ubicacion_real !== 'Entregado') { updates.ubicacion_real = 'Entregado'; needsUpdate = true; } } else { if (row.ubicacion_real !== 'Laboratorio' && row.ubicacion_real !== 'Recepción') { updates.ubicacion_real = 'Laboratorio'; needsUpdate = true; newThoughts.push({ id: Date.now() + Math.random(), type: 'warning', message: `Ubicación corregida a Laboratorio para ${row.id || 'equipo'}`, timestamp: new Date().toISOString() }); } } }

                if ((!row.fechaEntrada || row.fechaEntrada === "") && (row.fechaRecepcion && row.fechaRecepcion !== "")) { updates.fechaEntrada = row.fechaRecepcion; needsUpdate = true; } 
                else if (row.fechaEntrada && row.fechaEntrada !== row.fechaRecepcion) { updates.fechaRecepcion = row.fechaEntrada; needsUpdate = true; } 
                else if ((!row.fechaEntrada || row.fechaEntrada === "") && (!row.fechaRecepcion || row.fechaRecepcion === "")) { const fallbackDate = row.createdAt ? row.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]; updates.fechaEntrada = fallbackDate; updates.fechaRecepcion = fallbackDate; needsUpdate = true; newThoughts.push({ id: Date.now() + Math.random(), type: 'info', message: `Fecha de entrada auto-asignada para ${row.id || 'equipo'}`, timestamp: new Date().toISOString() }); }

                if (row.diasPromesa === undefined || row.diasPromesa === null || isNaN(Number(row.diasPromesa))) { updates.diasPromesa = 5; needsUpdate = true; }
                if (!row.status_equipo || row.status_equipo === "") { updates.status_equipo = 'Desconocido'; needsUpdate = true; }

                if (needsUpdate) { const rowRef = doc(db, "hojasDeTrabajo", row.docId); updates.lastUpdated = new Date().toISOString(); batch.update(rowRef, updates); updateCount++; }
            });

            if (updateCount > 0) {
                setIsThinking(true);
                try {
                    await batch.commit();
                    showToast(`🤖 AG-Bot: ${updateCount} dato(s) sincronizado(s)`, 'info');
                } catch (error) {
                    console.error('AG-Bot batch:', error);
                }
                setTimeout(() => setIsThinking(false), 1000);
            }

            if (newThoughts.length > 0) setAgBotThoughts(prev => [...newThoughts, ...prev].slice(0, 10));
            await runAutoDriveReconcile("agbot");
        };
        const timer = setTimeout(runAGBot, AGBOT_INITIAL_DELAY_MS);
        return () => clearTimeout(timer);
    }, [userProfileResolved, canEditBoard, isLoadingData, rows.length, runAutoDriveReconcile]);

    useEffect(() => {
        if (!userProfileResolved || !canEditBoard || isLoadingData || rows.length === 0) return;
        const tick = () => void runAutoDriveReconcile("interval");
        const initialTimer = setTimeout(tick, DRIVE_RECONCILE_INITIAL_MS);
        const intervalId = setInterval(tick, DRIVE_RECONCILE_INTERVAL_MS);
        return () => {
            clearTimeout(initialTimer);
            clearInterval(intervalId);
        };
    }, [userProfileResolved, canEditBoard, isLoadingData, currentYear, rows.length, runAutoDriveReconcile]);

    useEffect(() => {
        agBotRanRef.current = false;
    }, [currentYear]);

    const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));
    const handleSort = (key: string, direction: 'asc' | 'desc') => { setSortConfig({ key, direction }); setActiveColumnMenu(null); };
    const handleHide = async (key: string) => { if (!canEditBoard) return; const newCols = columns.map(c => c.key === key ? { ...c, hidden: true } : c); setColumns(newCols); setActiveColumnMenu(null); await saveColumnsToFirebase(newCols); };
    const handleUnhide = async (key: string) => { if (!canEditBoard) return; const newCols = columns.map(c => c.key === key ? { ...c, hidden: false } : c); setColumns(newCols); await saveColumnsToFirebase(newCols); };
    const handleResetLayout = async () => { if (!canEditBoard) return; if(await confirm({ message: "¿Restablecer vista original?", variant: 'warning' })) { setColumns(DEFAULT_COLUMNS); await saveColumnsToFirebase(DEFAULT_COLUMNS); window.location.reload(); } };
    const handleRename = async (key: string) => { if (!canEditBoard) return; const newName = prompt("Nuevo nombre:"); if (newName) { const newCols = columns.map(c => c.key === key ? { ...c, label: newName } : c); setColumns(newCols); await saveColumnsToFirebase(newCols); } setActiveColumnMenu(null); };
    
    const handleAddColumn = async () => {
        if (!canEditBoard) return;
        const name = prompt("Nombre de la nueva columna:"); if (!name) return;
        const newKey = `col_${Date.now()}`;
        const newCol: Column = { key: newKey, label: name, type: 'text', width: 150, hidden: false, sticky: false, permissions: [] };
        const newColumns = [...columns, newCol]; setColumns(newColumns); await saveColumnsToFirebase(newColumns); showToast("Columna agregada y guardada", "success");
    };
    
    const handleFilter = (key: string, value: string) => { setActiveFilters(prev => ({ ...prev, [key]: value })); setActiveColumnMenu(null); };
    const handleOpenPermissions = (e: any, key: string) => { setPermissionMenu({ x: e.clientX, y: e.clientY, colKey: key }); setActiveColumnMenu(null); };
    
    const handleTogglePermission = async (roleId: string) => {
        if (!canEditBoard || !permissionMenu) return;
        const targetCol = columns.find(c => c.key === permissionMenu.colKey); if (!targetCol) return;
        let currentPerms = targetCol.permissions || [];
        if (currentPerms.includes(roleId)) currentPerms = currentPerms.filter(p => p !== roleId); else currentPerms = [...currentPerms, roleId];
        const newCols = columns.map(c => c.key === permissionMenu.colKey ? { ...c, permissions: currentPerms } : c);
        setColumns(newCols); await saveColumnsToFirebase(newCols);
    };

    const handleUpdateMetrologoColor = async (userId: string, newColor: string) => {
        if (!canEditBoard) return;
        await updateDoc(doc(db, "usuarios", userId), { color: newColor });
    };

    const handleAddRow = useCallback(async (groupId: string) => {
        if (!canEditBoard) return;
        const docRef = doc(collection(db, "hojasDeTrabajo"));
        let initialStatus = 'Desconocido'; let initialLocation = '';
        if (groupId === 'sitio') { initialStatus = 'Calibrado'; initialLocation = 'Servicio en Sitio'; } else if (groupId === 'laboratorio') { initialLocation = 'Laboratorio'; }
        const now = new Date(); const fechaEntradaStr = now.toISOString().split('T')[0]; 
        const newRowData = { id: "", folio: "", cliente: "", equipo: "", lugarCalibracion: groupId, status_equipo: initialStatus, ubicacion_real: initialLocation, nombre: currentUserName, assignedTo: currentUserName, createdAt: now.toISOString(), fechaEntrada: fechaEntradaStr, fechaRecepcion: fechaEntradaStr, diasPromesa: 5, status_certificado: 'Pendiente de Certificado', cargado_drive: 'No' };
        await setDoc(docRef, newRowData); showToast("Fila agregada correctamente", 'success');
    }, [currentUserName, canEditBoard]);

    const handleUpdateRow = useCallback(async (rowId: string, key: string, value: any) => {
        const targetRow = rows.find((r) => r.docId === rowId);
        const canEditDriveAsTech =
            key === "cargado_drive" &&
            !!targetRow &&
            isTechnicianOwnerOfRow(targetRow, currentUserName);
        if (!canEditBoard && !canEditDriveAsTech) return;
        setRows(prevRows => prevRows.map(r => {
            if (r.docId === rowId) {
                const updated = { ...r, [key]: value };
                if (key === "nombre") {
                    updated.nombre = value;
                    updated.assignedTo = value;
                }
                if (key === "ubicacion_real") { if (value === "Servicio en Sitio") updated.lugarCalibracion = "sitio"; if (value === "Laboratorio" || value === "Recepción") updated.lugarCalibracion = "laboratorio"; }
                return updated;
            }
            return r;
        }));
        try {
            const batch = writeBatch(db); const rowRef = doc(db, "hojasDeTrabajo", rowId);
            let updates: any = { [key]: value, lastUpdated: new Date().toISOString() };
            if (key === "nombre") {
                updates = { nombre: value, assignedTo: value, lastUpdated: new Date().toISOString() };
            }
            if (key === "ubicacion_real") { if (value === "Servicio en Sitio") updates.lugarCalibracion = "sitio"; else if (value === "Laboratorio" || value === "Recepción") updates.lugarCalibracion = "laboratorio"; }
            batch.update(rowRef, updates);
            const oldValue = rows.find(r => r.docId === rowId)?.[key];
            const historyRef = collection(db, `hojasDeTrabajo/${rowId}/history`); const historyDoc = doc(historyRef);
            batch.set(historyDoc, { field: key, oldValue: oldValue || "", newValue: value, user: currentUserName, timestamp: new Date().toISOString() });
            await batch.commit();

            if (key === "cargado_drive" && isRealizadoValue(value)) {
                const row = rows.find((r) => r.docId === rowId);
                if (row) {
                    const rowData = { ...row, [key]: value };
                    const markedBy =
                        getResponsableName(rowData) ||
                        currentUserName;
                    const synced = await markDriveFileCompletedForWorksheet(rowData, markedBy, {
                        worksheetDocId: rowId,
                    });
                    if (!synced) {
                        await notificarCalidadRevisionPendiente({
                            worksheetDocId: rowId,
                            equipmentId: String(row.id || "").trim(),
                            cliente: String(row.cliente || "").trim(),
                            fecha: String(row.fecha || row.fechaEntrada || "").trim(),
                            tecnicoNombre: markedBy,
                        });
                    }
                }
            }
        } catch (error) { showToast("Error de conexión al guardar", 'error'); }
    }, [rows, currentUserName, canEditBoard]);

    const handleDeleteSelected = async () => {
        if (!canEditBoard) return;
        if (!(await confirm({ message: `¿Eliminar ${selectedIds.size} elementos?`, variant: 'danger', confirmLabel: 'Eliminar' }))) return;
        const batch = writeBatch(db); selectedIds.forEach(id => { batch.delete(doc(db, "hojasDeTrabajo", id)); });
        setSelectedIds(new Set()); await batch.commit(); showToast("Elementos eliminados", 'success');
    };

    const handleBulkAssignResponsable = useCallback(async (newResponsable: string) => {
        if (!canEditBoard) return;
        const ids = Array.from(selectedIdsRef.current);
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        const timestamp = new Date().toISOString();
        const oldValuesById = new Map<string, string>();

        setRows((prevRows) =>
            prevRows.map((r) => {
                if (!idSet.has(r.docId)) return r;
                oldValuesById.set(r.docId, getResponsableName(r));
                return { ...r, nombre: newResponsable, assignedTo: newResponsable, lastUpdated: timestamp };
            })
        );

        try {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                for (const rowId of chunk) {
                    const oldValue = oldValuesById.get(rowId) ?? "";
                    batch.update(doc(db, "hojasDeTrabajo", rowId), {
                        nombre: newResponsable,
                        assignedTo: newResponsable,
                        lastUpdated: timestamp,
                    });
                    batch.set(doc(collection(db, `hojasDeTrabajo/${rowId}/history`)), {
                        field: "nombre",
                        oldValue: oldValue || "",
                        newValue: newResponsable,
                        user: currentUserName,
                        timestamp,
                    });
                }
                await batch.commit();
            }
            const label = newResponsable || "Sin asignar";
            showToast(`Responsable actualizado en ${ids.length} fila(s): ${label}`, "success");
        } catch {
            showToast("Error al asignar responsable", "error");
        }
    }, [canEditBoard, currentUserName]);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            selectedIdsRef.current = next;
            return next;
        });
    }, []);
    const startResize = (e: React.MouseEvent, colKey: string, currentWidth: number) => { if (!canEditBoard) return; e.preventDefault(); e.stopPropagation(); setIsResizing(true); resizingRef.current = { startX: e.clientX, startWidth: currentWidth, key: colKey }; document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); };
    const handleMouseMove = useCallback((e: MouseEvent) => { if (!resizingRef.current) return; const { startX, startWidth, key } = resizingRef.current; const diff = e.clientX - startX; const newWidth = Math.max(50, startWidth + diff); setColumns(prevCols => prevCols.map(col => col.key === key ? { ...col, width: newWidth } : col)); }, []);
    const handleMouseUp = useCallback(async () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        resizingRef.current = null;
    }, []);
    const onDragStart = useCallback((e: React.DragEvent, item: DragItem) => { if (!canEditBoard) { e.preventDefault(); return; } if (item.type === 'column' && columns[item.index].sticky) { e.preventDefault(); return; } dragItemRef.current = item; e.dataTransfer.effectAllowed = "move"; if (e.target instanceof HTMLElement) e.target.style.opacity = '0.5'; }, [columns, canEditBoard]);
    const onDragEnd = (e: React.DragEvent) => { if (e.target instanceof HTMLElement) e.target.style.opacity = '1'; dragItemRef.current = null; };
    const onDrop = useCallback(async (e: React.DragEvent, target: DragItem) => {
        if (!canEditBoard) return;
        e.preventDefault(); const dragItem = dragItemRef.current; if (!dragItem) return;
        if (dragItem.type === 'column' && target.type === 'column') {
             const fromIdx = dragItem.index; const toIdx = target.index; if(columns[toIdx].sticky || columns[fromIdx].sticky) return;
             let newCols = [...columns]; const [moved] = newCols.splice(fromIdx, 1); newCols.splice(toIdx, 0, moved); setColumns(newCols); await saveColumnsToFirebase(newCols);
        }
    }, [columns, canEditBoard]); 

    const handleExportCSV = () => {
        const headers = columns.filter(c => !c.hidden).map(c => c.label).join(",");
        const csvRows = groupedRows.flatMap(group => group.rows).map(row => { return columns.filter(c => !c.hidden).map(c => { let val = row[c.key] || ""; if(c.key === 'folio' && row.lugarCalibracion === 'laboratorio') val = row.folioSalida || ""; return `"${String(val).replace(/"/g, '""')}"`; }).join(","); }).join("\n");
        const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + csvRows; const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `tablero_${currentYear}.csv`); document.body.appendChild(link); link.click();
    };

    const searchBlobByDocId = useMemo(() => {
        const map = new Map<string, string>();
        for (const row of rows) map.set(row.docId, buildRowSearchBlob(row));
        return map;
    }, [rows]);

    const groupedRows = useMemo(() => {
        const searchTerm = normalizeText(debouncedSearch);
        let filtered = rows;

        if (searchTerm) {
            filtered = rows.filter((r) => searchBlobByDocId.get(r.docId)?.includes(searchTerm));
        }

        const filterEntries = Object.entries(activeFilters).filter(([, val]) => val);
        if (filterEntries.length > 0) {
            filtered = filtered.filter((r) => filterEntries.every(([key, val]) => r[key] === val));
        }

        if (sortConfig.key) {
            const key = sortConfig.key;
            filtered = [...filtered].sort((a, b) => {
                const valA = a[key] || "";
                const valB = b[key] || "";
                if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
                if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
                return 0;
            });
        }

        return groupsConfig.map((group) => ({
            ...group,
            rows: filtered.filter((r) => (r.lugarCalibracion || "").toLowerCase() === group.id),
        }));
    }, [rows, groupsConfig, debouncedSearch, sortConfig, activeFilters, searchBlobByDocId]);

    const visibleRowCount = useMemo(
        () => groupedRows.reduce((sum, g) => sum + g.rows.length, 0),
        [groupedRows]
    );

    const boardStats = useMemo(() => ({
        sitio: groupedRows.find((g) => g.id === "sitio")?.rows.length ?? 0,
        laboratorio: groupedRows.find((g) => g.id === "laboratorio")?.rows.length ?? 0,
    }), [groupedRows]);

    const hiddenColumns = useMemo(() => columns.filter((c) => c.hidden), [columns]);
    const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);
    const hasActiveFilters = useMemo(
        () => Object.values(activeFilters).some(Boolean) || debouncedSearch.trim().length > 0,
        [activeFilters, debouncedSearch]
    );

    const getUniqueValuesForColumn = useCallback((key: string) => {
        return [...new Set(rows.map((r) => String(r[key] ?? "")))].sort((a, b) => a.localeCompare(b, "es"));
    }, [rows]);

    const clearBoardFilters = useCallback(() => {
        setSearch("");
        setActiveFilters({});
        setSortConfig({ key: null, direction: "asc" });
    }, []);

    const selectionSignature = useMemo(
        () => Array.from(selectedIds).sort().join("\0"),
        [selectedIds]
    );

    const boardRowSharedProps: Omit<BoardRowSharedProps, "rows" | "groupId" | "groupColor"> = useMemo(() => ({
        columns,
        selectedIds,
        selectionSignature,
        onToggleSelect: toggleSelect,
        onUpdateRow: handleUpdateRow,
        metrologos,
        clientes,
        onDragStart,
        onDrop,
        onDragEnd,
        canEditBoard,
        currentUserName,
        onOpenComments: setActiveCommentRow,
        onOpenHistory: setActiveHistoryRow,
        onUpdateMetrologoColor: handleUpdateMetrologoColor,
    }), [columns, selectedIds, selectionSignature, toggleSelect, handleUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd, canEditBoard, currentUserName, handleUpdateMetrologoColor]);

    let headerStickyOffset = 40;

    return (
        /* ¡MAGIA AQUÍ! El fixed inset-0 z-[100] ocultará tu sidebar lateral aplastando el layout superior */
        <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-100 font-sans text-slate-800 w-full overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 bg-white relative transition-all w-full">
                
                {/* Chrome AG — el tablero (#main-board-scroll) no se modifica */}
                <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 bg-white sticky top-0 z-40 w-full shadow-sm">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <button onClick={goBack} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0" title="Regresar al Menú" aria-label="Regresar al Menú">
                            <ArrowLeft className="w-5 h-5"/>
                        </button>
                        <div className="flex items-center gap-3 border-r border-slate-200 pr-3 sm:pr-4 shrink-0">
                             <img src={labLogo} alt="AG Metrology Logo" className="h-9 w-auto object-contain" draggable={false} />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <h1 className="text-lg sm:text-xl font-semibold leading-tight flex flex-wrap items-center gap-2 text-slate-900 tracking-tight">
                                Tablero de Calibración
                                <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                    <button onClick={() => setCurrentYear(2025)} className={clsx("px-3 py-1 rounded-md text-xs font-semibold transition-all", currentYear === 2025 ? "bg-white text-[#2464A3] shadow-sm" : "text-slate-500 hover:text-slate-800")}>2025</button>
                                    <button onClick={() => setCurrentYear(2026)} className={clsx("px-3 py-1 rounded-md text-xs font-semibold transition-all", currentYear === 2026 ? "bg-white text-[#2464A3] shadow-sm" : "text-slate-500 hover:text-slate-800")}>2026</button>
                                </div>
                            </h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input placeholder="Buscar en tablero..." className="pl-9 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/15 outline-none transition-all bg-white w-56 sm:w-72 shadow-sm" value={search} onChange={e => setSearch(e.target.value)} />
                            {search !== debouncedSearch && <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#2464A3] animate-spin" />}
                        </div>
                        
                        <div className={clsx("p-2 rounded-lg transition-all", isThinking ? "text-purple-600 bg-purple-50 animate-pulse" : "text-slate-400")} title="AG-Bot Activo"><Brain size={18}/></div>
                        <AGBotWidget
                            thoughts={agBotThoughts}
                        />

                        <button onClick={handleExportCSV} className="p-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-2 shadow-sm" title="Exportar a Excel"><Download size={18}/><span className="text-xs font-bold hidden md:inline">Exportar</span></button>
                        {canEditBoard && (
                            <button
                                onClick={() => handleReconcileDriveFlags(false)}
                                disabled={isReconcilingDrive}
                                className="p-2 text-[#2464A3] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                                title="Verifica fileMetadata (Drive) y corrige filas Si/Generado sin respaldo real"
                            >
                                {isReconcilingDrive ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                                <span className="text-xs font-bold hidden md:inline">Reconciliar Drive</span>
                            </button>
                        )}
                        {canEditBoard && (
                            <button onClick={handleResetLayout} className="p-2 text-slate-500 hover:bg-slate-100 hover:text-[#2464A3] rounded-lg transition-colors shadow-sm border border-slate-200" title="Restablecer vista original"><RotateCcw size={18}/></button>
                        )}
                        {userProfileResolved && !canEditBoard && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#2464A3] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-md">
                                <Eye className="w-3.5 h-3.5" /> Modo lectura
                            </span>
                        )}
                    </div>
                </div>

                <div className="px-4 sm:px-6 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3 sticky top-[57px] z-[35]">
                    <span className="text-xs font-semibold text-slate-600">{visibleRowCount} elementos visibles</span>
                    <span className="text-[10px] font-bold text-[#2464A3] bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">Sitio {boardStats.sitio}</span>
                    <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">Lab {boardStats.laboratorio}</span>
                    {Object.entries(activeFilters).filter(([, v]) => v).map(([key, val]) => {
                        const col = columns.find((c) => c.key === key);
                        return (
                            <button key={key} onClick={() => handleFilter(key, "")} className="text-[10px] bg-white border border-gray-200 rounded-full px-2 py-0.5 flex items-center gap-1 hover:border-red-200">
                                {col?.label || key}: {val} <X size={10} />
                            </button>
                        );
                    })}
                    {hasActiveFilters && (
                        <button onClick={clearBoardFilters} className="text-xs text-blue-600 hover:underline font-medium ml-auto">Limpiar vista</button>
                    )}
                </div>

                <div className="flex-1 overflow-auto bg-white w-full" id="main-board-scroll">
                    <div className="inline-block min-w-full pb-32">
                        <HiddenColumnsBar hiddenColumns={hiddenColumns} onUnhide={handleUnhide} />

                        <div className="flex border-b border-[#e6e9ef] sticky top-0 z-30 bg-[#f5f6f8] h-[40px]">
                            <div className="w-1.5 bg-[#f5f6f8] sticky left-0 z-30"></div>
                            <div className="w-[40px] border-r border-[#e6e9ef] bg-[#f5f6f8] sticky left-1.5 z-30 flex items-center justify-center"><input type="checkbox" className="rounded border-gray-300 text-[#2464A3]" /></div>
                            
                            {visibleColumns.map((col, index) => {
                                const style: React.CSSProperties = { width: col.width, zIndex: col.sticky ? 30 : undefined };
                                if (col.sticky) { style.position = 'sticky'; style.left = headerStickyOffset + 1.5; headerStickyOffset += col.width; }
                                const isLocked = col.permissions && col.permissions.length > 0 && !col.permissions.includes(userRole);
                                return (
                                <div key={col.key} draggable={canEditBoard && !col.sticky && !isResizing} onDragStart={(e) => onDragStart(e, { type: 'column', index })} onDragOver={(e) => e.preventDefault()} onDragEnd={onDragEnd} onDrop={(e) => onDrop(e, { type: 'column', index })} style={style} className={clsx("px-3 text-[12px] font-semibold text-[#8B8D8C] flex items-center justify-center border-r border-[#e6e9ef] hover:bg-[#eceef3] select-none bg-[#f5f6f8] group hover:text-[#323338] transition-colors relative", col.sticky ? "shadow-[1px_0_3px_rgba(0,0,0,0.04)]" : "cursor-pointer")}>
                                    <span className="truncate flex items-center gap-1 flex-1 justify-center">{col.label} {isLocked && <Lock className="w-2.5 h-2.5 text-gray-300" />}{activeFilters[col.key] && <Filter size={10} className="text-blue-500 fill-blue-500"/>}</span>
                                    <button onClick={(e) => { e.stopPropagation(); setActiveColumnMenu(activeColumnMenu === col.key ? null : col.key); }} className="p-0.5 rounded hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1"><MoreHorizontal className="w-3 h-3 text-gray-500" /></button>
                                    {!col.sticky && (<div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-50 transition-colors opacity-0 hover:opacity-100" onMouseDown={(e) => startResize(e, col.key, col.width)} onClick={(e) => e.stopPropagation()}></div>)}
                                    {activeColumnMenu === col.key && ( <ColumnOptions colKey={col.key} currentLabel={col.label} uniqueValues={getUniqueValuesForColumn(col.key)} onClose={() => setActiveColumnMenu(null)} onSort={handleSort} onHide={handleHide} onRename={handleRename} onFilter={handleFilter} onPermissions={(k:string) => handleOpenPermissions(window.event, k)} /> )}
                                </div>
                            )})}
                            {canEditBoard && (
                                <div className="px-2 border-r border-transparent flex items-center justify-center cursor-pointer hover:bg-gray-50 group transition-colors" onClick={handleAddColumn} title="Agregar columna"><Plus size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" /></div>
                            )}
                            <div className="flex-1 border-b border-gray-100 min-w-[50px]"></div>
                        </div>

                        <div className="px-4 mt-6">
                            {isLoadingData ? (
                                <div className="p-10 flex flex-col items-center justify-center gap-3"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div><p className="text-gray-400 text-sm font-medium">Cargando tablero...</p></div>
                            ) : (
                                groupedRows.map((group) => (
                                    <div key={group.id} className="mb-10">
                                        <div className="flex items-center mb-2 group sticky left-0 z-10 px-3 py-2 rounded-lg hover:bg-white/80 transition-colors border border-[#e6e9ef] bg-white shadow-sm">
                                            <div className="w-1 h-6 rounded-full mr-2 shrink-0" style={{ backgroundColor: group.color }} />
                                            <ChevronDown className={clsx("w-5 h-5 transition-transform cursor-pointer p-0.5 rounded hover:bg-[#f5f6f8] text-[#8B8D8C]", group.collapsed && "-rotate-90", isPending && "opacity-50")} onClick={() => { startTransition(() => { const newConf = groupsConfig.map(g => g.id === group.id ? {...g, collapsed: !g.collapsed} : g); setGroupsConfig(newConf); }); }} />
                                            <h2 className="text-[15px] font-semibold ml-1 text-[#323338]">{group.name}</h2>
                                            <span className="ml-3 text-[11px] text-[#8B8D8C] font-medium border border-[#e6e9ef] px-2.5 py-0.5 rounded-full bg-[#f5f6f8]">{group.rows.length}</span>
                                        </div>
                                        {!group.collapsed && (
                                            <div className="rounded-lg overflow-hidden border border-[#e6e9ef] bg-white min-h-[50px]">
                                                <GroupRowsBody
                                                    {...boardRowSharedProps}
                                                    rows={group.rows}
                                                    groupId={group.id}
                                                    groupColor={group.color}
                                                />
                                                {canEditBoard && (
                                                <div className="flex border-b border-[#e6e9ef] bg-white group hover:bg-[#f5f6f8]" style={{ height: ROW_HEIGHT_PX }}>
                                                    <div className="sticky left-0 z-20 flex bg-white group-hover:bg-gray-50">
                                                        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }}></div>
                                                        <div className="w-[40px] flex-shrink-0 border-r border-[#e6e9ef]"></div>
                                                        {columns.filter(c => c.sticky && !c.hidden).map(c => ( <div key={c.key} style={{width: c.width}} className="border-r border-[#e6e9ef] flex-shrink-0"></div> ))}
                                                    </div>
                                                    <div className="flex-1 flex items-center px-2 relative">
                                                        <input type="text" placeholder="+ Nuevo Equipo" className="outline-none text-sm w-[200px] h-full placeholder-gray-400 bg-transparent absolute left-2 font-medium" onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRow(group.id); (e.target as HTMLInputElement).value = ''; } }} />
                                                        <button onClick={() => handleAddRow(group.id)} className="ml-[200px] text-xs bg-blue-600 text-white px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity font-medium shadow-sm">Agregar</button>
                                                    </div>
                                                </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <FridaySelectionBar
                    count={selectedIds.size}
                    canEdit={canEditBoard}
                    metrologos={metrologos}
                    onAssign={handleBulkAssignResponsable}
                    onDelete={handleDeleteSelected}
                    onClear={() => setSelectedIds(new Set())}
                />

                {canEditBoard && permissionMenu && (<PermissionMenu x={permissionMenu.x} y={permissionMenu.y} column={columns.find(c => c.key === permissionMenu.colKey)!} onClose={() => setPermissionMenu(null)} onTogglePermission={handleTogglePermission}/>)}
                {activeCommentRow && (<CommentsPanel row={activeCommentRow} onClose={() => setActiveCommentRow(null)} canPost={canEditBoard} />)}
                {activeHistoryRow && (<HistoryPanel row={activeHistoryRow} onClose={() => setActiveHistoryRow(null)} />)}
                <ToastContainer toasts={toasts} removeToast={removeToast} />
            </div>
        </div>
    );
};

export default FridayScreen;