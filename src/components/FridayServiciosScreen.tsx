import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { 
  ArrowLeft, Plus, Calendar, Search, Eye, Edit3, Trash2, X, 
  CheckCircle2, RotateCcw, Play, AlertCircle, Clock,
  Briefcase, Settings, Zap, Paperclip, Users, Upload, 
  Building2, Mail, FileText, Info, 
  LayoutGrid, List as ListIcon, MapPin, User, MoreHorizontal, Download, MessageCircle, MoreVertical,
  Image as ImageIcon, File as FileIcon, AlertTriangle, Check, Loader2, ChevronDown, Phone
} from 'lucide-react';

import { 
  doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, 
  orderBy, serverTimestamp, getDocs, getDoc
} from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ==========================================
// TYPES
// ==========================================

interface Usuario {
  id: string;
  name?: string;
  nombre?: string;
  position?: string;
  puesto?: string;
  role?: string;
  photoUrl?: string;
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
  notas?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  ubicacion?: string;
}

// Tracks upload progress for each file
interface FileUploadState {
  file: File;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'done' | 'error';
  url?: string;
  preview?: string; // For images
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

const isImageFile = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);

const getFileName = (file: string | File) =>
  typeof file === 'string'
    ? decodeURIComponent(file.split('/').pop()?.split('?')[0] || 'Archivo')
    : file.name;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
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
  return (
    <div title={user?.name || user?.nombre} className={`${sizeClass} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0`}>
      {getInitials(user?.name || user?.nombre || '??')}
    </div>
  );
};

const PriorityBadge = ({ priority }: { priority: string }) => {
  const config = CONSTANTS.prioridades.find(p => p.value === priority) || CONSTANTS.prioridades[0];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

// ==========================================
// FILE THUMBNAIL - shows image previews or file type icon
// ==========================================

const FileThumbnail = ({ file, onView, onRemove }: { file: string | File, onView?: () => void, onRemove?: () => void }) => {
  const name = getFileName(file);
  const isImg = isImageFile(name);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    if (file instanceof File && isImg) {
      const url = URL.createObjectURL(file);
      setImgSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    if (typeof file === 'string' && isImg) {
      setImgSrc(file);
    }
  }, [file, isImg]);

  return (
    <div className="relative group flex flex-col rounded-xl border border-gray-200 overflow-hidden bg-white hover:border-blue-300 hover:shadow-md transition-all">
      {/* Preview area */}
      <div className="h-24 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer" onClick={onView}>
        {imgSrc ? (
          <img src={imgSrc} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <FileText className="w-8 h-8" />
            <span className="text-[10px] font-mono uppercase">{name.split('.').pop()}</span>
          </div>
        )}
        {onView && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Eye className="w-6 h-6 text-white drop-shadow" />
          </div>
        )}
      </div>
      {/* File name */}
      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
        <span className="text-[10px] text-gray-600 truncate flex-1 font-medium" title={name}>{name}</span>
        {onRemove && (
          <button onClick={onRemove} className="flex-shrink-0 w-5 h-5 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
        {onView && !onRemove && (
          <button onClick={onView} className="flex-shrink-0 text-blue-400 hover:text-blue-600">
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// ==========================================
// UPLOAD FILE ITEM - shows progress bar
// ==========================================

const UploadingFileItem = ({ state }: { state: FileUploadState }) => {
  const name = state.file.name;
  const isImg = isImageFile(name);

  return (
    <div className="flex items-center gap-3 p-3 bg-white border rounded-xl border-gray-200">
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {state.preview ? (
          <img src={state.preview} alt={name} className="w-full h-full object-cover" />
        ) : (
          <FileText className="w-5 h-5 text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{name}</p>
        <p className="text-[10px] text-gray-400">{formatFileSize(state.file.size)}</p>
        {state.status === 'uploading' && (
          <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex-shrink-0">
        {state.status === 'uploading' && (
          <span className="text-[10px] text-blue-500 font-bold">{state.progress}%</span>
        )}
        {state.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
        {state.status === 'error' && <AlertTriangle className="w-5 h-5 text-red-500" />}
        {state.status === 'pending' && <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />}
      </div>
    </div>
  );
};

// ==========================================
// SERVICE CARD
// ==========================================

const ServiceCard = ({ service, users, onClick, onQuickAction, variant = 'kanban' }: { service: Service, users: Usuario[], onClick: () => void, onQuickAction: (id: string, action: string) => void, variant?: 'kanban' | 'list' }) => {
  const tipoConfig = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const TipoIcon = tipoConfig?.icon || Settings;
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado) || CONSTANTS.estados[0];
  const assignedUsers = users.filter(u => Array.isArray(service.personas) && service.personas.includes(u.id));
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
      <div onClick={onClick} className="group bg-white rounded-xl border border-gray-200 p-3 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row gap-3 items-center relative">
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
            {service.archivos?.length > 0 && <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" /> {service.archivos.length}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-2 sm:pt-0">
          <div className="flex -space-x-2">
            {assignedUsers.length > 0 ? assignedUsers.slice(0, 3).map(u => <Avatar key={u.id} user={u} />) : (
              <span className="text-[10px] text-gray-400 italic">Sin asignar</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">{renderQuickButton()}</div>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400">
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && <QuickMenu />}
            </div>
          </div>
        </div>
        {showMenu && <div className="fixed inset-0 z-0" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />}
      </div>
    );
  }

  return (
    <div onClick={onClick} className="group bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer flex flex-col gap-3 relative overflow-visible">
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${statusConfig.dot}`} />
      <div className="flex justify-between items-start pl-2">
        <div className="flex flex-col gap-1">
          <PriorityBadge priority={service.prioridad} />
        </div>
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="text-gray-400 hover:text-blue-600 p-1">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {showMenu && <QuickMenu />}
        </div>
      </div>
      <div className="pl-2">
        <h4 className="font-bold text-gray-900 leading-snug mb-1 line-clamp-2 text-sm">{service.titulo}</h4>
        <p className="text-xs text-gray-500 flex items-center gap-1 mb-1"><Building2 className="w-3 h-3" /> {service.cliente}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDateRelative(service.fecha)} · {service.horaInicio || '--'}</p>
        {service.archivos?.length > 0 && (
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Paperclip className="w-3 h-3" /> {service.archivos.length} adjunto{service.archivos.length !== 1 ? 's' : ''}</p>
        )}
        <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-2">
          <div className="flex -space-x-2">
            {assignedUsers.length > 0 ? assignedUsers.slice(0, 3).map(u => <Avatar key={u.id} user={u} />) : (
              <span className="text-[10px] text-orange-500 bg-orange-50 px-2 py-0.5 rounded-md font-medium flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Sin asignar</span>
            )}
          </div>
          {renderQuickButton() || (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${statusConfig.bg} ${statusConfig.color}`}>{statusConfig.label}</span>
          )}
        </div>
      </div>
      {showMenu && <div className="fixed inset-0 z-0" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />}
    </div>
  );
};

// ==========================================
// SERVICE DETAIL MODAL
// ==========================================

const ServiceDetailModal = ({ isOpen, onClose, service, onEdit, onDelete, onViewFile, metrologos }: any) => {
  if (!isOpen || !service) return null;
  const tipoInfo = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado) || CONSTANTS.estados[0];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="relative bg-gray-50 px-6 py-5 border-b border-gray-200">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white rounded-full text-gray-500 hover:text-gray-900 shadow-sm"><X className="w-4 h-4" /></button>
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.color} border ${statusConfig.border}`}>
              <StatusIcon className="w-3.5 h-3.5" /> {statusConfig.label}
            </span>
            <PriorityBadge priority={service.prioridad} />
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
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white">
          {/* Client + Schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cliente</h3>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Building2 className="w-4 h-4" /></div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{service.cliente}</p>
                  {service.ubicacion && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{service.ubicacion}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                {service.telefono && (
                  <a href={`https://wa.me/${service.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                )}
                {service.email && (
                  <a href={`mailto:${service.email}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-50 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors">
                    <Mail className="w-3.5 h-3.5" /> Correo
                  </a>
                )}
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
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Equipo Técnico</h3>
            <div className="flex flex-wrap gap-2">
              {Array.isArray(service.personas) && service.personas.length > 0 ? service.personas.map((id: string) => {
                const m = metrologos.find((u: any) => u.id === id);
                return (
                  <div key={id} className="flex items-center gap-2 pr-4 pl-1 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm">
                    <Avatar user={m} />
                    <div>
                      <p className="text-xs font-bold text-gray-700">{m?.name || m?.nombre || 'Usuario'}</p>
                      <p className="text-[10px] text-gray-400">{m?.position || m?.puesto || 'Técnico'}</p>
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

          {/* Description */}
          {service.descripcion && (
            <div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Descripción</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border border-gray-100">{service.descripcion}</p>
            </div>
          )}

          {/* Files - improved thumbnails */}
          {service.archivos?.length > 0 && (
            <div>
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
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
          <button onClick={() => onDelete(service.id)} className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Eliminar">
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={() => onEdit(service)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-medium shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2">
            <Edit3 className="w-4 h-4" /> Editar / Gestionar
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// SERVICE FORM MODAL — REDESIGNED
// Improvements:
//   1. Single-page layout (no tabs) to reduce navigation steps
//   2. File uploads with real-time progress + image previews
//   3. Personnel assignment as prominent card grid (not buried in tab)
//   4. Step indicator so user knows where they are
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

  // Sorted alphabetically
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

  // Close on outside click
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
      {/* Trigger input */}
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

      {/* Selected badge */}
      {value && !open && (
        <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
          <Building2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-800 truncate">{selectedLabel}</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto flex-shrink-0" />
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          style={{ maxHeight: '280px' }}
        >
          {/* Count indicator */}
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-medium">
              {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
              {query && ` para "${query}"`}
            </span>
            {query && (
              <button onClick={() => setQuery('')} className="text-[10px] text-blue-500 hover:underline">Limpiar</button>
            )}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '236px' }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                <Search className="w-6 h-6 mx-auto mb-1 opacity-40" />
                Sin resultados para "{query}"
              </div>
            ) : (
              filtered.map(c => {
                const name = c.nombre || c.razonSocial;
                const isSelected = c.id === value;
                // Highlight matching text
                const queryLow = query.toLowerCase();
                const nameLow = name.toLowerCase();
                const idx = queryLow ? nameLow.indexOf(queryLow) : -1;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => handleSelect(c.id)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Building2 className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`} />
                    <span className="flex-1 truncate">
                      {idx >= 0 && query ? (
                        <>
                          {name.slice(0, idx)}
                          <mark className="bg-yellow-200 text-gray-900 rounded px-0.5">{name.slice(idx, idx + query.length)}</mark>
                          {name.slice(idx + query.length)}
                        </>
                      ) : name}
                    </span>
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

const ServiceFormModal = ({ isOpen, onClose, initialData, onSubmit, loading, clientes, metrologos }: any) => {
  const [formData, setFormData] = useState(initialData);
  const [activeStep, setActiveStep] = useState(0);
  const [uploadStates, setUploadStates] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFormData(initialData);
    setActiveStep(0);
    setUploadStates([]);
  }, [initialData, isOpen]);

  const handleChange = (field: string, value: any) =>
    setFormData((prev: any) => ({ ...prev, [field]: value }));

  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find((c: any) => c.id === clienteId);
    if (cliente) {
      // 🔍 DEBUG TEMPORAL: muestra los campos exactos del cliente en Firestore
      console.log('[Cliente - campos disponibles]', JSON.stringify(cliente, null, 2));
      setFormData((prev: any) => ({
        ...prev, clienteId, cliente: cliente.nombre || cliente.razonSocial,
        contacto: cliente.contactoPrincipal || cliente.contacto || cliente.nombreContacto || cliente.nombre_contacto || '',
        telefono: cliente.telefono || cliente.phone || cliente.tel || '',
        email: cliente.email || '', ubicacion: cliente.direccion || ''
      }));
    }
  };

  // ---- FILE HANDLING ----
  // Files are staged locally with preview & progress, then uploaded on submit.
  // This gives instant visual feedback without waiting for Firebase.

  const addFiles = useCallback((files: File[]) => {
    const newStates: FileUploadState[] = files.map(file => {
      const isImg = isImageFile(file.name);
      return {
        file,
        progress: 0,
        status: 'pending',
        preview: isImg ? URL.createObjectURL(file) : undefined,
      };
    });
    setUploadStates(prev => [...prev, ...newStates]);
    setFormData((prev: any) => ({
      ...prev,
      archivos: [...(Array.isArray(prev.archivos) ? prev.archivos : []), ...files],
    }));
  }, []);

  const removeFile = (index: number) => {
    setUploadStates(prev => {
      const st = prev[index];
      if (st?.preview) URL.revokeObjectURL(st.preview);
      return prev.filter((_, i) => i !== index);
    });
    // remove from formData.archivos — only newly added files are tracked here
    const newFiles = formData.archivos.filter((_: any, i: number) => i !== index);
    handleChange('archivos', newFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  const existingUrls = (formData.archivos || []).filter((f: any) => typeof f === 'string');
  const pendingFiles = (formData.archivos || []).filter((f: any) => f instanceof File);

  // Validation summary per step
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

  if (!isOpen) return null;

  const personasArray = Array.isArray(formData.personas) ? formData.personas : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ---- Header ---- */}
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-white flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{formData.id ? 'Editar Servicio' : 'Nuevo Servicio'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{formData.id ? `#${formData.id.slice(-6).toUpperCase()}` : 'Completa los campos y guarda'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        {/* ---- Step indicators ---- */}
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
                {/* Validation dot */}
                {!stepValid[i] && i === 0 && formData.titulo?.trim() === '' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 absolute top-2 right-2" />
                )}
              </button>
            );
          })}
        </div>

        {/* ---- Body ---- */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto p-5 bg-white">

          {/* STEP 0: General */}
          {activeStep === 0 && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Título del Servicio <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={e => handleChange('titulo', e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-sm"
                  placeholder="Ej. Calibración Balanza Analítica"
                  autoFocus
                />
              </div>

              {/* Tipo */}
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

              {/* Estado + Prioridad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Estado</label>
                  <div className="relative">
                    <select
                      value={formData.estado}
                      onChange={e => handleChange('estado', e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none appearance-none text-sm pr-8"
                    >
                      {CONSTANTS.estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 mb-1 block">Prioridad</label>
                  <div className="relative">
                    <select
                      value={formData.prioridad}
                      onChange={e => handleChange('prioridad', e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none appearance-none text-sm pr-8"
                    >
                      {CONSTANTS.prioridades.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Fecha + Horas */}
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

              {/* Descripción */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Descripción</label>
                <textarea rows={3} value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none resize-none text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" placeholder="Detalles del trabajo a realizar..." />
              </div>
            </div>
          )}

          {/* STEP 1: Cliente */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1.5 block">
                  Seleccionar Cliente <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-2">— ordenados A–Z</span>
                </label>
                <ClienteCombobox
                  clientes={clientes}
                  value={formData.clienteId}
                  onChange={handleClienteChange}
                />
              </div>

              {formData.clienteId && (
                <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-xl">
                  <p className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">Datos de contacto</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block flex items-center gap-1"><User className="w-3 h-3" /> Contacto</label>
                      <input type="text" value={formData.contacto} onChange={e => handleChange('contacto', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Nombre del contacto" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block flex items-center gap-1"><Phone className="w-3 h-3" /> Teléfono</label>
                      <input type="tel" value={formData.telefono} onChange={e => handleChange('telefono', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="55 1234 5678" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
                      <input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="correo@empresa.com" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block flex items-center gap-1"><MapPin className="w-3 h-3" /> Dirección</label>
                      <input type="text" value={formData.ubicacion} onChange={e => handleChange('ubicacion', e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" placeholder="Calle, Ciudad" />
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
                  <p className="text-xs text-gray-400 mt-0.5">Selecciona uno o más técnicos para este servicio</p>
                </div>
                {personasArray.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                    {personasArray.length} seleccionado{personasArray.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Selected summary */}
              {personasArray.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  {personasArray.map((id: string) => {
                    const m = metrologos.find((u: any) => u.id === id);
                    return (
                      <div key={id} className="flex items-center gap-1.5 bg-white border border-blue-200 rounded-full pl-1 pr-2 py-0.5">
                        <Avatar user={m} size="sm" />
                        <span className="text-xs font-medium text-gray-700">{m?.name || m?.nombre || 'Usuario'}</span>
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

              {/* Personnel list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {metrologos.length > 0 ? metrologos.map((m: any) => {
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
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${selected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'}`}
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

              {/* Private notes */}
              <div>
                <label className="text-xs font-bold text-gray-600 mb-1 block">Notas privadas del equipo</label>
                <textarea
                  rows={3}
                  value={formData.notas}
                  onChange={e => handleChange('notas', e.target.value)}
                  className="w-full px-4 py-2.5 bg-yellow-50/50 border border-yellow-200 rounded-xl outline-none resize-none text-sm focus:ring-2 focus:ring-yellow-300 transition-all"
                  placeholder="Notas visibles solo para el equipo interno..."
                />
              </div>
            </div>
          )}

          {/* STEP 3: Files — with drag & drop + image thumbnails + per-file progress */}
          {activeStep === 3 && (
            <div className="space-y-4">
              {/* Drop zone */}
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
                <p className="text-xs text-gray-400 mt-1">Imágenes, PDFs, documentos — cualquier formato</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); }}
                />
              </div>

              {/* Existing URLs (already saved) */}
              {existingUrls.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Archivos guardados</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {existingUrls.map((url: string, i: number) => (
                      <FileThumbnail
                        key={`existing-${i}`}
                        file={url}
                        onRemove={() => handleChange('archivos', formData.archivos.filter((f: any) => f !== url))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Pending new files */}
              {pendingFiles.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nuevos archivos (se subirán al guardar)</p>
                  <div className="space-y-2">
                    {pendingFiles.map((file: File, i: number) => {
                      const isImg = isImageFile(file.name);
                      const preview = isImg ? URL.createObjectURL(file) : undefined;
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                          <div className="w-10 h-10 rounded-lg bg-white border flex items-center justify-center overflow-hidden flex-shrink-0">
                            {isImg && preview ? (
                              <img src={preview} alt={file.name} className="w-full h-full object-cover" />
                            ) : (
                              <FileText className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">{file.name}</p>
                            <p className="text-[10px] text-gray-400">{formatFileSize(file.size)}</p>
                          </div>
                          <button
                            onClick={() => handleChange('archivos', formData.archivos.filter((f: any) => f !== file))}
                            className="flex-shrink-0 w-7 h-7 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-blue-500 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Los archivos se subirán cuando guardes el servicio
                  </p>
                </div>
              )}

              {existingUrls.length === 0 && pendingFiles.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-sm">
                  No hay archivos adjuntos aún.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Footer navigation ---- */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors text-sm"
          >
            Cancelar
          </button>
          
          {activeStep > 0 && (
            <button
              onClick={goPrev}
              className="px-4 py-2 text-gray-700 font-medium bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors text-sm"
            >
              ← Anterior
            </button>
          )}

          <div className="flex-1" />

          {/* Step dots */}
          <div className="flex gap-1 items-center">
            {FORM_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`rounded-full transition-all ${i === activeStep ? 'w-4 h-2 bg-blue-600' : i < activeStep ? 'w-2 h-2 bg-emerald-400' : 'w-2 h-2 bg-gray-300'}`}
              />
            ))}
          </div>

          <div className="flex-1" />

          {activeStep < FORM_STEPS.length - 1 ? (
            <button
              onClick={goNext}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-200 text-sm transition-all active:scale-95"
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl shadow-lg shadow-gray-200 flex items-center gap-2 transition-all disabled:opacity-70 active:scale-95 text-sm"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> {formData.id ? 'Guardar Cambios' : 'Crear Servicio'}</>
              )}
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
  const [metrologos, setMetrologos] = useState<Usuario[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);
  const [processing, setProcessing] = useState(false);
  const currentUserId = localStorage.getItem('usuario_id');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  const initialFormState = {
    titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media',
    estado: 'programado', fecha: '', horaInicio: '', horaFin: '',
    ubicacion: '', clienteId: '', cliente: '', contacto: '', telefono: '',
    email: '', personas: [], archivos: [], notas: ''
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setViewMode('list');
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const loadData = async () => {
      try {
        const q = query(collection(db, 'servicios'), orderBy('fechaCreacion', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
          setServicios(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
          setLoading(false);
        });

        const [usersSnap, clientsSnap] = await Promise.all([
          getDocs(collection(db, 'usuarios')),
          getDocs(collection(db, 'clientes'))
        ]);

        const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsuarios(usersData);
        setMetrologos(usersData.filter((u: any) => {
          const r = (u.position || u.puesto || u.role || '').toLowerCase();
          const allowed = ['metrologo', 'metrólogo', 'tecnico', 'técnico', 'ingeniero', 'supervisor'];
          return allowed.some(k => r.includes(k)) || r === '';
        }));
        setClientes(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        return () => unsub();
      } catch (error) {
        console.error(error);
        toast.error('Error conectando con la base de datos');
        setLoading(false);
      }
    };

    loadData();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filteredServices = useMemo(() => servicios.filter(s => {
    const matchSearch = !filterText || s.titulo.toLowerCase().includes(filterText.toLowerCase()) || s.cliente.toLowerCase().includes(filterText.toLowerCase());
    const matchStatus = filterStatus === 'todos' || s.estado === filterStatus;
    const matchMyTasks = !showOnlyMyTasks || (currentUserId && Array.isArray(s.personas) && s.personas.includes(currentUserId));
    return matchSearch && matchStatus && matchMyTasks;
  }), [servicios, filterText, filterStatus, showOnlyMyTasks, currentUserId]);

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

  // Upload with real-time progress using uploadBytesResumable
  // ─── Envía notificación FCM a una lista de tokens ────────────────────────────
  // Llama directamente a la API REST de FCM (no necesita Cloud Functions).
  // El Server Key se guarda en una variable de entorno de Vite.
  const sendFcmNotifications = async (
    tokens: string[],
    serviceId: string,
    titulo: string,
    cliente: string,
    fecha: string,
    horaInicio: string,
    tipo: string,
    isNew: boolean,
  ) => {
    if (tokens.length === 0) return;

    const serverKey = import.meta.env.VITE_FCM_SERVER_KEY as string | undefined;
    if (!serverKey) {
      console.warn('[FCM] VITE_FCM_SERVER_KEY no definida — notificaciones push desactivadas');
      return;
    }

    const tipoLabel =
      tipo === 'calibracion'   ? 'Calibración'  :
      tipo === 'mantenimiento' ? 'Mantenimiento':
      tipo === 'verificacion'  ? 'Verificación' :
      tipo === 'reparacion'    ? 'Reparación'   :
      tipo === 'inspeccion'    ? 'Inspección'   : tipo;

    const notifTitle = isNew
      ? '🗓️ Nueva asignación de servicio'
      : '✏️ Servicio actualizado';

    const notifBody = `${titulo}`;

    // Mandamos hasta 500 tokens por petición (límite de FCM legacy API)
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

    await Promise.allSettled(
      chunks.map(chunk =>
        fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${serverKey}`,
          },
          body: JSON.stringify({
            registration_ids: chunk,
            // "notification" hace que el SO muestre la notificación aunque la app esté cerrada.
            // "data" está disponible en el SW y en la app para personalizar la UI.
            notification: {
              title: notifTitle,
              body:  notifBody,
              icon:  '/icons/notif-info.png',
              // Android: imagen grande en la notificación expandida (opcional)
              // image: 'https://tu-dominio.com/og-image.png',
            },
            data: {
              type:       'asignacion',
              serviceId,
              title:      notifTitle,
              body:       notifBody,
              cliente,
              fecha,
              horaInicio: horaInicio || '',
              tipo:       tipoLabel,
              url:        `/servicios`,
              timestamp:  String(Date.now()),
            },
            android: {
              priority: 'high',
              notification: {
                // Color del ícono en la barra de estado (hex sin #)
                color:         '#1D4ED8',
                // Canal de notificaciones de Android 8+ — créalo en tu app Capacitor
                channel_id:    'ag_servicios',
                // La notificación no desaparece sola en pantalla de bloqueo
                sticky:        false,
                // Sonido y vibración del canal
                default_sound: true,
                default_vibrate_timings: true,
              },
            },
          }),
        }).then(async (res) => {
          const json = await res.json();
          if (json.failure > 0) {
            console.warn('[FCM] Algunos tokens fallaron:', json.results?.filter((r: any) => r.error));
          }
        })
      )
    );
  };

  // ─── Obtiene todos los FCM tokens activos de un array de userIds ──────────
  const getFcmTokensForUsers = async (userIds: string[]): Promise<string[]> => {
    const tokens: string[] = [];
    await Promise.allSettled(
      userIds.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'usuarios', uid));
          if (!snap.exists()) return;
          const userData = snap.data() as any;

          // Soporte para campo antiguo (string) y nuevo (mapa { token: true })
          if (userData.fcmTokens && typeof userData.fcmTokens === 'object') {
            Object.keys(userData.fcmTokens).forEach(t => {
              if (t && !tokens.includes(t)) tokens.push(t);
            });
          } else if (userData.fcmToken && typeof userData.fcmToken === 'string') {
            if (!tokens.includes(userData.fcmToken)) tokens.push(userData.fcmToken);
          }
        } catch (err) {
          console.warn(`[FCM] Error obteniendo token de usuario ${uid}:`, err);
        }
      })
    );
    return tokens;
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
        actualizadoPor: currentUserId || 'unknown'
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
          creadoPor: currentUserId || 'unknown'
        });
        savedServiceId = docRef.id;
        toast.success('Servicio creado ✓');
      }

      // ── Notificaciones push a los asignados ──────────────────────────────
      // Determinamos a quién notificar:
      //   • Servicio nuevo  → todos los asignados
      //   • Edición         → solo los recién agregados (para no saturar)
      const nuevasPersonas: string[] = Array.isArray(data.personas) ? data.personas : [];

      let personasANotificar: string[] = [];
      if (isNew) {
        // Notificar a todos los asignados, excepto al creador (ya sabe)
        personasANotificar = nuevasPersonas.filter(id => id !== currentUserId);
      } else {
        // Buscar el servicio anterior para detectar asignados nuevos
        const anterior = servicios.find(s => s.id === data.id);
        const anterioresIds: string[] = Array.isArray(anterior?.personas) ? anterior.personas : [];
        // Solo notificar a los que NO estaban antes
        personasANotificar = nuevasPersonas.filter(
          id => id !== currentUserId && !anterioresIds.includes(id)
        );
      }

      if (personasANotificar.length > 0) {
        const tokens = await getFcmTokensForUsers(personasANotificar);
        if (tokens.length > 0) {
          await sendFcmNotifications(
            tokens,
            savedServiceId,
            data.titulo,
            data.cliente || '',
            data.fecha   || '',
            data.horaInicio || '',
            data.tipo    || '',
            isNew,
          );
        }
      }
      // ────────────────────────────────────────────────────────────────────

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

  return (
    <div className="flex h-screen bg-gray-50/50 font-sans text-slate-900 overflow-hidden">
      <main className="flex-1 flex flex-col h-full min-w-0 relative">

        {/* HEADER */}
        <header className="bg-white border-b border-gray-200 z-10 sticky top-0 shadow-sm">
          <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => navigateTo('menu')} className="p-2 -ml-1 text-gray-500 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Gestión de Servicios</h2>
                <p className="text-xs text-gray-400 hidden sm:block">Calibraciones · Mantenimientos · Verificaciones</p>
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
              <button
                onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
                className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl font-semibold shadow-lg flex items-center gap-1.5 active:scale-95 transition-all whitespace-nowrap text-sm"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo</span>
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="px-4 sm:px-6 py-2 overflow-x-auto border-t border-gray-100 bg-gray-50/60 flex items-center gap-3 scrollbar-hide">
            {[
              { label: 'Todos', value: 'todos', count: stats.total, color: 'gray' },
              { label: 'Pendientes', value: 'programado', count: stats.pendientes, color: 'blue' },
              { label: 'En Proceso', value: 'en_proceso', count: stats.proceso, color: 'amber' },
              { label: 'Críticos', value: 'critico_filter', count: stats.criticos, color: 'red' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value === 'critico_filter' ? filterStatus : f.value)}
                className={`flex flex-col items-start min-w-[88px] p-2.5 rounded-xl border transition-all ${filterStatus === f.value ? 'bg-white border-blue-400 shadow-md' : 'bg-white border-gray-200 hover:border-blue-200'}`}
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

            <button
              onClick={() => setShowOnlyMyTasks(!showOnlyMyTasks)}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showOnlyMyTasks ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
            >
              <User className="w-3.5 h-3.5" /> Mis asignaciones
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-100/50">
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
                          <span className="bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-md text-xs font-bold shadow-sm">{items.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 pb-20">
                          {items.map(service => (
                            <ServiceCard
                              key={service.id}
                              service={service}
                              users={usuarios}
                              variant="kanban"
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
          metrologos={metrologos}
          onDelete={handleDelete}
          onEdit={(s: any) => { setIsDetailOpen(false); setSelectedService(s); setIsFormOpen(true); }}
          onViewFile={(f: string) => setViewingFile(f)}
        />

        <ServiceFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          initialData={selectedService || initialFormState}
          onSubmit={handleSaveService}
          loading={processing}
          clientes={clientes}
          metrologos={metrologos}
        />

        {/* File viewer */}
        {viewingFile && (
          <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in">
            <div className="flex justify-between items-center p-4 text-white bg-black/50">
              <span className="font-medium truncate flex-1 text-sm">{decodeURIComponent(viewingFile.split('/').pop()?.split('?')[0] || '')}</span>
              <div className="flex gap-3 ml-4">
                <a href={viewingFile} download target="_blank" rel="noreferrer" className="p-2 hover:bg-white/20 rounded-full transition-colors"><Download className="w-5 h-5" /></a>
                <button onClick={() => setViewingFile(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>
            {isImageFile(viewingFile) ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <img src={viewingFile} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl" />
              </div>
            ) : (
              <iframe src={viewingFile} className="flex-1 bg-white" title="Doc Viewer" />
            )}
          </div>
        )}

        {/* FAB for mobile */}
        <button
          onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
          className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      </main>
    </div>
  );
};

export default FridayServiciosScreen;