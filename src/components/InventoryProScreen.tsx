import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, ArrowLeft, Search, X, Trash2, Archive, Tags, AlertTriangle, Box, UserCheck, RotateCw,
} from "lucide-react";

// ======= TIPOS ============
type Tool = {
  nombre: string;
  cantidad: number;
  disponible: number;
  ubicacion: string;
  estado: "Disponible" | "Prestado" | "Baja";
  responsable?: string;
  notas?: string;
  [key: string]: any;
};

// Para modal de préstamo
type PrestamoPayload = {
  responsable: string;
  cantidad: number;
};

// =========== COMPONENTE ===============
const STORAGE_KEY = "inventory-herramientas-v2";

const defaultColumns = [
  { key: "nombre", label: "Herramienta", width: 170 },
  { key: "cantidad", label: "Cantidad Total", width: 100 },
  { key: "disponible", label: "Disponible", width: 100 },
  { key: "ubicacion", label: "Ubicación", width: 120 },
  { key: "estado", label: "Estado", width: 100 },
  { key: "responsable", label: "Responsable", width: 140 },
  { key: "notas", label: "Notas", width: 180 },
];

export default function InventoryProScreen({ onBack }: { onBack: () => void }) {
  // Estados
  const [rows, setRows] = useState<Tool[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showPrestamo, setShowPrestamo] = useState(false);
  const [prestamoCantidad, setPrestamoCantidad] = useState(1);
  const [prestamoResponsable, setPrestamoResponsable] = useState("");
  const [showBaja, setShowBaja] = useState(false);

  // Swipe-back (retroceso en móvil)
  const touchStartX = useRef<number | null>(null);
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current !== null) {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx > 70 && onBack) onBack(); // swipe derecho para regresar
      }
      touchStartX.current = null;
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onBack]);

  // Persistencia local
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setRows(JSON.parse(raw));
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  // Búsqueda filtrada
  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      row =>
        row.nombre?.toLowerCase().includes(s) ||
        row.ubicacion?.toLowerCase().includes(s) ||
        row.estado?.toLowerCase().includes(s) ||
        row.responsable?.toLowerCase().includes(s) ||
        row.notas?.toLowerCase().includes(s)
    );
  }, [search, rows]);

  // ===== HANDLERS =============
  // Agregar herramienta
  const addRow = () => {
    setRows([
      {
        nombre: "",
        cantidad: 1,
        disponible: 1,
        ubicacion: "",
        estado: "Disponible",
        responsable: "",
        notas: "",
      },
      ...rows,
    ]);
  };

  // Editar celda
  const updateCell = (idx: number, key: string, value: any) => {
    setRows(r => {
      const next = [...r];
      next[idx] = { ...next[idx], [key]: value };
      if (key === "cantidad") {
        // Ajustar disponible si cantidad baja
        const dif = Number(value) - Number(next[idx].cantidad ?? 0);
        next[idx].disponible = Math.max(0, Number(next[idx].disponible) + dif);
      }
      return next;
    });
  };

  // Eliminar herramienta
  const deleteSelected = () => {
    if (!selected.size) return;
    if (!window.confirm(`¿Eliminar ${selected.size} herramienta(s)?`)) return;
    setRows(r => r.filter((_, idx) => !selected.has(idx)));
    setSelected(new Set());
  };

  // Pedir prestado
  const handlePrestamo = () => {
    if (!prestamoResponsable.trim()) {
      alert("Captura el nombre del responsable.");
      return;
    }
    setRows(r =>
      r.map((row, idx) => {
        if (!selected.has(idx)) return row;
        // Solo si hay disponibles
        if (row.disponible < prestamoCantidad) return row;
        return {
          ...row,
          disponible: row.disponible - prestamoCantidad,
          estado: row.disponible - prestamoCantidad === 0 ? "Prestado" : "Disponible",
          responsable: prestamoResponsable,
          notas: row.notas
            ? row.notas + ` | Prestado x${prestamoCantidad} a ${prestamoResponsable} (${new Date().toLocaleDateString()})`
            : `Prestado x${prestamoCantidad} a ${prestamoResponsable} (${new Date().toLocaleDateString()})`,
        };
      })
    );
    setShowPrestamo(false);
    setPrestamoResponsable("");
    setPrestamoCantidad(1);
    setSelected(new Set());
  };

  // Devolver herramienta (regresar una o todas)
  const devolverSeleccionados = () => {
    setRows(r =>
      r.map((row, idx) => {
        if (!selected.has(idx)) return row;
        return {
          ...row,
          disponible: row.cantidad,
          estado: "Disponible",
          responsable: "",
          notas: row.notas
            ? row.notas + ` | Devuelta el ${new Date().toLocaleDateString()}`
            : `Devuelta el ${new Date().toLocaleDateString()}`,
        };
      })
    );
    setSelected(new Set());
  };

  // Dar de baja
  const darBajaSeleccionados = () => {
    setRows(r =>
      r.map((row, idx) => {
        if (!selected.has(idx)) return row;
        return {
          ...row,
          estado: "Baja",
          notas: row.notas
            ? row.notas + ` | Baja el ${new Date().toLocaleDateString()}`
            : `Baja el ${new Date().toLocaleDateString()}`,
        };
      })
    );
    setSelected(new Set());
    setShowBaja(false);
  };

  // ========== RENDER ===============
  return (
    <div className="h-full w-full p-4 md:p-8 bg-gradient-to-br from-zinc-100 via-white to-indigo-50 dark:from-zinc-900 dark:via-zinc-950 dark:to-indigo-950 transition-all">
      {/* Header */}
      <div className="flex items-center mb-6 gap-2">
        <button
          className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-900 shadow hover:bg-indigo-100 dark:hover:bg-indigo-900 transition"
          onClick={onBack}
          title="Regresar"
        >
          <ArrowLeft className="w-6 h-6 text-indigo-700" />
        </button>
        <Box className="w-8 h-8 text-indigo-600 ml-2" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario de Herramientas</h1>
          <p className="text-zinc-500 text-sm">
            Agrega, edita y controla préstamos fácilmente. ¡Sin subir Excel!
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar herramienta, ubicación, responsable…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-4 py-2 flex items-center gap-2 transition font-medium shadow"
          onClick={addRow}
        >
          <Plus className="w-5 h-5" /> Agregar herramienta
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-indigo-50 dark:bg-indigo-900/60 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 w-9">
                <input
                  type="checkbox"
                  checked={filteredRows.length > 0 && filteredRows.every(r => selected.has(rows.indexOf(r)))}
                  onChange={() => {
                    if (filteredRows.length === 0) return;
                    const allSelected = filteredRows.every(r => selected.has(rows.indexOf(r)));
                    if (allSelected) {
                      setSelected(prev => {
                        const next = new Set(prev);
                        filteredRows.forEach(r => next.delete(rows.indexOf(r)));
                        return next;
                      });
                    } else {
                      setSelected(prev => {
                        const next = new Set(prev);
                        filteredRows.forEach(r => next.add(rows.indexOf(r)));
                        return next;
                      });
                    }
                  }}
                />
              </th>
              {defaultColumns.map(col => (
                <th key={col.key} className="px-3 py-2 font-semibold text-zinc-800 dark:text-zinc-100 whitespace-nowrap" style={{ width: col.width }}>
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={defaultColumns.length + 2} className="py-12 text-center text-zinc-400">
                  <RotateCw className="w-8 h-8 mx-auto mb-2 animate-spin-slow" />
                  Sin herramientas registradas aún.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, i) => {
                const idx = rows.indexOf(row);
                const isSelected = selected.has(idx);
                return (
                  <tr
                    key={idx}
                    className={`border-t border-zinc-100 dark:border-zinc-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 ${
                      row.estado === "Baja"
                        ? "bg-red-50 dark:bg-red-900/10"
                        : row.estado === "Prestado"
                        ? "bg-yellow-50 dark:bg-amber-900/10"
                        : ""
                    }`}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          setSelected(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(idx);
                            else next.delete(idx);
                            return next;
                          });
                        }}
                      />
                    </td>
                    {defaultColumns.map(col => (
                      <td key={col.key} className="px-3 py-2 whitespace-nowrap align-top">
                        <EditableCell
                          value={row[col.key]}
                          onChange={v => updateCell(idx, col.key, v)}
                          isNumber={col.key === "cantidad" || col.key === "disponible"}
                          disabled={col.key === "disponible" || (col.key === "responsable" && row.estado !== "Prestado")}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <button
                        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Limpiar fila"
                        onClick={() => {
                          setRows(r => {
                            const next = [...r];
                            next[idx] = {
                              nombre: "",
                              cantidad: 1,
                              disponible: 1,
                              ubicacion: "",
                              estado: "Disponible",
                              responsable: "",
                              notas: "",
                            };
                            return next;
                          });
                        }}
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Barra flotante de acciones */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-2xl">
            <span className="text-sm px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
              {selected.size} seleccionad{selected.size === 1 ? "a" : "as"}
            </span>
            <button
              className="flex items-center gap-1 text-amber-700 dark:text-amber-300 hover:underline font-medium"
              onClick={() => setShowPrestamo(true)}
            >
              <UserCheck className="w-4 h-4" /> Pedir prestado
            </button>
            <button
              className="flex items-center gap-1 text-green-700 dark:text-green-300 hover:underline font-medium"
              onClick={devolverSeleccionados}
            >
              <Tags className="w-4 h-4" /> Devolver
            </button>
            <button
              className="flex items-center gap-1 text-red-700 dark:text-red-300 hover:underline font-medium"
              onClick={() => setShowBaja(true)}
            >
              <Archive className="w-4 h-4" /> Dar de baja
            </button>
            <button
              className="flex items-center gap-1 text-zinc-700 dark:text-zinc-300 hover:underline font-medium"
              onClick={deleteSelected}
            >
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
            <button
              className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 hover:underline font-medium"
              onClick={() => setSelected(new Set())}
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Hint */}
      <div className="flex items-center gap-2 mt-3 text-sm text-zinc-600 dark:text-zinc-300">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <span>
          Las filas en amarillo son herramientas prestadas. En rojo: herramientas dadas de baja.
        </span>
      </div>

      {/* MODAL PRESTAMO */}
      {showPrestamo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPrestamo(false)} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl w-full max-w-xs p-6 shadow-2xl">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-6 h-6 text-indigo-600" />
                <h3 className="text-lg font-semibold">Pedir prestado</h3>
              </div>
              <label className="text-sm font-medium">Responsable:</label>
              <input
                value={prestamoResponsable}
                onChange={e => setPrestamoResponsable(e.target.value)}
                placeholder="Nombre de quien solicita"
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 text-sm"
                autoFocus
              />
              <label className="text-sm font-medium">Cantidad:</label>
              <input
                type="number"
                min={1}
                max={Math.min(
                  ...Array.from(selected).map(idx => rows[idx]?.disponible ?? 1)
                )}
                value={prestamoCantidad}
                onChange={e => setPrestamoCantidad(Number(e.target.value))}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 text-sm"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
                  onClick={() => setShowPrestamo(false)}
                >
                  Cancelar
                </button>
                <button
                  className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                  onClick={handlePrestamo}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BAJA */}
      {showBaja && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBaja(false)} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl w-full max-w-xs p-6 shadow-2xl">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <Archive className="w-6 h-6 text-red-600" />
                <h3 className="text-lg font-semibold">Dar de baja</h3>
              </div>
              <div className="text-zinc-700 dark:text-zinc-200">
                ¿Dar de baja las herramientas seleccionadas?
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="px-3 py-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
                  onClick={() => setShowBaja(false)}
                >
                  Cancelar
                </button>
                <button
                  className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-semibold"
                  onClick={darBajaSeleccionados}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Celda editable ===============
function EditableCell({
  value,
  onChange,
  isNumber,
  disabled,
}: {
  value: any;
  onChange: (v: any) => void;
  isNumber?: boolean;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (disabled) {
    return (
      <div className="w-full text-zinc-400">{value !== undefined && value !== "" ? value : "—"}</div>
    );
  }

  return editing ? (
    <input
      autoFocus
      value={draft}
      type={isNumber ? "number" : "text"}
      onChange={e => setDraft(isNumber ? Number(e.target.value) : e.target.value)}
      onBlur={() => {
        setEditing(false);
        onChange(draft);
      }}
      onKeyDown={e => {
        if (e.key === "Enter") {
          setEditing(false);
          onChange(draft);
        } else if (e.key === "Escape") {
          setEditing(false);
          setDraft(value ?? "");
        }
      }}
      className="w-full bg-transparent border-none focus:outline-none text-sm"
    />
  ) : (
    <div
      className="w-full h-full cursor-text"
      onDoubleClick={() => setEditing(true)}
      title="Doble click para editar"
    >
      {value !== undefined && value !== "" ? String(value) : <span className="text-zinc-400">—</span>}
    </div>
  );
}
