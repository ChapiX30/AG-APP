
import React, { useState, useMemo } from 'react';
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
  Filter,
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
  ArrowLeft // Importa el icono de flecha izquierda
} from 'lucide-react';
// Importa tu hook personalizado de navegación
import { useNavigation } from '../hooks/useNavigation'; // Ajusta la ruta según tu estructura

interface HistorialEntry {
  fecha: string;
  accion: string;
  usuario: string;
  observaciones?: string;
}

interface RegistroPatron {
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

const mockData: RegistroPatron[] = [
  {
    noControl: 'AG-001',
    descripcion: 'Bloques Patrón 33 piezas',
    serie: '980495',
    marca: 'MITUTOYO',
    modelo: 'S/M',
    frecuencia: '12 Meses ± 5 Días',
    tipoServicio: 'Calibración',
    fecha: '2025-10-18',
    prioridad: 'Alta',
    ubicacion: 'Lab A',
    responsable: 'Juan Pérez',
    historial: [
      { fecha: '2024-10-18', accion: 'Calibración completada', usuario: 'Juan Pérez' }
    ],
    estadoProceso: 'operativo',
  },
  {
    noControl: 'AG-002',
    descripcion: 'Multímetro Fluke 87',
    serie: 'FLK12345',
    marca: 'FLUKE',
    modelo: '87V',
    frecuencia: '6 Meses ± 5 Días',
    tipoServicio: 'Mantenimiento',
    fecha: '2025-07-25',
    prioridad: 'Media',
    ubicacion: 'Lab B',
    responsable: 'María García',
    estadoProceso: 'en_proceso',
    fechaInicioProceso: '2025-07-20',
    observaciones: 'En proceso de mantenimiento preventivo',
    historial: [
      { fecha: '2025-07-20', accion: 'Iniciado mantenimiento', usuario: 'María García' },
      { fecha: '2025-01-25', accion: 'Último mantenimiento completado', usuario: 'Carlos López' }
    ]
  },
  {
    noControl: 'AG-003',
    descripcion: 'Balanza Analítica',
    serie: 'BAL-789',
    marca: 'SARTORIUS',
    modelo: 'MSA225S',
    frecuencia: '3 Meses ± 2 Días',
    tipoServicio: 'Calibración',
    fecha: '2025-07-20',
    prioridad: 'Alta',
    ubicacion: 'Lab C',
    responsable: 'Carlos López',
    estadoProceso: 'operativo',
    historial: [
      { fecha: '2025-04-20', accion: 'Calibración completada', usuario: 'Carlos López' }
    ]
  },
  {
    noControl: 'AG-004',
    descripcion: 'Termómetro Digital',
    serie: 'TEMP456',
    marca: 'FLUKE',
    modelo: '1523',
    frecuencia: '12 Meses ± 5 Días',
    tipoServicio: 'Verificación',
    fecha: '2025-12-15',
    prioridad: 'Baja',
    ubicacion: 'Lab A',
    responsable: 'Ana Rodríguez',
    estadoProceso: 'operativo',
    historial: [
      { fecha: '2024-12-15', accion: 'Verificación completada', usuario: 'Ana Rodríguez' }
    ]
  }
];

export const ProgramaCalibracionScreen: React.FC = () => {
  const [fechaFiltro, setFechaFiltro] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroServicio, setFiltroServicio] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');
  const [data, setData] = useState<RegistroPatron[]>(() => {
    const saved = localStorage.getItem('patrones_calibracion');
    return saved ? JSON.parse(saved) : mockData;
  });

  // Cada vez que se modifique 'data', guárdalo en localStorage
  React.useEffect(() => {
    localStorage.setItem('patrones_calibracion', JSON.stringify(data));
  }, [data]);

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

  // Estados para formularios específicos
  const [datosEnvio, setDatosEnvio] = useState({
    laboratorio: '',
    direccion: '',
    contacto: '',
    telefono: '',
    email: '',
    paqueteria: '',
    fechaEnvio: '',
    fechaEstimadaRegreso: '',
    costo: '',
    numeroOrden: '',
    observaciones: '',
    numeroPaqueteria: '', // Agregado para el número de guía
  });

  const [nuevoRegistro, setNuevoRegistro] = useState<RegistroPatron>({
    noControl: '', descripcion: '', serie: '', marca: '', modelo: '',
    frecuencia: '', tipoServicio: '', fecha: '', prioridad: 'Media',
    ubicacion: '', responsable: '', estadoProceso: 'operativo', historial: []
  });

  const hoy = new Date();

  // Hook de navegación personalizado
  const { navigateTo } = useNavigation();

  // Función para regresar al menú principal
  const handleGoBack = () => {
    navigateTo('menu'); // Navega al menú principal
  };

  const getStatusInfo = (fecha: string) => {
    const dias = differenceInDays(parseISO(fecha), hoy);
    if (dias < 0) {
      return {
        status: 'vencido',
        color: 'bg-red-500',
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
        label: 'Vencido',
        icon: AlertTriangle,
        dias: Math.abs(dias)
      };
    }
    if (dias >= 0 && dias <= 7) {
      return {
        status: 'critico',
        color: 'bg-orange-500',
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-200',
        label: 'Crítico',
        icon: AlertCircle,
        dias
      };
    }
    if (dias > 7 && dias <= 30) {
      return {
        status: 'proximo',
        color: 'bg-yellow-500',
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-700',
        borderColor: 'border-yellow-200',
        label: 'Próximo',
        icon: Clock,
        dias
      };
    }
    return {
      status: 'vigente',
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      label: 'Vigente',
      icon: CheckCircle,
      dias
    };
  };

  const getEstadoProcesoInfo = (estadoProceso: string) => {
    switch(estadoProceso) {
      case 'operativo':
        return {
          label: 'Operativo',
          color: 'bg-blue-500',
          bgColor: 'bg-blue-50',
          textColor: 'text-blue-700',
          borderColor: 'border-blue-200',
          icon: Target
        };
      case 'programado':
        return {
          label: 'Programado',
          color: 'bg-purple-500',
          bgColor: 'bg-purple-50',
          textColor: 'text-purple-700',
          borderColor: 'border-purple-200',
          icon: Calendar
        };
      case 'en_proceso':
        return {
          label: 'En Proceso',
          color: 'bg-orange-500',
          bgColor: 'bg-orange-50',
          textColor: 'text-orange-700',
          borderColor: 'border-orange-200',
          icon: Wrench
        };
      case 'completado':
        return {
          label: 'Completado',
          color: 'bg-green-500',
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          icon: CheckCircle2
        };
      case 'fuera_servicio':
        return {
          label: 'Fuera de Servicio',
          color: 'bg-red-500',
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          icon: XCircle
        };
      default:
        return {
          label: 'Desconocido',
          color: 'bg-gray-500',
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
          icon: AlertCircle
        };
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

  const getAccionesDisponibles = (item: RegistroPatron) => {
    const statusInfo = getStatusInfo(item.fecha);
    const acciones = [];

    switch(item.estadoProceso) {
      case 'operativo':
        if (statusInfo.status === 'vencido' || statusInfo.status === 'critico') {
          acciones.push({
            id: 'programar',
            label: 'Programar Servicio',
            icon: Calendar,
            color: 'bg-purple-600 hover:bg-purple-700'
          });
        }
        acciones.push({
          id: 'iniciar_proceso',
          label: 'Iniciar Proceso',
          icon: Play,
          color: 'bg-orange-600 hover:bg-orange-700'
        });
        // Acciones específicas por tipo de servicio
        if (item.tipoServicio === 'Calibración') {
          acciones.push({
            id: 'calibracion_externa',
            label: 'Calibración Externa',
            icon: Calendar,
            color: 'bg-blue-600 hover:bg-blue-700'
          });
        } else if (item.tipoServicio === 'Mantenimiento') {
          acciones.push({
            id: 'mantenimiento',
            label: 'Mantenimiento',
            icon: Wrench,
            color: 'bg-orange-600 hover:bg-orange-700'
          });
        } else if (item.tipoServicio === 'Verificación') {
          acciones.push({
            id: 'verificacion',
            label: 'Verificación',
            icon: Eye,
            color: 'bg-green-600 hover:bg-green-700'
          });
        }
        break;
      case 'programado':
        acciones.push({
          id: 'iniciar_proceso',
          label: 'Iniciar Proceso',
          icon: Play,
          color: 'bg-orange-600 hover:bg-orange-700'
        });
        acciones.push({
          id: 'cancelar',
          label: 'Cancelar',
          icon: XCircle,
          color: 'bg-gray-600 hover:bg-gray-700'
        });
        break;
      case 'en_proceso':
        acciones.push({
          id: 'completar',
          label: 'Completar',
          icon: CheckCircle2,
          color: 'bg-green-600 hover:bg-green-700'
        });
        acciones.push({
          id: 'pausar',
          label: 'Pausar',
          icon: Pause,
          color: 'bg-yellow-600 hover:bg-yellow-700'
        });
        break;
      case 'completado':
        acciones.push({
          id: 'reactivar',
          label: 'Reactivar',
          icon: RotateCcw,
          color: 'bg-blue-600 hover:bg-blue-700'
        });
        break;
    }
    acciones.push({
      id: 'editar',
      label: 'Editar',
      icon: Edit,
      color: 'bg-gray-400 hover:bg-gray-500'
    });

    return acciones;
  };

  const calcularNuevaFechaVencimiento = (frecuencia: string, fechaBase: Date = new Date()) => {
    const mesesMatch = frecuencia.match(/(\d+)\s*Meses?/i);
    if (mesesMatch) {
      const meses = parseInt(mesesMatch[1]);
      return format(addMonths(fechaBase, meses), 'yyyy-MM-dd');
    }
    return format(addMonths(fechaBase, 12), 'yyyy-MM-dd');
  };

  const ejecutarAccion = () => {
    if (!equipoSeleccionado || !accionSeleccionada) return;

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: '',
      usuario: equipoSeleccionado.responsable,
      observaciones: observacionesAccion
    };

    switch(accionSeleccionada) {
      case 'programar':
        equipoActualizado.estadoProceso = 'programado';
        nuevaEntradaHistorial.accion = `${equipoSeleccionado.tipoServicio} programado`;
        break;
      case 'iniciar_proceso':
        equipoActualizado.estadoProceso = 'en_proceso';
        equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
        nuevaEntradaHistorial.accion = `${equipoSeleccionado.tipoServicio} iniciado`;
        break;
      case 'completar':
        equipoActualizado.estadoProceso = 'operativo';
        equipoActualizado.fechaInicioProceso = undefined;
        if (nuevaFechaVencimiento) {
          equipoActualizado.fecha = nuevaFechaVencimiento;
        } else {
          equipoActualizado.fecha = calcularNuevaFechaVencimiento(equipoSeleccionado.frecuencia);
        }
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
        nuevaEntradaHistorial.accion = 'Equipo reactivado';
        break;
    }

    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];
    equipoActualizado.observaciones = observacionesAccion || equipoActualizado.observaciones;

    setData(data.map(item =>
      item.noControl === equipoSeleccionado.noControl ? equipoActualizado : item
    ));

    setAccionModalOpen(false);
    setAccionSeleccionada('');
    setObservacionesAccion('');
    setNuevaFechaVencimiento('');
    setEquipoSeleccionado(null);
  };

  const abrirModalAccion = (equipo: RegistroPatron, accion: string) => {
    setEquipoSeleccionado(equipo);
    setAccionSeleccionada(accion);

    if (accion === 'completar') {
      setNuevaFechaVencimiento(calcularNuevaFechaVencimiento(equipo.frecuencia));
      setAccionModalOpen(true);
    } else if (accion === 'editar') {
      setEquipoEditando(equipo);
      setEditModalOpen(true);
    } else if (accion === 'calibracion_externa') {
      setCalibracionModalOpen(true);
    } else if (accion === 'mantenimiento') {
      setMantenimientoModalOpen(true);
    } else if (accion === 'verificacion') {
      setVerificacionModalOpen(true);
    } else {
      setAccionModalOpen(true);
    }
  };

  const abrirHistorial = (equipo: RegistroPatron) => {
    setEquipoSeleccionado(equipo);
    setHistorialModalOpen(true);
  };

  const dataFiltrada = useMemo(() => {
    return data.filter(item => {
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
  }, [data, fechaFiltro, filtroEstado, filtroServicio, busqueda]);

  const estadisticas = useMemo(() => {
    const total = data.length;
    const vencidos = data.filter(item => getStatusInfo(item.fecha).status === 'vencido').length;
    const criticos = data.filter(item => getStatusInfo(item.fecha).status === 'critico').length;
    const proximos = data.filter(item => getStatusInfo(item.fecha).status === 'proximo').length;
    const vigentes = data.filter(item => getStatusInfo(item.fecha).status === 'vigente').length;

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

  const handleGuardar = () => {
    if (!nuevoRegistro.noControl || !nuevoRegistro.descripcion || !nuevoRegistro.fecha) {
      alert('Por favor complete los campos obligatorios');
      return;
    }
    setData([...data, nuevoRegistro]);
    setModalOpen(false);
    setNuevoRegistro({
      noControl: '', descripcion: '', serie: '', marca: '', modelo: '',
      frecuencia: '', tipoServicio: '', fecha: '', prioridad: 'Media',
      ubicacion: '', responsable: '', estadoProceso: 'operativo', historial: []
    });
  };

  const guardarEdicion = () => {
    if (equipoEditando) {
      setData(data.map(item =>
        item.noControl === equipoEditando.noControl ? equipoEditando : item
      ));
      setEditModalOpen(false);
      setEquipoEditando(null);
    }
  };

  const limpiarDatosEnvio = () => {
    setDatosEnvio({
      laboratorio: '',
      direccion: '',
      contacto: '',
      telefono: '',
      email: '',
      paqueteria: '',
      fechaEnvio: '',
      fechaEstimadaRegreso: '',
      costo: '',
      numeroOrden: '',
      observaciones: '',
      numeroPaqueteria: '',
    });
  };

  const procesarEnvioCalibracion = () => {
    if (!equipoSeleccionado) return;

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: `Envío a Calibración Externa - Lab: ${datosEnvio.laboratorio}, Guía: ${datosEnvio.numeroPaqueteria}`,
      usuario: equipoSeleccionado.responsable,
      observaciones: datosEnvio.observaciones
    };

    equipoActualizado.estadoProceso = 'en_proceso'; // O un estado específico para "en calibración externa"
    equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];

    setData(data.map(item =>
      item.noControl === equipoSeleccionado.noControl ? equipoActualizado : item
    ));

    setCalibracionModalOpen(false);
    limpiarDatosEnvio();
    setEquipoSeleccionado(null);
  };

  const procesarMantenimiento = () => {
    if (!equipoSeleccionado) return;

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: `Mantenimiento iniciado - Tipo: ${datosEnvio.laboratorio}, Técnico: ${datosEnvio.contacto}`,
      usuario: equipoSeleccionado.responsable,
      observaciones: datosEnvio.observaciones
    };

    equipoActualizado.estadoProceso = 'en_proceso';
    equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];

    setData(data.map(item =>
      item.noControl === equipoSeleccionado.noControl ? equipoActualizado : item
    ));

    setMantenimientoModalOpen(false);
    limpiarDatosEnvio();
    setEquipoSeleccionado(null);
  };

  const procesarVerificacion = () => {
    if (!equipoSeleccionado) return;

    const equipoActualizado = { ...equipoSeleccionado };
    const nuevaEntradaHistorial: HistorialEntry = {
      fecha: format(new Date(), 'yyyy-MM-dd'),
      accion: `Verificación iniciada - Tipo: ${datosEnvio.laboratorio}, Inspector: ${datosEnvio.contacto}`,
      usuario: equipoSeleccionado.responsable,
      observaciones: datosEnvio.observaciones
    };

    equipoActualizado.estadoProceso = 'en_proceso';
    equipoActualizado.fechaInicioProceso = format(new Date(), 'yyyy-MM-dd');
    equipoActualizado.historial = [nuevaEntradaHistorial, ...equipoActualizado.historial];

    setData(data.map(item =>
      item.noControl === equipoSeleccionado.noControl ? equipoActualizado : item
    ));

    setVerificacionModalOpen(false);
    limpiarDatosEnvio();
    setEquipoSeleccionado(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Botón de regreso */}
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
              </select>

              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={filtroServicio}
                onChange={(e) => setFiltroServicio(e.target.value)}
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
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                Nuevo Patrón
              </button>
              <button
                onClick={handleExportar}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
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
                  <th className="text-left p-4 font-semibold text-gray-700">Control</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Descripción</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Marca/Modelo</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Servicio</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Fecha Vencimiento</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Estado Calibración</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Estado Proceso</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Prioridad</th>
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
                        key={item.noControl}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className={`border-b border-gray-100 hover:${statusInfo.bgColor} transition-colors group`}
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
                          <div className="font-medium text-gray-900">
                            {format(parseISO(item.fecha), 'dd MMM yyyy', { locale: es })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {statusInfo.dias === 0 ? 'Hoy' :
                             statusInfo.status === 'vencido' ? `${statusInfo.dias} días vencido` :
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
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${estadoProcesoInfo.bgColor} ${estadoProcesoInfo.textColor} ${estadoProcesoInfo.borderColor} border`}>
                            <EstadoProcesoIcon className="w-3 h-3" />
                            {estadoProcesoInfo.label}
                          </div>
                          {item.fechaInicioProceso && (
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
                          <div className="flex items-center gap-2">
                            {accionesDisponibles.map((accion) => {
                              const AccionIcon = accion.icon;
                              return (
                                <button
                                  key={accion.id}
                                  onClick={() => abrirModalAccion(item, accion.id)}
                                  className={`${accion.color} text-white p-2 rounded-lg text-xs transition-all duration-200 hover:shadow-md`}
                                  title={accion.label}
                                >
                                  <AccionIcon className="w-3 h-3" />
                                </button>
                              );
                            })}
                            <button
                              onClick={() => abrirHistorial(item)}
                              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg text-xs transition-all duration-200 hover:shadow-md"
                              title="Ver Historial"
                            >
                              <History className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Acciones */}
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
                    Acción: {getAccionesDisponibles(equipoSeleccionado).find(a => a.id === accionSeleccionada)?.label}
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
                      Fecha calculada automáticamente según frecuencia: {calcularNuevaFechaVencimiento(equipoSeleccionado.frecuencia)}
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

                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Estado Actual:</h4>
                  <div className="text-sm text-gray-600">
                    <p><span className="font-medium">Proceso:</span> {getEstadoProcesoInfo(equipoSeleccionado.estadoProceso).label}</p>
                    <p><span className="font-medium">Responsable:</span> {equipoSeleccionado.responsable}</p>
                    {equipoSeleccionado.fechaInicioProceso && (
                      <p><span className="font-medium">Iniciado:</span> {format(parseISO(equipoSeleccionado.fechaInicioProceso), 'dd/MM/yyyy', { locale: es })}</p>
                    )}
                  </div>
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
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                      value={equipoEditando.noControl}
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
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
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
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={procesarEnvioCalibracion}
                  disabled={!datosEnvio.laboratorio || !datosEnvio.paqueteria || !datosEnvio.numeroPaqueteria || !datosEnvio.fechaEnvio}
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
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
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
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={procesarMantenimiento}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
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
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
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
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={procesarVerificacion}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
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
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
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
          >
            <motion.div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
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
                      <option value="">Seleccionar...</option>
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

export default ProgramaCalibracionScreen;

