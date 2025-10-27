import React, { useState } from 'react';
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
  { id: 'Reporte Diagnostico', name: 'Reporte Diagnostico', icon: '📝', description: 'Mediciones de reporte diagnóstico' },
  { id: 'temperatura', name: 'Temperatura', icon: '🌡️', description: 'Mediciones térmicas' },
  { id: 'tiempo', name: 'Tiempo', icon: '⏱️', description: 'Mediciones temporales' },
  { id: 'volumen', name: 'Volumen', icon: '📦', description: 'Mediciones volumétricas' }
];

const magnitudesTrazables = [
  { id: 'acustica Trazable', name: 'AcusticaTrazable', icon: '🔊', description: 'Medición de sonido y vibraciones' },
  { id: 'dimensional Trazable', name: 'Dimensional Trazable', icon: '📏', description: 'Mediciones de longitud y dimensiones' },
  { id: 'dureza Trazable', name: 'Dureza Trazable', icon: '🪨', description: 'Mediciones de dureza' },
  { id: 'electrica Trazable', name: 'Electrica Trazable', icon: '⚡', description: 'Mediciones eléctricas y electrónicas' },
  { id: 'flujo Trazable', name: 'Flujo Trazable', icon: '🌊', description: 'Medición de fluidos y caudales' },
  { id: 'frecuencia Trazable', name: 'Frecuencia Trazable', icon: '📡', description: 'Mediciones de frecuencia y tiempo' },
  { id: 'masa Trazable', name: 'Masa Trazable', icon: '⚖️', description: 'Mediciones de masa y peso' },
  { id: 'Optica Trazable', name: 'Optica Trazable', icon: '🔭', description: 'Mediciones ópticas' },
  { id: 'par-torsional Trazable', name: 'Par Torsional Trazable', icon: '🔧', description: 'Medición de torque y par' },
  { id: 'presion Trazable', name: 'Presion Trazable', icon: '📊', description: 'Mediciones de presion y vacio' },
  { id: 'Temperatura Trazable', name: 'Temperatura Trazable', icon: '🌡️', description: 'Mediciones térmicas' },
  { id: 'volumen Trazable', name: 'Volumen Trazable', icon: '📦', description: 'Mediciones volumétricas' },
  { id: 'fuerza Trazable', name: 'Fuerza Trazable', icon: '💪', description: 'Medición de fuerzas y torques' },
  { id: 'Vibracion Trazable', name: 'Vibracion Trazable', icon: '📊', description: 'Mediciones de vibraciones' },
];

export const ConsecutivosScreen: React.FC = () => {
  const { navigateTo, goBack } = useNavigation();
  const [activeTab, setActiveTab] = useState<'acreditado' | 'trazable'>('acreditado');

  const handleMagnitudeClick = (magnitude: any) => {
    navigateTo('magnitude-detail', { magnitude });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <button
            onClick={goBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-blue-600 flex items-center justify-center">
            <img 
              src={labLogo} 
              alt="Logo" 
              className="w-8 h-8 object-contain"
            />
          </div>
          
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Consecutivos
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Tabs */}
        <div className="mb-8">
          <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 max-w-md mx-auto">
            {/* Tab Acreditado */}
            <button
              onClick={() => setActiveTab('acreditado')}
              className={`flex-1 relative px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                activeTab === 'acreditado'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/40 scale-105 focus:ring-blue-500'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 focus:ring-gray-400'
              }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {activeTab === 'acreditado' && (
                  <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse"></span>
                )}
                Acreditado
              </span>
              {activeTab === 'acreditado' && (
                <span className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-xl blur opacity-30"></span>
              )}
            </button>

            {/* Tab Trazable */}
            <button
              onClick={() => setActiveTab('trazable')}
              className={`flex-1 relative px-6 py-3.5 rounded-xl font-bold text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                activeTab === 'trazable'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/40 scale-105 focus:ring-amber-500'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 focus:ring-gray-400'
              }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {activeTab === 'trazable' && (
                  <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse"></span>
                )}
                Trazable
              </span>
              {activeTab === 'trazable' && (
                <span className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-400 rounded-xl blur opacity-30"></span>
              )}
            </button>
          </div>

          {/* Contador */}
          <div className="text-center mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-700 dark:text-gray-300">
                {activeTab === 'acreditado' ? magnitudesAcreditadas.length : magnitudesTrazables.length}
              </span> magnitudes disponibles
            </p>
          </div>
        </div>

        {/* Sección Acreditado */}
        {activeTab === 'acreditado' && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Acreditado
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Magnitudes disponibles para consecutivos acreditados
            </p>
            
            {/* Cards de magnitudes */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {magnitudesAcreditadas.map((magnitude) => (
                <button
                  key={magnitude.id}
                  onClick={() => handleMagnitudeClick(magnitude)}
                  className="group relative bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-200 text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="text-4xl flex-shrink-0">
                      {magnitude.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {magnitude.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {magnitude.description}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Sección Trazable */}
        {activeTab === 'trazable' && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Trazable
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Magnitudes disponibles para consecutivos trazables
            </p>
            
            {/* Cards de magnitudes */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {magnitudesTrazables.map((magnitude) => (
                <button
                  key={magnitude.id}
                  onClick={() => handleMagnitudeClick(magnitude)}
                  className="group relative bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-amber-500 dark:hover:border-amber-500 hover:shadow-lg transition-all duration-200 text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className="text-4xl flex-shrink-0">
                      {magnitude.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {magnitude.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {magnitude.description}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
