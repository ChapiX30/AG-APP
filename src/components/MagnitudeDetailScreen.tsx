import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { 
  Plus, 
  RotateCcw, 
  Calendar, 
  User, 
  Hash, 
  History, 
  AlertTriangle,
  CheckCircle2,
  Activity,
  Trash2,
  ShieldCheck,
  Link2,
  Award,
} from 'lucide-react';
import { getMagnitudImageSrc } from '../utils/magnitudAssets';
import { generarConsecutivo, auditarHuerfanos } from '../utils/firebaseConsecutivos';
import { deleteWorksheetStorageForHoja } from '../utils/worksheetStorageCleanup';
import { 
  collection, query, where, orderBy, limit, onSnapshot, 
  doc, deleteDoc, getDocs, getDoc, updateDoc, increment, arrayUnion 
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getPrefijo } from '../utils/prefijos';
import { FlowScreenHeader } from './worksheet-flow/FlowScreenHeader';
import { FlowCard } from './worksheet-flow/FlowCard';
import { accentFromMagnitude, flowAccents } from './worksheet-flow/flowTheme';

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

function formatConsecutivoDisplay(raw: string): string {
  const parts = raw.split('-');
  if (parts.length >= 3) {
    return `${parts[0]} - ${parts[1]} - ${parts[2]}`;
  }
  return raw;
}

export const MagnitudeDetailScreen: React.FC = () => {
  const { selectedMagnitude, goBack, navigateTo } = useNavigation();
  const [generando, setGenerando] = useState(false);
  const { user } = useAuth();
  const [consecutivos, setConsecutivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [deshacerModalOpen, setDeshacerModalOpen] = useState(false);
  const [consecutivoAEliminar, setConsecutivoAEliminar] = useState<any | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = accentFromMagnitude(selectedMagnitude);
  const theme = flowAccents[accent];
  const isTrazable = accent === 'trazable';
  const imageSrc =
    getMagnitudImageSrc(selectedMagnitude || '') ||
    magnitudImages[selectedMagnitude] ||
    magnitudImages[selectedMagnitude?.replace(/\s/g, '')] ||
    "/images/default.png";

  useEffect(() => {
    if (!selectedMagnitude) return;
    setLoading(true);

    const anio = new Date().getFullYear().toString().slice(-2);

    void auditarHuerfanos(selectedMagnitude, anio, 10).catch((e) =>
      console.warn("[MagnitudeDetail] auditarHuerfanos:", e)
    );

    const q = query(
      collection(db, "consecutivos"),
      where("magnitud", "==", selectedMagnitude),
      orderBy("fecha", "desc"),
      limit(15)
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
      navigateTo('work-sheet', { consecutive: consecutivo });
    } catch (error) {
      console.error(error);
      setError("No se pudo generar el consecutivo. Revisa la conexión e intenta de nuevo.");
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

      const cert = consecutivoAEliminar.consecutivo;
      const qHojas = query(
        collection(db, "hojasDeTrabajo"),
        where("certificado", "==", cert)
      );
      const hojasSnap = await getDocs(qHojas);
      for (const docu of hojasSnap.docs) {
        const hoja = docu.data();
        await deleteWorksheetStorageForHoja(cert, {
          pdfURL: hoja.pdfURL,
          fotoEquipoURL: hoja.fotoEquipoURL,
          id: hoja.id,
        });
        await deleteDoc(doc(db, "hojasDeTrabajo", docu.id));
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
    <div className="min-h-full flex-shrink-0 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900 font-sans">
      <FlowScreenHeader
        accent={accent}
        iconVariant="brand"
        title={selectedMagnitude || 'Magnitud'}
        subtitle={
          <span className="flex items-center gap-2">
            {isTrazable ? <Link2 className="w-3.5 h-3.5" strokeWidth={2} /> : <Award className="w-3.5 h-3.5" strokeWidth={2} />}
            {isTrazable ? 'Cadena de trazabilidad metrológica' : 'Servicio acreditado'}
          </span>
        }
        onBack={goBack}
        icon={
          <img src={imageSrc} alt="" className="w-full h-full object-contain" />
        }
        badge={
          actual ? (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-100 border border-emerald-300/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Activo
            </span>
          ) : undefined
        }
      />

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 w-full grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="lg:col-span-8 space-y-6">
          <FlowCard
            accent={accent}
            title="Estado Actual"
            description="Último consecutivo generado en el año"
            icon={<Activity className="w-5 h-5" />}
            headerRight={
              actual ? (
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${theme.soft} ${theme.highlight} border ${theme.softBorder}`}>
                  En uso
                </span>
              ) : (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-500">Sin registro</span>
              )
            }
            bodyClassName="relative"
          >
            <div className="absolute top-4 right-6 opacity-[0.07] pointer-events-none hidden sm:block">
              <img src={imageSrc} alt="" className="w-36 h-36 object-contain" />
            </div>

            {actual ? (
              <div className="relative z-10 flex flex-col items-center text-center py-4">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mb-4">
                  Último Consecutivo
                </span>
                <div className={`font-mono text-4xl sm:text-5xl lg:text-6xl font-black tracking-wide tabular-nums mb-8 ${theme.consecutivo}`}>
                  {formatConsecutivoDisplay(actual.consecutivo)}
                </div>

                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  <div className={`flex flex-col items-center p-4 rounded-2xl border ${theme.softBorder} ${theme.soft}`}>
                    <Calendar className="w-4 h-4 text-slate-400 mb-2" />
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Fecha</span>
                    <span className="text-sm font-semibold text-slate-800 mt-1">
                      {actual.fecha?.toDate ? actual.fecha.toDate().toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className={`flex flex-col items-center p-4 rounded-2xl border ${theme.softBorder} ${theme.soft}`}>
                    <User className="w-4 h-4 text-slate-400 mb-2" />
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Usuario</span>
                    <span className="text-sm font-semibold text-slate-800 mt-1 truncate w-full text-center">
                      {actual.usuario}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Hash className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-600">Sin registros este año</p>
                <p className="text-sm text-slate-400 mt-1">Genera un nuevo consecutivo para comenzar.</p>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleGenerarConsecutivo}
                disabled={loading || generando}
                className={`w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-white transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 bg-gradient-to-r ${theme.button} ${theme.buttonShadow}`}
              >
                {loading || generando ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                <span>Generar Nuevo Consecutivo</span>
              </button>
            </div>
          </FlowCard>

          {anterior && (
            <FlowCard
              accent={accent}
              title="Historial Reciente"
              icon={<History className="w-5 h-5" />}
              bodyClassName="p-6"
            >
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-white p-2.5 rounded-xl shadow-sm border border-slate-200 shrink-0">
                    <Hash className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-slate-800 truncate">
                      {formatConsecutivoDisplay(anterior.consecutivo)}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{anterior.usuario}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shrink-0">
                  ANTERIOR
                </span>
              </div>
            </FlowCard>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <FlowCard accent={accent} bodyClassName="p-6 flex flex-col items-center text-center">
            <div className="w-28 h-28 mb-4 relative">
              <div className={`absolute inset-0 bg-gradient-to-tr ${isTrazable ? 'from-amber-100 to-orange-50' : 'from-blue-100 to-indigo-50'} rounded-full blur-xl opacity-70`} />
              <img src={imageSrc} alt={selectedMagnitude} className="w-full h-full object-contain relative z-10 drop-shadow-md" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">{selectedMagnitude}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {isTrazable ? 'Trazabilidad verificada' : 'Acreditación vigente'}
            </p>
          </FlowCard>

          <div className="bg-white rounded-2xl border border-red-100 shadow-lg ring-1 ring-red-50 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-red-50 to-white border-b border-red-100">
              <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Zona de Corrección
              </h3>
            </div>
            <div className="p-5">
              <p className="text-xs text-red-600/90 mb-4 leading-relaxed">
                Si generaste un consecutivo por error, puedes deshacerlo aquí. Solo se pueden eliminar registros creados por tu usuario.
              </p>
              <button
                type="button"
                onClick={() => { setDeshacerModalOpen(true); setError(null); setConsecutivoAEliminar(null); }}
                className="w-full py-3 bg-white border border-red-200 text-red-700 font-semibold rounded-xl hover:bg-red-50 hover:border-red-300 transition-all shadow-sm text-sm flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Deshacer Último
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && !deshacerModalOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)]">
          <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center gap-2 border border-red-200 shadow-lg">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        </div>
      )}

      {deshacerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden ring-1 ring-slate-200">
            <div className="bg-gradient-to-r from-red-50 to-white p-6 border-b border-red-100">
              <div className="flex items-center gap-3 text-red-800 mb-1">
                <div className="p-2.5 bg-red-100 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold">Deshacer Consecutivo</h3>
              </div>
              <p className="text-sm text-red-600 pl-14">
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
                        type="button"
                        onClick={() => setConsecutivoAEliminar(cons)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                          consecutivoAEliminar?.consecutivo === cons.consecutivo
                            ? 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-red-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-slate-800 text-lg">
                            {formatConsecutivoDisplay(cons.consecutivo)}
                          </span>
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
                type="button"
                onClick={() => setDeshacerModalOpen(false)}
                className="px-4 py-2.5 text-slate-600 font-semibold hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors text-sm"
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarConsecutivo}
                disabled={!consecutivoAEliminar || eliminando}
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-500/20 transition-all text-sm flex items-center gap-2"
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
