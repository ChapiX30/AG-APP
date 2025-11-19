import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, User, LogIn, LogOut, Loader2, Camera, XCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { format } from 'date-fns';

// --- Interfaces ---
// (Asegúrate de que coincida con la de ProgramaCalibracionScreen)
export interface HistorialEntry {
  fecha: string;
  accion: string;
  usuario: string;
  observaciones?: string;
  detalles?: any; 
}

export interface RegistroPatron {
  id?: string; // ID de Firestore
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
  // 🚨 AÑADIMOS EL NUEVO ESTADO
  estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio' | 'en_prestamo';
  fechaInicioProceso?: string;
  observaciones?: string;
  // 🚨 AÑADIMOS LOS NUEVOS CAMPOS
  usuarioEnUso?: string; 
  fechaPrestamo?: string;
  historial: HistorialEntry[];
}

type Metrologo = {
  id: string;
  nombre: string;
};
// -----------------

const COLLECTION_NAME = "patronesCalibracion";

export const ControlPrestamosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [metrologos, setMetrologos] = useState<Metrologo[]>([]);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false); // 🚀 NUEVO: Estado de carga
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'entrada' | 'salida'>('salida');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  // --- 1. Lógica para cargar usuarios (Metrólogos) ---
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

  // --- 2. Lógica para abrir/cerrar el escáner ---
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
  
  // --- 3. LÓGICA DE ESCANEO (COMPLETA) ---
  const handleScanResult = useCallback(async (noControl: string) => {
    if (!noControl) return;
    stopScan();
    setIsProcessing(true); // 🚀 Bloquea la UI

    try {
      // 1. Buscar el patrón en Firebase por 'noControl'
      const q = query(collection(db, COLLECTION_NAME), where("noControl", "==", noControl));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert(`❌ Error: Patrón con No. de Control "${noControl}" no encontrado.`);
        setIsProcessing(false);
        return;
      }

      // Obtenemos el primer (y único) documento
      const patronDoc = querySnapshot.docs[0];
      const patronData = patronDoc.data() as RegistroPatron;
      const patronId = patronDoc.id; // <-- El ID del documento

      const docRef = doc(db, COLLECTION_NAME, patronId);
      const fechaActual = format(new Date(), 'yyyy-MM-dd');
      let nuevaEntradaHistorial: HistorialEntry;

      // 2. Lógica de SALIDA (Check-Out)
      if (scanMode === 'salida') {
        // Validaciones
        if (patronData.estadoProceso === 'en_prestamo') {
          alert(`⚠️ Aviso: El patrón "${patronData.descripcion}" ya está EN PRÉSTAMO por ${patronData.usuarioEnUso || 'alguien'}.`);
          setIsProcessing(false);
          return;
        }
        if (patronData.estadoProceso === 'en_proceso' || patronData.estadoProceso === 'fuera_servicio') {
          alert(`❌ Error: El patrón "${patronData.descripcion}" no se puede prestar. Estado actual: ${patronData.estadoProceso.toUpperCase()}.`);
          setIsProcessing(false);
          return;
        }

        // Crear historial
        nuevaEntradaHistorial = {
          fecha: fechaActual,
          accion: 'Salida (Préstamo)',
          usuario: usuarioSeleccionado,
          observaciones: `Equipo retirado para uso en campo.`
        };

        // Actualizar Firebase
        await setDoc(docRef, {
          estadoProceso: 'en_prestamo',
          usuarioEnUso: usuarioSeleccionado,
          ubicacion: 'En Campo',
          fechaPrestamo: fechaActual,
          historial: [nuevaEntradaHistorial, ...patronData.historial]
        }, { merge: true }); // 'merge: true' es CRUCIAL para no borrar otros campos

        alert(`✅ Salida Registrada:\n${patronData.descripcion}\nPor: ${usuarioSeleccionado}`);

      } 
      // 3. Lógica de ENTRADA (Check-In)
      else if (scanMode === 'entrada') {
        
        if (patronData.estadoProceso === 'operativo' && patronData.ubicacion === 'Laboratorio') {
           alert(`⚠️ Aviso: El patrón "${patronData.descripcion}" ya se encuentra EN LABORATORIO.`);
           setIsProcessing(false);
           return;
        }
        
        // Crear historial
        nuevaEntradaHistorial = {
          fecha: fechaActual,
          accion: 'Entrada (Devolución)',
          usuario: usuarioSeleccionado || 'Sistema', // 'usuarioSeleccionado' puede estar vacío si solo se registra entrada
          observaciones: `Equipo devuelto a Laboratorio. (Recibido de: ${patronData.usuarioEnUso || 'N/A'})`
        };
        
        // Actualizar Firebase
        await setDoc(docRef, {
          estadoProceso: 'operativo',
          usuarioEnUso: '', // Limpiamos el usuario
          ubicacion: 'Laboratorio',
          fechaPrestamo: '', // Limpiamos la fecha
          historial: [nuevaEntradaHistorial, ...patronData.historial]
        }, { merge: true });

        alert(`✅ Entrada Registrada:\n${patronData.descripcion}`);
      }
      
    } catch (error) {
      console.error("Error al actualizar Firebase:", error);
      alert("❌ Error de Conexión: No se pudo actualizar la base de datos.");
    } finally {
      setIsProcessing(false); // 🚀 Desbloquea la UI
    }
  }, [scanMode, usuarioSeleccionado, stopScan]);

  // --- 4. useEffect para encender la cámara ---
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
              // Ignorar errores comunes
              if (error && !(error instanceof DOMException && error.name === 'NotAllowedError')) {
                // console.error(error); 
              }
            }
          );
          scannerControlsRef.current = controls;
        } catch (e) {
          console.error("Error al iniciar el escáner:", e);
          alert("Error al iniciar la cámara. Revisa los permisos (HTTPS es requerido).");
          stopScan();
        }
      };
      startScanLogic();
    }
    // Función de limpieza
    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
      }
    };
  }, [isScannerOpen, handleScanResult, stopScan]);


  return (
    <div style={styles.container}>
      
      {/* --- MODAL DEL ESCÁNER --- */}
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

      {/* --- Encabezado --- */}
      <div style={styles.header}>
        <button 
          onClick={() => navigateTo('/')} 
          style={styles.backButton}
          disabled={isProcessing}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={styles.title}>Control de Préstamos de Equipo</h1>
      </div>

      {/* --- Contenido Principal --- */}
      <div style={styles.content}>
        <div style={styles.card}>
          
          {/* 🚀 Overlay de Carga */}
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
              <option value="">
                {isLoadingUsers ? 'Cargando...' : '-- Tu nombre --'}
              </option>
              {metrologos.map(user => (
                <option key={user.id} value={user.nombre}>
                  {user.nombre}
                </option>
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
              title={!usuarioSeleccionado ? "Debes seleccionar un usuario primero" : "Registrar salida de equipo"}
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

// --- ESTILOS (Sencillos para esta pantalla) ---
// (Añadimos el overlay de carga)
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f4f7f6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e0e0e0',
  },
  backButton: {
    background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '50%',
    width: '40px', height: '40px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginRight: '16px',
  },
  title: {
    margin: 0, color: '#333', fontSize: '1.5rem', fontWeight: 600,
  },
  content: {
    padding: '32px 24px',
    maxWidth: '700px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    position: 'relative', // Para el overlay
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderRadius: '12px',
    color: '#333',
  },
  formGroup: {
    marginBottom: '24px',
  },
  label: {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontWeight: 600, color: '#555', marginBottom: '8px',
  },
  select: {
    width: '100%',
    padding: '12px',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: '#fff',
  },
  note: {
    fontSize: '0.8rem',
    color: '#dc2626',
    marginTop: '8px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '32px',
  },
  button: {
    width: '100%',
    padding: '16px',
    fontSize: '1rem',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#dc2626', // Rojo para "Salida"
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: '#16a34a', // Verde para "Entrada"
    color: '#ffffff',
  },
  dangerButton: {
    backgroundColor: '#e0e0e0',
    color: '#333',
  },
  scannerModal: {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  scannerContent: {
    background: '#fff', padding: '20px', borderRadius: '12px',
    width: '90%', maxWidth: '600px', textAlign: 'center',
  },
  scannerTitle: {
    marginTop: 0, color: '#333',
  },
  video: {
    width: '100%', height: 'auto', borderRadius: '8px', border: '1px solid #ddd',
    marginBottom: '16px',
  },
};

export default ControlPrestamosScreen;