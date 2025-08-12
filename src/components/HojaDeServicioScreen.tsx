import React, { useRef, useState } from 'react';
import { Download, FileText, User, Calendar, Phone, Mail, MapPin, Settings, MessageSquare, Star, Edit3, Save, X, ArrowLeft } from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';

const camposIniciales = {
  folio: '',
  fecha: '',
  empresa: '',
  direccion: '',
  contacto: '',
  telefono: '',
  correo: '',
  equipos: '',
  comentarios: '',
  calidadServicio: 'Excelente',
  tecnicoResponsable: '',
};

export default function HojaDeServicioPro() {
  const [campos, setCampos] = useState(camposIniciales);
  const [firmaCliente, setFirmaCliente] = useState('');
  const [firmaTecnico, setFirmaTecnico] = useState('');
  const [firmando, setFirmando] = useState<'cliente' | 'tecnico' | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { goBack } = useNavigation();

  // -------- Funciones de firma ---------
  const comenzarFirma = (tipo: 'cliente' | 'tecnico') => {
    setFirmando(tipo);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
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

  const limpiarFirma = (tipo: 'cliente' | 'tecnico') => {
    if (tipo === 'cliente') setFirmaCliente('');
    if (tipo === 'tecnico') setFirmaTecnico('');
  };

  // Funciones de dibujo
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

  const handlePointerUp = () => {
    isDrawing = false;
  };

  // -------- Generar PDF ---------
  const generarPDF = async () => {
    if (!pdfRef.current) return;
    
    try {
      // Importar dinámicamente html2canvas y jsPDF
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      
      const input = pdfRef.current;
      const canvas = await html2canvas(input, { 
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`HojaServicio_${campos.folio || new Date().getTime()}.pdf`);
      
      // Notificación de éxito
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse';
      notification.textContent = '¡PDF generado exitosamente!';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('Error al generar el PDF. Por favor intente nuevamente.');
    }
  };

  const toggleVistaPrevia = () => {
    setVistaPrevia(!vistaPrevia);
  };

  if (vistaPrevia) {
    return (
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-full mx-auto px-2 sm:px-4">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4">
              <div className="flex flex-col sm:flex-row justify-between items-center">
                {/* Botón de regresar */}
                <button
                  onClick={() => goBack()}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors mb-2 sm:mb-0"
                >
                  <ArrowLeft size={18} />
                  Regresar
                </button>

                <h1 className="text-2xl font-bold">Vista Previa - Hoja de Servicio</h1>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={generarPDF}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Download size={18} />
                    Descargar PDF
                  </button>
                  <button
                    onClick={toggleVistaPrevia}
                    className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Edit3 size={18} />
                    Editar
                  </button>
                </div>
              </div>
            </div>

            {/* Plantilla para PDF */}
            <div ref={pdfRef} className="w-full bg-white text-black">
              <div className="p-4 sm:p-8 max-w-[800px] mx-auto">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="border-2 border-black p-4 mb-4">
                    <h1 className="text-2xl font-bold mb-2">HOJA DE SERVICIO</h1>
                    <div className="flex flex-col sm:flex-row justify-between text-sm">
                      <span><strong>Folio:</strong> {campos.folio || '[Sin folio]'}</span>
                      <span><strong>Fecha:</strong> {campos.fecha || '[Sin fecha]'}</span>
                    </div>
                  </div>
                </div>

                {/* Información de la empresa */}
                <div className="border-2 border-black mb-6">
                  <div className="bg-gray-200 p-3 text-center">
                    <div className="w-16 h-12 bg-blue-600 mx-auto mb-2 rounded flex items-center justify-center">
                      <span className="text-white font-bold text-xs">LOGO</span>
                    </div>
                    <h2 className="font-bold text-lg">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h2>
                    <p className="text-sm italic">Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, Nuevo León, México, C.P. 66422</p>
                    <p className="text-sm italic">Teléfonos: 8127116538/8127116357</p>
                  </div>
                </div>

                {/* Información del cliente */}
                <div className="border-2 border-black mb-6 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p><strong>Planta:</strong> {campos.empresa || '[Sin especificar]'}</p>
                      <p><strong>Domicilio:</strong> {campos.direccion || '[Sin especificar]'}</p>
                      <p><strong>Contacto:</strong> {campos.contacto || '[Sin especificar]'}</p>
                    </div>
                    <div>
                      <p><strong>Teléfono:</strong> {campos.telefono || '[Sin especificar]'}</p>
                      <p><strong>Correo:</strong> {campos.correo || '[Sin especificar]'}</p>
                    </div>
                  </div>
                </div>

                {/* Equipos calibrados */}
                <div className="border-2 border-black mb-6 p-4">
                  <h3 className="font-bold underline mb-3">Se calibraron los siguientes equipos:</h3>
                  <div className="min-h-[100px] border border-gray-300 p-3 bg-gray-50">
                    <strong>ID:</strong>
                    <div className="mt-2 whitespace-pre-wrap">
                      {campos.equipos || '[No se especificaron equipos]'}
                    </div>
                  </div>
                </div>

                {/* Comentarios */}
                <div className="border-2 border-black mb-8 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <strong>Comentarios:</strong>
                      <div className="mt-2 min-h-[60px] whitespace-pre-wrap">
                        {campos.comentarios || '[Sin comentarios]'}
                      </div>
                    </div>
                    <div>
                      <strong>Calidad del Servicio:</strong>
                      <div className="mt-2 text-lg font-semibold text-blue-600">
                        {campos.calidadServicio}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mensaje de firma */}
                <div className="text-center mb-6 p-3 bg-gray-100 border-2 border-black">
                  <strong>SE REQUIERE LA FIRMA DEL USUARIO Y EL PERSONAL PARA CONFIRMAR LA CONFORMIDAD DEL SERVICIO</strong>
                </div>

                {/* Firmas */}
                <div className="border-2 border-black p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="text-center">
                      <div className="border-b-2 border-black pb-4 mb-2 h-24 flex items-end justify-center">
                        {firmaTecnico ? (
                          <img src={firmaTecnico} alt="Firma técnico" className="max-h-20 max-w-full" />
                        ) : (
                          <span className="text-gray-400 text-sm">[Firma del técnico]</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <div className="border-b border-black mb-1 pb-1">
                          <strong>{campos.tecnicoResponsable || '[Nombre del técnico]'}</strong>
                        </div>
                        <strong>TÉCNICO RESPONSABLE</strong>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-b-2 border-black pb-4 mb-2 h-24 flex items-end justify-center">
                        {firmaCliente ? (
                          <img src={firmaCliente} alt="Firma cliente" className="max-h-20 max-w-full" />
                        ) : (
                          <span className="text-gray-400 text-sm">[Firma del usuario]</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <div className="border-b border-black mb-1 pb-1">
                          {campos.contacto || '[Nombre del usuario]'}
                        </div>
                        <strong>NOMBRE Y FIRMA DEL USUARIO</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>      
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 py-8 px-4">
      <div className="max-w-full mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                {/* Botón de regresar */}
                <button
                  onClick={() => goBack()}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors"
                >
                  <ArrowLeft size={18} />
                  Regresar
                </button>
                <div className="flex items-center gap-3">
                  <FileText className="text-white" size={32} />
                  <h1 className="text-3xl font-bold text-white">Hoja de Servicio Profesional</h1>
                </div>
              </div>
              <button
                onClick={toggleVistaPrevia}
                className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all duration-200 hover:scale-105"
              >
                <FileText size={18} />
                Vista Previa
              </button>
            </div>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Formulario */}
              <div className="space-y-6">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <Settings className="text-blue-400" size={20} />
                    Información General
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block">Folio</label>
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.folio}
                        onChange={e => setCampos({ ...campos, folio: e.target.value })}
                        placeholder="Ej: 0001-2024"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <Calendar size={14} />
                        Fecha
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
                        <Star size={14} />
                        Calidad del Servicio
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

                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <User  className="text-green-400" size={20} />
                    Información del Cliente
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block">Empresa/Planta</label>
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.empresa}
                        onChange={e => setCampos({ ...campos, empresa: e.target.value })}
                        placeholder="Nombre de la empresa"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <MapPin size={14} />
                        Dirección
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.direccion}
                        onChange={e => setCampos({ ...campos, direccion: e.target.value })}
                        placeholder="Dirección completa"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-blue-300 mb-2 block">Contacto</label>
                        <input
                          type="text"
                          className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          value={campos.contacto}
                          onChange={e => setCampos({ ...campos, contacto: e.target.value })}
                          placeholder="Nombre del contacto"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                          <Phone size={14} />
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          value={campos.telefono}
                          onChange={e => setCampos({ ...campos, telefono: e.target.value })}
                          placeholder="Número de teléfono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <Mail size={14} />
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={campos.correo}
                        onChange={e => setCampos({ ...campos, correo: e.target.value })}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                  <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                    <Settings className="text-purple-400" size={20} />
                    Detalles del Servicio
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block">Equipos Calibrados (ID)</label>
                      <textarea
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                        value={campos.equipos}
                        onChange={e => setCampos({ ...campos, equipos: e.target.value })}
                        rows={3}
                        placeholder="Ej: BAL-001, MUL-002, MAN-003..."
                      />
                    </div>
                    <div>
                      <label className="text-sm text-blue-300 mb-2 block flex items-center gap-1">
                        <MessageSquare size={14} />
                        Comentarios
                      </label>
                      <textarea
                        className="w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                        value={campos.comentarios}
                        onChange={e => setCampos({ ...campos, comentarios: e.target.value })}
                        rows={3}
                        placeholder="Observaciones, comentarios adicionales, incidencias..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección de Firmas */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-white/10 to-white/5 rounded-2xl p-6 border border-white/20">
                  <h2 className="text-xl font-semibold text-white mb-6 text-center">Firmas de Conformidad</h2>
                  
                  <div className="space-y-8">
                    {/* Firma del Cliente */}
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                      <h3 className="text-lg font-medium text-blue-300 mb-4 text-center">Firma del Cliente</h3>
                      <div className="flex flex-col items-center space-y-4">
                        {firmaCliente ? (
                          <div className="relative">
                            <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
                              <img src={firmaCliente} alt="Firma cliente" className="max-h-24 max-w-full" />
                            </div>
                            <button
                              onClick={() => limpiarFirma('cliente')}
                              className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-24 border-2 border-dashed border-blue-300 rounded-lg flex items-center justify-center">
                            <span className="text-blue-300 text-sm">No hay firma</span>
                          </div>
                        )}
                        <button
                          onClick={() => comenzarFirma('cliente')}
                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2"
                        >
                          <Edit3 size={18} />
                          {firmaCliente ? 'Cambiar Firma' : 'Firmar'}
                        </button>
                      </div>
                    </div>

                    {/* Firma del Técnico */}
                    <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                      <h3 className="text-lg font-medium text-green-300 mb-4 text-center">Firma del Técnico</h3>
                      <div className="flex flex-col items-center space-y-4">
                        {firmaTecnico ? (
                          <div className="relative">
                            <div className="bg-white rounded-lg p-4 border-2 border-green-300">
                              <img src={firmaTecnico} alt="Firma técnico" className="max-h-24 max-w-full" />
                            </div>
                            <button
                              onClick={() => limpiarFirma('tecnico')}
                              className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-24 border-2 border-dashed border-green-300 rounded-lg flex items-center justify-center">
                            <span className="text-green-300 text-sm">No hay firma</span>
                          </div>
                        )}
                        <button
                          onClick={() => comenzarFirma('tecnico')}
                          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2"
                        >
                          <Edit3 size={18} />
                          {firmaTecnico ? 'Cambiar Firma' : 'Firmar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={toggleVistaPrevia}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-4 rounded-xl font-bold shadow-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <FileText size={20} />
                    Ver Vista Previa
                  </button>
                  <button
                    onClick={generarPDF}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white px-6 py-4 rounded-xl font-bold shadow-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <Download size={20} />
                    Generar PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de firma */}
      {firmando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
                Firma {firmando === 'cliente' ? 'del Cliente' : 'del Técnico'}
              </h2>
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={200}
                  className="w-full border-2 border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
                  style={{ touchAction: 'none' }}
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                />
                <p className="text-sm text-gray-500 text-center mt-2">
                  Dibuje su firma en el área blanca
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={guardarFirma}
                  className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-6 py-3 rounded-xl font-bold transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  Guardar Firma
                </button>
                <button
                  onClick={() => setFirmando(null)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-bold transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
