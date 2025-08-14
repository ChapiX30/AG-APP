import React, { useEffect, useState } from 'react';
import SidebarFriday from './SidebarFriday';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ArrowLeft, Plus, Calendar, Bell, FileText, FileUp, X, Check,
  Repeat, Download, Trash2, XCircle, Search, Filter, Eye, Edit3,
  Zap, Clock, User, CheckCircle2, RotateCcw, Loader2, Maximize, Minimize,
  ExternalLink, ZoomIn, ZoomOut, RotateCw
} from 'lucide-react';
import { doc, collection, updateDoc, addDoc, deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const CURRENT_USER_ID = localStorage.getItem('usuario_id') || 'usuario_123';
const CURRENT_USER_NAME = localStorage.getItem('usuario.nombre') || 'Mi Usuario';

const estados = [
  { value: 'programado', label: 'Programado', color: 'text-blue-400', bgColor: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Calendar, gradient: 'from-blue-500/20 to-blue-600/5' },
  { value: 'en_proceso', label: 'En Proceso', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Clock, gradient: 'from-emerald-500/20 to-emerald-600/5' },
  { value: 'finalizado', label: 'Finalizado', color: 'text-purple-400', bgColor: 'bg-purple-500/10', border: 'border-purple-500/30', icon: CheckCircle2, gradient: 'from-purple-500/20 to-purple-600/5' },
  { value: 'reprogramacion', label: 'Reprogramación', color: 'text-red-400', bgColor: 'bg-red-500/10', border: 'border-red-500/30', icon: RotateCcw, gradient: 'from-red-500/20 to-red-600/5' }
];

// ---------- FilePreview ----------
const FilePreview = ({ file, onRemove, onView }: { file: File | string; onRemove: () => void; onView: () => void }) => {
  const [fileType, setFileType] = useState('');
  useEffect(() => {
    if (typeof file === 'string') {
      const ext = file.split('.').pop()?.toLowerCase() || '';
      setFileType(ext);
    } else {
      setFileType(file.name.split('.').pop()?.toLowerCase() || '');
    }
  }, [file]);
  const getFileIcon = () => {
    switch (fileType) {
      case 'pdf': return <FileText className="text-red-500" size={18} />;
      case 'doc': case 'docx': return <FileText className="text-blue-500" size={18} />;
      case 'xls': case 'xlsx': return <FileText className="text-green-500" size={18} />;
      default: return <FileText className="text-gray-500" size={18} />;
    }
  };
  return (
    <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg mb-2">
      <div className="flex items-center gap-2">
        {getFileIcon()}
        <span className="text-sm truncate max-w-xs">
          {typeof file === 'string' ? file.split('/').pop() : file.name}
        </span>
      </div>
      <div className="flex gap-2">
        <button onClick={onView} className="text-gray-400 hover:text-blue-500" title="Vista previa"><Eye size={16} /></button>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500" title="Eliminar"><X size={16} /></button>
      </div>
    </div>
  );
};

// ---------- FileViewerModal ----------
const FileViewerModal = ({ file, onClose, type, fileName }: { 
  file: string; 
  onClose: () => void; 
  type: string;
  fileName?: string;
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setLoading(false);
    setError('Error al cargar el archivo');
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const getFileIcon = () => {
    switch (type) {
      case 'pdf': return <FileText className="text-red-500" size={48} />;
      case 'doc': case 'docx': return <FileText className="text-blue-500" size={48} />;
      case 'xls': case 'xlsx': return <FileText className="text-green-500" size={48} />;
      default: return <FileText className="text-gray-500" size={48} />;
    }
  };

  const renderFileContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-white text-lg">Cargando archivo...</p>
            <p className="text-gray-400 text-sm mt-2">Por favor espera un momento</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            {getFileIcon()}
            <p className="text-red-400 text-lg mt-4 font-semibold">Error al cargar el archivo</p>
            <p className="text-gray-400 text-sm mt-2">El archivo no se pudo visualizar correctamente</p>
            <div className="flex gap-3 mt-6 justify-center">
              <button
                onClick={() => window.open(file, '_blank')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <ExternalLink size={16} />
                Abrir en nueva pestaña
              </button>
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = file;
                  a.download = fileName || 'archivo';
                  a.click();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <Download size={16} />
                Descargar
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'pdf') {
      return (
        <div className="flex items-center justify-center h-full overflow-auto">
          <div 
            className="transition-transform duration-200"
            style={{ 
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center'
            }}
          >
            <iframe
              src={`${file}#toolbar=1&navpanes=1&scrollbar=1`}
              className="border-0 bg-white rounded-lg shadow-lg"
              style={{
                width: isFullscreen ? '90vw' : '800px',
                height: isFullscreen ? '80vh' : '600px',
              }}
              onLoad={handleLoad}
              onError={handleError}
              title="PDF Viewer"
            />
          </div>
        </div>
      );
    }

    // Para otros tipos de archivo, usar Google Docs Viewer como fallback
    const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(file)}&embedded=true`;
    return (
      <div className="flex items-center justify-center h-full overflow-auto">
        <div 
          className="transition-transform duration-200"
          style={{ 
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center'
          }}
        >
          <iframe
            src={viewerUrl}
            className="border-0 bg-white rounded-lg shadow-lg"
            style={{
              width: isFullscreen ? '90vw' : '800px',
              height: isFullscreen ? '80vh' : '600px',
            }}
            onLoad={handleLoad}
            onError={handleError}
            allowFullScreen
            title="Document Viewer"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 rounded-xl ${isFullscreen ? 'w-full h-full' : 'w-full max-w-4xl max-h-[90vh]'}`}>
        {/* Header mejorado */}
        <div className="sticky top-0 bg-slate-800 p-4 border-b border-slate-700 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getFileIcon()}
              <div>
                <h3 className="text-lg font-bold text-white">Visualizador de Archivos</h3>
                <p className="text-sm text-gray-400 truncate max-w-md">
                  {fileName || file.split('/').pop() || 'Archivo'}
                </p>
              </div>
            </div>
            
            {/* Controles de visualización */}
            <div className="flex items-center gap-2">
              {!loading && !error && (
                <>
                  <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
                    <button
                      onClick={handleZoomOut}
                      className="p-2 hover:bg-slate-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                      title="Alejar"
                    >
                      <ZoomOut size={16} />
                    </button>
                    <span className="px-2 text-sm text-white font-medium min-w-[60px] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-2 hover:bg-slate-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                      title="Acercar"
                    >
                      <ZoomIn size={16} />
                    </button>
                  </div>
                  
                  <button
                    onClick={handleRotate}
                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title="Rotar"
                  >
                    <RotateCw size={16} />
                  </button>
                  
                  <button
                    onClick={handleReset}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-gray-400 hover:text-white transition-colors text-sm font-medium"
                    title="Restablecer vista"
                  >
                    Reset
                  </button>
                </>
              )}
              
              <div className="w-px h-6 bg-slate-600 mx-1"></div>
              
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
              
              <button
                onClick={onClose}
                className="p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
                title="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Contenido del archivo */}
        <div className="overflow-auto" style={{ height: 'calc(100% - 80px)' }}>
          {renderFileContent()}
        </div>
        
        {/* Footer con acciones adicionales */}
        {!loading && !error && (
          <div className="sticky bottom-0 bg-slate-800 p-3 border-t border-slate-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span>Tipo: {type.toUpperCase()}</span>
                <span>•</span>
                <span>Zoom: {Math.round(zoom * 100)}%</span>
                {rotation > 0 && (
                  <>
                    <span>•</span>
                    <span>Rotación: {rotation}°</span>
                  </>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(file, '_blank')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <ExternalLink size={14} />
                  Abrir en nueva pestaña
                </button>
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = file;
                    a.download = fileName || 'archivo';
                    a.click();
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Download size={14} />
                  Descargar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- ServicioDetailModal ----------
const ServicioDetailModal = ({ servicio, usuarios, onClose, handleUpdateField, handleDelete, setFileToView }: any) => {
  if (!servicio) return null;

  const isAsignado = Array.isArray(servicio.personas) && servicio.personas.includes(CURRENT_USER_ID);
  const estadoActual = estados.find(e => e.value === (servicio.estado || 'programado'));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${estadoActual?.bgColor} flex items-center justify-center`}>
                <estadoActual.icon className={`w-6 h-6 ${estadoActual?.color}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{servicio.elemento || 'Elemento sin nombre'}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-sm font-medium ${estadoActual?.color}`}>{estadoActual?.label}</span>
                  {isAsignado && (
                    <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-1 rounded-full">
                      <Bell className="text-emerald-400 w-3 h-3" />
                      <span className="text-emerald-400 text-xs font-medium">Asignado a ti</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Información básica */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Información del Servicio
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Estado</label>
                    <select
                      value={servicio.estado || 'programado'}
                      className={`w-full px-4 py-3 rounded-lg border ${estadoActual?.border} ${estadoActual?.bgColor} ${estadoActual?.color} font-medium transition-colors`}
                      onChange={e => handleUpdateField(servicio.id, 'estado', e.target.value)}
                    >
                      {estados.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Fecha programada</label>
                    <input
                      type="date"
                      value={servicio.fecha || ''}
                      onChange={(e) => handleUpdateField(servicio.id, 'fecha', e.target.value)}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {servicio.descripcion && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Descripción</label>
                      <div className="bg-slate-700/50 p-4 rounded-lg">
                        <p className="text-gray-300">{servicio.descripcion}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Personas asignadas */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-emerald-400" />
                  Personas Asignadas ({servicio.personas?.length || 0})
                </h3>
                <div className="space-y-3">
                  {(servicio.personas?.length ? servicio.personas : []).map((pid: string) => {
                    const user = usuarios.find((u: any) => u.id === pid);
                    if (!user) return null;
                    const isCurrentUser = pid === CURRENT_USER_ID;
                    return (
                      <div key={pid} className={`flex items-center gap-3 p-3 rounded-lg ${isCurrentUser ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-700/30'}`}>
                        <Bubble nombre={user.nombre} short={user.short || user.nombre.split(' ').map((x: string) => x[0]).join('')} />
                        <div className="flex-1">
                          <p className="font-medium text-white">{user.nombre}</p>
                          <p className="text-sm text-gray-400">{user.email || 'Sin email'}</p>
                        </div>
                        {isCurrentUser && (
                          <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
                            <CheckCircle2 className="w-4 h-4" />
                            Tú
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!servicio.personas || servicio.personas.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No hay personas asignadas</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Documentos */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                Documentos Adjuntos ({servicio.documentos?.length || 0})
              </h3>
              <div className="space-y-3">
                {servicio.documentos?.length > 0 ? (
                  servicio.documentos.map((docUrl: string, index: number) => {
                    const fileName = docUrl.split('/').pop() || `Documento ${index + 1}`;
                    const fileExt = docUrl.split('.').pop()?.toLowerCase() || '';
                    const getFileIcon = () => {
                      switch (fileExt) {
                        case 'pdf': return <FileText className="text-red-500" size={20} />;
                        case 'doc': case 'docx': return <FileText className="text-blue-500" size={20} />;
                        case 'xls': case 'xlsx': return <FileText className="text-green-500" size={20} />;
                        default: return <FileText className="text-gray-500" size={20} />;
                      }
                    };
                    return (
                      <div key={index} className="flex items-center justify-between bg-slate-700/30 p-4 rounded-lg hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {getFileIcon()}
                          <div>
                            <p className="font-medium text-white truncate max-w-xs">{fileName}</p>
                            <p className="text-sm text-gray-400 uppercase">{fileExt} • Documento</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setFileToView({ url: docUrl, type: fileExt, fileName })}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            title="Vista previa"
                          >
                            <Eye size={16} />
                            <span className="hidden sm:inline text-sm">Ver</span>
                          </button>
                          <button
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = docUrl;
                              a.download = fileName;
                              a.click();
                            }}
                            className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2"
                            title="Descargar"
                          >
                            <Download size={16} />
                            <span className="hidden sm:inline text-sm">Descargar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No hay documentos adjuntos</p>
                    <p className="text-sm">Los archivos aparecerán aquí cuando se agreguen</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Información adicional */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
              <div>
                <span className="font-medium">Creado por:</span>
                <p className="text-white mt-1">{servicio.creadoPorNombre || 'Usuario desconocido'}</p>
              </div>
              <div>
                <span className="font-medium">Fecha de creación:</span>
                <p className="text-white mt-1">
                  {servicio.timestamp ? new Date(servicio.timestamp).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'No disponible'}
                </p>
              </div>
              <div>
                <span className="font-medium">ID del servicio:</span>
                <p className="text-white mt-1 font-mono text-xs">{servicio.id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer con acciones */}
        <div className="sticky bottom-0 bg-slate-800 p-6 border-t border-slate-700">
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <button 
                onClick={() => handleDelete([servicio.id])}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                Eliminar Servicio
              </button>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
              >
                Cerrar
              </button>
              <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                <Edit3 size={16} />
                Editar Servicio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Bubble ----------
const Bubble = ({ nombre, color, short }: { nombre: string; color?: string; short?: string }) => (
  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs
    ${color ? color : "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500"}
    text-white shadow-lg border border-white/20 mr-2 hover:scale-110 transition-transform duration-200`}
    title={nombre}
    style={{ minWidth: 36 }}>
    {short || nombre.split(' ').map((x) => x[0]).join('').toUpperCase()}
  </div>
);

// ---------- ServicioModal ----------
const ServicioModal = ({
  isOpen, onClose, onSave, usuarios
}: { isOpen: boolean, onClose: () => void, onSave: (servicio: any) => void, usuarios: any[] }) => {
  const [servicio, setServicio] = useState({
    elemento: '', personas: [], estado: 'programado',
    fecha: new Date().toISOString().split('T')[0], descripcion: '', documentos: [] as string[]
  });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setServicio({
        elemento: '', personas: [], estado: 'programado',
        fecha: new Date().toISOString().split('T')[0], descripcion: '', documentos: []
      });
      setFiles([]);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(file =>
        ['application/pdf', 'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
          .includes(file.type)
      );
      setFiles([...files, ...newFiles]);
    }
  };
  const removeFile = (index: number) => setFiles(files.filter((_, i) => i !== index));
  const uploadFiles = async () => {
    const urls:string[] = [];
    setUploading(true);
    try {
      for (const file of files) {
        const storageRef = ref(storage, `documentos/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        urls.push(url);
      }
      return urls;
    } catch (error) {
      toast.error('Error al subir archivos');
      return [];
    } finally {
      setUploading(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servicio.elemento) {
      toast.error('El campo Elemento es requerido');
      return;
    }
    try {
      const uploadedUrls = await uploadFiles();
      const servicioCompleto = {
        ...servicio,
        documentos: [...servicio.documentos, ...uploadedUrls],
        timestamp: new Date().getTime(),
        creadoPor: CURRENT_USER_ID,
        creadoPorNombre: CURRENT_USER_NAME
      };
      await onSave(servicioCompleto);
      toast.success('Servicio creado exitosamente');
      onClose();
    } catch (error) {
      toast.error('Error al crear el servicio');
    }
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700">
          <h3 className="text-xl font-bold">Nuevo Servicio</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Elemento *</label>
              <input
                type="text"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={servicio.elemento}
                onChange={e => setServicio({ ...servicio, elemento: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Personas asignadas</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                multiple
                value={servicio.personas}
                onChange={e => {
                  const options = Array.from(e.target.selectedOptions, option => option.value);
                  setServicio({ ...servicio, personas: options });
                }}
              >
                {usuarios.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Estado</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                value={servicio.estado}
                onChange={e => setServicio({ ...servicio, estado: e.target.value })}
              >
                {estados.map(est => (
                  <option key={est.value} value={est.value}>{est.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Fecha</label>
              <input
                type="date"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                value={servicio.fecha}
                onChange={e => setServicio({ ...servicio, fecha: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Descripción</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                value={servicio.descripcion}
                onChange={e => setServicio({ ...servicio, descripcion: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-white">Documentos (PDF, Excel, Word)</label>
              <input
                type="file"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileChange}
              />
              <div className="mt-2 space-y-2">
                {files.map((file, idx) => (
                  <FilePreview key={idx} file={file} onRemove={() => removeFile(idx)} onView={() => {}} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors">Cancelar</button>
            <button type="submit" disabled={uploading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium flex items-center gap-2 disabled:opacity-70 transition-colors">
              {uploading ? (<><Loader2 className="animate-spin" size={18} />Guardando...</>) : 'Guardar Servicio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --------- ServicioCard (Mobile y Desktop) ----------
const ServicioCard = ({ s, group, usuarios, handleUpdateField, handleDelete, setFileToView }: any) => {
  const isAsignado = Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID);
  
  return (
    <div className={`rounded-lg p-3 mb-2 border backdrop-blur-sm transition-all duration-200 hover:shadow-lg cursor-pointer
      ${isAsignado ? 'border-emerald-400/30 bg-emerald-500/5 hover:bg-emerald-500/10'
        : 'border-slate-700/30 bg-slate-800/20 hover:bg-slate-800/40'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg ${group.bgColor} flex items-center justify-center flex-shrink-0`}>
            <group.icon className={`w-4 h-4 ${group.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white truncate">{s.elemento || 'Elemento sin nombre'}</h3>
              {isAsignado && (
                <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Bell className="text-emerald-400 w-3 h-3" />
                  <span className="text-emerald-400 text-xs font-medium">Asignado</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-xs text-gray-400">{s.fecha || 'Sin fecha'}</span>
              {s.personas?.length > 0 && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">{s.personas.length} persona{s.personas.length !== 1 ? 's' : ''}</span>
                </div>
              )}
              {s.documentos?.length > 0 && (
                <div className="flex items-center gap-1">
                  <FileText className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-400">{s.documentos.length} archivo{s.documentos.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={s.estado || 'programado'}
            className={`text-xs px-2 py-1 rounded-lg border ${group.border} ${group.bgColor} ${group.color} font-medium`}
            onChange={e => handleUpdateField(s.id, 'estado', e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            {estados.map((est: any) => <option key={est.value} value={est.value}>{est.label}</option>)}
          </select>
          <button 
            className="p-1.5 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setFileToView({ servicio: s, type: 'detail' });
            }}
            title="Ver detalles"
          >
            <Eye size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------- COMPONENTE PRINCIPAL ----------------------
export const FridayServiciosScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { currentScreen, navigateTo } = useNavigation();
  const [servicios, setServicios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [notifiedServicios, setNotifiedServicios] = useState<string[]>(() => {
    try {
      const key = `notifiedServicios:${CURRENT_USER_ID}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
  });
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileToView, setFileToView] = useState<{ url?: string, type: string, servicio?: any, fileName?: string } | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // === LISTENERS EN VIVO: servicios y usuarios ===
  useEffect(() => {
    const unsubServicios = onSnapshot(collection(db, 'servicios'), (snap) => {
      const serviciosData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setServicios(serviciosData);
    });
    const unsubUsuarios = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const usuariosData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsuarios(usuariosData);
    });
    return () => {
      unsubServicios();
      unsubUsuarios();
    };
  }, []);

  // === Notificación / banner cuando me asignan (con de-duplicación por localStorage) ===
  useEffect(() => {
    const key = `notifiedServicios:${CURRENT_USER_ID}`;
    const asignados = servicios.filter(s => Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID));
    const prevSet = new Set<string>(notifiedServicios);

    const nuevos = asignados.filter((s:any) => !prevSet.has(s.id));
    if (nuevos.length > 0) {
      setShowPushBanner(true);
      setNotifiedServicios((prev) => {
        const merged = Array.from(new Set([...prev, ...asignados.map((x:any) => x.id)]));
        try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
        return merged;
      });

      // Notificación nativa
      if ('Notification' in window) {
        const notify = () => {
          const body = nuevos.length === 1
            ? `Se te asignó: ${nuevos[0].elemento || 'Un servicio'}`
            : `Se te asignaron ${nuevos.length} servicios`;
          try { new Notification('Nuevo servicio asignado', { body, icon: '/bell.png' }); } catch {}
        };
        if (Notification.permission === 'granted') notify();
        else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => { if (p === 'granted') notify(); });
        }
      }
    } else {
      // Mantén sincronizada la lista con lo actualmente asignado (evita “fantasmas”)
      try { localStorage.setItem(key, JSON.stringify(asignados.map((x:any) => x.id))); } catch {}
    }

    if (showPushBanner) {
      const t = setTimeout(() => setShowPushBanner(false), 6000);
      return () => clearTimeout(t);
    }
  }, [servicios, notifiedServicios, showPushBanner]);

  // -------------------- HANDLERS --------------------
  const handleSaveServicio = async (nuevoServicio: any) => {
    try {
      const docRef = await addDoc(collection(db, 'servicios'), nuevoServicio);
      // No hace falta setServicios aquí porque onSnapshot actualizará el estado
      toast.success('Servicio creado');
    } catch (error) {
      toast.error('Error al crear el servicio');
    }
  };

  const handleUpdateField = async (servicioId: string, field: string, value: any) => {
    try {
      await updateDoc(doc(db, 'servicios', servicioId), { [field]: value });
      // onSnapshot reflejará el cambio
      toast.success(`Campo '${field}' actualizado correctamente`);
    } catch (error) {
      toast.error(`Error al actualizar el campo '${field}'`);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]
    );
  };

  const handleDelete = async (ids?: string[]) => {
    const idsToDelete = ids || selectedRows;
    if (!window.confirm(`¿Seguro que quieres eliminar ${idsToDelete.length > 1 ? 'estos servicios' : 'este servicio'}?`)) return;
    try {
      await Promise.all(idsToDelete.map(id => deleteDoc(doc(db, 'servicios', id))));
      setSelectedRows([]);
      toast.success(idsToDelete.length > 1 ? 'Servicios eliminados correctamente' : 'Servicio eliminado correctamente');
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const handleDuplicate = async () => {
    try {
      const itemsToDuplicate = servicios.filter(s => selectedRows.includes(s.id));
      for (const s of itemsToDuplicate) {
        const { id, ...copy } = s;
        await addDoc(collection(db, 'servicios'), {
          ...copy,
          elemento: (copy.elemento || '') + ' (Copia)',
        });
      }
      setSelectedRows([]);
      toast.success('Servicios duplicados correctamente');
    } catch (error) {
      toast.error('Error al duplicar');
    }
  };

  const handleExport = () => {
    const items = servicios.filter(s => selectedRows.includes(s.id));
    if (items.length === 0) return;
    const headers = ['Elemento', 'Personas', 'Estado', 'Fecha', 'Documentos'];
    const rows = items.map(s =>
      [
        s.elemento,
        (s.personas || []).map((pid: string) => {
          const u = usuarios.find((u) => u.id === pid);
          return u ? u.nombre : pid;
        }).join(', '),
        estados.find(e => e.value === s.estado)?.label || s.estado,
        s.fecha || '',
        (s.documentos || []).join('; ')
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'servicios.csv';
    a.click();
    setSelectedRows([]);
    toast.success('Exportación completada');
  };

  const handleDragStart = (e: React.DragEvent, servicioId: string) => {
    e.dataTransfer.setData('servicioId', servicioId);
    setIsDragging(true);
  };
  const handleDragEnd = () => setIsDragging(false);
  const handleDrop = async (e: React.DragEvent, nuevoEstado: string) => {
    e.preventDefault();
    const servicioId = e.dataTransfer.getData('servicioId');
    try {
      await updateDoc(doc(db, 'servicios', servicioId), { estado: nuevoEstado });
      toast.success('Estado actualizado correctamente');
    } catch (error) {
      toast.error('Error al actualizar el estado');
    }
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // -------------------- Agrupamiento y Filtro --------------------
  const filteredServicios = servicios.filter(s =>
    (s.elemento || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.personas || []).some((pid: string) => {
      const user = usuarios.find(u => u.id === pid);
      return (user?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase());
    })
  );
  const grouped = estados.map((est) => ({
    ...est,
    servicios: filteredServicios.filter((s) => (s.estado || 'programado') === est.value),
  }));

  // -------------------- UI PRINCIPAL --------------------
  return (
    <div className="flex bg-neutral-950 min-h-screen font-sans">
      {/* SidebarFriday solo en escritorio */}
      <div className="hidden lg:block">
        <SidebarFriday active={currentScreen} onNavigate={navigateTo} />
      </div>
      <div className={`${isMobile ? 'w-full' : 'flex-1 ml-[235px]'} min-h-screen relative`}>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans pb-24">
          {/* Notificación push */}
          {showPushBanner && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl px-8 py-4 flex items-center gap-4 shadow-2xl z-50 backdrop-blur-sm border border-emerald-400/30">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Bell className="w-6 h-6 animate-pulse" /></div>
              <div>
                <p className="font-bold text-lg">¡Nuevo servicio asignado!</p>
                <p className="text-emerald-100 text-sm">Revisa tus servicios pendientes</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
            <div className={`flex items-center justify-between ${isMobile ? 'px-3 py-3' : 'px-4 lg:px-8 py-4'}`}>
              <div className="flex items-center gap-4">
                <button
                  className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 transition-all duration-200 hover:scale-105"
                  onClick={() => navigateTo('mainmenu')}
                  title="Regresar"
                ><ArrowLeft size={24} className="text-white" /></button>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Zap className="w-6 h-6 text-white" /></div>
                  <div>
                    <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Servicios de Calibración</h1>
                    <p className="text-sm text-gray-400">Gestiona y organiza tus servicios</p>
                  </div>
                </div>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar servicios..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-slate-800/80 border border-slate-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all duration-200 w-64"
                    />
                  </div>
                  <button className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-xl transition-all duration-200"><Filter className="w-5 h-5 text-gray-400" /></button>
                </div>
              )}
            </div>
            {isMobile && (
              <div className="px-2 pb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar servicios..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/80 border border-slate-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Estadísticas */}
          <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-5'} gap-4 mb-6 px-2 lg:px-8 pt-4`}>
            {estados.map((estado) => {
              const count = grouped.find(g => g.value === estado.value)?.servicios.length || 0;
              const IconComponent = estado.icon;
              return (
                <div
                  key={estado.value}
                  className={`rounded-xl p-4 border backdrop-blur-sm ${estado.border} bg-gradient-to-br ${estado.gradient} hover:scale-105 transition-transform duration-200 cursor-pointer`}
                  onClick={() => setSearchTerm(estado.label)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${estado.bgColor} flex items-center justify-center`}><IconComponent className={`w-5 h-5 ${estado.color}`} /></div>
                    <div>
                      <p className="text-2xl font-bold text-white">{count}</p>
                      <p className={`text-xs ${estado.color} font-medium`}>{estado.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal de creación de servicios */}
          <ServicioModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleSaveServicio} usuarios={usuarios} />

          {/* Columnas de servicios */}
          <div className={`${isMobile ? 'flex flex-col gap-6' : 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6'} px-2 lg:px-8`}>
            {grouped.map((group) => {
              return (
                <div
                  key={group.value}
                  className={`rounded-2xl shadow-xl border backdrop-blur-sm ${group.border} bg-gradient-to-br ${group.gradient} transition-all duration-300 ${isDragging ? 'border-dashed border-2 border-white/50' : ''}`}
                  onDrop={(e) => handleDrop(e, group.value)}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragEnd}
                >
                  <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl ${group.bgColor} flex items-center justify-center`}><group.icon className={`w-6 h-6 ${group.color}`} /></div>
                      <div>
                        <h2 className={`font-bold text-lg ${group.color}`}>{group.label}</h2>
                        <p className="text-sm text-gray-400">{group.servicios.length} servicios</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-bold ${group.color}`}>{group.servicios.length}</span>
                    </div>
                  </div>
                  <div className="p-4 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                    {group.servicios.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4"><group.icon className="w-8 h-8 text-gray-500" /></div>
                        <p className="text-gray-500 font-medium">No hay servicios {group.label.toLowerCase()}</p>
                      </div>
                    ) : (
                      group.servicios.map((s) => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, s.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <ServicioCard
                            s={s}
                            group={group}
                            usuarios={usuarios}
                            handleUpdateField={handleUpdateField}
                            handleDelete={handleDelete}
                            setFileToView={setFileToView}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botón flotante agregar */}
          <button
            onClick={() => setShowModal(true)}
            className="fixed right-6 bottom-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white p-4 rounded-full shadow-2xl flex items-center justify-center z-40 transition-all duration-200 hover:scale-110 group"
          >
            <Plus size={24} className="group-hover:rotate-90 transition-all duration-300" />
            <span className="sr-only">Agregar servicio</span>
            <span className="absolute -bottom-10 text-xs font-medium bg-blue-700 text-white px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap shadow-lg">
              Nuevo Servicio
            </span>
          </button>

          {/* Barra selección */}
          {selectedRows.length > 0 && (
            <div className="fixed left-0 bottom-0 w-full z-50 flex justify-center px-2">
              <div className="flex items-center rounded-2xl shadow-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border border-slate-700/50 px-2 lg:px-6 py-3 space-x-4 max-w-5xl w-full mx-auto mb-2 overflow-x-auto">
                <div className="flex items-center gap-3 font-semibold text-lg text-cyan-300">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"><Check size={22} className="text-white" /></div>
                  <span className="hidden sm:inline">
                    {selectedRows.length === 1 ? "1 Elemento seleccionado" : `${selectedRows.length} Elementos seleccionados`}
                  </span>
                  <span className="sm:hidden">{selectedRows.length}</span>
                </div>
                <div className="flex-1 flex items-center gap-3 pl-4">
                  <button onClick={handleDuplicate} className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-white/10 text-gray-300 hover:text-white"><Repeat size={18} /><span className="hidden lg:inline text-sm">Duplicar</span></button>
                  <button onClick={handleExport} className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-white/10 text-gray-300 hover:text-white"><Download size={18} /><span className="hidden lg:inline text-sm">Exportar</span></button>
                  <button onClick={() => handleDelete()} className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-red-500/20 text-red-400 hover:text-red-300"><Trash2 size={18} /><span className="hidden lg:inline text-sm">Eliminar</span></button>
                </div>
                <button className="ml-3 p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all duration-200" onClick={() => setSelectedRows([])}><XCircle size={24} /></button>
              </div>
            </div>
          )}

          {/* Visor de archivos */}
          {fileToView && fileToView.type === 'detail' && (
            <ServicioDetailModal
              servicio={fileToView.servicio}
              usuarios={usuarios}
              onClose={() => setFileToView(null)}
              handleUpdateField={handleUpdateField}
              handleDelete={handleDelete}
              setFileToView={setFileToView}
            />
          )}

          {fileToView && fileToView.url && fileToView.type !== 'detail' && (
            <FileViewerModal
              file={fileToView.url}
              onClose={() => setFileToView(null)}
              type={fileToView.type}
              fileName={fileToView.fileName}
            />
          )}

          <style>{`
            @keyframes fade-in-up {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in-up {
              animation: fade-in-up 0.3s ease-out;
            }
            .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
            .scrollbar-thin::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.5); border-radius: 3px; }
            .scrollbar-thin::-webkit-scrollbar-track { background-color: transparent; }
            .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
          `}</style>
        </div>
      </div>
    </div>
  );
};

export default FridayServiciosScreen;
