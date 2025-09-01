import React, { useEffect, useRef, useState } from 'react';
import {
  Download, FileText, User, Calendar, Phone, Mail, MapPin, Settings, MessageSquare, Star, Edit3, ArrowLeft, Building2, Loader2, Wrench, PlusCircle
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { collection, getDocs, query, where, doc, getDoc, orderBy, limit } from "firebase/firestore";

// ---- ESTADOS Y TIPOS ----
const camposIniciales = {
  folio: '',
  fecha: '',
  empresaId: '',
  empresa: '',
  direccion: '',
  contacto: '',
  telefono: '',
  correo: '',
  comentarios: '',
  calidadServicio: 'Excelente',
  tecnicoResponsable: '',
};

type Empresa = {
  id: string;
  nombre: string;
  direccion?: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
};

type EquipoCalibrado = {
  id?: string;
  tecnico?: string;
};

// ---- OBTENER LOGO BASE64 PARA PDF ----
async function getLogoBase64(): Promise<string | undefined> {
  try {
    const response = await fetch('/assets/lab_logo.png');
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

// --------- GENERADOR PDF PRO CON CLIENTE ENCUADRADO ---------
async function generarPDFFormal({
  campos,
  firmaTecnico,
  firmaCliente,
  equiposCalibrados,
}: {
  campos: any;
  firmaTecnico: string;
  firmaCliente: string;
  equiposCalibrados: Record<string, any[]>;
}) {
  const jsPDF = (await import('jspdf')).default;
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // LOGO
  try {
    const logoBase64 = await getLogoBase64();
    if (logoBase64) doc.addImage(logoBase64, 'PNG', 12, 8, 28, 15, undefined, 'FAST');
  } catch {}

  // HEADER
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.', 42, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422', 42, 19);
  doc.text('Teléfonos: 8127116538 / 8127116357', 42, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.text('HOJA DE SERVICIO', 105, 34, { align: 'center' });
  doc.setDrawColor(60, 105, 225);
  doc.setLineWidth(0.7);
  doc.line(15, 38, 195, 38);

  // RECTÁNGULO GRANDE PARA INFO DEL CLIENTE
  const startY = 42;
  const boxHeight = 35;
  doc.setDrawColor(60, 105, 225);
  doc.setLineWidth(1);
  doc.roundedRect(17, startY, 176, boxHeight, 4, 4, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Folio: ${campos.folio || '__________'}`, 21, startY + 7);
  doc.text(`Fecha: ${campos.fecha || '__________'}`, 145, startY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Planta: ${campos.empresa || '____________________'}`, 21, startY + 14);
  doc.text(`Domicilio: ${campos.direccion || '____________________'}`, 21, startY + 21);
  doc.text(`Contacto: ${campos.contacto || '____________________'}`, 21, startY + 28);
  doc.text(`Teléfono: ${campos.telefono || '____________________'}`, 100, startY + 28);
  doc.text(`Correo: ${campos.correo || '____________________'}`, 21, startY + 35);

  // TABLA DE EQUIPOS
  let equiposY = startY + boxHeight + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.2);
  doc.text('Se calibraron los siguientes equipos:', 18, equiposY);

  equiposY += 3;
  if (Object.keys(equiposCalibrados).length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.2);
    doc.text('No hay equipos calibrados registrados para este cliente y fecha.', 18, equiposY + 6);
  } else {
    Object.entries(equiposCalibrados).forEach(([tecnico, equipos], idx) => {
      equiposY += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.8);
      doc.setTextColor(49, 113, 196);
      doc.text(`${tecnico}`, 20, equiposY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      equipos.forEach((equipo: any) => {
        if (!equipo.id) return;
        equipo.id.split(',').forEach((idSingle: string) => {
          equiposY += 6;
          doc.text(`- ${idSingle.trim()}`, 27, equiposY);
        });
      });
    });
    doc.setTextColor(0, 0, 0);
  }

  // COMENTARIOS Y CALIDAD
  let comentariosY = equiposY + 15;
  autoTable(doc, {
    startY: comentariosY,
    theme: 'plain',
    styles: { fontSize: 10 },
    body: [
      [
        { content: 'Comentarios:', styles: { fontStyle: 'bold', textColor: [78, 99, 165] } },
        { content: campos.comentarios || '[Sin comentarios]', styles: { textColor: [66, 66, 66] } },
      ],
      [
        { content: 'Calidad del Servicio:', styles: { fontStyle: 'bold', textColor: [78, 99, 165] } },
        { content: campos.calidadServicio || '', styles: { fontStyle: 'bold', textColor: [13, 90, 250] } },
      ]
    ],
    margin: { left: 18, right: 18 },
    tableLineWidth: 0.2,
    tableLineColor: [70, 130, 250],
    cellPadding: 2,
  });

  // FIRMAS
  let firmasY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 18 : comentariosY + 22;
  doc.setLineWidth(0.4);
  doc.setDrawColor(30, 30, 30);
  doc.line(38, firmasY, 88, firmasY); // Técnico
  doc.line(122, firmasY, 172, firmasY); // Cliente

  try { if (firmaTecnico) doc.addImage(firmaTecnico, 'PNG', 44, firmasY - 16, 38, 14); } catch {}
  try { if (firmaCliente) doc.addImage(firmaCliente, 'PNG', 128, firmasY - 16, 38, 14); } catch {}

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(campos.tecnicoResponsable || '[Nombre del Técnico]', 63, firmasY + 7, { align: 'center' });
  doc.text(campos.contacto || '[Nombre del Usuario]', 147, firmasY + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('TÉCNICO RESPONSABLE', 63, firmasY + 13, { align: 'center' });
  doc.text('NOMBRE Y FIRMA DEL USUARIO', 147, firmasY + 13, { align: 'center' });

  doc.setTextColor(66, 105, 200);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.2);
  doc.text('SE REQUIERE LA FIRMA DEL USUARIO Y EL PERSONAL PARA CONFIRMAR LA CONFORMIDAD DEL SERVICIO', 105, firmasY + 22, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  doc.save(`HojaServicio_${campos.folio || new Date().getTime()}.pdf`);
}

// ----------- COMPONENTE PRINCIPAL ---------------
export default function HojaDeServicioScreen() {
  const [campos, setCampos] = useState(camposIniciales);
  const [firmaCliente, setFirmaCliente] = useState('');
  const [firmaTecnico, setFirmaTecnico] = useState('');
  const [firmando, setFirmando] = useState<'cliente' | 'tecnico' | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [equiposCalibrados, setEquiposCalibrados] = useState<Record<string, EquipoCalibrado[]>>({});
  const [loadingEquipos, setLoadingEquipos] = useState(false);
  const [searchEmpresa, setSearchEmpresa] = useState('');
  const [autoFolioLoading, setAutoFolioLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { goBack } = useNavigation();

  // --- OBTIENE EL SIGUIENTE FOLIO DISPONIBLE ---
  const generarFolio = async (setCampos: any, setAutoFolioLoading: any) => {
    setAutoFolioLoading(true);
    const q = query(
      collection(db, "hojasDeServicio"),
      orderBy("folioNum", "desc"),
      limit(1)
    );
    const qs = await getDocs(q);
    let ultimo = 0;
    qs.forEach(doc => {
      const f: any = doc.data();
      if (f.folio && typeof f.folio === 'string' && f.folio.startsWith('HSDG-')) {
      const num = parseInt(f.folio.replace('HSDG-', ''), 10);
      if (num > ultimo) ultimo = num;
      }
    });
    const nuevoNum = ultimo + 1;
    const nuevoFolio = `HSDG-${nuevoNum.toString().padStart(4, '0')}`;
    setCampos(c => ({ ...c, folio: nuevoFolio }));
    setAutoFolioLoading(false);
  };

  // --- CARGA EMPRESAS ---
  useEffect(() => {
    const fetchEmpresas = async () => {
      const q = query(collection(db, "clientes"));
      const qs = await getDocs(q);
      setEmpresas(qs.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Empresa)));
    };
    fetchEmpresas();
  }, []);

  // --- CARGA DATOS EMPRESA ---
  useEffect(() => {
    const loadDatosEmpresa = async () => {
      if (!campos.empresaId) return;
      const ref = doc(db, "clientes", campos.empresaId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data() as Empresa;
      setCampos(c => ({
        ...c,
        empresa: data.nombre,
        direccion: data.direccion || '',
        contacto: data.contacto || '',
        telefono: data.telefono || '',
        correo: data.correo || '',
      }));
    };
    loadDatosEmpresa();
  }, [campos.empresaId]);

  // --- CARGA EQUIPOS CALIBRADOS ---
  useEffect(() => {
    const fetchEquipos = async () => {
      setLoadingEquipos(true);
      setEquiposCalibrados({});
      if (!campos.empresa || !campos.fecha) {
        setLoadingEquipos(false);
        return;
      }
      const q = query(
        collection(db, "hojasDeTrabajo"),
        where("cliente", "==", campos.empresa),
        where("fecha", "==", campos.fecha)
      );
      const qs = await getDocs(q);
      const equiposPorTecnico: Record<string, EquipoCalibrado[]> = {};
      qs.forEach(doc => {
        const data = doc.data();
        if (data.lugarCalibracion && data.lugarCalibracion.toLowerCase().includes("sitio")) {
          const tecnico = data.tecnicoResponsable || data.tecnico || data.nombre || 'Sin Técnico';
          if (!equiposPorTecnico[tecnico]) equiposPorTecnico[tecnico] = [];
          equiposPorTecnico[tecnico].push({ id: data.id });
        }
      });
      setEquiposCalibrados(equiposPorTecnico);
      setLoadingEquipos(false);
    };
    fetchEquipos();
  }, [campos.empresa, campos.fecha]);

  // ---- FIRMAS (igual que antes) ----
  const comenzarFirma = (tipo: 'cliente' | 'tecnico') => {
    setFirmando(tipo);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, 10);
  };
  const guardarFirma = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL('image/png');
      if (firmando === 'cliente') setFirmaCliente(dataURL);
      if (firmando === 'tecnico') setFirmaTecnico(dataURL);
    }
    setFirmando(null);
  };
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  const handlePointerDown = (e: any) => {
    isDrawing = true;
    const rect = e.target.getBoundingClientRect();
    const scaleX = e.target.width / rect.width;
    const scaleY = e.target.height / rect.height;
    lastX = (e.touches ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX) * scaleX;
    lastY = (e.touches ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY) * scaleY;
  };
  const handlePointerMove = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.touches ? e.touches[0].clientX - rect.left : e.nativeEvent.offsetX) * scaleX;
    const y = (e.touches ? e.touches[0].clientY - rect.top : e.nativeEvent.offsetY) * scaleY;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastX = x;
    lastY = y;
  };
  const handlePointerUp = () => { isDrawing = false; };

  const handleDescargarPDF = async () => {
    await generarPDFFormal({
      campos,
      firmaTecnico,
      firmaCliente,
      equiposCalibrados,
    });
  };

  // ------------- UI PRINCIPAL -----------------
  if (vistaPrevia) {
    return (
      <div className="min-h-screen bg-gray-100 py-10 px-4">
        <div className="max-w-[900px] mx-auto bg-white shadow-2xl border border-gray-300 rounded-xl overflow-hidden text-black">
          <div className="p-6 border-b border-black text-center">
            <div className="flex flex-col items-center">
              <img src="/assets/lab_logo.png" alt="Logo" className="h-16 mb-2" />
              <h1 className="text-xl font-bold uppercase">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h1>
              <p className="text-sm italic">
                Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422
              </p>
              <p className="text-sm italic">Teléfonos: 8127116538 / 8127116357</p>
            </div>
          </div>
          <div className="p-6 text-center border-b border-black">
            <h2 className="text-2xl font-bold underline mb-2">HOJA DE SERVICIO</h2>
            <div className="flex justify-between text-sm font-semibold max-w-[650px] mx-auto">
              <span>Folio: {campos.folio || '__________'}</span>
              <span>Fecha: {campos.fecha || '__________'}</span>
            </div>
          </div>
          {/* Info Cliente ENCUADRADA */}
          <div className="p-6 border-b border-black flex justify-center">
            <div className="w-full max-w-[600px] rounded-xl border-2 border-blue-600 bg-blue-50 p-6 shadow-md space-y-2">
              <div><strong>Planta:</strong> {campos.empresa || '____________________'}</div>
              <div><strong>Domicilio:</strong> {campos.direccion || '____________________'}</div>
              <div className="flex justify-between">
                <span><strong>Contacto:</strong> {campos.contacto || '____________________'}</span>
                <span><strong>Teléfono:</strong> {campos.telefono || '____________________'}</span>
              </div>
              <div><strong>Correo:</strong> {campos.correo || '____________________'}</div>
            </div>
          </div>
          {/* Equipos calibrados agrupados */}
          <div className="p-6 border-b border-black">
            <h3 className="font-bold underline mb-2">Se calibraron los siguientes equipos:</h3>
            <div className="min-h-[100px] border border-gray-400 p-3 bg-gray-50 whitespace-pre-wrap">
              {loadingEquipos ? (
                <span className="text-blue-600">Cargando equipos calibrados...</span>
              ) : (
                Object.keys(equiposCalibrados).length === 0
                  ? <span className="italic text-gray-400">No hay equipos calibrados registrados para este cliente y fecha.</span>
                  : Object.entries(equiposCalibrados).map(([tecnico, equipos]) => (
                    <div key={tecnico} className="mb-3">
                      <div className="font-bold text-blue-700 underline mb-1">{tecnico}</div>
                      <ul className="list-disc pl-6 text-sm">
                        {equipos.map((equipo, idx) =>
                          equipo.id
                            ? equipo.id.split(',').map((idSingle, idIdx) =>
                              <li key={idIdx}>{idSingle.trim()}</li>
                            )
                            : null
                        )}
                      </ul>
                    </div>
                  ))
              )}
            </div>
          </div>
          {/* Comentarios/calidad */}
          <div className="p-6 border-b border-black grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <div>
              <strong>Comentarios:</strong>
              <div className="mt-2 min-h-[60px] bg-gray-50 border border-gray-400 p-2 whitespace-pre-wrap">
                {campos.comentarios || '[Sin comentarios]'}
              </div>
            </div>
            <div>
              <strong>Calidad del Servicio:</strong>
              <div className="mt-2 text-lg font-semibold text-blue-700">
                {campos.calidadServicio}
              </div>
            </div>
          </div>
          <div className="text-center text-sm font-semibold p-4 border-b border-black bg-gray-100">
            SE REQUIERE LA FIRMA DEL USUARIO Y EL PERSONAL PARA CONFIRMAR LA CONFORMIDAD DEL SERVICIO
          </div>
          {/* Firmas */}
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-8 text-sm">
            <div className="text-center">
              <div className="border-b-2 border-black h-24 flex items-end justify-center mb-2">
                {firmaTecnico ? (
                  <img src={firmaTecnico} alt="Firma técnico" className="max-h-20 max-w-full" />
                ) : (
                  <span className="text-gray-400">[Firma del técnico]</span>
                )}
              </div>
              <div className="border-b border-black mb-1 pb-1">
                <strong>{campos.tecnicoResponsable || '[Nombre del técnico]'}</strong>
              </div>
              <strong>TÉCNICO RESPONSABLE</strong>
            </div>
            <div className="text-center">
              <div className="border-b-2 border-black h-24 flex items-end justify-center mb-2">
                {firmaCliente ? (
                  <img src={firmaCliente} alt="Firma cliente" className="max-h-20 max-w-full" />
                ) : (
                  <span className="text-gray-400">[Firma del cliente]</span>
                )}
              </div>
              <div className="border-b border-black mb-1 pb-1">
                <strong>{campos.contacto || '[Nombre del usuario]'}</strong>
              </div>
              <strong>NOMBRE Y FIRMA DEL USUARIO</strong>
            </div>
          </div>
          {/* Botones */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-gray-300 bg-gray-50">
            <button onClick={() => goBack()} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md flex items-center gap-2">
              <ArrowLeft size={16} /> Regresar
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleDescargarPDF}
                className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-md flex items-center gap-2 font-bold"
              >
                <Download size={16} /> Regenerar PDF
              </button>
              <button onClick={() => setVistaPrevia(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
                <Edit3 size={16} /> Editar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ----------- FORMULARIO NORMAL ---------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => goBack()}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors"
                >
                  <ArrowLeft size={18} /> Regresar
                </button>
                <div className="flex items-center gap-3">
                  <FileText className="text-white" size={32} />
                  <h1 className="text-3xl font-bold text-white">Hoja de Servicio Profesional</h1>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setVistaPrevia(true)}
                  className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all duration-200 hover:scale-105"
                >
                  <FileText size={18} /> Vista Previa
                </button>
                <button
                  onClick={handleDescargarPDF}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
                >
                  <Download size={16} /> Descargar PDF
                </button>
              </div>
            </div>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* FORMULARIO PRINCIPAL */}
              <div className="space-y-6">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <Settings className="text-blue-400" size={20} /> Información General
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                        value={campos.folio}
                        onChange={e => setCampos({ ...campos, folio: e.target.value })}
                        placeholder="Folio autogenerado"
                        readOnly
                      />
                      <button
                        type="button"
                        title="Generar folio"
                        onClick={generarFolio}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-800 rounded-full p-1"
                        disabled={autoFolioLoading}
                      >
                        <PlusCircle size={18} className="text-white" />
                      </button>
                      {autoFolioLoading && (
                        <Loader2 className="animate-spin text-blue-600 absolute right-8 top-1/2 -translate-y-1/2" size={18} />
                      )}
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <Calendar size={14} /> Fecha
                      </label>
                      <input
                        type="date"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.fecha}
                        onChange={e => setCampos({ ...campos, fecha: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block">Técnico Responsable</label>
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.tecnicoResponsable}
                        onChange={e => setCampos({ ...campos, tecnicoResponsable: e.target.value })}
                        placeholder="Nombre del técnico"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <Star size={14} /> Calidad del Servicio
                      </label>
                      <select
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.calidadServicio}
                        onChange={e => setCampos({ ...campos, calidadServicio: e.target.value })}
                      >
                        <option value="Excelente">Excelente</option>
                        <option value="Muy Bueno">Muy Bueno</option>
                        <option value="Bueno">Bueno</option>
                        <option value="Regular">Regular</option>
                      </select>
                    </div>
                  </div>
                </div>
                {/* Info Cliente ENCUADRADA */}
                <div className="rounded-2xl border-2 border-blue-600 bg-blue-50 p-6 shadow-md space-y-2">
                  <h2 className="text-xl font-semibold text-blue-900 mb-4 flex items-center gap-2">
                    <User className="text-green-400" size={20} /> Información del Cliente
                  </h2>
                  <div className="mb-4">
                    <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                      <Building2 size={14} /> Empresa/Planta
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl px-4 py-3 mb-2 bg-white/10 border border-white/20 text-blue-900 placeholder-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={searchEmpresa}
                      onChange={e => setSearchEmpresa(e.target.value)}
                      placeholder="Buscar empresa..."
                    />
                    <div className="relative">
                      <select
                        className="w-full rounded-xl px-4 py-3 bg-white/20 border border-white/20 text-blue-900"
                        value={campos.empresaId}
                        onChange={e => setCampos({ ...campos, empresaId: e.target.value })}
                      >
                        <option value="">Selecciona una empresa</option>
                        {empresas
                          .filter(emp =>
                            emp.nombre.toLowerCase().includes(searchEmpresa.toLowerCase())
                          )
                          .map(emp => (
                            <option value={emp.id} key={emp.id}>
                              {emp.nombre}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                      <MapPin size={14} /> Dirección
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-blue-900 placeholder-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={campos.direccion}
                      onChange={e => setCampos({ ...campos, direccion: e.target.value })}
                      placeholder="Dirección completa"
                      readOnly
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block">Contacto</label>
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-blue-900 placeholder-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.contacto}
                        onChange={e => setCampos({ ...campos, contacto: e.target.value })}
                        placeholder="Nombre del contacto"
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <Phone size={14} /> Teléfono
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-blue-900 placeholder-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.telefono}
                        onChange={e => setCampos({ ...campos, telefono: e.target.value })}
                        placeholder="Teléfono"
                        readOnly
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                      <Mail size={14} /> Correo electrónico
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-blue-900 placeholder-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={campos.correo}
                      onChange={e => setCampos({ ...campos, correo: e.target.value })}
                      placeholder="Correo"
                      readOnly
                    />
                  </div>
                </div>
                {/* Comentarios */}
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <MessageSquare className="text-yellow-400" size={20} /> Comentarios
                  </h2>
                  <textarea
                    className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all min-h-[80px]"
                    value={campos.comentarios}
                    onChange={e => setCampos({ ...campos, comentarios: e.target.value })}
                    placeholder="Observaciones, comentarios del cliente, etc."
                  />
                </div>
              </div>
              {/* VISTA EQUIPOS CALIBRADOS */}
              <div className="space-y-6">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 min-h-[350px]">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <Wrench className="text-orange-400" size={20} /> Equipos Calibrados en SITIO
                  </h2>
                  <div className="min-h-[160px] bg-white/10 rounded-xl border border-white/20 px-4 py-2 overflow-y-auto max-h-[330px]">
                    {loadingEquipos ? (
                      <div className="flex items-center gap-2 text-blue-200">
                        <span className="animate-spin"><Loader2 size={18} /></span>
                        Buscando equipos calibrados...
                      </div>
                    ) : Object.keys(equiposCalibrados).length === 0 ? (
                      <span className="italic text-white/60">Selecciona empresa y fecha para mostrar los equipos calibrados en sitio.</span>
                    ) : (
                      Object.entries(equiposCalibrados).map(([tecnico, equipos]) => (
                        <div key={tecnico} className="mb-3">
                          <div className="font-bold text-blue-400 underline mb-1">{tecnico}</div>
                          <ul className="list-disc pl-6 text-white text-sm">
                            {equipos.map((equipo, idx) =>
                              equipo.id
                                ? equipo.id.split(',').map((idSingle, idIdx) =>
                                  <li key={idIdx}>{idSingle.trim()}</li>
                                )
                                : null
                            )}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {/* FIRMAS */}
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <Edit3 className="text-pink-400" size={20} /> Firmas
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="text-white mb-1">Técnico Responsable</div>
                      {firmaTecnico ? (
                        <img src={firmaTecnico} alt="Firma técnico" className="h-16 bg-white rounded" />
                      ) : (
                        <button
                          onClick={() => comenzarFirma('tecnico')}
                          className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800"
                        >Firmar</button>
                      )}
                      {firmaTecnico &&
                        <button onClick={() => setFirmaTecnico('')} className="text-xs text-pink-300 mt-2">Borrar firma</button>
                      }
                    </div>
                    <div>
                      <div className="text-white mb-1">Cliente</div>
                      {firmaCliente ? (
                        <img src={firmaCliente} alt="Firma cliente" className="h-16 bg-white rounded" />
                      ) : (
                        <button
                          onClick={() => comenzarFirma('cliente')}
                          className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800"
                        >Firmar</button>
                      )}
                      {firmaCliente &&
                        <button onClick={() => setFirmaCliente('')} className="text-xs text-pink-300 mt-2">Borrar firma</button>
                      }
                    </div>
                  </div>
                  {firmando && (
                    <div className="fixed z-50 inset-0 bg-black/60 flex items-center justify-center">
                      <div className="bg-white rounded-xl p-6 shadow-2xl">
                        <div className="font-bold mb-2 text-black">Dibuja la firma del {firmando === "tecnico" ? "Técnico" : "Cliente"}:</div>
                        <canvas
                          ref={canvasRef}
                          width={350}
                          height={120}
                          className="border-2 border-black bg-white rounded-lg touch-none"
                          style={{ touchAction: "none" }}
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerLeave={handlePointerUp}
                          onTouchStart={handlePointerDown}
                          onTouchMove={handlePointerMove}
                          onTouchEnd={handlePointerUp}
                        />
                        <div className="flex justify-between mt-4 gap-2">
                          <button onClick={guardarFirma} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-800">Guardar Firma</button>
                          <button onClick={() => setFirmando(null)} className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Botones finales */}
            <div className="flex justify-end mt-8 gap-2">
              <button
                onClick={() => setVistaPrevia(true)}
                className="bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-blue-800"
              >
                <FileText size={18} /> Vista previa y PDF
              </button>
              <button
                onClick={handleDescargarPDF}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2"
              >
                <Download size={16} /> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
