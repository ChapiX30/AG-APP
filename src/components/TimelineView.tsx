import React from 'react';
import { Project, Task } from '../../types';
import { Calendar, Clock, User } from 'lucide-react';

interface TimelineViewProps {
  projects: Project[];
  tasks: Task[];
  departmentId: string;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ projects, tasks }) => {
  const sortedProjects = [...projects].sort((a, b) => 
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const getTimelinePosition = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
    
    return progress;
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="space-y-6">
        {sortedProjects.map((project, index) => {
          const daysRemaining = getDaysRemaining(project.endDate);
          const timelineProgress = getTimelinePosition(project.startDate, project.endDate);
          
          return (
            <div key={project.id} className="relative">
              {index > 0 && (
                <div className="absolute left-6 -top-3 w-0.5 h-6 bg-gray-200"></div>
              )}
              
              <div className="flex items-start space-x-4">
                <div 
                  className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                  style={{ backgroundColor: project.department.color }}
                >
                  {project.department.code}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {project.name}
                    </h3>
                    <div className="flex items-center space-x-2">
                      <span className={`
                        px-2 py-1 text-xs font-medium rounded-full
                        ${daysRemaining < 0 
                          ? 'bg-red-100 text-red-800' 
                          : daysRemaining < 7 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }
                      `}>
                        {daysRemaining < 0 
                          ? `${Math.abs(daysRemaining)} días atrasado`
                          : `${daysRemaining} días restantes`
                        }
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 text-sm mb-4">{project.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                      <span>
                        {new Date(project.startDate).toLocaleDateString('es-ES')} - 
                        {new Date(project.endDate).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-600">
                      <User className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{project.assignee.name}</span>
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2 text-gray-400" />
                      <span>{project.progress}% completado</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Progreso del proyecto</span>
                      <span className="font-medium text-gray-900">{project.progress}%</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${project.progress}%`,
                          backgroundColor: project.department.color 
                        }}
                      ></div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Inicio: {new Date(project.startDate).toLocaleDateString('es-ES')}</span>
                      <span>Fin: {new Date(project.endDate).toLocaleDateString('es-ES')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};