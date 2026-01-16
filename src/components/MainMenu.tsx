import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, FileText, ClipboardList, BookOpen,
  Settings, LogOut, User, Database, FolderKanban, Bell, Check, TrendingUp,
  Palette, Sparkles, X, ChevronRight, Briefcase, MapPin, Clock, ShieldCheck, Loader2, AlertTriangle, CheckCircle2
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png'; // Asegúrate de que esta ruta sea correcta
import { db, storage } from '../utils/firebase';
import {
  collection, onSnapshot, doc, setDoc, getDoc, updateDoc, query, where, limit, orderBy, getDocs
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL
} from 'firebase/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONFIGURACIÓN ---
const USER_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f97316', // Orange
];

const COLOR_GRADIENTS: Record<string, string> = {
  blue: 'from-blue-500 to-indigo-600',
  orange: 'from-orange-500 to-red-500',
  emerald: 'from-emerald-500 to-teal-600',
  purple: 'from-violet-500 to-purple-600',
  cyan: 'from-cyan-500 to-blue-600',
  fuchsia: 'from-fuchsia-500 to-pink-600',
  amber: 'from-amber-500 to-orange-600',
  teal: 'from-teal-400 to-emerald-600',
  rose: 'from-rose-500 to-pink-600',
  red: 'from-red-500 to-orange-600',
  yellow: 'from-yellow-400 to-orange-500',
  indigo: 'from-indigo-500 to-violet-600',
  default: 'from-slate-500 to-slate-700'
};

const MENU_ITEMS = [
  { id: 'calendario', title: 'CALENDARIO', icon: Calendar, color: 'blue', desc: 'Gestiona tus eventos' },
  { id: 'consecutivos', title: 'CONSECUTIVOS', icon: Database, color: 'emerald', desc: 'Control de secuencias' },
  { id: 'drive', title: 'DRIVE', icon: FolderKanban, color: 'amber', desc: 'Archivos en la nube' },
  { id: 'empresas', title: 'EMPRESAS', icon: Building2, color: 'purple', desc: 'Directorio de clientes' },
  { id: 'calibration-stats', title: 'ESTADÍSTICAS', icon: TrendingUp, color: 'teal', desc: 'KPIs y Métricas' },
  { id: 'friday', title: 'FRIDAY', icon: Database, color: 'fuchsia', desc: 'Dashboard de proyectos' },
  { id: 'normas', title: 'HOJA DE HERRAMIENTA', icon: BookOpen, color: 'red', desc: 'Documentación técnica' },
  { id: 'entrada-salida', title: 'HOJA DE SALIDA', icon: FileText, color: 'rose', desc: 'Formatos de entrega' },
  { id: 'hoja-servicio', title: 'HOJA DE SERVICIO', icon: ClipboardList, color: 'cyan', desc: 'Registro de servicios' },
  { id: 'programa-calibracion', title: 'PROGRAMA DE CALIBRACION', icon: Settings, color: 'yellow', desc: 'Patrones de referencia' },
  { id: 'calibration-manager', title: 'CALIBRACIÓN MANAGER', icon: Settings, color: 'indigo', desc: 'Gestión de calibración' },
  { id: 'check-list', title: 'CHECK LIST', icon: Check, color: 'orange', desc: 'Listas de verificación' },
];

const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};
  
const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

// --- WIDGET DE RELOJ ---
const ClockWidget = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => { const timer = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(timer); }, []);
    return (<div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center"><p className="text-xs text-violet-300 font-medium uppercase tracking-wider mb-1">{format(time, 'EEEE d', { locale: es })}</p><p className="text-2xl font-bold text-white tracking-tight">{format(time, 'h:mm a')}</p></div>);
};

// --- COMPONENTE PRINCIPAL ---
export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user, logout } = useAuth();

  const isJefe =
    ((user?.puesto ?? "").trim().toLowerCase() === "administrativo") ||
    ((user?.position ?? "").trim().toLowerCase() === "administrativo") ||
    ((user?.role ?? "").trim().toLowerCase() === "administrativo");

  const menuItemsFiltered = MENU_ITEMS.filter(item => {
    // Aquí puedes agregar lógica para ocultar items si no es jefe
    // if (item.id === "calibration-stats" && !isJefe) return false;
    return true;
  });

  const uid = useMemo(() => (user as any)?.uid || (user as any)?.id || localStorage.getItem('usuario_id') || '', [user]);

  // Estados del Perfil
  const [showProfile, setShowProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6'); // COLOR POR DEFECTO (AZUL)
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Sincroniza datos de usuario desde Firestore
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const d: any = snap.data() || {};
      setEditName(d.name || (user as any)?.name || "");
      setEditEmail(d.email || (user as any)?.email || "");
      setEditPhone(d.phone || "");
      setEditPosition(d.position || "");
      setEditLocation(d.location || "");
      setEditBio(d.bio || "");
      setPhotoUrl(d.photoUrl || "");
      // AQUÍ SE CARGA EL COLOR GUARDADO PARA QUE APAREZCA SELECCIONADO
      setEditColor(d.color || "#3b82f6"); 
    });
    return () => unsub();
  }, [uid, user]);

  // Subir foto y guardar perfil
  const handleProfileSave = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      let newPhotoUrl = photoUrl;
      // Si hay nueva foto, subirla a Storage
      if (photoFile) {
        const storageReference = storageRef(storage, `usuarios_fotos/${uid}.jpg`);
        await uploadBytes(storageReference, photoFile);
        newPhotoUrl = await getDownloadURL(storageReference);
        setPhotoUrl(newPhotoUrl);
      }

      // Guardar en Firestore (Incluyendo el color)
      await setDoc(doc(db, "usuarios", uid), {
        name: editName,
        email: editEmail,
        phone: editPhone,
        position: editPosition,
        location: editLocation,
        bio: editBio,
        photoUrl: newPhotoUrl,
        color: editColor // <-- ESTO ES LO QUE ENLAZA CON FRIDAY
      }, { merge: true });

      setShowProfile(false);
      setPhotoFile(null);
    } catch (error) {
        console.error("Error al guardar perfil:", error)
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
      setPhotoUrl(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleMenuClick = (item: any) => {
    navigateTo(item.id);
  };

  const greeting = new Date().getHours() < 12 ? 'Buenos días' : 'Buenas tardes';

  return (
    <div className="min-h-screen bg-slate-900 text-white selection:bg-violet-500/30 font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Modal editar perfil */}
      <AnimatePresence>
      {showProfile && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 shadow-2xl relative overflow-hidden">
             {/* HEADER MODAL */}
             <div className="relative mb-6 text-center">
                 <h3 className="text-2xl font-bold text-white flex items-center justify-center gap-2"><Sparkles className="w-5 h-5 text-yellow-400"/> Editar Perfil</h3>
                 <button onClick={() => setShowProfile(false)} className="absolute top-0 right-0 p-2 text-slate-400 hover:text-white"><X size={20}/></button>
             </div>

            <form onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }}>
              <div className="mb-6 flex flex-col items-center">
                <div className="relative w-28 h-28 group cursor-pointer" onClick={() => inputFileRef.current?.click()}>
                  <img src={photoUrl || `https://ui-avatars.com/api/?name=${editName}&background=0369a1&color=fff&size=128`} alt="Perfil" className="w-full h-full rounded-full object-cover border-4 border-slate-700 group-hover:border-cyan-400 transition-colors shadow-xl" />
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><p className="text-xs font-bold">Cambiar</p></div>
                </div>
                <input ref={inputFileRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                     <div><label className="text-xs text-slate-400 mb-1 block">Nombre</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:border-cyan-500 outline-none text-sm" placeholder="Nombre" /></div>
                     <div><label className="text-xs text-slate-400 mb-1 block">Cargo</label><input type="text" value={editPosition} onChange={(e) => setEditPosition(e.target.value)} className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:border-cyan-500 outline-none text-sm" placeholder="Puesto" /></div>
                </div>
                
                {/* SELECTOR DE COLOR ENLAZADO CON FRIDAY */}
                <div>
                  <label className="text-xs text-slate-400 font-bold uppercase mb-2 block flex items-center gap-2"><Palette size={14}/> Tu Color Identificador</label>
                  <div className="flex flex-wrap gap-3 justify-center bg-slate-700/30 p-3 rounded-xl border border-slate-600/50">
                      {USER_COLORS.map(color => (
                          <div 
                             key={color} 
                             onClick={() => setEditColor(color)}
                             className={`w-8 h-8 rounded-full cursor-pointer transition-all border-2 ${editColor === color ? 'border-white scale-110 shadow-lg shadow-white/20' : 'border-transparent hover:scale-105 opacity-70 hover:opacity-100'}`}
                             style={{ backgroundColor: color }}
                             title="Selecciona para Friday"
                          />
                      ))}
                  </div>
                </div>

                <div><label className="text-xs text-slate-400 mb-1 block">Teléfono</label><input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:border-cyan-500 outline-none text-sm" placeholder="Teléfono" /></div>
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-4 border-t border-slate-700">
                <button type="button" onClick={() => setShowProfile(false)} disabled={saving} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 className="animate-spin w-4 h-4"/>} Guardar</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-white/5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer transition-transform active:scale-95"><div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-cyan-600 blur opacity-40 group-hover:opacity-60 transition-opacity" /><img src={labLogo} className="relative h-10 w-auto rounded-lg shadow-2xl" alt="Logo" /></div>
            <div className="hidden md:block"><p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Sistema de Gestión</p><h1 className="text-xl font-bold text-white tracking-tight">AG Solutions</h1></div>
          </div>
          <div className="flex items-center gap-4">
            <div onClick={() => setShowProfile(true)} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-all border border-transparent hover:border-white/10 group">
              <div className="text-right hidden sm:block"><p className="text-sm font-bold text-white group-hover:text-violet-200 transition-colors">{greeting}, {editName.split(' ')[0]}</p><p className="text-xs text-white/40 group-hover:text-white/60 capitalize">{editPosition || 'Colaborador'}</p></div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 p-0.5 shadow-lg relative">
                {photoUrl ? <img src={photoUrl} className="w-full h-full rounded-full object-cover" alt="Avatar" /> : <User className="w-full h-full p-2 text-white/50" />}
                {/* PUNTO DE COLOR INDICADOR */}
                <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900" style={{backgroundColor: editColor}}></div>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Cerrar Sesión"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
            <div className="lg:w-3/4">
                <div className="md:hidden mb-6"><h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-400">{greeting}</h2><p className="text-slate-400 mt-1">¿Qué vamos a gestionar hoy?</p></div>
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
                    {menuItemsFiltered.map((item) => (
                        <motion.div variants={itemVariants} key={item.id} onClick={() => handleMenuClick(item)} className="group relative bg-slate-800/40 hover:bg-slate-800/60 backdrop-blur-md border border-white/5 hover:border-white/20 rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-violet-500/10 flex flex-col justify-between h-[140px] md:h-[160px]">
                            <div className={`absolute inset-0 bg-gradient-to-br ${COLOR_GRADIENTS[item.color] || (item as any).color || COLOR_GRADIENTS.default} opacity-0 group-hover:opacity-1 rounded-2xl transition-opacity duration-500`} />
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-3">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${COLOR_GRADIENTS[item.color] || (item as any).color || COLOR_GRADIENTS.default} flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300`}><item.icon className="text-white w-5 h-5" /></div>
                                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight size={14} className="text-white/70" /></div>
                                </div>
                                <div><h3 className="text-base font-bold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-200 transition-all leading-tight">{item.title}</h3></div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
            <div className="lg:w-1/4 space-y-5">
                <ClockWidget />
            </div>
        </div>
      </main>
      
      <style jsx global>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
      `}</style>
    </div>
  );
};

export default MainMenu;