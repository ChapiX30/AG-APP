import React, { useEffect, useState, useMemo } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { 
  Building2, Wrench, Tag, Hash, FileText, ArrowLeft, 
  Calendar, Edit, Loader2, ChevronRight, X, ExternalLink,
  Search, Home, Activity, CheckCircle2, Factory, AlertTriangle, MessageSquare
} from 'lucide-react';

// ====================================================================
// COMPONENTE: VISOR DE PDF INTEGRADO
// ====================================================================
const PdfViewerModal = ({ pdfUrl, onClose }: { pdfUrl: string, onClose: () => void }) => {
  if (!pdfUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 w-full max-w-5xl h-full sm:h-[90vh] rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 text-white mb-2 sm:mb-0">
            <FileText className="w-5 h-5 text-red-400" />
            <h3 className="font-bold text-sm sm:text-base">Visor de Documento</h3>
          </div>
          <div className="flex items-center gap-2">
            <a 
              href={pdfUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-xs font-medium"
            >
              <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Navegador</span>
            </a>
            <button 
              onClick={onClose} 
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors text-xs font-medium"
            >
              <X className="w-4 h-4" /> Cerrar
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-200 relative w-full h-full">
           <iframe src={pdfUrl} className="absolute inset-0 w-full h-full border-0" title="Visor PDF" />
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// VISTA A: DIRECTORIO DE EMPRESAS
// ====================================================================
export const DirectorioEmpresasScreen = () => {
  const { navigateTo } = useNavigation();
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchEmpresas = async () => {
      try {
        const qs = await getDocs(collection(db, "clientes"));
        const lista = qs.docs.map(d => ({ id: d.id, ...d.data() }));
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
        setEmpresas(lista);
      } catch (error) {
        console.error("Error cargando empresas:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEmpresas();
  }, []);

  const empresasFiltradas = useMemo(() => {
    if (!searchTerm) return empresas;
    return empresas.filter(e => e.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [empresas, searchTerm]);

  const irAEquipos = (nombreEmpresa: string) => {
    localStorage.setItem('historial_empresa', nombreEmpresa);
    navigateTo('equipos-empresa');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigateTo('menu')} 
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all"
            title="Volver al Menú"
          >
            <Home className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Factory className="w-6 h-6 text-blue-600"/> Directorio de Clientes
            </h1>
            <p className="text-xs text-slate-500 font-medium">Historial de equipos calibrados por empresa</p>
          </div>
        </div>

        {/* BUSCADOR */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Buscar empresa..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-transparent focus:bg-white focus:border-blue-500 rounded-xl text-sm outline-none transition-all"
          />
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-6 max-w-6xl mx-auto w-full flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
             <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
             <p className="text-slate-400 font-medium text-sm">Cargando directorio...</p>
          </div>
        ) : empresasFiltradas.length === 0 ? (
          <div className="text-center py-20">
             <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
             <p className="text-slate-500 font-medium text-lg">No se encontraron empresas</p>
             <p className="text-slate-400 text-sm">Intenta buscar con otro término</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {empresasFiltradas.map((empresa) => (
              <button 
                key={empresa.id} 
                onClick={() => irAEquipos(empresa.nombre)} 
                className="group bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between hover:shadow-md hover:border-blue-300 hover:-translate-y-1 transition-all text-left h-full"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg line-clamp-2">{empresa.nombre}</h3>
                  <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Ver equipos asignados</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// VISTA B: EQUIPOS POR EMPRESA
// ====================================================================
export const EquiposPorEmpresaScreen = () => {
  const { navigateTo } = useNavigation();
  const nombreEmpresa = localStorage.getItem('historial_empresa') || '';
  const [equipos, setEquipos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!nombreEmpresa) return;
    const fetchEquipos = async () => {
      try {
        const q = query(collection(db, "hojasDeTrabajo"), where("cliente", "==", nombreEmpresa));
        const snapshot = await getDocs(q);
        const equiposUnicos: Record<string, any> = {};
        
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.id && !equiposUnicos[data.id]) {
            equiposUnicos[data.id] = { idEquipo: data.id, marca: data.marca, modelo: data.modelo, equipo: data.equipo };
          }
        });
        setEquipos(Object.values(equiposUnicos).sort((a, b) => a.idEquipo.localeCompare(b.idEquipo)));
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEquipos();
  }, [nombreEmpresa]);

  const equiposFiltrados = useMemo(() => {
    if (!searchTerm) return equipos;
    return equipos.filter(e => 
      e.idEquipo.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (e.equipo && e.equipo.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [equipos, searchTerm]);

  const irADetalle = (idEquipo: string) => {
    localStorage.setItem('historial_equipo_id', idEquipo);
    navigateTo('detalle-equipo');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* HEADER */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-4 text-white">
          <button onClick={() => navigateTo('directorio-empresas')} className="p-2 hover:bg-slate-800 rounded-xl transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400"/> {nombreEmpresa}
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Selecciona un equipo para ver su historial</p>
          </div>
        </div>

        {/* BUSCADOR */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Buscar por ID o nombre..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 focus:bg-slate-950 focus:border-blue-500 rounded-xl text-sm text-white outline-none transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-6 max-w-4xl mx-auto w-full flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
             <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
             <p className="text-slate-400 font-medium text-sm">Cargando equipos...</p>
          </div>
        ) : equiposFiltrados.length === 0 ? (
           <div className="text-center py-20">
             <Wrench className="w-16 h-16 text-slate-300 mx-auto mb-4" />
             <p className="text-slate-500 font-medium text-lg">No hay equipos registrados</p>
           </div>
        ) : (
          <div className="space-y-3">
            {equiposFiltrados.map((eq) => (
              <button 
                key={eq.idEquipo} 
                onClick={() => irADetalle(eq.idEquipo)} 
                className="w-full group bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md hover:border-blue-300 hover:bg-blue-50/30 transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Hash className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{eq.idEquipo}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {eq.equipo ? <span className="text-slate-700">{eq.equipo} • </span> : ""}
                      {eq.marca} {eq.modelo}
                    </p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                   <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ====================================================================
// VISTA C: DETALLE E HISTORIAL DEL EQUIPO (TIMELINE)
// ====================================================================
export const DetalleEquipoScreen = () => {
  const { navigateTo } = useNavigation();
  const nombreEmpresa = localStorage.getItem('historial_empresa') || '';
  const idEquipo = localStorage.getItem('historial_equipo_id') || '';
  
  const [historial, setHistorial] = useState<any[]>([]);
  const [infoGeneral, setInfoGeneral] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [pdfToView, setPdfToView] = useState<string | null>(null);

  useEffect(() => {
    if (!nombreEmpresa || !idEquipo) return;
    const fetchHistorial = async () => {
      try {
        const q = query(collection(db, "hojasDeTrabajo"), where("id", "==", idEquipo), where("cliente", "==", nombreEmpresa));
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(doc => ({ idDoc: doc.id, ...doc.data() }));
        // Ordenar de más reciente a más antiguo
        records.sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        setHistorial(records);
        if (records.length > 0) setInfoGeneral(records[0]);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchHistorial();
  }, [idEquipo, nombreEmpresa]);

  const editarHoja = (idDoc: string) => {
    localStorage.setItem('edit_worksheet_id', idDoc);
    navigateTo('work-sheet');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {pdfToView && <PdfViewerModal pdfUrl={pdfToView} onClose={() => setPdfToView(null)} />}

      {/* HEADER DEGRADADO */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 text-white px-6 py-6 shadow-lg flex-shrink-0">
        <div className="max-w-6xl mx-auto w-full flex items-center gap-4">
          <button 
            onClick={() => navigateTo('equipos-empresa')} 
            className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
               <Hash className="w-6 h-6 text-blue-400"/> {idEquipo}
            </h1>
            <p className="text-sm text-slate-300 font-medium flex items-center gap-1.5 mt-1">
               <Building2 className="w-4 h-4 opacity-70"/> {nombreEmpresa}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* PANEL IZQUIERDO: TARJETA DE INFO GENERAL */}
        <div className="lg:col-span-4 lg:sticky lg:top-6">
          <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden relative">
            <div className="h-16 bg-blue-50 border-b border-blue-100 flex items-center px-6">
               <h2 className="font-bold text-blue-800 flex items-center gap-2">
                 <Tag className="w-5 h-5" /> Ficha Técnica
               </h2>
            </div>
            
            <div className="p-6">
              {infoGeneral ? (
                <div className="space-y-5">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Nombre del Equipo</span>
                    <span className="font-bold text-slate-800 text-base">{infoGeneral.equipo || "-"}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Marca</span>
                      <span className="font-semibold text-slate-700">{infoGeneral.marca || "-"}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Modelo</span>
                      <span className="font-semibold text-slate-700">{infoGeneral.modelo || "-"}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Número de Serie</span>
                    <span className="font-mono font-semibold text-slate-700">{infoGeneral.numeroSerie || "-"}</span>
                  </div>
                  
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Total de Calibraciones Registradas</span>
                    <span className="font-bold text-blue-600 text-xl">{historial.length}</span>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                  <div className="h-10 bg-slate-100 rounded-xl"></div>
                  <div className="h-10 bg-slate-100 rounded-xl"></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: LÍNEA DE TIEMPO (TIMELINE) */}
        <div className="lg:col-span-8">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-slate-400" />
            <h2 className="font-bold text-slate-800 text-lg">Historial de Calibraciones</h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
          ) : historial.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
               <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
               <p className="text-slate-500 font-medium">No hay registros para este equipo</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-4 pl-8 pb-10 space-y-8">
              {historial.map((hoja, index) => {
                 const esUltimo = index === 0;
                 
                 // LÓGICA DE DETECCIÓN DE CAMBIO DE FRECUENCIA
                 const hojaAnterior = historial[index + 1]; // La siguiente en el array es la anterior en el tiempo
                 const freqActual = hoja.frecuenciaCalibracion?.trim().toLowerCase();
                 const freqAnterior = hojaAnterior?.frecuenciaCalibracion?.trim().toLowerCase();
                 
                 const cambioFrecuenciaDetectado = 
                   freqAnterior && 
                   freqActual && 
                   freqActual !== freqAnterior;

                 return (
                  <div key={hoja.idDoc} className="relative">
                    {/* PUNTO DE LA LÍNEA DE TIEMPO */}
                    <div className={`absolute -left-[41px] top-4 w-5 h-5 rounded-full border-4 border-slate-50 flex items-center justify-center ${esUltimo ? 'bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.2)]' : 'bg-slate-300'}`}></div>
                    
                    {/* TARJETA DEL EVENTO */}
                    <div className={`bg-white rounded-2xl shadow-sm border ${esUltimo ? 'border-blue-200' : 'border-slate-200'} overflow-hidden hover:shadow-md transition-shadow`}>
                      
                      {/* Cabecera de la Tarjeta */}
                      <div className={`px-5 py-3 border-b flex flex-wrap gap-2 justify-between items-center ${esUltimo ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-2">
                          <Calendar className={`w-4 h-4 ${esUltimo ? 'text-blue-500' : 'text-slate-400'}`} />
                          <span className={`font-bold ${esUltimo ? 'text-blue-900' : 'text-slate-700'}`}>{hoja.fecha}</span>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${esUltimo ? 'bg-white text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-600 border-slate-200'}`}>
                          Cert: {hoja.certificado}
                        </span>
                      </div>
                      
                      {/* Cuerpo de la Tarjeta */}
                      <div className="p-5 flex flex-col justify-between gap-5">
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 w-full">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                                  <span className="text-[10px] font-bold text-slate-500">{hoja.nombre?.charAt(0) || "T"}</span>
                               </div>
                               <p className="text-sm font-medium text-slate-700">{hoja.nombre}</p>
                            </div>
                            <div className="flex gap-4 text-xs font-medium text-slate-500">
                               <p className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> {hoja.status_equipo || "Completado"}</p>
                               <p>Freq: {hoja.frecuenciaCalibracion}</p>
                            </div>
                          </div>
                          
                          {/* Botones de Acción */}
                          <div className="flex w-full md:w-auto gap-2">
                            <button 
                              onClick={() => setPdfToView(hoja.pdfURL)} 
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-600 hover:text-white font-semibold text-sm transition-all"
                            >
                              <FileText className="w-4 h-4" /> PDF
                            </button>
                            
                            <button 
                              onClick={() => editarHoja(hoja.idDoc)} 
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 hover:shadow-lg font-semibold text-sm transition-all"
                            >
                              <Edit className="w-4 h-4" /> Editar
                            </button>
                          </div>
                        </div>

                        {/* ALERTA: CAMBIO DE FRECUENCIA DETECTADO */}
                        {cambioFrecuenciaDetectado && (
                          <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                               <p className="text-sm font-bold text-amber-900">Cambio de Frecuencia Detectado</p>
                               <p className="text-xs text-amber-800 mt-0.5">
                                 La frecuencia de calibración se modificó de <strong className="font-bold bg-amber-100 px-1 rounded">{hojaAnterior.frecuenciaCalibracion}</strong> a <strong className="font-bold bg-amber-100 px-1 rounded">{hoja.frecuenciaCalibracion}</strong> en esta fecha.
                               </p>
                               
                               {/* Muestra las notas si existen para justificar el cambio */}
                               {(hoja.notas || hoja.observaciones || hoja.comentarios) && (
                                 <div className="mt-3 text-xs text-amber-900 bg-amber-100/50 p-3 rounded-lg flex items-start gap-2 border border-amber-100">
                                    <MessageSquare className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
                                    <div>
                                      <strong className="block mb-0.5 text-amber-700">Notas del Técnico:</strong> 
                                      <span className="italic">{hoja.notas || hoja.observaciones || hoja.comentarios}</span>
                                    </div>
                                 </div>
                               )}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                 )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};