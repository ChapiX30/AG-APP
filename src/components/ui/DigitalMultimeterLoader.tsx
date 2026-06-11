import React from "react";
import { motion } from "framer-motion";
import {
  CablePulse,
  LoadProgressFooter,
  LoginLoaderProps,
  LoadPhase,
  SignalWave,
  useLoginLoadAnimation,
} from "./loginLoadShared";

const TARGET_V = 12.034;

/** Patrón de referencia — Transmille 1000A */
const Transmille1000A: React.FC<{
  reading: string;
  phase: LoadPhase;
  statusLabel: string;
}> = ({ reading, phase, statusLabel }) => {
  const outVal = phase === "boot" || phase === "range" ? "0.000" : reading;
  const lcdOn = phase !== "boot";

  return (
    <g transform="translate(2, 88)">
      {/* Maleta rugged */}
      <rect x="0" y="8" width="102" height="88" rx="5" fill="#3f4654" stroke="#5c6575" strokeWidth="1" />
      <rect x="4" y="12" width="94" height="80" rx="4" fill="#525a68" stroke="#6b7280" strokeWidth="0.75" />

      {/* Asa */}
      <path
        d="M 28 12 Q 51 0 74 12"
        fill="none"
        stroke="#6b7280"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Franja marca */}
      <rect x="8" y="18" width="86" height="11" rx="2" fill="#1e3a5f" />
      <text x="51" y="26" textAnchor="middle" fill="#93c5fd" fontSize="6.5" fontWeight="800" letterSpacing="0.14em" fontFamily="system-ui,sans-serif">
        TRANSMILLE
      </text>
      <rect x="72" y="19" width="20" height="9" rx="1.5" fill="#0f172a" />
      <text x="82" y="25.5" textAnchor="middle" fill="#e2e8f0" fontSize="5.5" fontWeight="700" fontFamily="system-ui,sans-serif">
        1000A
      </text>

      {/* LCD gráfico */}
      <rect x="10" y="33" width="82" height="30" rx="2" fill={lcdOn ? "#c8d8e8" : "#8b9cb0"} stroke="#64748b" strokeWidth="0.75" />
      <rect x="13" y="36" width="76" height="24" rx="1" fill={lcdOn ? "#dce8f2" : "#a8b8c8"} />
      <text x="16" y="44" fill="#1e40af" fontSize="4.5" fontWeight="600" fontFamily="system-ui,sans-serif">
        DC V OUT
      </text>
      <text
        x="86"
        y="56"
        textAnchor="end"
        fill="#0f172a"
        fontSize="13"
        fontWeight="700"
        fontFamily="'Courier New', monospace"
      >
        {outVal}
      </text>
      <text x="88" y="56" fill="#334155" fontSize="6" fontFamily="system-ui,sans-serif">V</text>

      {/* Teclado */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect
          key={i}
          x={14 + (i % 3) * 11}
          y={66 + Math.floor(i / 3) * 7}
          width={9}
          height={5}
          rx={1}
          fill="#374151"
          stroke="#4b5563"
          strokeWidth="0.4"
        />
      ))}

      {/* LED + estado */}
      <motion.circle
        cx="14"
        cy="78"
        r="2.5"
        fill={lcdOn ? "#2563eb" : "#374151"}
        animate={lcdOn ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.4 }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
      <text x="20" y="80" fill="#cbd5e1" fontSize="4.5" fontFamily="system-ui,sans-serif">
        {statusLabel}
      </text>

      {/* Bornes salida */}
      <text x="62" y="80" fill="#94a3b8" fontSize="4" fontFamily="system-ui,sans-serif">OUT</text>
      <circle cx="78" cy="86" r="3" fill="#dc2626" stroke="#991b1b" strokeWidth="0.5" />
      <circle cx="90" cy="86" r="3" fill="#1e293b" stroke="#475569" strokeWidth="0.5" />

      <text x="51" y="102" textAnchor="middle" fill="#64748b" fontSize="5" fontWeight="600" fontFamily="system-ui,sans-serif">
        PATRÓN · 1000A
      </text>
    </g>
  );
};

/** UUC — Fluke 87V */
const Fluke87V: React.FC<{
  reading: string;
  phase: LoadPhase;
  barW: number;
  dialAngle: number;
  stable: boolean;
}> = ({ reading, phase, barW, dialAngle, stable }) => (
  <g transform="translate(112, 14)" filter="url(#dmm-shadow)">
    {/* Funda amarilla Fluke */}
    <rect x="0" y="0" width="218" height="158" rx="16" fill="#eab308" />
    <rect x="5" y="5" width="208" height="148" rx="13" fill="#ca8a04" />
    <rect x="12" y="12" width="194" height="134" rx="10" fill="#1c1917" stroke="#292524" strokeWidth="0.75" />

    {/* Logo */}
    <rect x="18" y="18" width="72" height="14" rx="2" fill="#eab308" />
    <text x="54" y="28" textAnchor="middle" fill="#1c1917" fontSize="9" fontWeight="900" letterSpacing="0.06em" fontFamily="system-ui,sans-serif">
      FLUKE
    </text>
    <text x="168" y="28" textAnchor="end" fill="#a8a29e" fontSize="11" fontWeight="700" fontFamily="system-ui,sans-serif">
      87 V
    </text>

    {/* LCD */}
    <rect x="20" y="36" width="178" height="50" rx="3" fill="#0c0a09" stroke="#eab308" strokeWidth="1.25" />
    <rect x="26" y="42" width="166" height="38" rx="2" fill="url(#fluke-lcd)" />

    <motion.rect
      x="26"
      y="42"
      width="166"
      height="2"
      fill="#4ade80"
      opacity="0.12"
      animate={{ y: [42, 76, 42] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
    />

    <motion.text
      x="32"
      y="54"
      fill="#166534"
      fontSize="6"
      fontWeight="700"
      fontFamily="system-ui,sans-serif"
      animate={{ opacity: phase === "range" ? [0.3, 1, 0.3] : 1 }}
      transition={{ duration: 0.55, repeat: phase === "range" ? Infinity : 0 }}
    >
      V⎓
    </motion.text>
    <text x="32" y="64" fill="#365314" fontSize="5" fontFamily="system-ui,sans-serif">AUTO</text>
    <motion.text
      x="184"
      y="54"
      textAnchor="end"
      fill="#4ade80"
      fontSize="5.5"
      fontFamily="system-ui,sans-serif"
      animate={{ opacity: stable ? 1 : 0 }}
    >
      HOLD
    </motion.text>

    <motion.text
      x="186"
      y="74"
      textAnchor="end"
      fill={phase === "boot" ? "#14532d" : "#4ade80"}
      fontSize="24"
      fontWeight="600"
      fontFamily="'Courier New', monospace"
      letterSpacing="-0.5"
      filter="url(#lcd-glow)"
      animate={{ opacity: phase === "range" ? [0.65, 1, 0.65] : 1 }}
      transition={{ duration: 0.12, repeat: phase === "range" ? Infinity : 0 }}
    >
      {reading}
    </motion.text>

    <rect x="32" y="78" width="84" height="3" rx="1" fill="#14532d" />
    <rect x="32" y="78" width={barW} height="3" rx="1" fill="#4ade80" opacity={stable ? 1 : 0.75} />

    {/* Selector */}
    <g transform={`rotate(${dialAngle}, 62, 118)`}>
      <circle cx="62" cy="118" r="16" fill="#57534e" stroke="#a8a29e" strokeWidth="1" />
      <circle cx="62" cy="118" r="11" fill="#44403c" />
      <line x1="62" y1="118" x2="71" y2="109" stroke="#e7e5e4" strokeWidth="2.5" strokeLinecap="round" />
    </g>
    <text x="62" y="140" textAnchor="middle" fill="#78716c" fontSize="5" fontFamily="system-ui,sans-serif">VΩHz</text>

    {/* Botones */}
    {[0, 1, 2].map((i) => (
      <motion.rect
        key={i}
        x={96 + i * 24}
        y={106}
        width={18}
        height={11}
        rx={2}
        fill="#292524"
        stroke="#44403c"
        strokeWidth="0.5"
        animate={
          phase === "boot" && i === 0
            ? { fill: ["#292524", "#4ade80", "#292524"] }
            : {}
        }
        transition={{ duration: 0.5, repeat: Infinity }}
      />
    ))}

    {/* Bornes */}
    <g transform="translate(148, 132)">
      <text x="0" y="-4" fill="#78716c" fontSize="4.5" fontFamily="system-ui,sans-serif">VΩHz</text>
      <circle cx="10" cy="6" r="4.5" fill="#dc2626" stroke="#991b1b" strokeWidth="0.75" />
      <text x="22" y="-4" fill="#78716c" fontSize="4.5" fontFamily="system-ui,sans-serif">COM</text>
      <circle cx="34" cy="6" r="4.5" fill="#1c1917" stroke="#57534e" strokeWidth="0.75" />
    </g>

    <text x="109" y="154" textAnchor="middle" fill="#a16207" fontSize="5.5" fontWeight="600" fontFamily="system-ui,sans-serif">
      UUC · Multímetro
    </text>
  </g>
);

/**
 * Calibración en banco: Transmille 1000A (patrón) → Fluke 87V (UUC).
 */
export const DigitalMultimeterLoader: React.FC<LoginLoaderProps> = ({
  active = true,
  durationMs = 2600,
  reducedMotion = false,
  className = "",
}) => {
  const { phase, pct, reading, barW, stable, statusLabel, progress } = useLoginLoadAnimation({
    active,
    durationMs,
    reducedMotion,
    target: TARGET_V,
    decimals: 3,
  });

  const dialAngle = -40 + progress * 50;

  return (
    <div
      className={`relative w-full max-w-[20rem] sm:max-w-[22rem] ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Cargando patrones, ${pct} por ciento`}
    >
      <svg viewBox="0 0 340 228" className="w-full h-auto" aria-hidden>
        <defs>
          <linearGradient id="fluke-lcd" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0c1510" />
            <stop offset="100%" stopColor="#050a08" />
          </linearGradient>
          <filter id="dmm-shadow" x="-6%" y="-6%" width="112%" height="118%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.4" />
          </filter>
          <filter id="lcd-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <Transmille1000A reading={reading} phase={phase} statusLabel={statusLabel} />
        <Fluke87V
          reading={reading}
          phase={phase}
          barW={barW}
          dialAngle={dialAngle}
          stable={stable}
        />

        {/* Cables patrón → UUC */}
        <CablePulse d="M 92 180 C 118 178, 128 168, 148 158" color="#dc2626" active={phase !== "boot"} />
        <CablePulse d="M 82 180 C 108 184, 120 172, 148 162" color="#1f2937" active={phase !== "boot"} delay={0.18} />
        <CablePulse d="M 260 152 C 220 162, 170 172, 148 158" color="#dc2626" active={phase === "ramp" || stable} />
        <CablePulse d="M 282 152 C 240 164, 185 174, 148 162" color="#1f2937" active={phase === "ramp" || stable} delay={0.12} />

        {/* Flecha flujo */}
        <motion.path
          d="M 108 130 L 118 130 L 114 126 M 118 130 L 114 134"
          stroke="#64748b"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          animate={{ opacity: phase === "boot" ? 0.2 : [0.35, 0.8, 0.35] }}
          transition={{ duration: 1, repeat: Infinity }}
        />

        <SignalWave stable={stable} phase={phase} />
      </svg>

      <LoadProgressFooter
        pct={pct}
        phase={phase}
        loadingLabel={`Calibrando… ${pct}%`}
        doneLabel={`1000A → 87V · ${reading} V · ${pct}%`}
      />
    </div>
  );
};
