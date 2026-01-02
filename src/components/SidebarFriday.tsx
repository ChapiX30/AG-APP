import React, { useState, useEffect } from "react";
import {
  Table2,
  ClipboardList,
  Menu,       // Icono hamburguesa (para abrir)
  PanelLeftClose, // Icono profesional para cerrar panel
  PanelLeftOpen,  // Icono para expandir
  LayoutGrid,
  Settings,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import clsx from "clsx";

const items = [
  { key: "friday", label: "Equipos en Calibración", icon: <Table2 size={20} /> },
  { key: "friday-servicios", label: "Servicios en Sitio", icon: <ClipboardList size={20} /> },
];

export default function SidebarFriday({ active, onNavigate }) {
  // Estado 1: ¿La barra está visible en pantalla?
  const [isOpen, setIsOpen] = useState(true);
  
  // Estado 2: ¿La barra está en modo "mini" (solo iconos)?
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Efecto: Controla el empuje del contenido principal
  useEffect(() => {
    const root = document.documentElement;
    let offset = "0px";

    if (isOpen) {
      // Si está abierta, empuja el contenido según si está colapsada o full
      offset = isCollapsed ? "72px" : "260px";
    } else {
      // Si está cerrada, el offset es 0 (contenido full width)
      offset = "0px";
    }

    root.style.setProperty("--friday-sidebar-offset", offset);
    return () => root.style.setProperty("--friday-sidebar-offset", "0px");
  }, [isOpen, isCollapsed]);

  return (
    <>
      {/* --- 1. BOTÓN FLOTANTE (Solo visible cuando el sidebar está OCULTO) --- */}
      <div 
        className={clsx(
          "fixed top-4 left-4 z-30 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
          !isOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10 pointer-events-none"
        )}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="p-2.5 bg-white border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.08)] rounded-lg text-slate-600 hover:text-cyan-600 hover:border-cyan-200 transition-colors flex items-center gap-2 group"
        >
          <Menu size={20} />
          {/* Tooltip simple al pasar mouse */}
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap text-sm font-medium text-slate-600">
            Menú
          </span>
        </button>
      </div>

      {/* --- 2. SIDEBAR PRINCIPAL --- */}
      <aside
        className={clsx(
          "fixed top-0 left-0 h-screen z-40 flex flex-col bg-[#0F172A] border-r border-slate-800 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
          // Lógica de Ocultar vs Mostrar
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full shadow-none",
          // Lógica de Ancho
          isCollapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {/* HEADER: Logo y Controles */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 relative bg-[#0F172A]">
          
          {/* Logo Area */}
          <div className="flex items-center gap-3 overflow-hidden">
             {/* Icono del Logo */}
            <div className="flex-shrink-0 w-8 h-8 rounded bg-gradient-to-br from-cyan-600 to-cyan-700 flex items-center justify-center text-white shadow-lg shadow-cyan-900/20">
              <LayoutGrid size={18} />
            </div>
            
            {/* Texto del Logo (Se oculta al colapsar) */}
            <div className={clsx("transition-opacity duration-300 flex flex-col", isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100")}>
              <span className="font-bold text-slate-100 tracking-tight leading-none text-[15px]">
                METROLOGY
              </span>
              <span className="text-[10px] text-cyan-500 font-semibold tracking-widest uppercase mt-0.5">
                System
              </span>
            </div>
          </div>

          {/* Botón: Colapsar / Expandir (Las flechitas) - Solo visible si está ABIERTO y NO colapsado */}
          {!isCollapsed && (
             <button 
                onClick={() => setIsCollapsed(true)}
                className="text-slate-500 hover:text-slate-200 transition-colors p-1"
                title="Contraer menú"
             >
                <PanelLeftClose size={18} />
             </button>
          )}
        </div>

        {/* NAVEGACIÓN */}
        <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
           {items.map((item) => {
             const isActive = active === item.key;
             return (
               <button
                 key={item.key}
                 onClick={() => onNavigate(item.key)}
                 className={clsx(
                   "group relative flex items-center w-full p-2.5 rounded-lg transition-all duration-200",
                   isActive 
                     ? "bg-cyan-500/10 text-cyan-400 font-medium" 
                     : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                   isCollapsed ? "justify-center" : "justify-start gap-3"
                 )}
               >
                 {/* Icono */}
                 <span className={clsx("transition-transform duration-200", isActive && "scale-105")}>
                    {item.icon}
                 </span>

                 {/* Texto (Se oculta suavemente) */}
                 {!isCollapsed && (
                   <span className="text-sm truncate animate-in fade-in slide-in-from-left-2 duration-300">
                     {item.label}
                   </span>
                 )}

                 {/* Indicador Activo (Barra lateral) */}
                 {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r bg-cyan-500" />
                 )}
                 
                 {/* Tooltip Flotante (Solo en modo colapsado) */}
                 {isCollapsed && (
                   <div className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap shadow-xl">
                     {item.label}
                   </div>
                 )}
               </button>
             );
           })}
        </div>

        {/* FOOTER: Botones de control inferiores */}
        <div className="p-3 border-t border-slate-800/80 bg-[#0B1120]">
           {/* Si está colapsado, mostramos botón para expandir */}
           {isCollapsed ? (
              <button
                onClick={() => setIsCollapsed(false)}
                className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
                title="Expandir menú"
              >
                <PanelLeftOpen size={20} />
              </button>
           ) : (
             /* Si está expandido, mostramos opción para OCULTAR COMPLETAMENTE */
             <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">AG</div>
                   <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-200">Admin</span>
                      <span className="text-[10px] text-slate-500">Configuración</span>
                   </div>
                </div>
                {/* Botón de la X para cerrar totalmente el sidebar */}
                <button
                   onClick={() => setIsOpen(false)}
                   className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-colors"
                   title="Ocultar menú lateral"
                >
                   <ChevronLeft size={18} />
                </button>
             </div>
           )}
        </div>
      </aside>
    </>
  );
}