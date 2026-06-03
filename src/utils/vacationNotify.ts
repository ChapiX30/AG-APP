import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { VacationWorkflowStep } from './vacationPermissions';

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
    const role = normalizeName(String(data.puesto || data.role || ''));
    const name = normalizeName(String(data.name || data.nombre || ''));
    if (
      role.includes('calidad') ||
      (name.includes('viridiana') && name.includes('moreno'))
    ) {
      ids.push(docSnap.id);
    }
  }
  return [...new Set(ids)];
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

export async function notifyVacationPendingApproval(params: {
  solicitudId: string;
  solicitanteNombre: string;
  step: VacationWorkflowStep;
  dias: number;
}): Promise<void> {
  const destinatarios = await getApproverUidsForStep(params.step);
  if (destinatarios.length === 0) return;

  await addDoc(collection(db, 'notificaciones'), {
    tipo: 'vacacion_pendiente',
    type: 'warning',
    title: 'Solicitud de vacaciones',
    body: `${params.solicitanteNombre} solicita ${params.dias} día(s) de vacaciones. Requiere tu autorización.`,
    autorNombre: 'Sistema AG',
    readBy: [],
    destinatarios,
    solicitudVacacionesId: params.solicitudId,
    timestamp: serverTimestamp(),
    global: false,
    fcmData: {
      title: 'Vacaciones pendientes',
      body: `${params.solicitanteNombre} — autorizar`,
      url: '/solicitud-vacaciones',
      solicitudId: params.solicitudId,
    },
  });
}

export async function notifyVacationRejected(params: {
  solicitanteUid: string;
  solicitanteNombre: string;
  rechazadoPorNombre: string;
  motivo: string;
  solicitudId: string;
}): Promise<void> {
  if (!params.solicitanteUid) return;

  await addDoc(collection(db, 'notificaciones'), {
    tipo: 'vacacion_rechazada',
    type: 'error',
    title: 'Vacaciones rechazadas',
    body: `${params.rechazadoPorNombre} rechazó tu solicitud: ${params.motivo}`,
    autorNombre: params.rechazadoPorNombre,
    readBy: [],
    destinatarios: [params.solicitanteUid],
    solicitudVacacionesId: params.solicitudId,
    timestamp: serverTimestamp(),
    global: false,
    fcmData: {
      title: 'Vacaciones rechazadas',
      body: params.motivo.slice(0, 120),
      url: '/solicitud-vacaciones',
      solicitudId: params.solicitudId,
    },
  });
}

/** Encola envío de correo RH con PDF adjunto (Cloud Function). */
export async function enqueueVacationRhEmail(params: {
  solicitudId: string;
  solicitanteNombre: string;
  diasVacaciones: number;
  fechaInicio: string;
  fechaFin: string;
  storagePath: string;
  destinatarioEmail: string;
}): Promise<void> {
  const email = params.destinatarioEmail.trim();
  if (!email) {
    throw new Error('Configure el correo de Recursos Humanos para enviar el formato.');
  }

  const docId = `vac_${params.solicitudId}_${Date.now()}`;
  await addDoc(collection(db, 'alertasVacaciones'), {
    estado: 'pendiente',
    solicitudId: params.solicitudId,
    destinatarioEmail: email,
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
