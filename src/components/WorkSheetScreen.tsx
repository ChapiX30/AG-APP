import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigation } from "../hooks/useNavigation";
import {
  ArrowLeft,
  Save,
  X,
  Calendar,
  MapPin,
  Mail,
  Building2,
  Wrench,
  Tag,
  Hash,
  Loader2,
  NotebookPen,
  Edit3,
  Zap, // NUEVO: Icono para indicar transferencia automática
  Search, // Icono para el buscador
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { storage, db } from "../utils/firebase";
import { collection, addDoc, query, getDocs, where, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import masterCelestica from "../data/masterCelestica.json";
import masterTechops from "../data/masterTechops.json";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  set,
  isBefore, 
  format, 
  addMonths, 
  addYears, 
} from "date-fns"; 

type ClienteRecord = {
  id: string;
  nombre: string;
}

type CelesticaRecord = {
  A: string; // ID
  B: string; // Equipo
  C: string; // Marca
  D: string; // Modelo
  E: string; // Número de Serie
};

type TechopsRecord = {
  A: string; // ID
  B: string; // NOMBRE (equipo)
  C: string; // MARCA
  D: string; // MODELO
  E: string; // SERIE
}

// ====================================================================
// Componente de búsqueda para clientes MEJORADO (Agrupación por letra)
// ====================================================================
interface ClienteSearchSelectProps {
    clientes: ClienteRecord[];
    onSelect: (cliente: string) => void;
    currentValue: string;
}

const ClienteSearchSelect: React.FC<ClienteSearchSelectProps> = ({ clientes, onSelect, currentValue }) => {
    const [searchTerm, setSearchTerm] = useState(currentValue);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Filtra y agrupa los clientes por la primera letra de su nombre
    const filteredAndGroupedClientes = React.useMemo(() => {
        const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const grouped: Record<string, ClienteRecord[]> = {};

        const filtered = clientes
            .filter(cliente => 
                cliente.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)
            )
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        filtered.forEach(cliente => {
            const firstLetter = cliente.nombre.charAt(0).toUpperCase();
            if (!grouped[firstLetter]) {
                grouped[firstLetter] = [];
            }
            grouped[firstLetter].push(cliente);
        });

        return grouped;
    }, [clientes, searchTerm]);

    const handleSelect = (clienteNombre: string) => {
        setSearchTerm(clienteNombre);
        onSelect(clienteNombre);
        setIsOpen(false);
    };
    
    // Cierra el desplegable si se hace clic fuera
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Sincroniza el searchTerm con currentValue cuando cambia externamente
    useEffect(() => {
        setSearchTerm(currentValue);
    }, [currentValue]);

    const sortedLetters = Object.keys(filteredAndGroupedClientes).sort();

    return (
        <div className="relative" ref={wrapperRef}>
            {/* Input de búsqueda */}
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Buscar o seleccionar cliente..."
                    className={`w-full p-4 border rounded-lg pr-10 focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                        isOpen ? 'rounded-b-none border-b-0' : ''
                    }`}
                    aria-label="Buscar cliente"
                />
                <Search className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Desplegable de resultados con grupos */}
            {isOpen && (
                <div className="absolute z-20 w-full bg-white border border-gray-300 max-h-80 overflow-y-auto rounded-b-lg shadow-xl">
                    {sortedLetters.length > 0 ? (
                        sortedLetters.map(letter => (
                            <div key={letter}>
                                {/* Encabezado de la letra: Sticky para mejor UX */}
                                <div className="sticky top-0 bg-gray-100 px-3 py-2 text-sm font-bold text-blue-700 border-b border-gray-200 shadow-sm">
                                    {letter}
                                </div>
                                {/* Lista de clientes para la letra */}
                                <ul>
                                    {filteredAndGroupedClientes[letter].map(cliente => (
                                        <li
                                            key={cliente.id}
                                            className="px-4 py-3 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm truncate transition-colors duration-150"
                                            onClick={() => handleSelect(cliente.nombre)}
                                            role="option"
                                            aria-selected={searchTerm === cliente.nombre}
                                        >
                                            {cliente.nombre}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 text-gray-500 text-sm">No se encontraron clientes.</div>
                    )}
                </div>
            )}
        </div>
    );
};

// ====================================================================
// FIN del Componente ClienteSearchSelect
// ====================================================================


// Helper para obtener la fecha local en formato YYYY-MM-DD (FIX DE FECHA)
const getLocalISODate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper para sacar el nombre automáticamente del usuario logueado
const getUserName = (user: any) => {
  if (!user) return "Sin Usuario";
  const name =
    user.displayName ||
    user.name ||
    user.nombre ||
    user.firstName ||
    user.given_name ||
    user.profile?.name ||
    user.profile?.displayName ||
    (user.email
      ? user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
      : null) ||
    user.uid ||
    "Sin Usuario";
  return name;
};

// Mapea el código del consecutivo a la magnitud
const extractMagnitudFromConsecutivo = (consecutivo: string): string => {
  if (!consecutivo) return "";
  const m: Record<string, string> = {
    AGAC: "Acustica",
    AGD: "Dimensional",
    AGF: "Fuerza",
    AGP: "Presión",
    AGEL: "Electrica",
    AGT: "Temperatura",
    AGM: "Masa",
    AGVBT: "Vibracion",
    AGQ: "Quimica",
    AGOT: "Optica",
    AGFL: "Flujo",
    AGRD: "Reporte de Diagnostico",
    AGTI: "Tiempo",
    VE: "Velocidad",
    AGPT: "Par Torsional",
  };
  const parts = consecutivo.split("-");
  if (parts.length >= 2 && m[parts[1]]) {
    return m[parts[1]];
  }
  // fallback: buscar substring
  for (const [code, mag] of Object.entries(m)) {
    if (consecutivo.includes(code)) return mag;
    }
  return "";
};

const magnitudesDisponibles = [
  "Acustica",
  "Dimensional",
  "Fuerza",
  "Flujo",
  "Frecuencia",
  "Presión",
  "Quimica",
  "Electrica",
  "Temperatura",
  "Masa",
  "Optica",
  "Reporte de Diagnostico",
  "Tiempo",
  "Velocidad",
  "Vacio",
  "Vibracion",
  "Par Torsional",
];

const unidadesPorMagnitud: Record<string, any> = {
  Acustica: ["dB", "Hz", "Pa"],
  Dimensional: ["m", "cm", "mm", "in", "min", "°", "µm"],
  Fuerza: ["N", "kgf", "lbf"],
  Flujo: ["m3/h", "slpm", "lpm", "scfm", "cfh", "m3/pm", "gpm", "ccm", "SCMH", "SCFH"],
  Frecuencia: ["RPM", "Hz", "kHz", "MHz", "GHz", "rad/s"],
  Presión: ["kPa", "bar", "mBar", "psi", "InH2O", "MPa", "Pa", "mmH20"],
  Quimica: ["µS", "pH"],
  Electrica: {
    DC: ["mV", "V", "A", "µA", "mA", "Ω"],
    AC: ["mV", "V", "A", "µA", "mA", "Ω"],
    Otros: ["Hz", "kHz", "MHz"], // Si necesitas frecuencia
  },
  Temperatura: ["°C", "°F", "°K"],
  Optica: ["BRIX", "°"],
  Masa: ["g", "kg", "lb"],
  Tiempo: ["s", "min", "h"],
  "Reporte de Diagnostico": ["check"],
  Velocidad: ["m/s", "km/h"],
  Vacio: ["atm", "Psi", "mbar", "Torr", "mmHg", "micron", "inHg"],
  Vibracion: ["g", "rad/s"],
  "Par Torsional": ["N*m", "Lbf*ft", "kgf*cm", "Lbf*in", "c*N", "oz*in", "oz*ft"],
};

const findTechopsById = (id: string): TechopsRecord | null => {
  if (!id) return null;
  const normalized = String(id).trim();
  const records = (masterTechops as TechopsRecord[]).filter(
    (r) => String(r.A ?? "").trim() === normalized
  );
  if (records.length === 0) return null;
  if (records.length > 1) {
    console.warn(`Multiple Techops records found for ID "${id}"`, records);
  }
  return records[0];
};

const findCelesticaById = (id: string): CelesticaRecord | null => {
  if (!id) return null;
  const normalized = String(id).trim();
  const records = (masterCelestica as CelesticaRecord[]).filter(
    (r) => String(r.A ?? "").trim() === normalized
  );
  if (records.length === 0) return null;
  if (records.length > 1) {
    console.warn(`Multiple Celestica records found for ID "${id}"`, records);
  }
  return records[0];
};

const isMexicoMROClient = (cliente?: string) => {
  if (!cliente) return false;
  const n = cliente.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (n.includes("mexico") || n.includes("mx")) && n.includes("mro");
};

// FIX: Lógica de calcularSiguienteFecha ajustada para crear fechas sin desfase de zona horaria
function calcularSiguienteFecha(fechaUltima: string, frecuencia: string): Date | null {
  // Manejo de valores nulos o vacíos
  if (!fechaUltima || !frecuencia) return null;

  // FIX: Se interpreta la fecha de la última calibración de forma segura (YYYY, MM-1, DD)
  const parts = fechaUltima.split('-');
  if (parts.length !== 3) return null;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

  if (isNaN(date.getTime())) return null; // Si la fecha no es válida

  // Normalizar la frecuencia para asegurar el match
  const lowerFrecuencia = frecuencia.toLowerCase();

  if (lowerFrecuencia.includes("mes")) {
    // Determinar el número de meses
    let meses = 0;
    if (lowerFrecuencia.includes("3")) meses = 3;
    else if (lowerFrecuencia.includes("6")) meses = 6;
    else return null; // Frecuencia de meses no reconocida

    // Usar addMonths de date-fns
    return addMonths(date, meses);
  }

  if (lowerFrecuencia.includes("año") || lowerFrecuencia.includes("ano")) {
    // Determinar el número de años
    let años = 0;
    if (lowerFrecuencia.includes("2")) años = 2;
    else if (lowerFrecuencia.includes("3")) años = 3;
    else if (lowerFrecuencia.includes("1")) años = 1;
    else años = 1; // Por defecto 1 año si dice 'año' o 'ano' sin número

    // Usar addYears de date-fns
    return addYears(date, años);
  }

  return null;
}

// NUEVO: Función para transferir worksheet a Friday
const transferToFriday = async (formData: any, userId: string, user: any) => {
  try {
    console.log('Datos que se intentan transferir a Friday:', formData);

    // 1. Obtener el tablero principal
    const boardRef = doc(db, "tableros", "principal");
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      alert("Tablero principal no existe, no se puede transferir");
      return false;
    }

    const boardData = boardSnap.data();
    let { groups = [] } = boardData;

    // 2. DETERMINA EL GRUPO DESTINO
    const lugar = (formData.lugarCalibracion || "").toLowerCase();
    let destinoGroupId = "laboratorio";
    let destinoGroupName = "Equipos en Laboratorio";
    let destinoColorIdx = 1;
    if (lugar === "sitio") {
      destinoGroupId = "sitio";
      destinoGroupName = "Servicio en Sitio";
      destinoColorIdx = 0;
    }

    // 3. Busca o crea el grupo correcto
    let destinoGroup = groups.find((g: any) => g.id === destinoGroupId);
    if (!destinoGroup) {
      destinoGroup = {
      id: destinoGroupId,
      name: destinoGroupName,
      colorIdx: destinoColorIdx,
      collapsed: false,
      rows: [],
      };
      groups.push(destinoGroup);
    }
    const groupIndex = groups.findIndex((g: any) => g.id === destinoGroupId);

    const getLocalDateString = () => {
      const hoy = new Date();
      const year = hoy.getFullYear();
      const month = String(hoy.getMonth() + 1).padStart(2, "0");
      const day = String(hoy.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // 4. Genera el objeto newRow con los CAMPOS CORRECTOS para FridayScreen
    const newRow = {
      certificado: formData.certificado || "",
      cliente: formData.cliente || formData.clienteSeleccionado || "Sin especificar",
      id: formData.id || "",
      equipo: formData.equipo || "Sin especificar",
      marca: formData.marca || "",
      modelo: formData.modelo || "",
      serie: formData.numeroSerie || "",
      lugarCalibracion: (formData.lugarCalibracion || "").toLowerCase() === "sitio" ? "sitio" : "laboratorio",
      status: "pending",
      priority: "medium",
      assignedTo: user?.uid || "unknown",
      dueDate: formData.fecha || getLocalDateString(),
      createdAt: getLocalDateString(),
      lastUpdated: getLocalDateString(),
    };

    // 5. Inserta la fila al grupo correcto
    if (groupIndex !== -1) {
      groups[groupIndex].rows.push(newRow);
    } else {
      alert("No se encontró el grupo destino para insertar la fila.");
      return false;
    }

    // 6. Justo antes de actualizar, log de debug
    console.log("Grupos antes de updateDoc:", JSON.stringify(groups, null, 2));

    // 7. Actualizar el tablero en Firestore
    await updateDoc(boardRef, {
      groups,
      columns: boardData.columns || [],
      updatedAt: Date.now(),
    });

    alert("Transferencia exitosa al tablero Friday");
    return true;
  } catch (error) {
    console.error("❌ Error al transferir al tablero Friday:", error);
    alert("Error al transferir al tablero Friday: " + error);
    return false;
  }
};


// FIX: Se modifica la función para generar PDF (mejor maquetación y sin logo roto)
const generateTemplatePDF = (formData: any, JsPDF: any) => {
  // Ajuste de formato para mejor uso del espacio
  const doc = new jsPDF({ orientation:"p", unit: "pt", format: "a4" });
  
  const marginLeft = 50;
  const marginRight = 550;
  const lineHeight = 18;
  let y = 50; // Posición inicial
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);

  // ❌ Se elimina la línea del logo roto.

  // Título del laboratorio
  doc.setFontSize(16); // Tamaño un poco más grande
  doc.setFont(undefined, "bold");
  doc.text("Equipos y Servicios Especializados AG", marginLeft, y);
  y += 20;

  // Fecha y nombre (ajustados para quedar en línea)
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`Fecha: ${formData.fecha}`, marginRight - 100, y);
  doc.setFont(undefined, "bold");
  doc.text(`Nombre: ${formData.nombre}`, marginRight - 100, y + 15);
  y += 35;

  // Línea separadora
  doc.setDrawColor(160);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, y, marginRight, y);
  y += 20;

  // Información general
  const infoPairs = [
    ["Lugar de Calibración", formData.lugarCalibracion],
    ["N.Certificado", formData.certificado],
    ["Fecha de Recepción", formData.fecha],
    ["Cliente", formData.cliente],
    ["Equipo", formData.equipo],
    ["ID", formData.id],
    ["Marca", formData.marca],
    ["Modelo", formData.modelo],
    ["Número de Serie", formData.numeroSerie],
    // FIX: Asegura que el array de unidades se muestre correctamente
    ["Unidad", Array.isArray(formData.unidad) ? formData.unidad.join(', ') : formData.unidad],
    ["Alcance", formData.alcance],
    ["Resolucion", formData.resolucion],
    ["Frecuencia de Calibración", formData.frecuenciaCalibracion],
    ["Temp. Ambiente", `${formData.tempAmbiente} °C`],
    ["HR%", `${formData.humedadRelativa} %`],
  ];

  doc.setFontSize(11);
  const col1Width = 150; // Ancho para las etiquetas
  const col2X = marginLeft + col1Width; // Posición para los valores
  
  for (let i = 0; i < infoPairs.length; i++) {
    const [label, value] = infoPairs[i];
    doc.setFont(undefined, "bold");
    doc.text(`${label}:`, marginLeft, y);
    doc.setFont(undefined, "normal");
    doc.text(`${value || "-"}`, col2X, y); // Uso del ancho de columna fijo
    y += lineHeight;
  }

  y += 20;

  // --- Tabla de mediciones ---
  const tableTop = y;
  const tableWidth = 500;
  const colWidth = tableWidth / 2;
  const rowHeight = 24;
  const valueHeight = 60;
  
  const isMasa = formData.magnitud === "Masa";

  // Header con fondo gris
  doc.setFillColor(230);
  doc.setDrawColor(180);
  
  if (isMasa) {
      // Si es Masa, cambiamos la estructura para mostrar los 3 campos uno debajo del otro
      doc.rect(marginLeft, tableTop, tableWidth, rowHeight, "FD");
      doc.setFont(undefined, "bold");
      doc.text("Mediciones de Masa:", marginLeft + 5, tableTop + 16);
      
      y = tableTop + rowHeight + 10;

      // FIX: Agregar campos de Masa al PDF
      const masaPairs = [
          ["Excentricidad:", formData.excentricidad],
          ["Linealidad:", formData.linealidad],
          ["Repetibilidad:", formData.repetibilidad],
      ];
      
      for (let i = 0; i < masaPairs.length; i++) {
          const [label, value] = masaPairs[i];
          doc.setFont(undefined, "bold");
          doc.text(label, marginLeft, y);
          doc.setFont(undefined, "normal");
          doc.text(value || "-", marginLeft + 150, y);
          y += lineHeight;
      }
      y += 10; // Espacio extra después de las mediciones de masa

  } else {
      // Lógica original para otras magnitudes (Medición Patrón / Instrumento)
      doc.rect(marginLeft, tableTop, colWidth, rowHeight, "FD");
      doc.rect(marginLeft + colWidth, tableTop, colWidth, rowHeight, "FD");
      doc.setFont(undefined, "bold");
      doc.text("Medición Patrón:", marginLeft + 5, tableTop + 16);
      doc.text("Medición Instrumento:", marginLeft + colWidth + 5, tableTop + 16);

      // Contenido
      const valTop = tableTop + rowHeight;
      doc.setFont(undefined, "normal");
      doc.rect(marginLeft, valTop, colWidth, valueHeight);
      doc.rect(marginLeft + colWidth, valTop, colWidth, valueHeight);

      const splitPatron = doc.splitTextToSize(formData.medicionPatron || "-", colWidth - 10);
      const splitInst = doc.splitTextToSize(formData.medicionInstrumento || "-", colWidth - 10);

      doc.text(splitPatron, marginLeft + 5, valTop + 15);
      doc.text(splitInst, marginLeft + colWidth + 5, valTop + 15);
      y = valTop + valueHeight + 30;
  }
  
  // --- Notas ---
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("Notas:", marginLeft, y);
  y += lineHeight;

  doc.setFont(undefined, "normal");
  const splitNotas = doc.splitTextToSize(formData.notas || "-", 500);
  doc.text(splitNotas, marginLeft, y);
  y += splitNotas.length * lineHeight;

  // --- Pie de página ---
  doc.setFontSize(10);
  doc.setFont(undefined, "italic");
  doc.text("AG-CAL-F39-00", marginLeft, 790); // Se fija a 790 para el pie de página

  return doc;
};

export const WorkSheetScreen: React.FC = () => {
  const { currentConsecutive, goBack, currentUser, currentMagnitude } = useNavigation();
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isCelestica, setIsCelestica] = useState(false);

  const [formData, setFormData] = useState<any>({ // Usar 'any' para manejar la estructura dinámica
    lugarCalibracion: "",
    frecuenciaCalibracion: "",
    fecha: getLocalISODate(), // FIX: Usa la función local para evitar desfase de fecha
    certificado: "",
    nombre: "",
    cliente: "",
    id: "",
    equipo: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    magnitud: "",
    unidad: [], // Inicializar unidad como array para manejo de múltiples unidades
    alcance: "",
    resolucion: "",
    medicionPatron: "",
    medicionInstrumento: "",
    excentricidad: "",
    linealidad: "",
    repetibilidad: "",
    notas: "",
    tempAmbiente: "",
    humedadRelativa: "",
    excepcion: false,
  });

  const [idBlocked, setIdBlocked] = useState(false);
  const [idErrorMessage, setIdErrorMessage] = useState("");
  const [permitirExcepcion, setPermitirExcepcion] = useState(false); // Estado para permitir excepción
  const [isMasterData, setIsMasterData] = useState(false);
  const [fieldsLocked, setFieldsLocked] = useState(false);
  const [listaClientes, setListaClientes] = useState<ClienteRecord[]>([]);
  // NUEVO: Estado para auto-transferencia
  const [autoTransferEnabled, setAutoTransferEnabled] = useState(() =>
    localStorage.getItem('autoTransferWorksheets') === 'true'
  );

  // FIX: Se inicializa en DC
  const [tipoElectrica, setTipoElectrica] = useState<"DC" | "AC" | "Otros">("DC");

  // FIX: Implementación de la lógica de validación usando la frecuencia del registro ANTERIOR
  const validarIdEnPeriodo = useCallback(async () => {
    setIdBlocked(false);
    setIdErrorMessage("");

    const id = formData.id?.trim();
    const cliente = formData.cliente;

    // Si la excepción está marcada, no realizamos el bloqueo.
    if (permitirExcepcion) return; 

    if (!id || !cliente) return;

    // 1. Buscar registros anteriores para este ID y Cliente
    const q = query(
      collection(db, "hojasDeTrabajo"), 
      where("id", "==", id),
      where("cliente", "==", cliente)
    );
    const docs = await getDocs(q);

    if (docs.empty) return;

    // 2. Encontrar la fecha y FRECUENCIA de última calibración (más reciente)
    let maxFecha: Date | null = null;
    let frecuenciaAnterior: string | undefined = undefined;
    let maxFechaString: string | undefined = undefined;

    docs.forEach(doc => {
      const data = doc.data();
      const f = data.fecha;
      const freq = data.frecuenciaCalibracion; // <-- EXTRAEMOS LA FRECUENCIA GUARDADA

      // FIX: Crea la fecha de forma segura (YYYY, MM-1, DD)
      const parts = f.split('-');
      const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

      if (!isNaN(dateObj.getTime())) { 
        if (!maxFecha || dateObj.getTime() > maxFecha.getTime()) {
          maxFecha = dateObj;
          frecuenciaAnterior = freq;
          maxFechaString = f;
        }
      }
    });

    if (!maxFecha || !frecuenciaAnterior) return;

    // 3. CALCULAR la próxima fecha permitida usando la FRECUENCIA ANTERIOR
    const nextAllowed = calcularSiguienteFecha(maxFechaString!, frecuenciaAnterior);

    if (!nextAllowed) return; 

    const hoy = new Date();
    // 4. Comparar con la fecha actual
    if (isBefore(hoy, nextAllowed)) {
      setIdBlocked(true);
      setIdErrorMessage(
        `⛔️ Este equipo fue calibrado el ${format(maxFecha, "dd/MM/yyyy")} (Frecuencia: ${frecuenciaAnterior}). La próxima calibración permitida es después de ${format(nextAllowed, "dd/MM/yyyy")}. Active la excepción si es necesario.`
      );
    }
  }, [formData.id, formData.cliente, permitirExcepcion]); // La frecuencia actual no afecta el bloqueo, pero el cliente sí.

  // Ejecutar validación cuando cambian los campos relevantes o la excepción
  useEffect(() => {
    validarIdEnPeriodo();
  }, [validarIdEnPeriodo]);


  // Las demás funciones (handleIdChange, cargarEmpresas, etc.) se mantienen igual.
  
  // Cuando cambia el cliente: aplica EP- si es Celestica y limpia
  const handleClienteChange = (value: string) => {
    const cel = (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes("celestica");

    setIsCelestica(cel);

    setFormData((prev: any) => ({
      ...prev,
      cliente: value,
      id: cel ? "EP-" : "",
      equipo: "",
      marca: "",
      modelo: "",
      numeroSerie: "",
    }));

    setFieldsLocked(false);
  };
  
  // Cuando cambia el ID: autocompleta o limpia
  const handleIdChange = (value: string) => {
    setFormData((prev: any) => ({ ...prev, id: value }));
  };

  // Carga lista de clientes
  const cargarEmpresas = async () => {
    try {
      const qs = await getDocs(collection(db, "clientes"));
      setListaClientes(qs.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "Sin nombre" })));
    } catch {
      // fallback estático
      setListaClientes([
        { id: "1", nombre: "CELESTICA DE MONTERREY (ESTANDARD)" },
        { id: "2", nombre: "CELESTICA DE MONTERREY (MEDICO)" },
        { id: "3", nombre: "CELESTICA DE MONTERREY (EDIFICIO E)" },
        { id: "4", nombre: "CELESTICA DE MONTERREY (EDIFICIO L)" }, 
      ]);
    }
  };

  // Extrae nombre de usuario al montar
  useEffect(() => {
    const u = currentUser || user;
    setFormData((prev: any) => ({ ...prev, nombre: getUserName(u) }));
    cargarEmpresas();
  }, [currentUser, user]);

  // Cuando cambia el consecutivo, guarda y auto-detecta magnitud
  useEffect(() => {
    const cert = currentConsecutive || "";
    const mag = extractMagnitudFromConsecutivo(cert);
    setFormData((prev: any) => ({
      ...prev,
      certificado: cert,
      magnitud: mag,
      unidad: [], // limpia unidad
    }));
  }, [currentConsecutive]);

  // Si hay un currentMagnitude explícito, lo aplica (mantiene tu lógica previa)
  useEffect(() => {
    if (currentMagnitude) {
      setFormData((prev: any) => ({
        ...prev,
        magnitud: currentMagnitude,
        unidad: [],
      }));
    }
  }, [currentMagnitude]);

  // Cada vez que magnitud cambia manual o automáticamente, limpia unidad
  const handleMagnitudChange = (value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      magnitud: value,
      unidad: [],
    }));
  };

  const handleInputChange = (field: string, value: any) =>
    setFormData((prev: any) => ({ ...prev, [field]: value }));

  const camposObligatorios = [
    "lugarCalibracion",
    "certificado",
    "nombre",
    "cliente",
    "id",
    "equipo",
    "marca",
    "magnitud",
    "unidad",
  ];
  const valid = camposObligatorios.every((k) => {
    const val = formData[k];
    if (Array.isArray(val)) {
      return val.length > 0;
    }
    return !!val && typeof val === "string" ? val.trim() !== "" : !!val;
  });
  const magnitudReadOnly = !!currentMagnitude;

  // Modificado para usar unidades seleccionadas en la pre-visualización si es Electricidad
  const unidadesDisponibles = React.useMemo(() => {
    if (formData.magnitud === "Electrica") {
      // Retorna el array de todas las unidades eléctricas (para el select múltiple)
      return [...unidadesPorMagnitud.Electrica.DC, ...unidadesPorMagnitud.Electrica.AC, ...unidadesPorMagnitud.Electrica.Otros] as string[];
    } else if (formData.magnitud && unidadesPorMagnitud[formData.magnitud]) {
      return unidadesPorMagnitud[formData.magnitud] as string[];
    }
    return [];
  }, [formData.magnitud]);


  const handleIdBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const newId = String(e.target.value || "").trim();
    setFormData((prev: any) => {
      const clienteVal = (prev.cliente || (prev as any).clienteSeleccionado || "").toString();
      const updated = { ...prev, id: newId };

      let masterFound = false;

      // Lógica de autocompletado para Celestica
      if (clienteVal.toLowerCase().includes("celestica") && newId) {
        const rec = findCelesticaById(newId);
        if (rec) {
          masterFound = true;
          return {
            ...updated,
            equipo: rec.B ?? "",
            marca: rec.C ?? "",
            modelo: rec.D ?? "",
            numeroSerie: rec.E ?? "",
          };
        }
      }

      // Lógica de autocompletado para Mexico MRO
      if (isMexicoMROClient(clienteVal) && newId && !masterFound) {
        const rec = findTechopsById(newId);
        if (rec) {
          masterFound = true;
          return {
            ...updated,
            equipo: rec.B ?? "",
            marca: rec.C ?? "",
            modelo: rec.D ?? "",
            numeroSerie: rec.E ?? "",
          };
        }
      }

      setIsMasterData(masterFound);
      setFieldsLocked(masterFound); // Bloquear si se encontró
      return masterFound ? updated : { // Desbloquear si no se encontró y limpiar si es Celestica y se borró
        ...updated,
        equipo: (isCelestica && !newId) ? "" : prev.equipo,
        marca: (isCelestica && !newId) ? "" : prev.marca,
        modelo: (isCelestica && !newId) ? "" : prev.modelo,
        numeroSerie: (isCelestica && !newId) ? "" : prev.numeroSerie,
      };
    });
    // Llamar la función de validación aquí para que el bloqueo se actualice inmediatamente después del autocompletado/blur.
    validarIdEnPeriodo(); 
  };

  // MODIFICADO: handleSave con integración automática
  const handleSave = useCallback(async () => {
    if (!valid) {
      alert("⚠️ Completa todos los campos obligatorios");
      return;
    }

    // Verificar bloqueo por frecuencia
    if (idBlocked && !permitirExcepcion) {
      alert("❌ No se puede guardar. El equipo requiere calibración después del periodo establecido. Active la excepción si tiene aprobación.");
      return;
    }

    setIsSaving(true);
    try {
      // Paso 4.1 – Validar si el certificado ya existe en Firestore
      const certificado = formData.certificado;
      const q = query(
        collection(db, "hojasDeTrabajo"), // Colección donde se guardan las hojas
        where("certificado", "==", certificado)
      );
      const existingDocs = await getDocs(q);

      if (!existingDocs.empty) {
        alert("❌ Este certificado ya existe. Intenta con otro consecutivo.");
        setIsSaving(false);
        return;
      }

      // Paso 4.2 - Generar PDF
      const { jsPDF } = await import("jspdf");
      const pdfDoc = generateTemplatePDF(formData, jsPDF);
      const blob = (pdfDoc as any).output("blob");

      const fecha = new Date().toISOString().split("T")[0];
      const carpeta = getUserName(currentUser || user);
      const nombreArchivo = `worksheets/${carpeta}/${formData.certificado}_${formData.id || "SINID"}.pdf`;
      const pdfRef = ref(storage, nombreArchivo);

      await uploadBytes(pdfRef, blob);
      const pdfDownloadURL = await getDownloadURL(pdfRef);

      // Agregar timestamp para tracking
      const worksheetDataWithTimestamp = {
        ...formData,
        pdfURL: pdfDownloadURL, // Guardar el link del PDF
        timestamp: Date.now(),
        userId: currentUser?.uid || user?.uid || "unknown"
      };

      await addDoc(collection(db, "hojasDeTrabajo"), worksheetDataWithTimestamp); // Usando 'hojasDeTrabajo' como en tu código

      // 🚀 NUEVA FUNCIONALIDAD: Auto-transferencia al tablero Friday
      if (autoTransferEnabled) {
        try {
          const transferSuccess = await transferToFriday(
            worksheetDataWithTimestamp,
            currentUser?.uid || user?.uid || "unknown",
            user // Pasamos el objeto de usuario
          );

          if (transferSuccess) {
            alert("✅ Guardado exitoso y transferido automáticamente al tablero Friday");
          } else {
            alert("✅ Guardado exitoso (transferencia manual disponible en Friday)");
          }
        } catch (transferError) {
          console.error("Error en auto-transferencia:", transferError);
          alert("✅ Guardado exitoso (error en transferencia automática)");
        }
      } else {
        alert("✅ Guardado exitoso");
      }

      goBack();
    } catch (e: any) {
      alert("❌ Error: " + (e.message || "Error desconocido al guardar."));
    } finally {
      setIsSaving(false);
    }
  }, [valid, formData, idBlocked, permitirExcepcion, currentUser, user, goBack, autoTransferEnabled]);


  const handleCancel = () => goBack();
  const esMagnitudMasa = (m: string) => m === "Masa";

  // NUEVO: Toggle para auto-transferencia
  const toggleAutoTransfer = () => {
    const newValue = !autoTransferEnabled;
    setAutoTransferEnabled(newValue);
    localStorage.setItem('autoTransferWorksheets', newValue.toString());
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-lg">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Hoja de Trabajo</h1>
                <p className="text-blue-100 text-sm">
                  Consecutivo: {formData.certificado || "SIN CERTIFICADO"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* NUEVO: Toggle de auto-transferencia */}
            <button
              onClick={toggleAutoTransfer}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${
                autoTransferEnabled
                  ? 'bg-green-500/20 text-green-200 border border-green-400/50'
                  : 'bg-white/10 text-white border border-white/20'
              }`}
              title={autoTransferEnabled ? "Auto-transferencia activada" : "Auto-transferencia desactivada"}
            >
              <Zap className="w-4 h-4" />
              <span className="text-sm">Auto → Friday</span>
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 text-white hover:bg-white/10 rounded-lg flex items-center space-x-2"
            >
              <Edit3 className="w-4 h-4" />
              <span>{showPreview ? "Ocultar Vista" : "Mostrar Vista"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-6">
        <div className={`grid gap-8 ${showPreview ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-4xl mx-auto"}`}>
          {/* Formulario */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Información de Calibración</h2>
              <p className="text-gray-600 mt-1">Complete los datos para generar la hoja de trabajo</p>
              {/* NUEVO: Indicador de auto-transferencia */}
              {autoTransferEnabled && (
                <div className="mt-3 flex items-center space-x-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">Se transferirá automáticamente al tablero Friday</span>
                </div>
              )}
            </div>
            <div className="p-8 space-y-8">
              {/* 1. Lugar de Calibración */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                  <MapPin className="w-4 h-4 text-orange-500" />
                  <span>Lugar de Calibración*</span>
                </label>
                <div className="grid grid-cols-3 gap-4 text-gray-700">
                  {["Sitio", "Laboratorio"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleInputChange("lugarCalibracion", opt)}
                      className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                        formData.lugarCalibracion === opt
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {formData.lugarCalibracion === "Laboratorio" && (
                <div className="mt-4">
                  <label className="block font-semibold text-sm text-gray-700 mb-1">
                    Fecha de Recepción
                  </label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={formData.fechaRecepcion || ""}
                    onChange={(e) =>
                      handleInputChange("fechaRecepcion", e.target.value)
                    }
                  />
                </div>
              )}
              {/* 2. Frecuencia y Fecha */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Calendar className="w-4 h-4 text-green-500" />
                    <span>Frecuencia*</span>
                  </label>
                  <select
                    value={formData.frecuenciaCalibracion}
                    onChange={(e) => handleInputChange("frecuenciaCalibracion", e.target.value)}
                    className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="3 meses">3 meses</option>
                    <option value="6 meses">6 meses</option>
                    <option value="1 año">1 año</option>
                    <option value="2 años">2 años</option>
                    <option value="3 años">3 años</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span>Fecha*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.fecha}
                    onChange={(e) => handleInputChange("fecha", e.target.value)}
                    className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 3. Certificado y Nombre */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Hash className="w-4 h-4 text-purple-500" />
                    <span>N.Certificado*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.certificado}
                    readOnly
                    className="w-full p-4 border rounded-lg bg-gray-50 text-gray-800"
                    placeholder="Se asignará automáticamente"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Mail className="w-4 h-4 text-red-500" />
                    <span>Nombre*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nombre}
                    readOnly
                    className="w-full p-4 border rounded-lg bg-gray-50 text-gray-800"
                    placeholder="Técnico"
                  />
                </div>
              </div>

              {/* 4. Cliente & ID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span>Cliente*</span>
                  </label>
                  {/* FIX: Usando el componente de búsqueda MEJORADO */}
                  <ClienteSearchSelect
                    clientes={listaClientes}
                    onSelect={handleClienteChange}
                    currentValue={formData.cliente}
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Hash className="w-4 h-4 text-gray-500" />
                    <span>ID*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.id || ""}
                    onChange={(e) => handleIdChange(e.target.value)}
                    onBlur={handleIdBlur}
                    className={`w-full p-4 border-2 rounded-lg transition-all ${
                      idBlocked && !permitirExcepcion
                        ? "border-red-500 bg-red-50 text-red-700 placeholder-red-400 focus:ring-red-500"
                        : "border-gray-200 text-gray-900 focus:ring-blue-500"
                    }`}
                    placeholder="ID"
                  />
                  {/* Mensaje de error/bloqueo */}
                  {idBlocked && !permitirExcepcion && (
                    <p className="mt-2 text-sm font-medium text-red-600 animate-pulse">
                      {idErrorMessage}
                    </p>
                  )}
                  {/* Permitir Excepción (Lógica corregida) */}
                  <div className="mt-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={permitirExcepcion}
                        onChange={(e) => setPermitirExcepcion(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                        // 🌟 CORRECCIÓN DE LÓGICA: Solo se habilita si hay bloqueo.
                        disabled={!idBlocked} 
                      />
                      <span className={`text-sm ${idBlocked ? 'text-red-700 font-bold' : 'text-gray-500'}`}>
                        Permitir excepción de calibración (requiere aprobación)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 5. Equipo & Marca */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Wrench className="w-4 h-4 text-yellow-500" />
                    <span>Equipo*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.equipo || ""}
                    onChange={(e) => handleInputChange("equipo", e.target.value)}
                    readOnly={fieldsLocked}
                    className="w-full p-4 border rounded-lg"
                    placeholder="Equipo"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Tag className="w-4 h-4 text-pink-500" />
                    <span>Marca*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.marca || ""}
                    onChange={(e) => handleInputChange("marca", e.target.value)}
                    readOnly={fieldsLocked}
                    className="w-full p-4 border rounded-lg"
                    placeholder="Marca"
                  />
                </div>
              </div>

              {/* 6. Modelo & Serie */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Hash className="w-4 h-4 text-teal-500" />
                    <span>Modelo</span>
                  </label>
                  <input
                    type="text"
                    value={formData.modelo || ""}
                    onChange={(e) => handleInputChange("modelo", e.target.value)}
                    readOnly={fieldsLocked}
                    className="w-full p-4 border rounded-lg"
                    placeholder="Modelo"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <NotebookPen className="w-4 h-4 text-purple-500" />
                    <span>Nº Serie</span>
                  </label>
                  <input
                    type="text"
                    value={formData.numeroSerie || ""}
                    onChange={(e) => handleInputChange("numeroSerie", e.target.value)}
                    readOnly={fieldsLocked}
                    className="w-full p-4 border rounded-lg"
                    placeholder="Número de Serie"
                  />
                </div>
              </div>

              {/* 7. Magnitud, Unidad, Alcance & Resolución */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Tag className="w-4 h-4 text-blue-500" />
                    <span>Magnitud*</span>
                  </label>
                  {magnitudReadOnly ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.magnitud}
                        readOnly
                        className="w-full p-4 border rounded-lg bg-gray-50 font-semibold"
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                        Auto
                      </div>
                    </div>
                  ) : (
                    <select
                      value={formData.magnitud}
                      onChange={(e) => handleMagnitudChange(e.target.value)}
                      className="w-full p-4 border rounded-lg"
                    >
                      <option value="">Seleccionar...</option>
                      {magnitudesDisponibles.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Tag className="w-4 h-4 text-violet-500" />
                    <span>Unidad*</span>
                  </label>
                  {formData.magnitud === "Electrica" && (
                    <div className="mb-4 space-y-3 p-4 border rounded-lg bg-gray-50">
                      <div className="font-bold text-gray-700">Tipo Eléctrico</div>
                      <Tabs value={tipoElectrica} onValueChange={(v) => setTipoElectrica(v as "DC" | "AC" | "Otros")}>
                        <TabsList className="grid w-full grid-cols-3 bg-white/50">
                          <TabsTrigger value="DC" className="font-semibold text-gray-800 data-[state=active]:bg-blue-200">DC</TabsTrigger>
                          <TabsTrigger value="AC" className="font-semibold text-gray-800 data-[state=active]:bg-blue-200">AC</TabsTrigger>
                          <TabsTrigger value="Otros" className="font-semibold text-gray-800 data-[state=active]:bg-blue-200">Otros</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {/* Contenido de Pestañas (Renderiza Checkboxes) */}
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {/* FIX: Se usa el estado del tipo eléctrico actual para renderizar los checkboxes */}
                        {unidadesPorMagnitud.Electrica[tipoElectrica].map((unidad: string) => {
                          // Se verifica si la unidad ya está seleccionada en el estado global 
                          const isSelected = (formData.unidad || []).includes(unidad);
                          return (
                            <label key={unidad} className="flex items-center space-x-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  let newUnits = [...(formData.unidad || [])];
                                  if (isSelected) {
                                    // Deseleccionar: remover la unidad
                                    newUnits = newUnits.filter((u: string) => u !== unidad);
                                  } else {
                                    // Seleccionar: agregar la unidad
                                    newUnits.push(unidad);
                                  }
                                  setFormData((prev: any) => ({ ...prev, unidad: newUnits }));
                                }}
                                className="rounded text-blue-600"
                              />
                              <span>{unidad}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {formData.magnitud !== "Electrica" && (
                    <select
                      multiple
                      value={formData.unidad || []}
                      onChange={(e) =>
                        setFormData((prev: any) => ({
                          ...prev,
                          unidad: Array.from(e.target.selectedOptions, (option) => option.value)
                        }))
                      }
                      disabled={!formData.magnitud}
                      className="w-full p-4 border rounded-lg"
                      required
                    >
                      <option value="" disabled>
                        {formData.magnitud ? "Seleccionar..." : "Seleccionar magnitud primero"}
                      </option>
                      {unidadesDisponibles.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  )}
                  {formData.magnitud && unidadesDisponibles.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">Sin unidades definidas</p>
                  )}
                </div>
              </div>

              {/* Alcance */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Alcance</label>
                <input
                  type="text"
                  className="w-full p-4 border rounded-lg"
                  value={formData.alcance}
                  onChange={e => handleInputChange("alcance", e.target.value)}
                  placeholder="Ej: 10"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>

              {/* Resolución */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Resolución</label>
                <input
                  type="text"
                  className="w-full p-4 border rounded-lg"
                  value={formData.resolucion}
                  onChange={e => handleInputChange("resolucion", e.target.value)}
                  placeholder="Ej: 0.01"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>

              {/* 8. Medición o Excentricidad/Linealidad/Repetibilidad */}
              {esMagnitudMasa(formData.magnitud) ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                        <NotebookPen className="w-4 h-4 text-purple-400" />
                        <span>Excentricidad</span>
                      </label>
                      <input
                        type="text"
                        value={formData.excentricidad}
                        onChange={(e) => handleInputChange("excentricidad", e.target.value)}
                        className="w-full p-4 border rounded-lg"
                        placeholder="Excentricidad"
                      />
                    </div>
                    <div>
                      <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                        <NotebookPen className="w-4 h-4 text-pink-400" />
                        <span>Linealidad</span>
                      </label>
                      <input
                        type="text"
                        value={formData.linealidad}
                        onChange={(e) => handleInputChange("linealidad", e.target.value)}
                        className="w-full p-4 border rounded-lg"
                        placeholder="Linealidad"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <NotebookPen className="w-4 h-4 text-orange-400" />
                      <span>Repetibilidad</span>
                    </label>
                    <input
                      type="text"
                      value={formData.repetibilidad}
                      onChange={(e) => handleInputChange("repetibilidad", e.target.value)}
                      className="w-full p-4 border rounded-lg"
                      placeholder="Repetibilidad"
                    />
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <NotebookPen className="w-4 h-4 text-teal-400" />
                      <span>Medición Patrón</span>
                    </label>
                    <textarea
                      value={formData.medicionPatron}
                      onChange={(e) => handleInputChange("medicionPatron", e.target.value)}
                      rows={4}
                      // 🌟 CORRECCIÓN DE UX MÓVIL: Se agrega scroll y altura máxima.
                      className="w-full p-2 border rounded resize-none overflow-y-auto max-h-40"
                      placeholder="Ingrese los datos de medición del patrón aquí..."
                    />
                  </div>
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <NotebookPen className="w-4 h-4 text-blue-400" />
                      <span>Medición Instrumento</span>
                    </label>
                    <textarea
                      value={formData.medicionInstrumento}
                      onChange={(e) => handleInputChange("medicionInstrumento", e.target.value)}
                      rows={4}
                      // 🌟 CORRECCIÓN DE UX MÓVIL: Se agrega scroll y altura máxima.
                      className="w-full p-2 border rounded resize-none overflow-y-auto max-h-40"
                      placeholder="Ingrese los datos de medición del instrumento aquí..."
                    />
                  </div>
                </div>
              )}

              {/* 9. Notas */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                  <NotebookPen className="w-4 h-4 text-gray-400" />
                    <span>Notas</span>
                  </label>
                  <textarea
                    value={formData.notas}
                    onChange={(e) => handleInputChange("notas", e.target.value)}
                    className="w-full p-4 border rounded-lg resize-none"
                    rows={2}
                    placeholder="Notas adicionales"
                  />
                </div>

                {/* 10. Temp & HR */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <NotebookPen className="w-4 h-4 text-sky-400" />
                      <span>Temp. Ambiente (°C)</span>
                    </label>
                    <input
                      type="number"
                      value={formData.tempAmbiente}
                      onChange={(e) => handleInputChange("tempAmbiente", e.target.value)}
                      className="w-full p-4 border rounded-lg"
                      placeholder="22.5"
                    />
                  </div>
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <NotebookPen className="w-4 h-4 text-pink-400" />
                      <span>HR%</span>
                    </label>
                    <input
                      type="number"
                      value={formData.humedadRelativa}
                      onChange={(e) => handleInputChange("humedadRelativa", e.target.value)}
                      className="w-full p-4 border rounded-lg"
                      placeholder="45"
                      min={0}
                      max={100}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Vista Previa */}
            {showPreview && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">Vista Previa del PDF</h2>
                  <p className="text-gray-600 text-sm">
                    El PDF se generará siguiendo exactamente este formato
                  </p>
                </div>

                <div className="p-8 bg-white" style={{ fontFamily: 'Arial, sans-serif' }}>
                  {/* Header simulado */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 border-2 border-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-600"></span>
                      </div>
                      <div>
                        <div className="font-bold text-blue-600">Equipos y Servicios</div>
                        <div className="text-sm text-blue-600">Especializados AG, S.A. de C.V.</div>
                      </div>
                    </div>
                    <div className="text-right text-black space-y-1">
                      <div><strong>Fecha:</strong> {formData.fecha}</div>
                      <div><strong>Nombre:</strong> {formData.nombre}</div>
                    </div>
                  </div>

                  <div className="text-2xl font-bold text-blue-600 mb-4">Hoja de trabajo</div>

                  <div className="text-center mb-4 text-black">
                    {formData.lugarCalibracion}
                  </div>

                  <div className="space-y-2 text-sm text-black">
                    <div><strong>N.Certificado:</strong> {formData.certificado}</div>
                    <div><strong>Fecha de Recepción:</strong> {formData.fecha}</div>
                    <div className="flex space-x-8 text-black mb-4">
                      <div><strong>Cliente:</strong> <span className="text-black">{formData.cliente}</span></div>
                      <div><strong>Equipo:</strong> {formData.equipo}</div>
                    </div>
                    <div className="flex space-x-8 text-black">
                      <div><strong>ID:</strong> {formData.id}</div>
                      <div><strong>Marca:</strong> {formData.marca}</div>
                    </div>
                    <div><strong>Modelo:</strong> {formData.modelo}</div>
                    <div><strong>Numero de Serie:</strong> {formData.numeroSerie}</div>
                    <div className="flex space-x-8 text-black">
                      {/* Muestra las unidades seleccionadas separadas por coma */}
                      <div><strong>Unidad:</strong> {(formData.unidad || []).join(', ')}</div>
                      <div><strong>Alcance:</strong> {formData.alcance}</div>
                    </div>
                    <div className="flex space-x-8 text-black">
                      <div><strong>Resolucion:</strong> {formData.resolucion}</div>
                      <div><strong>Frecuencia de Calibración:</strong> {formData.frecuenciaCalibracion}</div>
                    </div>
                    <div className="flex space-x-8 text-black">
                      <div><strong>Temp:</strong> {formData.tempAmbiente}°C</div>
                      <div><strong>HR:</strong> {formData.humedadRelativa}%</div>
                    </div>
                  </div>

                  {/* Tabla de mediciones / Masa (Vista Previa) */}
                  <div className="mt-6 border border-gray-400">
                    {esMagnitudMasa(formData.magnitud) ? (
                      // Vista previa para Masa
                      <div className="p-2 text-sm text-black space-y-1">
                          <div><strong>Excentricidad:</strong> {formData.excentricidad || '-'}</div>
                          <div><strong>Linealidad:</strong> {formData.linealidad || '-'}</div>
                          <div><strong>Repetibilidad:</strong> {formData.repetibilidad || '-'}</div>
                      </div>
                    ) : (
                      // Vista previa para otras magnitudes
                      <>
                      <div className="grid grid-cols-2 border-b border-gray-400">
                          <div className="p-2 border-r border-gray-400 bg-gray-50 font-bold text-black">Medición Patrón:</div>
                          <div className="p-2 bg-gray-50 font-bold text-black">Medición Instrumento:</div>
                      </div>
                      <div className="grid grid-cols-2 min-h-[100px]">
                          <div className="p-2 border-r border-gray-400 text-xs text-black">
                            {formData.medicionPatron}
                          </div>
                          <div className="p-2 text-xs text-black">
                            {formData.medicionInstrumento}
                          </div>
                      </div>
                      </>
                    )}
                  </div>

                  <div className="mt-4 text-sm text-black">
                    <strong>Notas:</strong> {formData.notas}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Botones */}
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
          <div className="flex justify-end space-x-4">
            <button
              onClick={handleCancel}
              className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all flex items-center space-x-2"
              disabled={isSaving}
            >
              <X className="w-4 h-4" />
              <span>Cancelar</span>
            </button>
            <button
              onClick={handleSave}
              // MODIFICADO: Deshabilita si isBlocked es true Y permitirExcepcion es false
              disabled={isSaving || !valid || (idBlocked && !permitirExcepcion)}
              className={`px-6 py-3 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-all flex items-center space-x-2 shadow-lg ${
                isSaving || !valid || (idBlocked && !permitirExcepcion)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-700'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isSaving ? "Guardando..." : "Guardar"}</span>
            </button>
          </div>
        </div>
      </div>
    );
};
export default WorkSheetScreen;