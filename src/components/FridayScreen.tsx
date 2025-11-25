import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, Trash2, ChevronDown, Search, 
  Bell, UserCircle, Calendar, GripVertical, X, 
  Menu, Building2, ArrowLeft, Settings
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, query, where, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';

// --- TIPOS ---
type CellType = "text" | "number" | "dropdown" | "date" | "person" | "client";

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
  id: string;
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

const DEFAULT_COLUMNS: Column[] = [
  { key: 'folio', label: 'Folio', width: 100, type: "text", sticky: true },
  { key: 'cliente', label: 'Cliente', width: 220, type: "client" },
  { key: 'equipo', label: 'Equipo', width: 180, type: "text" },
  { key: 'status', label: 'Estado', width: 140, type: "dropdown", options: ["pending","in_progress","completed","cancelled"] },
  { key: 'priority', label: 'Prioridad', width: 130, type: "dropdown", options: ["low","medium","high","urgent"] },
  { key: 'dueDate', label: 'Fecha Límite', width: 130, type: "date" },
  { key: 'assignedTo', label: 'Resp.', width: 120, type: "person" },
  { key: 'certificado', label: 'Certificado', width: 140, type: "text" },
  { key: 'marca', label: 'Marca', width: 130, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 130, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
];

// --- COMPONENTES DE CELDAS ---
const TextCell = ({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder?: string }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleBlur = () => { if (inputRef.current && inputRef.current.value !== value) onChange(inputRef.current.value); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') inputRef.current?.blur(); };
  return <input ref={inputRef} defaultValue={value || ""} placeholder={placeholder} onBlur={handleBlur} onKeyDown={handleKeyDown} className="w-full h-full px-3 bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-[#0073ea] focus:z-10 transition-all text-sm truncate placeholder-gray-300" />;
};

const ClientCell = ({ value, clientes, onChange }: { value: string, clientes: any[], onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = clientes.filter(c => (c.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()));
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
};

const DropdownCell = ({ value, options, config, onChange }: { value: string, options: string[], config: any, onChange: (val: string) => void }) => {
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
};

const DateCell = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const displayDate = value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null;
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="w-full h-full flex items-center justify-center group relative cursor-pointer hover:bg-gray-100" onClick={() => inputRef.current?.showPicker()}>
             {!value && <Calendar className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />}{value && <span className="text-xs text-gray-700 font-medium">{displayDate}</span>}
             <input ref={inputRef} type="date" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onChange(e.target.value)} />
        </div>
    );
};

const PersonCell = ({ value, metrologos, onChange }: { value: string, metrologos: any[], onChange: (val: string) => void }) => {
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
};

// --- COMPONENTE FILA (OPTIMIZADO) ---
const BoardRow = React.memo(({ row, columns, color, isSelected, onToggleSelect, onUpdateRow, metrologos, clientes, onDragStart, onDrop, onDragEnd }: any) => {
    const handleCellChange = useCallback((key: string, value: any) => { onUpdateRow(row.id, key, value); }, [row.id, onUpdateRow]);
    
    return (
        <div id={`row-${row.id}`}
            className={clsx("flex border-b border-[#d0d4e4] bg-white hover:bg-[#f5f7fa] group transition-colors h-[36px]", isSelected && "bg-blue-50")}
            draggable="true"
            onDragStart={(e) => onDragStart(e, { type: 'row', id: row.id })}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={onDragEnd} // Importante: Limpieza al soltar
            onDrop={(e) => { e.stopPropagation(); onDrop(e, { type: 'row', id: row.id }); }}
        >
            <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
            <div className="w-[40px] flex-shrink-0 border-r border-[#d0d4e4] bg-white sticky left-1.5 z-20 flex items-center justify-center group-hover:bg-[#f5f7fa]">
                 <div className="relative w-full h-full flex items-center justify-center cursor-pointer" onClick={() => onToggleSelect(row.id)}>
                    <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 absolute left-0 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing" />
                    <input type="checkbox" checked={isSelected} onChange={() => {}} className={clsx("rounded border-gray-300 text-[#0073ea] focus:ring-0 cursor-pointer", !isSelected && "opacity-0 group-hover:opacity-100")} />
                 </div>
            </div>

            {columns.filter((c: Column) => !c.hidden).map((col: Column) => {
                const style: React.CSSProperties = { width: col.width };
                if (col.sticky) {
                    style.position = 'sticky';
                    style.left = 46; 
                    style.zIndex = 15;
                    style.backgroundColor = isSelected ? '#eff6ff' : '#fff';
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
    return prev.row === next.row && prev.isSelected === next.isSelected && prev.columns === next.columns && prev.clientes === next.clientes;
});

// --- MAIN COMPONENT ---
const FridayScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [sidebarAbierto, setSidebarAbierto] = useState(!isMobile);
    const [rows, setRows] = useState<WorksheetData[]>([]);
    const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
    const dragItemRef = useRef<DragItem | null>(null); // REF PARA EVITAR RENDERIZADOS MASIVOS

    const [groupsConfig, setGroupsConfig] = useState<GroupData[]>([
        { id: "sitio", name: "Servicios en Sitio", color: "#0073ea", collapsed: false },
        { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false }
    ]);
    
    const [metrologos, setMetrologos] = useState<any[]>([]);
    const [clientes, setClientes] = useState<any[]>([]); 
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // LOAD DATA
    useEffect(() => {
        const unsubBoard = onSnapshot(doc(db, "tableros", "principal"), (snap) => {
            if (snap.exists() && snap.data().columns) {
                const savedCols = snap.data().columns;
                const merged = savedCols.map((c: any) => {
                    const def = DEFAULT_COLUMNS.find(d => d.key === c.key);
                    if (c.key === 'cliente') return { ...(def || {}), ...c, type: 'client' };
                    return { ...(def || {}), ...c };
                });
                DEFAULT_COLUMNS.forEach(def => { if (!merged.find((c: any) => c.key === def.key)) merged.push(def); });
                setColumns(merged);
            } else { setColumns(DEFAULT_COLUMNS); }
        });

        const unsubMetrologos = onSnapshot(query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo")), (snap) => setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsubClientes = onSnapshot(collection(db, "clientes"), (snap) => setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsubRows = onSnapshot(query(collection(db, "hojasDeTrabajo")), (snapshot) => {
            const newRows: WorksheetData[] = [];
            snapshot.forEach(doc => newRows.push({ id: doc.id, ...doc.data() } as WorksheetData));
            setRows(newRows);
        });

        return () => { unsubBoard(); unsubMetrologos(); unsubRows(); unsubClientes(); };
    }, []);

    // HANDLERS
    const handleUpdateRow = useCallback(async (rowId: string, key: string, value: any) => {
        setRows(prevRows => prevRows.map(r => r.id === rowId ? { ...r, [key]: value } : r));
        try { await updateDoc(doc(db, "hojasDeTrabajo", rowId), { [key]: value, lastUpdated: new Date().toISOString() }); } catch (error) { console.error(error); }
    }, []);

    const handleAddRow = useCallback(async (groupId: string) => {
        const newId = `WS-${Date.now()}`;
        const newRow: WorksheetData = { id: newId, folio: "", cliente: "", equipo: "", lugarCalibracion: groupId, status: 'pending', priority: 'medium', createdAt: new Date().toISOString() };
        setRows(prev => [...prev, newRow]);
        await setDoc(doc(db, "hojasDeTrabajo", newId), newRow);
    }, []);

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`¿Eliminar ${selectedIds.size} elementos?`)) return; // Confirmación de seguridad
        const batch = writeBatch(db);
        selectedIds.forEach(id => { batch.delete(doc(db, "hojasDeTrabajo", id)); });
        setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
        setSelectedIds(new Set());
        await batch.commit();
    };

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    }, []);

    // --- DRAG & DROP OPTIMIZADO ---
    const onDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
        dragItemRef.current = item;
        e.dataTransfer.effectAllowed = "move";
        if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.4';
    }, []);

    // Limpieza universal al terminar
    const onDragEnd = useCallback((e: React.DragEvent) => {
        if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
        dragItemRef.current = null;
    }, []);

    const onDrop = useCallback(async (e: React.DragEvent, target: DragItem) => {
        e.preventDefault();
        const dragItem = dragItemRef.current;
        if (!dragItem) return;

        // Columnas
        if (dragItem.type === 'column' && target.type === 'column' && dragItem.index !== undefined && target.index !== undefined) {
             const fromIdx = dragItem.index;
             const toIdx = target.index;
             if (fromIdx !== toIdx) {
                // PRIMERO calculamos, LUEGO actualizamos estado y DB por separado
                let newCols = [...columns];
                const [moved] = newCols.splice(fromIdx, 1);
                newCols.splice(toIdx, 0, moved);
                setColumns(newCols);
                setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
             }
        }

        // Filas
        if (dragItem.type === 'row' && target.type === 'row' && dragItem.id && target.id) {
            setRows(currentRows => {
                const sourceRow = currentRows.find(r => r.id === dragItem.id);
                const targetRow = currentRows.find(r => r.id === target.id);
                if (sourceRow && targetRow && sourceRow.id !== targetRow.id) {
                    const targetGroupId = targetRow.lugarCalibracion === 'sitio' ? 'sitio' : 'laboratorio';
                    if (sourceRow.lugarCalibracion !== targetGroupId) {
                        updateDoc(doc(db, "hojasDeTrabajo", sourceRow.id), { lugarCalibracion: targetGroupId });
                        return currentRows.map(r => r.id === sourceRow.id ? { ...r, lugarCalibracion: targetGroupId } : r);
                    }
                }
                return currentRows;
            });
        }
    }, [columns]); // Dependencia columns necesaria para DnD columnas

    const onDropGroup = useCallback(async (e: React.DragEvent, groupId: string) => {
        e.preventDefault();
        const dragItem = dragItemRef.current;
        if (!dragItem || dragItem.type !== 'row' || !dragItem.id) return;

        setRows(currentRows => {
            const sourceRow = currentRows.find(r => r.id === dragItem.id);
            if (sourceRow) {
                const currentGroup = sourceRow.lugarCalibracion === 'sitio' ? 'sitio' : 'laboratorio';
                if (currentGroup !== groupId) {
                    updateDoc(doc(db, "hojasDeTrabajo", sourceRow.id), { lugarCalibracion: groupId });
                    return currentRows.map(r => r.id === sourceRow.id ? { ...r, lugarCalibracion: groupId } : r);
                }
            }
            return currentRows;
        });
    }, []);

    const groupedRows = useMemo(() => {
        const filtered = rows.filter(r => {
            if (!search) return true;
            const s = search.toLowerCase();
            return (r.cliente || "").toLowerCase().includes(s) || (r.folio || "").toLowerCase().includes(s) || (r.equipo || "").toLowerCase().includes(s);
        });
        return groupsConfig.map(group => ({
            ...group,
            rows: filtered.filter(r => {
                const rowLocation = r.lugarCalibracion === 'sitio' ? 'sitio' : 'laboratorio';
                return rowLocation === group.id;
            })
        }));
    }, [rows, groupsConfig, search]);

    return (
        <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338] overflow-hidden">
             <div className={clsx("flex-shrink-0 bg-white h-full z-50 transition-all duration-300 ease-in-out overflow-hidden border-r border-[#d0d4e4]", sidebarAbierto ? "w-64 opacity-100" : "w-0 opacity-0 border-none")}>
                <div className="w-64 h-full"><SidebarFriday onNavigate={navigateTo} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} /></div>
             </div>
             {isMobile && sidebarAbierto && (<div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarAbierto(false)}></div>)}
             {isMobile && (<div className={clsx("fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transition-transform duration-300", sidebarAbierto ? "translate-x-0" : "-translate-x-full")}><SidebarFriday onNavigate={navigateTo} isOpen={true} onToggle={() => setSidebarAbierto(false)} /></div>)}

            <div className="flex-1 flex flex-col min-w-0 bg-white relative transition-all duration-300">
                <div className="px-6 py-4 border-b border-[#d0d4e4] flex justify-between items-center bg-white sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSidebarAbierto(!sidebarAbierto)} className="p-2 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"><Menu className="w-6 h-6"/></button>
                            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="Regresar al Menú"><ArrowLeft className="w-6 h-6"/></button>
                        </div>
                        <div className="flex flex-col"><h1 className="text-2xl font-bold leading-tight">Tablero Principal</h1><div className="flex items-center gap-2 text-sm text-gray-500"><span>Gestión de Calibración</span></div></div>
                    </div>
                    <div className="flex gap-3">
                        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input placeholder="Buscar" className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-full text-sm focus:border-blue-500 outline-none hover:shadow-sm transition-shadow" value={search} onChange={e => setSearch(e.target.value)} /></div>
                        <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Bell className="w-5 h-5"/></button>
                        <button className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Settings className="w-5 h-5"/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white" id="main-board-scroll">
                    <div className="inline-block min-w-full pb-32">
                        <div className="flex border-b border-[#d0d4e4] sticky top-0 z-30 bg-white shadow-sm h-[34px]">
                            <div className="w-1.5 bg-white sticky left-0 z-30"></div>
                            <div className="w-[40px] border-r border-[#d0d4e4] bg-white sticky left-1.5 z-30 flex items-center justify-center"><input type="checkbox" className="rounded border-gray-300" /></div>
                            {columns.filter(c => !c.hidden).map((col, index) => (
                                <div key={col.key} draggable="true" onDragStart={(e) => onDragStart(e, { type: 'column', index })} onDragOver={(e) => e.preventDefault()} onDragEnd={onDragEnd} onDrop={(e) => onDrop(e, { type: 'column', index })} 
                                     style={{ width: col.width, left: col.sticky ? 46 : undefined, position: col.sticky ? 'sticky' : undefined, zIndex: col.sticky ? 30 : undefined }}
                                     className={clsx("px-2 text-xs font-semibold text-gray-500 flex items-center justify-center border-r border-transparent hover:bg-gray-50 cursor-grab active:cursor-grabbing select-none bg-white", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r-[#d0d4e4]")}>
                                    {col.label}
                                </div>
                            ))}
                            <div className="w-10 flex items-center justify-center border-l border-gray-200 hover:bg-gray-100 cursor-pointer"><Plus className="w-4 h-4 text-gray-400"/></div>
                        </div>

                        <div className="px-4 mt-6">
                            {groupedRows.map((group) => (
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
                                                <BoardRow key={row.id} row={row} columns={columns} color={group.color} isSelected={selectedIds.has(row.id)} onToggleSelect={toggleSelect} onUpdateRow={handleUpdateRow} metrologos={metrologos} clientes={clientes} onDragStart={onDragStart} onDrop={onDrop} onDragEnd={onDragEnd} />
                                            ))}
                                            <div className="flex h-[36px] border-b border-[#d0d4e4] bg-white group hover:bg-gray-50">
                                                <div className="w-1.5 sticky left-0 z-20" style={{ backgroundColor: group.color, opacity: 0.5 }}></div>
                                                <div className="w-[40px] sticky left-1.5 bg-white z-20 border-r border-[#d0d4e4]"></div>
                                                <div className="sticky left-[46px] z-20 bg-white flex items-center px-2">
                                                    <input type="text" placeholder="+ Agregar Equipo" className="outline-none text-sm w-[200px] h-full placeholder-gray-400 bg-transparent"
                                                        onKeyDown={(e) => { if (e.key === 'Enter') { handleAddRow(group.id); (e.target as HTMLInputElement).value = ''; } }} onMouseDown={(e) => e.stopPropagation()} />
                                                    <button onClick={() => handleAddRow(group.id)} className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Agregar</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
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
            </div>
        </div>
    );
};

export default FridayScreen;