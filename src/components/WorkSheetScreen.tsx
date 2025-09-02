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
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { storage, db } from "../utils/firebase";
import { collection, addDoc, query, getDocs, where, doc, updateDoc, getDoc, setDoc } from "firebase/firestore"; // MODIFICADO: Agregadas funciones para Friday
import masterCelestica from "../data/masterCelestica.json";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { set } from "date-fns";

type CelesticaRecord = {
  A: string; // ID
  B: string; // Equipo
  C: string; // Marca
  D: string; // Modelo
  E: string; // Número de Serie
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
  "Tiempo",
  "Velocidad",
  "Vacio",
  "Par Torsional",
];

const unidadesPorMagnitud: Record<string, string[]> = {
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
  Masa: ["g", "kg", "lb"],
  Tiempo: ["s", "min", "h"],
  Velocidad: ["m/s", "km/h"],
  Vacio: ["atm", "Psi", "mbar", "Torr", "mmHg", "micron", "inHg"],
  "Par Torsional": ["N*m", "Lbf*ft", "kgf*cm", "Lbf*in", "c*N", "oz*in", "oz*ft"],
};


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
    let destinoGroupName = "🧪 Laboratorio";
    let destinoColorIdx = 1;
    if (lugar === "sitio") {
      destinoGroupId = "sitio";
      destinoGroupName = "🏭 Sitio";
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

    // 4. GENERA EL FOLIO AUTOMÁTICO
    const generateAutoNumber = (groups: any[], colKey: string): number => {
      let maxNum = 0;
      groups.forEach((g: any) => {
        g.rows.forEach((row: any) => {
          if (row[colKey] && typeof row[colKey] === "number") {
            maxNum = Math.max(maxNum, row[colKey]);
          }
        });
      });
      return maxNum + 1;
    };
    const newFolio = generateAutoNumber(groups, "folio");

    // 5. Genera el objeto newRow (¡ya con folio!)
    const newRow = {
      id: "r" + Math.random().toString(36).slice(2, 8),
      id_equipo: formData.id || "",
      folio: newFolio,
      equipo: formData.equipo || "Sin especificar",
      cliente: formData.cliente || formData.clienteSeleccionado || "Sin especificar",
      responsable: formData.responsable || getUserName(user),
      estado: "En proceso",
      prioridad: "Media",
      progreso: 0,
      fecha_limite: formData.fecha || new Date().toISOString().slice(0, 10),
      created_at: { timestamp: Date.now(), userId: userId || "unknown" },
      last_updated: { timestamp: Date.now(), userId: userId || "unknown" },
      certificado: formData.certificado,
      magnitud: formData.magnitud,
      unidad: formData.unidad,
      lugar_calibracion: formData.lugarCalibracion,
      frecuencia_calibracion: formData.frecuenciaCalibracion,
      marca: formData.marca,
      modelo: formData.modelo,
      numero_serie: formData.numeroSerie,
      notas_calibracion: formData.notas,
      source_type: "worksheet",
      transferred_at: Date.now(),
    };

    // LIMPIA newRow de valores undefined o problemáticos
    Object.keys(newRow).forEach((key) => {
      if (typeof newRow[key] === "undefined") delete newRow[key];
      if (
        typeof newRow[key] === "object" &&
        newRow[key] !== null &&
        !Array.isArray(newRow[key])
      ) {
        if (!("timestamp" in newRow[key]) || !("userId" in newRow[key])) {
          delete newRow[key];
        }
      }
    });
    console.log("Row limpio para insertar:", newRow);

    // 6. Inserta la fila al grupo correcto
    if (groupIndex !== -1) {
      groups[groupIndex].rows.push(newRow);
    } else {
      alert("No se encontró el grupo destino para insertar la fila.");
      return false;
    }

    // 7. Justo antes de actualizar, log de debug
    console.log("Grupos antes de updateDoc:", JSON.stringify(groups, null, 2));

    // 8. Actualizar el tablero en Firestore
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


// Generación de PDF (sin cambios)
const generateTemplatePDF = (formData: any, JsPDF: any) => {
  const doc = new jsPDF({ orientation:"p", unit: "pt", format: "a4" }); 
  
  const marginLeft = 50;
  const marginRight = 550;
  const lineHeight = 18;
  let y = 50;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);

  // Cargar e insertar LOGO si ya lo tienes en base64
  // Debes tenerlo como base64 en un archivo .ts o .js
  // Aquí te dejo cómo sería si ya lo tienes:
  const logoBase64 = "data:image/png;base64,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"; // reemplaza por el contenido real
  doc.addImage(logoBase64, "PNG", marginLeft, y, 50, 50);

  // Título del laboratorio
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("Equipos y Servicios Especializados AG", marginLeft + 60, y + 20);

  // Fecha y nombre
  doc.setFontSize(12);
  doc.setFont(undefined, "normal");
  doc.text(`Fecha: ${formData.fecha}`, marginRight - 100, y + 20);
  doc.setFont(undefined, "bold");
  doc.text(`Nombre: ${formData.nombre}`, marginRight - 100, y + 40);
  y += 70;

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
    ["Unidad", formData.unidad],
    ["Alcance", formData.alcance],
    ["Resolucion", formData.resolucion],
    ["Frecuencia de Calibración", formData.frecuenciaCalibracion],
    ["Temp. Ambiente", `${formData.tempAmbiente} °C`],
    ["HR%", `${formData.humedadRelativa} %`],
  ];

  doc.setFontSize(11);
  for (let i = 0; i < infoPairs.length; i++) {
    const [label, value] = infoPairs[i];
    doc.setFont(undefined, "bold");
    doc.text(`${label}:`, marginLeft, y);
    doc.setFont(undefined, "normal");
    doc.text(`${value || "-"}`, marginLeft + 150, y);
    y += lineHeight;
  }

  y += 20;

  // --- Tabla de mediciones ---
  const tableTop = y;
  const tableWidth = 500;
  const colWidth = tableWidth / 2;
  const rowHeight = 24;
  const valueHeight = 60;

  // Header con fondo gris
  doc.setFillColor(230);
  doc.setDrawColor(180);
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
  y = 790;
  doc.setFontSize(10);
  doc.setFont(undefined, "italic");
  doc.text("AG-CAL-F39-00", marginLeft, y);

  return doc;
};

export const WorkSheetScreen: React.FC = () => {
  const { currentConsecutive, goBack, currentUser, currentMagnitude } = useNavigation();
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isCelestica, setIsCelestica] = useState(false);
  const [fieldsLocked, setFieldsLocked] = useState(false);
  const [resolucion, setResolucion] = useState("");
  const [alcance, setAlcance] = useState("");
  const [listaClientes, setListaClientes] = useState<{ id: string; nombre: string }[]>([]);
  // NUEVO: Estado para auto-transferencia
  const [autoTransferEnabled, setAutoTransferEnabled] = useState(() => 
    localStorage.getItem('autoTransferWorksheets') === 'true'
  );

  const [tipoElectrica, setTipoElectrica] = useState<"DC" | "AC" | "Otros">("DC");

  const [formData, setFormData] = useState({
    lugarCalibracion: "",
    frecuenciaCalibracion: "",
    fecha: new Date().toISOString().slice(0, 10),
    certificado: "",
    nombre: "",
    cliente: "",
    id: "",
    equipo: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    magnitud: "",
    unidad: "",
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

  // Cuando cambia el cliente: aplica EP- si es Celestica y limpia
  const handleClienteChange = (value: string) => {
    const cel = value.includes("Celestica");
    setIsCelestica(cel);
    setFormData((prev) => ({
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
    // Si borró todo el ID, limpia también las columnas
    if (value.trim() === "") {
      setFormData((prev) => ({
        ...prev,
        id: "",
        equipo: "",
        marca: "",
        modelo: "",
        numeroSerie: "",
      }));
      setFieldsLocked(false);
      return;
    }

    // Actualiza siempre el ID
    setFormData((prev) => ({ ...prev, id: value }));

    if (!isCelestica) {
      // si no es Celestica, nada más actualiza ID
      return;
    }

    // Busca en el JSON (omite encabezado)
    const recs = (masterCelestica as CelesticaRecord[]).filter((r) => r.A !== "ID");
    const rec = recs.find((r) => r.A === value);

    if (rec) {
      setFormData((prev) => ({
        ...prev,
        equipo: rec.B,
        marca: rec.C,
        modelo: rec.D,
        numeroSerie: rec.E,
      }));
      setFieldsLocked(true);
    } else {
      // no existe → desbloquea para edición manual
      setFieldsLocked(false);
    }
  };

  // Carga lista de clientes
  const cargarEmpresas = async () => {
    try {
      const qs = await getDocs(collection(db, "clientes"));
      setListaClientes(qs.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "Sin nombre" })));
    } catch {
      // fallback estático
      setListaClientes([
        { id: "1", nombre: "Celestica Standard" },
        { id: "2", nombre: "Celestica Medico" },
        { id: "3", nombre: "Celestica Edificio E" },
      ]);
    }
  };

  // Extrae nombre de usuario al montar
  useEffect(() => {
    const u = currentUser || user;
    setFormData((prev) => ({ ...prev, nombre: getUserName(u) }));
    cargarEmpresas();
  }, [currentUser, user]);

  // Cuando cambia el consecutivo, guarda y auto-detecta magnitud
  useEffect(() => {
    const cert = currentConsecutive || "";
    const mag = extractMagnitudFromConsecutivo(cert);
    setFormData((prev) => ({
      ...prev,
      certificado: cert,
      magnitud: mag,
      unidad: "", // limpia unidad
    }));
  }, [currentConsecutive]);

  // Si hay un currentMagnitude explícito, lo aplica (mantiene tu lógica previa)
  useEffect(() => {
    if (currentMagnitude) {
      setFormData((prev) => ({
        ...prev,
        magnitud: currentMagnitude,
        unidad: "",
      }));
    }
  }, [currentMagnitude]);

  // Cada vez que magnitud cambia manual o automáticamente, limpia unidad
  const handleMagnitudChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      magnitud: value,
      unidad: "",
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
  const valid = camposObligatorios.every((k) => formData[k]?.trim());
  const magnitudReadOnly = !!currentMagnitude;
  const unidadesDisponibles = React.useMemo(() => {
  if (formData.magnitud === "Electrica") {
    // Solo muestra unidades según el tipo (AC, DC u Otros)
    return unidadesPorMagnitud["Electrica"][tipoElectrica] || [];
  } else if (formData.magnitud && unidadesPorMagnitud[formData.magnitud]) {
    return unidadesPorMagnitud[formData.magnitud] as string[];
  }
  return [];
}, [formData.magnitud, tipoElectrica]);

  // MODIFICADO: handleSave con integración automática
  const handleSave = useCallback(async () => {
    if (!valid) {
      alert("⚠️ Completa todos los campos obligatorios");
      return;
    }
    setIsSaving(true);
    try {
    // Paso 4.1 – Validar si el certificado ya existe en Firestore
  const certificado = formData.certificado;
  const q = query(
    collection(db, "worksheets"),
    where("consecutivo", "==", certificado)
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
      const nombreArchivo = `worksheets/${carpeta}/${formData.certificado}_${fecha}.pdf`;
      const pdfRef = ref(storage, nombreArchivo);

      await uploadBytes(pdfRef, blob);
      await getDownloadURL(pdfRef);
      
    const yaExiste = await verificarDuplicado(formData.id, formData.frecuenciaCalibracion);
if (yaExiste) {
  alert("⚠️ Ya existe una calibración registrada con este ID y frecuencia en este año.");
  return; // Detenemos el guardado
}

      // Agregar timestamp para tracking
      const worksheetDataWithTimestamp = {
        ...formData,
        timestamp: Date.now(),
        userId: currentUser?.uid || user?.uid || "unknown"
      };
      
      await addDoc(collection(db, "hojasDeTrabajo"), worksheetDataWithTimestamp);
      
      // 🚀 NUEVA FUNCIONALIDAD: Auto-transferencia al tablero Friday
      if (autoTransferEnabled) {
        try {
          const transferSuccess = await transferToFriday(
            worksheetDataWithTimestamp, 
            currentUser?.uid || user?.uid || "unknown"
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
      alert("❌ Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  }, [valid, formData, currentUser, user, goBack, autoTransferEnabled]);

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
                    <span>Frecuencia</span>
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
                    <span>Fecha</span>
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
                    className="w-full p-4 border rounded-lg"
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
                  <select
                    value={formData.cliente}
                    onChange={(e) => handleClienteChange(e.target.value)}
                    className="w-full p-4 border rounded-lg"
                  >
                    <option value="">Seleccionar...</option>
                    {listaClientes.map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Hash className="w-4 h-4 text-gray-500" />
                    <span>ID*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => handleIdChange(e.target.value)}
                    className="w-full p-4 border rounded-lg"
                    placeholder=""
                  />
                </div>
              </div>

              {/* Permitir Excepción */}
<div className="mt-6">
  <label className="flex items-center space-x-2">
    <input
      type="checkbox"
      checked={formData.excepcionAprobada}
      onChange={(e) =>
        setFormData({ ...formData, excepcionAprobada: e.target.checked })
      }
      className="form-checkbox h-5 w-5 text-blue-600"
    />
    <span className="text-sm text-gray-700">
      Permitir excepción (requiere aprobación)
    </span>
  </label>
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
                    value={formData.equipo}
                    onChange={(e) => handleInputChange("equipo", e.target.value)}
                    readOnly={fieldsLocked}
                    className={`w-full p-4 border rounded-lg text-white-700 ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed text-gray-800" : ""
                    }`}
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
                    value={formData.marca}
                    onChange={(e) => handleInputChange("marca", e.target.value)}
                    readOnly={fieldsLocked}
                    className={`w-full p-4 border rounded-lg text-white-700 ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed text-gray-800" : ""
                    }`}
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
                    value={formData.modelo}
                    onChange={(e) => handleInputChange("modelo", e.target.value)}
                    readOnly={fieldsLocked}
                    className={`w-full p-4 border rounded-lg text-white-800 ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed text-gray-800" : ""
                    }`}
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
                    value={formData.numeroSerie}
                    onChange={(e) => handleInputChange("numeroSerie", e.target.value)}
                    readOnly={fieldsLocked}
                    className={`w-full p-4 border rounded-lg text-white-800 ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed text-gray-900" : ""
                    }`}
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
  <div className="flex gap-4 mb-2 text-black">
    <label>
      <input
        type="radio"
        name="tipoElectrica"
        value="DC"
        checked={tipoElectrica === "DC"}
        onChange={() => setTipoElectrica("DC")}
      />{" "}
      DC
    </label>
    <label>
      <input
        type="radio"
        name="tipoElectrica"
        value="AC"
        checked={tipoElectrica === "AC"}
        onChange={() => setTipoElectrica("AC")}
      />{" "}
      AC
    </label>
    <label>
      <input
        type="radio"
        name="tipoElectrica"
        value="Otros"
        checked={tipoElectrica === "Otros"}
        onChange={() => setTipoElectrica("Otros")}
      />{" "}
      Otros
    </label>
  </div>
)}
                  <select
                    multiple
                    value={formData.unidad || []}
                    onChange={(e) => 
                      setFormData({
                       ...formData,
                       unidad: Array.from(e.target.selectedOptions, (option) => option.value)
                         })
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
                  {formData.magnitud && unidadesDisponibles.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">Sin unidades definidas</p>
                  )}
                </div>
              </div>
        
  <div>
    <label className="block text-sm font-medium text-gray-200 mb-1 text-gray-800">Alcance</label>
    <input
      type="text"
      className="w-full px-3 py-2 rounded-lg bg-[#232323] border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] transition"
      value={alcance}
      onChange={e => setAlcance(e.target.value)}
      placeholder="Ej: 10"
      autoComplete="off"
      spellCheck={false}
      required
    />
  </div>

{/* Resolución */}
  <div>
    <label className="block text-sm font-medium text-gray-200 mb-1 text-gray-800">Resolución</label>
    <input
      type="text"
      className="w-full px-3 py-2 rounded-lg bg-[#232323] border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#38bdf8] transition"
      value={resolucion}
      onChange={e => setResolucion(e.target.value)}
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
                      onChange={(e) => setFormData({ ...formData, medicionPatron: e.target.value})}
                      rows={4}
                      className="w-full p-2 border rounded resize-y"
                    />
                  </div>
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                      <NotebookPen className="w-4 h-4 text-blue-400" />
                      <span>Medición Instrumento</span>
                    </label>
                    <textarea
                      value={formData.medicionInstrumento}
                      onChange={(e) => setFormData({ ...formData, medicionInstrumento: e.target.value})}
                      rows={4}
                      className="w-full p-2 border rounded resize-y"
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
                    <div><strong>Unidad:</strong> {formData.unidad}</div>
                    <div><strong>Alcance:</strong> {formData.alcance}</div>
                  </div>
                  <div><strong>Resolucion:</strong> {formData.resolucion}</div>
                  <div><strong>Frecuencia de Calibración:</strong> {formData.frecuenciaCalibracion}</div>
                  <div className="flex space-x-8 text-black">
                    <div><strong>Temp:</strong> {formData.tempAmbiente}°C</div>
                    <div><strong>HR:</strong> {formData.humedadRelativa}%</div>
                  </div>
                </div>

                {/* Tabla de mediciones */}
                <div className="mt-6 border border-gray-400">
                  <div className="grid grid-cols-2 border-b border-gray-400">
                    {esMagnitudMasa(formData.magnitud) ? (
                      <>
                        <div className="p-2 border-r border-gray-400 bg-gray-50 font-bold">Excentricidad:</div>
                        <div className="p-2 bg-gray-50 font-bold">Linealidad:</div>
                      </>
                    ) : (
                      <>
                        <div className="p-2 border-r border-gray-400 bg-gray-50 font-bold text-black">Medición Patrón:</div>
                        <div className="p-2 bg-gray-50 font-bold text-black">Medición Instrumento:</div>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 min-h-[100px]">
                    {esMagnitudMasa(formData.magnitud) ? (
                      <>
                        <div className="p-2 border-r border-gray-400 text-xs">
                          {formData.excentricidad}
                        </div>
                        <div className="p-2 text-xs">
                          {formData.linealidad}
                        </div>
                        <div className="col-span-2 p-2 text-xs border-t border-gray-400">
                          <strong>Repetibilidad:</strong> {formData.repetibilidad}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-2 border-r border-gray-400 text-xs text-black">
                          {formData.medicionPatron}
                        </div>
                        <div className="p-2 text-xs text-black">
                          {formData.medicionInstrumento}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4">
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
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-all flex items-center space-x-2 shadow-lg"
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
const verificarDuplicado = async (id: string, frecuencia: string): Promise<boolean> => {
  const anioActual = new Date().getFullYear().toString();
  const worksheetRef = collection(db, "worksheets"); // <-- Cambia si tu colección se llama diferente

  const q = query(
    worksheetRef,
    where("id", "==", id),
    where("frecuenciaCalibracion", "==", frecuencia),
    where("certificado", ">=", `AG-${id}-0000-${anioActual}`),
    where("certificado", "<=", `AG-${id}-9999-${anioActual}`)
  );

  const querySnapshot = await getDocs(q);
  return !querySnapshot.empty;
};
export default WorkSheetScreen;