import React from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { 
  Calendar, 
  Hash, 
  Building2, 
  FileText, 
  ClipboardList, 
  BookOpen, 
  Settings,
  LogOut,
  User,
  Database,
  FolderKanban
} from 'lucide-react';

const menuItems = [
  { id: 'calendario', title: 'CALENDARIO', icon: Calendar, color: 'bg-blue-500', available: true },
  { id: 'consecutivos', title: 'CONSECUTIVOS', icon: Hash, color: 'bg-green-500', available: true },
  { id: 'empresas', title: 'EMPRESAS', icon: Building2, color: 'bg-indigo-500', available: true },
  { id: 'hojas-trabajo', title: 'HOJAS DE TRABAJO', icon: FileText, color: 'bg-orange-500', available: false },
  { id: 'hoja-servicio', title: 'HOJA DE SERVICIO', icon: ClipboardList, color: 'bg-purple-500', available: true },
  { id: 'normas', title: 'NORMAS', icon: BookOpen, color: 'bg-teal-500', available: true },
  { id: 'friday', title: 'FRIDAY', icon: Database, color: 'bg-emerald-500', available: true },
  { id: 'drive', title: 'DRIVE', icon: FolderKanban, color: 'bg-yellow-500', available: true },
  { id: 'procedimientos', title: 'PROCEDIMIENTOS', icon: Settings, color: 'bg-cyan-500', available: false },
  { id: 'programa-calibracion', title: 'PROGRAMA DE CALIBRACION', icon: Settings, color: 'bg-cyan-500', available: true },
  { id: 'calibration-manager', title: 'CALIBRACION MANAGER', icon: Settings, color: 'bg-cyan-500', available: true }, // Agregar el icono adecuado para el Calibración Managern', title: 'FORMATOS DE CALIBRACION', icon: Settings, color: 'bg-cyan-500', available: false },
];

export const MainMenu: React.FC = () => {
  const { navigateTo } = useNavigation();
  const { user, logout } = useAuth();

  const handleMenuClick = (item: any) => {
    if (!item.available) {
      return;
    }
    
    if (item.id === 'consecutivos') {
      navigateTo('consecutivos');
    } else if (item.id === 'friday') {
      navigateTo('friday');
    } else if (item.id === 'empresas') {
      navigateTo('empresas');
    } else if (item.id === 'calendario') {
      navigateTo('calendario');
    } else if (item.id === 'programa-calibracion') {
      navigateTo('programa-calibracion'); 
    } else if (item.id === 'calibration-manager') {
      navigateTo('calibration-manager');
    } else if (item.id === 'hoja-servicio') {
      navigateTo('hoja-servicio');
    } else if (item.id === 'normas') {
      navigateTo('normas');  
    } else if (item.id === 'drive') {
      navigateTo('drive');  
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Hash className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Equipos y Servicios AG</h1>
              <p className="text-sm text-gray-500">Sistema de Gestión</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <User className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">{user?.name}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center space-x-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Salir</span>
            </button>
          </div>
        </div>
      </div>

      {/* Menu Grid */}
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Menú Principal</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleMenuClick(item)}
                className={`
                  relative group cursor-pointer transition-all duration-300 transform hover:scale-105 hover:shadow-xl
                  ${item.available ? 'hover:shadow-xl' : 'opacity-60 cursor-not-allowed'}
                `}
              >
                <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-md">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className={`w-20 h-20 ${item.color} rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all`}>
                      <item.icon className="w-10 h-10 text-white" />
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {item.title}
                      </h3>
                      {!item.available && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                          Próximamente
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {item.available && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};