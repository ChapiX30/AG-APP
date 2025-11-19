import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, User, LogIn, LogOut, Loader2, Camera, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { format } from 'date-fns';

// --- Interfaces ---
export interface HistorialEntry {
  fecha: string;
  accion: string;
  usuario: string;
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
  estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio' | 'en_prestamo' | 'en_servicio'; // 🚨 AÑADIDO en_servicio
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
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'entrada' | 'salida'>('salida');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  // --- 1. Lógica para cargar usuarios ---
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

  // --- 2. Lógica del escáner ---
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
  
  // --- 3. LÓGICA DE ESCANEO (CORREGIDA Y BLINDADA) ---
  const handleScanResult = useCallback(async (noControl: string) => {
    if (!noControl) return;
    stopScan();
    setIsProcessing(true);

    try {
      // 1. Buscar el patrón
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

      // =========================================================
      // 🚨 CORRECCIÓN: LÓGICA DE SALIDA (CHECK-OUT) BLINDADA
      // =========================================================
      if (scanMode === 'salida') {
        
        // 1. VALIDACIÓN ESTRICTA: Si NO está Operativo, NO se puede prestar.
        // Esto cubre: 'en_prestamo', 'en_servicio', 'en_calibracion', 'fuera_servicio', etc.
        if (patronData.estadoProceso !== 'operativo') {
            
            // Mensaje personalizado según el error
            let mensajeError = `❌ Error: El equipo "${patronData.descripcion}" NO está disponible.`;
            
            if (patronData.estadoProceso === 'en_prestamo' || patronData.estadoProceso === 'en_servicio') {
                mensajeError += `\n\n⛔ Lo tiene actualmente: ${patronData.usuarioEnUso || 'Otro usuario'}.`;
                mensajeError += `\nDeben registrar su DEVOLUCIÓN primero.`;
            } else {
                mensajeError += `\nEstado actual: ${patronData.estadoProceso.toUpperCase()}.`;
            }

            alert(mensajeError);
            setIsProcessing(false);
            return; // 🛑 DETIENE TODO AQUÍ
        }

        // 2. Si pasa la validación, procedemos
        nuevaEntradaHistorial = {
          fecha: fechaActual,
          accion: 'Salida (En Servicio)',
          usuario: usuarioSeleccionado,
          observaciones: `Equipo retirado para uso en campo/planta.`
        };

        await setDoc(docRef, {
          estadoProceso: 'en_servicio', // 🚨 Usamos 'en_servicio' como pediste
          usuarioEnUso: usuarioSeleccionado,
          ubicacion: 'En Uso',
          fechaPrestamo: fechaActual,
          historial: [nuevaEntradaHistorial, ...patronData.historial]
        }, { merge: true });

        alert(`✅ Salida Exitosa:\n${patronData.descripcion}\nAsignado a: ${usuarioSeleccionado}`);

      } 
      // =========================================================
      // 🚨 LÓGICA DE ENTRADA (CHECK-IN)
      // =========================================================
      else if (scanMode === 'entrada') {
        
        // Solo avisar si ya estaba en laboratorio, pero permitir el re-escaneo por si acaso
        if (patronData.estadoProceso === 'operativo') {
           alert(`⚠️ Aviso: El patrón "${patronData.descripcion}" ya aparece como OPERATIVO en sistema.`);
        }
        
        nuevaEntradaHistorial = {
          fecha: fechaActual,
          accion: 'Entrada (Devolución)',
          usuario: usuarioSeleccionado || 'Sistema',
          observaciones: `Equipo devuelto. (Usuario anterior: ${patronData.usuarioEnUso || 'N/A'})`
        };
        
        await setDoc(docRef, {
          estadoProceso: 'operativo',
          usuarioEnUso: '', 
          ubicacion: 'Laboratorio',
          fechaPrestamo: '', 
          historial: [nuevaEntradaHistorial, ...patronData.historial]
        }, { merge: true });

        alert(`✅ Devolución Exitosa:\n${patronData.descripcion}\nEstado: Operativo`);
      }
      
    } catch (error) {
      console.error("Error al actualizar Firebase:", error);
      alert("❌ Error de Conexión: No se pudo actualizar la base de datos.");
    } finally {
      setIsProcessing(false);
    }
  }, [scanMode, usuarioSeleccionado, stopScan]);

  // --- 4. useEffect para encender cámara ---
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
          console.error("Error al iniciar el escáner:", e);
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
              {scanMode === 'salida' ? 'Escanear Salida' : 'Escanear Entrada'}
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
        <button onClick={() => navigateTo('/')} style={styles.backButton} disabled={isProcessing}>
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
            <label style={styles.label}><User size={16} /> Selecciona tu Usuario</label>
            <select
              style={styles.select}
              value={usuarioSeleccionado}
              onChange={(e) => setUsuarioSeleccionado(e.target.value)}
              disabled={isLoadingUsers || isProcessing}
            >
              <option value="">{isLoadingUsers ? 'Cargando...' : '-- Tu nombre --'}</option>
              {metrologos.map(user => (
                <option key={user.id} value={user.nombre}>{user.nombre}</option>
              ))}
            </select>
            {scanMode === 'salida' && !usuarioSeleccionado &&
              <p style={styles.note}>*Requerido para registrar una salida.</p>
            }
          </div>

          <div style={styles.buttonGroup}>
            <button
              style={{...styles.button, ...styles.primaryButton}}
              onClick={() => handleOpenScanner('salida')}
              disabled={!usuarioSeleccionado || isProcessing}
            >
              <LogOut size={20} style={{ marginRight: '10px' }} />
              Registrar Salida (Check-Out)
            </button>
            <button
              style={{...styles.button, ...styles.secondaryButton}}
              onClick={() => handleOpenScanner('entrada')}
              disabled={isProcessing}
            >
              <LogIn size={20} style={{ marginRight: '10px' }} />
              Registrar Entrada (Check-In)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: '100vh', backgroundColor: '#f4f7f6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  header: { display: 'flex', alignItems: 'center', padding: '16px 24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0' },
  backButton: { background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px' },
  title: { margin: 0, color: '#333', fontSize: '1.5rem', fontWeight: 600 },
  content: { padding: '32px 24px', maxWidth: '700px', margin: '0 auto' },
  card: { backgroundColor: '#ffffff', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', position: 'relative' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '12px', color: '#333' },
  formGroup: { marginBottom: '24px' },
  label: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#555', marginBottom: '8px' },
  select: { width: '100%', padding: '12px', fontSize: '1rem', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: '#fff' },
  note: { fontSize: '0.8rem', color: '#dc2626', marginTop: '8px' },
  buttonGroup: { display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' },
  button: { width: '100%', padding: '16px', fontSize: '1rem', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: '#dc2626', color: '#ffffff' },
  secondaryButton: { backgroundColor: '#16a34a', color: '#ffffff' },
  dangerButton: { backgroundColor: '#e0e0e0', color: '#333' },
  scannerModal: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  scannerContent: { background: #fff', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '600px', textAlign: 'center' },
  scannerTitle: { marginTop: 0, color: '#333' },
  video: { width: '100%', height: 'auto', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '16px' },
};

export default ControlPrestamosScreen;