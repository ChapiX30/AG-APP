import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, ClipboardList, BookOpen, Database, FolderKanban, 
  Bell, TrendingUp, X, ChevronRight, Activity, Award, 
  ArrowRightLeft, FileOutput, LogOut, User, CheckCircle2,
  AlertTriangle, Briefcase, MapPin, Clock, Search, Loader2
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { db, storage } from '../utils/firebase';
import {
  collection, onSnapshot, doc, setDoc, query, where, getDocs, orderBy, limit
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, updateProfile } from 'firebase/auth'; 
import { addYears, addMonths, differenceInDays, parseISO, isValid, format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

// --- TIPOS ---
interface Service {
  id: string;
  cliente: string;
  titulo?: string;
  descripcion?: string;
  prioridad?: 'alta' | 'critica' | 'normal' | 'baja';
  fecha?: string;
  horaInicio?: string;
  ubicacion?: string;
  tipo?: string;
  estado?: string;
  personas?: string[];
}

interface WorkOrder {
  id?: string;
  certificado?: string;
  fecha?: string;
  frecuenciaCalibracion?: string;
}

interface UserData {
  uid: string;
  email: string;
  name: string;
  role: string;
  photoUrl?: string;
  phone?: string;
}

// --- CONFIGURACIÓN DE COLORES ---
const COLOR_VARIANTS: Record<string, any> = {
  blue: { border: 'group-hover:border-blue-500/50', borderActive: 'border-blue-500/40', shadow: 'group-hover:shadow-blue-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]', iconBg: 'group-hover:bg-blue-500/20', iconBgActive: 'bg-blue-500/10', iconColor: 'group-hover:text-blue-400', iconColorActive: 'text-blue-400', gradient: 'from-blue-500/10 to-transparent' },
  emerald: { border: 'group-hover:border-emerald-500/50', borderActive: 'border-emerald-500/40', shadow: 'group-hover:shadow-emerald-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]', iconBg: 'group-hover:bg-emerald-500/20', iconBgActive: 'bg-emerald-500/10', iconColor: 'group-hover:text-emerald-400', iconColorActive: 'text-emerald-400', gradient: 'from-emerald-500/10 to-transparent' },
  amber: { border: 'group-hover:border-amber-500/50', borderActive: 'border-amber-500/40', shadow: 'group-hover:shadow-amber-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]', iconBg: 'group-hover:bg-amber-500/20', iconBgActive: 'bg-amber-500/10', iconColor: 'group-hover:text-amber-400', iconColorActive: 'text-amber-400', gradient: 'from-amber-500/10 to-transparent' },
  purple: { border: 'group-hover:border-purple-500/50', borderActive: 'border-purple-500/40', shadow: 'group-hover:shadow-purple-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]', iconBg: 'group-hover:bg-purple-500/20', iconBgActive: 'bg-purple-500/10', iconColor: 'group-hover:text-purple-400', iconColorActive: 'text-purple-400', gradient: 'from-purple-500/10 to-transparent' },
  cyan: { border: 'group-hover:border-cyan-500/50', borderActive: 'border-cyan-500/40', shadow: 'group-hover:shadow-cyan-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)]', iconBg: 'group-hover:bg-cyan-500/20', iconBgActive: 'bg-cyan-500/10', iconColor: 'group-hover:text-cyan-400', iconColorActive: 'text-cyan-400', gradient: 'from-cyan-500/10 to-transparent' },
  rose: { border: 'group-hover:border-rose-500/50', borderActive: 'border-rose-500/40', shadow: 'group-hover:shadow-rose-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]', iconBg: 'group-hover:bg-rose-500/20', iconBgActive: 'bg-rose-500/10', iconColor: 'group-hover:text-rose-400', iconColorActive: 'text-rose-400', gradient: 'from-rose-500/10 to-transparent' },
  orange: { border: 'group-hover:border-orange-500/50', borderActive: 'border-orange-500/40', shadow: 'group-hover:shadow-orange-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(249,115,22,0.3)]', iconBg: 'group-hover:bg-orange-500/20', iconBgActive: 'bg-orange-500/10', iconColor: 'group-hover:text-orange-400', iconColorActive: 'text-orange-400', gradient: 'from-orange-500/10 to-transparent' },
  indigo: { border: 'group-hover:border-indigo-500/50', borderActive: 'border-indigo-500/40', shadow: 'group-hover:shadow-indigo-500/20', shadowActive: 'shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]', iconBg: 'group-hover:bg-indigo-500/20', iconBgActive: 'bg-indigo-500/10', iconColor: 'group-hover:text-indigo-400', iconColorActive: 'text-indigo-400', gradient: 'from-indigo-500/10 to-transparent' },
};

const MENU_ITEMS = [
  { id: 'friday', title: 'Friday Projects', icon: Activity, category: 'Gestión', color: 'indigo' },
  { id: 'friday-servicios', title: 'Servicios', icon: Briefcase, category: 'Operativo', color: 'emerald' },
  { id: 'hoja-servicio', title: 'Hoja de Servicio', icon: ClipboardList, category: 'Operativo', color: 'blue' },
  { id: 'calendario', title: 'Calendario', icon: Calendar, category: 'Gestión', color: 'blue' },
  { id: 'consecutivos', title: 'Consecutivos', icon: Database, category: 'Técnico', color: 'emerald' },
  { id: 'drive', title: 'Drive', icon: FolderKanban, category: 'Archivos', color: 'amber' },
  { id: 'empresas', title: 'Empresas', icon: Building2, category: 'Gestión', color: 'purple' },
  { id: 'calibration-stats', title: 'Estadísticas', icon: TrendingUp, category: 'Análisis', color: 'cyan' },
  { id: 'normas', title: 'Hoja de Herramienta', icon: BookOpen, category: 'Técnico', color: 'rose' },
  { id: 'entrada-salida', title: 'Hoja de Salida', icon: FileOutput, category: 'Logística', color: 'orange' },
  { id: 'programa-calibracion', title: 'Patrones', icon: Award, category: 'Técnico', color: 'emerald' },
  { id: 'control-prestamos', title: 'Préstamos', icon: ArrowRightLeft, category: 'Logística', color: 'purple' },
  { id: 'vencimientos', title: 'Vencimientos', icon: Bell, category: 'Análisis', color: 'rose' },
];

const SUPER_ADMINS = ['jesus.sustaita@agsolutions.com', 'admin@agsolutions.com'];

const safeDateParse = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
};

// --- WIDGETS ---
const ServicesWidget = ({ services, navigateTo, loading }: { services: Service[], navigateTo: any, loading: boolean }) => {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col h-full overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2 text-sm">
          <Briefcase className="text-blue-500 w-4 h-4" />
          Mis Asignaciones
        </h3>
        <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
          {services.length}
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
        {loading ? (
           <div className="flex flex-col gap-2 p-2">
             <div className="h-16 bg-slate-800 rounded-lg animate-pulse" />
             <div className="h-16 bg-slate-800 rounded-lg animate-pulse" />
           </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-500 gap-2">
             <CheckCircle2 className="w-8 h-8 opacity-20" />
             <span className="text-xs">Sin pendientes activos</span>
          </div>
        ) : (
          services.map((s) => {
            const esUrgente = s.prioridad === 'alta' || s.prioridad === 'critica';
            const fechaDate = safeDateParse(s.fecha);
            const esHoy = fechaDate ? isToday(fechaDate) : false;

            return (
              <div 
                key={s.id}
                onClick={() => navigateTo('friday-servicios')} 
                className={`group relative p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                    esHoy 
                    ? 'bg-blue-950/20 border-blue-900/50 hover:border-blue-700' 
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      esHoy ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                      {esHoy ? "HOY" : (fechaDate ? format(fechaDate, 'dd MMM', { locale: es }) : 'PENDIENTE')}
                  </span>
                  {esUrgente && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                </div>
                
                <h4 className="font-medium text-slate-200 text-sm truncate group-hover:text-white transition-colors">
                    {s.cliente || 'Cliente sin asignar'}
                </h4>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                    {s.titulo || s.descripcion || 'Servicio General'}
                </p>
                
                {s.horaInicio && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>{s.horaInicio}</span>
                        {s.ubicacion && (
                            <>
                                <span className="mx-1 text-slate-700">|</span>
                                <MapPin className="w-3 h-3" />
                                <span className="truncate max-w-[100px]">{s.ubicacion}</span>
                            </>
                        )}
                    </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const KpiWidget = ({ navigateTo }: { navigateTo: any }) => {
  const [stats, setStats] = useState({ vencidos: 0, criticos: 0, proximos: 0, loading: true });

  useEffect(() => {
    let isMounted = true;
    const checkVencimientos = async () => {
      try {
        const q = query(collection(db, "hojasDeTrabajo"), orderBy("fecha", "desc"), limit(300)); 
        const snap = await getDocs(q);
        if (!isMounted) return;

        let v = 0, c = 0, p = 0;
        const hoy = new Date();
        const equiposProcesados = new Set<string>();

        snap.forEach(doc => {
          const d = doc.data() as WorkOrder;
          if (!d.fecha || !d.frecuenciaCalibracion) return;
          const idUnico = d.id ? d.id.trim() : (d.certificado || 'S/N');
          if (idUnico && equiposProcesados.has(idUnico) && idUnico !== 'S/N') return;
          if (idUnico) equiposProcesados.add(idUnico);

          const base = safeDateParse(d.fecha);
          if (base) {
             let vencimiento: Date | null = null;
             const freq = d.frecuenciaCalibracion.toLowerCase();
             if (freq.includes('1 año')) vencimiento = addYears(base, 1);
             else if (freq.includes('2 años')) vencimiento = addYears(base, 2);
             else if (freq.includes('6 meses')) vencimiento = addMonths(base, 6);
             else if (freq.includes('3 meses')) vencimiento = addMonths(base, 3);
             else vencimiento = addYears(base, 1);

             if (vencimiento) {
                const dias = differenceInDays(vencimiento, hoy);
                if (dias < 0) v++; else if (dias <= 30) c++; else if (dias <= 60) p++;
             }
          }
        });
        setStats({ vencidos: v, criticos: c, proximos: p, loading: false });
      } catch (error) { console.error(error); if (isMounted) setStats(prev => ({ ...prev, loading: false })); }
    };
    checkVencimientos();
    return () => { isMounted = false; };
  }, []);

  if (stats.loading) return <div className="h-24 bg-slate-900 rounded-xl border border-slate-800 animate-pulse" />;
  const hasAlerts = stats.vencidos > 0 || stats.criticos > 0;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
          <Activity className="text-blue-500 w-4 h-4" />
          Estado de Equipos
        </h3>
        {!hasAlerts && <span className="text-[10px] text-emerald-500 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900">Normal</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => navigateTo('vencimientos')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-red-950/20 border border-red-900/30 hover:bg-red-950/40 transition-colors group">
            <span className="text-2xl font-bold text-red-500 group-hover:scale-110 transition-transform">{stats.vencidos}</span>
            <span className="text-[10px] text-red-400 uppercase font-semibold">Vencidos</span>
        </button>
        <button onClick={() => navigateTo('vencimientos')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-amber-950/20 border border-amber-900/30 hover:bg-amber-950/40 transition-colors group">
            <span className="text-2xl font-bold text-amber-500 group-hover:scale-110 transition-transform">{stats.criticos}</span>
            <span className="text-[10px] text-amber-400 uppercase font-semibold">Críticos</span>
        </button>
        <button onClick={() => navigateTo('vencimientos')} className="flex flex-col items-center justify-center p-2 rounded-lg bg-blue-950/20 border border-blue-900/30 hover:bg-blue-950/40 transition-colors group">
            <span className="text-2xl font-bold text-blue-500 group-hover:scale-110 transition-transform">{stats.proximos}</span>
            <span className="text-[10px] text-blue-400 uppercase font-semibold">Próximos</span>
        </button>
      </div>
    </div>
  );
};

const ProfileModal = ({ currentUser, onClose, onUpdate }: { currentUser: UserData, onClose: () => void, onUpdate: (data: Partial<UserData>) => void }) => {
    const { uid, name, email, phone, role, photoUrl: initialPhotoUrl } = currentUser;
    const [localName, setLocalName] = useState(name || '');
    const [localEmail, setLocalEmail] = useState(email || '');
    const [localPhone, setLocalPhone] = useState(phone || '');
    const [localPosition, setLocalPosition] = useState(role || '');
    const [localPhotoUrl, setLocalPhotoUrl] = useState(initialPhotoUrl || '');
    const [localPhotoFile, setLocalPhotoFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const inputFileRef = useRef<HTMLInputElement>(null);

    const handleProfileSave = async () => {
      if (!uid) return;
      setSaving(true);
      try {
        let newPhotoUrl = localPhotoUrl;
        if (localPhotoFile) {
          const storageReference = storageRef(storage, `usuarios_fotos/${uid}.jpg`);
          await uploadBytes(storageReference, localPhotoFile);
          newPhotoUrl = await getDownloadURL(storageReference);
        }
        await setDoc(doc(db, "usuarios", uid), {
          name: localName, email: localEmail, phone: localPhone, position: localPosition, photoUrl: newPhotoUrl,
        }, { merge: true });
        
        const auth = getAuth();
        if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: localName, photoURL: newPhotoUrl });
        
        onUpdate({ name: localName, photoUrl: newPhotoUrl, phone: localPhone, role: localPosition });
        setSaving(false); onClose();
      } catch (error) { console.error(error); setSaving(false); }
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setLocalPhotoFile(file);
        setLocalPhotoUrl(URL.createObjectURL(file));
      }
    };
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
             <h3 className="text-lg font-bold text-white">Editar Perfil</h3>
             <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={20}/></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }} className="p-6 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => inputFileRef.current?.click()}>
                 <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-800 shadow-xl group-hover:border-blue-500 transition-colors">
                    {localPhotoUrl ? <img src={localPhotoUrl} className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-slate-500 m-auto mt-6" />}
                 </div>
                 <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-medium text-white">Cambiar</span>
                 </div>
              </div>
              <input type="file" ref={inputFileRef} onChange={handlePhotoChange} accept="image/*" className="hidden" />
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Nombre</label>
                <input type="text" value={localName} onChange={(e)=>setLocalName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 outline-none transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Puesto</label>
                <input type="text" value={localPosition} onChange={(e)=>setLocalPosition(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 outline-none transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Email</label>
                <input type="email" value={localEmail} disabled className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-400 cursor-not-allowed" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 font-medium hover:bg-slate-800 transition-colors">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {saving && <Loader2 className="animate-spin w-4 h-4" />} {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
};

// --- MAIN COMPONENT ---
export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { logout, user } = useAuth();
  
  const [localUser, setLocalUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
        setLocalUser({
            uid: (user as any).uid || '',
            email: (user as any).email || '',
            name: ((user as any).name || (user as any).displayName || '').trim(),
            role: ((user as any).puesto || (user as any).role || '').trim().toLowerCase(),
            photoUrl: (user as any).photoUrl || (user as any).photoURL,
            phone: (user as any).phone
        });
    }
  }, [user]);

  const [showProfile, setShowProfile] = useState(false);
  const [assignedServices, setAssignedServices] = useState<Service[]>([]); 
  const [loadingServices, setLoadingServices] = useState(true);

  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

  const filteredMenu = useMemo(() => {
    if (!localUser) return [];
    const isJefe = localUser.role.includes('admin') || localUser.role.includes('gerente');
    const isCalidad = localUser.role.includes('calidad');
    const isSuperAdmin = SUPER_ADMINS.includes(localUser.email);

    const roleFiltered = MENU_ITEMS.filter(item => {
      if (item.id === 'calibration-stats') return isJefe || isSuperAdmin;
      if (item.id === 'vencimientos') return isJefe || isCalidad || isSuperAdmin;
      if (item.id === 'programa-calibracion' || item.id === 'control-prestamos') {
        return isJefe || isCalidad || isSuperAdmin; 
      }
      return true;
    });

    if (!searchTerm) return roleFiltered;
    return roleFiltered.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [localUser, searchTerm]);

  useEffect(() => {
    if (!localUser?.uid) { setLoadingServices(false); return; }
    
    // CORRECCIÓN: Filtrado mixto (Query + JS) para evitar errores de índices compuestos en Firebase
    const q = query(collection(db, 'servicios'), where('personas', 'array-contains', localUser.uid));
    
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
      
      const activos = docs.filter(s => {
          const st = (s.estado || '').toLowerCase();
          return st !== 'finalizado' && st !== 'cancelado';
      });

      activos.sort((a, b) => {
        const dateA = a.fecha ? new Date(a.fecha).getTime() : 0;
        const dateB = b.fecha ? new Date(b.fecha).getTime() : 0;
        return dateB - dateA; 
      });

      setAssignedServices(activos); 
      setLoadingServices(false);
    });
    return () => unsub();
  }, [localUser?.uid]);

  const handleUserUpdate = (newData: Partial<UserData>) => {
      setLocalUser(prev => prev ? ({ ...prev, ...newData }) : null);
  };

  if (!localUser) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden">
                <img src={labLogo} className="w-6 h-6 object-contain" alt="AG" onError={(e) => e.currentTarget.style.display='none'} />
             </div>
             <div className="hidden md:block w-px h-6 bg-slate-800"></div>
             <div>
                <h1 className="text-base font-bold text-slate-100 tracking-tight leading-none">AG Solutions</h1>
                <p className="text-[10px] text-slate-500 font-medium">Gestión de Laboratorio</p>
             </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
             <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{formattedDate}</span>
             </div>
             <div className="h-6 w-px bg-slate-800 hidden md:block"></div>
             <div className="flex items-center gap-3">
                <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors group">
                   <span className="text-xs font-medium text-slate-300 group-hover:text-white pl-1 hidden sm:block">{localUser.name.split(' ')[0]}</span>
                   <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden relative">
                      {localUser.photoUrl ? <img src={localUser.photoUrl} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-slate-500 m-auto mt-1.5" />}
                   </div>
                </button>
                <button onClick={logout} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><LogOut size={18} /></button>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
                <div className="flex items-center justify-between mb-6">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                        <input type="text" placeholder="Buscar módulo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-slate-600"/>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredMenu.map((item, index) => {
                        const style = COLOR_VARIANTS[item.color] || COLOR_VARIANTS.blue;
                        const isAutoHighlighted = index === activeHighlightIndex;
                        return (
                            <motion.div
                                key={item.id}
                                whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
                                onClick={() => navigateTo(item.id)}
                                className={`group relative bg-slate-900 border rounded-xl p-5 cursor-pointer overflow-hidden transition-all duration-700 ${isAutoHighlighted ? style.borderActive : 'border-slate-800'} ${isAutoHighlighted ? style.shadowActive : ''} ${style.border} ${style.shadow}`}
                            >
                                <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} transition-opacity duration-1000 ease-in-out`} style={{ opacity: isAutoHighlighted ? 0.6 : undefined }} />
                                <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                                <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                    <div className="flex justify-between items-start">
                                        <div className={`p-2.5 rounded-lg transition-all duration-700 ${isAutoHighlighted ? style.iconBgActive : 'bg-slate-800'} ${isAutoHighlighted ? style.iconColorActive : 'text-slate-400'} ${style.iconBg} ${style.iconColor}`}>
                                            <item.icon className="w-6 h-6" />
                                        </div>
                                        <ChevronRight className={`w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 ${style.iconColor}`} />
                                    </div>
                                    <div>
                                        <h3 className={`text-sm font-semibold transition-colors duration-700 mb-1 ${isAutoHighlighted ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>{item.title}</h3>
                                        <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">{item.category}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
            <div className="lg:w-80 flex flex-col gap-6">
                {(localUser.role.includes('calidad') || localUser.role.includes('admin') || SUPER_ADMINS.includes(localUser.email)) && <KpiWidget navigateTo={navigateTo} />}
                <div className="flex-1 min-h-[400px]">
                    <ServicesWidget services={assignedServices} navigateTo={navigateTo} loading={loadingServices} />
                </div>
            </div>
        </div>
      </main>
      <AnimatePresence>{showProfile && localUser && <ProfileModal currentUser={localUser} onClose={() => setShowProfile(false)} onUpdate={handleUserUpdate} />}</AnimatePresence>
    </div>
  );
};

export default MainMenu;