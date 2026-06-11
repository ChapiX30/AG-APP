import type { TooltipProps } from "recharts";

// --- Paleta y metrólogos (compartido TV + Stats) ---
export const CALIBRATION_COLORS = {
  background: "bg-slate-900",
  cardBg: "bg-gray-900/60",
  cardBorder: "border-white/10",
};

export const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#ef4444" },
  { name: "Dante Hernández", color: "#3b82f6" },
  { name: "Edgar Amador", color: "#007e2e" },
  { name: "Angel Amador", color: "#14b8a6" },
  { name: "Ricardo Domínguez", color: "#d946ef" },
  { name: "Mario Medina", color: "#ababab" },
  { name: "Daniel Hernández", color: "#8f6a2c" },
];

export const FALLBACK_CHART_COLORS = ["#f59e0b", "#6366f1", "#8b5cf6", "#ec4899", "#64748b"];

export const MAGNITUDES_COLORS: Record<string, string> = {
  Acustica: "#b6cfcb",
  Dimensional: "#001e78",
  Electrica: "#ffee00",
  Flujo: "#20cde0",
  Fuerza: "#835700",
  Humedad: "#6f888c",
  Frecuencia: "#ff9100",
  "Optica Trazable": "#4a3419",
  "Par Torsional Trazable": "#00ff2f",
  "Reporte Diagnostico": "#9203ff",
  Masa: "#06e52f",
  "Par Torsional": "#30306D",
  Presión: "#6c6cfa",
  Temperatura: "#bd0101",
  Tiempo: "#f33220",
  "Vibracion Trazable": "#49ae9a",
  Vacio: "#bebebe",
};

// --- Tipos ---
export interface UsuarioRow {
  id: string;
  name?: string;
  nombre?: string;
  puesto?: string;
  role?: string;
  color?: string;
}

export interface HojaTrabajoRow {
  id: string;
  docId?: string;
  cliente?: string;
  equipo?: string;
  folio?: string;
  certificado?: string;
  fecha?: string;
  fechaEntrada?: string;
  fechaRecepcion?: string;
  fecha_calib?: string;
  createdAt?: string;
  lastUpdated?: string;
  status?: string;
  pdfURL?: string;
  status_equipo?: string;
  status_certificado?: string;
  ubicacion_real?: string;
  lugarCalibracion?: string;
  departamento?: string;
  nombre?: string;
  assignedTo?: string;
  magnitud?: string;
  diasPromesa?: number;
  cargado_drive?: string;
  folioSalida?: string;
  entregado?: boolean;
}

export interface ServicioRow {
  id: string;
  titulo: string;
  cliente: string;
  estado: string;
  estatus?: string;
  prioridad: string;
  tipo?: string;
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  ubicacion?: string;
  personas?: string[];
}

/** Tipos que cuentan como servicio operativo (Friday + calibración). Excluye juntas, vueltas, PJLA, PT, patrones. */
export const SERVICIO_OPERATIVO_TIPOS = new Set([
  "calibracion",
  "mantenimiento",
  "verificacion",
  "reparacion",
  "inspeccion",
]);

export const normalizeEstadoKey = (estado?: string): string => {
  if (!estado) return "";
  return estado
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
};

/** True si el documento está en estado reprogramado (variantes: reprogramacion, reprogramado, Reprogramado…). */
export const isReprogramadoEstado = (estado?: string, estatus?: string): boolean => {
  for (const raw of [estado, estatus]) {
    if (!raw) continue;
    const key = normalizeEstadoKey(raw);
    if (key === "reprogramacion" || key === "reprogramado") return true;
  }
  return false;
};

/** True si el tipo cuenta para stats/TV de servicios (no junta, vuelta, PJLA, PT ni patrones). */
export const isServicioOperativoTipo = (tipo?: string): boolean => {
  if (!tipo) return true;
  return SERVICIO_OPERATIVO_TIPOS.has(tipo.trim().toLowerCase());
};

/** Servicios visibles en calendario/TV: operativos y no reprogramados. */
export const isVisibleServicioForDashboard = (s: {
  tipo?: string;
  estado?: string;
  estatus?: string;
}): boolean => isServicioOperativoTipo(s.tipo) && !isReprogramadoEstado(s.estado, s.estatus);

/** Gestión de Servicios (FridayServiciosScreen): mismos criterios que TV/stats — sin juntas, PT, patrones ni reprogramados. */
export const shouldShowInFridayServicios = isVisibleServicioForDashboard;

export const getUsuarioDisplayName = (user?: UsuarioRow) =>
  user?.name || user?.nombre || "Usuario";

/** Resuelve IDs de `personas` (Firestore servicios) a nombres para UI. */
export const resolveServicioAssignees = (
  personas: string[] | undefined,
  usuarios: UsuarioRow[]
): { id: string; name: string; color?: string }[] => {
  if (!Array.isArray(personas) || personas.length === 0) return [];
  const byId = new Map(usuarios.map((u) => [u.id, u]));
  return personas.map((id) => {
    const u = byId.get(id);
    return { id, name: getUsuarioDisplayName(u), color: u?.color };
  });
};

export const LAB_AREA_ORDER = ["Dimensional", "Mecánica", "Eléctrica"] as const;
export type LabAreaKey = (typeof LAB_AREA_ORDER)[number] | "Sin Asignar";

export const LAB_AREA_TV_LABELS: Record<LabAreaKey, string> = {
  Dimensional: "DIMENSIONAL",
  Mecánica: "MECANICA",
  Eléctrica: "ELECTRICA",
  "Sin Asignar": "SIN ÁREA",
};

export interface CompanyArrivalBatch {
  dateKey: string;
  arrived: number;
  pending: number;
  calibrated: number;
}

export interface CompanyArrivalGroup {
  company: string;
  arrived: number;
  pending: number;
  calibrated: number;
  /** Equipos aún sin terminar (pendientes de calibrar). */
  incomplete: number;
  /** Lotes por fecha de entrada (fechaEntrada). */
  batches: CompanyArrivalBatch[];
}

export interface AreaCompanyArrivals {
  area: LabAreaKey;
  areaLabel: string;
  groups: CompanyArrivalGroup[];
  totalArrived: number;
  totalPending: number;
}

export interface LabPendingByArea {
  area: LabAreaKey;
  areaLabel: string;
  items: LabPendingItem[];
}

export interface LabPendingItem extends HojaTrabajoRow {
  diffDays: number;
  daysLabel: string;
  statusColor: string;
  dep: string;
}

// --- Helpers ---
export const cleanName = (name?: string) =>
  name && name !== "null" && name !== "undefined" ? name.trim() : "";

export const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Fecha de calibración para estadísticas (fecha → fecha_calib, como FridayScreen). */
export const getCalibrationWorkDate = (row: HojaTrabajoRow): Date | null =>
  parseDateRobust(row.fecha || row.fecha_calib);

export const parseDateRobust = (dateStr: unknown): Date | null => {
  if (!dateStr) return null;
  const anyDate = dateStr as { toDate?: () => Date };
  if (typeof anyDate.toDate === "function") return anyDate.toDate();
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  if (typeof dateStr === "string") {
    let d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  return null;
};

export const formatDateKeyDisplay = (dateKey: string) => {
  const d = parseDateRobust(dateKey);
  if (!d) return dateKey;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/** Normaliza `fecha` de Firestore (servicios) a YYYY-MM-DD. */
export const normalizeServicioDateKey = (fecha?: string) => (fecha || "").slice(0, 10);

/** Etiqueta relativa para TV / agenda (ej. "Mañana 21/05/26"). */
export const formatServicioScheduleBadge = (
  dateKey: string,
  todayKey: string = toDateKey(new Date())
) => {
  const key = normalizeServicioDateKey(dateKey);
  if (!key) return "Sin fecha";
  const d = parseDateRobust(key);
  const today = parseDateRobust(todayKey);
  if (!d || !today) return formatDateKeyDisplay(key);
  const dayMs = 86400000;
  const diffDays = Math.round((d.getTime() - today.getTime()) / dayMs);
  const short = formatDateKeyDisplay(key);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return `Mañana ${short}`;
  if (diffDays === -1) return `Ayer ${short}`;
  const weekday = d.toLocaleDateString("es-MX", { weekday: "short" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${short}`;
};

/** Metrólogo/técnico de campo para TV y servicios — excluye calidad, admin y jefatura. */
export const isMetrologyRole = (user: UsuarioRow) => {
  const text = ((user.puesto || "") + " " + (user.role || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    text.includes("calidad") ||
    text.includes("quality") ||
    text.includes("admin") ||
    text.includes("jefe") ||
    text.includes("director") ||
    text.includes("gerente") ||
    text.includes("supervisor") ||
    text.includes("coordinador")
  ) {
    return false;
  }
  return (
    text.includes("metrolog") ||
    text.includes("tecnico") ||
    text.includes("calibr")
  );
};

export const isQualityRole = (user: UsuarioRow) => {
  const text = ((user.puesto || "") + " " + (user.role || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    text.includes("calidad") ||
    text.includes("quality") ||
    text.includes("aseguramiento") ||
    text.includes("qc") ||
    text.includes("gestion de calidad") ||
    text.includes("sistema de gestion")
  );
};

export const normalizeCompany = (cliente?: string) => {
  const c = (cliente || "").trim();
  return c ? c.toUpperCase() : "SIN CLIENTE";
};

export const getArrivalDateKey = (row: HojaTrabajoRow): string | null => {
  const raw = row.fechaEntrada || row.fechaRecepcion;
  if (!raw) return null;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = parseDateRobust(raw);
  return d ? toDateKey(d) : null;
};

/** Año calendario de entrada (fechaEntrada → fechaRecepcion). */
export const getRowCalendarYear = (row: HojaTrabajoRow): number | null => {
  const key = getArrivalDateKey(row);
  if (!key) return null;
  return parseInt(key.slice(0, 4), 10);
};

export const isRowInYear = (row: HojaTrabajoRow, year = new Date().getFullYear()): boolean =>
  getRowCalendarYear(row) === year;

/** Normaliza departamento Firestore → Mecánica | Dimensional | Eléctrica | Sin Asignar. */
export const normalizeDepartment = (dep?: string): LabAreaKey => {
  const raw = (dep || "").trim();
  if (!raw) return "Sin Asignar";
  const lower = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (lower === "mecanica") return "Mecánica";
  if (lower === "dimensional") return "Dimensional";
  if (lower === "electrica") return "Eléctrica";
  if (raw === "Mecánica" || raw === "Dimensional" || raw === "Eléctrica") return raw as LabAreaKey;
  return "Sin Asignar";
};

export const isEquipmentRejected = (row: HojaTrabajoRow) =>
  (row.status_equipo || "").toLowerCase() === "rechazado";

/** Alineado con FridayScreen: Si/Realizado en Drive, cert firmado, ubicación entregada. */
export const getEffectiveCargadoDrive = (row: HojaTrabajoRow): string => {
  const raw = (row.cargado_drive || "").trim();
  if (!raw || raw.toLowerCase() === "pendiente") return "No";
  return raw;
};

export const getEffectiveCertStatus = (row: HojaTrabajoRow): string => {
  const raw = (row.status_certificado || "").trim();
  const drive = getEffectiveCargadoDrive(row).toLowerCase();
  const driveDone = drive === "si" || drive === "realizado";
  if (raw.toLowerCase() === "finalizado") return "Firmado";
  if (!raw || raw === "Pendiente de Certificado") {
    return driveDone ? "Generado" : "Pendiente de Certificado";
  }
  if (raw === "Generado" && !driveDone) return "Pendiente de Certificado";
  return raw;
};

/** Flujo documental terminado (misma regla que cronograma en Friday). */
export const isCronogramaComplete = (row: HojaTrabajoRow): boolean => {
  const drive = getEffectiveCargadoDrive(row).toLowerCase();
  const cert = getEffectiveCertStatus(row);
  if (cert === "Firmado") return true;
  if (drive === "si" || drive === "realizado") return true;
  if ((row.ubicacion_real || "").toLowerCase() === "entregado") return true;
  return false;
};

export const isEquipmentDelivered = (row: HojaTrabajoRow) =>
  row.entregado === true ||
  (row.ubicacion_real || "").toLowerCase() === "entregado" ||
  (row.status_equipo || "").toLowerCase() === "entregado" ||
  Boolean(row.folioSalida && row.folioSalida.trim() !== "");

export const isEquipmentFullyDone = (row: HojaTrabajoRow) => isCronogramaComplete(row);

const normalizeStatusEquipo = (status?: string): string =>
  (status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Misma fusión fecha / fecha_calib que FridayScreen al cargar filas. */
export const normalizeHojaRowForRules = (row: HojaTrabajoRow): HojaTrabajoRow => ({
  ...row,
  fecha: row.fecha || row.fecha_calib,
});

const rowRecencyTime = (row: HojaTrabajoRow): number => {
  for (const raw of [row.lastUpdated, row.createdAt, row.fechaEntrada, row.fecha, row.fecha_calib]) {
    const d = parseDateRobust(raw);
    if (d) return d.getTime();
  }
  return 0;
};

const shouldPreferEquipmentRow = (candidate: HojaTrabajoRow, current: HojaTrabajoRow): boolean => {
  const candidateCal = isEquipmentCalibrated(candidate);
  const currentCal = isEquipmentCalibrated(current);
  if (candidateCal !== currentCal) return candidateCal;
  return rowRecencyTime(candidate) >= rowRecencyTime(current);
};

/**
 * Evita contar dos veces el mismo ID interno (p. ej. fila vieja en lab + hoja guardada tras calibrar).
 * Prefiere el registro calibrado o el más reciente — alineado con el orden de Friday.
 */
export const dedupeHojasByEquipmentKey = (hojas: HojaTrabajoRow[]): HojaTrabajoRow[] => {
  const keyed = new Map<string, HojaTrabajoRow>();
  const withoutId: HojaTrabajoRow[] = [];

  hojas.forEach((raw) => {
    const row = normalizeHojaRowForRules(raw);
    const id = (row.id || "").trim().toUpperCase();
    if (!id) {
      withoutId.push(row);
      return;
    }
    const key = `${normalizeCompany(row.cliente)}::${id}`;
    const prev = keyed.get(key);
    if (!prev || shouldPreferEquipmentRow(row, prev)) keyed.set(key, row);
  });

  return [...withoutId, ...keyed.values()];
};

/** Fecha de calibración registrada (columna Friday / hoja de trabajo). */
export const hasCalibrationDate = (row: HojaTrabajoRow): boolean =>
  Boolean(getCalibrationWorkDate(row));

export const isEquipmentCalibrated = (row: HojaTrabajoRow): boolean => {
  const normalized = normalizeHojaRowForRules(row);
  if (normalizeStatusEquipo(normalized.status_equipo) === "calibrado") return true;
  if (isCronogramaComplete(normalized)) return true;
  if (hasCalibrationDate(normalized)) return true;
  const certStatus = getEffectiveCertStatus(normalized);
  if (certStatus === "Generado" || certStatus === "Firmado") return true;
  if ((normalized.status || "").trim().toLowerCase() === "completed") return true;
  if (normalized.pdfURL && String(normalized.pdfURL).trim().length > 0) return true;
  return false;
};

/** Equipo de laboratorio aún en flujo (backlog acumulado, sin filtro por día). */
export const isInLabBacklog = (row: HojaTrabajoRow): boolean => {
  if ((row.lugarCalibracion || "").toLowerCase() !== "laboratorio") return false;
  if (!isLabReceptionEquipment(row)) return false;
  if (isEquipmentRejected(row)) return false;
  if (isEquipmentDelivered(row)) return false;
  if (isCronogramaComplete(row)) return false;
  return true;
};

/** Pendiente de calibración en lab (excluye ya calibrados y flujo cerrado). */
export const isLabPendingCalibration = (row: HojaTrabajoRow): boolean => {
  if (!isInLabBacklog(row)) return false;
  return !isEquipmentCalibrated(row);
};

/** Fecha inicio SLA: fechaEntrada → fechaRecepcion → createdAt (como Friday). */
export const getSlaStartDateKey = (row: HojaTrabajoRow): string | null => {
  const raw = row.fechaEntrada || row.fechaRecepcion;
  if (raw && typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (raw) {
    const d = parseDateRobust(raw);
    if (d) return toDateKey(d);
  }
  if (row.createdAt && typeof row.createdAt === "string") return row.createdAt.split("T")[0];
  return null;
};

export const isLabReceptionEquipment = (row: HojaTrabajoRow) => {
  const lugar = (row.lugarCalibracion || "").toLowerCase();
  const ubic = (row.ubicacion_real || "").toLowerCase();
  return (
    lugar === "laboratorio" ||
    ubic === "laboratorio" ||
    ubic === "recepción" ||
    ubic === "recepcion"
  );
};

export const isLogisticsArrival = (row: HojaTrabajoRow, dateKey: string) => {
  if (!isLabReceptionEquipment(row)) return false;
  if (isEquipmentRejected(row) || isEquipmentDelivered(row)) return false;
  const arrivalKey = getArrivalDateKey(row);
  return arrivalKey === dateKey;
};

export const addBusinessDays = (startDate: Date, daysToAdd: number) => {
  let currentDate = new Date(startDate);
  let added = 0;
  while (added < daysToAdd) {
    currentDate.setDate(currentDate.getDate() + 1);
    const day = currentDate.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return currentDate;
};

export const computeCompanyArrivals = (
  hojas: HojaTrabajoRow[],
  dateKey: string
): CompanyArrivalGroup[] => {
  const map = new Map<string, CompanyArrivalGroup>();

  dedupeHojasByEquipmentKey(hojas).forEach((row) => {
    if (!isLogisticsArrival(row, dateKey)) return;
    const company = normalizeCompany(row.cliente);
    const entry = map.get(company) || emptyCompanyArrivalGroup(company);
    bumpCompanyArrivalEntry(entry, row);
    map.set(company, entry);
  });

  return sortCompanyArrivalGroups(Array.from(map.values()));
};

const emptyCompanyArrivalGroup = (company: string): CompanyArrivalGroup => ({
  company,
  arrived: 0,
  pending: 0,
  calibrated: 0,
  incomplete: 0,
  batches: [],
});

const sortArrivalBatches = (batches: CompanyArrivalBatch[]) =>
  [...batches].sort((a, b) => b.dateKey.localeCompare(a.dateKey));

const sortCompanyArrivalGroups = (groups: CompanyArrivalGroup[]) =>
  groups
    .map((g) => ({ ...g, batches: sortArrivalBatches(g.batches) }))
    .sort((a, b) => b.pending - a.pending || b.arrived - a.arrived);

const bumpCompanyArrivalEntry = (entry: CompanyArrivalGroup, row: HojaTrabajoRow) => {
  const dateKey = getArrivalDateKey(row) || "sin-fecha";
  let batch = entry.batches.find((b) => b.dateKey === dateKey);
  if (!batch) {
    batch = { dateKey, arrived: 0, pending: 0, calibrated: 0 };
    entry.batches.push(batch);
  }
  batch.arrived += 1;
  entry.arrived += 1;
  if (isEquipmentCalibrated(row)) {
    batch.calibrated += 1;
    entry.calibrated += 1;
  } else {
    batch.pending += 1;
    entry.pending += 1;
  }
  entry.incomplete = entry.pending;
};

const bumpCompanyArrival = (
  map: Map<string, CompanyArrivalGroup>,
  company: string,
  row: HojaTrabajoRow
) => {
  const entry = map.get(company) || emptyCompanyArrivalGroup(company);
  bumpCompanyArrivalEntry(entry, row);
  map.set(company, entry);
};

/** Backlog en laboratorio por empresa, solo equipos del año indicado (fechaEntrada). */
export const computeCompanyLabBacklog = (
  hojas: HojaTrabajoRow[],
  options?: { year?: number }
): CompanyArrivalGroup[] => {
  const year = options?.year ?? new Date().getFullYear();
  const map = new Map<string, CompanyArrivalGroup>();

  dedupeHojasByEquipmentKey(hojas).forEach((row) => {
    if (!isInLabBacklog(row)) return;
    if (!isRowInYear(row, year)) return;
    bumpCompanyArrival(map, normalizeCompany(row.cliente), row);
  });

  return sortCompanyArrivalGroups(Array.from(map.values()));
};

/** Backlog por área y empresa (año actual por defecto). */
export const computeCompanyLabBacklogByArea = (
  hojas: HojaTrabajoRow[],
  options?: { year?: number }
): AreaCompanyArrivals[] => {
  const year = options?.year ?? new Date().getFullYear();
  const areaMaps = new Map<LabAreaKey, Map<string, CompanyArrivalGroup>>();

  dedupeHojasByEquipmentKey(hojas).forEach((row) => {
    if (!isInLabBacklog(row)) return;
    if (!isRowInYear(row, year)) return;
    const area = normalizeDepartment(row.departamento);
    const company = normalizeCompany(row.cliente);
    if (!areaMaps.has(area)) areaMaps.set(area, new Map());
    bumpCompanyArrival(areaMaps.get(area)!, company, row);
  });

  const buildSection = (area: LabAreaKey): AreaCompanyArrivals => {
    const groups = sortCompanyArrivalGroups(Array.from(areaMaps.get(area)?.values() || []));
    return {
      area,
      areaLabel: LAB_AREA_TV_LABELS[area],
      groups,
      totalArrived: groups.reduce((s, g) => s + g.arrived, 0),
      totalPending: groups.reduce((s, g) => s + g.pending, 0),
    };
  };

  const sections = LAB_AREA_ORDER.map(buildSection);
  const sinAsignar = buildSection("Sin Asignar");
  if (sinAsignar.groups.length > 0) sections.push(sinAsignar);
  return sections;
};

const computeSlaDisplay = (row: HojaTrabajoRow) => {
  if (isEquipmentCalibrated(row)) {
    return {
      diffDays: 999,
      daysLabel: "Calibrado",
      statusColor: "text-emerald-300 font-semibold bg-emerald-950/40",
    };
  }

  let diffDays = 999;
  let daysLabel = "-";
  let statusColor = "text-gray-400";

  const startKey = getSlaStartDateKey(row);
  const diasPromesa = Number(row.diasPromesa);
  if (startKey && diasPromesa > 0) {
    const start = new Date(startKey + "T00:00:00");
    const deadline = addBusinessDays(start, diasPromesa);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2 && diffDays > 0) {
      statusColor = "text-orange-400 font-bold";
      daysLabel = `Faltan ${diffDays}d`;
    } else if (diffDays === 0) {
      statusColor = "text-red-400 font-bold";
      daysLabel = "Vence Hoy";
    } else if (diffDays < 0) {
      statusColor = "text-red-500 font-black";
      daysLabel = `Vencido (${Math.abs(diffDays)}d)`;
    } else {
      statusColor = "text-emerald-400 font-medium";
      daysLabel = `Faltan ${diffDays}d`;
    }
  }

  return { diffDays, daysLabel, statusColor };
};

export const computeLabPending = (
  hojas: HojaTrabajoRow[],
  options?: { year?: number }
) => {
  const year = options?.year ?? new Date().getFullYear();
  const contadores: Record<string, number> = {
    Mecánica: 0,
    Dimensional: 0,
    Eléctrica: 0,
    "Sin Asignar": 0,
  };

  const equiposPendientes = dedupeHojasByEquipmentKey(hojas).filter(
    (r) => isLabPendingCalibration(r) && isRowInYear(r, year)
  );

  const flatPendientes: LabPendingItem[] = equiposPendientes
    .map((r) => {
      const dep = normalizeDepartment(r.departamento);
      if (contadores[dep] !== undefined) contadores[dep]++;
      else contadores[dep] = 1;

      const { diffDays, daysLabel, statusColor } = computeSlaDisplay(r);
      return { ...r, diffDays, daysLabel, statusColor, dep };
    })
    .sort((a, b) => a.diffDays - b.diffDays);

  const byArea: LabPendingByArea[] = LAB_AREA_ORDER.map((area) => {
    const items = flatPendientes.filter((i) => normalizeDepartment(i.departamento) === area);
    return { area, areaLabel: LAB_AREA_TV_LABELS[area], items };
  });
  const sinAsignarItems = flatPendientes.filter(
    (i) => normalizeDepartment(i.departamento) === "Sin Asignar"
  );
  if (sinAsignarItems.length > 0) {
    byArea.push({
      area: "Sin Asignar",
      areaLabel: LAB_AREA_TV_LABELS["Sin Asignar"],
      items: sinAsignarItems,
    });
  }

  return {
    pendientesLaboratorio: contadores,
    flatPendientes,
    byArea,
    totalPendientes: equiposPendientes.length,
    year,
  };
};

export const computeActivityDateKeys = (
  hojas: HojaTrabajoRow[],
  servicios: ServicioRow[]
): Set<string> => {
  const keys = new Set<string>();
  hojas.forEach((h) => {
    const k = getArrivalDateKey(h);
    if (k) keys.add(k);
  });
  servicios.forEach((s) => {
    if (s.fecha && !isReprogramadoEstado(s.estado, s.estatus)) {
      keys.add(s.fecha.slice(0, 10));
    }
  });
  return keys;
};

export const CalibrationChartTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800/95 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md z-50">
        <p className="text-slate-300 text-xs mb-1 font-medium capitalize">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-white font-bold text-sm flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill }}
            />
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};
