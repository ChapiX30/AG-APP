import React, { useState } from 'react';
import { Department, Project, Task, DepartmentView } from '../types';
import { DepartmentTabs } from './DepartmentTabs';
import { TableView } from './views/TableView';
import { KanbanView } from './views/KanbanView';
import { TimelineView } from './views/TimelineView';
import { CalendarView } from './views/CalendarView';
import { usePermissions } from '../hooks/usePermissions';
import { LayoutGrid, Table, Baseline as Timeline, Calendar, Filter, Search, Clock } from 'lucide-react';

interface DepartmentDashboardProps {
  departments: Department[];
  projects: Project[];
  tasks: Task[];
  departmentViews: DepartmentView[];
}

export const DepartmentDashboard: React.FC<DepartmentDashboardProps> = ({
  departments,
  projects,
  tasks,
  departmentViews
}) => {
  const { getAccessibleDepartments, hasAccessToDepartment } = usePermissions();
  const accessibleDepartments = getAccessibleDepartments();
  const [activeDepartment, setActiveDepartment] = useState(accessibleDepartments[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  
  const currentDepartmentView = departmentViews.find(view => view.departmentId === activeDepartment);
  const currentLayout = currentDepartmentView?.layout || 'table';
  
  // Filtrar datos según el departamento activo y término de búsqueda
  const filteredProjects = projects.filter(project => {
    const matchesDepartment = project.department.id === activeDepartment;
    const matchesSearch = searchTerm === '' || 
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDepartment && matchesSearch;
  });
  
  const filteredTasks = tasks.filter(task => {
    const matchesDepartment = task.department.id === activeDepartment;
    const matchesSearch = searchTerm === '' || 
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesDepartment && matchesSearch;
  });

  const renderView = () => {
    if (!hasAccessToDepartment(activeDepartment)) {
      return (
        <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-gray-400 mb-2">🔒</div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Acceso Restringido</h3>
            <p className="text-gray-500">No tienes permisos para ver este departamento</p>
          </div>
        </div>
      );
    }

    switch (currentLayout) {
      case 'kanban':
        return <KanbanView projects={filteredProjects} tasks={filteredTasks} departmentId={activeDepartment} />;
      case 'timeline':
        return <TimelineView projects={filteredProjects} tasks={filteredTasks} departmentId={activeDepartment} />;
      case 'calendar':
        return <CalendarView projects={filteredProjects} tasks={filteredTasks} departmentId={activeDepartment} />;
      default:
        return <TableView projects={filteredProjects} tasks={filteredTasks} departmentId={activeDepartment} />;
    }
  };

  const getLayoutIcon = (layout: string) => {
    switch (layout) {
      case 'kanban': return LayoutGrid;
      case 'timeline': return Timeline;
      case 'calendar': return Calendar;
      default: return Table;
    }
  };

  const currentDepartment = departments.find(dept => dept.id === activeDepartment);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto">
          <DepartmentTabs
            departments={departments}
            activeDepartment={activeDepartment}
            onDepartmentChange={setActiveDepartment}
          />
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto p-6">
        {hasAccessToDepartment(activeDepartment) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: currentDepartment?.color }}
                >
                  {currentDepartment?.code}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Dashboard {currentDepartment?.name}
                  </h1>
                  <p className="text-gray-600">
                    Vista optimizada para {currentDepartment?.name.toLowerCase()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Buscar proyectos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  {['table', 'kanban', 'timeline', 'calendar'].map((layout) => {
                    const IconComponent = getLayoutIcon(layout);
                    const isActive = currentLayout === layout;
                    
                    return (
                      <button
                        key={layout}
                        className={`
                          p-2 rounded-md transition-all duration-150
                          ${isActive 
                            ? 'bg-white shadow-sm text-gray-900' 
                            : 'text-gray-500 hover:text-gray-700'
                          }
                        `}
                        title={`Vista ${layout}`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Proyectos Activos</p>
                    <p className="text-2xl font-bold text-gray-900">{filteredProjects.length}</p>
                  </div>
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${currentDepartment?.color}20` }}
                  >
                    <LayoutGrid className="w-5 h-5" style={{ color: currentDepartment?.color }} />
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Tareas Pendientes</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {filteredTasks.filter(task => task.status !== 'completed').length}
                    </p>
                  </div>
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${currentDepartment?.color}20` }}
                  >
                    <Clock className="w-5 h-5" style={{ color: currentDepartment?.color }} />
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Progreso Promedio</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {filteredProjects.length > 0 
                        ? Math.round(filteredProjects.reduce((acc, p) => acc + p.progress, 0) / filteredProjects.length)
                        : 0}%
                    </p>
                  </div>
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${currentDepartment?.color}20` }}
                  >
                    <Calendar className="w-5 h-5" style={{ color: currentDepartment?.color }} />
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Presupuesto Total</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${filteredProjects.reduce((acc, p) => acc + p.budget, 0).toLocaleString()}
                    </p>
                  </div>
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${currentDepartment?.color}20` }}
                  >
                    <Filter className="w-5 h-5" style={{ color: currentDepartment?.color }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="min-h-96">
          {renderView()}
        </div>
      </div>
    </div>
  );
};