import React, { useState, useEffect, useCallback, useRef, useTransition } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Search, Filter, 
  MoreHorizontal, Home, Settings, Bell, UserCircle, Calendar, 
  GripVertical, X, Type, Hash, List, ArrowLeft, Menu
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, getDocs, query, where, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';

// --- CONSTANTES ---
const STATUS_CONFIG: any = {
  pending: { label: "Pendiente", bg: "#c4c4c4", text: "#fff" },
  in_progress: { label: "En Proceso", bg: "#fdab3d", text: "#fff" },
  completed: { label: "Listo", bg: "#00c875", text: "#fff" },
  cancelled: { label: "Atorado", bg: "#e2445c", text: "#fff" }
};

const PRIORITY_CONFIG: any = {
  low: { label: "Baja", bg: "#579bfc", text: "#fff" },
  medium: { label: "Media", bg: "#5559df", text: "#fff" },
  high: { label: "Alta", bg: "#fdab3d", text: "#fff" },
  urgent: { label: "Urgente", bg: "#e2445c", text: "#fff" }
};

// --- INTERFACES ---
interface WorksheetData {
  id: string;
  [key: string]: any;
}

interface Column {
  key: string;
  label: string;
  type?: "text"|"number"|"dropdown"|"date"|"person";
  width: number;
  hidden?: boolean;
  options?: string[];
  sortable?: boolean;
  sticky?: boolean;
}

interface Group {
  id: string;
  name: string;
  color: string;
  rows: WorksheetData[];
  collapsed: boolean;
}

interface DragItem {
  type: 'row' | 'column';
  index: number;
  gidx?: number;
  id?: string;
}

// --- COLUMNAS DEFAULT ---
const DEFAULT_COLUMNS: Column[] = [
  { key: 'folio', label: 'Folio', width: 100, type: "text", sortable: true, sticky: true },
  { key: 'cliente', label: 'Cliente', width: 220, type: "text", sortable: true },
  { key: 'equipo', label: 'Equipo', width: 180, type: "text", sortable: true },
  { key: 'status', label: 'Estado', width: 140, type: "dropdown", options: ["pending","in_progress","completed","cancelled"], sortable: true },
  { key: 'priority', label: 'Prioridad', width: 130, type: "dropdown", options: ["low","medium","high","urgent"], sortable: true },
  { key: 'dueDate', label: 'Fecha Límite', width: 130, type: "date", sortable: true },
  { key: 'assignedTo', label: 'Resp.', width: 120, type: "person", sortable: true },
  { key: 'certificado', label: 'Certificado', width: 140, type: "text", sortable: true },
  { key: 'marca', label: 'Marca', width: 130, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 130, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
];

// --- COMPONENTE CELDA ---
interface CellProps {
  row: WorksheetData;
  col: Column;
  gidx: number;
  ridx: number;
  isEditing: boolean;
  onStartEdit: (gidx: number, ridx: number, key: string, val: any) => void;
  onSave: (val: any) => void;
  onCancel: () => void;
  metrologos: any[];
}

const Cell = React.memo(({ row, col, gidx, ridx, isEditing, onStartEdit, onSave, onCancel, metrologos }: CellProps) => {
  const [tempValue, setTempValue] = useState(row[col.key]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTempValue(row[col.key]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditing, row, col.key]);

  const value = row[col.key];
  const cellBaseClass = "h-full w-full px-3 flex items-center text-sm relative transition-colors duration-200";

  if (col.key === 'status' || col.key === 'priority') {
    const config = col.key === 'status' ? STATUS_CONFIG : PRIORITY_CONFIG;
    const item = config[value] || { label: value, bg: "#c4c4c4" };

    if (isEditing) {
      return (
        <div className="relative w-full h-full">
            <div className="w-full h-full flex items-center justify-center text-white font-medium" style={{ backgroundColor: item.bg }}>
                {item.label}
            </div>
            <div className="absolute top-full left-0 w-full bg-white shadow-xl rounded-b-md border border-gray-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
               {col.options?.map(opt => (
                 <div key={opt} 
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2 border-b border-gray-50"
                      onClick={(e) => { e.stopPropagation(); onSave(opt); }}>
                    <div className="w-3 h-3 rounded-full" style={{ background: config[opt]?.bg || '#ccc' }}></div>
                    <span className="text-xs font-medium text-gray-700">{config[opt]?.label || opt}</span>
                 </div>
               ))}
            </div>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onCancel(); }}></div>
        </div>
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center cursor-pointer text-white font-medium group hover:opacity-90"
           style={{ backgroundColor: item.bg }}
           onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
          <span className="truncate px-1 text-xs">{item.label}</span>
      </div>
    );
  }

  if (col.type === 'date') {
    if (isEditing) {
      return (
        <div className="w-full h-full relative">
            <input ref={inputRef} type="date" className="w-full h-full px-2 outline-none border-2 border-[#0073ea] bg-white absolute inset-0 z-50 text-xs"
               value={tempValue || ''} onChange={(e) => setTempValue(e.target.value)} onBlur={() => onSave(tempValue)} onKeyDown={(e) => e.key === 'Enter' && onSave(tempValue)} 
            />
        </div>
      );
    }
    const displayDate = value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '-';
    return (
      <div className={clsx(cellBaseClass, "justify-center hover:bg-gray-100 cursor-pointer")} 
           onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
          {value ? displayDate : <Calendar className="w-4 h-4 text-gray-300" />}
      </div>
    );
  }

  if (col.type === 'person') {
    if (isEditing) {
      return (
        <div className="relative w-full h-full">
            <div className="absolute top-0 left-0 min-w-[200px] bg-white shadow-2xl rounded border border-blue-200 z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
              {metrologos.map((m: any) => {
                  const name = m.name || "Desconocido";
                  const initial = name.charAt(0) || "?";
                  return (
                    <div key={m.id} className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                        onClick={() => onSave(name)}>
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">{initial}</div>
                    <span className="text-sm text-gray-700">{name}</span>
                    </div>
                  );
              })}
            </div>
            <div className="fixed inset-0 z-40" onClick={onCancel}></div>
        </div>
      );
    }
    const displayInitial = (value && typeof value === 'string') ? value.charAt(0).toUpperCase() : "?";
    return (
      <div className={clsx(cellBaseClass, "justify-center hover:bg-gray-100 cursor-pointer")} 
           onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
          {value ? (
            <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white shadow-sm" title={value}>
              {displayInitial}
            </div>
          ) : <UserCircle className="w-6 h-6 text-gray-300" />}
      </div>
    );
  }

  if (isEditing) {
    return (
        <div className="w-full h-full relative block">
            <input ref={inputRef} className="w-full h-full px-3 outline-none bg-white border-2 border-[#0073ea] shadow-md text-sm text-gray-800 absolute inset-0 z-50"
                value={tempValue || ''} onChange={(e) => setTempValue(e.target.value)} onBlur={() => onSave(tempValue)} 
                onKeyDown={(e) => { if(e.key==='Enter') onSave(tempValue); if(e.key==='Escape') onCancel(); }}
            />
        </div>
    );
  }

  return (
    <div className={clsx(cellBaseClass, "hover:border-[#aeb1bd] hover:bg-white cursor-text group border border-transparent")}
         onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
        <span className="truncate w-full block text-gray-700">{value}</span>
    </div>
  );
}, (prev, next) => {
  return (
    prev.row[prev.col.key] === next.row[next.col.key] &&
    prev.isEditing === next.isEditing &&
    prev.col.width === next.col.width &&
    prev.col.sticky === next.col.sticky
  );
});

// --- COMPONENTE FILA ---
interface BoardRowProps {
  row: WorksheetData;
  columns: Column[];
  gidx: number;
  ridx: number;
  color: string;
  isSelected: boolean;
  editCell: { gidx: number, ridx: number, key: string } | null;
  onToggleSelect: (gidx: number, ridx: number) => void;
  onStartEdit: (gidx: number, ridx: number, key: string, val: any) => void;
  onSaveCell: (val: any) => void;
  onCancelEdit: () => void;
  metrologos: any[];
  onDragStart: (e: React.DragEvent, item: DragItem) => void;
  onDrop: (e: React.DragEvent, targetGidx: number, targetRidx: number) => void;
}

const BoardRow = React.memo(({ 
  row, columns, gidx, ridx, color, isSelected, editCell, 
  onToggleSelect, onStartEdit, onSaveCell, onCancelEdit, metrologos, onDragStart, onDrop
}: BoardRowProps) => {
  return (
    <div 
        className={clsx("flex border-b border-[#d0d4e4] hover:bg-[#f5f7fa] group transition-colors h-9 bg-white", isSelected && "bg-blue-50")}
        draggable
        onDragStart={(e) => onDragStart(e, { type: 'row', index: ridx, gidx, ridx, id: row.id })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, gidx, ridx)}
    >
       <div className="w-1.5 flex-shrink-0 sticky left-0 z-20" style={{ backgroundColor: color }}></div>
       <div className="w-10 flex-shrink-0 border-r border-[#d0d4e4] bg-white sticky left-1.5 z-20 flex items-center justify-center group-hover:bg-[#f5f7fa]">
           <input 
              type="checkbox" 
              checked={isSelected}
              onChange={() => onToggleSelect(gidx, ridx)}
              className="opacity-0 group-hover:opacity-100 checked:opacity-100 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
           />
           <GripVertical className="w-3 h-3 text-gray-300 absolute left-0 opacity-0 group-hover:opacity-100 cursor-grab" />
       </div>
       {columns.filter(c => !c.hidden).map((col) => {
          const isEditing = editCell?.gidx === gidx && editCell?.ridx === ridx && editCell?.key === col.key;
          const style: React.CSSProperties = { width: col.width };
          if (col.sticky) {
             style.position = 'sticky';
             style.left = 46;
             style.zIndex = 20;
             style.backgroundColor = isSelected ? '#eff6ff' : '#fff';
          }
          return (
             <div key={col.key} style={style} 
                  className={clsx("flex-shrink-0 border-r border-[#d0d4e4] relative", col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.02)]")}>
                 <Cell row={row} col={col} gidx={gidx} ridx={ridx} isEditing={isEditing} 
                    onStartEdit={onStartEdit} onSave={onSaveCell} onCancel={onCancelEdit} metrologos={metrologos} />
             </div>
          );
       })}
       <div className="w-full border-b border-transparent"></div>
    </div>
  );
});

// --- COMPONENTE PRINCIPAL ---
const FridayScreen: React.FC<{ navigate?: (route: string) => void }> = ({ navigate }) => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { const c = () => setIsMobile(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);

  // HOOK DE TRANSICIÓN PARA EVITAR INP (Lag en botones)
  const [isPending, startTransition] = useTransition();

  const [groups, setGroups] = useState<Group[]>([
    { id: "sitio", name: "Servicios en Sitio", color: "#0073ea", collapsed: false, rows: [] },
    { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false, rows: [] }
  ]);
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [metrologos, setMetrologos] = useState<any[]>([]);

  const [editCell, setEditCell] = useState<{gidx:number, ridx:number, key:string}|null>(null);
  const [selectedRows, setSelectedRows] = useState<{gidx:number, ridx:number}[]>([]);
  const [search, setSearch] = useState("");
  
  // Sidebar state
  const [sidebarAbierto, setSidebarAbierto] = useState(!isMobile);

  const [showAddCol, setShowAddCol] = useState(false);
  const [newColData, setNewColData] = useState({ label: "", type: "text" });
  const [dragItem, setDragItem] = useState<DragItem | null>(null);

  // --- CARGA DE DATOS ---
  useEffect(() => {
     const unsubMetrologos = onSnapshot(query(collection(db,"usuarios"), where("puesto", "==", "Metrólogo")), (snap) => {
        setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
     });

     const unsubBoard = onSnapshot(doc(db, "tableros", "principal"), (snap) => {
        if(snap.exists() && snap.data().columns) {
            const savedCols = snap.data().columns;
            const merged = DEFAULT_COLUMNS.map(def => {
                const found = savedCols.find((c:Column) => c.key === def.key);
                return found ? { ...def, ...found } : def;
            });
            savedCols.forEach((c:Column) => {
                if(!DEFAULT_COLUMNS.find(def => def.key === c.key)) merged.push(c);
            });
            setColumns(merged);
        }
     });

     const unsubWorksheets = onSnapshot(collection(db, "hojasDeTrabajo"), (snap) => {
        snap.docChanges().forEach(change => {
            const data = { id: change.doc.id, ...change.doc.data() } as WorksheetData;
            setGroups(prev => {
                const newGroups = [...prev];
                if (change.type === 'removed') {
                    return newGroups.map(g => ({...g, rows: g.rows.filter(r => r.id !== change.doc.id)}));
                }
                const targetId = data.lugarCalibracion === 'sitio' ? 'sitio' : 'laboratorio';
                const gIndex = newGroups.findIndex(g => g.id === targetId);
                if (gIndex === -1) return prev;
                const group = newGroups[gIndex];
                const rIndex = group.rows.findIndex(r => r.id === data.id);
                if (rIndex >= 0) group.rows[rIndex] = { ...group.rows[rIndex], ...data };
                else group.rows.push(data);
                return newGroups;
            });
        });
     });
     return () => { unsubBoard(); unsubWorksheets(); unsubMetrologos(); };
  }, []);

  // --- HANDLERS ---
  const { navigateTo } = useNavigation();
  
  // OPTIMIZACIÓN CRÍTICA DE INP: Usamos startTransition para que la navegación no bloquee el hilo principal
  const manejarNavegacion = useCallback((d: string) => {
      startTransition(() => {
          if(['servicios','friday-servicios'].includes(d)) navigateTo('friday-servicios');
          else if(['menu','inicio','mainmenu'].includes(d)) navigateTo('menu');
          else navigateTo(d);
      });
  }, [navigateTo]);

  const handleAddRow = useCallback(async (gidx: number) => {
      const newId = `WS-${Date.now()}`;
      const newRow: WorksheetData = {
          id: newId, certificado: "", cliente: "Cliente Nuevo", folio: `N-${Math.floor(Math.random()*1000)}`,
          equipo: "Equipo Genérico", marca: "", modelo: "", serie: "", 
          lugarCalibracion: groups[gidx].id as any, status: 'pending', priority: 'medium',
          assignedTo: "", dueDate: new Date().toISOString()
      };
      await setDoc(doc(db, "hojasDeTrabajo", newId), newRow);
  }, [groups]);

  const handleSaveCell = useCallback((val: any) => {
      if (!editCell) return;
      const { gidx, ridx, key } = editCell;
      setGroups(prev => {
          const newGroups = [...prev];
          if(newGroups[gidx]?.rows[ridx]) newGroups[gidx].rows[ridx][key] = val;
          return newGroups;
      });
      const rowId = groups[gidx].rows[ridx].id;
      updateDoc(doc(db, "hojasDeTrabajo", rowId), { [key]: val, lastUpdated: new Date().toISOString() }).catch(e => console.error(e));
      setEditCell(null);
  }, [editCell, groups]);

  const handleAddColumn = async () => {
      if(!newColData.label) return;
      const newKey = newColData.label.toLowerCase().replace(/\s+/g, '_');
      const newCol: Column = { key: newKey, label: newColData.label, type: newColData.type as any, width: 150, sortable: true };
      const updatedCols = [...columns, newCol];
      setColumns(updatedCols);
      setShowAddCol(false);
      setNewColData({ label: "", type: "text" });
      await setDoc(doc(db, "tableros", "principal"), { columns: updatedCols }, { merge: true });
  };

  const handleDeleteSelected = async () => {
      if(!confirm(`¿Eliminar ${selectedRows.length} equipos?`)) return;
      const promises = selectedRows.map(sel => {
          const row = groups[sel.gidx]?.rows[sel.ridx];
          return row ? deleteDoc(doc(db, "hojasDeTrabajo", row.id)) : Promise.resolve();
      });
      await Promise.all(promises);
      setSelectedRows([]);
  };

  // --- DRAG & DROP ---
  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
      setDragItem(item);
      e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetGidxOrColIndex: number, targetRidx?: number) => {
      e.preventDefault();
      if (!dragItem) return;

      if (dragItem.type === 'column') {
          const sourceIndex = dragItem.index;
          const targetIndex = targetGidxOrColIndex;
          if (sourceIndex === targetIndex) return;

          const newCols = [...columns];
          const [movedCol] = newCols.splice(sourceIndex, 1);
          newCols.splice(targetIndex, 0, movedCol);
          
          setColumns(newCols);
          setDragItem(null);
          await setDoc(doc(db, "tableros", "principal"), { columns: newCols }, { merge: true });
          return;
      }

      if (dragItem.type === 'row' && typeof targetRidx === 'number') {
          const sourceGidx = dragItem.gidx!;
          const sourceRidx = dragItem.ridx!;
          const targetGidx = targetGidxOrColIndex;
          
          if (sourceGidx === targetGidx && sourceRidx === targetRidx) return;

          const newGroups = [...groups];
          const [movedRow] = newGroups[sourceGidx].rows.splice(sourceRidx, 1);
          const targetGroup = newGroups[targetGidx];
          
          movedRow.lugarCalibracion = targetGroup.id as any;
          targetGroup.rows.splice(targetRidx, 0, movedRow);
          
          setGroups(newGroups);
          setDragItem(null);

          await updateDoc(doc(db, "hojasDeTrabajo", movedRow.id), { 
              lugarCalibracion: targetGroup.id,
              lastUpdated: new Date().toISOString()
          });
      }
  }, [dragItem, groups, columns]);


  return (
    <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338] overflow-hidden">
        {/* SIDEBAR RESPONSIVE - Layout relativo en desktop para empujar contenido */}
        {sidebarAbierto && (
            <div className={clsx(
                "flex-shrink-0 bg-white h-full z-50 transition-all duration-300",
                isMobile ? "fixed inset-y-0 left-0 shadow-xl w-64" : "relative w-64 border-r border-[#d0d4e4]"
            )}>
                 <SidebarFriday onNavigate={manejarNavegacion} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} />
            </div>
        )}

        {isMobile && sidebarAbierto && (
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarAbierto(false)}></div>
        )}
        
        {/* CONTENIDO PRINCIPAL - FLEX-1 PARA LLENAR EL ESPACIO RESTANTE */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white relative transition-all duration-300">
           
           {/* HEADER */}
           <div className="px-6 py-4 border-b border-[#d0d4e4] flex justify-between items-center bg-white">
               <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2">
                       {!sidebarAbierto && (
                           <button onClick={() => setSidebarAbierto(true)} className="p-2 hover:bg-gray-100 rounded-md text-gray-600">
                               <Menu className="w-6 h-6" />
                           </button>
                       )}
                       {/* BOTÓN DE ATRÁS OPTIMIZADO (isPending muestra estado de carga si es lento) */}
                       <button 
                           onClick={() => manejarNavegacion('mainmenu')} 
                           disabled={isPending}
                           className={clsx("p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600", isPending && "opacity-50 cursor-wait")} 
                           title="Volver al Menú"
                       >
                           <ArrowLeft className="w-6 h-6" />
                       </button>
                   </div>

                   <div>
                       <h1 className="text-2xl font-bold text-[#323338] leading-tight">Equipos en Calibración</h1>
                       <p className="text-sm text-gray-500">Tablero Principal</p>
                   </div>
               </div>
               <div className="flex items-center gap-3">
                   <button className="p-2 hover:bg-gray-100 rounded-full"><Bell className="w-5 h-5 text-gray-500"/></button>
                   <button className="p-2 hover:bg-gray-100 rounded-full"><Settings className="w-5 h-5 text-gray-500"/></button>
               </div>
           </div>

           {/* TOOLBAR */}
           <div className="px-6 py-3 flex items-center justify-between sticky top-0 z-40 bg-white shadow-sm">
                <div className="flex gap-2 items-center flex-wrap">
                    <button onClick={() => handleAddRow(0)} className="bg-[#0073ea] hover:bg-[#0060b9] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm">
                        <Plus className="w-4 h-4 mr-2"/> Nuevo Equipo
                    </button>
                    <div className="relative ml-2">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500"/>
                        <input 
                            value={search} 
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar..." 
                            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm w-64 transition-all bg-white text-gray-900 placeholder-gray-400"
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"><Filter className="w-4 h-4 mr-1"/> Filtros</button>
                </div>
           </div>

           {/* TABLA */}
           <div className="flex-1 overflow-auto pl-6 pr-2 pb-24 bg-white">
               <div className="inline-block min-w-full pb-4 relative">
                   
                   {/* Header Columnas */}
                   <div className="flex border-b border-[#d0d4e4] sticky top-0 z-30 bg-white shadow-sm h-10">
                       <div className="w-1.5 sticky left-0 bg-white z-30"></div>
                       <div className="w-10 border-r border-[#d0d4e4] bg-white sticky left-1.5 z-30 flex items-center justify-center">
                           <input type="checkbox" className="rounded border-gray-300" />
                       </div>
                       
                       {columns.filter(c => !c.hidden).map((col, index) => (
                           <div key={col.key} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, { type: 'column', index })}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDrop(e, index)}
                                style={{ width: col.width, left: col.sticky ? 46 : undefined, position: col.sticky ? 'sticky' : undefined, zIndex: col.sticky ? 30 : undefined }}
                                className={clsx(
                                    "px-2 text-xs font-bold text-gray-500 text-center border-r border-[#d0d4e4] bg-white select-none flex items-center justify-center hover:bg-gray-50 cursor-grab active:cursor-grabbing", 
                                    col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
                                )}
                            >
                               {col.label}
                           </div>
                       ))}
                       
                       <div className="w-10 flex items-center justify-center border-r border-gray-200 hover:bg-gray-100 cursor-pointer" onClick={() => setShowAddCol(true)}>
                           <Plus className="w-4 h-4 text-gray-400"/>
                       </div>
                   </div>

                   {/* Grupos */}
                   {groups.map((group, gidx) => (
                       <div key={group.id} className="mt-6">
                           <div className="flex items-center mb-1 sticky left-0 pl-2 bg-white z-10">
                               <ChevronDown className={clsx("w-5 h-5 text-[#0073ea] cursor-pointer transition-transform", group.collapsed && "-rotate-90")} 
                                            onClick={()=>{ const n = [...groups]; n[gidx].collapsed = !n[gidx].collapsed; setGroups(n); }}/>
                               <h2 className="text-lg font-medium ml-1" style={{color: group.color}}>{group.name}</h2>
                               <span className="ml-3 text-xs text-gray-400 border px-2 rounded-full">{group.rows.length} items</span>
                           </div>
                           {!group.collapsed && (
                               <div className="border-t border-[#d0d4e4]">
                                   {group.rows.filter(r => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).map((row, ridx) => (
                                       <BoardRow key={row.id || ridx} row={row} columns={columns} gidx={gidx} ridx={ridx} color={group.color}
                                          isSelected={selectedRows.some(s => s.gidx === gidx && s.ridx === ridx)}
                                          editCell={editCell}
                                          onToggleSelect={(gx, rx) => {
                                              const exists = selectedRows.some(s => s.gidx === gx && s.ridx === rx);
                                              if(exists) setSelectedRows(prev => prev.filter(s => !(s.gidx === gx && s.ridx === rx)));
                                              else setSelectedRows(prev => [...prev, {gidx: gx, ridx: rx}]);
                                          }}
                                          onStartEdit={(gx, rx, k, v) => setEditCell({gidx: gx, ridx: rx, key: k})}
                                          onSaveCell={handleSaveCell} onCancelEdit={() => setEditCell(null)} metrologos={metrologos}
                                          onDragStart={handleDragStart} onDrop={handleDrop}
                                       />
                                   ))}
                                   <div className="flex h-9 border-b border-[#d0d4e4] group">
                                       <div className="w-1.5 bg-transparent sticky left-0 z-10"></div>
                                       <div className="w-10 border-r border-[#d0d4e4] sticky left-1.5 bg-white z-10"></div>
                                       <div className="pl-2 flex items-center sticky left-[46px] bg-white z-10">
                                           <input type="text" placeholder="+ Añadir" className="outline-none text-sm w-48 h-full placeholder-gray-400 hover:bg-gray-50 px-2 bg-transparent"
                                              onKeyDown={(e) => e.key === 'Enter' && handleAddRow(gidx)} />
                                       </div>
                                   </div>
                               </div>
                           )}
                       </div>
                   ))}
               </div>
           </div>
           
           {/* MENU FLOTANTE BULK ACTIONS */}
           {selectedRows.length > 0 && (
               <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-white shadow-2xl rounded-lg border border-gray-200 px-6 py-3 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-4">
                   <div className="flex items-center gap-3 border-r border-gray-200 pr-6">
                       <div className="bg-[#0073ea] text-white text-xs font-bold w-6 h-6 rounded flex items-center justify-center">{selectedRows.length}</div>
                       <span className="text-sm font-medium text-gray-700">Seleccionados</span>
                   </div>
                   <div className="flex gap-4">
                       <button onClick={handleDeleteSelected} className="flex flex-col items-center gap-1 text-gray-500 hover:text-red-600 transition-colors">
                           <Trash2 className="w-5 h-5" />
                           <span className="text-[10px]">Eliminar</span>
                       </button>
                   </div>
                   <button onClick={() => setSelectedRows([])} className="ml-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
               </div>
           )}

           {/* MODAL AGREGAR COLUMNA */}
           {showAddCol && (
               <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center">
                   <div className="bg-white rounded-lg shadow-2xl w-96 p-6">
                       <h3 className="text-lg font-bold mb-4">Nueva Columna</h3>
                       <div className="space-y-4">
                           <div>
                               <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Título</label>
                               <input autoFocus value={newColData.label} onChange={e => setNewColData({...newColData, label: e.target.value})}
                                   className="w-full border border-gray-300 rounded p-2 text-sm focus:border-blue-500 outline-none text-black bg-white"/>
                           </div>
                           <div>
                               <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tipo</label>
                               <div className="grid grid-cols-3 gap-2">
                                   {[
                                       {id: 'text', icon: Type, label: 'Texto'},
                                       {id: 'number', icon: Hash, label: 'Num'},
                                       {id: 'date', icon: Calendar, label: 'Fecha'},
                                       {id: 'dropdown', icon: List, label: 'Estado'},
                                       {id: 'person', icon: UserCircle, label: 'Persona'},
                                   ].map(t => (
                                       <div key={t.id} onClick={() => setNewColData({...newColData, type: t.id})}
                                            className={clsx("border rounded p-2 flex flex-col items-center cursor-pointer hover:bg-blue-50", newColData.type === t.id ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200")}>
                                            <t.icon className="w-5 h-5 mb-1"/>
                                            <span className="text-xs">{t.label}</span>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       </div>
                       <div className="mt-6 flex justify-end gap-2">
                           <button onClick={() => setShowAddCol(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm">Cancelar</button>
                           <button onClick={handleAddColumn} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Crear Columna</button>
                       </div>
                   </div>
               </div>
           )}
        </div>
    </div>
  );
};

export default FridayScreen;