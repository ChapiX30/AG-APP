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
  Minimize2,
  RefreshCw 
} from 'lucide-react';
import { addMonths, addYears, differenceInDays, parseISO, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';

// --- Tipos ---
interface EquipoVencimiento {
  id: string; // ID del documento en Firebase
  equipoId: string; // ID interno del equipo (Ej: MS-1128)
  descripcion: string;
  cliente: string;
  fechaCalibracion: string;
  frecuencia: string;
  fechaVencimiento: Date;
  diasRestantes: number;
  status: 'vencido' | 'critico' | 'proximo' | 'vigente';
  // Campos para gestión interna
  emailResponsable?: string; 
  responsableInterno?: string;
}

export const VencimientosScreen: React.FC = () => {
  const { goBack } = useNavigation();
  const [equipos, setEquipos] = useState<EquipoVencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos'); 
  
  // Estado para manejar qué clientes están expandidos
  const [clientesExpandidos, setClientesExpandidos] = useState<Record<string, boolean>>({});

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
      
      return addYears(fechaBase, 1); // Default 1 año
    } catch (e) { return null; }
  };

  // --- Carga de Datos con DOBLE CRUCE ---
  useEffect(() => {
    const fetchDatos = async () => {
      setLoading(true);
      try {
        // 1. CARGAR USUARIOS INTERNOS (Para obtener sus correos reales: Jorge -> jorge@empresa.com)
        const usuariosSnapshot = await getDocs(collection(db, "usuarios"));
        const mapUsuariosEmails: Record<string, string> = {};
        
        usuariosSnapshot.forEach(doc => {
            const d = doc.data();
            // Aseguramos coincidencia ignorando mayúsculas/minúsculas si es necesario
            if (d.nombre && d.email) {
                mapUsuariosEmails[d.nombre] = d.email;
            }
        });

        // 2. CARGAR CLIENTES (Para saber quién atiende a quién)
        const clientesSnapshot = await getDocs(collection(db, "clientes"));
        const mapClienteResponsable: Record<string, string> = {};
        
        clientesSnapshot.forEach(doc => {
            const d = doc.data();
            if (d.nombre && d.responsable) {
                // Mapeamos: "Cliente SA" -> "Jorge Amador"
                mapClienteResponsable[d.nombre.trim()] = d.responsable; 
            }
        });

        // 3. CARGAR EQUIPOS (Lógica de Hojas de Trabajo)
        const q = query(collection(db, "hojasDeTrabajo"), orderBy("fecha", "desc"));
        const querySnapshot = await getDocs(q);
        
        const listaProcesada: EquipoVencimiento[] = [];
        const hoy = new Date();
        const equiposProcesados = new Set<string>();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const rawId = data.id || data.certificado;
          const identificadorUnico = rawId ? String(rawId).trim() : null;

          // Filtro de duplicados (solo el registro más reciente)
          if (identificadorUnico && equiposProcesados.has(identificadorUnico)) return;
          if (identificadorUnico) equiposProcesados.add(identificadorUnico);

          const fechaVenc = calcularFechaVencimiento(data.fecha, data.frecuenciaCalibracion);

          if (fechaVenc) {
            const dias = differenceInDays(fechaVenc, hoy);
            let status: EquipoVencimiento['status'] = 'vigente';
            if (dias < 0) status = 'vencido';
            else if (dias <= 30) status = 'critico'; 
            else if (dias <= 60) status = 'proximo'; 

            // --- LÓGICA DE ASIGNACIÓN DE CORREO INTERNO ---
            const nombreCliente = (data.cliente || '').trim();
            
            // A. Buscamos quién es el responsable (ej. "Jorge Amador")
            const nombreResponsable = mapClienteResponsable[nombreCliente] || null;
            
            // B. Buscamos el correo de ese responsable (ej. "jorge@ese-ag.mx")
            const emailResponsable = nombreResponsable ? mapUsuariosEmails[nombreResponsable] : '';

            listaProcesada.push({
              id: doc.id,
              equipoId: identificadorUnico || 'S/N',
              descripcion: data.equipo || data.nombre || 'Equipo sin nombre',
              cliente: nombreCliente || 'Cliente desconocido',
              fechaCalibracion: data.fecha,
              frecuencia: data.frecuenciaCalibracion,
              fechaVencimiento: fechaVenc,
              diasRestantes: dias,
              status: status,
              // Guardamos la info cruzada
              emailResponsable: emailResponsable, 
              responsableInterno: nombreResponsable || 'Sin asignar'
            });
          }
        });
        
        // Ordenar por urgencia
        listaProcesada.sort((a, b) => a.diasRestantes - b.diasRestantes);
        setEquipos(listaProcesada);

      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDatos();
  }, []);

  // --- Filtros ---
  const equiposFiltrados = useMemo(() => {
    return equipos.filter(item => {
      const termino = busqueda.toLowerCase();
      const matchTexto = 
        item.cliente.toLowerCase().includes(termino) ||
        item.descripcion.toLowerCase().includes(termino) ||
        item.equipoId.toLowerCase().includes(termino);
      
      const matchEstado = filtroEstado === 'todos' 
        ? true 
        : filtroEstado === 'accion' 
          ? (item.status === 'vencido' || item.status === 'critico' || item.status === 'proximo') 
          : item.status === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [equipos, busqueda, filtroEstado]);

  // --- Agrupación por Cliente ---
  const equiposAgrupados = useMemo(() => {
    const grupos: Record<string, EquipoVencimiento[]> = {};
    
    equiposFiltrados.forEach(item => {
      if (!grupos[item.cliente]) {
        grupos[item.cliente] = [];
      }
      grupos[item.cliente].push(item);
    });

    return Object.keys(grupos).sort().reduce((obj, key) => { 
        obj[key] = grupos[key].sort((a, b) => a.diasRestantes - b.diasRestantes); 
        return obj;
    }, {} as Record<string, EquipoVencimiento[]>);
  }, [equiposFiltrados]);

  // --- Funciones UI ---
  const toggleCliente = (cliente: string) => {
    setClientesExpandidos(prev => ({ ...prev, [cliente]: !prev[cliente] }));
  };

  const expandirTodos = () => {
    const nuevoEstado: Record<string, boolean> = {};
    Object.keys(equiposAgrupados).forEach(c => nuevoEstado[c] = true);
    setClientesExpandidos(nuevoEstado);
  };

  const colapsarTodos = () => setClientesExpandidos({});

  // --- Alertas y Exportaciones ---
  const equiposA60Dias = useMemo(() => {
    return equipos.filter(e => e.diasRestantes >= 50 && e.diasRestantes <= 65);
  }, [equipos]);

  // Función para generar link a Outlook/Mail del Responsable Interno
  const generarLinkCorreo = (equipo: EquipoVencimiento) => {
    const destinatario = equipo.emailResponsable || ""; 
    const subject = `ALERTA VENCIMIENTO - Cliente: ${equipo.cliente} - Equipo: ${equipo.equipoId}`;
    
    const body = `Hola ${equipo.responsableInterno},\n\n` +
                 `Se requiere tu atención para el siguiente equipo que está próximo a vencer o vencido.\n\n` +
                 `DATOS DEL EQUIPO:\n` +
                 `--------------------------------\n` +
                 `Cliente: ${equipo.cliente}\n` +
                 `Equipo: ${equipo.descripcion}\n` +
                 `ID: ${equipo.equipoId}\n` +
                 `Vencimiento: ${format(equipo.fechaVencimiento, 'dd/MM/yyyy')}\n` +
                 `Estatus: ${equipo.status.toUpperCase()}\n\n` +
                 `Por favor contacta al cliente para programar la recolección o servicio.\n`;
    
    return `mailto:${destinatario}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const exportarExcel = () => {
    const dataExportar = equiposFiltrados.map(e => ({
      Cliente: e.cliente,
      Responsable: e.responsableInterno,
      Equipo: e.descripcion,
      ID: e.equipoId,
      'Fecha Calibración': format(parseISO(e.fechaCalibracion), 'yyyy-MM-dd'),
      'Vencimiento': format(e.fechaVencimiento, 'yyyy-MM-dd'),
      'Días Restantes': e.diasRestantes,
      Estado: e.status.toUpperCase()
    }));
    const ws = XLSX.utils.json_to_sheet(dataExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vencimientos");
    XLSX.writeFile(wb, `Reporte_Vencimientos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
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
              <p className="text-xs text-gray-500">Mostrando solo la última calibración por equipo</p>
            </div>
          </div>
          
          <div className="flex gap-2">
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
                        <p className="text-sm text-orange-700">Hay <strong>{equiposA60Dias.length} equipos</strong> por vencer en rango de 60 días.</p>
                    </div>
                </div>
            </div>
        )}

        {/* Filtros y KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div 
                className={`p-4 rounded-xl border shadow-sm flex items-center gap-3 cursor-pointer transition ${filtroEstado === 'vencido' ? 'bg-red-50 border-red-300 ring-2 ring-red-200' : 'bg-white border-red-100 hover:bg-red-50'}`} 
                onClick={() => setFiltroEstado(filtroEstado === 'vencido' ? 'todos' : 'vencido')}
            >
                <div className="p-3 bg-red-100 text-red-600 rounded-lg"><AlertTriangle size={20} /></div>
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">Vencidos</p>
                    <p className="text-2xl font-bold text-gray-800">{equipos.filter(e => e.status === 'vencido').length}</p>
                </div>
            </div>
            
            <div 
                className={`p-4 rounded-xl border shadow-sm flex items-center gap-3 cursor-pointer transition ${filtroEstado === 'critico' ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-200' : 'bg-white border-orange-100 hover:bg-orange-50'}`}
                onClick={() => setFiltroEstado(filtroEstado === 'critico' ? 'todos' : 'critico')}
            >
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
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                 </div>
                 <select 
                    className="w-full md:w-auto p-2 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                 >
                     <option value="todos">Todos los Estados</option>
                     <option value="accion">Requieren Acción</option>
                     <option value="vencido">Vencidos</option>
                     <option value="critico">Críticos (≤30 días)</option>
                     <option value="proximo">Próximos (30-60 días)</option>
                     <option value="vigente">Vigentes</option>
                 </select>
            </div>
        </div>

        {/* Controles de Vista Agrupada */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <h2 className="text-lg font-semibold text-gray-700">
                Resultados ({equiposFiltrados.length} equipos en {Object.keys(equiposAgrupados).length} clientes)
            </h2>
            <div className="flex gap-2">
                <button onClick={expandirTodos} className="text-xs flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-md transition font-medium border border-transparent hover:border-blue-100">
                    <Layers size={14}/> Expandir
                </button>
                <button onClick={colapsarTodos} className="text-xs flex items-center gap-1 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-md transition font-medium border border-transparent hover:border-gray-200">
                    <Minimize2 size={14}/> Colapsar
                </button>
            </div>
        </div>

        {/* LISTA AGRUPADA (ACORDEÓN) */}
        <div className="space-y-4">
            {loading ? (
                <div className="flex flex-col items-center justify-center p-12 text-gray-400 bg-white rounded-xl border border-gray-100 shadow-sm animate-pulse">
                    <RefreshCw size={32} className="animate-spin mb-3 text-blue-500"/>
                    <p>Analizando historial de calibraciones y asignando responsables...</p>
                </div>
            ) : Object.keys(equiposAgrupados).length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <Search size={32} className="mb-3 text-gray-300"/>
                    <p>No se encontraron equipos con los filtros actuales.</p>
                </div>
            ) : (
                Object.entries(equiposAgrupados).map(([cliente, itemsCliente]) => {
                    const isExpanded = clientesExpandidos[cliente];
                    const countVencidos = itemsCliente.filter(i => i.status === 'vencido').length;
                    const countCriticos = itemsCliente.filter(i => i.status === 'critico').length;
                    const hasAlerts = countVencidos > 0 || countCriticos > 0;
                    
                    // Obtenemos el responsable del primer item (todos son del mismo cliente)
                    const responsableDelGrupo = itemsCliente[0]?.responsableInterno;

                    return (
                        <div key={cliente} className={`bg-white rounded-xl border transition-all duration-200 shadow-sm ${hasAlerts ? 'border-l-4 border-l-red-500 border-gray-200' : 'border-gray-200'}`}>
                            
                            {/* CABECERA DEL CLIENTE (Clickable) */}
                            <button 
                                onClick={() => toggleCliente(cliente)}
                                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors rounded-t-xl focus:outline-none group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg transition-colors ${hasAlerts ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100'}`}>
                                        <Building2 size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-bold text-gray-800 text-sm md:text-base">{cliente}</h3>
                                            
                                            {/* BADGE DEL RESPONSABLE INTERNO */}
                                            {responsableDelGrupo && responsableDelGrupo !== 'Sin asignar' && (
                                                <span className="text-[10px] uppercase font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                                                    Atiende: {responsableDelGrupo}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs mt-1">
                                            <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{itemsCliente.length} Equipos</span>
                                            {countVencidos > 0 && <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-semibold">{countVencidos} Vencidos</span>}
                                            {countCriticos > 0 && <span className="text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full font-semibold">{countCriticos} Críticos</span>}
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
                                                    <th className="px-6 py-3 min-w-[120px]">Estado</th>
                                                    <th className="px-6 py-3 min-w-[200px]">Equipo / ID</th>
                                                    <th className="px-6 py-3 min-w-[150px]">Fechas</th>
                                                    <th className="px-6 py-3 text-center">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {itemsCliente.map((item) => (
                                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                                        <td className="px-6 py-3">
                                                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold w-fit shadow-sm
                                                                ${item.status === 'vencido' ? 'bg-red-100 text-red-700 border border-red-200' : 
                                                                  item.status === 'critico' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                                                                  item.status === 'proximo' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                                                  'bg-green-100 text-green-700 border border-green-200'
                                                                }`}>
                                                                {item.status === 'vencido' ? <AlertTriangle size={14}/> : 
                                                                 item.status === 'vigente' ? <CheckCircle2 size={14}/> : <Clock size={14}/>}
                                                                <span className="capitalize">{item.status}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <div className="font-semibold text-gray-800">{item.descripcion}</div>
                                                            <div className="text-xs text-gray-500 font-mono mt-0.5 bg-gray-100 inline-block px-1 rounded">
                                                                ID: {item.equipoId}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <div className="text-xs text-gray-500 mb-1">
                                                                Calib: <span className="font-medium text-gray-700">{format(parseISO(item.fechaCalibracion), 'dd/MM/yy')}</span>
                                                            </div>
                                                            <div className={`font-bold text-sm ${item.diasRestantes < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                                                Vence: {format(item.fechaVencimiento, 'dd/MM/yy')}
                                                            </div>
                                                            <div className={`text-xs mt-1 font-medium ${
                                                                item.diasRestantes < 0 ? 'text-red-500' : 
                                                                item.diasRestantes <= 30 ? 'text-orange-500' : 'text-green-600'
                                                            }`}>
                                                                {item.diasRestantes < 0 
                                                                    ? `Vencido hace ${Math.abs(item.diasRestantes)} días` 
                                                                    : `${item.diasRestantes} días restantes`}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <a 
                                                                href={generarLinkCorreo(item)}
                                                                className={`inline-flex items-center justify-center p-2 rounded-lg transition-all border shadow-sm ${item.emailResponsable ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200' : 'text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed'}`}
                                                                title={item.emailResponsable ? `Notificar a ${item.responsableInterno}` : "Sin responsable asignado"}
                                                                onClick={(e) => !item.emailResponsable && e.preventDefault()}
                                                            >
                                                                <Mail size={18} />
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