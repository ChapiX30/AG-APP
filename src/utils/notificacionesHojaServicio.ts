import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface GrupoEquipoCorreo {
  tecnico: string;
  equipos: { id: string; estado: 'CALIBRADO' | 'RECHAZADO' }[];
}

export interface EnviarHojaServicioCorreoParams {
  folio: string;
  empresa: string;
  fecha: string;
  correoCliente: string;
  contacto?: string;
  tecnicoResponsable: string;
  calidadServicio: string;
  comentarios?: string;
  pdfURL: string;
  storagePath: string;
  gruposEquipos: GrupoEquipoCorreo[];
  totalEquipos: number;
  autorNombre?: string;
  autorUid?: string;
}

export async function encolarCorreoHojaServicio(
  params: EnviarHojaServicioCorreoParams
): Promise<string> {
  const email = params.correoCliente?.trim().toLowerCase();
  if (!email) {
    throw new Error('Indica el correo del cliente en la sección de datos.');
  }

  const safeFolio = (params.folio || 'sin_folio').replace(/[/\s#]/g, '_');
  const docId = `hsdg_${safeFolio}_${Date.now()}`;

  const mensajeCorto = `Se completó el servicio en ${params.empresa} el día indicado. Adjuntamos la hoja de servicio firmada (folio ${params.folio}).`;

  await setDoc(doc(db, 'alertasHojaServicio', docId), {
    folio: params.folio,
    empresa: params.empresa,
    fecha: params.fecha,
    destinatarioEmail: email,
    destinatarioNombre: params.contacto || params.empresa,
    contacto: params.contacto || '',
    tecnicoResponsable: params.tecnicoResponsable,
    calidadServicio: params.calidadServicio,
    comentarios: params.comentarios || '',
    pdfURL: params.pdfURL,
    storagePath: params.storagePath,
    gruposEquipos: params.gruposEquipos,
    totalEquipos: params.totalEquipos,
    mensajeCorto,
    autorNombre: params.autorNombre || 'Sistema AG',
    autorUid: params.autorUid || '',
    estado: 'pendiente',
    creadoEn: serverTimestamp(),
  });

  return docId;
}
