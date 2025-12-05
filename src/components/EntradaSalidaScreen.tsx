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
  ArrowLeft, Search, Printer, Loader2, Building2, 
  CheckCircle2, Circle, Plus, X, AlertTriangle, 
  Hash, LayoutList, FileSignature, Tag, Info
} from 'lucide-react';

// --- INTERFACES ---
interface ItemSalida {
  id: string; 
  isManual: boolean;
  descripcion: string;
  marca: string;
  modelo: string;
  serie: string;
  idInterno: string; 
  certificado: string;
  cliente: string;
  ordenCompra: string;
  fechaTermino: string;
  tipoServicio: string; // Valor real detectado para depuración
  selected: boolean;
}

export const EntradaSalidaScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  
  // Estados
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ItemSalida[]>([]);
  const [search, setSearch] = useState('');
  const [customFolio, setCustomFolio] = useState<string>('');
  const [nextFolioDB, setNextFolioDB] = useState<number>(0); 

  // Modal Manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    descripcion: '', marca: '', modelo: '', serie: '', idInterno: '', certificado: 'N/A'
  });

  // --- 1. CARGA INICIAL ---
  useEffect(() => {
    fetchItems();
    fetchNextFolio();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'hojasDeTrabajo'), orderBy('fecha', 'desc'), limit(300));
      const snap = await getDocs(q);
      
      const lista: ItemSalida[] = [];
      snap.forEach(d => {
        const data = d.data();
        
        // --- LÓGICA DE FILTRO ROBUSTA ---
        // 1. Buscamos el valor en todos los campos posibles donde pueda estar "Sitio"
        const rawTipo = 
          data.tipoServicio || 
          data.TipoServicio || 
          data.servicio || 
          data.tipo || 
          data.lugar || 
          data.ubicacion || 
          data.laboratorio ||   
          data.lugarCalibracion ||
          'Laboratorio';

        // 2. Normalizamos: Quitamos acentos y pasamos a minúsculas para comparar
        const tipoStr = String(rawTipo)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""); // "Sítio" -> "sitio"

        // 3. Palabras prohibidas (Si tiene esto, ES SITIO y se descarta)
        const esSitio = 
          tipoStr.includes('sitio') || 
          tipoStr.includes('planta') || 
          tipoStr.includes('site') || 
          tipoStr.includes('externo') ||
          tipoStr.includes('fuera'); // Por si acaso

        const yaEntregado = data.entregado === true;

        if (!esSitio && !yaEntregado) {
          lista.push({
            id: d.id,
            isManual: false,
            // Prioridad de nombres para que aparezca
            descripcion: data.equipo || data.nombre || data.instrumento || data.descripcion || 'Sin Nombre',
            marca: data.marca || 'S/M',
            modelo: data.modelo || 'S/M',
            // Variantes de Serie
            serie: data.serie || data.Serie || data.noSerie || data.serial || 'S/N',
            // Variantes de ID (Buscando específicamente ID con mayúsculas si existe)
            idInterno: data.ID || data.id || data.Id || data.idInterno || data.identificacion || 'S/ID',
            certificado: data.certificado || data.folioCertificado || 'Pendiente',
            cliente: (data.cliente || data.empresa || 'Sin Cliente').trim(),
            ordenCompra: data.ordenCompra || data.oc || '',
            fechaTermino: data.fecha,
            tipoServicio: String(rawTipo), // Guardamos el valor original para mostrarlo
            selected: false
          });
        }
      });
      setItems(lista);
    } catch (error) {
      console.error("Error cargando:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNextFolio = async () => {
    try {
      const docRef = doc(db, 'consecutivos', 'hojasSalida');
      const docSnap = await getDoc(docRef);
      let count = 1;
      if (docSnap.exists()) {
        count = docSnap.data().count + 1;
      }
      setNextFolioDB(count);
      setCustomFolio(`HSE-${String(count).padStart(4, '0')}`);
    } catch (e) {
      setCustomFolio('HSE-0001');
    }
  };

  // --- 2. LÓGICA DE SELECCIÓN ---
  const itemsAgrupados = useMemo(() => {
    const filtrados = items.filter(i => 
      i.cliente.toLowerCase().includes(search.toLowerCase()) ||
      i.ordenCompra.toLowerCase().includes(search.toLowerCase()) ||
      i.descripcion.toLowerCase().includes(search.toLowerCase()) ||
      i.serie.toLowerCase().includes(search.toLowerCase())
    );

    const grupos: Record<string, ItemSalida[]> = {};
    filtrados.forEach(item => {
      if (!grupos[item.cliente]) grupos[item.cliente] = [];
      grupos[item.cliente].push(item);
    });
    return grupos;
  }, [items, search]);

  const handleToggleSelect = (id: string) => {
    setItems(prev => {
      const target = prev.find(i => i.id === id);
      if (!target) return prev;

      if (!target.selected) {
        const yaSeleccionados = prev.filter(i => i.selected);
        if (yaSeleccionados.length > 0) {
          const clienteActual = yaSeleccionados[0].cliente;
          if (target.cliente !== clienteActual) {
            alert(`⚠️ PRECAUCIÓN\n\nNo mezcles clientes. Ya tienes items de "${clienteActual}".`);
            return prev;
          }
        }
      }
      return prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i);
    });
  };

  const handleSelectGroup = (cliente: string) => {
    const otrosSeleccionados = items.filter(i => i.selected && i.cliente !== cliente);
    if (otrosSeleccionados.length > 0) {
       alert(`⚠️ Ya tienes seleccionados equipos de ${otrosSeleccionados[0].cliente}.`);
       return;
    }
    setItems(prev => prev.map(i => i.cliente === cliente ? { ...i, selected: true } : i));
  };

  const handleDeselectGroup = (cliente: string) => {
    setItems(prev => prev.map(i => i.cliente === cliente ? { ...i, selected: false } : i));
  };

  // --- 3. ITEMS MANUALES ---
  const handleAddManual = () => {
    const seleccionados = items.filter(i => i.selected);
    if (seleccionados.length === 0) {
      alert("Selecciona primero un equipo de la lista para asignar el cliente.");
      return;
    }
    setShowManualModal(true);
  };

  const saveManualItem = () => {
    if (!manualForm.descripcion) return alert("Falta descripción");
    
    const baseClient = items.find(i => i.selected)?.cliente || 'Manual';
    const baseOC = items.find(i => i.selected)?.ordenCompra || '';

    const newItem: ItemSalida = {
      id: `manual_${Date.now()}`,
      isManual: true,
      descripcion: manualForm.descripcion,
      marca: manualForm.marca || '-',
      modelo: manualForm.modelo || '-',
      serie: manualForm.serie || '-',
      idInterno: manualForm.idInterno || '-', 
      certificado: manualForm.certificado, 
      cliente: baseClient,
      ordenCompra: baseOC,
      fechaTermino: new Date().toISOString(),
      tipoServicio: 'MANUAL',
      selected: true
    };

    setItems(prev => [newItem, ...prev]);
    setShowManualModal(false);
    setManualForm({ descripcion: '', marca: '', modelo: '', serie: '', idInterno: '', certificado: 'N/A' });
  };

  // --- 4. CONFIRMAR SALIDA ---
  const handleConfirmarSalida = async () => {
    const selected = items.filter(i => i.selected);
    if (selected.length === 0) return alert("Nada seleccionado");
    if (!customFolio.trim()) return alert("Escribe un Folio válido.");

    const confirmacion = window.confirm(`CONFIRMAR SALIDA\n\nFolio: ${customFolio}\nCliente: ${selected[0].cliente}\nItems: ${selected.length}\n\n¿Generar PDF y registrar?`);
    if (!confirmacion) return;

    setLoading(true);
    try {
      await generatePDFDoc(selected, customFolio);

      const batch = writeBatch(db);
      selected.forEach(item => {
        if (!item.isManual) {
          const ref = doc(db, 'hojasDeTrabajo', item.id);
          batch.update(ref, { 
            entregado: true,
            folioSalida: customFolio,
            fechaSalida: new Date().toISOString()
          });
        }
      });

      const numeroFolioUsuario = parseInt(customFolio.replace(/\D/g, ''));
      if (!isNaN(numeroFolioUsuario) && numeroFolioUsuario >= nextFolioDB) {
          const folioRef = doc(db, 'consecutivos', 'hojasSalida');
          await runTransaction(db, async (transaction) => {
             const sfDoc = await transaction.get(folioRef);
             if (!sfDoc.exists()) transaction.set(folioRef, { count: numeroFolioUsuario });
             else if (numeroFolioUsuario >= sfDoc.data().count) transaction.update(folioRef, { count: numeroFolioUsuario });
          });
      }

      await batch.commit();
      alert("✅ Salida registrada.");
      fetchItems(); 
      fetchNextFolio(); 

    } catch (error) {
      console.error(error);
      alert("Error al registrar salida.");
    } finally {
      setLoading(false);
    }
  };

  // --- 5. PDF ENGINE ---
  const generatePDFDoc = async (itemsToPrint: ItemSalida[], folio: string) => {
    const primerCliente = itemsToPrint[0].cliente;
    const oc = itemsToPrint[0].ordenCompra;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();
    const margin = 30;

    let logoImg = null;
    try {
      const logoBytes = await fetch('/lab_logo.png').then(res => res.arrayBuffer());
      logoImg = await pdfDoc.embedPng(logoBytes);
    } catch (e) {}

    const drawBlock = (startY: number) => {
      let y = startY;

      // Encabezado
      if (logoImg) {
        const d = logoImg.scale(0.15);
        page.drawImage(logoImg, { x: margin, y: y - 40, width: d.width, height: d.height });
      }
      const emp = "EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.";
      const wEmp = fontBold.widthOfTextAtSize(emp, 9);
      page.drawText(emp, { x: (width - wEmp)/2, y: y - 8, size: 9, font: fontBold });

      y -= 35;
      const tit = "HOJA DE ENTRADA Y SALIDA DE EQUIPOS";
      const wTit = fontBold.widthOfTextAtSize(tit, 10);
      page.drawText(tit, { x: (width - wTit)/2, y: y, size: 10, font: fontBold, color: rgb(0,0,0.6) });
      
      // AJUSTE: Código AG bajado
      page.drawText("AG-CAL-F28-00", { x: margin, y: y - 8, size: 7, font });

      // Datos
      y -= 20;
      page.drawLine({ start: {x:margin, y:y+8}, end:{x:width-margin, y:y+8}, thickness:0.5, color: rgb(0.7,0.7,0.7) });
      const today = new Date().toLocaleDateString('es-MX');
      
      page.drawText("CLIENTE:", { x: margin, y, size: 7, font: fontBold });
      page.drawText(primerCliente, { x: margin + 45, y, size: 7, font });
      page.drawLine({ start:{x:margin+45, y:y-2}, end:{x:width-margin-120, y:y-2}, thickness:0.5 });

      page.drawText("FECHA:", { x: width-margin-110, y, size: 7, font: fontBold });
      page.drawText(today, { x: width-margin-75, y, size: 7, font });
      page.drawLine({ start:{x:width-margin-75, y:y-2}, end:{x:width-margin, y:y-2}, thickness:0.5 });

      y -= 14;
      page.drawText("OC:", { x: margin, y, size: 7, font: fontBold });
      page.drawText(oc || 'N/A', { x: margin + 45, y, size: 7, font });
      page.drawLine({ start:{x:margin+45, y:y-2}, end:{x:width-margin-120, y:y-2}, thickness:0.5 });

      page.drawText("FOLIO:", { x: width-margin-110, y, size: 7, font: fontBold });
      page.drawText(folio, { x: width-margin-75, y, size: 7, font: fontBold, color: rgb(0.8, 0, 0) });
      page.drawLine({ start:{x:width-margin-75, y:y-2}, end:{x:width-margin, y:y-2}, thickness:0.5 });

      // Tabla
      y -= 18;
      const tTop = y;
      const rowH = 13.5;
      const cols = { no: margin, desc: margin+30, marca: margin+190, mod: margin+270, ser: margin+350, id: margin+430, cert: margin+500 };

      page.drawRectangle({ x: margin, y: y-8, width: width-(margin*2), height: 14, color: rgb(0.92,0.92,0.92), borderColor: rgb(0,0,0), borderWidth: 0.5 });
      const dh = (t:string, x:number) => page.drawText(t, { x: x+2, y: y-5, size: 6, font: fontBold });
      dh("NO.", cols.no); dh("DESCRIPCIÓN", cols.desc); dh("MARCA", cols.marca); dh("MODELO", cols.mod); dh("NO. SERIE", cols.ser); dh("ID", cols.id); dh("CERTIFICADO", cols.cert);

      y -= 8;
      for(let i=0; i<15; i++){
        y -= rowH;
        const it = itemsToPrint[i];
        page.drawRectangle({ x: margin, y: y, width: width-(margin*2), height: rowH, borderColor: rgb(0,0,0), borderWidth: 0.5 });
        [cols.desc, cols.marca, cols.mod, cols.ser, cols.id, cols.cert].forEach(vx => page.drawLine({ start:{x:vx, y:y}, end:{x:vx, y:y+rowH}, thickness:0.5, color: rgb(0,0,0) }));

        const ty = y+4; const ts = 7;
        page.drawText((i+1).toString().padStart(2,'0'), { x: cols.no+5, y: ty, size: ts, font });
        if(it){
          const tr = (s:string, l:number) => s.length>l ? s.substring(0,l) : s;
          page.drawText(tr(it.descripcion,35), { x: cols.desc+2, y: ty, size: ts, font });
          page.drawText(tr(it.marca,14), { x: cols.marca+2, y: ty, size: ts, font });
          page.drawText(tr(it.modelo,14), { x: cols.mod+2, y: ty, size: ts, font });
          page.drawText(tr(it.serie,14), { x: cols.ser+2, y: ty, size: ts, font });
          page.drawText(tr(it.idInterno,12), { x: cols.id+2, y: ty, size: ts, font });
          page.drawText(tr(it.certificado,15), { x: cols.cert+2, y: ty, size: ts, font });
        }
      }
      [cols.desc, cols.marca, cols.mod, cols.ser, cols.id, cols.cert].forEach(vx => page.drawLine({ start:{x:vx, y:tTop-8}, end:{x:vx, y:tTop+6}, thickness:0.5, color: rgb(0,0,0) }));

      y -= 35;
      page.drawText("ENTREGO:", { x: margin+60, y, size: 7, font: fontBold });
      page.drawLine({ start:{x:margin+40, y:y-15}, end:{x:margin+200, y:y-15}, thickness:0.5 });
      page.drawText("RECIBIO:", { x: width-margin-150, y, size: 7, font: fontBold });
      page.drawLine({ start:{x:width-margin-200, y:y-15}, end:{x:width-margin-40, y:y-15}, thickness:0.5 });
    };

    drawBlock(height - 20);
    const mid = height / 2;
    page.drawLine({ start:{x:10, y:mid}, end:{x:width-10, y:mid}, thickness:1, color: rgb(0.6,0.6,0.6), dashArray:[4,4] });
    drawBlock(mid - 20);

    const pdfBytes = await pdfDoc.save();
    saveAs(new Blob([pdfBytes], { type: 'application/pdf' }), `Salida_${folio}.pdf`);
  };

  const seleccionadosCount = items.filter(i => i.selected).length;
  const clienteSeleccionado = items.find(i => i.selected)?.cliente || '';

  return (
    <div className="min-h-screen bg-slate-50 pb-24 relative">
      {/* HEADER */}
      <div className="bg-white border-b sticky top-0 z-20 px-4 py-3 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigateTo('menu')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800">Logística de Salida</h1>
            <p className="text-xs text-slate-500 hidden md:block">Gestión de hojas de entrega (Laboratorio)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
            <div className="bg-white px-2 py-1 rounded shadow-sm text-xs font-bold text-slate-500">FOLIO:</div>
            <input 
              type="text" 
              className="bg-transparent border-none outline-none font-mono font-bold text-blue-700 text-sm w-28 text-center uppercase focus:ring-0"
              value={customFolio}
              onChange={(e) => setCustomFolio(e.target.value.toUpperCase())}
            />
            <FileSignature className="w-4 h-4 text-slate-400 mr-1" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar por cliente, descripción, OC..." 
            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
            <p>Buscando equipos pendientes...</p>
          </div>
        ) : Object.keys(itemsAgrupados).length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
             <LayoutList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
             <p className="text-slate-800 font-medium">Sin equipos pendientes</p>
             <p className="text-slate-500 text-sm">No hay equipos de Laboratorio listos para salida.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(itemsAgrupados).map(([cliente, listaItems]) => {
              const countSelected = listaItems.filter(i => i.selected).length;
              const allSelected = listaItems.length > 0 && countSelected === listaItems.length;
              const isBlocked = seleccionadosCount > 0 && !countSelected && clienteSeleccionado !== cliente;

              return (
                <div key={cliente} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${isBlocked ? 'opacity-50 grayscale' : ''}`}>
                  <div className="bg-slate-50 p-4 border-b flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200 shadow-sm">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-base md:text-lg">{cliente}</h3>
                        <p className="text-xs text-slate-500">{listaItems.length} equipos disponibles</p>
                      </div>
                    </div>
                    
                    {!isBlocked && (
                      <div className="flex gap-2">
                        {allSelected ? (
                           <button onClick={() => handleDeselectGroup(cliente)} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200">
                             Deseleccionar
                           </button>
                        ) : (
                           <button onClick={() => handleSelectGroup(cliente)} className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 border border-blue-200">
                             Seleccionar Todos
                           </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {listaItems.map(item => (
                      <div 
                        key={item.id}
                        onClick={() => !isBlocked && handleToggleSelect(item.id)}
                        className={`p-4 flex items-center gap-4 transition-colors ${
                          isBlocked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'
                        } ${item.selected ? 'bg-blue-50/70' : ''}`}
                      >
                        <div className={`flex-shrink-0 ${item.selected ? 'text-blue-600' : 'text-slate-300'}`}>
                          {item.selected ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                        </div>

                        {/* --- LISTA VISUAL MEJORADA --- */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-y-2 gap-x-4 items-center">
                          
                          {/* NOMBRE GRANDE */}
                          <div className="md:col-span-6">
                            <p className="text-lg font-extrabold text-slate-800 leading-tight">
                              {item.descripcion}
                            </p>
                            
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                               <span className="text-sm font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                 {item.marca} - {item.modelo}
                               </span>
                               
                               {/* ETIQUETA DE DEPURACIÓN DE TIPO */}
                               <span className="text-[9px] text-slate-400 border border-slate-200 px-1 rounded bg-slate-50">
                                 Tipo: {item.tipoServicio.substring(0, 8)}
                               </span>

                               {item.isManual && (
                                <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">MANUAL</span>
                               )}
                            </div>
                          </div>

                          <div className="md:col-span-3 flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                               <Tag className="w-3 h-3 text-slate-400" />
                               <span className="text-xs font-mono text-slate-600">S: <strong>{item.serie}</strong></span>
                            </div>
                            <div className="flex items-center gap-2">
                               <Hash className="w-3 h-3 text-slate-400" />
                               <span className="text-xs font-mono text-slate-600">ID: <strong>{item.idInterno}</strong></span>
                            </div>
                          </div>

                          <div className="md:col-span-1">
                             {item.ordenCompra && (
                               <div className="text-[10px] text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 text-center truncate">
                                  OC: {item.ordenCompra}
                               </div>
                             )}
                          </div>

                          <div className="md:col-span-2 md:text-right">
                             <span className={`text-[10px] font-bold px-2 py-1 rounded-full border inline-block ${
                                item.certificado === 'N/A' || item.certificado === 'Retorno' ? 'bg-slate-100 text-slate-600 border-slate-300' :
                                item.certificado !== 'Pendiente' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                                'bg-amber-100 text-amber-700 border-amber-200'
                             }`}>
                               {item.certificado}
                             </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] z-30">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
             <div className="bg-slate-100 rounded-lg p-2 flex items-center gap-3 border border-slate-200 flex-1 md:flex-none">
                <div className="bg-white p-1.5 rounded shadow-sm">
                   <CheckCircle2 className={`w-5 h-5 ${seleccionadosCount > 0 ? 'text-blue-600' : 'text-slate-300'}`} />
                </div>
                <div>
                   <p className="text-xs text-slate-500 uppercase font-bold">Seleccionados</p>
                   <p className="text-sm font-bold text-slate-800">{seleccionadosCount} Equipos</p>
                </div>
             </div>
             
             {seleccionadosCount > 0 && (
                <div className="hidden md:block">
                  <p className="text-xs text-slate-400">Cliente Destino:</p>
                  <p className="text-sm font-bold text-blue-700">{clienteSeleccionado}</p>
                </div>
             )}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
             <button onClick={handleAddManual} disabled={seleccionadosCount === 0} className={`flex-1 md:flex-none px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-colors ${seleccionadosCount > 0 ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'}`}>
               <Plus className="w-4 h-4" />
               <span>Agregar Manual</span>
             </button>

             <button onClick={handleConfirmarSalida} disabled={seleccionadosCount === 0 || !customFolio} className={`flex-[2] md:flex-none px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${seleccionadosCount > 0 && customFolio ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
               {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
               <span>CONFIRMAR SALIDA</span>
             </button>
          </div>
        </div>
      </div>

      {showManualModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all scale-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-6 h-6 text-blue-600" />
                Agregar Item Extra
              </h3>
              <button onClick={() => setShowManualModal(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 text-blue-800 text-sm rounded-xl border border-blue-100 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Modo Manual</p>
                  <p className="opacity-90 mt-1">Este ítem se agregará a la lista del cliente <strong>{clienteSeleccionado}</strong>. Úsalo para retornos, etiquetas, o equipos sin registro.</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descripción *</label>
                <input className="w-full border border-slate-300 rounded-lg p-2.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej. Paquete de Etiquetas..." value={manualForm.descripcion} onChange={e => setManualForm({...manualForm, descripcion: e.target.value})} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Marca</label>
                   <input className="w-full border border-slate-300 rounded-lg p-2.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="N/A" value={manualForm.marca} onChange={e => setManualForm({...manualForm, marca: e.target.value})} />
                </div>
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Modelo</label>
                   <input className="w-full border border-slate-300 rounded-lg p-2.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="N/A" value={manualForm.modelo} onChange={e => setManualForm({...manualForm, modelo: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Serie / ID</label>
                   <input className="w-full border border-slate-300 rounded-lg p-2.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="N/A" value={manualForm.serie} onChange={e => setManualForm({...manualForm, serie: e.target.value})} />
                </div>
                <div>
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Certificado</label>
                   <input className="w-full border border-slate-300 rounded-lg p-2.5 text-sm mt-1 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Retorno / N/A" value={manualForm.certificado} onChange={e => setManualForm({...manualForm, certificado: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button onClick={() => setShowManualModal(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={saveManualItem} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">Guardar Ítem</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EntradaSalidaScreen;