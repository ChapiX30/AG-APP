import React from "react";
import { motion } from "framer-motion";
import {
  LoadProgressFooter,
  LoginLoaderProps,
  SignalWave,
  useLoginLoadAnimation,
} from "./loginLoadShared";

const TARGET_NM = 150.0;

/** Torquímetro tipo click — cromo + mango rojo + cabeza ratchet (va montado en el analizador). */
const TorqueWrenchInAnalyzer: React.FC<{
  phase: string;
  stable: boolean;
  applyTorque: number;
}> = ({ phase, stable, applyTorque }) => {
  const pullAngle = applyTorque * 8;

  return (
    <motion.g
      animate={
        phase === "ramp" || phase === "stable"
          ? { rotate: stable ? pullAngle : [pullAngle - 1.5, pullAngle + 1, pullAngle - 0.5] }
          : { rotate: 0 }
      }
      transition={{ duration: stable ? 0.3 : 0.9, repeat: stable ? 0 : Infinity }}
      style={{ transformOrigin: "170px 102px" }}
    >
      {/* Cabeza ratchet — insertada en el receptáculo del analizador */}
      <ellipse cx="170" cy="88" rx="18" ry="14" fill="url(#tq-chrome)" stroke="#6b7280" strokeWidth="0.75" />
      <circle cx="170" cy="88" r="11" fill="#1f2937" stroke="#4b5563" strokeWidth="0.75" />
      <rect x="166" y="80" width="8" height="8" rx="1" fill="#d1d5db" stroke="#9ca3af" strokeWidth="0.5" />
      <rect x="168" y="74" width="4" height="5" rx="0.5" fill="#9ca3af" />

      {/* Eje / tubo cromado */}
      <rect x="165" y="96" width="10" height="72" rx="5" fill="url(#tq-chrome)" stroke="#9ca3af" strokeWidth="0.5" />
      <line x1="167" y1="102" x2="167" y2="155" stroke="#ffffff" strokeWidth="0.6" opacity="0.45" />
      <line x1="173" y1="104" x2="173" y2="158" stroke="#6b7280" strokeWidth="0.4" opacity="0.35" />

      <text x="178" y="118" fill="#6b7280" fontSize="3.5" fontFamily="monospace" opacity="0.7">N·m</text>
      <text x="178" y="125" fill="#9ca3af" fontSize="3" fontFamily="monospace" opacity="0.5">40–200</text>

      {/* Mango rojo (donde se aplica el par) */}
      <rect x="158" y="166" width="24" height="36" rx="8" fill="url(#tq-red)" stroke="#991b1b" strokeWidth="0.75" />
      <rect x="161" y="170" width="18" height="28" rx="6" fill="#dc2626" opacity="0.5" />
      <ellipse cx="170" cy="204" rx="10" ry="4" fill="#991b1b" />
      <rect x="163" y="162" width="14" height="6" rx="2" fill="#9ca3af" stroke="#6b7280" strokeWidth="0.4" />
    </motion.g>
  );
};

/** Mountz LTT-50F — el torquímetro se inserta en el drive 3/8" superior. */
const TorqueAnalyzerBench: React.FC<{
  reading: string;
  phase: string;
  statusLabel: string;
  barW: number;
  stable: boolean;
}> = ({ reading, phase, statusLabel, barW, stable }) => {
  const lcdOn = phase !== "boot";
  const outVal = phase === "boot" || phase === "range" ? "----" : reading;

  return (
    <g filter="url(#tor-shadow)">
      {/* Chasis Mountz LTT-50F — compacto banco */}
      <rect x="48" y="118" width="244" height="88" rx="6" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
      <rect x="52" y="122" width="236" height="80" rx="5" fill="#e5e7eb" stroke="#cbd5e1" strokeWidth="0.75" />

      <rect x="58" y="126" width="128" height="13" rx="2" fill="#0054a6" />
      <text x="72" y="135" fill="#ffffff" fontSize="7" fontWeight="900" fontFamily="system-ui,sans-serif">
        MOUNTZ
      </text>
      <text x="122" y="135" textAnchor="middle" fill="#bfdbfe" fontSize="6" fontWeight="700" fontFamily="system-ui,sans-serif">
        TorqueLab
      </text>
      <rect x="158" y="127" width="52" height="11" rx="2" fill="#0f172a" />
      <text x="184" y="135" textAnchor="middle" fill="#e2e8f0" fontSize="6" fontWeight="800" fontFamily="system-ui,sans-serif">
        LTT-50F
      </text>

      {/* LCD 6 dígitos */}
      <rect x="58" y="144" width="156" height="42" rx="3" fill={lcdOn ? "#1e293b" : "#334155"} stroke="#0054a6" strokeWidth="1" />
      <rect x="64" y="150" width="144" height="30" rx="2" fill="#0f172a" />

      <text x="70" y="160" fill="#64748b" fontSize="4.5" fontFamily="system-ui,sans-serif">PEAK · N·m</text>
      <motion.text
        x="200"
        y="172"
        textAnchor="end"
        fill={lcdOn ? "#38bdf8" : "#334155"}
        fontSize="21"
        fontWeight="700"
        fontFamily="'Courier New', monospace"
        letterSpacing="0.5"
        animate={{ opacity: phase === "range" ? [0.6, 1, 0.6] : 1 }}
        transition={{ duration: 0.12, repeat: phase === "range" ? Infinity : 0 }}
      >
        {outVal}
      </motion.text>

      <rect x="70" y="176" width="88" height="2" rx="1" fill="#1e3a5f" />
      <rect x="70" y="176" width={barW} height="2" rx="1" fill="#38bdf8" />

      {/* Go / No-Go LEDs + teclas */}
      <rect x="222" y="144" width="62" height="42" rx="3" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
      <circle cx="236" cy="156" r="4" fill={stable ? "#22c55e" : "#374151"} stroke="#16a34a" strokeWidth="0.5" />
      <text x="244" y="158" fill="#475569" fontSize="4" fontWeight="600" fontFamily="system-ui,sans-serif">GO</text>
      <circle cx="236" cy="170" r="4" fill={phase === "range" ? "#ef4444" : "#374151"} stroke="#b91c1c" strokeWidth="0.5" />
      <text x="244" y="172" fill="#475569" fontSize="4" fontWeight="600" fontFamily="system-ui,sans-serif">NO-GO</text>
      <text x="249" y="182" textAnchor="middle" fill="#64748b" fontSize="3.8" fontFamily="system-ui,sans-serif">{statusLabel}</text>

      {[0, 1, 2].map((i) => (
        <rect key={i} x={258 + i * 7} y={154} width={5} height={5} rx={1} fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.4" />
      ))}

      {/* Drive 3/8" hembra — inserta cabeza del torquímetro */}
      <rect x="148" y="106" width="44" height="16" rx="3" fill="#9ca3af" stroke="#6b7280" strokeWidth="1" />
      <rect x="158" y="98" width="24" height="10" rx="2" fill="#6b7280" stroke="#d1d5db" strokeWidth="0.75" />
      <rect x="166" y="92" width="8" height="8" rx="1" fill="#374151" stroke="#9ca3af" strokeWidth="0.75" />
      <text x="170" y="114" textAnchor="middle" fill="#475569" fontSize="4" fontWeight="600" fontFamily="system-ui,sans-serif">
        3/8&quot; F
      </text>

      <text x="170" y="210" textAnchor="middle" fill="#475569" fontSize="5.5" fontWeight="600" fontFamily="system-ui,sans-serif">
        PATRÓN · Mountz LTT-50F
      </text>
      <text x="170" y="218" textAnchor="middle" fill="#64748b" fontSize="5" fontFamily="system-ui,sans-serif">
        UUC · Torquímetro montado
      </text>
    </g>
  );
};

export const TorqueCalibrationLoader: React.FC<LoginLoaderProps> = ({
  active = true,
  durationMs = 2600,
  reducedMotion = false,
  className = "",
}) => {
  const { phase, pct, reading, barW, stable, statusLabel, progress } = useLoginLoadAnimation({
    active,
    durationMs,
    reducedMotion,
    target: TARGET_NM,
    decimals: 1,
  });

  const applyTorque = progress < 0.28 ? 0 : ((progress - 0.28) / 0.62) * 6;

  return (
    <div
      className={`relative w-full max-w-[20rem] sm:max-w-[22rem] ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Calibración de torque, ${pct} por ciento`}
    >
      <svg viewBox="0 0 340 228" className="w-full h-auto" aria-hidden>
        <defs>
          <linearGradient id="tq-chrome" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9ca3af" />
            <stop offset="35%" stopColor="#f8fafc" />
            <stop offset="65%" stopColor="#d1d5db" />
            <stop offset="100%" stopColor="#6b7280" />
          </linearGradient>
          <linearGradient id="tq-red" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
          <filter id="tor-shadow" x="-6%" y="-6%" width="112%" height="118%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.35" />
          </filter>
          <marker id="tq-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#fb923c" />
          </marker>
        </defs>

        <TorqueAnalyzerBench
          reading={reading}
          phase={phase}
          statusLabel={statusLabel}
          barW={barW}
          stable={stable}
        />
        <TorqueWrenchInAnalyzer phase={phase} stable={stable} applyTorque={applyTorque} />

        {/* Indicador de esfuerzo al aplicar torque */}
        {phase === "ramp" || stable ? (
          <motion.path
            d="M 196 182 Q 218 168 238 152"
            fill="none"
            stroke="#fb923c"
            strokeWidth="1.5"
            strokeLinecap="round"
            markerEnd="url(#tq-arrow)"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        ) : null}

        <SignalWave stable={stable} phase={phase} y={200} />
      </svg>

      <LoadProgressFooter
        pct={pct}
        phase={phase}
        loadingLabel={`Calibrando… ${pct}%`}
        doneLabel={`LTT-50F · ${reading} N·m · ${pct}%`}
        gradient="from-blue-700 via-sky-500 to-cyan-400"
      />
    </div>
  );
};
