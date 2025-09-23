import React, { useEffect, useRef, useState } from 'react';
import {
  Download, Star, Edit3, ArrowLeft, Loader2, Home, Trash2, RotateCcw, Save, Eye, User, Building, Calendar, FileText, Phone, Mail
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db } from '../utils/firebase';
import {
  collection, getDocs, query, where, doc, getDoc,
  setDoc, addDoc, Timestamp
} from "firebase/firestore";
import logoImage from '../assets/lab_logo.png';

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

type EquipoCalibrado = { id?: string; tecnico?: string };

async function getNextFolio(): Promise<string> {
  const folioPrefix = 'HSDG-';
  const q = query(collection(db, "hojasDeServicio"));
  const querySnapshot = await getDocs(q);
  let lastNumber = 0;
  querySnapshot.forEach(docSnapshot => {
    const data = docSnapshot.data();
    if (data.folio && typeof data.folio === 'string' && data.folio.startsWith(folioPrefix)) {
      const num = parseInt(data.folio.replace(folioPrefix, ''), 10);
      if (!isNaN(num) && num > lastNumber) lastNumber = num;
    }
  });
  const nextNumber = lastNumber + 1;
  return folioPrefix + nextNumber.toString().padStart(4, '0');
}

async function checkFolioExists(folio: string): Promise<boolean> {
  const docRef = doc(db, "hojasDeServicio", folio);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
}

async function saveServiceData(campos: any, firmaTecnico: string, firmaCliente: string, equiposCalibrados: any) {
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
  await setDoc(doc(db, "hojasDeServicio", campos.folio), serviceData);
  await addDoc(collection(db, "driveScreen"), {
    tipo: 'hoja-servicio',
    folio: campos.folio,
    empresa: campos.empresa,
    fecha: campos.fecha,
    tecnico: campos.tecnicoResponsable,
    fechaCreacion: Timestamp.now(),
    ruta: `/hojasDeServicio/${campos.folio}`
  });
  return true;
}

async function getLogoBase64(): Promise<string | undefined> {
  if (logoImage) {
    const response = await fetch(logoImage);
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
  }
  return undefined;
}

function truncateText(text: string, maxLength: number): string {
  return text && text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text || '';
}

function organizarEquiposProfesional(equiposCalibrados: Record<string, any[]>) {
  const equiposPorTecnico: Array<{ tecnico: string; equipos: string[]; }> = [];
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
      equiposPorTecnico.push({ tecnico, equipos: listaEquipos });
    }
  });
  return equiposPorTecnico;
}

// FUNCIÓN PDF MEJORADA CON INFORMACIÓN CLIENTE CORREGIDA
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
  
  // Colores
  const azulPrimario = [104, 131, 145];
  const azulSecundario = [52, 144, 220];
  const grisTexto = [60, 60, 60];
  const grisClaro = [240, 242, 247];

  // FUNCIÓN PARA NUEVA PÁGINA CON ENCABEZADO
  function crearNuevaPagina() {
    doc.addPage();
    
    // Encabezado simplificado
    doc.setFillColor(...grisClaro);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setFillColor(...azulPrimario);
    doc.rect(0, 0, 210, 2, 'F');
    
    doc.setTextColor(...azulPrimario);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG', 15, 7);
    
    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`FOLIO: ${campos.folio} | ${campos.fecha} | ${truncateText(campos.empresa, 25)}`, 15, 13);
    
    return 25;
  }

  // ENCABEZADO PRINCIPAL
  doc.setFillColor(...grisClaro);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setFillColor(...azulPrimario);
  doc.rect(0, 0, 210, 3, 'F');

  try {
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', 15, 6, 25, 20, undefined, 'FAST');
    }
  } catch {}

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.', 45, 11);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422', 45, 16);
  doc.text('Teléfonos: 8127116538 / 8127116357', 45, 21);

  // TÍTULO
  doc.setFillColor(...azulPrimario);
  doc.rect(0, 34, 210, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HOJA DE SERVICIO TÉCNICO', 105, 42, { align: 'center' });

  let currentY = 50;

  // INFORMACIÓN BÁSICA
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

  // INFORMACIÓN DEL CLIENTE - CORREGIDA
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, currentY, 190, 30, 2, 2, 'F'); // Aumentar altura
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 30, 2, 2, 'S');
  doc.setDrawColor(...azulSecundario);
  doc.line(105, currentY, 105, currentY + 30); // Línea divisoria más alta
  
  // COLUMNA IZQUIERDA
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Planta:', 15, currentY + 7);
  doc.text('Domicilio:', 15, currentY + 15);
  doc.text('Contacto:', 15, currentY + 23);

  // COLUMNA DERECHA
  doc.text('Teléfono:', 110, currentY + 7);
  doc.text('Correo:', 110, currentY + 15);

  // DATOS DEL CLIENTE
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const empresaTexto = campos.empresa || '';
  const direccionTexto = campos.direccion || '';
  const contactoTexto = campos.contacto || '';
  const telefonoTexto = campos.telefono || '';
  const correoTexto = campos.correo || '';

  // Textos con más caracteres
  doc.text(truncateText(empresaTexto, 35), 30, currentY + 7);
  doc.text(truncateText(direccionTexto, 32), 38, currentY + 15);
  doc.text(truncateText(contactoTexto, 28), 33, currentY + 23);
  doc.text(truncateText(telefonoTexto, 30), 130, currentY + 7);
  doc.text(truncateText(correoTexto, 28), 125, currentY + 15);

  currentY += 34;

  // [Resto del código PDF igual... EQUIPOS CALIBRADOS, COMENTARIOS, etc.]
  
  // EQUIPOS CALIBRADOS
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EQUIPOS CALIBRADOS EN SITIO', 15, currentY);
  currentY += 6;

  const equiposProfesionales = organizarEquiposProfesional(equiposCalibrados);
  
  if (equiposProfesionales.length === 0) {
    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('No se registraron equipos calibrados.', 105, currentY + 10, { align: 'center' });
    currentY += 20;
  } else {
    const margenIzq = 15;
    const anchoTotal = 180;
    const equiposPorFila = 6;
    const anchoColumna = anchoTotal / equiposPorFila;
    const altoFila = 4.5;
    const altoEncabezado = 7;

    equiposProfesionales.forEach((grupo, tecnicoIndex) => {
      const numFilas = Math.ceil(grupo.equipos.length / equiposPorFila);
      const altoTotalGrupo = altoEncabezado + (numFilas * altoFila) + 3;
      
      if (currentY + altoTotalGrupo + 50 > 280) {
        currentY = crearNuevaPagina();
      }

      doc.setFillColor(245, 248, 255);
      doc.setDrawColor(...azulSecundario);
      doc.setLineWidth(0.3);
      doc.roundedRect(margenIzq, currentY, anchoTotal, altoEncabezado, 1, 1, 'FD');
      
      doc.setTextColor(...azulSecundario);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`${grupo.tecnico} (${grupo.equipos.length} equipos)`, margenIzq + 2, currentY + 4.5);
      
      currentY += altoEncabezado;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      let equipoIndex = 0;
      let numFila = 0;

      while (equipoIndex < grupo.equipos.length) {
        const yFila = currentY + (numFila * altoFila);
        
        if (numFila % 2 === 0) {
          doc.setFillColor(252, 253, 255);
          doc.rect(margenIzq, yFila, anchoTotal, altoFila, 'F');
        }

        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.1);
        for (let col = 1; col < equiposPorFila; col++) {
          const xLinea = margenIzq + (col * anchoColumna);
          doc.line(xLinea, yFila, xLinea, yFila + altoFila);
        }

        doc.setTextColor(...grisTexto);
        for (let col = 0; col < equiposPorFila && equipoIndex < grupo.equipos.length; col++) {
          const xPos = margenIzq + (col * anchoColumna) + 2;
          const equipoTexto = truncateText(grupo.equipos[equipoIndex], 8);
          
          doc.text(equipoTexto, xPos, yFila + 2.5);
          equipoIndex++;
        }

        numFila++;
      }

      currentY += (numFilas * altoFila) + 2;

      if (tecnicoIndex < equiposProfesionales.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margenIzq, currentY, margenIzq + anchoTotal, currentY);
        currentY += 2;
      }
    });
  }

  // COMENTARIOS
  if (campos.comentarios && campos.comentarios.trim()) {
    currentY += 3;
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

  // SISTEMA HÍBRIDO PARA POSICIÓN DE FIRMAS
  const espacioMinimo = 45;
  const posicionMinimaFirmas = 200;
  const posicionFinalPagina = 235;
  
  let firmasY;
  
  if (currentY < posicionMinimaFirmas) {
    firmasY = posicionFinalPagina;
  } else {
    currentY += 8;
    if (currentY + espacioMinimo > 280) {
      currentY = crearNuevaPagina();
    }
    firmasY = currentY;
  }

  // CALIDAD DEL SERVICIO
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CALIDAD DEL SERVICIO:', 15, firmasY);
  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text(campos.calidadServicio, 70, firmasY);
  firmasY += 8;

  // ÁREA DE FIRMAS
  doc.setFillColor(...grisClaro);
  doc.rect(10, firmasY, 190, 32, 'F');
  const firmaWidth = 80;
  const firmaHeight = 20;
  
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(20, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'S');
  doc.roundedRect(110, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.roundedRect(110, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'S');

  // IMÁGENES DE FIRMAS
  try {
    if (firmaTecnico) {
      doc.addImage(firmaTecnico, 'PNG', 25, firmasY + 4, 70, 16);
    }
    if (firmaCliente) {
      doc.addImage(firmaCliente, 'PNG', 115, firmasY + 4, 70, 16);
    }
  } catch {}

  // ETIQUETAS DE FIRMAS
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TÉCNICO RESPONSABLE', 60, firmasY + 27, { align: 'center' });
  doc.text('CLIENTE AUTORIZADO', 150, firmasY + 27, { align: 'center' });
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(truncateText(campos.tecnicoResponsable || '[Nombre del técnico]', 20), 60, firmasY + 31, { align: 'center' });
  const nombreCliente = contactoTexto || '[Nombre del cliente]';
  doc.text(truncateText(nombreCliente, 20), 150, firmasY + 31, { align: 'center' });

  // PIE DE PÁGINA AL FINAL ABSOLUTO
  const pieY = 272;
  doc.setFillColor(...azulPrimario);
  doc.rect(10, pieY, 190, 8, 'F');

  // Código identificador Hoja de Servicio (AG-CAL-F10-00) en la esquina inferior izquierda
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(52, 60, 130); // azul discreto
  doc.text('AG-CAL-F10-00', 12, 285); // Esquina inferior izquierda
 
  // Texto Central en blanco
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE', 105, pieY + 4, { align: 'center' });

  doc.save(`HojaServicio_${campos.folio || new Date().getTime()}.pdf`);
}

export default function HojaDeServicioScreen() {
  const [campos, setCampos] = useState(camposIniciales);
  const [firmaCliente, setFirmaCliente] = useState('');
  const [firmaTecnico, setFirmaTecnico] = useState('');
  const [firmando, setFirmando] = useState<'cliente' | 'tecnico' | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [equiposCalibrados, setEquiposCalibrados] = useState<Record<string, EquipoCalibrado[]>>({});
  const [loadingEquipos, setLoadingEquipos] = useState(false);
  const [autoFolioLoading, setAutoFolioLoading] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { goBack } = useNavigation();

  const generarFolioUnico = async () => {
    setAutoFolioLoading(true);
    try {
      const newFolio = await getNextFolio();
      setCampos(c => ({ ...c, folio: newFolio }));
    } catch (error) {
      alert('Error al generar folio automático. Intenta de nuevo.');
    } finally {
      setAutoFolioLoading(false);
    }
  };

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

  const limpiarFirma = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const borrarFirma = (tipo: 'cliente' | 'tecnico') => {
    if (tipo === 'cliente') {
      setFirmaCliente('');
    } else {
      setFirmaTecnico('');
    }
  };

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

  useEffect(() => {
    const loadDatosEmpresa = async () => {
      if (!campos.empresaId) return;
      const ref = doc(db, "clientes", campos.empresaId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data() as Empresa;
      setCampos(c => ({
        ...c,
        empresa: data.nombre || '',
        direccion: data.direccion || '',
        contacto: data.contacto || '',
        telefono: data.telefono || '',
        correo: data.correo || '',
      }));
    };
    loadDatosEmpresa();
  }, [campos.empresaId]);

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

  const comenzarFirma = (tipo: 'cliente' | 'tecnico') => {
    setFirmando(tipo);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
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
    await generarPDFFormal({
      campos,
      firmaTecnico,
      firmaCliente,
      equiposCalibrados,
    });
  };

  // PANTALLA DE FIRMA MEJORADA
  if (firmando) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-t-xl shadow-lg p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                <Edit3 className="text-blue-600" size={28} />
                Firma {firmando === "tecnico" ? "del Técnico" : "del Cliente"}
              </h2>
              <button 
                onClick={() => setFirmando(null)}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-all"
              >
                <ArrowLeft size={24} />
              </button>
            </div>
            <p className="text-gray-600 mt-2">Dibuja tu firma en el área blanca de abajo</p>
          </div>

          {/* Canvas Area */}
          <div className="bg-white shadow-lg p-6">
            <canvas
              ref={canvasRef}
              width={600}
              height={300}
              className="border-2 border-gray-300 rounded-lg w-full bg-white shadow-inner"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              style={{ touchAction: 'none' }}
            />
          </div>

          {/* Actions */}
          <div className="bg-white rounded-b-xl shadow-lg p-6">
            <div className="flex justify-between items-center gap-4">
              <button 
                onClick={limpiarFirma}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
              >
                <RotateCcw size={18} />
                Limpiar
              </button>
              <div className="flex gap-3">
                <button 
                  onClick={() => setFirmando(null)}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={guardarFirma}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg"
                >
                  <Save size={18} />
                  Guardar Firma
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (vistaPrevia) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Encabezado */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
            <div className="flex items-center gap-4">
              {logoImage ? (
                <img src={logoImage} alt="Logo" className="w-16 h-16 object-contain bg-white rounded-full p-2" />
              ) : (
                <div className="w-16 h-16 bg-white text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                  ESE
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl font-bold mb-1">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h1>
                <p className="text-sm opacity-90">Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422</p>
                <p className="text-sm opacity-90">Teléfonos: 8127116538 / 8127116357</p>
              </div>
            </div>
          </div>

          {/* Título */}
          <div className="bg-blue-700 text-white py-3">
            <h2 className="text-center text-xl font-bold">HOJA DE SERVICIO TÉCNICO</h2>
          </div>

          {/* Información básica */}
          <div className="p-6 bg-gray-50 border-b">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><strong>FOLIO:</strong> {campos.folio || '__________'}</div>
              <div><strong>FECHA:</strong> {campos.fecha || '__________'}</div>
              <div><strong>TÉCNICO:</strong> {campos.tecnicoResponsable || '__________'}</div>
            </div>
          </div>

          {/* Información del cliente */}
          <div className="p-6 border-b">
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div className="space-y-2">
                <div><strong>Planta:</strong> {truncateText(campos.empresa || 'Sin especificar', 35)}</div>
                <div><strong>Domicilio:</strong> {truncateText(campos.direccion || 'Sin especificar', 32)}</div>
                <div><strong>Contacto:</strong> {truncateText(campos.contacto || 'Sin especificar', 28)}</div>
              </div>
              <div className="space-y-2">
                <div><strong>Teléfono:</strong> {truncateText(campos.telefono || 'Sin especificar', 30)}</div>
                <div><strong>Correo:</strong> {truncateText(campos.correo || 'Sin especificar', 28)}</div>
              </div>
            </div>
          </div>

          {/* Equipos calibrados */}
          <div className="p-6 border-b">
            <h3 className="text-lg font-bold text-blue-700 mb-4">EQUIPOS CALIBRADOS EN SITIO</h3>
            {loadingEquipos ? (
              <div className="text-center py-4 text-gray-500">Cargando equipos calibrados...</div>
            ) : (
              Object.keys(equiposCalibrados).length === 0 ? (
                <div className="text-center py-4 text-gray-500 italic">No se registraron equipos calibrados para este cliente y fecha.</div>
              ) : (
                (() => {
                  const equiposProfesionales = organizarEquiposProfesional(equiposCalibrados);
                  return equiposProfesionales.map((grupo, groupIndex) => (
                    <div key={groupIndex} className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="font-bold text-blue-700 mb-3">{grupo.tecnico}:</h4>
                      <div className="grid grid-cols-6 gap-2 text-sm">
                        {grupo.equipos.map((equipo, equipoIndex) => (
                          <div key={equipoIndex} className="text-gray-700">
                            • {truncateText(equipo, 22)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              )
            )}
          </div>

          {/* Comentarios */}
          {campos.comentarios && campos.comentarios.trim() && (
            <div className="p-6 border-b bg-gray-50">
              <h4 className="font-bold text-blue-700 mb-2">OBSERVACIONES:</h4>
              <p className="text-sm text-gray-700 bg-white p-3 rounded border">
                {truncateText(campos.comentarios, 200)}
              </p>
            </div>
          )}

          {/* Calidad del servicio */}
          <div className="p-6 border-b">
            <div className="text-sm">
              <strong className="text-blue-700">CALIDAD DEL SERVICIO:</strong>
              <span className="ml-2 font-semibold text-blue-600">{campos.calidadServicio}</span>
            </div>
          </div>

          {/* Firmas */}
          <div className="p-6 bg-gray-50">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="border border-gray-300 rounded-lg p-4 mb-2 h-24 flex items-center justify-center bg-white">
                  {firmaTecnico ? (
                    <img src={firmaTecnico} alt="Firma Técnico" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-gray-400">[Firma del técnico]</span>
                  )}
                </div>
                <div className="text-sm font-bold text-blue-700">TÉCNICO RESPONSABLE</div>
                <div className="text-xs text-gray-600">{campos.tecnicoResponsable || '[Nombre del técnico]'}</div>
              </div>
              <div className="text-center">
                <div className="border border-gray-300 rounded-lg p-4 mb-2 h-24 flex items-center justify-center bg-white">
                  {firmaCliente ? (
                    <img src={firmaCliente} alt="Firma Cliente" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-gray-400">[Firma del cliente]</span>
                  )}
                </div>
                <div className="text-sm font-bold text-blue-700">CLIENTE AUTORIZADO</div>
                <div className="text-xs text-gray-600">{campos.contacto || '[Nombre del cliente]'}</div>
              </div>
            </div>
          </div>

          {/* Pie de página */}
          <div className="bg-blue-700 text-white p-3 text-center text-xs font-bold">
            DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => goBack()}
            className="bg-gray-200 hover:bg-gray-300 px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Home size={20} />
            Menú Principal
          </button>
          <button onClick={handleDescargarPDF} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
            <Download size={20} />
            Descargar PDF
          </button>
          <button onClick={handleSaveService} disabled={savingService} className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
            {savingService ? <Loader2 size={20} className="animate-spin" /> : <Star size={20} />}
            {savingService ? 'Guardando...' : 'Guardar Servicio'}
          </button>
          <button
            onClick={() => setVistaPrevia(false)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Edit3 size={20} />
            Editar
          </button>
        </div>
      </div>
    );
  }

  // FORMULARIO PRINCIPAL PROFESIONAL
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header Profesional */}
        <div className="bg-white rounded-t-xl shadow-lg p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {logoImage && (
                <img src={logoImage} alt="Logo" className="w-12 h-12 object-contain" />
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Hoja de Servicio Técnico</h1>
                <p className="text-gray-600">Genera documentos profesionales de servicio</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => goBack()}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-all"
              >
                <Home size={20} />
                Menú Principal
              </button>
              <button 
                onClick={() => setVistaPrevia(true)} 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all shadow-lg"
              >
                <Eye size={20} />
                Vista Previa
              </button>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white shadow-lg rounded-b-xl p-8">
          {/* Sección 1: Información Básica */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
              <h2 className="text-xl font-semibold text-gray-800">Información Básica</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Folio */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <FileText size={16} className="text-blue-600" />
                  Folio
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={campos.folio}
                    onChange={(e) => setCampos({ ...campos, folio: e.target.value })}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="HSDG-0001"
                  />
                  <button 
                    onClick={generarFolioUnico} 
                    disabled={autoFolioLoading} 
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-all font-semibold"
                  >
                    {autoFolioLoading ? <Loader2 size={16} className="animate-spin" /> : "Auto"}
                  </button>
                </div>
              </div>

              {/* Fecha */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Calendar size={16} className="text-blue-600" />
                  Fecha de Servicio
                </label>
                <input
                  type="date"
                  value={campos.fecha}
                  onChange={(e) => setCampos({ ...campos, fecha: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              {/* Técnico Responsable */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={16} className="text-blue-600" />
                  Técnico Responsable
                </label>
                <input
                  type="text"
                  value={campos.tecnicoResponsable}
                  onChange={(e) => setCampos({ ...campos, tecnicoResponsable: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Nombre completo del técnico"
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Información del Cliente */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
              <h2 className="text-xl font-semibold text-gray-800">Información del Cliente</h2>
            </div>
            
            {/* Empresa */}
            <div className="space-y-2 mb-6">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Building size={16} className="text-green-600" />
                Empresa / Planta
              </label>
              <select
                value={campos.empresaId}
                onChange={(e) => setCampos({ ...campos, empresaId: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all bg-white"
              >
                <option value="">Seleccionar empresa...</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Domicilio */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Building size={16} className="text-green-600" />
                  Domicilio
                </label>
                <input
                  type="text"
                  value={campos.direccion}
                  onChange={(e) => setCampos({ ...campos, direccion: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  placeholder="Dirección completa"
                />
              </div>

              {/* Contacto */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={16} className="text-green-600" />
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  value={campos.contacto}
                  onChange={(e) => setCampos({ ...campos, contacto: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  placeholder="Nombre del contacto"
                />
              </div>

              {/* Teléfono */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Phone size={16} className="text-green-600" />
                  Teléfono
                </label>
                <input
                  type="text"
                  value={campos.telefono}
                  onChange={(e) => setCampos({ ...campos, telefono: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  placeholder="(81) 1234-5678"
                />
              </div>

              {/* Correo */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Mail size={16} className="text-green-600" />
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={campos.correo}
                  onChange={(e) => setCampos({ ...campos, correo: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                  placeholder="contacto@empresa.com"
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Observaciones y Calidad */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
              <h2 className="text-xl font-semibold text-gray-800">Observaciones y Calidad</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Comentarios */}
              <div className="md:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <FileText size={16} className="text-purple-600" />
                  Comentarios / Observaciones
                </label>
                <textarea
                  value={campos.comentarios}
                  onChange={(e) => setCampos({ ...campos, comentarios: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
                  placeholder="Observaciones importantes del servicio realizado..."
                />
              </div>

              {/* Calidad del Servicio */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Star size={16} className="text-purple-600" />
                  Calidad del Servicio
                </label>
                <select
                  value={campos.calidadServicio}
                  onChange={(e) => setCampos({ ...campos, calidadServicio: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white"
                >
                  <option value="Excelente">⭐⭐⭐⭐⭐ Excelente</option>
                  <option value="Bueno">⭐⭐⭐⭐ Bueno</option>
                  <option value="Regular">⭐⭐⭐ Regular</option>
                  <option value="Deficiente">⭐⭐ Deficiente</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sección 4: Equipos Calibrados */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center text-sm font-bold">4</div>
              <h2 className="text-xl font-semibold text-gray-800">Equipos Calibrados en Sitio</h2>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
              {loadingEquipos ? (
                <div className="text-center py-8">
                  <Loader2 className="animate-spin mx-auto mb-4 text-orange-600" size={32} />
                  <p className="text-orange-700">Cargando equipos calibrados...</p>
                </div>
              ) : (
                Object.keys(equiposCalibrados).length === 0 ? (
                  <div className="text-center py-8 text-orange-700">
                    <FileText className="mx-auto mb-4 text-orange-600" size={48} />
                    <p className="text-lg font-semibold">No se encontraron equipos calibrados</p>
                    <p className="text-sm">Para este cliente y fecha en sitio.</p>
                  </div>
                ) : (
                  (() => {
                    const equiposProfesionales = organizarEquiposProfesional(equiposCalibrados);
                    return (
                      <div className="space-y-6">
                        {equiposProfesionales.map((grupo, groupIndex) => (
                          <div key={groupIndex} className="bg-white rounded-lg border border-orange-300 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-bold text-orange-800 text-lg flex items-center gap-2">
                                <User size={20} />
                                {grupo.tecnico}
                              </h4>
                              <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-semibold">
                                {grupo.equipos.length} equipos
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {grupo.equipos.map((equipo, equipoIndex) => (
                                <div key={equipoIndex} className="bg-orange-100 text-orange-800 px-3 py-2 rounded-lg text-sm font-medium text-center">
                                  {truncateText(equipo, 12)}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )
              )}
            </div>
          </div>

          {/* Sección 5: Firmas */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold">5</div>
              <h2 className="text-xl font-semibold text-gray-800">Firmas Digitales</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Firma Técnico */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Edit3 size={16} className="text-indigo-600" />
                  Firma del Técnico
                </label>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 bg-indigo-50 h-40 flex items-center justify-center">
                  {firmaTecnico ? (
                    <img src={firmaTecnico} alt="Firma Técnico" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-center">
                      <Edit3 className="mx-auto mb-2 text-indigo-400" size={32} />
                      <p className="text-indigo-600">No hay firma</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => comenzarFirma('tecnico')} 
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-all"
                  >
                    <Edit3 size={16} />
                    {firmaTecnico ? 'Cambiar Firma' : 'Firmar'}
                  </button>
                  {firmaTecnico && (
                    <button 
                      onClick={() => borrarFirma('tecnico')} 
                      className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Firma Cliente */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Edit3 size={16} className="text-indigo-600" />
                  Firma del Cliente
                </label>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 bg-indigo-50 h-40 flex items-center justify-center">
                  {firmaCliente ? (
                    <img src={firmaCliente} alt="Firma Cliente" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-center">
                      <Edit3 className="mx-auto mb-2 text-indigo-400" size={32} />
                      <p className="text-indigo-600">No hay firma</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => comenzarFirma('cliente')} 
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-all"
                  >
                    <Edit3 size={16} />
                    {firmaCliente ? 'Cambiar Firma' : 'Firmar'}
                  </button>
                  {firmaCliente && (
                    <button 
                      onClick={() => borrarFirma('cliente')} 
                      className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex justify-center gap-4 pt-8 border-t border-gray-200">
            <button 
              onClick={handleDescargarPDF} 
              className="flex items-center gap-3 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg transition-all shadow-lg font-semibold"
            >
              <Download size={20} />
              Descargar PDF
            </button>
            <button 
              onClick={handleSaveService} 
              disabled={savingService} 
              className="flex items-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-8 py-4 rounded-lg transition-all shadow-lg font-semibold"
            >
              {savingService ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {savingService ? 'Guardando...' : 'Guardar Servicio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
