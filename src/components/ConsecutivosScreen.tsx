import React, { useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { 
  ArrowLeft, 
  Search, 
  Activity, 
  Ruler, 
  Zap, 
  Waves, 
  Radio, 
  Dumbbell, 
  Droplets, 
  Scale, 
  Wrench, 
  Gauge, 
  FlaskConical, 
  FileText, 
  Thermometer, 
  Timer, 
  Box, 
  Eye, 
  Vibrate,
  ChevronRight
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png'; 

// Helper to render the correct icon based on the ID or Name
const getIcon = (id: string) => {
  const normalized = id.toLowerCase();
  if (normalized.includes('acustica')) return <Activity className="w-6 h-6" />;
  if (normalized.includes('dimensional')) return <Ruler className="w-6 h-6" />;
  if (normalized.includes('electrica')) return <Zap className="w-6 h-6" />;
  if (normalized.includes('flujo')) return <Waves className="w-6 h-6" />;
  if (normalized.includes('frecuencia')) return <Radio className="w-6 h-6" />;
  if (normalized.includes('fuerza')) return <Dumbbell className="w-6 h-6" />;
  if (normalized.includes('humedad')) return <Droplets className="w-6 h-6" />;
  if (normalized.includes('masa')) return <Scale className="w-6 h-6" />;
  if (normalized.includes('torsional')) return <Wrench className="w-6 h-6" />;
  if (normalized.includes('presion')) return <Gauge className="w-6 h-6" />;
  if (normalized.includes('quimica')) return <FlaskConical className="w-6 h-6" />;
  if (normalized.includes('reporte')) return <FileText className="w-6 h-6" />;
  if (normalized.includes('temperatura')) return <Thermometer className="w-6 h-6" />;
  if (normalized.includes('tiempo')) return <Timer className="w-6 h-6" />;
  if (normalized.includes('volumen')) return <Box className="w-6 h-6" />;
  if (normalized.includes('optica')) return <Eye className="w-6 h-6" />;
  if (normalized.includes('vibracion')) return <Vibrate className="w-6 h-6" />;
  if (normalized.includes('dureza')) return <Dumbbell className="w-6 h-6" />;
  return <Activity className="w-6 h-6" />;
};

// DATA: Using the EXACT names required by the Database logic
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
  { id: 'acustica Trazable', name: 'AcusticaTrazable', description: 'Medición de sonido y vibraciones' },
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
  const [activeTab, setActiveTab] = useState<'acreditado' | 'trazable'>('acreditado');
  const [searchTerm, setSearchTerm] = useState('');

  const currentList = activeTab === 'acreditado' ? magnitudesAcreditadas : magnitudesTrazables;
  
  const filteredList = currentList.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMagnitudeClick = (magnitude: any) => {
    // IMPORTANT: We pass the whole object. The logic relies on magnitude.name
    navigateTo('magnitude-detail', { magnitude });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={goBack} 
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center overflow-hidden">
                 <img 
                    src={labLogo} 
                    className="w-6 h-6 object-contain" 
                    alt="Logo" 
                    onError={(e) => e.currentTarget.style.display='none'} 
                 />
              </div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">Gestión de Consecutivos</h1>
            </div>
          </div>
          
          <div className={`hidden sm:flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border ${activeTab === 'acreditado' ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
            <div className={`w-2 h-2 rounded-full ${activeTab === 'acreditado' ? 'bg-blue-500' : 'bg-amber-500'}`}></div>
            <span className="font-semibold capitalize">{activeTab}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 justify-between items-start sm:items-center">
          <div className="p-1 bg-slate-200/60 rounded-lg flex w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('acreditado')}
              className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'acreditado' 
                  ? 'bg-white text-blue-700 shadow-sm ring-1 ring-black/5' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Acreditado
            </button>
            <button
              onClick={() => setActiveTab('trazable')}
              className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'trazable' 
                  ? 'bg-white text-amber-700 shadow-sm ring-1 ring-black/5' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              Trazable
            </button>
          </div>

          <div className="relative w-full sm:w-72 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar magnitud..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredList.map((magnitude) => (
            <div
              key={magnitude.id}
              onClick={() => handleMagnitudeClick(magnitude)}
              className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-3 rounded-lg ${activeTab === 'acreditado' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'} group-hover:scale-110 transition-transform`}>
                  {getIcon(magnitude.id)}
                </div>
                {activeTab === 'trazable' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                    Trazable
                  </span>
                )}
              </div>
              
              <div>
                <h3 className="text-slate-900 font-semibold text-base group-hover:text-blue-700 transition-colors truncate" title={magnitude.name}>
                  {magnitude.name}
                </h3>
                <p className="text-slate-500 text-xs mt-1 line-clamp-2">
                  {magnitude.description}
                </p>
              </div>

              <div className="absolute bottom-4 right-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
              </div>
            </div>
          ))}
        </div>

        {filteredList.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-900 font-medium">No se encontraron resultados</h3>
            <p className="text-slate-500 text-sm">Intenta buscar con otro término.</p>
          </div>
        )}
      </main>
    </div>
  );
};