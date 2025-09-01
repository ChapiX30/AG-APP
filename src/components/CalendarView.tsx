import React, { useState } from 'react';
import { Project, Task } from '../../types';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';

interface CalendarViewProps {
  projects: Project[];
  tasks: Task[];
  departmentId: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ projects, tasks }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };
  
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    
    const projectEvents = projects.filter(project => {
      const startDate = project.startDate;
      const endDate = project.endDate;
      return dateStr >= startDate && dateStr <= endDate;
    });
    
    const taskEvents = tasks.filter(task => {
      const dueDate = task.dueDate;
      return dateStr === dueDate;
    });
    
    return { projects: projectEvents, tasks: taskEvents };
  };
  
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };
  
  const days = getDaysInMonth(currentDate);
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-150"
            >
              Hoy
            </button>
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-7 gap-1 mb-4">
          {daysOfWeek.map((day) => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (!day) {
              return <div key={index} className="h-24"></div>;
            }
            
            const events = getEventsForDate(day);
            const isToday = day.toDateString() === new Date().toDateString();
            
            return (
              <div
                key={day.toISOString()}
                className={`
                  h-24 p-1 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors duration-150
                  ${isToday ? 'bg-blue-50 border-blue-200' : ''}
                `}
              >
                <div className={`
                  text-sm font-medium mb-1
                  ${isToday ? 'text-blue-700' : 'text-gray-900'}
                `}>
                  {day.getDate()}
                </div>
                
                <div className="space-y-1">
                  {events.projects.slice(0, 2).map((project) => (
                    <div
                      key={project.id}
                      className="text-xs p-1 rounded truncate"
                      style={{ 
                        backgroundColor: `${project.department.color}20`,
                        color: project.department.color 
                      }}
                      title={project.name}
                    >
                      <Calendar className="w-3 h-3 inline mr-1" />
                      {project.name}
                    </div>
                  ))}
                  
                  {events.tasks.slice(0, 1).map((task) => (
                    <div
                      key={task.id}
                      className="text-xs p-1 bg-red-100 text-red-700 rounded truncate"
                      title={task.title}
                    >
                      <Clock className="w-3 h-3 inline mr-1" />
                      {task.title}
                    </div>
                  ))}
                  
                  {(events.projects.length + events.tasks.length) > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{(events.projects.length + events.tasks.length) - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};