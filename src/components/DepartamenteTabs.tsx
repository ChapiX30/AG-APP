import React from 'react';
import { Truck, Ruler, Settings, Zap, Lock } from 'lucide-react';
import { Department } from '../types';
import { usePermissions } from '../hooks/usePermissions';

interface DepartmentTabsProps {
  departments: Department[];
  activeDepartment: string;
  onDepartmentChange: (departmentId: string) => void;
}

const iconMap = {
  Truck,
  Ruler,
  Settings,
  Zap
};

export const DepartmentTabs: React.FC<DepartmentTabsProps> = ({
  departments,
  activeDepartment,
  onDepartmentChange
}) => {
  const { hasAccessToDepartment } = usePermissions();

  return (
    <div className="border-b border-gray-200 bg-white">
      <nav className="flex space-x-8 px-6" aria-label="Departamentos">
        {departments.map((department) => {
          const hasAccess = hasAccessToDepartment(department.id);
          const isActive = activeDepartment === department.id;
          const IconComponent = iconMap[department.icon as keyof typeof iconMap];

          return (
            <button
              key={department.id}
              onClick={() => hasAccess && onDepartmentChange(department.id)}
              disabled={!hasAccess}
              className={`
                group relative flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200
                ${isActive
                  ? `border-[${department.color}] text-[${department.color}]`
                  : hasAccess
                    ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
                }
              `}
              style={{
                borderBottomColor: isActive ? department.color : undefined,
                color: isActive ? department.color : undefined
              }}
            >
              <div className="flex items-center space-x-2">
                {hasAccess ? (
                  <IconComponent className="w-5 h-5" />
                ) : (
                  <Lock className="w-5 h-5" />
                )}
                <span>{department.name}</span>
              </div>
              
              {!hasAccess && (
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                  Sin acceso
                </div>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};