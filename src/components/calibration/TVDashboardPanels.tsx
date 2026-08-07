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
  UploadCloud,
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
  formatTecnicoShortName,
  TecnicoPendiente,
  ServicioCertProgress,
} from "../../utils/calibrationShared.tsx";
import { isHiddenTestAccount } from "../../utils/hiddenUsers";

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
    <div className={`h-full flex flex-col tv-panel overflow-hidden`}>
      <h3 className="tv-panel-head text-sm font-semibold text-[var(--tv-muted)] uppercase tracking-[0.14em] flex items-center gap-2 !py-2.5">
        <Clock className="w-4 h-4 text-[var(--tv-brand-bright)]" />
        <span className="tv-display text-[var(--tv-text)] normal-case tracking-tight text-base">Calendario</span>
      </h3>
      <div className="tv-calendar-wrap flex-1 min-h-0 overflow-hidden px-2 pb-1">
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
      <p className="text-[10px] text-[var(--tv-dim)] mb-2.5 text-center leading-snug px-2">
        Ámbar = llegadas · Azul = servicios
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
  DIMENSIONAL: "border-[rgba(45,212,191,0.35)] bg-[rgba(45,212,191,0.08)] text-teal-200",
  MECANICA: "border-[rgba(91,163,224,0.4)] bg-[rgba(36,100,163,0.14)] text-sky-200",
  ELECTRICA: "border-[rgba(232,165,75,0.4)] bg-[rgba(232,165,75,0.1)] text-amber-200",
  "SIN ÁREA": "border-[var(--tv-line)] bg-white/[0.03] text-[var(--tv-muted)]",
};

const CompanyCard: React.FC<{ g: CompanyArrivalGroup }> = ({ g }) => {
  const pct = g.arrived > 0 ? Math.round((g.calibrated / g.arrived) * 100) : 0;
  const hasGap = g.incomplete > 0 || g.arrived > g.calibrated;
  return (
    <div
      className={clsx(
        "rounded-xl border px-3.5 py-3 transition-colors",
        hasGap
          ? "border-[rgba(232,106,92,0.45)] bg-[rgba(232,106,92,0.08)]"
          : "border-[var(--tv-line)] bg-white/[0.025] hover:border-[var(--tv-line-strong)]"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-[var(--tv-brand-bright)] shrink-0" />
          <span className="font-semibold text-[var(--tv-text)] text-sm truncate" title={g.company}>
            {g.company}
          </span>
        </div>
        <span className="tv-mono text-[10px] text-[var(--tv-muted)] shrink-0">{pct}%</span>
      </div>
      {hasGap && (
        <div className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-[rgba(232,106,92,0.14)] border border-[rgba(232,106,92,0.35)] px-2 py-1">
          <AlertCircle className="w-3.5 h-3.5 text-[var(--tv-coral)] shrink-0" />
          <span className="text-[11px] font-semibold text-red-100">
            {g.incomplete === 1
              ? "1 sin terminar — ¿qué pasó?"
              : `${g.incomplete} sin terminar — ¿qué pasó?`}
          </span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[var(--tv-ink-2)]/60 px-2 py-1.5 border border-[var(--tv-line)]">
          <p className="text-[9px] uppercase tracking-wider text-[var(--tv-dim)] font-semibold">En lab</p>
          <p className="tv-mono text-xl font-semibold text-[var(--tv-text)] leading-tight">{g.arrived}</p>
        </div>
        <div className="rounded-lg bg-[var(--tv-amber-soft)] px-2 py-1.5 border border-[rgba(232,165,75,0.28)]">
          <p className="text-[9px] uppercase tracking-wider text-amber-300/80 font-semibold">Pend.</p>
          <p className="tv-mono text-xl font-semibold text-amber-200 leading-tight">{g.pending}</p>
        </div>
        <div className="rounded-lg bg-[var(--tv-mint-soft)] px-2 py-1.5 border border-[rgba(61,186,140,0.28)]">
          <p className="text-[9px] uppercase tracking-wider text-emerald-300/80 font-semibold">Listos</p>
          <p className="tv-mono text-xl font-semibold text-emerald-300 leading-tight">{g.calibrated}</p>
        </div>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={clsx(
            "h-full transition-all duration-700 rounded-full",
            hasGap ? "bg-gradient-to-r from-[var(--tv-coral)] to-[var(--tv-amber)]" : "bg-gradient-to-r from-[var(--tv-mint)] to-[var(--tv-brand-bright)]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {g.batches.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-[var(--tv-line)] pt-2">
          <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--tv-dim)] font-semibold">Por llegada</p>
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
                  batchHasGap
                    ? "bg-[rgba(232,106,92,0.1)] border border-[rgba(232,106,92,0.28)]"
                    : "bg-white/[0.03] border border-[var(--tv-line)]"
                )}
              >
                <span className="font-semibold text-amber-200/90 shrink-0">{dateLabel}</span>
                <span className="text-[var(--tv-muted)]">
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
      <div className="flex flex-col items-center justify-center text-[var(--tv-dim)] gap-2 py-10">
        <CheckCircle2 className="w-10 h-10 text-[var(--tv-mint)]/80" />
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
    <div className="h-full min-h-0 flex-1 flex flex-col tv-panel overflow-hidden">
      <div className="tv-panel-head flex items-center justify-between shrink-0 gap-3">
        <div className="min-w-0">
          <h3 className="tv-display text-base lg:text-lg font-bold text-[var(--tv-text)] flex items-center gap-2 tracking-tight">
            <Truck className="w-5 h-5 text-[var(--tv-amber)]" /> Equipos en laboratorio
          </h3>
          <p className="text-[11px] text-[var(--tv-muted)] mt-0.5">
            Solo {year} · activos por área y fecha de llegada
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className="tv-chip text-amber-100 border-[rgba(232,165,75,0.35)] bg-[var(--tv-amber-soft)]">
            <span className="tv-mono text-sm">{totalArrived}</span> activos
          </span>
          <span className="tv-chip text-amber-50 border-[rgba(232,165,75,0.45)] bg-[rgba(232,165,75,0.22)]">
            <span className="tv-mono text-sm">{totalPending}</span> por calibrar
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
  programado: {
    label: "Programado",
    className: "bg-[rgba(36,100,163,0.2)] text-sky-200 border-[rgba(91,163,224,0.35)]",
  },
  en_proceso: {
    label: "En proceso",
    className: "bg-[var(--tv-amber-soft)] text-amber-100 border-[rgba(232,165,75,0.4)]",
  },
  finalizado: {
    label: "Finalizado",
    className: "bg-[var(--tv-mint-soft)] text-emerald-200 border-[rgba(61,186,140,0.4)]",
  },
  reprogramacion: {
    label: "Reprogramado",
    className: "bg-white/[0.04] text-[var(--tv-muted)] border-[var(--tv-line)]",
  },
};

const PRIORITY_DOT: Record<string, string> = {
  critica: "bg-[var(--tv-coral)]",
  alta: "bg-[var(--tv-amber)]",
  media: "bg-sky-400",
  baja: "bg-[var(--tv-dim)]",
};

const STATUS_ACCENT: Record<string, string> = {
  programado: "bg-[var(--tv-brand-bright)]",
  en_proceso: "bg-[var(--tv-amber)]",
  finalizado: "bg-[var(--tv-mint)]",
  reprogramacion: "bg-[var(--tv-dim)]",
};

const ServicioTvCard: React.FC<{
  service: ServicioRow;
  usuarios: UsuarioRow[];
  dateBadge?: string;
  showDateBadge?: boolean;
  certProgress?: ServicioCertProgress;
}> = ({ service, usuarios, dateBadge, showDateBadge, certProgress }) => {
  const assignees = useMemo(
    () => resolveServicioAssignees(service.personas, usuarios),
    [service.personas, usuarios]
  );
  const st = SERVICE_STATUS[service.estado] || SERVICE_STATUS.programado;
  const accent = STATUS_ACCENT[service.estado] || STATUS_ACCENT.programado;

  const tipoLabel = service.tipo
    ? service.tipo.charAt(0).toUpperCase() + service.tipo.slice(1)
    : null;

  const totalEquipos = certProgress?.total ?? 0;
  const reviewedEquipos = certProgress?.reviewed ?? 0;
  const showCertCounter =
    totalEquipos > 0 ||
    service.estado === "en_proceso" ||
    service.estado === "finalizado";
  const certDone = totalEquipos > 0 && reviewedEquipos >= totalEquipos;

  return (
    <article className="relative rounded-xl border border-[var(--tv-line)] bg-white/[0.03] overflow-hidden hover:border-[var(--tv-line-strong)] transition-colors">
      <div className="flex">
        <div className={clsx("w-[3px] shrink-0", accent)} />
        <div className="min-w-0 flex-1 p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <span
                className={clsx(
                  "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                  PRIORITY_DOT[service.prioridad] || "bg-[var(--tv-dim)]"
                )}
              />
              <div className="min-w-0">
                <h5 className="tv-display font-bold text-[var(--tv-text)] text-[15px] leading-snug line-clamp-2">
                  {service.titulo}
                </h5>
                <p className="text-xs text-[var(--tv-muted)] truncate flex items-center gap-1.5 mt-1">
                  <Building2 className="w-3.5 h-3.5 shrink-0 text-[var(--tv-brand-bright)]" />
                  <span className="text-sky-100/90 font-medium">{service.cliente}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span
                className={clsx(
                  "text-[10px] px-2 py-0.5 rounded-md border font-bold uppercase tracking-wide",
                  st.className
                )}
              >
                {st.label}
              </span>
              {showDateBadge && dateBadge && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--tv-brand-soft)] text-sky-100 border border-[rgba(91,163,224,0.3)]">
                  {dateBadge}
                </span>
              )}
              {showCertCounter && (
                <div
                  className={clsx(
                    "text-center px-2 py-1 rounded-md border min-w-[3.1rem]",
                    certDone
                      ? "bg-[var(--tv-mint-soft)] border-[rgba(61,186,140,0.4)]"
                      : service.estado === "finalizado"
                        ? "bg-[var(--tv-amber-soft)] border-[rgba(232,165,75,0.4)]"
                        : "bg-white/[0.03] border-[var(--tv-line)]"
                  )}
                  title={`${totalEquipos} equipos · ${reviewedEquipos} revisados por calidad`}
                >
                  <p
                    className={clsx(
                      "tv-mono text-base font-semibold tabular-nums leading-none",
                      certDone
                        ? "text-emerald-300"
                        : service.estado === "finalizado"
                          ? "text-amber-200"
                          : "text-[var(--tv-text)]"
                    )}
                  >
                    {totalEquipos}/{reviewedEquipos}
                  </p>
                  <p className="text-[8px] uppercase tracking-[0.12em] text-[var(--tv-dim)] font-semibold mt-0.5">
                    cert.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {tipoLabel && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-[var(--tv-line)] px-2 py-1 text-[var(--tv-muted)]">
                <Briefcase className="w-3 h-3 shrink-0" />
                <span className="font-medium text-[var(--tv-text)]/90 capitalize truncate">{tipoLabel}</span>
              </span>
            )}
            {(service.horaInicio || service.horaFin) && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-[var(--tv-line)] px-2 py-1">
                <Clock className="w-3 h-3 text-[var(--tv-amber)] shrink-0" />
                <span className="tv-mono font-medium text-[var(--tv-text)]/90 tabular-nums">
                  {service.horaInicio}
                  {service.horaFin ? ` – ${service.horaFin}` : ""}
                </span>
              </span>
            )}
            {service.ubicacion && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-[var(--tv-line)] px-2 py-1 max-w-full">
                <MapPin className="w-3 h-3 text-[var(--tv-coral)] shrink-0" />
                <span className="text-[var(--tv-muted)] truncate">{service.ubicacion}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-0.5 border-t border-[var(--tv-line)]">
            {assignees.length > 0 ? (
              assignees.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] border border-[var(--tv-line)] text-[11px] font-medium text-[var(--tv-text)]"
                  title={a.name}
                >
                  {a.color && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
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
    </article>
  );
};

interface ServicesDashboardPanelProps {
  todayServices: ServicioRow[];
  programmedServices: ServicioRow[];
  finalizedServices: ServicioRow[];
  usuarios: UsuarioRow[];
  todayKey: string;
  certProgressByService?: Record<string, ServicioCertProgress>;
}

const ServiceColumn: React.FC<{
  title: string;
  count: number;
  accent: "purple" | "indigo" | "emerald";
  emptyMessage: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, count, accent, emptyMessage, children, className }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  const [scrollMode, setScrollMode] = useState<TvScrollState>("idle");
  const canAutoScroll = count > 0;

  useTvKioskAutoScroll(scrollRef, canAutoScroll, scrollPaused, {
    force: true,
    onStateChange: setScrollMode,
    pxPerSec: 14,
    seamless: canAutoScroll,
    segmentRef,
  });

  const accentStyles =
    accent === "purple"
      ? {
          header: "from-[rgba(36,100,163,0.2)] to-transparent border-[rgba(91,163,224,0.25)] text-sky-100",
          badge: "bg-[var(--tv-brand-soft)] text-sky-100 border-[rgba(91,163,224,0.35)]",
          dot: "bg-[var(--tv-brand-bright)]",
        }
      : accent === "emerald"
        ? {
            header: "from-[rgba(61,186,140,0.16)] to-transparent border-[rgba(61,186,140,0.28)] text-emerald-100",
            badge: "bg-[var(--tv-mint-soft)] text-emerald-100 border-[rgba(61,186,140,0.35)]",
            dot: "bg-[var(--tv-mint)]",
          }
        : {
            header: "from-white/[0.04] to-transparent border-[var(--tv-line)] text-[var(--tv-muted)]",
            badge: "bg-white/[0.04] text-[var(--tv-text)] border-[var(--tv-line)]",
            dot: "bg-[var(--tv-dim)]",
          };

  return (
    <div
      className={clsx(
        "flex flex-col min-h-0 rounded-xl border border-[var(--tv-line)] bg-[rgba(8,14,24,0.55)] overflow-hidden",
        className ?? "h-full"
      )}
    >
      <div
        className={clsx(
          "shrink-0 px-3 py-2 border-b bg-gradient-to-r flex items-center justify-between",
          accentStyles.header
        )}
      >
        <div className="flex items-center gap-2">
          <span className={clsx("w-1.5 h-1.5 rounded-full", accentStyles.dot)} />
          <h4 className="tv-display text-[11px] font-bold uppercase tracking-[0.16em]">{title}</h4>
        </div>
        <span className={clsx("tv-mono text-[11px] font-semibold px-2 py-0.5 rounded-md border", accentStyles.badge)}>
          {count}
        </span>
      </div>
      <div
        ref={scrollRef}
        data-tv-scroll="viewport"
        data-tv-scroll-mode={scrollMode}
        className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-2 py-2 tv-kiosk-scroll"
        onMouseEnter={() => setScrollPaused(true)}
        onMouseLeave={() => setScrollPaused(false)}
        onFocus={() => setScrollPaused(true)}
        onBlur={() => setScrollPaused(false)}
      >
        {count === 0 ? (
          <p className="text-xs text-[var(--tv-dim)] italic text-center py-6">{emptyMessage}</p>
        ) : (
          <div data-tv-scroll="track" className="space-y-0">
            <div ref={segmentRef} data-tv-scroll="segment" className="space-y-2 pb-1">
              {children}
            </div>
            {canAutoScroll && (scrollMode === "scrolling" || scrollMode === "paused") && (
              <div aria-hidden className="space-y-2 pt-1 pb-1">
                {children}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ServicesDashboardPanel: React.FC<ServicesDashboardPanelProps> = ({
  todayServices,
  programmedServices,
  finalizedServices,
  usuarios,
  todayKey,
  certProgressByService = {},
}) => {
  const hasAny =
    todayServices.length > 0 || programmedServices.length > 0 || finalizedServices.length > 0;

  const usuariosMetrologia = useMemo(
    () => usuarios.filter((u) => !isHiddenTestAccount(u) && isMetrologyRole(u)),
    [usuarios]
  );

  return (
    <div className="h-full flex flex-col tv-panel overflow-hidden">
      <div className="tv-panel-head flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-[var(--tv-brand-soft)] border border-[rgba(91,163,224,0.3)]">
            <Briefcase className="w-5 h-5 text-[var(--tv-brand-bright)]" />
          </div>
          <div className="min-w-0">
            <h3 className="tv-display text-base lg:text-lg font-bold text-[var(--tv-text)] tracking-tight">
              Servicios
            </h3>
            <p className="text-[11px] text-[var(--tv-muted)] mt-0.5 truncate">
              Campo · avance de calidad
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <div className="text-center px-2.5 py-1 rounded-lg bg-[var(--tv-brand-soft)] border border-[rgba(91,163,224,0.28)]">
            <p className="tv-mono text-lg font-semibold text-sky-100 leading-none">{todayServices.length}</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--tv-brand-bright)] font-semibold mt-0.5">Hoy</p>
          </div>
          <div className="text-center px-2.5 py-1 rounded-lg bg-[var(--tv-mint-soft)] border border-[rgba(61,186,140,0.28)]">
            <p className="tv-mono text-lg font-semibold text-emerald-100 leading-none">{finalizedServices.length}</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--tv-mint)] font-semibold mt-0.5">Fin.</p>
          </div>
          <div className="text-center px-2.5 py-1 rounded-lg bg-white/[0.03] border border-[var(--tv-line)]">
            <p className="tv-mono text-lg font-semibold text-[var(--tv-text)] leading-none">{programmedServices.length}</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--tv-muted)] font-semibold mt-0.5">Prog.</p>
          </div>
        </div>
      </div>

      {!hasAny ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--tv-dim)] gap-2">
          <Briefcase className="w-10 h-10 opacity-40" />
          <p className="text-sm font-medium">Sin servicios para hoy, finalizados ni programados</p>
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
              <ServicioTvCard
                key={s.id}
                service={s}
                usuarios={usuariosMetrologia}
                certProgress={certProgressByService[s.id]}
              />
            ))}
          </ServiceColumn>

          <div className="min-h-0 h-full flex flex-col gap-2.5">
            <ServiceColumn
              title="Finalizados"
              count={finalizedServices.length}
              accent="emerald"
              emptyMessage="Sin finalizados pendientes de calidad"
              className="min-h-0 flex-[1.35]"
            >
              {finalizedServices.map((s) => {
                const dateKey = normalizeServicioDateKey(s.fecha);
                return (
                  <ServicioTvCard
                    key={s.id}
                    service={s}
                    usuarios={usuariosMetrologia}
                    showDateBadge
                    dateBadge={formatDateKeyDisplay(dateKey)}
                    certProgress={certProgressByService[s.id]}
                  />
                );
              })}
            </ServiceColumn>

            <ServiceColumn
              title="Programados"
              count={programmedServices.length}
              accent="indigo"
              emptyMessage="Sin fechas futuras"
              className="min-h-0 flex-1"
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
                    certProgress={certProgressByService[s.id]}
                  />
                );
              })}
            </ServiceColumn>
          </div>
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
  <div className="flex flex-wrap items-center gap-2 lg:gap-2.5 px-2.5 py-1.5 rounded-xl border border-[var(--tv-line)] bg-white/[0.03]">
    <span className="text-xs font-semibold text-[var(--tv-muted)] flex items-center gap-1.5 px-1">
      <Activity className="w-4 h-4 text-[var(--tv-amber)]" /> Lab
      <span className="tv-mono text-[var(--tv-text)] text-base font-semibold">{total}</span>
    </span>
    {Object.entries(pendientes).map(([dep, count]) => {
      if (count === 0 && dep === "Sin Asignar") return null;
      return (
        <div
          key={dep}
          className="flex items-center gap-1.5 bg-[rgba(8,14,24,0.65)] border border-[var(--tv-line)] px-2.5 py-1 rounded-lg"
        >
          <div
            className={clsx(
              "w-1.5 h-1.5 rounded-full",
              count > 0 ? "bg-[var(--tv-amber)]" : "bg-[var(--tv-mint)]"
            )}
          />
          <span className="text-[10px] font-semibold text-[var(--tv-dim)] uppercase tracking-wide">{dep}</span>
          <span
            className={clsx(
              "tv-mono text-sm font-semibold",
              count > 0 ? "text-[var(--tv-amber)]" : "text-[var(--tv-mint)]"
            )}
          >
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
    <div className="h-full tv-panel overflow-hidden flex flex-col min-h-0">
      <div className="tv-panel-head flex items-center justify-between shrink-0 !py-2.5">
        <h3 className="tv-display text-sm font-bold text-[var(--tv-text)] flex items-center gap-2 tracking-tight">
          <AlertCircle className="w-4 h-4 text-[var(--tv-coral)]" /> Prioridad en laboratorio
        </h3>
        <span className="text-[10px] text-[var(--tv-muted)]">
          <span className="tv-mono font-semibold text-[var(--tv-text)]">{total}</span> pendientes · {year}
        </span>
      </div>
      <div className="flex text-[9px] text-[var(--tv-dim)] uppercase font-semibold tracking-wider px-3 py-1.5 border-b border-[var(--tv-line)] shrink-0">
        <div className="w-[26%]">Cliente</div>
        <div className="w-[28%]">Equipo</div>
        <div className="w-[22%] text-center">Estado</div>
        <div className="w-[24%] text-right">Técnico</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
        {sectionsWithItems.length === 0 ? (
          <p className="text-center text-[var(--tv-dim)] text-xs py-6">Laboratorio al día ({year})</p>
        ) : (
          sectionsWithItems.map((section) => (
            <div key={section.area}>
              <div
                className={clsx(
                  "sticky top-0 z-10 px-3 py-1 text-[10px] font-bold tracking-[0.14em] border-b border-[var(--tv-line)]",
                  AREA_HEADER_STYLES[section.areaLabel] || AREA_HEADER_STYLES["SIN ÁREA"]
                )}
              >
                {section.areaLabel} ({section.items.length})
              </div>
              {section.items.map((eq, idx) => (
                <div
                  key={eq.docId || eq.id || `${section.area}-${idx}`}
                  className="flex items-center px-3 py-2 border-b border-[var(--tv-line)] text-xs hover:bg-white/[0.03]"
                >
                  <div className="w-[26%] pr-1 truncate text-sky-200 font-semibold">{eq.cliente || "—"}</div>
                  <div className="w-[28%] pr-1 truncate text-[var(--tv-text)]/90">{eq.equipo || "—"}</div>
                  <div className="w-[22%] flex justify-center">
                    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border border-[var(--tv-line)]", eq.statusColor)}>
                      {eq.daysLabel}
                    </span>
                  </div>
                  <div
                    className="w-[24%] flex justify-end items-center gap-1 text-[var(--tv-muted)]"
                    title={eq.nombre || eq.assignedTo || "Sin asignar"}
                  >
                    <UserCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {formatTecnicoShortName(eq.nombre || eq.assignedTo)}
                    </span>
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

interface TecnicosPendientesPanelProps {
  data: TecnicoPendiente[];
  dias: number;
}

const formatChipDate = (dateKey: string) => {
  const [, m, d] = dateKey.split("-");
  return `${d}/${m}`;
};

const MAX_CHIPS = 4;

const TecnicoPendienteRow: React.FC<{ tecnico: TecnicoPendiente }> = ({ tecnico }) => {
  const visibles = tecnico.dias.slice(0, MAX_CHIPS);
  const ocultos = tecnico.dias.length - visibles.length;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--tv-line)] last:border-b-0">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: tecnico.color }}
      />

      <div className="w-[26%] min-w-0">
        <p className="tv-display text-sm font-bold text-[var(--tv-text)] truncate" title={tecnico.name}>
          {formatTecnicoShortName(tecnico.name)}
        </p>
        <p className="text-[10px] text-[var(--tv-dim)]">{tecnico.totalMes} en el mes</p>
      </div>

      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
        {visibles.map((dia) => (
          <span
            key={dia.dateKey}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(232,165,75,0.3)] bg-[var(--tv-amber-soft)] px-2 py-1 text-[11px]"
            title={`${dia.dateKey}: calibró ${dia.hechas}, cargó ${dia.cerradas}`}
          >
            <span className="tv-mono font-semibold text-amber-100 tabular-nums">
              {formatChipDate(dia.dateKey)}
            </span>
            <span className="tv-mono text-[var(--tv-muted)] tabular-nums">
              {dia.cerradas}/{dia.hechas}
            </span>
            <span className="tv-mono font-semibold text-[var(--tv-coral)] tabular-nums">+{dia.debe}</span>
          </span>
        ))}
        {ocultos > 0 && (
          <span className="text-[10px] text-[var(--tv-dim)] font-semibold">+{ocultos} días más</span>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="tv-mono text-2xl font-semibold text-[var(--tv-coral)] leading-none tabular-nums">
          {tecnico.debeTotal}
        </p>
        <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--tv-dim)] font-semibold mt-0.5">
          {tecnico.debeSitio > 0 && `Sitio ${tecnico.debeSitio}`}
          {tecnico.debeSitio > 0 && tecnico.debeLaboratorio > 0 && " · "}
          {tecnico.debeLaboratorio > 0 && `Lab ${tecnico.debeLaboratorio}`}
        </p>
      </div>
    </div>
  );
};

/** Equipos calibrados que el técnico aún no cierra en Drive. Al cargarlos, la fila desaparece. */
export const TecnicosPendientesPanel: React.FC<TecnicosPendientesPanelProps> = ({ data, dias }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPaused, setScrollPaused] = useState(false);
  useTvKioskAutoScroll(scrollRef, data.length > 0, scrollPaused, { force: true, pxPerSec: 14 });

  const totalDebe = useMemo(() => data.reduce((s, t) => s + t.debeTotal, 0), [data]);

  return (
    <div className="h-full min-h-0 tv-panel flex flex-col overflow-hidden">
      <div className="tv-panel-head flex items-center justify-between shrink-0 !py-2.5">
        <div>
          <h3 className="tv-display text-sm font-bold text-[var(--tv-text)] flex items-center gap-2 tracking-tight">
            <UploadCloud className="w-4 h-4 text-[var(--tv-coral)]" /> Pendientes por técnico
          </h3>
          <p className="text-[10px] text-[var(--tv-muted)] mt-0.5">
            Calibrado sin cargar en Drive · últimos {dias} días
          </p>
        </div>
        {totalDebe > 0 && (
          <span className="tv-chip text-[var(--tv-coral)] border-[rgba(232,106,92,0.4)] bg-[var(--tv-coral-soft)]">
            <span className="tv-mono text-sm">{totalDebe}</span> por cargar
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto hide-scrollbar tv-kiosk-scroll"
        onMouseEnter={() => setScrollPaused(true)}
        onMouseLeave={() => setScrollPaused(false)}
      >
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-[var(--tv-dim)] py-6">
            <CheckCircle2 className="w-8 h-8 text-[var(--tv-mint)]/80" />
            <p className="text-sm font-medium">Todos al corriente</p>
          </div>
        ) : (
          data.map((tecnico) => <TecnicoPendienteRow key={tecnico.name} tecnico={tecnico} />)
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
    <div className="h-full min-h-0 tv-panel p-3 flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 mb-2 shrink-0">
        <h3 className="tv-display text-sm font-bold text-[var(--tv-text,#edf2f8)]">Calibraciones del mes</h3>
        <span className="text-[10px] text-[var(--tv-muted,#8fa0b8)]">Solo metrólogos · número sobre barra</span>
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
