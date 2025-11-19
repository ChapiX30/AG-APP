import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, FileText, ClipboardList, BookOpen,
  Settings, LogOut, User, Database, FolderKanban, Bell, Check, 
  TrendingUp, Menu as MenuIcon, X, ChevronRight, Sparkles, 
  Activity, Award, Clock, ArrowRightLeft // 🚨 1. ÍCONO NUEVO IMPORTADO
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { db, storage } from '../utils/firebase';
import {
  collection, onSnapshot, doc, setDoc, getDoc, updateDoc
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL
} from 'firebase/storage';
import { getFcmToken, onForegroundMessage } from '../utils/firebase';

// ============= CONFIGURACIÓN DE MENÚ (MODIFICADA) =============
const menuItems = [
  { 
    id: 'calendario', 
    title: 'Calendario', 
    icon: Calendar, 
    gradient: 'from-blue-500 via-blue-600 to-indigo-600',
    description: 'Gestiona tus eventos',
    available: true 
  },
  { 
    id: 'consecutivos', 
    title: 'Consecutivos', 
    icon: Database, 
    gradient: 'from-teal-500 via-emerald-500 to-green-600',
    description: 'Control de secuencias',
    available: true 
  },
  { 
    id: 'empresas', 
    title: 'Empresas', 
    icon: Building2, 
    gradient: 'from-purple-500 via-violet-500 to-indigo-600',
    description: 'Directorio de clientes',
    available: true 
  },
  { 
    id: 'hoja-servicio', 
    title: 'Hoja de Servicio', 
    icon: ClipboardList, 
    gradient: 'from-cyan-500 via-sky-500 to-blue-600',
    description: 'Registro de servicios',
    available: true 
  },
  { 
    id: 'friday', 
    title: 'Friday', 
    icon: Activity, 
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-600',
    description: 'Dashboard de proyectos',
    available: true 
  },
  { 
    id: 'drive', 
    title: 'Drive', 
    icon: FolderKanban, 
    gradient: 'from-amber-500 via-orange-500 to-red-600',
    description: 'Almacenamiento de archivos',
    available: true 
  },
  { 
    id: 'calibration-stats', 
    title: 'Estadísticas', 
    icon: TrendingUp, 
    gradient: 'from-emerald-500 via-green-500 to-teal-600',
    description: 'Análisis y métricas',
    available: true 
  },
  { 
    id: 'hojas-trabajo', 
    title: 'Hojas de Trabajo', 
    icon: FileText, 
    gradient: 'from-indigo-500 via-purple-500 to-pink-500', 
    description: 'Gestión de documentos de trabajo', 
    available: false 
  },
  { 
    id: 'normas', 
    title: 'Hojas de Herramienta', 
    icon: BookOpen, 
    gradient: 'from-rose-500 via-red-500 to-orange-500', 
    description: 'Acceso a normativas y guías', 
    available: true 
  },
  { 
    id: 'programa-calibracion', 
    title: 'Patrones', 
    icon: Award, 
    gradient: 'from-yellow-500 via-amber-500 to-orange-500', 
    description: 'Administración de patrones de referencia', 
    available: true 
  },
  // 🚨 2. NUEVO BOTÓN AGREGADO AQUÍ
  { 
    id: 'control-prestamos', 
    title: 'Préstamos', 
    icon: ArrowRightLeft, 
    gradient: 'from-orange-500 via-orange-600 to-red-600', // Color distintivo
    description: 'Entradas y salidas de equipo',
    available: true 
  },
];


export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { logout, user } = useAuth();
  
  // ============= IDENTIFICACIÓN DE ROLES (MODIFICADO) =============
  const getRole = (u: any) => 
    ((u?.puesto ?? "").trim().toLowerCase()) ||
    ((u?.position ?? "").trim().toLowerCase()) ||
    ((u?.role ?? "").trim().toLowerCase()) || "";

  const userRole = getRole(user); 
  
  const userName = ((user as any)?.name || "").trim().toLowerCase(); 
  
  // Variables de Rol
  const isJefe = userRole === "administrativo";
  const isMetrologo = userRole === "metrólogo";
  
  // --- REGLA ESPECÍFICA PARA JESUS SUSTAITA (CALIDAD) ---
  const isJesusSustaitaCalidad = (userName === "jesus sustaita" && userRole === "calidad");
  // ---

  // ============= FILTRADO DE MENÚ (MODIFICADO) =============
  const menuItemsFiltered = menuItems.filter(item => {
    
    // --- LÓGICA PARA JESUS SUSTAITA ---
    if (isJesusSustaitaCalidad) {
      // 🚨 3. AHORA PUEDE VER 'PATRONES' Y 'PRÉSTAMOS'
      return item.id === 'programa-calibracion' || item.id === 'control-prestamos'; 
    }
    // ---
    
    // Lógica existente para 'Jefe' (administrativo)
    if (item.id === "calibration-stats") {
      return isJefe;
    }
    
    // Para todos los demás, muestra el resto.
    return true;
  });

  const uid = useMemo(() => (user as any)?.uid || (user as any)?.id || localStorage.getItem('usuario_id') || '', [user]);
  const email = useMemo(() => (user as any)?.email || localStorage.getItem('usuario.email') || '', [user]);

  // ============= ESTADOS =============
  const [showProfile, setShowProfile] = useState(false);
  const [showAssignedBanner, setShowAssignedBanner] = useState(false);
  const [showMetrologoTip, setShowMetrologoTip] = useState(false); 
  const [profileLoading, setProfileLoading] = useState(true);

  // Estados para perfil
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  
  // Estados para contadores
  const [equipmentCount, setEquipmentCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);

  // ============= EFECTOS =============
  
  // Efecto para cargar perfil
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const d: any = snap.data() || {};
      setEditName(d.name || (user as any)?.name || "");
      setEditEmail(d.email || (user as any)?.email || "");
      setEditPhone(d.phone || "");
      setEditPosition(d.position || "");
      setPhotoUrl(d.photoUrl || "");
      setProfileLoading(false);
    });
    return () => unsub();
  }, [uid, user]);

  // Efecto para contar calibraciones
  useEffect(() => {
    if (!uid || !editName) return;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const unsub = onSnapshot(collection(db, 'hojasDeTrabajo'), (snap) => {
      const hojas = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const hojasDelUsuario = hojas.filter(hoja => {
        const nombreCoincide = hoja.nombre && 
          hoja.nombre.trim().toLowerCase() === editName.trim().toLowerCase();
        if (!nombreCoincide) return false;
        if (!hoja.fecha) return false;
        try {
          const [year, month] = hoja.fecha.split('-').map(Number);
          return month === currentMonth && year === currentYear;
        } catch {
          return false;
        }
      });
      setEquipmentCount(hojasDelUsuario.length);
    }, (err) => {
      console.error('❌ Error obteniendo hojas de trabajo:', err);
    });
    return () => unsub();
  }, [uid, editName]);

  // Efecto para el Tip del Metrólogo
  useEffect(() => {
    if (isMetrologo && equipmentCount > 0) {
      setShowMetrologoTip(true);
    } else {
      setShowMetrologoTip(false);
    }
  }, [isMetrologo, equipmentCount]);

  // Efecto para servicios asignados y notificaciones
  useEffect(() => {
    if (!uid && !email) return;

    const key = `notifiedServicios:${uid || email}`;
    let notifiedSet = new Set<string>();
    try { 
      notifiedSet = new Set(JSON.parse(localStorage.getItem(key) || '[]')); 
    } catch {}

    const unsub = onSnapshot(collection(db, 'servicios'), (snap) => {
      const servicios = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const serviciosActivos = servicios.filter(s => {
        const estado = (s.estado || '').toString().toLowerCase().trim();
        return estado !== 'finalizado' && estado !== 'completado';
      });

      const asignados = serviciosActivos.filter(s => {
        const personas = Array.isArray(s.personas) ? s.personas : [];
        const personasLower = personas.map((p: any) => (p || '').toString().toLowerCase());
        const emailLower = (email || '').toLowerCase();
        return personas.includes(uid) || (email && personasLower.includes(emailLower));
      });

      const nuevos = asignados.filter(s => !notifiedSet.has(s.id));
      
      setAssignedCount(asignados.length); 

      if (nuevos.length > 0) {
        setShowAssignedBanner(true);
        setTimeout(() => setShowAssignedBanner(false), 6000);
        
        if ('Notification' in window) {
          const title = 'Nuevo servicio asignado';
          let body = '';

          if (nuevos.length === 1) {
            const s = nuevos[0];
            const titulo = s.titulo || 'un servicio'; 
            const cliente = s.cliente ? ` para ${s.cliente}` : '';
            body = `Se te asignó: ${titulo}${cliente}.`;
          } else {
            body = `Se te asignaron ${nuevos.length} nuevos servicios. Revísalos en la app.`;
          }

          const show = () => { 
            try { 
              new Notification(title, { body, icon: '/bell.png' }); 
            } catch {} 
          };
          
          if (Notification.permission === 'granted') show();
          else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => { if (p === 'granted') show(); });
          }
        }
        
        nuevos.forEach(s => notifiedSet.add(s.id));
        try { 
          localStorage.setItem(key, JSON.stringify(Array.from(notifiedSet))); 
        } catch {}
      } else {
        try { 
          localStorage.setItem(key, JSON.stringify(asignados.map(s => s.id))); 
        } catch {}
      }
    }, (err) => {
      console.error('onSnapshot servicios error:', err);
    });

    return () => unsub();
  }, [uid, email]);


  // Efecto para FCM Token
  useEffect(() => {
    (async () => {
      if (!uid) return;
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }
      const vapidKey = 'BAsbdOJE0Jq34IyL3eINDo5TyqWz2904Iy0DyHEE3Zyrc0HONx-klR1lhMCM6ald28nPab9xgu5EoEM9092rsxE';
      if (!vapidKey || vapidKey.startsWith('TU_')) {
        console.warn('⚠️ Configura tu VAPID PUBLIC KEY en MainMenu.tsx');
        return;
      }
      const token = await getFcmToken(vapidKey);
      if (token) {
        try {
          const userDocRef = doc(db, 'usuarios', uid);
          await updateDoc(userDocRef, { fcmToken: token, email: email || null });
        } catch (e) {
          try {
            await setDoc(doc(db, 'usuarios', uid), { fcmToken: token, email: email || null }, { merge: true });
          } catch (e2) {
            console.warn('No se pudo guardar fcmToken en usuarios/', e2);
          }
        }
      } else {
        console.warn('No se obtuvo fcmToken (quizá sin permiso o navegador no soportado)');
      }
      onForegroundMessage((payload) => {
        const title = payload?.notification?.title || 'Nuevo servicio asignado';
        const body = payload?.notification?.body || '';
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/bell.png' });
        }
      });
    })();
  }, [uid, email]);

  // ============= HANDLERS =============
  
  const handleMenuClick = (item: any) => {
    if (!item.available) return;
    navigateTo(item.id);
  };

  // ============= COMPONENTES DE UI =============
  
  const ProfileModal = ({ currentUser, onClose }: { currentUser: any, onClose: () => void }) => {
    
    const { uid, name, email, phone, position, photoUrl: initialPhotoUrl } = currentUser;
    const [localName, setLocalName] = useState(name || '');
    const [localEmail, setLocalEmail] = useState(email || '');
    const [localPhone, setLocalPhone] = useState(phone || '');
    const [localPosition, setLocalPosition] = useState(position || '');
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
      } finally {
        setSaving(false);
      }
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        setLocalPhotoFile(e.target.files[0]);
        setLocalPhotoUrl(URL.createObjectURL(e.target.files[0]));
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
              <button
                onClick={onClose} 
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-200 text-white/70 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }} className="p-6 space-y-5">
            <div className="flex flex-col items-center space-y-3">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 bg-gradient-to-br from-slate-700 to-slate-800 shadow-2xl">
                  {localPhotoUrl ? ( 
                    <img src={localPhotoUrl} alt="Perfil" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-12 h-12 text-white/40" />
                    </div>
                  )}
                </div>
              </div>
              <input
                type="file"
                ref={inputFileRef}
                onChange={handlePhotoChange} 
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => inputFileRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                Cambiar foto
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: "Nombre", type: "text", value: localName, setter: setLocalName, placeholder: "Tu nombre completo", icon: User },
                { label: "Correo", type: "email", value: localEmail, setter: setLocalEmail, placeholder: "tu@correo.com", icon: Bell },
                { label: "Teléfono", type: "tel", value: localPhone, setter: setLocalPhone, placeholder: "222-123-4567", icon: Activity },
                { label: "Puesto / Cargo", type: "text", value: localPosition, setter: setLocalPosition, placeholder: "Ej. Metrólogo", icon: Award },
              ].map((field, idx) => (
                <div key={idx} className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-white/90">
                    <field.icon className="w-4 h-4 text-violet-400" />
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white placeholder-white/30 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/50 focus:outline-none transition-all duration-200"
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose} 
                disabled={saving}
                className="flex-1 px-5 py-3 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white/80 font-semibold hover:bg-white/10 transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Componente Banner de Asignados
  const AssignedBanner = () => (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 animate-slideDown">
      <div className="px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-500/90 via-teal-500/90 to-cyan-500/90 backdrop-blur-xl border border-white/20 shadow-2xl">
        <div className="flex items-center gap-3 text-white">
          <Bell className="w-6 h-6 animate-bounce" />
          <p className="font-bold text-lg">
            ¡Tienes {assignedCount} servicio{assignedCount !== 1 ? 's' : ''} nuevo{assignedCount !== 1 ? 's' : ''}!
          </p>
        </div>
      </div>
    </div>
  );

  // ============= LÓGICA DE NIVELES (CON COLORES) =============
  const levelDefinitions = [
    { min: 0, title: 'I', badge: 'bg-gradient-to-r from-cyan-500 to-blue-500', titleColor: 'text-cyan-300', progress: 'from-cyan-500 via-blue-500 to-indigo-500' },
    { min: 10, title: 'II', badge: 'bg-gradient-to-r from-emerald-500 to-green-500', titleColor: 'text-emerald-300', progress: 'from-emerald-500 via-green-500 to-teal-500' },
    { min: 25, title: 'III', badge: 'bg-gradient-to-r from-amber-500 to-yellow-500', titleColor: 'text-amber-300', progress: 'from-amber-500 via-yellow-500 to-orange-500' },
    { min: 50, title: 'IV', badge: 'bg-gradient-to-r from-orange-500 to-red-500', titleColor: 'text-orange-300', progress: 'from-orange-500 via-red-500 to-rose-500' },
    { min: 75, title: 'V', badge: 'bg-gradient-to-r from-purple-500 to-violet-500', titleColor: 'text-purple-300', progress: 'from-purple-500 via-violet-500 to-fuchsia-500' },
    { min: 100, title: 'VI', badge: 'bg-gradient-to-r from-fuchsia-500 to-pink-500', titleColor: 'text-fuchsia-300', progress: 'from-fuchsia-500 via-pink-500 to-rose-500' },
    { min: 150, title: 'Leyenda', badge: 'bg-gradient-to-r from-amber-500 to-red-600', titleColor: 'text-amber-300', progress: 'from-amber-500 via-red-500 to-rose-600' }
  ];


  // Componente de Progreso de Metrólogo (CON COLORES)
  const MetrologoProgressTip = () => {
    if (!isMetrologo || !showMetrologoTip || equipmentCount === 0) return null;
    
    const currentLevelData = [...levelDefinitions].reverse().find(l => equipmentCount >= l.min)!;
    const currentLevelIndex = levelDefinitions.findIndex(l => l.title === currentLevelData.title);
    const level = currentLevelIndex + 1;
    
    const { title, badge, titleColor, progress: progressGradient } = currentLevelData;
    const nextLevelData = levelDefinitions[currentLevelIndex + 1];
    
    let progress = 100;
    let remaining = 0;
    let goal = currentLevelData.min;
    let isMaxLevel = !nextLevelData;
    
    if (!isMaxLevel) {
      const base = currentLevelData.min;
      goal = nextLevelData.min;
      const range = goal - base;
      const progressInLevel = equipmentCount - base;
      progress = Math.max(0, Math.min(100, Math.floor((progressInLevel / range) * 100)));
      remaining = goal - equipmentCount;
    }

    return (
      <div className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100%-3rem)] animate-fadeInUp">
        <div className="relative px-5 py-4 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-300">
          
          <button
            onClick={() => setShowMetrologoTip(false)}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-xl font-bold flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 leading-none pb-0.5"
            aria-label="Cerrar notificación de progreso"
          >
            &times;
          </button>

          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-lg text-white">Progreso Mensual</h4>
            <span className={`px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg ${badge}`}>
              NIVEL {level}
            </span>
          </div>
          
          <div className="flex items-center gap-2 mb-3">
            <Award className={`w-5 h-5 ${titleColor}`} />
            <p className={`text-base font-semibold ${titleColor}`}>{title}</p>
          </div>

          <div className="w-full bg-slate-700/50 rounded-full h-3 mb-1 border border-white/10 overflow-hidden">
            <div 
              className={`h-full rounded-full bg-gradient-to-r ${progressGradient} transition-all duration-500 ease-out`} 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-xs font-medium text-white/60">
              {isMaxLevel ? '¡Nivel Máximo!' : `Próximo: ${nextLevelData.title}`}
            </span>
            <span className="text-sm font-bold text-white">
              {equipmentCount} / {isMaxLevel ? '∞' : goal}
            </span>
          </div>

          {!isMaxLevel && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
              <TrendingUp className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-xs text-white/80">
                ¡Sigue así! Solo te {remaining === 1 ? 'falta 1 equipo' : `faltan ${remaining} equipos`} para el Nivel {level + 1}.
              </p>
            </div>
          )}
          
          {isMaxLevel && (
             <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-400/30">
              <Sparkles className="w-5 h-5 text-violet-300 flex-shrink-0" />
              <p className="text-xs text-white/90 font-semibold">
                ¡Has alcanzado el rango más alto este mes! Excelente trabajo.
              </p>
            </div>
          )}

        </div>
      </div>
    );
  };
  
  // ============= LAYOUT DESKTOP =============
  const DesktopLayout = () => (
    <div className="hidden lg:block min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-fuchsia-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-500/5 rounded-full blur-[150px]"></div>
      </div>

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/60 border-b border-white/5 shadow-2xl">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <img src={labLogo} alt="Logo" className="relative h-12 w-auto rounded-2xl shadow-xl" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                  Sistema de Gestión
                </h1>
                <p className="text-sm text-white/50">Panel de Control Principal</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              
              <button
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-3 px-4 py-2.5 min-h-[58px] rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all duration-200 group"
              >
                {profileLoading ? (
                  <div className="flex items-center gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-slate-700"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-700 rounded w-24"></div>
                      <div className="h-3 bg-slate-700 rounded w-16"></div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full blur opacity-50 group-hover:opacity-75 transition-opacity"></div>
                      <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/20 bg-gradient-to-br from-slate-700 to-slate-800">
                        {photoUrl ? (
                          <img src={photoUrl} alt="Perfil" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-5 h-5 text-white/40" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">{editName || 'Usuario'}</p>
                      <p className="text-xs text-white/50">{editPosition || 'Sin cargo'}</p>
                    </div>
                  </>
                )}
              </button>

              <button
                onClick={logout}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200 hover:scale-105"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-white mb-2">Módulos del Sistema</h2>
          <p className="text-white/50">Selecciona un módulo para comenzar</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {menuItemsFiltered.map((item, idx) => (
            <button
              type="button"
              key={item.id}
              onClick={() => handleMenuClick(item)}
              disabled={!item.available} 
              className={`group relative w-full text-left overflow-hidden rounded-2xl transition-all duration-300 ${
                item.available 
                  ? 'cursor-pointer hover:scale-[1.02] hover:-translate-y-1' 
                  : 'opacity-50 cursor-not-allowed'
              }`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
              
              <div className="relative h-full p-6 bg-white/5 backdrop-blur-xl border border-white/10 group-hover:border-white/20 transition-all duration-300">
                <div className="relative mb-4">
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity`}></div>
                  <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className="w-7 h-7 text-white" />
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-white transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-white/60 group-hover:text-white/80 transition-colors mb-4">
                  {item.description}
                </p>

                {item.available ? (
                  <div className="flex items-center gap-2 text-white/70 group-hover:text-white text-sm font-semibold">
                    <span>Acceder</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-white/50">
                    <Clock className="w-3.5 h-3.5" />
                    Próximamente
                  </span>
                )}

                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 via-transparent to-transparent"></div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );

  // ============= LAYOUT MOBILE =============
  const MobileLayout = () => (
    <div className="lg:hidden min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[100px]"></div>
      </div>

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/80 border-b border-white/10 shadow-2xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={labLogo} alt="Logo" className="h-10 w-auto rounded-xl shadow-lg" />
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Sistema de Gestión
                </h1>
                <p className="text-xs text-white/50">Panel Principal</p>
              </div>
            </div>

            <button
              onClick={() => setShowProfile(true)}
              className="p-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 transition-all"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative p-4 pb-24">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">Módulos</h2>
          <p className="text-sm text-white/50">Selecciona un módulo</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {menuItemsFiltered.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item)}
              disabled={!item.available}
              className={`relative group overflow-hidden rounded-2xl p-4 text-left transition-all duration-200 ${
                !item.available 
                  ? 'opacity-50' 
                  : 'active:scale-95'
              }`}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div className="absolute inset-0 bg-white/5 backdrop-blur-xl border border-white/10"></div>
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 ${item.available && 'group-active:opacity-100'} transition-opacity`}></div>
              
              <div className="relative">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1 line-clamp-2">
                  {item.title}
                </h3>
                {!item.available && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-semibold">
                    Próx.
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl bg-slate-900/90 border-t border-white/10 shadow-2xl">
        <div className="flex items-center justify-around px-4 py-3">
          <button className="flex flex-col items-center gap-1 p-2 text-violet-400">
            <Database className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Menú</span>
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className="flex flex-col items-center gap-1 p-2 text-white/60 hover:text-white transition-colors"
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Perfil</span>
          </button>
          <button
            onClick={logout}
            className="flex flex-col items-center gap-1 p-2 text-red-400 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Salir</span>
          </button>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      {showProfile && <ProfileModal 
        currentUser={{
          uid: uid,
          name: editName,
          email: editEmail,
          phone: editPhone,
          position: editPosition,
          photoUrl: photoUrl
        }}
        onClose={() => setShowProfile(false)}
      />}

      {showAssignedBanner && assignedCount > 0 && <AssignedBanner />}
      
      {showMetrologoTip && <MetrologoProgressTip />} 
      
      <DesktopLayout />
      <MobileLayout />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { 
            opacity: 0; 
            transform: translate(-50%, -20px);
          }
          to { 
            opacity: 1; 
            transform: translate(-50%, 0);
          }
        }
        @keyframes fadeInUp { 
          from { 
            opacity: 0; 
            transform: translateY(20px);
          }
          to { 
            opacity: 1; 
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-slideDown {
          animation: slideDown 0.5s ease-out;
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out;
        }
      `}</style>
    </>
  );
};

export default MainMenu;