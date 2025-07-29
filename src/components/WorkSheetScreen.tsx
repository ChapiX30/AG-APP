import React, { useEffect, useRef, useState } from "react";
import { useNavigation } from "../hooks/useNavigation";
import {
  ArrowLeft, Save, X, Calendar, MapPin, Mail, Building2, Wrench, Tag, Hash, Loader2, NotebookPen,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from '../hooks/useAuth';
import { storage, db } from "../utils/firebase";
import { collection, addDoc } from "firebase/firestore";

// Helper para sacar el nombre automáticamente del usuario logueado
const getUserName = (user: any) => {
  if (!user) return "Sin Usuario";
  
  // Intenta diferentes propiedades del usuario
  const name = user.displayName || 
               user.name || 
               user.nombre || 
               user.firstName ||
               user.given_name ||
               user.profile?.name ||
               user.profile?.displayName ||
               (user.email ? user.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : null) ||
               user.uid || 
               "Sin Usuario";
  
  return name;
};

const extractMagnitudFromConsecutivo = (consecutivo: string): string => {
  if (!consecutivo) return "";

  const magnitudMapping: Record<string, string> = {
    "AGAC": "Acustica",
    "AGD": "Dimensional", 
    "AGF": "Fuerza",
    "AGP": "Presión",
    "EL": "Electrica",
    "TE": "Temperatura",
    "MA": "Masa",
    "TI": "Tiempo",
    "VE": "Velocidad",
    "TO": "Torque"
  };

  const parts = consecutivo.split("-");
  if (parts.length >= 2) {
    const codigoMagnitud = parts[1]; // Segunda parte del consecutivo
    return magnitudMapping[codigoMagnitud] || "";
  }

  for (const [codigo, magnitud] of Object.entries(magnitudMapping)) {
    if (consecutivo.includes(codigo)) {
      return magnitud;
    }
  }
  
  return "";
};

const magnitudesDisponibles = [
  "Acustica",
  "Dimensional", 
  "Fuerza",
  "Presión",
  "Electrica",
  "Temperatura",
  "Masa",
  "Tiempo",
  "Velocidad",
  "Torque"
];

// Unidades según magnitud
const unidadesPorMagnitud: Record<string, string[]> = {
  Acustica: ["dB", "Hz", "Pa"],
  Dimensional: ["m", "cm", "mm", "in", "ft", "yd"],
  Fuerza: ["N", "kgf", "lbf"],
  Presión: ["kPa", "bar", "psi"],
  Electrica: ["V", "mV", "kV", "A", "mA", "µA", "Ω", "kΩ", "MΩ", "W", "kW"],
  Temperatura: ["°C", "°F", "K"],
  Masa: ["g", "kg", "lb"],
  Tiempo: ["s", "min", "h"],
  Velocidad: ["m/s", "km/h"],
  Torque: ["N.m", "kgf.m", "lbf.in"],
  // ... agrega más magnitudes y unidades aquí
};

// Función para generar PDF con formato de plantilla
const generateTemplatePDF = (formData: any) => {
  const doc = new jsPDF();
  
  // Configuración de fuentes y tamaños
  const titleSize = 16;
  const headerSize = 12;
  const normalSize = 10;
  const smallSize = 8;
  
  // Colores
  const headerColor = [70, 130, 180]; // Steel blue
  const textColor = [0, 0, 0]; // Black
  
  // Márgenes
  const marginLeft = 20;
  const marginRight = 20;
  const marginTop = 20;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  let yPosition = marginTop;
  
  // Header con logo placeholder y título de empresa
  doc.setFontSize(headerSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...headerColor);
  
  // Logo placeholder (círculo simple)
  doc.circle(marginLeft + 15, yPosition + 15, 12);
  doc.setFontSize(smallSize);
  doc.text("LOGO", marginLeft + 10, yPosition + 18);
  
  // Información de la empresa
  doc.setFontSize(normalSize);
  doc.setTextColor(...textColor);
  doc.text("Equipos y Servicios", marginLeft + 35, yPosition + 10);
  doc.text("Especializados AG, S.A. de C.V.", marginLeft + 35, yPosition + 18);
  
  yPosition += 40;
  
  // Título principal
  doc.setFontSize(titleSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...headerColor);
  doc.text("Hoja de trabajo", marginLeft, yPosition);
  
  // Fecha y Nombre en la parte superior derecha
  doc.setFontSize(normalSize);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textColor);
  doc.text(`Fecha: ${formData.fecha}`, pageWidth - 80, yPosition);
  doc.text(`Nombre: ${formData.nombre}`, pageWidth - 80, yPosition + 8);
  
  yPosition += 25;
  
  // Lugar de calibración
  doc.setFontSize(normalSize);
  doc.text(`<<${formData.lugarCalibracion}>>`, marginLeft, yPosition);
  
  yPosition += 15;
  
  // Información principal
  doc.setFont("helvetica", "bold");
  doc.text("N.Certificado:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.certificado}`, marginLeft + 35, yPosition);
  
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text("Fecha de Recepción:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.fecha}`, marginLeft + 45, yPosition);
  
  yPosition += 8;
  
  // Cliente y Equipo en la misma línea
  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.cliente}`, marginLeft + 25, yPosition);
  
  doc.setFont("helvetica", "bold");
  doc.text("Equipo:", marginLeft + 90, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.equipo}`, marginLeft + 115, yPosition);
  
  yPosition += 8;
  
  // ID y Marca en la misma línea
  doc.setFont("helvetica", "bold");
  doc.text("ID:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.id}`, marginLeft + 15, yPosition);
  
  doc.setFont("helvetica", "bold");
  doc.text("Marca:", marginLeft + 90, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.marca}`, marginLeft + 115, yPosition);
  
  yPosition += 8;
  
  // Modelo
  doc.setFont("helvetica", "bold");
  doc.text("Modelo:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.modelo}`, marginLeft + 25, yPosition);
  
  yPosition += 8;
  
  // Número de Serie
  doc.setFont("helvetica", "bold");
  doc.text("Numero de Serie:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.numeroSerie}`, marginLeft + 45, yPosition);
  
  yPosition += 8;
  
  // Unidad y Alcance en la misma línea
  doc.setFont("helvetica", "bold");
  doc.text("Unidad:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.unidad}`, marginLeft + 25, yPosition);
  
  doc.setFont("helvetica", "bold");
  doc.text("Alcance:", marginLeft + 90, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.alcance}`, marginLeft + 115, yPosition);
  
  yPosition += 8;
  
  // Resolución
  doc.setFont("helvetica", "bold");
  doc.text("Resolución:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.resolucion}`, marginLeft + 30, yPosition);
  
  yPosition += 8;
  
  // Frecuencia de Calibración
  doc.setFont("helvetica", "bold");
  doc.text("Frecuencia de Calibración:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.frecuenciaCalibracion}`, marginLeft + 55, yPosition);
  
  yPosition += 8;
  
  // Temp y HR en la misma línea
  doc.setFont("helvetica", "bold");
  doc.text("Temp:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.tempAmbiente}°C`, marginLeft + 20, yPosition);
  
  doc.setFont("helvetica", "bold");
  doc.text("HR:", marginLeft + 90, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.humedadRelativa}%`, marginLeft + 105, yPosition);
  
  yPosition += 20;
  
  // Tabla de mediciones
  const tableTop = yPosition;
  const tableHeight = 60;
  const tableWidth = pageWidth - marginLeft - marginRight;
  const col1Width = tableWidth / 2;
  
  // Dibujar tabla
  doc.rect(marginLeft, tableTop, tableWidth, tableHeight);
  doc.line(marginLeft + col1Width, tableTop, marginLeft + col1Width, tableTop + tableHeight);
  doc.line(marginLeft, tableTop + 15, marginLeft + tableWidth, tableTop + 15);
  
  // Headers de tabla
  doc.setFont("helvetica", "bold");
  doc.setFontSize(normalSize);
  doc.text("Medición Patrón:", marginLeft + 5, tableTop + 10);
  doc.text("Medición Instrumento:", marginLeft + col1Width + 5, tableTop + 10);
  
  // Contenido de la tabla
  doc.setFont("helvetica", "normal");
  doc.setFontSize(smallSize);
  
  // Contenido complejo para medición patrón
  const patronContent = [
    `<<IF: [Magnitud] <> "Masa">> <<[Medición Patrón]>> <<ENDIF>>`,
    `<<IF: [Magnitud] = "Masa">> Excentricidad: <<[Excentricidad]>>`,
    `Linealidad: <<[Linealidad]>> Repetibilidad: <<[Repetibilidad]>> <<ENDIF>>`
  ];
  
  let textY = tableTop + 25;
  patronContent.forEach(line => {
    doc.text(line, marginLeft + 5, textY);
    textY += 8;
  });
  
  // Medición instrumento
  doc.text(`${formData.medicionInstrumento}`, marginLeft + col1Width + 5, tableTop + 25);
  
  yPosition = tableTop + tableHeight + 15;
  
  // Notas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(normalSize);
  doc.text("Notas:", marginLeft, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(`${formData.notas}`, marginLeft + 25, yPosition);
  
  return doc;
};

export const WorkSheetScreen: React.FC = () => {
  const { currentConsecutive, goBack, currentUser, currentMagnitude } = useNavigation();
  const [isSaving, setIsSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Estado de todos los campos
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
    notas: "",
    tempAmbiente: "",
    humedadRelativa: "",
  });

  // Efecto para actualizar el nombre cuando cambie el usuario
  useEffect(() => {
    const userToUse = currentUser || user;
    const userName = getUserName(userToUse);
    console.log("Usuario de useNavigation:", currentUser); // Debug
    console.log("Usuario de useAuth:", user); // Debug
    console.log("Usuario final utilizado:", userToUse); // Debug
    console.log("Nombre extraído:", userName); // Debug
    
    setFormData((prev) => ({
      ...prev,
      nombre: userName,
    }));
  }, [currentUser]);

  // Actualiza certificado si cambia el consecutivo
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      certificado: currentConsecutive || "",
    }));
  }, [currentConsecutive]);

  // Actualiza magnitud si cambia desde el flujo de generación de consecutivo
  useEffect(() => {
    if (currentMagnitude) {
      setFormData((prev) => ({
        ...prev,
        magnitud: currentMagnitude,
        unidad: "", // Limpia la unidad cuando cambie la magnitud
      }));
    }
  }, [currentMagnitude]);

  // Si cambia magnitud, limpia la unidad
 const handleMagnitudChange = (newMagnitud: string) => {
    setFormData((prev) => ({
      ...prev,
      magnitud: newMagnitud,
      unidad: "", // Limpia la unidad al cambiar magnitud
    }));
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Validación básica de campos obligatorios
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
  const magnitudReadOnly = !!currentMagnitude; // o cualquier condición deseada
   const unidadesDisponibles = formData.magnitud ? unidadesPorMagnitud[formData.magnitud] || [] : [];

  // Guardar PDF en Storage
  const handleSave = async () => {
    if (!valid) {
      alert("⚠️ Por favor, completa todos los campos obligatorios marcados con *");
      return;
    }

    setIsSaving(true);
    try {
      // Generar PDF usando la plantilla
      const pdf = generateTemplatePDF(formData);
      const pdfBlob = pdf.output("blob");

      const fecha = new Date().toISOString().split("T")[0];
      const consecutivo = formData.certificado || "sinConsecutivo";
      const userNameForFolder = getUserName(currentUser || user); 
      const fileName = `worksheets/${userNameForFolder}/${consecutivo}_${fecha}.pdf`;
      
      const pdfRef = ref(storage, fileName);
      await uploadBytes(pdfRef, pdfBlob);
      await getDownloadURL(pdfRef);

       // 🔽 Guardar metadatos en Firestore
      await addDoc(collection(db, "hojasDeTrabajo"), {
        id: formData.id,
        cliente: formData.cliente,
        fecha: formData.fecha,
        tecnico: formData.nombre,
        certificado: formData.certificado,
        magnitud: formData.magnitud,
      });

      alert("✅ Hoja de trabajo guardada en la nube correctamente.");
      goBack();

    } catch (error: any) {
      alert("❌ Error al guardar PDF: " + error.message);
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    goBack();
  };

  // Clientes de ejemplo (ajusta con tus datos)
  const listaClientes = [
    { id: "cliente1", nombre: "Celestica Standard" },
    { id: "cliente2", nombre: "Celestica Medico" },
    { id: "cliente3", nombre: "Celestica Edificio E" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-lg">
        <div className="px-6 py-4 flex items-center space-x-4">
          <button
            onClick={goBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Hoja de Trabajo</h1>
              <p className="text-blue-100 text-sm">
                Consecutivo: {currentConsecutive || "SIN CONSECUTIVO"}
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Preview de la plantilla */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          {/* Vista previa del PDF */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mb-6">
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
                    <span className="text-xs font-bold text-blue-600">LOGO</span>
                  </div>
                  <div>
                    <div className="font-bold text-blue-600">Equipos y Servicios</div>
                    <div className="text-sm text-blue-600">Especializados AG, S.A. de C.V.</div>
                  </div>
                </div>
                <div className="text-right">
                  <div><strong>Fecha:</strong> {formData.fecha}</div>
                  <div><strong>Nombre:</strong> {formData.nombre}</div>
                </div>
              </div>

              <div className="text-2xl font-bold text-blue-600 mb-4">Hoja de trabajo</div>
              
              <div className="text-center mb-4 text-gray-600">
                &lt;&lt;{formData.lugarCalibracion}&gt;&gt;
              </div>

              <div className="space-y-2 text-sm">
                <div><strong>N.Certificado:</strong> {formData.certificado}</div>
                <div><strong>Fecha de Recepción:</strong> {formData.fecha}</div>
                <div className="flex space-x-8">
                  <div><strong>Cliente:</strong> {formData.cliente}</div>
                  <div><strong>Equipo:</strong> {formData.equipo}</div>
                </div>
                <div className="flex space-x-8">
                  <div><strong>ID:</strong> {formData.id}</div>
                  <div><strong>Marca:</strong> {formData.marca}</div>
                </div>
                <div><strong>Modelo:</strong> {formData.modelo}</div>
                <div><strong>Numero de Serie:</strong> {formData.numeroSerie}</div>
                <div className="flex space-x-8">
                  <div><strong>Unidad:</strong> {formData.unidad}</div>
                  <div><strong>Alcance:</strong> {formData.alcance}</div>
                </div>
                <div><strong>Resolución:</strong> {formData.resolucion}</div>
                <div><strong>Frecuencia de Calibración:</strong> {formData.frecuenciaCalibracion}</div>
                <div className="flex space-x-8">
                  <div><strong>Temp:</strong> {formData.tempAmbiente}°C</div>
                  <div><strong>HR:</strong> {formData.humedadRelativa}%</div>
                </div>
              </div>

              {/* Tabla de mediciones */}
              <div className="mt-6 border border-gray-400">
                <div className="grid grid-cols-2 border-b border-gray-400">
                  <div className="p-2 border-r border-gray-400 bg-gray-50 font-bold">Medición Patrón:</div>
                  <div className="p-2 bg-gray-50 font-bold">Medición Instrumento:</div>
                </div>
                <div className="grid grid-cols-2 min-h-[100px]">
                  <div className="p-2 border-r border-gray-400 text-xs">
                    <div>&lt;&lt;IF: [Magnitud] &lt;&gt; "Masa"&gt;&gt; &lt;&lt;{formData.medicionPatron}&gt;&gt; &lt;&lt;ENDIF&gt;&gt;</div>
                    <div>&lt;&lt;IF: [Magnitud] = "Masa"&gt;&gt; Excentricidad: &lt;&lt;[Excentricidad]&gt;&gt;</div>
                    <div>Linealidad: &lt;&lt;[Linealidad]&gt;&gt; Repetibilidad: &lt;&lt;[Repetibilidad]&gt;&gt; &lt;&lt;ENDIF&gt;&gt;</div>
                  </div>
                  <div className="p-2">{formData.medicionInstrumento}</div>
                </div>
              </div>

              <div className="mt-4">
                <strong>Notas:</strong> {formData.notas}
              </div>
            </div>
          </div>

          {/* Formulario de entrada */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Información de Calibración</h2>
              <p className="text-gray-600 mt-1">
                Complete los datos para generar la hoja de trabajo
              </p>
            </div>
            <div className="p-8 space-y-8">
              {/* 1. Lugar de Calibración */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                  <MapPin className="w-4 h-4 text-orange-500" />
                  <span>Lugar de Calibración*</span>
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {["Sitio", "Laboratorio"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleInputChange("lugarCalibracion", option)}
                      className={`py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                        formData.lugarCalibracion === option
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              {/* 2. Frecuencia y Fecha */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Calendar className="w-4 h-4 text-green-500" />
                    <span>Frecuencia de Calibración</span>
                  </label>
                  <select
                    value={formData.frecuenciaCalibracion}
                    onChange={(e) =>
                      handleInputChange("frecuenciaCalibracion", e.target.value)
                    }
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="">Seleccionar frecuencia</option>
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
                    onChange={(e) =>
                      handleInputChange("fecha", e.target.value)
                    }
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50"
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
                    onChange={(e) => handleInputChange("nombre", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Nombre del técnico"
                  />
                </div>
              </div>
              {/* 4. Cliente e ID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span>Cliente*</span>
                  </label>
                  <select
                    value={formData.cliente}
                    onChange={(e) => handleInputChange("cliente", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="">Seleccionar cliente</option>
                    {listaClientes.map((cli) => (
                      <option key={cli.id} value={cli.nombre}>{cli.nombre}</option>
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
                    onChange={(e) => handleInputChange("id", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Ingrese ID"
                  />
                </div>
              </div>
              {/* 5. Equipo y Marca */}
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Nombre del equipo"
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Marca del equipo"
                  />
                </div>
              </div>
              {/* 6. Modelo y Número de Serie */}
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Modelo del equipo"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Hash className="w-4 h-4 text-cyan-500" />
                    <span>Número de Serie</span>
                  </label>
                  <input
                    type="text"
                    value={formData.numeroSerie}
                    onChange={(e) => handleInputChange("numeroSerie", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Número de serie"
                  />
                </div>
              </div>
              {/* 7. Magnitud, Unidad, Alcance, Resolución */}
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 text-gray-700 font-semibold"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                        Auto-detectada
                      </div>
                    </div>
                ) : (
                  <select
                    value={formData.magnitud}
                    onChange={(e) => handleMagnitudChange(e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="">Seleccionar magnitud</option>
                    {magnitudesDisponibles.map((mag) => (
                      <option key={mag} value={mag}>{mag}</option>
                    ))}
                  </select>
                )}
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <Tag className="w-4 h-4 text-violet-500" />
                    <span>Unidad*</span>
                  </label>
                  <select
                    value={formData.unidad}
                    onChange={(e) => handleInputChange("unidad", e.target.value)}
                    disabled={!formData.magnitud}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                  >
                    <option value="">
                    {!formData.magnitud ? "Seleccione magnitud primero" : "Seleccionar unidad"}
                     </option>
                      {unidadesDisponibles.map((unidad) => (
                        <option key={unidad} value={unidad}>{unidad}</option>
                      ))}
                  </select>
                  {formData.magnitud && unidadesDisponibles.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">
                      ⚠️ No hay unidades definidas para esta magnitud
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <NotebookPen className="w-4 h-4 text-orange-400" />
                    <span>Alcance</span>
                  </label>
                  <input
                    type="text"
                    value={formData.alcance}
                    onChange={(e) => handleInputChange("alcance", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Alcance"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <NotebookPen className="w-4 h-4 text-yellow-400" />
                    <span>Resolución</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.resolucion}
                    onChange={(e) => handleInputChange("resolucion", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Ej: 0.001"
                  />
                </div>
              </div>
              {/* 8. Medición Patrón/Instrumento */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <NotebookPen className="w-4 h-4 text-teal-400" />
                    <span>Medición Patrón</span>
                  </label>
                  <input
                    type="text"
                    value={formData.medicionPatron}
                    onChange={(e) => handleInputChange("medicionPatron", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                    <NotebookPen className="w-4 h-4 text-blue-400" />
                    <span>Medición Instrumento</span>
                  </label>
                  <input
                    type="text"
                    value={formData.medicionInstrumento}
                    onChange={(e) => handleInputChange("medicionInstrumento", e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
              {/* 9. Notas */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                  <NotebookPen className="w-4 h-4 text-gray-400" />
                  <span>Notas</span>
                </label>
                <textarea
                  value={formData.notas}
                  onChange={(e) => handleInputChange("notas", e.target.value)}
                  className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                  rows={2}
                  placeholder="Notas adicionales"
                />
              </div>
              {/* 10. Temp Ambiente y Humedad Relativa */}
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Ej: 22.5"
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
                    className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Ej: 45"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
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
      </div>
    </div>
  );
};