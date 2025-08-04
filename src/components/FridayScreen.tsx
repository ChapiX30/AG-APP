import React, { useState, useEffect } from "react";
import { 
  Plus, 
  MoreVertical, 
  ArrowLeft, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight, 
  X, 
  Pencil, 
  Trash2, 
  ListChecks, 
  File, 
  Tag, 
  Users, 
  CheckCircle, 
  Copy, 
  Download, 
  Archive, 
  Move, 
  Calendar, 
  Hash,
  Menu,
  Star,
  Eye,
  Settings,
  Zap,
  Target,
  Clock,
  AlertCircle
} from "lucide-react";
import clsx from "clsx";
import { useNavigation } from "../hooks/useNavigation";
import SidebarFriday from "./SidebarFriday";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

// Categorías y tipos de columna estilo Monday
const COLUMN_TYPE_CATEGORIES = [
  {
    label: "Esenciales",
    types: [
      { key: "status", icon: <Target size={18} className="text-green-500" />, label: "Estado", description: "Seguimiento del progreso" },
      { key: "text", icon: <Tag size={18} className="text-blue-400" />, label: "Texto", description: "Información general" },
      { key: "person", icon: <Users size={18} className="text-purple-400" />, label: "Personas", description: "Asignación de responsables" },
      { key: "dropdown", icon: <ChevronDown size={18} className="text-orange-400" />, label: "Selección", description: "Opciones predefinidas" },
      { key: "date", icon: <Calendar size={18} className="text-pink-400" />, label: "Fecha", description: "Fechas importantes" },
      { key: "number", icon: <Hash size={18} className="text-cyan-400" />, label: "Números", description: "Valores numéricos" },
    ]
  },
  {
    label: "Avanzadas",
    types: [
      { key: "file", icon: <File size={18} className="text-red-400" />, label: "Archivo", description: "Documentos adjuntos" },
      { key: "checkbox", icon: <CheckCircle size={18} className="text-emerald-500" />, label: "Casilla", description: "Verificación simple" },
      { key: "priority", icon: <AlertCircle size={18} className="text-yellow-500" />, label: "Prioridad", description: "Nivel de importancia" },
      { key: "progress", icon: <Zap size={18} className="text-indigo-500" />, label: "Progreso", description: "Porcentaje completado" },
    ]
  }
];

const LOCAL_KEY = "friday_tablero_v6";

const GROUP_COLORS = [
  { bg: "bg-gradient-to-r from-blue-500/20 to-cyan-500/20", border: "border-l-4 border-blue-500", text: "text-blue-400" },
  { bg: "bg-gradient-to-r from-purple-500/20 to-pink-500/20", border: "border-l-4 border-purple-500", text: "text-purple-400" },
  { bg: "bg-gradient-to-r from-emerald-500/20 to-green-500/20", border: "border-l-4 border-emerald-500", text: "text-emerald-400" },
  { bg: "bg-gradient-to-r from-orange-500/20 to-red-500/20", border: "border-l-4 border-orange-500", text: "text-orange-400" },
  { bg: "bg-gradient-to-r from-yellow-500/20 to-amber-500/20", border: "border-l-4 border-yellow-500", text: "text-yellow-400" },
];

const STATUS_OPTIONS = [
  { value: "No iniciado", color: "bg-slate-500 text-white", icon: "⏸️" },
  { value: "En proceso", color: "bg-blue-600 text-white", icon: "🔄" },
  { value: "Finalizado", color: "bg-emerald-500 text-white", icon: "✅" },
  { value: "En revisión", color: "bg-yellow-500 text-gray-900", icon: "👁️" },
  { value: "Bloqueado", color: "bg-red-500 text-white", icon: "🚫" },
];

const PRIORITY_OPTIONS = [
  { value: "Baja", color: "bg-green-500 text-white", icon: "⬇️" },
  { value: "Media", color: "bg-yellow-500 text-gray-900", icon: "➡️" },
  { value: "Alta", color: "bg-orange-500 text-white", icon: "⬆️" },
  { value: "Crítica", color: "bg-red-500 text-white", icon: "🔥" },
];

const DROPDOWN_OPTIONS = [
  { value: "Mecánica", color: "bg-pink-500 text-white" },
  { value: "Eléctrica", color: "bg-green-500 text-white" },
  { value: "Dimensional", color: "bg-orange-400 text-white" },
  { value: "Calidad", color: "bg-cyan-600 text-white" },
  { value: "Software", color: "bg-purple-500 text-white" },
  { value: "Otro", color: "bg-gray-600 text-gray-200" },
];

const PEOPLE = [
  { id: "ana", name: "Ana Salas", color: "bg-gradient-to-br from-cyan-500 to-sky-400", initials: "AS", role: "Ingeniera" },
  { id: "juan", name: "Juan Pérez", color: "bg-gradient-to-br from-emerald-500 to-cyan-400", initials: "JP", role: "Técnico" },
  { id: "maria", name: "María González", color: "bg-gradient-to-br from-purple-500 to-pink-400", initials: "MG", role: "Supervisora" },
  { id: "carlos", name: "Carlos Ruiz", color: "bg-gradient-to-br from-orange-500 to-red-400", initials: "CR", role: "Analista" },
];

function renderCell(type, value) {
  if (type === "status") {
    const opt = STATUS_OPTIONS.find(x => x.value === value) || STATUS_OPTIONS[0];
    return (
      <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-xs shadow-sm", opt.color)}>
        <span>{opt.icon}</span>
        <span>{value || "No iniciado"}</span>
      </div>
    );
  }
  
  if (type === "priority") {
    const opt = PRIORITY_OPTIONS.find(x => x.value === value) || PRIORITY_OPTIONS[0];
    return (
      <div className={clsx("inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-xs shadow-sm", opt.color)}>
        <span>{opt.icon}</span>
        <span>{value || "Baja"}</span>
      </div>
    );
  }
  
  if (type === "dropdown") {
    const opt = DROPDOWN_OPTIONS.find(x => x.value === value);
    if (!opt) return <span className="text-slate-400">Sin asignar</span>;
    return (
      <div className={clsx("inline-flex items-center px-3 py-1.5 rounded-full font-semibold text-xs shadow-sm", opt.color)}>
        {value}
      </div>
    );
  }
  
  if (type === "person") {
    const user = PEOPLE.find(u => u.id === value);
    if (!user) return <span className="text-slate-400">Sin asignar</span>;
    return (
      <div className="inline-flex items-center gap-2">
        <div className={clsx("w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ring-2 ring-white/20", user.color)}>
          {user.initials}
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{user.name}</span>
          <span className="text-xs text-slate-400">{user.role}</span>
        </div>
      </div>
    );
  }
  
  if (type === "checkbox") {
    return (
      <div className="flex items-center">
        <input 
          type="checkbox" 
          checked={!!value} 
          disabled 
          className="w-5 h-5 accent-emerald-500 rounded" 
        />
      </div>
    );
  }
  
  if (type === "progress") {
    const progress = Math.min(100, Math.max(0, parseInt(value) || 0));
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-300 min-w-[35px]">{progress}%</span>
      </div>
    );
  }
  
  if (type === "file") {
    return (
      <div className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 cursor-pointer">
        <File size={16} />
        <span className="text-sm">Archivo</span>
      </div>
    );
  }
  
  if (type === "date") {
    if (!value) return <span className="text-slate-400">Sin fecha</span>;
    const d = new Date(value);
    if (isNaN(+d)) return <span className="text-slate-400">Fecha inválida</span>;
    
    const today = new Date();
    const isOverdue = d < today;
    const isToday = d.toDateString() === today.toDateString();
    
    return (
      <div className={clsx(
        "inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium",
        isOverdue ? "bg-red-500/20 text-red-400" : 
        isToday ? "bg-yellow-500/20 text-yellow-400" : 
        "bg-slate-600/50 text-slate-300"
      )}>
        <Calendar size={14} />
        <span>{d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      </div>
    );
  }
  
  if (type === "number") {
    return (
      <span className="font-mono text-sm font-semibold text-slate-200">
        {value || "0"}
      </span>
    );
  }
  
  return (
    <span className="text-sm text-slate-200">
      {value || ""}
    </span>
  );
}

// Modal mejorado con animaciones
function GlassModal({ open, onClose, children, title }) {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/50 min-w-[90vw] max-w-lg w-full mx-4 animate-slideUp">
        <div className="flex items-center justify-between p-6 border-b border-slate-600/50">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function FridayScreen() {
  // Estados principales
  const [columns, setColumns] = useState(() => {
    const d = localStorage.getItem(LOCAL_KEY);
    if (d) try { return JSON.parse(d).columns || []; } catch { }
    return [
      { label: "FOLIO", key: "folio", type: "number", width: 100 },
      { label: "EQUIPO", key: "equipo", type: "text", width: 200 },
      { label: "RESPONSABLE", key: "responsable", type: "person", width: 180 },
      { label: "ESTADO", key: "estado", type: "status", width: 140 },
      { label: "PRIORIDAD", key: "prioridad", type: "priority", width: 120 },
      { label: "PROGRESO", key: "progreso", type: "progress", width: 150 },
      { label: "FECHA LÍMITE", key: "fecha_limite", type: "date", width: 130 },
    ];
  });
  
  const [groups, setGroups] = useState(() => {
    const d = localStorage.getItem(LOCAL_KEY);
    if (d) try { return JSON.parse(d).groups || []; } catch { }
    return [
      {
        id: "g1",
        name: "🔧 Mantenimiento Preventivo",
        colorIdx: 0,
        collapsed: false,
        rows: [
          {
            id: "r1", 
            folio: "MP-001", 
            equipo: "Compresor Principal A1", 
            responsable: "ana",
            estado: "En proceso", 
            prioridad: "Alta",
            progreso: "75",
            fecha_limite: "2025-01-15"
          },
          {
            id: "r2", 
            folio: "MP-002", 
            equipo: "Bomba Centrífuga B2", 
            responsable: "juan",
            estado: "Finalizado", 
            prioridad: "Media",
            progreso: "100",
            fecha_limite: "2025-01-10"
          }
        ]
      },
      {
        id: "g2",
        name: "⚡ Reparaciones Urgentes",
        colorIdx: 1,
        collapsed: false,
        rows: [
          {
            id: "r3", 
            folio: "RU-001", 
            equipo: "Motor Eléctrico C3", 
            responsable: "maria",
            estado: "Bloqueado", 
            prioridad: "Crítica",
            progreso: "25",
            fecha_limite: "2025-01-12"
          }
        ]
      }
    ];
  });

  // Estados UI
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showColType, setShowColType] = useState("text");
  const [colNameInput, setColNameInput] = useState("");
  const [search, setSearch] = useState("");
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const { currentScreen, navigateTo } = useNavigation();
  const [openColMenuKey, setOpenColMenuKey] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [viewMode, setViewMode] = useState("table"); // table, kanban, calendar

  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ columns, groups }));
  }, [columns, groups]);

  // Cerrar menús al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenColMenuKey(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Modal agregar columna mejorado
  function ModalAddColumn() {
    const [colSearch, setColSearch] = useState("");
    const [selectedType, setSelectedType] = useState(null);
    
    const filteredCategories = COLUMN_TYPE_CATEGORIES.map(category => ({
      ...category,
      types: category.types.filter(type => 
        !colSearch || 
        type.label.toLowerCase().includes(colSearch.toLowerCase()) ||
        type.description.toLowerCase().includes(colSearch.toLowerCase())
      )
    })).filter(category => category.types.length > 0);

    return (
      <GlassModal 
        open={showAddColModal} 
        onClose={() => setShowAddColModal(false)}
        title="Agregar nueva columna"
      >
        <div className="space-y-6">
          {/* Búsqueda */}
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              placeholder="Buscar tipo de columna..."
              value={colSearch}
              onChange={e => setColSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Tipos de columna */}
          <div className="max-h-80 overflow-y-auto space-y-4">
            {filteredCategories.map(category => (
              <div key={category.label}>
                <h4 className="font-semibold text-sm text-slate-300 uppercase tracking-wider mb-3">
                  {category.label}
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {category.types.map(type => (
                    <button
                      key={type.key}
                      className={clsx(
                        "flex items-start gap-3 p-4 rounded-xl border transition-all text-left",
                        selectedType === type.key
                          ? "bg-blue-600/20 border-blue-500 ring-2 ring-blue-500/30"
                          : "bg-slate-700/30 border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500"
                      )}
                      onClick={() => {
                        setSelectedType(type.key);
                        setShowColType(type.key);
                      }}
                    >
                      <div className="mt-0.5">{type.icon}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-white text-sm">{type.label}</div>
                        <div className="text-xs text-slate-400 mt-1">{type.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Nombre de columna */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Nombre de la columna
            </label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              value={colNameInput}
              onChange={e => setColNameInput(e.target.value)}
              placeholder="Ej: Cliente, Serie, Observaciones..."
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              className="flex-1 px-4 py-3 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all"
              onClick={() => {
                setShowAddColModal(false);
                setColNameInput("");
                setSelectedType(null);
              }}
            >
              Cancelar
            </button>
            <button
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!colNameInput.trim() || !selectedType}
              onClick={() => {
                if (!colNameInput.trim() || !selectedType) return;
                const field = colNameInput.trim().toLowerCase().replace(/\s+/g, "_");
                setColumns(cols => [...cols, { 
                  label: colNameInput.trim().toUpperCase(), 
                  key: field, 
                  type: selectedType, 
                  width: 150 
                }]);
                setShowAddColModal(false);
                setColNameInput("");
                setSelectedType(null);
              }}
            >
              Agregar columna
            </button>
          </div>
        </div>
      </GlassModal>
    );
  }

  // Modal agregar grupo mejorado
  function ModalAddGroup() {
    const [grpName, setGrpName] = useState("");
    const [grpIcon, setGrpIcon] = useState("📁");
    
    const icons = ["📁", "🔧", "⚡", "🎯", "📊", "🚀", "💡", "🔥", "⭐", "🎨"];
    
    return (
      <GlassModal 
        open={showAddGroupModal} 
        onClose={() => setShowAddGroupModal(false)}
        title="Crear nuevo grupo"
      >
        <div className="space-y-6">
          {/* Icono */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-3">
              Icono del grupo
            </label>
            <div className="grid grid-cols-5 gap-2">
              {icons.map(icon => (
                <button
                  key={icon}
                  className={clsx(
                    "w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl transition-all",
                    grpIcon === icon 
                      ? "border-blue-500 bg-blue-600/20" 
                      : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/50"
                  )}
                  onClick={() => setGrpIcon(icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          
          {/* Nombre */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Nombre del grupo
            </label>
            <input 
              className="w-full px-4 py-3 rounded-xl border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              placeholder="Ej: Proyectos Q1, Tareas urgentes..."
              value={grpName}
              onChange={e => setGrpName(e.target.value)}
              autoFocus
            />
          </div>
          
          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setShowAddGroupModal(false)}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                if (grpName.trim()) {
                  setGroups(gs => [
                    ...gs,
                    {
                      id: "g" + Math.random().toString(36).slice(2, 8),
                      name: `${grpIcon} ${grpName.trim()}`,
                      colorIdx: gs.length % GROUP_COLORS.length,
                      collapsed: false,
                      rows: [],
                    }
                  ]);
                  setShowAddGroupModal(false);
                  setGrpName("");
                  setGrpIcon("📁");
                }
              }}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50"
              disabled={!grpName.trim()}
            >
              Crear grupo
            </button>
          </div>
        </div>
      </GlassModal>
    );
  }

  // Función principal de renderizado de tabla
  function renderTable() {
    const filterRow = row =>
      (!search || columns.some(col => (row[col.key] + "").toLowerCase().includes(search.toLowerCase())));

    const onDragEnd = (result) => {
      if (!result.destination) return;
      
      if (result.type === "group") {
        const newGroups = Array.from(groups);
        const [removed] = newGroups.splice(result.source.index, 1);
        newGroups.splice(result.destination.index, 0, removed);
        setGroups(newGroups);
      }
      
      if (result.type === "row") {
        const gidx = +result.source.droppableId.replace("group-", "");
        const group = groups[gidx];
        const newRows = Array.from(group.rows);
        const [removed] = newRows.splice(result.source.index, 1);
        newRows.splice(result.destination.index, 0, removed);
        setGroups(gs => {
          const ngs = [...gs];
          ngs[gidx] = { ...ngs[gidx], rows: newRows };
          return ngs;
        });
      }
      
      if (result.type === "column") {
        const newCols = Array.from(columns);
        const [removed] = newCols.splice(result.source.index, 1);
        newCols.splice(result.destination.index, 0, removed);
        setColumns(newCols);
      }
    };

    const isSelected = (gidx, ridx) => selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx);
    const toggleRow = (gidx, ridx) => {
      setSelectedRows(prev => {
        const idx = prev.findIndex(sel => sel.gidx === gidx && sel.ridx === ridx);
        if (idx > -1) return prev.filter((_, i) => i !== idx);
        else return [...prev, { gidx, ridx }];
      });
    };

    return (
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="groups" type="group">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
              {groups.map((group, gidx) => (
                <Draggable draggableId={group.id} index={gidx} key={group.id}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} className="group-container">
                      {/* Header del grupo mejorado */}
                      <div className={clsx(
                        "flex items-center px-6 py-4 font-bold text-lg rounded-t-2xl backdrop-blur-sm border-b border-white/10",
                        GROUP_COLORS[group.colorIdx % GROUP_COLORS.length].bg,
                        GROUP_COLORS[group.colorIdx % GROUP_COLORS.length].border,
                        GROUP_COLORS[group.colorIdx % GROUP_COLORS.length].text
                      )}>
                        <span {...prov.dragHandleProps} className="cursor-grab pr-3 hover:scale-110 transition-transform">
                          {group.collapsed ? <ChevronRight size={24} /> : <ChevronDown size={24} />}
                        </span>
                        <button 
                          className="flex-1 text-left flex items-center gap-3" 
                          onClick={() => {
                            setGroups(gs => gs.map((g, i) => i === gidx ? { ...g, collapsed: !g.collapsed } : g));
                          }}
                        >
                          <span className="text-xl">{group.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                              {group.rows.length} elemento{group.rows.length !== 1 ? 's' : ''}
                            </span>
                            {group.rows.some(row => row.estado === "Bloqueado") && (
                              <span className="px-2 py-1 bg-red-500/30 rounded-full text-xs">
                                ⚠️ Bloqueados
                              </span>
                            )}
                          </div>
                        </button>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            className="p-2 rounded-lg hover:bg-white/10 transition-all"
                            onClick={() => {
                              const name = prompt("Nuevo nombre del grupo:", group.name);
                              if (name) setGroups(gs => gs.map((g, i) => i === gidx ? { ...g, name } : g));
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"
                            onClick={() => {
                              if (window.confirm("¿Eliminar este grupo y todo su contenido?")) {
                                setGroups(gs => gs.filter((_, i) => i !== gidx));
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button 
                            className="ml-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-2 transition-all shadow-lg"
                            onClick={() => {
                              setGroups(gs => gs.map((g, i) => i === gidx
                                ? { ...g, rows: [...g.rows, { 
                                    id: "r" + Math.random().toString(36).slice(2, 8),
                                    folio: `NEW-${String(g.rows.length + 1).padStart(3, '0')}`,
                                    estado: "No iniciado",
                                    prioridad: "Media",
                                    progreso: "0"
                                  }] }
                                : g));
                            }}
                          >
                            <Plus size={16} />
                            Nuevo elemento
                          </button>
                        </div>
                      </div>

                      {!group.collapsed && (
                        <Droppable droppableId={"group-" + gidx} type="row">
                          {(provRow) => (
                            <div ref={provRow.innerRef} {...provRow.droppableProps} 
                                 className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-b-2xl overflow-hidden shadow-2xl">
                              
                              {/* Tabla mejorada */}
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[1200px]">
                                  {/* Header de columnas */}
                                  <thead>
                                    <tr className="bg-slate-900/80 border-b border-slate-600/50">
                                      <th className="w-12 px-4 py-4">
                                        <input
                                          type="checkbox"
                                          className="w-4 h-4 accent-blue-500 rounded"
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              const newSelections = group.rows.map((_, ridx) => ({ gidx, ridx }));
                                              setSelectedRows(prev => [...prev, ...newSelections]);
                                            } else {
                                              setSelectedRows(prev => prev.filter(sel => sel.gidx !== gidx));
                                            }
                                          }}
                                        />
                                      </th>
                                      {columns.map((col, cidx) => (
                                        <th key={col.key} 
                                            className="text-left px-4 py-4 text-sm font-bold text-slate-200 uppercase tracking-wider relative group"
                                            style={{ minWidth: col.width }}>
                                          <div className="flex items-center gap-2">
                                            {COLUMN_TYPE_CATEGORIES.flatMap(x => x.types).find(x => x.key === col.type)?.icon}
                                            <span>{col.label}</span>
                                            <button 
                                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700/50 transition-all"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenColMenuKey(openColMenuKey === col.key ? null : col.key);
                                              }}
                                            >
                                              <MoreVertical size={14} />
                                            </button>
                                          </div>
                                          
                                          {/* Menú de columna mejorado */}
                                          {openColMenuKey === col.key && (
                                            <div className="absolute top-full left-0 z-50 w-48 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 mt-1 animate-slideDown">
                                              <button
                                                className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-700/50 text-sm transition-all"
                                                onClick={() => {
                                                  const name = prompt("Nuevo nombre:", col.label);
                                                  if (name) setColumns(cols => cols.map((c, i) => i === cidx ? { ...c, label: name.toUpperCase() } : c));
                                                  setOpenColMenuKey(null);
                                                }}
                                              >
                                                <Pencil size={16} className="text-blue-400" />
                                                <span>Renombrar</span>
                                              </button>
                                              <button
                                                className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-slate-700/50 text-sm transition-all"
                                                onClick={() => {
                                                  setColumns(cols => [
                                                    ...cols.slice(0, cidx + 1),
                                                    { ...col, key: col.key + "_copy", label: col.label + " (COPIA)" },
                                                    ...cols.slice(cidx + 1)
                                                  ]);
                                                  setOpenColMenuKey(null);
                                                }}
                                              >
                                                <Copy size={16} className="text-green-400" />
                                                <span>Duplicar</span>
                                              </button>
                                              <div className="h-px bg-slate-600 my-1" />
                                              <button
                                                className="flex items-center gap-3 px-3 py-2 w-full rounded-lg hover:bg-red-500/20 text-red-400 text-sm transition-all"
                                                onClick={() => {
                                                  if (window.confirm("¿Eliminar esta columna?")) {
                                                    setColumns(cols => cols.filter((_, i) => i !== cidx));
                                                  }
                                                  setOpenColMenuKey(null);
                                                }}
                                              >
                                                <Trash2 size={16} />
                                                <span>Eliminar</span>
                                              </button>
                                            </div>
                                          )}
                                        </th>
                                      ))}
                                      <th className="w-12"></th>
                                    </tr>
                                  </thead>
                                  
                                  {/* Filas */}
                                  <tbody>
                                    {group.rows.filter(filterRow).map((row, ridx) => (
                                      <Draggable draggableId={row.id} index={ridx} key={row.id}>
                                        {(provR) => (
                                          <tr ref={provR.innerRef} {...provR.draggableProps}
                                              className={clsx(
                                                "hover:bg-slate-700/30 transition-all border-b border-slate-700/30 group",
                                                isSelected(gidx, ridx) && "bg-blue-600/20 ring-2 ring-blue-500/30"
                                              )}>
                                            <td className="px-4 py-4">
                                              <input
                                                type="checkbox"
                                                checked={isSelected(gidx, ridx)}
                                                onChange={() => toggleRow(gidx, ridx)}
                                                className="w-4 h-4 accent-blue-500 rounded"
                                              />
                                            </td>
                                            {columns.map((col) => {
                                              const isEditing = editCell && editCell.gidx === gidx && editCell.ridx === ridx && editCell.colKey === col.key;
                                              
                                              if (isEditing) {
                                                return (
                                                  <td key={col.key} className="px-4 py-4">
                                                    {renderEditCell(col, editValue, setEditValue, () => {
                                                      setGroups(gs => {
                                                        const ngs = [...gs];
                                                        ngs[gidx].rows[ridx][col.key] = editValue;
                                                        return ngs;
                                                      });
                                                      setEditCell(null);
                                                    })}
                                                  </td>
                                                );
                                              }
                                              
                                              return (
                                                <td
                                                  key={col.key}
                                                  className="px-4 py-4 cursor-pointer hover:bg-slate-600/20 transition-all rounded-lg"
                                                  onClick={() => {
                                                    setEditCell({ gidx, ridx, colKey: col.key });
                                                    setEditValue(group.rows[ridx][col.key] || "");
                                                  }}
                                                >
                                                  {renderCell(col.type, group.rows[ridx][col.key])}
                                                </td>
                                              );
                                            })}
                                            <td className="px-4 py-4">
                                              <div {...provR.dragHandleProps} 
                                                   className="cursor-grab opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-slate-600/50 transition-all">
                                                <ListChecks size={16} className="text-slate-400" />
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </Draggable>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {provRow.placeholder}
                            </div>
                          )}
                        </Droppable>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        
        {/* Barra de acciones flotante mejorada */}
        {selectedRows.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur-xl border border-slate-600/50 rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-6 z-50 animate-slideUp">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {selectedRows.length}
              </div>
              <span className="text-white font-semibold">
                elemento{selectedRows.length > 1 ? 's' : ''} seleccionado{selectedRows.length > 1 ? 's' : ''}
              </span>
            </div>
            
            <div className="h-6 w-px bg-slate-600" />
            
            <div className="flex items-center gap-4">
              {[
                { icon: Copy, label: "Duplicar", color: "hover:text-blue-400" },
                { icon: Download, label: "Exportar", color: "hover:text-green-400" },
                { icon: Archive, label: "Archivar", color: "hover:text-yellow-400" },
                { icon: Move, label: "Mover", color: "hover:text-purple-400" },
              ].map(({ icon: Icon, label, color }) => (
                <button key={label} className={clsx("flex flex-col items-center gap-1 text-slate-300 transition-all", color)} title={label}>
                  <Icon size={20} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
              
              <button 
                className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300 transition-all" 
                title="Eliminar"
                onClick={() => {
                  if (window.confirm(`¿Eliminar ${selectedRows.length} elemento${selectedRows.length > 1 ? 's' : ''}?`)) {
                    setGroups(gs => gs.map((g, gidx) => ({
                      ...g,
                      rows: g.rows.filter((_, ridx) => !selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx))
                    })));
                    setSelectedRows([]);
                  }
                }}
              >
                <Trash2 size={20} />
                <span className="text-xs font-medium">Eliminar</span>
              </button>
            </div>
            
            <button 
              className="ml-4 p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all" 
              onClick={() => setSelectedRows([])}
            >
              <X size={20} />
            </button>
          </div>
        )}
      </DragDropContext>
    );
  }

  // Función para renderizar celdas editables
  function renderEditCell(col, value, setValue, onSave) {
    const commonProps = {
      autoFocus: true,
      onBlur: onSave,
      onKeyDown: (e) => e.key === 'Enter' && onSave(),
      className: "w-full px-3 py-2 rounded-lg border border-slate-500 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
    };

    switch (col.type) {
      case "status":
        return (
          <select {...commonProps} value={value} onChange={e => setValue(e.target.value)}>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.value}</option>
            ))}
          </select>
        );
      
      case "priority":
        return (
          <select {...commonProps} value={value} onChange={e => setValue(e.target.value)}>
            {PRIORITY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.value}</option>
            ))}
          </select>
        );
      
      case "dropdown":
        return (
          <select {...commonProps} value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Sin asignar</option>
            {DROPDOWN_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.value}</option>
            ))}
          </select>
        );
      
      case "person":
        return (
          <select {...commonProps} value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Sin asignar</option>
            {PEOPLE.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        );
      
      case "checkbox":
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => setValue(e.target.checked)}
            onBlur={onSave}
            className="w-5 h-5 accent-blue-500 rounded"
            autoFocus
          />
        );
      
      case "date":
        return (
          <input
            {...commonProps}
            type="date"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        );
      
      case "number":
      case "progress":
        return (
          <input
            {...commonProps}
            type="number"
            min={col.type === "progress" ? "0" : undefined}
            max={col.type === "progress" ? "100" : undefined}
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        );
      
      default:
        return (
          <input
            {...commonProps}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
        );
    }
  }

  return (
    <div className="flex bg-slate-950 min-h-screen font-sans">
      {/* Sidebar fijo en desktop */}
      <div className="hidden md:block">
        <SidebarFriday active={currentScreen} onNavigate={navigateTo} />
      </div>
      
      {/* Sidebar móvil */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex md:hidden">
          <div className="bg-slate-900 w-64 h-full shadow-2xl">
            <SidebarFriday active={currentScreen} onNavigate={(scr) => { setShowMobileSidebar(false); navigateTo(scr); }} />
          </div>
          <div className="flex-1" onClick={() => setShowMobileSidebar(false)} />
        </div>
      )}
      
      {/* Área principal */}
      <div className="flex-1 md:ml-[235px] min-h-screen">
        <div className="bg-slate-950 min-h-screen text-white">
          {/* Header mejorado */}
          <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50">
            {/* Barra superior */}
            <div className="flex items-center gap-4 px-6 py-4">
              <button
                className="rounded-lg hover:bg-slate-800 p-2 md:hidden transition-all"
                onClick={() => setShowMobileSidebar(true)}
              >
                <Menu size={20} />
              </button>
              
              <button
                className="rounded-lg hover:bg-slate-800 p-2 hidden md:block transition-all"
                onClick={() => navigateTo('dashboard')}
                title="Volver al menú principal"
              >
                <ArrowLeft size={20} />
              </button>
              
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Tablero Principal
                </h1>
                <Star size={20} className="text-yellow-400" />
              </div>
              
              <div className="ml-auto flex items-center gap-3">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="pl-10 pr-4 py-2 rounded-xl bg-slate-800/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 w-64 transition-all"
                    placeholder="Buscar en el tablero..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800/50 transition-all">
                  <Filter size={18} />
                  <span className="hidden sm:inline">Filtros</span>
                </button>
                
                <button className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:bg-slate-800/50 transition-all">
                  <Eye size={18} />
                  <span className="hidden sm:inline">Vista</span>
                </button>
              </div>
            </div>
            
            {/* Barra de acciones */}
            <div className="flex items-center gap-3 px-6 py-3 border-t border-slate-700/30">
              <button 
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg"
                onClick={() => setShowAddColModal(true)}
              >
                <Plus size={18} />
                Nueva columna
              </button>
              
              <button 
                className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg"
                onClick={() => setShowAddGroupModal(true)}
              >
                <Plus size={18} />
                Nuevo grupo
              </button>
              
              <div className="h-6 w-px bg-slate-600 mx-2" />
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Vista:</span>
                <div className="flex bg-slate-800 rounded-lg p-1">
                  {[
                    { key: "table", icon: ListChecks, label: "Tabla" },
                    { key: "kanban", icon: Target, label: "Kanban" },
                    { key: "calendar", icon: Calendar, label: "Calendar" }
                  ].map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                        viewMode === key 
                          ? "bg-blue-600 text-white shadow-sm" 
                          : "text-slate-400 hover:text-white hover:bg-slate-700"
                      )}
                      onClick={() => setViewMode(key)}
                    >
                      <Icon size={16} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Contenido principal */}
          <div className="p-6">
            <div className="max-w-[1600px] mx-auto">
              {viewMode === "table" && renderTable()}
              {viewMode === "kanban" && (
                <div className="text-center py-20">
                  <Target size={48} className="mx-auto text-slate-600 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-400 mb-2">Vista Kanban</h3>
                  <p className="text-slate-500">Próximamente disponible</p>
                </div>
              )}
              {viewMode === "calendar" && (
                <div className="text-center py-20">
                  <Calendar size={48} className="mx-auto text-slate-600 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-400 mb-2">Vista Calendario</h3>
                  <p className="text-slate-500">Próximamente disponible</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Modales */}
          {ModalAddColumn()}
          {ModalAddGroup()}
        </div>
      </div>
      
      {/* Estilos personalizados */}
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #1e293b; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
        
        .group-container:hover { transform: translateY(-1px); transition: transform 0.2s ease; }
      `}</style>
    </div>
  );
}