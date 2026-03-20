import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, deleteDoc, setDoc, collection, getDocs, updateDoc, query, where, limit, orderBy } from "firebase/firestore";
import { storage, db, auth } from "../utils/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigation } from "../hooks/useNavigation";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Folder, Search, LayoutGrid, List, Trash2,
  CheckCircle2, FileText, Download, Star, Info, X,
  FolderPlus, UploadCloud, ChevronRight, File, Image as ImageIcon,
  FileCheck, Home, Filter, Clock, Eye, Settings,
  ArrowLeft, MoveRight, ArrowUp, FolderOpen,
  ArrowUpWideNarrow, Menu,
  AlertCircle, LogOut, Edit, CornerDownRight, Maximize2,
  RefreshCw, Zap, MessageSquare, Loader2, ChevronDown,
  MoreVertical, Plus, Grid3X3, Rows3, SortAsc, SortDesc,
  CalendarDays, HardDrive, Users, Shield, Bell, StarOff,
  FilePlus2, FolderSymlink, Tag, Share2, Copy, ExternalLink
} from "lucide-react";
import clsx from "clsx";
import labLogo from '../assets/lab_logo.png';

// ─────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────
interface DriveFile {
  name: string;
  rawName: string;
  url: string;
  fullPath: string;
  updated: string;
  created: string;
  size?: number;
  contentType?: string;
  reviewed?: boolean;
  reviewedByName?: string;
  completed?: boolean;
  completedByName?: string;
  starred?: boolean;
  uploadedBy?: string;
  parentFolder?: string;
  keywords?: string[];
  notas?: string;
}

interface DriveFolder {
  name: string;
  fullPath: string;
}

interface UserData {
  name?: string;
  email?: string;
  puesto?: string;
  role?: string;
}

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'starred' | 'recent' | 'pending_review' | 'completed';
type SortType = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc' | 'sizeDesc' | 'sizeAsc';
type DragItemType = 'file' | 'folder' | null;

// ─────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
const normalizeText = (text: string) =>
  text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

const generateSearchTokens = (text: string): string[] => {
  if (!text) return [];
  const normalized = normalizeText(text);
  const parts = normalized.split(/[_ \-\.]+/).filter(p => p.length > 0);
  return [...new Set([normalized, ...parts])];
};

const fuzzyMatch = (file: DriveFile, searchTerms: string[]) => {
  const textToSearch = [
    file.name, file.rawName, file.uploadedBy,
    file.parentFolder, file.notas || "",
    ...(file.keywords || [])
  ].join(' ').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return searchTerms.every(term => textToSearch.includes(term));
};

const cleanFileName = (rawName: string) => {
  if (!rawName) return "Sin Nombre";
  let name = rawName.replace(/^worksheets_/, '');
  const indexAG = name.indexOf('_AG');
  if (indexAG !== -1) return name.substring(indexAG + 1);
  const firstUnderscore = name.indexOf('_');
  if (firstUnderscore !== -1) {
    const firstPart = name.substring(0, firstUnderscore);
    if (firstPart.includes(' ')) return name.substring(firstUnderscore + 1);
  }
  return name;
};

const getParentFolderName = (fullPath: string) => {
  const parts = fullPath.split('/');
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (parent === 'worksheets') return "Raíz";
    return parent;
  }
  return "Raíz";
};

const addBusinessDays = (startDate: Date, daysToAdd: number) => {
  let currentDate = new Date(startDate);
  let added = 0;
  while (added < daysToAdd) {
    currentDate.setDate(currentDate.getDate() + 1);
    const day = currentDate.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return currentDate;
};

const countBusinessDaysLeft = (deadlineDate: Date) => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
  if (current > target) {
    let overdue = 0;
    let temp = new Date(target);
    while (temp < current) {
      temp.setDate(temp.getDate() + 1);
      const d = temp.getDay();
      if (d !== 0 && d !== 6) overdue++;
    }
    return -overdue;
  }
  let days = 0;
  let temp = new Date(current);
  while (temp < target) {
    temp.setDate(temp.getDate() + 1);
    const d = temp.getDay();
    if (d !== 0 && d !== 6) days++;
  }
  return days;
};

const getDeadlineInfo = (createdDateStr: string) => {
  if (!createdDateStr) return { progress: 0, daysLeft: 5, status: 'normal' as const };
  const createdDate = new Date(createdDateStr);
  const deadlineDate = addBusinessDays(createdDate, 5);
  const daysLeft = countBusinessDaysLeft(deadlineDate);
  const now = new Date();
  const totalTime = deadlineDate.getTime() - createdDate.getTime();
  const elapsedTime = now.getTime() - createdDate.getTime();
  let progress = (elapsedTime / totalTime) * 100;
  progress = Math.min(Math.max(progress, 0), 100);
  let status: 'normal' | 'warning' | 'urgent' | 'overdue' = 'normal';
  if (daysLeft <= 2) status = 'warning';
  if (daysLeft <= 1) status = 'urgent';
  if (daysLeft < 0) status = 'overdue';
  return { progress, daysLeft, status };
};

const checkIsQualityUser = (user: UserData | null) => {
  const p = (user?.puesto || user?.role || "").toLowerCase();
  const email = (user?.email || "").toLowerCase();
  const hasAdminRole = ['calidad', 'quality', 'admin', 'gerente', 'manager'].some(role => p.includes(role));
  const allowedEmails = ['eaaese07@gmail.com', 'edgar.metrologo@ejemplo.com'];
  return hasAdminRole || allowedEmails.includes(email);
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: days > 365 ? 'numeric' : undefined });
};

const getFileIcon = (fileName?: string, size: number = 24) => {
  if (!fileName || typeof fileName !== 'string') return <File size={size} className="text-slate-400" strokeWidth={1.5} />;
  const ext = fileName.split('.').pop()?.toLowerCase();
  const p = { size, strokeWidth: 1.5 };
  if (ext === 'pdf') return <FileText {...p} className="text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(ext || '')) return <ImageIcon {...p} className="text-violet-500" />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileText {...p} className="text-emerald-500" />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText {...p} className="text-blue-500" />;
  return <File {...p} className="text-slate-400" />;
};

const getFileColorBg = (fileName?: string) => {
  if (!fileName) return 'bg-slate-50';
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'bg-red-50';
  if (['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(ext || '')) return 'bg-violet-50';
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return 'bg-emerald-50';
  if (['doc', 'docx'].includes(ext || '')) return 'bg-blue-50';
  return 'bg-slate-50';
};

const ROOT_PATH = "worksheets";

// ─────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────

const ProSwitch = ({ checked, onChange, disabled, activeColor = "bg-blue-600" }: any) => (
  <button
    type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={onChange}
    className={clsx(
      "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
      checked ? activeColor : "bg-slate-200",
      disabled && "opacity-40 cursor-not-allowed"
    )}
  >
    <span className={clsx(
      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
      checked ? "translate-x-4" : "translate-x-0"
    )} />
  </button>
);

const Toast = ({ toast }: { toast: ToastMessage }) => {
  const styles = {
    success: 'bg-white border-l-4 border-l-emerald-500 text-slate-700',
    error: 'bg-white border-l-4 border-l-red-500 text-slate-700',
    warning: 'bg-white border-l-4 border-l-amber-500 text-slate-700',
    info: 'bg-slate-800 text-white border-l-4 border-l-blue-400',
  };
  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />,
    error: <AlertCircle size={16} className="text-red-500 flex-shrink-0" />,
    warning: <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />,
    info: <Info size={16} className="text-blue-400 flex-shrink-0" />,
  };
  return (
    <div className={clsx(
      "flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium min-w-[260px] max-w-sm",
      "animate-in slide-in-from-right-10 fade-in duration-300",
      styles[toast.type]
    )}>
      {icons[toast.type]}
      <span>{toast.text}</span>
    </div>
  );
};

const StatusChip = ({ file }: { file: DriveFile }) => {
  if (file.reviewed) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={10} /> Validado
    </span>
  );
  if (file.completed) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
      <Eye size={10} /> Por revisar
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      <Clock size={10} /> En proceso
    </span>
  );
};

const DeadlineBar = ({ createdDate }: { createdDate: string }) => {
  const { progress, daysLeft, status } = getDeadlineInfo(createdDate);
  const trackColors = { normal: 'bg-emerald-500', warning: 'bg-amber-500', urgent: 'bg-orange-500', overdue: 'bg-red-500' };
  const textColors = { normal: 'text-emerald-600', warning: 'text-amber-600', urgent: 'text-orange-600', overdue: 'text-red-600' };
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className={clsx("text-[9px] font-bold uppercase tracking-wide", textColors[status])}>
          {status === 'overdue' ? `Vencido ${Math.abs(daysLeft)}d` : `${daysLeft}d restantes`}
        </span>
        <span className="text-[9px] text-slate-300 font-mono">{Math.round(progress)}%</span>
      </div>
      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", trackColors[status])}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

const EmptyState = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
    <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-5 border border-slate-100">
      <Icon className="w-9 h-9 text-slate-300" strokeWidth={1.5} />
    </div>
    <p className="text-base font-semibold text-slate-500 mb-1">{title}</p>
    {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
  </div>
);

const LoadingSkeleton = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] animate-in fade-in duration-500">
    <style>{`
      @keyframes spin-3d {
        0% { transform: perspective(600px) rotateY(0deg); }
        100% { transform: perspective(600px) rotateY(360deg); }
      }
      .spin-3d { animation: spin-3d 2.5s linear infinite; }
    `}</style>
    <div className="relative mb-5">
      <div className="absolute inset-0 bg-blue-400/20 blur-2xl rounded-full animate-pulse" />
      <img src={labLogo} alt="Cargando" className="w-16 h-16 spin-3d relative z-10 drop-shadow-xl" />
    </div>
    <p className="text-slate-400 text-sm font-medium animate-pulse">Cargando archivos...</p>
    <div className="mt-8 w-64 space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.25 }} />
      ))}
    </div>
  </div>
);

// ─── FILE CARD (Grid) ─────────────────────────
const FileCard = React.memo(({ file, selected, onSelect, onContextMenu, onDoubleClick, searchActive, onStar }: any) => {
  const isReadyForReview = file.completed && !file.reviewed;
  const showFolder = searchActive && file.parentFolder && file.parentFolder !== "Raíz";
  const isNoExpiration = file.fullPath?.toLowerCase().includes('hojas de servicio') || file.name?.toUpperCase().startsWith('HSDG');
  const { status } = getDeadlineInfo(file.created);
  const isOverdue = status === 'overdue' && !file.completed && !isNoExpiration;

  return (
    <div
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey, e.shiftKey)}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      className={clsx(
        "group relative bg-white rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 flex flex-col select-none border",
        selected
          ? "ring-2 ring-blue-500 border-blue-200 shadow-lg shadow-blue-100/50 -translate-y-1"
          : "border-slate-200/80 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5",
        isOverdue && !selected ? "border-red-200 shadow-red-50" : "",
        isReadyForReview && !isOverdue && !selected ? "border-blue-200 shadow-blue-50/50" : ""
      )}
    >
      {/* Thumbnail area */}
      <div className={clsx(
        "h-28 flex items-center justify-center relative transition-colors",
        isOverdue ? "bg-red-50/60" : getFileColorBg(file.name)
      )}>
        {/* Selection checkmark */}
        <div className={clsx(
          "absolute top-2 left-2 z-20 transition-all duration-200",
          selected ? "opacity-100 scale-100" : "opacity-0 group-hover:opacity-60 scale-90 group-hover:scale-100"
        )}>
          <div className={clsx(
            "w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all",
            selected ? "bg-blue-500 border-blue-500" : "border-slate-400 bg-white"
          )}>
            {selected && <CheckCircle2 size={12} className="text-white" />}
          </div>
        </div>

        {/* Star button */}
        <button
          onClick={(e) => { e.stopPropagation(); onStar?.(file); }}
          className={clsx(
            "absolute top-2 right-2 z-20 p-1 rounded-full transition-all",
            file.starred
              ? "text-amber-500 opacity-100"
              : "text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-400"
          )}
        >
          <Star size={14} className={file.starred ? "fill-amber-500" : ""} />
        </button>

        {/* Status badges */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {file.reviewed && (
            <div className="bg-emerald-500 text-white p-1 rounded-full shadow-sm" title="Validado">
              <CheckCircle2 size={10} />
            </div>
          )}
          {isReadyForReview && (
            <div className="bg-blue-500 text-white p-1 rounded-full shadow-sm animate-pulse" title="Listo p/ revisión">
              <Eye size={10} />
            </div>
          )}
          {isOverdue && !selected && (
            <div className="bg-red-500 text-white p-1 rounded-full shadow-sm" title="Vencido">
              <AlertCircle size={10} />
            </div>
          )}
        </div>

        <div className="transform transition-transform group-hover:scale-110 duration-300 drop-shadow-sm">
          {getFileIcon(file.name, 52)}
        </div>
      </div>

      {/* Info area */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p
            className={clsx("text-[13px] font-semibold leading-tight line-clamp-2 transition-colors", selected ? "text-blue-700" : "text-slate-800 group-hover:text-slate-900")}
            title={file.name}
          >
            {file.name}
          </p>
          {showFolder && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md w-fit max-w-full">
              <FolderOpen size={9} className="flex-shrink-0" />
              <span className="truncate">{file.parentFolder}</span>
            </div>
          )}
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(file.size)}</span>
            <StatusChip file={file} />
          </div>
          {!isNoExpiration ? (
            <DeadlineBar createdDate={file.created} />
          ) : (
            <p className="text-[9px] text-slate-300 font-semibold uppercase tracking-wider">Documento Fijo</p>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── FILE LIST ROW ────────────────────────────
const FileListRow = React.memo(({ file, selected, onSelect, onContextMenu, onDoubleClick, searchActive, onDownload, onStar }: any) => {
  const showFolder = searchActive && file.parentFolder && file.parentFolder !== "Raíz";
  const isNoExpiration = file.fullPath?.toLowerCase().includes('hojas de servicio') || file.name?.toUpperCase().startsWith('HSDG');
  const { status } = getDeadlineInfo(file.created);
  const isOverdue = status === 'overdue' && !file.completed && !isNoExpiration;

  return (
    <div
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey, e.shiftKey)}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      className={clsx(
        "grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 cursor-pointer items-center transition-all duration-150 group select-none last:border-b-0",
        selected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-slate-50/80",
        isOverdue && !selected ? "bg-red-50/30" : ""
      )}
    >
      {/* Name col */}
      <div className="col-span-12 md:col-span-5 flex items-center gap-3 min-w-0">
        <div className={clsx(
          "w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all cursor-pointer",
          selected ? "bg-blue-500 border-blue-500" : "border-slate-200 bg-white opacity-0 group-hover:opacity-100"
        )}>
          {selected && <CheckCircle2 size={10} className="text-white" />}
        </div>
        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", getFileColorBg(file.name))}>
          {getFileIcon(file.name, 18)}
        </div>
        <div className="min-w-0">
          <p className={clsx("text-sm font-medium truncate", selected ? "text-blue-700" : "text-slate-800")}>{file.name}</p>
          {showFolder && (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <FolderOpen size={9} /> {file.parentFolder}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onStar?.(file); }}
          className={clsx("ml-auto p-1 rounded transition-all flex-shrink-0", file.starred ? "text-amber-500" : "text-slate-200 hover:text-amber-400 opacity-0 group-hover:opacity-100")}
        >
          <Star size={13} className={file.starred ? "fill-amber-500" : ""} />
        </button>
      </div>

      {/* Deadline */}
      <div className="hidden md:block md:col-span-3 pr-4">
        {!isNoExpiration ? (
          <DeadlineBar createdDate={file.created} />
        ) : (
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Fijo</span>
        )}
      </div>

      {/* Status */}
      <div className="hidden md:block md:col-span-2">
        <StatusChip file={file} />
      </div>

      {/* Date */}
      <div className="hidden md:block md:col-span-1 text-right">
        <span className="text-xs text-slate-400">{formatDate(file.updated)}</span>
      </div>

      {/* Size + actions */}
      <div className="hidden md:flex md:col-span-1 items-center justify-end gap-1">
        <span className="text-xs text-slate-400 font-mono">{formatFileSize(file.size)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDownload?.(file); }}
          className="p-1.5 text-slate-300 hover:text-blue-600 rounded hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
          title="Descargar"
        >
          <Download size={14} />
        </button>
      </div>
    </div>
  );
});

// ─── FOLDER CARD ──────────────────────────────
const FolderCard = ({ folder, onDoubleClick, onContextMenu, isDragTarget, draggable, onDragStart, onDragOver, onDrop }: any) => (
  <div
    draggable={draggable}
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDoubleClick={onDoubleClick}
    onContextMenu={onContextMenu}
    className={clsx(
      "group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-150 border select-none",
      isDragTarget
        ? "border-blue-400 bg-blue-50 ring-2 ring-blue-300 scale-[1.02]"
        : "bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
    )}
  >
    <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 transition-colors">
      <Folder size={20} className="text-amber-500 fill-amber-100 group-hover:fill-amber-200 transition-all" />
    </div>
    <span className="text-sm font-medium text-slate-700 truncate flex-1 group-hover:text-slate-900">{folder.name}</span>
    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
  </div>
);

// ─── DETAILS PANEL ────────────────────────────
const DetailsPanel = ({ file, onClose, isQualityUser, onToggleStatus, onDownload, onDelete, onUpdateNotes }: any) => {
  const [notes, setNotes] = React.useState(file.notas || "");
  React.useEffect(() => { setNotes(file.notas || ""); }, [file]);

  return (
    <div className="fixed md:relative inset-0 md:inset-auto w-full md:w-80 bg-white border-l border-slate-200 z-[60] flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-250">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-semibold text-slate-800">Información</span>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <X size={16} className="text-slate-400" />
        </button>
      </div>

      {/* File icon & name */}
      <div className="px-5 py-6 flex flex-col items-center border-b border-slate-100 flex-shrink-0">
        <div className={clsx("w-20 h-20 rounded-2xl flex items-center justify-center mb-4 border", getFileColorBg(file.name), "border-slate-100")}>
          {getFileIcon(file.name, 44)}
        </div>
        <h3 className="font-semibold text-slate-800 text-center text-sm break-all leading-snug">{file.name}</h3>
        <p className="text-xs text-slate-400 mt-1 font-mono">{formatFileSize(file.size)}</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {/* Metadata */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detalles</h4>
          {[
            { label: 'Creado', value: formatDate(file.created) },
            { label: 'Modificado', value: formatDate(file.updated) },
            { label: 'Subido por', value: file.uploadedBy || '—' },
            { label: 'Carpeta', value: file.parentFolder || 'Raíz' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-3">
              <span className="text-xs text-slate-400 flex-shrink-0">{label}</span>
              <span className="text-xs text-slate-700 font-medium text-right truncate">{value}</span>
            </div>
          ))}
        </div>

        {/* Status toggles */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado del Proceso</h4>
          <div className={clsx("flex items-center justify-between p-3 rounded-xl border transition-all", file.completed ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200")}>
            <div>
              <p className="text-xs font-semibold text-slate-700">Metrólogo</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{file.completedByName || "Pendiente"}</p>
            </div>
            <ProSwitch checked={file.completed} onChange={() => onToggleStatus(file, 'completed', !file.completed)} />
          </div>
          <div className={clsx("flex items-center justify-between p-3 rounded-xl border transition-all", file.reviewed ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200")}>
            <div>
              <p className="text-xs font-semibold text-slate-700">Calidad</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{file.reviewedByName || "Pendiente"}</p>
            </div>
            <ProSwitch checked={file.reviewed} disabled={!isQualityUser} activeColor="bg-emerald-500" onChange={() => onToggleStatus(file, 'reviewed', !file.reviewed)} />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notas</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== file.notas) onUpdateNotes(file, notes); }}
            placeholder="Agrega comentarios u observaciones..."
            className="w-full h-24 p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none text-slate-700 placeholder-slate-300"
          />
          <p className="text-[10px] text-slate-300">Se incluirá en búsquedas globales</p>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
        <button onClick={() => onDownload(file)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-all">
          <Eye size={14} /> Vista Previa
        </button>
        {isQualityUser && (
          <button onClick={() => onDelete(file)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 text-xs font-semibold text-red-600 transition-all">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
      </div>
    </div>
  );
};

// ─── FILE PREVIEW MODAL ───────────────────────
const FilePreviewModal = ({ file, onClose, onDownload }: { file: DriveFile; onClose: () => void; onDownload: () => void }) => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-5 bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {getFileIcon(file.name, 18)}
            <span className="text-sm font-semibold text-slate-800 truncate">{file.name}</span>
            <span className="text-xs text-slate-400 font-mono flex-shrink-0">{formatFileSize(file.size)}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onDownload} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors">
              <Download size={13} /> Descargar
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-slate-100 flex items-center justify-center overflow-hidden">
          {!file.url ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={36} className="animate-spin text-blue-500" />
              <p className="text-sm text-slate-500">Cargando vista previa...</p>
            </div>
          ) : isImage ? (
            <img src={file.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
          ) : isPdf ? (
            <iframe src={file.url} className="w-full h-full" title="PDF Preview" />
          ) : (
            <div className="text-center">
              <div className={clsx("w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-5", getFileColorBg(file.name))}>
                {getFileIcon(file.name, 52)}
              </div>
              <p className="text-slate-500 text-sm mb-5">Vista previa no disponible para este tipo de archivo.</p>
              <button onClick={onDownload} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                Descargar para ver
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── DIALOG ───────────────────────────────────
const Dialog = ({ title, children, onClose, onConfirm, confirmLabel = "Confirmar", confirmClass = "bg-blue-600 hover:bg-blue-700 text-white" }: any) => (
  <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
      <div className="px-5 pb-5 flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button>
        <button onClick={onConfirm} className={clsx("px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm", confirmClass)}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

// ─── CONTEXT MENU OPTION ──────────────────────
const MenuOption = ({ icon, label, onClick, shortcut, danger }: any) => (
  <button
    onClick={onClick}
    className={clsx(
      "w-full text-left px-3 py-2 flex items-center gap-3 rounded-lg transition-colors text-xs font-medium",
      danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50"
    )}
  >
    <span className={clsx("flex-shrink-0", danger ? "text-red-500" : "text-slate-400")}>{icon}</span>
    <span className="flex-1">{label}</span>
    {shortcut && <kbd className="text-[10px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{shortcut}</kbd>}
  </button>
);

// ─── SIDEBAR ITEM ─────────────────────────────
const SidebarItem = ({ icon, label, active, onClick, badge }: any) => (
  <button
    onClick={onClick}
    className={clsx(
      "w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between group",
      active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}
  >
    <div className="flex items-center gap-3">
      <span className={clsx("flex-shrink-0 transition-colors", active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")}>{icon}</span>
      {label}
    </div>
    {badge && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
  </button>
);

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const { goBack } = useNavigation();

  // Data
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [suggestedFiles, setSuggestedFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  // UI & Nav
  const [path, setPath] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('dateDesc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [completedGroupView, setCompletedGroupView] = useState<string | null>(null);
  const [newFileMenuOpen, setNewFileMenuOpen] = useState(false);
  const newFileMenuRef = useRef<HTMLDivElement>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DriveFile | null; folder: DriveFolder | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Drag & drop
  const [dragActive, setDragActive] = useState(false);
  const [draggingItem, setDraggingItem] = useState<{ type: DragItemType; data: DriveFile | DriveFolder } | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Upload
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFile, setMoveTargetFile] = useState<DriveFile | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<DriveFolder | null>(null);
  const [moveToPath, setMoveToPath] = useState<string[]>([]);
  const [moveFolderContent, setMoveFolderContent] = useState<DriveFolder[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetFile, setRenameTargetFile] = useState<DriveFile | null>(null);
  const [renameTargetFolder, setRenameTargetFolder] = useState<DriveFolder | null>(null);
  const [newName, setNewName] = useState("");

  const handleBack = () => { onBack ? onBack() : goBack(); };

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const isQuality = useMemo(() => checkIsQualityUser(currentUserData), [currentUserData]);

  // ── Load user ──
  useEffect(() => {
    const loadUser = async () => {
      if (!user?.email) return;
      try {
        const snap = await getDocs(collection(db, 'usuarios'));
        let found: UserData | null = null;
        snap.forEach(d => {
          const data = d.data();
          if (data.correo === user.email || data.email === user.email)
            found = { name: data.nombre || data.name, email: data.correo || data.email, puesto: data.puesto || data.role };
        });
        setCurrentUserData(found || { name: user.displayName || "Usuario", email: user.email || "", role: "User" });
      } catch (e) { console.error(e); }
    };
    loadUser();
  }, [user]);

  // ── Suggested files (Quick Access) ──
  useEffect(() => {
    const load = async () => {
      if (!currentUserData || path.length > 0 || debouncedSearch) { setSuggestedFiles([]); return; }
      try {
        const q = query(collection(db, 'fileMetadata'), orderBy('updated', 'desc'), limit(50));
        const snap = await getDocs(q);
        const recents: DriveFile[] = [];
        const myName = normalizeText(currentUserData?.name || "");

        for (const docSnap of snap.docs) {
          if (recents.length >= 6) break;
          const data = docSnap.data();
          const fullPath = data.filePath || `worksheets/${data.name || docSnap.id}`;
          if (!isQuality) {
            const isUploader = normalizeText(data.uploadedBy || "") === myName;
            if (!fullPath.toLowerCase().includes(myName) && !isUploader) continue;
          }
          recents.push({ name: cleanFileName(data.name), rawName: data.name, fullPath, updated: data.updated, created: data.created, size: data.size, url: "", contentType: data.contentType, notas: data.notas, ...data });
        }
        setSuggestedFiles(recents);
      } catch (e) { console.error(e); }
    };
    load();
  }, [currentUserData, path, debouncedSearch, isQuality]);

  // ── Load content ──
  const loadContent = useCallback(async () => {
    setLoading(true);
    setContextMenu(null);
    setSelectedIds(new Set());
    setLastSelectedId(null);

    try {
      const isGlobalSearch = path.length === 0 && debouncedSearch !== "";

      if (isGlobalSearch) {
        const q = query(collection(db, 'fileMetadata'), orderBy('created', 'desc'));
        const snap = await getDocs(q);
        const results: DriveFile[] = [];
        const myName = normalizeText(currentUserData?.name || "");
        const searchTerms = normalizeText(debouncedSearch).split(/[\s\-]+/).filter(t => t.length > 0);

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const rawName = data.name || docSnap.id;
          const fullPath = data.filePath || `worksheets/${rawName}`;
          if (!isQuality) {
            const isUploader = normalizeText(data.uploadedBy || "") === myName;
            if (!fullPath.toLowerCase().includes(myName) && !isUploader) return;
          }
          const fileObj: DriveFile = {
            name: cleanFileName(rawName), rawName, url: "", fullPath,
            updated: data.updated || new Date().toISOString(),
            created: data.created || data.updated || new Date().toISOString(),
            size: data.size || 0, contentType: data.contentType,
            reviewed: data.reviewed, reviewedByName: data.reviewedByName,
            completed: data.completed, completedByName: data.completedByName,
            starred: data.starred, uploadedBy: data.uploadedBy,
            parentFolder: getParentFolderName(fullPath),
            keywords: data.keywords, notas: data.notas
          };
          if (fuzzyMatch(fileObj, searchTerms)) results.push(fileObj);
        });
        setFiles(results);
        setFolders([]);
      } else {
        const pathStr = [ROOT_PATH, ...path].join('/');
        const res = await listAll(ref(storage, pathStr));
        const myName = normalizeText(currentUserData?.name || "");

        let loadedFolders = res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath }));
        if (!isQuality && path.length === 0) loadedFolders = loadedFolders.filter(f => normalizeText(f.name).includes(myName));
        if (debouncedSearch) {
          const term = normalizeText(debouncedSearch);
          loadedFolders = loadedFolders.filter(f => normalizeText(f.name).includes(term));
        }
        setFolders(loadedFolders);

        const filePromises = res.items.map(async (item) => {
          if (item.name === '.keep') return null;
          const rawName = item.name;
          const cleanName = cleanFileName(rawName);
          if (debouncedSearch) {
            const term = normalizeText(debouncedSearch);
            if (!normalizeText(cleanName).includes(term) && !normalizeText(rawName).includes(term)) return null;
          }

          const metaId = item.fullPath.replace(/\//g, '_');
          let meta: any = {};
          let needsRepair = false;
          try {
            const metaSnap = await getDoc(doc(db, 'fileMetadata', metaId));
            if (metaSnap.exists()) { meta = metaSnap.data(); if (meta.name !== item.name) needsRepair = true; }
            else needsRepair = true;
          } catch (e) { }

          let storageMeta = { size: 0, updated: new Date().toISOString(), timeCreated: new Date().toISOString(), contentType: 'unknown' };
          try { storageMeta = await getMetadata(item) as any; } catch (e) { }

          if (needsRepair && !isSyncing) {
            setIsSyncing(true);
            const newMeta = {
              name: item.name, filePath: item.fullPath, size: storageMeta.size, contentType: storageMeta.contentType,
              updated: storageMeta.updated, created: meta.created || storageMeta.timeCreated,
              uploadedBy: meta.uploadedBy || "Sistema", keywords: generateSearchTokens(cleanFileName(item.name)),
              completed: meta.completed || false, reviewed: meta.reviewed || false, starred: meta.starred || false, notas: meta.notas || ""
            };
            setDoc(doc(db, 'fileMetadata', metaId), newMeta, { merge: true })
              .finally(() => setIsSyncing(false));
            meta = newMeta;
          }

          if (!debouncedSearch) {
            if (activeFilter === 'starred' && meta.starred !== true) return null;
            if (activeFilter === 'pending_review' && !(meta.completed === true && meta.reviewed !== true)) return null;
            if (activeFilter === 'completed' && meta.reviewed !== true) return null;
            if (activeFilter === 'recent') {
              const diff = Math.abs(new Date().getTime() - new Date(meta.updated || meta.created).getTime());
              if (Math.ceil(diff / (1000 * 60 * 60 * 24)) > 7) return null;
            }
          }

          return {
            name: cleanName, rawName, fullPath: item.fullPath, url: '',
            size: storageMeta.size, updated: storageMeta.updated,
            created: meta.created || storageMeta.timeCreated, contentType: storageMeta.contentType,
            parentFolder: path.length > 0 ? path[path.length - 1] : "Raíz",
            notas: meta.notas, ...meta
          } as DriveFile;
        });

        const loaded = (await Promise.all(filePromises)).filter(Boolean) as DriveFile[];
        setFiles(loaded);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [path, activeFilter, currentUserData, debouncedSearch, isQuality]);

  useEffect(() => { if (currentUserData) loadContent(); }, [loadContent]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); setSelectedIds(new Set(processedFiles.map(f => f.fullPath))); }
      if (e.key === 'Escape') {
        if (previewFile) setPreviewFile(null);
        else if (selectedIds.size > 0) setSelectedIds(new Set());
        else if (debouncedSearch) setSearchQuery("");
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && isQuality) handleBatchDelete();
      if (e.key === ' ' && selectedIds.size === 1) {
        e.preventDefault();
        const f = files.find(fi => fi.fullPath === Array.from(selectedIds)[0]);
        if (f) handlePreview(f);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selectedIds, files, previewFile, isQuality]);

  // ── Close menus on outside click ──
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (newFileMenuRef.current && !newFileMenuRef.current.contains(e.target as Node)) setNewFileMenuOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Sorted/filtered files ──
  const processedFiles = useMemo(() => {
    let result = [...files];
    result.sort((a, b) => {
      switch (sortBy) {
        case 'nameAsc': return a.name.localeCompare(b.name);
        case 'nameDesc': return b.name.localeCompare(a.name);
        case 'dateAsc': return new Date(a.created).getTime() - new Date(b.created).getTime();
        case 'dateDesc': return new Date(b.created).getTime() - new Date(a.created).getTime();
        case 'sizeAsc': return (a.size || 0) - (b.size || 0);
        case 'sizeDesc': return (b.size || 0) - (a.size || 0);
        default: return 0;
      }
    });
    return result;
  }, [files, sortBy]);

  const completedGroups = useMemo(() => {
    if (activeFilter !== 'completed') return {};
    const groups: Record<string, DriveFile[]> = {};
    processedFiles.forEach(f => {
      const k = f.parentFolder || getParentFolderName(f.fullPath);
      if (!groups[k]) groups[k] = [];
      groups[k].push(f);
    });
    return groups;
  }, [processedFiles, activeFilter]);

  // ── Selection ──
  const handleSelect = (file: DriveFile, isMulti: boolean, isRange: boolean) => {
    const newSelected = new Set(isMulti ? selectedIds : []);
    if (isRange && lastSelectedId) {
      const allPaths = processedFiles.map(f => f.fullPath);
      const startIdx = allPaths.indexOf(lastSelectedId);
      const endIdx = allPaths.indexOf(file.fullPath);
      if (startIdx !== -1 && endIdx !== -1) {
        const [mn, mx] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
        for (let i = mn; i <= mx; i++) newSelected.add(allPaths[i]);
      }
    } else {
      if (newSelected.has(file.fullPath)) newSelected.delete(file.fullPath);
      else newSelected.add(file.fullPath);
      setLastSelectedId(file.fullPath);
    }
    setSelectedIds(newSelected);
    if (newSelected.size !== 1) setDetailsOpen(false);
  };

  // ── Preview ──
  const handlePreview = async (file: DriveFile) => {
    setPreviewFile({ ...file, url: '' });
    try {
      const url = file.url || await getDownloadURL(ref(storage, file.fullPath));
      setPreviewFile({ ...file, url });
    } catch (e) { showToast("No se pudo cargar la vista previa", 'error'); setPreviewFile(null); }
  };

  // ── Batch delete ──
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} archivo(s)? Esta acción no se puede deshacer.`)) return;
    let count = 0;
    for (const id of Array.from(selectedIds)) {
      const f = files.find(fi => fi.fullPath === id);
      if (f) {
        try {
          await deleteObject(ref(storage, f.fullPath));
          await deleteDoc(doc(db, 'fileMetadata', f.fullPath.replace(/\//g, '_')));
          count++;
        } catch (e) { console.error(e); }
      }
    }
    showToast(`${count} archivo(s) eliminados`, 'success');
    setSelectedIds(new Set());
    loadContent();
  };

  // ── Batch download ──
  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    setIsZipping(true);
    showToast("Preparando ZIP...", 'info');
    try {
      const zip = new JSZip();
      await Promise.all(Array.from(selectedIds).map(async (id) => {
        const f = files.find(fi => fi.fullPath === id);
        if (f) {
          const url = f.url || await getDownloadURL(ref(storage, f.fullPath));
          const blob = await (await fetch(url)).blob();
          zip.file(f.name, blob);
        }
      }));
      saveAs(await zip.generateAsync({ type: 'blob' }), 'AG_Drive_Descarga.zip');
      showToast("Descarga completada", 'success');
      setSelectedIds(new Set());
    } catch (e) { showToast("Error al empaquetar archivos", 'error'); }
    finally { setIsZipping(false); }
  };

  // ── Delete folder recursive ──
  const deleteFolderRecursive = async (prefix: string) => {
    const res = await listAll(ref(storage, prefix));
    for (const item of res.items) {
      await deleteObject(item);
      await deleteDoc(doc(db, 'fileMetadata', item.fullPath.replace(/\//g, '_')));
    }
    for (const sub of res.prefixes) await deleteFolderRecursive(sub.fullPath);
  };

  const executeDeleteFolder = async (folder: DriveFolder) => {
    if (!confirm(`¿Eliminar la carpeta "${folder.name}" y TODO su contenido? Esta acción no se puede deshacer.`)) return;
    setIsMoving(true);
    try { await deleteFolderRecursive(folder.fullPath); showToast("Carpeta eliminada", 'success'); loadContent(); }
    catch (e) { showToast("Error al eliminar la carpeta", 'error'); }
    finally { setIsMoving(false); }
  };

  // ── Move folder recursive ──
  const moveFolderRecursive = async (src: string, dest: string) => {
    const res = await listAll(ref(storage, src));
    for (const item of res.items) {
      const blob = await (await fetch(await getDownloadURL(item))).blob();
      const newPath = `${dest}/${item.name}`;
      await uploadBytes(ref(storage, newPath), blob);
      if (item.name !== '.keep') {
        const oldId = item.fullPath.replace(/\//g, '_');
        const newId = newPath.replace(/\//g, '_');
        const old = await getDoc(doc(db, 'fileMetadata', oldId));
        const data = old.exists() ? old.data() : {};
        if (old.exists()) await deleteDoc(doc(db, 'fileMetadata', oldId));
        await setDoc(doc(db, 'fileMetadata', newId), { ...data, filePath: newPath, updated: new Date().toISOString() }, { merge: true });
      }
      await deleteObject(item);
    }
    for (const sub of res.prefixes) await moveFolderRecursive(sub.fullPath, `${dest}/${sub.name}`);
  };

  const executeMoveFolder = async (folder: DriveFolder, dest: string) => {
    const newPath = `${dest}/${folder.name}`;
    if (newPath.startsWith(folder.fullPath) || newPath === folder.fullPath) {
      showToast("No puedes mover una carpeta dentro de sí misma", 'error');
      return false;
    }
    setIsMoving(true);
    try { await moveFolderRecursive(folder.fullPath, newPath); return true; }
    catch (e) { showToast("Error al mover la carpeta", 'error'); return false; }
    finally { setIsMoving(false); }
  };

  const executeMoveFile = async (file: DriveFile, dest: string) => {
    const newPath = `${dest}/${file.name}`;
    if (newPath === file.fullPath) return false;
    setIsMoving(true);
    try {
      const url = file.url || await getDownloadURL(ref(storage, file.fullPath));
      const blob = await (await fetch(url)).blob();
      await uploadBytes(ref(storage, newPath), blob);
      const oldId = file.fullPath.replace(/\//g, '_');
      const newId = newPath.replace(/\//g, '_');
      const old = await getDoc(doc(db, 'fileMetadata', oldId));
      const data = old.exists() ? old.data() : {};
      if (old.exists()) await deleteDoc(doc(db, 'fileMetadata', oldId));
      await setDoc(doc(db, 'fileMetadata', newId), { ...data, filePath: newPath, name: file.name, updated: new Date().toISOString() }, { merge: true });
      await deleteObject(ref(storage, file.fullPath));
      return true;
    } catch (e) { showToast("Error al mover el archivo", 'error'); return false; }
    finally { setIsMoving(false); }
  };

  const handleModalMove = async () => {
    const dest = [ROOT_PATH, ...moveToPath].join('/');
    if (moveTargetFolder) {
      const ok = await executeMoveFolder(moveTargetFolder, dest);
      if (ok) { showToast("Carpeta movida", 'success'); setMoveDialogOpen(false); setMoveTargetFolder(null); setMoveToPath([]); loadContent(); }
    } else if (moveTargetFile) {
      const ok = await executeMoveFile(moveTargetFile, dest);
      if (ok) { showToast("Archivo movido", 'success'); setMoveDialogOpen(false); setMoveTargetFile(null); setMoveToPath([]); loadContent(); }
    }
  };

  useEffect(() => {
    if (!moveDialogOpen) return;
    (async () => {
      try {
        const res = await listAll(ref(storage, [ROOT_PATH, ...moveToPath].join('/')));
        setMoveFolderContent(res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath })));
      } catch (e) { console.error(e); }
    })();
  }, [moveDialogOpen, moveToPath]);

  // ── File actions ──
  const handleDelete = async (file: DriveFile) => {
    if (!confirm(`¿Eliminar "${file.name}"?`)) return;
    try {
      await deleteObject(ref(storage, file.fullPath));
      await deleteDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')));
      setFiles(prev => prev.filter(f => f.fullPath !== file.fullPath));
      setSelectedIds(new Set());
      showToast("Archivo eliminado", 'success');
    } catch (e) { showToast("Error al eliminar", 'error'); }
  };

  const handleDownload = async (file: DriveFile) => {
    try { window.open(await getDownloadURL(ref(storage, file.fullPath)), '_blank'); }
    catch (e) { showToast("No se pudo descargar", 'error'); }
  };

  const updateNotes = async (file: DriveFile, notes: string) => {
    const updated = { ...file, notas: notes };
    setFiles(prev => prev.map(f => f.fullPath === file.fullPath ? updated : f));
    try {
      await setDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')), { notas: notes }, { merge: true });
      showToast("Notas guardadas", 'success');
    } catch (e) { showToast("Error al guardar notas", 'error'); }
  };

  const updateFileStatus = async (file: DriveFile, field: string, value: any) => {
    const name = currentUserData?.name || user?.displayName || "Usuario";
    const newReviewedBy = field === 'reviewed' && value ? name : (field === 'reviewed' ? null : file.reviewedByName);
    const newCompletedBy = field === 'completed' && value ? name : (field === 'completed' ? null : file.completedByName);
    const updated = { ...file, [field]: value, reviewedByName: newReviewedBy, completedByName: newCompletedBy };
    setFiles(prev => prev.map(f => f.fullPath === file.fullPath ? updated : f));
    if (previewFile?.fullPath === file.fullPath) setPreviewFile(updated);
    try {
      const data: any = { [field]: value };
      if (field === 'reviewed') data.reviewedByName = value ? name : null;
      if (field === 'completed') data.completedByName = value ? name : null;
      await setDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')), data, { merge: true });
      if (field === 'reviewed' && value) showToast("Validación guardada", 'success');
      if (field === 'completed' && value) showToast("Marcado como completado", 'success');
      if (value && (field === 'completed' || field === 'reviewed')) {
        const possibleId = file.name.replace(/\.[^/.]+$/, "").replace(/\s*\(\d+\)/, "").split(/[_ ]/)[0].trim();
        let snap = await getDocs(query(collection(db, "hojasDeTrabajo"), where("id", "==", possibleId)));
        if (snap.empty) snap = await getDocs(query(collection(db, "hojasDeTrabajo"), where("folio", "==", possibleId)));
        if (!snap.empty) {
          const updateData: any = { lastUpdated: new Date().toISOString() };
          if (field === 'completed') { updateData.status_certificado = "Generado"; updateData.cargado_drive = "Si"; }
          if (field === 'reviewed') updateData.status_certificado = "Firmado";
          await updateDoc(snap.docs[0].ref, updateData);
          showToast(`Sincronizado con ${possibleId}`, 'success');
        }
      }
    } catch (e) { showToast("Error de conexión", 'error'); loadContent(); }
  };

  const handleToggleStar = async (file: DriveFile) => {
    const newVal = !file.starred;
    setFiles(prev => prev.map(f => f.fullPath === file.fullPath ? { ...f, starred: newVal } : f));
    await setDoc(doc(db, 'fileMetadata', file.fullPath.replace(/\//g, '_')), { starred: newVal }, { merge: true });
    showToast(newVal ? "Agregado a destacados" : "Quitado de destacados", 'info');
  };

  // ── Upload ──
  const processFiles = async (fileList: FileList) => {
    if (!isQuality && path.length === 0) { showToast("Entra a tu carpeta personal primero", 'error'); return; }
    setIsUploading(true);
    let count = 0;
    try {
      for (const file of Array.from(fileList)) {
        const fullPath = `${[ROOT_PATH, ...path].join('/')}/${file.name}`;
        const docId = fullPath.replace(/\//g, '_');
        const existing = await getDoc(doc(db, 'fileMetadata', docId));
        const existingData = existing.exists() ? existing.data() : {};
        const snap = await uploadBytes(ref(storage, fullPath), file);
        const meta = await getMetadata(snap.ref);
        await setDoc(doc(db, 'fileMetadata', docId), {
          name: file.name, filePath: fullPath, size: meta.size, contentType: meta.contentType,
          updated: meta.updated, created: existingData.created || new Date().toISOString(),
          uploadedBy: currentUserData?.name || "Desconocido",
          keywords: generateSearchTokens(cleanFileName(file.name)),
          completed: existingData.completed || false, completedByName: existingData.completedByName || null,
          reviewed: false, reviewedByName: null, notas: existingData.notas || ""
        }, { merge: true });
        count++;
      }
      showToast(`${count} archivo(s) subido(s)`, 'success');
      loadContent();
    } catch (e) { showToast("Error al subir archivos", 'error'); }
    finally { setIsUploading(false); }
  };

  const handleUploadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) processFiles(e.target.files);
  };

  // ── Drag & drop ──
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (draggingItem) return;
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (draggingItem) return;
    if (e.dataTransfer.files?.length) await processFiles(e.dataTransfer.files);
  };

  const handleItemDragStart = (e: React.DragEvent, item: DriveFile | DriveFolder, type: DragItemType) => {
    if (!isQuality) { e.preventDefault(); return; }
    setDraggingItem({ type, data: item }); e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!draggingItem) return;
    if (draggingItem.type === 'folder' && (draggingItem.data as DriveFolder).fullPath === folderPath) return;
    setDropTargetFolder(folderPath);
  };

  const handleFolderDrop = async (e: React.DragEvent, target: DriveFolder) => {
    e.preventDefault(); e.stopPropagation(); setDropTargetFolder(null);
    if (!draggingItem) return;
    let ok = false;
    if (draggingItem.type === 'folder') {
      const f = draggingItem.data as DriveFolder;
      if (f.fullPath !== target.fullPath) ok = await executeMoveFolder(f, target.fullPath);
    } else {
      const f = draggingItem.data as DriveFile;
      if (!f.fullPath.startsWith(target.fullPath)) ok = await executeMoveFile(f, target.fullPath);
    }
    setDraggingItem(null);
    if (ok) { showToast("Elemento movido", 'success'); loadContent(); }
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: DriveFolder) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file: null, folder });
  };

  // ─── RENDER CONTENT ───────────────────────
  const renderContent = () => {
    // Completed groups view
    if (activeFilter === 'completed' && !completedGroupView) {
      const groups = Object.keys(completedGroups);
      if (groups.length === 0) return <EmptyState icon={FileCheck} title="No hay servicios completados" />;
      return (
        <div className="animate-in fade-in duration-300">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {groups.map(name => (
              <div
                key={name}
                onClick={() => setCompletedGroupView(name)}
                className="group p-4 bg-white border border-emerald-100 hover:border-emerald-300 rounded-2xl cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col items-center gap-3"
              >
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <FileCheck size={22} className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-slate-700 text-center truncate w-full">{name}</p>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {completedGroups[name].length} archivos
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    let displayFiles = processedFiles;
    if (activeFilter === 'completed' && completedGroupView) displayFiles = completedGroups[completedGroupView] || [];
    const showFolders = activeFilter === 'all' && !debouncedSearch && folders.length > 0;

    if (displayFiles.length === 0 && !showFolders) {
      if (debouncedSearch) return <EmptyState icon={Search} title={`Sin resultados para "${debouncedSearch}"`} subtitle="Intenta con otras palabras clave" />;
      return <EmptyState icon={Folder} title="Esta carpeta está vacía" subtitle="Sube archivos o crea una carpeta para comenzar" />;
    }

    return (
      <div className="animate-in slide-in-from-bottom-1 duration-200 pb-24">
        {/* Quick Access */}
        {path.length === 0 && !debouncedSearch && suggestedFiles.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-2">
              <Zap size={13} className="text-amber-500" /> Acceso Rápido
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {suggestedFiles.map(f => (
                <button
                  key={`sugg-${f.fullPath}`}
                  onClick={() => handlePreview(f)}
                  className="flex items-center gap-2.5 p-3 bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl hover:shadow-sm cursor-pointer transition-all group text-left"
                >
                  <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", getFileColorBg(f.name))}>
                    {getFileIcon(f.name, 16)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-600 transition-colors">{f.name}</p>
                    <p className="text-[10px] text-slate-400">{formatDate(f.updated)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Folders */}
        {showFolders && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-2">
              <Folder size={13} className="text-amber-500" /> Carpetas
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{folders.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {folders.map(f => (
                <FolderCard
                  key={f.fullPath}
                  folder={f}
                  isDragTarget={dropTargetFolder === f.fullPath}
                  draggable={isQuality}
                  onDragStart={(e: React.DragEvent) => handleItemDragStart(e, f, 'folder')}
                  onDragOver={(e: React.DragEvent) => handleFolderDragOver(e, f.fullPath)}
                  onDrop={(e: React.DragEvent) => handleFolderDrop(e, f)}
                  onDoubleClick={() => { setPath([...path, f.name]); setSearchQuery(""); }}
                  onContextMenu={(e: React.MouseEvent) => handleFolderContextMenu(e, f)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Files */}
        {displayFiles.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-50/90 backdrop-blur-sm py-2 z-10">
              <h2 className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                <File size={13} className="text-slate-400" />
                {debouncedSearch ? 'Resultados' : 'Archivos'}
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{displayFiles.length}</span>
              </h2>

              {/* Batch actions */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 animate-in slide-in-from-right fade-in duration-150">
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                    {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={handleBatchDownload} disabled={isZipping}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm"
                  >
                    {isZipping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    Descargar
                  </button>
                  {isQuality && (
                    <button
                      onClick={handleBatchDelete}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-all"
                    >
                      <Trash2 size={13} /> Eliminar
                    </button>
                  )}
                  <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {view === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {displayFiles.map(file => (
                  <FileCard
                    key={file.fullPath} file={file}
                    selected={selectedIds.has(file.fullPath)}
                    searchActive={!!debouncedSearch}
                    onSelect={(multi: boolean, range: boolean) => handleSelect(file, multi, range)}
                    onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file, folder: null }); if (!selectedIds.has(file.fullPath)) handleSelect(file, false, false); }}
                    onDoubleClick={() => handlePreview(file)}
                    onStar={handleToggleStar}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
                {/* List header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0">
                  <div className="col-span-12 md:col-span-5 flex items-center gap-2">
                    <div className="w-5" />
                    Nombre
                  </div>
                  <div className="hidden md:block col-span-3">Plazo</div>
                  <div className="hidden md:block col-span-2">Estado</div>
                  <div className="hidden md:block col-span-1 text-right">Fecha</div>
                  <div className="hidden md:block col-span-1 text-right">Tamaño</div>
                </div>
                {displayFiles.map(file => (
                  <FileListRow
                    key={file.fullPath} file={file}
                    selected={selectedIds.has(file.fullPath)}
                    searchActive={!!debouncedSearch}
                    onSelect={(multi: boolean, range: boolean) => handleSelect(file, multi, range)}
                    onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file, folder: null }); if (!selectedIds.has(file.fullPath)) handleSelect(file, false, false); }}
                    onDoubleClick={() => handlePreview(file)}
                    onDownload={handleDownload}
                    onStar={handleToggleStar}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    );
  };

  // ─── SORT OPTIONS ─────────────────────────
  const sortOptions = [
    { key: 'dateDesc', label: 'Más recientes', icon: <SortDesc size={13} /> },
    { key: 'dateAsc', label: 'Más antiguos', icon: <SortAsc size={13} /> },
    { key: 'nameAsc', label: 'Nombre A→Z', icon: <SortAsc size={13} /> },
    { key: 'nameDesc', label: 'Nombre Z→A', icon: <SortDesc size={13} /> },
    { key: 'sizeDesc', label: 'Más grandes', icon: <SortDesc size={13} /> },
    { key: 'sizeAsc', label: 'Más pequeños', icon: <SortAsc size={13} /> },
  ];

  // ─── BREADCRUMB LABEL ──────────────────────
  const filterLabels: Record<FilterType, string> = {
    all: 'Mi Unidad', starred: 'Destacados', recent: 'Recientes',
    pending_review: 'Pendientes de revisión', completed: 'Historial completados'
  };

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div
      className="flex h-full w-full bg-[#f0f2f5] text-slate-800 font-sans overflow-hidden relative"
      onClick={() => { setContextMenu(null); setSortMenuOpen(false); }}
    >
      {/* Drag overlay */}
      {dragActive && !draggingItem && (
        <div className="absolute inset-0 z-[100] bg-blue-500/10 backdrop-blur-sm border-[3px] border-dashed border-blue-400 m-3 rounded-3xl flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center">
            <UploadCloud size={52} className="text-blue-500 mb-3" />
            <p className="text-lg font-bold text-blue-700">Suelta aquí los archivos</p>
            <p className="text-sm text-slate-400 mt-1">Se subirán a la carpeta actual</p>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div className="absolute inset-0 z-0" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} />

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}

      {/* ── SIDEBAR ──────────────────────────── */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-slate-200/80 flex flex-col transition-transform duration-300 shadow-xl md:shadow-none",
        "md:relative md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
          <img src={labLogo} alt="Logo" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-sm font-bold text-slate-800 tracking-tight leading-none">AG Drive</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Gestión Documental</p>
          </div>
        </div>

        {/* New / Upload button */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div ref={newFileMenuRef} className="relative">
            <button
              onClick={() => setNewFileMenuOpen(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm shadow-blue-200"
            >
              <Plus size={16} /> Nuevo
              <ChevronDown size={14} className={clsx("ml-auto transition-transform", newFileMenuOpen ? "rotate-180" : "")} />
            </button>
            {newFileMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => { fileInputRef.current?.click(); setNewFileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <UploadCloud size={15} className="text-blue-500" /> Subir archivos
                </button>
                {isQuality && (
                  <button
                    onClick={() => { setCreateFolderOpen(true); setNewFileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
                  >
                    <FolderPlus size={15} className="text-amber-500" /> Nueva carpeta
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <SidebarItem icon={<HardDrive size={16} />} label="Mi Unidad" active={activeFilter === 'all'} onClick={() => { setActiveFilter('all'); setPath([]); setCompletedGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
          <SidebarItem icon={<Star size={16} />} label="Destacados" active={activeFilter === 'starred'} onClick={() => { setActiveFilter('starred'); setCompletedGroupView(null); setSidebarOpen(false); }} />
          <SidebarItem icon={<Clock size={16} />} label="Recientes" active={activeFilter === 'recent'} onClick={() => { setActiveFilter('recent'); setCompletedGroupView(null); setSidebarOpen(false); }} />

          {isQuality && (
            <>
              <div className="pt-5 pb-2 px-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión</p>
              </div>
              <SidebarItem icon={<Bell size={16} />} label="Por Revisar" active={activeFilter === 'pending_review'} badge onClick={() => { setActiveFilter('pending_review'); setCompletedGroupView(null); setSidebarOpen(false); }} />
              <SidebarItem icon={<FileCheck size={16} />} label="Completados" active={activeFilter === 'completed'} onClick={() => { setActiveFilter('completed'); setCompletedGroupView(null); setSidebarOpen(false); }} />
            </>
          )}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-slate-100">
          {currentUserData && (
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-blue-600">{(currentUserData.name || 'U').charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{currentUserData.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{currentUserData.puesto || 'Usuario'}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleBack}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all text-sm font-medium"
          >
            <LogOut size={15} /> Salir al Menú
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">

        {/* Top header */}
        <header className="h-14 border-b border-slate-200/80 flex items-center gap-3 px-4 md:px-6 bg-white/90 backdrop-blur-md sticky top-0 z-30 flex-shrink-0">
          {/* Mobile menu */}
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
            <Menu size={18} />
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-lg group">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar en AG Drive..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 hover:bg-slate-100/80 focus:bg-white focus:ring-2 focus:ring-blue-500/30 border border-transparent focus:border-blue-500 rounded-xl py-2 pl-9 pr-8 text-sm outline-none transition-all text-slate-800 placeholder-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isSyncing && (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-blue-500 animate-pulse">
                <RefreshCw size={11} className="animate-spin" /> Sincronizando...
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="hidden md:flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-95"
            >
              {isUploading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
              Subir
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleUploadInput} />

            {/* View toggle */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5">
              <button onClick={() => setView('list')} className={clsx("p-1.5 rounded-lg transition-all", view === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-700")}>
                <Rows3 size={15} />
              </button>
              <button onClick={() => setView('grid')} className={clsx("p-1.5 rounded-lg transition-all", view === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-700")}>
                <Grid3X3 size={15} />
              </button>
            </div>

            {/* Details panel toggle */}
            <button
              onClick={() => setDetailsOpen(v => !v)}
              className={clsx("p-2 rounded-xl border transition-all", detailsOpen ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300")}
              title="Información"
            >
              <Info size={15} />
            </button>
          </div>
        </header>

        {/* Breadcrumb + sort bar */}
        <div className="h-10 border-b border-slate-200/60 flex items-center justify-between px-4 md:px-6 bg-white/80 backdrop-blur-sm flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs overflow-hidden min-w-0">
            {activeFilter !== 'all' ? (
              <span className="flex items-center gap-1.5 font-semibold text-blue-600">
                <Filter size={11} />
                {filterLabels[activeFilter]}
                {completedGroupView && (
                  <>
                    <ChevronRight size={11} className="text-slate-300" />
                    <span className="text-slate-700">{completedGroupView}</span>
                  </>
                )}
              </span>
            ) : debouncedSearch ? (
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Search size={11} className="text-blue-500" />
                Resultados para "{debouncedSearch}"
              </span>
            ) : (
              <nav className="flex items-center gap-1 text-slate-500">
                <button
                  onClick={() => setPath([])}
                  className={clsx("hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors flex items-center gap-1", path.length === 0 ? "text-slate-800 font-semibold" : "")}
                >
                  <Home size={11} /> Mi Unidad
                </button>
                {path.map((folder, i) => (
                  <React.Fragment key={folder}>
                    <ChevronRight size={11} className="text-slate-300" />
                    <button
                      onClick={() => setPath(path.slice(0, i + 1))}
                      className={clsx("hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors truncate max-w-[120px]", i === path.length - 1 ? "text-slate-800 font-semibold" : "")}
                    >
                      {folder}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
            )}
          </div>

          {/* Sort */}
          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSortMenuOpen(v => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowUpWideNarrow size={13} />
              <span className="hidden sm:inline">Ordenar</span>
              <ChevronDown size={11} className={clsx("transition-transform", sortMenuOpen ? "rotate-180" : "")} />
            </button>
            {sortMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 py-1">
                {sortOptions.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { setSortBy(opt.key as SortType); setSortMenuOpen(false); }}
                    className={clsx("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors", sortBy === opt.key ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50")}
                  >
                    {opt.icon} {opt.label}
                    {sortBy === opt.key && <CheckCircle2 size={11} className="ml-auto text-blue-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex min-h-0">
          <div className={clsx("flex-1 p-4 md:p-6 min-w-0 transition-all duration-200")}>
            {loading ? <LoadingSkeleton /> : renderContent()}
          </div>

          {/* Details panel */}
          {detailsOpen && selectedIds.size === 1 && (() => {
            const file = files.find(f => f.fullPath === Array.from(selectedIds)[0]);
            return file ? (
              <DetailsPanel
                file={file}
                onClose={() => setDetailsOpen(false)}
                isQualityUser={isQuality}
                onToggleStatus={updateFileStatus}
                onUpdateNotes={updateNotes}
                onDownload={handlePreview}
                onDelete={handleDelete}
              />
            ) : null;
          })()}
        </div>
      </div>

      {/* ── PREVIEW MODAL ─────────────────────── */}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onDownload={() => handleDownload(previewFile)} />
      )}

      {/* ── CONTEXT MENU ──────────────────────── */}
      {contextMenu && (
        <div
          className="fixed bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl py-2 w-56 z-[150] text-sm animate-in fade-in zoom-in-95 duration-100"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 320), left: Math.min(contextMenu.x, window.innerWidth - 240) }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-xs font-semibold text-slate-700 truncate">{contextMenu.file?.name ?? contextMenu.folder?.name}</p>
            {contextMenu.file && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatFileSize(contextMenu.file.size)}</p>}
          </div>

          {contextMenu.file && (
            <>
              <MenuOption icon={<Eye size={14} />} label="Vista previa" shortcut="Esp" onClick={() => { if (contextMenu.file) handlePreview(contextMenu.file); setContextMenu(null); }} />
              <MenuOption icon={<Info size={14} />} label="Ver detalles" onClick={() => { if (contextMenu.file) { setSelectedIds(new Set([contextMenu.file.fullPath])); setDetailsOpen(true); } setContextMenu(null); }} />
              <MenuOption icon={<Download size={14} />} label="Descargar" onClick={() => { if (contextMenu.file) handleDownload(contextMenu.file); setContextMenu(null); }} />
              <MenuOption
                icon={<Star size={14} className={contextMenu.file.starred ? "fill-amber-500 text-amber-500" : ""} />}
                label={contextMenu.file.starred ? "Quitar de destacados" : "Agregar a destacados"}
                onClick={() => { if (contextMenu.file) handleToggleStar(contextMenu.file); setContextMenu(null); }}
              />
              <div className="my-1 mx-2 border-t border-slate-100" />
              <MenuOption
                icon={<FileCheck size={14} />}
                label={contextMenu.file.completed ? "Marcar como pendiente" : "Marcar como realizado"}
                onClick={() => { updateFileStatus(contextMenu.file!, 'completed', !contextMenu.file!.completed); setContextMenu(null); }}
              />
              {isQuality && (
                <MenuOption
                  icon={<CheckCircle2 size={14} />}
                  label={contextMenu.file.reviewed ? "Invalidar calidad" : "Validar calidad"}
                  onClick={() => { updateFileStatus(contextMenu.file!, 'reviewed', !contextMenu.file!.reviewed); setContextMenu(null); }}
                />
              )}
              {isQuality && (
                <>
                  <div className="my-1 mx-2 border-t border-slate-100" />
                  <MenuOption icon={<Edit size={14} />} label="Renombrar" onClick={() => { if (contextMenu.file) { setRenameTargetFile(contextMenu.file); setRenameTargetFolder(null); setNewName(contextMenu.file.name); setRenameDialogOpen(true); setContextMenu(null); } }} />
                  <MenuOption icon={<FolderSymlink size={14} />} label="Mover a..." onClick={() => { if (contextMenu.file) { setMoveTargetFile(contextMenu.file); setMoveTargetFolder(null); setMoveDialogOpen(true); setContextMenu(null); } }} />
                  <MenuOption icon={<Trash2 size={14} />} label="Eliminar" danger onClick={() => { if (contextMenu.file) handleDelete(contextMenu.file); setContextMenu(null); }} shortcut="Del" />
                </>
              )}
            </>
          )}

          {contextMenu.folder && isQuality && (
            <>
              <MenuOption icon={<FolderOpen size={14} />} label="Abrir" onClick={() => { if (contextMenu.folder) { setPath([...path, contextMenu.folder.name]); setContextMenu(null); } }} />
              <MenuOption icon={<Edit size={14} />} label="Renombrar" onClick={() => { if (contextMenu.folder) { setRenameTargetFolder(contextMenu.folder); setRenameTargetFile(null); setNewName(contextMenu.folder.name); setRenameDialogOpen(true); setContextMenu(null); } }} />
              <MenuOption icon={<FolderSymlink size={14} />} label="Mover a..." onClick={() => { if (contextMenu.folder) { setMoveTargetFolder(contextMenu.folder); setMoveTargetFile(null); setMoveDialogOpen(true); setContextMenu(null); } }} />
              <div className="my-1 mx-2 border-t border-slate-100" />
              <MenuOption icon={<Trash2 size={14} />} label="Eliminar carpeta" danger onClick={() => { if (contextMenu.folder) executeDeleteFolder(contextMenu.folder); setContextMenu(null); }} />
            </>
          )}
        </div>
      )}

      {/* ── MOVE MODAL ────────────────────────── */}
      {moveDialogOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <FolderSymlink size={16} className="text-blue-500" />
                Mover "{moveTargetFile?.name ?? moveTargetFolder?.name}"
              </h3>
              <button onClick={() => setMoveDialogOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={15} className="text-slate-400" />
              </button>
            </div>

            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <button
                disabled={moveToPath.length === 0}
                onClick={() => setMoveToPath(prev => prev.slice(0, -1))}
                className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-all"
              >
                <ArrowUp size={13} />
              </button>
              <div className="flex items-center gap-1 text-xs text-slate-600 overflow-hidden">
                <Home size={12} className="text-slate-400 flex-shrink-0" />
                <span className="text-slate-400">/</span>
                {moveToPath.map((p, i) => <span key={i} className="font-medium text-slate-700">{p} /</span>)}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2 min-h-[180px]">
              {moveFolderContent.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <FolderOpen size={28} strokeWidth={1.5} className="mb-2 opacity-50" />
                  <p className="text-xs">Sin subcarpetas</p>
                </div>
              ) : (
                <div className="px-2 space-y-0.5">
                  {moveFolderContent.map((folder, i) => (
                    <button
                      key={i}
                      onClick={() => setMoveToPath([...moveToPath, folder.name])}
                      disabled={moveTargetFolder?.name === folder.name}
                      className={clsx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors", moveTargetFolder?.name === folder.name ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50")}
                    >
                      <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Folder size={16} className="text-amber-500 fill-amber-100" />
                      </div>
                      <span className="text-sm text-slate-700 font-medium flex-1 truncate">{folder.name}</span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setMoveDialogOpen(false)} disabled={isMoving} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleModalMove}
                disabled={(!moveTargetFile && !moveTargetFolder) || isMoving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 disabled:opacity-50 transition-all"
              >
                {isMoving ? <Loader2 size={14} className="animate-spin" /> : <FolderSymlink size={14} />}
                Mover aquí
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOGS ───────────────────────────── */}
      {createFolderOpen && (
        <Dialog
          title="Nueva carpeta"
          onClose={() => { setCreateFolderOpen(false); setNewFolderName(""); }}
          onConfirm={() => {
            if (!newFolderName.trim()) return;
            const folderRef = ref(storage, `${[ROOT_PATH, ...path, newFolderName.trim()].join('/')}/.keep`);
            uploadBytes(folderRef, new Uint8Array([0])).then(() => { setCreateFolderOpen(false); setNewFolderName(""); loadContent(); });
          }}
          confirmLabel="Crear"
        >
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newFolderName.trim()) { const folderRef = ref(storage, `${[ROOT_PATH, ...path, newFolderName.trim()].join('/')}/.keep`); uploadBytes(folderRef, new Uint8Array([0])).then(() => { setCreateFolderOpen(false); setNewFolderName(""); loadContent(); }); } }}
            className="w-full border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 p-3 rounded-xl outline-none text-sm transition-all"
            placeholder="Nombre de la carpeta..."
          />
        </Dialog>
      )}

      {renameDialogOpen && (
        <Dialog
          title={renameTargetFile ? "Renombrar archivo" : "Renombrar carpeta"}
          onClose={() => setRenameDialogOpen(false)}
          onConfirm={async () => {
            if (!newName.trim()) return;
            setRenameDialogOpen(false);
            const dest = [ROOT_PATH, ...path].join('/');
            if (renameTargetFile) {
              const ok = await executeMoveFile(renameTargetFile, dest + '/' + newName.trim());
              if (ok) { showToast("Archivo renombrado", 'success'); loadContent(); }
            } else if (renameTargetFolder) {
              const ok = await executeMoveFolder(renameTargetFolder, dest + '/' + newName.trim());
              if (ok) { showToast("Carpeta renombrada", 'success'); loadContent(); }
            }
          }}
          confirmLabel="Renombrar"
          confirmClass="bg-violet-600 hover:bg-violet-700 text-white"
        >
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 p-3 rounded-xl outline-none text-sm transition-all"
            placeholder="Nuevo nombre..."
          />
        </Dialog>
      )}

      {/* ── TOAST NOTIFICATIONS ───────────────── */}
      <div className="fixed bottom-6 right-5 z-[300] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} />
          </div>
        ))}
      </div>
    </div>
  );
}