import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { Eye, EyeOff, Lock, User, Microscope } from 'lucide-react';

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
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-tr from-blue-50 to-blue-200">
      <div className="relative w-full max-w-5xl flex flex-col md:flex-row bg-white/80 rounded-3xl shadow-2xl overflow-hidden border border-blue-200 animate-fade-in mx-4">
        {/* Panel izquierdo: visible sólo en desktop */}
        <div className="hidden md:flex flex-col justify-center items-center flex-1 min-w-[350px] bg-gradient-to-b from-blue-100/90 to-blue-50 p-12">
          <Microscope className="text-blue-700 w-32 h-32 mb-9 drop-shadow-md" />
          <h2 className="text-5xl font-bold text-blue-900 mb-3 drop-shadow-xl text-center">¡Bienvenido!</h2>
          <p className="text-blue-800 text-xl text-center max-w-md">
            Gestiona, consulta y administra todos tus equipos y servicios del laboratorio en un solo lugar.
          </p>
        </div>

        {/* Panel login / contenido principal */}
        <div className="flex flex-col justify-center items-center flex-1 w-full py-16 px-8 bg-white/90 rounded-3xl md:rounded-l-none">
          {/* Encabezado móvil (visible sólo < md) */}
          <div className="flex md:hidden flex-col items-center mb-8 animate-fade-in">
            <Microscope className="text-blue-700 w-24 h-24 mb-5 drop-shadow-md" />
            <h2 className="text-3xl font-bold text-blue-900 mb-2">¡Bienvenido!</h2>
            <p className="text-blue-800 text-base text-center max-w-xs">
              Gestiona, consulta y administra todos tus equipos y servicios del laboratorio en un solo lugar.
            </p>
          </div>

          <h1 className="text-4xl font-extrabold text-blue-900 mb-2 text-center drop-shadow-sm">Iniciar sesión</h1>
          <p className="text-gray-500 text-lg text-center mb-8">Sistema Equipos y Servicios AG</p>

          <form onSubmit={handleSubmit} className="space-y-7 w-full max-w-md animate-slide-up">
            <div>
              <label className="block text-base font-medium text-blue-900 mb-1">Correo electrónico</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 text-blue-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-blue-50 border border-blue-200 rounded-xl text-lg text-blue-900 placeholder-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow"
                  placeholder="ejemplo@ese-ag.com"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-base font-medium text-blue-900 mb-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 text-blue-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-blue-50 border border-blue-200 rounded-xl text-lg text-blue-900 placeholder-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow"
                  placeholder="Tu contraseña"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-700 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-300 text-red-700 rounded-lg p-2 text-center text-base">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-800 hover:to-blue-600 text-white py-3 rounded-xl font-semibold shadow-lg transition-all hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 text-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <span className="w-5 h-5 border-2 border-blue-200 border-t-blue-700 rounded-full animate-spin mr-2" />
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          <div className="mt-5 flex justify-center">
            <button
              type="button"
              className="text-blue-600 hover:underline text-base"
              onClick={onNavigateToRegister}
            >
              ¿No tienes cuenta? <span className="font-semibold">Regístrate</span>
            </button>
          </div>

          <div className="mt-10 text-center text-xs text-gray-400 select-text">
            Demo: <span className="font-mono">admin@ese-ag.mx</span> / <span className="font-mono">admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
};
