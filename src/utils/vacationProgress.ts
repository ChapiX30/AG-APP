import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import type { VacationWorkflowStep } from './vacationPermissions';
import { approvalStepForStatus } from './vacationWorkflow';
import { inferFlowType, type SolicitudVacacionesDoc } from './vacationWorkflow';

export type ProgressStepState = 'done' | 'current' | 'pending' | 'rejected' | 'skipped';

export interface VacationProgressStep {
  id: VacationWorkflowStep;
  label: string;
  state: ProgressStepState;
  autorizadoPor?: string;
  fecha?: string;
}

/** Días inclusivos (inicio y fin cuentan) excluyendo domingos; se trabaja lunes a sábado. */
export function countVacationDaysInclusive(fechaInicio: string, fechaFin: string): number | null {
  const inicio = parseISO(fechaInicio);
  const fin = parseISO(fechaFin);
  if (!isValid(inicio) || !isValid(fin) || fin < inicio) return null;
  const totalDias = differenceInCalendarDays(fin, inicio) + 1;
  let dias = 0;
  const cursor = new Date(inicio);
  for (let i = 0; i < totalDias; i++) {
    if (cursor.getDay() !== 0) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

const STEP_LABELS: Record<VacationWorkflowStep, string> = {
  calidad: 'Calidad',
  edgar: 'Dirección operativa',
  jorge: 'Jefe inmediato',
};

function getStepOrder(solicitud: SolicitudVacacionesDoc): VacationWorkflowStep[] {
  return inferFlowType(solicitud) === 'calidad'
    ? ['jorge']
    : ['calidad', 'edgar', 'jorge'];
}

function resolveStepState(
  stepId: VacationWorkflowStep,
  solicitud: SolicitudVacacionesDoc,
  order: VacationWorkflowStep[],
): ProgressStepState {
  const approval = solicitud.aprobaciones?.[stepId];
  if (approval) return 'done';

  if (solicitud.estado === 'borrador') return 'pending';

  if (solicitud.estado === 'rechazada') {
    const rechazoEn = solicitud.rechazadoPorPaso;
    if (rechazoEn === stepId) return 'rejected';
    const rejIdx = rechazoEn ? order.indexOf(rechazoEn) : -1;
    const idx = order.indexOf(stepId);
    if (rejIdx >= 0 && idx > rejIdx) return 'skipped';
    return 'pending';
  }

  if (solicitud.estado === 'aprobada') {
    return 'done';
  }

  const current = approvalStepForStatus(solicitud.estado);
  if (!current) return 'pending';

  const curIdx = order.indexOf(current);
  const idx = order.indexOf(stepId);
  if (idx === curIdx) return 'current';
  if (idx < curIdx) return approval ? 'done' : 'pending';
  return 'pending';
}

export function getVacationProgressSteps(solicitud: SolicitudVacacionesDoc): VacationProgressStep[] {
  const order = getStepOrder(solicitud);
  return order.map((id) => {
    const approval = solicitud.aprobaciones?.[id];
    const state = resolveStepState(id, solicitud, order);
    return {
      id,
      label: STEP_LABELS[id],
      state,
      autorizadoPor: approval?.nombre,
      fecha: approval?.fecha,
    };
  });
}

export function formatProgressStateLabel(state: ProgressStepState): string {
  switch (state) {
    case 'done':
      return 'Autorizado';
    case 'current':
      return 'En espera de autorización';
    case 'rejected':
      return 'Rechazado aquí';
    case 'skipped':
      return 'No aplica';
    default:
      return 'Pendiente';
  }
}
