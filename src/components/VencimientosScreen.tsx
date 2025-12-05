import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { useNavigation } from '../hooks/useNavigation';
import { 
  ArrowLeft, 
  Search, 
  Calendar, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Mail, 
  Download,
  Send,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  Minimize2
} from 'lucide-react';
import { addMonths, addYears, differenceInDays, parseISO, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';

// --- Tipos ---
interface EquipoVencimiento {
  id: string; 
  equipoId: string; 
  descripcion: string;
  cliente: string;
  fechaCalibracion: string;
  frecuencia: string;
  fechaVencimiento: Date;
  diasRestantes: number;
  status: 'vencido' | 'critico' | 'proximo' | 'vigente';
  contacto?: string; 
  telefono?: string;
  correo?: string;
}

export const VencimientosScreen: React.FC = () => {
  const { goBack } = useNavigation();
  const [equipos, setEquipos] = useState<EquipoVencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos'); 
  
  // Estado para manejar qué clientes están expandidos
  // Un objeto donde la llave es el nombre del cliente y el valor es true (abierto) o false (cerrado)
  const [clientesExpandidos, setClientesExpandidos] = useState<Record<string, boolean>>({});

  // --- Lógica de Cálculo de Fechas (Igual que antes) ---
  const calcularFechaVencimiento = (fechaStr: string, frecuenciaStr: string): Date | null => {
    if (!fechaStr || !frecuenciaStr) return null;
    try {
      const fechaBase = parseISO(fechaStr);
      if (!isValid(fechaBase)) return null;
      const freqLower = frecuenciaStr.toLowerCase();
      
      if (freqLower.includes('1 año')) return addYears(fechaBase, 1);
      if (freqLower.includes('2 años')) return addYears(fechaBase, 2);
      if (freqLower.includes('3 años')) return addYears(fechaBase, 3);
      if (freqLower.includes('3 meses')) return addMonths(fechaBase, 3);
      if (freqLower.includes('6 meses')) return addMonths(fechaBase, 6);
      
      return addYears(fechaBase, 1); 
    } catch (e) { return null; }
  };

  // --- Carga de Datos ---
  useEffect(() => {
    const fetchEquipos = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "hojasDeTrabajo"), orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);
        const listaProcesada: EquipoVencimiento[] = [];
        const hoy = new Date();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const fechaVenc = calcularFechaVencimiento(data.fecha, data.frecuenciaCalibracion);

          if (fechaVenc) {
            const dias = differenceInDays(fechaVenc, hoy);
            let status: EquipoVencimiento['status'] = 'vigente';
            
            if (dias < 0) status = 'vencido';
            else if (dias <= 30) status = 'critico'; 
            else if (dias <= 60) status = 'proximo'; 

            listaProcesada.push({
              id: doc.id,
              equipoId: data.id || data.certificado || 'S/N',
              descripcion: data.equipo || data.nombre || 'Equipo sin nombre',
              cliente: data.cliente || 'Cliente desconocido',
              fechaCalibracion: data.fecha,
              frecuencia: data.frecuenciaCalibracion,
              fechaVencimiento: fechaVenc,
              diasRestantes: dias,
              status: status
            });
          }
        });
        listaProcesada.sort((a, b) => a.diasRestantes - b.diasRestantes);
        setEquipos(listaProcesada);
      } catch (error) {
        console.error("Error cargando equipos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEquipos();
  }, []);

  // --- Filtros (Igual que antes) ---
  const equiposFiltrados = useMemo(() => {
    return equipos.filter(item => {
      const matchTexto = 
        item.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.equipoId.toLowerCase().includes(busqueda.toLowerCase());
      
      const matchEstado = filtroEstado === 'todos' 
        ? true 
        : filtroEstado === 'accion' 
          ? (item.status === 'vencido' || item.status === 'critico' || item.status === 'proximo') 
          : item.status === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [equipos, busqueda, filtroEstado]);

  // --- NUEVA LÓGICA: AGRUPAR POR CLIENTE ---
  const equiposAgrupados = useMemo(() => {
    const grupos: Record<string, EquipoVencimiento[]> = {};
    
    equiposFiltrados.forEach(item => {
      if (!grupos[item.cliente]) {
        grupos[item.cliente] = [];
      }
      grupos[item.cliente].push(item);
    });

    // Ordenar los clientes alfabéticamente
    return Object.keys(grupos).sort().reduce((obj, key) => { 
        obj[key] = grupos[key]; 
        return obj;
    }, {} as Record<string, EquipoVencimiento[]>);
  }, [equiposFiltrados]);

  // --- Funciones de Control de UI ---
  const toggleCliente = (cliente: string) => {
    setClientesExpandidos(prev => ({
      ...prev,
      [cliente]: !prev[cliente]
    }));
  };

  const expandirTodos = () => {
    const nuevoEstado: Record<string, boolean> = {};
    Object.keys(equiposAgrupados).forEach(c => nuevoEstado[c] = true);
    setClientesExpandidos(nuevoEstado);
  };

  const colapsarTodos = () => {
    setClientesExpandidos({});
  };

  // --- Alertas y Exportaciones (Igual que antes) ---
  const equiposA60Dias = useMemo(() => {
    return equipos.filter(e => e.diasRestantes >= 50 && e.diasRestantes <= 65);
  }, [equipos]);

  const enviarReporteCalidad = () => {
    if (equiposA60Dias.length === 0) {
        alert("No hay equipos en el rango de 60 días para reportar hoy.");
        return;
    }
    const destinatario = "calidad@ese-ag.mx";
    const asunto = `⚠️ ALERTA: ${equiposA60Dias.length} Equipos próximos a vencer (60 días)`;
    let cuerpo = `Hola Calidad,\n\nEl sistema ha detectado equipos por vencer. Favor gestionar.\n\n`;
    equiposA60Dias.forEach(e => {
        cuerpo += `🔹 ${e.equipoId} - ${e.descripcion} (${e.cliente})\n`;
    });
    window.location.href = `mailto:${destinatario}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  };

  const exportarExcel = () => {
    const dataExportar = equiposFiltrados.map(e => ({
      Cliente: e.cliente,
      Equipo: e.descripcion,
      ID: e.equipoId,
      'Fecha Calibración': e.fechaCalibracion,
      'Vencimiento': format(e.fechaVencimiento, 'yyyy-MM-dd'),
      'Días Restantes': e.diasRestantes,
      Estado: e.status.toUpperCase()
    }));
    const ws = XLSX.utils.json_to_sheet(dataExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vencimientos");
    XLSX.writeFile(wb, `Reporte_Vencimientos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const generarLinkCorreo = (equipo: EquipoVencimiento) => {
    const subject = `Recordatorio de Calibración - ${equipo.equipoId}`;
    const body = `Estimado cliente, su equipo ${equipo.descripcion} vence el ${format(equipo.fechaVencimiento, 'dd/MM/yyyy')}.`;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="text-blue-600" />
                Monitor de Vencimientos
              </h1>
              <p className="text-xs text-gray-500">Vista agrupada por cliente</p>
            </div>
          </div>
          
          <div className="flex gap-2">
             {equiposA60Dias.length > 0 && (
                 <button 
                    onClick={enviarReporteCalidad}
                    className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-all shadow-sm text-sm font-medium animate-pulse"
                 >
                    <Send size={16} /> Notificar ({equiposA60Dias.length})
                 </button>
             )}
             <button 
                onClick={exportarExcel}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-all shadow-sm text-sm font-medium"
             >
                <Download size={16} /> Excel
             </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        
        {/* Alerta Calidad */}
        {equiposA60Dias.length > 0 && (
            <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-full text-orange-600"><AlertTriangle size={20} /></div>
                    <div>
                        <h3 className="font-bold text-orange-800">Atención Calidad</h3>
                        <p className="text-sm text-orange-700">Hay <strong>{equiposA60Dias.length} equipos</strong> por vencer en 60 días.</p>
                    </div>
                </div>
            </div>
        )}

        {/* Filtros y KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm flex items-center gap-3 cursor-pointer hover:bg-red-50 transition" onClick={() => setFiltroEstado('vencido')}>
                <div className="p-3 bg-red-100 text-red-600 rounded-lg"><AlertTriangle size={20} /></div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">Vencidos</p>
                    <p className="text-2xl font-bold text-gray-800">{equipos.filter(e => e.status === 'vencido').length}</p>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-orange-100 shadow-sm flex items-center gap-3 cursor-pointer hover:bg-orange-50 transition" onClick={() => setFiltroEstado('critico')}>
                <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Clock size={20} /></div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">Críticos</p>
                    <p className="text-2xl font-bold text-gray-800">{equipos.filter(e => e.status === 'critico').length}</p>
                </div>
            </div>
            
            {/* Buscador y Filtro */}
            <div className="md:col-span-2 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-3 items-center">
                 <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Buscar cliente, equipo o ID..." 
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                 </div>
                 <select 
                    className="w-full md:w-auto p-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                 >
                     <option value="todos">Todos los Estados</option>
                     <option value="accion">Requieren Acción</option>
                     <option value="vencido">Vencidos</option>
                     <option value="vigente">Vigentes</option>
                 </select>
            </div>
        </div>

        {/* Controles de Vista Agrupada */}
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-700">
                Resultados ({equiposFiltrados.length} equipos en {Object.keys(equiposAgrupados).length} clientes)
            </h2>
            <div className="flex gap-2">
                <button onClick={expandirTodos} className="text-xs flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-md transition">
                    <Layers size={14}/> Expandir Todos
                </button>
                <button onClick={colapsarTodos} className="text-xs flex items-center gap-1 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-md transition">
                    <Minimize2 size={14}/> Colapsar Todos
                </button>
            </div>
        </div>

        {/* LISTA AGRUPADA (ACORDEÓN) */}
        <div className="space-y-4">
            {loading ? (
                <div className="p-10 text-center text-gray-500 bg-white rounded-xl shadow-sm">Cargando datos...</div>
            ) : Object.keys(equiposAgrupados).length === 0 ? (
                <div className="p-10 text-center text-gray-500 bg-white rounded-xl shadow-sm">No se encontraron equipos con los filtros actuales.</div>
            ) : (
                Object.entries(equiposAgrupados).map(([cliente, itemsCliente]) => {
                    const isExpanded = clientesExpandidos[cliente];
                    const countVencidos = itemsCliente.filter(i => i.status === 'vencido').length;
                    const countCriticos = itemsCliente.filter(i => i.status === 'critico').length;
                    const hasAlerts = countVencidos > 0 || countCriticos > 0;

                    return (
                        <div key={cliente} className={`bg-white rounded-xl border transition-all duration-200 ${hasAlerts ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'}`}>
                            
                            {/* CABECERA DEL CLIENTE (Clickable) */}
                            <button 
                                onClick={() => toggleCliente(cliente)}
                                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors rounded-t-xl focus:outline-none"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${hasAlerts ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                        <Building2 size={20} />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-gray-800 text-sm md:text-base">{cliente}</h3>
                                        <div className="flex gap-2 text-xs mt-1">
                                            <span className="text-gray-500">{itemsCliente.length} Equipos</span>
                                            {countVencidos > 0 && <span className="text-red-600 font-semibold">• {countVencidos} Vencidos</span>}
                                            {countCriticos > 0 && <span className="text-orange-600 font-semibold">• {countCriticos} Críticos</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-gray-400">
                                    {isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}
                                </div>
                            </button>

                            {/* TABLA DESPLEGABLE */}
                            {isExpanded && (
                                <div className="border-t border-gray-100 animate-fadeIn">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                                                <tr>
                                                    <th className="px-6 py-3">Estado</th>
                                                    <th className="px-6 py-3">Equipo / ID</th>
                                                    <th className="px-6 py-3">Fechas</th>
                                                    <th className="px-6 py-3 text-center">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {itemsCliente.map((item) => (
                                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                                        <td className="px-6 py-3">
                                                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold w-fit
                                                                ${item.status === 'vencido' ? 'bg-red-100 text-red-700' : 
                                                                  item.status === 'critico' ? 'bg-orange-100 text-orange-700' :
                                                                  item.status === 'proximo' ? 'bg-yellow-100 text-yellow-700' :
                                                                  'bg-green-100 text-green-700'
                                                                }`}>
                                                                {item.status === 'vencido' ? <AlertTriangle size={12}/> : 
                                                                 item.status === 'vigente' ? <CheckCircle2 size={12}/> : <Clock size={12}/>}
                                                                <span className="capitalize">{item.status}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <div className="font-medium text-gray-800">{item.descripcion}</div>
                                                            <div className="text-xs text-gray-500 font-mono">ID: {item.equipoId}</div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <div className="text-xs text-gray-500">
                                                                Calib: {format(parseISO(item.fechaCalibracion), 'dd/MM/yy')}
                                                            </div>
                                                            <div className={`font-medium ${item.diasRestantes < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                                                Vence: {format(item.fechaVencimiento, 'dd/MM/yy')}
                                                            </div>
                                                            <div className="text-xs text-gray-400">
                                                                ({item.diasRestantes} días)
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <a 
                                                                href={generarLinkCorreo(item)}
                                                                className="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                                title="Enviar correo"
                                                            >
                                                                <Mail size={16} />
                                                            </a>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
      </div>
    </div>
  );
};

export default VencimientosScreen;