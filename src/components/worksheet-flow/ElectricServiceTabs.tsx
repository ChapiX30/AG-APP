import React, { useCallback, useId, useState } from "react";
import { Award, Link2, Zap } from "lucide-react";

export type ServiceTab = "acreditado" | "trazable";

interface ElectricServiceTabsProps {
  value: ServiceTab;
  onChange: (tab: ServiceTab) => void;
}

const STYLES = `
@keyframes ag-voltage-blue {
  0% { box-shadow: 0 0 0 0 rgba(59,130,246,0); filter: brightness(1); }
  12% { box-shadow: 0 0 28px 8px rgba(96,165,250,0.95), 0 0 48px 12px rgba(59,130,246,0.45), inset 0 0 18px rgba(255,255,255,0.35); filter: brightness(1.55); }
  28% { box-shadow: 0 0 10px 2px rgba(59,130,246,0.4); filter: brightness(1.15); }
  42% { box-shadow: 0 0 32px 10px rgba(37,99,235,0.85), inset 0 0 12px rgba(191,219,254,0.5); filter: brightness(1.45); }
  100% { box-shadow: 0 4px 14px rgba(59,130,246,0.28); filter: brightness(1); }
}
@keyframes ag-voltage-orange {
  0% { box-shadow: 0 0 0 0 rgba(249,115,22,0); filter: brightness(1); }
  12% { box-shadow: 0 0 28px 8px rgba(251,146,60,0.95), 0 0 48px 12px rgba(234,88,12,0.45), inset 0 0 18px rgba(255,255,255,0.35); filter: brightness(1.55); }
  28% { box-shadow: 0 0 10px 2px rgba(249,115,22,0.4); filter: brightness(1.15); }
  42% { box-shadow: 0 0 32px 10px rgba(234,88,12,0.85), inset 0 0 12px rgba(254,215,170,0.5); filter: brightness(1.45); }
  100% { box-shadow: 0 4px 14px rgba(249,115,22,0.28); filter: brightness(1); }
}
@keyframes ag-bolt-flash {
  0%, 100% { opacity: 0; transform: scale(0.6) rotate(-8deg); }
  8% { opacity: 1; transform: scale(1.15) rotate(0deg); }
  18% { opacity: 0.15; transform: scale(0.95); }
  26% { opacity: 0.95; transform: scale(1.05); }
  38% { opacity: 0; transform: scale(1); }
}
@keyframes ag-arc-draw {
  from { stroke-dashoffset: 220; opacity: 0; }
  15% { opacity: 1; }
  to { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes ag-spark {
  0% { opacity: 0; transform: translateX(-30%) scaleX(0.2); }
  30% { opacity: 1; transform: translateX(0%) scaleX(1); }
  100% { opacity: 0; transform: translateX(40%) scaleX(0.5); }
}
.ag-bolt-flash {
  animation: ag-bolt-flash 0.55s ease-out forwards;
}
`;

function VoltageBolt({ className }: { className?: string }) {
  return (
    <Zap
      className={`absolute inset-0 m-auto w-6 h-6 pointer-events-none ag-bolt-flash ${className ?? ""}`}
      fill="currentColor"
      strokeWidth={0}
    />
  );
}

function ElectricArcOverlay({ gradId }: { gradId: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
      viewBox="0 0 240 48"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M8 24 L52 8 L78 38 L108 14 L138 34 L168 10 L198 30 L232 24"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 220,
          animation: "ag-arc-draw 0.55s ease-out forwards",
        }}
      />
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="45%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fdba74" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export const ElectricServiceTabs: React.FC<ElectricServiceTabsProps> = ({
  value,
  onChange,
}) => {
  const gradId = useId().replace(/:/g, "");
  const [surge, setSurge] = useState<ServiceTab | null>(null);
  const [showArc, setShowArc] = useState(false);

  const select = useCallback(
    (tab: ServiceTab) => {
      if (tab === value) return;
      setSurge(tab);
      setShowArc(true);
      onChange(tab);
      window.setTimeout(() => setSurge(null), 650);
      window.setTimeout(() => setShowArc(false), 580);
    },
    [value, onChange]
  );

  const acreditadoActive = value === "acreditado";
  const trazableActive = value === "trazable";

  return (
    <>
      <style>{STYLES}</style>
      <div className="relative p-1 bg-white rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 gap-1 sm:flex sm:w-fit overflow-hidden">
        {showArc && <ElectricArcOverlay gradId={gradId} />}

        <button
          type="button"
          onClick={() => select("acreditado")}
          className={`relative overflow-hidden px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-1.5 sm:gap-2 ${
            acreditadoActive
              ? "bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          } ${surge === "acreditado" ? "ag-voltage-blue" : ""}`}
          style={
            surge === "acreditado"
              ? { animation: "ag-voltage-blue 0.65s ease-out" }
              : undefined
          }
        >
          {surge === "acreditado" && (
            <>
              <VoltageBolt className="text-blue-100" />
              <span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
                style={{ animation: "ag-spark 0.5s ease-out forwards" }}
              />
            </>
          )}
          <Award className="w-4 h-4 shrink-0 relative z-10" strokeWidth={1.75} />
          <span className="relative z-10">Acreditado</span>
        </button>

        <button
          type="button"
          onClick={() => select("trazable")}
          className={`relative overflow-hidden px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-1.5 sm:gap-2 ${
            trazableActive
              ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-orange-500/20"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          } ${surge === "trazable" ? "ag-voltage-orange" : ""}`}
          style={
            surge === "trazable"
              ? { animation: "ag-voltage-orange 0.65s ease-out" }
              : undefined
          }
        >
          {surge === "trazable" && (
            <>
              <VoltageBolt className="text-amber-100" />
              <span
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent pointer-events-none"
                style={{ animation: "ag-spark 0.5s ease-out forwards" }}
              />
            </>
          )}
          <Link2 className="w-4 h-4 shrink-0 relative z-10" strokeWidth={1.75} />
          <span className="relative z-10">Trazable</span>
        </button>
      </div>
    </>
  );
};
