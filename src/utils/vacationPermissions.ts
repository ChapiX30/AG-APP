import {
  getCalendarUserEmail,
  getCalendarUserName,
  getCalendarUserRole,
  isEdgarAmador,
  isJorgeAmador,
  type CalendarPermissionUser,
} from './calendarPermissions';

export type VacationWorkflowStep = 'calidad' | 'edgar' | 'jorge';

export type VacationFlowType = 'operativo' | 'calidad';

export type VacationStatus =
  | 'borrador'
  | 'pendiente_calidad'
  | 'pendiente_edgar'
  | 'pendiente_jorge'
  | 'aprobada'
  | 'rechazada';

/** Etiquetas genéricas — sin exponer cadena de autorización. */
export const VACATION_STATUS_LABELS: Record<VacationStatus, string> = {
  borrador: 'Borrador',
  pendiente_calidad: 'En revisión',
  pendiente_edgar: 'En revisión',
  pendiente_jorge: 'Pendiente de autorización',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export function isViridianaMoreno(user: CalendarPermissionUser): boolean {
  const name = getCalendarUserName(user);
  const email = getCalendarUserEmail(user);
  if (!name && !email) return false;
  return (
    name === 'viridiana moreno' ||
    (name.includes('viridiana') && name.includes('moreno')) ||
    email.includes('viridiana')
  );
}

/** Personal de área Calidad (no gerente/jefe ni Edgar). */
export function isCalidadApprover(user: CalendarPermissionUser): boolean {
  if (isEdgarAmador(user) || isJorgeAmador(user)) return false;
  const role = getCalendarUserRole(user);
  if (!role) return false;
  return isViridianaMoreno(user) || role.includes('calidad');
}

export function isCalidadSolicitante(user: CalendarPermissionUser): boolean {
  const role = getCalendarUserRole(user);
  if (!role) return false;
  return role.includes('calidad') && !isEdgarAmador(user) && !isJorgeAmador(user);
}

export function getVacationFlowType(user: CalendarPermissionUser): VacationFlowType {
  return isCalidadSolicitante(user) ? 'calidad' : 'operativo';
}

export function canSubmitVacationRequest(user: CalendarPermissionUser): boolean {
  const role = getCalendarUserRole(user);
  if (!role) return false;
  if (role.includes('calidad') && !isEdgarAmador(user) && !isJorgeAmador(user)) return true;
  if (role.includes('admin') || role.includes('gerente')) return false;
  return (
    role.includes('metrologo') ||
    role.includes('metrólogo') ||
    role.includes('tecnico') ||
    role.includes('técnico')
  );
}

/** Solo el responsable de ESE paso puede autorizar (sin saltos). */
export function canApproveVacationStep(
  user: CalendarPermissionUser,
  step: VacationWorkflowStep,
): boolean {
  switch (step) {
    case 'calidad':
      return isCalidadApprover(user);
    case 'edgar':
      return isEdgarAmador(user) && !isJorgeAmador(user);
    case 'jorge':
      return isJorgeAmador(user) && !isEdgarAmador(user);
    default:
      return false;
  }
}

export function getActiveApprovalStep(estado: VacationStatus): VacationWorkflowStep | null {
  switch (estado) {
    case 'pendiente_calidad':
      return 'calidad';
    case 'pendiente_edgar':
      return 'edgar';
    case 'pendiente_jorge':
      return 'jorge';
    default:
      return null;
  }
}

/** Valida que el estado actual corresponda al tipo de flujo. */
export function isEstadoCoherenteConFlujo(
  estado: VacationStatus,
  tipoFlujo: VacationFlowType,
): boolean {
  if (tipoFlujo === 'calidad') {
    return (
      estado === 'borrador' ||
      estado === 'pendiente_jorge' ||
      estado === 'aprobada' ||
      estado === 'rechazada'
    );
  }
  return (
    estado === 'borrador' ||
    estado === 'pendiente_calidad' ||
    estado === 'pendiente_edgar' ||
    estado === 'pendiente_jorge' ||
    estado === 'aprobada' ||
    estado === 'rechazada'
  );
}

export function canUserActOnSolicitud(
  user: CalendarPermissionUser,
  estado: VacationStatus,
  tipoFlujo: VacationFlowType,
): boolean {
  if (!isEstadoCoherenteConFlujo(estado, tipoFlujo)) return false;

  const step = getActiveApprovalStep(estado);
  if (!step) return false;

  if (tipoFlujo === 'calidad') {
    return step === 'jorge' && canApproveVacationStep(user, 'jorge');
  }

  return canApproveVacationStep(user, step);
}

export function isVacationApprover(user: CalendarPermissionUser): boolean {
  return (
    isCalidadApprover(user) ||
    canApproveVacationStep(user, 'edgar') ||
    canApproveVacationStep(user, 'jorge')
  );
}

export function initialStatusForFlow(tipoFlujo: VacationFlowType): VacationStatus {
  return tipoFlujo === 'calidad' ? 'pendiente_jorge' : 'pendiente_calidad';
}

export function initialNotifyStepForFlow(tipoFlujo: VacationFlowType): VacationWorkflowStep {
  return tipoFlujo === 'calidad' ? 'jorge' : 'calidad';
}

/** Correo RH (prueba). */
export const DEFAULT_VACATION_RH_EMAIL = 'eseagmaster@gmail.com';
