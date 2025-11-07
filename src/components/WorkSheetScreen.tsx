import React, { useEffect, useRef, useState, useCallback, useReducer } from "react";
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
  Zap,
  Search,
} from "lucide-react";
import type { jsPDF } from "jspdf"; // Importar solo el tipo para TS
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { storage, db } from "../utils/firebase";
import { collection, addDoc, query, getDocs, where, doc, updateDoc, getDoc } from "firebase/firestore";
import masterCelestica from "../data/masterCelestica.json";
import masterTechops from "../data/masterTechops.json";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  isBefore, 
  format, 
  addMonths, 
  addYears, 
} from "date-fns"; 

// ====================================================================
// 2.A: DEFINICIÓN DE TIPOS ESTRICTOS (INTERFACES)
// ====================================================================

type ClienteRecord = {
  id: string;
  nombre: string;
}

type MasterRecord = {
  A: string; // ID
  B: string; // Equipo/Nombre
  C: string; // Marca
  D: string; // Modelo
  E: string; // Serie
};

// Interfaz para el Estado Completo del Formulario
interface WorksheetState {
  lugarCalibracion: "Sitio" | "Laboratorio" | "";
  frecuenciaCalibracion: string;
  fecha: string;
  fechaRecepcion: string;
  certificado: string;
  nombre: string;
  cliente: string;
  id: string;
  equipo: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  magnitud: string;
  unidad: string[];
  alcance: string;
  resolucion: string;
  medicionPatron: string;
  medicionInstrumento: string;
  excentricidad: string;
  linealidad: string;
  repetibilidad: string;
  notas: string;
  tempAmbiente: string | number;
  humedadRelativa: string | number;
  // Estados de UI internos del reducer
  idBlocked: boolean;
  idErrorMessage: string;
  permitirExcepcion: boolean;
  isMasterData: boolean;
  fieldsLocked: boolean;
}

// Tipos para las Acciones del Reducer (Discriminated Union)
type WorksheetAction =
  | { type: 'SET_FIELD'; field: keyof WorksheetState; payload: string | string[] | number | boolean }
  | { type: 'SET_USER_NAME'; payload: string }
  | { type: 'SET_CONSECUTIVE'; consecutive: string; magnitud: string }
  | { type: 'SET_MAGNITUD'; payload: string }
  | { type: 'SET_CLIENTE'; payload: string }
  | { type: 'AUTOCOMPLETE_SUCCESS'; payload: Partial<WorksheetState> }
  | { type: 'AUTOCOMPLETE_FAIL' }
  | { type: 'SET_ID_BLOCKED'; message: string }
  | { type: 'CLEAR_ID_BLOCK' }
  | { type: 'SET_EXCEPCION'; payload: boolean }
  | { type: 'RESTORE_BACKUP'; payload: WorksheetState }; // Nueva acción para restaurar respaldo

// ====================================================================
// FIN DEFINICIÓN DE TIPOS
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

    useEffect(() => {
        setSearchTerm(currentValue);
    }, [currentValue]);

    const sortedLetters = Object.keys(filteredAndGroupedClientes).sort();

    return (
        <div className="relative" ref={wrapperRef}>
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
                />
                <Search className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
            </div>
            {isOpen && (
                <div className="absolute z-20 w-full bg-white border border-gray-300 max-h-80 overflow-y-auto rounded-b-lg shadow-xl">
                    {sortedLetters.length > 0 ? (
                        sortedLetters.map(letter => (
                            <div key={letter}>
                                <div className="sticky top-0 bg-gray-100 px-3 py-2 text-sm font-bold text-blue-700 border-b border-gray-200 shadow-sm">
                                    {letter}
                                </div>
                                <ul>
                                    {filteredAndGroupedClientes[letter].map(cliente => (
                                        <li
                                            key={cliente.id}
                                            className="px-4 py-3 cursor-pointer hover:bg-blue-50 text-gray-800 text-sm truncate transition-colors duration-150"
                                            onClick={() => handleSelect(cliente.nombre)}
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

const getLocalISODate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getUserName = (user: any) => {
  if (!user) return "Sin Usuario";
  return user.displayName || user.name || user.email?.split("@")[0] || "Sin Usuario";
};

const extractMagnitudFromConsecutivo = (consecutivo: string): string => {
  if (!consecutivo) return "";
  const m: Record<string, string> = {
    AGAC: "Acustica", AGD: "Dimensional", AGF: "Fuerza", AGP: "Presión", AGEL: "Electrica",
    AGT: "Temperatura", AGM: "Masa", AGVBT: "Vibracion", AGQ: "Quimica", AGOT: "Optica",
    AGFL: "Flujo", AGRD: "Reporte de Diagnostico", AGTI: "Tiempo", VE: "Velocidad", AGPT: "Par Torsional",
  };
  const parts = consecutivo.split("-");
  if (parts.length >= 2 && m[parts[1]]) return m[parts[1]];
  for (const [code, mag] of Object.entries(m)) {
    if (consecutivo.includes(code)) return mag;
  }
  return "";
};

const magnitudesDisponibles = [
  "Acustica", "Dimensional", "Fuerza", "Flujo", "Frecuencia", "Presión", "Quimica",
  "Electrica", "Temperatura", "Masa", "Optica", "Reporte de Diagnostico", "Tiempo",
  "Velocidad", "Vacio", "Vibracion", "Par Torsional",
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
    Otros: ["Hz", "kHz", "MHz"],
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

const findTechopsById = (id: string): MasterRecord | null => {
  if (!id) return null;
  const normalized = String(id).trim();
  const records = (masterTechops as MasterRecord[]).filter((r) => String(r.A ?? "").trim() === normalized);
  return records.length > 0 ? records[0] : null;
};

const findCelesticaById = (id: string): MasterRecord | null => {
  if (!id) return null;
  const normalized = String(id).trim();
  const records = (masterCelestica as MasterRecord[]).filter((r) => String(r.A ?? "").trim() === normalized);
  return records.length > 0 ? records[0] : null;
};

const isMexicoMROClient = (cliente?: string) => {
  if (!cliente) return false;
  const n = cliente.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (n.includes("mexico") || n.includes("mx")) && n.includes("mro");
};

function calcularSiguienteFecha(fechaUltima: string, frecuencia: string): Date | null {
  if (!fechaUltima || !frecuencia) return null;
  const parts = fechaUltima.split('-');
  if (parts.length !== 3) return null;
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  if (isNaN(date.getTime())) return null;

  const lowerFrecuencia = frecuencia.toLowerCase();
  if (lowerFrecuencia.includes("mes")) {
    let meses = lowerFrecuencia.includes("3") ? 3 : lowerFrecuencia.includes("6") ? 6 : 0;
    return meses > 0 ? addMonths(date, meses) : null;
  }
  if (lowerFrecuencia.includes("año") || lowerFrecuencia.includes("ano")) {
    let años = lowerFrecuencia.includes("2") ? 2 : lowerFrecuencia.includes("3") ? 3 : 1;
    return addYears(date, años);
  }
  return null;
}

// 2.A: Tipado estricto para formData en la transferencia
const transferToFriday = async (formData: WorksheetState, userId: string, user: any) => {
  try {
    console.log('Transferencia a Friday iniciada');
    const boardRef = doc(db, "tableros", "principal");
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      alert("Tablero principal no existe");
      return false;
    }

    const boardData = boardSnap.data();
    let { groups = [] } = boardData;

    const lugar = (formData.lugarCalibracion || "").toLowerCase();
    let destinoGroupId = lugar === "sitio" ? "sitio" : "laboratorio";
    let destinoGroupName = lugar === "sitio" ? "Servicio en Sitio" : "Equipos en Laboratorio";
    let destinoColorIdx = lugar === "sitio" ? 0 : 1;

    let destinoGroup = groups.find((g: any) => g.id === destinoGroupId);
    if (!destinoGroup) {
      destinoGroup = { id: destinoGroupId, name: destinoGroupName, colorIdx: destinoColorIdx, collapsed: false, rows: [] };
      groups.push(destinoGroup);
    }
    const groupIndex = groups.findIndex((g: any) => g.id === destinoGroupId);

    const newRow = {
      certificado: formData.certificado || "",
      cliente: formData.cliente || "Sin especificar",
      id: formData.id || "",
      equipo: formData.equipo || "Sin especificar",
      marca: formData.marca || "",
      modelo: formData.modelo || "",
      serie: formData.numeroSerie || "",
      lugarCalibracion: destinoGroupId,
      status: "pending",
      priority: "medium",
      assignedTo: userId || "unknown",
      dueDate: formData.fecha || getLocalISODate(),
      createdAt: getLocalISODate(),
      lastUpdated: getLocalISODate(),
    };

    if (groupIndex !== -1) {
      groups[groupIndex].rows.push(newRow);
    }

    await updateDoc(boardRef, { groups, columns: boardData.columns || [], updatedAt: Date.now() });
    return true;
  } catch (error) {
    console.error("Error transferencia Friday:", error);
    return false; // Retornamos false pero no lanzamos error para no bloquear el guardado principal
  }
};

// 2.A: Tipado estricto para formData en PDF
const generateTemplatePDF = (formData: WorksheetState, JsPDF: typeof jsPDF) => {
  // @ts-ignore - Ignoramos error de tipo si JsPDF viene como any en tiempo de ejecución
  const doc = new JsPDF({ orientation:"p", unit: "pt", format: "a4" });
  
  const marginLeft = 50;
  const marginRight = 550;
  const lineHeight = 18;
  let y = 50;
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("Equipos y Servicios Especializados AG", marginLeft, y);
  y += 20;

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`Fecha: ${formData.fecha}`, marginRight - 100, y);
  doc.setFont(undefined, "bold");
  doc.text(`Nombre: ${formData.nombre}`, marginRight - 100, y + 15);
  y += 35;

  doc.setDrawColor(160);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, y, marginRight, y);
  y += 20;

  const infoPairs = [
    ["Lugar de Calibración", formData.lugarCalibracion],
    ["N.Certificado", formData.certificado],
    ["Fecha de Recepción", formData.fechaRecepcion],
    ["Cliente", formData.cliente],
    ["Equipo", formData.equipo],
    ["ID", formData.id],
    ["Marca", formData.marca],
    ["Modelo", formData.modelo],
    ["Número de Serie", formData.numeroSerie],
    ["Unidad", Array.isArray(formData.unidad) ? formData.unidad.join(', ') : formData.unidad],
    ["Alcance", formData.alcance],
    ["Resolucion", formData.resolucion],
    ["Frecuencia de Calibración", formData.frecuenciaCalibracion],
    ["Temp. Ambiente", `${formData.tempAmbiente} °C`],
    ["HR%", `${formData.humedadRelativa} %`],
  ];

  doc.setFontSize(11);
  const col2X = marginLeft + 150;
  
  infoPairs.forEach(([label, value]) => {
    doc.setFont(undefined, "bold");
    doc.text(`${label}:`, marginLeft, y);
    doc.setFont(undefined, "normal");
    doc.text(`${value || "-"}`, col2X, y);
    y += lineHeight;
  });

  y += 20;
  const tableTop = y;
  const tableWidth = 500;
  const colWidth = tableWidth / 2;
  const rowHeight = 24;
  const valueHeight = 60;
  const isMasa = formData.magnitud === "Masa";

  doc.setFillColor(230);
  doc.setDrawColor(180);
  
  if (isMasa) {
      doc.rect(marginLeft, tableTop, tableWidth, rowHeight, "FD");
      doc.setFont(undefined, "bold");
      doc.text("Mediciones de Masa:", marginLeft + 5, tableTop + 16);
      y = tableTop + rowHeight + 10;
      const masaPairs = [
          ["Excentricidad:", formData.excentricidad],
          ["Linealidad:", formData.linealidad],
          ["Repetibilidad:", formData.repetibilidad],
      ];
      masaPairs.forEach(([label, value]) => {
          doc.setFont(undefined, "bold");
          doc.text(label, marginLeft, y);
          doc.setFont(undefined, "normal");
          doc.text(value || "-", marginLeft + 150, y);
          y += lineHeight;
      });
      y += 30;
  } else {
      doc.rect(marginLeft, tableTop, colWidth, rowHeight, "FD");
      doc.rect(marginLeft + colWidth, tableTop, colWidth, rowHeight, "FD");
      doc.setFont(undefined, "bold");
      doc.text("Medición Patrón:", marginLeft + 5, tableTop + 16);
      doc.text("Medición Instrumento:", marginLeft + colWidth + 5, tableTop + 16);
      const valTop = tableTop + rowHeight;
      doc.setFont(undefined, "normal");
      doc.rect(marginLeft, valTop, colWidth, valueHeight);
      doc.rect(marginLeft + colWidth, valTop, colWidth, valueHeight);
      doc.text(doc.splitTextToSize(formData.medicionPatron || "-", colWidth - 10), marginLeft + 5, valTop + 15);
      doc.text(doc.splitTextToSize(formData.medicionInstrumento || "-", colWidth - 10), marginLeft + colWidth + 5, valTop + 15);
      y = valTop + valueHeight + 30;
  }
  
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("Notas:", marginLeft, y);
  y += lineHeight;
  doc.setFont(undefined, "normal");
  const splitNotas = doc.splitTextToSize(formData.notas || "-", 500);
  doc.text(splitNotas, marginLeft, y);
  doc.setFontSize(10);
  doc.setFont(undefined, "italic");
  doc.text("AG-CAL-F39-00", marginLeft, 790);
  return doc;
};

const initialState: WorksheetState = {
  lugarCalibracion: "",
  frecuenciaCalibracion: "",
  fecha: getLocalISODate(),
  fechaRecepcion: "", 
  certificado: "",
  nombre: "",
  cliente: "",
  id: "",
  equipo: "",
  marca: "",
  modelo: "",
  numeroSerie: "",
  magnitud: "",
  unidad: [],
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
  idBlocked: false,
  idErrorMessage: "",
  permitirExcepcion: false,
  isMasterData: false,
  fieldsLocked: false,
};

function worksheetReducer(state: WorksheetState, action: WorksheetAction): WorksheetState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.payload };
    case 'SET_USER_NAME':
      return { ...state, nombre: action.payload };
    case 'SET_CONSECUTIVE':
      return { ...state, certificado: action.consecutive, magnitud: action.magnitud, unidad: [] };
    case 'SET_MAGNITUD':
      return { ...state, magnitud: action.payload, unidad: [] };
    case 'SET_CLIENTE':
      const cel = (action.payload || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("celestica");
      return {
        ...state,
        cliente: action.payload,
        id: cel ? "EP-" : "",
        equipo: "", marca: "", modelo: "", numeroSerie: "",
        fieldsLocked: false,
      };
    case 'AUTOCOMPLETE_SUCCESS':
      return { ...state, ...action.payload, isMasterData: true, fieldsLocked: true };
    case 'AUTOCOMPLETE_FAIL':
      const isCelestica = state.cliente.toLowerCase().includes("celestica");
      return {
        ...state,
        isMasterData: false, fieldsLocked: false,
        equipo: (isCelestica && !state.id) ? "" : state.equipo,
        marca: (isCelestica && !state.id) ? "" : state.marca,
        modelo: (isCelestica && !state.id) ? "" : state.modelo,
        numeroSerie: (isCelestica && !state.id) ? "" : state.numeroSerie,
      };
    case 'SET_ID_BLOCKED':
      return { ...state, idBlocked: true, idErrorMessage: action.message };
    case 'CLEAR_ID_BLOCK':
      return { ...state, idBlocked: false, idErrorMessage: "" };
    case 'SET_EXCEPCION':
      return { ...state, permitirExcepcion: action.payload };
    case 'RESTORE_BACKUP':
      return { ...action.payload };
    default:
      return state;
  }
}

export const WorkSheetScreen: React.FC = () => {
  const { currentConsecutive, goBack, currentUser, currentMagnitude } = useNavigation();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(worksheetReducer, initialState);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [listaClientes, setListaClientes] = useState<ClienteRecord[]>([]);
  const [autoTransferEnabled, setAutoTransferEnabled] = useState(() => localStorage.getItem('autoTransferWorksheets') === 'true');
  const [tipoElectrica, setTipoElectrica] = useState<"DC" | "AC" | "Otros">("DC");

  // 2.C: Recuperación básica de respaldo local si existe
  useEffect(() => {
    const backup = localStorage.getItem('backup_worksheet_data');
    if (backup) {
      try {
        const parsedBackup = JSON.parse(backup) as WorksheetState;
        // Opcional: preguntar al usuario si quiere restaurar
        if (window.confirm("Se encontró una hoja de trabajo no guardada. ¿Desea restaurarla?")) {
           dispatch({ type: 'RESTORE_BACKUP', payload: parsedBackup });
        }
        localStorage.removeItem('backup_worksheet_data'); // Limpiar tras restaurar o rechazar
      } catch (e) {
        console.error("Error al restaurar respaldo local", e);
        localStorage.removeItem('backup_worksheet_data');
      }
    }
  }, []);

  const validarIdEnPeriodo = useCallback(async () => {
    if (state.permitirExcepcion) {
      dispatch({ type: 'CLEAR_ID_BLOCK' });
      return;
    }
    dispatch({ type: 'CLEAR_ID_BLOCK' });
    const id = state.id?.trim();
    const cliente = state.cliente;
    if (!id || !cliente) return;

    const q = query(collection(db, "hojasDeTrabajo"), where("id", "==", id), where("cliente", "==", cliente));
    const docs = await getDocs(q);
    if (docs.empty) return;

    let maxFecha: Date | null = null;
    let frecuenciaAnterior: string | undefined = undefined;
    let maxFechaString: string | undefined = undefined;

    docs.forEach(doc => {
      const data = doc.data();
      const parts = data.fecha.split('-');
      const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (!isNaN(dateObj.getTime())) {
        if (!maxFecha || dateObj.getTime() > maxFecha.getTime()) {
          maxFecha = dateObj;
          frecuenciaAnterior = data.frecuenciaCalibracion;
          maxFechaString = data.fecha;
        }
      }
    });

    if (!maxFecha || !frecuenciaAnterior) return;
    const nextAllowed = calcularSiguienteFecha(maxFechaString!, frecuenciaAnterior);
    if (!nextAllowed) return;

    if (isBefore(new Date(), nextAllowed)) {
      dispatch({ type: 'SET_ID_BLOCKED', message: `⛔️ Este equipo fue calibrado el ${format(maxFecha, "dd/MM/yyyy")} (Frecuencia: ${frecuenciaAnterior}). Próxima calibración permitida: ${format(nextAllowed, "dd/MM/yyyy")}.` });
    }
  }, [state.id, state.cliente, state.permitirExcepcion]);

  useEffect(() => { validarIdEnPeriodo(); }, [validarIdEnPeriodo]);

  const cargarEmpresas = async () => {
    try {
      const qs = await getDocs(collection(db, "clientes"));
      setListaClientes(qs.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "Sin nombre" })));
    } catch {
      setListaClientes([{ id: "1", nombre: "ERROR AL CARGAR CLIENTES" }]);
    }
  };

  useEffect(() => {
    const u = currentUser || user;
    dispatch({ type: 'SET_USER_NAME', payload: getUserName(u) });
    cargarEmpresas();
  }, [currentUser, user]);

  useEffect(() => {
    const cert = currentConsecutive || "";
    dispatch({ type: 'SET_CONSECUTIVE', consecutive: cert, magnitud: extractMagnitudFromConsecutivo(cert) });
  }, [currentConsecutive]);

  useEffect(() => {
    if (currentMagnitude) dispatch({ type: 'SET_MAGNITUD', payload: currentMagnitude });
  }, [currentMagnitude]);

  const valid = ["lugarCalibracion", "certificado", "nombre", "cliente", "id", "equipo", "marca", "magnitud", "unidad"]
    .every(k => {
       const val = state[k as keyof WorksheetState];
       return Array.isArray(val) ? val.length > 0 : !!val && String(val).trim() !== "";
    });

  const unidadesDisponibles = React.useMemo(() => {
    if (state.magnitud === "Electrica") return [...unidadesPorMagnitud.Electrica.DC, ...unidadesPorMagnitud.Electrica.AC, ...unidadesPorMagnitud.Electrica.Otros] as string[];
    return (state.magnitud && unidadesPorMagnitud[state.magnitud]) ? unidadesPorMagnitud[state.magnitud] as string[] : [];
  }, [state.magnitud]);

  const handleIdBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const newId = String(e.target.value || "").trim();
    let masterFound = false;
    if (state.cliente.toLowerCase().includes("celestica") && newId) {
      const rec = findCelesticaById(newId);
      if (rec) {
        masterFound = true;
        dispatch({ type: 'AUTOCOMPLETE_SUCCESS', payload: { equipo: rec.B ?? "", marca: rec.C ?? "", modelo: rec.D ?? "", numeroSerie: rec.E ?? "" }});
      }
    }
    if (isMexicoMROClient(state.cliente) && newId && !masterFound) {
      const rec = findTechopsById(newId);
      if (rec) {
        masterFound = true;
        dispatch({ type: 'AUTOCOMPLETE_SUCCESS', payload: { equipo: rec.B ?? "", marca: rec.C ?? "", modelo: rec.D ?? "", numeroSerie: rec.E ?? "" }});
      }
    }
    if (!masterFound) dispatch({ type: 'AUTOCOMPLETE_FAIL' });
    validarIdEnPeriodo();
  };

  // 2.C: Manejo de Errores Robusto en Red (con respaldo local)
  const handleSave = useCallback(async () => {
    if (!valid) return alert("⚠️ Completa todos los campos obligatorios");
    if (state.idBlocked && !state.permitirExcepcion) return alert("❌ Equipo bloqueado por periodo de calibración.");

    setIsSaving(true);
    try {
      // Verificación previa de red básica
      if (!navigator.onLine) {
         throw new Error("offline");
      }

      const q = query(collection(db, "hojasDeTrabajo"), where("certificado", "==", state.certificado));
      if (!(await getDocs(q)).empty) {
         setIsSaving(false);
         return alert("❌ Certificado ya existe.");
      }

      const { jsPDF } = await import("jspdf");
      const pdfDoc = generateTemplatePDF(state, jsPDF as any); // Cast necesario si la librería no exporta tipos perfectos
      const blob = pdfDoc.output("blob");
      const nombreArchivo = `worksheets/${getUserName(currentUser || user)}/${state.certificado}_${state.id || "SINID"}.pdf`;
      const pdfRef = ref(storage, nombreArchivo);

      await uploadBytes(pdfRef, blob);
      const pdfURL = await getDownloadURL(pdfRef);

      const fullData = { ...state, pdfURL, timestamp: Date.now(), userId: currentUser?.uid || user?.uid || "unknown" };
      await addDoc(collection(db, "hojasDeTrabajo"), fullData);

      if (autoTransferEnabled) {
        const transferred = await transferToFriday(state, fullData.userId, user);
        alert(transferred ? "✅ Guardado y transferido a Friday" : "✅ Guardado (Error en transferencia a Friday)");
      } else {
        alert("✅ Guardado exitoso");
      }

      // Limpiar respaldo si existía uno por error previo
      localStorage.removeItem('backup_worksheet_data');
      goBack();

    } catch (e: any) {
      console.error("Error al guardar:", e);
      
      // 2.C: Guardar respaldo local si falla por red u otro error crítico
      localStorage.setItem('backup_worksheet_data', JSON.stringify(state));
      
      let msg = "Error desconocido al guardar.";
      if (e.message === "offline" || e.code === "unavailable" || e.message.includes("network")) {
         msg = "⚠️ ERROR DE RED: No hay conexión. Se ha guardado una COPIA LOCAL. No cierre la sesión e intente guardar nuevamente cuando recupere la conexión.";
      } else {
         msg = `❌ Error: ${e.message || e}. Se guardó una copia de respaldo local.`;
      }
      alert(msg);

    } finally {
      setIsSaving(false);
    }
  }, [valid, state, currentUser, user, goBack, autoTransferEnabled]);

  const handleTogglePreview = useCallback(async () => {
    const newShow = !showPreview;
    setShowPreview(newShow);
    if (newShow) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      try {
        const { jsPDF } = await import("jspdf");
        setPreviewUrl(URL.createObjectURL(generateTemplatePDF(state, jsPDF as any).output("blob")));
      } catch (e) { console.error(e); setPreviewUrl(null); }
    } else if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    }
  }, [showPreview, previewUrl, state]);

  const toggleAutoTransfer = () => {
    setAutoTransferEnabled(prev => {
       localStorage.setItem('autoTransferWorksheets', (!prev).toString());
       return !prev;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-lg">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={goBack} className="p-2 hover:bg-white/10 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center"><Tag className="w-6 h-6" /></div>
              <div><h1 className="text-xl font-bold">Hoja de Trabajo</h1><p className="text-blue-100 text-sm">Consecutivo: {state.certificado || "SIN CERTIFICADO"}</p></div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={toggleAutoTransfer} className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${autoTransferEnabled ? 'bg-green-500/20 text-green-200 border border-green-400/50' : 'bg-white/10 text-white border border-white/20'}`}>
              <Zap className="w-4 h-4" /><span className="text-sm">Auto → Friday</span>
            </button>
            <button onClick={handleTogglePreview} className="px-4 py-2 text-white hover:bg-white/10 rounded-lg flex items-center space-x-2">
              <Edit3 className="w-4 h-4" /><span>{showPreview ? "Ocultar Vista" : "Mostrar Vista"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className={`grid gap-8 ${showPreview ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-4xl mx-auto"}`}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Información de Calibración</h2>
              <p className="text-gray-600 mt-1">Complete los datos para generar la hoja de trabajo</p>
              {autoTransferEnabled && <div className="mt-3 flex items-center space-x-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg"><Zap className="w-4 h-4" /><span className="text-sm font-medium">Se transferirá automáticamente al tablero Friday</span></div>}
            </div>
            <div className="p-8 space-y-8">
              <div>
                <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><MapPin className="w-4 h-4 text-orange-500" /><span>Lugar de Calibración*</span></label>
                <div className="grid grid-cols-3 gap-4 text-gray-700">
                  {["Sitio", "Laboratorio"].map((opt) => (
                    <button key={opt} onClick={() => dispatch({ type: 'SET_FIELD', field: 'lugarCalibracion', payload: opt })}
                      className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${state.lugarCalibracion === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>{opt}</button>
                  ))}
                </div>
              </div>
              {state.lugarCalibracion === "Laboratorio" && (
                <div className="mt-4">
                  <label className="block font-semibold text-sm text-gray-700 mb-1">Fecha de Recepción</label>
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={state.fechaRecepcion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fechaRecepcion', payload: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Calendar className="w-4 h-4 text-green-500" /><span>Frecuencia*</span></label>
                  <select value={state.frecuenciaCalibracion} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'frecuenciaCalibracion', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="">Seleccionar...</option><option value="3 meses">3 meses</option><option value="6 meses">6 meses</option><option value="1 año">1 año</option><option value="2 años">2 años</option><option value="3 años">3 años</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Calendar className="w-4 h-4 text-blue-500" /><span>Fecha*</span></label>
                  <input type="date" value={state.fecha} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'fecha', payload: e.target.value })} className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-purple-500" /><span>N.Certificado*</span></label><input type="text" value={state.certificado} readOnly className="w-full p-4 border rounded-lg bg-gray-50 text-gray-800" placeholder="Automático" /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Mail className="w-4 h-4 text-red-500" /><span>Nombre*</span></label><input type="text" value={state.nombre} readOnly className="w-full p-4 border rounded-lg bg-gray-50 text-gray-800" /></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Building2 className="w-4 h-4 text-indigo-500" /><span>Cliente*</span></label><ClienteSearchSelect clientes={listaClientes} onSelect={(v) => dispatch({ type: 'SET_CLIENTE', payload: v })} currentValue={state.cliente} /></div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-gray-500" /><span>ID*</span></label>
                  <input type="text" value={state.id} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'id', payload: e.target.value })} onBlur={handleIdBlur} className={`w-full p-4 border-2 rounded-lg transition-all ${state.idBlocked && !state.permitirExcepcion ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 focus:ring-blue-500"}`} placeholder="ID" />
                  {state.idBlocked && !state.permitirExcepcion && <p className="mt-2 text-sm font-medium text-red-600 animate-pulse">{state.idErrorMessage}</p>}
                  <div className="mt-3"><label className="flex items-center gap-2"><input type="checkbox" checked={state.permitirExcepcion} onChange={(e) => dispatch({ type: 'SET_EXCEPCION', payload: e.target.checked })} className="rounded text-blue-600" disabled={!state.idBlocked} /><span className={`text-sm ${state.idBlocked ? 'text-red-700 font-bold' : 'text-gray-500'}`}>Permitir excepción</span></label></div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Wrench className="w-4 h-4 text-yellow-500" /><span>Equipo*</span></label><input type="text" value={state.equipo} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'equipo', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg" /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Tag className="w-4 h-4 text-pink-500" /><span>Marca*</span></label><input type="text" value={state.marca} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'marca', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Hash className="w-4 h-4 text-teal-500" /><span>Modelo</span></label><input type="text" value={state.modelo} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'modelo', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg" /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-purple-500" /><span>Nº Serie</span></label><input type="text" value={state.numeroSerie} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'numeroSerie', payload: e.target.value })} readOnly={state.fieldsLocked} className="w-full p-4 border rounded-lg" /></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Tag className="w-4 h-4 text-blue-500" /><span>Magnitud*</span></label>
                  {currentMagnitude ? <div className="relative"><input type="text" value={state.magnitud} readOnly className="w-full p-4 border rounded-lg bg-gray-50 font-semibold" /><div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">Auto</div></div> :
                    <select value={state.magnitud} onChange={(e) => dispatch({ type: 'SET_MAGNITUD', payload: e.target.value })} className="w-full p-4 border rounded-lg"><option value="">Seleccionar...</option>{magnitudesDisponibles.map(m => <option key={m} value={m}>{m}</option>)}</select>}
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><Tag className="w-4 h-4 text-violet-500" /><span>Unidad*</span></label>
                  {state.magnitud === "Electrica" ? (
                    <div className="mb-4 space-y-3 p-4 border rounded-lg bg-gray-50"><div className="font-bold text-gray-700">Tipo Eléctrico</div><Tabs value={tipoElectrica} onValueChange={(v) => setTipoElectrica(v as any)}><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="DC">DC</TabsTrigger><TabsTrigger value="AC">AC</TabsTrigger><TabsTrigger value="Otros">Otros</TabsTrigger></TabsList></Tabs><div className="mt-3 grid grid-cols-3 gap-2">{unidadesPorMagnitud.Electrica[tipoElectrica].map((u: string) => (<label key={u} className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={state.unidad.includes(u)} onChange={() => { const newU = state.unidad.includes(u) ? state.unidad.filter(x => x !== u) : [...state.unidad, u]; dispatch({ type: 'SET_FIELD', field: 'unidad', payload: newU }); }} className="rounded text-blue-600" /><span>{u}</span></label>))}</div></div>
                  ) : (
                    <select multiple value={state.unidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'unidad', payload: Array.from(e.target.selectedOptions, o => o.value) })} disabled={!state.magnitud} className="w-full p-4 border rounded-lg"><option value="" disabled>{state.magnitud ? "Seleccionar..." : "Seleccione magnitud"}</option>{unidadesDisponibles.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  )}
                </div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-3">Alcance</label><input type="text" className="w-full p-4 border rounded-lg" value={state.alcance} onChange={e => dispatch({ type: 'SET_FIELD', field: 'alcance', payload: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-3">Resolución</label><input type="text" className="w-full p-4 border rounded-lg" value={state.resolucion} onChange={e => dispatch({ type: 'SET_FIELD', field: 'resolucion', payload: e.target.value })} required /></div>
              {state.magnitud === "Masa" ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-purple-400" /><span>Excentricidad</span></label><input type="text" value={state.excentricidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'excentricidad', payload: e.target.value })} className="w-full p-4 border rounded-lg" /></div>
                    <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-pink-400" /><span>Linealidad</span></label><input type="text" value={state.linealidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'linealidad', payload: e.target.value })} className="w-full p-4 border rounded-lg" /></div>
                  </div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-orange-400" /><span>Repetibilidad</span></label><input type="text" value={state.repetibilidad} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'repetibilidad', payload: e.target.value })} className="w-full p-4 border rounded-lg" /></div>
                </>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-teal-400" /><span>Medición Patrón</span></label><textarea value={state.medicionPatron} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionPatron', payload: e.target.value })} rows={4} className="w-full p-2 border rounded resize-none overflow-y-auto max-h-40" /></div>
                  <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-blue-400" /><span>Medición Instrumento</span></label><textarea value={state.medicionInstrumento} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'medicionInstrumento', payload: e.target.value })} rows={4} className="w-full p-2 border rounded resize-none overflow-y-auto max-h-40" /></div>
                </div>
              )}
              <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-gray-400" /><span>Notas</span></label><textarea value={state.notas} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'notas', payload: e.target.value })} className="w-full p-4 border rounded-lg resize-none" rows={2} /></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-sky-400" /><span>Temp. Ambiente (°C)</span></label><input type="number" value={state.tempAmbiente} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'tempAmbiente', payload: e.target.value })} className="w-full p-4 border rounded-lg" /></div>
                <div><label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3"><NotebookPen className="w-4 h-4 text-pink-400" /><span>HR%</span></label><input type="number" value={state.humedadRelativa} onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'humedadRelativa', payload: e.target.value })} className="w-full p-4 border rounded-lg" /></div>
              </div>
            </div>
            {showPreview && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden h-full min-h-[1000px]">
                <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-4 border-b border-gray-200"><h2 className="text-lg font-bold text-gray-900">Vista Previa del PDF Real</h2></div>
                <div className="h-full w-full">{previewUrl ? <iframe src={previewUrl} width="100%" className="h-full min-h-[900px]" style={{ border: 'none' }} title="Vista Previa PDF" /> : <div className="p-8 flex items-center justify-center h-[900px]"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><span className="ml-3 text-gray-700">Generando vista previa...</span></div>}</div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
          <div className="flex justify-end space-x-4">
            <button onClick={() => goBack()} className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all flex items-center space-x-2" disabled={isSaving}><X className="w-4 h-4" /><span>Cancelar</span></button>
            <button onClick={handleSave} disabled={isSaving || !valid || (state.idBlocked && !state.permitirExcepcion)} className={`px-6 py-3 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-all flex items-center space-x-2 shadow-lg ${isSaving || !valid || (state.idBlocked && !state.permitirExcepcion) ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-700'}`}>{isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span>{isSaving ? "Guardando..." : "Guardar"}</span></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkSheetScreen;