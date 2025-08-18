import React, { useEffect, useMemo, useRef, useState, Fragment, useCallback } from "react";
import {
  Upload, Download, Search, Calendar, User, Trash2, Eye, FolderOpen, Plus, X, Check, AlertCircle, Settings,
  Star, TrendingUp, Shield, Clock, Database, Activity, History, FileSpreadsheet, MessageSquareWarning,
  FileCheck2, FileX2, Send, Archive, Edit3, ArrowLeft, Home
} from "lucide-react";
import * as XLSX from "xlsx";
import { Dialog, Transition } from "@headlessui/react";
import { toast, Toaster } from "react-hot-toast";

/* ======= Firebase (usa tu helper) ======= */
import { auth, db, storage } from "../utils/firebase"; // <-- ajusta ruta si es necesario
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, onSnapshot, addDoc, doc, getDoc, updateDoc, serverTimestamp, query, orderBy, arrayUnion, deleteDoc
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getBytes, deleteObject } from "firebase/storage";

/* ======= Tipos ======= */
type WorkflowStatus = "uploaded" | "review" | "published" | "rejected" | "archived";

interface HistoryEvent {
  ts: string;               // ISO
  user: string;             // nombre visible
  action: "seed" | "upload" | "send_review" | "approve" | "publish" | "reject" | "edit_meta" | "archive";
  comment?: string;
}

interface CalibrationFile {
  id: string;               // Firestore doc id
  name: string;
  magnitude: string;
  uploadDate: string;       // ISO
  uploadedBy: string;
  uid: string;
  size: string;
  version: string;
  status: WorkflowStatus;
  storagePath: string;      // ruta en Storage
  downloadURL?: string;     // URL pública (si decides exponerla)
  lastModifiedDate: string; // ISO
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  certification: string;
  expiryDate?: string;
  downloads: number;
  rating: number;
  tags: string[];
  history: HistoryEvent[];
  reviewer?: string;
  rejectComment?: string;
}

type Role = "admin" | "supervisor" | "quality" | "technician";

interface UserSession {
  uid: string;
  name: string;
  role: Role;
  department: string;
  permissions: string[];
}

/* ======= Helpers ======= */
const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

const nowISO = () => new Date().toISOString();

const statusConfig: Record<WorkflowStatus, { label: string; dot: string; badge: string; step: number }> = {
  uploaded: { label: "Subido", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800", step: 1 },
  review: { label: "En revisión", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800", step: 2 },
  published: { label: "Publicado", dot: "bg-green-600", badge: "bg-green-100 text-green-800", step: 3 },
  rejected: { label: "Rechazado", dot: "bg-red-500", badge: "bg-red-100 text-red-800", step: 2 },
  archived: { label: "Archivado", dot: "bg-gray-400", badge: "bg-gray-100 text-gray-800", step: 3 },
};

const priorityConfig = {
  critical: { label: "Crítico", bar: "bg-red-500" },
  high: { label: "Alto", bar: "bg-orange-500" },
  medium: { label: "Medio", bar: "bg-yellow-500" },
  low: { label: "Bajo", bar: "bg-emerald-500" },
};

const magnitudes = [
  { value: "Todas", label: "Todas las Magnitudes" },
  { value: "Masa", label: "Masa y Densidad" },
  { value: "Dimensional", label: "Dimensional" },
  { value: "Eléctrica", label: "Eléctrica" },
  { value: "Temperatura", label: "Temperatura" },
  { value: "Presión", label: "Presión y Vacío" },
  { value: "Flujo", label: "Flujo y Volumen" },
  { value: "Óptica", label: "Óptica y Fotometría" },
  { value: "Química", label: "Química Analítica" },
];

/* Mapea Firestore usuarios/{uid}.puesto -> rol interno */
function normalizeRole(puesto: string | undefined | null): Role {
  const p = (puesto || "").toLowerCase();
  if (p.includes("admin")) return "admin";
  if (p.includes("supervisor") || p.includes("gerente")) return "supervisor";
  if (p.includes("calidad") || p.includes("quality")) return "quality";
  return "technician"; // default = Metrólogo
}
function permissionsFor(role: Role): string[] {
  switch (role) {
    case "admin":
    case "supervisor":
      return ["upload", "download", "edit", "delete", "approve", "publish", "reject", "archive"];
    case "quality":
      return ["download", "approve", "publish", "reject"];
    default:
      return ["upload", "download"];
  }
}

/* ======= Props de navegación ======= */
interface CalibrationManagerProps {
  onNavigateBack?: () => void;        // como en otros screens
  onNavigateToMenu?: () => void;      // como en otros screens
  menuRoute?: string;                  // ruta del menú (hash o pathname). Default '#/menu'
}

/* ======= Componente principal ======= */
const CalibrationManager: React.FC<CalibrationManagerProps> = ({
  onNavigateBack,
  onNavigateToMenu,
  menuRoute = "#/menu",
}) => {
  /* --- Sesión Firebase --- */
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setCurrentUser(null);
        setLoadingUser(false);
        toast.error("Inicia sesión para continuar.");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "usuarios", u.uid));
        let name = u.displayName || u.email || "Usuario";
        let dept = "—";
        let puesto = "Metrólogo";
        if (snap.exists()) {
          const data = snap.data() as any;
          name = data?.nombre || name;
          dept = data?.departamento || dept;
          puesto = data?.puesto || puesto;
        } else {
          toast("Perfil sin documento en 'usuarios'. Se asumirá Metrólogo.", { icon: "⚠️" });
        }
        const role = normalizeRole(puesto);
        setCurrentUser({
          uid: u.uid,
          name,
          role,
          department: dept,
          permissions: permissionsFor(role),
        });
      } catch (e) {
        console.error(e);
        toast.error("Error leyendo perfil de usuario");
      } finally {
        setLoadingUser(false);
      }
    });
    return () => unsub();
  }, []);

  /* --- Datos (Firestore tiempo real) --- */
  const [files, setFiles] = useState<CalibrationFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "formatos"), orderBy("lastModifiedDate", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CalibrationFile[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          list.push({
            id: d.id,
            name: data.name,
            magnitude: data.magnitude,
            uploadDate: data.uploadDate,
            uploadedBy: data.uploadedBy,
            uid: data.uid,
            size: data.size,
            version: data.version,
            status: data.status,
            storagePath: data.storagePath,
            downloadURL: data.downloadURL,
            lastModifiedDate: data.lastModifiedDate,
            description: data.description,
            priority: data.priority,
            certification: data.certification,
            expiryDate: data.expiryDate,
            downloads: data.downloads || 0,
            rating: data.rating || 5.0,
            tags: data.tags || [],
            history: data.history || [],
            reviewer: data.reviewer,
            rejectComment: data.rejectComment,
          });
        });
        setFiles(list);
        setLoadingFiles(false);
      },
      (err) => {
        console.error(err);
        toast.error("Error cargando formatos");
        setLoadingFiles(false);
      }
    );
    return () => unsub();
  }, []);

  /* --- Controles UI --- */
  const [selectedMagnitude, setSelectedMagnitude] = useState("Todas");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | WorkflowStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortBy, setSortBy] = useState<"priority" | "date" | "modified" | "downloads" | "rating" | "name">("priority");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Si entra un usuario de calidad, por UX filtra directo "En revisión"
  useEffect(() => {
    if (currentUser?.role === "quality") {
      setSelectedStatusFilter("review");
    }
  }, [currentUser?.role]);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const mag = selectedMagnitude === "Todas" || f.magnitude === selectedMagnitude;
      const st = selectedStatusFilter === "all" || f.status === selectedStatusFilter;
      const q = (f.name + " " + (f.description || "") + " " + f.uploadedBy + " " + (f.tags || []).join(" "))
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return mag && st && q;
    });
  }, [files, selectedMagnitude, selectedStatusFilter, searchTerm]);

  const sortedFiles = useMemo(() => {
    const arr = [...filteredFiles];
    const orderPriority = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "date": cmp = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime(); break;
        case "modified": cmp = new Date(a.lastModifiedDate).getTime() - new Date(b.lastModifiedDate).getTime(); break;
        case "downloads": cmp = a.downloads - b.downloads; break;
        case "rating": cmp = a.rating - b.rating; break;
        case "priority": cmp = orderPriority[a.priority] - orderPriority[b.priority]; break;
        default: cmp = 0;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredFiles, sortBy, sortOrder]);

  /* --- Subida & formularios --- */
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadForm, setUploadForm] = useState({
    fileName: "",
    magnitude: "Dimensional",
    version: "v1.0",
    description: "",
    priority: "medium" as CalibrationFile["priority"],
    certification: "ISO/IEC 17025:2017",
    expiryDate: "",
    tags: [] as string[],
  });

  // Preview
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFileData, setPreviewFileData] = useState<string[][] | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");

  // Historial, Rechazo, Edición
  const [historyFor, setHistoryFor] = useState<CalibrationFile | null>(null);
  const [rejectFor, setRejectFor] = useState<CalibrationFile | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [editFor, setEditFor] = useState<CalibrationFile | null>(null);
  const [editData, setEditData] = useState({ version: "", description: "", certification: "", tags: "" });

  // Eliminar definitivamente (modal)
  const [deleteFor, setDeleteFor] = useState<CalibrationFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* --- Acciones: seleccionar archivo --- */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type.includes("spreadsheet") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) {
      setSelectedFile(f);
      setUploadForm((p) => ({ ...p, fileName: f.name.replace(/\.[^/.]+$/, "") }));
      toast.success(`Archivo "${f.name}" seleccionado`);
    } else {
      toast.error("Formato no compatible (usa .xlsx o .xls)");
      setSelectedFile(null);
    }
  };

  /* --- Subir a Storage + doc en Firestore --- */
  const handleUploadSubmit = useCallback(async () => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!currentUser.permissions.includes("upload")) return toast.error("No tienes permiso para subir");
    if (!selectedFile) return toast.error("Selecciona un archivo");
    if (!uploadForm.fileName.trim()) return toast.error("El nombre del formato es obligatorio");

    try {
      setIsUploading(true);
      setUploadProgress(10);

      const ext = selectedFile.name.split(".").pop() || "xlsx";
      const safeName = uploadForm.fileName + (/\.(xlsx|xls)$/i.test(uploadForm.fileName) ? "" : `.${ext}`);
      const storagePath = `formatos/${currentUser.uid}_${Date.now()}_${safeName}`;
      const storageRef = ref(storage, storagePath);

      // Subir binario
      await uploadBytes(storageRef, selectedFile);
      setUploadProgress(70);

      const downloadURL = await getDownloadURL(storageRef);

      // Crear doc (history como arreglo normal)
      await addDoc(collection(db, "formatos"), {
        name: safeName,
        magnitude: uploadForm.magnitude,
        uploadDate: nowISO(),
        uploadedBy: currentUser.name,
        uid: currentUser.uid,
        size: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
        version: uploadForm.version,
        status: "uploaded",
        storagePath,
        downloadURL,
        lastModifiedDate: nowISO(),
        description: uploadForm.description,
        priority: uploadForm.priority,
        certification: uploadForm.certification,
        expiryDate: uploadForm.expiryDate || null,
        downloads: 0,
        rating: 5.0,
        tags: uploadForm.tags,
        history: [{ ts: nowISO(), user: currentUser.name, action: "upload" } as HistoryEvent],
        createdAt: serverTimestamp(),
      });

      setUploadProgress(100);
      toast.success("Formato subido");
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadForm({
        fileName: "",
        magnitude: "Dimensional",
        version: "v1.0",
        description: "",
        priority: "medium",
        certification: "ISO/IEC 17025:2017",
        expiryDate: "",
        tags: [],
      });
    } catch (e) {
      console.error(e);
      toast.error("Error subiendo el formato");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [currentUser, selectedFile, uploadForm]);

  /* --- Descarga --- */
  const handleDownload = async (file: CalibrationFile) => {
    if (!file.downloadURL) {
      toast.error("No hay URL de descarga");
      return;
    }
    try {
      const a = document.createElement("a");
      a.href = file.downloadURL;
      a.download = file.name;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      await updateDoc(doc(db, "formatos", file.id), {
        downloads: (file.downloads || 0) + 1,
        lastModifiedDate: nowISO(),
      });
      toast.success(`Descargando "${file.name}"`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo descargar");
    }
  };

  /* --- Vista previa (lee de Storage) --- */
  const handlePreview = async (file: CalibrationFile) => {
    try {
      const storageRef = ref(storage, file.storagePath);
      const arrayBuffer = await getBytes(storageRef);
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const first = wb.SheetNames[0];
      const ws = wb.Sheets[first];
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      setPreviewFileData(data);
      setPreviewFileName(file.name);
      setShowPreviewModal(true);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar la vista previa");
    }
  };

  /* --- Workflow y metadatos (actualiza Firestore) --- */
  const pushHistory = (file: CalibrationFile, action: HistoryEvent["action"], comment?: string) =>
    updateDoc(doc(db, "formatos", file.id), {
      history: arrayUnion({ ts: nowISO(), user: currentUser?.name || "—", action, comment } as HistoryEvent),
      lastModifiedDate: nowISO(),
    });

  const setStatus = async (file: CalibrationFile, status: WorkflowStatus, extra?: any) => {
    await updateDoc(doc(db, "formatos", file.id), {
      status,
      reviewer: ["quality", "admin", "supervisor"].includes(currentUser?.role || "technician")
        ? currentUser?.name
        : file.reviewer || null,
      rejectComment: status === "rejected" ? (extra?.rejectComment || "") : null,
      ...extra,
      lastModifiedDate: nowISO(),
    });
  };

  const sendToReview = async (file: CalibrationFile) => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!["technician", "admin", "supervisor"].includes(currentUser.role)) return toast.error("Sin permiso");
    try {
      await updateDoc(doc(db, "formatos", file.id), {
        history: arrayUnion({ ts: nowISO(), user: currentUser.name, action: "send_review" } as HistoryEvent),
        status: "review",
        lastModifiedDate: nowISO(),
      });
      toast.success("Enviado a revisión");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo enviar a revisión (revisa reglas de Firestore/permiso).");
    }
  };

  const approve = async (file: CalibrationFile) => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!["quality", "admin", "supervisor"].includes(currentUser.role)) return toast.error("Sin permiso");
    await pushHistory(file, "approve");
    await setStatus(file, "review");
    toast.success("Aprobado (pendiente publicar)");
  };

  const publish = async (file: CalibrationFile) => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!["quality", "admin", "supervisor"].includes(currentUser.role)) return toast.error("Sin permiso");
    await pushHistory(file, "publish");
    await setStatus(file, "published");
    toast.success("Publicado");
  };

  const reject = async (file: CalibrationFile, comment: string) => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!["quality", "admin", "supervisor"].includes(currentUser.role)) return toast.error("Sin permiso");
    await pushHistory(file, "reject", comment);
    await setStatus(file, "rejected", { rejectComment: comment });
    toast.success("Rechazado");
  };

  const archiveFile = async (file: CalibrationFile) => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!["admin", "supervisor"].includes(currentUser.role)) return toast.error("Sin permiso");
    await pushHistory(file, "archive");
    await setStatus(file, "archived");
    toast.success("Archivado");
  };

  const deleteForever = async (file: CalibrationFile) => {
    if (!currentUser) return toast.error("Inicia sesión");
    if (!["admin", "supervisor"].includes(currentUser.role)) return toast.error("Sin permiso");
    setDeleting(true);
    try {
      await deleteObject(ref(storage, file.storagePath)).catch(() => { /* si no existe, continuamos */ });
      await deleteDoc(doc(db, "formatos", file.id));
      toast.success(`"${file.name}" eliminado definitivamente`);
      setDeleteFor(null);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo eliminar el archivo");
    } finally {
      setDeleting(false);
    }
  };

  /* --- Stats --- */
  const stats = {
    total: files.length,
    published: files.filter((f) => f.status === "published").length,
    review: files.filter((f) => f.status === "review").length,
    uploaded: files.filter((f) => f.status === "uploaded").length,
    rejected: files.filter((f) => f.status === "rejected").length,
    totalDownloads: files.reduce((s, f) => s + (f.downloads || 0), 0),
    avgRating: files.length ? (files.reduce((s, f) => s + (f.rating || 0), 0) / files.length).toFixed(1) : "0",
  };

  /* --- Navegación segura (no recarga) --- */
  const goToMenu = () => {
    if (onNavigateToMenu) return onNavigateToMenu();

    const stored = localStorage.getItem("app_menu_route");
    const target = stored || menuRoute || "#/menu";

    if (target.startsWith("#")) {
      if (window.location.hash !== target) window.location.hash = target;
      else window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    window.history.replaceState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleBack = () => {
    if (onNavigateBack) return onNavigateBack();

    const sameOrigin = !!document.referrer && document.referrer.startsWith(window.location.origin);
    const cameFromAuth = sameOrigin && /(login|signin|register|auth)/i.test(document.referrer);

    if (sameOrigin && !cameFromAuth && window.history.length > 1) {
      window.history.back();
      return;
    }
    goToMenu();
  };

  /* --- Stepper --- */
  const Stepper: React.FC<{ status: WorkflowStatus }> = ({ status }) => {
    const step = statusConfig[status].step;
    const pct = step === 1 ? 20 : step === 2 ? 60 : 100;
    return (
      <div>
        <div className="flex justify-between text-[11px] sm:text-xs text-gray-500 mb-2">
          <span>Subido</span>
          <span>Revisión</span>
          <span>{status === "archived" ? "Archivado" : "Publicado"}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-amber-400 to-green-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  /* --- Loading states --- */
  if (loadingUser || loadingFiles) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-gray-600">Cargando…</div>
      </div>
    );
  }
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <div className="text-gray-700 font-semibold">Inicia sesión para gestionar formatos</div>
        </div>
      </div>
    );
  }

  /* --- Render --- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster position="top-right" toastOptions={{ duration: 3000, style: { borderRadius: 12 } }} />

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <header className="relative mb-6 sm:mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 rounded-2xl sm:rounded-3xl opacity-90" />
          <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 border border-white/20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Regresar */}
                <button
                  onClick={handleBack}
                  className="hidden sm:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl border border-white/20"
                  title="Regresar"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="text-sm font-semibold">Regresar</span>
                </button>
                {/* Menú directo */}
                <button
                  onClick={goToMenu}
                  className="hidden sm:inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl border border-white/20"
                  title="Ir al menú"
                >
                  <Home className="w-5 h-5" />
                  <span className="text-sm font-semibold">Menú</span>
                </button>

                <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Activity className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white">Gestor de Formatos Oficiales</h1>
                  <p className="text-blue-100 text-sm sm:text-base">Flujo: Metrólogo → Calidad → Publicado</p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {/* Botones en móvil */}
                <button
                  onClick={handleBack}
                  className="sm:hidden bg-white/15 hover:bg-white/25 text-white p-2.5 rounded-xl border border-white/20"
                  title="Regresar"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={goToMenu}
                  className="sm:hidden bg-white/15 hover:bg-white/25 text-white p-2.5 rounded-xl border border-white/20"
                  title="Menú"
                >
                  <Home className="w-5 h-5" />
                </button>

                <div className="text-white/80 text-xs sm:text-sm text-right hidden xs:flex flex-col">
                  <span className="font-semibold">{currentUser.name}</span>
                  <span className="opacity-80 capitalize">{currentUser.role} • {currentUser.department}</span>
                </div>
                {currentUser.permissions.includes("upload") && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg"
                  >
                    <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Subir formato</span><span className="sm:hidden">Subir</span>
                  </button>
                )}
                <button className="bg-white/15 hover:bg-white/25 text-white p-2.5 sm:p-3 rounded-xl border border-white/20">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Stats (responsive) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
          <StatCard icon={<Database className="w-6 h-6 text-white" />} label="Total" value={stats.total} className="from-blue-500 to-indigo-600" />
          <StatCard icon={<Clock className="w-6 h-6 text-white" />} label="Subidos" value={stats.uploaded} className="from-sky-500 to-blue-600" />
          <StatCard icon={<Eye className="w-6 h-6 text-white" />} label="En revisión" value={stats.review} className="from-amber-500 to-orange-600" />
          <StatCard icon={<Check className="w-6 h-6 text-white" />} label="Publicado" value={stats.published} className="from-green-500 to-emerald-600" />
          <StatCard icon={<MessageSquareWarning className="w-6 h-6 text-white" />} label="Rechazados" value={stats.rejected} className="from-rose-500 to-red-600" />
          <StatCard icon={<TrendingUp className="w-6 h-6 text-white" />} label="Descargas" value={stats.totalDownloads} className="from-purple-500 to-indigo-600" />
        </section>

        {/* Filtros */}
        <section className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-gray-100 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Búsqueda */}
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Búsqueda</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nombre, descripción, tags, usuario…"
                  className="w-full pl-12 pr-10 py-3.5 sm:py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Magnitud & Estado */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Magnitud</label>
                <select
                  value={selectedMagnitude}
                  onChange={(e) => setSelectedMagnitude(e.target.value)}
                  className="w-full px-4 py-3.5 sm:py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                >
                  {magnitudes.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                  className="w-full px-4 py-3.5 sm:py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                >
                  <option value="all">Todos</option>
                  <option value="uploaded">Subido</option>
                  <option value="review">En revisión</option>
                  <option value="published">Publicado</option>
                  <option value="rejected">Rechazado</option>
                  <option value="archived">Archivado</option>
                </select>
              </div>
            </div>

            {/* Orden & Vista */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ordenar</label>
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [f, o] = e.target.value.split("-") as any;
                    setSortBy(f);
                    setSortOrder(o);
                  }}
                  className="w-full px-4 py-3.5 sm:py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                >
                  <option value="priority-desc">Prioridad ↓</option>
                  <option value="date-desc">Fecha subida ↓</option>
                  <option value="modified-desc">Última modificación ↓</option>
                  <option value="downloads-desc">Más descargados</option>
                  <option value="rating-desc">Mejor valorados</option>
                  <option value="name-asc">Nombre A-Z</option>
                  <option value="name-desc">Nombre Z-A</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Vista</label>
                <div className="flex bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode("cards")}
                    className={`flex-1 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg font-medium transition-all ${viewMode === "cards" ? "bg-blue-600 text-white shadow-lg" : "text-gray-600 hover:bg-gray-200"}`}
                  >
                    Tarjetas
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`flex-1 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg font-medium transition-all ${viewMode === "table" ? "bg-blue-600 text-white shadow-lg" : "text-gray-600 hover:bg-gray-200"}`}
                  >
                    Tabla
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contenido */}
        <section className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          {sortedFiles.length === 0 ? (
            <EmptyState
              onUpload={() => setShowUploadModal(true)}
              canUpload={currentUser.permissions.includes("upload")}
            />
          ) : viewMode === "cards" ? (
            <div className="p-4 sm:p-6 md:p-8">
              {/* Grid responsive */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                {sortedFiles.map((file) => {
                  const priority = priorityConfig[file.priority];
                  const status = statusConfig[file.status];
                  return (
                    <div key={file.id} className="group bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-xl transition-all">
                      <div className="flex items-start justify-between mb-3 sm:mb-4">
                        <div className="min-w-0">
                          <h3 className="font-bold text-base sm:text-lg text-gray-900 truncate pr-2" title={file.name}>{file.name}</h3>
                          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-gray-500 mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100">{file.magnitude}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-green-50 text-green-700">v{file.version.replace(/^v/i,"")}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-50">{file.size || "—"}</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold ${status.badge}`}>
                          <span className={`w-2 h-2 rounded-full mr-1.5 ${status.dot}`} />
                          {status.label}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 mb-3 sm:mb-4 line-clamp-3" title={file.description}>{file.description || "Sin descripción."}</p>

                      <div className="mb-3 sm:mb-4">
                        <Stepper status={file.status} />
                      </div>

                      {file.tags?.length ? (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                          {file.tags.slice(0, 3).map((t, i) => (
                            <span key={i} className="text-[11px] sm:text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700">#{t}</span>
                          ))}
                          {file.tags.length > 3 && <span className="text-[11px] sm:text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">+{file.tags.length - 3}</span>}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                        <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-gray-400" /> {fmtDate(file.uploadDate)}</div>
                        <div className="flex items-center gap-1.5"><User className="w-4 h-4 text-gray-400" /> {file.uploadedBy || "—"}</div>
                        <div className="flex items-center gap-1.5"><Star className="w-4 h-4 text-yellow-400" /> {file.rating.toFixed(1)}</div>
                        <div className="flex items-center gap-1.5"><Download className="w-4 h-4 text-blue-400" /> {file.downloads}</div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-gray-100 mb-3 sm:mb-4">
                        <div className={`h-1.5 rounded-full ${priority.bar}`} style={{ width: "100%" }} />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1.5 sm:gap-2">
                          <ActionIcon title="Vista previa" onClick={() => handlePreview(file)}><Eye className="w-5 h-5" /></ActionIcon>
                          <ActionIcon title="Descargar" onClick={() => handleDownload(file)}><Download className="w-5 h-5" /></ActionIcon>
                          {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                            <ActionIcon title="Editar metadatos" onClick={() => { setEditFor(file); setEditData({
                              version: file.version, description: file.description || "", certification: file.certification, tags: (file.tags || []).join(", ")
                            }); }}>
                              <Edit3 className="w-5 h-5" />
                            </ActionIcon>
                          )}
                          {["admin","supervisor"].includes(currentUser.role) && (
                            <ActionIcon title="Eliminar definitivamente" onClick={() => setDeleteFor(file)}>
                              <Trash2 className="w-5 h-5 text-red-600" />
                            </ActionIcon>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-end">
                          {file.status === "uploaded" && ["technician", "admin", "supervisor"].includes(currentUser.role) && (
                            <PrimaryBtn onClick={() => sendToReview(file)} icon={<Send className="w-4 h-4" />}>Enviar</PrimaryBtn>
                          )}
                          {file.status === "review" && ["quality", "admin", "supervisor"].includes(currentUser.role) && (
                            <>
                              <GhostBtn onClick={() => approve(file)} icon={<FileCheck2 className="w-4 h-4" />}>Aprobar</GhostBtn>
                              <GhostBtn onClick={() => { setRejectFor(file); setRejectComment(""); }} icon={<FileX2 className="w-4 h-4" />}>Rechazar</GhostBtn>
                              <PrimaryBtn onClick={() => publish(file)} icon={<Check className="w-4 h-4" />}>Publicar</PrimaryBtn>
                            </>
                          )}
                          {file.status === "published" && ["admin", "supervisor"].includes(currentUser.role) && (
                            <GhostBtn onClick={() => archiveFile(file)} icon={<Archive className="w-4 h-4" />}>Archivar</GhostBtn>
                          )}
                          <GhostBtn onClick={() => setHistoryFor(file)} icon={<History className="w-4 h-4" />}>Historial</GhostBtn>
                        </div>
                      </div>

                      {file.status === "rejected" && file.rejectComment && (
                        <div className="mt-3 sm:mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700">
                          <div className="font-semibold mb-1">Motivo de rechazo</div>
                          <div>{file.rejectComment}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Tabla
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Archivo</Th><Th>Magnitud</Th><Th>Estado</Th><Th>Subido por</Th><Th>Fecha</Th><Th>Rating</Th><Th>Descargas</Th><Th className="text-center">Acciones</Th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sortedFiles.map((file, idx) => (
                    <tr key={file.id} className={idx % 2 ? "bg-gray-50/50" : ""}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                            <FileSpreadsheet className="text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate" title={file.name}>{file.name}</div>
                            <div className="text-xs text-gray-500 truncate">{file.description || "—"}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-md text-xs">v{file.version.replace(/^v/i, "")}</span>
                              <span className="text-xs text-gray-500">{file.size || "—"}</span>
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td><span className="inline-flex items-center px-3 py-1 rounded-lg text-sm bg-blue-50 text-blue-700">{file.magnitude}</span></Td>
                      <Td>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusConfig[file.status].badge}`}>
                          <span className={`w-2 h-2 rounded-full mr-1.5 ${statusConfig[file.status].dot}`} />
                          {statusConfig[file.status].label}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-sm text-gray-900">{file.uploadedBy || "—"}</div>
                        <div className="text-xs text-gray-500">{file.reviewer ? `Rev: ${file.reviewer}` : ""}</div>
                      </Td>
                      <Td>
                        <div className="text-sm text-gray-900">{fmtDate(file.uploadDate)}</div>
                        <div className="text-xs text-gray-500">Mod: {new Date(file.lastModifiedDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</div>
                      </Td>
                      <Td><div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400" /><span className="text-sm font-semibold">{file.rating.toFixed(1)}</span></div></Td>
                      <Td><div className="flex items-center gap-1"><TrendingUp className="w-4 h-4 text-blue-500" /><span className="text-sm font-semibold">{file.downloads}</span></div></Td>
                      <Td>
                        <div className="flex justify-center flex-wrap gap-2">
                          <ActionIcon title="Vista previa" onClick={() => handlePreview(file)}><Eye className="w-4 h-4" /></ActionIcon>
                          <ActionIcon title="Descargar" onClick={() => handleDownload(file)}><Download className="w-4 h-4" /></ActionIcon>

                          {file.status === "uploaded" && ["technician", "admin", "supervisor"].includes(currentUser.role) && (
                            <GhostBtn onClick={() => sendToReview(file)} icon={<Send className="w-4 h-4" />}>Enviar</GhostBtn>
                          )}
                          {file.status === "review" && ["quality", "admin", "supervisor"].includes(currentUser.role) && (
                            <>
                              <GhostBtn onClick={() => approve(file)} icon={<FileCheck2 className="w-4 h-4" />}>Aprobar</GhostBtn>
                              <GhostBtn onClick={() => { setRejectFor(file); setRejectComment(""); }} icon={<FileX2 className="w-4 h-4" />}>Rechazar</GhostBtn>
                              <PrimaryBtn onClick={() => publish(file)} icon={<Check className="w-4 h-4" />}>Publicar</PrimaryBtn>
                            </>
                          )}
                          {file.status === "published" && ["admin", "supervisor"].includes(currentUser.role) && (
                            <GhostBtn onClick={() => archiveFile(file)} icon={<Archive className="w-4 h-4" />}>Archivar</GhostBtn>
                          )}
                          {(currentUser.role === "admin" || currentUser.role === "supervisor") && (
                            <ActionIcon title="Editar metadatos" onClick={() => { setEditFor(file); setEditData({
                              version: file.version, description: file.description || "", certification: file.certification, tags: (file.tags || []).join(", ")
                            }); }}>
                              <Edit3 className="w-4 h-4" />
                            </ActionIcon>
                          )}
                          {["admin","supervisor"].includes(currentUser.role) && (
                            <ActionIcon title="Eliminar definitivamente" onClick={() => setDeleteFor(file)}>
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </ActionIcon>
                          )}
                          <GhostBtn onClick={() => setHistoryFor(file)} icon={<History className="w-4 h-4" />}>Historial</GhostBtn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Modal Subida */}
        <Transition appear show={showUploadModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowUploadModal(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 md:p-8 text-left shadow-2xl">
                    {isUploading ? (
                      <div className="text-center py-10">
                        <div className="relative w-24 h-24 mx-auto mb-6">
                          <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
                            <Upload className="w-12 h-12 text-white" />
                          </div>
                          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                        </div>
                        <h3 className="text-xl font-bold mb-3">Procesando archivo…</h3>
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-gray-600">{uploadProgress.toFixed(0)}% completado</p>
                        <p className="text-sm text-gray-500 mt-1">Usuario: {currentUser.name}</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <Dialog.Title className="text-2xl font-bold">Subir nuevo formato</Dialog.Title>
                            <p className="text-gray-600">Añade el archivo oficial para la magnitud correspondiente.</p>
                          </div>
                          <button onClick={() => setShowUploadModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl">
                            <X className="w-6 h-6" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Dropzone */}
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Archivo <span className="text-red-500">*</span></label>
                            <div
                              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition cursor-pointer bg-gray-50"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                              {selectedFile ? (
                                <div className="space-y-2">
                                  <div className="w-14 h-14 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto"><Check className="w-8 h-8 text-white" /></div>
                                  <div className="font-semibold text-emerald-700">{selectedFile.name}</div>
                                  <div className="text-xs text-gray-500">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</div>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setUploadForm(prev => ({ ...prev, fileName: "" })); }} className="text-red-500 hover:text-red-700 text-sm font-medium mt-1">
                                    Cambiar archivo
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto">
                                    <Upload className="w-8 h-8 text-white" />
                                  </div>
                                  <div className="font-semibold">Arrastra o selecciona tu archivo</div>
                                  <div className="text-xs text-gray-500">.xlsx, .xls • Máx. 10 MB</div>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
                              <div className="font-semibold text-blue-800">{currentUser.name}</div>
                              <div className="text-blue-700/80 text-xs capitalize">{currentUser.role} • {currentUser.department}</div>
                            </div>
                          </div>

                          {/* Metadatos */}
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del formato <span className="text-red-500">*</span></label>
                              <input
                                value={uploadForm.fileName}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, fileName: e.target.value }))}
                                placeholder="Ej: Formato_Calibracion_Vernier_2025"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Magnitud</label>
                                <select
                                  value={uploadForm.magnitude}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, magnitude: e.target.value }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                                >
                                  {magnitudes.slice(1).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Prioridad</label>
                                <select
                                  value={uploadForm.priority}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                                >
                                  <option value="low">Baja</option>
                                  <option value="medium">Media</option>
                                  <option value="high">Alta</option>
                                  <option value="critical">Crítica</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Versión</label>
                                <input
                                  value={uploadForm.version}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, version: e.target.value }))}
                                  placeholder="v1.0"
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Certificación</label>
                                <select
                                  value={uploadForm.certification}
                                  onChange={(e) => setUploadForm(prev => ({ ...prev, certification: e.target.value }))}
                                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium"
                                >
                                  <option value="ISO/IEC 17025:2017">ISO/IEC 17025:2017</option>
                                  <option value="ISO 9001:2015">ISO 9001:2015</option>
                                  <option value="NIST Traceable">NIST Traceable</option>
                                  <option value="CENAM">CENAM</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                              <textarea
                                value={uploadForm.description}
                                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                                rows={4}
                                placeholder="Describe el objetivo, contenido y uso del formato…"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium resize-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                          <button onClick={() => setShowUploadModal(false)} className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">
                            Cancelar
                          </button>
                          <button
                            onClick={handleUploadSubmit}
                            disabled={!selectedFile || !uploadForm.fileName.trim() || !currentUser.permissions.includes("upload")}
                            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <Upload className="w-5 h-5" /> Subir
                          </button>
                        </div>
                      </>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Vista previa */}
        <Transition appear show={showPreviewModal} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setShowPreviewModal(false)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 sm:p-5 text-white flex items-center justify-between">
                      <div>
                        <Dialog.Title className="text-lg sm:text-xl font-bold">Vista previa</Dialog.Title>
                        <p className="text-blue-100 text-xs sm:text-sm">{previewFileName}</p>
                      </div>
                      <button onClick={() => setShowPreviewModal(false)} className="p-2 text-blue-100 hover:text-white hover:bg-white/20 rounded-xl">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="p-4 sm:p-5 max-h-[70vh] overflow-auto">
                      {previewFileData && previewFileData.length ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                {previewFileData[0].map((h, i) => (
                                  <th key={i} className="px-3 sm:px-4 py-2 sm:py-3 text-left text-[11px] sm:text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                              {previewFileData.slice(1, 101).map((row, ri) => (
                                <tr key={ri} className={ri % 2 ? "bg-gray-50/50" : ""}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 sm:px-4 py-2 whitespace-nowrap text-xs sm:text-sm text-gray-900 border-r border-gray-100 last:border-r-0">{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {previewFileData.length > 101 && (
                            <div className="bg-yellow-50 border-t border-yellow-200 p-3 text-center text-yellow-800 text-xs sm:text-sm">
                              Mostrando primeras 100 filas de {previewFileData.length - 1}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-10 sm:py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8 text-gray-400" />
                          </div>
                          <p className="text-gray-600">No hay datos disponibles</p>
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-50 px-4 sm:px-5 py-3 sm:py-4 flex justify-end">
                      <button onClick={() => setShowPreviewModal(false)} className="px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg">
                        Cerrar
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Historial */}
        <Transition appear show={!!historyFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setHistoryFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <Dialog.Title className="text-xl font-bold">Historial</Dialog.Title>
                      <button onClick={() => setHistoryFor(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl">
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      {historyFor?.history?.length ? historyFor.history.map((h, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                          <div>
                            <div className="text-sm"><span className="font-semibold">{h.user}</span> — <span className="capitalize">{h.action.replace("_", " ")}</span></div>
                            <div className="text-xs text-gray-500">{fmtDate(h.ts)} {new Date(h.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>
                            {h.comment && <div className="mt-1 text-sm text-gray-700">Comentario: {h.comment}</div>}
                          </div>
                        </div>
                      )) : <div className="text-gray-600">Sin eventos registrados.</div>}
                    </div>
                    <div className="mt-6 flex justify-end">
                      <button onClick={() => setHistoryFor(null)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">Cerrar</button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Rechazo */}
        <Transition appear show={!!rejectFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setRejectFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <Dialog.Title className="text-xl font-bold">Rechazar formato</Dialog.Title>
                      <button onClick={() => setRejectFor(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X className="w-6 h-6" /></button>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">Agrega un comentario para el metrólogo (motivo y correcciones).</p>
                    <textarea
                      value={rejectComment}
                      onChange={(e) => setRejectComment(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500"
                      placeholder="Ej: Falta anexar evidencia fotográfica y traza de patrón…"
                    />
                    <div className="mt-5 flex justify-end gap-3">
                      <button onClick={() => setRejectFor(null)} className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">Cancelar</button>
                      <button
                        onClick={() => { if (rejectFor) { reject(rejectFor, rejectComment || ""); setRejectFor(null); } }}
                        className="px-8 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl font-semibold shadow-lg disabled:opacity-60"
                        disabled={!rejectFor}
                      >
                        Rechazar
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Edición metadatos */}
        <Transition appear show={!!editFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setEditFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <Dialog.Title className="text-xl font-bold">Editar metadatos</Dialog.Title>
                      <button onClick={() => setEditFor(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Versión</label>
                        <input
                          value={editData.version}
                          onChange={(e) => setEditData(prev => ({ ...prev, version: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Certificación</label>
                        <input
                          value={editData.certification}
                          onChange={(e) => setEditData(prev => ({ ...prev, certification: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                        <textarea
                          value={editData.description}
                          onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                          rows={4}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tags (separados por coma)</label>
                        <input
                          value={editData.tags}
                          onChange={(e) => setEditData(prev => ({ ...prev, tags: e.target.value }))}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end gap-3">
                      <button onClick={() => setEditFor(null)} className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50">Cancelar</button>
                      <button
                        onClick={async () => {
                          if (!editFor) return;
                          await updateDoc(doc(db, "formatos", editFor.id), {
                            version: editData.version || editFor.version,
                            certification: editData.certification || editFor.certification,
                            description: editData.description ?? editFor.description,
                            tags: editData.tags ? editData.tags.split(",").map(s => s.trim()).filter(Boolean) : editFor.tags,
                            lastModifiedDate: nowISO(),
                            history: arrayUnion({ ts: nowISO(), user: currentUser.name, action: "edit_meta" } as HistoryEvent),
                          });
                          setEditFor(null);
                          toast.success("Metadatos actualizados");
                        }}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg"
                      >
                        Guardar cambios
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Modal Eliminar definitivamente */}
        <Transition appear show={!!deleteFor} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setDeleteFor(null)}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </div>
                      <Dialog.Title className="text-lg font-bold">Eliminar definitivamente</Dialog.Title>
                    </div>
                    <p className="text-sm text-gray-600">
                      Vas a eliminar <span className="font-semibold">{deleteFor?.name}</span>. Esta acción no se puede deshacer.
                    </p>
                    <div className="mt-6 flex justify-end gap-3">
                      <button onClick={() => setDeleteFor(null)} className="px-5 py-2.5 border-2 border-gray-200 rounded-xl font-semibold">Cancelar</button>
                      <button
                        onClick={() => deleteFor && deleteForever(deleteFor)}
                        disabled={deleting}
                        className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl font-semibold disabled:opacity-60"
                      >
                        {deleting ? "Eliminando…" : "Eliminar"}
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

      </div>
    </div>
  );
};

/* ======= Subcomponentes ======= */
const StatCard: React.FC<{ icon: React.ReactNode; label: string | React.ReactNode; value: string | number; className?: string; }> = ({ icon, label, value, className }) => (
  <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-lg border border-gray-100 hover:shadow-xl transition">
    <div className="flex items-center justify-between mb-2 sm:mb-3">
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-r ${className || "from-blue-500 to-indigo-600"} flex items-center justify-center`}>
        {icon}
      </div>
      <span className="text-xl sm:text-2xl font-black text-gray-800">{value}</span>
    </div>
    <p className="text-gray-600 font-medium text-sm sm:text-base">{label}</p>
  </div>
);

const EmptyState: React.FC<{ onUpload: () => void; canUpload: boolean }> = ({ onUpload, canUpload }) => (
  <div className="text-center py-16 sm:py-20">
    <div className="w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-5 sm:mb-6">
      <FolderOpen className="w-12 h-12 sm:w-14 sm:h-14 text-gray-400" />
    </div>
    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">No hay formatos</h3>
    <p className="text-gray-500 mb-5 sm:mb-6">Comienza subiendo tu primer formato oficial.</p>
    {canUpload && (
      <button onClick={onUpload} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold shadow-lg">
        <Plus className="w-5 h-5 inline mr-2" />
        Subir formato
      </button>
    )}
  </div>
);

const Th: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <th className={`text-left py-3 sm:py-4 px-4 sm:px-5 font-bold text-gray-800 text-xs sm:text-sm uppercase tracking-wide ${className || ""}`}>{children}</th>
);
const Td: React.FC<React.PropsWithChildren> = ({ children }) => (
  <td className="py-4 sm:py-5 px-4 sm:px-5 align-top">{children}</td>
);

const ActionIcon: React.FC<React.PropsWithChildren<{ title?: string; onClick?: () => void }>> = ({ children, title, onClick }) => (
  <button title={title} onClick={onClick} className="p-1.5 sm:p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
    {children}
  </button>
);

const PrimaryBtn: React.FC<React.PropsWithChildren<{ onClick?: () => void; icon?: React.ReactNode }>> = ({ children, onClick, icon }) => (
  <button onClick={onClick} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5">
    {icon}{children}
  </button>
);
const GhostBtn: React.FC<React.PropsWithChildren<{ onClick?: () => void; icon?: React.ReactNode }>> = ({ children, onClick, icon }) => (
  <button onClick={onClick} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5">
    {icon}{children}
  </button>
);

export default CalibrationManager;
