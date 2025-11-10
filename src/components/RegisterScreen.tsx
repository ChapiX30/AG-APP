import React, { useState, useEffect, useRef } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import { Eye, EyeOff, Lock, User, Mail, Briefcase, ChevronDown, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import labLogo from '../assets/lab_logo.png'; // Asegúrate de tener este logo o elimínalo si no lo usas aquí

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [puesto, setPuesto] = useState<"" | "Metrólogo" | "Calidad" | "Logistica" | "Administrativo">("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  // Detectar si el formulario es válido para animar el botón
  const isFormReady = nombre.length > 0 && correo.includes('@') && password.length >= 6 && puesto !== "";

  // --- EFECTO TILT 3D (Igual que LoginScreen) ---
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 });
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 });
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["8deg", "-8deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-8deg", "8deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");

    if (!puesto) { setError("Selecciona tu puesto de trabajo."); return; }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
      // Guardar datos adicionales en Firestore
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        nombre, correo, puesto, creado: new Date(), uid: userCredential.user.uid
      });
      setSuccess("¡Cuenta creada con éxito!");
      setTimeout(() => onNavigateToLogin(), 1500);
    } catch (err: any) {
      // Simplificación de manejo de errores para este ejemplo
      if (err.code === 'auth/email-already-in-use') setError('Este correo ya está registrado.');
      else if (err.code === 'auth/weak-password') setError('La contraseña es muy débil (mín. 6 caracteres).');
      else setError('Error al registrar. Intenta nuevamente.');
      setIsLoading(false);
    }
  };

  // Componente reutilizable para envolver inputs con el efecto de brillo
  const InputWrapper = ({ id, children, icon: Icon }: { id: string, children: React.ReactNode, icon: any }) => (
    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="relative group">
      <motion.div 
        animate={{ opacity: focused === id ? 1 : 0, scale: focused === id ? 1.02 : 0.98 }} 
        transition={{ duration: 0.3 }} 
        className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-2xl blur opacity-0 transition duration-1000 group-hover:opacity-30 group-hover:duration-200" 
      />
      <div className="relative">
        <Icon className={`absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${focused === id ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]' : 'text-slate-500'}`} />
        {children}
      </div>
    </motion.div>
  );

  return (
    <div 
      className="min-h-screen w-full relative overflow-hidden bg-[#030712] text-white flex items-center justify-center perspective-1000 py-10"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      ref={ref}
    >
      {/* Fondo Animado idéntico a Login */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 90, 0] }} transition={{ duration: 50, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-[20%] -left-[20%] w-[80vw] h-[80vw] bg-blue-700/10 rounded-full blur-[140px] mix-blend-screen" />
        <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, -90, 0] }} transition={{ duration: 45, repeat: Infinity, ease: "easeInOut" }} className="absolute -bottom-[30%] -right-[20%] w-[80vw] h-[80vw] bg-violet-800/10 rounded-full blur-[160px] mix-blend-screen" />
      </div>
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />

      <motion.div 
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
        className="w-full max-w-[500px] relative z-10 mx-4"
      >
        <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/[0.06] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] p-8 sm:p-10 rounded-[36px] relative overflow-hidden">
          
          <div className="text-center mb-8 relative z-10" style={{ transform: "translateZ(30px)" }}>
            {/* Opcional: Si quieres usar el logo también aquí */}
            {/* <img src={labLogo} alt="Logo" className="h-16 mx-auto mb-4 opacity-80" /> */}
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">Crear Cuenta</h1>
            <p className="text-slate-400">Únete al equipo de ESE-AG</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5 relative z-10" style={{ transform: "translateZ(20px)" }}>
            
            <InputWrapper id="nombre" icon={User}>
              <input 
                type="text" value={nombre} onChange={e => setNombre(e.target.value)} onFocus={() => setFocused('nombre')} onBlur={() => setFocused(null)} placeholder="Nombre completo" required
                className="w-full h-14 sm:h-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all"
              />
            </InputWrapper>

            <InputWrapper id="email" icon={Mail}>
              <input 
                type="email" value={correo} onChange={e => setCorreo(e.target.value)} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} placeholder="Correo electrónico" required
                className="w-full h-14 sm:h-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all"
              />
            </InputWrapper>

            <InputWrapper id="puesto" icon={Briefcase}>
               <select
                  value={puesto} onChange={(e) => setPuesto(e.target.value as any)} onFocus={() => setFocused('puesto')} onBlur={() => setFocused(null)} required
                  className="appearance-none w-full h-14 sm:h-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-10 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.05] transition-all [&>option]:bg-slate-900 [&>option]:text-white"
                  style={{ color: puesto ? 'white' : 'rgb(71 85 105)' }} // slate-600 si está vacío
                >
                  <option value="" disabled>Selecciona tu puesto</option>
                  <option value="Metrólogo">Metrólogo</option>
                  <option value="Calidad">Calidad</option>
                  <option value="Logistica">Logística</option>
                  <option value="Administrativo">Administrativo</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            </InputWrapper>

            <InputWrapper id="password" icon={Lock}>
              <input 
                type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} placeholder="Contraseña (mín. 6 caracteres)" required minLength={6}
                className="w-full h-14 sm:h-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-14 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.05] transition-all"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-1">
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </InputWrapper>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-400 text-center text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                  {error}
                </motion.div>
              )}
              {success && (
                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-green-400 text-center text-sm bg-green-500/10 border border-green-500/20 p-3 rounded-xl">
                  {success}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="pt-2">
              <motion.button
                type="submit" disabled={isLoading || success !== ""}
                animate={isFormReady && !isLoading && !success ? {
                  scale: [1, 1.02, 1],
                  boxShadow: ["0 0 0 0px rgba(79, 70, 229, 0)", "0 0 20px 2px rgba(79, 70, 229, 0.3)", "0 0 0 0px rgba(79, 70, 229, 0)"]
                } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="w-full h-16 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-2xl font-bold text-lg text-white relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_0_60px_-10px_rgba(79,70,229,0.7)] active:scale-[0.98]"
              >
                <span className="relative flex items-center justify-center gap-3 z-10">
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                  ) : success ? (
                    "¡Bienvenido!"
                  ) : (
                    <>Crear Cuenta <ArrowRight className="group-hover:translate-x-1 transition-transform" /></>
                  )}
                </span>
              </motion.button>
            </motion.div>
          </form>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-8 text-center">
            <button onClick={onNavigateToLogin} className="text-slate-400 hover:text-white transition-colors text-sm py-2">
              ¿Ya tienes una cuenta? <span className="text-blue-400 font-semibold ml-1 hover:underline">Inicia Sesión</span>
            </button>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
};