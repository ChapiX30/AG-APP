import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import es from 'date-fns/locale/es';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useNavigation } from '../hooks/useNavigation';
import { ArrowLeft, Zap, Calendar as CalendarIcon, Clock, CheckCircle2, RotateCcw, X, Info, User, FileText } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Configuración del localizador para date-fns en español
const locales = { 'es': es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

// Definición de estados para consistencia visual
const estados: { [key: string]: { label: string; color: string; icon: React.ElementType } } = {
  programado: { label: 'Programado', color: '#3b82f6', icon: CalendarIcon },
  en_proceso: { label: 'En Proceso', color: '#10b981', icon: Clock },
  finalizado: { label: 'Finalizado', color: '#8b5cf6', icon: CheckCircle2 },
  reprogramacion: { label: 'Reprogramación', color: '#ef4444', icon: RotateCcw }
};

// Componente para eventos personalizados en el calendario
const CustomEvent = ({ event }: any) => {
  const IconoEstado = estados[event.estado]?.icon || Info;
  return (
    <div className="flex items-center text-xs h-full">
      <IconoEstado size={14} className="mr-2 flex-shrink-0" />
      <span className="truncate">{event.title}</span>
    </div>
  );
};

// *** NUEVO: Modal para mostrar detalles del servicio ***
const EventDetailModal = ({ event, onClose }: { event: any | null, onClose: () => void }) => {
    if (!event) return null;

    const IconoEstado = estados[event.estado]?.icon || Info;
    const colorEstado = estados[event.estado]?.color || '#64748b';

    return (
        <div 
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800 rounded-xl w-full max-w-md border border-slate-700 shadow-lg"
                onClick={(e) => e.stopPropagation()} // Evita que el modal se cierre al hacer clic dentro
            >
                {/* Header del Modal */}
                <div className="p-4 flex justify-between items-center border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <IconoEstado size={20} style={{ color: colorEstado }} />
                        <h3 className="text-lg font-bold text-white">{event.title}</h3>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* Cuerpo del Modal */}
                <div className="p-6 space-y-4">
                    <div>
                        <p className="text-sm font-medium text-gray-400">Fecha</p>
                        <p className="text-white">{format(event.start, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}</p>
                    </div>
                    {event.descripcion && (
                        <div>
                            <p className="text-sm font-medium text-gray-400">Descripción</p>
                            <p className="text-white bg-slate-700/50 p-2 rounded-md">{event.descripcion}</p>
                        </div>
                    )}
                     {event.personas && event.personas.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-gray-400 mb-1">Personal Asignado</p>
                            <div className="flex flex-wrap gap-2">
                                {event.personas.map((nombre: string) => (
                                    <span key={nombre} className="bg-slate-700 text-gray-200 text-xs font-medium px-2 py-1 rounded-full">{nombre}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {event.documentos && event.documentos.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-gray-400 mb-1">Documentos</p>
                            {event.documentos.map((url: string) => (
                                <a href={url} target="_blank" rel="noopener noreferrer" key={url} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm mt-1">
                                    <FileText size={16} />
                                    <span className="truncate">{url.split('/').pop()?.split('?')[0]}</span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


export const CalendarScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null); // Estado para el modal

  const eventStyleGetter = useCallback((event: any) => {
    const color = estados[event.estado as keyof typeof estados]?.color || '#64748b';
    return {
      style: {
        backgroundColor: color,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
        cursor: 'pointer' // Añade cursor de puntero
      }
    };
  }, []);
  
  const messages = {
    allDay: 'Todo el día', previous: 'Anterior', next: 'Siguiente', today: 'Hoy',
    month: 'Mes', week: 'Semana', day: 'Día', agenda: 'Agenda', date: 'Fecha',
    time: 'Hora', event: 'Evento', showMore: (total: number) => `+ Ver más (${total})`,
  };

  useEffect(() => {
    const fetchServicios = async () => {
      setLoading(true);
      try {
        // Obtenemos servicios y usuarios al mismo tiempo
        const [serviciosSnap, usuariosSnap] = await Promise.all([
            getDocs(collection(db, 'servicios')),
            getDocs(collection(db, 'usuarios'))
        ]);
        
        // Creamos un mapa de ID -> Nombre para buscar fácilmente
        const usuariosMap = new Map(usuariosSnap.docs.map(doc => [doc.id, doc.data().nombre]));

        const calendarEvents = serviciosSnap.docs.map(doc => {
          const servicio = doc.data();
          const eventDate = new Date(servicio.fecha);
          eventDate.setMinutes(eventDate.getMinutes() + eventDate.getTimezoneOffset());

          return {
            id: doc.id,
            title: servicio.elemento,
            start: eventDate,
            end: eventDate,
            allDay: true,
            estado: servicio.estado || 'programado',
            descripcion: servicio.descripcion,
            // Mapeamos los IDs de personas a sus nombres
            personas: (servicio.personas || []).map((id: string) => usuariosMap.get(id) || 'Usuario desconocido'),
            documentos: servicio.documentos || []
          };
        });
        setEvents(calendarEvents);
      } catch (error) {
        console.error("Error al obtener los datos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchServicios();
  }, []);

  return (
    <>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans p-4 lg:p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button
                        className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 transition-all duration-200 hover:scale-105"
                        onClick={() => navigateTo('servicios')}
                        title="Regresar a Servicios"
                    >
                        <ArrowLeft size={24} className="text-white" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-white" />
                        </div>
                        <div>
                        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Calendario de Servicios</h1>
                        <p className="text-sm text-gray-400">Vista mensual de los servicios programados</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Calendario */}
            <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 lg:p-6 shadow-2xl">
                {loading ? (
                <div className="h-[70vh] flex items-center justify-center">
                    <p>Cargando calendario...</p>
                </div>
                ) : (
                <Calendar
                    localizer={localizer}
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 'calc(100vh - 200px)' }}
                    className="text-white"
                    culture='es'
                    messages={messages}
                    eventPropGetter={eventStyleGetter}
                    components={{ event: CustomEvent }}
                    onSelectEvent={event => setSelectedEvent(event)} // <-- AQUÍ se activa el modal
                    dayPropGetter={() => ({
                    style: {
                        backgroundColor: 'transparent',
                        borderColor: 'rgb(51 65 85 / 0.5)',
                    },
                    })}
                />
                )}
            </div>
            
            <style>{`
                .rbc-calendar { color: #e2e8f0; }
                .rbc-toolbar { margin-bottom: 1.5rem; text-transform: capitalize; }
                .rbc-toolbar button { background-color: transparent; border: 1px solid #475569; color: #cbd5e1; transition: all 0.2s; }
                .rbc-toolbar button:hover, .rbc-toolbar button:focus { background-color: #475569; border-color: #64748b; color: white; }
                .rbc-toolbar button.rbc-active { background-color: #3b82f6; border-color: #3b82f6; color: white; }
                .rbc-header { border-bottom: 1px solid #475569; padding: 8px 0; font-weight: 600; }
                .rbc-month-view, .rbc-time-view { border: 1px solid #475569; border-radius: 0.75rem; overflow: hidden; }
                .rbc-day-bg.rbc-today { background-color: rgba(59, 130, 246, 0.1); }
                .rbc-off-range-bg { background-color: #1e293b; }
                .rbc-event { padding: 4px 8px; }
            `}</style>
        </div>

        {/* Renderiza el modal si hay un evento seleccionado */}
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </>
  );
};

export default CalendarScreen;