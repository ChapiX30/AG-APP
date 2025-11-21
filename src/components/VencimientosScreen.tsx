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
  Building2 // 🚨 AGREGADO AQUÍ (Faltaba este import)
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

  // --- Lógica de Cálculo de Fechas ---
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

  // --- Filtros ---
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

  // --- NUEVO: DETECTAR EQUIPOS A 60 DÍAS ---
  const equiposA60Dias = useMemo(() => {
    // Filtramos equipos que vencen entre 50 y 65 días (un rango seguro para no perder ninguno)
    return equipos.filter(e => e.diasRestantes >= 50 && e.diasRestantes <= 65);
  }, [equipos]);

  // --- NUEVO: FUNCIÓN PARA ENVIAR REPORTE A CALIDAD ---
  const enviarReporteCalidad = () => {
    if (equiposA60Dias.length === 0) {
        alert("No hay equipos en el rango de 60 días para reportar hoy.");
        return;
    }

    const destinatario = "calidad@ese-ag.mx";
    const asunto = `⚠️ ALERTA: ${equiposA60Dias.length} Equipos próximos a vencer (60 días)`;
    
    let cuerpo = `Hola Calidad,\n\nEl sistema ha detectado los siguientes equipos que vencerán en aproximadamente 60 días. Es momento de contactar al cliente:\n\n`;

    equiposA60Dias.forEach(e => {
        cuerpo += `🔹 ${e.equipoId} - ${e.descripcion}\n`;
        cuerpo += `   Cliente: ${e.cliente}\n`;
        cuerpo += `   Vence: ${format(e.fechaVencimiento, 'dd/MM/yyyy')} (Faltan ${e.diasRestantes} días)\n\n`;
    });

    cuerpo += `\nPor favor gestionar su reprogramación.\n\nSistema de Gestión ESE-AG`;

    const mailtoLink = `mailto:${destinatario}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    
    // Abrir cliente de correo
    window.location.href = mailtoLink;
  };

  // --- Exportar a Excel ---
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

  // --- Generar Link de Correo Individual ---
  const generarLinkCorreo = (equipo: EquipoVencimiento) => {
    const subject = `Recordatorio de Calibración Próxima - ${equipo.equipoId}`;
    const body = `Estimado cliente,\n\nLe informamos que el equipo ${equipo.descripcion} (ID: ${equipo.equipoId}) tiene su calibración vencida o próxima a vencer el día ${format(equipo.fechaVencimiento, 'dd/MM/yyyy')}.\n\nPor favor contáctenos para programar su servicio.\n\nSaludos,\nEquipos y Servicios AG`;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
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
              <p className="text-xs text-gray-500">CRM para seguimiento de clientes</p>
            </div>
          </div>
          
          <div className="flex gap-2">
             {/* BOTÓN NUEVO: NOTIFICAR A CALIDAD */}
             {equiposA60Dias.length > 0 && (
                 <button 
                    onClick={enviarReporteCalidad}
                    className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-all shadow-sm text-sm font-medium animate-pulse"
                    title="Enviar reporte de equipos a 60 días"
                 >
                    <Send size={16} /> Notificar a Calidad ({equiposA60Dias.length})
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

      {/* Contenido Principal */}
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        
        {/* Alerta visual si hay equipos a 60 días */}
        {equiposA60Dias.length > 0 && (
            <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-full text-orange-600">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-orange-800">Atención Calidad</h3>
                        <p className="text-sm text-orange-700">
                            Hay <strong>{equiposA60Dias.length} equipos</strong> que vencen en el rango de 60 días. 
                            Revisa la lista o envía el reporte.
                        </p>
                    </div>
                </div>
                <button onClick={() => setFiltroEstado('proximo')} className="text-sm font-semibold text-orange-600 hover:text-orange-800 underline">
                    Ver Equipos
                </button>
            </div>
        )}

        {/* Filtros y KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Stats Cards */}
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
                    <p className="text-xs text-gray-500 font-bold uppercase">Críticos (30 días)</p>
                    <p className="text-2xl font-bold text-gray-800">{equipos.filter(e => e.status === 'critico').length}</p>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-yellow-100 shadow-sm flex items-center gap-3 cursor-pointer hover:bg-yellow-50 transition" onClick={() => setFiltroEstado('proximo')}>
                <div className="p-3 bg-yellow-100 text-yellow-600 rounded-lg"><Calendar size={20} /></div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">Próximos (60 días)</p>
                    <p className="text-2xl font-bold text-gray-800">{equipos.filter(e => e.status === 'proximo').length}</p>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center gap-2">
                 <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Buscar cliente o equipo..." 
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                 </div>
                 <select 
                    className="w-full p-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                 >
                     <option value="todos">Mostrar Todos</option>
                     <option value="accion">Requieren Acción (Venc/Crit/Prox)</option>
                     <option value="vencido">Solo Vencidos</option>
                     <option value="vigente">Solo Vigentes</option>
                 </select>
            </div>
        </div>

        {/* Tabla de Resultados */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
                <div className="p-10 text-center text-gray-500">Cargando base de datos de equipos...</div>
            ) : equiposFiltrados.length === 0 ? (
                <div className="p-10 text-center text-gray-500">No se encontraron equipos con los filtros actuales.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3">Estado</th>
                                <th className="px-6 py-3">Cliente</th>
                                <th className="px-6 py-3">Equipo / ID</th>
                                <th className="px-6 py-3">Última Calib.</th>
                                <th className="px-6 py-3">Vencimiento</th>
                                <th className="px-6 py-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {equiposFiltrados.map((item) => (
                                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold capitalize
                                            ${item.status === 'vencido' ? 'bg-red-100 text-red-700' : 
                                              item.status === 'critico' ? 'bg-orange-100 text-orange-700' :
                                              item.status === 'proximo' ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-green-100 text-green-700'
                                            }`}>
                                            {item.status === 'vencido' ? <AlertTriangle size={12}/> : 
                                             item.status === 'vigente' ? <CheckCircle2 size={12}/> : <Clock size={12}/>}
                                            {item.status} ({item.diasRestantes} días)
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 font-medium text-gray-900">
                                        <div className="flex items-center gap-2">
                                            <Building2 size={16} className="text-gray-400"/>
                                            {item.cliente}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="font-medium text-gray-800">{item.descripcion}</div>
                                        <div className="text-xs text-gray-500">ID: {item.equipoId}</div>
                                    </td>
                                    <td className="px-6 py-3 text-gray-600">
                                        {format(parseISO(item.fechaCalibracion), 'dd MMM yyyy', { locale: es })}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`font-medium ${item.diasRestantes < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                            {format(item.fechaVencimiento, 'dd MMM yyyy', { locale: es })}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex justify-center gap-2">
                                            <a 
                                                href={generarLinkCorreo(item)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Enviar correo recordatorio al cliente"
                                            >
                                                <Mail size={18} />
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default VencimientosScreen;