import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, Trash2, ChevronDown, Search, 
  Bell, UserCircle, Calendar, GripVertical, X, 
  Menu, Building2, ArrowLeft, Settings,
  ArrowUp, ArrowDown, ArrowUpDown, Archive, CheckCircle2, 
  Lock, Shield, Check, Briefcase, MessageSquare, Send,
  Clock, AlertTriangle, AlertCircle
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, query, where, onSnapshot, setDoc, writeBatch, orderBy, addDoc, getDocs } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from "../hooks/useAuth"; 

// --- TIPOS ---
type CellType = "text" | "number" | "dropdown" | "date" | "person" | "client" | "sla";

// --- CONFIGURACIÓN DE ROLES Y PUESTOS ---
const AVAILABLE_PROFILES = [
    { id: 'admin', label: 'Administrador', type: 'role' }, 
    { id: 'metrologo', label: 'Metrólogo', type: 'puesto' },
    { id: 'calidad', label: 'Calidad', type: 'puesto' },
    { id: 'logistica', label: 'Logística', type: 'puesto' },
    { id: 'ventas', label: 'Ventas', type: 'puesto' }
];

// --- COLORES POR USUARIO (Para pintar la fila) ---
const USER_ROW_COLORS: Record<string, string> = {
    "Juan Perez": "#e3f2fd", // Azul suave
    "Ana Gomez": "#f3e5f5",  // Lila suave
    "Carlos": "#e8f5e9",     // Verde suave
    "Admin": "#fff3e0"       // Naranja suave
};

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
    id?: string;    
    index?: number; 
}

// --- CONFIGURACIÓN VISUAL (ESTADOS Y COLORES) ---
const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  // Estados generales
  pending: { label: "Pendiente", bg: "#c4c4c4" },
  in_progress: { label: "En Proceso", bg: "#fdab3d" },
  completed: { label: "Listo", bg: "#00c875" },
  cancelled: { label: "Estancado", bg: "#e2445c" },
  
  // Estados Flujo (Monday Style)
  "Desconocido": { label: "Desconocido", bg: "#c4c4c4" },
  "En Revisión": { label: "En Revisión", bg: "#fdab3d" },
  "Calibrado": { label: "Calibrado", bg: "#00c875" },
  "Rechazado": { label: "Rechazado", bg: "#e2445c" },
  
  // SLA
  "A Tiempo": { label: "A Tiempo", bg: "#00c875" },
  
  // CERTIFICADOS (Coinciden con DriveScreen)
  "Pendiente de Certificado": { label: "Pendiente Cert.", bg: "#0086c0" },
  "Generado": { label: "Generado", bg: "#a25ddc" }, // Morado (Drive)
  "Firmado": { label: "Firmado", bg: "#00c875" },   // Verde (Listo)
  
  // Ubicación
  "Servicio en Sitio": { label: "Servicio en Sitio", bg: "#a25ddc" },
  "Laboratorio": { label: "Laboratorio", bg: "#579bfc" },
  "Recepción": { label: "Recepción", bg: "#fdab3d" },
  "Entregado": { label: "Entregado", bg: "#00c875" },
  
  // Booleanos
  "No": { label: "No", bg: "#e2445c" },
  "Si": { label: "Si", bg: "#00c875" }
};

const DEFAULT_COLUMNS: Column[] = [
  // IDENTIFICADORES
  { key: 'folio', label: 'Folio', width: 80, type: "text", sticky: true, permissions: ['admin', 'ventas'] }, 
  { key: 'cliente', label: 'Cliente', width: 200, type: "client", permissions: ['admin', 'ventas', 'logistica'] },
  { key: 'equipo', label: 'Equipo', width: 180, type: "text", permissions: ['admin', 'metrologo'] },
  { key: 'id', label: 'ID Interno', width: 100, type: "text", permissions: ['admin', 'metrologo'] },

  // INFORMACIÓN TÉCNICA
  { key: 'marca', label: 'Marca', width: 120, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 120, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
  { key: 'assignedTo', label: 'Técnico', width: 120, type: "person", permissions: ['admin', 'logistica'] },

  // CRONOGRAMA AUTOMÁTICO (SLA)
  { key: 'createdAt', label: 'Cronograma (SLA)', width: 150, type: "sla" },

  // FLUJO DE TRABAJO (1, 2, 3...)
  { key: 'status_equipo', label: '1-Estatus del Equipo', width: 160, type: "dropdown", options: ["Desconocido", "En Revisión", "Calibrado", "Rechazado"] },
  { key: 'fecha_calib', label: '2-Fecha de Calib.', width: 130, type: "date" },
  { key: 'n_certificado', label: '3-N. Certificado', width: 140, type: "text" },
  
  // ESTO SE ACTUALIZA DESDE DRIVE AUTOMÁTICAMENTE (Opciones Clave)
  { key: 'status_certificado', label: '4-Estatus Certificado', width: 170, type: "dropdown", options: ["Pendiente de Certificado", "Generado", "Firmado"] },
  
  { key: 'cargado_drive', label: '5-Cargado en Drive', width: 140, type: "dropdown", options: ["No", "Si"] },
  
  // LOGÍSTICA
  { key: 'ubicacion_real', label: '6-Ubicación Real', width: 160, type: "dropdown", options: ["Servicio en Sitio", "Laboratorio", "Recepción", "Entregado"] },
  { key: 'departamento', label: 'Departamento', width: 140, type: "text", permissions: ['logistica', 'admin'] },
];

// --- UTILIDADES ---
const addBusinessDays = (startDate: Date, daysToAdd: number) => {
    let currentDate = new Date(startDate);
    let added = 0;
    while (added < daysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) added++; // Saltar Sábado (6) y Domingo (0)
    }
    return currentDate;
};

// --- COMPONENTES DE CELDAS ---

const SLACell = React.memo(({ createdAt }: { createdAt: string }) => {
    if (!createdAt) return <div className="w-full h-full flex items-center justify-center text-gray-300">-</div>;

    const start = new Date(createdAt);
    const deadline = addBusinessDays(start, 5); // 5 Días hábiles de SLA
    const now = new Date();
    
    // Resetear horas para comparación pura de días
    const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffTime = deadlineDay.getTime() - currentDay.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let bgClass = "bg-[#00c875] text-white"; // Verde (A tiempo)
    let label = `${diffDays} días`;
    let icon = <Clock size={12} />;

    if (diffDays <= 2 && diffDays > 0) {
        bgClass = "bg-[#fdab3d] text-white"; // Naranja (Atención)
        label = `${diffDays} días`;
    } else if (diffDays === 0) {
        bgClass = "bg-[#e2445c] text-white"; // Rojo (Hoy)
        label = "Vence Hoy";
        icon = <AlertCircle size={12} />;
    } else if (diffDays < 0) {
        bgClass = "bg-[#333333] text-white"; // Negro/Gris oscuro (Vencido)
        label = `Vencido (${Math.abs(diffDays)})`;
        icon = <AlertTriangle size={12} />;
    }

    const dateStr = deadline.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });

    return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50/30">
            <div className={clsx("flex flex-col items-center justify-center w-[90%] py-1 rounded", bgClass)}>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                    {icon} {label}
                </div>
                <span className="text-[9px] opacity-90">{dateStr}</span>
            </div>
        </div>
    );
});

const TextCell = React.memo(({ value, onChange, placeholder, disabled }: { value: string, onChange: (val: string) => void, placeholder?: string, disabled?: boolean }) => {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== inputRef.current) setLocalValue(value || ""); }, [value]);
  const handleBlur = () => { if (!disabled && localValue !== value) onChange(localValue); };
  
  if (disabled) return <div className="w-full h-full px-3 flex items-center text-xs text-gray-500 truncate cursor-not-allowed bg-gray-50/20 italic select-none" title="Solo lectura">{value}</div>;

  return (
    <input ref={inputRef} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder}
        className="w-full h-full px-3 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-[#0073ea] focus:z-10 transition-all text-xs truncate placeholder-gray-300 font-medium text-gray-700" 
    />
  );
});

const ClientCell = React.memo(({ value, clientes, onChange, disabled }: { value: string, clientes: any[], onChange: (val: string) => void, disabled?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = useMemo(() => {
        if (!isOpen) return [];
        if (!searchTerm) return clientes;
        return clientes.filter(c => (c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()));
    }, [clientes, searchTerm, isOpen]);

    if (disabled) return <div className="w-full h-full px-3 flex items-center text-xs text-gray-500 truncate cursor-not-allowed bg-gray-50/20 italic select-none">{value || "-"}</div>;

    return (
        <div className="w-full h-full relative group">
            <div className="w-full h-full px-3 flex items-center cursor-pointer hover:bg-black/5" onClick={() => { setIsOpen(true); setSearchTerm(""); }}>
                {value ? <span className="text-xs text-blue-800 truncate font-bold flex items-center gap-2"><Building2 size={12} className="text-blue-400"/> {value}</span> : <span className="text-xs text-gray-300 flex items-center gap-1 italic"><Plus className="w-3 h-3"/> Cliente</span>}
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-0 left-0 w-[260px] bg-white shadow-2xl rounded-lg border border-blue-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[300px]">
                        <div className="relative mb-2 shrink-0"><Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400"/><input autoFocus placeholder="Buscar empresa..." className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:border-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                        <div className="overflow-y-auto flex-1 space-y-1">
                            {filtered.length > 0 ? filtered.map(c => (
                                <div key={c.id} className="px-2 py-2 hover:bg-blue-50 cursor-pointer rounded flex items-center gap-2" onClick={() => { onChange(c.nombre); setIsOpen(false); }}>
                                    <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Building2 className="w-3 h-3"/></div><span className="text-xs text-gray-700 font-medium">{c.nombre}</span>
                                </div>
                            )) : <div className="text-xs text-gray-400 text-center py-2">No encontrado</div>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});

const DropdownCell = React.memo(({ value, options, onChange, disabled }: { value: string, options: string[], onChange: (val: string) => void, disabled?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const configItem = STATUS_CONFIG[value] || { label: value || "-", bg: "#c4c4c4" };
  
  if (disabled) {
      return (
        <div className="w-full h-full flex items-center justify-center opacity-70 cursor-not-allowed bg-gray-50/10">
            <div className="text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm uppercase tracking-wider" style={{ backgroundColor: configItem.bg }}>
                 {configItem.label}
                 <Lock className="w-2.5 h-2.5 text-white/70" />
            </div>
        </div>
      );
  }

  return (
    <div className="w-full h-full relative p-1">
      <div className="w-full h-full flex items-center justify-center text-white text-[11px] font-bold cursor-pointer hover:brightness-110 relative transition-all shadow-sm uppercase tracking-wide" style={{ backgroundColor: configItem.bg }} onClick={() => setIsOpen(!isOpen)}>
         <span className="truncate px-1 text-center">{configItem.label}</span>
         <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100"><ChevronDown size={10}/></div>
      </div>
      {isOpen && (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
            <div className="absolute top-full left-0 w-[180px] bg-white shadow-xl rounded-lg border border-gray-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
               {options?.map(opt => {
                 const optConfig = STATUS_CONFIG[opt] || { label: opt, bg: "#ccc" };
                 return (
                    <div key={opt} className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors" onClick={() => { onChange(opt); setIsOpen(false); }}>
                        <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ background: optConfig.bg }}></div>
                        <span className="text-xs font-medium text-gray-700">{optConfig.label}</span>
                    </div>
                 );
               })}
            </div>
        </>
      )}
    </div>
  );
});

const DateCell = React.memo(({ value, onChange, disabled }: { value: string, onChange: (val: string) => void, disabled?: boolean }) => {
    const displayDate = value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null;
    const inputRef = useRef<HTMLInputElement>(null);

    if (disabled) return <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 cursor-not-allowed bg-gray-50/20">{displayDate || "-"}</div>;

    return (
        <div className="w-full h-full flex items-center justify-center group relative cursor-pointer hover:bg-black/5" onClick={() => inputRef.current?.showPicker()}>
             {!value && <Calendar className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />}{value && <span className="text-xs text-gray-700 font-medium">{displayDate}</span>}
             <input ref={inputRef} type="date" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onChange(e.target.value)} />
        </div>
    );
});

const PersonCell = React.memo(({ value, metrologos, onChange, disabled }: { value: string, metrologos: any[], onChange: (val: string) => void, disabled?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    const initial = (value && typeof value === 'string') ? value.charAt(0).toUpperCase() : "?";

    if (disabled) {
        return (
             <div className="w-full h-full flex items-center justify-center opacity-60 cursor-not-allowed">
                 {value ? <div className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm">{initial}</div> : <div className="text-gray-300 text-xs">-</div>}
             </div>
        );
    }

    return (
        <div className="w-full h-full flex items-center justify-center relative">
            <div className="cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2" onClick={() => setIsOpen(true)}>
                {value ? (
                    <div className="w-6 h-6 rounded-full bg-[#0073ea] text-white flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm" title={value}>{initial}</div>
                ) : <UserCircle className="w-6 h-6 text-gray-300" />}
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[220px] bg-white shadow-2xl rounded-lg border border-gray-100 z-50 p-2 max-h-60 overflow-y-auto">
                        <div className="text-[10px] font-bold text-gray-400 px-2 py-1 mb-1 uppercase tracking-wider">Asignar Responsable</div>
                        {metrologos.map(m => {
                            const mName = m.name || "Sin Nombre";
                            const mInitial = mName.charAt(0) || "?";
                            return (
                                <div key={m.id} className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer" onClick={() => { onChange(mName); setIsOpen(false); }}>
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">{mInitial}</div><span className="text-xs font-medium text-gray-700">{mName}</span>
                                </div>
                            );
                        })}
                        {value && <button onClick={() => { onChange(""); setIsOpen(false); }} className="w-full text-center text-red-500 text-xs py-2 hover:bg-red-50 border-t mt-1">Desasignar</button>}
                    </div>
                </>
            )}
        </div>
    );
});

// --- COMPONENTE: PANEL DE COMENTARIOS ---
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
        try {
            await addDoc(collection(db, `hojasDeTrabajo/${row.docId}/comments`), {
                text,
                user: user?.displayName || user?.email || "Usuario",
                createdAt: new Date().toISOString()
            });
            setText("");
        } catch (e) { console.error(e); }
    };

    return (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[60] flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <div>
                    <h3 className="font-bold text-gray-800 text-sm truncate w-60">{row.equipo || "Sin Equipo"}</h3>
                    <span className="text-xs text-gray-500">{row.folio || "Sin Folio"}</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X size={18}/></button>
            </div>
            <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa]">
                {comments.length === 0 && <div className="text-center text-gray-400 text-xs py-10 italic">No hay comentarios aún.</div>}
                {comments.map((c) => (
                    <div key={c.id} className="bg-white p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm border border-gray-100 text-sm relative group">
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-[11px] text-blue-600">{c.user}</span>
                            <span className="text-[10px] text-gray-400">{new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-gray-700 text-xs leading-relaxed">{c.text}</p>
                    </div>
                ))}
            </div>
            <div className="p-3 border-t bg-white flex gap-2">
                <input 
                    className="flex-1 bg-gray-100 border-transparent focus:bg-white border rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="Escribir nota..." 
                    value={text} 
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendComment()}
                    autoFocus
                />
                <button onClick={sendComment} disabled={!text.trim()} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-200"><Send size={16}/></button>
            </div>
        </div>
    );
};

// --- COMPONENTE FILA (BOARD ROW) ---
const BoardRow = React.memo(({ row, columns, color, isSelected, onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd, userRole, onOpenComments }: any) => {
    const handleCellChange = useCallback((key: string, value: any) => { 
        onUpdateRow(row.docId, key, value); 
    }, [row.docId, onUpdateRow]);
    
    let currentStickyLeft = 40; // Espacio inicial (checkbox)

    const checkPermission = (col: Column) => {
        if (!col.permissions || col.permissions.length === 0) return true;
        return col.permissions.includes(userRole);
    };

    // Determinar color de fila basado en responsable
    const rowBackgroundColor = row.assignedTo && USER_ROW_COLORS[row.assignedTo] 
        ? USER_ROW_COLORS[row.assignedTo] 
        : (isSelected ? "#f0f9ff" : "white");

    return (
        <div id={`row-${row.docId}`}
            className="flex border-b border-[#d0d4e4] group transition-colors h-[40px] hover:brightness-95"
            draggable="true"
            onDragStart={(e) => onDragStart(e, { type: 'row', id: row.docId })}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={onDragEnd} 
            onDrop={(e) => { e.stopPropagation(); onDrop(e, { type: 'row', id: row.docId }); }}
            style={{ backgroundColor: rowBackgroundColor }} 
        >
            <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
            
            {/* ZONA DE CONTROL (Checkbox + Comentarios) */}
            <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4] sticky left-1.5 z-20 flex items-center justify-center" style={{ backgroundColor: rowBackgroundColor }}>
                 <div className="w-full h-full flex items-center justify-center relative group/control">
                    {/* Botón Comentarios (Default) */}
                    <button onClick={() => onOpenComments(row)} className={clsx("p-1 rounded hover:bg-black/10 text-gray-400 hover:text-blue-600 transition-colors", isSelected ? "hidden" : "block")}>
                        <MessageSquare size={14} />
                    </button>
                    {/* Checkbox (Hover) */}
                    <div className={clsx("absolute inset-0 items-center justify-center bg-inherit", isSelected ? "flex" : "hidden group-hover/control:flex")}>
                         <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.docId)} className="rounded border-gray-300 text-[#0073ea] cursor-pointer w-4 h-4" />
                    </div>
                 </div>
            </div>

            {columns.filter((c: Column) => !c.hidden).map((col: Column) => {
                const style: React.CSSProperties = { width: col.width };
                if (col.sticky) {
                    style.position = 'sticky';
                    style.left = currentStickyLeft + 1.5; // Ajuste por el borde de color
                    style.zIndex = 15;
                    style.backgroundColor = rowBackgroundColor;
                    currentStickyLeft += col.width;
                }

                const canEdit = checkPermission(col);

                return (
                    <div key={col.key} style={style} className={clsx("flex-shrink-0 border-r border-[#d0d4e4] relative flex items-center", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]")}>
                        {col.key === 'createdAt' ? <SLACell createdAt={row.createdAt} /> :
                         col.type === 'dropdown' ? <DropdownCell value={row[col.key]} options={col.options!} onChange={(v) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         col.type === 'date' ? <DateCell value={row[col.key]} onChange={(v) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         col.type === 'person' ? <PersonCell value={row[col.key]} metrologos={metrologos} onChange={(v) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         col.type === 'client' ? <ClientCell value={row[col.key]} clientes={clientes} onChange={(v) => handleCellChange(col.key, v)} disabled={!canEdit} /> : 
                         <TextCell value={row[col.key]} onChange={(v) => handleCellChange(col.key, v)} disabled={!canEdit} />}
                    </div>
                );
            })}
             <div className="flex-1 border-b border-transparent min-w-[50px]"></div>
        </div>
    );
});

// --- MENÚ CONTEXTUAL DE PERMISOS ---
const PermissionMenu = ({ x, y, column, onClose, onTogglePermission }: { x: number, y: number, column: Column, onClose: () => void, onTogglePermission: (roleId: string) => void }) => {
    const currentPermissions = column.permissions || [];
    useEffect(() => { const h = () => onClose(); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [onClose]);

    return (
        <div className="fixed z-[70] bg-white shadow-xl rounded-lg border border-gray-200 w-64 overflow-hidden animate-in fade-in zoom-in-95 duration-100" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
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

// --- PANTALLA PRINCIPAL ---
const FridayScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    const { user } = useAuth();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [sidebarAbierto, setSidebarAbierto] = useState(false); 
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [userRole, setUserRole] = useState<string>("admin"); // CAMBIAR ESTO SEGÚN LOGGIN REAL
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

    // Datos
    const [rows, setRows] = useState<WorksheetData[]>([]);
    const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
    const [groupsConfig, setGroupsConfig] = useState<GroupData[]>([
        { id: "sitio", name: "Servicios en Sitio", color: "#0073ea", collapsed: false },
        { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false }
    ]);
    const [metrologos, setMetrologos] = useState<any[]>([]);
    const [clientes, setClientes] = useState<any[]>([]); 
    
    // UI Interactions
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const dragItemRef = useRef<DragItem | null>(null); 
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, colKey: string } | null>(null);
    const [activeCommentRow, setActiveCommentRow] = useState<WorksheetData | null>(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Carga de Datos
    useEffect(() => {
        setIsLoadingData(true);
        // Columnas
        const unsubBoard = onSnapshot(doc(db, "tableros", "principal"), (snap) => {
            if (snap.exists() && snap.data().columns) {
                const savedCols = snap.data().columns;
                const merged = savedCols.map((c: any) => {
                    const def = DEFAULT_COLUMNS.find(d => d.key === c.key);
                    return { ...(def || {}), ...c };
                });
                // Agregar columnas nuevas que no estén guardadas
                DEFAULT_COLUMNS.forEach(def => { if (!merged.find((c: any) => c.key === def.key)) merged.push(def); });
                setColumns(merged);
            } else { setColumns(DEFAULT_COLUMNS); }
        });

        const unsubMetrologos = onSnapshot(query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo")), (snap) => setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsubClientes = onSnapshot(query(collection(db, "clientes"), orderBy("nombre")), (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        // Cargar Hojas
        let q;
        if (currentYear === 2026) {
             const start = "2026-01-01T00:00:00";
             const end = "2026-12-31T23:59:59";
             q = query(collection(db, "hojasDeTrabajo"), where("createdAt", ">=", start), where("createdAt", "<=", end), orderBy("createdAt", "desc"));
        } else {
            q = query(collection(db, "hojasDeTrabajo")); 
        }

        const unsubRows = onSnapshot(q, (snapshot) => {
            let newRows: WorksheetData[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                newRows.push({ ...data, docId: doc.id, id: data.id || "" } as WorksheetData);
            });
            setRows(newRows);
            setIsLoadingData(false);
        });

        return () => { unsubBoard(); unsubMetrologos(); unsubRows(); unsubClientes(); };
    }, [currentYear]);

    // Handlers
    const handleColumnContextMenu = (e: React.MouseEvent, colKey: string) => {
        e.preventDefault(); 
        if (userRole !== 'admin') return; 
        setContextMenu({ x: e.clientX, y: e.clientY, colKey });
    };

    const handleTogglePermission = async (roleId: string) => {
        if (!contextMenu) return;
        const targetCol = columns.find(c => c.key === contextMenu.colKey);
        if (!targetCol) return;

        let currentPerms = targetCol.permissions || [];
        if (currentPerms.includes(roleId)) {
            currentPerms = currentPerms.filter(p => p !== roleId);
        } else {
            currentPerms = [...currentPerms, roleId];
        }

        const newCols = columns.map(c => c.key === contextMenu.colKey ? { ...c, permissions: currentPerms } : c);
        setColumns(newCols);
        await setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
    };

    const handleAddRow = useCallback(async (groupId: string) => {
        const docRef = doc(collection(db, "hojasDeTrabajo"));
        const newRowData = {
            id: "", folio: "", cliente: "", equipo: "", 
            lugarCalibracion: groupId, status_equipo: 'Desconocido', 
            createdAt: new Date().toISOString(), status_certificado: 'Pendiente de Certificado'
        };
        await setDoc(docRef, newRowData);
    }, []);

    const handleUpdateRow = useCallback(async (rowId: string, key: string, value: any) => {
        // Optimistic Update
        setRows(prevRows => prevRows.map(r => r.docId === rowId ? { ...r, [key]: value } : r));
        try { 
            await updateDoc(doc(db, "hojasDeTrabajo", rowId), { [key]: value, lastUpdated: new Date().toISOString() }); 
        } catch (error) { console.error("Error updating row:", error); }
    }, []);

    const handleDeleteSelected = async () => {
        if (!confirm(`¿Eliminar ${selectedIds.size} elementos?`)) return; 
        const batch = writeBatch(db);
        selectedIds.forEach(id => { batch.delete(doc(db, "hojasDeTrabajo", id)); });
        setSelectedIds(new Set());
        await batch.commit();
    };

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    }, []);

    // Drag & Drop
    const onDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
        if (item.type === 'column' && item.index !== undefined && columns[item.index].sticky) { e.preventDefault(); return; }
        dragItemRef.current = item;
        e.dataTransfer.effectAllowed = "move";
    }, [columns]);

    const onDrop = useCallback(async (e: React.DragEvent, target: DragItem) => {
        e.preventDefault();
        const dragItem = dragItemRef.current;
        if (!dragItem) return;

        if (dragItem.type === 'column' && target.type === 'column') {
             const fromIdx = dragItem.index!;
             const toIdx = target.index!;
             if(columns[toIdx].sticky || columns[fromIdx].sticky) return;
             
             let newCols = [...columns];
             const [moved] = newCols.splice(fromIdx, 1);
             newCols.splice(toIdx, 0, moved);
             setColumns(newCols);
             setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
        }
        if (dragItem.type === 'row' && target.type === 'row') {
            // Lógica para reordenar filas si se desea (opcional)
        }
    }, [columns]); 

    const groupedRows = useMemo(() => {
        let filtered = rows.filter(r => {
            if (!search) return true;
            const s = search.toLowerCase();
            return (r.cliente || "").toLowerCase().includes(s) || 
                   (r.folio || "").toLowerCase().includes(s) || 
                   (r.equipo || "").toLowerCase().includes(s);
        });

        return groupsConfig.map(group => ({
            ...group,
            rows: filtered.filter(r => (r.lugarCalibracion || "").toLowerCase() === group.id)
        }));
    }, [rows, groupsConfig, search]);

    let headerStickyOffset = 40; // Ancho checkbox

    return (
        <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338] overflow-hidden">
             {/* SIDEBAR */}
             <div className={clsx("flex-shrink-0 bg-white h-full z-50 transition-all duration-300 ease-in-out overflow-hidden border-r border-[#d0d4e4]", sidebarAbierto ? "w-64 opacity-100" : "w-0 opacity-0 border-none")}>
                <div className="w-64 h-full"><SidebarFriday onNavigate={navigateTo} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} /></div>
             </div>
             {isMobile && sidebarAbierto && (<div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarAbierto(false)}></div>)}

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative transition-all duration-300">
                {/* HEADER */}
                <div className="px-6 py-4 border-b border-[#d0d4e4] flex justify-between items-center bg-white sticky top-0 z-40 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSidebarAbierto(!sidebarAbierto)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"><Menu className="w-6 h-6"/></button>
                            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="Regresar al Menú"><ArrowLeft className="w-6 h-6"/></button>
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold leading-tight flex items-center gap-2 text-gray-800">
                                Tablero Principal 
                                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">{currentYear}</span>
                            </h1>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold uppercase text-[10px]"><Briefcase size={12}/> VISTA: {userRole}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input placeholder="Buscar..." className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none hover:shadow-sm transition-shadow bg-gray-50 w-64" value={search} onChange={e => setSearch(e.target.value)} /></div>
                    </div>
                </div>

                {/* TABLERO */}
                <div className="flex-1 overflow-auto bg-white" id="main-board-scroll">
                    <div className="inline-block min-w-full pb-32">
                        {/* HEADERS */}
                        <div className="flex border-b border-[#d0d4e4] sticky top-0 z-30 bg-white shadow-sm h-[36px]">
                            <div className="w-1.5 bg-white sticky left-0 z-30"></div>
                            <div className="w-[40px] border-r border-[#d0d4e4] bg-white sticky left-1.5 z-30 flex items-center justify-center">
                                <input type="checkbox" className="rounded border-gray-300" />
                            </div>
                            
                            {columns.filter(c => !c.hidden).map((col, index) => {
                                const style: React.CSSProperties = { width: col.width, zIndex: col.sticky ? 30 : undefined };
                                if (col.sticky) {
                                    style.position = 'sticky';
                                    style.left = headerStickyOffset + 1.5;
                                    headerStickyOffset += col.width;
                                }
                                const isLocked = col.permissions && col.permissions.length > 0 && !col.permissions.includes(userRole);

                                return (
                                <div key={col.key} draggable={!col.sticky} 
                                     onDragStart={(e) => onDragStart(e, { type: 'column', index })} onDragOver={(e) => e.preventDefault()} onDragEnd={(e) => dragItemRef.current = null} onDrop={(e) => onDrop(e, { type: 'column', index })} 
                                     style={style}
                                     className={clsx("px-2 text-[11px] font-bold text-gray-500 flex items-center justify-center border-r border-transparent hover:bg-gray-50 select-none bg-white group hover:text-gray-800 transition-colors uppercase tracking-wide", col.sticky ? "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]" : "cursor-pointer")}
                                     onContextMenu={(e) => handleColumnContextMenu(e, col.key)} 
                                >
                                    <span className="truncate flex items-center gap-1">
                                        {col.label}
                                        {isLocked && <Lock className="w-2.5 h-2.5 text-gray-300" />}
                                    </span>
                                </div>
                            )})}
                            <div className="flex-1 border-b border-gray-100 min-w-[50px]"></div>
                        </div>

                        {/* GRUPOS Y FILAS */}
                        <div className="px-4 mt-6">
                            {isLoadingData ? <div className="p-10 text-center text-gray-400">Cargando tablero...</div> : (
                                groupedRows.map((group) => (
                                    <div key={group.id} className="mb-10">
                                        <div className="flex items-center mb-2 group sticky left-0 z-10 p-2 rounded hover:bg-gray-50 transition-colors">
                                            <ChevronDown className={clsx("w-5 h-5 transition-transform cursor-pointer p-0.5 rounded hover:bg-gray-200", group.collapsed && "-rotate-90")} style={{ color: group.color }}
                                                onClick={() => { const newConf = groupsConfig.map(g => g.id === group.id ? {...g, collapsed: !g.collapsed} : g); setGroupsConfig(newConf); }}/>
                                            <h2 className="text-lg font-medium ml-2 px-1 text-gray-800" style={{ color: group.color }}>{group.name}</h2>
                                            <span className="ml-3 text-xs text-gray-400 font-light border border-gray-200 px-2 py-0.5 rounded-full">{group.rows.length}</span>
                                        </div>
                                        
                                        {!group.collapsed && (
                                            <div className="shadow-sm rounded-tr-md rounded-tl-md overflow-hidden border-l border-t border-r border-[#d0d4e4] min-h-[50px]">
                                                {group.rows.map(row => (
                                                    <BoardRow 
                                                        key={row.docId} 
                                                        row={row} 
                                                        columns={columns} 
                                                        color={group.color} 
                                                        isSelected={selectedIds.has(row.docId)} 
                                                        onToggleSelect={toggleSelect} 
                                                        onUpdateRow={handleUpdateRow} 
                                                        metrologos={metrologos} 
                                                        clientes={clientes} 
                                                        onDragStart={onDragStart} 
                                                        onDrop={onDrop} 
                                                        onDragEnd={() => dragItemRef.current = null} 
                                                        userRole={userRole}
                                                        onOpenComments={setActiveCommentRow}
                                                    />
                                                ))}
                                                
                                                {/* INPUT RÁPIDO PARA NUEVA FILA */}
                                                <div className="flex h-[40px] border-b border-[#d0d4e4] bg-white group hover:bg-gray-50">
                                                    <div className="sticky left-0 z-20 flex bg-white group-hover:bg-gray-50">
                                                        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }}></div>
                                                        <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4]"></div>
                                                        {columns.filter(c => c.sticky && !c.hidden).map(c => (
                                                            <div key={c.key} style={{width: c.width}} className="border-r border-[#d0d4e4] flex-shrink-0"></div>
                                                        ))}
                                                    </div>
                                                    <div className="flex-1 flex items-center px-2 relative">
                                                        <input type="text" placeholder="+ Nuevo Equipo" className="outline-none text-sm w-[200px] h-full placeholder-gray-400 bg-transparent absolute left-2"
                                                            onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRow(group.id); (e.target as HTMLInputElement).value = ''; } }} />
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

                {/* MENÚ FLOTANTE DE SELECCIÓN */}
                {selectedIds.size > 0 && (
                   <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-2xl rounded-lg border border-gray-200 px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
                       <div className="flex items-center gap-3 border-r border-gray-200 pr-6"><div className="bg-[#0073ea] text-white text-xs font-bold w-6 h-6 rounded flex items-center justify-center">{selectedIds.size}</div><span className="text-sm font-medium text-gray-700">Seleccionados</span></div>
                       <button onClick={handleDeleteSelected} className="flex flex-col items-center gap-1 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /><span className="text-[10px]">Eliminar</span></button>
                       <button onClick={() => setSelectedIds(new Set())} className="ml-2 hover:bg-gray-100 p-1 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                   </div>
                )}

                {/* MENÚ CONTEXTUAL DE PERMISOS */}
                {contextMenu && (
                    <PermissionMenu 
                        x={contextMenu.x} 
                        y={contextMenu.y} 
                        column={columns.find(c => c.key === contextMenu.colKey)!} 
                        onClose={() => setContextMenu(null)}
                        onTogglePermission={handleTogglePermission}
                    />
                )}

                {/* PANEL DE COMENTARIOS */}
                {activeCommentRow && (
                    <CommentsPanel row={activeCommentRow} onClose={() => setActiveCommentRow(null)} />
                )}
            </div>
        </div>
    );
};

export default FridayScreen;