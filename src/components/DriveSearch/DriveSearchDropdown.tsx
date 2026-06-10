import React from "react";
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { getFolderVisualStyle } from "../../utils/fileUtils";
import { HighlightText } from "./HighlightText";
import {
  formatDate,
  formatFileSize,
  getFileColorBg,
  getFileIcon,
  getFileWorkDate,
} from "./driveSearchDisplay";
import type { SearchSuggestion } from "./types";

export type DriveSearchDropdownProps = {
  open: boolean;
  activeSearchTerm: string;
  isFilterPending: boolean;
  resultCount: number;
  suggestions: SearchSuggestion[];
  activeIndex: number;
  catalogLoading: boolean;
  onActiveIndexChange: (index: number) => void;
  onSelectSuggestion: (item: SearchSuggestion) => void;
  onClose: () => void;
  onViewAllResults: () => void;
};

export const DriveSearchDropdown = React.memo(function DriveSearchDropdown({
  open,
  activeSearchTerm,
  isFilterPending,
  resultCount,
  suggestions,
  activeIndex,
  catalogLoading,
  onActiveIndexChange,
  onSelectSuggestion,
  onClose,
  onViewAllResults,
}: DriveSearchDropdownProps) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-900/10"
        aria-hidden
        onMouseDown={onClose}
      />
      <div className="absolute left-0 top-full z-[70] w-full min-w-[280px] sm:min-w-[420px]">
        <div className="rounded-b-xl border border-t-0 border-[#2464A3]/25 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-600 truncate">
              Resultados para «{activeSearchTerm}»
            </p>
            <span className="text-[10px] text-slate-400 flex-shrink-0 inline-flex items-center gap-1.5">
              {isFilterPending && <Loader2 size={10} className="animate-spin" />}
              {resultCount} encontrado{resultCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="max-h-[min(380px,52vh)] overflow-y-auto overscroll-contain">
            {suggestions.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                {catalogLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Buscando…
                  </span>
                ) : (
                  <>
                    Sin coincidencias para «
                    <span className="font-semibold text-slate-500">{activeSearchTerm}</span>»
                  </>
                )}
              </div>
            ) : (
              <div className="py-1">
                {suggestions.map((item, idx) => {
                  const active = idx === activeIndex;
                  if (item.kind === "folder") {
                    const style = getFolderVisualStyle(item.folder.name);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onMouseEnter={() => onActiveIndexChange(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectSuggestion(item);
                        }}
                        className={clsx(
                          "w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                          active ? "bg-[#2464A3]/10" : "hover:bg-slate-50"
                        )}
                      >
                        <div
                          className={clsx(
                            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                            style.bg
                          )}
                        >
                          <Folder size={17} className={clsx(style.icon, style.fill)} />
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            <HighlightText text={item.folder.name} query={activeSearchTerm} />
                          </p>
                          <p className="text-[10px] text-slate-400">Carpeta</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                      </button>
                    );
                  }
                  const f = item.file;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onMouseEnter={() => onActiveIndexChange(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelectSuggestion(item);
                      }}
                      className={clsx(
                        "w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                        active ? "bg-[#2464A3]/10" : "hover:bg-slate-50"
                      )}
                    >
                      <div
                        className={clsx(
                          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                          getFileColorBg(f.name)
                        )}
                      >
                        {getFileIcon(f.name, 17)}
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden pr-1">
                        <p
                          className="text-sm font-medium text-slate-800 truncate"
                          title={f.name}
                        >
                          <HighlightText text={f.name} query={activeSearchTerm} />
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {f.isPendingWorksheet ? (
                            <span className="text-amber-600 font-semibold">
                              Sin PDF · generar
                            </span>
                          ) : (
                            <>
                              {f.parentFolder && f.parentFolder !== "Raíz" && (
                                <span className="inline-flex items-center gap-0.5 mr-1.5">
                                  <FolderOpen size={9} />
                                  {f.parentFolder}
                                </span>
                              )}
                              <span>{formatDate(getFileWorkDate(f))}</span>
                              {f.size ? (
                                <span className="ml-1.5">{formatFileSize(f.size)}</span>
                              ) : null}
                            </>
                          )}
                        </p>
                      </div>
                      {f.reviewed ? (
                        <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                      ) : f.completed ? (
                        <Eye size={14} className="text-blue-500 flex-shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-3.5 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400">↑↓ navegar · Enter abrir</span>
            {resultCount > 0 && (
              <button
                type="button"
                onClick={onViewAllResults}
                className="text-[10px] font-semibold text-[#2464A3] hover:underline flex-shrink-0"
              >
                Ver lista completa ({resultCount})
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
});
