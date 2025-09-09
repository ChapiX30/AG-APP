import React, { useEffect, useRef, useState } from 'react';
import {
  Download, FileText, User, Calendar, Phone, Mail, MapPin, Settings, 
  MessageSquare, Star, Edit3, ArrowLeft, Building2, Loader2, Wrench, PlusCircle
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

// ---- OBTENER LOGO BASE64 MEJORADO ----
async function getLogoBase64(): Promise<string | undefined> {
  const logoPaths = [
    '/assets/lab_logo.png',
    './assets/lab_logo.png',
    '/public/assets/lab_logo.png',
    '/src/assets/lab_logo.png',
    '/lab_logo.png',
    './lab_logo.png',
    '../assets/lab_logo.png',
    '../../assets/lab_logo.png',
    './public/assets/lab_logo.png'
  ];
  
  console.log('🔍 Buscando logo en las siguientes rutas:');
  
  for (const path of logoPaths) {
    try {
      console.log(`Intentando: ${path}`);
      const response = await fetch(path);
      
      if (response.ok) {
        console.log(`✅ Logo encontrado en: ${path}`);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return base64;
      } else {
        console.log(`❌ No encontrado en: ${path} (${response.status})`);
      }
    } catch (error) {
      console.log(`❌ Error en ${path}:`, error);
    }
  }
  
  console.log('⚠️ Logo no encontrado en ninguna ruta, usando logo de respaldo');
  return undefined;
}

// ---- UTILIDAD PARA TRUNCAR TEXTO ----
function truncateText(text: string, maxLength: number): string {
  return text && text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text || '';
}

// ---- ORGANIZAR EQUIPOS EN COLUMNAS ----
function organizarEquiposEnColumnas(equiposCalibrados: Record<string, any[]>, maxItemsPerColumn: number = 8) {
  const allEquipos: Array<{tecnico: string, equipo: string}> = [];
  
  Object.entries(equiposCalibrados).forEach(([tecnico, equipos]) => {
    equipos.forEach((equipo: any) => {
      if (equipo.id) {
        equipo.id.split(',').forEach((idSingle: string) => {
          allEquipos.push({ tecnico, equipo: idSingle.trim() });
        });
      }
    });
  });

  const columns: Array<Array<{tecnico: string, equipo: string}>> = [];
  for (let i = 0; i < allEquipos.length; i += maxItemsPerColumn) {
    columns.push(allEquipos.slice(i, i + maxItemsPerColumn));
  }
  
  return columns;
}

// --------- GENERADOR PDF PROFESIONAL MEJORADO ---------
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // CONFIGURACIÓN DE COLORES PROFESIONALES
  const azulPrimario = [41, 98, 183];
  const azulSecundario = [52, 144, 220];
  const grisTexto = [60, 60, 60];
  const grisClaro = [240, 242, 247];

  console.log('📄 Generando PDF...');

  // ===== HEADER PROFESIONAL =====
  // Fondo del header
  doc.setFillColor(...grisClaro);
  doc.rect(0, 0, 210, 32, 'F');
  
  // Línea decorativa superior
  doc.setFillColor(...azulPrimario);
  doc.rect(0, 0, 210, 3, 'F');

  // LOGO MEJORADO CON DEBUGGING
  try {
    console.log('🖼️ Intentando cargar logo...');
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      console.log('✅ Logo cargado correctamente, insertando en PDF...');
      doc.addImage(logoBase64, 'PNG', 15, 6, 25, 20, undefined, 'FAST');
      console.log('✅ Logo insertado en PDF');
    } else {
      console.log('⚠️ Usando logo de respaldo...');
      // Logo alternativo más profesional
      doc.setFillColor(...azulPrimario);
      doc.circle(27.5, 16, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('LOGO', 27.5, 19, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  } catch (error) {
    console.error('❌ Error con logo:', error);
    // Logo de respaldo
    doc.setFillColor(...azulPrimario);
    doc.circle(27.5, 16, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('LOGO', 27.5, 19, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // INFORMACIÓN DE LA EMPRESA (MÁS AMPLIA)
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.', 45, 11);
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  // Dirección más amplia a lo largo del encabezado
  doc.text('Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422', 45, 16);
  doc.text('Teléfonos: 8127116538 / 8127116357', 45, 21);

  // TÍTULO PRINCIPAL
  doc.setFillColor(...azulPrimario);
  doc.rect(0, 34, 210, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HOJA DE SERVICIO TÉCNICO', 105, 42, { align: 'center' });

  // ===== INFORMACIÓN GENERAL (COMPACTA) =====
  let currentY = 50;
  
  // Fondo para info general
  doc.setFillColor(...grisClaro);
  doc.roundedRect(10, currentY, 190, 15, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 15, 2, 2, 'S');

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  // Primera fila - Folio, Fecha y Técnico
  doc.text('FOLIO:', 15, currentY + 6);
  doc.text('FECHA:', 80, currentY + 6);
  doc.text('TÉCNICO:', 140, currentY + 6);
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(campos.folio || '__________', 30, currentY + 6);
  doc.text(campos.fecha || '__________', 95, currentY + 6);
  doc.text(truncateText(campos.tecnicoResponsable, 20), 160, currentY + 6);

  currentY += 19;

  // ===== INFORMACIÓN DEL CLIENTE (COMO EN LA IMAGEN) =====
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, currentY, 190, 25, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 25, 2, 2, 'S');

  // Línea divisoria vertical en el medio
  doc.setDrawColor(...azulSecundario);
  doc.line(105, currentY, 105, currentY + 25);

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  
  // LADO IZQUIERDO: Cliente, Domicilio, Contacto
  doc.text('Planta:', 15, currentY + 6);
  doc.text('Domicilio:', 15, currentY + 13);
  doc.text('Contacto:', 15, currentY + 20);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(truncateText(campos.empresa, 25), 30, currentY + 6);
  doc.text(truncateText(campos.direccion, 25), 35, currentY + 13);
  doc.text(truncateText(campos.contacto, 20), 30, currentY + 20);

  // LADO DERECHO: Teléfono y Correo
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono:', 110, currentY + 6);
  doc.text('Correo:', 110, currentY + 13);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(truncateText(campos.telefono, 25), 125, currentY + 6);
  doc.text(truncateText(campos.correo, 25), 120, currentY + 13);

  currentY += 29;

  // ===== EQUIPOS CALIBRADOS EN SITIO (RECUADRO COMPLETO) =====
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EQUIPOS CALIBRADOS EN SITIO', 15, currentY);
  currentY += 4;

  // RECUADRO COMPLETO SIEMPRE (altura fija)
  const equiposBoxHeight = 50; // Altura fija para que siempre se vea completo
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, currentY, 190, equiposBoxHeight, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, currentY, 190, equiposBoxHeight, 2, 2, 'S');

  if (Object.keys(equiposCalibrados).length === 0) {
    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('No se registraron equipos calibrados para este cliente y fecha.', 105, currentY + 25, { align: 'center' });
  } else {
    // Organizar equipos en columnas
    const columnasEquipos = organizarEquiposEnColumnas(equiposCalibrados, 8);
    const columnsPerRow = Math.min(3, columnasEquipos.length);
    const columnWidth = 190 / columnsPerRow;

    columnasEquipos.forEach((columna, colIndex) => {
      const startX = 15 + (colIndex * columnWidth);
      let yPos = currentY + 5;
      
      let currentTecnico = '';
      
      columna.forEach((item, itemIndex) => {
        if (item.tecnico !== currentTecnico) {
          currentTecnico = item.tecnico;
          doc.setTextColor(...azulPrimario);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(`${item.tecnico}:`, startX, yPos);
          yPos += 3;
        }
        
        doc.setTextColor(...grisTexto);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const equipoTexto = truncateText(item.equipo, Math.floor(columnWidth/3));
        doc.text(`• ${equipoTexto}`, startX + 2, yPos);
        yPos += 3;
      });
    });
  }
  
  currentY += equiposBoxHeight + 4;

  // ===== COMENTARIOS (MÁS COMPACTOS) =====
  if (campos.comentarios && campos.comentarios.trim()) {
    doc.setTextColor(...azulPrimario);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBSERVACIONES:', 15, currentY);
    currentY += 5;
    
    doc.setFillColor(...grisClaro);
    doc.roundedRect(10, currentY, 190, 12, 2, 2, 'F');
    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    
    const comentarioLines = doc.splitTextToSize(campos.comentarios, 180);
    const maxLines = 2;
    const linesToShow = comentarioLines.slice(0, maxLines);
    
    linesToShow.forEach((line: string, index: number) => {
      doc.text(line, 15, currentY + 4 + (index * 4));
    });
    
    currentY += 16;
  }

  // ===== CALIDAD DEL SERVICIO (ARRIBA DE LAS FIRMAS) =====
  // POSICIÓN FIJA PARA FIRMAS (cerca de la franja azul)
  const firmasFixedY = 245; // Posición fija cerca del final
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CALIDAD DEL SERVICIO:', 15, firmasFixedY - 8);
  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text(campos.calidadServicio, 70, firmasFixedY - 8);

  // ===== FIRMAS FIJAS EN LA PARTE INFERIOR =====
  // Fondo para sección de firmas
  doc.setFillColor(...grisClaro);
  doc.rect(10, firmasFixedY - 2, 190, 32, 'F');
  
  // Cajas para firmas
  const firmaWidth = 80;
  const firmaHeight = 20;
  
  // Firma del técnico
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(20, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'S');
  
  // Firma del cliente  
  doc.roundedRect(110, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.roundedRect(110, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'S');

  // Insertar firmas
  try {
    if (firmaTecnico) {
      doc.addImage(firmaTecnico, 'PNG', 25, firmasFixedY + 2, 70, 16);
    }
    if (firmaCliente) {
      doc.addImage(firmaCliente, 'PNG', 115, firmasFixedY + 2, 70, 16);
    }
  } catch (error) {
    console.error('Error al insertar firmas:', error);
  }

  // Etiquetas de firmas
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TÉCNICO RESPONSABLE', 60, firmasFixedY + 25, { align: 'center' });
  doc.text('CLIENTE AUTORIZADO', 150, firmasFixedY + 25, { align: 'center' });
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(truncateText(campos.tecnicoResponsable || '[Nombre del técnico]', 20), 60, firmasFixedY + 29, { align: 'center' });
  doc.text(truncateText(campos.contacto || '[Nombre del cliente]', 20), 150, firmasFixedY + 29, { align: 'center' });

  // Mensaje final profesional (FRANJA AZUL FIJA)
  doc.setFillColor(...azulPrimario);
  doc.rect(10, 280, 190, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE', 105, 284, { align: 'center' });

  console.log('✅ PDF generado correctamente');
  
  // Guardar PDF
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // ---- FIRMAS ----
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

  // ------------- VISTA PREVIA ACTUALIZADA -----------------
  if (vistaPrevia) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Vista previa mejorada */}
          <div className="bg-white rounded-lg shadow-2xl p-8 mb-6" style={{ aspectRatio: '210/297' }}>
            {/* Header profesional con dirección amplia */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-t-lg mb-4 relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-800 rounded-t-lg"></div>
              
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">LOGO</span>
                </div>
                <div className="flex-1">
                  <h1 className="text-blue-800 font-bold text-lg">
                    EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.
                  </h1>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422<br/>
                    Teléfonos: 8127116538 / 8127116357
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-600 text-white text-center py-3 rounded-lg mb-6">
              <h2 className="text-xl font-bold">HOJA DE SERVICIO TÉCNICO</h2>
            </div>

            {/* Información general compacta */}
            <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><strong className="text-blue-700">FOLIO:</strong> {campos.folio || '__________'}</div>
                <div><strong className="text-blue-700">FECHA:</strong> {campos.fecha || '__________'}</div>
                <div><strong className="text-blue-700">TÉCNICO:</strong> {campos.tecnicoResponsable || '__________'}</div>
              </div>
            </div>

            {/* Info Cliente como en la imagen - dividida */}
            <div className="border border-blue-200 rounded-lg mb-4 bg-white overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-blue-200">
                {/* Lado izquierdo */}
                <div className="p-4 space-y-2">
                  <div className="text-sm"><strong className="text-blue-700">Planta:</strong> {truncateText(campos.empresa || '____________________', 25)}</div>
                  <div className="text-sm"><strong className="text-blue-700">Domicilio:</strong> {truncateText(campos.direccion || '____________________', 25)}</div>
                  <div className="text-sm"><strong className="text-blue-700">Contacto:</strong> {truncateText(campos.contacto || '__________', 25)}</div>
                </div>
                {/* Lado derecho */}
                <div className="p-4 space-y-2">
                  <div className="text-sm"><strong className="text-blue-700">Teléfono:</strong> {truncateText(campos.telefono || '__________', 25)}</div>
                  <div className="text-sm"><strong className="text-blue-700">Correo:</strong> {truncateText(campos.correo || '____________________', 25)}</div>
                </div>
              </div>
            </div>

            {/* Equipos en recuadro completo */}
            <div className="mb-4">
              <h3 className="text-blue-800 font-bold mb-2">EQUIPOS CALIBRADOS EN SITIO</h3>
              {/* Recuadro completo siempre visible */}
              <div className="bg-white border border-blue-200 rounded-lg p-4 h-32 overflow-y-auto">
                {loadingEquipos ? (
                  <div className="flex items-center gap-2 text-gray-500 h-full justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando equipos calibrados...
                  </div>
                ) : (
                  Object.keys(equiposCalibrados).length === 0 ? (
                    <div className="text-gray-500 italic h-full flex items-center justify-center">
                      No se registraron equipos calibrados para este cliente y fecha.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      {(() => {
                        const columns = organizarEquiposEnColumnas(equiposCalibrados, 6);
                        return columns.map((columna, colIndex) => (
                          <div key={colIndex} className="space-y-1">
                            {columna.map((item, itemIndex) => {
                              const prevItem = columna[itemIndex - 1];
                              const showTecnico = !prevItem || prevItem.tecnico !== item.tecnico;
                              return (
                                <div key={itemIndex}>
                                  {showTecnico && (
                                    <div className="font-bold text-blue-700 text-xs border-b border-blue-200 pb-1 mb-1">
                                      {item.tecnico}:
                                    </div>
                                  )}
                                  <div className="text-gray-700 ml-2">• {truncateText(item.equipo, 20)}</div>
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Comentarios compactos */}
            {campos.comentarios && campos.comentarios.trim() && (
              <div className="mb-4">
                <h4 className="text-blue-800 font-bold text-sm mb-1">OBSERVACIONES:</h4>
                <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">
                  {truncateText(campos.comentarios, 200)}
                </div>
              </div>
            )}

            {/* Espacio flexible para empujar firmas hacia abajo */}
            <div className="flex-grow"></div>

            {/* Calidad del servicio justo arriba de firmas */}
            <div className="mb-2">
              <div className="text-sm">
                <strong className="text-blue-700">CALIDAD DEL SERVICIO:</strong> 
                <span className="text-blue-600 font-bold ml-2">{campos.calidadServicio}</span>
              </div>
            </div>

            {/* Firmas FIJAS en la parte inferior */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <div className="bg-white border-2 border-dashed border-gray-300 h-16 rounded-lg flex items-center justify-center mb-2">
                    {firmaTecnico ? (
                      <img src={firmaTecnico} alt="Firma técnico" className="max-h-full max-w-full" />
                    ) : (
                      <span className="text-gray-400 text-sm">[Firma del técnico]</span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-blue-700">TÉCNICO RESPONSABLE</div>
                  <div className="text-xs text-gray-600">{campos.tecnicoResponsable || '[Nombre del técnico]'}</div>
                </div>

                <div className="text-center">
                  <div className="bg-white border-2 border-dashed border-gray-300 h-16 rounded-lg flex items-center justify-center mb-2">
                    {firmaCliente ? (
                      <img src={firmaCliente} alt="Firma cliente" className="max-h-full max-w-full" />
                    ) : (
                      <span className="text-gray-400 text-sm">[Firma del cliente]</span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-blue-700">CLIENTE AUTORIZADO</div>
                  <div className="text-xs text-gray-600">{campos.contacto || '[Nombre del cliente]'}</div>
                </div>
              </div>
              
              <div className="bg-blue-600 text-white text-center py-2 rounded-lg mt-4">
                <p className="text-xs font-bold">
                  DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE
                </p>
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => goBack()}
              className="bg-gray-200 hover:bg-gray-300 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Regresar
            </button>
            
            <button
              onClick={handleDescargarPDF}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar PDF Professional
            </button>
            
            <button
              onClick={() => setVistaPrevia(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Editar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------- FORMULARIO NORMAL (SIN CAMPOS EN BLANCO) ---------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-8 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => goBack()}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Regresar
            </button>
            
            <h1 className="text-2xl font-bold text-white text-center flex-1">
              Hoja de Servicio Profesional
            </h1>
            
            <div className="flex gap-3">
              <button
                onClick={() => setVistaPrevia(true)}
                className="bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all duration-200 hover:scale-105"
              >
                <FileText className="w-4 h-4" />
                Vista Previa
              </button>
              
              <button
                onClick={handleDescargarPDF}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all duration-200 hover:scale-105"
              >
                <Download className="w-4 h-4" />
                Descargar PDF
              </button>
            </div>
          </div>
        </div>

        {/* FORMULARIO PRINCIPAL */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8 space-y-8">
            {/* Información General */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-xl">
              <h2 className="text-xl font-bold text-blue-800 mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Información General
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Folio
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={campos.folio}
                      onChange={(e) => setCampos({ ...campos, folio: e.target.value })}
                      placeholder="Folio autogenerado"
                      readOnly
                    />
                    <button
                      onClick={() => generarFolio(setCampos, setAutoFolioLoading)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                    >
                      {autoFolioLoading && (
                        <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      )}
                      Auto
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={campos.fecha}
                    onChange={(e) => setCampos({ ...campos, fecha: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <User className="w-4 h-4 inline mr-1" />
                    Técnico Responsable
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={campos.tecnicoResponsable}
                    onChange={(e) => setCampos({ ...campos, tecnicoResponsable: e.target.value })}
                    placeholder="Nombre del técnico"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Star className="w-4 h-4 inline mr-1" />
                    Calidad del Servicio
                  </label>
                  <select
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={campos.calidadServicio}
                    onChange={(e) => setCampos({ ...campos, calidadServicio: e.target.value })}
                  >
                    <option value="Excelente">Excelente</option>
                    <option value="Muy Bueno">Muy Bueno</option>
                    <option value="Bueno">Bueno</option>
                    <option value="Regular">Regular</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Info Cliente SIN CAMPOS EN BLANCO */}
            <div className="border-2 border-blue-200 rounded-xl overflow-hidden bg-blue-50/50">
              <h2 className="text-xl font-bold text-blue-800 p-6 pb-0 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Información del Cliente
              </h2>

              <div className="p-6 pt-4">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Empresa/Planta
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                    value={searchEmpresa}
                    onChange={(e) => setSearchEmpresa(e.target.value)}
                    placeholder="Buscar empresa..."
                  />
                  <select
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={campos.empresaId}
                    onChange={(e) => setCampos({ ...campos, empresaId: e.target.value })}
                  >
                    <option value="">Selecciona una empresa</option>
                    {empresas
                      .filter(emp =>
                        emp.nombre.toLowerCase().includes(searchEmpresa.toLowerCase())
                      )
                      .map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nombre}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Diseño como en la imagen: izquierda y derecha - CAMPOS EDITABLES */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white p-6 rounded-lg border border-blue-200">
                  {/* Lado izquierdo */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MapPin className="w-4 h-4 inline mr-1" />
                        Domicilio
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={campos.direccion}
                        onChange={(e) => setCampos({ ...campos, direccion: e.target.value })}
                        placeholder="Dirección completa"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <User className="w-4 h-4 inline mr-1" />
                        Contacto
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={campos.contacto}
                        onChange={(e) => setCampos({ ...campos, contacto: e.target.value })}
                        placeholder="Nombre del contacto"
                      />
                    </div>
                  </div>

                  {/* Lado derecho */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Phone className="w-4 h-4 inline mr-1" />
                        Teléfono
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={campos.telefono}
                        onChange={(e) => setCampos({ ...campos, telefono: e.target.value })}
                        placeholder="Teléfono"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Mail className="w-4 h-4 inline mr-1" />
                        Correo electrónico
                      </label>
                      <input
                        type="email"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={campos.correo}
                        onChange={(e) => setCampos({ ...campos, correo: e.target.value })}
                        placeholder="Correo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Comentarios */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Comentarios
              </label>
              <textarea
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                value={campos.comentarios}
                onChange={(e) => setCampos({ ...campos, comentarios: e.target.value })}
                placeholder="Observaciones, comentarios del cliente, etc."
              />
            </div>

            {/* VISTA EQUIPOS CALIBRADOS CON RECUADRO COMPLETO */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-xl">
              <h2 className="text-xl font-bold text-green-800 mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Equipos Calibrados en SITIO
              </h2>
              
              {/* Recuadro completo siempre visible */}
              <div className="bg-white p-4 rounded-lg min-h-[200px] border border-green-200">
                {loadingEquipos ? (
                  <div className="flex items-center gap-2 text-gray-500 h-full justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Buscando equipos calibrados...
                  </div>
                ) : Object.keys(equiposCalibrados).length === 0 ? (
                  <div className="text-gray-500 h-full flex items-center justify-center">
                    Selecciona empresa y fecha para mostrar los equipos calibrados en sitio.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(equiposCalibrados).map(([tecnico, equipos]) => (
                      <div key={tecnico} className="border-l-4 border-green-500 pl-4">
                        <h3 className="font-bold text-green-700 mb-2">{tecnico}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {equipos.map((equipo, idx) =>
                            equipo.id
                              ? equipo.id.split(',').map((idSingle, idIdx) => (
                                  <div key={`${idx}-${idIdx}`} className="bg-green-50 p-2 rounded text-sm text-green-800">
                                    {idSingle.trim()}
                                  </div>
                                ))
                              : null
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* FIRMAS */}
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-6 rounded-xl">
              <h2 className="text-xl font-bold text-purple-800 mb-6">Firmas</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Técnico Responsable</h3>
                  {firmaTecnico ? (
                    <div className="bg-white p-4 border-2 border-dashed border-gray-300 rounded-lg text-center relative">
                      <img src={firmaTecnico} alt="Firma técnico" className="max-w-full max-h-24 mx-auto" />
                      <button
                        onClick={() => setFirmaTecnico('')}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => comenzarFirma('tecnico')}
                      className="w-full bg-blue-700 text-white px-4 py-3 rounded-lg hover:bg-blue-800 transition-colors"
                    >
                      Firmar
                    </button>
                  )}
                  {firmaTecnico && (
                    <button
                      onClick={() => setFirmaTecnico('')}
                      className="text-xs text-pink-600 hover:text-pink-800 mt-2 block"
                    >
                      Borrar firma
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Cliente</h3>
                  {firmaCliente ? (
                    <div className="bg-white p-4 border-2 border-dashed border-gray-300 rounded-lg text-center relative">
                      <img src={firmaCliente} alt="Firma cliente" className="max-w-full max-h-24 mx-auto" />
                      <button
                        onClick={() => setFirmaCliente('')}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => comenzarFirma('cliente')}
                      className="w-full bg-blue-700 text-white px-4 py-3 rounded-lg hover:bg-blue-800 transition-colors"
                    >
                      Firmar
                    </button>
                  )}
                  {firmaCliente && (
                    <button
                      onClick={() => setFirmaCliente('')}
                      className="text-xs text-pink-600 hover:text-pink-800 mt-2 block"
                    >
                      Borrar firma
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal de firma */}
            {firmando && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 w-full max-w-md">
                  <h3 className="text-lg font-bold mb-4">
                    Dibuja la firma del {firmando === "tecnico" ? "Técnico" : "Cliente"}:
                  </h3>
                  
                  <div className="border-2 border-gray-300 rounded-lg mb-4">
                    <canvas
                      ref={canvasRef}
                      width={400}
                      height={200}
                      className="w-full h-32 cursor-crosshair"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={guardarFirma}
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Guardar Firma
                    </button>
                    <button
                      onClick={() => setFirmando(null)}
                      className="flex-1 bg-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Botones finales */}
            <div className="flex gap-4 justify-center pt-6">
              <button
                onClick={() => setVistaPrevia(true)}
                className="bg-blue-700 text-white px-8 py-4 rounded-xl flex items-center gap-2 hover:bg-blue-800 transition-all duration-200 hover:scale-105"
              >
                <FileText className="w-5 h-5" />
                Vista previa y PDF
              </button>
              
              <button
                onClick={handleDescargarPDF}
                className="bg-green-600 text-white px-8 py-4 rounded-xl flex items-center gap-2 hover:bg-green-700 transition-all duration-200 hover:scale-105"
              >
                <Download className="w-5 h-5" />
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
