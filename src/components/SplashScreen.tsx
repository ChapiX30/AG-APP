import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import labLogo from "../assets/lab_logo.png";

const BRAND_NAME = "Equipos y Servicios AG";
const SUBTITLE = "Sistema de gestión metrológica";
const BRAND_BLUE = "#2464A3";
const ACCENT = "#5a93c9";

/** Tiempo mínimo para ver logo 3D + barra + flash (no salir en 450ms). */
const MIN_VISIBLE_MS = 3200;
const EXIT_DURATION_S = 0.55;
const FLASH_MS = 420;

const LOAD_STEPS = [
  { at: 0.08, label: "Inicializando entorno…" },
  { at: 0.28, label: "Cargando módulos…" },
  { at: 0.52, label: "Preparando sesión…" },
  { at: 0.78, label: "Verificando servicios…" },
  { at: 0.96, label: "Listo" },
] as const;

export interface SplashScreenProps {
  /** Cuando true, el splash puede cerrarse tras completar la secuencia. */
  ready?: boolean;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  ready = true,
  onComplete,
}) => {
  const [shouldExit, setShouldExit] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(false);
  const [status, setStatus] = useState(LOAD_STEPS[0].label);
  const readyRef = useRef(ready);
  const finishedRef = useRef(false);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  /* secuencia única: progreso → flash → salir (sin cancelar por re-renders) */
  useEffect(() => {
    let raf = 0;
    let exitTimer = 0;
    const start = performance.now();

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setProgress(1);
      setStatus("Listo");
      setFlash(true);
      exitTimer = window.setTimeout(() => {
        setShouldExit(true);
      }, FLASH_MS + 120);
    };

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MIN_VISIBLE_MS);
      const eased = 1 - (1 - t) ** 3;
      setProgress(eased);

      const step = [...LOAD_STEPS].reverse().find((s) => eased >= s.at);
      if (step) setStatus(step.label);

      if (t >= 1) {
        if (readyRef.current) {
          finish();
        } else {
          /* auth/boot aún no listo: espera en 100% y reintenta */
          raf = requestAnimationFrame(tick);
        }
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(exitTimer);
    };
  }, []);

  const pct = Math.round(progress * 100);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {!shouldExit && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: EXIT_DURATION_S, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden text-slate-50"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 40%, #0c1828 0%, #05080e 55%, #03050a 100%)",
          }}
        >
          {/* atmósfera */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(circle at 50% 35%, rgba(36,100,163,0.28), transparent 55%)",
            }}
          />

          {/* flash de pantalla al completar */}
          <AnimatePresence>
            {flash && (
              <motion.div
                className="pointer-events-none absolute inset-0 z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.55, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: FLASH_MS / 1000, ease: "easeOut" }}
                style={{
                  background:
                    "radial-gradient(circle at 50% 45%, rgba(90,147,201,0.55), rgba(255,255,255,0.12) 40%, transparent 70%)",
                }}
              />
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex w-[90%] max-w-md flex-col items-center gap-8 px-4"
          >
            {/* logo 3D suave */}
            <div style={{ perspective: 900 }} className="flex items-center justify-center">
              <motion.img
                src={labLogo}
                alt={BRAND_NAME}
                className="h-auto w-[132px] select-none will-change-transform sm:w-[148px]"
                draggable={false}
                style={{ transformStyle: "preserve-3d" }}
                animate={{
                  rotateY: [-14, 14, -14],
                  rotateX: [3, -2, 3],
                  y: [0, -5, 0],
                  filter: [
                    "drop-shadow(-12px 16px 22px rgba(0,0,0,0.45)) drop-shadow(0 0 16px rgba(36,100,163,0.25))",
                    "drop-shadow(12px 16px 22px rgba(0,0,0,0.45)) drop-shadow(0 0 22px rgba(36,100,163,0.35))",
                    "drop-shadow(-12px 16px 22px rgba(0,0,0,0.45)) drop-shadow(0 0 16px rgba(36,100,163,0.25))",
                  ],
                }}
                transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            <div className="space-y-2 text-center">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(105deg, ${ACCENT}, ${BRAND_BLUE})`,
                  }}
                >
                  {BRAND_NAME}
                </span>
              </h1>
              <p className="text-sm font-medium tracking-wide text-slate-400">
                {SUBTITLE}
              </p>
            </div>

            {/* barra de carga + flash en la línea */}
            <div className="mt-1 w-full space-y-3">
              <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${progress * 100}%`,
                    background: `linear-gradient(90deg, ${BRAND_BLUE}, ${ACCENT}, #7eb6e8)`,
                    boxShadow: flash
                      ? `0 0 24px rgba(90,147,201,0.95), 0 0 48px rgba(36,100,163,0.6)`
                      : `0 0 12px rgba(36,100,163,0.45)`,
                  }}
                />
                {/* shimmer que recorre la barra */}
                <motion.div
                  className="pointer-events-none absolute inset-y-0 w-24"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                  }}
                  animate={{ left: ["-20%", "120%"] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 0.35,
                  }}
                />
                {/* flash al completar: línea blanca que barre */}
                <AnimatePresence>
                  {flash && (
                    <motion.div
                      className="pointer-events-none absolute inset-y-0 left-0 right-0"
                      initial={{ opacity: 0, scaleX: 0.2 }}
                      animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      style={{
                        originX: 0,
                        background:
                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)",
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between gap-3">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={status}
                    className="font-instrument text-[10px] uppercase tracking-[0.18em] text-slate-400"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {status}
                  </motion.p>
                </AnimatePresence>
                <p className="font-instrument text-[10px] tabular-nums tracking-[0.14em] text-[#5a93c9]">
                  {pct}%
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
