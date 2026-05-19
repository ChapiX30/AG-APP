import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ScanFace, X, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate } from "framer-motion";
import { sendPasswordResetEmail } from "firebase/auth";
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../utils/firebase'; 
import labLogo from '../assets/lab_logo.png'; // <-- TU LOGO ESTÁ DE VUELTA

interface UserGreeting {
  name: string;
  initial: string;
  photoUrl?: string | null;
}

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const fetchUserProfile = async (email: string): Promise<UserGreeting | null> => {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !isValidEmail(cleanEmail)) return null;

  try {
    const userQuery = query(collection(db, 'usuarios'), where('email', '==', cleanEmail), limit(1));
    const snapshot = await getDocs(userQuery);
    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      const name = userData.nombre || userData.name || 'Usuario';
      return {
        name,
        initial: name.charAt(0).toUpperCase(),
        photoUrl: userData.photoUrl || userData.photoURL || null
      };
    }
  } catch (e) { 
    console.error("Error fetching user profile:", e); 
  }
  return null;
};

const getFriendlyErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/user-not-found': return 'No existe una cuenta con este correo electrónico.';
    case 'auth/wrong-password': return 'La contraseña es incorrecta.';
    case 'auth/invalid-email': return 'El formato del correo electrónico no es válido.';
    case 'auth/too-many-requests': return 'Demasiados intentos fallidos. Intenta más tarde.';
    case 'auth/invalid-credential': return 'Credenciales inválidas. Verifica tu correo y contraseña.';
    default: return 'Ocurrió un error inesperado. Intenta nuevamente.';
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
};

export const LoginScreen: React.FC<{ onNavigateToRegister: () => void }> = ({ onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);

  const [user, setUser] = useState<UserGreeting | null>(null);
  const [fetchingUser, setFetchingUser] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ success: boolean; msg: string } | null>(null);

  const { login } = useAuth();
  const { navigateTo } = useNavigation();
  const lastGreetedUser = useRef<string | null>(null);
  const debouncedFetchRef = useRef<NodeJS.Timeout | null>(null);
  const userCache = useRef<Record<string, UserGreeting | null>>({});

  const isFormReady = email.trim().length > 0 && password.length > 0;

  // --- EFECTOS DE CURSOR INTERACTIVO (SPOTLIGHT) ---
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const runFetchLogic = async (emailToFetch: string) => {
    const emailKey = emailToFetch.trim().toLowerCase();
    if (!isValidEmail(emailKey)) { setUser(null); return; }
    if (userCache.current[emailKey] !== undefined) {
      const cachedUser = userCache.current[emailKey];
      setUser(cachedUser);
      if (cachedUser) lastGreetedUser.current = emailKey;
      return;
    }
    if (fetchingUser || lastGreetedUser.current === emailKey) return;
    
    setFetchingUser(true);
    const foundUser = await fetchUserProfile(emailKey);
    userCache.current[emailKey] = foundUser;
    setUser(foundUser);
    if (foundUser?.name) lastGreetedUser.current = emailKey;
    setFetchingUser(false);
  };

  useEffect(() => {
    if (!email.trim()) {
      setUser(null);
      lastGreetedUser.current = null;
      if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
      return;
    }
    if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    debouncedFetchRef.current = setTimeout(() => runFetchLogic(email), 600);
    return () => { if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current); };
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); 
    setError('');
    try {
      const cleanEmail = email.trim().toLowerCase();
      const success = await login(cleanEmail, password);
      if (success) {
        navigateTo('menu');
      } else {
        setLoginAttempts(prev => prev + 1);
        setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
      }
    } catch (err: any) {
      setLoginAttempts(prev => prev + 1);
      setError(getFriendlyErrorMessage(err.code || ''));
    }
    setIsLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      setResetStatus({ success: false, msg: 'Por favor ingresa un correo válido.' });
      return;
    }
    setIsResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetStatus({ success: true, msg: `Enlace enviado a ${cleanEmail}` });
      setTimeout(() => { setShowResetModal(false); setResetStatus(null); }, 3000);
    } catch (err: any) {
      setResetStatus({ success: false, msg: getFriendlyErrorMessage(err.code) });
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4 bg-[#030712]"> {/* Fondo más profundo, estilo Vercel */}
      
      {/* 1. FONDO TÉCNICO AVANZADO "METROLOGY MATRIX" */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Cuadrícula técnica móvil */}
        <motion.div 
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)`, backgroundSize: '40px 40px' }}
          animate={{ backgroundPositionY: ['0px', '40px'], backgroundPositionX: ['0px', '40px'] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        />
        
        {/* Orbes de luz con movimiento suave */}
        <motion.div
          animate={{ x: [0, 100, 0], y: [0, 50, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[20%] -left-[10%] w-[50rem] h-[50rem] bg-blue-600/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -80, 0], y: [0, -60, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[40%] -right-[10%] w-[40rem] h-[40rem] bg-indigo-500/10 rounded-full blur-[100px]"
        />

        {/* Línea Láser de Escaneo (Efecto de calibración) */}
        <motion.div
          animate={{ top: ['-10%', '110%'] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent shadow-[0_0_15px_rgba(59,130,246,0.8)] z-0"
        />
      </div>

      {/* CONTENEDOR PRINCIPAL CON EFECTO SPOTLIGHT */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} // Curva de animación super suave
        onMouseMove={handleMouseMove}
        className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row-reverse rounded-[2.5rem] overflow-hidden bg-[#0f172a]/80 backdrop-blur-2xl border border-slate-800 shadow-[0_0_80px_rgba(15,23,42,1)] group"
      >
        {/* Efecto Spotlight que sigue al cursor dentro de la tarjeta */}
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-[2.5rem] opacity-0 transition duration-300 group-hover:opacity-100 z-50"
          style={{
            background: useMotionTemplate`
              radial-gradient(
                600px circle at ${mouseX}px ${mouseY}px,
                rgba(59, 130, 246, 0.08),
                transparent 80%
              )
            `,
          }}
        />

        {/* PANEL DERECHO: Branding Premium */}
        <div className="hidden lg:flex flex-1 p-16 flex-col justify-center items-end relative overflow-hidden bg-gradient-to-bl from-blue-900/20 via-transparent to-transparent border-l border-slate-800/50">
          
          {/* LOGO LEVITANDO */}
          <motion.div 
            animate={{ y: [-10, 10, -10] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="mb-12 relative"
          >
            {/* Resplandor detrás del logo */}
            <div className="absolute inset-0 bg-blue-500/20 blur-[50px] rounded-full scale-150" />
            <img 
              src={labLogo} 
              alt="Logo AG-APP" 
              className="w-48 h-auto object-contain relative z-10 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]" 
            />
          </motion.div>
          
          <div className="relative z-10 text-right">
            <h2 className="text-5xl font-extrabold text-white mb-6 leading-tight tracking-tight">
              Plataforma de <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-blue-400 to-indigo-300">
                Calibración.
              </span>
            </h2>
            <p className="text-slate-400 text-lg max-w-sm ml-auto leading-relaxed font-light">
              Sistema integral de gestión metrológica ESE AG. Acceso restringido para personal autorizado.
            </p>
          </div>

          {/* Indicadores técnicos estéticos */}
          <div className="absolute bottom-16 right-16 flex gap-6 opacity-40">
             <div className="text-right">
                <p className="text-white font-mono text-xl">v2.0.4</p>
                <p className="text-blue-400 text-[10px] uppercase tracking-[0.2em]">AG-APP Build</p>
             </div>
          </div>
        </div>

        {/* PANEL IZQUIERDO: Formulario de Login */}
        <div className="flex-1 p-8 sm:p-14 relative z-20">
          <div className="max-w-md mx-auto">
            <header className="mb-10">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-6 shadow-inner">
                <Lock className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">Iniciar Sesión</h3>
              <p className="text-slate-400 font-light">Ingresa tus credenciales para acceder al sistema</p>
            </header>

            {/* TARJETA DE SALUDO DINÁMICA */}
            <div className="h-20 mb-6">
              <AnimatePresence mode="wait">
                {user && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="p-4 rounded-2xl bg-gradient-to-r from-slate-800/50 to-slate-900/50 border border-slate-700/50 flex items-center gap-4 shadow-xl backdrop-blur-md"
                  >
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt={user.name} className="w-12 h-12 rounded-full border-2 border-blue-500/50 object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center text-white font-bold text-lg shadow-inner border border-white/10">
                        {user.initial}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold mb-0.5">Detectado</p>
                      <p className="font-semibold text-white truncate text-sm">{user.name}</p>
                    </div>
                    <ScanFace className="text-slate-500 w-6 h-6" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">
                
                <motion.div variants={itemVariants} className="group/input">
                  <label className="block text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2 ml-1">Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/input:text-blue-400 transition-colors z-10" />
                    <input 
                      type="email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      disabled={isLoading}
                      className="w-full pl-12 pr-10 py-4 bg-slate-900/50 border border-slate-700 rounded-2xl text-white focus:outline-none focus:border-blue-500/70 focus:bg-slate-800/80 transition-all disabled:opacity-50 relative z-0 shadow-inner" 
                      placeholder="usuario@ese-ag.com" required 
                    />
                    {fetchingUser && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin z-10" />}
                  </div>
                </motion.div>

                <motion.div variants={itemVariants} className="group/input">
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-slate-400 text-xs font-semibold uppercase tracking-widest">Contraseña</label>
                    <button type="button" onClick={() => setShowResetModal(true)} disabled={isLoading} className="text-xs text-blue-400 hover:text-blue-300 transition-colors outline-none focus-visible:underline disabled:opacity-50">
                      ¿Problemas de acceso?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/input:text-blue-400 transition-colors z-10" />
                    <input 
                      type={showPass ? 'text' : 'password'} 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      disabled={isLoading}
                      className="w-full pl-12 pr-12 py-4 bg-slate-900/50 border border-slate-700 rounded-2xl text-white focus:outline-none focus:border-blue-500/70 focus:bg-slate-800/80 transition-all disabled:opacity-50 relative z-0 shadow-inner" 
                      placeholder="••••••••" required 
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} disabled={isLoading} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors disabled:opacity-50 z-10">
                      {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </motion.div>
              </motion.div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 flex items-start gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p>{error}</p>
                      {loginAttempts >= 3 && <p className="text-xs text-red-400/70 mt-1">Has intentado {loginAttempts} veces. Considera recuperar tu contraseña.</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button 
                type="submit" 
                disabled={!isFormReady || isLoading}
                whileHover={isFormReady && !isLoading ? { scale: 1.01 } : {}}
                whileTap={isFormReady && !isLoading ? { scale: 0.98 } : {}}
                className={`w-full font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 overflow-hidden relative group/btn ${
                  isFormReady && !isLoading ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="relative z-10">Autenticar Usuario</span>
                    <ArrowRight className={`w-5 h-5 relative z-10 ${isFormReady ? 'group-hover/btn:translate-x-1' : ''} transition-transform`} />
                  </>
                )}
              </motion.button>
              
              <div className="text-center pt-4">
                <button 
                  type="button" 
                  onClick={onNavigateToRegister} 
                  disabled={isLoading}
                  className="text-slate-400 hover:text-white transition-colors text-sm font-medium flex items-center justify-center mx-auto gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ¿Personal de nuevo ingreso? <span className="text-blue-400">Regístrate aquí</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> 
                </button>
              </div>
            </form>
          </div>
        </div>
      </motion.div>

      {/* MODAL RECUPERAR CONTRASEÑA */}
      <AnimatePresence>
        {showResetModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-[#030712]/90 backdrop-blur-sm z-50" onClick={() => !isResetLoading && setShowResetModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#0f172a] border border-slate-700 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.8)] p-8 z-50"
            >
              <button onClick={() => setShowResetModal(false)} disabled={isResetLoading} className="absolute right-5 top-5 text-slate-500 hover:text-white p-1 transition-colors disabled:opacity-50"><X size={20} /></button>
              
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Recuperar Acceso</h2>
              <p className="text-sm text-slate-400 mb-6 font-light">Te enviaremos las instrucciones a tu correo institucional.</p>
              
              <form onSubmit={handlePasswordReset} className="space-y-5">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isResetLoading}
                    placeholder="usuario@ese-ag.com"
                    className="w-full pl-12 pr-4 py-4 bg-slate-900/80 border border-slate-700 rounded-2xl text-white focus:outline-none focus:border-blue-500/70 transition-all disabled:opacity-50 shadow-inner" autoFocus
                  />
                </div>

                <AnimatePresence>
                  {resetStatus && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`p-4 rounded-xl flex items-start gap-3 border ${resetStatus.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      {resetStatus.success ? <CheckCircle size={20} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />}
                      <p className="text-sm">{resetStatus.msg}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={!isResetLoading ? { scale: 1.02 } : {}} whileTap={!isResetLoading ? { scale: 0.98 } : {}}
                  type="submit" disabled={isResetLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isResetLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Enviar Enlace"}
                </motion.button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};