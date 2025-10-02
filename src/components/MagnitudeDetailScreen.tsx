import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Plus, Minus, Calendar, User, Hash } from 'lucide-react';
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
    return icons[name?.toLowerCase()] || '🔬';
  };

  // Datos para mostrar
  const actual = consecutivos[0];
  const anterior = consecutivos[1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 flex flex-col">
      {/* Header */}
      <div className="bg-white/80 dark:bg-slate-950/90 shadow-lg border-b border-blue-300/40 sticky top-0 z-30 backdrop-blur">
        <div className="px-6 py-4 flex items-center space-x-4">
          <button 
            onClick={goBack}
            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors shadow"
          >
            <ArrowLeft className="w-5 h-5 text-blue-700 dark:text-blue-300" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-400 rounded-xl flex items-center justify-center shadow-lg border border-white/50 dark:border-slate-700">
              <span className="text-3xl">{getMagnitudeIcon(selectedMagnitude || '')}</span>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">Detalles</h1>
              <p className="text-sm text-blue-600 dark:text-blue-200 font-medium">{selectedMagnitude}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-8">
        <div className="w-full max-w-xl">
          {/* Instrument Display */}
          <div className="relative bg-gradient-to-br from-white/70 via-slate-100/70 to-blue-100/80 dark:from-blue-900 dark:via-blue-950 dark:to-slate-950 rounded-3xl shadow-2xl p-0 mb-10 overflow-visible transition-all duration-300">
            {/* Imagen con glow y relieve */}
            <div className="flex flex-col items-center -mt-16">
              <div className="relative w-40 h-40 flex items-center justify-center drop-shadow-xl z-10">
                <div className="absolute w-full h-full rounded-2xl bg-gradient-to-br from-yellow-300 via-orange-500 to-pink-600 opacity-30 blur-2xl animate-pulse" />
                <div className="w-36 h-36 bg-white dark:bg-slate-900 border-4 border-blue-200 dark:border-blue-800 rounded-2xl flex items-center justify-center shadow-lg ring-4 ring-blue-300/10 relative overflow-hidden">
                  <img
                    src={magnitudImages[selectedMagnitude] || "/images/default.png"}
                    alt={selectedMagnitude}
                    className="w-32 h-32 object-contain scale-110 drop-shadow-lg animate-glow"
                    style={{
                      filter: "drop-shadow(0 4px 24px #38bdf8cc)"
                    }}
                  />
                </div>
              </div>
              <h2 className="mt-4 text-3xl font-bold text-blue-900 dark:text-blue-100 capitalize tracking-wide drop-shadow-lg">
                {selectedMagnitude}
              </h2>
            </div>
            {/* Glow borde exterior */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-48 h-10 rounded-full bg-blue-200/40 blur-lg z-0" />
          </div>

          {/* Consecutive Info */}
          <div className="bg-white/90 dark:bg-slate-900 rounded-2xl shadow-xl p-6 mb-8">
            <div className="space-y-5">
              {actual && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-6 h-6 text-blue-400 dark:text-blue-300" />
                    <span className="text-gray-700 dark:text-blue-100 font-medium">
                      {actual.fecha && actual.fecha.toDate
                        ? actual.fecha.toDate().toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Hash className="w-6 h-6 text-green-500 dark:text-green-400" />
                    <span className="font-mono text-2xl font-bold text-gray-900 dark:text-green-300 drop-shadow">
                      {actual.consecutivo}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="w-6 h-6 text-purple-500 dark:text-purple-300" />
                    <span className="text-rose-600 dark:text-pink-300 font-semibold">{actual.usuario}</span>
                  </div>
                </div>
              )}
              {anterior && (
                <div className="flex flex-col gap-2 border-t border-dashed border-blue-200 dark:border-blue-700 pt-4 mt-2">
                  <div className="flex items-center gap-3">
                    <Hash className="w-5 h-5 text-orange-400 dark:text-orange-300" />
                    <span className="font-mono text-lg text-gray-700 dark:text-gray-200">{anterior.consecutivo}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-blue-400 dark:text-blue-300" />
                    <span className="text-gray-500 italic dark:text-gray-300">{anterior.usuario}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={handleGenerarConsecutivo}
              disabled={loading || generando}
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-6 rounded-2xl font-bold shadow-xl hover:from-green-600 hover:to-emerald-700 hover:scale-105 transition-all flex items-center justify-center gap-2 ring-2 ring-green-200/30 dark:ring-emerald-700/40 disabled:opacity-60"
            >
              <Plus className="w-6 h-6" />
              <span>
                {loading || generando ? "Generando..." : "Generar Consecutivo"}
              </span>
            </button>
            <button
              onClick={handleOpenDeshacerModal}
              className="bg-gradient-to-r from-red-500 to-rose-600 text-white py-4 px-6 rounded-2xl font-bold shadow-xl hover:from-red-600 hover:to-rose-700 hover:scale-105 transition-all flex items-center justify-center gap-2 ring-2 ring-red-200/30 dark:ring-red-700/40"
            >
              <Minus className="w-6 h-6" />
              <span>Deshacer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal para Deshacer Consecutivo */}
      {deshacerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center animate-fadein">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-md w-full border-2 border-blue-200/40 dark:border-blue-800/50 relative animate-modalpop">
            <h3 className="text-xl font-extrabold mb-4 text-gray-900 dark:text-blue-100">Selecciona el consecutivo a deshacer</h3>
            <div className="space-y-2">
              {consecutivos
                .filter(cons => cons.usuario === user.name)
                .map((cons) => (
                  <button
                    key={cons.consecutivo}
                    onClick={() => handleSeleccionarAEliminar(cons)}
                    className={`block w-full text-left px-4 py-2 rounded-lg border-2 transition-colors font-mono text-base ${
                      consecutivoAEliminar && consecutivoAEliminar.consecutivo === cons.consecutivo
                        ? "bg-red-100/80 dark:bg-red-900/60 border-red-400 text-red-900 dark:text-red-200 font-extrabold ring-2 ring-red-400/20"
                        : "hover:bg-blue-50/60 dark:hover:bg-blue-800/50 border-blue-200 dark:border-blue-700 text-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {cons.consecutivo} — {cons.usuario}
                  </button>
              ))}
              {consecutivos.filter(cons => cons.usuario === user.name).length === 0 && (
                <div className="text-gray-500 text-sm mt-2">No tienes consecutivos para deshacer.</div>
              )}
            </div>
            {error && <div className="text-red-600 mt-2">{error}</div>}
            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setDeshacerModalOpen(false)}
                className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-100"
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarConsecutivo}
                disabled={!consecutivoAEliminar || eliminando}
                className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-700 text-white font-semibold"
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
