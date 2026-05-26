import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  cleanName,
  computeActivityDateKeys,
  computeCompanyArrivals,
  computeCompanyLabBacklogByArea,
  computeLabPending,
  HojaTrabajoRow,
  isMetrologyRole,
  METROLOGOS_ORDER_COLOR,
  ServicioRow,
  normalizeServicioDateKey,
  toDateKey,
  UsuarioRow,
  FALLBACK_CHART_COLORS,
  MAGNITUDES_COLORS,
  getCalibrationWorkDate,
  isVisibleServicioForDashboard,
} from "../utils/calibrationShared.tsx";

export function useCalibrationDashboardData(selectedDate: Date) {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [hojasDeTrabajo, setHojasDeTrabajo] = useState<HojaTrabajoRow[]>([]);
  const [servicios, setServicios] = useState<ServicioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      setUsuarios(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as UsuarioRow)));
    });

    const unsubHojas = onSnapshot(collection(db, "hojasDeTrabajo"), (snapshot) => {
      setHojasDeTrabajo(
        snapshot.docs.map((d) => ({ id: d.id, docId: d.id, ...d.data() } as HojaTrabajoRow))
      );
      setLoading(false);
    });

    const unsubServicios = onSnapshot(collection(db, "servicios"), (snapshot) => {
      setServicios(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ServicioRow)));
    });

    return () => {
      unsubUsuarios();
      unsubHojas();
      unsubServicios();
    };
  }, []);

  const selectedDateKey = toDateKey(selectedDate);
  const todayKey = toDateKey(new Date());

  const {
    companyArrivalsByArea,
    todayServices,
    programmedServices,
    labPending,
    activityDateKeys,
    totalArrivedToday,
    totalPendingToday,
    metrologosMonth,
    magnitudesMonth,
    arrivalsForMonth,
  } = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;

    const currentYear = new Date().getFullYear();
    const companyArrivalsByArea = computeCompanyLabBacklogByArea(hojasDeTrabajo, {
      year: currentYear,
    });

    const dashboardServicios = servicios.filter(isVisibleServicioForDashboard);

    const todayServices = dashboardServicios
      .filter((s) => normalizeServicioDateKey(s.fecha) === todayKey)
      .sort((a, b) => (a.horaInicio || "").localeCompare(b.horaInicio || ""));

    const programmedServices = dashboardServicios
      .filter((s) => normalizeServicioDateKey(s.fecha) > todayKey)
      .sort((a, b) => {
        const fa = normalizeServicioDateKey(a.fecha);
        const fb = normalizeServicioDateKey(b.fecha);
        if (fa !== fb) return fa.localeCompare(fb);
        return (a.horaInicio || "").localeCompare(b.horaInicio || "");
      });

    const labPending = computeLabPending(hojasDeTrabajo, { year: currentYear });
    const activityDateKeys = computeActivityDateKeys(hojasDeTrabajo, servicios);

    const totalArrivedToday = companyArrivalsByArea.reduce((acc, s) => acc + s.totalArrived, 0);
    const totalPendingToday = companyArrivalsByArea.reduce((acc, s) => acc + s.totalPending, 0);

    const hojasDelMes = hojasDeTrabajo.filter((h) => {
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

    const statsMet: { name: string; total: number; color: string }[] = [];
    METROLOGOS_ORDER_COLOR.forEach((m) => {
      if (validMetrologosNames.has(cleanName(m.name))) {
        statsMet.push({ name: m.name, total: countsMet[cleanName(m.name)] || 0, color: m.color });
      }
    });
    Object.entries(countsMet).forEach(([cName, total]) => {
      if (total > 0 && !statsMet.find((s) => cleanName(s.name) === cName)) {
        const dbUser = usuarios.find((u) => cleanName(u.name || u.nombre) === cName);
        statsMet.push({
          name: dbUser?.name || dbUser?.nombre || cName,
          total,
          color: dbUser?.color || FALLBACK_CHART_COLORS[statsMet.length % FALLBACK_CHART_COLORS.length],
        });
      }
    });
    statsMet.sort((a, b) => b.total - a.total);

    const magnitudesMonth = Object.entries(magGlobalMap)
      .map(([name, total], i) => ({
        name,
        total,
        color: MAGNITUDES_COLORS[name] || FALLBACK_CHART_COLORS[i % FALLBACK_CHART_COLORS.length],
      }))
      .sort((a, b) => b.total - a.total);

    const arrivalsForMonth: Record<string, number> = {};
    for (let d = 1; d <= 31; d++) {
      const probe = new Date(year, month - 1, d);
      if (probe.getMonth() !== month - 1) continue;
      const key = toDateKey(probe);
      arrivalsForMonth[key] = computeCompanyArrivals(hojasDeTrabajo, key).reduce(
        (acc, g) => acc + g.arrived,
        0
      );
    }

    return {
      companyArrivalsByArea,
      todayServices,
      programmedServices,
      labPending,
      activityDateKeys,
      totalArrivedToday,
      totalPendingToday,
      metrologosMonth: statsMet,
      magnitudesMonth,
      arrivalsForMonth,
    };
  }, [hojasDeTrabajo, servicios, usuarios, selectedDate, selectedDateKey, todayKey]);

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
    labPending,
    activityDateKeys,
    totalArrivedToday,
    totalPendingToday,
    metrologosMonth,
    magnitudesMonth,
    arrivalsForMonth,
  };
}
