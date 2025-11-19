import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Search, Filter, 
  MoreHorizontal, Home, ArrowUp, ArrowDown, Settings, 
  Eye, EyeOff, Bell, UserCircle, Calendar, GripVertical, Check
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, updateDoc, collection, getDocs, query, where, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import clsx from "clsx";
import { useNavigation } from '../hooks/useNavigation';

// --- TIPOS ---
interface WorksheetData {
  certificado: string;
  cliente: string;
  id: string;
  folio?: string;
  equipo: string;
  marca: string;
  modelo: string;
  serie: string;
  lugarCalibracion: 'sitio' | 'laboratorio';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo: string;
  dueDate: string;
  createdAt: string;
  lastUpdated: string;
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
  sticky?: boolean; // Nueva propiedad para columnas fijas
}

interface Group {
  id: string;
  name: string;
  color: string;
  rows: WorksheetData[];
  collapsed: boolean;
}

interface MetrologoUser {
  id: string;
  name: string;
  email: string;
}

interface DragState {
  draggedItem: {
    type: 'row' | 'column';
    groupIndex?: number;
    rowIndex?: number;
    columnIndex?: number;
    data?: any;
  } | null;
  dragOverTarget: {
    type: 'row' | 'column';
    groupIndex?: number;
    rowIndex?: number;
    columnIndex?: number;
  } | null;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc' | null;
}

// --- CONFIGURACIÓN ---
// Colores Monday.com
const MONDAY_COLORS = {
  border: "#d0d4e4",
  headerBg: "#f5f6f8",
  rowHover: "#f0f3ff",
  groupHeaderHover: "#e6e9ef",
  primary: "#0073ea",
  textMain: "#323338",
  textLight: "#676879"
};

const STATUS_CONFIG: any = {
  pending: { label: "Pendiente", bg: "#c4c4c4", text: "#fff" },
  in_progress: { label: "En Proceso", bg: "#fdab3d", text: "#fff" }, // Naranja Monday
  completed: { label: "Listo", bg: "#00c875", text: "#fff" }, // Verde Monday
  cancelled: { label: "Cancelado", bg: "#e2445c", text: "#fff" } // Rojo Monday
};

const PRIORITY_CONFIG: any = {
  low: { label: "Baja", bg: "#579bfc", text: "#fff" },
  medium: { label: "Media", bg: "#5559df", text: "#fff" },
  high: { label: "Alta", bg: "#fdab3d", text: "#fff" },
  urgent: { label: "Urgente", bg: "#e2445c", text: "#fff" }
};

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
  { key: 'id', label: 'ID Sistema', width: 100, type: "text", hidden: true },
];

const FRIDAY_GROUPS: Group[] = [
  { id: "sitio", name: "Servicios en Sitio", color: "#579bfc", collapsed: false, rows: [] }, // Azul Monday
  { id: "laboratorio", name: "Equipos en Laboratorio", color: "#a25ddc", collapsed: false, rows: [] } // Morado Monday
];

// Hook para detectar dispositivos móviles
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);
  return isMobile;
};

// Props interface
interface FridayScreenProps {
  navigate?: (route: string) => void;
}

const FridayScreen: React.FC<FridayScreenProps> = ({ navigate }) => {
  const isMobile = useIsMobile();
  
  // Estados
  const [groups, setGroups] = useState(FRIDAY_GROUPS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selectedRows, setSelectedRows] = useState<{gidx:number, ridx:number}[]>([]);
  
  // Estado de edición refinado
  const [editCell, setEditCell] = useState<{gidx:number, ridx:number, key:string}|null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<any>({});
  const [metrologos, setMetrologos] = useState<MetrologoUser[]>([]);
  const [showAddCol, setShowAddCol] = useState(false);
  const [addCol, setAddCol] = useState<{label:string,type:Column["type"],options?:string[]}>({label:"",type:"text"});
  const [sidebarAbierto, setSidebarAbierto] = useState(!isMobile);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: null });
  
  const [dragState, setDragState] = useState<DragState>({ draggedItem: null, dragOverTarget: null });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef(groups);
  
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  // Navegación
  const { navigateTo } = useNavigation();
  const manejarNavegacion = useCallback((destino: string) => {
     if (['servicios', 'servicios-sitio', 'friday-servicios'].includes(destino)) {
        navigateTo('friday-servicios');
    } else if (['dashboard', 'menu', 'inicio', 'mainmenu'].includes(destino)) {
        navigateTo('menu');
    } else {
        navigateTo(destino);
    }
  }, [navigateTo]);

  // Carga de Metrólogos
  useEffect(()=>{
    const getUsers = async ()=>{
      try {
        const ref = collection(db,"usuarios");
        const q = query(ref, where("puesto", "==", "Metrólogo"));
        const snap = await getDocs(q);
        setMetrologos(snap.docs.map(doc=>({
          id: doc.id,
          name: doc.data().nombre || doc.data().name || "Metrólogo",
          email: doc.data().correo || doc.data().email || ""
        })));
      } catch (error) {
        console.error("Error loading metrologos:", error);
      }
    };
    getUsers();
  },[]);
  
  // Actualización Local (Optimistic UI)
  const updateWorksheetInBoard = useCallback((newWorksheet: any) => {
    const currentGroups = groupsRef.current;
    const targetGroupIndex = currentGroups.findIndex(g => 
      g.id === newWorksheet.lugarCalibracion || 
      (newWorksheet.lugarCalibracion === 'sitio' && g.id === 'sitio') ||
      (newWorksheet.lugarCalibracion === 'laboratorio' && g.id === 'laboratorio')
    );
    
    if (targetGroupIndex !== -1) {
      setGroups(prevGroups => {
        const updatedGroups = [...prevGroups];
        const targetGroup = updatedGroups[targetGroupIndex];
        if (!targetGroup) return prevGroups;

        const existingRowIndex = targetGroup.rows.findIndex(row => row.id === newWorksheet.id);
        const rowData: WorksheetData = {
              ...newWorksheet,
              folio: newWorksheet.folio || "",
              certificado: newWorksheet.certificado || "",
              id: newWorksheet.id || "",
              lugarCalibracion: newWorksheet.lugarCalibracion || targetGroup.id,
              equipo: newWorksheet.equipo || "",
              marca: newWorksheet.marca || "",
              modelo: newWorksheet.modelo || "",
              serie: newWorksheet.serie || "",
              cliente: newWorksheet.cliente || "",
              status: newWorksheet.status || 'pending',
              priority: newWorksheet.priority || 'medium',
              assignedTo: newWorksheet.assignedTo || "",
              dueDate: newWorksheet.dueDate || "",
              createdAt: newWorksheet.createdAt || new Date().toISOString(),
              lastUpdated: newWorksheet.lastUpdated || new Date().toISOString(),
          };
          
        if (existingRowIndex === -1) targetGroup.rows.push(rowData);
        else targetGroup.rows[existingRowIndex] = rowData;
        
        return updatedGroups;
      });
    }
  }, []);

  // Carga de Datos (Realtime)
  useEffect(() => {
    let unsubscribeBoard: (() => void) | null = null;
    let unsubscribeWorksheets: (() => void) | null = null;

    const loadData = async () => {
      try {
        const docRef = doc(db, "tableros", "principal");
        unsubscribeBoard = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const board = docSnap.data();
            if (board.groups) {
              setGroups(prev => {
                // Mezclar con datos locales para evitar parpadeos si es posible
                 return board.groups.map((g:any)=>({
                  ...g, 
                  rows: g.rows?.map((row: any) => ({ ...row, id: row.id || "" })) || []
                }))
              });
            }
            if (board.columns) {
              const dbColumns = board.columns as Column[];
              // Fusionar columnas guardadas con las default para asegurar compatibilidad
              const merged = DEFAULT_COLUMNS.map(def => {
                const found = dbColumns.find(d => d.key === def.key);
                return found ? { ...def, ...found } : def;
              });
              // Agregar nuevas que no estén en default
              dbColumns.forEach(c => {
                if (!DEFAULT_COLUMNS.find(d => d.key === c.key)) merged.push(c);
              });
              setColumns(merged);
            }
          }
        });

        const worksheetRef = collection(db, "hojasDeTrabajo");
        unsubscribeWorksheets = onSnapshot(worksheetRef, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
              updateWorksheetInBoard({ id: change.doc.id, ...change.doc.data() });
            }
          });
        });
      } catch (error) { console.error("Error", error); }
    };
    loadData();
    return () => { unsubscribeBoard?.(); unsubscribeWorksheets?.(); };
  }, [updateWorksheetInBoard]);

  // Ordenamiento
  const handleSort = useCallback((columnKey: string) => {
    setSortConfig(prev => {
      if (prev.key === columnKey) {
        return prev.direction === 'asc' ? { key: columnKey, direction: 'desc' } : { key: '', direction: null };
      }
      return { key: columnKey, direction: 'asc' };
    });
  }, []);

  const sortedGroups = React.useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return groups;
    const sortColumn = columns.find(c => c.key === sortConfig.key);

    return groups.map(group => ({
      ...group,
      rows: [...group.rows].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        
        let comparison = 0;
        if (sortColumn?.type === 'number') comparison = parseFloat(aVal) - parseFloat(bVal);
        else if (sortColumn?.type === 'date') comparison = new Date(aVal).getTime() - new Date(bVal).getTime();
        else {
           const aStr = String(aVal).toLowerCase();
           const bStr = String(bVal).toLowerCase();
           if (aStr < bStr) comparison = -1;
           if (aStr > bStr) comparison = 1;
        }
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      })
    }));
  }, [groups, sortConfig, columns]);

  // Guardado Automático
  useEffect(() => {
    const timer = setTimeout(() => {
      const docRef = doc(db, "tableros", "principal");
      updateDoc(docRef, { 
        groups: groups.map(g => ({ ...g, rows: g.rows.map(r => ({...r, lastUpdated: new Date().toISOString()}))})), 
        columns 
      }).catch(e => console.log("AutoSave skip (first render usually)", e));
    }, 3000);
    return () => clearTimeout(timer);
  }, [groups, columns]);

  // Drag & Drop Lógica (Simplificada y corregida)
  const handleDragStart = (e: React.DragEvent, type: 'row'|'column', data: any) => {
    setDragState(prev => ({ ...prev, draggedItem: { type, ...data } }));
  };

  const handleDrop = async (e: React.DragEvent, type: 'row'|'column', target: any) => {
    e.preventDefault();
    const { draggedItem } = dragState;
    if (!draggedItem || draggedItem.type !== type) return;

    if (type === 'row') {
      // Mover fila
      const newGroups = [...groups];
      const sourceGroup = newGroups[draggedItem.groupIndex!];
      const targetGroup = newGroups[target.groupIndex];
      
      // Validación simple
      if(!sourceGroup || !targetGroup) return;

      const [movedRow] = sourceGroup.rows.splice(draggedItem.rowIndex!, 1);
      movedRow.lugarCalibracion = targetGroup.id as any;
      targetGroup.rows.splice(target.rowIndex, 0, movedRow);
      setGroups(newGroups);

      // Persistir cambio de grupo
      if(movedRow.id) {
         await updateDoc(doc(db, "hojasDeTrabajo", movedRow.id), { lugarCalibracion: targetGroup.id });
      }

    } else if (type === 'column') {
      // Mover columna
      const newCols = [...columns];
      const [movedCol] = newCols.splice(draggedItem.columnIndex!, 1);
      newCols.splice(target.columnIndex, 0, movedCol);
      setColumns(newCols);
    }
    setDragState({ draggedItem: null, dragOverTarget: null });
  };

  // Edición de celdas
  const handleCellClick = (gidx: number, ridx: number, key: string, value: any) => {
     setEditCell({ gidx, ridx, key });
     setEditValue(value);
     // Usamos setTimeout para asegurar que el input se renderizó antes de enfocar
     setTimeout(() => {
        if(inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
     }, 50);
  };

  const handleSaveCell = useCallback((newValue?: string) => {
    if (!editCell) return;
    const finalValue = newValue !== undefined ? newValue : editValue;
    const { key, gidx, ridx } = editCell;

    setGroups(prev => {
      const newGroups = [...prev];
      // Protección contra índices inválidos debido a filtrado
      if(!newGroups[gidx] || !newGroups[gidx].rows[ridx]) return prev;

      const row = newGroups[gidx].rows[ridx];
      (row as any)[key] = finalValue;

      if (row.id) {
          updateDoc(doc(db, "hojasDeTrabajo", row.id), { [key]: finalValue, lastUpdated: new Date().toISOString() });
      }
      return newGroups;
    });
    setEditCell(null);
    setEditValue("");
  }, [editCell, editValue]);

  // Operaciones CRUD Básicas
  const addRow = async (groupIndex: number) => {
    const targetGroup = groups[groupIndex];
    const newId = `WS-${Date.now()}`;
    const newRow: WorksheetData = {
      id: newId, certificado: "", cliente: "Nuevo Cliente", folio: `F-${Math.floor(Math.random()*1000)}`,
      equipo: "Equipo Nuevo", marca: "", modelo: "", serie: "", 
      lugarCalibracion: targetGroup.id as any, status: 'pending', priority: 'medium',
      assignedTo: "", dueDate: "", createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, "hojasDeTrabajo", newId), newRow);
      // El listener actualiza el estado, pero podemos hacerlo optimista:
      const newGroups = [...groups];
      newGroups[groupIndex].rows.push(newRow);
      setGroups(newGroups);
    } catch (e) { console.error(e); }
  };

  const deleteRows = async () => {
    if(!confirm("¿Eliminar las filas seleccionadas?")) return;
    
    // Clonar estado actual
    const newGroups = [...groups];
    
    for (const sel of selectedRows) {
        const row = groups[sel.gidx]?.rows[sel.ridx];
        if(row?.id) {
            await deleteDoc(doc(db, "hojasDeTrabajo", row.id));
            // Eliminación visual
            const group = newGroups[sel.gidx];
            group.rows = group.rows.filter(r => r.id !== row.id);
        }
    }
    setGroups(newGroups);
    setSelectedRows([]);
  };

  // Resizer de columnas (Simplificado)
  const [resizingCol, setResizingCol] = useState<number|null>(null);
  const resizeRef = useRef(0);
  const handleResizeStart = (e: React.MouseEvent, idx: number) => {
     e.preventDefault();
     e.stopPropagation();
     setResizingCol(idx);
     resizeRef.current = e.clientX;
  };
  const handleResizeMove = (e: MouseEvent) => {
      if(resizingCol === null) return;
      const diff = e.clientX - resizeRef.current;
      setColumns(prev => {
          const next = [...prev];
          const col = next[resizingCol];
          // Encontrar la columna visualmente correspondiente si hay ocultas es complejo,
          // simplificamos asumiendo que resizingCol es el índice en 'columns' visible
          if(col) col.width = Math.max(50, col.width + diff);
          return next;
      });
      resizeRef.current = e.clientX;
  };
  useEffect(() => {
      if(resizingCol !== null) {
          window.addEventListener('mousemove', handleResizeMove);
          window.addEventListener('mouseup', () => setResizingCol(null));
      }
      return () => { window.removeEventListener('mousemove', handleResizeMove); window.removeEventListener('mouseup', () => setResizingCol(null)); }
  }, [resizingCol]);


  // Renderizado de la Tabla
  const renderCell = (row: WorksheetData, col: Column, gidx: number, ridx: number) => {
    const isEditing = editCell?.gidx === gidx && editCell?.ridx === ridx && editCell?.key === col.key;
    const value = row[col.key];

    // Estilos base de celda Monday
    const cellBaseClass = "h-full w-full px-2 flex items-center text-sm border-r border-[#d0d4e4] relative transition-colors duration-200";

    // STATUS (Estilo Monday: Celda completa de color)
    if (col.key === 'status' || col.key === 'priority') {
       const config = col.key === 'status' ? STATUS_CONFIG : PRIORITY_CONFIG;
       const item = config[value] || { label: value, bg: "#c4c4c4", text: "#fff" };
       
       if(isEditing) {
           return (
               <div className="absolute inset-0 z-20 bg-white shadow-xl rounded-md flex flex-col py-2">
                   {col.options?.map(opt => (
                       <div key={opt} 
                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                            onClick={(e) => { e.stopPropagation(); handleSaveCell(opt); }}>
                            <div className="w-4 h-4 rounded-full" style={{background: config[opt]?.bg || '#ccc'}}></div>
                            <span>{config[opt]?.label || opt}</span>
                       </div>
                   ))}
               </div>
           )
       }

       return (
         <div className="w-full h-full flex items-center justify-center cursor-pointer text-white font-medium relative group"
              style={{ backgroundColor: item.bg }}
              onClick={() => handleCellClick(gidx, ridx, col.key, value)}>
             <span className="truncate px-2">{item.label}</span>
             <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 p-1 rounded">
                 <ChevronDown className="w-3 h-3" />
             </div>
         </div>
       );
    }

    // FECHA
    if (col.type === 'date') {
        const dateObj = value ? new Date(value) : null;
        const displayDate = dateObj ? dateObj.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '-';
        
        if (isEditing) {
            return <input ref={inputRef} type="date" className="w-full h-full px-2 outline-none focus:ring-2 ring-blue-500 z-20" 
                          value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={()=>handleSaveCell()} onKeyDown={e=>e.key==='Enter'&&handleSaveCell()} />;
        }
        return (
            <div className={clsx(cellBaseClass, "justify-center group hover:bg-[#f0f3ff] cursor-pointer")} onClick={()=>handleCellClick(gidx, ridx, col.key, value)}>
                {value ? <span className="text-gray-700">{displayDate}</span> : <Calendar className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />}
            </div>
        );
    }

    // PERSONA
    if (col.type === 'person') {
        if(isEditing) {
            return (
                <div className="absolute inset-0 z-20 bg-white shadow-xl rounded-md flex flex-col py-2 min-w-[200px]">
                    {metrologos.map(m => (
                        <div key={m.id} className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                             onClick={(e)=>{ e.stopPropagation(); handleSaveCell(m.name); }}>
                             <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">{m.name.charAt(0)}</div>
                             <span>{m.name}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return (
            <div className={clsx(cellBaseClass, "justify-center hover:bg-[#f0f3ff] cursor-pointer")} onClick={()=>handleCellClick(gidx, ridx, col.key, value)}>
                {value ? (
                    <div className="w-7 h-7 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center border-2 border-white shadow-sm" title={value}>
                        {value.charAt(0).toUpperCase()}
                    </div>
                ) : <UserCircle className="w-6 h-6 text-gray-300" />}
            </div>
        );
    }

    // TEXTO / DEFAULT
    if (isEditing) {
        return (
            <input 
                ref={inputRef}
                className="w-full h-full px-2 outline-none bg-white border-2 border-[#0073ea] shadow-sm z-10 absolute inset-0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleSaveCell()}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCell(); if (e.key === 'Escape') setEditCell(null); }}
            />
        );
    }

    return (
        <div className={clsx(cellBaseClass, "hover:border-[#aeb1bd] hover:bg-white cursor-text group")}
             onClick={() => handleCellClick(gidx, ridx, col.key, value)}>
            <span className="truncate w-full block">{value}</span>
            {/* Botón de editar sutil estilo Monday */}
            <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 border border-gray-300 bg-white p-0.5 rounded shadow-sm">
                 <span className="text-[10px] text-gray-500 font-mono px-1">Edit</span>
            </div>
        </div>
    );
  };

  // Filtro de filas
  const filteredGroups = React.useMemo(() => {
    return sortedGroups.map(group => ({
      ...group,
      rows: group.rows.filter(row => {
        if (search && !Object.values(row).some(val => String(val).toLowerCase().includes(search.toLowerCase()))) return false;
        return true; // Simplificado para brevedad, agregar filtros específicos si se requiere
      })
    }));
  }, [sortedGroups, search]);


  if (!isMobile && sidebarAbierto) {
    return (
      <div className="flex h-screen bg-[#eceff8] font-sans text-[#323338]">
        <SidebarFriday onNavigate={manejarNavegacion} isOpen={sidebarAbierto} onToggle={() => setSidebarAbierto(!sidebarAbierto)} />
        
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 ml-64 bg-white rounded-tl-3xl shadow-[0_0_20px_rgba(0,0,0,0.05)] my-2 mr-2 border border-[#d0d4e4]">
          
          {/* Header Principal */}
          <div className="px-8 py-5 border-b border-[#d0d4e4] flex justify-between items-center bg-white rounded-tl-3xl">
             <div>
                <h1 className="text-2xl font-bold text-[#323338] flex items-center gap-2">
                    Equipos en Calibración
                    <ChevronDown className="w-5 h-5 text-gray-400 cursor-pointer hover:bg-gray-100 rounded" />
                </h1>
                <p className="text-sm text-gray-500 mt-1">Gestiona el flujo de trabajo del laboratorio</p>
             </div>
             <div className="flex items-center gap-3">
                 <div className="flex -space-x-2 mr-4">
                    {metrologos.slice(0,3).map(m=>(
                        <div key={m.id} className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-bold text-gray-600 cursor-pointer hover:z-10 hover:scale-110 transition-transform">
                            {m.name.charAt(0)}
                        </div>
                    ))}
                    <div className="w-8 h-8 rounded-full bg-blue-50 border-2 border-white flex items-center justify-center text-xs text-blue-600 font-medium cursor-pointer hover:bg-blue-100">
                        <Plus className="w-4 h-4" />
                    </div>
                 </div>
                 <div className="h-8 w-[1px] bg-gray-300 mx-2"></div>
                 <button className="p-2 hover:bg-gray-100 rounded-md text-gray-600"><Search className="w-5 h-5"/></button>
                 <button className="p-2 hover:bg-gray-100 rounded-md text-gray-600 relative">
                     <UserCircle className="w-5 h-5"/>
                     <span className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full border border-white"></span>
                 </button>
             </div>
          </div>

          {/* Controles del Tablero */}
          <div className="px-8 py-3 flex items-center justify-between bg-white sticky top-0 z-30">
              <div className="flex items-center gap-3">
                  <button onClick={()=>addRow(0)} className="bg-[#0073ea] hover:bg-[#0060b9] text-white px-4 py-1.5 rounded text-sm font-medium flex items-center transition-colors shadow-sm">
                      <Plus className="w-4 h-4 mr-1.5" /> Nuevo equipo
                  </button>
                  <div className="flex items-center border border-[#d0d4e4] rounded px-2 py-1.5 hover:border-blue-400 transition-colors w-64 group focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                      <Search className="w-4 h-4 text-gray-400 mr-2 group-hover:text-blue-500" />
                      <input 
                        placeholder="Buscar" 
                        className="text-sm outline-none w-full placeholder-gray-400"
                        value={search}
                        onChange={e=>setSearch(e.target.value)}
                      />
                  </div>
                  <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">
                      <Filter className="w-4 h-4" /> Filtrar
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">
                      <ArrowUp className="w-4 h-4" /> Ordenar
                  </button>
              </div>
              <div className="flex items-center gap-2">
                   {selectedRows.length > 0 && (
                       <button onClick={deleteRows} className="flex items-center gap-1 text-red-500 bg-red-50 px-3 py-1.5 rounded text-sm font-medium hover:bg-red-100 transition-colors animate-in fade-in">
                           <Trash2 className="w-4 h-4"/> Eliminar ({selectedRows.length})
                       </button>
                   )}
                   <button className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"><MoreHorizontal className="w-5 h-5"/></button>
              </div>
          </div>

          {/* TABLA PRINCIPAL */}
          <div className="flex-1 overflow-auto bg-white pl-8 pr-2 pb-10" ref={scrollContainerRef}>
             <div className="inline-block min-w-full pb-4">
                 
                 {/* Cabeceras de Columnas */}
                 <div className="sticky top-0 z-20 flex border-b border-[#d0d4e4] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                     {/* Columna Checkbox Sticky */}
                     <div className="w-10 border-r border-[#d0d4e4] bg-white sticky left-0 z-30 flex items-center justify-center">
                         <input type="checkbox" className="rounded border-gray-300 text-[#0073ea] focus:ring-[#0073ea]" />
                     </div>
                     
                     {/* Columnas Dinámicas */}
                     {columns.filter(c=>!c.hidden).map((col, i) => (
                         <div key={col.key} 
                              style={{ width: col.width, left: col.sticky ? (i===0?40:160) : undefined }} // 40px es el ancho del checkbox
                              className={clsx(
                                  "px-2 py-2 text-xs font-medium text-gray-500 text-center border-r border-[#d0d4e4] bg-white flex items-center justify-center relative group select-none",
                                  col.sticky && "sticky z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-l" // Sombra para indicar sticky
                              )}
                              draggable
                              onDragStart={e => handleDragStart(e, 'column', {columnIndex: i})}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => handleDrop(e, 'column', {columnIndex: i})}
                          >
                             <span onClick={()=>col.sortable && handleSort(col.key)} className="cursor-pointer hover:text-blue-600 flex items-center gap-1">
                                 {col.label}
                                 {sortConfig.key === col.key && (sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3"/> : <ArrowDown className="w-3 h-3"/>)}
                             </span>
                             
                             {/* Resizer */}
                             <div className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 z-40" 
                                  onMouseDown={(e)=>handleResizeStart(e, i)} />
                         </div>
                     ))}
                     
                     {/* Botón + Columna */}
                     <div className="w-10 flex items-center justify-center border-r border-gray-200 bg-white cursor-pointer hover:bg-gray-50" onClick={()=>setShowAddCol(true)}>
                         <Plus className="w-4 h-4 text-gray-400" />
                     </div>
                 </div>

                 {/* Grupos */}
                 {filteredGroups.map((group, gidx) => {
                    // Calcular totales para el footer del grupo
                    const totalPending = group.rows.filter(r=>r.status==='pending').length;
                    const totalDone = group.rows.filter(r=>r.status==='completed').length;
                    
                    return (
                     <div key={group.id} className="mt-8 mb-4">
                         {/* Header de Grupo Estilo Monday */}
                         <div className="flex items-center mb-2 group sticky left-0">
                             <div className="flex items-center cursor-pointer hover:bg-gray-50 px-2 py-1 rounded transition-colors"
                                  onClick={()=>{
                                      const newG = [...groups]; 
                                      // Encuentra el grupo real usando ID, no indice filtrado
                                      const realIdx = newG.findIndex(g=>g.id===group.id);
                                      if(realIdx!==-1) { newG[realIdx].collapsed = !newG[realIdx].collapsed; setGroups(newG); }
                                  }}>
                                 <ChevronDown className={clsx("w-5 h-5 transition-transform text-gray-400", group.collapsed && "-rotate-90")} />
                                 <h2 className="text-lg font-medium ml-1" style={{color: group.color}}>{group.name}</h2>
                                 <span className="ml-3 text-gray-400 text-sm font-light px-2 border border-gray-200 rounded-full">{group.rows.length} Items</span>
                             </div>
                         </div>

                         {!group.collapsed && (
                             <div className="bg-white rounded-md shadow-sm border-t border-[#d0d4e4]">
                                 {group.rows.map((row, ridx) => {
                                     // Importante: encontrar índice real en 'groups' original para drag & drop y updates
                                     const realGidx = groups.findIndex(g=>g.id===group.id);
                                     const isSelected = selectedRows.some(s => s.gidx === realGidx && s.ridx === ridx);
                                     
                                     return (
                                     <div key={row.id || ridx} 
                                          className={clsx("flex border-b border-[#d0d4e4] hover:bg-[#f5f7fa] group transition-colors h-9", isSelected && "bg-blue-50")}
                                          draggable
                                          onDragStart={e => handleDragStart(e, 'row', {groupIndex: realGidx, rowIndex: ridx})}
                                          onDragOver={e => e.preventDefault()}
                                          onDrop={e => handleDrop(e, 'row', {groupIndex: realGidx, rowIndex: ridx})}
                                     >
                                         {/* Indicador de Color de Grupo (Borde Izquierdo) */}
                                         <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: group.color }}></div>

                                         {/* Checkbox Sticky */}
                                         <div className="w-10 flex-shrink-0 border-r border-[#d0d4e4] bg-white sticky left-0 z-10 flex items-center justify-center group-hover:bg-[#f5f7fa]">
                                             <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if(e.target.checked) setSelectedRows(prev => [...prev, {gidx: realGidx, ridx}]);
                                                    else setSelectedRows(prev => prev.filter(s => !(s.gidx===realGidx && s.ridx===ridx)));
                                                }}
                                                className="opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity rounded border-gray-300 text-[#0073ea] focus:ring-[#0073ea] cursor-pointer" 
                                             />
                                             {/* Icono de drag handle */}
                                             <GripVertical className="w-3 h-3 text-gray-300 absolute left-0 opacity-0 group-hover:opacity-100 cursor-grab" />
                                         </div>

                                         {/* Celdas */}
                                         {columns.filter(c=>!c.hidden).map((col, i) => {
                                            // Clase especial para columna sticky (Folio)
                                            const isSticky = col.sticky;
                                            return (
                                             <div key={col.key} 
                                                  style={{ width: col.width }} 
                                                  className={clsx(
                                                      "flex-shrink-0", 
                                                      isSticky && "sticky z-10 bg-white group-hover:bg-[#f5f7fa] border-r shadow-[2px_0_5px_rgba(0,0,0,0.02)]"
                                                  )}
                                                  // Ajuste del left position si hay múltiples sticky (Folio es el primero después del check)
                                                  // Checkbox mide 40px + borde.
                                                  // Si folio es sticky, left=40px (ancho checkbox) + 6px (borde color)
                                                  // Simplificación: Solo Folio Sticky
                                                  {...(isSticky ? {style: {width: col.width, left: 46}} : {})}
                                             >
                                                 {renderCell(row, col, realGidx, ridx)}
                                             </div>
                                            )
                                         })}
                                         
                                          <div className="w-full border-b border-transparent bg-transparent"></div>
                                     </div>
                                 )})}
                                 
                                 {/* Botón "Add Item" al final del grupo */}
                                 <div className="flex h-9 border-b border-[#d0d4e4] pl-12 group">
                                     <div className="w-1.5 bg-transparent"></div>
                                     <div className="flex items-center pl-2">
                                         <input 
                                            type="text" 
                                            placeholder="+ Añadir elemento" 
                                            className="bg-transparent text-sm outline-none placeholder-gray-400 w-64 hover:bg-gray-50 px-2 rounded py-1"
                                            onKeyDown={(e) => {
                                                if(e.key === 'Enter') {
                                                    addRow(groups.findIndex(g=>g.id===group.id));
                                                    (e.target as HTMLInputElement).value = '';
                                                }
                                            }}
                                         />
                                     </div>
                                 </div>
                                 
                                 {/* Footer del grupo (Resumen) */}
                                 <div className="flex h-10 bg-white">
                                     <div className="w-12 flex-shrink-0"></div> {/* Espacio check + color */}
                                     {columns.filter(c=>!c.hidden).map((col, i) => (
                                         <div key={col.key} style={{width: col.width}} 
                                              className={clsx("flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-700 border-r border-transparent", 
                                              col.sticky && "sticky left-[46px] bg-white z-10")}>
                                             {col.key === 'status' && (
                                                 <div className="w-[80%] h-6 bg-gray-200 rounded relative overflow-hidden flex">
                                                     <div style={{width: `${(totalDone/group.rows.length)*100}%`}} className="bg-[#00c875] h-full"></div>
                                                     <div style={{width: `${(totalPending/group.rows.length)*100}%`}} className="bg-[#c4c4c4] h-full"></div>
                                                 </div>
                                             )}
                                             {col.type === 'number' && (
                                                 <span>Sum: {group.rows.reduce((acc, r) => acc + (parseFloat(r[col.key])||0), 0)}</span>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                 )})}
             </div>
          </div>
        </div>
      </div>
    );
  }

  // VISTA MÓVIL (Sin cambios mayores, solo consistencia)
  return (
    <div className="flex flex-col h-screen bg-white">
        {/* Header Móvil Simple */}
        <div className="px-4 py-3 border-b flex justify-between items-center bg-white shadow-sm z-10">
            <div className="flex items-center gap-2" onClick={()=>setSidebarAbierto(true)}>
                <div className="bg-blue-600 text-white p-1.5 rounded-md"><Home className="w-5 h-5"/></div>
                <span className="font-bold text-lg text-gray-800">Equipos</span>
            </div>
            <div className="flex gap-3">
                <Search className="w-6 h-6 text-gray-500"/>
                <Plus onClick={()=>addRow(0)} className="w-6 h-6 text-blue-600"/>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-2">
             {groups.map((group, gidx) => (
                 <div key={group.id} className="mb-4 bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                     <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-white"
                          style={{borderLeft: `4px solid ${group.color}`}}>
                         <h3 className="font-bold text-gray-800">{group.name}</h3>
                         <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{group.rows.length}</span>
                     </div>
                     
                     <div className="divide-y divide-gray-100">
                         {group.rows.map((row, ridx) => (
                             <div key={row.id} className="p-4 active:bg-blue-50 transition-colors" onClick={()=>{/* Abrir detalle modal */}}>
                                 <div className="flex justify-between items-start mb-2">
                                     <span className="font-semibold text-gray-900 text-sm">{row.folio || "Sin Folio"}</span>
                                     <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide", STATUS_CONFIG[row.status]?.bg ? `text-white` : 'text-gray-500')}
                                           style={{backgroundColor: STATUS_CONFIG[row.status]?.bg || '#eee'}}>
                                         {STATUS_CONFIG[row.status]?.label}
                                     </span>
                                 </div>
                                 <div className="text-sm text-gray-600 mb-1">{row.equipo} - {row.cliente}</div>
                                 <div className="flex justify-between items-center mt-3">
                                     <div className="flex items-center gap-2 text-xs text-gray-400">
                                         <Calendar className="w-3 h-3"/>
                                         {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'Sin fecha'}
                                     </div>
                                     {row.assignedTo && (
                                         <div className="w-6 h-6 bg-blue-500 rounded-full text-white text-[10px] flex items-center justify-center">
                                             {row.assignedTo.charAt(0)}
                                         </div>
                                     )}
                                 </div>
                             </div>
                         ))}
                         {group.rows.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">No hay equipos</div>}
                     </div>
                 </div>
             ))}
        </div>
        
        {sidebarAbierto && (
            <div className="fixed inset-0 z-50 bg-black/50" onClick={()=>setSidebarAbierto(false)}>
                <div className="w-3/4 h-full bg-white shadow-2xl" onClick={e=>e.stopPropagation()}>
                    <SidebarFriday onNavigate={manejarNavegacion} isOpen={true} onToggle={()=>setSidebarAbierto(false)} />
                </div>
            </div>
        )}
    </div>
  );
};

export default FridayScreen;