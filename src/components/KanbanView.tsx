import React from 'react';
import { Project, Task } from '../../types';
import { Calendar, User, TrendingUp } from 'lucide-react';

interface KanbanViewProps {
  projects: Project[];
  tasks: Task[];
  departmentId: string;
}

const statusColumns = [
  { id: 'planning', title: 'Planificación', color: 'bg-gray-100' },
  { id: 'in-progress', title: 'En Progreso', color: 'bg-blue-100' },
  { id: 'review', title: 'Revisión', color: 'bg-yellow-100' },
  { id: 'completed', title: 'Completado', color: 'bg-green-100' }
];

export const KanbanView: React.FC<KanbanViewProps> = ({ projects, tasks }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500';
      case 'high': return 'border-l-orange-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-500';
    }
  };

  return (
    <div className="flex space-x-6 overflow-x-auto pb-6">
      {statusColumns.map((column) => {
        const columnProjects = projects.filter(project => project.status === column.id);
        
        return (
          <div key={column.id} className="flex-shrink-0 w-80">
            <div className={`${column.color} rounded-lg p-4 mb-4`}>
              <h3 className="font-semibold text-gray-800 flex items-center justify-between">
                {column.title}
                <span className="bg-white text-gray-600 text-xs px-2 py-1 rounded-full">
                  {columnProjects.length}
                </span>
              </h3>
            </div>
            
            <div className="space-y-4">
              {columnProjects.map((project) => (
                <div
                  key={project.id}
                  className={`bg-white rounded-lg shadow-sm border-l-4 ${getPriorityColor(project.priority)} p-4 hover:shadow-md transition-shadow duration-200`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium text-gray-900 text-sm leading-tight">
                      {project.name}
                    </h4>
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0 ml-2"
                      style={{ backgroundColor: project.department.color }}
                    ></div>
                  </div>
                  
                  <p className="text-gray-600 text-xs mb-3 line-clamp-2">
                    {project.description}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Progreso
                      </div>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${project.progress}%`,
                          backgroundColor: project.department.color 
                        }}
                      ></div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center text-xs text-gray-500">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(project.endDate).toLocaleDateString('es-ES')}
                      </div>
                      
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-gray-600" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {columnProjects.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-sm">No hay proyectos en esta etapa</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};