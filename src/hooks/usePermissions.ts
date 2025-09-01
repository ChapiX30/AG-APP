import { useState, useEffect } from 'react';
import { User, Department } from '../types';
import { currentUser } from '../data/mockData';

export const usePermissions = () => {
  const [user, setUser] = useState<User>(currentUser);

  const hasAccessToDepartment = (departmentId: string): boolean => {
    // Admin tiene acceso a todos los departamentos
    if (user.role.name === 'Administrador') {
      return true;
    }

    // Verificar si el usuario tiene acceso al departamento específico
    return user.departments.some(dept => dept.id === departmentId);
  };

  const canEditProject = (projectDepartmentId: string): boolean => {
    if (user.role.name === 'Administrador') {
      return true;
    }

    if (user.role.name === 'Gerente') {
      return hasAccessToDepartment(projectDepartmentId);
    }

    return false;
  };

  const getAccessibleDepartments = (): Department[] => {
    if (user.role.name === 'Administrador') {
      // Admin puede ver todos los departamentos disponibles
      return user.departments;
    }

    return user.departments;
  };

  return {
    user,
    hasAccessToDepartment,
    canEditProject,
    getAccessibleDepartments,
    setUser
  };
};