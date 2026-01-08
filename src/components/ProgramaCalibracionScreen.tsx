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
  FileBarChart // <--- ESTE FALTABA
} from 'lucide-react';

import { useNavigation } from '../hooks/useNavigation';
import { collection, getDocs, setDoc, doc, query } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 
import { db } from '../utils/firebase';
import { patronesData } from './patronesData'; 

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
  
  // Estado
  estadoProceso: EstadoProceso;
  ubicacionActual?: string; 
  ubicacion?: string; 
  usuarioAsignado?: string;
  usuarioEnUso?: string;
  
  // KPIs
  costoAcumuladoMantenimiento: number;
  historial: HistorialEntry[];
}

const COLLECTION_NAME = "patronesCalibracion";

// --- HELPERS SEGUROS ---
const getFechaVencimiento = (item: RegistroPatron): string => item.fecha || item.fechaVencimiento || '';
const getUbicacion = (item: RegistroPatron): string => item.ubicacionActual || item.ubicacion || 'Laboratorio';
const getUsuario = (item: RegistroPatron): string => item.usuarioEnUso || item.usuarioAsignado || 'Sin Asignar';

// --- 2. LÓGICA DE NEGOCIO ---

const usePatronesLogic = () => {
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
      snapshot.forEach(d => items.push({ id: d.id, ...d.data() } as RegistroPatron));
      setData(items.length > 0 ? items : (patronesData as any));
    } catch (error) {
      console.error("Error Firebase:", error);
      setData(patronesData as any);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const registrarEvento = async (patron: RegistroPatron, titulo: string, descripcion: string, tipo: HistorialEntry['tipo'], updates: Partial<RegistroPatron>, costo: number = 0) => {
    if (!patron.id) return false;
    
    const nuevoHistorial: HistorialEntry = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      titulo,
      usuario: "Usuario Actual",
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
      await setDoc(doc(db, COLLECTION_NAME, patron.id), updatePayload, { merge: true });
      await fetchData(); 
      return true;
    } catch (e) {
      alert("Error al guardar cambios");
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
      } catch(e) { return false; }
  };

  return { data, loading, stats, registrarEvento, editarDatosBase };
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

const KPICard = ({ title, value, icon: Icon, color, subtext }: any) => (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
        <div>
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-50 text-${color}-600`}>
            <Icon className="w-6 h-6" />
        </div>
    </div>
);

// --- 4. COMPONENTES DE ARCHIVOS ---

const FileUploader = ({ onFileSelect }: { onFileSelect: (f: File) => void }) => {
    const [fileName, setFileName] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setFileName(file.name);
            onFileSelect(file);
        }
    };

    return (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer relative group">
            <input 
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={handleChange}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            />
            <div className="bg-blue-50 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                <UploadCloud className={`w-6 h-6 ${fileName ? 'text-blue-600' : 'text-gray-400'}`} />
            </div>
            {fileName ? (
                <div>
                    <p className="text-sm font-bold text-blue-700 break-all">{fileName}</p>
                    <p className="text-xs text-green-600 font-medium mt-1">Archivo seleccionado</p>
                </div>
            ) : (
                <div>
                    <p className="text-sm font-medium text-gray-700">Sube tu certificado aquí</p>
                    <p className="text-xs text-gray-400 mt-1">Soporta PDF, Imagenes, Docs</p>
                </div>
            )}
        </div>
    );
};

const FilePreviewModal = ({ url, onClose }: { url: string, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full h-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={18}/> Visualizador de Documento</h3>
                    <div className="flex gap-2">
                        <a href={url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 font-medium">
                            <ExternalLink size={14} /> Abrir en nueva pestaña
                        </a>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-red-500 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 bg-gray-200 relative">
                    <iframe 
                        src={url} 
                        className="w-full h-full" 
                        title="Document Preview"
                    />
                </div>
            </motion.div>
        </div>
    );
};

// --- 5. PANTALLA PRINCIPAL ---

export const ProgramaCalibracionScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { data, loading, stats, registrarEvento, editarDatosBase } = usePatronesLogic();
  
  const [tab, setTab] = useState<'todo' | 'alertas' | 'servicio'>('alertas');
  const [busqueda, setBusqueda] = useState('');
  
  const [selectedItem, setSelectedItem] = useState<RegistroPatron | null>(null);
  const [workflowAction, setWorkflowAction] = useState<any>(null);

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
    
    return result.sort((a, b) => {
        const fa = getFechaVencimiento(a) || '2099-12-31';
        const fb = getFechaVencimiento(b) || '2099-12-31';
        return fa.localeCompare(fb);
    });
  }, [data, tab, busqueda]);

  const handleProcessWorkflow = async (formData: any, file?: File) => {
      if(!selectedItem || !workflowAction) return;

      let success = false;
      const today = format(new Date(), 'yyyy-MM-dd');
      let fileUrl = formData.certificadoUrl;

      // 1. SUBIDA DE ARCHIVO A FIREBASE STORAGE
      if (file) {
        try {
            const storage = getStorage();
            // Ruta: certificados/ID_PATRON/TIMESTAMP_NOMBRE
            const storageRef = ref(storage, `certificados/${selectedItem.id}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            fileUrl = await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Error subiendo archivo:", error);
            alert("Error al subir el archivo. Verifica tu conexión.");
            return;
        }
      }

      switch(workflowAction) {
          case 'calibrar_envio':
              success = await registrarEvento(selectedItem, 'Envío a Calibración', `Proveedor: ${formData.proveedor}`, 'flujo', { estadoProceso: 'en_calibracion', ubicacionActual: 'Externo' });
              break;
          case 'calibrar_recepcion':
              success = await registrarEvento(selectedItem, 'Calibración Finalizada', `Lab: ${formData.laboratorio}`, 'calibracion', { 
                  estadoProceso: 'operativo', 
                  ubicacionActual: 'Laboratorio',
                  fechaVencimiento: formData.nuevaFecha,
                  fechaUltimaCalibracion: today,
                  laboratorioCalibracion: formData.laboratorio,
                  certificadoUrl: fileUrl // URL generada
              });
              break;
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
               break;
          case 'liberar':
               success = await registrarEvento(selectedItem, 'Devolución de Equipo', 'Retornado a laboratorio.', 'flujo', { estadoProceso: 'operativo', usuarioAsignado: '', usuarioEnUso: '', ubicacionActual: 'Laboratorio' });
               break;
          case 'editar_base':
               success = await editarDatosBase(selectedItem.id!, formData);
               break;
      }

      if(success) {
          setWorkflowAction(null);
          setSelectedItem(null);
      }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-10">
      
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Gestión de Metrología</h1>
              <p className="text-xs text-gray-500">Control de Calibraciones y Mantenimiento</p>
            </div>
          </div>
          <button className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-md transition-all">
            <Plus className="w-4 h-4" /> Nuevo Activo
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        
        {/* DASHBOARD KPIS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <KPICard title="Inventario Total" value={stats.total} icon={FileBarChart} color="blue" />
            <KPICard title="Atención Requerida" value={stats.vencidos} icon={AlertTriangle} color="red" subtext="Vencidos o Fallas" />
            <KPICard title="En Planta" value={stats.enUso} icon={User} color="indigo" subtext="Préstamos activos" />
            <KPICard title="Gasto Acumulado" value={`$${stats.gastoTotal.toLocaleString()}`} icon={DollarSign} color="green" subtext="Mantenimiento y Calib." />
        </div>

        {/* CONTROLES */}
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
             <TabButton active={tab === 'alertas'} onClick={() => setTab('alertas')} label="Prioridad / Alertas" count={stats.vencidos + stats.enMantenimiento} />
             <TabButton active={tab === 'servicio'} onClick={() => setTab('servicio')} label="En Planta" count={stats.enUso} />
             <TabButton active={tab === 'todo'} onClick={() => setTab('todo')} label="Todo el Inventario" />
          </div>
          <div className="relative w-full md:w-80">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
             <input 
               type="text" 
               placeholder="Buscar control, serie, descripción..." 
               className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
               value={busqueda}
               onChange={e => setBusqueda(e.target.value)}
             />
          </div>
        </div>

        {/* TABLA */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Activo</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Ubicación / Lab</th>
                    <th className="px-6 py-4">Vencimiento</th>
                    <th className="px-6 py-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                       <tr><td colSpan={5} className="p-8 text-center text-gray-400">Cargando inventario...</td></tr>
                  ) : filteredData.map((item) => {
                    const fechaVenc = getFechaVencimiento(item);
                    return (
                        <tr 
                            key={item.id || item.noControl} 
                            onClick={() => setSelectedItem(item)}
                            className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                        >
                        <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{item.descripcion}</div>
                            <div className="text-xs text-gray-500">{item.marca} • <span className="font-mono bg-gray-100 px-1 rounded">{item.noControl}</span></div>
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
                             <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500" />
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
        onAction={setWorkflowAction} 
      />

      {/* --- MODAL DE FLUJO --- */}
      <AnimatePresence>
        {workflowAction && selectedItem && (
            <WorkflowDialog 
                action={workflowAction} 
                item={selectedItem} 
                onClose={() => setWorkflowAction(null)}
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
    if (['en_uso', 'en_servicio'].includes(item.estadoProceso)) {
        return <div className="flex items-center gap-1.5 text-indigo-600"><User className="w-3.5 h-3.5" /> {getUsuario(item)}</div>;
    }
    return <span className="text-gray-500">{getUbicacion(item)}</span>;
}

// --- PANEL LATERAL CON TABS ---
const SidePanel = ({ selectedItem, onClose, onAction }: any) => {
    const [panelTab, setPanelTab] = useState<'info' | 'calib' | 'mant'>('info');
    const [showPreview, setShowPreview] = useState(false);

    return (
        <AnimatePresence>
        {selectedItem && (
            <>
                <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
                <motion.div 
                    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 bottom-0 w-full md:w-[650px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
                >
                    {/* Header Panel */}
                    <div className="p-6 bg-white border-b border-gray-100 flex justify-between items-start sticky top-0 z-10">
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
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <SmartActionButton item={selectedItem} setAction={onAction} />
                    </div>

                    {/* Tabs Navigation */}
                    <div className="flex border-b border-gray-200 px-6">
                        <PanelTabBtn active={panelTab === 'info'} onClick={() => setPanelTab('info')} label="Ficha General" icon={FileText} />
                        <PanelTabBtn active={panelTab === 'calib'} onClick={() => setPanelTab('calib')} label="Calibraciones" icon={ClipboardCheck} />
                        <PanelTabBtn active={panelTab === 'mant'} onClick={() => setPanelTab('mant')} label="Mantenimiento" icon={Wrench} />
                    </div>

                    {/* Content Scrollable */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                        
                        {/* TAB 1: INFO GENERAL */}
                        {panelTab === 'info' && (
                            <div className="space-y-6">
                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
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

                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-blue-500"/> Certificado Vigente
                                    </h3>
                                    {selectedItem.certificadoUrl ? (
                                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white p-2 rounded text-blue-500 font-bold text-xs border border-blue-100 uppercase">
                                                     <File size={20} />
                                                </div>
                                                <div className="text-sm">
                                                    <p className="font-medium text-blue-900">Documento de Calibración</p>
                                                    <p className="text-xs text-blue-600">Subido el {selectedItem.fechaUltimaCalibracion || 'recientemente'}</p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setShowPreview(true)}
                                                className="px-3 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-50 transition shadow-sm flex items-center gap-1"
                                            >
                                                Ver Archivo
                                            </button>
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

                                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
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
                    {showPreview && selectedItem.certificadoUrl && (
                        <FilePreviewModal url={selectedItem.certificadoUrl} onClose={() => setShowPreview(false)} />
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
        <div className="relative pl-4 border-l-2 border-gray-200 space-y-6">
            {items.map((h: any, i: number) => (
                <div key={i} className="relative pl-6">
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white 
                        ${h.tipo === 'calibracion' ? 'bg-blue-500' : 
                          h.tipo === 'mantenimiento' ? 'bg-orange-500' : 
                          h.tipo === 'reporte' ? 'bg-red-500' : 'bg-gray-400'}`} 
                    />
                    <div className="flex justify-between items-start">
                        <span className="text-sm font-bold text-gray-900">{h.titulo}</span>
                        <span className="text-xs text-gray-400">{isValid(parseISO(h.fecha)) ? format(parseISO(h.fecha), 'dd MMM yy') : ''}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{h.descripcion}</p>
                    {h.costo > 0 && (
                        <div className="mt-1 inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded border border-green-100 font-mono">
                            Costo: ${h.costo}
                        </div>
                    )}
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <User className="w-3 h-3"/> {h.usuario}
                    </div>
                </div>
            ))}
        </div>
    );
};

const PanelTabBtn = ({ active, onClick, label, icon: Icon }: any) => (
    <button 
        onClick={onClick}
        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${active ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
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
        <div className={`p-4 rounded-xl border ${colorClasses[color]} flex flex-col items-center text-center`}>
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
        <button onClick={onClick} className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-all ${colors[color]} ${animate ? 'animate-pulse' : ''}`}>
            <Icon className="w-5 h-5" /> {label}
        </button>
    )
};

const TabButton = ({ active, onClick, label, count }: any) => (
    <button onClick={onClick} className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}>
        {label} {count > 0 && <span className="ml-1 bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-full text-xs">{count}</span>}
    </button>
);

const WorkflowDialog = ({ action, item, onClose, onConfirm }: any) => {
    const [form, setForm] = useState<any>({ ...item, nuevaFecha: getFechaVencimiento(item) });
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleConfirm = async () => {
        setIsUploading(true);
        await onConfirm(form, selectedFile);
        setIsUploading(false);
    };

    const renderContent = () => {
        switch(action) {
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
                         <textarea className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-red-500 outline-none" rows={3} placeholder="Describe el problema..." onChange={e => setForm({...form, motivo: e.target.value})}></textarea>
                     </div>
                 );
            case 'mantenimiento_inicio':
                return (
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Diagnóstico Inicial</label>
                        <textarea className="w-full border p-2 rounded-lg" rows={3} placeholder="¿Qué se va a revisar?" onChange={e => setForm({...form, motivo: e.target.value})}></textarea>
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
                return <Input label="Proveedor de Servicio" val={form.proveedor} onChange={(v: string) => setForm({...form, proveedor: v})} />;
            case 'calibrar_recepcion':
                 return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Laboratorio" placeholder="Ej. Mitutoyo" val={form.laboratorio} onChange={(v: string) => setForm({...form, laboratorio: v})} />
                            <Input label="No. Certificado" placeholder="ABC-123" val={form.certificado} onChange={(v: string) => setForm({...form, certificado: v})} />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Certificado Digital</label>
                            <FileUploader onFileSelect={setSelectedFile} />
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                             <Input label="Próxima Calibración" type="date" val={form.nuevaFecha} onChange={(v: string) => setForm({...form, nuevaFecha: v})} />
                             <p className="text-xs text-blue-600 mt-1">* Se calculará automáticamente basado en la frecuencia si dejas vacío.</p>
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

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">{getTitle()}</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400"/></button>
                </div>
                <div className="p-6">
                    {renderContent()}
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium">Cancelar</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={isUploading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2"
                    >
                        {isUploading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {isUploading ? 'Subiendo...' : 'Confirmar'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const Input = ({ label, val, onChange, type = "text", placeholder }: any) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{label}</label>
        <input 
            type={type} 
            placeholder={placeholder}
            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={val || ''} 
            onChange={e => onChange(e.target.value)} 
        />
    </div>
);