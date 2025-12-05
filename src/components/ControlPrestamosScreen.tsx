import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, User, LogIn, LogOut, Loader2, XCircle, CheckCircle, Package, RefreshCw, Camera } from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { format } from 'date-fns';

// --- Interfaces ---
export interface HistorialEntry {
  id: string; 
  fecha: string;
  accion: string;
  usuario: string;
  tipoEvento: 'sistema' | 'calibracion' | 'mantenimiento' | 'verificacion' | 'administrativo' | 'prestamo';
  observaciones?: string;
  detalles?: any; 
}

export interface RegistroPatron {
  id?: string; 
  noControl: string;
  descripcion: string;
  serie: string;
  marca: string;
  modelo: string;
  frecuencia: string;
  tipoServicio: string;
  fecha: string;
  prioridad: 'Alta' | 'Media' | 'Baja';
  ubicacion: string;
  responsable: string;
  estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio' | 'en_servicio' | 'en_mantenimiento' | 'en_prestamo';
  usuarioEnUso?: string; 
  fechaPrestamo?: string;
  historial: HistorialEntry[];
}

type Metrologo = { id: string; nombre: string; };

const COLLECTION_NAME = "patronesCalibracion";

export const ControlPrestamosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<Metrologo[]>([]);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [itemsEnPosesion, setItemsEnPosesion] = useState<RegistroPatron[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'entrada' | 'salida'>('salida');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  // Cargar Usuarios
  useEffect(() => {
    const fetchMetrologos = async () => {
      try {
        const q = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const querySnapshot = await getDocs(q);
        const usersList: Metrologo[] = [];
        querySnapshot.forEach((doc) => {
          usersList.push({ id: doc.id, nombre: doc.data().name || doc.data().nombre });
        });
        setMetrologos(usersList);
      } catch (error) { console.error(error); } finally { setIsLoadingUsers(false); }
    };
    fetchMetrologos();
  }, []);

  // Cargar Items
  const fetchItemsUsuario = useCallback(async (usuario: string) => {
    if (!usuario) { setItemsEnPosesion([]); return; }
    setLoadingItems(true);
    try {
        const q = query(collection(db, COLLECTION_NAME), where("usuarioEnUso", "==", usuario));
        const querySnapshot = await getDocs(q);
        const items: RegistroPatron[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data() as RegistroPatron;
            if (data.estadoProceso === 'en_servicio' || data.estadoProceso === 'en_prestamo') {
                items.push({ id: doc.id, ...data });
            }
        });
        setItemsEnPosesion(items);
    } catch (error) { console.error(error); } finally { setLoadingItems(false); }
  }, []);

  useEffect(() => { fetchItemsUsuario(usuarioSeleccionado); }, [usuarioSeleccionado, fetchItemsUsuario]);

  // Scanner Logic
  const handleOpenScanner = (mode: 'entrada' | 'salida') => {
    if (!usuarioSeleccionado && mode === 'salida') {
        alert('Por favor, selecciona un usuario primero.');
        return;
    }
    setScanMode(mode);
    setIsScannerOpen(true);
  };
  
  const stopScan = useCallback(() => {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setIsScannerOpen(false);
  }, []);
  
  const handleScanResult = useCallback(async (noControl: string) => {
    if (!noControl) return;
    stopScan();
    setIsProcessing(true); 

    try {
      const q = query(collection(db, COLLECTION_NAME), where("noControl", "==", noControl));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert(`❌ Error: Patrón "${noControl}" no encontrado.`);
        setIsProcessing(false);
        return;
      }

      const patronDoc = querySnapshot.docs[0];
      const patronData = patronDoc.data() as RegistroPatron;
      const patronId = patronDoc.id;
      const docRef = doc(db, COLLECTION_NAME, patronId);
      const fechaActual = format(new Date(), 'yyyy-MM-dd');

      if (scanMode === 'salida') {
        if (patronData.estadoProceso === 'en_servicio' || patronData.estadoProceso === 'en_prestamo') {
          alert(`⚠️ El patrón ya está EN USO por ${patronData.usuarioEnUso}.`);
          setIsProcessing(false); return;
        }
        
        const nuevaEntrada: HistorialEntry = {
          id: crypto.randomUUID(), fecha: fechaActual, accion: 'Salida (Escáner)',
          usuario: usuarioSeleccionado, tipoEvento: 'prestamo', observaciones: `Equipo retirado.`
        };

        const updatedData = {
          estadoProceso: 'en_servicio', usuarioEnUso: usuarioSeleccionado,
          ubicacion: `En Uso - ${usuarioSeleccionado}`, fechaPrestamo: fechaActual,
          historial: [nuevaEntrada, ...patronData.historial]
        };

        // @ts-ignore
        await setDoc(docRef, updatedData, { merge: true });
        setItemsEnPosesion(prev => [...prev, { ...patronData, ...updatedData, id: patronId } as RegistroPatron]);
        alert(`✅ Salida Registrada: ${patronData.descripcion}`);

      } else {
        const nuevaEntrada: HistorialEntry = {
          id: crypto.randomUUID(), fecha: fechaActual, accion: 'Entrada (Devolución)',
          usuario: usuarioSeleccionado || 'Sistema', tipoEvento: 'prestamo',
          observaciones: `Devuelto. (Previo: ${patronData.usuarioEnUso || 'N/A'})`
        };
        
        await setDoc(docRef, {
          estadoProceso: 'operativo', usuarioEnUso: '', ubicacion: 'Laboratorio', fechaPrestamo: '', 
          historial: [nuevaEntrada, ...patronData.historial]
        }, { merge: true });

        setItemsEnPosesion(prev => prev.filter(item => item.noControl !== noControl));
        alert(`✅ Entrada Registrada: ${patronData.descripcion}`);
      }
    } catch (error) {
      console.error(error); alert("❌ Error de Conexión.");
    } finally { setIsProcessing(false); }
  }, [scanMode, usuarioSeleccionado, stopScan]);

  useEffect(() => {
    if (isScannerOpen && videoRef.current) {
      const reader = new BrowserMultiFormatReader();
      reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
          if (result) { handleScanResult(result.getText()); controls.stop(); }
          scannerControlsRef.current = controls;
      }).catch(() => { alert("Error cámara"); stopScan(); });
    }
    return () => { scannerControlsRef.current?.stop(); };
  }, [isScannerOpen, handleScanResult, stopScan]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      
      {/* Modal Scanner */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={stopScan}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md text-center shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {scanMode === 'salida' ? 'Escaneando Salida 📤' : 'Escaneando Devolución 📥'}
            </h3>
            <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-black aspect-video mb-6 relative">
               <video ref={videoRef} className="w-full h-full object-cover" />
               <div className="absolute inset-0 border-2 border-white/50 m-8 rounded-lg pointer-events-none animate-pulse"></div>
            </div>
            <button 
              className="w-full py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
              onClick={stopScan}
            >
              <XCircle size={20} /> Cancelar Escaneo
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-6 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => navigateTo('/')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div>
                <h1 className="text-xl font-bold text-gray-800">Control de Préstamos</h1>
                <p className="text-xs text-gray-500">Entradas y salidas de patrones</p>
            </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Card Principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative overflow-hidden">
          {isProcessing && (
            <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
              <Loader2 size={48} className="animate-spin text-blue-600 mb-4" />
              <p className="font-semibold text-gray-700">Procesando movimiento...</p>
            </div>
          )}

          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                <User size={18} className="text-blue-600" /> Usuario Responsable
            </label>
            <div className="relative">
                <select
                    className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none transition-all font-medium text-gray-700"
                    value={usuarioSeleccionado}
                    onChange={(e) => setUsuarioSeleccionado(e.target.value)}
                    disabled={isLoadingUsers || isProcessing}
                >
                    <option value="">{isLoadingUsers ? 'Cargando...' : '-- Seleccionar Usuario --'}</option>
                    {metrologos.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleOpenScanner('salida')}
              disabled={!usuarioSeleccionado || isProcessing}
              className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${!usuarioSeleccionado ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed' : 'border-blue-100 bg-blue-50/50 text-blue-700 hover:border-blue-300 hover:shadow-md'}`}
            >
              <LogOut size={32} className="mb-2" />
              <span className="font-bold">Salida (Check-out)</span>
              <span className="text-xs opacity-70">Escanear para llevar</span>
            </button>

            <button
              onClick={() => handleOpenScanner('entrada')}
              disabled={isProcessing}
              className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-emerald-100 bg-emerald-50/50 text-emerald-700 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <LogIn size={32} className="mb-2" />
              <span className="font-bold">Entrada (Check-in)</span>
              <span className="text-xs opacity-70">Escanear para devolver</span>
            </button>
          </div>
        </div>

        {/* Lista de Equipos */}
        {usuarioSeleccionado && (
             <div className="animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-4 px-2">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                        <Package size={18} /> Inventario en Posesión
                    </h3>
                    <button onClick={() => fetchItemsUsuario(usuarioSeleccionado)} className="p-2 hover:bg-white rounded-full transition-colors text-gray-500">
                        <RefreshCw size={16} className={loadingItems ? 'animate-spin' : ''} />
                    </button>
                </div>
                
                {loadingItems ? (
                    <div className="text-center py-8 text-gray-400">Cargando inventario...</div>
                ) : itemsEnPosesion.length === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center">
                        <CheckCircle size={48} className="mx-auto text-emerald-400 mb-3" />
                        <p className="text-emerald-800 font-medium">¡Todo limpio!</p>
                        <p className="text-emerald-600 text-sm">{usuarioSeleccionado} no tiene equipos pendientes.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {itemsEnPosesion.map(item => (
                            <div key={item.id} className="bg-white p-4 rounded-xl border border-l-4 border-l-amber-400 border-gray-100 shadow-sm flex justify-between items-center group hover:shadow-md transition-all">
                                <div>
                                    <div className="text-xs font-bold text-amber-600 mb-1">{item.noControl}</div>
                                    <div className="font-semibold text-gray-800">{item.descripcion}</div>
                                    <div className="text-xs text-gray-500 mt-1">{item.marca} • {item.modelo}</div>
                                </div>
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                                    En Uso
                                </span>
                            </div>
                        ))}
                        <p className="text-center text-xs text-gray-400 mt-4">
                            Escanea "Entrada" para liberar estos equipos.
                        </p>
                    </div>
                )}
             </div>
        )}

      </div>
    </div>
  );
};

export default ControlPrestamosScreen;