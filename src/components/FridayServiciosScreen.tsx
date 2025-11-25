import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import SidebarFriday from './SidebarFriday';
import { FileViewer } from './FileViewer';

import { 
  ArrowLeft, Plus, Calendar, Search, Filter, Eye, Edit3, Trash2, X, 
  CheckCircle2, RotateCcw, Play, AlertCircle, Clock, AlertTriangle, 
  Briefcase, Settings, Zap, MoreVertical, Paperclip, Users, Upload, 
  Building2, Phone, Mail, FileText, Info, MessageCircle, Send, Home, 
  ChevronRight, Save, Menu, Download, ExternalLink, Loader2, LayoutGrid, 
  List as ListIcon, MapPin, User
} from 'lucide-react';

import { 
  doc, collection, updateDoc, addDoc, deleteDoc, onSnapshot, query, 
  orderBy, serverTimestamp, getDocs 
} from 'firebase/firestore';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '../hooks/useNavigation';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================

const CONSTANTS = {
  estados: [
    { value: 'programado', label: 'Programado', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: Calendar },
    { value: 'en_proceso', label: 'En Proceso', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: Play },
    { value: 'finalizado', label: 'Finalizado', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
    { value: 'reprogramacion', label: 'Reprogramación', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', icon: RotateCcw }
  ],
  prioridades: [
    { value: 'baja', label: 'Baja', color: 'text-slate-600', bg: 'bg-slate-100', icon: Info },
    { value: 'media', label: 'Media', color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock },
    { value: 'alta', label: 'Alta', color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
    { value: 'critica', label: 'Crítica', color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle }
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
// 2. COMPONENTES UI (Visuals)
// ==========================================

const Badge = ({ config, value, compact = false }: { config: any[], value: string, compact?: boolean }) => {
  const item = config.find(c => c.value === value) || config[0];
  const Icon = item.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${item.bg} ${item.color} ${item.border || 'border-transparent'}`}>
      <Icon className="w-3.5 h-3.5" />
      {!compact && item.label}
    </span>
  );
};

const EmptyState = ({ title, message, icon: Icon, action }: any) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-dashed border-gray-300">
    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-gray-400" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    <p className="text-gray-500 max-w-sm mb-6">{message}</p>
    {action}
  </div>
);

const FilePreviewItem = ({ file, onRemove, onClick, readOnly = false }: any) => {
  const isUrl = typeof file === 'string';
  let name = 'Archivo';
  if (isUrl) {
    try {
        name = decodeURIComponent(file.split('/').pop()?.split('?')[0] || '').replace(/^\d+_/, '');
    } catch (e) { name = file; }
  } else {
    name = file.name;
  }
  
  return (
    <div 
      onClick={onClick}
      className={`group flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl transition-all ${onClick ? 'cursor-pointer hover:border-blue-400 hover:shadow-md' : ''}`}
    >
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate" title={name}>{name}</p>
        <p className="text-xs text-gray-500">{isUrl ? 'Adjunto' : `${(file.size / 1024 / 1024).toFixed(2)} MB`}</p>
      </div>
      {onRemove && !readOnly && (
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {readOnly && onClick && (
        <div className="p-2 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
            <Eye className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. COMPONENTES INTERNOS LÓGICOS
// ==========================================

// --- Modal de Detalles (SOLO LECTURA) ---
const ServiceDetailModal = ({ isOpen, onClose, service, onEdit, onDelete, onViewFile, metrologos }: any) => {
  if (!isOpen || !service) return null;

  const tipoInfo = CONSTANTS.tipos.find(t => t.value === service.tipo);
  
  const assignedMetrologos = service.personas?.map((id: string) => {
      const user = metrologos.find((m: any) => m.id === id);
      return user || { name: 'Usuario Desconocido', position: 'N/A' };
  }) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header - Read Only */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
          <div className="flex-1 min-w-0 pr-4">
             <div className="flex items-center gap-2 mb-2">
                <Badge config={CONSTANTS.estados} value={service.estado} />
                <Badge config={CONSTANTS.prioridades} value={service.prioridad} compact />
             </div>
             <h2 className="text-xl lg:text-2xl font-bold text-gray-900 leading-tight">{service.titulo}</h2>
             <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                ID: <span className="font-mono text-xs bg-gray-100 px-1 rounded">{service.id.slice(0,8)}...</span>
                • Creado el {service.fechaCreacion?.toDate ? service.fechaCreacion.toDate().toLocaleDateString() : 'N/A'}
             </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-6 h-6 text-gray-500" /></button>
        </div>

        {/* Content Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8">
            
            {/* Descripción */}
            <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Descripción del Servicio</h3>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {service.descripcion || 'Sin descripción proporcionada.'}
                </div>
            </div>

            {/* Grid de Información */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Detalles Operativos
                        </h3>
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex justify-between p-3 border-b border-gray-100">
                                <span className="text-gray-500 text-sm">Tipo de Servicio</span>
                                <span className="font-medium text-gray-900 flex items-center gap-1">
                                    {tipoInfo?.icon && <tipoInfo.icon className="w-4 h-4 text-blue-500" />}
                                    {tipoInfo?.label || service.tipo}
                                </span>
                            </div>
                            <div className="flex justify-between p-3 border-b border-gray-100">
                                <span className="text-gray-500 text-sm">Fecha Programada</span>
                                <span className="font-medium text-gray-900">{service.fecha || 'Por definir'}</span>
                            </div>
                            <div className="flex justify-between p-3">
                                <span className="text-gray-500 text-sm">Horario</span>
                                <span className="font-medium text-gray-900">
                                    {service.horaInicio ? `${service.horaInicio} - ${service.horaFin || '?'}` : 'Por definir'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div>
                         <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Equipo Asignado
                        </h3>
                        {assignedMetrologos.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2">
                                {assignedMetrologos.map((m: any, idx: number) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{m.name || m.nombre}</p>
                                            <p className="text-xs text-gray-500">{m.position || m.puesto || 'Metrólogo'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500 italic p-3 border border-dashed border-gray-200 rounded-xl text-center">Sin personal asignado</div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Building2 className="w-4 h-4" /> Información del Cliente
                        </h3>
                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                            <div>
                                <p className="text-xs text-gray-500">Cliente / Empresa</p>
                                <p className="font-medium text-gray-900 text-lg">{service.cliente || 'No especificado'}</p>
                            </div>
                            {service.contacto && (
                                <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <User className="w-4 h-4 text-gray-400" /> {service.contacto}
                                </div>
                            )}
                            {(service.telefono || service.email) && (
                                <div className="pt-2 border-t border-gray-100 space-y-2 mt-2">
                                    {service.telefono && <div className="flex items-center gap-2 text-sm text-blue-600"><Phone className="w-4 h-4" /> {service.telefono}</div>}
                                    {service.email && <div className="flex items-center gap-2 text-sm text-blue-600"><Mail className="w-4 h-4" /> {service.email}</div>}
                                </div>
                            )}
                            {service.ubicacion && (
                                <div className="flex items-start gap-2 text-sm text-gray-600 pt-2 border-t border-gray-100 mt-2">
                                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <span>{service.ubicacion}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Paperclip className="w-4 h-4" /> Archivos Adjuntos
                        </h3>
                        {service.archivos && service.archivos.length > 0 ? (
                            <div className="space-y-2">
                                {service.archivos.map((file: string, idx: number) => (
                                    <FilePreviewItem 
                                        key={idx} 
                                        file={file} 
                                        readOnly={true}
                                        onClick={() => onViewFile(file)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500 italic p-3 border border-dashed border-gray-200 rounded-xl text-center">No hay archivos adjuntos</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Notas Internas */}
            {service.notas && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                    <h4 className="text-yellow-800 font-medium text-sm flex items-center gap-2 mb-2">
                        <Info className="w-4 h-4" /> Notas Internas
                    </h4>
                    <p className="text-yellow-900 text-sm">{service.notas}</p>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
             <button 
                onClick={() => onDelete(service.id)}
                className="px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
             >
                <Trash2 className="w-4 h-4" /> Eliminar
             </button>

             <div className="flex gap-3">
                 <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-xl font-medium transition-colors">Cerrar</button>
                 <button 
                    onClick={() => onEdit(service)}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all"
                 >
                    <Edit3 className="w-4 h-4" /> Editar Servicio
                 </button>
             </div>
        </div>
      </div>
    </div>
  );
};

// Modal Formulario (Crear/Editar)
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
        ...prev,
        clienteId,
        cliente: cliente.nombre || cliente.razonSocial,
        contacto: cliente.contactoPrincipal || '',
        telefono: cliente.telefono || '',
        email: cliente.email || '',
        ubicacion: cliente.direccion || ''
      }));
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'Información General', icon: Info },
    { id: 'cliente', label: 'Cliente y Ubicación', icon: Building2 },
    { id: 'equipo', label: 'Asignación', icon: Users },
    { id: 'archivos', label: 'Archivos', icon: Paperclip },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{formData.id ? 'Editar Servicio' : 'Nuevo Servicio'}</h2>
            <p className="text-sm text-gray-500">Modifica los campos necesarios.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-6 h-6 text-gray-500" /></button>
        </div>

        <div className="flex border-b border-gray-100 px-6 overflow-x-auto bg-gray-50/50">
          {tabs.map(tab => {
             const Icon = tab.icon;
             return (
               <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                 <Icon className="w-4 h-4" /> {tab.label}
               </button>
             );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-white">
          {/* TAB GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Título del Servicio *</label>
                  <input type="text" value={formData.titulo} onChange={e => handleChange('titulo', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej. Calibración Balanza" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Estado</label>
                    <select value={formData.estado} onChange={e => handleChange('estado', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                        {CONSTANTS.estados.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                   </div>
                   <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Prioridad</label>
                    <select value={formData.prioridad} onChange={e => handleChange('prioridad', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                        {CONSTANTS.prioridades.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                   </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tipo</label>
                        <select value={formData.tipo} onChange={e => handleChange('tipo', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            {CONSTANTS.tipos.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fecha Programada</label>
                        <input type="date" value={formData.fecha} onChange={e => handleChange('fecha', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hora Inicio</label>
                        <input type="time" value={formData.horaInicio} onChange={e => handleChange('horaInicio', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Hora Fin</label>
                        <input type="time" value={formData.horaFin} onChange={e => handleChange('horaFin', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none" />
                    </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descripción</label>
                  <textarea rows={4} value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                </div>
            </div>
          )}

          {/* TAB CLIENTE */}
          {activeTab === 'cliente' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cliente</label>
                    <select value={formData.clienteId} onChange={e => handleClienteChange(e.target.value)} className="w-full px-4 py-3 bg-blue-50/50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">Seleccionar Cliente...</option>
                        {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre || c.razonSocial}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" value={formData.contacto} onChange={e => handleChange('contacto', e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg" placeholder="Contacto" />
                  <input type="tel" value={formData.telefono} onChange={e => handleChange('telefono', e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg" placeholder="Teléfono" />
                  <input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg" placeholder="Email" />
                  <input type="text" value={formData.ubicacion} onChange={e => handleChange('ubicacion', e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg" placeholder="Dirección / Ubicación" />
                </div>
            </div>
          )}

          {/* TAB EQUIPO */}
          {activeTab === 'equipo' && (
            <div className="space-y-6">
               <h3 className="font-semibold text-gray-900">Asignar Personal</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                   {metrologos.map((m: any) => {
                     const selected = formData.personas.includes(m.id);
                     return (
                       <div key={m.id} onClick={() => {
                           const newPersonas = selected ? formData.personas.filter((id: string) => id !== m.id) : [...formData.personas, m.id];
                           handleChange('personas', newPersonas);
                       }} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
                         <div className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                           {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                         </div>
                         <div>
                           <p className="text-sm font-medium text-gray-900">{m.name || m.nombre}</p>
                           <p className="text-xs text-gray-500">{m.position}</p>
                         </div>
                       </div>
                     );
                   })}
               </div>
               <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notas Internas</label>
                  <textarea rows={3} value={formData.notas} onChange={e => handleChange('notas', e.target.value)} className="w-full px-4 py-2.5 bg-yellow-50/50 border border-yellow-200 rounded-lg outline-none" placeholder="Notas visibles solo para el equipo..." />
               </div>
            </div>
          )}

          {/* TAB ARCHIVOS */}
          {activeTab === 'archivos' && (
             <div className="space-y-6">
                <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center hover:bg-gray-50 cursor-pointer">
                  <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Clic para subir archivos</p>
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
          <button onClick={onClose} className="px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-200 rounded-xl transition-colors">Cancelar</button>
          <button onClick={() => onSubmit(formData)} disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all disabled:opacity-70">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {formData.id ? 'Guardar Cambios' : 'Crear Servicio'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. COMPONENTE PRINCIPAL
// ==========================================

const FridayServiciosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Data State
  const [servicios, setServicios] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [metrologos, setMetrologos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  
  // UI State
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  
  // Filtering & Modals
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  
  // MODAL STATES
  const [isFormOpen, setIsFormOpen] = useState(false); // Para editar/crear
  const [isDetailOpen, setIsDetailOpen] = useState(false); // Para ver (solo lectura)
  const [selectedService, setSelectedService] = useState<any | null>(null);
  
  // File Viewer
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  // Initial Form Data
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
      setSidebarOpen(!mobile);
    };
    window.addEventListener('resize', handleResize);
    
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
          ['metrologo', 'metrólogo'].includes((u.position || u.puesto || '').toLowerCase())
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
    finalizados: servicios.filter(s => s.estado === 'finalizado').length
  }), [servicios]);

  // Handlers
  const handleOpenDetail = (servicio: any) => {
      setSelectedService(servicio);
      setIsDetailOpen(true);
  };

  const handleOpenCreate = () => {
      setSelectedService(null);
      setIsFormOpen(true);
  };

  const handleEditFromDetail = (servicio: any) => {
      setIsDetailOpen(false); // Cerrar detalle
      setSelectedService(servicio); // Asegurar selección
      setTimeout(() => setIsFormOpen(true), 100); // Abrir formulario (pequeño delay para UX suave)
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
    if (confirm('¿Estás seguro de eliminar este servicio? Esta acción no se puede deshacer.')) {
      try {
        await deleteDoc(doc(db, 'servicios', id));
        toast.success('Servicio eliminado');
        setIsDetailOpen(false);
      } catch (e) { toast.error('Error al eliminar'); }
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
      {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <SidebarFriday />
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* === HEADER ACTUALIZADO CON BOTÓN DE REGRESO === */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            {/* Menú Móvil */}
            {isMobile && (
                <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg">
                    <Menu className="w-6 h-6 text-gray-600" />
                </button>
            )}
            
            {/* BOTÓN BACK (Dashboard) */}
            <button
                onClick={() => navigateTo('dashboard')}
                className={`p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors ${isMobile ? '' : '-ml-2'}`}
                title="Regresar al menú principal"
            >
                <ArrowLeft className="w-6 h-6" />
            </button>

            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Servicios</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Gestión de operaciones</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="hidden md:flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-md ${viewMode === 'kanban' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}><LayoutGrid className="w-5 h-5" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}><ListIcon className="w-5 h-5" /></button>
             </div>
             <button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-500/20 flex items-center gap-2">
               <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Nuevo</span>
             </button>
          </div>
        </header>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
           <div className="md:col-span-5 relative group">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500" />
             <input type="text" placeholder="Buscar..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" />
           </div>
           <div className="md:col-span-7 flex gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
             {[{value:'todos', label:'Todos'}, ...CONSTANTS.estados].map((estado) => (
               <button key={estado.value} onClick={() => setFilterStatus(estado.value)} className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border ${filterStatus === estado.value ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>{estado.label}</button>
             ))}
           </div>
        </div>

        {!loading && (
          <div className="px-6 pb-2 grid grid-cols-2 md:grid-cols-4 gap-4">
             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
               <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><Briefcase className="w-6 h-6"/></div>
               <div><p className="text-2xl font-bold text-gray-900">{stats.total}</p><p className="text-xs text-gray-500 font-medium uppercase">Total</p></div>
             </div>
             <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
               <div className="p-3 bg-amber-50 rounded-lg text-amber-600"><Play className="w-6 h-6"/></div>
               <div><p className="text-2xl font-bold text-gray-900">{stats.enProceso}</p><p className="text-xs text-gray-500 font-medium uppercase">En Proceso</p></div>
             </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
          {loading ? (
             <div className="flex justify-center p-10"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>
          ) : filteredServices.length === 0 ? (
             <EmptyState icon={Search} title="No se encontraron servicios" message="Intenta ajustar los filtros de búsqueda." action={<button onClick={() => {setFilterText(''); setFilterStatus('todos')}} className="mt-4 text-blue-600 font-medium hover:underline">Limpiar filtros</button>} />
          ) : (
            <>
              {viewMode === 'kanban' && !isMobile && (
                <div className="flex gap-6 h-full pb-6 overflow-x-auto">
                  {CONSTANTS.estados.map(estado => {
                    const items = filteredServices.filter(s => s.estado === estado.value);
                    return (
                      <div key={estado.value} className="min-w-[320px] max-w-[320px] flex flex-col h-full">
                        <div className={`flex items-center justify-between mb-4 px-1 py-2 border-b-2 ${estado.color.replace('text', 'border')}`}>
                           <h3 className={`font-bold ${estado.color}`}>{estado.label}</h3>
                           <span className="bg-white px-2 py-0.5 rounded-md text-xs font-bold text-gray-500 shadow-sm border">{items.length}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                           {items.map(servicio => (
                             <div 
                               key={servicio.id}
                               onClick={() => handleOpenDetail(servicio)} 
                               className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all group"
                             >
                                <div className="flex justify-between items-start mb-2">
                                   <Badge config={CONSTANTS.prioridades} value={servicio.prioridad} compact />
                                </div>
                                <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">{servicio.titulo}</h4>
                                <div className="flex items-center gap-1 text-gray-500 text-xs mb-3">
                                   <Building2 className="w-3 h-3" />
                                   <span className="truncate max-w-[200px]">{servicio.cliente || 'Sin Cliente'}</span>
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                                   <div className="flex -space-x-2">
                                      {servicio.personas?.slice(0,3).map((pid:string) => (
                                        <div key={pid} className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[10px] overflow-hidden">
                                           {usuarios.find(u => u.id === pid)?.name?.[0] || 'U'}
                                        </div>
                                      ))}
                                   </div>
                                   <span className="text-xs text-gray-400">{servicio.fecha}</span>
                                </div>
                             </div>
                           ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(viewMode === 'list' || isMobile) && (
                <div className="space-y-3 max-w-5xl mx-auto">
                   {filteredServices.map(servicio => (
                      <div 
                        key={servicio.id}
                        onClick={() => handleOpenDetail(servicio)}
                        className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:border-blue-300 transition-all cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center"
                      >
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                               <h4 className="font-semibold text-gray-900 truncate">{servicio.titulo}</h4>
                               <Badge config={CONSTANTS.estados} value={servicio.estado} compact />
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                               <span className="flex items-center gap-1"><Building2 className="w-4 h-4"/> {servicio.cliente}</span>
                               <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> {servicio.fecha}</span>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- MODALES --- */}

      {/* 1. Modal de DETALLES (Lectura) */}
      <ServiceDetailModal 
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        service={selectedService}
        onEdit={handleEditFromDetail}
        onDelete={handleDelete}
        onViewFile={setViewingFile}
        metrologos={metrologos}
      />

      {/* 2. Modal de EDICIÓN/CREACIÓN */}
      <ServiceFormModal 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)}
        initialData={selectedService || initialFormState}
        onSubmit={handleSaveService}
        loading={processing}
        clientes={clientes}
        metrologos={metrologos}
      />

      {/* 3. Visor de Archivos */}
      {viewingFile && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col animate-in fade-in duration-200">
           <div className="flex justify-between items-center p-4 text-white">
              <h3 className="font-medium truncate max-w-md">{decodeURIComponent(viewingFile.split('/').pop() || '')}</h3>
              <button onClick={() => setViewingFile(null)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-6 h-6"/></button>
           </div>
           <div className="flex-1 p-4 overflow-hidden flex justify-center bg-gray-900">
              <FileViewer url={viewingFile} style={{ width: '100%', height: '100%' }} />
           </div>
        </div>
      )}

      {/* Botón Flotante (FAB) Solo Mobile */}
      {isMobile && (
        <button
          onClick={handleOpenCreate}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl shadow-blue-500/40 flex items-center justify-center z-40 active:scale-90 transition-transform"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}

    </div>
  );
};

export default FridayServiciosScreen;