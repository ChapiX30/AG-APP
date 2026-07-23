import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  isEdgarAmador,
  isJorgeAmador,
} from './calendarPermissions';
import {
  isCalidadApprover,
  VACATION_RH_EMAILS,
  type VacationWorkflowStep,
} from './vacationPermissions';

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function userEmail(data: Record<string, unknown>): string {
  return String(data.email || data.correo || '').trim().toLowerCase();
}

function toCalendarUser(data: Record<string, unknown>) {
  return {
    name: String(data.name || data.nombre || ''),
    email: String(data.email || data.correo || ''),
    puesto: String(data.puesto || data.role || ''),
    role: String(data.role || data.puesto || ''),
  };
}

async function findUserIdsByNameHints(hints: string[]): Promise<string[]> {
  const snap = await getDocs(collection(db, 'usuarios'));
  const ids: string[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const name = normalizeName(String(data.name || data.nombre || ''));
    if (hints.some((h) => name.includes(normalizeName(h)))) {
      ids.push(docSnap.id);
    }
  }
  return [...new Set(ids)];
}

async function findCalidadApproverIds(): Promise<string[]> {
  const snap = await getDocs(collection(db, 'usuarios'));
  const ids: string[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const user = toCalendarUser(data);
    if (isCalidadApprover(user)) ids.push(docSnap.id);
  }
  return [...new Set(ids)];
}

/** Correos del autorizador del paso (solo esa persona). */
export async function getApproverEmailsForStep(
  step: VacationWorkflowStep,
): Promise<string[]> {
  const snap = await getDocs(collection(db, 'usuarios'));
  const emails: string[] = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const email = userEmail(data);
    if (!email) continue;
    const user = toCalendarUser(data);

    if (step === 'calidad' && isCalidadApprover(user)) {
      emails.push(email);
      continue;
    }
    if (step === 'edgar' && isEdgarAmador(user) && !isJorgeAmador(user)) {
      emails.push(email);
      continue;
    }
    if (step === 'jorge' && isJorgeAmador(user) && !isEdgarAmador(user)) {
      emails.push(email);
    }
  }

  return [...new Set(emails)];
}

const STEP_LABELS: Record<VacationWorkflowStep, string> = {
  calidad: 'Calidad',
  edgar: 'Edgar Amador',
  jorge: 'Jorge Amador',
};

async function enqueueVacationMailAlert(payload: Record<string, unknown>): Promise<void> {
  await addDoc(collection(db, 'alertasVacacionesPaso'), {
    estado: 'pendiente',
    ...payload,
    creadoEn: serverTimestamp(),
  });
}

export async function getApproverUidsForStep(
  step: VacationWorkflowStep,
): Promise<string[]> {
  switch (step) {
    case 'calidad':
      return findCalidadApproverIds();
    case 'edgar':
      return findUserIdsByNameHints(['edgar amador', 'edgar']);
    case 'jorge':
      return findUserIdsByNameHints(['jorge amador', 'jorge']);
    default:
      return [];
  }
}

async function createInAppNotification(params: {
  tipo: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  body: string;
  destinatarios: string[];
  solicitudId: string;
  autorNombre?: string;
  fcmTitle: string;
  fcmBody: string;
}): Promise<void> {
  if (params.destinatarios.length === 0) return;

  await addDoc(collection(db, 'notificaciones'), {
    tipo: params.tipo,
    type: params.type,
    title: params.title,
    body: params.body,
    autorNombre: params.autorNombre || 'Sistema AG',
    readBy: [],
    destinatarios: params.destinatarios,
    solicitudVacacionesId: params.solicitudId,
    timestamp: serverTimestamp(),
    global: false,
    fcmData: {
      title: params.fcmTitle,
      body: params.fcmBody,
      url: '/solicitud-vacaciones',
      solicitudId: params.solicitudId,
    },
  });
}

/** Push + correo solo al autorizador del paso (Calidad, Edgar o Jorge). */
export async function notifyVacationPendingApproval(params: {
  solicitudId: string;
  solicitanteNombre: string;
  solicitanteEmail?: string;
  step: VacationWorkflowStep;
  dias: number;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<void> {
  const destinatarios = await getApproverUidsForStep(params.step);
  const destinatariosRevision = await getApproverEmailsForStep(params.step);
  const pasoLabel = STEP_LABELS[params.step];

  await createInAppNotification({
    tipo: 'vacacion_pendiente',
    type: 'warning',
    title: 'Solicitud de vacaciones',
    body: `${params.solicitanteNombre} solicita ${params.dias} día(s). Por favor revise esta solicitud (${pasoLabel}).`,
    destinatarios,
    solicitudId: params.solicitudId,
    fcmTitle: 'Vacaciones — revisar solicitud',
    fcmBody: `${params.solicitanteNombre} · ${pasoLabel}`,
  });

  await enqueueVacationMailAlert({
    tipo: 'revision',
    paso: params.step,
    solicitudId: params.solicitudId,
    solicitanteNombre: params.solicitanteNombre,
    diasVacaciones: params.dias,
    fechaInicio: params.fechaInicio || '',
    fechaFin: params.fechaFin || '',
    destinatariosRevision,
  });
}

/** Aviso al solicitante cuando envía o reenvía. */
export async function notifyVacationSubmitted(params: {
  solicitanteUid: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitudId: string;
  dias: number;
  /** Si Jorge creó la solicitud urgente a nombre del colaborador. */
  creadaPorUrgenciaNombre?: string;
}): Promise<void> {
  if (!params.solicitanteUid) return;

  const esUrgente = Boolean(params.creadaPorUrgenciaNombre);
  const body = esUrgente
    ? `${params.creadaPorUrgenciaNombre} registró una solicitud urgente de ${params.dias} día(s) de vacaciones a su nombre. Está en revisión.`
    : `Su solicitud de ${params.dias} día(s) de vacaciones fue enviada y está en revisión.`;

  await createInAppNotification({
    tipo: 'vacacion_progreso',
    type: 'info',
    title: esUrgente ? 'Solicitud urgente registrada' : 'Solicitud enviada',
    body,
    destinatarios: [params.solicitanteUid],
    solicitudId: params.solicitudId,
    fcmTitle: esUrgente ? 'Vacaciones urgentes' : 'Vacaciones enviadas',
    fcmBody: 'En proceso de autorización',
  });

  if (params.solicitanteEmail) {
    await enqueueVacationMailAlert({
      tipo: 'enviada',
      solicitudId: params.solicitudId,
      solicitanteNombre: params.solicitanteNombre,
      solicitanteEmail: params.solicitanteEmail,
      mensaje: esUrgente
        ? `${params.creadaPorUrgenciaNombre} registró una solicitud urgente de vacaciones a su nombre. Está en el flujo de autorización.`
        : 'Su solicitud de vacaciones fue registrada y enviada al flujo de autorización. Le notificaremos en cada paso.',
    });
  }
}

/** Aviso al solicitante cuando un paso intermedio fue autorizado. */
export async function notifyVacationStepApproved(params: {
  solicitanteUid: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitudId: string;
  autorizadoPor: string;
  siguientePasoLabel: string;
}): Promise<void> {
  if (!params.solicitanteUid) return;

  const msg = `${params.autorizadoPor} autorizó un paso. Siguiente: ${params.siguientePasoLabel}.`;

  await createInAppNotification({
    tipo: 'vacacion_progreso',
    type: 'info',
    title: 'Vacaciones — avance',
    body: msg,
    destinatarios: [params.solicitanteUid],
    solicitudId: params.solicitudId,
    autorNombre: params.autorizadoPor,
    fcmTitle: 'Vacaciones en proceso',
    fcmBody: params.siguientePasoLabel,
  });

  if (params.solicitanteEmail) {
    await enqueueVacationMailAlert({
      tipo: 'aprobada_paso',
      solicitudId: params.solicitudId,
      solicitanteNombre: params.solicitanteNombre,
      solicitanteEmail: params.solicitanteEmail,
      mensaje: msg,
    });
  }
}

/** Solo notificación in-app; el PDF RH lo envía la Cloud Function al aprobar Jorge. */
export async function notifyVacationFullyApproved(params: {
  solicitanteUid: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitudId: string;
}): Promise<void> {
  if (!params.solicitanteUid) return;

  await createInAppNotification({
    tipo: 'vacacion_aprobada',
    type: 'success',
    title: 'Vacaciones aprobadas',
    body: 'Su solicitud fue aprobada. El formato AG-ADM-F12 se enviará a Recursos Humanos.',
    destinatarios: [params.solicitanteUid],
    solicitudId: params.solicitudId,
    fcmTitle: 'Vacaciones aprobadas',
    fcmBody: 'Formato en trámite con RH',
  });
}

export async function notifyVacationRejected(params: {
  solicitanteUid: string;
  solicitanteNombre: string;
  solicitanteEmail?: string;
  rechazadoPorNombre: string;
  motivo: string;
  solicitudId: string;
}): Promise<void> {
  if (!params.solicitanteUid) return;

  await createInAppNotification({
    tipo: 'vacacion_rechazada',
    type: 'error',
    title: 'Vacaciones rechazadas',
    body: `${params.rechazadoPorNombre} rechazó tu solicitud: ${params.motivo}`,
    destinatarios: [params.solicitanteUid],
    solicitudId: params.solicitudId,
    autorNombre: params.rechazadoPorNombre,
    fcmTitle: 'Vacaciones rechazadas',
    fcmBody: params.motivo.slice(0, 120),
  });

  if (params.solicitanteEmail) {
    await enqueueVacationMailAlert({
      tipo: 'rechazada',
      solicitudId: params.solicitudId,
      solicitanteNombre: params.solicitanteNombre,
      solicitanteEmail: params.solicitanteEmail,
      mensaje: `${params.rechazadoPorNombre} rechazó la solicitud. Motivo: ${params.motivo}`,
    });
  }
}

/** @deprecated No usar en aprobación final; el envío lo hace onVacacionAprobadaFinal. */
export async function enqueueVacationRhEmail(params: {
  solicitudId: string;
  solicitanteNombre: string;
  diasVacaciones: number;
  fechaInicio: string;
  fechaFin: string;
  storagePath: string;
}): Promise<void> {
  await addDoc(collection(db, 'alertasVacaciones'), {
    estado: 'pendiente',
    solicitudId: params.solicitudId,
    destinatarios: [...VACATION_RH_EMAILS],
    correosRh: [...VACATION_RH_EMAILS],
    destinatarioNombre: 'Recursos Humanos',
    solicitanteNombre: params.solicitanteNombre,
    diasVacaciones: params.diasVacaciones,
    fechaInicio: params.fechaInicio,
    fechaFin: params.fechaFin,
    storagePath: params.storagePath,
    titulo: `Solicitud de vacaciones — ${params.solicitanteNombre}`,
    mensajeCorto: `Se adjunta el formato AG-ADM-F12 autorizado para ${params.solicitanteNombre} (${params.diasVacaciones} día(s)).`,
    creadoEn: serverTimestamp(),
  });
}
