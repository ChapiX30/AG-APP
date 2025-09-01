import { Department, User, Project, Task, UserRole, DepartmentView } from '../types';

export const departments: Department[] = [
  {
    id: 'logistics',
    name: 'Logística',
    code: 'LOG',
    color: '#3B82F6',
    icon: 'Truck'
  },
  {
    id: 'dimensional',
    name: 'Dimensional',
    code: 'DIM',
    color: '#10B981',
    icon: 'Ruler'
  },
  {
    id: 'mechanical',
    name: 'Mecánica',
    code: 'MEC',
    color: '#F59E0B',
    icon: 'Settings'
  },
  {
    id: 'electrical',
    name: 'Eléctrica',
    code: 'ELE',
    color: '#EF4444',
    icon: 'Zap'
  }
];

export const roles: UserRole[] = [
  {
    id: 'admin',
    name: 'Administrador',
    permissions: [
      { id: '1', name: 'view_all_departments', resource: 'department', action: 'view' },
      { id: '2', name: 'edit_all_projects', resource: 'project', action: 'edit' }
    ]
  },
  {
    id: 'manager',
    name: 'Gerente',
    permissions: [
      { id: '3', name: 'view_department', resource: 'department', action: 'view' },
      { id: '4', name: 'edit_department_projects', resource: 'project', action: 'edit' }
    ]
  },
  {
    id: 'employee',
    name: 'Empleado',
    permissions: [
      { id: '5', name: 'view_assigned_tasks', resource: 'task', action: 'view' }
    ]
  }
];

export const users: User[] = [
  {
    id: '1',
    name: 'Ana García',
    email: 'ana.garcia@company.com',
    role: roles[0],
    departments: [departments[0], departments[1]]
  },
  {
    id: '2',
    name: 'Carlos López',
    email: 'carlos.lopez@company.com',
    role: roles[1],
    departments: [departments[2]]
  },
  {
    id: '3',
    name: 'María Rodríguez',
    email: 'maria.rodriguez@company.com',
    role: roles[2],
    departments: [departments[3]]
  }
];

export const projects: Project[] = [
  {
    id: '1',
    name: 'Implementación Sistema ERP',
    status: 'in-progress',
    priority: 'high',
    assignee: users[0],
    department: departments[0],
    startDate: '2024-01-15',
    endDate: '2024-06-30',
    progress: 65,
    budget: 150000,
    description: 'Implementación completa del nuevo sistema ERP para optimizar procesos',
    tasks: [],
    files: []
  },
  {
    id: '2',
    name: 'Rediseño Planta Producción',
    status: 'planning',
    priority: 'medium',
    assignee: users[1],
    department: departments[1],
    startDate: '2024-02-01',
    endDate: '2024-08-15',
    progress: 25,
    budget: 200000,
    description: 'Rediseño completo del layout de la planta de producción',
    tasks: [],
    files: []
  },
  {
    id: '3',
    name: 'Mantenimiento Equipos',
    status: 'in-progress',
    priority: 'urgent',
    assignee: users[1],
    department: departments[2],
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    progress: 40,
    budget: 75000,
    description: 'Programa anual de mantenimiento preventivo y correctivo',
    tasks: [],
    files: []
  },
  {
    id: '4',
    name: 'Actualización Sistema Eléctrico',
    status: 'review',
    priority: 'high',
    assignee: users[2],
    department: departments[3],
    startDate: '2024-03-01',
    endDate: '2024-09-30',
    progress: 80,
    budget: 120000,
    description: 'Modernización del sistema eléctrico de la planta',
    tasks: [],
    files: []
  }
];

export const tasks: Task[] = [
  {
    id: '1',
    title: 'Análisis de requerimientos',
    description: 'Documentar todos los requerimientos del sistema',
    status: 'completed',
    assignee: users[0],
    dueDate: '2024-02-15',
    priority: 'high',
    department: departments[0],
    estimatedHours: 40,
    actualHours: 35
  },
  {
    id: '2',
    title: 'Diseño de arquitectura',
    description: 'Crear el diseño técnico del sistema',
    status: 'in-progress',
    assignee: users[1],
    dueDate: '2024-03-30',
    priority: 'high',
    department: departments[1],
    estimatedHours: 60,
    actualHours: 25
  },
  {
    id: '3',
    title: 'Instalación de equipos',
    description: 'Instalar nuevos equipos en línea de producción',
    status: 'todo',
    assignee: users[1],
    dueDate: '2024-04-15',
    priority: 'medium',
    department: departments[2],
    estimatedHours: 80,
    actualHours: 0
  },
  {
    id: '4',
    title: 'Pruebas eléctricas',
    description: 'Realizar pruebas de funcionamiento del sistema eléctrico',
    status: 'review',
    assignee: users[2],
    dueDate: '2024-03-20',
    priority: 'urgent',
    department: departments[3],
    estimatedHours: 30,
    actualHours: 28
  }
];

export const departmentViews: DepartmentView[] = [
  {
    id: 'logistics-view',
    departmentId: 'logistics',
    layout: 'table',
    columns: [
      { id: '1', field: 'name', label: 'Proyecto', width: 200, visible: true, order: 1 },
      { id: '2', field: 'status', label: 'Estado', width: 120, visible: true, order: 2 },
      { id: '3', field: 'budget', label: 'Presupuesto', width: 150, visible: true, order: 3 },
      { id: '4', field: 'endDate', label: 'Fecha Entrega', width: 130, visible: true, order: 4 },
      { id: '5', field: 'assignee', label: 'Responsable', width: 150, visible: true, order: 5 }
    ],
    filters: [],
    sorting: [{ field: 'endDate', direction: 'asc' }]
  },
  {
    id: 'dimensional-view',
    departmentId: 'dimensional',
    layout: 'kanban',
    columns: [
      { id: '1', field: 'name', label: 'Proyecto', width: 250, visible: true, order: 1 },
      { id: '2', field: 'progress', label: 'Progreso', width: 100, visible: true, order: 2 },
      { id: '3', field: 'priority', label: 'Prioridad', width: 100, visible: true, order: 3 }
    ],
    filters: [],
    sorting: [{ field: 'priority', direction: 'desc' }]
  },
  {
    id: 'mechanical-view',
    departmentId: 'mechanical',
    layout: 'timeline',
    columns: [
      { id: '1', field: 'name', label: 'Proyecto', width: 200, visible: true, order: 1 },
      { id: '2', field: 'startDate', label: 'Inicio', width: 120, visible: true, order: 2 },
      { id: '3', field: 'endDate', label: 'Fin', width: 120, visible: true, order: 3 },
      { id: '4', field: 'progress', label: 'Progreso', width: 100, visible: true, order: 4 }
    ],
    filters: [],
    sorting: [{ field: 'startDate', direction: 'asc' }]
  },
  {
    id: 'electrical-view',
    departmentId: 'electrical',
    layout: 'calendar',
    columns: [
      { id: '1', field: 'name', label: 'Proyecto', width: 200, visible: true, order: 1 },
      { id: '2', field: 'dueDate', label: 'Vencimiento', width: 130, visible: true, order: 2 },
      { id: '3', field: 'status', label: 'Estado', width: 120, visible: true, order: 3 }
    ],
    filters: [],
    sorting: [{ field: 'dueDate', direction: 'asc' }]
  }
];

// Usuario actual simulado
export const currentUser: User = users[0]; // Admin con acceso a múltiples departamentos