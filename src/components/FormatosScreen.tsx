import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useAppDialog } from '../hooks/useAppDialog';
import { db, storage } from '../utils/firebase';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject, getBlob,
} from 'firebase/storage';
import {
  Folder, FileText, UploadCloud, Trash2, Download,
  ArrowLeft, Loader2, Search, Edit3, Lock,
  Info, History, CheckCircle2, AlertTriangle, X, Home, ChevronRight, ChevronDown,
  Ruler, Zap, Wrench, Gauge, Thermometer, Scale, FlaskConical,
  ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, FileSpreadsheet, FileType,
  RefreshCw, Eye, CircleDot,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  validateMasterFile, buildValidationSummary,
  type MasterValidationReport, type CheckResult,
} from '../utils/masterFormatValidation';

// --- CONFIGURACIÓN DE CATEGORÍAS ---
const CATEGORIAS = [
  { id: 'dimensional', nombre: 'Dimensional', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Ruler },
  { id: 'electrica', nombre: 'Eléctrica', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Zap },
  { id: 'mecanica', nombre: 'Mecánica', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: Wrench },
  { id: 'presion', nombre: 'Presión', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', icon: Gauge },
  { id: 'temperatura', nombre: 'Temperatura', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: Thermometer },
  { id: 'masa', nombre: 'Masa', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: Scale },
  { id: 'volumen', nombre: 'Volumen', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', icon: FlaskConical },
  { id: 'general', nombre: 'General / Otros', color: 'text-slate-300', bg: 'bg-slate-800/50', border: 'border-slate-700/50', icon: FileText },
];

interface VersionHistorial {
  version: string;
  nombre: string;
  url: string;
  refPath: string;
  fecha: string; // ISO
  subidoPor: string;
  notas?: string;
}

interface ValidacionResumen {
  estado: 'pass' | 'warn' | 'fail';
  fecha: string; // ISO
  patronesDetectados: string[];
  detalles: string[];
  override?: boolean;
}

interface Formato {
  id: string;
  nombre: string;
  categoria: string;
  url: string;
  refPath: string;
  fechaSubida: Timestamp | null;
  subidoPor: string;
  size: number;
  version: string;
  notas: string;
  estado: 'activo' | 'revision';
  ultimaModificacion?: Timestamp | null;
  modificadoPor?: string;
  validacion?: ValidacionResumen;
  historialVersiones?: VersionHistorial[];
}

// --- HELPERS ---
const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (nombre: string) => {
  const n = nombre.toLowerCase();
  if (/\.(xlsx|xlsm|xls|xlsb)$/.test(n)) return { Icon: FileSpreadsheet, color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (/\.pdf$/.test(n)) return { Icon: FileType, color: 'text-rose-400', bg: 'bg-rose-500/10' };
  return { Icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' };
};

const getFileExtension = (nombre: string): string => {
  const match = nombre.match(/(\.[a-z0-9]+)$/i);
  return match?.[1].toLowerCase() || '';
};

const buildDownloadName = (
  categoria: string,
  version: string,
  originalName: string,
  year: number,
): string => {
  const categoryName = CATEGORIAS.find(c => c.id === categoria)?.nombre || categoria;
  const safeCategory = categoryName.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
  const safeVersion = (version || '1.0').replace(/^v/i, '').replace(/[<>:"/\\|?*]/g, '');
  return `Formato ${safeCategory} ${year} v${safeVersion}${getFileExtension(originalName)}`;
};

/** Sugiere la siguiente versión: "1.0" -> "1.1", "2" -> "3". */
const suggestNextVersion = (current: string): string => {
  const m = (current || '').trim().match(/^(.*?)(\d+)$/);
  if (!m) return current || '1.0';
  return `${m[1]}${parseInt(m[2], 10) + 1}`;
};

const CHECK_STYLES: Record<CheckResult['status'], { icon: React.ReactNode; text: string }> = {
  pass: { icon: <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />, text: 'text-slate-300' },
  warn: { icon: <AlertTriangle size={15} className="text-amber-400 shrink-0" />, text: 'text-amber-200' },
  fail: { icon: <X size={15} className="text-red-400 shrink-0" />, text: 'text-red-300' },
  info: { icon: <Info size={15} className="text-slate-500 shrink-0" />, text: 'text-slate-400' },
};

// --- BADGE DE VALIDACIÓN ---
const ValidationBadge: React.FC<{ validacion?: ValidacionResumen; compact?: boolean }> = ({ validacion, compact }) => {
  if (!validacion) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800/60 text-slate-500 border border-slate-700/50" title="Subido sin verificación automática">
        <ShieldQuestion size={11} /> {!compact && 'Sin verificar'}
      </span>
    );
  }
  const cfg = {
    pass: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25', Icon: ShieldCheck, label: 'Verificado' },
    warn: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25', Icon: ShieldAlert, label: 'Con avisos' },
    fail: { cls: 'bg-red-500/10 text-red-400 border-red-500/25', Icon: ShieldX, label: 'Con fallas' },
  }[validacion.estado];
  const title = [
    `Verificación: ${cfg.label}${validacion.override ? ' (subido con excepción)' : ''}`,
    validacion.patronesDetectados.length ? `Patrones: ${validacion.patronesDetectados.join(', ')}` : '',
    ...validacion.detalles,
  ].filter(Boolean).join('\n');
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`} title={title}>
      <cfg.Icon size={11} /> {!compact && cfg.label}{validacion.override && '*'}
    </span>
  );
};

// --- CHECKLIST DE VALIDACIÓN (modal de subida) ---
const ValidationPanel: React.FC<{ report: MasterValidationReport | null; validating: boolean }> = ({ report, validating }) => {
  const [showPatrones, setShowPatrones] = useState(false);

  if (validating) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4 flex items-center gap-3">
        <Loader2 className="animate-spin text-blue-400" size={18} />
        <div>
          <p className="text-sm font-semibold text-slate-200">Verificando formato…</p>
          <p className="text-xs text-slate-500">Analizando el archivo y cruzando patrones contra el programa de calibración.</p>
        </div>
      </div>
    );
  }
  if (!report) return null;

  const headerCfg = {
    pass: { cls: 'border-emerald-500/30 bg-emerald-500/5', Icon: ShieldCheck, iconCls: 'text-emerald-400', title: 'Formato verificado', sub: 'Cumple con los checks automáticos.' },
    warn: { cls: 'border-amber-500/30 bg-amber-500/5', Icon: ShieldAlert, iconCls: 'text-amber-400', title: 'Verificado con avisos', sub: 'Revisa los avisos antes de publicar.' },
    fail: { cls: 'border-red-500/30 bg-red-500/5', Icon: ShieldX, iconCls: 'text-red-400', title: 'La verificación encontró fallas', sub: 'El formato no cumple; corrige antes de subir.' },
  }[report.overall];

  const patronesConProblema = report.patrones.filter(p => !p.existe || p.urgencia === 'vencido' || p.estadoCritico || p.certificadoEncontrado === false);

  return (
    <div className={`rounded-xl border ${headerCfg.cls} overflow-hidden`}>
      <div className="p-4 flex items-start gap-3 border-b border-white/5">
        <headerCfg.Icon size={22} className={`${headerCfg.iconCls} shrink-0 mt-0.5`} />
        <div>
          <p className="text-sm font-bold text-white">{headerCfg.title}</p>
          <p className="text-xs text-slate-400">{headerCfg.sub}</p>
        </div>
      </div>
      <ul className="p-4 space-y-2.5">
        {report.checks.map(check => (
          <li key={check.id} className="flex items-start gap-2.5">
            {CHECK_STYLES[check.status].icon}
            <div className="min-w-0">
              <span className={`text-xs font-semibold ${CHECK_STYLES[check.status].text}`}>{check.label}</span>
              {check.detail && <p className="text-[11px] text-slate-500 leading-snug">{check.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
      {report.patrones.length > 0 && (
        <div className="border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowPatrones(v => !v)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <span>Detalle de patrones ({report.patrones.length}{patronesConProblema.length ? ` · ${patronesConProblema.length} con observación` : ''})</span>
            <ChevronDown size={14} className={`transition-transform ${showPatrones ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showPatrones && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar">
                  {report.patrones.map(p => {
                    const problema = !p.existe
                      ? 'No registrado en el programa de calibración'
                      : p.urgencia === 'vencido'
                        ? `Calibración VENCIDA${p.fechaVencimiento ? ` (${p.fechaVencimiento})` : ''}`
                        : p.estadoCritico
                          ? `Estado: ${p.estadoProceso?.replace(/_/g, ' ')}`
                          : p.certificadoEncontrado === false
                            ? `Certificado vigente (${p.noCertificado}) no aparece en el archivo`
                            : p.urgencia === 'urgente7' || p.urgencia === 'proximo30'
                              ? `Vence pronto${p.fechaVencimiento ? ` (${p.fechaVencimiento})` : ''}`
                              : null;
                    return (
                      <div key={p.noControl} className="flex items-start gap-2 text-[11px] bg-slate-950/40 rounded-lg px-2.5 py-1.5 border border-slate-800/50">
                        <CircleDot size={11} className={`mt-0.5 shrink-0 ${problema ? (p.urgencia === 'vencido' || !p.existe ? 'text-red-400' : 'text-amber-400') : 'text-emerald-400'}`} />
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-slate-300">{p.noControl}</span>
                          {p.descripcion && <span className="text-slate-500"> — {p.descripcion}</span>}
                          {problema
                            ? <p className={p.urgencia === 'vencido' || !p.existe ? 'text-red-400' : 'text-amber-400'}>{problema}</p>
                            : <p className="text-emerald-500/80">Vigente{p.fechaVencimiento ? ` hasta ${p.fechaVencimiento}` : ''}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

// --- SCREEN PRINCIPAL ---
export const FormatosScreen: React.FC = () => {
  const { user } = useAuth();
  const { navigateTo } = useNavigation();
  const { confirm, alert: showAlert } = useAppDialog();

  const [categoriaActual, setCategoriaActual] = useState<string | null>(null);
  const [allFormatos, setAllFormatos] = useState<Formato[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [historialOpenId, setHistorialOpenId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Subida / edición
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Formato | null>(null);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formVersion, setFormVersion] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formEstado, setFormEstado] = useState<'activo' | 'revision'>('activo');
  const [dragOver, setDragOver] = useState(false);

  // Validación
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState<MasterValidationReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- PERMISOS ---
  // Calidad / admin / gerencia: gestión completa. Metrólogos y técnicos: solo descarga.
  const userRole = `${user?.puesto || ''} ${user?.role || ''}`.trim().toLowerCase();
  const esCalidad = /calidad|quality|admin|gerente|manager/.test(userRole);
  const userName = user?.name || user?.email || 'Usuario';

  // --- DATOS ---
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'formatos_master'), (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Formato));
      setAllFormatos(docs);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, []);

  const countsPorCategoria = useMemo(() => {
    const counts: Record<string, { total: number; revision: number }> = {};
    for (const f of allFormatos) {
      const c = counts[f.categoria] || { total: 0, revision: 0 };
      c.total++;
      if (f.estado === 'revision') c.revision++;
      counts[f.categoria] = c;
    }
    return counts;
  }, [allFormatos]);

  const formatosCategoria = useMemo(() => {
    if (!categoriaActual) return [];
    const term = searchTerm.toLowerCase();
    return allFormatos
      .filter(f => f.categoria === categoriaActual)
      .filter(f => !term || f.nombre.toLowerCase().includes(term) || f.notas?.toLowerCase().includes(term))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [allFormatos, categoriaActual, searchTerm]);

  const stats = useMemo(() => ({
    total: allFormatos.length,
    vigentes: allFormatos.filter(f => f.estado !== 'revision').length,
    revision: allFormatos.filter(f => f.estado === 'revision').length,
    verificados: allFormatos.filter(f => f.validacion?.estado === 'pass').length,
  }), [allFormatos]);

  // --- VALIDACIÓN DE ARCHIVO ---
  const runValidation = useCallback(async (file: File) => {
    setValidating(true);
    setReport(null);
    try {
      const result = await validateMasterFile(file);
      setReport(result);
    } catch {
      setReport({
        overall: 'warn',
        isExcel: false,
        checks: [{ id: 'error', label: 'Verificación automática', status: 'warn', detail: 'No se pudo completar la verificación. Revisa el archivo manualmente.' }],
        patrones: [],
        hojas: [],
      });
    } finally {
      setValidating(false);
    }
  }, []);

  const handleFileSelected = (file: File | null) => {
    setFormFile(file);
    setReport(null);
    if (file) void runValidation(file);
  };

  // --- HANDLERS ---
  const handleBack = () => {
    if (categoriaActual) {
      setCategoriaActual(null);
      setSearchTerm('');
    } else {
      navigateTo('menu');
    }
  };

  const resetForm = () => {
    setFormFile(null);
    setReport(null);
    setValidating(false);
    setDragOver(false);
  };

  const handleOpenUpload = () => {
    setEditingDoc(null);
    resetForm();
    setFormVersion('1.0');
    setFormNotas('Carga inicial del documento');
    setFormEstado('activo');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (docItem: Formato) => {
    setEditingDoc(docItem);
    resetForm();
    setFormVersion(docItem.version || '1.0');
    setFormNotas(docItem.notas || '');
    setFormEstado(docItem.estado || 'activo');
    setIsModalOpen(true);
  };

  const uploadFile = (file: File, categoria: string): Promise<{ url: string; refPath: string }> => {
    const refPath = `formatos_master/${categoria}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(storageRef(storage, refPath), file);
    return new Promise((resolve, reject) => {
      task.on('state_changed',
        (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
        reject,
        async () => {
          try {
            resolve({ url: await getDownloadURL(task.snapshot.ref), refPath });
          } catch (e) { reject(e); }
        },
      );
    });
  };

  /** Confirma según el resultado de la verificación. Devuelve { proceed, override }. */
  const confirmValidation = async (): Promise<{ proceed: boolean; override: boolean }> => {
    if (!formFile || !report) return { proceed: true, override: false };
    if (report.overall === 'fail') {
      const ok = await confirm({
        title: 'Verificación con fallas',
        message: 'El formato NO cumple la verificación automática (patrones vencidos o archivo inválido). ¿Deseas subirlo de todos modos bajo tu responsabilidad? Quedará marcado como "Con fallas".',
        variant: 'danger',
        confirmLabel: 'Subir con excepción',
      });
      return { proceed: ok, override: ok };
    }
    if (report.overall === 'warn') {
      const ok = await confirm({
        title: 'Verificación con avisos',
        message: 'La verificación encontró avisos (patrones por vencer, certificados no localizados u observaciones). ¿Continuar con la subida?',
        variant: 'warning',
        confirmLabel: 'Continuar',
      });
      return { proceed: ok, override: false };
    }
    return { proceed: true, override: false };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esCalidad || validating || uploadProgress !== null) return;

    try {
      // --- EDICIÓN (metadatos y/o nueva versión de archivo) ---
      if (editingDoc) {
        const updates: Record<string, unknown> = {
          version: formVersion,
          notas: formNotas,
          estado: formEstado,
          ultimaModificacion: serverTimestamp(),
          modificadoPor: userName,
        };

        if (formFile) {
          const { proceed, override } = await confirmValidation();
          if (!proceed) return;

          setUploadProgress(0);
          const { url, refPath } = await uploadFile(formFile, editingDoc.categoria);
          const entradaHistorial: VersionHistorial = {
            version: editingDoc.version || '1.0',
            nombre: editingDoc.nombre,
            url: editingDoc.url,
            refPath: editingDoc.refPath,
            fecha: editingDoc.ultimaModificacion?.toDate?.()?.toISOString?.() || editingDoc.fechaSubida?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            subidoPor: editingDoc.modificadoPor || editingDoc.subidoPor,
            notas: editingDoc.notas,
          };
          updates.nombre = formFile.name;
          updates.url = url;
          updates.refPath = refPath;
          updates.size = formFile.size;
          updates.historialVersiones = [entradaHistorial, ...(editingDoc.historialVersiones || [])].slice(0, 20);
          if (report) updates.validacion = { ...buildValidationSummary(report), ...(override ? { override: true } : {}) };
        }

        await updateDoc(doc(db, 'formatos_master', editingDoc.id), updates);
        setUploadProgress(null);
        setIsModalOpen(false);
        return;
      }

      // --- SUBIDA NUEVA ---
      if (!categoriaActual) return;
      if (!formFile) {
        await showAlert({ title: 'Aviso', message: 'Selecciona un archivo primero.' });
        return;
      }
      const { proceed, override } = await confirmValidation();
      if (!proceed) return;

      setUploadProgress(0);
      const { url, refPath } = await uploadFile(formFile, categoriaActual);
      await addDoc(collection(db, 'formatos_master'), {
        nombre: formFile.name,
        categoria: categoriaActual,
        url,
        refPath,
        fechaSubida: serverTimestamp(),
        subidoPor: userName,
        size: formFile.size,
        version: formVersion,
        notas: formNotas,
        estado: formEstado,
        ...(report ? { validacion: { ...buildValidationSummary(report), ...(override ? { override: true } : {}) } } : {}),
        historialVersiones: [],
      });
      setUploadProgress(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      setUploadProgress(null);
      await showAlert({ title: 'Error', message: 'Ocurrió un error al guardar el formato.', variant: 'danger' });
    }
  };

  const handleDownload = async (
    refPath: string,
    nombreOriginal: string,
    categoria: string,
    version: string,
    year: number,
    downloadId: string,
  ) => {
    if (downloadingId) return;
    setDownloadingId(downloadId);
    try {
      const blob = await getBlob(storageRef(storage, refPath));
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = buildDownloadName(categoria, version, nombreOriginal, year);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error(error);
      await showAlert({
        title: 'Error de descarga',
        message: 'No se pudo descargar el formato. Verifica tu conexión e inténtalo nuevamente.',
        variant: 'danger',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleEliminar = async (formato: Formato) => {
    if (!esCalidad) return;
    if (!(await confirm({ message: `¿Eliminar definitivamente "${formato.nombre}" y su historial?`, variant: 'danger', confirmLabel: 'Eliminar' }))) return;
    try {
      const paths = [formato.refPath, ...(formato.historialVersiones || []).map(h => h.refPath)].filter(Boolean);
      await Promise.all(paths.map(p => deleteObject(storageRef(storage, p)).catch(() => undefined)));
      await deleteDoc(doc(db, 'formatos_master', formato.id));
    } catch {
      await showAlert({ title: 'Error', message: 'Error al eliminar.', variant: 'danger' });
    }
  };

  const handleToggleEstado = async (formato: Formato) => {
    if (!esCalidad) return;
    const nuevo = formato.estado === 'revision' ? 'activo' : 'revision';
    try {
      await updateDoc(doc(db, 'formatos_master', formato.id), {
        estado: nuevo,
        ultimaModificacion: serverTimestamp(),
        modificadoPor: userName,
      });
    } catch {
      await showAlert({ title: 'Error', message: 'No se pudo cambiar el estado.', variant: 'danger' });
    }
  };

  const currentCategoryData = CATEGORIAS.find(c => c.id === categoriaActual);
  const submitDisabled = uploadProgress !== null || validating || (!editingDoc && !formFile);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-[#0B1120] text-slate-200 relative selection:bg-blue-500/30 overflow-hidden">

      {/* --- BACKGROUND --- */}
      <div className="absolute top-0 left-0 w-full h-96 bg-blue-900/10 rounded-full blur-[120px] -translate-y-1/2 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none mix-blend-overlay" />

      {/* --- HEADER --- */}
      <header className="z-10 bg-[#0B1120]/80 backdrop-blur-xl border-b border-slate-800/60 sticky top-0">
        <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 max-w-[1920px] mx-auto">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              onClick={handleBack}
              className="p-2.5 bg-slate-800/50 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700/50 group"
              title={categoriaActual ? 'Volver a Categorías' : 'Ir al Menú Principal'}
            >
              {categoriaActual ? <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> : <Home size={20} />}
            </button>

            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Formatos Master
                {categoriaActual && (
                  <>
                    <ChevronRight className="text-slate-600" size={16} />
                    <span className={currentCategoryData?.color || 'text-blue-400'}>{currentCategoryData?.nombre}</span>
                  </>
                )}
              </h1>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                {esCalidad ? (
                  <><ShieldCheck size={12} className="text-emerald-500" /> Gestión de documentos controlados</>
                ) : (
                  <><Eye size={12} /> Modo consulta — solo descarga</>
                )}
              </p>
            </div>
          </div>

          {categoriaActual ? (
            <div className="flex items-center gap-3 w-full md:w-auto animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar documento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700/60 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 outline-none transition-all placeholder:text-slate-600"
                />
              </div>
              {esCalidad && (
                <button
                  onClick={handleOpenUpload}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-900/20 hover:shadow-blue-600/30 transition-all active:scale-95 border border-blue-500/50"
                >
                  <UploadCloud size={18} />
                  <span className="hidden sm:inline">Subir Master</span>
                </button>
              )}
            </div>
          ) : (
            /* Stats globales en la vista de carpetas */
            !loading && (
              <div className="hidden md:flex items-center gap-2">
                {[
                  { label: 'Documentos', value: stats.total, cls: 'text-slate-300' },
                  { label: 'Vigentes', value: stats.vigentes, cls: 'text-emerald-400' },
                  { label: 'En revisión', value: stats.revision, cls: 'text-amber-400' },
                  { label: 'Verificados', value: stats.verificados, cls: 'text-blue-400' },
                ].map(s => (
                  <div key={s.label} className="px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-800/60 text-center min-w-[90px]">
                    <p className={`text-lg font-bold leading-none ${s.cls}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </header>

      {/* --- CONTENT --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-[1920px] mx-auto min-h-full">
          <AnimatePresence mode="wait">
            {!categoriaActual ? (
              /* VISTA DE CARPETAS */
              <motion.div
                key="folders"
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {CATEGORIAS.map((cat) => {
                  const count = countsPorCategoria[cat.id];
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoriaActual(cat.id)}
                      className="group relative flex flex-col items-start p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-600 hover:bg-slate-800/60 transition-all hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-1 overflow-hidden text-left"
                    >
                      <div className={`absolute top-0 right-0 p-20 ${cat.bg} opacity-[0.08] blur-2xl rounded-full translate-x-10 -translate-y-10 group-hover:opacity-[0.15] transition-opacity`} />

                      <div className="flex items-start justify-between w-full mb-4">
                        <div className={`p-3 rounded-xl ${cat.bg} ${cat.color} border border-white/5 ring-1 ring-white/10`}>
                          <cat.icon size={28} strokeWidth={1.5} />
                        </div>
                        {count && count.revision > 0 && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {count.revision} en revisión
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors z-10">{cat.nombre}</h3>
                      <p className="text-sm text-slate-500 mt-1 mb-4 z-10 group-hover:text-slate-400">
                        {loading ? '…' : `${count?.total || 0} formato${(count?.total || 0) === 1 ? '' : 's'} master`}
                      </p>

                      <div className="mt-auto w-full pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs font-medium text-slate-500 group-hover:text-blue-400 transition-colors">
                        <span>Explorar carpeta</span>
                        <ArrowLeft className="rotate-180 w-3.5 h-3.5" />
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            ) : (
              /* VISTA DE ARCHIVOS */
              <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-[200px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-24">
                    <Loader2 className="animate-spin text-blue-500 w-10 h-10 mb-4 opacity-80" />
                    <span className="text-sm font-medium text-slate-500 animate-pulse">Sincronizando biblioteca...</span>
                  </div>
                ) : formatosCategoria.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-500 border-2 border-dashed border-slate-800/50 rounded-2xl bg-slate-900/20">
                    <div className="p-4 bg-slate-800/50 rounded-full mb-4 ring-1 ring-slate-700">
                      <Folder className="w-8 h-8 opacity-40" />
                    </div>
                    <p className="font-medium text-slate-400">{searchTerm ? 'Sin resultados para tu búsqueda.' : 'Esta carpeta está vacía.'}</p>
                    {esCalidad && !searchTerm && <p className="text-xs mt-2 text-slate-600">Sube el primer formato master para comenzar.</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                    {formatosCategoria.map((formato) => {
                      const isRevision = formato.estado === 'revision';
                      const canDownload = !isRevision || esCalidad;
                      const { Icon: FileIcon, color: fileColor, bg: fileBg } = getFileIcon(formato.nombre);
                      const historialAbierto = historialOpenId === formato.id;
                      const historial = formato.historialVersiones || [];

                      return (
                        <div
                          key={formato.id}
                          className={`relative flex flex-col bg-[#111827] border ${isRevision ? 'border-amber-500/20' : 'border-slate-800'} rounded-2xl p-5 hover:border-slate-600 transition-all hover:shadow-xl group`}
                        >
                          {/* Top */}
                          <div className="flex items-start justify-between mb-4">
                            <div className={`p-3 rounded-xl ${fileBg} ${fileColor}`}>
                              <FileIcon size={20} />
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              <button
                                onClick={() => esCalidad && handleToggleEstado(formato)}
                                disabled={!esCalidad}
                                title={esCalidad ? 'Click para cambiar estado' : undefined}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border tracking-wide transition-all ${
                                  isRevision
                                    ? 'bg-amber-500/5 text-amber-500 border-amber-500/20'
                                    : 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20'
                                } ${esCalidad ? 'hover:scale-105 cursor-pointer' : 'cursor-default'}`}
                              >
                                {isRevision ? 'EN REVISIÓN' : 'VIGENTE'}
                              </button>
                              <ValidationBadge validacion={formato.validacion} />
                            </div>
                          </div>

                          <div className="flex-1">
                            <h4 className="text-base font-bold text-slate-200 group-hover:text-white transition-colors line-clamp-2 mb-2" title={formato.nombre}>
                              {formato.nombre}
                            </h4>

                            <div className="flex items-center gap-3 mb-3">
                              <span className="text-[10px] font-mono bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50">
                                v{(formato.version || '1.0').replace(/^v/i, '')}
                              </span>
                              <span className="text-[10px] text-slate-500">{formatFileSize(formato.size)}</span>
                              <span className="text-[10px] text-slate-500 ml-auto" title={formato.subidoPor ? `Subido por ${formato.subidoPor}` : undefined}>
                                {formato.fechaSubida?.toDate ? format(formato.fechaSubida.toDate(), 'dd MMM yyyy', { locale: es }) : ''}
                              </span>
                            </div>

                            {/* Notas */}
                            <div className="bg-slate-950/40 rounded-lg p-3 border border-slate-800/50 mb-3 min-h-[56px]">
                              <div className="flex gap-2">
                                <Info className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{formato.notas || 'Sin notas.'}</p>
                              </div>
                            </div>

                            {/* Historial de versiones */}
                            {historial.length > 0 && (
                              <div className="mb-3">
                                <button
                                  onClick={() => setHistorialOpenId(historialAbierto ? null : formato.id)}
                                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-blue-400 transition-colors"
                                >
                                  <History size={12} />
                                  {historial.length} versión(es) anterior(es)
                                  <ChevronDown size={12} className={`transition-transform ${historialAbierto ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence>
                                  {historialAbierto && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                                        {historial.map((h, i) => (
                                          <div key={`${h.refPath}-${i}`} className="flex items-center gap-2 text-[11px] bg-slate-950/40 rounded-lg px-2.5 py-1.5 border border-slate-800/50">
                                            <span className="font-mono font-bold text-slate-400 shrink-0">v{(h.version || '?').replace(/^v/i, '')}</span>
                                            <span className="text-slate-500 truncate flex-1" title={h.nombre}>
                                              {h.fecha ? format(new Date(h.fecha), 'dd MMM yy', { locale: es }) : ''} · {h.subidoPor}
                                            </span>
                                            {esCalidad && h.url && (
                                              <button
                                                type="button"
                                                onClick={() => void handleDownload(
                                                  h.refPath,
                                                  h.nombre,
                                                  formato.categoria,
                                                  h.version,
                                                  h.fecha ? new Date(h.fecha).getFullYear() : new Date().getFullYear(),
                                                  `${formato.id}-history-${i}`,
                                                )}
                                                disabled={downloadingId !== null}
                                                className="text-slate-500 hover:text-blue-400 disabled:opacity-50 shrink-0"
                                                title="Descargar versión anterior"
                                              >
                                                {downloadingId === `${formato.id}-history-${i}`
                                                  ? <Loader2 size={12} className="animate-spin" />
                                                  : <Download size={12} />}
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>

                          {/* Acciones */}
                          <div className="flex items-center gap-2 pt-2 mt-auto">
                            {canDownload ? (
                              <button
                                type="button"
                                onClick={() => void handleDownload(
                                  formato.refPath,
                                  formato.nombre,
                                  formato.categoria,
                                  formato.version,
                                  formato.fechaSubida?.toDate().getFullYear() || new Date().getFullYear(),
                                  formato.id,
                                )}
                                disabled={downloadingId !== null}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-900/20"
                              >
                                {downloadingId === formato.id
                                  ? <><Loader2 size={14} className="animate-spin" /> Descargando…</>
                                  : <><Download size={14} /> Descargar</>}
                              </button>
                            ) : (
                              <button disabled className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed" title="Documento en revisión: descarga bloqueada">
                                <Lock size={14} /> En revisión
                              </button>
                            )}

                            {esCalidad && (
                              <>
                                <button
                                  onClick={() => handleOpenEdit(formato)}
                                  className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-800 hover:border-slate-600"
                                  title="Editar / Nueva versión"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={() => handleEliminar(formato)}
                                  className="p-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-slate-800 hover:border-red-900/30"
                                  title="Eliminar"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* --- MODAL SUBIDA / EDICIÓN --- */}
      <AnimatePresence>
        {isModalOpen && esCalidad && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111827] rounded-2xl border border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                    {editingDoc ? <Edit3 size={20} /> : <UploadCloud size={20} />}
                  </div>
                  {editingDoc ? 'Editar Formato' : 'Subir Formato Master'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">

                {/* Dropzone (subida nueva o reemplazo en edición) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    {editingDoc ? (
                      <>Nueva versión del archivo <span className="text-slate-600 normal-case font-medium">(opcional)</span></>
                    ) : 'Documento'}
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelected(e.dataTransfer.files?.[0] || null); }}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 group ${
                      dragOver ? 'border-blue-400 bg-blue-500/10'
                        : formFile ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-slate-700 hover:border-blue-500 hover:bg-blue-500/5'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={e => handleFileSelected(e.target.files?.[0] || null)}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.xlsb"
                    />
                    {formFile ? (
                      <div className="flex flex-col items-center gap-1.5 text-emerald-400 animate-in zoom-in-50">
                        <CheckCircle2 size={28} />
                        <span className="font-bold text-sm break-all">{formFile.name}</span>
                        <span className="text-xs text-slate-500">{formatFileSize(formFile.size)}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleFileSelected(null); }}
                          className="text-[11px] text-slate-500 hover:text-red-400 flex items-center gap-1 mt-1"
                        >
                          <X size={11} /> Quitar archivo
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-500 group-hover:text-blue-400 transition-colors">
                        <UploadCloud className="mx-auto mb-2 opacity-50 group-hover:scale-110 transition-transform" size={28} />
                        <span className="text-sm font-medium">Arrastra el archivo o haz click para seleccionar</span>
                        <p className="text-[10px] mt-1 opacity-70">Excel (con verificación automática de patrones), PDF o Word</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Panel de verificación */}
                {(validating || report) && <ValidationPanel report={report} validating={validating} />}

                {editingDoc && formFile && (
                  <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-950/40 border border-slate-800/50 rounded-lg p-3">
                    <RefreshCw size={13} className="text-blue-400 mt-0.5 shrink-0" />
                    <span>
                      La versión actual (<b>v{(editingDoc.version || '1.0').replace(/^v/i, '')}</b>) se conservará en el historial.
                      {formVersion === editingDoc.version && (
                        <button type="button" onClick={() => setFormVersion(suggestNextVersion(editingDoc.version))} className="text-blue-400 hover:underline ml-1">
                          Sugerir v{suggestNextVersion(editingDoc.version)}
                        </button>
                      )}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Versión</label>
                    <input
                      type="text"
                      value={formVersion}
                      onChange={e => setFormVersion(e.target.value)}
                      placeholder="Ej. 1.0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none text-sm transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estado</label>
                    <div className="relative">
                      <select
                        value={formEstado}
                        onChange={e => setFormEstado(e.target.value as 'activo' | 'revision')}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm outline-none appearance-none cursor-pointer font-bold ${
                          formEstado === 'revision' ? 'text-amber-500 border-amber-900/50' : 'text-emerald-500 border-emerald-900/50'
                        }`}
                      >
                        <option value="activo">VIGENTE</option>
                        <option value="revision">EN REVISIÓN</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <ChevronRight className="rotate-90 w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notas de Cambio</label>
                  <textarea
                    value={formNotas}
                    onChange={e => setFormNotas(e.target.value)}
                    placeholder="Describe brevemente qué se actualizó..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none text-sm resize-none transition-colors"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className={`w-full text-white font-bold py-3.5 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      report?.overall === 'fail' && formFile
                        ? 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 shadow-red-900/20'
                        : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-900/20'
                    }`}
                  >
                    {uploadProgress !== null ? (
                      <><Loader2 className="animate-spin" size={18} /> Subiendo… {Math.round(uploadProgress)}%</>
                    ) : validating ? (
                      <><Loader2 className="animate-spin" size={18} /> Verificando…</>
                    ) : report?.overall === 'fail' && formFile ? (
                      <><ShieldX size={18} /> Subir con excepción</>
                    ) : editingDoc ? (
                      formFile ? <><RefreshCw size={18} /> Publicar nueva versión</> : 'Guardar Cambios'
                    ) : (
                      <><UploadCloud size={18} /> Subir Formato</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FormatosScreen;
