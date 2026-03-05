import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Star, Edit3, ArrowLeft, Loader2, Home, Trash2, RotateCcw, Save, Eye, User, Building, Calendar, FileText, Phone, Mail, Search, ChevronDown, Wrench, CheckCircle2, XCircle
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection, getDocs, query, where, doc, getDoc,
  setDoc, addDoc, Timestamp, writeBatch,
  onSnapshot, deleteDoc
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

type EquipoUnificado = {
    id: string;
    docId: string;
    estado: 'CALIBRADO' | 'RECHAZADO';
}

type EquipoCalibrado = { 
    id: string; 
    docId: string;
    tecnico?: string; 
    estado: 'CALIBRADO' | 'RECHAZADO' 
}; 

type GrupoEquiposUnificado = { 
    tecnico: string; 
    equipos: EquipoUnificado[]; 
};

const formatDate = (dateString: string): string => {
  if (!dateString) return '__________';
  const date = new Date(`${dateString}T00:00:00`);
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('es-MX', options).format(date);
};

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

async function saveServiceData(campos: any, firmaTecnico: string, firmaCliente: string, equiposCalibrados: any, pdfURL: string, storagePath: string) {
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
    estado: 'completado',
    url: pdfURL,
    storagePath: storagePath,
  };
  await setDoc(doc(db, "hojasDeServicio", campos.folio), serviceData);

  await addDoc(collection(db, "driveScreen"), {
    tipo: 'hoja-servicio',
    folio: campos.folio,
    empresa: campos.empresa,
    fecha: campos.fecha,
    tecnico: campos.tecnicoResponsable,
    fechaCreacion: Timestamp.now(),
    ruta: storagePath
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

function organizarEquiposUnificado(equiposCalibrados: Record<string, EquipoCalibrado[]>): GrupoEquiposUnificado[] {
    const equiposUnificadosPorTecnico: Record<string, EquipoUnificado[]> = {};

    Object.entries(equiposCalibrados).forEach(([tecnico, equipos]) => {
        if (!equiposUnificadosPorTecnico[tecnico]) {
            equiposUnificadosPorTecnico[tecnico] = [];
        }

        equipos.forEach((equipo: EquipoCalibrado) => {
            if (equipo.id) {
                equipo.id.split(',').forEach((idSingle: string) => {
                    const trimmedId = idSingle.trim();
                    if (trimmedId) {
                        equiposUnificadosPorTecnico[tecnico].push({ 
                            id: trimmedId, 
                            docId: equipo.docId, 
                            estado: equipo.estado 
                        });
                    }
                });
            }
        });
    });

    const resultado: GrupoEquiposUnificado[] = Object.entries(equiposUnificadosPorTecnico)
        .filter(([, equipos]) => equipos.length > 0)
        .map(([tecnico, equipos]) => ({ tecnico, equipos }));
        
    return resultado;
}

async function generarPDFFormal({
  campos,
  firmaTecnico,
  firmaCliente,
  equiposCalibrados,
  outputType = 'save',
}: {
  campos: any;
  firmaTecnico: string;
  firmaCliente: string;
  equiposCalibrados: Record<string, EquipoCalibrado[]>; 
  outputType?: 'save' | 'blob';
}) {
  const jsPDF = (await import('jspdf')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  
  const azulPrimario = [104, 131, 145];
  const azulSecundario = [52, 144, 220];
  const grisTexto = [60, 60, 60];
  const grisClaro = [240, 242, 247];
  const rojoRechazo = [200, 0, 0]; 

  function crearNuevaPagina() {
    doc.addPage();
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
    doc.text(`FOLIO: ${campos.folio} | ${formatDate(campos.fecha)} | ${truncateText(campos.empresa, 25)}`, 15, 13);
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
  doc.text('Tlaquepaque No. 140, Col. Mitras Sur Monterrey, Nuevo Leon, México. C.P.64020', 45, 16);
  doc.text('Teléfonos: 8127116538 / 8127116357', 45, 21);

  doc.setFillColor(...azulPrimario);
  doc.rect(0, 34, 210, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HOJA DE SERVICIO TÉCNICO', 105, 42, { align: 'center' });

  let currentY = 50;

  // CAJA DE FOLIO Y FECHA (Mejorada visualmente)
  doc.setFillColor(250, 252, 255); 
  doc.roundedRect(10, currentY, 190, 14, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 14, 2, 2, 'S');
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FOLIO:', 15, currentY + 9);
  doc.text('FECHA:', 110, currentY + 9);
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'bold'); 
  doc.text(campos.folio || '__________', 35, currentY + 9);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(campos.fecha), 128, currentY + 9);
  
  currentY += 18;

  // CAJA DE INFORMACIÓN DEL CLIENTE (Alineación perfecta)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, currentY, 190, 32, 2, 2, 'F'); 
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 32, 2, 2, 'S');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.2); 
  doc.line(105, currentY, 105, currentY + 32);
  
  const labelCol1X = 15;
  const valCol1X = 35;
  const labelCol2X = 110;
  const valCol2X = 128;

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  
  // Etiquetas Columna 1
  doc.text('Planta:', labelCol1X, currentY + 8);
  doc.text('Domicilio:', labelCol1X, currentY + 16);
  doc.text('Contacto:', labelCol1X, currentY + 27);
  
  // Etiquetas Columna 2
  doc.text('Teléfono:', labelCol2X, currentY + 8);
  doc.text('Correo:', labelCol2X, currentY + 16);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5); 
  
  // Valores Columna 1
  doc.text(truncateText(campos.empresa || 'Sin especificar', 45), valCol1X, currentY + 8);
  
  const direccionLines = doc.splitTextToSize(campos.direccion || 'Sin especificar', 65); 
  direccionLines.slice(0, 2).forEach((line: string, index: number) => {
      doc.text(line, valCol1X, currentY + 16 + (index * 4.5)); 
  });
  
  doc.text(truncateText(campos.contacto || 'Sin especificar', 45), valCol1X, currentY + 27);
  
  // Valores Columna 2
  doc.text(truncateText(campos.telefono || 'Sin especificar', 40), valCol2X, currentY + 8);
  doc.text(truncateText(campos.correo || 'Sin especificar', 40), valCol2X, currentY + 16);

  currentY += 38; 
  
  const equiposUnificados = organizarEquiposUnificado(equiposCalibrados);

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('EQUIPOS CALIBRADOS EN SITIO', 15, currentY);
  currentY += 6;

  if (equiposUnificados.length === 0) {
    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('No se registraron equipos en sitio para esta fecha.', 105, currentY + 10, { align: 'center' });
    currentY += 20;
  } else {
    const margenIzq = 15;
    const anchoTotal = 180;
    const equiposPorFila = 5;
    const anchoColumna = anchoTotal / equiposPorFila;
    const altoFila = 5.5; 
    const altoEncabezado = 7;
    
    equiposUnificados.forEach((grupo, tecnicoIndex) => {
      grupo.equipos.sort((a, b) => a.id.localeCompare(b.id));

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

        for (let col = 0; col < equiposPorFila && equipoIndex < grupo.equipos.length; col++) {
          const equipo = grupo.equipos[equipoIndex];
          const xPos = margenIzq + (col * anchoColumna) + 2;
          const equipoTexto = truncateText(equipo.id, 16);
          
          if (equipo.estado === 'RECHAZADO') {
             doc.setTextColor(...rojoRechazo);
             doc.setFont('helvetica', 'bold');
          } else {
             doc.setTextColor(...grisTexto);
             doc.setFont('helvetica', 'normal');
          }
          
          doc.text(equipoTexto, xPos, yFila + 3.5); 
          equipoIndex++;
        }
        numFila++;
      }
      currentY += (numFilas * altoFila) + 2;

      if (tecnicoIndex < equiposUnificados.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margenIzq, currentY, margenIzq + anchoTotal, currentY);
        currentY += 2;
      }
    });
  }

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');

  if (campos.comentarios && campos.comentarios.trim()) {
    currentY += 3;
    if (currentY + 50 > 280) {
        currentY = crearNuevaPagina();
    }
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
      doc.text(line, 15, currentY + 4 + (index * 4.5)); 
    });
    currentY += 16;
  }

  const espacioMinimo = 50;
  const posicionMinimaFirmas = 195;
  const posicionFinalPagina = 225;
  
  let firmasY = (currentY < posicionMinimaFirmas) ? posicionFinalPagina : currentY + 8;
  if (currentY + espacioMinimo > 280) {
    firmasY = crearNuevaPagina();
  }
  
  const equiposUnificadosParaCalculo = organizarEquiposUnificado(equiposCalibrados);
  const totalEquipos = equiposUnificadosParaCalculo.reduce((sum, grupo) => sum + grupo.equipos.length, 0);
  
  const initialX = 15;
  const spacing = 60; 
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  doc.text('CALIDAD DEL SERVICIO:', initialX, firmasY);
  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text(campos.calidadServicio, initialX + 55, firmasY); 
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL EQUIPOS:', initialX + spacing * 2, firmasY);
  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text(totalEquipos.toString(), initialX + spacing * 2 + 38, firmasY); 
  
  firmasY += 8;

  doc.setFillColor(...grisClaro);
  doc.rect(10, firmasY, 190, 40, 'F');
  const firmaWidth = 80;
  const firmaHeight = 20;
  
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(20, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'S');
  doc.roundedRect(110, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'F');
  doc.roundedRect(110, firmasY + 2, firmaWidth, firmaHeight, 2, 2, 'S');

  try {
    if (firmaTecnico) doc.addImage(firmaTecnico, 'PNG', 25, firmasY + 4, 70, 16);
    if (firmaCliente) doc.addImage(firmaCliente, 'PNG', 115, firmasY + 4, 70, 16);
  } catch {}

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TÉCNICO RESPONSABLE', 60, firmasY + 26, { align: 'center' });
  doc.text('CLIENTE AUTORIZADO', 150, firmasY + 26, { align: 'center' });
  
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const nombreInitialY = firmasY + 30;
  const lineHeight = 4;
  const maxNombreWidth = 75;

  const tecnicoNombres = campos.tecnicoResponsable || '[Nombre del técnico]';
  const tecnicoLines = doc.splitTextToSize(tecnicoNombres, maxNombreWidth);
  tecnicoLines.forEach((line: string, index: number) => {
      doc.text(line, 60, nombreInitialY + (index * lineHeight), { align: 'center' });
  });

  const clienteNombre = campos.contacto || '[Nombre del cliente]';
  const clienteLines = doc.splitTextToSize(clienteNombre, maxNombreWidth);
  clienteLines.forEach((line: string, index: number) => {
      doc.text(line, 150, nombreInitialY + (index * lineHeight), { align: 'center' });
  });

  const pieY = 272;
  doc.setFillColor(...azulPrimario);
  doc.rect(10, pieY, 190, 8, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(52, 60, 130);
  doc.text('AG-CAL-F10-00', 12, 285);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE', 105, pieY + 4, { align: 'center' });

  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    doc.save(`HojaServicio_${campos.folio || new Date().getTime()}.pdf`);
    return null;
  }
}

const qualityMap: { [key: string]: number } = {
  'Deficiente': 1,
  'Regular': 2,
  'Bueno': 3,
  'Muy Bueno': 4,
  'Excelente': 5,
};
const qualityLabels = ['Deficiente', 'Regular', 'Bueno', 'Muy Bueno', 'Excelente'];

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
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hoverRating, setHoverRating] = useState(0);

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
      const pdfBlob = await generarPDFFormal({
        campos,
        firmaTecnico,
        firmaCliente,
        equiposCalibrados,
        outputType: 'blob',
      });

      if (!pdfBlob) {
        throw new Error("No se pudo generar el archivo PDF.");
      }

      const storagePath = `worksheets/Hojas de Servicio/${campos.folio}.pdf`;
      const storageRef = ref(storage, storagePath);

      const uploadResult = await uploadBytes(storageRef, pdfBlob as Blob);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      await saveServiceData(campos, firmaTecnico, firmaCliente, equiposCalibrados, downloadURL, storagePath);
      
      const folderPath = `worksheets/Hojas de Trabajo/${campos.folio}`;
      
      const folderRef = ref(storage, `${folderPath}/.keep`);
      await uploadBytes(folderRef, new Uint8Array([0]));

      const totalEquiposMeta = Object.values(equiposCalibrados).reduce((total, lista) => total + lista.length, 0);

      await setDoc(doc(db, 'folderMetadata', campos.folio), {
        path: folderPath,
        folderName: campos.folio,
        expectedFiles: totalEquiposMeta,
        completedFiles: 0, 
        folio: campos.folio,
        cliente: campos.empresa,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      try {
        const batch = writeBatch(db);
        const todosLosIDs = Object.values(equiposCalibrados).flat().map(eq => eq.id);
        
        const chunkSize = 30;
        for (let i = 0; i < todosLosIDs.length; i += chunkSize) {
            const chunk = todosLosIDs.slice(i, i + chunkSize);
            if(chunk.length === 0) continue;

            const qArchivos = query(collection(db, "hojasDeTrabajo"), where("id", "in", chunk));
            const querySnapshot = await getDocs(qArchivos);
            
            querySnapshot.forEach((docArchivo) => {
                batch.update(docArchivo.ref, { 
                    folio: campos.folio,
                    servicioVinculado: true 
                });
            });
        }
        await batch.commit();
        console.log("Archivos etiquetados correctamente con el folio:", campos.folio);

      } catch (error) {
        console.error("Error etiquetando archivos:", error);
      }

      const confirmManual = window.confirm(
        `✅ Servicio guardado correctamente.\n\n¿Deseas descargar el PDF y abrir el correo para adjuntarlo manualmente?`
      );

      if (confirmManual) {
        await generarPDFFormal({
            campos,
            firmaTecnico,
            firmaCliente,
            equiposCalibrados,
            outputType: 'save' 
        });

        const subject = `Hoja de Servicio ${campos.folio} - ${campos.empresa}`;
        const body = `Buenos días,

Adjunto encontrará la hoja de servicio correspondiente al día ${formatDate(campos.fecha)}.

Quedo pendiente de cualquier cosa.
Gracias.`;

        const mailtoLink = `mailto:${campos.correo || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        setTimeout(() => {
            window.location.href = mailtoLink;
        }, 1000);
      }

    } catch (error: any) {
      console.error("Error al guardar:", error);
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

  const handleEliminarEquipo = async (docId: string, equipoNombre: string) => {
    const confirmar = window.confirm(`¿Estás seguro de que deseas eliminar el equipo "${equipoNombre}" de la base de datos?\n\n⚠️ OJO: Si este equipo se registró junto con otros (separados por comas en un mismo registro), se eliminarán todos los de ese registro.`);
    if (confirmar) {
      try {
        await deleteDoc(doc(db, "hojasDeTrabajo", docId));
      } catch (error) {
        console.error("Error al eliminar el equipo:", error);
        alert("Hubo un error al eliminar el equipo. Intenta de nuevo.");
      }
    }
  };

  useEffect(() => {
    const fetchEmpresas = async () => {
      const q = query(collection(db, "clientes"));
      const qs = await getDocs(q);
      const empresasData = qs.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Empresa));
      empresasData.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setEmpresas(empresasData);
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

  // USE EFFECT REACTIVO CON ONSNAPSHOT
  useEffect(() => {
    if (!campos.empresa || !campos.fecha) {
      setEquiposCalibrados({});
      setLoadingEquipos(false);
      return;
    }

    setLoadingEquipos(true);

    const q = query(
      collection(db, "hojasDeTrabajo"),
      where("cliente", "==", campos.empresa),
      where("fecha", "==", campos.fecha)
    );

    const unsubscribe = onSnapshot(q, (qs) => {
      const equiposPorTecnico: Record<string, EquipoCalibrado[]> = {};
      
      qs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.lugarCalibracion && data.lugarCalibracion.toLowerCase().includes("sitio")) {
          const tecnico = data.tecnicoResponsable || data.tecnico || data.nombre || 'Sin Técnico';
          if (!equiposPorTecnico[tecnico]) equiposPorTecnico[tecnico] = [];
          
          const idBase = String(data.id || '').toUpperCase().trim();
          const certificadoString = String(data.certificado || '').toUpperCase().trim();
          
          const classificationString = certificadoString || idBase;
          const isAGRD = classificationString.includes('AGRD-'); 
          const estado: 'CALIBRADO' | 'RECHAZADO' = isAGRD ? 'RECHAZADO' : 'CALIBRADO';

          if (idBase) {
             equiposPorTecnico[tecnico].push({ id: idBase, docId: docSnap.id, estado: estado }); 
          }
        }
      });
      
      setEquiposCalibrados(equiposPorTecnico);

      // --- NUEVO LOGICA: AUTOCOMPLETAR CAMPO DE TÉCNICOS ---
      const nombresTecnicos = Object.keys(equiposPorTecnico).filter(nombre => nombre !== 'Sin Técnico');
      if (nombresTecnicos.length > 0) {
        // Une los nombres con comas y el último con "y"
        const nombresUnidos = nombresTecnicos.join(', ').replace(/, ([^,]*)$/, ' y $1');
        setCampos(prev => ({ ...prev, tecnicoResponsable: nombresUnidos }));
      } else {
        // Si no hay equipos cargados, limpiamos el campo
        setCampos(prev => ({ ...prev, tecnicoResponsable: '' }));
      }
      // ------------------------------------------------------

      setLoadingEquipos(false);
    }, (error) => {
      console.error("Error al cargar equipos en tiempo real:", error);
      setLoadingEquipos(false);
    });

    return () => unsubscribe();
  }, [campos.empresa, campos.fecha]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownRef]);

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

  const empresasFiltradasYAgrupadas = useMemo(() => {
    const filtradas = empresas.filter(emp =>
      emp.nombre.toLowerCase().includes(busquedaEmpresa.toLowerCase())
    );

    return filtradas.reduce((acc, emp) => {
      const primeraLetra = emp.nombre[0]?.toUpperCase() || '#';
      if (!acc[primeraLetra]) {
        acc[primeraLetra] = [];
      }
      acc[primeraLetra].push(emp);
      return acc;
    }, {} as Record<string, Empresa[]>);
  }, [empresas, busquedaEmpresa]);

  if (firmando) {
    return (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col transform transition-all">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Edit3 size={24} /></div>
                            Firma {firmando === "tecnico" ? "del Técnico" : "del Cliente"}
                        </h2>
                        <button 
                            onClick={() => setFirmando(null)}
                            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-50 transition-colors"
                        >
                            <ArrowLeft size={24} />
                        </button>
                    </div>
                    <p className="text-gray-500 mt-2 text-sm">Dibuja tu firma en el área blanca de abajo.</p>
                </div>
                <div className="p-6 bg-gray-50/50">
                    <canvas
                        ref={canvasRef}
                        width={600}
                        height={300}
                        className="border-2 border-dashed border-gray-300 rounded-xl w-full bg-white shadow-sm hover:border-blue-400 transition-colors cursor-crosshair"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onTouchStart={handlePointerDown}
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                        style={{ touchAction: 'none' }}
                    />
                </div>
                <div className="p-6 border-t border-gray-100">
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                        <button 
                            onClick={limpiarFirma}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors font-medium"
                        >
                            <RotateCcw size={18} /> Limpiar
                        </button>
                        <div className="w-full sm:w-auto flex flex-col-reverse sm:flex-row gap-3">
                            <button 
                                onClick={() => setFirmando(null)}
                                className="w-full sm:w-auto px-6 py-2.5 text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors font-medium"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={guardarFirma}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl transition-all shadow-md hover:shadow-lg font-medium"
                            >
                                <Save size={18} /> Guardar Firma
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  }
  
  const equiposUnificados = organizarEquiposUnificado(equiposCalibrados);
  const totalEquiposAtendidos = equiposUnificados.reduce((sum, grupo) => sum + grupo.equipos.length, 0);

  if (vistaPrevia) {
    const equiposUnificadosVP = equiposUnificados.map(grupo => ({
        ...grupo,
        equipos: [...grupo.equipos].sort((a, b) => a.id.localeCompare(b.id))
    }));

    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {logoImage ? (
                <div className="bg-white p-3 rounded-2xl shadow-sm">
                  <img src={logoImage} alt="Logo" className="w-16 h-16 object-contain" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-white text-blue-700 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-sm">
                  ESE
                </div>
              )}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-xl sm:text-2xl font-bold mb-2 tracking-wide">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h1>
                <p className="text-sm opacity-90 font-light">Tlaquepaque No. 140, Col. Mitras Sur Monterrey, N.L., México. C.P.64020</p>
                <p className="text-sm opacity-90 font-light">Teléfonos: 8127116538 / 8127116357</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-800 text-white py-3">
            <h2 className="text-center text-lg font-bold tracking-widest">HOJA DE SERVICIO TÉCNICO</h2>
          </div>

          <div className="p-6 bg-gray-50/50 border-b border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2"><strong className="text-gray-700">FOLIO:</strong> <span className="text-gray-900 font-medium">{campos.folio || '__________'}</span></div>
              <div className="flex items-center gap-2"><strong className="text-gray-700">FECHA:</strong> <span className="text-gray-900 font-medium">{formatDate(campos.fecha)}</span></div>
            </div>
          </div>

          <div className="p-6 border-b border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-3">
                <div className="flex flex-col"><strong className="text-gray-500 text-xs uppercase mb-1">Planta</strong> <span className="text-gray-800 font-medium">{truncateText(campos.empresa || 'Sin especificar', 35)}</span></div>
                <div className="flex flex-col"><strong className="text-gray-500 text-xs uppercase mb-1">Domicilio</strong> <span className="text-gray-800 font-medium">{truncateText(campos.direccion || 'Sin especificar', 70)}</span></div>
                <div className="flex flex-col"><strong className="text-gray-500 text-xs uppercase mb-1">Contacto</strong> <span className="text-gray-800 font-medium">{truncateText(campos.contacto || 'Sin especificar', 28)}</span></div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col"><strong className="text-gray-500 text-xs uppercase mb-1">Teléfono</strong> <span className="text-gray-800 font-medium">{truncateText(campos.telefono || 'Sin especificar', 30)}</span></div>
                <div className="flex flex-col"><strong className="text-gray-500 text-xs uppercase mb-1">Correo</strong> <span className="text-gray-800 font-medium">{truncateText(campos.correo || 'Sin especificar', 28)}</span></div>
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-bold text-blue-800 mb-6 flex items-center gap-2"><Wrench size={20}/> EQUIPOS CALIBRADOS EN SITIO</h3>
            {loadingEquipos ? (
              <div className="text-center py-6 text-gray-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={24}/> Cargando equipos...</div>
            ) : (
              equiposUnificados.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-xl text-gray-500 italic border border-gray-200">No se registraron equipos en sitio para esta fecha.</div>
              ) : (
                <div className="space-y-6">
                  {equiposUnificadosVP.map((grupo, groupIndex) => (
                      <div key={groupIndex} className="p-5 bg-blue-50/50 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 mb-4">
                          <User size={18} className="text-blue-600"/>
                          <h4 className="font-bold text-blue-900">{grupo.tecnico} <span className="text-blue-500 font-normal text-sm ml-1">({grupo.equipos.length} equipos)</span></h4>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                          {grupo.equipos.map((equipo, equipoIndex) => (
                            <div 
                              key={equipoIndex} 
                              className={`
                                  px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 shadow-sm border
                                  ${equipo.estado === 'RECHAZADO' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-700 border-gray-200'}
                              `}
                            >
                              {equipo.estado === 'RECHAZADO' ? <XCircle size={14} className="text-red-500"/> : <CheckCircle2 size={14} className="text-green-500"/>}
                              {truncateText(equipo.id, 22)}
                            </div>
                          ))}
                        </div>
                      </div>
                  ))}
                </div>
              )
            )}
          </div>
          
          {campos.comentarios && campos.comentarios.trim() && (
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h4 className="font-bold text-gray-700 mb-3 text-sm uppercase flex items-center gap-2"><FileText size={16}/> OBSERVACIONES:</h4>
              <p className="text-sm text-gray-700 bg-white p-4 rounded-xl border border-gray-200 shadow-sm leading-relaxed">
                {truncateText(campos.comentarios, 200)}
              </p>
            </div>
          )}

          <div className="p-6 border-b border-gray-100 bg-white">
            <div className="grid grid-cols-2 gap-6 text-sm bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex flex-col">
                    <strong className="text-blue-900 text-xs uppercase mb-1">Calidad del Servicio</strong>
                    <span className="font-bold text-blue-700 text-lg">{campos.calidadServicio}</span>
                </div>
                <div className="flex flex-col">
                    <strong className="text-blue-900 text-xs uppercase mb-1">Total Equipos</strong>
                    <span className="font-bold text-blue-700 text-lg">{totalEquiposAtendidos}</span>
                </div>
            </div>
          </div>

          <div className="p-8 bg-gray-50/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="flex flex-col items-center">
                <div className="w-full max-w-[240px] border-b-2 border-gray-300 h-24 flex items-end justify-center pb-2 mb-3">
                  {firmaTecnico ? (
                    <img src={firmaTecnico} alt="Firma Técnico" className="max-w-full max-h-full object-contain drop-shadow-sm" />
                  ) : (
                    <span className="text-gray-300 italic mb-2">Firma pendiente</span>
                  )}
                </div>
                <div className="text-sm font-bold text-gray-800 tracking-wide">TÉCNICO RESPONSABLE</div>
                <div className="text-xs text-gray-500 mt-1 uppercase text-center">
                    {campos.tecnicoResponsable || 'Nombre del técnico'}
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-full max-w-[240px] border-b-2 border-gray-300 h-24 flex items-end justify-center pb-2 mb-3">
                  {firmaCliente ? (
                    <img src={firmaCliente} alt="Firma Cliente" className="max-w-full max-h-full object-contain drop-shadow-sm" />
                  ) : (
                    <span className="text-gray-300 italic mb-2">Firma pendiente</span>
                  )}
                </div>
                <div className="text-sm font-bold text-gray-800 tracking-wide">CLIENTE AUTORIZADO</div>
                <div className="text-xs text-gray-500 mt-1 uppercase text-center">
                    {campos.contacto || 'Nombre del cliente'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-800 text-blue-100 p-4 text-center text-xs font-medium tracking-wide">
            DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
          <button
            onClick={() => setVistaPrevia(false)}
            className="w-full sm:w-auto bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-8 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all font-medium shadow-sm"
          >
            <Edit3 size={20} /> Editar Datos
          </button>
          <button onClick={handleDescargarPDF} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 active:bg-green-800 text-white px-8 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5">
            <Download size={20} /> Descargar PDF
          </button>
          <button onClick={handleSaveService} disabled={savingService} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white px-8 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5">
            {savingService ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            {savingService ? 'Guardando...' : 'Guardar y Finalizar'}
          </button>
        </div>
      </div>
    );
  }

  const currentRating = qualityMap[campos.calidadServicio] || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50/50 to-purple-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="flex items-center gap-5">
              {logoImage && (
                <div className="p-3 bg-blue-50 rounded-2xl shadow-sm border border-blue-100">
                  <img src={logoImage} alt="Logo" className="w-14 h-14 object-contain" />
                </div>
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Hoja de Servicio</h1>
                <p className="text-gray-500 mt-1">Genera documentos profesionales de servicio técnico</p>
              </div>
            </div>
            <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => goBack()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 hover:text-blue-600 text-gray-600 rounded-xl transition-colors font-medium shadow-sm"
              >
                <Home size={18} /> Menú
              </button>
              <button 
                onClick={() => setVistaPrevia(true)} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-6 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 font-medium"
              >
                <Eye size={18} /> Vista Previa
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-sm border border-gray-100 rounded-2xl p-6 sm:p-8 space-y-10">
          
          {/* SECCION 1 */}
          <section className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">1</div>
              <h2 className="text-lg font-semibold text-gray-900">Información Básica</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><FileText size={16} className="text-blue-500" /> Folio</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={campos.folio}
                    onChange={(e) => setCampos({ ...campos, folio: e.target.value })}
                    className="flex-1 px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                    placeholder="HSDG-0001"
                  />
                  <button 
                    onClick={generarFolioUnico} 
                    disabled={autoFolioLoading} 
                    className="px-5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition-colors font-medium flex items-center justify-center min-w-[80px]"
                  >
                    {autoFolioLoading ? <Loader2 size={18} className="animate-spin" /> : "Auto"}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><Calendar size={16} className="text-blue-500" /> Fecha de Servicio</label>
                <input
                  type="date"
                  value={campos.fecha}
                  onChange={(e) => setCampos({ ...campos, fecha: e.target.value })}
                  className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><User size={16} className="text-blue-500" /> Técnico Responsable</label>
                <textarea
                  value={campos.tecnicoResponsable}
                  onChange={(e) => setCampos({ ...campos, tecnicoResponsable: e.target.value })}
                  rows={1}
                  className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none resize-none"
                  placeholder="Se llenará automáticamente..."
                />
              </div>
            </div>
          </section>

          {/* SECCION 2 */}
          <section className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">2</div>
              <h2 className="text-lg font-semibold text-gray-900">Información del Cliente</h2>
            </div>
            <div className="space-y-6">
                <div className="space-y-2" ref={dropdownRef}>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><Building size={16} className="text-emerald-500" /> Empresa / Planta</label>
                <div className="relative">
                    <button
                    onClick={() => setDropdownAbierto(!dropdownAbierto)}
                    className="w-full flex justify-between items-center text-left px-4 py-3 bg-white border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                    >
                    <span className={campos.empresa ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                        {campos.empresa || 'Seleccionar empresa...'}
                    </span>
                    <ChevronDown size={20} className={`text-gray-400 transition-transform duration-200 ${dropdownAbierto ? 'transform rotate-180' : ''}`} />
                    </button>

                    {dropdownAbierto && (
                    <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-80 overflow-y-auto overflow-x-hidden">
                        <div className="p-3 sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-100">
                        <div className="relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                            type="text"
                            placeholder="Buscar empresa..."
                            value={busquedaEmpresa}
                            onChange={(e) => setBusquedaEmpresa(e.target.value)}
                            className="w-full px-4 py-2 pl-10 bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg focus:bg-white focus:border-emerald-500 outline-none transition-colors"
                            />
                        </div>
                        </div>
                        {Object.keys(empresasFiltradasYAgrupadas).length > 0 ? (
                        Object.keys(empresasFiltradasYAgrupadas).map(letra => (
                            <div key={letra}>
                            <div className="px-4 py-1.5 bg-gray-50 text-xs font-bold text-gray-500 sticky top-[69px] border-y border-gray-100 uppercase">
                                {letra}
                            </div>
                            <ul className="py-1">
                                {empresasFiltradasYAgrupadas[letra].map(emp => (
                                <li
                                    key={emp.id}
                                    onClick={() => {
                                    setCampos({ ...campos, empresaId: emp.id });
                                    setDropdownAbierto(false);
                                    setBusquedaEmpresa('');
                                    }}
                                    className="px-4 py-2.5 cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-gray-700 font-medium"
                                >
                                    {emp.nombre}
                                </li>
                                ))}
                            </ul>
                            </div>
                        ))
                        ) : (
                        <div className="px-4 py-6 text-center text-gray-500 italic">No se encontraron empresas.</div>
                        )}
                    </div>
                    )}
                </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><Building size={16} className="text-emerald-500" /> Domicilio</label>
                    <input type="text" value={campos.direccion} onChange={(e) => setCampos({ ...campos, direccion: e.target.value })} className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none" placeholder="Dirección completa" />
                </div>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><User size={16} className="text-emerald-500" /> Contacto</label>
                    <input type="text" value={campos.contacto} onChange={(e) => setCampos({ ...campos, contacto: e.target.value })} className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none" placeholder="Nombre del contacto" />
                </div>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><Phone size={16} className="text-emerald-500" /> Teléfono</label>
                    <input type="text" value={campos.telefono} onChange={(e) => setCampos({ ...campos, telefono: e.target.value })} className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none" placeholder="(81) 1234-5678" />
                </div>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><Mail size={16} className="text-emerald-500" /> Correo</label>
                    <input type="email" value={campos.correo} onChange={(e) => setCampos({ ...campos, correo: e.target.value })} className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none" placeholder="contacto@empresa.com" />
                </div>
                </div>
            </div>
          </section>

          {/* SECCION 3 */}
          <section className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">3</div>
              <h2 className="text-lg font-semibold text-gray-900">Observaciones y Calidad</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><FileText size={16} className="text-purple-500" /> Comentarios Extras</label>
                <textarea value={campos.comentarios} onChange={(e) => setCampos({ ...campos, comentarios: e.target.value })} rows={4} className="w-full px-4 py-3 bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none resize-none" placeholder="Anota cualquier observación importante..." />
              </div>
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><Star size={16} className="text-purple-500" /> Nivel de Calidad</label>
                <div className="flex flex-col gap-4">
                    <div 
                        className="flex items-center gap-3 cursor-pointer p-4 bg-white rounded-xl border border-gray-200 shadow-sm w-fit"
                        onMouseLeave={() => setHoverRating(0)}
                    >
                        {[1, 2, 3, 4, 5].map((rating) => (
                            <Wrench
                                key={rating}
                                size={28}
                                className={`transition-all duration-200 ease-out hover:scale-125 hover:-rotate-12 ${
                                (hoverRating || currentRating) >= rating ? 'text-purple-500 drop-shadow-sm' : 'text-gray-200'
                                }`}
                                onMouseEnter={() => setHoverRating(rating)}
                                onClick={() => {
                                    const newQuality = qualityLabels[rating - 1];
                                    setCampos({ ...campos, calidadServicio: newQuality });
                                }}
                            />
                        ))}
                    </div>
                    <span className="font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-4 py-1.5 rounded-lg text-sm text-center w-fit shadow-sm">
                        { qualityLabels[(hoverRating || currentRating) - 1] || 'Selecciona una calificación' }
                    </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECCION 4 */}
          <section className="bg-orange-50/30 rounded-2xl p-6 border border-orange-100">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-100 text-orange-700 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">4</div>
                    <h2 className="text-lg font-semibold text-gray-900">Equipos Calibrados en Sitio</h2>
                </div>
                <div className="text-sm font-medium text-orange-700 bg-orange-100 px-3 py-1 rounded-full border border-orange-200">
                    Total: {totalEquiposAtendidos}
                </div>
            </div>
            
            <div className="bg-white border border-orange-100 rounded-xl p-4 sm:p-6 shadow-sm min-h-[150px]">
              {loadingEquipos ? (
                <div className="text-center py-10 flex flex-col items-center justify-center h-full">
                  <Loader2 className="animate-spin mb-3 text-orange-500" size={32} />
                  <p className="text-orange-800 font-medium">Sincronizando equipos...</p>
                </div>
              ) : (
                equiposUnificados.length === 0 ? (
                  <div className="text-center py-10 text-orange-400 flex flex-col items-center justify-center h-full">
                    <FileText className="mb-3 opacity-50" size={48} />
                    <p className="text-lg font-semibold text-orange-800 mb-1">Sin equipos registrados</p>
                    <p className="text-sm text-orange-600">Asegúrate de seleccionar una empresa y fecha válidas.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {equiposUnificados.map(grupo => {
                        const equiposOrdenados = [...grupo.equipos].sort((a, b) => a.id.localeCompare(b.id));

                        return (
                          <div key={grupo.tecnico} className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                              <h4 className="font-bold text-gray-800 text-base flex items-center gap-2">
                                <User size={18} className="text-orange-500" />
                                {grupo.tecnico}
                              </h4>
                              <span className="text-gray-500 text-sm font-medium">
                                {grupo.equipos.length} equipos atendidos
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                              {equiposOrdenados.map((equipo, equipoIndex) => (
                                <div 
                                    key={`${equipo.docId}-${equipoIndex}`} 
                                    className={`
                                        group relative px-4 py-2 pr-9 rounded-full text-xs sm:text-sm font-medium text-center truncate border shadow-sm transition-all duration-200
                                        ${equipo.estado === 'RECHAZADO' 
                                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
                                            : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}
                                    `}
                                    title={equipo.estado === 'RECHAZADO' ? 'RECHAZADO' : 'CALIBRADO'}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {equipo.estado === 'RECHAZADO' ? <XCircle size={14} className="text-red-500"/> : <CheckCircle2 size={14} className="text-green-500"/>}
                                    {equipo.id}
                                  </span>
                                  <button
                                    onClick={() => handleEliminarEquipo(equipo.docId, equipo.id)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/90 hover:bg-white rounded-full shadow-sm hover:scale-110"
                                    title="Eliminar de la base de datos"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                    })}
                  </div>
                )
              )}
            </div>
          </section>

          {/* SECCION 5 */}
          <section className="bg-indigo-50/30 rounded-2xl p-6 border border-indigo-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">5</div>
              <h2 className="text-lg font-semibold text-gray-900">Firmas Digitales</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                <label className="flex items-center justify-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Técnico Responsable
                </label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50 h-32 flex items-center justify-center overflow-hidden transition-colors hover:border-indigo-300">
                  {firmaTecnico ? <img src={firmaTecnico} alt="Firma Técnico" className="max-w-full max-h-full object-contain drop-shadow-sm" /> : <div className="text-center text-gray-400"><Edit3 className="mx-auto mb-2 opacity-50" size={28} /><p className="text-xs">Espacio para firma</p></div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => comenzarFirma('tecnico')} className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2.5 px-4 rounded-xl transition-colors font-medium">
                    <Edit3 size={16} />{firmaTecnico ? 'Re-firmar' : 'Firmar aquí'}
                  </button>
                  {firmaTecnico && <button onClick={() => borrarFirma('tecnico')} className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2.5 px-4 rounded-xl transition-colors"><Trash2 size={16} /></button>}
                </div>
              </div>

              <div className="space-y-4 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                <label className="flex items-center justify-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Cliente Autorizado
                </label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50 h-32 flex items-center justify-center overflow-hidden transition-colors hover:border-indigo-300">
                  {firmaCliente ? <img src={firmaCliente} alt="Firma Cliente" className="max-w-full max-h-full object-contain drop-shadow-sm" /> : <div className="text-center text-gray-400"><Edit3 className="mx-auto mb-2 opacity-50" size={28} /><p className="text-xs">Espacio para firma</p></div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => comenzarFirma('cliente')} className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2.5 px-4 rounded-xl transition-colors font-medium">
                    <Edit3 size={16} />{firmaCliente ? 'Re-firmar' : 'Firmar aquí'}
                  </button>
                  {firmaCliente && <button onClick={() => borrarFirma('cliente')} className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2.5 px-4 rounded-xl transition-colors"><Trash2 size={16} /></button>}
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col sm:flex-row justify-end gap-4 pt-6 mt-6 border-t border-gray-100">
            <button onClick={handleDescargarPDF} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-8 py-3.5 rounded-xl transition-all font-medium shadow-sm">
              <Download size={20} className="text-gray-500" />
              Descargar Borrador
            </button>
            <button onClick={handleSaveService} disabled={savingService} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white px-10 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 font-medium">
              {savingService ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {savingService ? 'Guardando en la nube...' : 'Finalizar Servicio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}