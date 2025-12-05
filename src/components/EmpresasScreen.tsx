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
  Calendar,
  ExternalLink
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

interface EmpresaFormData {
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  requerimientos: string;
}

const INITIAL_FORM_STATE: EmpresaFormData = {
  nombre: "",
  direccion: "",
  telefono: "",
  email: "",
  contacto: "",
  requerimientos: ""
};

// --- Utilidades ---
const getGoogleMapsUrl = (address: string) => 
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

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

const InitialsAvatar = ({ name, size = "md" }: { name: string, size?: "sm" | "md" | "lg" }) => {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colorClass = getAvatarColor(name);
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-12 h-12 text-base";

  return (
    <div className={`${sizeClass} ${colorClass} rounded-xl flex items-center justify-center font-bold shadow-sm border border-white/50 shrink-0`}>
      {initials}
    </div>
  );
};

const LoadingSkeleton = ({ view }: { view: 'grid' | 'table' }) => {
  if (view === 'table') {
    return <div className="space-y-4 animate-pulse">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg w-full" />)}</div>;
  }
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="bg-gray-100 h-64 rounded-2xl" />)}</div>;
};

// --- Componente: Tarjetas (Grid) ---
const CardView = ({ empresas, handleEdit, handleDelete }: { empresas: Empresa[], handleEdit: (e: Empresa) => void, handleDelete: (id: string) => void }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {empresas.map((empresa) => (
      <div key={empresa.id} className="group bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 flex flex-col overflow-hidden">
        <div className="p-6 flex-grow relative">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-4">
              <InitialsAvatar name={empresa.nombre} />
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight line-clamp-1" title={empresa.nombre}>{empresa.nombre}</h3>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                  <Calendar className="w-3 h-3 mr-1" />{empresa.fechaCreacion.toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            {/* Dirección Clicable */}
            <a 
              href={getGoogleMapsUrl(empresa.direccion)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start text-sm text-gray-600 hover:text-blue-600 transition-colors group/address cursor-pointer p-1 -ml-1 rounded-md hover:bg-blue-50"
              title="Ver en Google Maps"
            >
              <MapPin className="h-4 w-4 mr-3 text-gray-400 mt-0.5 group-hover/address:text-blue-500 transition-colors shrink-0" />
              <span className="line-clamp-1 text-xs font-medium flex-1">{empresa.direccion}</span>
              <ExternalLink className="h-3 w-3 ml-1 opacity-0 group-hover/address:opacity-100 transition-opacity text-blue-500" />
            </a>
            
            <div className="flex items-center text-sm text-gray-600 px-1">
              <User className="h-4 w-4 mr-3 text-gray-400 shrink-0" />
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
                <p className="text-xs text-gray-600 line-clamp-2 italic">"{empresa.requerimientos}"</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
            <button onClick={() => handleEdit(empresa)} className="text-xs font-medium text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-md hover:bg-white transition-colors">Editar</button>
            <button onClick={() => handleDelete(empresa.id)} className="text-xs font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors">Eliminar</button>
        </div>
      </div>
    ))}
  </div>
);

// --- Componente: Tabla ---
const TableView = ({ empresas, handleEdit, handleDelete }: { empresas: Empresa[], handleEdit: (e: Empresa) => void, handleDelete: (id: string) => void }) => (
  <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50/50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Empresa</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Info</th>
            <th className="relative px-6 py-4"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {empresas.map((empresa) => (
            <tr key={empresa.id} className="group hover:bg-blue-50/30 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <InitialsAvatar name={empresa.nombre} size="sm" />
                    <div className="ml-4">
                      <div className="text-sm font-bold text-gray-900">{empresa.nombre}</div>
                      {/* Dirección Clicable en Tabla */}
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
                <div className="flex flex-col space-y-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 w-fit">
                    <Phone className="w-3 h-3 mr-1"/> {empresa.telefono}
                  </span>
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

// --- Componente: Estadísticas (Dashboard) ---
const DashboardStats = ({ total, recent }: { total: number, recent: number }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-500">
    <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Building2 className="h-6 w-6"/></div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase">Total Empresas</p>
        <p className="text-2xl font-bold text-gray-900">{total}</p>
      </div>
    </div>
    <div className="bg-white p-4 rounded-2xl border border-green-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="p-3 bg-green-50 rounded-xl text-green-600"><TrendingUp className="h-6 w-6"/></div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase">Nuevas (30d)</p>
        <p className="text-2xl font-bold text-gray-900">{recent}</p>
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
}

const EmpresaFormModal = ({ isOpen, onClose, onSubmit, data, setData, isEditing }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900 bg-opacity-60 backdrop-blur-sm" onClick={onClose} />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        
        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full animate-in zoom-in-95 duration-200">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{isEditing ? "Editar Empresa" : "Nueva Empresa"}</h3>
                <p className="text-sm text-gray-500 mt-1">Ingresa los detalles de la organización.</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="h-5 w-5" /></button>
            </div>
            
            <form id="empresaForm" onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nombre Comercial</label>
                  <input type="text" required value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })} 
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white" placeholder="Ej. Tech Solutions S.A." />
                </div>
                
                {[
                  { label: "Correo Electrónico", icon: Mail, type: "email", val: data.email, key: "email", ph: "contacto@empresa.com" },
                  { label: "Teléfono", icon: Phone, type: "tel", val: data.telefono, key: "telefono", ph: "+52 (81) 1234 5678" },
                  { label: "Contacto Principal", icon: User, type: "text", val: data.contacto, key: "contacto", ph: "Nombre completo" },
                  { label: "Dirección Física", icon: MapPin, type: "text", val: data.direccion, key: "direccion", ph: "Calle, Número, Colonia" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{field.label}</label>
                    <div className="relative">
                      <field.icon className="absolute top-3 left-3 h-4 w-4 text-gray-400" />
                      <input 
                        type={field.type} required 
                        value={field.val} 
                        onChange={(e) => setData({ ...data, [field.key]: e.target.value })} 
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 focus:bg-white transition-all" 
                        placeholder={field.ph} 
                      />
                    </div>
                  </div>
                ))}

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notas / Requerimientos</label>
                  <textarea value={data.requerimientos} onChange={(e) => setData({ ...data, requerimientos: e.target.value })} rows={3} 
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all" placeholder="Detalles adicionales importantes..." />
                </div>
              </div>
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

// --- Componente Principal ---
const EmpresasScreen = () => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [formData, setFormData] = useState<EmpresaFormData>(INITIAL_FORM_STATE);

  const [view, setView] = useState<'grid' | 'table'>('grid');
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
      toast.error("No se pudieron cargar las empresas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEmpresas(); }, []);

  const filteredEmpresas = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return empresas.filter(e => 
      (e.nombre?.toLowerCase().includes(term)) || (e.contacto?.toLowerCase().includes(term))
    );
  }, [empresas, searchTerm]);

  const sortedEmpresas = useMemo(() => {
    return [...filteredEmpresas].sort((a, b) => {
      const nameA = a.nombre || "";
      const nameB = b.nombre || "";
      return sortAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
  }, [filteredEmpresas, sortAsc]);

  const stats = useMemo(() => {
    const total = empresas.length;
    const recent = empresas.filter(e => (new Date().getTime() - e.fechaCreacion.getTime()) / (1000 * 3600 * 24) < 30).length;
    return { total, recent };
  }, [empresas]);

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
      setFormData(INITIAL_FORM_STATE);
      loadEmpresas();
    } catch (error) { console.error(error); }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro que deseas eliminar esta empresa?")) {
      const deletePromise = deleteDoc(doc(db, "clientes", id));
      toast.promise(deletePromise, { loading: 'Eliminando...', success: 'Empresa eliminada.', error: 'Error al eliminar.' });
      try { await deletePromise; loadEmpresas(); } catch (error) { console.error(error); }
    }
  };

  const openModal = (empresa?: Empresa) => {
    if (empresa) {
      setEditingEmpresa(empresa);
      setFormData({
        nombre: empresa.nombre, direccion: empresa.direccion, telefono: empresa.telefono,
        email: empresa.email, contacto: empresa.contacto, requerimientos: empresa.requerimientos || ""
      });
    } else {
      setEditingEmpresa(null);
      setFormData(INITIAL_FORM_STATE);
    }
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900 selection:bg-blue-100">
      <Toaster position="bottom-center" toastOptions={{ style: { borderRadius: '12px', background: '#1f2937', color: '#fff', fontSize: '14px' } }} />
      
      {/* Navbar */}
      <div className="bg-white/80 border-b border-gray-200 sticky top-0 z-20 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button onClick={goBack} className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"><ArrowLeft className="h-5 w-5" /></button>
              <h1 className="text-xl font-bold text-gray-800 tracking-tight">Directorio de Clientes</h1>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center bg-gray-100 rounded-lg p-1">
                 <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-all ${view === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid className="h-4 w-4"/></button>
                 <button onClick={() => setView('table')} className={`p-1.5 rounded-md transition-all ${view === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><List className="h-4 w-4"/></button>
              </div>
              <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block"></div>
              <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center transition-all shadow-md hover:shadow-lg active:scale-95 text-sm font-medium">
                <Plus className="h-5 w-5 mr-1.5" /> Nueva Empresa
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 space-y-6">
            <DashboardStats total={stats.total} recent={stats.recent} />

            {/* Controles de Búsqueda */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder="Buscar por nombre o contacto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="flex items-center px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all w-full md:w-auto justify-center"
                >
                    {sortAsc ? <ArrowDownAZ className="h-4 w-4 mr-2 text-gray-500" /> : <ArrowUpZA className="h-4 w-4 mr-2 text-gray-500" />}
                    {sortAsc ? "A - Z" : "Z - A"}
                </button>
            </div>
        </div>

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

      <EmpresaFormModal 
        isOpen={showModal} 
        onClose={() => setShowModal(false)} 
        onSubmit={handleSubmit} 
        data={formData} 
        setData={setFormData} 
        isEditing={!!editingEmpresa} 
      />
    </div>
  );
};

export default EmpresasScreen;