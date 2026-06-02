import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from './firebase';

/**
 * Escucha alertasVencimiento | alertasHojaServicio hasta enviado/error.
 */
export function watchAlertaCorreo(
  coleccion: 'alertasVencimiento' | 'alertasHojaServicio',
  alertId: string,
  options?: { loadingMessage?: string; successMessage?: string }
): () => void {
  const ref = doc(db, coleccion, alertId);
  const loadingMsg = options?.loadingMessage ?? 'Enviando correo...';
  const successMsg = options?.successMessage ?? 'Correo enviado al cliente.';

  const toastId = toast.loading(loadingMsg);

  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { estado?: string; error?: string };
      const estado = String(data.estado || '');

      if (estado === 'enviado') {
        toast.success(successMsg, { id: toastId });
        unsub();
        return;
      }

      if (estado === 'error') {
        const err = data.error ? String(data.error) : '';
        const friendly =
          err.includes('535') || err.includes('BadCredentials')
            ? 'Gmail rechazó la contraseña del servidor. Revise functions/EMAIL_SETUP.md'
            : err.includes('no configurado')
              ? 'Correo no configurado en Firebase Functions.'
              : err || 'No se pudo enviar el correo.';
        toast.error(friendly, { id: toastId, duration: 8000 });
        unsub();
      } else {
        toast.loading('En cola… procesando envío', { id: toastId });
      }
    },
    (e) => {
      toast.error(`Error al verificar envío: ${String(e)}`, { id: toastId });
      unsub();
    }
  );

  window.setTimeout(() => {
    try {
      unsub();
    } catch {
      /* noop */
    }
    toast.dismiss(toastId);
  }, 30000);

  return unsub;
}
