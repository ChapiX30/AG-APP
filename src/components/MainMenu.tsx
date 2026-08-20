/**
 * MainMenu — diseño renovado.
 */
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import {
  X, ChevronRight, Search, Loader2, Check, MoreHorizontal, Camera, Lock,
} from 'lucide-react';
import {
  PiPulseDuotone, PiBriefcaseDuotone, PiClipboardTextDuotone, PiClockCounterClockwiseDuotone,
  PiFileTextDuotone, PiAirplaneTiltDuotone, PiUsersThreeDuotone, PiCalendarDotsDuotone,
  PiDatabaseDuotone, PiFilesDuotone, PiFolderOpenDuotone, PiBuildingsDuotone,
  PiChartLineUpDuotone, PiWrenchDuotone, PiExportDuotone, PiMedalDuotone,
  PiArrowsLeftRightDuotone, PiShieldCheckeredDuotone,
  // Iconos de la interfaz (widgets, header, notificaciones) — alias a los nombres usados
  PiBellDuotone as Bell,
  PiSignOutDuotone as LogOut,
  PiUserDuotone as User,
  PiCheckCircleDuotone as CheckCircle2,
  PiWarningDuotone as AlertTriangle,
  PiBriefcaseDuotone as Briefcase,
  PiMapPinDuotone as MapPin,
  PiClockDuotone as Clock,
  PiUsersThreeDuotone as Users,
  PiPaletteDuotone as Palette,
  PiSquaresFourDuotone as LayoutGrid,
  PiListDuotone as AlignLeft,
  PiInfoDuotone as Info,
  PiWarningCircleDuotone as AlertCircle,
  PiPaperPlaneTiltDuotone as Send,
  PiMegaphoneDuotone as Megaphone,
  PiTrashDuotone as Trash2,
  PiSparkleDuotone as Sparkles,
} from 'react-icons/pi';
import { NovedadesWidget } from './NovedadesWidget';
import { NovedadesComposeModal } from './NovedadesComposeModal';
import { WhatsNewModal } from './WhatsNewModal';
import type { AppUpdate } from '../config/appUpdates';
import { useAppUpdates } from '../hooks/useAppUpdates';
import { canCreateAppNovedades } from '../utils/appNovedades';
import {
  getUpdatesForUser,
  isNovedadesWidgetHidden,
  markUpdateSeen,
  setNovedadesWidgetHidden,
} from '../utils/appUpdatesStorage';
import labLogo from '../assets/lab_logo.png';
import { db, storage, auth } from '../utils/firebase';
import {
  collection, onSnapshot, doc, setDoc, getDoc, query, where, getDocs,
  orderBy, serverTimestamp, limit, Timestamp, addDoc, deleteDoc,
  updateDoc, arrayUnion,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, updateProfile } from 'firebase/auth';
import {
  differenceInDays, parseISO, isValid,
  format, isToday, parse, isWithinInterval, addHours, formatDistanceToNow,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import { autoStartServiciosIfDue, getHoyFechaLocal, hasCelesticaAsignacionHoy } from '../utils/servicioAutomation';
import { ensureHojasServicioIdsReparados, mensajeReparacionHojasServicio } from '../utils/repararHojasServicioIds';
import { getTotalWorksheetQueueCount } from '../utils/worksheetQueueRunner';
import { isUserOnline } from '../hooks/usePresence';
import { COLLECTION_PATRONES, countPatronesEnAlerta, isCalidadRole } from '../utils/patronCalibracion';
import { isMetrologyRole, isQualityRole } from '../utils/calibrationShared';
import { isJorgeAmador } from '../utils/calendarPermissions';
import { isHiddenTestAccount } from '../utils/hiddenUsers';
import {
  upsertRecordatorioConfirmacionJunta,
  eliminarRecordatorioConfirmacionJunta,
  usuarioYaConfirmoJunta,
} from '../utils/notificacionesRecordatorioJunta';
import { enableWebPushFromUserGesture } from '../hooks/usePushNotifications';
import { screenFromNotifTipo } from '../utils/notificationMeta';
// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface Service {
  id: string; cliente: string; titulo?: string; elemento?: string; descripcion?: string;
  prioridad?: 'alta' | 'critica' | 'normal' | 'baja'; fecha?: string;
  horaInicio?: string; horaFin?: string; ubicacion?: string;
  tipo?: string; estado?: string; personas?: string[]; enterados?: string[];
}

interface UserData {
  uid: string; email: string; name: string; role: string;
  photoUrl?: string; phone?: string; notaPerfil?: string;
}

interface UserPrefs {
  themeMode: 'dark' | 'light';
  accentColor: string;
  viewMode: 'grid' | 'list';
  /** classic = diseño actual; premium = launcher corporativo */
  menuStyle: 'classic' | 'premium';
}

interface AppNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string; body: string; read: boolean;
  timestamp: Timestamp | null;
  autorNombre?: string; autorUid?: string;
  navigateTo?: string;
  servicioId?: string;
  tipo?: string;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const DEFAULT_PREFS: UserPrefs = {
  themeMode: 'dark',
  accentColor: '#2464a3',
  viewMode: 'grid',
  menuStyle: 'premium',
};

const MENU_BLURBS: Record<string, string> = {
  friday: 'Proyectos y avance',
  'friday-servicios': 'Órdenes del día',
  'hoja-servicio': 'Registro en campo',
  'directorio-empresas': 'Historial de equipos',
  'permisos-trabajo': 'Permisos TR',
  'solicitud-vacaciones': 'Solicitudes RH',
  'control-vacaciones-rh': 'Control de ausencias',
  'gestion-usuarios': 'Accesos y roles',
  calendario: 'Agenda del laboratorio',
  consecutivos: 'Folios y worksheets',
  formatos: 'Plantillas master',
  drive: 'Archivos del equipo',
  empresas: 'Clientes y sedes',
  'calibration-stats': 'Indicadores clave',
  normas: 'Hoja de herramienta',
  'entrada-salida': 'Control de salidas',
  'programa-calibracion': 'Patrones y vencimientos',
  'control-prestamos': 'Préstamos activos',
};

const PRESET_COLORS = [
  { hex: '#2464a3', label: 'Azul' },
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

const prefetchedChunks = new Set<string>();

/** Prefetch lazy chunks on hover/focus (paths match MainApp lazy imports). */
const prefetchMenuScreen = (menuId: string) => {
  if (prefetchedChunks.has(menuId)) return;
  const loaders: Record<string, () => Promise<unknown>> = {
    drive: () => import('./DriveScreen'),
    friday: () => import('./FridayScreen'),
    calendario: () => import('./CalendarScreen'),
    empresas: () => import('./EmpresasScreen'),
    consecutivos: () =>
      Promise.all([
        import('./ConsecutivosScreen'),
        import('./WorkSheetScreen'),
      ]),
  };
  const load = loaders[menuId];
  if (!load) return;
  prefetchedChunks.add(menuId);
  void load();
};

const MENU_ITEMS = [
  { id: 'friday', title: 'Friday Projects', icon: PiPulseDuotone, category: 'Gestión' },
  { id: 'friday-servicios', title: 'Servicios', icon: PiBriefcaseDuotone, category: 'Operativo' },
  { id: 'hoja-servicio', title: 'Hoja de Servicio', icon: PiClipboardTextDuotone, category: 'Operativo' },
  { id: 'directorio-empresas', title: 'Historial Equipos', icon: PiClockCounterClockwiseDuotone, category: 'Análisis' },
  { id: 'permisos-trabajo', title: 'Permisos TR', icon: PiFileTextDuotone, category: 'Operativo' },
  { id: 'solicitud-vacaciones', title: 'Vacaciones', icon: PiAirplaneTiltDuotone, category: 'Operativo' },
  { id: 'control-vacaciones-rh', title: 'Control Vacaciones RH', icon: PiUsersThreeDuotone, category: 'Operativo' },
  { id: 'gestion-usuarios', title: 'Usuarios', icon: PiShieldCheckeredDuotone, category: 'Gestión' },
  { id: 'calendario', title: 'Calendario', icon: PiCalendarDotsDuotone, category: 'Gestión' },
  { id: 'consecutivos', title: 'Consecutivos', icon: PiDatabaseDuotone, category: 'Técnico' },
  { id: 'formatos', title: 'Formatos Máster', icon: PiFilesDuotone, category: 'Calidad' },
  { id: 'drive', title: 'Drive', icon: PiFolderOpenDuotone, category: 'Archivos' },
  { id: 'empresas', title: 'Empresas', icon: PiBuildingsDuotone, category: 'Gestión' },
  { id: 'calibration-stats', title: 'Estadísticas', icon: PiChartLineUpDuotone, category: 'Análisis' },
  { id: 'normas', title: 'Hoja de Herramienta', icon: PiWrenchDuotone, category: 'Técnico' },
  { id: 'entrada-salida', title: 'Hoja de Salida', icon: PiExportDuotone, category: 'Logística' },
  { id: 'programa-calibracion', title: 'Patrones', icon: PiMedalDuotone, category: 'Técnico' },
  { id: 'control-prestamos', title: 'Préstamos', icon: PiArrowsLeftRightDuotone, category: 'Logística' },
];

const SUPER_ADMINS = [
  'jesus.sustaita@agsolutions.com',
  'admin@agsolutions.com',
  'mgaese08@gmail.com',
];
const PATRON_BANNER_DISMISS_KEY = 'patronAlertBannerDismissedAt';
const PATRON_BANNER_HIDE_MS = 3 * 24 * 60 * 60 * 1000;

const isPatronBannerDismissed = (): boolean => {
  try {
    const raw = localStorage.getItem(PATRON_BANNER_DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Date.parse(raw);
    if (Number.isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < PATRON_BANNER_HIDE_MS;
  } catch {
    return false;
  }
};
const safeDateParse = (d?: string) => { if (!d) return null; const p = parseISO(d); return isValid(p) ? p : null; };

const normalizeHex = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  const withHash = t.startsWith('#') ? t : `#${t}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
  return withHash.toLowerCase();
};

const hexToRgb = (hex: string) => {
  const clean = normalizeHex(hex) || DEFAULT_PREFS.accentColor;
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
};

const PREFS_LS_KEY = (uid: string) => `ag.userPrefs.${uid}`;

const sanitizePrefs = (raw: Partial<UserPrefs> | null | undefined): Partial<UserPrefs> => {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<UserPrefs> = {};
  if (raw.themeMode === 'dark' || raw.themeMode === 'light') out.themeMode = raw.themeMode;
  if (raw.viewMode === 'grid' || raw.viewMode === 'list') out.viewMode = raw.viewMode;
  if (raw.menuStyle === 'classic' || raw.menuStyle === 'premium') out.menuStyle = raw.menuStyle;
  const accent = normalizeHex(raw.accentColor);
  if (accent) out.accentColor = accent;
  return out;
};

const readLocalPrefs = (uid: string): Partial<UserPrefs> => {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY(uid));
    if (!raw) return {};
    return sanitizePrefs(JSON.parse(raw) as Partial<UserPrefs>);
  } catch {
    return {};
  }
};

const writeLocalPrefs = (uid: string, prefs: UserPrefs) => {
  try {
    localStorage.setItem(PREFS_LS_KEY(uid), JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
};

// ─── APLICAR TEMA AL DOM ──────────────────────────────────────────────────────
const applyTheme = (prefs: UserPrefs) => {
  const root = document.documentElement;
  const accent = normalizeHex(prefs.accentColor) || DEFAULT_PREFS.accentColor;
  root.style.setProperty('--acc', accent);
  root.style.setProperty('--acc-rgb', hexToRgb(accent));
  if (prefs.themeMode === 'dark') {
    // Grises neutros reales (sin tinte azul) — inspirado en Ant Design 5 / shadcn neutral
    root.style.setProperty('--bg', '#0a0a0a');
    root.style.setProperty('--surface', '#161616');
    root.style.setProperty('--surface-hi', '#242424');
    root.style.setProperty('--border-color', 'rgba(255,255,255,0.10)');
    root.style.setProperty('--text', '#f5f5f5');
    root.style.setProperty('--text-muted', '#a3a3a3');
    root.style.setProperty('--text-faint', '#525252');
    root.style.setProperty('--header', 'rgba(10,10,10,0.80)');
  } else {
    root.style.setProperty('--bg', '#fafafa');
    root.style.setProperty('--surface', '#ffffff');
    root.style.setProperty('--surface-hi', '#f5f5f5');
    root.style.setProperty('--border-color', 'rgba(0,0,0,0.10)');
    root.style.setProperty('--text', '#171717');
    root.style.setProperty('--text-muted', '#737373');
    root.style.setProperty('--text-faint', '#d4d4d4');
    root.style.setProperty('--header', 'rgba(250,250,250,0.85)');
  }
};

// ─── CSS GLOBAL ───────────────────────────────────────────────────────────────
const ThemeStyle = () => (
  <style>{`
    :root {
      /* --acc / --acc-rgb los aplica applyTheme (no hardcodear aquí: pisa el color guardado) */
      --bg: #0a0a0a; --surface: #161616; --surface-hi: #242424;
      --border-color: rgba(255,255,255,0.10);
      --text: #f5f5f5; --text-muted: #a3a3a3; --text-faint: #525252;
      --header: rgba(10,10,10,0.80);
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
    .card-interact { transition: transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s ease, border-color 0.2s ease; }
    .card-interact:hover { transform: translateY(-2px); }
    .card-interact:active { transform: translateY(0) scale(0.995); }
    .card-interact:hover .ci-icon { color: var(--acc); }
    .ag-mesh {
      background:
        radial-gradient(ellipse 60% 42% at 10% -14%, rgba(var(--acc-rgb)/0.06) 0%, transparent 52%),
        radial-gradient(ellipse 50% 36% at 96% 2%, rgba(var(--acc-rgb)/0.04) 0%, transparent 50%),
        var(--bg);
    }
    .ag-section {
      background: var(--surface);
      border: 1px solid var(--border-color);
      border-radius: 1.25rem;
      padding: 1.1rem 1.1rem 1.25rem;
    }
    /* Tarjeta de módulo — plana y nítida, hover con borde de acento */
    .ag-menu-card {
      position: relative;
      background: var(--surface);
      box-shadow: 0 1px 2px rgba(0,0,0,0.14);
    }
    .ag-menu-card:hover {
      border-color: rgba(var(--acc-rgb)/0.55) !important;
      box-shadow: 0 10px 28px -14px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--acc-rgb)/0.22);
    }
    .ag-tile-icon { transition: transform 0.22s cubic-bezier(0.22,1,0.36,1); }
    .ag-menu-card:hover .ag-tile-icon { transform: scale(1.05); }
    .ag-arrow { opacity: 0; transform: translateX(-4px); transition: all 0.22s ease; }
    .ag-menu-card:hover .ag-arrow { opacity: 1; transform: translateX(0); }
    /* ── Premium launcher ── */
    .ag-prem-mesh {
      background:
        radial-gradient(ellipse 70% 50% at 8% -18%, rgba(var(--acc-rgb)/0.11) 0%, transparent 55%),
        radial-gradient(ellipse 48% 40% at 100% 0%, rgba(var(--acc-rgb)/0.06) 0%, transparent 48%),
        radial-gradient(ellipse 40% 30% at 70% 100%, rgba(var(--acc-rgb)/0.04) 0%, transparent 50%),
        var(--bg);
    }
    .ag-prem-section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .ag-prem-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      border-radius: 1.15rem;
      border: 1px solid var(--border-color);
      background: linear-gradient(168deg, color-mix(in srgb, var(--surface-hi) 88%, var(--acc) 12%) 0%, var(--surface) 42%, var(--surface) 100%);
      overflow: hidden;
      cursor: pointer;
      transition: border-color 0.2s ease, transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease;
      min-height: 11.25rem;
    }
    .ag-prem-tile:hover {
      border-color: rgba(var(--acc-rgb)/0.5);
      transform: translateY(-3px);
      box-shadow: 0 18px 44px -22px rgba(0,0,0,0.62), 0 0 0 1px rgba(var(--acc-rgb)/0.16);
    }
    .ag-prem-tile:active { transform: translateY(-1px) scale(0.992); }
    .ag-prem-tile.is-disabled {
      opacity: 0.42;
      filter: grayscale(0.85);
      cursor: not-allowed;
    }
    .ag-prem-tile.is-disabled:hover {
      transform: none;
      box-shadow: none;
      border-color: var(--border-color);
    }
    .ag-prem-screen {
      position: relative;
      height: 5.75rem;
      margin: 0.7rem 0.7rem 0;
      border-radius: 0.9rem;
      background:
        linear-gradient(145deg, rgba(var(--acc-rgb)/0.2) 0%, rgba(var(--acc-rgb)/0.05) 40%, transparent 72%),
        var(--bg);
      border: 1px solid rgba(var(--acc-rgb)/0.16);
      overflow: hidden;
    }
    .ag-prem-screen::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.05) 48%, transparent 62%);
      opacity: 0;
      transition: opacity 0.35s ease;
    }
    .ag-prem-tile:hover .ag-prem-screen::after { opacity: 1; }
    .ag-prem-chrome {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 9px 11px 6px;
    }
    .ag-prem-chrome i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(var(--acc-rgb)/0.38);
      display: block;
    }
    .ag-prem-lines {
      padding: 2px 11px 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .ag-prem-lines span {
      display: block;
      height: 3px;
      border-radius: 999px;
      background: rgba(var(--acc-rgb)/0.18);
    }
    .ag-prem-lines span:nth-child(1) { width: 72%; }
    .ag-prem-lines span:nth-child(2) { width: 48%; }
    .ag-prem-lines span:nth-child(3) { width: 58%; opacity: 0.7; }
    .ag-prem-icon-float {
      position: absolute;
      right: 10px;
      bottom: 10px;
      width: 2.65rem;
      height: 2.65rem;
      border-radius: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--acc);
      background: rgba(var(--acc-rgb)/0.14);
      border: 1px solid rgba(var(--acc-rgb)/0.28);
      box-shadow: 0 8px 20px -12px rgba(var(--acc-rgb)/0.55);
      transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), background 0.2s ease;
    }
    .ag-prem-tile:hover .ag-prem-icon-float {
      transform: scale(1.06);
      background: rgba(var(--acc-rgb)/0.22);
    }
    .ag-prem-meta {
      padding: 0.85rem 1rem 1.05rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      flex: 1;
    }
    .ag-prem-title {
      font-size: 0.9375rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text);
      line-height: 1.25;
    }
    .ag-prem-blurb {
      font-size: 0.6875rem;
      color: var(--text-muted);
      line-height: 1.35;
    }
    .ag-prem-row {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 0.65rem 0.75rem;
      border-radius: 1rem;
      border: 1px solid var(--border-color);
      background: var(--surface);
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease, transform 0.18s ease;
      min-height: 3.75rem;
    }
    .ag-prem-row:hover {
      border-color: rgba(var(--acc-rgb)/0.45);
      background: color-mix(in srgb, var(--surface) 92%, var(--acc) 8%);
      transform: translateX(2px);
    }
    .ag-prem-row.is-disabled {
      opacity: 0.42;
      filter: grayscale(0.85);
      cursor: not-allowed;
    }
    .ag-prem-row.is-disabled:hover {
      transform: none;
      background: var(--surface);
      border-color: var(--border-color);
    }
    .ag-prem-thumb {
      width: 3rem;
      height: 3rem;
      border-radius: 0.75rem;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--acc);
      background:
        linear-gradient(145deg, rgba(var(--acc-rgb)/0.22) 0%, rgba(var(--acc-rgb)/0.06) 100%),
        var(--bg);
      border: 1px solid rgba(var(--acc-rgb)/0.2);
    }
    .ag-prem-hero-name {
      background: linear-gradient(105deg, var(--text) 0%, var(--text) 42%, var(--acc) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .ag-prem-search {
      background: color-mix(in srgb, var(--surface) 80%, transparent);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
    }
    .ag-prem-search:focus {
      border-color: rgba(var(--acc-rgb)/0.55);
      box-shadow: 0 0 0 3px rgba(var(--acc-rgb)/0.14);
    }
    .ag-prem-widget {
      border-radius: 1.15rem;
      border: 1px solid var(--border-color);
      background: linear-gradient(168deg, color-mix(in srgb, var(--surface-hi) 80%, var(--acc) 8%) 0%, var(--surface) 55%);
      overflow: hidden;
      box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
    }
    .ag-prem-widget-head {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 0.55rem;
      background: linear-gradient(180deg, rgba(var(--acc-rgb)/0.08) 0%, transparent 100%);
    }
    .ag-prem-widget-title {
      font-size: 0.8125rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text);
      flex: 1;
    }
    .ag-prem-widget-icon {
      width: 1.85rem;
      height: 1.85rem;
      border-radius: 0.65rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--acc);
      background: rgba(var(--acc-rgb)/0.14);
      border: 1px solid rgba(var(--acc-rgb)/0.22);
      flex-shrink: 0;
    }
    /* Acciones del header */
    .ag-icon-btn { transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease; }
    .ag-icon-btn:hover { transform: translateY(-1px); }
    .ag-widgets-scroll { scrollbar-width: none; -ms-overflow-style: none; }
    .ag-widgets-scroll::-webkit-scrollbar { display: none; }
    .ag-skeleton { background: linear-gradient(90deg, var(--surface-hi) 25%, var(--surface) 50%, var(--surface-hi) 75%); background-size: 200% 100%; animation: ag-shimmer 1.4s ease infinite; }
    @keyframes ag-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
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

const CATEGORY_COLORS: Record<string, { rgb: string }> = {
  Operativo: { rgb: '59 130 246' },
  Gestión: { rgb: '139 92 246' },
  Técnico: { rgb: '6 182 212' },
  Calidad: { rgb: '16 185 129' },
  Análisis: { rgb: '245 158 11' },
  Archivos: { rgb: '236 72 153' },
  Logística: { rgb: '249 115 22' },
};

const getCategoryRgb = (category: string) => CATEGORY_COLORS[category]?.rgb ?? '100 116 139';

const formatRoleLabel = (role: string): string => {
  if (!role) return 'Usuario';
  const r = role.toLowerCase();
  if (r.includes('admin') && !r.includes('administrativo')) return 'Administrador';
  if (r.includes('gerente') || r.includes('jefe')) return 'Jefe / Gerente';
  if (r.includes('calidad')) return 'Calidad';
  if (r.includes('metrol')) return 'Metrólogo';
  if (r.includes('tecnic') || r.includes('técnico')) return 'Técnico';
  if (r.includes('administrativo')) return 'Administrativo';
  if (r.includes('ingeniero')) return 'Ingeniero';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

/** Never show an email in the greeting; prefer real name. */
const resolveFirstName = (name?: string): string => {
  const raw = String(name || '').trim();
  if (raw && !raw.includes('@')) return raw.split(/\s+/)[0];
  return 'Usuario';
};

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

// ─── HOOK: PREFERENCIAS POR USUARIO (Firestore + localStorage) ────────────────
const useUserPrefs = (uid: string | undefined) => {
  const [prefs, setPrefsLocal] = useState<UserPrefs>(() => {
    if (!uid) return DEFAULT_PREFS;
    const local = readLocalPrefs(uid);
    const initial = { ...DEFAULT_PREFS, ...local };
    applyTheme(initial);
    return initial;
  });
  const [loading, setLoading] = useState(true);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (!uid) {
      setPrefsLocal(DEFAULT_PREFS);
      applyTheme(DEFAULT_PREFS);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const local = readLocalPrefs(uid);
    const boot = { ...DEFAULT_PREFS, ...local };
    setPrefsLocal(boot);
    applyTheme(boot);

    getDoc(doc(db, 'userPrefs', uid))
      .then(async (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const remote = sanitizePrefs(snap.data() as Partial<UserPrefs>);
          const merged = { ...DEFAULT_PREFS, ...local, ...remote };
          // Si Firestore no trae accent pero local sí, recuperar subiendo local (sin pisar a quien ya tiene remoto)
          if (!remote.accentColor && local.accentColor) {
            try {
              await setDoc(
                doc(db, 'userPrefs', uid),
                { accentColor: local.accentColor },
                { merge: true },
              );
            } catch (e) {
              console.warn('No se pudo sincronizar accentColor local → Firestore:', e);
            }
          }
          setPrefsLocal(merged);
          applyTheme(merged);
          writeLocalPrefs(uid, merged);
          return;
        }

        // Sin doc remoto: si hay preferencias locales, subirlas (recupera elecciones no guardadas)
        if (local.accentColor || local.themeMode || local.viewMode || local.menuStyle) {
          try {
            await setDoc(doc(db, 'userPrefs', uid), boot, { merge: true });
          } catch (e) {
            console.warn('No se pudo crear userPrefs desde local:', e);
          }
        }
        setPrefsLocal(boot);
        applyTheme(boot);
        writeLocalPrefs(uid, boot);
      })
      .catch((e) => {
        console.warn('Error leyendo userPrefs; se mantienen prefs locales:', e);
        if (!cancelled) {
          setPrefsLocal(boot);
          applyTheme(boot);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const setPrefs = useCallback(async (update: Partial<UserPrefs>) => {
    const patch = sanitizePrefs(update);
    if (Object.keys(patch).length === 0) return;

    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefsLocal(next);
    applyTheme(next);

    if (!uid) return;
    writeLocalPrefs(uid, next);
    try {
      await setDoc(doc(db, 'userPrefs', uid), patch, { merge: true });
    } catch (e) {
      console.error('Error guardando prefs:', e);
      toast.error('No se pudo guardar tu personalización. Revisa tu conexión.');
    }
  }, [uid]);

  return { prefs, setPrefs, loading };
};

// ─── PANEL DE NOTIFICACIONES ──────────────────────────────────────────────────
const NotificationPanel = ({ notifications, onClose, onMarkRead, onMarkAllRead, onDelete, canBroadcast, uid, onNavigate }: {
  notifications: AppNotification[]; onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  canBroadcast: boolean; uid: string;
  onNavigate?: (screen: string) => void;
}) => {
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<AppNotification['type']>('info');
  const [sending, setSending] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const typeConfig = {
    info:    { icon: Info,         color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    label: 'Info' },
    warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  label: 'Aviso' },
    success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'OK' },
    error:   { icon: AlertCircle,  color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    label: 'Urgente' },
  };

  const handleEnablePush = async () => {
    setPushBusy(true);
    try {
      const result = await enableWebPushFromUserGesture(uid);
      setPushPerm(result === 'unsupported' ? 'unsupported' : result === 'granted' ? 'granted' : 'denied');
      if (result === 'granted') toast.success('Avisos del sistema activados');
      else if (result === 'denied') toast.error('Permiso denegado en el navegador');
      else toast.error('Este dispositivo no soporta push web');
    } catch {
      toast.error('No se pudo activar push');
    } finally {
      setPushBusy(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Completa título y mensaje'); return; }
    setSending(true);
    try {
      const usersSnap = await getDocs(collection(db, 'usuarios'));
      const visibleDocs = usersSnap.docs.filter((d) => !isHiddenTestAccount(d.data()));
      const allUids = visibleDocs.map(d => d.id);

      const autorSnap = await getDoc(doc(db, 'usuarios', uid));
      const autorNombre = autorSnap.exists() ? (autorSnap.data().name || 'Calidad') : 'Calidad';

      await addDoc(collection(db, 'notificaciones'), {
        type,
        tipo: 'aviso_global',
        title: title.trim(),
        body: body.trim(),
        autorUid: uid,
        autorNombre,
        readBy: [],
        destinatarios: allUids,
        timestamp: serverTimestamp(),
        global: true,
        fcmSent: false,
        navigateTo: 'menu',
      });

      toast.success('¡Aviso enviado a todos!');
      setTitle(''); setBody(''); setType('info'); setShowCompose(false);
    } catch (e) {
      console.error(e);
      toast.error('Error al enviar');
    }
    setSending(false);
  };

  const unread = notifications.filter(n => !n.read).length;

  const relativeTime = (ts: Timestamp | null) => {
    if (!ts?.toDate) return '';
    try {
      return formatDistanceToNow(ts.toDate(), { addSuffix: true, locale: es });
    } catch {
      return '';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.15 }}
      className="absolute right-0 top-12 w-[min(24rem,calc(100vw-1.25rem))] rounded-[1.35rem] shadow-2xl border z-50 overflow-hidden ag-card"
      onClick={e => e.stopPropagation()}
      role="dialog"
      aria-label="Notificaciones"
      style={{ borderColor: 'var(--border-color)' }}
    >
      <div
        className="px-4 pt-4 pb-3 border-b ag-border"
        style={{
          background: 'linear-gradient(165deg, rgba(var(--acc-rgb)/0.14) 0%, transparent 70%)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl acc-soft flex items-center justify-center">
            <Bell className="w-4 h-4 acc-text" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm ag-text leading-tight">Notificaciones</p>
            <p className="text-[11px] ag-muted mt-0.5">
              {unread > 0 ? `${unread} sin leer` : 'Al día'}
            </p>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-[11px] font-semibold acc-text px-2 py-1 rounded-lg acc-soft hover:opacity-90"
            >
              Leer todas
            </button>
          )}
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

        {pushPerm === 'default' && (
          <button
            type="button"
            disabled={pushBusy}
            onClick={handleEnablePush}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border ag-border acc-soft acc-text text-left"
          >
            <Bell size={14} className="shrink-0" />
            <span className="flex-1">
              {pushBusy ? 'Activando…' : 'Activar avisos en pantalla de bloqueo'}
            </span>
            <ChevronRight size={14} className="opacity-60" />
          </button>
        )}
        {pushPerm === 'denied' && (
          <p className="mt-3 text-[10px] ag-muted leading-snug px-0.5">
            Los avisos del sistema están bloqueados. Actívalos en la configuración del navegador para esta web.
          </p>
        )}
      </div>

      <AnimatePresence>
        {showCompose && canBroadcast && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="border-b ag-border overflow-hidden"
          >
            <div className="p-3 space-y-2.5 ag-surface-hi">
              <p className="text-[10px] font-bold uppercase tracking-wider acc-text flex items-center gap-1">
                <Megaphone size={10} /> Enviar aviso a todos los usuarios
              </p>
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

      <div className="max-h-[min(24rem,55vh)] overflow-y-auto cs">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 ag-faint px-6 text-center">
            <div className="w-14 h-14 rounded-2xl ag-surface-hi flex items-center justify-center mb-3">
              <Bell className="w-7 h-7 opacity-30" />
            </div>
            <span className="text-sm font-medium ag-muted">Bandeja limpia</span>
            <span className="text-[11px] ag-faint mt-1">Los avisos importantes aparecerán aquí</span>
          </div>
        ) : notifications.map(n => {
          const cfg = typeConfig[n.type] || typeConfig.info;
          const Icon = cfg.icon;
          const rel = relativeTime(n.timestamp);
          return (
            <div key={n.id} onClick={() => {
                if (n.navigateTo) onNavigate?.(n.navigateTo);
                if (!n.read) onMarkRead(n.id);
              }}
              className={`group flex gap-3 px-3.5 py-3 border-b ag-border cursor-pointer transition-all ${
                n.read ? 'opacity-55 hover:opacity-85' : 'ag-surface-hi'
              }`}
            >
              <div className={`mt-0.5 p-2 rounded-xl flex-shrink-0 border ${cfg.bg} ${cfg.border}`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <p className="text-[13px] font-semibold ag-text leading-snug flex-1">{n.title}</p>
                  {!n.read && <span className="mt-1 w-2 h-2 rounded-full acc shrink-0" />}
                </div>
                <p className="text-[11px] ag-muted mt-1 leading-snug line-clamp-2">{n.body}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {rel && <span className="text-[10px] ag-faint">{rel}</span>}
                  {n.autorNombre && <span className="text-[10px] ag-faint">· {n.autorNombre}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {canBroadcast && (
                  <button onClick={e => { e.stopPropagation(); onDelete(n.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-rose-400 hover:bg-rose-500/10 transition-all"
                  ><Trash2 size={11} /></button>
                )}
                <ChevronRight className="w-3.5 h-3.5 ag-faint opacity-0 group-hover:opacity-70 transition-opacity" />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

// ─── SELECTOR DE TEMA ─────────────────────────────────────────────────────────
const ThemeSelector = ({ prefs, setPrefs, onClose, novedadesWidgetHidden, onNovedadesWidgetHiddenChange }: {
  prefs: UserPrefs; setPrefs: (p: Partial<UserPrefs>) => void; onClose: () => void;
  novedadesWidgetHidden: boolean;
  onNovedadesWidgetHiddenChange: (hidden: boolean) => void;
}) => {
  const colorRef = useRef<HTMLInputElement>(null);
  const currentAccent = normalizeHex(prefs.accentColor) || DEFAULT_PREFS.accentColor;
  const [custom, setCustom] = useState(currentAccent);

  useEffect(() => {
    setCustom(currentAccent);
  }, [currentAccent]);

  const pick = (hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setCustom(normalized);
    setPrefs({ accentColor: normalized });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.15 }}
      className="absolute right-0 top-12 w-[min(18.5rem,calc(100vw-1.5rem))] rounded-2xl shadow-2xl border z-50 overflow-hidden ag-card"
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

      <div className="p-3.5 space-y-4 max-h-[min(70vh,32rem)] overflow-y-auto cs">
        {/* Estilo del menú */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider ag-muted mb-2">Estilo del menú</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: 'premium' as const, label: 'Premium' },
              { id: 'classic' as const, label: 'Clásico' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPrefs({ menuStyle: id })}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  (prefs.menuStyle || 'premium') === id ? 'acc text-white border-transparent' : 'ag-surface-hi ag-border ag-muted hover:opacity-80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] ag-faint mt-1.5 leading-snug">
            {(prefs.menuStyle || 'premium') === 'premium'
              ? 'Launcher corporativo con previews. Puedes volver a Clásico cuando quieras.'
              : 'El diseño anterior, con categorías en cajas e iconos de color.'}
          </p>
        </div>

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
            {PRESET_COLORS.map(({ hex, label }) => {
              const selected = currentAccent === hex;
              return (
              <button key={hex} title={label} onClick={() => pick(hex)}
                className="relative w-8 h-8 rounded-lg transition-transform hover:scale-110 active:scale-95 border-2"
                style={{
                  backgroundColor: hex,
                  borderColor: selected ? 'white' : 'transparent',
                  boxShadow: selected ? `0 0 0 1px ${hex}` : 'none',
                }}
              >
                {selected && <Check className="w-3 h-3 text-white absolute inset-0 m-auto" strokeWidth={3} />}
              </button>
              );
            })}
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

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider ag-muted mb-2">Menú principal</p>
          <button
            type="button"
            onClick={() => onNovedadesWidgetHiddenChange(!novedadesWidgetHidden)}
            className={`w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
              novedadesWidgetHidden
                ? 'ag-surface-hi ag-border ag-muted hover:opacity-80'
                : 'acc-soft acc-text border-transparent'
            }`}
          >
            <Sparkles size={14} className="shrink-0" />
            <span className="flex-1 text-left">
              {novedadesWidgetHidden ? 'Mostrar widget de novedades' : 'Widget de novedades visible'}
            </span>
          </button>
          <p className="text-[10px] ag-faint mt-1.5 leading-snug">
            {novedadesWidgetHidden
              ? 'El menú vuelve a verse como antes, sin el panel lateral.'
              : 'También puedes ocultarlo con la ✕ del panel.'}
          </p>
        </div>

        <p className="text-[10px] ag-muted text-center">
          Esta preferencia es solo tuya 🎨
        </p>
      </div>
    </motion.div>
  );
};

// ─── WIDGETS ──────────────────────────────────────────────────────────────────
type PersonalVisibility = 'tecnicos' | 'calidad' | 'todos';

type PresenceRow = {
  id: string;
  name?: string;
  photoUrl?: string;
  lastActive?: unknown;
  presenceActivity?: string | null;
  position?: string;
  puesto?: string;
  role?: string;
  status: string;
  color: string;
  bg: string;
  detail: string;
  dot: string;
};

const toUsuarioRow = (u: { id: string; position?: string; puesto?: string; role?: string }) => ({
  id: u.id,
  puesto: u.puesto || u.position || '',
  role: u.role || '',
});

const isVacationToday = (
  v: { solicitanteUid?: string; fechaInicio?: string; fechaFin?: string },
  hoyStr: string,
) =>
  !!v.solicitanteUid &&
  !!v.fechaInicio &&
  !!v.fechaFin &&
  v.fechaInicio <= hoyStr &&
  hoyStr <= v.fechaFin;

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

const mapPersonalPresence = (
  people: any[],
  serviciosHoy: Service[],
  onVacationIds: Set<string>,
): PresenceRow[] => {
  const ahora = new Date();
  return people.map(person => {
    if (onVacationIds.has(person.id)) {
      return {
        ...person,
        status: 'Vacaciones',
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        detail: 'De vacaciones',
        dot: 'bg-sky-500',
      };
    }

    const activity = person.presenceActivity;
    if (isUserOnline(person.lastActive, ahora) && (activity === 'consecutivos' || activity === 'hoja')) {
      return {
        ...person,
        status: 'Ocupado',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        detail: activity === 'hoja' ? 'En hoja de trabajo' : 'Generando consecutivos',
        dot: 'bg-blue-500',
      };
    }

    const active = findActiveService(person.id, serviciosHoy, ahora);
    if (active) {
      return {
        ...person,
        status: 'En proceso',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        detail: active.cliente || active.titulo || 'Servicio activo',
        dot: 'bg-amber-500',
      };
    }

    if (isUserOnline(person.lastActive, ahora)) {
      const nota = String(person.notaPerfil || '').trim();
      return {
        ...person,
        status: 'Conectado',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        detail: nota || 'En la app',
        dot: 'bg-emerald-500',
      };
    }

    return {
      ...person,
      status: 'Ausente',
      color: 'ag-muted',
      bg: '',
      detail: 'Fuera de la app',
      dot: 'bg-slate-500',
    };
  });
};

const filterPersonalRoster = (usersRaw: any[], visibility: PersonalVisibility) => {
  const visible = usersRaw.filter((u) => !isHiddenTestAccount(u));
  if (visibility === 'tecnicos') {
    return visible.filter((u) => isMetrologyRole(toUsuarioRow(u)));
  }
  if (visibility === 'calidad') {
    return visible.filter((u) => isQualityRole(toUsuarioRow(u)));
  }
  return visible.filter(
    (u) => isMetrologyRole(toUsuarioRow(u)) || isQualityRole(toUsuarioRow(u)),
  );
};

const personalCountLabel = (count: number, visibility: PersonalVisibility) => {
  if (visibility === 'calidad') return `${count} calidad`;
  if (visibility === 'todos') return `${count} personas`;
  return `${count} técnicos`;
};

const TechnicianStatusWidget = ({ visibility, premium }: { visibility: PersonalVisibility; premium?: boolean }) => {
  const [people, setPeople] = useState<PresenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let usersRaw: any[] = [];
    let serviciosHoy: Service[] = [];
    let vacationUids = new Set<string>();
    let hasUsers = false;

    const recompute = () => {
      if (!hasUsers) return;
      const roster = filterPersonalRoster(usersRaw, visibility);
      const mapped = mapPersonalPresence(roster, serviciosHoy, vacationUids);
      mapped.sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }),
      );
      setPeople(mapped);
      setLoading(false);
    };

    const hoyStr = format(new Date(), 'yyyy-MM-dd');
    const unsubUsers = onSnapshot(
      collection(db, 'usuarios'),
      snap => {
        usersRaw = snap.docs.map(d => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            ...data,
            name: String(data.name || data.nombre || data.displayName || ''),
          };
        });
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

    const unsubVacaciones = onSnapshot(
      query(collection(db, 'solicitudesVacaciones'), where('estado', '==', 'aprobada')),
      snap => {
        vacationUids = new Set(
          snap.docs
            .map((d) => d.data() as { solicitanteUid?: string; fechaInicio?: string; fechaFin?: string })
            .filter((v) => isVacationToday(v, hoyStr))
            .map((v) => v.solicitanteUid as string),
        );
        recompute();
      },
      () => setLoading(false)
    );

    return () => {
      unsubUsers();
      unsubServicios();
      unsubVacaciones();
    };
  }, [visibility]);

  if (loading) return <div className={`h-40 rounded-2xl border ag-border animate-pulse ag-surface ${premium ? 'ag-prem-widget' : ''}`} />;
  return (
    <div className={premium ? 'ag-prem-widget' : 'rounded-2xl border ag-card overflow-hidden'}>
      <div className={premium ? 'ag-prem-widget-head' : 'p-3 border-b ag-border flex items-center gap-2'}>
        {premium ? (
          <div className="ag-prem-widget-icon"><Users className="w-3.5 h-3.5" /></div>
        ) : (
          <Users className="w-4 h-4 acc-text" />
        )}
        <span className={premium ? 'ag-prem-widget-title' : 'font-semibold text-sm ag-text'}>Personal</span>
        <span className="text-[10px] ml-auto ag-faint tabular-nums">{personalCountLabel(people.length, visibility)}</span>
      </div>
      <div className="p-2 space-y-1.5 max-h-52 overflow-y-auto cs">
        {people.length === 0 ? <p className="text-xs text-center py-4 ag-faint">Sin personal</p>
          : people.map(t => (
            <div key={t.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border ag-border ${premium ? 'bg-[var(--bg)]/40' : ''}`}>
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center ag-surface-hi">
                  {t.photoUrl ? <img src={t.photoUrl} className="w-full h-full object-cover" /> : <User className="w-4 h-4 ag-muted" />}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-transparent ${t.dot}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold ag-text truncate">{t.name || 'Usuario'}</p>
                <p className="text-[10px] ag-muted truncate">{t.detail}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.bg} ${t.color}`}>{t.status}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

const ServicesWidget = ({ services, navigateTo, loading, premium }: { services: Service[]; navigateTo: any; loading: boolean; premium?: boolean }) => (
  <div className={`${premium ? 'ag-prem-widget' : 'rounded-2xl border ag-card overflow-hidden'} flex flex-col h-full`}>
    <div className={premium ? 'ag-prem-widget-head' : 'p-3 border-b ag-border flex items-center gap-2'}>
      {premium ? (
        <div className="ag-prem-widget-icon"><Briefcase className="w-3.5 h-3.5" /></div>
      ) : (
        <Briefcase className="w-4 h-4 acc-text" />
      )}
      <span className={premium ? 'ag-prem-widget-title' : 'font-semibold text-sm ag-text'}>Mis Asignaciones</span>
      <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ag-badge tabular-nums">{services.length}</span>
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

// ─── MODAL PERFIL ─────────────────────────────────────────────────────────────
const profileInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

const ProfileModal = ({ currentUser, onClose, onUpdate }: {
  currentUser: UserData; onClose: () => void; onUpdate: (d: Partial<UserData>) => void;
}) => {
  const { uid, name, email, phone, role, photoUrl: initPhoto, notaPerfil: initNota } = currentUser;
  const [localName, setLocalName] = useState(name || '');
  const [localPhone, setLocalPhone] = useState(phone || '');
  const [localNota, setLocalNota] = useState(initNota || '');
  const [localPhotoUrl, setLocalPhotoUrl] = useState(initPhoto || '');
  const [localPhotoFile, setLocalPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'usuarios', uid)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.phone != null && !phone) setLocalPhone(String(data.phone));
      if (data.notaPerfil != null && !initNota) setLocalNota(String(data.notaPerfil));
      if ((data.photoUrl || data.photoURL) && !initPhoto) {
        setLocalPhotoUrl(String(data.photoUrl || data.photoURL));
      }
    }).catch(() => { /* ignore */ });
  }, [uid, phone, initNota, initPhoto]);

  const previewName = localName.trim() || 'Tu nombre';
  const roleLabel = formatRoleLabel(role || '');
  const initials = profileInitials(previewName);
  const notaLen = localNota.trim().length;
  const NOTA_MAX = 48;

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Elige una imagen');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La foto debe pesar menos de 5 MB');
      return;
    }
    setLocalPhotoFile(file);
    setLocalPhotoUrl(URL.createObjectURL(file));
    setRemovePhoto(false);
  };

  const clearPhoto = () => {
    setLocalPhotoFile(null);
    setLocalPhotoUrl('');
    setRemovePhoto(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async () => {
    const authUid = getAuth().currentUser?.uid || uid;
    if (!authUid) { toast.error('ID de usuario no detectado'); return; }
    const trimmedName = localName.trim();
    if (!trimmedName) { toast.error('El nombre no puede quedar vacío'); return; }
    setSaving(true);
    try {
      let newPhoto = removePhoto ? '' : localPhotoUrl;
      // Nunca persistir blob: locales en Firestore / Auth
      if (newPhoto.startsWith('blob:')) {
        if (!localPhotoFile) {
          newPhoto = initPhoto && !initPhoto.startsWith('blob:') ? initPhoto : '';
        }
      }
      if (localPhotoFile) {
        try {
          const ref = storageRef(storage, `usuarios_fotos/${authUid}.jpg`);
          await uploadBytes(ref, localPhotoFile);
          newPhoto = await getDownloadURL(ref);
        } catch (storageErr: any) {
          console.warn('No se pudo subir la foto:', storageErr);
          toast.error(
            storageErr?.code === 'storage/unauthorized'
              ? 'Sin permiso para subir la foto. Se guardará el resto del perfil.'
              : 'No se pudo subir la foto. Se guardará el resto del perfil.',
          );
          newPhoto = initPhoto && !String(initPhoto).startsWith('blob:') ? initPhoto : '';
        }
      }
      const nota = localNota.trim().slice(0, NOTA_MAX);
      const phoneTrim = localPhone.trim();

      await setDoc(doc(db, 'usuarios', authUid), {
        name: trimmedName,
        nombre: trimmedName,
        phone: phoneTrim,
        photoUrl: newPhoto,
        notaPerfil: nota,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // Auth es opcional: si falla (p. ej. photoURL), el perfil en Firestore ya quedó.
      try {
        const authUser = getAuth().currentUser;
        if (authUser) {
          const authPhoto =
            newPhoto && /^https?:\/\//i.test(newPhoto) ? newPhoto : null;
          await updateProfile(authUser, {
            displayName: trimmedName,
            photoURL: authPhoto,
          });
        }
      } catch (authErr) {
        console.warn('Perfil Auth no actualizado:', authErr);
      }

      onUpdate({
        name: trimmedName,
        photoUrl: newPhoto,
        phone: phoneTrim,
        notaPerfil: nota,
        role: role || '',
        uid: authUid,
      });
      toast.success('¡Perfil actualizado!');
      onClose();
    } catch (e: any) {
      console.error('Error guardando perfil:', e);
      toast.error('Error: ' + (e?.message || 'Revisa permisos o conexión'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border overflow-hidden ag-card max-h-[92vh] flex flex-col"
        style={{ borderColor: 'var(--border-color)' }}
      >
        {/* Hero */}
        <div className="relative shrink-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-90"
            style={{
              background:
                'linear-gradient(145deg, rgba(var(--acc-rgb)/0.45) 0%, rgba(var(--acc-rgb)/0.08) 48%, transparent 72%)',
            }}
          />
          <div className="relative flex items-start justify-between p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider acc-text mb-0.5">Tu cuenta</p>
              <h3 id="profile-modal-title" className="text-lg font-bold ag-text tracking-tight">Editar perfil</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-2 rounded-xl ag-muted hover:ag-surface-hi transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative px-5 pb-5 flex flex-col items-center">
            <div className="relative">
              <div
                className="w-[5.5rem] h-[5.5rem] rounded-3xl overflow-hidden border-2 shadow-lg"
                style={{ borderColor: 'rgba(var(--acc-rgb)/0.55)', boxShadow: '0 8px 28px rgba(var(--acc-rgb)/0.25)' }}
              >
                {localPhotoUrl ? (
                  <img src={localPhotoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-2xl font-bold tracking-wide"
                    style={{ background: 'linear-gradient(145deg, var(--acc), rgba(var(--acc-rgb)/0.55))' }}
                  >
                    {initials}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Cambiar foto"
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full acc text-white flex items-center justify-center shadow-md border-2 border-transparent hover:opacity-90 transition-opacity"
                style={{ borderColor: 'var(--surface)' }}
              >
                <Camera size={16} />
              </button>
              <input
                type="file"
                ref={fileRef}
                onChange={(e) => pickPhoto(e.target.files?.[0])}
                accept="image/*"
                className="hidden"
              />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[11px] font-semibold acc-text hover:underline"
              >
                Cambiar foto
              </button>
              {localPhotoUrl && (
                <>
                  <span className="ag-faint text-[10px]">·</span>
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="text-[11px] font-semibold text-rose-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Quitar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto cs px-5 pb-2 space-y-4">
          {/* Preview */}
          <div className="rounded-2xl border ag-border p-3 ag-surface-hi">
            <p className="text-[10px] font-bold uppercase tracking-wider ag-faint mb-2">Así te ven los demás</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border ag-border">
                {localPhotoUrl ? (
                  <img src={localPhotoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: 'linear-gradient(145deg, var(--acc), rgba(var(--acc-rgb)/0.55))' }}
                  >
                    {initials}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold ag-text truncate">{previewName}</p>
                <p className="text-[11px] ag-muted truncate">
                  {localNota.trim() || 'En la app'} · {roleLabel}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 shrink-0">
                Conectado
              </span>
            </div>
          </div>

          {/* Identity */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider ag-muted">Identidad</p>
            <div>
              <label className="text-[11px] font-semibold ag-muted mb-1 block">Nombre visible</label>
              <input
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                maxLength={60}
                placeholder="Cómo quieres que te llamen"
                className="w-full px-3 py-2.5 rounded-xl border text-sm ag-input acc-ring"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold ag-muted">Estado / nota</label>
                <span className={`text-[10px] tabular-nums ${notaLen >= NOTA_MAX ? 'text-amber-400' : 'ag-faint'}`}>
                  {notaLen}/{NOTA_MAX}
                </span>
              </div>
              <input
                value={localNota}
                onChange={(e) => setLocalNota(e.target.value.slice(0, NOTA_MAX))}
                maxLength={NOTA_MAX}
                placeholder="Ej. En laboratorio · Disponible por WhatsApp"
                className="w-full px-3 py-2.5 rounded-xl border text-sm ag-input acc-ring"
              />
              <p className="mt-1 text-[10px] ag-faint leading-snug">
                Se muestra en Personal cuando estás conectado.
              </p>
            </div>
            <div>
              <label className="text-[11px] font-semibold ag-muted mb-1 block">Teléfono</label>
              <input
                type="tel"
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
                placeholder="Opcional · para contacto interno"
                className="w-full px-3 py-2.5 rounded-xl border text-sm ag-input acc-ring"
              />
            </div>
          </div>

          {/* Locked account */}
          <div className="space-y-2 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider ag-muted">Cuenta</p>
            <div className="rounded-2xl border ag-border divide-y ag-border overflow-hidden">
              <div className="flex items-center gap-3 px-3.5 py-3 ag-surface-hi">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10">
                  <Lock size={14} className="text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] ag-faint">Puesto</p>
                  <p className="text-sm font-medium ag-text truncate">{roleLabel || 'Sin puesto'}</p>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wide ag-faint shrink-0">Solo admin</span>
              </div>
              <div className="flex items-center gap-3 px-3.5 py-3 ag-surface-hi">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(var(--acc-rgb)/0.12)' }}>
                  <Lock size={14} className="acc-text" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] ag-faint">Email</p>
                  <p className="text-sm font-medium ag-text truncate">{email}</p>
                </div>
              </div>
            </div>
            <p className="text-[10px] ag-faint px-0.5">
              El puesto y el correo solo los cambia un administrador.
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-4 sm:p-5 border-t ag-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border ag-border ag-muted text-sm font-medium hover:ag-surface-hi transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 acc hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving && <Loader2 className="animate-spin w-4 h-4" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

type MenuItem = (typeof MENU_ITEMS)[number];

const MenuLoadingSkeleton = () => (
  <div className="min-h-full flex-shrink-0 ag-bg ag-mesh flex flex-col">
    <div className="h-16 border-b ag-border ag-header" />
    <div className="max-w-7xl mx-auto px-4 py-6 w-full space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="h-9 w-48 rounded-lg ag-skeleton" />
        <div className="h-10 w-64 rounded-xl ag-skeleton" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-[4.5rem] rounded-2xl ag-skeleton" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-32 rounded-2xl ag-skeleton" />)}
      </div>
    </div>
  </div>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

const WelcomeHero = ({
  firstName, roleLabel, formattedDate, searchTerm, onSearchChange, premium,
}: {
  firstName: string; roleLabel: string;
  formattedDate: string; searchTerm: string; onSearchChange: (v: string) => void;
  premium?: boolean;
}) => (
  <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 ${premium ? 'mb-8' : 'mb-6'}`}>
    <div className="min-w-0">
      {premium ? (
        <>
          <p className="text-[11px] font-medium tracking-[0.18em] uppercase ag-muted mb-2.5">
            {formattedDate}
            <span className="mx-2 opacity-40">·</span>
            {roleLabel}
          </p>
          <h2 className="text-[1.85rem] sm:text-[2.15rem] font-semibold ag-text tracking-tight leading-[1.1]">
            {getGreeting()}, <span className="ag-prem-hero-name">{firstName}</span>
          </h2>
        </>
      ) : (
        <>
          <h2 className="text-2xl sm:text-[1.75rem] font-bold ag-text tracking-tight leading-tight">
            {getGreeting()}, <span className="acc-text">{firstName}</span>
          </h2>
          <p className="text-xs sm:text-sm ag-muted mt-1 flex items-center gap-1.5 flex-wrap">
            <span>{formattedDate}</span>
            <span className="ag-faint">•</span>
            <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{roleLabel}</span>
          </p>
        </>
      )}
    </div>
    <div className="relative w-full sm:w-72 lg:w-80 shrink-0">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ag-faint pointer-events-none" aria-hidden />
      <input
        value={searchTerm}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Buscar módulo..."
        aria-label="Buscar módulo"
        className={`w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border ag-input ${premium ? 'ag-prem-search rounded-2xl py-3' : ''}`}
      />
      {searchTerm && (
        <button
          type="button"
          onClick={() => onSearchChange('')}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg ag-muted hover:ag-text transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  </div>
);

const MobileActionsMenu = ({
  open, onClose, viewMode, onToggleView, onOpenTheme, onLogout, formattedDate,
}: {
  open: boolean; onClose: () => void; viewMode: 'grid' | 'list';
  onToggleView: () => void; onOpenTheme: () => void; onLogout: () => void; formattedDate: string;
}) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.97 }}
        className="absolute right-0 top-12 w-52 rounded-2xl shadow-2xl border z-50 overflow-hidden ag-card py-1"
      >
        <p className="px-4 py-2 text-[10px] ag-faint border-b ag-border truncate">{formattedDate}</p>
        <button type="button" onClick={() => { onToggleView(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm ag-muted hover:ag-surface-hi transition-colors">
          {viewMode === 'grid' ? <AlignLeft size={16} /> : <LayoutGrid size={16} />}
          {viewMode === 'grid' ? 'Vista lista' : 'Vista cuadrícula'}
        </button>
        <button type="button" onClick={() => { onOpenTheme(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm ag-muted hover:ag-surface-hi transition-colors">
          <Palette size={16} />Personalización
        </button>
        <button type="button" onClick={() => { onLogout(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors">
          <LogOut size={16} />Cerrar sesión
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);

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
  item, index, isDisabled, onNavigate, hideCategory, badgeCount, disabledBadge = 'Bloqueado', disabledReason, premium,
}: { item: MenuItem; index: number; isDisabled: boolean; onNavigate: (id: string) => void; hideCategory?: boolean; badgeCount?: number; disabledBadge?: string; disabledReason?: string; premium?: boolean }) => {
  const rgb = getCategoryRgb(item.category);
  const blurb = MENU_BLURBS[item.id] || item.category;
  const sharedHandlers = {
    role: 'button' as const,
    tabIndex: isDisabled ? -1 : 0,
    'aria-disabled': isDisabled,
    'aria-label': isDisabled ? `${item.title} (${disabledReason || 'no disponible'})` : item.title,
    title: isDisabled ? (disabledReason || undefined) : undefined,
    onClick: () => !isDisabled && onNavigate(item.id),
    onMouseEnter: () => !isDisabled && prefetchMenuScreen(item.id),
    onFocus: () => !isDisabled && prefetchMenuScreen(item.id),
    onKeyDown: (e: React.KeyboardEvent) => activateMenuItem(e, isDisabled, () => onNavigate(item.id)),
  };

  if (premium) {
    return (
      <div
        {...sharedHandlers}
        className={`ag-prem-tile ${isDisabled ? 'is-disabled' : ''}`}
      >
        {isDisabled && (
          <span className="absolute top-3 right-3 z-20 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ag-badge">{disabledBadge}</span>
        )}
        {!isDisabled && badgeCount != null && badgeCount > 0 && (
          <span className="absolute top-3 right-3 z-20 min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-[9px] font-black rounded-full bg-amber-500 text-white shadow-sm">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        <div className="ag-prem-screen" aria-hidden>
          <div className="ag-prem-chrome"><i /><i /><i /></div>
          <div className="ag-prem-lines"><span /><span /><span /></div>
          <div className="ag-prem-icon-float">
            <item.icon className="w-[1.15rem] h-[1.15rem]" />
          </div>
        </div>
        <div className="ag-prem-meta">
          <h3 className="ag-prem-title">{item.title}</h3>
          <p className="ag-prem-blurb">{hideCategory ? blurb : `${item.category} · ${blurb}`}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }}
      whileTap={isDisabled ? {} : { scale: 0.97 }}
      {...sharedHandlers}
      className={`group relative rounded-[1.35rem] border p-4 sm:p-5 min-h-[8rem] sm:min-h-[8.5rem] cursor-pointer card-interact ag-card ag-menu-card overflow-hidden
        ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
      `}
    >
      {isDisabled && (
        <span className="absolute top-3 right-3 z-20 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ag-badge">{disabledBadge}</span>
      )}
      {!isDisabled && badgeCount != null && badgeCount > 0 && (
        <span className="absolute top-3 right-3 z-20 min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-[9px] font-black rounded-full bg-amber-500 text-white shadow-sm">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-[1.35rem]"
        style={{ background: `radial-gradient(circle at 18% 88%, rgba(${rgb}/0.16) 0%, transparent 62%)` }}
      />
      <div className="relative z-10 flex flex-col h-full gap-3.5">
        <div
          className="ag-tile-icon p-3 rounded-2xl w-fit border"
          style={{ background: `rgba(${rgb}/0.13)`, borderColor: `rgba(${rgb}/0.22)`, boxShadow: `inset 0 0 0 1px rgba(${rgb}/0.05)` }}
        >
          <item.icon className="w-5 h-5 sm:w-[1.4rem] sm:h-[1.4rem]" style={{ color: `rgb(${rgb})` }} />
        </div>
        <div className="mt-auto">
          <h3 className="text-[15px] sm:text-base font-semibold ag-text leading-snug tracking-tight">{item.title}</h3>
          {!hideCategory && (
            <span
              className="text-[10px] uppercase font-bold tracking-wide mt-1.5 inline-block px-2 py-0.5 rounded-md"
              style={{ color: `rgb(${rgb})`, background: `rgba(${rgb}/0.12)` }}
            >
              {item.category}
            </span>
          )}
        </div>
      </div>
      {!isDisabled && (
        <ChevronRight
          className="ag-arrow absolute bottom-4 right-4 z-10 w-4 h-4"
          style={{ color: `rgb(${rgb})` }}
          aria-hidden
        />
      )}
    </motion.div>
  );
};

const MenuListRow = ({
  item, index, isDisabled, onNavigate, badgeCount, disabledBadge = 'Bloqueado', disabledReason, premium,
}: { item: MenuItem; index: number; isDisabled: boolean; onNavigate: (id: string) => void; badgeCount?: number; disabledBadge?: string; disabledReason?: string; premium?: boolean }) => {
  const rgb = getCategoryRgb(item.category);
  const blurb = MENU_BLURBS[item.id] || item.category;
  const sharedHandlers = {
    role: 'button' as const,
    tabIndex: isDisabled ? -1 : 0,
    'aria-disabled': isDisabled,
    'aria-label': isDisabled ? `${item.title} (${disabledReason || 'no disponible'})` : item.title,
    title: isDisabled ? (disabledReason || undefined) : undefined,
    onClick: () => !isDisabled && onNavigate(item.id),
    onMouseEnter: () => !isDisabled && prefetchMenuScreen(item.id),
    onFocus: () => !isDisabled && prefetchMenuScreen(item.id),
    onKeyDown: (e: React.KeyboardEvent) => activateMenuItem(e, isDisabled, () => onNavigate(item.id)),
  };

  if (premium) {
    return (
      <div {...sharedHandlers} className={`ag-prem-row ${isDisabled ? 'is-disabled' : ''}`}>
        <div className="ag-prem-thumb" aria-hidden>
          <item.icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold ag-text tracking-tight truncate">{item.title}</p>
          <p className="text-[11px] ag-muted truncate mt-0.5">{blurb}</p>
        </div>
        {isDisabled && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ag-badge">{disabledBadge}</span>
        )}
        {!isDisabled && badgeCount != null && badgeCount > 0 && (
          <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-[9px] font-black rounded-full bg-amber-500 text-white">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        {!isDisabled && <ChevronRight className="w-4 h-4 ag-faint shrink-0 opacity-50" />}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.012 }}
      whileTap={isDisabled ? {} : { scale: 0.99 }}
      {...sharedHandlers}
      className={`group flex items-center gap-3.5 px-3.5 py-3 sm:py-3.5 rounded-2xl border cursor-pointer card-interact ag-card ag-menu-card min-h-[3.5rem]
        ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
      `}
    >
      <div className="ag-tile-icon p-2.5 rounded-xl border" style={{ background: `rgba(${rgb}/0.13)`, borderColor: `rgba(${rgb}/0.22)` }}>
        <item.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: `rgb(${rgb})` }} />
      </div>
      <span className="flex-1 text-sm sm:text-[15px] font-medium ag-text tracking-tight">{item.title}</span>
      {isDisabled && (
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ag-badge">{disabledBadge}</span>
      )}
      {!isDisabled && badgeCount != null && badgeCount > 0 && (
        <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-[9px] font-black rounded-full bg-amber-500 text-white">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
      <span
        className="text-[10px] uppercase font-bold hidden sm:inline px-2 py-0.5 rounded-md"
        style={{ color: `rgb(${rgb})`, background: `rgba(${rgb}/0.12)` }}
      >
        {item.category}
      </span>
      {!isDisabled && <ChevronRight className="w-4 h-4 ag-faint group-hover:acc-text transition-colors opacity-60 group-hover:opacity-100 flex-shrink-0" />}
    </motion.div>
  );
};

export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { logout, user } = useAuth();
  const [localUser, setLocalUser] = useState<UserData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [assignedServices, setAssignedServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [patronAlertCount, setPatronAlertCount] = useState(0);
  const [worksheetQueueCount, setWorksheetQueueCount] = useState(0);
  const pendingJuntaSyncRef = useRef<Set<string>>(new Set());

  const [patronBannerDismissed, setPatronBannerDismissed] = useState(isPatronBannerDismissed);
  const [novedadesWidgetHidden, setNovedadesWidgetHiddenState] = useState(false);
  const [selectedNovedad, setSelectedNovedad] = useState<AppUpdate | null>(null);
  const [novedadesSeenRevision, setNovedadesSeenRevision] = useState(0);
  const [showComposeNovedad, setShowComposeNovedad] = useState(false);

  const { allUpdates } = useAppUpdates();

  const uid =
    auth.currentUser?.uid ||
    (user as { uid?: string; id?: string } | null)?.uid ||
    (user as { uid?: string; id?: string } | null)?.id ||
    '';
  const email = (user as { email?: string } | null)?.email || '';

  const { prefs, setPrefs, loading: loadingPrefs } = useUserPrefs(uid);
  const viewMode = prefs.viewMode;
  const setViewMode = (v: 'grid' | 'list') => setPrefs({ viewMode: v });
  const isPremiumMenu = prefs.menuStyle !== 'classic';

  useEffect(() => {
    if (uid) setNovedadesWidgetHiddenState(isNovedadesWidgetHidden(uid));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void ensureHojasServicioIdsReparados()
      .then((r) => {
        const msg = mensajeReparacionHojasServicio(r);
        if (msg) toast.success(msg);
      })
      .catch((err) => console.error("[MainMenu] Reparación hojas de servicio:", err));
  }, [uid]);

  useEffect(() => {
    const refreshQueue = () => setWorksheetQueueCount(getTotalWorksheetQueueCount());
    refreshQueue();

    const onQueueSync = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        pendingCount?: number;
        uploaded?: number;
        recovered?: number;
        message?: string;
      };
      if (typeof detail?.pendingCount === 'number') setWorksheetQueueCount(detail.pendingCount);
      else refreshQueue();
      if (detail?.uploaded && detail.uploaded > 0) {
        toast.success(detail.message || `${detail.uploaded} hoja(s) sincronizada(s).`);
      } else if (detail?.recovered && detail.recovered > 0 && detail.message) {
        toast.warning(detail.message);
      }
    };

    const onSaveComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail as { success?: boolean; queuedOffline?: boolean; message?: string };
      refreshQueue();
      if (detail?.message) {
        if (detail.success) {
          toast[detail.queuedOffline ? 'warning' : 'success'](detail.message);
        } else {
          toast.error(detail.message);
        }
      }
    };

    window.addEventListener('ag-worksheet-queue-sync', onQueueSync);
    window.addEventListener('ag-worksheet-save-complete', onSaveComplete);
    return () => {
      window.removeEventListener('ag-worksheet-queue-sync', onQueueSync);
      window.removeEventListener('ag-worksheet-save-complete', onSaveComplete);
    };
  }, []);

  const handleNovedadesWidgetHiddenChange = useCallback((hidden: boolean) => {
    setNovedadesWidgetHiddenState(hidden);
    if (uid) setNovedadesWidgetHidden(uid, hidden);
  }, [uid]);

  const handleDismissNovedadModal = useCallback(() => {
    if (selectedNovedad && uid) {
      markUpdateSeen(uid, selectedNovedad.id);
      setNovedadesSeenRevision((r) => r + 1);
    }
    setSelectedNovedad(null);
  }, [selectedNovedad, uid]);

  useEffect(() => {
    if (!user) return;
    const userUid =
      auth.currentUser?.uid ||
      (user as { uid?: string; id?: string }).uid ||
      (user as { uid?: string; id?: string }).id ||
      '';
    setLocalUser({
      uid: userUid,
      email: user.email || '',
      name: (user.name || '').trim(),
      role: ((user as { puesto?: string }).puesto || user.role || '').trim().toLowerCase(),
      photoUrl: (user as { photoUrl?: string; photoURL?: string }).photoUrl
        || (user as { photoUrl?: string; photoURL?: string }).photoURL
        || auth.currentUser?.photoURL
        || undefined,
      phone: (user as { phone?: string }).phone,
    });
    if (!userUid) return;
    getDoc(doc(db, 'usuarios', userUid)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setLocalUser((prev) => prev ? {
        ...prev,
        name: String(data.name || data.nombre || prev.name || '').trim() || prev.name,
        phone: data.phone != null ? String(data.phone) : prev.phone,
        photoUrl: String(data.photoUrl || data.photoURL || prev.photoUrl || '') || prev.photoUrl,
        notaPerfil: data.notaPerfil != null ? String(data.notaPerfil) : prev.notaPerfil,
        role: String(data.puesto || data.role || prev.role || '').trim().toLowerCase() || prev.role,
      } : prev);
    }).catch(() => { /* ignore */ });
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
          autorNombre: data.autorNombre || '', autorUid: data.autorUid || '',
          tipo: data.tipo || '',
          navigateTo: data.navigateTo || screenFromNotifTipo(data.tipo) || (data.tipo === 'recordatorio_confirmacion_junta' ? 'calendario' : undefined),
          servicioId: data.servicioId || '' } as AppNotification;
      })),
      err => console.error('Notificaciones:', err)
    );
  }, [uid]);

  const isAdmin      = useMemo(() => !!(localUser && (localUser.role.includes('admin') || localUser.role.includes('administrativo') || SUPER_ADMINS.includes(localUser.email))), [localUser]);
  const isCalidad    = useMemo(() => !!(localUser?.role.includes('calidad')), [localUser]);
  const canCreateNovedades = useMemo(
    () => canCreateAppNovedades(user ?? (localUser ? { role: localUser.role, puesto: localUser.role } : null)),
    [user, localUser],
  );
  const novedadesForUser = useMemo(
    () => getUpdatesForUser(uid, user, allUpdates),
    [uid, user, allUpdates],
  );
  const isJefe       = useMemo(() => !!(localUser?.role.includes('admin') || localUser?.role.includes('gerente')), [localUser]);
  const canSeePatronAlerts = useMemo(
    () => isCalidadRole(localUser?.role) || isJefe || isCalidad,
    [localUser, isJefe, isCalidad],
  );

  useEffect(() => {
    if (!canSeePatronAlerts) {
      setPatronAlertCount(0);
      return;
    }
    getDocs(query(collection(db, COLLECTION_PATRONES)))
      .then(snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPatronAlertCount(countPatronesEnAlerta(rows));
      })
      .catch(() => setPatronAlertCount(0));
  }, [canSeePatronAlerts]);

  const dismissPatronBanner = useCallback(() => {
    try { localStorage.setItem(PATRON_BANNER_DISMISS_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setPatronBannerDismissed(true);
  }, []);

  const handleMarkRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await updateDoc(doc(db, 'notificaciones', id), { readBy: arrayUnion(uid) }); } catch {}
  }, [uid]);

  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await Promise.all(
      unread.map(n => updateDoc(doc(db, 'notificaciones', n.id), { readBy: arrayUnion(uid) }).catch(() => {})),
    );
  }, [notifications, uid]);

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

  useEffect(() => {
    pendingJuntaSyncRef.current = new Set();
  }, [uid]);

  // Recordatorios de confirmación de asistencia a juntas pendientes
  useEffect(() => {
    if (!uid) return;

    const pendingJuntas = assignedServices.filter(s => {
      if ((s.tipo || '').toLowerCase() !== 'junta') return false;
      if (usuarioYaConfirmoJunta(s.enterados || [], uid, email)) return false;
      const st = (s.estado || '').toLowerCase();
      if (['finalizado', 'cancelado'].includes(st)) return false;
      if (!s.fecha) return true;
      const d = parseISO(s.fecha);
      if (!isValid(d)) return true;
      return differenceInDays(d, new Date()) >= -1;
    });

    const pendingIds = new Set(pendingJuntas.map(s => s.id));

    void (async () => {
      for (const s of pendingJuntas) {
        const titulo = (s.titulo || s.elemento || 'Junta').trim();
        const fechaFmt =
          s.fecha && isValid(parseISO(s.fecha))
            ? format(parseISO(s.fecha), 'dd MMM yyyy', { locale: es })
            : undefined;
        try {
          await upsertRecordatorioConfirmacionJunta({
            uid,
            servicioId: s.id,
            eventoTitulo: titulo,
            eventoFecha: fechaFmt,
          });
        } catch (err) {
          console.error('Recordatorio junta:', err);
        }
      }
      for (const prevId of pendingJuntaSyncRef.current) {
        if (!pendingIds.has(prevId)) {
          try {
            await eliminarRecordatorioConfirmacionJunta(prevId, uid);
          } catch {
            /* ignore */
          }
        }
      }
      pendingJuntaSyncRef.current = pendingIds;
    })();
  }, [assignedServices, uid, email]);

  const isSuperAdmin = useMemo(() => SUPER_ADMINS.includes(localUser?.email || ''), [localUser]);
  const canBroadcast = isAdmin || isCalidad || isSuperAdmin;

  const isAdministrativo = useMemo(
    () => !!(localUser?.role.includes('administrativo') || localUser?.role.includes('admin')),
    [localUser],
  );

  const isMetrologo = useMemo(
    () =>
      !!(
        localUser &&
        isMetrologyRole({
          id: localUser.uid || uid,
          puesto: localUser.role,
          role: localUser.role,
        })
      ),
    [localUser, uid],
  );

  const isJorge = useMemo(
    () =>
      isJorgeAmador({
        id: localUser?.uid || uid,
        email: localUser?.email,
        nombre: localUser?.name,
        name: localUser?.name,
        role: localUser?.role,
        puesto: localUser?.role,
      }),
    [localUser, uid],
  );

  const personalVisibility: PersonalVisibility | null = useMemo(() => {
    if (isJorge || isAdmin || isSuperAdmin) return 'todos';
    if (isCalidad) return 'tecnicos';
    if (isMetrologo) return 'calidad';
    return null;
  }, [isJorge, isAdmin, isSuperAdmin, isCalidad, isMetrologo]);

  const showPersonalWidget = personalVisibility !== null;

  // Formatos Máster: calidad/admin/gerencia gestionan; metrólogos entran en modo consulta (solo descarga).
  // El puesto puede venir con o sin acento ("Metrólogo" / "Metrologo").
  const canOpenFormatos = useMemo(
    () => isAdmin || isCalidad || isJefe || isSuperAdmin || /metr[oó]l/i.test(localUser?.role || ''),
    [isAdmin, isCalidad, isJefe, isSuperAdmin, localUser],
  );

  // Permisos TR: solo con asignación Celestica activa programada para hoy.
  const canOpenPermisosTR = useMemo(
    () => hasCelesticaAsignacionHoy(assignedServices, getHoyFechaLocal()),
    [assignedServices],
  );

  const getMenuItemDisabled = useCallback((itemId: string): { disabled: boolean; badge?: string; reason?: string } => {
    if (itemId === 'formatos' && !canOpenFormatos) {
      return {
        disabled: true,
        badge: 'Rol',
        reason: 'Solo Calidad, Admin o Metrólogo',
      };
    }
    if (itemId === 'permisos-trabajo' && !canOpenPermisosTR) {
      return {
        disabled: true,
        badge: 'Celestica',
        reason: 'Solo disponible con asignación Celestica de hoy',
      };
    }
    return { disabled: false };
  }, [canOpenFormatos, canOpenPermisosTR]);

  const permittedMenu = useMemo(() => {
    if (!localUser) return [];
    return MENU_ITEMS.filter(item => {
      if (item.id === 'calibration-stats') return isJefe || isSuperAdmin;
      if (['programa-calibracion', 'control-prestamos'].includes(item.id)) return isJefe || isCalidad || isSuperAdmin;
      if (item.id === 'control-vacaciones-rh') return isAdministrativo || isSuperAdmin;
      if (item.id === 'gestion-usuarios') {
        return isSuperAdmin || isAdmin || isCalidad || isJefe;
      }
      return true;
    });
  }, [localUser, isJefe, isCalidad, isSuperAdmin, isAdministrativo, isAdmin]);

  const filteredMenu = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return permittedMenu.filter(i => !term || i.title.toLowerCase().includes(term));
  }, [permittedMenu, searchTerm]);

  const menuGroups = useMemo(() => groupMenuByCategory(filteredMenu), [filteredMenu]);
  const isSearching = searchTerm.trim().length > 0;
  const roleLabel = formatRoleLabel(localUser?.role || '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowNotif(false);
      setShowTheme(false);
      setShowProfile(false);
      setShowMobileMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const today = format(new Date(), "EEEE d 'de' MMMM", { locale: es });
  const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

  if (!localUser || loadingPrefs) return <MenuLoadingSkeleton />;

  const firstName = resolveFirstName(localUser.name);
  const clearFilters = () => { setSearchTerm(''); };

  const showNovedades = !novedadesWidgetHidden && (novedadesForUser.length > 0 || canCreateNovedades);

  const novedadesWidget = showNovedades ? (
    <NovedadesWidget
      uid={uid}
      user={user}
      updates={novedadesForUser}
      seenRevision={novedadesSeenRevision}
      canCreate={canCreateNovedades}
      onSelect={setSelectedNovedad}
      onCompose={() => setShowComposeNovedad(true)}
      onHide={() => handleNovedadesWidgetHiddenChange(true)}
      premium={isPremiumMenu}
    />
  ) : null;

  const personalWidgetDesktop =
    showPersonalWidget && personalVisibility ? (
      <TechnicianStatusWidget visibility={personalVisibility} premium={isPremiumMenu} />
    ) : null;
  const personalWidgetMobile =
    showPersonalWidget && personalVisibility ? (
      <TechnicianStatusWidget visibility={personalVisibility} premium={isPremiumMenu} />
    ) : null;

  const widgetsDesktop = (
    <div className="flex flex-col gap-4 min-h-64">
      {novedadesWidget}
      {personalWidgetDesktop}
      <ServicesWidget services={assignedServices} navigateTo={navigateTo} loading={loadingServices} premium={isPremiumMenu} />
    </div>
  );

  return (
    <>
      <Toaster position="top-center" toastOptions={{ duration: 2800, style: { borderRadius: 12, fontSize: 13, fontWeight: 600 } }} />
      <ThemeStyle />
      <div className={`min-h-full flex-shrink-0 flex flex-col font-sans ag-bg ag-text transition-colors relative ${isPremiumMenu ? 'ag-prem-mesh' : 'ag-mesh'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

        {/* HEADER */}
        <header className="sticky top-0 z-40 border-b ag-header shadow-sm" style={{ backdropFilter: 'blur(20px)' }}>
          <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <img
                src={labLogo}
                alt="Equipos y Servicios AG"
                className="h-9 sm:h-10 w-auto object-contain shrink-0"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="hidden sm:block min-w-0">
                <p className="text-sm font-bold ag-text truncate">Equipos y Servicios AG</p>
                <p className="text-[10px] ag-faint truncate">Sistema de gestión metrológica</p>
              </div>
            </div>

            <div className="hidden lg:block text-xs font-medium ag-muted truncate max-w-[14rem] xl:max-w-none">{formattedDate}</div>

            <div className="flex items-center gap-0.5 sm:gap-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowNotif(v => !v); setShowTheme(false); setShowMobileMenu(false); }}
                  aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
                  aria-expanded={showNotif}
                  className="relative p-2.5 rounded-xl ag-muted acc-hover transition-all"
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-0.5 flex items-center justify-center text-[9px] font-bold rounded-full acc text-white" aria-hidden>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {showNotif && (
                    <NotificationPanel notifications={notifications} onClose={() => setShowNotif(false)}
                      onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead} onDelete={handleDeleteNotif} canBroadcast={canBroadcast} uid={uid}
                      onNavigate={screen => { navigateTo(screen as Parameters<typeof navigateTo>[0]); setShowNotif(false); }} />
                  )}
                </AnimatePresence>
              </div>

              <div className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => { setShowTheme(v => !v); setShowNotif(false); }}
                  aria-label="Personalización"
                  aria-expanded={showTheme}
                  className="p-2.5 rounded-xl ag-muted acc-hover transition-all"
                  title="Mi personalización"
                >
                  <Palette size={18} />
                </button>
                <AnimatePresence>
                  {showTheme && (
                    <ThemeSelector
                      prefs={prefs}
                      setPrefs={setPrefs}
                      onClose={() => setShowTheme(false)}
                      novedadesWidgetHidden={novedadesWidgetHidden}
                      onNovedadesWidgetHiddenChange={handleNovedadesWidgetHiddenChange}
                    />
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                aria-label={viewMode === 'grid' ? 'Cambiar a vista lista' : 'Cambiar a vista cuadrícula'}
                className="hidden md:flex p-2.5 rounded-xl ag-muted acc-hover transition-all"
              >
                {viewMode === 'grid' ? <AlignLeft size={18} /> : <LayoutGrid size={18} />}
              </button>

              <div className="hidden md:block w-px h-6 mx-1 ag-border" />

              <button
                type="button"
                onClick={() => setShowProfile(true)}
                aria-label="Editar perfil"
                className="flex items-center gap-2 px-2 py-1.5 rounded-xl border ag-border acc-hover transition-all"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center ag-surface-hi ring-1 ring-white/5">
                  {localUser.photoUrl ? <img src={localUser.photoUrl} className="w-full h-full object-cover" alt="" /> : <User className="w-3.5 h-3.5 ag-muted" />}
                </div>
                <span className="text-xs font-medium ag-text hidden lg:block">{firstName}</span>
              </button>

              <button type="button" onClick={logout} aria-label="Cerrar sesión" className="hidden md:flex p-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all">
                <LogOut size={18} />
              </button>

              <div className="relative md:hidden">
                <button
                  type="button"
                  onClick={() => { setShowMobileMenu(v => !v); setShowNotif(false); setShowTheme(false); }}
                  aria-label="Más opciones"
                  aria-expanded={showMobileMenu}
                  className="p-2.5 rounded-xl ag-muted acc-hover transition-all"
                >
                  <MoreHorizontal size={18} />
                </button>
                <MobileActionsMenu
                  open={showMobileMenu}
                  onClose={() => setShowMobileMenu(false)}
                  viewMode={viewMode}
                  onToggleView={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  onOpenTheme={() => setShowTheme(true)}
                  onLogout={logout}
                  formattedDate={formattedDate}
                />
              </div>
            </div>
          </div>
          <AnimatePresence>
            {showTheme && (
              <div className="md:hidden relative max-w-7xl mx-auto px-4 pb-3">
                <ThemeSelector
                  prefs={prefs}
                  setPrefs={setPrefs}
                  onClose={() => setShowTheme(false)}
                  novedadesWidgetHidden={novedadesWidgetHidden}
                  onNovedadesWidgetHiddenChange={handleNovedadesWidgetHiddenChange}
                />
              </div>
            )}
          </AnimatePresence>
        </header>

        {canSeePatronAlerts && patronAlertCount > 0 && !patronBannerDismissed && (
          <div className="max-w-7xl mx-auto px-4 pt-3 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-amber-500/5 px-4 py-3.5 text-sm shadow-sm">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/20 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold ag-text">
                    {patronAlertCount} patrón{patronAlertCount !== 1 ? 'es' : ''} requieren atención de calibración
                  </p>
                  <p className="text-xs ag-muted mt-0.5">
                    Revisa el calendario para vencimientos (avisos a 30, 15, 7, 3 y 1 día).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => navigateTo('calendario')}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold text-white acc hover:opacity-90 transition-opacity"
                >
                  Ver calendario
                </button>
                <button type="button" onClick={dismissPatronBanner} className="p-2 rounded-lg ag-muted hover:ag-text" aria-label="Cerrar aviso">
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN */}
        <main className="flex-1 max-w-7xl mx-auto px-4 py-5 sm:py-6 w-full">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start">

            {/* Widgets — carrusel móvil / tablet */}
            <div className="lg:hidden order-1">
              <p className={isPremiumMenu ? 'ag-prem-section-label mb-2.5 px-0.5' : 'text-[10px] font-bold uppercase tracking-wider ag-muted mb-2.5 px-0.5'}>Resumen rápido</p>
              <div className="flex gap-3 overflow-x-auto ag-widgets-scroll snap-x snap-mandatory pb-1 -mx-4 px-4">
                {novedadesWidget && (
                  <div className="snap-start shrink-0 w-[min(88vw,20rem)]">{novedadesWidget}</div>
                )}
                {personalWidgetMobile && (
                  <div className="snap-start shrink-0 w-[min(88vw,20rem)]">{personalWidgetMobile}</div>
                )}
                <div className="snap-start shrink-0 w-[min(88vw,20rem)] min-h-[16rem]">
                  <ServicesWidget services={assignedServices} navigateTo={navigateTo} loading={loadingServices} premium={isPremiumMenu} />
                </div>
              </div>
            </div>

            <div className="flex-1 order-2 lg:order-1 min-w-0">
              <WelcomeHero
                firstName={firstName}
                roleLabel={roleLabel}
                formattedDate={formattedDate}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                premium={isPremiumMenu}
              />

              {!isSearching && (
                <div className={`flex items-center justify-between ${isPremiumMenu ? 'mb-5' : 'mb-4'}`}>
                  <h3 className={`ag-text flex items-center gap-2 ${isPremiumMenu ? 'text-[11px] font-semibold tracking-[0.18em] uppercase ag-muted' : 'text-sm font-semibold'}`}>
                    {isPremiumMenu ? 'Módulos' : (<><LayoutGrid className="w-4 h-4 acc-text" /> Tus módulos</>)}
                  </h3>
                  <span className="text-xs ag-faint font-medium tabular-nums">{filteredMenu.length} disponibles</span>
                </div>
              )}

              <AnimatePresence mode="wait">
                {filteredMenu.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`flex flex-col items-center justify-center py-16 gap-4 rounded-2xl border ag-border ag-card ${isPremiumMenu ? '' : 'ag-menu-card'}`}
                  >
                    <div className="p-4 rounded-2xl ag-surface-hi">
                      <Search className="w-10 h-10 ag-faint opacity-40" aria-hidden />
                    </div>
                    <p className="text-sm ag-muted text-center px-4 max-w-xs">
                      {isSearching
                        ? `Ningún módulo coincide con tu búsqueda${searchTerm ? ` «${searchTerm}»` : ''}`
                        : 'No hay módulos disponibles'}
                    </p>
                    {isSearching && (
                      <button type="button" onClick={clearFilters} className="text-xs acc-text font-semibold hover:underline px-4 py-2 rounded-lg acc-soft">
                        Limpiar filtros
                      </button>
                    )}
                  </motion.div>
                ) : viewMode === 'grid' ? (
                  <motion.div key="grid" initial={isPremiumMenu ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className={isSearching ? 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4' : isPremiumMenu ? 'space-y-8' : 'space-y-5'}
                  >
                    {(isSearching ? [{ category: '', items: filteredMenu }] : menuGroups).map(({ category, items }) => {
                      const rgb = getCategoryRgb(category);
                      return (
                        <div key={category || 'search'} className={isSearching ? 'contents' : isPremiumMenu ? '' : 'ag-section'}>
                          {!isSearching && (
                            isPremiumMenu ? (
                              <div className="flex items-baseline justify-between mb-3.5 px-0.5">
                                <h3 className="ag-prem-section-label">{category}</h3>
                                <span className="text-[11px] ag-faint tabular-nums">{items.length}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5 mb-4">
                                <span className="w-1.5 h-5 rounded-full" style={{ background: `rgb(${rgb})`, boxShadow: `0 0 12px rgba(${rgb}/0.5)` }} />
                                <h3 className="text-[13px] font-bold uppercase tracking-wider ag-text">{category}</h3>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: `rgb(${rgb})`, background: `rgba(${rgb}/0.12)` }}>{items.length}</span>
                              </div>
                            )
                          )}
                          <div className={isSearching ? 'contents' : 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4'}>
                            {items.map((item, i) => {
                              const disabledState = getMenuItemDisabled(item.id);
                              return (
                              <MenuGridCard
                                key={item.id}
                                item={item}
                                index={i}
                                hideCategory={!isSearching}
                                isDisabled={disabledState.disabled}
                                disabledBadge={disabledState.badge}
                                disabledReason={disabledState.reason}
                                onNavigate={navigateTo}
                                premium={isPremiumMenu}
                                badgeCount={
                                  item.id === 'calendario' && canSeePatronAlerts
                                    ? patronAlertCount
                                    : item.id === 'consecutivos' && worksheetQueueCount > 0
                                      ? worksheetQueueCount
                                      : undefined
                                }
                              />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div key="list" initial={isPremiumMenu ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={isPremiumMenu ? 'space-y-6' : 'space-y-4'}>
                    {(isSearching ? [{ category: '', items: filteredMenu }] : menuGroups).map(({ category, items }) => {
                      const rgb = getCategoryRgb(category);
                      return (
                        <div key={category || 'all'}>
                          {!isSearching && (
                            isPremiumMenu ? (
                              <div className="flex items-baseline justify-between mb-2.5 px-0.5">
                                <h3 className="ag-prem-section-label">{category}</h3>
                                <span className="text-[11px] ag-faint tabular-nums">{items.length}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5 mb-2.5 px-1">
                                <span className="w-1.5 h-4 rounded-full" style={{ background: `rgb(${rgb})`, boxShadow: `0 0 12px rgba(${rgb}/0.5)` }} />
                                <h3 className="text-[11px] font-bold uppercase tracking-wider ag-text">{category}</h3>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: `rgb(${rgb})`, background: `rgba(${rgb}/0.12)` }}>{items.length}</span>
                              </div>
                            )
                          )}
                          <div className="space-y-2">
                            {items.map((item, i) => {
                              const disabledState = getMenuItemDisabled(item.id);
                              return (
                              <MenuListRow
                                key={item.id}
                                item={item}
                                index={i}
                                isDisabled={disabledState.disabled}
                                disabledBadge={disabledState.badge}
                                disabledReason={disabledState.reason}
                                onNavigate={navigateTo}
                                premium={isPremiumMenu}
                                badgeCount={
                                  item.id === 'calendario' && canSeePatronAlerts
                                    ? patronAlertCount
                                    : item.id === 'consecutivos' && worksheetQueueCount > 0
                                      ? worksheetQueueCount
                                      : undefined
                                }
                              />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Widgets — sidebar desktop */}
            <div className="hidden lg:flex lg:w-80 flex-col gap-4 lg:order-2 lg:sticky lg:top-[4.5rem] lg:self-start">
              <p className={isPremiumMenu ? 'ag-prem-section-label px-0.5' : 'text-[10px] font-bold uppercase tracking-wider ag-muted px-0.5'}>Resumen</p>
              {widgetsDesktop}
            </div>
          </div>
        </main>

        <WhatsNewModal update={selectedNovedad} onDismiss={handleDismissNovedadModal} />

        {canCreateNovedades && (
          <NovedadesComposeModal
            open={showComposeNovedad}
            onClose={() => setShowComposeNovedad(false)}
            autorUid={uid}
            autorNombre={localUser.name}
          />
        )}

        <AnimatePresence>
          {showProfile && localUser && (
            <ProfileModal currentUser={localUser} onClose={() => setShowProfile(false)}
              onUpdate={d => setLocalUser(p => p ? { ...p, ...d } : null)} />
          )}
        </AnimatePresence>

        {(showTheme || showNotif || showMobileMenu) && (
          <div
            className="fixed inset-0 z-30"
            aria-hidden
            onClick={() => { setShowTheme(false); setShowNotif(false); setShowMobileMenu(false); }}
          />
        )}
      </div>
    </>
  );
};

export default MainMenu;