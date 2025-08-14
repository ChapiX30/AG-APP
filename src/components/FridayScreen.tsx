import React, { useState, useEffect } from "react";
import {
  Plus, MoreVertical, ArrowLeft, Search, Filter, ChevronDown, ChevronRight, X, Pencil, Trash2,
  ListChecks, File as FileIcon, Tag, Users, CheckCircle, Copy, Download, Archive, Move, Calendar, Hash,
  Menu, Star, Eye, Settings, Zap, Target, Clock as ClockIcon, AlertCircle, Sun, Moon, Phone as PhoneIcon, Mail, Link as LinkIcon, DollarSign, Sigma
} from "lucide-react";
import clsx from "clsx";
import { useNavigation } from "../hooks/useNavigation";
import SidebarFriday from "./SidebarFriday";
import { collection, onSnapshot, doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

/* -------------------- Tipos visuales -------------------- */
const COLUMN_TYPE_CATEGORIES = [
  {
    label: "Esenciales",
    types: [
      { key: "status", icon: <Target size={18} className="text-green-500" />, label: "Estado", description: "Seguimiento del progreso" },
      { key: "text", icon: <Tag size={18} className="text-blue-400" />, label: "Texto", description: "Información general" },
      { key: "person", icon: <Users size={18} className="text-purple-400" />, label: "Personas", description: "Asignación de responsables" },
      { key: "client", icon: <Users size={18} className="text-teal-500" />, label: "Cliente", description: "Selecciona cliente desde Firebase" },
      { key: "dropdown", icon: <ChevronDown size={18} className="text-orange-400" />, label: "Selección", description: "Opciones predefinidas" },
      { key: "date", icon: <Calendar size={18} className="text-pink-400" />, label: "Fecha", description: "Fechas importantes" },
      { key: "number", icon: <Hash size={18} className="text-cyan-400" />, label: "Números", description: "Valores numéricos" },
    ]
  },
  {
    label: "Avanzadas",
    types: [
      { key: "file", icon: <FileIcon size={18} className="text-red-400" />, label: "Archivo", description: "Documentos adjuntos" },
      { key: "checkbox", icon: <CheckCircle size={18} className="text-emerald-500" />, label: "Casilla", description: "Verificación simple" },
      { key: "priority", icon: <AlertCircle size={18} className="text-yellow-500" />, label: "Prioridad", description: "Nivel de importancia" },
      { key: "progress", icon: <Zap size={18} className="text-indigo-500" />, label: "Progreso", description: "Porcentaje completado" },
      { key: "phone", icon: <PhoneIcon size={18} className="text-teal-500" />, label: "Teléfono", description: "Número telefónico" },
      { key: "email", icon: <Mail size={18} className="text-sky-500" />, label: "Correo", description: "Dirección de email" },
      { key: "link", icon: <LinkIcon size={18} className="text-blue-500" />, label: "Enlace", description: "URL clickeable" },
      { key: "time", icon: <ClockIcon size={18} className="text-lime-500" />, label: "Hora", description: "Hora del día" },
      { key: "currency", icon: <DollarSign size={18} className="text-emerald-400" />, label: "Moneda", description: "Importes monetarios" },
      { key: "formula", icon: <Sigma size={18} className="text-fuchsia-400" />, label: "Fórmula", description: "Cálculo automático" },
      { key: "tags", icon: <Tag size={18} className="text-rose-400" />, label: "Etiquetas", description: "Múltiples etiquetas tipo chip" },
    ]
  }
];

const BOARD_DOC_ID = "principal";
const LOCAL_KEY = "friday_tablero_v8";

const GROUP_COLORS = [
  { bg: "bg-[#0073ea]", text: "text-white" },
  { bg: "bg-[#a25ddc]", text: "text-white" },
  { bg: "bg-[#00c875]", text: "text-white" },
  { bg: "bg-[#ff3d57]", text: "text-white" },
  { bg: "bg-[#ffcb00]", text: "text-gray-900" },
];

const STATUS_OPTIONS = [
  { value: "No iniciado", color: "bg-[#c4c4c4] text-gray-800", icon: "" },
  { value: "En proceso", color: "bg-[#fdab3d] text-white", icon: "" },
  { value: "Finalizado", color: "bg-[#00c875] text-white", icon: "" },
  { value: "En revisión", color: "bg-[#0073ea] text-white", icon: "" },
  { value: "Bloqueado", color: "bg-[#e2445c] text-white", icon: "" },
];

const PRIORITY_OPTIONS = [
  { value: "Baja", color: "bg-[#579bfc] text-white", icon: "" },
  { value: "Media", color: "bg-[#fdab3d] text-white", icon: "" },
  { value: "Alta", color: "bg-[#ff642e] text-white", icon: "" },
  { value: "Crítica", color: "bg-[#e2445c] text-white", icon: "" },
];

const DROPDOWN_OPTIONS = [
  { value: "Mecánica", color: "bg-[#a25ddc] text-white" },
  { value: "Eléctrica", color: "bg-[#00c875] text-white" },
  { value: "Dimensional", color: "bg-[#ff642e] text-white" },
  { value: "Calidad", color: "bg-[#0073ea] text-white" },
  { value: "Software", color: "bg-[#bb3354] text-white" },
  { value: "Otro", color: "bg-[#c4c4c4] text-gray-800" },
];

const PEOPLE: { id: string; name: string; role: string; initials: string; color: string }[] = [];
const CLIENTS: { id: string; name: string }[] = [];

/* -------------------- Tema -------------------- */
function setTheme(dark: boolean) {
  if (dark) document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}
const useTheme = () => {
  const [dark, setDark] = useState(() => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => setTheme(dark), [dark]);
  return [dark, setDark] as const;
};

/* -------------------- Modal vidrio -------------------- */
function GlassModal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative bg-slate-800/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/50 min-w-[90vw] max-w-lg w-full mx-4 animate-slideUp">
        <div className="flex items-center justify-between p-6 border-b border-slate-600/50">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/* -------------------- Utils -------------------- */
function safeNumber(v: any) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function evalFormula(formula: string, row: Record<string, any>) {
  if (!formula) return "";
  let expr = formula.replace(/\[([^\]]+)\]/g, (_, key) => String(safeNumber(row[key.trim()])));
  if (!/^[0-9+\-*/().\s]*$/.test(expr)) return "—";
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${expr});`);
    const val = fn();
    return Number.isFinite(val) ? val : "—";
  } catch {
    return "—";
  }
}
function formatCurrency(value: any, currency = "MXN") {
  const n = safeNumber(value);
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/* -------------------- Celdas -------------------- */
function renderCell(type, value, row = {}, setFile = null, col = null) {
  if (type === "status") {
    const opt = STATUS_OPTIONS.find(x => x.value === value) || STATUS_OPTIONS[0];
    return <div className={clsx("inline-flex items-center justify-center px-3 py-1.5 rounded-md font-medium text-sm min-w-[100px]", opt.color)}><span>{value || "No iniciado"}</span></div>;
  }
  if (type === "priority") {
    const opt = PRIORITY_OPTIONS.find(x => x.value === value) || PRIORITY_OPTIONS[0];
    return <div className={clsx("inline-flex items-center justify-center px-3 py-1.5 rounded-md font-medium text-sm min-w-[80px]", opt.color)}><span>{value || "Baja"}</span></div>;
  }
  if (type === "dropdown") {
    const opt = DROPDOWN_OPTIONS.find(x => x.value === value);
    if (!opt) return <span className="text-[#676879] text-sm">-</span>;
    return <div className={clsx("inline-flex items-center justify-center px-3 py-1.5 rounded-md font-medium text-sm min-w-[90px]", opt.color)}>{value}</div>;
  }
  if (type === "person") {
    const user = PEOPLE.find(u => u.id === value);
    if (!user) return <span className="text-[#676879] text-sm">-</span>;
    return (
      <div className="inline-flex items-center gap-2">
        <div className={clsx("w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center text-white", user.color)}>{user.initials}</div>
        <span className="font-medium text-sm text-[#323338]">{user.name}</span>
      </div>
    );
  }
  if (type === "client") {
    const client = CLIENTS.find(c => c.id === value);
    return <span className="text-sm text-[#323338]">{client?.name || "-"}</span>;
  }
  if (type === "checkbox") {
    return <div className="flex items-center"><input type="checkbox" checked={!!value} disabled className="w-4 h-4 accent-[#0073ea] rounded border-2 border-[#d0d4e4]" /></div>;
  }
  if (type === "progress") {
    const progress = Math.min(100, Math.max(0, parseInt(value) || 0));
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 bg-[#e6e9ef] rounded-full h-2 overflow-hidden">
          <div className="h-full bg-[#0073ea] transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs font-medium text-[#676879] min-w-[35px]">{progress}%</span>
      </div>
    );
  }
  if (type === "file") {
    return (
      <div className="inline-flex items-center gap-2 text-[#0073ea] hover:text-[#005bb5]">
        <FileIcon size={16} />
        <span className="text-sm">{value ? value : "Subir archivo"}</span>
        {setFile && <input type="file" style={{ display: "none" }} id={`file-upload-${row.id}`} onChange={e => setFile && setFile(e, row)} />}
        <label htmlFor={`file-upload-${row.id}`} className="cursor-pointer underline">{value ? "Cambiar" : "Subir"}</label>
      </div>
    );
  }
  if (type === "date") {
    if (!value) return <span className="text-[#676879] text-sm">-</span>;
    const d = new Date(value);
    if (isNaN(+d)) return <span className="text-[#676879] text-sm">Fecha inválida</span>;
    const today = new Date(); today.setHours(0,0,0,0);
    const isOverdue = d < today;
    const isToday = d.toDateString() === today.toDateString();
    return (
      <div className={clsx("inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium",
        isOverdue ? "bg-[#ffe6e9] text-[#e2445c]" : isToday ? "bg-[#fff4e6] text-[#fdab3d]" : "text-[#323338]")}>
        <Calendar size={14} />
        <span>{d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      </div>
    );
  }
  if (type === "number") return <span className="font-mono text-sm font-medium text-[#323338]">{value ?? ""}</span>;
  if (type === "phone") return value ? <a href={`tel:${value}`} className="text-[#0073ea] hover:underline">{value}</a> : <span className="text-[#676879] text-sm">-</span>;
  if (type === "email") return value ? <a href={`mailto:${value}`} className="text-[#0073ea] hover:underline">{value}</a> : <span className="text-[#676879] text-sm">-</span>;
  if (type === "link") {
    if (!value) return <span className="text-[#676879] text-sm">-</span>;
    const txt = String(value).replace(/^https?:\/\//, "");
    return <a href={value} target="_blank" rel="noreferrer" className="text-[#0073ea] hover:underline">{txt}</a>;
  }
  if (type === "time") return value ? <span className="text-sm">{value}</span> : <span className="text-[#676879] text-sm">-</span>;
  if (type === "currency") return <span className="font-mono text-sm font-medium text-[#323338]">{formatCurrency(value, (col?.currency || "MXN"))}</span>;
  if (type === "formula") {
    const res = evalFormula(col?.formula || "", row);
    return <span className="font-mono text-sm text-[#323338]">{res}</span>;
  }
  if (type === "tags") {
    const tags = Array.isArray(value) ? value : (value ? String(value).split(",").map(s => s.trim()).filter(Boolean) : []);
    if (tags.length === 0) return <span className="text-[#676879] text-sm">-</span>;
    return <div className="flex flex-wrap gap-1">{tags.map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-[#e6f0ff] text-[#0d47a1] border border-[#cfe0ff]">{t}</span>)}</div>;
  }
  return <span className="text-sm text-[#323338]">{value || ""}</span>;
}

function renderEditor(col, value, setValue, onSave) {
  const commonProps = {
    autoFocus: true,
    onBlur: onSave,
    onKeyDown: (e) => e.key === 'Enter' && onSave(),
    className: "w-full px-3 py-2 rounded-lg border border-slate-500 bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
  };
  switch (col.type) {
    case "status":
      return <select {...commonProps} value={value ?? ""} onChange={e => setValue(e.target.value)}>{STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.value}</option>)}</select>;
    case "priority":
      return <select {...commonProps} value={value ?? ""} onChange={e => setValue(e.target.value)}>{PRIORITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.value}</option>)}</select>;
    case "dropdown":
      return (
        <select {...commonProps} value={value ?? ""} onChange={e => setValue(e.target.value)}>
          <option value="">Sin asignar</option>
          {DROPDOWN_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
        </select>
      );
    case "person":
      return (
        <select {...commonProps} value={value ?? ""} onChange={e => setValue(e.target.value)}>
          <option value="">Sin asignar</option>
          {PEOPLE.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      );
    case "client":
      return (
        <select {...commonProps} value={value ?? ""} onChange={e => setValue(e.target.value)}>
          <option value="">Sin asignar</option>
          {CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      );
    case "checkbox":
      return <input type="checkbox" checked={!!value} onChange={e => setValue(e.target.checked)} onBlur={onSave} className="w-5 h-5 accent-blue-500 rounded" autoFocus />;
    case "date":
      return <input {...commonProps} type="date" value={value ?? ""} onChange={e => setValue(e.target.value)} />;
    case "number":
    case "progress":
      return <input {...commonProps} type="number" min={col.type === "progress" ? "0" : undefined} max={col.type === "progress" ? "100" : undefined} value={value ?? ""} onChange={e => setValue(e.target.value)} />;
    case "phone":
      return <input {...commonProps} type="tel" value={value ?? ""} onChange={e => setValue(e.target.value)} />;
    case "email":
      return <input {...commonProps} type="email" value={value ?? ""} onChange={e => setValue(e.target.value)} />;
    case "link":
      return <input {...commonProps} type="url" value={value ?? ""} onChange={e => setValue(e.target.value)} placeholder="https://..." />;
    case "time":
      return <input {...commonProps} type="time" value={value ?? ""} onChange={e => setValue(e.target.value)} />;
    case "currency":
      return <input {...commonProps} type="number" step="0.01" value={value ?? ""} onChange={e => setValue(e.target.value)} placeholder="0.00" />;
    case "formula":
      return <span className="text-xs text-slate-300">Fórmula (solo lectura)</span>;
    case "tags":
      return <input {...commonProps} type="text" value={Array.isArray(value) ? value.join(", ") : (value ?? "")} onChange={e => setValue(e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="tag1, tag2, ..." />;
    default:
      return <input {...commonProps} type="text" value={value ?? ""} onChange={e => setValue(e.target.value)} />;
  }
}

/* -------------------- Componente principal -------------------- */
export default function FridayScreen() {
  // ---- Estados principales ----
  const [columns, setColumns] = useState(() => {
    const d = localStorage.getItem(LOCAL_KEY);
    if (d) try { return JSON.parse(d).columns || []; } catch { }
    return [
      { label: "FOLIO", key: "folio", type: "number", width: 100, sticky: true },
      { label: "EQUIPO", key: "equipo", type: "text", width: 200 },
      { label: "CLIENTE", key: "cliente", type: "client", width: 200 },
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
        name: "🔧 Servicio en Sitio",
        colorIdx: 0,
        collapsed: false,
        rows: [
          {
            id: "r1",
            folio: "NEW-001",
            equipo: "",
            cliente: "",
            responsable: "",
            estado: "En proceso",
            prioridad: "Alta",
            progreso: "0",
            fecha_limite: "2025-08-08"
          }
        ]
      }
    ];
  });
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showColType, setShowColType] = useState("text");
  const [colNameInput, setColNameInput] = useState("");
  const [search, setSearch] = useState("");
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const { currentScreen, navigateTo } = useNavigation ? useNavigation() : { currentScreen: "", navigateTo: () => {} };
  const [openColMenuKey, setOpenColMenuKey] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterEstado, setFilterEstado] = useState("");
  const [filterResponsable, setFilterResponsable] = useState("");
  const [massEditModal, setMassEditModal] = useState(false);
  const [massEstado, setMassEstado] = useState("");
  const [massPrioridad, setMassPrioridad] = useState("");
  const [notif, setNotif] = useState("");
  const [dark, setDark] = useTheme();
  const [, setPeopleTick] = useState(0);
  const [, setClientsTick] = useState(0);
  const [saveTick, setSaveTick] = useState(0);

  // Notificación visual automática
  useEffect(() => {
    let urgente = false, bloquear = false;
    groups.forEach(g => g.rows.forEach(row => {
      if (row.estado === "Bloqueado") bloquear = true;
      const fecha = new Date(row.fecha_limite);
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      if (fecha <= hoy && row.estado !== "Finalizado") urgente = true;
    }));
    setNotif(
      bloquear ? "¡Alerta! Hay tareas bloqueadas." :
      urgente ? "¡Atención! Hay tareas próximas a vencer o vencidas." : ""
    );
  }, [groups]);

  // Persistencia local para fallback
  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ columns, groups }));
  }, [columns, groups]);

  // Cerrar menús
  useEffect(() => {
    const handleClickOutside = () => setOpenColMenuKey(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // --- Usuarios (responsables) en tiempo real ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const usuarios = snapshot.docs.map((doc) => {
        const data = doc.data() as { nombre?: string; role?: string };
        const name = data.nombre || "Sin nombre";
        return {
          id: doc.id,
          name,
          role: data.role || "",
          initials: name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0,2),
          color: "bg-gradient-to-br from-emerald-500 to-cyan-400",
        };
      });
      PEOPLE.splice(0, PEOPLE.length, ...usuarios);
      setPeopleTick(t => t + 1);
    });
    return () => unsub();
  }, []);

  // --- Clientes en tiempo real ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clientes"), (snapshot) => {
      const clientes = snapshot.docs.map((doc) => {
        const data = doc.data() as { nombre?: string };
        return { id: doc.id, name: data?.nombre || "Sin nombre" };
      });
      CLIENTS.splice(0, CLIENTS.length, ...clientes);
      setClientsTick(t => t + 1);
    });
    return () => unsub();
  }, []);

  // Firestore: sync tablero
  useEffect(() => {
    const ref = doc(db, "tableros", BOARD_DOC_ID);
    let unsub: any;
    (async () => {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { columns, groups, updatedAt: Date.now() });
      }
      unsub = onSnapshot(ref, (ds) => {
        const data = ds.data();
        if (!data) return;
        setColumns(data.columns || []);
        setGroups(data.groups || []);
      });
    })();
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guardado (debounce simple)
  useEffect(() => {
    const t = setTimeout(async () => {
      const ref = doc(db, "tableros", BOARD_DOC_ID);
      try {
        await updateDoc(ref, { columns, groups, updatedAt: Date.now() });
      } catch {
        await setDoc(ref, { columns, groups, updatedAt: Date.now() }, { merge: true });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [columns, groups, saveTick]);

  const filterRow = row =>
    (!search || columns.some(col => (row[col.key] + "").toLowerCase().includes(search.toLowerCase()))) &&
    (!filterEstado || row.estado === filterEstado) &&
    (!filterResponsable || row.responsable === filterResponsable);

  const setFile = (e, row) => {
    const archivo = e.target.files?.[0]?.name || "";
    setGroups(gs => gs.map(g => ({
      ...g,
      rows: g.rows.map(r => r.id === row.id ? { ...r, archivo } : r)
    })));
    setSaveTick(t => t + 1);
  };

  const handleMassEdit = () => {
    setGroups(gs => gs.map((g, gidx) => ({
      ...g,
      rows: g.rows.map((row, ridx) =>
        selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx)
          ? { ...row, ...(massEstado ? { estado: massEstado } : {}), ...(massPrioridad ? { prioridad: massPrioridad } : {}) }
          : row
      )
    })));
    setSelectedRows([]);
    setMassEditModal(false);
    setMassEstado("");
    setMassPrioridad("");
    setSaveTick(t => t + 1);
  };

  /* -------------------- Drag & Drop -------------------- */
  const onDragEnd = (result) => {
    if (!result.destination) return;

    if (result.type === "group") {
      const newGroups = Array.from(groups);
      const [removed] = newGroups.splice(result.source.index, 1);
      newGroups.splice(result.destination.index, 0, removed);
      setGroups(newGroups);
      setSaveTick(t => t + 1);
      return;
    }

    if (result.type === "column") {
      const newCols = Array.from(columns);
      const [removed] = newCols.splice(result.source.index, 1);
      newCols.splice(result.destination.index, 0, removed);
      setColumns(newCols);
      setSaveTick(t => t + 1);
      return;
    }

    if (result.type === "row") {
      const gFrom = +result.source.droppableId.replace("group-", "");
      const gTo = +result.destination.droppableId.replace("group-", "");
      const fromGroup = groups[gFrom];
      const toGroup = groups[gTo];

      const newFromRows = Array.from(fromGroup.rows);
      const [moved] = newFromRows.splice(result.source.index, 1);

      if (gFrom === gTo) {
        newFromRows.splice(result.destination.index, 0, moved);
        setGroups(gs => {
          const ngs = [...gs];
          ngs[gFrom] = { ...ngs[gFrom], rows: newFromRows };
          return ngs;
        });
      } else {
        const newToRows = Array.from(toGroup.rows);
        newToRows.splice(result.destination.index, 0, moved);
        setGroups(gs => {
          const ngs = [...gs];
          ngs[gFrom] = { ...ngs[gFrom], rows: newFromRows };
          ngs[gTo] = { ...ngs[gTo], rows: newToRows };
          return ngs;
        });
      }
      setSaveTick(t => t + 1);
      return;
    }
  };

  /* -------------------- Render tabla -------------------- */
  function renderTable() {
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
        {/* Drag de grupos */}
        <Droppable droppableId="groups" type="group">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
              {groups.map((group, gidx) => (
                <Draggable draggableId={group.id} index={gidx} key={group.id}>
                  {(provGroup, snapGroup) => (
                    <div ref={provGroup.innerRef} {...provGroup.draggableProps} className="group-container">
                      {/* Header del grupo */}
                      <div className={clsx(
                        "flex items-center px-6 py-3 font-bold text-base rounded-t-lg",
                        GROUP_COLORS[group.colorIdx % GROUP_COLORS.length].bg,
                        GROUP_COLORS[group.colorIdx % GROUP_COLORS.length].text,
                        snapGroup.isDragging && "shadow-xl"
                      )}>
                        <span {...provGroup.dragHandleProps} className="cursor-grab pr-3 hover:scale-110 transition-transform">
                          {group.collapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                        </span>
                        <button
                          className="flex-1 text-left flex items-center gap-3"
                          onClick={() => {
                            setGroups(gs => gs.map((g, i) => i === gidx ? { ...g, collapsed: !g.collapsed } : g));
                            setSaveTick(t => t + 1);
                          }}
                        >
                          <span className="text-base font-semibold">{group.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium">
                              {group.rows.length} elemento{group.rows.length !== 1 ? 's' : ''}
                            </span>
                            {group.rows.some(row => row.estado === "Bloqueado") && (
                              <span className="px-2 py-1 bg-red-500/30 rounded-full text-xs font-medium">⚠️ Bloqueados</span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1.5 rounded-md hover:bg-white/10 transition-all"
                            onClick={() => {
                              const name = prompt("Nuevo nombre del grupo:", group.name);
                              if (name) {
                                setGroups(gs => gs.map((g, i) => i === gidx ? { ...g, name } : g));
                                setSaveTick(t => t + 1);
                              }
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="p-1.5 rounded-md hover:bg-red-500/20 text-red-100 transition-all"
                            onClick={() => {
                              if (window.confirm("¿Eliminar este grupo y todo su contenido?")) {
                                setGroups(gs => gs.filter((_, i) => i !== gidx));
                                setSaveTick(t => t + 1);
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            className="ml-3 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white font-medium rounded-md flex items-center gap-2 transition-all text-sm"
                            onClick={() => {
                              setGroups(gs => gs.map((g, i) => i === gidx
                                ? { ...g, rows: [...g.rows, { id: "r" + Math.random().toString(36).slice(2, 8), folio: `NEW-${String(g.rows.length + 1).padStart(3, '0')}`, estado: "No iniciado", prioridad: "Media", progreso: "0" }] }
                                : g));
                              setSaveTick(t => t + 1);
                            }}
                          >
                            <Plus size={16} />
                            Nuevo elemento
                          </button>
                        </div>
                      </div>

                      {!group.collapsed && (
                        <Droppable droppableId={"group-" + gidx} type="row">
                          {(provRow, snapRow) => (
                            <div ref={provRow.innerRef} {...provRow.droppableProps}
                              className={clsx("bg-white border border-[#e6e9ef] rounded-b-lg overflow-hidden shadow-sm", snapRow.isDraggingOver && "ring-2 ring-[#0073ea]/30")}>
                              <div className="overflow-x-auto border-collapse">
                                <table className="w-full min-w-[1200px]">
                                  <thead>
                                    {/* ── IMPORTANTE: solo el PRIMER grupo tiene Droppable de columnas ── */}
                                    {gidx === 0 ? (
                                      <Droppable droppableId="columns-droppable" direction="horizontal" type="column">
                                        {(providedDroppable) => (
                                          <tr ref={providedDroppable.innerRef} {...providedDroppable.droppableProps} className="bg-[#f8f9fd] border-b border-[#e6e9ef]">
                                            <th className="w-12 px-4 py-3">
                                              <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-[#0073ea] rounded border-2 border-[#d0d4e4]"
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
                                              <Draggable draggableId={`column-${col.key}`} index={cidx} key={col.key}>
                                                {(provCol) => (
                                                  <th
                                                    ref={provCol.innerRef}
                                                    {...provCol.draggableProps}
                                                    {...provCol.dragHandleProps}
                                                    className={clsx(
                                                      "text-left px-4 py-3 text-sm font-semibold text-[#323338] relative group border-r border-[#e6e9ef] last:border-r-0 bg-[#f8f9fd]",
                                                      col.sticky ? "sticky left-0 z-10" : ""
                                                    )}
                                                    style={{ minWidth: col.width }}
                                                    title={COLUMN_TYPE_CATEGORIES.flatMap(x => x.types).find(x => x.key === col.type)?.description}
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      {COLUMN_TYPE_CATEGORIES.flatMap(x => x.types).find(x => x.key === col.type)?.icon}
                                                      <span className="text-sm font-medium">{col.label}</span>
                                                      <button
                                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#e6e9ef] transition-all"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setOpenColMenuKey(openColMenuKey === col.key ? null : col.key);
                                                        }}
                                                      >
                                                        <MoreVertical size={14} />
                                                      </button>
                                                    </div>
                                                    {openColMenuKey === col.key && (
                                                      <div className="absolute top-full left-0 z-50 w-64 bg-white border border-[#e6e9ef] rounded-lg shadow-lg p-2 mt-1 animate-slideDown">
                                                        <button
                                                          className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-[#f8f9fd] text-sm transition-all text-[#323338]"
                                                          onClick={() => {
                                                            const name = prompt("Nuevo nombre:", col.label);
                                                            if (name) setColumns(cols => cols.map((c, i) => i === cidx ? { ...c, label: name.toUpperCase() } : c));
                                                            setOpenColMenuKey(null);
                                                            setSaveTick(t => t + 1);
                                                          }}
                                                        >
                                                          <Pencil size={16} className="text-[#676879]" />
                                                          <span>Renombrar</span>
                                                        </button>

                                                        {col.type === "currency" && (
                                                          <button
                                                            className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-[#f8f9fd] text-sm transition-all text-[#323338]"
                                                            onClick={() => {
                                                              const curr = prompt("Código de moneda (p.ej. MXN, USD):", col.currency || "MXN") || "MXN";
                                                              setColumns(cols => cols.map((c, i) => i === cidx ? { ...c, currency: curr } : c));
                                                              setOpenColMenuKey(null);
                                                              setSaveTick(t => t + 1);
                                                            }}
                                                          >
                                                            <DollarSign size={16} className="text-emerald-500" />
                                                            <span>Moneda…</span>
                                                          </button>
                                                        )}
                                                        {col.type === "formula" && (
                                                          <button
                                                            className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-[#f8f9fd] text-sm transition-all text-[#323338]"
                                                            onClick={() => {
                                                              const f = prompt("Fórmula (usa [campo], p.ej. [progreso] * [numero]):", col.formula || "") || "";
                                                              setColumns(cols => cols.map((c, i) => i === cidx ? { ...c, formula: f } : c));
                                                              setOpenColMenuKey(null);
                                                              setSaveTick(t => t + 1);
                                                            }}
                                                          >
                                                            <Sigma size={16} className="text-fuchsia-500" />
                                                            <span>Editar fórmula…</span>
                                                          </button>
                                                        )}

                                                        <div className="h-px bg-[#e6e9ef] my-1" />
                                                        <button
                                                          className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-[#f8f9fd] text-sm transition-all text-[#323338]"
                                                          onClick={() => {
                                                            setColumns(cols => [
                                                              ...cols.slice(0, cidx + 1),
                                                              { ...col, key: col.key + "_copy_" + Math.random().toString(36).slice(2, 5), label: col.label + " (COPIA)" },
                                                              ...cols.slice(cidx + 1)
                                                            ]);
                                                            setOpenColMenuKey(null);
                                                            setSaveTick(t => t + 1);
                                                          }}
                                                        >
                                                          <Copy size={16} className="text-[#676879]" />
                                                          <span>Duplicar</span>
                                                        </button>
                                                        <button
                                                          className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-red-50 text-[#e2445c] text-sm transition-all"
                                                          onClick={() => {
                                                            if (window.confirm("¿Eliminar esta columna?")) {
                                                              setColumns(cols => cols.filter((_, i) => i !== cidx));
                                                              setSaveTick(t => t + 1);
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
                                                )}
                                              </Draggable>
                                            ))}
                                            <th className="w-12 px-4 py-3"></th>
                                            {providedDroppable.placeholder}
                                          </tr>
                                        )}
                                      </Droppable>
                                    ) : (
                                      // Header estático para siguientes grupos (sin droppable duplicado)
                                      <tr className="bg-[#f8f9fd] border-b border-[#e6e9ef]">
                                        <th className="w-12 px-4 py-3"></th>
                                        {columns.map((col) => (
                                          <th
                                            key={`static-${col.key}`}
                                            className={clsx(
                                              "text-left px-4 py-3 text-sm font-semibold text-[#323338] relative border-r border-[#e6e9ef] last:border-r-0 bg-[#f8f9fd]",
                                              col.sticky ? "sticky left-0 z-10" : ""
                                            )}
                                            style={{ minWidth: col.width }}
                                          >
                                            <div className="flex items-center gap-2">
                                              {COLUMN_TYPE_CATEGORIES.flatMap(x => x.types).find(x => x.key === col.type)?.icon}
                                              <span className="text-sm font-medium">{col.label}</span>
                                            </div>
                                          </th>
                                        ))}
                                        <th className="w-12 px-4 py-3"></th>
                                      </tr>
                                    )}
                                  </thead>

                                  <tbody>
                                    {group.rows.filter(filterRow).map((row, ridx) => (
                                      <Draggable draggableId={row.id} index={ridx} key={row.id}>
                                        {(provR, snapR) => (
                                          <tr ref={provR.innerRef} {...provR.draggableProps}
                                            className={clsx(
                                              "hover:bg-[#f8f9fd] transition-all border-b border-[#e6e9ef] group",
                                              isSelected(gidx, ridx) && "bg-[#e6f3ff] ring-2 ring-[#0073ea]/30",
                                              snapR.isDragging && "shadow-md"
                                            )}
                                            style={{ transform: snapR.isDragging ? "scale(1.005)" : undefined }}
                                          >
                                            <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-[#e6e9ef]">
                                              <input
                                                type="checkbox"
                                                checked={isSelected(gidx, ridx)}
                                                onChange={() => toggleRow(gidx, ridx)}
                                                className="w-4 h-4 accent-[#0073ea] rounded border-2 border-[#d0d4e4]"
                                              />
                                            </td>

                                            {columns.map((col) => {
                                              const isEditing = editCell && editCell.gidx === gidx && editCell.ridx === ridx && editCell.colKey === col.key;
                                              if (isEditing) {
                                                return (
                                                  <td key={col.key} className={clsx(
                                                    "px-4 py-3 border-r border-[#e6e9ef] last:border-r-0 bg-white",
                                                    col.sticky ? "sticky left-0 z-10" : ""
                                                  )}>
                                                    {renderEditor(col, editValue, setEditValue, () => {
                                                      setGroups(gs => {
                                                        const ngs = [...gs];
                                                        ngs[gidx].rows[ridx][col.key] = editValue;
                                                        return ngs;
                                                      });
                                                      setEditCell(null);
                                                      setSaveTick(t => t + 1);
                                                    })}
                                                  </td>
                                                );
                                              }
                                              return (
                                                <td
                                                  key={col.key}
                                                  className={clsx(
                                                    "px-4 py-3 cursor-pointer hover:bg-[#f0f3ff] transition-all border-r border-[#e6e9ef] last:border-r-0 bg-white",
                                                    col.sticky ? "sticky left-0 z-10" : ""
                                                  )}
                                                  onClick={() => {
                                                    setEditCell({ gidx, ridx, colKey: col.key });
                                                    setEditValue(group.rows[ridx][col.key] ?? (col.type === "tags" ? [] : ""));
                                                  }}
                                                >
                                                  {renderCell(col.type, group.rows[ridx][col.key], row, col.type === "file" ? setFile : null, col)}
                                                </td>
                                              );
                                            })}
                                            <td className="px-4 py-3">
                                              <div {...provR.dragHandleProps} className="cursor-grab opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-[#e6e9ef] transition-all" title="Arrastrar fila">
                                                <ListChecks size={16} className="text-[#676879]" />
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

        {/* Barra de acciones flotante */}
        {selectedRows.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white border border-[#e6e9ef] rounded-xl shadow-lg px-6 py-4 flex items-center gap-6 z-50 animate-slideUp">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#0073ea] rounded-full flex items-center justify-center text-white font-bold text-sm">{selectedRows.length}</div>
              <span className="text-[#323338] font-medium">elemento{selectedRows.length > 1 ? 's' : ''} seleccionado{selectedRows.length > 1 ? 's' : ''}</span>
            </div>
            <div className="h-6 w-px bg-[#e6e9ef]" />
            <div className="flex items-center gap-4">
              <button className="flex flex-col items-center gap-1 text-[#676879] hover:text-[#0073ea] transition-all" title="Duplicar"
                onClick={() => {
                  setGroups(gs => gs.map((g, gidx) => ({
                    ...g,
                    rows: [
                      ...g.rows,
                      ...g.rows.map((row, ridx) =>
                        selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx)
                          ? { ...row, id: "r" + Math.random().toString(36).slice(2, 8), folio: (row.folio || "") + "_C" }
                          : null
                      ).filter(Boolean) as any[]
                    ]
                  })));
                  setSelectedRows([]);
                  setSaveTick(t => t + 1);
                }}>
                <Copy size={20} /><span className="text-xs font-medium">Duplicar</span>
              </button>
              <button className="flex flex-col items-center gap-1 text-[#676879] hover:text-[#0073ea] transition-all" title="Exportar" onClick={() => alert("Exportar a Excel: próximamente (integrar SheetJS)")}>
                <Download size={20} /><span className="text-xs font-medium">Exportar</span>
              </button>
              <button className="flex flex-col items-center gap-1 text-[#676879] hover:text-[#0073ea] transition-all" title="Archivar">
                <Archive size={20} /><span className="text-xs font-medium">Archivar</span>
              </button>
              <button className="flex flex-col items-center gap-1 text-[#676879] hover:text-[#0073ea] transition-all" title="Mover">
                <Move size={20} /><span className="text-xs font-medium">Mover</span>
              </button>
              <button className="flex flex-col items-center gap-1 text-[#676879] hover:text-[#0073ea] transition-all" title="Edición masiva" onClick={() => setMassEditModal(true)}>
                <Settings size={20} /><span className="text-xs font-medium">Edición masiva</span>
              </button>
              <button className="flex flex-col items-center gap-1 text-[#676879] hover:text-[#e2445c] transition-all" title="Eliminar"
                onClick={() => {
                  if (window.confirm(`¿Eliminar ${selectedRows.length} elemento${selectedRows.length > 1 ? 's' : ''}?`)) {
                    setGroups(gs => gs.map((g, gidx) => ({
                      ...g,
                      rows: g.rows.filter((_, ridx) => !selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx))
                    })));
                    setSelectedRows([]);
                    setSaveTick(t => t + 1);
                  }
                }}>
                <Trash2 size={20} /><span className="text-xs font-medium">Eliminar</span>
              </button>
            </div>
            <button className="ml-4 p-2 rounded-md hover:bg-[#f8f9fd] text-[#676879] hover:text-[#323338] transition-all" onClick={() => setSelectedRows([])}>
              <X size={20} />
            </button>
          </div>
        )}
      </DragDropContext>
    );
  }

  /* -------------------- Kanban / Calendario -------------------- */
  function renderKanban() {
    const estados = STATUS_OPTIONS.map(e => e.value);
    return (
      <div className="flex gap-4 overflow-x-auto py-4 min-h-[60vh]">
        {estados.map((estado) => (
          <div key={estado} className="min-w-[280px] flex-1 bg-slate-800 rounded-2xl shadow-md border border-slate-600/50 p-3">
            <div className="font-bold text-lg flex items-center gap-2 mb-3">
              <span>{STATUS_OPTIONS.find(e => e.value === estado)?.icon}</span>
              {estado}
            </div>
            {groups.flatMap((g) =>
              g.rows.filter(row => row.estado === estado && filterRow(row)).map((row) => (
                <div key={row.id} className="mb-3 last:mb-0 bg-slate-900 rounded-xl p-3 shadow flex flex-col gap-2">
                  <div className="text-sm font-bold">{row.equipo || row.folio}</div>
                  <div className="flex gap-2 items-center">
                    {renderCell("priority", row.prioridad)}
                    {renderCell("person", row.responsable)}
                    {renderCell("client", row.cliente)}
                  </div>
                  <div className="text-xs text-slate-400">{row.folio}</div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderCalendar() {
    return (
      <div className="py-8 flex justify-center">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-10 text-center max-w-xl w-full">
          <Calendar size={48} className="mx-auto text-slate-500 mb-4" />
          <h3 className="text-2xl font-bold text-slate-200 mb-3">Vista Calendario</h3>
          <p className="text-slate-400 mb-2">Aquí podrás visualizar todas tus tareas por fecha. Integración lista para react-big-calendar.</p>
        </div>
      </div>
    );
  }

  /* -------------------- Modales -------------------- */
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
      <GlassModal open={showAddColModal} onClose={() => setShowAddColModal(false)} title="Agregar nueva columna">
        <div className="space-y-6">
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
          <div className="max-h-80 overflow-y-auto space-y-4">
            {filteredCategories.map(category => (
              <div key={category.label}>
                <h4 className="font-semibold text-sm text-slate-300 uppercase tracking-wider mb-3">{category.label}</h4>
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
                      onClick={() => { setSelectedType(type.key); setShowColType(type.key); }}
                      title={type.description}
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

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Nombre de la columna</label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              value={colNameInput}
              onChange={e => setColNameInput(e.target.value)}
              placeholder="Ej: Cliente, Serie, Observaciones..."
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button className="flex-1 px-4 py-3 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all"
              onClick={() => { setShowAddColModal(false); setColNameInput(""); setSelectedType(null); }}>
              Cancelar
            </button>
            <button
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!colNameInput.trim() || !selectedType}
              onClick={() => {
                if (!colNameInput.trim() || !selectedType) return;
                const field = colNameInput.trim().toLowerCase().replace(/\s+/g, "_");
                const extra =
                  selectedType === "currency" ? { currency: "MXN" } :
                  selectedType === "formula" ? { formula: "" } : {};
                setColumns(cols => [...cols, {
                  label: colNameInput.trim().toUpperCase(),
                  key: field + "_" + Math.random().toString(36).slice(2, 5),
                  type: selectedType,
                  width: 150,
                  ...extra
                }]);
                setShowAddColModal(false);
                setColNameInput("");
                setSelectedType(null);
                setSaveTick(t => t + 1);
              }}
            >
              Agregar columna
            </button>
          </div>
        </div>
      </GlassModal>
    );
  }

  function ModalAddGroup() {
    const [grpName, setGrpName] = useState("");
    const [grpIcon, setGrpIcon] = useState("📁");
    const icons = ["📁", "🔧", "⚡", "🎯", "📊", "🚀", "💡", "🔥", "⭐", "🎨"];
    return (
      <GlassModal open={showAddGroupModal} onClose={() => setShowAddGroupModal(false)} title="Crear nuevo grupo">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-3">Icono del grupo</label>
            <div className="grid grid-cols-5 gap-2">
              {icons.map(icon => (
                <button
                  key={icon}
                  className={clsx(
                    "w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xl transition-all",
                    grpIcon === icon ? "border-blue-500 bg-blue-600/20" : "border-slate-600 hover:border-slate-500 hover:bg-slate-700/50"
                  )}
                  onClick={() => setGrpIcon(icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Nombre del grupo</label>
            <input
              className="w-full px-4 py-3 rounded-xl border border-slate-600 bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              placeholder="Ej: Proyectos Q1, Tareas urgentes..."
              value={grpName}
              onChange={e => setGrpName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={() => setShowAddGroupModal(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all">Cancelar</button>
            <button
              onClick={() => {
                if (grpName.trim()) {
                  setGroups(gs => [
                    ...gs,
                    { id: "g" + Math.random().toString(36).slice(2, 8), name: `${grpIcon} ${grpName.trim()}`, colorIdx: gs.length % GROUP_COLORS.length, collapsed: false, rows: [] }
                  ]);
                  setShowAddGroupModal(false);
                  setGrpName("");
                  setGrpIcon("📁");
                  setSaveTick(t => t + 1);
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

  function ModalMassEdit() {
    return (
      <GlassModal open={massEditModal} onClose={() => setMassEditModal(false)} title="Edición masiva">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-300">Estado</label>
          <select className="w-full p-2 rounded bg-slate-700 text-white" value={massEstado} onChange={e => setMassEstado(e.target.value)}>
            <option value="">No cambiar</option>
            {STATUS_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.value}</option>)}
          </select>
          <label className="block text-sm font-semibold text-slate-300">Prioridad</label>
          <select className="w-full p-2 rounded bg-slate-700 text-white" value={massPrioridad} onChange={e => setMassPrioridad(e.target.value)}>
            <option value="">No cambiar</option>
            {PRIORITY_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.value}</option>)}
          </select>
          <button className="mt-3 w-full py-2 rounded bg-blue-600 text-white font-bold" onClick={handleMassEdit}>Aplicar cambios</button>
        </div>
      </GlassModal>
    );
  }

  function ModalFiltros() {
    return (
      <GlassModal open={showFilterModal} onClose={() => setShowFilterModal(false)} title="Filtrar tablero">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-300">Estado</span>
            <select className="w-full p-2 mt-1 rounded bg-slate-700 text-white" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-300">Responsable</span>
            <select className="w-full p-2 mt-1 rounded bg-slate-700 text-white" value={filterResponsable} onChange={e => setFilterResponsable(e.target.value)}>
              <option value="">Todos</option>
              {PEOPLE.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button className="mt-3 w-full py-2 rounded bg-blue-600 text-white font-bold" onClick={() => setShowFilterModal(false)}>Aplicar</button>
        </div>
      </GlassModal>
    );
  }

  /* -------------------- Layout PRO sin huecos -------------------- */
  return (
    <div className="min-h-screen bg-slate-950 dark:bg-[#0e1726] flex">
      {/* Sidebar fijo en desktop */}
      <div className="hidden md:block fixed top-0 left-0 h-full z-40">
        <SidebarFriday active={currentScreen} onNavigate={navigateTo} />
      </div>

      {/* Sidebar móvil overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="bg-slate-900 w-64 h-full shadow-2xl">
            <SidebarFriday active={currentScreen} onNavigate={(scr) => { setShowMobileSidebar(false); navigateTo(scr); }} />
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)} />
        </div>
      )}

      {/* Main content */}
      <div className={clsx("flex-1 min-h-screen flex flex-col transition-all duration-300", "md:ml-[235px] bg-[#f6f7fb]")}>
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white border-b border-[#e6e9ef]">
          <div className="flex items-center gap-4 px-6 py-4">
            <button className="rounded-lg hover:bg-[#f8f9fd] p-2 md:hidden transition-all" onClick={() => setShowMobileSidebar(true)}>
              <Menu size={20} className="text-[#323338]" />
            </button>
            <button className="rounded-lg hover:bg-[#f8f9fd] p-2 hidden md:block transition-all" onClick={() => navigateTo('dashboard')} title="Volver al menú principal">
              <ArrowLeft size={20} className="text-[#323338]" />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#323338]">Tablero Principal</h1>
              <Star size={20} className="text-[#fdab3d]" />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#676879]" />
                <input
                  className="pl-10 pr-4 py-2 rounded-lg bg-white border border-[#d0d4e4] text-[#323338] placeholder-[#676879] focus:outline-none focus:ring-2 focus:ring-[#0073ea]/50 focus:border-[#0073ea] w-64 transition-all"
                  placeholder="Buscar en el tablero..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#676879] hover:bg-[#f8f9fd] transition-all" onClick={() => setShowFilterModal(true)}>
                <Filter size={18} /><span className="hidden sm:inline">Filtros</span>
              </button>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#676879] hover:bg-[#f8f9fd] transition-all">
                <Eye size={18} /><span className="hidden sm:inline">Vista</span>
              </button>
              <button className="p-2 rounded-full hover:bg-[#f8f9fd] text-[#fdab3d]" title={dark ? "Modo claro" : "Modo oscuro"} onClick={() => setDark(d => !d)}>
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 px-6 py-3 border-t border-[#e6e9ef]">
            <button className="bg-[#0073ea] hover:bg-[#005bb5] text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-all" onClick={() => setShowAddColModal(true)}>
              <Plus size={18} />Nueva columna
            </button>
            <button className="bg-[#00c875] hover:bg-[#00a661] text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-all" onClick={() => setShowAddGroupModal(true)}>
              <Plus size={18} />Nuevo grupo
            </button>
            <div className="h-6 w-px bg-[#e6e9ef] mx-2" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#676879]">Vista:</span>
              <div className="flex bg-[#f8f9fd] rounded-lg p-1 border border-[#e6e9ef]">
                {[
                  { key: "table", icon: ListChecks, label: "Tabla" },
                  { key: "kanban", icon: Target, label: "Kanban" },
                  { key: "calendar", icon: Calendar, label: "Calendar" }
                ].map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                      viewMode === key ? "bg-[#0073ea] text-white shadow-sm" : "text-[#676879] hover:text-[#323338] hover:bg-white")}
                    onClick={() => setViewMode(key)}
                  >
                    <Icon size={16} /><span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {notif && (
            <div className="flex items-center gap-2 p-2 bg-gradient-to-r from-[#ffe6e9] via-[#fff4e6] to-transparent text-[#e2445c] text-sm font-medium px-8 animate-fadeIn">
              <AlertCircle size={18} className="text-[#e2445c]" />{notif}
            </div>
          )}
        </div>

        {/* FAB mobile */}
        <button className="md:hidden fixed bottom-8 right-8 z-40 bg-[#0073ea] shadow-lg text-white rounded-full p-4 flex items-center justify-center hover:scale-105 transition-all" title="Nuevo elemento" onClick={() => setShowAddGroupModal(true)}>
          <Plus size={28} />
        </button>

        {/* Contenido */}
        <div className="p-6 bg-[#f6f7fb]">
          <div className="max-w-[1600px] mx-auto">
            {viewMode === "table" && renderTable()}
            {viewMode === "kanban" && renderKanban()}
            {viewMode === "calendar" && renderCalendar()}
          </div>
        </div>

        {/* Modales */}
        {ModalAddColumn()}
        {ModalAddGroup()}
        {ModalFiltros()}
        {ModalMassEdit()}
      </div>

      {/* Estilos */}
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f6f7fb; }
        ::-webkit-scrollbar-thumb { background: #d0d4e4; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a5a5a5; }
        .group-container:hover { transform: translateY(-1px); transition: transform 0.2s ease; }
        .sticky { position: sticky; }
        body, html { background: #f6f7fb !important; }
      `}</style>
    </div>
  );
}
