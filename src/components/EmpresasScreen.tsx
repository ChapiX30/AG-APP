import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { ArrowLeft, Trash2, PlusCircle, Building2, MapPin, Pencil, X } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";

export const EmpresasScreen: React.FC = () => {
  const [empresas, setEmpresas] = useState<{ nombre: string; direccion: string; contacto: string; correo: string; telefono: string; id: string }[]>([]);
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

  const empresasFiltradas = empresas.filter((e) =>
    e.nombre.toLowerCase().includes(filtro.toLowerCase())
  );

  useEffect(() => {
    cargarEmpresas();
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-zinc-900 dark:to-zinc-800 text-gray-900 dark:text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
          >
            <ArrowLeft size={20} /> Volver
          </button>
          <h1 className="text-3xl font-bold text-center flex-1">Empresas</h1>
          <button
            onClick={() => {
              setMostrarFormulario(!mostrarFormulario);
              setModoEdicion(false);
              setEmpresaSeleccionada(null);
              setNuevaEmpresa({ nombre: "", direccion: "", contacto: "", correo: "", telefono: "" });
            }}
            className="ml-0 md:ml-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow"
          >
            <PlusCircle size={18} /> {modoEdicion ? "Cancelar Edición" : "Nueva Empresa"}
          </button>
        </div>

        <input
          type="text"
          placeholder="Buscar empresa..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="w-full mb-4 p-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800"
        />

        {mostrarFormulario && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-lg">
            {Object.entries(nuevaEmpresa).map(([key, value]) => (
              <input
                key={key}
                type="text"
                placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                value={value}
                onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, [key]: e.target.value })}
                className="border p-2 rounded-md bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            ))}
            <button
              onClick={guardarEmpresa}
              className="md:col-span-2 bg-green-600 text-white py-2 rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Building2 size={20} /> {modoEdicion ? "Actualizar Empresa" : "Guardar Empresa"}
            </button>
          </div>
        )}

        <div className="space-y-4">
          {empresasFiltradas.map((empresa) => (
            <div
              key={empresa.id}
              onClick={() => setEmpresaSeleccionada(empresa)}
              className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow flex justify-between items-center border border-zinc-300 dark:border-zinc-700 hover:scale-[1.01] transition-transform cursor-pointer"
            >
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-lg">🏢 {empresa.nombre}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">📍 {empresa.direccion}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">👤 {empresa.contacto} | 📧 {empresa.correo} | 📞 {empresa.telefono}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    iniciarEdicion(empresa);
                  }}
                  className="text-yellow-500 hover:text-yellow-600 dark:hover:text-yellow-300"
                >
                  <Pencil size={20} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    eliminarEmpresa(empresa.id);
                  }}
                  className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {empresaSeleccionada && (
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-xl w-full max-w-xl relative">
              <button
                onClick={() => setEmpresaSeleccionada(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
              >
                <X size={24} />
              </button>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-300">
                <MapPin /> Detalles de {empresaSeleccionada.nombre}
              </h2>
              <p><strong>Dirección:</strong> {empresaSeleccionada.direccion}</p>
              <p><strong>Contacto:</strong> {empresaSeleccionada.contacto}</p>
              <p><strong>Correo:</strong> {empresaSeleccionada.correo}</p>
              <p><strong>Teléfono:</strong> {empresaSeleccionada.telefono}</p>
              <div className="mt-4">
                <iframe
                  className="w-full h-64 rounded-md border border-zinc-300 dark:border-zinc-700"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(empresaSeleccionada.direccion)}&output=embed`}
                ></iframe>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
