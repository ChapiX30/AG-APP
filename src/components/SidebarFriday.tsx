import React, { useState, useEffect, useRef } from "react";
import { Table2, ClipboardList, Menu } from "lucide-react";
import clsx from "clsx";

const items = [
  { key: "friday", label: "Equipos en Calibración", icon: <Table2 size={20} /> },
  { key: "friday-servicios", label: "Servicios en Sitio", icon: <ClipboardList size={20} /> },
];

export default function SidebarFriday({ active, onNavigate }) {
  const [open, setOpen] = useState(true);
  const [tapActive, setTapActive] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
  const root = document.documentElement; // <html>
  // 240px = ancho del sidebar abierto, 16px = margen cuando está cerrado
  root.style.setProperty('--friday-sidebar-offset', open ? '240px' : '16px');
  return () => root.style.setProperty('--friday-sidebar-offset', '16px');
}, [open]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {/* Botón flotante abrir */}
      {!open && (
        <button
          className="fixed top-4 left-4 z-[90] p-3 rounded-full bg-cyan-700/90 hover:bg-cyan-800 shadow-lg transition-all animate-sidebar-btn"
          onClick={() => setOpen(true)}
        >
          <Menu size={26} className="text-white drop-shadow" />
        </button>
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={clsx(
          "fixed top-0 left-0 h-screen w-[240px] z-[99] bg-gradient-to-b from-[#101522] to-[#181c2e] border-r border-cyan-900/40 shadow-2xl flex flex-col py-6 px-4 transition-all duration-500 ease-[cubic-bezier(.2,1,.22,1)] backdrop-blur-sm",
          open
            ? "translate-x-0 opacity-100 scale-100"
            : "-translate-x-full opacity-0 scale-95 pointer-events-none"
        )}
      >
        {/* Botón cerrar */}
        <button
          className="absolute top-5 right-3 p-1 rounded-lg bg-cyan-800/60 hover:bg-cyan-900 transition"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        >
          <Menu size={22} className="rotate-90 text-cyan-200" />
        </button>

        {/* Logo reflectante con toque */}
        <div className="flex items-center gap-3 px-4 mb-8">
          <div
            className={clsx(
              "w-14 h-14 rounded-full bg-black/10 backdrop-blur-xl border border-cyan-300 shadow-inner shadow-cyan-500/30 flex items-center justify-center animate-rotate-3d relative overflow-hidden",
              tapActive && "tap-effect"
            )}
            onTouchStart={() => setTapActive(true)}
            onAnimationEnd={() => setTapActive(false)}
          >
            <span className="logo-reflect">AG</span>
            <div className="highlight-flare" />
          </div>
          <span className="font-extrabold text-[1.38rem] text-cyan-300 tracking-tight drop-shadow" style={{ letterSpacing: "1.5px" }}>
            EQUIPOS<span className="text-white font-light">AG</span>
          </span>
        </div>

        {/* Menú */}
        <nav className="flex flex-col gap-2 flex-1">
          {items.map((item) => (
            <button
              key={item.key}
              className={clsx(
                "flex items-center gap-3 px-6 py-[14px] font-semibold rounded-xl group relative overflow-hidden transition-all duration-300",
                active === item.key
                  ? "bg-gradient-to-r from-cyan-800/60 to-cyan-900/60 text-cyan-200 shadow-cyan-400/15 shadow-[0_4px_24px_0] scale-[1.02]"
                  : "text-cyan-100/80 hover:bg-cyan-800/20 hover:scale-[1.015] hover:text-cyan-300"
              )}
              onClick={() => { onNavigate(item.key); setOpen(false); }}
            >
              <span className={clsx("transition-all duration-300", active === item.key ? "text-cyan-400 scale-110 drop-shadow" : "opacity-70 group-hover:opacity-90")}>
                {item.icon}
              </span>
              <span className={clsx("text-[1.06rem] transition-all duration-300 tracking-wide", active === item.key ? "font-bold text-cyan-100 drop-shadow" : "")}>
                {item.label}
              </span>
              <span className={clsx("absolute left-2 top-2 bottom-2 w-2 rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-800 transition-all duration-300", active === item.key ? "opacity-100 scale-y-100 shadow-cyan-200/25 shadow-lg" : "opacity-0 scale-y-50")} />
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto px-6 pt-6 pb-4 flex flex-col gap-2">
          <span className="text-xs text-cyan-900/70 font-medium tracking-wide">
            Powered by <span className="text-cyan-500">AG</span> UI
          </span>
          <div className="h-[2px] w-8 rounded bg-cyan-900/60 mb-2" />
          <span className="text-xs text-neutral-700/70">v1.0 - A. Ginez</span>
        </div>
      </div>

      {/* Estilos mágicos */}
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
