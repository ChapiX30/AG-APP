import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, User, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import { getAuth, sendPasswordResetEmail } from "firebase/auth"; // <-- IMPORTADO PARA RESET DE CONTRASEÑA

// IMPORTA TU LOGO (ajusta la ruta si tu archivo es diferente)
import labLogo from '../assets/lab_logo.png';

// --- SIMULACIÓN DE BÚSQUEDA EN BASE DE DATOS ---
// En una app real, aquí harías una llamada a tu backend.
// El email 'admin' debería venir de una variable de entorno (p. ej. process.env.REACT_APP_ADMIN_EMAIL)
const fetchUserName = async (email: string): Promise<{ name: string; initial: string } | null> => {
  if (email.toLowerCase() === 'admin@ese-ag.mx') {
    // Simulamos un retraso de red
    return new Promise(resolve => setTimeout(() => resolve({ name: 'Admin', initial: 'A' }), 700));
  }
  return null;
};


export const LoginScreen: React.FC<{ onNavigateToRegister: () => void }> = ({ onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // --- ESTADOS PARA LA PERSONALIZACIÓN PRO ---
  const [userName, setUserName] = useState('');
  const [userInitial, setUserInitial] = useState('');
  const [isFetchingName, setIsFetchingName] = useState(false);

  // --- ESTADO PARA EL EFECTO "AURORA" ---
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const { login } = useAuth();
  const { navigateTo } = useNavigation();

  // --- EFECTO PARA BUSCAR EL NOMBRE DEL USUARIO CON "DEBOUNCE" ---
  useEffect(() => {
    if (!email) {
      setUserName('');
      setUserInitial('');
      return;
    }
    const debounceTimer = setTimeout(async () => {
      setIsFetchingName(true);
      const userData = await fetchUserName(email);
      if (userData) {
        setUserName(userData.name);
        setUserInitial(userData.initial);
      } else {
        setUserName('');
        setUserInitial('');
      }
      setIsFetchingName(false);
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [email]);

  // --- EFECTO PARA EL MOVIMIENTO DEL RATÓN ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const ok = await login(email, password);
    if (ok) {
      navigateTo('menu');
    } else {
      setError('Credenciales inválidas.');
    }
    setIsLoading(false);
  };

  // --- FUNCIÓN PARA RESTABLECER CONTRASEÑA ---
  const handlePasswordReset = () => {
    const auth = getAuth();
    // Usamos el email que ya está en el campo de texto, si no, lo pedimos.
    const targetEmail = email || prompt("Por favor, ingresa tu correo electrónico para restablecer la contraseña:");

    if (targetEmail) {
      sendPasswordResetEmail(auth, targetEmail)
        .then(() => {
          alert("✅ ¡Excelente! Revisa tu bandeja de entrada. Te hemos enviado un enlace para restablecer tu contraseña.");
        })
        .catch((error) => {
          const errorCode = error.code;
          if (errorCode === 'auth/user-not-found') {
            alert("🚨 Error: No se encontró ningún usuario con ese correo electrónico.");
          } else {
            alert(`🚨 Ocurrió un error: ${error.message}`);
          }
        });
    }
  };


  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900 overflow-y-auto p-4 font-sans">
      {/* --- EFECTO AURORA INTERACTIVO --- */}
      <motion.div
        className="pointer-events-none absolute -inset-px transition duration-300"
        style={{
          background: `radial-gradient(600px at ${mousePosition.x}px ${mousePosition.y}px, rgba(167, 139, 250, 0.15), transparent 80%)`,
        }}
      />

      {/* CONTENIDO PRINCIPAL */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center">
        <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16">
          
          {/* --- SECCIÓN DE BRANDING (IZQUIERDA) --- */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left mb-8 lg:mb-0 max-w-lg">
            <div className="relative flex items-center justify-center w-[150px] h-[150px] mb-6">
              <AnimatePresence mode="popLayout">
                {(userInitial && !isFetchingName) ? (
                  <motion.div
                    key="initial"
                    initial={{ opacity: 0, scale: 0.5, rotateY: -90 }}
                    animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotateY: 90 }}
                    transition={{ duration: 0.4, ease: "circOut" }}
                    className="flex items-center justify-center w-full h-full bg-slate-800/80 border border-white/10 rounded-3xl shadow-lg"
                  >
                    <span className="text-8xl font-black bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent select-none">
                      {userInitial}
                    </span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="logo"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="w-full h-full flex items-center justify-center"
                  >
                     {isFetchingName ? (
                      <div className="w-full h-full bg-slate-800/80 border border-white/10 rounded-3xl animate-pulse"></div>
                     ) : (
                      <img
                        src={labLogo}
                        alt="Lab Logo"
                        className="object-contain w-[140px] h-[140px] rounded-xl pointer-events-none drop-shadow-2xl"
                        draggable={false}
                      />
                     )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white drop-shadow-2xl mb-2">ESE-AG</h1>
            <AnimatePresence mode="wait">
              <motion.div
                key={userName || 'default'}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3 }}
              >
                <span className="block bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent font-bold text-2xl sm:text-3xl mb-4">
                  {userName ? `¡Hola de nuevo, ${userName}!` : '¡Bienvenido!'}
                </span>
              </motion.div>
            </AnimatePresence>
            <p className="text-lg sm:text-xl text-slate-400">
              Gestiona, consulta y administra tus equipos y servicios del laboratorio.
            </p>
          </div>

          {/* --- FORMULARIO (DERECHA) --- */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="w-full max-w-md bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl"
          >
            <div className="text-center mb-8">
              <h3 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Iniciar Sesión</h3>
              <p className="text-slate-400 text-base sm:text-lg">Accede a tu panel de control</p>
            </div>
            <form onSubmit={handleSubmit} className="w-full space-y-6">
              <div>
                <label className="block text-slate-200 text-sm font-semibold mb-2 ml-1">Correo electrónico</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-base sm:text-lg"
                    placeholder="tu@correo.com"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div>
                 <div className="flex justify-between items-center mb-2 ml-1">
                    <label className="block text-slate-200 text-sm font-semibold">Contraseña</label>
                    <button 
                      type="button" 
                      onClick={handlePasswordReset}
                      className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-base sm:text-lg"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-xl p-3 text-center text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 text-white font-semibold py-3.5 px-6 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg text-lg"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                    Entrando...
                  </span>
                ) : ( 'Entrar' )}
              </button>
              <div className="text-center pt-4 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={onNavigateToRegister}
                  className="text-slate-400 hover:text-white font-medium transition-colors flex items-center justify-center mx-auto text-sm sm:text-base"
                >
                  ¿No tienes cuenta? <span className="text-purple-400 hover:text-purple-300 ml-1.5 font-semibold">Regístrate</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </button>
              </div>
            </form>
          </motion.div>
        </div>
        <footer className="text-center mt-12">
            <p className="text-slate-600 text-xs">&copy; {new Date().getFullYear()} ESE-AG. Todos los derechos reservados.</p>
        </footer>
      </div>
    </div>
  );
};

export default LoginScreen;