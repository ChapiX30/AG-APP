import React, { useState, useEffect, useMemo } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import {
  collection, query, orderBy, limit, getDocs, doc,
  getDoc, writeBatch, runTransaction
} from 'firebase/firestore';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Search, Printer, Loader2,
  CheckCircle2, AlertTriangle,
  Hash, ArrowRightLeft, FileSignature, Building2, Package
} from 'lucide-react';
import labLogo from '../assets/lab_logo.png';

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

const CampoEquipo: React.FC<{ etiqueta: string; valor: string }> = ({ etiqueta, valor }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{etiqueta}</p>
    <p className="text-sm font-semibold text-slate-800 truncate">{valor || '—'}</p>
  </div>
);

export const EntradaSalidaScreen: React.FC = () => {
  const { navigateTo } = useNavigation();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ItemEquipo[]>([]);
  const [search, setSearch] = useState('');
  const [clienteActivo, setClienteActivo] = useState<string | null>(null);
  const [salidaIds, setSalidaIds] = useState<Set<string>>(new Set());
  const [customFolio, setCustomFolio] = useState('');
  const [nextFolioDB, setNextFolioDB] = useState(0);

  useEffect(() => {
    fetchItems();
    fetchNextFolio();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'hojasDeTrabajo'), orderBy('fecha', 'desc'), limit(300));
      const snap = await getDocs(q);
      const lista: ItemEquipo[] = [];

      snap.forEach((d) => {
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

        if (!esSitio && data.entregado !== true) {
          lista.push({
            id: d.id,
            descripcion: data.equipo || data.nombre || data.instrumento || data.descripcion || 'Sin nombre',
            marca: data.marca || 'S/M',
            modelo: data.modelo || 'S/M',
            serie: data.serie || data.Serie || data.noSerie || data.serial || 'S/N',
            idInterno: data.ID || data.id || data.Id || data.idInterno || data.identificacion || 'S/ID',
            certificado: data.certificado || data.folioCertificado || 'Pendiente',
            cliente: (data.cliente || data.empresa || 'Sin cliente').trim(),
            ordenCompra: data.ordenCompra || data.oc || '',
          });
        }
      });

      setItems(lista);
    } catch (error) {
      console.error('Error cargando equipos:', error);
    } finally {
      setLoading(false);
    }
  };

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
    const filtrados = items.filter((item) =>
      item.cliente.toLowerCase().includes(search.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(search.toLowerCase()) ||
      item.serie.toLowerCase().includes(search.toLowerCase())
    );
    const grupos: Record<string, ItemEquipo[]> = {};
    filtrados.forEach((item) => {
      if (!grupos[item.cliente]) grupos[item.cliente] = [];
      grupos[item.cliente].push(item);
    });
    return grupos;
  }, [items, search]);

  const entradaCliente = useMemo(() => {
    if (!clienteActivo) return [];
    return items.filter((item) => item.cliente === clienteActivo);
  }, [items, clienteActivo]);

  const salidaCliente = useMemo(
    () => entradaCliente.filter((item) => salidaIds.has(item.id)),
    [entradaCliente, salidaIds]
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

  const toggleSalida = (id: string) => {
    setSalidaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const marcarTodosSalida = () => {
    setSalidaIds(new Set(entradaCliente.map((item) => item.id)));
  };

  const limpiarSalida = () => {
    setSalidaIds(new Set());
  };

  const handleConfirmarSalida = async () => {
    if (!clienteActivo) return;
    if (!comparacion.puedeConfirmar || salidaCliente.length === 0) {
      alert('Selecciona al menos un equipo en la columna SALIDA.');
      return;
    }
    if (!customFolio.trim()) return alert('Escribe un folio válido.');

    const esCompleta = comparacion.estado === 'completa';
    const msgParcial = esCompleta
      ? 'Salida completa: todos los equipos del cliente.'
      : `Salida parcial: ${salidaCliente.length} de ${entradaCliente.length} equipos.\nQuedan ${comparacion.pendientes.length} en laboratorio.`;

    const confirmacion = window.confirm(
      `CONFIRMAR SALIDA\n\nFolio: ${customFolio}\nCliente: ${clienteActivo}\nEquipos en esta salida: ${salidaCliente.length}\n\n${msgParcial}\n\n¿Generar PDF y registrar?`
    );
    if (!confirmacion) return;

    setLoading(true);
    try {
      await generatePDFDoc(salidaCliente, customFolio, !esCompleta);

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
      alert(esCompleta ? 'Salida completa registrada.' : `Salida parcial registrada (${salidaCliente.length} equipos).`);
      volverAClientes();
      fetchItems();
      fetchNextFolio();
    } catch (error) {
      console.error(error);
      alert('Error al registrar salida.');
    } finally {
      setLoading(false);
    }
  };

  const generatePDFDoc = async (itemsToPrint: ItemEquipo[], folio: string, esParcial = false) => {
    const primerCliente = itemsToPrint[0].cliente;
    const oc = itemsToPrint[0].ordenCompra;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let logoImg = null;
    try {
      const logoBytes = await fetch(labLogo).then((res) => res.arrayBuffer());
      logoImg = await pdfDoc.embedPng(logoBytes);
    } catch (e) {
      console.warn('No se pudo cargar el logo para PDF', e);
    }

    const ITEMS_PER_PAGE = 15;
    const totalPages = Math.ceil(itemsToPrint.length / ITEMS_PER_PAGE);

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const page = pdfDoc.addPage([612, 792]);
      const { width, height } = page.getSize();
      const margin = 30;
      const start = pageIndex * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const itemsDeEstaPagina = itemsToPrint.slice(start, end);

      const drawBlock = (startY: number) => {
        let y = startY;
        if (logoImg) {
          const maxLogoW = 95;
          const maxLogoH = 28;
          const scale = Math.min(
            maxLogoW / logoImg.width,
            maxLogoH / logoImg.height,
            1
          );
          const w = logoImg.width * scale;
          const h = logoImg.height * scale;
          page.drawImage(logoImg, { x: margin, y: y - h, width: w, height: h });
        }
        const emp = 'EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.';
        const wEmp = fontBold.widthOfTextAtSize(emp, 9);
        page.drawText(emp, { x: (width - wEmp) / 2, y: y - 8, size: 9, font: fontBold });

        y -= 35;
        const tit = 'HOJA DE ENTRADA Y SALIDA DE EQUIPOS';
        const wTit = fontBold.widthOfTextAtSize(tit, 10);
        page.drawText(tit, { x: (width - wTit) / 2, y, size: 10, font: fontBold, color: rgb(0, 0, 0.6) });

        page.drawText('AG-CAL-F28-00', { x: margin, y: y - 8, size: 7, font });
        page.drawText(`Pág. ${pageIndex + 1}/${totalPages}`, { x: width - margin - 50, y: y - 8, size: 7, font: fontBold });

        y -= 20;
        page.drawLine({ start: { x: margin, y: y + 8 }, end: { x: width - margin, y: y + 8 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        const today = new Date().toLocaleDateString('es-MX');

        page.drawText('CLIENTE:', { x: margin, y, size: 7, font: fontBold });
        page.drawText(primerCliente.substring(0, 55), { x: margin + 45, y, size: 7, font });

        page.drawText('FECHA:', { x: width - margin - 110, y, size: 7, font: fontBold });
        page.drawText(today, { x: width - margin - 75, y, size: 7, font });

        y -= 14;
        page.drawText('OC:', { x: margin, y, size: 7, font: fontBold });
        page.drawText(oc || 'N/A', { x: margin + 45, y, size: 7, font });

        page.drawText('FOLIO:', { x: width - margin - 110, y, size: 7, font: fontBold });
        page.drawText(folio, { x: width - margin - 75, y, size: 7, font: fontBold, color: rgb(0.8, 0, 0) });

        if (esParcial) {
          y -= 12;
          page.drawText('SALIDA PARCIAL', { x: margin, y, size: 7, font: fontBold, color: rgb(0.75, 0.45, 0) });
        }

        y -= 18;
        const tTop = y;
        const rowH = 13.5;
        const cols = { no: margin, desc: margin + 30, marca: margin + 190, mod: margin + 270, ser: margin + 350, id: margin + 430, cert: margin + 500 };

        page.drawRectangle({ x: margin, y: y - 8, width: width - margin * 2, height: 14, color: rgb(0.92, 0.92, 0.92), borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
        const dh = (t: string, x: number) => page.drawText(t, { x: x + 2, y: y - 5, size: 6, font: fontBold });
        dh('NO.', cols.no);
        dh('DESCRIPCIÓN', cols.desc);
        dh('MARCA', cols.marca);
        dh('MODELO', cols.mod);
        dh('SERIE', cols.ser);
        dh('ID', cols.id);
        dh('CERTIFICADO', cols.cert);

        y -= 8;
        for (let i = 0; i < ITEMS_PER_PAGE; i++) {
          y -= rowH;
          const it = itemsDeEstaPagina[i];
          page.drawRectangle({ x: margin, y, width: width - margin * 2, height: rowH, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
          [cols.desc, cols.marca, cols.mod, cols.ser, cols.id, cols.cert].forEach((vx) =>
            page.drawLine({ start: { x: vx, y }, end: { x: vx, y: y + rowH }, thickness: 0.5, color: rgb(0, 0, 0) })
          );

          const ty = y + 4;
          const ts = 7;
          const consecutivo = pageIndex * ITEMS_PER_PAGE + i + 1;
          page.drawText(consecutivo.toString().padStart(2, '0'), { x: cols.no + 5, y: ty, size: ts, font });

          if (it) {
            const tr = (s: string, l: number) => (s ? (s.length > l ? s.substring(0, l) : s) : '-');
            page.drawText(tr(it.descripcion, 35), { x: cols.desc + 2, y: ty, size: ts, font });
            page.drawText(tr(it.marca, 14), { x: cols.marca + 2, y: ty, size: ts, font });
            page.drawText(tr(it.modelo, 14), { x: cols.mod + 2, y: ty, size: ts, font });
            page.drawText(tr(it.serie, 14), { x: cols.ser + 2, y: ty, size: ts, font });
            page.drawText(tr(it.idInterno, 12), { x: cols.id + 2, y: ty, size: ts, font });
            page.drawText(tr(it.certificado, 15), { x: cols.cert + 2, y: ty, size: ts, font });
          }
        }
        [cols.desc, cols.marca, cols.mod, cols.ser, cols.id, cols.cert].forEach((vx) =>
          page.drawLine({ start: { x: vx, y: tTop - 8 }, end: { x: vx, y: tTop + 6 }, thickness: 0.5, color: rgb(0, 0, 0) })
        );

        y -= 35;
        page.drawText('ENTREGO:', { x: margin + 60, y, size: 7, font: fontBold });
        page.drawLine({ start: { x: margin + 40, y: y - 15 }, end: { x: margin + 200, y: y - 15 }, thickness: 0.5 });
        page.drawText('RECIBIO:', { x: width - margin - 150, y, size: 7, font: fontBold });
        page.drawLine({ start: { x: width - margin - 200, y: y - 15 }, end: { x: width - margin - 40, y: y - 15 }, thickness: 0.5 });
      };

      drawBlock(height - 20);
      const mid = height / 2;
      page.drawLine({ start: { x: 10, y: mid }, end: { x: width - 10, y: mid }, thickness: 1, color: rgb(0.6, 0.6, 0.6), dashArray: [4, 4] });
      drawBlock(mid - 20);
    }

    const pdfBytes = await pdfDoc.save();
    saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `Salida_${folio}.pdf`);
  };

  const renderTarjetaEquipo = (item: ItemEquipo, lado: 'entrada' | 'salida') => {
    const enSalida = salidaIds.has(item.id);

    const estilos =
      lado === 'entrada'
        ? enSalida
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-slate-200 bg-slate-50'
        : enSalida
          ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
          : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40';

    return (
      <div
        key={`${lado}-${item.id}`}
        onClick={lado === 'salida' ? () => toggleSalida(item.id) : undefined}
        className={`rounded-xl border-2 p-3 transition-all ${
          lado === 'salida' ? 'cursor-pointer active:scale-[0.99]' : ''
        } ${estilos}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-extrabold text-slate-900 leading-snug">{item.descripcion}</p>
          {lado === 'salida' && (
            enSalida
              ? <CheckCircle2 className="w-6 h-6 text-amber-600 shrink-0" />
              : <div className="w-6 h-6 rounded-full border-2 border-slate-300 shrink-0" aria-hidden />
          )}
          {lado === 'entrada' && enSalida && (
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
        {item.certificado && item.certificado !== 'Pendiente' && (
          <p className="mt-2 text-xs font-bold text-emerald-700">Cert: {item.certificado}</p>
        )}
      </div>
    );
  };

  const totalEquiposPendientes = useMemo(
    () => items.length,
    [items]
  );

  const totalClientes = useMemo(
    () => Object.keys(clientesDisponibles).length,
    [clientesDisponibles]
  );

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
    if (loading) return 'Procesando...';
    if (!comparacion.puedeConfirmar) return 'Selecciona equipos en SALIDA';
    if (comparacion.estado === 'completa') return `Confirmar salida completa (${salidaCliente.length})`;
    return `Confirmar salida parcial (${salidaCliente.length})`;
  };

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-slate-100 pb-28">
      <header className="sticky top-0 z-20 shadow-md">
        <div className="bg-[#2464A3] text-white">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => (clienteActivo ? volverAClientes() : navigateTo('menu'))}
                className="rounded-full p-2.5 bg-white/15 hover:bg-white/25 transition-colors shrink-0"
                aria-label={clienteActivo ? 'Cambiar cliente' : 'Volver al menú'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <img src={labLogo} alt="Logo" className="h-8 w-auto object-contain bg-white/90 rounded px-1.5 py-0.5 hidden sm:block" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Logística</p>
                <h1 className="text-lg sm:text-xl font-bold truncate">Entrada y Salida</h1>
              </div>
            </div>
            {clienteActivo && (
              <div className="flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg border border-white/20 shrink-0">
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

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {!clienteActivo ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Clientes</p>
                  <p className="text-xl font-black text-slate-900">{totalClientes}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Package className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Equipos pendientes</p>
                  <p className="text-xl font-black text-slate-900">{totalEquiposPendientes}</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar cliente o equipo..."
                className="w-full pl-12 pr-4 py-4 text-lg border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 bg-white font-medium"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="flex flex-col items-center py-20 text-slate-500">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                <p className="text-lg font-semibold">Cargando equipos...</p>
              </div>
            ) : Object.keys(clientesDisponibles).length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-300">
                <p className="text-xl font-bold text-slate-800">Sin equipos pendientes</p>
                <p className="text-slate-500 mt-2">No hay equipos de laboratorio listos para salida.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(clientesDisponibles).map(([cliente, lista]) => (
                  <button
                    key={cliente}
                    onClick={() => abrirCliente(cliente)}
                    className="text-left bg-white rounded-2xl border-2 border-slate-200 p-5 hover:border-blue-400 hover:shadow-md transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                        <Building2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black text-slate-900 truncate">{cliente}</h3>
                        <p className="text-sm font-semibold text-slate-500">{lista.length} equipos en entrada</p>
                      </div>
                      <ArrowRightLeft className="w-6 h-6 text-blue-500 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">Cliente</p>
                  <p className="text-lg font-black text-slate-900">{clienteActivo}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={marcarTodosSalida}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700"
                  >
                    Todos salen
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
                  Toca los equipos que salen en este folio. Puedes enviar solo algunos (salida parcial).
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
              disabled={!comparacion.puedeConfirmar || !customFolio || loading}
              className={`w-full py-4 rounded-xl font-black text-base flex items-center justify-center gap-3 transition-all ${
                comparacion.puedeConfirmar && customFolio
                  ? comparacion.estado === 'completa'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.99]'
                    : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.99]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
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
