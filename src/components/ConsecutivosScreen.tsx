import React from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { id } from 'date-fns/locale';

const magnitudesAcreditadas = [
  { id: 'acustica', name: 'Acustica', icon: '', description: 'Medición de sonido y vibraciones' },
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
  { id: 'Reporte Diagnostico', name: 'Reporte Diagnostico', icon: '📊', description: 'Mediciones de reporte diagnostico' },
  { id: 'temperatura', name: 'Temperatura', icon: '🌡️', description: 'Mediciones térmicas' },
  { id: 'tiempo', name: 'Tiempo', icon: '⏱️', description: 'Mediciones temporales' },
  { id: 'volumen', name: 'Volumen', icon: '📦', description: 'Mediciones volumétricas' }
];

const magnitudesTrazables = [
  {id: 'acustica Trazable', name: 'Acustica Trazable', icon: '', description: 'Medición de sonido y vibraciones' },
  { id: 'dimensional Trazable', name: 'Dimensional Trazable', icon: '📏', description: 'Mediciones de longitud y dimensiones' },
  { id: 'dureza Trazable', name: 'Dureza Trazable', icon: '⚖️', description: 'Mediciones de dureza' },
  { id: 'electrica Trazable', name: 'Electrica Trazable', icon: '⚡', description: 'Mediciones eléctricas y electrónicas' },
  { id: 'flujo Trazable', name: 'Flujo Trazable', icon: '🌊', description: 'Medición de fluidos y caudales' },
  { id: 'frecuencia Trazable', name: 'Frecuencia Trazable', icon: '📡', description: 'Mediciones de frecuencia y tiempo' },
  { id: 'masa Trazable', name: 'Masa Trazable', icon: '⚖️', description: 'Mediciones de masa y peso' },
  { id: 'optica Trazable', name: 'Optica Trazable', icon: '🔭', description: 'Mediciones opticas' },
  { id: 'par-torsional Trazable', name: 'Par Torsional Trazable', icon: '🔧', description: 'Medición de torque y par' },
  { id: 'presion Trazable', name: 'Presion Trazable', icon: '📊', description: 'Mediciones de presión y vacío' },
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4 flex items-center space-x-4">
          <button 
            onClick={goBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">#</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Consecutivos</h1>
              <p className="text-sm text-gray-500">Selecciona una magnitud</p>
            </div>
          </div>
        </div>
      </div>

      {/* Magnitudes List */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto">

          {/* Acreditado */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Acreditado</h2>
            <p className="text-sm text-gray-500">Magnitudes disponibles para consecutivos</p>
          </div>
          
          <div className="space-y-3">
            {magnitudesAcreditadas.map((magnitude) => (
              <div
                key={magnitude.id}
                onClick={() => handleMagnitudeClick(magnitude)}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg flex items-center justify-center border border-blue-100">
                      <span className="text-2xl">{magnitude.icon}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {magnitude.name}
                      </h3>
                      <p className="text-sm text-gray-500">{magnitude.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </div>
            ))}
          </div>

          {/* Trazable */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">Trazable</h2>
            <p className="text-sm text-gray-500">Magnitudes trazables disponibles</p>
          </div>

          <div className="space-y-3">
            {magnitudesTrazables.map((magnitude) => (
              <div
                key={magnitude.id}
                onClick={() => handleMagnitudeClick(magnitude)}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-yellow-300 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-yellow-50 to-orange-100 rounded-lg flex items-center justify-center border border-yellow-100">
                      <span className="text-2xl">{magnitude.icon}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
                        {magnitude.name}
                      </h3>
                      <p className="text-sm text-gray-500">{magnitude.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-600 transition-colors" />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};