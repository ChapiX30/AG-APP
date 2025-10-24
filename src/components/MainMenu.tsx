import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, FileText, ClipboardList, BookOpen,
  Settings, LogOut, User, Database, FolderKanban, Bell, Check, 
  TrendingUp, Menu as MenuIcon, X, ChevronRight, Sparkles, 
  Activity, Award, Clock
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

// ============= CONFIGURACIÓN DE MENÚ =============
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
    gradient: 'from-slate-600 to-slate-700',
    description: 'Próximamente',
    available: false 
  },
  { 
    id: 'normas', 
    title: 'Hojas de Herramienta', 
    icon: BookOpen, 
    gradient: 'from-slate-600 to-slate-700',
    description: 'Próximamente',
    available: true 
  },
  { 
    id: 'programa-calibracion', 
    title: 'Patrones', 
    icon: Settings, 
    gradient: 'from-slate-600 to-slate-700',
    description: 'Próximamente',
    available: true 
  },
];

export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { logout, user } = useAuth();
  
  // ============= IDENTIFICACIÓN DE ROLES MEJORADA =============
  const getRole = (u: any) => 
    ((u?.puesto ?? "").trim().toLowerCase()) ||
    ((u?.position ?? "").trim().toLowerCase()) ||
    ((u?.role ?? "").trim().toLowerCase()) || "";

  const isJefe = getRole(user) === "administrativo";
  const isMetrologo = getRole(user) === "metrólogo"; // 👈 Nuevo rol para la lógica del tip

  const menuItemsFiltered = menuItems.filter(item => {
    if (item.id === "calibration-stats") return isJefe;
    return true;
  });

  const uid = useMemo(() => (user as any)?.uid || (user as any)?.id || localStorage.getItem('usuario_id') || '', [user]);
  const email = useMemo(() => (user as any)?.email || localStorage.getItem('usuario.email') || '', [user]);

  // ============= ESTADOS =============
  const [showProfile, setShowProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEquipmentCounter, setShowEquipmentCounter] = useState(true);
  const [showAssignedBanner, setShowAssignedBanner] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMetrologoTip, setShowMetrologoTip] = useState(false); // 👈 Nuevo estado para el tip

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [equipmentCount, setEquipmentCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  
  const inputFileRef = useRef<HTMLInputElement>(null);

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

  // Efecto para el Tip del Metrólogo (NEW)
  useEffect(() => {
    // Si no es Metrólogo o el contador es 0 (aún no se carga), no hacer nada
    if (!isMetrologo || equipmentCount === 0) return;
    
    // Mostrar el tip por 8 segundos
    setShowMetrologoTip(true);
    const timer = setTimeout(() => {
      setShowMetrologoTip(false);
    }, 8000); 

    return () => clearTimeout(timer); // Limpieza
  }, [isMetrologo, equipmentCount]);

  // Efecto para servicios asignados y notificaciones
  useEffect(() => {
    if (!uid && !email) return;
    const key = `notifiedServicios:${uid || email}`;
    let notifiedSet = new Set<string>();
    try { notifiedSet = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
    const unsub = onSnapshot(collection(db, 'servicios'), (snap) => {
      const servicios = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const asignados = servicios.filter(s => {
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
          const body = nuevos.length === 1 ? `Se te asignó: ${nuevos[0].elemento || 'Servicio'}`
            : `Se te asignaron ${nuevos.length} servicios`;
          const show = () => { try { new Notification(title, { body, icon: '/bell.png' }); } catch {} };
          if (Notification.permission === 'granted') show();
          else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => { if (p === 'granted') show(); });
          }
        }
        nuevos.forEach(s => notifiedSet.add(s.id));
        try { localStorage.setItem(key, JSON.stringify(Array.from(notifiedSet))); } catch {}
      } else {
        try { localStorage.setItem(key, JSON.stringify(asignados.map(s => s.id))); } catch {}
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
  const handleProfileSave = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      let newPhotoUrl = photoUrl;
      if (photoFile) {
        const storageReference = storageRef(storage, `usuarios_fotos/${uid}.jpg`);
        await uploadBytes(storageReference, photoFile);
        newPhotoUrl = await getDownloadURL(storageReference);
        setPhotoUrl(newPhotoUrl);
      }
      await setDoc(doc(db, "usuarios", uid), {
        name: editName, 
        email: editEmail, 
        phone: editPhone, 
        position: editPosition, 
        photoUrl: newPhotoUrl,
      }, { merge: true });
      setShowProfile(false);
      setPhotoFile(null);
    } catch (error) {
      console.error("Error al guardar perfil:", error);
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
    if (!item.available) return;
    setMobileMenuOpen(false);
    navigateTo(item.id);
  };

  // ============= COMPONENTES DE UI =============
  
  // Componente Modal de Perfil (sin cambios)
  const ProfileModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
        {/* Header con efecto glassmorphism */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-fuchsia-600/20 backdrop-blur-xl border-b border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-violet-400" />
              Editar Perfil
            </h3>
            <button
              onClick={() => setShowProfile(false)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-200 text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleProfileSave(); }} className="p-6 space-y-5">
          {/* Avatar con glassmorphism */}
          <div className="flex flex-col items-center space-y-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 bg-gradient-to-br from-slate-700 to-slate-800 shadow-2xl">
                {photoUrl ? (
                  <img src={photoUrl} alt="Perfil" className="w-full h-full object-cover" />
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

          {/* Campos con glassmorphism */}
          <div className="space-y-4">
            {[
              { label: "Nombre", type: "text", value: editName, setter: setEditName, placeholder: "Tu nombre completo", icon: User },
              { label: "Correo", type: "email", value: editEmail, setter: setEditEmail, placeholder: "tu@correo.com", icon: Bell },
              { label: "Teléfono", type: "tel", value: editPhone, setter: setEditPhone, placeholder: "222-123-4567", icon: Activity },
              { label: "Puesto / Cargo", type: "text", value: editPosition, setter: setEditPosition, placeholder: "Ej. Metrólogo", icon: Award },
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

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowProfile(false)}
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

  // Componente Banner de Asignados (sin cambios)
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

  // Componente Tip de Metrólogo (NEW)
  const MetrologoTip = () => {
    if (!isMetrologo || !showMetrologoTip || equipmentCount === 0) return null;

    let message: string;
    let iconClass: string;
    let gradient: string;
    let iconComponent: React.ElementType = Check; // Default

    // Lógica de mensajes basada en el contador
    if (equipmentCount < 50) {
      message = `¡Vas muy bien, ${equipmentCount} calibraciones este mes! Sigue así. 💪`;
      iconClass = "text-yellow-400";
      gradient = "from-yellow-500/90 via-amber-500/90 to-orange-500/90";
      iconComponent = TrendingUp;
    } else if (equipmentCount >= 50 && equipmentCount < 100) {
      message = `¡Excelente! Ya llevas ${equipmentCount} calibraciones. Mantén el ritmo. 🚀`;
      iconClass = "text-green-400";
      gradient = "from-emerald-500/90 via-teal-500/90 to-cyan-500/90";
      iconComponent = Award;
    } else {
      message = `¡WOW! Superaste las 100 con ${equipmentCount} calibraciones. ¡Eres imparable! 🌟`;
      iconClass = "text-fuchsia-400";
      gradient = "from-violet-500/90 via-purple-500/90 to-fuchsia-600/90";
      iconComponent = Sparkles;
    }
    
    const Icon = iconComponent; // Usa el componente de icono elegido

    return (
      <div className="fixed bottom-24 right-6 z-50 animate-fadeInUp"> {/* Posición arriba del contador */}
        <div className={`px-6 py-4 rounded-2xl bg-gradient-to-r ${gradient} backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-300`}>
          <div className="flex items-center gap-3 text-white">
            <Icon className={`w-6 h-6 animate-pulse ${iconClass}`} />
            <p className="font-semibold text-base">
              {message}
            </p>
          </div>
        </div>
      </div>
    );
  };
  
  // Componente Contador de Calibraciones (sin cambios mayores)
  const EquipmentCounter = () => (
    <div className="fixed bottom-6 right-6 z-30 animate-fadeIn">
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
        <div className="relative px-6 py-4 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/20 shadow-2xl">
          <button
            onClick={() => setShowEquipmentCounter(false)}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110"
          >
            ×
          </button>
          <div className="flex items-center gap-4">
            <Award className="w-8 h-8 text-violet-400" />
            <div>
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Calibraciones</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                {equipmentCount}
              </p>
              <p className="text-xs text-white/50">{new Date().toLocaleString('es-MX', { month: 'long' })}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ============= LAYOUT DESKTOP (sin cambios) =============
  const DesktopLayout = () => (
    <div className="hidden lg:block min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Efectos de fondo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-fuchsia-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-500/5 rounded-full blur-[150px]"></div>
      </div>

      {/* Header con glassmorphism */}
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
              {/* Perfil */}
              <button
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all duration-200 group"
              >
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
              </button>

              {/* Logout */}
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

      {/* Grid de módulos */}
      <main className="relative max-w-7xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-white mb-2">Módulos del Sistema</h2>
          <p className="text-white/50">Selecciona un módulo para comenzar</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItemsFiltered.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => handleMenuClick(item)}
              className={`group relative overflow-hidden rounded-2xl transition-all duration-300 ${
                !item.available 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer hover:scale-[1.02] hover:-translate-y-1'
              }`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {/* Fondo con gradiente */}
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
              
              {/* Glassmorphism card */}
              <div className="relative h-full p-6 bg-white/5 backdrop-blur-xl border border-white/10 group-hover:border-white/20 transition-all duration-300">
                {/* Icono con efecto */}
                <div className="relative mb-4">
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity`}></div>
                  <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className="w-7 h-7 text-white" />
                  </div>
                </div>

                {/* Contenido */}
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-white transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-white/60 group-hover:text-white/80 transition-colors mb-4">
                  {item.description}
                </p>

                {/* Badge o Arrow */}
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

                {/* Efecto de brillo en hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 via-transparent to-transparent"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );

  // ============= LAYOUT MOBILE (sin cambios) =============
  const MobileLayout = () => (
    <div className="lg:hidden min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Efectos de fondo mobile */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[100px]"></div>
      </div>

      {/* Header mobile */}
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
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 transition-all"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Grid de módulos mobile */}
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
              {/* Fondo glassmorphism */}
              <div className="absolute inset-0 bg-white/5 backdrop-blur-xl border border-white/10"></div>
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 ${item.available && 'group-active:opacity-100'} transition-opacity`}></div>
              
              {/* Contenido */}
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

      {/* Bottom navigation */}
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
      {showProfile && <ProfileModal />}
      {showAssignedBanner && <AssignedBanner />}
      {/* Nuevo Tip visible para Metrólogos */}
      {isMetrologo && showMetrologoTip && <MetrologoTip />} 
      {/* El contador original sigue visible para todos (o quien tenga count > 0) */}
      {showEquipmentCounter && <EquipmentCounter />}
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
        // NUEVA ANIMACIÓN para el push-up
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