import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Loader2,
  Search,
  ShieldCheck,
  UserPlus,
  UserX,
  UserCheck,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import clsx from "clsx";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import {
  AG_BRAND_BLUE,
  OPERATIONAL_SCREEN_BG,
  OperationalScreenHeader,
  OperationalScreenShell,
} from "./ui/OperationalScreenShell";
import { db, storage } from "../utils/firebase";
import {
  adminCrearUsuario,
  adminSetUsuarioActivo,
  adminUsuariosErrorMessage,
} from "../utils/adminUsuariosApi";
import { filterVisibleUsers } from "../utils/hiddenUsers";

const SUPER_ADMINS = [
  "jesus.sustaita@agsolutions.com",
  "admin@agsolutions.com",
  "mgaese08@gmail.com",
];

const PUESTOS = ["Metrólogo", "Calidad", "Logistica", "Administrativo", "Gerente"] as const;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

type UsuarioRow = {
  id: string;
  name: string;
  email: string;
  puesto: string;
  activo: boolean;
  photoUrl?: string;
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

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
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
  const [photoBusyUid, setPhotoBusyUid] = useState<string | null>(null);
  const [photoTargetUid, setPhotoTargetUid] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, "usuarios"),
      (snap) => {
        const rows: UsuarioRow[] = filterVisibleUsers(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: String(data.nombre || data.name || "").trim() || "Sin nombre",
              email: String(data.email || data.correo || "").trim().toLowerCase(),
              puesto: String(data.puesto || data.role || "").trim(),
              activo: data.activo !== false,
              photoUrl: String(data.photoUrl || data.photoURL || "").trim() || undefined,
            };
          }),
        );
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

  const openPhotoPicker = (uid: string) => {
    setPhotoTargetUid(uid);
    requestAnimationFrame(() => photoInputRef.current?.click());
  };

  const handlePhotoSelected = async (file: File | undefined) => {
    const targetUid = photoTargetUid;
    setPhotoTargetUid(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (!file || !targetUid) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Elige una imagen (JPG, PNG, etc.).");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      toast.error("La foto debe pesar menos de 5 MB.");
      return;
    }

    setPhotoBusyUid(targetUid);
    try {
      const path = `usuarios_fotos/${targetUid}.jpg`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      await setDoc(
        doc(db, "usuarios", targetUid),
        {
          photoUrl: url,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast.success("Foto de perfil actualizada.");
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "storage/unauthorized") {
        toast.error(
          "Sin permiso en Storage. Despliega las reglas: firebase deploy --only storage",
        );
      } else {
        toast.error(
          err instanceof Error ? err.message : "No se pudo actualizar la foto.",
        );
      }
    } finally {
      setPhotoBusyUid(null);
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
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handlePhotoSelected(e.target.files?.[0])}
      />
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
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-slate-800">Usuarios del sistema</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Toca la foto o el botón de cámara para asignar la imagen de esa persona.
              </p>
            </div>
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
                <li key={u.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    title={`Cambiar foto de ${u.name}`}
                    disabled={photoBusyUid === u.id}
                    onClick={() => openPhotoPicker(u.id)}
                    className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group disabled:opacity-60"
                  >
                    {u.photoUrl ? (
                      <img src={u.photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: AG_BRAND_BLUE }}
                      >
                        {initialsFromName(u.name)}
                      </span>
                    )}
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {photoBusyUid === u.id ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 text-white" />
                      )}
                    </span>
                  </button>
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
                    disabled={photoBusyUid === u.id}
                    onClick={() => openPhotoPicker(u.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    {photoBusyUid === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    Foto
                  </button>
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
