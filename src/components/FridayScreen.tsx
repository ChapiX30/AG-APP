import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Search, Filter, 
  MoreHorizontal, Home, ArrowUp, ArrowDown, Settings, 
  Eye, EyeOff, Bell, UserCircle, Calendar, GripVertical, Check, X
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, getDocs, query, where, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';

// --- CONSTANTES Y CONFIGURACIÓN ---
const MONDAY_COLORS = {
  border: "#d0d4e4",
  headerBg: "#f5f6f8",
  rowHover: "#f5f7fa",
  primary: "#0073ea",
  textMain: "#323338",
  textLight: "#676879"
};

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
  folio?: string;
  certificado: string;
  cliente: string;
  equipo: string;
  marca: string;
  modelo: string;
  serie: string;
  lugarCalibracion: 'sitio' | 'laboratorio';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string;
  dueDate: string;
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

// --- COLUMNAS POR DEFECTO ---
const DEFAULT_COLUMNS: Column[] = [
  { key: 'folio', label: 'Folio', width: 120, type: "text", sortable: true, sticky: true },
  { key: 'cliente', label: 'Cliente', width: 200, type: "text", sortable: true },
  { key: 'equipo', label: 'Equipo', width: 160, type: "text", sortable: true },
  { key: 'status', label: 'Estado', width: 140, type: "dropdown", options: ["pending","in_progress","completed","cancelled"], sortable: true },
  { key: 'priority', label: 'Prioridad', width: 130, type: "dropdown", options: ["low","medium","high","urgent"], sortable: true },
  { key: 'dueDate', label: 'Fecha Límite', width: 140, type: "date", sortable: true },
  { key: 'assignedTo', label: 'Responsable', width: 120, type: "person", sortable: true },
  { key: 'certificado', label: 'Certificado', width: 140, type: "text", sortable: true },
  { key: 'marca', label: 'Marca', width: 130, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 130, type: "text" },
  { key: 'serie', label: 'Serie', width: 120, type: "text" },
];

// --- COMPONENTE CELDA OPTIMIZADO (React.memo) ---
// Este componente maneja su propia lógica de renderizado para evitar INP issues
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

  // Efecto para enfocar al editar
  useEffect(() => {
    if (isEditing) {
      setTempValue(row[col.key]); // Sincronizar valor inicial
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isEditing, row, col.key]);

  const value = row[col.key];
  const cellBaseClass = "h-full w-full px-2 flex items-center text-sm border-r border-[#d0d4e4] relative transition-colors duration-200";

  // 1. RENDERIZADO: STATUS & PRIORITY (Chips de color completo)
  if (col.key === 'status' || col.key === 'priority') {
    const config = col.key === 'status' ? STATUS_CONFIG : PRIORITY_CONFIG;
    const item = config[value] || { label: value, bg: "#c4c4c4" };

    if (isEditing) {
      return (
        <div className="absolute inset-0 z-50 bg-white shadow-2xl rounded border border-blue-500 min-w-[140px]">
           {col.options?.map(opt => (
             <div key={opt} className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                  onClick={() => onSave(opt)}>
                <div className="w-3 h-3 rounded-full" style={{ background: config[opt]?.bg || '#ccc' }}></div>
                <span className="text-sm">{config[opt]?.label || opt}</span>
             </div>
           ))}
        </div>
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center cursor-pointer text-white font-medium relative group transition-all hover:opacity-90"
           style={{ backgroundColor: item.bg }}
           onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
          <span className="truncate px-1 text-xs md:text-sm">{item.label}</span>
          <div className="absolute right-1 opacity-0 group-hover:opacity-100 bg-black/20 p-0.5 rounded">
            <ChevronDown className="w-3 h-3" />
          </div>
      </div>
    );
  }

  // 2. RENDERIZADO: FECHA
  if (col.type === 'date') {
    if (isEditing) {
      return (
        <input ref={inputRef} type="date" className="w-full h-full px-1 outline-none z-50 absolute inset-0"
               value={tempValue || ''} 
               onChange={(e) => setTempValue(e.target.value)} 
               onBlur={() => onSave(tempValue)} 
               onKeyDown={(e) => e.key === 'Enter' && onSave(tempValue)} />
      );
    }
    const displayDate = value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '-';
    return (
      <div className={clsx(cellBaseClass, "justify-center hover:bg-gray-50 cursor-pointer")} 
           onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
          {value ? <span className="text-gray-700">{displayDate}</span> : <Calendar className="w-4 h-4 text-gray-300" />}
      </div>
    );
  }

  // 3. RENDERIZADO: PERSONA
  if (col.type === 'person') {
    if (isEditing) {
      return (
        <div className="absolute inset-0 z-50 bg-white shadow-2xl rounded border border-blue-500 min-w-[180px] max-h-48 overflow-y-auto">
          {metrologos.map((m: any) => (
            <div key={m.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                 onClick={() => onSave(m.name)}>
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">{m.name.charAt(0)}</div>
              <span className="text-sm text-gray-700">{m.name}</span>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className={clsx(cellBaseClass, "justify-center hover:bg-gray-50 cursor-pointer")} 
           onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
          {value ? (
            <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white shadow-sm" title={value}>
              {value.charAt(0).toUpperCase()}
            </div>
          ) : <UserCircle className="w-6 h-6 text-gray-300" />}
      </div>
    );
  }

  // 4. RENDERIZADO: TEXTO / DEFAULT
  if (isEditing) {
    return (
      <input ref={inputRef}
             className="w-full h-full px-2 outline-none bg-white border-2 border-[#0073ea] shadow-sm z-50 absolute inset-0 text-sm"
             value={tempValue || ''}
             onChange={(e) => setTempValue(e.target.value)}
             onBlur={() => onSave(tempValue)}
             onKeyDown={(e) => { if(e.key==='Enter') onSave(tempValue); if(e.key==='Escape') onCancel(); }}
      />
    );
  }

  return (
    <div className={clsx(cellBaseClass, "hover:border-[#aeb1bd] hover:bg-white cursor-text group")}
         onClick={() => onStartEdit(gidx, ridx, col.key, value)}>
        <span className="truncate w-full block text-gray-700">{value}</span>
        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 border border-gray-300 bg-white p-0.5 rounded shadow-sm">
             <span className="text-[10px] text-gray-500 px-1 font-mono">Edit</span>
        </div>
    </div>
  );
}, (prev, next) => {
  // Función de comparación custom para React.memo
  // Solo re-renderizar si los datos de la fila, la columna o el estado de edición cambian
  return (
    prev.row[prev.col.key] === next.row[next.col.key] &&
    prev.isEditing === next.isEditing &&
    prev.col.width === next.col.width &&
    prev.col.sticky === next.col.sticky
  );
});

// --- COMPONENTE FILA OPTIMIZADO ---
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
  handleDragStart: (e: React.DragEvent, type: 'row', data: any) => void;
  handleDrop: (e: React.DragEvent, type: 'row', data: any) => void;
}

const BoardRow = React.memo(({ 
  row, columns, gidx, ridx, color, isSelected, editCell, 
  onToggleSelect, onStartEdit, onSaveCell, onCancelEdit, metrologos, handleDragStart, handleDrop 
}: BoardRowProps) => {
  
  return (
    <div className={clsx("flex border-b border-[#d0d4e4] hover:bg-[#f5f7fa] group transition-colors h-9", isSelected && "bg-blue-50")}
         draggable
         onDragStart={e => handleDragStart(e, 'row', {groupIndex: gidx, rowIndex: ridx})}
         onDragOver={e => e.preventDefault()}
         onDrop={e => handleDrop(e, 'row', {groupIndex: gidx, rowIndex: ridx})}
    >
       {/* Barra de Color */}
       <div className="w-1.5 flex-shrink-0 transition-colors" style={{ backgroundColor: color }}></div>

       {/* Checkbox Sticky */}
       <div className="w-10 flex-shrink-0 border-r border-[#d0d4e4] bg-white sticky left-0 z-10 flex items-center justify-center group-hover:bg-[#f5f7fa]">
           <input 
              type="checkbox" 
              checked={isSelected}
              onChange={() => onToggleSelect(gidx, ridx)}
              className="opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity rounded border-gray-300 text-[#0073ea] focus:ring-[#0073ea] cursor-pointer" 
           />
           <GripVertical className="w-3 h-3 text-gray-300 absolute left-0 opacity-0 group-hover:opacity-100 cursor-grab" />
       </div>

       {/* Columnas */}
       {columns.filter(c => !c.hidden).map((col, i) => {
          const isEditing = editCell?.gidx === gidx && editCell?.ridx === ridx && editCell?.key === col.key;
          const isSticky = col.sticky;
          
          // Cálculo de estilo para sticky
          const style: React.CSSProperties = { width: col.width };
          if (isSticky) {
             style.left = 46; // 40px (check) + 6px (color bar)
             style.position = 'sticky';
             style.zIndex = 10;
          }

          return (
             <div key={col.key} 
                  style={style} 
                  className={clsx(
                      "flex-shrink-0 bg-white", // Fondo blanco necesario para sticky
                      isSticky && "group-hover:bg-[#f5f7fa] border-r shadow-[2px_0_5px_rgba(0,0,0,0.02)]"
                  )}
             >
                 <Cell 
                    row={row} 
                    col={col} 
                    gidx={gidx} 
                    ridx={ridx}
                    isEditing={isEditing} 
                    onStartEdit={onStartEdit} 
                    onSave={onSaveCell}
                    onCancel={onCancelEdit}
                    metrologos={metrologos} 
                 />
             </div>
          );
       })}
       <div className="w-full border-b border-transparent bg-transparent"></div>
    </div>
  );
});


// --- COMPONENTE PRINCIPAL ---
const FridayScreen: React.FC<{ navigate?: (route: string) => void }> = ({ navigate }) => {
  // Hook custom para movil
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { const c = () => setIsMobile(window.innerWidth < 768); c(); window.addEventListener('resize', c); return () => window.removeEventListener('resize', c); }, []);

  // --- ESTADOS ---
  const FRIDAY_GROUPS: Group[] = [
    { id: "sitio", name: "Servicios en Sitio", color: "#0073ea", collapsed: false, rows: [] },
    { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false, rows: [] }
  ];
  
  const [groups, setGroups] = useState<Group[]>(FRIDAY_GROUPS);
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [editCell, setEditCell] = useState<{gidx:number, ridx:number, key:string}|null>(null);
  const [selectedRows, setSelectedRows] = useState<{gidx:number, ridx:number}[]>([]);
  const [search, setSearch] = useState("");
  const [metrologos, setMetrologos] = useState<any[]>([]);
  const [sidebarAbierto, setSidebarAbierto] = useState(!isMobile);
  
  const groupsRef = useRef(groups); // Ref para acceso en callbacks async
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  // --- FIREBASE LOAD ---
  useEffect(() => {
     // Cargar metrologos
     getDocs(query(collection(db,"usuarios"), where("puesto", "==", "Metrólogo"))).then(snap => {
        setMetrologos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
     });

     // Cargar estructura tablero
     const unsubBoard = onSnapshot(doc(db, "tableros", "principal"), (snap) => {
        if(snap.exists()) {
            const d = snap.data();
            if(d.columns) {
                // Merge inteligente de columnas
                const mergedCols = DEFAULT_COLUMNS.map(def => {
                    const saved = d.columns.find((c:Column) => c.key === def.key);
                    return saved ? { ...def, ...saved } : def;
                });
                setColumns(mergedCols);
            }
        }
     });

     // Cargar datos (Worksheets)
     const unsubWorksheets = onSnapshot(collection(db, "hojasDeTrabajo"), (snap) => {
        snap.docChanges().forEach(change => {
            const data = { id: change.doc.id, ...change.doc.data() } as WorksheetData;
            if (change.type === 'added' || change.type === 'modified') {
                setGroups(prev => {
                    const newGroups = [...prev];
                    // Lógica para asignar al grupo correcto
                    const targetId = data.lugarCalibracion === 'sitio' ? 'sitio' : 'laboratorio';
                    const gIndex = newGroups.findIndex(g => g.id === targetId);
                    if (gIndex === -1) return prev;

                    const group = newGroups[gIndex];
                    const rIndex = group.rows.findIndex(r => r.id === data.id);
                    
                    if (rIndex >= 0) group.rows[rIndex] = data;
                    else group.rows.push(data);
                    
                    return newGroups;
                });
            }
            // Handle delete logic if needed
        });
     });

     return () => { unsubBoard(); unsubWorksheets(); };
  }, []);

  // --- HANDLERS MEMOIZADOS (Crucial para performance) ---
  
  const handleStartEdit = useCallback((gidx: number, ridx: number, key: string, val: any) => {
      // Solo activar edición, el valor se pasa via prop inicial
      setEditCell({ gidx, ridx, key });
  }, []);

  const handleSaveCell = useCallback((val: any) => {
      if (!editCell) return;
      const { gidx, ridx, key } = editCell;
      
      setGroups(prev => {
          const newGroups = [...prev];
          const row = newGroups[gidx]?.rows[ridx];
          if (row) {
              row[key] = val;
              // Actualizar en Firebase
              updateDoc(doc(db, "hojasDeTrabajo", row.id), { [key]: val, lastUpdated: new Date().toISOString() })
                .catch(e => console.error("Error updating", e));
          }
          return newGroups;
      });
      setEditCell(null);
  }, [editCell]);

  const handleAddRow = useCallback(async (gidx: number) => {
      const newId = `WS-${Date.now()}`;
      const newRow: WorksheetData = {
          id: newId, certificado: "", cliente: "Nuevo Cliente", folio: `N-${Math.floor(Math.random()*1000)}`,
          equipo: "Equipo", marca: "", modelo: "", serie: "", 
          lugarCalibracion: groups[gidx].id as any, status: 'pending', priority: 'medium',
          assignedTo: "", dueDate: new Date().toISOString()
      };
      
      // Optimistic update
      setGroups(prev => {
          const n = [...prev];
          n[gidx].rows.push(newRow);
          return n;
      });
      
      await setDoc(doc(db, "hojasDeTrabajo", newId), newRow);
  }, [groups]);

  // --- NAVEGACIÓN ---
  const { navigateTo } = useNavigation();
  const manejarNavegacion = useCallback((d: string) => {
      if(['servicios','friday-servicios'].includes(d)) navigateTo('friday-servicios');
      else if(['menu','inicio'].includes(d)) navigateTo('menu');
      else navigateTo(d);
  }, [navigateTo]);

  // --- DRAG & DROP ---
  const handleDropRow = useCallback((e: React.DragEvent, type: 'row', target: {groupIndex: number, rowIndex: number}) => {
      // Lógica simplificada para mover filas (implementar validaciones completas si se requiere)
      console.log("Dropped on", target);
  }, []);


  if (!isMobile && sidebarAbierto) {
    return (
      <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338]">
        <SidebarFriday onNavigate={manejarNavegacion} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} />
        
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 ml-64 bg-white rounded-tl-3xl shadow-[0_0_20px_rgba(0,0,0,0.05)] my-2 mr-2 border border-[#d0d4e4]">
           
           {/* HEADER SUPERIOR */}
           <div className="px-8 py-5 border-b border-[#d0d4e4] flex justify-between items-center bg-white rounded-tl-3xl">
               <div>
                   <h1 className="text-2xl font-bold text-[#323338]">Equipos en Calibración</h1>
                   <p className="text-sm text-gray-500">Gestión operativa del laboratorio</p>
               </div>
               <div className="flex items-center gap-3">
                   <div className="flex -space-x-2 px-4">
                        {metrologos.slice(0,3).map(m => (
                            <div key={m.id} className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs">{m.name.charAt(0)}</div>
                        ))}
                   </div>
                   <button className="p-2 hover:bg-gray-100 rounded-full"><Search className="w-5 h-5 text-gray-500"/></button>
                   <button className="p-2 hover:bg-gray-100 rounded-full"><Bell className="w-5 h-5 text-gray-500"/></button>
               </div>
           </div>

           {/* CONTROLES Y FILTROS */}
           <div className="px-8 py-3 flex items-center justify-between sticky top-0 z-40 bg-white shadow-sm">
                <div className="flex gap-2">
                    <button onClick={() => handleAddRow(0)} className="bg-[#0073ea] hover:bg-[#0060b9] text-white px-4 py-1.5 rounded text-sm font-medium flex items-center transition-colors">
                        <Plus className="w-4 h-4 mr-2"/> Nuevo Equipo
                    </button>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2 text-gray-400"/>
                        <input 
                            value={search} 
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar..." 
                            className="pl-9 pr-3 py-1.5 border border-gray-300 rounded hover:border-blue-400 focus:border-blue-500 outline-none text-sm w-64 transition-colors"
                        />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"><Filter className="w-4 h-4 mr-1"/> Filtros</button>
                    <button className="flex items-center px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"><Settings className="w-4 h-4 mr-1"/> Ajustes</button>
                </div>
           </div>

           {/* TABLA PRINCIPAL */}
           <div className="flex-1 overflow-auto pl-8 pr-2 pb-10 bg-white">
               <div className="inline-block min-w-full pb-4">
                   
                   {/* HEADERS DE COLUMNA */}
                   <div className="flex border-b border-[#d0d4e4] sticky top-0 z-30 bg-white shadow-sm">
                       <div className="w-10 flex-shrink-0 border-r border-[#d0d4e4] bg-white sticky left-0 z-30 flex items-center justify-center">
                           <input type="checkbox" className="rounded border-gray-300" />
                       </div>
                       {/* Separador de color sticky placeholder */}
                       <div className="w-1.5 sticky left-10 bg-white z-30 border-r border-[#d0d4e4]"></div>

                       {columns.filter(c => !c.hidden).map((col, i) => (
                           <div key={col.key} 
                                style={{ 
                                    width: col.width,
                                    left: col.sticky ? 46 : undefined, // 40 (check) + 6 (color bar)
                                    position: col.sticky ? 'sticky' : undefined,
                                    zIndex: col.sticky ? 30 : undefined
                                }}
                                className={clsx(
                                    "px-2 py-2 text-xs font-bold text-gray-500 text-center border-r border-[#d0d4e4] bg-white select-none flex items-center justify-center hover:bg-gray-50",
                                    col.sticky && "shadow-[2px_0_5px_rgba(0,0,0,0.05)]"
                                )}
                            >
                               {col.label}
                           </div>
                       ))}
                       <div className="w-10 flex items-center justify-center border-r border-gray-200"><Plus className="w-4 h-4 text-gray-400"/></div>
                   </div>

                   {/* GRUPOS DE FILAS */}
                   {groups.map((group, gidx) => (
                       <div key={group.id} className="mt-6">
                           {/* Header de Grupo */}
                           <div className="flex items-center mb-1 sticky left-0 pl-2">
                               <ChevronDown className="w-5 h-5 text-[#0073ea] cursor-pointer" />
                               <h2 className="text-lg font-medium ml-1" style={{color: group.color}}>{group.name}</h2>
                               <span className="ml-3 text-xs text-gray-400 border px-2 rounded-full">{group.rows.length} items</span>
                           </div>

                           {/* Filas del Grupo */}
                           <div className="border-t border-[#d0d4e4]">
                               {group.rows
                                 .filter(r => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))
                                 .map((row, ridx) => (
                                   <BoardRow 
                                      key={row.id || ridx}
                                      row={row}
                                      columns={columns}
                                      gidx={gidx}
                                      ridx={ridx}
                                      color={group.color}
                                      isSelected={selectedRows.some(s => s.gidx === gidx && s.ridx === ridx)}
                                      editCell={editCell}
                                      onToggleSelect={(gx, rx) => {
                                          const exists = selectedRows.some(s => s.gidx === gx && s.ridx === rx);
                                          if(exists) setSelectedRows(prev => prev.filter(s => !(s.gidx === gx && s.ridx === rx)));
                                          else setSelectedRows(prev => [...prev, {gidx: gx, ridx: rx}]);
                                      }}
                                      onStartEdit={handleStartEdit}
                                      onSaveCell={handleSaveCell}
                                      onCancelEdit={() => setEditCell(null)}
                                      metrologos={metrologos}
                                      handleDragStart={() => {}}
                                      handleDrop={() => {}}
                                   />
                               ))}
                               
                               {/* Input para añadir rápido */}
                               <div className="flex h-9 border-b border-[#d0d4e4] group">
                                   <div className="w-1.5 bg-transparent sticky left-0"></div>
                                   <div className="w-10 border-r border-[#d0d4e4] sticky left-0 bg-white"></div>
                                   <div className="pl-2 flex items-center sticky left-[46px] bg-white">
                                       <input 
                                          type="text" 
                                          placeholder="+ Añadir" 
                                          className="outline-none text-sm w-48 h-full placeholder-gray-400 hover:bg-gray-50 px-2"
                                          onKeyDown={(e) => e.key === 'Enter' && handleAddRow(gidx)}
                                       />
                                   </div>
                               </div>
                           </div>
                       </div>
                   ))}

               </div>
           </div>
        </div>
      </div>
    );
  }

  // Vista móvil simplificada
  return (
      <div className="flex flex-col h-screen bg-white">
          <div className="p-4 border-b flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2" onClick={() => setSidebarAbierto(true)}>
                  <Home className="w-5 h-5 text-blue-600"/>
                  <span className="font-bold text-lg">Equipos</span>
              </div>
              <Plus className="w-6 h-6 text-blue-600" onClick={() => handleAddRow(0)}/>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50 p-2">
              {groups.map(g => (
                  <div key={g.id} className="mb-4 bg-white rounded shadow-sm overflow-hidden border border-gray-100">
                      <div className="px-4 py-2 font-bold text-sm uppercase tracking-wide" style={{color: g.color, borderLeft: `4px solid ${g.color}`}}>
                          {g.name}
                      </div>
                      {g.rows.map(r => (
                          <div key={r.id} className="p-3 border-b border-gray-100 flex justify-between items-center">
                              <div>
                                  <div className="font-medium text-gray-800">{r.folio || "Sin Folio"}</div>
                                  <div className="text-xs text-gray-500">{r.equipo}</div>
                              </div>
                              <span className="px-2 py-1 rounded text-xs font-bold text-white" style={{backgroundColor: STATUS_CONFIG[r.status]?.bg}}>
                                  {STATUS_CONFIG[r.status]?.label}
                              </span>
                          </div>
                      ))}
                  </div>
              ))}
          </div>
          {sidebarAbierto && (
            <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSidebarAbierto(false)}>
                <div className="w-3/4 h-full bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                    <SidebarFriday onNavigate={manejarNavegacion} isOpen={true} onToggle={() => setSidebarAbierto(false)} />
                </div>
            </div>
          )}
      </div>
  );
};

export default FridayScreen;