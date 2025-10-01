import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, FileText, ClipboardList, BookOpen,
  Settings, LogOut, User, Database, FolderKanban, Bell, Check, TrendingUp
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

// --- PALETA DE COLORES MEJORADA ---
const menuItems = [
  { id: 'calendario', title: 'CALENDARIO', icon: Calendar, color: 'from-sky-900 to-sky-700', available: true },
  { id: 'consecutivos', title: 'CONSECUTIVOS', icon: Database, color: 'from-slate-800 to-slate-600', available: true },
  { id: 'empresas', title: 'EMPRESAS', icon: Building2, color: 'from-slate-800 to-slate-600', available: true },
  { id: 'hojas-trabajo', title: 'HOJAS DE TRABAJO', icon: FileText, color: 'from-gray-700 to-gray-600', available: false },
  { id: 'hoja-servicio', title: 'HOJA DE SERVICIO', icon: ClipboardList, color: 'from-cyan-900 to-cyan-700', available: true },
  { id: 'normas', title: 'NORMAS', icon: BookOpen, color: 'from-gray-700 to-gray-600', available: false },
  { id: 'friday', title: 'FRIDAY', icon: Database, color: 'from-indigo-900 to-indigo-700', available: true },
  { id: 'drive', title: 'DRIVE', icon: FolderKanban, color: 'from-slate-800 to-slate-600', available: true },
  { id: 'procedimientos', title: 'PROCEDIMIENTOS', icon: Settings, color: 'from-gray-700 to-gray-600', available: false },
  { id: 'programa-calibracion', title: 'PROGRAMA DE CALIBRACION', icon: Settings, color: 'from-gray-700 to-gray-600', available: false },
  { id: 'calibration-stats', title: 'ESTADÍSTICAS', icon: TrendingUp, color: 'from-emerald-900 to-emerald-700', available: true },
  { id: 'calibration-manager', title: 'CALIBRACIÓN MANAGER', icon: Settings, color: 'from-gray-700 to-gray-600', available: false },
  { id: 'check-list', title: 'CHECK LIST', icon: Check, color: 'from-gray-700 to-gray-600', available: false },
];


export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user, logout } = useAuth();

  // Evalúa el rol del usuario para mostrar el menú especial:
  const isJefe =
    ((user?.puesto ?? "").trim().toLowerCase() === "administrativo") ||
    ((user?.position ?? "").trim().toLowerCase() === "administrativo") ||
    ((user?.role ?? "").trim().toLowerCase() === "administrativo");

  // Filtra el menú:
  const menuItemsFiltered = menuItems.filter(item => {
    if (item.id === "calibration-stats") return isJefe;
    return true;
  });

  const uid = useMemo(() => (user as any)?.uid || (user as any)?.id || localStorage.getItem('usuario_id') || '', [user]);
  const email = useMemo(() => (user as any)?.email || localStorage.getItem('usuario.email') || '', [user]);

  // Perfil info
  const [showProfile, setShowProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBio, setEditBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // =================== CONTADOR DE CALIBRACIONES ===================
  const [equipmentCount, setEquipmentCount] = useState(0);
  const [showEquipmentCounter, setShowEquipmentCounter] = useState(true);

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
    });
    return () => unsub();
  }, [uid, user]);

  // === CONTADOR IGUAL QUE LAS GRÁFICAS (solo calibraciones del mes actual) ===
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
  // ===============================================================

  // Subir foto y guardar perfil
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
        location: editLocation,
        bio: editBio,
        photoUrl: newPhotoUrl,
      }, { merge: true });

      setShowProfile(false);
      setPhotoFile(null);
    } catch (error) {
        console.error("Error al guardar perfil:", error)
    } finally {
      setSaving(false);
    }
  };

  // Cargar foto si ya existe
  useEffect(() => {
    if (uid) {
      getDoc(doc(db, "usuarios", uid)).then(snap => {
        const d: any = snap.data() || {};
        setPhotoUrl(d.photoUrl || "");
      });
    }
  }, [uid]);
  
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
      setPhotoUrl(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setPhotoFile(e.dataTransfer.files[0]);
        setPhotoUrl(URL.createObjectURL(e.dataTransfer.files[0]));
    }
  };

  // ---- Notificaciones y asignaciones ----
  const [showAssignedBanner, setShowAssignedBanner] = useState(false);
  const [assignedCount, setAssignedCount] = useState(0);

  useEffect(() => {
    if (!uid && !email) return;
    const key = `notifiedServicios:${uid || email}`;
    let notifiedSet = new Set();
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
          await updateDoc(doc(db, 'usuarios', uid), { fcmToken: token, email: email || null });
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
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/bell.png' });
          }
        } catch { }
      });
    })();
  }, [uid, email]);

  const handleMenuClick = (item: any) => {
    if (!item.available) return;
    navigateTo(item.id);
  };

  // Componente del contador con nuevo estilo
  const EquipmentCounter = () => (
    <div className={`
      fixed top-4 right-4 z-50
      bg-slate-900/80 backdrop-blur-sm
      text-white rounded-lg shadow-lg border border-cyan-400/30
      px-4 py-2 min-w-[150px]
      transform transition-all duration-300 ease-in-out
      ${showEquipmentCounter ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
    `}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
          <div className="text-xs font-semibold text-gray-300 tracking-wider">CALIBRACIONES</div>
        </div>
        <button
          onClick={() => setShowEquipmentCounter(false)}
          className="text-white/50 hover:text-white text-lg leading-none"
        >
          &times;
        </button>
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <div className="text-2xl font-bold text-cyan-400">{equipmentCount}</div>
        <div className="text-xs text-white/60">
          {new Date().toLocaleString('es-MX', { month: 'long' })}
        </div>
      </div>
    </div>
  );

  // ================= RENDER =====================
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Modal editar perfil */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-700 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Editar Perfil</h3>
            <form onSubmit={(e) => e.preventDefault()}>
              <div 
                className="mb-6 flex flex-col items-center"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div 
                  className="relative w-28 h-28 group"
                  onClick={() => inputFileRef.current?.click()}
                >
                  <img 
                    src={photoUrl || `https://ui-avatars.com/api/?name=${editName}&background=0369a1&color=fff&size=128`} 
                    alt="Perfil" 
                    className="w-full h-full rounded-full object-cover border-2 border-slate-600 group-hover:border-cyan-400 transition-colors" 
                  />
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <p className="text-xs text-center">Cambiar foto</p>
                  </div>
                </div>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </div>
              
              <div className="space-y-4">
                {[
                  { label: "Nombre", type: "text", value: editName, setter: setEditName, placeholder: "Tu nombre completo" },
                  { label: "Correo", type: "email", value: editEmail, setter: setEditEmail, placeholder: "tu@correo.com" },
                  { label: "Teléfono", type: "tel", value: editPhone, setter: setEditPhone, placeholder: "Ej. 222-123-4567" },
                  { label: "Puesto / Cargo", type: "text", value: editPosition, setter: setEditPosition, placeholder: "Ej. Metrólogo" },
                ].map(field => (
                  <div key={field.label}>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{field.label}</label>
                    <input
                      type={field.type}
                      value={field.value}
                      onChange={(e) => field.setter(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg placeholder-gray-500 focus:border-cyan-500 focus:ring-cyan-500 focus:outline-none transition-colors"
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-3 mt-8">
                <button
                  type="button"
                  onClick={() => setShowProfile(false)}
                  disabled={saving}
                  className="px-5 py-2 text-gray-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                >Cancelar</button>
                <button
                  type="button"
                  onClick={handleProfileSave}
                  disabled={saving}
                  className="px-5 py-2 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Banner de asignación */}
      {showAssignedBanner && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-6 py-3 rounded-lg shadow-lg border border-cyan-300 animate-bounce">
          <div className="flex items-center space-x-3">
            <Bell className="w-6 h-6" />
            <span className="font-medium text-base">
              ¡Tienes {assignedCount} servicio{assignedCount !== 1 ? 's' : ''} nuevo{assignedCount !== 1 ? 's' : ''}!
            </span>
          </div>
        </div>
      )}

      <EquipmentCounter />

      <header className="bg-slate-900/70 backdrop-blur-lg sticky top-0 z-30 border-b border-slate-800">
        {/* ===== Desktop header ===== */}
        <div className="hidden md:block">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <img src={labLogo} alt="Logo" className="h-10 w-10 rounded-lg" />
                <div>
                  <h1 className="text-xl font-bold text-white">Equipos y Servicios AG</h1>
                  <p className="text-sm text-gray-400">Plataforma de Gestión</p>
                </div>
              </div>
              <div className="flex items-center space-x-6">
                <div className="text-right">
                    <p className="text-lg font-semibold text-white">¡Bienvenido, {editName.split(' ')[0] || "Usuario"}!</p>
                    <p className="text-xs text-gray-400">{editEmail}</p>
                </div>
                <div className="group relative">
                  <img 
                    src={photoUrl || `https://ui-avatars.com/api/?name=${editName}&background=0369a1&color=fff&size=96`} 
                    alt="Perfil" 
                    className="w-12 h-12 rounded-full object-cover cursor-pointer border-2 border-slate-700 group-hover:border-cyan-400 transition-colors"
                    onClick={() => setShowProfile(true)}
                  />
                  <div className="absolute bottom-0 right-0 p-1 bg-slate-700 rounded-full border-2 border-slate-900">
                     <Settings className="w-3 h-3 text-gray-400" />
                  </div>
                </div>
                <button
                    onClick={logout}
                    className="flex items-center space-x-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Cerrar sesión"
                >
                    <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Mobile header ===== */}
        <div className="md:hidden p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <img src={labLogo} alt="Logo" className="h-9 w-9 rounded-lg" />
                    <div>
                      <h1 className="text-base font-bold text-white">Bienvenido,</h1>
                      <p className="text-sm text-gray-300">{editName || "Usuario"}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <img 
                        src={photoUrl || `https://ui-avatars.com/api/?name=${editName}&background=0369a1&color=fff&size=96`} 
                        alt="Perfil" 
                        className="w-10 h-10 rounded-full object-cover"
                        onClick={() => setShowProfile(true)}
                    />
                    <button
                        onClick={logout}
                        className="p-2 text-gray-400 hover:text-red-400"
                        title="Cerrar sesión"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* ===== Desktop grid ===== */}
        <div className="hidden md:block">
          <h2 className="text-3xl font-bold text-white mb-8">Menú Principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {menuItemsFiltered.map((item) => (
              <div
                key={item.id}
                onClick={() => handleMenuClick(item)}
                className={`
                  relative group cursor-pointer transition-transform duration-300 ease-in-out
                  hover:-translate-y-1
                  ${!item.available && 'opacity-50 cursor-not-allowed'}
                `}
              >
                <div className={`
                  relative h-36 rounded-xl bg-gradient-to-br ${item.color}
                  flex flex-col items-center justify-center text-white text-center
                  shadow-lg border border-white/10 overflow-hidden
                `}>
                  {/* Efecto de brillo */}
                  <div className="absolute top-0 left-0 w-full h-full bg-black/20 group-hover:bg-black/10 transition-colors"></div>
                  <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-radial from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-spin-slow"></div>

                  <div className="relative z-10 flex flex-col items-center">
                    <item.icon className="w-10 h-10 mb-3" />
                    <span className="text-base font-semibold tracking-wide px-2">{item.title}</span>
                  </div>
                  
                  {!item.available && (
                    <div className="absolute inset-0 bg-slate-900/70 rounded-xl flex items-center justify-center z-20">
                      <span className="text-sm text-white/80 bg-black/60 px-3 py-1 rounded-full">
                        Próximamente
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== Mobile grid ===== */}
        <div className="md:hidden">
            <h2 className="text-2xl font-bold text-white mb-6">Menú</h2>
            <div className="grid grid-cols-2 gap-4">
                {menuItemsFiltered.map((item) => (
                <button
                    key={item.id}
                    onClick={() => handleMenuClick(item)}
                    disabled={!item.available}
                    className={`
                    relative group rounded-2xl p-4 text-left overflow-hidden
                    border border-slate-700
                    transition-transform duration-200 active:scale-[0.97]
                    ${item.available ? `bg-slate-800` : 'bg-slate-800 opacity-60'}
                    `}
                >
                    <div className="flex flex-col items-center text-center space-y-3">
                        <div className={`p-3 rounded-full bg-gradient-to-br ${item.color}`}>
                            <item.icon className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-white tracking-wider">{item.title}</span>
                    </div>
                    {!item.available && (
                        <div className="absolute top-2 right-2 text-xs bg-slate-900 px-2 py-0.5 rounded-full text-gray-400">
                            Próximamente
                        </div>
                    )}
                </button>
                ))}
            </div>
        </div>
      </main>

      {/* Animaciones y estilos globales */}
      <style jsx global>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        .bg-gradient-radial {
          background-image: radial-gradient(circle, var(--tw-gradient-from), var(--tw-gradient-to));
        }
      `}</style>
    </div>
  );
};

export default MainMenu;