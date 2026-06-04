import type {
  VacationFlowType,
  VacationStatus,
  VacationWorkflowStep,
} from './vacationPermissions';

export interface VacationApprovalRecord {
  uid: string;
  nombre: string;
  fecha: string;
  comentario?: string;
}

export interface VacationHistorialEntry {
  ts: string;
  user: string;
  action: 'creada' | 'enviada' | 'aprobada' | 'rechazada' | 'corregida';
  paso?: VacationWorkflowStep;
  comment?: string;
}

export interface SolicitudVacacionesDoc {
  id?: string;
  solicitanteUid: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitantePuesto: string;
  tipoFlujo: VacationFlowType;
  diasVacaciones: number;
  fechaInicio: string;
  fechaFin: string;
  anio: number;
  comentarioSolicitante?: string;
  fechaSolicitud: string;
  estado: VacationStatus;
  rechazoMotivo?: string;
  rechazadoPorNombre?: string;
  rechazadoPorPaso?: VacationWorkflowStep;
  rechazadoEn?: string;
  historial: VacationHistorialEntry[];
  aprobaciones: {
    calidad?: VacationApprovalRecord;
    edgar?: VacationApprovalRecord;
    jorge?: VacationApprovalRecord;
  };
  pdfStoragePath?: string;
  pdfGenerado?: boolean;
  pdfError?: string;
  correoRh?: string;
  correosRh?: string[];
  correoEnviado?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function inferFlowType(doc: SolicitudVacacionesDoc): VacationFlowType {
  if (doc.tipoFlujo) return doc.tipoFlujo;
  const p = (doc.solicitantePuesto || '').toLowerCase();
  return p.includes('calidad') ? 'calidad' : 'operativo';
}

export function nextStatusAfterApproval(
  current: VacationStatus,
  tipoFlujo: VacationFlowType,
): VacationStatus | null {
  switch (current) {
    case 'pendiente_calidad':
      return tipoFlujo === 'operativo' ? 'pendiente_edgar' : 'pendiente_jorge';
    case 'pendiente_edgar':
      return 'pendiente_jorge';
    case 'pendiente_jorge':
      return 'aprobada';
    default:
      return null;
  }
}

export function approvalStepForStatus(estado: VacationStatus): VacationWorkflowStep | null {
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

export function validateSolicitudForm(input: {
  diasVacaciones: number;
  fechaInicio: string;
  fechaFin: string;
  diasSegunFechas?: number | null;
}): string | null {
  if (!input.fechaInicio || !input.fechaFin) {
    return 'Indica fecha de inicio y fin de vacaciones.';
  }
  if (input.fechaFin < input.fechaInicio) {
    return 'La fecha de fin debe ser igual o posterior a la de inicio.';
  }
  if (!Number.isFinite(input.diasVacaciones) || input.diasVacaciones < 1) {
    return 'Indica un número válido de días de vacaciones.';
  }
  if (input.diasSegunFechas != null && input.diasVacaciones !== input.diasSegunFechas) {
    return `Los días solicitados (${input.diasVacaciones}) no coinciden con el periodo seleccionado (${input.diasSegunFechas} día(s), contando inicio y fin).`;
  }
  return null;
}
