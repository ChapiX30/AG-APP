/* LoginScreen.tsx */
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, User, Microscope, ArrowRight, CheckCircle, Shield } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";

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

    const success = await login(email, password);

    if (success) {
      navigateTo('menu');
    } else {
      setError('Credenciales inválidas. Usa admin@ese-ag.mx / admin123');
    }

    setIsLoading(false);
  };

  return (
    <div
      className="min-h-screen w-screen relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
      }}
    >
      {/* Efectos de fondo animados */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0.3 }}
        animate={{ scale: 1.2, opacity: 0.6 }}
        transition={{ repeat: Infinity, repeatType: "mirror", duration: 4, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 pointer-events-none"
        style={{
          width: 450, height: 450, borderRadius: "50%",
          background: "radial-gradient(circle at 50% 45%, #8b5cf6cc 10%, #6366f166 70%, transparent 100%)",
          filter: "blur(8px)", zIndex: 1,
        }}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0.2 }}
        animate={{ scale: 1.1, opacity: 0.4 }}
        transition={{ repeat: Infinity, repeatType: "mirror", duration: 5, ease: "easeInOut", delay: 1.5 }}
        className="absolute bottom-1/4 right-1/4 pointer-events-none"
        style={{
          width: 380, height: 380, borderRadius: "50%",
          background: "radial-gradient(circle at 50% 45%, #3b82f6aa 15%, #1e40af55 60%, transparent 100%)",
          filter: "blur(10px)", zIndex: 1,
        }}
      />
      {/* Brillo inferior */}
      <div
        className="absolute left-0 bottom-0 w-full h-60 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 140%, #fff8 6%, #8b5cf622 20%, transparent 60%)",
          zIndex: 1,
        }}
      />

      {/* ======== Desktop (SIN CAMBIOS) ======== */}
      <div className="hidden lg:flex min-h-screen relative z-10">
        {/* Panel principal - ocupando todo el ancho como RegisterScreen */}
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
              className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mr-6 backdrop-blur-sm shadow-lg"
            >
              <Microscope className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-5xl font-bold text-white">ESE-AG</h1>
          </div>

          <div className="flex">
            {/* Contenido izquierdo */}
            <div className="flex-1 mr-16">
              <motion.h2
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="text-7xl font-extrabold text-white mb-8 leading-tight"
              >
                ¡Bienvenido al
                <span className="block bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  futuro
                </span>
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="text-2xl text-white/90 mb-16 leading-relaxed max-w-2xl"
              >
                Gestiona, consulta y administra todos tus equipos y servicios del laboratorio con tecnología de vanguardia.
              </motion.p>

              {/* Características */}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.7 }}
                className="space-y-8"
              >
                {[
                  { icon: Shield, title: "Seguridad Empresarial", desc: "Protección y encriptación de nivel bancario", color: "text-purple-300" },
                  { icon: Microscope, title: "Gestión Avanzada", desc: "Control total de equipos y servicios", color: "text-blue-300" },
                  { icon: CheckCircle, title: "Colaboración en Equipo", desc: "Diseñado para equipos modernos", color: "text-indigo-300" }
                ].map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.9 + index * 0.1 }}
                    className="flex items-center"
                  >
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mr-6 border border-white/20">
                      <item.icon className={`w-8 h-8 ${item.color}`} />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-xl mb-1">{item.title}</h3>
                      <p className="text-white/70 text-lg">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Formulario de login en el lado derecho */}
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
              className="flex-shrink-0 w-96"
            >
              <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 border border-white/20 shadow-2xl">
                <div className="text-center mb-10">
                  <h3 className="text-3xl font-bold text-white mb-3">Iniciar Sesión</h3>
                  <p className="text-white/70 text-lg">Sistema Equipos y Servicios AG</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Email */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.8 }}>
                    <label className="block text-white/90 text-sm font-medium mb-3">Correo electrónico</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all backdrop-blur-sm text-base"
                        placeholder="ejemplo@ese-ag.com"
                        required
                        autoFocus
                      />
                    </div>
                  </motion.div>

                  {/* Contraseña */}
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.9 }}>
                    <label className="block text-white/90 text-sm font-medium mb-3">Contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all backdrop-blur-sm text-base"
                        placeholder="Tu contraseña"
                        required
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

                  {/* Error */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-xl p-4 text-center backdrop-blur-sm"
                    >
                      {error}
                    </motion.div>
                  )}

                  {/* Submit */}
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 1.0 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                  >
                    {isLoading ? (
                      <span className="flex items-center">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                        Entrando...
                      </span>
                    ) : (
                      'Entrar'
                    )}
                  </motion.button>

                  {/* Ir a registro */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.2 }} className="text-center pt-4">
                    <button
                      type="button"
                      onClick={onNavigateToRegister}
                      className="text-purple-400 hover:text-purple-300 font-medium transition-colors flex items-center justify-center mx-auto"
                    >
                      ¿No tienes cuenta? Regístrate
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </button>
                  </motion.div>
                </form>

                {/* Credenciales demo */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.4 }} className="mt-8 pt-6 border-t border-white/10 text-center">
                  <p className="text-xs text-white/50 select-text">
                    Demo: <span className="font-mono text-white/70">admin@ese-ag.mx</span> / <span className="font-mono text-white/70">admin123</span>
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ======== Móvil / Tablet con SLIDE-UP ======== */}
      <div className="lg:hidden w-full flex-1 flex flex-col relative z-10">
        {/* Header/hero */}
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex-1 flex flex-col justify-center items-center px-6 py-12"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center mb-8">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
              className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center mr-4 shadow-lg"
            >
              <Microscope className="w-8 h-8 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white">ESE-AG</h1>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-4xl font-bold text-white mb-6 text-center"
          >
            ¡Bienvenido al{" "}
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">futuro</span>
            !
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-white/90 text-lg text-center max-w-sm px-4"
          >
            Gestiona todos tus equipos y servicios del laboratorio con tecnología avanzada.
          </motion.p>
        </motion.div>

        {/* Bottom sheet: slide-up */}
        <AnimatePresence>
          <motion.div
            key="login-sheet"
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.8, delay: 0.05 }}
            className="flex-1 bg-white/10 backdrop-blur-xl px-6 py-8 rounded-t-3xl shadow-2xl border-t border-white/20"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          >
            <div className="max-w-sm mx-auto">
              <div className="h-1.5 w-12 bg-white/30 rounded-full mx-auto mb-6" />

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">Iniciar Sesión</h3>
                <p className="text-white/70">Sistema Equipos y Servicios AG</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
                  <label className="block text-white/90 text-sm font-medium mb-2">Correo electrónico</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all backdrop-blur-sm"
                      placeholder="ejemplo@ese-ag.com"
                      autoFocus
                      required
                    />
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
                  <label className="block text-white/90 text-sm font-medium mb-2">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all backdrop-blur-sm"
                      placeholder="Tu contraseña"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </motion.div>

                {error && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-lg p-3 text-center text-sm backdrop-blur-sm">
                    {error}
                  </motion.div>
                )}

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.35 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Entrando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </motion.button>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.45 }} className="text-center">
                  <button type="button" onClick={onNavigateToRegister} className="text-purple-400 hover:text-purple-300 font-medium transition-colors text-sm flex items-center justify-center mx-auto">
                    ¿No tienes cuenta? Regístrate
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </button>
                </motion.div>
              </form>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.5 }} className="mt-6 pt-4 border-t border-white/10 text-center">
                <p className="text-xs text-white/50 select-text">
                  Demo: <span className="font-mono text-white/70">admin@ese-ag.mx</span> / <span className="font-mono text-white/70">admin123</span>
                </p>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
