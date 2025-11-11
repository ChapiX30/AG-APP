import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { auth, db } from "../utils/firebase"; // Asegúrate que la ruta a tu configuración de firebase sea correcta
import { Eye, EyeOff, Lock, User, Mail, Briefcase, Microscope, ArrowLeft, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";

// --- Interfaz de Props ---
interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

// --- Función para Mensajes de Error de Firebase ---
const getFirebaseErrorMessage = (error: any): string => {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'Este correo electrónico ya está registrado.';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico no es válido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    default:
      return 'Error al registrar. Revisa los datos e intenta de nuevo.';
  }
};

// --- Componente Principal RegisterScreen ---
export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  // --- Estados del Componente ---
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [puesto, setPuesto] = useState<"" | "Metrólogo" | "Calidad" | "Logistica" | "Administrativo">("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- Manejador del Registro ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!puesto) {
      setError("Por favor, selecciona tu puesto de trabajo.");
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        nombre,
        correo,
        puesto,
        creado: new Date()
      });
      setSuccess("¡Usuario registrado exitosamente! Redirigiendo...");
      setTimeout(() => onNavigateToLogin(), 2000);
    } catch (err: any) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Renderizado del Componente ---
  return (
    <div
      className="min-h-screen w-screen relative overflow-hidden flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #102347 0%, #134974 75%, #4ea4d9 100%)" }}
    >
      {/* Efectos de fondo animados */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0.3 }}
        animate={{ scale: 1.2, opacity: 0.6 }}
        transition={{ repeat: Infinity, repeatType: "mirror", duration: 4, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-[25rem] h-[25rem] rounded-full bg-radial-gradient(circle, #8dc6f166, #1d406133, transparent) pointer-events-none blur-md z-0"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0.2 }}
        animate={{ scale: 1.1, opacity: 0.4 }}
        transition={{ repeat: Infinity, repeatType: "mirror", duration: 5, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-1/4 right-1/4 w-[22rem] h-[22rem] rounded-full bg-radial-gradient(circle, #4ea4d955, #13497422, transparent) pointer-events-none blur-lg z-0"
      />
      <div className="absolute left-0 bottom-0 w-full h-60 pointer-events-none bg-radial-gradient(ellipse at 50% 140%, #fff9 8%, #48aaff22 25%, transparent) z-0" />

      {/* Contenedor Principal (Tarjeta) */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row rounded-3xl overflow-hidden bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl"
      >
        
        {/* Panel Izquierdo (Informativo) */}
        <div className="hidden lg:flex flex-1 p-8 sm:p-12 flex-col justify-center">
          <div className="flex items-center mb-8">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
              className="w-16 h-16 bg-gradient-to-br from-white/20 to-white/10 rounded-2xl flex items-center justify-center mr-4 backdrop-blur-sm border border-white/20"
            >
              <Microscope className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-4xl font-bold text-white">ESE-AG</h1>
          </div>
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-5xl md:text-6xl font-extrabold text-white mb-6 leading-tight"
          >
            Únete a nuestro
            <span className="block bg-gradient-to-r from-blue-300 to-white bg-clip-text text-transparent">equipo</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-lg text-white/90 mb-10 leading-relaxed max-w-2xl"
          >
            Crea tu cuenta y accede a la plataforma más avanzada para la gestión de equipos y servicios de laboratorio.
          </motion.p>
        </div>

        {/* Panel Derecho (Formulario) */}
        <div className="flex-1 p-8 sm:p-12 bg-white/5">
          <div className="w-full max-w-md mx-auto">
            <div className="text-center mb-8">
              <h3 className="text-3xl font-bold text-white mb-2">Crear Cuenta</h3>
              <p className="text-white/70">Sistema Equipos y Servicios AG</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              
              {/* --- Campo Nombre --- */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
                <label className="block text-white/90 text-sm font-medium mb-2">Nombre completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="Tu nombre completo"
                    required
                    autoFocus
                  />
                </div>
              </motion.div>

              {/* --- Campo Correo --- */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.7 }}>
                <label className="block text-white/90 text-sm font-medium mb-2">Correo electrónico</label>
                <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type="email"
                      value={correo}
                      onChange={(e) => setCorreo(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                      placeholder="ejemplo@ese-ag.com"
                      required
                    />
                </div>
              </motion.div>

              {/* --- Campo Contraseña --- */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.8 }}>
                <label className="block text-white/90 text-sm font-medium mb-2">Contraseña</label>
                <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
              </motion.div>

              {/* --- Campo Puesto --- */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.9 }}>
                  <label className="block text-white/90 text-sm font-medium mb-2">Puesto de trabajo</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <select
                      value={puesto}
                      onChange={(e) => setPuesto(e.target.value as typeof puesto)}
                      className="appearance-none w-full pl-12 pr-12 py-3 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                      required
                    >
                      <option value="" disabled className="bg-slate-800 text-gray-400">Selecciona tu puesto…</option>
                      <option value="Metrólogo" className="bg-slate-800 text-white">Metrólogo</option>
                      <option value="Calidad" className="bg-slate-800 text-white">Calidad</option>
                      <option value="Logistica" className="bg-slate-800 text-white">Logística</option>
                      <option value="Administrativo" className="bg-slate-800 text-white">Administrativo</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  </div>
              </motion.div>

              {/* --- Alertas de Éxito y Error --- */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-xl p-3 text-center flex items-center justify-center text-sm"
                  >
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-green-500/20 border border-green-400/30 text-green-200 rounded-xl p-3 text-center flex items-center justify-center text-sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span>{success}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* --- Botón de Envío --- */}
              <motion.button
                type="submit"
                disabled={isLoading}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.0 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Creando cuenta...
                  </>
                ) : (
                  'Crear cuenta'
                )}
              </motion.button>
              
              {/* --- Navegación a Login --- */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.2 }} className="text-center pt-2">
                <button
                  type="button"
                  onClick={onNavigateToLogin}
                  className="text-white/70 hover:text-white font-medium transition-colors flex items-center justify-center mx-auto text-sm"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  ¿Ya tienes cuenta? Inicia sesión
                </button>
              </motion.div>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};