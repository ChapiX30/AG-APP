import React, { useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { motion, AnimatePresence } from 'framer-motion';

// --- DATOS DE MAGNITUDES (Sin cambios) ---
const magnitudesAcreditadas = [
    { id: 'Acustica', name: 'Acustica', icon: '🔊', description: 'Sonido y vibraciones' },
    { id: 'Dimensional', name: 'Dimensional', icon: '📏', description: 'Longitud y dimensiones' },
    { id: 'Electrica', name: 'Electrica', icon: '⚡', description: 'Mediciones eléctricas' },
    { id: 'Flujo', name: 'Flujo', icon: '🌊', description: 'Fluidos y caudales' },
    { id: 'Frecuencia', name: 'Frecuencia', icon: '📡', description: 'Frecuencia y tiempo' },
    { id: 'Fuerza', name: 'Fuerza', icon: '💪', description: 'Fuerzas y torques' },
    { id: 'Humedad', name: 'Humedad', icon: '💧', description: 'Humedad relativa' },
    { id: 'Masa', name: 'Masa', icon: '⚖️', description: 'Masa y peso' },
    { id: 'Par Torsional', name: 'Par Torsional', icon: '🔧', description: 'Torque y par' },
    { id: 'Presion', name: 'Presion', icon: '📊', description: 'Presión y vacío' },
    { id: 'Quimica', name: 'Quimica', icon: '🔬', description: 'Mediciones químicas' },
    { id: 'Reporte Diagnostico', name: 'Reporte Diagnostico', icon: '📝', description: 'Reporte diagnóstico' },
    { id: 'Temperatura', name: 'Temperatura', icon: '🌡️', description: 'Mediciones térmicas' },
    { id: 'Tiempo', name: 'Tiempo', icon: '⏱️', description: 'Mediciones temporales' },
    { id: 'Volumen', name: 'Volumen', icon: '📦', description: 'Mediciones volumétricas' }
];

const magnitudesTrazables = [
    { id: 'AcusticaTrazable', name: 'AcusticaTrazable', icon: '🔊', description: 'Sonido y vibraciones' },
    { id: 'DimensionalTrazable', name: 'DimensionalTrazable', icon: '📏', description: 'Longitud y dimensiones' },
    { id: 'DurezaTrazable', name: 'DurezaTrazable', icon: '🪨', description: 'Mediciones de dureza' },
    { id: 'ElectricaTrazable', name: 'ElectricaTrazable', icon: '⚡', description: 'Mediciones eléctricas' },
    { id: 'FlujoTrazable', name: 'FlujoTrazable', icon: '🌊', description: 'Fluidos y caudales' },
    { id: 'FrecuenciaTrazable', name: 'FrecuenciaTrazable', icon: '📡', description: 'Frecuencia y tiempo' },
    { id: 'FuerzaTrazable', name: 'FuerzaTrazable', icon: '💪', description: 'Fuerzas y torques' },
    { id: 'MasaTrazable', name: 'MasaTrazable', icon: '⚖️', description: 'Masa y peso' },
    { id: 'OpticaTrazable', name: 'OpticaTrazable', icon: '🔭', description: 'Mediciones ópticas' },
    { id: 'ParTorsionalTrazable', name: 'ParTorsionalTrazable', icon: '🔧', description: 'Torque y par' },
    { id: 'PresionTrazable', name: 'PresionTrazable', icon: '📊', description: 'Presion y vacio' },
    { id: 'TemperaturaTrazable', name: 'TemperaturaTrazable', icon: '🌡️', description: 'Mediciones térmicas' },
    { id: 'VolumenTrazable', name: 'VolumenTrazable', icon: '📦', description: 'Mediciones volumétricas' },
];

type MagnitudeType = 'Acreditado' | 'Trazable';

// --- Componente con Mejoras Mobile PRO ---
export const ConsecutivosScreen: React.FC = () => {
  const { navigateTo, goBack } = useNavigation();
  const [activeTab, setActiveTab] = useState<MagnitudeType>('Acreditado');

  const handleMagnitudeClick = (magnitudeName: string) => {
    navigateTo('magnitude-detail', { selectedMagnitude: magnitudeName });
  };
  
  const currentMagnitudes = activeTab === 'Acreditado' ? magnitudesAcreditadas : magnitudesTrazables;
  
  // Clases dinámicas para cambiar el tema de color entre Acreditado y Trazable
  const cardColorClasses = activeTab === 'Acreditado' 
    ? {
        bg: 'dark:bg-blue-950/70',
        border: 'border-gray-200/80 dark:border-blue-900/80',
        ring: 'focus:ring-blue-500',
        badge: 'text-blue-500',
        iconBg: 'bg-gradient-to-br from-blue-100 to-white dark:from-blue-900 dark:to-blue-800',
        iconBorder: 'border-blue-200/50 dark:border-blue-800/50',
        title: 'text-gray-800 dark:text-blue-100 group-hover:text-blue-600',
        description: 'text-gray-500 dark:text-blue-300/80',
        chevron: 'text-gray-300 dark:text-blue-700 group-hover:text-blue-500'
      }
    : {
        bg: 'dark:bg-yellow-950/70',
        border: 'border-gray-200/80 dark:border-yellow-900/80',
        ring: 'focus:ring-yellow-400',
        badge: 'text-yellow-600',
        iconBg: 'bg-gradient-to-br from-yellow-100 to-white dark:from-yellow-900 dark:to-yellow-800',
        iconBorder: 'border-yellow-200/50 dark:border-yellow-800/50',
        title: 'text-gray-800 dark:text-yellow-100 group-hover:text-yellow-500',
        description: 'text-gray-500 dark:text-yellow-300/80',
        chevron: 'text-gray-300 dark:text-yellow-700 group-hover:text-yellow-500'
      };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col">
      {/* Header PRO: Ajustes responsivos para móviles */}
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
          <button onClick={goBack} className="p-2 rounded-full group transition hover:bg-gray-200/70 dark:hover:bg-slate-800/50">
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 dark:text-gray-200 group-hover:-translate-x-1 transition" />
          </button>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl shadow-lg bg-gradient-to-tr from-blue-600 to-blue-300 dark:from-blue-800 dark:to-blue-400 flex items-center justify-center flex-shrink-0">
            <img src={labLogo} alt="Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow" /> 
          </div>
          <div className="overflow-hidden">
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight truncate">
              Generar Consecutivo
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Selecciona una magnitud</p>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4">
        {/* Selector de Pestañas PRO: Con fondo para destacar al hacer scroll */}
        <div className="sticky top-[65px] sm:top-[77px] z-10 py-3 bg-slate-50/80 dark:bg-gray-900/80 backdrop-blur-md -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="p-1.5 bg-gray-200/60 dark:bg-slate-800/60 rounded-xl flex items-center gap-2 max-w-md mx-auto shadow-inner">
                {(['Acreditado', 'Trazable'] as MagnitudeType[]).map((type) => (
                    <button
                        key={type}
                        onClick={() => setActiveTab(type)}
                        className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all duration-300 outline-none focus-visible:ring-2 ${
                            activeTab === type 
                            ? 'bg-white dark:bg-blue-600 text-blue-700 dark:text-white shadow-md ring-blue-500/50'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-slate-700/50 ring-transparent'
                        }`}
                    >
                        {type}
                    </button>
                ))}
            </div>
        </div>
        
        {/* Grid de Magnitudes PRO: 2 columnas en móvil para mejor visualización */}
        <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 pt-4"
        >
            {currentMagnitudes.map((magnitude, idx) => (
              <motion.button
                key={magnitude.id}
                onClick={() => handleMagnitudeClick(magnitude.name)}
                className={`group w-full relative p-3 rounded-2xl bg-white ${cardColorClasses.bg} border ${cardColorClasses.border} hover:shadow-xl hover:-translate-y-1 active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 ${cardColorClasses.ring}`}
                aria-label={`Seleccionar magnitud ${magnitude.name}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.04, type: 'spring', stiffness: 350, damping: 25 }}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-3xl ${cardColorClasses.iconBg} shadow-inner border ${cardColorClasses.iconBorder}`}>
                    {magnitude.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className={`font-bold text-sm sm:text-base ${cardColorClasses.title} transition-colors`}>{magnitude.name.replace('Trazable', '')}</h3>
                    <p className={`text-xs hidden sm:block ${cardColorClasses.description}`}>{magnitude.description}</p>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 absolute top-2 right-2 sm:bottom-3 sm:right-3 sm:top-auto ${cardColorClasses.chevron} transition-colors`} />
              </motion.button>
            ))}
        </motion.div>
      </main>
    </div>
  );
};