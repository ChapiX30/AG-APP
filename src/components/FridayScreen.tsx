import React, { useState, useEffect } from "react";
import { Plus, MoreVertical, ArrowLeft, Search, Filter, ChevronDown, ChevronRight, X, Pencil, Trash2, ListChecks, File, Tag, Users, CheckCircle, Copy, Download, Archive, Repeat, Move, AppWindow, Calendar, Hash } from "lucide-react";
import clsx from "clsx";
import { useNavigation } from "../hooks/useNavigation";
import SidebarFriday from "./SidebarFriday";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

// --- Categorías y tipos de columna estilo Monday
const COLUMN_TYPE_CATEGORIES = [
  {
    label: "Esenciales",
    types: [
      { key: "status", icon: <CheckCircle size={18} className="text-green-500" />, label: "Estado" },
      { key: "text", icon: <Tag size={18} className="text-yellow-400" />, label: "Texto" },
      { key: "person", icon: <Users size={18} className="text-blue-400" />, label: "Personas" },
      { key: "dropdown", icon: <Tag size={18} className="text-green-400" />, label: "Menú desplegable" },
      { key: "date", icon: <Calendar size={18} className="text-purple-400" />, label: "Fecha" },
      { key: "number", icon: <Hash size={18} className="text-yellow-300" />, label: "Números" },
    ]
  },
  {
    label: "Super útiles",
    types: [
      { key: "file", icon: <File size={18} className="text-red-400" />, label: "Archivo" },
      { key: "checkbox", icon: <CheckCircle size={18} className="text-yellow-500" />, label: "Casilla de verificación" },
      // Puedes agregar más tipos aquí...
    ]
  }
];

// --- Paletas y opciones visuales
const LOCAL_KEY = "friday_tablero_v5";
const GROUP_COLORS = [
  "border-l-4 border-cyan-400 text-cyan-400 bg-cyan-900/40",
  "border-l-4 border-fuchsia-400 text-fuchsia-400 bg-fuchsia-900/40",
  "border-l-4 border-emerald-400 text-emerald-400 bg-emerald-900/40",
  "border-l-4 border-yellow-300 text-yellow-300 bg-yellow-900/30",
];
const STATUS_OPTIONS = [
  { value: "En proceso", color: "bg-sky-600 text-white" },
  { value: "Finalizado", color: "bg-emerald-500 text-white" },
  { value: "Pendiente", color: "bg-yellow-400 text-gray-800" },
  { value: "Retrasado", color: "bg-rose-500 text-white" },
];
const DROPDOWN_OPTIONS = [
  { value: "Mecánica", color: "bg-pink-500 text-white" },
  { value: "Eléctrica", color: "bg-green-500 text-white" },
  { value: "Dimensional", color: "bg-orange-400 text-white" },
  { value: "Calidad", color: "bg-cyan-600 text-white" },
  { value: "Otro", color: "bg-gray-700 text-gray-200" },
];
const PEOPLE = [
  { id: "ana", name: "Ana Salas", color: "bg-gradient-to-br from-cyan-500 to-sky-400", initials: "AS" },
  { id: "juan", name: "Juan Pérez", color: "bg-gradient-to-br from-emerald-500 to-cyan-400", initials: "JP" },
];

// --- Render de celda según tipo
function renderCell(type, value) {
  if (type === "status") {
    const opt = STATUS_OPTIONS.find(x => x.value === value);
    return (
      <span className={clsx("px-3 py-1 rounded-full font-bold text-xs shadow", opt?.color, "select-none")}>
        {value}
      </span>
    );
  }
  if (type === "dropdown") {
    const opt = DROPDOWN_OPTIONS.find(x => x.value === value);
    return (
      <span className={clsx("px-3 py-1 rounded-full font-bold text-xs shadow", opt?.color, "select-none")}>
        {value}
      </span>
    );
  }
  if (type === "person") {
    const user = PEOPLE.find(u => u.id === value);
    return user ? (
      <span className={clsx("inline-flex items-center gap-2 font-semibold")}>
        <span className={clsx("inline-block w-6 h-6 rounded-full text-xs flex items-center justify-center ring-2 ring-white", user.color)}>{user.initials}</span>
        {user.name}
      </span>
    ) : "";
  }
  if (type === "checkbox") {
    return <input type="checkbox" checked={!!value} disabled className="w-5 h-5 accent-emerald-500" />;
  }
  if (type === "file") {
    // Placeholder visual
    return <span className="inline-flex gap-1 items-center text-cyan-300"><File size={16} /> Archivo</span>;
  }
  if (type === "date") {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(+d)) return "";
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear().toString().slice(-2)}`;
  }
  return value ?? "";
}

// --- Modal cristalino
function GlassModal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-white/90 dark:bg-[#232d32]/95 rounded-2xl shadow-2xl px-8 py-6 min-w-[330px] w-full max-w-sm border border-cyan-400/40 animate-fadein">
        <button onClick={onClose}
          className="absolute top-2 right-2 rounded-full p-1 hover:bg-cyan-100/40 text-gray-600 dark:text-gray-200"><X size={20} /></button>
        {children}
      </div>
      <style>{`.animate-fadein{animation:fadein .28s cubic-bezier(.16,1,.3,1)}@keyframes fadein{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

// --- Componente principal
export default function FridayScreen() {
  // Estado principal
  const [columns, setColumns] = useState(() => {
    const d = localStorage.getItem(LOCAL_KEY);
    if (d) try { return JSON.parse(d).columns || []; } catch { }
    return [
      { label: "FOLIO", key: "folio", type: "number", width: 110 },
      { label: "EQUIPO", key: "equipo", type: "text", width: 140 },
      { label: "ID", key: "id", type: "text", width: 100 },
      { label: "MARCA", key: "marca", type: "text", width: 120 },
      { label: "MODELO", key: "modelo", type: "text", width: 120 },
      { label: "STATUS", key: "status", type: "status", width: 110 },
    ];
  });
  const [groups, setGroups] = useState(() => {
    const d = localStorage.getItem(LOCAL_KEY);
    if (d) try { return JSON.parse(d).groups || []; } catch { }
    return [
      {
        id: "g1",
        name: "Servicio en Sitio",
        colorIdx: 0,
        collapsed: false,
        rows: [
          {
            id: "r1", folio: "0087", equipo: "PRENSA ELECTRICA", id: "EP-49240", marca: "TYCO",
            modelo: "CMP-10T MK II", status: "En proceso"
          }
        ]
      }
    ];
  });

  // UI states
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showColType, setShowColType] = useState("text");
  const [colNameInput, setColNameInput] = useState(""); // solo para el input
  const [search, setSearch] = useState("");
  const [editCell, setEditCell] = useState(null); // {gidx, ridx, colKey}
  const [editValue, setEditValue] = useState("");
  const { currentScreen, navigateTo } = useNavigation();
  const [openColMenuKey, setOpenColMenuKey] = useState(null);
  const [selectedRows, setSelectedRows] = useState([]); // [{gidx, ridx}]

  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ columns, groups }));
  }, [columns, groups]);

  // --- Modal agregar columna tipo Monday ---
  function ModalAddColumn() {
    const [colSearch, setColSearch] = useState("");
    return (
      <GlassModal open={showAddColModal} onClose={() => setShowAddColModal(false)}>
        <h3 className="font-bold text-xl text-cyan-700 mb-3">Agregar columna</h3>
        <div className="space-y-4">
          <div className="relative mb-2">
            <input
              className="w-full px-3 py-2 rounded border bg-white/70 border-cyan-200 dark:bg-[#2b3437]/70 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="🔍 Buscar columna..."
              value={colSearch}
              onChange={e => setColSearch(e.target.value)}
              autoFocus
            />
          </div>
          {COLUMN_TYPE_CATEGORIES.map(category => (
            <div key={category.label} className="mb-1">
              <div className="font-semibold text-xs text-gray-400 uppercase mb-2">{category.label}</div>
              <div className="grid grid-cols-2 gap-2">
                {category.types
                  .filter(type => !colSearch || type.label.toLowerCase().includes(colSearch.toLowerCase()))
                  .map(type => (
                    <button key={type.key}
                      className={clsx(
                        "flex items-center gap-2 p-2 rounded-lg border border-transparent transition-all w-full",
                        showColType === type.key
                          ? "bg-cyan-700/20 border-cyan-500"
                          : "hover:bg-cyan-800/10"
                      )}
                      onClick={() => setShowColType(type.key)}
                    >
                      {type.icon}
                      <span className="font-bold text-sm">{type.label}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-200 mb-1">Nombre de columna</label>
            <input
              className="w-full px-2 py-2 rounded bg-white/70 border border-cyan-200 dark:bg-[#2b3437]/70 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              value={colNameInput}
              onChange={e => setColNameInput(e.target.value)}
              placeholder="Ej: Cliente, Serie, Fecha, etc."
            />
          </div>
          <button
            className="w-full mt-3 px-4 py-2 rounded bg-cyan-600 text-white font-bold text-sm hover:bg-cyan-700 transition"
            onClick={() => {
              if (!colNameInput.trim()) return;
              const field = colNameInput.trim().toLowerCase().replace(/\s+/g, "_");
              setColumns(cols => [...cols, { label: colNameInput.trim().toUpperCase(), key: field, type: showColType, width: 120 }]);
              setShowAddColModal(false);
              setColNameInput("");
              setShowColType("text");
            }}
          >
            Agregar columna
          </button>
        </div>
        <div className="mt-3 text-center">
          <span className="text-xs text-cyan-400">Más columnas</span>
        </div>
      </GlassModal>
    );
  }

  // --- Modal agregar grupo
  function ModalAddGroup() {
    const [grpName, setGrpName] = useState("");
    return (
      <GlassModal open={showAddGroupModal} onClose={() => setShowAddGroupModal(false)}>
        <h3 className="font-bold text-xl text-cyan-700 mb-3">Agregar grupo</h3>
        <input className="w-full px-2 py-2 rounded bg-white/70 border-cyan-200 dark:bg-[#2b3437]/70 dark:border-gray-700 text-gray-900 dark:text-gray-100 mb-3"
          placeholder="Nombre del grupo"
          value={grpName}
          onChange={e => setGrpName(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setShowAddGroupModal(false)}
            className="px-3 py-1 rounded bg-gray-600 text-white text-xs font-bold hover:bg-gray-700">Cancelar</button>
          <button onClick={() => {
            if (grpName.trim()) {
              setGroups(gs => [
                ...gs,
                {
                  id: "g" + Math.random().toString(36).slice(2, 8),
                  name: grpName.trim(),
                  colorIdx: gs.length % GROUP_COLORS.length,
                  collapsed: false,
                  rows: [],
                }
              ]);
              setShowAddGroupModal(false);
            }
          }}
            className="px-3 py-1 rounded bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-700">Agregar</button>
        </div>
      </GlassModal>
    );
  }

  // --- Render de la tabla tipo Monday
  function renderTable() {
    const filterRow = row =>
      (!search || columns.some(col => (row[col.key] + "").toLowerCase().includes(search.toLowerCase())));

    const onDragEnd = (result) => {
      if (!result.destination) return;
      // Reordenar grupos
      if (result.type === "group") {
        const newGroups = Array.from(groups);
        const [removed] = newGroups.splice(result.source.index, 1);
        newGroups.splice(result.destination.index, 0, removed);
        setGroups(newGroups);
      }
      // Reordenar filas dentro de grupo
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
      // Reordenar columnas
      if (result.type === "column") {
        const newCols = Array.from(columns);
        const [removed] = newCols.splice(result.source.index, 1);
        newCols.splice(result.destination.index, 0, removed);
        setColumns(newCols);
      }
    };

    // Selección de filas
    const isSelected = (gidx, ridx) => selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx);
    const toggleRow = (gidx, ridx) => {
      setSelectedRows(prev => {
        const idx = prev.findIndex(sel => sel.gidx === gidx && sel.ridx === ridx);
        if (idx > -1) return prev.filter((_, i) => i !== idx);
        else return [...prev, { gidx, ridx }];
      });
    };
    const handleDeleteSelected = () => {
      if (window.confirm("¿Eliminar los elementos seleccionados?")) {
        setGroups(gs => gs.map((g, gidx) => ({
          ...g,
          rows: g.rows.filter((_, ridx) => !selectedRows.some(sel => sel.gidx === gidx && sel.ridx === ridx))
        })));
        setSelectedRows([]);
      }
    };

    return (
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="groups" type="group">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef}>
              {groups.map((group, gidx) => (
                <Draggable draggableId={group.id} index={gidx} key={group.id}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} className="mb-2">
                      {/* Header grupo */}
                      <div
                        className={clsx(
                          "flex items-center px-3 py-2 font-bold text-base z-10 select-none rounded-t-xl",
                          GROUP_COLORS[group.colorIdx % GROUP_COLORS.length]
                        )}
                      >
                        <span {...prov.dragHandleProps} className="cursor-grab pr-1">
                          {group.collapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                        </span>
                        <button className="flex-1 text-left" onClick={() => {
                          setGroups(gs => gs.map((g, i) => i === gidx ? { ...g, collapsed: !g.collapsed } : g));
                        }}>
                          <span>{group.name}</span>
                          <span className="ml-2 text-xs opacity-70">{group.rows.length} Folio(s)</span>
                        </button>
                        <button className="ml-3 p-1 rounded hover:bg-cyan-950/30" onClick={() => {
                          const name = prompt("Nuevo nombre de grupo:", group.name);
                          if (name) setGroups(gs => gs.map((g, i) => i === gidx ? { ...g, name } : g));
                        }}><Pencil size={15} /></button>
                        <button className="ml-1 p-1 rounded hover:bg-red-700/30" onClick={() => {
                          if (window.confirm("¿Eliminar este grupo y todo su contenido?")) {
                            setGroups(gs => gs.filter((_, i) => i !== gidx));
                          }
                        }}><Trash2 size={15} /></button>
                        <button className="ml-3 px-3 py-1 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white shadow" onClick={() => {
                          setGroups(gs => gs.map((g, i) => i === gidx
                            ? { ...g, rows: [...g.rows, { id: "r" + Math.random().toString(36).slice(2, 8) }] }
                            : g));
                        }}>
                          <Plus size={13} /> Folio
                        </button>
                      </div>
                      {!group.collapsed && (
                        <Droppable droppableId={"group-" + gidx} type="row">
                          {(provRow) => (
                            <div ref={provRow.innerRef} {...provRow.droppableProps} className="overflow-x-auto bg-neutral-950/95 border border-cyan-900/30 rounded-b-2xl shadow-xl">
                              {/* Encabezado columnas */}
                              <Droppable droppableId="columns" direction="horizontal" type="column">
                                {(provCol) => (
                                  <table className="min-w-[900px] w-full" ref={provCol.innerRef} {...provCol.droppableProps}>
                                    <thead>
                                      <tr className="bg-neutral-900 border-b border-cyan-900/40">
                                        <th />
                                        {columns.map((col, cidx) =>
                                          <Draggable draggableId={col.key} index={cidx} key={col.key}>
                                            {(provC) => (
                                              <th ref={provC.innerRef} {...provC.draggableProps}
                                                className="text-left px-3 py-2 text-xs font-bold text-neutral-200 uppercase relative group transition"
                                                style={{ width: col.width }}
                                              >
                                                <span {...provC.dragHandleProps} className="cursor-grab">
                                                  {
                                                    COLUMN_TYPE_CATEGORIES.flatMap(x => x.types)
                                                      .find(x => x.key === col.type)?.icon
                                                  }
                                                </span>{" "}
                                                {col.label}
                                                <button className="ml-2 opacity-50 hover:opacity-100" onClick={() => setOpenColMenuKey(col.key)}>
                                                  <MoreVertical size={15} />
                                                </button>
                                                {/* Menú de columna */}
                                                {openColMenuKey === col.key && (
                                                  <div className="absolute top-8 left-0 z-50 w-40 bg-neutral-800 border border-cyan-700/30 rounded-xl shadow-2xl p-2 animate-fadein">
                                                    <button
                                                      className="flex items-center gap-2 px-2 py-1 w-full rounded hover:bg-cyan-700/40"
                                                      onClick={() => {
                                                        const name = prompt("Nuevo nombre:", col.label);
                                                        if (name)
                                                          setColumns(cols => cols.map((c, i) => i === cidx ? { ...c, label: name.toUpperCase() } : c));
                                                        setOpenColMenuKey(null);
                                                      }}
                                                    >
                                                      <Pencil size={14} /> Renombrar
                                                    </button>
                                                    <button
                                                      className="flex items-center gap-2 px-2 py-1 w-full rounded hover:bg-cyan-700/40"
                                                      onClick={() => {
                                                        setColumns(cols => [
                                                          ...cols.slice(0, cidx),
                                                          { ...col, key: col.key + "_" + Date.now() },
                                                          ...cols.slice(cidx)
                                                        ]);
                                                        setOpenColMenuKey(null);
                                                      }}
                                                    >
                                                      <Plus size={14} /> Duplicar
                                                    </button>
                                                    <button
                                                      className="flex items-center gap-2 px-2 py-1 w-full rounded hover:bg-rose-700/30 text-rose-400"
                                                      onClick={() => {
                                                        if (window.confirm("¿Eliminar columna?"))
                                                          setColumns(cols => cols.filter((_, i) => i !== cidx));
                                                        setOpenColMenuKey(null);
                                                      }}
                                                    >
                                                      <Trash2 size={14} /> Eliminar
                                                    </button>
                                                  </div>
                                                )}
                                              </th>
                                            )}
                                          </Draggable>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.rows.filter(filterRow).map((row, ridx) =>
                                        <Draggable draggableId={row.id} index={ridx} key={row.id}>
                                          {(provR) => (
                                            <tr ref={provR.innerRef} {...provR.draggableProps}
                                              className={clsx(
                                                "hover:bg-cyan-950/20 transition border-b border-cyan-900/30 text-neutral-100",
                                                isSelected(gidx, ridx) && "bg-cyan-900/40"
                                              )}
                                            >
                                              <td className="px-2">
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected(gidx, ridx)}
                                                  onChange={() => toggleRow(gidx, ridx)}
                                                  className="accent-cyan-500 w-4 h-4"
                                                />
                                              </td>
                                              {columns.map((col, cidx) => {
                                                const isEditing = editCell && editCell.gidx === gidx && editCell.ridx === ridx && editCell.colKey === col.key;
                                                if (isEditing) {
                                                  // Inputs PRO según tipo
                                                  if (col.type === "status") {
                                                    return (
                                                      <td key={col.key} className="px-3 py-2">
                                                        <select autoFocus className="rounded px-2 py-1 bg-neutral-800 text-white"
                                                          value={editValue}
                                                          onChange={e => setEditValue(e.target.value)}
                                                          onBlur={() => {
                                                            setGroups(gs => {
                                                              const ngs = [...gs];
                                                              ngs[gidx].rows[ridx][col.key] = editValue;
                                                              return ngs;
                                                            });
                                                            setEditCell(null);
                                                          }}>
                                                          {STATUS_OPTIONS.map(opt =>
                                                            <option key={opt.value} value={opt.value}>{opt.value}</option>
                                                          )}
                                                        </select>
                                                      </td>
                                                    );
                                                  }
                                                  if (col.type === "dropdown") {
                                                    return (
                                                      <td key={col.key} className="px-3 py-2">
                                                        <select autoFocus className="rounded px-2 py-1 bg-neutral-800 text-white"
                                                          value={editValue}
                                                          onChange={e => setEditValue(e.target.value)}
                                                          onBlur={() => {
                                                            setGroups(gs => {
                                                              const ngs = [...gs];
                                                              ngs[gidx].rows[ridx][col.key] = editValue;
                                                              return ngs;
                                                            });
                                                            setEditCell(null);
                                                          }}>
                                                          {DROPDOWN_OPTIONS.map(opt =>
                                                            <option key={opt.value} value={opt.value}>{opt.value}</option>
                                                          )}
                                                        </select>
                                                      </td>
                                                    );
                                                  }
                                                  if (col.type === "person") {
                                                    return (
                                                      <td key={col.key} className="px-3 py-2">
                                                        <select autoFocus className="rounded px-2 py-1 bg-neutral-800 text-white"
                                                          value={editValue}
                                                          onChange={e => setEditValue(e.target.value)}
                                                          onBlur={() => {
                                                            setGroups(gs => {
                                                              const ngs = [...gs];
                                                              ngs[gidx].rows[ridx][col.key] = editValue;
                                                              return ngs;
                                                            });
                                                            setEditCell(null);
                                                          }}>
                                                          <option value="">Sin asignar</option>
                                                          {PEOPLE.map(p =>
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                          )}
                                                        </select>
                                                      </td>
                                                    );
                                                  }
                                                  if (col.type === "checkbox") {
                                                    return (
                                                      <td key={col.key} className="px-3 py-2">
                                                        <input
                                                          type="checkbox"
                                                          checked={!!editValue}
                                                          onChange={e => setEditValue(e.target.checked)}
                                                          onBlur={() => {
                                                            setGroups(gs => {
                                                              const ngs = [...gs];
                                                              ngs[gidx].rows[ridx][col.key] = editValue;
                                                              return ngs;
                                                            });
                                                            setEditCell(null);
                                                          }}
                                                          className="w-5 h-5 accent-cyan-500"
                                                        />
                                                      </td>
                                                    );
                                                  }
                                                  if (col.type === "date") {
                                                    return (
                                                      <td key={col.key} className="px-3 py-2">
                                                        <input
                                                          autoFocus
                                                          type="date"
                                                          value={editValue}
                                                          className="rounded px-2 py-1 w-full bg-neutral-800 text-white border border-neutral-700"
                                                          onChange={e => setEditValue(e.target.value)}
                                                          onBlur={() => {
                                                            setGroups(gs => {
                                                              const ngs = [...gs];
                                                              ngs[gidx].rows[ridx][col.key] = editValue;
                                                              return ngs;
                                                            });
                                                            setEditCell(null);
                                                          }}
                                                        />
                                                      </td>
                                                    );
                                                  }
                                                  // Default: text, number, file
                                                  return (
                                                    <td key={col.key} className="px-3 py-2">
                                                      <input
                                                        autoFocus
                                                        type={col.type === "number" ? "number" : "text"}
                                                        className="rounded px-2 py-1 w-full bg-neutral-800 text-white border border-neutral-700"
                                                        value={editValue || ""}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={() => {
                                                          setGroups(gs => {
                                                            const ngs = [...gs];
                                                            ngs[gidx].rows[ridx][col.key] = editValue;
                                                            return ngs;
                                                          });
                                                          setEditCell(null);
                                                        }}
                                                      />
                                                    </td>
                                                  );
                                                }
                                                // Render normal
                                                return (
                                                  <td
                                                    key={col.key}
                                                    className="px-3 py-2 cursor-pointer select-none"
                                                    onClick={() => {
                                                      setEditCell({ gidx, ridx, colKey: col.key });
                                                      setEditValue(group.rows[ridx][col.key] || "");
                                                    }}
                                                  >
                                                    {renderCell(col.type, group.rows[ridx][col.key])}
                                                  </td>
                                                );
                                              })}
                                              <td className="pl-2">
                                                <span {...provR.dragHandleProps} className="cursor-grab text-cyan-400 hover:text-cyan-200"><ListChecks size={15} /></span>
                                              </td>
                                            </tr>
                                          )}
                                        </Draggable>
                                      )}
                                    </tbody>
                                  </table>
                                )}
                              </Droppable>
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
        {/* Barra flotante si hay selección */}
        {selectedRows.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 border border-cyan-700/40 rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-6 z-50 animate-fadein">
            <span className="text-cyan-300 font-bold">{selectedRows.length} Elemento{selectedRows.length > 1 && "s"} seleccionado{selectedRows.length > 1 && "s"}</span>
            <button className="flex flex-col items-center text-neutral-200 hover:text-cyan-400" title="Duplicar">
              <Copy size={20} />
              <span className="text-xs">Duplicar</span>
            </button>
            <button className="flex flex-col items-center text-neutral-200 hover:text-cyan-400" title="Exportar">
              <Download size={20} />
              <span className="text-xs">Exportar</span>
            </button>
            <button className="flex flex-col items-center text-neutral-200 hover:text-cyan-400" title="Archivar">
              <Archive size={20} />
              <span className="text-xs">Archivar</span>
            </button>
            <button className="flex flex-col items-center text-rose-400 hover:text-rose-600" title="Eliminar" onClick={handleDeleteSelected}>
              <Trash2 size={20} />
              <span className="text-xs">Eliminar</span>
            </button>
            <button className="flex flex-col items-center text-neutral-200 hover:text-cyan-400" title="Convertir">
              <Repeat size={20} />
              <span className="text-xs">Convertir</span>
            </button>
            <button className="flex flex-col items-center text-neutral-200 hover:text-cyan-400" title="Mover">
              <Move size={20} />
              <span className="text-xs">Mover</span>
            </button>
            <button className="flex flex-col items-center text-neutral-200 hover:text-cyan-400" title="Apps">
              <AppWindow size={20} />
              <span className="text-xs">Apps</span>
            </button>
            <button className="ml-3 flex items-center gap-1 text-neutral-400 hover:text-white" onClick={() => setSelectedRows([])}>
              <X size={23} />
            </button>
          </div>
        )}
      </DragDropContext>
    );
  }

  // ---- Render main ----
  return (
     <div className="flex bg-neutral-950 min-h-screen font-sans">
      <SidebarFriday active={currentScreen} onNavigate={navigateTo} />
      <div className="flex-1 ml-[235px] min-h-screen relative">
    <div className="bg-neutral-950 min-h-screen text-neutral-100 font-sans animate-fadein">
      {/* Header */}
      <div className="w-full sticky top-0 z-30 border-b border-neutral-900">
        <div className="flex items-center gap-2 px-4 py-2 bg-neutral-950">
          <button className="rounded hover:bg-neutral-900 p-2 mr-2" onClick={() => window.history.back()}>
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="flex gap-1 px-2 py-1 border-b border-neutral-800 bg-neutral-900 sticky top-[44px] z-20">
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1 rounded flex items-center gap-1 transition shadow"
            onClick={() => setShowAddColModal(true)}>
            <Plus size={16} /> Columna
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1 rounded flex items-center gap-1 transition shadow"
            onClick={() => setShowAddGroupModal(true)}>
            <Plus size={16} /> Grupo
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <input
                className="pl-8 pr-2 py-1 rounded bg-neutral-800 text-white border border-neutral-700 focus:ring-2 ring-cyan-400 w-44"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <Search size={16} className="absolute top-2 left-2 text-cyan-400" />
            </div>
            <button className="flex items-center gap-1 px-2 py-1 rounded text-neutral-200 hover:bg-neutral-800"><Filter size={16} />Filtrar</button>
          </div>
        </div>
      </div>

      {/* Vista */}
      <div className="max-w-[1500px] mx-auto mt-5">
        {renderTable()}
      </div>

      {/* Modales PRO */}
      {ModalAddColumn()}
      {ModalAddGroup()}

      <style>{`
        .animate-fadein{animation:fadein .32s cubic-bezier(.2,1,.22,1)}
        @keyframes fadein{from{opacity:0;transform:translateY(40px);}to{opacity:1;transform:translateY(0);}}
        ::-webkit-scrollbar{height:6px;background:#131313;}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:6px;}
        input, select { outline: none !important; }
      `}</style>
    </div>
   </div>
 </div>
  );
}
