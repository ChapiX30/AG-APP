import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
// --- CORRECCIÓN AQUÍ: Agregado FileBarChart a los imports ---
import {
  Calendar, AlertTriangle, CheckCircle, Clock, Plus, Search,
  Activity, Wrench, ArrowLeft, X,
  User, FileText, ChevronRight, Truck, ClipboardCheck, Ban,
  DollarSign, History, Edit3, UploadCloud, ExternalLink, AlertOctagon, File,
  FileBarChart, Sparkles, Loader2, Download, Trash2, RefreshCw
} from 'lucide-react';

import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { FirebaseError } from 'firebase/app';
import { collection, getDocs, getDoc, setDoc, doc, query, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../utils/firebase';
import {
  buildCertificateStoragePath,
  canUploadPatronCertificate,
  canViewPatronCertificate,
  patronHasCertificate,
  listPatronCertificados,
  type PatronCertificadoListItem,
  validateCertificateFile,
} from '../utils/certificateAccess';
import {
  certificateLoadErrorMessage,
  resolvePatronCertificadoPreviewUrl,
  type PatronCertificateMeta,
} from '../utils/patronCertificadoUrl';
import { patronesData } from './patronesData';
import { notificarPrestamoPatronPlanta } from '../utils/notificacionesPrestamoPatron';
import { sortPatronesPorNoControl, suggestNextAgNoControl } from '../utils/patronCalibracion';
import { patronFirestoreDocId } from '../utils/patronLink';
import { extractPatronCertificadoFromFile } from '../utils/patronCertificadoExtract';
import {
  type PatronParteCalibracion,
  patronTienePartes,
  getPatronFechaVencimientoEfectiva,
  getPatronEstadoDesdePartes,
  actualizarParteEnPatron,
  mergePartesCalibracion,
  parteEstaVencida,
} from '../utils/patronPartes';
import toast, { Toaster } from 'react-hot-toast';
import labLogo from '../assets/lab_logo.png';

// --- 1. DEFINICIÓN DE DATOS ---

type EstadoProceso = 'operativo' | 'en_uso' | 'en_calibracion' | 'en_mantenimiento' | 'baja' | 'cuarentena' | 'programado' | 'completado' | 'fuera_servicio' | 'en_servicio' | 'en_prestamo' | 'con_falla';

export interface HistorialEntry {
  id: string;
  fecha: string;
  titulo: string;
  usuario: string;
  tipo: 'sistema' | 'flujo' | 'mantenimiento' | 'calibracion' | 'reporte';
  descripcion?: string;
  costo?: number;
  archivoUrl?: string;
}

export interface RegistroPatron {
  id?: string;
  noControl: string;
  descripcion: string;
  marca: string;
  modelo: string;
  serie: string;
  
  // Metrología
  frecuenciaMeses: number; 
  fecha?: string; 
  fechaVencimiento?: string; 
  fechaUltimaCalibracion?: string; 
  laboratorioCalibracion?: string; 
  certificadoUrl?: string;
  /** Ruta privada en Storage (no URL con token de larga duración). */
  certificadoStoragePath?: string;
  
  // Estado
  estadoProceso: EstadoProceso;
  ubicacionActual?: string; 
  ubicacion?: string; 
  usuarioAsignado?: string;
  usuarioEnUso?: string;
  
  // KPIs
  costoAcumuladoMantenimiento: number;
  historial: HistorialEntry[];
  /** Patrones divididos (ej. AG-020: 25 masas en 2 envíos). */
  partesCalibracion?: PatronParteCalibracion[];
}

const COLLECTION_NAME = "patronesCalibracion";

const parseFrecuenciaMeses = (frecuencia?: string | number): number => {
  if (typeof frecuencia === 'number' && frecuencia > 0) return frecuencia;
  if (!frecuencia) return 12;
  const m = String(frecuencia).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 12;
};

const normalizePatron = (raw: Partial<RegistroPatron> & Record<string, unknown>): RegistroPatron => {
  const noControl = String(raw.noControl || '').trim();
  return {
    noControl,
    descripcion: String(raw.descripcion || ''),
    marca: String(raw.marca || ''),
    modelo: String(raw.modelo || ''),
    serie: String(raw.serie || ''),
    frecuenciaMeses: raw.frecuenciaMeses ?? parseFrecuenciaMeses(raw.frecuencia as string | number | undefined),
    fecha: raw.fecha,
    fechaVencimiento: raw.fechaVencimiento || raw.fecha,
    fechaUltimaCalibracion: raw.fechaUltimaCalibracion,
    laboratorioCalibracion: raw.laboratorioCalibracion,
    certificadoUrl: raw.certificadoUrl,
    certificadoStoragePath: raw.certificadoStoragePath,
    estadoProceso: (raw.estadoProceso as EstadoProceso) || 'operativo',
    ubicacionActual: raw.ubicacionActual || (raw.ubicacion as string | undefined),
    ubicacion: raw.ubicacion as string | undefined,
    usuarioAsignado: raw.usuarioAsignado,
    usuarioEnUso: raw.usuarioEnUso,
    costoAcumuladoMantenimiento: raw.costoAcumuladoMantenimiento ?? 0,
    historial: raw.historial ?? [],
    partesCalibracion: Array.isArray(raw.partesCalibracion)
      ? (raw.partesCalibracion as PatronParteCalibracion[])
      : undefined,
    id: raw.id || (noControl ? patronFirestoreDocId(noControl) : undefined),
  };
};

/** Catálogo local + Firestore; el remoto gana en campos en conflicto. */
const mergePatronesInventario = (
  firebaseItems: RegistroPatron[],
  seed: RegistroPatron[],
): RegistroPatron[] => {
  const byKey = new Map<string, RegistroPatron>();
  for (const raw of seed) {
    const p = normalizePatron(raw);
    const key = p.noControl.toUpperCase();
    if (key) byKey.set(key, p);
  }
  for (const raw of firebaseItems) {
    const p = normalizePatron(raw);
    const key = p.noControl.toUpperCase();
    if (!key) continue;
    const prev = byKey.get(key);
    const partesMerged = mergePartesCalibracion(prev?.partesCalibracion, p.partesCalibracion);
    byKey.set(key, {
      ...prev,
      ...p,
      partesCalibracion: partesMerged ?? p.partesCalibracion ?? prev?.partesCalibracion,
      certificadoStoragePath: p.certificadoStoragePath || prev?.certificadoStoragePath,
      certificadoUrl: p.certificadoUrl ?? prev?.certificadoUrl,
      historial: (p.historial?.length ? p.historial : prev?.historial) ?? [],
      id: p.id || prev?.id || patronFirestoreDocId(p.noControl),
    });
  }
  return sortPatronesPorNoControl([...byKey.values()]);
};

const PLACEHOLDER_USUARIOS = new Set([
  'usuario actual',
  'usuario: actual',
  'usuario desconocido',
  'sistema',
]);

/** Nombre mostrado en historial; corrige registros legacy y extrae técnico de descripción si aplica. */
export const resolveHistorialUsuario = (usuario?: string, descripcion?: string): string => {
  const raw = (usuario || '').trim();
  if (raw && !PLACEHOLDER_USUARIOS.has(raw.toLowerCase())) return raw;

  const match = descripcion?.match(/(?:entregado a|asignado a|retirado por|usuario anterior:)\s*([^.,\n]+)/i);
  if (match?.[1]?.trim()) return match[1].trim();

  return raw || 'Registro anterior';
};

type ToastItem = { id: string; message: string; type: 'success' | 'info' | 'error' };

// --- HELPERS SEGUROS ---
const getFechaVencimiento = (item: RegistroPatron): string => getPatronFechaVencimientoEfectiva(item);
const getUbicacion = (item: RegistroPatron): string => item.ubicacionActual || item.ubicacion || 'Laboratorio';
const getUsuario = (item: RegistroPatron): string => item.usuarioEnUso || item.usuarioAsignado || 'Sin Asignar';

const formatHistorialUsuario = (usuario?: string): string => {
  const value = (usuario || '').trim();
  if (!value || value === 'Usuario Actual' || value === 'Usuario: Actual') {
    return 'Registro anterior (usuario no capturado)';
  }
  return value;
};

type CalibracionUrgency = 'vencido' | 'proximo' | 'ok' | 'sin-fecha';

const getCalibracionUrgency = (item: RegistroPatron): CalibracionUrgency => {
  if (['en_mantenimiento', 'con_falla', 'en_calibracion'].includes(item.estadoProceso)) {
    return 'proximo';
  }
  const f = getFechaVencimiento(item);
  if (!f) return 'sin-fecha';
  try {
    const days = differenceInDays(parseISO(f), new Date());
    if (days < 0) return 'vencido';
    if (days <= 30) return 'proximo';
    return 'ok';
  } catch {
    return 'sin-fecha';
  }
};

const urgencyRowClass: Record<CalibracionUrgency, string> = {
  vencido: 'border-l-4 border-l-red-500 bg-red-50/40',
  proximo: 'border-l-4 border-l-amber-400 bg-amber-50/30',
  ok: 'border-l-4 border-l-emerald-400',
  'sin-fecha': 'border-l-4 border-l-slate-200',
};

// --- 2. LÓGICA DE NEGOCIO ---

const usePatronesLogic = (actorName: string) => {
  const [data, setData] = useState<RegistroPatron[]>([]);
  const [loading, setLoading] = useState(true);

  // KPIs en tiempo real
  const stats = useMemo(() => {
    const total = data.length;
    const vencidos = data.filter(d => {
       const f = getFechaVencimiento(d);
       if(!f) return false;
       try { return differenceInDays(parseISO(f), new Date()) < 0; } catch(e){ return false; }
    }).length;
    const enMantenimiento = data.filter(d => d.estadoProceso === 'en_mantenimiento' || d.estadoProceso === 'con_falla').length;
    const enUso = data.filter(d => d.estadoProceso === 'en_servicio' || d.estadoProceso === 'en_uso').length;
    const gastoTotal = data.reduce((acc, curr) => acc + (curr.costoAcumuladoMantenimiento || 0), 0);
    return { total, vencidos, enMantenimiento, gastoTotal, enUso };
  }, [data]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, COLLECTION_NAME)); 
      const snapshot = await getDocs(q);
      const items: RegistroPatron[] = [];
      snapshot.forEach(d => items.push(normalizePatron({ id: d.id, ...(d.data() as Record<string, unknown>) })));
      setData(mergePatronesInventario(items, patronesData as RegistroPatron[]));
    } catch (error) {
      console.error("Error Firebase:", error);
      setData(mergePatronesInventario([], patronesData as RegistroPatron[]));
      toast.error('No se pudo sincronizar con Firestore. Mostrando inventario local.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const registrarEvento = async (patron: RegistroPatron, titulo: string, descripcion: string, tipo: HistorialEntry['tipo'], updates: Partial<RegistroPatron>, costo: number = 0) => {
    const docId = patron.id || (patron.noControl ? patronFirestoreDocId(patron.noControl) : '');
    if (!docId || !patron.noControl?.trim()) {
      toast.error('No se puede actualizar: falta No. de control del patrón.');
      return false;
    }
    
    const nuevoHistorial: HistorialEntry = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      titulo,
      usuario: actorName || 'Sistema',
      tipo,
      descripcion,
      costo
    };

    const updatePayload: any = {
      ...updates,
      costoAcumuladoMantenimiento: (patron.costoAcumuladoMantenimiento || 0) + costo,
      historial: [nuevoHistorial, ...(patron.historial || [])]
    };

    // Sincronización Legacy
    if (updates.fechaVencimiento) updatePayload.fecha = updates.fechaVencimiento;
    if (updates.usuarioAsignado) updatePayload.usuarioEnUso = updates.usuarioAsignado;
    if (updates.ubicacionActual) updatePayload.ubicacion = updates.ubicacionActual;

    try {
      await setDoc(doc(db, COLLECTION_NAME, docId), updatePayload, { merge: true });
      await fetchData(); 
      return true;
    } catch (e) {
      toast.error('Error al guardar cambios. Verifique permisos y conexión.');
      return false;
    }
  };

  const agregarPatron = async (datos: Partial<RegistroPatron>): Promise<boolean> => {
    const noControl = (datos.noControl || '').trim().toUpperCase();
    if (!noControl) {
      toast.error('El No. de control es obligatorio (ej. AG-064).');
      return false;
    }
    if (!(datos.descripcion || '').trim()) {
      toast.error('La descripción del patrón es obligatoria.');
      return false;
    }
    if (data.some(p => p.noControl.trim().toUpperCase() === noControl)) {
      toast.error(`Ya existe un patrón con No. de control ${noControl}.`);
      return false;
    }

    const docId = patronFirestoreDocId(noControl);
    const fechaVenc = datos.fechaVencimiento || datos.fecha || '';
    const nuevo: RegistroPatron = normalizePatron({
      noControl,
      descripcion: (datos.descripcion || '').trim(),
      marca: (datos.marca || '').trim(),
      modelo: (datos.modelo || '').trim(),
      serie: (datos.serie || '').trim(),
      frecuenciaMeses: datos.frecuenciaMeses ?? 12,
      fecha: fechaVenc || undefined,
      fechaVencimiento: fechaVenc || undefined,
      estadoProceso: 'operativo',
      ubicacionActual: 'Laboratorio',
      ubicacion: 'Laboratorio',
      costoAcumuladoMantenimiento: 0,
      historial: [{
        id: crypto.randomUUID(),
        fecha: new Date().toISOString(),
        titulo: 'Alta en inventario',
        usuario: actorName || 'Sistema',
        tipo: 'sistema',
        descripcion: `Patrón ${noControl} registrado en el programa de calibración.`,
      }],
      id: docId,
    });

    try {
      await setDoc(doc(db, COLLECTION_NAME, docId), nuevo, { merge: true });
      await fetchData();
      toast.success(`Patrón ${noControl} agregado correctamente.`);
      return true;
    } catch (e) {
      console.error('Error al agregar patrón:', e);
      toast.error('No se pudo guardar el patrón. Verifique permisos y conexión.');
      return false;
    }
  };

  const editarDatosBase = async (id: string, datos: Partial<RegistroPatron>) => {
      try {
          const payload = { ...datos };
          if (datos.fechaVencimiento) payload.fecha = datos.fechaVencimiento;
          await setDoc(doc(db, COLLECTION_NAME, id), payload, { merge: true });
          await fetchData();
          return true;
      } catch(e) {
        toast.error('No se pudieron guardar los datos del patrón.');
        return false;
      }
  };

  const guardarRecepcionCertificado = async (
    patron: RegistroPatron,
    formData: {
      parteId?: string;
      laboratorio?: string;
      certificado?: string;
      nuevaFecha?: string;
    },
    file: File,
  ): Promise<boolean> => {
    const docId = patron.id || patronFirestoreDocId(patron.noControl);
    const parteId = formData.parteId?.trim();

    if (patronTienePartes(patron) && !parteId) {
      toast.error('Seleccione Parte 1 o Parte 2 antes de confirmar.');
      return false;
    }

    const validationError = validateCertificateFile(file);
    if (validationError) {
      toast.error(validationError);
      return false;
    }

    let certificadoStoragePath: string;
    try {
      certificadoStoragePath = buildCertificateStoragePath(docId, file, parteId);
      await uploadBytes(ref(storage, certificadoStoragePath), file, {
        contentType: file.type || 'application/pdf',
      });
    } catch (error) {
      console.error('Error subiendo certificado:', error);
      toast.error('No se pudo subir el archivo a Storage.');
      return false;
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const snap = await getDoc(doc(db, COLLECTION_NAME, docId));
    const remoto = snap.exists()
      ? normalizePatron({ id: docId, ...(snap.data() as Record<string, unknown>) })
      : normalizePatron(patron);

    let partes = remoto.partesCalibracion ?? patron.partesCalibracion;
    const parte = partes?.find((p) => p.id === parteId);

    if (patronTienePartes(patron) && parteId && partes) {
      partes = actualizarParteEnPatron(partes, parteId, {
        estadoParte: 'operativo',
        fechaVencimiento: formData.nuevaFecha || undefined,
        fechaUltimaCalibracion: today,
        laboratorioCalibracion: formData.laboratorio?.trim(),
        noCertificado: formData.certificado?.trim(),
        certificadoStoragePath,
      });
    }

    const fechas = (partes ?? [])
      .map((p) => p.fechaVencimiento)
      .filter(Boolean)
      .sort() as string[];
    const fechaVenc = formData.nuevaFecha || fechas[0] || remoto.fechaVencimiento;

    const tituloRec = parte ? `Calibración — ${parte.etiqueta}` : 'Calibración Finalizada';
    const descripcion = `Lab: ${formData.laboratorio || '—'} | Cert: ${formData.certificado || '—'}`;

    const nuevoHistorial: HistorialEntry = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      titulo: tituloRec,
      usuario: actorName || 'Sistema',
      tipo: 'calibracion',
      descripcion,
      costo: 0,
    };

    const payload: Record<string, unknown> = {
      noControl: remoto.noControl || patron.noControl,
      descripcion: remoto.descripcion || patron.descripcion,
      estadoProceso: partes ? getPatronEstadoDesdePartes(partes) : 'operativo',
      ubicacionActual: 'Laboratorio',
      ubicacion: 'Laboratorio',
      fechaUltimaCalibracion: today,
      laboratorioCalibracion: formData.laboratorio?.trim() || remoto.laboratorioCalibracion,
      certificadoStoragePath,
      certificadoUrl: deleteField(),
      fechaVencimiento: fechaVenc,
      fecha: fechaVenc,
      historial: [nuevoHistorial, ...(remoto.historial || [])],
      costoAcumuladoMantenimiento: remoto.costoAcumuladoMantenimiento ?? 0,
    };
    if (partes) payload.partesCalibracion = partes;

    try {
      await setDoc(doc(db, COLLECTION_NAME, docId), payload, { merge: true });
      await fetchData();
      toast.success('Certificado guardado y visible en Calibraciones.');
      return true;
    } catch (e) {
      console.error('Error guardando recepción:', e);
      toast.error('El archivo se subió pero no se guardó en el patrón. Revise permisos Firestore.');
      return false;
    }
  };

  const eliminarCertificadoPatron = async (
    patron: RegistroPatron,
    cert: PatronCertificadoListItem,
  ): Promise<boolean> => {
    const docId = patron.id || patronFirestoreDocId(patron.noControl);
    const path = cert.certificadoStoragePath?.trim();
    if (!path) return false;

    const ok = window.confirm(
      `¿Eliminar el certificado "${cert.label}"?\n\nPodrá subir otro archivo después. El archivo en la nube también se borrará.`,
    );
    if (!ok) return false;

    try {
      await deleteObject(ref(storage, path));
    } catch (e) {
      console.warn('Storage delete (puede no existir):', e);
    }

    const snap = await getDoc(doc(db, COLLECTION_NAME, docId));
    const remoto = snap.exists()
      ? normalizePatron({ id: docId, ...(snap.data() as Record<string, unknown>) })
      : normalizePatron(patron);

    let partes = remoto.partesCalibracion;
    if (cert.scope === 'parte' && cert.parteId && partes) {
      partes = partes.map((p) => {
        if (p.id !== cert.parteId) return p;
        const { certificadoStoragePath: _removed, ...rest } = p;
        return rest;
      });
    }

    const otroPath = partes?.find((p) => p.certificadoStoragePath?.trim())?.certificadoStoragePath;
    const payload: Record<string, unknown> = {
      historial: [
        {
          id: crypto.randomUUID(),
          fecha: new Date().toISOString(),
          titulo: 'Certificado eliminado',
          usuario: actorName || 'Sistema',
          tipo: 'calibracion',
          descripcion: `Se quitó el archivo de ${cert.label} para permitir una nueva carga.`,
        },
        ...(remoto.historial || []),
      ],
    };

    if (partes) payload.partesCalibracion = partes;

    if (remoto.certificadoStoragePath === path) {
      if (otroPath) payload.certificadoStoragePath = otroPath;
      else payload.certificadoStoragePath = deleteField();
      payload.certificadoUrl = deleteField();
    }

    try {
      await setDoc(doc(db, COLLECTION_NAME, docId), payload, { merge: true });
      await fetchData();
      toast.success('Certificado eliminado. Ya puede subir otro.');
      return true;
    } catch (e) {
      console.error('Error eliminando certificado:', e);
      toast.error('No se pudo actualizar el patrón en Firestore.');
      return false;
    }
  };

  return {
    data,
    loading,
    stats,
    registrarEvento,
    editarDatosBase,
    agregarPatron,
    guardarRecepcionCertificado,
    eliminarCertificadoPatron,
  };
};

// --- 3. COMPONENTES VISUALES ---

const StatusBadge = ({ fecha, estado }: { fecha?: string, estado: EstadoProceso }) => {
  if (estado === 'en_mantenimiento') return <Badge color="orange" icon={Wrench} label="En Taller" />;
  if (estado === 'con_falla') return <Badge color="red" icon={AlertOctagon} label="Falla Reportada" />;
  if (estado === 'en_calibracion') return <Badge color="blue" icon={Activity} label="Calibrando" />;
  if (estado === 'baja' || estado === 'fuera_servicio') return <Badge color="gray" icon={Ban} label="Baja" />;

  if (!fecha) return <Badge color="gray" label="Sin Fecha" />;

  try {
      const f = parseISO(fecha);
      if (!isValid(f)) return <Badge color="gray" label="Error Fecha" />;
      const days = differenceInDays(f, new Date());
      if (days < 0) return <Badge color="red" icon={AlertTriangle} label={`Vencido (${Math.abs(days)}d)`} />;
      if (days <= 30) return <Badge color="yellow" icon={Clock} label="Por Vencer" />;
      return <Badge color="green" icon={CheckCircle} label="Vigente" />;
  } catch (error) { return <Badge color="gray" label="Error" />; }
};

const Badge = ({ color, icon: Icon, label }: any) => {
    const colors: any = {
        red: "bg-red-100 text-red-700 border-red-200",
        green: "bg-emerald-100 text-emerald-700 border-emerald-200",
        blue: "bg-blue-100 text-blue-700 border-blue-200",
        orange: "bg-orange-100 text-orange-700 border-orange-200",
        yellow: "bg-amber-100 text-amber-700 border-amber-200",
        gray: "bg-gray-100 text-gray-600 border-gray-200",
    };
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 w-fit whitespace-nowrap ${colors[color] || colors.gray}`}>
            {Icon && <Icon className="w-3 h-3" />}
            {label}
        </span>
    );
};

const KPICard = ({ title, value, icon: Icon, color, subtext }: any) => {
    const iconStyles: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-600 shadow-inner',
        red: 'bg-red-50 text-red-600 shadow-inner',
        indigo: 'bg-indigo-50 text-indigo-600 shadow-inner',
        green: 'bg-emerald-50 text-emerald-600 shadow-inner',
    };
    return (
        <div className="group bg-white/90 backdrop-blur-sm p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.06)] flex items-center justify-between hover:shadow-[0_8px_30px_rgba(0,80,216,0.12)] hover:-translate-y-0.5 transition-all duration-300">
            <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{title}</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1.5 tracking-tight">{value}</p>
                {subtext && <p className="text-xs text-slate-400 mt-1.5">{subtext}</p>}
            </div>
            <div className={`p-3.5 rounded-xl ${iconStyles[color] || iconStyles.blue} group-hover:scale-105 transition-transform`}>
                <Icon className="w-6 h-6" />
            </div>
        </div>
    );
};

// --- 4. COMPONENTES DE ARCHIVOS ---

const CertificadoFileUploader = ({
  onFileSelect,
  onExtracted,
  frecuenciaMeses = 12,
}: {
  onFileSelect: (f: File | null) => void;
  onExtracted?: (data: {
    laboratorio?: string;
    certificado?: string;
    nuevaFecha?: string;
    confianza: number;
  }) => void;
  frecuenciaMeses?: number;
}) => {
    const [fileName, setFileName] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        const validationError = validateCertificateFile(file);
        if (validationError) {
          toast.error(validationError);
          e.target.value = '';
          setFileName(null);
          onFileSelect(null);
          return;
        }
        setFileName(file.name);
        onFileSelect(file);

        if (onExtracted) {
          setScanning(true);
          try {
            const extracted = await extractPatronCertificadoFromFile(file, frecuenciaMeses);
            if (extracted.confianza > 0) {
              onExtracted({
                laboratorio: extracted.laboratorio,
                certificado: extracted.noCertificado,
                nuevaFecha: extracted.fechaVencimiento,
                confianza: extracted.confianza,
              });
              toast.success(
                `Datos leídos del certificado (${extracted.confianza}% — ${extracted.metodo})`,
                { duration: 4000 },
              );
            } else {
              toast('No se detectaron datos claros. Complete los campos manualmente.', { icon: 'ℹ️' });
            }
          } catch (err) {
            console.warn('Lectura certificado:', err);
            toast.error('No se pudo leer el archivo. Ingrese los datos manualmente.');
          } finally {
            setScanning(false);
          }
        }
    };

    return (
        <div className="relative">
          <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer group [color-scheme:light] ${scanning ? 'border-[#2464A3] bg-blue-50/80' : 'border-slate-300 hover:border-[#2464A3] hover:bg-slate-50'}`}>
            <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={handleChange}
                disabled={scanning}
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            />
            <div className={`p-3 rounded-full mb-3 transition-transform ${scanning ? 'bg-[#2464A3]/15' : 'bg-blue-50 group-hover:scale-105'}`}>
                {scanning ? (
                  <Loader2 className="w-6 h-6 text-[#2464A3] animate-spin" />
                ) : (
                  <UploadCloud className={`w-6 h-6 ${fileName ? 'text-[#2464A3]' : 'text-slate-400'}`} />
                )}
            </div>
            {scanning ? (
              <p className="text-sm font-semibold text-[#2464A3]">Leyendo certificado…</p>
            ) : fileName ? (
                <div>
                    <p className="text-sm font-bold text-slate-800 break-all">{fileName}</p>
                    <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center justify-center gap-1">
                      <Sparkles className="w-3 h-3" /> Listo — datos detectados si el PDF lo permite
                    </p>
                </div>
            ) : (
                <div>
                    <p className="text-sm font-semibold text-slate-800">Sube el certificado (PDF o imagen)</p>
                    <p className="text-xs text-slate-500 mt-1">Lectura automática de laboratorio, no. certificado y fechas</p>
                </div>
            )}
          </div>
        </div>
    );
};

const FilePreviewModal = ({
  meta,
  onClose,
}: {
  meta: PatronCertificateMeta;
  onClose: () => void;
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await resolvePatronCertificadoPreviewUrl(meta);
        if (!cancelled) setPreviewUrl(url);
      } catch (err) {
        if (!cancelled) {
          const message = certificateLoadErrorMessage(err);
          setError(message);
          toast.error(message, { id: `cert-preview-${meta.patronId}` });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [meta.patronId, meta.certificadoStoragePath, meta.certificadoUrl]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full h-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={18}/> Visualizador de Documento</h3>
          <div className="flex gap-2">
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 font-medium">
                <ExternalLink size={14} /> Abrir en nueva pestaña
              </a>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-red-500 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-gray-200 relative flex items-center justify-center">
          {loading && <p className="text-sm text-gray-600">Cargando documento…</p>}
          {error && <p className="text-sm text-red-600 px-6 text-center">{error}</p>}
          {previewUrl && !loading && (
            <iframe src={previewUrl} className="w-full h-full" title="Document Preview" />
          )}
        </div>
      </motion.div>
    </div>
  );
};

// --- 5. PANTALLA PRINCIPAL ---

export const ProgramaCalibracionScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user } = useAuth();
  const actorName = user?.name?.trim() || user?.email?.split('@')[0] || 'Usuario';
  const actorUid = user?.id || '';
  const { data, loading, stats, registrarEvento, editarDatosBase, agregarPatron, guardarRecepcionCertificado, eliminarCertificadoPatron } = usePatronesLogic(actorName);
  
  const [tab, setTab] = useState<'todo' | 'alertas' | 'servicio'>('todo');
  const [busqueda, setBusqueda] = useState('');
  
  const [selectedItem, setSelectedItem] = useState<RegistroPatron | null>(null);
  const [workflowAction, setWorkflowAction] = useState<any>(null);
  const [workflowOpts, setWorkflowOpts] = useState<{ parteId?: string } | null>(null);

  const handlePatronAction = (action: string, opts?: { parteId?: string }) => {
    setWorkflowOpts(opts ?? null);
    setWorkflowAction(action);
  };

  const descargarCertificado = async (patron: RegistroPatron, cert: PatronCertificadoListItem) => {
    if (!patron.id || !cert.certificadoStoragePath) return;
    try {
      const url = cert.certificadoStoragePath
        ? await getDownloadURL(ref(storage, cert.certificadoStoragePath))
        : await resolvePatronCertificadoPreviewUrl({
            patronId: patron.id,
            certificadoStoragePath: cert.certificadoStoragePath,
            certificadoUrl: cert.certificadoUrl,
          });
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = (cert.certificadoStoragePath.split('.').pop() || 'pdf').toLowerCase();
      const safeLabel = cert.label.replace(/[^\w\-]+/g, '_').slice(0, 40);
      const filename = `${patron.noControl}_${safeLabel}.${ext}`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast.success('Descarga iniciada');
    } catch (e) {
      console.error('Descarga certificado:', e);
      toast.error('No se pudo descargar el archivo.');
    }
  };

  useEffect(() => {
    setSelectedItem((current) => {
      if (!current) return current;
      const fresh = data.find(
        (d) =>
          (current.id && d.id === current.id) ||
          d.noControl.trim().toUpperCase() === current.noControl.trim().toUpperCase(),
      );
      return fresh || current;
    });
  }, [data]);

  // Filtrado
  const filteredData = useMemo(() => {
    let result = data;
    if (tab === 'alertas') {
      result = result.filter(d => {
        const f = getFechaVencimiento(d);
        let vencido = false;
        try { vencido = f ? differenceInDays(parseISO(f), new Date()) <= 30 : false; } catch {}
        return vencido || d.estadoProceso === 'en_mantenimiento' || d.estadoProceso === 'en_calibracion' || d.estadoProceso === 'con_falla';
      });
    } else if (tab === 'servicio') {
        result = result.filter(d => ['en_uso', 'en_servicio', 'en_prestamo'].includes(d.estadoProceso));
    }

    if (busqueda) {
      const lower = busqueda.toLowerCase();
      result = result.filter(d => 
        (d.descripcion || '').toLowerCase().includes(lower) || 
        (d.noControl || '').toLowerCase().includes(lower) || 
        (d.serie || '').toLowerCase().includes(lower)
      );
    }
    
    return sortPatronesPorNoControl(result);
  }, [data, tab, busqueda]);

  const handleProcessWorkflow = async (formData: any, file?: File) => {
      if (!workflowAction) return;

      if (workflowAction === 'agregar_patron') {
        const ok = await agregarPatron(formData);
        if (ok) setWorkflowAction(null);
        return;
      }

      if(!selectedItem) return;

      let success = false;
      const today = format(new Date(), 'yyyy-MM-dd');

      if (workflowAction === 'calibrar_recepcion') {
        if (!canUploadPatronCertificate(user)) {
          toast.error('No tiene permiso para subir certificados.');
          return;
        }
        if (!file) {
          toast.error('Adjunte el certificado (PDF o imagen) antes de confirmar.');
          return;
        }
        const ok = await guardarRecepcionCertificado(selectedItem, formData, file);
        if (ok) {
          setWorkflowAction(null);
          setWorkflowOpts(null);
        }
        return;
      }

      let certificadoStoragePath: string | undefined = selectedItem.certificadoStoragePath;

      if (file) {
        if (!canUploadPatronCertificate(user)) {
          toast.error('No tiene permiso para subir certificados.');
          return;
        }
        const validationError = validateCertificateFile(file);
        if (validationError) {
          toast.error(validationError);
          return;
        }
        try {
          const storagePath = buildCertificateStoragePath(
            selectedItem.id!,
            file,
            formData.parteId as string | undefined,
          );
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file, {
            contentType: file.type || 'application/pdf',
          });
          certificadoStoragePath = storagePath;
        } catch (error) {
          console.error('Error subiendo certificado:', error);
          const detail =
            error instanceof FirebaseError
              ? (error.code === 'storage/unauthorized'
                  ? 'Sin permiso en Storage (rol o reglas Firebase).'
                  : error.message)
              : 'Verifique conexión y permisos.';
          toast.error(`No se pudo subir el certificado. ${detail}`);
          return;
        }
      }

      switch(workflowAction) {
          case 'calibrar_envio': {
              const parteIdEnvio = formData.parteId as string | undefined;
              const parteEnv = selectedItem.partesCalibracion?.find(p => p.id === parteIdEnvio);
              const descEnvio = parteEnv
                ? `${parteEnv.etiqueta}: Proveedor ${formData.proveedor}`
                : `Proveedor: ${formData.proveedor}`;
              let updatesEnvio: Partial<RegistroPatron> = {
                estadoProceso: 'en_calibracion',
                ubicacionActual: 'Externo',
              };
              if (patronTienePartes(selectedItem) && parteIdEnvio && selectedItem.partesCalibracion) {
                const partes = actualizarParteEnPatron(selectedItem.partesCalibracion, parteIdEnvio, {
                  estadoParte: 'en_calibracion',
                });
                updatesEnvio = { ...updatesEnvio, partesCalibracion: partes, estadoProceso: getPatronEstadoDesdePartes(partes) };
              }
              success = await registrarEvento(selectedItem, 'Envío a Calibración', descEnvio, 'flujo', updatesEnvio);
              break;
          }
          case 'reportar_falla':
              success = await registrarEvento(selectedItem, 'Falla Reportada', `Detalle: ${formData.motivo}`, 'reporte', { estadoProceso: 'con_falla' });
              break;
          case 'mantenimiento_inicio':
               success = await registrarEvento(selectedItem, 'Entrada a Mantenimiento', `Diagnóstico: ${formData.motivo}`, 'mantenimiento', { estadoProceso: 'en_mantenimiento', ubicacionActual: 'Taller' });
               break;
          case 'mantenimiento_fin':
               success = await registrarEvento(selectedItem, 'Mantenimiento Finalizado', formData.acciones, 'mantenimiento', { estadoProceso: 'operativo', ubicacionActual: 'Laboratorio' }, Number(formData.costo));
               break;
          case 'asignar':
               success = await registrarEvento(selectedItem, 'Asignación Manual', `Entregado a: ${formData.usuario}`, 'flujo', { estadoProceso: 'en_servicio', usuarioAsignado: formData.usuario, ubicacionActual: 'Planta' });
               if (success && selectedItem.id && formData.usuario?.trim()) {
                 try {
                   await notificarPrestamoPatronPlanta({
                     patronId: selectedItem.id,
                     noControl: selectedItem.noControl,
                     descripcion: selectedItem.descripcion,
                     tecnicoNombre: formData.usuario.trim(),
                     autorNombre: actorName,
                     autorUid,
                   });
                   toast.success(`Patrón asignado a ${formData.usuario}. Notificaciones enviadas al técnico y a calidad.`);
                 } catch (err) {
                   console.error('Error enviando notificaciones de préstamo:', err);
                   toast.error('Equipo asignado, pero falló el envío de notificaciones.');
                 }
               }
               break;
          case 'liberar':
               success = await registrarEvento(selectedItem, 'Devolución de Equipo', 'Retornado a laboratorio.', 'flujo', { estadoProceso: 'operativo', usuarioAsignado: '', usuarioEnUso: '', ubicacionActual: 'Laboratorio' });
               break;
          case 'editar_base':
               success = await editarDatosBase(selectedItem.id!, formData);
               break;
      }

      if (success) {
          setWorkflowAction(null);
      }
  };

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-gradient-to-b from-slate-100 via-slate-50 to-white font-sans text-gray-800 pb-10">
      <Toaster position="top-center" toastOptions={{ duration: 3200, style: { borderRadius: 12, fontSize: 13, fontWeight: 600 } }} />
      
      {/* HEADER */}
      <header className="bg-gradient-to-r from-[#2464A3] via-[#2a70b4] to-[#1d5082] border-b border-[#1a5085]/40 sticky top-0 z-20 shadow-[0_4px_24px_rgba(29,80,130,0.35)]">
        <div className="max-w-7xl mx-auto px-4 h-[4.25rem] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-white/15 rounded-full text-white/90 transition-all hover:shadow-md" aria-label="Volver al menú">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center justify-center w-11 h-11 rounded-xl bg-white/95 shadow-lg ring-1 ring-white/30 p-1.5">
              <img
                src={labLogo}
                alt="Equipos y Servicios AG"
                className="w-full h-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">Equipos y Servicios AG</p>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Programa de Calibración</h1>
              <p className="text-xs text-white/80 hidden sm:block">Patrones, vencimientos y mantenimiento</p>
            </div>
          </div>
          <div className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg bg-white/90 shadow-md p-1">
            <img src={labLogo} alt="Logo AG" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-7">
        {/* DASHBOARD KPIS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <KPICard title="Inventario Total" value={stats.total} icon={FileBarChart} color="blue" />
            <KPICard title="Atención Requerida" value={stats.vencidos} icon={AlertTriangle} color="red" subtext="Vencidos o Fallas" />
            <KPICard title="En Planta" value={stats.enUso} icon={User} color="indigo" subtext="Préstamos activos" />
            <KPICard title="Gasto Acumulado" value={`$${stats.gastoTotal.toLocaleString()}`} icon={DollarSign} color="green" subtext="Mantenimiento y Calib." />
        </div>

        {/* CONTROLES */}
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6 bg-white/95 backdrop-blur-sm p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
             <TabButton active={tab === 'alertas'} onClick={() => setTab('alertas')} label="Prioridad / Alertas" count={stats.vencidos + stats.enMantenimiento} />
             <TabButton active={tab === 'servicio'} onClick={() => setTab('servicio')} label="En Planta" count={stats.enUso} />
             <TabButton active={tab === 'todo'} onClick={() => setTab('todo')} label="Todo el Inventario" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto md:items-center">
            <button
              type="button"
              onClick={() => setWorkflowAction('agregar_patron')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2464A3] text-white rounded-xl text-sm font-semibold shadow-md hover:bg-[#1d5082] transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Agregar patrón
            </button>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Buscar control, serie, descripción..." 
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#2464A3]/30 focus:border-[#2464A3] outline-none shadow-inner transition-all"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* TABLA */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.07)] border border-slate-200/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gradient-to-r from-slate-50 to-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Activo</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Ubicación / Lab</th>
                    <th className="px-6 py-4">Vencimiento</th>
                    <th className="px-6 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                       <tr><td colSpan={5} className="p-10 text-center text-slate-400">Cargando inventario...</td></tr>
                  ) : filteredData.length === 0 ? (
                       <tr><td colSpan={5} className="p-10 text-center text-slate-400">No hay patrones en esta vista. Prueba &quot;Todo el Inventario&quot; o agrega uno nuevo.</td></tr>
                  ) : filteredData.map((item) => {
                    const fechaVenc = getFechaVencimiento(item);
                    const urgency = getCalibracionUrgency(item);
                    return (
                        <tr 
                            key={item.id || item.noControl} 
                            onClick={() => setSelectedItem(item)}
                            className={`hover:bg-blue-50/70 cursor-pointer transition-all duration-200 group ${urgencyRowClass[urgency]}`}
                        >
                        <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{item.descripcion}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{item.marca} • <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded-md">{item.noControl}</span></div>
                        </td>
                        <td className="px-6 py-4">
                            <StatusBadge fecha={fechaVenc} estado={item.estadoProceso} />
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                             <LocationDisplay item={item} />
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                             {fechaVenc ? (isValid(parseISO(fechaVenc)) ? format(parseISO(fechaVenc), 'dd MMM yyyy', {locale: es}) : '-') : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                             <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#2464A3] ml-auto" />
                        </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
      </main>

      {/* --- PANEL LATERAL (EXPEDIENTE) --- */}
      <SidePanel
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        onAction={handlePatronAction}
        authUser={user}
        canManageCert={canUploadPatronCertificate(user)}
        onDownloadCert={descargarCertificado}
        onDeleteCert={(patron, cert) => eliminarCertificadoPatron(patron, cert)}
      />

      {/* --- MODAL DE FLUJO --- */}
      <AnimatePresence>
        {workflowAction && (workflowAction === 'agregar_patron' || selectedItem) && (
            <WorkflowDialog 
                action={workflowAction} 
                item={selectedItem}
                suggestedNoControl={suggestNextAgNoControl(data)}
                initialParteId={workflowOpts?.parteId}
                onClose={() => { setWorkflowAction(null); setWorkflowOpts(null); }}
                onConfirm={handleProcessWorkflow}
            />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- 6. COMPONENTES DETALLADOS ---

const LocationDisplay = ({ item }: { item: RegistroPatron }) => {
    if (item.estadoProceso === 'en_calibracion') {
        return <div className="flex items-center gap-1.5 text-blue-600"><Truck className="w-3.5 h-3.5" /> Externo</div>;
    }
    if (['en_uso', 'en_servicio', 'en_prestamo'].includes(item.estadoProceso)) {
        return <div className="flex items-center gap-1.5 text-indigo-600 font-medium"><User className="w-3.5 h-3.5" /> {getUsuario(item)}</div>;
    }
    return <span className="text-gray-500">{getUbicacion(item)}</span>;
}

// --- PANEL LATERAL CON TABS ---
const SidePanel = ({
  selectedItem,
  onClose,
  onAction,
  authUser,
  canManageCert,
  onDownloadCert,
  onDeleteCert,
}: {
  selectedItem: RegistroPatron;
  onClose: () => void;
  onAction: (action: string, opts?: { parteId?: string }) => void;
  authUser: ReturnType<typeof useAuth>['user'];
  canManageCert: boolean;
  onDownloadCert: (patron: RegistroPatron, cert: PatronCertificadoListItem) => void;
  onDeleteCert: (patron: RegistroPatron, cert: PatronCertificadoListItem) => void | Promise<boolean>;
}) => {
    const [panelTab, setPanelTab] = useState<'info' | 'calib' | 'mant'>('info');
    const [previewMeta, setPreviewMeta] = useState<PatronCertificateMeta | null>(null);
    const canViewCert = canViewPatronCertificate(authUser);
    const hasCert = selectedItem ? patronHasCertificate(selectedItem) : false;
    const certificados = selectedItem ? listPatronCertificados(selectedItem) : [];

    return (
        <AnimatePresence>
        {selectedItem && (
            <>
                <div className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[2px] transition-opacity" onClick={onClose} />
                <motion.div 
                    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 bottom-0 w-full md:w-[650px] bg-white z-50 shadow-[-8px_0_40px_rgba(15,23,42,0.15)] flex flex-col border-l border-slate-200/80"
                >
                    {/* Header Panel */}
                    <div className="p-6 bg-gradient-to-r from-white to-slate-50 border-b border-slate-200 flex justify-between items-start sticky top-0 z-10 shadow-sm">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-2xl font-bold text-gray-900">{selectedItem.noControl}</h2>
                                <StatusBadge fecha={getFechaVencimiento(selectedItem)} estado={selectedItem.estadoProceso} />
                            </div>
                            <p className="text-gray-500 font-medium">{selectedItem.descripcion}</p>
                            <p className="text-xs text-gray-400 mt-1">{selectedItem.marca} {selectedItem.modelo} • SN: {selectedItem.serie}</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => onAction('editar_base')} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit3 className="w-5 h-5"/></button>
                             <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><X className="w-5 h-5"/></button>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-6 py-4 bg-slate-50/90 border-b border-slate-200">
                        <SmartActionButton item={selectedItem} setAction={onAction} />
                    </div>

                    {/* Tabs Navigation */}
                    <div className="flex border-b border-slate-200 px-6 bg-white">
                        <PanelTabBtn active={panelTab === 'info'} onClick={() => setPanelTab('info')} label="Ficha General" icon={FileText} />
                        <PanelTabBtn active={panelTab === 'calib'} onClick={() => setPanelTab('calib')} label="Calibraciones" icon={ClipboardCheck} />
                        <PanelTabBtn active={panelTab === 'mant'} onClick={() => setPanelTab('mant')} label="Mantenimiento" icon={Wrench} />
                    </div>

                    {/* Content Scrollable */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-50/80 to-white">
                        
                        {/* TAB 1: INFO GENERAL */}
                        {panelTab === 'info' && (
                            <div className="space-y-6">
                                {patronTienePartes(selectedItem) && selectedItem.partesCalibracion && (
                                  <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm">
                                    <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                      Calibración por partes
                                    </h3>
                                    <p className="text-xs text-slate-600 mb-3">Este patrón se envía y recibe en varios certificados (ej. masas por lotes).</p>
                                    <div className="space-y-2">
                                      {selectedItem.partesCalibracion.map((parte) => {
                                        const fv = parte.fechaVencimiento || '';
                                        const vencida = parteEstaVencida(parte);
                                        return (
                                          <div
                                            key={parte.id}
                                            className={`rounded-xl border p-3 text-sm ${parte.estadoParte === 'en_calibracion' ? 'border-blue-300 bg-blue-50' : vencida ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-slate-50/80'}`}
                                          >
                                            <div className="flex justify-between items-start gap-2">
                                              <span className="font-bold text-slate-900">{parte.etiqueta}</span>
                                              {parte.estadoParte === 'en_calibracion' && (
                                                <span className="text-[10px] font-bold uppercase text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">En calibración</span>
                                              )}
                                            </div>
                                            {parte.descripcion && <p className="text-xs text-slate-600 mt-1">{parte.descripcion}</p>}
                                            {parte.serie && <p className="text-xs font-mono text-slate-500 mt-1">Serie: {parte.serie}</p>}
                                            {parte.cantidadMasas != null && (
                                              <p className="text-xs text-slate-500">{parte.cantidadMasas} masas</p>
                                            )}
                                            {fv && (
                                              <p className={`text-xs mt-1 font-medium ${vencida ? 'text-red-700' : 'text-slate-600'}`}>
                                                Vence: {isValid(parseISO(fv)) ? format(parseISO(fv), 'dd MMM yyyy', { locale: es }) : fv}
                                              </p>
                                            )}
                                            {parte.certificadoStoragePath && (
                                              <p className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> Certificado cargado
                                                {parte.noCertificado ? ` · ${parte.noCertificado}` : ''}
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Especificaciones</h3>
                                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                        <InfoRow label="Marca" val={selectedItem.marca} />
                                        <InfoRow label="Modelo" val={selectedItem.modelo} />
                                        <InfoRow label="Serie" val={selectedItem.serie} />
                                        <InfoRow label="Frecuencia" val={`${selectedItem.frecuenciaMeses || 12} Meses`} />
                                        <InfoRow label="Ubicación" val={getUbicacion(selectedItem)} />
                                        <InfoRow label="Responsable" val={getUsuario(selectedItem)} />
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><History className="w-4 h-4"/> Historial Completo</h3>
                                    <Timeline historial={selectedItem.historial} />
                                </div>
                            </div>
                        )}

                        {/* TAB 2: CALIBRACIONES */}
                        {panelTab === 'calib' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <DateCard 
                                        label="Última Calibración" 
                                        date={selectedItem.fechaUltimaCalibracion} 
                                        color="blue" 
                                        sub={selectedItem.laboratorioCalibracion || "No registrado"} 
                                    />
                                    <DateCard 
                                        label="Próximo Vencimiento" 
                                        date={getFechaVencimiento(selectedItem)} 
                                        color={differenceInDays(parseISO(getFechaVencimiento(selectedItem) || ''), new Date()) < 0 ? 'red' : 'green'} 
                                    />
                                </div>

                                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
                                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-500"/> Certificado Vigente
                                    </h3>
                                    {hasCert ? (
                                        <div className="space-y-2">
                                          {certificados.map((cert) => (
                                            <div
                                              key={cert.key}
                                              className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2"
                                            >
                                              <div className="flex items-center gap-3 min-w-0">
                                                <div className="bg-white p-2 rounded text-blue-500 border border-blue-100 shrink-0">
                                                  <File size={20} />
                                                </div>
                                                <div className="text-sm min-w-0 flex-1">
                                                  <p className="font-medium text-blue-900">{cert.label}</p>
                                                  <p className="text-xs text-blue-600">
                                                    {cert.noCertificado ? `No. ${cert.noCertificado}` : 'Documento en Storage'}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="flex flex-wrap gap-1.5 justify-end">
                                                {canViewCert && (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setPreviewMeta({
                                                        patronId: selectedItem.id!,
                                                        certificadoStoragePath: cert.certificadoStoragePath,
                                                        certificadoUrl: cert.certificadoUrl,
                                                      })
                                                    }
                                                    className="px-2.5 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-50"
                                                  >
                                                    Ver
                                                  </button>
                                                )}
                                                {canViewCert && (
                                                  <button
                                                    type="button"
                                                    onClick={() => onDownloadCert(selectedItem, cert)}
                                                    className="px-2.5 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 inline-flex items-center gap-1"
                                                  >
                                                    <Download className="w-3.5 h-3.5" /> Bajar
                                                  </button>
                                                )}
                                                {canManageCert && (
                                                  <>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        onAction('calibrar_recepcion', {
                                                          parteId: cert.parteId || selectedItem.partesCalibracion?.[0]?.id,
                                                        })
                                                      }
                                                      className="px-2.5 py-1.5 bg-white text-[#2464A3] border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-50 inline-flex items-center gap-1"
                                                    >
                                                      <RefreshCw className="w-3.5 h-3.5" /> Cambiar
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => onDeleteCert(selectedItem, cert)}
                                                      className="px-2.5 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-50 inline-flex items-center gap-1"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" /> Quitar
                                                    </button>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                                            <p className="text-sm text-gray-400 mb-2">No hay certificado digital asociado</p>
                                            <button onClick={() => onAction('calibrar_recepcion')} className="text-blue-600 text-xs font-bold hover:underline">
                                                Actualizar Datos
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Historial de Calibración</h3>
                                    <Timeline historial={selectedItem.historial} filterType="calibracion" />
                                </div>
                            </div>
                        )}

                        {/* TAB 3: MANTENIMIENTO */}
                        {panelTab === 'mant' && (
                            <div className="space-y-6">
                                <div className="flex gap-3">
                                    <button onClick={() => onAction('reportar_falla')} className="flex-1 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition">
                                        <AlertOctagon className="w-4 h-4" /> Reportar Falla
                                    </button>
                                    <button onClick={() => onAction('mantenimiento_inicio')} className="flex-1 py-3 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-100 transition">
                                        <Wrench className="w-4 h-4" /> Registrar Mtto.
                                    </button>
                                </div>

                                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold">Costo Acumulado</p>
                                        <p className="text-2xl font-bold text-gray-900">${selectedItem.costoAcumuladoMantenimiento || 0}</p>
                                    </div>
                                    <div className="bg-green-50 p-3 rounded-full text-green-600"><DollarSign className="w-6 h-6"/></div>
                                </div>

                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bitácora de Reparaciones</h3>
                                    <Timeline historial={selectedItem.historial} filterType={['mantenimiento', 'reporte']} />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* MODAL DE PREVISUALIZACIÓN */}
                    {previewMeta && selectedItem.id && canViewCert && (
                        <FilePreviewModal
                          meta={previewMeta}
                          onClose={() => setPreviewMeta(null)}
                        />
                    )}
                </motion.div>
            </>
        )}
        </AnimatePresence>
    );
};

// --- HELPERS UI ---

const Timeline = ({ historial, filterType }: any) => {
    const items = useMemo(() => {
        if (!historial) return [];
        if (!filterType) return historial;
        const types = Array.isArray(filterType) ? filterType : [filterType];
        return historial.filter((h: any) => types.includes(h.tipo));
    }, [historial, filterType]);

    if (items.length === 0) return <p className="text-sm text-gray-400 italic">No hay registros disponibles.</p>;

    return (
        <div className="relative pl-4 border-l-2 border-slate-200 space-y-5">
            {items.map((h: any, i: number) => (
                <div key={h.id || i} className="relative pl-6 pb-1">
                    <div className={`absolute -left-[9px] top-2 w-4 h-4 rounded-full border-2 border-white shadow-sm
                        ${h.tipo === 'calibracion' ? 'bg-blue-500' : 
                          h.tipo === 'mantenimiento' ? 'bg-orange-500' : 
                          h.tipo === 'reporte' ? 'bg-red-500' : 'bg-slate-400'}`} 
                    />
                    <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start gap-3">
                        <span className="text-sm font-bold text-slate-900">{h.titulo}</span>
                        <span className="text-xs text-slate-400 shrink-0">{isValid(parseISO(h.fecha)) ? format(parseISO(h.fecha), 'dd MMM yy', { locale: es }) : ''}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{h.descripcion}</p>
                    {h.costo > 0 && (
                        <div className="mt-2 inline-block bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-md border border-emerald-100 font-mono">
                            Costo: ${h.costo}
                        </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <User className="w-3 h-3"/> {formatHistorialUsuario(h.usuario)}
                    </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const PanelTabBtn = ({ active, onClick, label, icon: Icon }: any) => (
    <button 
        onClick={onClick}
        className={`flex-1 py-3.5 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${active ? 'border-[#2464A3] text-[#2464A3] bg-blue-50/40' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/60'}`}
    >
        <Icon className="w-4 h-4" /> {label}
    </button>
);

const DateCard = ({ label, date, color, sub }: any) => {
    const formatted = date && isValid(parseISO(date)) ? format(parseISO(date), 'dd MMM yyyy', { locale: es }) : '--';
    const colorClasses: any = {
        red: 'bg-red-50 text-red-700 border-red-200',
        green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return (
        <div className={`p-4 rounded-2xl border shadow-sm ${colorClasses[color]} flex flex-col items-center text-center hover:shadow-md transition-shadow`}>
            <span className="text-xs font-bold uppercase opacity-70 mb-1">{label}</span>
            <span className="text-lg font-bold">{formatted}</span>
            {sub && <span className="text-xs mt-1 opacity-80">{sub}</span>}
        </div>
    );
};

const InfoRow = ({ label, val }: any) => (
    <div>
        <span className="block text-gray-400 text-xs uppercase font-bold mb-0.5">{label}</span> 
        <span className="font-medium text-gray-800">{val || '-'}</span>
    </div>
);

const SmartActionButton = ({ item, setAction }: any) => {
    const f = getFechaVencimiento(item);
    let isExpired = false;
    try { isExpired = f ? differenceInDays(parseISO(f), new Date()) <= 0 : false; } catch(e){}

    if (patronTienePartes(item) && item.partesCalibracion?.some(p => p.estadoParte === 'en_calibracion')) {
        return <BigBtn onClick={() => setAction('calibrar_recepcion')} icon={ClipboardCheck} label="Recibir certificado (parte en lab)" color="green" />;
    }

    if (item.estadoProceso === 'en_calibracion') {
        return <BigBtn onClick={() => setAction('calibrar_recepcion')} icon={ClipboardCheck} label="Recibir y Subir Certificado" color="green" />;
    }
    if (item.estadoProceso === 'en_mantenimiento') {
        return <BigBtn onClick={() => setAction('mantenimiento_fin')} icon={CheckCircle} label="Finalizar Mantenimiento" color="green" />;
    }
    if (item.estadoProceso === 'con_falla') {
        return <BigBtn onClick={() => setAction('mantenimiento_inicio')} icon={Wrench} label="Enviar a Taller" color="orange" />;
    }
    if (['en_servicio', 'en_uso', 'en_prestamo'].includes(item.estadoProceso)) {
        return <BigBtn onClick={() => setAction('liberar')} icon={ArrowLeft} label="Devolución a Lab" color="indigo" />;
    }
    if (isExpired && item.estadoProceso === 'operativo') {
        return <BigBtn onClick={() => setAction('calibrar_envio')} icon={AlertTriangle} label="Enviar a Calibrar" color="red" animate />;
    }
    return <BigBtn onClick={() => setAction('asignar')} icon={User} label="Asignación Manual" color="blue" />;
};

const BigBtn = ({ onClick, icon: Icon, label, color, animate }: any) => {
    const colors: any = {
        blue: 'bg-blue-600 hover:bg-blue-700 text-white',
        green: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        red: 'bg-red-600 hover:bg-red-700 text-white',
        indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        orange: 'bg-orange-600 hover:bg-orange-700 text-white',
    };
    return (
        <button onClick={onClick} className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 ${colors[color]} ${animate ? 'animate-pulse' : ''}`}>
            <Icon className="w-5 h-5" /> {label}
        </button>
    )
};

const TabButton = ({ active, onClick, label, count }: any) => (
    <button onClick={onClick} className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${active ? 'bg-[#2464A3] text-white shadow-md shadow-blue-500/25' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
        {label} {count > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>{count}</span>}
    </button>
);

const WORKFLOW_INPUT_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-sm ' +
  'focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/25 focus:outline-none transition-colors [color-scheme:light]';

const WORKFLOW_TEXTAREA_CLASS =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm ' +
  'focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/25 focus:outline-none [color-scheme:light]';

const WorkflowDialog = ({ action, item, onClose, onConfirm, suggestedNoControl, initialParteId }: any) => {
    const buildInitialForm = () => {
      if (action === 'agregar_patron') {
        return { noControl: suggestedNoControl || '', descripcion: '', marca: '', modelo: '', serie: '', frecuenciaMeses: 12, fechaVencimiento: '' };
      }
      const primeraParte = item?.partesCalibracion?.[0]?.id || '';
      const parteEnCalib = item?.partesCalibracion?.find((p: PatronParteCalibracion) => p.estadoParte === 'en_calibracion')?.id;
      return {
        ...item,
        nuevaFecha: getFechaVencimiento(item),
        parteId: initialParteId || parteEnCalib || primeraParte,
        laboratorio: item?.laboratorioCalibracion || '',
        certificado: '',
        proveedor: '',
      };
    };

    const [form, setForm] = useState<any>(buildInitialForm);

    useEffect(() => {
      setForm(buildInitialForm());
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicio al abrir otro flujo
    }, [action, initialParteId, item?.id]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleConfirm = async () => {
        setIsUploading(true);
        await onConfirm(form, selectedFile);
        setIsUploading(false);
    };

    const renderContent = () => {
        switch(action) {
            case 'agregar_patron':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600 leading-relaxed">
                          Registra un nuevo patrón en el inventario. El código suele seguir la serie <span className="font-mono font-semibold text-[#2464A3]">AG-###</span>.
                        </p>
                        <Input
                          label="No. de control"
                          placeholder="AG-064"
                          val={form.noControl}
                          mono
                          hint="Código único del activo (ej. AG-064)"
                          onChange={(v: string) => setForm({...form, noControl: v.toUpperCase()})}
                        />
                        <Input label="Descripción" placeholder="Nombre o tipo de equipo" val={form.descripcion} onChange={(v: string) => setForm({...form, descripcion: v})} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Marca" placeholder="Mitutoyo" val={form.marca} onChange={(v: string) => setForm({...form, marca: v})} />
                            <Input label="Modelo" placeholder="Modelo" val={form.modelo} onChange={(v: string) => setForm({...form, modelo: v})} />
                            <Input label="Serie" placeholder="Número de serie" val={form.serie} onChange={(v: string) => setForm({...form, serie: v})} />
                            <Input label="Frecuencia (meses)" type="number" placeholder="12" val={form.frecuenciaMeses} onChange={(v: string) => setForm({...form, frecuenciaMeses: Number(v) || 12})} />
                        </div>
                        <Input label="Fecha de vencimiento (opcional)" type="date" val={form.fechaVencimiento} onChange={(v: string) => setForm({...form, fechaVencimiento: v})} />
                    </div>
                );
            case 'editar_base':
                return (
                    <div className="space-y-3">
                        <Input label="Descripción" val={form.descripcion} onChange={(v: string) => setForm({...form, descripcion: v})} />
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Marca" val={form.marca} onChange={(v: string) => setForm({...form, marca: v})} />
                            <Input label="Modelo" val={form.modelo} onChange={(v: string) => setForm({...form, modelo: v})} />
                            <Input label="Serie" val={form.serie} onChange={(v: string) => setForm({...form, serie: v})} />
                            <Input label="No. Control" val={form.noControl} onChange={(v: string) => setForm({...form, noControl: v})} />
                        </div>
                        <Input label="Frecuencia (Meses)" type="number" val={form.frecuenciaMeses} onChange={(v: string) => setForm({...form, frecuenciaMeses: Number(v)})} />
                        <Input label="Fecha Vencimiento" type="date" val={form.fechaVencimiento} onChange={(v: string) => setForm({...form, fechaVencimiento: v})} />
                    </div>
                );
            case 'reportar_falla':
                 return (
                     <div className="space-y-3">
                         <div className="bg-red-50 p-3 rounded-lg flex gap-2 text-red-800 text-sm mb-2">
                             <AlertOctagon className="w-5 h-5 flex-shrink-0" />
                             <p>Esto marcará el equipo como "Con Falla" y alertará a mantenimiento.</p>
                         </div>
                         <label className="block text-sm font-medium text-gray-700">Detalle de la Falla</label>
                         <textarea className={WORKFLOW_TEXTAREA_CLASS} rows={3} placeholder="Describe el problema..." onChange={e => setForm({...form, motivo: e.target.value})}></textarea>
                     </div>
                 );
            case 'mantenimiento_inicio':
                return (
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Diagnóstico Inicial</label>
                        <textarea className={WORKFLOW_TEXTAREA_CLASS} rows={3} placeholder="¿Qué se va a revisar?" onChange={e => setForm({...form, motivo: e.target.value})}></textarea>
                    </div>
                );
            case 'mantenimiento_fin':
                return (
                    <div className="space-y-3">
                        <Input label="Acciones Realizadas" val={form.acciones} onChange={(v: string) => setForm({...form, acciones: v})} />
                        <Input label="Costo Total ($)" type="number" val={form.costo} onChange={(v: string) => setForm({...form, costo: v})} />
                    </div>
                );
            case 'calibrar_envio':
                return (
                  <div className="space-y-4">
                    {patronTienePartes(item) && item.partesCalibracion && (
                      <ParteCalibracionPicker
                        partes={item.partesCalibracion}
                        value={form.parteId}
                        onChange={(parteId) => setForm({ ...form, parteId })}
                      />
                    )}
                    <Input label="Proveedor de servicio" placeholder="Laboratorio externo" val={form.proveedor} onChange={(v: string) => setForm({...form, proveedor: v})} />
                  </div>
                );
            case 'calibrar_recepcion':
                 return (
                    <div className="space-y-4">
                        {patronTienePartes(item) && item.partesCalibracion && (
                          <ParteCalibracionPicker
                            partes={item.partesCalibracion}
                            value={form.parteId}
                            onChange={(parteId) => setForm({ ...form, parteId })}
                          />
                        )}
                        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-900">
                          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                          <p>Al subir el PDF, el sistema intenta llenar laboratorio, certificado y fechas automáticamente.</p>
                        </div>
                        <CertificadoFileUploader
                          frecuenciaMeses={item?.frecuenciaMeses || 12}
                          onFileSelect={setSelectedFile}
                          onExtracted={(d) => setForm((f: Record<string, unknown>) => ({
                            ...f,
                            laboratorio: d.laboratorio || f.laboratorio,
                            certificado: d.certificado || f.certificado,
                            nuevaFecha: d.nuevaFecha || f.nuevaFecha,
                          }))}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Laboratorio" placeholder="Ej. Mitutoyo" val={form.laboratorio} onChange={(v: string) => setForm({...form, laboratorio: v})} />
                            <Input label="No. certificado" placeholder="ABC-123" val={form.certificado} onChange={(v: string) => setForm({...form, certificado: v})} />
                        </div>
                        <div className="rounded-xl bg-blue-50/90 border border-blue-100 p-4 [color-scheme:light]">
                             <Input label="Próxima calibración / vencimiento" type="date" val={form.nuevaFecha} onChange={(v: string) => setForm({...form, nuevaFecha: v})} />
                             <p className="text-xs text-blue-700 mt-2">Si queda vacío, se estima según la frecuencia del patrón ({item?.frecuenciaMeses || 12} meses).</p>
                        </div>
                    </div>
                 );
            case 'asignar':
                return <Input label="Nombre del Técnico" val={form.usuario} onChange={(v: string) => setForm({...form, usuario: v})} />;
            default: return <p>Confirmar acción...</p>;
        }
    };

    const getTitle = () => {
        const titles: any = {
            agregar_patron: 'Agregar patrón al inventario',
            editar_base: 'Editar Datos Maestros',
            reportar_falla: 'Reportar Incidencia',
            mantenimiento_inicio: 'Iniciar Reparación',
            mantenimiento_fin: 'Finalizar Mantenimiento',
            calibrar_envio: 'Enviar a Calibración',
            calibrar_recepcion: 'Recepción de Certificado',
            asignar: 'Préstamo Manual',
            liberar: 'Devolución'
        };
        return titles[action] || 'Acción';
    };

    const isAddPatron = action === 'agregar_patron';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="[color-scheme:light] bg-white rounded-2xl shadow-[0_24px_64px_rgba(15,23,42,0.28)] w-full max-w-lg overflow-hidden border border-slate-200"
            >
                <div className={`px-6 py-4 border-b flex justify-between items-start gap-3 ${isAddPatron ? 'bg-gradient-to-r from-[#2464A3] to-[#1d5082] border-[#1a5085]/30' : 'bg-slate-50 border-slate-200'}`}>
                    <div>
                      <h3 className={`font-bold text-lg tracking-tight ${isAddPatron ? 'text-white' : 'text-slate-900'}`}>{getTitle()}</h3>
                      {isAddPatron && (
                        <p className="text-xs text-white/80 mt-0.5">Complete los datos del nuevo activo</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className={`p-2 rounded-lg transition-colors shrink-0 ${isAddPatron ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}
                      aria-label="Cerrar"
                    >
                      <X className="w-5 h-5"/>
                    </button>
                </div>
                <div className="p-6 max-h-[min(70vh,520px)] overflow-y-auto bg-white">
                    {renderContent()}
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isUploading}
                        className="px-5 py-2.5 bg-[#2464A3] text-white rounded-xl text-sm font-bold hover:bg-[#1d5082] shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                    >
                        {isUploading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {isUploading ? 'Guardando…' : isAddPatron ? 'Agregar patrón' : 'Confirmar'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const ParteCalibracionPicker = ({
  partes,
  value,
  onChange,
}: {
  partes: PatronParteCalibracion[];
  value?: string;
  onChange: (id: string) => void;
}) => (
  <div className="space-y-2">
    <label className="block text-xs font-semibold text-slate-600">¿Qué parte registra?</label>
    <div className="grid gap-2">
      {partes.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all [color-scheme:light] ${
              active
                ? 'border-[#2464A3] bg-blue-50 ring-2 ring-[#2464A3]/20'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="font-semibold text-slate-900 text-sm">{p.etiqueta}</span>
            {p.descripcion && <span className="block text-xs text-slate-500 mt-0.5">{p.descripcion}</span>}
            {p.estadoParte === 'en_calibracion' && (
              <span className="inline-block mt-1 text-[10px] font-bold text-blue-700">En calibración</span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

const Input = ({ label, val, onChange, type = 'text', placeholder, hint, mono }: {
  label: string;
  val?: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) => (
    <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide">
          {label}
        </label>
        <input
            type={type}
            placeholder={placeholder}
            className={`${WORKFLOW_INPUT_CLASS}${mono ? ' font-mono uppercase tracking-wide' : ''}`}
            value={val ?? ''}
            onChange={e => onChange(e.target.value)}
        />
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
);