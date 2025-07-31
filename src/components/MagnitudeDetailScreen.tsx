import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Plus, Minus, Calendar, User, Hash } from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getPrefijo } from '../utils/prefijos';

// NUEVA FUNCIÓN: Genera el primer consecutivo libre
async function generarConsecutivo(magnitud: string, anio: string, usuario: string) {
  const prefijo = getPrefijo(magnitud);
  // 1. Trae TODOS los consecutivos de esa magnitud y año
  const col = collection(db, "consecutivos");
  const q = query(col, where("magnitud", "==", magnitud), where("anio", "==", anio));
  const snap = await getDocs(q);

  // 2. Extrae los números
  const usados = new Set<number>();
  snap.forEach(docu => {
    const match = /-(\d+)-/.exec(docu.data().consecutivo);
    if (match) usados.add(Number(match[1]));
  });

  // 3. Busca el primer hueco (por ejemplo, el 11 si borraste ese)
  let siguiente = 1;
  while (usados.has(siguiente)) {
    siguiente++;
  }

  // 4. Arma el consecutivo: ejemplo AGPT-0011-24
  const consecutivoStr = `${prefijo}-${siguiente.toString().padStart(4, "0")}-${anio}`;

  // 5. Guarda el nuevo consecutivo en Firestore
  const fecha = new Date();
  const consecutivoDoc = {
    consecutivo: consecutivoStr,
    magnitud,
    anio,
    usuario,
    fecha,
  };
  await db.collection("consecutivos").add(consecutivoDoc);

  return consecutivoStr;
}

export const MagnitudeDetailScreen: React.FC = () => {
  const { selectedMagnitude, goBack, navigateTo } = useNavigation();
  const [generando, setGenerando] = useState(false);
  const { user } = useAuth();

  // Estado para consecutivos
  const [consecutivos, setConsecutivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ------------ NUEVO: Estados para Deshacer --------------
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

  // NUEVO: Abrir modal de deshacer
  const handleOpenDeshacerModal = () => {
    setDeshacerModalOpen(true);
    setError(null);
    setConsecutivoAEliminar(null);
  };

  // NUEVO: Seleccionar consecutivo a eliminar
  const handleSeleccionarAEliminar = (consecutivo: any) => {
    setConsecutivoAEliminar(consecutivo);
  };

  // NUEVO: Eliminar consecutivo y hoja de trabajo
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
      'temperatura': '🌡️',
      'volumen': '📦'
    };
    return icons[name?.toLowerCase()] || '🔬';
  };

  // Datos para mostrar
  const actual = consecutivos[0];
  const anterior = consecutivos[1];

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
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-2xl">{getMagnitudeIcon(selectedMagnitude || '')}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Detalles</h1>
              <p className="text-sm text-gray-500">{selectedMagnitude}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Instrument Display */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 text-center">
            <div className="w-32 h-32 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
              <div className="w-24 h-24 bg-black rounded-lg flex items-center justify-center">
                <div className="text-green-400 font-mono text-sm">53.8</div>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 capitalize mb-2">{selectedMagnitude}</h2>
          </div>

          {/* Consecutive Info */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <div className="space-y-4">
              {/* Consecutivo Actual */}
              {actual && (
                <>
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-5 h-5 text-blue-500" />
                    <span className="text-gray-700">
                      {actual.fecha && actual.fecha.toDate
                        ? actual.fecha.toDate().toLocaleString()
                        : ""}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Hash className="w-5 h-5 text-green-500" />
                    <span className="font-mono text-lg font-semibold text-gray-900">{actual.consecutivo}</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-purple-500" />
                    <span className="text-red-600 font-medium">{actual.usuario}</span>
                  </div>
                </>
              )}

              {/* Consecutivo Anterior */}
              {anterior && (
                <>
                  <div className="flex items-center space-x-3">
                    <Hash className="w-5 h-5 text-orange-500" />
                    <span className="font-mono text-gray-700">{anterior.consecutivo}</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <User className="w-5 h-5 text-blue-500" />
                    <span className="text-gray-700 italic">{anterior.usuario}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleGenerarConsecutivo}
              disabled={loading || generando}
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              <Plus className="w-5 h-5" />
              <span>
                {loading || generando ? "Generando..." : "Generar Consecutivo"}
              </span>
            </button>
            
            {/* Botón Deshacer: Ahora sí funcional */}
            <button
              onClick={handleOpenDeshacerModal}
              className="bg-gradient-to-r from-red-500 to-rose-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-red-600 hover:to-rose-700 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2"
            >
              <Minus className="w-5 h-5" />
              <span>Deshacer</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal para Deshacer Consecutivo */}
      {deshacerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Selecciona el consecutivo a deshacer</h3>
            <div className="space-y-2">
              {consecutivos
                .filter(cons => cons.usuario === user.name)
                .map((cons) => (
                  <button
                    key={cons.consecutivo}
                    onClick={() => handleSeleccionarAEliminar(cons)}
                    className={`block w-full text-left px-4 py-2 rounded-lg border ${
                      consecutivoAEliminar && consecutivoAEliminar.consecutivo === cons.consecutivo
                        ? "bg-red-100 border-red-400 font-bold"
                        : "hover:bg-gray-100 border-gray-200"
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
                className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-800"
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
