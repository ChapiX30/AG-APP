import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, X, CheckCircle, Users, Search, Filter, Columns, GripVertical, Move, Copy, Archive, MoreHorizontal, Download, FileText, Send, ChevronLeft, Home
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { useNavigation } from "../hooks/useNavigation";
import clsx from "clsx";

// --- TIPOS ---
interface WorksheetData {
  certificado: string;
  cliente: string;
  id: string;
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
    columnKey?: string;
    data?: any;
  } | null;
  dragOverTarget: {
    type: 'row' | 'column';
    groupIndex?: number;
    rowIndex?: number;
    columnIndex?: number;
  } | null;
  isDragging: boolean;
  dragPreview?: HTMLElement | null;
}

// COLUMNAS OPTIMIZADAS PARA MEJOR VISUALIZACIÓN
const DEFAULT_COLUMNS: Column[] = [
  { key: 'certificado', label: 'Certificado', width: 95, type: "text" },
  { key: 'cliente', label: 'Cliente', width: 130, type: "text" },
  { key: 'id', label: 'ID', width: 60, type: "text" },
  { key: 'equipo', label: 'Equipo', width: 110, type: "text" },
  { key: 'marca', label: 'Marca', width: 85, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 85, type: "text" },
  { key: 'serie', label: 'Serie', width: 75, type: "text" },
  { key: 'status', label: 'Estado', width: 85, type: "dropdown", options: ["pending","in_progress","completed","cancelled"] },
  { key: 'priority', label: 'Prioridad', width: 85, type: "dropdown", options: ["low","medium","high","urgent"] },
  { key: 'assignedTo', label: 'Responsable', width: 110, type: "person" },
  { key: 'dueDate', label: 'Fecha Límite', width: 95, type: "date" }
];

const FRIDAY_GROUPS: Group[] = [
  { id: "sitio", name: "Servicio en Sitio", color: "#2764d7", collapsed: false, rows: [] },
  { id: "laboratorio", name: "Equipos en Laboratorio", color: "#03b885", collapsed: false, rows: [] }
];

const STATUS_BADGE = {
  pending: { label: "Pendiente", color: "bg-gray-100 text-blue-900 border border-blue-200" },
  in_progress: { label: "En Proceso", color: "bg-yellow-200 text-yellow-900 border border-yellow-300" },
  completed: { label: "Completado", color: "bg-green-400 text-white border border-green-400" },
  cancelled: { label: "Cancelado", color: "bg-red-400 text-white border border-red-400" }
};

const PRIORITY_BADGE = {
  low: "bg-blue-100 text-blue-900",
  medium: "bg-yellow-100 text-yellow-900",
  high: "bg-red-200 text-red-800",
  urgent: "bg-red-600 text-white"
};

// Hook para detectar dispositivos móviles
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  return isMobile;
};

const FridayScreen: React.FC = () => {
  const navigateTo = useNavigation();
  const isMobile = useIsMobile();
  
  const [groups, setGroups] = useState(FRIDAY_GROUPS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selectedRows, setSelectedRows] = useState<{gidx:number, ridx:number}[]>([]);
  const [editCell, setEditCell] = useState<{gidx:number, ridx:number, key:string}|null>(null);
  const [editValue, setEditValue] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<any>({});
  const [metrologos, setMetrologos] = useState<MetrologoUser[]>([]);
  const [showAddCol, setShowAddCol] = useState(false);
  const [addCol, setAddCol] = useState<{label:string,type:Column["type"],options?:string[]}>({label:"",type:"text"});
  const [sidebarAbierto, setSidebarAbierto] = useState(!isMobile);
  
  // Estado para drag & drop
  const [dragState, setDragState] = useState<DragState>({
    draggedItem: null,
    dragOverTarget: null,
    isDragging: false,
    dragPreview: null
  });

  // Refs para scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // --- NAVEGACIÓN MEJORADA ---
  const manejarNavegacion = useCallback((destino: string) => {
    console.log('Navegando a:', destino);
    
    // Cerrar sidebar móvil al navegar
    if (isMobile) {
      setSidebarAbierto(false);
    }
    
    // Mapear destinos específicos
    switch(destino) {
      case 'dashboard':
      case 'menu':
      case 'inicio':
        navigateTo('dashboard');
        break;
      case 'equipos':
      case 'equipos-calibracion':
      case 'equiposCalibracion':
        // Ya estamos aquí, no hacer nada
        break;
      case 'servicios':
      case 'servicios-sitio':
      case 'serviciosSitio':
        navigateTo('servicios'); // Navegar a FridayServiciosScreen
        break;
      case 'clientes':
        navigateTo('clientes');
        break;
      case 'usuarios':
        navigateTo('usuarios');
        break;
      case 'reportes':
        navigateTo('reportes');
        break;
      case 'configuracion':
        navigateTo('configuracion');
        break;
      default:
        // Intentar navegar al destino tal como viene
        try {
          navigateTo(destino);
        } catch (error) {
          console.error('Error de navegación:', error);
          // Fallback al dashboard si hay error
          navigateTo('dashboard');
        }
        break;
    }
  }, [navigateTo, isMobile]);

  // Cambiar vista automáticamente según el dispositivo
  useEffect(() => {
    setSidebarAbierto(!isMobile);
  }, [isMobile]);

  // -- METRÓLOGOS FIREBASE --
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

  // --- LOAD DATA FIREBASE ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const docRef = doc(db, "tableros", "principal");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const board = snap.data();
          if (board.groups) setGroups(board.groups.map((g:any)=>({...g, rows:g.rows||[] })));
          if (board.columns) {
            setColumns(board.columns);
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    loadData();
  }, []);

  // --- SAVE TO FIRESTORE ---
  const persistGroups = useCallback(async (newGroups: Group[], newColumns:Column[]=columns) => {
    try {
      setGroups(newGroups);
      await updateDoc(doc(db, "tableros", "principal"), {
        groups: newGroups.map(g => ({...g, rows: g.rows})),
        columns: newColumns
      });
    } catch (error) {
      console.error("Error saving data:", error);
    }
  }, [columns]);

  // --- FUNCIONES DE SCROLL HORIZONTAL ---
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  // --- CREAR PREVIEW VISUAL DRAG ---
  const createDragPreview = useCallback((element: HTMLElement, data: any) => {
    const preview = element.cloneNode(true) as HTMLElement;
    preview.style.position = 'fixed';
    preview.style.pointerEvents = 'none';
    preview.style.zIndex = '9999';
    preview.style.opacity = '0.85';
    preview.style.transform = 'rotate(2deg) scale(0.95)';
    preview.style.boxShadow = '0 8px 20px rgba(0,0,0,0.25)';
    preview.style.borderRadius = '6px';
    preview.style.background = 'white';
    preview.style.maxWidth = '200px';
    document.body.appendChild(preview);
    return preview;
  }, []);

  // --- DRAG & DROP HANDLERS ---
  const handleDragStart = (e: React.DragEvent, type: 'row' | 'column', data: any) => {
    if (type === 'column' && data.data?.key === 'id') {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    
    const preview = createDragPreview(e.currentTarget as HTMLElement, data);
    
    setDragState({
      draggedItem: { 
        type, 
        ...data,
        columnKey: data.data?.key
      },
      dragOverTarget: null,
      isDragging: true,
      dragPreview: preview
    });

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
      e.currentTarget.style.transform = 'scale(0.98)';
    }

    const updatePreviewPosition = (clientX: number, clientY: number) => {
      if (preview) {
        preview.style.left = `${clientX + 12}px`;
        preview.style.top = `${clientY + 12}px`;
      }
    };

    updatePreviewPosition(e.clientX, e.clientY);

    const mouseMoveHandler = (event: MouseEvent) => {
      updatePreviewPosition(event.clientX, event.clientY);
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    
    const cleanup = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      if (preview && preview.parentNode) {
        preview.parentNode.removeChild(preview);
      }
    };

    setTimeout(cleanup, 100);
    document.addEventListener('mouseup', cleanup, { once: true });
  };

  const handleDragOver = (e: React.DragEvent, type: 'row' | 'column', target: any) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    setDragState(prev => ({
      ...prev,
      dragOverTarget: { type, ...target }
    }));
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (dragState.dragPreview && dragState.dragPreview.parentNode) {
      dragState.dragPreview.parentNode.removeChild(dragState.dragPreview);
    }

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
      e.currentTarget.style.transform = 'scale(1)';
    }
    
    setDragState({
      draggedItem: null,
      dragOverTarget: null,
      isDragging: false,
      dragPreview: null
    });
  };

  const handleDrop = async (e: React.DragEvent, type: 'row' | 'column', target: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!dragState.draggedItem || dragState.draggedItem.type !== type) return;

    if (type === 'row') {
      const sourceGroupIndex = dragState.draggedItem.groupIndex!;
      const sourceRowIndex = dragState.draggedItem.rowIndex!;
      const targetGroupIndex = target.groupIndex;
      const targetRowIndex = target.rowIndex;

      if (sourceGroupIndex === targetGroupIndex && sourceRowIndex === targetRowIndex) return;

      const newGroups = [...groups];
      const draggedRow = newGroups[sourceGroupIndex].rows[sourceRowIndex];
      
      newGroups[sourceGroupIndex].rows.splice(sourceRowIndex, 1);
      newGroups[targetGroupIndex].rows.splice(targetRowIndex, 0, {
        ...draggedRow,
        lugarCalibracion: newGroups[targetGroupIndex].id === "sitio" ? "sitio" : "laboratorio"
      });

      await persistGroups(newGroups);
    } else if (type === 'column') {
      const draggedColumnKey = dragState.draggedItem.columnKey;
      const targetIndex = target.columnIndex;
      
      if (!draggedColumnKey || draggedColumnKey === 'id') return;

      const sourceIndex = columns.findIndex(col => col.key === draggedColumnKey);
      
      if (sourceIndex === -1 || sourceIndex === targetIndex) return;

      const newColumns = [...columns];
      const draggedColumn = newColumns[sourceIndex];
      
      newColumns.splice(sourceIndex, 1);
      newColumns.splice(targetIndex, 0, draggedColumn);

      setColumns(newColumns);
      try {
        await updateDoc(doc(db, "tableros", "principal"), { columns: newColumns });
      } catch (error) {
        console.error("Error updating columns:", error);
      }
    }
  };

  // --- FLOATING MENU ACTIONS ---
  const handleDuplicate = async () => {
    if (selectedRows.length === 0) return;
    
    const newGroups = [...groups];
    selectedRows.forEach(({gidx, ridx}) => {
      const originalRow = newGroups[gidx].rows[ridx];
      const duplicatedRow = {
        ...originalRow,
        id: originalRow.id + '_copy',
        certificado: originalRow.certificado + ' (Copia)',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      newGroups[gidx].rows.splice(ridx + 1, 0, duplicatedRow);
    });
    
    await persistGroups(newGroups);
    setSelectedRows([]);
  };

  const handleExport = () => {
    if (selectedRows.length === 0) return;
    
    const selectedData = selectedRows.map(({gidx, ridx}) => groups[gidx].rows[ridx]);
    const csvContent = [
      columns.filter(c => !c.hidden).map(col => col.label).join(','),
      ...selectedData.map(row => 
        columns.filter(c => !c.hidden).map(col => (row as any)[col.key] || '').join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'equipos_seleccionados.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleMove = async () => {
    if (selectedRows.length === 0) return;
    
    const sourceGroup = selectedRows[0].gidx;
    const targetGroup = sourceGroup === 0 ? 1 : 0;
    
    const newGroups = [...groups];
    const sortedSelected = selectedRows.sort((a, b) => b.ridx - a.ridx);
    
    sortedSelected.forEach(({gidx, ridx}) => {
      const row = newGroups[gidx].rows[ridx];
      row.lugarCalibracion = newGroups[targetGroup].id === "sitio" ? "sitio" : "laboratorio";
      newGroups[gidx].rows.splice(ridx, 1);
      newGroups[targetGroup].rows.push(row);
    });
    
    await persistGroups(newGroups);
    setSelectedRows([]);
  };

  const handleArchive = async () => {
    if (selectedRows.length === 0) return;
    if (!window.confirm("¿Archivar los equipos seleccionados?")) return;

    const newGroups = [...groups];
    const sortedSelected = selectedRows.sort((a, b) => b.ridx - a.ridx);
    
    sortedSelected.forEach(({gidx, ridx}) => {
      const row = newGroups[gidx].rows[ridx];
      row.status = 'cancelled';
      row.lastUpdated = new Date().toISOString();
    });
    
    await persistGroups(newGroups);
    setSelectedRows([]);
  };

  // --- OTRAS FUNCIONES ---
  const handleDeleteColumn = async (columnKey: string) => {
    if (columnKey === 'id') {
      alert('No se puede eliminar la columna ID');
      return;
    }
    
    if (!window.confirm(`¿Eliminar la columna "${columns.find(c => c.key === columnKey)?.label}"?`)) return;

    const newColumns = columns.filter(c => c.key !== columnKey);
    setColumns(newColumns);
    try {
      await updateDoc(doc(db, "tableros", "principal"), { columns: newColumns });
    } catch (error) {
      console.error("Error deleting column:", error);
    }
  };

  const handleAddRow = async (gidx:number) => {
    const newRow: WorksheetData = {
      certificado: "",
      cliente: "",
      id: "",
      equipo: "",
      marca: "",
      modelo: "",
      serie: "",
      lugarCalibracion: groups[gidx].id === "sitio" ? "sitio" : "laboratorio",
      status: "pending",
      priority: "medium",
      assignedTo: "",
      dueDate: new Date(Date.now()+7*24*60*60*1000).toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    const newGroups = [...groups];
    newGroups[gidx].rows.push(newRow);
    await persistGroups(newGroups);
  };

  const handleSaveCell = async () => {
    if (!editCell) return;
    const {gidx, ridx, key} = editCell;
    const newGroups = [...groups];
    (newGroups[gidx].rows[ridx] as any)[key] = editValue;
    newGroups[gidx].rows[ridx].lastUpdated = new Date().toISOString();
    await persistGroups(newGroups);
    setEditCell(null);
    setEditValue("");
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.length === 0) return;
    if (!window.confirm("¿Eliminar los equipos seleccionados?")) return;

    const byGroup: {[gidx:number]: number[]} = {};
    selectedRows.forEach(({gidx,ridx}) => {
      if (!byGroup[gidx]) byGroup[gidx]=[];
      byGroup[gidx].push(ridx);
    });

    const newGroups = groups.map((g, gidx) => {
      if (!byGroup[gidx]) return {...g};
      const newRows = [...g.rows];
      byGroup[gidx].sort((a,b)=>b-a).forEach(idx=>newRows.splice(idx,1));
      return {...g, rows:newRows};
    });

    await persistGroups(newGroups);
    setSelectedRows([]);
  };

  const handleAddColumn = async () => {
    if(!addCol.label.trim() || addCol.label.trim().toLowerCase()==="id") return;

    let key = addCol.label.trim().toLowerCase().replace(/ /g,"_");
    if(columns.find(col=>col.key===key)) key = key+"_"+Math.floor(Math.random()*10000);

    let newCol:Column = {
      key,
      label: addCol.label.trim(),
      type: addCol.type,
      width: 85,
      ...(addCol.type==="dropdown" ? {options: addCol.options||[]} : {})
    };

    const newColumns = [...columns, newCol];
    setColumns(newColumns);
    try {
      await updateDoc(doc(db,"tableros","principal"),{ columns: newColumns });
    } catch (error) {
      console.error("Error adding column:", error);
    }
    setShowAddCol(false);
    setAddCol({label:"",type:"text"});
  };

  const filterRows = (rows:WorksheetData[]) => {
    let arr = [...rows];
    if (search.trim()) {
      arr = arr.filter(row =>
        Object.values(row).some(val =>
          (val||"").toString().toLowerCase().includes(search.toLowerCase())
        )
      );
    }
    if (filters.status && filters.status.length) {
      arr = arr.filter(row => filters.status.includes(row.status));
    }
    if (filters.assignedTo && filters.assignedTo.length) {
      arr = arr.filter(row => filters.assignedTo.includes(row.assignedTo));
    }
    if (filters.priority && filters.priority.length) {
      arr = arr.filter(row => filters.priority.includes(row.priority));
    }
    if (filters.cliente && filters.cliente.length) {
      arr = arr.filter(row => filters.cliente.includes(row.cliente));
    }
    return arr;
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-50 flex text-sm">
      {/* SIDEBAR CONDICIONAL PARA DESKTOP */}
      {!isMobile && (
        <SidebarFriday onNavigate={manejarNavegacion} />
      )}
      
      {/* BACKDROP PARA SIDEBAR MÓVIL */}
      {isMobile && sidebarAbierto && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40" 
          onClick={() => setSidebarAbierto(false)}
        />
      )}
      
      {/* SIDEBAR MÓVIL */}
      {isMobile && (
        <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform ${sidebarAbierto ? 'translate-x-0' : '-translate-x-full'}`}>
          <SidebarFriday onNavigate={manejarNavegacion} />
        </div>
      )}

      <div className={`${!isMobile ? 'ml-64' : ''} flex-1 p-3 relative overflow-hidden`}>
        {/* FLOATING MENU */}
        {selectedRows.length > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 duration-300">
            <div className="bg-blue-600 rounded-full shadow-xl border border-blue-700 px-3 py-2 flex items-center gap-2 text-white text-xs">
              <div className="bg-blue-500 rounded-full px-2 py-1 text-xs font-medium">
                {selectedRows.length} seleccionado{selectedRows.length !== 1 ? 's' : ''}
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDuplicate}
                  className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
                  title="Duplicar"
                >
                  <Copy className="w-3 h-3" />
                </button>
                
                <button
                  onClick={handleExport}
                  className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
                  title="Exportar"
                >
                  <Download className="w-3 h-3" />
                </button>
                
                <button
                  onClick={handleArchive}
                  className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
                  title="Archivar"
                >
                  <Archive className="w-3 h-3" />
                </button>
                
                <button
                  onClick={handleMove}
                  className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
                  title="Mover"
                >
                  <Send className="w-3 h-3" />
                </button>
                
                <div className="w-px h-4 bg-blue-500 mx-1"></div>
                
                <button
                  onClick={handleDeleteSelected}
                  className="p-1.5 hover:bg-red-500 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                
                <button
                  onClick={() => setSelectedRows([])}
                  className="p-1.5 hover:bg-blue-500 rounded-lg transition-colors"
                  title="Cerrar"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HEADER OPTIMIZADO */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            {/* BOTONES DE NAVEGACIÓN */}
            {isMobile ? (
              <button 
                onClick={() => setSidebarAbierto(true)}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg lg:hidden"
              >
                <Columns className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={() => manejarNavegacion('dashboard')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Regresar al menú principal"
              >
                <Home className="w-5 h-5" />
              </button>
            )}
            
            <div>
              <h1 className="text-lg font-bold text-gray-800">Equipos en Calibración</h1>
              <p className="text-xs text-gray-500">Gestión de equipos y certificados</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar..."
              className="w-40 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button 
              onClick={() => setShowFilters(v=>!v)}
              className={clsx("flex items-center bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1.5 rounded-lg shadow-sm text-xs", showFilters && "bg-blue-200")}
            >
              <Filter className="w-3 h-3 mr-1" />
              Filtros
            </button>
            <button 
              onClick={() => setShowAddCol(true)}
              className="flex items-center bg-slate-100 hover:bg-slate-200 text-blue-800 px-2 py-1.5 rounded-lg border border-slate-200 shadow-sm text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Columna
            </button>
          </div>
        </div>

        {/* FILTROS COMPACTOS */}
        {showFilters && (
          <div className="bg-white p-3 rounded-lg shadow-sm border mb-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-gray-700 text-xs">Filtros</h3>
              <button onClick={() => setShowFilters(false)} className="hover:bg-blue-100 rounded p-1">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                {DEFAULT_COLUMNS.find(col=>col.key==="status")?.options?.map(opt=>(
                  <label key={opt} className="flex items-center mb-1">
                    <input
                      type="checkbox"
                      className="mr-1 text-xs"
                      onChange={e => {
                        let prev = filters.status||[];
                        if(e.target.checked) prev=[...prev,opt]; else prev=prev.filter((v:string)=>v!==opt);
                        setFilters((f:any)=>({...f,status:prev}));
                      }}
                    />
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${STATUS_BADGE[opt as keyof typeof STATUS_BADGE].color}`}>
                      {STATUS_BADGE[opt as keyof typeof STATUS_BADGE].label}
                    </span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prioridad</label>
                {DEFAULT_COLUMNS.find(col=>col.key==="priority")?.options?.map(opt=>(
                  <label key={opt} className="flex items-center mb-1">
                    <input
                      type="checkbox"
                      className="mr-1"
                      onChange={e => {
                        let prev = filters.priority||[];
                        if(e.target.checked) prev=[...prev,opt]; else prev=prev.filter((v:string)=>v!==opt);
                        setFilters((f:any)=>({...f,priority:prev}));
                      }}
                    />
                    <span className="text-xs">{opt}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Responsable</label>
                {metrologos.map(m=>(
                  <label key={m.id} className="flex items-center mb-1">
                    <input
                      type="checkbox"
                      className="mr-1"
                      onChange={e => {
                        let prev = filters.assignedTo||[];
                        if(e.target.checked) prev=[...prev,m.name]; else prev=prev.filter((v:string)=>v!==m.name);
                        setFilters((f:any)=>({...f,assignedTo:prev}));
                      }}
                    />
                    <span className="text-xs">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={() => setFilters({})} className="mt-2 text-blue-600 hover:text-blue-800 text-xs">Limpiar filtros</button>
          </div>
        )}

        {/* AGREGAR COLUMNA COMPACTO */}
        {showAddCol && (
          <div className="bg-white p-3 rounded-lg shadow-sm border mb-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-gray-700 text-xs">Agregar columna</h3>
              <button onClick={() => setShowAddCol(false)} className="hover:bg-blue-100 rounded p-1">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                <input 
                  type="text" 
                  className="w-full px-2 py-1 text-xs border rounded-lg" 
                  value={addCol.label} 
                  onChange={e => setAddCol(a=>({...a,label:e.target.value}))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                <select 
                  className="w-full px-2 py-1 text-xs border rounded-lg" 
                  value={addCol.type} 
                  onChange={e => setAddCol(a=>({...a,type:e.target.value as Column["type"]}))}
                >
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="dropdown">Lista desplegable</option>
                  <option value="date">Fecha</option>
                  <option value="person">Persona/Metrólogo</option>
                </select>
              </div>
              {addCol.type==="dropdown" &&
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Opciones (separadas por coma)</label>
                  <input 
                    type="text" 
                    className="w-full px-2 py-1 text-xs border rounded-lg" 
                    placeholder="opción1, opción2, opción3"
                    onChange={e => setAddCol(a=>({...a,options:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}))}
                  />
                </div>
              }
            </div>
            <button onClick={handleAddColumn} className="mt-2 bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 text-xs">
              Agregar columna
            </button>
          </div>
        )}

        {/* MAIN BOARD OPTIMIZADO */}
        <div className="space-y-3">
          {groups.map((group, gidx) => (
            <div key={group.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              {/* GROUP HEADER COMPACTO */}
              <div className="flex items-center justify-between p-2 border-b" style={{backgroundColor: group.color + '10'}}>
                <div className="flex items-center">
                  <button 
                    onClick={() => {
                      const ng = [...groups];
                      ng[gidx].collapsed = !ng[gidx].collapsed;
                      setGroups(ng);
                    }}
                    className="mr-2 text-gray-500 hover:text-blue-600"
                  >
                    {group.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <div className="w-3 h-3 rounded mr-2" style={{backgroundColor: group.color}}></div>
                  <h2 className="text-sm font-semibold text-gray-800">{group.name}</h2>
                  <span className="ml-2 text-xs text-gray-500">({group.rows.length})</span>
                </div>
                <button onClick={() => handleAddRow(gidx)} className="ml-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-2 py-1 flex items-center shadow transition text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  Agregar
                </button>
              </div>

              {/* TABLE CON SCROLL OPTIMIZADO */}
              {!group.collapsed && (
                <div className="relative">
                  {/* BOTONES DE SCROLL HORIZONTAL */}
                  <div className="absolute top-0 right-0 z-20 flex bg-white border-l border-b rounded-bl-lg">
                    <button
                      onClick={scrollLeft}
                      className="p-1 hover:bg-gray-100 transition-colors border-r"
                      title="Desplazar a la izquierda"
                    >
                      <ChevronLeft className="w-3 h-3 text-gray-600" />
                    </button>
                    <button
                      onClick={scrollRight}
                      className="p-1 hover:bg-gray-100 transition-colors"
                      title="Desplazar a la derecha"
                    >
                      <ChevronRight className="w-3 h-3 text-gray-600" />
                    </button>
                  </div>

                  {/* TABLA CON SCROLL SUAVE */}
                  <div 
                    ref={scrollContainerRef}
                    className="overflow-x-auto overflow-y-hidden scroll-smooth"
                    style={{ 
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#CBD5E0 #F8FAFC'
                    }}
                  >
                    <style jsx>{`
                      .overflow-x-auto::-webkit-scrollbar {
                        height: 5px;
                      }
                      .overflow-x-auto::-webkit-scrollbar-track {
                        background: #f8fafc;
                        border-radius: 5px;
                      }
                      .overflow-x-auto::-webkit-scrollbar-thumb {
                        background: #cbd5e1;
                        border-radius: 5px;
                      }
                      .overflow-x-auto::-webkit-scrollbar-thumb:hover {
                        background: #94a3b8;
                      }
                    `}</style>
                    
                    <table className="w-full text-xs" style={{ minWidth: 'max-content' }}>
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="sticky left-0 z-10 bg-gray-50 w-6 px-2 py-2 text-center border-r-2 border-gray-200">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-xs"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newSelected = [...selectedRows];
                                  group.rows.forEach((_, ridx) => {
                                    if (!newSelected.find(sel => sel.gidx === gidx && sel.ridx === ridx)) {
                                      newSelected.push({ gidx, ridx });
                                    }
                                  });
                                  setSelectedRows(newSelected);
                                } else {
                                  setSelectedRows(selectedRows.filter(sel => sel.gidx !== gidx));
                                }
                              }}
                            />
                          </th>
                          {columns.filter(c=>!c.hidden).map((col, colIndex) => (
                            <th 
                              key={col.key} 
                              className={clsx(
                                "px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r relative group select-none transition-all duration-200",
                                dragState.dragOverTarget?.type === 'column' && 
                                dragState.dragOverTarget?.columnIndex === colIndex && 
                                "bg-blue-100 border-blue-300 transform scale-102",
                                col.key !== 'id' ? "cursor-move hover:bg-gray-100" : "cursor-default bg-gray-50",
                                dragState.isDragging && dragState.draggedItem?.type === 'column' && 
                                dragState.draggedItem?.columnKey === col.key && "opacity-30"
                              )}
                              style={{ 
                                minWidth: col.width + 'px',
                                width: col.width + 'px'
                              }}
                              draggable={col.key !== 'id'}
                              onDragStart={(e) => col.key !== 'id' && handleDragStart(e, 'column', { columnIndex: colIndex, data: col })}
                              onDragOver={(e) => handleDragOver(e, 'column', { columnIndex: colIndex })}
                              onDrop={(e) => handleDrop(e, 'column', { columnIndex: colIndex })}
                              onDragEnd={handleDragEnd}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  {col.key !== 'id' && <GripVertical className="w-2.5 h-2.5 mr-1 text-gray-400 flex-shrink-0 group-hover:text-gray-600 transition-colors" />}
                                  <span className="truncate text-xs">{col.label}</span>
                                </div>
                                {col.key !== 'id' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handleDeleteColumn(col.key);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 ml-1 text-red-400 hover:text-red-600 transition-all flex-shrink-0"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </th>
                          ))}
                          <th className="w-6 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filterRows(group.rows).map((row, ridx) => (
                          <tr 
                            key={`${row.id}-${ridx}`} 
                            className={clsx(
                              "group transition-all duration-200 select-none hover:shadow-sm",
                              selectedRows.find(sel => sel.gidx===gidx&&sel.ridx===ridx) ? "bg-blue-50 border-l-4 border-blue-500 shadow-sm"
                              : "hover:bg-blue-25",
                              dragState.dragOverTarget?.type === 'row' && 
                              dragState.dragOverTarget?.groupIndex === gidx && 
                              dragState.dragOverTarget?.rowIndex === ridx && 
                              "bg-yellow-100 border-yellow-300 transform scale-101",
                              dragState.isDragging && dragState.draggedItem?.type === 'row' && 
                              dragState.draggedItem?.groupIndex === gidx &&
                              dragState.draggedItem?.rowIndex === ridx && "opacity-30",
                              "cursor-move"
                            )}
                            draggable
                            onDragStart={(e) => handleDragStart(e, 'row', { groupIndex: gidx, rowIndex: ridx, data: row })}
                            onDragOver={(e) => handleDragOver(e, 'row', { groupIndex: gidx, rowIndex: ridx })}
                            onDrop={(e) => handleDrop(e, 'row', { groupIndex: gidx, rowIndex: ridx })}
                            onDragEnd={handleDragEnd}
                          >
                            <td className="sticky left-0 z-10 bg-white px-2 py-2 text-center border-r-2 border-gray-200">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-xs"
                                checked={selectedRows.some(sel => sel.gidx===gidx&&sel.ridx===ridx)}
                                onChange={e=>{
                                  e.stopPropagation();
                                  if(e.target.checked){
                                    setSelectedRows([...selectedRows, {gidx,ridx}]);
                                  }else{
                                    setSelectedRows(selectedRows.filter(sel=>!(sel.gidx===gidx&&sel.ridx===ridx)));
                                  }
                                }}
                              />
                            </td>
                            {columns.filter(c=>!c.hidden).map(col=>{
                              const isEditing = editCell && editCell.gidx===gidx && editCell.ridx===ridx && editCell.key===col.key;
                              let content = (row as any)[col.key];

                              // Status y prioridad badges
                              if(col.key==="status"){
                                const s = STATUS_BADGE[(row.status||"pending") as keyof typeof STATUS_BADGE];
                                content = <span className={`px-1 py-0.5 text-xs rounded-full ${s.color}`}>{s.label}</span>
                              }

                              if(col.key==="priority"){
                                const c = PRIORITY_BADGE[(row.priority||"medium") as keyof typeof PRIORITY_BADGE];
                                content = <span className={`px-1 py-0.5 text-xs rounded-full ${c}`}>{row.priority}</span>
                              }

                              // Responsable
                              if(col.key==="assignedTo" && col.type==="person"){
                                const met = metrologos.find(m=>m.name===row.assignedTo);
                                content = met ?
                                  <div className="flex items-center text-xs">
                                    <div className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center mr-1 text-blue-600 font-semibold text-xs">
                                      {met.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="truncate">{met.name}</span>
                                  </div>
                                  : (row.assignedTo || "-");
                              }

                              // Fecha
                              if(col.type==="date" && content) {
                                content = new Date(content).toLocaleDateString();
                              }

                              return (
                                <td 
                                  key={col.key} 
                                  className="px-2 py-2 border-r text-gray-900 bg-white text-xs" 
                                  style={{ 
                                    minWidth: col.width + 'px',
                                    width: col.width + 'px'
                                  }}
                                >
                                  {isEditing ? (
                                    col.type==="dropdown" ? (
                                      <select 
                                        className="w-full px-1 py-0.5 border rounded text-xs text-gray-900 focus:ring-2 focus:ring-blue-500" 
                                        value={editValue} 
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e=>{ 
                                          if(e.key==="Enter") handleSaveCell(); 
                                          if(e.key==="Escape") setEditCell(null); 
                                        }}
                                        autoFocus
                                      >
                                        {(col.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
                                      </select>
                                    ) : col.type==="person" ? (
                                      <select 
                                        className="w-full px-1 py-0.5 border rounded text-xs text-gray-900 focus:ring-2 focus:ring-blue-500" 
                                        value={editValue} 
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e=>{ 
                                          if(e.key==="Enter") handleSaveCell(); 
                                          if(e.key==="Escape") setEditCell(null); 
                                        }}
                                        autoFocus
                                      >
                                        <option value="">- Selecciona -</option>
                                        {metrologos.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                                      </select>
                                    ) : col.type==="date" ? (
                                      <input 
                                        type="date" 
                                        className="w-full px-1 py-0.5 border rounded text-xs text-gray-900 focus:ring-2 focus:ring-blue-500" 
                                        value={editValue} 
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e=>{ 
                                          if(e.key==="Enter") handleSaveCell(); 
                                          if(e.key==="Escape") setEditCell(null); 
                                        }}
                                        autoFocus
                                      />
                                    ) : (
                                      <input 
                                        type="text" 
                                        className="w-full px-1 py-0.5 border rounded text-xs text-gray-900 focus:ring-2 focus:ring-blue-500" 
                                        value={editValue} 
                                        onChange={e => setEditValue(e.target.value)}
                                        autoFocus
                                        onBlur={handleSaveCell}
                                        onKeyDown={e=>{ 
                                          if(e.key==="Enter") handleSaveCell(); 
                                          if(e.key==="Escape") setEditCell(null); 
                                        }}
                                      />
                                    )
                                  ) : (
                                    <div 
                                      className="cursor-pointer hover:bg-gray-100 p-1 rounded min-h-[18px] text-gray-900 transition-colors overflow-hidden"
                                      onClick={(e) => { 
                                        e.stopPropagation();
                                        setEditCell({gidx, ridx, key:col.key}); 
                                        setEditValue((row as any)[col.key]??""); 
                                      }}
                                    >
                                      <div className="truncate text-xs">{content || "-"}</div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center bg-white">
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const ng = [...groups];
                                  ng[gidx].rows.splice(ridx,1);
                                  await persistGroups(ng);
                                }}
                                className="opacity-40 group-hover:opacity-100 transition text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {group.rows.length===0 &&
                          <tr>
                            <td colSpan={columns.filter(c=>!c.hidden).length + 2} className="px-4 py-6 text-center text-gray-500 text-xs">
                              No hay equipos aún.
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FridayScreen;
