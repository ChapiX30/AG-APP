import React from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import labLogo from '../assets/lab_logo.png'; // Si tienes tu logo real

const magnitudesAcreditadas = [
  { id: 'acustica', name: 'Acustica', icon: '🔊', description: 'Medición de sonido y vibraciones' },
  { id: 'dimensional', name: 'Dimensional', icon: '📏', description: 'Mediciones de longitud y dimensiones' },
  { id: 'electrica', name: 'Electrica', icon: '⚡', description: 'Mediciones eléctricas y electrónicas' },
  { id: 'flujo', name: 'Flujo', icon: '🌊', description: 'Medición de fluidos y caudales' },
  { id: 'frecuencia', name: 'Frecuencia', icon: '📡', description: 'Mediciones de frecuencia y tiempo' },
  { id: 'fuerza', name: 'Fuerza', icon: '💪', description: 'Medición de fuerzas y torques' },
  { id: 'humedad', name: 'Humedad', icon: '💧', description: 'Medición de humedad relativa' },
  { id: 'masa', name: 'Masa', icon: '⚖️', description: 'Mediciones de masa y peso' },
  { id: 'par-torsional', name: 'Par Torsional', icon: '🔧', description: 'Medición de torque y par' },
  { id: 'presion', name: 'Presion', icon: '📊', description: 'Mediciones de presión y vacío' },
  { id: 'quimica', name: 'Quimica', icon: '🔬', description: 'Mediciones químicas' },
  { id: 'Reporte Diagnostico', name: 'Reporte Diagnóstico', icon: '📝', description: 'Mediciones de reporte diagnóstico' },
  { id: 'temperatura', name: 'Temperatura', icon: '🌡️', description: 'Mediciones térmicas' },
  { id: 'tiempo', name: 'Tiempo', icon: '⏱️', description: 'Mediciones temporales' },
  { id: 'volumen', name: 'Volumen', icon: '📦', description: 'Mediciones volumétricas' }
];

const magnitudesTrazables = [
  { id: 'acustica Trazable', name: 'Acústica Trazable', icon: '🔊', description: 'Medición de sonido y vibraciones' },
  { id: 'dimensional Trazable', name: 'Dimensional Trazable', icon: '📏', description: 'Mediciones de longitud y dimensiones' },
  { id: 'dureza Trazable', name: 'Dureza Trazable', icon: '🪨', description: 'Mediciones de dureza' },
  { id: 'electrica Trazable', name: 'Eléctrica Trazable', icon: '⚡', description: 'Mediciones eléctricas y electrónicas' },
  { id: 'flujo Trazable', name: 'Flujo Trazable', icon: '🌊', description: 'Medición de fluidos y caudales' },
  { id: 'frecuencia Trazable', name: 'Frecuencia Trazable', icon: '📡', description: 'Mediciones de frecuencia y tiempo' },
  { id: 'masa Trazable', name: 'Masa Trazable', icon: '⚖️', description: 'Mediciones de masa y peso' },
  { id: 'optica Trazable', name: 'Óptica Trazable', icon: '🔭', description: 'Mediciones ópticas' },
  { id: 'par-torsional Trazable', name: 'Par Torsional Trazable', icon: '🔧', description: 'Medición de torque y par' },
  { id: 'presion Trazable', name: 'Presion Trazable', icon: '📊', description: 'Mediciones de presion y vacio' },
  { id: 'Temperatura Trazable', name: 'Temperatura Trazable', icon: '🌡️', description: 'Mediciones térmicas' },
  { id: 'volumen Trazable', name: 'Volumen Trazable', icon: '📦', description: 'Mediciones volumétricas' },
  { id: 'fuerza Trazable', name: 'Fuerza Trazable', icon: '💪', description: 'Medición de fuerzas y torques' },
];

export const ConsecutivosScreen: React.FC = () => {
  const { navigateTo, goBack } = useNavigation();

  const handleMagnitudeClick = (magnitude: any) => {
    navigateTo('magnitude-detail', { magnitude });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-blue-200 dark:from-gray-900 dark:to-slate-800 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/80 backdrop-blur border-b border-blue-200 shadow-md transition-all">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-4 relative">
          {/* Botón regresar */}
          <button
            onClick={goBack}
            className="p-2 rounded-xl group transition hover:bg-blue-100/70 dark:hover:bg-blue-950/50 focus:ring-2 focus:ring-blue-400"
            aria-label="Regresar"
          >
            <ArrowLeft className="w-6 h-6 text-blue-700 dark:text-blue-200 group-hover:-translate-x-1 transition" />
          </button>
          {/* Logo + animación */}
          <div className="w-12 h-12 rounded-2xl shadow-lg bg-gradient-to-tr from-blue-600 via-blue-400 to-blue-300 dark:from-blue-800 dark:to-blue-400 flex items-center justify-center animate-pulse-slow">
            {/* <img src={labLogo} alt="Logo" className="w-10 h-10 object-contain drop-shadow" /> */}
            <span className="text-white text-2xl font-bold tracking-tight select-none animate-glow">#</span>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-blue-900 dark:text-blue-100 tracking-tight">
              Consecutivos
            </h1>
            <p className="text-xs sm:text-sm text-blue-500 dark:text-blue-300">Selecciona una magnitud para continuar</p>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 px-2 py-4 sm:py-10">
        <div className="max-w-5xl mx-auto">
          {/* Sección Acreditado */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-ping" />
              <h2 className="text-lg sm:text-xl font-semibold text-blue-700 dark:text-blue-200">Acreditado</h2>
            </div>
            <p className="text-xs sm:text-sm text-blue-400 dark:text-blue-400 mb-3">
              Magnitudes disponibles para consecutivos acreditados
            </p>
            {/* Cards de magnitudes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {magnitudesAcreditadas.map((magnitude, idx) => (
                <button
                  key={magnitude.id}
                  onClick={() => handleMagnitudeClick(magnitude)}
                  className="group w-full relative flex flex-col items-start p-4 rounded-2xl bg-white/90 dark:bg-blue-950 border border-blue-200/60 dark:border-blue-900 hover:shadow-xl hover:-translate-y-1 active:scale-[0.97] transition-all focus:ring-2 focus:ring-blue-400 outline-none"
                  tabIndex={0}
                  aria-label={`Seleccionar magnitud ${magnitude.name}`}
                  style={{
                    animation: `fadeInUp 0.6s ${(idx * 0.07) + 0.2}s both`
                  }}
                >
                  <span className="absolute top-4 right-4 text-blue-400 opacity-50 text-xs font-semibold">ACR</span>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl bg-gradient-to-br from-blue-200 via-blue-100 to-white dark:from-blue-900 dark:to-blue-800 shadow-inner border border-blue-200/50 dark:border-blue-900">
                      {magnitude.icon}
                    </div>
                    <div className="flex flex-col items-start">
                      <h3 className="font-bold text-blue-900 dark:text-blue-50 text-base group-hover:text-blue-700 transition-colors">{magnitude.name}</h3>
                      <span className="text-xs text-blue-400 dark:text-blue-300">{magnitude.description}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 absolute bottom-4 right-4 text-blue-300 group-hover:text-blue-600 transition-colors" />
                </button>
              ))}
            </div>
          </section>
          {/* Sección Trazable */}
          <section>
            <div className="flex items-center gap-2 mb-2 mt-10">
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
              <h2 className="text-lg sm:text-xl font-semibold text-yellow-700 dark:text-yellow-200">Trazable</h2>
            </div>
            <p className="text-xs sm:text-sm text-yellow-500 dark:text-yellow-200 mb-3">
              Magnitudes disponibles para consecutivos trazables
            </p>
            {/* Cards de magnitudes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {magnitudesTrazables.map((magnitude, idx) => (
                <button
                  key={magnitude.id}
                  onClick={() => handleMagnitudeClick(magnitude)}
                  className="group w-full relative flex flex-col items-start p-4 rounded-2xl bg-white/90 dark:bg-yellow-950 border border-yellow-200/60 dark:border-yellow-900 hover:shadow-xl hover:-translate-y-1 active:scale-[0.97] transition-all focus:ring-2 focus:ring-yellow-400 outline-none"
                  tabIndex={0}
                  aria-label={`Seleccionar magnitud ${magnitude.name}`}
                  style={{
                    animation: `fadeInUp 0.6s ${(idx * 0.07) + 0.2}s both`
                  }}
                >
                  <span className="absolute top-4 right-4 text-yellow-500 opacity-60 text-xs font-semibold">TRZ</span>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl bg-gradient-to-br from-yellow-100 via-yellow-50 to-white dark:from-yellow-900 dark:to-yellow-700 shadow-inner border border-yellow-200/50 dark:border-yellow-900">
                      {magnitude.icon}
                    </div>
                    <div className="flex flex-col items-start">
                      <h3 className="font-bold text-yellow-800 dark:text-yellow-50 text-base group-hover:text-yellow-700 transition-colors">{magnitude.name}</h3>
                      <span className="text-xs text-yellow-600 dark:text-yellow-200">{magnitude.description}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 absolute bottom-4 right-4 text-yellow-400 group-hover:text-yellow-600 transition-colors" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Animaciones personalizadas */}
      <style>
        {`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .animate-pulse-slow {
          animation: pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-glow {
          animation: glowText 2.5s linear infinite;
        }
        @keyframes glowText {
          0%,100% { text-shadow: 0 0 2px #fff, 0 0 8px #2563eb, 0 0 16px #60a5fa; }
          50% { text-shadow: 0 0 12px #60a5fa, 0 0 24px #1e40af; }
        }
        `}
      </style>
    </div>
  );
};
