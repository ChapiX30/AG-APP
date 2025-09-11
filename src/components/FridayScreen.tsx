import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus, MoreVertical, ArrowLeft, Search, Filter, ChevronDown, ChevronRight, X, 
  Pencil, Trash2, ListChecks, File as FileIcon, Tag, Users, CheckCircle, Copy, 
  Download, Archive, Move, Calendar, Hash, Menu, Star, Eye, Settings, Zap, 
  Target, Clock as ClockIcon, AlertCircle, Sun, Moon, Phone as PhoneIcon, 
  Mail, Link as LinkIcon, DollarSign, Sigma, Palette, Type, Text, AlignLeft, 
  Grid, Layers, Clock, MapPin, Link, Code, UserPlus, TrendingUp, BarChart2,
  PlusCircle, MinusCircle, DivideCircle, Percent, DollarSign as DollarSignIcon, 
  Hash as HashIcon, Calendar as CalendarIcon, Clock as ClockIcon2, 
  MapPin as MapPinIcon, Link as LinkIcon2, Code as CodeIcon, 
  UserPlus as UserPlusIcon, TrendingUp as TrendingUpIcon, 
  BarChart2 as BarChart2Icon, Star as StarIcon, Columns, SortAsc, SortDesc,
  RotateCcw, Save, Upload, FolderOpen, Database, Activity
} from "lucide-react";
import clsx from "clsx";
import { useNavigation } from "../hooks/useNavigation";
import SidebarFriday from "./SidebarFriday";
import { collection, onSnapshot, doc, setDoc, updateDoc, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../utils/firebase";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/Tabs";

// Tipos y configuraciones
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
}

interface Column {
  key: string;
  label: string;
  type: string;
  width: number;
  hidden: boolean;
  sortable: boolean;
  filterable: boolean;
  required: boolean;
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
  avatar?: string;
  role: string;
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente', color: '#e2e5e9' },
  { value: 'in_progress', label: 'En Progreso', color: '#fdab3d' },
  { value: 'completed', label: 'Completado', color: '#00c875' },
  { value: 'cancelled', label: 'Cancelado', color: '#e83f4f' }
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja', color: '#579bfc' },
  { value: 'medium', label: 'Media', color: '#fdab3d' },
  { value: 'high', label: 'Alta', color: '#ff642e' },
  { value: 'urgent', label: 'Urgente', color: '#e83f4f' }
];

const DEFAULT_COLUMNS: Column[] = [
  { key: 'certificado', label: 'N° Certificado', type: 'text', width: 140, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'cliente', label: 'Cliente', type: 'text', width: 160, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'id', label: 'ID', type: 'text', width: 100, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'equipo', label: 'Equipo', type: 'text', width: 150, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'marca', label: 'Marca', type: 'text', width: 120, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'modelo', label: 'Modelo', type: 'text', width: 130, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'serie', label: 'Serie', type: 'text', width: 120, hidden: false, sortable: true, filterable: true, required: true },
  { key: 'status', label: 'Estado', type: 'status', width: 120, hidden: false, sortable: true, filterable: true, required: false },
  { key: 'priority', label: 'Prioridad', type: 'priority', width: 110, hidden: false, sortable: true, filterable: true, required: false },
  { key: 'assignedTo', label: 'Responsable', type: 'person', width: 140, hidden: false, sortable: true, filterable: true, required: false },
  { key: 'dueDate', label: 'Fecha Límite', type: 'date', width: 130, hidden: false, sortable: true, filterable: true, required: false },
  { key: 'createdAt', label: 'Creado', type: 'datetime', width: 130, hidden: false, sortable: true, filterable: false, required: false },
  { key: 'lastUpdated', label: 'Actualizado', type: 'datetime', width: 130, hidden: false, sortable: true, filterable: false, required: false }
];

const FridayScreen: React.FC = () => {
  // Estados principales
  const [groups, setGroups] = useState<Group[]>([
    { 
      id: 'sitio', 
      name: 'Servicio en Sitio', 
      color: '#0073ea', 
      collapsed: false, 
      rows: [] 
    },
    { 
      id: 'laboratorio', 
      name: 'Equipos en Laboratorio', 
      color: '#00c875', 
      collapsed: false, 
      rows: [] 
    }
  ]);

  useEffect(() => {
  const boardRef = doc(db, "tableros", "principal");
  const unsubscribe = onSnapshot(boardRef, (docSnap) => {
    if (docSnap.exists()) {
      const boardData = docSnap.data();
      if (boardData.groups) {
        setGroups(
          boardData.groups.map((g: any) => ({
            ...g,
            color: g.color || (g.id === 'sitio' ? '#0073ea' : '#00c875'),
            name: g.name || (g.id === 'sitio' ? 'Servicio en Sitio' : 'Equipos en Laboratorio'),
            rows: g.rows || [],
            collapsed: g.collapsed ?? false,
          }))
        );
      }
      if (boardData.columns) {
        setColumns(boardData.columns);
        setColumnOrder(boardData.columns.map((c: any) => c.key));
      }
    }
  });
  return () => unsubscribe();
}, []);
  
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMNS.map(c => c.key));
  const [selectedRows, setSelectedRows] = useState<Array<{gidx: number, ridx: number}>>([]);
  const [editCell, setEditCell] = useState<{gidx: number, ridx: number, colKey: string} | null>(null);
  const [editValue, setEditValue] = useState<any>("");
  const [saveTick, setSaveTick] = useState(0);

  // Estados de UI
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);
  const [openColMenuKey, setOpenColMenuKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'calendar'>('table');
  const [showAddRow, setShowAddRow] = useState<string | null>(null);
  
  // Estados de transferencia
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferData, setTransferData] = useState<any[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);

  // Estado para usuarios metrólogos
  const [metrologos, setMetrologos] = useState<MetrologoUser[]>([]);
  const [loadingMetrologos, setLoadingMetrologos] = useState(true);

  const { navigateTo } = useNavigation();

  // CORREGIDO: Cargar datos desde Firebase en tiempo real
  useEffect(() => {
    const loadWorksheetData = async () => {
      try {
        const hojasRef = collection(db, 'tableros', 'principal');
        const unsubscribe = onSnapshot(hojasRef, (snapshot) => {
          const newGroups = [
            { 
              id: 'sitio', 
              name: 'Servicio en Sitio', 
              color: '#0073ea', 
              collapsed: false, 
              rows: [] as WorksheetData[]
            },
            { 
              id: 'laboratorio', 
              name: 'Equipos en Laboratorio', 
              color: '#00c875', 
              collapsed: false, 
              rows: [] as WorksheetData[]
            }
          ];

          snapshot.forEach((doc) => {
            const data = doc.data();
            
            // CORREGIDO: Mapear correctamente los campos de Firebase
            const worksheetItem: WorksheetData = {
              certificado: data.certificado || '',
              cliente: data.cliente || '',
              id: data.id || '', // CORREGIDO: Ahora sí mapea el ID correctamente
              equipo: data.equipo || '',
              marca: data.marca || '',
              modelo: data.modelo || '',
              serie: data.serie || '',
              lugarCalibracion: data.lugarCalibracion === 'Laboratorio' ? 'laboratorio' : 'sitio',
              status: 'pending',
              priority: 'medium',
              assignedTo: data.nombre || '',
              dueDate: data.fecha || new Date().toISOString().split('T')[0],
              createdAt: data.fecha || new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            };

            // Agregar al grupo correspondiente
            const targetGroupIndex = worksheetItem.lugarCalibracion === 'sitio' ? 0 : 1;
            newGroups[targetGroupIndex].rows.push(worksheetItem);
          });

          setGroups(newGroups);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error loading worksheet data:', error);
      }
    };

    loadWorksheetData();
  }, []);

  // Cargar usuarios metrólogos desde Firebase
  useEffect(() => {
    const fetchMetrologos = async () => {
      try {
        setLoadingMetrologos(true);
        const usuariosRef = collection(db, 'usuarios');
        // CORREGIDO: Cambié 'metrologo' por 'Metrologo' según la imagen
        const q = query(usuariosRef, where('puesto', '==', 'Metrólogo'));
        const querySnapshot = await getDocs(q);
        
        const metrologosList: MetrologoUser[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          metrologosList.push({
            id: doc.id,
            name: data.nombre || data.name || 'Usuario sin nombre',
            email: data.correo || data.email || '',
            avatar: data.avatar || data.profilePicture || '👨‍🔧',
            role: data.puesto || data.role
          });
        });
        
        setMetrologos(metrologosList);
        console.log('Metrólogos cargados:', metrologosList);
      } catch (error) {
        console.error('Error fetching metrologos:', error);
        // Fallback en caso de error
        setMetrologos([
          { id: 'metro1', name: 'Ana García', email: 'ana@company.com', avatar: '👩‍🔧', role: 'Metrologo' },
          { id: 'metro2', name: 'Carlos López', email: 'carlos@company.com', avatar: '👨‍💼', role: 'Metrologo' },
          { id: 'metro3', name: 'María Rodríguez', email: 'maria@company.com', avatar: '👩‍💻', role: 'Metrologo' }
        ]);
      } finally {
        setLoadingMetrologos(false);
      }
    };

    fetchMetrologos();
  }, []);

  const handleNavigate = (key: string) => {
    if (key === 'friday-servicios') {
      navigateTo('friday-servicios'); // Navega a servicios
    } else if (key === 'friday') {
    }
  };

  // Función para transferir datos desde WorkSheetScreen
  const handleTransferFromWorksheet = useCallback((worksheetData: any[]) => {
    setIsTransferring(true);
    
    const processedData = worksheetData.map((item, index) => ({
      certificado: item.certificado || `CERT-${Date.now()}-${index}`,
      cliente: item.cliente || 'Cliente no especificado',
      id: item.id || `ID-${index + 1}`,
      equipo: item.equipo || 'Equipo no especificado',
      marca: item.marca || 'Marca no especificada',
      modelo: item.modelo || 'Modelo no especificado',
      serie: item.serie || 'Serie no especificada',
      lugarCalibracion: item.lugarCalibracion || 'laboratorio',
      status: 'pending' as const,
      priority: 'medium' as const,
      assignedTo: metrologos[0]?.id || '',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }));

    setGroups(prevGroups => {
      const newGroups = [...prevGroups];
      
      processedData.forEach(data => {
        const targetGroupIndex = data.lugarCalibracion === 'sitio' ? 0 : 1;
        newGroups[targetGroupIndex].rows.push(data);
      });
      
      return newGroups;
    });

    setIsTransferring(false);
    setShowTransferDialog(false);
  }, [metrologos]);

  // Función para filtrar datos
  const filteredGroups = useMemo(() => {
    return groups.map(group => {
      let filteredRows = [...group.rows];

      // Aplicar búsqueda
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredRows = filteredRows.filter(row =>
          Object.values(row).some(value =>
            String(value).toLowerCase().includes(query)
          )
        );
      }

      // Aplicar filtros específicos
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value.length > 0) {
          filteredRows = filteredRows.filter(row => {
            if (Array.isArray(value)) {
              return value.includes(row[key as keyof WorksheetData]);
            }
            return row[key as keyof WorksheetData] === value;
          });
        }
      });

      // Aplicar ordenamiento
      if (sortConfig) {
        filteredRows.sort((a, b) => {
          const aVal = a[sortConfig.key as keyof WorksheetData];
          const bVal = b[sortConfig.key as keyof WorksheetData];
          
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      return { ...group, rows: filteredRows };
    });
  }, [groups, searchQuery, filters, sortConfig]);

  // Función para manejar drag and drop
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (type === 'column') {
      const newColumnOrder = Array.from(columnOrder);
      const [removed] = newColumnOrder.splice(source.index, 1);
      newColumnOrder.splice(destination.index, 0, removed);
      setColumnOrder(newColumnOrder);
      return;
    }

    // Manejar drag de filas entre grupos
    const sourceGroupIndex = parseInt(source.droppableId.split('-')[1]);
    const destGroupIndex = parseInt(destination.droppableId.split('-')[1]);

    setGroups(prevGroups => {
      const newGroups = [...prevGroups];
      const [movedRow] = newGroups[sourceGroupIndex].rows.splice(source.index, 1);
      
      // Actualizar el lugar de calibración según el grupo destino
      movedRow.lugarCalibracion = destGroupIndex === 0 ? 'sitio' : 'laboratorio';
      movedRow.lastUpdated = new Date().toISOString();
      
      newGroups[destGroupIndex].rows.splice(destination.index, 0, movedRow);
      return newGroups;
    });
  };

  // Renderizado de celda
  const renderCell = (type: string, value: any, row: WorksheetData, column: Column) => {
    switch (type) {
      case 'status':
        const statusOption = STATUS_OPTIONS.find(opt => opt.value === value);
        return (
          <div 
            className="px-2 py-1 rounded-full text-xs font-medium text-white inline-block"
            style={{ backgroundColor: statusOption?.color || '#e2e5e9' }}
          >
            {statusOption?.label || 'Sin estado'}
          </div>
        );
        
      case 'priority':
        const priorityOption = PRIORITY_OPTIONS.find(opt => opt.value === value);
        return (
          <div 
            className="px-2 py-1 rounded-full text-xs font-medium text-white inline-block"
            style={{ backgroundColor: priorityOption?.color || '#e2e5e9' }}
          >
            {priorityOption?.label || 'Sin prioridad'}
          </div>
        );
        
      case 'person':
        const person = metrologos.find(p => p.id === value);
        return person ? (
          <div className="flex items-center space-x-2">
            <span className="text-lg">{person.avatar}</span>
            <span className="text-sm">{person.name}</span>
          </div>
        ) : (
          <span className="text-gray-400">No asignado</span>
        );
        
      case 'date':
        return value ? new Date(value).toLocaleDateString('es-ES') : '';
        
      case 'datetime':
        return value ? new Date(value).toLocaleDateString('es-ES', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : '';
        
      default:
        return <span className="text-sm">{value || ''}</span>;
    }
  };

  // Renderizado de editor
  const renderEditor = (column: Column, value: any, onChange: (val: any) => void, onSave: () => void) => {
    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onSave();
      } else if (e.key === 'Escape') {
        setEditCell(null);
      }
    };

    switch (column.type) {
      case 'status':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSave}
            autoFocus
            className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccionar estado</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
        
      case 'priority':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSave}
            autoFocus
            className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Seleccionar prioridad</option>
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
        
      case 'person':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSave}
            autoFocus
            className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loadingMetrologos}
          >
            <option value="">Sin asignar</option>
            {metrologos.map(metrologo => (
              <option key={metrologo.id} value={metrologo.id}>
                {metrologo.avatar} {metrologo.name}
              </option>
            ))}
          </select>
        );
        
      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onBlur={onSave}
            autoFocus
            className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
        
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onBlur={onSave}
            autoFocus
            className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
    }
  };

  // Componente de filtros
  const FilterPanel = () => (
    <div className="bg-white border-l border-gray-200 w-80 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Filtros</h3>
        <button
          onClick={() => setShowFilters(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>
      </div>
      
      {/* Filtro por estado */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
        <div className="space-y-2">
          {STATUS_OPTIONS.map(option => (
            <label key={option.value} className="flex items-center">
              <input
                type="checkbox"
                checked={filters.status?.includes(option.value) || false}
                onChange={(e) => {
                  const current = filters.status || [];
                  if (e.target.checked) {
                    setFilters(prev => ({ ...prev, status: [...current, option.value] }));
                  } else {
                    setFilters(prev => ({ ...prev, status: current.filter((s: string) => s !== option.value) }));
                  }
                }}
                className="mr-2"
              />
              <div 
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: option.color }}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Filtro por prioridad */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
        <div className="space-y-2">
          {PRIORITY_OPTIONS.map(option => (
            <label key={option.value} className="flex items-center">
              <input
                type="checkbox"
                checked={filters.priority?.includes(option.value) || false}
                onChange={(e) => {
                  const current = filters.priority || [];
                  if (e.target.checked) {
                    setFilters(prev => ({ ...prev, priority: [...current, option.value] }));
                  } else {
                    setFilters(prev => ({ ...prev, priority: current.filter((p: string) => p !== option.value) }));
                  }
                }}
                className="mr-2"
              />
              <div 
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: option.color }}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Filtro por metrólogo asignado */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Responsable</label>
        <div className="space-y-2">
          {metrologos.map(metrologo => (
            <label key={metrologo.id} className="flex items-center">
              <input
                type="checkbox"
                checked={filters.assignedTo?.includes(metrologo.id) || false}
                onChange={(e) => {
                  const current = filters.assignedTo || [];
                  if (e.target.checked) {
                    setFilters(prev => ({ ...prev, assignedTo: [...current, metrologo.id] }));
                  } else {
                    setFilters(prev => ({ ...prev, assignedTo: current.filter((a: string) => a !== metrologo.id) }));
                  }
                }}
                className="mr-2"
              />
              <span className="text-lg mr-2">{metrologo.avatar}</span>
              <span className="text-sm">{metrologo.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t">
        <button
          onClick={() => setFilters({})}
          className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded"
        >
          <RotateCcw size={16} className="inline mr-2" />
          Limpiar filtros
        </button>
      </div>
    </div>
  );

  // Funciones para la barra flotante de selección
  const handleDuplicateSelected = () => {
    console.log('Duplicar elementos seleccionados:', selectedRows);
    // Implementar lógica de duplicación
  };

  const handleExportSelected = () => {
    console.log('Exportar elementos seleccionados:', selectedRows);
    // Implementar lógica de exportación
  };

  const handleArchiveSelected = () => {
    console.log('Archivar elementos seleccionados:', selectedRows);
    // Implementar lógica de archivado
  };

  // CORREGIDO: Mejoré la función de eliminación
  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    
    if (window.confirm(`¿Estás seguro de que quieres eliminar ${selectedRows.length} elemento(s) seleccionado(s)?`)) {
      setGroups(prevGroups => {
        const newGroups = JSON.parse(JSON.stringify(prevGroups)); // Deep copy
        
        // Agrupar selecciones por grupo para procesarlas eficientemente
        const selectionsByGroup: { [key: number]: number[] } = {};
        selectedRows.forEach(({ gidx, ridx }) => {
          if (!selectionsByGroup[gidx]) {
            selectionsByGroup[gidx] = [];
          }
          selectionsByGroup[gidx].push(ridx);
        });
        
        // Eliminar filas de cada grupo, empezando por los índices más altos
        Object.entries(selectionsByGroup).forEach(([gidx, indices]) => {
          const groupIndex = parseInt(gidx);
          // Ordenar índices de mayor a menor para eliminar desde el final
          const sortedIndices = indices.sort((a, b) => b - a);
          
          sortedIndices.forEach(rowIndex => {
            if (newGroups[groupIndex] && newGroups[groupIndex].rows[rowIndex]) {
              newGroups[groupIndex].rows.splice(rowIndex, 1);
            }
          });
        });
        
        return newGroups;
      });
      
      setSelectedRows([]);
      console.log('Elementos eliminados correctamente');
    }
  };

  const handleConvertSelected = () => {
    console.log('Convertir elementos seleccionados:', selectedRows);
    // Implementar lógica de conversión
  };

  const handleMoveSelected = () => {
    console.log('Mover elementos seleccionados:', selectedRows);
    // Implementar lógica de movimiento
  };

  const handleAppsSelected = () => {
    console.log('Apps para elementos seleccionados:', selectedRows);
    // Implementar lógica de apps
  };

  // Componente de barra flotante de selección
  const FloatingSelectionBar = () => {
    if (selectedRows.length === 0) return null;

    return (
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-blue-600 text-white rounded-lg shadow-lg flex items-center px-4 py-3 space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-white text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
              {selectedRows.length}
            </div>
            <span className="text-sm font-medium">
              {selectedRows.length === 1 ? 'Elemento seleccionado' : 'Elementos seleccionados'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDuplicateSelected}
              className="p-2 hover:bg-blue-700 rounded transition-colors"
              title="Duplicar"
            >
              <Copy size={16} />
            </button>
            
            <button
              onClick={handleExportSelected}
              className="p-2 hover:bg-blue-700 rounded transition-colors"
              title="Exportar"
            >
              <Download size={16} />
            </button>
            
            <button
              onClick={handleArchiveSelected}
              className="p-2 hover:bg-blue-700 rounded transition-colors"
              title="Archivar"
            >
              <Archive size={16} />
            </button>
            
            <button
              onClick={handleDeleteSelected}
              className="p-2 hover:bg-red-600 rounded transition-colors"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
            
            <button
              onClick={handleConvertSelected}
              className="p-2 hover:bg-blue-700 rounded transition-colors"
              title="Convertir"
            >
              <RotateCcw size={16} />
            </button>
            
            <button
              onClick={handleMoveSelected}
              className="p-2 hover:bg-blue-700 rounded transition-colors"
              title="Mover"
            >
              <Move size={16} />
            </button>
            
            <button
              onClick={handleAppsSelected}
              className="p-2 hover:bg-blue-700 rounded transition-colors"
              title="Apps"
            >
              <Grid size={16} />
            </button>
          </div>

          <button
            onClick={() => setSelectedRows([])}
            className="p-2 hover:bg-blue-700 rounded transition-colors"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <SidebarFriday />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigateTo('worksheet')}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft size={20} className="mr-2" />
                Volver a Hoja de Trabajo
              </button>
              <div className="border-l border-gray-300 h-6"></div>
              <h1 className="text-2xl font-bold text-gray-900">Friday - Gestión de Calibraciones</h1>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowTransferDialog(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
              >
                <Upload size={16} className="mr-2" />
                Transferir desde Worksheet
              </button>
              <button className="p-2 text-gray-600 hover:text-gray-900">
                <Settings size={20} />
              </button>
            </div>
          </div>

          {/* Barra de herramientas */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center space-x-4">
              {/* Búsqueda */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar en todas las columnas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Filtros */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={clsx(
                  "flex items-center px-3 py-2 rounded border",
                  showFilters 
                    ? "bg-blue-50 text-blue-700 border-blue-200" 
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
              >
                <Filter size={16} className="mr-2" />
                Filtros
                {Object.keys(filters).length > 0 && (
                  <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {Object.keys(filters).length}
                  </span>
                )}
              </button>

              {/* Ordenar */}
              <div className="relative">
                <button
                  onClick={() => {
                    // Toggle menu de ordenamiento
                  }}
                  className="flex items-center px-3 py-2 border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
                >
                  <SortAsc size={16} className="mr-2" />
                  Ordenar
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Selección de vista */}
              <div className="flex border border-gray-300 rounded">
                <button
                  onClick={() => setViewMode('table')}
                  className={clsx(
                    "px-3 py-2 text-sm",
                    viewMode === 'table' 
                      ? "bg-blue-600 text-white" 
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Grid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  className={clsx(
                    "px-3 py-2 text-sm border-l border-gray-300",
                    viewMode === 'kanban' 
                      ? "bg-blue-600 text-white" 
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Columns size={16} />
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={clsx(
                    "px-3 py-2 text-sm border-l border-gray-300",
                    viewMode === 'calendar' 
                      ? "bg-blue-600 text-white" 
                      : "bg-white text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Calendar size={16} />
                </button>
              </div>

              {/* Estadísticas */}
              <div className="text-sm text-gray-600">
                {filteredGroups.reduce((acc, group) => acc + group.rows.length, 0)} elementos
              </div>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="p-6">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
                  <TabsList className="grid w-full grid-cols-3 max-w-md">
                    <TabsTrigger value="all">Todos</TabsTrigger>
                    <TabsTrigger value="sitio">En Sitio</TabsTrigger>
                    <TabsTrigger value="laboratorio">Laboratorio</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="space-y-6">
                    {filteredGroups.map((group, gidx) => (
                      <GroupTable 
                        key={group.id} 
                        group={group} 
                        gidx={gidx} 
                        columns={columns}
                        columnOrder={columnOrder}
                        selectedRows={selectedRows}
                        editCell={editCell}
                        editValue={editValue}
                        setEditCell={setEditCell}
                        setEditValue={setEditValue}
                        setSelectedRows={setSelectedRows}
                        setGroups={setGroups}
                        setSaveTick={setSaveTick}
                        renderCell={renderCell}
                        renderEditor={renderEditor}
                        openColMenuKey={openColMenuKey}
                        setOpenColMenuKey={setOpenColMenuKey}
                        sortConfig={sortConfig}
                        setSortConfig={setSortConfig}
                      />
                    ))}
                  </TabsContent>

                  <TabsContent value="sitio">
                    {filteredGroups.filter(g => g.id === 'sitio').map((group, gidx) => (
                      <GroupTable 
                        key={group.id} 
                        group={group} 
                        gidx={0} 
                        columns={columns}
                        columnOrder={columnOrder}
                        selectedRows={selectedRows}
                        editCell={editCell}
                        editValue={editValue}
                        setEditCell={setEditCell}
                        setEditValue={setEditValue}
                        setSelectedRows={setSelectedRows}
                        setGroups={setGroups}
                        setSaveTick={setSaveTick}
                        renderCell={renderCell}
                        renderEditor={renderEditor}
                        openColMenuKey={openColMenuKey}
                        setOpenColMenuKey={setOpenColMenuKey}
                        sortConfig={sortConfig}
                        setSortConfig={setSortConfig}
                      />
                    ))}
                  </TabsContent>

                  <TabsContent value="laboratorio">
                    {filteredGroups.filter(g => g.id === 'laboratorio').map((group, gidx) => (
                      <GroupTable 
                        key={group.id} 
                        group={group} 
                        gidx={1} 
                        columns={columns}
                        columnOrder={columnOrder}
                        selectedRows={selectedRows}
                        editCell={editCell}
                        editValue={editValue}
                        setEditCell={setEditCell}
                        setEditValue={setEditValue}
                        setSelectedRows={setSelectedRows}
                        setGroups={setGroups}
                        setSaveTick={setSaveTick}
                        renderCell={renderCell}
                        renderEditor={renderEditor}
                        openColMenuKey={openColMenuKey}
                        setOpenColMenuKey={setOpenColMenuKey}
                        sortConfig={sortConfig}
                        setSortConfig={setSortConfig}
                      />
                    ))}
                  </TabsContent>
                </Tabs>
              </div>
            </DragDropContext>
          </div>

          {/* Panel de filtros */}
          {showFilters && <FilterPanel />}
        </div>
      </div>

      {/* Barra flotante de selección */}
      <FloatingSelectionBar />

      {/* Diálogo de transferencia */}
      {showTransferDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Transferir desde Hoja de Trabajo
            </h3>
            <p className="text-gray-600 mb-6">
              Esta función transferirá los datos de calibración desde WorkSheetScreen, 
              organizándolos automáticamente en los grupos "Sitio" y "Laboratorio" 
              según el lugar de calibración especificado.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowTransferDialog(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                disabled={isTransferring}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  // Simular datos de ejemplo para demostración
                  const sampleData = [
                    {
                      certificado: 'CERT-2025-001',
                      cliente: 'Empresa ABC',
                      id: 'EQ-001',
                      equipo: 'Balanza Analítica',
                      marca: 'Sartorius',
                      modelo: 'XS225A',
                      serie: '12345678',
                      lugarCalibracion: 'laboratorio'
                    },
                    {
                      certificado: 'CERT-2025-002',
                      cliente: 'Industrias XYZ',
                      id: 'EQ-002',
                      equipo: 'Termómetro Digital',
                      marca: 'Fluke',
                      modelo: '1523',
                      serie: '87654321',
                      lugarCalibracion: 'sitio'
                    }
                  ];
                  handleTransferFromWorksheet(sampleData);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={isTransferring}
              >
                {isTransferring ? 'Transfiriendo...' : 'Transferir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente para tabla de grupos
interface GroupTableProps {
  group: Group;
  gidx: number;
  columns: Column[];
  columnOrder: string[];
  selectedRows: Array<{gidx: number, ridx: number}>;
  editCell: {gidx: number, ridx: number, colKey: string} | null;
  editValue: any;
  setEditCell: (cell: {gidx: number, ridx: number, colKey: string} | null) => void;
  setEditValue: (value: any) => void;
  setSelectedRows: React.Dispatch<React.SetStateAction<Array<{gidx: number, ridx: number}>>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setSaveTick: React.Dispatch<React.SetStateAction<number>>;
  renderCell: (type: string, value: any, row: WorksheetData, column: Column) => React.ReactNode;
  renderEditor: (column: Column, value: any, onChange: (val: any) => void, onSave: () => void) => React.ReactNode;
  openColMenuKey: string | null;
  setOpenColMenuKey: (key: string | null) => void;
  sortConfig: {key: string, direction: 'asc' | 'desc'} | null;
  setSortConfig: (config: {key: string, direction: 'asc' | 'desc'} | null) => void;
}

const GroupTable: React.FC<GroupTableProps> = ({
  group, gidx, columns, columnOrder, selectedRows, editCell, editValue,
  setEditCell, setEditValue, setSelectedRows, setGroups, setSaveTick,
  renderCell, renderEditor, openColMenuKey, setOpenColMenuKey, sortConfig, setSortConfig
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header del grupo */}
      <div 
        className="px-4 py-3 border-b border-gray-200 flex items-center justify-between"
        style={{ borderLeftColor: group.color, borderLeftWidth: '4px' }}
      >
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setGroups(prevGroups => {
                const newGroups = [...prevGroups];
                newGroups[gidx].collapsed = !newGroups[gidx].collapsed;
                return newGroups;
              });
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            {group.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <h3 className="font-semibold text-gray-900">{group.name}</h3>
          <span 
            className="px-2 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: group.color }}
          >
            {group.rows.length} elementos
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              // Agregar nueva fila al grupo
              const newRow: WorksheetData = {
                certificado: '',
                cliente: '',
                id: '',
                equipo: '',
                marca: '',
                modelo: '',
                serie: '',
                lugarCalibracion: group.id === 'sitio' ? 'sitio' : 'laboratorio',
                status: 'pending',
                priority: 'medium',
                assignedTo: '',
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
              };

              setGroups(prevGroups => {
                const newGroups = [...prevGroups];
                newGroups[gidx].rows.push(newRow);
                return newGroups;
              });
            }}
            className="p-1 text-gray-500 hover:text-gray-700"
          >
            <Plus size={16} />
          </button>
          <button className="p-1 text-gray-500 hover:text-gray-700">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Tabla */}
      {!group.collapsed && (
        <Droppable droppableId={`group-${gidx}`} type="row">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  {/* Header de tabla */}
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newSelections = group.rows.map((_, ridx) => ({ gidx, ridx }));
                              setSelectedRows(prev => {
                                // Remover selecciones existentes de este grupo y agregar las nuevas
                                const filtered = prev.filter(sel => sel.gidx !== gidx);
                                return [...filtered, ...newSelections];
                              });
                            } else {
                              setSelectedRows(prev => prev.filter(sel => sel.gidx !== gidx));
                            }
                          }}
                          // CORREGIDO: Mejoré la lógica para mostrar el estado del checkbox del grupo
                          checked={group.rows.length > 0 && group.rows.every((_, ridx) => 
                            selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx)
                          )}
                          className="w-4 h-4 accent-blue-600 rounded"
                        />
                      </th>
                      {columnOrder.map((key) => {
                        const col = columns.find(c => c.key === key);
                        if (!col || col.hidden) return null;
                        
                        return (
                          <Draggable key={col.key} draggableId={`column-${col.key}`} index={columnOrder.indexOf(col.key)} type="column">
                            {(provided, snapshot) => (
                              <th
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider relative group"
                                style={{ 
                                  minWidth: col.width,
                                  ...provided.draggableProps.style
                                }}
                              >
                                <div className="flex items-center space-x-2">
                                  <span>{col.label}</span>
                                  {col.sortable && (
                                    <button
                                      onClick={() => {
                                        if (sortConfig?.key === col.key) {
                                          setSortConfig(sortConfig.direction === 'asc' 
                                            ? { key: col.key, direction: 'desc' }
                                            : null
                                          );
                                        } else {
                                          setSortConfig({ key: col.key, direction: 'asc' });
                                        }
                                      }}
                                      className="text-gray-400 hover:text-gray-600"
                                    >
                                      {sortConfig?.key === col.key ? (
                                        sortConfig.direction === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />
                                      ) : (
                                        <SortAsc size={14} />
                                      )}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setOpenColMenuKey(openColMenuKey === col.key ? null : col.key)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
                                  >
                                    <ChevronDown size={14} />
                                  </button>
                                </div>
                                
                                {/* Menu de columna */}
                                {openColMenuKey === col.key && (
                                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10">
                                    <button 
                                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                      onClick={() => {
                                        setGroups(prevGroups => {
                                          const newGroups = [...prevGroups];
                                          // Lógica para ordenar por esta columna
                                          return newGroups;
                                        });
                                        setOpenColMenuKey(null);
                                      }}
                                    >
                                      Ordenar A → Z
                                    </button>
                                    <button 
                                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                      onClick={() => setOpenColMenuKey(null)}
                                    >
                                      Filtrar por {col.label}
                                    </button>
                                    <button 
                                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                      onClick={() => {
                                        setColumns(prev => prev.map(c => 
                                          c.key === col.key ? { ...c, hidden: true } : c
                                        ));
                                        setOpenColMenuKey(null);
                                      }}
                                    >
                                      Ocultar columna
                                    </button>
                                  </div>
                                )}
                              </th>
                            )}
                          </Draggable>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* Body de tabla */}
                  <tbody>
                    {group.rows.map((row, ridx) => (
                      <Draggable key={`${gidx}-${ridx}-${row.certificado || ridx}`} draggableId={`row-${gidx}-${ridx}`} index={ridx}>
                        {(provided, snapshot) => (
                          <tr
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={clsx(
                              "border-b border-gray-100 hover:bg-gray-50",
                              snapshot.isDragging && "bg-blue-50 shadow-lg",
                              selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx) && "bg-blue-50"
                            )}
                          >
                            <td className="w-12 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx)}
                                onChange={(e) => {
                                  e.stopPropagation(); // Prevenir que se active el drag
                                  const isSelected = selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx);
                                  if (isSelected) {
                                    setSelectedRows(prev => prev.filter(sel => !(sel.gidx === gidx && sel.ridx === ridx)));
                                  } else {
                                    setSelectedRows(prev => [...prev, { gidx, ridx }]);
                                  }
                                }}
                                className="w-4 h-4 accent-blue-600 rounded"
                              />
                            </td>
                            {columnOrder.map((key) => {
                              const col = columns.find(c => c.key === key);
                              if (!col || col.hidden) return null;
                              
                              const isEditing = editCell && editCell.gidx === gidx && editCell.ridx === ridx && editCell.colKey === col.key;
                              
                              return (
                                <td
                                  key={col.key}
                                  className="px-4 py-3 text-sm text-gray-900"
                                  style={{ minWidth: col.width }}
                                >
                                  {isEditing ? (
                                    renderEditor(col, editValue, setEditValue, () => {
                                      setGroups(prevGroups => {
                                        const newGroups = [...prevGroups];
                                        newGroups[gidx].rows[ridx][col.key as keyof WorksheetData] = editValue as never;
                                        newGroups[gidx].rows[ridx].lastUpdated = new Date().toISOString();
                                        return newGroups;
                                      });
                                      setEditCell(null);
                                      setSaveTick(prev => prev + 1);
                                    })
                                  ) : (
                                    <div
                                      onClick={() => {
                                        if (!['auto_number', 'creation_log', 'last_updated'].includes(col.type)) {
                                          setEditCell({ gidx, ridx, colKey: col.key });
                                          setEditValue(row[col.key as keyof WorksheetData] ?? '');
                                        }
                                      }}
                                      className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1"
                                    >
                                      {renderCell(col.type, row[col.key as keyof WorksheetData], row, col)}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Droppable>
      )}
    </div>
  );
};

export default FridayScreen;
