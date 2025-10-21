import React, { useEffect, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import SidebarFriday from './SidebarFriday';
// Importaciones de react-pdf se mantienen, pero su uso se refina
import { Document, Page, pdfjs, OnDocumentLoadSuccess } from 'react-pdf'; 
import { 
  ArrowLeft, Plus, Calendar, Bell, FileText, FileUp, X, Check, Repeat, 
  Download, Trash2, XCircle, Search, Filter, Eye, Edit3, Zap, Clock, 
  User, CheckCircle2, RotateCcw, Loader2, Maximize, Minimize, ExternalLink, 
  ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Send, MessageCircle, 
  Users, Paperclip, FileSpreadsheet, AlertCircle, CheckCheck, Archive, 
  Star, Tag, Calendar as CalendarIcon, Activity, Briefcase, Settings, 
  MoreVertical, Copy, Share, Pin, Network, Move, Save, Upload, MapPin,
  Building2, Phone, Mail, Timer, UserCheck, ClockIcon, Play, Pause,
  FileImage, FileVideo, FolderOpen, AlertTriangle, Info, Home, Menu, FileCode, CheckSquare
} from 'lucide-react';
import { 
  doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, 
  orderBy, serverTimestamp, where, getDocs, getDoc 
} from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ====================================================================
// TIPOS DE DATOS Y CONFIGURACIÓN
// ====================================================================

// Definición de tipos para mayor claridad y evitar errores de tipado
interface Servicio {
    id: string;
    titulo: string;
    descripcion: string;
    tipo: string;
    prioridad: string;
    estado: string;
    fecha: string; // YYYY-MM-DD
    horaInicio: string;
    horaFin: string;
    ubicacion: string;
    clienteId: string;
    cliente: string;
    contacto: string;
    telefono: string;
    email: string;
    personas: string[]; // IDs de metrólogos
    archivos: string[]; // URLs de archivos (importante para persistencia)
    notas: string;
    fechaCreacion: any; 
    creadoPor: string;
    creadoPorNombre: string;
    personasNombres: string[];
    ultimaActualizacion: any;
    [key: string]: any;
}

// Interfaz para el estado del formulario que maneja archivos locales (File[])
interface NuevoServicioForm extends Omit<Servicio, 'id' | 'archivos' | 'fechaCreacion' | 'creadoPor' | 'creadoPorNombre' | 'personasNombres' | 'ultimaActualizacion'> {
    archivos: File[]; 
}

// Configuración y Worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const pdfOptions = {
  cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
  withCredentials: false,
  httpHeaders: {}
};

// Hook para detectar dispositivos móviles (ajustado a 1024px para mejor responsive)
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkIsMobile = () => { setIsMobile(window.innerWidth < 1024); }; 
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);
  return isMobile;
};

// Datos de usuario
const CURRENT_USER_ID = localStorage.getItem('usuario_id') || 'usuario_123';
const getCurrentUserName = () => {
  return localStorage.getItem('usuario.nombre') || localStorage.getItem('usuario_nombre') ||
         localStorage.getItem('user_name') || localStorage.getItem('nombre') ||
         sessionStorage.getItem('usuario.nombre') || sessionStorage.getItem('user_name') ||
         'Usuario Actual';
};

const CURRENT_USER_NAME = getCurrentUserName();

// Estados, Prioridades y Tipos de Servicio (con `progress` para la barra UX)
const estados = [
  { value: 'programado', label: 'Programado', color: 'text-blue-500', bgColor: 'bg-blue-50', border: 'border-blue-200', icon: Calendar, gradient: 'from-blue-500/20 to-blue-600/5', description: 'Servicio planificado, pendiente de inicio', progress: 25 },
  { value: 'en_proceso', label: 'En Proceso', color: 'text-emerald-500', bgColor: 'bg-emerald-50', border: 'border-emerald-200', icon: Play, gradient: 'from-emerald-500/20 to-emerald-600/5', description: 'Servicio en ejecución activa', progress: 50 },
  { value: 'finalizado', label: 'Finalizado', color: 'text-purple-500', bgColor: 'bg-purple-50', border: 'border-purple-200', icon: CheckCircle2, gradient: 'from-purple-500/20 to-purple-600/5', description: 'Servicio completado exitosamente', progress: 100 },
  { value: 'reprogramacion', label: 'Reprogramación', color: 'text-amber-500', bgColor: 'bg-amber-50', border: 'border-amber-200', icon: RotateCcw, gradient: 'from-amber-500/20 to-amber-600/5', description: 'Servicio que requiere nueva programación', progress: 10 }
];

const prioridades = [
  { value: 'baja', label: 'Baja', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: Info },
  { value: 'media', label: 'Media', color: 'text-blue-500', bgColor: 'bg-blue-100', icon: Clock },
  { value: 'alta', label: 'Alta', color: 'text-amber-500', bgColor: 'bg-amber-100', icon: AlertTriangle },
  { value: 'critica', label: 'Crítica', color: 'text-red-500', bgColor: 'bg-red-100', icon: AlertCircle }
];

const tiposServicio = [
  { value: 'calibracion', label: 'Calibración', icon: Settings },
  { value: 'mantenimiento', label: 'Mantenimiento', icon: Briefcase },
  { value: 'verificacion', label: 'Verificación', icon: CheckSquare },
  { value: 'reparacion', label: 'Reparación', icon: Zap },
  { value: 'inspeccion', label: 'Inspección', icon: Eye }
];

// Tipos de archivo para la vista previa
const tiposArchivo = {
  pdf: { icon: FileText, color: 'text-red-500', label: 'PDF', category: 'document' },
  doc: { icon: FileText, color: 'text-blue-500', label: 'Word', category: 'document' },
  docx: { icon: FileText, color: 'text-blue-500', label: 'Word', category: 'document' },
  xls: { icon: FileSpreadsheet, color: 'text-green-500', label: 'Excel', category: 'spreadsheet' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-500', label: 'Excel', category: 'spreadsheet' },
  txt: { icon: FileCode, color: 'text-gray-600', label: 'Texto', category: 'document' },
  csv: { icon: FileSpreadsheet, color: 'text-green-600', label: 'CSV', category: 'spreadsheet' },
  png: { icon: FileImage, color: 'text-purple-500', label: 'PNG', category: 'image' },
  jpg: { icon: FileImage, color: 'text-purple-500', label: 'JPG', category: 'image' },
  jpeg: { icon: FileImage, color: 'text-purple-500', label: 'JPEG', category: 'image' },
  gif: { icon: FileImage, color: 'text-purple-500', label: 'GIF', category: 'image' },
  webp: { icon: FileImage, color: 'text-purple-500', label: 'WebP', category: 'image' },
  svg: { icon: FileImage, color: 'text-purple-500', label: 'SVG', category: 'image' },
  mp4: { icon: FileVideo, color: 'text-indigo-500', label: 'MP4', category: 'video' },
  avi: { icon: FileVideo, color: 'text-indigo-500', label: 'AVI', category: 'video' },
  mov: { icon: FileVideo, color: 'text-indigo-500', label: 'MOV', category: 'video' },
  default: { icon: FileText, color: 'text-gray-500', label: 'Archivo', category: 'other' }
};

// ====================================================================
// UTILIDADES DE ARCHIVOS
// ====================================================================

const extraerNombreArchivo = (url: string): string => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const matches = decodedUrl.match(/\/([^\/\?]+)(\?|$)/);
    if (matches && matches[1]) {
      let fileName = matches[1];
      const timestampRegex = /^\d+_/;
      fileName = fileName.replace(timestampRegex, '');
      // Truncar para la UI
      return fileName.length > 50 ? fileName.substring(0, 47) + '...' : fileName; 
    }
    return url.split('/').pop()?.split('?')[0] || 'Archivo';
  } catch (error) {
    console.error('Error al extraer nombre de archivo:', error);
    return 'Archivo';
  }
};

const obtenerExtensionArchivo = (fileNameOrUrl: string): string => {
  const cleanString = fileNameOrUrl.split(/[#?]/)[0]; 
  return cleanString.split('.').pop()?.toLowerCase() || '';
};

const crearUrlAcceso = async (url: string): Promise<string> => {
  try {
    if (url.includes('firebasestorage.googleapis.com')) {
      const pathMatch = url.match(/\/o\/(.+?)\?/);
      if (pathMatch) {
        const filePath = decodeURIComponent(pathMatch[1]);
        const fileRef = ref(storage, filePath);
        // Obtener una URL de descarga fresca para asegurar que los tokens no expiren
        const newUrl = await getDownloadURL(fileRef);
        return newUrl;
      }
    }
    return url;
  } catch (error) {
    console.error('Error al crear URL de acceso:', error);
    return url;
  }
};

// ====================================================================
// COMPONENTES REUTILIZABLES
// ====================================================================

const EstadoProgress = ({ estado }: { estado: string }) => {
    const estadoInfo = estados.find(e => e.value === estado);
    if (!estadoInfo) return null;

    return (
        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
            <div 
                className={`h-full ${estadoInfo.color.replace('text-', 'bg-')}`} 
                style={{ width: `${estadoInfo.progress}%` }}
                title={`${estadoInfo.progress}% de progreso`}
            />
        </div>
    );
};

// Memoization para mejorar el rendimiento de las insignias
const EstadoBadge = React.memo(({ estado, compact = false }: { estado: string; compact?: boolean }) => {
  const estadoInfo = estados.find(e => e.value === estado);
  if (!estadoInfo) return null;
  
  const IconComponent = estadoInfo.icon;
  
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${estadoInfo.bgColor} ${estadoInfo.color} border ${estadoInfo.border}`}>
        <IconComponent className="h-3 w-3" />
        <span className="hidden sm:inline">{estadoInfo.label}</span>
      </div>
    );
  }
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${estadoInfo.bgColor} ${estadoInfo.color} border ${estadoInfo.border}`}>
      <IconComponent className="h-4 w-4" />
      {estadoInfo.label}
    </div>
  );
});

const PrioridadBadge = React.memo(({ prioridad, compact = false }: { prioridad: string; compact?: boolean }) => {
  const prioridadInfo = prioridades.find(p => p.value === prioridad);
  if (!prioridadInfo) return null;
  
  const IconComponent = prioridadInfo.icon;
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${prioridadInfo.bgColor} ${prioridadInfo.color}`} title={`Prioridad: ${prioridadInfo.label}`}>
      <IconComponent className="h-3 w-3" />
      <span className={compact ? "hidden lg:inline" : ""}>{prioridadInfo.label}</span>
    </div>
  );
});

// Componente de Card Kanban Mejorado
const KanbanCard = ({ servicio, onClick }: { servicio: Servicio; onClick: () => void }) => {
    const prioridadInfo = prioridades.find(p => p.value === servicio.prioridad);
    const tipoInfo = tiposServicio.find(t => t.value === servicio.tipo);
    const estadoInfo = estados.find(e => e.value === servicio.estado);

    return (
        <div
            onClick={onClick}
            className={`p-4 bg-white hover:bg-gray-50 rounded-lg cursor-pointer transition-all border border-gray-200 shadow-sm relative overflow-hidden group`}
        >
            {/* Banda de prioridad en el borde */}
            {prioridadInfo && (
                <div 
                    className={`absolute top-0 left-0 w-1 h-full ${prioridadInfo.color.replace('text-', 'bg-')}`} 
                    title={prioridadInfo.label}
                />
            )}
            
            <div className="pl-2"> {/* Espacio para la banda de prioridad */}
                <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
                        {servicio.titulo}
                    </h4>
                    <PrioridadBadge prioridad={servicio.prioridad} compact />
                </div>
                
                <p className="text-xs text-gray-500 line-clamp-3 mb-3 h-10">
                    {servicio.descripcion || 'Sin descripción.'}
                </p>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                        {/* Tipo de Servicio */}
                        {tipoInfo && (
                            <div className="flex items-center gap-1" title={`Tipo: ${tipoInfo.label}`}>
                                {tipoInfo.icon && <tipoInfo.icon className="h-3 w-3 text-gray-400" />}
                                <span className="text-xs text-gray-500 hidden sm:inline">{tipoInfo.label}</span>
                            </div>
                        )}
                        {/* Metrólogos asignados */}
                        {servicio.personas && servicio.personas.length > 0 && (
                            <div className="flex items-center gap-1" title={`${servicio.personas.length} Metrólogos asignados`}>
                                <Users className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                    {servicio.personas.length}
                                </span>
                            </div>
                        )}
                        {/* Archivos adjuntos */}
                        {servicio.archivos && servicio.archivos.length > 0 && (
                            <div className="flex items-center gap-1" title={`${servicio.archivos.length} Archivos`}>
                                <Paperclip className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                    {servicio.archivos.length}
                                </span>
                            </div>
                        )}
                    </div>
                    <span className="text-xs font-medium text-gray-500">
                        {servicio.fecha ? new Date(servicio.fecha).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) : 'Sin fecha'}
                    </span>
                </div>
            </div>
            {estadoInfo && <EstadoProgress estado={estadoInfo.value} />}
        </div>
    );
};


// Componente de vista previa de archivos mejorado
const FilePreview: React.FC<{ 
  file: File | string; 
  onRemove?: () => void; 
  onView: (url: string) => void; 
  showActions?: boolean;
  compact?: boolean;
  isUrl?: boolean;
}> = React.memo(({ file, onRemove, onView, showActions = true, compact = false, isUrl = false }) => {
  const fileUrlOrName = typeof file === 'string' ? file : file.name;
  const fileNameDisplay = isUrl ? extraerNombreArchivo(fileUrlOrName) : fileUrlOrName;
  const extension = obtenerExtensionArchivo(fileUrlOrName);

  const tipoArchivo = tiposArchivo[extension as keyof typeof tiposArchivo] || tiposArchivo.default;
  const IconComponent = tipoArchivo.icon;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof file === 'string') {
        onView(file); 
      } else {
        toast.info('Previsualización de archivos locales no disponible antes de subir.');
      }
    } catch (error) {
      console.error('Error al intentar ver archivo:', error);
      toast.error('Error al intentar ver el archivo.');
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
        <IconComponent className={`h-4 w-4 ${tipoArchivo.color} flex-shrink-0`} />
        <span className="text-sm text-gray-700 truncate flex-1" title={fileNameDisplay}>
          {fileNameDisplay}
        </span>
        {showActions && (
          <div className="flex gap-1 flex-shrink-0">
            {isUrl && (
              <button
                onClick={handleView}
                className="p-2 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                title="Ver archivo"
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-2 text-red-500 hover:bg-red-100 rounded transition-colors"
                title="Eliminar archivo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Vista no-compacta mejorada
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all"
         onClick={isUrl ? handleView : undefined}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg ${tipoArchivo.color.replace('text-', 'bg-').replace('-500', '-100')} flex-shrink-0`}>
            <IconComponent className={`h-5 w-5 ${tipoArchivo.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate" title={fileNameDisplay}>
              {fileNameDisplay}
            </p>
            <p className="text-sm text-gray-500">
              {tipoArchivo.label}
              {typeof file !== 'string' && file.size && ` • ${formatFileSize(file.size)}`}
              {isUrl && ` • ${extension.toUpperCase()}`}
            </p>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 ml-2 flex-shrink-0">
            {isUrl && (
                <button
                onClick={handleView}
                className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                title="Ver archivo"
              >
                <Eye className="h-4 w-4" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Eliminar archivo"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ====================================================================
// COMPONENTE VISOR DE ARCHIVOS DEDICADO Y PROFESIONAL
// ====================================================================

const FileViewerModal: React.FC<{
    fileUrl: string;
    onClose: () => void;
    cargando: boolean;
    error: string;
    contenidoTexto: string | null;
    paginaPDF: number;
    totalPaginasPDF: number;
    rotacionPDF: number;
    escalaZoom: number;
    setPaginaPDF: (page: number) => void;
    setRotacionPDF: (rot: number) => void;
    setEscalaZoom: (zoom: number) => void;
    setTotalPaginasPDF: (total: number) => void;
    isMobile: boolean;
}> = React.memo(({
    fileUrl, onClose, cargando, error, contenidoTexto,
    paginaPDF, totalPaginasPDF, rotacionPDF, escalaZoom,
    setPaginaPDF, setRotacionPDF, setEscalaZoom, setTotalPaginasPDF, isMobile
}) => {
    if (!fileUrl) return null;

    const extension = obtenerExtensionArchivo(fileUrl);
    const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const isPDF = extension === 'pdf';
    const isImage = imageExtensions.includes(extension);
    const isText = contenidoTexto !== null;
    const isOffice = officeExtensions.includes(extension);

    const handleDocumentLoadSuccess: OnDocumentLoadSuccess = useCallback(({ numPages }) => {
        setTotalPaginasPDF(numPages);
    }, [setTotalPaginasPDF]);
    
    // Función de renderizado del contenido del visor
    const renderContent = (): ReactNode => {
        if (cargando) {
            return <div className="text-center p-12"><Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" /><p className="mt-2 text-gray-700">Cargando archivo...</p></div>;
        }
        if (error) {
            return <div className="text-center text-red-500 p-12"><XCircle className="h-10 w-10 mx-auto mb-2" /><p>{error}</p></div>;
        }

        if (isPDF) {
            // Contenedor de PDF con controles
            return (
                <div className="flex flex-col h-full items-center justify-center p-4">
                    <div className="relative overflow-auto flex-1 w-full flex items-center justify-center">
                        <Document
                            file={fileUrl}
                            options={pdfOptions}
                            onLoadSuccess={handleDocumentLoadSuccess}
                            onLoadError={(e) => { console.error('Error PDF:', e); toast.error('Error al cargar PDF'); }}
                            className="shadow-2xl border border-gray-300"
                        >
                            <Page
                                pageNumber={paginaPDF}
                                scale={escalaZoom}
                                rotate={rotacionPDF}
                                renderAnnotationLayer={true}
                                renderTextLayer={true}
                                width={isMobile ? window.innerWidth * 0.9 : undefined} // Ajuste para móvil
                            />
                        </Document>
                    </div>
                    {/* Controles del PDF */}
                    <div className="bg-white p-3 border border-gray-200 rounded-xl shadow-lg mt-4 flex items-center gap-4">
                        <button onClick={() => setEscalaZoom(z => Math.max(0.5, z - 0.1))} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Zoom Out"><ZoomOut className="h-5 w-5" /></button>
                        <span className="text-sm font-medium w-12 text-center">{(escalaZoom * 100).toFixed(0)}%</span>
                        <button onClick={() => setEscalaZoom(z => Math.min(3.0, z + 0.1))} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Zoom In"><ZoomIn className="h-5 w-5" /></button>
                        
                        <div className="w-px h-6 bg-gray-200 mx-2"></div>

                        <button onClick={() => setPaginaPDF(p => Math.max(1, p - 1))} disabled={paginaPDF <= 1} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50" title="Página Anterior"><ChevronLeft className="h-5 w-5" /></button>
                        <span className="text-sm font-medium w-16 text-center">Pág. {paginaPDF} de {totalPaginasPDF}</span>
                        <button onClick={() => setPaginaPDF(p => Math.min(totalPaginasPDF, p + 1))} disabled={paginaPDF >= totalPaginasPDF} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50" title="Página Siguiente"><ChevronRight className="h-5 w-5" /></button>
                        
                        <div className="w-px h-6 bg-gray-200 mx-2"></div>
                        
                        <button onClick={() => setRotacionPDF(r => (r + 90) % 360)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Rotar"><RotateCw className="h-5 w-5" /></button>
                    </div>
                </div>
            );
        }

        if (isImage) {
            return (
                <div className="flex items-center justify-center p-4 h-full w-full">
                    <img 
                        src={fileUrl} 
                        alt="Vista previa" 
                        className="max-w-full max-h-full object-contain shadow-xl"
                        style={{ transform: `scale(${escalaZoom}) rotate(${rotacionPDF}deg)`, transition: 'transform 0.3s ease-out' }}
                    />
                    {/* Controles de Imagen (Zoom/Rotación) */}
                    <div className="absolute bottom-4 bg-white p-3 border border-gray-200 rounded-xl shadow-xl flex items-center gap-4">
                        <button onClick={() => setEscalaZoom(z => Math.max(0.5, z - 0.1))} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Zoom Out"><ZoomOut className="h-5 w-5" /></button>
                        <span className="text-sm font-medium w-12 text-center">{(escalaZoom * 100).toFixed(0)}%</span>
                        <button onClick={() => setEscalaZoom(z => Math.min(3.0, z + 0.1))} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Zoom In"><ZoomIn className="h-5 w-5" /></button>
                        <div className="w-px h-6 bg-gray-200 mx-2"></div>
                        <button onClick={() => setRotacionPDF(r => (r + 90) % 360)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full" title="Rotar"><RotateCw className="h-5 w-5" /></button>
                    </div>
                </div>
            );
        }

        if (isText) {
            return (
                <div className="p-6 h-full w-full overflow-auto">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 max-w-full">
                        <h4 className="text-base font-semibold text-gray-800 mb-3 border-b pb-2">Contenido de Texto/Código ({extension.toUpperCase()})</h4>
                        <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 bg-gray-50 p-3 rounded-lg border max-h-[70vh] overflow-auto">{contenidoTexto}</pre>
                    </div>
                </div>
            );
        }
        
        if (isOffice) {
            // Usar Office Online Viewer para navegadores (solo web, no nativo)
            return (
                <iframe 
                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`} 
                    width='100%' 
                    height='100%' 
                    frameBorder='0'
                    title={`Vista previa de documento Office (${extension.toUpperCase()})`}
                />
            );
        }

        // Tipo de archivo no previsualizable
        return (
            <div className="text-center py-12 px-6 bg-white rounded-lg shadow-lg max-w-sm">
                <FileText className="h-24 w-24 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Vista previa no disponible</h3>
                <p className="text-gray-500 mb-4 text-base">Este tipo de archivo ({extension.toUpperCase()}) no se puede previsualizar directamente.</p>
                <a href={fileUrl} download className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto text-sm w-fit font-medium">
                    <Download className="h-4 w-4" />
                    Descargar archivo
                </a>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[100] p-2 lg:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col">
                <header className="flex items-center justify-between p-3 lg:p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base lg:text-lg font-bold text-gray-900 truncate">Vista previa del archivo</h3>
                        <p className="text-xs lg:text-sm text-gray-500 truncate">{extraerNombreArchivo(fileUrl)}</p>
                    </div>
                    <div className="flex items-center gap-1 lg:gap-2 ml-2">
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Abrir en nueva pestaña"><ExternalLink className="h-4 w-4 lg:h-5 lg:w-5" /></a>
                        <a href={fileUrl} download className="p-2 text-green-500 hover:bg-green-50 rounded-lg" title="Descargar"><Download className="h-4 w-4 lg:h-5 lg:w-5" /></a>
                        <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Cerrar"><X className="h-4 w-4 lg:h-5 lg:w-5" /></button>
                    </div>
                </header>
                <main className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center relative">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
});


// ====================================================================
// COMPONENTE PRINCIPAL (FridayServiciosScreen)
// ====================================================================

const FridayServiciosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const isMobile = useIsMobile();
  
  // Estados principales
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [metrologos, setMetrologos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [currentUserInfo, setCurrentUserInfo] = useState<any>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroPrioridad, setFiltroPrioridad] = useState<string>('todos');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');
  const [vistaActual, setVistaActual] = useState<'lista' | 'kanban' | 'calendario'>(isMobile ? 'lista' : 'kanban');
  const [mostrarFormulario, setMostrarFormulario] = useState<boolean>(false);
  const [modoEdicion, setModoEdicion] = useState<boolean>(false);
  const [servicioSeleccionado, setServicioSeleccionado] = useState<Servicio | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [sidebarAbierto, setSidebarAbierto] = useState<boolean>(!isMobile);
  const [mostrarFiltros, setMostrarFiltros] = useState<boolean>(false);

  // Estados del formulario
  const [nuevoServicio, setNuevoServicio] = useState<NuevoServicioForm>({
    titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media', 
    estado: 'programado', fecha: '', horaInicio: '', horaFin: '', ubicacion: '', 
    clienteId: '', cliente: '', contacto: '', telefono: '', email: '', 
    personas: [], archivos: [], notas: ''
  });

  // Estados de UI del Visor
  const [archivosSubiendo, setArchivosSubiendo] = useState<boolean>(false);
  const [archivoViendose, setArchivoViendose] = useState<string | null>(null);
  const [escalaZoom, setEscalaZoom] = useState<number>(isMobile ? 0.7 : 1.0);
  const [paginaPDF, setPaginaPDF] = useState<number>(1);
  const [totalPaginasPDF, setTotalPaginasPDF] = useState<number>(0);
  const [rotacionPDF, setRotacionPDF] = useState<number>(0);
  const [mensajeNuevo, setMensajeNuevo] = useState<string>('');
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [cargandoArchivo, setCargandoArchivo] = useState<boolean>(false);
  const [errorArchivo, setErrorArchivo] = useState<string>('');
  const [contenidoTexto, setContenidoTexto] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const comentariosContainerRef = useRef<HTMLDivElement>(null);


  // Manejar navegación mejorada (useCallback)
  const manejarNavegacion = useCallback((destino: string) => {
    if (isMobile) setSidebarAbierto(false);
    switch(destino) {
      case 'dashboard': case 'menu': case 'inicio': navigateTo('dashboard'); break;
      case 'equipos': case 'equipos-calibracion': case 'equiposCalibracion': navigateTo('equiposCalibracion'); break;
      case 'clientes': navigateTo('clientes'); break;
      case 'usuarios': navigateTo('usuarios'); break;
      case 'reportes': navigateTo('reportes'); break;
      case 'configuracion': navigateTo('configuracion'); break;
      default: try { navigateTo(destino); } catch (error) { navigateTo('dashboard'); } break;
    }
  }, [navigateTo, isMobile]);

  // Efecto: Ajuste de vista y sidebar
  useEffect(() => {
    if (isMobile && vistaActual === 'kanban') {
      setVistaActual('lista');
    }
    setSidebarAbierto(!isMobile);
    if (isMobile) {
      setEscalaZoom(0.7);
    }
  }, [isMobile, vistaActual]);

  // Efecto: Carga inicial de datos (Servicios, Usuarios, Clientes)
  useEffect(() => {
    const cargarDatos = async () => {
      setCargando(true);
      
      try {
        const serviciosQuery = query(collection(db, 'servicios'), orderBy('fechaCreacion', 'desc'));
        const unsubscribeServicios = onSnapshot(serviciosQuery, (snapshot) => {
          const serviciosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Servicio[];
          setServicios(serviciosData);
          setCargando(false);
        });

        const usuariosSnapshot = await getDocs(query(collection(db, 'usuarios')));
        const usuariosData = usuariosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const metrologosData = usuariosData.filter(usuario => ['metrologo', 'metrólogo'].includes(usuario.position?.toLowerCase() || usuario.puesto?.toLowerCase() || ''));
        setMetrologos(metrologosData);

        const clientesSnapshot = await getDocs(query(collection(db, 'clientes')));
        const clientesData = clientesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClientes(clientesData);
        
        if (CURRENT_USER_ID !== 'usuario_123') {
            const userDoc = await getDoc(doc(db, 'usuarios', CURRENT_USER_ID));
            if (userDoc.exists()) {
                setCurrentUserInfo(userDoc.data());
            }
        }

        return () => { unsubscribeServicios(); };
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar los datos');
        setCargando(false);
      }
    };

    cargarDatos();
  }, []);

  // Efecto: Cargar comentarios y scroll automático (al seleccionar un servicio)
  useEffect(() => {
    let unsubscribe: () => void;
    if (servicioSeleccionado) {
      const comentariosQuery = query(
        collection(db, 'comentarios'),
        where('servicioId', '==', servicioSeleccionado.id),
        orderBy('fecha', 'asc')
      );
      
      unsubscribe = onSnapshot(comentariosQuery, (snapshot) => {
        const comentariosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMensajes(comentariosData);
      });
    }

    return () => { if (unsubscribe) unsubscribe(); };
  }, [servicioSeleccionado]);

  useEffect(() => {
      if (comentariosContainerRef.current) {
          comentariosContainerRef.current.scrollTop = comentariosContainerRef.current.scrollHeight;
      }
  }, [mensajes]);


  // Servicios filtrados y estadísticas (useMemo para optimización)
  const serviciosFiltrados = useMemo(() => {
    return servicios.filter(servicio => {
      const coincideBusqueda = !busqueda || 
        servicio.titulo?.toLowerCase().includes(busqueda.toLowerCase()) ||
        servicio.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) ||
        servicio.cliente?.toLowerCase().includes(busqueda.toLowerCase());
      
      const coincideEstado = filtroEstado === 'todos' || servicio.estado === filtroEstado;
      const coincidePrioridad = filtroPrioridad === 'todos' || servicio.prioridad === filtroPrioridad;
      const coincideTipo = filtroTipo === 'todos' || servicio.tipo === filtroTipo;
      
      return coincideBusqueda && coincideEstado && coincidePrioridad && coincideTipo;
    });
  }, [servicios, busqueda, filtroEstado, filtroPrioridad, filtroTipo]);

  const estadisticas = useMemo(() => {
    const total = servicios.length;
    const programados = servicios.filter(s => s.estado === 'programado').length;
    const enProceso = servicios.filter(s => s.estado === 'en_proceso').length;
    const finalizados = servicios.filter(s => s.estado === 'finalizado').length;
    const reprogramados = servicios.filter(s => s.estado === 'reprogramacion').length;
    
    return { total, programados, enProceso, finalizados, reprogramados };
  }, [servicios]);
  
  const getNombreUsuarioActual = useCallback(() => {
    if (currentUserInfo) {
      return currentUserInfo.name || currentUserInfo.nombre || currentUserInfo.correo || currentUserInfo.email || 'Usuario Actual';
    }
    return CURRENT_USER_NAME;
  }, [currentUserInfo]);

  // Lógica para abrir el visor de archivos (useCallback)
  const verArchivo = useCallback(async (archivoUrl: string) => {
    setCargandoArchivo(true);
    setErrorArchivo('');
    setContenidoTexto(null);
    setArchivoViendose(null); 

    try {
        if (!archivoUrl || typeof archivoUrl !== 'string') {
            throw new Error('URL del archivo no válida');
        }

        const urlAcceso = await crearUrlAcceso(archivoUrl);
        setArchivoViendose(urlAcceso);
        setPaginaPDF(1);
        setEscalaZoom(isMobile ? 0.7 : 1.0);
        setRotacionPDF(0);
        setTotalPaginasPDF(0); 

        const extension = obtenerExtensionArchivo(urlAcceso);
        const textExtensions = ['txt', 'csv', 'log', 'md', 'json', 'xml'];

        if (textExtensions.includes(extension)) {
            const response = await fetch(urlAcceso);
            if (!response.ok) throw new Error('No se pudo cargar el contenido del archivo.');
            const textContent = await response.text();
            setContenidoTexto(textContent);
        }

    } catch (error) {
        console.error('Error al cargar archivo:', error);
        setErrorArchivo('No se pudo cargar el archivo. Verifica la URL o los permisos de acceso.');
        toast.error('Error al cargar el archivo');
        setArchivoViendose(archivoUrl); 
    } finally {
        setCargandoArchivo(false);
    }
  }, [isMobile]);
  
  // Lógica de formulario y CRUD (useCallback)
  const manejarSubidaArchivos = useCallback(async (files: FileList) => {
    setArchivosSubiendo(true);
    const nuevosArchivos: File[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size <= 10 * 1024 * 1024) { 
        nuevosArchivos.push(file);
      } else {
        toast.error(`El archivo ${file.name} es demasiado grande (máximo 10MB)`);
      }
    }
    
    setNuevoServicio(prev => ({ ...prev, archivos: [...prev.archivos, ...nuevosArchivos] }));
    setArchivosSubiendo(false);
  }, []);
  
  const manejarSeleccionCliente = (clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente) {
      setNuevoServicio(prev => ({
        ...prev,
        clienteId: clienteId,
        cliente: cliente.nombre || cliente.razonSocial || '',
        contacto: cliente.contactoPrincipal || '',
        telefono: cliente.telefono || '',
        email: cliente.email || cliente.correo || '',
        ubicacion: cliente.direccion || ''
      }));
    } else {
      setNuevoServicio(prev => ({
        ...prev,
        clienteId: '', cliente: '', contacto: '', telefono: '', email: '', ubicacion: ''
      }));
    }
  };

  const crearServicio = async () => {
    if (!nuevoServicio.titulo.trim() || nuevoServicio.personas.length === 0) {
      toast.error('El título y la asignación de metrólogos son requeridos');
      return;
    }

    setCargando(true);

    try {
      const urlsArchivos: string[] = [];
      const archivosLocales = nuevoServicio.archivos || [];
      for (const archivo of archivosLocales) {
        try {
          const timestamp = Date.now();
          const fileName = `${timestamp}_${archivo.name}`;
          const storageRef = ref(storage, `servicios/${fileName}`);
          await uploadBytes(storageRef, archivo);
          const url = await getDownloadURL(storageRef);
          urlsArchivos.push(url);
        } catch (error) {
          console.error(`Error al subir archivo ${archivo.name}:`, error);
          toast.error(`Error al subir archivo ${archivo.name}`);
        }
      }
      
      const servicioAnteriorArchivos = modoEdicion && servicioSeleccionado ? (servicioSeleccionado.archivos || []) : [];
      const metrologosAsignados = metrologos.filter(m => nuevoServicio.personas.includes(m.id));

      const servicioData = {
        ...nuevoServicio,
        archivos: [...servicioAnteriorArchivos, ...urlsArchivos], 
        fechaCreacion: modoEdicion && servicioSeleccionado?.fechaCreacion ? servicioSeleccionado.fechaCreacion : serverTimestamp(),
        creadoPor: modoEdicion && servicioSeleccionado?.creadoPor ? servicioSeleccionado.creadoPor : CURRENT_USER_ID,
        creadoPorNombre: modoEdicion && servicioSeleccionado?.creadoPorNombre ? servicioSeleccionado.creadoPorNombre : getNombreUsuarioActual(),
        personasNombres: metrologosAsignados.map(m => m.name || m.nombre || m.correo || m.email || 'Metrólogo'),
        ultimaActualizacion: serverTimestamp(),
        actualizadoPor: CURRENT_USER_ID,
        archivosLocales: undefined 
      };

      if (modoEdicion && servicioSeleccionado) {
        await updateDoc(doc(db, 'servicios', servicioSeleccionado.id), servicioData);
        toast.success('Servicio actualizado exitosamente');
      } else {
        await addDoc(collection(db, 'servicios'), servicioData);
        toast.success('Servicio creado exitosamente');
      }

      setNuevoServicio({ titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media', estado: 'programado', fecha: '', horaInicio: '', horaFin: '', ubicacion: '', clienteId: '', cliente: '', contacto: '', telefono: '', email: '', personas: [], archivos: [], notas: '' });
      setMostrarFormulario(false);
      setModoEdicion(false);
      setServicioSeleccionado(null);
      
    } catch (error) {
      console.error('Error al crear/actualizar servicio:', error);
      toast.error('Error al procesar el servicio');
    } finally {
      setCargando(false);
    }
  };
  
  const agregarComentario = async () => {
    if (!mensajeNuevo.trim() || !servicioSeleccionado) return;

    try {
      const nombreAutor = getNombreUsuarioActual();
      
      await addDoc(collection(db, 'comentarios'), {
        servicioId: servicioSeleccionado.id,
        mensaje: mensajeNuevo.trim(),
        autor: nombreAutor,
        autorId: CURRENT_USER_ID,
        fecha: serverTimestamp()
      });
      
      setMensajeNuevo('');
    } catch (error) {
      console.error('Error al agregar comentario:', error);
      toast.error('Error al agregar comentario');
    }
  };

  const actualizarEstado = async (servicioId: string, nuevoEstado: string) => {
    try {
      await updateDoc(doc(db, 'servicios', servicioId), {
        estado: nuevoEstado,
        ultimaActualizacion: serverTimestamp(),
        actualizadoPor: CURRENT_USER_ID
      });
      toast.success('Estado actualizado');
      // Actualizar el servicio seleccionado si es el que se está viendo
      setServicioSeleccionado(prev => prev && prev.id === servicioId ? ({ ...prev, estado: nuevoEstado }) : prev);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      toast.error('Error al actualizar estado');
    }
  };
  
  const eliminarServicio = async (servicioId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este servicio de forma permanente?')) return;

    try {
      await deleteDoc(doc(db, 'servicios', servicioId));
      toast.success('Servicio eliminado');
      setServicioSeleccionado(null);
    } catch (error) {
      console.error('Error al eliminar servicio:', error);
      toast.error('Error al eliminar servicio');
    }
  };
  
  const editarServicio = (servicio: Servicio) => {
    setNuevoServicio({
      titulo: servicio.titulo || '', descripcion: servicio.descripcion || '',
      tipo: servicio.tipo || 'calibracion', prioridad: servicio.prioridad || 'media',
      estado: servicio.estado || 'programado', fecha: servicio.fecha || '', 
      horaInicio: servicio.horaInicio || '', horaFin: servicio.horaFin || '',
      ubicacion: servicio.ubicacion || '', clienteId: servicio.clienteId || '',
      cliente: servicio.cliente || '', contacto: servicio.contacto || '',
      telefono: servicio.telefono || '', email: servicio.email || '',
      personas: servicio.personas || [], archivos: [], notes: servicio.notas || ''
    } as NuevoServicioForm);
    setServicioSeleccionado(servicio); 
    setModoEdicion(true);
    setMostrarFormulario(true);
  };
  
  // Función para remover archivos URL existentes (Solo en modo edición)
  const removerArchivoUrl = async (fileUrl: string) => {
      if (!servicioSeleccionado || !modoEdicion) return;

      if (!window.confirm('¿Estás seguro de que deseas eliminar este archivo de Firebase?')) return;
      
      try {
          const filePathMatch = fileUrl.match(/\/o\/(.+?)\?/);
          if (filePathMatch) {
              const filePath = decodeURIComponent(filePathMatch[1]);
              const fileRef = ref(storage, filePath);
              await deleteObject(fileRef).catch(e => console.warn('Advertencia: Archivo no encontrado en Storage (continuando con Firestore).'));
          }
          
          const updatedArchivos = (servicioSeleccionado.archivos || []).filter(url => url !== fileUrl);

          await updateDoc(doc(db, 'servicios', servicioSeleccionado.id), {
              archivos: updatedArchivos,
              ultimaActualizacion: serverTimestamp(),
              actualizadoPor: CURRENT_USER_ID
          });
          
          setServicioSeleccionado(prev => prev ? ({ ...prev, archivos: updatedArchivos }) : null);
          toast.success('Archivo URL eliminado exitosamente');
      } catch (error) {
          console.error('Error al eliminar archivo:', error);
          toast.error('Error al eliminar archivo. Intenta de nuevo.');
      }
  };


  // Vista Kanban (Mantenida y refinada)
  const VistaKanban = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 min-h-[70vh]">
      {estados.map((estado) => {
        const serviciosDelEstado = serviciosFiltrados.filter(s => s.estado === estado.value);
        const IconComponent = estado.icon;
        
        return (
          <div 
            key={estado.value} 
            className={`bg-white rounded-xl shadow-xl border-t-4 ${estado.color.replace('text-', 'border-')}-500 flex flex-col`}
          >
            <div className={`p-4 border-b border-gray-200 ${estado.bgColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconComponent className={`h-5 w-5 ${estado.color}`} />
                  <h3 className={`font-bold text-base ${estado.color}`}>{estado.label}</h3>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${estado.bgColor.replace('bg-', 'bg-')}-300 ${estado.color}`}>
                  {serviciosDelEstado.length}
                </span>
              </div>
            </div>
            
            <div className="p-3 lg:p-4 space-y-3 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
              {serviciosDelEstado.map((servicio) => (
                <KanbanCard 
                    key={servicio.id} 
                    servicio={servicio} 
                    onClick={() => setServicioSeleccionado(servicio)} 
                />
              ))}
              
              {serviciosDelEstado.length === 0 && (
                <div className="text-center py-12 text-gray-500 rounded-lg border border-dashed border-gray-300 bg-gray-50">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${estado.bgColor} mb-3`}>
                    <IconComponent className={`h-6 w-6 ${estado.color}`} />
                  </div>
                  <p className="text-sm font-medium">No hay servicios en {estado.label}</p>
                  <p className="text-xs mt-1">Arrastra o crea uno nuevo.</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Vista Lista (Optimizada para Mobile y Web)
  const VistaLista = () => (
    <div className="space-y-4">
      {serviciosFiltrados.map((servicio) => {
        const estadoInfo = estados.find(e => e.value === servicio.estado);
        
        return (
          <div
            key={servicio.id}
            onClick={() => setServicioSeleccionado(servicio)}
            className="bg-white rounded-xl shadow-lg border-l-4 border-gray-200 p-4 cursor-pointer hover:shadow-xl transition-all"
            style={{ borderLeftColor: estadoInfo?.color.replace('text-', 'border-') }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-gray-900 truncate mb-1">
                  {servicio.titulo}
                </h3>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {servicio.descripcion || 'Sin descripción.'}
                </p>
              </div>
              <div className="ml-3 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    editarServicio(servicio);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Editar"
                >
                  <Edit3 className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3">
              <EstadoBadge estado={servicio.estado} compact />
              <PrioridadBadge prioridad={servicio.prioridad} compact />
              
              {servicio.cliente && (
                <div className="flex items-center gap-2 text-sm text-gray-600 truncate">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span title={servicio.cliente}>{servicio.cliente}</span>
                </div>
              )}
              
              <div className="flex items-center gap-3 ml-auto text-xs text-gray-500">
                {servicio.personas && servicio.personas.length > 0 && (
                  <div className="flex items-center gap-1" title={`${servicio.personas.length} Metrólogos`}>
                    <Users className="h-4 w-4" />
                    <span>{servicio.personas.length}</span>
                  </div>
                )}
                {servicio.archivos && servicio.archivos.length > 0 && (
                  <div className="flex items-center gap-1" title={`${servicio.archivos.length} Archivos`}>
                    <Paperclip className="h-4 w-4" />
                    <span>{servicio.archivos.length}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <CalendarIcon className="h-4 w-4" />
                  <span>{servicio.fecha || 'Sin fecha'}</span>
                </div>
              </div>
            </div>
            
            <EstadoProgress estado={servicio.estado} />
          </div>
        );
      })}
      
      {serviciosFiltrados.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl shadow-lg border border-gray-200">
          <FolderOpen className="h-16 w-16 text-blue-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No se encontraron servicios</h3>
          <p className="text-gray-500">Intenta cambiar los filtros, busca por otro término, o crea un nuevo servicio.</p>
        </div>
      )}
    </div>
  );

  if (cargando && servicios.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Cargando datos esenciales...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar y Backdrop (Mantenido) */}
      {!isMobile && <SidebarFriday onNavigate={manejarNavegacion} />}
      {isMobile && sidebarAbierto && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarAbierto(false)}
        />
      )}
      {isMobile && (
        <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ${
          sidebarAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <SidebarFriday onNavigate={manejarNavegacion} />
        </div>
      )}
      
      <div className={`${!isMobile ? 'ml-64' : ''} p-4 lg:p-8`}>
        {/* Header Responsive */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 lg:p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Botones de navegación y menú móvil */}
              {isMobile ? (
                <>
                  <button onClick={() => manejarNavegacion('dashboard')} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Regresar"><ArrowLeft className="h-5 w-5" /></button>
                  <button onClick={() => setSidebarAbierto(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Menú"><Menu className="h-6 w-6" /></button>
                </>
              ) : (
                <button onClick={() => manejarNavegacion('dashboard')} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Inicio"><Home className="h-6 w-6" /></button>
              )}
              <div>
                <h1 className="text-xl lg:text-3xl font-bold text-gray-900">Gestión de Servicios</h1>
                <p className="text-sm lg:text-base text-gray-600 mt-1 hidden md:block">Organiza y supervisa todos los servicios de metrología.</p>
              </div>
            </div>
            
            {/* Botón de Nuevo Servicio (Flotante en móvil, fijo en header en desktop) */}
            {!isMobile && (
              <button
                onClick={() => {
                  setNuevoServicio({ titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media', estado: 'programado', fecha: '', horaInicio: '', horaFin: '', ubicacion: '', clienteId: '', cliente: '', contacto: '', telefono: '', email: '', personas: [], archivos: [], notas: '' });
                  setModoEdicion(false);
                  setServicioSeleccionado(null);
                  setMostrarFormulario(true);
                }}
                className="bg-blue-600 text-white px-5 py-2 lg:px-6 lg:py-3 rounded-xl hover:bg-blue-700 transition-all duration-200 flex items-center gap-2 shadow-lg"
              >
                <Plus className="h-5 w-5" />
                <span className="hidden lg:inline">Nuevo Servicio</span>
              </button>
            )}
          </div>
        </div>

        {/* Estadísticas (Mejoradas) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 lg:gap-6 mb-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 md:col-span-1">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                        <Briefcase className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-600">Total</p>
                        <p className="text-xl lg:text-2xl font-bold text-gray-900">{estadisticas.total}</p>
                    </div>
                </div>
            </div>
            
            {estados.filter(e => e.value !== 'reprogramacion').map((estado) => {
                const count = estadisticas[estado.value as keyof typeof estadisticas] || 0;
                const IconComponent = estado.icon;
                const colorClass = estado.color.replace('text-', 'text-');
                
                return (
                    <div key={estado.value} className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${estado.bgColor}`}>
                                <IconComponent className={`h-5 w-5 ${colorClass}`} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">{estado.label}</p>
                                <p className={`text-xl lg:text-2xl font-bold ${colorClass}`}>{count}</p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
        
        {/* Controles y filtros responsive */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6 lg:mb-8">
            <div className="p-4 lg:p-6">
                {/* Búsqueda */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por título, descripción o cliente..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    />
                </div>

                {/* Botón de filtros móvil */}
                {isMobile && (
                    <button
                        onClick={() => setMostrarFiltros(!mostrarFiltros)}
                        className="w-full flex items-center justify-center gap-2 p-3 border border-gray-300 rounded-xl text-gray-700 font-medium mb-4 hover:bg-gray-50 transition-colors"
                    >
                        <Filter className="h-4 w-4" />
                        Filtros Avanzados
                        <ChevronLeft className={`h-4 w-4 transform transition-transform duration-300 ${mostrarFiltros ? 'rotate-90' : '-rotate-90'}`} />
                    </button>
                )}

                {/* Filtros */}
                <div className={`${isMobile && !mostrarFiltros ? 'hidden' : 'flex'} flex-col lg:flex-row gap-3 items-center`}>
                    <select
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value)}
                        className="flex-1 w-full lg:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white bg-no-repeat bg-[right_0.75rem_center] bg-[length:1.5rem_1.5rem]"
                        style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>')` }}
                    >
                        <option value="todos">Todos los estados</option>
                        {estados.map(estado => (
                            <option key={estado.value} value={estado.value}>{estado.label}</option>
                        ))}
                    </select>

                    <select
                        value={filtroPrioridad}
                        onChange={(e) => setFiltroPrioridad(e.target.value)}
                        className="flex-1 w-full lg:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white bg-no-repeat bg-[right_0.75rem_center] bg-[length:1.5rem_1.5rem]"
                        style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>')` }}
                    >
                        <option value="todos">Todas las prioridades</option>
                        {prioridades.map(prioridad => (
                            <option key={prioridad.value} value={prioridad.value}>{prioridad.label}</option>
                        ))}
                    </select>

                    <select
                        value={filtroTipo}
                        onChange={(e) => setFiltroTipo(e.target.value)}
                        className="flex-1 w-full lg:w-auto px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white bg-no-repeat bg-[right_0.75rem_center] bg-[length:1.5rem_1.5rem]"
                        style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>')` }}
                    >
                        <option value="todos">Todos los tipos</option>
                        {tiposServicio.map(tipo => (
                            <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                        ))}
                    </select>
                    
                    {/* Selector de vista para desktop */}
                    {!isMobile && (
                        <div className="flex bg-gray-100 rounded-xl p-1 w-fit flex-shrink-0">
                            <button
                                onClick={() => setVistaActual('kanban')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 ${
                                    vistaActual === 'kanban' 
                                        ? 'bg-blue-600 text-white shadow-md' 
                                        : 'text-gray-600 hover:bg-gray-200'
                                }`}
                                title="Vista Kanban"
                            >
                                <Network className="h-4 w-4" />
                                Kanban
                            </button>
                            <button
                                onClick={() => setVistaActual('lista')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 ${
                                    vistaActual === 'lista' 
                                        ? 'bg-blue-600 text-white shadow-md' 
                                        : 'text-gray-600 hover:bg-gray-200'
                                }`}
                                title="Vista de Lista"
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                Lista
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Vista principal responsive */}
        <div className="pb-20">
            {vistaActual === 'kanban' ? <VistaKanban /> : <VistaLista />}
        </div>

        {/* Modal de formulario */}
        {mostrarFormulario && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 lg:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto transform transition-all duration-300">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 lg:px-6 py-4 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl lg:text-2xl font-bold text-gray-900">
                      {modoEdicion ? 'Editar Servicio' : 'Nuevo Servicio'}
                    </h2>
                    <p className="text-gray-600 mt-1 text-sm lg:text-base">
                      {modoEdicion ? 'Modifica los detalles del servicio' : 'Completa la información del servicio'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setMostrarFormulario(false);
                      setModoEdicion(false);
                      setServicioSeleccionado(null);
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    title="Cerrar Formulario"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-4 lg:p-6 space-y-8">
                {/* Información básica */}
                <div className="grid grid-cols-1 gap-4 lg:gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Título del servicio *</label>
                    <input
                      type="text" value={nuevoServicio.titulo}
                      onChange={(e) => setNuevoServicio(prev => ({ ...prev, titulo: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Calibración de balanza analítica"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                    <textarea
                      value={nuevoServicio.descripcion} rows={3}
                      onChange={(e) => setNuevoServicio(prev => ({ ...prev, descripcion: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Describe los detalles del servicio..."
                    />
                  </div>
                  {/* Otros campos del formulario... (Tipo, Prioridad, Estado, Fechas) */}
                  
                  {/* Información del cliente */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Cliente</h3>
                    <select
                      value={nuevoServicio.clienteId}
                      onChange={(e) => manejarSeleccionCliente(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    >
                      <option value="">Seleccionar cliente...</option>
                      {clientes.map(cliente => (
                        <option key={cliente.id} value={cliente.id}>
                          {cliente.nombre || cliente.razonSocial || 'Sin nombre'}
                        </option>
                      ))}
                    </select>
                    {/* Campos de Contacto, Teléfono, Email, Ubicación... */}
                  </div>

                  {/* Asignación de metrólogos */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Asignación de Metrólogos *
                    </h3>
                    
                    {metrologos.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <UserCheck className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p className="font-medium">No hay metrólogos disponibles</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-2 border rounded-xl bg-gray-50">
                        {metrologos.map((metrologo) => (
                          <label
                            key={metrologo.id}
                            className={`flex items-center p-3 border rounded-lg hover:bg-white cursor-pointer transition-colors ${
                                nuevoServicio.personas.includes(metrologo.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={nuevoServicio.personas.includes(metrologo.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNuevoServicio(prev => ({ ...prev, personas: [...prev.personas, metrologo.id] }));
                                } else {
                                  setNuevoServicio(prev => ({ ...prev, personas: prev.personas.filter(id => id !== metrologo.id) }));
                                }
                              }}
                              className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded-md"
                            />
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900">
                                {metrologo.name || metrologo.nombre || metrologo.correo || metrologo.email}
                              </p>
                              <p className="text-xs text-gray-500">
                                {metrologo.position || metrologo.puesto || 'Metrólogo'}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notas */}
                  <div className="border-t border-gray-200 pt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notas adicionales</label>
                    <textarea
                      value={nuevoServicio.notas} rows={3}
                      onChange={(e) => setNuevoServicio(prev => ({ ...prev, notas: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Observaciones importantes..."
                    />
                  </div>
                </div>

                {/* Archivos adjuntos */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Paperclip className="h-5 w-5 text-gray-500" />
                    Archivos Adjuntos
                  </h3>
                  
                  {/* 1. Archivos URL existentes (solo en modo edición) */}
                  {modoEdicion && servicioSeleccionado && servicioSeleccionado.archivos && servicioSeleccionado.archivos.length > 0 && (
                      <div className="mt-4 space-y-2 mb-6 p-4 border border-blue-100 bg-blue-50 rounded-xl">
                          <h4 className="font-medium text-blue-800 flex items-center gap-2">
                            <Archive className="h-4 w-4" />
                            Archivos guardados ({servicioSeleccionado.archivos.length}):
                          </h4>
                          <div className="space-y-2">
                              {servicioSeleccionado.archivos.map((archivoUrl: string) => (
                                  <FilePreview
                                      key={archivoUrl}
                                      file={archivoUrl}
                                      onView={verArchivo}
                                      onRemove={() => removerArchivoUrl(archivoUrl)}
                                      showActions={true}
                                      isUrl={true}
                                      compact
                                  />
                              ))}
                          </div>
                      </div>
                  )}

                  {/* 2. Drag and Drop / Input File (Archivos a subir) */}
                  <div
                    className={`border-2 border-dashed ${archivosSubiendo ? 'border-blue-500' : 'border-gray-300'} rounded-xl p-6 lg:p-8 text-center hover:border-blue-400 transition-colors cursor-pointer`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files.length > 0) {
                        manejarSubidaArchivos(e.dataTransfer.files);
                      }
                    }}
                  >
                    {archivosSubiendo ? (
                        <Loader2 className="h-10 w-10 lg:h-12 lg:w-12 text-blue-400 mx-auto mb-4 animate-spin" />
                    ) : (
                        <Upload className="h-10 w-10 lg:h-12 lg:w-12 text-gray-400 mx-auto mb-4" />
                    )}
                    <p className="text-base lg:text-lg font-bold text-gray-900 mb-2">
                      {isMobile ? 'Toca para seleccionar archivos' : 'Arrastra y suelta archivos aquí'}
                    </p>
                    <p className="text-gray-500 text-sm lg:text-base">
                      Máximo 10MB por archivo. Formatos comunes: PDF, Office, Imágenes.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          manejarSubidaArchivos(e.target.files);
                        }
                      }}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg"
                    />
                  </div>

                  {/* 3. Archivos locales seleccionados antes de subir */}
                  {nuevoServicio.archivos && nuevoServicio.archivos.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="font-medium text-gray-900 flex items-center gap-2">
                        <FileUp className="h-4 w-4" />
                        Archivos a subir ({nuevoServicio.archivos.length}):
                      </h4>
                      <div className="space-y-2">
                        {nuevoServicio.archivos.map((archivo, index) => (
                          <FilePreview
                            key={index}
                            file={archivo}
                            onView={() => {}}
                            onRemove={() => {
                              setNuevoServicio(prev => ({
                                ...prev,
                                archivos: prev.archivos.filter((_, i) => i !== index)
                              }));
                            }}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer con botones */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 lg:px-6 py-4 rounded-b-2xl z-10">
                <div className="flex flex-col-reverse lg:flex-row justify-end gap-3">
                  <button
                    onClick={() => {
                      setMostrarFormulario(false);
                      setModoEdicion(false);
                      setServicioSeleccionado(null);
                    }}
                    className="w-full lg:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={crearServicio}
                    disabled={cargando || archivosSubiendo}
                    className="w-full lg:w-auto px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold shadow-md"
                  >
                    {cargando || archivosSubiendo ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Check className="h-5 w-5" />
                        {modoEdicion ? 'Actualizar Servicio' : 'Crear Servicio'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de detalles del servicio (Estructura de panel, mejorada) */}
        {servicioSeleccionado && !mostrarFormulario && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 lg:p-4">
            <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[95vh] ${
              isMobile ? 'flex flex-col max-w-lg' : 'max-w-screen-xl flex overflow-hidden'
            }`}>
              
              {/* Panel principal de detalles */}
              <div className="flex-1 flex flex-col min-w-[300px]">
                {/* Header del Detalle */}
                <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 sticky top-0 z-10">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-1 truncate" title={servicioSeleccionado.titulo}>
                        {servicioSeleccionado.titulo}
                      </h2>
                      <div className="flex items-center gap-2 lg:gap-3">
                        <EstadoBadge estado={servicioSeleccionado.estado} compact={isMobile} />
                        <PrioridadBadge prioridad={servicioSeleccionado.prioridad} compact={isMobile} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <button
                        onClick={() => editarServicio(servicioSeleccionado)}
                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Editar servicio"
                      >
                        <Edit3 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => eliminarServicio(servicioSeleccionado.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar servicio"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setServicioSeleccionado(null)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Cerrar Detalle"
                      >
                        <X className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Contenido principal scrolleable */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 custom-scrollbar">
                    {/* Sección de Acciones Rápidas (Movida arriba para mejor UX) */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-4 text-sm lg:text-base">Cambiar Estado Rápidamente</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {estados.map((estado) => {
                            if (estado.value === servicioSeleccionado.estado) return null;
                            const IconComponent = estado.icon;
                            
                            return (
                            <button
                                key={estado.value}
                                onClick={() => actualizarEstado(servicioSeleccionado.id, estado.value)}
                                className={`p-3 rounded-xl border-2 transition-all hover:shadow-lg ${estado.border} hover:${estado.bgColor} flex flex-col lg:flex-row items-center justify-center gap-1 text-xs lg:text-sm font-semibold ${estado.color}`}
                            >
                                <IconComponent className="h-4 w-4" />
                                <span className="text-center">{estado.label}</span>
                            </button>
                            );
                        })}
                        </div>
                    </div>
                    
                    {/* Descripción */}
                    <div className="bg-gray-50 rounded-xl p-4 lg:p-6 border border-gray-200">
                        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <FileText className="h-5 w-5 text-gray-600" />
                          Descripción
                        </h3>
                        <p className="text-gray-700 leading-relaxed text-sm lg:text-base whitespace-pre-wrap">
                        {servicioSeleccionado.descripcion || <span className="text-gray-500 italic">Sin descripción proporcionada.</span>}
                        </p>
                    </div>

                    {/* Información del servicio y cliente */}
                    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
                      {/* Información del servicio */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Settings className="h-4 w-4 lg:h-5 lg:w-5 text-blue-500" />
                          <span className="text-sm lg:text-base">Información del Servicio</span>
                        </h3>
                        {/* ... (Detalles del servicio) ... */}
                      </div>

                      {/* Información del cliente */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Building2 className="h-4 w-4 lg:h-5 lg:w-5 text-green-500" />
                          <span className="text-sm lg:text-base">Información del Cliente</span>
                        </h3>
                        {/* ... (Detalles del cliente) ... */}
                      </div>
                    </div>

                    {/* Metrólogos asignados (MEJORA: Muestra Nombres) */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
                      <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-purple-500" />
                        <span className="text-base lg:text-lg">Metrólogos Asignados ({servicioSeleccionado.personas?.length || 0})</span>
                      </h3>
                      {servicioSeleccionado.personas && servicioSeleccionado.personas.length > 0 ? (
                        <div className="space-y-3">
                          {servicioSeleccionado.personas.map((personaId: string, index: number) => {
                            const metrologo = metrologos.find(m => m.id === personaId);
                            // Usar el nombre del metrólogo si se encuentra, o el nombre guardado en el servicio
                            const nombreMostrar = metrologo?.name || metrologo?.nombre || servicioSeleccionado.personasNombres?.[index] || `Metrólogo ${index + 1}`;
                            return (
                              <div key={personaId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <User className="h-4 w-4 lg:h-5 lg:w-5 text-purple-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 text-sm lg:text-base truncate">
                                    {nombreMostrar}
                                  </p>
                                  <p className="text-xs lg:text-sm text-gray-500">
                                    {metrologo?.position || metrologo?.puesto || 'Metrólogo'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-500">
                          <Users className="h-10 w-10 lg:h-12 lg:w-12 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm lg:text-base">No hay metrólogos asignados</p>
                        </div>
                      )}
                    </div>


                    {/* Archivos adjuntos (MEJORA: Usa el componente FilePreview mejorado) */}
                    {servicioSeleccionado.archivos && servicioSeleccionado.archivos.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Paperclip className="h-5 w-5 text-blue-500" />
                                <span className="text-base lg:text-lg">Archivos Adjuntos ({servicioSeleccionado.archivos.length})</span>
                            </h3>
                            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                                {servicioSeleccionado.archivos.map((archivo: string, index: number) => (
                                    <FilePreview
                                        key={index}
                                        file={archivo}
                                        onView={verArchivo}
                                        showActions={true}
                                        isUrl={true}
                                        compact={isMobile}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notas adicionales */}
                    {servicioSeleccionado.notas && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <Info className="h-4 w-4 lg:h-5 lg:w-5 text-blue-500" />
                          <span className="text-sm lg:text-base">Notas Adicionales</span>
                        </h3>
                        <p className="text-gray-900 text-sm lg:text-base whitespace-pre-wrap">{servicioSeleccionado.notas}</p>
                        <div className="pt-4 border-t border-gray-100 mt-4">
                          <p className="text-xs text-gray-500">
                            Creado por {servicioSeleccionado.creadoPorNombre || 'Usuario'} el {' '}
                            {servicioSeleccionado.fechaCreacion?.toDate?.()?.toLocaleDateString() || 'Fecha no disponible'}
                          </p>
                        </div>
                      </div>
                    )}
                </div>
              </div>

              {/* Panel lateral de comentarios (Desktop only) */}
              {!isMobile && (
                <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col flex-shrink-0">
                  <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                      <MessageCircle className="h-5 w-5 text-blue-500" />
                      Comentarios ({mensajes.length})
                    </h3>
                  </div>
                  
                  <div ref={comentariosContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {mensajes.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="font-medium">No hay comentarios aún</p>
                        <p className="text-sm">Sé el primero en comentar</p>
                      </div>
                    ) : (
                      mensajes.map((mensaje) => (
                        <div key={mensaje.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-gray-900">{mensaje.autor}</p>
                                <span className="text-xs text-gray-500 ml-auto">
                                  {mensaje.fecha?.toDate?.()?.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Ahora'}
                                </span>
                              </div>
                              <p className="text-gray-700 text-sm whitespace-pre-wrap">{mensaje.mensaje}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0 z-10">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mensajeNuevo}
                        onChange={(e) => setMensajeNuevo(e.target.value)}
                        placeholder="Escribe un mensaje..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && mensajeNuevo.trim()) {
                            agregarComentario();
                          }
                        }}
                      />
                      <button
                        onClick={agregarComentario}
                        disabled={!mensajeNuevo.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        title="Enviar Comentario"
                      >
                        <Send className="h-4 w-4" />
                        <span className="ml-2 hidden lg:inline">Enviar</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Visor de Archivos (Componente dedicado) */}
        <FileViewerModal 
            fileUrl={archivoViendose || ''}
            onClose={() => {
                setArchivoViendose(null);
                setContenidoTexto(null); // Limpiar contenido al cerrar
            }}
            cargando={cargandoArchivo}
            error={errorArchivo}
            contenidoTexto={contenidoTexto}
            paginaPDF={paginaPDF}
            totalPaginasPDF={totalPaginasPDF}
            rotacionPDF={rotacionPDF}
            escalaZoom={escalaZoom}
            setPaginaPDF={setPaginaPDF}
            setRotacionPDF={setRotacionPDF}
            setEscalaZoom={setEscalaZoom}
            setTotalPaginasPDF={setTotalPaginasPDF}
            isMobile={isMobile}
        />

        {/* Botón flotante para agregar servicio en móvil */}
        {isMobile && !mostrarFormulario && !servicioSeleccionado && (
          <button
            onClick={() => {
              setNuevoServicio({ titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media', estado: 'programado', fecha: '', horaInicio: '', horaFin: '', ubicacion: '', clienteId: '', cliente: '', contacto: '', telefono: '', email: '', personas: [], archivos: [], notas: '' });
              setModoEdicion(false);
              setServicioSeleccionado(null);
              setMostrarFormulario(true);
            }}
            className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 transition-all duration-200 flex items-center justify-center z-40"
            title="Nuevo Servicio"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default FridayServiciosScreen;