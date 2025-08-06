import React, { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { storage, db } from "../utils/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";
import masterCelestica from "../data/masterCelestica.json";

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
  const mapping: Record<string, string> = {
    AGAC: "Acustica",
    AGD: "Dimensional",
    AGF: "Fuerza",
    AGP: "Presión",
    AGEL: "Electrica",
    TE: "Temperatura",
    MA: "Masa",
    TI: "Tiempo",
    VE: "Velocidad",
    TO: "Torque",
  };
  const parts = consecutivo.split("-");
  if (parts.length >= 2) {
    const code = parts[1];
    return mapping[code] || "";
  }
  // fallback: buscar substring
  for (const [code, mag] of Object.entries(mapping)) {
    if (consecutivo.includes(code)) {
      return mag;
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
  "Torque",
];

const unidadesPorMagnitud: Record<string, string[]> = {
  Acustica: ["dB", "Hz", "Pa"],
  Dimensional: ["m", "cm", "mm", "in"],
  Fuerza: ["N", "kgf", "lbf"],
  Presión: ["kPa", "bar", "psi", "scfh"],
  Electrica: ["V", "mV", "kV", "A", "mA", "µA", "Ω"],
  Temperatura: ["°C", "°F", "K"],
  Masa: ["g", "kg", "lb"],
  Tiempo: ["s", "min", "h"],
  Velocidad: ["m/s", "km/h"],
  Torque: ["N·m", "lbf·ft"],
};

// Generación de PDF (sin cambios)
const generateTemplatePDF = (formData: any) => {
  const doc = new jsPDF();
  // ... implementación completa como antes ...
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
  const [listaClientes, setListaClientes] = useState<{ id: string; nombre: string }[]>([]);

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
    const records = (masterCelestica as CelesticaRecord[]).filter((r) => r.A !== "ID");
    const record = records.find((r) => r.A === value);

    if (record) {
      setFormData((prev) => ({
        ...prev,
        equipo: record.B,
        marca: record.C,
        modelo: record.D,
        numeroSerie: record.E,
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

  const handleInputChange = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

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
  const unidadesDisponibles = formData.magnitud ? unidadesPorMagnitud[formData.magnitud] || [] : [];

  const handleSave = async () => {
    if (!valid) {
      alert("⚠️ Completa todos los campos obligatorios");
      return;
    }
    setIsSaving(true);
    try {
      const pdf = generateTemplatePDF(formData);
      const blob = pdf.output("blob");
      const fecha = new Date().toISOString().split("T")[0];
      const carpeta = getUserName(currentUser || user);
      const nombreArchivo = `worksheets/${carpeta}/${formData.certificado}_${fecha}.pdf`;
      const pdfRef = ref(storage, nombreArchivo);
      await uploadBytes(pdfRef, blob);
      await getDownloadURL(pdfRef);
      await addDoc(collection(db, "hojasDeTrabajo"), {
        ...formData,
      });
      alert("✅ Guardado exitoso");
      goBack();
    } catch (e: any) {
      alert("❌ Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => goBack();

  const esMagnitudMasa = (m: string) => m === "Masa";

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
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 text-white hover:bg-white/10 rounded-lg flex items-center space-x-2"
          >
            <Edit3 className="w-4 h-4" />
            <span>{showPreview ? "Ocultar Vista" : "Mostrar Vista"}</span>
          </button>
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
            </div>
            <div className="p-8 space-y-8">
              {/* 1. Lugar de Calibración */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-3">
                  <MapPin className="w-4 h-4 text-orange-500" />
                  <span>Lugar de Calibración*</span>
                </label>
                <div className="grid grid-cols-3 gap-4">
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
                    className="w-full p-4 border rounded-lg bg-gray-50"
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
                    placeholder="Ej: EP-04654"
                  />
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
                    value={formData.equipo}
                    onChange={(e) => handleInputChange("equipo", e.target.value)}
                    readOnly={fieldsLocked}
                    className={`w-full p-4 border rounded-lg ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed" : ""
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
                    className={`w-full p-4 border rounded-lg ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed" : ""
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
                    className={`w-full p-4 border rounded-lg ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed" : ""
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
                    className={`w-full p-4 border rounded-lg ${
                      fieldsLocked ? "bg-gray-50 cursor-not-allowed" : ""
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
                  <select
                    value={formData.unidad}
                    onChange={(e) => handleInputChange("unidad", e.target.value)}
                    disabled={!formData.magnitud}
                    className="w-full p-4 border rounded-lg"
                  >
                    <option value="">{!formData.magnitud ? "Seleccionar magnitud primero" : "Seleccionar..."}</option>
                    {unidadesDisponibles.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  {formData.magnitud && unidadesDisponibles.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">⚠️ Sin unidades definidas</p>
                  )}
                </div>
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
                    <input
                      type="text"
                      value={formData.medicionPatron}
                      onChange={(e) => handleInputChange("medicionPatron", e.target.value)}
                      className="w-full p-4 border rounded-lg"
                      placeholder="Medición Patrón"
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
                      className="w-full p-4 border rounded-lg"
                      placeholder="Medición Instrumento"
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

          {/* Preview */}
          {showPreview && (
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-auto max-h-[80vh] p-6">
              <h2 className="text-xl font-semibold mb-4">Vista Previa</h2>
              <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto">
                {JSON.stringify(formData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Botones */}
      <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
        <div className="flex justify-end space-x-4">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center space-x-2"
          >
            <X className="w-4 h-4" />
            <span>Cancelar</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg hover:from-blue-700 hover:to-indigo-800 flex items-center space-x-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? "Guardando..." : "Guardar"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkSheetScreen;
