import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Mail,
  Download,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  Minimize2,
  RefreshCw,
  Bell,
  Loader2,
  Send,
  Filter,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import toast, { Toaster } from 'react-hot-toast';
import { doc, onSnapshot } from 'firebase/firestore';

import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import labLogo from '../assets/lab_logo.png';
import { db } from '../utils/firebase';
import {
  cargarEquiposVencimiento,
  type EquipoVencimiento,
  type VencimientoStatus,
  STATUS_LABELS,
} from '../utils/vencimientosData';
import { enviarAlertaVencimiento } from '../utils/notificacionesVencimientos';

// ─── Estilos por estado ───────────────────────────────────────────────────────

const STATUS_STYLES: Record<
  VencimientoStatus,
  { badge: string; dot: string; icon: typeof AlertTriangle }
> = {
  vencido: {
    badge: 'bg-red-500/15 text-red-700 border-red-200',
    dot: 'bg-red-500',
    icon: AlertTriangle,
  },
  critico: {
    badge: 'bg-orange-500/15 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    icon: Clock,
  },
  proximo: {
    badge: 'bg-amber-500/15 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    icon: Clock,
  },
  vigente: {
    badge: 'bg-emerald-500/15 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
};

function StatusBadge({ status }: { status: VencimientoStatus }) {
  const cfg = STATUS_STYLES[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${cfg.badge}`}
    >
      <Icon size={13} />
      {STATUS_LABELS[status]}
    </span>
  );
}

function KpiCard({
  label,
  value,
  active,
  onClick,
  accent,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  accent: 'red' | 'orange' | 'amber' | 'slate';
}) {
  const accents = {
    red: 'from-red-500/20 to-red-600/5 border-red-300/50 ring-red-400/40',
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-300/50 ring-orange-400/40',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-300/50 ring-amber-400/40',
    slate: 'from-slate-500/10 to-slate-600/5 border-slate-200 ring-slate-300/40',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-2xl border bg-gradient-to-br transition-all shadow-sm hover:shadow-md ${
        accents[accent]
      } ${active ? 'ring-2 scale-[1.02]' : 'opacity-90 hover:opacity-100'}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">{value}</p>
    </button>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export const VencimientosScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user } = useAuth();

  const [equipos, setEquipos] = useState<EquipoVencimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('accion');
  const [clientesExpandidos, setClientesExpandidos] = useState<Record<string, boolean>>({});
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [watchingAlertId, setWatchingAlertId] = useState<string | null>(null);

  const watchAlerta = useCallback((alertId: string) => {
    setWatchingAlertId(alertId);
    const ref = doc(db, 'alertasVencimiento', alertId);

    const toastId = toast.loading('Enviando correo (verificando estado)...');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const estado = String(data?.estado || '');
        const err = data?.error ? String(data.error) : '';

        if (estado === 'enviado') {
          toast.success('Correo enviado.', { id: toastId });
          setWatchingAlertId(null);
          unsub();
          return;
        }

        if (estado === 'error') {
          const friendly = err.includes('Correo no configurado')
            ? 'El servidor aún no tiene Gmail configurado. En la PC del proyecto ejecute: cd functions && .\\setup-gmail.ps1 (o vea functions/EMAIL_SETUP.md).'
            : err.includes('535') ||
                err.includes('BadCredentials') ||
                err.includes('contraseña de aplicación')
              ? 'Gmail rechazó la contraseña. Genere una contraseña de aplicación nueva en Google y ejecute functions/setup-gmail.ps1, luego vuelva a Notificar.'
              : err || 'Falló el envío del correo.';
          toast.error(friendly, { id: toastId, duration: 8000 });
          setWatchingAlertId(null);
          unsub();
          return;
        }

        // sigue pendiente
        toast.loading('En cola… esperando a Cloud Functions', { id: toastId });
      },
      (e) => {
        toast.error(`No se pudo leer el estado de envío: ${String(e)}`, { id: toastId });
        setWatchingAlertId(null);
        unsub();
      }
    );

    // Hard-timeout: evita dejar un listener vivo si Functions no procesa
    window.setTimeout(() => {
      try {
        unsub();
      } catch {}
      setWatchingAlertId((current) => (current === alertId ? null : current));
      toast.dismiss(toastId);
      toast('Alerta encolada. Si no cambia a “enviado”, revisa Cloud Functions.', { icon: 'ℹ️' });
    }, 25000);
  }, []);

  const cargar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await cargarEquiposVencimiento();
      setEquipos(data);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo cargar el monitor de vencimientos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const stats = useMemo(
    () => ({
      vencido: equipos.filter((e) => e.status === 'vencido').length,
      critico: equipos.filter((e) => e.status === 'critico').length,
      proximo: equipos.filter((e) => e.status === 'proximo').length,
      vigente: equipos.filter((e) => e.status === 'vigente').length,
      accion: equipos.filter((e) => e.status !== 'vigente').length,
    }),
    [equipos]
  );

  const equiposFiltrados = useMemo(() => {
    return equipos.filter((item) => {
      const termino = busqueda.toLowerCase();
      const matchTexto =
        !termino ||
        item.cliente.toLowerCase().includes(termino) ||
        item.descripcion.toLowerCase().includes(termino) ||
        item.equipoId.toLowerCase().includes(termino);

      const matchEstado =
        filtroEstado === 'todos'
          ? true
          : filtroEstado === 'accion'
            ? item.status !== 'vigente'
            : item.status === filtroEstado;

      return matchTexto && matchEstado;
    });
  }, [equipos, busqueda, filtroEstado]);

  const equiposAgrupados = useMemo(() => {
    const grupos: Record<string, EquipoVencimiento[]> = {};
    equiposFiltrados.forEach((item) => {
      if (!grupos[item.cliente]) grupos[item.cliente] = [];
      grupos[item.cliente].push(item);
    });
    return Object.keys(grupos)
      .sort()
      .reduce(
        (obj, key) => {
          obj[key] = grupos[key].sort((a, b) => a.diasRestantes - b.diasRestantes);
          return obj;
        },
        {} as Record<string, EquipoVencimiento[]>
      );
  }, [equiposFiltrados]);

  const equiposA60Dias = useMemo(
    () => equipos.filter((e) => e.diasRestantes >= 50 && e.diasRestantes <= 65),
    [equipos]
  );

  const toggleCliente = (cliente: string) => {
    setClientesExpandidos((prev) => ({ ...prev, [cliente]: !prev[cliente] }));
  };

  const expandirTodos = () => {
    const nuevo: Record<string, boolean> = {};
    Object.keys(equiposAgrupados).forEach((c) => {
      nuevo[c] = true;
    });
    setClientesExpandidos(nuevo);
  };

  const colapsarTodos = () => setClientesExpandidos({});

  const notificarEquipo = async (equipo: EquipoVencimiento) => {
    if (!equipo.emailResponsable) {
      toast.error('Sin correo del responsable. Revisa usuarios y asignación del cliente.');
      return;
    }
    const key = `eq_${equipo.id}`;
    setEnviandoId(key);
    try {
      const alertId = await enviarAlertaVencimiento({
        tipo: 'individual',
        cliente: equipo.cliente,
        equipos: [equipo],
        destinatarioEmail: equipo.emailResponsable,
        destinatarioNombre: equipo.responsableInterno || 'Responsable',
        destinatarioUid: equipo.responsableUid,
        autorNombre: user?.name,
        autorUid: user?.id,
      });
      toast.success('Alerta encolada. Verificando envío...');
      watchAlerta(alertId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar la alerta.');
    } finally {
      setEnviandoId(null);
    }
  };

  const notificarCliente = async (cliente: string, items: EquipoVencimiento[]) => {
    const alertas = items.filter((i) => i.status !== 'vigente');
    const email = alertas[0]?.emailResponsable || items[0]?.emailResponsable;
    const uid = alertas[0]?.responsableUid || items[0]?.responsableUid;
    const nombre = alertas[0]?.responsableInterno || items[0]?.responsableInterno;

    if (!email) {
      toast.error('Este cliente no tiene responsable con correo en el sistema.');
      return;
    }
    if (alertas.length === 0) {
      toast('No hay equipos en alerta para este cliente.', { icon: 'ℹ️' });
      return;
    }

    const key = `cli_${cliente}`;
    setEnviandoId(key);
    try {
      const alertId = await enviarAlertaVencimiento({
        tipo: 'cliente',
        cliente,
        equipos: alertas,
        destinatarioEmail: email,
        destinatarioNombre: nombre || 'Responsable',
        destinatarioUid: uid,
        autorNombre: user?.name,
        autorUid: user?.id,
      });
      toast.success('Reporte encolado. Verificando envío...');
      watchAlerta(alertId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar el reporte.');
    } finally {
      setEnviandoId(null);
    }
  };

  const exportarExcel = () => {
    const dataExportar = equiposFiltrados.map((e) => ({
      Cliente: e.cliente,
      Responsable: e.responsableInterno,
      Email: e.emailResponsable || '',
      Equipo: e.descripcion,
      ID: e.equipoId,
      'Fecha Calibración': e.fechaCalibracion
        ? format(parseISO(e.fechaCalibracion), 'yyyy-MM-dd')
        : '',
      Vencimiento: format(e.fechaVencimiento, 'yyyy-MM-dd'),
      'Días Restantes': e.diasRestantes,
      Estado: STATUS_LABELS[e.status],
    }));
    const ws = XLSX.utils.json_to_sheet(dataExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vencimientos');
    XLSX.writeFile(wb, `Reporte_Vencimientos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Excel descargado');
  };

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-gradient-to-b from-slate-100 via-slate-50 to-white font-sans text-slate-800 pb-16">
      <Toaster
        position="top-center"
        toastOptions={{ duration: 3500, style: { borderRadius: 12, fontSize: 13, fontWeight: 600 } }}
      />

      <header className="bg-gradient-to-r from-[#2464A3] via-[#2a70b4] to-[#1d5082] border-b border-[#1a5085]/40 sticky top-0 z-20 shadow-[0_4px_24px_rgba(29,80,130,0.35)]">
        <div className="max-w-7xl mx-auto px-4 h-[4.25rem] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigateTo('menu')}
              className="p-2 hover:bg-white/15 rounded-full text-white/90 transition-all shrink-0"
              aria-label="Volver al menú"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-white/95 shadow-lg p-1.5 shrink-0">
              <img src={labLogo} alt="AG" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/75 truncate">
                Equipos y Servicios AG
              </p>
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Calendar className="w-5 h-5 shrink-0 opacity-90" />
                Monitor de Vencimientos
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void cargar(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-white/15 text-white hover:bg-white/25 transition disabled:opacity-60"
              title="Actualizar datos"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={exportarExcel}
              className="flex items-center gap-1.5 bg-white text-[#1d5082] px-3 py-2 rounded-xl hover:bg-slate-50 text-sm font-bold shadow-md transition"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 w-full">
        <p className="text-xs text-slate-500 mb-5 flex items-center gap-2">
          <Bell size={14} className="text-[#2464A3]" />
          Última calibración por equipo. Las alertas envían <strong>correo automático</strong> y notificación en la app.
        </p>

        {equiposA60Dias.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 flex gap-3 shadow-sm"
          >
            <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700 h-fit">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="font-bold text-amber-900">Ventana de calidad (60 días)</h3>
              <p className="text-sm text-amber-800 mt-0.5">
                {equiposA60Dias.length} equipo(s) entran en rango de seguimiento preventivo.
              </p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KpiCard
            label="Requieren acción"
            value={stats.accion}
            active={filtroEstado === 'accion'}
            onClick={() => setFiltroEstado(filtroEstado === 'accion' ? 'todos' : 'accion')}
            accent="slate"
          />
          <KpiCard
            label="Vencidos"
            value={stats.vencido}
            active={filtroEstado === 'vencido'}
            onClick={() => setFiltroEstado(filtroEstado === 'vencido' ? 'todos' : 'vencido')}
            accent="red"
          />
          <KpiCard
            label="Críticos ≤30d"
            value={stats.critico}
            active={filtroEstado === 'critico'}
            onClick={() => setFiltroEstado(filtroEstado === 'critico' ? 'todos' : 'critico')}
            accent="orange"
          />
          <KpiCard
            label="Próximos"
            value={stats.proximo}
            active={filtroEstado === 'proximo'}
            onClick={() => setFiltroEstado(filtroEstado === 'proximo' ? 'todos' : 'proximo')}
            accent="amber"
          />
          <KpiCard
            label="Vigentes"
            value={stats.vigente}
            active={filtroEstado === 'vigente'}
            onClick={() => setFiltroEstado(filtroEstado === 'vigente' ? 'todos' : 'vigente')}
            accent="slate"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-6 bg-white/95 backdrop-blur-sm p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="search"
              placeholder="Buscar cliente, equipo o ID..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#2464A3]/30 focus:border-[#2464A3] outline-none"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400 shrink-0" />
            <select
              className="flex-1 md:w-48 p-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-[#2464A3]/30 outline-none"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="accion">Requieren acción</option>
              <option value="todos">Todos</option>
              <option value="vencido">Vencidos</option>
              <option value="critico">Críticos (≤30 días)</option>
              <option value="proximo">Próximos (30-60 días)</option>
              <option value="vigente">Vigentes</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
          <h2 className="text-base font-bold text-slate-700">
            {equiposFiltrados.length} equipos · {Object.keys(equiposAgrupados).length} clientes
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={expandirTodos}
              className="text-xs flex items-center gap-1 text-[#2464A3] hover:bg-blue-50 px-3 py-1.5 rounded-lg font-semibold border border-transparent hover:border-blue-100"
            >
              <Layers size={14} /> Expandir
            </button>
            <button
              type="button"
              onClick={colapsarTodos}
              className="text-xs flex items-center gap-1 text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg font-semibold"
            >
              <Minimize2 size={14} /> Colapsar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <Loader2 size={36} className="animate-spin text-[#2464A3] mb-3" />
            <p className="text-sm font-medium">Cargando calibraciones y responsables...</p>
          </div>
        ) : Object.keys(equiposAgrupados).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <CheckCircle2 size={40} className="text-emerald-400 mb-3" />
            <p className="font-semibold">Sin resultados con estos filtros</p>
            <p className="text-sm mt-1">Prueba otro filtro o limpia la búsqueda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {Object.entries(equiposAgrupados).map(([cliente, itemsCliente]) => {
                const isExpanded = clientesExpandidos[cliente];
                const countVencidos = itemsCliente.filter((i) => i.status === 'vencido').length;
                const countCriticos = itemsCliente.filter((i) => i.status === 'critico').length;
                const hasAlerts = countVencidos > 0 || countCriticos > 0;
                const equiposAlerta = itemsCliente.filter((i) => i.status !== 'vigente');
                const emailGrupo = itemsCliente[0]?.emailResponsable;
                const responsable = itemsCliente[0]?.responsableInterno;
                const enviandoCliente = enviandoId === `cli_${cliente}`;

                return (
                  <motion.div
                    key={cliente}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
                      hasAlerts ? 'border-l-4 border-l-red-500 border-slate-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => toggleCliente(cliente)}
                        className="flex-1 flex items-center justify-between p-4 hover:bg-slate-50/80 transition text-left min-w-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-2.5 rounded-xl shrink-0 ${
                              hasAlerts ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#2464A3]'
                            }`}
                          >
                            <Building2 size={20} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 truncate">{cliente}</h3>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {responsable && responsable !== 'Sin asignar' && (
                                <span className="text-[10px] font-bold uppercase bg-violet-100 text-violet-800 px-2 py-0.5 rounded-md">
                                  {responsable}
                                </span>
                              )}
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                                {itemsCliente.length} equipos
                              </span>
                              {countVencidos > 0 && (
                                <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-md font-bold">
                                  {countVencidos} vencidos
                                </span>
                              )}
                              {countCriticos > 0 && (
                                <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded-md font-bold">
                                  {countCriticos} críticos
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-slate-400 shrink-0 ml-2">
                          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                      </button>

                      {equiposAlerta.length > 0 && (
                        <button
                          type="button"
                          disabled={!emailGrupo || enviandoCliente}
                          onClick={() => void notificarCliente(cliente, itemsCliente)}
                          className={`shrink-0 flex flex-col items-center justify-center gap-1 px-4 border-l transition min-w-[5.5rem] ${
                            emailGrupo
                              ? 'bg-gradient-to-b from-red-50 to-orange-50 text-red-800 hover:from-red-100 hover:to-orange-100 border-red-100'
                              : 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-100'
                          }`}
                          title={
                            emailGrupo
                              ? `Enviar correo y push (${equiposAlerta.length} equipos)`
                              : 'Sin correo de responsable'
                          }
                        >
                          {enviandoCliente ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Send size={18} />
                          )}
                          <span className="text-[9px] font-bold uppercase leading-tight text-center">
                            Notificar
                            <br />
                            ({equiposAlerta.length})
                          </span>
                        </button>
                      )}
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-100 overflow-hidden"
                        >
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                                  <th className="px-4 py-3 text-left font-semibold">Equipo</th>
                                  <th className="px-4 py-3 text-left font-semibold">Vencimiento</th>
                                  <th className="px-4 py-3 text-center font-semibold w-24">Aviso</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {itemsCliente.map((item) => {
                                  const enviandoEq = enviandoId === `eq_${item.id}`;
                                  const puedeNotificar =
                                    item.status !== 'vigente' && !!item.emailResponsable;
                                  return (
                                    <tr
                                      key={item.id}
                                      className="hover:bg-blue-50/40 transition-colors"
                                    >
                                      <td className="px-4 py-3">
                                        <StatusBadge status={item.status} />
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-900">
                                          {item.descripcion}
                                        </div>
                                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block">
                                          {item.equipoId}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="text-xs text-slate-500">
                                          Calib.{' '}
                                          {item.fechaCalibracion
                                            ? format(parseISO(item.fechaCalibracion), 'dd MMM yy', {
                                                locale: es,
                                              })
                                            : '—'}
                                        </div>
                                        <div
                                          className={`font-bold text-sm mt-0.5 ${
                                            item.diasRestantes < 0 ? 'text-red-600' : 'text-slate-800'
                                          }`}
                                        >
                                          {format(item.fechaVencimiento, 'dd MMM yyyy', { locale: es })}
                                        </div>
                                        <div
                                          className={`text-xs font-medium mt-0.5 ${
                                            item.diasRestantes < 0
                                              ? 'text-red-500'
                                              : item.diasRestantes <= 30
                                                ? 'text-orange-600'
                                                : 'text-emerald-600'
                                          }`}
                                        >
                                          {item.diasRestantes < 0
                                            ? `Vencido hace ${Math.abs(item.diasRestantes)} días`
                                            : `${item.diasRestantes} días restantes`}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <button
                                          type="button"
                                          disabled={!puedeNotificar || enviandoEq}
                                          onClick={() => void notificarEquipo(item)}
                                          className={`inline-flex items-center justify-center p-2.5 rounded-xl border transition ${
                                            puedeNotificar
                                              ? 'text-[#2464A3] bg-blue-50 hover:bg-blue-100 border-blue-200'
                                              : 'text-slate-300 bg-slate-50 border-slate-100 cursor-not-allowed'
                                          }`}
                                          title={
                                            item.emailResponsable
                                              ? `Enviar a ${item.responsableInterno}`
                                              : item.status === 'vigente'
                                                ? 'Equipo vigente'
                                                : 'Sin correo asignado'
                                          }
                                        >
                                          {enviandoEq ? (
                                            <Loader2 size={18} className="animate-spin" />
                                          ) : (
                                            <Mail size={18} />
                                          )}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
};

export default VencimientosScreen;
