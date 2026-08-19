import {
  cleanName,
  dedupeHojasByEquipmentKey,
  getCalibrationWorkDate,
  isCerradoEnDrive,
  isCronogramaComplete,
  isEquipmentDelivered,
  isEquipmentRejected,
  toDateKey,
  type HojaTrabajoRow,
} from './calibrationShared';
import { isServiceSheetDrivePath } from './pendingReviewDriveLogic';

/** Ventana de deuda documental si hay que caer a hojasDeTrabajo. */
export const CARGA_WINDOW_DIAS = 45;

/** Un día fuera pesa como dos hojas pendientes: sale del laboratorio todo el día. */
const PESO_DIA_FUERA = 2;

const FOLDER_SKIP = new Set(['hojas de trabajo', 'hojas de servicio', 'certificados', 'mi unidad']);

export type NivelCarga = 'ligero' | 'normal' | 'cargado' | 'saturado';

export interface TecnicoCarga {
  userId: string;
  /** Hojas aún no marcadas como realizadas en Drive. */
  pendientes: number;
  /** Días distintos de esta semana con servicio asignado. */
  diasSemana: number;
  score: number;
  nivel: NivelCarga;
  esMayorCarga: boolean;
}

export interface CargaUsuario {
  id: string;
  name?: string;
  nombre?: string;
}

export interface CargaServicio {
  fecha?: string;
  estado?: string;
  personas?: string[];
}

export interface DriveCargaFile {
  filePath?: string;
  name?: string;
  completed?: boolean;
  worksheetTechnician?: string;
  uploadedBy?: string;
  parentFolder?: string;
}

const ESTADOS_SIN_SALIDA = new Set(['cancelado', 'reprogramacion', 'reprogramado']);

export function normalizeNombre(raw?: string): string {
  return cleanName(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function uidPorNombreMap(usuarios: CargaUsuario[]): Map<string, string> {
  const map = new Map<string, string>();
  usuarios.forEach((u) => {
    const key = normalizeNombre(u.name || u.nombre);
    if (key && !map.has(key)) map.set(key, u.id);
  });
  return map;
}

function resolveUidFromNombre(nombre: string, uidPorNombre: Map<string, string>): string | undefined {
  const key = normalizeNombre(nombre);
  if (!key) return undefined;
  if (uidPorNombre.has(key)) return uidPorNombre.get(key);
  for (const [userKey, uid] of uidPorNombre) {
    if (key.includes(userKey) || userKey.includes(key)) return uid;
  }
  return undefined;
}

/** Responsable de Friday: `nombre` gana; no usar el uid de quien creó la hoja. */
function responsableNombre(row: HojaTrabajoRow): string {
  if (row.nombre === '') return '';
  return String(row.nombre || row.assignedTo || '').trim();
}

export function getSemanaRange(now: Date = new Date()): { startKey: string; endKey: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startKey: toDateKey(start), endKey: toDateKey(end) };
}

export function getCargaDesdeDateKey(now: Date = new Date()): string {
  const desde = new Date(now);
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - CARGA_WINDOW_DIAS);
  return toDateKey(desde);
}

function resolveNivel(score: number, maxScore: number): NivelCarga {
  if (score <= 0) return 'ligero';
  if (maxScore <= 0) return 'ligero';
  const ratio = score / maxScore;
  if (ratio >= 0.85) return 'saturado';
  if (ratio >= 0.55) return 'cargado';
  return 'normal';
}

function technicianFromDrivePath(filePath: string): string {
  const parts = String(filePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  const root = parts[0]?.toLowerCase();
  if (root !== 'worksheets' && root !== 'hojas') return '';
  const folder = parts[1] || '';
  if (!folder || FOLDER_SKIP.has(folder.toLowerCase())) return '';
  return folder;
}

/**
 * Archivos de Drive que el técnico aún no marcó como realizados.
 * Es la misma pila que ves en Mi Unidad → su carpeta, menos los ya realizados.
 */
export function countPendientesDesdeDrive(
  files: DriveCargaFile[],
  usuarios: CargaUsuario[]
): Map<string, number> {
  const uidPorNombre = uidPorNombreMap(usuarios);
  const counts = new Map<string, number>();

  files.forEach((file) => {
    const path = String(file.filePath || '');
    const fileName = String(file.name || '');
    if (isServiceSheetDrivePath(path, fileName)) return;
    if (file.completed === true) return;

    const tech =
      file.worksheetTechnician ||
      file.parentFolder ||
      technicianFromDrivePath(path) ||
      file.uploadedBy ||
      '';
    const uid = resolveUidFromNombre(tech, uidPorNombre);
    if (!uid) return;
    counts.set(uid, (counts.get(uid) || 0) + 1);
  });

  return counts;
}

function countPendientesDesdeHojas(
  hojas: HojaTrabajoRow[],
  usuarios: CargaUsuario[],
  now: Date
): Map<string, number> {
  const uidPorNombre = uidPorNombreMap(usuarios);
  const ids = new Set(usuarios.map((u) => u.id));
  const desde = getCargaDesdeDateKey(now);
  const counts = new Map<string, number>();

  dedupeHojasByEquipmentKey(hojas).forEach((row) => {
    const workDate = getCalibrationWorkDate(row);
    if (!workDate) return;
    if (toDateKey(workDate) < desde) return;
    if (isCerradoEnDrive(row) || isCronogramaComplete(row)) return;
    if (isEquipmentDelivered(row) || isEquipmentRejected(row)) return;

    const responsable = responsableNombre(row);
    if (!responsable) return;
    const uid = ids.has(responsable)
      ? responsable
      : resolveUidFromNombre(responsable, uidPorNombre);
    if (!uid) return;
    counts.set(uid, (counts.get(uid) || 0) + 1);
  });

  return counts;
}

/**
 * Carga relativa: hojas no realizadas (Drive) + días fuera esta semana.
 * Si hay archivos de Drive, esos mandan: es lo que resta después de marcar Realizado.
 */
export function computeCargaTecnicos(opts: {
  usuarios: CargaUsuario[];
  hojas?: HojaTrabajoRow[];
  driveFiles?: DriveCargaFile[];
  servicios: CargaServicio[];
  now?: Date;
}): Map<string, TecnicoCarga> {
  const { usuarios, hojas = [], driveFiles, servicios, now = new Date() } = opts;

  const drivePendientes = driveFiles ? countPendientesDesdeDrive(driveFiles, usuarios) : null;
  const hojaPendientes = countPendientesDesdeHojas(hojas, usuarios, now);

  const { startKey, endKey } = getSemanaRange(now);
  const diasPorUid = new Map<string, Set<string>>();
  servicios.forEach((s) => {
    const fecha = (s.fecha || '').trim().slice(0, 10);
    if (!fecha || fecha < startKey || fecha > endKey) return;
    if (ESTADOS_SIN_SALIDA.has((s.estado || '').toLowerCase())) return;
    if (!Array.isArray(s.personas)) return;
    s.personas.forEach((uid) => {
      if (!uid) return;
      const set = diasPorUid.get(uid) || new Set<string>();
      set.add(fecha);
      diasPorUid.set(uid, set);
    });
  });

  const base = usuarios.map((u) => {
    const fromDrive = drivePendientes?.get(u.id);
    const pendientes = fromDrive != null ? fromDrive : hojaPendientes.get(u.id) || 0;
    const diasSemana = diasPorUid.get(u.id)?.size || 0;
    return { userId: u.id, pendientes, diasSemana, score: pendientes + diasSemana * PESO_DIA_FUERA };
  });

  const maxScore = base.reduce((max, t) => Math.max(max, t.score), 0);
  const result = new Map<string, TecnicoCarga>();
  base.forEach((t) => {
    result.set(t.userId, {
      ...t,
      nivel: resolveNivel(t.score, maxScore),
      esMayorCarga: maxScore > 0 && t.score === maxScore,
    });
  });
  return result;
}

export function describeCarga(carga?: TecnicoCarga): string {
  if (!carga) return 'Sin datos de carga';
  const hojas = carga.pendientes === 1 ? '1 hoja pendiente' : `${carga.pendientes} hojas pendientes`;
  const dias = carga.diasSemana === 1 ? '1 día fuera esta semana' : `${carga.diasSemana} días fuera esta semana`;
  return `${hojas} · ${dias}`;
}
