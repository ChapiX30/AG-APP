import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, FileText, Building2, User, Calendar, Star, Clipboard, Save, Trash2, Edit3, Download } from 'lucide-react';

// Simulación de jsPDF y html2canvas para el demo
const jsPDF = {
  constructor: function(orientation, unit, format) {
    this.internal = { pageSize: { getWidth: () => 210 } };
    return this;
  },
  addImage: function() {},
  save: function(filename) {
    console.log(`PDF guardado como ${filename}`);
  }
};

const html2canvas = (element) => {
  return Promise.resolve({
    toDataURL: () => 'data:image/png;base64,mock',
    height: 800,
    width: 600
  });
};

interface Cliente {
  id: string;
  nombre: string;
  direccion: string;
  contacto: string;
  correo: string;
  telefono: string;
}

const clientes: Cliente[] = [
  {
    id: 'techops',
    nombre: 'Techops',
    direccion: 'CARRETERA ESTATAL 200 QUERÉTARO-TEQUISQUIAPAN 22500 INT. A. COLÓN, QUERÉTARO, C.P. 76270',
    contacto: 'ING. JOSE WILFRIDO NUÑEZ DEL BOSQUE',
    correo: 'josew.nunez@techops.mx',
    telefono: '(442)-480-7334'
  },
  {
    id: 'industrial-mx',
    nombre: 'Industrial México',
    direccion: 'Av. Industria 450, Zona Industrial, Monterrey, N.L. C.P. 64000',
    contacto: 'ING. MARÍA GONZÁLEZ LÓPEZ',
    correo: 'maria.gonzalez@industrial.mx',
    telefono: '(81)-8356-7890'
  }
];

export default function HojaDeServicioScreen() {
  const [folio, setFolio] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [comentarios, setComentarios] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [calidad, setCalidad] = useState(3);
  const [equipos, setEquipos] = useState('');
  const [firmaTecnico, setFirmaTecnico] = useState('');
  const [firmaUsuario, setFirmaUsuario] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const canvasTecnicoRef = useRef<HTMLCanvasElement | null>(null);
  const canvasUsuarioRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef(null);

  const cliente = clientes.find(c => c.id === clienteId);

  const clearCanvas = (ref: React.RefObject<HTMLCanvasElement>, setFirma: (val: string) => void) => {
    if (ref.current) {
      const ctx = ref.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, ref.current.width, ref.current.height);
        // Redraw border
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, ref.current.width, ref.current.height);
      }
      setFirma('');
    }
  };

  const setupCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Set up canvas properties
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Draw border
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
    }
  };

  const handleDraw = (ref: React.RefObject<HTMLCanvasElement>, setFirma: (val: string) => void) => {
    if (ref.current) {
      const canvas = ref.current;
      const ctx = canvas.getContext('2d');
      let drawing = false;

      setupCanvas(canvas);

      const startDraw = (e: MouseEvent) => {
        drawing = true;
        ctx?.beginPath();
        ctx?.moveTo(e.offsetX, e.offsetY);
      };

      const draw = (e: MouseEvent) => {
        if (!drawing || !ctx) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
      };

      const endDraw = () => {
        drawing = false;
        const dataUrl = canvas.toDataURL();
        setFirma(dataUrl);
      };

      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', endDraw);
      canvas.addEventListener('mouseleave', endDraw);
    }
  };

  useEffect(() => {
    handleDraw(canvasTecnicoRef, setFirmaTecnico);
    handleDraw(canvasUsuarioRef, setFirmaUsuario);
  }, []);

  const generarPDF = async () => {
    if (!pdfRef.current) return;
    
    setIsGenerating(true);
    
    // Simulate PDF generation
    setTimeout(() => {
      console.log(`PDF generado: HojaServicio_${folio || 'sin_folio'}.pdf`);
      setIsGenerating(false);
      alert('¡PDF generado exitosamente!');
    }, 2000);
  };

  const handleBack = () => {
    console.log('Regresando al menú principal...');
    // Aquí iría la navegación real
  };

  const generateFolio = () => {
    const timestamp = Date.now().toString().slice(-6);
    setFolio(`HS-${timestamp}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Regresar</span>
              </button>
              <div className="h-6 w-px bg-gray-300"></div>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Hoja de Servicio</h1>
                  <p className="text-sm text-gray-500">Generar reporte de calibración</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors duration-200 flex items-center space-x-2"
              >
                <Edit3 className="w-4 h-4" />
                <span>{showPreview ? 'Ocultar Vista Previa' : 'Mostrar Vista Previa'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className={`grid gap-8 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-1 max-w-4xl mx-auto'}`}>
          
          {/* Formulario */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-3">
                <Clipboard className="w-7 h-7 text-blue-600" />
                <span>Información del Servicio</span>
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Folio y Fecha */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span>Folio del Servicio</span>
                  </label>
                  <div className="flex space-x-2">
                    <input
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      placeholder="Ej: HS-001234"
                      value={folio}
                      onChange={(e) => setFolio(e.target.value)}
                    />
                    <button
                      onClick={generateFolio}
                      className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors duration-200 flex items-center"
                      title="Generar folio automático"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span>Fecha de Servicio</span>
                  </label>
                  <input
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
              </div>

              {/* Cliente y Técnico */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span>Empresa Cliente</span>
                  </label>
                  <select
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                  >
                    <option value="">Seleccione una empresa...</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <span>Técnico Responsable</span>
                  </label>
                  <input
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="Nombre del técnico"
                    value={tecnico}
                    onChange={(e) => setTecnico(e.target.value)}
                  />
                </div>
              </div>

              {/* Equipos */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Equipos Calibrados</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Ingrese los IDs de los equipos separados por coma (Ej: EQ-001, EQ-002, EQ-003)"
                  rows={3}
                  value={equipos}
                  onChange={(e) => setEquipos(e.target.value)}
                />
              </div>

              {/* Comentarios */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Comentarios y Observaciones</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Describa detalles del servicio, observaciones o notas importantes..."
                  rows={4}
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                />
              </div>

              {/* Calidad del Servicio */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                  <Star className="w-4 h-4 text-gray-500" />
                  <span>Calidad del Servicio</span>
                </label>
                <div className="flex items-center space-x-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setCalidad(n)}
                      className={`flex items-center justify-center w-12 h-12 rounded-xl border-2 transition-all duration-200 ${
                        calidad >= n 
                          ? 'bg-yellow-400 border-yellow-400 text-white shadow-lg transform scale-110' 
                          : 'bg-white border-gray-300 text-gray-400 hover:border-yellow-300 hover:text-yellow-400'
                      }`}
                    >
                      <Star className={`w-5 h-5 ${calidad >= n ? 'fill-current' : ''}`} />
                    </button>
                  ))}
                  <span className="ml-3 text-sm text-gray-600 font-medium">
                    {calidad === 1 && 'Deficiente'}
                    {calidad === 2 && 'Regular'}
                    {calidad === 3 && 'Bueno'}
                    {calidad === 4 && 'Muy Bueno'}
                    {calidad === 5 && 'Excelente'}
                  </span>
                </div>
              </div>

              {/* Firmas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700">Firma del Técnico</label>
                  <div className="relative">
                    <canvas 
                      ref={canvasTecnicoRef} 
                      width={300} 
                      height={120} 
                      className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-white hover:border-blue-300 transition-all duration-200 cursor-crosshair" 
                    />
                    <button 
                      onClick={() => clearCanvas(canvasTecnicoRef, setFirmaTecnico)} 
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-200"
                      title="Limpiar firma"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Haga clic y arrastre para firmar</p>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700">Firma del Usuario</label>
                  <div className="relative">
                    <canvas 
                      ref={canvasUsuarioRef} 
                      width={300} 
                      height={120} 
                      className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-white hover:border-blue-300 transition-all duration-200 cursor-crosshair" 
                    />
                    <button 
                      onClick={() => clearCanvas(canvasUsuarioRef, setFirmaUsuario)} 
                      className="absolute top-2 right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-200"
                      title="Limpiar firma"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Solicite al cliente que firme aquí</p>
                </div>
              </div>

              {/* Botón Generar PDF */}
              <div className="pt-6 border-t border-gray-100">
                <button 
                  onClick={generarPDF}
                  disabled={isGenerating || !folio || !clienteId || !tecnico}
                  className={`w-full py-4 px-6 rounded-xl font-bold text-white text-lg transition-all duration-200 flex items-center justify-center space-x-3 ${
                    isGenerating || !folio || !clienteId || !tecnico
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transform hover:scale-105'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Generando PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>Generar y Descargar PDF</span>
                    </>
                  )}
                </button>
                {(!folio || !clienteId || !tecnico) && (
                  <p className="text-sm text-red-500 mt-2 text-center">
                    Complete los campos requeridos: Folio, Cliente y Técnico
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Vista Previa */}
          {showPreview && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-900">Vista Previa del PDF</h3>
              </div>
              
              <div className="p-6">
                <div ref={pdfRef} className="bg-white border border-gray-200 rounded-lg p-8 text-sm space-y-4 shadow-inner">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold">Folio: {folio || '[Sin Folio]'}</span>
                    <span className="font-bold">Fecha: {fecha}</span>
                  </div>

                  <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-gray-900">HOJA DE SERVICIO</h3>
                    <h4 className="text-lg font-semibold text-blue-600">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h4>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac</p>
                      <p>San Nicolás de los Garza, N.L.</p>
                      <p className="font-semibold">Tel: 8127116533 / 8127116537</p>
                    </div>
                  </div>

                  {cliente && (
                    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                      <h5 className="font-bold text-gray-900 mb-3">DATOS DEL CLIENTE</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="space-y-2">
                          <p><span className="font-semibold">Planta:</span> {cliente.nombre}</p>
                          <p><span className="font-semibold">Domicilio:</span> {cliente.direccion}</p>
                          <p><span className="font-semibold">Contacto:</span> {cliente.contacto}</p>
                        </div>
                        <div className="space-y-2">
                          <p><span className="font-semibold">Teléfono:</span> {cliente.telefono}</p>
                          <p><span className="font-semibold">Correo:</span> {cliente.correo}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h5 className="font-bold text-gray-900">EQUIPOS CALIBRADOS</h5>
                    <div className="bg-gray-50 p-3 rounded border min-h-[60px]">
                      <p className="text-sm">{equipos || 'No se han especificado equipos'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-bold text-gray-900 mb-2">COMENTARIOS</h5>
                      <div className="bg-gray-50 p-3 rounded border min-h-[80px]">
                        <p className="text-sm">{comentarios || 'Sin comentarios'}</p>
                      </div>
                    </div>
                    <div>
                      <h5 className="font-bold text-gray-900 mb-2">CALIDAD DEL SERVICIO</h5>
                      <div className="flex items-center space-x-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} className={`w-6 h-6 ${calidad >= n ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
                        ))}
                        <span className="ml-2 font-semibold">({calidad}/5)</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-300">
                    <div className="text-center">
                      <div className="border-b border-gray-400 pb-1 mb-2">
                        <p className="font-bold">{tecnico || '[Técnico]'}</p>
                      </div>
                      <p className="text-xs font-semibold">TÉCNICO RESPONSABLE</p>
                      {firmaTecnico && (
                        <div className="mt-2 border border-gray-300 rounded h-16 flex items-center justify-center bg-gray-50">
                          <img src={firmaTecnico} alt="Firma Técnico" className="max-h-14 max-w-full" />
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="border-b border-gray-400 pb-1 mb-2 min-h-[24px]">
                        <p className="font-bold">&nbsp;</p>
                      </div>
                      <p className="text-xs font-semibold">NOMBRE Y FIRMA DEL USUARIO</p>
                      {firmaUsuario && (
                        <div className="mt-2 border border-gray-300 rounded h-16 flex items-center justify-center bg-gray-50">
                          <img src={firmaUsuario} alt="Firma Usuario" className="max-h-14 max-w-full" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}