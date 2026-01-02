import React, { useState, useEffect, useRef } from "react";
import {
  Table2,
  ClipboardList,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";

const items = [
  { key: "friday", label: "Equipos en Calibración", icon: <Table2 size={20} /> },
  {
    key: "friday-servicios",
    label: "Servicios en Sitio",
    icon: <ClipboardList size={20} />,
  },
];

export default function SidebarFriday({ active, onNavigate }) {
  // 'open' controla si el sidebar está visible o totalmente oculto
  const [open, setOpen] = useState(true);
  // 'isCollapsed' controla si está en modo ícono (76px) o expandido (240px)
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [tapActive, setTapActive] = useState(false);
  const sidebarRef = useRef(null);

  // Hook para cerrar el sidebar si se hace clic fuera
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setOpen(false);
        // Opcional: si quieres que también se expanda al hacer clic fuera
        // if (isCollapsed) setIsCollapsed(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, isCollapsed]); // Añadimos isCollapsed a las dependencias

  // Hook para actualizar la variable CSS que mueve el contenido principal
  useEffect(() => {
    const root = document.documentElement; // <html>
    let offset = "16px"; // Default cuando está cerrado
    if (open) {
      offset = isCollapsed ? "76px" : "240px";
    }
    root.style.setProperty("--friday-sidebar-offset", offset);
    return () => root.style.setProperty("--friday-sidebar-offset", "16px");
  }, [open, isCollapsed]);

  // Hook para el atajo de teclado
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        if (open) {
          setIsCollapsed((v) => !v);
        } else {
          setOpen(true);
          setIsCollapsed(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]); // Depende de 'open' para decidir la acción

  return (
    <>
      {/* Botón flotante abrir (solo aparece si el sidebar está cerrado) */}
      {!open && (
        <button
          className="fixed top-10 left-4 z-[90] p-3 rounded-full bg-cyan-700/90 hover:bg-cyan-800 shadow-lg transition-all animate-sidebar-btn"
          onClick={() => {
            setOpen(true);
            setIsCollapsed(false); // Siempre se abre en modo expandido
          }}
        >
          <Menu size={26} className="text-white drop-shadow" />
        </button>
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={clsx(
          "fixed top-0 left-0 h-screen z-[99] bg-gradient-to-b from-[#101522] to-[#181c2e] border-r border-cyan-900/40 shadow-2xl flex flex-col py-6 transition-all duration-500 ease-[cubic-bezier(.2,1,.22,1)] backdrop-blur-sm",
          // Lógica de ancho y visibilidad
          open
            ? "translate-x-0 opacity-100 scale-100"
            : "-translate-x-full opacity-0 scale-95 pointer-events-none",
          isCollapsed ? "w-[76px]" : "w-[240px]" // Ancho dinámico
        )}
      >
        {/* Botón colapsar/expandir (reemplaza tu botón de cerrar) */}
        <button
          className="absolute top-5 -right-3.5 z-[100] p-1.5 rounded-full bg-cyan-700 hover:bg-cyan-600 transition shadow-md border-2 border-cyan-900/50"
          onClick={() => setIsCollapsed((v) => !v)}
          aria-label={isCollapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {isCollapsed ? (
            <ChevronRight size={18} className="text-cyan-100" />
          ) : (
            <ChevronLeft size={18} className="text-cyan-100" />
          )}
        </button>
        
        {/* Botón cerrar (Ocultar completamente) */}
         <button
          className="absolute top-14 -right-3.5 z-[100] p-1.5 rounded-full bg-neutral-700 hover:bg-neutral-600 transition shadow-md border-2 border-neutral-900/50"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        >
          <Menu size={18} className="rotate-90 text-neutral-200" />
        </button>

        {/* Logo reflectante con toque */}
        <div
          className={clsx(
            "flex items-center gap-3 mb-8 transition-all duration-300",
            isCollapsed ? "px-3.5" : "px-8" // Ajuste de padding
          )}
        >
          <div
            className={clsx(
              // --- ESTA ES LA SECCIÓN CORREGIDA ---
              "h-12 w-12 rounded-full",
              "bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-700",
              "shadow-inner shadow-neutral-900/50 flex items-center justify-center animate-rotate-3d",
              "relative overflow-hidden transition-all duration-300", // NEW COLOR/STYLE
              // --- FIN DE LA CORRECCIÓN ---
              tapActive && "tap-effect",
              isCollapsed ? "w-12 h-12" : "w-14 h-14"
            )}
            onTouchStart={() => setTapActive(true)}
            onAnimationEnd={() => setTapActive(false)}
          >
            <span className="logo-reflect">AG</span>
            <div className="highlight-flare" />
          </div>
          <span
            className={clsx(
              "font-extrabold text-[1.38rem] text-cyan-300 tracking-tight drop-shadow transition-all duration-300 whitespace-nowrap overflow-hidden",
              isCollapsed ? "opacity-0 w-0" : "opacity-100 w-full" // Ocultar texto
            )}
            style={{ letterSpacing: "1.5px" }}
          >
            EQUIPOS<span className="text-white font-light">AG</span>
          </span>
        </div>

        {/* Menú */}
        <nav className="flex flex-col gap-2 flex-1 px-3">
          {items.map((item) => (
            <button
              key={item.key}
              className={clsx(
                "flex items-center gap-3 py-[14px] font-semibold rounded-xl group relative overflow-hidden transition-all duration-300",
                isCollapsed ? "justify-center px-3" : "px-6", // Centrar ícono
                active === item.key
                  ? "bg-gradient-to-r from-cyan-800/60 to-cyan-900/60 text-cyan-200 shadow-cyan-400/15 shadow-[0_4px_24px_0] scale-[1.02]"
                  : "text-cyan-100/80 hover:bg-cyan-800/20 hover:scale-[1.015] hover:text-cyan-300"
              )}
              onClick={() => {
                onNavigate(item.key);
                // Opcional: ¿cerrar el sidebar al navegar?
                // setOpen(false);
              }}
            >
              {/* Ícono */}
              <span
                className={clsx(
                  "transition-all duration-300",
                  active === item.key
                    ? "text-cyan-400 scale-110 drop-shadow"
                    : "opacity-70 group-hover:opacity-90"
                )}
              >
                {item.icon}
              </span>
              
              {/* Etiqueta de texto */}
              <span
                className={clsx(
                  "text-[1.06rem] transition-all duration-300 tracking-wide whitespace-nowrap",
                  active === item.key
                    ? "font-bold text-cyan-100 drop-shadow"
                    : "",
                  isCollapsed ? "opacity-0 scale-90 w-0" : "opacity-100 w-full" // Ocultar
                )}
              >
                {item.label}
              </span>

              {/* Tooltip (solo visible cuando está colapsado) */}
              {isCollapsed && (
                <span className="absolute left-[88px] z-[99] px-3 py-1.5 bg-neutral-900/90 border border-neutral-700 text-cyan-200 text-sm rounded-lg shadow-xl backdrop-blur-sm
                                 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 group-hover:delay-500 transition-all duration-200 pointer-events-none whitespace-nowrap">
                  {item.label}
                </span>
              )}
              
              {/* Barra lateral activa */}
              <span
                className={clsx(
                  "absolute left-2 top-2 bottom-2 w-2 rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-800 transition-all duration-300",
                  active === item.key
                    ? "opacity-100 scale-y-100 shadow-cyan-200/25 shadow-lg"
                    : "opacity-0 scale-y-50",
                  isCollapsed && "left-1 right-1 w-auto h-1.5 top-auto" // Barra horizontal
                )}
              />
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div
          className={clsx(
            "mt-auto pt-6 pb-4 flex flex-col gap-2 transition-all duration-300",
            isCollapsed ? "items-center px-0" : "items-start px-6"
          )}
        >
          <span
            className={clsx(
              "text-xs text-cyan-900/70 font-medium tracking-wide transition-all duration-300 whitespace-nowrap",
              isCollapsed && "opacity-0 h-0" // Ocultar
            )}
          >
            Powered by <span className="text-cyan-500">AG</span> UI
          </span>
          <div
            className={clsx(
              "h-[2px] rounded bg-cyan-900/60 mb-2 transition-all duration-300",
              isCollapsed ? "w-10" : "w-8" // Ancho de línea
            )}
          />
          <span
            className={clsx(
              "text-xs text-neutral-700/70 transition-all duration-300 whitespace-nowrap",
              isCollapsed && "opacity-0 h-0" // Ocultar
            )}
          >
            v1.0 - A. Ginez
          </span>
        </div>
      </div>

      {/* Estilos mágicos (sin cambios) */}
      <style>{`
        .animate-rotate-3d {
          animation: rotate3d 5s linear infinite;
          transform-style: preserve-3d;
          perspective: 600px;
        }

        @keyframes rotate3d {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }

        .logo-reflect {
          font-size: 1.25rem;
          font-weight: 800;
          color: white;
          text-shadow: 0 0 4px #67e8f9, 0 0 8px #22d3ee, 0 0 16px #0ea5e9;
          background: linear-gradient(120deg, #ffffff, #67e8f9, #22d3ee, #ffffff);
          background-size: 300% 300%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmerReflect 4s ease-in-out infinite;
          z-index: 10;
        }

        @keyframes shimmerReflect {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .highlight-flare {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(ellipse at center, rgba(255,255,255,0.1) 0%, transparent 70%);
          animation: flareMove 6s linear infinite;
          z-index: 1;
          pointer-events: none;
        }

        @keyframes flareMove {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .tap-effect {
          animation: tapFlash 0.6s ease-in-out;
        }

        @keyframes tapFlash {
          0% { transform: scale(1); box-shadow: 0 0 0px #22d3ee; }
          50% { transform: scale(1.15); box-shadow: 0 0 18px #22d3ee; }
          100% { transform: scale(1); box-shadow: 0 0 0px #22d3ee; }
        }

        .animate-sidebar-btn {
          animation: sidebarbtnfade .3s cubic-bezier(.3,1.5,.7,1);
        }

        @keyframes sidebarbtnfade {
          from { opacity:0; transform: scale(.7);}
          to   { opacity:1; transform: scale(1);}
        }
      `}</style>
    </>
  );
}