import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ref, listAll, getDownloadURL, uploadBytes, deleteObject, getMetadata } from "firebase/storage";
import { doc, getDoc, deleteDoc, setDoc, collection, getDocs, updateDoc, query, limit, orderBy, where, writeBatch } from "firebase/firestore";
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
import {
  buildPendingWorksheetDriveEntry,
  extractWorksheetLinkId,
  isLinkableWorksheetId,
  resolveWorksheetBySearchTerm,
  resolveWorksheetDoc,
  type PendingWorksheetDriveEntry,
} from "../utils/worksheetDriveSync";
import {
  generateWorksheetPdfFromFirestore,
  getTechnicianFolderName,
} from "../utils/worksheetPdfGenerator";
import { getFolderVisualStyle } from "../utils/fileUtils";
import { parseDateRobust } from "../utils/calibrationShared";
import { normalizeDriveDate, resolveFileWorkDate, enrichFilesWithWorkDates, enrichFilesWithWorksheetInfo, extractWorkDateFromWorksheet } from "../utils/driveFileMetadata";
import { notificarCalidadRevisionPendiente } from "../utils/notificacionesRevisionCalidad";
import {
  isMetadataPendingReview,
  isWorksheetRealizado,
  normalizeDriveFullPath,
  PENDING_REVIEW_METADATA_LIMIT,
  resolveTechnicianGroupKey,
  syncPendingReviewFromWorksheets,
  syncSingleFilePendingReviewFromWorksheet,
} from "../utils/pendingReviewDrive";
import DrivePreviewModal from "./DrivePreviewModal";

const BRAND_NAME = 'Equipos y Servicios AG';
const BRAND_SUBTITLE = 'Sistema de gestión metrológica';

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
  ubicacion?: string;
  ubicacion_real?: string;
  workDate?: string;
  /** Virtual row: hoja en Firestore sin PDF en Storage (solo vía búsqueda por ID). */
  isPendingWorksheet?: boolean;
  worksheetDocId?: string;
  worksheetId?: string;
  worksheetCliente?: string;
  worksheetEquipo?: string;
  worksheetFecha?: string;
  worksheetTechnician?: string;
  worksheetCargadoDrive?: string;
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
    file.name, 
    file.rawName, 
    file.notas || "",
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
    if (parent === 'worksheets' || parent === 'certificados') return "Raíz";
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

const getDeadlineInfo = (createdDateStr: unknown) => {
  const createdDate = parseDateRobust(createdDateStr);
  if (!createdDate) return { progress: 0, daysLeft: 5, status: 'normal' as const };
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

const formatDate = (dateStr: unknown) => {
  const d = parseDateRobust(dateStr);
  if (!d) return '—';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: days > 365 ? 'numeric' : undefined });
};

const getFileWorkDate = (file: DriveFile) =>
  file.workDate || resolveFileWorkDate(file, [file.created, file.updated]) || file.created;

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
  <div className="flex flex-col items-center justify-center py-20 md:py-28 text-center animate-in fade-in duration-500">
    <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-6 border border-slate-200/80 shadow-sm">
      <Icon className="w-10 h-10 text-slate-300" strokeWidth={1.5} />
    </div>
    <p className="text-lg font-semibold text-slate-600 mb-1.5">{title}</p>
    {subtitle && <p className="text-sm text-slate-400 max-w-sm leading-relaxed">{subtitle}</p>}
  </div>
);

const LoadingSkeleton = ({ compact = false }: { compact?: boolean }) => (
  <div className={clsx("flex flex-col animate-in fade-in duration-200", compact ? "py-6" : "items-center justify-center min-h-[280px]")}>
    {!compact && (
      <>
        <Loader2 size={28} className="text-blue-500 animate-spin mb-3" />
        <p className="text-slate-400 text-sm font-medium">Cargando...</p>
      </>
    )}
    <div className={clsx("space-y-2", compact ? "w-full mt-2" : "mt-6 w-64")}>
      {[1, 2, 3].map(i => (
        <div key={i} className="h-9 bg-slate-100 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  </div>
);

const groupFilesByUbicacion = (files: DriveFile[]) => {
  const lab: DriveFile[] = [];
  const site: DriveFile[] = [];
  files.forEach((f) => {
    const ubicacionAttr = (f.ubicacion_real || f.ubicacion || "").toLowerCase();
    const notasLower = (f.notas || "").toLowerCase();
    const isSitio = ubicacionAttr.includes("sitio") || notasLower.includes("sitio");
    if (isSitio) site.push(f);
    else lab.push(f);
  });
  return { lab, site };
};

const isWorksheetPdfFile = (file: DriveFile) =>
  (file.rawName || file.name).toLowerCase().endsWith(".pdf");

const ReviewMetaLine = ({ file }: { file: DriveFile }) => {
  const id = file.worksheetId || extractWorksheetLinkId(file.rawName || file.name);
  const fecha = file.worksheetFecha || file.workDate || "";
  const cliente = file.worksheetCliente || "";
  const tecnico = file.worksheetTechnician || file.completedByName || file.uploadedBy || file.parentFolder || "";
  if (!id && !cliente && !fecha) return null;
  return (
    <p className="text-[10px] text-blue-700/90 mt-1 line-clamp-2 leading-snug">
      <span className="font-semibold">ID {id || "—"}</span>
      {fecha ? ` · ${formatDate(fecha)}` : ""}
      {cliente ? ` · ${cliente}` : ""}
      {tecnico ? ` · ${tecnico}` : ""}
    </p>
  );
};

// ─── FILE CARD (Grid) ─────────────────────────
const FileCard = React.memo(({ file, selected, onSelect, onContextMenu, onDoubleClick, searchActive, onStar, showReviewMeta }: any) => {
  const isReadyForReview = file.completed && !file.reviewed;
  const showFolder = searchActive && file.parentFolder && file.parentFolder !== "Raíz";
  const isNoExpiration = file.fullPath?.toLowerCase().includes('hojas de servicio') || file.name?.toUpperCase().startsWith('HSDG');
  const { status } = getDeadlineInfo(getFileWorkDate(file));
  const isOverdue = status === 'overdue' && !file.completed && !isNoExpiration && !file.isPendingWorksheet;

  return (
    <div
      onClick={(e) => onSelect(file, e.ctrlKey || e.metaKey, e.shiftKey)}
      onContextMenu={(e) => onContextMenu(e, file)}
      onDoubleClick={() => onDoubleClick(file)}
      className={clsx(
        "group relative bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-200 flex flex-col select-none border shadow-sm",
        selected
          ? "ring-2 ring-blue-500 border-blue-200 shadow-md shadow-blue-100/40 -translate-y-0.5"
          : "border-slate-200/90 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5",
        isOverdue && !selected ? "border-red-200 shadow-red-50/50" : "",
        isReadyForReview && !isOverdue && !selected ? "border-blue-200 shadow-blue-50/50" : "",
        file.isPendingWorksheet && !selected ? "border-amber-200 shadow-amber-50/50" : ""
      )}
    >
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDoubleClick(file); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onDoubleClick(file); } }}
          className={clsx(
            "h-28 flex items-center justify-center relative transition-colors cursor-pointer touch-manipulation",
            isOverdue ? "bg-red-50/60" : getFileColorBg(file.name)
          )}
        >
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

        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {file.isPendingWorksheet && (
            <div className="bg-amber-500 text-white px-1.5 py-0.5 rounded-md text-[9px] font-bold shadow-sm" title="Sin PDF en Drive">
              Sin PDF
            </div>
          )}
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

        <div className="transform transition-transform group-hover:scale-110 duration-300 drop-shadow-sm pointer-events-none">
          {getFileIcon(file.name, 52)}
        </div>
        </div>

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
          {file.isPendingWorksheet && file.notas && (
            <p className="text-[10px] text-amber-700 mt-1 line-clamp-2">{file.notas}</p>
          )}
          {showReviewMeta && file.completed && !file.reviewed && (
            <ReviewMetaLine file={file} />
          )}
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">{formatFileSize(file.size)}</span>
            <StatusChip file={file} />
          </div>
          {!isNoExpiration ? (
            <DeadlineBar createdDate={getFileWorkDate(file)} />
          ) : (
            <p className="text-[9px] text-slate-300 font-semibold uppercase tracking-wider">Documento Fijo</p>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── FILE LIST ROW ────────────────────────────
const FileListRow = React.memo(({ file, selected, onSelect, onContextMenu, onDoubleClick, searchActive, onDownload, onStar, showReviewMeta }: any) => {
  const showFolder = searchActive && file.parentFolder && file.parentFolder !== "Raíz";
  const isNoExpiration = file.fullPath?.toLowerCase().includes('hojas de servicio') || file.name?.toUpperCase().startsWith('HSDG');
  const { status } = getDeadlineInfo(getFileWorkDate(file));
  const isOverdue = status === 'overdue' && !file.completed && !isNoExpiration && !file.isPendingWorksheet;

  return (
    <div
      onClick={(e) => onSelect(file, e.ctrlKey || e.metaKey, e.shiftKey)}
      onContextMenu={(e) => onContextMenu(e, file)}
      onDoubleClick={() => onDoubleClick(file)}
      className={clsx(
        "grid grid-cols-12 gap-2 px-4 py-3.5 border-b border-slate-100/90 cursor-pointer items-center transition-all duration-150 group select-none last:border-b-0",
        selected ? "bg-[#e8f0fe] border-l-[3px] border-l-blue-500 shadow-sm" : "hover:bg-[#f1f3f4]",
        isOverdue && !selected ? "bg-red-50/40" : ""
      )}
    >
      <div className="col-span-12 md:col-span-5 flex items-center gap-3 min-w-0">
        <div className={clsx(
          "w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all cursor-pointer",
          selected ? "bg-blue-500 border-blue-500" : "border-slate-200 bg-white opacity-0 group-hover:opacity-100"
        )}>
          {selected && <CheckCircle2 size={10} className="text-white" />}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDoubleClick?.(file); }}
          className={clsx("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform active:scale-95", getFileColorBg(file.name))}
          title="Vista previa"
        >
          {getFileIcon(file.name, 18)}
        </button>
        <div className="min-w-0">
          <p className={clsx("text-sm font-medium truncate", selected ? "text-blue-700" : "text-slate-800")}>{file.name}</p>
          {file.isPendingWorksheet && (
            <span className="text-[10px] font-semibold text-amber-600">Sin PDF — use «Generar PDF»</span>
          )}
          {showReviewMeta && file.completed && !file.reviewed && (
            <ReviewMetaLine file={file} />
          )}
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

      <div className="hidden md:block md:col-span-3 pr-4">
        {!isNoExpiration ? (
          <DeadlineBar createdDate={getFileWorkDate(file)} />
        ) : (
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Fijo</span>
        )}
      </div>

      <div className="hidden md:block md:col-span-2">
        <StatusChip file={file} />
      </div>

      <div className="hidden md:block md:col-span-1 text-right">
        <span className="text-xs text-slate-400">{formatDate(getFileWorkDate(file))}</span>
      </div>

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
const FolderCard = ({ folder, onDoubleClick, onContextMenu, isDragTarget, draggable, onDragStart, onDragOver, onDrop }: any) => {
  const style = getFolderVisualStyle(folder.name);
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={clsx(
        "group flex items-center gap-3 px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-150 border select-none shadow-sm",
        isDragTarget
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-300 scale-[1.02]"
          : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-md hover:-translate-y-px"
      )}
    >
      <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors", style.bg, style.hoverBg)}>
        <Folder size={20} className={clsx(style.icon, style.fill, style.hoverFill, "transition-all")} />
      </div>
      <span className="text-sm font-medium text-slate-700 truncate flex-1 group-hover:text-slate-900">{folder.name}</span>
      <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
    </div>
  );
};

// ─── DETAILS PANEL ────────────────────────────
const DetailsPanel = ({ file, onClose, isQualityUser, onToggleStatus, onDownload, onDelete, onUpdateNotes, onRegeneratePdf, isGeneratingPdf, showRegeneratePdf, isPendingWorksheet }: any) => {
  const [notes, setNotes] = React.useState(file.notas || "");
  React.useEffect(() => { setNotes(file.notas || ""); }, [file]);

  return (
    <div className="fixed md:relative inset-0 md:inset-auto w-full md:w-80 bg-white border-l border-slate-200 z-[60] flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-250">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-semibold text-slate-800">Información</span>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <X size={16} className="text-slate-400" />
        </button>
      </div>

      <div className="px-5 py-6 flex flex-col items-center border-b border-slate-100 flex-shrink-0">
        <div className={clsx("w-20 h-20 rounded-2xl flex items-center justify-center mb-4 border", getFileColorBg(file.name), "border-slate-100")}>
          {getFileIcon(file.name, 44)}
        </div>
        <h3 className="font-semibold text-slate-800 text-center text-sm break-all leading-snug">{file.name}</h3>
        <p className="text-xs text-slate-400 mt-1 font-mono">{formatFileSize(file.size)}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detalles</h4>
          {[
            { label: 'Fecha de trabajo', value: formatDate(getFileWorkDate(file)) },
            ...(file.worksheetId ? [{ label: 'ID equipo', value: file.worksheetId }] : []),
            ...(file.worksheetCliente ? [{ label: 'Cliente', value: file.worksheetCliente }] : []),
            ...(file.worksheetTechnician || file.completedByName
              ? [{ label: 'Técnico', value: file.worksheetTechnician || file.completedByName }]
              : []),
            { label: 'Subido', value: formatDate(file.created) },
            { label: 'Modificado', value: formatDate(file.updated) },
            { label: 'Subido por', value: file.uploadedBy || '—' },
            { label: 'Carpeta', value: file.parentFolder || 'Raíz' },
            ...(file.ubicacion_real || file.ubicacion ? [{ label: 'Ubicación', value: file.ubicacion_real || file.ubicacion }] : [])
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-3">
              <span className="text-xs text-slate-400 flex-shrink-0">{label}</span>
              <span className="text-xs text-slate-700 font-medium text-right truncate">{value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado del Proceso</h4>
          {!isPendingWorksheet ? (
            <>
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
            </>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
              Hoja registrada en Firestore sin PDF en Drive. Genere el PDF para continuar el flujo normal.
            </p>
          )}
        </div>

        {!isPendingWorksheet && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notas</h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => { if (notes !== file.notas) onUpdateNotes(file, notes); }}
            placeholder="Agrega comentarios u observaciones (Ej. Ubicacion: Sitio)..."
            className="w-full h-24 p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none text-slate-700 placeholder-slate-300"
          />
          <p className="text-[10px] text-slate-300">Se incluirá en búsquedas globales</p>
        </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-100 flex flex-col gap-2 flex-shrink-0">
        {showRegeneratePdf && onRegeneratePdf && (
          <button
            onClick={() => onRegeneratePdf(file)}
            disabled={isGeneratingPdf}
            className={clsx(
              "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60",
              isPendingWorksheet
                ? "bg-amber-600 border border-amber-700 hover:bg-amber-700"
                : "bg-slate-800 border border-slate-900 hover:bg-slate-900"
            )}
          >
            {isGeneratingPdf ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isPendingWorksheet ? (
              <FilePlus2 size={14} />
            ) : (
              <RefreshCw size={14} />
            )}
            {isGeneratingPdf
              ? isPendingWorksheet ? "Generando PDF..." : "Regenerando PDF..."
              : isPendingWorksheet ? "Generar PDF" : "Regenerar PDF"}
          </button>
        )}
        <div className="flex gap-2">
        {!isPendingWorksheet && (
        <button onClick={() => onDownload(file)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-all">
          <Eye size={14} /> Vista Previa
        </button>
        )}
        {isQualityUser && !isPendingWorksheet && (
          <button onClick={() => onDelete(file)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 text-xs font-semibold text-red-600 transition-all">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
        </div>
      </div>
    </div>
  );
};

// ─── DIALOG ───────────────────────────────────
const Dialog = ({ title, children, onClose, onConfirm, confirmLabel = "Confirmar", confirmClass = "bg-[#0050d8] hover:bg-[#1a66e0] text-white", confirmDisabled = false, confirmLoading = false }: any) => (
  <div className="fixed inset-0 z-[210] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
      <div className="px-5 pb-5 flex justify-end gap-2">
        <button onClick={onClose} disabled={confirmLoading} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">Cancelar</button>
        <button onClick={onConfirm} disabled={confirmDisabled || confirmLoading} className={clsx("px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50", confirmClass)}>
          {confirmLoading && <Loader2 size={14} className="animate-spin" />}
          {confirmLabel}
        </button>
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
const SidebarItem = ({ icon, label, active, onClick, badge, className }: any) => (
  <button
    onClick={onClick}
    className={clsx(
      "w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between group",
      active ? "bg-[#0050d8]/10 text-[#0050d8]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}
  >
    <div className="flex items-center gap-3">
      <span className={clsx("flex-shrink-0 transition-colors", className || (active ? "text-[#0050d8]" : "text-slate-400 group-hover:text-slate-600"))}>{icon}</span>
      {label}
    </div>
    {badge && <div className="w-2 h-2 bg-[#0050d8] rounded-full flex-shrink-0" />}
  </button>
);

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function DriveScreen({ onBack }: { onBack?: () => void }) {
  const [user] = useAuthState(auth);
  const { goBack } = useNavigation();

  // --- NUEVA LÓGICA DE CARPETA DINÁMICA ---
  const [currentRoot, setCurrentRoot] = useState<"worksheets" | "certificados">("worksheets");

  // Data
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [suggestedFiles, setSuggestedFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
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
  const [groupView, setGroupView] = useState<string | null>(null);
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
  const [moveTargetFiles, setMoveTargetFiles] = useState<DriveFile[]>([]);
  const [moveTargetFolder, setMoveTargetFolder] = useState<DriveFolder | null>(null);
  const [moveToPath, setMoveToPath] = useState<string[]>([]);
  const [moveFolderContent, setMoveFolderContent] = useState<DriveFolder[]>([]);
  const [moveCreateFolderOpen, setMoveCreateFolderOpen] = useState(false);
  const [moveNewFolderName, setMoveNewFolderName] = useState("");
  const [isCreatingMoveFolder, setIsCreatingMoveFolder] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetFile, setRenameTargetFile] = useState<DriveFile | null>(null);
  const [renameTargetFolder, setRenameTargetFolder] = useState<DriveFolder | null>(null);
  const [newName, setNewName] = useState("");
  const [generatingPdfLinkId, setGeneratingPdfLinkId] = useState<string | null>(null);
  const [pendingWorksheetFile, setPendingWorksheetFile] = useState<PendingWorksheetDriveEntry | null>(null);

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
        let snap = await getDocs(query(collection(db, "usuarios"), where("correo", "==", user.email), limit(1)));
        if (snap.empty) {
          snap = await getDocs(query(collection(db, "usuarios"), where("email", "==", user.email), limit(1)));
        }
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setCurrentUserData({
            name: data.nombre || data.name,
            email: data.correo || data.email || user.email,
            puesto: data.puesto || data.role,
          });
        } else {
          setCurrentUserData({ name: user.displayName || "Usuario", email: user.email || "", role: "User" });
        }
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
          
          if (!fullPath.startsWith(currentRoot)) continue;

          if (!isQuality) {
            const isUploader = normalizeText(data.uploadedBy || "") === myName;
            if (!fullPath.toLowerCase().includes(myName) && !isUploader) continue;
          }
          recents.push({
            name: cleanFileName(data.name),
            rawName: data.name,
            fullPath,
            url: "",
            ...data,
            updated: normalizeDriveDate(data.updated),
            created: normalizeDriveDate(data.created || data.updated),
            workDate: resolveFileWorkDate(data, [data.created, data.updated]),
          });
        }
        setSuggestedFiles(await enrichFilesWithWorkDates(recents));
      } catch (e) { console.error(e); }
    };
    load();
  }, [currentUserData, path, debouncedSearch, isQuality, currentRoot]);

  // ── Load content ──
  const loadContent = useCallback(async () => {
    setContextMenu(null);
    setSelectedIds(new Set());
    setLastSelectedId(null);

    const isGlobalView = activeFilter !== 'all' || debouncedSearch !== "";
    if (isGlobalView) setLoading(true);

    try {
      if (isGlobalView) {
        setLoading(true);
        setFilesLoading(false);

        if (activeFilter === 'pending_review' && currentRoot === 'worksheets') {
          setIsSyncing(true);
          void syncPendingReviewFromWorksheets(currentRoot, { maxWrites: 150 })
            .catch((e) => console.error("syncPendingReviewFromWorksheets", e))
            .finally(() => setIsSyncing(false));
        }

        const pendingReviewQ = query(
          collection(db, 'fileMetadata'),
          where('completed', '==', true),
          orderBy('created', 'desc'),
          limit(PENDING_REVIEW_METADATA_LIMIT)
        );
        const defaultQ = query(
          collection(db, 'fileMetadata'),
          orderBy('created', 'desc'),
          limit(activeFilter === 'pending_review' ? PENDING_REVIEW_METADATA_LIMIT : 400)
        );

        let snap;
        if (activeFilter === 'pending_review') {
          try {
            snap = await getDocs(pendingReviewQ);
          } catch (indexErr) {
            console.warn("pending_review indexed query failed, using fallback", indexErr);
            snap = await getDocs(defaultQ);
          }
        } else {
          snap = await getDocs(defaultQ);
        }
        const results: DriveFile[] = [];
        const myName = normalizeText(currentUserData?.name || "");
        const searchTerms = debouncedSearch ? normalizeText(debouncedSearch).split(/[\s\-]+/).filter(t => t.length > 0) : [];

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const rawName = data.name || docSnap.id;
          const fullPath = normalizeDriveFullPath(data.filePath, rawName, currentRoot);

          if (!fullPath.startsWith(`${currentRoot}/`)) return;

          if (!isQuality) {
            const isUploader = normalizeText(data.uploadedBy || "") === myName;
            if (!fullPath.toLowerCase().includes(myName) && !isUploader) return;
          }

          if (activeFilter === 'starred' && data.starred !== true) return;
          if (activeFilter === 'pending_review' && !isMetadataPendingReview(data)) return;
          if (activeFilter === 'completed' && data.reviewed !== true) return;
          if (activeFilter === 'recent') {
            const recentDate = parseDateRobust(resolveFileWorkDate(data, [data.updated, data.created]));
            if (!recentDate) return;
            const diff = Math.abs(new Date().getTime() - recentDate.getTime());
            if (Math.ceil(diff / (1000 * 60 * 60 * 24)) > 7) return;
          }

          const fileObj: DriveFile = {
            name: cleanFileName(rawName), rawName, url: "", fullPath,
            updated: normalizeDriveDate(data.updated),
            created: normalizeDriveDate(data.created || data.updated),
            workDate: resolveFileWorkDate(data, [data.created, data.updated]),
            size: data.size || 0, contentType: data.contentType,
            reviewed: data.reviewed, reviewedByName: data.reviewedByName,
            completed: data.completed, completedByName: data.completedByName,
            starred: data.starred, uploadedBy: data.uploadedBy,
            parentFolder: getParentFolderName(fullPath) !== "Raíz"
              ? getParentFolderName(fullPath)
              : resolveTechnicianGroupKey({
                  fullPath,
                  completedByName: data.completedByName,
                  uploadedBy: data.uploadedBy,
                }),
            keywords: data.keywords, notas: data.notas,
            ubicacion: data.ubicacion, ubicacion_real: data.ubicacion_real
          };

          if (searchTerms.length > 0) {
            if (fuzzyMatch(fileObj, searchTerms)) results.push(fileObj);
          } else {
            results.push(fileObj);
          }
        });
        const enriched = await enrichFilesWithWorksheetInfo(
          await enrichFilesWithWorkDates(results)
        );
        setFiles(
          enriched.map((f) => ({
            ...f,
            parentFolder: resolveTechnicianGroupKey(f),
          }))
        );
        setFolders([]);
      } else {
        setLoading(true);
        setFiles([]);
        const pathStr = [currentRoot, ...path].join('/');
        const res = await listAll(ref(storage, pathStr));
        const myName = normalizeText(currentUserData?.name || "");

        let loadedFolders = res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath }));
        if (!isQuality && path.length === 0) {
          loadedFolders = loadedFolders.filter((f) => normalizeText(f.name).includes(myName));
        }
        if (debouncedSearch) {
          const term = normalizeText(debouncedSearch);
          loadedFolders = loadedFolders.filter(f => normalizeText(f.name).includes(term));
        }
        setFolders(loadedFolders);
        setLoading(false);
        setFilesLoading(true);

        const items = res.items.filter(item => item.name !== '.keep');
        let filteredItems = items;
        if (debouncedSearch) {
          const term = normalizeText(debouncedSearch);
          filteredItems = items.filter(item => {
            const cleanName = cleanFileName(item.name);
            return normalizeText(cleanName).includes(term) || normalizeText(item.name).includes(term);
          });
        }

        const metaIds = filteredItems.map(item => item.fullPath.replace(/\//g, '_'));
        const metadataById = new Map<string, Record<string, unknown>>();
        await Promise.all(
          metaIds.map(async (metaId) => {
            try {
              const metaSnap = await getDoc(doc(db, 'fileMetadata', metaId));
              if (metaSnap.exists()) metadataById.set(metaId, metaSnap.data());
            } catch { /* ignore */ }
          })
        );

        const repairs: Array<{ metaId: string; payload: Record<string, unknown> }> = [];

        const filePromises = filteredItems.map(async (item) => {
          const rawName = item.name;
          const cleanName = cleanFileName(rawName);
          if (debouncedSearch) {
            const term = normalizeText(debouncedSearch);
            if (!normalizeText(cleanName).includes(term) && !normalizeText(rawName).includes(term)) return null;
          }

          const metaId = item.fullPath.replace(/\//g, '_');
          const meta = metadataById.get(metaId) || {};
          const needsRepair = !metadataById.has(metaId) || meta.name !== item.name;

          let size = Number(meta.size) || 0;
          let updated = parseDateRobust(meta.updated)?.toISOString() || "";
          let timeCreated = parseDateRobust(meta.created)?.toISOString() || "";
          let contentType = String(meta.contentType || "unknown");

          if (!size || !updated || contentType === "unknown") {
            try {
              const storageMeta = await getMetadata(item) as { size: number; updated: string; timeCreated: string; contentType: string };
              size = storageMeta.size ?? size;
              if (storageMeta.updated) updated = normalizeDriveDate(storageMeta.updated);
              if (storageMeta.timeCreated) timeCreated = normalizeDriveDate(storageMeta.timeCreated);
              contentType = storageMeta.contentType || contentType;
            } catch { /* ignore */ }
          }

          const fetchedUbicacion = String(meta.ubicacion_real || meta.ubicacion || "");

          if (needsRepair) {
            repairs.push({
              metaId,
              payload: {
                name: item.name,
                filePath: item.fullPath,
                size,
                contentType,
                updated: updated || normalizeDriveDate(new Date()),
                created: meta.created
                  ? normalizeDriveDate(meta.created)
                  : timeCreated || updated || normalizeDriveDate(new Date()),
                uploadedBy: meta.uploadedBy || "Sistema",
                keywords: generateSearchTokens(cleanName),
                completed: meta.completed || false,
                reviewed: meta.reviewed || false,
                starred: meta.starred || false,
                notas: meta.notas || "",
                ubicacion_real: fetchedUbicacion,
              },
            });
          }

          return {
            name: cleanName,
            rawName,
            fullPath: item.fullPath,
            url: '',
            size,
            updated: updated || normalizeDriveDate(new Date()),
            created: meta.created
              ? normalizeDriveDate(meta.created)
              : timeCreated || updated || normalizeDriveDate(new Date()),
            contentType,
            parentFolder: path.length > 0 ? path[path.length - 1] : "Raíz",
            notas: meta.notas as string | undefined,
            reviewed: meta.reviewed as boolean | undefined,
            reviewedByName: meta.reviewedByName as string | undefined,
            completed: meta.completed as boolean | undefined,
            completedByName: meta.completedByName as string | undefined,
            starred: meta.starred as boolean | undefined,
            uploadedBy: meta.uploadedBy as string | undefined,
            keywords: meta.keywords as string[] | undefined,
            ubicacion: meta.ubicacion as string | undefined,
            ubicacion_real: fetchedUbicacion || undefined,
            workDate: resolveFileWorkDate(meta, [meta.created, timeCreated, updated]),
          } as DriveFile;
        });

        let loaded = await enrichFilesWithWorksheetInfo(
          await enrichFilesWithWorkDates(
            (await Promise.all(filePromises)).filter(Boolean) as DriveFile[]
          )
        );

        loaded = await Promise.all(
          loaded.map(async (f) => {
            if (f.completed === true || f.reviewed === true) return f;
            const driveFlag = String(f.worksheetCargadoDrive || "").trim();
            if (!isWorksheetRealizado(driveFlag)) return f;

            const techName =
              f.worksheetTechnician?.trim() ||
              f.parentFolder?.trim() ||
              path[path.length - 1]?.trim() ||
              "";

            let wsRow: Record<string, unknown> | null = null;
            if (f.worksheetDocId) {
              const wsSnap = await getDoc(doc(db, "hojasDeTrabajo", f.worksheetDocId));
              if (wsSnap.exists()) wsRow = { ...wsSnap.data(), docId: wsSnap.id };
            }
            if (wsRow && isWorksheetRealizado(wsRow.cargado_drive)) {
              void syncSingleFilePendingReviewFromWorksheet(f.fullPath, wsRow);
            }

            return {
              ...f,
              completed: true,
              completedByName: f.completedByName || techName || undefined,
            };
          })
        );

        setFiles(loaded);
        setFilesLoading(false);

        if (repairs.length > 0) {
          setIsSyncing(true);
          Promise.all(
            repairs.map(({ metaId, payload }) =>
              setDoc(doc(db, 'fileMetadata', metaId), payload, { merge: true })
            )
          ).finally(() => setIsSyncing(false));
        }
      }
    } catch (e) {
      console.error("loadContent", e);
      showToast("Error al cargar el Drive. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
      setFilesLoading(false);
    }
  }, [path, activeFilter, currentUserData, debouncedSearch, isQuality, currentRoot, showToast]);

  useEffect(() => { if (currentUserData) loadContent(); }, [loadContent]);

  // ── Búsqueda: hoja sin PDF por ID de equipo, certificado, folio o doc Firestore ──
  useEffect(() => {
    let cancelled = false;

    const lookupPendingWorksheet = async () => {
      const term = debouncedSearch.trim();
      if (
        !term ||
        term.length < 3 ||
        !currentUserData ||
        currentRoot !== "worksheets"
      ) {
        setPendingWorksheetFile(null);
        return;
      }

      try {
        const wsDoc = await resolveWorksheetBySearchTerm(term);
        if (cancelled) return;
        if (!wsDoc) {
          setPendingWorksheetFile(null);
          return;
        }

        const data = wsDoc.data() as Record<string, unknown>;
        if (!isQuality) {
          const myName = normalizeText(currentUserData?.name || "");
          const assigned = normalizeText(String(data.nombre || data.assignedTo || ""));
          if (assigned !== myName) {
            setPendingWorksheetFile(null);
            return;
          }
        }

        setPendingWorksheetFile(buildPendingWorksheetDriveEntry(wsDoc));
      } catch (e) {
        console.error("[Drive] pending worksheet lookup:", e);
        if (!cancelled) setPendingWorksheetFile(null);
      }
    };

    lookupPendingWorksheet();
    return () => { cancelled = true; };
  }, [debouncedSearch, currentUserData, isQuality, currentRoot]);

  // ── Close menus on outside click / scroll ──
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (newFileMenuRef.current && !newFileMenuRef.current.contains(e.target as Node)) setNewFileMenuOpen(false);
    };

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest('.context-menu-container')) {
        return;
      }
      setContextMenu(null);
      setSortMenuOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  // ── Sorted/filtered files ──
  const processedFiles = useMemo(() => {
    let result = [...files];
    if (pendingWorksheetFile && debouncedSearch.trim().length >= 3) {
      const linkId = extractWorksheetLinkId(pendingWorksheetFile.rawName);
      const alreadyListed = result.some(
        (f) =>
          !f.isPendingWorksheet &&
          extractWorksheetLinkId(f.rawName || f.name) === linkId
      );
      if (!alreadyListed) result.unshift(pendingWorksheetFile);
    }
    result.sort((a, b) => {
      switch (sortBy) {
        case 'nameAsc': return a.name.localeCompare(b.name);
        case 'nameDesc': return b.name.localeCompare(a.name);
        case 'dateAsc': return new Date(getFileWorkDate(a)).getTime() - new Date(getFileWorkDate(b)).getTime();
        case 'dateDesc': return new Date(getFileWorkDate(b)).getTime() - new Date(getFileWorkDate(a)).getTime();
        case 'sizeAsc': return (a.size || 0) - (b.size || 0);
        case 'sizeDesc': return (b.size || 0) - (a.size || 0);
        default: return 0;
      }
    });
    return result;
  }, [files, pendingWorksheetFile, debouncedSearch, sortBy]);

  const isMetrologistFolderView = useMemo(
    () =>
      activeFilter === "all" &&
      !debouncedSearch &&
      path.length > 0 &&
      !path.some((p) =>
        ["hojas de trabajo", "hojas de servicio"].some((ex) =>
          p.toLowerCase().includes(ex)
        )
      ),
    [activeFilter, debouncedSearch, path]
  );

  const metrologistFileGroups = useMemo(() => {
    if (!isMetrologistFolderView) return null;
    return groupFilesByUbicacion(processedFiles);
  }, [isMetrologistFolderView, processedFiles]);

  // ── ARCHIVOS AGRUPADOS POR TÉCNICO (Para Completados Y Por Revisar) ──
  const groupedFiles = useMemo(() => {
    if (activeFilter !== 'completed' && activeFilter !== 'pending_review') return {};
    const groups: Record<string, DriveFile[]> = {};
    processedFiles.forEach(f => {
      const k = resolveTechnicianGroupKey(f);
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
  const runWorksheetPdfGeneration = useCallback(
    async (docId: string, technicianFolder: string, uploadedBy: string, allowIncomplete: boolean) => {
      setGeneratingPdfLinkId(docId);
      try {
        const result = await generateWorksheetPdfFromFirestore(docId, {
          technicianFolder,
          uploadedBy,
          allowIncomplete,
        });

        if (!result.ok) {
          if (!allowIncomplete && result.error?.includes("mediciones")) {
            const proceed = window.confirm(
              `${result.error}\n\nEl PDF se generará con encabezado e identificación, pero las tablas de medición quedarán vacías.\n\n¿Continuar?`
            );
            if (proceed) {
              setGeneratingPdfLinkId(null);
              return runWorksheetPdfGeneration(docId, technicianFolder, uploadedBy, true);
            }
          } else {
            const detail = result.missing?.length
              ? ` Faltan: ${result.missing.join(", ")}.`
              : "";
            showToast(`${result.error || "No se pudo generar el PDF."}${detail}`, "error");
          }
          return false;
        }

        const warnNote =
          result.warnings && result.warnings.length > 0
            ? " (PDF parcial — revise campos vacíos)"
            : "";
        showToast(`PDF generado y subido a Drive${warnNote}`, "success");
        setSelectedIds(new Set());
        setDetailsOpen(false);
        setPendingWorksheetFile(null);
        setSearchQuery("");
        await loadContent();
        return true;
      } catch (err) {
        console.error("[Drive] generate PDF:", err);
        showToast("Error inesperado al generar el PDF.", "error");
        return false;
      } finally {
        setGeneratingPdfLinkId(null);
      }
    },
    [showToast, loadContent]
  );

  const handleGenerateWorksheetPdf = useCallback(
    async (file: DriveFile, allowIncomplete = false) => {
      const docId = file.worksheetDocId;
      if (!docId) {
        showToast("No se encontró el registro de la hoja de trabajo.", "error");
        return;
      }

      const technicianFolder =
        file.parentFolder?.trim() ||
        path[path.length - 1]?.trim() ||
        getTechnicianFolderName({ name: currentUserData?.name, email: currentUserData?.email });
      const uploadedBy =
        currentUserData?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario";

      await runWorksheetPdfGeneration(docId, technicianFolder, uploadedBy, allowIncomplete);
    },
    [path, currentUserData, user, showToast, runWorksheetPdfGeneration]
  );

  const handleRegeneratePdf = useCallback(
    async (file: DriveFile, allowIncomplete = false) => {
      if (file.isPendingWorksheet) {
        await handleGenerateWorksheetPdf(file, allowIncomplete);
        return;
      }

      const possibleId = extractWorksheetLinkId(file.rawName || file.name);
      if (!isLinkableWorksheetId(possibleId)) {
        showToast("No se encontró hoja de trabajo vinculada a este PDF.", "error");
        return;
      }

      const wsDoc = await resolveWorksheetDoc(possibleId);
      if (!wsDoc) {
        showToast(`No hay registro Friday para ${possibleId}.`, "error");
        return;
      }

      const docId = wsDoc.id;
      const technicianFolder =
        path[path.length - 1]?.trim() ||
        getTechnicianFolderName({ name: currentUserData?.name, email: currentUserData?.email });
      const uploadedBy =
        currentUserData?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario";

      await runWorksheetPdfGeneration(docId, technicianFolder, uploadedBy, allowIncomplete);
    },
    [path, currentUserData, user, showToast, handleGenerateWorksheetPdf, runWorksheetPdfGeneration]
  );

  const resolvePreviewUrl = useCallback(async (file: DriveFile) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return file.url || await getDownloadURL(ref(storage, file.fullPath));
      } catch (err) {
        lastError = err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastError;
  }, []);

  const handlePreview = (file: DriveFile) => {
    if (file.isPendingWorksheet) {
      showToast("Esta hoja aún no tiene PDF. Selecciónela y use «Generar PDF».", "info");
      setSelectedIds(new Set([file.fullPath]));
      setDetailsOpen(true);
      return;
    }
    setPreviewFile({ ...file, url: file.url || "" });
  };

  // ── Batch delete ──
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} archivo(s)? Esta acción no se puede deshacer.`)) return;
    let count = 0;
    for (const id of Array.from(selectedIds)) {
      const f = processedFiles.find(fi => fi.fullPath === id);
      if (!f || f.isPendingWorksheet) continue;
      try {
        await deleteObject(ref(storage, f.fullPath));
        await deleteDoc(doc(db, 'fileMetadata', f.fullPath.replace(/\//g, '_')));
        count++;
      } catch (e) { console.error(e); }
    }
    showToast(`${count} archivo(s) eliminados`, 'success');
    setSelectedIds(new Set());
    loadContent();
  };

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
        const f = processedFiles.find(fi => fi.fullPath === Array.from(selectedIds)[0]);
        if (f) handlePreview(f);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selectedIds, processedFiles, previewFile, isQuality, debouncedSearch, handleBatchDelete, handlePreview]);

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
      const url = await getDownloadURL(item);
      const blob = await (await fetch(url)).blob();
      const newPath = `${dest}/${item.name}`;
      const newRef = ref(storage, newPath);
      await uploadBytes(newRef, blob);
      
      const newPdfUrl = await getDownloadURL(newRef);

      if (item.name !== '.keep') {
        const oldId = item.fullPath.replace(/\//g, '_');
        const newId = newPath.replace(/\//g, '_');
        const old = await getDoc(doc(db, 'fileMetadata', oldId));
        const data = old.exists() ? old.data() : {};
        if (old.exists()) await deleteDoc(doc(db, 'fileMetadata', oldId));
        await setDoc(doc(db, 'fileMetadata', newId), { ...data, filePath: newPath, updated: new Date().toISOString() }, { merge: true });
        
        try {
          const possibleId = extractWorksheetLinkId(item.name);
          const wsDoc = await resolveWorksheetDoc(possibleId);
          if (wsDoc) {
            await updateDoc(wsDoc.ref, { pdfURL: newPdfUrl });
          }
        } catch (syncErr) {
          console.error("Error sincronizando link al mover carpeta:", syncErr);
        }
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

  // ── Move file ──
  const executeMoveFile = async (file: DriveFile, destFolder: string, explicitNewName?: string) => {
    const targetName = explicitNewName || file.name;
    const newPath = `${destFolder}/${targetName}`;
    if (newPath === file.fullPath) return false;
    setIsMoving(true);
    try {
      const url = file.url || await getDownloadURL(ref(storage, file.fullPath));
      const blob = await (await fetch(url)).blob();
      const newRef = ref(storage, newPath);
      await uploadBytes(newRef, blob);
      
      const newPdfUrl = await getDownloadURL(newRef);

      const oldId = file.fullPath.replace(/\//g, '_');
      const newId = newPath.replace(/\//g, '_');
      const old = await getDoc(doc(db, 'fileMetadata', oldId));
      const data = old.exists() ? old.data() : {};
      if (old.exists()) await deleteDoc(doc(db, 'fileMetadata', oldId));
      await setDoc(doc(db, 'fileMetadata', newId), { ...data, filePath: newPath, name: targetName, updated: new Date().toISOString() }, { merge: true });
      
      try {
        const possibleId = extractWorksheetLinkId(targetName);
        const wsDoc = await resolveWorksheetDoc(possibleId);
        if (wsDoc) {
          await updateDoc(wsDoc.ref, { pdfURL: newPdfUrl });
        }
      } catch (syncErr) {
        console.error("Error sincronizando link al mover archivo:", syncErr);
      }

      await deleteObject(ref(storage, file.fullPath));
      return true;
    } catch (e) { showToast("Error al mover el archivo", 'error'); return false; }
    finally { setIsMoving(false); }
  };

  const handleModalMove = async () => {
    const dest = [currentRoot, ...moveToPath].join('/');
    if (moveTargetFolder) {
      const ok = await executeMoveFolder(moveTargetFolder, dest);
      if (ok) { showToast("Carpeta movida", 'success'); setMoveDialogOpen(false); setMoveTargetFolder(null); setMoveToPath([]); loadContent(); }
    } else if (moveTargetFiles.length > 0) {
      let movedCount = 0;
      for (const file of moveTargetFiles) {
        const ok = await executeMoveFile(file, dest);
        if (ok) movedCount++;
      }
      if (movedCount > 0) {
        showToast(`${movedCount} archivo(s) movido(s)`, 'success');
        setMoveDialogOpen(false);
        setMoveTargetFiles([]);
        setMoveToPath([]);
        setSelectedIds(new Set()); 
        loadContent();
      }
    }
  };

  const loadMoveFolderContent = useCallback(async () => {
    try {
      const res = await listAll(ref(storage, [currentRoot, ...moveToPath].join('/')));
      setMoveFolderContent(res.prefixes.map(p => ({ name: p.name, fullPath: p.fullPath })));
    } catch (e) { console.error(e); }
  }, [currentRoot, moveToPath]);

  useEffect(() => {
    if (!moveDialogOpen) return;
    loadMoveFolderContent();
  }, [moveDialogOpen, loadMoveFolderContent]);

  const handleCreateFolderInMove = async () => {
    const name = moveNewFolderName.trim();
    if (!name) return;
    if (moveFolderContent.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      showToast("Ya existe una carpeta con ese nombre", 'error');
      return;
    }
    setIsCreatingMoveFolder(true);
    try {
      await uploadBytes(
        ref(storage, `${[currentRoot, ...moveToPath, name].join('/')}/.keep`),
        new Uint8Array([0])
      );
      setMoveCreateFolderOpen(false);
      setMoveNewFolderName("");
      showToast("Carpeta creada", 'success');
      await loadMoveFolderContent();
    } catch (e) {
      showToast("Error al crear la carpeta", 'error');
    } finally {
      setIsCreatingMoveFolder(false);
    }
  };

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
    try {
      const url = file.url || (await getDownloadURL(ref(storage, file.fullPath)));
      try {
        const blob = await (await fetch(url, { mode: "cors", cache: "no-store" })).blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = file.name;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      showToast("No se pudo descargar", "error");
    }
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
      const metaId = file.fullPath.replace(/\//g, '_');
      const metaRef = doc(db, 'fileMetadata', metaId);
      const existingSnap = await getDoc(metaRef);
      const wasCompleted = existingSnap.data()?.completed === true;

      const data: any = { [field]: value };
      if (field === 'reviewed') data.reviewedByName = value ? name : null;
      if (field === 'completed') data.completedByName = value ? name : null;
      await setDoc(metaRef, data, { merge: true });
      if (field === 'reviewed' && value) showToast("Validación guardada", 'success');
      if (field === 'completed' && value) {
        showToast("Marcado como completado", 'success');
        if (!wasCompleted) {
          try {
            const linkId = extractWorksheetLinkId(file.rawName || file.name);
            const wsDoc = await resolveWorksheetDoc(linkId);
            const wsData = (wsDoc?.data() || {}) as Record<string, unknown>;
            await notificarCalidadRevisionPendiente({
              worksheetDocId: wsDoc?.id || metaId,
              equipmentId: String(wsData.id || file.worksheetId || linkId).trim(),
              cliente: String(wsData.cliente || file.worksheetCliente || "").trim(),
              fecha: String(
                wsData.fecha || wsData.fecha_calib || wsData.fechaEntrada || file.worksheetFecha || file.workDate || ""
              ).trim(),
              tecnicoNombre: name,
              metaId,
            });
          } catch (notifyErr) {
            console.error("[Drive] notify calidad:", notifyErr);
          }
        }
      }
      if (field === 'completed' || field === 'reviewed') {
        const possibleId = extractWorksheetLinkId(file.name);
        const wsDoc = await resolveWorksheetDoc(possibleId);
        if (wsDoc) {
          const updateData: any = { lastUpdated: new Date().toISOString() };
          if (field === 'completed') {
            if (value) {
              updateData.status_certificado = "Generado";
              updateData.cargado_drive = "Si";
            } else {
              updateData.status_certificado = "Pendiente de Certificado";
              updateData.cargado_drive = "No";
            }
          }
          if (field === 'reviewed' && value) updateData.status_certificado = "Firmado";
          await updateDoc(wsDoc.ref, updateData);
          showToast(`Sincronizado con ${possibleId}`, 'success');
        } else if (value && isLinkableWorksheetId(possibleId)) {
          showToast(`No se encontró hoja para ${possibleId}`, 'warning');
        }
      }
    } catch (e) { showToast("Error de conexión", 'error'); loadContent(); }
  };

  const commitWriteBatches = async (paths: string[], write: (batch: ReturnType<typeof writeBatch>, fullPath: string) => void) => {
    const chunkSize = 450; // conservador vs 500
    for (let i = 0; i < paths.length; i += chunkSize) {
      const batch = writeBatch(db);
      const slice = paths.slice(i, i + chunkSize);
      slice.forEach((p) => write(batch, p));
      await batch.commit();
    }
  };

  const updateWorksheetStatusesForFiles = async (targetFiles: DriveFile[], field: 'completed' | 'reviewed', value: boolean) => {
    // Mantiene el comportamiento existente (sin bloquear si falla).
    await Promise.all(
      targetFiles.map(async (file) => {
        try {
          const possibleId = extractWorksheetLinkId(file.name);
          const wsDoc = await resolveWorksheetDoc(possibleId);
          if (!wsDoc) return;
          type WorksheetStatusUpdate = {
            lastUpdated: string;
            status_certificado?: string;
            cargado_drive?: string;
          };
          const updateData: WorksheetStatusUpdate = {
            lastUpdated: new Date().toISOString(),
          };
          if (field === 'completed') {
            if (value) {
              updateData.status_certificado = "Generado";
              updateData.cargado_drive = "Si";
            } else {
              updateData.status_certificado = "Pendiente de Certificado";
              updateData.cargado_drive = "No";
            }
          }
          if (field === 'reviewed' && value) updateData.status_certificado = "Firmado";
          await updateDoc(wsDoc.ref, updateData);
        } catch {
          /* best-effort */
        }
      })
    );
  };

  const handleBatchUpdateStatus = async (field: 'completed' | 'reviewed', value: boolean, opts?: { toastSuccess?: string }) => {
    if (selectedIds.size === 0) return;
    if (field === 'reviewed' && !isQuality) { showToast("Solo calidad puede marcar revisado", "error"); return; }

    const name = currentUserData?.name || user?.displayName || "Usuario";
    const selectedPaths = Array.from(selectedIds);
    const selectedFiles = processedFiles.filter((f) => selectedIds.has(f.fullPath) && !f.isPendingWorksheet);
    const pathSet = new Set(selectedFiles.map((f) => f.fullPath));
    const targets = selectedPaths.filter((p) => pathSet.has(p));
    if (targets.length === 0) { showToast("No hay archivos válidos seleccionados", "warning"); return; }

    // UI optimistic
    setFiles((prev) =>
      prev.map((f) => {
        if (!pathSet.has(f.fullPath)) return f;
        if (field === "reviewed") {
          return {
            ...f,
            reviewed: value,
            reviewedByName: value ? name : null,
          };
        }
        return {
          ...f,
          completed: value,
          completedByName: value ? name : null,
        };
      })
    );
    if (previewFile && pathSet.has(previewFile.fullPath)) {
      if (field === "reviewed") {
        setPreviewFile({
          ...previewFile,
          reviewed: value,
          reviewedByName: value ? name : null,
        });
      } else {
        setPreviewFile({
          ...previewFile,
          completed: value,
          completedByName: value ? name : null,
        });
      }
    }

    try {
      await commitWriteBatches(targets, (batch, fullPath) => {
        const metaId = fullPath.replace(/\//g, "_");
        const metaRef = doc(db, "fileMetadata", metaId);
        const data: Record<string, unknown> = { [field]: value };
        if (field === "reviewed") data.reviewedByName = value ? name : null;
        if (field === "completed") data.completedByName = value ? name : null;
        batch.set(metaRef, data, { merge: true });
      });

      // Notificar a calidad (solo cuando se marca completado=true y antes estaba pendiente en UI)
      if (field === "completed" && value) {
        const newlyCompleted = selectedFiles.filter((f) => f.completed !== true);
        if (newlyCompleted.length > 0) {
          // Igual que single: evitamos spam, notificamos 1 vez por acción.
          const file = newlyCompleted[0];
          try {
            const metaId = file.fullPath.replace(/\//g, "_");
            const linkId = extractWorksheetLinkId(file.rawName || file.name);
            const wsDoc = await resolveWorksheetDoc(linkId);
            const wsData = (wsDoc?.data() || {}) as Record<string, unknown>;
            await notificarCalidadRevisionPendiente({
              worksheetDocId: wsDoc?.id || metaId,
              equipmentId: String(wsData.id || file.worksheetId || linkId).trim(),
              cliente: String(wsData.cliente || file.worksheetCliente || "").trim(),
              fecha: String(
                wsData.fecha || wsData.fecha_calib || wsData.fechaEntrada || file.worksheetFecha || file.workDate || ""
              ).trim(),
              tecnicoNombre: name,
              metaId,
            });
          } catch (notifyErr) {
            console.error("[Drive] notify calidad (batch):", notifyErr);
          }
        }
      }

      await updateWorksheetStatusesForFiles(selectedFiles, field, value);
      showToast(opts?.toastSuccess || `${targets.length} archivo(s) actualizado(s)`, "success");
      setSelectedIds(new Set());
      setDetailsOpen(false);
      setContextMenu(null);
    } catch {
      showToast("Error de conexión", "error");
      loadContent();
    }
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
        const fullPath = `${[currentRoot, ...path].join('/')}/${file.name}`;
        const docId = fullPath.replace(/\//g, '_');
        const existing = await getDoc(doc(db, 'fileMetadata', docId));
        const existingData = existing.exists() ? existing.data() : {};
        
        const snap = await uploadBytes(ref(storage, fullPath), file);
        const meta = await getMetadata(snap.ref);
        const downloadUrl = await getDownloadURL(snap.ref);

        let fetchedUbicacion = "";
        let workDate = existingData.workDate as string | undefined;
        try {
          const possibleId = extractWorksheetLinkId(file.name);
          const wsDoc = await resolveWorksheetDoc(possibleId);
          
          if (wsDoc) {
            const wsData = wsDoc.data();
            fetchedUbicacion = wsData.ubicacion_real || wsData.ubicacion || "";
            workDate = workDate || extractWorkDateFromWorksheet(wsData);
            if (currentRoot === "certificados") {
              await updateDoc(wsDoc.ref, {
                pdfURL: downloadUrl,
                status_certificado: "Firmado",
                cargado_drive: "Si"
              });
              showToast(`PDF enlazado al folio ${possibleId}`, 'success');
            }
          }
        } catch(e) {
          console.error("Error al enlazar PDF:", e);
        }

        await setDoc(doc(db, 'fileMetadata', docId), {
          name: file.name, filePath: fullPath, size: meta.size, contentType: meta.contentType,
          updated: normalizeDriveDate(meta.updated || meta.timeCreated),
          created: existingData.created
            ? normalizeDriveDate(existingData.created)
            : normalizeDriveDate(meta.timeCreated || meta.updated),
          uploadedBy: currentUserData?.name || "Desconocido",
          keywords: generateSearchTokens(cleanFileName(file.name)),
          completed: existingData.completed || false, completedByName: existingData.completedByName || null,
          reviewed: false, reviewedByName: null, notas: existingData.notas || "",
          ubicacion_real: fetchedUbicacion || existingData.ubicacion_real || existingData.ubicacion || "",
          workDate: workDate || undefined,
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

  // --- INP FIX: Referencias estables ---
  const handleSelectRef = useRef(handleSelect);
  const handleToggleStarRef = useRef(handleToggleStar);
  const handlePreviewRef = useRef(handlePreview);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    handleSelectRef.current = handleSelect;
    handleToggleStarRef.current = handleToggleStar;
    handlePreviewRef.current = handlePreview;
    selectedIdsRef.current = selectedIds;
  });

  const onCardSelect = useCallback((file: DriveFile, multi: boolean, range: boolean) => {
    handleSelectRef.current(file, multi, range);
  }, []);

  const onCardContextMenu = useCallback((e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file, folder: null });
    if (!selectedIdsRef.current.has(file.fullPath)) {
      handleSelectRef.current(file, false, false);
    }
  }, []);

  const onCardDoubleClick = useCallback((file: DriveFile) => handlePreviewRef.current(file), []);
  const onCardStar = useCallback((file: DriveFile) => handleToggleStarRef.current(file), []);
  const onCardDownload = useCallback((file: DriveFile) => handleDownload(file), []);

  // ─── RENDER CONTENT ───────────────────────
  const renderContent = () => {
    if ((activeFilter === 'completed' || activeFilter === 'pending_review') && !groupView) {
      const groups = Object.keys(groupedFiles);
      if (groups.length === 0) return <EmptyState icon={activeFilter === 'completed' ? FileCheck : Bell} title={activeFilter === 'completed' ? "No hay servicios completados" : "No hay archivos por revisar"} />;
      return (
        <div className="animate-in fade-in duration-300">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {groups.map(name => (
              <div
                key={name}
                onClick={() => setGroupView(name)}
                className={clsx(
                  "group p-4 bg-white border rounded-2xl cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col items-center gap-3",
                  activeFilter === 'completed' ? "border-emerald-100 hover:border-emerald-300" : "border-blue-100 hover:border-blue-300"
                )}
              >
                <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center transition-colors", activeFilter === 'completed' ? "bg-emerald-50 group-hover:bg-emerald-100" : "bg-blue-50 group-hover:bg-blue-100")}>
                  {activeFilter === 'completed' ? <FileCheck size={22} className="text-emerald-600" /> : <Bell size={22} className="text-blue-600" />}
                </div>
                <p className="text-sm font-semibold text-slate-700 text-center truncate w-full">{name}</p>
                <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-medium", activeFilter === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
                  {groupedFiles[name].length} archivos
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    let displayFiles = processedFiles;
    if ((activeFilter === 'completed' || activeFilter === 'pending_review') && groupView) displayFiles = groupedFiles[groupView] || [];
    const showFolders = activeFilter === 'all' && !debouncedSearch && folders.length > 0;

    if (displayFiles.length === 0 && !showFolders && !filesLoading) {
      if (debouncedSearch) return <EmptyState icon={Search} title={`Sin resultados para "${debouncedSearch}"`} subtitle="Intenta con otras palabras clave" />;
      return <EmptyState icon={Folder} title="Esta carpeta está vacía" subtitle="Sube archivos o crea una carpeta para comenzar" />;
    }

    const labFiles = metrologistFileGroups?.lab ?? [];
    const siteFiles = metrologistFileGroups?.site ?? [];
    const otherFiles = isMetrologistFolderView ? [] : displayFiles;

    const showReviewMeta = activeFilter === 'pending_review';

    const renderFilesBlock = (title: string | null, filesToRender: DriveFile[]) => {
      if (filesToRender.length === 0) return null;
      return (
        <div className="mb-6">
          {title && (
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
              {title}
              <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md text-[10px]">{filesToRender.length}</span>
            </h3>
          )}
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filesToRender.map(file => (
                <FileCard
                  key={file.fullPath} file={file}
                  selected={selectedIds.has(file.fullPath)}
                  searchActive={!!debouncedSearch || activeFilter !== 'all'}
                  onSelect={onCardSelect}
                  onContextMenu={onCardContextMenu}
                  onDoubleClick={onCardDoubleClick}
                  onStar={onCardStar}
                  showReviewMeta={showReviewMeta}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50/90 border-b border-slate-200/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-12 md:col-span-5 flex items-center gap-2">
                  <div className="w-5" />
                  Nombre
                </div>
                <div className="hidden md:block col-span-3">Plazo</div>
                <div className="hidden md:block col-span-2">Estado</div>
                <div className="hidden md:block col-span-1 text-right">Fecha</div>
                <div className="hidden md:block col-span-1 text-right">Tamaño</div>
              </div>
              {filesToRender.map(file => (
                <FileListRow
                  key={file.fullPath} file={file}
                  selected={selectedIds.has(file.fullPath)}
                  searchActive={!!debouncedSearch || activeFilter !== 'all'}
                  onSelect={onCardSelect}
                  onContextMenu={onCardContextMenu}
                  onDoubleClick={onCardDoubleClick}
                  onDownload={onCardDownload}
                  onStar={onCardStar}
                  showReviewMeta={showReviewMeta}
                />
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="animate-in slide-in-from-bottom-1 duration-200 pb-24">
        {path.length === 0 && activeFilter === 'all' && !debouncedSearch && suggestedFiles.length > 0 && (
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
                    <p className="text-[10px] text-slate-400">{formatDate(getFileWorkDate(f))}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {showFolders && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-2">
              <Folder size={13} className="text-amber-500" /> Carpetas
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{folders.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {folders.map(f => (
                <FolderCard
                  key={f.fullPath} folder={f}
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

        {(displayFiles.length > 0 || filesLoading) && (
          <section>
            <div className="flex items-center justify-between mb-3 sticky top-0 bg-[#f0f2f5]/90 backdrop-blur-sm py-2 z-10">
              <h2 className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                <File size={13} className="text-slate-400" />
                {debouncedSearch ? 'Resultados' : 'Archivos'}
                <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md">
                  {displayFiles.length}
                </span>
                {filesLoading && <Loader2 size={12} className="animate-spin text-blue-500" />}
              </h2>
              {selectedIds.size > 0 && (
                <div className="fixed md:relative bottom-4 md:bottom-auto left-3 right-3 md:left-auto md:right-auto z-20 flex items-center gap-2 animate-in slide-in-from-bottom md:slide-in-from-right fade-in duration-150 bg-white md:bg-transparent border md:border-0 border-slate-200 rounded-2xl md:rounded-none shadow-lg md:shadow-none px-3 py-2 md:p-0">
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                    {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() =>
                      handleBatchUpdateStatus("completed", true, {
                        toastSuccess: `${selectedIds.size} archivos marcados como realizados`,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-all shadow-sm"
                  >
                    <FileCheck size={13} />
                    Realizado
                  </button>
                  {isQuality && (
                    <button
                      onClick={() =>
                        handleBatchUpdateStatus("reviewed", true, {
                          toastSuccess: `${selectedIds.size} archivos marcados como revisados`,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg hover:bg-emerald-100 transition-all shadow-sm"
                    >
                      <CheckCircle2 size={13} />
                      Revisado
                    </button>
                  )}
                  <button
                    onClick={handleBatchDownload} disabled={isZipping}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm"
                  >
                    {isZipping ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    Descargar
                  </button>
                  {isQuality && (
                    <>
                      <button
                        onClick={() => { setMoveTargetFiles(files.filter(f => selectedIds.has(f.fullPath))); setMoveTargetFolder(null); setMoveToPath([]); setMoveDialogOpen(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-all shadow-sm"
                      >
                        <FolderSymlink size={13} /> Mover
                      </button>
                      <button onClick={handleBatchDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-all">
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </>
                  )}
                  <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            {isMetrologistFolderView ? (
              <>
                {filesLoading && displayFiles.length === 0 ? <LoadingSkeleton compact /> : null}
                {renderFilesBlock('Laboratorio', labFiles)}
                {renderFilesBlock('Servicio en Sitio', siteFiles)}
              </>
            ) : ( renderFilesBlock(null, otherFiles) )}
          </section>
        )}
      </div>
    );
  };

  const sortOptions = [
    { key: 'dateDesc', label: 'Más recientes', icon: <SortDesc size={13} /> },
    { key: 'dateAsc', label: 'Más antiguos', icon: <SortAsc size={13} /> },
    { key: 'nameAsc', label: 'Nombre A→Z', icon: <SortAsc size={13} /> },
    { key: 'nameDesc', label: 'Nombre Z→A', icon: <SortDesc size={13} /> },
    { key: 'sizeDesc', label: 'Más grandes', icon: <SortDesc size={13} /> },
    { key: 'sizeAsc', label: 'Más pequeños', icon: <SortAsc size={13} /> },
  ];

  const filterLabels: Record<FilterType, string> = {
    all: 'Mi Unidad', starred: 'Destacados', recent: 'Recientes',
    pending_review: 'Por revisar', completed: 'Historial completados'
  };

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 bg-[#f8f9fa] font-sans text-slate-800 overflow-hidden" onClick={() => { setContextMenu(null); setSortMenuOpen(false); }}>
      {dragActive && !draggingItem && (
        <div className="absolute inset-0 z-[100] bg-blue-500/10 backdrop-blur-sm border-[3px] border-dashed border-blue-400 m-3 rounded-3xl flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center">
            <UploadCloud size={52} className="text-blue-500 mb-3" />
            <p className="text-lg font-bold text-blue-700">Suelta aquí los archivos</p>
            <p className="text-sm text-slate-400 mt-1">Se subirán a la carpeta actual</p>
          </div>
        </div>
      )}
      <div className="absolute inset-0 z-0" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} />
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 flex h-full w-60 flex-col bg-white border-r border-slate-200/80 transition-transform duration-300 shadow-xl md:shadow-none",
        "md:relative md:translate-x-0 md:h-full", sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-100">
          <img src={labLogo} alt={BRAND_NAME} className="w-8 h-8 object-contain" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-800 tracking-tight leading-tight">{BRAND_NAME}</h1>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{BRAND_SUBTITLE}</p>
          </div>
        </div>
        <div className="px-4 py-4 border-b border-slate-100">
          <div ref={newFileMenuRef} className="relative">
            <button
              onClick={() => setNewFileMenuOpen(v => !v)}
              className="w-40 flex items-center justify-start pl-5 gap-3 py-4 mb-2 bg-white text-slate-700 rounded-full text-[15px] font-medium hover:bg-slate-50 hover:shadow-md transition-all shadow-sm border border-slate-200 active:scale-95"
            >
              <div className="w-8 h-8 flex items-center justify-center -ml-2 rounded-full">
                <Plus size={24} className="text-[#0050d8]" strokeWidth={2.5} /> 
              </div>
              Nuevo
            </button>
            {newFileMenuOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 w-56">
                <button onClick={() => { fileInputRef.current?.click(); setNewFileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  <UploadCloud size={15} className="text-[#0050d8]" /> Subir archivos
                </button>
                {isQuality && (
                  <button onClick={() => { setCreateFolderOpen(true); setNewFileMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100">
                    <FolderPlus size={15} className="text-amber-500" /> Nueva carpeta
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="pt-2 pb-2 px-3"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Almacenamiento</p></div>
          <SidebarItem icon={<HardDrive size={16} />} label="Hojas de Trabajo" active={activeFilter === 'all' && currentRoot === 'worksheets'} onClick={() => { setCurrentRoot('worksheets'); setActiveFilter('all'); setPath([]); setGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
          <SidebarItem icon={<FileText size={16} />} label="Certificados PDF" className={currentRoot === 'certificados' ? "text-emerald-500" : "text-emerald-600/60"} active={activeFilter === 'all' && currentRoot === 'certificados'} onClick={() => { setCurrentRoot('certificados'); setActiveFilter('all'); setPath([]); setGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
          <div className="my-3 border-t border-slate-100" />
          <SidebarItem icon={<Star size={16} />} label="Destacados" active={activeFilter === 'starred'} onClick={() => { setActiveFilter('starred'); setPath([]); setGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
          <SidebarItem icon={<Clock size={16} />} label="Recientes" active={activeFilter === 'recent'} onClick={() => { setActiveFilter('recent'); setPath([]); setGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
          {isQuality && (
            <>
              <div className="pt-5 pb-2 px-3"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión</p></div>
              <SidebarItem icon={<Bell size={16} />} label="Por Revisar" active={activeFilter === 'pending_review'} badge onClick={() => { setActiveFilter('pending_review'); setPath([]); setGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
              <SidebarItem icon={<FileCheck size={16} />} label="Completados" active={activeFilter === 'completed'} onClick={() => { setActiveFilter('completed'); setPath([]); setGroupView(null); setSearchQuery(""); setSidebarOpen(false); }} />
            </>
          )}
        </nav>
        <div className="mt-auto flex-shrink-0 border-t border-slate-100 px-4 py-4">
          {currentUserData && (
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-8 h-8 rounded-full bg-[#0050d8]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-[#0050d8]">{(currentUserData.name || 'U').charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{currentUserData.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{currentUserData.puesto || 'Usuario'}</p>
              </div>
            </div>
          )}
          <button onClick={handleBack} className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all text-sm font-medium"><LogOut size={15} /> Salir al Menú</button>
        </div>
      </aside>
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="h-14 border-b border-slate-200/80 flex items-center gap-3 px-4 md:px-6 bg-white sticky top-0 z-30 flex-shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"><Menu size={18} /></button>
          <div className="relative flex-1 max-w-lg group">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0050d8] transition-colors" />
            <input type="text" placeholder="Buscar por nombre, ID equipo, certificado o folio..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-[#0050d8]/30 border border-slate-200/60 focus:border-[#0050d8] rounded-full py-2.5 pl-9 pr-8 text-sm outline-none transition-all text-slate-800 placeholder-slate-400 shadow-sm" />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200 transition-colors"><X size={13} /></button>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isSyncing && <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#0050d8] animate-pulse"><RefreshCw size={11} className="animate-spin" /> Sincronizando...</div>}
            <button onClick={() => fileInputRef.current?.click()} className="hidden md:flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-95">{isUploading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}Subir</button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleUploadInput} />
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5">
              <button onClick={() => setView('list')} className={clsx("p-1.5 rounded-lg transition-all", view === 'list' ? "bg-white text-[#0050d8] shadow-sm" : "text-slate-400 hover:text-slate-700")}><Rows3 size={15} /></button>
              <button onClick={() => setView('grid')} className={clsx("p-1.5 rounded-lg transition-all", view === 'grid' ? "bg-white text-[#0050d8] shadow-sm" : "text-slate-400 hover:text-slate-700")}><Grid3X3 size={15} /></button>
            </div>
            <button onClick={() => setDetailsOpen(v => !v)} className={clsx("p-2 rounded-xl border transition-all", detailsOpen ? "bg-[#0050d8]/10 text-[#0050d8] border-[#0050d8]/25" : "bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300")} title="Información"><Info size={15} /></button>
          </div>
        </header>
        <div className="relative z-40 h-10 border-b border-slate-200/60 flex items-center justify-between px-4 md:px-6 bg-white/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-1 text-xs overflow-hidden min-w-0">
            {activeFilter !== 'all' ? (
              <span className="flex items-center gap-1.5 font-semibold text-[#0050d8]"><Filter size={11} />{filterLabels[activeFilter]}
                {groupView && ( <div className="flex items-center ml-1"><ChevronRight size={11} className="text-slate-400 mr-1" /><span className="text-slate-700 bg-white border border-[#0050d8]/20 px-2 py-0.5 rounded-md flex items-center gap-1">{groupView}<button onClick={() => setGroupView(null)} className="hover:bg-slate-100 rounded-full p-0.5 ml-1 transition-colors text-slate-400 hover:text-slate-700"><X size={10} /></button></span></div> )}
              </span>
            ) : debouncedSearch ? ( <span className="font-semibold text-slate-700 flex items-center gap-1.5"><Search size={11} className="text-[#0050d8]" />Resultados para "{debouncedSearch}"</span> ) : (
              <nav className="flex items-center gap-1 text-slate-500"><button onClick={() => setPath([])} className={clsx("hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors flex items-center gap-1", path.length === 0 ? "text-slate-800 font-semibold" : "")}><Home size={11} /> {currentRoot === 'worksheets' ? "Mi Unidad" : "Certificados"}</button>
                {path.map((folder, i) => ( <React.Fragment key={folder}><ChevronRight size={11} className="text-slate-300" /><button onClick={() => setPath(path.slice(0, i + 1))} className={clsx("hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors truncate max-w-[120px]", i === path.length - 1 ? "text-slate-800 font-semibold" : "")}>{folder}</button></React.Fragment> ))}
              </nav>
            )}
          </div>
          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSortMenuOpen(v => !v)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"><ArrowUpWideNarrow size={13} /><span className="hidden sm:inline">Ordenar</span><ChevronDown size={11} className={clsx("transition-transform", sortMenuOpen ? "rotate-180" : "")} /></button>
            {sortMenuOpen && ( <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1">{sortOptions.map(opt => ( <button key={opt.key} onClick={() => { setSortBy(opt.key as SortType); setSortMenuOpen(false); }} className={clsx("w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors", sortBy === opt.key ? "bg-[#0050d8]/10 text-[#0050d8] font-semibold" : "text-slate-600 hover:bg-slate-50")}>{opt.icon} {opt.label}{sortBy === opt.key && <CheckCircle2 size={11} className="ml-auto text-[#0050d8]" />}</button> ))}</div> )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto flex min-h-0">
          <div className={clsx("flex-1 p-4 md:p-6 min-w-0 transition-all duration-200")}>
            {loading ? <LoadingSkeleton /> : renderContent()}
          </div>
          {detailsOpen && selectedIds.size === 1 && (() => {
            const file = processedFiles.find(f => f.fullPath === Array.from(selectedIds)[0]);
            const linkId = file ? extractWorksheetLinkId(file.rawName || file.name) : "";
            const showPdfAction = !!file && currentRoot === "worksheets" && (isWorksheetPdfFile(file) || file.isPendingWorksheet);
            const pdfBusyKey = file?.isPendingWorksheet ? file.worksheetDocId : linkId;
            return file ? (
              <DetailsPanel
                file={file}
                onClose={() => setDetailsOpen(false)}
                isQualityUser={isQuality}
                onToggleStatus={updateFileStatus}
                onUpdateNotes={updateNotes}
                onDownload={handlePreview}
                onDelete={handleDelete}
                onRegeneratePdf={showPdfAction ? handleRegeneratePdf : undefined}
                showRegeneratePdf={showPdfAction}
                isPendingWorksheet={!!file.isPendingWorksheet}
                isGeneratingPdf={generatingPdfLinkId === pdfBusyKey}
              />
            ) : null;
          })()}
        </div>
      </div>
      {previewFile && (
        <DrivePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={() => handleDownload(previewFile)}
          onResolveUrl={resolvePreviewUrl}
        />
      )}
      {contextMenu && (() => {
        const isFolder = !!contextMenu.folder;
        const estimatedHeight = isFolder ? 200 : 380;
        let topPos = contextMenu.y;
        if (topPos + estimatedHeight > window.innerHeight) topPos = Math.max(10, window.innerHeight - estimatedHeight - 20);
        let leftPos = contextMenu.x;
        if (leftPos + 224 > window.innerWidth) leftPos = window.innerWidth - 240;
        return (
          <div className="context-menu-container fixed bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl py-2 w-56 z-[150] text-sm animate-in fade-in zoom-in-95 duration-100 max-h-[75vh] overflow-y-auto" style={{ top: topPos, left: leftPos }} onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 border-b border-slate-100 mb-1"><p className="text-xs font-semibold text-slate-700 truncate">{contextMenu.file?.name ?? contextMenu.folder?.name}</p>{contextMenu.file && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatFileSize(contextMenu.file.size)}</p>}</div>
            {contextMenu.file && ( <>
              {!contextMenu.file.isPendingWorksheet && (
                <MenuOption icon={<Eye size={14} />} label="Vista previa" onClick={() => { if (contextMenu.file) handlePreview(contextMenu.file); setContextMenu(null); }} />
              )}
              {currentRoot === "worksheets" && (isWorksheetPdfFile(contextMenu.file) || contextMenu.file.isPendingWorksheet) && (
                <MenuOption
                  icon={
                    generatingPdfLinkId === (contextMenu.file.isPendingWorksheet ? contextMenu.file.worksheetDocId : extractWorksheetLinkId(contextMenu.file.rawName || contextMenu.file.name))
                      ? <Loader2 size={14} className="animate-spin" />
                      : contextMenu.file.isPendingWorksheet ? <FilePlus2 size={14} /> : <RefreshCw size={14} />
                  }
                  label={
                    generatingPdfLinkId === (contextMenu.file.isPendingWorksheet ? contextMenu.file.worksheetDocId : extractWorksheetLinkId(contextMenu.file.rawName || contextMenu.file.name))
                      ? contextMenu.file.isPendingWorksheet ? "Generando PDF..." : "Regenerando PDF..."
                      : contextMenu.file.isPendingWorksheet ? "Generar PDF" : "Regenerar PDF"
                  }
                  onClick={() => { if (contextMenu.file) handleRegeneratePdf(contextMenu.file); setContextMenu(null); }}
                />
              )}
              <MenuOption icon={<Info size={14} />} label="Ver detalles" onClick={() => { if (contextMenu.file) { setSelectedIds(new Set([contextMenu.file.fullPath])); setDetailsOpen(true); } setContextMenu(null); }} />
              {!contextMenu.file.isPendingWorksheet && (
                <MenuOption icon={<Download size={14} />} label="Descargar" onClick={() => { if (contextMenu.file) handleDownload(contextMenu.file); setContextMenu(null); }} />
              )}
              {!contextMenu.file.isPendingWorksheet && (
                <MenuOption icon={<Star size={14} className={contextMenu.file.starred ? "fill-amber-500 text-amber-500" : ""} />} label={contextMenu.file.starred ? "Quitar de destacados" : "Agregar a destacados"} onClick={() => { if (contextMenu.file) handleToggleStar(contextMenu.file); setContextMenu(null); }} />
              )}
              {!contextMenu.file.isPendingWorksheet && (
                <>
              <div className="my-1 mx-2 border-t border-slate-100" />
              <MenuOption
                icon={<FileCheck size={14} />}
                label={contextMenu.file.completed ? "Marcar como pendiente" : "Marcar como realizado"}
                onClick={() => {
                  const next = !contextMenu.file!.completed;
                  if (selectedIds.has(contextMenu.file!.fullPath) && selectedIds.size > 1) {
                    handleBatchUpdateStatus(
                      "completed",
                      next,
                        {
                          toastSuccess: next
                            ? `${selectedIds.size} archivos marcados como realizados`
                            : `${selectedIds.size} archivos marcados como pendientes`,
                        }
                    );
                    setContextMenu(null);
                  } else {
                    updateFileStatus(contextMenu.file!, 'completed', next);
                    setContextMenu(null);
                  }
                }}
              />
              {isQuality && (
                <MenuOption
                  icon={<CheckCircle2 size={14} />}
                  label={contextMenu.file.reviewed ? "Invalidar calidad" : "Validar calidad"}
                  onClick={() => {
                    const next = !contextMenu.file!.reviewed;
                    if (selectedIds.has(contextMenu.file!.fullPath) && selectedIds.size > 1) {
                      handleBatchUpdateStatus(
                        "reviewed",
                        next,
                        {
                          toastSuccess: next
                            ? `${selectedIds.size} archivos marcados como revisados`
                            : `${selectedIds.size} archivos invalidados por calidad`,
                        }
                      );
                      setContextMenu(null);
                    } else {
                      updateFileStatus(contextMenu.file!, 'reviewed', next);
                      setContextMenu(null);
                    }
                  }}
                />
              )}
              {isQuality && ( <> <div className="my-1 mx-2 border-t border-slate-100" /> <MenuOption icon={<Edit size={14} />} label="Renombrar" onClick={() => { if (contextMenu.file) { setRenameTargetFile(contextMenu.file); setRenameTargetFolder(null); setNewName(contextMenu.file.name); setRenameDialogOpen(true); setContextMenu(null); } }} /> <MenuOption icon={<FolderSymlink size={14} />} label="Mover a..." onClick={() => { if (contextMenu.file) { setMoveTargetFiles(selectedIds.has(contextMenu.file.fullPath) && selectedIds.size > 1 ? files.filter(f => selectedIds.has(f.fullPath)) : [contextMenu.file]); setMoveTargetFolder(null); setMoveToPath([]); setMoveDialogOpen(true); setContextMenu(null); } }} /> <MenuOption icon={<Trash2 size={14} />} label="Eliminar" danger onClick={() => { if (contextMenu.file) handleDelete(contextMenu.file); setContextMenu(null); }} /> </> )}
                </>
              )}
            </> )}
            {contextMenu.folder && isQuality && ( <> <MenuOption icon={<FolderOpen size={14} />} label="Abrir" onClick={() => { if (contextMenu.folder) { setPath([...path, contextMenu.folder.name]); setContextMenu(null); } }} /> <MenuOption icon={<Edit size={14} />} label="Renombrar" onClick={() => { if (contextMenu.folder) { setRenameTargetFolder(contextMenu.folder); setRenameTargetFile(null); setNewName(contextMenu.folder.name); setRenameDialogOpen(true); setContextMenu(null); } }} /> <MenuOption icon={<FolderSymlink size={14} />} label="Mover a..." onClick={() => { if (contextMenu.folder) { setMoveTargetFolder(contextMenu.folder); setMoveTargetFiles([]); setMoveToPath([]); setMoveDialogOpen(true); setContextMenu(null); } }} /> <div className="my-1 mx-2 border-t border-slate-100" /> <MenuOption icon={<Trash2 size={14} />} label="Eliminar carpeta" danger onClick={() => { if (contextMenu.folder) executeDeleteFolder(contextMenu.folder); setContextMenu(null); }} /> </> )}
          </div>
        );
      })()}
      {moveDialogOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><FolderSymlink size={16} className="text-blue-500" />{moveTargetFolder ? `Mover "${moveTargetFolder.name}"` : `Mover ${moveTargetFiles.length > 1 ? `${moveTargetFiles.length} archivos` : `"${moveTargetFiles[0]?.name}"`}`}</h3><button onClick={() => { setMoveDialogOpen(false); setMoveCreateFolderOpen(false); setMoveNewFolderName(""); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><X size={15} className="text-slate-400" /></button></div>
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2"><button disabled={moveToPath.length === 0} onClick={() => setMoveToPath(prev => prev.slice(0, -1))} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-all flex-shrink-0" title="Subir"><ArrowUp size={13} /></button><div className="flex items-center gap-1 text-xs text-slate-600 overflow-hidden flex-1 min-w-0"><Home size={12} className="text-slate-400 flex-shrink-0" /><span className="text-slate-400">/</span>{moveToPath.map((p, i) => <span key={i} className="font-medium text-slate-700">{p} /</span>)}</div><button type="button" title="Nueva carpeta" onClick={() => { setMoveNewFolderName(""); setMoveCreateFolderOpen(true); }} disabled={isMoving || isCreatingMoveFolder} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-all flex-shrink-0"><FolderPlus size={13} className="text-amber-500" /></button></div>
            <div className="flex-1 overflow-y-auto py-2 min-h-[180px]">{moveFolderContent.length === 0 ? ( <div className="flex flex-col items-center justify-center py-10 text-slate-400"><FolderOpen size={28} strokeWidth={1.5} className="mb-2 opacity-50" /><p className="text-xs">Sin subcarpetas</p></div> ) : ( <div className="px-2 space-y-0.5">{moveFolderContent.map((folder, i) => { const style = getFolderVisualStyle(folder.name); return ( <button key={i} onClick={() => setMoveToPath([...moveToPath, folder.name])} disabled={moveTargetFolder?.name === folder.name} className={clsx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors", moveTargetFolder?.name === folder.name ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50")}><div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", style.bg)}><Folder size={16} className={clsx(style.icon, style.fill)} /></div><span className="text-sm text-slate-700 font-medium flex-1 truncate">{folder.name}</span><ChevronRight size={14} className="text-slate-300" /></button> ); })}</div> )}</div>
            <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex justify-end gap-2"><button onClick={() => { setMoveDialogOpen(false); setMoveCreateFolderOpen(false); setMoveNewFolderName(""); }} disabled={isMoving} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-medium transition-colors">Cancelar</button><button onClick={handleModalMove} disabled={(moveTargetFiles.length === 0 && !moveTargetFolder) || isMoving} className="px-5 py-2 bg-[#0050d8] hover:bg-[#1a66e0] text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 disabled:opacity-50 transition-all">{isMoving ? <Loader2 size={14} className="animate-spin" /> : <FolderSymlink size={14} />}Mover aquí</button></div>
          </div>
        </div>
      )}
      {moveCreateFolderOpen && (
        <Dialog
          title="Nueva carpeta"
          onClose={() => { if (!isCreatingMoveFolder) { setMoveCreateFolderOpen(false); setMoveNewFolderName(""); } }}
          onConfirm={handleCreateFolderInMove}
          confirmLabel="Crear"
          confirmDisabled={!moveNewFolderName.trim()}
          confirmLoading={isCreatingMoveFolder}
        >
          <input
            autoFocus
            value={moveNewFolderName}
            onChange={e => setMoveNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && moveNewFolderName.trim() && !isCreatingMoveFolder) handleCreateFolderInMove(); }}
            disabled={isCreatingMoveFolder}
            className="w-full border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 p-3 rounded-xl outline-none text-sm bg-white text-slate-800 disabled:opacity-50"
            placeholder="Nombre de la carpeta..."
          />
        </Dialog>
      )}
      {createFolderOpen && ( <Dialog title="Nueva carpeta" onClose={() => { setCreateFolderOpen(false); setNewFolderName(""); }} onConfirm={() => { if (!newFolderName.trim()) return; uploadBytes(ref(storage, `${[currentRoot, ...path, newFolderName.trim()].join('/')}/.keep`), new Uint8Array([0])).then(() => { setCreateFolderOpen(false); setNewFolderName(""); loadContent(); }); }} confirmLabel="Crear"><input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newFolderName.trim()) uploadBytes(ref(storage, `${[currentRoot, ...path, newFolderName.trim()].join('/')}/.keep`), new Uint8Array([0])).then(() => { setCreateFolderOpen(false); setNewFolderName(""); loadContent(); }); }} className="w-full border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 p-3 rounded-xl outline-none text-sm bg-white text-slate-800" placeholder="Nombre de la carpeta..." /></Dialog> )}
      {renameDialogOpen && ( <Dialog title={renameTargetFile ? "Renombrar archivo" : "Renombrar carpeta"} onClose={() => setRenameDialogOpen(false)} onConfirm={async () => { if (!newName.trim()) return; setRenameDialogOpen(false); const dest = [currentRoot, ...path].join('/'); if (renameTargetFile) { const ok = await executeMoveFile(renameTargetFile, dest, newName.trim()); if (ok) { showToast("Archivo renombrado", 'success'); loadContent(); } } else if (renameTargetFolder) { const ok = await executeMoveFolder(renameTargetFolder, dest + '/' + newName.trim()); if (ok) { showToast("Carpeta renombrada", 'success'); loadContent(); } } }} confirmLabel="Renombrar" confirmClass="bg-violet-600 hover:bg-violet-700 text-white"><input autoFocus value={newName} onChange={e => setNewName(e.target.value)} className="w-full border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 p-3 rounded-xl outline-none text-sm bg-white text-slate-800" placeholder="Nuevo nombre..." /></Dialog> )}
      <div className="fixed bottom-6 right-5 z-[300] flex flex-col gap-2 pointer-events-none">{toasts.map(toast => ( <div key={toast.id} className="pointer-events-auto"><Toast toast={toast} /></div> ))}</div>
    </div>
  );
}