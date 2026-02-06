import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import es from 'date-fns/locale/es';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useNavigation } from '../hooks/useNavigation';
import { 
  ArrowLeft, Calendar as CalendarIcon, Clock, CheckCircle2, RotateCcw, 
  X, Info, MapPin, Users, Filter, ChevronLeft, ChevronRight, Search, 
  Building2, Phone, Mail, FileText, Play, Briefcase, Settings, Zap, Eye
} from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// --- 1. CONFIGURACIÓN Y CONSTANTES (Igual que en Servicios) ---

const locales = { 'es': es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

// Reutilizamos las constantes para mantener consistencia exacta
const CONSTANTS = {
  estados: [
    { value: 'programado', label: 'Programado', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', eventBg: '#eff6ff', eventBorder: '#3b82f6', icon: CalendarIcon },
    { value: 'en_proceso', label: 'En Proceso', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', eventBg: '#fffbeb', eventBorder: '#f59e0b', icon: Play },
    { value: 'reprogramacion', label: 'Reprogramado', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', eventBg: '#faf5ff', eventBorder: '#a855f7', icon: RotateCcw },
    { value: 'finalizado', label: 'Finalizado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', eventBg: '#ecfdf5', eventBorder: '#10b981', icon: CheckCircle2 }
  ],
  prioridades: [
    { value: 'baja', label: 'Baja', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
    { value: 'media', label: 'Media', color: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-400' },
    { value: 'alta', label: 'Alta', color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-400' },
    { value: 'critica', label: 'Crítica', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' }
  ],
  tipos: [
    { value: 'calibracion', label: 'Calibración', icon: Settings, color: 'text-indigo-600 bg-indigo-50' },
    { value: 'mantenimiento', label: 'Mantenimiento', icon: Briefcase, color: 'text-cyan-600 bg-cyan-50' },
    { value: 'verificacion', label: 'Verificación', icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
    { value: 'reparacion', label: 'Reparación', icon: Zap, color: 'text-rose-600 bg-rose-50' },
    { value: 'inspeccion', label: 'Inspección', icon: Eye, color: 'text-violet-600 bg-violet-50' }
  ]
};

const getInitials = (name: string) => name ? name.substring(0, 2).toUpperCase() : '??';

// --- 2. COMPONENTES UI ATÓMICOS ---

const PriorityBadge = ({ priority }: { priority: string }) => {
  const config = CONSTANTS.prioridades.find(p => p.value === priority) || CONSTANTS.prioridades[0];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

const Avatar = ({ name, size = 'sm' }: { name: string, size?: 'sm'|'md' }) => {
    const sizeClass = size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
    return (
      <div title={name} className={`${sizeClass} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0`}>
        {getInitials(name)}
      </div>
    );
};

// --- 3. COMPONENTES DEL CALENDARIO PERSONALIZADOS ---

// Renderizado personalizado del evento dentro del calendario
const CustomEvent = ({ event }: any) => {
  const statusConfig = CONSTANTS.estados.find(e => e.value === event.estado) || CONSTANTS.estados[0];
  const Icon = statusConfig.icon;
  
  return (
    <div className="flex flex-col h-full justify-center px-1 overflow-hidden">
      <div className="flex items-center gap-1.5 mb-0.5">
         <Icon size={12} className={statusConfig.color} />
         <span className={`text-xs font-bold truncate ${statusConfig.color}`}>{event.title}</span>
      </div>
      <div className="flex items-center justify-between">
         <span className="text-[10px] text-gray-500 truncate">{event.cliente}</span>
         {event.prioridad === 'alta' || event.prioridad === 'critica' ? (
             <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> 
         ) : null}
      </div>
    </div>
  );
};

// Barra de herramientas superior personalizada (Estilo PRO)
const CustomToolbar = (toolbar: any) => {
    const goToBack = () => toolbar.onNavigate('PREV');
    const goToNext = () => toolbar.onNavigate('NEXT');
    const goToCurrent = () => toolbar.onNavigate('TODAY');
  
    const label = () => {
      const date =  format(toolbar.date, 'MMMM yyyy', { locale: es });
      return date.charAt(0).toUpperCase() + date.slice(1);
    };
  
    return (
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
            <button onClick={goToBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"><ChevronLeft size={20}/></button>
            <button onClick={goToCurrent} className="px-4 py-1 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Hoy</button>
            <button onClick={goToNext} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"><ChevronRight size={20}/></button>
        </div>
        
        <h2 className="text-xl font-black text-gray-800 tracking-tight capitalize">{label()}</h2>

        <div className="flex bg-gray-100 p-1 rounded-xl">
            {['month', 'week', 'day', 'agenda'].map(view => (
                <button
                    key={view}
                    onClick={() => toolbar.onView(view)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        toolbar.view === view 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {view === 'month' ? 'Mes' : view === 'week' ? 'Semana' : view === 'day' ? 'Día' : 'Agenda'}
                </button>
            ))}
        </div>
      </div>
    );
};

// --- 4. MODAL DE DETALLES MEJORADO ---

const EventDetailModal = ({ event, onClose }: { event: any | null, onClose: () => void }) => {
    if (!event) return null;

    const statusConfig = CONSTANTS.estados.find(e => e.value === event.estado) || CONSTANTS.estados[0];
    const StatusIcon = statusConfig.icon;
    const tipoConfig = CONSTANTS.tipos.find(t => t.value === event.tipo);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Header Modal */}
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                             <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                                 <StatusIcon size={12} /> {statusConfig.label}
                             </span>
                             <PriorityBadge priority={event.prioridad || 'media'} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 leading-tight">{event.title}</h3>
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                            <Building2 size={14}/> {event.cliente}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors shadow-sm">
                        <X size={20} />
                    </button>
                </div>

                {/* Body Scrollable */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    
                    {/* Fecha y Hora */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                            <p className="text-xs font-bold text-blue-400 uppercase mb-1">Fecha</p>
                            <div className="flex items-center gap-2 text-blue-900 font-medium">
                                <CalendarIcon size={18} />
                                {format(event.start, "dd MMM, yyyy", { locale: es })}
                            </div>
                        </div>
                        <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                            <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Horario</p>
                            <div className="flex items-center gap-2 text-indigo-900 font-medium">
                                <Clock size={18} />
                                {format(event.start, "HH:mm")} - {format(event.end, "HH:mm")}
                            </div>
                        </div>
                    </div>

                    {/* Descripción */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Detalles del Servicio</h4>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-700 leading-relaxed">
                            {event.descripcion || 'Sin descripción disponible.'}
                        </div>
                    </div>

                    {/* Personal */}
                    <div>
                         <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Users size={14}/> Equipo Asignado
                         </h4>
                         <div className="flex flex-wrap gap-2">
                            {event.personas && event.personas.length > 0 ? (
                                event.personas.map((nombre: string, idx: number) => (
                                    <div key={idx} className="flex items-center gap-2 pl-1 pr-3 py-1 bg-white border border-gray-200 rounded-full shadow-sm">
                                        <Avatar name={nombre} />
                                        <span className="text-xs font-medium text-gray-700">{nombre}</span>
                                    </div>
                                ))
                            ) : (
                                <span className="text-sm text-gray-400 italic">Sin asignaciones</span>
                            )}
                         </div>
                    </div>

                    {/* Documentos */}
                    {event.documentos && event.documentos.length > 0 && (
                        <div>
                             <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <FileText size={14}/> Adjuntos
                             </h4>
                             <div className="space-y-2">
                                {event.documentos.map((url: string, idx: number) => (
                                    <a href={url} target="_blank" rel="noopener noreferrer" key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group">
                                        <div className="w-8 h-8 bg-gray-100 group-hover:bg-white rounded flex items-center justify-center text-blue-500">
                                            <FileText size={16} />
                                        </div>
                                        <span className="text-sm text-gray-600 font-medium truncate flex-1">Documento adjunto {idx + 1}</span>
                                        <ArrowLeft className="rotate-180 w-4 h-4 text-gray-300 group-hover:text-blue-500"/>
                                    </a>
                                ))}
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- 5. COMPONENTE PRINCIPAL (SCREEN) ---

export const CalendarScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [searchText, setSearchText] = useState('');

  // Fetch de datos
  useEffect(() => {
    setLoading(true);
    // Escucha en tiempo real para mantener sincronía con la pantalla de Servicios
    const unsub = onSnapshot(query(collection(db, 'servicios')), async (snapshot) => {
        try {
            const usuariosSnap = await getDocs(collection(db, 'usuarios'));
            const usuariosMap = new Map(usuariosSnap.docs.map(doc => [doc.id, doc.data().nombre]));

            const calendarEvents = snapshot.docs.map(doc => {
                const data = doc.data();
                // Manejo seguro de fechas
                let start = new Date();
                let end = new Date();

                // Si viene como string 'YYYY-MM-DD'
                if (typeof data.fecha === 'string') {
                    const [y, m, d] = data.fecha.split('-').map(Number);
                    start = new Date(y, m - 1, d);
                    // Ajustar hora inicio
                    if (data.horaInicio) {
                        const [h, min] = data.horaInicio.split(':').map(Number);
                        start.setHours(h, min);
                    }
                    // Ajustar hora fin
                    end = new Date(start);
                    if (data.horaFin) {
                        const [h, min] = data.horaFin.split(':').map(Number);
                        end.setHours(h, min);
                    } else {
                        end.setHours(start.getHours() + 1);
                    }
                }

                return {
                    id: doc.id,
                    title: data.titulo || data.elemento || 'Sin título',
                    start,
                    end,
                    cliente: data.cliente || 'Cliente desconocido',
                    estado: data.estado || 'programado',
                    prioridad: data.prioridad || 'media',
                    tipo: data.tipo || 'mantenimiento',
                    descripcion: data.descripcion,
                    personas: (data.personas || []).map((id: string) => usuariosMap.get(id) || 'N/A'),
                    documentos: data.archivos || []
                };
            });
            setEvents(calendarEvents);
        } catch (error) {
            console.error("Error fetching events:", error);
        } finally {
            setLoading(false);
        }
    });

    return () => unsub();
  }, []);

  // Filtros
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
        const matchStatus = filterStatus === 'todos' || ev.estado === filterStatus;
        const matchSearch = !searchText || 
            ev.title.toLowerCase().includes(searchText.toLowerCase()) || 
            ev.cliente.toLowerCase().includes(searchText.toLowerCase());
        return matchStatus && matchSearch;
    });
  }, [events, filterStatus, searchText]);

  // Estadísticas rápidas
  const stats = useMemo(() => ({
    total: events.length,
    programado: events.filter(e => e.estado === 'programado').length,
    en_proceso: events.filter(e => e.estado === 'en_proceso').length,
  }), [events]);

  // Estilos dinámicos para el calendario
  const eventPropGetter = useCallback((event: any) => {
    const config = CONSTANTS.estados.find(e => e.value === event.estado) || CONSTANTS.estados[0];
    return {
      style: {
        backgroundColor: config.eventBg,
        borderColor: config.eventBorder,
        borderLeftWidth: '3px',
        color: '#1e293b',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '500'
      }
    };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50/50 font-sans text-slate-900 overflow-hidden">
        <main className="flex-1 flex flex-col h-full min-w-0 relative">
            
            {/* --- HEADER SUPERIOR (Igual que Servicios) --- */}
            <header className="bg-white border-b border-gray-200 z-10 sticky top-0 shadow-sm">
                <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <button onClick={() => navigateTo('servicios')} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                             <ArrowLeft className="w-6 h-6"/>
                         </button>
                         <div>
                            <h2 className="text-xl font-bold text-gray-900">Calendario de Actividades</h2>
                            <p className="text-sm text-gray-500 hidden md:block">Visualización mensual de servicios</p>
                         </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64 group">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors"/>
                             <input 
                                type="text" 
                                placeholder="Buscar evento o cliente..." 
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 border rounded-xl outline-none transition-all text-sm"
                             />
                        </div>
                    </div>
                </div>

                {/* --- BARRA DE FILTROS --- */}
                <div className="px-6 py-2 overflow-x-auto border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 scrollbar-hide">
                     <button onClick={() => setFilterStatus('todos')} className={`flex flex-col items-start min-w-[100px] p-3 rounded-xl border transition-all ${filterStatus === 'todos' ? 'bg-white border-blue-500 shadow-md' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Total</span>
                        <span className="text-xl font-black text-gray-900">{stats.total}</span>
                     </button>
                     
                     <button onClick={() => setFilterStatus('programado')} className={`flex flex-col items-start min-w-[100px] p-3 rounded-xl border transition-all ${filterStatus === 'programado' ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-gray-200 hover:bg-blue-50'}`}>
                        <span className="text-[10px] font-bold text-blue-400 uppercase">Pendientes</span>
                        <span className="text-xl font-black text-blue-600">{stats.programado}</span>
                     </button>

                     <button onClick={() => setFilterStatus('en_proceso')} className={`flex flex-col items-start min-w-[100px] p-3 rounded-xl border transition-all ${filterStatus === 'en_proceso' ? 'bg-amber-50 border-amber-500 shadow-md' : 'bg-white border-gray-200 hover:bg-amber-50'}`}>
                        <span className="text-[10px] font-bold text-amber-500 uppercase">En Proceso</span>
                        <span className="text-xl font-black text-amber-600">{stats.en_proceso}</span>
                     </button>
                </div>
            </header>

            {/* --- CONTENIDO PRINCIPAL --- */}
            <div className="flex-1 overflow-hidden p-4 sm:p-6 bg-gray-100/50">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm h-full p-4 flex flex-col">
                    {loading ? (
                         <div className="flex-1 flex items-center justify-center flex-col gap-4">
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-400 font-medium">Cargando agenda...</p>
                         </div>
                    ) : (
                        <Calendar
                            localizer={localizer}
                            events={filteredEvents}
                            startAccessor="start"
                            endAccessor="end"
                            culture='es'
                            className="text-sm font-sans"
                            messages={{ showMore: total => `+${total} más` }}
                            components={{
                                toolbar: CustomToolbar,
                                event: CustomEvent
                            }}
                            eventPropGetter={eventPropGetter}
                            onSelectEvent={event => setSelectedEvent(event)}
                        />
                    )}
                </div>
            </div>

            {/* --- MODAL DETALLE --- */}
            <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        </main>

        {/* --- ESTILOS GLOBALES PARA SOBREESCRIBIR CALENDARIO --- */}
        <style>{`
            .rbc-calendar { font-family: inherit; }
            .rbc-month-view { border: none; }
            .rbc-header { border-bottom: 1px solid #f1f5f9; padding: 12px 0; font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
            .rbc-day-bg { border-left: 1px solid #f1f5f9; }
            .rbc-off-range-bg { background-color: #f8fafc; }
            .rbc-today { background-color: #f0f9ff; }
            .rbc-event { box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 4px; padding: 2px 4px !important; }
            /* Scrollbar personalizada */
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        `}</style>
    </div>
  );
};

export default CalendarScreen;