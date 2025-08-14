/* MainMenu.tsx (versión con listener global de asignaciones) */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { 
  Calendar, 
  Hash, 
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

import { db } from '../utils/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

/** Menú original (igual) */
const menuItems = [
  { id: 'calendario', title: 'CALENDARIO', icon: Calendar, color: 'bg-blue-500', available: true },
  { id: 'consecutivos', title: 'CONSECUTIVOS', icon: Hash, color: 'bg-green-500', available: true },
  { id: 'empresas', title: 'EMPRESAS', icon: Building2, color: 'bg-indigo-500', available: true },
  { id: 'hojas-trabajo', title: 'HOJAS DE TRABAJO', icon: FileText, color: 'bg-orange-500', available: false },
  { id: 'hoja-servicio', title: 'HOJA DE SERVICIO', icon: ClipboardList, color: 'bg-purple-500', available: true },
  { id: 'normas', title: 'NORMAS', icon: BookOpen, color: 'bg-teal-500', available: true },
  { id: 'friday', title: 'FRIDAY', icon: Database, color: 'bg-emerald-500', available: true },
  { id: 'drive', title: 'DRIVE', icon: FolderKanban, color: 'bg-yellow-500', available: true },
  { id: 'procedimientos', title: 'PROCEDIMIENTOS', icon: Settings, color: 'bg-cyan-500', available: false },
  { id: 'programa-calibracion', title: 'PROGRAMA DE CALIBRACION', icon: Settings, color: 'bg-cyan-500', available: true },
  { id: 'calibration-manager', title: 'CALIBRACION MANAGER', icon: Settings, color: 'bg-cyan-500', available: true },
];

export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user, logout } = useAuth();

  // === ID del usuario para comparar asignaciones ===
  const uid = useMemo(() => {
    // Prioriza Firebase Auth
    const authUid = (user as any)?.uid || (user as any)?.id;
    const localUid = localStorage.getItem('usuario_id');
    return (authUid || localUid || '').toString();
  }, [user]);

  const email = useMemo(() => {
    const authEmail = (user as any)?.email;
    const localEmail = localStorage.getItem('usuario.email');
    return (authEmail || localEmail || '').toString().toLowerCase();
  }, [user]);

  // Banner visual
  const [showAssignedBanner, setShowAssignedBanner] = useState(false);
  const [assignedCount, setAssignedCount] = useState(0);

  // Paso 1: Pedir permiso de notificaciones al entrar a la app (una sola vez)
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // Paso 2 (global): Escuchar servicios y notificar si me asignan
  useEffect(() => {
    if (!uid && !email) return; // sin identidad no podemos comparar

    const key = `notifiedServicios:${uid || email}`;
    // inicializa memoria local
    let notifiedSet = new Set<string>();
    try {
      notifiedSet = new Set<string>(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch { /* noop */ }

    const unsub = onSnapshot(collection(db, 'servicios'), (snap) => {
      // Normaliza documentos
      const servicios = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // Filtro: asignados a mí (por uid o por email)
      const asignados = servicios.filter(s => {
        const personas = Array.isArray(s.personas) ? s.personas : [];
        const personasLower = personas.map((p: any) => (p || '').toString().toLowerCase());
        // Coincidir uid exacto o email (en minúsculas)
        return personas.includes(uid) || (email && personasLower.includes(email));
      });

      // Detectar nuevos no notificados
      const nuevos = asignados.filter(s => !notifiedSet.has(s.id));
      setAssignedCount(asignados.length);

      if (nuevos.length > 0) {
        // 1) Banner visual
        setShowAssignedBanner(true);
        setTimeout(() => setShowAssignedBanner(false), 6000);

        // 2) Notificación nativa
        if ('Notification' in window) {
          const title = 'Nuevo servicio asignado';
          const body = nuevos.length === 1
            ? `Se te asignó: ${nuevos[0].elemento || 'Servicio'}`
            : `Se te asignaron ${nuevos.length} servicios`;
          const show = () => {
            try { new Notification(title, { body, icon: '/bell.png' }); } catch { /* noop */ }
          };
          if (Notification.permission === 'granted') show();
          else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => { if (p === 'granted') show(); });
          }
        }

        // 3) Persistir para no repetir
        nuevos.forEach(s => notifiedSet.add(s.id));
        try {
          localStorage.setItem(key, JSON.stringify(Array.from(notifiedSet)));
        } catch { /* noop */ }
      } else {
        // Sin nuevos; sincroniza la lista con los asignados actuales (evita “fantasmas”)
        try {
          localStorage.setItem(key, JSON.stringify(asignados.map(s => s.id)));
        } catch { /* noop */ }
      }
    }, (err) => {
      // Para depurar rápido si hay problema de permisos / reglas
      console.error('onSnapshot servicios error:', err);
    });

    return () => unsub();
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
    else if (item.id === 'drive') navigateTo('drive');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">

      {/* Banner de asignación */}
      {showAssignedBanner && (
        <div className="sticky top-0 z-50 bg-emerald-50 border-b border-emerald-200 text-emerald-800">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="text-sm">
              ¡Tienes {assignedCount} servicio{assignedCount !== 1 ? 's' : ''} asignado{assignedCount !== 1 ? 's' : ''}!
            </span>
            <Check className="w-4 h-4 ml-auto text-emerald-600" />
          </div>
        </div>
      )}

      {/* ===== Desktop header ===== */}
      <div className="hidden md:block bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Hash className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Equipos y Servicios AG</h1>
              <p className="text-sm text-gray-500">Sistema de Gestión</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2">
              <User className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">{(user as any)?.name}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center space-x-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Salir</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Mobile header ===== */}
      <div className="md:hidden sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <Hash className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 leading-none">ESE-AG</h1>
              <p className="text-[11px] text-gray-500 leading-none mt-0.5">Sistema de Gestión</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-700 max-w-[120px] truncate">{(user as any)?.name}</span>
            </div>
            <button
              onClick={logout}
              className="ml-2 p-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 transition"
              aria-label="Salir"
              title="Salir"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Desktop grid ===== */}
      <div className="hidden md:block p-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Menú Principal</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleMenuClick(item)}
                className={`relative group cursor-pointer transition-all duration-300 transform hover:scale-105
                  ${item.available ? 'hover:shadow-xl' : 'opacity-60 cursor-not-allowed'}`}
              >
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-md">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className={`w-20 h-20 ${item.color} rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all`}>
                      <item.icon className="w-10 h-10 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">{item.title}</h3>
                      {!item.available && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                          Próximamente
                        </span>
                      )}
                    </div>
                  </div>
                  {item.available && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Mobile grid ===== */}
      <div className="md:hidden p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Menú</h2>

        <div className="grid grid-cols-2 gap-3">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item)}
              disabled={!item.available}
              className={`relative group rounded-2xl border text-left
                ${item.available ? 'bg-white active:scale-[0.99] border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}
                shadow-sm hover:shadow-md transition-all p-3`}
            >
              <div className="flex items-center gap-3">
                <div className={`min-w-12 min-h-12 ${item.color} rounded-xl flex items-center justify-center shadow`}>
                  <item.icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-gray-800 leading-tight">{item.title}</p>
                  {!item.available && (
                    <span className="mt-0.5 inline-block text-[10px] text-gray-500">Próximamente</span>
                  )}
                </div>
              </div>
              {item.available && (
                <span className="pointer-events-none absolute right-3 top-3 inline-flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-30"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
