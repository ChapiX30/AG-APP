import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import SidebarFriday from './SidebarFriday';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ArrowLeft, Plus, Calendar, Bell, FileText, FileUp, X, Check,
  Repeat, Download, Trash2, XCircle, Search, Filter, Eye, Edit3,
  Zap, Clock, User, CheckCircle2, RotateCcw, Loader2, Maximize, Minimize,
  ExternalLink, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight,
  Send, MessageCircle, Users, Paperclip, Image, FileSpreadsheet,
  AlertCircle, CheckCheck, Archive, Star, Tag, Calendar as CalendarIcon,
  Activity, Briefcase, Settings, MoreVertical, Copy, Share, Pin,
  Network, Move, Save, Upload
} from 'lucide-react';
import { doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const CURRENT_USER_ID = localStorage.getItem('usuario_id') || 'usuario_123';
const CURRENT_USER_NAME = localStorage.getItem('usuario.nombre') || 'Mi Usuario';

// Estados originales
const estados = [
  { value: 'programado', label: 'Programado', color: 'text-blue-400', bgColor: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Calendar, gradient: 'from-blue-500/20 to-blue-600/5' },
  { value: 'en_proceso', label: 'En Proceso', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Clock, gradient: 'from-emerald-500/20 to-emerald-600/5' },
  { value: 'finalizado', label: 'Finalizado', color: 'text-purple-400', bgColor: 'bg-purple-500/10', border: 'border-purple-500/30', icon: CheckCircle2, gradient: 'from-purple-500/20 to-purple-600/5' },
  { value: 'reprogramacion', label: 'Reprogramación', color: 'text-red-400', bgColor: 'bg-red-500/10', border: 'border-red-500/30', icon: RotateCcw, gradient: 'from-red-500/20 to-red-600/5' }
];

// Tipos de archivos soportados
const tiposArchivo = {
  pdf: { icon: FileText, color: 'text-red-500', label: 'PDF' },
  doc: { icon: FileText, color: 'text-blue-500', label: 'Word' },
  docx: { icon: FileText, color: 'text-blue-500', label: 'Word' },
  xls: { icon: FileSpreadsheet, color: 'text-green-500', label: 'Excel' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-500', label: 'Excel' },
  txt: { icon: FileText, color: 'text-gray-500', label: 'Texto' },
  csv: { icon: FileSpreadsheet, color: 'text-green-600', label: 'CSV' },
  png: { icon: Image, color: 'text-purple-500', label: 'PNG' },
  jpg: { icon: Image, color: 'text-purple-500', label: 'JPG' },
  jpeg: { icon: Image, color: 'text-purple-500', label: 'JPEG' },
  gif: { icon: Image, color: 'text-purple-500', label: 'GIF' },
  default: { icon: FileText, color: 'text-gray-500', label: 'Archivo' }
};

// Componente de vista previa de archivos
const FilePreview = ({ file, onRemove, onView, showActions = true }: { 
  file: File | any; 
  onRemove?: () => void; 
  onView: () => void;
  showActions?: boolean;
}) => {
  const [ext, setExt] = useState('');
  
  useEffect(() => {
    const fileName = typeof file === 'string' ? file : file.name || file.nombre || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    setExt(extension);
  }, [file]);

  const tipoArchivo = tiposArchivo[ext as keyof typeof tiposArchivo] || tiposArchivo.default;
  const IconComponent = tipoArchivo.icon;
  const fileName = typeof file === 'string' ? file : file.name || file.nombre || 'Archivo';

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="group bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 hover:bg-gray-800/60 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3 flex-1">
          <div className={`p-2 rounded-lg bg-gray-800/50 ${tipoArchivo.color} bg-opacity-10`}>
            <IconComponent className={`h-6 w-6 ${tipoArchivo.color}`} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-200 truncate">
              {fileName}
            </h4>
            <p className="text-xs text-gray-400">
              {tipoArchivo.label} {file.size && `• ${formatFileSize(file.size)}`}
            </p>
          </div>
        </div>
        
        {showActions && (
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onView}
              className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
              title="Ver archivo"
            >
              <Eye className="h-4 w-4 text-gray-400" />
            </button>
            <button
              onClick={() => {
                if (file.url || typeof file === 'string') {
                  const link = document.createElement('a');
                  link.href = file.url || file;
                  link.download = fileName;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              }}
              className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
              title="Descargar"
            >
              <Download className="h-4 w-4 text-gray-400" />
            </button>
            {onRemove && (
              <button
                onClick={onRemove}
                className="p-1.5 hover:bg-red-600/20 rounded-lg transition-colors"
                title="Eliminar archivo"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Chat de actualizaciones por servicio
const ChatServicio = ({ 
  servicioId, 
  isOpen, 
  onClose 
}: { 
  servicioId: string; 
  isOpen: boolean; 
  onClose: () => void; 
}) => {
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [archivosChat, setArchivosChat] = useState<File[]>([]);
  const [cargandoMensajes, setCargandoMensajes] = useState(true);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar mensajes del chat
  useEffect(() => {
    if (!isOpen || !servicioId) return;

    setCargandoMensajes(true);
    const chatCollection = collection(db, 'servicios', servicioId, 'chat');
    const q = query(chatCollection, orderBy('timestamp', 'asc'), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mensajesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));
      
      setMensajes(mensajesData);
      setCargandoMensajes(false);
    }, (error) => {
      console.error('Error al cargar mensajes:', error);
      setCargandoMensajes(false);
    });

    return () => unsubscribe();
  }, [servicioId, isOpen]);

  // Scroll al final cuando hay nuevos mensajes
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensajes]);

  // Enviar mensaje
  const enviarMensaje = async () => {
    if (!nuevoMensaje.trim() && archivosChat.length === 0) return;

    setEnviandoMensaje(true);
    try {
      const adjuntos = [];

      // Subir archivos adjuntos
      for (const archivo of archivosChat) {
        const archivoRef = ref(storage, `chat/${servicioId}/${Date.now()}_${archivo.name}`);
        const snapshot = await uploadBytes(archivoRef, archivo);
        const url = await getDownloadURL(snapshot.ref);
        
        adjuntos.push({
          nombre: archivo.name,
          url,
          tipo: archivo.type,
          tamaño: archivo.size
        });
      }

      // Crear mensaje
      const mensajeData = {
        mensaje: nuevoMensaje.trim(),
        autorId: CURRENT_USER_ID,
        autorNombre: CURRENT_USER_NAME,
        timestamp: serverTimestamp(),
        adjuntos: adjuntos.length > 0 ? adjuntos : null,
        tipo: 'mensaje'
      };

      const chatCollection = collection(db, 'servicios', servicioId, 'chat');
      await addDoc(chatCollection, mensajeData);

      // Limpiar formulario
      setNuevoMensaje('');
      setArchivosChat([]);
      
      toast.success('Mensaje enviado');
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      toast.error('Error al enviar el mensaje');
    } finally {
      setEnviandoMensaje(false);
    }
  };

  // Manejar archivos del chat
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setArchivosChat(prev => [...prev, ...files].slice(0, 5)); // Límite de 5 archivos
  };

  const removeFileFromChat = (index: number) => {
    setArchivosChat(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col border border-gray-700">
        {/* Header del chat */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <MessageCircle className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Chat de Actualizaciones</h3>
              <p className="text-sm text-gray-400">Comentarios y actualizaciones del servicio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Mensajes */}
        <div 
          ref={chatRef}
          className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-900/50"
        >
          {cargandoMensajes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-400">Cargando mensajes...</span>
            </div>
          ) : mensajes.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No hay mensajes aún</p>
              <p className="text-sm text-gray-500">Sé el primero en comentar</p>
            </div>
          ) : (
            mensajes.map((mensaje) => (
              <div
                key={mensaje.id}
                className={`flex ${mensaje.autorId === CURRENT_USER_ID ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md ${mensaje.autorId === CURRENT_USER_ID ? 'order-2' : 'order-1'}`}>
                  {mensaje.autorId !== CURRENT_USER_ID && (
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="h-6 w-6 rounded-full bg-gray-600 flex items-center justify-center">
                        <User className="h-3 w-3 text-gray-300" />
                      </div>
                      <span className="text-xs text-gray-400">{mensaje.autorNombre || 'Usuario'}</span>
                    </div>
                  )}
                  
                  <div className={`p-3 rounded-2xl ${
                    mensaje.autorId === CURRENT_USER_ID
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-100'
                  }`}>
                    {mensaje.mensaje && (
                      <p className="text-sm whitespace-pre-wrap">{mensaje.mensaje}</p>
                    )}
                    
                    {mensaje.adjuntos && mensaje.adjuntos.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {mensaje.adjuntos.map((adjunto: any, index: number) => (
                          <div
                            key={index}
                            className="flex items-center space-x-2 p-2 bg-black/20 rounded-lg"
                          >
                            <Paperclip className="h-4 w-4" />
                            <span className="text-xs flex-1">{adjunto.nombre}</span>
                            <button
                              onClick={() => window.open(adjunto.url, '_blank')}
                              className="text-xs hover:underline"
                            >
                              Ver
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-1 text-xs text-gray-500 text-right">
                    {mensaje.timestamp?.toLocaleTimeString('es-ES', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input de mensaje */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/80">
          {/* Preview de archivos seleccionados */}
          {archivosChat.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {archivosChat.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-2 bg-gray-800 rounded-lg px-3 py-2"
                >
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-300">{file.name}</span>
                  <button
                    onClick={() => removeFileFromChat(index)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.gif"
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Adjuntar archivo"
            >
              <Paperclip className="h-5 w-5 text-gray-400" />
            </button>

            <div className="flex-1 relative">
              <textarea
                value={nuevoMensaje}
                onChange={(e) => setNuevoMensaje(e.target.value)}
                placeholder="Escribe una actualización..."
                rows={1}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    enviarMensaje();
                  }
                }}
              />
            </div>

            <button
              onClick={enviarMensaje}
              disabled={(!nuevoMensaje.trim() && archivosChat.length === 0) || enviandoMensaje}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-xl transition-colors disabled:cursor-not-allowed"
            >
              {enviandoMensaje ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Send className="h-5 w-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente principal
const FridayServiciosScreen = () => {
  // Estados principales
  const [servicios, setServicios] = useState<any[]>([]);
  const [servicioSeleccionado, setServicioSeleccionado] = useState<any>(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [chatAbierto, setChatAbierto] = useState(false);
  const [servicioChat, setServicioChat] = useState<string>('');
  
  // Estados de filtros y búsqueda
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [vistaActiva, setVistaActiva] = useState<'grid' | 'kanban' | 'lista'>('grid');

  // Estados del formulario de edición
  const [formularioEdicion, setFormularioEdicion] = useState({
    elemento: '',
    descripcion: '',
    estado: 'programado',
    fecha: '',
    personas: [] as string[],
    documentos: [] as any[]
  });

  // Estados para archivos
  const [archivosSubir, setArchivosSubir] = useState<File[]>([]);
  const [subiendoArchivos, setSubiendoArchivos] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Estados de UI
  const [cargando, setCargando] = useState(true);
  const [mostrarVisorPDF, setMostrarVisorPDF] = useState(false);
  const [archivoVisor, setArchivoVisor] = useState<any>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { goBack } = useNavigation();

  // Cargar servicios desde Firebase (lógica original)
  useEffect(() => {
    setCargando(true);
    const serviciosCollection = collection(db, 'servicios');
    
    const unsubscribe = onSnapshot(serviciosCollection, (snapshot) => {
      const serviciosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setServicios(serviciosData);
      setCargando(false);
    }, (error) => {
      console.error('Error al cargar servicios:', error);
      toast.error('Error al cargar los servicios');
      setCargando(false);
    });

    return () => unsubscribe();
  }, []);

  // Filtrar servicios
  const serviciosFiltrados = useMemo(() => {
    return servicios.filter(servicio => {
      const matchBusqueda = busqueda === '' || 
        (servicio.elemento && servicio.elemento.toLowerCase().includes(busqueda.toLowerCase())) ||
        (servicio.descripcion && servicio.descripcion.toLowerCase().includes(busqueda.toLowerCase()));

      const matchEstado = filtroEstado === 'todos' || servicio.estado === filtroEstado;

      return matchBusqueda && matchEstado;
    });
  }, [servicios, busqueda, filtroEstado]);

  // Abrir modal de edición
  const editarServicio = (servicio: any) => {
    setFormularioEdicion({
      elemento: servicio.elemento || '',
      descripcion: servicio.descripcion || '',
      estado: servicio.estado || 'programado',
      fecha: servicio.fecha || '',
      personas: servicio.personas || [],
      documentos: servicio.documentos || []
    });
    setServicioSeleccionado(servicio);
    setModoEdicion(true);
    setMostrarFormulario(true);
  };

  // Crear nuevo servicio
  const crearNuevoServicio = () => {
    setFormularioEdicion({
      elemento: '',
      descripcion: '',
      estado: 'programado',
      fecha: '',
      personas: [],
      documentos: []
    });
    setServicioSeleccionado(null);
    setModoEdicion(false);
    setMostrarFormulario(true);
  };

  // Guardar servicio (crear o editar)
  const guardarServicio = async () => {
    if (!formularioEdicion.elemento.trim()) {
      toast.error('El elemento es obligatorio');
      return;
    }

    setGuardando(true);
    try {
      let documentosActualizados = [...formularioEdicion.documentos];

      // Subir archivos nuevos
      if (archivosSubir.length > 0) {
        setSubiendoArchivos(true);
        
        for (const archivo of archivosSubir) {
          const archivoRef = ref(storage, `servicios/${Date.now()}_${archivo.name}`);
          const snapshot = await uploadBytes(archivoRef, archivo);
          const url = await getDownloadURL(snapshot.ref);
          
          documentosActualizados.push({
            nombre: archivo.name,
            url,
            tipo: archivo.type,
            tamaño: archivo.size,
            fechaSubida: serverTimestamp(),
            subidoPor: CURRENT_USER_NAME
          });
        }
      }

      const servicioData = {
        elemento: formularioEdicion.elemento.trim(),
        descripcion: formularioEdicion.descripcion.trim(),
        estado: formularioEdicion.estado,
        fecha: formularioEdicion.fecha,
        personas: formularioEdicion.personas,
        documentos: documentosActualizados,
        timestamp: serverTimestamp(),
        creadoPor: CURRENT_USER_ID,
        creadoPorNombre: CURRENT_USER_NAME
      };

      if (modoEdicion && servicioSeleccionado) {
        // Actualizar servicio existente
        const servicioRef = doc(db, 'servicios', servicioSeleccionado.id);
        await updateDoc(servicioRef, servicioData);
        
        // Agregar mensaje de actualización al chat
        const chatCollection = collection(db, 'servicios', servicioSeleccionado.id, 'chat');
        await addDoc(chatCollection, {
          mensaje: `Servicio actualizado: ${formularioEdicion.elemento}`,
          autorId: 'sistema',
          autorNombre: 'Sistema',
          timestamp: serverTimestamp(),
          tipo: 'sistema'
        });
        
        toast.success('Servicio actualizado correctamente');
      } else {
        // Crear nuevo servicio
        const serviciosCollection = collection(db, 'servicios');
        const docRef = await addDoc(serviciosCollection, servicioData);
        
        // Agregar mensaje inicial al chat
        const chatCollection = collection(db, 'servicios', docRef.id, 'chat');
        await addDoc(chatCollection, {
          mensaje: `Servicio creado: ${formularioEdicion.elemento}`,
          autorId: 'sistema',
          autorNombre: 'Sistema',
          timestamp: serverTimestamp(),
          tipo: 'sistema'
        });
        
        toast.success('Servicio creado correctamente');
      }

      // Limpiar formulario y cerrar
      setMostrarFormulario(false);
      setModoEdicion(false);
      setServicioSeleccionado(null);
      setArchivosSubir([]);
      
    } catch (error) {
      console.error('Error al guardar servicio:', error);
      toast.error('Error al guardar el servicio');
    } finally {
      setGuardando(false);
      setSubiendoArchivos(false);
    }
  };

  // Eliminar servicio
  const eliminarServicio = async (servicioId: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este servicio?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'servicios', servicioId));
      toast.success('Servicio eliminado');
    } catch (error) {
      console.error('Error al eliminar servicio:', error);
      toast.error('Error al eliminar el servicio');
    }
  };

  // Abrir chat
  const abrirChat = (servicioId: string) => {
    setServicioChat(servicioId);
    setChatAbierto(true);
  };

  // Ver archivo
  const verArchivo = (archivo: any) => {
    setArchivoVisor(archivo);
    setMostrarVisorPDF(true);
  };

  // Manejar selección de archivos
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setArchivosSubir(prev => [...prev, ...files]);
  };

  // Remover archivo de la lista
  const removeFile = (index: number) => {
    setArchivosSubir(prev => prev.filter((_, i) => i !== index));
  };

  // Renderizar vistas
  const renderVistaServicios = () => {
    if (vistaActiva === 'kanban') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {estados.map(estado => {
            const serviciosEstado = serviciosFiltrados.filter(s => s.estado === estado.value);
            
            return (
              <div key={estado.value} className="flex flex-col">
                <div className={`${estado.bgColor} ${estado.border} border rounded-xl p-4 mb-4`}>
                  <div className="flex items-center space-x-2">
                    <estado.icon className={`h-5 w-5 ${estado.color}`} />
                    <h3 className={`font-semibold ${estado.color}`}>{estado.label}</h3>
                    <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full text-xs">
                      {serviciosEstado.length}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3 flex-1">
                  {serviciosEstado.map(servicio => (
                    <div
                      key={servicio.id}
                      className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 hover:bg-gray-800/70 transition-all duration-200 cursor-pointer group"
                      onClick={() => setServicioSeleccionado(servicio)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-white text-sm line-clamp-2 group-hover:text-blue-300 transition-colors">
                          {servicio.elemento || 'Sin título'}
                        </h4>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirChat(servicio.id);
                            }}
                            className="p-1 hover:bg-gray-700 rounded"
                            title="Abrir chat"
                          >
                            <MessageCircle className="h-3 w-3 text-blue-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              editarServicio(servicio);
                            }}
                            className="p-1 hover:bg-gray-700 rounded"
                            title="Editar servicio"
                          >
                            <Edit3 className="h-3 w-3 text-gray-400" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {servicio.descripcion || 'Sin descripción'}
                      </p>
                      
                      <div className="flex items-center justify-between mt-3">
                        {servicio.fecha && (
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="h-3 w-3 mr-1" />
                            {servicio.fecha}
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-2">
                          {servicio.documentos && servicio.documentos.length > 0 && (
                            <div className="flex items-center space-x-1">
                              <Paperclip className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-gray-400">{servicio.documentos.length}</span>
                            </div>
                          )}
                          {servicio.personas && servicio.personas.length > 0 && (
                            <div className="flex items-center space-x-1">
                              <Users className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-gray-400">{servicio.personas.length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Vista grid (mejorada)
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {serviciosFiltrados.map(servicio => {
          const estadoInfo = estados.find(e => e.value === servicio.estado);
          
          return (
            <div
              key={servicio.id}
              className="bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-6 hover:bg-gray-800/60 transition-all duration-200 cursor-pointer group"
              onClick={() => setServicioSeleccionado(servicio)}
            >
              {/* Header de la tarjeta */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2 group-hover:text-blue-300 transition-colors">
                    {servicio.elemento || 'Sin título'}
                  </h3>
                  <p className="text-sm text-gray-400 line-clamp-3">
                    {servicio.descripcion || 'Sin descripción'}
                  </p>
                </div>
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirChat(servicio.id);
                    }}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    title="Abrir chat"
                  >
                    <MessageCircle className="h-4 w-4 text-blue-400" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      editarServicio(servicio);
                    }}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    title="Editar servicio"
                  >
                    <Edit3 className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Estado */}
              {estadoInfo && (
                <div className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs mb-3 ${estadoInfo.bgColor} ${estadoInfo.color}`}>
                  <estadoInfo.icon className="h-3 w-3" />
                  <span>{estadoInfo.label}</span>
                </div>
              )}

              {/* Información adicional */}
              <div className="space-y-3">
                {servicio.fecha && (
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-300">{servicio.fecha}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
                  <div className="flex items-center space-x-4">
                    {servicio.documentos && servicio.documentos.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <Paperclip className="h-4 w-4 text-gray-500" />
                        <span className="text-xs text-gray-400">{servicio.documentos.length} archivos</span>
                      </div>
                    )}
                    {servicio.personas && servicio.personas.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <Users className="h-4 w-4 text-gray-500" />
                        <span className="text-xs text-gray-400">{servicio.personas.length} personas</span>
                      </div>
                    )}
                  </div>
                  
                  <span className="text-xs text-gray-500">
                    {servicio.creadoPorNombre || 'Usuario'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <SidebarFriday />
      
      <div className="lg:ml-64">
        {/* Header */}
        <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-700/50 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={goBack}
                className="p-2 hover:bg-gray-800 rounded-xl transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">Servicios</h1>
                <p className="text-gray-400">Gestiona servicios con chat y archivos</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Selector de vista */}
              <div className="flex bg-gray-800 rounded-xl p-1">
                <button
                  onClick={() => setVistaActiva('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    vistaActiva === 'grid' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vista de tarjetas"
                >
                  <div className="grid grid-cols-2 gap-1 h-4 w-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-current rounded-sm" />
                    ))}
                  </div>
                </button>
                <button
                  onClick={() => setVistaActiva('kanban')}
                  className={`p-2 rounded-lg transition-colors ${
                    vistaActiva === 'kanban' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vista Kanban"
                >
                  <Activity className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={crearNuevoServicio}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center space-x-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nuevo Servicio</span>
              </button>
            </div>
          </div>
        </header>

        {/* Barra de búsqueda y filtros */}
        <div className="p-6 border-b border-gray-700/50">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar servicios..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos los estados</option>
                {estados.map(estado => (
                  <option key={estado.value} value={estado.value}>
                    {estado.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <main className="p-6">
          {cargando ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-400">Cargando servicios...</span>
            </div>
          ) : serviciosFiltrados.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-300 mb-2">
                No se encontraron servicios
              </h3>
              <p className="text-gray-400 mb-6">
                Intenta cambiar los filtros o crea un nuevo servicio
              </p>
              <button
                onClick={crearNuevoServicio}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center space-x-2 mx-auto transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>Crear Servicio</span>
              </button>
            </div>
          ) : (
            renderVistaServicios()
          )}
        </main>

        {/* Modal de formulario (crear/editar) */}
        {mostrarFormulario && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700">
              {/* Header del modal */}
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {modoEdicion ? 'Editar Servicio' : 'Nuevo Servicio'}
                  </h2>
                  <p className="text-gray-400">
                    {modoEdicion ? 'Modifica los detalles del servicio' : 'Completa la información del servicio'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMostrarFormulario(false);
                    setModoEdicion(false);
                    setServicioSeleccionado(null);
                    setArchivosSubir([]);
                  }}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              {/* Contenido del modal */}
              <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Columna izquierda */}
                    <div className="space-y-6">
                      {/* Información básica */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Información Básica</h3>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Elemento *
                          </label>
                          <input
                            type="text"
                            value={formularioEdicion.elemento}
                            onChange={(e) => setFormularioEdicion(prev => ({ ...prev, elemento: e.target.value }))}
                            placeholder="Ingresa el nombre del servicio"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Descripción
                          </label>
                          <textarea
                            value={formularioEdicion.descripcion}
                            onChange={(e) => setFormularioEdicion(prev => ({ ...prev, descripcion: e.target.value }))}
                            placeholder="Describe el servicio en detalle"
                            rows={4}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Estado
                            </label>
                            <select
                              value={formularioEdicion.estado}
                              onChange={(e) => setFormularioEdicion(prev => ({ ...prev, estado: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {estados.map(estado => (
                                <option key={estado.value} value={estado.value}>
                                  {estado.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Fecha
                            </label>
                            <input
                              type="date"
                              value={formularioEdicion.fecha}
                              onChange={(e) => setFormularioEdicion(prev => ({ ...prev, fecha: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Columna derecha - Archivos */}
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-white">Archivos y Documentos</h3>
                        
                        {/* Subir nuevos archivos */}
                        <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center">
                          <Upload className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                          <p className="text-gray-300 mb-2">
                            Arrastra archivos aquí o haz clic para seleccionar
                          </p>
                          <p className="text-sm text-gray-500 mb-4">
                            Soporta PDF, Word, Excel, imágenes y más
                          </p>
                          <input
                            type="file"
                            ref={fileInputRef}
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.gif"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                          >
                            Seleccionar Archivos
                          </button>
                        </div>

                        {/* Preview de archivos nuevos */}
                        {archivosSubir.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-medium text-gray-300">
                              Archivos nuevos ({archivosSubir.length})
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {archivosSubir.map((file, index) => (
                                <FilePreview
                                  key={index}
                                  file={file}
                                  onRemove={() => removeFile(index)}
                                  onView={() => {}}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Archivos existentes en modo edición */}
                        {modoEdicion && formularioEdicion.documentos.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-medium text-gray-300">
                              Archivos existentes ({formularioEdicion.documentos.length})
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {formularioEdicion.documentos.map((archivo, index) => (
                                <FilePreview
                                  key={index}
                                  file={archivo}
                                  onView={() => verArchivo(archivo)}
                                  showActions={false}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer del modal */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-700 bg-gray-900/80">
                <button
                  onClick={() => {
                    setMostrarFormulario(false);
                    setModoEdicion(false);
                    setServicioSeleccionado(null);
                    setArchivosSubir([]);
                  }}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarServicio}
                  disabled={guardando || subiendoArchivos || !formularioEdicion.elemento.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-xl transition-colors disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {(guardando || subiendoArchivos) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span>
                    {guardando 
                      ? 'Guardando...' 
                      : subiendoArchivos 
                        ? 'Subiendo archivos...' 
                        : modoEdicion 
                          ? 'Actualizar Servicio' 
                          : 'Crear Servicio'
                    }
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de detalles del servicio */}
        {servicioSeleccionado && !mostrarFormulario && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-gray-700">
              {/* Header del modal */}
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {servicioSeleccionado.elemento || 'Servicio'}
                  </h2>
                  <p className="text-gray-400">{servicioSeleccionado.descripcion}</p>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => abrirChat(servicioSeleccionado.id)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    title="Abrir chat"
                  >
                    <MessageCircle className="h-5 w-5 text-white" />
                  </button>
                  
                  <button
                    onClick={() => editarServicio(servicioSeleccionado)}
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    title="Editar servicio"
                  >
                    <Edit3 className="h-5 w-5 text-white" />
                  </button>
                  
                  <button
                    onClick={() => setServicioSeleccionado(null)}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <X className="h-6 w-6 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Contenido del modal */}
              <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Información principal */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50">
                        <h3 className="text-lg font-semibold text-white mb-4">Detalles del Servicio</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500">Estado</p>
                            <p className="text-sm text-white">{servicioSeleccionado.estado}</p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500">Fecha</p>
                            <p className="text-sm text-white">{servicioSeleccionado.fecha || 'No especificada'}</p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500">Creado por</p>
                            <p className="text-sm text-white">{servicioSeleccionado.creadoPorNombre || 'Usuario'}</p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-gray-500">Personas asignadas</p>
                            <p className="text-sm text-white">
                              {servicioSeleccionado.personas?.length || 0} personas
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Archivos */}
                      {servicioSeleccionado.documentos && servicioSeleccionado.documentos.length > 0 && (
                        <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50">
                          <h3 className="text-lg font-semibold text-white mb-4">
                            Archivos Adjuntos ({servicioSeleccionado.documentos.length})
                          </h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {servicioSeleccionado.documentos.map((archivo: any, index: number) => (
                              <FilePreview
                                key={index}
                                file={archivo}
                                onView={() => verArchivo(archivo)}
                                showActions={true}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sidebar con acciones */}
                    <div className="space-y-6">
                      <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50">
                        <h3 className="text-lg font-semibold text-white mb-4">Acciones Rápidas</h3>
                        
                        <div className="space-y-3">
                          <button
                            onClick={() => abrirChat(servicioSeleccionado.id)}
                            className="w-full flex items-center space-x-3 p-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          >
                            <MessageCircle className="h-5 w-5 text-white" />
                            <span className="text-white font-medium">Abrir Chat</span>
                          </button>
                          
                          <button
                            onClick={() => editarServicio(servicioSeleccionado)}
                            className="w-full flex items-center space-x-3 p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                          >
                            <Edit3 className="h-5 w-5 text-white" />
                            <span className="text-white font-medium">Editar Servicio</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              if (window.confirm('¿Estás seguro de que quieres eliminar este servicio?')) {
                                eliminarServicio(servicioSeleccionado.id);
                                setServicioSeleccionado(null);
                              }
                            }}
                            className="w-full flex items-center space-x-3 p-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-5 w-5 text-white" />
                            <span className="text-white font-medium">Eliminar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat del servicio */}
        <ChatServicio
          servicioId={servicioChat}
          isOpen={chatAbierto}
          onClose={() => {
            setChatAbierto(false);
            setServicioChat('');
          }}
        />

        {/* Visor de archivos */}
        {mostrarVisorPDF && archivoVisor && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden border border-gray-700">
              {/* Header del visor */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-white">{archivoVisor.nombre}</h3>
                  <p className="text-sm text-gray-400">Vista previa del archivo</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = archivoVisor.url;
                      link.download = archivoVisor.nombre;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    title="Descargar archivo"
                  >
                    <Download className="h-5 w-5 text-white" />
                  </button>
                  <button
                    onClick={() => {
                      setMostrarVisorPDF(false);
                      setArchivoVisor(null);
                    }}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Contenido del visor */}
              <div className="h-[calc(90vh-80px)] bg-gray-800/50 flex items-center justify-center">
                {archivoVisor.nombre?.toLowerCase().endsWith('.pdf') ? (
                  <Document
                    file={archivoVisor.url}
                    loading={
                      <div className="flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <span className="ml-3 text-gray-400">Cargando PDF...</span>
                      </div>
                    }
                    error={
                      <div className="text-center">
                        <FileText className="h-16 w-16 text-red-400 mx-auto mb-4" />
                        <p className="text-gray-400">Error al cargar el PDF</p>
                      </div>
                    }
                  >
                    <Page pageNumber={1} />
                  </Document>
                ) : (
                  <div className="text-center">
                    <FileText className="h-16 w-16 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 mb-2">Vista previa no disponible</p>
                    <p className="text-sm text-gray-500">Descarga el archivo para verlo</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FridayServiciosScreen;
