import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  Calendar, Building2, ClipboardList, BookOpen, Database, FolderKanban,
  Bell, TrendingUp, X, ChevronRight, Activity, Award,
  ArrowRightLeft, FileOutput, LogOut, User, CheckCircle2,
  AlertTriangle, Briefcase, MapPin, Clock, Search, Loader2,
  FileText, Users, History, Palette, LayoutGrid, AlignLeft, Check,
  Info, AlertCircle, Send, Megaphone, Trash2,
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { db, storage } from '../utils/firebase';
import {
  collection, onSnapshot, doc, setDoc, getDoc, query, where, getDocs,
  orderBy, serverTimestamp, limit, Timestamp, addDoc, deleteDoc,
  updateDoc, arrayUnion,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, updateProfile } from 'firebase/auth';
import {
  addYears, addMonths, differenceInDays, parseISO, isValid,
  format, isToday, parse, isWithinInterval, addHours,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { autoStartServiciosIfDue } from '../utils/servicioAutomation';
import { isUserOnline } from '../hooks/usePresence';

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface Service {
  id: string; cliente: string; titulo?: string; descripcion?: string;
  prioridad?: 'alta' | 'critica' | 'normal' | 'baja'; fecha?: string;
  horaInicio?: string; horaFin?: string; ubicacion?: string;
  tipo?: string; estado?: string; personas?: string[];
}

interface UserData {
  uid: string; email: string; name: string; role: string;
  photoUrl?: string; phone?: string;
}

interface UserPrefs {
  themeMode: 'dark' | 'light';
  accentColor: string;
  viewMode: 'grid' | 'list';
}

interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string; body: string; read: boolean;
  timestamp: Timestamp | null;
  autorNombre?: string; autorUid?: string;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const DEFAULT_PREFS: UserPrefs = { themeMode: 'dark', accentColor: '#3b82f6', viewMode: 'grid' };

const PRESET_COLORS = [
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#8b5cf6', label: 'Violeta' },
  { hex: '#10b981', label: 'Esmeralda' },
  { hex: '#f59e0b', label: 'Ámbar' },
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#84cc16', label: 'Lima' },
  { hex: '#d946ef', label: 'Fucsia' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#6366f1', label: 'Índigo' },
];

const MENU_ITEMS = [
  { id: 'friday', title: 'Friday Projects', icon: Activity, category: 'Gestión' },
  { id: 'friday-servicios', title: 'Servicios', icon: Briefcase, category: 'Operativo' },
  { id: 'hoja-servicio', title: 'Hoja de Servicio', icon: ClipboardList, category: 'Operativo' },
  { id: 'directorio-empresas', title: 'Historial Equipos', icon: History, category: 'Análisis' },
  { id: 'permisos-trabajo', title: 'Permisos TR', icon: FileText, category: 'Operativo' },
  { id: 'calendario', title: 'Calendario', icon: Calendar, category: 'Gestión' },
  { id: 'consecutivos', title: 'Consecutivos', icon: Database, category: 'Técnico' },
  { id: 'formatos', title: 'Formatos Máster', icon: FileText, category: 'Calidad' },
  { id: 'drive', title: 'Drive', icon: FolderKanban, category: 'Archivos' },
  { id: 'empresas', title: 'Empresas', icon: Building2, category: 'Gestión' },
  { id: 'calibration-stats', title: 'Estadísticas', icon: TrendingUp, category: 'Análisis' },
  { id: 'normas', title: 'Hoja de Herramienta', icon: BookOpen, category: 'Técnico' },
  { id: 'entrada-salida', title: 'Hoja de Salida', icon: FileOutput, category: 'Logística' },
  { id: 'programa-calibracion', title: 'Patrones', icon: Award, category: 'Técnico' },
  { id: 'control-prestamos', title: 'Préstamos', icon: ArrowRightLeft, category: 'Logística' },
  { id: 'vencimientos', title: 'Vencimientos', icon: Bell, category: 'Análisis' },
];

const SUPER_ADMINS = ['jesus.sustaita@agsolutions.com', 'admin@agsolutions.com'];
const safeDateParse = (d?: string) => { if (!d) return null; const p = parseISO(d); return isValid(p) ? p : null; };

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
};

// ─── APLICAR TEMA AL DOM ──────────────────────────────────────────────────────
const applyTheme = (prefs: UserPrefs) => {
  const root = document.documentElement;
  root.style.setProperty('--acc', prefs.accentColor);
  root.style.setProperty('--acc-rgb', hexToRgb(prefs.accentColor));
  if (prefs.themeMode === 'dark') {
    root.style.setProperty('--bg', '#030712');
    root.style.setProperty('--surface', '#0f172a');
    root.style.setProperty('--surface-hi', '#1e293b');
    root.style.setProperty('--border-color', 'rgba(255,255,255,0.07)');
    root.style.setProperty('--text', '#f1f5f9');
    root.style.setProperty('--text-muted', '#94a3b8');
    root.style.setProperty('--text-faint', '#334155');
    root.style.setProperty('--header', 'rgba(3,7,18,0.85)');
  } else {
    root.style.setProperty('--bg', '#f8fafc');
    root.style.setProperty('--surface', '#ffffff');
    root.style.setProperty('--surface-hi', '#f1f5f9');
    root.style.setProperty('--border-color', 'rgba(0,0,0,0.09)');
    root.style.setProperty('--text', '#0f172a');
    root.style.setProperty('--text-muted', '#64748b');
    root.style.setProperty('--text-faint', '#cbd5e1');
    root.style.setProperty('--header', 'rgba(248,250,252,0.90)');
  }
};

// ─── CSS GLOBAL ───────────────────────────────────────────────────────────────
const ThemeStyle = () => (
  <style>{`
    :root {
      --acc: #3b82f6; --acc-rgb: 59 130 246;
      --bg: #030712; --surface: #0f172a; --surface-hi: #1e293b;
      --border-color: rgba(255,255,255,0.07);
      --text: #f1f5f9; --text-muted: #94a3b8; --text-faint: #334155;
      --header: rgba(3,7,18,0.85);
    }
    * { box-sizing: border-box; }
    .ag-bg { background: var(--bg); }
    .ag-surface { background: var(--surface); }
    .ag-surface-hi { background: var(--surface-hi); }
    .ag-border { border-color: var(--border-color); }
    .ag-text { color: var(--text); }
    .ag-muted { color: var(--text-muted); }
    .ag-faint { color: var(--text-faint); }
    .ag-card { background: var(--surface); border-color: var(--border-color); }
    .ag-input { background: var(--surface-hi); border-color: var(--border-color); color: var(--text); }
    .ag-input::placeholder { color: var(--text-faint); }
    .ag-input:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(var(--acc-rgb)/0.15); }
    .ag-badge { background: var(--surface-hi); color: var(--text-muted); }
    .ag-header { background: var(--header); border-color: var(--border-color); backdrop-filter: blur(16px); }
    .acc { background: var(--acc); }
    .acc-text { color: var(--acc); }
    .acc-border { border-color: var(--acc); }
    .acc-soft { background: rgba(var(--acc-rgb)/0.12); }
    .acc-ring:focus { outline: none; border-color: var(--acc); box-shadow: 0 0 0 3px rgba(var(--acc-rgb)/0.18); }
    .acc-hover:hover { background: rgba(var(--acc-rgb)/0.10); }
    .card-interact { transition: all 0.18s ease; }
    .card-interact:hover { border-color: rgba(var(--acc-rgb)/0.4) !important; }
    .card-interact:hover .ci-icon { color: var(--acc); }
    .cs::-webkit-scrollbar { width: 4px; }
    .cs::-webkit-scrollbar-thumb { background: var(--surface-hi); border-radius: 4px; }
    .cs::-webkit-scrollbar-track { background: transparent; }
    textarea { font-family: inherit; }
    button:focus-visible, a:focus-visible, [role="button"]:focus-visible, input:focus-visible {
      outline: 2px solid var(--acc); outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `}</style>
);

const CATEGORY_ORDER = ['Operativo', 'Gestión', 'Técnico', 'Calidad', 'Análisis', 'Archivos', 'Logística'];

const groupMenuByCategory = (items: typeof MENU_ITEMS) => {
  const map = new Map<string, typeof MENU_ITEMS>();
  items.forEach(item => {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  });
  return CATEGORY_ORDER
    .filter(cat => map.has(cat))
    .map(category => ({ category, items: map.get(category)! }));
};

// ─── HOOK: PREFERENCIAS POR USUARIO EN FIRESTORE ──────────────────────────────
const useUserPrefs = (uid: string | undefined) => {
  const [prefs, setPrefsLocal] = useState<UserPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    getDoc(doc(db, 'userPrefs', uid)).then(snap => {
      const merged = snap.exists() ? { ...DEFAULT_PREFS, ...snap.data() as Partial<UserPrefs> } : DEFAULT_PREFS;
      setPrefsLocal(merged);
      applyTheme(merged);
    }).catch(() => applyTheme(DEFAULT_PREFS)).finally(() => setLoading(false));
  }, [uid]);

  const setPrefs = useCallback(async (update: Partial<UserPrefs>) => {
    setPrefsLocal(prev => {
      const next = { ...prev, ...update };
      applyTheme(next);
      return next;
    });
    if (!uid) return;
    try { await setDoc(doc(db, 'userPrefs', uid), update, { merge: true }); }
    catch (e) { console.error('Error guardando prefs:', e); }
  }, [uid]);

  return { prefs, setPrefs, loading };
};

// ─── PANEL DE NOTIFICACIONES ──────────────────────────────────────────────────
const NotificationPanel = ({ notifications, onClose, onMarkRead, onDelete, canBroadcast, uid }: {
  notifications: AppNotification[]; onClose: () => void;
  onMarkRead: (id: string) => void; onDelete: (id: string) => void;
  canBroadcast: boolean; uid: string;
}) => {
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<AppNotification['type']>('info');
  const [sending, setSending] = useState(false);

  const typeConfig = {
    info:    { icon: Info,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    label: 'Info' },
    warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  label: 'Aviso' },
    success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'OK' },
    error:   { icon: AlertCircle,  color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    label: 'Urgente' },
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Completa título y mensaje'); return; }
    setSending(true);
    try {
      const usersSnap = await getDocs(collection(db, 'usuarios'));
      const allUids = usersSnap.docs.map(d => d.id);
      
      // Recolectar todos los tokens de FCM
      const tokens: string[] = [];
      usersSnap.docs.forEach(d => {
        const userData = d.data();
        if (userData.fcmTokens && typeof userData.fcmTokens === 'object') {
          Object.keys(userData.fcmTokens).forEach(t => { if (t && !tokens.includes(t)) tokens.push(t); });
        } else if (userData.fcmToken && typeof userData.fcmToken === 'string') {
          if (!tokens.includes(userData.fcmToken)) tokens.push(userData.fcmToken);
        }
      });

      const autorSnap = await getDoc(doc(db, 'usuarios', uid));
      const autorNombre = autorSnap.exists() ? (autorSnap.data().name || 'Calidad') : 'Calidad';

      // 1. Guardar en Firestore
      await addDoc(collection(db, 'notificaciones'), {
        type, title: title.trim(), body: body.trim(),
        autorUid: uid, autorNombre,
        readBy: [], destinatarios: allUids,
        timestamp: serverTimestamp(), global: true,
      });

      // 2. Enviar Push Notification (FCM)
      const serverKey = import.meta.env.VITE_FCM_SERVER_KEY as string | undefined;
      if (serverKey && tokens.length > 0) {
        const iconos: Record<string, string> = { info: '💡', warning: '⚠️', success: '✅', error: '🚨' };
        const emoji = iconos[type] || '📢';
        const color = type === 'error' ? '#E11D48' : type === 'success' ? '#10B981' : type === 'warning' ? '#F59E0B' : '#3B82F6';

        const chunks: string[][] = [];
        for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

        await Promise.allSettled(chunks.map(chunk => 
          fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `key=${serverKey}` },
            body: JSON.stringify({
              registration_ids: chunk,
              notification: {
                title: `${emoji} ${title.trim()}`,
                body: body.trim(),
                icon: '/bell.png',
              },
              data: { url: '/', type: 'aviso_global' },
              android: {
                priority: 'high',
                notification: {
                  color: color,
                  channel_id: 'ag_avisos',
                  visibility: 'public', // ESTO ES CLAVE para la pantalla de bloqueo
                  default_sound: true,
                  default_vibrate_timings: true,
                }
              }
            })
          })
        ));
      }

      toast.success('¡Aviso enviado a todos!');
      setTitle(''); setBody(''); setType('info'); setShowCompose(false);
    } catch (e) { 
      console.error(e);
      toast.error('Error al enviar'); 
    }
    setSending(false);
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.15 }}
      className="absolute right-0 top-12 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl shadow-2xl border z-50 overflow-hidden ag-card"
      onClick={e => e.stopPropagation()}
      role="dialog"
      aria-label="Notificaciones"
      style={{ borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3.5 border-b ag-border">
        <Bell className="w-4 h-4 acc-text flex-shrink-0" />
        <span className="font-semibold text-sm ag-text flex-1">Notificaciones</span>
        {unread > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full acc text-white">{unread}</span>}
        {canBroadcast && (
          <button onClick={() => setShowCompose(v => !v)}
            className={`p-1.5 rounded-lg transition-all ${showCompose ? 'acc text-white' : 'acc-soft acc-text'}`}
            title="Enviar aviso a todos"
          >
            <Megaphone size={13} />
          </button>
        )}
        <button onClick={onClose} aria-label="Cerrar notificaciones" className="p-1 ag-muted hover:ag-text transition-colors"><X size={15} /></button>
      </div>

      {/* Compose */}
      <AnimatePresence>
        {showCompose && canBroadcast && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="border-b ag-border overflow-hidden"
          >
            <div className="p-3 space-y-2.5 ag-surface-hi">
              <p className="text-[10px] font-bold uppercase tracking-wider acc-text flex items-center gap-1">
                <Megaphone size={10} /> Enviar aviso a todos los usuarios
              </p>
              {/* Tipo de notificación */}
              <div className="grid grid-cols-4 gap-1">
                {(Object.keys(typeConfig) as AppNotification['type'][]).map(t => {
                  const cfg = typeConfig[t];
                  return (
                    <button key={t} onClick={() => setType(t)}
                      className={`text-[10px] py-1.5 rounded-lg border font-semibold transition-all ${
                        type === t ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'ag-surface ag-border ag-faint'
                      }`}
                    >{cfg.label}</button>
                  );
                })}
              </div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del aviso..."
                className="w-full px-3 py-2 rounded-xl border text-sm ag-input acc-ring" />
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Escribe el mensaje..." rows={3}
                className="w-full px-3 py-2 rounded-xl border text-sm ag-input acc-ring resize-none" />
              <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-white acc hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {sending ? <Loader2 className="animate-spin w-4 h-4" /> : <Send size={13} />}
                {sending ? 'Enviando...' : 'Enviar a todos'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista */}
      <div className="max-h-72 overflow-y-auto cs">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 ag-faint">
            <Bell className="w-8 h-8 opacity-20 mb-2" />
            <span className="text-xs ag-muted">Sin notificaciones</span>
          </div>
        ) : notifications.map(n => {
          const cfg = typeConfig[n.type] || typeConfig.info;
          const Icon = cfg.icon;
          return (
            <div key={n.id} onClick={() => onMarkRead(n.id)}
              className={`group flex gap-3 p-3 border-b ag-border cursor-pointer transition-all ${n.read ? 'opacity-50 hover:opacity-80' : 'ag-surface-hi'}`}
            >
              <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 border ${cfg.bg} ${cfg.border}`}>
                <Icon className={`w-3 h-3 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold ag-text truncate">{n.title}</p>
                <p className="text-[11px] ag-muted mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                <div className="flex items-center gap-2 mt-1">
                  {n.timestamp && (
                    <p className="text-[10px] ag-faint">
                      {format((n.timestamp as Timestamp).toDate?.() ?? new Date(), 'dd MMM · HH:mm', { locale: es })}
                    </p>
                  )}
                  {n.autorNombre && <p className="text-[10px] ag-faint">· {n.autorNombre}</p>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {!n.read && <div className="w-2 h-2 rounded-full acc mt-1" />}
                {canBroadcast && (
                  <button onClick={e => { e.stopPropagation(); onDelete(n.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-rose-400 hover:bg-rose-500/10 transition-all"
                  ><Trash2 size={11} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

// ─── SELECTOR DE TEMA ─────────────────────────────────────────────────────────
const ThemeSelector = ({ prefs, setPrefs, onClose }: {
  prefs: UserPrefs; setPrefs: (p: Partial<UserPrefs>) => void; onClose: () => void;
}) => {
  const colorRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState(prefs.accentColor);

  const pick = (hex: string) => {
    setCustom(hex);
    setPrefs({ accentColor: hex });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.15 }}
      className="absolute right-0 top-12 w-[min(16rem,calc(100vw-1.5rem))] rounded-2xl shadow-2xl border z-50 overflow-hidden ag-card"
      style={{ borderColor: 'var(--border-color)' }}
      onClick={e => e.stopPropagation()}
      role="dialog"
      aria-label="Personalización"
    >
      <div className="flex items-center justify-between p-3.5 border-b ag-border">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 acc-text" />
          <span className="font-semibold text-sm ag-text">Mi Personalización</span>
        </div>
        <button onClick={onClose} aria-label="Cerrar personalización" className="ag-muted p-1 rounded-lg hover:ag-surface-hi transition-colors"><X size={14} /></button>
      </div>

      <div className="p-3.5 space-y-4">
        {/* Modo */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider ag-muted mb-2">Modo</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['dark', 'light'] as const).map(mode => (
              <button key={mode} onClick={() => setPrefs({ themeMode: mode })}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  prefs.themeMode === mode ? 'acc text-white border-transparent' : 'ag-surface-hi ag-border ag-muted hover:opacity-80'
                }`}
              >{mode === 'dark' ? '🌙 Oscuro' : '☀️ Claro'}</button>
            ))}
          </div>
        </div>

        {/* Color de acento */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider ag-muted mb-2">Color de acento</p>
          <div className="grid grid-cols-6 gap-1.5 mb-2.5">
            {PRESET_COLORS.map(({ hex, label }) => (
              <button key={hex} title={label} onClick={() => pick(hex)}
                className="relative w-8 h-8 rounded-lg transition-transform hover:scale-110 active:scale-95 border-2"
                style={{
                  backgroundColor: hex,
                  borderColor: prefs.accentColor === hex ? 'white' : 'transparent',
                  boxShadow: prefs.accentColor === hex ? `0 0 0 1px ${hex}` : 'none',
                }}
              >
                {prefs.accentColor === hex && <Check className="w-3 h-3 text-white absolute inset-0 m-auto" strokeWidth={3} />}
              </button>
            ))}
          </div>

          {/* Picker libre */}
          <button
            onClick={() => colorRef.current?.click()}
            className="w-full flex items-center gap-2 p-2.5 rounded-xl border ag-border ag-surface-hi acc-hover transition-all"
          >
            <div className="w-5 h-5 rounded-lg border ag-border flex-shrink-0" style={{ backgroundColor: custom }} />
            <span className="text-xs ag-muted flex-1 text-left">Personalizado</span>
            <span className="text-[10px] font-mono ag-faint">{custom.toUpperCase()}</span>
            <input ref={colorRef} type="color" value={custom} onChange={e => pick(e.target.value)} className="sr-only" />
          </button>
        </div>

        {/* Preview */}
        <div className="p-2.5 rounded-xl border ag-border">
          <p className="text-[10px] ag-faint mb-2">Vista previa</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full" style={{ background: `linear-gradient(to right, var(--acc), rgba(var(--acc-rgb)/0.4))` }} />
            <span className="text-[11px] px-2.5 py-1 rounded-lg text-white font-semibold" style={{ backgroundColor: 'var(--acc)' }}>Botón</span>
          </div>
        </div>

        <p className="text-[10px] ag-muted text-center">
          Esta preferencia es solo tuya 🎨
        </p>
      </div>
    </motion.div>
  );
};

// ─── WIDGETS ──────────────────────────────────────────────────────────────────
const PatronesWidget = ({ navigateTo }: { navigateTo: any }) => {
  const [stats, setStats] = useState({ vigentes: 0, vencidos: 0, mantenimiento: 0, loading: true });
  useEffect(() => {
    let m = true;
    getDocs(collection(db, 'patronesCalibracion')).then(snap => {
      if (!m) return;
      let v = 0, x = 0, t = 0;
      const hoy = new Date();
      snap.forEach(d => {
        const data = d.data();
        if (['en_mantenimiento', 'fuera_servicio', 'con_falla'].includes(data.estadoProceso)) { t++; return; }
        const f = data.fechaVencimiento || data.fecha;
        const p = f ? parseISO(f) : null;
        if (p && isValid(p) && differenceInDays(p, hoy) < 0) x++; else v++;
      });
      setStats({ vigentes: v, vencidos: x, mantenimiento: t, loading: false });
    }).catch(() => { if (m) setStats(p => ({ ...p, loading: false })); });
    return () => { m = false; };
  }, []);
  if (stats.loading) return <div className="h-28 rounded-2xl border ag-border animate-pulse ag-surface" />;
  return (
    <div className="rounded-2xl border ag-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2 ag-text">
          <Award className="w-4 h-4 acc-text" />Patrones Internos
        </h3>
        {stats.vencidos === 0 && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">✓ Al Día</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: stats.vigentes, l: 'Vigentes', c: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          { n: stats.vencidos, l: 'Vencidos', c: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
          { n: stats.mantenimiento, l: 'Taller', c: 'ag-muted', bg: 'ag-surface-hi ag-border' },
        ].map(({ n, l, c, bg }) => (
          <button key={l} onClick={() => navigateTo('programa-calibracion')}
            className={`flex flex-col items-center py-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 ${bg}`}
          >
            <span className={`text-2xl font-bold ${c}`}>{n}</span>
            <span className={`text-[10px] uppercase font-semibold mt-0.5 ${c} opacity-80`}>{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const TECH_ROLE_KEYS = ['metrologo', 'metrólogo', 'tecnico', 'técnico', 'ingeniero'];

const isTechnicianUser = (u: { position?: string; puesto?: string; role?: string }) =>
  TECH_ROLE_KEYS.some(k => (u.position || u.puesto || u.role || '').toLowerCase().includes(k));

const findActiveService = (techId: string, serviciosHoy: Service[], ahora: Date) =>
  serviciosHoy.find(sv => {
    if (!sv.personas?.includes(techId)) return false;
    const st = (sv.estado || '').toLowerCase();
    if (st === 'en_proceso') return true;
    if (!sv.horaInicio || ['finalizado', 'cancelado'].includes(st)) return false;
    const hi = parse(sv.horaInicio, 'HH:mm', new Date());
    const hf = sv.horaFin ? parse(sv.horaFin, 'HH:mm', new Date()) : addHours(hi, 2);
    return isWithinInterval(ahora, { start: hi, end: hf });
  });

const mapTechnicianPresence = (tecnicos: any[], serviciosHoy: Service[]) => {
  const ahora = new Date();
  return tecnicos.map(tech => {
    const active = findActiveService(tech.id, serviciosHoy, ahora);
    if (active) {
      return {
        ...tech,
        status: 'En proceso',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        detail: active.cliente || active.titulo || 'Servicio activo',
        dot: 'bg-amber-500',
      };
    }
    if (isUserOnline(tech.lastActive, ahora)) {
      return {
        ...tech,
        status: 'Conectado',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        detail: 'En la app',
        dot: 'bg-emerald-500',
      };
    }
    return {
      ...tech,
      status: 'Ausente',
      color: 'ag-muted',
      bg: '',
      detail: 'Fuera de la app',
      dot: 'bg-slate-500',
    };
  });
};

const TechnicianStatusWidget = () => {
  const [techs, setTechs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let usersRaw: any[] = [];
    let serviciosHoy: Service[] = [];
    let hasUsers = false;

    const recompute = () => {
      if (!hasUsers) return;
      const tecnicos = usersRaw.filter(isTechnicianUser);
      setTechs(mapTechnicianPresence(tecnicos, serviciosHoy));
      setLoading(false);
    };

    const hoyStr = format(new Date(), 'yyyy-MM-dd');
    const unsubUsers = onSnapshot(
      collection(db, 'usuarios'),
      snap => {
        usersRaw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        hasUsers = true;
        recompute();
      },
      () => setLoading(false)
    );

    const unsubServicios = onSnapshot(
      query(collection(db, 'servicios'), where('fecha', '==', hoyStr)),
      snap => {
        serviciosHoy = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service));
        recompute();
      },
      () => setLoading(false)
    );

    return () => {
      unsubUsers();
      unsubServicios();
    };
  }, []);
  if (loading) return <div className="h-40 rounded-2xl border ag-border animate-pulse ag-surface" />;
  return (
    <div className="rounded-2xl border ag-card overflow-hidden">
      <div className="p-3 border-b ag-border flex items-center gap-2">
        <Users className="w-4 h-4 acc-text" />
        <span className="font-semibold text-sm ag-text">Personal</span>
        <span className="text-[10px] ml-auto ag-faint">{techs.length} técnicos</span>
      </div>
      <div className="p-2 space-y-1.5 max-h-52 overflow-y-auto cs">
        {techs.length === 0 ? <p className="text-xs text-center py-4 ag-faint">Sin técnicos</p>
          : techs.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border ag-border">
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center ag-surface-hi">
                  {t.photoUrl ? <img src={t.photoUrl} className="w-full h-full object-cover" /> : <User className="w-4 h-4 ag-muted" />}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-transparent ${t.dot}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold ag-text truncate">{t.name || 'Técnico'}</p>
                <p className="text-[10px] ag-muted truncate">{t.detail}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg} ${t.color}`}>{t.status}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

const ServicesWidget = ({ services, navigateTo, loading }: { services: Service[]; navigateTo: any; loading: boolean }) => (
  <div className="rounded-2xl border ag-card flex flex-col overflow-hidden h-full">
    <div className="p-3 border-b ag-border flex items-center gap-2">
      <Briefcase className="w-4 h-4 acc-text" />
      <span className="font-semibold text-sm ag-text">Mis Asignaciones</span>
      <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ag-badge">{services.length}</span>
    </div>
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 cs">
      {loading ? [1,2].map(i => <div key={i} className="h-16 rounded-xl animate-pulse ag-surface-hi" />)
        : services.length === 0
          ? <div className="flex flex-col items-center justify-center h-28 gap-2 ag-faint">
              <CheckCircle2 className="w-7 h-7 opacity-30" /><span className="text-xs">Sin pendientes este mes</span>
            </div>
          : services.map(s => {
              const fechaDate = safeDateParse(s.fecha);
              const esHoy = fechaDate ? isToday(fechaDate) : false;
              const st = (s.estado || '').toLowerCase();
              const esTerminado = ['finalizado', 'cancelado'].includes(st);
              const esUrgente = s.prioridad === 'alta' || s.prioridad === 'critica';
              return (
                <div key={s.id} onClick={() => {
                  localStorage.setItem('open_servicio_id', s.id);
                  navigateTo('friday-servicios');
                }}
                  className={`p-3 rounded-xl border ag-border cursor-pointer transition-all card-interact ${esTerminado ? 'opacity-50 hover:opacity-80' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                      esTerminado ? st === 'finalizado' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                        : esHoy ? 'acc text-white' : 'ag-badge'
                    }`}>
                      {esTerminado ? st : esHoy ? 'HOY' : fechaDate ? format(fechaDate, 'dd MMM', { locale: es }) : 'PENDIENTE'}
                    </span>
                    {!esTerminado && esUrgente && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                  </div>
                  <h4 className="font-medium text-sm ag-text truncate">{s.cliente || 'Sin cliente'}</h4>
                  <p className="text-xs ag-muted truncate mt-0.5">{s.titulo || s.descripcion || 'Servicio'}</p>
                  {s.horaInicio && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] ag-faint">
                      <Clock className="w-3 h-3" /><span>{s.horaInicio}</span>
                      {s.ubicacion && <><span className="mx-1">·</span><MapPin className="w-3 h-3" /><span className="truncate max-w-[90px]">{s.ubicacion}</span></>}
                    </div>
                  )}
                </div>
              );
            })}
    </div>
  </div>
);

const KpiWidget = ({ navigateTo }: { navigateTo: any }) => {
  const [stats, setStats] = useState({ vencidos: 0, criticos: 0, proximos: 0, loading: true });
  useEffect(() => {
    let m = true;
    const calc = (f: string, fr: string): Date | null => {
      if (!f || !fr) return null;
      try {
        const b = parseISO(f); if (!isValid(b)) return null;
        const s = fr.toLowerCase();
        if (s.includes('1 año')) return addYears(b, 1);
        if (s.includes('2 años')) return addYears(b, 2);
        if (s.includes('3 años')) return addYears(b, 3);
        if (s.includes('3 meses')) return addMonths(b, 3);
        if (s.includes('6 meses')) return addMonths(b, 6);
        return addYears(b, 1);
      } catch { return null; }
    };
    getDocs(query(collection(db, 'hojasDeTrabajo'), orderBy('fecha', 'desc'))).then(snap => {
      if (!m) return;
      let v = 0, c = 0, p = 0;
      const hoy = new Date(); const seen = new Set<string>();
      snap.forEach(d => {
        const data = d.data();
        const id = String(data.id || data.certificado || '').trim();
        if (id && seen.has(id)) return; if (id) seen.add(id);
        const fv = calc(data.fecha, data.frecuenciaCalibracion);
        if (fv) { const dias = differenceInDays(fv, hoy); if (dias < 0) v++; else if (dias <= 30) c++; else if (dias <= 60) p++; }
      });
      setStats({ vencidos: v, criticos: c, proximos: p, loading: false });
    }).catch(() => { if (m) setStats(p => ({ ...p, loading: false })); });
    return () => { m = false; };
  }, []);
  if (stats.loading) return <div className="h-28 rounded-2xl border ag-border animate-pulse ag-surface" />;
  return (
    <div className="rounded-2xl border ag-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2 ag-text">
          <Activity className="w-4 h-4 acc-text" />Estado de Equipos
        </h3>
        {stats.vencidos === 0 && stats.criticos === 0 &&
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">✓ Normal</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: stats.vencidos, l: 'Vencidos', c: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
          { n: stats.criticos, l: 'Críticos', c: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
          { n: stats.proximos, l: 'Próximos', c: 'acc-text', bg: 'acc-soft ag-border' },
        ].map(({ n, l, c, bg }) => (
          <button key={l} onClick={() => navigateTo('vencimientos')}
            className={`flex flex-col items-center py-2.5 rounded-xl border transition-all hover:scale-105 active:scale-95 ${bg}`}
          >
            <span className={`text-2xl font-bold ${c}`}>{n}</span>
            <span className={`text-[10px] uppercase font-semibold mt-0.5 ${c} opacity-80`}>{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── MODAL PERFIL ─────────────────────────────────────────────────────────────
const ProfileModal = ({ currentUser, onClose, onUpdate }: {
  currentUser: UserData; onClose: () => void; onUpdate: (d: Partial<UserData>) => void;
}) => {
  const { uid, name, email, phone, role, photoUrl: initPhoto } = currentUser;
  const [localName, setLocalName] = useState(name || '');
  const [localPhone, setLocalPhone] = useState(phone || '');
  const [localPosition, setLocalPosition] = useState(role || '');
  const [localPhotoUrl, setLocalPhotoUrl] = useState(initPhoto || '');
  const [localPhotoFile, setLocalPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!uid) { toast.error('ID de usuario no detectado'); return; }
    setSaving(true);
    try {
      let newPhoto = localPhotoUrl;
      if (localPhotoFile) {
        const ref = storageRef(storage, `usuarios_fotos/${uid}.jpg`);
        await uploadBytes(ref, localPhotoFile);
        newPhoto = await getDownloadURL(ref);
      }
      await setDoc(doc(db, 'usuarios', uid), { name: localName, phone: localPhone, position: localPosition, photoUrl: newPhoto }, { merge: true });
      const auth = getAuth();
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: localName, photoURL: newPhoto });
      onUpdate({ name: localName, photoUrl: newPhoto, phone: localPhone, role: localPosition });
      toast.success('¡Perfil actualizado!');
      setSaving(false); onClose();
    } catch (e: any) { toast.error('Error: ' + (e.message || 'Revisa permisos')); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"
        className="w-full max-w-sm rounded-3xl shadow-2xl border overflow-hidden ag-card" style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center justify-between p-5 border-b ag-border">
          <h3 id="profile-modal-title" className="text-base font-bold ag-text">Editar Perfil</h3>
          <button onClick={onClose} className="ag-muted"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 ag-border">
                {localPhotoUrl ? <img src={localPhotoUrl} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center ag-surface-hi"><User className="w-8 h-8 ag-muted" /></div>}
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-medium text-white">Cambiar</span>
              </div>
            </div>
            <input type="file" ref={fileRef}
              onChange={e => { if (e.target.files?.[0]) { setLocalPhotoFile(e.target.files[0]); setLocalPhotoUrl(URL.createObjectURL(e.target.files[0])); } }}
              accept="image/*" className="hidden" />
          </div>
          {[
            { label: 'Nombre', value: localName, set: setLocalName },
            { label: 'Puesto', value: localPosition, set: setLocalPosition },
            { label: 'Teléfono', value: localPhone, set: setLocalPhone },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="text-[11px] font-bold uppercase tracking-wide ag-muted mb-1 block">{label}</label>
              <input value={value} onChange={e => set(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm ag-input acc-ring" />
            </div>
          ))}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide ag-muted mb-1 block">Email</label>
            <input disabled value={email} className="w-full px-3 py-2.5 rounded-xl border text-sm ag-input opacity-50 cursor-not-allowed" />
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t ag-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border ag-border ag-muted text-sm font-medium hover:ag-surface-hi transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 acc hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving && <Loader2 className="animate-spin w-4 h-4" />}{saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

type MenuItem = (typeof MENU_ITEMS)[number];

const activateMenuItem = (
  e: React.KeyboardEvent,
  isDisabled: boolean,
  onActivate: () => void,
) => {
  if (isDisabled) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onActivate();
  }
};

const MenuGridCard = ({
  item, index, isDisabled, onNavigate, hideCategory,
}: { item: MenuItem; index: number; isDisabled: boolean; onNavigate: (id: string) => void; hideCategory?: boolean }) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025 }}
    whileHover={isDisabled ? {} : { y: -3 }} whileTap={isDisabled ? {} : { scale: 0.97 }}
    role="button"
    tabIndex={isDisabled ? -1 : 0}
    aria-disabled={isDisabled}
    aria-label={isDisabled ? `${item.title} (próximamente)` : item.title}
    onClick={() => !isDisabled && onNavigate(item.id)}
    onKeyDown={e => activateMenuItem(e, isDisabled, () => onNavigate(item.id))}
    className={`group relative rounded-2xl border p-4 cursor-pointer card-interact ag-card overflow-hidden
      ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
    `}
  >
    {isDisabled && (
      <span className="absolute top-2 right-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ag-badge">Pronto</span>
    )}
    {!isDisabled && (
      <motion.div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ background: `radial-gradient(circle at 20% 80%, rgba(var(--acc-rgb)/0.08) 0%, transparent 60%)` }} />
    )}
    <motion.div className="relative z-10 flex flex-col h-full gap-3">
      <div className="p-2.5 rounded-xl w-fit ag-surface-hi transition-colors group-hover:acc-soft">
        <item.icon className="w-5 h-5 ag-muted ci-icon transition-colors" />
      </div>
      <div>
        <h3 className="text-sm font-semibold ag-text leading-tight">{item.title}</h3>
        {!hideCategory && (
          <span className="text-[10px] uppercase font-bold tracking-wide ag-faint mt-0.5 block">{item.category}</span>
        )}
      </div>
    </motion.div>
  </motion.div>
);

const MenuListRow = ({
  item, index, isDisabled, onNavigate,
}: { item: MenuItem; index: number; isDisabled: boolean; onNavigate: (id: string) => void }) => (
  <motion.div
    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.015 }}
    whileTap={isDisabled ? {} : { scale: 0.99 }}
    role="button"
    tabIndex={isDisabled ? -1 : 0}
    aria-disabled={isDisabled}
    aria-label={isDisabled ? `${item.title} (próximamente)` : item.title}
    onClick={() => !isDisabled && onNavigate(item.id)}
    onKeyDown={e => activateMenuItem(e, isDisabled, () => onNavigate(item.id))}
    className={`group flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer card-interact ag-card
      ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
    `}
  >
    <div className="p-2 rounded-lg ag-surface-hi group-hover:acc-soft transition-colors">
      <item.icon className="w-4 h-4 ag-muted ci-icon transition-colors" />
    </div>
    <span className="flex-1 text-sm font-medium ag-text">{item.title}</span>
    <span className="text-[10px] uppercase font-bold ag-faint hidden sm:inline">{item.category}</span>
    {!isDisabled && <ChevronRight className="w-4 h-4 ag-faint group-hover:acc-text transition-colors opacity-60 group-hover:opacity-100 flex-shrink-0" />}
  </motion.div>
);

export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { logout, user } = useAuth();
  const [localUser, setLocalUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [assignedServices, setAssignedServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const uid   = (user as any)?.uid   || (user as any)?.id    || '';
  const email = (user as any)?.email || '';

  const { prefs, setPrefs, loading: loadingPrefs } = useUserPrefs(uid);
  const viewMode = prefs.viewMode;
  const setViewMode = (v: 'grid' | 'list') => setPrefs({ viewMode: v });

  // ─── PUSH NOTIFICATIONS ────────────────────────────────────────────────────
  // Registra el SW, pide permiso al usuario y guarda el token FCM en Firestore.
  // A partir de aquí, los avisos llegan aunque la app esté cerrada o bloqueada.
  usePushNotifications(uid, email);

  useEffect(() => {
    if (user) setLocalUser({
      uid: (user as any).uid || '',
      email: (user as any).email || '',
      name: ((user as any).name || (user as any).displayName || '').trim(),
      role: ((user as any).puesto || (user as any).role || '').trim().toLowerCase(),
      photoUrl: (user as any).photoUrl || (user as any).photoURL,
      phone: (user as any).phone,
    });
  }, [user]);

  // Notificaciones en tiempo real
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'notificaciones'), where('destinatarios', 'array-contains', uid), orderBy('timestamp', 'desc'), limit(30)),
      snap => setNotifications(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, type: data.type || 'info', title: data.title || 'Notificación', body: data.body || '',
          read: (data.readBy || []).includes(uid), timestamp: data.timestamp || null,
          autorNombre: data.autorNombre || '', autorUid: data.autorUid || '' } as AppNotification;
      })),
      err => console.error('Notificaciones:', err)
    );
  }, [uid]);

  const handleMarkRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await updateDoc(doc(db, 'notificaciones', id), { readBy: arrayUnion(uid) }); } catch {}
  }, [uid]);

  const handleDeleteNotif = useCallback(async (id: string) => {
    try { await deleteDoc(doc(db, 'notificaciones', id)); toast.success('Eliminada'); }
    catch { toast.error('Error al eliminar'); }
  }, []);

  // Servicios en tiempo real
  useEffect(() => {
    if (!uid) { setLoadingServices(false); return; }
    return onSnapshot(query(collection(db, 'servicios'), where('personas', 'array-contains', uid)), snap => {
      const now = new Date();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)).filter(s => {
        const st = (s.estado || '').toLowerCase();
        const activo = !['finalizado', 'cancelado'].includes(st);
        let mesActual = false;
        if (s.fecha) { const p = parseISO(s.fecha); if (isValid(p)) mesActual = p.getMonth() === now.getMonth() && p.getFullYear() === now.getFullYear(); }
        return activo || mesActual;
      }).sort((a, b) => (b.fecha ? new Date(b.fecha).getTime() : 0) - (a.fecha ? new Date(a.fecha).getTime() : 0));
      setAssignedServices(docs); setLoadingServices(false);
    });
  }, [uid]);

  useEffect(() => {
    if (!uid || assignedServices.length === 0) return;

    const runAutoStart = () => {
      void autoStartServiciosIfDue(assignedServices, uid);
    };

    runAutoStart();
    const intervalId = window.setInterval(runAutoStart, 60_000);
    return () => window.clearInterval(intervalId);
  }, [assignedServices, uid]);

  const isAdmin      = useMemo(() => !!(localUser && (localUser.role.includes('admin') || localUser.role.includes('administrativo') || SUPER_ADMINS.includes(localUser.email))), [localUser]);
  const isCalidad    = useMemo(() => !!(localUser?.role.includes('calidad')), [localUser]);
  const isJefe       = useMemo(() => !!(localUser?.role.includes('admin') || localUser?.role.includes('gerente')), [localUser]);
  const isSuperAdmin = useMemo(() => SUPER_ADMINS.includes(localUser?.email || ''), [localUser]);
  const canBroadcast = isAdmin || isCalidad || isSuperAdmin;

  const filteredMenu = useMemo(() => {
    if (!localUser) return [];
    return MENU_ITEMS.filter(item => {
      if (item.id === 'calibration-stats') return isJefe || isSuperAdmin;
      if (item.id === 'vencimientos') return isJefe || isCalidad || isSuperAdmin;
      if (['programa-calibracion', 'control-prestamos'].includes(item.id)) return isJefe || isCalidad || isSuperAdmin;
      return true;
    }).filter(i => !searchTerm || i.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [localUser, searchTerm, isJefe, isCalidad, isSuperAdmin]);

  const menuGroups = useMemo(() => groupMenuByCategory(filteredMenu), [filteredMenu]);
  const isSearching = searchTerm.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowNotif(false);
      setShowTheme(false);
      setShowProfile(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

  if (!localUser || loadingPrefs) return (
    <div className="min-h-screen ag-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin w-8 h-8 acc-text" />
        <p className="text-sm ag-muted">Cargando...</p>
      </div>
    </div>
  );

  return (
    <>
      <ThemeStyle />
      <div className="min-h-screen font-sans ag-bg ag-text transition-colors" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* HEADER */}
        <header className="sticky top-0 z-40 border-b ag-header" style={{ backdropFilter: 'blur(16px)' }}>
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl border ag-border overflow-hidden flex items-center justify-center ag-surface">
                <img src={labLogo} className="w-6 h-6 object-contain" alt="AG" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-bold ag-text">AG Solutions</p>
                <p className="text-[10px] ag-faint">Laboratorio</p>
              </div>
            </div>

            <div className="hidden md:block text-xs font-medium ag-muted truncate max-w-[12rem] lg:max-w-none">{formattedDate}</div>

            <div className="flex items-center gap-1">
              {/* Notificaciones */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowNotif(v => !v); setShowTheme(false); }}
                  aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
                  aria-expanded={showNotif}
                  className="relative p-2 rounded-xl ag-muted acc-hover transition-all"
                >
                  <Bell size={17} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full acc border-2" style={{ borderColor: 'var(--bg)' }} aria-hidden />
                  )}
                </button>
                <AnimatePresence>
                  {showNotif && (
                    <NotificationPanel notifications={notifications} onClose={() => setShowNotif(false)}
                      onMarkRead={handleMarkRead} onDelete={handleDeleteNotif} canBroadcast={canBroadcast} uid={uid} />
                  )}
                </AnimatePresence>
              </div>

              {/* Tema */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowTheme(v => !v); setShowNotif(false); }}
                  aria-label="Personalización"
                  aria-expanded={showTheme}
                  className="p-2 rounded-xl ag-muted acc-hover transition-all"
                  title="Mi personalización"
                >
                  <Palette size={17} />
                </button>
                <AnimatePresence>
                  {showTheme && <ThemeSelector prefs={prefs} setPrefs={setPrefs} onClose={() => setShowTheme(false)} />}
                </AnimatePresence>
              </div>

              {/* Vista */}
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                aria-label={viewMode === 'grid' ? 'Cambiar a vista lista' : 'Cambiar a vista cuadrícula'}
                className="p-2 rounded-xl ag-muted acc-hover transition-all"
              >
                {viewMode === 'grid' ? <AlignLeft size={17} /> : <LayoutGrid size={17} />}
              </button>

              <div className="w-px h-5 mx-1 ag-border" />

              {/* Perfil */}
              <button
                type="button"
                onClick={() => setShowProfile(true)}
                aria-label="Editar perfil"
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl border ag-border acc-hover transition-all"
              >
                <div className="w-6 h-6 rounded-lg overflow-hidden flex items-center justify-center ag-surface-hi">
                  {localUser.photoUrl ? <img src={localUser.photoUrl} className="w-full h-full object-cover" /> : <User className="w-3.5 h-3.5 ag-muted" />}
                </div>
                <span className="text-xs font-medium ag-text hidden sm:block">{localUser.name.split(' ')[0]}</span>
              </button>

              <button type="button" onClick={logout} aria-label="Cerrar sesión" className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all ml-0.5">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                <div className="flex-1">
                  <h2 className="text-lg font-bold ag-text">Hola, {localUser.name.split(' ')[0]} 👋</h2>
                  <p className="text-xs ag-muted md:hidden">{formattedDate}</p>
                </div>
                <div className="relative w-full sm:flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ag-faint pointer-events-none" aria-hidden />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar módulo..."
                    aria-label="Buscar módulo"
                    className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border ag-input"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Limpiar búsqueda"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg ag-muted hover:ag-text transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {filteredMenu.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border ag-border ag-card"
                  >
                    <Search className="w-10 h-10 ag-faint opacity-30" aria-hidden />
                    <p className="text-sm ag-muted text-center px-4">
                      {isSearching ? `Ningún módulo coincide con «${searchTerm}»` : 'No hay módulos disponibles'}
                    </p>
                    {isSearching && (
                      <button type="button" onClick={() => setSearchTerm('')} className="text-xs acc-text font-semibold hover:underline">
                        Limpiar búsqueda
                      </button>
                    )}
                  </motion.div>
                ) : viewMode === 'grid' ? (
                  <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className={isSearching ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'space-y-5'}
                  >
                    {(isSearching ? [{ category: '', items: filteredMenu }] : menuGroups).map(({ category, items }) => (
                      <div key={category || 'search'} className={isSearching ? 'contents' : undefined}>
                        {!isSearching && (
                          <h3 className="text-[10px] font-bold uppercase tracking-wider ag-muted mb-2 px-0.5 col-span-full">{category}</h3>
                        )}
                        <div className={isSearching ? 'contents' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'}>
                          {items.map((item, i) => (
                            <MenuGridCard
                              key={item.id}
                              item={item}
                              index={i}
                              hideCategory={!isSearching}
                              isDisabled={item.id === 'formatos' && !isAdmin}
                              onNavigate={navigateTo}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {false && filteredMenu.map((item, i) => {
                      const isDisabled = item.id === 'formatos' && !isAdmin;
                      return (
                        <motion.div key={item.id}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                          whileHover={isDisabled ? {} : { y: -3 }} whileTap={isDisabled ? {} : { scale: 0.97 }}
                          onClick={() => !isDisabled && navigateTo(item.id)}
                          className={`group relative rounded-2xl border p-4 cursor-pointer card-interact ag-card overflow-hidden
                            ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
                          `}
                        >
                          {isDisabled && (
                            <span className="absolute top-2 right-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ag-badge">Pronto</span>
                          )}
                          {!isDisabled && (
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
                              style={{ background: `radial-gradient(circle at 20% 80%, rgba(var(--acc-rgb)/0.08) 0%, transparent 60%)` }} />
                          )}
                          <div className="relative z-10 flex flex-col h-full gap-4">
                            <div className="p-2.5 rounded-xl w-fit ag-surface-hi transition-colors">
                              <item.icon className="w-5 h-5 ag-muted ci-icon transition-colors" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold ag-text leading-tight">{item.title}</h3>
                              <span className="text-[10px] uppercase font-bold tracking-wide ag-faint mt-0.5 block">{item.category}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
                    {filteredMenu.map((item, i) => {
                      const isDisabled = item.id === 'formatos' && !isAdmin;
                      return (
                        <motion.div key={item.id}
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.015 }}
                          whileTap={isDisabled ? {} : { scale: 0.99 }}
                          onClick={() => !isDisabled && navigateTo(item.id)}
                          className={`group flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer card-interact ag-card
                            ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
                          `}
                        >
                          <div className="p-2 rounded-lg ag-surface-hi">
                            <item.icon className="w-4 h-4 ag-muted ci-icon transition-colors" />
                          </div>
                          <span className="flex-1 text-sm font-medium ag-text">{item.title}</span>
                          <span className="text-[10px] uppercase font-bold ag-faint">{item.category}</span>
                          {!isDisabled && <ChevronRight className="w-4 h-4 ag-faint group-hover:acc-text transition-colors opacity-0 group-hover:opacity-100" />}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* WIDGETS */}
            <div className="lg:w-72 flex flex-col gap-4">
              {(isCalidad || isAdmin || isSuperAdmin) && (
                <><KpiWidget navigateTo={navigateTo} />
                  <PatronesWidget navigateTo={navigateTo} />
                  <TechnicianStatusWidget /></>
              )}
              <div className="flex-1 min-h-64"><ServicesWidget services={assignedServices} navigateTo={navigateTo} loading={loadingServices} /></div>
            </div>
          </div>
        </main>

        <AnimatePresence>
          {showProfile && localUser && (
            <ProfileModal currentUser={localUser} onClose={() => setShowProfile(false)}
              onUpdate={d => setLocalUser(p => p ? { ...p, ...d } : null)} />
          )}
        </AnimatePresence>

        {(showTheme || showNotif) && (
          <div
            className="fixed inset-0 z-30"
            aria-hidden
            onClick={() => { setShowTheme(false); setShowNotif(false); }}
          />
        )}
      </div>
    </>
  );
};

export default MainMenu;