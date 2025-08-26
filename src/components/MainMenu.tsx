import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { 
  Calendar, 
  Building2, 
  FileText, 
  ClipboardList, 
  BookOpen, 
  Settings,
  LogOut,
  User,
  Database,
  FolderKanban,
  Bell,
  Check
} from 'lucide-react';

import labLogo from '../assets/lab_logo.png';

import { db } from '../utils/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { getFcmToken, onForegroundMessage } from '../utils/firebase';

const menuItems = [
  { id: 'calendario', title: 'CALENDARIO', icon: Calendar, color: 'from-[#3d485c] to-[#234e70]', available: true },
  { id: 'consecutivos', title: 'CONSECUTIVOS', icon: Database, color: 'from-[#36537c] to-[#3a6073]', available: true },
  { id: 'empresas', title: 'EMPRESAS', icon: Building2, color: 'from-[#5a5f73] to-[#42495b]', available: true },
  { id: 'hojas-trabajo', title: 'HOJAS DE TRABAJO', icon: FileText, color: 'from-[#8e9eab] to-[#eef2f3]', available: false },
  { id: 'hoja-servicio', title: 'HOJA DE SERVICIO', icon: ClipboardList, color: 'from-[#49516f] to-[#444e72]', available: true },
  { id: 'normas', title: 'NORMAS', icon: BookOpen, color: 'from-[#304352] to-[#d7d2cc]', available: true },
  { id: 'friday', title: 'FRIDAY', icon: Database, color: 'from-[#232526] to-[#414345]', available: true },
  { id: 'drive', title: 'DRIVE', icon: FolderKanban, color: 'from-[#d7d2cc] to-[#304352]', available: true },
  { id: 'procedimientos', title: 'PROCEDIMIENTOS', icon: Settings, color: 'from-[#314755] to-[#26a0da]', available: false },
  { id: 'programa-calibracion', title: 'PROGRAMA DE CALIBRACION', icon: Settings, color: 'from-[#232526] to-[#485563]', available: true },
  { id: 'calibration-manager', title: 'CALIBRACION MANAGER', icon: Settings, color: 'from-[#232526] to-[#3a6073]', available: true },
  { id: 'check-list', title: 'CHECK LIST HERRAMIENTA', icon: Settings, color: 'from-[#36475c] to-[#232526]', available: true },
];

export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user, logout } = useAuth();

  const uid = useMemo(() => {
    const authUid = (user as any)?.uid || (user as any)?.id;
    const localUid = localStorage.getItem('usuario_id');
    return (authUid || localUid || '').toString();
  }, [user]);
  const email = useMemo(() => {
    const authEmail = (user as any)?.email;
    const localEmail = localStorage.getItem('usuario.email');
    return (authEmail || localEmail || '').toString().toLowerCase();
  }, [user]);
  const [showAssignedBanner, setShowAssignedBanner] = useState(false);
  const [assignedCount, setAssignedCount] = useState(0);
  const [showProfile, setShowProfile] = useState(false);
  const [editName, setEditName] = useState((user as any)?.name || "");
  const [editEmail, setEditEmail] = useState((user as any)?.email || "");
  const [saving, setSaving] = useState(false);

  const handleProfileSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('usuario.name', editName);
      localStorage.setItem('usuario.email', editEmail);
      setShowProfile(false);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!uid && !email) return;
    const key = `notifiedServicios:${uid || email}`;
    let notifiedSet = new Set<string>();
    try { notifiedSet = new Set<string>(JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
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
          const body = nuevos.length === 1
            ? `Se te asignó: ${nuevos[0].elemento || 'Servicio'}`
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
        const body  = payload?.notification?.body  || '';
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/bell.png' });
          }
        } catch {}
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
    else if (item.id === 'check-list') navigateTo('check-list');
    else if (item.id === 'drive') navigateTo('drive');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#181c25] via-[#202734] to-[#283046]">

      {/* Modal editar perfil */}
      {showProfile && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-voldemort-fadein">
          <div className="bg-gradient-to-b from-[#23293a] to-[#181c25] rounded-2xl shadow-voldemort w-full max-w-sm mx-auto p-7 animate-fade-in border border-[#262a39]">
            <h3 className="text-lg font-semibold mb-3 text-gray-100">Editar perfil</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre</label>
                <input
                  className="w-full border border-[#353a4d] bg-[#22283a] rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#5098fa] placeholder:text-gray-400"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Correo</label>
                <input
                  className="w-full border border-[#353a4d] bg-[#22283a] rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#5098fa] placeholder:text-gray-400"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  type="email"
                  autoComplete="off"
                  placeholder="tucorreo@empresa.com"
                />
              </div>
            </div>
            <div className="flex justify-end mt-6 gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-[#212634] text-gray-300 hover:bg-[#283047] transition"
                onClick={() => setShowProfile(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#4877b2] to-[#4e5caa] text-white font-medium shadow-voldemortglow hover:brightness-110 transition"
                onClick={handleProfileSave}
                disabled={saving}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner de asignación */}
      {showAssignedBanner && (
        <div className="sticky top-0 z-50 bg-gradient-to-r from-[#b6f0d6] to-[#94baff] border-b border-emerald-200 text-[#22444a] shadow-voldemortglow">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="text-sm font-semibold">
              ¡Tienes {assignedCount} servicio{assignedCount !== 1 ? 's' : ''} asignado{assignedCount !== 1 ? 's' : ''}!
            </span>
            <Check className="w-4 h-4 ml-auto text-emerald-600" />
          </div>
        </div>
      )}

      {/* ===== Desktop header ===== */}
      <div className="hidden md:block bg-gradient-to-r from-[#23293a] to-[#283046] shadow-voldemortglow border-b border-[#23293a]">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#385185] to-[#23293a] rounded-xl flex items-center justify-center shadow-voldemortglow overflow-hidden">
              <img
                src={labLogo}
                alt="Logo"
                className="w-8 h-8 object-contain rounded-xl drop-shadow-voldemorticon animate-lablogo-idle transition-all duration-300
                  hover:animate-lablogo-bounce hover:shadow-voldemortglow cursor-pointer select-none"
                style={{ background: "transparent" }}
                draggable={false}
              />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-gray-100 tracking-wide">Equipos y Servicios AG</h1>
              <p className="text-xs text-gray-400">Sistema de Gestión</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#385185] to-[#23293a] rounded-full flex items-center justify-center shadow">
                <User className="w-5 h-5 text-[#8ad7ff]" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-gray-100">{(user as any)?.name || "Usuario"}</span>
                  <button
                    onClick={() => {
                      setEditName((user as any)?.name || "");
                      setEditEmail((user as any)?.email || "");
                      setShowProfile(true);
                    }}
                    className="ml-1 p-1 rounded-full hover:bg-[#222e45] transition"
                    title="Editar perfil"
                  >
                    <svg className="w-4 h-4 text-[#78aaff] drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6a2.121 2.121 0 113 3l-6 6a2.121 2.121 0 01-3-3z" />
                    </svg>
                  </button>
                </div>
                <span className="text-xs text-gray-400">{(user as any)?.email}</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 bg-[#23293a] text-gray-300 rounded-lg hover:bg-[#31406c] hover:text-white transition-colors shadow"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Salir</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Mobile header ===== */}
      <div className="md:hidden sticky top-0 z-10 bg-gradient-to-r from-[#22293c]/90 to-[#23293a]/90 backdrop-blur border-b border-[#1b2231]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-gradient-to-br from-[#385185] to-[#23293a] rounded-xl flex items-center justify-center shadow overflow-hidden">
              <img
                src={labLogo}
                alt="Logo"
                className="w-7 h-7 object-contain rounded-xl drop-shadow-voldemorticon animate-lablogo-idle transition-all duration-300 select-none"
                style={{ background: "transparent" }}
                draggable={false}
              />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-gray-100 leading-none">ESE-AG</h1>
              <p className="text-[11px] text-gray-400 leading-none mt-0.5">Sistema de Gestión</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-7 h-7 bg-gradient-to-br from-[#385185] to-[#23293a] rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-[#7ac7ff]" />
              </div>
              <span className="text-xs font-medium text-gray-100 max-w-[90px] truncate">{(user as any)?.name}</span>
              <button
                onClick={() => {
                  setEditName((user as any)?.name || "");
                  setEditEmail((user as any)?.email || "");
                  setShowProfile(true);
                }}
                className="ml-1 p-1 rounded-full hover:bg-[#222e45] transition"
                title="Editar perfil"
              >
                <svg className="w-4 h-4 text-[#78aaff] drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6a2.121 2.121 0 113 3l-6 6a2.121 2.121 0 01-3-3z" />
                </svg>
              </button>
            </div>
            <button
              onClick={logout}
              className="ml-2 p-2 rounded-md bg-[#212634] text-gray-300 hover:bg-[#293148] active:scale-95 transition"
              aria-label="Salir"
              title="Salir"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Desktop grid ===== */}
      <div className="hidden md:block p-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-100 mb-8 tracking-widest drop-shadow">Menú Principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleMenuClick(item)}
                className={`
                  relative group cursor-pointer transition-all duration-300 
                  hover:scale-105 hover:brightness-110
                  ${item.available ? 'hover:shadow-voldemortcard' : 'opacity-60 cursor-not-allowed'}
                `}
              >
                <div className="bg-gradient-to-br rounded-2xl p-8 border border-[#262a39] shadow-voldemortcard
                  from-[#23293a] to-[#2c3144] group-hover:from-[#38405e] group-hover:to-[#253051] 
                  transition-all duration-300 overflow-hidden">
                  <div className="flex flex-col items-center text-center space-y-5">
                    <div className={`
                      w-20 h-20 rounded-xl flex items-center justify-center
                      shadow-xl group-hover:shadow-voldemortglow
                      bg-gradient-to-br ${item.color} transition-all duration-300
                      group-hover:ring-2 group-hover:ring-[#78aaff]
                    `}>
                      <item.icon className="w-10 h-10 text-white drop-shadow-voldemorticon transition-all duration-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-100 mb-1 tracking-wide">{item.title}</h3>
                      {!item.available && (
                        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full border border-gray-600">
                          Próximamente
                        </span>
                      )}
                    </div>
                  </div>
                  {item.available && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#78aaff1b] to-[#21293a00] opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Mobile grid ===== */}
      <div className="md:hidden p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <h2 className="text-lg font-bold text-gray-100 mb-4 tracking-widest">Menú</h2>
        <div className="grid grid-cols-2 gap-4">
          {menuItems.map((item) => (
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
              <div className="flex items-center gap-3">
                <div className={`
                  min-w-12 min-h-12 rounded-xl flex items-center justify-center shadow
                  bg-gradient-to-br ${item.color} 
                  group-hover:ring-2 group-hover:ring-[#78aaff] transition-all
                `}>
                  <item.icon className="w-6 h-6 text-white drop-shadow-voldemorticon" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-gray-100 leading-tight">{item.title}</p>
                  {!item.available && (
                    <span className="mt-0.5 inline-block text-[10px] text-gray-400">Próximamente</span>
                  )}
                </div>
              </div>
              {item.available && (
                <span className="pointer-events-none absolute right-3 top-3 inline-flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#78aaff] opacity-40"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#78aaff]"></span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Animaciones mágicas */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes voldemort-fadein { from { opacity: 0; filter: blur(8px); } to { opacity: 1; filter: blur(0); } }
        .animate-fade-in { animation: fade-in 0.25s cubic-bezier(.22,.68,.54,1.04) both; }
        .animate-voldemort-fadein { animation: voldemort-fadein 0.40s cubic-bezier(.16,.94,.54,1.04) both; }
        .shadow-voldemort { box-shadow: 0 8px 40px 0 #23293a99, 0 0px 2px 0 #387aff22; }
        .shadow-voldemortglow { box-shadow: 0 0 24px 0 #78aaff44, 0 1.5px 8px 0 #20272c55; }
        .shadow-voldemortcard { box-shadow: 0 2px 16px 0 #23293a66, 0 1px 4px 0 #20272c33; }
        .drop-shadow-voldemorticon { filter: drop-shadow(0 0 12px #78aaff33); }
        @keyframes lablogo-idle {
          0%   { filter: drop-shadow(0 0 0px #78aaff66) brightness(0.9) scale(1.12); opacity: 0; }
          20%  { opacity: 1; }
          65%  { filter: drop-shadow(0 0 16px #78aaff66) brightness(1.13) scale(1.07);}
          100% { filter: drop-shadow(0 0 10px #78aaff88) brightness(1.02) scale(1);}
        }
        @keyframes lablogo-bounce {
          0%   { transform: scale(1); filter: drop-shadow(0 0 12px #78aaff77); }
          30%  { transform: scale(1.2) rotate(-8deg); filter: drop-shadow(0 0 24px #78aaffee); }
          55%  { transform: scale(0.92) rotate(4deg); filter: drop-shadow(0 0 10px #78aaff88);}
          70%  { transform: scale(1.05); filter: drop-shadow(0 0 16px #78aaffbb);}
          100% { transform: scale(1); filter: drop-shadow(0 0 10px #78aaff88);}
        }
        .animate-lablogo-idle {
          animation: lablogo-idle 1.15s cubic-bezier(.16,1.18,.56,.94) 1 both;
          animation-delay: .06s;
        }
        .hover\\:animate-lablogo-bounce:hover {
          animation: lablogo-bounce 0.55s cubic-bezier(.18,0.78,.43,1.22) 1 both !important;
        }
      `}</style>
    </div>
  );
};
