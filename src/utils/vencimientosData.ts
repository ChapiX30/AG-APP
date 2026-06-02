import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  addMonths,
  addYears,
  differenceInDays,
  format,
  isValid,
  parseISO,
} from 'date-fns';

export type VencimientoStatus = 'vencido' | 'critico' | 'proximo' | 'vigente';

export interface EquipoVencimiento {
  id: string;
  equipoId: string;
  descripcion: string;
  cliente: string;
  fechaCalibracion: string;
  frecuencia: string;
  fechaVencimiento: Date;
  diasRestantes: number;
  status: VencimientoStatus;
  emailResponsable?: string;
  responsableInterno?: string;
  responsableUid?: string;
}

export interface UsuariosMaps {
  porNombre: Record<string, { email: string; uid: string }>;
  porEmail: Record<string, string>;
}

export function calcularFechaVencimiento(
  fechaStr: string,
  frecuenciaStr: string
): Date | null {
  if (!fechaStr || !frecuenciaStr) return null;
  try {
    const fechaBase = parseISO(fechaStr);
    if (!isValid(fechaBase)) return null;
    const freqLower = frecuenciaStr.toLowerCase();

    if (freqLower.includes('1 año') || freqLower.includes('anual')) return addYears(fechaBase, 1);
    if (freqLower.includes('2 años') || freqLower.includes('bianual')) return addYears(fechaBase, 2);
    if (freqLower.includes('3 años')) return addYears(fechaBase, 3);
    if (freqLower.includes('3 meses') || freqLower.includes('trimestral')) return addMonths(fechaBase, 3);
    if (freqLower.includes('6 meses') || freqLower.includes('semestral')) return addMonths(fechaBase, 6);

    return addYears(fechaBase, 1);
  } catch {
    return null;
  }
}

function fechaFromFirestore(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date && isValid(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }
  return null;
}

export function statusFromDias(dias: number): VencimientoStatus {
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'critico';
  if (dias <= 60) return 'proximo';
  return 'vigente';
}

export async function cargarMapasUsuarios(): Promise<UsuariosMaps> {
  const usuariosSnapshot = await getDocs(collection(db, 'usuarios'));
  const porNombre: Record<string, { email: string; uid: string }> = {};
  const porEmail: Record<string, string> = {};

  usuariosSnapshot.forEach((docSnap) => {
    const d = docSnap.data();
    const nombre = String(d.name || d.nombre || '').trim();
    const email = String(d.email || d.correo || '').trim().toLowerCase();
    if (nombre) {
      const llave = nombre.toLowerCase().replace(/\s+/g, '');
      porNombre[llave] = { email, uid: docSnap.id };
    }
    if (email) porEmail[email] = docSnap.id;
  });

  return { porNombre, porEmail };
}

export async function cargarEquiposVencimiento(): Promise<EquipoVencimiento[]> {
  const [mapUsuarios, clientesSnapshot, querySnapshot] = await Promise.all([
    cargarMapasUsuarios(),
    getDocs(collection(db, 'clientes')),
    getDocs(query(collection(db, 'hojasDeTrabajo'), orderBy('fecha', 'desc'))),
  ]);

  const mapClienteResponsable: Record<string, string> = {};
  clientesSnapshot.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.nombre && d.responsable) {
      mapClienteResponsable[String(d.nombre).trim()] = String(d.responsable);
    }
  });

  const listaProcesada: EquipoVencimiento[] = [];
  const hoy = new Date();
  const equiposProcesados = new Set<string>();

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const rawId = data.id || data.certificado;
    const identificadorUnico = rawId ? String(rawId).trim() : null;

    if (identificadorUnico && equiposProcesados.has(identificadorUnico)) return;
    if (identificadorUnico) equiposProcesados.add(identificadorUnico);

    const fechaVenc =
      fechaFromFirestore(data._fechaVencimiento) ||
      calcularFechaVencimiento(data.fecha, data.frecuenciaCalibracion);

    if (!fechaVenc) return;

    const dias = differenceInDays(fechaVenc, hoy);
    const status = statusFromDias(dias);

    const nombreCliente = String(data.cliente || data.clienteNombre || '').trim();
    const nombreResponsable = mapClienteResponsable[nombreCliente] || null;
    const llaveBusqueda = nombreResponsable
      ? nombreResponsable.toLowerCase().replace(/\s+/g, '')
      : '';
    const responsableInfo = llaveBusqueda ? mapUsuarios.porNombre[llaveBusqueda] : undefined;

    listaProcesada.push({
      id: docSnap.id,
      equipoId: identificadorUnico || 'S/N',
      descripcion: data.equipo || data.nombre || 'Equipo sin nombre',
      cliente: nombreCliente || 'Cliente desconocido',
      fechaCalibracion: data.fecha,
      frecuencia: data.frecuenciaCalibracion,
      fechaVencimiento: fechaVenc,
      diasRestantes: dias,
      status,
      emailResponsable: responsableInfo?.email || '',
      responsableInterno: nombreResponsable || 'Sin asignar',
      responsableUid: responsableInfo?.uid,
    });
  });

  listaProcesada.sort((a, b) => a.diasRestantes - b.diasRestantes);
  return listaProcesada;
}

export function formatFechaVencimiento(fecha: Date): string {
  return format(fecha, 'dd/MM/yyyy');
}

export const STATUS_LABELS: Record<VencimientoStatus, string> = {
  vencido: 'Vencido',
  critico: 'Crítico',
  proximo: 'Próximo',
  vigente: 'Vigente',
};
