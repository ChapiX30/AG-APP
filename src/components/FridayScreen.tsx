import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, Trash2, ChevronDown, Search, 
  Bell, UserCircle, Calendar, GripVertical, X, 
  Menu, Building2, ArrowLeft, Settings,
  ArrowUp, ArrowDown, ArrowUpDown, Archive, CheckCircle2
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, query, where, onSnapshot, setDoc, writeBatch, orderBy } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';

// --- TIPOS ---
type CellType = "text" | "number" | "dropdown" | "date" | "person" | "client";
type SortDirection = 'asc' | 'desc' | null;

interface Column {
  key: string;
  label: string;
  type: CellType;
  width: number;
  hidden?: boolean;
  options?: string[];
  sticky?: boolean;
}

interface WorksheetData {
  docId: string; // ID DE FIREBASE
  id: string;    // ID DEL EQUIPO
  createdAt: string; 
  lugarCalibracion: string; 
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

// Configuración visual
const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  pending: { label: "Pendiente", bg: "#c4c4c4" },
  in_progress: { label: "En Proceso", bg: "#fdab3d" },
  completed: { label: "Listo", bg: "#00c875" },
  cancelled: { label: "Estancado", bg: "#e2445c" }
};

const PRIORITY_CONFIG: Record<string, { label: string; bg: string }> = {
  low: { label: "Baja", bg: "#579bfc" },
  medium: { label: "Media", bg: "#5559df" },
  high: { label: "Alta", bg: "#fdab3d" },
  urgent: { label: "Urgente", bg: "#e2445c" }
};

// Columnas
const DEFAULT_COLUMNS: Column[] = [
  { key: 'id', label: 'ID Equipo', width: 110, type: "text", sticky: true }, 
  { key: 'folio', label: 'Folio (Cert)', width: 120, type: "text", sticky: true },
  { key: 'cliente', label: 'Cliente', width: 220, type: "client" },
  { key: 'equipo', label: 'Equipo', width: 180, type: "text" },
  { key: 'status', label: 'Estado', width: 140, type: "dropdown", options: ["pending","in_progress","completed","cancelled"] },
  { key: 'priority', label: 'Prioridad', width: 130, type: "dropdown", options: ["low","medium","high","urgent"] },
  { key: 'dueDate', label: 'Fecha Límite', width: 130, type: "date" },
  { key: 'assignedTo', label: 'Resp.', width: 120, type: "person" },
  { key: 'marca', label: 'Marca', width: 130, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 130, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
];

// --- COMPONENTES SKELETON ---
const RowSkeleton = () => (
  <div className="flex border-b border-[#d0d4e4] bg-white h-[36px] animate-pulse">
    <div className="w-1.5 bg-gray-200"></div>
    <div className="w-[40px] border-r border-[#d0d4e4] bg-gray-50"></div>
    <div className="flex-1 bg-white"></div>
  </div>
);

// --- COMPONENTES DE CELDAS ---
const TextCell = React.memo(({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder?: string }) => {
  const [localValue, setLocalValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== inputRef.current) setLocalValue(value || ""); }, [value]);
  const handleBlur = () => { if (localValue !== value) onChange(localValue); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') inputRef.current?.blur(); };
  return (
    <input ref={inputRef} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} placeholder={placeholder}
        className="w-full h-full px-3 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-[#0073ea] focus:z-10 transition-all text-sm truncate placeholder-gray-300" 
    />
  );
}, (prev, next) => prev.value === next.value);

const ClientCell = React.memo(({ value, clientes, onChange }: { value: string, clientes: any[], onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = useMemo(() => {
        if (!isOpen) return [];
        if (!searchTerm) return clientes;
        return clientes.filter(c => (c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()));
    }, [clientes, searchTerm, isOpen]);
    return (
        <div className="w-full h-full relative group">
            <div className="w-full h-full px-3 flex items-center cursor-pointer hover:bg-gray-50" onClick={() => { setIsOpen(true); setSearchTerm(""); }}>
                {value ? <span className="text-sm text-gray-800 truncate font-medium">{value}</span> : <span className="text-sm text-gray-300 flex items-center gap-1"><Plus className="w-3 h-3"/> Seleccionar</span>}
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-0 left-0 w-[240px] bg-white shadow-2xl rounded-lg border border-blue-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[300px]">
                        <div className="relative mb-2 shrink-0"><Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400"/><input autoFocus placeholder="Buscar empresa..." className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:border-blue-500 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                        <div className="overflow-y-auto flex-1">
                            {filtered.length > 0 ? filtered.map(c => (
                                <div key={c.id} className="px-2 py-2 hover:bg-blue-50 cursor-pointer rounded flex items-center gap-2" onClick={() => { onChange(c.nombre); setIsOpen(false); }}>
                                    <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-600"><Building2 className="w-3 h-3"/></div><span className="text-xs text-gray-700">{c.nombre}</span>
                                </div>
                            )) : <div className="text-xs text-gray-400 text-center py-2">No encontrado</div>}
                        </div>
                        {value && <button onClick={() => { onChange(""); setIsOpen(false); }} className="mt-2 text-xs text-red-500 hover:bg-red-50 p-1 rounded text-center w-full border-t pt-2">Quitar selección</button>}
                    </div>
                </>
            )}
        </div>
    );
});

const DropdownCell = React.memo(({ value, options, config, onChange }: { value: string, options: string[], config: any, onChange: (val: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const item = config[value] || { label: value, bg: "#c4c4c4" };
  return (
    <div className="w-full h-full relative">
      <div className="w-full h-full flex items-center justify-center text-white text-xs font-medium cursor-pointer transition-opacity hover:opacity-90 relative" style={{ backgroundColor: item.bg }} onClick={() => setIsOpen(!isOpen)}>
         <span className="truncate px-1">{item.label}</span>
      </div>
      {isOpen && (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
            <div className="absolute top-full left-0 w-[160px] bg-white shadow-xl rounded-lg border border-gray-100 z-50 py-2 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
               {options?.map(opt => (
                 <div key={opt} className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors" onClick={() => { onChange(opt); setIsOpen(false); }}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: config[opt]?.bg || '#ccc' }}></div><span className="text-sm text-gray-700">{config[opt]?.label || opt}</span>
                 </div>
               ))}
            </div>
        </>
      )}
    </div>
  );
}, (prev, next) => prev.value === next.value && prev.options === next.options);

const DateCell = React.memo(({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const displayDate = value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null;
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="w-full h-full flex items-center justify-center group relative cursor-pointer hover:bg-gray-100" onClick={() => inputRef.current?.showPicker()}>
             {!value && <Calendar className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />}{value && <span className="text-xs text-gray-700 font-medium">{displayDate}</span>}
             <input ref={inputRef} type="date" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onChange(e.target.value)} />
        </div>
    );
}, (prev, next) => prev.value === next.value);

const PersonCell = React.memo(({ value, metrologos, onChange }: { value: string, metrologos: any[], onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const initial = (value && typeof value === 'string') ? value.charAt(0).toUpperCase() : "?";
    return (
        <div className="w-full h-full flex items-center justify-center relative">
            <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setIsOpen(true)}>
                {value ? <div className="w-7 h-7 rounded-full bg-[#0073ea] text-white flex items-center justify-center text-xs border-2 border-white shadow-sm" title={value}>{initial}</div> : <UserCircle className="w-6 h-6 text-gray-300" />}
            </div>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[220px] bg-white shadow-2xl rounded-lg border border-gray-100 z-50 p-2 max-h-60 overflow-y-auto">
                        <div className="text-xs font-bold text-gray-400 px-2 py-1 mb-1">ASIGNAR A</div>
                        {metrologos.map(m => {
                            const mName = m.name || "Sin Nombre";
                            const mInitial = mName.charAt(0) || "?";
                            return (
                                <div key={m.id} className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer" onClick={() => { onChange(mName); setIsOpen(false); }}>
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{mInitial}</div><span className="text-sm text-gray-700">{mName}</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
});

// --- COMPONENTE FILA ---
const BoardRow = React.memo(({ row, columns, color, isSelected, onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd }: any) => {
    const handleCellChange = useCallback((key: string, value: any) => { 
        onUpdateRow(row.docId, key, value); 
    }, [row.docId, onUpdateRow]);
    
    let currentStickyLeft = 46;

    return (
        <div id={`row-${row.docId}`}
            className={clsx("flex border-b border-[#d0d4e4] bg-white hover:bg-[#f5f7fa] group transition-colors h-[36px]", isSelected && "bg-blue-50")}
            draggable="true"
            onDragStart={(e) => onDragStart(e, { type: 'row', id: row.docId })}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={onDragEnd} 
            onDrop={(e) => { e.stopPropagation(); onDrop(e, { type: 'row', id: row.docId }); }}
        >
            <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
            <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4] bg-white sticky left-1.5 z-20 flex items-center justify-center group-hover:bg-[#f5f7fa]">
                 <div className="relative w-full h-full flex items-center justify-center cursor-pointer" onClick={() => onToggleSelect(row.docId)}>
                    <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 absolute left-0 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing" />
                    <input type="checkbox" checked={isSelected} onChange={() => {}} className={clsx("rounded border-gray-300 text-[#0073ea] focus:ring-0 cursor-pointer", !isSelected && "opacity-0 group-hover:opacity-100")} />
                 </div>
            </div>

            {columns.filter((c: Column) => !c.hidden).map((col: Column) => {
                const style: React.CSSProperties = { width: col.width };
                if (col.sticky) {
                    style.position = 'sticky';
                    style.left = currentStickyLeft;
                    style.zIndex = 15;
                    style.backgroundColor = isSelected ? '#eff6ff' : '#fff';
                    currentStickyLeft += col.width;
                }
                return (
                    <div key={col.key} style={style} className={clsx("flex-shrink-0 border-r border-[#d0d4e4] relative flex items-center", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]")}>
                        {col.key === 'status' ? <DropdownCell value={row[col.key]} options={col.options!} config={STATUS_CONFIG} onChange={(v) => handleCellChange(col.key, v)} /> : 
                         col.key === 'priority' ? <DropdownCell value={row[col.key]} options={col.options!} config={PRIORITY_CONFIG} onChange={(v) => handleCellChange(col.key, v)} /> : 
                         col.type === 'date' ? <DateCell value={row[col.key]} onChange={(v) => handleCellChange(col.key, v)} /> : 
                         col.type === 'person' ? <PersonCell value={row[col.key]} metrologos={metrologos} onChange={(v) => handleCellChange(col.key, v)} /> : 
                         col.type === 'client' ? <ClientCell value={row[col.key]} clientes={clientes} onChange={(v) => handleCellChange(col.key, v)} /> : 
                         <TextCell value={row[col.key]} onChange={(v) => handleCellChange(col.key, v)} />}
                    </div>
                );
            })}
             <div className="flex-1 border-b border-transparent min-w-[50px]"></div>
        </div>
    );
}, (prev, next) => {
    return prev.row === next.row && prev.isSelected === next.isSelected && prev.columns === next.columns && prev.clientes === next.clientes && prev.metrologos === next.metrologos;
});

// --- MODAL AGREGAR COLUMNA ---
const AddColumnModal = ({ onClose, onAdd }: { onClose: () => void, onAdd: (l: string, t: CellType) => void }) => {
    const [label, setLabel] = useState("");
    const [type, setType] = useState<CellType>("text");
    return (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl p-6 w-80 animate-in zoom-in-95">
                <h3 className="text-lg font-bold mb-4">Nueva Columna</h3>
                <input autoFocus placeholder="Nombre (Ej. Ubicación)" className="w-full border p-2 rounded mb-4 outline-none focus:ring-2 ring-blue-500" value={label} onChange={e => setLabel(e.target.value)} />
                <label className="block text-sm font-medium mb-1">Tipo de Dato</label>
                <select className="w-full border p-2 rounded mb-6" value={type} onChange={e => setType(e.target.value as CellType)}>
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                    <option value="date">Fecha</option>
                    <option value="person">Persona</option>
                    <option value="dropdown">Lista (Status)</option>
                </select>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                    <button onClick={() => { if(label) onAdd(label, type); }} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Crear</button>
                </div>
            </div>
        </div>
    );
};

// --- PANTALLA PRINCIPAL ---
const FridayScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [sidebarAbierto, setSidebarAbierto] = useState(false); 
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

    const [rows, setRows] = useState<WorksheetData[]>([]);
    const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
    const dragItemRef = useRef<DragItem | null>(null); 
    const [isAddColOpen, setIsAddColOpen] = useState(false);

    const [groupsConfig, setGroupsConfig] = useState<GroupData[]>([
        { id: "sitio", name: "Servicios en Sitio", color: "#0073ea", collapsed: false },
        { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false }
    ]);
    
    const [metrologos, setMetrologos] = useState<any[]>([]);
    const [clientes, setClientes] = useState<any[]>([]); 
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: SortDirection } | null>(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- CARGA DE DATOS ---
    useEffect(() => {
        setIsLoadingData(true);
        // 1. Columnas
        const unsubBoard = onSnapshot(doc(db, "tableros", "principal"), (snap) => {
            if (snap.exists() && snap.data().columns) {
                const savedCols = snap.data().columns;
                const merged = savedCols.map((c: any) => {
                    const def = DEFAULT_COLUMNS.find(d => d.key === c.key);
                    return { ...(def || {}), ...c };
                });
                DEFAULT_COLUMNS.forEach(def => { if (!merged.find((c: any) => c.key === def.key)) merged.push(def); });
                setColumns(merged);
            } else { setColumns(DEFAULT_COLUMNS); }
        });

        const unsubMetrologos = onSnapshot(query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo")), (snap) => setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsubClientes = onSnapshot(query(collection(db, "clientes"), orderBy("nombre")), (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        // 3. FILAS Y FILTRO DE AÑO
        let q;
        if (currentYear === 2026) {
            // AÑO NUEVO: Filtro estricto (Rápido y Limpio)
             const start = "2026-01-01T00:00:00";
             const end = "2026-12-31T23:59:59";
             q = query(
                collection(db, "hojasDeTrabajo"),
                where("createdAt", ">=", start),
                where("createdAt", "<=", end),
                orderBy("createdAt", "desc")
             );
        } else {
            // HISTÓRICO (2025 o anterior): Carga TODO (Como el original)
            // No filtramos por fecha en query para asegurar que aparezcan equipos viejos sin fecha
            q = query(collection(db, "hojasDeTrabajo")); 
        }

        const unsubRows = onSnapshot(q, (snapshot) => {
            let newRows: WorksheetData[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                newRows.push({ 
                    ...data, 
                    docId: doc.id,   // ID Real de Firebase
                    id: data.id || "" // ID del Equipo
                } as WorksheetData);
            });

            // Si es la pestaña Histórica (2025), filtramos EN MEMORIA para quitar lo de 2026
            if (currentYear !== 2026) {
                 newRows = newRows.filter(r => {
                    // Muestra si NO tiene fecha (es muy viejo) O si es anterior a 2026
                    if (!r.createdAt) return true;
                    return r.createdAt < "2026-01-01";
                 });
                 // Ordenamiento manual porque no pudimos usar orderBy en la query sin filtro
                 newRows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
            }

            setRows(newRows);
            setIsLoadingData(false);
        }, (error) => {
             console.error("Error fetching rows:", error);
             setIsLoadingData(false);
        });

        return () => { unsubBoard(); unsubMetrologos(); unsubRows(); unsubClientes(); };
    }, [currentYear]);

    // --- HANDLERS ---
    const handleAddRow = useCallback(async (groupId: string) => {
        let createdDate = new Date();
        if (currentYear !== createdDate.getFullYear()) {
             createdDate = new Date(`${currentYear}-12-31T12:00:00`);
        }
        const docRef = doc(collection(db, "hojasDeTrabajo"));
        const newRowData = {
            id: "", folio: "", cliente: "", equipo: "", 
            lugarCalibracion: groupId, status: 'pending', priority: 'medium', 
            createdAt: createdDate.toISOString(), marca: "", modelo: "", serie: ""
        };
        // Optimistic update
        setRows(prev => [{ ...newRowData, docId: docRef.id } as WorksheetData, ...prev]);
        await setDoc(docRef, newRowData);
    }, [currentYear]);

    const handleUpdateRow = useCallback(async (rowId: string, key: string, value: any) => {
        setRows(prevRows => prevRows.map(r => r.docId === rowId ? { ...r, [key]: value } : r));
        try { 
            await updateDoc(doc(db, "hojasDeTrabajo", rowId), { [key]: value, lastUpdated: new Date().toISOString() }); 
        } catch (error) { console.error("Error updating row:", error); }
    }, []);

    const handleAddColumn = async (label: string, type: CellType) => {
        const key = label.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4);
        const newCol: Column = { key, label, type, width: 150 };
        const updatedCols = [...columns, newCol];
        setColumns(updatedCols);
        setIsAddColOpen(false);
        await setDoc(doc(db, "tableros", "principal"), { columns: updatedCols }, { merge: true });
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`¿Eliminar ${selectedIds.size} elementos?`)) return; 
        const batch = writeBatch(db);
        selectedIds.forEach(id => { batch.delete(doc(db, "hojasDeTrabajo", id)); });
        setSelectedIds(new Set());
        await batch.commit();
    };

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    }, []);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                if (current.direction === 'desc') return null; 
            }
            return { key, direction: 'asc' };
        });
    };

    // --- DRAG & DROP ---
    const onDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
        dragItemRef.current = item;
        e.dataTransfer.effectAllowed = "move";
        if (e.currentTarget instanceof HTMLElement && item.type === 'row') e.currentTarget.style.opacity = '0.4';
    }, []);

    const onDragEnd = useCallback((e: React.DragEvent) => {
        if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
        dragItemRef.current = null;
    }, []);

    const onDrop = useCallback(async (e: React.DragEvent, target: DragItem) => {
        e.preventDefault();
        const dragItem = dragItemRef.current;
        if (!dragItem) return;

        if (dragItem.type === 'column' && target.type === 'column' && dragItem.index !== undefined && target.index !== undefined) {
             const fromIdx = dragItem.index;
             const toIdx = target.index;
             if (fromIdx !== toIdx) {
                let newCols = [...columns];
                const [moved] = newCols.splice(fromIdx, 1);
                newCols.splice(toIdx, 0, moved);
                setColumns(newCols);
                setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
             }
        }

        if (dragItem.type === 'row' && target.type === 'row' && dragItem.id && target.id) {
            const sourceRow = rows.find(r => r.docId === dragItem.id);
            const targetRow = rows.find(r => r.docId === target.id);
            if (sourceRow && targetRow && sourceRow.docId !== targetRow.docId) {
                const targetGroupId = (targetRow.lugarCalibracion || "").toLowerCase();
                const currentGroupId = (sourceRow.lugarCalibracion || "").toLowerCase();
                if (currentGroupId !== targetGroupId) {
                    setRows(currentRows => currentRows.map(r => r.docId === sourceRow.docId ? { ...r, lugarCalibracion: targetGroupId } : r));
                    updateDoc(doc(db, "hojasDeTrabajo", sourceRow.docId), { lugarCalibracion: targetGroupId });
                }
            }
        }
    }, [columns, rows]); 

    const onDropGroup = useCallback(async (e: React.DragEvent, groupId: string) => {
        e.preventDefault();
        const dragItem = dragItemRef.current;
        if (!dragItem || dragItem.type !== 'row' || !dragItem.id) return;
        const sourceRow = rows.find(r => r.docId === dragItem.id);
        if (sourceRow) {
            const targetGroup = groupId.toLowerCase();
            const currentGroup = (sourceRow.lugarCalibracion || "").toLowerCase();
            if (currentGroup !== targetGroup) {
                setRows(currentRows => currentRows.map(r => r.docId === sourceRow.docId ? { ...r, lugarCalibracion: targetGroup } : r));
                updateDoc(doc(db, "hojasDeTrabajo", sourceRow.docId), { lugarCalibracion: targetGroup });
            }
        }
    }, [rows]);

    const groupedRows = useMemo(() => {
        let filtered = rows.filter(r => {
            if (!search) return true;
            const s = search.toLowerCase();
            return (r.cliente || "").toLowerCase().includes(s) || 
                   (r.folio || "").toLowerCase().includes(s) || 
                   (r.equipo || "").toLowerCase().includes(s) ||
                   (r.id || "").toLowerCase().includes(s);
        });

        if (sortConfig && sortConfig.direction) {
            filtered = [...filtered].sort((a, b) => {
                const valA = a[sortConfig.key] || "";
                const valB = b[sortConfig.key] || "";
                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return groupsConfig.map(group => ({
            ...group,
            rows: filtered.filter(r => (r.lugarCalibracion || "").toLowerCase() === group.id)
        }));
    }, [rows, groupsConfig, search, sortConfig]);

    let headerStickyOffset = 46;

    return (
        <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338] overflow-hidden">
             {/* SIDEBAR */}
             <div className={clsx("flex-shrink-0 bg-white h-full z-50 transition-all duration-300 ease-in-out overflow-hidden border-r border-[#d0d4e4]", sidebarAbierto ? "w-64 opacity-100" : "w-0 opacity-0 border-none")}>
                <div className="w-64 h-full"><SidebarFriday onNavigate={navigateTo} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} /></div>
             </div>
             {isMobile && sidebarAbierto && (<div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarAbierto(false)}></div>)}
             {isMobile && (<div className={clsx("fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transition-transform duration-300", sidebarAbierto ? "translate-x-0" : "-translate-x-full")}><SidebarFriday onNavigate={navigateTo} isOpen={true} onToggle={() => setSidebarAbierto(false)} /></div>)}

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0 bg-white relative transition-all duration-300">
                {/* HEADER */}
                <div className="px-6 py-4 border-b border-[#d0d4e4] flex justify-between items-center bg-white sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSidebarAbierto(!sidebarAbierto)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"><Menu className="w-6 h-6"/></button>
                            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="Regresar al Menú"><ArrowLeft className="w-6 h-6"/></button>
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
                                Tablero Principal 
                                <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                                    {currentYear}
                                </span>
                            </h1>
                            <div className="flex items-center gap-2 text-sm text-gray-500"><span>Gestión de Calibración</span></div>
                        </div>
                    </div>

                    {/* SELECTOR DE AÑO (Tabs) */}
                    <div className="hidden md:flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                        <button onClick={() => setCurrentYear(2025)} className={clsx("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", currentYear === 2025 ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700")}><Archive className="w-4 h-4"/> 2025 (Histórico)</button>
                        <button onClick={() => setCurrentYear(2026)} className={clsx("px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2", currentYear === 2026 ? "bg-white text-[#0073ea] shadow-sm" : "text-gray-500 hover:text-gray-700")}><CheckCircle2 className="w-4 h-4"/> 2026 (Actual)</button>
                    </div>

                    <div className="flex gap-3">
                        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input placeholder="Buscar..." className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-full text-sm focus:border-blue-500 outline-none hover:shadow-sm transition-shadow" value={search} onChange={e => setSearch(e.target.value)} /></div>
                        <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Bell className="w-5 h-5"/></button>
                        <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Settings className="w-5 h-5"/></button>
                    </div>
                </div>

                {/* BOARD AREA */}
                <div className="flex-1 overflow-auto bg-white" id="main-board-scroll">
                    <div className="inline-block min-w-full pb-32">
                        {/* COLUMN HEADERS */}
                        <div className="flex border-b border-[#d0d4e4] sticky top-0 z-30 bg-white shadow-sm h-[34px]">
                            <div className="w-1.5 bg-white sticky left-0 z-30"></div>
                            <div className="w-[40px] border-r border-[#d0d4e4] bg-white sticky left-1.5 z-30 flex items-center justify-center"><input type="checkbox" className="rounded border-gray-300" /></div>
                            {columns.filter(c => !c.hidden).map((col, index) => {
                                const style: React.CSSProperties = { width: col.width, zIndex: col.sticky ? 30 : undefined };
                                if (col.sticky) {
                                    style.position = 'sticky';
                                    style.left = headerStickyOffset;
                                    headerStickyOffset += col.width;
                                }
                                return (
                                <div key={col.key} draggable="true" onDragStart={(e) => onDragStart(e, { type: 'column', index })} onDragOver={(e) => e.preventDefault()} onDragEnd={onDragEnd} onDrop={(e) => onDrop(e, { type: 'column', index })} 
                                     style={style}
                                     className={clsx("px-2 text-xs font-semibold text-gray-500 flex items-center justify-center border-r border-transparent hover:bg-gray-50 cursor-pointer select-none bg-white group hover:text-gray-800 transition-colors", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]")}
                                     onClick={() => handleSort(col.key)}>
                                    <span className="truncate">{col.label}</span>
                                    <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {sortConfig?.key === col.key ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-[#0073ea]"/> : <ArrowDown className="w-3 h-3 text-[#0073ea]"/>
                                        ) : (
                                            <ArrowUpDown className="w-3 h-3 text-gray-300"/>
                                        )}
                                    </div>
                                </div>
                            )})}
                            <button onClick={() => setIsAddColOpen(true)} className="w-10 flex items-center justify-center border-l border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors group">
                                <Plus className="w-4 h-4 text-gray-400 group-hover:text-blue-600"/>
                            </button>
                        </div>

                        {/* CONTENT */}
                        <div className="px-4 mt-6">
                            {isLoadingData ? (
                                <div className="space-y-4">
                                    {[1,2].map(g => (
                                        <div key={g}>
                                             <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
                                             <div className="border border-gray-200 rounded-md overflow-hidden">
                                                 {[1,2,3].map(r => <RowSkeleton key={r} />)}
                                             </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                groupedRows.map((group) => (
                                    <div key={group.id} className="mb-10">
                                        <div className="flex items-center mb-2 group sticky left-0 z-10 p-2 rounded hover:bg-gray-50 transition-colors"
                                            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = '#f0f9ff'; }}
                                            onDragLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                                            onDrop={(e) => { e.currentTarget.style.backgroundColor = ''; onDropGroup(e, group.id); }}>
                                            <ChevronDown className={clsx("w-5 h-5 transition-transform cursor-pointer p-0.5 rounded hover:bg-gray-200", group.collapsed && "-rotate-90")} style={{ color: group.color }}
                                                onClick={() => { const newConf = groupsConfig.map(g => g.id === group.id ? {...g, collapsed: !g.collapsed} : g); setGroupsConfig(newConf); }}/>
                                            <h2 className="text-lg font-medium ml-2 px-1 rounded hover:border hover:border-gray-300 cursor-text" style={{ color: group.color }}>{group.name}</h2>
                                            <span className="ml-3 text-xs text-gray-400 font-light">{group.rows.length} equipos</span>
                                        </div>
                                        {!group.collapsed && (
                                            <div className="shadow-sm rounded-tr-md rounded-tl-md overflow-hidden border-l border-t border-r border-[#d0d4e4] min-h-[50px]"
                                                onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropGroup(e, group.id)}>
                                                {group.rows.map(row => (
                                                    <BoardRow key={row.docId} row={row} columns={columns} color={group.color} isSelected={selectedIds.has(row.docId)} onToggleSelect={toggleSelect} onUpdateRow={handleUpdateRow} metrologos={metrologos} clientes={clientes} onDragStart={onDragStart} onDrop={onDrop} onDragEnd={onDragEnd} />
                                                ))}
                                                
                                                {/* ADD ROW */}
                                                {currentYear === new Date().getFullYear() && (
                                                    <div className="flex h-[36px] border-b border-[#d0d4e4] bg-white group hover:bg-gray-50">
                                                        <div className="sticky left-0 z-20 flex bg-white">
                                                            <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: group.color, opacity: 0.5 }}></div>
                                                            <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4]"></div>
                                                            {columns.filter(c => c.sticky && !c.hidden).map(c => (
                                                                <div key={c.key} style={{width: c.width}} className="border-r border-[#d0d4e4] flex-shrink-0 bg-white"></div>
                                                            ))}
                                                        </div>
                                                        <div className="flex-1 flex items-center px-2 relative">
                                                            <input type="text" placeholder="+ Agregar Equipo Rápido" className="outline-none text-sm w-[200px] h-full placeholder-gray-400 bg-transparent absolute left-2"
                                                                onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRow(group.id); (e.target as HTMLInputElement).value = ''; } }} onMouseDown={(e) => e.stopPropagation()} />
                                                            <button onClick={() => handleAddRow(group.id)} className="ml-[210px] text-xs bg-blue-600 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Agregar</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                            
                            {!isLoadingData && rows.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                        <Calendar className="w-8 h-8 text-gray-400"/>
                                    </div>
                                    <p className="text-gray-500 font-medium">No hay registros en {currentYear}</p>
                                    {currentYear === new Date().getFullYear() && <p className="text-sm text-gray-400">¡Comienza agregando un equipo arriba!</p>}
                                </div>
                            )}

                        </div>
                    </div>
                </div>

                {/* ACTION BAR (Delete) */}
                {selectedIds.size > 0 && (
                   <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-2xl rounded-lg border border-gray-200 px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
                       <div className="flex items-center gap-3 border-r border-gray-200 pr-6"><div className="bg-[#0073ea] text-white text-xs font-bold w-6 h-6 rounded flex items-center justify-center">{selectedIds.size}</div><span className="text-sm font-medium text-gray-700">Seleccionados</span></div>
                       <button onClick={handleDeleteSelected} className="flex flex-col items-center gap-1 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /><span className="text-[10px]">Eliminar</span></button>
                       <button onClick={() => setSelectedIds(new Set())} className="ml-2 hover:bg-gray-100 p-1 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                   </div>
                )}
            </div>

            {/* MODAL AGREGAR COLUMNA */}
            {isAddColOpen && <AddColumnModal onClose={() => setIsAddColOpen(false)} onAdd={handleAddColumn} />}
        </div>
    );
};

export default FridayScreen;