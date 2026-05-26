import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import es from 'date-fns/locale/es';
import parseISO from 'date-fns/parseISO';
import differenceInDays from 'date-fns/differenceInDays';
import isValid from 'date-fns/isValid';
import { collection, onSnapshot, query, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db, storage } from '../utils/firebase';
import { useNavigation } from '../hooks/useNavigation';
import { 
  ArrowLeft, Calendar as CalendarIcon, Clock, CheckCircle2, RotateCcw, 
  X, Users, ChevronLeft, ChevronRight, Search, MapPin, ShieldCheck,
  Building2, FileText, Settings, Zap, Eye, Bell, LayoutGrid, Plus, Trash2, Check, UserCheck, Shield, TableProperties,
  Upload, ExternalLink, Loader2
} from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { buildMensajeAsignacionServicio } from '../utils/asignacionNotificacion';
import { crearNotificacionAsignacion } from '../utils/notificacionesAsignacion';
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
  type PatronCalibracionRow,
  type PatronUrgency,
} from '../utils/patronCalibracion';

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
    { value: 'interlaboratorio', label: 'Interlaboratorio', icon: Building2, color: 'text-blue-600 bg-blue-50', hex: '#2563eb' },
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

// --- HELPERS DE COLORES Y USUARIOS ---
const getUserName = (idOrName: string, usersList: any[]) => {
    const user = usersList.find((u: any) => u.id === idOrName);
    return user ? user.nombre : idOrName; 
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

const UnifiedEventModal = ({ isOpen, onClose, event, initialData, technicalStaff, isCalidad, currentUser }: any) => {
    const [formData, setFormData] = useState({
        titulo: '', tipo: 'intralaboratorio', fecha: '', fechaFin: '', destino: '', laboratorioRef: '', descripcion: '', 
        estado: 'programado', personas: [] as string[], magnitudPT: '', comentariosPT: '' 
    });
    const [usarPlantilla, setUsarPlantilla] = useState(false);
    const [saving, setSaving] = useState(false);
    const [marking, setMarking] = useState(false);
    const [uploadingEvidencia, setUploadingEvidencia] = useState(false);

    const isPJLA = event?.esAlertaAutomatica || event?.cliente === 'Perry Johnson Labs';
    
    // Solo lectura si no es calidad y el evento NO es ni junta ni vuelta
    const isReadOnly = !isCalidad && event && event.tipo !== 'junta' && event.tipo !== 'vuelta';

    const sustaitaId = technicalStaff.find((u: any) => u.nombre?.toLowerCase().includes('sustaita'))?.id || '';

    useEffect(() => {
        if (event) {
            setFormData({
                titulo: event.title || '', tipo: event.tipo || 'intralaboratorio',
                fecha: event.start ? format(event.start, 'yyyy-MM-dd') : '',
                fechaFin: event.end ? format(event.end, 'yyyy-MM-dd') : '',
                destino: event.destino || '', laboratorioRef: event.laboratorioRef || '', descripcion: event.descripcion || '',
                estado: event.estado || 'programado', personas: event.personas || [],
                magnitudPT: event.magnitudPT || '', comentariosPT: event.comentariosPT || ''
            });
            setUsarPlantilla(false);
        } else if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData, tipo: initialData.tipo || (isCalidad ? 'intralaboratorio' : 'junta'), personas: initialData.tipo === 'mtto_patrones' && sustaitaId ? [sustaitaId] : [] }));
            setUsarPlantilla(false);
        } else {
            setFormData({ titulo: '', tipo: isCalidad ? 'intralaboratorio' : 'junta', fecha: '', fechaFin: '', destino: '', laboratorioRef: '', descripcion: '', estado: 'programado', personas: [], magnitudPT: '', comentariosPT: '' });
            setUsarPlantilla(false);
        }
    }, [event, initialData, isOpen, sustaitaId, isCalidad]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        // Si no es calidad, solo puede guardar Juntas y Vueltas
        if (!isCalidad && formData.tipo !== 'junta' && formData.tipo !== 'vuelta') return; 
        
        setSaving(true);
        try {
            const basePayload = {
                ...formData,
                cliente: formData.tipo.includes('inter') ? 'Externo' : 'Interno AG',
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
                        `${mensajeAsignacion} Ingresa al calendario para confirmar de enterado.`,
                        event.id
                    );
                }
            } else {
                if (usarPlantilla && (formData.tipo === 'interlaboratorio' || formData.tipo === 'intralaboratorio')) {
                    let curStart = formData.fecha;
                    for (const act of PLANTILLA_PT) {
                        const curEnd = addDaysNative(curStart, 2); 
                        const newPayload = { ...basePayload, titulo: act, elemento: act, fecha: curStart, fechaFin: curEnd };
                        await addDoc(collection(db, 'servicios'), { ...newPayload, enterados: [] });
                        curStart = addDaysNative(curEnd, 1); 
                    }
                    const mensajePt = buildMensajeAsignacionServicio({
                        titulo: `Estudio PT — ${formData.magnitudPT || formData.titulo}`,
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
                            `${mensajeNuevo} Ingresa al calendario para confirmar de enterado.`,
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
        // Puede eliminar si es calidad, o si es un evento que no es de calidad (junta/vuelta)
        const canDelete = isCalidad || event?.tipo === 'junta' || event?.tipo === 'vuelta';
        if (canDelete && event?.id && window.confirm('¿Eliminar esta actividad?')) {
            await deleteDoc(doc(db, 'servicios', event.id));
            onClose();
        }
    };

    const handleMarcarEnterado = async () => {
        if (!event?.id || !currentUser?.id) return;
        setMarking(true);
        try {
            const enteradosActuales = event.enterados || [];
            if (!enteradosActuales.includes(currentUser.id)) {
                await updateDoc(doc(db, 'servicios', event.id), { enterados: [...enteradosActuales, currentUser.id] });
                onClose(); 
            }
        } catch (error) { console.error(error); }
        finally { setMarking(false); }
    };

    const statusConfig = CONSTANTS.estados.find(e => e.value === (event?.estado || formData.estado)) || CONSTANTS.estados[0];
    const StatusIcon = statusConfig.icon;
    const yaEstaEnterado = event?.enterados?.includes(currentUser?.id);
    const isPT = event && (event.tipo === 'interlaboratorio' || event.tipo === 'intralaboratorio');
    const canUploadEvidencia = isPT && event?.id && (isCalidad || event.personas?.includes(currentUser?.id));

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
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                
                <div className={`px-6 py-4 border-b flex justify-between items-center ${isPJLA ? 'bg-pink-50 border-pink-100' : isReadOnly ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-slate-200'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {isPJLA && <span className="bg-pink-100 text-pink-700 border border-pink-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Bell size={10}/> PJLA Alert</span>}
                            {isReadOnly && !isPJLA && <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Eye size={10}/> Solo Lectura</span>}
                            {event && !isPJLA && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                                    <StatusIcon size={10} /> {statusConfig.label}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">{event ? (isReadOnly ? event.title : 'Editar Actividad') : 'Nueva Programación'}</h3>
                    </div>
                    <div className="flex gap-2">
                        {(!isReadOnly && event) && <button type="button" onClick={handleDelete} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={18}/></button>}
                        <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-xl transition-colors"><X size={18}/></button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    {isReadOnly || isPJLA ? (
                        <div className="space-y-4">
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
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Magnitud: {event.magnitudPT || 'N/A'}</p>
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

                            {!isPJLA && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Personal Asignado</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {event.personas?.map((pId: string, i: number) => {
                                            const enterado = event.enterados?.includes(pId);
                                            const nombre = getUserName(pId, technicalStaff);
                                            return (
                                                <div key={i} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar name={nombre} isEnterado={enterado} />
                                                        <span className="text-xs font-bold text-slate-700 truncate max-w-[100px]">{nombre}</span>
                                                    </div>
                                                    {enterado ? <CheckCircle2 size={14} className="text-emerald-500"/> : <Clock size={14} className="text-amber-500"/>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {!isPJLA && currentUser?.id && event.personas?.includes(currentUser.id) && !yaEstaEnterado && (
                                <button type="button" onClick={handleMarcarEnterado} disabled={marking} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mt-2">
                                    {marking ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <UserCheck size={18}/>}
                                    Confirmar Enterado
                                </button>
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

                            {(formData.tipo === 'interlaboratorio' || formData.tipo === 'intralaboratorio') && (
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                    <h4 className="text-[10px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-1"><TableProperties size={12}/> Datos Gantt PT</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <label className="text-[9px] font-bold text-blue-600 uppercase mb-1 block">Magnitud (Agrupador)</label>
                                            <input required value={formData.magnitudPT} onChange={e => setFormData({...formData, magnitudPT: e.target.value})} className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm outline-none" placeholder="Ej. Fuerza, Masa..." />
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

const GanttPTView = ({ events, onCellClick, onEventClick, isCalidad, technicalStaff, onUploadEvidencia, currentUser }: any) => {
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const monthsPT = ['Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo', 'Abril'];
    const ptEvents = events.filter(e => e.tipo === 'intralaboratorio' || e.tipo === 'interlaboratorio');

    const SORT_ORDER = PLANTILLA_PT.reduce((acc, val, idx) => ({ ...acc, [val]: idx }), {} as any);

    const groupedEvents = ptEvents.reduce((acc, ev) => {
        const mag = ev.magnitudPT || 'Sin Magnitud (Editar)';
        if (!acc[mag]) acc[mag] = [];
        acc[mag].push(ev);
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
        return { backgroundColor: '#2563eb', color: '#fff' }; 
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm mt-3">
            <div className="bg-[#00FF00] text-black font-bold text-center py-1.5 text-[11px] border-b border-slate-300 shrink-0">
                Programa y seguimiento de estudios Interlaboratorios
            </div>

            <div className="overflow-x-auto custom-scrollbar flex-1 relative">
                <table className="w-full min-w-[1500px] border-collapse bg-white text-xs">
                    <thead className="sticky top-0 z-40 bg-white shadow-sm">
                        <tr>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-20 sticky left-0 z-50 text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.1)]">Magnitud</th>
                            <th rowSpan={2} className="border border-slate-300 p-1.5 bg-[#0070C0] text-white font-bold w-48 sticky left-[80px] z-50 text-[10px] shadow-[2px_0_5px_rgba(0,0,0,0.1)]">Actividades</th>
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
                        {Object.keys(groupedEvents).map(magnitud => {
                            const eventosMag = groupedEvents[magnitud];
                            return (
                                <React.Fragment key={magnitud}>
                                    {eventosMag.map((ev, idx) => {
                                        const { startW, endW } = getWeekRangePT(ev.start, ev.end);
                                        const nombres = ev.personas?.length
                                            ? ev.personas.map((id: string) => getUserName(id, technicalStaff)).join(', ')
                                            : '—';
                                        const avanceReal = calculateAvance(ev);
                                        const puedeSubirEvidencia = isCalidad || (currentUser?.id && ev.personas?.includes(currentUser.id));
                                        const style = getActivityStyle(ev.title);

                                        return (
                                            <tr key={ev.id} className="hover:brightness-95 cursor-pointer transition-all h-7" onClick={() => onEventClick(ev)}>
                                                {idx === 0 && (
                                                    <td rowSpan={eventosMag.length} className="border border-slate-300 p-1 text-center bg-white font-bold text-slate-700 text-[9px] sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                        {magnitud}
                                                    </td>
                                                )}
                                                
                                                <td className="border border-slate-300 px-2 py-0.5 text-center font-bold text-[9px] sticky left-[80px] z-30 shadow-[2px_0_5px_rgba(0,0,0,0.02)] leading-tight" style={style} title={ev.title}>
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

const CustomEvent = ({ event }: any) => {
    const isPJLA = event.esAlertaAutomatica || event.cliente === 'Perry Johnson Labs';
    const Icon = event.esVencimientoPatron ? Settings : isPJLA ? Bell : (CONSTANTS.estados.find(e => e.value === event.estado)?.icon || CalendarIcon);
    
    // Calcular el color de fondo para saber si el texto debe ser oscuro o claro
    const hexColor = getEventHexColor(event);
    const useDarkText = isColorLight(hexColor);
    const textColorClass = useDarkText ? 'text-slate-900' : 'text-white';
    const subColorClass = useDarkText ? 'text-slate-600 font-bold' : 'text-white/80';

    return (
      <div className="flex flex-col h-full justify-center px-1 py-0.5 overflow-hidden">
        {/* Fila 1: Icono + Título de Actividad */}
        <div className="flex items-center gap-1 truncate">
          <Icon size={10} className={`${useDarkText ? 'text-slate-800' : 'text-white'} shrink-0`} />
          <span className={`text-[10px] leading-tight font-black truncate ${textColorClass}`}>{event.title}</span>
        </div>
        {/* Fila 2: NUEVO DETALLE - Planta / Destino */}
        {event.destino && (
          <div className={`text-[9px] leading-none opacity-90 truncate mt-0.5 flex items-center gap-0.5 ${subColorClass}`}>
            <MapPin size={8} className="shrink-0" />
            <span className="truncate">{event.destino}</span>
          </div>
        )}
      </div>
    );
};
  
const CustomToolbar = (toolbar: any) => (
      <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2"><button onClick={() => toolbar.onNavigate('PREV')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft size={18}/></button><button onClick={() => toolbar.onNavigate('TODAY')} className="px-3 py-1 text-[10px] font-black text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">Hoy</button><button onClick={() => toolbar.onNavigate('NEXT')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight size={18}/></button></div>
          <h2 className="text-lg font-black text-slate-800 capitalize tracking-tight">{format(toolbar.date, 'MMMM yyyy', { locale: es })}</h2>
          <div className="flex bg-slate-100 p-1 rounded-lg">{['month', 'week', 'day', 'agenda'].map(v => <button key={v} onClick={() => toolbar.onView(v)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${toolbar.view === v ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>{v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : v === 'day' ? 'Día' : 'Agenda'}</button>)}</div>
      </div>
);

// --- 6. COMPONENTE PRINCIPAL (SCREEN) ---

export const CalendarScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    
    const [authUser, setAuthUser] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    
    useEffect(() => {
        const auth = getAuth();
        const unsubAuth = onAuthStateChanged(auth, (user) => setAuthUser(user));
        return () => unsubAuth();
    }, []);

    const currentUserData = useMemo(() => {
        if (!authUser || users.length === 0) return null;
        return users.find(u => u.id === authUser.uid) || users.find(u => u.email === authUser.email) || null;
    }, [authUser, users]);

    const isCalidad = useMemo(() => {
        if (!currentUserData) return false;
        const puesto = (currentUserData.puesto || '').toLowerCase();
        return puesto.includes('calidad') || puesto.includes('admin') || puesto.includes('gerente');
    }, [currentUserData]);

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
    const [showPatronPanel, setShowPatronPanel] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
    const [initialModalData, setInitialModalData] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState('todos');
    const [searchText, setSearchText] = useState('');

    useEffect(() => {
        setLoading(true);
        const unsub = onSnapshot(query(collection(db, 'servicios')), async (snapshot) => {
            try {
                const usuariosSnap = await getDocs(collection(db, 'usuarios'));
                const fetchedUsers = usuariosSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                setUsers(fetchedUsers);

                const calendarEvents = snapshot.docs.map(doc => {
                    const data = doc.data();
                    let start = new Date(); let end = new Date();
                    
                    if (data.fecha) { const [y, m, d] = data.fecha.split('-').map(Number); start = new Date(y, m - 1, d); end = new Date(start); }
                    if (data.fechaFin) { const [y, m, d] = data.fechaFin.split('-').map(Number); end = new Date(y, m - 1, d); }
                    else if (data.horaFin) { const [h, min] = data.horaFin.split(':').map(Number); end.setHours(h, min); }

                    let pjlaUrl = data.url || null;
                    if (!pjlaUrl && data.archivos && data.archivos.length > 0 && typeof data.archivos[0] === 'string' && data.archivos[0].startsWith('http')) pjlaUrl = data.archivos[0];
                    if (!pjlaUrl && data.descripcion) {
                        const urlMatch = data.descripcion.match(/https?:\/\/[^\s]+/g);
                        if (urlMatch) pjlaUrl = urlMatch[0]; 
                    }
                    
                    return {
                        id: doc.id, title: data.titulo || data.elemento || 'Sin título', start, end,
                        cliente: data.cliente || 'Interno', estado: data.estado || 'programado', tipo: data.tipo || 'calibracion',
                        destino: data.destino || '', laboratorioRef: data.laboratorioRef || '', descripcion: data.descripcion,
                        personas: data.personas || [], enterados: data.enterados || [], documentos: data.archivos || [],
                        pjlaUrl: pjlaUrl, esAlertaAutomatica: data.esAlertaAutomatica || false,
                        magnitudPT: data.magnitudPT || '', comentariosPT: data.comentariosPT || '',
                        evidenciaUrl: data.evidenciaUrl || null,
                        evidenciaNombre: data.evidenciaNombre || '',
                        evidenciaFecha: data.evidenciaFecha || null,
                        evidenciaUrls: data.evidenciaUrls || []
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

    const handleUploadEvidenciaPT = async (servicioId: string, file: File) => {
        await uploadEvidenciaServicio(servicioId, file);
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

    const filteredServicioEvents = useMemo(() => {
        return events.filter(ev => {
            const isPJLA = ev.esAlertaAutomatica || ev.cliente === 'Perry Johnson Labs';
            
            // Si NO es de calidad, ocultamos los avisos de PJLA
            if (!isCalidad && isPJLA) return false;

            const matchStatus = filterStatus === 'todos' || ev.estado === filterStatus;
            const matchSearch = !searchText || ev.title.toLowerCase().includes(searchText.toLowerCase()) || ev.cliente.toLowerCase().includes(searchText.toLowerCase());
            return matchStatus && matchSearch;
        });
    }, [events, filterStatus, searchText, isCalidad]);

    const filteredEvents = useMemo(() => {
        if (!canSeePatronAlerts) return filteredServicioEvents;
        const patronFiltered = patronCalendarEvents.filter(ev => {
            if (!searchText) return true;
            const q = searchText.toLowerCase();
            return ev.title.toLowerCase().includes(q) || (ev.patronNoControl || '').toLowerCase().includes(q);
        });
        return [...filteredServicioEvents, ...patronFiltered];
    }, [filteredServicioEvents, patronCalendarEvents, searchText, canSeePatronAlerts]);

    const stats = useMemo(() => ({
        total: filteredEvents.length,
        programado: filteredEvents.filter(e => e.estado === 'programado').length,
        en_proceso: filteredEvents.filter(e => e.estado === 'en_proceso').length,
    }), [filteredEvents]);

    const eventPropGetter = useCallback((event: any) => {
        const hex = getEventHexColor(event);
        const darkText = isColorLight(hex);
        return { 
            style: { 
                backgroundColor: hex, 
                border: 'none', 
                color: darkText ? '#0f172a' : '#ffffff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
            } 
        };
    }, []);

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-[#f8fafc] font-sans text-slate-900 overflow-hidden">
            <main className="flex-1 flex flex-col h-full relative min-h-0">
                
                {/* --- HEADER --- */}
                <header className="bg-white border-b border-slate-200 px-4 py-2 sm:px-6 sm:py-3 flex flex-col md:flex-row md:items-center justify-between z-30 shadow-sm gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigateTo('servicios')} className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-500"><ArrowLeft size={18}/></button>
                        <div>
                            <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tighter leading-none">PLAN MAESTRO 2026</h2>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mt-0.5">Metrología y Control Normativo AG</p>
                        </div>
                        {canSeePatronAlerts && patronAlertCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                                <Bell size={10} /> {patronAlertCount} patrón{patronAlertCount !== 1 ? 'es' : ''}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 flex-1">
                        {viewMode === 'calendar' && (
                            <div className="relative flex-1 max-w-[200px] hidden md:block">
                                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                                 <input type="text" placeholder="Buscar..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 border rounded-lg outline-none transition-all text-xs" />
                            </div>
                        )}

                        <button onClick={() => { setSelectedEvent(null); setInitialModalData(null); setIsModalOpen(true); }} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                            <Plus size={14}/> {isCalidad ? 'Nueva Prueba' : 'Nueva Junta/Vuelta'}
                        </button>
                        
                        <div className="bg-slate-100 p-1 rounded-lg flex gap-0.5 border border-slate-200">
                            <button onClick={() => setViewMode('calendar')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${viewMode === 'calendar' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}><LayoutGrid size={14}/><span className="hidden sm:inline">Calendario</span></button>
                            
                            {/* PESTAÑAS GANTT SOLO PARA CALIDAD */}
                            {isCalidad && (
                                <button onClick={() => setViewMode('gantt_pt')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold flex items-center gap-1.5 transition-all ${viewMode === 'gantt_pt' ? 'bg-[#0070C0] shadow-md text-white' : 'text-slate-500'}`}><TableProperties size={14}/><span className="hidden sm:inline">Gantt PT</span></button>
                            )}
                        </div>
                    </div>
                </header>

                {/* --- FILTROS RÁPIDOS DEL CALENDARIO --- */}
                {viewMode === 'calendar' && (
                    <div className="px-4 py-1.5 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto scrollbar-hide shadow-sm z-20 shrink-0">
                         <button onClick={() => setFilterStatus('todos')} className={`flex flex-col items-start min-w-[80px] p-1.5 rounded-lg transition-all ${filterStatus === 'todos' ? 'bg-slate-100 border border-slate-300' : 'bg-white border border-transparent hover:bg-slate-50'}`}>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                            <span className="text-sm font-black text-slate-900 leading-none">{stats.total}</span>
                         </button>
                         <button onClick={() => setFilterStatus('programado')} className={`flex flex-col items-start min-w-[80px] p-1.5 rounded-lg transition-all ${filterStatus === 'programado' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-white border border-transparent hover:bg-slate-50'}`}>
                            <span className="text-[9px] font-bold uppercase tracking-widest">Pendientes</span>
                            <span className="text-sm font-black leading-none">{stats.programado}</span>
                         </button>
                         <button onClick={() => setFilterStatus('en_proceso')} className={`flex flex-col items-start min-w-[80px] p-1.5 rounded-lg transition-all ${filterStatus === 'en_proceso' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-white border border-transparent hover:bg-slate-50'}`}>
                            <span className="text-[9px] font-bold uppercase tracking-widest">En Proceso</span>
                            <span className="text-sm font-black leading-none">{stats.en_proceso}</span>
                         </button>
                    </div>
                )}

                {/* --- ÁREA PRINCIPAL DE CONTENIDO --- */}
                <div className="flex-1 p-2 sm:p-4 overflow-hidden bg-slate-50/50 flex flex-col min-h-0">
                    {viewMode === 'calendar' && canSeePatronAlerts && upcomingPatrones.length > 0 && showPatronPanel && (
                        <div className="mb-3 shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-amber-600" />
                                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Próximos vencimientos — patrones</span>
                                    {isCalidad && (
                                        <span className="text-[9px] text-slate-500 font-medium">Avisos: {PATRON_ALERT_DAYS.join(', ')} días antes</span>
                                    )}
                                </div>
                                <button type="button" onClick={() => setShowPatronPanel(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Ocultar lista">
                                    <X size={14} />
                                </button>
                            </div>
                            <ul className="max-h-28 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                                {upcomingPatrones.map(p => {
                                    const f = getPatronFechaVencimiento(p);
                                    const urgency = getPatronUrgency(p);
                                    const hex = getPatronUrgencyHex(urgency);
                                    let days = 0;
                                    try {
                                        if (f && isValid(parseISO(f))) days = differenceInDays(parseISO(f), new Date());
                                    } catch { /* ignore */ }
                                    return (
                                        <li key={p.id || p.noControl} className="flex items-center gap-3 px-3 py-2 text-xs">
                                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                                            <span className="font-mono font-bold text-slate-700">{p.noControl}</span>
                                            <span className="flex-1 truncate text-slate-600">{p.descripcion || p.nombre || '—'}</span>
                                            <span className="font-semibold shrink-0" style={{ color: hex }}>{getPatronUrgencyLabel(urgency)}</span>
                                            <span className="text-slate-400 shrink-0 tabular-nums">{f || '—'}{days >= 0 ? ` (${days}d)` : ''}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {loading ? (
                        <div className="h-full flex items-center justify-center flex-col gap-3"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p className="text-slate-400 font-bold text-xs">Sincronizando...</p></div>
                    ) : viewMode === 'calendar' ? (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col min-h-0 overflow-hidden">
                            {/* CALENDARIO */}
                            <div className="p-2 sm:p-4 flex-1 min-h-0">
                                <Calendar localizer={localizer} events={filteredEvents} culture='es' startAccessor="start" endAccessor="end" components={{ toolbar: CustomToolbar, event: CustomEvent }} onSelectEvent={ev => { if (!ev.esVencimientoPatron) { setSelectedEvent(ev); setIsModalOpen(true); } }} eventPropGetter={eventPropGetter} views={['month', 'week', 'day', 'agenda']} />
                            </div>
                            
                            {/* SIMBOLOGÍA INFERIOR */}
                            <div className="bg-slate-50 border-t border-slate-200 p-2 sm:px-4 py-3 flex flex-wrap gap-x-5 gap-y-2 items-center justify-center shrink-0">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-300 pr-4">Simbología</span>
                                {CONSTANTS.tipos.map(t => (
                                    <div key={t.value} className="flex items-center gap-1.5">
                                        <div className="w-3.5 h-3.5 rounded shadow-sm border border-black/10" style={{ backgroundColor: t.hex }}></div>
                                        <span className="text-[10px] font-bold text-slate-700">{t.label}</span>
                                    </div>
                                ))}
                                {canSeePatronAlerts && (
                                    <>
                                        <div className="w-px h-4 bg-slate-300" />
                                        {(['vencido', 'urgente7', 'proximo30', 'ok'] as PatronUrgency[]).map(u => (
                                            <div key={u} className="flex items-center gap-1.5">
                                                <div className="w-3.5 h-3.5 rounded shadow-sm border border-black/10" style={{ backgroundColor: getPatronUrgencyHex(u) }} />
                                                <span className="text-[10px] font-bold text-slate-700">Patrón {getPatronUrgencyLabel(u)}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <GanttPTView events={events} onCellClick={handleGanttCellClick} onEventClick={ev => { setSelectedEvent(ev); setIsModalOpen(true); }} isCalidad={isCalidad} technicalStaff={users} onUploadEvidencia={handleUploadEvidenciaPT} currentUser={currentUserData} />
                    )}
                </div>

                <UnifiedEventModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} event={selectedEvent} initialData={initialModalData} technicalStaff={users} isCalidad={isCalidad} currentUser={currentUserData} />
            </main>
            
            <style>{`
                .rbc-calendar { font-family: 'Inter', system-ui, sans-serif; border: none; min-height: 0; } 
                .rbc-month-view { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; } 
                .rbc-month-row { border-top: 1px solid #f1f5f9; min-height: 80px; }
                .rbc-day-bg { border-left: 1px solid #f1f5f9; }
                .rbc-header { padding: 10px 0; font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; background: #f8fafc; } 
                .rbc-today { background-color: #f0f9ff; } 
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; } 
                .rbc-event { border-radius: 6px !important; margin: 2px 3px !important; padding: 4px 6px !important; transition: transform 0.15s ease; }
                .rbc-event:hover { transform: scale(1.02); }
                .rbc-date-cell { padding: 4px 8px; font-size: 0.75rem; font-weight: 600; color: #334155; }
                .rbc-off-range-bg { background: #f8fafc; }
            `}</style>
        </div>
    );
};

export default CalendarScreen;