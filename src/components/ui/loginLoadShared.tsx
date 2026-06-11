import React, { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent } from "framer-motion";

export interface LoginLoaderProps {
  active?: boolean;
  durationMs?: number;
  reducedMotion?: boolean;
  className?: string;
}

export type LoadPhase = "boot" | "range" | "ramp" | "stable";

export const phaseFor = (p: number): LoadPhase => {
  if (p < 0.12) return "boot";
  if (p < 0.28) return "range";
  if (p < 0.9) return "ramp";
  return "stable";
};

export const scrambleReading = (seed: number, decimals = 3) => {
  const a = (seed * 7 + 3) % 10;
  const b = (seed * 13 + 5) % 10;
  const c = (seed * 11 + 2) % 10;
  const d = (seed * 17 + 1) % 10;
  const e = decimals >= 3 ? `${b}${c}${d}` : decimals === 1 ? `${b}` : `${b}${c}`;
  return `${a}.${e}`;
};

/** Actualiza progreso como máximo 1 vez por frame (evita trabar SVG pesados). */
const useThrottledProgress = (progressMv: ReturnType<typeof useMotionValue<number>>) => {
  const [progress, setProgress] = useState(0);
  const pendingRef = useRef(0);
  const rafRef = useRef(0);

  useMotionValueEvent(progressMv, "change", (v) => {
    pendingRef.current = v;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setProgress(pendingRef.current);
    });
  });

  return [progress, setProgress] as const;
};

export const useLoginLoadAnimation = ({
  active,
  durationMs,
  reducedMotion,
  target,
  decimals = 3,
}: {
  active: boolean;
  durationMs: number;
  reducedMotion: boolean;
  target: number;
  decimals?: number;
}) => {
  const progressMv = useMotionValue(0);
  const [progress, setProgress] = useThrottledProgress(progressMv);
  const [scrambleSeed, setScrambleSeed] = useState(0);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      progressMv.set(0);
      setProgress(0);
      return;
    }
    if (reducedMotion) {
      progressMv.set(1);
      setProgress(1);
      return;
    }

    progressMv.set(0);
    setProgress(0);

    const controls = animate(progressMv, 1, {
      duration: durationMs / 1000,
      ease: [0.12, 0.8, 0.2, 1],
    });

    return () => {
      controls.stop();
    };
  }, [active, durationMs, reducedMotion, progressMv, setProgress]);

  const phase = phaseFor(progress);

  useEffect(() => {
    if (!active || (phase !== "boot" && phase !== "range")) return;
    const id = window.setInterval(() => {
      if (activeRef.current) setScrambleSeed((s) => s + 1);
    }, 90);
    return () => window.clearInterval(id);
  }, [active, phase]);

  const value = useMemo(() => {
    if (phase === "boot" || phase === "range") return 0;
    const rampT = (progress - 0.28) / 0.62;
    return Math.min(target, Math.max(0, rampT) * target);
  }, [progress, phase, target]);

  const reading = useMemo(() => {
    if (phase === "boot") return "----";
    if (phase === "range") return scrambleReading(scrambleSeed, decimals);
    return value.toFixed(decimals);
  }, [phase, scrambleSeed, value, decimals]);

  const pct = Math.round(progress * 100);
  const barW = 6 + progress * 74;
  const stable = phase === "stable";

  const statusLabel =
    phase === "boot" ? "WARM UP" :
    phase === "range" ? "PREVIEW" :
    phase === "ramp" ? "MIDIENDO" :
    "ESTABLE";

  return { progress, phase, pct, value, reading, barW, stable, statusLabel };
};

export const CablePulse: React.FC<{
  d: string;
  color: string;
  active: boolean;
  delay?: number;
  pulseColor?: string;
}> = ({ d, color, active, delay = 0, pulseColor = "#4ade80" }) => (
  <g>
    <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
    {active && (
      <motion.path
        d={d}
        fill="none"
        stroke={pulseColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="5 16"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -42 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear", delay }}
        opacity="0.85"
      />
    )}
  </g>
);

export const LoadProgressFooter: React.FC<{
  pct: number;
  phase: LoadPhase;
  loadingLabel: string;
  doneLabel: string;
  gradient?: string;
}> = ({
  pct,
  phase,
  loadingLabel,
  doneLabel,
  gradient = "from-blue-600 via-emerald-500 to-emerald-400",
}) => (
  <div className="mt-2 flex flex-col items-center gap-1.5">
    <div className="w-full max-w-[15rem] h-1.5 rounded-full bg-slate-800 overflow-hidden border border-slate-700/80">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-75 ease-linear`}
        style={{ width: `${Math.max(4, pct)}%` }}
      />
    </div>
    <span className="text-[10px] font-mono font-semibold text-emerald-400/95 tabular-nums bg-slate-800/90 px-2.5 py-1 rounded-full border border-emerald-500/35 animate-pulse">
      {phase === "boot" || phase === "range" ? loadingLabel : doneLabel}
    </span>
  </div>
);

export const SignalWave: React.FC<{ stable: boolean; y?: number; phase: LoadPhase }> = ({
  stable,
  y = 198,
  phase,
}) => (
  <path
    d={stable ? `M 148 ${y} L 269 ${y}` : `M 148 ${y} L 181 ${y - 3} L 214 ${y + 2} L 247 ${y - 1} L 269 ${y}`}
    fill="none"
    stroke="#4ade80"
    strokeWidth="1.25"
    strokeLinecap="round"
    opacity={stable ? 0.45 : phase === "boot" ? 0.2 : 0.55}
  />
);
