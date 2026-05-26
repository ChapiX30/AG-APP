import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export interface NotificarRevisionCalidadParams {
  worksheetDocId: string;
  equipmentId: string;
  cliente: string;
  fecha: string;
  tecnicoNombre: string;
  metaId?: string;
}

async function getCalidadDestinatarios(): Promise<string[]> {
  const usersSnap = await getDocs(collection(db, "usuarios"));
  const destinatarios = usersSnap.docs
    .filter((d) => {
      const rol = String(d.data().role || d.data().puesto || "").toLowerCase();
      return (
        rol.includes("calidad") ||
        rol.includes("quality") ||
        rol.includes("admin") ||
        rol.includes("gerente")
      );
    })
    .map((d) => d.id);

  return destinatarios.length > 0 ? destinatarios : usersSnap.docs.map((d) => d.id);
}

/** Notifica a usuarios de calidad que un técnico marcó trabajo como realizado. */
export async function notificarCalidadRevisionPendiente(
  params: NotificarRevisionCalidadParams
): Promise<void> {
  const { worksheetDocId, equipmentId, cliente, fecha, tecnicoNombre, metaId } =
    params;

  const destinatarios = await getCalidadDestinatarios();
  if (destinatarios.length === 0) return;

  const title = "Trabajo por revisar";
  const body = `${tecnicoNombre} marcó como realizado: ID ${equipmentId || "—"} — ${cliente || "Sin cliente"} (${fecha || "sin fecha"})`;

  const docId = `revision_${worksheetDocId || metaId || equipmentId}`;

  await setDoc(
    doc(db, "notificaciones", docId),
    {
      type: "info",
      title,
      body,
      autorNombre: tecnicoNombre,
      readBy: [],
      destinatarios,
      timestamp: serverTimestamp(),
      global: false,
      tipo: "revision_calidad",
      fcmSent: false,
      worksheetDocId,
      equipmentId,
      cliente,
      fecha,
      metaId: metaId || null,
      fcmData: {
        title,
        body,
        type: "info",
        equipmentId: equipmentId || "",
        cliente: cliente || "",
        fecha: fecha || "",
        url: "/drive",
      },
    },
    { merge: true }
  );
}
