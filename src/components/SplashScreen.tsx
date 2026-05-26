import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import labLogo from "../assets/lab_logo.png";

const BRAND_NAME = "Equipos y Servicios AG";
const SUBTITLE = "Sistema de gestión metrológica";
const BRAND_BLUE = "#0050d8";
/** Mínimo visible solo si `ready` ya es true; salida inmediata cuando auth no bloquea. */
const MIN_VISIBLE_MS = 450;
const EXIT_DURATION_S = 0.35;

export interface SplashScreenProps {
  /** Cuando true, el splash puede cerrarse (p. ej. auth sin loading). */
  ready?: boolean;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  ready = true,
  onComplete,
}) => {
  const [shouldExit, setShouldExit] = useState(false);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!ready || shouldExit) return;
    const elapsed = Date.now() - mountedAt.current;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => setShouldExit(true), delay);
    return () => window.clearTimeout(timer);
  }, [ready, shouldExit]);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {!shouldExit && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_DURATION_S }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 font-sans"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-8 w-[90%] max-w-md px-4"
          >
            <img
              src={labLogo}
              alt={BRAND_NAME}
              className="w-[120px] h-auto drop-shadow-lg"
            />

            <div className="text-center space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4d8fff] to-[#0050d8]">
                  {BRAND_NAME}
                </span>
              </h1>
              <p className="text-sm text-slate-400 font-medium tracking-wide">
                {SUBTITLE}
              </p>
            </div>

            <div className="w-full mt-2">
              <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: BRAND_BLUE }}
                  initial={{ width: "0%" }}
                  animate={{ width: ready ? "100%" : "35%" }}
                  transition={{ duration: ready ? 0.4 : 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
