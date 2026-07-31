import {
  getCalendarUserEmail,
  getCalendarUserName,
  getCalendarUserRole,
  isEdgarAmador,
  isJorgeAmador,
  type CalendarPermissionUser,
} from './calendarPermissions';

export type VacationWorkflowStep = 'calidad' | 'edgar' | 'jorge';

/**
 * Flujos de autorización:
 * - operativo:      Calidad → Edgar → Jorge  (metrólogos / técnicos)
 * - calidad_jorge:  Calidad → Jorge          (Edgar Amador, Nora Amador)
 * - edgar_jorge:    Edgar → Jorge            (Viridiana / personal Calidad)
 * - calidad:        Jorge solo               (legacy; solicitudes antiguas)
 */
export type VacationFlowType =
  | 'operativo'
  | 'calidad_jorge'
  | 'edgar_jorge'
  | 'calidad';

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
    (name.includes('viridiana') && !name.includes('amador')) ||
    email.includes('viridiana')
  );
}

export function isNoraAmador(user: CalendarPermissionUser): boolean {
  const name = getCalendarUserName(user);
  const email = getCalendarUserEmail(user);
  if (!name && !email) return false;
  return (
    name === 'nora amador' ||
    (name.includes('nora') && name.includes('amador')) ||
    (email.includes('nora') && email.includes('amador'))
  );
}

/** Personal de área Calidad (no gerente/jefe ni Edgar/Nora). */
export function isCalidadApprover(user: CalendarPermissionUser): boolean {
  if (isEdgarAmador(user) || isJorgeAmador(user) || isNoraAmador(user)) return false;
  const role = getCalendarUserRole(user);
  if (!role && !isViridianaMoreno(user)) return false;
  return isViridianaMoreno(user) || Boolean(role && role.includes('calidad'));
}

export function isCalidadSolicitante(user: CalendarPermissionUser): boolean {
  if (isEdgarAmador(user) || isJorgeAmador(user) || isNoraAmador(user)) return false;
  if (isViridianaMoreno(user)) return true;
  const role = getCalendarUserRole(user);
  if (!role) return false;
  return role.includes('calidad');
}

/** Pasos de autorización según el tipo de flujo. */
export function getStepsForFlow(tipoFlujo: VacationFlowType): VacationWorkflowStep[] {
  switch (tipoFlujo) {
    case 'calidad_jorge':
      return ['calidad', 'jorge'];
    case 'edgar_jorge':
      return ['edgar', 'jorge'];
    case 'calidad':
      return ['jorge'];
    case 'operativo':
    default:
      return ['calidad', 'edgar', 'jorge'];
  }
}

export function getVacationFlowType(user: CalendarPermissionUser): VacationFlowType {
  if (isEdgarAmador(user) && !isJorgeAmador(user)) return 'calidad_jorge';
  if (isNoraAmador(user)) return 'calidad_jorge';
  if (isCalidadSolicitante(user)) return 'edgar_jorge';
  return 'operativo';
}

export function canSubmitVacationRequest(user: CalendarPermissionUser): boolean {
  if (!user) return false;
  if (isJorgeAmador(user) && !isEdgarAmador(user)) return false;
  if (isEdgarAmador(user)) return true;
  if (isNoraAmador(user)) return true;
  if (isViridianaMoreno(user)) return true;

  const role = getCalendarUserRole(user);
  if (!role) return false;
  if (role.includes('calidad')) return true;
  if (role.includes('admin') || role.includes('gerente')) return false;
  return (
    role.includes('metrologo') ||
    role.includes('metrólogo') ||
    role.includes('tecnico') ||
    role.includes('técnico')
  );
}

/**
 * Solo Jorge Amador puede crear solicitudes urgentes (sin 10 días de anticipación)
 * a nombre de un colaborador. La opción no es visible para el resto del personal.
 */
export function canCreateUrgentVacationRequest(user: CalendarPermissionUser): boolean {
  return isJorgeAmador(user) && !isEdgarAmador(user);
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
  if (estado === 'borrador' || estado === 'aprobada' || estado === 'rechazada') return true;
  const step = getActiveApprovalStep(estado);
  if (!step) return false;
  return getStepsForFlow(tipoFlujo).includes(step);
}

export function canUserActOnSolicitud(
  user: CalendarPermissionUser,
  estado: VacationStatus,
  tipoFlujo: VacationFlowType,
): boolean {
  if (!isEstadoCoherenteConFlujo(estado, tipoFlujo)) return false;

  const step = getActiveApprovalStep(estado);
  if (!step) return false;
  if (!getStepsForFlow(tipoFlujo).includes(step)) return false;

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
  const steps = getStepsForFlow(tipoFlujo);
  const first = steps[0];
  if (first === 'calidad') return 'pendiente_calidad';
  if (first === 'edgar') return 'pendiente_edgar';
  return 'pendiente_jorge';
}

export function initialNotifyStepForFlow(tipoFlujo: VacationFlowType): VacationWorkflowStep {
  return getStepsForFlow(tipoFlujo)[0] || 'jorge';
}

/** Correos RH / administración — PDF final y copia en avisos. */
export const VACATION_RH_EMAILS = [
  'eseagmaster@gmail.com',
  'admin@ese-ag.mx',
] as const;

/** Compatibilidad con campo legacy `correoRh` (primer correo). */
export const DEFAULT_VACATION_RH_EMAIL = VACATION_RH_EMAILS[0];
