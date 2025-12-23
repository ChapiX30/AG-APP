import React, { useEffect, useMemo, useState, useRef } from 'react';
// --- IMPORTA TUS HOOKS LOCALES AQUÍ ---
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
// -------------------------------------
import {
  Calendar, Building2, ClipboardList, BookOpen, Database, FolderKanban, 
  Bell, TrendingUp, X, ChevronRight, Sparkles, Activity, Award, 
  ArrowRightLeft, FileOutput, LogOut, User, Menu as MenuIcon, CheckCircle2,
  AlertTriangle, Briefcase, MapPin, Clock, ShieldCheck, Play, Loader2
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { db, storage } from '../utils/firebase';
import {
  collection, onSnapshot, doc, setDoc, query, where, getDocs, orderBy, limit
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addYears, addMonths, differenceInDays, parseISO, isValid, format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';

// --- TIPO DE DATOS (TypeScript Interfaces) ---
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

// --- CONFIGURACIÓN Y CONSTANTES ---

// Lista de correos con permisos especiales (Reemplaza al hardcode de nombre)
const SUPER_ADMINS = ['jesus.sustaita@agsolutions.com', 'admin@agsolutions.com'];

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
  { id: 'calendario', title: 'Calendario', icon: Calendar, color: 'blue', desc: 'Gestiona tus eventos' },
  { id: 'vencimientos', title: 'Vencimientos', icon: Bell, color: 'orange', desc: 'Equipos por vencer' },
  { id: 'consecutivos', title: 'Consecutivos', icon: Database, color: 'emerald', desc: 'Control de secuencias' },
  { id: 'empresas', title: 'Empresas', icon: Building2, color: 'purple', desc: 'Directorio de clientes' },
  { id: 'hoja-servicio', title: 'Hoja de Servicio', icon: ClipboardList, color: 'cyan', desc: 'Registro de servicios' },
  { id: 'friday', title: 'Friday', icon: Activity, color: 'fuchsia', desc: 'Dashboard de proyectos' },
  { id: 'drive', title: 'Drive', icon: FolderKanban, color: 'amber', desc: 'Archivos en la nube' },
  { id: 'calibration-stats', title: 'Estadísticas', icon: TrendingUp, color: 'teal', desc: 'KPIs y Métricas' },
  { id: 'entrada-salida', title: 'Hoja de Salida', icon: FileOutput, color: 'rose', desc: 'Formatos de entrega' },
  { id: 'normas', title: 'Hoja de Herramienta', icon: BookOpen, color: 'red', desc: 'Documentación técnica' },
  { id: 'programa-calibracion', title: 'Patrones', icon: Award, color: 'yellow', desc: 'Patrones de referencia' },
  { id: 'control-prestamos', title: 'Préstamos', icon: ArrowRightLeft, color: 'indigo', desc: 'Control de equipo' },
];

// --- UTILIDADES ---
const safeDateParse = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
};

// --- COMPONENTES UI (WIDGETS) ---

// 1. Widget: Mis Servicios
const MyServicesWidget = ({ services, navigateTo, loading }: { services: Service[], navigateTo: any, loading: boolean }) => {
  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-2xl p-4 h-48 animate-pulse border border-white/5">
        <div className="h-4 w-1/2 bg-slate-700 rounded mb-4" />
        <div className="space-y-3">
            <div className="h-16 bg-slate-700/50 rounded-xl" />
            <div className="h-16 bg-slate-700/50 rounded-xl" />
        </div>
      </div>
    );
  }

  if (services.length === 0) {
    return (
        <div className="bg-slate-800/30 backdrop-blur-md border border-dashed border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-2">
            <CheckCircle2 className="text-indigo-400/50 w-8 h-8" />
            <p className="text-slate-400 text-xs">Sin servicios asignados por hoy.</p>
        </div>
    );
  }

  return (
    <div className="bg-indigo-900/20 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-4 overflow-hidden relative animate-fadeIn">
      {/* Fondo decorativo */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
      
      <div className="flex items-center justify-between mb-3 relative z-10">
        <h3 className="font-bold text-white flex items-center gap-2 text-sm">
          <Briefcase className="text-indigo-400" size={16} />
          Mis Asignaciones ({services.length})
        </h3>
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
        </span>
      </div>
      
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {services.map((s) => {
          const esUrgente = s.prioridad === 'alta' || s.prioridad === 'critica';
          const fechaDate = safeDateParse(s.fecha);
          const esHoy = fechaDate ? isToday(fechaDate) : false;
          const fechaTexto = esHoy ? "HOY" : (fechaDate ? format(fechaDate, 'dd MMM', { locale: es }) : 'S/F');

          return (
            <div 
              key={s.id}
              onClick={() => navigateTo('friday')} 
              className={`border rounded-xl p-3 cursor-pointer transition-all group relative overflow-hidden ${esHoy ? 'bg-indigo-600/20 border-indigo-400/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'bg-slate-800/60 border-white/5 hover:bg-indigo-900/40'}`}
            >
              {esUrgente && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}
              
              <div className="flex justify-between items-start mb-1 pl-2">
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${esHoy ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {fechaTexto}
                    </span>
                    {s.horaInicio && (
                        <span className="text-[10px] font-medium text-slate-300 flex items-center gap-0.5">
                            <Clock size={10} /> {s.horaInicio}
                        </span>
                    )}
                </div>
                {esUrgente && <AlertTriangle size={12} className="text-red-400" />}
              </div>
              
              <div className="pl-2 mt-1">
                <h4 className="font-bold text-white text-xs truncate" title={s.cliente}>
                    {s.cliente || 'Cliente sin nombre'}
                </h4>
                <p className="text-[10px] text-slate-300 truncate mb-2 leading-tight" title={s.titulo}>
                    {s.titulo || s.descripcion || 'Servicio General'}
                </p>
                
                {s.ubicacion && (
                    <div className="flex items-start gap-1 text-[10px] text-indigo-200 bg-indigo-500/10 p-1.5 rounded">
                        <MapPin size={10} className="mt-0.5 flex-shrink-0" /> 
                        <span className="line-clamp-2 leading-tight">{s.ubicacion}</span>
                    </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 2. Widget: Radar de Calidad (Optimizado)
const QualityRadarWidget = ({ navigateTo }: { navigateTo: any }) => {
  const [stats, setStats] = useState({ vencidos: 0, criticos: 0, proximos: 0, loading: true });

  useEffect(() => {
    let isMounted = true;
    const checkVencimientos = async () => {
      try {
        // OPTIMIZACIÓN: Limitamos a los últimos 300 registros para evitar leer toda la BD.
        // Lo ideal sería tener un campo "fechaVencimiento" indexado en Firebase.
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
          // Evitamos duplicados
          if (idUnico && equiposProcesados.has(idUnico) && idUnico !== 'S/N') return;
          if (idUnico) equiposProcesados.add(idUnico);

          const base = safeDateParse(d.fecha);
          if (base) {
             let vencimiento: Date | null = null;
             const freq = d.frecuenciaCalibracion.toLowerCase();
             
             // Lógica de cálculo segura
             if (freq.includes('1 año')) vencimiento = addYears(base, 1);
             else if (freq.includes('2 años')) vencimiento = addYears(base, 2);
             else if (freq.includes('6 meses')) vencimiento = addMonths(base, 6);
             else if (freq.includes('3 meses')) vencimiento = addMonths(base, 3);
             else vencimiento = addYears(base, 1); // Default

             if (vencimiento) {
                const dias = differenceInDays(vencimiento, hoy);
                // Solo contamos si vence en el futuro cercano o ya venció
                if (dias < 0) v++;
                else if (dias <= 30) c++;
                else if (dias <= 60) p++;
             }
          }
        });
        setStats({ vencidos: v, criticos: c, proximos: p, loading: false });
      } catch (error) {
        console.error("Error en radar de calidad:", error);
        if (isMounted) setStats(prev => ({ ...prev, loading: false }));
      }
    };
    checkVencimientos();
    return () => { isMounted = false; };
  }, []);

  if (stats.loading) {
      return (
        <div className="bg-slate-800/50 rounded-2xl p-4 flex items-center justify-center h-24 animate-pulse">
            <Loader2 className="animate-spin text-slate-600" />
        </div>
      );
  }

  if (stats.vencidos === 0 && stats.criticos === 0 && stats.proximos === 0) {
     return (
        <div className="bg-emerald-900/10 backdrop-blur-md border border-emerald-500/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1 animate-fadeIn">
            <ShieldCheck className="text-emerald-500 w-6 h-6 mb-1" />
            <h3 className="text-sm font-bold text-emerald-200">Todo en orden</h3>
            <p className="text-[10px] text-emerald-400/60">No hay equipos pendientes</p>
        </div>
     );
  }

  return (
    <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/50 backdrop-blur-md border border-white/10 rounded-2xl p-4 animate-fadeIn">
      <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
        <AlertTriangle className="text-orange-400" size={16} />
        <h3 className="font-bold text-white text-sm">Atención Requerida</h3>
      </div>
      
      <div className="space-y-2">
        {stats.vencidos > 0 && (
          <div onClick={() => navigateTo('vencimientos')} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition group">
            <span className="text-xs text-red-200 font-medium">Vencidos</span>
            <span className="text-sm font-bold text-red-400 bg-red-500/20 px-2 rounded group-hover:bg-red-500/30">{stats.vencidos}</span>
          </div>
        )}
        {stats.criticos > 0 && (
          <div onClick={() => navigateTo('vencimientos')} className="flex items-center justify-between p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition group">
            <span className="text-xs text-orange-200 font-medium">Críticos (≤30d)</span>
            <span className="text-sm font-bold text-orange-400 bg-orange-500/20 px-2 rounded group-hover:bg-orange-500/30">{stats.criticos}</span>
          </div>
        )}
        {stats.proximos > 0 && (
           <div onClick={() => navigateTo('vencimientos')} className="flex items-center justify-between p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition group">
            <span className="text-xs text-yellow-200 font-medium">Próximos (≤60d)</span>
            <span className="text-sm font-bold text-yellow-400 bg-yellow-500/20 px-2 rounded group-hover:bg-yellow-500/30">{stats.proximos}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// 3. Widget: Reloj
const ClockWidget = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 60000); 
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-violet-300 font-medium uppercase tracking-wider mb-1">
                {format(time, 'EEEE d', { locale: es })}
            </p>
            <p className="text-2xl font-bold text-white tracking-tight">
                {format(time, 'h:mm a')}
            </p>
        </div>
    );
};

// 4. Modal de Perfil
const ProfileModal = ({ currentUser, onClose }: { currentUser: UserData, onClose: () => void }) => {
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
          // NOTA: Para producción real, aquí deberías comprimir la imagen antes de subirla
          // usando una librería como 'browser-image-compression' para ahorrar datos y storage.
          const storageReference = storageRef(storage, `usuarios_fotos/${uid}.jpg`);
          await uploadBytes(storageReference, localPhotoFile);
          newPhotoUrl = await getDownloadURL(storageReference);
        }
        await setDoc(doc(db, "usuarios", uid), {
          name: localName, 
          email: localEmail, 
          phone: localPhone, 
          position: localPosition, 
          photoUrl: newPhotoUrl,
        }, { merge: true });
        
        onClose(); 
        setLocalPhotoFile(null);
      } catch (error) {
        console.error("Error al guardar perfil:", error);
        alert("Hubo un error al guardar los cambios.");
      } finally {
        setSaving(false);
      }
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        // Validación básica de tamaño (ej. max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("La imagen es muy pesada. Intenta con una menor a 5MB.");
            return;
        }
        setLocalPhotoFile(file);
        setLocalPhotoUrl(URL.createObjectURL(file));
      }
    };
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
        <div className="relative w-full max-w-md bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
          <div className="relative px-6 pt-6 pb-4 bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-fuchsia-600/20 backdrop-blur-xl border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-violet-400" />
                Editar Perfil
              </h3>
              <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }} className="p-6 space-y-5">
            <div className="flex flex-col items-center space-y-3">
              <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 bg-slate-700 shadow-2xl">
                  {localPhotoUrl ? <img src={localPhotoUrl} className="w-full h-full object-cover" alt="Perfil" /> : <User className="w-12 h-12 text-white/40 m-auto mt-6" />}
              </div>
              <input type="file" ref={inputFileRef} onChange={handlePhotoChange} accept="image/*" className="hidden" />
              <button type="button" onClick={() => inputFileRef.current?.click()} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors">Cambiar foto</button>
            </div>
            <div className="space-y-4">
              <input type="text" value={localName} onChange={(e)=>setLocalName(e.target.value)} placeholder="Nombre Completo" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors" />
              <input type="text" value={localPosition} onChange={(e)=>setLocalPosition(e.target.value)} placeholder="Puesto" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors" />
              <input type="email" value={localEmail} onChange={(e)=>setLocalEmail(e.target.value)} placeholder="Correo Electrónico" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-violet-500 transition-colors" />
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="flex-1 px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold flex items-center justify-center gap-2 transition-colors">
                {saving && <Loader2 className="animate-spin w-4 h-4" />}
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
};

// --- COMPONENTE PRINCIPAL (ORQUESTADOR) ---
export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { logout, user } = useAuth();
  
  // Memoización segura de los datos del usuario
  const userData = useMemo((): UserData => ({
    uid: (user as any)?.uid || '',
    email: (user as any)?.email || '',
    name: ((user as any)?.name || '').trim(),
    role: ((user as any)?.puesto || (user as any)?.role || '').trim().toLowerCase(),
    photoUrl: (user as any)?.photoUrl,
    phone: (user as any)?.phone
  }), [user]);

  const [showProfile, setShowProfile] = useState(false);
  const [assignedServices, setAssignedServices] = useState<Service[]>([]); 
  const [loadingServices, setLoadingServices] = useState(true);
  const [greeting, setGreeting] = useState('');

  // Saludo dinámico
  useEffect(() => {
    const updateGreeting = () => {
        const hr = new Date().getHours();
        if (hr < 12) setGreeting('Buenos días');
        else if (hr < 18) setGreeting('Buenas tardes');
        else setGreeting('Buenas noches');
    };
    updateGreeting();
    // Actualizar saludo si la app se queda abierta mucho tiempo
    const interval = setInterval(updateGreeting, 1000 * 60 * 60); 
    return () => clearInterval(interval);
  }, []);

  // Filtro de menú (Seguridad mejorada)
  const filteredMenu = useMemo(() => {
    const isJefe = userData.role.includes('admin') || userData.role.includes('gerente');
    const isCalidad = userData.role.includes('calidad');
    const isSuperAdmin = SUPER_ADMINS.includes(userData.email);

    return MENU_ITEMS.filter(item => {
      // Reglas de acceso
      if (item.id === 'calibration-stats') return isJefe || isSuperAdmin;
      if (item.id === 'vencimientos') return isJefe || isCalidad || isSuperAdmin;
      if (item.id === 'programa-calibracion' || item.id === 'control-prestamos') {
        return isJefe || isCalidad || isSuperAdmin; 
      }
      return true;
    });
  }, [userData]);

  // Carga de Servicios Asignados
  useEffect(() => {
    if (!userData.uid) {
        setLoadingServices(false);
        return;
    }
    
    // Consulta optimizada: Solo servicios activos
    const q = query(
      collection(db, 'servicios'),
      where('personas', 'array-contains', userData.uid), 
      where('estado', '!=', 'Finalizado')
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
      // Filtro doble seguridad en cliente por si acaso 'Cancelado' se escapa
      const activos = docs.filter(s => 
        s.estado?.toLowerCase() !== 'finalizado' && 
        s.estado?.toLowerCase() !== 'cancelado'
      );
      // Ordenar localmente por fecha (los más recientes primero)
      activos.sort((a, b) => {
        const dateA = a.fecha ? new Date(a.fecha).getTime() : 0;
        const dateB = b.fecha ? new Date(b.fecha).getTime() : 0;
        return dateB - dateA; 
      });

      setAssignedServices(activos); 
      setLoadingServices(false);
    }, (err) => {
        console.error("Error cargando servicios:", err);
        setLoadingServices(false);
    });

    return () => unsub();
  }, [userData.uid]);

  // Renderizado
  return (
    <div className="min-h-screen bg-[#0f172a] text-white selection:bg-violet-500/30 font-sans">
      
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/80 border-b border-white/5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer transition-transform active:scale-95">
               <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-cyan-600 blur opacity-40 group-hover:opacity-60 transition-opacity" />
               <img src={labLogo} className="relative h-10 w-auto rounded-lg shadow-2xl" alt="Logo" />
            </div>
            <div className="hidden md:block">
              <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Sistema de Gestión</p>
              <h1 className="text-xl font-bold text-white tracking-tight">AG Solutions</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div onClick={() => setShowProfile(true)} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-all border border-transparent hover:border-white/10 group">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-white group-hover:text-violet-200 transition-colors">
                  {greeting}, {userData.name.split(' ')[0]}
                </p>
                <p className="text-xs text-white/40 group-hover:text-white/60 capitalize">{userData.role || 'Colaborador'}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 p-0.5 shadow-lg relative">
                {userData.photoUrl ? (
                   <img src={userData.photoUrl} className="w-full h-full rounded-full object-cover" alt="Avatar" />
                ) : (
                   <User className="w-full h-full p-2 text-white/50" />
                )}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Cerrar Sesión">
                <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
        
        <div className="flex flex-col lg:flex-row gap-8">
            
            {/* 1. COLUMNA IZQUIERDA: MENÚ GRID */}
            <div className="lg:w-3/4">
                
                {/* Saludo Móvil */}
                <div className="md:hidden mb-6">
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-400">
                        {greeting}
                    </h2>
                    <p className="text-slate-400 mt-1">¿Qué vamos a gestionar hoy?</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
                    {filteredMenu.map((item) => (
                        <div
                        key={item.id}
                        onClick={() => navigateTo(item.id)}
                        className="group relative bg-slate-800/40 hover:bg-slate-800/60 backdrop-blur-md border border-white/5 hover:border-white/20 rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-violet-500/10 flex flex-col justify-between h-[140px] md:h-[160px]"
                        >
                        {/* Hover Gradient Glow (Usa constante externa) */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${COLOR_GRADIENTS[item.color] || COLOR_GRADIENTS.default} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-500`} />
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-3">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${COLOR_GRADIENTS[item.color] || COLOR_GRADIENTS.default} flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300`}>
                                    <item.icon className="text-white w-5 h-5" />
                                </div>
                                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight size={14} className="text-white/70" />
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-base font-bold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-200 transition-all leading-tight">
                                    {item.title}
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 group-hover:text-slate-300 leading-snug font-medium">
                                    {item.desc}
                                </p>
                            </div>
                        </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. COLUMNA DERECHA: SIDEBAR */}
            <div className="lg:w-1/4 space-y-5">
                
                {/* Widget de Reloj */}
                <ClockWidget />

                {/* Widget para Calidad (Solo roles permitidos) */}
                {(userData.role.includes('calidad') || userData.role.includes('admin') || SUPER_ADMINS.includes(userData.email)) && (
                    <QualityRadarWidget navigateTo={navigateTo} />
                )}

                {/* Widget para Servicios (Siempre visible para técnicos) */}
                <MyServicesWidget 
                    services={assignedServices} 
                    navigateTo={navigateTo} 
                    loading={loadingServices}
                />

            </div>

        </div>
      </main>

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal 
          currentUser={userData}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
};

export default MainMenu;