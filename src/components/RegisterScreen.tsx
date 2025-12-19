import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { auth, db } from "../utils/firebase"; 
import { Eye, EyeOff, Lock, User, Mail, Briefcase, Microscope, ArrowLeft, CheckCircle, AlertCircle, ChevronDown, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

const getFirebaseErrorMessage = (error: any): string => {
  switch (error.code) {
    case 'auth/email-already-in-use': return 'Este correo electrónico ya está registrado.';
    case 'auth/invalid-email': return 'El formato del correo electrónico no es válido.';
    case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
    default: return 'Error al registrar. Revisa los datos e intenta de nuevo.';
  }
};

// Variantes para animaciones escalonadas
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.3 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
};

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [puesto, setPuesto] = useState<"" | "Metrólogo" | "Calidad" | "Logistica" | "Administrativo">("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Lógica simple de fortaleza de contraseña
  const passwordStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!puesto) { setError("Por favor, selecciona tu puesto de trabajo."); return; }
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        nombre, correo, puesto, creado: new Date()
      });
      setSuccess("¡Cuenta creada con éxito!");
      setTimeout(() => onNavigateToLogin(), 2000);
    } catch (err: any) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4 bg-[#0a1128]">
      
      {/* 1. FONDO TÉCNICO AVANZADO */}
      <div className="absolute inset-0 z-0">
        {/* Grid de metrología */}
        <div className="absolute inset-0 opacity-[0.05]" 
             style={{ backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90(#fff 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
        
        {/* Orbes de luz con movimiento suave */}
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 -left-20 w-[40rem] h-[40rem] bg-blue-600/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -40, 0], y: [0, -50, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-20 -right-20 w-[35rem] h-[35rem] bg-indigo-500/10 rounded-full blur-[100px]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row rounded-[2.5rem] overflow-hidden bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
      >
        {/* PANEL IZQUIERDO: Branding & Info */}
        <div className="hidden lg:flex flex-1 p-16 flex-col justify-between relative overflow-hidden bg-gradient-to-br from-blue-600/10 to-transparent">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-12">
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/40">
                <Microscope className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-white tracking-tighter">ESE <span className="text-blue-400">AG</span></span>
            </div>
            
            <h2 className="text-6xl font-bold text-white mb-6 leading-[1.1]">
              Precisión en <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
                cada registro.
              </span>
            </h2>
            <p className="text-blue-100/60 text-lg max-w-md leading-relaxed">
              Sistema integral de gestión para laboratorios de metrología. Control de equipos, calibraciones y reportes en tiempo real.
            </p>
          </div>

          <div className="relative z-10 pt-10 border-t border-white/10">
             <div className="flex gap-8">
                <div>
                    <p className="text-white font-bold text-xl">100%</p>
                    <p className="text-white/40 text-xs uppercase tracking-widest">Trazabilidad</p>
                </div>
                <div>
                    <p className="text-white font-bold text-xl">ISO</p>
                    <p className="text-white/40 text-xs uppercase tracking-widest">Estándares</p>
                </div>
             </div>
          </div>
        </div>

        {/* PANEL DERECHO: Formulario */}
        <div className="flex-1 p-8 sm:p-14 bg-white/[0.02]">
          <div className="max-w-md mx-auto">
            <header className="mb-10">
              <h3 className="text-3xl font-bold text-white mb-2">Crear perfil</h3>
              <p className="text-white/40">Introduce tus credenciales de acceso</p>
            </header>

            <form onSubmit={handleRegister} className="space-y-6">
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
                
                {/* Input Nombre */}
                <motion.div variants={itemVariants} className="group">
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Nombre Completo</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                    <input 
                      type="text" 
                      value={nombre} 
                      onChange={(e) => setNombre(e.target.value)} 
                      className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all" 
                      placeholder="Ej. Juan Pérez" required 
                    />
                  </div>
                </motion.div>

                {/* Input Correo */}
                <motion.div variants={itemVariants} className="group">
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                    <input 
                      type="email" 
                      value={correo} 
                      onChange={(e) => setCorreo(e.target.value)} 
                      className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all" 
                      placeholder="usuario@ese-ag.com" required 
                    />
                  </div>
                </motion.div>

                {/* Input Password */}
                <motion.div variants={itemVariants} className="group">
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all" 
                      placeholder="••••••••" required 
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {/* Password Strength Indicator */}
                  {password.length > 0 && (
                    <div className="flex gap-1 mt-2 px-1">
                        {[1, 2, 3].map((level) => (
                            <div key={level} className={`h-1 flex-1 rounded-full transition-all duration-500 ${passwordStrength >= level ? (passwordStrength === 1 ? 'bg-red-500' : passwordStrength === 2 ? 'bg-yellow-500' : 'bg-green-500') : 'bg-white/10'}`} />
                        ))}
                    </div>
                  )}
                </motion.div>

                {/* Select Puesto */}
                <motion.div variants={itemVariants} className="group">
                  <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Puesto de Trabajo</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                    <select 
                      value={puesto} 
                      onChange={(e) => setPuesto(e.target.value as any)} 
                      className="appearance-none w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all cursor-pointer" 
                      required
                    >
                      <option value="" disabled className="bg-[#1a1f2e]">Selecciona...</option>
                      <option value="Metrólogo" className="bg-[#1a1f2e]">Metrólogo</option>
                      <option value="Calidad" className="bg-[#1a1f2e]">Calidad</option>
                      <option value="Logistica" className="bg-[#1a1f2e]">Logística</option>
                      <option value="Administrativo" className="bg-[#1a1f2e]">Administrativo</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 pointer-events-none" />
                  </div>
                </motion.div>
              </motion.div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 flex items-center gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
                  </motion.div>
                )}
                {success && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-2xl p-4 flex items-center gap-3 text-sm">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" /> {success}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button 
                type="submit" 
                disabled={isLoading}
                whileHover={{ scale: 1.01, boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)" }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3 overflow-hidden relative group"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Registrar Usuario</span>
                    <ShieldCheck className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </motion.button>
              
              <div className="text-center">
                <button 
                  type="button" 
                  onClick={onNavigateToLogin} 
                  className="text-white/40 hover:text-white transition-colors text-sm font-medium flex items-center justify-center mx-auto gap-2 group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
                  ¿Ya tienes acceso? <span className="text-blue-400">Inicia sesión</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};