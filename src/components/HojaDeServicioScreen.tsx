import React, { useEffect, useRef, useState } from 'react';
import {
  Download, FileText, User, Calendar, Phone, Mail, MapPin, Settings, 
  MessageSquare, Star, Edit3, ArrowLeft, Building2, Loader2, Wrench, PlusCircle
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import { 
  collection, getDocs, query, where, doc, getDoc, orderBy, limit, 
  setDoc, addDoc, Timestamp
} from "firebase/firestore";

// ---- IMPORTAR LOGO DIRECTAMENTE ----
import logoImage from '../assets/lab_logo.png';

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

// ---- FUNCIONES DE FOLIO ÚNICO ----
async function getNextFolio(): Promise<string> {
  try {
    console.log('🔄 Generando siguiente folio...');
    const folioPrefix = 'HSDG-';
    
    // Consultar todos los folios para encontrar el número más alto
    const q = query(collection(db, "hojasDeServicio"));
    const querySnapshot = await getDocs(q);
    
    let lastNumber = 0;
    querySnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      if (data.folio && typeof data.folio === 'string' && data.folio.startsWith(folioPrefix)) {
        const num = parseInt(data.folio.replace(folioPrefix, ''), 10);
        if (!isNaN(num) && num > lastNumber) {
          lastNumber = num;
        }
      }
    });

    const nextNumber = lastNumber + 1;
    const newFolio = folioPrefix + nextNumber.toString().padStart(4, '0');
    
    console.log(`✅ Nuevo folio generado: ${newFolio} (anterior: ${lastNumber})`);
    return newFolio;
  } catch (error) {
    console.error('❌ Error generando folio:', error);
    throw new Error('No se pudo generar el folio automáticamente');
  }
}

async function checkFolioExists(folio: string): Promise<boolean> {
  try {
    const docRef = doc(db, "hojasDeServicio", folio);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch (error) {
    console.error('Error verificando folio:', error);
    return false;
  }
}

async function saveServiceData(campos: any, firmaTecnico: string, firmaCliente: string, equiposCalibrados: any) {
  try {
    console.log('💾 Guardando hoja de servicio...');
    
    // Verificar si el folio ya existe
    if (await checkFolioExists(campos.folio)) {
      throw new Error(`❌ El folio ${campos.folio} ya existe en la base de datos. Por favor, genera un nuevo folio.`);
    }

    const folioNumber = parseInt(campos.folio.replace('HSDG-', ''), 10);
    
    const serviceData = {
      ...campos,
      folioNum: folioNumber,
      firmaTecnico: firmaTecnico || '',
      firmaCliente: firmaCliente || '',
      equiposCalibrados: equiposCalibrados || {},
      fechaCreacion: Timestamp.now(),
      fechaModificacion: Timestamp.now(),
      estado: 'completado'
    };

    // Guardar en la colección principal
    await setDoc(doc(db, "hojasDeServicio", campos.folio), serviceData);
    
    // También guardar en DriveScreen para facilitar la consulta
    await addDoc(collection(db, "driveScreen"), {
      tipo: 'hoja-servicio',
      folio: campos.folio,
      empresa: campos.empresa,
      fecha: campos.fecha,
      tecnico: campos.tecnicoResponsable,
      fechaCreacion: Timestamp.now(),
      ruta: `/hojasDeServicio/${campos.folio}`
    });
    
    console.log('✅ Hoja de servicio guardada exitosamente');
    return true;
  } catch (error) {
    console.error('❌ Error guardando servicio:', error);
    throw error;
  }
}

// ---- CONVERTIR IMAGEN IMPORTADA A BASE64 ----
async function getLogoBase64(): Promise<string | undefined> {
  try {
    console.log('🖼️ Intentando cargar logo importado...');
    
    if (logoImage) {
      console.log('✅ Logo importado encontrado:', logoImage);
      const response = await fetch(logoImage);
      if (response.ok) {
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        console.log('✅ Logo convertido a base64 exitosamente');
        return base64;
      }
    }
    
    // Si el import falló, intentamos las rutas públicas
    const publicPaths = ['/lab_logo.png', '/assets/lab_logo.png', './lab_logo.png'];
    
    for (const path of publicPaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return base64;
        }
      } catch (error) {
        continue;
      }
    }
    
    return undefined;
  } catch (error) {
    console.error('❌ Error general cargando logo:', error);
    return undefined;
  }
}

// ---- UTILIDAD PARA TRUNCAR TEXTO ----
function truncateText(text: string, maxLength: number): string {
  return text && text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text || '';
}

// ---- ORGANIZAR EQUIPOS SIN DUPLICAR NOMBRES (PROFESIONAL) ----
function organizarEquiposProfesional(equiposCalibrados: Record<string, any[]>) {
  const equiposPorTecnico: Array<{
    tecnico: string;
    equipos: string[];
  }> = [];

  Object.entries(equiposCalibrados).forEach(([tecnico, equipos]) => {
    const listaEquipos: string[] = [];
    
    equipos.forEach((equipo: any) => {
      if (equipo.id) {
        equipo.id.split(',').forEach((idSingle: string) => {
          listaEquipos.push(idSingle.trim());
        });
      }
    });

    if (listaEquipos.length > 0) {
      equiposPorTecnico.push({
        tecnico,
        equipos: listaEquipos
      });
    }
  });

  return equiposPorTecnico;
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
  const azulPrimario = [104, 131, 145];
  const azulSecundario = [52, 144, 220];
  const grisTexto = [60, 60, 60];
  const grisClaro = [240, 242, 247];

  console.log('📄 Generando PDF...');
  console.log('👤 Datos del cliente:', {
    empresa: campos.empresa,
    contacto: campos.contacto,
    direccion: campos.direccion,
    telefono: campos.telefono,
    correo: campos.correo
  });

  // ===== HEADER PROFESIONAL =====
  doc.setFillColor(...grisClaro);
  doc.rect(0, 0, 210, 32, 'F');
  
  doc.setFillColor(...azulPrimario);
  doc.rect(0, 0, 210, 3, 'F');

  // LOGO MEJORADO CON DEBUGGING
  try {
    console.log('🖼️ Cargando logo para PDF...');
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      console.log('✅ Insertando logo en PDF...');
      doc.addImage(logoBase64, 'PNG', 15, 6, 25, 20, undefined, 'FAST');
      console.log('✅ Logo insertado correctamente en PDF');
    } else {
      console.log('⚠️ Usando logo de respaldo en PDF...');
      doc.setFillColor(...azulPrimario);
      doc.circle(27.5, 16, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('ESE', 27.5, 19, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  } catch (error) {
    console.error('❌ Error con logo en PDF:', error);
    doc.setFillColor(...azulPrimario);
    doc.circle(27.5, 16, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('ESE', 27.5, 19, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // INFORMACIÓN DE LA EMPRESA
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.', 45, 11);
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
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
  
  doc.setFillColor(...grisClaro);
  doc.roundedRect(10, currentY, 190, 15, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 15, 2, 2, 'S');

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  doc.text('FOLIO:', 15, currentY + 6);
  doc.text('FECHA:', 80, currentY + 6);
  doc.text('TÉCNICO:', 140, currentY + 6);
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(campos.folio || '__________', 30, currentY + 6);
  doc.text(campos.fecha || '__________', 95, currentY + 6);
  doc.text(truncateText(campos.tecnicoResponsable, 20), 160, currentY + 6);

  currentY += 19;

  // ===== INFORMACIÓN DEL CLIENTE =====
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, currentY, 190, 25, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 25, 2, 2, 'S');

  doc.setDrawColor(...azulSecundario);
  doc.line(105, currentY, 105, currentY + 25);

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  
  // LADO IZQUIERDO
  doc.text('Planta:', 15, currentY + 6);
  doc.text('Domicilio:', 15, currentY + 13);
  doc.text('Contacto:', 15, currentY + 20);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  const empresaTexto = campos.empresa || '';
  const direccionTexto = campos.direccion || '';
  const contactoTexto = campos.contacto || '';
  const telefonoTexto = campos.telefono || '';
  const correoTexto = campos.correo || '';
  
  doc.text(truncateText(empresaTexto, 25), 30, currentY + 6);
  doc.text(truncateText(direccionTexto, 25), 35, currentY + 13);
  doc.text(truncateText(contactoTexto, 20), 30, currentY + 20);

  // LADO DERECHO
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono:', 110, currentY + 6);
  doc.text('Correo:', 110, currentY + 13);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(truncateText(telefonoTexto, 25), 125, currentY + 6);
  doc.text(truncateText(correoTexto, 25), 120, currentY + 13);

  currentY += 29;

  // ===== EQUIPOS CALIBRADOS =====
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EQUIPOS CALIBRADOS EN SITIO', 15, currentY);
  currentY += 4;

  const equiposBoxHeight = 50;
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
    const equiposProfesionales = organizarEquiposProfesional(equiposCalibrados);
    let yPos = currentY + 5;
    
    equiposProfesionales.forEach((grupo, groupIndex) => {
      doc.setTextColor(...azulPrimario);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${grupo.tecnico}:`, 15, yPos);
      yPos += 4;
      
      const equiposPorFila = 3;
      let equipoIndex = 0;
      
      while (equipoIndex < grupo.equipos.length) {
        let xPos = 20;
        const columnWidth = 55;
        
        for (let col = 0; col < equiposPorFila && equipoIndex < grupo.equipos.length; col++) {
          doc.setTextColor(...grisTexto);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const equipoTexto = truncateText(grupo.equipos[equipoIndex], 18);
          doc.text(`• ${equipoTexto}`, xPos, yPos);
          xPos += columnWidth;
          equipoIndex++;
        }
        yPos += 3.5;
      }
      
      yPos += 2;
    });
  }
  
  currentY += equiposBoxHeight + 4;

  // ===== COMENTARIOS =====
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

  // ===== CALIDAD DEL SERVICIO Y FIRMAS FIJAS =====
  const firmasFixedY = 245;
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CALIDAD DEL SERVICIO:', 15, firmasFixedY - 8);
  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text(campos.calidadServicio, 70, firmasFixedY - 8);

  // Firmas
  doc.setFillColor(...grisClaro);
  doc.rect(10, firmasFixedY - 2, 190, 32, 'F');
  
  const firmaWidth = 80;
  const firmaHeight = 20;
  
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(20, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'S');
  
  doc.roundedRect(110, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.roundedRect(110, firmasFixedY, firmaWidth, firmaHeight, 2, 2, 'S');

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

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TÉCNICO RESPONSABLE', 60, firmasFixedY + 25, { align: 'center' });
  doc.text('CLIENTE AUTORIZADO', 150, firmasFixedY + 25, { align: 'center' });
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(truncateText(campos.tecnicoResponsable || '[Nombre del técnico]', 20), 60, firmasFixedY + 29, { align: 'center' });
  const nombreCliente = contactoTexto || '[Nombre del cliente]';
  doc.text(truncateText(nombreCliente, 20), 150, firmasFixedY + 29, { align: 'center' });

  // Mensaje final
  doc.setFillColor(...azulPrimario);
  doc.rect(10, 280, 190, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE', 105, 284, { align: 'center' });

  console.log('✅ PDF generado correctamente');
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
  const [savingService, setSavingService] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { goBack } = useNavigation();

  // --- GENERAR FOLIO ÚNICO ---
  const generarFolioUnico = async () => {
    setAutoFolioLoading(true);
    try {
      const newFolio = await getNextFolio();
      setCampos(c => ({ ...c, folio: newFolio }));
      console.log(`✅ Folio generado: ${newFolio}`);
    } catch (error) {
      console.error('Error generando folio:', error);
      alert('Error al generar folio automático. Intenta de nuevo.');
    } finally {
      setAutoFolioLoading(false);
    }
  };

  // --- GUARDAR SERVICIO ---
  const handleSaveService = async () => {
    if (!campos.folio) {
      alert('Por favor genera o ingresa un folio');
      return;
    }
    if (!campos.empresa || !campos.fecha || !campos.tecnicoResponsable) {
      alert('Por favor completa todos los campos requeridos (Empresa, Fecha, Técnico)');
      return;
    }

    setSavingService(true);
    try {
      await saveServiceData(campos, firmaTecnico, firmaCliente, equiposCalibrados);
      alert(`✅ Hoja de servicio guardada exitosamente con folio: ${campos.folio}`);
    } catch (error: any) {
      alert(error.message || 'Error al guardar la hoja de servicio');
    } finally {
      setSavingService(false);
    }
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
      
      console.log('🏢 Cargando datos de empresa:', campos.empresaId);
      
      const ref = doc(db, "clientes", campos.empresaId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.log('❌ Empresa no encontrada');
        return;
      }
      
      const data = snap.data() as Empresa;
      console.log('📊 Datos de empresa cargados:', data);
      
      setCampos(c => {
        const newCampos = {
          ...c,
          empresa: data.nombre || '',
          direccion: data.direccion || '',
          contacto: data.contacto || '',
          telefono: data.telefono || '',
          correo: data.correo || '',
        };
        console.log('✅ Campos actualizados:', newCampos);
        return newCampos;
      });
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

  // ---- FIRMAS MEJORADAS ----
  const comenzarFirma = (tipo: 'cliente' | 'tecnico') => {
    setFirmando(tipo);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Configurar mejor calidad para el canvas
          ctx.imageSmoothingEnabled = true;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
        }
      }
    }, 100);
  };

  const guardarFirma = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataURL = canvas.toDataURL('image/png', 1.0);
      if (firmando === 'cliente') setFirmaCliente(dataURL);
      if (firmando === 'tecnico') setFirmaTecnico(dataURL);
    }
    setFirmando(null);
  };

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  const handlePointerDown = (e: any) => {
    e.preventDefault();
    isDrawing = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if (e.touches && e.touches.length > 0) {
      lastX = (e.touches[0].clientX - rect.left) * scaleX;
      lastY = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      lastX = (e.clientX - rect.left) * scaleX;
      lastY = (e.clientY - rect.top) * scaleY;
    }
  };

  const handlePointerMove = (e: any) => {
    e.preventDefault();
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let x, y;
    if (e.touches && e.touches.length > 0) {
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
  };

  const handlePointerUp = (e: any) => { 
    e.preventDefault();
    isDrawing = false; 
  };

  const handleDescargarPDF = async () => {
    console.log('🔄 Iniciando descarga PDF con datos:', campos);
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
          <div className="bg-white rounded-lg shadow-2xl p-8 mb-6" style={{ aspectRatio: '210/297' }}>
            {/* Header profesional */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-t-lg mb-4 relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-800 rounded-t-lg"></div>
              
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                  {logoImage ? (
                    <img src={logoImage} alt="Logo" className="w-12 h-12 rounded-full object-contain" />
                  ) : (
                    <span className="text-white font-bold text-sm">ESE</span>
                  )}
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

            {/* Información general */}
            <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><strong className="text-blue-700">FOLIO:</strong> {campos.folio || '__________'}</div>
                <div><strong className="text-blue-700">FECHA:</strong> {campos.fecha || '__________'}</div>
                <div><strong className="text-blue-700">TÉCNICO:</strong> {campos.tecnicoResponsable || '__________'}</div>
              </div>
            </div>

            {/* Info Cliente */}
            <div className="border border-blue-200 rounded-lg mb-4 bg-white overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-blue-200">
                <div className="p-4 space-y-2">
                  <div className="text-sm"><strong className="text-blue-700">Planta:</strong> {truncateText(campos.empresa || 'Sin especificar', 25)}</div>
                  <div className="text-sm"><strong className="text-blue-700">Domicilio:</strong> {truncateText(campos.direccion || 'Sin especificar', 25)}</div>
                  <div className="text-sm"><strong className="text-blue-700">Contacto:</strong> {truncateText(campos.contacto || 'Sin especificar', 25)}</div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="text-sm"><strong className="text-blue-700">Teléfono:</strong> {truncateText(campos.telefono || 'Sin especificar', 25)}</div>
                  <div className="text-sm"><strong className="text-blue-700">Correo:</strong> {truncateText(campos.correo || 'Sin especificar', 25)}</div>
                </div>
              </div>
            </div>

            {/* Equipos */}
            <div className="mb-4">
              <h3 className="text-blue-800 font-bold mb-2">EQUIPOS CALIBRADOS EN SITIO</h3>
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
                    <div className="space-y-3">
                      {(() => {
                        const equiposProfesionales = organizarEquiposProfesional(equiposCalibrados);
                        return equiposProfesionales.map((grupo, groupIndex) => (
                          <div key={groupIndex} className="space-y-1">
                            <div className="font-bold text-blue-700 text-xs border-b border-blue-200 pb-1">
                              {grupo.tecnico}:
                            </div>
                            <div className="grid grid-cols-3 gap-1 ml-2">
                              {grupo.equipos.map((equipo, equipoIndex) => (
                                <div key={equipoIndex} className="text-gray-700 text-xs">
                                  • {truncateText(equipo, 15)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Comentarios */}
            {campos.comentarios && campos.comentarios.trim() && (
              <div className="mb-4">
                <h4 className="text-blue-800 font-bold text-sm mb-1">OBSERVACIONES:</h4>
                <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">
                  {truncateText(campos.comentarios, 200)}
                </div>
              </div>
            )}

            <div className="flex-grow"></div>

            {/* Calidad del servicio */}
            <div className="mb-2">
              <div className="text-sm">
                <strong className="text-blue-700">CALIDAD DEL SERVICIO:</strong> 
                <span className="text-blue-600 font-bold ml-2">{campos.calidadServicio}</span>
              </div>
            </div>

            {/* Firmas */}
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
              Descargar PDF
            </button>
            
            <button
              onClick={handleSaveService}
              disabled={savingService}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
            >
              {savingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
              {savingService ? 'Guardando...' : 'Guardar Servicio'}
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

  // ----------- FORMULARIO NORMAL ---------
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
                    Folio *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={campos.folio}
                      onChange={(e) => setCampos({ ...campos, folio: e.target.value })}
                      placeholder="Folio único del servicio"
                    />
                    <button
                      onClick={generarFolioUnico}
                      disabled={autoFolioLoading}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs transition-colors"
                    >
                      {autoFolioLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      ) : null}
                      {autoFolioLoading ? 'Generando...' : 'Auto'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Genera automáticamente el siguiente folio disponible</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Fecha *
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
                    Técnico Responsable *
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

            {/* Info Cliente */}
            <div className="border-2 border-blue-200 rounded-xl overflow-hidden bg-blue-50/50">
              <h2 className="text-xl font-bold text-blue-800 p-6 pb-0 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Información del Cliente *
              </h2>

              <div className="p-6 pt-4">
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Empresa/Planta *
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white p-6 rounded-lg border border-blue-200">
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

            {/* VISTA EQUIPOS PROFESIONAL */}
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-xl">
              <h2 className="text-xl font-bold text-green-800 mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Equipos Calibrados en SITIO
              </h2>
              
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
                    {(() => {
                      const equiposProfesionales = organizarEquiposProfesional(equiposCalibrados);
                      return equiposProfesionales.map((grupo, groupIndex) => (
                        <div key={groupIndex} className="border-l-4 border-green-500 pl-4">
                          <h3 className="font-bold text-green-700 mb-2">{grupo.tecnico}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {grupo.equipos.map((equipo, equipoIndex) => (
                              <div key={equipoIndex} className="bg-green-50 p-2 rounded text-sm text-green-800">
                                {equipo}
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
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
                      className="w-full h-32 cursor-crosshair touch-none"
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onTouchStart={handlePointerDown}
                      onTouchMove={handlePointerMove}
                      onTouchEnd={handlePointerUp}
                      style={{ touchAction: 'none' }}
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
                Vista previa
              </button>
              
              <button
                onClick={handleSaveService}
                disabled={savingService || !campos.folio || !campos.empresa || !campos.fecha}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-8 py-4 rounded-xl flex items-center gap-2 transition-all duration-200 hover:scale-105"
              >
                {savingService ? <Loader2 className="w-5 h-5 animate-spin" /> : <Star className="w-5 h-5" />}
                {savingService ? 'Guardando...' : 'Guardar Servicio'}
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
