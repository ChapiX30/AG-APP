import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Star, Edit3, ArrowLeft, Loader2, Home, Trash2, RotateCcw, Save, Eye, User, Building, Calendar, FileText, Phone, Mail, Search, ChevronDown, Wrench, CheckCircle2, XCircle
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { writeDriveFileMetadata } from '../utils/driveFileMetadata';
import {
  collection, getDocs, query, where, doc, getDoc,
  setDoc, addDoc, Timestamp, writeBatch,
  onSnapshot, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { getAuth } from 'firebase/auth';
import { finalizeServicioFromHoja, registerServicioInicioFromWorksheet } from '../utils/servicioAutomation';
import { encolarCorreoHojaServicio } from '../utils/notificacionesHojaServicio';
import { watchAlertaCorreo } from '../utils/alertaCorreoWatcher';
import { useAuth } from '../hooks/useAuth';
import toast, { Toaster } from 'react-hot-toast';
import logoImage from '../assets/lab_logo.png';
import { ScreenShell } from './ui/ScreenShell';

/** Colores corporativos AG — únicos permitidos en esta pantalla y su PDF */
const AG_BLUE = '#2464A3';
const AG_GRAY = '#8B8D8C';

/**
 * UI V2 (pantalla). PDF: diseño original.
 * Para revertir también la pantalla: usa `HojaDeServicioScreen.backup.tsx`.
 */
export const HOJA_SERVICIO_DESIGN_VERSION = 'v2-ui' as const;

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
  servicioId: '',
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

  const azulPrimario = [36, 100, 163];
  const azulSecundario = [45, 114, 184];
  const grisTexto = [60, 60, 60];
  const grisClaro = [240, 242, 247];
  const rojoRechazo = [200, 0, 0];

  function crearNuevaPagina() {
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 20, 'F');

    doc.setTextColor(...azulPrimario);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG', 15, 10);

    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`FOLIO: ${campos.folio} | ${formatDate(campos.fecha)} | ${truncateText(campos.empresa, 25)}`, 15, 15);
    return 25;
  }

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 35, 'F');

  try {
    const logoBase64 = await getLogoBase64();
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', 15, 8, 28, 22, undefined, 'FAST');
    }
  } catch {}

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.', 48, 16);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Tlaquepaque No. 140, Col. Mitras Sur Monterrey, N.L., México. C.P. 64020', 48, 22);

  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text('Teléfonos:', 48, 27);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text('8127116538 / 8127116357', 66, 27);

  doc.setFillColor(...azulPrimario);
  doc.rect(0, 35, 210, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('HOJA DE SERVICIO TÉCNICO', 105, 43, { align: 'center' });

  let currentY = 53;

  doc.setFillColor(245, 247, 250);
  doc.rect(10, currentY, 190, 10, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.2);
  doc.rect(10, currentY, 190, 10, 'S');

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FOLIO:', 15, currentY + 7);

  doc.setTextColor(...azulSecundario);
  doc.text(campos.folio || '__________', 30, currentY + 7);

  doc.setTextColor(...azulPrimario);
  doc.text('FECHA DEL SERVICIO:', 120, currentY + 7);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(campos.fecha), 162, currentY + 7);

  currentY += 18;

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DATOS DEL CLIENTE', 10, currentY);

  currentY += 2;
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.4);
  doc.line(10, currentY, 200, currentY);
  currentY += 6;

  const col1 = 12;
  const val1 = 35;
  const col2 = 110;
  const val2 = 128;

  doc.setFontSize(9);

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Planta:', col1, currentY);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(truncateText(campos.empresa || 'Sin especificar', 45), val1, currentY);

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono:', col2, currentY);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(truncateText(campos.telefono || 'Sin especificar', 40), val2, currentY);

  currentY += 8;

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Contacto:', col1, currentY);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(truncateText(campos.contacto || 'Sin especificar', 45), val1, currentY);

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Correo:', col2, currentY);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(truncateText(campos.correo || 'Sin especificar', 40), val2, currentY);

  currentY += 8;

  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio:', col1, currentY);
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');

  const direccionLines = doc.splitTextToSize(campos.direccion || 'Sin especificar', 155);
  doc.text(direccionLines, val1, currentY);

  currentY += (direccionLines.length * 4.5) + 6;

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
  doc.setTextColor(29, 80, 130);
  doc.text('AG-CAL-F10-00', 12, 285);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE', 105, pieY + 4, { align: 'center' });

  if (outputType === 'blob') {
    return doc.output('blob');
  }
  doc.save(`HojaServicio_${campos.folio || new Date().getTime()}.pdf`);
  return null;
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
  const servicioInicioSyncRef = useRef<Set<string>>(new Set());
  const { goBack } = useNavigation();
  const { user } = useAuth();
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

      try {
        await writeDriveFileMetadata(storagePath, uploadResult, campos.tecnicoResponsable || "Desconocido", {
          workDate: campos.fecha,
        });
      } catch (metaErr) {
        console.error("[HojaDeServicio] Error al registrar metadata en Drive:", metaErr);
      }

      await saveServiceData(campos, firmaTecnico, firmaCliente, equiposCalibrados, downloadURL, storagePath);

      try {
        const finalizedAt = new Date();
        if (campos.fecha && (campos.empresaId || campos.empresa)) {
          const finalizedIds = await finalizeServicioFromHoja({
            servicioId: campos.servicioId || undefined,
            clienteId: campos.empresaId || undefined,
            clienteNombre: campos.empresa || undefined,
            fecha: campos.fecha,
            finalizedAt,
          });
          if (finalizedIds.length > 0) {
            toast.success('Servicio actualizado en Friday y Dashboard TV');
          } else {
            toast('Hoja guardada. No se encontró un servicio activo de ese día para finalizar.', {
              icon: 'ℹ️',
              duration: 5000,
            });
          }
        }
      } catch (finalizeError) {
        console.error('Error al finalizar servicio vinculado:', finalizeError);
        toast.error('Hoja guardada, pero no se pudo finalizar el servicio en el calendario.');
      }
      
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

      // =====================================================================
      // NOTIFICACIÓN AUTOMÁTICA A CALIDAD/ADMINISTRACIÓN
      // =====================================================================
      try {
        const usersSnap = await getDocs(collection(db, 'usuarios'));
        
        let destinatarios = usersSnap.docs
            .filter(d => {
                const rol = (d.data().role || d.data().puesto || '').toLowerCase();
                return rol.includes('calidad') || rol.includes('admin') || rol.includes('gerente');
            })
            .map(d => d.id);
        
        if (destinatarios.length === 0) {
            destinatarios = usersSnap.docs.map(d => d.id);
        }

        // Título y cuerpo claros y concretos
        const notifTitle = 'Servicio Finalizado';
        const notifBody  = `${campos.tecnicoResponsable || 'Técnico'} completó el servicio de ${campos.empresa} — Folio ${campos.folio}`;

        await addDoc(collection(db, 'notificaciones'), {
          type:        'success',
          title:       notifTitle,
          body:        notifBody,
          autorNombre: 'Sistema AG',
          readBy:      [],
          destinatarios,
          timestamp:   serverTimestamp(),
          global:      true,
          // ─── Campos extra para FCM / Service Worker ───────────────────────
          // El SW lee payload.data para construir la notificación nativa.
          // Todos los valores deben ser strings (restricción de FCM data messages).
          fcmData: {
            title:   notifTitle,
            body:    notifBody,
            type:    'success',
            folio:   campos.folio,
            empresa: campos.empresa,
            url:     '/hoja-servicio',
          },
        });
        
        console.log("Notificación enviada a Calidad/Admin.");
      } catch (err) {
        console.error("Error enviando notificación automática:", err);
      }
      // =====================================================================

      toast.success(`Servicio ${campos.folio} guardado correctamente`);

      const gruposCorreo = organizarEquiposUnificado(equiposCalibrados).map((g) => ({
        tecnico: g.tecnico,
        equipos: g.equipos.map((e) => ({ id: e.id, estado: e.estado })),
      }));
      const totalEq = gruposCorreo.reduce((n, g) => n + g.equipos.length, 0);

      if (campos.correo?.trim()) {
        try {
          const alertId = await encolarCorreoHojaServicio({
            folio: campos.folio,
            empresa: campos.empresa,
            fecha: campos.fecha,
            correoCliente: campos.correo,
            contacto: campos.contacto,
            tecnicoResponsable: campos.tecnicoResponsable,
            calidadServicio: campos.calidadServicio,
            comentarios: campos.comentarios,
            pdfURL: downloadURL,
            storagePath,
            gruposEquipos: gruposCorreo,
            totalEquipos: totalEq,
            autorNombre: user?.name,
            autorUid: user?.id,
          });
          watchAlertaCorreo('alertasHojaServicio', alertId, {
            loadingMessage: 'Enviando hoja de servicio por correo...',
            successMessage: `Correo enviado a ${campos.correo}`,
          });
        } catch (mailErr) {
          console.error(mailErr);
          toast.error(
            mailErr instanceof Error ? mailErr.message : 'No se pudo encolar el correo al cliente.'
          );
        }
      } else {
        toast('Servicio guardado. Agrega el correo del cliente para enviar la hoja automáticamente.', {
          icon: 'ℹ️',
          duration: 5000,
        });
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
    const linkedServicioId = localStorage.getItem('hoja_servicio_id');
    if (linkedServicioId) {
      setCampos((c) => ({ ...c, servicioId: linkedServicioId }));
      localStorage.removeItem('hoja_servicio_id');
    }
  }, []);

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
      let earliestSitioMs: number | null = null;

      qs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.lugarCalibracion && data.lugarCalibracion.toLowerCase().includes("sitio")) {
          const tecnico = data.tecnicoResponsable || data.tecnico || data.nombre || 'Sin Técnico';
          if (!equiposPorTecnico[tecnico]) equiposPorTecnico[tecnico] = [];

          const ts = new Date(data.createdAt || data.timestamp || 0).getTime();
          if (ts > 0 && (earliestSitioMs === null || ts < earliestSitioMs)) {
            earliestSitioMs = ts;
          }

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

      if (earliestSitioMs !== null && campos.empresa && campos.fecha) {
        const syncKey = `${campos.empresaId}|${campos.empresa}|${campos.fecha}`;
        if (!servicioInicioSyncRef.current.has(syncKey)) {
          servicioInicioSyncRef.current.add(syncKey);
          void registerServicioInicioFromWorksheet({
            fecha: campos.fecha,
            clienteId: campos.empresaId || undefined,
            clienteNombre: campos.empresa,
            startedAt: new Date(earliestSitioMs),
          })
            .then((ids) => {
              if (ids.length === 0) servicioInicioSyncRef.current.delete(syncKey);
            })
            .catch((err) => {
              servicioInicioSyncRef.current.delete(syncKey);
              console.error('[HojaDeServicio] Recuperación inicio servicio:', err);
            });
        }
      }

      setEquiposCalibrados(equiposPorTecnico);

      const nombresTecnicos = Object.keys(equiposPorTecnico).filter(nombre => nombre !== 'Sin Técnico');
      if (nombresTecnicos.length > 0) {
        const nombresUnidos = nombresTecnicos.join(', ').replace(/, ([^,]*)$/, ' y $1');
        setCampos(prev => ({ ...prev, tecnicoResponsable: nombresUnidos }));
      } else {
        setCampos(prev => ({ ...prev, tecnicoResponsable: '' }));
      }
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
    ctx.strokeStyle = AG_BLUE;
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
            <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl flex flex-col">
                <div className="p-4 sm:p-5 border-b border-[#8B8D8C]/20">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg sm:text-xl font-bold text-[#2464A3] flex items-center gap-2">
                            <div className="p-1.5 bg-[#2464A3]/10 text-[#2464A3] rounded-lg"><Edit3 size={20} /></div>
                            Firma {firmando === "tecnico" ? "del Técnico" : "del Cliente"}
                        </h2>
                        <button
                            onClick={() => setFirmando(null)}
                            className="text-[#8B8D8C] hover:text-[#2464A3] p-2 rounded-lg hover:bg-[#8B8D8C]/10 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    </div>
                    <p className="text-[#8B8D8C] mt-1.5 text-sm">Dibuja tu firma en el área blanca.</p>
                </div>
                <div className="p-4 sm:p-5 bg-[#8B8D8C]/5">
                    <canvas
                        ref={canvasRef}
                        width={600}
                        height={300}
                        className="border-2 border-dashed border-[#8B8D8C]/40 rounded-lg w-full max-h-[40vh] bg-white hover:border-[#2464A3] transition-colors cursor-crosshair"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onTouchStart={handlePointerDown}
                        onTouchMove={handlePointerMove}
                        onTouchEnd={handlePointerUp}
                        style={{ touchAction: 'none' }}
                    />
                </div>
                <div className="p-4 sm:p-5 border-t border-[#8B8D8C]/20">
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3">
                        <button
                            onClick={limpiarFirma}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-[#8B8D8C] bg-[#8B8D8C]/10 hover:bg-[#8B8D8C]/20 rounded-lg transition-colors font-medium text-sm"
                        >
                            <RotateCcw size={16} /> Limpiar
                        </button>
                        <div className="w-full sm:w-auto flex flex-col-reverse sm:flex-row gap-2">
                            <button
                                onClick={() => setFirmando(null)}
                                className="w-full sm:w-auto px-5 py-2 text-[#8B8D8C] bg-white border border-[#8B8D8C]/30 hover:bg-[#8B8D8C]/5 rounded-lg transition-colors font-medium text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={guardarFirma}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 bg-[#2464A3] hover:opacity-90 text-white rounded-lg transition-all font-medium text-sm"
                            >
                                <Save size={16} /> Guardar Firma
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
      <ScreenShell variant="scroll" className="bg-[#8B8D8C]/5">
        <Toaster
          position="top-center"
          toastOptions={{ duration: 4000, style: { borderRadius: 12, fontSize: 13, fontWeight: 600 } }}
        />
        <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-24 sm:pb-8">
          <div className="bg-white shadow-md rounded-xl overflow-hidden border border-[#8B8D8C]/20">
            <div className="p-4 sm:p-5 border-b border-[#8B8D8C]/20">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {logoImage ? (
                  <div className="bg-white p-2 rounded-lg border border-[#8B8D8C]/20 shrink-0">
                    <img src={logoImage} alt="Logo" className="w-12 h-12 sm:w-14 sm:h-14 object-contain" />
                  </div>
                ) : (
                  <div className="w-14 h-14 bg-white text-[#2464A3] rounded-lg flex items-center justify-center font-bold text-lg border border-[#8B8D8C]/20">ESE</div>
                )}
                <div className="flex-1 text-center sm:text-left min-w-0">
                  <h1 className="text-sm sm:text-base font-bold text-[#2464A3] leading-snug">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h1>
                  <p className="text-xs text-[#8B8D8C] mt-1">Tlaquepaque No. 140, Col. Mitras Sur Monterrey, N.L., México. C.P. 64020</p>
                  <p className="text-xs text-[#8B8D8C]">Teléfonos: 8127116538 / 8127116357</p>
                </div>
              </div>
            </div>

            <div className="bg-[#2464A3] text-white py-2.5">
              <h2 className="text-center text-sm sm:text-base font-bold tracking-wide">HOJA DE SERVICIO TÉCNICO</h2>
            </div>

            <div className="p-4 sm:p-5 bg-[#8B8D8C]/5 border-b border-[#8B8D8C]/15">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="font-bold text-[#2464A3]">FOLIO: </span><span className="text-[#8B8D8C]">{campos.folio || '__________'}</span></div>
                <div><span className="font-bold text-[#2464A3]">FECHA: </span><span className="text-[#8B8D8C]">{formatDate(campos.fecha)}</span></div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-b border-[#8B8D8C]/15">
              <h3 className="text-xs font-bold text-[#2464A3] uppercase mb-3 border-b border-[#2464A3]/30 pb-1">Datos del cliente</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2.5">
                  <div><span className="text-[#2464A3] font-semibold text-xs uppercase block mb-0.5">Planta</span><span className="text-[#8B8D8C]">{campos.empresa || 'Sin especificar'}</span></div>
                  <div><span className="text-[#2464A3] font-semibold text-xs uppercase block mb-0.5">Domicilio</span><span className="text-[#8B8D8C]">{campos.direccion || 'Sin especificar'}</span></div>
                  <div><span className="text-[#2464A3] font-semibold text-xs uppercase block mb-0.5">Contacto</span><span className="text-[#8B8D8C]">{campos.contacto || 'Sin especificar'}</span></div>
                </div>
                <div className="space-y-2.5">
                  <div><span className="text-[#2464A3] font-semibold text-xs uppercase block mb-0.5">Teléfono</span><span className="text-[#8B8D8C]">{campos.telefono || 'Sin especificar'}</span></div>
                  <div><span className="text-[#2464A3] font-semibold text-xs uppercase block mb-0.5">Correo</span><span className="text-[#8B8D8C]">{campos.correo || 'Sin especificar'}</span></div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-b border-[#8B8D8C]/15">
              <h3 className="text-xs font-bold text-[#2464A3] uppercase mb-3 flex items-center gap-2 border-b border-[#2464A3]/30 pb-1"><Wrench size={16}/> Equipos calibrados en sitio</h3>
              {loadingEquipos ? (
                <div className="text-center py-5 text-[#8B8D8C] flex flex-col items-center text-sm"><Loader2 className="animate-spin mb-2" size={20}/> Cargando equipos...</div>
              ) : equiposUnificados.length === 0 ? (
                <div className="text-center py-5 bg-[#8B8D8C]/5 rounded-lg text-[#8B8D8C] italic text-sm border border-[#8B8D8C]/20">No se registraron equipos en sitio para esta fecha.</div>
              ) : (
                <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                  {equiposUnificadosVP.map((grupo, groupIndex) => (
                    <div key={groupIndex} className="rounded-lg border border-[#8B8D8C]/20 overflow-hidden">
                      <div className="px-3 py-2 bg-[#2464A3] text-white text-sm font-semibold flex items-center gap-2">
                        <User size={14}/> {grupo.tecnico} <span className="font-normal opacity-90">({grupo.equipos.length})</span>
                      </div>
                      <div className="p-3 flex flex-wrap gap-1.5 text-xs sm:text-sm bg-white">
                        {grupo.equipos.map((equipo, equipoIndex) => (
                          <span
                            key={equipoIndex}
                            className={`px-2.5 py-1 rounded-md border flex items-center gap-1 ${
                              equipo.estado === 'RECHAZADO'
                                ? 'border-[#8B8D8C] text-[#8B8D8C] font-bold bg-[#8B8D8C]/10'
                                : 'border-[#2464A3]/30 text-[#8B8D8C] bg-[#2464A3]/5'
                            }`}
                          >
                            {equipo.estado === 'RECHAZADO' ? <XCircle size={12}/> : <CheckCircle2 size={12} className="text-[#2464A3]"/>}
                            {truncateText(equipo.id, 24)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {campos.comentarios?.trim() && (
              <div className="p-4 sm:p-5 border-b border-[#8B8D8C]/15 bg-[#8B8D8C]/5">
                <h4 className="font-bold text-[#2464A3] mb-2 text-xs uppercase flex items-center gap-2"><FileText size={14}/> Observaciones</h4>
                <p className="text-sm text-[#8B8D8C] bg-white p-3 rounded-lg border border-[#8B8D8C]/20 leading-relaxed">{campos.comentarios}</p>
              </div>
            )}

            <div className="p-4 sm:p-5 border-b border-[#8B8D8C]/15">
              <div className="grid grid-cols-2 gap-4 text-sm bg-[#2464A3]/5 p-3 rounded-lg border border-[#2464A3]/20">
                <div><span className="text-[#2464A3] text-xs uppercase font-semibold block mb-0.5">Calidad</span><span className="font-bold text-[#2464A3]">{campos.calidadServicio}</span></div>
                <div><span className="text-[#2464A3] text-xs uppercase font-semibold block mb-0.5">Total equipos</span><span className="font-bold text-[#2464A3]">{totalEquiposAtendidos}</span></div>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-[#8B8D8C]/5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {(['tecnico', 'cliente'] as const).map((tipo) => {
                  const firma = tipo === 'tecnico' ? firmaTecnico : firmaCliente;
                  const titulo = tipo === 'tecnico' ? 'TÉCNICO RESPONSABLE' : 'CLIENTE AUTORIZADO';
                  const nombre = tipo === 'tecnico' ? (campos.tecnicoResponsable || 'Nombre del técnico') : (campos.contacto || 'Nombre del cliente');
                  return (
                    <div key={tipo} className="flex flex-col items-center">
                      <div className="w-full max-w-[200px] border border-[#8B8D8C]/30 rounded-lg h-20 sm:h-24 flex items-end justify-center pb-1 mb-2 bg-white">
                        {firma ? <img src={firma} alt={titulo} className="max-w-full max-h-full object-contain" /> : <span className="text-[#8B8D8C]/50 italic text-xs mb-2">Firma pendiente</span>}
                      </div>
                      <div className="text-xs font-bold text-[#2464A3]">{titulo}</div>
                      <div className="text-xs text-[#8B8D8C] mt-0.5 text-center">{nombre}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#2464A3] text-white p-3 text-center text-[10px] sm:text-xs font-medium">
              DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 sm:static sm:mt-6 p-3 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur-sm border-t sm:border-0 border-[#8B8D8C]/20 z-40">
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
              <button onClick={() => setVistaPrevia(false)} className="w-full sm:w-auto bg-white border border-[#8B8D8C]/30 hover:bg-[#8B8D8C]/5 text-[#8B8D8C] px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium">
                <Edit3 size={18} /> Editar
              </button>
              <button onClick={handleDescargarPDF} className="w-full sm:w-auto bg-[#8B8D8C]/15 hover:bg-[#8B8D8C]/25 text-[#2464A3] border border-[#8B8D8C]/30 px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium">
                <Download size={18} /> Descargar PDF
              </button>
              <button onClick={handleSaveService} disabled={savingService} className="w-full sm:w-auto bg-[#2464A3] hover:opacity-90 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium">
                {savingService ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {savingService ? 'Guardando...' : 'Guardar y Finalizar'}
              </button>
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  const currentRating = qualityMap[campos.calidadServicio] || 0;

  const inputCls =
    'w-full px-3 py-2 sm:py-2.5 bg-white text-[#8B8D8C] placeholder-[#8B8D8C]/50 border border-[#8B8D8C]/30 rounded-lg focus:border-[#2464A3] focus:ring-2 focus:ring-[#2464A3]/15 outline-none text-sm transition-all';
  const sectionCls = 'rounded-lg border border-[#8B8D8C]/20 bg-[#8B8D8C]/5 p-4 sm:p-5';
  const sectionBadge = 'w-7 h-7 bg-[#2464A3]/10 text-[#2464A3] rounded-md flex items-center justify-center text-xs font-bold shrink-0';

  return (
    <ScreenShell variant="scroll" className="bg-[#8B8D8C]/5">
      <Toaster
        position="top-center"
        toastOptions={{ duration: 4000, style: { borderRadius: 12, fontSize: 13, fontWeight: 600 } }}
      />
      <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-28 sm:pb-8">
        <div className="bg-white shadow-sm border border-[#8B8D8C]/20 rounded-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 sm:p-5 border-b border-[#8B8D8C]/15">
            <div className="flex items-center gap-3 min-w-0">
              {logoImage && (
                <div className="p-2 bg-[#2464A3]/5 rounded-lg border border-[#8B8D8C]/20 shrink-0">
                  <img src={logoImage} alt="Logo" className="w-10 h-10 sm:w-11 sm:h-11 object-contain" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-[#2464A3] truncate">Hoja de Servicio</h1>
                <p className="text-[#8B8D8C] text-xs sm:text-sm mt-0.5 line-clamp-2">
                  Al finalizar se envía el PDF al cliente por correo
                </p>
              </div>
            </div>
            <div className="w-full sm:w-auto flex gap-2 shrink-0">
              <button
                onClick={() => goBack()}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-[#8B8D8C]/30 hover:bg-[#8B8D8C]/5 text-[#8B8D8C] rounded-lg text-sm font-medium"
              >
                <Home size={16} /> Menú
              </button>
              <button
                onClick={() => setVistaPrevia(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2464A3] hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                <Eye size={16} /> Vista Previa
              </button>
            </div>
          </div>

        <div className="p-4 sm:p-5 space-y-5 sm:space-y-6">
          
          <section className={sectionCls}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className={sectionBadge}>1</div>
              <h2 className="text-base font-semibold text-[#2464A3]">Información básica</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><FileText size={14} /> Folio</label>
                <div className="flex gap-2">
                  <input type="text" value={campos.folio} onChange={(e) => setCampos({ ...campos, folio: e.target.value })} className={`flex-1 ${inputCls}`} placeholder="HSDG-0001" />
                  <button onClick={generarFolioUnico} disabled={autoFolioLoading} className="px-3 py-2 bg-[#2464A3]/10 hover:bg-[#2464A3]/20 text-[#2464A3] border border-[#2464A3]/30 rounded-lg text-sm font-medium min-w-[64px] flex items-center justify-center">
                    {autoFolioLoading ? <Loader2 size={16} className="animate-spin" /> : 'Auto'}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><Calendar size={14} /> Fecha de servicio</label>
                <input type="date" value={campos.fecha} onChange={(e) => setCampos({ ...campos, fecha: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><User size={14} /> Técnico responsable</label>
                <textarea value={campos.tecnicoResponsable} onChange={(e) => setCampos({ ...campos, tecnicoResponsable: e.target.value })} rows={1} className={`${inputCls} resize-none`} placeholder="Se llenará automáticamente..." />
              </div>
            </div>
          </section>

          <section className={sectionCls}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className={sectionBadge}>2</div>
              <h2 className="text-base font-semibold text-[#2464A3]">Información del cliente</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5" ref={dropdownRef}>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><Building size={14} /> Empresa / Planta</label>
                <div className="relative">
                  <button onClick={() => setDropdownAbierto(!dropdownAbierto)} className={`w-full flex justify-between items-center text-left ${inputCls}`}>
                    <span className={`truncate ${campos.empresa ? 'font-medium' : 'opacity-60'}`}>{campos.empresa || 'Seleccionar empresa...'}</span>
                    <ChevronDown size={18} className={`text-[#8B8D8C] shrink-0 ml-2 transition-transform ${dropdownAbierto ? 'rotate-180' : ''}`} />
                  </button>
                  {dropdownAbierto && (
                    <div className="absolute z-20 w-full mt-1.5 bg-white border border-[#8B8D8C]/30 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2 sticky top-0 bg-white border-b border-[#8B8D8C]/15">
                        <div className="relative">
                          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B8D8C]" />
                          <input type="text" placeholder="Buscar empresa..." value={busquedaEmpresa} onChange={(e) => setBusquedaEmpresa(e.target.value)} className="w-full pl-8 pr-3 py-2 text-sm border border-[#8B8D8C]/30 rounded-md focus:border-[#2464A3] outline-none" />
                        </div>
                      </div>
                      {Object.keys(empresasFiltradasYAgrupadas).length > 0 ? (
                        Object.keys(empresasFiltradasYAgrupadas).map((letra) => (
                          <div key={letra}>
                            <div className="px-3 py-1 bg-[#8B8D8C]/10 text-[10px] font-bold text-[#8B8D8C] sticky top-[49px] border-y border-[#8B8D8C]/15 uppercase">{letra}</div>
                            <ul>
                              {empresasFiltradasYAgrupadas[letra].map((emp) => (
                                <li key={emp.id} onClick={() => { setCampos({ ...campos, empresaId: emp.id }); setDropdownAbierto(false); setBusquedaEmpresa(''); }} className="px-3 py-2 cursor-pointer hover:bg-[#2464A3]/10 hover:text-[#2464A3] text-sm text-[#8B8D8C] font-medium">
                                  {emp.nombre}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-[#8B8D8C] italic text-sm">No se encontraron empresas.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><Building size={14} /> Domicilio</label>
                  <input type="text" value={campos.direccion} onChange={(e) => setCampos({ ...campos, direccion: e.target.value })} className={inputCls} placeholder="Dirección completa" />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><User size={14} /> Contacto</label>
                  <input type="text" value={campos.contacto} onChange={(e) => setCampos({ ...campos, contacto: e.target.value })} className={inputCls} placeholder="Nombre del contacto" />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><Phone size={14} /> Teléfono</label>
                  <input type="text" value={campos.telefono} onChange={(e) => setCampos({ ...campos, telefono: e.target.value })} className={inputCls} placeholder="(81) 1234-5678" />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><Mail size={14} /> Correo</label>
                  <input type="email" value={campos.correo} onChange={(e) => setCampos({ ...campos, correo: e.target.value })} className={inputCls} placeholder="contacto@empresa.com" />
                </div>
              </div>
            </div>
          </section>

          <section className={sectionCls}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className={sectionBadge}>3</div>
              <h2 className="text-base font-semibold text-[#2464A3]">Observaciones y calidad</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><FileText size={14} /> Comentarios</label>
                <textarea value={campos.comentarios} onChange={(e) => setCampos({ ...campos, comentarios: e.target.value })} rows={3} className={`${inputCls} resize-none`} placeholder="Observaciones importantes..." />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#2464A3]"><Star size={14} /> Nivel de calidad</label>
                <div className="flex flex-col gap-2" onMouseLeave={() => setHoverRating(0)}>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-[#8B8D8C]/20 w-fit">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <Wrench
                        key={rating}
                        size={22}
                        className={`transition-all cursor-pointer ${(hoverRating || currentRating) >= rating ? 'text-[#2464A3]' : 'text-[#8B8D8C]/30'}`}
                        onMouseEnter={() => setHoverRating(rating)}
                        onClick={() => setCampos({ ...campos, calidadServicio: qualityLabels[rating - 1] })}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-[#2464A3] bg-[#2464A3]/10 border border-[#2464A3]/20 px-3 py-1 rounded-md w-fit">
                    {qualityLabels[(hoverRating || currentRating) - 1] || 'Selecciona calificación'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className={sectionCls}>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-2.5">
                <div className={sectionBadge}>4</div>
                <h2 className="text-base font-semibold text-[#2464A3]">Equipos en sitio</h2>
              </div>
              <span className="text-xs font-semibold text-[#2464A3] bg-[#2464A3]/10 px-2.5 py-1 rounded-full border border-[#2464A3]/20">
                Total: {totalEquiposAtendidos}
              </span>
            </div>
            <div className="bg-white border border-[#8B8D8C]/20 rounded-lg p-3 sm:p-4 min-h-[120px] max-h-72 overflow-y-auto">
              {loadingEquipos ? (
                <div className="text-center py-8 flex flex-col items-center text-[#8B8D8C] text-sm">
                  <Loader2 className="animate-spin mb-2 text-[#2464A3]" size={24} />
                  Sincronizando equipos...
                </div>
              ) : equiposUnificados.length === 0 ? (
                <div className="text-center py-8 text-[#8B8D8C] flex flex-col items-center">
                  <FileText className="mb-2 opacity-40" size={32} />
                  <p className="font-semibold text-[#2464A3] text-sm">Sin equipos registrados</p>
                  <p className="text-xs mt-1">Selecciona empresa y fecha válidas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {equiposUnificados.map((grupo) => {
                    const equiposOrdenados = [...grupo.equipos].sort((a, b) => a.id.localeCompare(b.id));
                    return (
                      <div key={grupo.tecnico} className="rounded-lg border border-[#8B8D8C]/20 overflow-hidden">
                        <div className="px-3 py-2 bg-[#2464A3] text-white text-sm font-semibold flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 truncate"><User size={14} /> {grupo.tecnico}</span>
                          <span className="text-xs font-normal opacity-90 shrink-0">{grupo.equipos.length} eq.</span>
                        </div>
                        <div className="p-2.5 flex flex-wrap gap-1.5 bg-white">
                          {equiposOrdenados.map((equipo, equipoIndex) => (
                            <div
                              key={`${equipo.docId}-${equipoIndex}`}
                              className={`group relative pl-2 pr-7 py-1.5 rounded-md text-xs border ${
                                equipo.estado === 'RECHAZADO'
                                  ? 'border-[#8B8D8C] text-[#8B8D8C] font-bold bg-[#8B8D8C]/10'
                                  : 'border-[#2464A3]/25 text-[#8B8D8C] bg-[#2464A3]/5'
                              }`}
                              title={equipo.estado === 'RECHAZADO' ? 'RECHAZADO' : 'CALIBRADO'}
                            >
                              <span className="flex items-center gap-1">
                                {equipo.estado === 'RECHAZADO' ? <XCircle size={12} /> : <CheckCircle2 size={12} className="text-[#2464A3]" />}
                                <span className="truncate max-w-[140px] sm:max-w-none">{equipo.id}</span>
                              </span>
                              <button
                                onClick={() => handleEliminarEquipo(equipo.docId, equipo.id)}
                                className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 text-[#8B8D8C] hover:text-[#2464A3] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                title="Eliminar de la base de datos"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className={sectionCls}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className={sectionBadge}>5</div>
              <h2 className="text-base font-semibold text-[#2464A3]">Firmas digitales</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['tecnico', 'cliente'] as const).map((tipo) => {
                const firma = tipo === 'tecnico' ? firmaTecnico : firmaCliente;
                const label = tipo === 'tecnico' ? 'Técnico responsable' : 'Cliente autorizado';
                return (
                  <div key={tipo} className="space-y-2.5 bg-white p-3 sm:p-4 rounded-lg border border-[#8B8D8C]/20">
                    <label className="block text-center text-xs font-bold text-[#2464A3] uppercase tracking-wide">{label}</label>
                    <div className="border border-dashed border-[#8B8D8C]/40 rounded-lg p-2 bg-[#8B8D8C]/5 h-24 sm:h-28 flex items-center justify-center overflow-hidden hover:border-[#2464A3] transition-colors">
                      {firma ? (
                        <img src={firma} alt={label} className="max-w-full max-h-full object-contain" />
                      ) : (
                        <div className="text-center text-[#8B8D8C]"><Edit3 className="mx-auto mb-1 opacity-50" size={22} /><p className="text-[10px]">Espacio para firma</p></div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => comenzarFirma(tipo)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#2464A3]/10 hover:bg-[#2464A3]/20 text-[#2464A3] border border-[#2464A3]/25 py-2 px-3 rounded-lg text-sm font-medium">
                        <Edit3 size={14} />{firma ? 'Re-firmar' : 'Firmar'}
                      </button>
                      {firma && (
                        <button onClick={() => borrarFirma(tipo)} className="px-3 py-2 text-[#8B8D8C] border border-[#8B8D8C]/30 hover:bg-[#8B8D8C]/10 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 sm:static sm:mt-4 p-3 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur-sm border-t sm:border-0 border-[#8B8D8C]/20 z-30">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:justify-end gap-2">
            <button onClick={handleDescargarPDF} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-[#8B8D8C]/30 hover:bg-[#8B8D8C]/5 text-[#8B8D8C] px-5 py-2.5 rounded-lg text-sm font-medium">
              <Download size={18} /> Descargar borrador
            </button>
            <button onClick={handleSaveService} disabled={savingService} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#2464A3] hover:opacity-90 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium">
              {savingService ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {savingService ? 'Guardando...' : 'Finalizar servicio'}
            </button>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}