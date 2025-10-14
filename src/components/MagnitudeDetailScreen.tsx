import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Plus, Minus, Calendar, User, Hash, Zap, Code } from 'lucide-react'; 
import { generarConsecutivo } from '../utils/firebaseConsecutivos';
import { collection, query, where, orderBy, limit, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import masterCelestica from "../data/masterCelestica.json";
import { getPrefijo } from '../utils/prefijos';
import { m } from 'framer-motion';

const magnitudImages: Record<string, string> = {
  Acustica: "/images/acustica.png",
  Dimensional: "/images/dimensional.png",
  Temperatura: "/images/temperatura.png",
  Humedad: "/images/humedad.png",
  Flujo: "/images/flujo.png",
  Presion: "/images/presion.png",
  Fuerza: "/images/fuerza.png",
  Electrica: "/images/electrica.png",
  Frecuencia: "/images/frecuencia.png",
  Dureza: "/images/dureza.png",
  Volumen: "/images/volumen.png",
  "Par Torsional": "/images/par-torsional.png",
  Optica: "/images/optica.png",
  Quimica: "/images/quimica.png",
  Tiempo: "/images/tiempo.png",

  ParTorsionalTrazable: "/images/par-torsional-trazable.png",
  AcusticaTrazable: "/images/acustica.png",
  DimensionalTrazable: "/images/dimensional.png",
  TemperaturaTrazable: "/images/temperatura-trazable.png",
  HumedadTrazable: "/images/humedad-trazable.png",
  FlujoTrazable: "/images/flujo-trazable.png",
  PresionTrazable: "/images/presion-trazable.png",
  FuerzaTrazable: "/images/fuerza-trazable.png",
  ElectricaTrazable: "/images/electrica.png",
  FrecuenciaTrazable: "/images/frecuencia-trazable.png",
  DurezaTrazable: "/images/dureza-trazable.png",
  MasaTrazable: "/images/masa.png",
  VolumenTrazable: "/images/volumen-trazable.png",
  OpticaTrazable: "/images/optica-trazable.png",
  Masa: "/images/masa.png",
  ParTorsional: "/images/par-torsional.png",
  VibracionTrazable: "/images/vibracion-trazable.png",
  // agrega las que uses en selectedMagnitude
};

export const MagnitudeDetailScreen: React.FC = () => {
  const { selectedMagnitude, goBack, navigateTo } = useNavigation();
  const [generando, setGenerando] = useState(false);
  const { user } = useAuth();

  // Estado para consecutivos
  const [consecutivos, setConsecutivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ------------ Estados para Deshacer --------------
  const [deshacerModalOpen, setDeshacerModalOpen] = useState(false);
  const [consecutivoAEliminar, setConsecutivoAEliminar] = useState<any | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // --------------------------------------------------------

  // ----------- ESCUCHA EN TIEMPO REAL (onSnapshot) -----------------
  useEffect(() => {
    if (!selectedMagnitude) return;
    setLoading(true);

    // Consulta para escuchar solo los últimos 2 consecutivos de la magnitud
    const q = query(
      collection(db, "consecutivos"),
      where("magnitud", "==", selectedMagnitude),
      orderBy("fecha", "desc"),
      limit(2)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cons: any[] = [];
      snapshot.forEach(doc => cons.push(doc.data()));
      setConsecutivos(cons);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      console.error(error);
    });

    return () => unsubscribe();
  }, [selectedMagnitude]);
  // -----------------------------------------------------------------

  // Generar un nuevo consecutivo y navega a hoja de trabajo
  const handleGenerarConsecutivo = async () => {
    setGenerando(true);
    try {
      const anio = new Date().getFullYear().toString().slice(-2);
      setLoading(true);
      const consecutivo = await generarConsecutivo(selectedMagnitude, anio, user.name);
      // No hace falta refrescar manualmente, onSnapshot lo hace
      navigateTo('work-sheet', { consecutive: consecutivo, magnitud: selectedMagnitude });
    } catch (error) {
      console.error(error);
    } finally {
      setGenerando(false);
      setLoading(false);
    }
  };

  // Abrir modal de deshacer
  const handleOpenDeshacerModal = () => {
    setDeshacerModalOpen(true);
    setError(null);
    setConsecutivoAEliminar(null);
  };

  // Seleccionar consecutivo a eliminar
  const handleSeleccionarAEliminar = (consecutivo: any) => {
    setConsecutivoAEliminar(consecutivo);
  };

  // Eliminar consecutivo y hoja de trabajo
  const handleEliminarConsecutivo = async () => {
    if (!consecutivoAEliminar) return;
    setEliminando(true);
    setError(null);

    try {
      // Elimina consecutivo de Firestore
      const q = query(
        collection(db, "consecutivos"),
        where("consecutivo", "==", consecutivoAEliminar.consecutivo),
        where("magnitud", "==", selectedMagnitude)
      );
      const snapshot = await getDocs(q);
      for (const docu of snapshot.docs) {
        await deleteDoc(doc(db, "consecutivos", docu.id));
      }

      // Elimina hoja de trabajo relacionada
      const q2 = query(
        collection(db, "worksheets"),
        where("consecutivo", "==", consecutivoAEliminar.consecutivo),
        where("magnitud", "==", selectedMagnitude)
      );
      const wsSnapshot = await getDocs(q2);
      for (const docu of wsSnapshot.docs) {
        await deleteDoc(doc(db, "worksheets", docu.id));
      }

      setDeshacerModalOpen(false);
      setConsecutivoAEliminar(null);
    } catch (err: any) {
      setError("Error al eliminar. Intenta de nuevo.");
    } finally {
      setEliminando(false);
    }
  };

  // Iconos por magnitud
  const getMagnitudeIcon = (name: string) => {
    const icons: { [key: string]: string } = {
      'acustica': '🔊',
      'dimensional': '📏',
      'electrica': '⚡',
      'flujo': '🌊',
      'frecuencia': '📡',
      'fuerza': '💪',
      'humedad': '💧',
      'masa': '⚖️',
      'par-torsional': '🔧',
      'presion': '📊',
      'quimica': '🔬',
      'Reporte Diagnostico': '📊',
      'temperatura': '🌡️',
      'tiempo': '⏱️',
      'volumen': '📦'
    };
    return icons[name?.toLowerCase()] || '⚙️';
  };

  // Datos para mostrar
  const actual = consecutivos[0];
  const anterior = consecutivos[1];

  return (
    // Fondo más oscuro y con gradiente radial para profundidad
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      {/* Background Radial Gradient */}
      <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30 pointer-events-none">
        <div className="w-[120vw] h-[120vw] bg-blue-900 rounded-full blur-[100px] absolute top-[-50vh] left-[-50vw] sm:top-[-30vh] sm:left-[-30vw] transform" style={{ background: 'radial-gradient(circle, rgba(23,37,84,1) 0%, rgba(15,23,42,0) 70%)' }} />
        <div className="w-96 h-96 bg-indigo-900 rounded-full blur-[100px] absolute bottom-0 right-0 transform translate-x-1/2 translate-y-1/2" style={{ background: 'radial-gradient(circle, rgba(79,70,229,1) 0%, rgba(15,23,42,0) 70%)' }} />
      </div>

      {/* Header (Sticky, High-Contrast Glassmorphism) */}
      <div className="bg-slate-900/90 shadow-xl sticky top-0 z-30 backdrop-blur-md border-b border-blue-700/50">
        <div className="px-4 sm:px-6 py-4 flex items-center space-x-4 max-w-2xl mx-auto">
          <button 
            onClick={goBack}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-full transition-all duration-200 shadow-lg border border-blue-800 transform hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 text-cyan-400" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-lg flex items-center justify-center shadow-lg border border-cyan-400/50">
              <span className="text-xl">{getMagnitudeIcon(selectedMagnitude || '')}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide truncate">Detalles</h1>
              <p className="text-sm text-cyan-400 font-medium truncate">{selectedMagnitude}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content (Centered and Padded) */}
      <div className="flex-1 flex flex-col items-center px-4 py-8 z-10">
        <div className="w-full max-w-md sm:max-w-xl mx-auto">
          
          {/* Instrument Display Card (Visual Centerpiece - More "3D") */}
          <div className="relative bg-slate-900 rounded-3xl shadow-[0_0_50px_rgba(59,130,246,0.3)] p-6 pt-16 mb-8 overflow-visible transition-all duration-300 border border-blue-700/70">
            {/* Imagen y Título */}
            <div className="flex flex-col items-center -mt-24">
              <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center drop-shadow-xl z-10">
                {/* Neon Glow Effect */}
                <div className="absolute w-full h-full rounded-3xl bg-gradient-to-br from-yellow-400 via-pink-500 to-red-600 opacity-30 blur-xl animate-pulse" />
                {/* Icon Container with Inner Shadow */}
                <div className="w-32 h-32 sm:w-36 sm:h-36 bg-slate-950 border-4 border-cyan-500 rounded-3xl flex items-center justify-center shadow-inner shadow-cyan-900/50 ring-4 ring-cyan-500/10 relative overflow-hidden transform transition-transform duration-300 hover:scale-[1.05]">
                  <img
                    src={magnitudImages[selectedMagnitude] || "/images/default.png"}
                    alt={selectedMagnitude}
                    className="w-28 h-28 sm:w-32 sm:h-32 object-contain drop-shadow-xl transition-all duration-500 hover:rotate-3" // Sutil animación al hacer hover
                    style={{
                      filter: "drop-shadow(0 0 10px #22d3ee)" // Cian glow
                    }}
                  />
                </div>
              </div>
              <h2 className="mt-4 text-3xl font-extrabold text-white capitalize tracking-tight drop-shadow-md text-center">
                {selectedMagnitude}
              </h2>
            </div>
          </div>

          {/* Consecutive Info Card (Data Display - High Contrast) */}
          <div className="bg-slate-900/90 rounded-2xl shadow-2xl p-5 mb-8 backdrop-blur-sm border border-blue-700/50 shadow-blue-900/30">
            <h3 className="text-lg font-bold mb-4 text-cyan-400 flex items-center gap-2"><Code className="w-5 h-5"/> Registro de Datos</h3>
            <div className="space-y-4">
              {actual && (
                <div className="flex flex-col gap-2 p-3 bg-slate-800 rounded-xl border border-green-600/50 shadow-inner shadow-green-900/30">
                  <span className="text-xs font-semibold uppercase text-green-400">Último Consecutivo Generado</span>
                  
                  <div className="flex items-center gap-3">
                    <Hash className="w-6 h-6 text-green-500 min-w-[1.5rem]" />
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-green-300 truncate tracking-wider">
                      {actual.consecutivo}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm pt-2 border-t border-dashed border-slate-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-400 min-w-[1rem]" />
                      <span className="text-slate-300 font-medium truncate">
                        {actual.fecha && actual.fecha.toDate
                          ? actual.fecha.toDate().toLocaleString()
                          : "Fecha Desconocida"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-purple-400 min-w-[1rem]" />
                      <span className="text-pink-400 font-semibold truncate">{actual.usuario}</span>
                    </div>
                  </div>
                </div>
              )}
              {anterior && (
                <div className="flex flex-col gap-2 pt-2 p-2 border-t border-dashed border-slate-800">
                  <span className="text-xs font-semibold uppercase text-slate-500">Anterior</span>
                  <div className="flex items-center gap-3">
                    <Hash className="w-4 h-4 text-orange-500 min-w-[1rem]" />
                    <span className="font-mono text-lg text-slate-300 font-semibold truncate">{anterior.consecutivo}</span>
                    <span className="text-slate-500 italic text-sm truncate ml-auto">{anterior.usuario}</span>
                  </div>
                </div>
              )}
              {!actual && (
                 <div className="text-center py-4 text-slate-500 italic text-sm">No hay consecutivos recientes para esta magnitud.</div>
              )}
            </div>
          </div>

          {/* Action Buttons (More aggressive gradients and shadow) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <button
              onClick={handleGenerarConsecutivo}
              disabled={loading || generando}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-4 rounded-xl font-extrabold shadow-lg shadow-green-700/50 hover:from-green-600 hover:to-emerald-700 active:shadow-none active:translate-y-0.5 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none disabled:transform-none text-lg border border-green-400/50"
            >
              <Plus className="w-6 h-6" />
              <span className='truncate'>
                {loading || generando ? "Generando..." : "Generar Consecutivo"}
              </span>
            </button>
            <button
              onClick={handleOpenDeshacerModal}
              className="w-full bg-gradient-to-r from-red-500 to-rose-600 text-white py-4 px-4 rounded-xl font-extrabold shadow-lg shadow-red-700/50 hover:from-red-600 hover:to-rose-700 active:shadow-none active:translate-y-0.5 transition-all duration-150 flex items-center justify-center gap-2 text-lg border border-red-400/50"
            >
              <Minus className="w-6 h-6" />
              <span>Deshacer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal para Deshacer Consecutivo (Dark & Focused) */}
      {deshacerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 transition-opacity duration-300 animate-fadein">
          <div className="bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm sm:max-w-md w-full border border-red-700/50 relative transform transition-transform duration-300 animate-modalpop">
            <h3 className="text-xl font-extrabold mb-4 text-red-400 border-b pb-2 border-dashed border-slate-700">Eliminar Consecutivo</h3>
            <p className="mb-4 text-sm text-slate-400">Selecciona uno de *tus* consecutivos recientes para deshacerlo.</p>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
              {consecutivos
                .filter(cons => cons.usuario === user.name)
                .map((cons) => (
                  <button
                    key={cons.consecutivo}
                    onClick={() => handleSeleccionarAEliminar(cons)}
                    className={`block w-full text-left p-3 rounded-lg border-2 transition-all duration-150 font-mono text-base ${
                      consecutivoAEliminar && consecutivoAEliminar.consecutivo === cons.consecutivo
                        ? "bg-red-800/40 border-red-500 text-red-200 font-extrabold ring-2 ring-red-500/20 shadow-lg shadow-red-900/50"
                        : "bg-slate-800 hover:bg-red-900/30 border-slate-700 text-slate-100"
                    }`}
                  >
                    <span className='font-bold'>{cons.consecutivo}</span> <span className='text-xs italic text-slate-400'>({cons.usuario})</span>
                  </button>
              ))}
              {consecutivos.filter(cons => cons.usuario === user.name).length === 0 && (
                <div className="text-slate-500 text-center text-sm p-4 border border-dashed border-slate-700 rounded-lg">No tienes consecutivos recientes que puedas deshacer.</div>
              )}
            </div>
            {error && <div className="text-red-400 mt-4 p-2 bg-red-900/30 rounded-lg text-sm font-medium border border-red-500/50">{error}</div>}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setDeshacerModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium transition-colors"
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarConsecutivo}
                disabled={!consecutivoAEliminar || eliminando}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {eliminando ? "Eliminando..." : "Deshacer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};