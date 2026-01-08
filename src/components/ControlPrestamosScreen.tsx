import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, User, LogIn, LogOut, Loader2, XCircle, CheckCircle, 
  Package, RefreshCw, Camera, Search, QrCode, Keyboard, AlertTriangle 
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

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
  estadoProceso: 'operativo' | 'en_servicio' | 'en_prestamo' | 'en_mantenimiento' | string;
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
  
  // Estados de Operación
  const [isProcessing, setIsProcessing] = useState(false); 
  const [itemsEnPosesion, setItemsEnPosesion] = useState<RegistroPatron[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Scanner
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'entrada' | 'salida'>('salida');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  // Manual Input
  const [manualInput, setManualInput] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [searchResult, setSearchResult] = useState<RegistroPatron | null>(null);

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

  // Cargar Items del Usuario
  const fetchItemsUsuario = useCallback(async (usuario: string) => {
    if (!usuario) { setItemsEnPosesion([]); return; }
    setLoadingItems(true);
    try {
        const q = query(collection(db, COLLECTION_NAME), where("usuarioEnUso", "==", usuario));
        const querySnapshot = await getDocs(q);
        const items: RegistroPatron[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data() as RegistroPatron;
            // Filtramos solo los que están activos en préstamo
            if (['en_servicio', 'en_prestamo', 'en_uso'].includes(data.estadoProceso)) {
                items.push({ id: doc.id, ...data });
            }
        });
        setItemsEnPosesion(items);
    } catch (error) { console.error(error); } finally { setLoadingItems(false); }
  }, []);

  useEffect(() => { fetchItemsUsuario(usuarioSeleccionado); }, [usuarioSeleccionado, fetchItemsUsuario]);

  // Lógica Unificada de Transacción (Entrada/Salida)
  const procesarTransaccion = async (noControl: string, tipo: 'entrada' | 'salida') => {
      if (!usuarioSeleccionado) { alert("Selecciona un usuario primero"); return; }
      
      setIsProcessing(true);
      setShowManualModal(false);
      setSearchResult(null);
      setManualInput('');

      try {
          // Buscar el equipo por No. Control
          const q = query(collection(db, COLLECTION_NAME), where("noControl", "==", noControl));
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
              alert(`❌ Equipo "${noControl}" no encontrado.`);
              setIsProcessing(false);
              return;
          }

          const patronDoc = querySnapshot.docs[0];
          const patronData = patronDoc.data() as RegistroPatron;
          const patronId = patronDoc.id;
          const fechaActual = format(new Date(), 'yyyy-MM-dd HH:mm');

          if (tipo === 'salida') {
              // Validaciones Salida
              if (['en_servicio', 'en_prestamo', 'en_uso'].includes(patronData.estadoProceso)) {
                  alert(`⚠️ El equipo ya está prestado a: ${patronData.usuarioEnUso}`);
                  setIsProcessing(false); return;
              }
              if (patronData.estadoProceso === 'en_mantenimiento' || patronData.estadoProceso === 'baja') {
                  alert(`⚠️ El equipo no está disponible (Estado: ${patronData.estadoProceso})`);
                  setIsProcessing(false); return;
              }

              const nuevaEntrada: HistorialEntry = {
                  id: crypto.randomUUID(), fecha: fechaActual, accion: 'Préstamo',
                  usuario: usuarioSeleccionado, tipoEvento: 'prestamo', 
                  observaciones: `Entrega a ${usuarioSeleccionado}`
              };

              await setDoc(doc(db, COLLECTION_NAME, patronId), {
                  estadoProceso: 'en_prestamo',
                  usuarioEnUso: usuarioSeleccionado,
                  ubicacion: `Planta - ${usuarioSeleccionado}`,
                  fechaPrestamo: fechaActual,
                  historial: [nuevaEntrada, ...(patronData.historial || [])]
              }, { merge: true });

          } else {
              // Validaciones Entrada
              if (patronData.usuarioEnUso !== usuarioSeleccionado && patronData.usuarioEnUso) {
                   const confirmar = window.confirm(`⚠️ Este equipo figura prestado a ${patronData.usuarioEnUso}, ¿Confirmar devolución por ${usuarioSeleccionado}?`);
                   if(!confirmar) { setIsProcessing(false); return; }
              }

              const nuevaEntrada: HistorialEntry = {
                  id: crypto.randomUUID(), fecha: fechaActual, accion: 'Devolución',
                  usuario: usuarioSeleccionado, tipoEvento: 'prestamo', 
                  observaciones: `Devuelto por ${usuarioSeleccionado}`
              };

              await setDoc(doc(db, COLLECTION_NAME, patronId), {
                  estadoProceso: 'operativo',
                  usuarioEnUso: '',
                  ubicacion: 'Laboratorio',
                  fechaPrestamo: '',
                  historial: [nuevaEntrada, ...(patronData.historial || [])]
              }, { merge: true });
          }

          // Refrescar lista
          await fetchItemsUsuario(usuarioSeleccionado);
          
      } catch (e) {
          console.error(e);
          alert("Error al procesar movimiento");
      } finally {
          setIsProcessing(false);
          stopScan();
      }
  };

  // Buscador Manual (Para Préstamos sin QR)
  const buscarEquipoManual = async () => {
      if(!manualInput) return;
      setIsProcessing(true);
      try {
          const q = query(collection(db, COLLECTION_NAME), where("noControl", "==", manualInput));
          const snap = await getDocs(q);
          if(!snap.empty) {
              setSearchResult({ id: snap.docs[0].id, ...snap.docs[0].data() } as RegistroPatron);
          } else {
              setSearchResult(null);
              alert("Equipo no encontrado");
          }
      } catch(e) { console.error(e); }
      finally { setIsProcessing(false); }
  };

  // Scanner Handlers
  const handleScanResult = useCallback((code: string) => {
      procesarTransaccion(code, scanMode);
  }, [scanMode, usuarioSeleccionado]); // Dependencias corregidas

  const startScanner = (mode: 'entrada' | 'salida') => {
      if (!usuarioSeleccionado) { alert("Selecciona un usuario primero"); return; }
      setScanMode(mode);
      setIsScannerOpen(true);
  };

  const stopScan = () => {
      scannerControlsRef.current?.stop();
      setIsScannerOpen(false);
  };

  useEffect(() => {
    if (isScannerOpen && videoRef.current) {
      const reader = new BrowserMultiFormatReader();
      reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err, controls) => {
          if (result) { handleScanResult(result.getText()); }
          scannerControlsRef.current = controls;
      }).catch(() => stopScan());
    }
    return () => { scannerControlsRef.current?.stop(); };
  }, [isScannerOpen, handleScanResult]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      
      {/* --- HEADER --- */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-6 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div>
                <h1 className="text-xl font-bold text-gray-900">Módulo de Préstamos</h1>
                <p className="text-xs text-gray-500">Gestión de entradas y salidas</p>
            </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        
        {/* --- SELECCIÓN DE USUARIO --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 relative overflow-hidden">
          {isProcessing && (
            <div className="absolute inset-0 bg-white/90 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
              <Loader2 size={40} className="animate-spin text-blue-600 mb-2" />
              <p className="font-semibold text-gray-700 text-sm">Actualizando inventario...</p>
            </div>
          )}

          <div className="mb-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                <User size={16} className="text-blue-600" /> Responsable del Movimiento
            </label>
            <div className="relative">
                <select
                    className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none transition-all font-medium text-gray-800"
                    value={usuarioSeleccionado}
                    onChange={(e) => setUsuarioSeleccionado(e.target.value)}
                    disabled={isLoadingUsers || isProcessing}
                >
                    <option value="">{isLoadingUsers ? 'Cargando lista...' : '-- Seleccionar Técnico / Metrólogo --'}</option>
                    {metrologos.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
            </div>
          </div>
        </div>

        {/* --- PANEL DE ACCIONES (SOLO SI HAY USUARIO) --- */}
        <AnimatePresence>
        {usuarioSeleccionado && (
            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
                {/* BOTÓN PRESTAMO MANUAL */}
                <button 
                    onClick={() => setShowManualModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-between group transition-all"
                >
                    <div className="text-left">
                        <p className="font-bold text-lg">Nuevo Préstamo</p>
                        <p className="text-blue-100 text-sm">Buscar por código manual</p>
                    </div>
                    <div className="bg-white/20 p-2 rounded-lg group-hover:bg-white/30 transition-colors">
                        <Keyboard size={24} />
                    </div>
                </button>

                {/* BOTÓN SCANNER (OPCIONAL) */}
                <button 
                    onClick={() => startScanner('salida')}
                    className="bg-white border border-gray-200 text-gray-700 p-4 rounded-xl hover:bg-gray-50 flex items-center justify-between group transition-all"
                >
                    <div className="text-left">
                        <p className="font-bold text-gray-900">Usar Escáner QR</p>
                        <p className="text-gray-400 text-sm">Si el equipo tiene etiqueta</p>
                    </div>
                    <QrCode size={24} className="text-gray-400 group-hover:text-gray-600" />
                </button>
            </motion.div>
        )}
        </AnimatePresence>

        {/* --- LISTA DE EQUIPOS EN POSESIÓN (DEVOLUCIÓN RÁPIDA) --- */}
        {usuarioSeleccionado && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Package size={18} className="text-amber-500" /> 
                        Equipos en Posesión ({itemsEnPosesion.length})
                    </h3>
                    <button onClick={() => fetchItemsUsuario(usuarioSeleccionado)} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-blue-600">
                        <RefreshCw size={16} className={loadingItems ? 'animate-spin' : ''} />
                    </button>
                </div>
                
                {loadingItems ? (
                    <div className="p-8 text-center text-gray-400">Consultando base de datos...</div>
                ) : itemsEnPosesion.length === 0 ? (
                    <div className="p-10 text-center flex flex-col items-center">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                             <CheckCircle size={32} className="text-emerald-500" />
                        </div>
                        <p className="text-gray-900 font-medium">Sin préstamos activos</p>
                        <p className="text-gray-500 text-sm mt-1">{usuarioSeleccionado} no debe ningún equipo.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {itemsEnPosesion.map(item => (
                            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono font-bold">{item.noControl}</span>
                                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Prestado</span>
                                    </div>
                                    <p className="font-bold text-gray-800">{item.descripcion}</p>
                                    <p className="text-xs text-gray-500">{item.marca} {item.modelo} • {item.fechaPrestamo}</p>
                                </div>
                                
                                <button 
                                    onClick={() => {
                                        if(window.confirm(`¿Confirmar devolución de ${item.descripcion}?`)) {
                                            procesarTransaccion(item.noControl, 'entrada');
                                        }
                                    }}
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium transition-colors sm:w-auto w-full"
                                >
                                    <LogIn size={18} /> Devolver
                                </button>
                            </div>
                        ))}
                    </div>
                )}
             </motion.div>
        )}
      </div>

      {/* --- MODAL BÚSQUEDA MANUAL --- */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800">Préstamo Manual</h3>
                    <button onClick={() => setShowManualModal(false)}><XCircle className="text-gray-400 hover:text-gray-600"/></button>
                </div>
                
                <div className="p-6">
                    <p className="text-sm text-gray-500 mb-4">Ingresa el No. de Control del equipo si no cuentas con el código QR.</p>
                    <div className="flex gap-2 mb-6">
                        <input 
                            type="text" 
                            placeholder="Ej. CAL-001" 
                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && buscarEquipoManual()}
                        />
                        <button 
                            onClick={buscarEquipoManual}
                            disabled={isProcessing || !manualInput}
                            className="bg-gray-900 text-white px-4 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                        >
                            <Search size={20} />
                        </button>
                    </div>

                    {/* RESULTADO DE BÚSQUEDA */}
                    {searchResult && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 animate-in fade-in zoom-in duration-300">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <p className="font-bold text-blue-900">{searchResult.descripcion}</p>
                                    <p className="text-xs text-blue-700">{searchResult.marca} • {searchResult.modelo}</p>
                                    <p className="text-xs font-mono bg-white/50 inline-block px-1 rounded mt-1">{searchResult.noControl}</p>
                                </div>
                                {searchResult.estadoProceso === 'operativo' ? (
                                    <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full font-bold">Disponible</span>
                                ) : (
                                    <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded-full font-bold">No Disponible</span>
                                )}
                            </div>

                            {searchResult.estadoProceso === 'operativo' ? (
                                <button 
                                    onClick={() => procesarTransaccion(searchResult.noControl, 'salida')}
                                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-sm"
                                >
                                    Confirmar Préstamo
                                </button>
                            ) : (
                                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 flex gap-2 items-center">
                                    <AlertTriangle size={14} />
                                    Equipo actualmente en estado: {searchResult.estadoProceso}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
      )}

      {/* --- MODAL SCANNER --- */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={stopScan}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md text-center relative" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{scanMode === 'salida' ? 'Escanear para Préstamo' : 'Escanear Devolución'}</h3>
            <div className="rounded-xl overflow-hidden bg-black aspect-video mb-4 relative">
               <video ref={videoRef} className="w-full h-full object-cover" />
               <div className="absolute inset-0 border-2 border-white/50 m-8 rounded-lg pointer-events-none animate-pulse"></div>
            </div>
            <button onClick={stopScan} className="w-full py-3 bg-gray-100 rounded-xl font-bold">Cancelar</button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ControlPrestamosScreen;