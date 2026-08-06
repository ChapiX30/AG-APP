import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import logoAg from '../assets/lab_logo.png';
import {
  LabelPrinterButton,
  buildLabelDataFromRecord,
  calcularSiguienteFecha,
  formatLabelDate,
  type LabelDateFormat,
} from './LabelPrinterButton';
import {
  Building2, Wrench, Tag, Hash, FileText, ArrowLeft,
  Calendar, Edit, Loader2, ChevronRight, X, ExternalLink,
  Search, Home, Activity, CheckCircle2, Factory, AlertTriangle, MessageSquare,
  Printer, Clock, Layers, Sparkles
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

function formatFechaCorta(fecha?: string): string {
  if (!fecha) return "—";
  try {
    const d = parseISO(fecha);
    if (!isValid(d)) return fecha;
    return format(d, "dd MMM yyyy", { locale: es });
  } catch {
    return fecha;
  }
}

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
    <div className="min-h-full flex-shrink-0 bg-slate-50 flex flex-col">
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white sticky top-0 z-10 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 to-transparent pointer-events-none" />
        <div className="relative px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateTo('menu')}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all"
              title="Volver al Menú"
            >
              <Home className="w-5 h-5" />
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">Historial de vida</p>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Factory className="w-6 h-6 text-blue-700" /> Directorio de Clientes
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Explora el historial de calibraciones por empresa
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar empresa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border border-transparent focus:bg-white focus:border-blue-600 rounded-xl text-sm outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 max-w-6xl mx-auto w-full flex-1">
        {!loading && empresasFiltradas.length > 0 && (
          <p className="text-xs font-medium text-slate-500 mb-4">
            {empresasFiltradas.length} cliente{empresasFiltradas.length === 1 ? "" : "s"}
          </p>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
            <p className="text-slate-400 font-medium text-sm">Cargando directorio...</p>
          </div>
        ) : empresasFiltradas.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium text-lg">No se encontraron empresas</p>
            <p className="text-slate-400 text-sm">Intenta buscar con otro término</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {empresasFiltradas.map((empresa) => (
              <button
                key={empresa.id}
                onClick={() => irAEquipos(empresa.nombre)}
                className="group bg-white p-5 rounded-2xl shadow-sm border border-slate-200/90 flex flex-col justify-between hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5 transition-all text-left h-full"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <Building2 className="w-6 h-6 text-blue-700" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-700 transition-colors" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg line-clamp-2">{empresa.nombre}</h3>
                  <p className="text-xs font-medium text-slate-500 mt-1.5">Ver historial de equipos</p>
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

        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (!data.id) return;
          const existing = equiposUnicos[data.id];
          const fechaMs = data.fecha ? new Date(data.fecha).getTime() : 0;
          if (!existing) {
            equiposUnicos[data.id] = {
              idEquipo: data.id,
              marca: data.marca,
              modelo: data.modelo,
              equipo: data.equipo,
              numeroSerie: data.numeroSerie,
              ultimaFecha: data.fecha || "",
              ultimaFechaMs: fechaMs,
              calibraciones: 1,
            };
          } else {
            existing.calibraciones += 1;
            if (fechaMs >= existing.ultimaFechaMs) {
              existing.ultimaFecha = data.fecha || existing.ultimaFecha;
              existing.ultimaFechaMs = fechaMs;
              existing.marca = data.marca || existing.marca;
              existing.modelo = data.modelo || existing.modelo;
              existing.equipo = data.equipo || existing.equipo;
              existing.numeroSerie = data.numeroSerie || existing.numeroSerie;
            }
          }
        });
        setEquipos(Object.values(equiposUnicos).sort((a: any, b: any) => a.idEquipo.localeCompare(b.idEquipo)));
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
    const term = searchTerm.toLowerCase();
    return equipos.filter(e =>
      e.idEquipo.toLowerCase().includes(term) ||
      (e.equipo && e.equipo.toLowerCase().includes(term)) ||
      (e.marca && e.marca.toLowerCase().includes(term)) ||
      (e.modelo && e.modelo.toLowerCase().includes(term)) ||
      (e.numeroSerie && String(e.numeroSerie).toLowerCase().includes(term))
    );
  }, [equipos, searchTerm]);

  const irADetalle = (idEquipo: string) => {
    localStorage.setItem('historial_equipo_id', idEquipo);
    navigateTo('detalle-equipo');
  };

  return (
    <div className="min-h-full flex-shrink-0 bg-slate-50 flex flex-col">
      <div className="bg-slate-900 border-b border-slate-800 px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-4 text-white min-w-0">
          <button onClick={() => navigateTo('directorio-empresas')} className="p-2 hover:bg-slate-800 rounded-xl transition-all shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-300/90">Historial de vida</p>
            <h1 className="text-xl font-bold flex items-center gap-2 truncate">
              <Building2 className="w-5 h-5 text-blue-400 shrink-0" />
              <span className="truncate">{nombreEmpresa}</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {loading ? "Cargando equipos…" : `${equipos.length} equipo${equipos.length === 1 ? "" : "s"} con historial`}
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar ID, nombre, marca…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 focus:bg-slate-950 focus:border-blue-500 rounded-xl text-sm text-white outline-none transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="p-5 sm:p-6 max-w-4xl mx-auto w-full flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
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
                className="w-full group bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md hover:border-blue-400 hover:bg-blue-50/40 transition-all text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
                    <Hash className="w-5 h-5 text-slate-400 group-hover:text-blue-700" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 text-lg truncate">{eq.idEquipo}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                      {eq.equipo ? <span className="text-slate-700">{eq.equipo} · </span> : null}
                      {[eq.marca, eq.modelo].filter(Boolean).join(" ") || "Sin marca/modelo"}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {eq.calibraciones} cal.
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Última: {formatFechaCorta(eq.ultimaFecha)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors shrink-0 ml-2">
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700" />
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
// VISTA C: DETALLE E HISTORIAL DEL EQUIPO (TIMELINE + ETIQUETA)
// ====================================================================
export const DetalleEquipoScreen = () => {
  const { navigateTo } = useNavigation();
  const nombreEmpresa = localStorage.getItem('historial_empresa') || '';
  const idEquipo = localStorage.getItem('historial_equipo_id') || '';

  const [historial, setHistorial] = useState<any[]>([]);
  const [infoGeneral, setInfoGeneral] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateMode, setDateMode] = useState<LabelDateFormat>("full");
  const [pdfToView, setPdfToView] = useState<string | null>(null);

  useEffect(() => {
    if (!nombreEmpresa || !idEquipo) return;
    const fetchHistorial = async () => {
      try {
        const [hojasSnap, clientesSnap] = await Promise.all([
          getDocs(query(
            collection(db, "hojasDeTrabajo"),
            where("id", "==", idEquipo),
            where("cliente", "==", nombreEmpresa)
          )),
          getDocs(query(collection(db, "clientes"), where("nombre", "==", nombreEmpresa))),
        ]);

        const records = hojasSnap.docs.map(docSnap => ({ idDoc: docSnap.id, ...docSnap.data() }));
        records.sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        setHistorial(records);
        if (records.length > 0) setInfoGeneral(records[0]);

        if (!clientesSnap.empty) {
          const fmt = clientesSnap.docs[0].data().formatoFechaEtiqueta as LabelDateFormat | undefined;
          setDateMode(fmt || "full");
        }
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

  const ultimaHoja = historial[0];
  const labelUltima = useMemo(
    () => (ultimaHoja ? buildLabelDataFromRecord(ultimaHoja, dateMode) : null),
    [ultimaHoja, dateMode]
  );

  const proximaSugerida = useMemo(() => {
    if (!ultimaHoja?.fecha) return null;
    const next = calcularSiguienteFecha(ultimaHoja.fecha, ultimaHoja.frecuenciaCalibracion || "");
    if (next) return formatLabelDate(next, dateMode);
    try {
      const d = parseISO(ultimaHoja.fecha);
      if (isValid(d)) return formatLabelDate(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()), dateMode);
    } catch { /* ignore */ }
    return null;
  }, [ultimaHoja, dateMode]);

  return (
    <div className="min-h-full flex-shrink-0 bg-slate-50 flex flex-col">
      {pdfToView && <PdfViewerModal pdfUrl={pdfToView} onClose={() => setPdfToView(null)} />}

      {/* HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white px-5 sm:px-6 py-6 shadow-lg flex-shrink-0">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 bottom-0 w-40 h-40 rounded-full bg-cyan-400/10 blur-2xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigateTo('equipos-empresa')}
              className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200/90 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Historial de vida
              </p>
              <h1 className="text-2xl font-bold flex items-center gap-2 truncate">
                <Hash className="w-6 h-6 text-blue-300 shrink-0" />
                <span className="truncate">{idEquipo}</span>
              </h1>
              <p className="text-sm text-slate-300 font-medium flex items-center gap-1.5 mt-1 truncate">
                <Building2 className="w-4 h-4 opacity-70 shrink-0" />
                <span className="truncate">{nombreEmpresa}</span>
              </p>
            </div>
          </div>

          {/* Imprimir etiqueta de la última calibración — sin entrar a editar */}
          {labelUltima && (
            <div className="sm:self-center">
              <LabelPrinterButton data={labelUltima} logo={logoAg} />
            </div>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

        {/* PANEL IZQUIERDO: FICHA + RESUMEN */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-4">
          <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
            <div className="h-14 bg-gradient-to-r from-blue-50 to-slate-50 border-b border-slate-100 flex items-center px-5">
              <h2 className="font-bold text-blue-900 flex items-center gap-2 text-sm">
                <Tag className="w-4 h-4" /> Ficha técnica
              </h2>
            </div>

            <div className="p-5">
              {infoGeneral ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Equipo</span>
                    <span className="font-bold text-slate-800 text-base leading-snug">{infoGeneral.equipo || "—"}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Marca</span>
                      <span className="font-semibold text-slate-700 text-sm">{infoGeneral.marca || "—"}</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Modelo</span>
                      <span className="font-semibold text-slate-700 text-sm">{infoGeneral.modelo || "—"}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Número de serie</span>
                    <span className="font-mono font-semibold text-slate-700 text-sm">{infoGeneral.numeroSerie || "—"}</span>
                  </div>

                  {infoGeneral.magnitud && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-1">Magnitud</span>
                      <span className="font-semibold text-slate-700 text-sm">{infoGeneral.magnitud}</span>
                    </div>
                  )}
                </div>
              ) : loading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Sin datos de ficha</p>
              )}
            </div>
          </div>

          {/* Resumen de vida / última etiqueta */}
          {ultimaHoja && (
            <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
              <div className="h-14 bg-gradient-to-r from-emerald-50 to-slate-50 border-b border-slate-100 flex items-center px-5">
                <h2 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                  <Printer className="w-4 h-4" /> Última etiqueta
                </h2>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Última cal.</span>
                  <span className="text-sm font-semibold text-slate-800">{formatFechaCorta(ultimaHoja.fecha)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Certificado</span>
                  <span className="text-sm font-mono font-semibold text-slate-800">{ultimaHoja.certificado || "—"}</span>
                </div>
                {proximaSugerida && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Próx. sugerida</span>
                    <span className="text-sm font-semibold text-blue-700">{proximaSugerida}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Calibraciones</span>
                  <span className="text-lg font-bold text-blue-700">{historial.length}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                  Imprime la etiqueta de la calibración más reciente desde el botón del encabezado, sin abrir la hoja de trabajo.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* PANEL DERECHO: TIMELINE */}
        <div className="lg:col-span-8">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-5 h-5 text-slate-400" />
            <h2 className="font-bold text-slate-800 text-lg">Línea de vida</h2>
            {!loading && historial.length > 0 && (
              <span className="text-xs font-medium text-slate-400 ml-1">
                ({historial.length} evento{historial.length === 1 ? "" : "s"})
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-700" /></div>
          ) : historial.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No hay registros para este equipo</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-3 sm:ml-4 pl-6 sm:pl-8 pb-10 space-y-6">
              {historial.map((hoja, index) => {
                const esUltimo = index === 0;
                const hojaAnterior = historial[index + 1];
                const freqActual = hoja.frecuenciaCalibracion?.trim().toLowerCase();
                const freqAnterior = hojaAnterior?.frecuenciaCalibracion?.trim().toLowerCase();
                const cambioFrecuenciaDetectado =
                  freqAnterior &&
                  freqActual &&
                  freqActual !== freqAnterior;
                const labelData = buildLabelDataFromRecord(hoja, dateMode);
                const esRechazado = labelData.labelType === "rechazado";

                return (
                  <div key={hoja.idDoc} className="relative">
                    <div
                      className={`absolute -left-[31px] sm:-left-[41px] top-5 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-4 border-slate-50 flex items-center justify-center ${
                        esUltimo
                          ? 'bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.2)]'
                          : 'bg-slate-300'
                      }`}
                    />

                    <div
                      className={`bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow ${
                        esUltimo ? 'border-blue-300' : 'border-slate-200'
                      }`}
                    >
                      <div
                        className={`px-4 sm:px-5 py-3 border-b flex flex-wrap gap-2 justify-between items-center ${
                          esUltimo ? 'bg-blue-50/60 border-blue-100' : 'bg-slate-50 border-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Calendar className={`w-4 h-4 ${esUltimo ? 'text-blue-700' : 'text-slate-400'}`} />
                          <span className={`font-bold ${esUltimo ? 'text-slate-900' : 'text-slate-700'}`}>
                            {formatFechaCorta(hoja.fecha)}
                          </span>
                          {esUltimo && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-blue-600 text-white">
                              Vigente
                            </span>
                          )}
                          {esRechazado && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                              Rechazado
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                            esUltimo
                              ? 'bg-white text-blue-900 border-blue-200 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          Cert: {hoja.certificado}
                        </span>
                      </div>

                      <div className="p-4 sm:p-5 flex flex-col gap-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-slate-500">
                                  {hoja.nombre?.charAt(0) || "T"}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-700 truncate">{hoja.nombre || "Sin técnico"}</p>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                              <p className="flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                {hoja.status_equipo || "Completado"}
                              </p>
                              {hoja.frecuenciaCalibracion && (
                                <p>Freq: {hoja.frecuenciaCalibracion}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap w-full md:w-auto items-center gap-2">
                            <LabelPrinterButton
                              data={labelData}
                              logo={logoAg}
                              compact
                              prepareOnMount={false}
                              className="!items-stretch"
                            />

                            {hoja.pdfURL ? (
                              <button
                                type="button"
                                onClick={() => setPdfToView(hoja.pdfURL)}
                                className="flex items-center justify-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-600 hover:text-white font-semibold text-sm transition-all"
                              >
                                <FileText className="w-4 h-4" /> PDF
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => editarHoja(hoja.idDoc)}
                              className="flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-semibold text-sm transition-all"
                            >
                              <Edit className="w-4 h-4" /> Editar
                            </button>
                          </div>
                        </div>

                        {cambioFrecuenciaDetectado && (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-amber-900">Cambio de frecuencia detectado</p>
                              <p className="text-xs text-amber-800 mt-0.5">
                                De <strong className="font-bold bg-amber-100 px-1 rounded">{hojaAnterior.frecuenciaCalibracion}</strong>
                                {" "}a{" "}
                                <strong className="font-bold bg-amber-100 px-1 rounded">{hoja.frecuenciaCalibracion}</strong>
                                {" "}en esta fecha.
                              </p>
                              {(hoja.notas || hoja.observaciones || hoja.comentarios) && (
                                <div className="mt-3 text-xs text-amber-900 bg-amber-100/50 p-3 rounded-lg flex items-start gap-2 border border-amber-100">
                                  <MessageSquare className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
                                  <div>
                                    <strong className="block mb-0.5 text-amber-700">Notas del técnico:</strong>
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
