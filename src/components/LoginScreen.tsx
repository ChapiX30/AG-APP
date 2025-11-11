import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ScanFace, X, CheckCircle, AlertCircle, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';
import labLogo from '../assets/lab_logo.png';

// --- INTERFACES Y UTILIDADES ---
interface UserGreeting {
  name: string;
  initial: string;
  photoUrl?: string | null;
}

const fetchUserProfile = async (email: string): Promise<UserGreeting | null> => {
  if (!email || !email.includes('@') || email.length < 5) return null;
  try {
    const db = getFirestore();
    const userQuery = query(collection(db, 'usuarios'), where('email', '==', email.toLowerCase()), limit(1));
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
  } catch (e) { console.error("Error fetching user profile:", e); }
  return null;
};

const getFriendlyErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/user-not-found': return 'No existe una cuenta con este correo electrónico.';
    case 'auth/wrong-password': return 'La contraseña es incorrecta.';
    case 'auth/invalid-email': return 'El formato del correo electrónico no es válido.';
    case 'auth/user-disabled': return 'Esta cuenta ha sido deshabilitada.';
    case 'auth/too-many-requests': return 'Demasiados intentos fallidos. Intenta más tarde.';
    case 'auth/network-request-failed': return 'Error de conexión. Verifica tu internet.';
    case 'auth/invalid-credential': return 'Credenciales inválidas. Verifica tu correo y contraseña.';
    default: return 'Ocurrió un error inesperado. Intenta nuevamente.';
  }
};

const getTimeBasedGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

export const LoginScreen: React.FC<{ onNavigateToRegister: () => void }> = ({ onNavigateToRegister }) => {
  // --- ESTADOS DEL FORMULARIO ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);

  // --- ESTADOS DE UX/UI ---
  const [user, setUser] = useState<UserGreeting | null>(null);
  const [fetchingUser, setFetchingUser] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ success: boolean; msg: string } | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  // --- HOOKS Y REFS ---
  const { login } = useAuth();
  const { navigateTo } = useNavigation();
  const lastGreetedUser = useRef<string | null>(null);
  const audioUnlocked = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedFetchRef = useRef<NodeJS.Timeout | null>(null);
  const isFormReady = email.length > 0 && password.length > 0;

  // --- EFECTO TILT 3D ---
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 });
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 });
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["8deg", "-8deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-8deg", "8deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  // --- AUDIO ENGINE ---
  const unlockAudioEngine = () => {
    if (!audioUnlocked.current && 'speechSynthesis' in window) {
      const empty = new SpeechSynthesisUtterance('');
      empty.volume = 0;
      window.speechSynthesis.speak(empty);
      audioUnlocked.current = true;
    }
  };

const speakGreeting = (userName: string) => {
  if (!voiceEnabled || lastGreetedUser.current === email.toLowerCase() || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const salutation = getTimeBasedGreeting();
  const utterance = new SpeechSynthesisUtterance(`${salutation}, ${userName}. Bienvenido de nuevo.`);
  const voices = window.speechSynthesis.getVoices();
  const bestVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Google') || v.name.includes('Microsoft')))
    || voices.find(v => v.lang === 'es-MX')
    || voices.find(v => v.lang.startsWith('es'));
  
  if (bestVoice) {
    utterance.voice = bestVoice;
    utterance.rate = 1.3; // ⚡ Velocidad mejorada - más natural y dinámica
    utterance.pitch = 1.1;
  } else {
    utterance.lang = 'es-MX';
    utterance.rate = 1.3; // ⚡ Importante: también aquí para voces por defecto
  }
  utterance.volume = 0.8;
  setTimeout(() => window.speechSynthesis.speak(utterance), 100);
  lastGreetedUser.current = email.toLowerCase();
};


  // --- LÓGICA DE FETCH REFACTORIZADA ---
  const runFetchLogic = async (emailToFetch: string) => {
    if (fetchingUser || lastGreetedUser.current === emailToFetch.toLowerCase()) return;
    setFetchingUser(true);
    const foundUser = await fetchUserProfile(emailToFetch);
    setUser(foundUser);
    if (foundUser?.name) {
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => speakGreeting(foundUser.name);
      } else {
        speakGreeting(foundUser.name);
      }
    }
    setFetchingUser(false);
  };

  // --- EFECTOS ---
  useEffect(() => {
    if (!email) {
      setUser(null);
      lastGreetedUser.current = null;
      if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
      return;
    }

    if (debouncedFetchRef.current) {
      clearTimeout(debouncedFetchRef.current);
    }

    debouncedFetchRef.current = setTimeout(() => {
      runFetchLogic(email);
    }, 500);

    return () => {
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
    };
  }, [email]);

  // --- HANDLERS ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); 
    setError('');
    try {
      const success = await login(email, password);
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
    if (!email || !email.includes('@')) {
      setResetStatus({ success: false, msg: 'Por favor ingresa un correo válido.' });
      return;
    }

    try {
      await sendPasswordResetEmail(getAuth(), email);
      setResetStatus({ success: true, msg: `Enlace de recuperación enviado a ${email}` });
      setTimeout(() => { setShowResetModal(false); setResetStatus(null); }, 3000);
    } catch (err: any) {
      setResetStatus({ success: false, msg: getFriendlyErrorMessage(err.code) });
    }
  };

  // --- RENDER ---
  return (
    <div 
      className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' : 'bg-gradient-to-br from-slate-100 via-white to-slate-100'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      onClick={unlockAudioEngine}
      ref={containerRef}
    >
      {/* Background FX */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className={`absolute w-96 h-96 ${darkMode ? 'bg-blue-500/10' : 'bg-blue-500/20'} rounded-full blur-3xl`}
          animate={{ x: [-100, 100], y: [-50, 50] }}
          transition={{ duration: 20, repeat: Infinity, repeatType: "reverse" }}
        />
        <motion.div 
          className={`absolute right-0 w-96 h-96 ${darkMode ? 'bg-violet-500/10' : 'bg-violet-500/20'} rounded-full blur-3xl`}
          animate={{ x: [100, -100], y: [50, -50] }}
          transition={{ duration: 15, repeat: Infinity, repeatType: "reverse" }}
        />
      </div>

      {/* Voice & Theme Toggle */}
      <div className="absolute top-6 right-6 flex gap-3 z-50">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className={`p-3 rounded-xl ${darkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-200/80 hover:bg-slate-300/80'} border ${darkMode ? 'border-white/10' : 'border-slate-300'} transition-all`}
          aria-label={voiceEnabled ? "Desactivar voz" : "Activar voz"}
        >
          {voiceEnabled ? <Volume2 className={darkMode ? "text-blue-400" : "text-blue-600"} size={20} /> : <VolumeX className={darkMode ? "text-slate-500" : "text-slate-600"} size={20} />}
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setDarkMode(!darkMode)}
          className={`p-3 rounded-xl ${darkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-200/80 hover:bg-slate-300/80'} border ${darkMode ? 'border-white/10' : 'border-slate-300'} transition-all`}
          aria-label={darkMode ? "Modo claro" : "Modo oscuro"}
        >
          {darkMode ? '☀️' : '🌙'}
        </motion.button>
      </div>

      {/* Main Card */}
      <motion.div
        className={`relative w-full max-w-md ${darkMode ? 'bg-white/[0.02]' : 'bg-white/80'} backdrop-blur-2xl rounded-3xl shadow-2xl ${darkMode ? 'border border-white/[0.05]' : 'border border-slate-200'} p-8`}
        style={{ 
          rotateX, 
          rotateY,
          transformStyle: "preserve-3d"
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header & Logo */}
        <div className="flex flex-col items-center mb-8" style={{ transform: "translateZ(40px)" }}>
          <motion.img 
            src={labLogo} 
            alt="Lab Logo" 
            className="w-20 h-20 mb-4"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          />
          <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'} mb-2`}>Bienvenido</h1>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} flex items-center gap-2`}>
            <Lock size={14} />
            Portal de Acceso Seguro
          </p>
        </div>

        {/* User Greeting Card */}
        <AnimatePresence mode="wait">
          {user && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`mb-6 p-4 rounded-2xl ${darkMode ? 'bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20' : 'bg-gradient-to-r from-blue-100 to-violet-100 border border-blue-300'}`}
              style={{ transform: "translateZ(60px)" }}
            >
              <div className="flex items-center gap-3">
                {user.photoUrl ? (
                  <img 
                    src={user.photoUrl} 
                    alt={user.name}
                    className="w-12 h-12 rounded-full border-2 border-blue-400 object-cover"
                    onError={(e) => (e.currentTarget.style.display='none')}
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-full ${darkMode ? 'bg-gradient-to-br from-blue-500 to-violet-600' : 'bg-gradient-to-br from-blue-400 to-violet-500'} flex items-center justify-center text-white font-bold text-lg`}>
                    {user.initial}
                  </div>
                )}
                <div>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Hola de nuevo</p>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{user.name}</p>
                </div>
                <ScanFace className={`ml-auto ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} size={20} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5" style={{ transform: "translateZ(40px)" }}>
          {/* Email Input */}
          <div className="relative">
            <Mail 
              className={`absolute left-5 top-1/2 -translate-y-1/2 z-10 transition-colors ${
                focusedField === 'email' 
                  ? (darkMode ? 'text-blue-400' : 'text-blue-600')
                  : (darkMode ? 'text-slate-600' : 'text-slate-400')
              }`} 
              size={20} 
            />
            <motion.input
              whileFocus={{ scale: 1.01 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => { setFocusedField('email'); unlockAudioEngine(); }}
              onBlur={() => setFocusedField(null)}
              placeholder="Correo electrónico"
              aria-label="Correo electrónico"
              className={`w-full h-16 ${darkMode ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-100 border-slate-300'} border rounded-2xl pl-14 pr-12 text-lg ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'} focus:outline-none ${darkMode ? 'focus:border-blue-500/50 focus:bg-white/[0.07]' : 'focus:border-blue-500 focus:bg-white'} transition-all relative z-10`}
            />
            {fetchingUser && <div className={`absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 border-2 ${darkMode ? 'border-blue-400' : 'border-blue-600'} border-t-transparent rounded-full animate-spin`} />}
          </div>

          {/* Password Input */}
          <div className="relative">
            <Lock 
              className={`absolute left-5 top-1/2 -translate-y-1/2 z-10 transition-colors ${
                focusedField === 'password' 
                  ? (darkMode ? 'text-violet-400' : 'text-violet-600')
                  : (darkMode ? 'text-slate-600' : 'text-slate-400')
              }`} 
              size={20} 
            />
            <motion.input
              whileFocus={{ scale: 1.01 }}
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => {
                setFocusedField('password');
                unlockAudioEngine();
                if (email && !user && !fetchingUser) {
                  if (debouncedFetchRef.current) {
                    clearTimeout(debouncedFetchRef.current);
                  }
                  runFetchLogic(email);
                }
              }}
              onBlur={() => setFocusedField(null)}
              placeholder="Contraseña"
              aria-label="Contraseña"
              className={`w-full h-16 ${darkMode ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-100 border-slate-300'} border rounded-2xl pl-14 pr-14 text-lg ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'} focus:outline-none ${darkMode ? 'focus:border-violet-500/50 focus:bg-white/[0.07]' : 'focus:border-violet-500 focus:bg-white'} transition-all relative z-10`}
            />
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              type="button" 
              onClick={() => setShowPass(!showPass)} 
              aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"} 
              className={`absolute right-5 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'} transition-colors z-20 p-1 outline-none`}
            >
              {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
            </motion.button>
          </div>

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <button 
              type="button" 
              onClick={() => setShowResetModal(true)} 
              className={`text-sm font-medium ${darkMode ? 'text-slate-400 hover:text-blue-400' : 'text-slate-600 hover:text-blue-600'} transition-colors outline-none focus-visible:underline`}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {/* Error Message with Attempts Counter */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`p-4 rounded-xl ${darkMode ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-300'} flex items-start gap-3`}
              >
                <AlertCircle className={darkMode ? "text-red-400" : "text-red-600"} size={20} />
                <div className="flex-1">
                  <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
                  {loginAttempts >= 3 && (
                    <p className={`text-xs ${darkMode ? 'text-red-400' : 'text-red-600'} mt-1`}>
                      Has intentado {loginAttempts} veces. Considera recuperar tu contraseña.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit Button */}
          <motion.button
            whileHover={isFormReady && !isLoading ? { scale: 1.02, boxShadow: darkMode ? "0 0 30px rgba(59, 130, 246, 0.3)" : "0 0 20px rgba(59, 130, 246, 0.4)" } : {}}
            whileTap={isFormReady && !isLoading ? { scale: 0.98 } : {}}
            type="submit"
            disabled={!isFormReady || isLoading}
            className={`w-full h-14 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 transition-all relative overflow-hidden ${
              isFormReady && !isLoading
                ? 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 shadow-lg'
                : darkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <div className={`w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin`} />
                Accediendo...
              </>
            ) : (
              <>
                Iniciar Sesión
                <ArrowRight size={20} />
              </>
            )}
          </motion.button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center space-y-3">
          <p className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-500'} flex items-center justify-center gap-2`}>
            <CheckCircle size={14} />
            Acceso Seguro Verificado
          </p>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            ¿No tienes cuenta?{' '}
            <button 
              type="button" 
              onClick={onNavigateToRegister} 
              className={`font-semibold ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} transition-colors outline-none focus-visible:underline`}
            >
              Regístrate aquí
            </button>
          </p>
        </div>
      </motion.div>

      {/* --- MODAL OLVIDÉ CONTRASEÑA --- */}
      <AnimatePresence>
        {showResetModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 ${darkMode ? 'bg-black/60' : 'bg-black/40'} backdrop-blur-sm z-50`}
              onClick={() => setShowResetModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md ${darkMode ? 'bg-slate-900' : 'bg-white'} rounded-3xl shadow-2xl p-8 z-50 ${darkMode ? 'border border-white/10' : 'border border-slate-200'}`}
            >
              <button 
                onClick={() => setShowResetModal(false)} 
                className={`absolute right-4 top-4 ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'} p-1 transition-colors`}
                aria-label="Cerrar modal"
              >
                <X size={24} />
              </button>
              
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'} mb-2`}>Recuperar Contraseña</h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} mb-6`}>Te enviaremos un enlace para restablecerla.</p>
              
              <form onSubmit={handlePasswordReset} className="space-y-5">
                <div className="relative">
                  <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Tu correo electrónico"
                    className={`w-full h-12 ${darkMode ? 'bg-white/[0.05] border-white/[0.1]' : 'bg-slate-100 border-slate-300'} border rounded-xl pl-12 pr-4 ${darkMode ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'} focus:outline-none ${darkMode ? 'focus:border-blue-500/50' : 'focus:border-blue-500'} transition-all`}
                    autoFocus
                    aria-label="Correo para recuperación"
                  />
                </div>

                <AnimatePresence>
                  {resetStatus && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`p-4 rounded-xl flex items-start gap-3 ${
                        resetStatus.success 
                          ? (darkMode ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-300')
                          : (darkMode ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-300')
                      }`}
                    >
                      {resetStatus.success ? <CheckCircle className={darkMode ? "text-green-400" : "text-green-600"} size={20} /> : <AlertCircle className={darkMode ? "text-red-400" : "text-red-600"} size={20} />}
                      <p className={`text-sm ${resetStatus.success ? (darkMode ? 'text-green-300' : 'text-green-700') : (darkMode ? 'text-red-300' : 'text-red-700')}`}>
                        {resetStatus.msg}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold rounded-xl transition-all shadow-lg"
                >
                  Enviar Enlace
                </motion.button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
