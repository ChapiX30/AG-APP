import React, { useState, useEffect, useMemo } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAppDialog } from '../hooks/useAppDialog';
import { db } from '../utils/firebase';
import {
  collection, query, orderBy, limit, doc,
  getDoc, writeBatch, runTransaction, onSnapshot,
  type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import {
  ArrowLeft, Search, Printer, Loader2,
  CheckCircle2, AlertTriangle, ChevronRight,
  Hash, ArrowRightLeft, FileSignature, Building2, Package, ShieldCheck
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';
import { generateEntradaSalidaPdf, uploadHojaSalidaToDrive } from '../utils/entradaSalidaPdf';
import { useAuth } from '../hooks/useAuth';

interface ItemEquipo {
  id: string;
  descripcion: string;
  marca: string;
  modelo: string;
  serie: string;
  idInterno: string;
  certificado: string;
  cliente: string;
  ordenCompra: string;
}

type ComparacionEstado = 'vacio' | 'parcial' | 'completa';

/** Solo sale si ya tiene folio de certificado (hoja de trabajo hecha). */
function tieneCertificado(item: ItemEquipo): boolean {
  const cert = String(item.certificado || '').trim();
  if (!cert) return false;
  if (/^pendiente$/i.test(cert)) return false;
  if (/^s\/?n$/i.test(cert) || /^n\/?a$/i.test(cert) || cert === '-' || cert === '—') return false;
  return true;
}

function evaluarComparacion(
  entrada: ItemEquipo[],
  salidaIds: Set<string>
): {
  estado: ComparacionEstado;
  pendientes: ItemEquipo[];
  salidaCount: number;
  puedeConfirmar: boolean;
} {
  if (entrada.length === 0) {
    return { estado: 'vacio', pendientes: [], salidaCount: 0, puedeConfirmar: false };
  }

  const pendientes = entrada.filter((item) => !salidaIds.has(item.id));
  const salidaCount = entrada.length - pendientes.length;

  if (salidaCount === 0) {
    return { estado: 'vacio', pendientes: entrada, salidaCount: 0, puedeConfirmar: false };
  }

  if (pendientes.length === 0) {
    return { estado: 'completa', pendientes: [], salidaCount, puedeConfirmar: true };
  }

  return { estado: 'parcial', pendientes, salidaCount, puedeConfirmar: true };
}

function mapHojasToItem(d: QueryDocumentSnapshot<DocumentData>): ItemEquipo | null {
  const data = d.data();
  const rawTipo =
    data.tipoServicio || data.TipoServicio || data.servicio ||
    data.tipo || data.lugar || data.ubicacion ||
    data.laboratorio || data.lugarCalibracion || 'Laboratorio';

  const tipoStr = String(rawTipo).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const esSitio =
    tipoStr.includes('sitio') || tipoStr.includes('planta') ||
    tipoStr.includes('site') || tipoStr.includes('externo') ||
    tipoStr.includes('fuera');

  if (esSitio || data.entregado === true) return null;

  return {
    id: d.id,
    descripcion: data.equipo || data.nombre || data.instrumento || data.descripcion || 'Sin nombre',
    marca: data.marca || 'S/M',
    modelo: data.modelo || 'S/M',
    serie: data.serie || data.Serie || data.noSerie || data.serial || 'S/N',
    idInterno: data.ID || data.id || data.Id || data.idInterno || data.identificacion || 'S/ID',
    certificado: data.certificado || data.folioCertificado || 'Pendiente',
    cliente: (data.cliente || data.empresa || 'Sin cliente').trim(),
    ordenCompra: data.ordenCompra || data.oc || '',
  };
}

function etiquetaEquipos(n: number, sufijo = ''): string {
  const base = n === 1 ? '1 equipo' : `${n} equipos`;
  return sufijo ? `${base} ${sufijo}` : base;
}

const CampoEquipo: React.FC<{ etiqueta: string; valor: string }> = ({ etiqueta, valor }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{etiqueta}</p>
    <p className="text-sm font-semibold text-slate-800 truncate">{valor || '—'}</p>
  </div>
);

export const EntradaSalidaScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { confirm, alert: showAlert } = useAppDialog();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<ItemEquipo[]>([]);
  const [search, setSearch] = useState('');
  const [clienteActivo, setClienteActivo] = useState<string | null>(null);
  const [salidaIds, setSalidaIds] = useState<Set<string>>(new Set());
  const [customFolio, setCustomFolio] = useState('');
  const [nextFolioDB, setNextFolioDB] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'hojasDeTrabajo'), orderBy('fecha', 'desc'), limit(300));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista: ItemEquipo[] = [];
        snap.forEach((d) => {
          const item = mapHojasToItem(d);
          if (item) lista.push(item);
        });
        setItems(lista);
        setLoading(false);
      },
      (error) => {
        console.error('Error cargando equipos:', error);
        setLoading(false);
      }
    );
    fetchNextFolio();
    return () => unsub();
  }, []);

  useEffect(() => {
    setSalidaIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(items.map((item) => item.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const fetchNextFolio = async () => {
    try {
      const docRef = doc(db, 'consecutivos', 'hojasSalida');
      const docSnap = await getDoc(docRef);
      const count = docSnap.exists() ? docSnap.data().count + 1 : 1;
      setNextFolioDB(count);
      setCustomFolio(`HSE-${String(count).padStart(4, '0')}`);
    } catch {
      setCustomFolio('HSE-0001');
    }
  };

  const clientesDisponibles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtrados = needle
      ? items.filter((item) =>
          item.cliente.toLowerCase().includes(needle) ||
          item.descripcion.toLowerCase().includes(needle) ||
          item.serie.toLowerCase().includes(needle) ||
          item.idInterno.toLowerCase().includes(needle)
        )
      : items;
    const grupos: Record<string, ItemEquipo[]> = {};
    filtrados.forEach((item) => {
      if (!grupos[item.cliente]) grupos[item.cliente] = [];
      grupos[item.cliente].push(item);
    });
    return grupos;
  }, [items, search]);

  const clientesOrdenados = useMemo(
    () =>
      Object.entries(clientesDisponibles).sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length;
        return a[0].localeCompare(b[0], 'es');
      }),
    [clientesDisponibles]
  );

  const entradaCliente = useMemo(() => {
    if (!clienteActivo) return [];
    return items.filter((item) => item.cliente === clienteActivo);
  }, [items, clienteActivo]);

  const salidaCliente = useMemo(
    () => entradaCliente.filter((item) => salidaIds.has(item.id)),
    [entradaCliente, salidaIds]
  );

  const sinCertificadoCliente = useMemo(
    () => entradaCliente.filter((item) => !tieneCertificado(item)),
    [entradaCliente]
  );

  const aptosParaSalida = useMemo(
    () => entradaCliente.filter((item) => tieneCertificado(item)),
    [entradaCliente]
  );

  const comparacion = useMemo(
    () => evaluarComparacion(entradaCliente, salidaIds),
    [entradaCliente, salidaIds]
  );

  const abrirCliente = (cliente: string) => {
    setClienteActivo(cliente);
    setSalidaIds(new Set());
  };

  const volverAClientes = () => {
    setClienteActivo(null);
    setSalidaIds(new Set());
  };

  const toggleSalida = async (item: ItemEquipo) => {
    if (!tieneCertificado(item)) {
      await showAlert({
        title: 'Sin certificado',
        message: `No se puede dar salida a "${item.descripcion}" (Serie ${item.serie}).\n\nFalta certificado / hoja de trabajo. Genera el consecutivo y completa la hoja antes de enviarlo.`,
        variant: 'danger',
      });
      return;
    }
    setSalidaIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const marcarTodosSalida = async () => {
    if (aptosParaSalida.length === 0) {
      await showAlert({
        title: 'Sin certificado',
        message: 'Ningún equipo de este cliente tiene certificado. Completa las hojas de trabajo antes de dar salida.',
        variant: 'danger',
      });
      return;
    }
    setSalidaIds(new Set(aptosParaSalida.map((item) => item.id)));
    if (sinCertificadoCliente.length > 0) {
      await showAlert({
        title: 'Aviso',
        message: `Se marcaron ${aptosParaSalida.length} con certificado.\n${sinCertificadoCliente.length} quedaron fuera por no tener certificado/hoja de trabajo.`,
      });
    }
  };

  const limpiarSalida = () => {
    setSalidaIds(new Set());
  };

  const handleConfirmarSalida = async () => {
    if (!clienteActivo) return;
    if (!comparacion.puedeConfirmar || salidaCliente.length === 0) {
      await showAlert({ title: 'Aviso', message: 'Selecciona al menos un equipo en la columna SALIDA.' });
      return;
    }

    const bloqueados = salidaCliente.filter((item) => !tieneCertificado(item));
    if (bloqueados.length > 0) {
      await showAlert({
        title: 'Salida bloqueada',
        message: `${bloqueados.length} equipo(s) sin certificado/hoja de trabajo. Quítalos de la salida o completa su certificado antes de continuar.`,
        variant: 'danger',
      });
      setSalidaIds((prev) => {
        const next = new Set(prev);
        bloqueados.forEach((item) => next.delete(item.id));
        return next;
      });
      return;
    }

    if (!customFolio.trim()) {
      await showAlert({ title: 'Aviso', message: 'Escribe un folio válido.' });
      return;
    }

    const esCompleta = comparacion.estado === 'completa';
    const msgParcial = esCompleta
      ? 'Salida completa: todos los equipos del cliente.'
      : `Salida parcial: ${salidaCliente.length} de ${entradaCliente.length} equipos.\nQuedan ${comparacion.pendientes.length} en laboratorio.`;

    const confirmacion = await confirm({
      message: `CONFIRMAR SALIDA\n\nFolio: ${customFolio}\nCliente: ${clienteActivo}\nEquipos en esta salida: ${salidaCliente.length}\n\n${msgParcial}\n\n¿Generar PDF y registrar?`,
    });
    if (!confirmacion) return;

    setProcessing(true);
    try {
      const { blob } = await generateEntradaSalidaPdf({
        items: salidaCliente,
        folio: customFolio,
        esParcial: !esCompleta,
      });

      let driveOk = true;
      try {
        const today = new Date();
        const workDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await uploadHojaSalidaToDrive({
          blob,
          folio: customFolio,
          uploadedBy: user?.name || 'Sistema',
          workDate,
        });
      } catch (driveErr) {
        console.error('[HojaSalida] No se pudo guardar en Drive:', driveErr);
        driveOk = false;
      }

      const obsSalida = esCompleta
        ? 'Salida completa'
        : `Salida parcial (${salidaCliente.length}/${entradaCliente.length})`;

      const batch = writeBatch(db);
      salidaCliente.forEach((item) => {
        const ref = doc(db, 'hojasDeTrabajo', item.id);
        batch.update(ref, {
          entregado: true,
          folioSalida: customFolio,
          fechaSalida: new Date().toISOString(),
          observacionesSalida: obsSalida,
        });
      });

      const numeroFolioUsuario = parseInt(customFolio.replace(/\D/g, ''), 10);
      if (!isNaN(numeroFolioUsuario) && numeroFolioUsuario >= nextFolioDB) {
        const folioRef = doc(db, 'consecutivos', 'hojasSalida');
        await runTransaction(db, async (transaction) => {
          const sfDoc = await transaction.get(folioRef);
          if (!sfDoc.exists()) transaction.set(folioRef, { count: numeroFolioUsuario });
          else if (numeroFolioUsuario >= sfDoc.data().count) {
            transaction.update(folioRef, { count: numeroFolioUsuario });
          }
        });
      }

      await batch.commit();
      const okMsg = esCompleta ? 'Salida completa registrada.' : `Salida parcial registrada (${salidaCliente.length} equipos).`;
      const driveMsg = driveOk
        ? '\n\nEl PDF se guardó en Drive → Hojas de Salida.'
        : '\n\nEl PDF se descargó, pero no se pudo guardar en Drive.';
      await showAlert({ title: 'Aviso', message: okMsg + driveMsg });
      volverAClientes();
      fetchNextFolio();
    } catch (error) {
      console.error(error);
      await showAlert({ title: 'Error', message: 'Error al registrar salida.', variant: 'danger' });
    } finally {
      setProcessing(false);
    }
  };

  const renderTarjetaEquipo = (item: ItemEquipo, lado: 'entrada' | 'salida') => {
    const enSalida = salidaIds.has(item.id);
    const listo = tieneCertificado(item);

    const estilos =
      lado === 'entrada'
        ? !listo
          ? 'border-rose-300 bg-rose-50'
          : enSalida
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-slate-200 bg-slate-50'
        : !listo
          ? 'border-rose-300 bg-rose-50 opacity-80'
          : enSalida
            ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
            : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40';

    return (
      <div
        key={`${lado}-${item.id}`}
        onClick={lado === 'salida' ? () => { void toggleSalida(item); } : undefined}
        className={`rounded-xl border-2 p-3 transition-all ${
          lado === 'salida' ? 'cursor-pointer active:scale-[0.99]' : ''
        } ${estilos}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-extrabold text-slate-900 leading-snug">{item.descripcion}</p>
          {lado === 'salida' && (
            !listo
              ? <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
              : enSalida
                ? <CheckCircle2 className="w-6 h-6 text-amber-600 shrink-0" />
                : <div className="w-6 h-6 rounded-full border-2 border-slate-300 shrink-0" aria-hidden />
          )}
          {lado === 'entrada' && !listo && (
            <span className="text-[10px] font-bold uppercase text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full shrink-0">
              Sin cert
            </span>
          )}
          {lado === 'entrada' && listo && enSalida && (
            <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
              Sale
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CampoEquipo etiqueta="Marca" valor={item.marca} />
          <CampoEquipo etiqueta="Modelo" valor={item.modelo} />
          <CampoEquipo etiqueta="Serie" valor={item.serie} />
          <CampoEquipo etiqueta="ID interno" valor={item.idInterno} />
        </div>
        {listo ? (
          <p className="mt-2 text-xs font-bold text-emerald-700">Cert: {item.certificado}</p>
        ) : (
          <p className="mt-2 text-xs font-bold text-rose-700">
            Sin certificado — no puede salir
          </p>
        )}
      </div>
    );
  };

  const totalEquiposPendientes = items.length;

  const totalClientes = useMemo(
    () => new Set(items.map((item) => item.cliente)).size,
    [items]
  );

  const totalListos = useMemo(
    () => items.filter(tieneCertificado).length,
    [items]
  );

  const totalSinCert = totalEquiposPendientes - totalListos;

  const bannerComparacion = () => {
    if (!clienteActivo) return null;

    const cfg = {
      vacio: {
        bg: 'bg-slate-100 border-slate-300 text-slate-700',
        icon: AlertTriangle,
        titulo: 'Selecciona equipos que salen',
        detalle: 'Toca en la columna SALIDA los equipos de este envío',
      },
      parcial: {
        bg: 'bg-amber-100 border-amber-400 text-amber-950',
        icon: ArrowRightLeft,
        titulo: 'Salida parcial',
        detalle: `${salidaCliente.length} salen · ${comparacion.pendientes.length} quedan en laboratorio`,
      },
      completa: {
        bg: 'bg-emerald-100 border-emerald-500 text-emerald-900',
        icon: CheckCircle2,
        titulo: 'Salida completa',
        detalle: `Los ${entradaCliente.length} equipos salen en este folio`,
      },
    }[comparacion.estado];

    const Icon = cfg.icon;

    return (
      <div className={`rounded-xl border-2 p-4 flex items-center gap-3 ${cfg.bg}`}>
        <Icon className="w-9 h-9 shrink-0" />
        <div>
          <p className="text-base font-black leading-tight">{cfg.titulo}</p>
          <p className="text-sm font-semibold mt-0.5 opacity-90">{cfg.detalle}</p>
        </div>
      </div>
    );
  };

  const etiquetaBotonSalida = () => {
    if (processing) return 'Procesando...';
    if (!comparacion.puedeConfirmar) return 'Selecciona equipos en SALIDA';
    if (comparacion.estado === 'completa') return `Confirmar salida completa (${salidaCliente.length})`;
    return `Confirmar salida parcial (${salidaCliente.length})`;
  };

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-slate-50 pb-28">
      <header className="sticky top-0 z-20 shadow-lg">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#1d4f82] via-[#2464A3] to-[#2b78c4] text-white">
          <div className="absolute -top-20 -right-10 h-44 w-44 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => (clienteActivo ? volverAClientes() : navigateTo('menu'))}
                className="rounded-xl p-2.5 bg-white/15 hover:bg-white/25 active:scale-95 transition-all shrink-0"
                aria-label={clienteActivo ? 'Cambiar cliente' : 'Volver al menú'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <img src={labLogo} alt="Logo" className="h-9 w-auto object-contain bg-white rounded-lg px-1.5 py-0.5 hidden sm:block shadow-sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Logística</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-200/30 text-emerald-50">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-200" />
                    </span>
                    En vivo
                  </span>
                </div>
                <h1 className="text-lg sm:text-xl font-bold truncate leading-tight">Entrada y Salida</h1>
              </div>
            </div>
            {clienteActivo && (
              <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-xl border border-white/20 shrink-0">
                <FileSignature className="w-4 h-4 text-white/70" />
                <input
                  type="text"
                  className="font-mono font-bold text-white text-sm w-24 sm:w-28 text-center uppercase outline-none bg-transparent placeholder:text-white/50"
                  value={customFolio}
                  onChange={(e) => setCustomFolio(e.target.value.toUpperCase())}
                  aria-label="Folio de salida"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full p-4 space-y-4">
        {!clienteActivo ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center ring-1 ring-blue-100">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Clientes</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{totalClientes}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center ring-1 ring-amber-100">
                  <Package className="w-5 h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pendientes</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{totalEquiposPendientes}</p>
                  <p className="text-[11px] font-semibold text-slate-400 mt-0.5 truncate">en laboratorio</p>
                </div>
              </div>
              <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Listos para salir</p>
                  <p className="text-2xl font-black text-slate-900 leading-none">{totalListos}</p>
                  {totalSinCert > 0 && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-0.5 truncate">
                      {etiquetaEquipos(totalSinCert)} sin certificado
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
              <input
                type="search"
                placeholder="Buscar cliente, equipo, serie o ID..."
                className="w-full pl-11 pr-4 py-3 text-sm border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                ))}
              </div>
            ) : clientesOrdenados.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-2xl mb-4">
                  {search.trim() ? <Search className="w-7 h-7 text-slate-300" /> : <Package className="w-7 h-7 text-slate-300" />}
                </div>
                <p className="text-lg font-bold text-slate-800">
                  {search.trim() ? 'Sin coincidencias' : 'Sin equipos pendientes'}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  {search.trim()
                    ? 'Prueba con otro cliente, serie o descripción.'
                    : 'No hay equipos de laboratorio listos para salida.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {clientesOrdenados.map(([cliente, lista]) => {
                  const listos = lista.filter(tieneCertificado).length;
                  const sinCert = lista.length - listos;
                  const preview = lista.slice(0, 2);
                  return (
                    <button
                      key={cliente}
                      type="button"
                      onClick={() => abrirCliente(cliente)}
                      className="group text-left bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-blue-300 active:scale-[0.99] transition-all duration-200 overflow-hidden border-l-[5px] border-l-blue-500 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center ring-1 ring-blue-100 shrink-0">
                          <Building2 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold text-slate-900 truncate leading-snug" title={cliente}>
                            {cliente}
                          </h3>
                          <p className="text-sm font-semibold text-slate-500 mt-0.5">
                            {etiquetaEquipos(lista.length, 'en entrada')}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {listos > 0 && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                {listos} listos
                              </span>
                            )}
                            {sinCert > 0 && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                                {sinCert} sin cert
                              </span>
                            )}
                          </div>
                          {preview.length > 0 && (
                            <p className="mt-2 text-xs text-slate-400 truncate">
                              {preview.map((item) => item.descripcion).join(' · ')}
                              {lista.length > 2 ? ` · +${lista.length - 2}` : ''}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Cliente</p>
                  <p className="text-lg font-black text-slate-900">{clienteActivo}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { void marcarTodosSalida(); }}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700"
                  >
                    Todos con certificado
                  </button>
                  <button
                    onClick={limpiarSalida}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-blue-50 border border-blue-100 py-2 px-1">
                  <p className="text-[10px] font-bold uppercase text-blue-600">Entrada</p>
                  <p className="text-lg font-black text-blue-900">{entradaCliente.length}</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 py-2 px-1">
                  <p className="text-[10px] font-bold uppercase text-amber-700">Salen ahora</p>
                  <p className="text-lg font-black text-amber-900">{salidaCliente.length}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 py-2 px-1">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Quedan</p>
                  <p className="text-lg font-black text-slate-800">{comparacion.pendientes.length}</p>
                </div>
              </div>
              {sinCertificadoCliente.length > 0 && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {sinCertificadoCliente.length} {sinCertificadoCliente.length === 1 ? 'equipo' : 'equipos'} sin certificado: no se pueden seleccionar para salida.
                  </span>
                </div>
              )}
            </div>

            {bannerComparacion()}

            <div className="grid lg:grid-cols-2 gap-4">
              <section className="bg-white rounded-2xl border-2 border-blue-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center gap-2">
                  <Hash className="w-5 h-5" />
                  <h2 className="text-lg font-black">ENTRADA</h2>
                  <span className="ml-auto text-sm font-bold bg-blue-500 px-3 py-1 rounded-full">
                    {entradaCliente.length}
                  </span>
                </div>
                <div className="p-3 space-y-3 max-h-[55vh] overflow-y-auto">
                  {entradaCliente.map((item) => renderTarjetaEquipo(item, 'entrada'))}
                </div>
              </section>

              <section className="bg-white rounded-2xl border-2 border-amber-300 overflow-hidden">
                <div className="bg-amber-500 text-white px-4 py-3 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5" />
                  <h2 className="text-lg font-black">SALIDA</h2>
                  <span className="ml-auto text-sm font-bold bg-amber-600 px-3 py-1 rounded-full">
                    {salidaCliente.length} / {entradaCliente.length}
                  </span>
                </div>
                <p className="px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-50 border-b border-amber-100">
                  Solo equipos con certificado pueden salir. Toca para seleccionar (salida parcial permitida).
                </p>
                <div className="p-3 space-y-3 max-h-[55vh] overflow-y-auto">
                  {entradaCliente.map((item) => renderTarjetaEquipo(item, 'salida'))}
                </div>
              </section>
            </div>

            {comparacion.estado === 'parcial' && comparacion.pendientes.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="font-bold text-slate-700 text-sm mb-2">Quedan en laboratorio (no incluidos en este folio)</p>
                <ul className="space-y-1">
                  {comparacion.pendientes.map((item) => (
                    <li key={item.id} className="text-sm font-medium text-slate-600">
                      · {item.descripcion} — Serie {item.serie}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>

      {clienteActivo && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-slate-200 p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] z-30">
          <div className="max-w-6xl mx-auto">
            <button
              onClick={handleConfirmarSalida}
              disabled={!comparacion.puedeConfirmar || !customFolio || processing}
              className={`w-full py-4 rounded-xl font-black text-base flex items-center justify-center gap-3 transition-all ${
                comparacion.puedeConfirmar && customFolio
                  ? comparacion.estado === 'completa'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99]'
                    : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.99]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {processing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Printer className="w-5 h-5" />
              )}
              {etiquetaBotonSalida()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EntradaSalidaScreen;
