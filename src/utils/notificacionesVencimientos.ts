import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { EquipoVencimiento } from './vencimientosData';
import { formatFechaVencimiento, STATUS_LABELS } from './vencimientosData';

export interface EnviarAlertaVencimientoParams {
  equipos: EquipoVencimiento[];
  cliente: string;
  destinatarioEmail: string;
  destinatarioNombre: string;
  destinatarioUid?: string;
  autorNombre?: string;
  autorUid?: string;
  tipo: 'individual' | 'cliente';
}

function buildResumenEquipos(equipos: EquipoVencimiento[]): string {
  return equipos
    .map(
      (eq, i) =>
        `${i + 1}. ${eq.descripcion} (${eq.equipoId}) — ${STATUS_LABELS[eq.status]} — vence ${formatFechaVencimiento(eq.fechaVencimiento)}`
    )
    .join('\n');
}

function alertaDocId(
  tipo: 'individual' | 'cliente',
  cliente: string,
  destinatarioUid: string | undefined,
  equipoId?: string
): string {
  const safe = (s: string) => s.replace(/[/\s#]/g, '_').slice(0, 40);
  const stamp = Date.now();
  if (tipo === 'individual' && equipoId) {
    return `venc_${safe(equipoId)}_${safe(destinatarioUid || 'sin_uid')}_${stamp}`;
  }
  return `venc_cliente_${safe(cliente)}_${safe(destinatarioUid || 'sin_uid')}_${stamp}`;
}

/**
 * Encola alerta en Firestore. La Cloud Function envía correo y notificación push.
 */
export async function enviarAlertaVencimiento(
  params: EnviarAlertaVencimientoParams
): Promise<string> {
  const {
    equipos,
    cliente,
    destinatarioEmail,
    destinatarioNombre,
    destinatarioUid,
    autorNombre = 'Calidad',
    autorUid = '',
    tipo,
  } = params;

  if (!destinatarioEmail?.trim()) {
    throw new Error('El responsable no tiene correo registrado en usuarios.');
  }
  if (equipos.length === 0) {
    throw new Error('No hay equipos para notificar.');
  }

  const docId = alertaDocId(
    tipo,
    cliente,
    destinatarioUid,
    tipo === 'individual' ? equipos[0]?.equipoId : undefined
  );

  const countVencidos = equipos.filter((e) => e.status === 'vencido').length;
  const countCriticos = equipos.filter((e) => e.status === 'critico').length;
  const titulo =
    tipo === 'individual'
      ? `Vencimiento: ${equipos[0].equipoId} — ${cliente}`
      : `Vencimientos (${equipos.length}) — ${cliente}`;

  const mensajeCorto =
    tipo === 'individual'
      ? `${equipos[0].descripcion} vence el ${formatFechaVencimiento(equipos[0].fechaVencimiento)} (${STATUS_LABELS[equipos[0].status]}).`
      : `${equipos.length} equipo(s) requieren atención (${countVencidos} vencidos, ${countCriticos} críticos).`;

  await setDoc(doc(db, 'alertasVencimiento', docId), {
    tipo,
    cliente,
    destinatarioEmail: destinatarioEmail.trim().toLowerCase(),
    destinatarioNombre,
    destinatarioUid: destinatarioUid || '',
    autorNombre,
    autorUid,
    titulo,
    mensajeCorto,
    resumenTexto: buildResumenEquipos(equipos),
    equipos: equipos.map((e) => ({
      equipoId: e.equipoId,
      descripcion: e.descripcion,
      fechaVencimiento: e.fechaVencimiento.toISOString(),
      status: e.status,
      diasRestantes: e.diasRestantes,
    })),
    estado: 'pendiente',
    creadoEn: serverTimestamp(),
  });

  if (destinatarioUid) {
    const notifId =
      tipo === 'individual'
        ? `vencimiento_${equipos[0].equipoId}_${destinatarioUid}`.replace(/\//g, '_')
        : `vencimiento_cliente_${cliente}_${destinatarioUid}`.replace(/\//g, '_').slice(0, 120);

    await setDoc(
      doc(db, 'notificaciones', `${notifId}_${Date.now()}`),
      {
        type: equipos.some((e) => e.status === 'vencido') ? 'error' : 'warning',
        title: titulo,
        body: mensajeCorto,
        destinatarios: [destinatarioUid],
        readBy: [],
        timestamp: serverTimestamp(),
        autorNombre,
        autorUid,
        leido: false,
        fecha: new Date().toISOString(),
        tipo: tipo === 'individual' ? 'vencimiento_equipo' : 'vencimiento_cliente',
        cliente,
        navigateTo: 'vencimientos',
        fcmSent: false,
      },
      { merge: true }
    );
  }

  return docId;
}
