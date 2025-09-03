import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import { Eye, EyeOff, Lock, User, Mail, Briefcase, Microscope, ArrowLeft, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { motion } from "framer-motion";

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onNavigateToLogin,
}) => {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [puesto, setPuesto] = useState<"" | "Metrólogo" | "Calidad">("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validaciones básicas
    if (!puesto) {
      setError("Selecciona tu puesto de trabajo.");
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        nombre,
        correo,
        puesto,               // <-- Guardamos SOLO los valores permitidos: "Metrólogo" o "Calidad"
        creado: new Date()
      });
      setSuccess("¡Usuario registrado exitosamente!");
      setTimeout(() => onNavigateToLogin(), 2000);
    } catch (err: any) {
      setError("Error al registrar usuario. Revisa los datos e intenta nuevamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-screen relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #102347 0%, #134974 75%, #4ea4d9 100%)",
      }}
    >
      {/* Efectos de fondo animados */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0.3 }}
        animate={{ scale: 1.2, opacity: 0.6 }}
        transition={{
          repeat: Infinity,
          repeatType: "mirror",
          duration: 3,
          ease: "easeInOut",
        }}
        className="absolute top-1/4 left-1/4 pointer-events-none"
        style={{
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 45%, #8dc6f1cc 10%, #1d406166 70%, transparent 100%)",
          filter: "blur(6px)",
          zIndex: 1,
        }}
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0.2 }}
        animate={{ scale: 1.1, opacity: 0.4 }}
        transition={{
          repeat: Infinity,
          repeatType: "mirror",
          duration: 4,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-1/4 right-1/4 pointer-events-none"
        style={{
          width: 350,
          height: 350,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 45%, #4ea4d9aa 15%, #13497455 60%, transparent 100%)",
          filter: "blur(8px)",
          zIndex: 1,
        }}
      />

      {/* Brillo inferior */}
      <div
        className="absolute left-0 bottom-0 w-full h-60 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 140%, #fff9 8%, #48aaff22 25%, transparent 70%)",
          zIndex: 1,
        }}
      />

      {/* Contenido principal - Flexbox */}
      <div className="flex min-h-screen relative z-10">
        
        {/* Panel izquierdo */}
        <motion.div
          initial={{ opacity: 0, x: -100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="flex-[3] flex flex-col justify-center px-16 py-12"
        >
          {/* Logo y título */}
          <div className="flex items-center mb-12">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
              className="w-20 h-20 bg-gradient-to-br from-white/20 to-white/10 rounded-2xl flex items-center justify-center mr-6 backdrop-blur-sm border border-white/20"
            >
              <Microscope className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-5xl font-bold text-white">ESE-AG</h1>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-7xl font-extrabold text-white mb-8 leading-tight"
          >
            Únete a nuestro
            <span className="block bg-gradient-to-r from-blue-300 to-white bg-clip-text text-transparent">
              equipo
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-2xl text-white/90 mb-16 leading-relaxed max-w-2xl"
          >
            Crea tu cuenta y accede a la plataforma más avanzada para la gestión de equipos y servicios de laboratorio.
          </motion.p>

          {/* Características */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="space-y-8"
          >
            {[
              { title: "Acceso Completo", desc: "Todas las funcionalidades desde el primer día", color: "text-green-300" },
              { title: "Datos Protegidos", desc: "Tu información siempre segura y encriptada", color: "text-blue-300" },
              { title: "Tecnología Avanzada", desc: "Herramientas de última generación", color: "text-purple-300" }
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.9 + index * 0.1 }}
                className="flex items-center"
              >
                <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mr-6 border border-white/20">
                  {/* Solo decorativo */}
                  <div className={`w-8 h-8 rounded-full border-2 border-white/20 ${item.color}`} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-xl mb-1">{item.title}</h3>
                  <p className="text-white/70 text-lg">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Panel derecho */}
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
          className="flex-[2] flex items-center justify-center px-12 py-12"
        >
          <div className="w-full max-w-md">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl">
              <div className="text-center mb-10">
                <h3 className="text-3xl font-bold text-white mb-3">Crear Cuenta</h3>
                <p className="text-white/70 text-lg">Sistema Equipos y Servicios AG</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-6">
                {/* Campo Nombre */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.8 }}>
                  <label className="block text-white/90 text-sm font-medium mb-3">Nombre completo</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all backdrop-blur-sm text-base"
                      placeholder="Tu nombre completo"
                      required
                      autoFocus
                    />
                  </div>
                </motion.div>

                {/* Campo Email */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.9 }}>
                  <label className="block text-white/90 text-sm font-medium mb-3">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type="email"
                      value={correo}
                      onChange={(e) => setCorreo(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all backdrop-blur-sm text-base"
                      placeholder="ejemplo@ese-ag.com"
                      required
                    />
                  </div>
                </motion.div>

                {/* Campo Contraseña */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.0 }}>
                  <label className="block text-white/90 text-sm font-medium mb-3">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all backdrop-blur-sm text-base"
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </motion.div>

                {/* Campo Puesto (Select con lista cerrada) */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.1 }}>
                  <label className="block text-white/90 text-sm font-medium mb-3">Puesto de trabajo</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <select
                      value={puesto}
                      onChange={(e) => setPuesto(e.target.value as "Metrólogo" | "Calidad" | "")}
                      className="appearance-none w-full pl-12 pr-12 py-4 bg-white/5 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all backdrop-blur-sm text-base"
                      required
                    >
                      <option value="" className="bg-slate-800 text-white">Selecciona tu puesto…</option>
                      <option value="Metrólogo" className="bg-slate-800 text-white">Metrólogo</option>
                      <option value="Calidad" className="bg-slate-800 text-white">Calidad</option>
                      <option value="Logistica" className="bg-slate-800 text-white">Logistica</option>
                      <option value="Administrativo" className="bg-slate-800 text-white">Administrativo</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  </div>
                  <p className="text-white/60 text-xs mt-2">
                    Este dato define tus permisos en la plataforma.
                  </p>
                </motion.div>

                {/* Mensajes de error/éxito */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-xl p-4 text-center backdrop-blur-sm flex items-center justify-center"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                  </motion.div>
                )}

                {success && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-green-500/20 border border-green-400/30 text-green-200 rounded-xl p-4 text-center backdrop-blur-sm flex items-center justify-center"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {success}
                  </motion.div>
                )}

                {/* Botón de registro */}
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.2 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Creando cuenta...
                    </span>
                  ) : (
                    'Crear cuenta'
                  )}
                </motion.button>

                {/* Botón volver */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.4 }} className="text-center pt-4">
                  <button
                    type="button"
                    onClick={onNavigateToLogin}
                    className="text-white/70 hover:text-white font-medium transition-colors flex items-center justify-center mx-auto"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    ¿Ya tienes cuenta? Inicia sesión
                  </button>
                </motion.div>
              </form>

              {/* Términos */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.6 }} className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-xs text-white/50">
                  Al crear una cuenta, aceptas nuestros términos de servicio y política de privacidad
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
};
