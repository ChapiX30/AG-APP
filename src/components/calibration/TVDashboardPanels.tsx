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
  isMetrologyRole,
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
const TV_KIOSK_SCROLL_PX_PER_SEC_DEFAULT = 20;
const TV_KIOSK_SCROLL_TICK_MS_DEFAULT = 50;
const TV_KIOSK_SCROLL_LOOP_DELAY_MS_DEFAULT = 700;

function canScrollVertically(node: HTMLDivElement) {
  return node.scrollHeight > node.clientHeight + 2;
}

type TvScrollState = "idle" | "scrolling" | "no-overflow" | "paused" | "reduced-motion";

/** Auto-scroll vertical para listas en modo TV. `force` ignora prefers-reduced-motion (kiosk). */
function useTvKioskAutoScroll(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  pause: boolean,
  options?: {
    force?: boolean;
    onStateChange?: (state: TvScrollState) => void;
    pxPerSec?: number;
    tickMs?: number;
    loopDelayMs?: number;
    /** Duplica contenido y reinicia scroll al llegar a `segmentRef` (bucle continuo). */
    seamless?: boolean;
    segmentRef?: React.RefObject<HTMLDivElement | null>;
  }
) {
  const force = options?.force ?? false;
  const onStateChange = options?.onStateChange;
  const pxPerSec = options?.pxPerSec ?? TV_KIOSK_SCROLL_PX_PER_SEC_DEFAULT;
  const tickMs = options?.tickMs ?? TV_KIOSK_SCROLL_TICK_MS_DEFAULT;
  const loopDelayMs = options?.loopDelayMs ?? TV_KIOSK_SCROLL_LOOP_DELAY_MS_DEFAULT;
  const seamless = options?.seamless ?? false;
  const segmentRef = options?.segmentRef;

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

    const pxPerTick = (pxPerSec * tickMs) / 1000;
    let intervalId = 0;
    let resizeObserver: ResizeObserver | undefined;
    let overflowReady = false;
    let loopUntilTs = 0;

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
        const now = performance.now();
        const segmentHeight = seamless ? segmentRef?.current?.offsetHeight ?? 0 : 0;

        if (seamless && segmentHeight > 0) {
          let next = node.scrollTop + pxPerTick;
          while (next >= segmentHeight) {
            next -= segmentHeight;
          }
          node.scrollTop = next;
        } else {
          if (now < loopUntilTs) {
            publishState();
            return;
          }

          const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
          const next = Math.min(maxScrollTop, node.scrollTop + pxPerTick);
          const atBottom = next >= maxScrollTop - 1;

          if (atBottom) {
            node.scrollTop = 0;
            loopUntilTs = now + loopDelayMs;
          } else {
            node.scrollTop = next;
          }
        }
      }
      publishState();
    };

    const attach = () => {
      const node = scrollRef.current;
      if (!node) return;

      node.dataset.tvScroll = "1";
      node.dataset.tvScrollSeamless = seamless ? "1" : "0";
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => {
        overflowReady = canScrollVertically(node);
        node.dataset.tvScrollOverflow = overflowReady ? "1" : "0";
        const segmentHeight = seamless ? segmentRef?.current?.offsetHeight ?? 0 : 0;
        if (seamless && segmentHeight > 0 && node.scrollTop >= segmentHeight) {
          node.scrollTop = node.scrollTop % segmentHeight;
        }
        if (node.scrollTop > 0 && !overflowReady) {
          node.scrollTop = 0;
        }
        publishState();
      });
      resizeObserver.observe(node);
      const track = node.firstElementChild;
      if (track) resizeObserver.observe(track);
      if (segmentRef?.current) resizeObserver.observe(segmentRef.current);

      tick();
    };

    attach();
    intervalId = window.setInterval(tick, tickMs);
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
        delete node.dataset.tvScrollSeamless;
      }
      onStateChange?.("idle");
    };
  }, [scrollRef, segmentRef, enabled, pause, force, onStateChange, pxPerSec, tickMs, loopDelayMs, seamless]);
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

const CompanyArrivalsBody: React.FC<{ areas: AreaCompanyArrivals[]; hasAny: boolean; year: number }> = ({
  areas,
  hasAny,
  year,
}) => {
  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-500 gap-2 py-10">
        <CheckCircle2 className="w-10 h-10 text-emerald-500/80" />
        <p className="text-sm font-medium">Sin equipos activos en {year}</p>
      </div>
    );
  }

  return (
    <>
      {areas.map((section) => {
        if (section.groups.length === 0) return null;
        const headerClass = AREA_HEADER_STYLES[section.areaLabel] || AREA_HEADER_STYLES["SIN ÁREA"];
        return (
          <div key={section.area} className="space-y-2.5">
            <div
              className={clsx(
                "flex items-center justify-between rounded-lg border px-3 py-2",
                headerClass
              )}
            >
              <span className="text-xs font-black tracking-widest">{section.areaLabel}</span>
              <span className="text-[10px] font-semibold opacity-80">
                {section.totalArrived} activos · {section.totalPending} pend.
              </span>
            </div>
            <div className="space-y-2.5">
              {section.groups.map((g) => (
                <CompanyCard key={`${section.area}-${g.company}`} g={g} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
};

export const CompanyArrivalsPanel: React.FC<CompanyArrivalsPanelProps> = ({
  areas,
  totalArrived,
  totalPending,
  year,
}) => {
  const hasAny = areas.some((a) => a.groups.length > 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  const [scrollMode, setScrollMode] = useState<TvScrollState>("idle");
  useTvKioskAutoScroll(scrollRef, hasAny, scrollPaused, {
    force: true,
    onStateChange: setScrollMode,
    pxPerSec: 16,
    seamless: hasAny,
    segmentRef,
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
        className="flex-1 h-0 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar px-3 py-2.5 tv-kiosk-scroll"
        onMouseEnter={() => setScrollPaused(true)}
        onMouseLeave={() => setScrollPaused(false)}
        onFocus={() => setScrollPaused(true)}
        onBlur={() => setScrollPaused(false)}
      >
        <div data-tv-scroll="track" className="space-y-0">
          <div ref={segmentRef} data-tv-scroll="segment" className="space-y-4 pb-2">
            <CompanyArrivalsBody areas={areas} hasAny={hasAny} year={year} />
          </div>
          {hasAny && (scrollMode === "scrolling" || scrollMode === "paused") && (
            <div aria-hidden className="space-y-4 pt-2 pb-1">
              <CompanyArrivalsBody areas={areas} hasAny={hasAny} year={year} />
            </div>
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

const STATUS_GLOW: Record<string, string> = {
  programado: "from-blue-500/20 via-transparent to-indigo-500/10",
  en_proceso: "from-amber-500/25 via-transparent to-orange-500/10",
  finalizado: "from-emerald-500/20 via-transparent to-teal-500/10",
  reprogramacion: "from-purple-500/20 via-transparent to-violet-500/10",
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
  const statusGlow =
    service.estado === "en_proceso"
      ? "bg-amber-500"
      : service.estado === "finalizado"
        ? "bg-emerald-500"
        : service.estado === "reprogramacion"
          ? "bg-purple-500"
          : "bg-blue-500";

  const tipoLabel = service.tipo
    ? service.tipo.charAt(0).toUpperCase() + service.tipo.slice(1)
    : null;

  return (
    <article
      className={clsx(
        "group relative rounded-2xl border border-white/[0.08] bg-gradient-to-br p-[1px] overflow-hidden transition-all duration-300 hover:border-white/20",
        STATUS_GLOW[service.estado] || STATUS_GLOW.programado
      )}
    >
      <div className="relative rounded-[15px] bg-slate-900/80 backdrop-blur-sm p-3.5 overflow-hidden">
        <div
          className={clsx(
            "absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-30 pointer-events-none",
            statusGlow
          )}
        />
        <div className="flex items-start gap-3">
          <div
            className={clsx(
              "w-1 rounded-full self-stretch shrink-0 shadow-lg",
              statusAccent
            )}
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span
                  className={clsx(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0 ring-2 ring-slate-800",
                    PRIORITY_DOT[service.prioridad] || "bg-slate-500"
                  )}
                />
                <div className="min-w-0">
                  <h5 className="font-bold text-white text-[15px] leading-snug line-clamp-2">
                    {service.titulo}
                  </h5>
                  <p className="text-xs text-slate-400 truncate flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                    <span className="text-blue-200/90 font-medium">{service.cliente}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={clsx("text-[10px] px-2 py-1 rounded-lg border font-bold uppercase tracking-wide", st.className)}>
                  {st.label}
                </span>
                {showDateBadge && dateBadge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                    {dateBadge}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {tipoLabel && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 border border-white/5 px-2 py-1.5">
                  <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-semibold text-slate-200 capitalize truncate">{tipoLabel}</span>
                </div>
              )}
              {(service.horaInicio || service.horaFin) && (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 border border-white/5 px-2 py-1.5">
                  <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="font-semibold text-slate-200 tabular-nums">
                    {service.horaInicio}
                    {service.horaFin ? ` – ${service.horaFin}` : ""}
                  </span>
                </div>
              )}
              {service.ubicacion && (
                <div className="col-span-2 flex items-center gap-1.5 rounded-lg bg-slate-800/60 border border-white/5 px-2 py-1.5">
                  <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="text-slate-300 truncate">{service.ubicacion}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-0.5 border-t border-white/5">
              {assignees.length > 0 ? (
                assignees.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-800/90 border border-white/10 text-[11px] font-semibold text-slate-100"
                    title={a.name}
                  >
                    {a.color && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/20"
                        style={{ backgroundColor: a.color }}
                      />
                    )}
                    <span className="truncate max-w-[140px]">{a.name}</span>
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-medium text-amber-300/80 italic">Sin metrólogo asignado</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

interface ServicesDashboardPanelProps {
  todayServices: ServicioRow[];
  programmedServices: ServicioRow[];
  usuarios: UsuarioRow[];
  todayKey: string;
}

const ServiceColumn: React.FC<{
  title: string;
  count: number;
  accent: "purple" | "indigo";
  emptyMessage: string;
  children: React.ReactNode;
}> = ({ title, count, accent, emptyMessage, children }) => {
  const accentStyles =
    accent === "purple"
      ? {
          header: "from-purple-500/15 to-transparent border-purple-500/20 text-purple-200",
          badge: "bg-purple-500/25 text-purple-100 border-purple-400/30",
          dot: "bg-purple-400",
        }
      : {
          header: "from-indigo-500/15 to-transparent border-indigo-500/20 text-indigo-200",
          badge: "bg-indigo-500/25 text-indigo-100 border-indigo-400/30",
          dot: "bg-indigo-400",
        };

  return (
    <div className="flex flex-col min-h-0 h-full rounded-xl border border-white/[0.06] bg-slate-900/40 overflow-hidden">
      <div
        className={clsx(
          "shrink-0 px-3 py-2 border-b bg-gradient-to-r flex items-center justify-between",
          accentStyles.header
        )}
      >
        <div className="flex items-center gap-2">
          <span className={clsx("w-1.5 h-1.5 rounded-full", accentStyles.dot)} />
          <h4 className="text-[11px] font-black uppercase tracking-[0.15em]">{title}</h4>
        </div>
        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full border", accentStyles.badge)}>
          {count}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2 py-2 space-y-2">
        {count === 0 ? (
          <p className="text-xs text-slate-500 italic text-center py-6">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export const ServicesDashboardPanel: React.FC<ServicesDashboardPanelProps> = ({
  todayServices,
  programmedServices,
  usuarios,
  todayKey,
}) => {
  const hasAny = todayServices.length > 0 || programmedServices.length > 0;

  const usuariosMetrologia = useMemo(
    () => usuarios.filter((u) => isMetrologyRole(u)),
    [usuarios]
  );

  return (
    <div
      className={`h-full flex flex-col rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/40 backdrop-blur-md overflow-hidden shadow-xl shadow-black/20`}
    >
      <div className="px-4 py-3 border-b border-white/10 shrink-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-purple-950/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/25">
            <Briefcase className="w-5 h-5 text-purple-300" />
          </div>
          <div>
            <h3 className="text-base lg:text-lg font-bold text-white tracking-tight">Servicios</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Operación de campo · hoy y agenda</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="text-center px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <p className="text-lg font-black text-purple-200 leading-none">{todayServices.length}</p>
            <p className="text-[9px] uppercase tracking-wider text-purple-400/80 font-bold mt-0.5">Hoy</p>
          </div>
          <div className="text-center px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-lg font-black text-indigo-200 leading-none">{programmedServices.length}</p>
            <p className="text-[9px] uppercase tracking-wider text-indigo-400/80 font-bold mt-0.5">Prog.</p>
          </div>
        </div>
      </div>

      {!hasAny ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
          <Briefcase className="w-10 h-10 text-slate-600" />
          <p className="text-sm font-medium">Sin servicios para hoy ni programados</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-2.5 p-2.5">
          <ServiceColumn
            title="Hoy"
            count={todayServices.length}
            accent="purple"
            emptyMessage="Ningún servicio para hoy"
          >
            {todayServices.map((s) => (
              <ServicioTvCard key={s.id} service={s} usuarios={usuariosMetrologia} />
            ))}
          </ServiceColumn>

          <ServiceColumn
            title="Programados"
            count={programmedServices.length}
            accent="indigo"
            emptyMessage="Sin fechas futuras"
          >
            {programmedServices.map((s) => {
              const dateKey = normalizeServicioDateKey(s.fecha);
              return (
                <ServicioTvCard
                  key={s.id}
                  service={s}
                  usuarios={usuariosMetrologia}
                  showDateBadge
                  dateBadge={formatServicioScheduleBadge(dateKey, todayKey)}
                />
              );
            })}
          </ServiceColumn>
        </div>
      )}
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

export type MetrologoMonthChartRow = {
  name: string;
  total: number;
  color: string;
  carrying?: number;
};

interface MetrologosMonthChartProps {
  data: MetrologoMonthChartRow[];
}

const MetrologoMonthTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: MetrologoMonthChartRow }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const calibraciones = payload[0]?.value ?? row?.total ?? 0;
  const enLab = row?.carrying ?? 0;
  return (
    <div className="bg-slate-800/95 border border-slate-700 p-3 rounded-lg shadow-xl">
      <p className="text-slate-200 text-xs font-bold mb-1">{label}</p>
      <p className="text-white text-sm font-black">{calibraciones} equipos calibrados (mes)</p>
      {enLab > 0 && (
        <p className="text-amber-200 text-xs mt-1 font-semibold">{enLab} en laboratorio ahora</p>
      )}
    </div>
  );
};

export const MetrologosMonthChart: React.FC<MetrologosMonthChartProps> = ({ data }) => {
  const leaderTotal = useMemo(
    () => (data.length ? Math.max(...data.map((d) => d.total)) : 0),
    [data]
  );

  return (
    <div
      className={`h-full min-h-0 rounded-2xl border ${CALIBRATION_COLORS.cardBorder} bg-slate-800/50 p-3 flex flex-col overflow-hidden`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h3 className="text-sm font-bold text-gray-300">Calibraciones del mes</h3>
        <span className="text-[10px] text-gray-500">Solo metrólogos · número sobre barra</span>
      </div>
      <div className="flex-1 min-h-[120px] w-full min-w-0">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <BarChart data={data} margin={{ top: 26, right: 8, left: 4, bottom: 4 }}>
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
              <Tooltip content={<MetrologoMonthTooltip />} />
              <Bar
                dataKey="total"
                name="Equipos"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="total"
                  position="top"
                  fill="#f8fafc"
                  fontSize={15}
                  fontWeight={900}
                  formatter={(value: number) => (value > 0 ? String(value) : "")}
                />
                {data.map((e, i) => {
                  const isLeader = e.total > 0 && e.total === leaderTotal;
                  return (
                    <Cell
                      key={`${e.name}-${i}`}
                      fill={e.color}
                      stroke={isLeader ? "#fbbf24" : undefined}
                      strokeWidth={isLeader ? 2 : 0}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            Sin calibraciones de metrólogos este mes
          </div>
        )}
      </div>
      <style>{`
        .recharts-label-list text {
          paint-order: stroke fill;
          stroke: #0f172a;
          stroke-width: 4px;
          stroke-linejoin: round;
        }
      `}</style>
    </div>
  );
};
