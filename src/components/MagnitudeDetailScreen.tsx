import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Plus, Minus, Calendar, User, Hash } from 'lucide-react';
import { generarConsecutivo } from '../utils/firebaseConsecutivos';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getPrefijo } from '../utils/prefijos';

export const MagnitudeDetailScreen: React.FC = () => {
  const { selectedMagnitude, goBack, navigateTo } = useNavigation();
  const [generando, setGenerando] = useState(false);
  const { user } = useAuth();

  // Estado para consecutivos
  const [consecutivos, setConsecutivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
            
            {/* Botón Deshacer: Solo si tienes lógica para revertir */}
            <button
              onClick={() => alert("Funcionalidad pendiente")}
              className="bg-gradient-to-r from-red-500 to-rose-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-red-600 hover:to-rose-700 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2"
            >
              <Minus className="w-5 h-5" />
              <span>Deshacer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
