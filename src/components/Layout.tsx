import React, { useState } from 'react';
import SidebarFriday from './SidebarFriday'; 
import { useNavigation } from '../hooks/useNavigation';
import { Menu } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentScreen, navigateTo } = useNavigation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- LISTA BLANCA (ALLOWLIST) ---
  // El Sidebar SOLO aparecerá en estas pantallas exactas:
  const sidebarScreens = ['friday', 'friday-servicios'];
  
  const showSidebar = sidebarScreens.includes(currentScreen);

  // Si NO es una pantalla de Friday, renderizamos contenido a pantalla completa (Full Width)
  if (!showSidebar) {
    return <main className="w-full h-screen overflow-auto bg-[#eceff8]">{children}</main>;
  }

  // Si ES una pantalla de Friday, mostramos el Layout con Sidebar
  return (
    <div className="flex h-screen w-full bg-[#eceff8] overflow-hidden relative">
      
      {/* 1. Sidebar de Escritorio */}
      <div className="hidden md:block h-full z-50">
        <SidebarFriday 
          active={currentScreen} 
          onNavigate={(screen: string) => navigateTo(screen)} 
        />
      </div>

      {/* 2. Sidebar Móvil (Overlay) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-slate-900 shadow-xl animate-in slide-in-from-left">
             <SidebarFriday 
                active={currentScreen} 
                onNavigate={(screen: string) => {
                  navigateTo(screen);
                  setIsMobileMenuOpen(false);
                }} 
             />
          </div>
        </div>
      )}

      {/* 3. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300">
        
        {/* Botón de Menú Móvil (Solo visible en pantallas chicas) */}
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="md:hidden absolute top-4 left-4 z-40 p-2 bg-white/90 backdrop-blur rounded-full shadow-lg text-slate-700 border border-slate-200"
        >
          <Menu size={20} />
        </button>

        <main className="w-full h-full overflow-auto relative">
           {children}
        </main>
        
      </div>

    </div>
  );
};