import React, { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
  UserX,
  UserCheck,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import clsx from "clsx";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import {
  AG_BRAND_BLUE,
  OPERATIONAL_SCREEN_BG,
  OperationalScreenHeader,
  OperationalScreenShell,
} from "./ui/OperationalScreenShell";
import { db } from "../utils/firebase";
import {
  adminCrearUsuario,
  adminSetUsuarioActivo,
  adminUsuariosErrorMessage,
} from "../utils/adminUsuariosApi";

const SUPER_ADMINS = [
  "jesus.sustaita@agsolutions.com",
  "admin@agsolutions.com",
  "mgaese08@gmail.com",
];

const PUESTOS = ["Metrólogo", "Calidad", "Logistica", "Administrativo", "Gerente"] as const;

type UsuarioRow = {
  id: string;
  name: string;
  email: string;
  puesto: string;
  activo: boolean;
};

const canManage = (email?: string, role?: string, puesto?: string) => {
  const e = (email || "").trim().toLowerCase();
  if (SUPER_ADMINS.includes(e)) return true;
  const text = `${puesto || ""} ${role || ""}`.toLowerCase();
  return (
    text.includes("admin") ||
    text.includes("gerente") ||
    text.includes("manager") ||
    text.includes("calidad")
  );
};

export const GestionUsuariosScreen: React.FC = () => {
  const { user } = useAuth();
  const allowed = canManage(user?.email, user?.role, user?.puesto);

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [puesto, setPuesto] = useState<(typeof PUESTOS)[number] | "">("");
  const [creating, setCreating] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "usuarios"),
      (snap) => {
        const rows: UsuarioRow[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.nombre || data.name || "").trim() || "Sin nombre",
            email: String(data.email || data.correo || "").trim().toLowerCase(),
            puesto: String(data.puesto || data.role || "").trim(),
            activo: data.activo !== false,
          };
        });
        rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
        setUsuarios(rows);
        setLoading(false);
      },
      () => {
        toast.error("No se pudo cargar la lista de usuarios");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [allowed]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return usuarios;
    return usuarios.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.includes(term) ||
        u.puesto.toLowerCase().includes(term),
    );
  }, [usuarios, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !email.trim() || !puesto) {
      toast.error("Completa nombre, correo y puesto.");
      return;
    }
    setCreating(true);
    try {
      const res = await adminCrearUsuario({
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        puesto,
      });
      toast.success(
        res.createdAuth
          ? "Usuario creado. Se envió un correo para que elija su contraseña."
          : "Usuario autorizado. Se envió correo para restablecer contraseña.",
      );
      setNombre("");
      setEmail("");
      setPuesto("");
    } catch (err) {
      toast.error(adminUsuariosErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const toggleActivo = async (u: UsuarioRow) => {
    if (u.id === user?.id) {
      toast.error("No puedes desactivar tu propia cuenta.");
      return;
    }
    setBusyUid(u.id);
    try {
      await adminSetUsuarioActivo({ uid: u.id, activo: !u.activo });
      toast.success(u.activo ? "Usuario desactivado." : "Usuario reactivado.");
    } catch (err) {
      toast.error(adminUsuariosErrorMessage(err));
    } finally {
      setBusyUid(null);
    }
  };

  if (!allowed) {
    return (
      <OperationalScreenShell>
        <OperationalScreenHeader
          title="Gestión de usuarios"
          subtitle="Acceso restringido"
          titleIcon={<ShieldCheck className="w-5 h-5" style={{ color: AG_BRAND_BLUE }} />}
        />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center text-slate-600">
          No tienes permiso para gestionar usuarios del sistema.
        </div>
      </OperationalScreenShell>
    );
  }

  return (
    <OperationalScreenShell className={OPERATIONAL_SCREEN_BG}>
      <Toaster position="top-center" />
      <OperationalScreenHeader
        title="Gestión de usuarios"
        subtitle="Solo personal autorizado puede entrar a la app"
        titleIcon={<ShieldCheck className="w-5 h-5" style={{ color: AG_BRAND_BLUE }} />}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-5 h-5" style={{ color: AG_BRAND_BLUE }} />
            <h2 className="text-base font-semibold text-slate-800">Dar de alta empleado</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Se crea la cuenta y se envía un correo para que la persona elija su propia contraseña.
            Nadie puede registrarse solo desde el login.
          </p>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2464A3]/30"
                placeholder="Nombre completo"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2464A3]/30"
                placeholder="correo@empresa.com"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Puesto</span>
              <select
                value={puesto}
                onChange={(e) => setPuesto(e.target.value as typeof puesto)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2464A3]/30 bg-white"
                required
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {PUESTOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: AG_BRAND_BLUE }}
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Crear usuario autorizado
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex-1">Usuarios del sistema</h2>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2464A3]/30"
                placeholder="Buscar por nombre o correo"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">No hay usuarios para mostrar.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <li key={u.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email || "Sin correo"}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{u.puesto || "—"}</span>
                  <span
                    className={clsx(
                      "text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 w-fit",
                      u.activo ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                    )}
                  >
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                  <button
                    type="button"
                    disabled={busyUid === u.id || u.id === user?.id}
                    onClick={() => void toggleActivo(u)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                      u.activo
                        ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                    )}
                  >
                    {busyUid === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : u.activo ? (
                      <UserX className="w-3.5 h-3.5" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </OperationalScreenShell>
  );
};
