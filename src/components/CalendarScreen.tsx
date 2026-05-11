import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parseISO from 'date-fns/parseISO';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import es from 'date-fns/locale/es';
import { collection, onSnapshot, query, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db } from '../utils/firebase';
import { useNavigation } from '../hooks/useNavigation';
import { 
  ArrowLeft, Calendar as CalendarIcon, Clock, CheckCircle2, RotateCcw, 
  X, Users, ChevronLeft, ChevronRight, Search, MapPin, ShieldCheck,
  Building2, FileText, Settings, Zap, Eye, Bell, ListFilter, LayoutGrid, Plus, Trash2, Check, UserCheck, Shield
} from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// --- 1. CONFIGURACIÓN, TEMAS Y CONSTANTES ---

const locales = { 'es': es };
const localizer = dateFnsLocalizer({
  format, parse, startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }), getDay, locales,
});

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
    { value: 'actualizacion_norma', label: 'Aviso PJLA', icon: Bell, color: 'text-pink-600 bg-pink-50', hex: '#db2777' }
  ]
};

// --- HELPER PARA TRADUCIR ID A NOMBRE ---
const getUserName = (idOrName: string, usersList: any[]) => {
    const user = usersList.find((u: any) => u.id === idOrName);
    return user ? user.nombre : idOrName; 
};

const getInitials = (name: string) => name ? name.substring(0, 2).toUpperCase() : '??';

const PriorityBadge = ({ priority }: { priority: string }) => {
    const isHigh = priority === 'alta' || priority === 'critica';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${isHigh ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? 'bg-red-500' : 'bg-blue-500'}`} />
        {priority || 'media'}
      </span>
    );
};

const Avatar = ({ name, isEnterado }: { name: string, isEnterado?: boolean }) => (
    <div className="relative">
        <div title={name} className={`w-6 h-6 text-[10px] rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0 ${isEnterado ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
        {getInitials(name)}
        </div>
        {isEnterado && <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[1px]"><CheckCircle2 size={10} className="text-emerald-500" /></div>}
    </div>
);

// --- 2. MODAL ÚNICO INTELIGENTE (RBAC + ENTERADOS + NOTIFICACIONES) ---

const UnifiedEventModal = ({ isOpen, onClose, event, initialData, technicalStaff, isCalidad, currentUser }: any) => {
    const [formData, setFormData] = useState({
        titulo: '', tipo: 'intralaboratorio', fecha: '', fechaFin: '', destino: '', laboratorioRef: '', descripcion: '', estado: 'programado', personas: [] as string[]
    });
    const [saving, setSaving] = useState(false);
    const [marking, setMarking] = useState(false);

    const isPJLA = event?.esAlertaAutomatica || event?.cliente === 'Perry Johnson Labs';
    const isReadOnly = !isCalidad && event;

    const sustaitaId = technicalStaff.find((u: any) => u.nombre?.toLowerCase().includes('sustaita'))?.id || '';

    useEffect(() => {
        if (event) {
            setFormData({
                titulo: event.title || '', tipo: event.tipo || 'intralaboratorio',
                fecha: event.start ? format(event.start, 'yyyy-MM-dd') : '',
                fechaFin: event.end ? format(event.end, 'yyyy-MM-dd') : '',
                destino: event.destino || '', laboratorioRef: event.laboratorioRef || '', descripcion: event.descripcion || '',
                estado: event.estado || 'programado', personas: event.personas || [] 
            });
        } else if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData, personas: initialData.tipo === 'mtto_patrones' && sustaitaId ? [sustaitaId] : [] }));
        } else {
            setFormData({ titulo: '', tipo: 'intralaboratorio', fecha: '', fechaFin: '', destino: '', laboratorioRef: '', descripcion: '', estado: 'programado', personas: [] });
        }
    }, [event, initialData, isOpen, sustaitaId]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isCalidad) return; 
        setSaving(true);
        try {
            const payload = {
                ...formData,
                elemento: formData.titulo,
                cliente: formData.tipo.includes('inter') ? 'Externo' : 'Interno AG (Calidad)',
                prioridad: 'alta'
            };
            
            let docId = event?.id;

            if (docId) {
                await updateDoc(doc(db, 'servicios', docId), payload);
            } else {
                const newDoc = await addDoc(collection(db, 'servicios'), { ...payload, enterados: [] }); 
                docId = newDoc.id;
            }

            // --- SISTEMA DE NOTIFICACIONES ---
            // Revisamos a quiénes asignamos que no estaban antes para mandarles alerta
            const oldPersonas = event?.personas || [];
            const newPersonas = formData.personas.filter(pId => !oldPersonas.includes(pId));

            for (const uid of newPersonas) {
                // Formateamos la fecha para que se vea bonita en la notificación
                const fechaFormat = formData.fecha ? format(parseISO(formData.fecha), 'dd/MM/yyyy') : 'fecha por definir';
                await addDoc(collection(db, 'notificaciones'), {
                    usuarioId: uid,
                    titulo: 'Nueva Asignación de Calidad',
                    mensaje: `Fuiste programado para "${formData.titulo}" el ${fechaFormat}. Ingresa al calendario para confirmar de enterado.`,
                    leido: false,
                    fecha: new Date().toISOString(),
                    tipo: 'asignacion_calidad',
                    servicioId: docId
                });
            }

            onClose();
        } catch (error) { console.error(error); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (isCalidad && event?.id && window.confirm('¿Eliminar esta actividad?')) {
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
                await updateDoc(doc(db, 'servicios', event.id), {
                    enterados: [...enteradosActuales, currentUser.id]
                });
                onClose(); 
            }
        } catch (error) { console.error(error); }
        finally { setMarking(false); }
    };

    const statusConfig = CONSTANTS.estados.find(e => e.value === (event?.estado || formData.estado)) || CONSTANTS.estados[0];
    const StatusIcon = statusConfig.icon;
    const yaEstaEnterado = event?.enterados?.includes(currentUser?.id);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                
                <div className={`px-8 py-6 border-b flex justify-between items-center ${isPJLA ? 'bg-pink-50 border-pink-100' : isReadOnly ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50/50 border-slate-200'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            {isPJLA && <span className="bg-pink-100 text-pink-700 border border-pink-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Bell size={10}/> PJLA Alert</span>}
                            {isReadOnly && !isPJLA && <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1"><Eye size={10}/> Solo Lectura</span>}
                            {event && !isPJLA && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                                    <StatusIcon size={12} /> {statusConfig.label}
                                </span>
                            )}
                        </div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight">{event ? (isReadOnly ? event.title : 'Editar Actividad') : 'Nueva Programación'}</h3>
                    </div>
                    <div className="flex gap-2">
                        {isCalidad && event && <button type="button" onClick={handleDelete} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={20}/></button>}
                        <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-xl transition-colors"><X size={20}/></button>
                    </div>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar space-y-5">
                    
                    {/* --- VISTA DE SOLO LECTURA --- */}
                    {isReadOnly || isPJLA ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Periodo</p>
                                    <div className="space-y-1 text-slate-700 font-bold text-sm">
                                        <div className="flex items-center gap-2"><CalendarIcon size={14} className="text-blue-500"/> {format(event.start, "dd MMM yyyy", { locale: es })}</div>
                                        {event.start.getTime() !== event.end.getTime() && (
                                            <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500"/> {format(event.end, "dd MMM yyyy", { locale: es })}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {event.destino && (
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Destino</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm"><MapPin size={14} className="text-rose-500"/> {event.destino}</div>
                                        </div>
                                    )}
                                    {event.laboratorioRef && (
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex-1">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Laboratorio Referencia</p>
                                            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm"><Building2 size={14} className="text-blue-500"/> {event.laboratorioRef}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Instrucciones / Detalles</p>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{event.descripcion || 'Sin instrucciones adicionales.'}</div>
                            </div>

                            {/* BOTÓN PDF DE PJLA REFORZADO */}
                            {event.pjlaUrl && (
                                <a href={event.pjlaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 rounded-2xl border border-pink-200 hover:border-pink-500 hover:bg-pink-50 transition-all bg-white shadow-sm group">
                                    <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center group-hover:scale-110 transition-transform"><FileText size={20} /></div>
                                    <div className="flex-1">
                                        <span className="block text-sm text-slate-800 font-black">Abrir PDF Oficial PJLA</span>
                                        <span className="block text-xs text-slate-500 font-medium truncate">Documento de actualización normativa</span>
                                    </div>
                                </a>
                            )}

                            {!isPJLA && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Estado del Equipo Asignado</p>
                                    <div className="flex flex-col gap-2">
                                        {event.personas?.map((pId: string, i: number) => {
                                            const enterado = event.enterados?.includes(pId);
                                            const nombre = getUserName(pId, technicalStaff);
                                            return (
                                                <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar name={nombre} isEnterado={enterado} />
                                                        <span className="text-sm font-bold text-slate-700">{nombre}</span>
                                                    </div>
                                                    {enterado ? (
                                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg flex items-center gap-1"><CheckCircle2 size={12}/> ENTERADO</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex items-center gap-1"><Clock size={12}/> PENDIENTE</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {!isPJLA && currentUser?.id && event.personas?.includes(currentUser.id) && !yaEstaEnterado && (
                                <button type="button" onClick={handleMarcarEnterado} disabled={marking} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 mt-4">
                                    {marking ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <UserCheck size={20}/>}
                                    Confirmar Enterado de la Actividad
                                </button>
                            )}
                        </div>
                    ) : (
                        /* --- VISTA DE EDICIÓN --- */
                        <form onSubmit={handleSave} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Título / Magnitud</label>
                                    <input required value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500" placeholder="Ej. Bloques Patrón / Intralab..." />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Tipo</label>
                                    <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                                        {CONSTANTS.tipos.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estado</label>
                                    <select value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                                        {CONSTANTS.estados.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fecha Inicio</label>
                                    <input type="date" required value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fecha Fin</label>
                                    <input type="date" required value={formData.fechaFin} onChange={e => setFormData({...formData, fechaFin: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
                                </div>
                            </div>

                            {(formData.tipo.includes('intra') || formData.tipo.includes('inter')) && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Destino / Ubicación</label>
                                        <div className="relative">
                                            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input value={formData.destino} onChange={e => setFormData({...formData, destino: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Ej. Planta Sur..." />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Lab de Referencia</label>
                                        <div className="relative">
                                            <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input value={formData.laboratorioRef} onChange={e => setFormData({...formData, laboratorioRef: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Ej. CENAM, Mitutoyo..." />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Protocolo / Observaciones</label>
                                <textarea value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" rows={2} />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex justify-between">
                                    Participantes Asignados 
                                    <span className="text-blue-500 font-normal normal-case">Se les enviará notificación</span>
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {formData.personas.map((pId, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200">
                                            {getUserName(pId, technicalStaff)} 
                                            <button type="button" onClick={() => setFormData({...formData, personas: formData.personas.filter(n => n !== pId)})} className="hover:text-red-500"><X size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                                <select onChange={e => { 
                                    const val = e.target.value;
                                    if(val && !formData.personas.includes(val)) {
                                        setFormData({...formData, personas: [...formData.personas, val]});
                                    }
                                    e.target.value = ''; 
                                }} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none">
                                    <option value="">+ Asignar Personal Técnico...</option>
                                    {technicalStaff.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </select>
                            </div>

                            <button type="submit" disabled={saving} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 mt-4">
                                {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Check size={20}/>}
                                {event ? 'Actualizar Actividad' : 'Confirmar Programación'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- 4. VISTA GANTT INTERACTIVA ---

const GanttView = ({ events, onCellClick, onEventClick, isCalidad }: any) => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const categories = [
        { id: 'mtto_patrones', title: 'Mantenimiento de Patrones' },
        { id: 'intralaboratorio', title: 'Intralaboratorios' },
        { id: 'interlaboratorio', title: 'Interlaboratorios Externos' }
    ];

    const getWeekRange = (start: Date, end: Date) => {
        const getIdx = (d: Date) => (d.getMonth() * 4) + Math.min(3, Math.floor((d.getDate() - 1) / 7));
        return { startW: getIdx(start), endW: getIdx(end) };
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-xl mt-4">
            <div className="overflow-x-auto custom-scrollbar flex-1">
                <table className="w-full min-w-[1400px] border-collapse bg-white">
                    <thead className="sticky top-0 z-40 bg-white shadow-sm">
                        <tr>
                            <th rowSpan={2} className="border-b border-slate-200 p-4 text-left w-72 bg-slate-50 font-black text-slate-800 text-xs uppercase tracking-widest sticky left-0 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Magnitud / Prueba</th>
                            {months.map(m => <th key={m} colSpan={4} className="border border-slate-200 p-2 text-center text-[11px] font-black text-slate-600 uppercase bg-slate-100">{m}</th>)}
                        </tr>
                        <tr>
                            {Array.from({ length: 48 }).map((_, i) => {
                                const weekNum = i % 4;
                                const ranges = ['1-7', '8-14', '15-21', '22+'];
                                return (
                                    <th key={i} className="border border-slate-200 py-1.5 text-center bg-slate-50 min-w-[35px]">
                                        <div className="text-[10px] font-bold text-slate-600">S{weekNum + 1}</div>
                                        <div className="text-[9px] font-medium text-slate-400">{ranges[weekNum]}</div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map(cat => {
                            const config = CONSTANTS.tipos.find(t => t.value === cat.id);
                            const catEvents = events.filter(e => e.tipo === cat.id);

                            return (
                                <React.Fragment key={cat.id}>
                                    <tr className="bg-slate-100/50">
                                        <td colSpan={49} className="p-3 pl-6 text-[10px] font-black text-slate-900 border-y border-slate-200">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded bg-current opacity-80" style={{ color: config?.hex }}></div>
                                                {cat.title}
                                            </div>
                                        </td>
                                    </tr>
                                    {catEvents.length === 0 ? (
                                        <tr>
                                            <td onClick={() => isCalidad && onCellClick(cat.id, 0)} className={`border border-slate-200 p-4 italic text-slate-400 text-xs sticky left-0 bg-white z-20 ${isCalidad ? 'cursor-pointer hover:bg-blue-50' : ''}`}>Sin programar</td>
                                            {Array.from({ length: 48 }).map((_, i) => <td key={i} onClick={() => isCalidad && onCellClick(cat.id, i)} className={`border border-slate-100 ${isCalidad ? 'hover:bg-slate-50 cursor-crosshair' : ''}`}></td>)}
                                        </tr>
                                    ) : (
                                        catEvents.map(ev => {
                                            const { startW, endW } = getWeekRange(ev.start, ev.end);
                                            const isEnProceso = ev.estado === 'en_proceso';
                                            const isFinalizado = ev.estado === 'finalizado';
                                            
                                            const todosEnterados = ev.personas?.length > 0 && ev.personas.every((pId:string) => ev.enterados?.includes(pId));

                                            return (
                                                <tr key={ev.id} className="group h-10 hover:bg-slate-50/50">
                                                    <td onClick={() => onEventClick(ev)} className="border border-slate-200 p-2 pl-6 text-xs font-bold text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 z-20 cursor-pointer shadow-[2px_0_5px_rgba(0,0,0,0.02)] truncate max-w-[250px] flex items-center justify-between" title={ev.title}>
                                                        <span>{ev.title}</span>
                                                        {todosEnterados && !isFinalizado && <CheckCircle2 size={14} className="text-emerald-500 mr-2" title="Personal Enterado"/>}
                                                        {isFinalizado && <ShieldCheck size={14} className="text-blue-500 mr-2" title="Finalizado / Aprobado"/>}
                                                    </td>
                                                    {Array.from({ length: 48 }).map((_, i) => {
                                                        const active = i >= startW && i <= endW;
                                                        return (
                                                            <td key={i} onClick={() => active ? onEventClick(ev) : (isCalidad && onCellClick(cat.id, i))} className={`border border-slate-100 p-0 relative min-w-[35px] ${!active && isCalidad && 'hover:bg-slate-50 cursor-crosshair'}`}>
                                                                {active && (
                                                                    <div 
                                                                        className={`w-full h-full min-h-[35px] shadow-inner transition-opacity cursor-pointer flex items-center justify-center`} 
                                                                        style={{ 
                                                                            backgroundColor: config?.hex,
                                                                            opacity: isFinalizado ? 0.6 : 0.9,
                                                                            backgroundImage: isEnProceso ? 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.2) 5px, rgba(255,255,255,0.2) 10px)' : 'none'
                                                                        }}
                                                                        title={ev.title}
                                                                    >
                                                                        {isFinalizado && i === startW && <Check size={14} className="text-white"/>}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- 5. COMPONENTES DE CALENDARIO ---

const CustomEvent = ({ event }: any) => {
    const isPJLA = event.esAlertaAutomatica || event.cliente === 'Perry Johnson Labs';
    const Icon = isPJLA ? Bell : (CONSTANTS.estados.find(e => e.value === event.estado)?.icon || CalendarIcon);
    
    return (
      <div className="flex flex-col h-full justify-center px-1 overflow-hidden text-white">
        <div className="flex items-center gap-1.5 mb-0.5"><Icon size={12} className="text-white" /><span className="text-xs font-bold truncate text-white">{event.title}</span></div>
        <div className="flex items-center justify-between"><span className="text-[10px] truncate text-white/80">{event.cliente}</span></div>
      </div>
    );
};
  
const CustomToolbar = (toolbar: any) => (
      <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2"><button onClick={() => toolbar.onNavigate('PREV')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronLeft size={22}/></button><button onClick={() => toolbar.onNavigate('TODAY')} className="px-4 py-1 text-xs font-black text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Hoy</button><button onClick={() => toolbar.onNavigate('NEXT')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronRight size={22}/></button></div>
          <h2 className="text-2xl font-black text-slate-800 capitalize tracking-tight">{format(toolbar.date, 'MMMM yyyy', { locale: es })}</h2>
          <div className="flex bg-slate-100 p-1 rounded-xl">{['month', 'week', 'day', 'agenda'].map(v => <button key={v} onClick={() => toolbar.onView(v)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${toolbar.view === v ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>{v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : v === 'day' ? 'Día' : 'Agenda'}</button>)}</div>
      </div>
);

// --- 6. COMPONENTE PRINCIPAL (SCREEN) ---

export const CalendarScreen: React.FC = () => {
    const { navigateTo } = useNavigation();
    
    // --- AUTENTICACIÓN Y SEGURIDAD REAL ---
    const [authUser, setAuthUser] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    
    useEffect(() => {
        const auth = getAuth();
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            setAuthUser(user);
        });
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

    const [viewMode, setViewMode] = useState<'calendar' | 'gantt'>('calendar'); 
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
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

                    // MEJORA: Extracción infalible del PDF de PJLA usando regex global
                    let pjlaUrl = data.url || null;
                    if (!pjlaUrl && data.archivos && data.archivos.length > 0 && typeof data.archivos[0] === 'string' && data.archivos[0].startsWith('http')) {
                        pjlaUrl = data.archivos[0];
                    }
                    if (!pjlaUrl && data.descripcion) {
                        const urlMatch = data.descripcion.match(/https?:\/\/[^\s]+/);
                        if (urlMatch) pjlaUrl = urlMatch[0];
                    }
                    
                    return {
                        id: doc.id,
                        title: data.titulo || data.elemento || 'Sin título',
                        start, end,
                        cliente: data.cliente || 'Interno',
                        estado: data.estado || 'programado',
                        tipo: data.tipo || 'calibracion',
                        destino: data.destino || '',
                        laboratorioRef: data.laboratorioRef || '',
                        descripcion: data.descripcion,
                        personas: data.personas || [], 
                        enterados: data.enterados || [],
                        documentos: data.archivos || [],
                        pjlaUrl: pjlaUrl,
                        esAlertaAutomatica: data.esAlertaAutomatica || false
                    };
                });
                setEvents(calendarEvents);
            } catch (error) { console.error(error); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, []);

    const handleGanttCellClick = (catId: string, weekIdx: number) => {
        if (!isCalidad) return; 
        const month = Math.floor(weekIdx / 4);
        const day = ((weekIdx % 4) * 7) + 1;
        const dateStr = format(new Date(2026, month, day), 'yyyy-MM-dd');
        setInitialModalData({ tipo: catId, fecha: dateStr, fechaFin: dateStr });
        setSelectedEvent(null);
        setIsModalOpen(true);
    };

    const filteredEvents = useMemo(() => {
        return events.filter(ev => {
            const matchStatus = filterStatus === 'todos' || ev.estado === filterStatus;
            const matchSearch = !searchText || ev.title.toLowerCase().includes(searchText.toLowerCase()) || ev.cliente.toLowerCase().includes(searchText.toLowerCase());
            return matchStatus && matchSearch;
        });
    }, [events, filterStatus, searchText]);

    const stats = useMemo(() => ({
        total: events.length,
        programado: events.filter(e => e.estado === 'programado').length,
        en_proceso: events.filter(e => e.estado === 'en_proceso').length,
    }), [events]);

    const eventPropGetter = useCallback((event: any) => {
        if (event.esAlertaAutomatica || event.cliente === 'Perry Johnson Labs') {
            return { style: { backgroundColor: '#db2777', opacity: 0.9, border: 'none', color: '#ffffff', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' } };
        }
        const config = CONSTANTS.tipos.find(t => t.value === event.tipo);
        return { style: { backgroundColor: config ? config.hex : '#3b82f6', opacity: 0.95, border: 'none', color: '#ffffff', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600' } };
    }, []);

    return (
        <div className="flex h-screen bg-[#f1f5f9] font-sans text-slate-900 overflow-hidden">
            <main className="flex-1 flex flex-col h-full relative">
                
                {/* --- HEADER --- */}
                <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between z-30 shadow-sm gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigateTo('servicios')} className="p-2.5 hover:bg-slate-100 rounded-xl transition-all text-slate-500"><ArrowLeft size={20}/></button>
                        <div>
                            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">PLAN MAESTRO 2026</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Metrología y Control Normativo AG</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {viewMode === 'calendar' && (
                            <div className="relative flex-1 md:w-64 group hidden lg:block">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors"/>
                                 <input type="text" placeholder="Buscar evento o cliente..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 border rounded-xl outline-none transition-all text-sm" />
                            </div>
                        )}

                        {isCalidad && (
                            <button onClick={() => { setSelectedEvent(null); setInitialModalData(null); setIsModalOpen(true); }} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2">
                                <Plus size={18}/> NUEVA PRUEBA
                            </button>
                        )}
                        <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 border border-slate-200">
                            <button onClick={() => setViewMode('calendar')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'calendar' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500'}`}><LayoutGrid size={16}/> Calendario</button>
                            <button onClick={() => setViewMode('gantt')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'gantt' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500'}`}><ListFilter size={16}/> Gantt Calidad</button>
                        </div>
                    </div>
                </header>

                {/* --- FILTROS RÁPIDOS DEL CALENDARIO --- */}
                {viewMode === 'calendar' && (
                    <div className="px-6 py-2 overflow-x-auto border-b border-slate-200 bg-white flex items-center gap-4 scrollbar-hide shadow-sm z-20">
                         <button onClick={() => setFilterStatus('todos')} className={`flex flex-col items-start min-w-[100px] p-2 rounded-xl transition-all ${filterStatus === 'todos' ? 'bg-slate-100 border-slate-300' : 'bg-white border-transparent hover:bg-slate-50'}`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                            <span className="text-xl font-black text-slate-900">{stats.total}</span>
                         </button>
                         <button onClick={() => setFilterStatus('programado')} className={`flex flex-col items-start min-w-[100px] p-2 rounded-xl transition-all ${filterStatus === 'programado' ? 'bg-blue-50 text-blue-700' : 'bg-white border-transparent hover:bg-slate-50'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-widest">Pendientes</span>
                            <span className="text-xl font-black">{stats.programado}</span>
                         </button>
                         <button onClick={() => setFilterStatus('en_proceso')} className={`flex flex-col items-start min-w-[100px] p-2 rounded-xl transition-all ${filterStatus === 'en_proceso' ? 'bg-amber-50 text-amber-700' : 'bg-white border-transparent hover:bg-slate-50'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-widest">En Proceso</span>
                            <span className="text-xl font-black">{stats.en_proceso}</span>
                         </button>
                    </div>
                )}

                {/* --- ÁREA PRINCIPAL DE CONTENIDO --- */}
                <div className="flex-1 p-6 overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
                    {loading ? (
                        <div className="h-full flex items-center justify-center flex-col gap-4 animate-pulse"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p className="text-slate-400 font-bold text-sm">Sincronizando plataforma...</p></div>
                    ) : viewMode === 'calendar' ? (
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl h-full p-6 flex flex-col">
                            <Calendar localizer={localizer} events={filteredEvents} culture='es' startAccessor="start" endAccessor="end" components={{ toolbar: CustomToolbar, event: CustomEvent }} onSelectEvent={ev => { setSelectedEvent(ev); setIsModalOpen(true); }} eventPropGetter={eventPropGetter} views={['month', 'week', 'day', 'agenda']} />
                        </div>
                    ) : (
                        <GanttView events={events} onCellClick={handleGanttCellClick} onEventClick={ev => { setSelectedEvent(ev); setIsModalOpen(true); }} isCalidad={isCalidad} />
                    )}
                </div>

                <UnifiedEventModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} event={selectedEvent} initialData={initialModalData} technicalStaff={users} isCalidad={isCalidad} currentUser={currentUserData} />
            </main>
            
            <style>{`.rbc-calendar { font-family: inherit; } .rbc-month-view { border: none; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; } .rbc-header { padding: 15px 0; font-size: 11px; color: #94a3b8; font-weight: 800; border-bottom: 1px solid #f1f5f9; text-transform: uppercase; letter-spacing: 0.05em; } .rbc-today { background-color: #f0f9ff; } .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; } .rbc-event { border-radius: 6px !important; margin-bottom: 3px; padding: 2px 4px !important; }`}</style>
        </div>
    );
};

export default CalendarScreen;