import React, { useState, useRef, useCallback, Fragment, useEffect } from 'react';
import {
  Upload,
  Download,
  Search,
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
  Star,
  TrendingUp,
  Shield,
  Clock,
  Database,
  Activity,
  History,
  FileSpreadsheet,
  MessageSquareWarning,
  FileCheck2,
  FileX2,
  Send,
  Archive,
  Edit3
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Dialog, Transition } from '@headlessui/react';

/* ────────────────────────────────────────────────────────────────────────────
   Firebase (Auth + Firestore)
   Reemplaza la config con la tuya o usa la compartida del proyecto.
   Si ya inicializas Firebase en otro archivo, puedes mover esto a tu util y
   solo importar auth y db aquí.
──────────────────────────────────────────────────────────────────────────── */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'TU_API_KEY',
  authDomain: 'TU_AUTH_DOMAIN',
  projectId: 'TU_PROJECT_ID',
  storageBucket: 'TU_BUCKET',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
};

if (!getApps().length) initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

/* ────────────────────────────────────────────────────────────────────────────
   Tipos
──────────────────────────────────────────────────────────────────────────── */
type WorkflowStatus = 'uploaded' | 'review' | 'published' | 'rejected' | 'archived';

interface HistoryEvent {
  ts: string;
  user: string;
  action: 'seed' | 'upload' | 'send_review' | 'approve' | 'publish' | 'reject' | 'edit_meta' | 'archive';
  comment?: string;
}

interface CalibrationFile {
  id: number;
  name: string;
  magnitude: string;
  uploadDate: string;
  uploadedBy: string;
  size: string;
  version: string;
  status: WorkflowStatus;
  fileContent?: ArrayBuffer;
  lastModifiedDate: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  certification: string;
  expiryDate?: string;
  downloads: number;
  rating: number;
  tags: string[];
  history: HistoryEvent[];
  reviewer?: string;
  rejectComment?: string;
}

type Role = 'admin' | 'supervisor' | 'quality' | 'technician';

interface UserSession {
  uid: string;
  name: string;
  role: Role;
  department: string;
  permissions: string[]; // 'upload','download','edit','delete','approve','publish','reject','archive'
}

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────────────────── */
const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const nowISO = () => new Date().toISOString();

// Normaliza puesto de Firestore a Role interno
function normalizeRole(puesto: string | undefined | null): Role {
  const p = (puesto || '').toLowerCase();
  if (p.includes('admin')) return 'admin';
  if (p.includes('supervisor') || p.includes('gerente')) return 'supervisor';
  if (p.includes('calidad') || p.includes('quality')) return 'quality';
  // default
  return 'technician';
}

function permissionsFor(role: Role): UserSession['permissions'] {
  switch (role) {
    case 'admin':
      return ['upload', 'download', 'edit', 'delete', 'approve', 'publish', 'reject', 'archive'];
    case 'supervisor':
      return ['upload', 'download', 'edit', 'delete', 'approve', 'publish', 'reject', 'archive'];
    case 'quality':
      return ['download', 'approve', 'publish', 'reject'];
    case 'technician':
    default:
      return ['upload', 'download'];
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   UI Catalogs
──────────────────────────────────────────────────────────────────────────── */
const magnitudes = [
  { value: 'Todas', label: 'Todas las Magnitudes' },
  { value: 'Masa', label: 'Masa y Densidad' },
  { value: 'Dimensional', label: 'Dimensional' },
  { value: 'Eléctrica', label: 'Eléctrica' },
  { value: 'Temperatura', label: 'Temperatura' },
  { value: 'Presión', label: 'Presión y Vacío' },
  { value: 'Flujo', label: 'Flujo y Volumen' },
  { value: 'Óptica', label: 'Óptica y Fotometría' },
  { value: 'Química', label: 'Química Analítica' }
];

const statusConfig: Record<WorkflowStatus, { label: string; dot: string; badge: string; step: number }> = {
  uploaded:  { label: 'Subido',      dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-800',   step: 1 },
  review:    { label: 'En revisión', dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-800', step: 2 },
  published: { label: 'Publicado',   dot: 'bg-green-600',  badge: 'bg-green-100 text-green-800', step: 3 },
  rejected:  { label: 'Rechazado',   dot: 'bg-red-500',    badge: 'bg-red-100 text-red-800',     step: 2 },
  archived:  { label: 'Archivado',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-800',   step: 3 },
};

const priorityConfig = {
  critical: { label: 'Crítico', bar: 'bg-red-500' },
  high:     { label: 'Alto',    bar: 'bg-orange-500' },
  medium:   { label: 'Medio',   bar: 'bg-yellow-500' },
  low:      { label: 'Bajo',    bar: 'bg-emerald-500' },
};

/* ────────────────────────────────────────────────────────────────────────────
   Componente principal
──────────────────────────────────────────────────────────────────────────── */
const CalibrationManager: React.FC = () => {
  /* ── Sesión por Firebase ──────────────────────────────────────────────── */
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFbUser(u);
      if (!u) {
        setCurrentUser(null);
        setLoadingUser(false);
        toast.error('No has iniciado sesión.');
        return;
      }
      try {
        // Busca perfil en colección "usuarios" con id = uid
        const ref = doc(db, 'usuarios', u.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          // Fallback mínimo: usa displayName/email
          const name = u.displayName || u.email || 'Usuario';
          const role = 'technician' as Role;
          const profile: UserSession = {
            uid: u.uid,
            name: name,
            role,
            department: '—',
            permissions: permissionsFor(role)
          };
          setCurrentUser(profile);
          setLoadingUser(false);
          toast('Perfil no encontrado en "usuarios". Se asumirá Metrólogo.', { icon: '⚠️' });
          return;
        }
        const data = snap.data() as any;
        const role = normalizeRole(data?.puesto);
        const profile: UserSession = {
          uid: u.uid,
          name: (data?.nombre || u.displayName || u.email || 'Usuario'),
          role,
          department: (data?.departamento || '—'),
          permissions: permissionsFor(role)
        };
        setCurrentUser(profile);
      } catch (e) {
        console.error(e);
        toast.error('Error cargando perfil de usuario');
      } finally {
        setLoadingUser(false);
      }
    });
    return () => unsub();
  }, []);

  /* ── Datos (cargados de localStorage, sin nombres inventados) ─────────── */
  const [files, setFiles] = useState<CalibrationFile[]>(() => {
    const stored = localStorage.getItem('calibrationFiles_v3');
    if (stored) return JSON.parse(stored);

    const seed: CalibrationFile[] = [
      {
        id: 1,
        name: 'Formato_Calibracion_Vernier.xlsx',
        magnitude: 'Dimensional',
        uploadDate: '2025-07-15',
        uploadedBy: '—',
        size: '—',
        version: 'v1.0',
        status: 'uploaded',
        lastModifiedDate: '2025-07-15',
        description: 'Formato oficial para vernier / calibrador pie de rey.',
        priority: 'high',
        certification: 'ISO/IEC 17025:2017',
        downloads: 0,
        rating: 5.0,
        tags: ['vernier', 'dimensional'],
        history: [
          { ts: '2025-07-15T10:00:00Z', user: 'Sistema', action: 'seed' }
        ]
      },
      {
        id: 2,
        name: 'Formato_Multimetro_General.xlsx',
        magnitude: 'Eléctrica',
        uploadDate: '2025-07-10',
        uploadedBy: '—',
        size: '—',
        version: 'v1.2',
        status: 'review',
        lastModifiedDate: '2025-07-11',
        description: 'Formato genérico para multímetros digitales.',
        priority: 'medium',
        certification: 'ISO 9001:2015',
        downloads: 12,
        rating: 4.8,
        tags: ['eléctrica', 'multímetro'],
        history: [
          { ts: '2025-07-10T09:12:00Z', user: 'Sistema', action: 'seed' },
          { ts: '2025-07-11T13:40:00Z', user: '—', action: 'send_review' }
        ]
      },
    ];
    return seed;
  });

  useEffect(() => {
    try {
      localStorage.setItem('calibrationFiles_v3', JSON.stringify(files));
    } catch (err) {
      console.error(err);
      toast.error('Error guardando cambios');
    }
  }, [files]);

  /* ── Controles UI globales ────────────────────────────────────────────── */
  const [selectedMagnitude, setSelectedMagnitude] = useState('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'modified' | 'downloads' | 'rating' | 'name'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | WorkflowStatus>('all');

  /* ── Subida & edición ─────────────────────────────────────────────────── */
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadForm, setUploadForm] = useState({
    fileName: '',
    magnitude: 'Dimensional',
    version: 'v1.0',
    description: '',
    priority: 'medium' as CalibrationFile['priority'],
    certification: 'ISO/IEC 17025:2017',
    expiryDate: '',
    tags: [] as string[],
  });

  /* ── Preview / Historial / Rechazo / Edición ──────────────────────────── */
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFileData, setPreviewFileData] = useState<string[][] | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');

  const [historyFor, setHistoryFor] = useState<CalibrationFile | null>(null);

  const [rejectFor, setRejectFor] = useState<CalibrationFile | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const [editFor, setEditFor] = useState<CalibrationFile | null>(null);
  const [editData, setEditData] = useState<{version: string; description: string; certification: string; tags: string}>({
    version: '',
    description: '',
    certification: '',
    tags: ''
  });

  /* ── Filtros y ordenamiento ───────────────────────────────────────────── */
  const filteredFiles = files.filter(f => {
    const mag = selectedMagnitude === 'Todas' || f.magnitude === selectedMagnitude;
    const st = selectedStatusFilter === 'all' || f.status === selectedStatusFilter;
    const q = (f.name + ' ' + (f.description || '') + ' ' + f.uploadedBy + ' ' + (f.tags || []).join(' '))
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return mag && st && q;
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'date': cmp = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime(); break;
      case 'modified': cmp = new Date(a.lastModifiedDate).getTime() - new Date(b.lastModifiedDate).getTime(); break;
      case 'downloads': cmp = a.downloads - b.downloads; break;
      case 'rating': cmp = a.rating - b.rating; break;
      case 'priority': {
        const order = { critical: 4, high: 3, medium: 2, low: 1 } as const;
        cmp = order[a.priority] - order[b.priority];
        break;
      }
      default: cmp = 0;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  /* ── Acciones archivos ────────────────────────────────────────────────── */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.includes('spreadsheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      setSelectedFile(file);
      setUploadForm(prev => ({ ...prev, fileName: file.name.replace(/\.[^/.]+$/, '') }));
      toast.success(`Archivo "${file.name}" seleccionado`);
    } else {
      toast.error('Formato no compatible (usa .xlsx o .xls)');
      setSelectedFile(null);
    }
  };

  const handleUploadSubmit = useCallback(() => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!currentUser.permissions.includes('upload')) return toast.error('No tienes permiso para subir');
    if (!selectedFile) return toast.error('Selecciona un archivo');
    if (!uploadForm.fileName.trim()) return toast.error('El nombre de archivo es obligatorio');

    setIsUploading(true);
    setUploadProgress(0);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const arrayBuffer = ev.target?.result as ArrayBuffer;
      let progress = 0;
      const it = setInterval(() => {
        progress += Math.random() * 18 + 6;
        setUploadProgress(Math.min(progress, 100));
        if (progress >= 100) {
          clearInterval(it);
          setIsUploading(false);

          const newFile: CalibrationFile = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            name: uploadForm.fileName + (/\.(xlsx|xls)$/i.test(uploadForm.fileName) ? '' : '.xlsx'),
            magnitude: uploadForm.magnitude,
            uploadDate: nowISO(),
            uploadedBy: currentUser.name,
            size: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
            version: uploadForm.version,
            status: 'uploaded',
            fileContent: arrayBuffer,
            lastModifiedDate: nowISO(),
            description: uploadForm.description,
            priority: uploadForm.priority,
            certification: uploadForm.certification,
            expiryDate: uploadForm.expiryDate || undefined,
            downloads: 0,
            rating: 5.0,
            tags: uploadForm.tags,
            history: [
              { ts: nowISO(), user: currentUser.name, action: 'upload' }
            ]
          };

          setFiles(prev => [newFile, ...prev]);
          setShowUploadModal(false);
          setSelectedFile(null);
          setUploadForm({
            fileName: '',
            magnitude: 'Dimensional',
            version: 'v1.0',
            description: '',
            priority: 'medium',
            certification: 'ISO/IEC 17025:2017',
            expiryDate: '',
            tags: []
          });

          toast.success('Formato subido');
        }
      }, 80);
    };
    reader.onerror = () => {
      setIsUploading(false);
      setShowUploadModal(false);
      toast.error('Error leyendo el archivo');
    };
    reader.readAsArrayBuffer(selectedFile);
  }, [selectedFile, uploadForm, currentUser]);

  const handleDownload = (file: CalibrationFile) => {
    if (!file.fileContent) return toast.error('Sin contenido para descargar');
    const blob = new Blob([file.fileContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, downloads: f.downloads + 1 } : f));
    toast.success(`Descargando "${file.name}"`);
  };

  const handleDelete = (file: CalibrationFile) => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!(currentUser.role === 'admin' || currentUser.role === 'supervisor')) return toast.error('No tienes permiso');
    setFiles(prev => prev.filter(f => f.id !== file.id));
    toast.success(`"${file.name}" eliminado`);
  };

  /* ── Workflow ─────────────────────────────────────────────────────────── */
  const pushHistory = (f: CalibrationFile, action: HistoryEvent['action'], userName: string, comment?: string): CalibrationFile =>
    ({ ...f, history: [...(f.history || []), { ts: nowISO(), user: userName, action, comment }] });

  const updateFileStatus = (file: CalibrationFile, status: WorkflowStatus, extra?: Partial<CalibrationFile>) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== file.id) return f;
      return {
        ...f,
        status,
        lastModifiedDate: nowISO(),
        ...extra
      };
    }));
  };

  // Enviar a revisión (metrólogo/admin/supervisor)
  const sendToReview = (file: CalibrationFile) => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!['technician','admin','supervisor'].includes(currentUser.role)) return toast.error('No tienes permiso');
    const withHistory = pushHistory(file, 'send_review', currentUser.name);
    updateFileStatus(withHistory, 'review');
    toast.success('Enviado a revisión');
  };

  // Aprobar (calidad/admin/supervisor)
  const approve = (file: CalibrationFile) => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!['quality','admin','supervisor'].includes(currentUser.role)) return toast.error('No tienes permiso');
    const withHistory = pushHistory(file, 'approve', currentUser.name);
    updateFileStatus(withHistory, 'review', { reviewer: currentUser.name });
    toast.success('Aprobado (pendiente publicar)');
  };

  // Publicar (calidad/admin/supervisor)
  const publish = (file: CalibrationFile) => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!['quality','admin','supervisor'].includes(currentUser.role)) return toast.error('No tienes permiso');
    const withHistory = pushHistory(file, 'publish', currentUser.name);
    updateFileStatus(withHistory, 'published', { reviewer: currentUser.name });
    toast.success('Publicado');
  };

  // Rechazar (calidad/admin/supervisor)
  const reject = (file: CalibrationFile, comment: string) => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!['quality','admin','supervisor'].includes(currentUser.role)) return toast.error('No tienes permiso');
    const withHistory = pushHistory(file, 'reject', currentUser.name, comment);
    updateFileStatus(withHistory, 'rejected', { reviewer: currentUser.name, rejectComment: comment });
    toast.success('Rechazado');
  };

  // Archivar (admin/supervisor)
  const archiveFile = (file: CalibrationFile) => {
    if (!currentUser) return toast.error('Inicia sesión');
    if (!['admin','supervisor'].includes(currentUser.role)) return toast.error('No tienes permiso');
    const withHistory = pushHistory(file, 'archive', currentUser.name);
    updateFileStatus(withHistory, 'archived');
    toast.success('Archivado');
  };

  /* ── Vista previa XLSX ────────────────────────────────────────────────── */
  const handlePreview = (file: CalibrationFile) => {
    if (!file.fileContent) return toast.error('Sin datos para vista previa');
    try {
      const wb = XLSX.read(file.fileContent, { type: 'array' });
      const sheet = wb.SheetNames[0];
      const ws = wb.Sheets[sheet];
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      setPreviewFileData(data);
      setPreviewFileName(file.name);
      setShowPreviewModal(true);
    } catch (e) {
      toast.error('No se pudo generar la vista previa');
    }
  };

  /* ── Estadísticas ─────────────────────────────────────────────────────── */
  const stats = {
    total: files.length,
    published: files.filter(f => f.status === 'published').length,
    review: files.filter(f => f.status === 'review').length,
    uploaded: files.filter(f => f.status === 'uploaded').length,
    rejected: files.filter(f => f.status === 'rejected').length,
    totalDownloads: files.reduce((s, f) => s + f.downloads, 0),
    avgRating: files.length ? (files.reduce((s, f) => s + f.rating, 0) / files.length).toFixed(1) : '0'
  };

  /* ── Stepper de flujo ─────────────────────────────────────────────────── */
  const Stepper: React.FC<{ status: WorkflowStatus }> = ({ status }) => {
    const step = statusConfig[status].step;
    const pct = step === 1 ? 20 : step === 2 ? 60 : 100;
    return (
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Subido</span>
          <span>Revisión</span>
          <span>{status === 'archived' ? 'Archivado' : 'Publicado'}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-amber-400 to-green-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-gray-600">Cargando usuario…</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <div className="text-gray-700 font-semibold">Inicia sesión para gestionar formatos</div>
        </div>
      </div>
    );
  }

  /* ── Render principal ─────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { borderRadius: 12 } }} />

      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 rounded-3xl opacity-90" />
          <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-white/20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Activity className="w-7 h-7 md:w-8 md:h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-black text-white">
                    Gestor de Formatos Oficiales
                  </h1>
                  <p className="text-blue-100">Flujo: Metrólogo → Calidad → Publicado</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-white/80 text-sm text-right">
                  <div className="font-semibold">{currentUser.name}</div>
                  <div className="opacity-80 capitalize">{currentUser.role} • {currentUser.department}</div>
                </div>
                {currentUser.permissions.includes('upload') && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-4 md:px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg"
                  >
                    <Plus className="w-5 h-5" /> Subir formato
                  </button>
                )}
                <button className="bg-white/15 hover:bg-white/25 text-white p-3 rounded-xl border border-white/20">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6 mb-8">
          <StatCard icon={<Database className="w-6 h-6 text-white" />} label="Total" value={stats.total} className="from-blue-500 to-indigo-600" />
          <StatCard icon={<Clock className="w-6 h-6 text-white" />} label="Subidos" value={stats.uploaded} className="from-sky-500 to-blue-600" />
          <StatCard icon={<Eye className="w-6 h-6 text-white" />} label="En revisión" value={stats.review} className="from-amber-500 to-orange-600" />
          <StatCard icon={<Check className="w-6 h-6 text-white" />} label="Publicado" value={stats.published} className="from-green-500 to-emerald-600" />
          <StatCard icon={<MessageSquareWarning className="w-6 h-6 text-white" />} label="Rechazados" value={stats.rejected} className="from-rose-500 to-red-600" />
          <StatCard icon={<TrendingUp className="w-6 h-6 text-white" />} label="Descargas" value={stats.totalDownloads} className="from-purple-500 to-indigo-600" />
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 md:p-8 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Búsqueda */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Búsqueda</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nombre, descripción, tags, usuario…"
                  className="w-full pl-12 pr-10 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Magnitud & Estado */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Magnitud</label>
                <select
                  value={selectedMagnitude}
                  onChange={(e) => setSelectedMagnitude(e.target.value)}
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                >
                  {magnitudes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                >
                  <option value="all">Todos</option>
                  <option value="uploaded">Subido</option>
                  <option value="review">En revisión</option>
                  <option value="published">Publicado</option>
                  <option value="rejected">Rechazado</option>
                  <option value="archived">Archivado</option>
                </select>
              </div>
            </div>

            {/* Orden & Vista */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ordenar</label>
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => { const [f, o] = e.target.value.split('-') as any; setSortBy(f); setSortOrder(o); }}
                  className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
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
                    onClick={() => setViewMode('cards')}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${viewMode === 'cards' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-200'}`}
                  >
                    Tarjetas
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${viewMode === 'table' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-200'}`}
                  >
                    Tabla
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {sortedFiles.length === 0 ? (
            <EmptyState onUpload={() => setShowUploadModal(true)} canUpload={currentUser.permissions.includes('upload')} />
          ) : viewMode === 'cards' ? (
            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                {sortedFiles.map(file => {
                  const priority = priorityConfig[file.priority];
                  const status = statusConfig[file.status];

                  return (
                    <div key={file.id} className="group bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-xl transition-all">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 truncate pr-2" title={file.name}>{file.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100">{file.magnitude}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-green-50 text-green-700">v{file.version.replace(/^v/i,'')}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-50">{file.size || '—'}</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.badge}`}>
                          <span className={`w-2 h-2 rounded-full mr-1.5 ${status.dot}`} />
                          {status.label}
                        </span>
                      </div>

                      {/* Descripción */}
                      <p className="text-sm text-gray-600 mb-4 line-clamp-3" title={file.description}>{file.description || 'Sin descripción.'}</p>

                      {/* Stepper */}
                      <div className="mb-4">
                        <Stepper status={file.status} />
                      </div>

                      {/* Tags */}
                      {file.tags?.length ? (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {file.tags.slice(0, 3).map((t, i) => (
                            <span key={i} className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700">#{t}</span>
                          ))}
                          {file.tags.length > 3 && <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">+{file.tags.length - 3}</span>}
                        </div>
                      ) : null}

                      {/* Metadata */}
                      <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-4">
                        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> {fmtDate(file.uploadDate)}</div>
                        <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> {file.uploadedBy || '—'}</div>
                        <div className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /> {file.rating.toFixed(1)}</div>
                        <div className="flex items-center gap-2"><Download className="w-4 h-4 text-blue-400" /> {file.downloads}</div>
                      </div>

                      {/* Barra prioridad (sutil) */}
                      <div className="w-full h-1.5 rounded-full bg-gray-100 mb-4">
                        <div className={`h-1.5 rounded-full ${priority.bar}`} style={{ width: '100%' }} />
                      </div>

                      {/* Acciones */}
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          <ActionIcon title="Vista previa" onClick={() => handlePreview(file)}><Eye className="w-5 h-5" /></ActionIcon>
                          <ActionIcon title="Descargar" onClick={() => handleDownload(file)}><Download className="w-5 h-5" /></ActionIcon>
                          {(currentUser.role === 'admin' || currentUser.role === 'supervisor') && (
                            <ActionIcon title="Editar metadatos" onClick={() => {
                              setEditFor(file);
                              setEditData({
                                version: file.version,
                                description: file.description || '',
                                certification: file.certification,
                                tags: (file.tags || []).join(', ')
                              });
                            }}>
                              <Edit3 className="w-5 h-5" />
                            </ActionIcon>
                          )}
                          {(currentUser.role === 'admin' || currentUser.role === 'supervisor') && (
                            <ActionIcon title="Eliminar" onClick={() => handleDelete(file)}><Trash2 className="w-5 h-5" /></ActionIcon>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {file.status === 'uploaded' && ['technician','admin','supervisor'].includes(currentUser.role) && (
                            <PrimaryBtn onClick={() => sendToReview(file)} icon={<Send className="w-4 h-4" />}>Enviar a revisión</PrimaryBtn>
                          )}

                          {file.status === 'review' && ['quality','admin','supervisor'].includes(currentUser.role) && (
                            <>
                              <GhostBtn onClick={() => approve(file)} icon={<FileCheck2 className="w-4 h-4" />}>Aprobar</GhostBtn>
                              <GhostBtn onClick={() => { setRejectFor(file); setRejectComment(''); }} icon={<FileX2 className="w-4 h-4" />}>Rechazar</GhostBtn>
                              <PrimaryBtn onClick={() => publish(file)} icon={<Check className="w-4 h-4" />}>Publicar</PrimaryBtn>
                            </>
                          )}

                          {file.status === 'published' && ['admin','supervisor'].includes(currentUser.role) && (
                            <GhostBtn onClick={() => archiveFile(file)} icon={<Archive className="w-4 h-4" />}>Archivar</GhostBtn>
                          )}

                          <GhostBtn onClick={() => setHistoryFor(file)} icon={<History className="w-4 h-4" />}>Historial</GhostBtn>
                        </div>
                      </div>

                      {file.status === 'rejected' && file.rejectComment && (
                        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                          <div className="font-semibold mb-1">Motivo de rechazo</div>
                          <div>{file.rejectComment}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Tabla
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Archivo</Th>
                    <Th>Magnitud</Th>
                    <Th>Estado</Th>
                    <Th>Subido por</Th>
                    <Th>Fecha</Th>
                    <Th>Rating</Th>
                    <Th>Descargas</Th>
                    <Th className="text-center">Acciones</Th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sortedFiles.map((file, idx) => (
                    <tr key={file.id} className={idx % 2 ? 'bg-gray-50/50' : ''}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                            <FileSpreadsheet className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate" title={file.name}>{file.name}</div>
                            <div className="text-xs text-gray-500 truncate">{file.description || '—'}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-md text-xs">v{file.version.replace(/^v/i,'')}</span>
                              <span className="text-xs text-gray-500">{file.size || '—'}</span>
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td><span className="inline-flex items-center px-3 py-1 rounded-lg text-sm bg-blue-50 text-blue-700">{file.magnitude}</span></Td>
                      <Td>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusConfig[file.status].badge}`}>
                          <span className={`w-2 h-2 rounded-full mr-1.5 ${statusConfig[file.status].dot}`} />
                          {statusConfig[file.status].label}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-sm text-gray-900">{file.uploadedBy || '—'}</div>
                        <div className="text-xs text-gray-500">{file.reviewer ? `Rev: ${file.reviewer}` : ''}</div>
                      </Td>
                      <Td>
                        <div className="text-sm text-gray-900">{fmtDate(file.uploadDate)}</div>
                        <div className="text-xs text-gray-500">Mod: {new Date(file.lastModifiedDate).toLocaleDateString('es-MX', { day:'2-digit', month:'short' })}</div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-400" />
                          <span className="text-sm font-semibold">{file.rating.toFixed(1)}</span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-semibold">{file.downloads}</span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex justify-center flex-wrap gap-2">
                          <ActionIcon title="Vista previa" onClick={() => handlePreview(file)}><Eye className="w-4 h-4" /></ActionIcon>
                          <ActionIcon title="Descargar" onClick={() => handleDownload(file)}><Download className="w-4 h-4" /></ActionIcon>

                          {file.status === 'uploaded' && ['technician','admin','supervisor'].includes(currentUser.role) && (
                            <GhostBtn onClick={() => sendToReview(file)} icon={<Send className="w-4 h-4" />}>Enviar</GhostBtn>
                          )}

                          {file.status === 'review' && ['quality','admin','supervisor'].includes(currentUser.role) && (
                            <>
                              <GhostBtn onClick={() => approve(file)} icon={<FileCheck2 className="w-4 h-4" />}>Aprobar</GhostBtn>
                              <GhostBtn onClick={() => { setRejectFor(file); setRejectComment(''); }} icon={<FileX2 className="w-4 h-4" />}>Rechazar</GhostBtn>
                              <PrimaryBtn onClick={() => publish(file)} icon={<Check className="w-4 h-4" />}>Publicar</PrimaryBtn>
                            </>
                          )}

                          {file.status === 'published' && ['admin','supervisor'].includes(currentUser.role) && (
                            <GhostBtn onClick={() => archiveFile(file)} icon={<Archive className="w-4 h-4" />}>Archivar</GhostBtn>
                          )}

                          {(currentUser.role === 'admin' || currentUser.role === 'supervisor') && (
                            <ActionIcon title="Editar metadatos" onClick={() => {
                              setEditFor(file);
                              setEditData({
                                version: file.version,
                                description: file.description || '',
                                certification: file.certification,
                                tags: (file.tags || []).join(', ')
                              });
                            }}>
                              <Edit3 className="w-4 h-4" />
                            </ActionIcon>
                          )}

                          {(currentUser.role === 'admin' || currentUser.role === 'supervisor') && (
                            <ActionIcon title="Eliminar" onClick={() => handleDelete(file)}><Trash2 className="w-4 h-4" /></ActionIcon>
                          )}

                          <GhostBtn onClick={() => setHistoryFor(file)} icon={<History className="w-4 h-4" />}>Historial</GhostBtn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Subida */}
        <Transition appear show={showUploadModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowUploadModal(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 md:p-8 text-left shadow-2xl">
                    {isUploading ? (
                      <div className="text-center py-10">
                        <div className="relative w-24 h-24 mx-auto mb-6">
                          <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
                            <Upload className="w-12 h-12 text-white" />
                          </div>
                          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                        </div>
                        <h3 className="text-xl font-bold mb-3">Procesando archivo…</h3>
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-gray-600">{uploadProgress.toFixed(0)}% completado</p>
                        <p className="text-sm text-gray-500 mt-1">Usuario: {currentUser.name}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <Dialog.Title className="text-2xl font-bold">Subir nuevo formato</Dialog.Title>
                            <p className="text-gray-600">Añade el archivo oficial para la magnitud correspondiente.</p>
                          </div>
                          <button onClick={() => setShowUploadModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl">
                            <X className="w-6 h-6" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Dropzone */}
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Archivo <span className="text-red-500">*</span></label>
                            <div
                              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition cursor-pointer bg-gray-50"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                              {selectedFile ? (
                                <div className="space-y-2">
                                  <div className="w-14 h-14 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto"><Check className="w-8 h-8 text-white" /></div>
                                  <div className="font-semibold text-emerald-700">{selectedFile.name}</div>
                                  <div className="text-xs text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</div>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setUploadForm(prev => ({ ...prev, fileName: '' })); }} className="text-red-500 hover:text-red-700 text-sm font-medium mt-1">
                                    Cambiar archivo
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto">
                                    <Upload className="w-8 h-8 text-white" />
                                  </div>
                                  <div className="font-semibold">Arrastra o selecciona tu archivo</div>
                                  <div className="text-xs text-gray-500">.xlsx, .xls • Máx. 10 MB</div>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
                              <div className="font-semibold text-blue-800">{currentUser.name}</div>
                              <div className="text-blue-700/80 text-xs capitalize">{currentUser.role} • {currentUser.department}</div>
                            </div>
                          </div>

                          {/* Metadatos */}
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del formato <span className="text-red-500">*</span></label>
                              <input
                                value={uploadForm.fileName}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, fileName: e.target.value }))}
                                placeholder="Ej: Formato_Calibracion_Vernier_2025"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Magnitud</label>
                                <select
                                  value={uploadForm.magnitude}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, magnitude: e.target.value }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                                >
                                  {magnitudes.slice(1).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Prioridad</label>
                                <select
                                  value={uploadForm.priority}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                                >
                                  <option value="low">Baja</option>
                                  <option value="medium">Media</option>
                                  <option value="high">Alta</option>
                                  <option value="critical">Crítica</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Versión</label>
                                <input
                                  value={uploadForm.version}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, version: e.target.value }))}
                                  placeholder="v1.0"
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Certificación</label>
                                <select
                                  value={uploadForm.certification}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, certification: e.target.value }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                                >
                                  <option value="ISO/IEC 17025:2017">ISO/IEC 17025:2017</option>
                                  <option value="ISO 9001:2015">ISO 9001:2015</option>
                                  <option value="NIST Traceable">NIST Traceable</option>
                                  <option value="CENAM">CENAM</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                              <textarea
                                value={uploadForm.description}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                                rows={4}
                                placeholder="Describe el objetivo, contenido y uso del formato…"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium resize-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                          <button onClick={() => setShowUploadModal(false)} className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">
                            Cancelar
                          </button>
                          <button
                            onClick={handleUploadSubmit}
                            disabled={!selectedFile || !uploadForm.fileName.trim() || !currentUser.permissions.includes('upload')}
                            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <Upload className="w-5 h-5" /> Subir
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

        {/* Modal Vista previa */}
        <Transition appear show={showPreviewModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowPreviewModal(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex items-center justify-between">
                      <div>
                        <Dialog.Title className="text-xl font-bold">Vista previa</Dialog.Title>
                        <p className="text-blue-100">{previewFileName}</p>
                      </div>
                      <button onClick={() => setShowPreviewModal(false)} className="p-2 text-blue-100 hover:text-white hover:bg-white/20 rounded-xl">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="p-5 max-h-[70vh] overflow-auto">
                      {previewFileData && previewFileData.length ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                {previewFileData[0].map((h, i) => (
                                  <th key={i} className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {previewFileData.slice(1, 101).map((row, ri) => (
                                <tr key={ri} className={ri % 2 ? 'bg-gray-50/50' : ''}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100 last:border-r-0">{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {previewFileData.length > 101 && (
                            <div className="bg-yellow-50 border-t border-yellow-200 p-3 text-center text-yellow-800 text-sm">Mostrando primeras 100 filas de {previewFileData.length - 1}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-gray-600">No hay datos disponibles</p>
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-50 px-5 py-4 flex justify-end">
                      <button onClick={() => setShowPreviewModal(false)} className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg">Cerrar</button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Historial */}
        <Transition appear show={!!historyFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setHistoryFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <Dialog.Title className="text-xl font-bold">Historial</Dialog.Title>
                      <button onClick={() => setHistoryFor(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      {historyFor?.history?.length ? historyFor.history.map((h, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                          <div>
                            <div className="text-sm"><span className="font-semibold">{h.user}</span> — <span className="capitalize">{h.action.replace('_',' ')}</span></div>
                            <div className="text-xs text-gray-500">{fmtDate(h.ts)} {new Date(h.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
                            {h.comment && <div className="mt-1 text-sm text-gray-700">Comentario: {h.comment}</div>}
                          </div>
                        </div>
                      )) : <div className="text-gray-600">Sin eventos registrados.</div>}
                    </div>
                    <div className="mt-6 flex justify-end">
                      <button onClick={() => setHistoryFor(null)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">Cerrar</button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Rechazo */}
        <Transition appear show={!!rejectFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setRejectFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <Dialog.Title className="text-xl font-bold">Rechazar formato</Dialog.Title>
                      <button onClick={() => setRejectFor(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X className="w-6 h-6" /></button>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">Agrega un comentario para el metrólogo (motivo y correcciones).</p>
                    <textarea
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500"
                      placeholder="Ej: Falta anexar evidencia fotográfica y traza de patrón…"
                    />
                    <div className="mt-5 flex justify-end gap-3">
                      <button onClick={() => setRejectFor(null)} className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">Cancelar</button>
                      <button
                        onClick={() => { if (rejectFor) { reject(rejectFor, rejectComment || ''); setRejectFor(null); } }}
                        className="px-8 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-60"
                        disabled={!rejectFor}
                      >
                        Rechazar
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Edición metadatos */}
        <Transition appear show={!!editFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setEditFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <Dialog.Title className="text-xl font-bold">Editar metadatos</Dialog.Title>
                      <button onClick={() => setEditFor(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Versión</label>
                        <input
                          value={editData.version}
                          onChange={(e) => setEditData(prev => ({ ...prev, version: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Certificación</label>
                        <input
                          value={editData.certification}
                          onChange={(e) => setEditData(prev => ({ ...prev, certification: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                        <textarea
                          value={editData.description}
                          onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                          rows={4}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tags (separados por coma)</label>
                        <input
                          value={editData.tags}
                          onChange={(e) => setEditData(prev => ({ ...prev, tags: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end gap-3">
                      <button onClick={() => setEditFor(null)} className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">Cancelar</button>
                      <button
                        onClick={() => {
                          if (!editFor) return;
                          setFiles(prev => prev.map(f => f.id === editFor.id ? {
                            ...f,
                            version: editData.version || f.version,
                            certification: editData.certification || f.certification,
                            description: editData.description ?? f.description,
                            tags: editData.tags ? editData.tags.split(',').map(s => s.trim()).filter(Boolean) : f.tags,
                            lastModifiedDate: nowISO(),
                            history: [...(f.history||[]), { ts: nowISO(), user: currentUser.name, action: 'edit_meta' }]
                          } : f));
                          setEditFor(null);
                          toast.success('Metadatos actualizados');
                        }}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg"
                      >
                        Guardar cambios
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

/* ────────────────────────────────────────────────────────────────────────────
   Subcomponentes
──────────────────────────────────────────────────────────────────────────── */
const StatCard: React.FC<{ icon: React.ReactNode; label: string | React.ReactNode; value: string | number; className?: string; }> = ({ icon, label, value, className }) => (
  <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 hover:shadow-xl transition">
    <div className="flex items-center justify-between mb-3">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-r ${className || 'from-blue-500 to-indigo-600'} flex items-center justify-center`}>
        {icon}
      </div>
      <span className="text-2xl font-black text-gray-800">{value}</span>
    </div>
    <p className="text-gray-600 font-medium">{label}</p>
  </div>
);

const EmptyState: React.FC<{ onUpload: () => void; canUpload: boolean }> = ({ onUpload, canUpload }) => (
  <div className="text-center py-24">
    <div className="w-28 h-28 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-6">
      <FolderOpen className="w-14 h-14 text-gray-400" />
    </div>
    <h3 className="text-2xl font-bold text-gray-900 mb-2">No hay formatos</h3>
    <p className="text-gray-500 mb-6">Comienza subiendo tu primer formato oficial.</p>
    {canUpload && (
      <button onClick={onUpload} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg">
        <Plus className="w-5 h-5 inline mr-2" />
        Subir formato
      </button>
    )}
  </div>
);

const Th: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <th className={`text-left py-4 px-5 font-bold text-gray-800 text-sm uppercase tracking-wide ${className || ''}`}>{children}</th>
);
const Td: React.FC<React.PropsWithChildren> = ({ children }) => (
  <td className="py-5 px-5 align-top">{children}</td>
);

const ActionIcon: React.FC<React.PropsWithChildren<{ title?: string; onClick?: () => void }>> = ({ children, title, onClick }) => (
  <button title={title} onClick={onClick} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
    {children}
  </button>
);

const PrimaryBtn: React.FC<React.PropsWithChildren<{ onClick?: () => void; icon?: React.ReactNode }>> = ({ children, onClick, icon }) => (
  <button onClick={onClick} className="px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5">
    {icon}{children}
  </button>
);
const GhostBtn: React.FC<React.PropsWithChildren<{ onClick?: () => void; icon?: React.ReactNode }>> = ({ children, onClick, icon }) => (
  <button onClick={onClick} className="px-3 md:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-semibold flex items-center gap-1.5">
    {icon}{children}
  </button>
);

export default CalibrationManager;
