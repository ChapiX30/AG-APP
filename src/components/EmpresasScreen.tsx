import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../utils/firebase";
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
  Users,
  Calendar
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import toast, { Toaster } from 'react-hot-toast';

// --- Tipos ---
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

// --- Utilidades de UI ---
// Genera un color de fondo consistente basado en el nombre
const getAvatarColor = (name: string) => {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-yellow-100 text-yellow-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const InitialsAvatar = ({ name, size = "md" }: { name: string, size?: "sm" | "md" | "lg" }) => {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  
  const colorClass = getAvatarColor(name);
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-12 h-12 text-base";

  return (
    <div className={`${sizeClass} ${colorClass} rounded-xl flex items-center justify-center font-bold shadow-sm border border-white/50`}>
      {initials}
    </div>
  );
};

// --- Componente Skeleton (Carga) ---
const LoadingSkeleton = ({ view }: { view: 'grid' | 'table' }) => {
  if (view === 'table') {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-gray-100 h-64 rounded-2xl" />
      ))}
    </div>
  );
};

// --- Vista de Tarjetas (Grid) Mejorada ---
const CardView = ({ empresas, handleEdit, handleDelete }: { empresas: Empresa[], handleEdit: (empresa: Empresa) => void, handleDelete: (id: string) => void }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {empresas.map((empresa) => (
      <div
        key={empresa.id}
        className="group bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-100 transition-all duration-300 flex flex-col overflow-hidden"
      >
        <div className="p-6 flex-grow relative">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-4">
              <InitialsAvatar name={empresa.nombre} />
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-1" title={empresa.nombre}>
                  {empresa.nombre}
                </h3>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                  <Calendar className="w-3 h-3 mr-1" />
                  {empresa.fechaCreacion.toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            <div className="flex items-start text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
              <MapPin className="h-4 w-4 mr-3 text-gray-400 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-1 text-xs font-medium">{empresa.direccion}</span>
            </div>
            
            <div className="flex items-center text-sm text-gray-600">
              <User className="h-4 w-4 mr-3 text-gray-400" />
              <span className="text-xs">{empresa.contacto}</span>
            </div>

            <div className="flex gap-2 mt-2 pt-3 border-t border-gray-50">
               <a href={`mailto:${empresa.email}`} className="flex-1 flex items-center justify-center py-1.5 px-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                 <Mail className="w-3 h-3 mr-1.5" /> Email
               </a>
               <a href={`tel:${empresa.telefono}`} className="flex-1 flex items-center justify-center py-1.5 px-3 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors">
                 <Phone className="w-3 h-3 mr-1.5" /> Llamar
               </a>
            </div>

            {empresa.requerimientos && (
              <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="flex items-center text-xs font-semibold text-gray-500 mb-1">
                  <FileText className="w-3 h-3 mr-1" /> Notas
                </div>
                <p className="text-xs text-gray-600 line-clamp-2 italic">
                  "{empresa.requerimientos}"
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Acciones flotantes en hover para desktop, fijas en mobile */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
            <button onClick={() => handleEdit(empresa)} className="text-xs font-medium text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-md hover:bg-white transition-colors">Editar</button>
            <button onClick={() => handleDelete(empresa.id)} className="text-xs font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors">Eliminar</button>
        </div>
      </div>
    ))}
  </div>
);

// --- Vista de Tabla Mejorada ---
const TableView = ({ empresas, handleEdit, handleDelete }: { empresas: Empresa[], handleEdit: (empresa: Empresa) => void, handleDelete: (id: string) => void }) => (
  <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50/50">
          <tr>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
            <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado / Info</th>
            <th scope="col" className="relative px-6 py-4"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {empresas.map((empresa) => (
            <tr key={empresa.id} className="group hover:bg-blue-50/30 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <InitialsAvatar name={empresa.nombre} size="sm" />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-bold text-gray-900">{empresa.nombre}</div>
                      <div className="text-xs text-gray-500 flex items-center mt-0.5"><MapPin className="w-3 h-3 mr-1"/> {empresa.direccion}</div>
                    </div>
                  </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 font-medium">{empresa.contacto}</div>
                <div className="text-xs text-gray-500">{empresa.email}</div>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col space-y-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 w-fit">
                    <Phone className="w-3 h-3 mr-1"/> {empresa.telefono}
                  </span>
                  {empresa.requerimientos && (
                    <span className="text-xs text-gray-500 truncate max-w-[200px]">
                      Nota: {empresa.requerimientos}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(empresa)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(empresa.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Componente Principal ---
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

  const [view, setView] = useState<'grid' | 'table'>('grid');
  const { goBack } = useNavigation();

  // Cargar datos
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
      toast.error("No se pudieron cargar las empresas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmpresas();
  }, []);

  // Filtrado y Ordenamiento
  const filteredEmpresas = useMemo(() => {
    return empresas.filter(empresa =>
      ((empresa.nombre || "").toLowerCase().includes(searchTerm.toLowerCase())) ||
      ((empresa.contacto || "").toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [empresas, searchTerm]);

  const sortedEmpresas = useMemo(() => {
    return [...filteredEmpresas].sort((a, b) =>
      sortAsc
        ? (a.nombre || "").localeCompare(b.nombre || "")
        : (b.nombre || "").localeCompare(a.nombre || "")
    );
  }, [filteredEmpresas, sortAsc]);

  // Stats para el Dashboard
  const stats = useMemo(() => {
    const total = empresas.length;
    const recent = empresas.filter(e => {
        const now = new Date();
        const daysDiff = (now.getTime() - e.fechaCreacion.getTime()) / (1000 * 3600 * 24);
        return daysDiff < 30; // Nuevos en los últimos 30 días
    }).length;
    return { total, recent };
  }, [empresas]);

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const actionPromise = editingEmpresa
      ? updateDoc(doc(db, "clientes", editingEmpresa.id), { ...formData, fechaActualizacion: new Date() })
      : addDoc(collection(db, "clientes"), { ...formData, fechaCreacion: new Date() });

    toast.promise(actionPromise, {
      loading: 'Procesando...',
      success: `Empresa ${editingEmpresa ? 'actualizada' : 'creada'} correctamente.`,
      error: 'Ocurrió un error.',
    });

    try {
      await actionPromise;
      setShowModal(false);
      setEditingEmpresa(null);
      setFormData({ nombre: "", direccion: "", telefono: "", email: "", contacto: "", requerimientos: "" });
      loadEmpresas();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro que deseas eliminar esta empresa?")) {
      const deletePromise = deleteDoc(doc(db, "clientes", id));
      toast.promise(deletePromise, {
        loading: 'Eliminando...',
        success: 'Empresa eliminada.',
        error: 'No se pudo eliminar.',
      });
      try { await deletePromise; loadEmpresas(); } catch (error) { console.error(error); }
    }
  };

  const openModal = (empresa?: Empresa) => {
    if (empresa) {
      setEditingEmpresa(empresa);
      setFormData({
        nombre: empresa.nombre,
        direccion: empresa.direccion,
        telefono: empresa.telefono,
        email: empresa.email,
        contacto: empresa.contacto,
        requerimientos: empresa.requerimientos || ""
      });
    } else {
      setEditingEmpresa(null);
      setFormData({ nombre: "", direccion: "", telefono: "", email: "", contacto: "", requerimientos: "" });
    }
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900">
      <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />
      
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm bg-opacity-90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button onClick={goBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-800 tracking-tight">Directorio de Clientes</h1>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Toggler */}
              <div className="hidden md:flex items-center bg-gray-100 rounded-lg p-1">
                 <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid className="h-4 w-4"/></button>
                 <button onClick={() => setView('table')} className={`p-1.5 rounded-md transition-all ${view === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><List className="h-4 w-4"/></button>
              </div>
              <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>
              <button
                onClick={() => openModal()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center transition-all shadow-md hover:shadow-lg transform active:scale-95 text-sm font-medium"
              >
                <Plus className="h-5 w-5 mr-1.5" />
                Nueva Empresa
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Stats & Search Area */}
        <div className="mb-8 space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Building2 className="h-6 w-6"/></div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase">Total Empresas</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-green-100 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-green-50 rounded-xl text-green-600"><TrendingUp className="h-6 w-6"/></div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase">Nuevas (30d)</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.recent}</p>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out shadow-sm"
                        placeholder="Buscar por nombre o contacto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="flex items-center px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors w-full md:w-auto justify-center"
                >
                    {sortAsc ? <ArrowDownAZ className="h-4 w-4 mr-2 text-gray-500" /> : <ArrowUpZA className="h-4 w-4 mr-2 text-gray-500" />}
                    {sortAsc ? "A - Z" : "Z - A"}
                </button>
            </div>
        </div>

        {/* Main Content */}
        {loading ? (
          <LoadingSkeleton view={view} />
        ) : (
          <>
            {sortedEmpresas.length > 0 ? (
                <div className="animate-in fade-in duration-500 slide-in-from-bottom-4">
                    {view === 'grid' 
                    ? <CardView empresas={sortedEmpresas} handleEdit={openModal} handleDelete={handleDelete} /> 
                    : <TableView empresas={sortedEmpresas} handleEdit={openModal} handleDelete={handleDelete} />
                    }
                </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-10 w-10 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No se encontraron resultados</h3>
                <p className="mt-1 text-gray-500 max-w-sm mx-auto">
                  {searchTerm ? "Intenta ajustar los términos de búsqueda." : "Comienza agregando tu primera empresa al directorio."}
                </p>
                {!searchTerm && (
                     <button onClick={() => openModal()} className="mt-6 text-blue-600 font-medium hover:underline">Agregar ahora</button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Mejorado */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-900 bg-opacity-60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            
            <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">
                            {editingEmpresa ? "Editar Empresa" : "Nueva Empresa"}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Ingresa los detalles de la organización.</p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="h-5 w-5" /></button>
                </div>
                
                <form onSubmit={handleSubmit} id="empresaForm" className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="col-span-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nombre Comercial</label>
                        <input type="text" required value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} 
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white" placeholder="Ej. Tech Solutions S.A." />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Correo Electrónico</label>
                        <div className="relative">
                            <Mail className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                            <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white" placeholder="contacto@empresa.com" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Teléfono</label>
                        <div className="relative">
                            <Phone className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                            <input type="tel" required value={formData.telefono} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} 
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white" placeholder="+52 (81) 1234 5678" />
                        </div>
                    </div>

                    <div>
                         <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Contacto Principal</label>
                         <div className="relative">
                            <User className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                            <input type="text" required value={formData.contacto} onChange={(e) => setFormData({ ...formData, contacto: e.target.value })} 
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white" placeholder="Nombre completo" />
                         </div>
                    </div>

                    <div>
                         <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Dirección Física</label>
                         <div className="relative">
                            <MapPin className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                            <input type="text" required value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} 
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white" placeholder="Calle, Número, Colonia" />
                         </div>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notas / Requerimientos</label>
                        <textarea value={formData.requerimientos} onChange={(e) => setFormData({ ...formData, requerimientos: e.target.value })} rows={3} 
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-gray-50 focus:bg-white" placeholder="Detalles adicionales importantes..." />
                    </div>
                  </div>
                </form>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-100 gap-2">
                <button form="empresaForm" type="submit" className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm transition-colors">
                  {editingEmpresa ? "Guardar Cambios" : "Crear Empresa"}
                </button>
                <button onClick={() => setShowModal(false)} type="button" className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmpresasScreen;