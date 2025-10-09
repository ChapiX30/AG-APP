import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, Mail, Sparkles, ArrowRight, Fingerprint } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import labLogo from '../assets/lab_logo.png';

const fetchUserName = async (email: string): Promise<{ name: string; initial: string } | null> => {
  if (email.toLowerCase() === 'admin@ese-ag.mx') {
    return new Promise(resolve => 
      setTimeout(() => resolve({ name: 'Admin', initial: 'A' }), 700)
    );
  }
  return null;
};

export const LoginScreen: React.FC<{ onNavigateToRegister: () => void }> = ({ 
  onNavigateToRegister 
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [userInitial, setUserInitial] = useState('');
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { login } = useAuth();
  const { navigateTo } = useNavigation();

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
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

  const handlePasswordReset = () => {
    const auth = getAuth();
    const targetEmail = email || prompt(
      "Por favor, ingresa tu correo electrónico para restablecer la contraseña:"
    );

    if (targetEmail) {
      sendPasswordResetEmail(auth, targetEmail)
        .then(() => {
          alert(
            "✅ ¡Excelente! Revisa tu bandeja de entrada. Te hemos enviado un enlace para restablecer tu contraseña."
          );
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

  const bgX = useTransform(mouseX, [0, window.innerWidth], [-20, 20]);
  const bgY = useTransform(mouseY, [0, window.innerHeight], [-20, 20]);

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-black">
      {/* MESH GRADIENT BACKGROUND - Sin recuadros, fluido */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          style={{ x: bgX, y: bgY }}
          className="absolute inset-0 opacity-60"
        >
          {/* Mesh gradient fluido */}
          <div className="absolute top-0 left-0 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 blur-[150px] opacity-50 animate-blob" />
          <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 blur-[150px] opacity-50 animate-blob animation-delay-2000" />
          <div className="absolute bottom-0 left-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-cyan-600 via-blue-600 to-purple-600 blur-[150px] opacity-50 animate-blob animation-delay-4000" />
        </motion.div>

        {/* Animated grain texture */}
        <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay">
          <svg className="w-full h-full">
            <filter id="noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" />
            </filter>
            <rect width="100%" height="100%" filter="url(#noise)" />
          </svg>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[440px]"
        >
          {/* LOGO CON EFECTO FLOTANTE */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-12"
          >
            <motion.div
              animate={{ 
                y: [0, -10, 0],
                rotateY: [0, 5, 0, -5, 0]
              }}
              transition={{ 
                duration: 6, 
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="inline-block mb-6 relative"
            >
              {/* Halo glow effect */}
              <motion.div
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 rounded-full blur-3xl"
              />
              <div className="relative">
                <img
                  src={labLogo}
                  alt="Lab Logo"
                  className="h-20 w-20 sm:h-24 sm:w-24 object-contain relative z-10 drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent leading-tight">
                Bienvenido
              </h1>
              <p className="text-gray-400 text-base">
                Sistema de Gestión Profesional
              </p>
            </motion.div>
          </motion.div>

          {/* SALUDO PERSONALIZADO - Sin bordes */}
          <AnimatePresence mode="wait">
            {userName && (
              <motion.div
                initial={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                transition={{ duration: 0.4 }}
                className="mb-8 relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-xl" />
                <div className="relative backdrop-blur-xl bg-white/[0.03] px-6 py-4 rounded-3xl">
                  <div className="flex items-center gap-4">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", duration: 0.8 }}
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-purple-500/30"
                    >
                      {userInitial}
                    </motion.div>
                    <div className="flex-1">
                      <p className="text-white font-semibold">¡Hola de nuevo!</p>
                      <p className="text-gray-400 text-sm">{userName}</p>
                    </div>
                    <motion.div
                      animate={{ 
                        rotate: [0, 10, -10, 0],
                        scale: [1, 1.1, 1]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="w-5 h-5 text-yellow-400" />
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FORMULARIO - Sin recuadros visibles */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* EMAIL FIELD */}
            <motion.div
              initial={{ opacity: 0, x: -30, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <motion.label
                animate={{ x: focusedField === 'email' ? 4 : 0 }}
                className="block text-sm font-medium text-gray-300 mb-3 ml-1"
              >
                Correo Electrónico
              </motion.label>
              <div className="relative group">
                {/* Glow effect on focus */}
                <motion.div
                  animate={{
                    opacity: focusedField === 'email' ? 0.4 : 0,
                    scale: focusedField === 'email' ? 1 : 0.8
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 blur-2xl rounded-3xl"
                />
                
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10 pointer-events-none transition-colors duration-300 group-hover:text-blue-400" />
                  <motion.input
                    whileFocus={{ scale: 1.01 }}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="nombre@ejemplo.com"
                    required
                    className="w-full h-14 pl-14 pr-5 bg-white/[0.03] backdrop-blur-xl text-white placeholder-gray-500 rounded-2xl focus:outline-none transition-all duration-300 border-0 focus:bg-white/[0.05]"
                    style={{
                      boxShadow: focusedField === 'email' 
                        ? '0 0 0 1px rgba(59, 130, 246, 0.3), 0 10px 40px -10px rgba(59, 130, 246, 0.3)' 
                        : '0 0 0 1px rgba(255, 255, 255, 0.05)'
                    }}
                  />
                  {isFetchingName && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full"
                    />
                  )}
                </div>
              </div>
            </motion.div>

            {/* PASSWORD FIELD */}
            <motion.div
              initial={{ opacity: 0, x: -30, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <motion.label
                animate={{ x: focusedField === 'password' ? 4 : 0 }}
                className="block text-sm font-medium text-gray-300 mb-3 ml-1"
              >
                Contraseña
              </motion.label>
              <div className="relative group">
                <motion.div
                  animate={{
                    opacity: focusedField === 'password' ? 0.4 : 0,
                    scale: focusedField === 'password' ? 1 : 0.8
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 blur-2xl rounded-3xl"
                />
                
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10 pointer-events-none transition-colors duration-300 group-hover:text-purple-400" />
                  <motion.input
                    whileFocus={{ scale: 1.01 }}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••••"
                    required
                    className="w-full h-14 pl-14 pr-14 bg-white/[0.03] backdrop-blur-xl text-white placeholder-gray-500 rounded-2xl focus:outline-none transition-all duration-300 border-0 focus:bg-white/[0.05]"
                    style={{
                      boxShadow: focusedField === 'password' 
                        ? '0 0 0 1px rgba(168, 85, 247, 0.3), 0 10px 40px -10px rgba(168, 85, 247, 0.3)' 
                        : '0 0 0 1px rgba(255, 255, 255, 0.05)'
                    }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors z-10"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </motion.button>
                </div>
              </div>

              <motion.button
                whileHover={{ x: 4 }}
                type="button"
                onClick={handlePasswordReset}
                className="text-xs text-gray-400 hover:text-blue-400 mt-3 ml-1 transition-colors inline-block"
              >
                ¿Olvidaste tu contraseña?
              </motion.button>
            </motion.div>

            {/* ERROR MESSAGE */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-pink-500/20 blur-xl" />
                    <div className="relative backdrop-blur-xl bg-red-500/10 px-5 py-4 rounded-2xl">
                      <p className="text-red-300 text-sm text-center font-medium">
                        {error}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* LOGIN BUTTON */}
            <motion.div
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                className="relative w-full h-14 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-semibold rounded-2xl overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  boxShadow: '0 10px 40px -10px rgba(139, 92, 246, 0.6)'
                }}
              >
                {/* Animated gradient overlay */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                />
                
                {/* Shimmer effect */}
                <motion.div
                  animate={{
                    x: ['-200%', '200%'],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                />

                <span className="relative flex items-center justify-center gap-3">
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      <span>Iniciando sesión...</span>
                    </>
                  ) : (
                    <>
                      <span>Iniciar Sesión</span>
                      <motion.div
                        animate={{ x: [0, 5, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <ArrowRight className="w-5 h-5" />
                      </motion.div>
                    </>
                  )}
                </span>
              </motion.button>
            </motion.div>

            {/* BIOMETRIC HINT */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex items-center justify-center gap-2 text-gray-500 text-xs"
            >
              <Fingerprint className="w-4 h-4" />
              <span>Autenticación biométrica disponible próximamente</span>
            </motion.div>

            {/* DIVIDER */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 text-xs text-gray-500 bg-black">
                  ¿Primera vez aquí?
                </span>
              </div>
            </div>

            {/* REGISTER BUTTON */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onNavigateToRegister}
              className="w-full h-14 bg-white/[0.03] backdrop-blur-xl text-white font-medium rounded-2xl hover:bg-white/[0.06] transition-all duration-300"
              style={{
                boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.05)'
              }}
            >
              Crear Nueva Cuenta
            </motion.button>
          </form>

          {/* FOOTER */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-12 text-center"
          >
            <p className="text-xs text-gray-600">
              © 2025 ESE-AG Lab. Todos los derechos reservados.
            </p>
          </motion.div>
        </motion.div>
      </div>

      {/* ANIMATED CSS */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 20s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};
