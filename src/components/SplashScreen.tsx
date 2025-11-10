import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import logo from "../assets/lab_logo.png";

// --- Constantes ---
const BRAND_NAME = "EQUIPOS Y SERVICIOS AG";
const SUBTITLE = "SISTEMA DE GESTIÓN METROLÓGICA";

export const SplashScreen: React.FC = () => {
  // Estado para el texto actual de carga
  const [loadingText, setLoadingText] = useState("Iniciando sistema...");
  // Estado para el progreso (0-100)
  const [progress, setProgress] = useState(0);
  // Estado para manejar errores si algo falla realmente
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const initializeSystem = async () => {
      try {
        // --- PASO 1: Inicio ---
        setLoadingText("Verificando credenciales...");
        setProgress(10);
        // TODO: Aquí va tu verificación real de autenticación (ej. Firebase onAuthStateChanged)
        // await auth.checkUserStatus(); 
        await new Promise(r => setTimeout(r, 800)); // Simulación a eliminar cuando tengas la real

        // --- PASO 2: Carga de Datos de Usuario ---
        setLoadingText("Cargando perfil de usuario...");
        setProgress(40);
        // TODO: Cargar rol, permisos, nombre del técnico, etc.
        // const userProfile = await api.getUserProfile(uid);
        // dispatch(setUser(userProfile));
        await new Promise(r => setTimeout(r, 1000)); // Simulación a eliminar

        // --- PASO 3: Datos Esenciales de la App ---
        setLoadingText("Sincronizando catálogos...");
        setProgress(70);
        // TODO: Cargar datos que la app necesita SÍ o SÍ para funcionar (ej. tipos de equipos, unidades)
        // await dispatch(fetchEssentialCatalogs());
        await new Promise(r => setTimeout(r, 1200)); // Simulación a eliminar

        // --- FINALIZACIÓN ---
        setLoadingText("Preparando entorno...");
        setProgress(100);
        
        // Pequeña pausa al 100% para que el usuario vea que terminó
        setTimeout(() => {
          navigate("/MainMenu");
        }, 500);

      } catch (error) {
        console.error("Error fatal de inicialización:", error);
        setErrorMessage("Error de conexión. Contacte a TI.");
        // Opcional: redirigir a pantalla de login si falló la autenticación
        // if (error.type === 'AUTH_ERROR') navigate("/login");
      }
    };

    initializeSystem();
  }, [navigate]);

  if (errorMessage) {
    // Pantalla de error simple por si la carga real falla
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: '#0f172a', 
        color: '#ef4444' 
      }}>
        <p>⚠️ {errorMessage}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(to bottom right, #0f172a, #1e293b)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        color: "#f8fafc",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2rem", width: "90%", maxWidth: "500px" }}
      >
        <img src={logo} alt="Logo" style={{ width: "120px", height: "auto", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.2))" }} />
        
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "0.5rem", background: "linear-gradient(to right, #fff, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {BRAND_NAME}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", fontWeight: "500", letterSpacing: "0.1em" }}>
            {SUBTITLE}
          </p>
        </div>

        <div style={{ width: "100%", marginTop: "2rem" }}>
          {/* Barra de progreso real */}
          <div style={{ height: "4px", width: "100%", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden", marginBottom: "1rem" }}>
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              // La transición es suave incluso si el salto de progreso es grande
              transition={{ duration: 0.5, ease: "easeInOut" }}
              style={{ height: "100%", background: "#3b82f6", borderRadius: "2px" }}
            />
          </div>

          {/* Texto cambiante según el estado real */}
          <div style={{ height: "24px", position: "relative", overflow: "hidden" }}>
            <AnimatePresence mode="wait">
              <motion.p
                key={loadingText} // Cambia cuando cambia el texto
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                style={{ fontSize: "0.75rem", color: "#64748b", textAlign: "center", width: "100%", position: "absolute" }}
              >
                {loadingText}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SplashScreen;