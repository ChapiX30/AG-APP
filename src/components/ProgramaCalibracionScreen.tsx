import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO, format, addDays, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Download,
  Search,
  Activity,
  Settings,
  TrendingUp,
  AlertCircle,
  Bell,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  Edit,
  History,
  Wrench,
  Target,
  ArrowLeft,
  ChevronDown,
  Save,
  Loader2,
  Info,
  Trash2
} from 'lucide-react';
// Importa tu hook personalizado de navegación
import { useNavigation } from '../hooks/useNavigation';
import { patronesData } from './patronesData'; 
// *** NUEVA IMPORTACIÓN ***
import * as ics from 'ics';

// --- IMPORTACIONES DE FIREBASE ---
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  query,
  where 
} from 'firebase/firestore';
// Asume que tienes configurada la conexión a Firebase en '../utils/firebase'
// **IMPORTANTE:** Reemplaza el path si es necesario.
// **NOTA IMPORTANTE:** Debes asegurarte de que tu archivo '../utils/firebase'
// exporte la constante 'db' de tu configuración de Firestore.
import { db } from '../utils/firebase'; 


// --- INTERFACES (EXPORTADAS) ---

export interface HistorialEntry {
  fecha: string;
  accion: string;
  usuario: string;
  observaciones?: string;
  detalles?: any; 
}

// Añadimos 'id' para la referencia en Firestore
export interface RegistroPatron {
  id?: string; // ID generado por Firestore
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
  estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio';
  fechaInicioProceso?: string;
  observaciones?: string;
  historial: HistorialEntry[];
}

// --- SIMULACIÓN DE CONTEXTO DE USUARIO ---
// En una app real, esto vendría de un React Context (AuthContext)

// OPCIÓN 1: Usuario Administrador (Puede Editar)
// ¡¡ESTÁ ACTIVO POR DEFECTO PARA QUE VEAS QUE CALIDAD SÍ PUEDE EDITAR!!
const mockCurrentUser = {
  nombre: "Viridiana Moreno",
  puesto: "calidad"
};

// OPCIÓN 2: Usuario Administrador (Puede Editar)
// const mockCurrentUser = {
//   nombre: "Viridiana Moreno",
//   puesto: "calidad"
// };

// OPCIÓN 3: Usuario Visualizador (No puede editar)
// PARA PROBAR, COMENTA LA OPCIÓN 1 Y DESCOMENTA ESTA
/*
const mockCurrentUser = {  // <-- ¡CORREGIDO! Ya no tiene [ ]
  nombre: "Abraham Ginez",
  puesto: "Metrólogo"
};
*/
// ------------------------------------------

const COLLECTION_NAME = "patronesCalibracion"; // Nombre de tu colección en Firestore

// --- Tipos para el ordenamiento
type SortableColumn = keyof RegistroPatron | 'statusVencimiento';

export const ProgramaCalibracionScreen: React.FC = () => {
  const [fechaFiltro, setFechaFiltro] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroServicio, setFFiltroServicio] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');
  const [loading, setLoading] = useState(true); 
  
  // 🔄 ESTADOS DE ORDENAMIENTO (para habilitar la tabla interactiva)
  const [sortColumn, setSortColumn] = useState<SortableColumn>('statusVencimiento');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // ------------------------------------

  // --- ESTADOS DE DATOS Y MODALES ---
  const [data, setData] = useState<RegistroPatron[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [accionModalOpen, setAccionModalOpen] = useState(false);
  const [historialModalOpen, setHistorialModalOpen] = useState(false);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<RegistroPatron | null>(null);
  const [accionSeleccionada, setAccionSeleccionada] = useState<string>('');
  const [observacionesAccion, setObservacionesAccion] = useState<string>('');
  const [nuevaFechaVencimiento, setNuevaFechaVencimiento] = useState<string>('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [equipoEditando, setEquipoEditando] = useState<RegistroPatron | null>(null);
  const [calibracionModalOpen, setCalibracionModalOpen] = useState(false);
  const [mantenimientoModalOpen, setMantenimientoModalOpen] = useState(false);
  const [verificacionModalOpen, setVerificacionModalOpen] = useState(false);

  const [datosEnvio, setDatosEnvio] = useState({
    laboratorio: '', direccion: '', contacto: '', telefono: '', email: '',
    paqueteria: '', fechaEnvio: format(new Date(), 'yyyy-MM-dd'), fechaEstimadaRegreso: '',
    costo: '', numeroOrden: '', observaciones: '', numeroPaqueteria: '',
  });

  // *** NUEVO ESTADO PARA EL USUARIO ***
  // Usamos el mock para simular el usuario logueado
  const [currentUser, setCurrentUser] = useState(mockCurrentUser);

  // *** NUEVA VARIABLE DE PERMISO ***
  const canEdit = useMemo(() => {
    if (!currentUser) return false;
    
    // La regla es: Puesto "calidad" Y el nombre es uno de los dos.
    const isAdminName = ['Viridiana Moreno', 'Jesús Sustaita'].includes(currentUser.nombre);
    const isAdminPuesto = currentUser.puesto === 'calidad';
    
    return isAdminName && isAdminPuesto;
  }, [currentUser]);
  
  // *** ACTUALIZAMOS LA CONSTANTE DE USUARIO ***
  // La usamos para el historial
  const USUARIO_ACTUAL = currentUser.nombre;

  const limpiarDatosEnvio = () => {
    setDatosEnvio({
      laboratorio: '', direccion: '', contacto: '', telefono: '', email: '',
      paqueteria: '', fechaEnvio: format(new Date(), 'yyyy-MM-dd'), fechaEstimadaRegreso: '',
      costo: '', numeroOrden: '', observaciones: '', numeroPaqueteria: '',
    });
  };

  const [nuevoRegistro, setNuevoRegistro] = useState<RegistroPatron>({
    noControl: '', descripcion: '', serie: '', marca: '', modelo: '',
    frecuencia: '12 Meses ± 5 Días', tipoServicio: 'Calibración', fecha: '', prioridad: 'Media',
    ubicacion: 'Laboratorio', responsable: USUARIO_ACTUAL, estadoProceso: 'operativo', historial: []
  });

  const hoy = new Date();
  const { navigateTo } = useNavigation();

  const handleGoBack = () => {
    navigateTo('menu');
  };

  // --- LÓGICA DE CARGA DE DATOS (FIREBASE) ---
  const fetchPatrones = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, COLLECTION_NAME));
      const querySnapshot = await getDocs(q);
      const fetchedData: RegistroPatron[] = [];

      querySnapshot.forEach((doc) => {
        fetchedData.push({ id: doc.id, ...doc.data() } as RegistroPatron);
      });

      if (fetchedData.length === 0) {
        // Lógica de inicialización: Usa patronesData.ts si la colección está vacía.
        console.log("No hay datos en Firestore. Inicializando con patronesData.ts");
        
        const promises = patronesData.map(patron => 
          addDoc(collection(db, COLLECTION_NAME), patron)
        );
        await Promise.all(promises);

        setData(patronesData);
      } else {
        setData(fetchedData);
      }
    } catch (e) {
      console.error("Error al cargar o inicializar los patrones: ", e);
      // Fallback a localStorage si el entorno lo permite
      const saved = localStorage.getItem('patrones_calibracion');
      if (saved) {
        setData(JSON.parse(saved));
      } else {
        setData(patronesData); 
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatrones();
  }, [fetchPatrones]);
  // --- FIN CARGA DE DATOS ---
  
  // ⚙️ FUNCIÓN PARA MANEJAR EL ORDENAMIENTO
  const handleSort = (column: SortableColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // --- LÓGICA DE CÁLCULO DE ESTADO Y PRIORIDAD ---
  const getStatusInfo = (fecha: string) => {
    if (!fecha || fecha === 'Por Comprar' || fecha === '') {
      return { status: 'pendiente', color: 'bg-gray-500', bgColor: 'bg-gray-50', textColor: 'text-gray-700', borderColor: 'border-gray-200', label: 'Pendiente', icon: Info, dias: 0, sortValue: 4 };
    }
    try {
      const fechaVencimiento = parseISO(fecha);
      const dias = differenceInDays(fechaVencimiento, hoy);

      if (dias < 0) {
        return { status: 'vencido', color: 'bg-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200', label: 'Vencido', icon: AlertTriangle, dias: Math.abs(dias), sortValue: 0 };
      }
      if (dias >= 0 && dias <= 7) {
        return { status: 'critico', color: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200', label: 'Crítico', icon: AlertCircle, dias, sortValue: 1 };
      }
      if (dias > 7 && dias <= 30) {
        return { status: 'proximo', color: 'bg-yellow-500', bgColor: 'bg-yellow-50', textColor: 'text-yellow-700', borderColor: 'border-yellow-200', label: 'Próximo', icon: Clock, dias, sortValue: 2 };
      }
      return { status: 'vigente', color: 'bg-green-500', bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200', label: 'Vigente', icon: CheckCircle, dias, sortValue: 3 };
    } catch (error) {
       return { status: 'pendiente', color: 'bg-gray-500', bgColor: 'bg-gray-50', textColor: 'text-gray-700', borderColor: 'border-gray-200', label: 'Error Fecha', icon: Info, dias: 0, sortValue: 5 };
    }
  };

  // *** CORRECCIÓN: 'color' -> 'textColor' ***
  const getEstadoProcesoInfo = (estadoProceso: RegistroPatron['estadoProceso']) => {
    switch(estadoProceso) {
      case 'operativo': return { label: 'Operativo', textColor: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: Target, sortValue: 4 };
      case 'programado': return { label: 'Programado', textColor: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200', icon: Calendar, sortValue: 2 };
      case 'en_proceso': return { label: 'En Proceso', textColor: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', icon: Wrench, sortValue: 1 };
      case 'completado': return { label: 'Completado', textColor: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200', icon: CheckCircle2, sortValue: 3 };
      case 'fuera_servicio': return { label: 'Fuera de Servicio', textColor: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: XCircle, sortValue: 0 };
      default: return { label: 'Desconocido', textColor: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', icon: AlertCircle, sortValue: 5 };
    }
  };

  const getPrioridadColor = (prioridad: string) => {
    switch(prioridad) {
      case 'Alta': return 'bg-red-100 text-red-800 border border-red-200';
      case 'Media': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'Baja': return 'bg-green-100 text-green-800 border border-green-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getPrioridadSortValue = (prioridad: string): number => {
    switch(prioridad) {
        case 'Alta': return 0;
        case 'Media': return 1;
        case 'Baja': return 2;
        default: return 3;
    }
  };
  
  const parseFrecuenciaEnMeses = (frecuencia: string): number => {
    const mesesMatch = frecuencia.match(/(\d+)\s*Meses?/i);
    return mesesMatch ? parseInt(mesesMatch[1], 10) : 12;
  };
  
  const calcularNuevaFechaVencimiento = (frecuencia: string, fechaBase: Date = new Date()) => {
    try {
        const meses = parseFrecuenciaEnMeses(frecuencia);
        return format(addMonths(fechaBase, meses), 'yyyy-MM-dd');
    } catch (e) {
        return format(addMonths(fechaBase, 12), 'yyyy-MM-dd'); // Fallback
    }
  };
  
  // --- LÓGICA DE ACCIONES ---

  const getAccionesDisponibles = (item: RegistroPatron) => {
    const acciones = [];

    if (item.tipoServicio === 'Calibración' && item.estadoProceso === 'operativo') {
        acciones.push({ id: 'calibracion_externa', label: 'Calibración Externa', icon: Calendar, color: 'bg-blue-600 hover:bg-blue-700' });
    } else if (item.tipoServicio === 'Mantenimiento' && item.estadoProceso === 'operativo') {
        acciones.push({ id: 'mantenimiento', label: 'Iniciar Mantenimiento', icon: Wrench, color: 'bg-red-600 hover:bg-red-700' });
    } else if (item.tipoServicio === 'Verificación' && item.estadoProceso === 'operativo') {
        acciones.push({ id: 'verificacion', label: 'Iniciar Verificación', icon: Eye, color: 'bg-green-600 hover:bg-green-700' });
    }

    switch(item.estadoProceso) {
      case 'operativo':
        acciones.push({ id: 'programar', label: 'Programar Servicio', icon: Clock, color: 'bg-purple-600 hover:bg-purple-700' });
        acciones.push({ id: 'fuera_servicio', label: 'Poner Fuera de Servicio', icon: XCircle, color: 'bg-red-600 hover:bg-red-700' });
        break;
      case 'programado':
        acciones.push({ id: 'iniciar_proceso', label: 'Iniciar Proceso', icon: Play, color: 'bg-orange-600 hover:bg-orange-700' });
        acciones.push({ id: 'cancelar', label: 'Cancelar Programa', icon: RotateCcw, color: 'bg-gray-600 hover:bg-gray-700' });
        break;
      case 'en_proceso':
        acciones.push({ id: 'completar', label: 'Completar Proceso', icon: CheckCircle2, color: 'bg-green-600 hover:bg-green-700' });
        acciones.push({ id: 'pausar', label: 'Pausar Proceso', icon: Pause, color: 'bg-yellow-600 hover:bg-yellow-700' });
        break;
      case 'completado':
        acciones.push({ id: 'reactivar', label: 'Reactivar/Operativo', icon: RotateCcw, color: 'bg-blue-600 hover:bg-blue-700' });
        break;
      case 'fuera_servicio':
        acciones.push({ id: 'reactivar', label: 'Poner Operativo', icon: RotateCcw, color: 'bg-blue-600 hover:bg-blue-700' });
        break;
    }
    
    if (item.estadoProceso === 'operativo' || item.estadoProceso === 'programado' || item.estadoProceso === 'fuera_servicio') {
      acciones.push({ id: 'editar', label: 'Editar Datos', icon: Edit, color: 'bg-gray-400 hover:bg-gray-500' });
    }

    return acciones.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
  };
  
  // --- MANIPULACIÓN DE DATOS (FIREBASE) ---
  
  const ejecutarAccion = async () => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para realizar esta acción.");
      setAccionModalOpen(false);
      return;
    }
    // **********************************

    if (!equipoSeleccionado || !accionSeleccionada || !equipoSeleccionado.id) return;
    setLoading(true);

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: '',
      usuario: USUARIO_ACTUAL,
      observaciones: observacionesAccion
    };
    
    let nuevaFecha = equipoSeleccionado.fecha;

    switch(accionSeleccionada) {
      case 'programar':
        equipoActualizado.estadoProceso = 'programado';
        nuevaEntradaHistorial.accion = `${equipoSeleccionado.tipoServicio} programado`;
        break;
      case 'iniciar_proceso':
        equipoActualizado.estadoProceso = 'en_proceso';
        equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
        nuevaEntradaHistorial.accion = `Proceso iniciado genérico para ${equipoSeleccionado.tipoServicio}`;
        break;
      case 'completar':
        equipoActualizado.estadoProceso = 'operativo';
        equipoActualizado.fechaInicioProceso = undefined;
        nuevaFecha = nuevaFechaVencimiento || calcularNuevaFechaVencimiento(equipoSeleccionado.frecuencia, hoy);
        equipoActualizado.fecha = nuevaFecha;
        nuevaEntradaHistorial.accion = `${equipoSeleccionado.tipoServicio} completado`;
        break;
      case 'pausar':
        equipoActualizado.estadoProceso = 'programado';
        nuevaEntradaHistorial.accion = `${equipoSeleccionado.tipoServicio} pausado`;
        break;
      case 'cancelar':
        equipoActualizado.estadoProceso = 'operativo';
        nuevaEntradaHistorial.accion = `${equipoSeleccionado.tipoServicio} cancelado`;
        break;
      case 'reactivar':
        equipoActualizado.estadoProceso = 'operativo';
        nuevaEntradaHistorial.accion = 'Equipo puesto en Operativo';
        break;
      case 'fuera_servicio':
        equipoActualizado.estadoProceso = 'fuera_servicio';
        nuevaEntradaHistorial.accion = 'Puesto Fuera de Servicio';
        break;
    }

    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];
    
    try {
      const { id, ...dataToUpdate } = equipoActualizado;
      const docRef = doc(db, COLLECTION_NAME, equipoSeleccionado.id);
      await updateDoc(docRef, dataToUpdate);
      await fetchPatrones();

    } catch (e) {
      console.error("Error al ejecutar la acción en Firebase: ", e);
      alert("Error al guardar la acción. Intente de nuevo.");
    } finally {
      setLoading(false);
      setAccionModalOpen(false);
      setAccionSeleccionada('');
      setObservacionesAccion('');
      setNuevaFechaVencimiento('');
      setEquipoSeleccionado(null);
    }
  };
  
  const abrirModalAccion = (equipo: RegistroPatron, accion: string) => {
    setEquipoSeleccionado(equipo);
    setAccionSeleccionada(accion);

    if (accion === 'calibracion_externa') {
      limpiarDatosEnvio(); setCalibracionModalOpen(true); return;
    } else if (accion === 'mantenimiento') {
      limpiarDatosEnvio(); setMantenimientoModalOpen(true); return;
    } else if (accion === 'verificacion') {
      limpiarDatosEnvio(); setVerificacionModalOpen(true); return;
    } else if (accion === 'editar') {
      setEquipoEditando(equipo); setEditModalOpen(true); return;
    }
    
    if (accion === 'completar') {
      setNuevaFechaVencimiento(calcularNuevaFechaVencimiento(equipo.frecuencia, hoy));
    } else {
      setNuevaFechaVencimiento('');
    }
    setObservacionesAccion(equipo.observaciones || '');
    setAccionModalOpen(true);
  };

  const abrirHistorial = (equipo: RegistroPatron) => {
    setEquipoSeleccionado(equipo);
    setHistorialModalOpen(true);
  };

  const handleGuardar = async () => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para agregar nuevos patrones.");
      setModalOpen(false);
      return;
    }
    // **********************************

    if (!nuevoRegistro.noControl || !nuevoRegistro.descripcion || !nuevoRegistro.fecha) {
      alert('Por favor complete los campos obligatorios');
      return;
    }
    setLoading(true);
    
    const nuevaEntradaHistorial: HistorialEntry = {
        fecha: format(new Date(), 'yyyy-MM-dd'),
        accion: 'Registro Creado',
        usuario: USUARIO_ACTUAL,
        observaciones: 'Patrón añadido al sistema.'
    };
    
    try {
      await addDoc(collection(db, COLLECTION_NAME), {
        ...nuevoRegistro,
        historial: [nuevaEntradaHistorial]
      });
      
      await fetchPatrones();

    } catch (e) {
      console.error("Error al agregar patrón a Firebase: ", e);
      alert("Error al guardar el patrón. Intente de nuevo.");
    } finally {
      setLoading(false);
      setModalOpen(false);
      setNuevoRegistro({
        noControl: '', descripcion: '', serie: '', marca: '', modelo: '',
        frecuencia: '12 Meses ± 5 Días', tipoServicio: 'Calibración', fecha: '', prioridad: 'Media',
        ubicacion: 'Laboratorio', responsable: USUARIO_ACTUAL, estadoProceso: 'operativo', historial: []
      });
    }
  };

  const guardarEdicion = async () => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para editar patrones.");
      setEditModalOpen(false);
      return;
    }
    // **********************************

    if (!equipoEditando || !equipoEditando.id) return;
    setLoading(true);
    
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: 'Registro Editado',
      usuario: USUARIO_ACTUAL,
      observaciones: 'Se modificaron los datos generales del patrón.'
    };
    
    const equipoConHistorial = { 
        ...equipoEditando, 
        historial: [nuevaEntradaHistorial, ...equipoEditando.historial] 
    };

    try {
      const { id, ...dataToUpdate } = equipoConHistorial;

      const docRef = doc(db, COLLECTION_NAME, equipoEditando.id);
      await updateDoc(docRef, dataToUpdate);
      
      await fetchPatrones();

    } catch (e) {
      console.error("Error al editar patrón en Firebase: ", e);
      alert("Error al guardar la edición. Intente de nuevo.");
    } finally {
      setLoading(false);
      setEditModalOpen(false);
      setEquipoEditando(null);
    }
  };
  
  const handleEliminar = async (id: string) => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para eliminar patrones.");
      return;
    }
    // **********************************

    setLoading(true);
    try {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);

        await fetchPatrones();

    } catch (e) {
        console.error("Error al eliminar patrón en Firebase: ", e);
        alert("Error al eliminar el patrón. Intente de nuevo.");
    } finally {
        setLoading(false);
    }
  };

  const procesarEnvioCalibracion = async () => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para registrar acciones.");
      setCalibracionModalOpen(false);
      return;
    }
    // **********************************

    if (!equipoSeleccionado || !equipoSeleccionado.id) return;
    setLoading(true);

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: 'Envío a Calibración Externa',
      usuario: USUARIO_ACTUAL,
      observaciones: `Lab: ${datosEnvio.laboratorio}, Guía: ${datosEnvio.numeroPaqueteria}. ${datosEnvio.observaciones}`,
      detalles: datosEnvio
    };

    equipoActualizado.estadoProceso = 'en_proceso'; 
    equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];

    try {
        const { id, ...dataToUpdate } = equipoActualizado;
        const docRef = doc(db, COLLECTION_NAME, equipoSeleccionado.id);
        await updateDoc(docRef, dataToUpdate);
        await fetchPatrones();
    } catch (e) {
        console.error("Error al procesar envío a Firebase: ", e);
        alert("Error al guardar el envío. Intente de nuevo.");
    } finally {
        setLoading(false);
        setCalibracionModalOpen(false);
        limpiarDatosEnvio();
        setEquipoSeleccionado(null);
    }
  };

  const procesarMantenimiento = async () => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para registrar acciones.");
      setMantenimientoModalOpen(false);
      return;
    }
    // **********************************

    if (!equipoSeleccionado || !equipoSeleccionado.id) return;
    setLoading(true);

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: `Mantenimiento iniciado - Tipo: ${datosEnvio.laboratorio}`,
      usuario: USUARIO_ACTUAL,
      observaciones: datosEnvio.observaciones,
      detalles: datosEnvio
    };

    equipoActualizado.estadoProceso = 'en_proceso';
    equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];

    try {
        const { id, ...dataToUpdate } = equipoActualizado;
        const docRef = doc(db, COLLECTION_NAME, equipoSeleccionado.id);
        await updateDoc(docRef, dataToUpdate);
        await fetchPatrones();
    } catch (e) {
        console.error("Error al procesar mantenimiento a Firebase: ", e);
        alert("Error al guardar el mantenimiento. Intente de nuevo.");
    } finally {
        setLoading(false);
        setMantenimientoModalOpen(false);
        limpiarDatosEnvio();
        setEquipoSeleccionado(null);
    }
  };

  const procesarVerificacion = async () => {
    // *** NUEVA VALIDACIÓN DE PERMISO ***
    if (!canEdit) {
      alert("No tiene permisos para registrar acciones.");
      setVerificacionModalOpen(false);
      return;
    }
    // **********************************
    
    if (!equipoSeleccionado || !equipoSeleccionado.id) return;
    setLoading(true);

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: `Verificación iniciada - Tipo: ${datosEnvio.laboratorio}`,
      usuario: USUARIO_ACTUAL,
      observaciones: datosEnvio.observaciones,
      detalles: datosEnvio
    };

    equipoActualizado.estadoProceso = 'en_proceso';
    equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];

    try {
        const { id, ...dataToUpdate } = equipoActualizado;
        const docRef = doc(db, COLLECTION_NAME, equipoSeleccionado.id);
        await updateDoc(docRef, dataToUpdate);
        await fetchPatrones();
    } catch (e) {
        console.error("Error al procesar verificación a Firebase: ", e);
        alert("Error al guardar la verificación. Intente de nuevo.");
    } finally {
        setLoading(false);
        setVerificacionModalOpen(false);
        limpiarDatosEnvio();
        setEquipoSeleccionado(null);
    }
  };

  // --- FILTRADO Y ORDENAMIENTO ---

  const dataFiltrada = useMemo(() => {
    let filtered = data.filter(item => {
      const statusInfo = getStatusInfo(item.fecha);
      const cumpleFecha = fechaFiltro === '' || item.fecha.startsWith(fechaFiltro);
      const cumpleEstado = filtroEstado === 'todos' || statusInfo.status === filtroEstado;
      const cumpleServicio = filtroServicio === 'todos' || item.tipoServicio === filtroServicio;
      const cumpleBusqueda = busqueda === '' ||
        item.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.noControl.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.marca.toLowerCase().includes(busqueda.toLowerCase());

      return cumpleFecha && cumpleEstado && cumpleServicio && cumpleBusqueda;
    });

    // 🔄 LÓGICA DE ORDENAMIENTO APLICADA DESPUÉS DEL FILTRADO
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortColumn === 'statusVencimiento') {
        // Ordena por el valor numérico del estado de vencimiento (0=Vencido, 1=Crítico, ...)
        aValue = getStatusInfo(a.fecha).sortValue;
        bValue = getStatusInfo(b.fecha).sortValue;
        
        // Si los estados son iguales (ej. ambos Vigentes), usa la fecha como desempate
        if (aValue === bValue) {
            aValue = a.fecha ? parseISO(a.fecha).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
            bValue = b.fecha ? parseISO(b.fecha).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
        }

      } else if (sortColumn === 'fecha' || sortColumn === 'fechaInicioProceso') {
        // Ordena fechas
        aValue = a[sortColumn] ? parseISO(a[sortColumn]!).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);
        bValue = b[sortColumn] ? parseISO(b[sortColumn]!).getTime() : (sortDirection === 'asc' ? Infinity : -Infinity);

      } else if (sortColumn === 'prioridad') {
        // Ordena prioridades (Alta=0, Media=1, Baja=2)
        aValue = getPrioridadSortValue(a.prioridad);
        bValue = getPrioridadSortValue(b.prioridad);

      } else if (sortColumn === 'estadoProceso') {
         // Ordena por estado de proceso
        aValue = getEstadoProcesoInfo(a.estadoProceso).sortValue;
        bValue = getEstadoProcesoInfo(b.estadoProceso).sortValue;
        
      } else {
        // Ordena cadenas (strings)
        aValue = (a[sortColumn as keyof RegistroPatron] || '').toLowerCase();
        bValue = (b[sortColumn as keyof RegistroPatron] || '').toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0; // Si son iguales, no cambia el orden relativo
    });

    return filtered;
  }, [data, fechaFiltro, filtroEstado, filtroServicio, busqueda, sortColumn, sortDirection]);

  const estadisticas = useMemo(() => {
    const total = data.length;
    const operativos = data.filter(item => item.estadoProceso !== 'fuera_servicio');
    const vencidos = operativos.filter(item => getStatusInfo(item.fecha).status === 'vencido').length;
    const criticos = operativos.filter(item => getStatusInfo(item.fecha).status === 'critico').length;
    const proximos = operativos.filter(item => getStatusInfo(item.fecha).status === 'proximo').length;
    const vigentes = operativos.filter(item => getStatusInfo(item.fecha).status === 'vigente').length;

    return { total, vencidos, criticos, proximos, vigentes };
  }, [data]);

  const handleExportar = () => {
    const csv = [
      ['No. Control', 'Descripción', 'Serie', 'Marca', 'Modelo', 'Frecuencia', 'Tipo Servicio', 'Fecha', 'Estado', 'Prioridad', 'Ubicación', 'Responsable'],
      ...dataFiltrada.map(d => {
        const status = getStatusInfo(d.fecha);
        return [d.noControl, d.descripcion, d.serie, d.marca, d.modelo, d.frecuencia, d.tipoServicio, d.fecha, status.label, d.prioridad, d.ubicacion, d.responsable];
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `programa_calibracion_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  // *** INICIO: NUEVA FUNCIÓN PARA EXPORTAR CALENDARIO ***
  const handleExportarCalendario = () => {
    if (data.length === 0) {
      alert("No hay patrones para exportar.");
      return;
    }

    // 1. Mapear los datos de patrones a eventos de calendario
    const eventos = data
      .filter(item => item.fecha && item.fecha !== 'Por Comprar') // Filtra los que tienen fecha
      .map(item => {
        try {
          // Usamos UTC para evitar problemas de zona horaria
          const fechaVencimiento = parseISO(item.fecha);
          const [year, month, day] = [
            fechaVencimiento.getUTCFullYear(),
            fechaVencimiento.getUTCMonth() + 1, // Meses en ics son 1-12
            fechaVencimiento.getUTCDate()
          ];

          return {
            title: `VENCIMIENTO: ${item.descripcion} (${item.noControl})`,
            start: [year, month, day] as ics.DateArray,
            duration: { days: 1 }, // Evento de todo el día
            description: `Patrón: ${item.descripcion}\nNo. Control: ${item.noControl}\nSerie: ${item.serie}\nMarca: ${item.marca}\nServicio: ${item.tipoServicio}`,
            status: 'CONFIRMED' as ics.EventStatus,
            busyStatus: 'FREE' as ics.BusyStatus,
          };
        } catch (e) {
          console.error("Error al parsear fecha para ics:", item.fecha);
          return null; // Omite eventos con fechas inválidas
        }
      })
      .filter(Boolean) as ics.EventAttributes[]; // Filtra nulos

    if (eventos.length === 0) {
      alert("No hay patrones con fechas válidas para exportar.");
      return;
    }

    // 2. Crear el archivo .ics
    const { error, value } = ics.createEvents(eventos);

    if (error) {
      console.error("Error al crear archivo ics:", error);
      alert("Error al generar el archivo de calendario.");
      return;
    }

    if (!value) {
      alert("No se pudo generar el calendario.");
      return;
    }

    // 3. Crear el Blob y descargarlo
    const blob = new Blob([value], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vencimientos_calibracion_${format(new Date(), 'yyyy-MM-dd')}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  // *** FIN: NUEVA FUNCIÓN PARA EXPORTAR CALENDARIO ***


  // --- FUNCIÓN PARA OBTENER LA LISTA DE PATRONES ÚNICOS (MANTENIDA EN MEMORIA POR SI SE USA EN OTRO COMPONENTE) ---
  const getPatronesList = () => {
      const descripcionesUnicas = Array.from(new Set(data.map(patron => patron.descripcion)));
      return descripcionesUnicas.filter(desc => desc && desc !== '');
  };

  const patronesUnicos = useMemo(() => getPatronesList(), [data]);

  // --- RENDERIZADO (JSX) ---

  // ℹ️ FUNCIÓN DE RENDERIZADO PARA LOS ENCABEZADOS DE COLUMNA
  const renderSortableHeader = (columnKey: SortableColumn, label: string) => (
    <th className="text-left p-4 font-semibold text-gray-700">
      <button
        onClick={() => handleSort(columnKey)}
        className="flex items-center gap-1 hover:text-blue-600 transition-colors"
      >
        {label}
        {sortColumn === columnKey && (
          <ChevronDown 
            className={`w-4 h-4 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} 
          />
        )}
      </button>
    </th>
  );
  // -------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleGoBack}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
                title="Regresar al menú"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="p-2 bg-blue-600 rounded-lg">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Sistema de Calibración</h1>
                <p className="text-sm text-gray-500">Gestión y monitoreo de patrones de medición</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
                <Bell className="w-5 h-5 text-gray-600" />
              </div>
              <div className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
                <Settings className="w-5 h-5 text-gray-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        
        {loading && (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mr-2" />
            <span className="text-lg text-gray-700">Cargando datos de Firebase...</span>
          </div>
        )}

        {!loading && (
          <>
            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Patrones</p>
                    <p className="text-3xl font-bold text-gray-900">{estadisticas.total}</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-xl shadow-sm border border-red-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600 mb-1">Vencidos</p>
                    <p className="text-3xl font-bold text-red-700">{estadisticas.vencidos}</p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-orange-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-orange-600 mb-1">Críticos (≤7 días)</p>
                    <p className="text-3xl font-bold text-orange-700">{estadisticas.criticos}</p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-xl shadow-sm border border-green-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 mb-1">Vigentes</p>
                    <p className="text-3xl font-bold text-green-700">{estadisticas.vigentes}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Filters and Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex flex-col sm:flex-row gap-4 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Buscar por descripción, control o marca..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </div>

                  <select
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                  >
                    <option value="todos">Todos los estados</option>
                    <option value="vencido">Vencidos</option>
                    <option value="critico">Críticos</option>
                    <option value="proximo">Próximos</option>
                    <option value="vigente">Vigentes</option>
                    <option value="pendiente">Pendientes</option>
                  </select>

                  <select
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={filtroServicio}
                    onChange={(e) => setFFiltroServicio(e.target.value)}
                  >
                    <option value="todos">Todos los servicios</option>
                    <option value="Calibración">Calibración</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Verificación">Verificación</option>
                  </select>

                  <input
                    type="month"
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={fechaFiltro}
                    onChange={(e) => setFechaFiltro(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  
                  {/* *** MODIFICACIÓN: Botón "Nuevo Patrón" solo para Admins *** */}
                  {canEdit && (
                    <button
                      onClick={() => setModalOpen(true)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
                    >
                      <Plus className="w-4 h-4" />
                      Nuevo Patrón
                    </button>
                  )}
                  {/* *** FIN DE MODIFICACIÓN *** */}
                  
                  <button
                    onClick={handleExportar}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    Exportar
                  </button>
                  
                  {/* *** INICIO: NUEVO BOTÓN DE CALENDARIO *** */}
                  <button
                    onClick={handleExportarCalendario}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
                  >
                    <Calendar className="w-4 h-4" />
                    Calendario
                  </button>
                  {/* *** FIN: NUEVO BOTÓN DE CALENDARIO *** */}

                </div>
              </div>
            </div>

            {/* Results Info */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Mostrando {dataFiltrada.length} de {data.length} patrones
              </p>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {renderSortableHeader('noControl', 'Control')}
                      {renderSortableHeader('descripcion', 'Descripción')}
                      {renderSortableHeader('marca', 'Marca/Modelo')}
                      {renderSortableHeader('tipoServicio', 'Servicio')}
                      {renderSortableHeader('fecha', 'Fecha Vencimiento')} 
                      {renderSortableHeader('statusVencimiento', 'Estado Calibración')} 
                      {renderSortableHeader('estadoProceso', 'Estado Proceso')}
                      {renderSortableHeader('prioridad', 'Prioridad')}
                      <th className="text-left p-4 font-semibold text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {dataFiltrada.map((item, index) => {
                        const statusInfo = getStatusInfo(item.fecha);
                        const IconComponent = statusInfo.icon;
                        const estadoProcesoInfo = getEstadoProcesoInfo(item.estadoProceso);
                        const EstadoProcesoIcon = estadoProcesoInfo.icon;
                        const accionesDisponibles = getAccionesDisponibles(item);

                        return (
                          <motion.tr
                            key={item.id || item.noControl} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, delay: index * 0.05 }}
                            className={`border-b border-gray-100 hover:bg-gray-50 transition-colors group`}
                          >
                            <td className="p-4">
                              <div className="font-semibold text-gray-900">{item.noControl}</div>
                              <div className="text-xs text-gray-500">{item.ubicacion}</div>
                            </td>
                            <td className="p-4">
                              <div className="font-medium text-gray-900">{item.descripcion}</div>
                              <div className="text-xs text-gray-500">Serie: {item.serie}</div>
                            </td>
                            <td className="p-4">
                              <div className="font-medium text-gray-700">{item.marca}</div>
                              <div className="text-xs text-gray-500">{item.modelo}</div>
                            </td>
                            <td className="p-4">
                              <div className="font-medium text-gray-700">{item.tipoServicio}</div>
                              <div className="text-xs text-gray-500">{item.frecuencia}</div>
                            </td>
                            <td className="p-4">
                              {item.fecha && item.fecha !== 'Por Comprar' && (
                                 <div className="font-medium text-gray-900">
                                    {format(parseISO(item.fecha), 'dd MMM yyyy', { locale: es })}
                                  </div>
                              )}
                              
                              <div className="text-xs text-gray-500">
                                {statusInfo.status === 'vencido' ? `${statusInfo.dias} días vencido` :
                                 statusInfo.status === 'pendiente' ? statusInfo.label :
                                 `${statusInfo.dias} días restantes`}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.textColor} ${statusInfo.borderColor} border`}>
                                <IconComponent className="w-3 h-3" />
                                {statusInfo.label}
                              </div>
                            </td>
                            <td className="p-4">
                              {/* *** CORRECCIÓN: Se usa "textColor" de estadoProcesoInfo *** */}
                              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${estadoProcesoInfo.bgColor} ${estadoProcesoInfo.textColor} ${estadoProcesoInfo.borderColor} border`}>
                                <EstadoProcesoIcon className="w-3 h-3" />
                                {estadoProcesoInfo.label}
                              </div>
                              {item.fechaInicioProceso && item.estadoProceso === 'en_proceso' && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Desde: {format(parseISO(item.fechaInicioProceso), 'dd/MM', { locale: es })}
                                </div>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getPrioridadColor(item.prioridad)}`}>
                                {item.prioridad}
                              </span>
                            </td>
                            <td className="p-4">
                              {/* *** MODIFICACIÓN: Mostrar/Ocultar acciones por permiso *** */}
                              <div className="flex items-center gap-2">
                                
                                {/* El dropdown de Acciones (Wrench) SÓLO para admins */}
                                {canEdit && (
                                  <div className="relative inline-block text-left">
                                      <button
                                        className="group inline-flex justify-center text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 p-2 rounded-lg"
                                        onClick={(e) => {
                                            const menu = e.currentTarget.nextElementSibling;
                                            if (menu) menu.classList.toggle('hidden');
                                        }}
                                        onBlur={(e) => {
                                            if (!e.currentTarget.parentNode?.contains(e.relatedTarget as Node)) {
                                                e.currentTarget.nextElementSibling?.classList.add('hidden');
                                            }
                                        }}
                                      >
                                        <Wrench className="w-4 h-4" />
                                        <ChevronDown className="-mr-1 ml-1 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-gray-500" aria-hidden="true" />
                                      </button>
                                      <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none hidden" role="menu">
                                          <div className="py-1">
                                          {accionesDisponibles.map((accion) => {
                                              const AccionIcon = accion.icon;
                                              return (
                                                  <button
                                                      key={accion.id}
                                                      onClick={(e) => {
                                                          abrirModalAccion(item, accion.id);
                                                          (e.currentTarget.closest('[role=menu]') as HTMLElement).classList.add('hidden');
                                                      }}
                                                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                  >
                                                      <AccionIcon className="w-4 h-4 inline mr-2" />
                                                      {accion.label}
                                                  </button>
                                              );
                                          })}
                                          </div>
                                      </div>
                                  </div>
                                )}
                                
                                {/* El botón de Historial es visible para TODOS */}
                                <button
                                  onClick={() => abrirHistorial(item)}
                                  className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg text-xs transition-all duration-200 hover:shadow-md"
                                  title="Ver Historial"
                                >
                                  <History className="w-3 h-3" />
                                </button>

                                {/* Botón de Eliminar SÓLO para admins */}
                                {canEdit && (
                                  <button 
                                    onClick={() => item.id && handleEliminar(item.id)}
                                    className="p-2 text-red-500 hover:text-red-700" 
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                
                              </div>
                              {/* *** FIN DE MODIFICACIÓN *** */}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 🚫 Bloque para mostrar la lista de patrones (REMOVIDO) */}
          </>
        )}
      </div>

      {/* Modal de Acciones Genérico */}
      <AnimatePresence>
        {accionModalOpen && equipoSeleccionado && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-md"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Gestionar Proceso - {equipoSeleccionado.noControl}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{equipoSeleccionado.descripcion}</p>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Acción: {getAccionesDisponibles(equipoSeleccionado).find(a => a.id === accionSeleccionada)?.label || accionSeleccionada}
                  </label>
                </div>

                {accionSeleccionada === 'completar' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nueva Fecha de Vencimiento
                    </label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={nuevaFechaVencimiento}
                      onChange={(e) => setNuevaFechaVencimiento(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Fecha sugerida según frecuencia: {calcularNuevaFechaVencimiento(equipoSeleccionado.frecuencia, hoy)}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observaciones
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                    placeholder="Ingrese observaciones sobre la acción realizada..."
                    value={observacionesAccion}
                    onChange={(e) => setObservacionesAccion(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => {
                    setAccionModalOpen(false);
                    setAccionSeleccionada('');
                    setObservacionesAccion('');
                    setNuevaFechaVencimiento('');
                    setEquipoSeleccionado(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={ejecutarAccion}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  disabled={loading}
                >
                  Confirmar Acción
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Modal de Edición */}
      <AnimatePresence>
        {editModalOpen && equipoEditando && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setEditModalOpen(false); setEquipoEditando(null); }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">
                  Editar Patrón - {equipoEditando.noControl}
                </h3>
                <p className="text-sm text-gray-500 mt-1">Modifique la información del patrón</p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">No. Control</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      value={equipoEditando.noControl}
                      disabled
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, noControl: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.descripcion}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, descripcion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Serie</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.serie}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, serie: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Marca</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.marca}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, marca: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.modelo}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, modelo: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frecuencia</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.frecuencia}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, frecuencia: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Servicio</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.tipoServicio}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, tipoServicio: e.target.value })}
                    >
                      <option value="Calibración">Calibración</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Verificación">Verificación</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Vencimiento</label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.fecha}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, fecha: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.prioridad}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, prioridad: e.target.value as 'Alta' | 'Media' | 'Baja' })}
                    >
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ubicación</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.ubicacion}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, ubicacion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Responsable</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.responsable}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, responsable: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estado del Proceso</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.estadoProceso}
                      onChange={(e) => setEquipoEditando({ ...equipoEditando, estadoProceso: e.target.value as any })}
                    >
                      <option value="operativo">Operativo</option>
                      <option value="programado">Programado</option>
                      <option value="en_proceso">En Proceso</option>
                      <option value="completado">Completado</option>
                      <option value="fuera_servicio">Fuera de Servicio</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => {
                    setEditModalOpen(false);
                    setEquipoEditando(null);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarEdicion}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  disabled={loading}
                >
                  Guardar Cambios
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Calibración Externa */}
      <AnimatePresence>
        {calibracionModalOpen && equipoSeleccionado && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setCalibracionModalOpen(false); limpiarDatosEnvio(); setEquipoSeleccionado(null); }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Envío a Calibración Externa
                    </h3>
                    <p className="text-sm text-gray-500">
                      {equipoSeleccionado.noControl} - {equipoSeleccionado.descripcion}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 border-b pb-2">Información del Laboratorio</h4>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Laboratorio de Calibración *</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        placeholder="Nombre del laboratorio"
                        value={datosEnvio.laboratorio}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, laboratorio: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
                      <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                        placeholder="Dirección completa del laboratorio"
                        value={datosEnvio.direccion}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, direccion: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Contacto</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        placeholder="Nombre del contacto"
                        value={datosEnvio.contacto}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, contacto: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Teléfono"
                          value={datosEnvio.telefono}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, telefono: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Email"
                          value={datosEnvio.email}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, email: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 border-b pb-2">Información de Envío</h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Paquetería *</label>
                        <select
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          value={datosEnvio.paqueteria}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, paqueteria: e.target.value })}
                        >
                          <option value="">Seleccionar...</option>
                          <option value="DHL">DHL</option>
                          <option value="FedEx">FedEx</option>
                          <option value="UPS">UPS</option>
                          <option value="Estafeta">Estafeta</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Número de Guía *</label>
                        <input
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Número de guía"
                          value={datosEnvio.numeroPaqueteria}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, numeroPaqueteria: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Envío *</label>
                        <input
                          type="date"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          value={datosEnvio.fechaEnvio}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, fechaEnvio: e.target.value })}
                        />
                      </div>
                      <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Estimada de Regreso</label>
                        <input
                          type="date"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          value={datosEnvio.fechaEstimadaRegreso}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, fechaEstimadaRegreso: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Costo</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                          value={datosEnvio.costo}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, costo: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">No. de Orden</label>
                        <input
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Número de orden"
                          value={datosEnvio.numeroOrden}
                          onChange={(e) => setDatosEnvio({ ...datosEnvio, numeroOrden: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones</label>
                      <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                        placeholder="Observaciones adicionales sobre el envío..."
                        value={datosEnvio.observaciones}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, observaciones: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h5 className="font-medium text-blue-900 mb-2">Información del Equipo</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-blue-700 font-medium">Control:</span>
                      <p className="text-blue-800">{equipoSeleccionado.noControl}</p>
                    </div>
                    <div>
                      <span className="text-blue-700 font-medium">Serie:</span>
                      <p className="text-blue-800">{equipoSeleccionado.serie}</p>
                    </div>
                    <div>
                      <span className="text-blue-700 font-medium">Marca:</span>
                      <p className="text-blue-800">{equipoSeleccionado.marca}</p>
                    </div>
                    <div>
                      <span className="text-blue-700 font-medium">Modelo:</span>
                      <p className="text-blue-800">{equipoSeleccionado.modelo}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => {
                    setCalibracionModalOpen(false);
                    limpiarDatosEnvio();
                    setEquipoSeleccionado(null);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={procesarEnvioCalibracion}
                  disabled={loading || !datosEnvio.laboratorio || !datosEnvio.paqueteria || !datosEnvio.numeroPaqueteria || !datosEnvio.fechaEnvio}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Confirmar Envío
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Mantenimiento */}
      <AnimatePresence>
        {mantenimientoModalOpen && equipoSeleccionado && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setMantenimientoModalOpen(false); limpiarDatosEnvio(); setEquipoSeleccionado(null); }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Wrench className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Iniciar Mantenimiento
                    </h3>
                    <p className="text-sm text-gray-500">
                      {equipoSeleccionado.noControl} - {equipoSeleccionado.descripcion}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Mantenimiento</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500"
                        value={datosEnvio.laboratorio}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, laboratorio: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Preventivo">Preventivo</option>
                        <option value="Correctivo">Correctivo</option>
                        <option value="Predictivo">Predictivo</option>
                        <option value="Emergencia">Emergencia</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Técnico Responsable</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500"
                        placeholder="Nombre del técnico"
                        value={datosEnvio.contacto}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, contacto: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Programada</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500"
                        value={datosEnvio.fechaEnvio}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, fechaEnvio: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duración Estimada (hrs)</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500"
                        placeholder="Horas"
                        value={datosEnvio.costo}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, costo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500"
                        value={datosEnvio.paqueteria}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, paqueteria: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Baja">Baja</option>
                        <option value="Media">Media</option>
                        <option value="Alta">Alta</option>
                        <option value="Crítica">Crítica</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Actividades a Realizar</label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 h-24 resize-none"
                      placeholder="Describa las actividades de mantenimiento a realizar..."
                      value={datosEnvio.observaciones}
                      onChange={(e) => setDatosEnvio({ ...datosEnvio, observaciones: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Herramientas/Materiales Requeridos</label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 h-20 resize-none"
                      placeholder="Liste las herramientas y materiales necesarios..."
                      value={datosEnvio.direccion}
                      onChange={(e) => setDatosEnvio({ ...datosEnvio, direccion: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h5 className="font-medium text-orange-900 mb-2">Información del Equipo</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-orange-700 font-medium">Control:</span>
                      <p className="text-orange-800">{equipoSeleccionado.noControl}</p>
                    </div>
                    <div>
                      <span className="text-orange-700 font-medium">Ubicación:</span>
                      <p className="text-orange-800">{equipoSeleccionado.ubicacion}</p>
                    </div>
                    <div>
                      <span className="text-orange-700 font-medium">Estado:</span>
                      <p className="text-orange-800">{getEstadoProcesoInfo(equipoSeleccionado.estadoProceso).label}</p>
                    </div>
                    <div>
                      <span className="text-orange-700 font-medium">Responsable:</span>
                      <p className="text-orange-800">{equipoSeleccionado.responsable}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => {
                    setMantenimientoModalOpen(false);
                    limpiarDatosEnvio();
                    setEquipoSeleccionado(null);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={procesarMantenimiento}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
                  disabled={loading}
                >
                  Iniciar Mantenimiento
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Verificación */}
      <AnimatePresence>
        {verificacionModalOpen && equipoSeleccionado && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setVerificacionModalOpen(false); limpiarDatosEnvio(); setEquipoSeleccionado(null); }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Eye className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Iniciar Verificación
                    </h3>
                    <p className="text-sm text-gray-500">
                      {equipoSeleccionado.noControl} - {equipoSeleccionado.descripcion}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Verificación</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        value={datosEnvio.laboratorio}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, laboratorio: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Interna">Verificación Interna</option>
                        <option value="Externa">Verificación Externa</option>
                        <option value="Intermedia">Verificación Intermedia</option>
                        <option value="Post-Calibración">Post-Calibración</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Inspector Responsable</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        placeholder="Nombre del inspector"
                        value={datosEnvio.contacto}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, contacto: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Verificación</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        value={datosEnvio.fechaEnvio}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, fechaEnvio: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duración Estimada (min)</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        placeholder="Minutos"
                        value={datosEnvio.costo}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, costo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Método de Verificación</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        value={datosEnvio.paqueteria}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, paqueteria: e.target.value })}
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Visual">Inspección Visual</option>
                        <option value="Funcional">Prueba Funcional</option>
                        <option value="Dimensional">Verificación Dimensional</option>
                        <option value="Completa">Verificación Completa</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Criterios de Verificación</label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 h-24 resize-none"
                      placeholder="Describa los criterios y parámetros a verificar..."
                      value={datosEnvio.observaciones}
                      onChange={(e) => setDatosEnvio({ ...datosEnvio, observaciones: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Equipos de Referencia</label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 h-20 resize-none"
                      placeholder="Liste los equipos de referencia o patrones a utilizar..."
                      value={datosEnvio.direccion}
                      onChange={(e) => setDatosEnvio({ ...datosEnvio, direccion: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Condiciones Ambientales</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        placeholder="Temperatura (°C)"
                        value={datosEnvio.telefono}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, telefono: e.target.value })}
                      />
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        placeholder="Humedad (%)"
                        value={datosEnvio.email}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, email: e.target.value })}
                      />
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                        placeholder="Presión (hPa)"
                        value={datosEnvio.numeroOrden}
                        onChange={(e) => setDatosEnvio({ ...datosEnvio, numeroOrden: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                  <h5 className="font-medium text-green-900 mb-2">Información del Equipo</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-green-700 font-medium">Control:</span>
                      <p className="text-green-800">{equipoSeleccionado.noControl}</p>
                    </div>
                    <div>
                      <span className="text-green-700 font-medium">Última Calibración:</span>
                      <p className="text-green-800">{format(parseISO(equipoSeleccionado.fecha), 'dd/MM/yyyy', { locale: es })}</p>
                    </div>
                    <div>
                      <span className="text-green-700 font-medium">Frecuencia:</span>
                      <p className="text-green-800">{equipoSeleccionado.frecuencia}</p>
                    </div>
                    <div>
                      <span className="text-green-700 font-medium">Estado:</span>
                      <p className="text-green-800">{getStatusInfo(equipoSeleccionado.fecha).label}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => {
                    setVerificacionModalOpen(false);
                    limpiarDatosEnvio();
                    setEquipoSeleccionado(null);
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={procesarVerificacion}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  disabled={loading}
                >
                  Iniciar Verificación
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Historial */}
      <AnimatePresence>
        {historialModalOpen && equipoSeleccionado && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setHistorialModalOpen(false); setEquipoSeleccionado(null); }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Historial - {equipoSeleccionado.noControl}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{equipoSeleccionado.descripcion}</p>
              </div>

              <div className="p-6 overflow-y-auto max-h-96">
                {equipoSeleccionado.historial.length > 0 ? (
                  <div className="space-y-4">
                    {equipoSeleccionado.historial.map((entrada, index) => (
                      <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-gray-900">{entrada.accion}</h4>
                            <p className="text-sm text-gray-600">Por: {entrada.usuario}</p>
                            {entrada.observaciones && (
                              <p className="text-sm text-gray-500 mt-1">{entrada.observaciones}</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {format(parseISO(entrada.fecha), 'dd MMM yyyy', { locale: es })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p>No hay historial disponible</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end bg-gray-50">
                <button
                  onClick={() => {
                    setHistorialModalOpen(false);
                    setEquipoSeleccionado(null);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Nuevo Patrón */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900">Nuevo Patrón de Medición</h3>
                <p className="text-sm text-gray-500 mt-1">Complete la información del patrón</p>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">No. Control *</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="AG-XXX"
                      value={nuevoRegistro.noControl}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, noControl: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Descripción *</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Descripción del equipo"
                      value={nuevoRegistro.descripcion}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, descripcion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Serie</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Número de serie"
                      value={nuevoRegistro.serie}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, serie: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Marca</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Marca del equipo"
                      value={nuevoRegistro.marca}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, marca: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Modelo del equipo"
                      value={nuevoRegistro.modelo}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, modelo: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frecuencia</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="12 Meses ± 5 Días"
                      value={nuevoRegistro.frecuencia}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, frecuencia: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Servicio</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={nuevoRegistro.tipoServicio}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, tipoServicio: e.target.value })}
                    >
                      <option value="Calibración">Calibración</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Verificación">Verificación</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Vencimiento *</label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={nuevoRegistro.fecha}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, fecha: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
                    {/* *** CORRECCIÓN: </p> -> </option> *** */}
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={nuevoRegistro.prioridad}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, prioridad: e.target.value as 'Alta' | 'Media' | 'Baja' })}
                    >
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ubicación</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Lab A"
                      value={nuevoRegistro.ubicacion}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, ubicacion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Responsable</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      placeholder="Nombre del responsable"
                      value={nuevoRegistro.responsable}
                      onChange={(e) => setNuevoRegistro({ ...nuevoRegistro, responsable: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  disabled={loading}
                >
                  Guardar Patrón
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};