import React, { useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import {
  Search,
  ChevronRight,
  Hash,
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { FlowScreenHeader } from './worksheet-flow/FlowScreenHeader';
import { flowAccents } from './worksheet-flow/flowTheme';
import { MagnitudeCardVisual } from './worksheet-flow/MagnitudeCardVisual';
import { ElectricServiceTabs, type ServiceTab } from './worksheet-flow/ElectricServiceTabs';
import { isTrazableMagnitudId } from '../utils/magnitudAssets';

const magnitudesAcreditadas = [
  { id: 'acustica', name: 'Acustica', description: 'Medición de sonido y vibraciones' },
  { id: 'dimensional', name: 'Dimensional', description: 'Mediciones de longitud y dimensiones' },
  { id: 'electrica', name: 'Electrica', description: 'Mediciones eléctricas y electrónicas' },
  { id: 'flujo', name: 'Flujo', description: 'Medición de fluidos y caudales' },
  { id: 'frecuencia', name: 'Frecuencia', description: 'Mediciones de frecuencia y tiempo' },
  { id: 'fuerza', name: 'Fuerza', description: 'Medición de fuerzas y torques' },
  { id: 'humedad', name: 'Humedad', description: 'Medición de humedad relativa' },
  { id: 'masa', name: 'Masa', description: 'Mediciones de masa y peso' },
  { id: 'par-torsional', name: 'Par Torsional', description: 'Medición de torque y par' },
  { id: 'presion', name: 'Presion', description: 'Mediciones de presión y vacío' },
  { id: 'quimica', name: 'Quimica', description: 'Mediciones químicas' },
  { id: 'Reporte Diagnostico', name: 'Reporte Diagnostico', description: 'Mediciones de reporte diagnóstico' },
  { id: 'temperatura', name: 'Temperatura', description: 'Mediciones térmicas' },
  { id: 'tiempo', name: 'Tiempo', description: 'Mediciones temporales' },
  { id: 'volumen', name: 'Volumen', description: 'Mediciones volumétricas' }
];

const magnitudesTrazables = [
  { id: 'acustica Trazable', name: 'Acustica Trazable', description: 'Medición de sonido y vibraciones' },
  { id: 'dimensional Trazable', name: 'Dimensional Trazable', description: 'Mediciones de longitud y dimensiones' },
  { id: 'dureza Trazable', name: 'Dureza Trazable', description: 'Mediciones de dureza' },
  { id: 'electrica Trazable', name: 'Electrica Trazable', description: 'Mediciones eléctricas y electrónicas' },
  { id: 'flujo Trazable', name: 'Flujo Trazable', description: 'Medición de fluidos y caudales' },
  { id: 'frecuencia Trazable', name: 'Frecuencia Trazable', description: 'Mediciones de frecuencia y tiempo' },
  { id: 'masa Trazable', name: 'Masa Trazable', description: 'Mediciones de masa y peso' },
  { id: 'Optica Trazable', name: 'Optica Trazable', description: 'Mediciones ópticas' },
  { id: 'par-torsional Trazable', name: 'Par Torsional Trazable', description: 'Medición de torque y par' },
  { id: 'presion Trazable', name: 'Presion Trazable', description: 'Mediciones de presion y vacio' },
  { id: 'Temperatura Trazable', name: 'Temperatura Trazable', description: 'Mediciones térmicas' },
  { id: 'volumen Trazable', name: 'Volumen Trazable', description: 'Mediciones volumétricas' },
  { id: 'fuerza Trazable', name: 'Fuerza Trazable', description: 'Medición de fuerzas y torques' },
  { id: 'Vibracion Trazable', name: 'Vibracion Trazable', description: 'Mediciones de vibraciones' },
];

export const ConsecutivosScreen: React.FC = () => {
  const { navigateTo, goBack } = useNavigation();
  const [activeTab, setActiveTab] = useState<ServiceTab>('acreditado');
  const [searchTerm, setSearchTerm] = useState('');

  const accent = activeTab === 'acreditado' ? 'acreditado' : 'trazable';
  const theme = flowAccents[accent];
  const currentList = activeTab === 'acreditado' ? magnitudesAcreditadas : magnitudesTrazables;
  
  const filteredList = currentList.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMagnitudeClick = (magnitude: { id: string; name: string; description: string }) => {
    navigateTo('magnitude-detail', { magnitude });
  };

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900 font-sans">
      <FlowScreenHeader
        accent={accent}
        iconVariant="brand"
        title="Gestión de Consecutivos"
        subtitle="Selecciona la magnitud para generar un nuevo folio"
        onBack={goBack}
        icon={
          <img
            src={labLogo}
            className="w-full h-full object-contain"
            alt="AGG Metrología"
          />
        }
        badge={
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${theme.chipSolid}`}>
            {activeTab}
          </span>
        }
        rightSlot={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-white">
            <Hash className="w-3.5 h-3.5 shrink-0" />
            {filteredList.length} magnitudes
          </span>
        }
      />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
          <ElectricServiceTabs value={activeTab} onChange={setActiveTab} />

          <div className="relative w-full sm:flex-1 sm:max-w-md lg:max-w-sm group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
            <input
              type="search"
              placeholder="Buscar magnitud..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredList.map((magnitude) => {
            const cardAccent = isTrazableMagnitudId(magnitude.id) ? 'trazable' : 'acreditado';
            return (
              <button
                key={magnitude.id}
                type="button"
                onClick={() => handleMagnitudeClick(magnitude)}
                className={`group text-left bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-slate-300 active:scale-[0.99] transition-all duration-200 overflow-hidden ring-1 ${theme.cardRing} ${theme.cardAccent} border-l-[5px] flex flex-row sm:flex-col items-stretch sm:items-start gap-3 sm:gap-0 p-3.5 sm:p-5 min-h-[5.5rem] sm:min-h-0`}
              >
                <div className="flex items-start justify-between sm:w-full sm:mb-4 shrink-0">
                  <MagnitudeCardVisual magnitudeId={magnitude.id} accent={cardAccent} size="sm" />
                  <ChevronRight className="hidden sm:block w-5 h-5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all ml-auto" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center sm:justify-start pr-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-slate-900 font-bold text-sm sm:text-base truncate" title={magnitude.name}>
                      {magnitude.name}
                    </h3>
                    {cardAccent === 'trazable' && (
                      <span className="sm:hidden shrink-0 text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                        TRZ
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1.5 line-clamp-2 leading-snug sm:leading-relaxed">
                    {magnitude.description}
                  </p>
                  <div className="mt-2 hidden sm:flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-blue-600 transition-colors">
                    <span>Abrir</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                <ChevronRight className="sm:hidden w-5 h-5 text-slate-300 self-center shrink-0" />
              </button>
            );
          })}
        </div>

        {filteredList.length === 0 && (
          <div className="text-center py-16 sm:py-20 bg-white/70 rounded-2xl border border-dashed border-slate-200 mt-4 px-4">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 rounded-2xl mb-4">
              <Search className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-900 font-semibold">No se encontraron resultados</h3>
            <p className="text-slate-500 text-sm mt-1">Intenta buscar con otro término.</p>
          </div>
        )}
      </main>
    </div>
  );
};
