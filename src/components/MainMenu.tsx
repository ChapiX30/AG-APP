import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, FileText, ClipboardList, BookOpen,
  Settings, LogOut, User, Database, FolderKanban, Bell, Check
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

const menuItems = [
  { id: 'calendario', title: 'CALENDARIO', icon: Calendar, color: 'from-[#3d485c] to-[#234e70]', available: true },
  { id: 'consecutivos', title: 'CONSECUTIVOS', icon: Database, color: 'from-[#36537c] to-[#3a6073]', available: true },
  { id: 'empresas', title: 'EMPRESAS', icon: Building2, color: 'from-[#5a5f73] to-[#42495b]', available: true },
  { id: 'hojas-trabajo', title: 'HOJAS DE TRABAJO', icon: FileText, color: 'from-[#8e9eab] to-[#eef2f3]', available: false },
  { id: 'hoja-servicio', title: 'HOJA DE SERVICIO', icon: ClipboardList, color: 'from-[#49516f] to-[#444e72]', available: true },
  { id: 'normas', title: 'NORMAS', icon: BookOpen, color: 'from-[#304352] to-[#d7d2cc]', available: false },
  { id: 'friday', title: 'FRIDAY', icon: Database, color: 'from-[#232526] to-[#414345]', available: true },
  { id: 'drive', title: 'DRIVE', icon: FolderKanban, color: 'from-[#d7d2cc] to-[#304352]', available: true },
  { id: 'procedimientos', title: 'PROCEDIMIENTOS', icon: Settings, color: 'from-[#314755] to-[#26a0da]', available: false },
  { id: 'programa-calibracion', title: 'PROGRAMA DE CALIBRACION', icon: Settings, color: 'from-[#232526] to-[#485563]', available: false },
  { id: 'calibration-stats', title: 'ESTADISTICAS METROLOGOS', icon: Settings, color: 'from-[#232526] to-[#485563]', available: true },
  { id: 'calibration-manager', title: 'CALIBRACION MANAGER', icon: Settings, color: 'from-[#232526] to-[#3a6073]', available: false },
  { id: 'check-list', title: 'CHECK LIST HERRAMIENTA', icon: Settings, color: 'from-[#36475c] to-[#232526]', available: false },
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
    if (item.id === "calibration-stats") {
      return isJefe;
    }
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
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const inputFileRef = useRef(null);

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
  }, [uid]);

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
    setSaving(true);
    try {
      let newPhotoUrl = photoUrl;
      if (photoFile && uid) {
        // Sube la foto al Storage
        const storageReference = storageRef(storage, `usuarios_fotos/${uid}.jpg`);
        await uploadBytes(storageReference, photoFile);
        newPhotoUrl = await getDownloadURL(storageReference);
        setPhotoUrl(newPhotoUrl);
      }

      // Guarda en Firestore
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

  // Permite arrastrar y soltar foto de perfil
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

  // ---- TODO LO DEMÁS IGUAL (notificaciones, asignaciones, menú) ----
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
        return personas.includes(uid) || (email && personasLower.includes(email));
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
          await setDoc(doc(db, 'usuarios', uid), { fcmToken: token, email: email || null }, { merge: true });
          localStorage.setItem('fcmToken', token);
        } catch (e) {
          console.warn('No se pudo guardar fcmToken en usuarios/', e);
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
    if (item.id === 'consecutivos') navigateTo('consecutivos');
    else if (item.id === 'friday') navigateTo('friday');
    else if (item.id === 'empresas') navigateTo('empresas');
    else if (item.id === 'calendario') navigateTo('calendario');
    else if (item.id === 'programa-calibracion') navigateTo('programa-calibracion');
    else if (item.id === 'calibration-manager') navigateTo('calibration-manager');
    else if (item.id === 'hoja-servicio') navigateTo('hoja-servicio');
    else if (item.id === 'normas') navigateTo('normas');
    else if (item.id === 'calibration-stats') navigateTo('calibration-stats');
    else if (item.id === 'check-list') navigateTo('check-list');
    else if (item.id === 'drive') navigateTo('drive');
  };

  // Componente del contador con debugging
  const EquipmentCounter = () => (
    <div className={`
      fixed top-4 right-4 z-50
      bg-black/90 backdrop-blur-sm
      text-white rounded-lg shadow-lg border border-green-400/30
      px-3 py-2 min-w-[140px]
      transform transition-all duration-300
      ${showEquipmentCounter ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
    `}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <div className="text-xs text-gray-300">Calibraciones</div>
        </div>
        <button
          onClick={() => setShowEquipmentCounter(false)}
          className="text-white/50 hover:text-white text-xs ml-2"
        >
          ×
        </button>
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="text-lg font-bold text-green-400">{equipmentCount}</div>
        <div className="text-xs text-white/60">
          {new Date().toLocaleString('es-MX', { month: 'short', year: 'numeric' })}
        </div>
      </div>
      <div className="text-xs text-white/40 mt-1">
        {editName ? `Usuario: ${editName.substring(0, 10)}...` : 'Sin usuario'}
      </div>
    </div>
  );

  // ================= RENDER =====================
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b]">
      {/* Modal editar perfil */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a2332] rounded-xl p-6 w-full max-w-md border border-[#293149]">
            <h3 className="text-xl font-bold text-white mb-6">Editar perfil</h3>
            <form onSubmit={(e) => e.preventDefault()}>
              {/* Foto de perfil */}
              <div 
                className="mb-6 flex flex-col items-center"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div 
                  className="w-24 h-24 rounded-full border-2 border-dashed border-[#3d5a80] flex items-center justify-center cursor-pointer hover:border-[#5a7fb8] transition-colors mb-3"
                  onClick={() => inputFileRef.current?.click()}
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="Perfil" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <p className="text-xs text-gray-400 text-center">
                  <span className="text-[#5a7fb8] cursor-pointer" onClick={() => inputFileRef.current?.click()}>
                    Cambiar foto
                  </span>
                  <br />
                  JPG, PNG o WebP (max 2MB)
                </p>
              </div>
              {/* Campos del formulario */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#293149] border border-[#3d5a80] rounded-lg text-white placeholder-gray-400 focus:border-[#5a7fb8] focus:outline-none"
                    autoFocus
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Correo</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-[#293149] border border-[#3d5a80] rounded-lg text-white placeholder-gray-400 focus:border-[#5a7fb8] focus:outline-none"
                    autoComplete="off"
                    placeholder="tucorreo@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#293149] border border-[#3d5a80] rounded-lg text-white placeholder-gray-400 focus:border-[#5a7fb8] focus:outline-none"
                    placeholder="Ej. 222-123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Puesto / Cargo</label>
                  <input
                    type="text"
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    className="w-full px-3 py-2 bg-[#293149] border border-[#3d5a80] rounded-lg text-white placeholder-gray-400 focus:border-[#5a7fb8] focus:outline-none"
                    placeholder="Ej. Metrologo, Calidad, Técnico"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Ubicación</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-[#293149] border border-[#3d5a80] rounded-lg text-white placeholder-gray-400 focus:border-[#5a7fb8] focus:outline-none"
                    placeholder="Ej. Puebla, México"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Descripción breve</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full px-3 py-2 bg-[#293149] border border-[#3d5a80] rounded-lg text-white placeholder-gray-400 focus:border-[#5a7fb8] focus:outline-none resize-none"
                    rows={2}
                    placeholder="Cuéntanos un poco sobre ti..."
                  />
                </div>
              </div>
              {/* Botones */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowProfile(false)}
                  disabled={saving}
                  className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                >Cancelar</button>
                <button
                  type="button"
                  onClick={handleProfileSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[#2d5aa0] text-white rounded-lg hover:bg-[#1e3a5f] transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Banner de asignación */}
      {showAssignedBanner && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-white px-6 py-3 rounded-lg shadow-lg border border-[#1d4ed8] animate-bounce">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5" />
            <span className="font-medium">
              ¡Tienes {assignedCount} servicio{assignedCount !== 1 ? 's' : ''} asignado{assignedCount !== 1 ? 's' : ''}!
            </span>
          </div>
        </div>
      )}

      {/* CONTADOR DE CALIBRACIONES */}
      <EquipmentCounter />

      {/* ===== Desktop header ===== */}
      <div className="hidden md:block">
        <div className="bg-[#1a2332] shadow-lg border-b border-[#293149]">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <img src={labLogo} alt="Logo" className="h-10 w-10 rounded-lg" />
                <div>
                  <h1 className="text-xl font-bold text-white">Equipos y Servicios AG</h1>
                  <p className="text-sm text-gray-400">Sistema de Gestión</p>
                </div>
              </div>
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#2563eb] to-[#3b82f6] flex items-center justify-center">
                    {photoUrl ? (
                      <img src={photoUrl} alt="Perfil" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{editName || "Usuario"}</p>
                    <button
                      onClick={() => setShowProfile(true)}
                      className="ml-1 p-1 rounded-full hover:bg-[#222e45] transition"
                      title="Editar perfil"
                    >
                      <Settings className="w-3 h-3 text-gray-400" />
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">{editEmail}</p>
                  <button
                    onClick={logout}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center space-x-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Salir</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Mobile header ===== */}
      <div className="md:hidden">
        <div className="bg-[#1a2332] shadow-lg border-b border-[#293149]">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img src={labLogo} alt="Logo" className="h-8 w-8 rounded-lg" />
                <div>
                  <h1 className="text-lg font-bold text-white">ESE-AG</h1>
                  <p className="text-xs text-gray-400">Sistema de Gestión</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#2563eb] to-[#3b82f6] flex items-center justify-center">
                  {photoUrl ? (
                    <img src={photoUrl} alt="Perfil" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <p className="text-sm font-medium text-white">{editName}</p>
                <button
                  onClick={() => setShowProfile(true)}
                  className="ml-1 p-1 rounded-full hover:bg-[#222e45] transition"
                  title="Editar perfil"
                >
                  <Settings className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Desktop grid ===== */}
      <div className="hidden md:block">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h2 className="text-2xl font-bold text-white mb-8">Menú Principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {menuItemsFiltered.map((item) => (
              <div
                key={item.id}
                onClick={() => handleMenuClick(item)}
                className={`
                  relative group cursor-pointer transition-all duration-300
                  hover:scale-105 hover:brightness-110
                  ${item.available ? 'hover:shadow-voldemortcard' : 'opacity-60 cursor-not-allowed'}
                `}
              >
                <div className={`
                  h-32 rounded-xl bg-gradient-to-br ${item.color}
                  flex flex-col items-center justify-center text-white
                  shadow-voldemortcard hover:shadow-voldemortglow transition-all
                  border border-white/10
                `}>
                  <item.icon className="w-8 h-8 mb-2" />
                  <span className="text-sm font-medium text-center px-2">{item.title}</span>
                  {!item.available && (
                    <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                      <span className="text-xs text-white/80 bg-black/60 px-2 py-1 rounded">
                        Próximamente
                      </span>
                    </div>
                  )}
                  {item.available && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Mobile grid ===== */}
      <div className="md:hidden">
        <div className="px-4 py-6">
          <h2 className="text-xl font-bold text-white mb-6">Menú</h2>
          <div className="grid grid-cols-2 gap-4">
            {menuItemsFiltered.map((item) => (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item)}
                disabled={!item.available}
                className={`
                  group rounded-2xl border text-left
                  ${item.available ? 'bg-gradient-to-br from-[#23293a] to-[#293149] border-[#293149] active:scale-[0.98]' : 'bg-gray-800 border-gray-700 opacity-60'}
                  shadow-voldemortcard hover:shadow-voldemortglow transition-all p-4
                `}
              >
                <div className="flex flex-col items-center text-center space-y-2">
                  <item.icon className="w-6 h-6 text-white" />
                  <span className="text-xs font-medium text-white">{item.title}</span>
                  {!item.available && (
                    <span className="text-xs text-gray-400">
                      Próximamente
                    </span>
                  )}
                  {item.available && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* Animaciones mágicas */}
      <style jsx>{`
        .shadow-voldemortcard {
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
        .shadow-voldemortglow {
          box-shadow: 0 8px 16px rgba(59, 130, 246, 0.3);
        }
      `}</style>
    </div>
  );
};

export default MainMenu;
