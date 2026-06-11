import React from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";

interface MetrologyLoadingVisualProps {
  /** Sin animación (accesibilidad), pero mantiene la pantalla del multímetro */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * LCD de multímetro + onda — loader temático de calibración eléctrica.
 */
export const MetrologyLoadingVisual: React.FC<MetrologyLoadingVisualProps> = ({
  reducedMotion = false,
  className = "",
}) => {
  const reading = reducedMotion ? (
    <span>12.034</span>
  ) : (
    <motion.span
      animate={{ opacity: [1, 0.35, 1] }}
      transition={{ duration: 0.9, repeat: Infinity }}
    >
      12.034
    </motion.span>
  );

  return (
    <div
      className={`relative flex h-[7.5rem] w-36 flex-col items-center justify-end ${className}`}
      role="img"
      aria-label="Calibrando — lectura de multímetro"
    >
      <div className="relative z-10 w-full rounded-xl border-2 border-[#5a93c9]/55 bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 shadow-lg shadow-[#2464A3]/20">
        <div className="mb-2 h-1 w-8 rounded-full bg-slate-600 mx-auto" />
        <div className="rounded-md bg-[#061018] border border-emerald-500/40 px-2 py-1.5 font-mono text-sm text-emerald-400 tabular-nums tracking-wider shadow-[inset_0_0_12px_rgba(16,185,129,0.12)]">
          {reading}
          <span className="text-emerald-600/80 text-xs ml-0.5">V DC</span>
        </div>
        <div className="mt-2 flex justify-center gap-1">
          {["V", "Ω", "A"].map((m, i) =>
            reducedMotion ? (
              <span
                key={m}
                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                  i === 0
                    ? "bg-[#2464A3]/45 text-[#a8cce8]"
                    : "bg-[#2464A3]/20 text-[#8bb5d9]/70"
                }`}
              >
                {m}
              </span>
            ) : (
              <motion.span
                key={m}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#2464A3]/30 text-[#8bb5d9]"
                animate={{ opacity: i === 0 ? [0.5, 1, 0.5] : 0.45 }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
              >
                {m}
              </motion.span>
            )
          )}
        </div>
      </div>

      {reducedMotion ? (
        <svg className="absolute bottom-0 w-full h-10 opacity-70" viewBox="0 0 144 40" aria-hidden>
          <path
            d="M0,20 Q18,6 36,20 T72,20 T108,20 T144,20"
            fill="none"
            stroke="#5a93c9"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg className="absolute bottom-0 w-full h-10 opacity-80" viewBox="0 0 144 40" aria-hidden>
          <motion.path
            d="M0,20 Q18,6 36,20 T72,20 T108,20 T144,20"
            fill="none"
            stroke="#5a93c9"
            strokeWidth="2"
            strokeLinecap="round"
            animate={{
              d: [
                "M0,20 Q18,6 36,20 T72,20 T108,20 T144,20",
                "M0,20 Q18,34 36,20 T72,20 T108,20 T144,20",
                "M0,20 Q18,6 36,20 T72,20 T108,20 T144,20",
              ],
            }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      )}

      {reducedMotion ? (
        <Zap className="absolute -top-1 right-2 h-5 w-5 text-[#8bb5d9] opacity-80" aria-hidden />
      ) : (
        <motion.div
          className="absolute -top-1 right-2"
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.05, 0.9] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Zap className="h-5 w-5 text-[#8bb5d9]" />
        </motion.div>
      )}
    </div>
  );
};
