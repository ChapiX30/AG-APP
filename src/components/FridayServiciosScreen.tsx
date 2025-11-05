import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import SidebarFriday from './SidebarFriday';
import { Document, Page, pdfjs } from 'react-pdf';

// === MI CORRECCIÓN (FIX 10): Importar el worker para VITE ===
// Añadimos "?url" para que Vite nos dé la URL del worker.
'pdfjs-dist/build/pdf.worker.min.js?url';

import { 
  ArrowLeft, Plus, Calendar, Bell, FileText, FileUp, X, Check, Repeat, 
  Download, Trash2, XCircle, Search, Filter, Eye, Edit3, Zap, Clock, 
  User, CheckCircle2, RotateCcw, Loader2, Maximize, Minimize, ExternalLink, 
  ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Send, MessageCircle, 
  Users, Paperclip, Image, FileSpreadsheet, AlertCircle, CheckCheck, Archive, 
  Star, Tag, Calendar as CalendarIcon, Activity, Briefcase, Settings, 
  MoreVertical, Copy, Share, Pin, Network, Move, Save, Upload, MapPin,
  Building2, Phone, Mail, Timer, UserCheck, ClockIcon, Play, Pause,
  FileImage, FileVideo, FolderOpen, AlertTriangle, Info, Award, Home, Menu
} from 'lucide-react';
import { 
  doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, 
  orderBy, limit, serverTimestamp, where, getDocs, getDoc 
} from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// === MI CORRECCIÓN (FIX 11): Asignar el worker importado ===
// Ya no se usa CDN ni un archivo en /public.
// Se usa el worker importado que Vite procesa automáticamente.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// === MI CORRECCIÓN (FIX 12): Eliminar pdfOptions ===
// Estas opciones también causaban conflictos de versión.
// Al usar el worker importado, ya no son necesarias.
/*
const pdfOptions = {
  cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
  withCredentials: false,
  httpHeaders: {}
};
*/

// Hook para detectar dispositivos móviles
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
};

// Obtener información del usuario actual
const CURRENT_USER_ID = localStorage.getItem('usuario_id') || 'usuario_123';
const getCurrentUserName = () => {
  return localStorage.getItem('usuario.nombre') || 
         localStorage.getItem('usuario_nombre') ||
         localStorage.getItem('user_name') ||
         localStorage.getItem('nombre') ||
         sessionStorage.getItem('usuario.nombre') ||
         sessionStorage.getItem('user_name') ||
         'Usuario Actual';
};

const CURRENT_USER_NAME = getCurrentUserName();
const CURRENT_USER_ROL = localStorage.getItem('usuario.rol') || 'Usuario';

// Estados mejorados
const estados = [
  { 
    value: 'programado', 
    label: 'Programado', 
    color: 'text-blue-500', 
    bgColor: 'bg-blue-50', 
    border: 'border-blue-200', 
    icon: Calendar, 
    gradient: 'from-blue-500/20 to-blue-600/5',
    description: 'Servicio planificado, pendiente de inicio'
  },
  { 
    value: 'en_proceso', 
    label: 'En Proceso', 
    color: 'text-emerald-500', 
    bgColor: 'bg-emerald-50', 
    border: 'border-emerald-200', 
    icon: Play, 
    gradient: 'from-emerald-500/20 to-emerald-600/5',
    description: 'Servicio en ejecución activa'
  },
  { 
    value: 'finalizado', 
    label: 'Finalizado', 
    color: 'text-purple-500', 
    bgColor: 'bg-purple-50', 
    border: 'border-purple-200', 
    icon: CheckCircle2, 
    gradient: 'from-purple-500/20 to-purple-600/5',
    description: 'Servicio completado exitosamente'
  },
  { 
    value: 'reprogramacion', 
    label: 'Reprogramación', 
    color: 'text-amber-500', 
    bgColor: 'bg-amber-50', 
    border: 'border-amber-200', 
    icon: RotateCcw, 
    gradient: 'from-amber-500/20 to-amber-600/5',
    description: 'Servicio que requiere nueva programación'
  }
];

// Prioridades del servicio
const prioridades = [
  { value: 'baja', label: 'Baja', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: Info },
  { value: 'media', label: 'Media', color: 'text-blue-500', bgColor: 'bg-blue-100', icon: Clock },
  { value: 'alta', label: 'Alta', color: 'text-amber-500', bgColor: 'bg-amber-100', icon: AlertTriangle },
  { value: 'critica', label: 'Crítica', color: 'text-red-500', bgColor: 'bg-red-100', icon: AlertCircle }
];

// Tipos de servicios
const tiposServicio = [
  { value: 'calibracion', label: 'Calibración', icon: Settings },
  { value: 'mantenimiento', label: 'Mantenimiento', icon: Briefcase },
  { value: 'verificacion', label: 'Verificación', icon: CheckCircle2 },
  { value: 'reparacion', label: 'Reparación', icon: Zap },
  { value: 'inspeccion', label: 'Inspección', icon: Eye }
];

// Tipos de archivos soportados
const tiposArchivo = {
  pdf: { icon: FileText, color: 'text-red-500', label: 'PDF', category: 'document' },
  doc: { icon: FileText, color: 'text-blue-500', label: 'Word', category: 'document' },
  docx: { icon: FileText, color: 'text-blue-500', label: 'Word', category: 'document' },
  xls: { icon: FileSpreadsheet, color: 'text-green-500', label: 'Excel', category: 'spreadsheet' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-500', label: 'Excel', category: 'spreadsheet' },
  txt: { icon: FileText, color: 'text-gray-500', label: 'Texto', category: 'document' },
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

// Función mejorada para extraer nombre de archivo
const extraerNombreArchivo = (url: string): string => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const matches = decodedUrl.match(/\/([^\/\?]+)(\?|$)/);
    if (matches && matches[1]) {
      let fileName = matches[1];
      const timestampRegex = /^\d+_/;
      fileName = fileName.replace(timestampRegex, '');
      return fileName;
    }
    return url.split('/').pop()?.split('?')[0] || 'Archivo';
  } catch (error) {
    console.error('Error al extraer nombre de archivo:', error);
    return 'Archivo';
  }
};

// === MEJORA (FIX 1): Función para obtener extensión (limpia los query params) ===
// Esta función ahora quita el "?alt=media&token=..." antes de buscar la extensión.
const obtenerExtensionArchivo = (fileName: string): string => {
  // 1. Quitar los parámetros de consulta (query parameters)
  const nombreSinQuery = fileName.split('?')[0];
  // 2. Obtener la extensión del nombre limpio
  return nombreSinQuery.split('.').pop()?.toLowerCase() || '';
};

// Función para crear URL con token de acceso válido
const crearUrlAcceso = async (url: string): Promise<string> => {
  try {
    if (url.includes('firebasestorage.googleapis.com')) {
      const pathMatch = url.match(/\/o\/(.+?)\?/);
      if (pathMatch) {
        const filePath = decodeURIComponent(pathMatch[1]);
        const fileRef = ref(storage, filePath);
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

// Componente de estado visual responsive
const EstadoBadge = ({ estado, compact = false }: { estado: string; compact?: boolean }) => {
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
};

// Componente de prioridad responsive
const PrioridadBadge = ({ prioridad, compact = false }: { prioridad: string; compact?: boolean }) => {
  const prioridadInfo = prioridades.find(p => p.value === prioridad);
  if (!prioridadInfo) return null;
  
  const IconComponent = prioridadInfo.icon;
  
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${prioridadInfo.bgColor} ${prioridadInfo.color}`}>
      <IconComponent className="h-3 w-3" />
      <span className={compact ? "hidden sm:inline" : ""}>{prioridadInfo.label}</span>
    </div>
  );
};

// Componente de vista previa de archivos responsive
const FilePreview = ({ 
  file, 
  onRemove, 
  onView, 
  showActions = true,
  compact = false,
  isUrl = false
}: { 
  file: File | string; 
  onRemove?: () => void; 
  onView: () => void; 
  showActions?: boolean;
  compact?: boolean;
  isUrl?: boolean;
}) => {
  const [fileName, setFileName] = useState('');
  const [extension, setExtension] = useState('');

  useEffect(() => {
    let name = '';
    if (isUrl && typeof file === 'string') {
      name = extraerNombreArchivo(file);
    } else if (typeof file === 'string') {
      name = file;
    } else {
      name = file.name || 'Archivo';
    }
    
    setFileName(name);
    // Usamos la función corregida aquí también por si acaso
    setExtension(obtenerExtensionArchivo(name));
  }, [file, isUrl]);

  const tipoArchivo = tiposArchivo[extension as keyof typeof tiposArchivo] || tiposArchivo.default;
  const IconComponent = tipoArchivo.icon;

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleView = async () => {
    try {
      onView();
    } catch (error) {
      console.error('Error al abrir archivo:', error);
      toast.error('Error al abrir el archivo');
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
        <IconComponent className={`h-4 w-4 ${tipoArchivo.color} flex-shrink-0`} />
        <span className="text-sm text-gray-700 truncate flex-1" title={fileName}>
          {fileName}
        </span>
        {showActions && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={handleView}
              className="p-2 text-blue-500 hover:bg-blue-100 rounded transition-colors"
              title="Ver archivo"
            >
              <Eye className="h-4 w-4" />
            </button>
            {onRemove && (
              <button
                onClick={onRemove}
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer"
         onClick={handleView}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg ${tipoArchivo.color.replace('text-', 'bg-').replace('-500', '-100')} flex-shrink-0`}>
            <IconComponent className={`h-5 w-5 ${tipoArchivo.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate" title={fileName}>
              {fileName}
            </p>
            <p className="text-sm text-gray-500">
              {tipoArchivo.label}
              {typeof file !== 'string' && file.size && ` • ${formatFileSize(file.size)}`}
            </p>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 ml-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleView();
              }}
              className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
              title="Ver archivo"
            >
              <Eye className="h-4 w-4" />
            </button>
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
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
};

// Componente principal responsive
const FridayServiciosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const isMobile = useIsMobile();
  
  // Estados principales
  const [servicios, setServicios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
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
  const [servicioSeleccionado, setServicioSeleccionado] = useState<any | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [sidebarAbierto, setSidebarAbierto] = useState<boolean>(!isMobile);
  const [mostrarFiltros, setMostrarFiltros] = useState<boolean>(false);

  // Estados del formulario
  const [nuevoServicio, setNuevoServicio] = useState({
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
    archivos: [] as File[],
    notas: ''
  });

  // Estados de UI
  const [archivosSubiendo, setArchivosSubiendo] = useState<boolean>(false);
  const [archivoViendose, setArchivoViendose] = useState<string | null>(null);
  const [escalaZoom, setEscalaZoom] = useState<number>(isMobile ? 0.5 : 1);
  const [paginaPDF, setPaginaPDF] = useState<number>(1);
  const [totalPaginasPDF, setTotalPaginasPDF] = useState<number>(0);
  const [rotacionPDF, setRotacionPDF] = useState<number>(0);
  const [mensajeNuevo, setMensajeNuevo] = useState<string>('');
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [cargandoArchivo, setCargandoArchivo] = useState<boolean>(false);
  const [errorArchivo, setErrorArchivo] = useState<string>('');
  
  // Estado para contenido de texto
  const [contenidoTexto, setContenidoTexto] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Ref para el contenedor de comentarios
  const comentariosContainerRef = useRef<HTMLDivElement>(null);


  // Función para manejar navegación mejorada
  const manejarNavegacion = useCallback((destino: string) => {
    console.log('Navegando a:', destino); // Para debug
    
    // Cerrar sidebar móvil al navegar
    if (isMobile) {
      setSidebarAbierto(false);
    }
    
    // Mapear destinos específicos
    switch(destino) {
      case 'dashboard':
      case 'menu':
      case 'inicio':
        navigateTo('dashboard');
        break;
      case 'equipos':
      case 'equipos-calibracion':
      case 'equiposCalibracion':
        navigateTo('equiposCalibracion');
        break;
      case 'servicios':
        // Ya estamos aquí, no hacer nada
        break;
      case 'clientes':
        navigateTo('clientes');
        break;
      case 'usuarios':
        navigateTo('usuarios');
        break;
      case 'reportes':
        navigateTo('reportes');
        break;
      case 'configuracion':
        navigateTo('configuracion');
        break;
      default:
        // Intentar navegar al destino tal como viene
        try {
          navigateTo(destino);
        } catch (error) {
          console.error('Error de navegación:', error);
          // Fallback al dashboard si hay error
          navigateTo('dashboard');
        }
        break;
    }
  }, [navigateTo, isMobile]);

  // Cambiar vista automáticamente según el dispositivo
  useEffect(() => {
    if (isMobile && vistaActual === 'kanban') {
      setVistaActual('lista');
    }
    setSidebarAbierto(!isMobile);
    if (isMobile) {
      setEscalaZoom(0.5);
    }
  }, [isMobile]);

  // Cargar información del usuario actual
  useEffect(() => {
    const cargarUsuarioActual = async () => {
      try {
        if (CURRENT_USER_ID !== 'usuario_123') {
          const userDoc = await getDoc(doc(db, 'usuarios', CURRENT_USER_ID));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUserInfo(userData);
          }
        }
      } catch (error) {
        console.error('Error al cargar usuario actual:', error);
      }
    };

    cargarUsuarioActual();
  }, []);

  // Obtener nombre del usuario actual
  const getNombreUsuarioActual = useCallback(() => {
    if (currentUserInfo) {
      return currentUserInfo.name || 
             currentUserInfo.nombre || 
             currentUserInfo.correo || 
             currentUserInfo.email || 
             'Usuario Actual';
    }
    return CURRENT_USER_NAME;
  }, [currentUserInfo]);

  // Cargar datos iniciales
  useEffect(() => {
    const cargarDatos = async () => {
      setCargando(true);
      
      try {
        // Cargar servicios
        const serviciosQuery = query(
          collection(db, 'servicios'),
          orderBy('fechaCreacion', 'desc')
        );
        
        const unsubscribeServicios = onSnapshot(serviciosQuery, (snapshot) => {
          const serviciosData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setServicios(serviciosData);
          setCargando(false);
        });

        // Cargar usuarios
        const usuariosQuery = query(collection(db, 'usuarios'));
        const usuariosSnapshot = await getDocs(usuariosQuery);
        const usuariosData = usuariosSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsuarios(usuariosData);

        // Filtrar metrólogos (como estaba, maneja 'puesto' y 'position')
        const metrologosData = usuariosData.filter(usuario => {
          const position = usuario.position?.toLowerCase();
          const puesto = usuario.puesto?.toLowerCase();
          
          return position === 'metrologo' || 
                 position === 'metrólogo' || 
                 puesto === 'metrologo' || 
                 puesto === 'metrólogo';
        });
        setMetrologos(metrologosData);

        // Cargar clientes
        const clientesQuery = query(collection(db, 'clientes'));
        const clientesSnapshot = await getDocs(clientesQuery);
        const clientesData = clientesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClientes(clientesData);

        return () => {
          unsubscribeServicios();
        };
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar los datos');
        setCargando(false);
      }
    };

    cargarDatos();
  }, []);

  // Cargar comentarios y hacer scroll automático
  useEffect(() => {
    if (servicioSeleccionado) {
      const comentariosQuery = query(
        collection(db, 'comentarios'),
        where('servicioId', '==', servicioSeleccionado.id),
        orderBy('fecha', 'asc') // Orden ascendente para estilo chat
      );
      
      const unsubscribe = onSnapshot(comentariosQuery, (snapshot) => {
        const comentariosData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMensajes(comentariosData);
      }, (error) => { // Manejo de error para la query de comentarios
          console.error("Error en listener de comentarios: ", error);
          // Este es el error de índice que ves en la consola
          if (error.code === 'failed-precondition') {
            // No inundar al usuario con toasts, pero sí loguearlo
            console.error("Error de Firebase: Se requiere un índice. Haz clic en el enlace de la consola para crearlo.");
          }
      });

      return () => unsubscribe();
    }
  }, [servicioSeleccionado]);

  // Scroll automático al final de los comentarios
  useEffect(() => {
      if (comentariosContainerRef.current) {
          comentariosContainerRef.current.scrollTop = comentariosContainerRef.current.scrollHeight;
      }
  }, [mensajes]);


  // Servicios filtrados
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

  // Estadísticas
  const estadisticas = useMemo(() => {
    const total = servicios.length;
    const programados = servicios.filter(s => s.estado === 'programado').length;
    const enProceso = servicios.filter(s => s.estado === 'en_proceso').length;
    const finalizados = servicios.filter(s => s.estado === 'finalizado').length;
    const reprogramados = servicios.filter(s => s.estado === 'reprogramacion').length;
    
    return { total, programados, enProceso, finalizados, reprogramados };
  }, [servicios]);

  // Funciones de manejo de archivos
  const manejarSubidaArchivos = useCallback(async (files: FileList) => {
    setArchivosSubiendo(true);
    const nuevosArchivos: File[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size <= 10 * 1024 * 1024) { // Límite de 10MB
        nuevosArchivos.push(file);
      } else {
        toast.error(`El archivo ${file.name} es demasiado grande (máximo 10MB)`);
      }
    }
    
    setNuevoServicio(prev => ({
      ...prev,
      archivos: [...prev.archivos, ...nuevosArchivos]
    }));
    
    setArchivosSubiendo(false);
  }, []);

  // Manejar selección de cliente
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
        clienteId: '',
        cliente: '',
        contacto: '',
        telefono: '',
        email: '',
        ubicacion: ''
      }));
    }
  };

  // Función para ver archivos con soporte extendido
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
        setEscalaZoom(isMobile ? 0.5 : 1); // Reset de zoom
        setRotacionPDF(0); // Reset de rotación

        const extension = obtenerExtensionArchivo(urlAcceso); // Usa la función corregida
        const textExtensions = ['txt', 'csv', 'log', 'md'];

        if (textExtensions.includes(extension)) {
            const response = await fetch(urlAcceso);
            if (!response.ok) throw new Error('No se pudo cargar el contenido del archivo.');
            const textContent = await response.text();
            setContenidoTexto(textContent);
        }

    } catch (error: any) {
        console.error('Error al cargar archivo:', error);
        // Mostrar el error específico de PDF si es el caso
        if (error.message.includes('pdf')) {
          setErrorArchivo(`Error al cargar PDF: ${error.message}`);
        } else {
          setErrorArchivo('No se pudo cargar el archivo. Verifica los permisos de acceso.');
        }
        toast.error('Error al cargar el archivo');
        setArchivoViendose(archivoUrl); // Mostrar URL original si falla
    } finally {
        setCargandoArchivo(false);
    }
  }, [isMobile]);

  // Crear servicio
  const crearServicio = async () => {
    if (!nuevoServicio.titulo.trim()) {
      toast.error('El título es requerido');
      return;
    }

    if (nuevoServicio.personas.length === 0) {
      toast.error('Debe asignar al menos un metrólogo');
      return;
    }

    setCargando(true);

    try {
      const urlsArchivos: string[] = [];
      for (const archivo of nuevoServicio.archivos) {
        try {
          const timestamp = Date.now();
          const fileName = `${timestamp}_${archivo.name}`;
          const storageRef = ref(storage, `servicios/${fileName}`);
          const snapshot = await uploadBytes(storageRef, archivo);
          const url = await getDownloadURL(snapshot.ref);
          urlsArchivos.push(url);
        } catch (error) {
          console.error(`Error al subir archivo ${archivo.name}:`, error);
          toast.error(`Error al subir archivo ${archivo.name}`);
        }
      }

      const metrologosAsignados = metrologos.filter(m => 
        nuevoServicio.personas.includes(m.id)
      );

      const servicioData = {
        ...nuevoServicio,
        archivos: urlsArchivos,
        fechaCreacion: serverTimestamp(),
        creadoPor: CURRENT_USER_ID,
        creadoPorNombre: getNombreUsuarioActual(),
        personasNombres: metrologosAsignados.map(m => 
          m.name || m.nombre || m.correo || m.email || 'Metrólogo'
        ),
        ultimaActualizacion: serverTimestamp(),
        actualizadoPor: CURRENT_USER_ID
      };

      if (modoEdicion && servicioSeleccionado) {
        await updateDoc(doc(db, 'servicios', servicioSeleccionado.id), {
          ...servicioData,
          fechaCreacion: servicioSeleccionado.fechaCreacion
        });
        toast.success('Servicio actualizado exitosamente');
      } else {
        await addDoc(collection(db, 'servicios'), servicioData);
        toast.success('Servicio creado exitosamente');
      }

      // Resetear formulario
      setNuevoServicio({
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
        personas: [],
        archivos: [],
        notas: ''
      });
      
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

  // Agregar comentario
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
      toast.success('Comentario agregado');
    } catch (error) {
      console.error('Error al agregar comentario:', error);
      toast.error('Error al agregar comentario');
    }
  };
  
  // Actualizar estado del servicio
  const actualizarEstado = async (servicioId: string, nuevoEstado: string) => {
    try {
      await updateDoc(doc(db, 'servicios', servicioId), {
        estado: nuevoEstado,
        ultimaActualizacion: serverTimestamp(),
        actualizadoPor: CURRENT_USER_ID
      });
      toast.success('Estado actualizado');
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      toast.error('Error al actualizar estado');
    }
  };

  // Eliminar servicio
  const eliminarServicio = async (servicioId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este servicio?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'servicios', servicioId));
      toast.success('Servicio eliminado');
      setServicioSeleccionado(null);
    } catch (error) {
      console.error('Error al eliminar servicio:', error);
      toast.error('Error al eliminar servicio');
    }
  };

  // Editar servicio
  const editarServicio = (servicio: any) => {
    setNuevoServicio({
      titulo: servicio.titulo || '',
      descripcion: servicio.descripcion || '',
      tipo: servicio.tipo || 'calibracion',
      prioridad: servicio.prioridad || 'media',
      estado: servicio.estado || 'programado',
      fecha: servicio.fecha || '',
      horaInicio: servicio.horaInicio || '',
      horaFin: servicio.horaFin || '',
      ubicacion: servicio.ubicacion || '',
      clienteId: servicio.clienteId || '',
      cliente: servicio.cliente || '',
      contacto: servicio.contacto || '',
      telefono: servicio.telefono || '',
      email: servicio.email || '',
      personas: servicio.personas || [],
      archivos: [],
      notas: servicio.notas || ''
    });
    setModoEdicion(true);
    setMostrarFormulario(true);
  };
  
    // Vista Kanban responsive (para desktop)
  const VistaKanban = () => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6">
      {estados.map((estado) => {
        const serviciosDelEstado = serviciosFiltrados.filter(s => s.estado === estado.value);
        const IconComponent = estado.icon;
        
        return (
          <div key={estado.value} className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className={`p-3 lg:p-4 border-b border-gray-200 ${estado.bgColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconComponent className={`h-4 w-4 lg:h-5 lg:w-5 ${estado.color}`} />
                  <h3 className={`font-semibold text-sm lg:text-base ${estado.color}`}>{estado.label}</h3>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${estado.bgColor} ${estado.color}`}>
                  {serviciosDelEstado.length}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1 hidden lg:block">{estado.description}</p>
            </div>
            
            <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
              {serviciosDelEstado.map((servicio) => (
                <div
                  key={servicio.id}
                  onClick={() => setServicioSeleccionado(servicio)}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors border border-gray-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {servicio.titulo}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {servicio.descripcion}
                      </p>
                    </div>
                    <PrioridadBadge prioridad={servicio.prioridad} compact />
                  </div>
                  
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      {servicio.personas && servicio.personas.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {servicio.personas.length}
                          </span>
                        </div>
                      )}
                      {servicio.archivos && servicio.archivos.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {servicio.archivos.length}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {servicio.fecha}
                    </span>
                  </div>
                </div>
              ))}
              
              {serviciosDelEstado.length === 0 && (
                <div className="text-center py-6 lg:py-8 text-gray-500">
                  <div className={`inline-flex items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-full ${estado.bgColor} mb-3`}>
                    <IconComponent className={`h-5 w-5 lg:h-6 lg:w-6 ${estado.color}`} />
                  </div>
                  <p className="text-sm">No hay servicios</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Vista Lista optimizada para mobile
  const VistaLista = () => (
    <div className="space-y-3">
      {serviciosFiltrados.map((servicio) => (
        <div
          key={servicio.id}
          onClick={() => setServicioSeleccionado(servicio)}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate mb-1">
                {servicio.titulo}
              </h3>
              <p className="text-sm text-gray-500 line-clamp-2">
                {servicio.descripcion}
              </p>
            </div>
            <div className="ml-3 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  editarServicio(servicio);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between mb-3">
            <EstadoBadge estado={servicio.estado} compact />
            <PrioridadBadge prioridad={servicio.prioridad} compact />
          </div>
          
          {servicio.cliente && (
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600 truncate">{servicio.cliente}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-3">
              {servicio.personas && servicio.personas.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{servicio.personas.length}</span>
                </div>
              )}
              {servicio.archivos && servicio.archivos.length > 0 && (
                <div className="flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  <span>{servicio.archivos.length}</span>
                </div>
              )}
            </div>
            <span>{servicio.fecha || 'Sin fecha'}</span>
          </div>
        </div>
      ))}
      
      {serviciosFiltrados.length === 0 && (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No se encontraron servicios</h3>
          <p className="text-gray-500">Intenta cambiar los filtros o crea un nuevo servicio</p>
        </div>
      )}
    </div>
  );

  if (cargando && servicios.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Cargando servicios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar condicional para desktop */}
      {!isMobile && <SidebarFriday />}
      
      {/* Backdrop para sidebar móvil */}
      {isMobile && sidebarAbierto && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarAbierto(false)}
        />
      )}
      
      {/* Sidebar móvil */}
      {isMobile && (
        <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform ${
          sidebarAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <SidebarFriday />
        </div>
      )}
      
      <div className={`${!isMobile ? 'ml-64' : ''} p-4 lg:p-8`}>
        {/* Header móvil con menú hamburguesa y botón de regreso */}
        {isMobile && (
          <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              {/* Botón de regreso al menú principal para móvil */}
              <button
                onClick={() => manejarNavegacion('dashboard')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Regresar al menú principal"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setSidebarAbierto(true)}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
            <h1 className="font-bold text-lg text-gray-900">Servicios</h1>
            <button
              onClick={() => {
                setNuevoServicio({
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
                  personas: [],
                  archivos: [],
                  notas: ''
                });
                setModoEdicion(false);
                setMostrarFormulario(true);
              }}
              className="p-2 bg-blue-600 text-white rounded-lg"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Header desktop */}
        {!isMobile && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => manejarNavegacion('dashboard')}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Regresar al menú principal"
                >
                  <Home className="h-6 w-6" />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Gestión de Servicios</h1>
                  <p className="text-gray-600 mt-1">Organiza y supervisa todos los servicios de calibración</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setNuevoServicio({
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
                    personas: [],
                    archivos: [],
                    notas: ''
                  });
                  setModoEdicion(false);
                  setMostrarFormulario(true);
                }}
                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl"
              >
                <Plus className="h-5 w-5" />
                Nuevo Servicio
              </button>
            </div>

            {/* Estadísticas rápidas para desktop */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Briefcase className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="text-2xl font-bold text-gray-900">{estadisticas.total}</p>
                  </div>
                </div>
              </div>
              
              {estados.map((estado) => {
                const count = estadisticas[estado.value as keyof typeof estadisticas] || 0;
                const IconComponent = estado.icon;
                
                return (
                  <div key={estado.value} className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${estado.bgColor}`}>
                        <IconComponent className={`h-5 w-5 ${estado.color}`} />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">{estado.label}</p>
                        <p className={`text-2xl font-bold ${estado.color}`}>{count}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Estadísticas móviles compactas */}
        {isMobile && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white p-3 rounded-lg shadow-sm text-center">
              <p className="text-lg font-bold text-gray-900">{estadisticas.total}</p>
              <p className="text-xs text-gray-600">Total</p>
            </div>
            <div className="bg-white p-3 rounded-lg shadow-sm text-center">
              <p className="text-lg font-bold text-emerald-600">{estadisticas.enProceso}</p>
              <p className="text-xs text-gray-600">En Proceso</p>
            </div>
          </div>
        )}

        {/* Controles y filtros responsive */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 lg:mb-6">
          <div className="p-4 lg:p-6">
            {/* Búsqueda */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar servicios..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Botón de filtros móvil */}
            {isMobile && (
              <button
                onClick={() => setMostrarFiltros(!mostrarFiltros)}
                className="w-full flex items-center justify-center gap-2 p-3 border border-gray-300 rounded-lg text-gray-700 mb-4"
              >
                <Filter className="h-4 w-4" />
                Filtros
                <ChevronLeft className={`h-4 w-4 transform transition-transform ${mostrarFiltros ? 'rotate-90' : '-rotate-90'}`} />
              </button>
            )}

            {/* Filtros */}
            <div className={`${isMobile && !mostrarFiltros ? 'hidden' : 'flex'} flex-col lg:flex-row gap-3 mb-4 lg:mb-0`}>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos los estados</option>
                {estados.map(estado => (
                  <option key={estado.value} value={estado.value}>
                    {estado.label}
                  </option>
                ))}
              </select>

              <select
                value={filtroPrioridad}
                onChange={(e) => setFiltroPrioridad(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todas las prioridades</option>
                {prioridades.map(prioridad => (
                  <option key={prioridad.value} value={prioridad.value}>
                    {prioridad.label}
                  </option>
                ))}
              </select>

              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos los tipos</option>
                {tiposServicio.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de vista para desktop */}
            {!isMobile && (
              <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
                <button
                  onClick={() => setVistaActual('kanban')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    vistaActual === 'kanban' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Kanban
                </button>
                <button
                  onClick={() => setVistaActual('lista')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    vistaActual === 'lista' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Lista
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Vista principal responsive */}
        {!isMobile && vistaActual === 'kanban' ? <VistaKanban /> : <VistaLista />}

        {/* Modal de formulario responsive */}
        {mostrarFormulario && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 lg:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 lg:px-6 py-4 rounded-t-2xl">
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
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 lg:h-6 lg:w-6" />
                  </button>
                </div>
              </div>

              <div className="p-4 lg:p-6 space-y-6">
                {/* Información básica */}
                <div className="grid grid-cols-1 gap-4 lg:gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Título del servicio *
                    </label>
                    <input
                      type="text"
                      value={nuevoServicio.titulo}
                      onChange={(e) => setNuevoServicio(prev => ({ ...prev, titulo: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: Calibración de balanza analítica"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción
                    </label>
                    <textarea
                      value={nuevoServicio.descripcion}
                      onChange={(e) => setNuevoServicio(prev => ({ ...prev, descripcion: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Describe los detalles del servicio..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de servicio
                      </label>
                      <select
                        value={nuevoServicio.tipo}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, tipo: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {tiposServicio.map(tipo => (
                          <option key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prioridad
                      </label>
                      <select
                        value={nuevoServicio.prioridad}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, prioridad: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {prioridades.map(prioridad => (
                          <option key={prioridad.value} value={prioridad.value}>
                            {prioridad.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Estado
                      </label>
                      <select
                        value={nuevoServicio.estado}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, estado: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {estados.map(estado => (
                          <option key={estado.value} value={estado.value}>
                            {estado.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fecha programada
                      </label>
                      <input
                        type="date"
                        value={nuevoServicio.fecha}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, fecha: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hora de inicio
                      </label>
                      <input
                        type="time"
                        value={nuevoServicio.horaInicio}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, horaInicio: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hora de fin
                      </label>
                      <input
                        type="time"
                        value={nuevoServicio.horaFin}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, horaFin: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Información del cliente */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Cliente</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cliente/Empresa *
                      </label>
                      <select
                        value={nuevoServicio.clienteId}
                        onChange={(e) => manejarSeleccionCliente(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Seleccionar cliente...</option>
                        {clientes.map(cliente => (
                          <option key={cliente.id} value={cliente.id}>
                            {cliente.nombre || cliente.razonSocial || 'Sin nombre'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Persona de contacto
                        </label>
                        <input
                          type="text"
                          value={nuevoServicio.contacto}
                          onChange={(e) => setNuevoServicio(prev => ({ ...prev, contacto: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Nombre del contacto"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={nuevoServicio.telefono}
                          onChange={(e) => setNuevoServicio(prev => ({ ...prev, telefono: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Número de teléfono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={nuevoServicio.email}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="correo@ejemplo.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ubicación
                      </label>
                      <input
                        type="text"
                        value={nuevoServicio.ubicacion}
                        onChange={(e) => setNuevoServicio(prev => ({ ...prev, ubicacion: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Dirección donde se realizará el servicio"
                      />
                    </div>
                  </div>
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
                      <p className="text-sm">Verifica que existan usuarios con rol de Metrólogo</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {metrologos.map((metrologo) => (
                        <label
                          key={metrologo.id}
                          className="flex items-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={nuevoServicio.personas.includes(metrologo.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNuevoServicio(prev => ({
                                  ...prev,
                                  personas: [...prev.personas, metrologo.id]
                                }));
                              } else {
                                setNuevoServicio(prev => ({
                                  ...prev,
                                  personas: prev.personas.filter(id => id !== metrologo.id)
                                }));
                              }
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notas adicionales
                  </label>
                  <textarea
                    value={nuevoServicio.notas}
                    onChange={(e) => setNuevoServicio(prev => ({ ...prev, notas: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Observaciones importantes..."
                  />
                </div>

                {/* Archivos adjuntos */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Archivos Adjuntos</h3>
                  
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 lg:p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files.length > 0) {
                        manejarSubidaArchivos(e.dataTransfer.files);
                      }
                    }}
                  >
                    <Upload className="h-10 w-10 lg:h-12 lg:w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-base lg:text-lg font-medium text-gray-900 mb-2">
                      {isMobile ? 'Seleccionar archivos' : 'Arrastra archivos aquí o haz clic para seleccionar'}
                    </p>
                    <p className="text-gray-500 text-sm lg:text-base">
                      Soporta PDF, Word, Excel, imágenes y más (máximo 10MB por archivo)
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

                  {nuevoServicio.archivos.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="font-medium text-gray-900">Archivos seleccionados:</h4>
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
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 lg:px-6 py-4 rounded-b-2xl">
                <div className="flex flex-col-reverse lg:flex-row justify-end gap-3">
                  <button
                    onClick={() => {
                      setMostrarFormulario(false);
                      setModoEdicion(false);
                      setServicioSeleccionado(null);
                    }}
                    className="w-full lg:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={crearServicio}
                    disabled={cargando || archivosSubiendo}
                    className="w-full lg:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {cargando || archivosSubiendo ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {modoEdicion ? 'Actualizar Servicio' : 'Crear Servicio'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de detalles del servicio responsive */}
        {servicioSeleccionado && !mostrarFormulario && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 lg:p-4">
            <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[95vh] ${
              isMobile ? 'flex flex-col' : 'max-w-screen-xl flex overflow-hidden'
            }`}>
              
              {/* === MEJORA (FIX 2): Panel principal de detalles === */}
              {/* Se añade "min-h-0" para forzar el cálculo correcto de altura en flexbox y permitir el scroll en móvil */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg lg:text-2xl font-bold text-gray-900 mb-2 truncate">
                        {servicioSeleccionado.titulo}
                      </h2>
                      <div className="flex items-center gap-2 lg:gap-4">
                        <EstadoBadge estado={servicioSeleccionado.estado} compact={isMobile} />
                        <PrioridadBadge prioridad={servicioSeleccionado.prioridad} compact={isMobile} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        onClick={() => editarServicio(servicioSeleccionado)}
                        className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Editar servicio"
                      >
                        <Edit3 className="h-4 w-4 lg:h-5 lg:w-5" />
                      </button>
                      <button
                        onClick={() => eliminarServicio(servicioSeleccionado.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar servicio"
                      >
                        <Trash2 className="h-4 w-4 lg:h-5 lg:w-5" />
                      </button>
                      <button
                        onClick={() => setServicioSeleccionado(null)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X className="h-5 w-5 lg:h-6 lg:w-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Contenido principal scrolleable */}
                {/* Este div ahora debería scrollear correctamente gracias al "min-h-0" de su padre */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
                  {/* Descripción */}
                  <div className="bg-gray-50 rounded-xl p-4 lg:p-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Descripción</h3>
                    <p className="text-gray-700 leading-relaxed text-sm lg:text-base">
                      {servicioSeleccionado.descripcion || 'Sin descripción proporcionada'}
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
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-sm lg:text-base">Tipo:</span>
                          <span className="font-medium text-gray-900 text-sm lg:text-base">
                            {tiposServicio.find(t => t.value === servicioSeleccionado.tipo)?.label || servicioSeleccionado.tipo}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-sm lg:text-base">Fecha:</span>
                          <span className="font-medium text-gray-900 text-sm lg:text-base">
                            {servicioSeleccionado.fecha || 'No especificada'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-sm lg:text-base">Horario:</span>
                          <span className="font-medium text-gray-900 text-sm lg:text-base">
                            {servicioSeleccionado.horaInicio && servicioSeleccionado.horaFin
                              ? `${servicioSeleccionado.horaInicio} - ${servicioSeleccionado.horaFin}`
                              : 'No especificado'
                            }
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Información del cliente */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Building2 className="h-4 w-4 lg:h-5 lg:w-5 text-green-500" />
                        <span className="text-sm lg:text-base">Información del Cliente</span>
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-sm lg:text-base">Cliente:</span>
                          <span className="font-medium text-gray-900 text-sm lg:text-base">
                            {servicioSeleccionado.cliente || 'No especificado'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-sm lg:text-base">Contacto:</span>
                          <span className="font-medium text-gray-900 text-sm lg:text-base">
                            {servicioSeleccionado.contacto || 'No especificado'}
                          </span>
                        </div>
                        {servicioSeleccionado.telefono && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 text-sm lg:text-base">Teléfono:</span>
                            <a 
                              href={`tel:${servicioSeleccionado.telefono}`}
                              className="font-medium text-blue-600 hover:underline flex items-center gap-1 text-sm lg:text-base"
                            >
                              <Phone className="h-3 w-3 lg:h-4 lg:w-4" />
                              {servicioSeleccionado.telefono}
                            </a>
                          </div>
                        )}
                        {servicioSeleccionado.email && (
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500 text-sm lg:text-base">Email:</span>
                            <a 
                              href={`mailto:${servicioSeleccionado.email}`}
                              className="font-medium text-blue-600 hover:underline flex items-center gap-1 text-sm lg:text-base"
                            >
                              <Mail className="h-3 w-3 lg:h-4 lg:w-4" />
                              {servicioSeleccionado.email}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Metrólogos asignados */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Users className="h-4 w-4 lg:h-5 lg:w-5 text-purple-500" />
                      <span className="text-sm lg:text-base">Metrólogos Asignados</span>
                    </h3>
                    {servicioSeleccionado.personas && servicioSeleccionado.personas.length > 0 ? (
                      <div className="space-y-3">
                        {servicioSeleccionado.personas.map((personaId: string, index: number) => {
                          const metrologo = metrologos.find(m => m.id === personaId);
                          return (
                            <div key={personaId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                              <div className="w-8 h-8 lg:w-10 lg:h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="h-4 w-4 lg:h-5 lg:w-5 text-purple-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-sm lg:text-base truncate">
                                  {metrologo?.name || metrologo?.nombre || 
                                   servicioSeleccionado.personasNombres?.[index] || 
                                   metrologo?.correo || metrologo?.email || 
                                   `Metrólogo ${index + 1}`}
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

                  {/* Archivos adjuntos */}
                  {servicioSeleccionado.archivos && servicioSeleccionado.archivos.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Paperclip className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                        <span className="text-sm lg:text-base">Archivos Adjuntos ({servicioSeleccionado.archivos.length})</span>
                      </h3>
                      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                        {servicioSeleccionado.archivos.map((archivo: string, index: number) => (
                          <FilePreview
                            key={index}
                            file={archivo}
                            onView={() => verArchivo(archivo)}
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
                    <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Info className="h-4 w-4 lg:h-5 lg:w-5 text-blue-500" />
                        <span className="text-sm lg:text-base">Notas Adicionales</span>
                      </h3>
                      <p className="text-gray-900 text-sm lg:text-base">{servicioSeleccionado.notas}</p>
                      <div className="pt-4 border-t border-gray-100 mt-4">
                        <p className="text-xs text-gray-500">
                          Creado por {servicioSeleccionado.creadoPorNombre || 'Usuario'} el {' '}
                          {servicioSeleccionado.fechaCreacion?.toDate?.()?.toLocaleDateString() || 'Fecha no disponible'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Acciones rápidas */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
                    <h3 className="font-semibold text-gray-900 mb-4 text-sm lg:text-base">Acciones Rápidas</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
                      {estados.map((estado) => {
                        if (estado.value === servicioSeleccionado.estado) return null;
                        const IconComponent = estado.icon;
                        
                        return (
                          <button
                            key={estado.value}
                            onClick={() => actualizarEstado(servicioSeleccionado.id, estado.value)}
                            className={`p-2 lg:p-3 rounded-lg border-2 border-dashed transition-all hover:scale-105 ${estado.border} hover:${estado.bgColor} flex flex-col lg:flex-row items-center gap-1 lg:gap-2 text-xs lg:text-sm font-medium ${estado.color}`}
                          >
                            <IconComponent className="h-3 w-3 lg:h-4 lg:w-4" />
                            <span className="text-center lg:text-left">{estado.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel lateral de comentarios para desktop - en mobile se omite para ahorrar espacio */}
              {!isMobile && (
                <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <MessageCircle className="h-5 w-5 text-blue-500" />
                      Comentarios y Seguimiento
                    </h3>
                  </div>
                  
                  <div ref={comentariosContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {mensajes.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="font-medium">No hay comentarios aún</p>
                        <p className="text-sm">Sé el primero en comentar</p>
                      </div>
                    ) : (
                      mensajes.map((mensaje) => (
                        <div key={mensaje.id} className="bg-white rounded-lg p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-gray-900">{mensaje.autor}</p>
                                <span className="text-xs text-gray-500">
                                  {mensaje.fecha?.toDate?.()?.toLocaleString() || 'Ahora'}
                                </span>
                              </div>
                              <p className="text-gray-700 text-sm">{mensaje.mensaje}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="p-4 border-t border-gray-200">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mensajeNuevo}
                        onChange={(e) => setMensajeNuevo(e.target.value)}
                        placeholder="Agregar un comentario..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && mensajeNuevo.trim()) {
                            agregarComentario();
                          }
                        }}
                      />
                      <button
                        onClick={agregarComentario}
                        disabled={!mensajeNuevo.trim()}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visor de archivos optimizado */}
        {archivoViendose && (
            <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-2 lg:p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
                    <header className="flex items-center justify-between p-3 lg:p-4 border-b border-gray-200">
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base lg:text-lg font-semibold text-gray-900 truncate">Vista previa del archivo</h3>
                            <p className="text-xs lg:text-sm text-gray-500 truncate">{extraerNombreArchivo(archivoViendose)}</p>
                        </div>
                        <div className="flex items-center gap-1 lg:gap-2 ml-2">
                            <a href={archivoViendose} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Abrir en nueva pestaña"><ExternalLink className="h-4 w-4" /></a>
                            <button onClick={() => setArchivoViendose(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Cerrar"><X className="h-4 w-4" /></button>
                        </div>
                    </header>
                    <main className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
                        {cargandoArchivo ? (
                            <div className="text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
                        ) : errorArchivo ? (
                            <div className="text-center text-red-500 p-8">{errorArchivo}</div>
                        ) : (() => {
                            const extension = obtenerExtensionArchivo(archivoViendose); // Usa la función corregida
                            const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
                            const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

                            if (extension === 'pdf') {
                                return (
                                  <div className="relative w-full h-full flex flex-col items-center">
                                    {/* Barra de Controles de PDF */}
                                    <div className="bg-gray-800 text-white p-2 rounded-lg flex items-center gap-2 lg:gap-4 z-10 sticky top-2 shadow-lg text-xs lg:text-sm">
                                      {/* Navegación de Página */}
                                      <button 
                                        onClick={() => setPaginaPDF(p => Math.max(1, p - 1))} 
                                        disabled={paginaPDF <= 1}
                                        className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50"
                                        title="Página anterior"
                                      >
                                        <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" />
                                      </button>
                                      <span>Página {paginaPDF} de {totalPaginasPDF || '...'}</span>
                                      <button 
                                        onClick={() => setPaginaPDF(p => Math.min(totalPaginasPDF, p + 1))} 
                                        disabled={!totalPaginasPDF || paginaPDF >= totalPaginasPDF}
                                        className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50"
                                        title="Página siguiente"
                                      >
                                        <ChevronRight className="h-4 w-4 lg:h-5 lg:w-5" />
                                      </button>
                                      
                                      <div className="border-l border-gray-600 h-6 mx-1 lg:mx-2"></div>

                                      {/* Zoom */}
                                      <button onClick={() => setEscalaZoom(z => Math.max(0.2, z - 0.2))} className="p-1 rounded-full hover:bg-gray-700" title="Alejar">
                                        <ZoomOut className="h-4 w-4 lg:h-5 lg:w-5" />
                                      </button>
                                      <span>{(escalaZoom * 100).toFixed(0)}%</span>
                                      <button onClick={() => setEscalaZoom(z => z + 0.2)} className="p-1 rounded-full hover:bg-gray-700" title="Acercar">
                                        <ZoomIn className="h-4 w-4 lg:h-5 lg:w-5" />
                                      </button>
                                      
                                      <div className="border-l border-gray-600 h-6 mx-1 lg:mx-2"></div>
                                      
                                      {/* Rotación */}
                                      <button onClick={() => setRotacionPDF(r => (r + 90) % 360)} className="p-1 rounded-full hover:bg-gray-700" title="Rotar 90°">
                                        <RotateCw className="h-4 w-4 lg:h-5 lg:w-5" />
                                      </button>
                                    </div>

                                    {/* Contenedor del Documento PDF */}
                                    <div className="overflow-auto w-full h-full p-4 flex justify-center">
                                      <Document
                                        file={archivoViendose}
                                        // options={pdfOptions} // <--- Ya no se necesita
                                        onLoadSuccess={({ numPages }) => {
                                          setTotalPaginasPDF(numPages);
                                          setPaginaPDF(1); // Resetear a página 1 en cada carga
                                        }}
                                        onLoadError={(error) => setErrorArchivo(`Error al cargar PDF: ${error.message}`)}
                                        loading={<Loader2 className="h-8 w-8 animate-spin text-blue-500" />}
                                      >
                                        <Page
                                          pageNumber={paginaPDF}
                                          scale={escalaZoom}
                                          rotate={rotacionPDF}
                                        />
                                      </Document>
                                    </div>
                                  </div>
                                );
                            }

                            // Ahora 'png' coincidirá aquí
                            if (imageExtensions.includes(extension)) {
                                return <img src={archivoViendose} alt="Vista previa" className="max-w-full max-h-full object-contain" />;
                            }
                            if (contenidoTexto !== null) {
                                return <pre className="whitespace-pre-wrap text-sm p-4 bg-white rounded-md w-full h-full overflow-auto">{contenidoTexto}</pre>;
                            }
                            if (officeExtensions.includes(extension)) {
                                return <iframe src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(archivoViendose)}`} width='100%' height='100%' frameBorder='0'></iframe>;
                            }
                            // Fallback para otros archivos
                            return (
                                <div className="text-center py-8 lg:py-12 px-4 lg:px-6 bg-white rounded-lg shadow-lg max-w-sm">
                                    <FileText className="h-16 w-16 lg:h-24 lg:w-24 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-2">Vista previa no disponible</h3>
                                    <p className="text-gray-500 mb-4 text-sm lg:text-base">Este tipo de archivo ({extension.toUpperCase()}) no se puede previsualizar.</p>
                                    <a href={archivoViendose} download className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto text-sm lg:text-base">
                                        <Download className="h-4 w-4" />
                                        Descargar archivo
                                    </a>
                                </div>
                            );
                        })()}
                    </main>
                </div>
            </div>
        )}

        {/* Botón flotante para agregar servicio en móvil */}
        {isMobile && (
          <button
            onClick={() => {
              setNuevoServicio({
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
                personas: [],
                archivos: [],
                notas: ''
              });
              setModoEdicion(false);
              setMostrarFormulario(true);
            }}
            className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200 flex items-center justify-center z-40"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default FridayServiciosScreen;