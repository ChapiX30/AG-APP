import React, { useEffect, useState } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  ArrowLeft,
  PlusCircle,
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
  ArrowUpZA
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import labLogo from '../assets/lab_logo.png';

const AnimatedLogo = () => (
  <div className="flex items-center justify-center mb-6">
    <div className="animate-pulse">
      <img src={labLogo} alt="Lab Logo" className="h-12 w-12 mr-3" />
    </div>
    <h1 className="text-2xl font-bold text-gray-800">Gestión de Empresas</h1>
  </div>
);

interface Empresa {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  requerimientos: string;
  fechaCreacion: Date;
}

const EmpresasScreen = () => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    email: "",
    contacto: "",
    requerimientos: ""
  });

  const { goBack } = useNavigation();

  const loadEmpresas = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, "clientes"));
      const empresasData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fechaCreacion: doc.data().fechaCreacion?.toDate() || new Date()
      })) as Empresa[];
      setEmpresas(empresasData);
    } catch (error) {
      console.error("Error loading empresas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmpresas();
  }, []);

  const filteredEmpresas = empresas.filter(empresa =>
    ((empresa.nombre || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
    ((empresa.email || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
    ((empresa.requerimientos || "").toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedEmpresas = [...filteredEmpresas].sort((a, b) =>
    sortAsc
      ? (a.nombre || "").localeCompare(b.nombre || "")
      : (b.nombre || "").localeCompare(a.nombre || "")
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmpresa) {
        await updateDoc(doc(db, "clientes", editingEmpresa.id), {
          ...formData,
          fechaActualizacion: new Date()
        });
      } else {
        await addDoc(collection(db, "clientes"), {
          ...formData,
          fechaCreacion: new Date()
        });
      }

      setFormData({
        nombre: "",
        direccion: "",
        telefono: "",
        email: "",
        contacto: "",
        requerimientos: ""
      });
      setShowModal(false);
      setEditingEmpresa(null);
      loadEmpresas();
    } catch (error) {
      console.error("Error saving empresa:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro que deseas eliminar esta empresa?")) {
      try {
        await deleteDoc(doc(db, "empresas", id));
        loadEmpresas();
      } catch (error) {
        console.error("Error deleting empresa:", error);
      }
    }
  };

  const handleEdit = (empresa: Empresa) => {
    setEditingEmpresa(empresa);
    setFormData({
      nombre: empresa.nombre,
      direccion: empresa.direccion,
      telefono: empresa.telefono,
      email: empresa.email,
      contacto: empresa.contacto,
      requerimientos: empresa.requerimientos || ""
    });
    setShowModal(true);
  };

  const handleNewEmpresa = () => {
    setEditingEmpresa(null);
    setFormData({
      nombre: "",
      direccion: "",
      telefono: "",
      email: "",
      contacto: "",
      requerimientos: ""
    });
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <button
                onClick={goBack}
                className="mr-4 p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <AnimatedLogo />
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSortAsc((asc) => !asc)}
                className="px-3 py-2 bg-gray-100 hover:bg-blue-100 text-blue-600 rounded transition"
                title="Ordenar alfabéticamente"
              >
                {sortAsc ? <ArrowDownAZ className="inline h-5 w-5" /> : <ArrowUpZA className="inline h-5 w-5" />}
              </button>
              <button
                onClick={handleNewEmpresa}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors shadow-sm"
              >
                <PlusCircle className="h-5 w-5 mr-2" />
                Nueva Empresa
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar empresas por nombre, email o requerimientos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-gray-700 placeholder-gray-400 transition-colors duration-200 ease-in-out"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedEmpresas.map((empresa) => (
              <div
                key={empresa.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200"
              >
                <div className="p-6 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center w-0 flex-1 min-w-0">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Building2 className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="ml-3 min-w-0 w-0 flex-1">
                        <h3
                          className="text-lg font-semibold text-gray-900 line-clamp-2 break-words"
                          title={empresa.nombre}
                        >
                          {empresa.nombre}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {empresa.fechaCreacion.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => handleEdit(empresa)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(empresa.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600 overflow-hidden text-ellipsis w-full">
                      <MapPin className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                      <span className="truncate w-full" title={empresa.direccion}>{empresa.direccion}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Mail className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="truncate w-full" title={empresa.email}>{empresa.email}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Phone className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{empresa.telefono}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <User className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="truncate w-full" title={empresa.contacto}>{empresa.contacto}</span>
                    </div>
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-start text-sm text-gray-600">
                        <FileText className="h-4 w-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-gray-700 block mb-1">Requerimientos:</span>
                          <p className="text-gray-600 text-xs leading-relaxed break-words line-clamp-3">
                            {empresa.requerimientos || "No especificados"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && sortedEmpresas.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay empresas</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm
                ? "No se encontraron empresas con ese criterio de búsqueda"
                : "Comienza agregando una nueva empresa"}
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingEmpresa ? "Editar Empresa" : "Nueva Empresa"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre de la Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Ingresa el nombre"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="empresa@ejemplo.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contacto Principal *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.contacto}
                    onChange={(e) => setFormData({ ...formData, contacto: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dirección *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Dirección completa"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Requerimientos
                  </label>
                  <textarea
                    value={formData.requerimientos}
                    onChange={(e) => setFormData({ ...formData, requerimientos: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    placeholder="Describe los requerimientos específicos de esta empresa..."
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {editingEmpresa ? "Actualizar" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmpresasScreen;
