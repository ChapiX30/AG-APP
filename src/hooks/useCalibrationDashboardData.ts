import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  cleanName,
  computeActivityDateKeys,
  computeArrivalsCountByMonth,
  computeCompanyLabBacklogByArea,
  computeLabPending,
  computeTecnicosPendientes,
  HojaTrabajoRow,
  isMetrologyRole,
  METROLOGOS_ORDER_COLOR,
  ServicioRow,
  normalizeServicioDateKey,
  TecnicoPendiente,
  toDateKey,
  UsuarioRow,
  FALLBACK_CHART_COLORS,
  MAGNITUDES_COLORS,
  getCalibrationWorkDate,
  dedupeHojasByEquipmentKey,
  isInLabBacklog,
  isRowInYear,
  isVisibleServicioForDashboard,
  isFinalizadoEstado,
  normalizeEstadoKey,
  buildServicioCertProgressMap,
  ServicioCertProgress,
} from "../utils/calibrationShared.tsx";
import { filterVisibleUsers } from "../utils/hiddenUsers";

export type MetrologoMonthStat = {
  name: string;
  total: number;
  color: string;
  carrying: number;
};

/** Días hacia atrás que el TV considera "deuda accionable" del técnico. */
export const DEUDA_TECNICO_DIAS = 45;

const HOY_ESTADO_ORDER: Record<string, number> = {
  enproceso: 0,
  programado: 1,
  finalizado: 2,
  completado: 2,
};

/**
 * Ventana de datos del dashboard: año actual y anterior.
 * Cubre equipos recibidos en diciembre y calibrados en enero sin leer el histórico completo.
 */
const getWindowStartDateKey = (): string => `${new Date().getFullYear() - 1}-01-01`;

const subtractDays = (days: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return toDateKey(d);
};

export function useCalibrationDashboardData(selectedDate: Date) {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [hojasDeTrabajo, setHojasDeTrabajo] = useState<HojaTrabajoRow[]>([]);
  const [servicios, setServicios] = useState<ServicioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));

  // La pantalla vive encendida: sin esto "Hoy" se queda en el día anterior tras la medianoche.
  useEffect(() => {
    const timer = setInterval(() => {
      const key = toDateKey(new Date());
      setTodayKey((prev) => (prev === key ? prev : key));
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const windowStart = getWindowStartDateKey();

    const unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      setUsuarios(filterVisibleUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UsuarioRow))));
    });

    const unsubHojas = onSnapshot(
      query(collection(db, "hojasDeTrabajo"), where("fechaEntrada", ">=", windowStart)),
      (snapshot) => {
        setHojasDeTrabajo(
          snapshot.docs.map((d) => ({ id: d.id, docId: d.id, ...d.data() } as HojaTrabajoRow))
        );
        setLoading(false);
      }
    );

    const unsubServicios = onSnapshot(
      query(collection(db, "servicios"), where("fecha", ">=", windowStart)),
      (snapshot) => {
        setServicios(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ServicioRow)));
      }
    );

    return () => {
      unsubUsuarios();
      unsubHojas();
      unsubServicios();
    };
  }, []);

  const selectedDateKey = toDateKey(selectedDate);

  const {
    companyArrivalsByArea,
    todayServices,
    programmedServices,
    finalizedServices,
    servicioCertProgress,
    labPending,
    activityDateKeys,
    totalArrivedToday,
    totalPendingToday,
    metrologosMonth,
    magnitudesMonth,
    arrivalsForMonth,
    tecnicosPendientes,
  } = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;

    const currentYear = new Date().getFullYear();
    const hojasDeduped = dedupeHojasByEquipmentKey(hojasDeTrabajo);
    const companyArrivalsByArea = computeCompanyLabBacklogByArea(hojasDeduped, {
      year: currentYear,
      deduped: true,
    });

    const dashboardServicios = servicios.filter(isVisibleServicioForDashboard);
    const monthPrefix = todayKey.slice(0, 7); // yyyy-MM

    const todayServices = dashboardServicios
      .filter((s) => normalizeServicioDateKey(s.fecha) === todayKey)
      .sort((a, b) => {
        const oa = HOY_ESTADO_ORDER[normalizeEstadoKey(a.estado)] ?? 9;
        const ob = HOY_ESTADO_ORDER[normalizeEstadoKey(b.estado)] ?? 9;
        if (oa !== ob) return oa - ob;
        return (a.horaInicio || "").localeCompare(b.horaInicio || "");
      });

    const programmedServices = dashboardServicios
      .filter((s) => normalizeServicioDateKey(s.fecha) > todayKey)
      .sort((a, b) => {
        const fa = normalizeServicioDateKey(a.fecha);
        const fb = normalizeServicioDateKey(b.fecha);
        if (fa !== fb) return fa.localeCompare(fb);
        return (a.horaInicio || "").localeCompare(b.horaInicio || "");
      });

    const finalizedCandidates = dashboardServicios.filter((s) => {
      if (!isFinalizadoEstado(s.estado, s.estatus)) return false;
      const fk = normalizeServicioDateKey(s.fecha);
      if (!fk || fk > todayKey) return false;
      // Solo finalizados del mes en curso; los de hoy ya están en "Hoy".
      if (!fk.startsWith(monthPrefix)) return false;
      return fk < todayKey;
    });

    const servicioCertProgress: Record<string, ServicioCertProgress> = buildServicioCertProgressMap(
      [...todayServices, ...programmedServices, ...finalizedCandidates],
      hojasDeduped,
      { deduped: true }
    );

    // Siguen visibles hasta que Calidad complete el conteo (o si aún no hay hojas).
    const finalizedServices = finalizedCandidates
      .filter((s) => {
        const p = servicioCertProgress[s.id] || { total: 0, reviewed: 0 };
        if (p.total <= 0) return true;
        return p.reviewed < p.total;
      })
      .sort((a, b) => {
        const fa = normalizeServicioDateKey(a.fecha);
        const fb = normalizeServicioDateKey(b.fecha);
        if (fa !== fb) return fb.localeCompare(fa);
        return (a.horaInicio || "").localeCompare(b.horaInicio || "");
      });

    const labPending = computeLabPending(hojasDeduped, { year: currentYear, deduped: true });
    const activityDateKeys = computeActivityDateKeys(hojasDeduped, servicios);

    const totalArrivedToday = companyArrivalsByArea.reduce((acc, s) => acc + s.totalArrived, 0);
    const totalPendingToday = companyArrivalsByArea.reduce((acc, s) => acc + s.totalPending, 0);

    const hojasDelMes = hojasDeduped.filter((h) => {
      const d = getCalibrationWorkDate(h);
      if (!d) return false;
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });

    const countsMet: Record<string, number> = {};
    const magGlobalMap: Record<string, number> = {};
    hojasDelMes.forEach((h) => {
      const name = cleanName(h.nombre);
      if (name) countsMet[name] = (countsMet[name] || 0) + 1;
      if (h.magnitud) magGlobalMap[h.magnitud] = (magGlobalMap[h.magnitud] || 0) + 1;
    });

    const validMetrologosNames = new Set(
      usuarios.filter((u) => isMetrologyRole(u)).map((u) => cleanName(u.name || u.nombre))
    );

    const carryingByName: Record<string, number> = {};
    hojasDeduped.forEach((h) => {
      if (!isInLabBacklog(h) || !isRowInYear(h, currentYear)) return;
      const name = cleanName(h.nombre || h.assignedTo);
      if (!name || !validMetrologosNames.has(name)) return;
      carryingByName[name] = (carryingByName[name] || 0) + 1;
    });

    const statsMet: MetrologoMonthStat[] = [];
    METROLOGOS_ORDER_COLOR.forEach((m) => {
      const key = cleanName(m.name);
      if (!validMetrologosNames.has(key)) return;
      statsMet.push({
        name: m.name,
        total: countsMet[key] || 0,
        color: m.color,
        carrying: carryingByName[key] || 0,
      });
    });
    Object.entries(countsMet).forEach(([cName, total]) => {
      if (total <= 0 || statsMet.some((s) => cleanName(s.name) === cName)) return;
      if (!validMetrologosNames.has(cName)) return;
      const dbUser = usuarios.find((u) => cleanName(u.name || u.nombre) === cName);
      if (!dbUser || !isMetrologyRole(dbUser)) return;
      statsMet.push({
        name: dbUser.name || dbUser.nombre || cName,
        total,
        color: dbUser.color || FALLBACK_CHART_COLORS[statsMet.length % FALLBACK_CHART_COLORS.length],
        carrying: carryingByName[cName] || 0,
      });
    });
    statsMet.sort((a, b) => b.total - a.total || b.carrying - a.carrying);
    const metrologosMonthFiltered = statsMet.filter((s) => s.total > 0);

    const magnitudesMonth = Object.entries(magGlobalMap)
      .map(([name, total], i) => ({
        name,
        total,
        color: MAGNITUDES_COLORS[name] || FALLBACK_CHART_COLORS[i % FALLBACK_CHART_COLORS.length],
      }))
      .sort((a, b) => b.total - a.total);

    const arrivalsForMonth = computeArrivalsCountByMonth(hojasDeduped, year, month);

    const tecnicosPendientes: TecnicoPendiente[] = computeTecnicosPendientes(
      hojasDeduped,
      usuarios,
      { year, month, desdeDateKey: subtractDays(DEUDA_TECNICO_DIAS) }
    );

    return {
      companyArrivalsByArea,
      todayServices,
      programmedServices,
      finalizedServices,
      servicioCertProgress,
      labPending,
      activityDateKeys,
      totalArrivedToday,
      totalPendingToday,
      metrologosMonth: metrologosMonthFiltered,
      magnitudesMonth,
      arrivalsForMonth,
      tecnicosPendientes,
    };
  }, [hojasDeTrabajo, servicios, usuarios, selectedDate, todayKey]);

  return {
    loading,
    usuarios,
    hojasDeTrabajo,
    servicios,
    selectedDateKey,
    todayKey,
    companyArrivalsByArea,
    todayServices,
    programmedServices,
    finalizedServices,
    servicioCertProgress,
    labPending,
    activityDateKeys,
    totalArrivedToday,
    totalPendingToday,
    metrologosMonth,
    magnitudesMonth,
    arrivalsForMonth,
    tecnicosPendientes,
  };
}
