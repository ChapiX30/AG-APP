import React, { useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import logo from "../assets/lab_logo.png";
import beep from "../assets/beep.mp3";

const brand = "Equipos y Servicios AG";
const letters = brand.split("");

export const SplashScreen: React.FC = () => {
  const controls = useAnimation();

  useEffect(() => {
    controls.start("visible");
    // Intentar reproducir el sonido siempre
    const audio = new Audio(beep);
    audio.volume = 0.32;
    audio.play().catch(() => {});
  }, [controls]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen w-full relative"
      style={{
        background:
          "linear-gradient(135deg, #102347 0%, #134974 75%, #4ea4d9 100%)",
        overflow: "hidden",
      }}
    >
      {/* Halo animado */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0.3 }}
        animate={{ scale: 1.15, opacity: 0.52 }}
        transition={{
          repeat: Infinity,
          repeatType: "mirror",
          duration: 2.8,
          ease: "easeInOut",
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: 250,
          height: 250,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 45%, #8dc6f1cc 10%, #1d406166 70%, transparent 100%)",
          filter: "blur(4px)",
          zIndex: 1,
        }}
      />

      {/* LOGO animado */}
      <motion.img
        src={logo}
        alt="Logo AG"
        className="relative z-10"
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
          filter: "drop-shadow(0 4px 18px #19345699)",
          background: "transparent",
        }}
        initial="hidden"
        animate={controls}
        variants={{
          hidden: { opacity: 0, scale: 0.7, y: -30 },
          visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
              type: "spring",
              duration: 1.2,
              bounce: 0.28,
            },
          },
        }}
      />

      {/* Nombre animado tipo "typing" */}
      <motion.h1
        className="mt-8 mb-1 flex flex-wrap justify-center font-extrabold text-white text-3xl md:text-4xl tracking-wide drop-shadow"
        aria-label={brand}
        initial="hidden"
        animate={controls}
        variants={{
          visible: {
            transition: { staggerChildren: 0.055, delayChildren: 0.2 },
          },
          hidden: {},
        }}
      >
        {letters.map((char, i) => (
          <motion.span
            key={i}
            className={char === " " ? "inline-block w-3" : ""}
            variants={{
              hidden: { opacity: 0, y: 12, scale: 0.9 },
              visible: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
          >
            {char}
          </motion.span>
        ))}
      </motion.h1>

      {/* Subtítulo */}
      <motion.p
        className="text-lg text-white/90 tracking-widest z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={controls}
        transition={{ delay: 1.4, duration: 0.7, type: "tween" }}
      >
        Laboratorio de Metrología
      </motion.p>

      {/* Indicador de carga barras metrológicas */}
      <motion.div
        className="flex mt-12 gap-2"
        initial="hidden"
        animate={controls}
        variants={{
          visible: { transition: { staggerChildren: 0.12, repeat: Infinity } },
          hidden: {},
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="rounded-xl bg-white/90 shadow-md"
            style={{ width: 9, height: 30 }}
            variants={{
              hidden: { opacity: 0.3, scaleY: 0.5 },
              visible: {
                opacity: 1,
                scaleY: [0.55, 1.35, 0.65],
                transition: {
                  repeat: Infinity,
                  duration: 0.95,
                  repeatType: "mirror",
                  delay: i * 0.11,
                  ease: "easeInOut",
                },
              },
            }}
          />
        ))}
      </motion.div>

      {/* Brillo inferior */}
      <div
        className="absolute left-0 bottom-0 w-full h-44 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 140%, #fff9 12%, #48aaff33 35%, transparent 85%)",
        }}
      />
    </div>
  );
};

export default SplashScreen;
