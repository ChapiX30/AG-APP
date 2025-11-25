import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, AlertTriangle, CheckCircle, Clock, Plus, Search,
  Activity, TrendingUp, AlertCircle, Wrench,
  Target, ArrowLeft, XCircle, Edit, History, 
  User, FileText, DollarSign, MapPin, CornerDownLeft // 🚨 Iconos nuevos
} from 'lucide-react';

import { useNavigation } from '../hooks/useNavigation';
import { patronesData } from './patronesData'; 
import { 
  collection, getDocs, addDoc, setDoc, doc, query 
} from 'firebase/firestore';
import { db } from '../utils/firebase'; 

// --- INTERFACES ---

export interface MantenimientoDetalle {
  tipo: 'Preventivo' | 'Correctivo' | 'Predictivo';
  costo: number;
  moneda: string;
  tecnico: string;
  refacciones: string;
  descripcionFalla?: string;
  accionesRealizadas: string;
  tiempoInvertidoHoras?: number;
}

export interface HistorialEntry {
  id: string; 
  fecha: string;
  accion: string; 
  usuario: string;
  tipoEvento: 'sistema' | 'calibracion' | 'mantenimiento' | 'verificacion' | 'administrativo' | 'prestamo';
  observaciones?: string;
  detallesMantenimiento?: MantenimientoDetalle; 
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
  fecha: string; // Fecha de vencimiento
  prioridad: 'Alta' | 'Media' | 'Baja';
  ubicacion: string;
  responsable: string;
  estadoProceso: 'operativo' | 'programado' | 'en_proceso' | 'completado' | 'fuera_servicio' | 'en_servicio' | 'en_mantenimiento';
  fechaInicioProceso?: string;
  observaciones?: string;
  usuarioEnUso?: string; // 🚨 IMPORTANTE
  fechaPrestamo?: string;
  historial: HistorialEntry[];
}

const mockCurrentUser = {
  nombre: "Viridiana Moreno",
  puesto: "calidad"
};

const COLLECTION_NAME = "patronesCalibracion";

// --- ESTILOS ---
const styles = `
  .timeline-line {
    position: absolute;
    left: 1.25rem;
    top: 2.5rem;
    bottom: 0;
    width: 2px;
    background-color: #e5e7eb;
  }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
`;

type SortableColumn = keyof RegistroPatron | 'statusVencimiento';

// --- FUNCIÓN SAFE DATE ---
const formatearFechaSafe = (fecha: string | undefined, formato: string = 'dd MMM yyyy') => {
  if (!fecha || fecha === 'Por Comprar' || fecha === '') return 'Pendiente';
  try {
    const fechaObj = parseISO(fecha);
    if (isNaN(fechaObj.getTime())) return 'Fecha Inválida';
    return format(fechaObj, formato, { locale: es });
  } catch (error) { return 'Error Fecha'; }
};

export const ProgramaCalibracionScreen: React.FC = () => {
  const [data, setData] = useState<RegistroPatron[]>([]);
  const [loading, setLoading] = useState(true); 
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  
  const [sortColumn, setSortColumn] = useState<SortableColumn>('statusVencimiento');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [modalNuevoOpen, setModalNuevoOpen] = useState(false);
  const [expedienteOpen, setExpedienteOpen] = useState(false); 
  const [mantenimientoModalOpen, setMantenimientoModalOpen] = useState(false); 
  
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<RegistroPatron | null>(null);
  
  const [nuevoMantenimiento, setNuevoMantenimiento] = useState<Partial<MantenimientoDetalle> & { fecha: string, observaciones: string }>({
    fecha: format(new Date(), 'yyyy-MM-dd'),
    tipo: 'Correctivo',
    costo: 0,
    moneda: 'MXN',
    tecnico: '',
    refacciones: '',
    accionesRealizadas: '',
    observaciones: ''
  });

  const [nuevoRegistro, setNuevoRegistro] = useState<RegistroPatron>({
    noControl: '', descripcion: '', serie: '', marca: '', modelo: '',
    frecuencia: '12 Meses ± 5 Días', tipoServicio: 'Calibración', fecha: '', prioridad: 'Media',
    ubicacion: 'Laboratorio', responsable: mockCurrentUser.nombre, estadoProceso: 'operativo', historial: []
  });

  const [currentUser] = useState(mockCurrentUser);
  const { navigateTo } = useNavigation();
  const hoy = new Date();

  const canEdit = useMemo(() => {
    return ['Viridiana Moreno', 'Jesús Sustaita'].includes(currentUser.nombre);
  }, [currentUser]);

  const fetchPatrones = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, COLLECTION_NAME));
      const querySnapshot = await getDocs(q);
      const fetchedData: RegistroPatron[] = [];
      querySnapshot.forEach((doc) => fetchedData.push({ id: doc.id, ...doc.data() } as RegistroPatron));
      
      if (fetchedData.length === 0) {
        setData(patronesData as RegistroPatron[]);
      } else {
        setData(fetchedData);
      }
    } catch (e) {
      console.error("Error fetching", e);
      setData(patronesData as RegistroPatron[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatrones(); }, [fetchPatrones]);

  const getStatusInfo = (fecha: string) => {
    if (!fecha || fecha === 'Por Comprar' || fecha === '') return { status: 'pendiente', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Pendiente', icon: Clock, dias: 0, sort: 4 };
    try {
        const fechaObj = parseISO(fecha);
        if (isNaN(fechaObj.getTime())) return { status: 'pendiente', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Error', icon: AlertTriangle, dias: 0, sort: 5 };
        const dias = differenceInDays(fechaObj, hoy);
        if (dias < 0) return { status: 'vencido', color: 'text-red-600', bg: 'bg-red-50', label: 'Vencido', icon: AlertTriangle, dias: Math.abs(dias), sort: 0 };
        if (dias <= 7) return { status: 'critico', color: 'text-orange-600', bg: 'bg-orange-50', label: 'Crítico', icon: AlertCircle, dias, sort: 1 };
        if (dias <= 30) return { status: 'proximo', color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Próximo', icon: Clock, dias, sort: 2 };
        return { status: 'vigente', color: 'text-green-600', bg: 'bg-green-50', label: 'Vigente', icon: CheckCircle, dias, sort: 3 };
    } catch (e) { return { status: 'pendiente', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Error', icon: AlertTriangle, dias: 0, sort: 5 }; }
  };

  const getProcessInfo = (estado: string) => {
    const map: Record<string, { label: string, color: string, bg: string, border: string }> = {
      'operativo': { label: 'Operativo', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
      'programado': { label: 'Programado', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
      'en_proceso': { label: 'En Calibración', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
      'completado': { label: 'Listo', color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200' },
      'fuera_servicio': { label: 'Baja / Dañado', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
      'en_servicio': { label: 'En Uso', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
      'en_mantenimiento': { label: 'En Mantenimiento', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
    };
    return map[estado] || map['operativo'];
  };

  // --- ACCIONES ---

  const handleGuardarNuevo = async () => {
    if (!nuevoRegistro.noControl || !nuevoRegistro.descripcion) return alert("Complete campos obligatorios");
    setLoading(true);
    try {
      const historialInit: HistorialEntry = {
        id: crypto.randomUUID(),
        fecha: format(new Date(), 'yyyy-MM-dd'),
        accion: 'Alta de Equipo',
        usuario: currentUser.nombre,
        tipoEvento: 'sistema',
        observaciones: 'Registro inicial en el sistema.'
      };
      await addDoc(collection(db, COLLECTION_NAME), { ...nuevoRegistro, historial: [historialInit] });
      await fetchPatrones();
      setModalNuevoOpen(false);
      setNuevoRegistro({ ...nuevoRegistro, noControl: '', descripcion: '' }); 
    } catch (e) { console.error(e); alert("Error al guardar"); }
    setLoading(false);
  };

  const handleRegistrarMantenimiento = async () => {
    if (!equipoSeleccionado || !equipoSeleccionado.id) return;
    setLoading(true);

    const detalle: MantenimientoDetalle = {
      tipo: nuevoMantenimiento.tipo as any,
      costo: Number(nuevoMantenimiento.costo),
      moneda: nuevoMantenimiento.moneda,
      tecnico: nuevoMantenimiento.tecnico || 'Interno',
      refacciones: nuevoMantenimiento.refacciones || 'N/A',
      accionesRealizadas: nuevoMantenimiento.accionesRealizadas || '',
      tiempoInvertidoHoras: 0
    };

    const nuevaEntrada: HistorialEntry = {
      id: crypto.randomUUID(),
      fecha: nuevoMantenimiento.fecha,
      accion: `Mantenimiento ${nuevoMantenimiento.tipo}`,
      usuario: currentUser.nombre,
      tipoEvento: 'mantenimiento',
      observaciones: nuevoMantenimiento.observaciones,
      detallesMantenimiento: detalle
    };

    const equipoActualizado = {
      ...equipoSeleccionado,
      estadoProceso: 'operativo' as any, // Asumimos que al registrar queda listo
      historial: [nuevaEntrada, ...equipoSeleccionado.historial]
    };

    try {
      const { id, ...dataToUpdate } = equipoActualizado;
      await setDoc(doc(db, COLLECTION_NAME, id), dataToUpdate, { merge: true });
      await fetchPatrones();
      setMantenimientoModalOpen(false);
      setExpedienteOpen(false); 
      setNuevoMantenimiento({ fecha: format(new Date(), 'yyyy-MM-dd'), tipo: 'Correctivo', costo: 0, moneda: 'MXN', tecnico: '', refacciones: '', accionesRealizadas: '', observaciones: '' });
    } catch (e) { console.error(e); alert("Error al registrar mantenimiento"); }
    setLoading(false);
  };

  const handleUpdateFromExpediente = async (patronActualizado: RegistroPatron) => {
    if (!patronActualizado.id) return;
    setLoading(true);
    try {
        const { id, ...rest } = patronActualizado;
        await setDoc(doc(db, COLLECTION_NAME, id), rest, { merge: true });
        await fetchPatrones();
        setExpedienteOpen(false);
    } catch (e) { console.error(e); alert("Error al actualizar"); }
    setLoading(false);
  };

  // 🚨 NUEVA FUNCIÓN: LIBERAR EQUIPO (Devolución)
  const handleLiberarEquipo = async (equipo: RegistroPatron) => {
    if (!equipo.id) return;
    if(!window.confirm(`¿Confirmas la devolución del equipo ${equipo.noControl}?`)) return;

    setLoading(true);
    try {
        const nuevaEntrada: HistorialEntry = {
            id: crypto.randomUUID(),
            fecha: format(new Date(), 'yyyy-MM-dd'),
            accion: 'Devolución de Equipo',
            usuario: currentUser.nombre,
            tipoEvento: 'prestamo',
            observaciones: `Equipo devuelto por ${equipo.usuarioEnUso || 'usuario'}.`
        };

        const equipoActualizado = {
            ...equipo,
            estadoProceso: 'operativo' as any,
            usuarioEnUso: '', // Limpiamos el usuario
            ubicacion: 'Laboratorio', // Regresa a su lugar base
            fechaPrestamo: '',
            historial: [nuevaEntrada, ...equipo.historial]
        };

        const { id, ...dataToUpdate } = equipoActualizado;
        await setDoc(doc(db, COLLECTION_NAME, id), dataToUpdate, { merge: true });
        await fetchPatrones();
        setExpedienteOpen(false);
    } catch(e) { console.error(e); alert("Error al liberar equipo"); }
    setLoading(false);
  };

  const dataFiltrada = useMemo(() => {
    return data.filter(item => {
      const status = getStatusInfo(item.fecha);
      const matchSearch = 
        item.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.noControl.toLowerCase().includes(busqueda.toLowerCase()) ||
        (item.usuarioEnUso && item.usuarioEnUso.toLowerCase().includes(busqueda.toLowerCase())) || // Buscar también por usuario asignado
        item.marca.toLowerCase().includes(busqueda.toLowerCase());
      const matchFecha = fechaFiltro ? item.fecha.startsWith(fechaFiltro) : true;
      const matchEstado = filtroEstado === 'todos' || status.status === filtroEstado;
      
      return matchSearch && matchFecha && matchEstado;
    }).sort((a, b) => {
        return sortDirection === 'asc' ? a.noControl.localeCompare(b.noControl) : b.noControl.localeCompare(a.noControl);
    });
  }, [data, busqueda, fechaFiltro, filtroEstado, sortDirection]);

  return (
    <>
      <style>{styles}</style>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
        
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-4">
                <button onClick={() => navigateTo('menu')} className="p-2 rounded-full hover:bg-gray-100 transition">
                  <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="bg-blue-600 p-2 rounded-lg text-white shadow-sm">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 leading-tight">Metrología y Mantenimiento</h1>
                    <p className="text-xs text-gray-500">Gestión integral de activos</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                 {canEdit && (
                  <button 
                    onClick={() => setModalNuevoOpen(true)}
                    className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Nuevo Equipo
                  </button>
                 )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <KPICard title="Total Activos" value={data.length} icon={Target} color="blue" />
                <KPICard title="Vencidos / Críticos" value={data.filter(d => ['vencido', 'critico'].includes(getStatusInfo(d.fecha).status)).length} icon={AlertTriangle} color="red" />
                <KPICard title="En Uso (Asignados)" value={data.filter(d => d.estadoProceso === 'en_servicio').length} icon={User} color="indigo" />
                <KPICard title="En Mantenimiento" value={data.filter(d => d.estadoProceso === 'en_mantenimiento').length} icon={Wrench} color="orange" />
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Buscar por control, usuario, descripción..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                    <select 
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value)}
                    >
                        <option value="todos">Todos los estados</option>
                        <option value="vencido">Vencidos</option>
                        <option value="vigente">Vigentes</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">Equipo / Control</th>
                                <th className="px-6 py-4">Marca / Modelo</th>
                                <th className="px-6 py-4">Estado Calibración</th>
                                <th className="px-6 py-4">Estado Operativo</th>
                                <th className="px-6 py-4">Ubicación / Asignado</th> {/* 🚨 Título actualizado */}
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-10 text-gray-500">Cargando activos...</td></tr>
                            ) : dataFiltrada.map((item) => {
                                const status = getStatusInfo(item.fecha);
                                const proceso = getProcessInfo(item.estadoProceso);
                                return (
                                    <tr key={item.id || item.noControl} className="hover:bg-gray-50 group transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-gray-900">{item.descripcion}</div>
                                            <div className="text-xs text-gray-500 font-mono bg-gray-100 inline-block px-1 rounded mt-1">{item.noControl}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            <div>{item.marca}</div>
                                            <div className="text-xs text-gray-400">{item.modelo}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.color} border-transparent`}>
                                                <status.icon className="w-3 h-3" />
                                                {status.label}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 ml-1">
                                                {formatearFechaSafe(item.fecha)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${proceso.bg} ${proceso.color} ${proceso.border}`}>
                                                <span className="relative flex h-2 w-2">
                                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${proceso.color.replace('text', 'bg')}`}></span>
                                                  <span className={`relative inline-flex rounded-full h-2 w-2 ${proceso.color.replace('text', 'bg')}`}></span>
                                                </span>
                                                {proceso.label}
                                            </div>
                                        </td>
                                        {/* 🚨 COLUMNA UBICACIÓN INTELIGENTE */}
                                        <td className="px-6 py-4">
                                            {item.estadoProceso === 'en_servicio' ? (
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 text-indigo-700 font-medium">
                                                        <User className="w-4 h-4" />
                                                        <span>{item.usuarioEnUso || 'Usuario Asignado'}</span>
                                                    </div>
                                                    <span className="text-xs text-indigo-400 pl-6">En uso activo</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <MapPin className="w-4 h-4 text-gray-400" />
                                                    <span>{item.ubicacion}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => { setEquipoSeleccionado(item); setExpedienteOpen(true); }}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-xs border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
                                            >
                                                Ver Expediente
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>

        {/* --- MODAL EXPEDIENTE --- */}
        <AnimatePresence>
            {expedienteOpen && equipoSeleccionado && (
                <ExpedienteModal 
                    equipo={equipoSeleccionado} 
                    onClose={() => setExpedienteOpen(false)}
                    canEdit={canEdit}
                    onUpdate={handleUpdateFromExpediente}
                    onOpenMaintenance={() => { setMantenimientoModalOpen(true); }} 
                    onLiberar={() => handleLiberarEquipo(equipoSeleccionado)} // 🚨 Pasar función de liberar
                />
            )}
        </AnimatePresence>

        {/* --- MODAL MANTENIMIENTO --- */}
        <AnimatePresence>
            {mantenimientoModalOpen && equipoSeleccionado && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
                    >
                        <div className="bg-amber-500 px-6 py-4 flex justify-between items-center text-white">
                            <div className="flex items-center gap-2">
                                <Wrench className="w-5 h-5" />
                                <h3 className="font-bold text-lg">Registrar Mantenimiento</h3>
                            </div>
                            <button onClick={() => setMantenimientoModalOpen(false)} className="hover:bg-white/20 p-1 rounded-full"><XCircle className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm text-amber-800 mb-4">
                                Registrando mantenimiento para: <strong>{equipoSeleccionado.noControl}</strong>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
                                        value={nuevoMantenimiento.tipo}
                                        onChange={e => setNuevoMantenimiento({...nuevoMantenimiento, tipo: e.target.value as any})}
                                    >
                                        <option>Correctivo</option>
                                        <option>Preventivo</option>
                                        <option>Predictivo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
                                    <input type="date" className="w-full border-gray-300 rounded-lg text-sm focus:ring-amber-500"
                                        value={nuevoMantenimiento.fecha} onChange={e => setNuevoMantenimiento({...nuevoMantenimiento, fecha: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Descripción de la Falla / Trabajo</label>
                                <textarea 
                                    className="w-full border-gray-300 rounded-lg text-sm focus:ring-amber-500 h-20"
                                    placeholder="¿Qué falló o qué se va a revisar?"
                                    value={nuevoMantenimiento.observaciones} onChange={e => setNuevoMantenimiento({...nuevoMantenimiento, observaciones: e.target.value})}
                                ></textarea>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Costo Total</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                        <input type="number" className="w-full pl-7 border-gray-300 rounded-lg text-sm focus:ring-amber-500"
                                            value={nuevoMantenimiento.costo} onChange={e => setNuevoMantenimiento({...nuevoMantenimiento, costo: Number(e.target.value)})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Técnico / Proveedor</label>
                                    <input type="text" className="w-full border-gray-300 rounded-lg text-sm focus:ring-amber-500"
                                        placeholder="Interno o Empresa X"
                                        value={nuevoMantenimiento.tecnico} onChange={e => setNuevoMantenimiento({...nuevoMantenimiento, tecnico: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                             <button onClick={() => setMantenimientoModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">Cancelar</button>
                             <button onClick={handleRegistrarMantenimiento} className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-md">
                                Registrar Mantenimiento
                             </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        {/* Modal Nuevo (Simple) */}
        {modalNuevoOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                 <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                    <h2 className="text-lg font-bold mb-4">Nuevo Activo</h2>
                    <label className="block text-xs font-medium text-gray-500 mb-1">No. Control</label>
                    <input className="w-full border border-gray-300 mb-2 p-2 rounded-lg" value={nuevoRegistro.noControl} onChange={e => setNuevoRegistro({...nuevoRegistro, noControl: e.target.value})} />
                    
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                    <input className="w-full border border-gray-300 mb-2 p-2 rounded-lg" value={nuevoRegistro.descripcion} onChange={e => setNuevoRegistro({...nuevoRegistro, descripcion: e.target.value})} />
                    
                    <label className="block text-xs font-medium text-gray-500 mb-1">Marca</label>
                    <input className="w-full border border-gray-300 mb-2 p-2 rounded-lg" value={nuevoRegistro.marca} onChange={e => setNuevoRegistro({...nuevoRegistro, marca: e.target.value})} />
                    
                    <label className="block text-xs font-medium text-gray-500 mb-1">Fecha Vencimiento (Calibración)</label>
                    <input type="date" className="w-full border border-gray-300 mb-4 p-2 rounded-lg" value={nuevoRegistro.fecha} onChange={e => setNuevoRegistro({...nuevoRegistro, fecha: e.target.value})} />

                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => setModalNuevoOpen(false)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                        <button onClick={handleGuardarNuevo} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar</button>
                    </div>
                 </div>
            </div>
        )}

      </div>
    </>
  );
};

// --- COMPONENTES AUXILIARES ---

const KPICard = ({ title, value, icon: Icon, color }: any) => {
    const colorClasses: any = {
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        red: 'bg-red-50 text-red-600 border-red-100',
        orange: 'bg-orange-50 text-orange-600 border-orange-100',
        green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    };
    return (
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
                <p className="text-sm text-gray-500 font-medium mb-1">{title}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
            <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>
                <Icon className="w-6 h-6" />
            </div>
        </div>
    );
};

const ExpedienteModal = ({ equipo, onClose, canEdit, onUpdate, onOpenMaintenance, onLiberar }: { equipo: RegistroPatron, onClose: () => void, canEdit: boolean, onUpdate: (data: RegistroPatron) => void, onOpenMaintenance: () => void, onLiberar: () => void }) => {
    const [activeTab, setActiveTab] = useState<'info' | 'history' | 'maintenance'>('info');
    const [editMode, setEditMode] = useState(false);
    const [localData, setLocalData] = useState(equipo);

    const mantenimientos = equipo.historial.filter(h => h.tipoEvento === 'mantenimiento');

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Expediente */}
                <div className="bg-white border-b border-gray-200 p-6 flex justify-between items-start">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                            <Target className="w-8 h-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold text-gray-900">{localData.noControl}</h2>
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${editMode ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                    {editMode ? 'Modo Edición' : 'Solo Lectura'}
                                </span>
                            </div>
                            <p className="text-gray-500">{localData.descripcion}</p>
                            
                            {/* 🚨 INDICADOR DE PRÉSTAMO EN HEADER */}
                            {localData.estadoProceso === 'en_servicio' && (
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 text-sm">
                                    <User className="w-4 h-4" />
                                    <span>En uso por: <strong>{localData.usuarioEnUso}</strong></span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {/* 🚨 BOTÓN DEVOLUCIÓN RÁPIDA */}
                        {canEdit && !editMode && localData.estadoProceso === 'en_servicio' && (
                            <button onClick={onLiberar} className="flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-sm font-medium transition">
                                <CornerDownLeft className="w-4 h-4" />
                                Devolver / Liberar
                            </button>
                        )}
                        {canEdit && !editMode && (
                            <button onClick={() => onOpenMaintenance()} className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-medium transition">
                                <Wrench className="w-4 h-4" />
                                Mantenimiento
                            </button>
                        )}
                        {canEdit && (
                            <button onClick={() => editMode ? onUpdate(localData) : setEditMode(true)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${editMode ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                                {editMode ? <><CheckCircle className="w-4 h-4" /> Guardar</> : <><Edit className="w-4 h-4" /> Editar Datos</>}
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><XCircle className="w-6 h-6 text-gray-400" /></button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 px-6">
                    <TabButton active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={FileText} label="Información General" />
                    <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={History} label="Línea de Tiempo" />
                    <TabButton active={activeTab === 'maintenance'} onClick={() => setActiveTab('maintenance')} icon={Wrench} label="Historial de Mantenimiento" count={mantenimientos.length} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {activeTab === 'info' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                           <Field label="Marca" value={localData.marca} editing={editMode} onChange={v => setLocalData({...localData, marca: v})} />
                           <Field label="Modelo" value={localData.modelo} editing={editMode} onChange={v => setLocalData({...localData, modelo: v})} />
                           <Field label="Serie" value={localData.serie} editing={editMode} onChange={v => setLocalData({...localData, serie: v})} />
                           <Field label="Ubicación Base" value={localData.ubicacion} editing={editMode} onChange={v => setLocalData({...localData, ubicacion: v})} />
                           <Field label="Responsable" value={localData.responsable} editing={editMode} onChange={v => setLocalData({...localData, responsable: v})} />
                           <Field label="Frecuencia" value={localData.frecuencia} editing={editMode} onChange={v => setLocalData({...localData, frecuencia: v})} />
                           <div className="col-span-full mt-4">
                                <h4 className="text-sm font-medium text-gray-900 mb-2">Observaciones Generales</h4>
                                {editMode ? (
                                    <textarea className="w-full border-gray-300 rounded-lg text-sm" rows={3} value={localData.observaciones || ''} onChange={e => setLocalData({...localData, observaciones: e.target.value})} />
                                ) : (
                                    <p className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">{localData.observaciones || 'Sin observaciones.'}</p>
                                )}
                           </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="relative pl-8 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-0 before:w-0.5 before:bg-gray-200">
                            {equipo.historial.map((h, i) => (
                                <div key={i} className="relative">
                                    <div className={`absolute -left-[29px] w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${h.tipoEvento === 'mantenimiento' ? 'bg-amber-500' : h.tipoEvento === 'prestamo' ? 'bg-indigo-500' : 'bg-blue-500'}`}>
                                        <div className="w-2 h-2 bg-white rounded-full" />
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-semibold text-gray-900">{h.accion}</span>
                                            <span className="text-xs text-gray-400">{formatearFechaSafe(h.fecha, 'dd MMM yyyy, HH:mm')}</span>
                                        </div>
                                        <p className="text-sm text-gray-600">{h.observaciones}</p>
                                        <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                                            <User className="w-3 h-3" /> {h.usuario}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'maintenance' && (
                        <div>
                             {mantenimientos.length === 0 ? (
                                 <div className="text-center py-12 text-gray-400">
                                     <Wrench className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                     <p>No hay registros de mantenimiento correctivo o preventivo.</p>
                                 </div>
                             ) : (
                                 <div className="space-y-4">
                                     {mantenimientos.map((m, i) => (
                                         <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition">
                                             <div className="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                                                 <div>
                                                     <div className="flex items-center gap-2">
                                                         <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${m.detallesMantenimiento?.tipo === 'Correctivo' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                             {m.detallesMantenimiento?.tipo || 'Mantenimiento'}
                                                         </span>
                                                         <span className="text-sm font-medium text-gray-900">{formatearFechaSafe(m.fecha, 'dd/MM/yyyy')}</span>
                                                     </div>
                                                 </div>
                                                 <div className="text-right">
                                                     <span className="text-sm font-bold text-gray-900">${m.detallesMantenimiento?.costo}</span>
                                                     <p className="text-xs text-gray-500">{m.detallesMantenimiento?.moneda}</p>
                                                 </div>
                                             </div>
                                             <div className="grid grid-cols-2 gap-4 text-sm">
                                                 <div>
                                                     <span className="text-gray-400 text-xs">Falla / Trabajo:</span>
                                                     <p className="text-gray-700">{m.observaciones}</p>
                                                 </div>
                                                 <div>
                                                     <span className="text-gray-400 text-xs">Refacciones:</span>
                                                     <p className="text-gray-700">{m.detallesMantenimiento?.refacciones}</p>
                                                 </div>
                                                  <div className="col-span-2">
                                                     <span className="text-gray-400 text-xs">Técnico:</span>
                                                     <span className="text-gray-700 ml-2">{m.detallesMantenimiento?.tecnico}</span>
                                                 </div>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label, count }: any) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
    >
        <Icon className="w-4 h-4" />
        {label}
        {count !== undefined && count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-xs">{count}</span>}
    </button>
);

const Field = ({ label, value, editing, onChange }: any) => (
    <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        {editing ? (
            <input className="w-full border-gray-300 rounded-md text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 p-2" value={value} onChange={e => onChange(e.target.value)} />
        ) : (
            <p className="text-sm font-medium text-gray-900">{value || '-'}</p>
        )}
    </div>
);