import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import logo from "../assets/lab_logo.png";
import beep from "../assets/beep.mp3";

// --- Constantes ---
const BRAND_NAME = "Equipos y Servicios AG";
const SUBTITLE = "Laboratorio de Metrología";
const LOADING_STEPS = [
  "Sincronizando Consecutivos...",
  "Cargando Hojas de Trabajo...",
  "Validando Certificados...",
  "Inicializando Equipos AG...",
  "Configurando Interfaces...",
  "Conectando con la Nube Metrológica...",
];
const STEP_DURATION = 2200;

export const SplashScreen: React.FC = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Audio de inicio
    const audio = new Audio(beep);
    audio.volume = 0.3;
    audio.play().catch(() => console.log("Audio bloqueado"));

    // Cambio de pasos de carga
    const stepInterval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, STEP_DURATION);

    // Barra de progreso suave
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        return prev + 100 / ((LOADING_STEPS.length * STEP_DURATION) / 50);
      });
    }, 50);

    // Duración total y salida
    const totalDuration = LOADING_STEPS.length * STEP_DURATION;
    const exitTimeout = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => navigate("/MainMenu"), 800);
    }, totalDuration);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
      clearTimeout(exitTimeout);
    };
  }, [navigate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.8 }}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Fondo de rejilla animada */}
      <motion.div
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
          opacity: 0.3,
        }}
      />

      {/* Resplandor central giratorio */}
      <motion.div
        animate={{
          rotate: 360,
          scale: [1, 1.2, 1],
        }}
        transition={{
          rotate: { duration: 15, repeat: Infinity, ease: "linear" },
          scale: { duration: 3, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Partículas flotantes mejoradas */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            opacity: 0,
          }}
          animate={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            opacity: [0, 0.8, 0],
          }}
          transition={{
            duration: 8 + Math.random() * 10,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            width: `${4 + Math.random() * 8}px`,
            height: `${4 + Math.random() * 8}px`,
            borderRadius: "50%",
            background: `rgba(${99 + Math.random() * 100}, ${102 + Math.random() * 100}, 241, 0.8)`,
            boxShadow: `0 0 ${10 + Math.random() * 20}px rgba(99, 102, 241, 0.8)`,
          }}
        />
      ))}

      {/* Contenedor principal con glassmorphism */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "32px",
          padding: "60px 40px",
          borderRadius: "32px",
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
          maxWidth: "90%",
        }}
      >
        {/* Logo con animación de pulso y glow */}
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            filter: [
              "drop-shadow(0 0 20px rgba(99, 102, 241, 0.6))",
              "drop-shadow(0 0 40px rgba(99, 102, 241, 1))",
              "drop-shadow(0 0 20px rgba(99, 102, 241, 0.6))",
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            width: "clamp(100px, 20vw, 160px)",
            height: "clamp(100px, 20vw, 160px)",
          }}
        >
          <img
            src={logo}
            alt="Logo"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </motion.div>

        {/* Nombre de la empresa con efecto de aparición por letras */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "4px",
          }}
        >
          {BRAND_NAME.split("").map((char, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: i * 0.05,
                ease: "easeOut",
              }}
              style={{
                fontSize: "clamp(24px, 5vw, 42px)",
                fontWeight: "800",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textShadow: "0 0 30px rgba(102, 126, 234, 0.5)",
                letterSpacing: "2px",
              }}
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
          ))}
        </div>

        {/* Subtítulo con efecto fade-in */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          style={{
            fontSize: "clamp(14px, 3vw, 18px)",
            fontWeight: "400",
            color: "rgba(255, 255, 255, 0.8)",
            letterSpacing: "4px",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {SUBTITLE}
        </motion.div>

        {/* Línea decorativa animada */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: 1.5, duration: 1 }}
          style={{
            height: "2px",
            maxWidth: "300px",
            background: "linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.8), transparent)",
          }}
        />

        {/* Mensaje de carga con transición suave */}
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            style={{
              fontSize: "clamp(12px, 2.5vw, 16px)",
              color: "rgba(255, 255, 255, 0.9)",
              textAlign: "center",
              minHeight: "24px",
              fontWeight: "500",
            }}
          >
            {LOADING_STEPS[stepIndex]}
          </motion.div>
        </AnimatePresence>

        {/* Barra de progreso moderna */}
        <div
          style={{
            width: "100%",
            maxWidth: "400px",
            height: "6px",
            borderRadius: "10px",
            background: "rgba(255, 255, 255, 0.1)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
            style={{
              height: "100%",
              borderRadius: "10px",
              background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
              boxShadow: "0 0 20px rgba(102, 126, 234, 0.8)",
              position: "relative",
            }}
          >
            {/* Efecto de brillo en movimiento */}
            <motion.div
              animate={{
                x: ["-100%", "400%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "50%",
                height: "100%",
                background: "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)",
              }}
            />
          </motion.div>
        </div>

        {/* Porcentaje de progreso */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontSize: "clamp(14px, 3vw, 18px)",
            fontWeight: "600",
            color: "rgba(255, 255, 255, 0.7)",
            fontFamily: "monospace",
          }}
        >
          {Math.round(progress)}%
        </motion.div>

        {/* Indicadores de puntos animados */}
        <div style={{ display: "flex", gap: "8px" }}>
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "rgba(99, 102, 241, 0.8)",
                boxShadow: "0 0 10px rgba(99, 102, 241, 0.8)",
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Resplandor inferior */}
      <motion.div
        animate={{
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "200px",
          background: "linear-gradient(0deg, rgba(99, 102, 241, 0.3) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
};

export default SplashScreen;
