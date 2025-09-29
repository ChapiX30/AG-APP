import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronDown, X, CheckCircle, Users, Search, Filter, Columns, GripVertical, Move, Copy, Archive, MoreHorizontal, Download, FileText, Send, ChevronLeft, Home, ArrowUpDown, ArrowUp, ArrowDown, Settings, Eye, EyeOff
} from "lucide-react";
import SidebarFriday from "./SidebarFriday";
import { db } from "../utils/firebase";
import { doc, getDoc, updateDoc, collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import clsx from "clsx";

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

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc' | null;
}

// COLUMNAS ESTILO MONDAY.COM CON FOLIO SORTABLE
const DEFAULT_COLUMNS: Column[] = [
  { key: 'folio', label: 'Folio', width: 100, type: "text", sortable: true },
  { key: 'certificado', label: 'Certificado', width: 120, type: "text" },
  { key: 'cliente', label: 'Cliente', width: 180, type: "text" },
  { key: 'id', label: 'ID', width: 80, type: "text" },
  { key: 'equipo', label: 'Equipo', width: 150, type: "text" },
  { key: 'marca', label: 'Marca', width: 120, type: "text" },
  { key: 'modelo', label: 'Modelo', width: 120, type: "text" },
  { key: 'serie', label: 'Serie', width: 100, type: "text" },
  { key: 'status', label: 'Estado', width: 120, type: "dropdown", options: ["pending","in_progress","completed","cancelled"] },
  { key: 'priority', label: 'Prioridad', width: 110, type: "dropdown", options: ["low","medium","high","urgent"] },
  { key: 'assignedTo', label: 'Responsable', width: 140, type: "person" },
  { key: 'dueDate', label: 'Fecha Límite', width: 130, type: "date" }
];

const FRIDAY_GROUPS: Group[] = [
  { id: "sitio", name: "Servicio en Sitio", color: "#ff5722", collapsed: false, rows: [] },
  { id: "laboratorio", name: "Equipos en Laboratorio", color: "#00c875", collapsed: false, rows: [] }
];

// COLORES ESTILO MONDAY.COM EXACTOS
const STATUS_BADGE = {
  pending: { label: "Pendiente", color: "bg-blue-500 text-white" },
  in_progress: { label: "En Proceso", color: "bg-orange-400 text-white" },
  completed: { label: "Completado", color: "bg-green-500 text-white" },
  cancelled: { label: "Cancelado", color: "bg-red-500 text-white" }
};

const PRIORITY_BADGE = {
  low: "bg-gray-400 text-white",
  medium: "bg-yellow-400 text-white",
  high: "bg-orange-500 text-white",
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

// Props interface para FridayScreen
interface FridayScreenProps {
  navigate?: (route: string) => void;
}

const FridayScreen: React.FC<FridayScreenProps> = ({ navigate }) => {
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
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // Estado para ordenamiento
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: null });
  
  // Estado para drag & drop
  const [dragState, setDragState] = useState<DragState>({
    draggedItem: null,
    dragOverTarget: null,
    isDragging: false,
    dragPreview: null
  });

  // Refs para scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // --- NAVEGACIÓN CORREGIDA CON BOTÓN DE REGRESO ---
  const manejarNavegacion = useCallback((destino: string) => {
    console.log('Navegando a:', destino);
    
    if (isMobile) {
      setSidebarAbierto(false);
    }
    
    // Usar navigate prop si está disponible, sino usar window.location
    try {
      if (navigate) {
        navigate(destino);
      } else {
        // Fallback usando window.location o history API
        if (destino === 'dashboard' || destino === 'menu' || destino === 'inicio' || destino === 'mainmenu') {
          window.location.href = '/dashboard';
        } else if (destino === 'servicios' || destino === 'servicios-sitio') {
          window.location.href = '/servicios';
        } else {
          window.location.href = `/${destino}`;
        }
      }
    } catch (error) {
      console.error('Error de navegación:', error);
      // Último recurso
      window.location.href = '/dashboard';
    }
  }, [navigate, isMobile]);

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

  // --- LOAD DATA CON LISTENER EN TIEMPO REAL MEJORADO ---
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const loadData = async () => {
      try {
        const docRef = doc(db, "tableros", "principal");
        
        // Listener en tiempo real para actualización automática
        unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const board = docSnap.data();
            
            if (board.groups) {
              setGroups(board.groups.map((g:any)=>({
                ...g, 
                rows: g.rows?.map((row: any) => ({
                  ...row,
                  folio: row.folio || row.certificado || `F${Date.now()}`
                })) || []
              })));
            }
            
            if (board.columns) {
              setColumns(board.columns);
            }
          }
        }, (error) => {
          console.error("Error listening to data:", error);
        });

        // También escuchar cambios en hojas de trabajo individuales
        const worksheetRef = collection(db, "hojas-trabajo");
        const worksheetUnsubscribe = onSnapshot(worksheetRef, (snapshot) => {
          console.log("Cambios detectados en hojas de trabajo");
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const newWorksheet = change.doc.data();
              console.log("Nueva hoja de trabajo detectada:", newWorksheet);
              
              // Agregar automáticamente al grupo apropiado
              setGroups(prevGroups => {
                const updatedGroups = [...prevGroups];
                const targetGroupIndex = updatedGroups.findIndex(g => 
                  g.id === newWorksheet.lugarCalibracion || 
                  (newWorksheet.lugarCalibracion === 'sitio' && g.id === 'sitio') ||
                  (newWorksheet.lugarCalibracion === 'laboratorio' && g.id === 'laboratorio')
                );
                
                if (targetGroupIndex !== -1) {
                  const existingRowIndex = updatedGroups[targetGroupIndex].rows.findIndex(
                    row => row.id === newWorksheet.id || row.certificado === newWorksheet.certificado
                  );
                  
                  if (existingRowIndex === -1) {
                    updatedGroups[targetGroupIndex].rows.push({
                      ...newWorksheet,
                      folio: newWorksheet.folio || newWorksheet.certificado || `F${Date.now()}`
                    });
                  }
                }
                
                return updatedGroups;
              });
            }
          });
        });

        return () => {
          unsubscribe?.();
          worksheetUnsubscribe?.();
        };
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    loadData();

    return () => {
      unsubscribe?.();
    };
  }, []);

  // --- FUNCIÓN DE ORDENAMIENTO MEJORADA SOLO PARA FOLIO ---
  const handleSort = useCallback((columnKey: string) => {
    // Solo permitir ordenamiento en la columna folio
    if (columnKey !== 'folio') return;
    
    setSortConfig(prevConfig => {
      if (prevConfig.key === columnKey) {
        // Cambiar dirección: asc -> desc -> null -> asc
        if (prevConfig.direction === 'asc') {
          return { key: columnKey, direction: 'desc' };
        } else if (prevConfig.direction === 'desc') {
          return { key: '', direction: null };
        } else {
          return { key: columnKey, direction: 'asc' };
        }
      } else {
        return { key: columnKey, direction: 'asc' };
      }
    });
  }, []);

  // Aplicar ordenamiento a los grupos
  const sortedGroups = React.useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return groups;
    }

    return groups.map(group => ({
      ...group,
      rows: [...group.rows].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        
        // Conversión a string para comparación consistente
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      })
    }));
  }, [groups, sortConfig]);

  // Función para renderizar iconos de ordenamiento EXACTO COMO LA IMAGEN 1
  const renderSortIcon = (columnKey: string) => {
    if (columnKey !== 'folio') return null;
    
    return (
      <div className="flex flex-col ml-1">
        <ArrowUp 
          className={`w-3 h-3 -mb-1 ${
            sortConfig.key === columnKey && sortConfig.direction === 'asc' 
              ? 'text-blue-600' 
              : 'text-gray-300'
          }`} 
        />
        <ArrowDown 
          className={`w-3 h-3 ${
            sortConfig.key === columnKey && sortConfig.direction === 'desc' 
              ? 'text-blue-600' 
              : 'text-gray-300'
          }`} 
        />
      </div>
    );
  };

  // SAVE DATA
  const saveData = async () => {
    try {
      const docRef = doc(db, "tableros", "principal");
      await updateDoc(docRef, { 
        groups: groups.map(g => ({
          ...g,
          rows: g.rows.map(row => ({
            ...row,
            lastUpdated: new Date().toISOString()
          }))
        })), 
        columns 
      });
      console.log("Datos guardados correctamente");
    } catch (error) {
      console.error("Error saving:", error);
    }
  };

  // AUTO SAVE
  useEffect(() => {
    const timer = setTimeout(saveData, 2000);
    return () => clearTimeout(timer);
  }, [groups, columns]);

  // --- DRAG & DROP ---
  const handleDragStart = useCallback((e: React.DragEvent, type: 'row' | 'column', data: any) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragState(prev => ({
      ...prev,
      draggedItem: { type, ...data },
      isDragging: true
    }));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, type: 'row' | 'column', target: any) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({
      ...prev,
      dragOverTarget: { type, ...target }
    }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, type: 'row' | 'column', target: any) => {
    e.preventDefault();
    
    const { draggedItem } = dragState;
    if (!draggedItem || draggedItem.type !== type) return;

    if (type === 'row') {
      setGroups(prev => {
        const newGroups = [...prev];
        const sourceGroup = newGroups[draggedItem.groupIndex!];
        const targetGroup = newGroups[target.groupIndex];
        const draggedRow = sourceGroup.rows[draggedItem.rowIndex!];
        
        sourceGroup.rows.splice(draggedItem.rowIndex!, 1);
        targetGroup.rows.splice(target.rowIndex, 0, draggedRow);
        
        return newGroups;
      });
    } else if (type === 'column') {
      setColumns(prev => {
        const newCols = [...prev];
        const draggedCol = newCols[draggedItem.columnIndex!];
        newCols.splice(draggedItem.columnIndex!, 1);
        newCols.splice(target.columnIndex, 0, draggedCol);
        return newCols;
      });
    }

    setDragState({
      draggedItem: null,
      dragOverTarget: null,
      isDragging: false
    });
  }, [dragState]);

  const handleDragEnd = useCallback(() => {
    setDragState({
      draggedItem: null,
      dragOverTarget: null,
      isDragging: false
    });
  }, []);

  // --- CELL EDITING ---
  const handleSaveCell = useCallback(() => {
    if (!editCell) return;
    
    setGroups(prev => {
      const newGroups = [...prev];
      const group = newGroups[editCell.gidx];
      const row = group.rows[editCell.ridx];
      (row as any)[editCell.key] = editValue;
      return newGroups;
    });
    
    setEditCell(null);
    setEditValue("");
  }, [editCell, editValue]);

  // --- ROW OPERATIONS ---
  const addRow = useCallback((groupIndex: number) => {
    const newRow: WorksheetData = {
      certificado: `CERT-${Date.now()}`,
      cliente: "",
      id: `ID-${Date.now()}`,
      folio: `F-${Date.now()}`,
      equipo: "",
      marca: "",
      modelo: "",
      serie: "",
      lugarCalibracion: groups[groupIndex].id as 'sitio' | 'laboratorio',
      status: 'pending',
      priority: 'medium',
      assignedTo: "",
      dueDate: "",
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    setGroups(prev => {
      const newGroups = [...prev];
      newGroups[groupIndex].rows.push(newRow);
      return newGroups;
    });
  }, [groups]);

  const deleteRows = useCallback(() => {
    setGroups(prev => {
      const newGroups = [...prev];
      selectedRows.sort((a, b) => b.ridx - a.ridx).forEach(({gidx, ridx}) => {
        newGroups[gidx].rows.splice(ridx, 1);
      });
      return newGroups;
    });
    setSelectedRows([]);
  }, [selectedRows]);

  // --- COLUMN OPERATIONS ---
  const addColumn = useCallback(() => {
    if (!addCol.label) return;
    
    const newCol: Column = {
      key: addCol.label.toLowerCase().replace(/\s+/g, '_'),
      label: addCol.label,
      type: addCol.type,
      width: 150,
      options: addCol.options,
      sortable: false
    };
    
    setColumns(prev => [...prev, newCol]);
    setShowAddCol(false);
    setAddCol({label:"",type:"text"});
  }, [addCol]);

  const toggleColumnVisibility = useCallback((columnKey: string) => {
    setColumns(prev => 
      prev.map(col => 
        col.key === columnKey ? { ...col, hidden: !col.hidden } : col
      )
    );
  }, []);

  // --- FILTROS ---
  const filteredGroups = React.useMemo(() => {
    return sortedGroups.map(group => ({
      ...group,
      rows: group.rows.filter(row => {
        if (search && !Object.values(row).some(val => 
          String(val).toLowerCase().includes(search.toLowerCase())
        )) return false;
        
        return Object.entries(filters).every(([key, value]) => {
          if (!value) return true;
          return String(row[key as keyof WorksheetData]).toLowerCase().includes(String(value).toLowerCase());
        });
      })
    }));
  }, [sortedGroups, search, filters]);

  if (!isMobile && sidebarAbierto) {
    return (
      <div className="flex h-screen bg-gray-50">
        <SidebarFriday 
          onNavigate={manejarNavegacion} 
          isOpen={sidebarAbierto}
          onToggle={() => setSidebarAbierto(!sidebarAbierto)}
        />
        
        <div className="flex-1 flex flex-col overflow-hidden ml-64">
          {/* Header estilo Monday.com */}
          <div className="bg-white shadow-sm border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => manejarNavegacion('mainmenu')}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                >
                  <Home className="w-5 h-5" />
                  <span className="font-medium">Menú Principal</span>
                </button>
                <div className="h-6 w-px bg-gray-300"></div>
                <h1 className="text-2xl font-bold text-gray-900">Equipos en Calibración</h1>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Filter className="w-5 h-5" />
                </button>
                
                <button 
                  onClick={() => setShowColumnSettings(true)}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Settings className="w-5 h-5" />
                </button>
                
                <button 
                  onClick={() => setShowAddCol(true)}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Columns className="w-5 h-5" />
                </button>
                
                {selectedRows.length > 0 && (
                  <button 
                    onClick={deleteRows}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Filtros */}
          {showFilters && (
            <div className="bg-white border-b px-6 py-4">
              <div className="grid grid-cols-4 gap-4">
                {columns.filter(col => !col.hidden && col.type !== 'person').map(col => (
                  <div key={col.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {col.label}
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder={`Filtrar por ${col.label.toLowerCase()}`}
                      value={filters[col.key] || ''}
                      onChange={(e) => setFilters(prev => ({...prev, [col.key]: e.target.value}))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Tabla estilo Monday.com EXACTO */}
          <div className="flex-1 overflow-auto bg-white" ref={scrollContainerRef}>
            <div className="min-w-full">
              {/* Header de la tabla EXACTO COMO MONDAY.COM */}
              <div className="bg-gray-50 sticky top-0 z-20 border-b border-gray-200">
                <div className="flex">
                  <div className="w-12 px-3 py-3 border-r border-gray-200 bg-gray-50">
                    <input 
                      type="checkbox" 
                      checked={selectedRows.length === filteredGroups.reduce((acc, g) => acc + g.rows.length, 0)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allRows: {gidx:number, ridx:number}[] = [];
                          filteredGroups.forEach((group, gidx) => {
                            group.rows.forEach((_, ridx) => {
                              allRows.push({ gidx, ridx });
                            });
                          });
                          setSelectedRows(allRows);
                        } else {
                          setSelectedRows([]);
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  
                  {columns.filter(c => !c.hidden).map((col, colIndex) => (
                    <div
                      key={col.key}
                      className={`px-3 py-3 border-r border-gray-200 bg-gray-50 font-medium text-gray-700 text-sm select-none flex items-center justify-between ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      style={{ width: col.width }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'column', { columnIndex: colIndex, data: col })}
                      onDragOver={(e) => handleDragOver(e, 'column', { columnIndex: colIndex })}
                      onDrop={(e) => handleDrop(e, 'column', { columnIndex: colIndex })}
                      onDragEnd={handleDragEnd}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    >
                      <span className="flex items-center">
                        {col.label}
                        {renderSortIcon(col.key)}
                      </span>
                      <GripVertical className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                    </div>
                  ))}
                  
                  <div className="w-12 px-3 py-3 bg-gray-50 font-medium text-gray-700 text-sm">
                    <MoreHorizontal className="w-4 h-4" />
                  </div>
                </div>
              </div>
              
              {/* Grupos y filas ESTILO MONDAY.COM EXACTO */}
              {filteredGroups.map((group, gidx) => (
                <div key={group.id}>
                  {/* Header del grupo EXACTO COMO MONDAY.COM */}
                  <div 
                    className="bg-white border-b border-gray-100 flex items-center px-4 py-2 cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      setGroups(prev => prev.map((g, i) => 
                        i === gidx ? { ...g, collapsed: !g.collapsed } : g
                      ));
                    }}
                  >
                    {group.collapsed ? <ChevronRight className="w-4 h-4 mr-2 text-gray-500" /> : <ChevronDown className="w-4 h-4 mr-2 text-gray-500" />}
                    <div 
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="font-medium text-gray-900 text-sm">{group.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({group.rows.length})</span>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        addRow(gidx);
                      }}
                      className="ml-auto p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Filas del grupo ESTILO MONDAY.COM EXACTO */}
                  {!group.collapsed && group.rows.map((row, ridx) => (
                    <div 
                      key={`${gidx}-${ridx}`} 
                      className="bg-white border-b border-gray-100 hover:bg-gray-50 flex items-center"
                      draggable
                      onDragStart={(e) => handleDragStart(e, 'row', { groupIndex: gidx, rowIndex: ridx, data: row })}
                      onDragOver={(e) => handleDragOver(e, 'row', { groupIndex: gidx, rowIndex: ridx })}
                      onDrop={(e) => handleDrop(e, 'row', { groupIndex: gidx, rowIndex: ridx })}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="w-12 px-3 py-2 border-r border-gray-100 flex items-center">
                        <input 
                          type="checkbox" 
                          checked={selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx)}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setSelectedRows([...selectedRows, { gidx, ridx }]);
                            } else {
                              setSelectedRows(selectedRows.filter(sel => !(sel.gidx === gidx && sel.ridx === ridx)));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      
                      {columns.filter(c => !c.hidden).map(col => {
                        const isEditing = editCell && editCell.gidx === gidx && editCell.ridx === ridx && editCell.key === col.key;
                        let content = (row as any)[col.key];
                        
                        // Status badges EXACTOS COMO MONDAY.COM
                        if (col.key === "status") {
                          const s = STATUS_BADGE[(row.status || "pending") as keyof typeof STATUS_BADGE];
                          content = <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
                        }
                        if (col.key === "priority") {
                          const c = PRIORITY_BADGE[(row.priority || "medium") as keyof typeof PRIORITY_BADGE];
                          content = <span className={`px-2 py-1 rounded-full text-xs font-medium ${c}`}>{row.priority}</span>;
                        }
                        
                        // Responsable EXACTO COMO MONDAY.COM
                        if (col.key === "assignedTo" && col.type === "person") {
                          const met = metrologos.find(m => m.name === row.assignedTo);
                          content = met ? 
                            <div className="flex items-center">
                              <div className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center mr-2 font-medium">
                                {met.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm text-gray-900">{met.name}</span>
                            </div> : 
                            <span className="text-gray-400 text-sm">-</span>;
                        }
                        
                        return (
                          <div 
                            key={col.key}
                            className="border-r border-gray-100 px-3 py-2 text-sm text-gray-900 cursor-pointer"
                            style={{ width: col.width }}
                          >
                            {isEditing ? (
                              col.type === "dropdown" ? (
                                <select
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={handleSaveCell}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveCell();
                                    if (e.key === "Escape") setEditCell(null);
                                  }}
                                  autoFocus
                                  className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none"
                                >
                                  {col.options?.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : col.type === "person" ? (
                                <select
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={handleSaveCell}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveCell();
                                    if (e.key === "Escape") setEditCell(null);
                                  }}
                                  autoFocus
                                  className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none"
                                >
                                  <option value="">Sin asignar</option>
                                  {metrologos.map(met => (
                                    <option key={met.id} value={met.name}>{met.name}</option>
                                  ))}
                                </select>
                              ) : col.type === "date" ? (
                                <input
                                  type="date"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveCell();
                                    if (e.key === "Escape") setEditCell(null);
                                  }}
                                  autoFocus
                                  className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                  onBlur={handleSaveCell}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveCell();
                                    if (e.key === "Escape") setEditCell(null);
                                  }}
                                  className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none"
                                />
                              )
                            ) : (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditCell({ gidx, ridx, key: col.key });
                                  setEditValue((row as any)[col.key] ?? "");
                                }}
                                className="min-h-[20px] flex items-center"
                              >
                                {content || <span className="text-gray-400">-</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      <div className="w-12 px-3 py-2 flex items-center">
                        <button className="p-1 text-gray-400 hover:text-gray-600">
                          <GripVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {!group.collapsed && group.rows.length === 0 && (
                    <div className="bg-white border-b border-gray-100">
                      <div className="px-4 py-8 text-center text-gray-500 text-sm">
                        No hay equipos en este grupo
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Modal para configuración de columnas */}
        {showColumnSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 max-h-96 overflow-y-auto">
              <h3 className="text-lg font-medium mb-4">Configurar Columnas</h3>
              
              <div className="space-y-2">
                {columns.map(col => (
                  <div key={col.key} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                    <span className="text-sm">{col.label}</span>
                    <button
                      onClick={() => toggleColumnVisibility(col.key)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      {col.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowColumnSettings(false)}
                  className="px-4 py-2 bg-gray-600 text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Modal para agregar columna */}
        {showAddCol && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-medium mb-4">Agregar Columna</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={addCol.label}
                    onChange={(e) => setAddCol(prev => ({ ...prev, label: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nombre de la columna"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <select
                    value={addCol.type}
                    onChange={(e) => setAddCol(prev => ({ ...prev, type: e.target.value as Column["type"] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="text">Texto</option>
                    <option value="number">Número</option>
                    <option value="date">Fecha</option>
                    <option value="dropdown">Lista</option>
                    <option value="person">Persona</option>
                  </select>
                </div>
                
                {addCol.type === "dropdown" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Opciones (separadas por coma)
                    </label>
                    <input
                      type="text"
                      onChange={(e) => setAddCol(prev => ({ 
                        ...prev, 
                        options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="opción1, opción2, opción3"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddCol(false);
                    setAddCol({ label: "", type: "text" });
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={addColumn}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // VISTA MÓVIL ESTILO MONDAY.COM
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header móvil */}
      <div className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => manejarNavegacion('mainmenu')}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
          >
            <Home className="w-5 h-5" />
            <span className="text-sm font-medium">Menú</span>
          </button>
          
          <button 
            onClick={() => setSidebarAbierto(!sidebarAbierto)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
        
        <h1 className="text-lg font-bold text-gray-900">Equipos</h1>
        
        <button 
          onClick={() => addRow(0)}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      
      {/* Búsqueda móvil */}
      <div className="bg-white border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar equipos..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      {/* Lista móvil estilo Monday.com */}
      <div className="flex-1 overflow-auto">
        {filteredGroups.map((group, gidx) => (
          <div key={group.id} className="mb-2">
            {/* Header del grupo móvil */}
            <div 
              className="bg-white mx-4 mt-4 rounded-t-lg px-4 py-3 flex items-center justify-between border-b cursor-pointer"
              onClick={() => {
                setGroups(prev => prev.map((g, i) => 
                  i === gidx ? { ...g, collapsed: !g.collapsed } : g
                ));
              }}
            >
              <div className="flex items-center">
                {group.collapsed ? <ChevronRight className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
                <div 
                  className="w-3 h-3 rounded-full mr-3"
                  style={{ backgroundColor: group.color }}
                />
                <span className="font-medium text-gray-900 text-sm">{group.name}</span>
                <span className="ml-2 text-xs text-gray-500">({group.rows.length})</span>
              </div>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  addRow(gidx);
                }}
                className="p-1 text-gray-400 hover:text-blue-600"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            {/* Cards móviles */}
            {!group.collapsed && (
              <div className="bg-white mx-4 rounded-b-lg divide-y">
                {group.rows.map((row, ridx) => (
                  <div key={`${gidx}-${ridx}`} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center">
                        <input 
                          type="checkbox" 
                          checked={selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRows([...selectedRows, { gidx, ridx }]);
                            } else {
                              setSelectedRows(selectedRows.filter(sel => !(sel.gidx === gidx && sel.ridx === ridx)));
                            }
                          }}
                          className="mr-3"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{row.folio || row.certificado}</div>
                          <div className="text-sm text-gray-500">{row.cliente}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {row.status && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[row.status].color}`}>
                            {STATUS_BADGE[row.status].label}
                          </span>
                        )}
                        {row.priority && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${PRIORITY_BADGE[row.priority]}`}>
                            {row.priority}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Equipo:</span>
                        <div className="font-medium">{row.equipo || '-'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Marca:</span>
                        <div className="font-medium">{row.marca || '-'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Modelo:</span>
                        <div className="font-medium">{row.modelo || '-'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Serie:</span>
                        <div className="font-medium">{row.serie || '-'}</div>
                      </div>
                    </div>
                    
                    {row.assignedTo && (
                      <div className="mt-2 flex items-center">
                        <div className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center mr-2">
                          {row.assignedTo.charAt(0)}
                        </div>
                        <span className="text-sm text-gray-700">{row.assignedTo}</span>
                      </div>
                    )}
                  </div>
                ))}
                
                {group.rows.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    <span className="text-sm">No hay equipos en este grupo</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Sidebar móvil */}
      {sidebarAbierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSidebarAbierto(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-lg">
            <SidebarFriday 
              onNavigate={manejarNavegacion}
              isOpen={sidebarAbierto}
              onToggle={() => setSidebarAbierto(false)}
            />
          </div>
        </div>
      )}
      
      {/* Botón flotante para eliminar seleccionados */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-4 right-4">
          <button 
            onClick={deleteRows}
            className="bg-red-500 text-white p-3 rounded-full shadow-lg hover:bg-red-600"
          >
            <Trash2 className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FridayScreen;
