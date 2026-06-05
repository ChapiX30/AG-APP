import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type QuerySnapshot,
} from 'firebase/firestore';
import { format } from 'date-fns';
import type { AppUpdate } from '../config/appUpdates';
import { APP_UPDATES } from '../config/appUpdates';
import { db } from './firebase';

export const COLLECTION_APP_NOVEDADES = 'appNovedades';

export const APP_SCREEN_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Sin enlace a pantalla' },
  { id: 'solicitud-vacaciones', label: 'Vacaciones' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'friday-servicios', label: 'Servicios' },
  { id: 'friday', label: 'Friday Projects' },
  { id: 'drive', label: 'Drive' },
  { id: 'formatos', label: 'Formatos Máster' },
  { id: 'permisos-trabajo', label: 'Permisos TR' },
  { id: 'hoja-servicio', label: 'Hoja de Servicio' },
  { id: 'programa-calibracion', label: 'Patrones' },
  { id: 'vencimientos', label: 'Vencimientos' },
  { id: 'entrada-salida', label: 'Hoja de Salida' },
];

type NovedadDoc = {
  title?: string;
  summary?: string;
  highlights?: string[];
  date?: string;
  screenId?: string;
  screenLabel?: string;
  roles?: string[];
  activo?: boolean;
  createdAt?: { toMillis?: () => number };
};

export function canCreateAppNovedades(
  user?: { role?: string; puesto?: string } | null,
): boolean {
  const text = `${user?.puesto ?? ''} ${user?.role ?? ''}`.toLowerCase();
  return text.includes('calidad') || text.includes('administrativo');
}

function docToAppUpdate(id: string, data: NovedadDoc): AppUpdate | null {
  if (data.activo === false) return null;
  if (!data.title?.trim() || !data.summary?.trim()) return null;
  return {
    id,
    date: data.date || format(new Date(), 'yyyy-MM-dd'),
    title: data.title.trim(),
    summary: data.summary.trim(),
    highlights: Array.isArray(data.highlights)
      ? data.highlights.map((h) => String(h).trim()).filter(Boolean)
      : [],
    screenId: data.screenId?.trim() || undefined,
    screenLabel: data.screenLabel?.trim() || undefined,
    roles: Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : undefined,
  };
}

export function mergeAppUpdates(firestoreUpdates: AppUpdate[]): AppUpdate[] {
  const byId = new Map<string, AppUpdate>();
  for (const u of APP_UPDATES) byId.set(u.id, u);
  for (const u of firestoreUpdates) byId.set(u.id, u);
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function mapNovedadesSnapshot(snap: QuerySnapshot): AppUpdate[] {
  return snap.docs
    .map((d) => docToAppUpdate(d.id, d.data() as NovedadDoc))
    .filter((u): u is AppUpdate => u != null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function subscribeAppNovedades(onChange: (updates: AppUpdate[]) => void): () => void {
  return onSnapshot(
    collection(db, COLLECTION_APP_NOVEDADES),
    (snap) => onChange(mapNovedadesSnapshot(snap)),
    (err) => {
      console.error('appNovedades:', err);
      onChange([]);
    },
  );
}

export async function createAppNovedad(params: {
  title: string;
  summary: string;
  highlights: string[];
  date: string;
  screenId?: string;
  screenLabel?: string;
  roles?: string[];
  autorUid: string;
  autorNombre: string;
}): Promise<string> {
  const screenId = params.screenId?.trim() || '';
  const screenLabel = params.screenLabel?.trim() || '';
  const roles = (params.roles ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);

  const ref = await addDoc(collection(db, COLLECTION_APP_NOVEDADES), {
    title: params.title.trim(),
    summary: params.summary.trim(),
    highlights: params.highlights,
    date: params.date,
    screenId: screenId || null,
    screenLabel: screenId ? screenLabel || 'Ver pantalla' : null,
    roles: roles.length > 0 ? roles : null,
    activo: true,
    createdByUid: params.autorUid,
    createdByNombre: params.autorNombre,
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

const STATIC_NOVEDAD_IDS = new Set(APP_UPDATES.map((u) => u.id));

/** Solo las publicadas en Firestore pueden eliminarse desde la app. */
export function isFirestoreAppNovedad(id: string): boolean {
  return !STATIC_NOVEDAD_IDS.has(id);
}

/** Oculta la novedad (soft delete). */
export async function deleteAppNovedad(novedadId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION_APP_NOVEDADES, novedadId), {
    activo: false,
    deletedAt: serverTimestamp(),
  });
}
