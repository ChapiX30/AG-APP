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

export interface VacationExcepcionAnticipacion {
  motivo: string;
  autorizadaPorUid: string;
  autorizadaPorNombre: string;
  autorizadaEn: string;
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
  /** Solo Jorge puede crear solicitudes con menos de 10 días de anticipación. */
  excepcionAnticipacion?: boolean;
  excepcionMotivo?: string;
  excepcionAutorizadaPor?: VacationExcepcionAnticipacion;
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

/** Mínimo de días naturales entre hoy y la fecha de inicio al solicitar vacaciones. */
export const VACATION_MIN_NOTICE_DAYS = 10;

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Primera fecha de inicio permitida (hoy + anticipación). */
export function getMinVacationStartDate(fromYmd: string = todayYmdLocal()): string {
  return addCalendarDaysYmd(fromYmd, VACATION_MIN_NOTICE_DAYS);
}

export function validateSolicitudForm(input: {
  diasVacaciones: number;
  fechaInicio: string;
  fechaFin: string;
  diasSegunFechas?: number | null;
  /** Omite la regla de 10 días (solo solicitudes urgentes creadas por Jorge). */
  omitirAnticipacion?: boolean;
}): string | null {
  if (!input.fechaInicio || !input.fechaFin) {
    return 'Indica fecha de inicio y fin de vacaciones.';
  }
  if (input.fechaFin < input.fechaInicio) {
    return 'La fecha de fin debe ser igual o posterior a la de inicio.';
  }
  if (!input.omitirAnticipacion) {
    const minInicio = getMinVacationStartDate();
    if (input.fechaInicio < minInicio) {
      return `Debes solicitar vacaciones con al menos ${VACATION_MIN_NOTICE_DAYS} días de anticipación (inicio a partir del ${minInicio}).`;
    }
  }
  if (!Number.isFinite(input.diasVacaciones) || input.diasVacaciones < 1) {
    return 'Indica un número válido de días de vacaciones.';
  }
  if (input.diasSegunFechas != null && input.diasVacaciones !== input.diasSegunFechas) {
    return `Los días solicitados (${input.diasVacaciones}) no coinciden con el periodo seleccionado (${input.diasSegunFechas} día(s), contando inicio y fin, sin domingos).`;
  }
  return null;
}

export function hasExcepcionAnticipacion(
  doc: Pick<SolicitudVacacionesDoc, 'excepcionAnticipacion'>,
): boolean {
  return doc.excepcionAnticipacion === true;
}
