import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, User, ArrowRight, CheckCircle } from 'lucide-react';
import { motion, useCycle } from "framer-motion";

// IMPORTA TU LOGO (ajusta la ruta si tu archivo es diferente)
import labLogo from '../assets/lab_logo.png';

export const LoginScreen: React.FC<{ onNavigateToRegister: () => void }> = ({ onNavigateToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { navigateTo } = useNavigation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const ok = await login(email, password);
    if (ok) navigateTo('menu');
    else setError('Credenciales inválidas. Usa admin@ese-ag.mx / admin123');
    setIsLoading(false);
  };

  // Animación 3D giro infinito
  const [hovered, cycleHovered] = useCycle(false, true);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0f172a]">
      {/* Fondo mágico, puedes quitar o ajustar si gustas */}
      <motion.div
        initial={{ opacity: 0.3, scale: 0.8 }}
        animate={{ opacity: 0.6, scale: 1.1 }}
        transition={{ duration: 3, repeat: Infinity, repeatType: "reverse" }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"
        style={{
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, #8b5cf6aa 10%, #6366f122 70%, transparent 100%)",
          filter: "blur(12px)",
        }}
      />
      {/* CONTENIDO PRINCIPAL */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center">
        {/* Branding + Formulario juntos en el centro */}
        <div className="w-full flex flex-col lg:flex-row items-center justify-center gap-0 lg:gap-12 px-2 md:px-0">
          {/* Branding */}
          <div className="flex flex-col items-center mb-10 lg:mb-0">
            {/* Logo gigante con animación 3D */}
            <motion.div
              animate={{
                rotateY: [0, 360],
                scale: hovered ? 1.09 : 1,
                filter: hovered
                  ? "drop-shadow(0 0 120px #a78bfa) drop-shadow(0 0 50px #8b5cf6)"
                  : "drop-shadow(0 0 65px #a78bfa88)",
              }}
              transition={{
                repeat: Infinity,
                duration: 8,
                ease: "linear",
              }}
              onMouseEnter={() => cycleHovered()}
              onMouseLeave={() => cycleHovered()}
              className="cursor-pointer flex items-center justify-center select-none"
              style={{
                width: 150, height: 150,
                perspective: 800,
                marginBottom: 24,
              }}
            >
              <img
                src={labLogo}
                alt="Lab Logo"
                className="object-contain w-[140px] h-[140px] rounded-xl pointer-events-none"
                style={{
                  background: "transparent",
                  border: "none",
                  boxShadow: "0 0 0px transparent",
                  willChange: "transform",
                  userSelect: "none"
                }}
                draggable={false}
              />
            </motion.div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white drop-shadow-2xl text-center mb-2">ESE-AG</h1>
            <span className="block bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent font-bold text-3xl text-center mb-3">
              ¡Bienvenido al futuro!
            </span>
            <p className="text-xl text-white/80 text-center max-w-xl mb-4">
              Gestiona, consulta y administra todos tus equipos y servicios del laboratorio con tecnología de vanguardia.
            </p>
          </div>

          {/* FORMULARIO - Más grande y al centro */}
          <motion.div
            initial={{ opacity: 0, y: 70, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="w-full max-w-md bg-gradient-to-br from-slate-800/90 to-slate-700/80 border border-white/10 rounded-3xl p-10 shadow-2xl flex flex-col justify-center items-center"
            style={{
              minWidth: 380,
              boxShadow: "0 6px 64px #6366f140, 0 0px 1.5px #fff2"
            }}
          >
            <div className="text-center mb-10">
              <h3 className="text-4xl font-extrabold text-white mb-3">Iniciar Sesión</h3>
              <p className="text-white/70 text-lg">Sistema Equipos y Servicios AG</p>
            </div>
            <form onSubmit={handleSubmit} className="w-full space-y-7">
              <div>
                <label className="block text-white/90 text-base font-semibold mb-2">Correo electrónico</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-white/50" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-14 pr-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all backdrop-blur-sm text-lg"
                    placeholder="ejemplo@ese-ag.com"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-white/90 text-base font-semibold mb-2">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-white/50" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-14 pr-14 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all backdrop-blur-sm text-lg"
                    placeholder="Tu contraseña"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-xl p-4 text-center backdrop-blur-sm text-base">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg text-xl"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={onNavigateToRegister}
                  className="text-purple-300 hover:text-purple-200 font-medium transition-colors flex items-center justify-center mx-auto text-base"
                >
                  ¿No tienes cuenta? Regístrate
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </form>
            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-xs text-white/50 select-text">
                {/* Puedes poner demo aquí si quieres */}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
