import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  ArrowLeft, Plus, Calendar, Search, Filter, Eye, Edit3, Trash2, X, 
  CheckCircle2, RotateCcw, Play, AlertCircle, Clock, AlertTriangle, 
  Briefcase, Settings, Zap, Paperclip, Users, Upload, 
  Building2, Phone, Mail, FileText, Info, Send, Menu, 
  LayoutGrid, List as ListIcon, MapPin, User, MoreHorizontal, MessageCircle
} from 'lucide-react';

import { 
  doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, 
  orderBy, serverTimestamp, getDocs, where 
} from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ==========================================
// 1. HELPERS & UTILS (Sin librerías extra)
// ==========================================

const formatDateRelative = (dateString: string) => {
  if (!dateString) return 'Sin fecha';
  const date = new Date(dateString + 'T12:00:00'); // Compensar zona horaria básica
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1 && diffDays < 7) return `En ${diffDays} días`;
  
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

const getInitials = (name: string) => {
  return name ? name.substring(0, 2).toUpperCase() : '??';
};

// ==========================================
// 2. CONSTANTES
// ==========================================

const CONSTANTS = {
  estados: [
    { value: 'programado', label: 'Programado', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', barColor: 'bg-blue-500' },
    { value: 'en_proceso', label: 'En Proceso', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', barColor: 'bg-amber-500' },
    { value: 'finalizado', label: 'Finalizado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', barColor: 'bg-emerald-500' },
    { value: 'reprogramacion', label: 'Reprogramación', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', barColor: 'bg-purple-500' }
  ],
  prioridades: [
    { value: 'baja', label: 'Baja', color: 'text-slate-600', bg: 'bg-slate-100' },
    { value: 'media', label: 'Media', color: 'text-blue-600', bg: 'bg-blue-50' },
    { value: 'alta', label: 'Alta', color: 'text-orange-600', bg: 'bg-orange-50' },
    { value: 'critica', label: 'Crítica', color: 'text-red-600', bg: 'bg-red-50' }
  ],
  tipos: [
    { value: 'calibracion', label: 'Calibración', icon: Settings },
    { value: 'mantenimiento', label: 'Mantenimiento', icon: Briefcase },
    { value: 'verificacion', label: 'Verificación', icon: CheckCircle2 },
    { value: 'reparacion', label: 'Reparación', icon: Zap },
    { value: 'inspeccion', label: 'Inspección', icon: Eye }
  ]
};

// ==========================================
// 3. COMPONENTES VISUALES (UI)
// ==========================================

const AvatarStack = ({ userIds, users, limit = 3 }: { userIds: string[], users: any[], limit?: number }) => {
  if (!userIds || userIds.length === 0) return <span className="text-xs text-gray-400 italic">Sin asignar</span>;

  const displayUsers = userIds.slice(0, limit);
  const remaining = userIds.length - limit;

  return (
    <div className="flex -space-x-2 overflow-hidden">
      {displayUsers.map((id, i) => {
        const user = users.find(u => u.id === id);
        return (
          <div key={i} title={user?.name || 'Usuario'} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 ring-2 ring-white text-[9px] font-bold text-indigo-600">
            {getInitials(user?.name || user?.nombre)}
          </div>
        );
      })}
      {remaining > 0 && (
        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 ring-2 ring-white text-[9px] text-gray-500 font-medium">
          +{remaining}
        </div>
      )}
    </div>
  );
};

const Badge = ({ config, value, className = "" }: any) => {
  const item = config.find((c: any) => c.value === value) || config[0];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider border ${item.bg} ${item.color} ${item.border || 'border-transparent'} ${className}`}>
      {item.label}
    </span>
  );
};

// --- COMPONENTE: KANBAN CARD ---
const ServiceKanbanCard = ({ service, onClick, users }: any) => {
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado) || CONSTANTS.estados[0];
  const typeConfig = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const TypeIcon = typeConfig?.icon || Settings;

  return (
    <div 
      onClick={onClick}
      className="group relative bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Barra lateral de estado */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusConfig.barColor}`} />

      <div className="pl-2">
        <div className="flex justify-between items-start mb-2">
           <Badge config={CONSTANTS.prioridades} value={service.prioridad} />
           {service.archivos?.length > 0 && (
             <Paperclip className="w-3 h-3 text-gray-400 transform rotate-45" />
           )}
        </div>

        <h4 className="font-bold text-gray-800 leading-tight mb-1 line-clamp-2 text-sm">
          {service.titulo}
        </h4>
        
        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-3">
          <Building2 className="w-3 h-3 text-gray-400" />
          <span className="truncate font-medium max-w-[180px]">{service.cliente || 'Cliente General'}</span>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-2">
           <AvatarStack userIds={service.personas} users={users} />
           
           <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md ${service.fecha ? 'bg-gray-50 text-gray-600' : 'bg-red-50 text-red-500'}`}>
             <Calendar className="w-3 h-3" />
             {formatDateRelative(service.fecha)}
           </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE: LIST ITEM ---
const ServiceListItem = ({ service, onClick, users }: any) => {
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado);

  return (
    <div 
      onClick={onClick}
      className="group bg-white rounded-xl p-3 border border-gray-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex items-center gap-4"
    >
       <div className={`w-2 h-12 rounded-full ${statusConfig?.barColor}`} />
       
       <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Info Principal */}
          <div className="md:col-span-5">
             <h4 className="font-bold text-gray-900 truncate">{service.titulo}</h4>
             <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Building2 className="w-3 h-3"/> {service.cliente}</span>
             </div>
          </div>

          {/* Status & Date */}
          <div className="md:col-span-3 flex md:flex-col gap-2 md:gap-1">
             <Badge config={CONSTANTS.estados} value={service.estado} />
             <span className="text-xs text-gray-400 flex items-center gap-1">
               <Calendar className="w-3 h-3"/> {formatDateRelative(service.fecha)}
             </span>
          </div>

          {/* Users */}
          <div className="md:col-span-3 flex justify-start md:justify-center">
             <AvatarStack userIds={service.personas} users={users} limit={4} />
          </div>

          {/* Actions */}
          <div className="md:col-span-1 flex justify-end">
             <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transform rotate-180 transition-colors" />
          </div>
       </div>
    </div>
  );
};

const FilePreviewItem = ({ file, onRemove, onClick, readOnly = false }: any) => {
  const isUrl = typeof file === 'string';
  let name = 'Archivo';
  if (isUrl) {
    try { name = decodeURIComponent(file.split('/').pop()?.split('?')[0] || '').replace(/^\d+_/, ''); } catch (e) {}
  } else { name = file.name; }
  
  return (
    <div onClick={onClick} className={`group flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-lg transition-all ${onClick ? 'cursor-pointer hover:border-blue-400' : ''}`}>
      <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-600"><FileText className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0"><p className="text-xs font-medium text-gray-900 truncate">{name}</p></div>
      {onRemove && !readOnly && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>}
    </div>
  );
};

// ==========================================
// 4. MODALES (Detalle y Formulario)
// ==========================================

const ServiceDetailModal = ({ isOpen, onClose, service, onEdit, onDelete, onViewFile, metrologos }: any) => {
  if (!isOpen || !service) return null;
  const tipoInfo = CONSTANTS.tipos.find(t => t.value === service.tipo);

  const handleWhatsApp = () => {
    if(!service.telefono) return toast.error('No hay teléfono registrado');
    const cleanPhone = service.telefono.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=Hola, respecto al servicio: ${service.titulo}...`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50">
          <div className="flex-1 min-w-0 pr-4">
             <div className="flex items-center gap-2 mb-2">
                <Badge config={CONSTANTS.estados} value={service.estado} />
                <Badge config={CONSTANTS.prioridades} value={service.prioridad} />
             </div>
             <h2 className="text-xl font-bold text-gray-900">{service.titulo}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8 bg-white">
            {/* Cliente Card */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex flex-col md:flex-row justify-between gap-4">
               <div>
                  <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Cliente</h3>
                  <p className="text-lg font-bold text-gray-900">{service.cliente || 'No especificado'}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                     {service.contacto && <span className="flex items-center gap-1"><User className="w-3 h-3"/> {service.contacto}</span>}
                     {service.ubicacion && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {service.ubicacion}</span>}
                  </div>
               </div>
               <div className="flex gap-2 items-center md:items-start">
                   {service.telefono && (
                     <button onClick={handleWhatsApp} className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-sm text-sm font-medium">
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                     </button>
                   )}
                   {service.email && (
                     <a href={`mailto:${service.email}`} className="p-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                        <Mail className="w-5 h-5" />
                     </a>
                   )}
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Columna Izquierda: Detalles */}
                <div className="md:col-span-2 space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Descripción</h3>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
                            {service.descripcion || 'Sin descripción proporcionada.'}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2"><Paperclip className="w-4 h-4"/> Adjuntos</h3>
                        {service.archivos?.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {service.archivos.map((file: string, idx: number) => (
                                    <FilePreviewItem key={idx} file={file} readOnly={true} onClick={() => onViewFile(file)} />
                                ))}
                            </div>
                        ) : <p className="text-sm text-gray-400 italic">No hay archivos adjuntos</p>}
                    </div>
                </div>

                {/* Columna Derecha: Meta Info */}
                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Detalles</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                                <span className="text-gray-500">Tipo</span>
                                <span className="font-medium flex items-center gap-1">{tipoInfo?.icon && <tipoInfo.icon className="w-3 h-3"/>} {tipoInfo?.label}</span>
                            </div>
                            <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                                <span className="text-gray-500">Fecha</span>
                                <span className="font-medium text-blue-600">{service.fecha ? formatDateRelative(service.fecha) : '--'}</span>
                            </div>
                            <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                                <span className="text-gray-500">Horario</span>
                                <span className="font-medium">{service.horaInicio || '--'} - {service.horaFin || '--'}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Personal</h3>
                        <div className="space-y-2">
                            {service.personas?.map((id: string) => {
                                const m = metrologos.find((u:any) => u.id === id);
                                return (
                                    <div key={id} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-gray-50 border border-gray-100">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">{getInitials(m?.name)}</div>
                                        <span className="truncate">{m?.name || 'Desconocido'}</span>
                                    </div>
                                )
                            })}
                            {!service.personas?.length && <p className="text-sm text-gray-400 italic">Sin asignar</p>}
                        </div>
                    </div>
                </div>
            </div>

            {service.notas && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 flex gap-3">
                    <Info className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    <div>
                        <h4 className="text-yellow-800 font-bold text-sm mb-1">Notas Internas</h4>
                        <p className="text-yellow-700 text-sm">{service.notas}</p>
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
             <button onClick={() => onDelete(service.id)} className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                <Trash2 className="w-4 h-4" /> Eliminar
             </button>
             <button onClick={() => onEdit(service)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all">
                <Edit3 className="w-4 h-4" /> Editar Servicio
             </button>
        </div>
      </div>
    </div>
  );
};

const ServiceFormModal = ({ isOpen, onClose, initialData, onSubmit, loading, clientes, metrologos }: any) => {
  const [formData, setFormData] = useState(initialData);
  const [activeTab, setActiveTab] = useState('general'); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setFormData(initialData); }, [initialData]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };
  
  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find((c: any) => c.id === clienteId);
    if (cliente) {
      setFormData((prev: any) => ({
        ...prev, clienteId, cliente: cliente.nombre || cliente.razonSocial,
        contacto: cliente.contactoPrincipal || '', telefono: cliente.telefono || '',
        email: cliente.email || '', ubicacion: cliente.direccion || ''
      }));
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'General', icon: Info },
    { id: 'cliente', label: 'Cliente', icon: Building2 },
    { id: 'equipo', label: 'Personal', icon: Users },
    { id: 'archivos', label: 'Adjuntos', icon: Paperclip },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
          <h2 className="text-xl font-bold text-gray-900">{formData.id ? 'Editar Servicio' : 'Nuevo Servicio'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b border-gray-100 px-6 bg-gray-50/50 gap-6 overflow-x-auto">
          {tabs.map(tab => (
               <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                 <tab.icon className="w-4 h-4" /> {tab.label}
               </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
          {activeTab === 'general' && (
            <div className="space-y-6">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Título del Servicio *</label>
                  <input type="text" value={formData.titulo} onChange={e => handleChange('titulo', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej. Calibración Balanza" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                    <label className="text-sm font-semibold text-gray-700">Estado</label>
                    <select value={formData.estado} onChange={e => handleChange('estado', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none">
                        {CONSTANTS.estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                   </div>
                   <div>
                    <label className="text-sm font-semibold text-gray-700">Prioridad</label>
                    <select value={formData.prioridad} onChange={e => handleChange('prioridad', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none">
                        {CONSTANTS.prioridades.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                   </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="col-span-2 md:col-span-1">
                        <label className="text-sm font-semibold text-gray-700">Fecha</label>
                        <input type="date" value={formData.fecha} onChange={e => handleChange('fecha', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700">Hora Inicio</label>
                        <input type="time" value={formData.horaInicio} onChange={e => handleChange('horaInicio', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700">Hora Fin</label>
                        <input type="time" value={formData.horaFin} onChange={e => handleChange('horaFin', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700">Descripción</label>
                  <textarea rows={4} value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} className="w-full mt-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                </div>
            </div>
          )}

          {activeTab === 'cliente' && (
            <div className="space-y-6">
                <div>
                    <label className="text-sm font-semibold text-gray-700">Seleccionar Cliente</label>
                    <select value={formData.clienteId} onChange={e => handleClienteChange(e.target.value)} className="w-full mt-1 px-4 py-3 bg-blue-50/50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">-- Buscar Cliente --</option>
                        {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre || c.razonSocial}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                  <input type="text" value={formData.contacto} onChange={e => handleChange('contacto', e.target.value)} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg" placeholder="Contacto" />
                  <input type="tel" value={formData.telefono} onChange={e => handleChange('telefono', e.target.value)} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg" placeholder="Teléfono" />
                  <input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg" placeholder="Email" />
                  <input type="text" value={formData.ubicacion} onChange={e => handleChange('ubicacion', e.target.value)} className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg" placeholder="Dirección / Ubicación" />
                </div>
            </div>
          )}

          {activeTab === 'equipo' && (
            <div className="space-y-6">
               <h3 className="font-semibold text-gray-900">Asignar Metrólogos</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                   {metrologos.map((m: any) => {
                     const selected = formData.personas.includes(m.id);
                     return (
                       <div key={m.id} onClick={() => {
                           const newPersonas = selected ? formData.personas.filter((id: string) => id !== m.id) : [...formData.personas, m.id];
                           handleChange('personas', newPersonas);
                       }} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-gray-200 hover:border-blue-200'}`}>
                         <div className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                           {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                         </div>
                         <div>
                           <p className="text-sm font-medium text-gray-900">{m.name || m.nombre}</p>
                           <p className="text-xs text-gray-500">{m.position || 'Técnico'}</p>
                         </div>
                       </div>
                     );
                   })}
               </div>
               <div className="pt-4">
                  <label className="text-sm font-semibold text-gray-700">Notas Privadas</label>
                  <textarea rows={3} value={formData.notas} onChange={e => handleChange('notas', e.target.value)} className="w-full mt-1 px-4 py-2 bg-yellow-50/50 border border-yellow-200 rounded-lg outline-none" placeholder="Notas visibles solo para el equipo..." />
               </div>
            </div>
          )}

          {activeTab === 'archivos' && (
             <div className="space-y-4">
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:bg-gray-50 cursor-pointer transition-colors">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                     <Upload className="w-6 h-6 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Clic para subir archivos</p>
                  <p className="text-xs text-gray-400 mt-1">Soporta PDF, PNG, JPG</p>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) handleChange('archivos', [...formData.archivos, ...Array.from(e.target.files)]); }} />
                </div>
                {formData.archivos.length > 0 && (
                  <div className="space-y-2">
                    {formData.archivos.map((file: any, idx: number) => (
                      <FilePreviewItem key={idx} file={file} onRemove={() => handleChange('archivos', formData.archivos.filter((_:any, i:number) => i !== idx))} />
                    ))}
                  </div>
                )}
             </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-xl transition-colors">Cancelar</button>
          <button onClick={() => onSubmit(formData)} disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all disabled:opacity-70">
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Settings className="w-5 h-5" />}
            {formData.id ? 'Guardar Cambios' : 'Crear Servicio'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 5. COMPONENTE PRINCIPAL (Screen)
// ==========================================

const FridayServiciosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // --- Estados de Datos ---
  const [servicios, setServicios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [metrologos, setMetrologos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  
  // --- Estados de UI ---
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  // --- Filtros ---
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');

  // --- Modals ---
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<any | null>(null);

  const initialFormState = {
    titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media', 
    estado: 'programado', fecha: '', horaInicio: '', horaFin: '', 
    ubicacion: '', clienteId: '', cliente: '', contacto: '', telefono: '', 
    email: '', personas: [], archivos: [], notas: ''
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setViewMode('list');
    };
    window.addEventListener('resize', handleResize);
    
    // --- Cargar Datos ---
    const loadData = async () => {
      try {
        const qServicios = query(collection(db, 'servicios'), orderBy('fechaCreacion', 'desc'));
        const unsub = onSnapshot(qServicios, (snap) => {
          setServicios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });

        const [usersSnap, clientsSnap] = await Promise.all([
          getDocs(query(collection(db, 'usuarios'))),
          getDocs(query(collection(db, 'clientes')))
        ]);

        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsuarios(users);
        setMetrologos(users.filter((u: any) => 
          ['metrologo', 'metrólogo', 'técnico'].some(role => (u.position || u.puesto || '').toLowerCase().includes(role))
        ));
        setClientes(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        return () => unsub();
      } catch (e) {
        console.error(e);
        toast.error('Error cargando datos');
        setLoading(false);
      }
    };
    loadData();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filteredServices = useMemo(() => {
    return servicios.filter(s => {
      const matchText = !filterText || 
        s.titulo.toLowerCase().includes(filterText.toLowerCase()) || 
        s.cliente?.toLowerCase().includes(filterText.toLowerCase());
      const matchStatus = filterStatus === 'todos' || s.estado === filterStatus;
      return matchText && matchStatus;
    });
  }, [servicios, filterText, filterStatus]);

  const stats = useMemo(() => ({
    total: servicios.length,
    programados: servicios.filter(s => s.estado === 'programado').length,
    enProceso: servicios.filter(s => s.estado === 'en_proceso').length,
    atencion: servicios.filter(s => s.prioridad === 'critica' || s.prioridad === 'alta').length
  }), [servicios]);

  // --- Handlers ---
  const handleSaveService = async (data: any) => {
    if (!data.titulo.trim()) return toast.warn('El título es obligatorio');
    setProcessing(true);

    try {
      let uploadedUrls: string[] = [];
      const filesToUpload = data.archivos.filter((f: any) => typeof f !== 'string');
      const existingUrls = data.archivos.filter((f: any) => typeof f === 'string');

      if (filesToUpload.length > 0) {
        uploadedUrls = await Promise.all(filesToUpload.map(async (file: File) => {
          const refStorage = ref(storage, `servicios/${Date.now()}_${file.name}`);
          const snap = await uploadBytes(refStorage, file);
          return getDownloadURL(snap.ref);
        }));
      }

      const finalData = {
        ...data,
        archivos: [...existingUrls, ...uploadedUrls],
        ultimaActualizacion: serverTimestamp(),
        actualizadoPor: localStorage.getItem('usuario_id') || 'unknown'
      };

      if (data.id) {
        await updateDoc(doc(db, 'servicios', data.id), finalData);
        toast.success('Servicio actualizado');
      } else {
        await addDoc(collection(db, 'servicios'), {
          ...finalData,
          fechaCreacion: serverTimestamp(),
          creadoPor: localStorage.getItem('usuario_id') || 'unknown'
        });
        toast.success('Servicio creado');
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Error al guardar');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Eliminar servicio permanentemente?')) {
      try {
        await deleteDoc(doc(db, 'servicios', id));
        toast.success('Eliminado correctamente');
        setIsDetailOpen(false);
      } catch (e) { toast.error('Error al eliminar'); }
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      
      {/* Sidebar Placeholder (Asumimos que SidebarFriday existe o se importa) */}
      <div className="hidden lg:block w-64 bg-white h-full border-r border-gray-200">
        {/* Aquí iría <SidebarFriday /> si estuviera en el mismo archivo o importado */}
        <div className="p-6 font-bold text-xl text-blue-600">Metrology App</div>
        <div className="p-4 space-y-2">
            <div className="bg-blue-50 text-blue-700 p-3 rounded-lg font-medium flex gap-2"><Briefcase className="w-5 h-5"/> Servicios</div>
            <div onClick={() => navigateTo('clientes')} className="text-gray-600 p-3 rounded-lg hover:bg-gray-50 flex gap-2 cursor-pointer"><Users className="w-5 h-5"/> Clientes</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        
        {/* === HEADER === */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-20">
          <div className="flex items-center gap-4">
            {isMobile && <button onClick={() => setSidebarOpen(true)}><Menu className="w-6 h-6 text-gray-600" /></button>}
            <button onClick={() => navigateTo('dashboard')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors hidden sm:block">
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Servicios</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Gestión operativa y asignaciones</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="hidden md:flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid className="w-5 h-5" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}><ListIcon className="w-5 h-5" /></button>
             </div>
             <button onClick={() => { setSelectedService(null); setIsFormOpen(true); }} className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all">
               <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Nuevo Servicio</span>
             </button>
          </div>
        </header>

        {/* === FILTROS & STATS === */}
        <div className="px-6 py-4 bg-white/50 backdrop-blur-sm z-10 sticky top-0 border-b border-gray-100">
             {/* Stats Rápidos */}
             {!loading && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Briefcase className="w-5 h-5"/></div>
                        <div><p className="text-xl font-bold leading-none">{stats.total}</p><p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total</p></div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><Play className="w-5 h-5"/></div>
                        <div><p className="text-xl font-bold leading-none">{stats.enProceso}</p><p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Activos</p></div>
                    </div>
                     <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className="p-2 bg-red-50 rounded-lg text-red-600"><AlertCircle className="w-5 h-5"/></div>
                        <div><p className="text-xl font-bold leading-none">{stats.atencion}</p><p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Críticos</p></div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative group w-full md:w-auto md:flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    <input type="text" placeholder="Buscar por título, cliente..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-sm text-sm" />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 w-full md:w-auto scrollbar-hide">
                    {[{value:'todos', label:'Todos'}, ...CONSTANTS.estados].map((estado) => (
                    <button key={estado.value} onClick={() => setFilterStatus(estado.value)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${filterStatus === estado.value ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{estado.label}</button>
                    ))}
                </div>
            </div>
        </div>

        {/* === MAIN CONTENT === */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50 custom-scrollbar">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-64 text-gray-400 animate-pulse">
                <div className="w-12 h-12 bg-gray-200 rounded-full mb-4"/>
                <div className="h-4 w-32 bg-gray-200 rounded"/>
             </div>
          ) : filteredServices.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-gray-200 rounded-3xl">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400"><Search className="w-8 h-8"/></div>
                <h3 className="text-lg font-bold text-gray-900">No se encontraron servicios</h3>
                <p className="text-gray-500 text-sm mt-1">Intenta cambiar los filtros o crea uno nuevo.</p>
                <button onClick={() => {setFilterText(''); setFilterStatus('todos')}} className="mt-4 text-blue-600 text-sm font-bold hover:underline">Limpiar filtros</button>
             </div>
          ) : (
            <>
              {/* VISTA KANBAN */}
              {viewMode === 'kanban' && !isMobile && (
                <div className="flex gap-6 h-full pb-4 overflow-x-auto">
                  {CONSTANTS.estados.map(estado => {
                    const items = filteredServices.filter(s => s.estado === estado.value);
                    return (
                      <div key={estado.value} className="min-w-[320px] max-w-[320px] flex flex-col h-full">
                        <div className={`flex items-center justify-between mb-4 px-2 py-2 rounded-lg bg-white border border-gray-100 shadow-sm border-l-4 ${estado.color.replace('text', 'border')}`}>
                           <h3 className={`font-bold text-sm ${estado.color}`}>{estado.label}</h3>
                           <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-bold text-gray-600">{items.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar pb-20">
                           {items.map(servicio => (
                             <ServiceKanbanCard 
                               key={servicio.id} 
                               service={servicio} 
                               users={usuarios}
                               onClick={() => { setSelectedService(servicio); setIsDetailOpen(true); }}
                             />
                           ))}
                           {items.length === 0 && (
                             <div className="h-24 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-xs font-medium">Vacío</div>
                           )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* VISTA LISTA (y Mobile) */}
              {(viewMode === 'list' || isMobile) && (
                <div className="space-y-3 max-w-5xl mx-auto pb-20">
                   {filteredServices.map(servicio => (
                      <ServiceListItem 
                        key={servicio.id} 
                        service={servicio}
                        users={usuarios}
                        onClick={() => { setSelectedService(servicio); setIsDetailOpen(true); }}
                      />
                   ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- MODALES --- */}
      <ServiceDetailModal 
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        service={selectedService}
        onEdit={(s:any) => { setIsDetailOpen(false); setSelectedService(s); setIsFormOpen(true); }}
        onDelete={handleDelete}
        onViewFile={setViewingFile}
        metrologos={metrologos}
      />

      <ServiceFormModal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)}
        initialData={selectedService || initialFormState}
        onSubmit={handleSaveService}
        loading={processing}
        clientes={clientes}
        metrologos={metrologos}
      />

      {/* VISOR ARCHIVOS */}
      {viewingFile && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in">
           <div className="flex justify-between items-center p-4">
              <h3 className="text-white font-medium truncate max-w-md">{decodeURIComponent(viewingFile.split('/').pop() || '')}</h3>
              <button onClick={() => setViewingFile(null)} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20"><X className="w-6 h-6"/></button>
           </div>
           <div className="flex-1 p-4 flex items-center justify-center">
              <iframe src={viewingFile} className="w-full h-full max-w-5xl bg-white rounded-lg" title="Visor" />
           </div>
        </div>
      )}

      {/* FAB MOBILE */}
      {isMobile && (
        <button
          onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl shadow-blue-500/40 flex items-center justify-center z-40 active:scale-90 transition-transform"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

    </div>
  );
};

export default FridayServiciosScreen;