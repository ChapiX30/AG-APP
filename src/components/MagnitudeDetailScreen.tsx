import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { 
  ArrowLeft, 
  Plus, 
  RotateCcw, 
  Calendar, 
  User, 
  Hash, 
  History, 
  AlertTriangle,
  CheckCircle2,
  Activity,
  Trash2
} from 'lucide-react';
import { generarConsecutivo } from '../utils/firebaseConsecutivos';
import { 
  collection, query, where, orderBy, limit, onSnapshot, 
  doc, deleteDoc, getDocs, getDoc, updateDoc, increment, arrayUnion 
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getPrefijo } from '../utils/prefijos'; 

// Extended Image Map to handle variations (with and without spaces)
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

  // Trazables (Normalized)
  ParTorsionalTrazable: "/images/par-torsional-trazable.png",
  "Par Torsional Trazable": "/images/par-torsional-trazable.png",
  
  AcusticaTrazable: "/images/acustica.png",
  "Acustica Trazable": "/images/acustica.png",
  
  DimensionalTrazable: "/images/dimensional.png",
  "Dimensional Trazable": "/images/dimensional.png",
  
  TemperaturaTrazable: "/images/temperatura-trazable.png",
  "Temperatura Trazable": "/images/temperatura-trazable.png",
  
  HumedadTrazable: "/images/humedad-trazable.png",
  "Humedad Trazable": "/images/humedad-trazable.png",
  
  FlujoTrazable: "/images/flujo-trazable.png",
  "Flujo Trazable": "/images/flujo-trazable.png",
  
  PresionTrazable: "/images/presion-trazable.png",
  "Presion Trazable": "/images/presion-trazable.png",
  
  FuerzaTrazable: "/images/fuerza-trazable.png",
  "Fuerza Trazable": "/images/fuerza-trazable.png",
  
  ElectricaTrazable: "/images/electrica.png",
  "Electrica Trazable": "/images/electrica.png",
  
  FrecuenciaTrazable: "/images/frecuencia-trazable.png",
  "Frecuencia Trazable": "/images/frecuencia-trazable.png",
  
  DurezaTrazable: "/images/dureza-trazable.png",
  "Dureza Trazable": "/images/dureza-trazable.png",
  
  MasaTrazable: "/images/masa.png",
  "Masa Trazable": "/images/masa.png",
  
  VolumenTrazable: "/images/volumen-trazable.png",
  "Volumen Trazable": "/images/volumen-trazable.png",
  
  OpticaTrazable: "/images/optica-trazable.png",
  "Optica Trazable": "/images/optica-trazable.png",
  
  Masa: "/images/masa.png",
  ParTorsional: "/images/par-torsional.png",
  VibracionTrazable: "/images/vibracion-trazable.png",
  "Vibracion Trazable": "/images/vibracion-trazable.png",
};

export const MagnitudeDetailScreen: React.FC = () => {
  const { selectedMagnitude, goBack, navigateTo } = useNavigation();
  const [generando, setGenerando] = useState(false);
  const { user } = useAuth();
  const [consecutivos, setConsecutivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [deshacerModalOpen, setDeshacerModalOpen] = useState(false);
  const [consecutivoAEliminar, setConsecutivoAEliminar] = useState<any | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived State
  const isTrazable = selectedMagnitude?.toLowerCase().includes('trazable');
  // Safe Image Lookup (Try direct match, then remove spaces)
  const imageSrc = magnitudImages[selectedMagnitude] || magnitudImages[selectedMagnitude?.replace(/\s/g, '')] || "/images/default.png";

  useEffect(() => {
    if (!selectedMagnitude) return;
    setLoading(true);

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

  const handleGenerarConsecutivo = async () => {
    setGenerando(true);
    try {
      const anio = new Date().getFullYear().toString().slice(-2);
      setLoading(true);
      const consecutivo = await generarConsecutivo(selectedMagnitude, anio, user.name);
      navigateTo('work-sheet', { consecutive: consecutivo, magnitud: selectedMagnitude });
    } catch (error) {
      console.error(error);
    } finally {
      setGenerando(false);
      setLoading(false);
    }
  };

  const handleEliminarConsecutivo = async () => {
    if (!consecutivoAEliminar) return;
    setEliminando(true);
    setError(null);

    try {
      const prefijoContador = getPrefijo(selectedMagnitude);
      const partes = consecutivoAEliminar.consecutivo.split('-');
      
      if (partes.length >= 3) {
        const anioDelBorrado = partes[partes.length - 1]; 
        const numeroStr = partes[partes.length - 2];
        const numeroBorrado = parseInt(numeroStr, 10);

        const contadorRef = doc(db, "contadores", prefijoContador);
        const contadorSnap = await getDoc(contadorRef);

        if (contadorSnap.exists()) {
          const dataContador = contadorSnap.data();
          const valorActualEnBaseDatos = dataContador.valor;
          const anioEnBaseDatos = dataContador.anio || anioDelBorrado;

          if (valorActualEnBaseDatos === numeroBorrado && anioEnBaseDatos === anioDelBorrado) {
             await updateDoc(contadorRef, { valor: increment(-1) });
          } else if (anioEnBaseDatos === anioDelBorrado) {
             await updateDoc(contadorRef, { huecos: arrayUnion(numeroBorrado) });
          }
        }
      }

      const q = query(
        collection(db, "consecutivos"),
        where("consecutivo", "==", consecutivoAEliminar.consecutivo),
        where("magnitud", "==", selectedMagnitude)
      );
      const snapshot = await getDocs(q);
      for (const docu of snapshot.docs) {
        await deleteDoc(doc(db, "consecutivos", docu.id));
      }

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
      console.error(err);
      setError("Error al eliminar. Intenta de nuevo.");
    } finally {
      setEliminando(false);
    }
  };

  const currentYearShort = new Date().getFullYear().toString().slice(-2);
  const isCurrentYear = (record: any) => record?.consecutivo?.endsWith(currentYearShort);
  const actual = isCurrentYear(consecutivos[0]) ? consecutivos[0] : null;
  const anterior = isCurrentYear(consecutivos[1]) ? consecutivos[1] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      
      {/* Header Fijo */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button onClick={goBack} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">{selectedMagnitude}</h1>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mt-0.5">
              <span className={`px-2 py-0.5 rounded-full ${isTrazable ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {isTrazable ? 'Servicio Trazable' : 'Servicio Acreditado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Col: Info & Actions */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Main Dashboard Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
              <img src={imageSrc} alt="" className="w-32 h-32 object-contain grayscale" />
            </div>

            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Estado Actual
              </span>
              {actual ? (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                </span>
              ) : (
                <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-bold">Inactivo</span>
              )}
            </div>

            <div className="p-8 flex flex-col items-center justify-center text-center relative z-10">
               {actual ? (
                 <>
                   <span className="text-sm text-slate-400 font-medium mb-3 uppercase tracking-wider">Último Consecutivo</span>
                   <div className={`font-mono text-5xl sm:text-6xl font-bold tracking-tight mb-8 tabular-nums ${isTrazable ? 'text-amber-600' : 'text-blue-600'}`}>
                     {actual.consecutivo}
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                     <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <Calendar className="w-4 h-4 text-slate-400 mb-1" />
                       <span className="text-xs text-slate-400 font-medium uppercase">Fecha</span>
                       <span className="text-sm font-semibold text-slate-700">
                         {actual.fecha?.toDate ? actual.fecha.toDate().toLocaleDateString() : 'N/A'}
                       </span>
                     </div>
                     <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <User className="w-4 h-4 text-slate-400 mb-1" />
                       <span className="text-xs text-slate-400 font-medium uppercase">Usuario</span>
                       <span className="text-sm font-semibold text-slate-700 truncate w-full text-center">
                         {actual.usuario}
                       </span>
                     </div>
                   </div>
                 </>
               ) : (
                 <div className="py-12 text-slate-400 flex flex-col items-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Hash className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="font-medium text-slate-500">Sin registros este año</p>
                    <p className="text-sm mt-1">Genera un nuevo consecutivo para comenzar.</p>
                 </div>
               )}
            </div>

            {/* Action Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
               <button
                  onClick={handleGenerarConsecutivo}
                  disabled={loading || generando}
                  className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-white transition-all shadow-sm hover:shadow active:scale-[0.99] ${
                    isTrazable 
                      ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 disabled:opacity-50' 
                      : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:opacity-50'
                  }`}
               >
                  {loading || generando ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Plus className="w-5 h-5" />}
                  <span>Generar Nuevo</span>
               </button>
            </div>
          </div>

          {/* History Snippet */}
          {anterior && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-4 h-4" />
                Historial Reciente
              </h3>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                 <div className="flex items-center gap-3">
                   <div className="bg-white p-2 rounded-md shadow-sm border border-slate-200">
                      <Hash className="w-4 h-4 text-slate-400" />
                   </div>
                   <div>
                      <p className="font-mono font-bold text-slate-700">{anterior.consecutivo}</p>
                      <p className="text-xs text-slate-500">{anterior.usuario}</p>
                   </div>
                 </div>
                 <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">ANTERIOR</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Admin/Tools */}
        <div className="space-y-6">
           {/* Visual Aid Card */}
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center text-center">
              <div className="w-24 h-24 mb-4 relative">
                <div className={`absolute inset-0 bg-gradient-to-tr ${isTrazable ? 'from-amber-100 to-orange-50' : 'from-blue-100 to-indigo-50'} rounded-full blur-xl opacity-60`}></div>
                <img src={imageSrc} alt={selectedMagnitude} className="w-full h-full object-contain relative z-10 drop-shadow-sm" />
              </div>
              <h3 className="font-semibold text-slate-800">{selectedMagnitude}</h3>
              <p className="text-sm text-slate-500 mt-1">
                {isTrazable ? "Trazabilidad verificada" : "Acreditación vigente"}
              </p>
           </div>

           {/* Danger Zone */}
           <div className="bg-red-50/50 rounded-xl border border-red-100 p-5">
              <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Zona de Corrección
              </h3>
              <p className="text-xs text-red-600/80 mb-4 leading-relaxed">
                Si generaste un consecutivo por error, puedes deshacerlo aquí. Solo se pueden eliminar registros creados por tu usuario.
              </p>
              <button
                onClick={() => { setDeshacerModalOpen(true); setError(null); setConsecutivoAEliminar(null); }}
                className="w-full py-2.5 bg-white border border-red-200 text-red-700 font-semibold rounded-lg hover:bg-red-50 hover:border-red-300 transition-all shadow-sm text-sm flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Deshacer Último
              </button>
           </div>
        </div>

      </div>

      {/* MODAL DESHACER */}
      {deshacerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-50 p-6 border-b border-red-100">
              <div className="flex items-center gap-3 text-red-800 mb-1">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold">Deshacer Consecutivo</h3>
              </div>
              <p className="text-sm text-red-600 pl-12">
                Selecciona el registro que deseas eliminar permanentemente.
              </p>
            </div>

            <div className="p-6">
               <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                 {consecutivos.filter(cons => cons.usuario === user.name).length > 0 ? (
                   consecutivos
                    .filter(cons => cons.usuario === user.name)
                    .map((cons) => (
                      <button
                        key={cons.consecutivo}
                        onClick={() => setConsecutivoAEliminar(cons)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                          consecutivoAEliminar?.consecutivo === cons.consecutivo
                            ? 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-red-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-slate-800 text-lg">{cons.consecutivo}</span>
                          <span className="text-xs text-slate-500">Creado por ti</span>
                        </div>
                        {consecutivoAEliminar?.consecutivo === cons.consecutivo && (
                          <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    ))
                 ) : (
                   <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                     <p className="text-slate-500 font-medium">No tienes registros recientes</p>
                     <p className="text-xs text-slate-400 mt-1">Solo puedes eliminar consecutivos creados por ti.</p>
                   </div>
                 )}
               </div>

               {error && (
                 <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 border border-red-100">
                   <AlertTriangle className="w-4 h-4" /> {error}
                 </div>
               )}
            </div>

            <div className="p-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => setDeshacerModalOpen(false)}
                className="px-4 py-2.5 text-slate-600 font-semibold hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors text-sm"
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarConsecutivo}
                disabled={!consecutivoAEliminar || eliminando}
                className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-500/20 transition-all text-sm flex items-center gap-2"
              >
                {eliminando ? "Eliminando..." : "Confirmar Eliminación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};