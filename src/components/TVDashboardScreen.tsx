import React, { useState, useEffect } from "react";
import { ArrowLeft, MonitorPlay, Clock } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import { useCalibrationDashboardData } from "../hooks/useCalibrationDashboardData";
import { CALIBRATION_COLORS } from "../utils/calibrationShared.tsx";
import {
  DashboardCalendar,
  CompanyArrivalsPanel,
  ServicesDashboardPanel,
  LabStatusBar,
  LabPendingTable,
  MetrologosMonthChart,
} from "./calibration/TVDashboardPanels";

const TVDashboardScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [now, setNow] = useState(new Date());

  const {
    loading,
    todayKey,
    companyArrivalsByArea,
    todayServices,
    programmedServices,
    labPending,
    activityDateKeys,
    totalArrivedToday,
    totalPendingToday,
    metrologosMonth,
    arrivalsForMonth,
    usuarios,
  } = useCalibrationDashboardData(selectedDate);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="h-full min-h-0 flex-1 flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className={`h-full min-h-0 flex-1 flex flex-col ${CALIBRATION_COLORS.background} text-white font-sans overflow-hidden`}>
      <header className="bg-slate-900/90 backdrop-blur-lg border-b border-white/5 px-4 lg:px-6 py-3 flex flex-wrap justify-between items-center gap-3 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo("mainmenu")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-white" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight flex items-center gap-2">
              <MonitorPlay className="text-blue-500 w-6 h-6" /> Dashboard TV
            </h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">
              Vista operativa · logística y laboratorio
            </p>
          </div>
        </div>

        <LabStatusBar
          pendientes={labPending.pendientesLaboratorio}
          total={labPending.totalPendientes}
        />

        <div className="text-right">
          <p className="text-2xl lg:text-3xl font-mono font-black tabular-nums">
            {now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-xs text-gray-400 capitalize flex items-center justify-end gap-1">
            <Clock className="w-3 h-3" />
            {now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden p-3 lg:p-4 grid grid-cols-12 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:gap-4">
        {/* Fila principal: calendario | llegadas | servicios */}
        <section className="col-span-12 lg:col-span-2 min-h-0 h-full row-span-1 hidden lg:flex lg:flex-col overflow-hidden">
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

        <section className="col-span-12 lg:col-span-5 min-h-0 h-full row-span-1 flex flex-1 flex-col overflow-hidden">
          <CompanyArrivalsPanel
            areas={companyArrivalsByArea}
            totalArrived={totalArrivedToday}
            totalPending={totalPendingToday}
            year={new Date().getFullYear()}
          />
        </section>

        <section className="col-span-12 lg:col-span-5 min-h-0 h-full row-span-1 flex flex-col gap-3 overflow-hidden">
          <div className="flex-1 min-h-0">
            <ServicesDashboardPanel
              todayServices={todayServices}
              programmedServices={programmedServices}
              usuarios={usuarios}
              todayKey={todayKey}
            />
          </div>
          {/* Calendario compacto en móvil / tablet */}
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

        {/* Fila inferior: prioridad lab + gráfico mes */}
        <section className="col-span-12 lg:col-span-7 min-h-[180px] max-h-[280px] row-span-1">
          <LabPendingTable
            byArea={labPending.byArea}
            total={labPending.totalPendientes}
            year={labPending.year}
          />
        </section>
        <section className="col-span-12 lg:col-span-5 min-h-[180px] max-h-[220px] row-span-1 h-full flex flex-col">
          <MetrologosMonthChart data={metrologosMonth} />
        </section>
      </main>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .tv-kiosk-scroll { scroll-behavior: auto; }
        .tv-calendar-wrap .tv-calendar {
          width: 100%;
          background: transparent;
          border: none;
          font-family: inherit;
          color: #e2e8f0;
        }
        .tv-calendar-wrap .react-calendar__navigation {
          margin-bottom: 0.25rem;
        }
        .tv-calendar-wrap .react-calendar__navigation button {
          color: #94a3b8;
          min-width: 28px;
          font-size: 0.75rem;
          background: transparent;
        }
        .tv-calendar-wrap .react-calendar__navigation button:enabled:hover,
        .tv-calendar-wrap .react-calendar__navigation button:enabled:focus {
          background: rgba(255,255,255,0.08);
          border-radius: 6px;
        }
        .tv-calendar-wrap .react-calendar__month-view__weekdays {
          font-size: 0.65rem;
          color: #64748b;
        }
        .tv-calendar-wrap .react-calendar__tile {
          font-size: 0.7rem;
          padding: 0.35em 0.2em;
          color: #cbd5e1;
          position: relative;
        }
        .tv-calendar-wrap .react-calendar__tile:enabled:hover,
        .tv-calendar-wrap .react-calendar__tile:enabled:focus {
          background: rgba(59,130,246,0.2);
          border-radius: 6px;
        }
        .tv-calendar-wrap .react-calendar__tile--now {
          background: rgba(249,115,22,0.25);
          border-radius: 6px;
        }
        .tv-calendar-wrap .react-calendar__tile--active {
          background: #2464A3 !important;
          color: white;
          border-radius: 6px;
        }
        .tv-calendar-wrap .has-arrivals:not(.react-calendar__tile--active) {
          background: rgba(249,115,22,0.12);
          border-radius: 6px;
        }
        .tv-calendar-wrap .has-activity:not(.react-calendar__tile--active):not(.has-arrivals) {
          background: rgba(168,85,247,0.15);
          border-radius: 6px;
        }
        .tv-calendar-wrap .has-activity.has-arrivals:not(.react-calendar__tile--active) {
          background: linear-gradient(135deg, rgba(249,115,22,0.14) 50%, rgba(168,85,247,0.14) 50%);
          border-radius: 6px;
        }
        .tv-cal-dot {
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 8px;
          font-weight: 800;
          color: #fb923c;
          line-height: 1;
        }
      `,
        }}
      />
    </div>
  );
};

export default TVDashboardScreen;
