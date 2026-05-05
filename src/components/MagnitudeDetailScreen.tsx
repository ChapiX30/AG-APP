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
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { generarConsecutivo, auditarHuerfanos } from '../utils/firebaseConsecutivos';
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

// ─── Inline styles constants ───────────────────────────────────────────────
const COLORS = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  border: '#DDE1E7',
  text: '#1A1D23',
  muted: '#5C6370',
  subtle: '#8C92A0',
  accent: '#1B5BBE',
  accentLight: '#EBF2FF',
  amber: '#B45309',
  amberLight: '#FFF7E6',
  green: '#166534',
  greenLight: '#DCFCE7',
  red: '#991B1B',
  redLight: '#FEF2F2',
  redBorder: '#FCA5A5',
};

const Divider = () => (
  <div style={{ height: '1px', backgroundColor: COLORS.border }} />
);

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

  // Audit state — huérfanos limpiados automáticamente
  const [huerfanosLimpiados, setHuerfanosLimpiados] = useState<string[]>([]);

  // Derived State
  const isTrazable = selectedMagnitude?.toLowerCase().includes('trazable');
  const imageSrc = magnitudImages[selectedMagnitude] || magnitudImages[selectedMagnitude?.replace(/\s/g, '')] || "/images/default.png";
  
  const accentColor = isTrazable ? COLORS.amber : COLORS.accent;
  const accentLightColor = isTrazable ? COLORS.amberLight : COLORS.accentLight;

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

  // Auditoría de huérfanos: al abrir la pantalla, busca consecutivos sin
  // worksheet confirmada que lleven más de 10 minutos y los convierte en huecos.
  useEffect(() => {
    if (!selectedMagnitude) return;
    const anio = new Date().getFullYear().toString().slice(-2);

    auditarHuerfanos(selectedMagnitude, anio, 10)
      .then((limpiados) => {
        if (limpiados.length > 0) {
          setHuerfanosLimpiados(limpiados);
          // Ocultar el aviso después de 8 segundos
          setTimeout(() => setHuerfanosLimpiados([]), 8000);
        }
      })
      .catch((err) => console.error('Auditoría de huérfanos fallida:', err));
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
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.bg, color: COLORS.text }}>
      
      {/* Header */}
      <header style={{ backgroundColor: COLORS.surface, borderBottom: `1px solid ${COLORS.border}` }} className="sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button 
            onClick={goBack} 
            className="flex items-center justify-center w-8 h-8 rounded transition-colors flex-shrink-0"
            style={{ color: COLORS.muted }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = COLORS.bg)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div style={{ width: '1px', height: '20px', backgroundColor: COLORS.border }} className="flex-shrink-0" />
          
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h1 className="text-sm font-semibold leading-tight truncate" style={{ color: COLORS.text, letterSpacing: '-0.01em' }}>
                {selectedMagnitude}
              </h1>
              <p className="text-xs" style={{ color: COLORS.subtle }}>Gestión de Consecutivos</p>
            </div>
          </div>

          <div className="ml-auto flex-shrink-0">
            <span 
              className="text-xs font-semibold px-2.5 py-1 rounded"
              style={{
                backgroundColor: accentLightColor,
                color: accentColor,
              }}
            >
              {isTrazable ? 'Trazable' : 'Acreditado'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Banner: huérfanos limpiados automáticamente ── */}
      {huerfanosLimpiados.length > 0 && (
        <div 
          className="max-w-5xl mx-auto px-6 pt-4"
        >
          <div 
            className="flex items-start gap-3 px-4 py-3 rounded"
            style={{ 
              backgroundColor: '#F0FDF4', 
              border: '1px solid #86EFAC',
            }}
          >
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#166534' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: '#166534' }}>
                Limpieza automática completada
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#15803D' }}>
                {huerfanosLimpiados.length === 1
                  ? `El consecutivo ${huerfanosLimpiados[0]} no tenía hoja de trabajo asociada y fue registrado como hueco.`
                  : `${huerfanosLimpiados.length} consecutivos sin hoja de trabajo fueron registrados como huecos: ${huerfanosLimpiados.join(', ')}.`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* ── Left column ── */}
        <div className="md:col-span-2 space-y-4">

          {/* Current consecutive card */}
          <div style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${COLORS.border}`, backgroundColor: '#FAFBFC' }}>
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" style={{ color: COLORS.subtle }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.subtle }}>
                  Estado Actual
                </span>
              </div>
              {actual ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: COLORS.greenLight, color: COLORS.green }}>
                  <CheckCircle2 className="w-3 h-3" />
                  Activo
                </div>
              ) : (
                <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: COLORS.bg, color: COLORS.subtle }}>
                  Inactivo
                </span>
              )}
            </div>

            {/* Card body */}
            <div className="px-5 py-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
              {/* Ghost image watermark */}
              <div className="absolute top-0 right-0 p-4 opacity-[0.04] pointer-events-none select-none">
                <img src={imageSrc} alt="" className="w-28 h-28 object-contain" />
              </div>

              {actual ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: COLORS.subtle }}>
                    Último Consecutivo Generado
                  </p>
                  <div 
                    className="font-mono font-bold tabular-nums mb-6 px-6 py-3 rounded"
                    style={{ 
                      fontSize: 'clamp(1.75rem, 5vw, 3rem)',
                      letterSpacing: '0.04em',
                      color: accentColor,
                      backgroundColor: accentLightColor,
                      border: `1px solid ${isTrazable ? '#FDE68A' : '#BFDBFE'}`,
                    }}
                  >
                    {actual.consecutivo}
                  </div>
                  
                  {/* Meta row */}
                  <div className="flex items-center gap-5 w-full justify-center">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" style={{ color: COLORS.subtle }} />
                      <span className="text-xs" style={{ color: COLORS.muted }}>
                        {actual.fecha?.toDate ? actual.fecha.toDate().toLocaleDateString('es-MX') : 'N/A'}
                      </span>
                    </div>
                    <div style={{ width: '1px', height: '12px', backgroundColor: COLORS.border }} />
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5" style={{ color: COLORS.subtle }} />
                      <span className="text-xs font-medium truncate max-w-[120px]" style={{ color: COLORS.muted }}>
                        {actual.usuario}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-4">
                  <div 
                    className="flex items-center justify-center w-10 h-10 rounded-full mb-3"
                    style={{ backgroundColor: COLORS.bg }}
                  >
                    <Hash className="w-5 h-5" style={{ color: COLORS.subtle }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: COLORS.muted }}>Sin registros este año</p>
                  <p className="text-xs mt-1" style={{ color: COLORS.subtle }}>Genera un nuevo consecutivo para comenzar.</p>
                </div>
              )}
            </div>

            {/* Card footer — action */}
            <div 
              className="px-5 py-4 flex gap-3"
              style={{ borderTop: `1px solid ${COLORS.border}`, backgroundColor: '#FAFBFC' }}
            >
              <button
                onClick={handleGenerarConsecutivo}
                disabled={loading || generando}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white rounded transition-opacity disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
                onMouseEnter={e => !loading && !generando && (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {loading || generando 
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Plus className="w-4 h-4" />
                }
                Generar Nuevo Consecutivo
              </button>
            </div>
          </div>

          {/* History row */}
          {anterior && (
            <div style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${COLORS.border}`, backgroundColor: '#FAFBFC' }}>
                <History className="w-3.5 h-3.5" style={{ color: COLORS.subtle }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.subtle }}>
                  Registro Anterior
                </span>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="flex items-center justify-center w-7 h-7 rounded"
                    style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}
                  >
                    <Hash className="w-3.5 h-3.5" style={{ color: COLORS.subtle }} />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-sm" style={{ color: COLORS.text }}>{anterior.consecutivo}</p>
                    <p className="text-xs" style={{ color: COLORS.subtle }}>{anterior.usuario}</p>
                  </div>
                </div>
                <span 
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                  style={{ backgroundColor: COLORS.bg, color: COLORS.subtle, border: `1px solid ${COLORS.border}` }}
                >
                  Anterior
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">

          {/* Visual aid */}
          <div 
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '8px', overflow: 'hidden' }}
          >
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${COLORS.border}`, backgroundColor: '#FAFBFC' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.subtle }}>
                Magnitud
              </span>
            </div>
            <div className="p-5 flex flex-col items-center text-center">
              <div 
                className="flex items-center justify-center w-16 h-16 rounded-lg mb-3"
                style={{ backgroundColor: accentLightColor }}
              >
                <img src={imageSrc} alt={selectedMagnitude} className="w-12 h-12 object-contain" />
              </div>
              <p className="text-sm font-semibold" style={{ color: COLORS.text }}>{selectedMagnitude}</p>
              <p className="text-xs mt-1" style={{ color: COLORS.subtle }}>
                {isTrazable ? 'Trazabilidad verificada' : 'Acreditación vigente'}
              </p>
            </div>
          </div>

          {/* Correction zone */}
          <div 
            style={{ 
              backgroundColor: '#FFFBFB', 
              border: `1px solid ${COLORS.redBorder}`, 
              borderRadius: '8px', 
              overflow: 'hidden' 
            }}
          >
            <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${COLORS.redBorder}`, backgroundColor: COLORS.redLight }}>
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: COLORS.red }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.red }}>
                Zona de Corrección
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs leading-relaxed mb-4" style={{ color: '#7F1D1D' }}>
                Si generaste un consecutivo por error, puedes deshacerlo aquí. Solo se pueden eliminar registros creados por tu usuario.
              </p>
              <button
                onClick={() => { setDeshacerModalOpen(true); setError(null); setConsecutivoAEliminar(null); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded transition-colors"
                style={{ 
                  backgroundColor: COLORS.surface, 
                  border: `1px solid ${COLORS.redBorder}`, 
                  color: COLORS.red 
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = COLORS.redLight)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = COLORS.surface)}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Deshacer Último
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal Deshacer ── */}
      {deshacerModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(26, 29, 35, 0.5)', backdropFilter: 'blur(2px)' }}
        >
          <div 
            className="w-full max-w-md overflow-hidden"
            style={{ backgroundColor: COLORS.surface, borderRadius: '10px', border: `1px solid ${COLORS.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
          >
            {/* Modal header */}
            <div style={{ backgroundColor: COLORS.redLight, borderBottom: `1px solid ${COLORS.redBorder}` }} className="px-6 py-4">
              <div className="flex items-center gap-3">
                <div 
                  className="flex items-center justify-center w-8 h-8 rounded"
                  style={{ backgroundColor: '#FCA5A5' }}
                >
                  <Trash2 className="w-4 h-4" style={{ color: COLORS.red }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: COLORS.red }}>Deshacer Consecutivo</h3>
                  <p className="text-xs mt-0.5" style={{ color: '#7F1D1D' }}>
                    Selecciona el registro que deseas eliminar.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-5">
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {consecutivos.filter(cons => cons.usuario === user.name).length > 0 ? (
                  consecutivos
                    .filter(cons => cons.usuario === user.name)
                    .map((cons) => {
                      const isSelected = consecutivoAEliminar?.consecutivo === cons.consecutivo;
                      return (
                        <button
                          key={cons.consecutivo}
                          onClick={() => setConsecutivoAEliminar(cons)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded text-left transition-colors"
                          style={{
                            border: isSelected ? `1px solid ${COLORS.red}` : `1px solid ${COLORS.border}`,
                            backgroundColor: isSelected ? COLORS.redLight : COLORS.surface,
                          }}
                          onMouseEnter={e => !isSelected && (e.currentTarget.style.backgroundColor = COLORS.bg)}
                          onMouseLeave={e => !isSelected && (e.currentTarget.style.backgroundColor = COLORS.surface)}
                        >
                          <div>
                            <p className="font-mono font-bold text-base" style={{ color: COLORS.text }}>{cons.consecutivo}</p>
                            <p className="text-xs mt-0.5" style={{ color: COLORS.subtle }}>Creado por ti</p>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4" style={{ color: COLORS.red }} />
                          )}
                        </button>
                      );
                    })
                ) : (
                  <div 
                    className="text-center py-8 rounded"
                    style={{ backgroundColor: COLORS.bg, border: `1px dashed ${COLORS.border}` }}
                  >
                    <p className="text-sm font-medium" style={{ color: COLORS.muted }}>No tienes registros recientes</p>
                    <p className="text-xs mt-1" style={{ color: COLORS.subtle }}>Solo puedes eliminar consecutivos creados por ti.</p>
                  </div>
                )}
              </div>

              {error && (
                <div 
                  className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded text-xs"
                  style={{ backgroundColor: COLORS.redLight, color: COLORS.red, border: `1px solid ${COLORS.redBorder}` }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div 
              className="px-5 py-4 flex justify-end gap-2"
              style={{ borderTop: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}
            >
              <button
                onClick={() => setDeshacerModalOpen(false)}
                disabled={eliminando}
                className="px-4 py-2 text-sm font-medium rounded transition-colors disabled:opacity-50"
                style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.surface }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = COLORS.bg)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = COLORS.surface)}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarConsecutivo}
                disabled={!consecutivoAEliminar || eliminando}
                className="px-5 py-2 text-sm font-semibold text-white rounded transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: COLORS.red }}
                onMouseEnter={e => !(!consecutivoAEliminar || eliminando) && (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {eliminando 
                  ? <span className="flex items-center gap-2"><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Eliminando...</span>
                  : 'Confirmar Eliminación'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};