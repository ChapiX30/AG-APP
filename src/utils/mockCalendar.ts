import { addDays, subDays } from 'date-fns';

export interface Event {
  id: string;
  title: string;
  date: Date;
  time: string;
  description: string;
  location?: string;
  attendees?: number;
  category: 'meeting' | 'personal' | 'work' | 'important';
  color: string;
}

export const mockEvents: Event[] = [
  // Eventos de hoy
  {
    id: '1',
    title: 'Reunión de equipo',
    date: new Date(),
    time: '09:00',
    description: 'Reunión semanal del equipo de desarrollo para revisar el progreso del proyecto y planificar las tareas de la semana.',
    location: 'Sala de conferencias A',
    attendees: 8,
    category: 'meeting',
    color: '#3b82f6'
  },
  {
    id: '2',
    title: 'Presentación cliente',
    date: new Date(),
    time: '14:30',
    description: 'Presentación del prototipo final al cliente principal. Incluye demo en vivo y sesión de preguntas.',
    location: 'Oficina del cliente',
    attendees: 12,
    category: 'important',
    color: '#ef4444'
  },
  {
    id: '3',
    title: 'Gimnasio',
    date: new Date(),
    time: '18:00',
    description: 'Sesión de entrenamiento personal. Enfoque en cardio y fuerza.',
    location: 'Gimnasio Central',
    category: 'personal',
    color: '#10b981'
  },

  // Eventos de mañana
  {
    id: '4',
    title: 'Code Review',
    date: addDays(new Date(), 1),
    time: '10:00',
    description: 'Revisión de código de las nuevas funcionalidades implementadas esta semana.',
    location: 'Sala de desarrollo',
    attendees: 5,
    category: 'work',
    color: '#f59e0b'
  },
  {
    id: '5',
    title: 'Almuerzo con María',
    date: addDays(new Date(), 1),
    time: '13:00',
    description: 'Almuerzo de trabajo para discutir el nuevo proyecto de marketing digital.',
    location: 'Restaurante Plaza',
    attendees: 2,
    category: 'personal',
    color: '#10b981'
  },

  // Eventos de la próxima semana
  {
    id: '6',
    title: 'Capacitación React',
    date: addDays(new Date(), 3),
    time: '09:00',
    description: 'Taller intensivo de React 19 y las nuevas funcionalidades. Incluye ejercicios prácticos.',
    location: 'Sala de capacitación',
    attendees: 15,
    category: 'work',
    color: '#f59e0b'
  },
  {
    id: '7',
    title: 'Sprint Planning',
    date: addDays(new Date(), 5),
    time: '10:00',
    description: 'Planificación del próximo sprint. Estimación de tareas y asignación de responsabilidades.',
    location: 'Sala de reuniones B',
    attendees: 8,
    category: 'meeting',
    color: '#3b82f6'
  },
  {
    id: '8',
    title: 'Cumpleaños de Ana',
    date: addDays(new Date(), 7),
    time: '19:00',
    description: 'Celebración de cumpleaños de Ana. Cena y fiesta sorpresa.',
    location: 'Restaurante El Jardín',
    attendees: 20,
    category: 'personal',
    color: '#10b981'
  },

  // Eventos pasados
  {
    id: '9',
    title: 'Standup diario',
    date: subDays(new Date(), 1),
    time: '09:30',
    description: 'Standup diario del equipo de desarrollo. Revisión del progreso del día anterior.',
    location: 'Sala de desarrollo',
    attendees: 8,
    category: 'meeting',
    color: '#3b82f6'
  },
  {
    id: '10',
    title: 'Entrega de proyecto',
    date: subDays(new Date(), 2),
    time: '16:00',
    description: 'Entrega final del proyecto de e-commerce. Presentación del producto terminado.',
    location: 'Oficina principal',
    attendees: 25,
    category: 'important',
    color: '#ef4444'
  },
  {
    id: '11',
    title: 'Cita médica',
    date: subDays(new Date(), 3),
    time: '11:00',
    description: 'Chequeo médico general. Exámenes de rutina y consulta preventiva.',
    location: 'Clínica San José',
    category: 'personal',
    color: '#10b981'
  },

  // Más eventos distribuidos
  {
    id: '12',
    title: 'Workshop UX/UI',
    date: addDays(new Date(), 10),
    time: '14:00',
    description: 'Taller de diseño UX/UI con enfoque en mejores prácticas y tendencias actuales.',
    location: 'Centro de convenciones',
    attendees: 50,
    category: 'work',
    color: '#f59e0b'
  },
  {
    id: '13',
    title: 'Reunión inversores',
    date: addDays(new Date(), 12),
    time: '10:00',
    description: 'Presentación trimestral a inversores. Reporte de resultados y proyecciones.',
    location: 'Sala de juntas',
    attendees: 6,
    category: 'important',
    color: '#ef4444'
  },
  {
    id: '14',
    title: 'Concierto jazz',
    date: addDays(new Date(), 15),
    time: '20:00',
    description: 'Concierto de jazz en vivo. Artista invitado: Marcus Miller.',
    location: 'Teatro Municipal',
    attendees: 2,
    category: 'personal',
    color: '#10b981'
  },
  {
    id: '15',
    title: 'Demo día',
    date: addDays(new Date(), 20),
    time: '15:00',
    description: 'Presentación de todos los proyectos terminados en el último mes.',
    location: 'Auditorio principal',
    attendees: 100,
    category: 'meeting',
    color: '#3b82f6'
  }
]