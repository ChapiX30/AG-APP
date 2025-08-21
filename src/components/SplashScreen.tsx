import React, { useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { useNavigate } from "react-router-dom";
import logo from "../assets/lab_logo.png";
import beep from "../assets/beep.mp3";

const brand = "Equipos y Servicios AG";
const letters = brand.split("");

const loadingSteps = [
  "Sincronizando Consecutivos...",
  "Cargando Hojas de Trabajo...",
  "Validando Certificados...",
  "Inicializando Equipos AG...",
  "Configurando Interfaces...",
  "Conectando con la Nube Metrológica...",
];

export const SplashScreen: React.FC = () => {
  const controls = useAnimation();
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    controls.start("visible");

    const audio = new Audio(beep);
    audio.volume = 0.32;
    audio.play().catch(() => {});

    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 2200);

    const totalDuration = loadingSteps.length * 2200;

    const timeout = setTimeout(() => {
      navigate("/MainMenu");
    }, totalDuration); // durará 6 segundos

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [controls, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full relative overflow-hidden bg-black">
      {/* Fondo animado radial tipo energía */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at center, #183c71 0%, #0c1c34 60%, #000 100%)",
        }}
        animate={{
          scale: [1, 1.03, 1],
          opacity: [1, 0.9, 1],
        }}
        transition={{
          repeat: Infinity,
          duration: 6,
          ease: "easeInOut",
        }}
      />

      {/* Partículas glow suaves */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute w-72 h-72 rounded-full bg-blue-400/20 blur-3xl"
          animate={{
            x: [0, 100, -50, 0],
            y: [0, -50, 100, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{ repeat: Infinity, duration: 15, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-80 h-80 rounded-full bg-cyan-300/20 blur-2xl left-1/2 top-1/2"
          animate={{
            x: [-50, 70, -80, 0],
            y: [-40, 50, -90, 0],
            scale: [1.1, 0.9, 1.2, 1],
          }}
          transition={{ repeat: Infinity, duration: 18, ease: "easeInOut" }}
        />
      </div>

      {/* LOGO ULTRA PRO */}
      <motion.div
        className="relative z-10"
        initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{
          duration: 1.8,
          ease: "easeOut",
          type: "spring",
          bounce: 0.4,
        }}
        style={{
          filter: "drop-shadow(0 0 25px #99ccff)",
        }}
      >
        <motion.img
          src={logo}
          alt="Logo AG"
          style={{
            width: 140,
            height: 140,
            borderRadius: "16px",
            objectFit: "contain",
            background: "transparent",
          }}
          animate={{
            rotateY: [0, 5, -5, 0],
          }}
          transition={{
            repeat: Infinity,
            duration: 8,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* Brillo pulsante debajo del logo */}
      <motion.div
        className="absolute z-0 top-[48%] left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: 220,
          height: 220,
          background: "radial-gradient(circle, #8bd1ff44, transparent 70%)",
          filter: "blur(35px)",
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* NOMBRE CON EFECTO TYPE */}
      <motion.h1
        className="mt-8 mb-1 flex flex-wrap justify-center font-extrabold text-white text-3xl md:text-4xl tracking-wide drop-shadow z-10"
        aria-label={brand}
        initial="hidden"
        animate={controls}
        variants={{
          visible: {
            transition: { staggerChildren: 0.055, delayChildren: 0.3 },
          },
          hidden: {},
        }}
      >
        {letters.map((char, i) => (
          <motion.span
            key={i}
            className={char === " " ? "inline-block w-3" : ""}
            variants={{
              hidden: { opacity: 0, y: 10, scale: 0.9 },
              visible: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            {char}
          </motion.span>
        ))}
      </motion.h1>

      {/* SUBTÍTULO */}
      <motion.p
        className="text-lg text-white/80 tracking-widest z-10"
        initial={{ opacity: 0, y: 16 }}
        animate={controls}
        transition={{ delay: 1.4, duration: 0.7, type: "tween" }}
      >
        Laboratorio de Metrología
      </motion.p>

      {/* MENSAJE DE CARGA CAMBIANTE */}
      <motion.div
        key={stepIndex}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="mt-6 text-white text-sm sm:text-base font-mono bg-white/10 px-6 py-2 rounded-full border border-white/20 shadow-md z-10"
      >
        {loadingSteps[stepIndex]}
      </motion.div>

      {/* BARRAS DE CARGA */}
      <motion.div
        className="flex mt-10 gap-2 z-10"
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
    </div>
  );
};

export default SplashScreen;
