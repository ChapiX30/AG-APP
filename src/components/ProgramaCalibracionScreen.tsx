import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { differenceInDays, parseISO, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, AlertTriangle, CheckCircle, Clock, Plus, Search,
  Activity, Wrench, ArrowLeft, X, Filter,
  User, FileText, ChevronRight, Truck, ClipboardCheck, Ban,
  DollarSign, History, Edit3, Save, FileBarChart, MoreVertical
} from 'lucide-react';

import { useNavigation } from '../hooks/useNavigation';
import { collection, getDocs, setDoc, doc, query } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { patronesData } from './patronesData'; 

// --- 1. DEFINICIÓN DE DATOS ---

type EstadoProceso = 'operativo' | 'en_uso' | 'en_calibracion' | 'en_mantenimiento' | 'baja' | 'cuarentena' | 'programado' | 'completado' | 'fuera_servicio' | 'en_servicio' | 'en_prestamo';

export interface HistorialEntry {
  id: string;
  fecha: string;
  titulo: string;
  usuario: string;
  tipo: 'sistema' | 'flujo' | 'mantenimiento' | 'calibracion';
  descripcion?: string;
  costo?: number;
}

export interface RegistroPatron {
  id?: string;
  noControl: string;
  descripcion: string;
  marca: string;
  modelo: string;
  serie: string;
  
  // Metrología (Compatibilidad Total con NormasScreen)
  frecuenciaMeses: number; 
  fecha?: string; // Campo principal usado por NormasScreen
  fechaVencimiento?: string; // Campo secundario/nuevo
  
  // Estado
  estadoProceso: EstadoProceso;
  ubicacionActual?: string; 
  ubicacion?: string; // Legacy
  usuarioAsignado?: string;
  usuarioEnUso?: string; // Legacy NormasScreen
  
  // KPIs
  costoAcumuladoMantenimiento: number;
  historial: HistorialEntry[];
}

const COLLECTION_NAME = "patronesCalibracion";

// --- HELPERS SEGUROS (Evitan Pantalla Blanca) ---
const getFechaVencimiento = (item: RegistroPatron): string => {
    // Prioridad: fecha (legacy/NormasScreen) -> fechaVencimiento -> vacio
    return item.fecha || item.fechaVencimiento || '';
};

const getUbicacion = (item: RegistroPatron): string => {
    return item.ubicacionActual || item.ubicacion || 'Laboratorio';
};

const getUsuario = (item: RegistroPatron): string => {
    return item.usuarioEnUso || item.usuarioAsignado || 'Sin Asignar';
};

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
    const enMantenimiento = data.filter(d => d.estadoProceso === 'en_mantenimiento').length;
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
      
      // Si está vacío, usa datos de prueba (para desarrollo)
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
      usuario: "Viridiana Moreno", // Idealmente Auth Context
      tipo,
      descripcion,
      costo
    };

    const updatePayload: any = {
      ...updates,
      costoAcumuladoMantenimiento: (patron.costoAcumuladoMantenimiento || 0) + costo,
      historial: [nuevoHistorial, ...(patron.historial || [])]
    };

    // Sincronización de campos Legacy para NormasScreen
    if (updates.fechaVencimiento) updatePayload.fecha = updates.fechaVencimiento;
    if (updates.usuarioAsignado) updatePayload.usuarioEnUso = updates.usuarioAsignado;
    if (updates.ubicacionActual) updatePayload.ubicacion = updates.ubicacionActual;

    try {
      await setDoc(doc(db, COLLECTION_NAME, patron.id), updatePayload, { merge: true });
      await fetchData(); 
      return true;
    } catch (e) {
      console.error(e);
      alert("Error al guardar cambios");
      return false;
    }
  };

  const editarDatosBase = async (id: string, datos: Partial<RegistroPatron>) => {
      try {
          // Sincronizar fechas si se editan manualmente
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
  if (estado === 'en_calibracion') return <Badge color="blue" icon={Activity} label="Calibrando" />;
  if (estado === 'baja' || estado === 'fuera_servicio') return <Badge color="gray" icon={Ban} label="Baja" />;

  // Validación robusta de fecha
  if (!fecha || fecha === 'Por Comprar') return <Badge color="gray" label="Sin Fecha" />;

  try {
      const f = parseISO(fecha);
      if (!isValid(f)) return <Badge color="gray" label="Fecha Error" />;
      
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

// --- 4. PANTALLA PRINCIPAL ---

export const ProgramaCalibracionScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { data, loading, stats, registrarEvento, editarDatosBase } = usePatronesLogic();
  
  const [tab, setTab] = useState<'todo' | 'alertas' | 'servicio'>('alertas');
  const [busqueda, setBusqueda] = useState('');
  
  const [selectedItem, setSelectedItem] = useState<RegistroPatron | null>(null);
  const [workflowAction, setWorkflowAction] = useState<any>(null);

  // Filtrado Seguro
  const filteredData = useMemo(() => {
    let result = data;
    if (tab === 'alertas') {
      result = result.filter(d => {
        const f = getFechaVencimiento(d);
        if (!f) return false;
        try { return differenceInDays(parseISO(f), new Date()) <= 30 || d.estadoProceso === 'en_mantenimiento' || d.estadoProceso === 'en_calibracion'; } catch { return false; }
      });
    } else if (tab === 'servicio') {
        result = result.filter(d => d.estadoProceso === 'en_uso' || d.estadoProceso === 'en_servicio' || d.estadoProceso === 'en_prestamo');
    }

    if (busqueda) {
      const lower = busqueda.toLowerCase();
      result = result.filter(d => 
        (d.descripcion || '').toLowerCase().includes(lower) || 
        (d.noControl || '').toLowerCase().includes(lower) || 
        (d.serie || '').toLowerCase().includes(lower)
      );
    }
    
    // Ordenamiento seguro (evita crash en sort)
    return result.sort((a, b) => {
        const fa = getFechaVencimiento(a) || '2099-12-31';
        const fb = getFechaVencimiento(b) || '2099-12-31';
        return fa.localeCompare(fb);
    });
  }, [data, tab, busqueda]);

  const handleProcessWorkflow = async (formData: any) => {
      if(!selectedItem || !workflowAction) return;

      let success = false;
      switch(workflowAction) {
          case 'calibrar_envio':
              success = await registrarEvento(selectedItem, 'Envío a Calibración', `Proveedor: ${formData.proveedor}`, 'flujo', { estadoProceso: 'en_calibracion', ubicacionActual: 'Externo' });
              break;
          case 'calibrar_recepcion':
              success = await registrarEvento(selectedItem, 'Calibración Finalizada', `Certificado: ${formData.certificado}`, 'calibracion', { 
                  estadoProceso: 'operativo', 
                  ubicacionActual: 'Laboratorio',
                  fechaVencimiento: formData.nuevaFecha // Esto actualiza tambien "fecha" para NormasScreen
              });
              break;
          case 'mantenimiento_inicio':
               success = await registrarEvento(selectedItem, 'Entrada a Mantenimiento', `Motivo: ${formData.motivo}`, 'mantenimiento', { estadoProceso: 'en_mantenimiento', ubicacionActual: 'Taller' });
               break;
          case 'mantenimiento_fin':
               success = await registrarEvento(selectedItem, 'Mantenimiento Finalizado', formData.acciones, 'mantenimiento', { estadoProceso: 'operativo', ubicacionActual: 'Laboratorio' }, Number(formData.costo));
               break;
          case 'asignar':
               success = await registrarEvento(selectedItem, 'Asignación Manual', `Entregado a: ${formData.usuario}`, 'flujo', { estadoProceso: 'en_servicio', usuarioAsignado: formData.usuario, ubicacionActual: 'Planta' });
               break;
          case 'liberar':
               success = await registrarEvento(selectedItem, 'Devolución de Equipo', 'Equipo retornado a laboratorio y verificado.', 'flujo', { estadoProceso: 'operativo', usuarioAsignado: '', usuarioEnUso: '', ubicacionActual: 'Laboratorio' });
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
              <h1 className="text-xl font-bold text-gray-900">Control de Metrología</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> Modo Administrador
              </div>
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
            <KPICard title="Vencidos / Riesgo" value={stats.vencidos} icon={AlertTriangle} color="red" subtext="Requieren Acción" />
            <KPICard title="Equipos en Planta" value={stats.enUso} icon={User} color="indigo" subtext="En uso actualmente" />
            <KPICard title="Gasto Mantenimiento" value={`$${stats.gastoTotal.toLocaleString()}`} icon={DollarSign} color="green" subtext="Acumulado Histórico" />
        </div>

        {/* BARRA DE HERRAMIENTAS */}
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
             <TabButton active={tab === 'alertas'} onClick={() => setTab('alertas')} label="Atención Requerida" count={stats.vencidos} />
             <TabButton active={tab === 'servicio'} onClick={() => setTab('servicio')} label="En Planta / Prestados" count={stats.enUso} />
             <TabButton active={tab === 'todo'} onClick={() => setTab('todo')} label="Inventario Completo" />
          </div>
          <div className="relative w-full md:w-80">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
             <input 
               type="text" 
               placeholder="Buscar control, serie..." 
               className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
               value={busqueda}
               onChange={e => setBusqueda(e.target.value)}
             />
          </div>
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Activo</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Ubicación / Responsable</th>
                    <th className="px-6 py-4">Vencimiento</th>
                    <th className="px-6 py-4 text-right">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                       <tr><td colSpan={5} className="p-8 text-center text-gray-400">Cargando datos...</td></tr>
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
                            {(item.estadoProceso === 'en_servicio' || item.estadoProceso === 'en_uso') ? (
                                <div className="flex items-center gap-1.5 text-indigo-600 font-medium">
                                    <User className="w-3.5 h-3.5" /> {getUsuario(item)}
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <Truck className="w-3.5 h-3.5" /> {getUbicacion(item)}
                                </div>
                            )}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                             {fechaVenc ? (isValid(parseISO(fechaVenc)) ? format(parseISO(fechaVenc), 'dd MMM yyyy', {locale: es}) : '-') : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                             <button className="text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 transition-colors">
                                <ChevronRight className="w-5 h-5" />
                             </button>
                        </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
      </main>

      {/* --- SIDE PANEL: EXPEDIENTE --- */}
      <AnimatePresence>
        {selectedItem && !workflowAction && (
            <>
                <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedItem(null)} />
                <motion.div 
                    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 bottom-0 w-full md:w-[600px] bg-white z-50 shadow-2xl flex flex-col border-l border-gray-200"
                >
                    <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-2xl font-bold text-gray-900">{selectedItem.noControl}</h2>
                                <StatusBadge fecha={getFechaVencimiento(selectedItem)} estado={selectedItem.estadoProceso} />
                            </div>
                            <p className="text-gray-600">{selectedItem.descripcion}</p>
                        </div>
                        <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-6 h-6 text-gray-500"/></button>
                    </div>

                    <div className="p-4 grid grid-cols-2 gap-3 border-b border-gray-100 bg-white">
                        <SmartActionButton item={selectedItem} setAction={setWorkflowAction} />
                        <button onClick={() => setWorkflowAction('editar_base')} className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition">
                            <Edit3 className="w-4 h-4" /> Editar Datos
                        </button>
                        {selectedItem.estadoProceso !== 'en_mantenimiento' && (
                             <button onClick={() => setWorkflowAction('mantenimiento_inicio')} className="col-span-2 flex items-center justify-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 text-orange-700 font-medium rounded-lg hover:bg-orange-100 transition">
                                <Wrench className="w-4 h-4" /> Registrar Mantenimiento
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        <section>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b pb-2">Ficha Técnica</h3>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                <div><span className="block text-gray-400 text-xs">Marca</span> <span className="font-medium">{selectedItem.marca}</span></div>
                                <div><span className="block text-gray-400 text-xs">Modelo</span> <span className="font-medium">{selectedItem.modelo}</span></div>
                                <div><span className="block text-gray-400 text-xs">Serie</span> <span className="font-medium">{selectedItem.serie}</span></div>
                                <div><span className="block text-gray-400 text-xs">Frecuencia</span> <span className="font-medium">{selectedItem.frecuenciaMeses || 12} Meses</span></div>
                                <div><span className="block text-gray-400 text-xs">Costo Mantenimiento Total</span> <span className="font-medium text-green-600">${selectedItem.costoAcumuladoMantenimiento || 0}</span></div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2">
                                <History className="w-4 h-4"/> Historial Operativo
                            </h3>
                            <div className="relative pl-4 border-l-2 border-gray-100 space-y-6">
                                {(selectedItem.historial || []).map((h, i) => (
                                    <div key={i} className="relative pl-6">
                                        <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${h.tipo === 'calibracion' ? 'bg-blue-500' : h.tipo === 'mantenimiento' ? 'bg-orange-500' : 'bg-gray-400'}`} />
                                        <div className="flex justify-between items-start">
                                            <span className="text-sm font-bold text-gray-900">{h.titulo}</span>
                                            <span className="text-xs text-gray-400">{format(parseISO(h.fecha), 'dd MMM yy')}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{h.descripcion}</p>
                                        {h.costo && h.costo > 0 && (
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
                        </section>
                    </div>
                </motion.div>
            </>
        )}
      </AnimatePresence>

      {/* --- MODAL DE FLUJO (WORKFLOW) --- */}
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

// --- COMPONENTES AUXILIARES ---

const SmartActionButton = ({ item, setAction }: any) => {
    // Detectar vencimiento usando el helper seguro
    const f = getFechaVencimiento(item);
    let isExpired = false;
    try { isExpired = f ? differenceInDays(parseISO(f), new Date()) <= 0 : false; } catch(e){}

    if (item.estadoProceso === 'en_calibracion') {
        return <BigBtn onClick={() => setAction('calibrar_recepcion')} icon={ClipboardCheck} label="Recibir de Calibración" color="green" />;
    }
    if (item.estadoProceso === 'en_mantenimiento') {
        return <BigBtn onClick={() => setAction('mantenimiento_fin')} icon={CheckCircle} label="Finalizar Mantenimiento" color="green" />;
    }
    if (item.estadoProceso === 'en_servicio' || item.estadoProceso === 'en_uso' || item.estadoProceso === 'en_prestamo') {
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
    };
    return (
        <button onClick={onClick} className={`col-span-2 w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-bold shadow-sm transition-all ${colors[color]} ${animate ? 'animate-pulse' : ''}`}>
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

    const renderContent = () => {
        switch(action) {
            case 'editar_base':
                return (
                    <div className="space-y-3">
                        <Input label="Descripción" val={form.descripcion} onChange={v => setForm({...form, descripcion: v})} />
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Marca" val={form.marca} onChange={v => setForm({...form, marca: v})} />
                            <Input label="Modelo" val={form.modelo} onChange={v => setForm({...form, modelo: v})} />
                            <Input label="Serie" val={form.serie} onChange={v => setForm({...form, serie: v})} />
                            <Input label="No. Control" val={form.noControl} onChange={v => setForm({...form, noControl: v})} />
                        </div>
                        <Input label="Frecuencia (Meses)" type="number" val={form.frecuenciaMeses} onChange={v => setForm({...form, frecuenciaMeses: Number(v)})} />
                        <Input label="Fecha Vencimiento" type="date" val={form.fechaVencimiento} onChange={v => setForm({...form, fechaVencimiento: v})} />
                    </div>
                );
            case 'mantenimiento_inicio':
                return (
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Tipo de Falla / Motivo</label>
                        <textarea className="w-full border p-2 rounded-lg" rows={3} onChange={e => setForm({...form, motivo: e.target.value})}></textarea>
                    </div>
                );
            case 'mantenimiento_fin':
                return (
                    <div className="space-y-3">
                        <Input label="Acciones Realizadas" val={form.acciones} onChange={v => setForm({...form, acciones: v})} />
                        <Input label="Costo Total ($)" type="number" val={form.costo} onChange={v => setForm({...form, costo: v})} />
                    </div>
                );
            case 'calibrar_envio':
                return <Input label="Proveedor de Servicio" val={form.proveedor} onChange={v => setForm({...form, proveedor: v})} />;
            case 'calibrar_recepcion':
                 return (
                    <div className="space-y-3">
                        <Input label="No. Certificado" val={form.certificado} onChange={v => setForm({...form, certificado: v})} />
                        <Input label="Nueva Fecha Vencimiento" type="date" val={form.nuevaFecha} onChange={v => setForm({...form, nuevaFecha: v})} />
                    </div>
                 );
            case 'asignar':
                return <Input label="Nombre del Técnico" val={form.usuario} onChange={v => setForm({...form, usuario: v})} />;
            default: return <p>Confirmar acción...</p>;
        }
    };

    const getTitle = () => {
        const titles: any = {
            editar_base: 'Editar Datos Maestros',
            mantenimiento_inicio: 'Iniciar Mantenimiento',
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
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">{getTitle()}</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400"/></button>
                </div>
                <div className="p-6">
                    {renderContent()}
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">Cancelar</button>
                    <button onClick={() => onConfirm(form)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm">Confirmar</button>
                </div>
            </motion.div>
        </div>
    );
};

const Input = ({ label, val, onChange, type = "text" }: any) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{label}</label>
        <input 
            type={type} 
            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={val || ''} 
            onChange={e => onChange(e.target.value)} 
        />
    </div>
);