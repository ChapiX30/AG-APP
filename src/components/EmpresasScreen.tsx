import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import labLogo from "../assets/lab_logo.png";
import {
  ArrowLeft,
  Plus,
  Building2,
  MapPin,
  Pencil,
  Trash2,
  X,
  Mail,
  Phone,
  User,
  FileText,
  Search,
  ArrowDownAZ,
  ArrowUpZA,
  LayoutGrid,
  List,
  TrendingUp,
  Calendar,
  ExternalLink,
  Briefcase,
  Eye,
  Filter,
  Users,
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import { useAppDialog } from "../hooks/useAppDialog";
import { useAuth } from "../hooks/useAuth";
import toast, { Toaster } from 'react-hot-toast';

// --- CONSTANTES DE FILTRO (Nombres Completos) ---
const NOMBRES_PERMITIDOS = [
  "Jorge Amador",
  "Edgar Amador",
  "Naimi Muro",
  "Viridiana Moreno",
  "Angel Amador"
];

// --- Tipos ---
interface Empresa {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  requerimientos: string;
  responsable: string;
  fechaCreacion: Date;
}

interface EmpresaFormData {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  requerimientos: string;
  responsable: string;
}

const INITIAL_FORM_STATE: EmpresaFormData = {
  nombre: "",
  direccion: "",
  telefono: "",
  email: "",
  contacto: "",
  requerimientos: "",
  responsable: ""
};

// --- Permisos de edición: solo Calidad y Edgar Amador ---
const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const canEditEmpresas = (user: { name?: string; role?: string; puesto?: string; email?: string } | null): boolean => {
  if (!user) return false;
  const role = normalizeText(user.puesto || user.role || "");
  const name = normalizeText(user.name || "");
  const email = normalizeText(user.email || "");
  const isCalidad =
    role === "calidad" ||
    role.includes("calidad") ||
    role.includes("quality") ||
    role.includes("aseguramiento");
  const isEdgarAmador =
    name === "edgar amador" ||
    (name.includes("edgar") && name.includes("amador")) ||
    email.includes("edgar");
  return isCalidad || isEdgarAmador;
};

// --- Utilidades ---
const getGoogleMapsUrl = (address: string) => 
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const getGoogleMapsEmbedUrl = (address: string) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(address)}&hl=es&z=15&output=embed`;

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-blue-100 text-blue-700', 'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700', 'bg-yellow-100 text-yellow-700',
    'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// --- Sub-Componentes UI ---

const InitialsAvatar = ({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" | "xl" }) => {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const colorClass = getAvatarColor(name);
  const sizeClass =
    size === "sm" ? "w-8 h-8 text-xs"
    : size === "lg" ? "w-16 h-16 text-xl"
    : size === "xl" ? "w-24 h-24 text-2xl"
    : "w-12 h-12 text-base";

  return (
    <div className={`${sizeClass} ${colorClass} rounded-xl flex items-center justify-center font-bold shadow-sm border border-white/50 shrink-0`}>
      {initials}
    </div>
  );
};

const groupEmpresasByLetter = (empresas: Empresa[]) => {
  const groups = new Map<string, Empresa[]>();
  empresas.forEach((e) => {
    const first = (e.nombre?.trim()[0] || "#").toUpperCase();
    const key = /[A-ZÁÉÍÓÚÑ]/.test(first) ? first : "#";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
};

const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
      {title}
    </h4>
    {children}
  </div>
);

const AddressMap = ({ address, className = "" }: { address: string; className?: string }) => {
  const trimmed = address?.trim();
  if (!trimmed) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-xl text-sm text-gray-500 ${className}`}>
        Sin dirección registrada
      </div>
    );
  }
  return (
    <iframe
      title={`Mapa: ${trimmed}`}
      src={getGoogleMapsEmbedUrl(trimmed)}
      className={`w-full border-0 rounded-xl ${className}`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
};

const LoadingSkeleton = ({ view }: { view: 'grid' | 'table' }) => {
  if (view === 'table') {
    return <div className="space-y-4 animate-pulse">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg w-full" />)}</div>;
  }
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="bg-gray-100 h-64 rounded-2xl" />)}</div>;
};

// --- Tarjeta individual ---
const EmpresaCard = ({
  empresa,
  canEdit,
  onEdit,
  onDelete,
  onView,
}: {
  empresa: Empresa;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) => (
  <article className="group bg-white rounded-2xl shadow-sm border border-slate-200/80 hover:shadow-xl hover:border-blue-300/60 transition-all duration-300 flex flex-col overflow-hidden">
    <div className="px-5 pt-5 pb-4 flex-grow">
      <div className="flex items-start gap-3 mb-3">
        <InitialsAvatar name={empresa.nombre} size="md" />
        <div className="min-w-0 flex-1">
      <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2" title={empresa.nombre}>
        {empresa.nombre}
      </h3>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        Alta: {empresa.fechaCreacion.toLocaleDateString("es-MX")}
      </p>

      <div className="mt-4 space-y-2.5">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-800 border border-violet-100">
          <Briefcase className="w-3 h-3 mr-1" />
          {empresa.responsable || "Sin responsable"}
        </span>

        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-gray-700">
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium truncate">{empresa.contacto}</span>
          </div>
          <a
            href={getGoogleMapsUrl(empresa.direccion)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="line-clamp-2 leading-snug">{empresa.direccion}</span>
          </a>
        </div>

        <div className="flex gap-2">
          <a href={`mailto:${empresa.email}`} className="flex-1 flex items-center justify-center py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors">
            <Mail className="w-3.5 h-3.5 mr-1" /> Email
          </a>
          <a href={`tel:${empresa.telefono}`} className="flex-1 flex items-center justify-center py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-colors">
            <Phone className="w-3.5 h-3.5 mr-1" /> Llamar
          </a>
        </div>

        {empresa.requerimientos && (
          <p className="text-[11px] text-gray-500 italic line-clamp-2 px-1 border-l-2 border-amber-300 pl-2">
            {empresa.requerimientos}
          </p>
        )}
      </div>
    </div>

    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2">
      <button
        onClick={onView}
        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        <Eye className="w-3.5 h-3.5" /> Ver ficha
      </button>
      {canEdit && (
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white rounded-lg transition-colors" title="Editar">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  </article>
);

// --- Vista grid agrupada por letra ---
const CardView = ({
  empresas,
  canEdit,
  handleEdit,
  handleDelete,
  handleView,
}: {
  empresas: Empresa[];
  canEdit: boolean;
  handleEdit: (e: Empresa) => void;
  handleDelete: (id: string) => void;
  handleView: (e: Empresa) => void;
}) => {
  const groups = groupEmpresasByLetter(empresas);
  return (
    <div className="space-y-10">
      {groups.map(([letter, items]) => (
        <section key={letter}>
          <div className="flex items-center gap-3 mb-5">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-lg shadow-md">
              {letter}
            </span>
            <div>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Sección {letter}</h2>
              <p className="text-xs text-gray-500">{items.length} empresa{items.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-blue-200 to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {items.map((empresa) => (
              <EmpresaCard
                key={empresa.id}
                empresa={empresa}
                canEdit={canEdit}
                onEdit={() => handleEdit(empresa)}
                onDelete={() => handleDelete(empresa.id)}
                onView={() => handleView(empresa)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

// --- Componente: Tabla ---
const TableView = ({
  empresas,
  canEdit,
  handleEdit,
  handleDelete,
  handleView,
}: {
  empresas: Empresa[];
  canEdit: boolean;
  handleEdit: (e: Empresa) => void;
  handleDelete: (id: string) => void;
  handleView: (e: Empresa) => void;
}) => (
  <div className="bg-white shadow-sm rounded-2xl border border-slate-200/80 overflow-hidden">
    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Vista tabla</span>
      <span className="text-xs text-gray-500">{empresas.length} registros</span>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Info</th>
            <th className="relative px-6 py-4"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {empresas.map((empresa) => (
            <tr key={empresa.id} className="group hover:bg-blue-50/40 transition-colors cursor-pointer" onClick={() => handleView(empresa)}>
              <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <InitialsAvatar name={empresa.nombre} size="sm" />
                    <div className="ml-4">
                      <div className="text-sm font-bold text-gray-900">{empresa.nombre}</div>
                      <a 
                        href={getGoogleMapsUrl(empresa.direccion)}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 flex items-center mt-0.5 hover:text-blue-600 transition-colors cursor-pointer w-fit"
                      >
                        <MapPin className="w-3 h-3 mr-1"/> {empresa.direccion}
                      </a>
                    </div>
                  </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 font-medium">{empresa.contacto}</div>
                <div className="text-xs text-gray-500">{empresa.email}</div>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col space-y-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 w-fit">
                    <Phone className="w-3 h-3 mr-1"/> {empresa.telefono}
                  </span>
                  {empresa.responsable && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 w-fit border border-purple-200 uppercase tracking-wide">
                        Atiende: {empresa.responsable}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleView(empresa)} title="Ver detalle" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"><Eye className="h-4 w-4" /></button>
                  {canEdit && (
                    <>
                      <button onClick={() => handleEdit(empresa)} title="Editar" className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(empresa.id)} title="Eliminar" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Estadísticas ---
const DashboardStats = ({
  total,
  recent,
  responsables,
}: {
  total: number;
  recent: number;
  responsables: number;
}) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
    <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="p-3 rounded-xl bg-blue-50 text-blue-600"><Building2 className="h-6 w-6" /></div>
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Total clientes</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{total}</p>
      </div>
    </div>
    <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600"><TrendingUp className="h-6 w-6" /></div>
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Nuevas (30 días)</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{recent}</p>
      </div>
    </div>
    <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow col-span-2 lg:col-span-1">
      <div className="p-3 rounded-xl bg-amber-50 text-amber-600"><Users className="h-6 w-6" /></div>
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">Responsables</p>
        <p className="text-2xl font-bold text-gray-900 tabular-nums">{responsables}</p>
      </div>
    </div>
  </div>
);

// --- Componente: Modal de Formulario ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  data: EmpresaFormData;
  setData: (data: EmpresaFormData) => void;
  isEditing: boolean;
  staffList: string[];
}

const EmpresaFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  data,
  setData,
  isEditing,
  staffList,
}: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900 bg-opacity-60 backdrop-blur-sm" onClick={onClose} />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">​</span>
        
        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl w-full">
          <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600" />
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{isEditing ? "Editar empresa" : "Registrar empresa"}</h3>
                <p className="text-sm text-gray-500 mt-1">Completa las secciones del directorio de clientes.</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="h-5 w-5" /></button>
            </div>
            
            <form id="empresaForm" onSubmit={onSubmit} className="space-y-5">
              <FormSection title="Datos generales">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nombre comercial</label>
                    <input type="text" required value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Ej. CELESTICA MÉXICO" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide mb-1.5">Responsable interno</label>
                    <div className="relative">
                      <User className="absolute top-3 left-3 h-4 w-4 text-blue-500" />
                      <select required value={data.responsable} onChange={(e) => setData({ ...data, responsable: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none cursor-pointer text-gray-700">
                        <option value="" disabled>Selecciona encargado...</option>
                        {staffList.map((nombre, idx) => (
                          <option key={idx} value={nombre}>{nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Contacto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "Correo", icon: Mail, type: "email", val: data.email, key: "email", ph: "contacto@empresa.com" },
                    { label: "Teléfono", icon: Phone, type: "tel", val: data.telefono, key: "telefono", ph: "+52 (81) 1234 5678" },
                    { label: "Contacto principal", icon: User, type: "text", val: data.contacto, key: "contacto", ph: "Nombre completo", span: true },
                  ].map((field) => (
                    <div key={field.key} className={field.span ? "md:col-span-2" : ""}>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{field.label}</label>
                      <div className="relative">
                        <field.icon className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                        <input type={field.type} required value={field.val}
                          onChange={(e) => setData({ ...data, [field.key]: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          placeholder={field.ph} />
                      </div>
                    </div>
                  ))}
                </div>
              </FormSection>

              <FormSection title="Ubicación">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Dirección física</label>
                  <div className="relative">
                    <MapPin className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                    <input type="text" required value={data.direccion}
                      onChange={(e) => setData({ ...data, direccion: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      placeholder="Calle, número, colonia, ciudad" />
                  </div>
                </div>
                {data.direccion.trim() && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Vista previa del mapa</label>
                    <AddressMap address={data.direccion} className="h-44 shadow-inner rounded-xl" />
                  </div>
                )}
              </FormSection>

              <FormSection title="Notas internas">
                <textarea value={data.requerimientos} onChange={(e) => setData({ ...data, requerimientos: e.target.value })} rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white"
                  placeholder="Requerimientos, horarios, accesos, observaciones..." />
              </FormSection>
            </form>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-100 gap-2">
            <button form="empresaForm" type="submit" className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors">
              {isEditing ? "Guardar Cambios" : "Crear Empresa"}
            </button>
            <button onClick={onClose} type="button" className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Modal de solo lectura con mapa ---
const EmpresaDetailModal = ({
  empresa,
  onClose,
  canEdit,
  onEdit,
}: {
  empresa: Empresa | null;
  onClose: () => void;
  canEdit: boolean;
  onEdit: (e: Empresa) => void;
}) => {
  if (!empresa) return null;

  const infoRows = [
    { label: "Contacto", value: empresa.contacto, icon: User },
    { label: "Correo", value: empresa.email, icon: Mail },
    { label: "Teléfono", value: empresa.telefono, icon: Phone },
    { label: "Responsable interno", value: empresa.responsable || "Sin asignar", icon: Briefcase },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">​</span>

        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl w-full">
          <div className="bg-gradient-to-r from-slate-800 via-blue-900 to-indigo-900 px-5 py-4 flex items-center justify-between">
            <img src={labLogo} alt="AG Metrology" className="h-9 w-auto object-contain drop-shadow-sm" />
            <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="bg-white px-4 pt-5 pb-4 sm:px-6 sm:pb-6">
            <div className="mb-5 flex items-start gap-4">
              <InitialsAvatar name={empresa.nombre} size="lg" />
              <div>
              <h3 className="text-xl font-bold text-gray-900">{empresa.nombre}</h3>
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Registrada: {empresa.fechaCreacion.toLocaleDateString("es-MX")}
              </p>
              <span className="inline-flex mt-2 items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 text-violet-800 border border-violet-100">
                <Briefcase className="w-3 h-3 mr-1" />
                {empresa.responsable || "Sin responsable"}
              </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              {infoRows.map((row) => (
                <div key={row.label} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <row.icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{row.label}</p>
                    <p className="text-sm text-gray-800 font-medium break-all">{row.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Ubicación
                </p>
                {empresa.direccion?.trim() && (
                  <a
                    href={getGoogleMapsUrl(empresa.direccion)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Abrir en Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-700 mb-3">{empresa.direccion || "Sin dirección"}</p>
              <AddressMap address={empresa.direccion} className="h-56 md:h-64 shadow-inner" />
            </div>

            {empresa.requerimientos && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> Notas / Requerimientos
                </p>
                <p className="text-sm text-gray-700 italic">{empresa.requerimientos}</p>
              </div>
            )}
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100">
            <button onClick={onClose} type="button" className="w-full sm:w-auto inline-flex justify-center rounded-xl border border-gray-300 px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cerrar
            </button>
            {canEdit && (
              <button
                onClick={() => { onClose(); onEdit(empresa); }}
                type="button"
                className="w-full sm:w-auto inline-flex justify-center rounded-xl border border-transparent px-4 py-2 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
              >
                Editar empresa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Componente Principal ---
const EmpresasScreen = () => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState<EmpresaFormData>(INITIAL_FORM_STATE);
  
  // Estado para la lista de responsables filtrada
  const [staffOptions, setStaffOptions] = useState<string[]>([]);

  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [viewingEmpresa, setViewingEmpresa] = useState<Empresa | null>(null);
  const [filterResponsable, setFilterResponsable] = useState<string>("todos");
  const { goBack } = useNavigation();
  const { user } = useAuth();
  const { confirm } = useAppDialog();
  const canEdit = useMemo(() => canEditEmpresas(user), [user]);

  const responsablesUnicos = useMemo(() => {
    const set = new Set(empresas.map((e) => e.responsable).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [empresas]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Cargar lista de responsables (usuarios) Y FILTRAR POR NOMBRES COMPLETOS
      const usersSnapshot = await getDocs(collection(db, "usuarios"));
      const usersList = usersSnapshot.docs
        .map(doc => doc.data().nombre) // Obtenemos nombres
        .filter(nombre => nombre && NOMBRES_PERMITIDOS.includes(nombre)); // FILTRO EXACTO: Solo nombres completos permitidos
        
      setStaffOptions(usersList);

      // 2. Cargar Empresas
      const querySnapshot = await getDocs(collection(db, "clientes"));
      const empresasData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fechaCreacion: doc.data().fechaCreacion?.toDate() || new Date()
      })) as Empresa[];
      setEmpresas(empresasData);
      
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Error cargando datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredEmpresas = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return empresas.filter((e) => {
      const matchSearch =
        !term ||
        e.nombre?.toLowerCase().includes(term) ||
        e.contacto?.toLowerCase().includes(term) ||
        e.responsable?.toLowerCase().includes(term) ||
        e.direccion?.toLowerCase().includes(term);
      const matchResponsable =
        filterResponsable === "todos" || e.responsable === filterResponsable;
      return matchSearch && matchResponsable;
    });
  }, [empresas, searchTerm, filterResponsable]);

  const sortedEmpresas = useMemo(() => {
    return [...filteredEmpresas].sort((a, b) => {
      const nameA = a.nombre || "";
      const nameB = b.nombre || "";
      return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
  }, [filteredEmpresas, sortAsc]);

  const stats = useMemo(() => {
    const total = empresas.length;
    const recent = empresas.filter(
      (e) => (Date.now() - e.fechaCreacion.getTime()) / (1000 * 3600 * 24) < 30
    ).length;
    const responsables = new Set(empresas.map((e) => e.responsable).filter(Boolean)).size;
    return { total, recent, responsables };
  }, [empresas]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error("No tienes permiso para modificar empresas.");
      return;
    }

    const dataToSave = {
      ...formData,
      nombre: formData.nombre.trim().toUpperCase(),
    };

    const actionPromise = editingEmpresa
      ? updateDoc(doc(db, "clientes", editingEmpresa.id), { ...dataToSave, fechaActualizacion: new Date() })
      : addDoc(collection(db, "clientes"), { ...dataToSave, fechaCreacion: new Date() });

    toast.promise(actionPromise, {
      loading: "Procesando...",
      success: `Empresa ${editingEmpresa ? "actualizada" : "creada"} correctamente.`,
      error: "Ocurrió un error.",
    });

    try {
      await actionPromise;
      setShowModal(false);
      setEditingEmpresa(null);
      setFormData(INITIAL_FORM_STATE);
      loadData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) {
      toast.error("No tienes permiso para eliminar empresas.");
      return;
    }
    if (await confirm({ message: '¿Estás seguro que deseas eliminar esta empresa?', variant: 'danger', confirmLabel: 'Eliminar' })) {
      const deletePromise = deleteDoc(doc(db, "clientes", id));
      toast.promise(deletePromise, { loading: 'Eliminando...', success: 'Empresa eliminada.', error: 'Error al eliminar.' });
      try { await deletePromise; loadData(); } catch (error) { console.error(error); }
    }
  };

  const openModal = (empresa?: Empresa) => {
    if (!canEdit) {
      toast.error("No tienes permiso para crear o editar empresas.");
      return;
    }
    if (empresa) {
      setEditingEmpresa(empresa);
      setFormData({
        nombre: empresa.nombre,
        direccion: empresa.direccion,
        telefono: empresa.telefono,
        email: empresa.email,
        contacto: empresa.contacto,
        requerimientos: empresa.requerimientos || "",
        responsable: empresa.responsable || "",
      });
    } else {
      setEditingEmpresa(null);
      setFormData(INITIAL_FORM_STATE);
    }
    setShowModal(true);
  };

  const openDetail = (empresa: Empresa) => setViewingEmpresa(empresa);

  return (
    <div className="min-h-full flex-shrink-0 flex flex-col bg-gradient-to-b from-slate-100 via-gray-50 to-white font-sans text-gray-900 selection:bg-blue-100">
      <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: '12px', background: '#1f2937', color: '#fff', fontSize: '14px' } }} />
      
      {/* Navbar */}
      <div className="bg-white/90 border-b border-slate-200 sticky top-0 z-20 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button onClick={goBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500 shrink-0" title="Regresar">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3 border-r border-gray-200 pr-3 sm:pr-4 shrink-0">
                <img src={labLogo} alt="AG Metrology" className="h-9 sm:h-10 w-auto object-contain drop-shadow-sm" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 tracking-tight truncate">Directorio de Clientes</h1>
                <p className="text-[11px] text-gray-500 hidden sm:block">Empresas, contactos y ubicaciones</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center bg-gray-100 rounded-lg p-1">
                 <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid className="h-4 w-4"/></button>
                 <button onClick={() => setView('table')} className={`p-1.5 rounded-md transition-all ${view === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><List className="h-4 w-4"/></button>
              </div>
              <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>
              {canEdit ? (
                <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center transition-all shadow-md hover:shadow-lg active:scale-95 text-sm font-medium">
                  <Plus className="h-5 w-5 mr-1.5" /> Nueva Empresa
                </button>
              ) : (
                <span className="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded-xl border border-gray-200">
                  Solo lectura
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 space-y-6">
            <DashboardStats
              total={stats.total}
              recent={stats.recent}
              responsables={stats.responsables}
            />

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  Filtros y búsqueda
                </h2>
                <span className="text-xs text-gray-500 tabular-nums">
                  {sortedEmpresas.length} de {empresas.length} resultados
                </span>
              </div>

              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-blue-500" />
                  <input
                    type="text"
                    className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Buscar por nombre, contacto, dirección o responsable..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="relative min-w-[200px]">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <select
                    value={filterResponsable}
                    onChange={(e) => setFilterResponsable(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-sm appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="todos">Todos los responsables</option>
                    {responsablesUnicos.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => setSortAsc(!sortAsc)}
                  className="flex items-center justify-center px-4 py-3 text-sm font-semibold text-gray-700 bg-slate-50 border border-gray-200 rounded-xl hover:bg-white transition-all shrink-0"
                >
                  {sortAsc ? <ArrowDownAZ className="h-4 w-4 mr-2" /> : <ArrowUpZA className="h-4 w-4 mr-2" />}
                  {sortAsc ? "A → Z" : "Z → A"}
                </button>
              </div>
            </div>
        </div>

        {loading ? (
          <LoadingSkeleton view={view} />
        ) : (
          <>
            {sortedEmpresas.length > 0 ? (
                <div className="animate-in fade-in duration-500 slide-in-from-bottom-4">
                    {view === 'grid' 
                    ? <CardView empresas={sortedEmpresas} canEdit={canEdit} handleEdit={openModal} handleDelete={handleDelete} handleView={openDetail} /> 
                    : <TableView empresas={sortedEmpresas} canEdit={canEdit} handleEdit={openModal} handleDelete={handleDelete} handleView={openDetail} />
                    }
                </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                    <Building2 className="h-10 w-10 text-blue-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No se encontraron resultados</h3>
                <p className="mt-1 text-gray-500 max-w-sm mx-auto">
                  {searchTerm ? "Intenta ajustar los términos de búsqueda." : "Comienza agregando tu primera empresa al directorio."}
                </p>
                {!searchTerm && canEdit && (
                     <button onClick={() => openModal()} className="mt-6 text-blue-600 font-medium hover:underline">Agregar ahora</button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <EmpresaFormModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          data={formData}
          setData={setFormData}
          isEditing={!!editingEmpresa}
          staffList={staffOptions}
        />
      )}

      <EmpresaDetailModal
        empresa={viewingEmpresa}
        onClose={() => setViewingEmpresa(null)}
        canEdit={canEdit}
        onEdit={openModal}
      />
    </div>
  );
};

export default EmpresasScreen;