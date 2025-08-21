import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import { ArrowLeft, PlusCircle, Building2, MapPin, Pencil, Trash2, X, MoreVertical } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";

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

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-zinc-900 dark:to-zinc-800 text-gray-900 dark:text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <button onClick={goBack} className="flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
            <ArrowLeft size={20} /> Volver
          </button>
          <h1 className="text-3xl font-bold text-center flex-1">Directorio de Empresas</h1>
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
          placeholder="Buscar empresa por nombre..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="w-full p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shadow-sm"
        />

        {mostrarFormulario && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-lg">
            {Object.entries(nuevaEmpresa).map(([key, value]) => (
              <input
                key={key}
                type="text"
                placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                value={value}
                onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, [key]: e.target.value })}
                className="border p-3 rounded-md bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            ))}
            <button
              onClick={guardarEmpresa}
              className="md:col-span-2 bg-green-600 text-white py-3 rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Building2 size={20} /> {modoEdicion ? "Actualizar Empresa" : "Guardar Empresa"}
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl shadow border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">Empresa</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">Dirección</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">Contacto</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">Correo</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">Teléfono</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
              {empresasFiltradas.map((empresa) => (
                <tr key={empresa.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer group" onClick={() => setEmpresaSeleccionada(empresa)}>
                  <td className="px-4 py-3 text-sm font-medium text-blue-700 dark:text-blue-400 relative">
                    {empresa.nombre}
                    <div onClick={(e) => e.stopPropagation()} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition">
                      <div className="relative inline-block text-left">
                        <button
                          className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            const menu = document.getElementById(`menu-${empresa.id}`);
                            if (menu) menu.classList.toggle("hidden");
                          }}
                        >
                          <MoreVertical size={18} />
                        </button>
                        <div
                          id={`menu-${empresa.id}`}
                          className="hidden absolute right-0 mt-2 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg z-50"
                        >
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              iniciarEdicion(empresa);
                              document.getElementById(`menu-${empresa.id}`)?.classList.add("hidden");
                            }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              eliminarEmpresa(empresa.id);
                              document.getElementById(`menu-${empresa.id}`)?.classList.add("hidden");
                            }}
                          >
                            🗑️ Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{empresa.direccion}</td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{empresa.contacto}</td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{empresa.correo}</td>
                  <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{empresa.telefono}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
