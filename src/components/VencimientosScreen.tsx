import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  orderBy, 
  limit 
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
  Phone, 
  Filter,
  Building2,
  Download
} from 'lucide-react';
import { addMonths, addYears, differenceInDays, parseISO, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';

// --- Tipos ---
interface EquipoVencimiento {
  id: string; // ID del documento
  equipoId: string; // ID del equipo (folio o identificador)
  descripcion: string;
  cliente: string;
  fechaCalibracion: string;
  frecuencia: string;
  fechaVencimiento: Date;
  diasRestantes: number;
  status: 'vencido' | 'critico' | 'proximo' | 'vigente';
  contacto?: string; // Opcional si guardas datos de contacto en la hoja
  telefono?: string;
  correo?: string;
}

export const VencimientosScreen: React.FC = () => {
  const { goBack } = useNavigation();
  const [equipos, setEquipos] = useState<EquipoVencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos'); // todos, vencido, critico, proximo

  // --- Lógica de Cálculo de Fechas ---
  const calcularFechaVencimiento = (fechaStr: string, frecuenciaStr: string): Date | null => {
    if (!fechaStr || !frecuenciaStr) return null;
    
    try {
      const fechaBase = parseISO(fechaStr);
      if (!isValid(fechaBase)) return null;

      const freqLower = frecuenciaStr.toLowerCase();
      
      // Lógica simple de parsing basada en tus opciones de WorkSheetScreen
      if (freqLower.includes('1 año')) return addYears(fechaBase, 1);
      if (freqLower.includes('2 años')) return addYears(fechaBase, 2);
      if (freqLower.includes('3 años')) return addYears(fechaBase, 3);
      if (freqLower.includes('3 meses')) return addMonths(fechaBase, 3);
      if (freqLower.includes('6 meses')) return addMonths(fechaBase, 6);
      
      return addYears(fechaBase, 1); // Default 1 año
    } catch (e) {
      return null;
    }
  };

  // --- Carga de Datos ---
  useEffect(() => {
    const fetchEquipos = async () => {
      setLoading(true);
      try {
        // Traemos las hojas de trabajo. 
        // NOTA: Si tienes miles de registros, idealmente deberías filtrar por fecha en Firebase.
        // Por ahora traemos todo para procesar en cliente.
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
            else if (dias <= 30) status = 'critico'; // Menos de un mes
            else if (dias <= 60) status = 'proximo'; // Entre 1 y 2 meses

            // Solo agregamos si es relevante (no mostramos vigentes de más de 1 año de antiguedad si ya se vencieron hace mucho, opcional)
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

        // Ordenar por los más urgentes primero
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
          ? (item.status === 'vencido' || item.status === 'critico' || item.status === 'proximo') // Muestra todo lo que requiere acción
          : item.status === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [equipos, busqueda, filtroEstado]);

  // --- Exportar a Excel para Calidad ---
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

  // --- Generar Link de Correo ---
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
             <button 
                onClick={exportarExcel}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-all shadow-sm text-sm font-medium"
             >
                <Download size={16} /> Exportar Excel
             </button>
          </div>
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        
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
                                                title="Enviar correo recordatorio"
                                            >
                                                <Mail size={18} />
                                            </a>
                                            {/* Aquí podrías agregar botón de WhatsApp si tuvieras el número */}
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