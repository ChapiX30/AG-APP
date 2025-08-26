import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { ArrowLeft, PlusCircle, Building2, MapPin, Pencil, Trash2, X, MoreVertical, Mail, Phone, User } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import labLogo from '../assets/lab_logo.png';

// ANIMACIÓN DE LOGO: 
// Asegúrate de tener tu logo en /assets/lab_logo.png
const AnimatedLogo = () => (
  <div className="flex items-center justify-center mr-3 animate__animated animate__pulse animate__infinite">
    <img
      src="/assets/lab_logo.png"
      alt="Lab Logo"
      className="w-10 h-10 drop-shadow-lg rounded-full border-2 border-blue-500 shadow-blue-300 animate-glow"
      style={{ filter: "drop-shadow(0 0 12px #3b82f6)" }}
    />
  </div>
);

export const EmpresasScreen: React.FC = () => {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [nuevaEmpresa, setNuevaEmpresa] = useState({ nombre: "", direccion: "", contacto: "", correo: "", telefono: "" });
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<any>(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [filtro, setFiltro] = useState("");
  const { goBack } = useNavigation();

  const cargarEmpresas = async () => {
    const querySnapshot = await getDocs(collection(db, "clientes"));
    const docs = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];
    setEmpresas(docs);
  };

  const guardarEmpresa = async () => {
    if (!nuevaEmpresa.nombre.trim()) return alert("El nombre de la empresa es obligatorio");
    if (modoEdicion && empresaSeleccionada) {
      const empresaRef = doc(db, "clientes", empresaSeleccionada.id);
      await updateDoc(empresaRef, nuevaEmpresa);
      setModoEdicion(false);
      setEmpresaSeleccionada(null);
    } else {
      await addDoc(collection(db, "clientes"), nuevaEmpresa);
    }
    setNuevaEmpresa({ nombre: "", direccion: "", contacto: "", correo: "", telefono: "" });
    setMostrarFormulario(false);
    cargarEmpresas();
  };

  const eliminarEmpresa = async (id: string) => {
    await deleteDoc(doc(db, "clientes", id));
    setEmpresaSeleccionada(null);
    cargarEmpresas();
  };

  const iniciarEdicion = (empresa: any) => {
    setNuevaEmpresa({
      nombre: empresa.nombre,
      direccion: empresa.direccion,
      contacto: empresa.contacto,
      correo: empresa.correo,
      telefono: empresa.telefono,
    });
    setEmpresaSeleccionada(empresa);
    setModoEdicion(true);
    setMostrarFormulario(true);
  };

  const empresasFiltradas = empresas
    .filter((e) => e.nombre.toLowerCase().includes(filtro.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  useEffect(() => {
    cargarEmpresas();
  }, []);

  // Animación custom de glow
  // Agrégalo en tu tailwind.config.js para que la clase animate-glow funcione
  // plugins: [require("tailwindcss-animate")]
  // o simplemente déjalo así con style inline

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-300 dark:from-zinc-900 dark:to-zinc-800 text-gray-900 dark:text-white pb-8">
      {/* HEADER sticky */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/90 backdrop-blur-md shadow-sm border-b border-zinc-200 dark:border-zinc-700 flex items-center px-4 md:px-10 py-3 md:py-4 mb-2">
        <button onClick={goBack} className="mr-2 p-2 rounded-full hover:bg-blue-100 dark:hover:bg-zinc-800">
          <ArrowLeft size={22} className="text-blue-700 dark:text-blue-400" />
        </button>
        <AnimatedLogo />
        <h1 className="flex-1 text-xl md:text-2xl font-extrabold tracking-tight text-center drop-shadow-sm select-none">
          Directorio de Empresas
        </h1>
        <button
          onClick={() => {
            setMostrarFormulario(!mostrarFormulario);
            setModoEdicion(false);
            setEmpresaSeleccionada(null);
            setNuevaEmpresa({ nombre: "", direccion: "", contacto: "", correo: "", telefono: "" });
          }}
          className="ml-2 md:ml-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow transition-all"
        >
          <PlusCircle size={20} /> <span className="hidden md:inline">{modoEdicion ? "Cancelar Edición" : "Nueva Empresa"}</span>
        </button>
      </header>

      {/* BUSCADOR */}
      <div className="max-w-4xl mx-auto mb-4 px-2 md:px-0">
        <div className="relative flex items-center">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">
            <Building2 size={20} />
          </span>
          <input
            type="text"
            placeholder="Buscar empresa por nombre..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl border-none shadow-xl bg-white/60 dark:bg-zinc-900/70 ring-1 ring-zinc-200 dark:ring-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-400 text-lg transition-all"
          />
        </div>
      </div>

      {/* FORMULARIO */}
      {mostrarFormulario && (
        <div className="max-w-2xl mx-auto bg-white/80 dark:bg-zinc-900/90 shadow-2xl rounded-2xl px-6 py-8 mb-8 animate-fade-in border border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Campos con iconos */}
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-zinc-600 dark:text-zinc-300">Nombre</label>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3">
                <Building2 className="mr-2 text-blue-500" />
                <input
                  type="text"
                  placeholder="Nombre"
                  value={nuevaEmpresa.nombre}
                  onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, nombre: e.target.value })}
                  className="flex-1 bg-transparent py-2 outline-none text-base"
                  maxLength={60}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-zinc-600 dark:text-zinc-300">Dirección</label>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3">
                <MapPin className="mr-2 text-emerald-500" />
                <input
                  type="text"
                  placeholder="Dirección"
                  value={nuevaEmpresa.direccion}
                  onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, direccion: e.target.value })}
                  className="flex-1 bg-transparent py-2 outline-none text-base"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-zinc-600 dark:text-zinc-300">Contacto</label>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3">
                <User className="mr-2 text-amber-600" />
                <input
                  type="text"
                  placeholder="Contacto"
                  value={nuevaEmpresa.contacto}
                  onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, contacto: e.target.value })}
                  className="flex-1 bg-transparent py-2 outline-none text-base"
                  maxLength={40}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-semibold text-zinc-600 dark:text-zinc-300">Correo</label>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3">
                <Mail className="mr-2 text-sky-600" />
                <input
                  type="email"
                  placeholder="Correo"
                  value={nuevaEmpresa.correo}
                  onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, correo: e.target.value })}
                  className="flex-1 bg-transparent py-2 outline-none text-base"
                  maxLength={60}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-semibold text-zinc-600 dark:text-zinc-300">Teléfono</label>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3">
                <Phone className="mr-2 text-lime-600" />
                <input
                  type="tel"
                  placeholder="Teléfono"
                  value={nuevaEmpresa.telefono}
                  onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, telefono: e.target.value })}
                  className="flex-1 bg-transparent py-2 outline-none text-base"
                  maxLength={18}
                />
              </div>
            </div>
          </div>
          <button
            onClick={guardarEmpresa}
            className="mt-8 w-full md:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 text-white rounded-xl font-semibold text-lg shadow-lg transition-all flex items-center gap-2 justify-center mx-auto"
          >
            <Building2 size={24} /> {modoEdicion ? "Actualizar Empresa" : "Guardar Empresa"}
          </button>
        </div>
      )}

      {/* DIRECTORIO de empresas en cards */}
      <div className="max-w-5xl mx-auto px-2 md:px-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {empresasFiltradas.length === 0 && (
          <div className="col-span-full text-center py-12 text-zinc-500 text-lg">No se encontraron empresas...</div>
        )}
        {empresasFiltradas.map((empresa) => (
          <div
            key={empresa.id}
            className="group relative bg-white/90 dark:bg-zinc-900/90 border border-zinc-100 dark:border-zinc-800 shadow-lg rounded-2xl p-6 flex flex-col gap-3 transition-transform hover:-translate-y-1 hover:shadow-2xl cursor-pointer"
            onClick={() => setEmpresaSeleccionada(empresa)}
          >
            <div className="flex items-center gap-3 mb-2">
              <img src="/assets/lab_logo.png" alt="" className="w-10 h-10 rounded-full border-2 border-blue-400 shadow" />
              <span className="text-lg font-bold text-blue-800 dark:text-blue-300">{empresa.nombre}</span>
              <div
                onClick={(e) => e.stopPropagation()}
                className="ml-auto opacity-70 group-hover:opacity-100 transition"
              >
                <div className="relative inline-block text-left">
                  <button
                    className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 p-1 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      const menu = document.getElementById(`menu-${empresa.id}`);
                      if (menu) menu.classList.toggle("hidden");
                    }}
                  >
                    <MoreVertical size={20} />
                  </button>
                  <div
                    id={`menu-${empresa.id}`}
                    className="hidden absolute right-0 mt-2 w-36 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-50"
                  >
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        iniciarEdicion(empresa);
                        document.getElementById(`menu-${empresa.id}`)?.classList.add("hidden");
                      }}
                    >
                      <Pencil size={16} className="inline mr-2" /> Editar
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarEmpresa(empresa.id);
                        document.getElementById(`menu-${empresa.id}`)?.classList.add("hidden");
                      }}
                    >
                      <Trash2 size={16} className="inline mr-2" /> Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300"><MapPin size={16} /> {empresa.direccion || <span className="italic text-zinc-400">Sin dirección</span>}</span>
              <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300"><User size={16} /> {empresa.contacto || <span className="italic text-zinc-400">Sin contacto</span>}</span>
              <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300"><Mail size={16} /> {empresa.correo || <span className="italic text-zinc-400">Sin correo</span>}</span>
              <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300"><Phone size={16} /> {empresa.telefono || <span className="italic text-zinc-400">Sin teléfono</span>}</span>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL de detalles */}
      {empresaSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-40 dark:bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-2xl w-full max-w-2xl relative flex flex-col md:flex-row gap-8 border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setEmpresaSeleccionada(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
            >
              <X size={26} />
            </button>
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <img src="/assets/lab_logo.png" alt="" className="w-14 h-14 rounded-full border-2 border-blue-400 shadow" />
                <h2 className="text-2xl font-bold text-blue-700 dark:text-blue-300">{empresaSeleccionada.nombre}</h2>
              </div>
              <p className="flex items-center gap-2 text-lg text-zinc-700 dark:text-zinc-200">
                <MapPin size={18} className="text-emerald-500" />
                {empresaSeleccionada.direccion || <span className="italic text-zinc-400">Sin dirección</span>}
              </p>
              <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                <User size={18} className="text-amber-500" />
                <span className="font-semibold">{empresaSeleccionada.contacto || <span className="italic text-zinc-400">Sin contacto</span>}</span>
              </p>
              <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                <Mail size={18} className="text-sky-500" />
                <span>{empresaSeleccionada.correo || <span className="italic text-zinc-400">Sin correo</span>}</span>
              </p>
              <p className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                <Phone size={18} className="text-lime-600" />
                <span>{empresaSeleccionada.telefono || <span className="italic text-zinc-400">Sin teléfono</span>}</span>
              </p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center">
              <iframe
                className="w-full h-60 rounded-2xl border border-zinc-300 dark:border-zinc-700"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(empresaSeleccionada.direccion)}&output=embed`}
              ></iframe>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 8px #3b82f6, 0 0 16px #3b82f6; }
          50% { box-shadow: 0 0 16px #3b82f6, 0 0 32px #60a5fa; }
        }
        .animate-glow { animation: glow 2s ease-in-out infinite; }
        .animate-fade-in { animation: fadeIn 0.4s ease; }
        @keyframes fadeIn {
          0% { opacity: 0; transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1);}
        }
      `}</style>
    </div>
  );
};
