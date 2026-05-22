import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { 
  ArrowLeft, Plus, Calendar, Search, Eye, Edit3, Trash2, X, 
  CheckCircle2, RotateCcw, Play, AlertCircle, Clock,
  Briefcase, Settings, Zap, Paperclip, Users, Upload, 
  Building2, Mail, FileText, Info, Send,
  LayoutGrid, List as ListIcon, MapPin, User, MoreHorizontal, Download, MessageCircle, MoreVertical,
  AlertTriangle, Check, Loader2, ChevronDown, Phone
} from 'lucide-react';

import { 
  doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, 
  orderBy, serverTimestamp, getDocs, getDoc, arrayUnion, where
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FileViewer } from './FileViewer';
import labLogo from '../assets/lab_logo.png';

import format from 'date-fns/format';
import parseISO from 'date-fns/parseISO';
import es from 'date-fns/locale/es';
import { autoStartServiciosIfDue } from '../utils/servicioAutomation';
import { buildMensajeAsignacionServicio } from '../utils/asignacionNotificacion';
import { getUserTeamColor } from '../utils/teamAvatarColor';
import TeamColorPickerModal from './TeamColorPickerModal';

// ==========================================
// TYPES
// ==========================================

interface Usuario {
  id: string;
  name?: string;
  nombre?: string;
  email?: string;
  correo?: string;
  position?: string;
  puesto?: string;
  role?: string;
  photoUrl?: string;
  /** Permanent team avatar color (hex). Shared with Friday board. */
  color?: string;
}

interface ChatMessage {
  id: string;
  usuarioId: string;
  nombre: string;
  texto: string;
  fecha: string;
}

interface Service {
  id: string;
  titulo: string;
  cliente: string;
  clienteId: string;
  estado: 'programado' | 'en_proceso' | 'finalizado' | 'reprogramacion';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  tipo: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  personas: string[]; 
  descripcion: string;
  archivos: (string | File)[];
  mensajes?: ChatMessage[];
  notas?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  ubicacion?: string;
}

interface FileUploadState {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  url?: string;
  preview?: string;
}

// ==========================================
// HELPERS
// ==========================================

const formatDateRelative = (dateString: string) => {
  if (!dateString) return 'Sin fecha';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', weekday: 'short' });
};

const getInitials = (name: string) => name ? name.substring(0, 2).toUpperCase() : '??';

const getFileExtension = (name: string) => {
  const base = (name || '').split('?')[0];
  const parts = base.split('.');
  return parts.length > 1 ? (parts.pop() || '').toLowerCase() : '';
};

const isImageFile = (name: string) => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(getFileExtension(name));
const isPdfFile = (name: string) => getFileExtension(name) === 'pdf';
const isOfficeFile = (name: string) => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(getFileExtension(name));
const isTextFile = (name: string) => ['txt', 'csv', 'md', 'json', 'xml', 'log'].includes(getFileExtension(name));

const getFileName = (file: string | File) =>
  typeof file === 'string'
    ? decodeURIComponent(file.split('/').pop()?.split('?')[0] || 'Archivo')
    : file.name;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

interface AttachmentPreview {
  url: string;
  name: string;
  size?: number;
}

const INITIAL_FORM_STATE = {
  titulo: '',
  descripcion: '',
  tipo: 'calibracion',
  prioridad: 'media',
  estado: 'programado',
  fecha: '',
  horaInicio: '',
  horaFin: '',
  ubicacion: '',
  clienteId: '',
  cliente: '',
  contacto: '',
  telefono: '',
  email: '',
  personas: [] as string[],
  archivos: [] as (string | File)[],
  notas: '',
};

const CONSTANTS = {
  estados: [
    { value: 'programado', label: 'Programado', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', icon: Calendar },
    { value: 'en_proceso', label: 'En Proceso', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', icon: Play },
    { value: 'reprogramacion', label: 'Reprogramado', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500', icon: RotateCcw },
    { value: 'finalizado', label: 'Finalizado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 }
  ],
  prioridades: [
    { value: 'baja', label: 'Baja', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
    { value: 'media', label: 'Media', color: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-400' },
    { value: 'alta', label: 'Alta', color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-400' },
    { value: 'critica', label: 'Crítica', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' }
  ],
  tipos: [
    { value: 'calibracion', label: 'Calibración', icon: Settings, color: 'text-indigo-600 bg-indigo-50' },
    { value: 'mantenimiento', label: 'Mantenimiento', icon: Briefcase, color: 'text-cyan-600 bg-cyan-50' },
    { value: 'verificacion', label: 'Verificación', icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
    { value: 'reparacion', label: 'Reparación', icon: Zap, color: 'text-rose-600 bg-rose-50' },
    { value: 'inspeccion', label: 'Inspección', icon: Eye, color: 'text-violet-600 bg-violet-50' }
  ]
};

// ==========================================
// SMALL COMPONENTS
// ==========================================

const Avatar = ({ user, size = 'sm' }: { user: Usuario | undefined, size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = size === 'lg' ? 'w-10 h-10 text-sm' : size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  const teamColor = getUserTeamColor(user);
  return (
    <AvatarChip
      title={user?.name || user?.nombre}
      sizeClass={sizeClass}
      teamColor={teamColor}
      initials={getInitials(user?.name || user?.nombre || '??')}
    />
  );
};

function AvatarChip({
  title,
  sizeClass,
  teamColor,
  initials,
}: {
  title?: string;
  sizeClass: string;
  teamColor?: string;
  initials: string;
}) {
  return (
    <div
      title={title}
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0 ${
        teamColor ? '' : 'bg-gradient-to-br from-indigo-500 to-purple-600'
      }`}
      style={teamColor ? { backgroundColor: teamColor } : undefined}
    >
      {initials}
    </div>
  );
}

const PriorityBadge = ({ priority }: { priority: string }) => {
  const config = CONSTANTS.prioridades.find(p => p.value === priority) || CONSTANTS.prioridades[0];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

const getFileTypeLabel = (name: string) => {
  if (isImageFile(name)) return 'Imagen';
  if (isPdfFile(name)) return 'PDF';
  if (isOfficeFile(name)) return 'Office';
  if (isTextFile(name)) return 'Texto';
  const ext = getFileExtension(name);
  return ext ? ext.toUpperCase() : 'Archivo';
};

const AttachmentPreviewModal = ({ attachment, onClose }: { attachment: AttachmentPreview; onClose: () => void }) => {
  const ext = getFileExtension(attachment.name);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4 sm:px-5 bg-white flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{attachment.name}</p>
              <p className="text-[10px] text-gray-400 font-mono uppercase">
                {getFileTypeLabel(attachment.name)}
                {ext ? ` · .${ext}` : ''}
                {attachment.size != null ? ` · ${formatFileSize(attachment.size)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={attachment.url}
              download={attachment.name}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Descargar
            </a>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-gray-100 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 min-h-[280px] p-3 sm:p-4 flex flex-col overflow-hidden">
            <FileViewer
              url={attachment.url}
              fileName={attachment.name}
              maxHeight="100%"
              style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const FileThumbnail = ({ file, onView, onRemove }: { file: string | File, onView?: () => void, onRemove?: () => void }) => {
  const name = getFileName(file);
  const isImg = isImageFile(name);
  const ext = getFileExtension(name);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (file instanceof File && isImg) {
      const url = URL.createObjectURL(file);
      setImgSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    if (typeof file === 'string' && isImg) {
      setImgSrc(file);
    } else {
      setImgSrc(null);
    }
  }, [file, isImg]);

  return (
    <div className="relative group flex flex-col rounded-xl border border-gray-200 overflow-hidden bg-white hover:border-blue-300 hover:shadow-md transition-all">
      <div className="h-24 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer" onClick={onView}>
        {imgSrc ? (
          <img src={imgSrc} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400 px-2 text-center">
            <FileText className="w-8 h-8" />
            <span className="text-[10px] font-bold uppercase">{ext || 'file'}</span>
            <span className="text-[9px] text-gray-300">{getFileTypeLabel(name)}</span>
          </div>
        )}
        {onView && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Eye className="w-6 h-6 text-white drop-shadow" />
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
        <span className="text-[10px] text-gray-600 truncate flex-1 font-medium" title={name}>{name}</span>
        {onRemove && (
          <button onClick={onRemove} className="flex-shrink-0 w-5 h-5 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
        {onView && !onRemove && (
          <button onClick={onView} className="flex-shrink-0 text-blue-400 hover:text-blue-600" title="Vista previa">
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// ==========================================
// SERVICE CARD
// ==========================================

const ServiceCard = ({ service, users, onClick, onQuickAction, variant = 'kanban', canEdit }: any) => {
  const tipoConfig = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const TipoIcon = tipoConfig?.icon || Settings;
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado) || CONSTANTS.estados[0];
  const assignedUsers = users.filter((u:any) => Array.isArray(service.personas) && service.personas.includes(u.id));
  const [showMenu, setShowMenu] = useState(false);

  const renderQuickButton = () => {
    if (service.estado === 'programado') return (
      <button onClick={(e) => { e.stopPropagation(); onQuickAction(service.id, 'en_proceso'); }} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
        <Play className="w-3 h-3 fill-current" /> Iniciar
      </button>
    );
    if (service.estado === 'en_proceso') return (
      <button onClick={(e) => { e.stopPropagation(); onQuickAction(service.id, 'finalizado'); }} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
        <CheckCircle2 className="w-3 h-3" /> Finalizar
      </button>
    );
    return null;
  };

  const QuickMenu = () => (
    <div className="absolute right-2 top-8 w-44 bg-white rounded-xl shadow-xl border border-gray-100 z-10 overflow-hidden">
      <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onQuickAction(service.id, 'reprogramacion'); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5 text-orange-500" /> Reprogramar</button>
      <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onQuickAction(service.id, 'programado'); }} className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500" /> Regresar a Programado</button>
    </div>
  );

  if (variant === 'list') {
    return (
      <div onClick={onClick} className="group bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer flex flex-col sm:flex-row gap-3 items-center relative">
        <div className={`p-2.5 rounded-lg hidden sm:flex flex-shrink-0 ${tipoConfig?.color || 'bg-gray-100 text-gray-500'}`}>
          <TipoIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-0.5">
            <PriorityBadge priority={service.prioridad} />
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${statusConfig.bg} ${statusConfig.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />{statusConfig.label}
            </span>
          </div>
          <h4 className="font-bold text-gray-900 truncate text-sm">{service.titulo}</h4>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span className="flex items-center gap-1 truncate"><Building2 className="w-3 h-3" /> {service.cliente}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDateRelative(service.fecha)}</span>
            {service.mensajes?.length > 0 && <span className="flex items-center gap-1 text-blue-500 font-medium"><MessageCircle className="w-3 h-3" /> {service.mensajes.length}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-2 sm:pt-0">
          <div className="flex -space-x-2">
            {assignedUsers.length > 0 ? assignedUsers.slice(0, 3).map((u:any) => <Avatar key={u.id} user={u} />) : (
              <span className="text-[10px] text-gray-400 italic">Sin asignar</span>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <div className="hidden sm:block">{renderQuickButton()}</div>
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMenu && <QuickMenu />}
              </div>
            </div>
          )}
        </div>
        {showMenu && <div className="fixed inset-0 z-0" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />}
      </div>
    );
  }

  return (
    <div onClick={onClick} className="group bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer flex flex-col gap-3 relative overflow-visible">
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${statusConfig.dot}`} />
      <div className="flex justify-between items-start pl-2">
        <div className="flex flex-col gap-1">
          <PriorityBadge priority={service.prioridad} />
        </div>
        {canEdit && (
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="text-gray-400 hover:text-blue-600 p-1">
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {showMenu && <QuickMenu />}
          </div>
        )}
      </div>
      <div className="pl-2">
        <h4 className="font-bold text-gray-900 leading-snug mb-1 line-clamp-2 text-sm">{service.titulo}</h4>
        <p className="text-xs text-gray-500 flex items-center gap-1 mb-1"><Building2 className="w-3 h-3" /> {service.cliente}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDateRelative(service.fecha)}</p>
        <div className="flex items-center gap-3 mt-1.5">
          {service.archivos?.length > 0 && <span className="text-xs text-gray-400 flex items-center gap-1"><Paperclip className="w-3 h-3" /> {service.archivos.length} adj</span>}
          {service.mensajes?.length > 0 && <span className="text-xs text-blue-500 font-medium flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {service.mensajes.length} msgs</span>}
        </div>
        
        <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-2">
          <div className="flex -space-x-2">
            {assignedUsers.length > 0 ? assignedUsers.slice(0, 3).map((u:any) => <Avatar key={u.id} user={u} />) : (
              <span className="text-[10px] text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md font-medium flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Sin asignar</span>
            )}
          </div>
          {canEdit ? (
            renderQuickButton() || <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${statusConfig.bg} ${statusConfig.color}`}>{statusConfig.label}</span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${statusConfig.bg} ${statusConfig.color}`}>{statusConfig.label}</span>
          )}
        </div>
      </div>
      {showMenu && <div className="fixed inset-0 z-0" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />}
    </div>
  );
};

// ==========================================
// SERVICE DETAIL MODAL (CON CHAT/BITÁCORA)
// ==========================================

const ServiceDetailModal = ({ isOpen, onClose, service, usuarios, onEdit, onDelete, onViewFile, canEdit, currentUser }: any) => {
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [service?.mensajes, isOpen]);

  if (!isOpen || !service) return null;
  const tipoInfo = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado) || CONSTANTS.estados[0];
  const StatusIcon = statusConfig.icon;

  const handleEnviarMensaje = async () => {
    if (!nuevoMensaje.trim() || !service?.id || !currentUser) return;
    setEnviando(true);
    try {
      const msg: ChatMessage = {
        id: Date.now().toString(),
        usuarioId: currentUser.id,
        nombre: currentUser.nombre || currentUser.name || 'Usuario',
        texto: nuevoMensaje.trim(),
        fecha: new Date().toISOString()
      };
      await updateDoc(doc(db, 'servicios', service.id), {
        mensajes: arrayUnion(msg)
      });
      setNuevoMensaje('');
    } catch(e) {
      toast.error("Error al publicar en la bitácora");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Header */}
        <div className="relative bg-gray-50 px-6 py-5 border-b border-gray-200 shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white rounded-full text-gray-500 hover:text-gray-900 shadow-sm"><X className="w-4 h-4" /></button>
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.color} border ${statusConfig.border}`}>
              <StatusIcon className="w-3.5 h-3.5" /> {statusConfig.label}
            </span>
            <PriorityBadge priority={service.prioridad} />
            {!canEdit && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ml-auto mr-6"><Eye className="w-3 h-3 inline mr-1"/> Modo Lectura</span>}
          </div>
          <h2 className="text-xl font-bold text-gray-900 leading-tight pr-8">{service.titulo}</h2>
          <div className="flex items-center gap-2 mt-1.5 text-gray-500 text-xs">
            <span className={`flex items-center gap-1 font-medium ${tipoInfo?.color?.split(' ')[0]}`}>
              {tipoInfo?.icon && <tipoInfo.icon className="w-3.5 h-3.5" />} {tipoInfo?.label}
            </span>
            <span>·</span>
            <span className="font-mono">#{service.id.slice(-6).toUpperCase()}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white custom-scrollbar">
          
          {/* Info Blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cliente / Destino</h3>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Building2 className="w-4 h-4" /></div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{service.cliente}</p>
                  {service.ubicacion && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{service.ubicacion}</p>}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Planificación</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Fecha</span>
                  <span className="font-bold text-gray-900">{formatDateRelative(service.fecha)}</span>
                </div>
                <div className="flex items-center justify-between text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-gray-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Horario</span>
                  <span className="font-bold text-gray-900">{service.horaInicio || '--'} – {service.horaFin || '--'}</span>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Team */}
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Equipo Técnico Asignado</h3>
            <div className="flex flex-wrap gap-2">
              {Array.isArray(service.personas) && service.personas.length > 0 ? service.personas.map((id: string) => {
                const m = usuarios.find((u: any) => u.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 pr-4 pl-1 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm">
                    <Avatar user={m} />
                    <div>
                      <p className="text-xs font-bold text-gray-700">{m?.name || m?.nombre || 'Usuario Desconocido'}</p>
                    </div>
                  </div>
                );
              }) : (
                <div className="text-xs text-orange-600 italic flex items-center gap-2 bg-orange-50 px-3 py-2 rounded-lg w-full border border-orange-100">
                  <AlertCircle className="w-4 h-4" /> No hay técnicos asignados.
                </div>
              )}
            </div>
          </div>

          {/* Chat / Bitácora (El Metrólogo puede escribir aquí) */}
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-blue-500" /> Bitácora / Chat del Servicio
            </h3>
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col h-72 border border-gray-200">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar pr-2">
                {service.mensajes?.length > 0 ? service.mensajes.map((msg: any) => {
                  const isMe = msg.usuarioId === currentUser?.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="text-[9px] text-gray-400 mb-1 px-1">
                        {isMe ? 'Tú' : msg.nombre} • {format(parseISO(msg.fecha), "d MMM, HH:mm", {locale: es})}
                      </span>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>
                        {msg.texto}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                    <MessageCircle className="w-8 h-8 text-gray-300 mb-2" />
                    <p className="text-xs text-gray-500 italic px-4">No hay reportes. Usa esta bitácora para registrar demoras, faltas de equipo o avances sin modificar el servicio.</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              <div className="flex gap-2 relative bg-white p-1 rounded-2xl shadow-sm border border-gray-200">
                <input
                  type="text"
                  value={nuevoMensaje}
                  onChange={e => setNuevoMensaje(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !enviando && nuevoMensaje.trim() && handleEnviarMensaje()}
                  placeholder="Escribe un reporte o comentario..."
                  className="flex-1 px-3 py-2 bg-transparent text-sm outline-none"
                />
                <button
                  onClick={handleEnviarMensaje}
                  disabled={enviando || !nuevoMensaje.trim()}
                  className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center disabled:opacity-50 transition-colors shrink-0"
                >
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Files */}
          {service.archivos?.length > 0 && (
            <div className="border-t border-gray-100 pt-6">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Paperclip className="w-3 h-3" /> Adjuntos ({service.archivos.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {service.archivos.map((file: any, i: number) => (
                  <FileThumbnail key={i} file={file} onView={() => onViewFile(file)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3 shrink-0">
            <button onClick={() => onDelete(service.id)} className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Eliminar">
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={() => onEdit(service)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-medium shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2">
              <Edit3 className="w-4 h-4" /> Editar / Gestionar Servicio
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// SERVICE FORM MODAL
// ==========================================

const FORM_STEPS = [
  { id: 'general', label: 'Servicio', icon: Info },
  { id: 'cliente', label: 'Cliente', icon: Building2 },
  { id: 'equipo', label: 'Personal', icon: Users },
  { id: 'archivos', label: 'Adjuntos', icon: Paperclip },
];

const ClienteCombobox = ({ clientes, value, onChange }: { clientes: any[], value: string, onChange: (id: string) => void }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() =>
    [...clientes].sort((a, b) => {
      const na = (a.nombre || a.razonSocial || '').toLowerCase();
      const nb = (b.nombre || b.razonSocial || '').toLowerCase();
      return na.localeCompare(nb, 'es');
    }), [clientes]);

  const filtered = useMemo(() =>
    query.trim() === ''
      ? sorted
      : sorted.filter(c => (c.nombre || c.razonSocial || '').toLowerCase().includes(query.toLowerCase())),
    [sorted, query]);

  const selected = clientes.find(c => c.id === value);
  const selectedLabel = selected ? (selected.nombre || selected.razonSocial) : '';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 w-full px-4 py-3 bg-white border rounded-xl transition-all cursor-text ${open ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300'}`}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedLabel || 'Buscar cliente...'}
          className="flex-1 outline-none bg-transparent text-sm text-gray-800 placeholder-gray-400"
        />
        {value && !open && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleSelect(''); setQuery(''); }}
            className="p-0.5 text-gray-400 hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {value && !open && (
        <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
          <Building2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-800 truncate">{selectedLabel}</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto flex-shrink-0" />
        </div>
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          style={{ maxHeight: '280px' }}
        >
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-medium">
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '236px' }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                <Search className="w-6 h-6 mx-auto mb-1 opacity-40" />
                Sin resultados
              </div>
            ) : (
              filtered.map(c => {
                const name = c.nombre || c.razonSocial;
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => handleSelect(c.id)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Building2 className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`} />
                    <span className="flex-1 truncate">{name}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ServiceFormModal = ({ isOpen, onClose, initialData, onSubmit, loading, clientes, usuarios }: any) => {
  const [formData, setFormData] = useState(initialData);
  const [activeStep, setActiveStep] = useState(0);
  const [uploadStates, setUploadStates] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const seededServiceIdRef = useRef<string | undefined>(undefined);

  // Only seed form when the modal opens or when switching to a different service.
  // Do not reset on parent re-renders (Firestore snapshots recreate initialData references).
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      seededServiceIdRef.current = undefined;
      return;
    }

    const serviceId = initialData?.id ?? '';
    const justOpened = !wasOpenRef.current;
    const switchedService = seededServiceIdRef.current !== serviceId;

    if (justOpened || switchedService) {
      setFormData(initialData);
      setActiveStep(0);
      setUploadStates([]);
      seededServiceIdRef.current = serviceId;
    }

    wasOpenRef.current = true;
  }, [isOpen, initialData?.id, initialData]);

  const handleChange = (field: string, value: any) =>
    setFormData((prev: any) => ({ ...prev, [field]: value }));

  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find((c: any) => c.id === clienteId);
    if (cliente) {
      setFormData((prev: any) => ({
        ...prev, clienteId, cliente: cliente.nombre || cliente.razonSocial,
        contacto: cliente.contactoPrincipal || cliente.contacto || cliente.nombreContacto || cliente.nombre_contacto || '',
        telefono: cliente.telefono || cliente.phone || cliente.tel || '',
        email: cliente.email || '', ubicacion: cliente.direccion || ''
      }));
    }
  };

  const addFiles = useCallback((files: File[]) => {
    const newStates: FileUploadState[] = files.map(file => {
      const isImg = isImageFile(file.name);
      return { file, progress: 0, status: 'pending', preview: isImg ? URL.createObjectURL(file) : undefined };
    });
    setUploadStates(prev => [...prev, ...newStates]);
    setFormData((prev: any) => ({
      ...prev,
      archivos: [...(Array.isArray(prev.archivos) ? prev.archivos : []), ...files],
    }));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  const existingUrls = (formData.archivos || []).filter((f: any) => typeof f === 'string');
  const pendingFiles = (formData.archivos || []).filter((f: any) => f instanceof File);

  const stepValid = [
    !!(formData.titulo?.trim() && formData.fecha),
    !!(formData.clienteId),
    true,
    true,
  ];

  const goNext = () => {
    if (activeStep < FORM_STEPS.length - 1) {
      setActiveStep(s => s + 1);
      bodyRef.current?.scrollTo(0, 0);
    }
  };

  const goPrev = () => {
    if (activeStep > 0) {
      setActiveStep(s => s - 1);
      bodyRef.current?.scrollTo(0, 0);
    }
  };

  const handleSubmit = () => onSubmit({ ...formData, archivos: formData.archivos || [] });

  // FILTRO: Solo mostrar personal de metrología
  const metrologosDisponibles = useMemo(() => {
    return usuarios.filter((u: any) => {
      const puesto = (u.position || u.puesto || u.role || '').toLowerCase();
      return puesto.includes('metrologo') || puesto.includes('metrólogo');
    });
  }, [usuarios]);

  if (!isOpen) return null;

  const personasArray = Array.isArray(formData.personas) ? formData.personas : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{formData.id ? 'Editar Servicio' : 'Nuevo Servicio'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{formData.id ? `#${formData.id.slice(-6).toUpperCase()}` : 'Completa los campos y guarda'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-gray-100 bg-gray-50/60 flex-shrink-0 overflow-x-auto">
          {FORM_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(i)}
                className={`flex-1 min-w-[80px] flex flex-col items-center gap-0.5 py-3 px-2 text-[10px] font-bold border-b-2 transition-all ${isActive ? 'border-blue-600 text-blue-600 bg-white' : isDone ? 'border-emerald-400 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-0.5 ${isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                </div>
                <span className="uppercase tracking-wide">{step.label}</span>
                {!stepValid[i] && i === 0 && formData.titulo?.trim() === '' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 absolute top-2 right-2" />
                )}
              </button>
            );
          })}
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-5 bg-white">
          {/* STEP 0 */}
          {activeStep === 0 && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Título del Servicio <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={e => handleChange('titulo', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                  placeholder="Ej. Calibración Balanza Analítica"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-2 block">Tipo de Servicio</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CONSTANTS.tipos.map(t => {
                    const Icon = t.icon;
                    const sel = formData.tipo === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => handleChange('tipo', t.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${sel ? `${t.color} border-current ring-1 ring-current` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        <Icon className="w-3.5 h-3.5" /> {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Estado</label>
                  <div className="relative">
                    <select value={formData.estado} onChange={e => handleChange('estado', e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none appearance-none text-sm pr-8">
                      {CONSTANTS.estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Prioridad</label>
                  <div className="relative">
                    <select value={formData.prioridad} onChange={e => handleChange('prioridad', e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none appearance-none text-sm pr-8">
                      {CONSTANTS.prioridades.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1">
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Fecha <span className="text-red-500">*</span></label>
                  <input type="date" value={formData.fecha} onChange={e => handleChange('fecha', e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Hora inicio</label>
                  <input type="time" value={formData.horaInicio} onChange={e => handleChange('horaInicio', e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Hora fin</label>
                  <input type="time" value={formData.horaFin} onChange={e => handleChange('horaFin', e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Descripción</label>
                <textarea rows={3} value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none resize-none text-sm focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Detalles del trabajo a realizar..." />
              </div>
            </div>
          )}

          {/* STEP 1 */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block">
                  Seleccionar Cliente <span className="text-red-500">*</span>
                </label>
                <ClienteCombobox clientes={clientes} value={formData.clienteId} onChange={handleClienteChange} />
              </div>

              {formData.clienteId && (
                <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-xl">
                  <p className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">Datos de contacto</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Contacto</label>
                      <input type="text" value={formData.contacto} onChange={e => handleChange('contacto', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> Teléfono</label>
                      <input type="tel" value={formData.telefono} onChange={e => handleChange('telefono', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
                      <input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Dirección</label>
                      <input type="text" value={formData.ubicacion} onChange={e => handleChange('ubicacion', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Personal */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Asignar Personal</h3>
                  <p className="text-xs text-blue-500 mt-0.5">Se enviará una notificación a sus celulares/PC.</p>
                </div>
              </div>

              {personasArray.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  {personasArray.map((id: string) => {
                    const m = usuarios.find((u: any) => u.id === id);
                    return (
                      <div key={id} className="flex items-center gap-1.5 bg-white border border-blue-200 rounded-full pl-1 pr-2 py-0.5 shadow-sm">
                        <Avatar user={m} size="sm" />
                        <span className="text-xs font-bold text-blue-800">{m?.name || m?.nombre || 'Usuario Desconocido'}</span>
                        <button
                          onClick={() => handleChange('personas', personasArray.filter((i: string) => i !== id))}
                          className="text-gray-400 hover:text-red-500 ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {metrologosDisponibles.length > 0 ? metrologosDisponibles.map((m: any) => {
                  const selected = personasArray.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        const next = selected
                          ? personasArray.filter((id: string) => id !== m.id)
                          : [...personasArray, m.id];
                        handleChange('personas', next);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${selected ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
                    >
                      <Avatar user={m} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{m.name || m.nombre}</p>
                        <p className="text-xs text-gray-400 truncate">{m.position || m.puesto || m.role || 'Personal'}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  );
                }) : (
                  <p className="col-span-2 text-center text-gray-400 italic text-sm py-8">No se encontraron usuarios elegibles.</p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Notas privadas del equipo</label>
                <textarea rows={3} value={formData.notas} onChange={e => handleChange('notas', e.target.value)} className="w-full px-4 py-2.5 bg-yellow-50/50 border border-yellow-200 rounded-xl outline-none resize-none text-sm focus:ring-2 focus:ring-yellow-300 transition-all" placeholder="Notas visibles solo para el equipo interno..." />
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${isDragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50/70'}`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-colors ${isDragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Upload className={`w-7 h-7 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                </div>
                <p className="text-sm font-semibold text-gray-700">{isDragging ? 'Suelta aquí para agregar' : 'Arrastra archivos aquí o haz clic'}</p>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); }} />
              </div>

              {existingUrls.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Archivos guardados</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {existingUrls.map((url: string, i: number) => (
                      <FileThumbnail key={`existing-${i}`} file={url} onRemove={() => handleChange('archivos', formData.archivos.filter((f: any) => f !== url))} />
                    ))}
                  </div>
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nuevos archivos</p>
                  <div className="space-y-2">
                    {pendingFiles.map((file: File, i: number) => {
                      const isImg = isImageFile(file.name);
                      const preview = isImg ? URL.createObjectURL(file) : undefined;
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                          <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center overflow-hidden flex-shrink-0">
                            {isImg && preview ? <img src={preview} alt={file.name} className="w-full h-full object-cover" /> : <FileText className="w-5 h-5 text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">{file.name}</p>
                          </div>
                          <button onClick={() => handleChange('archivos', formData.archivos.filter((f: any) => f !== file))} className="flex-shrink-0 w-7 h-7 rounded-full bg-red-50 text-red-400 hover:bg-red-100 flex items-center justify-center transition-colors"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors text-sm">Cancelar</button>
          {activeStep > 0 && <button onClick={goPrev} className="px-4 py-2 text-gray-700 font-medium bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-sm">← Anterior</button>}
          <div className="flex-1" />
          <div className="flex gap-1 items-center">
            {FORM_STEPS.map((_, i) => <button key={i} onClick={() => setActiveStep(i)} className={`rounded-full transition-all ${i === activeStep ? 'w-4 h-2 bg-blue-600' : i < activeStep ? 'w-2 h-2 bg-emerald-400' : 'w-2 h-2 bg-gray-300'}`} />)}
          </div>
          <div className="flex-1" />
          {activeStep < FORM_STEPS.length - 1 ? (
            <button onClick={goNext} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all active:scale-95">Siguiente →</button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl flex items-center gap-2 transition-all disabled:opacity-70 active:scale-95 text-sm">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><CheckCircle2 className="w-4 h-4" /> Guardar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN SCREEN
// ==========================================

const FridayServiciosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [servicios, setServicios] = useState<Service[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuariosLoading, setUsuariosLoading] = useState(true);
  const [clientes, setClientes] = useState<any[]>([]);
  const [localTeamColor, setLocalTeamColor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentPreview | null>(null);
  const previewBlobRef = useRef<string | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);

  useEffect(() => {
      const auth = getAuth();
      const unsubAuth = onAuthStateChanged(auth, (user) => setAuthUser(user));
      return () => unsubAuth();
  }, []);

  // Sincronizar el servicio seleccionado con los cambios en tiempo real de Firebase
  useEffect(() => {
    if (selectedService && isDetailOpen) {
      const servicioActualizado = servicios.find(s => s.id === selectedService.id);
      if (servicioActualizado && JSON.stringify(servicioActualizado) !== JSON.stringify(selectedService)) {
        setSelectedService(servicioActualizado);
      }
    }
  }, [servicios, isDetailOpen]);

  const currentUserData = useMemo(() => {
      if (!authUser || usuarios.length === 0) return null;
      const emailKey = (authUser.email || '').trim().toLowerCase();
      const byUid = usuarios.find((u) => u.id === authUser.uid);
      const byEmail = usuarios.find((u) => {
        const uEmail = (u.email || u.correo || '').trim().toLowerCase();
        return emailKey.length > 0 && uEmail === emailKey;
      });
      if (byUid && byEmail && byUid.id !== byEmail.id) {
        return { ...byEmail, ...byUid, id: authUser.uid, color: byUid.color ?? byEmail.color };
      }
      return byUid || byEmail || null;
  }, [authUser, usuarios]);

  // SEGURIDAD: Solo Calidad y Edgar/Angel pueden crear/editar
  const canEdit = useMemo(() => {
      if (!currentUserData) return false;
      const puesto = (currentUserData.puesto || '').toLowerCase();
      const nombre = (currentUserData.nombre || currentUserData.name || '').toLowerCase();
      
      const isCalidadAdmin = puesto.includes('calidad') || puesto.includes('admin') || puesto.includes('gerente');
      const isEdgar = nombre.includes('edgar amador') || (nombre.includes('edgar') && nombre.includes('amador'));
      const isAngel = nombre.includes('angel amador') || (nombre.includes('angel') && nombre.includes('amador'));
      
      return isCalidadAdmin || isEdgar || isAngel;
  }, [currentUserData]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setViewMode('list');
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setUsuariosLoading(true);
    const unsubUsers = onSnapshot(
      collection(db, 'usuarios'),
      (snap) => {
        setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Usuario)));
        setUsuariosLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error('Error cargando usuarios');
        setUsuariosLoading(false);
      }
    );
    (async () => {
      try {
        const clientsSnap = await getDocs(collection(db, 'clientes'));
        setClientes(clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error(error);
        toast.error('Error cargando clientes');
      }
    })();
    return () => unsubUsers();
  }, []);

  const effectiveTeamColor =
    localTeamColor || getUserTeamColor(currentUserData ?? undefined);

  const needsTeamColorPicker = Boolean(
    authUser &&
      currentUserData &&
      !usuariosLoading &&
      !effectiveTeamColor
  );

  const currentUserId = currentUserData?.id || authUser?.uid || '';

  useEffect(() => {
    if (!authUser) return;

    const serviciosQuery = canEdit
      ? query(collection(db, 'servicios'), orderBy('fechaCreacion', 'desc'))
      : currentUserId
        ? query(collection(db, 'servicios'), where('personas', 'array-contains', currentUserId))
        : null;

    if (!serviciosQuery) {
      setServicios([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      serviciosQuery,
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
        docs.sort((a, b) => {
          const ta = (a as any).fechaCreacion?.toMillis?.() ?? (a as any).fechaCreacion?.seconds ?? 0;
          const tb = (b as any).fechaCreacion?.toMillis?.() ?? (b as any).fechaCreacion?.seconds ?? 0;
          return tb - ta;
        });
        setServicios(docs);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error('Error conectando con la base de datos');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [authUser, canEdit, currentUserId]);

  useEffect(() => {
    const openId = localStorage.getItem('open_servicio_id');
    if (!openId || loading) return;

    localStorage.removeItem('open_servicio_id');
    const service = servicios.find(s => s.id === openId);
    if (service) {
      setSelectedService(service);
      setIsDetailOpen(true);
    }
  }, [loading, servicios]);

  useEffect(() => {
    if (!currentUserId || servicios.length === 0) return;

    const runAutoStart = () => {
      void autoStartServiciosIfDue(servicios, currentUserId);
    };

    runAutoStart();
    const intervalId = window.setInterval(runAutoStart, 60_000);
    return () => window.clearInterval(intervalId);
  }, [servicios, currentUserId]);

  const filteredServices = useMemo(() => servicios.filter(s => {
    const matchSearch = !filterText || s.titulo.toLowerCase().includes(filterText.toLowerCase()) || s.cliente.toLowerCase().includes(filterText.toLowerCase());
    const matchStatus = filterStatus === 'todos' || s.estado === filterStatus;
    const matchMyTasks = canEdit
      ? (!showOnlyMyTasks || (currentUserId && Array.isArray(s.personas) && s.personas.includes(currentUserId)))
      : true;
    return matchSearch && matchStatus && matchMyTasks;
  }), [servicios, filterText, filterStatus, showOnlyMyTasks, currentUserId, canEdit]);

  const stats = useMemo(() => ({
    total: servicios.length,
    pendientes: servicios.filter(s => s.estado === 'programado').length,
    proceso: servicios.filter(s => s.estado === 'en_proceso').length,
    criticos: servicios.filter(s => s.prioridad === 'critica' || s.prioridad === 'alta').length
  }), [servicios]);

  const handleQuickStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'servicios', id), { estado: newStatus });
      toast.success(`Estado actualizado: ${CONSTANTS.estados.find(e => e.value === newStatus)?.label}`);
    } catch (e) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleSaveService = async (data: any) => {
    if (!data.titulo.trim()) return toast.warn('El título es obligatorio');
    setProcessing(true);
    try {
      const filesToUpload: File[] = data.archivos.filter((f: any) => f instanceof File);
      const existingUrls: string[] = data.archivos.filter((f: any) => typeof f === 'string');

      let uploadedUrls: string[] = [];
      if (filesToUpload.length > 0) {
        uploadedUrls = await Promise.all(filesToUpload.map((file: File) =>
          new Promise<string>((resolve, reject) => {
            const storageRef = ref(storage, `servicios/${Date.now()}_${file.name}`);
            const task = uploadBytesResumable(storageRef, file);
            task.on('state_changed',
              () => {},
              reject,
              async () => resolve(await getDownloadURL(task.snapshot.ref))
            );
          })
        ));
      }

      const finalData = {
        ...data,
        archivos: [...existingUrls, ...uploadedUrls],
        ultimaActualizacion: serverTimestamp(),
        actualizadoPor: currentUserData?.id || 'unknown'
      };

      const isNew = !data.id;
      let savedServiceId = data.id as string;

      if (data.id) {
        await updateDoc(doc(db, 'servicios', data.id), finalData);
        toast.success('Servicio actualizado ✓');
      } else {
        const docRef = await addDoc(collection(db, 'servicios'), {
          ...finalData,
          fechaCreacion: serverTimestamp(),
          creadoPor: currentUserData?.id || 'unknown'
        });
        savedServiceId = docRef.id;
        toast.success('Servicio creado ✓');
      }

      // ─── INTEGRACIÓN CON CLOUD FUNCTIONS DE NOTIFICACIONES PUSH ──────────────────
      const nuevasPersonas: string[] = Array.isArray(data.personas) ? data.personas : [];
      let personasANotificar: string[] = [];
      
      if (isNew) {
        personasANotificar = nuevasPersonas.filter(id => id !== currentUserData?.id);
      } else {
        const anterior = servicios.find(s => s.id === data.id);
        const anterioresIds: string[] = Array.isArray(anterior?.personas) ? anterior.personas : [];
        personasANotificar = nuevasPersonas.filter(id => id !== currentUserData?.id && !anterioresIds.includes(id));
      }

      const autorNombre = currentUserData?.nombre || currentUserData?.name || 'Calidad';
      for (const uid of personasANotificar) {
        const tituloPush = isNew ? '🗓️ Nueva asignación de servicio' : '✏️ Servicio actualizado';
        const mensajeBody = buildMensajeAsignacionServicio({
          titulo: data.titulo,
          cliente: data.cliente,
          fecha: data.fecha,
          horaInicio: data.horaInicio,
        });

        await addDoc(collection(db, 'notificaciones'), {
            type: 'info',
            title: tituloPush,
            body: mensajeBody,
            destinatarios: [uid],
            readBy: [],
            timestamp: serverTimestamp(),
            autorNombre,
            autorUid: currentUserData?.id || '',
            usuarioId: uid,
            titulo: tituloPush,
            mensaje: mensajeBody,
            leido: false,
            fecha: new Date().toISOString(),
            tipo: 'asignacion_calidad',
            servicioId: savedServiceId
        });
      }

      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Error al guardar el servicio');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Confirmar eliminación del servicio?')) {
      await deleteDoc(doc(db, 'servicios', id));
      setIsDetailOpen(false);
      toast.success('Servicio eliminado');
    }
  };

  const handleViewFile = useCallback((file: string | File) => {
    if (typeof file === 'string') {
      setPreviewAttachment({ url: file, name: getFileName(file) });
      return;
    }
    if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    const blobUrl = URL.createObjectURL(file);
    previewBlobRef.current = blobUrl;
    setPreviewAttachment({ url: blobUrl, name: file.name, size: file.size });
  }, []);

  const handleClosePreview = useCallback(() => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
    setPreviewAttachment(null);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50/50 font-sans text-slate-900 overflow-hidden">
      <main className="flex-1 flex flex-col h-full min-w-0 relative">

        <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/80 z-10 sticky top-0 shadow-sm">
          <div className="px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => navigateTo('menu')} className="p-2 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg border border-transparent hover:border-gray-200 transition-colors flex-shrink-0" title="Regresar al menú">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 flex items-center justify-center p-1.5 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-gray-100 shadow-sm">
                  <img src={labLogo} alt="AG Metrology Logo" className="h-8 sm:h-9 w-auto object-contain drop-shadow-sm" />
                </div>
                <div className="h-9 w-px bg-gray-200 hidden sm:block flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight truncate">Gestión de Servicios</h2>
                  <p className="text-xs text-gray-500 hidden sm:block mt-0.5">Calibraciones · Mantenimientos · Verificaciones</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-60 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Buscar servicio o cliente..."
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:border-blue-400 border rounded-xl outline-none transition-all text-sm"
                />
              </div>
              {canEdit && (
                <button
                  onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl font-semibold shadow-lg flex items-center gap-1.5 active:scale-95 transition-all whitespace-nowrap text-sm"
                >
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo</span>
                </button>
              )}
            </div>
          </div>

          <div className="px-4 sm:px-6 py-2.5 overflow-x-auto border-t border-gray-100 bg-gradient-to-r from-slate-50/80 via-gray-50/60 to-slate-50/80 flex items-center gap-3 scrollbar-hide">
            {[
              { label: 'Todos', value: 'todos', count: stats.total, color: 'gray' },
              { label: 'Pendientes', value: 'programado', count: stats.pendientes, color: 'blue' },
              { label: 'En Proceso', value: 'en_proceso', count: stats.proceso, color: 'amber' },
              { label: 'Críticos', value: 'critico_filter', count: stats.criticos, color: 'red' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value === 'critico_filter' ? filterStatus : f.value)}
                className={`flex flex-col items-start min-w-[88px] p-2.5 rounded-xl border transition-all ${filterStatus === f.value ? 'bg-white border-blue-400 shadow-md ring-1 ring-blue-100' : 'bg-white/90 border-gray-200 hover:border-blue-200 hover:shadow-sm shadow-sm'}`}
              >
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{f.label}</span>
                <span className={`text-lg font-black ${f.color === 'blue' ? 'text-blue-600' : f.color === 'amber' ? 'text-amber-600' : f.color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>{f.count}</span>
              </button>
            ))}

            <div className="h-8 w-px bg-gray-200 hidden sm:block" />

            {!isMobile && (
              <div className="flex bg-gray-200 p-1 rounded-lg">
                <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}><LayoutGrid className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}><ListIcon className="w-4 h-4" /></button>
              </div>
            )}

            {canEdit && (
              <button
                onClick={() => setShowOnlyMyTasks(!showOnlyMyTasks)}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showOnlyMyTasks ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                <User className="w-3.5 h-3.5" /> Mis asignaciones
              </button>
            )}
            {!canEdit && currentUserId && (
              <span className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <User className="w-3.5 h-3.5" /> Mis asignaciones
              </span>
            )}
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gradient-to-br from-slate-100/80 via-gray-50 to-slate-100/60">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3].map(i => <div key={i} className="h-64 bg-gray-200 rounded-2xl" />)}
            </div>
          ) : (
            <>
              {viewMode === 'kanban' && !isMobile && (
                <div className="flex gap-6 h-full overflow-x-auto pb-6 items-start">
                  {CONSTANTS.estados.map(col => {
                    const items = filteredServices.filter(s => s.estado === col.value);
                    return (
                      <div key={col.value} className="min-w-[320px] w-[320px] flex flex-col max-h-full">
                        <div className="flex items-center justify-between mb-3 px-1">
                          <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
                            <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                            {col.label}
                          </h3>
                          <span className="bg-white border border-gray-200 text-gray-500 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm">{items.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 pb-20 custom-scrollbar">
                          {items.map(service => (
                            <ServiceCard
                              key={service.id}
                              service={service}
                              users={usuarios}
                              variant="kanban"
                              canEdit={canEdit}
                              onClick={() => { setSelectedService(service); setIsDetailOpen(true); }}
                              onQuickAction={handleQuickStatus}
                            />
                          ))}
                          {items.length === 0 && (
                            <div className="h-28 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-xs bg-gray-50/50">
                              Sin servicios
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(viewMode === 'list' || isMobile) && (
                <div className="max-w-4xl mx-auto space-y-2.5 pb-24">
                  {filteredServices.length > 0 ? filteredServices.map(service => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      users={usuarios}
                      variant="list"
                      canEdit={canEdit}
                      onClick={() => { setSelectedService(service); setIsDetailOpen(true); }}
                      onQuickAction={handleQuickStatus}
                    />
                  )) : (
                    <div className="text-center py-20">
                      <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto flex items-center justify-center text-gray-400 mb-4"><Search className="w-8 h-8" /></div>
                      <h3 className="text-gray-900 font-bold">No se encontraron resultados</h3>
                      <p className="text-gray-400 text-sm mt-1">Intenta ajustar los filtros.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* MODALS */}
        <ServiceDetailModal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          service={selectedService}
          usuarios={usuarios}
          canEdit={canEdit}
          currentUser={currentUserData}
          onDelete={handleDelete}
          onEdit={(s: any) => { setIsDetailOpen(false); setSelectedService(s); setIsFormOpen(true); }}
          onViewFile={handleViewFile}
        />

        <ServiceFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          initialData={selectedService || INITIAL_FORM_STATE}
          onSubmit={handleSaveService}
          loading={processing}
          clientes={clientes}
          usuarios={usuarios}
        />

        {previewAttachment && (
          <AttachmentPreviewModal attachment={previewAttachment} onClose={handleClosePreview} />
        )}

        {needsTeamColorPicker && currentUserData && authUser?.uid && (
          <TeamColorPickerModal
            authUserId={authUser.uid}
            userName={currentUserData.name || currentUserData.nombre || ''}
            usuarios={usuarios}
            isAdmin={canEdit}
            onColorClaimed={(color) => {
              setLocalTeamColor(color);
              toast.success('Color de equipo guardado');
            }}
          />
        )}

        {canEdit && (
          <button
            onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
            className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}
      </main>
    </div>
  );
};

export default FridayServiciosScreen;