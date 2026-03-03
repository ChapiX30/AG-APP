import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation'; // <--- Importamos el hook de navegación
import { db, storage } from '../utils/firebase';
import { 
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { 
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject 
} from 'firebase/storage';
import { 
  Folder, FileText, UploadCloud, Trash2, Download, 
  ArrowLeft, Loader2, Search, Edit3, Lock, Unlock, 
  Info, History, CheckCircle2, AlertTriangle, X, Home, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIGURACIÓN DE CATEGORÍAS ---
const CATEGORIAS = [
  { id: 'dimensional', nombre: 'Dimensional', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: FileText },
  { id: 'electrica', nombre: 'Eléctrica', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Activity }, // Usando iconos genéricos si no tienes específicos, o FileText por defecto
  { id: 'mecanica', nombre: 'Mecánica', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: Settings },
  { id: 'presion', nombre: 'Presión', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', icon: Gauge },
  { id: 'temperatura', nombre: 'Temperatura', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: Thermometer },
  { id: 'masa', nombre: 'Masa', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: Scale },
  { id: 'volumen', nombre: 'Volumen', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', icon: Beaker },
  { id: 'general', nombre: 'General / Otros', color: 'text-slate-300', bg: 'bg-slate-800/50', border: 'border-slate-700/50', icon: FileText },
];

// Iconos auxiliares para el array de arriba (simulados para que compile sin importar mil cosas extra)
function Activity(props: any) { return <FileText {...props} /> }
function Settings(props: any) { return <FileText {...props} /> }
function Gauge(props: any) { return <FileText {...props} /> }
function Thermometer(props: any) { return <FileText {...props} /> }
function Scale(props: any) { return <FileText {...props} /> }
function Beaker(props: any) { return <FileText {...props} /> }

interface Formato {
  id: string;
  nombre: string;
  categoria: string;
  url: string;
  refPath: string;
  fechaSubida: any;
  subidoPor: string;
  size: number;
  version: string;       
  notas: string;         
  estado: 'activo' | 'revision'; 
  ultimaModificacion?: any;
}

export const FormatosScreen: React.FC = () => {
  const { user } = useAuth();
  const { navigateTo } = useNavigation(); // <--- Hook para volver al menú
  
  const [categoriaActual, setCategoriaActual] = useState<string | null>(null);
  const [formatos, setFormatos] = useState<Formato[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado para subida/edición
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Formato | null>(null);
  
  // Form values
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formVersion, setFormVersion] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formEstado, setFormEstado] = useState<'activo' | 'revision'>('activo');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Permisos
  const userRole = ((user as any)?.puesto || (user as any)?.role || '').trim().toLowerCase();
  const esCalidadOAdmin = userRole.includes('calidad') || userRole.includes('admin') || userRole.includes('gerente');

  // --- EFECTOS ---
  useEffect(() => {
    if (!categoriaActual) return;
    setLoading(true);
    const q = query(
      collection(db, 'formatos_master'),
      where('categoria', '==', categoriaActual)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Formato));
      docs.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setFormatos(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [categoriaActual]);

  // --- HANDLERS ---
  const handleBack = () => {
    if (categoriaActual) {
      setCategoriaActual(null);
      setSearchTerm('');
    } else {
      navigateTo('menu'); // Regresa al MainMenu
    }
  };

  const handleOpenUpload = () => {
    setEditingDoc(null);
    setFormFile(null);
    setFormVersion('1.0');
    setFormNotas('Carga inicial del documento');
    setFormEstado('activo');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (doc: Formato) => {
    setEditingDoc(doc);
    setFormFile(null);
    setFormVersion(doc.version || '1.0');
    setFormNotas(doc.notas || '');
    setFormEstado(doc.estado || 'activo');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoriaActual) return;

    try {
      if (editingDoc) {
        await updateDoc(doc(db, 'formatos_master', editingDoc.id), {
          version: formVersion,
          notas: formNotas,
          estado: formEstado,
          ultimaModificacion: serverTimestamp(),
          modificadoPor: (user as any)?.email
        });
        setIsModalOpen(false);
        return;
      }

      if (!formFile) {
        alert("Selecciona un archivo primero");
        return;
      }

      const fileRefPath = `formatos_master/${categoriaActual}/${Date.now()}_${formFile.name}`;
      const storageReference = storageRef(storage, fileRefPath);
      const uploadTask = uploadBytesResumable(storageReference, formFile);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error(error);
          setUploadProgress(null);
          alert("Error al subir.");
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await addDoc(collection(db, 'formatos_master'), {
            nombre: formFile.name,
            categoria: categoriaActual,
            url: downloadURL,
            refPath: fileRefPath,
            fechaSubida: serverTimestamp(),
            subidoPor: (user as any)?.name || 'Admin',
            size: formFile.size,
            version: formVersion,
            notas: formNotas,
            estado: formEstado
          });
          setUploadProgress(null);
          setIsModalOpen(false);
        }
      );

    } catch (error) {
      console.error(error);
      alert("Ocurrió un error.");
    }
  };

  const handleEliminar = async (formato: Formato) => {
    if (!confirm(`¿Eliminar definitivamente "${formato.nombre}"?`)) return;
    try {
      const fileRef = storageRef(storage, formato.refPath);
      await deleteObject(fileRef).catch(() => console.log("Archivo no encontrado en storage, borrando ref db"));
      await deleteDoc(doc(db, 'formatos_master', formato.id));
    } catch (error) {
      alert("Error al eliminar.");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredFormatos = formatos.filter(f => 
    f.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.notas?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentCategoryData = CATEGORIAS.find(c => c.id === categoriaActual);

  return (
    <div className="flex-1 h-full bg-[#0B1120] text-slate-200 flex flex-col relative selection:bg-blue-500/30 overflow-hidden">
      
      {/* --- BACKGROUND EFFECTS (Professional Look) --- */}
      <div className="absolute top-0 left-0 w-full h-96 bg-blue-900/10 rounded-full blur-[120px] -translate-y-1/2 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none mix-blend-overlay" />

      {/* --- HEADER --- */}
      <header className="z-10 bg-[#0B1120]/80 backdrop-blur-xl border-b border-slate-800/60 sticky top-0">
        <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 max-w-[1920px] mx-auto">
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={handleBack}
              className="p-2.5 bg-slate-800/50 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700/50 group"
              title={categoriaActual ? "Volver a Categorías" : "Ir al Menú Principal"}
            >
              {categoriaActual ? (
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
              ) : (
                <Home size={20} />
              )}
            </button>

            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Gestión de Formatos
                {categoriaActual && (
                  <>
                    <ChevronRight className="text-slate-600" size={16} />
                    <span className="text-blue-400">{currentCategoryData?.nombre}</span>
                  </>
                )}
              </h1>
              <p className="text-xs font-medium text-slate-500">
                {categoriaActual ? 'Repositorio de Documentos Controlados' : 'Sistema de Gestión de Calidad AG'}
              </p>
            </div>
          </div>

          {/* Controls */}
          {categoriaActual && (
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
              {esCalidadOAdmin && (
                <button 
                  onClick={handleOpenUpload}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-900/20 hover:shadow-blue-600/30 transition-all active:scale-95 border border-blue-500/50"
                >
                  <UploadCloud size={18} />
                  <span className="hidden sm:inline">Subir Nuevo</span>
                </button>
              )}
            </div>
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
                {CATEGORIAS.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoriaActual(cat.id)}
                    className="group relative flex flex-col items-start p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-600 hover:bg-slate-800/60 transition-all hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-1 overflow-hidden"
                  >
                    <div className={`absolute top-0 right-0 p-20 ${cat.bg} opacity-[0.08] blur-2xl rounded-full translate-x-10 -translate-y-10 group-hover:opacity-[0.15] transition-opacity`} />
                    
                    <div className={`mb-4 p-3 rounded-xl ${cat.bg} ${cat.color} border border-white/5 ring-1 ring-white/10`}>
                      <cat.icon size={28} strokeWidth={1.5} />
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors z-10">
                      {cat.nombre}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 mb-4 z-10 group-hover:text-slate-400">
                      Formatos maestros y guías.
                    </p>
                    
                    <div className="mt-auto w-full pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs font-medium text-slate-500 group-hover:text-blue-400 transition-colors">
                      <span>Explorar carpeta</span>
                      <ArrowLeft className="rotate-180 w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </motion.div>
            ) : (
              /* VISTA DE ARCHIVOS */
              <motion.div 
                key="files"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="min-h-[200px]"
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-24">
                    <Loader2 className="animate-spin text-blue-500 w-10 h-10 mb-4 opacity-80" />
                    <span className="text-sm font-medium text-slate-500 animate-pulse">Sincronizando biblioteca...</span>
                  </div>
                ) : filteredFormatos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-500 border-2 border-dashed border-slate-800/50 rounded-2xl bg-slate-900/20">
                    <div className="p-4 bg-slate-800/50 rounded-full mb-4 ring-1 ring-slate-700">
                      <Folder className="w-8 h-8 opacity-40" />
                    </div>
                    <p className="font-medium text-slate-400">Esta carpeta está vacía.</p>
                    {esCalidadOAdmin && <p className="text-xs mt-2 text-slate-600">Sube el primer formato para comenzar.</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                    {filteredFormatos.map((formato) => {
                      const isRevision = formato.estado === 'revision';
                      const canDownload = !isRevision || esCalidadOAdmin;

                      return (
                        <div 
                          key={formato.id} 
                          className={`relative flex flex-col bg-[#111827] border ${isRevision ? 'border-amber-500/20' : 'border-slate-800'} rounded-2xl p-5 hover:border-slate-600 transition-all hover:shadow-xl group`}
                        >
                          {/* Top Status */}
                          <div className="flex items-start justify-between mb-4">
                             <div className={`p-3 rounded-xl ${isRevision ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                {isRevision ? <AlertTriangle size={20} /> : <FileText size={20} />}
                             </div>
                             <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border tracking-wide ${
                                isRevision 
                                  ? 'bg-amber-500/5 text-amber-500 border-amber-500/20' 
                                  : 'bg-emerald-500/5 text-emerald-500 border-emerald-500/20'
                              }`}>
                                {isRevision ? 'EN REVISIÓN' : 'VIGENTE'}
                             </span>
                          </div>

                          <div className="flex-1">
                             <h4 className="text-base font-bold text-slate-200 group-hover:text-white transition-colors line-clamp-2 mb-2" title={formato.nombre}>
                                {formato.nombre}
                             </h4>
                             
                             <div className="flex items-center gap-3 mb-4">
                                <span className="text-[10px] font-mono bg-slate-800/80 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50">
                                   {formato.version || 'v1.0'}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                   {formatFileSize(formato.size)}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-auto">
                                   {formato.fechaSubida?.toDate ? format(formato.fechaSubida.toDate(), 'dd MMM', { locale: es }) : ''}
                                </span>
                             </div>

                             {/* Notes Box */}
                             <div className="bg-slate-950/40 rounded-lg p-3 border border-slate-800/50 mb-4 min-h-[60px]">
                                <div className="flex gap-2">
                                  <Info className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                                    {formato.notas || 'Sin notas.'}
                                  </p>
                                </div>
                             </div>
                          </div>

                          {/* Action Footer */}
                          <div className="flex items-center gap-2 pt-2 mt-auto">
                             {canDownload ? (
                                <a 
                                  href={formato.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                                    isRevision 
                                      ? 'bg-amber-900/20 text-amber-500 cursor-not-allowed border border-amber-900/30' 
                                      : 'bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-900/20'
                                  }`}
                                >
                                  <Download size={14} /> Descargar
                                </a>
                              ) : (
                                <button disabled className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed">
                                   <Lock size={14} /> Bloqueado
                                </button>
                              )}

                              {esCalidadOAdmin && (
                                <>
                                  <button 
                                    onClick={() => handleOpenEdit(formato)}
                                    className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-800 hover:border-slate-600"
                                    title="Editar"
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

      {/* --- MODAL (Estilo mejorado) --- */}
      <AnimatePresence>
        {isModalOpen && (
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
                  {editingDoc ? 'Editar Metadatos' : 'Subir Documento'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20}/></button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                
                {!editingDoc && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Documento</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 group ${
                        formFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 hover:border-blue-500 hover:bg-blue-500/5'
                      }`}
                    >
                      <input type="file" ref={fileInputRef} onChange={e => setFormFile(e.target.files?.[0] || null)} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" />
                      {formFile ? (
                        <div className="flex flex-col items-center gap-2 text-emerald-400 animate-in zoom-in-50">
                          <CheckCircle2 size={32} />
                          <span className="font-bold text-sm">{formFile.name}</span>
                          <span className="text-xs text-slate-500">{formatFileSize(formFile.size)}</span>
                        </div>
                      ) : (
                        <div className="text-slate-500 group-hover:text-blue-400 transition-colors">
                          <UploadCloud className="mx-auto mb-3 opacity-50 group-hover:scale-110 transition-transform" size={32} />
                          <span className="text-sm font-medium">Click para seleccionar archivo</span>
                          <p className="text-[10px] mt-1 opacity-70">PDF, Excel, Word</p>
                        </div>
                      )}
                    </div>
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
                        onChange={e => setFormEstado(e.target.value as any)}
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

                <div className="pt-4">
                  <button 
                    type="submit" 
                    disabled={uploadProgress !== null}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {uploadProgress !== null ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        {Math.round(uploadProgress)}%
                      </>
                    ) : (
                      <>
                        {editingDoc ? 'Guardar Cambios' : 'Subir Formato'}
                      </>
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