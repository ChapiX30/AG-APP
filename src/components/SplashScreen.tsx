import React, { useEffect, useState } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { useNavigate } from "react-router-dom";
import logo from "../assets/lab_logo.png"; // Asegúrate de que la ruta a tu logo sea correcta
import beep from "../assets/beep.mp3"; // Asegúrate de que la ruta a tu sonido sea correcta

// --- Constantes para una fácil configuración ---
const BRAND_NAME = "Equipos y Servicios AG";
const SUBTITLE = "Laboratorio de Metrología";
const LETTERS = BRAND_NAME.split("");

const LOADING_STEPS = [
  "Sincronizando Consecutivos...",
  "Cargando Hojas de Trabajo...",
  "Validando Certificados...",
  "Inicializando Equipos AG...",
  "Configurando Interfaces...",
  "Conectando con la Nube Metrológica...",
];

// Duración de cada paso de carga en milisegundos
const STEP_DURATION = 2200;

// --- Componente principal del SplashScreen ---
export const SplashScreen: React.FC = () => {
  const controls = useAnimation();
  const [stepIndex, setStepIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Inicia las animaciones de entrada
    controls.start("visible");

    // Reproduce un sonido de "beep" sutil al iniciar
    const audio = new Audio(beep);
    audio.volume = 0.3;
    audio.play().catch(() => {
      // El navegador puede bloquear la reproducción automática de audio
      console.log("La reproducción de audio fue bloqueada por el navegador.");
    });

    // Intervalo para cambiar el texto de carga
    const stepInterval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, STEP_DURATION);

    // --- CÁLCULO DE DURACIÓN TOTAL ---
    // Multiplica el número de pasos por la duración de cada uno para obtener el tiempo total
    const totalDuration = LOADING_STEPS.length * STEP_DURATION;

    // Temporizador para iniciar la animación de salida y navegar a la siguiente pantalla
    const exitTimeout = setTimeout(() => {
      setIsExiting(true); // Inicia la animación de desvanecimiento de salida
      // Espera a que termine la animación de salida (800ms) antes de navegar
      setTimeout(() => navigate("/MainMenu"), 800);
    }, totalDuration);

    // Limpieza de efectos al desmontar el componente para evitar fugas de memoria
    return () => {
      clearInterval(stepInterval);
      clearTimeout(exitTimeout);
    };
  }, [controls, navigate]);

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen w-full relative overflow-hidden bg-black"
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      {/* Fondo: Rejilla sutil animada */}
      <div
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      
      {/* Fondo: Gradiente radial tipo "núcleo de energía" */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at center, #0d254c 0%, #051124 60%, #000 100%)",
        }}
        animate={{
          scale: [1, 1.05, 1],
          rotate: [0, 5, 0],
          opacity: [1, 0.95, 1],
        }}
        transition={{
          repeat: Infinity,
          duration: 12,
          ease: "easeInOut",
        }}
      />

      {/* Efecto de partículas / Briznas de energía */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-cyan-400/20"
            style={{
              width: Math.random() * (120 - 40) + 40,
              height: Math.random() * (120 - 40) + 40,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              filter: `blur(${Math.random() * (30 - 15) + 15}px)`,
            }}
            animate={{
              x: [0, Math.random() * 200 - 100, 0],
              y: [0, Math.random() * 200 - 100, 0],
              scale: [1, 1.2, 1],
              opacity: [0, 1, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: Math.random() * (25 - 15) + 15,
              ease: "easeInOut",
              delay: Math.random() * 5,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* LOGO con brillo pulsante */}
        <motion.div
          className="relative"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 1.8,
            ease: "easeOut",
            type: "spring",
            bounce: 0.4,
          }}
        >
          <motion.img
            src={logo}
            alt="Logo AG"
            className="rounded-2xl w-36 h-36 object-contain bg-transparent"
            animate={{
              rotateY: [0, 6, -6, 0],
              y: [0, -5, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: 8,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute inset-0"
            style={{
              filter: "drop-shadow(0 0 18px #aaccff)",
            }}
            animate={{
              filter: [
                "drop-shadow(0 0 18px #99ccff)",
                "drop-shadow(0 0 28px #99ccff)",
                "drop-shadow(0 0 18px #99ccff)",
              ],
            }}
            transition={{
              repeat: Infinity,
              duration: 3.5,
              ease: "easeInOut",
            }}
          />
        </motion.div>

        {/* NOMBRE DE LA EMPRESA */}
        <motion.h1
          className="mt-8 mb-1 flex flex-wrap justify-center font-extrabold text-white text-3xl md:text-4xl tracking-wide z-10 [text-shadow:0_0_10px_rgba(173,216,230,0.5)]"
          aria-label={BRAND_NAME}
          initial="hidden"
          animate={controls}
          variants={{
            visible: { transition: { staggerChildren: 0.05, delayChildren: 0.3 } },
            hidden: {},
          }}
        >
          {LETTERS.map((char, i) => (
            <motion.span
              key={`${char}-${i}`}
              className={char === " " ? "w-3 inline-block" : ""}
              variants={{
                hidden: { opacity: 0, y: 15, scale: 0.9 },
                visible: { opacity: 1, y: 0, scale: 1 },
              }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>

        {/* SUBTÍTULO */}
        <motion.p
          className="text-lg text-white/80 tracking-widest z-10 [text-shadow:0_0_5px_rgba(173,216,230,0.5)]"
          initial={{ opacity: 0, y: 16 }}
          animate={controls}
          variants={{
            visible: { opacity: 1, y: 0, transition: { delay: 1.4, duration: 0.8 } },
            hidden: { opacity: 0, y: 16 },
          }}
        >
          {SUBTITLE}
        </motion.p>
      </div>

      {/* MENSAJE DE CARGA */}
      <div className="absolute bottom-24 text-center w-full px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="inline-block text-white text-sm sm:text-base font-mono bg-blue-950/30 px-6 py-2 rounded-full border border-blue-500/30 shadow-lg backdrop-blur-sm"
          >
            {LOADING_STEPS[stepIndex]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* BARRAS DE CARGA ANIMADAS */}
      <motion.div
        className="absolute bottom-10 flex gap-2 z-10"
        initial="hidden"
        animate={controls}
        variants={{
          visible: { transition: { staggerChildren: 0.1 } },
          hidden: {},
        }}
      >
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="rounded-xl bg-gradient-to-b from-cyan-300 to-blue-400 shadow-md"
            style={{ width: 9, height: 30 }}
            variants={{
              hidden: { opacity: 0.3, scaleY: 0.5 },
              visible: {
                opacity: [0.5, 1, 0.5],
                scaleY: [0.5, 1.4, 0.5],
                transition: {
                  repeat: Infinity,
                  duration: 1.2,
                  delay: i * 0.15,
                  ease: "easeInOut",
                },
              },
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
};

export default SplashScreen;