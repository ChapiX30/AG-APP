import React from "react";
import { motion } from "framer-motion";
import {
  LoadProgressFooter,
  LoginLoaderProps,
  SignalWave,
  useLoginLoadAnimation,
} from "./loginLoadShared";

/** 1 IN Mitutoyo ≈ 25.400 mm */
const TARGET_MM = 25.4;

const BLOCK_X = 52;
const BLOCK_Y = 44;
const BLOCK_W = 24;

/** Bloque patrón Mitutoyo 1 IN entre mordazas externas. */
const GaugeBlockBetweenJaws: React.FC<{ visible: boolean }> = ({ visible }) => (
  <g opacity={visible ? 1 : 0.2}>
    <rect
      x={BLOCK_X}
      y={BLOCK_Y}
      width={BLOCK_W}
      height="18"
      rx="0.5"
      fill="url(#block-steel)"
      stroke="#64748b"
      strokeWidth="0.75"
    />
    {Array.from({ length: 5 }, (_, i) => (
      <line
        key={i}
        x1={BLOCK_X + 2}
        y1={BLOCK_Y + 3 + i * 2.5}
        x2={BLOCK_X + BLOCK_W - 2}
        y2={BLOCK_Y + 3 + i * 2.5}
        stroke="#94a3b8"
        strokeWidth="0.3"
        opacity="0.55"
      />
    ))}
    <text x={BLOCK_X + BLOCK_W - 2} y={BLOCK_Y + 8} textAnchor="end" fill="#1e293b" fontSize="5" fontWeight="800" fontFamily="system-ui,sans-serif">
      1 IN
    </text>
    <text x={BLOCK_X + 3} y={BLOCK_Y + 14} fill="#334155" fontSize="3.8" fontWeight="700" fontFamily="system-ui,sans-serif">
      MITUTOYO
    </text>
    <text x={BLOCK_X + 3} y={BLOCK_Y + 18} fill="#64748b" fontSize="3.2" fontFamily="monospace">
      060271
    </text>
  </g>
);

/** Vernier Mitutoyo ABSOLUTE DIGIMATIC completo. */
const FullMitutoyoCaliper: React.FC<{
  reading: string;
  phase: string;
  barW: number;
  sliderX: number;
  blockVisible: boolean;
}> = ({ reading, phase, barW, sliderX, blockVisible }) => (
  <g filter="url(#dim-shadow)">
    {/* ── Regla completa (beam) ── */}
    <rect x="12" y="78" width="336" height="16" rx="2" fill="#1c1917" stroke="#292524" strokeWidth="0.75" />
    <rect x="16" y="81" width="328" height="5" fill="#eab308" opacity="0.9" />
    {Array.from({ length: 37 }, (_, i) => (
      <line
        key={i}
        x1={18 + i * 9}
        y1={78}
        x2={18 + i * 9}
        y2={i % 10 === 0 ? 72 : i % 5 === 0 ? 74 : 76}
        stroke="#fbbf24"
        strokeWidth={i % 10 === 0 ? 0.9 : i % 5 === 0 ? 0.6 : 0.35}
      />
    ))}
    {[0, 50, 100, 150, 200, 250, 300].map((n) => (
      <text
        key={n}
        x={18 + (n / 300) * 324}
        y="96"
        textAnchor="middle"
        fill="#a8a29e"
        fontSize="4"
        fontFamily="system-ui,sans-serif"
      >
        {n}
      </text>
    ))}
    <text x="338" y="94" textAnchor="end" fill="#78716c" fontSize="4" fontWeight="600" fontFamily="system-ui,sans-serif">
      ABSOLUTE
    </text>
    <text x="338" y="100" textAnchor="end" fill="#78716c" fontSize="3.5" fontFamily="system-ui,sans-serif">
      DIGIMATIC
    </text>

    {/* ── Parte fija (izquierda) ── */}
    <g>
      {/* Mordazas internas fijas */}
      <path
        d="M 20 78 L 20 28 L 30 28 L 30 38 L 26 38 L 26 78 Z"
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth="0.6"
      />
      <path
        d="M 20 28 L 20 18 L 28 24 L 20 28 Z"
        fill="#d1d5db"
        stroke="#9ca3af"
        strokeWidth="0.4"
      />

      {/* Mordazas externas fijas */}
      <path
        d="M 32 78 L 32 42 L 50 42 L 50 62 L 44 62 L 44 78 Z"
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth="0.65"
      />
      <path
        d="M 32 42 L 32 32 L 46 32 L 46 42 Z"
        fill="#f1f5f9"
        stroke="#9ca3af"
        strokeWidth="0.5"
      />
    </g>

    {/* Bloque patrón entre mordazas externas */}
    <GaugeBlockBetweenJaws visible={blockVisible} />

    {/* ── Parte móvil (cursor + LCD) ── */}
    <motion.g animate={{ x: sliderX }}>
      {/* Mordazas internas móviles */}
      <path
        d="M 78 78 L 78 28 L 88 28 L 88 38 L 84 38 L 84 78 Z"
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth="0.6"
      />
      <path
        d="M 88 28 L 96 24 L 88 18 L 88 28 Z"
        fill="#d1d5db"
        stroke="#9ca3af"
        strokeWidth="0.4"
      />

      {/* Mordazas externas móviles */}
      <path
        d="M 78 78 L 78 42 L 96 42 L 96 62 L 90 62 L 90 78 Z"
        fill="#e5e7eb"
        stroke="#9ca3af"
        strokeWidth="0.65"
      />
      <path
        d="M 78 42 L 78 32 L 92 32 L 92 42 Z"
        fill="#f1f5f9"
        stroke="#9ca3af"
        strokeWidth="0.5"
      />

      {/* Cuerpo del cursor / housing */}
      <rect x="68" y="94" width="72" height="36" rx="3" fill="#292524" stroke="#44403c" strokeWidth="0.75" />

      {/* Tornillo de bloqueo */}
      <circle cx="104" cy="92" r="4" fill="#57534e" stroke="#78716c" strokeWidth="0.6" />
      <line x1="102" y1="92" x2="106" y2="92" stroke="#d6d3d1" strokeWidth="0.8" />

      {/* Pantalla LCD */}
      <rect x="72" y="12" width="64" height="52" rx="3" fill="#292524" stroke="#44403c" strokeWidth="0.75" />
      <rect x="76" y="16" width="56" height="32" rx="2" fill="#0c0a09" stroke="#57534e" strokeWidth="0.5" />
      <motion.text
        x="128"
        y="38"
        textAnchor="end"
        fill={phase === "boot" ? "#14532d" : "#4ade80"}
        fontSize="17"
        fontWeight="600"
        fontFamily="'Courier New', monospace"
        animate={{ opacity: phase === "range" ? [0.65, 1, 0.65] : 1 }}
        transition={{ duration: 0.12, repeat: phase === "range" ? Infinity : 0 }}
      >
        {reading}
      </motion.text>
      <text x="130" y="38" fill="#166534" fontSize="5" fontFamily="system-ui,sans-serif">mm</text>
      <rect x="78" y="42" width="48" height="2" rx="1" fill="#14532d" />
      <rect x="78" y="42" width={barW * 0.55} height="2" rx="1" fill="#4ade80" />

      <text x="104" y="58" textAnchor="middle" fill="#e5e7eb" fontSize="5.5" fontWeight="900" fontFamily="system-ui,sans-serif">
        MITUTOYO
      </text>

      {/* Botones ZERO / ORIGIN */}
      <rect x="76" y="62" width="16" height="7" rx="1" fill="#eab308" stroke="#ca8a04" strokeWidth="0.4" />
      <text x="84" y="67.5" textAnchor="middle" fill="#1c1917" fontSize="3" fontWeight="700" fontFamily="system-ui,sans-serif">
        ZERO
      </text>
      <rect x="96" y="62" width="20" height="7" rx="1" fill="#22c55e" stroke="#16a34a" strokeWidth="0.4" />
      <text x="106" y="67.5" textAnchor="middle" fill="#052e16" fontSize="2.8" fontWeight="700" fontFamily="system-ui,sans-serif">
        ORIGIN
      </text>

      {/* Ruleta de ajuste fino */}
      <circle cx="88" cy="112" r="8" fill="#57534e" stroke="#78716c" strokeWidth="0.75" />
      <circle cx="88" cy="112" r="5.5" fill="#44403c" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={88 + Math.cos(a) * 3}
            y1={112 + Math.sin(a) * 3}
            x2={88 + Math.cos(a) * 6}
            y2={112 + Math.sin(a) * 6}
            stroke="#a8a29e"
            strokeWidth="0.5"
          />
        );
      })}
    </motion.g>

    {/* Varilla de profundidad (extremo derecho) */}
    <rect x="344" y="78" width="3" height="58" rx="1" fill="#cbd5e1" stroke="#9ca3af" strokeWidth="0.4" />
    <rect x="343" y="134" width="5" height="4" rx="1" fill="#94a3b8" />

    <text x="180" y="148" textAnchor="middle" fill="#64748b" fontSize="5" fontWeight="600" fontFamily="system-ui,sans-serif">
      PATRÓN · Bloque 1 IN entre mordazas
    </text>
    <text x="180" y="156" textAnchor="middle" fill="#78716c" fontSize="5" fontFamily="system-ui,sans-serif">
      UUC · Vernier Mitutoyo ABSOLUTE DIGIMATIC
    </text>
  </g>
);

export const DimensionalCalibrationLoader: React.FC<LoginLoaderProps> = ({
  active = true,
  durationMs = 2600,
  reducedMotion = false,
  className = "",
}) => {
  const { phase, pct, reading, barW, stable, statusLabel } = useLoginLoadAnimation({
    active,
    durationMs,
    reducedMotion,
    target: TARGET_MM,
    decimals: 3,
  });

  /** Cursor abierto → cerrado con bloque 1 IN entre mordazas (x=52–76 mm) */
  const sliderOpen = 50;
  const sliderClosed = -2;
  const sliderX =
    phase === "boot" ? sliderOpen :
    phase === "range" ? 28 :
    sliderOpen - (Math.max(0, (pct - 28) / 72)) * (sliderOpen - sliderClosed);

  const blockVisible = phase !== "boot";

  return (
    <div
      className={`relative w-full max-w-[22rem] sm:max-w-[24rem] ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Calibración dimensional, ${pct} por ciento`}
    >
      <svg viewBox="0 0 360 248" className="w-full h-auto" aria-hidden>
        <defs>
          <linearGradient id="block-steel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="40%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <filter id="dim-shadow" x="-3%" y="-3%" width="106%" height="110%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>

        <FullMitutoyoCaliper
          reading={reading}
          phase={phase}
          barW={barW}
          sliderX={sliderX}
          blockVisible={blockVisible}
        />

        <motion.text
          x="180"
          y="172"
          textAnchor="middle"
          fill="#64748b"
          fontSize="4.5"
          fontFamily="system-ui,sans-serif"
          animate={{ opacity: phase !== "boot" ? 1 : 0.35 }}
        >
          {statusLabel}
        </motion.text>

        <SignalWave stable={stable} phase={phase} y={208} />
      </svg>

      <LoadProgressFooter
        pct={pct}
        phase={phase}
        loadingLabel={`Calibrando… ${pct}%`}
        doneLabel={`Bloque 1 IN · ${reading} mm · ${pct}%`}
        gradient="from-sky-600 via-cyan-500 to-emerald-400"
      />
    </div>
  );
};
