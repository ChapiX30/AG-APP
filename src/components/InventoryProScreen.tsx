import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Upload, Download, Search, Filter, X, Trash2, Archive, ChevronDown,
  MoreVertical, Eye, EyeOff, Edit3, Tags, AlertTriangle, Box, RefreshCw, FileSpreadsheet
} from "lucide-react";
import * as XLSX from "xlsx";

/** =========================
 *  Tipos y utilidades
 *  ========================= */
type Row = Record<string, any>;

type ColumnMeta = {
  key: string;
  label: string;
  visible: boolean;
  width?: number;
};

type Decommission = {
  when: string;          // ISO date
  reason: string;
  by: string;            // opcional: persona logueada si luego conectas Auth
};

type LocalState = {
  columns: ColumnMeta[];
  rows: Row[];
  view: {
    search: string;
    filters: Record<string, string>;
    hiddenCols: string[];
    sortBy?: { key: string; dir: "asc" | "desc" };
  };
};

const STORAGE_KEY = "inventory-pro-state-v1";

/** Campos “sugeridos” si existen en tu Excel (no son obligatorios). */
const SUGGESTED_FIELDS = {
  id: ["id", "folio", "clave", "codigo"],
  item: ["articulo", "item", "equipo", "producto", "descripcion", "nombre"],
  category: ["categoria", "category", "tipo", "familia"],
  location: ["ubicacion", "location", "almacen", "area"],
  qty: ["cantidad", "qty", "existencia", "stock"],
  min: ["min", "minimo", "stockmin", "minstock"],
  status: ["estatus", "status", "estado"],
  notes: ["notas", "notes", "comentarios", "observaciones"],
};

/** normaliza encabezados del Excel a algo consistente */
function normalizeHeader(h: string): string {
  return h
    ?.toString()
    .trim()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
    .toLowerCase();
}

/** Mapea encabezados originales a labels bonitos */
function toNiceLabel(key: string): string {
  const up = key
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
  return up;
}

/** Intenta detectar columnas clave para UX PRO */
function guessKey(columns: ColumnMeta[], group: string[]): string | undefined {
  const keys = columns.map((c) => normalizeHeader(c.key));
  for (const candidate of group) {
    const idx = keys.findIndex((k) => k === candidate);
    if (idx >= 0) return columns[idx].key;
  }
  // contención parcial
  for (const candidate of group) {
    const found = columns.find((c) => normalizeHeader(c.key).includes(candidate));
    if (found) return found.key;
  }
  return undefined;
}

/** Excel helpers */
function exportToXlsx(fileName: string, rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

/** =========================
 *  Componentes UI mínimos
 *  ========================= */
const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "outline"; size?: "sm" | "md" }
> = ({ className = "", variant = "solid", size = "md", ...props }) => {
  const base =
    "inline-flex items-center gap-2 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2";
  const pv =
    variant === "solid"
      ? "bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-400"
      : variant === "outline"
      ? "border border-zinc-300 hover:bg-zinc-100 text-zinc-800 dark:text-zinc-200 dark:border-zinc-700 dark:hover:bg-zinc-800"
      : "hover:bg-zinc-100 text-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800";
  const ps = size === "sm" ? "px-2 py-1 text-sm" : "px-3 py-2";
  return <button className={`${base} ${pv} ${ps} ${className}`} {...props} />;
};

const Chip: React.FC<{ color?: "green" | "red" | "amber" | "zinc"; children: React.ReactNode }> = ({
  color = "zinc",
  children,
}) => {
  const map: Record<string, string> = {
    green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    zinc: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[color]}`}>{children}</span>;
};

const ToolbarSeparator = () => <div className="w-px h-7 bg-zinc-300 dark:bg-zinc-700 mx-2" />;

/** =========================
 *  Modal de Baja (decommission)
 *  ========================= */
const DecommissionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: Decommission) => void;
  count: number;
}> = ({ open, onClose, onConfirm, count }) => {
  const [reason, setReason] = useState("");
  const [by, setBy] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setBy("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl w-full max-w-lg p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Dar de baja {count} elemento(s)</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Dañado, obsoleto, extraviado, etc."
              className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent p-2"
              rows={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Responsable (opcional)</label>
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              placeholder="Nombre de quien da de baja"
              className="mt-1 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent p-2"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                onConfirm({
                  when: new Date().toISOString(),
                  reason: reason.trim(),
                  by: by.trim(),
                })
              }
            >
              Confirmar baja
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** =========================
 *  Tabla editable PRO
 *  ========================= */
const EditableCell: React.FC<{
  value: any;
  onChange: (v: any) => void;
  isNumber?: boolean;
}> = ({ value, onChange, isNumber }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return editing ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(isNumber ? Number(e.target.value) : e.target.value)}
      onBlur={() => {
        setEditing(false);
        onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          onChange(draft);
        } else if (e.key === "Escape") {
          setEditing(false);
          setDraft(value ?? "");
        }
      }}
      className="w-full bg-transparent border-none focus:outline-none text-sm"
      type={isNumber ? "number" : "text"}
    />
  ) : (
    <div
      className="w-full h-full cursor-text"
      onDoubleClick={() => setEditing(true)}
      title="Doble click para editar"
    >
      {value !== undefined && value !== null && value !== "" ? String(value) : <span className="text-zinc-400">—</span>}
    </div>
  );
};

/** =========================
 *  Screen principal
 *  ========================= */
export const InventoryProScreen: React.FC = () => {
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<{ key: string; dir: "asc" | "desc" }>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showColsMenu, setShowColsMenu] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showDecom, setShowDecom] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar estado previo si existe
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const s: LocalState = JSON.parse(raw);
        setColumns(s.columns);
        setRows(s.rows);
        setSearch(s.view.search);
        setFilters(s.view.filters || {});
        setHiddenCols(s.view.hiddenCols || []);
        setSortBy(s.view.sortBy);
      } catch {
        // nada
      }
    }
  }, []);

  // Persistencia
  useEffect(() => {
    const state: LocalState = {
      columns,
      rows,
      view: { search, filters, hiddenCols, sortBy },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [columns, rows, search, filters, hiddenCols, sortBy]);

  /** Importar Excel */
  const handleImportXlsx = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });

    if (!json.length) {
      alert("La hoja está vacía.");
      return;
    }

    // construir columnas desde headers
    const keys = Object.keys(json[0]);
    const cols: ColumnMeta[] = keys.map((k) => ({
      key: k,
      label: toNiceLabel(k),
      visible: true,
    }));

    setColumns(cols);
    setRows(json);
    setSelected(new Set());

    // Activar columnas útiles primero si existen
    const qtyKey = guessKey(cols, SUGGESTED_FIELDS.qty);
    const minKey = guessKey(cols, SUGGESTED_FIELDS.min);
    if (qtyKey || minKey) {
      // si existieran, mantenlas visibles; el resto también por default
    }
  };

  /** Exportar Excel */
  const handleExport = () => {
    exportToXlsx("Inventario", rows);
  };

  /** Agregar fila */
  const addRow = () => {
    const blank: Row = {};
    columns.forEach((c) => (blank[c.key] = ""));
    setRows((r) => [blank, ...r]);
  };

  /** Eliminar filas seleccionadas */
  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} fila(s) del inventario?`)) return;
    setRows((r) => r.filter((_, idx) => !selected.has(idx)));
    setSelected(new Set());
  };

  /** Baja con motivo (marca en "status" y agrega historial de baja en "notes") */
  const confirmDecommission = (payload: Decommission) => {
    const statusKey = guessKey(columns, SUGGESTED_FIELDS.status) || "status";
    const notesKey = guessKey(columns, SUGGESTED_FIELDS.notes) || "notes";

    setRows((r) =>
      r.map((row, idx) => {
        if (selected.has(idx)) {
          const updated: Row = { ...row };
          updated[statusKey] = "Baja";
          const tag = `[BAJA ${payload.when.slice(0, 10)}${payload.by ? ` por ${payload.by}` : ""}] ${payload.reason}`;
          updated[notesKey] = updated[notesKey] ? `${updated[notesKey]} | ${tag}` : tag;
          return updated;
        }
        return row;
      })
    );
    setSelected(new Set());
    setShowDecom(false);
  };

  /** Cambios de celda */
  const updateCell = (rowIndex: number, key: string, value: any) => {
    setRows((r) => {
      const copy = [...r];
      copy[rowIndex] = { ...copy[rowIndex], [key]: value };
      return copy;
    });
  };

  /** Ocultar/mostrar columnas */
  const toggleColumn = (key: string) => {
    setHiddenCols((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };

  /** Datos derivados: búsqueda, filtros, sort */
  const processedRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const hasSearch = s.length > 0;

    let out = rows.filter((row) => {
      // filtros exactos por columna
      for (const [k, v] of Object.entries(filters)) {
        if (!v) continue;
        const val = (row[k] ?? "").toString().toLowerCase();
        if (!val.includes(v.toLowerCase())) return false;
      }
      if (!hasSearch) return true;
      // búsqueda global
      for (const col of columns) {
        const val = (row[col.key] ?? "").toString().toLowerCase();
        if (val.includes(s)) return true;
      }
      return false;
    });

    if (sortBy) {
      const { key, dir } = sortBy;
      out = [...out].sort((a, b) => {
        const va = (a[key] ?? "").toString();
        const vb = (b[key] ?? "").toString();
        const na = Number(va);
        const nb = Number(vb);
        const bothNum = !isNaN(na) && !isNaN(nb);
        const cmp = bothNum ? na - nb : va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      });
    }

    return out;
  }, [rows, search, filters, columns, sortBy]);

  const visibleColumns = columns.filter((c) => !hiddenCols.includes(c.key));

  /** Helpers para resaltar bajo stock */
  const qtyKey = guessKey(columns, SUGGESTED_FIELDS.qty);
  const minKey = guessKey(columns, SUGGESTED_FIELDS.min);

  /** Selección */
  const allVisibleSelected =
    processedRows.length > 0 &&
    processedRows.every((row) => {
      const idx = rows.indexOf(row);
      return selected.has(idx);
    });

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      // deseleccionar solo los visibles
      const next = new Set(selected);
      processedRows.forEach((row) => {
        const idx = rows.indexOf(row);
        next.delete(idx);
      });
      setSelected(next);
    } else {
      const next = new Set(selected);
      processedRows.forEach((row) => {
        const idx = rows.indexOf(row);
        next.add(idx);
      });
      setSelected(next);
    }
  };

  const onHeaderClickSort = (key: string) => {
    setSortBy((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return undefined;
    });
  };

  /** Render */
  return (
    <div className="h-full w-full p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Box className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Inventario PRO</h1>
            <p className="text-sm text-zinc-500">
              Importa tu Excel, edita en línea, aplica filtros, da de baja y exporta.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportXlsx(f);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4" />
            Importar Excel
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button onClick={addRow}>
            <Plus className="w-4 h-4" />
            Agregar
          </Button>
        </div>
      </div>

      {/* Toolbar de vista */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en todo…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <ToolbarSeparator />

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowFilter((v) => !v)}>
            <Filter className="w-4 h-4" />
            Filtros
            <ChevronDown className="w-4 h-4" />
          </Button>

          <div className="relative">
            <Button variant="outline" onClick={() => setShowColsMenu((v) => !v)}>
              <MoreVertical className="w-4 h-4" />
              Columnas
            </Button>
            {showColsMenu && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-30 p-2"
                onMouseLeave={() => setShowColsMenu(false)}
              >
                <div className="text-xs px-2 py-1 text-zinc-500">Mostrar / ocultar</div>
                <div className="max-h-64 overflow-auto">
                  {columns.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenCols.includes(c.key)}
                        onChange={() => toggleColumn(c.key)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel de filtros por columna */}
      {showFilter && (
        <div className="mb-3 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {visibleColumns.slice(0, 12).map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <span className="text-xs w-28 text-zinc-500">{c.label}</span>
                <input
                  value={filters[c.key] ?? ""}
                  onChange={(e) =>
                    setFilters((f) => {
                      const next = { ...f, [c.key]: e.target.value };
                      if (!e.target.value) delete next[c.key];
                      return next;
                    })
                  }
                  placeholder="filtrar…"
                  className="flex-1 bg-transparent border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setFilters({})}>
              Limpiar filtros
            </Button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 w-10">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              </th>
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-left font-semibold select-none cursor-pointer whitespace-nowrap"
                  onClick={() => onHeaderClickSort(c.key)}
                  title="Click para ordenar"
                >
                  <div className="flex items-center gap-2">
                    {c.label}
                    {sortBy?.key === c.key ? (
                      <span className="text-zinc-400">{sortBy.dir === "asc" ? "▲" : "▼"}</span>
                    ) : (
                      <span className="text-zinc-300">↕</span>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {processedRows.map((row, i) => {
              const idx = rows.indexOf(row);
              const isSelected = selected.has(idx);

              // Resaltado bajo stock
              const qty = qtyKey ? Number(row[qtyKey] ?? 0) : undefined;
              const min = minKey ? Number(row[minKey] ?? 0) : undefined;
              const low = qtyKey && minKey && !isNaN(qty!) && !isNaN(min!) && qty! < min!;

              return (
                <tr
                  key={idx}
                  className={`border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/50 ${
                    low ? "bg-amber-50/60 dark:bg-amber-900/10" : ""
                  }`}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(idx);
                        else next.delete(idx);
                        setSelected(next);
                      }}
                    />
                  </td>

                  {visibleColumns.map((c) => {
                    const isNumeric = [SUGGESTED_FIELDS.qty, SUGGESTED_FIELDS.min]
                      .flat()
                      .some((k) => normalizeHeader(c.key) === k);

                    // Chip visual para status si existe
                    const isStatus =
                      normalizeHeader(c.key) === "status" ||
                      SUGGESTED_FIELDS.status.includes(normalizeHeader(c.key));

                    const val = row[c.key];

                    return (
                      <td key={c.key} className="px-3 py-2 align-top whitespace-nowrap">
                        {isStatus ? (
                          <div className="flex items-center gap-2">
                            {String(val).toLowerCase() === "baja" ? (
                              <Chip color="red">Baja</Chip>
                            ) : String(val).toLowerCase() === "activo" ? (
                              <Chip color="green">Activo</Chip>
                            ) : (
                              <Chip>{val || "—"}</Chip>
                            )}
                            <EditableCell
                              value={val}
                              onChange={(v) => updateCell(idx, c.key, v)}
                              isNumber={false}
                            />
                          </div>
                        ) : (
                          <EditableCell value={val} onChange={(v) => updateCell(idx, c.key, v)} isNumber={isNumeric} />
                        )}
                      </td>
                    );
                  })}

                  <td className="px-3 py-2">
                    <button
                      className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      title="Limpiar fila"
                      onClick={() => {
                        const blank: Row = { ...row };
                        visibleColumns.forEach((c) => (blank[c.key] = ""));
                        setRows((r) => {
                          const copy = [...r];
                          copy[idx] = blank;
                          return copy;
                        });
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {processedRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="text-center text-zinc-500 py-10">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="w-8 h-8" />
                      <div className="font-medium">No hay datos</div>
                      <div className="text-sm">Importa un Excel o agrega filas nuevas.</div>
                    </div>
                  ) : (
                    "Sin resultados con los filtros/búsqueda actuales."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barra flotante de acciones masivas (tipo Monday) */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full shadow-2xl">
            <span className="text-sm px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
              {selected.size} seleccionad{selected.size === 1 ? "o" : "os"}
            </span>
            <Button variant="ghost" onClick={() => setShowDecom(true)}>
              <Archive className="w-4 h-4" />
              Dar de baja
            </Button>
            <Button variant="ghost" onClick={deleteSelected}>
              <Trash2 className="w-4 h-4" />
              Eliminar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                // ejemplo: marcar Activo
                const statusKey = guessKey(columns, SUGGESTED_FIELDS.status) || "status";
                setRows((r) =>
                  r.map((row, idx) => (selected.has(idx) ? { ...row, [statusKey]: "Activo" } : row))
                );
                setSelected(new Set());
              }}
            >
              <Tags className="w-4 h-4" />
              Marcar Activo
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="w-4 h-4" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Hint bajo stock */}
      {qtyKey && minKey && (
        <div className="flex items-center gap-2 mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Las filas en color ámbar indican stock por debajo del mínimo.</span>
        </div>
      )}

      {/* Modal de baja */}
      <DecommissionModal
        open={showDecom}
        onClose={() => setShowDecom(false)}
        onConfirm={confirmDecommission}
        count={selected.size}
      />
    </div>
  );
};

/** =========================
 *  Estilos base (opcional)
 *  — Si ya usas Tailwind, esto ya luce PRO en dark/light.
 *  =========================
 *  Si NO usas Tailwind, agrega estas clases o reemplaza por tus utilidades.
 */
