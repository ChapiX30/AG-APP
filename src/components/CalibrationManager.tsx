import React, { useState, useRef, useCallback, Fragment, useEffect } from 'react';
import {
  Upload,
  Download,
  Search,
  Filter,
  FileSpreadsheet,
  Calendar,
  User,
  Trash2,
  Eye,
  FolderOpen,
  Plus,
  X,
  Check,
  AlertCircle,
  Settings,
  Pencil,
  Folder,
  Star,
  TrendingUp,
  Shield,
  Zap,
  Award,
  Clock,
  Users,
  Archive,
  RefreshCw,
  Bell,
  Globe,
  Database,
  Activity
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Dialog, Transition } from '@headlessui/react';

// Interface mejorada para archivos de calibración
interface CalibrationFile {
  id: number;
  name: string;
  magnitude: string;
  uploadDate: string;
  uploadedBy: string;
  size: string;
  version: string;
  status: 'active' | 'archived' | 'pending' | 'review';
  fileContent?: ArrayBuffer;
  lastModifiedDate: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  certification: string;
  expiryDate?: string;
  downloads: number;
  rating: number;
  tags: string[];
}

// Simulación de sistema de usuarios más robusto
interface UserSession {
  id: string;
  name: string;
  role: 'admin' | 'technician' | 'supervisor' | 'auditor';
  department: string;
  avatar: string;
  permissions: string[];
}

const CalibrationManager = () => {
  // Sistema de usuarios mejorado - Usuario actual logueado
  const [currentUser] = useState<UserSession>({
    id: 'usr_001',
    name: 'Ing. Carlos Medina Ruiz',
    role: 'supervisor',
    department: 'Metrología Avanzada',
    avatar: 'https://storage.googleapis.com/workspace-0f70711f-8b4e-4d94-86f1-2a93ccde5887/image/6caf820a-5476-45e2-aa97-e1922cb98847.png',
    permissions: ['upload', 'download', 'edit', 'delete', 'approve']
  });

  // Estado de archivos con datos más ricos
  const [files, setFiles] = useState<CalibrationFile[]>(() => {
    try {
      const storedFiles = localStorage.getItem('calibrationFilesPro');
      if (storedFiles) {
        return JSON.parse(storedFiles);
      }
      return [
        {
          id: 1,
          name: 'Formato_Calibración_Masa_CENAM_2024.xlsx',
          magnitude: 'Masa',
          uploadDate: '2024-01-15',
          uploadedBy: 'Dra. María González López',
          size: '2.3 MB',
          version: 'v3.2',
          status: 'active',
          lastModifiedDate: '2024-01-18',
          description: 'Formato oficial CENAM para calibración de patrones de masa clase E1 y E2',
          priority: 'critical',
          certification: 'ISO 9001:2015',
          expiryDate: '2025-01-15',
          downloads: 847,
          rating: 4.9,
          tags: ['CENAM', 'E1', 'E2', 'Oficial']
        },
        {
          id: 2,
          name: 'Certificado_Multímetro_Fluke_8846A.xlsx',
          magnitude: 'Eléctrica',
          uploadDate: '2024-01-10',
          uploadedBy: 'Ing. Roberto Silva Vargas',
          size: '1.8 MB',
          version: 'v2.1',
          status: 'active',
          lastModifiedDate: '2024-01-12',
          description: 'Formato especializado para calibración de multímetros Fluke serie 8846A',
          priority: 'high',
          certification: 'ISO/IEC 17025:2017',
          expiryDate: '2024-12-10',
          downloads: 523,
          rating: 4.8,
          tags: ['Fluke', 'Multímetro', '8846A']
        },
        {
          id: 3,
          name: 'Patrón_Temperatura_PT100_Industrial.xlsx',
          magnitude: 'Temperatura',
          uploadDate: '2024-01-08',
          uploadedBy: 'Mtra. Ana Lucía Herrera',
          size: '3.1 MB',
          version: 'v1.5',
          status: 'review',
          lastModifiedDate: '2024-01-08',
          description: 'Formato para termoresistencias PT100 en aplicaciones industriales',
          priority: 'medium',
          certification: 'NIST Traceable',
          downloads: 312,
          rating: 4.6,
          tags: ['PT100', 'Industrial', 'NIST']
        }
      ];
    } catch (error) {
      console.error('Error cargando archivos:', error);
      return [];
    }
  });

  // Estados de la interfaz
  const [selectedMagnitude, setSelectedMagnitude] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [viewMode, setViewMode] = useState<'advanced-cards' | 'table'>('advanced-cards'); // Especificar tipo
  const [sortBy, setSortBy] = useState('priority');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFileData, setPreviewFileData] = useState<string[][] | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Estados del formulario de subida mejorado
  const [uploadForm, setUploadForm] = useState({
    fileName: '',
    magnitude: 'Masa',
    version: 'v1.0',
    description: '',
    priority: 'medium' as CalibrationFile['priority'],
    certification: 'ISO 9001:2015',
    expiryDate: '',
    tags: [] as string[]
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Magnitudes expandidas con mejores visuales
  const magnitudes = [
    { value: 'Todas', label: 'Todas las Magnitudes', color: 'from-gray-400 to-gray-600', icon: 'fas fa-chart-bar', bgGradient: 'bg-gradient-to-r from-gray-100 to-gray-200' },
    { value: 'Masa', label: 'Masa y Densidad', color: 'from-blue-500 to-blue-700', icon: 'fas fa-weight-scale', bgGradient: 'bg-gradient-to-r from-blue-100 to-blue-200' },
    { value: 'Dimensional', label: 'Dimensional', color: 'from-green-500 to-green-700', icon: 'fas fa-ruler-combined', bgGradient: 'bg-gradient-to-r from-green-100 to-green-200' },
    { value: 'Eléctrica', label: 'Eléctrica', color: 'from-yellow-500 to-orange-600', icon: 'fas fa-bolt', bgGradient: 'bg-gradient-to-r from-yellow-100 to-orange-200' },
    { value: 'Temperatura', label: 'Temperatura', color: 'from-red-500 to-pink-600', icon: 'fas fa-thermometer-half', bgGradient: 'bg-gradient-to-r from-red-100 to-pink-200' },
    { value: 'Presión', label: 'Presión y Vacío', color: 'from-purple-500 to-indigo-600', icon: 'fas fa-gauge-high', bgGradient: 'bg-gradient-to-r from-purple-100 to-indigo-200' },
    { value: 'Flujo', label: 'Flujo y Volumen', color: 'from-cyan-500 to-blue-600', icon: 'fas fa-water', bgGradient: 'bg-gradient-to-r from-cyan-100 to-blue-200' },
    { value: 'Óptica', label: 'Óptica y Fotometría', color: 'from-amber-500 to-yellow-600', icon: 'fas fa-eye', bgGradient: 'bg-gradient-to-r from-amber-100 to-yellow-200' },
    { value: 'Química', label: 'Química Analítica', color: 'from-teal-500 to-emerald-600', icon: 'fas fa-flask', bgGradient: 'bg-gradient-to-r from-teal-100 to-emerald-200' }
  ];

  // Estados de archivos con mejores colores
  const statusConfig = {
    active: { label: 'Activo', color: 'bg-green-100 text-green-800', icon: 'fas fa-check-circle' },
    archived: { label: 'Archivado', color: 'bg-gray-100 text-gray-800', icon: 'fas fa-archive' },
    pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: 'fas fa-clock' },
    review: { label: 'En Revisión', color: 'bg-blue-100 text-blue-800', icon: 'fas fa-search' }
  };

  const priorityConfig = {
    critical: { label: 'Crítico', color: 'bg-red-500', textColor: 'text-red-700' },
    high: { label: 'Alto', color: 'bg-orange-500', textColor: 'text-orange-700' },
    medium: { label: 'Medio', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
    low: { label: 'Bajo', color: 'bg-green-500', textColor: 'text-green-700' }
  };

  // Efecto para guardar archivos
  useEffect(() => {
    try {
      localStorage.setItem('calibrationFilesPro', JSON.stringify(files));
    } catch (error) {
      console.error('Error guardando archivos:', error);
      toast.error('Error al guardar los cambios');
    }
  }, [files]);

  // Función para manejar selección de archivos
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        setUploadForm(prev => ({ ...prev, fileName: file.name.replace(/\.[^/.]+$/, "") }));
        toast.success(`Archivo "${file.name}" seleccionado correctamente`);
      } else {
        toast.error('Formato no compatible. Use archivos .xlsx o .xls');
        setSelectedFile(null);
      }
    }
  };

  // Función mejorada para subir archivos
  const handleUploadSubmit = useCallback(() => {
    if (!selectedFile) {
      toast.error('Selecciona un archivo para continuar');
      return;
    }
    if (!uploadForm.fileName.trim()) {
      toast.error('El nombre del archivo es obligatorio');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;

      // Simulación de progreso más realista
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += Math.random() * 15 + 5;
        setUploadProgress(Math.min(currentProgress, 100));

        if (currentProgress >= 100) {
          clearInterval(interval);
          setIsUploading(false);

          const newFile: CalibrationFile = {
            id: Date.now() + Math.random(),
            name: uploadForm.fileName + '.xlsx',
            magnitude: uploadForm.magnitude,
            uploadDate: new Date().toISOString().split('T')[0],
            uploadedBy: currentUser.name, // ¡USUARIO LOGUEADO REAL!
            size: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
            version: uploadForm.version,
            status: 'pending',
            fileContent: arrayBuffer,
            lastModifiedDate: new Date().toISOString().split('T')[0],
            description: uploadForm.description,
            priority: uploadForm.priority,
            certification: uploadForm.certification,
            expiryDate: uploadForm.expiryDate,
            downloads: 0,
            rating: 5.0,
            tags: uploadForm.tags
          };

          setFiles(prev => [newFile, ...prev]);
          setShowUploadModal(false);
          toast.success(`"${newFile.name}" subido exitosamente por ${currentUser.name}!`, {
            duration: 4000,
            icon: '🎉'
          });

          // Reset form
          setSelectedFile(null);
          setUploadForm({
            fileName: '',
            magnitude: 'Masa',
            version: 'v1.0',
            description: '',
            priority: 'medium',
            certification: 'ISO 9001:2015',
            expiryDate: '',
            tags: []
          });
        }
      }, 80);
    };

    reader.onerror = () => {
      toast.error('Error al procesar el archivo');
      setIsUploading(false);
      setShowUploadModal(false);
    };

    reader.readAsArrayBuffer(selectedFile);
  }, [selectedFile, uploadForm, currentUser.name]);

  // Filtros mejorados
  const filteredFiles = files.filter(file => {
    const matchesMagnitude = selectedMagnitude === 'Todas' || file.magnitude === selectedMagnitude;
    const matchesStatus = selectedStatusFilter === 'all' || file.status === selectedStatusFilter;
    const matchesSearch =
      file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.uploadedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesMagnitude && matchesStatus && matchesSearch;
  });

  // Ordenación mejorada
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        comparison = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
        break;
      case 'modified':
        comparison = new Date(a.lastModifiedDate).getTime() - new Date(b.lastModifiedDate).getTime();
        break;
      case 'downloads':
        comparison = a.downloads - b.downloads;
        break;
      case 'rating':
        comparison = a.rating - b.rating;
        break;
      case 'priority':
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
        break;
      default:
        comparison = 0;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Funciones de acción mejoradas
  const handleDownload = (file: CalibrationFile) => {
    if (file.fileContent) {
      const blob = new Blob([file.fileContent], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Incrementar contador de descargas
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, downloads: f.downloads + 1 } : f));
      toast.success(`Descargando "${file.name}" - Descarga ${file.downloads + 1}`, { icon: '⬇️' });
    } else {
      toast.error('Contenido del archivo no disponible');
    }
  };

  const handleDelete = (fileId: number, fileName: string) => {
    setFiles(prev => prev.filter(file => file.id !== fileId));
    toast.success(`"${fileName}" eliminado permanentemente`, { icon: '🗑️' });
  };

  const handlePreview = (file: CalibrationFile) => {
    if (file.fileContent) {
      try {
        const workbook = XLSX.read(file.fileContent, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        setPreviewFileData(data);
        setPreviewFileName(file.name);
        setShowPreviewModal(true);
        toast.success('Vista previa generada exitosamente', { icon: '👁️' });
      } catch (error) {
        console.error('Error en vista previa:', error);
        toast.error('No se pudo generar la vista previa');
      }
    } else {
      toast.error('Contenido no disponible para vista previa');
    }
  };

  const handleStatusChange = (fileId: number, newStatus: CalibrationFile['status']) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId
        ? {
            ...f,
            status: newStatus,
            lastModifiedDate: new Date().toISOString().split('T')[0],
            uploadedBy: `${currentUser.name} (Modificado)`
          }
        : f
    ));
    toast.success(`Estado actualizado por ${currentUser.name}`, { icon: '✅' });
  };

  const getMagnitudeInfo = (magnitude: string) => {
    return magnitudes.find(m => m.value === magnitude) || magnitudes[0];
  };

  // Estadísticas mejoradas
  const stats = {
    total: files.length,
    active: files.filter(f => f.status === 'active').length,
    pending: files.filter(f => f.status === 'pending').length,
    critical: files.filter(f => f.priority === 'critical').length,
    totalDownloads: files.reduce((sum, f) => sum + f.downloads, 0),
    avgRating: files.length > 0 ? (files.reduce((sum, f) => sum + f.rating, 0) / files.length).toFixed(1) : '0'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1f2937',
            color: '#f9fafb',
            borderRadius: '12px',
            padding: '16px'
          }
        }}
      />

      <div className="max-w-7xl mx-auto p-6">
        {/* Header Rediseñado */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 rounded-3xl opacity-90"></div>
          <div className="relative bg-white/20 backdrop-blur-lg rounded-3xl p-8 border border-white/30">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between">
              <div className="mb-6 lg:mb-0">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                    <Activity className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-black text-white mb-1">
                      CalibraciónPRO
                      <span className="text-yellow-300 ml-2">⚡</span>
                    </h1>
                    <p className="text-blue-100 text-lg font-medium">
                      Sistema Inteligente de Gestión Metrológica
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4 text-white/80">
                  <div className="flex items-center space-x-2">
                    <img
                      src={currentUser.avatar}
                      alt={`Avatar de ${currentUser.name}`}
                      className="w-8 h-8 rounded-full border-2 border-white/30"
                    />
                    <span className="font-medium">{currentUser.name}</span>
                  </div>
                  <span className="text-white/60">•</span>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-medium">
                    {currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}
                  </span>
                  <span className="text-white/60">•</span>
                  <span className="text-sm">{currentUser.department}</span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="group bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-8 py-4 rounded-xl font-semibold flex items-center space-x-3 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <Plus className="w-5 h-5 group-hover:rotate-180 transition-transform duration-300" />
                  <span>Subir Formato</span>
                </button>
                <button className="bg-white/20 hover:bg-white/30 text-white p-4 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20">
                  <Bell className="w-5 h-5" />
                </button>
                <button className="bg-white/20 hover:bg-white/30 text-white p-4 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Panel de Estadísticas Avanzado */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Database className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-black text-gray-800">{stats.total}</span>
            </div>
            <p className="text-gray-600 font-medium">Total Formatos</p>
            <p className="text-xs text-gray-400 mt-1">Base de datos completa</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-black text-green-600">{stats.active}</span>
            </div>
            <p className="text-gray-600 font-medium">Activos</p>
            <p className="text-xs text-gray-400 mt-1">Listos para usar</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-black text-yellow-600">{stats.pending}</span>
            </div>
            <p className="text-gray-600 font-medium">Pendientes</p>
            <p className="text-xs text-gray-400 mt-1">En proceso</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-black text-red-600">{stats.critical}</span>
            </div>
            <p className="text-gray-600 font-medium">Críticos</p>
            <p className="text-xs text-gray-400 mt-1">Prioridad alta</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-black text-purple-600">{stats.totalDownloads}</span>
            </div>
            <p className="text-gray-600 font-medium">Descargas</p>
            <p className="text-xs text-gray-400 mt-1">Total acumulado</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center">
                <Star className="w-6 h-6 text-white" />
              </div>
              <span className="text-3xl font-black text-amber-600">{stats.avgRating}</span>
            </div>
            <p className="text-gray-600 font-medium">Rating Promedio</p>
            <p className="text-xs text-gray-400 mt-1">Calidad evaluada</p>
          </div>
        </div>

        {/* Panel de Controles Avanzado */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Búsqueda Avanzada */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Búsqueda Inteligente</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, usuario, descripción, tags..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 font-medium"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Filtros */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Magnitud</label>
                <select
                  value={selectedMagnitude}
                  onChange={(e) => setSelectedMagnitude(e.target.value)}
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 font-medium bg-white"
                >
                  {magnitudes.map(magnitude => (
                    <option key={magnitude.value} value={magnitude.value}>
                      {magnitude.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 font-medium bg-white"
                >
                  <option value="all">Todos los Estados</option>
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ordenación y Vista */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ordenar por</label>
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field);
                    setSortOrder(order);
                  }}
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 font-medium bg-white"
                >
                  <option value="priority-desc">Prioridad ↓</option>
                  <option value="date-desc">Fecha subida ↓</option>
                  <option value="modified-desc">Última modificación ↓</option>
                  <option value="downloads-desc">Más descargados</option>
                  <option value="rating-desc">Mejor valorados</option>
                  <option value="name-asc">Nombre A-Z</option>
                  <option value="name-desc">Nombre Z-A</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Vista</label>
                <div className="flex bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('advanced-cards')}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                      viewMode === 'advanced-cards'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    <i className="fas fa-th-large mr-2"></i>
                    Avanzada
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                      viewMode === 'table'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    <i className="fas fa-table mr-2"></i>
                    Tabla
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Visualización de Archivos */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {sortedFiles.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-32 h-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-8">
                <FolderOpen className="w-16 h-16 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">No se encontraron formatos</h3>
              <p className="text-gray-500 mb-8 text-lg max-w-md mx-auto">
                {searchTerm || selectedMagnitude !== 'Todas' || selectedStatusFilter !== 'all'
                  ? 'Intenta ajustar los filtros de búsqueda para encontrar más resultados'
                  : 'Comienza subiendo tu primer formato de calibración al sistema'}
              </p>
              {!searchTerm && selectedMagnitude === 'Todas' && selectedStatusFilter === 'all' && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 rounded-xl font-semibold inline-flex items-center space-x-3 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <Plus className="w-6 h-6" />
                  <span>Subir Primer Formato</span>
                </button>
              )}
            </div>
          ) : viewMode === 'advanced-cards' ? (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {sortedFiles.map(file => {
                  const magnitudeInfo = getMagnitudeInfo(file.magnitude);
                  const statusInfo = statusConfig[file.status];
                  const priorityInfo = priorityConfig[file.priority];

                  return (
                    <div
                      key={file.id}
                      className={`group bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border-2 border-gray-100 hover:border-blue-300 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 hover:scale-105 relative overflow-hidden`}
                    >
                      {/* Indicator de prioridad */}
                      <div className={`absolute top-0 left-0 w-full h-1 ${priorityInfo.color}`}></div>

                      {/* Header de la tarjeta */}
                      <div className="flex items-start justify-between mb-6">
                        <div className={`w-16 h-16 ${magnitudeInfo.bgGradient} rounded-xl flex items-center justify-center shadow-md`}>
                          <i className={`${magnitudeInfo.icon} text-2xl bg-gradient-to-r ${magnitudeInfo.color} bg-clip-text text-transparent`}></i>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                            <i className={`${statusInfo.icon} mr-1`}></i>
                            {statusInfo.label}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${priorityInfo.color}`}></div>
                        </div>
                      </div>

                      {/* Contenido principal */}
                      <div className="mb-6">
                        <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors" title={file.name}>
                          {file.name}
                        </h3>
                        <p className="text-gray-600 text-sm line-clamp-3 mb-4 leading-relaxed" title={file.description}>
                          {file.description || 'Sin descripción disponible.'}
                        </p>

                        {/* Tags */}
                        {file.tags && file.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {file.tags.slice(0, 3).map((tag, index) => (
                              <span
                                key={index}
                                className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                            {file.tags.length > 3 && (
                              <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                                +{file.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        <div className={`inline-block px-4 py-2 rounded-lg text-sm font-semibold ${magnitudeInfo.bgGradient} text-gray-700 mb-4`}>
                          <i className={`${magnitudeInfo.icon} mr-2`}></i>
                          {magnitudeInfo.label}
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="space-y-3 text-sm text-gray-600 mb-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>Subido: {new Date(file.uploadDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="truncate font-medium">{file.uploadedBy}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-gray-800">{file.size}</span>
                          <span className="bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
                            {file.version}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-yellow-400" />
                            <span className="font-semibold">{file.rating.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Download className="w-4 h-4 text-blue-400" />
                            <span className="font-semibold">{file.downloads}</span>
                          </div>
                        </div>

                        {file.certification && (
                          <div className="flex items-center space-x-2">
                            <Award className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-medium text-purple-600">{file.certification}</span>
                          </div>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center justify-between">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 group/btn"
                            title="Descargar archivo"
                          >
                            <Download className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          <button
                            onClick={() => handlePreview(file)}
                            className="p-3 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all duration-200 group/btn"
                            title="Vista previa"
                          >
                            <Eye className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          <button
                            onClick={() => handleDelete(file.id, file.name)}
                            className="p-3 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 group/btn"
                            title="Eliminar archivo"
                          >
                            <Trash2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                          </button>
                        </div>

                        <select
                          value={file.status}
                          onChange={(e) => handleStatusChange(file.id, e.target.value as CalibrationFile['status'])}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                          {Object.entries(statusConfig).map(([key, config]) => (
                            <option key={key} value={key}>{config.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Vista de tabla mejorada
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Archivo</th>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Magnitud</th>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Estado</th>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Subido por</th>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Fecha</th>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Rating</th>
                    <th className="text-left py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Descargas</th>
                    <th className="text-center py-6 px-6 font-bold text-gray-800 text-sm uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sortedFiles.map((file, index) => {
                    const magnitudeInfo = getMagnitudeInfo(file.magnitude);
                    const statusInfo = statusConfig[file.status];
                    const priorityInfo = priorityConfig[file.priority];

                    return (
                      <tr key={file.id} className={`hover:bg-gray-50 transition-colors duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="py-6 px-6">
                          <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 ${magnitudeInfo.bgGradient} rounded-xl flex items-center justify-center shadow-sm flex-shrink-0`}>
                              <i className={`${magnitudeInfo.icon} text-lg bg-gradient-to-r ${magnitudeInfo.color} bg-clip-text text-transparent`}></i>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <p className="font-semibold text-gray-900 truncate max-w-xs" title={file.name}>
                                  {file.name}
                                </p>
                                <div className={`w-2 h-2 rounded-full ${priorityInfo.color} flex-shrink-0`}></div>
                              </div>
                              <p className="text-xs text-gray-500 truncate max-w-xs" title={file.description}>
                                {file.description || 'Sin descripción'}
                              </p>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-xs font-medium">
                                  {file.version}
                                </span>
                                <span className="text-xs text-gray-500">{file.size}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-6 px-6">
                          <span className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold ${magnitudeInfo.bgGradient} text-gray-700`}>
                            <i className={`${magnitudeInfo.icon} mr-2`}></i>
                            {magnitudeInfo.label}
                          </span>
                        </td>
                        <td className="py-6 px-6">
                          <span className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-semibold ${statusInfo.color}`}>
                            <i className={`${statusInfo.icon} mr-2`}></i>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-6 px-6">
                          <div className="text-sm text-gray-900 font-medium">{file.uploadedBy}</div>
                          <div className="text-xs text-gray-500">{currentUser.department}</div>
                        </td>
                        <td className="py-6 px-6">
                          <div className="text-sm text-gray-900">
                            {new Date(file.uploadDate).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            Mod: {new Date(file.lastModifiedDate).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short'
                            })}
                          </div>
                        </td>
                        <td className="py-6 px-6">
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                            <span className="text-sm font-semibold text-gray-900">{file.rating.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="py-6 px-6">
                          <div className="flex items-center space-x-1">
                            <TrendingUp className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-semibold text-gray-900">{file.downloads}</span>
                          </div>
                        </td>
                        <td className="py-6 px-6">
                          <div className="flex justify-center space-x-2">
                            <button
                              onClick={() => handleDownload(file)}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                              title="Descargar"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePreview(file)}
                              className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-200"
                              title="Vista previa"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(file.id, file.name)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Subida Mejorado */}
        <Transition appear show={showUploadModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowUploadModal(false)}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4 text-center">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-3xl bg-white p-8 text-left align-middle shadow-2xl transition-all">
                    {isUploading ? (
                      <div className="text-center py-12">
                        <div className="relative w-24 h-24 mx-auto mb-8">
                          <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-pulse">
                            <Upload className="w-12 h-12 text-white" />
                          </div>
                          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">Procesando archivo...</h3>
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                        <p className="text-gray-600 text-lg font-medium">{uploadProgress.toFixed(0)}% completado</p>
                        <p className="text-sm text-gray-500 mt-2">Subiendo por {currentUser.name}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-8">
                          <div>
                            <Dialog.Title as="h2" className="text-3xl font-bold text-gray-900 mb-2">
                              Subir Nuevo Formato
                            </Dialog.Title>
                            <p className="text-gray-600">Agrega un nuevo formato de calibración al sistema</p>
                          </div>
                          <button
                            onClick={() => setShowUploadModal(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all duration-200"
                          >
                            <X className="w-6 h-6" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Zona de archivo */}
                          <div className="space-y-6">
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-3">
                                Archivo de Calibración <span className="text-red-500">*</span>
                              </label>
                              <div
                                className="border-3 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-blue-400 transition-all duration-300 cursor-pointer group bg-gradient-to-br from-gray-50 to-blue-50 hover:from-blue-50 hover:to-purple-50"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept=".xlsx,.xls"
                                  onChange={handleFileSelect}
                                  className="hidden"
                                />
                                {selectedFile ? (
                                  <div className="space-y-4">
                                    <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                                      <Check className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                      <p className="font-bold text-green-600 text-lg">{selectedFile.name}</p>
                                      <p className="text-sm text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setUploadForm(prev => ({ ...prev, fileName: '' })); }}
                                      className="text-red-500 hover:text-red-700 font-medium"
                                    >
                                      Cambiar archivo
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300">
                                      <Upload className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                      <p className="text-xl font-bold text-gray-900 mb-2">
                                        Arrastra o selecciona tu archivo
                                      </p>
                                      <p className="text-gray-500">
                                        Formatos: .xlsx, .xls | Máx: 10 MB
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                              <div className="flex items-center space-x-3">
                                <div className="flex items-center space-x-2">
                                  <img
                                    src={currentUser.avatar}
                                    alt="Avatar"
                                    className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                                    <p className="text-sm font-semibold text-blue-900">{currentUser.name}</p>
                                    <p className="text-xs text-blue-600">{currentUser.role} • {currentUser.department}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Metadatos */}
                          <div className="space-y-6">
                            <div>
                              <label htmlFor="fileName" className="block text-sm font-bold text-gray-700 mb-2">
                                Nombre del Formato <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                id="fileName"
                                value={uploadForm.fileName}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, fileName: e.target.value }))}
                                placeholder="Ej: Formato_Calibracion_Masa_2024"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 font-medium"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label htmlFor="magnitude" className="block text-sm font-bold text-gray-700 mb-2">
                                  Magnitud
                                </label>
                                <select
                                  id="magnitude"
                                  value={uploadForm.magnitude}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, magnitude: e.target.value }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 font-medium"
                                >
                                  {magnitudes.slice(1).map(magnitude => (
                                    <option key={magnitude.value} value={magnitude.value}>
                                      {magnitude.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label htmlFor="priority" className="block text-sm font-bold text-gray-700 mb-2">
                                  Prioridad
                                </label>
                                <select
                                  id="priority"
                                  value={uploadForm.priority}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, priority: e.target.value as CalibrationFile['priority'] }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 font-medium"
                                >
                                  <option value="low">Baja</option>
                                  <option value="medium">Media</option>
                                  <option value="high">Alta</option>
                                  <option value="critical">Crítica</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label htmlFor="version" className="block text-sm font-bold text-gray-700 mb-2">
                                  Versión
                                </label>
                                <input
                                  type="text"
                                  id="version"
                                  value={uploadForm.version}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, version: e.target.value }))}
                                  placeholder="v1.0"
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 font-medium"
                                />
                              </div>

                              <div>
                                <label htmlFor="certification" className="block text-sm font-bold text-gray-700 mb-2">
                                  Certificación
                                </label>
                                <select
                                  id="certification"
                                  value={uploadForm.certification}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, certification: e.target.value }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all duration-200 font-medium"
                                >
                                  <option value="ISO 9001:2015">ISO 9001:2015</option>
                                  <option value="ISO/IEC 17025:2017">ISO/IEC 17025:2017</option>
                                  <option value="NIST Traceable">NIST Traceable</option>
                                  <option value="CENAM">CENAM</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label htmlFor="description" className="block text-sm font-bold text-gray-700 mb-2">
                                Descripción
                              </label>
                              <textarea
                                id="description"
                                value={uploadForm.description}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                                rows={4}
                                placeholder="Describe el propósito, contenido y aplicaciones de este formato..."
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 resize-none font-medium"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end space-x-4 mt-8 pt-6 border-t border-gray-200">
                          <button
                            type="button"
                            className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all duration-200"
                            onClick={() => setShowUploadModal(false)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                            onClick={handleUploadSubmit}
                            disabled={!selectedFile || !uploadForm.fileName.trim()}
                          >
                            <Upload className="w-5 h-5" />
                            <span>Subir Formato</span>
                          </button>
                        </div>
                      </>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal de Vista Previa */}
        <Transition appear show={showPreviewModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowPreviewModal(false)}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4 text-center">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <Dialog.Panel className="w-full max-w-6xl max-h-[90vh] transform overflow-hidden rounded-3xl bg-white text-left align-middle shadow-2xl transition-all">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <Dialog.Title as="h3" className="text-2xl font-bold mb-2">
                            Vista Previa del Archivo
                          </Dialog.Title>
                          <p className="text-blue-100">{previewFileName}</p>
                        </div>
                        <button
                          onClick={() => setShowPreviewModal(false)}
                          className="p-2 text-blue-100 hover:text-white hover:bg-white/20 rounded-xl transition-all duration-200"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    </div>

                    <div className="p-6 max-h-[70vh] overflow-auto">
                      {previewFileData && previewFileData.length > 0 ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                {previewFileData[0].map((header, index) => (
                                  <th key={index} className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {previewFileData.slice(1, 101).map((row, rowIndex) => (
                                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200 last:border-r-0">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {previewFileData.length > 101 && (
                            <div className="bg-yellow-50 border-t border-yellow-200 p-4 text-center">
                              <p className="text-yellow-800 font-medium">
                                Mostrando las primeras 100 filas de {previewFileData.length - 1} total
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-gray-500 text-lg">No hay datos disponibles para mostrar</p>
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-50 px-6 py-4 flex justify-end">
                      <button
                        type="button"
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg"
                        onClick={() => setShowPreviewModal(false)}
                      >
                        Cerrar Vista Previa
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>
      </div>
    </div>
  );
};

export default CalibrationManager;
