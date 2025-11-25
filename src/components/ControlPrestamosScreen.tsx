import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, User, LogIn, LogOut, Loader2, XCircle, AlertTriangle, CheckCircle, Package, RefreshCw } from 'lucide-react';
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
  fechaInicioProceso?: string;
  observaciones?: string;
  usuarioEnUso?: string; 
  fechaPrestamo?: string;
  historial: HistorialEntry[];
}

type Metrologo = {
  id: string;
  nombre: string;
};

const COLLECTION_NAME = "patronesCalibracion";

export const ControlPrestamosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<Metrologo[]>([]);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false); 
  
  // 🚨 NUEVO: Lista de items que tiene el usuario seleccionado
  const [itemsEnPosesion, setItemsEnPosesion] = useState<RegistroPatron[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'entrada' | 'salida'>('salida');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  // --- 1. Cargar Usuarios ---
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
      } catch (error) {
        console.error("Error cargando metrólogos: ", error);
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchMetrologos();
  }, []);

  // --- 2. 🚨 NUEVO: Cargar Equipos del Usuario ---
  const fetchItemsUsuario = useCallback(async (usuario: string) => {
    if (!usuario) {
        setItemsEnPosesion([]);
        return;
    }
    setLoadingItems(true);
    try {
        // Buscamos todo lo que tenga este usuario asignado
        const q = query(collection(db, COLLECTION_NAME), where("usuarioEnUso", "==", usuario));
        const querySnapshot = await getDocs(q);
        const items: RegistroPatron[] = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data() as RegistroPatron;
            // Filtramos solo lo que esté activo (en servicio o préstamo antiguo)
            if (data.estadoProceso === 'en_servicio' || data.estadoProceso === 'en_prestamo') {
                items.push({ id: doc.id, ...data });
            }
        });
        setItemsEnPosesion(items);
    } catch (error) {
        console.error("Error cargando items del usuario:", error);
    } finally {
        setLoadingItems(false);
    }
  }, []);

  // Efecto: Cuando cambia el usuario, cargamos sus cosas
  useEffect(() => {
    fetchItemsUsuario(usuarioSeleccionado);
  }, [usuarioSeleccionado, fetchItemsUsuario]);


  // --- 3. Abrir Escáner ---
  const handleOpenScanner = (mode: 'entrada' | 'salida') => {
    if (!usuarioSeleccionado && mode === 'salida') {
        alert('Por favor, selecciona tu nombre de usuario antes de escanear una salida.');
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
  
  // --- 4. LÓGICA DE ESCANEO ---
  const handleScanResult = useCallback(async (noControl: string) => {
    if (!noControl) return;
    stopScan(); // Cerramos cámara para procesar
    setIsProcessing(true); 

    try {
      const q = query(collection(db, COLLECTION_NAME), where("noControl", "==", noControl));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert(`❌ Error: Patrón con No. de Control "${noControl}" no encontrado.`);
        setIsProcessing(false);
        return;
      }

      const patronDoc = querySnapshot.docs[0];
      const patronData = patronDoc.data() as RegistroPatron;
      const patronId = patronDoc.id;

      const docRef = doc(db, COLLECTION_NAME, patronId);
      const fechaActual = format(new Date(), 'yyyy-MM-dd');
      let nuevaEntradaHistorial: HistorialEntry;

      // === SALIDA (CHECK-OUT) ===
      if (scanMode === 'salida') {
        if (patronData.estadoProceso === 'en_servicio' || patronData.estadoProceso === 'en_prestamo') {
          alert(`⚠️ El patrón "${patronData.descripcion}" ya está EN USO por ${patronData.usuarioEnUso}.`);
          setIsProcessing(false);
          return;
        }
        if (patronData.estadoProceso !== 'operativo' && patronData.estadoProceso !== 'programado') {
           alert(`❌ Error: El patrón no está disponible. Estado: ${patronData.estadoProceso.toUpperCase()}`);
           setIsProcessing(false);
           return;
        }

        nuevaEntradaHistorial = {
          id: crypto.randomUUID(),
          fecha: fechaActual,
          accion: 'Salida (Escáner)',
          usuario: usuarioSeleccionado,
          tipoEvento: 'prestamo',
          observaciones: `Equipo retirado mediante escáner.`
        };

        const updatedData = {
          estadoProceso: 'en_servicio',
          usuarioEnUso: usuarioSeleccionado,
          ubicacion: `En Uso - ${usuarioSeleccionado}`,
          fechaPrestamo: fechaActual,
          historial: [nuevaEntradaHistorial, ...patronData.historial]
        };

        // @ts-ignore
        await setDoc(docRef, updatedData, { merge: true });
        
        // 🚨 ACTUALIZAR LISTA LOCAL (Agregamos el item visualmente)
        setItemsEnPosesion(prev => [...prev, { ...patronData, ...updatedData, id: patronId } as RegistroPatron]);

        alert(`✅ Salida Registrada: ${patronData.descripcion}`);

      } 
      // === ENTRADA (CHECK-IN) ===
      else if (scanMode === 'entrada') {
        
        if (patronData.estadoProceso === 'operativo' && patronData.ubicacion === 'Laboratorio') {
           alert(`⚠️ Este equipo ya está en Laboratorio.`);
           setIsProcessing(false);
           return;
        }
        
        nuevaEntradaHistorial = {
          id: crypto.randomUUID(),
          fecha: fechaActual,
          accion: 'Entrada (Devolución Escáner)',
          usuario: usuarioSeleccionado || 'Sistema',
          tipoEvento: 'prestamo',
          observaciones: `Devuelto a Laboratorio. (Usuario anterior: ${patronData.usuarioEnUso || 'N/A'})`
        };
        
        await setDoc(docRef, {
          estadoProceso: 'operativo',
          usuarioEnUso: '', 
          ubicacion: 'Laboratorio',
          fechaPrestamo: '', 
          historial: [nuevaEntradaHistorial, ...patronData.historial]
        }, { merge: true });

        // 🚨 ACTUALIZAR LISTA LOCAL (Quitamos el item visualmente)
        setItemsEnPosesion(prev => prev.filter(item => item.noControl !== noControl));

        alert(`✅ Entrada Registrada: ${patronData.descripcion}`);
      }
      
    } catch (error) {
      console.error("Error al actualizar Firebase:", error);
      alert("❌ Error de Conexión.");
    } finally {
      setIsProcessing(false); 
    }
  }, [scanMode, usuarioSeleccionado, stopScan]);

  // --- 5. Video Stream ---
  useEffect(() => {
    if (isScannerOpen && videoRef.current) {
      const startScanLogic = async () => {
        const reader = new BrowserMultiFormatReader();
        try {
          const controls = await reader.decodeFromVideoDevice(
            undefined, videoRef.current,
            (result, error, controls) => {
              if (result) {
                handleScanResult(result.getText());
                controls.stop();
              }
            }
          );
          scannerControlsRef.current = controls;
        } catch (e) {
          console.error("Error al iniciar escáner:", e);
          alert("Error al iniciar la cámara.");
          stopScan();
        }
      };
      startScanLogic();
    }
    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
      }
    };
  }, [isScannerOpen, handleScanResult, stopScan]);


  return (
    <div style={styles.container}>
      
      {isScannerOpen && (
        <div style={styles.scannerModal} onClick={stopScan}>
          <div style={styles.scannerContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.scannerTitle}>
              {scanMode === 'salida' ? 'Escanear para SALIDA' : 'Escanear para DEVOLUCIÓN'}
            </h3>
            <video ref={videoRef} style={styles.video} />
            <button 
              style={{...styles.button, ...styles.dangerButton}} 
              onClick={stopScan}
            >
              <XCircle size={18} style={{ marginRight: '8px' }} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={styles.header}>
        <button 
          onClick={() => navigateTo('/')} 
          style={styles.backButton}
          disabled={isProcessing}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={styles.title}>Control de Préstamos</h1>
      </div>

      <div style={styles.content}>
        <div style={styles.card}>
          
          {isProcessing && (
            <div style={styles.loadingOverlay}>
              <Loader2 size={40} className="animate-spin" />
              <p style={{ marginTop: '16px', fontSize: '1.1rem' }}>Procesando...</p>
            </div>
          )}
          
          <div style={styles.formGroup}>
            <label style={styles.label}><User size={16} /> Usuario Responsable</label>
            <select
              style={styles.select}
              value={usuarioSeleccionado}
              onChange={(e) => setUsuarioSeleccionado(e.target.value)}
              disabled={isLoadingUsers || isProcessing}
            >
              <option value="">
                {isLoadingUsers ? 'Cargando...' : '-- Seleccionar Usuario --'}
              </option>
              {metrologos.map(user => (
                <option key={user.id} value={user.nombre}>
                  {user.nombre}
                </option>
              ))}
            </select>
            {scanMode === 'salida' && !usuarioSeleccionado &&
              <p style={styles.note}>* Selecciona un usuario para registrar salida.</p>
            }
          </div>

          <div style={styles.buttonGroup}>
            <button
              style={{...styles.button, ...styles.primaryButton}}
              onClick={() => handleOpenScanner('salida')}
              disabled={!usuarioSeleccionado || isProcessing}
            >
              <LogOut size={20} style={{ marginRight: '10px' }} />
              Escanear Salida (Llevarse)
            </button>
            <button
              style={{...styles.button, ...styles.secondaryButton}}
              onClick={() => handleOpenScanner('entrada')}
              disabled={isProcessing}
            >
              <LogIn size={20} style={{ marginRight: '10px' }} />
              Escanear Devolución (Entregar)
            </button>
          </div>
        </div>

        {/* 🚨 LISTA DINÁMICA DE LO QUE TIENE EL USUARIO */}
        {usuarioSeleccionado && (
             <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#334155' }}>
                        Equipos en poder de: <span style={{color: '#2563eb'}}>{usuarioSeleccionado}</span>
                    </h3>
                    <button onClick={() => fetchItemsUsuario(usuarioSeleccionado)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                        <RefreshCw size={18} className={loadingItems ? 'animate-spin' : ''} />
                    </button>
                </div>
                
                {loadingItems ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Cargando inventario...</div>
                ) : itemsEnPosesion.length === 0 ? (
                    <div style={{ backgroundColor: '#f0fdf4', padding: '20px', borderRadius: '12px', border: '1px solid #bbf7d0', textAlign: 'center', color: '#166534' }}>
                        <CheckCircle size={32} style={{ marginBottom: '8px', opacity: 0.8 }} />
                        <p style={{ margin: 0, fontWeight: 500 }}>¡Todo limpio! No tiene equipos pendientes.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {itemsEnPosesion.map(item => (
                            <div key={item.id} style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', borderLeft: '4px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 700, marginBottom: '4px' }}>
                                        {item.noControl}
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>
                                        {item.descripcion}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        {item.marca} - {item.modelo}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.75rem', backgroundColor: '#fffbeb', color: '#b45309', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                        PENDIENTE
                                    </span>
                                </div>
                            </div>
                        ))}
                        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', marginTop: '10px' }}>
                            Escanea un equipo en "Devolución" para quitarlo de esta lista.
                        </p>
                    </div>
                )}
             </div>
        )}

      </div>
    </div>
  );
};

// --- ESTILOS ---
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f4f7f6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', padding: '16px 24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0',
  },
  backButton: {
    background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px',
  },
  title: { margin: 0, color: '#333', fontSize: '1.5rem', fontWeight: 600 },
  content: { padding: '32px 24px', maxWidth: '600px', margin: '0 auto' },
  card: {
    backgroundColor: '#ffffff', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '12px', color: '#333',
  },
  formGroup: { marginBottom: '24px' },
  label: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#555', marginBottom: '8px' },
  select: { width: '100%', padding: '12px', fontSize: '1rem', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: '#fff' },
  note: { fontSize: '0.8rem', color: '#dc2626', marginTop: '8px' },
  buttonGroup: { display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' },
  button: { width: '100%', padding: '16px', fontSize: '1rem', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: '#2563eb', color: '#ffffff' }, // Azul para salida
  secondaryButton: { backgroundColor: '#16a34a', color: '#ffffff' }, // Verde para entrada
  dangerButton: { backgroundColor: '#e0e0e0', color: '#333' },
  scannerModal: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  scannerContent: { background: '#fff', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '600px', textAlign: 'center' },
  scannerTitle: { marginTop: 0, color: '#333' },
  video: { width: '100%', height: 'auto', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '16px' },
};

export default ControlPrestamosScreen;