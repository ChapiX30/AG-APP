import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Star, Edit3, ArrowLeft, Loader2, Home, Trash2, RotateCcw, Save, Eye, User, Building, Calendar, FileText, Phone, Mail, Search, ChevronDown
} from 'lucide-react';
import { useNavigation } from '../hooks/useNavigation';
// IMPORTACIONES ADICIONALES PARA FIREBASE STORAGE
import { db, storage } from '../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
  equiposCalibrados: Record<string, any[]>;
  outputType?: 'save' | 'blob';
}) {
  const jsPDF = (await import('jspdf')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  
  const azulPrimario = [104, 131, 145];
  const azulSecundario = [52, 144, 220];
  const grisTexto = [60, 60, 60];
  const grisClaro = [240, 242, 247];

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
    doc.text(`FOLIO: ${campos.folio} | ${campos.fecha} | ${truncateText(campos.empresa, 25)}`, 15, 13);
    return 25;
  }

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

  doc.setFillColor(...azulPrimario);
  doc.rect(0, 34, 210, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HOJA DE SERVICIO TÉCNICO', 105, 42, { align: 'center' });

  let currentY = 50;

  // --- SECCIÓN DE INFORMACIÓN BÁSICA MODIFICADA ---
  doc.setFillColor(...grisClaro);
  doc.roundedRect(10, currentY, 190, 15, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 15, 2, 2, 'S');
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('FOLIO:', 15, currentY + 6);
  doc.text('FECHA:', 105, currentY + 6); // Re-posicionado para mejor distribución
  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.text(campos.folio || '__________', 30, currentY + 6);
  doc.text(campos.fecha || '__________', 120, currentY + 6); // Re-posicionado
  
  currentY += 19;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, currentY, 190, 30, 2, 2, 'F');
  doc.setDrawColor(...azulSecundario);
  doc.setLineWidth(0.5);
  doc.roundedRect(10, currentY, 190, 30, 2, 2, 'S');
  doc.setDrawColor(...azulSecundario);
  doc.line(105, currentY, 105, currentY + 30);
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Planta:', 15, currentY + 7);
  doc.text('Domicilio:', 15, currentY + 15);
  doc.text('Contacto:', 15, currentY + 23);
  doc.text('Teléfono:', 110, currentY + 7);
  doc.text('Correo:', 110, currentY + 15);

  doc.setTextColor(...grisTexto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(truncateText(campos.empresa || '', 35), 30, currentY + 7);
  doc.text(truncateText(campos.direccion || '', 32), 38, currentY + 15);
  doc.text(truncateText(campos.contacto || '', 28), 33, currentY + 23);
  doc.text(truncateText(campos.telefono || '', 30), 130, currentY + 7);
  doc.text(truncateText(campos.correo || '', 28), 125, currentY + 15);

  currentY += 34;
  
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

  const espacioMinimo = 50;
  const posicionMinimaFirmas = 195;
  const posicionFinalPagina = 225;
  
  let firmasY = (currentY < posicionMinimaFirmas) ? posicionFinalPagina : currentY + 8;
  if (currentY + espacioMinimo > 280) {
    firmasY = crearNuevaPagina();
  }
  
  doc.setTextColor(...azulPrimario);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CALIDAD DEL SERVICIO:', 15, firmasY);
  doc.setTextColor(...azulSecundario);
  doc.setFont('helvetica', 'bold');
  doc.text(campos.calidadServicio, 70, firmasY);
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

      const uploadResult = await uploadBytes(storageRef, pdfBlob);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      await saveServiceData(campos, firmaTecnico, firmaCliente, equiposCalibrados, downloadURL, storagePath);
      
      alert(`✅ Hoja de servicio guardada exitosamente con folio: ${campos.folio}. El PDF se ha subido al Drive.`);

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
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-2 sm:p-4 z-50">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl flex flex-col">
                <div className="p-4 sm:p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-3">
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
                    <p className="text-gray-600 mt-2 text-sm sm:text-base">Dibuja tu firma en el área blanca de abajo.</p>
                </div>
                <div className="p-2 sm:p-4 bg-gray-50">
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
                <div className="p-4 sm:p-6 border-t border-gray-200">
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                        <button 
                            onClick={limpiarFirma}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all"
                        >
                            <RotateCcw size={18} />
                            Limpiar
                        </button>
                        <div className="w-full sm:w-auto flex flex-col-reverse sm:flex-row gap-3">
                            <button 
                                onClick={() => setFirmando(null)}
                                className="w-full sm:w-auto px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={guardarFirma}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg"
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
      <div className="min-h-screen bg-gray-50 p-2 sm:p-4">
        <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
          {/* Encabezado */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {logoImage ? (
                <img src={logoImage} alt="Logo" className="w-16 h-16 object-contain bg-white rounded-full p-2" />
              ) : (
                <div className="w-16 h-16 bg-white text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                  ESE
                </div>
              )}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-lg sm:text-xl font-bold mb-1">EQUIPOS Y SERVICIOS ESPECIALIZADOS AG, S.A. DE C.V.</h1>
                <p className="text-xs sm:text-sm opacity-90">Calle Chichen Itza No. 1123, Col. Balcones de Anáhuac, San Nicolás de los Garza, N.L., México, C.P. 66422</p>
                <p className="text-xs sm:text-sm opacity-90">Teléfonos: 8127116538 / 8127116357</p>
              </div>
            </div>
          </div>

          {/* Título */}
          <div className="bg-blue-700 text-white py-3">
            <h2 className="text-center text-lg sm:text-xl font-bold">HOJA DE SERVICIO TÉCNICO</h2>
          </div>

          {/* Información básica */}
          <div className="p-4 sm:p-6 bg-gray-50 border-b">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><strong>FOLIO:</strong> {campos.folio || '__________'}</div>
              <div><strong>FECHA:</strong> {campos.fecha || '__________'}</div>
            </div>
          </div>

          {/* Información del cliente */}
          <div className="p-4 sm:p-6 border-b">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
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
          <div className="p-4 sm:p-6 border-b">
            <h3 className="text-base sm:text-lg font-bold text-blue-700 mb-4">EQUIPOS CALIBRADOS EN SITIO</h3>
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-sm">
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
            <div className="p-4 sm:p-6 border-b bg-gray-50">
              <h4 className="font-bold text-blue-700 mb-2">OBSERVACIONES:</h4>
              <p className="text-sm text-gray-700 bg-white p-3 rounded border">
                {truncateText(campos.comentarios, 200)}
              </p>
            </div>
          )}

          {/* Calidad del servicio */}
          <div className="p-4 sm:p-6 border-b">
            <div className="text-sm">
              <strong className="text-blue-700">CALIDAD DEL SERVICIO:</strong>
              <span className="ml-2 font-semibold text-blue-600">{campos.calidadServicio}</span>
            </div>
          </div>

          {/* Firmas */}
          <div className="p-4 sm:p-6 bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="text-center">
                <div className="border border-gray-300 rounded-lg p-4 mb-2 h-24 flex items-center justify-center bg-white">
                  {firmaTecnico ? (
                    <img src={firmaTecnico} alt="Firma Técnico" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-gray-400">[Firma del técnico]</span>
                  )}
                </div>
                <div className="text-sm font-bold text-blue-700">TÉCNICO RESPONSABLE</div>
                <div className="text-xs text-gray-600 whitespace-pre-wrap">
                    {campos.tecnicoResponsable || '[Nombre del técnico]'}
                </div>
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
                <div className="text-xs text-gray-600 whitespace-pre-wrap">
                    {campos.contacto || '[Nombre del cliente]'}
                </div>
              </div>
            </div>
          </div>

          {/* Pie de página */}
          <div className="bg-blue-700 text-white p-3 text-center text-xs font-bold">
            DOCUMENTO VÁLIDO CON FIRMA DEL TÉCNICO RESPONSABLE Y AUTORIZACIÓN DEL CLIENTE
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-6">
          <button
            onClick={() => setVistaPrevia(false)}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Edit3 size={20} />
            Editar
          </button>
          <button onClick={handleDescargarPDF} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
            <Download size={20} />
            Descargar PDF
          </button>
          <button onClick={handleSaveService} disabled={savingService} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
            {savingService ? <Loader2 size={20} className="animate-spin" /> : <Star size={20} />}
            {savingService ? 'Guardando...' : 'Guardar Servicio'}
          </button>
        </div>
      </div>
    );
  }

  // FORMULARIO PRINCIPAL PROFESIONAL
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-2 sm:p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header Profesional */}
        <div className="bg-white rounded-t-xl shadow-lg p-4 sm:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              {logoImage && (
                <img src={logoImage} alt="Logo" className="w-12 h-12 object-contain" />
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Hoja de Servicio</h1>
                <p className="text-gray-600 text-sm sm:text-base">Genera documentos profesionales de servicio</p>
              </div>
            </div>
            <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => goBack()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-all"
              >
                <Home size={20} />
                <span>Menú</span>
              </button>
              <button 
                onClick={() => setVistaPrevia(true)} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all shadow-lg"
              >
                <Eye size={20} />
                <span>Vista Previa</span>
              </button>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-white shadow-lg rounded-b-xl p-4 sm:p-8">
          {/* Sección 1: Información Básica */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Información Básica</h2>
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
                <textarea
                  value={campos.tecnicoResponsable}
                  onChange={(e) => setCampos({ ...campos, tecnicoResponsable: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                  placeholder="Nombre(s) de técnico(s)..."
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Información del Cliente */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Información del Cliente</h2>
            </div>
            
            <div className="space-y-2 mb-6" ref={dropdownRef}>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Building size={16} className="text-green-600" />
                Empresa / Planta
              </label>
              <div className="relative">
                <button
                  onClick={() => setDropdownAbierto(!dropdownAbierto)}
                  className="w-full flex justify-between items-center text-left px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                >
                  <span className={campos.empresa ? 'text-gray-800' : 'text-gray-400'}>
                    {campos.empresa || 'Seleccionar empresa...'}
                  </span>
                  <ChevronDown size={20} className={`text-gray-500 transition-transform ${dropdownAbierto ? 'transform rotate-180' : ''}`} />
                </button>

                {dropdownAbierto && (
                  <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                    <div className="p-2 sticky top-0 bg-white border-b">
                      <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar empresa..."
                          value={busquedaEmpresa}
                          onChange={(e) => setBusquedaEmpresa(e.target.value)}
                          className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-1 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>
                    </div>
                    {Object.keys(empresasFiltradasYAgrupadas).length > 0 ? (
                      Object.keys(empresasFiltradasYAgrupadas).map(letra => (
                        <div key={letra}>
                          <div className="px-4 py-1 bg-gray-100 text-sm font-bold text-gray-600 sticky top-[57px]">
                            {letra}
                          </div>
                          <ul>
                            {empresasFiltradasYAgrupadas[letra].map(emp => (
                              <li
                                key={emp.id}
                                onClick={() => {
                                  setCampos({ ...campos, empresaId: emp.id });
                                  setDropdownAbierto(false);
                                  setBusquedaEmpresa('');
                                }}
                                className="px-4 py-2 cursor-pointer hover:bg-green-50 transition-colors text-gray-700"
                              >
                                {emp.nombre}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-center text-gray-500">
                        No se encontraron empresas.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Building size={16} className="text-green-600" />
                  Domicilio
                </label>
                <input type="text" value={campos.direccion} onChange={(e) => setCampos({ ...campos, direccion: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all" placeholder="Dirección completa" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={16} className="text-green-600" />
                  Persona de Contacto
                </label>
                <input type="text" value={campos.contacto} onChange={(e) => setCampos({ ...campos, contacto: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all" placeholder="Nombre del contacto" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Phone size={16} className="text-green-600" />
                  Teléfono
                </label>
                <input type="text" value={campos.telefono} onChange={(e) => setCampos({ ...campos, telefono: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all" placeholder="(81) 1234-5678" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Mail size={16} className="text-green-600" />
                  Correo Electrónico
                </label>
                <input type="email" value={campos.correo} onChange={(e) => setCampos({ ...campos, correo: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all" placeholder="contacto@empresa.com" />
              </div>
            </div>
          </div>

          {/* Sección 3: Observaciones y Calidad */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">3</div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Observaciones y Calidad</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <FileText size={16} className="text-purple-600" />
                  Comentarios / Observaciones
                </label>
                <textarea value={campos.comentarios} onChange={(e) => setCampos({ ...campos, comentarios: e.target.value })} rows={4} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none" placeholder="Observaciones importantes del servicio..." />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Star size={16} className="text-purple-600" />
                  Calidad del Servicio
                </label>
                <select value={campos.calidadServicio} onChange={(e) => setCampos({ ...campos, calidadServicio: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white">
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
              <div className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">4</div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Equipos Calibrados en Sitio</h2>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 sm:p-6">
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
                          <div key={groupIndex} className="bg-white rounded-lg border border-orange-300 p-4 shadow-sm">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                              <h4 className="font-bold text-orange-800 text-base sm:text-lg flex items-center gap-2">
                                <User size={20} />
                                {grupo.tecnico}
                              </h4>
                              <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-semibold">
                                {grupo.equipos.length} equipos
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {grupo.equipos.map((equipo, equipoIndex) => (
                                <div key={equipoIndex} className="bg-orange-100 text-orange-800 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-center truncate">
                                  {equipo}
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
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">5</div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Firmas Digitales</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Firma Técnico */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Edit3 size={16} className="text-indigo-600" />
                  Firma del Técnico
                </label>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 bg-indigo-50 h-40 flex items-center justify-center">
                  {firmaTecnico ? <img src={firmaTecnico} alt="Firma Técnico" className="max-w-full max-h-full object-contain" /> : <div className="text-center"><Edit3 className="mx-auto mb-2 text-indigo-400" size={32} /><p className="text-indigo-600">No hay firma</p></div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => comenzarFirma('tecnico')} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-all">
                    <Edit3 size={16} />{firmaTecnico ? 'Cambiar Firma' : 'Firmar'}
                  </button>
                  {firmaTecnico && <button onClick={() => borrarFirma('tecnico')} className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-all"><Trash2 size={16} /></button>}
                </div>
              </div>

              {/* Firma Cliente */}
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Edit3 size={16} className="text-indigo-600" />
                  Firma del Cliente
                </label>
                <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 bg-indigo-50 h-40 flex items-center justify-center">
                  {firmaCliente ? <img src={firmaCliente} alt="Firma Cliente" className="max-w-full max-h-full object-contain" /> : <div className="text-center"><Edit3 className="mx-auto mb-2 text-indigo-400" size={32} /><p className="text-indigo-600">No hay firma</p></div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => comenzarFirma('cliente')} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-all">
                    <Edit3 size={16} />{firmaCliente ? 'Cambiar Firma' : 'Firmar'}
                  </button>
                  {firmaCliente && <button onClick={() => borrarFirma('cliente')} className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-all"><Trash2 size={16} /></button>}
                </div>
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-8 border-t border-gray-200">
            <button onClick={handleDescargarPDF} className="w-full sm:w-auto flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg transition-all shadow-lg font-semibold">
              <Download size={20} />
              Descargar PDF
            </button>
            <button onClick={handleSaveService} disabled={savingService} className="w-full sm:w-auto flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-8 py-4 rounded-lg transition-all shadow-lg font-semibold">
              {savingService ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {savingService ? 'Guardando...' : 'Guardar Servicio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}