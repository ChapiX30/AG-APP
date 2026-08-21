import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import endOfWeek from 'date-fns/endOfWeek';
import getDay from 'date-fns/getDay';
import es from 'date-fns/locale/es';
import parseISO from 'date-fns/parseISO';
import differenceInDays from 'date-fns/differenceInDays';
import isValid from 'date-fns/isValid';
import addMonths from 'date-fns/addMonths';
import addWeeks from 'date-fns/addWeeks';
import addDays from 'date-fns/addDays';
import isSameDay from 'date-fns/isSameDay';
import isToday from 'date-fns/isToday';
import startOfDay from 'date-fns/startOfDay';
import endOfDay from 'date-fns/endOfDay';
import { collection, onSnapshot, query, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db, storage } from '../utils/firebase';
import { useAppDialog } from '../hooks/useAppDialog';
import { 
  Calendar as CalendarIcon, Clock, CheckCircle2,
  X, Users, ChevronLeft, ChevronRight, Search, MapPin, ShieldCheck,
  Building2, FileText, Settings, Zap, Eye, Bell, LayoutGrid, Plus, Trash2, Check, UserCheck, TableProperties,
  Upload, ExternalLink, Loader2, Filter, List
} from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import {
  AG_BRAND_BLUE,
  OPERATIONAL_SCREEN_BG,
  OperationalScreenHeader,
  OperationalScreenShell,
} from './ui/OperationalScreenShell';
import toast, { Toaster } from 'react-hot-toast';
import { buildMensajeAsignacionServicio } from '../utils/asignacionNotificacion';
import { crearNotificacionAsignacion } from '../utils/notificacionesAsignacion';
import { notificarCalidadConfirmacionAsistencia } from '../utils/notificacionesConfirmacionJunta';
import { eliminarRecordatorioConfirmacionJunta } from '../utils/notificacionesRecordatorioJunta';
import { filterVisibleUsers } from '../utils/hiddenUsers';
import {
  COLLECTION_PATRONES,
  countPatronesEnAlerta,
  getPatronFechaVencimiento,
  getPatronUrgency,
  getPatronUrgencyHex,
  getPatronUrgencyLabel,
  PATRON_ALERT_DAYS,
  sortPatronesPorVencimiento,
  isCalidadRole,
  savePatronPanelDismiss,
  shouldShowPatronVencimientosPanel,
  type PatronCalibracionRow,
  type PatronUrgency,
} from '../utils/patronCalibracion';
import {
  buildUserIdentityKeys,
  canAcknowledgeAssignedEvent,
  canEditCalendarEvents,
  canSeeAllCalendarEvents,
  getEventCreatorDisplay,
  isEdgarAmador,
  isUserAssignedToEvent,
  resolveAckUserId,
} from '../utils/calendarPermissions';
import {
  isReprogramadoEstado,
  isServicioOperativoTipo,
} from '../utils/calibrationShared.tsx';

// --- 1. CONFIGURACIÓN, TEMAS Y CONSTANTES ---

const locales = { 'es': es };
const localizer = dateFnsLocalizer({
  format, parse, startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }), getDay, locales,
});

async function notifyAsignacionServicio(uid: string, titulo: string, mensaje: string, servicioId: string) {
  await crearNotificacionAsignacion({
    uid,
    servicioId,
    titulo,
    mensaje,
    evento: 'nueva',
    autorNombre: 'Calendario',
    autorUid: '',
  });
}

const CONSTANTS = {
  estados: [
    { value: 'programado', label: 'Programado', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', eventBg: '#eff6ff', eventBorder: '#3b82f6', icon: CalendarIcon },
    { value: 'en_proceso', label: 'En Proceso', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', eventBg: '#fffbeb', eventBorder: '#f59e0b', icon: Zap },
    { value: 'finalizado', label: 'Finalizado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', eventBg: '#ecfdf5', eventBorder: '#10b981', icon: CheckCircle2 }
  ],
  tipos: [
    { value: 'calibracion', label: 'Calibración', icon: Zap, color: 'text-indigo-600 bg-indigo-50', hex: '#4f46e5' },
    { value: 'mtto_patrones', label: 'Mtto. Patrones', icon: Settings, color: 'text-rose-600 bg-rose-50', hex: '#e11d48' },
    { value: 'intralaboratorio', label: 'Intralaboratorio', icon: Users, color: 'text-teal-600 bg-teal-50', hex: '#0d9488' },
    { value: 'interlaboratorio', label: 'Interlaboratorio', icon: Building2, color: 'text-blue-600 bg-blue-50', hex: '#2464A3' },
    { value: 'actualizacion_norma', label: 'Aviso PJLA', icon: Bell, color: 'text-pink-600 bg-pink-50', hex: '#db2777' },
    { value: 'junta', label: 'Junta', icon: Users, color: 'text-purple-600 bg-purple-50', hex: '#9333ea' },
    { value: 'vuelta', label: 'Vuelta', icon: MapPin, color: 'text-orange-600 bg-orange-50', hex: '#ea580c' }
  ]
};

const PLANTILLA_PT = [
    "Seleccionar equipo para PT",
    "Conseguir / buscar equipo",
    "Cotizar compra de equipo",
    "Compra de equipo",
    "Configurar Celda a Indicator",
    "Cotización servicio calibración",
    "Envió a calibración",
    "Calibración interna / Informe",
    "Realizar estudio"
];

const PT_MAGNITUDES = ['Electrica', 'Dimensional', 'Masa', 'Fuerza', 'Presión', 'Temperatura', 'Par Torsional', 'Flujo', 'Frecuencia'];

const PT_EQUIPOS_SUGERIDOS: Record<string, string[]> = {
    Electrica: ['Hypot', 'Multímetro', 'Pinza amperimétrica', 'Decada de resistencia', 'Fuente de poder'],
    Dimensional: ['Vernier', 'Micrómetro', 'Calibrador', 'Regla', 'Bloque patrón'],
    Masa: ['Balanza', 'Pesa patrón', 'Báscula'],
    Fuerza: ['Dinamómetro', 'Celda de carga', 'Máquina universal'],
    'Presión': ['Manómetro', 'Transductor', 'Bomba calibradora'],
    Temperatura: ['Termómetro', 'Termopar', 'Baño termostático'],
    'Par Torsional': ['Torquímetro', 'Transductor de par'],
    Flujo: ['Flujómetro', 'Medidor volumétrico'],
    Frecuencia: ['Contador de frecuencia', 'Generador de señal'],
};

const formatPtEstudioLabel = (magnitud?: string, equipo?: string) => {
    const mag = (magnitud || '').trim();
    const eq = (equipo || '').trim();
    if (mag && eq) return `${mag} — ${eq}`;
    return mag || eq || '';
};

const getPtGroupKey = (ev: { magnitudPT?: string; equipoPT?: string }) => {
    const label = formatPtEstudioLabel(ev.magnitudPT, ev.equipoPT);
    return label || 'Sin Magnitud (Editar)';
};

const parsePtGroupKey = (groupKey: string) => {
    const sep = ' — ';
    const idx = groupKey.indexOf(sep);
    if (idx === -1) return { magnitud: groupKey, equipo: '' };
    return { magnitud: groupKey.slice(0, idx), equipo: groupKey.slice(idx + sep.length) };
};

// --- HELPERS DE COLORES Y USUARIOS ---
const isServicioOperativo = (tipo?: string) => isServicioOperativoTipo(tipo);

const resolveEventLugar = (ev: { ubicacion?: string; lugar?: string; direccion?: string; destino?: string }) =>
    (ev.ubicacion || ev.lugar || ev.direccion || ev.destino || '').trim();

const isEventFinalizado = (ev: { estado?: string; finalizado?: boolean }) =>
    ev.estado === 'finalizado' || ev.finalizado === true;

const getUserName = (idOrName: string, usersList: any[]) => {
    const key = String(idOrName).toLowerCase();
    const user = usersList.find((u: any) =>
        u.id === idOrName
        || String(u.email || u.correo || '').toLowerCase() === key
        || String(u.nombre || u.name || '').toLowerCase() === key,
    );
    return user ? (user.nombre || user.name || idOrName) : idOrName;
};

const getInitials = (name: string) => name ? name.substring(0, 2).toUpperCase() : '??';

const Avatar = ({ name, isEnterado }: { name: string, isEnterado?: boolean }) => (
    <div className="relative">
        <div title={name} className={`w-6 h-6 text-[10px] rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0 ${isEnterado ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
        {getInitials(name)}
        </div>
        {isEnterado && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[1px]"><CheckCircle2 size={10} className="text-emerald-500" /></div>}
    </div>
);

const addDaysNative = (dateStr: string, days: number) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
};


const getAckLabel = (tipo?: string, user?: { nombre?: string; name?: string; email?: string; correo?: string } | null) => {
    if (tipo === 'junta') return 'Asistencia confirmada';
    if (user && isEdgarAmador(user)) return 'De acuerdo';
    return 'Enterado';
};
const getAckActionLabel = (tipo?: string, user?: { nombre?: string; name?: string; email?: string; correo?: string } | null) => {
    if (tipo === 'junta') return 'Confirmar asistencia';
    if (user && isEdgarAmador(user)) return 'Estoy de acuerdo';
    return 'Confirmar enterado';
};
const getAckInviteMessage = (tipo?: string) =>
    tipo === 'junta'
        ? 'Ingresa al calendario para confirmar tu asistencia.'
        : 'Ingresa al calendario para confirmar de enterado.';

/** Avance mínimo al asignar responsable (personas no vacío) en filas PT. */
const AVANCE_CON_RESPONSABLE = 35;

const hasEvidencia = (ev: any) =>
    !!(ev?.evidenciaUrl || (Array.isArray(ev?.evidenciaUrls) && ev.evidenciaUrls.length > 0));

const hasResponsable = (ev: any) => Array.isArray(ev?.personas) && ev.personas.length > 0;

/** Prioridad: evidencia → finalizado → bump responsable → avance por fechas. */
const calculateAvance = (ev: any) => {
    if (hasEvidencia(ev)) return 100;
    if (ev.estado === 'finalizado') return 100;

    let base = 0;
    if (ev.estado === 'programado') {
        base = hasResponsable(ev) ? AVANCE_CON_RESPONSABLE : 0;
    } else {
        const start = ev.start.getTime();
        const end = ev.end.getTime();
        const now = new Date().getTime();
        if (now <= start) base = 5;
        else if (now >= end) base = 95;
        else {
            const total = end - start;
            const passed = now - start;
            base = Math.max(5, Math.min(95, Math.round((passed / total) * 100)));
        }
    }

    if (hasResponsable(ev) && base < AVANCE_CON_RESPONSABLE) return AVANCE_CON_RESPONSABLE;
    return base;
};

const getEventHexColor = (event: any) => {
    if (event.esVencimientoPatron && event.patronUrgency) {
      return getPatronUrgencyHex(event.patronUrgency as PatronUrgency);
    }
    if (event.esAlertaAutomatica || event.cliente === 'Perry Johnson Labs') return '#db2777';
    
    if (event.tipo === 'intralaboratorio' || event.tipo === 'interlaboratorio') {
        const t = event.title.toLowerCase();
        if (t.includes('seleccionar')) return '#cfd24c'; 
        if (t.includes('conseguir') || t.includes('buscar')) return '#d08ce1'; 
        if (t.includes('cotizar compra')) return '#3cf3f3'; 
        if (t.includes('compra')) return '#f1a141'; 
        if (t.includes('configurar')) return '#1f34e3'; 
        if (t.includes('cotización servicio') || t.includes('cotizacion servicio')) return '#8bc0e9'; 
        if (t.includes('envió') || t.includes('envio')) return '#fdfb23'; 
        if (t.includes('interna') || t.includes('informe')) return '#8bd980'; 
        if (t.includes('estudio')) return '#2ced2f'; 
    }
    
    const config = CONSTANTS.tipos.find(t => t.value === event.tipo);
    return config ? config.hex : '#3b82f6';
};

const isColorLight = (hex: string) => {
    const lightColors = ['#cfd24c', '#d08ce1', '#3cf3f3', '#f1a141', '#8bc0e9', '#fdfb23', '#8bd980', '#2ced2f'];
    return lightColors.includes(hex.toLowerCase());
};

// --- 2. COMPONENTE MODAL DE GESTIÓN ---

async function uploadEvidenciaServicio(servicioId: string, file: File) {
    const storageRef = ref(storage, `servicios/evidencia/${servicioId}/${Date.now()}_${file.name}`);
    const url = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, file);
        task.on('state_changed', () => {}, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
    });
    await updateDoc(doc(db, 'servicios', servicioId), {
        evidenciaUrl: url,
        evidenciaNombre: file.name,
        evidenciaFecha: new Date().toISOString(),
        estado: 'finalizado',
    });
    return url;
}

const UnifiedEventModal = ({ isOpen, onClose, event, initialData, technicalStaff, isCalidad, canEdit, currentUser, authUid }: any) => {
    const { confirm } = useAppDialog();
    const [formData, setFormData] = useState({
        titulo: '', tipo: 'intralaboratorio', fecha: '', fechaFin: '', destino: '', laboratorioRef: '', descripcion: '', 
        estado: 'programado', personas: [] as string[], magnitudPT: '', equipoPT: '', comentariosPT: '',
        ubicacion: '', horaInicio: '', horaFin: '',
    });
    const [usarPlantilla, setUsarPlantilla] = useState(false);
    const [saving, setSaving] = useState(false);
    const [marking, setMarking] = useState(false);
    const [uploadingEvidencia, setUploadingEvidencia] = useState(false);
    const [isEditingEvent, setIsEditingEvent] = useState(false);

    const isPJLA = event?.esAlertaAutomatica || event?.cliente === 'Perry Johnson Labs';
    const isAssigned = event ? isUserAssignedToEvent(currentUser, event.personas || [], authUid, technicalStaff) : false;
    const canFullEdit = canEdit && !!event && !isPJLA && (!isCalidad || isEditingEvent);
    const showDetailView = !!event && (!canFullEdit || isPJLA);
    const ackLabel = getAckLabel(event?.tipo, currentUser);
    const ackActionLabel = getAckActionLabel(event?.tipo, currentUser);
    const canAckAssigned = canAcknowledgeAssignedEvent(currentUser, event?.tipo, isAssigned);
    const creatorDisplay = event ? getEventCreatorDisplay(event, technicalStaff) : null;

    const sustaitaId = technicalStaff.find((u: any) => u.nombre?.toLowerCase().includes('sustaita'))?.id || '';

    useEffect(() => {
        if (isOpen) setIsEditingEvent(false);
    }, [isOpen, event?.id]);

    useEffect(() => {
        if (event) {
            setFormData({
                titulo: event.title || '',
                tipo: event.tipo || (isCalidad ? 'intralaboratorio' : 'junta'),
                fecha: event.start ? format(event.start, 'yyyy-MM-dd') : '',
                fechaFin: event.end ? format(event.end, 'yyyy-MM-dd') : '',
                destino: event.destino || '', laboratorioRef: event.laboratorioRef || '', descripcion: event.descripcion || '',
                estado: event.estado || 'programado', personas: event.personas || [],
                magnitudPT: event.magnitudPT || '', equipoPT: event.equipoPT || '', comentariosPT: event.comentariosPT || '',
                ubicacion: resolveEventLugar(event), horaInicio: event.horaInicio || '', horaFin: event.horaFin || '',
            });
            setUsarPlantilla(false);
        } else if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData, tipo: initialData.tipo || (isCalidad ? 'intralaboratorio' : 'junta'), personas: initialData.tipo === 'mtto_patrones' && sustaitaId ? [sustaitaId] : [] }));
            setUsarPlantilla(false);
        } else {
            setFormData({ titulo: '', tipo: isCalidad ? 'intralaboratorio' : 'junta', fecha: '', fechaFin: '', destino: '', laboratorioRef: '', descripcion: '', estado: 'programado', personas: [], magnitudPT: '', equipoPT: '', comentariosPT: '', ubicacion: '', horaInicio: '', horaFin: '' });
            setUsarPlantilla(false);
        }
    }, [event, initialData, isOpen, sustaitaId, isCalidad]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        // Sin permiso de edición: solo puede crear Juntas y Vueltas nuevas
        if (!canEdit && formData.tipo !== 'junta' && formData.tipo !== 'vuelta') return;
        if (event?.id && !canEdit) return; 
        
        setSaving(true);
        try {
            const resolvedTipo =
                formData.tipo || (isCalidad ? 'intralaboratorio' : 'junta');
            const basePayload = {
                ...formData,
                tipo: resolvedTipo,
                cliente: resolvedTipo.includes('inter') ? 'Externo' : 'Interno AG',
                prioridad: 'alta'
            };
            
            if (event?.id) {
                await updateDoc(doc(db, 'servicios', event.id), { ...basePayload, elemento: formData.titulo });
                const oldPersonas = event?.personas || [];
                const newPersonas = formData.personas.filter(pId => !oldPersonas.includes(pId));
                const mensajeAsignacion = buildMensajeAsignacionServicio({
                    titulo: formData.titulo,
                    cliente: basePayload.cliente,
                    fecha: formData.fecha,
                });
                for (const uid of newPersonas) {
                    await notifyAsignacionServicio(
                        uid,
                        'Nueva asignación en calendario',
                        `${mensajeAsignacion} ${getAckInviteMessage(resolvedTipo)}`,
                        event.id
                    );
                }
            } else {
                if (usarPlantilla && (formData.tipo === 'interlaboratorio' || formData.tipo === 'intralaboratorio')) {
                    if (!formData.magnitudPT.trim() || !formData.equipoPT.trim()) {
                        toast.error('Indica la magnitud y el equipo para la plantilla PT.');
                        setSaving(false);
                        return;
                    }
                    let curStart = formData.fecha;
                    for (const act of PLANTILLA_PT) {
                        const curEnd = addDaysNative(curStart, 2); 
                        const newPayload = { ...basePayload, titulo: act, elemento: act, fecha: curStart, fechaFin: curEnd };
                        await addDoc(collection(db, 'servicios'), { ...newPayload, enterados: [] });
                        curStart = addDaysNative(curEnd, 1); 
                    }
                    const mensajePt = buildMensajeAsignacionServicio({
                        titulo: `Estudio PT — ${formatPtEstudioLabel(formData.magnitudPT, formData.equipoPT) || formData.titulo}`,
                        cliente: basePayload.cliente,
                        fecha: formData.fecha,
                    });
                    for (const uid of formData.personas) {
                        await notifyAsignacionServicio(
                            uid,
                            'Nuevo estudio PT asignado',
                            `${mensajePt} Revisa el Gantt para ver las fechas de tus actividades.`,
                            'pt_group'
                        );
                    }
                } else {
                    const newDoc = await addDoc(collection(db, 'servicios'), { ...basePayload, elemento: formData.titulo, enterados: [] });
                    const mensajeNuevo = buildMensajeAsignacionServicio({
                        titulo: formData.titulo,
                        cliente: basePayload.cliente,
                        fecha: formData.fecha,
                    });
                    for (const uid of formData.personas) {
                        await notifyAsignacionServicio(
                            uid,
                            'Nueva asignación en calendario',
                            `${mensajeNuevo} ${getAckInviteMessage(resolvedTipo)}`,
                            newDoc.id
                        );
                    }
                }
            }
            onClose();
        } catch (error) { console.error(error); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (canEdit && event?.id && await confirm({ message: '¿Eliminar esta actividad?', variant: 'danger', confirmLabel: 'Eliminar' })) {
            await deleteDoc(doc(db, 'servicios', event.id));
            onClose();
        }
    };

    const resolveCurrentAckUserId = () => resolveAckUserId(currentUser, authUid, technicalStaff);

    const userHasAcknowledged = (enterados: string[] = []) => {
        const keys = buildUserIdentityKeys(currentUser, authUid, technicalStaff);
        return enterados.some(e => keys.has(String(e).toLowerCase()));
    };

    const handleMarcarEnterado = async () => {
        const ackUserId = resolveCurrentAckUserId();
        if (!event?.id || !ackUserId || !isAssigned || !canAckAssigned) return;
        setMarking(true);
        try {
            const enteradosActuales: string[] = event.enterados || [];
            if (!userHasAcknowledged(enteradosActuales)) {
                const enteradosAt = { ...(event.enteradosAt || {}), [ackUserId]: new Date().toISOString() };
                await updateDoc(doc(db, 'servicios', event.id), {
                    enterados: [...enteradosActuales, ackUserId],
                    enteradosAt,
                });
                const confirmadoNombre = getUserName(ackUserId, technicalStaff);
                try {
                    await notificarCalidadConfirmacionAsistencia({
                        servicioId: event.id,
                        eventoTitulo: event.title || formData.titulo || 'Actividad',
                        eventoFecha: event.start ? format(event.start, 'dd/MM/yyyy', { locale: es }) : formData.fecha,
                        confirmadoPorNombre: confirmadoNombre,
                        confirmadoPorUid: ackUserId,
                    });
                } catch (notifyErr) {
                    console.error('Error notificando confirmación a calidad:', notifyErr);
                }
                try {
                    await eliminarRecordatorioConfirmacionJunta(event.id, ackUserId);
                } catch {
                    /* recordatorio opcional */
                }
                toast.success(event.tipo === 'junta' ? 'Asistencia confirmada' : 'Confirmación registrada (enterado)');
                onClose();
            }
        } catch (error) {
            console.error(error);
            toast.error('No se pudo registrar la confirmación');
        }
        finally { setMarking(false); }
    };

    const statusConfig = CONSTANTS.estados.find(e => e.value === (event?.estado || formData.estado)) || CONSTANTS.estados[0];
    const StatusIcon = statusConfig.icon;
    const yaEstaEnterado = userHasAcknowledged(event?.enterados);
    const isPT = event && (event.tipo === 'interlaboratorio' || event.tipo === 'intralaboratorio');
    const canUploadEvidencia = isPT && event?.id && (canEdit || isUserAssignedToEvent(currentUser, event.personas || [], authUid, technicalStaff));

    const handleEvidenciaFile = async (file: File | undefined) => {
        if (!file || !event?.id) return;
        setUploadingEvidencia(true);
        try {
            await uploadEvidenciaServicio(event.id, file);
            onClose();
        } catch (error) { console.error(error); }
        finally { setUploadingEvidencia(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                <div className={`px-6 py-4 border-b flex justify-between items-center ${isPJLA ? 'bg-pink-50 border-pink-100' : showDetailView ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-slate-200'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {isPJLA && <span className="bg-pink-100 text-pink-700 border border-pink-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Bell size={10}/> PJLA Alert</span>}
                            {showDetailView && !isPJLA && <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Eye size={10}/> Solo Lectura</span>}
                            {event && isAssigned && !isPJLA && (
                                yaEstaEnterado ? (
                                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10}/> {ackLabel}</span>
                                ) : (
                                    <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Clock size={10}/> Pendiente confirmación</span>
                                )
                            )}
                            {event && !isPJLA && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                                    <StatusIcon size={10} /> {statusConfig.label}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">{event ? (showDetailView ? event.title : 'Editar Actividad') : 'Nueva Programación'}</h3>
                    </div>
                    <div className="flex gap-2">
                        {showDetailView && isCalidad && canEdit && !isPJLA && (
                            <button type="button" onClick={() => setIsEditingEvent(true)} className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center gap-1">
                                <Settings size={14}/> Editar
                            </button>
                        )}
                        {canFullEdit && isCalidad && isEditingEvent && (
                            <button type="button" onClick={() => setIsEditingEvent(false)} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors flex items-center gap-1">
                                <Eye size={14}/> Ver detalle
                            </button>
                        )}
                        {canFullEdit && <button type="button" onClick={handleDelete} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={18}/></button>}
                        <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-xl transition-colors"><X size={18}/></button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    {showDetailView ? (
                        <div className="space-y-4">
                            {(isServicioOperativo(event.tipo) || resolveEventLugar(event) || event.horaInicio || event.horaFin) && (
                                <div className="space-y-3">
                                    {event.cliente && !['Interno', 'Interno AG'].includes(event.cliente) && (
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Cliente</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                                                <Building2 size={14} className="text-blue-500"/> {event.cliente}
                                            </div>
                                        </div>
                                    )}
                                    {resolveEventLugar(event) && (
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Lugar</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                                                <MapPin size={14} className="text-rose-500 shrink-0"/> {resolveEventLugar(event)}
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Hora inicio</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                                                <Clock size={14} className="text-blue-500 shrink-0"/> {event.horaInicio || '—'}
                                            </div>
                                        </div>
                                        <div className={`p-3 rounded-2xl border ${isEventFinalizado(event) ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                            <p className={`text-[10px] font-bold uppercase mb-1 tracking-widest ${isEventFinalizado(event) ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                Hora fin{isEventFinalizado(event) ? ' (finalizado)' : ''}
                                            </p>
                                            <div className={`flex items-center gap-2 font-bold text-sm ${isEventFinalizado(event) ? 'text-emerald-800' : 'text-slate-700'}`}>
                                                <CheckCircle2 size={14} className={`shrink-0 ${isEventFinalizado(event) ? 'text-emerald-500' : 'text-slate-400'}`}/>
                                                {event.horaFin || '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Periodo</p>
                                    <div className="space-y-0.5 text-slate-700 font-bold text-sm">
                                        <div className="flex items-center gap-2"><CalendarIcon size={14} className="text-blue-500"/> {format(event.start, "dd MMM yyyy", { locale: es })}</div>
                                        {event.start.getTime() !== event.end.getTime() && (
                                            <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500"/> {format(event.end, "dd MMM yyyy", { locale: es })}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {event.destino && (
                                        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex-1">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Destino</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm"><MapPin size={12} className="text-rose-500"/> {event.destino}</div>
                                        </div>
                                    )}
                                    {event.laboratorioRef && (
                                        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex-1">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Lab Referencia</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm"><Building2 size={12} className="text-blue-500"/> {event.laboratorioRef}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {(event.tipo === 'interlaboratorio' || event.tipo === 'intralaboratorio') && (
                                <>
                                <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
                                    <div>
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                                            Magnitud: {event.magnitudPT || 'N/A'}
                                            {event.equipoPT ? ` · Equipo: ${event.equipoPT}` : ''}
                                        </p>
                                        <p className="text-sm font-black text-emerald-900">Avance de Actividad: {calculateAvance(event)}%</p>
                                    </div>
                                    <div className="w-24 h-2.5 bg-emerald-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-600" style={{ width: `${calculateAvance(event)}%` }}></div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Evidencia</p>
                                    {event.evidenciaUrl ? (
                                        <a href={event.evidenciaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
                                            <ExternalLink size={14}/> {event.evidenciaNombre || 'Ver evidencia'}
                                        </a>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic">Sin evidencia cargada.</p>
                                    )}
                                    {canUploadEvidencia && (
                                        <label className="mt-2 flex items-center justify-center gap-2 w-full py-2 bg-white border border-dashed border-blue-300 rounded-xl text-xs font-bold text-blue-600 cursor-pointer hover:bg-blue-50">
                                            {uploadingEvidencia ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                                            {event.evidenciaUrl ? 'Reemplazar evidencia' : 'Subir evidencia (completa actividad)'}
                                            <input type="file" className="hidden" disabled={uploadingEvidencia} onChange={e => { handleEvidenciaFile(e.target.files?.[0]); e.target.value = ''; }} />
                                        </label>
                                    )}
                                </div>
                                </>
                            )}

                            {creatorDisplay && (
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Creado por</p>
                                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                                        <UserCheck size={14} className="text-indigo-500 shrink-0"/> {creatorDisplay}
                                    </div>
                                </div>
                            )}

                            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Detalles</p>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{event.descripcion || 'Sin instrucciones adicionales.'}</div>
                                {event.comentariosPT && <div className="mt-2 pt-2 border-t border-slate-200 text-xs italic text-slate-600">Comentarios: {event.comentariosPT}</div>}
                            </div>

                            {event.pjlaUrl && (
                                <a href={event.pjlaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl border border-pink-200 hover:border-pink-500 hover:bg-pink-50 transition-all bg-white shadow-sm group">
                                    <div className="w-8 h-8 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={16} /></div>
                                    <div className="flex-1">
                                        <span className="block text-sm text-slate-800 font-black">Abrir PDF Oficial PJLA</span>
                                    </div>
                                </a>
                            )}

                            {!isPJLA && isCalidad && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            {event.tipo === 'junta' ? 'Confirmaciones de asistencia' : 'Quiénes van'}
                                        </p>
                                        {event.personas?.length > 0 && (
                                            <span className="text-[10px] font-bold text-slate-500">
                                                {(event.enterados || []).length}/{event.personas.length} confirmados
                                            </span>
                                        )}
                                    </div>
                                    {event.personas?.length ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {event.personas.map((pId: string, i: number) => {
                                                const enterado = (event.enterados || []).some((e: string) => String(e).toLowerCase() === String(pId).toLowerCase());
                                                const nombre = getUserName(pId, technicalStaff);
                                                const ackAt = event.enteradosAt?.[pId]
                                                    ?? Object.entries(event.enteradosAt || {}).find(([k]) =>
                                                        String(k).toLowerCase() === String(pId).toLowerCase()
                                                    )?.[1];
                                                return (
                                                    <div key={i} className={`flex items-center justify-between p-2 bg-white border rounded-xl shadow-sm ${enterado ? 'border-emerald-200' : 'border-slate-200'}`}>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <Avatar name={nombre} isEnterado={enterado} />
                                                            <div className="min-w-0">
                                                                <span className="text-xs font-bold text-slate-700 truncate block max-w-[120px]">{nombre}</span>
                                                                {enterado && ackAt ? (
                                                                    <span className="text-[9px] text-emerald-600 font-semibold">{format(new Date(ackAt), 'dd/MM/yy HH:mm', { locale: es })}</span>
                                                                ) : (
                                                                    <span className="text-[9px] text-amber-600 font-semibold">Pendiente</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {enterado ? (
                                                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">✓</span>
                                                        ) : (
                                                            <Clock size={14} className="text-amber-500 shrink-0"/>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                            Sin participantes asignados.
                                        </p>
                                    )}
                                </div>
                            )}

                            {!isPJLA && isAssigned && (!isCalidad || event.tipo === 'junta') && (
                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">
                                        {event.tipo === 'junta' ? 'Tu asistencia' : 'Tu confirmación'}
                                    </p>
                                    <div className={`flex items-center justify-between p-2.5 bg-white border rounded-xl ${yaEstaEnterado ? 'border-emerald-200' : 'border-amber-200'}`}>
                                        <div className="flex items-center gap-2">
                                            <Avatar name={getUserName(currentUser?.id || authUid || '', technicalStaff)} isEnterado={yaEstaEnterado} />
                                            <div>
                                                <span className="text-xs font-bold text-slate-700 block">
                                                    {getUserName(currentUser?.id || authUid || '', technicalStaff)}
                                                </span>
                                                {yaEstaEnterado ? (
                                                    <span className="text-[9px] text-emerald-600 font-semibold">{ackLabel}</span>
                                                ) : (
                                                    <span className="text-[9px] text-amber-600 font-semibold">Pendiente de confirmar</span>
                                                )}
                                            </div>
                                        </div>
                                        {yaEstaEnterado ? (
                                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0"/>
                                        ) : (
                                            <Clock size={16} className="text-amber-500 shrink-0"/>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!isPJLA && isAssigned && !yaEstaEnterado && canAckAssigned && (
                                <button type="button" onClick={handleMarcarEnterado} disabled={marking} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mt-2">
                                    {marking ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <UserCheck size={18}/>}
                                    {ackActionLabel}
                                </button>
                            )}
                            {!isPJLA && !isAssigned && !canEdit && event?.personas?.length > 0 && (
                                <p className="text-xs text-slate-500 italic text-center py-2 border border-dashed border-slate-200 rounded-xl">
                                    No estás asignado a esta actividad; solo lectura.
                                </p>
                            )}
                            {!isPJLA && isAssigned && yaEstaEnterado && (
                                <p className="text-xs text-emerald-700 font-bold text-center py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                                    {event.tipo === 'junta' ? 'Ya confirmaste tu asistencia.' : `Ya confirmaste (${ackLabel.toLowerCase()}).`}
                                </p>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={handleSave} className="space-y-4">
                            {!event && (formData.tipo === 'interlaboratorio' || formData.tipo === 'intralaboratorio') && isCalidad && (
                                <div className="col-span-2 flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 cursor-pointer" onClick={() => setUsarPlantilla(!usarPlantilla)}>
                                    <input type="checkbox" checked={usarPlantilla} readOnly className="w-4 h-4 accent-emerald-600" />
                                    <div>
                                        <label className="text-xs font-black text-emerald-800 cursor-pointer">Generar Plantilla Estándar PT</label>
                                        <p className="text-[9px] text-emerald-600">Creará 9 actividades en cascada.</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Actividad / Tarea</label>
                                    <input required disabled={usarPlantilla} value={usarPlantilla ? 'Plantilla Múltiple (9 Actividades)' : formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 disabled:opacity-50" placeholder="Ej. Seleccionar equipo..." />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Tipo</label>
                                    <select value={formData.tipo} onChange={e => { setFormData({...formData, tipo: e.target.value}); if(!e.target.value.includes('inter') && !e.target.value.includes('intra')) setUsarPlantilla(false); }} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                                        {CONSTANTS.tipos
                                            .filter(t => isCalidad ? true : ['junta', 'vuelta'].includes(t.value))
                                            .map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estado</label>
                                    <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                                        {CONSTANTS.estados.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fecha Inicio</label>
                                    <input type="date" required value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fecha Fin</label>
                                    <input type="date" required value={formData.fechaFin} onChange={e => setFormData({...formData, fechaFin: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
                                </div>
                            </div>

                            {isServicioOperativo(formData.tipo) && (
                                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
                                    <h4 className="text-[10px] font-bold text-indigo-800 uppercase tracking-widest flex items-center gap-1"><MapPin size={12}/> Servicio en campo</h4>
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Lugar / Ubicación</label>
                                        <input value={formData.ubicacion} onChange={e => setFormData({...formData, ubicacion: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" placeholder="Planta, dirección..." />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Hora inicio</label>
                                            <input type="time" value={formData.horaInicio} onChange={e => setFormData({...formData, horaInicio: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Hora fin</label>
                                            <input type="time" value={formData.horaFin} onChange={e => setFormData({...formData, horaFin: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(formData.tipo === 'interlaboratorio' || formData.tipo === 'intralaboratorio') && (
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                    <h4 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-1"><TableProperties size={12}/> Datos Gantt PT</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[9px] font-bold text-blue-600 uppercase mb-1 block">Magnitud (Agrupador)</label>
                                            <input
                                                required
                                                list="pt-magnitudes-list"
                                                value={formData.magnitudPT}
                                                onChange={e => setFormData({ ...formData, magnitudPT: e.target.value, equipoPT: formData.equipoPT })}
                                                className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm outline-none"
                                                placeholder="Ej. Electrica, Dimensional..."
                                            />
                                            <datalist id="pt-magnitudes-list">
                                                {PT_MAGNITUDES.map(m => <option key={m} value={m} />)}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-blue-600 uppercase mb-1 block">Equipo</label>
                                            <input
                                                required={usarPlantilla}
                                                list="pt-equipos-list"
                                                value={formData.equipoPT}
                                                onChange={e => setFormData({ ...formData, equipoPT: e.target.value })}
                                                className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm outline-none"
                                                placeholder={usarPlantilla ? 'Ej. Hypot, Multímetro, Vernier...' : 'Opcional si no aplica...'}
                                            />
                                            <datalist id="pt-equipos-list">
                                                {[...new Set(PT_EQUIPOS_SUGERIDOS[formData.magnitudPT] || Object.values(PT_EQUIPOS_SUGERIDOS).flat())].map(eq => (
                                                    <option key={eq} value={eq} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Destino / Planta</label>
                                            <input value={formData.destino} onChange={e => setFormData({...formData, destino: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" placeholder="Ej. Monterrey Planta 1..." />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-400 uppercase mb-1 block">Lab. Referencia</label>
                                            <input value={formData.laboratorioRef} onChange={e => setFormData({...formData, laboratorioRef: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" placeholder="Opcional..." />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-blue-600 uppercase mb-1 block">Comentarios PT</label>
                                        <input value={formData.comentariosPT} onChange={e => setFormData({...formData, comentariosPT: e.target.value})} className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm outline-none" placeholder="Observaciones..." />
                                    </div>
                                </div>
                            )}

                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Descripción General</label>
                                <textarea value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" rows={2} />
                            </div>

                            {(formData.tipo === 'interlaboratorio' || formData.tipo === 'intralaboratorio') && event?.id && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                                    <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Evidencia</p>
                                    {event.evidenciaUrl ? (
                                        <a href={event.evidenciaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                                            <ExternalLink size={12}/> {event.evidenciaNombre || 'Ver archivo'}
                                        </a>
                                    ) : (
                                        <p className="text-[10px] text-emerald-700 italic">Al subir evidencia, el avance será 100% y el estado Finalizado.</p>
                                    )}
                                    <label className="flex items-center justify-center gap-2 w-full py-2 bg-white border border-dashed border-emerald-400 rounded-lg text-xs font-bold text-emerald-700 cursor-pointer hover:bg-emerald-100/50">
                                        {uploadingEvidencia ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                                        Subir evidencia
                                        <input type="file" className="hidden" disabled={uploadingEvidencia} onChange={e => { handleEvidenciaFile(e.target.files?.[0]); e.target.value = ''; }} />
                                    </label>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex justify-between">
                                    Participantes / Técnicos 
                                    <span className="text-blue-500 font-normal normal-case">Se les notificará</span>
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {formData.personas.map((pId, i) => (
                                        <div key={i} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200">
                                            {getUserName(pId, technicalStaff)} 
                                            <button type="button" onClick={() => setFormData({...formData, personas: formData.personas.filter(n => n !== pId)})} className="hover:text-red-500"><X size={12}/></button>
                                        </div>
                                    ))}
                                </div>
                                <select onChange={e => { 
                                    const val = e.target.value;
                                    if(val && !formData.personas.includes(val)) setFormData({...formData, personas: [...formData.personas, val]});
                                    e.target.value = ''; 
                                }} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none">
                                    <option value="">+ Asignar Responsable...</option>
                                    {technicalStaff.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </select>
                            </div>

                            <button type="submit" disabled={saving} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mt-2">
                                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={18}/>}
                                {event ? 'Actualizar Actividad' : usarPlantilla ? 'Generar Plantilla y Fechas' : 'Confirmar Programación'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- 3. VISTA GANTT PT (INTERLABORATORIOS) MAYO - ABRIL ---

const calcMagnitudAvance = (eventosMag: any[]) => {
    if (!eventosMag.length) return 0;
    const sum = eventosMag.reduce((acc, ev) => acc + calculateAvance(ev), 0);
    return Math.round(sum / eventosMag.length);
};

const GanttPTView = ({ events, onCellClick, onEventClick, onDeleteMagnitud, isCalidad, canEdit, technicalStaff, onUploadEvidencia, currentUser, authUid }: any) => {
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const monthsPT = ['Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo', 'Abril'];
    const ptEvents = events.filter(e => e.tipo === 'intralaboratorio' || e.tipo === 'interlaboratorio');

    const SORT_ORDER = PLANTILLA_PT.reduce((acc, val, idx) => ({ ...acc, [val]: idx }), {} as any);

    const groupedEvents = ptEvents.reduce((acc, ev) => {
        const groupKey = getPtGroupKey(ev);
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(ev);
        return acc;
    }, {} as Record<string, any[]>);

    Object.keys(groupedEvents).forEach(k => {
        groupedEvents[k].sort((a, b) => (SORT_ORDER[a.title] ?? 99) - (SORT_ORDER[b.title] ?? 99));
    });

    const getWeekRangePT = (start: Date, end: Date) => {
        const getIdx = (d: Date) => {
            const m = d.getMonth(); 
            const offsetMonth = (m - 4 + 12) % 12; 
            const weekOfMonth = Math.min(3, Math.floor((d.getDate() - 1) / 7));
            return (offsetMonth * 4) + weekOfMonth;
        };
        let startW = getIdx(start);
        let endW = getIdx(end);
        if(end.getTime() < start.getTime()) endW = startW; 
        return { startW, endW };
    };

    const getAvanceColor = (avance: number) => {
        if (avance === 100) return 'bg-[#00FF00] text-black'; 
        if (avance <= 10) return 'bg-[#FF0000] text-white'; 
        return 'bg-[#FFFF00] text-black'; 
    };

    const getActivityStyle = (title: string) => {
        const t = title.toLowerCase();
        if (t.includes('seleccionar')) return { backgroundColor: '#cfd24c', color: '#000' }; 
        if (t.includes('conseguir') || t.includes('buscar')) return { backgroundColor: '#d08ce1', color: '#000' }; 
        if (t.includes('cotizar compra')) return { backgroundColor: '#3cf3f3', color: '#000' }; 
        if (t.includes('compra')) return { backgroundColor: '#f1a141', color: '#000' }; 
        if (t.includes('configurar')) return { backgroundColor: '#1f34e3', color: '#fff' }; 
        if (t.includes('cotización servicio') || t.includes('cotizacion servicio')) return { backgroundColor: '#8bc0e9', color: '#000' }; 
        if (t.includes('envió') || t.includes('envio')) return { backgroundColor: '#fdfb23', color: '#000' }; 
        if (t.includes('interna') || t.includes('informe')) return { backgroundColor: '#8bd980', color: '#000' }; 
        if (t.includes('estudio')) return { backgroundColor: '#2ced2f', color: '#000' }; 
        return { backgroundColor: '#2464A3', color: '#fff' }; 
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-[#00FF00] text-black font-bold text-center py-1.5 text-[11px] border-b border-slate-300 shrink-0">
                Programa y seguimiento de estudios Interlaboratorios
            </div>

            <div className="md:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 shrink-0">
              Desliza horizontalmente para ver el Gantt completo. En pantallas grandes se ve mejor.
            </div>
            <div className="overflow-x-auto custom-scrollbar flex-1 relative overscroll-x-contain">
                <table className="w-full min-w-[1500px] border-collapse bg-white text-xs">
                    <thead className="sticky top-0 z-40 bg-white shadow-sm">
                        <tr>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-24 sticky left-0 z-50 text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.1)] leading-tight">Magnitud<br/><span className="font-medium text-[8px]">/ Equipo</span></th>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-48 sticky left-[96px] z-50 text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.1)]">Actividades</th>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-24 text-[10px]">Responsable</th>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-16 text-[10px] leading-tight">Avance %</th>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-20 text-[10px]">Evidencia</th>
                            <th colSpan={2} className="border border-slate-300 p-1 bg-[#0070C0] text-white font-bold text-center text-[10px]">Fechas</th>
                            {monthsPT.map(m => <th key={m} colSpan={4} className="border border-slate-300 p-1 text-center font-bold bg-slate-200 text-slate-700 text-[10px]">{m}</th>)}
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-40 text-[10px]">Comentarios</th>
                        </tr>
                        <tr>
                            <th className="border border-slate-300 py-1 px-0.5 bg-[#0070C0] text-white text-[9px] w-14">Inicio</th>
                            <th className="border border-slate-300 py-1 px-0.5 bg-[#0070C0] text-white text-[9px] w-14">Final</th>
                            {Array.from({ length: 48 }).map((_, i) => <th key={i} className="border border-slate-300 p-0 text-center bg-slate-100 text-[8px] font-medium text-slate-600 min-w-[16px]">{(i % 4) + 1}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(groupedEvents).map(groupKey => {
                            const eventosMag = groupedEvents[groupKey];
                            const { magnitud, equipo } = parsePtGroupKey(groupKey);
                            const avanceMagnitud = calcMagnitudAvance(eventosMag);
                            return (
                                <React.Fragment key={groupKey}>
                                    {eventosMag.map((ev, idx) => {
                                        const { startW, endW } = getWeekRangePT(ev.start, ev.end);
                                        const nombres = ev.personas?.length
                                            ? ev.personas.map((id: string) => getUserName(id, technicalStaff)).join(', ')
                                            : '—';
                                        const avanceReal = calculateAvance(ev);
                                        const puedeSubirEvidencia = canEdit || isUserAssignedToEvent(currentUser, ev.personas || [], authUid, technicalStaff);
                                        const style = getActivityStyle(ev.title);

                                        return (
                                            <tr key={ev.id} className="hover:brightness-95 cursor-pointer transition-all h-7" onClick={() => onEventClick(ev)}>
                                                {idx === 0 && (
                                                    <td rowSpan={eventosMag.length + 1} className="border border-slate-300 p-1 text-center bg-white font-bold text-slate-700 text-[9px] sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.02)] align-top">
                                                        <div className="flex flex-col items-center gap-1 min-h-full justify-start">
                                                            <span className="leading-tight break-words font-black">{magnitud}</span>
                                                            {equipo && (
                                                                <span className="leading-tight break-words text-[8px] font-semibold text-slate-500 normal-case">
                                                                    {equipo}
                                                                </span>
                                                            )}
                                                            {canEdit && onDeleteMagnitud && (
                                                                <button
                                                                    type="button"
                                                                    title={`Eliminar "${groupKey}" y todas sus actividades`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onDeleteMagnitud(groupKey, eventosMag.map((x: { id: string }) => x.id));
                                                                    }}
                                                                    className="p-1 text-red-600 hover:bg-red-50 rounded border border-red-200"
                                                                >
                                                                    <Trash2 size={12}/>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}
                                                
                                                <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-[9px] sticky left-[96px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.02)] leading-tight" style={style} title={ev.title}>
                                                    {ev.title}
                                                </td>
                                                <td className="border border-slate-300 p-0.5 text-center bg-white">
                                                    <span
                                                        className="text-[9px] text-slate-600 block max-w-[96px] leading-tight break-words"
                                                        title={nombres !== '—' ? nombres : undefined}
                                                    >
                                                        {nombres}
                                                    </span>
                                                </td>
                                                
                                                <td className={`border border-slate-300 p-1 text-center font-bold text-[10px] ${getAvanceColor(avanceReal)}`}>
                                                    {avanceReal}%
                                                </td>

                                                <td className="border border-slate-300 p-0.5 text-center bg-white" onClick={e => e.stopPropagation()}>
                                                    {ev.evidenciaUrl ? (
                                                        <a href={ev.evidenciaUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] font-bold text-blue-600 hover:underline" title={ev.evidenciaNombre || 'Evidencia'}>
                                                            <ExternalLink size={12} className="inline"/>
                                                        </a>
                                                    ) : puedeSubirEvidencia ? (
                                                        <label className="inline-flex items-center justify-center cursor-pointer text-blue-600 hover:text-blue-800" title="Subir evidencia">
                                                            {uploadingId === ev.id ? <Loader2 size={12} className="animate-spin"/> : <Upload size={12}/>}
                                                            <input type="file" className="hidden" disabled={uploadingId === ev.id} onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                e.target.value = '';
                                                                if (!file) return;
                                                                setUploadingId(ev.id);
                                                                try { await onUploadEvidencia(ev.id, file); } finally { setUploadingId(null); }
                                                            }} />
                                                        </label>
                                                    ) : (
                                                        <span className="text-[9px] text-slate-300">—</span>
                                                    )}
                                                </td>
                                                
                                                <td className="border border-slate-300 p-0.5 text-center text-[8px] text-slate-600 bg-white">{format(ev.start, 'dd/MMM/yy', {locale: es})}</td>
                                                <td className="border border-slate-300 p-0.5 text-center text-[8px] text-slate-600 bg-white">{format(ev.end, 'dd/MMM/yy', {locale: es})}</td>
                                                
                                                {Array.from({ length: 48 }).map((_, i) => {
                                                    const active = i >= startW && i <= endW;
                                                    return (
                                                        <td key={i} onClick={(e) => { if(!active && isCalidad){ e.stopPropagation(); onCellClick(ev.tipo, i); } }} className="border border-slate-300 p-0 relative bg-white">
                                                            {active && (
                                                                <div className="w-full h-full min-h-[16px] shadow-sm flex items-center justify-center text-[7px] font-bold" style={style}>
                                                                    {avanceReal === 100 ? '✓' : ''}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="border border-slate-300 p-1 text-[9px] text-slate-600 bg-white truncate max-w-[192px]">{ev.comentariosPT || ''}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="bg-slate-100 border-t-2 border-slate-400 h-7">
                                        <td colSpan={2} className="border border-slate-300 px-2 py-0.5 text-[9px] font-black text-slate-800 uppercase tracking-wide sticky left-[96px] z-30 bg-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                            Avance total magnitud
                                        </td>
                                        <td className="border border-slate-300 p-0.5 bg-slate-100" />
                                        <td className={`border border-slate-300 p-1 text-center font-black text-[10px] ${getAvanceColor(avanceMagnitud)}`}>
                                            {avanceMagnitud}%
                                        </td>
                                        <td colSpan={52} className="border border-slate-300 bg-slate-100 text-[8px] text-slate-500 italic px-2">
                                            Promedio de {eventosMag.length} actividad{eventosMag.length === 1 ? '' : 'es'}
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                        {ptEvents.length === 0 && (
                            <tr>
                                <td colSpan={7} className="border border-slate-300 p-3 text-center italic text-slate-400 bg-white text-[10px]">Dale a "NUEVA PRUEBA" y usa la Plantilla PT.</td>
                                {Array.from({ length: 48 }).map((_, i) => <td key={i} className="border border-slate-300 bg-white"></td>)}
                                <td className="border border-slate-300 bg-white"></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- 5. COMPONENTES DE DISEÑO DEL CALENDARIO ---

const CustomEvent = ({ event, currentUser, authUid, usersList }: { event: any; currentUser?: any; authUid?: string | null; usersList?: any[] }) => {
    const isPJLA = event.esAlertaAutomatica || event.cliente === 'Perry Johnson Labs';
    const Icon = event.esVencimientoPatron ? Settings : isPJLA ? Bell : (CONSTANTS.estados.find(e => e.value === event.estado)?.icon || CalendarIcon);
    
    const hexColor = getEventHexColor(event);
    const useDarkText = isColorLight(hexColor);
    const textColorClass = useDarkText ? 'text-slate-900' : 'text-white';

    const assigned = !event.esVencimientoPatron && !isPJLA && isUserAssignedToEvent(currentUser, event.personas || [], authUid, usersList || []);
    const ackKeys = buildUserIdentityKeys(currentUser, authUid, usersList || []);
    const acknowledged = assigned && (event.enterados || []).some((e: string) => ackKeys.has(String(e).toLowerCase()));

    const lugar = resolveEventLugar(event);
    const hora = event.horaInicio
        ? `${event.horaInicio}${event.horaFin ? `–${event.horaFin}` : ''}`
        : '';
    const tip = [event.title, hora, lugar].filter(Boolean).join(' · ');

    return (
      <div className="flex items-center gap-0.5 h-full px-0.5 overflow-hidden" title={tip}>
        <Icon size={9} className={`${useDarkText ? 'text-slate-800' : 'text-white'} shrink-0`} />
        <span className={`text-[10px] leading-none font-semibold truncate flex-1 ${textColorClass}`}>{event.title}</span>
        {assigned && (
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${acknowledged ? 'bg-emerald-200' : 'bg-amber-300'}`}
            title={acknowledged ? getAckLabel(event.tipo) : 'Pendiente confirmación'}
          />
        )}
      </div>
    );
};

type CalView = 'month' | 'week' | 'day' | 'agenda';

const CALENDAR_VIEW_LABELS: Record<CalView, string> = {
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Agenda',
};

const CALENDAR_MESSAGES = {
    date: 'Fecha',
    time: 'Hora',
    event: 'Actividad',
    allDay: 'Todo el día',
    week: 'Semana',
    work_week: 'Semana laboral',
    day: 'Día',
    month: 'Mes',
    previous: 'Anterior',
    next: 'Siguiente',
    yesterday: 'Ayer',
    tomorrow: 'Mañana',
    today: 'Hoy',
    agenda: 'Agenda',
    noEventsInRange: 'No hay actividades en este periodo.',
    showMore: (total: number) => `+${total} más`,
};

const TIME_VIEW_MIN = new Date(1970, 0, 1, 6, 0, 0);
const TIME_VIEW_MAX = new Date(1970, 0, 1, 21, 0, 0);

const eventOverlapsDay = (ev: { start: Date; end: Date }, day: Date) => {
    const from = startOfDay(day).getTime();
    const to = endOfDay(day).getTime();
    const start = ev.start instanceof Date ? ev.start.getTime() : new Date(ev.start).getTime();
    const end = ev.end instanceof Date ? ev.end.getTime() : start;
    return start <= to && end >= from;
};

const AgendaEventRow = ({ event, onClick }: { event: any; onClick: (ev: any) => void }) => {
    const hex = getEventHexColor(event);
    const tipo = CONSTANTS.tipos.find(t => t.value === event.tipo);
    const lugar = resolveEventLugar(event);
    const time = event.esVencimientoPatron
        ? 'Vencimiento'
        : event.horaInicio
            ? `${event.horaInicio}${event.horaFin ? `–${event.horaFin}` : ''}`
            : event.allDay
                ? 'Todo el día'
                : format(event.start, 'HH:mm');

    return (
        <button
            type="button"
            onClick={() => onClick(event)}
            className="w-full text-left flex gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
        >
            <span className="w-1 rounded-full shrink-0 self-stretch" style={{ background: hex }} />
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{event.title}</p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {time}
                    {lugar ? ` · ${lugar}` : ''}
                    {tipo ? ` · ${tipo.label}` : ''}
                </p>
            </div>
        </button>
    );
};

const DayAgendaPanel = ({
    selectedDay,
    events,
    onSelectEvent,
    onCreate,
    createLabel,
    onClose,
}: {
    selectedDay: Date;
    events: any[];
    onSelectEvent: (ev: any) => void;
    onCreate?: () => void;
    createLabel: string;
    onClose?: () => void;
}) => {
    const dayEvents = events
        .filter(ev => eventOverlapsDay(ev, selectedDay))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    const upcomingGroups = (() => {
        const groups: { day: Date; items: any[] }[] = [];
        for (let i = 1; i <= 7; i++) {
            const day = addDays(startOfDay(selectedDay), i);
            const items = events
                .filter(ev => eventOverlapsDay(ev, day) && !ev.esVencimientoPatron)
                .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());
            if (items.length) groups.push({ day, items });
        }
        return groups.slice(0, 4);
    })();

    return (
        <aside className="flex flex-col min-h-0 h-full bg-white">
            <div className="px-3 py-2.5 border-b border-slate-100 flex items-start justify-between gap-2 shrink-0">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {isToday(selectedDay) ? 'Hoy' : format(selectedDay, 'EEEE', { locale: es })}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 capitalize truncate">
                        {format(selectedDay, "d 'de' MMMM", { locale: es })}
                    </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-semibold tabular-nums text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                        {dayEvents.length}
                    </span>
                    {onClose && (
                        <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-md lg:hidden" aria-label="Cerrar agenda">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {dayEvents.length === 0 ? (
                    <div className="px-3 py-8 text-center">
                        <CalendarIcon size={22} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-xs text-slate-500">Sin actividades este día.</p>
                        {onCreate && (
                            <button
                                type="button"
                                onClick={onCreate}
                                className="mt-3 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                                style={{ backgroundColor: AG_BRAND_BLUE }}
                            >
                                <Plus size={12} /> {createLabel}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="p-1.5 space-y-0.5">
                        {dayEvents.map(ev => (
                            <AgendaEventRow
                                key={ev.id}
                                event={ev}
                                onClick={onSelectEvent}
                            />
                        ))}
                    </div>
                )}

                {upcomingGroups.length > 0 && (
                    <div className="border-t border-slate-100 mt-1">
                        <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Próximos días
                        </p>
                        {upcomingGroups.map(g => (
                            <div key={g.day.toISOString()} className="px-1.5 pb-1.5">
                                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500 capitalize">
                                    {format(g.day, "EEE d MMM", { locale: es })} · {g.items.length}
                                </p>
                                {g.items.slice(0, 3).map(ev => (
                                    <AgendaEventRow key={ev.id} event={ev} onClick={onSelectEvent} />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
};

// --- 6. COMPONENTE PRINCIPAL (SCREEN) ---

export const CalendarScreen: React.FC = () => {
    const { confirm } = useAppDialog();
    
    const [authUser, setAuthUser] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    
    useEffect(() => {
        const auth = getAuth();
        const unsubAuth = onAuthStateChanged(auth, (user) => setAuthUser(user));
        return () => unsubAuth();
    }, []);

    const currentUserData = useMemo(() => {
        if (!authUser || users.length === 0) return null;
        const authEmail = String(authUser.email || '').toLowerCase();
        return (
            users.find(u => u.id === authUser.uid)
            || users.find(u => String(u.email || u.correo || '').toLowerCase() === authEmail)
            || null
        );
    }, [authUser, users]);

    const isCalidad = useMemo(() => {
        if (!currentUserData) return false;
        return isCalidadRole(String(currentUserData.puesto || currentUserData.role || '').toLowerCase());
    }, [currentUserData]);

    const canSeeAllEvents = useMemo(
        () => canSeeAllCalendarEvents(currentUserData),
        [currentUserData],
    );

    const canEditEvents = useMemo(
        () => canEditCalendarEvents(currentUserData),
        [currentUserData],
    );

    const userRole = useMemo(() => {
        if (!currentUserData) return '';
        return String(currentUserData.puesto || currentUserData.role || currentUserData.position || '').trim().toLowerCase();
    }, [currentUserData]);

    const canSeePatronAlerts = useMemo(() => {
        const isCalidadRoleFlag = userRole.includes('calidad');
        const isJefe = userRole.includes('admin') || userRole.includes('gerente');
        return isCalidadRole(userRole) || isJefe || isCalidadRoleFlag;
    }, [userRole]);

    const [viewMode, setViewMode] = useState<'calendar' | 'gantt_pt'>('calendar'); 
    const [events, setEvents] = useState<any[]>([]);
    const [patrones, setPatrones] = useState<PatronCalibracionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPatronPanel, setShowPatronPanel] = useState(() =>
        shouldShowPatronVencimientosPanel([]),
    );
    const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
    const [initialModalData, setInitialModalData] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState('todos');
    const [filterTipo, setFilterTipo] = useState('todos');
    const [onlyMine, setOnlyMine] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [showLegend, setShowLegend] = useState(false);
    const [calDate, setCalDate] = useState(() => new Date());
    const [calView, setCalView] = useState<CalView>('month');
    const [selectedDay, setSelectedDay] = useState(() => new Date());
    const [showAgendaMobile, setShowAgendaMobile] = useState(false);
    const [patronListOpen, setPatronListOpen] = useState(false);

    useEffect(() => {
        setLoading(true);
        const unsub = onSnapshot(query(collection(db, 'servicios')), async (snapshot) => {
            try {
                const usuariosSnap = await getDocs(collection(db, 'usuarios'));
                const fetchedUsers = filterVisibleUsers(
                  usuariosSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })),
                );
                setUsers(fetchedUsers);

                const calendarEvents = snapshot.docs.map(doc => {
                    const data = doc.data();
                    let start = new Date(); let end = new Date();
                    
                    if (data.fecha) {
                        const [y, m, d] = data.fecha.split('-').map(Number);
                        start = new Date(y, m - 1, d);
                        end = new Date(start);
                        if (data.horaInicio) {
                            const [h, min] = data.horaInicio.split(':').map(Number);
                            if (!Number.isNaN(h) && !Number.isNaN(min)) start.setHours(h, min, 0, 0);
                        }
                    }
                    if (data.fechaFin) {
                        const [y, m, d] = data.fechaFin.split('-').map(Number);
                        end = new Date(y, m - 1, d);
                    }
                    if (data.horaFin) {
                        const [h, min] = data.horaFin.split(':').map(Number);
                        if (!Number.isNaN(h) && !Number.isNaN(min)) end.setHours(h, min, 0, 0);
                    }

                    const ubicacion = data.ubicacion || data.lugar || data.direccion || '';
                    let pjlaUrl = data.url || null;
                    if (!pjlaUrl && data.archivos && data.archivos.length > 0 && typeof data.archivos[0] === 'string' && data.archivos[0].startsWith('http')) pjlaUrl = data.archivos[0];
                    if (!pjlaUrl && data.descripcion) {
                        const urlMatch = data.descripcion.match(/https?:\/\/[^\s]+/g);
                        if (urlMatch) pjlaUrl = urlMatch[0]; 
                    }
                    
                    return {
                        id: doc.id, title: data.titulo || data.elemento || 'Sin título', start, end,
                        cliente: data.cliente || 'Interno', estado: data.estado || 'programado', estatus: data.estatus,
                        tipo: data.tipo || 'calibracion',
                        destino: data.destino || '', laboratorioRef: data.laboratorioRef || '', descripcion: data.descripcion,
                        ubicacion, lugar: data.lugar || '', direccion: data.direccion || '',
                        horaInicio: data.horaInicio || '', horaFin: data.horaFin || '',
                        finalizado: data.finalizado === true || data.estado === 'finalizado',
                        personas: data.personas || [], enterados: data.enterados || [], enteradosAt: data.enteradosAt || {},
                        documentos: data.archivos || [],
                        pjlaUrl: pjlaUrl, esAlertaAutomatica: data.esAlertaAutomatica || false,
                        magnitudPT: data.magnitudPT || '', equipoPT: data.equipoPT || '', comentariosPT: data.comentariosPT || '',
                        evidenciaUrl: data.evidenciaUrl || null,
                        evidenciaNombre: data.evidenciaNombre || '',
                        evidenciaFecha: data.evidenciaFecha || null,
                        evidenciaUrls: data.evidenciaUrls || [],
                        createdBy: data.createdBy || '',
                        creadoPor: data.creadoPor || '',
                        userId: data.userId || '',
                        createdByEmail: data.createdByEmail || data.creadoPorEmail || '',
                        creadoPorNombre: data.creadoPorNombre || data.createdByName || '',
                    };
                });
                setEvents(calendarEvents);
            } catch (error) { console.error(error); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!canSeePatronAlerts) {
            setPatrones([]);
            return;
        }
        getDocs(query(collection(db, COLLECTION_PATRONES)))
            .then(snap => {
                const rows: PatronCalibracionRow[] = [];
                snap.forEach(d => rows.push({ id: d.id, ...d.data() } as PatronCalibracionRow));
                setPatrones(rows);
            })
            .catch(err => console.error('Patrones calendario:', err));
    }, [canSeePatronAlerts]);

    const patronCalendarEvents = useMemo(() => {
        const today = new Date();
        return patrones
            .map(p => {
                const f = getPatronFechaVencimiento(p);
                if (!f) return null;
                let start: Date;
                try {
                    const parsed = parseISO(f);
                    if (!isValid(parsed)) return null;
                    start = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0);
                } catch {
                    return null;
                }
                const urgency = getPatronUrgency(p, today);
                const days = differenceInDays(start, today);
                const label = getPatronUrgencyLabel(urgency);
                const desc = p.descripcion || p.nombre || '';
                return {
                    id: `patron-venc-${p.id || p.noControl}`,
                    title: `⏱ ${p.noControl} — ${desc}`.slice(0, 80),
                    start,
                    end: start,
                    allDay: true,
                    esVencimientoPatron: true,
                    patronUrgency: urgency,
                    patronDays: days,
                    patronNoControl: p.noControl,
                    cliente: 'Patrones AG',
                    tipo: 'mtto_patrones',
                    estado: urgency === 'vencido' ? 'en_proceso' : 'programado',
                    descripcion: `Vencimiento calibración · ${label}${days >= 0 ? ` (${days} d)` : ''}`,
                };
            })
            .filter(Boolean) as any[];
    }, [patrones]);

    const upcomingPatrones = useMemo(() => {
        return sortPatronesPorVencimiento(
            patrones.filter(p => {
                const u = getPatronUrgency(p);
                return u !== 'ok' && u !== 'sin-fecha';
            }),
        ).slice(0, 12);
    }, [patrones]);

    const patronAlertCount = useMemo(() => countPatronesEnAlerta(patrones), [patrones]);

    useEffect(() => {
        if (!canSeePatronAlerts || upcomingPatrones.length === 0) {
            setShowPatronPanel(false);
            return;
        }
        setShowPatronPanel(shouldShowPatronVencimientosPanel(patrones));
    }, [patrones, upcomingPatrones.length, canSeePatronAlerts]);

    useEffect(() => {
        if (!canSeePatronAlerts || upcomingPatrones.length === 0) return;
        const recheck = () => {
            if (shouldShowPatronVencimientosPanel(patrones)) setShowPatronPanel(true);
        };
        const intervalId = window.setInterval(recheck, 30 * 60 * 1000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') recheck();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [patrones, upcomingPatrones.length, canSeePatronAlerts]);

    const handleDismissPatronPanel = useCallback(() => {
        savePatronPanelDismiss(patrones);
        setShowPatronPanel(false);
    }, [patrones]);

    const handleUploadEvidenciaPT = async (servicioId: string, file: File) => {
        await uploadEvidenciaServicio(servicioId, file);
    };

    const handleDeleteMagnitud = async (magnitud: string, eventIds: string[]) => {
        if (!canEditEvents || !eventIds.length) return;
        const msg = `¿Eliminar toda la magnitud "${magnitud}"?\nSe borrarán ${eventIds.length} actividad${eventIds.length === 1 ? '' : 'es'}. Esta acción no se puede deshacer.`;
        if (!(await confirm({ message: msg, variant: 'danger', confirmLabel: 'Eliminar' }))) return;
        try {
            await Promise.all(eventIds.map(id => deleteDoc(doc(db, 'servicios', id))));
            toast.success(`Magnitud "${magnitud}" eliminada (${eventIds.length} actividades).`);
        } catch (err) {
            console.error(err);
            toast.error('No se pudo eliminar la magnitud completa');
        }
    };

    const handleGanttCellClick = (catId: string, weekIdx: number) => {
        if (!isCalidad) return;
        const month = (Math.floor(weekIdx / 4) + 4) % 12;
        const year = month >= 4 ? 2026 : 2027;
        const day = ((weekIdx % 4) * 7) + 1;
        const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
        setInitialModalData({ tipo: catId, fecha: dateStr, fechaFin: dateStr });
        setSelectedEvent(null);
        setIsModalOpen(true);
    };

    const roleVisibleEvents = useMemo(() => {
        if (canSeeAllEvents) return events;
        if (!currentUserData && !authUser?.uid) return [];
        return events.filter(ev =>
            isUserAssignedToEvent(currentUserData, ev.personas || [], authUser?.uid, users),
        );
    }, [events, canSeeAllEvents, currentUserData, authUser?.uid]);

    const filteredServicioEvents = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        return roleVisibleEvents.filter(ev => {
            if (isReprogramadoEstado(ev.estado, ev.estatus)) return false;

            const isPJLA = ev.esAlertaAutomatica || ev.cliente === 'Perry Johnson Labs';
            if (!canSeeAllEvents && isPJLA) return false;

            if (onlyMine && !isUserAssignedToEvent(currentUserData, ev.personas || [], authUser?.uid, users)) {
                return false;
            }

            const matchStatus = filterStatus === 'todos' || ev.estado === filterStatus;
            const matchTipo = filterTipo === 'todos' || ev.tipo === filterTipo;
            const lugar = resolveEventLugar(ev).toLowerCase();
            const matchSearch = !q
                || String(ev.title || '').toLowerCase().includes(q)
                || String(ev.cliente || '').toLowerCase().includes(q)
                || lugar.includes(q)
                || String(ev.descripcion || '').toLowerCase().includes(q);
            return matchStatus && matchTipo && matchSearch;
        });
    }, [roleVisibleEvents, filterStatus, filterTipo, searchText, canSeeAllEvents, onlyMine, currentUserData, authUser?.uid, users]);

    const filteredEvents = useMemo(() => {
        if (!canSeePatronAlerts) return filteredServicioEvents;
        if (filterTipo !== 'todos' && filterTipo !== 'mtto_patrones') return filteredServicioEvents;
        if (filterStatus !== 'todos') return filteredServicioEvents;
        const q = searchText.trim().toLowerCase();
        const patronFiltered = patronCalendarEvents.filter(ev => {
            if (!q) return true;
            return ev.title.toLowerCase().includes(q) || (ev.patronNoControl || '').toLowerCase().includes(q);
        });
        return [...filteredServicioEvents, ...patronFiltered];
    }, [filteredServicioEvents, patronCalendarEvents, searchText, canSeePatronAlerts, filterTipo, filterStatus]);

    const stats = useMemo(() => {
        const servicios = roleVisibleEvents.filter(ev => !isReprogramadoEstado(ev.estado, ev.estatus));
        return {
            total: servicios.length,
            programado: servicios.filter(e => e.estado === 'programado').length,
            en_proceso: servicios.filter(e => e.estado === 'en_proceso').length,
            finalizado: servicios.filter(e => e.estado === 'finalizado').length,
        };
    }, [roleVisibleEvents]);

    const selectedDayCount = useMemo(
        () => filteredEvents.filter(ev => eventOverlapsDay(ev, selectedDay) && !ev.esVencimientoPatron).length,
        [filteredEvents, selectedDay],
    );

    const calTitle = useMemo(() => {
        if (calView === 'month' || calView === 'agenda') return format(calDate, 'MMMM yyyy', { locale: es });
        if (calView === 'day') return format(calDate, "EEEE d 'de' MMMM", { locale: es });
        const s = startOfWeek(calDate, { weekStartsOn: 1 });
        const e = endOfWeek(calDate, { weekStartsOn: 1 });
        return `${format(s, 'd MMM', { locale: es })} – ${format(e, 'd MMM yyyy', { locale: es })}`;
    }, [calDate, calView]);

    const shiftCalDate = (dir: -1 | 0 | 1) => {
        if (dir === 0) {
            const t = new Date();
            setCalDate(t);
            setSelectedDay(t);
            return;
        }
        const next = calView === 'month' ? addMonths(calDate, dir)
            : calView === 'week' ? addWeeks(calDate, dir)
            : addDays(calDate, dir);
        setCalDate(next);
        if (calView === 'day') setSelectedDay(next);
    };

    const openCreateForDay = (day: Date) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        setInitialModalData({ fecha: dateStr, fechaFin: dateStr });
        setSelectedEvent(null);
        setIsModalOpen(true);
    };

    const openEvent = (ev: any) => {
        if (ev.esVencimientoPatron) {
            toast(`Vencimiento de patrón ${ev.patronNoControl || ''}`.trim(), { icon: '⏱' });
            return;
        }
        setSelectedDay(ev.start);
        setSelectedEvent(ev);
        setIsModalOpen(true);
    };

    const eventPropGetter = useCallback((event: any) => {
        const hex = getEventHexColor(event);
        const darkText = isColorLight(hex);
        return {
            style: {
                backgroundColor: hex,
                border: 'none',
                color: darkText ? '#0f172a' : '#ffffff',
                boxShadow: 'none',
            }
        };
    }, []);

    const dayPropGetter = useCallback((date: Date) => {
        if (isSameDay(date, selectedDay) && !isToday(date)) {
            return { className: 'cal-day-selected' };
        }
        return {};
    }, [selectedDay]);

    const calendarEventComponent = useCallback(
        (props: { event: any }) => (
            <CustomEvent event={props.event} currentUser={currentUserData} authUid={authUser?.uid} usersList={users} />
        ),
        [currentUserData, authUser?.uid, users],
    );

    const createLabel = isCalidad ? 'Nueva prueba' : 'Nueva junta';

    const agendaPanel = (
        <DayAgendaPanel
            selectedDay={selectedDay}
            events={filteredEvents}
            onSelectEvent={openEvent}
            onCreate={() => openCreateForDay(selectedDay)}
            createLabel={createLabel}
            onClose={() => setShowAgendaMobile(false)}
        />
    );

    return (
        <OperationalScreenShell className="h-full !min-h-0 flex-1 flex flex-col overflow-hidden">
            <OperationalScreenHeader
                maxWidth="full"
                compact
                title="Calendario"
                subtitle={isCalidad ? 'Programación, PT y vencimientos' : 'Tus actividades y juntas'}
                titleIcon={<CalendarIcon size={18} style={{ color: AG_BRAND_BLUE }} />}
                backLabel="Menú"
                actions={
                    <>
                        <div className="bg-slate-100 p-0.5 rounded-lg flex border border-slate-200">
                            <button
                                type="button"
                                onClick={() => setViewMode('calendar')}
                                title="Calendario"
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-[#2464A3]' : 'text-slate-500'}`}
                            >
                                <LayoutGrid size={15} />
                            </button>
                            {isCalidad && (
                                <button
                                    type="button"
                                    onClick={() => setViewMode('gantt_pt')}
                                    title="Gantt PT"
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'gantt_pt' ? 'text-white' : 'text-slate-500'}`}
                                    style={viewMode === 'gantt_pt' ? { backgroundColor: AG_BRAND_BLUE } : undefined}
                                >
                                    <TableProperties size={15} />
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => openCreateForDay(selectedDay)}
                            className="px-2.5 sm:px-3 py-1.5 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0"
                            style={{ backgroundColor: AG_BRAND_BLUE }}
                        >
                            <Plus size={14} />
                            <span className="hidden sm:inline">{createLabel}</span>
                        </button>
                    </>
                }
            />

            {viewMode === 'calendar' && (
                <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2 shrink-0 space-y-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="flex items-center gap-0.5 shrink-0">
                            <button type="button" onClick={() => shiftCalDate(-1)} aria-label="Anterior" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600">
                                <ChevronLeft size={16} />
                            </button>
                            <button type="button" onClick={() => shiftCalDate(0)} className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                                Hoy
                            </button>
                            <button type="button" onClick={() => shiftCalDate(1)} aria-label="Siguiente" className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                        <h2 className="flex-1 min-w-0 text-sm sm:text-base font-semibold text-slate-800 capitalize truncate">
                            {calTitle}
                        </h2>
                        <div className="hidden sm:flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shrink-0">
                            {(['month', 'week', 'day', 'agenda'] as CalView[]).map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => {
                                        setCalView(v);
                                        if (v === 'day') setSelectedDay(calDate);
                                    }}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap ${
                                        calView === v ? 'bg-white shadow-sm text-[#2464A3]' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {CALENDAR_VIEW_LABELS[v]}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAgendaMobile(true)}
                            className="xl:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        >
                            <List size={13} />
                            Día{selectedDayCount ? ` · ${selectedDayCount}` : ''}
                        </button>
                    </div>
                    <div className="sm:hidden flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
                        {(['month', 'week', 'day', 'agenda'] as CalView[]).map(v => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setCalView(v)}
                                className={`flex-1 py-1 rounded-md text-[11px] font-semibold ${
                                    calView === v ? 'bg-white shadow-sm text-[#2464A3]' : 'text-slate-500'
                                }`}
                            >
                                {CALENDAR_VIEW_LABELS[v]}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <div className="relative flex-1 min-w-[10rem] max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                            <input
                                type="search"
                                placeholder="Buscar actividad, cliente o lugar…"
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#2464A3] rounded-lg outline-none text-xs"
                            />
                        </div>
                        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide shrink-0">
                            {([
                                { key: 'todos', label: 'Todos', value: stats.total },
                                { key: 'programado', label: 'Prog.', value: stats.programado },
                                { key: 'en_proceso', label: 'Proceso', value: stats.en_proceso },
                                { key: 'finalizado', label: 'Hecho', value: stats.finalizado },
                            ] as const).map(f => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setFilterStatus(f.key)}
                                    className={`px-2 py-1 rounded-md text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                                        filterStatus === f.key
                                            ? 'bg-slate-800 text-white'
                                            : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    {f.label} {f.value}
                                </button>
                            ))}
                        </div>
                        <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 shrink-0">
                            <Filter size={12} />
                            <select
                                value={filterTipo}
                                onChange={e => setFilterTipo(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#2464A3]"
                            >
                                <option value="todos">Todos los tipos</option>
                                {CONSTANTS.tipos.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </label>
                        {canSeeAllEvents && (
                            <button
                                type="button"
                                onClick={() => setOnlyMine(v => !v)}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                                    onlyMine
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                Míos
                            </button>
                        )}
                        <div className="relative ml-auto shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowLegend(v => !v)}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50"
                            >
                                Leyenda
                            </button>
                            {showLegend && (
                                <>
                                    <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar leyenda" onClick={() => setShowLegend(false)} />
                                    <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Tipos</p>
                                        <div className="space-y-1">
                                            {CONSTANTS.tipos.map(t => (
                                                <div key={t.value} className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-sm border border-black/10" style={{ backgroundColor: t.hex }} />
                                                    <span className="text-[11px] text-slate-600">{t.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {canSeePatronAlerts && (
                                            <>
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-2.5 mb-1.5">Patrones</p>
                                                {(['vencido', 'urgente7', 'proximo30', 'ok'] as PatronUrgency[]).map(u => (
                                                    <div key={u} className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-sm border border-black/10" style={{ backgroundColor: getPatronUrgencyHex(u) }} />
                                                        <span className="text-[11px] text-slate-600">{getPatronUrgencyLabel(u)}</span>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    {canSeePatronAlerts && upcomingPatrones.length > 0 && showPatronPanel && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/80 overflow-hidden">
                            <div className="flex items-center gap-2 px-2.5 py-1.5">
                                <ShieldCheck size={14} className="text-amber-600 shrink-0" />
                                <button type="button" onClick={() => setPatronListOpen(v => !v)} className="flex-1 min-w-0 text-left text-[12px] font-semibold text-amber-900 truncate">
                                    {patronAlertCount} patrón{patronAlertCount === 1 ? '' : 'es'} por vencer
                                </button>
                                <button type="button" onClick={() => setPatronListOpen(v => !v)} className="text-[11px] font-semibold text-amber-800">
                                    {patronListOpen ? 'Ocultar' : 'Ver'}
                                </button>
                                <button type="button" onClick={handleDismissPatronPanel} className="p-0.5 text-amber-500 hover:text-amber-800 rounded" aria-label="Descartar avisos">
                                    <X size={13} />
                                </button>
                            </div>
                            {patronListOpen && (
                                <ul className="max-h-28 overflow-y-auto custom-scrollbar divide-y divide-amber-100 bg-white/70">
                                    {upcomingPatrones.map(p => {
                                        const f = getPatronFechaVencimiento(p);
                                        const urgency = getPatronUrgency(p);
                                        const hex = getPatronUrgencyHex(urgency);
                                        let days = 0;
                                        try {
                                            if (f && isValid(parseISO(f))) days = differenceInDays(parseISO(f), new Date());
                                        } catch { /* ignore */ }
                                        return (
                                            <li key={p.id || p.noControl} className="flex items-center gap-2 px-2.5 py-1 text-[11px]">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                                                <span className="font-mono font-semibold text-slate-700">{p.noControl}</span>
                                                <span className="flex-1 truncate text-slate-600">{p.descripcion || p.nombre || '—'}</span>
                                                <span className="font-semibold shrink-0" style={{ color: hex }}>{getPatronUrgencyLabel(urgency)}</span>
                                                <span className="text-slate-400 shrink-0 tabular-nums">{f || '—'}{days >= 0 ? ` (${days}d)` : ''}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 p-2 sm:p-3 overflow-hidden flex flex-col min-h-0">
                {loading ? (
                    <div className="h-full flex items-center justify-center flex-col gap-3">
                        <div className="w-7 h-7 border-[3px] border-[#2464A3] border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-400 font-medium text-xs">Sincronizando…</p>
                    </div>
                ) : viewMode === 'calendar' ? (
                    <div className="flex-1 flex min-h-0 gap-2 overflow-hidden">
                        <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                            <div className="flex-1 min-h-0 p-1.5 sm:p-2 flex flex-col calendar-shell">
                                <Calendar
                                    localizer={localizer}
                                    events={filteredEvents}
                                    culture="es"
                                    date={calDate}
                                    view={calView}
                                    onNavigate={(next) => {
                                        setCalDate(next);
                                        if (calView === 'day') setSelectedDay(next);
                                    }}
                                    onView={(v) => setCalView(v as CalView)}
                                    startAccessor="start"
                                    endAccessor="end"
                                    components={{ toolbar: () => null, event: calendarEventComponent }}
                                    onSelectEvent={openEvent}
                                    onSelectSlot={(slot: { start: Date; action?: string }) => {
                                        setSelectedDay(slot.start);
                                        if (slot.action === 'doubleClick') openCreateForDay(slot.start);
                                    }}
                                    selectable
                                    popup
                                    eventPropGetter={eventPropGetter}
                                    dayPropGetter={dayPropGetter}
                                    views={['month', 'week', 'day', 'agenda']}
                                    messages={CALENDAR_MESSAGES}
                                    min={TIME_VIEW_MIN}
                                    max={TIME_VIEW_MAX}
                                    step={30}
                                    timeslots={2}
                                />
                            </div>
                        </div>
                        {calView !== 'agenda' && (
                            <div className="hidden xl:flex w-72 shrink-0 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                {agendaPanel}
                            </div>
                        )}
                    </div>
                ) : (
                    <GanttPTView
                        events={roleVisibleEvents}
                        onCellClick={handleGanttCellClick}
                        onEventClick={openEvent}
                        onDeleteMagnitud={handleDeleteMagnitud}
                        isCalidad={isCalidad}
                        canEdit={canEditEvents}
                        technicalStaff={users}
                        onUploadEvidencia={handleUploadEvidenciaPT}
                        currentUser={currentUserData}
                        authUid={authUser?.uid}
                    />
                )}
            </div>

            {showAgendaMobile && viewMode === 'calendar' && (
                <div className="fixed inset-0 z-40 xl:hidden">
                    <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Cerrar agenda" onClick={() => setShowAgendaMobile(false)} />
                    <div className="absolute inset-y-0 right-0 w-[min(100%,20rem)] shadow-2xl">
                        {agendaPanel}
                    </div>
                </div>
            )}

            <UnifiedEventModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} event={selectedEvent} initialData={initialModalData} technicalStaff={users} isCalidad={isCalidad} canEdit={canEditEvents} currentUser={currentUserData} authUid={authUser?.uid} />
            <Toaster position="top-center" toastOptions={{ duration: 2800, style: { borderRadius: 12, fontSize: 13, fontWeight: 600 } }} />

            <style>{`
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
                .calendar-shell .rbc-calendar { font-family: inherit; border: none; min-height: 0; height: 100%; display: flex; flex-direction: column; }
                .calendar-shell .rbc-month-view,
                .calendar-shell .rbc-time-view,
                .calendar-shell .rbc-agenda-view { border: none; border-radius: 0; overflow: hidden; background: #fff; flex: 1; min-height: 0; }
                .calendar-shell .rbc-month-view { display: flex; flex-direction: column; }
                .calendar-shell .rbc-month-row { border-top: 1px solid #eef2f7; min-height: 0; flex: 1 1 0; }
                .calendar-shell .rbc-month-view .rbc-row-content { min-height: 0; }
                .calendar-shell .rbc-month-view .rbc-row-segment { padding: 0 1px; }
                .calendar-shell .rbc-day-bg { border-left: 1px solid #eef2f7; }
                .calendar-shell .rbc-header { padding: 6px 2px; font-size: 0.68rem; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .calendar-shell .rbc-today { background-color: #eff6ff; box-shadow: inset 0 2px 0 #2464A3; }
                .calendar-shell .cal-day-selected { background-color: #dbeafe !important; }
                .calendar-shell .rbc-now .rbc-button-link { color: #2464A3; font-weight: 700; }
                .calendar-shell .rbc-event { border-radius: 4px !important; margin: 0 1px 1px !important; padding: 1px 4px !important; min-height: 0; box-shadow: none; }
                .calendar-shell .rbc-event:focus { outline: 2px solid rgba(36,100,163,0.35); }
                .calendar-shell .rbc-date-cell { padding: 2px 5px; font-size: 0.7rem; font-weight: 600; color: #475569; }
                .calendar-shell .rbc-off-range-bg { background: #f8fafc; }
                .calendar-shell .rbc-off-range { color: #94a3b8; }
                .calendar-shell .rbc-show-more { color: #2464A3; font-size: 0.65rem; font-weight: 600; background: transparent; }
                .calendar-shell .rbc-overlay { z-index: 50; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(15,23,42,0.12); }
                .calendar-shell .rbc-agenda-table { font-size: 0.8rem; }
                .calendar-shell .rbc-agenda-date-cell, .calendar-shell .rbc-agenda-time-cell { white-space: nowrap; }
                .calendar-shell .rbc-time-header-content, .calendar-shell .rbc-time-content { border-color: #eef2f7; }
                .calendar-shell .rbc-timeslot-group { min-height: 36px; }
                .calendar-shell .rbc-current-time-indicator { background-color: #2464A3; }
                .calendar-shell .rbc-toolbar { display: none; }
            `}</style>
        </OperationalScreenShell>
    );
};

export default CalendarScreen;