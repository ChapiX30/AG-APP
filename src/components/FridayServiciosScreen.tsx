import React, { useEffect, useState } from 'react';
import SidebarFriday from './SidebarFriday';
import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import {
  ArrowLeft, Plus, Calendar, Bell, FileText, FileUp, X,
  Check, Repeat, Download, Archive, Trash2, Copy, Move, AppWindow, XCircle,
  Search, Filter, Eye, Edit3, Zap, Clock, User, CheckCircle2,
  RotateCcw, Loader2, ChevronDown, ChevronUp, Maximize, Minimize
} from 'lucide-react';
import { doc, getDocs, collection, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Configuración inicial
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const CURRENT_USER_ID = localStorage.getItem('usuario_id') || 'usuario_123';
const CURRENT_USER_NAME = localStorage.getItem('usuario.nombre') || 'Mi Usuario';

// Definición de estados
const estados = [
  {
    value: 'programado',
    label: 'Programado',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: Calendar,
    gradient: 'from-blue-500/20 to-blue-600/5'
  },
  {
    value: 'en_proceso',
    label: 'En Proceso',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: Clock,
    gradient: 'from-emerald-500/20 to-emerald-600/5'
  },
  {
    value: 'finalizado',
    label: 'Finalizado',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    icon: CheckCircle2,
    gradient: 'from-purple-500/20 to-purple-600/5'
  },
  {
    value: 'reprogramacion',
    label: 'Reprogramación',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: RotateCcw,
    gradient: 'from-red-500/20 to-red-600/5'
  }
];

// Componente FilePreview actualizado
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
    switch(fileType) {
      case 'pdf': return <FileText className="text-red-500" size={18} />;
      case 'doc':
      case 'docx': return <FileText className="text-blue-500" size={18} />;
      case 'xls':
      case 'xlsx': return <FileText className="text-green-500" size={18} />;
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
        <button onClick={onView} className="text-gray-400 hover:text-blue-500" title="Vista previa">
          <Eye size={16} />
        </button>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500" title="Eliminar">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

// Componente FileViewerModal nuevo
const FileViewerModal = ({ file, onClose, type }: { file: string; onClose: () => void; type: string }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const renderFileContent = () => {
    if (type === 'pdf') {
      return (
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="text-white">Cargando PDF...</div>}
          error={<div className="text-white">Error al cargar el PDF</div>}
        >
          <Page
            pageNumber={pageNumber}
            width={isFullscreen ? window.innerWidth * 0.8 : 600}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      );
    }

    // For Office files, use Google Docs Viewer or Office Web Viewer
    // Note: Office Web Viewer might have CORS issues or require specific setup
    // Google Docs Viewer is more reliable for public documents
    const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(file)}&embedded=true`;

    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <iframe
          src={viewerUrl}
          className="w-full h-full border-0"
          allowFullScreen
          title="File Viewer"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 rounded-xl ${isFullscreen ? 'w-full h-full' : 'w-full max-w-4xl max-h-[90vh]'}`}>
        <div className="sticky top-0 bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 z-10">
          <h3 className="text-lg font-bold">Visualizador de archivos</h3>
          <div className="flex gap-4">
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="text-gray-400 hover:text-white">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-auto h-full">
          {renderFileContent()}
        </div>

        {type === 'pdf' && numPages && (
          <div className="sticky bottom-0 bg-slate-800 p-3 border-t border-slate-700 flex justify-center items-center gap-4">
            <button
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
              className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm">
              Página {pageNumber} de {numPages}
            </span>
            <button
              onClick={() => setPageNumber(Math.min(pageNumber + 1, numPages))}
              disabled={pageNumber >= numPages}
              className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Componente ServicioModal mejorado
const ServicioModal = ({
  isOpen,
  onClose,
  onSave,
  usuarios
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (servicio: any) => void;
  usuarios: any[];
}) => {
  const [servicio, setServicio] = useState({
    elemento: '',
    personas: [],
    estado: 'programado',
    fecha: new Date().toISOString().split('T')[0],
    descripcion: '',
    documentos: [] as string[]
  });

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileToView, setFileToView] = useState<{url: string; type: string} | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    basico: true,
    estado: true,
    asignacion: false,
    documentos: false
  });

  useEffect(() => {
    if (isOpen) {
      setServicio({
        elemento: '',
        personas: [],
        estado: 'programado',
        fecha: new Date().toISOString().split('T')[0],
        descripcion: '',
        documentos: []
      });
      setFiles([]);
    }
  }, [isOpen]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(file =>
        ['application/pdf',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        .includes(file.type)
      );
      setFiles([...files, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    const urls = [];
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
      console.error('Error uploading files:', error);
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
      console.error('Error creating service:', error);
      toast.error('Error al crear el servicio');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700">
            <h3 className="text-xl font-bold">Nuevo Servicio</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* Sección básica */}
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('basico')}
                >
                  <h4 className="font-medium">Información Básica</h4>
                  {expandedSections.basico ? <ChevronUp /> : <ChevronDown />}
                </div>

                {expandedSections.basico && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Elemento*</label>
                      <input
                        type="text"
                        value={servicio.elemento}
                        onChange={(e) => setServicio({...servicio, elemento: e.target.value})}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                      <textarea
                        value={servicio.descripcion}
                        onChange={(e) => setServicio({...servicio, descripcion: e.target.value})}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sección de estado y fecha */}
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('estado')}
                >
                  <h4 className="font-medium">Estado y Fecha</h4>
                  {expandedSections.estado ? <ChevronUp /> : <ChevronDown />}
                </div>

                {expandedSections.estado && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Estado*</label>
                      <select
                        value={servicio.estado}
                        onChange={(e) => setServicio({...servicio, estado: e.target.value})}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      >
                        {estados.map((estado) => (
                          <option key={estado.value} value={estado.value}>
                            {estado.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Fecha*</label>
                      <input
                        type="date"
                        value={servicio.fecha}
                        onChange={(e) => setServicio({...servicio, fecha: e.target.value})}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sección de asignación */}
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('asignacion')}
                >
                  <h4 className="font-medium">Asignación</h4>
                  {expandedSections.asignacion ? <ChevronUp /> : <ChevronDown />}
                </div>

                {expandedSections.asignacion && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-300 mb-1">Personas asignadas</label>
                    <select
                      multiple
                      value={servicio.personas}
                      onChange={(e) => {
                        const options = Array.from(e.target.selectedOptions, option => option.value);
                        setServicio({...servicio, personas: options});
                      }}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent h-auto min-h-[42px]"
                    >
                      {usuarios.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.nombre}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Mantén presionado Ctrl para seleccionar múltiples</p>
                  </div>
                )}
              </div>

              {/* Sección de documentos */}
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('documentos')}
                >
                  <h4 className="font-medium">Documentos Adjuntos</h4>
                  {expandedSections.documentos ? <ChevronUp /> : <ChevronDown />}
                </div>

                {expandedSections.documentos && (
                  <div className="mt-3">
                    <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 mb-3 flex flex-col items-center">
                      <FileUp className="w-10 h-10 text-blue-400 mb-2" />
                      <p className="text-sm text-gray-400 mb-3">Arrastra archivos aquí o haz clic para seleccionar</p>
                      <button
                        type="button"
                        onClick={() => document.getElementById('file-upload')?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Seleccionar archivos
                      </button>
                      <input
                        id="file-upload"
                        type="file"
                        onChange={handleFileChange}
                        multiple
                        accept=".pdf,.xls,.xlsx,.doc,.docx"
                        className="hidden"
                      />
                      <p className="text-xs text-gray-400 mt-2">Formatos soportados: PDF, Excel, Word</p>
                    </div>

                    <div className="max-h-40 overflow-y-auto">
                      {files.map((file, index) => (
                        <FilePreview
                          key={index}
                          file={file}
                          onRemove={() => removeFile(index)}
                          onView={() => {
                            const ext = file.name.split('.').pop()?.toLowerCase() || '';
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              setFileToView({
                                url: e.target?.result as string,
                                type: ext
                              });
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium flex items-center gap-2 disabled:opacity-70 transition-colors"
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Guardando...
                  </>
                ) : (
                  'Guardar Servicio'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {fileToView && (
        <FileViewerModal
          file={fileToView.url}
          onClose={() => setFileToView(null)}
          type={fileToView.type}
        />
      )}
    </>
  );
};

// Componente Bubble para avatares
const Bubble = ({ nombre, color, short }: { nombre: string; color?: string; short?: string }) => (
  <div
    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs
    ${color ? color : "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500"}
    text-white shadow-lg border border-white/20 mr-2 hover:scale-110 transition-transform duration-200`}
    title={nombre}
    style={{ minWidth: 36 }}
  >
    {short || nombre.split(' ').map((x) => x[0]).join('').toUpperCase()}
  </div>
);

// Componente principal
export const FridayServiciosScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { currentScreen, navigateTo } = useNavigation();
  const [servicios, setServicios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [notifiedServicios, setNotifiedServicios] = useState<string[]>([]);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileToView, setFileToView] = useState<{url: string; type: string} | null>(null); // Added for viewing documents from service list

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const serviciosSnap = await getDocs(collection(db, 'servicios'));
      const serviciosData = serviciosSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const usuariosSnap = await getDocs(collection(db, 'usuarios'));
      const usuariosData = usuariosSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setServicios(serviciosData);
      setUsuarios(usuariosData);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const serviciosAsignados = servicios.filter(s =>
      Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID)
    );
    serviciosAsignados.forEach(s => {
      if (!notifiedServicios.includes(s.id)) {
        setShowPushBanner(true);
        setNotifiedServicios(prev => [...prev, s.id]);
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Nuevo servicio asignado', {
            body: `Se te asignó: ${s.elemento || 'Un servicio'}`,
            icon: '/bell.png'
          });
        } else if (window.Notification && Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification('Nuevo servicio asignado', {
                body: `Se te asignó: ${s.elemento || 'Un servicio'}`,
                icon: '/bell.png'
              });
            }
          });
        }
      }
    });
    if (showPushBanner) {
      const t = setTimeout(() => setShowPushBanner(false), 6000);
      return () => clearTimeout(t);
    }
  }, [servicios, notifiedServicios, showPushBanner]);

  const filteredServicios = servicios.filter(s =>
    s.elemento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.personas?.some((pid: string) => {
      const user = usuarios.find(u => u.id === pid);
      return user?.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
    })
  );

  const grouped = estados.map((est) => ({
    ...est,
    servicios: filteredServicios.filter((s) => (s.estado || 'programado') === est.value),
  }));

  const handleSaveServicio = async (nuevoServicio: any) => {
    try {
      const docRef = await addDoc(collection(db, 'servicios'), nuevoServicio);
      setServicios(prev => [...prev, { ...nuevoServicio, id: docRef.id }]);
    } catch (error) {
      console.error('Error adding document: ', error);
      toast.error('Error al crear el servicio');
    }
  };

  const handleUpdateField = async (servicioId: string, field: string, value: any) => {
    try {
      await updateDoc(doc(db, 'servicios', servicioId), { [field]: value });
      setServicios(prev => prev.map(s =>
        s.id === servicioId ? { ...s, [field]: value } : s
      ));
      toast.success(`Campo '${field}' actualizado correctamente`);
    } catch (error) {
      console.error(`Error updating field ${field}:`, error);
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
      setServicios(servicios.filter(s => !idsToDelete.includes(s.id)));
      setSelectedRows([]);
      toast.success(idsToDelete.length > 1 ? 'Servicios eliminados correctamente' : 'Servicio eliminado correctamente');
    } catch (error) {
      console.error('Error deleting services:', error);
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
      const serviciosSnap = await getDocs(collection(db, 'servicios'));
      const serviciosData = serviciosSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setServicios(serviciosData);
      setSelectedRows([]);
      toast.success('Servicios duplicados correctamente');
    } catch (error) {
      console.error('Error duplicating services:', error);
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

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent, nuevoEstado: string) => {
    e.preventDefault();
    const servicioId = e.dataTransfer.getData('servicioId');

    try {
      await updateDoc(doc(db, 'servicios', servicioId), { estado: nuevoEstado });
      setServicios(servicios.map(s =>
        s.id === servicioId ? { ...s, estado: nuevoEstado } : s
      ));
      toast.success('Estado actualizado correctamente');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar el estado');
    }
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Componente ServicioCard para móvil
  const ServicioCard = ({ s, group }: any) => {
    const isAsignado = Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID);
    const IconComponent = group.icon;

    return (
      <div
        className={`rounded-2xl p-5 mb-4 shadow-xl border backdrop-blur-sm transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]
        ${isAsignado
          ? 'border-emerald-400/50 bg-gradient-to-br from-emerald-500/10 via-slate-800/90 to-slate-900/90 ring-1 ring-emerald-400/30'
          : `border-slate-700/50 bg-gradient-to-br ${group.gradient} via-slate-800/90 to-slate-900/90`
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${group.bgColor} flex items-center justify-center`}>
              <IconComponent className={`w-6 h-6 ${group.color}`} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">{s.elemento || 'Elemento sin nombre'}</h3>
              <p className={`text-sm ${group.color} font-medium`}>{group.label}</p>
            </div>
          </div>
          {isAsignado && (
            <div className="flex items-center gap-2 bg-emerald-500/20 px-3 py-1 rounded-full">
              <Bell className="text-emerald-400 w-4 h-4 animate-pulse" />
              <span className="text-emerald-400 text-xs font-bold">Asignado</span>
            </div>
          )}
        </div>

        {s.descripcion && (
          <div className="mb-4">
            <p className="text-sm text-gray-300">{s.descripcion}</p>
          </div>
        )}

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400 font-medium">Personas asignadas</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(s.personas?.length ? s.personas : []).map((pid: string) => {
              const user = usuarios.find((u) => u.id === pid);
              return user ? (
                <Bubble
                  key={pid}
                  nombre={user.nombre}
                  short={user.short || user.nombre.split(' ').map((x: string) => x[0]).join('')}
                />
              ) : null;
            })}
            <select
              className="bg-slate-800/80 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm font-medium hover:bg-slate-700 transition-colors"
              value=""
              onChange={(e) => {
                const pid = e.target.value;
                if (pid && !s.personas?.includes(pid)) {
                  handleUpdateField(s.id, 'personas', [...(s.personas || []), pid]);
                }
              }}
            >
              <option value="">+ Asignar</option>
              {usuarios.map((u) =>
                <option value={u.id} key={u.id}>{u.nombre}</option>
              )}
            </select>
          </div>
        </div>

        {s.documentos?.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400 font-medium">Documentos adjuntos</span>
            </div>
            <div className="space-y-2">
              {s.documentos.map((docUrl: string, index: number) => (
                <div key={index} className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    {docUrl.endsWith('.pdf') ? (
                      <FileText className="text-red-500" size={16} />
                    ) : (
                      <FileText className="text-blue-500" size={16} />
                    )}
                    <span className="text-sm truncate max-w-xs">{docUrl.split('/').pop()}</span>
                  </div>
                  <button
                    onClick={() => {
                      const ext = docUrl.split('.').pop()?.toLowerCase() || '';
                      setFileToView({
                        url: docUrl,
                        type: ext
                      });
                    }}
                    className="text-gray-400 hover:text-blue-500"
                  >
                    <Eye size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-gray-400 font-medium mb-1 block">Estado</label>
            <select
              value={s.estado || 'programado'}
              className={`w-full ${group.bgColor} border ${group.border} rounded-xl px-3 py-2 text-sm font-bold ${group.color} transition-colors`}
              onChange={e => handleUpdateField(s.id, 'estado', e.target.value)}
            >
              {estados.map(est =>
                <option key={est.value} value={est.value}>{est.label}</option>
              )}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-400 font-medium mb-1 block">Fecha</label>
            <div className="relative">
              <input
                type="date"
                value={s.fecha || ''}
                onChange={(e) => handleUpdateField(s.id, 'fecha', e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl py-3 text-sm font-bold transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2">
            <Eye size={16} />
            Ver más
          </button>
          <button className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl py-3 text-sm font-bold transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2">
            <Edit3 size={16} />
            Editar
          </button>
          <button
            className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl py-3 text-sm font-bold transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
            onClick={() => handleDelete([s.id])}
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex bg-neutral-950 min-h-screen font-sans">
      <SidebarFriday active={currentScreen} onNavigate={navigateTo} />
      <div className="flex-1 ml-[235px] min-h-screen relative">
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans pb-24">
      {/* Notificación push */}
      {showPushBanner && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl px-8 py-4 flex items-center gap-4 shadow-2xl z-50 backdrop-blur-sm border border-emerald-400/30">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Bell className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <p className="font-bold text-lg">¡Nuevo servicio asignado!</p>
            <p className="text-emerald-100 text-sm">Revisa tus servicios pendientes</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/80 border-b border-slate-700/50">
        <div className="flex items-center justify-between px-4 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 transition-all duration-200 hover:scale-105"
              onClick={() => navigateTo('mainmenu')}
              title="Regresar"
            >
              <ArrowLeft size={24} className="text-white" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Servicios de Calibración</h1>
                <p className="text-sm text-gray-400">Gestiona y organiza tus servicios</p>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-4">
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
            <button className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 rounded-xl transition-all duration-200">
              <Filter className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="lg:hidden px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar servicios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-800/80 border border-slate-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus
                            focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="px-4 lg:px-8 py-6">
        {/* Estadísticas rápidas */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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
                  <div className={`w-10 h-10 rounded-lg ${estado.bgColor} flex items-center justify-center`}>
                    <IconComponent className={`w-5 h-5 ${estado.color}`} />
                  </div>
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
        <ServicioModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={handleSaveServicio}
          usuarios={usuarios}
        />

        {/* Columnas de servicios */}
        <div className={`${isMobile ? 'flex flex-col gap-6' : 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6'}`}>
          {grouped.map((group) => {
            const IconComponent = group.icon;
            return (
              <div
                key={group.value}
                className={`rounded-2xl shadow-xl border backdrop-blur-sm ${group.border} bg-gradient-to-br ${group.gradient} transition-all duration-300 ${isDragging ? 'border-dashed border-2 border-white/50' : ''}`}
                onDrop={(e) => handleDrop(e, group.value)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragEnd}
              >
                {/* Header del grupo */}
                <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${group.bgColor} flex items-center justify-center`}>
                      <IconComponent className={`w-6 h-6 ${group.color}`} />
                    </div>
                    <div>
                      <h2 className={`font-bold text-lg ${group.color}`}>{group.label}</h2>
                      <p className="text-sm text-gray-400">{group.servicios.length} servicios</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${group.color}`}>{group.servicios.length}</span>
                  </div>
                </div>

                {/* Servicios */}
                <div className="p-4 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                  {group.servicios.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                        <IconComponent className="w-8 h-8 text-gray-500" />
                      </div>
                      <p className="text-gray-500 font-medium">No hay servicios {group.label.toLowerCase()}</p>
                    </div>
                  ) : (
                    isMobile ? (
                      group.servicios.map((s) => (
                        <ServicioCard key={s.id} s={s} group={group} />
                      ))
                    ) : (
                      <div className="space-y-3">
                        {group.servicios.map((s) => {
                          const isAsignado = Array.isArray(s.personas) && s.personas.includes(CURRENT_USER_ID);
                          return (
                            <div
                              key={s.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, s.id)}
                              onDragEnd={handleDragEnd}
                              className={`relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300
                                ${isAsignado
                                  ? "border-emerald-400/50 bg-gradient-to-br from-emerald-500/10 via-slate-800/90 to-slate-900/90 ring-1 ring-emerald-400/30"
                                  : `border-slate-700/50 bg-gradient-to-br ${group.gradient} via-slate-800/90 to-slate-900/90`
                                }
                                ${selectedRows.includes(s.id) ? "ring-2 ring-blue-500" : ""}
                                hover:shadow-lg hover:scale-[1.01] cursor-grab active:cursor-grabbing
                              `}
                              onMouseEnter={() => setHoveredRow(s.id)}
                              onMouseLeave={() => setHoveredRow(null)}
                            >
                              <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                <input
                                  type="checkbox"
                                  checked={selectedRows.includes(s.id)}
                                  onChange={() => handleSelectRow(s.id)}
                                  className="w-5 h-5 mt-1 accent-blue-500 bg-slate-700 border-slate-500 rounded focus:ring-blue-500"
                                />
                                <div className="flex-1">
                                  {/* Elemento */}
                                  <input
                                    value={s.elemento || ""}
                                    onChange={(e) => handleUpdateField(s.id, "elemento", e.target.value)}
                                    placeholder="Elemento sin nombre"
                                    className="bg-transparent border-b border-slate-700 outline-none text-white text-base font-semibold w-full pb-1 focus:border-blue-500 transition-colors"
                                  />

                                  {/* Descripción */}
                                  {s.descripcion && (
                                    <p className="text-sm text-gray-300 mt-2 line-clamp-2">
                                      {s.descripcion}
                                    </p>
                                  )}

                                  {/* Documentos */}
                                  {s.documentos?.length > 0 && (
                                    <div className="mt-2">
                                      <div className="flex items-center gap-2 text-xs text-gray-400">
                                        <FileText size={14} />
                                        <span>Documentos:</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {s.documentos.map((docUrl: string, index: number) => (
                                          <button
                                            key={index}
                                            onClick={() => {
                                              const ext = docUrl.split('.').pop()?.toLowerCase() || '';
                                              setFileToView({
                                                url: docUrl,
                                                type: ext
                                              });
                                            }}
                                            className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                                          >
                                            <FileText size={12} />
                                            {docUrl.split('/').pop()?.slice(0, 15)}...
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Persona Asignada */}
                                  <div className="flex items-center flex-wrap gap-2 mt-2">
                                    <span className="text-xs text-gray-400 font-medium">Asignado:</span>
                                    {(s.personas?.length ? s.personas : []).map((pid: string) => {
                                      const user = usuarios.find((u) => u.id === pid);
                                      return user ? (
                                        <Bubble key={pid} nombre={user.nombre} short={user.short || user.nombre.split(" ").map((x: string) => x[0]).join("")} />
                                      ) : null;
                                    })}
                                    <select
                                      className="bg-slate-800/80 border border-slate-600 text-white rounded-xl px-2 py-1 text-xs font-medium hover:bg-slate-700 transition-colors"
                                      value={""}
                                      onChange={(e) => {
                                        const pid = e.target.value;
                                        if (pid && !s.personas?.includes(pid)) {
                                          handleUpdateField(s.id, "personas", [...(s.personas || []), pid]);
                                        }
                                      }}
                                    >
                                      <option value="">+ Asignar</option>
                                      {usuarios.map((u) =>
                                        <option value={u.id} key={u.id}>{u.nombre}</option>
                                      )}
                                    </select>
                                  </div>
                                  {/* Estado y Fecha */}
                                  <div className="flex items-center gap-4 mt-3">
                                    <div className="flex items-center gap-2">
                                      <Clock size={16} className="text-gray-400" />
                                      <select
                                        value={s.estado || "programado"}
                                        className={`bg-slate-800/80 border border-slate-600 rounded-xl px-2 py-1 text-xs font-bold ${group.color} transition-colors`}
                                        onChange={e => handleUpdateField(s.id, "estado", e.target.value)}
                                      >
                                        {estados.map(est =>
                                          <option key={est.value} value={est.value}>{est.label}</option>
                                        )}
                                      </select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Calendar size={16} className="text-gray-400" />
                                      <input
                                        type="date"
                                        value={s.fecha || ""}
                                        onChange={(e) => handleUpdateField(s.id, "fecha", e.target.value)}
                                        className="bg-slate-800/80 border border-slate-600 text-white rounded-xl px-2 py-1 text-xs w-32"
                                      />
                                    </div>
                                  </div>
                                </div>
                                {/* Icono de asignado */}
                                {isAsignado && (
                                  <Bell className="text-emerald-400 w-5 h-5 animate-pulse" title="¡Asignado a ti!" />
                                )}
                              </div>
                              {/* Barra flotante de acciones */}
                              {hoveredRow === s.id && (
                                <div className="absolute right-4 -bottom-4 flex justify-end z-30">
                                  <div className="rounded-xl shadow-lg bg-slate-700/90 backdrop-blur-sm px-3 py-1 flex gap-2 animate-fade-in border border-slate-600">
                                    <button className="text-gray-300 hover:text-blue-400 font-medium text-xs px-2 py-1 transition-colors flex items-center gap-1" onClick={() => alert("Ver más")}>
                                      <Eye size={14} /> Ver
                                    </button>
                                    <button className="text-gray-300 hover:text-emerald-400 font-medium text-xs px-2 py-1 transition-colors flex items-center gap-1" onClick={() => alert("Editar")}>
                                      <Edit3 size={14} /> Editar
                                    </button>
                                    <button className="text-gray-300 hover:text-red-400 font-medium text-xs px-2 py-1 transition-colors flex items-center gap-1" onClick={() => handleDelete([s.id])}>
                                      <Trash2 size={14} /> Eliminar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Botón flotante de agregar servicio */}
      <button
        onClick={() => {
          setShowModal(true);
          toast.info("Complete todos los campos requeridos", {
            position: "bottom-right",
            autoClose: 5000
          });
        }}
        className="fixed right-6 bottom-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white p-4 rounded-full shadow-2xl flex items-center justify-center z-40 transition-all duration-200 hover:scale-110 group"
      >
        <Plus size={24} className="group-hover:rotate-90 transition-all duration-300" />
        <span className="sr-only">Agregar servicio</span>
        <span className="absolute -bottom-10 text-xs font-medium bg-blue-700 text-white px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap shadow-lg">
          Nuevo Servicio
        </span>
      </button>

      {/* Barra de selección */}
      {selectedRows.length > 0 && (
        <div className="fixed left-0 bottom-0 w-full z-50 flex justify-center px-4">
          <div className="flex items-center rounded-2xl shadow-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border border-slate-700/50 px-6 py-3 space-x-4 max-w-5xl w-full mx-auto mb-4">
            <div className="flex items-center gap-3 font-semibold text-lg text-cyan-300">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Check size={22} className="text-white" />
              </div>
              <span className="hidden sm:inline">
                {selectedRows.length === 1 ? "1 Elemento seleccionado" : `${selectedRows.length} Elementos seleccionados`}
              </span>
              <span className="sm:hidden">{selectedRows.length}</span>
            </div>
            <div className="flex-1 flex items-center gap-3 pl-4">
              <button
                onClick={handleDuplicate}
                className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-white/10 text-gray-300 hover:text-white"
              >
                <Repeat size={18} />
                <span className="hidden lg:inline text-sm">Duplicar</span>
              </button>
              <button
                onClick={handleExport}
                className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-white/10 text-gray-300 hover:text-white"
              >
                <Download size={18} />
                <span className="hidden lg:inline text-sm">Exportar</span>
              </button>
              <button
                onClick={() => handleDelete()}
                className="hover:scale-105 px-3 py-2 rounded-xl flex items-center gap-2 transition-all duration-200 font-medium hover:bg-red-500/20 text-red-400 hover:text-red-300"
              >
                <Trash2 size={18} />
                <span className="hidden lg:inline text-sm">Eliminar</span>
              </button>
            </div>
            <button
              className="ml-3 p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all duration-200"
              onClick={() => setSelectedRows([])}
            >
              <XCircle size={24} />
            </button>
          </div>
        </div>
      )}

      {fileToView && (
        <FileViewerModal
          file={fileToView.url}
          onClose={() => setFileToView(null)}
          type={fileToView.type}
        />
      )}

      {/* Estilos globales */}
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.3s ease-out;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background-color: transparent;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
   </div>
 </div>
  );
};

export default FridayServiciosScreen;
