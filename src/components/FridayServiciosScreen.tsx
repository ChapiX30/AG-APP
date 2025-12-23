import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  ArrowLeft, Plus, Calendar, Search, Filter, Eye, Edit3, Trash2, X, 
  CheckCircle2, RotateCcw, Play, AlertCircle, Clock, AlertTriangle, 
  Briefcase, Settings, Zap, Paperclip, Users, Upload, 
  Building2, Phone, Mail, FileText, Info, Send, Menu, 
  LayoutGrid, List as ListIcon, MapPin, User, MoreHorizontal, ChevronRight, Download, MessageCircle, MoreVertical, StopCircle
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
// 1. TYPES & INTERFACES
// ==========================================

interface Usuario {
  id: string;
  name?: string;
  nombre?: string;
  position?: string;
  puesto?: string;
  role?: string;
  photoUrl?: string;
}

interface Service {
  id: string;
  titulo: string;
  cliente: string;
  clienteId: string;
  estado: 'programado' | 'en_proceso' | 'finalizado' | 'reprogramacion';
  prioridad: 'baja' | 'media' | 'alta' | 'critica';
  tipo: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  personas: string[]; 
  descripcion: string;
  archivos: (string | File)[];
  notas?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  ubicacion?: string;
}

// ==========================================
// 2. HELPERS & CONSTANTS
// ==========================================

const formatDateRelative = (dateString: string) => {
  if (!dateString) return 'Sin fecha';
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', weekday: 'short' });
};

const getInitials = (name: string) => name ? name.substring(0, 2).toUpperCase() : '??';

const CONSTANTS = {
  estados: [
    { value: 'programado', label: 'Programado', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: Calendar },
    { value: 'en_proceso', label: 'En Proceso', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Play },
    { value: 'reprogramacion', label: 'Reprogramado', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: RotateCcw },
    { value: 'finalizado', label: 'Finalizado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 }
  ],
  prioridades: [
    { value: 'baja', label: 'Baja', color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' },
    { value: 'media', label: 'Media', color: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-400' },
    { value: 'alta', label: 'Alta', color: 'text-orange-600', bg: 'bg-orange-50', dot: 'bg-orange-400' },
    { value: 'critica', label: 'Crítica', color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' }
  ],
  tipos: [
    { value: 'calibracion', label: 'Calibración', icon: Settings, color: 'text-indigo-600 bg-indigo-50' },
    { value: 'mantenimiento', label: 'Mantenimiento', icon: Briefcase, color: 'text-cyan-600 bg-cyan-50' },
    { value: 'verificacion', label: 'Verificación', icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
    { value: 'reparacion', label: 'Reparación', icon: Zap, color: 'text-rose-600 bg-rose-50' },
    { value: 'inspeccion', label: 'Inspección', icon: Eye, color: 'text-violet-600 bg-violet-50' }
  ]
};

// ==========================================
// 3. ATOMIC COMPONENTS
// ==========================================

const Avatar = ({ user, size = 'sm' }: { user: Usuario | undefined, size?: 'sm'|'md'|'lg' }) => {
  const sizeClass = size === 'lg' ? 'w-10 h-10 text-sm' : size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  return (
    <div title={user?.name || user?.nombre} className={`${sizeClass} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold ring-2 ring-white shadow-sm flex-shrink-0`}>
      {getInitials(user?.name || user?.nombre || 'Unknown')}
    </div>
  );
};

const PriorityBadge = ({ priority }: { priority: string }) => {
  const config = CONSTANTS.prioridades.find(p => p.value === priority) || CONSTANTS.prioridades[0];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

// --- COMPONENTE TARJETA INTELIGENTE ---
const ServiceCard = ({ service, users, onClick, onQuickAction, variant = 'kanban' }: { service: Service, users: Usuario[], onClick: () => void, onQuickAction: (id:string, action:string) => void, variant?: 'kanban' | 'list' }) => {
  const tipoConfig = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const TipoIcon = tipoConfig?.icon || Settings;
  const assignedUsers = users.filter(u => service.personas?.includes(u.id));
  const [showMenu, setShowMenu] = useState(false);

  // Lógica de Botones Rápidos
  const renderQuickButton = () => {
    if (service.estado === 'programado') {
      return (
        <button onClick={(e) => { e.stopPropagation(); onQuickAction(service.id, 'en_proceso'); }} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
          <Play className="w-3 h-3 fill-current" /> Iniciar
        </button>
      );
    }
    if (service.estado === 'en_proceso') {
      return (
        <button onClick={(e) => { e.stopPropagation(); onQuickAction(service.id, 'finalizado'); }} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
          <CheckCircle2 className="w-3 h-3" /> Finalizar
        </button>
      );
    }
    return null; // Si está finalizado, no mostrar botón rápido principal
  };

  const QuickMenu = () => (
    <div className="absolute right-2 top-8 w-40 bg-white rounded-lg shadow-xl border border-gray-100 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
       <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onQuickAction(service.id, 'reprogramacion'); }} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"><RotateCcw className="w-3 h-3 text-orange-500"/> Reprogramar</button>
       <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); onQuickAction(service.id, 'programado'); }} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"><RotateCcw className="w-3 h-3 text-blue-500"/> Regresar a Programado</button>
    </div>
  );

  if (variant === 'list') {
    return (
      <div onClick={onClick} className="group bg-white rounded-xl border border-gray-200 p-3 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row gap-4 items-center relative">
        <div className={`p-3 rounded-lg hidden sm:block ${tipoConfig?.color || 'bg-gray-100 text-gray-500'}`}>
          <TipoIcon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center justify-between mb-1">
             <div className="flex items-center gap-2">
                <PriorityBadge priority={service.prioridad} />
                <span className="text-[10px] text-gray-400 font-mono">#{service.id.slice(-4).toUpperCase()}</span>
             </div>
             {/* Mobile Quick Action Top Right */}
             <div className="sm:hidden">{renderQuickButton()}</div>
          </div>
          <h4 className="font-bold text-gray-900 truncate text-base">{service.titulo}</h4>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
            <span className="flex items-center gap-1 truncate"><Building2 className="w-3.5 h-3.5"/> {service.cliente}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/> {formatDateRelative(service.fecha)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0">
           <div className="flex -space-x-2">
             {assignedUsers.slice(0, 3).map(u => <Avatar key={u.id} user={u} />)}
           </div>
           
           <div className="flex items-center gap-2">
              <div className="hidden sm:block">{renderQuickButton()}</div>
              
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600">
                    <MoreVertical className="w-5 h-5" />
                </button>
                {showMenu && <QuickMenu />}
              </div>
           </div>
        </div>
        {showMenu && <div className="fixed inset-0 z-0" onClick={(e) => {e.stopPropagation(); setShowMenu(false)}} />}
      </div>
    );
  }

  // Kanban Variant
  return (
    <div onClick={onClick} className="group bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer flex flex-col gap-3 relative overflow-visible">
      <div className={`absolute top-0 left-0 w-1 h-full ${CONSTANTS.estados.find(e => e.value === service.estado)?.color.replace('text', 'bg')}`} />
      
      <div className="flex justify-between items-start pl-2">
        <PriorityBadge priority={service.prioridad} />
        <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }} className="text-gray-400 hover:text-blue-600"><MoreHorizontal className="w-5 h-5"/></button>
            {showMenu && <QuickMenu />}
        </div>
      </div>

      <div className="pl-2">
        <h4 className="font-bold text-gray-900 leading-snug mb-1 line-clamp-2">{service.titulo}</h4>
        <p className="text-xs text-gray-500 flex items-center gap-1 mb-3"><Building2 className="w-3 h-3" /> {service.cliente}</p>

        <div className="flex items-center justify-between border-t border-gray-50 pt-3">
          <div className="flex -space-x-2">
              {assignedUsers.length > 0 ? assignedUsers.slice(0, 3).map(u => <Avatar key={u.id} user={u} />) : <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1 rounded-md">--</span>}
          </div>
          {renderQuickButton() || (
             <div className="text-[10px] font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-md">{formatDateRelative(service.fecha)}</div>
          )}
        </div>
      </div>
      {showMenu && <div className="fixed inset-0 z-0" onClick={(e) => {e.stopPropagation(); setShowMenu(false)}} />}
    </div>
  );
};

// ==========================================
// 4. MODALS 
// ==========================================

const ServiceDetailModal = ({ isOpen, onClose, service, onEdit, onDelete, onViewFile, metrologos }: any) => {
  if (!isOpen || !service) return null;
  const tipoInfo = CONSTANTS.tipos.find(t => t.value === service.tipo);
  const statusConfig = CONSTANTS.estados.find(e => e.value === service.estado) || CONSTANTS.estados[0];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
        <div className="relative bg-gray-50 px-6 py-6 border-b border-gray-200">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white rounded-full text-gray-500 hover:text-gray-900 shadow-sm hover:shadow transition-all"><X className="w-4 h-4"/></button>
          
          <div className="flex items-center gap-3 mb-3">
             <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.color} border ${statusConfig.border}`}>
               <StatusIcon className="w-3.5 h-3.5" /> {statusConfig.label}
             </span>
             <PriorityBadge priority={service.prioridad} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">{service.titulo}</h2>
          <div className="flex items-center gap-2 mt-2 text-gray-500 text-sm">
             <span className={`flex items-center gap-1 font-medium ${tipoInfo?.color?.split(' ')[0]}`}>{tipoInfo?.icon && <tipoInfo.icon className="w-4 h-4" />} {tipoInfo?.label}</span>
             <span>•</span>
             <span>ID: {service.id.slice(0,6).toUpperCase()}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white custom-scrollbar">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
             <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cliente</h3>
                <div className="flex items-start gap-3">
                   <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Building2 className="w-5 h-5"/></div>
                   <div>
                      <p className="font-bold text-gray-900">{service.cliente}</p>
                      <p className="text-sm text-gray-500">{service.ubicacion || 'Sin dirección registrada'}</p>
                   </div>
                </div>
                <div className="flex gap-2 mt-2">
                   {service.telefono && (
                     <a href={`https://wa.me/${service.telefono.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors">
                       <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                     </a>
                   )}
                   {service.email && (
                     <a href={`mailto:${service.email}`} className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-50 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors">
                       <Mail className="w-3.5 h-3.5" /> Correo
                     </a>
                   )}
                </div>
             </div>
             <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Planificación</h3>
                <div className="space-y-2">
                   <div className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="text-gray-500 flex items-center gap-2"><Calendar className="w-4 h-4"/> Fecha</span>
                      <span className="font-semibold text-gray-900">{formatDateRelative(service.fecha)}</span>
                   </div>
                   <div className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <span className="text-gray-500 flex items-center gap-2"><Clock className="w-4 h-4"/> Horario</span>
                      <span className="font-semibold text-gray-900">{service.horaInicio || '--'} - {service.horaFin || '--'}</span>
                   </div>
                </div>
             </div>
          </section>

          <hr className="border-gray-100" />

          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Equipo Técnico</h3>
            <div className="flex flex-wrap gap-3">
               {service.personas?.length > 0 ? (
                 service.personas.map((id:string) => {
                   const m = metrologos.find((u:any) => u.id === id);
                   return (
                     <div key={id} className="flex items-center gap-2 pr-4 pl-1 py-1 rounded-full border border-gray-200 bg-white shadow-sm">
                       <Avatar user={m} />
                       <div>
                         <p className="text-xs font-bold text-gray-700">{m?.name || m?.nombre || 'Usuario'}</p>
                         <p className="text-[10px] text-gray-400">{m?.position || m?.puesto || 'Técnico'}</p>
                       </div>
                     </div>
                   )
                 })
               ) : (
                 <div className="text-sm text-gray-400 italic flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg w-full"><AlertCircle className="w-4 h-4" /> No hay técnicos asignados.</div>
               )}
            </div>
          </section>

          <section className="space-y-4">
             <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Detalles del trabajo</h3>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border border-gray-100">{service.descripcion || 'Sin descripción detallada.'}</p>
             </div>
             {service.archivos?.length > 0 && (
               <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Paperclip className="w-3 h-3"/> Adjuntos ({service.archivos.length})</h3>
                  <div className="grid grid-cols-2 gap-2">
                     {service.archivos.map((file: any, i:number) => (
                       <button key={i} onClick={() => onViewFile(file)} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-all text-left group">
                          <div className="w-8 h-8 rounded bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center text-gray-500 group-hover:text-blue-600"><FileText className="w-4 h-4"/></div>
                          <span className="text-xs font-medium text-gray-600 truncate flex-1">Ver Archivo {i+1}</span>
                          <Eye className="w-3 h-3 text-gray-300 group-hover:text-blue-400"/>
                       </button>
                     ))}
                  </div>
               </div>
             )}
          </section>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-4">
           <button onClick={() => onDelete(service.id)} className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Eliminar"><Trash2 className="w-5 h-5" /></button>
           <button onClick={() => onEdit(service)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-medium shadow-lg shadow-gray-200 transform active:scale-95 transition-all flex items-center justify-center gap-2"><Edit3 className="w-4 h-4" /> Editar / Gestionar</button>
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
  const handleChange = (field: string, value: any) => setFormData((prev: any) => ({ ...prev, [field]: value }));

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
               <h3 className="font-semibold text-gray-900">Asignar Personal</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                   {metrologos.length > 0 ? metrologos.map((m: any) => {
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
                           <p className="text-xs text-gray-500">{m.position || m.puesto || m.role || 'Personal'}</p>
                         </div>
                       </div>
                     );
                   }) : <p className="col-span-2 text-center text-gray-400 italic">No se encontraron usuarios elegibles.</p>}
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
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3"><Upload className="w-6 h-6 text-blue-500" /></div>
                  <p className="text-sm font-medium text-gray-700">Clic para subir archivos</p>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) handleChange('archivos', [...formData.archivos, ...Array.from(e.target.files)]); }} />
                </div>
                {formData.archivos.length > 0 && (
                  <div className="space-y-2">
                    {formData.archivos.map((file: any, idx: number) => {
                       const name = typeof file === 'string' ? decodeURIComponent(file.split('/').pop() || '') : file.name;
                       return (
                        <div key={idx} className="flex items-center gap-3 p-2 bg-white border rounded-lg">
                           <FileText className="w-4 h-4 text-blue-500"/>
                           <span className="text-xs truncate flex-1">{name}</span>
                           <button onClick={() => handleChange('archivos', formData.archivos.filter((_:any, i:number) => i !== idx))}><X className="w-4 h-4 text-red-500"/></button>
                        </div>
                       );
                    })}
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
// 5. MAIN SCREEN (SCREEN COMPLETO)
// ==========================================

const FridayServiciosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  // Data State
  const [servicios, setServicios] = useState<Service[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [metrologos, setMetrologos] = useState<Usuario[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  
  // UI State
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);
  const [processing, setProcessing] = useState(false);

  const currentUserId = localStorage.getItem('usuario_id'); 

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  const initialFormState = {
    titulo: '', descripcion: '', tipo: 'calibracion', prioridad: 'media', 
    estado: 'programado', fecha: '', horaInicio: '', horaFin: '', 
    ubicacion: '', clienteId: '', cliente: '', contacto: '', telefono: '', 
    email: '', personas: [], archivos: [], notas: ''
  };

  useEffect(() => {
    const handleResize = () => {
        const mobile = window.innerWidth < 1024;
        setIsMobile(mobile);
        if(mobile) setViewMode('list');
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const loadData = async () => {
      try {
        const q = query(collection(db, 'servicios'), orderBy('fechaCreacion', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
          setServicios(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)));
          setLoading(false);
        });

        const [usersSnap, clientsSnap] = await Promise.all([
          getDocs(collection(db, 'usuarios')),
          getDocs(collection(db, 'clientes'))
        ]);

        const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsuarios(usersData);
        
        // --- FILTRO DE PERSONAL CORREGIDO ---
        setMetrologos(usersData.filter((u:any) => {
            const r = (u.position || u.puesto || u.role || '').toLowerCase();
            const allowed = ['metrologo', 'metrólogo', 'tecnico', 'técnico', 'ingeniero', 'supervisor',];
            return allowed.some(k => r.includes(k)) || r === ''; // Permitir vacíos por si acaso
        }));
        // ------------------------------------

        setClientes(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        return () => unsub();
      } catch (error) {
        console.error(error);
        toast.error("Error conectando con la base de datos");
        setLoading(false);
      }
    };
    loadData();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filteredServices = useMemo(() => {
    return servicios.filter(s => {
      const matchSearch = !filterText || 
        s.titulo.toLowerCase().includes(filterText.toLowerCase()) || 
        s.cliente.toLowerCase().includes(filterText.toLowerCase());
      
      const matchStatus = filterStatus === 'todos' || s.estado === filterStatus;
      const matchMyTasks = !showOnlyMyTasks || (currentUserId && s.personas.includes(currentUserId));
      return matchSearch && matchStatus && matchMyTasks;
    });
  }, [servicios, filterText, filterStatus, showOnlyMyTasks, currentUserId]);

  const stats = useMemo(() => {
    return {
        total: servicios.length,
        pendientes: servicios.filter(s => s.estado === 'programado').length,
        proceso: servicios.filter(s => s.estado === 'en_proceso').length,
        criticos: servicios.filter(s => s.prioridad === 'critica' || s.prioridad === 'alta').length
    };
  }, [servicios]);

  // --- ACCIÓN RÁPIDA DE ESTADO ---
  const handleQuickStatus = async (id: string, newStatus: string) => {
    try {
        await updateDoc(doc(db, 'servicios', id), { estado: newStatus });
        toast.success(`Estado actualizado a: ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (e) {
        console.error(e);
        toast.error('Error al actualizar estado');
    }
  };

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
        actualizadoPor: currentUserId || 'unknown'
      };

      if (data.id) {
        await updateDoc(doc(db, 'servicios', data.id), finalData);
        toast.success('Servicio actualizado');
      } else {
        await addDoc(collection(db, 'servicios'), {
          ...finalData,
          fechaCreacion: serverTimestamp(),
          creadoPor: currentUserId || 'unknown'
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
    if(window.confirm('¿Confirmar eliminación?')) {
        await deleteDoc(doc(db, 'servicios', id));
        setIsDetailOpen(false);
        toast.success('Servicio eliminado');
    }
  };

  return (
    <div className="flex h-screen bg-gray-50/50 font-sans text-slate-900 overflow-hidden">
        
        {/* MAIN AREA */}
        <main className="flex-1 flex flex-col h-full min-w-0 relative">
            
            {/* HEADER */}
            <header className="bg-white border-b border-gray-200 z-10 sticky top-0 shadow-sm">
                <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <button onClick={() => navigateTo('dashboard')} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                             <ArrowLeft className="w-6 h-6"/>
                         </button>
                         <div>
                            <h2 className="text-xl font-bold text-gray-900">Gestión de Servicios</h2>
                            <p className="text-sm text-gray-500 hidden md:block">Administra calibraciones y mantenimientos</p>
                         </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64 group">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors"/>
                             <input 
                                type="text" 
                                placeholder="Buscar OT, Cliente..." 
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 border rounded-xl outline-none transition-all text-sm"
                             />
                        </div>
                        <button 
                            onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
                            className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl font-medium shadow-lg shadow-gray-200 flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap"
                        >
                            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo</span>
                        </button>
                    </div>
                </div>

                {/* FILTERS BAR */}
                <div className="px-6 py-2 overflow-x-auto border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 scrollbar-hide">
                     <button onClick={() => setFilterStatus('todos')} className={`flex flex-col items-start min-w-[100px] p-3 rounded-xl border transition-all ${filterStatus === 'todos' ? 'bg-white border-blue-500 shadow-md' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Total</span>
                        <span className="text-xl font-black text-gray-900">{stats.total}</span>
                     </button>
                     
                     <button onClick={() => setFilterStatus('programado')} className={`flex flex-col items-start min-w-[100px] p-3 rounded-xl border transition-all ${filterStatus === 'programado' ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-gray-200 hover:bg-blue-50'}`}>
                        <span className="text-[10px] font-bold text-blue-400 uppercase">Pendientes</span>
                        <span className="text-xl font-black text-blue-600">{stats.pendientes}</span>
                     </button>

                     <button onClick={() => setFilterStatus('en_proceso')} className={`flex flex-col items-start min-w-[100px] p-3 rounded-xl border transition-all ${filterStatus === 'en_proceso' ? 'bg-amber-50 border-amber-500 shadow-md' : 'bg-white border-gray-200 hover:bg-amber-50'}`}>
                        <span className="text-[10px] font-bold text-amber-500 uppercase">En Proceso</span>
                        <span className="text-xl font-black text-amber-600">{stats.proceso}</span>
                     </button>

                     <div className="h-10 w-px bg-gray-300 mx-2 hidden sm:block" />

                     {!isMobile && (
                        <div className="flex bg-gray-200 p-1 rounded-lg">
                           <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}><LayoutGrid className="w-4 h-4"/></button>
                           <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}><ListIcon className="w-4 h-4"/></button>
                        </div>
                     )}

                     <button 
                        onClick={() => setShowOnlyMyTasks(!showOnlyMyTasks)}
                        className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${showOnlyMyTasks ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
                     >
                        <User className="w-3.5 h-3.5" /> Mis Asignaciones
                     </button>
                </div>
            </header>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-100/50">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
                        {[1,2,3].map(i => <div key={i} className="h-64 bg-gray-200 rounded-2xl"></div>)}
                    </div>
                ) : (
                    <>
                        {viewMode === 'kanban' && !isMobile && (
                            <div className="flex gap-6 h-full overflow-x-auto pb-6 items-start">
                                {CONSTANTS.estados.map(col => {
                                    const items = filteredServices.filter(s => s.estado === col.value);
                                    return (
                                        <div key={col.value} className="min-w-[340px] w-[340px] flex flex-col max-h-full">
                                            <div className="flex items-center justify-between mb-4 px-1">
                                                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${col.color.replace('text', 'bg')}`} />
                                                    {col.label}
                                                </h3>
                                                <span className="bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-md text-xs font-bold shadow-sm">{items.length}</span>
                                            </div>
                                            
                                            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar pb-20">
                                                {items.map(service => (
                                                    <ServiceCard 
                                                        key={service.id} 
                                                        service={service} 
                                                        users={usuarios}
                                                        variant="kanban"
                                                        onClick={() => { setSelectedService(service); setIsDetailOpen(true); }}
                                                        onQuickAction={handleQuickStatus}
                                                    />
                                                ))}
                                                {items.length === 0 && (
                                                    <div className="h-32 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm bg-gray-50/50">
                                                        Sin servicios
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {(viewMode === 'list' || isMobile) && (
                            <div className="max-w-6xl mx-auto space-y-3 pb-24">
                                {filteredServices.length > 0 ? (
                                    filteredServices.map(service => (
                                        <ServiceCard 
                                            key={service.id} 
                                            service={service} 
                                            users={usuarios}
                                            variant="list"
                                            onClick={() => { setSelectedService(service); setIsDetailOpen(true); }}
                                            onQuickAction={handleQuickStatus}
                                        />
                                    ))
                                ) : (
                                    <div className="text-center py-20">
                                        <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto flex items-center justify-center text-gray-400 mb-4"><Search className="w-10 h-10" /></div>
                                        <h3 className="text-gray-900 font-bold text-lg">No se encontraron resultados</h3>
                                        <p className="text-gray-500">Intenta ajustar los filtros de búsqueda.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* MODALS */}
            <ServiceDetailModal 
                isOpen={isDetailOpen} 
                onClose={() => setIsDetailOpen(false)}
                service={selectedService}
                metrologos={metrologos}
                onDelete={handleDelete}
                onEdit={(s:any) => { setIsDetailOpen(false); setSelectedService(s); setIsFormOpen(true); }}
                onViewFile={(f:string) => setViewingFile(f)}
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

            {viewingFile && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in">
                    <div className="flex justify-between items-center p-4 text-white">
                        <span className="font-medium truncate flex-1">{decodeURIComponent(viewingFile.split('/').pop() || '')}</span>
                        <div className="flex gap-4">
                            <a href={viewingFile} download target="_blank" rel="noreferrer" className="p-2 hover:bg-white/20 rounded-full"><Download className="w-5 h-5"/></a>
                            <button onClick={() => setViewingFile(null)} className="p-2 hover:bg-white/20 rounded-full"><X className="w-5 h-5"/></button>
                        </div>
                    </div>
                    <iframe src={viewingFile} className="flex-1 bg-white" title="Doc Viewer"/>
                </div>
            )}

            <button 
                onClick={() => { setSelectedService(null); setIsFormOpen(true); }}
                className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"
            >
                <Plus className="w-6 h-6" />
            </button>
        </main>
    </div>
  );
};

export default FridayServiciosScreen;