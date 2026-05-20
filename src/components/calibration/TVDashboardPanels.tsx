import React, { useEffect, useMemo, useRef, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import clsx from "clsx";
import {
  Building2,
  Truck,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Activity,
  UserCircle,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  CALIBRATION_COLORS,
  AreaCompanyArrivals,
  CompanyArrivalGroup,
  formatDateKeyDisplay,
  formatServicioScheduleBadge,
  normalizeServicioDateKey,
  LabPendingByArea,
  ServicioRow,
  UsuarioRow,
  resolveServicioAssignees,
  CalibrationChartTooltip,
} from "../../utils/calibrationShared.tsx";

type CalendarValue = Date | [Date | null, Date | null] | null;

interface DashboardCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  activityDateKeys: Set<string>;
  arrivalsForMonth: Record<string, number>;
}

export const DashboardCalendar: React.FC<DashboardCalendarProps> = ({
  selectedDate,
  onSelectDate,
  activityDateKeys,
  arrivalsForMonth,
}) => {
  const tileContent = ({ date }: { date: Date }) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const count = arrivalsForMonth[key];
    if (!count) return null;
    return (
      <span className="tv-cal-dot" title={`${count} llegada(s)`}>
        {count > 9 ? "9+" : count}
      </span>
    );
  };

  const tileClassName = ({ date }: { date: Date }) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const classes: string[] = [];
    if (activityDateKeys.has(key)) classes.push("has-activity");
    if (arrivalsForMonth[key]) classes.push("has-arrivals");
    return classes;
  };

  return (
    <div className={`h-full flex flex-col rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/50 p-3`}>
      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-400" /> Calendario
      </h3>
      <div className="tv-calendar-wrap flex-1 min-h-0 overflow-hidden">
        <Calendar
          value={selectedDate}
          onChange={(value: CalendarValue) => {
            if (value instanceof Date) onSelectDate(value);
          }}
          locale="es-MX"
          tileContent={tileContent}
          tileClassName={tileClassName}
          className="tv-calendar"
        />
      </div>
      <p className="text-[10px] text-gray-500 mt-2 text-center leading-snug">
        Naranja = llegadas · Morado = servicios programados
      </p>
    </div>
  );
};

/** ~20 px/s — legible en TV a distancia (intervalo 50 ms → 1 px/tick). */
const TV_KIOSK_SCROLL_PX_PER_SEC = 20;
const TV_KIOSK_SCROLL_TICK_MS = 50;

function canScrollVertically(node: HTMLDivElement) {
  return node.scrollHeight > node.clientHeight + 2;
}

type TvScrollState = "idle" | "scrolling" | "no-overflow" | "paused" | "reduced-motion";

/** Auto-scroll vertical para listas en modo TV. `force` ignora prefers-reduced-motion (kiosk). */
function useTvKioskAutoScroll(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  pause: boolean,
  options?: { force?: boolean; onStateChange?: (state: TvScrollState) => void }
) {
  const force = options?.force ?? false;
  const onStateChange = options?.onStateChange;

  useEffect(() => {
    if (!enabled) {
      onStateChange?.("idle");
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedMotion = motionQuery.matches && !force;
    if (reducedMotion) {
      onStateChange?.("reduced-motion");
      return;
    }

    const pxPerTick = (TV_KIOSK_SCROLL_PX_PER_SEC * TV_KIOSK_SCROLL_TICK_MS) / 1000;
    let intervalId = 0;
    let resizeObserver: ResizeObserver | undefined;
    let overflowReady = false;

    const publishState = () => {
      const node = scrollRef.current;
      if (!node) {
        onStateChange?.("idle");
        return;
      }
      if (pause) {
        onStateChange?.("paused");
        return;
      }
      if (!overflowReady || !canScrollVertically(node)) {
        onStateChange?.("no-overflow");
        return;
      }
      onStateChange?.("scrolling");
    };

    const tick = () => {
      const node = scrollRef.current;
      if (!node) return;

      overflowReady = canScrollVertically(node);
      node.dataset.tvScrollOverflow = overflowReady ? "1" : "0";

      if (!pause && overflowReady) {
        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
        node.scrollTop = atBottom ? 0 : node.scrollTop + pxPerTick;
      }
      publishState();
    };

    const attach = () => {
      const node = scrollRef.current;
      if (!node) return;

      node.dataset.tvScroll = "1";
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => {
        overflowReady = canScrollVertically(node);
        node.dataset.tvScrollOverflow = overflowReady ? "1" : "0";
        if (node.scrollTop > 0 && !overflowReady) {
          node.scrollTop = 0;
        }
        publishState();
      });
      resizeObserver.observe(node);
      if (node.firstElementChild) {
        resizeObserver.observe(node.firstElementChild);
      }

      tick();
    };

    attach();
    intervalId = window.setInterval(tick, TV_KIOSK_SCROLL_TICK_MS);
    const layoutTimers = [150, 400, 900, 1800].map((ms) => window.setTimeout(attach, ms));

    const onMotionChange = () => {
      if (motionQuery.matches && !force) {
        onStateChange?.("reduced-motion");
      }
    };
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      layoutTimers.forEach(clearTimeout);
      resizeObserver?.disconnect();
      clearInterval(intervalId);
      motionQuery.removeEventListener("change", onMotionChange);
      const node = scrollRef.current;
      if (node) {
        delete node.dataset.tvScroll;
        delete node.dataset.tvScrollOverflow;
        delete node.dataset.tvScrollMode;
      }
      onStateChange?.("idle");
    };
  }, [scrollRef, enabled, pause, force, onStateChange]);
}

const AREA_HEADER_STYLES: Record<string, string> = {
  DIMENSIONAL: "border-teal-500/40 bg-teal-950/40 text-teal-300",
  MECANICA: "border-blue-500/40 bg-blue-950/40 text-blue-300",
  ELECTRICA: "border-amber-500/40 bg-amber-950/40 text-amber-300",
  "SIN ÁREA": "border-slate-500/40 bg-slate-800/60 text-slate-300",
};

const CompanyCard: React.FC<{ g: CompanyArrivalGroup }> = ({ g }) => {
  const pct = g.arrived > 0 ? Math.round((g.calibrated / g.arrived) * 100) : 0;
  const hasGap = g.incomplete > 0 || g.arrived > g.calibrated;
  return (
    <div
      className={clsx(
        "rounded-xl border p-3 transition-colors",
        hasGap
          ? "border-red-500/60 bg-red-950/30 ring-1 ring-red-500/40"
          : "border-white/10 bg-slate-900/70 hover:border-orange-500/30"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-bold text-white text-sm truncate" title={g.company}>
            {g.company}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 shrink-0">{pct}% listo</span>
      </div>
      {hasGap && (
        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-red-600/25 border border-red-500/50 px-2 py-1">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-[11px] font-bold text-red-200">
            {g.incomplete === 1
              ? "1 sin terminar — ¿qué pasó?"
              : `${g.incomplete} sin terminar — ¿qué pasó?`}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 text-center">
        <div className="flex-1 rounded-lg bg-slate-800 px-2 py-1.5 border border-white/5">
          <p className="text-[10px] text-gray-500 uppercase">Llegaron</p>
          <p className="text-xl font-black text-white">{g.arrived}</p>
        </div>
        <div className="flex-1 rounded-lg bg-amber-950/50 px-2 py-1.5 border border-amber-500/20">
          <p className="text-[10px] text-amber-400/80 uppercase">Pendientes</p>
          <p className="text-xl font-black text-amber-300">{g.pending}</p>
        </div>
        <div className="flex-1 rounded-lg bg-emerald-950/40 px-2 py-1.5 border border-emerald-500/20">
          <p className="text-[10px] text-emerald-400/80 uppercase">Calibrados</p>
          <p className="text-xl font-black text-emerald-400">{g.calibrated}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={clsx(
            "h-full transition-all duration-700",
            hasGap ? "bg-gradient-to-r from-red-500 to-amber-500" : "bg-gradient-to-r from-emerald-500 to-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {g.batches.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-white/10 pt-2">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Por fecha de llegada</p>
          {g.batches.map((batch) => {
            const dateLabel =
              batch.dateKey === "sin-fecha"
                ? "Sin fecha"
                : formatDateKeyDisplay(batch.dateKey);
            const batchHasGap = batch.pending > 0;
            return (
              <div
                key={batch.dateKey}
                className={clsx(
                  "flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px]",
                  batchHasGap ? "bg-red-950/40 border border-red-500/30" : "bg-slate-800/80 border border-white/5"
                )}
              >
                <span className="font-bold text-orange-200 shrink-0">{dateLabel}</span>
                <span className="text-gray-300">
                  {batch.arrived === 1 ? "1 equipo" : `${batch.arrived} equipos`}
                  {batch.pending > 0 && (
                    <span className="text-amber-300 font-semibold">
                      {" "}
                      · {batch.pending} pend.
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface CompanyArrivalsPanelProps {
  areas: AreaCompanyArrivals[];
  totalArrived: number;
  totalPending: number;
  year: number;
}

export const CompanyArrivalsPanel: React.FC<CompanyArrivalsPanelProps> = ({
  areas,
  totalArrived,
  totalPending,
  year,
}) => {
  const hasAny = areas.some((a) => a.groups.length > 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  const [scrollMode, setScrollMode] = useState<TvScrollState>("idle");
  useTvKioskAutoScroll(scrollRef, hasAny, scrollPaused, {
    force: true,
    onStateChange: setScrollMode,
  });

  return (
    <div className={`h-full min-h-0 flex-1 flex flex-col rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/50 overflow-hidden`}>
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900/60">
        <div>
          <h3 className="text-base lg:text-lg font-bold text-orange-400 flex items-center gap-2">
            <Truck className="w-5 h-5" /> Llegadas por Empresa
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Solo {year} · activos en laboratorio por área
          </p>
        </div>
        <div className="flex gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-300 text-xs font-bold border border-orange-500/30">
            {totalArrived} activos
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 text-xs font-bold border border-amber-500/30 animate-pulse">
            {totalPending} por calibrar
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        data-tv-scroll="viewport"
        data-tv-scroll-mode={scrollMode}
        className="flex-1 h-0 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar p-3 tv-kiosk-scroll"
        onMouseEnter={() => setScrollPaused(true)}
        onMouseLeave={() => setScrollPaused(false)}
        onFocus={() => setScrollPaused(true)}
        onBlur={() => setScrollPaused(false)}
      >
        <div data-tv-scroll="content" className="space-y-4">
        {!hasAny ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2 py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/80" />
            <p className="text-sm font-medium">Sin equipos activos en {year}</p>
          </div>
        ) : (
          areas.map((section) => {
            if (section.groups.length === 0) return null;
            const headerClass = AREA_HEADER_STYLES[section.areaLabel] || AREA_HEADER_STYLES["SIN ÁREA"];
            return (
              <div key={section.area} className="space-y-2 snap-start">
                <div
                  className={clsx(
                    "sticky top-0 z-10 flex items-center justify-between rounded-lg border px-3 py-1.5",
                    headerClass
                  )}
                >
                  <span className="text-xs font-black tracking-widest">{section.areaLabel}</span>
                  <span className="text-[10px] font-semibold opacity-80">
                    {section.totalArrived} activos · {section.totalPending} pend.
                  </span>
                </div>
                <div className="space-y-2">
                  {section.groups.map((g) => (
                    <CompanyCard key={`${section.area}-${g.company}`} g={g} />
                  ))}
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
};

const SERVICE_STATUS: Record<string, { label: string; className: string }> = {
  programado: { label: "Programado", className: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  en_proceso: { label: "En proceso", className: "bg-amber-500/20 text-amber-200 border-amber-500/30" },
  finalizado: { label: "Finalizado", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  reprogramacion: { label: "Reprogramado", className: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
};

const PRIORITY_DOT: Record<string, string> = {
  critica: "bg-red-500",
  alta: "bg-orange-500",
  media: "bg-yellow-500",
  baja: "bg-slate-500",
};

const ServicioTvCard: React.FC<{
  service: ServicioRow;
  usuarios: UsuarioRow[];
  dateBadge?: string;
  showDateBadge?: boolean;
}> = ({ service, usuarios, dateBadge, showDateBadge }) => {
  const assignees = useMemo(
    () => resolveServicioAssignees(service.personas, usuarios),
    [service.personas, usuarios]
  );
  const st = SERVICE_STATUS[service.estado] || SERVICE_STATUS.programado;
  const statusAccent =
    service.estado === "en_proceso"
      ? "bg-amber-500"
      : service.estado === "finalizado"
        ? "bg-emerald-500"
        : service.estado === "reprogramacion"
          ? "bg-purple-500"
          : "bg-blue-500";

  return (
    <div className="relative rounded-xl border border-white/10 bg-slate-900/70 p-2.5 text-sm overflow-hidden">
      <span className={clsx("absolute top-0 left-0 w-1 h-full rounded-l-xl", statusAccent)} />
      <div className="flex items-start gap-2 pl-1.5">
        <span
          className={clsx(
            "w-2 h-2 rounded-full mt-1.5 shrink-0 ring-2 ring-slate-800",
            PRIORITY_DOT[service.prioridad] || "bg-slate-500"
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="font-bold text-white leading-snug line-clamp-2 flex-1 min-w-0">{service.titulo}</p>
            {showDateBadge && dateBadge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/25 text-indigo-200 border border-indigo-400/40 shrink-0">
                {dateBadge}
              </span>
            )}
          </div>
          <p className="text-xs text-blue-300 truncate flex items-center gap-1 mt-0.5">
            <Building2 className="w-3 h-3 shrink-0" /> {service.cliente}
          </p>
          <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-400">
            {(service.horaInicio || service.horaFin) && (
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                {service.horaInicio}
                {service.horaFin ? ` – ${service.horaFin}` : ""}
              </span>
            )}
            {service.ubicacion && (
              <span className="flex items-center gap-0.5 truncate max-w-[160px]">
                <MapPin className="w-3 h-3 shrink-0" /> {service.ubicacion}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-start gap-1.5 flex-wrap">
            <Users className="w-3.5 h-3.5 shrink-0 text-purple-300 mt-0.5" aria-hidden />
            {assignees.length > 0 ? (
              assignees.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/35 text-[11px] font-bold text-purple-100 max-w-full"
                  title={a.name}
                >
                  {a.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/20"
                      style={{ backgroundColor: a.color }}
                    />
                  )}
                  <span className="truncate">{a.name}</span>
                </span>
              ))
            ) : (
              <span className="text-[11px] font-semibold text-amber-300/90 italic">Sin asignar</span>
            )}
          </div>
        </div>
        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border font-bold shrink-0", st.className)}>
          {st.label}
        </span>
      </div>
    </div>
  );
};

interface ServicesDashboardPanelProps {
  todayServices: ServicioRow[];
  programmedServices: ServicioRow[];
  usuarios: UsuarioRow[];
  todayKey: string;
}

export const ServicesDashboardPanel: React.FC<ServicesDashboardPanelProps> = ({
  todayServices,
  programmedServices,
  usuarios,
  todayKey,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  const [scrollMode, setScrollMode] = useState<TvScrollState>("idle");
  const hasAny = todayServices.length > 0 || programmedServices.length > 0;

  useTvKioskAutoScroll(scrollRef, hasAny, scrollPaused, {
    force: true,
    onStateChange: setScrollMode,
  });

  return (
    <div
      className={`h-full flex flex-col rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/50 overflow-hidden`}
    >
      <div className="px-4 py-2.5 border-b border-white/10 shrink-0 bg-slate-900/60 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-purple-300 flex items-center gap-2">
            <Briefcase className="w-5 h-5" /> Servicios
          </h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Hoy y próximos programados</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-200 text-[10px] font-bold border border-purple-500/30">
            Hoy {todayServices.length}
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 text-[10px] font-bold border border-indigo-500/30">
            Prog. {programmedServices.length}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        data-tv-scroll="viewport"
        data-tv-scroll-mode={scrollMode}
        className="flex-1 min-h-0 overflow-y-auto hide-scrollbar p-2 tv-kiosk-scroll"
        onMouseEnter={() => setScrollPaused(true)}
        onMouseLeave={() => setScrollPaused(false)}
        onFocus={() => setScrollPaused(true)}
        onBlur={() => setScrollPaused(false)}
      >
        <div data-tv-scroll="content" className="space-y-4">
          {!hasAny ? (
            <div className="flex flex-col items-center justify-center text-gray-500 py-10 text-sm">
              Sin servicios para hoy ni programados
            </div>
          ) : (
            <>
              <section>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h4 className="text-xs font-black uppercase tracking-widest text-purple-300">
                    Servicios de hoy
                  </h4>
                  <span className="text-[10px] text-gray-500">{todayServices.length}</span>
                </div>
                {todayServices.length === 0 ? (
                  <p className="text-xs text-gray-500 italic px-1 py-3">Ningún servicio para hoy</p>
                ) : (
                  <div className="space-y-2">
                    {todayServices.map((s) => (
                      <ServicioTvCard key={s.id} service={s} usuarios={usuarios} />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300">
                    Servicios programados
                  </h4>
                  <span className="text-[10px] text-gray-500">{programmedServices.length}</span>
                </div>
                {programmedServices.length === 0 ? (
                  <p className="text-xs text-gray-500 italic px-1 py-3">Sin fechas futuras</p>
                ) : (
                  <div className="space-y-2">
                    {programmedServices.map((s) => {
                      const dateKey = normalizeServicioDateKey(s.fecha);
                      return (
                        <ServicioTvCard
                          key={s.id}
                          service={s}
                          usuarios={usuarios}
                          showDateBadge
                          dateBadge={formatServicioScheduleBadge(dateKey, todayKey)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface LabStatusBarProps {
  pendientes: Record<string, number>;
  total: number;
}

export const LabStatusBar: React.FC<LabStatusBarProps> = ({ pendientes, total }) => (
  <div className="flex flex-wrap items-center gap-2 lg:gap-3 bg-slate-800/50 p-2 rounded-2xl border border-white/10">
    <span className="text-xs font-bold text-gray-400 flex items-center gap-1.5 px-1">
      <Activity className="w-4 h-4 text-orange-400" /> Lab activo:
      <span className="text-white text-base font-black">{total}</span>
    </span>
    {Object.entries(pendientes).map(([dep, count]) => {
      if (count === 0 && dep === "Sin Asignar") return null;
      return (
        <div
          key={dep}
          className="flex items-center gap-1.5 bg-slate-900 border border-white/5 px-2.5 py-1 rounded-xl"
        >
          <div className={clsx("w-2 h-2 rounded-full", count > 0 ? "bg-orange-500 animate-pulse" : "bg-emerald-500")} />
          <span className="text-[10px] font-semibold text-gray-400">{dep.substring(0, 3)}</span>
          <span className={clsx("text-sm font-black", count > 0 ? "text-orange-400" : "text-emerald-400")}>
            {count}
          </span>
        </div>
      );
    })}
  </div>
);

interface LabPendingTableProps {
  byArea: LabPendingByArea[];
  total: number;
  year: number;
}

export const LabPendingTable: React.FC<LabPendingTableProps> = ({ byArea, total, year }) => {
  const sectionsWithItems = useMemo(
    () => byArea.filter((s) => s.items.length > 0),
    [byArea]
  );

  return (
    <div className={`h-full rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/50 overflow-hidden flex flex-col min-h-0`}>
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" /> Prioridad en Laboratorio
        </h3>
        <span className="text-[10px] text-gray-500">
          {total} pendientes · solo {year}
        </span>
      </div>
      <div className="flex text-[9px] text-gray-500 uppercase font-bold px-3 py-1.5 border-b border-white/5 shrink-0">
        <div className="w-[28%]">Cliente</div>
        <div className="w-[32%]">Equipo</div>
        <div className="w-[22%] text-center">SLA</div>
        <div className="w-[18%] text-right">Téc.</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
        {sectionsWithItems.length === 0 ? (
          <p className="text-center text-gray-500 text-xs py-6">Laboratorio al día ({year})</p>
        ) : (
          sectionsWithItems.map((section) => (
            <div key={section.area}>
              <div
                className={clsx(
                  "sticky top-0 z-10 px-3 py-1 text-[10px] font-black tracking-widest border-b border-white/10",
                  AREA_HEADER_STYLES[section.areaLabel] || AREA_HEADER_STYLES["SIN ÁREA"]
                )}
              >
                {section.areaLabel} ({section.items.length})
              </div>
              {section.items.map((eq, idx) => (
                <div
                  key={eq.docId || eq.id || `${section.area}-${idx}`}
                  className="flex items-center px-3 py-2 border-b border-white/5 text-xs hover:bg-white/5"
                >
                  <div className="w-[28%] pr-1 truncate text-blue-300 font-semibold">{eq.cliente || "—"}</div>
                  <div className="w-[32%] pr-1 truncate text-gray-200">{eq.equipo || "—"}</div>
                  <div className="w-[22%] flex justify-center">
                    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border border-white/10", eq.statusColor)}>
                      {eq.daysLabel}
                    </span>
                  </div>
                  <div className="w-[18%] flex justify-end items-center gap-1 truncate text-gray-400">
                    <UserCircle className="w-3 h-3 shrink-0" />
                    {(eq.nombre || eq.assignedTo || "S/A").substring(0, 6)}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

interface MetrologosMonthChartProps {
  data: { name: string; total: number; color: string }[];
}

/** TV: pausa inicial, ciclo de resaltado lento, animación Recharts prolongada. */
const METROLOGOS_CHART_FULL_DISPLAY_MS = 3000;
const METROLOGOS_BAR_HIGHLIGHT_MS = 3500;
const METROLOGOS_RECHARTS_ANIMATION_MS = 2400;

export const MetrologosMonthChart: React.FC<MetrologosMonthChartProps> = ({ data }) => {
  const [glowIndex, setGlowIndex] = useState(-1);
  const [highlightPhase, setHighlightPhase] = useState(false);

  useEffect(() => {
    if (data.length === 0) {
      setGlowIndex(-1);
      setHighlightPhase(false);
      return;
    }

    setGlowIndex(-1);
    setHighlightPhase(false);
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startId = setTimeout(() => {
      setHighlightPhase(true);
      setGlowIndex(0);
      intervalId = setInterval(() => {
        setGlowIndex((prev) => (prev >= data.length - 1 ? 0 : prev + 1));
      }, METROLOGOS_BAR_HIGHLIGHT_MS);
    }, METROLOGOS_CHART_FULL_DISPLAY_MS);

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [data]);

  return (
    <div
      className={`h-full min-h-0 rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/50 p-3 flex flex-col overflow-hidden`}
    >
      <h3 className="text-sm font-bold text-gray-300 mb-2 shrink-0">Calibraciones del mes</h3>
      <div className="flex-1 min-h-[120px] w-full min-w-0">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={data} margin={{ top: 22, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#94a3b8"
                fontSize={10}
                tickLine={false}
                interval={0}
                tick={{ fill: "#cbd5e1", fontWeight: 600 }}
                tickFormatter={(v) => (typeof v === "string" ? v.split(" ")[0] : v)}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fill: "#e2e8f0", fontWeight: 600 }}
                width={32}
              />
              <Tooltip content={<CalibrationChartTooltip />} />
              <Bar
                dataKey="total"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive
                animationDuration={METROLOGOS_RECHARTS_ANIMATION_MS}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="total"
                  position="top"
                  fill="#f8fafc"
                  fontSize={13}
                  fontWeight={800}
                  formatter={(value: number) => (value > 0 ? String(value) : "")}
                />
                {data.map((e, i) => {
                  const isActive = highlightPhase && i === glowIndex;
                  return (
                    <Cell
                      key={`${e.name}-${i}`}
                      fill={e.color}
                      fillOpacity={1}
                      className={isActive ? "tv-metrologo-bar-active" : undefined}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">Sin datos del mes</div>
        )}
      </div>
      <style>{`
        .tv-kiosk-scroll {
          scroll-behavior: auto;
          scroll-snap-type: y proximity;
        }
        .tv-kiosk-scroll .snap-start {
          scroll-snap-align: start;
        }
        .tv-metrologo-bar-active {
          filter: drop-shadow(0 0 10px rgba(96, 165, 250, 0.95));
        }
        .recharts-label-list text {
          paint-order: stroke fill;
          stroke: #0f172a;
          stroke-width: 3px;
          stroke-linejoin: round;
        }
      `}</style>
    </div>
  );
};
