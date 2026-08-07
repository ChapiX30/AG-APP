import React, { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import {
  useCalibrationDashboardData,
  DEUDA_TECNICO_DIAS,
} from "../hooks/useCalibrationDashboardData";
import {
  DashboardCalendar,
  CompanyArrivalsPanel,
  ServicesDashboardPanel,
  LabStatusBar,
  LabPendingTable,
  TecnicosPendientesPanel,
  MetrologosMonthChart,
} from "./calibration/TVDashboardPanels";

/** Aislado del resto del dashboard: el tick de 1 s no debe re-renderizar los paneles. */
const HeaderClock: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="tv-clock text-right">
      <p className="tv-mono text-3xl lg:text-[2.15rem] font-medium tabular-nums tracking-tight text-[var(--tv-text)] leading-none">
        {now.toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
      <p className="mt-1.5 text-[11px] font-medium text-[var(--tv-muted)] capitalize tracking-wide">
        {now.toLocaleDateString("es-MX", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
    </div>
  );
};

const TVDashboardScreen: React.FC = () => {
  const { goBack } = useNavigation();
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const {
    loading,
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
    tecnicosPendientes,
    arrivalsForMonth,
    metrologosMonth,
    usuarios,
  } = useCalibrationDashboardData(selectedDate);

  if (loading) {
    return (
      <div className="tv-root h-full min-h-0 flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="tv-loader" />
          <p className="tv-display text-sm text-[var(--tv-muted)] tracking-wide">Cargando operación…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-root h-full min-h-0 flex-1 flex flex-col overflow-hidden relative">
      <div className="tv-atmosphere" aria-hidden>
        <div className="tv-atmosphere__wash" />
        <div className="tv-atmosphere__grid" />
        <div className="tv-atmosphere__vignette" />
      </div>

      <header className="tv-header relative z-40 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="tv-icon-btn"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--tv-brand-bright)]">
              Equipos y Servicios AG
            </p>
            <h1 className="tv-display text-xl lg:text-2xl font-bold tracking-tight text-[var(--tv-text)] leading-tight">
              Dashboard TV
            </h1>
          </div>
        </div>

        <LabStatusBar
          pendientes={labPending.pendientesLaboratorio}
          total={labPending.totalPendientes}
        />

        <HeaderClock />
      </header>

      <main className="relative z-10 flex-1 min-h-0 overflow-hidden p-3 lg:p-4 grid grid-cols-12 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:gap-3.5">
        <section className="col-span-12 lg:col-span-2 min-h-0 h-full row-span-1 hidden lg:flex lg:flex-col overflow-hidden tv-enter" style={{ animationDelay: "40ms" }}>
          <DashboardCalendar
            selectedDate={selectedDate}
            onSelectDate={(d) => {
              const next = new Date(d);
              next.setHours(0, 0, 0, 0);
              setSelectedDate(next);
            }}
            activityDateKeys={activityDateKeys}
            arrivalsForMonth={arrivalsForMonth}
          />
        </section>

        <section className="col-span-12 lg:col-span-5 min-h-0 h-full row-span-1 flex flex-1 flex-col overflow-hidden tv-enter" style={{ animationDelay: "90ms" }}>
          <CompanyArrivalsPanel
            areas={companyArrivalsByArea}
            totalArrived={totalArrivedToday}
            totalPending={totalPendingToday}
            year={new Date().getFullYear()}
          />
        </section>

        <section className="col-span-12 lg:col-span-5 min-h-0 h-full row-span-1 flex flex-col gap-3 overflow-hidden tv-enter" style={{ animationDelay: "140ms" }}>
          <div className="flex-1 min-h-0">
            <ServicesDashboardPanel
              todayServices={todayServices}
              programmedServices={programmedServices}
              finalizedServices={finalizedServices}
              usuarios={usuarios}
              todayKey={todayKey}
              certProgressByService={servicioCertProgress}
            />
          </div>
          <div className="lg:hidden h-[220px] shrink-0">
            <DashboardCalendar
              selectedDate={selectedDate}
              onSelectDate={(d) => {
                const next = new Date(d);
                next.setHours(0, 0, 0, 0);
                setSelectedDate(next);
              }}
              activityDateKeys={activityDateKeys}
              arrivalsForMonth={arrivalsForMonth}
            />
          </div>
        </section>

        <section className="col-span-12 lg:col-span-4 min-h-[180px] max-h-[280px] row-span-1 tv-enter" style={{ animationDelay: "190ms" }}>
          <LabPendingTable
            byArea={labPending.byArea}
            total={labPending.totalPendientes}
            year={labPending.year}
          />
        </section>
        <section className="col-span-12 lg:col-span-4 min-h-[180px] max-h-[280px] row-span-1 h-full flex flex-col tv-enter" style={{ animationDelay: "220ms" }}>
          <MetrologosMonthChart data={metrologosMonth} />
        </section>
        <section className="col-span-12 lg:col-span-4 min-h-[180px] max-h-[280px] row-span-1 h-full flex flex-col tv-enter" style={{ animationDelay: "250ms" }}>
          <TecnicosPendientesPanel data={tecnicosPendientes} dias={DEUDA_TECNICO_DIAS} />
        </section>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .tv-root {
          --tv-ink: #070b12;
          --tv-ink-2: #0c1220;
          --tv-surface: rgba(12, 18, 32, 0.78);
          --tv-surface-solid: #0e1626;
          --tv-surface-hi: rgba(22, 32, 52, 0.92);
          --tv-line: rgba(148, 173, 204, 0.14);
          --tv-line-strong: rgba(148, 173, 204, 0.22);
          --tv-brand: #2464A3;
          --tv-brand-bright: #5ba3e0;
          --tv-brand-soft: rgba(36, 100, 163, 0.22);
          --tv-amber: #e8a54b;
          --tv-amber-soft: rgba(232, 165, 75, 0.16);
          --tv-mint: #3dba8c;
          --tv-mint-soft: rgba(61, 186, 140, 0.16);
          --tv-coral: #e86a5c;
          --tv-coral-soft: rgba(232, 106, 92, 0.16);
          --tv-text: #edf2f8;
          --tv-muted: #8fa0b8;
          --tv-dim: #64748b;
          background:
            radial-gradient(1200px 600px at 8% -10%, rgba(36, 100, 163, 0.28), transparent 55%),
            radial-gradient(900px 500px at 92% 0%, rgba(232, 165, 75, 0.08), transparent 50%),
            linear-gradient(165deg, #070b12 0%, #0a1220 48%, #081018 100%);
          color: var(--tv-text);
          font-family: Outfit, system-ui, sans-serif;
        }
        .tv-display { font-family: Syne, Outfit, system-ui, sans-serif; }
        .tv-mono { font-family: "IBM Plex Mono", ui-monospace, monospace; }

        .tv-atmosphere { pointer-events: none; position: absolute; inset: 0; overflow: hidden; }
        .tv-atmosphere__wash {
          position: absolute; inset: -20%;
          background:
            radial-gradient(ellipse 50% 40% at 70% 80%, rgba(36, 100, 163, 0.12), transparent 70%);
          animation: tv-drift 18s ease-in-out infinite alternate;
        }
        .tv-atmosphere__grid {
          position: absolute; inset: 0; opacity: 0.035;
          background-image:
            linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
        }
        .tv-atmosphere__vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.45) 100%);
        }
        @keyframes tv-drift {
          from { transform: translate3d(0,0,0) scale(1); }
          to { transform: translate3d(-2%, 1.5%, 0) scale(1.04); }
        }
        @keyframes tv-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tv-enter { animation: tv-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }

        .tv-header {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid var(--tv-line);
          background: linear-gradient(180deg, rgba(10, 16, 28, 0.92), rgba(10, 16, 28, 0.72));
          backdrop-filter: blur(16px);
        }
        .tv-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 2.35rem; height: 2.35rem; border-radius: 0.75rem;
          color: var(--tv-muted); border: 1px solid var(--tv-line);
          background: rgba(255,255,255,0.03); transition: color .2s, border-color .2s, background .2s;
        }
        .tv-icon-btn:hover { color: var(--tv-text); border-color: var(--tv-brand-bright); background: var(--tv-brand-soft); }

        .tv-loader {
          width: 2.5rem; height: 2.5rem; border-radius: 999px;
          border: 2px solid var(--tv-line); border-top-color: var(--tv-brand-bright);
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .tv-panel {
          background: var(--tv-surface);
          border: 1px solid var(--tv-line);
          border-radius: 1.1rem;
          backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .tv-panel-head {
          padding: 0.85rem 1rem;
          border-bottom: 1px solid var(--tv-line);
          background: linear-gradient(90deg, rgba(36,100,163,0.12), transparent 55%);
        }
        .tv-chip {
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.3rem 0.65rem; border-radius: 0.55rem;
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em;
          border: 1px solid var(--tv-line); background: rgba(255,255,255,0.03);
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .tv-kiosk-scroll { scroll-behavior: auto; }

        .tv-calendar-wrap .tv-calendar {
          width: 100%; background: transparent; border: none;
          font-family: inherit; color: var(--tv-text);
        }
        .tv-calendar-wrap .react-calendar__navigation { margin-bottom: 0.35rem; }
        .tv-calendar-wrap .react-calendar__navigation button {
          color: var(--tv-muted); min-width: 28px; font-size: 0.75rem;
          background: transparent; font-family: Syne, Outfit, sans-serif; font-weight: 700;
        }
        .tv-calendar-wrap .react-calendar__navigation button:enabled:hover,
        .tv-calendar-wrap .react-calendar__navigation button:enabled:focus {
          background: var(--tv-brand-soft); border-radius: 8px; color: var(--tv-text);
        }
        .tv-calendar-wrap .react-calendar__month-view__weekdays {
          font-size: 0.62rem; color: var(--tv-dim); text-transform: uppercase; letter-spacing: 0.08em;
        }
        .tv-calendar-wrap .react-calendar__month-view__weekdays abbr { text-decoration: none; }
        .tv-calendar-wrap .react-calendar__tile {
          font-size: 0.72rem; padding: 0.4em 0.2em; color: #c5d0e0;
          position: relative; border-radius: 8px; font-weight: 600;
        }
        .tv-calendar-wrap .react-calendar__tile:enabled:hover,
        .tv-calendar-wrap .react-calendar__tile:enabled:focus {
          background: var(--tv-brand-soft);
        }
        .tv-calendar-wrap .react-calendar__tile--now {
          background: var(--tv-amber-soft); box-shadow: inset 0 0 0 1px rgba(232,165,75,0.35);
        }
        .tv-calendar-wrap .react-calendar__tile--active {
          background: var(--tv-brand) !important; color: white;
          box-shadow: 0 0 0 1px rgba(91,163,224,0.4);
        }
        .tv-calendar-wrap .has-arrivals:not(.react-calendar__tile--active) {
          background: rgba(232,165,75,0.12);
        }
        .tv-calendar-wrap .has-activity:not(.react-calendar__tile--active):not(.has-arrivals) {
          background: rgba(36,100,163,0.18);
        }
        .tv-calendar-wrap .has-activity.has-arrivals:not(.react-calendar__tile--active) {
          background: linear-gradient(135deg, rgba(232,165,75,0.16) 50%, rgba(36,100,163,0.18) 50%);
        }
        .tv-cal-dot {
          position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
          font-size: 8px; font-weight: 800; color: var(--tv-amber); line-height: 1;
          font-family: "IBM Plex Mono", monospace;
        }
      `,
        }}
      />
    </div>
  );
};

export default TVDashboardScreen;
