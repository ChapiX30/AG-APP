import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ScanFace } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';
import labLogo from '../assets/lab_logo.png';

interface UserGreeting {
  name: string;
  initial: string;
  photoUrl?: string | null;
}

const fetchUserProfile = async (email: string): Promise<UserGreeting | null> => {
  if (!email || !email.includes('@') || email.length < 5) return null;
  try {
    const db = getFirestore();
    const q = query(collection(db, 'usuarios'), where('email', '==', email.toLowerCase()), limit(1));
    const s = await getDocs(q);
    if (!s.empty) {
      const d = s.docs[0].data();
      const name = d.nombre || d.name || 'Usuario';
      return { name, initial: name.charAt(0).toUpperCase(), photoUrl: d.photoUrl || d.photoURL || null };
    }
  } catch (e) { console.log(e); }
  return null;
};

export const LoginScreen: React.FC<{ onNavigateToRegister: () => void }> = ({ onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<UserGreeting | null>(null);
  const [fetching, setFetching] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  
  const { login } = useAuth();
  const { navigateTo } = useNavigation();

  const lastGreetedUser = useRef<string | null>(null);
  // NUEVO: Ref para saber si ya desbloqueamos el audio
  const audioUnlocked = useRef(false);
  const isFormReady = email.length > 0 && password.length > 0;

  // --- EFECTO TILT 3D ---
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

  // --- NUEVO: FUNCIÓN PARA DESBLOQUEAR AUDIO ---
  // Se llama en el primer onFocus o clic para satisfacer la política del navegador
  const unlockAudioEngine = () => {
    if (!audioUnlocked.current && 'speechSynthesis' in window) {
      const emptyUtterance = new SpeechSynthesisUtterance('');
      emptyUtterance.volume = 0; // Silencio total
      window.speechSynthesis.speak(emptyUtterance);
      audioUnlocked.current = true;
    }
  };

  const getBestSpanishVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    let bestVoice = voices.find(v => v.lang.startsWith('es') && (v.name.includes('Google') || v.name.includes('Microsoft')));
    if (!bestVoice) bestVoice = voices.find(v => v.lang === 'es-MX');
    if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('es'));
    return bestVoice || null;
  };

  useEffect(() => {
    if (!email) {
      setUser(null);
      lastGreetedUser.current = null;
      return;
    }

    const t = setTimeout(async () => {
      setFetching(true);
      const u = await fetchUserProfile(email);
      setUser(u);

      if (u && u.name && lastGreetedUser.current !== email.toLowerCase()) {
        if ('speechSynthesis' in window) {
          // Intentamos hablar solo si creemos que el audio está desbloqueado o si el usuario ya está interactuando
          if (window.speechSynthesis.getVoices().length === 0) {
             window.speechSynthesis.onvoiceschanged = () => speakGreeting(u.name);
          } else {
             speakGreeting(u.name);
          }
        }
      }
      setFetching(false);
    }, 500);

    return () => clearTimeout(t);
  }, [email]);

  const speakGreeting = (userName: string) => {
    if (lastGreetedUser.current === email.toLowerCase()) return;

    // Aseguramos que se cancele lo anterior
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(`Bienvenido de nuevo, ${userName}`);
    const bestVoice = getBestSpanishVoice();
    
    if (bestVoice) {
      utterance.voice = bestVoice;
      utterance.rate = 0.95; 
      utterance.pitch = 1.0;
    } else {
      utterance.lang = 'es-MX';
      utterance.rate = 0.9; 
    }
    
    utterance.volume = 0.8;
    // Pequeño delay para dar tiempo al navegador a registrar interacciones recientes
    setTimeout(() => {
       window.speechSynthesis.speak(utterance);
    }, 100);
    
    lastGreetedUser.current = email.toLowerCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true); setError('');
    if (await login(email, password)) navigateTo('menu');
    else setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
    setIsLoading(false);
  };

  const handlePasswordResetRequest = async () => {
    const emailToReset = email || prompt("Ingresa tu correo para recuperar contraseña:");
    if (emailToReset && emailToReset.includes('@')) {
      try {
        await sendPasswordResetEmail(getAuth(), emailToReset);
        alert(`✅ Correo de recuperación enviado a ${emailToReset}`);
      } catch (err: any) {
        alert("❌ Error: " + (err.code === 'auth/user-not-found' ? "Usuario no encontrado" : err.message));
      }
    }
  };

  return (
    // Agregamos unlockAudioEngine al contenedor principal por si hacen clic en cualquier lado
    <div 
      className="min-h-screen w-full relative overflow-hidden bg-[#030712] text-white flex items-center justify-center perspective-1000"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      onClick={unlockAudioEngine} // <--- INTENTO DE DESBLOQUEO GLOBAL
      ref={ref}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div animate={{ scale: [1, 1.15, 1], rotate: [0, 90, 0] }} transition={{ duration: 50, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-[20%] -left-[20%] w-[80vw] h-[80vw] bg-blue-700/15 rounded-full blur-[140px] mix-blend-screen" />
        <motion.div animate={{ scale: [1, 1.25, 1], rotate: [0, -90, 0] }} transition={{ duration: 45, repeat: Infinity, ease: "easeInOut" }} className="absolute -bottom-[30%] -right-[20%] w-[80vw] h-[80vw] bg-violet-800/15 rounded-full blur-[160px] mix-blend-screen" />
      </div>
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.04] mix-blend-overlay pointer-events-none" />

      <motion.div 
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.8 }}
        className="w-full max-w-[460px] relative z-10 mx-4"
      >
        <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/[0.06] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] p-8 sm:p-10 rounded-[36px] relative overflow-hidden">
          
          <div className="text-center mb-8 relative z-10" style={{ transform: "translateZ(30px)" }}>
            <motion.img initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} src={labLogo} alt="Logo" className="h-24 mx-auto mb-6 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]" />
            <h1 className="text-4xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">Bienvenido</h1>
            <p className="text-slate-400 font-medium">Portal de Acceso Seguro</p>
          </div>

          <AnimatePresence mode="wait">
            {user && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -20 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -20 }}
                className="mb-8"
                style={{ transform: "translateZ(40px)" }}
              >
                <div className="relative bg-gradient-to-r from-blue-950/40 to-slate-900/40 rounded-2xl p-4 border border-blue-500/20 flex items-center gap-5 overflow-hidden">
                  <motion.div animate={{ x: ['-100%', '200%'] }} transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: 1 }} className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/5 to-transparent w-1/2 pointer-events-none" />
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-white/10 shadow-2xl relative z-10 shrink-0">
                    {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display='none')} /> : <span className="text-2xl font-bold text-white">{user.initial}</span>}
                  </div>
                  <div className="flex-1 relative z-10 min-w-0">
                    <p className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">Hola de nuevo</p>
                    <h2 className="text-2xl font-bold text-white leading-tight break-words">{user.name}</h2>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10" style={{ transform: "translateZ(20px)" }}>
            <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="relative group">
              <motion.div animate={{ opacity: focused === 'email' ? 1 : 0, scale: focused === 'email' ? 1.02 : 0.98 }} transition={{ duration: 0.3 }} className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-violet-500 rounded-2xl blur opacity-0 transition duration-1000 group-hover:opacity-30 group-hover:duration-200" />
              <div className="relative">
                <Mail className={`absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${focused === 'email' ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]' : 'text-slate-500'}`} />
                <input 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  onFocus={() => {
                    setFocused('email');
                    unlockAudioEngine(); // <--- DESBLOQUEO AL HACER FOCO
                  }} 
                  onBlur={() => setFocused(null)} 
                  placeholder="Correo electrónico" required
                  className="w-full h-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-12 text-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.07] transition-all relative z-10"
                />
                {fetching && <div className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin z-20" />}
              </div>
            </motion.div>

            <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="relative group">
              <motion.div animate={{ opacity: focused === 'password' ? 1 : 0, scale: focused === 'password' ? 1.02 : 0.98 }} transition={{ duration: 0.3 }} className="absolute -inset-0.5 bg-gradient-to-r from-violet-500 to-pink-500 rounded-2xl blur opacity-0" />
              <div className="relative">
                <Lock className={`absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${focused === 'password' ? 'text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]' : 'text-slate-500'}`} />
                <input 
                  type={showPass ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  onFocus={() => {
                    setFocused('password');
                    unlockAudioEngine(); // <--- DESBLOQUEO TAMBIÉN AQUÍ
                  }}
                  onBlur={() => setFocused(null)} 
                  placeholder="Contraseña" required
                  className="w-full h-16 bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-14 text-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.07] transition-all relative z-10"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors z-20 p-1 outline-none">
                  {showPass ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex justify-end -mt-2">
              <button type="button" onClick={handlePasswordResetRequest} className="text-sm font-medium text-slate-400 hover:text-blue-400 transition-colors outline-none">¿Olvidaste tu contraseña?</button>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 text-center mb-4 backdrop-blur-md font-medium">{error}</div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}>
              <motion.button
                type="submit" disabled={isLoading}
                animate={isFormReady && !isLoading ? { scale: [1, 1.02, 1], boxShadow: ["0 0 0 0px rgba(79, 70, 229, 0)", "0 0 25px 3px rgba(79, 70, 229, 0.5)", "0 0 0 0px rgba(79, 70, 229, 0)"] } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="w-full h-16 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-2xl font-bold text-lg text-white relative overflow-hidden group disabled:opacity-50 transition-all duration-300 shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_0_60px_-10px_rgba(79,70,229,0.7)] active:scale-[0.98]"
              >
                <div className="absolute inset-0 w-[200%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)] opacity-0 group-hover:opacity-30 transition-opacity mix-blend-overlay" style={{ left: '-50%', top: '-50%' }}/>
                <span className="relative flex items-center justify-center gap-3 z-10">
                  {isLoading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>Accediendo...</span></> : <>Iniciar Sesión <ArrowRight className="group-hover:translate-x-1 transition-transform" /></>}
                </span>
              </motion.button>
            </motion.div>
          </form>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-10 pt-6 border-t border-white/5 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm px-4 py-2 rounded-full bg-black/20 border border-white/5">
              <ScanFace size={16} className="text-blue-400" /><span>Acceso Seguro Verificado</span>
            </div>
            <button onClick={onNavigateToRegister} className="text-slate-400 hover:text-white transition-colors py-2 outline-none">¿No tienes cuenta? <span className="text-blue-400 font-semibold ml-1 hover:underline">Regístrate aquí</span></button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};