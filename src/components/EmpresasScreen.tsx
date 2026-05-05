import React, { useEffect, useState, useMemo } from "react";
import {
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc
} from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  ArrowLeft, Plus, Building2, MapPin, Pencil, Trash2, X,
  Mail, Phone, User, FileText, Search, ArrowDownAZ, ArrowUpZA,
  LayoutGrid, List, TrendingUp, Calendar, ExternalLink,
  Briefcase, ChevronRight, Shield, Eye, Lock
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import toast, { Toaster } from "react-hot-toast";

// ─── Quiénes pueden editar empresas ────────────────────────────────────────────
const CALIDAD_NOMBRES = [
  "Jorge Amador",
  "Edgar Amador",
  "Naimi Muro",
  "Viridiana Moreno",
  "Angel Amador",
];

// ─── Tipos ─────────────────────────────────────────────────────────────────────
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

const INITIAL_FORM: EmpresaFormData = {
  nombre: "", direccion: "", telefono: "",
  email: "", contacto: "", requerimientos: "", responsable: "",
};

// ─── Utilidades ────────────────────────────────────────────────────────────────
const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const AVATAR_COLORS = [
  ["#DBEAFE", "#1D4ED8"], ["#D1FAE5", "#065F46"], ["#EDE9FE", "#5B21B6"],
  ["#FEF3C7", "#92400E"], ["#FCE7F3", "#9D174D"], ["#E0E7FF", "#3730A3"],
];

const avatarColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

// ─── InitialsAvatar ────────────────────────────────────────────────────────────
const InitialsAvatar = ({
  name, size = "md",
}: {
  name: string; size?: "sm" | "md" | "lg";
}) => {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const [bg, fg] = avatarColor(name);
  const dim = size === "sm" ? 32 : size === "lg" ? 56 : 44;
  const fs = size === "sm" ? 11 : size === "lg" ? 20 : 15;
  return (
    <div
      style={{
        width: dim, height: dim, minWidth: dim,
        backgroundColor: bg, color: fg,
        borderRadius: 12, fontSize: fs,
        fontWeight: 700, display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {initials}
    </div>
  );
};

// ─── LoadingSkeleton ───────────────────────────────────────────────────────────
const LoadingSkeleton = ({ view }: { view: "grid" | "table" }) => (
  <div className={`animate-pulse ${view === "grid"
    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
    : "space-y-3"}`}>
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className={`bg-gray-100 rounded-2xl ${view === "grid" ? "h-52" : "h-16"}`} />
    ))}
  </div>
);

// ─── StatsBar ──────────────────────────────────────────────────────────────────
const StatsBar = ({ total, recent, isCalidad }: { total: number; recent: number; isCalidad: boolean }) => (
  <div className="flex flex-wrap gap-3">
    <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
      <div className="p-2 bg-blue-50 rounded-xl"><Building2 className="h-5 w-5 text-blue-600" /></div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Total</p>
        <p className="text-xl font-bold text-gray-900 leading-none">{total}</p>
      </div>
    </div>
    <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
      <div className="p-2 bg-emerald-50 rounded-xl"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Nuevas (30d)</p>
        <p className="text-xl font-bold text-gray-900 leading-none">{recent}</p>
      </div>
    </div>
    {/* Badge de rol */}
    <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 border text-xs font-semibold
      ${isCalidad
        ? "bg-violet-50 border-violet-200 text-violet-700"
        : "bg-amber-50 border-amber-200 text-amber-700"}`}>
      {isCalidad ? <Shield className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      {isCalidad ? "Modo Calidad — Edición habilitada" : "Modo Técnico — Solo lectura"}
    </div>
  </div>
);

// ─── EmpresaCard ──────────────────────────────────────────────────────────────
const EmpresaCard = ({
  empresa, onSelect, onEdit, onDelete, isCalidad,
}: {
  empresa: Empresa;
  onSelect: (e: Empresa) => void;
  onEdit: (e: Empresa) => void;
  onDelete: (id: string) => void;
  isCalidad: boolean;
}) => (
  <div
    className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer"
    onClick={() => onSelect(empresa)}
  >
    {/* Header */}
    <div className="p-5 flex items-start gap-4">
      <InitialsAvatar name={empresa.nombre} size="lg" />
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-gray-900 text-base leading-tight truncate">{empresa.nombre}</h3>
        {empresa.responsable && (
          <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100 text-[11px] font-semibold">
            <Briefcase className="h-3 w-3" /> {empresa.responsable}
          </span>
        )}
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-gray-400">
          <Calendar className="h-3 w-3" />
          {empresa.fechaCreacion.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0 mt-1" />
    </div>

    {/* Info rápida */}
    <div className="px-5 pb-4 space-y-2 flex-1">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="truncate">{empresa.contacto || "—"}</span>
      </div>
      <a
        href={mapsUrl(empresa.direccion)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 transition-colors group/addr"
      >
        <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 group-hover/addr:text-blue-500" />
        <span className="truncate flex-1">{empresa.direccion || "—"}</span>
        <ExternalLink className="h-3 w-3 opacity-0 group-hover/addr:opacity-100 text-blue-500" />
      </a>
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span>{empresa.telefono || "—"}</span>
      </div>
    </div>

    {/* Acciones rápidas */}
    <div
      className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={`mailto:${empresa.email}`}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <Mail className="h-3.5 w-3.5" /> Email
      </a>
      <a
        href={`tel:${empresa.telefono}`}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
      >
        <Phone className="h-3.5 w-3.5" /> Llamar
      </a>
      {isCalidad ? (
        <>
          <button
            onClick={() => onEdit(empresa)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(empresa.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <div className="p-1.5 text-gray-300" title="Solo calidad puede editar">
          <Lock className="h-4 w-4" />
        </div>
      )}
    </div>
  </div>
);

// ─── TableView ────────────────────────────────────────────────────────────────
const TableView = ({
  empresas, onSelect, onEdit, onDelete, isCalidad,
}: {
  empresas: Empresa[];
  onSelect: (e: Empresa) => void;
  onEdit: (e: Empresa) => void;
  onDelete: (id: string) => void;
  isCalidad: boolean;
}) => (
  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead>
          <tr className="bg-gray-50/70">
            {["Empresa", "Contacto", "Teléfono", "Responsable", ""].map((h) => (
              <th key={h} className="px-5 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {empresas.map((e) => (
            <tr
              key={e.id}
              className="group hover:bg-blue-50/40 transition-colors cursor-pointer"
              onClick={() => onSelect(e)}
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={e.nombre} size="sm" />
                  <div>
                    <div className="text-sm font-bold text-gray-900">{e.nombre}</div>
                    <a
                      href={mapsUrl(e.direccion)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="text-[11px] text-gray-400 hover:text-blue-500 flex items-center gap-1 mt-0.5 transition-colors w-fit"
                    >
                      <MapPin className="h-3 w-3" /> {e.direccion}
                    </a>
                  </div>
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="text-sm text-gray-800 font-medium">{e.contacto}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{e.email}</div>
              </td>
              <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">{e.telefono}</td>
              <td className="px-5 py-4">
                {e.responsable ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100 text-[11px] font-semibold">
                    <Briefcase className="h-3 w-3" /> {e.responsable}
                  </span>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
              <td className="px-5 py-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isCalidad ? (
                    <>
                      <button onClick={() => onEdit(e)} className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => onDelete(e.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <span className="p-2 text-gray-200"><Lock className="h-4 w-4" /></span>
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

// ─── DetailDrawer — panel lateral con toda la info del cliente ─────────────────
const DetailDrawer = ({
  empresa, onClose, onEdit, onDelete, isCalidad,
}: {
  empresa: Empresa | null;
  onClose: () => void;
  onEdit: (e: Empresa) => void;
  onDelete: (id: string) => void;
  isCalidad: boolean;
}) => {
  if (!empresa) return null;

  const InfoRow = ({
    icon: Icon, label, value, href, isLink = false,
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    href?: string;
    isLink?: boolean;
  }) => (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="p-2 bg-gray-50 rounded-lg mt-0.5 shrink-0">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
        {isLink && href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1 font-medium"
          >
            {value} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="text-sm text-gray-800 font-medium break-words">{value || "—"}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={empresa.nombre} size="md" />
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">{empresa.nombre}</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Registrada el{" "}
                {empresa.fechaCreacion.toLocaleDateString("es-MX", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Responsable badge */}
        {empresa.responsable && (
          <div className="px-5 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-violet-600" />
            <span className="text-xs font-semibold text-violet-700">Atendida por: </span>
            <span className="text-xs text-violet-800 font-bold">{empresa.responsable}</span>
          </div>
        )}

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {/* Acciones de contacto rápidas */}
          <div className="flex gap-2 py-4">
            <a
              href={`mailto:${empresa.email}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
            >
              <Mail className="h-4 w-4" /> Enviar Email
            </a>
            <a
              href={`tel:${empresa.telefono}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <Phone className="h-4 w-4" /> Llamar
            </a>
          </div>

          {/* Sección: Datos de contacto */}
          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 px-1">
              Información de Contacto
            </p>
            <div className="bg-gray-50/50 rounded-2xl px-4 divide-y divide-gray-100">
              <InfoRow icon={User} label="Contacto Principal" value={empresa.contacto} />
              <InfoRow icon={Mail} label="Correo Electrónico" value={empresa.email}
                href={`mailto:${empresa.email}`} isLink />
              <InfoRow icon={Phone} label="Teléfono" value={empresa.telefono}
                href={`tel:${empresa.telefono}`} isLink />
            </div>
          </div>

          {/* Sección: Ubicación */}
          <div className="mb-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 px-1">
              Ubicación
            </p>
            <div className="bg-gray-50/50 rounded-2xl px-4">
              <InfoRow
                icon={MapPin}
                label="Dirección"
                value={empresa.direccion}
                href={mapsUrl(empresa.direccion)}
                isLink
              />
            </div>
          </div>

          {/* Sección: Notas / Requerimientos */}
          {empresa.requerimientos && (
            <div className="mb-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 px-1">
                Notas y Requerimientos
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex gap-3">
                <FileText className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-700 leading-relaxed">{empresa.requerimientos}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer con acciones de calidad */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          {isCalidad ? (
            <div className="flex gap-2">
              <button
                onClick={() => { onEdit(empresa); onClose(); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Pencil className="h-4 w-4" /> Editar Empresa
              </button>
              <button
                onClick={() => { onDelete(empresa.id); onClose(); }}
                className="p-2.5 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-gray-400">
              <Lock className="h-3.5 w-3.5" />
              Solo el equipo de calidad puede editar
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ─── EmpresaFormModal ──────────────────────────────────────────────────────────
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
  isOpen, onClose, onSubmit, data, setData, isEditing, staffList,
}: ModalProps) => {
  if (!isOpen) return null;

  const Field = ({
    label, icon: Icon, type = "text", value, field, placeholder, required = true,
  }: {
    label: string;
    icon: React.ElementType;
    type?: string;
    value: string;
    field: keyof EmpresaFormData;
    placeholder: string;
    required?: boolean;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
        <input
          type={type}
          required={required}
          value={value}
          onChange={(e) => setData({ ...data, [field]: e.target.value })}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-gray-50 focus:bg-white transition-all text-sm"
          placeholder={placeholder}
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {isEditing ? "Editar Empresa" : "Nueva Empresa"}
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {isEditing ? "Modifica los datos del cliente." : "Agrega un nuevo cliente al directorio."}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <form id="empresaForm" onSubmit={onSubmit} className="space-y-5">
            {/* Nombre */}
            <Field label="Nombre Comercial" icon={Building2} value={data.nombre} field="nombre" placeholder="Ej. Tech Solutions S.A." />

            {/* Responsable */}
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
              <label className="block text-xs font-bold text-violet-700 uppercase tracking-widest mb-1.5">
                Responsable Asignado
              </label>
              <div className="relative">
                <Briefcase className="absolute top-3 left-3 h-4 w-4 text-violet-500" />
                <select
                  required
                  value={data.responsable}
                  onChange={(e) => setData({ ...data, responsable: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-violet-200 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none bg-white text-sm appearance-none cursor-pointer text-gray-700"
                >
                  <option value="" disabled>Selecciona al encargado...</option>
                  {staffList.map((nombre, i) => (
                    <option key={i} value={nombre}>{nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid 2 columnas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Correo Electrónico" icon={Mail} type="email" value={data.email} field="email" placeholder="contacto@empresa.com" />
              <Field label="Teléfono" icon={Phone} type="tel" value={data.telefono} field="telefono" placeholder="+52 81 1234 5678" />
              <Field label="Contacto Principal" icon={User} value={data.contacto} field="contacto" placeholder="Nombre del responsable" />
              <Field label="Dirección Física" icon={MapPin} value={data.direccion} field="direccion" placeholder="Calle, Número, Colonia" />
            </div>

            {/* Notas */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Notas / Requerimientos</label>
              <textarea
                value={data.requerimientos}
                onChange={(e) => setData({ ...data, requerimientos: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all text-sm"
                placeholder="Detalles importantes del cliente..."
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button form="empresaForm" type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm transition-colors">
            {isEditing ? "Guardar Cambios" : "Crear Empresa"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────
const EmpresasScreen = () => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState<EmpresaFormData>(INITIAL_FORM);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);

  // ── Detectar si el usuario actual es de calidad ──────────────────────────────
  // Ajusta esta lógica según cómo obtengas el usuario actual en tu app
  // (ej: useAuth(), localStorage, contexto, etc.)
  const [isCalidad, setIsCalidad] = useState(false);

  useEffect(() => {
    // Ejemplo: leer del localStorage donde guardas el perfil activo
    try {
      const perfil = JSON.parse(localStorage.getItem("perfilActivo") || "{}");
      const nombre: string = perfil?.nombre || "";
      setIsCalidad(CALIDAD_NOMBRES.includes(nombre));
    } catch {
      setIsCalidad(false);
    }
  }, []);

  const { goBack } = useNavigation();

  const loadData = async () => {
    try {
      setLoading(true);
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const usersList = usersSnap.docs
        .map((d) => d.data().nombre as string)
        .filter((n) => n && CALIDAD_NOMBRES.includes(n));
      setStaffOptions(usersList);

      const snap = await getDocs(collection(db, "clientes"));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        fechaCreacion: d.data().fechaCreacion?.toDate() || new Date(),
      })) as Empresa[];
      setEmpresas(data);
    } catch (err) {
      console.error(err);
      toast.error("Error cargando datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase();
    return empresas.filter(
      (e) => e.nombre?.toLowerCase().includes(t) || e.contacto?.toLowerCase().includes(t)
    );
  }, [empresas, searchTerm]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) =>
      sortAsc ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre)
    ), [filtered, sortAsc]);

  const stats = useMemo(() => ({
    total: empresas.length,
    recent: empresas.filter(
      (e) => (Date.now() - e.fechaCreacion.getTime()) / 86_400_000 < 30
    ).length,
  }), [empresas]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const action = editingEmpresa
      ? updateDoc(doc(db, "clientes", editingEmpresa.id), { ...formData, fechaActualizacion: new Date() })
      : addDoc(collection(db, "clientes"), { ...formData, fechaCreacion: new Date() });

    toast.promise(action, {
      loading: "Procesando...",
      success: `Empresa ${editingEmpresa ? "actualizada" : "creada"} correctamente.`,
      error: "Ocurrió un error.",
    });

    try {
      await action;
      setShowModal(false);
      setEditingEmpresa(null);
      setFormData(INITIAL_FORM);
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar esta empresa del directorio?")) return;
    const p = deleteDoc(doc(db, "clientes", id));
    toast.promise(p, { loading: "Eliminando...", success: "Empresa eliminada.", error: "Error al eliminar." });
    try { await p; loadData(); } catch (err) { console.error(err); }
  };

  const openModal = (empresa?: Empresa) => {
    if (empresa) {
      setEditingEmpresa(empresa);
      setFormData({
        nombre: empresa.nombre, direccion: empresa.direccion,
        telefono: empresa.telefono, email: empresa.email,
        contacto: empresa.contacto, requerimientos: empresa.requerimientos || "",
        responsable: empresa.responsable || "",
      });
    } else {
      setEditingEmpresa(null);
      setFormData(INITIAL_FORM);
    }
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: { borderRadius: "12px", background: "#111827", color: "#fff", fontSize: "13px" },
        }}
      />

      {/* Navbar */}
      <div className="bg-white/90 border-b border-gray-200 sticky top-0 z-20 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={goBack}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h1 className="text-lg font-bold text-gray-900">Directorio de Clientes</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Vista grid/tabla */}
              <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setView("grid")}
                  className={`p-1.5 rounded-md transition-all ${view === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`p-1.5 rounded-md transition-all ${view === "table" ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              {/* Botón nueva empresa — solo calidad */}
              {isCalidad && (
                <button
                  onClick={() => openModal()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 shadow-sm transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" /> Nueva Empresa
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
        {/* Stats + rol */}
        <StatsBar total={stats.total} recent={stats.recent} isCalidad={isCalidad} />

        {/* Barra de búsqueda + orden */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o contacto..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
            />
          </div>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-colors"
          >
            {sortAsc
              ? <><ArrowDownAZ className="h-4 w-4" /> A – Z</>
              : <><ArrowUpZA className="h-4 w-4" /> Z – A</>}
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <LoadingSkeleton view={view} />
        ) : sorted.length > 0 ? (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-400">
            {view === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {sorted.map((e) => (
                  <EmpresaCard
                    key={e.id}
                    empresa={e}
                    onSelect={setSelectedEmpresa}
                    onEdit={openModal}
                    onDelete={handleDelete}
                    isCalidad={isCalidad}
                  />
                ))}
              </div>
            ) : (
              <TableView
                empresas={sorted}
                onSelect={setSelectedEmpresa}
                onEdit={openModal}
                onDelete={handleDelete}
                isCalidad={isCalidad}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
            <Building2 className="h-12 w-12 text-gray-200 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-800">Sin resultados</h3>
            <p className="text-sm text-gray-400 mt-1">
              {searchTerm ? "Intenta con otros términos." : "Aún no hay empresas registradas."}
            </p>
            {!searchTerm && isCalidad && (
              <button
                onClick={() => openModal()}
                className="mt-5 text-blue-600 text-sm font-medium hover:underline"
              >
                Agregar primera empresa
              </button>
            )}
          </div>
        )}
      </div>

      {/* Panel de detalle */}
      <DetailDrawer
        empresa={selectedEmpresa}
        onClose={() => setSelectedEmpresa(null)}
        onEdit={openModal}
        onDelete={handleDelete}
        isCalidad={isCalidad}
      />

      {/* Modal de formulario — solo calidad llega aquí */}
      {isCalidad && (
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
    </div>
  );
};

export default EmpresasScreen;