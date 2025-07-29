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
    title: 'Reuni�n de equipo',
    date: new Date(),
    time: '09:00',
    description: 'Reuni�n semanal del equipo de desarrollo para revisar el progreso del proyecto y planificar las tareas de la semana.',
    location: 'Sala de conferencias A',
    attendees: 8,
    category: 'meeting',
    color: '#3b82f6'
  },
  {
    id: '2',
    title: 'Presentaci�n cliente',
    date: new Date(),
    time: '14:30',
    description: 'Presentaci�n del prototipo final al cliente principal. Incluye demo en vivo y sesi�n de preguntas.',
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
    description: 'Sesi�n de entrenamiento personal. Enfoque en cardio y fuerza.',
    location: 'Gimnasio Central',
    category: 'personal',
    color: '#10b981'
  },

  // Eventos de ma�ana
  {
    id: '4',
    title: 'Code Review',
    date: addDays(new Date(), 1),
    time: '10:00',
    description: 'Revisi�n de c�digo de las nuevas funcionalidades implementadas esta semana.',
    location: 'Sala de desarrollo',
    attendees: 5,
    category: 'work',
    color: '#f59e0b'
  },
  {
    id: '5',
    title: 'Almuerzo con Mar�a',
    date: addDays(new Date(), 1),
    time: '13:00',
    description: 'Almuerzo de trabajo para discutir el nuevo proyecto de marketing digital.',
    location: 'Restaurante Plaza',
    attendees: 2,
    category: 'personal',
    color: '#10b981'
  },

  // Eventos de la pr�xima semana
  {
    id: '6',
    title: 'Capacitaci�n React',
    date: addDays(new Date(), 3),
    time: '09:00',
    description: 'Taller intensivo de React 19 y las nuevas funcionalidades. Incluye ejercicios pr�cticos.',
    location: 'Sala de capacitaci�n',
    attendees: 15,
    category: 'work',
    color: '#f59e0b'
  },
  {
    id: '7',
    title: 'Sprint Planning',
    date: addDays(new Date(), 5),
    time: '10:00',
    description: 'Planificaci�n del pr�ximo sprint. Estimaci�n de tareas y asignaci�n de responsabilidades.',
    location: 'Sala de reuniones B',
    attendees: 8,
    category: 'meeting',
    color: '#3b82f6'
  },
  {
    id: '8',
    title: 'Cumplea�os de Ana',
    date: addDays(new Date(), 7),
    time: '19:00',
    description: 'Celebraci�n de cumplea�os de Ana. Cena y fiesta sorpresa.',
    location: 'Restaurante El Jard�n',
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
    description: 'Standup diario del equipo de desarrollo. Revisi�n del progreso del d�a anterior.',
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
    description: 'Entrega final del proyecto de e-commerce. Presentaci�n del producto terminado.',
    location: 'Oficina principal',
    attendees: 25,
    category: 'important',
    color: '#ef4444'
  },
  {
    id: '11',
    title: 'Cita m�dica',
    date: subDays(new Date(), 3),
    time: '11:00',
    description: 'Chequeo m�dico general. Ex�menes de rutina y consulta preventiva.',
    location: 'Cl�nica San Jos�',
    category: 'personal',
    color: '#10b981'
  },

  // M�s eventos distribuidos
  {
    id: '12',
    title: 'Workshop UX/UI',
    date: addDays(new Date(), 10),
    time: '14:00',
    description: 'Taller de dise�o UX/UI con enfoque en mejores pr�cticas y tendencias actuales.',
    location: 'Centro de convenciones',
    attendees: 50,
    category: 'work',
    color: '#f59e0b'
  },
  {
    id: '13',
    title: 'Reuni�n inversores',
    date: addDays(new Date(), 12),
    time: '10:00',
    description: 'Presentaci�n trimestral a inversores. Reporte de resultados y proyecciones.',
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
    title: 'Demo d�a',
    date: addDays(new Date(), 20),
    time: '15:00',
    description: 'Presentaci�n de todos los proyectos terminados en el �ltimo mes.',
    location: 'Auditorio principal',
    attendees: 100,
    category: 'meeting',
    color: '#3b82f6'
  }
]