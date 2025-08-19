import React, { useState, useEffect, useRef } from "react";
import { Cpu, Table2, ClipboardList, Menu } from "lucide-react";
import clsx from "clsx";

type Props = {
  active: string;
  onNavigate: (key: string) => void;
  onToggle?: (open: boolean) => void; // ← NUEVO
};

const items = [
  { key: "friday", label: "Equipos en Calibración", icon: <Table2 size={20} /> },
  { key: "friday-servicios", label: "Servicios en Sitio", icon: <ClipboardList size={20} /> },
];

export default function SidebarFriday({ active, onNavigate, onToggle }: Props) {
  const [open, setOpen] = useState(true);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  // Notificar al padre cuando cambia el estado (abre/cierra)
  useEffect(() => {
    onToggle?.(open);
  }, [open, onToggle]);

  // Ocultar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Abrir con Ctrl+B (como Notion)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") setOpen((v) => !v);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {/* Botón flotante de abrir/cerrar */}
      {!open && (
        <button
          className="fixed top-4 left-4 z-[90] p-3 rounded-full bg-cyan-700/90 hover:bg-cyan-800 shadow-lg transition-all animate-sidebar-btn"
          onClick={() => setOpen(true)}
        >
          <Menu size={26} className="text-white drop-shadow" />
        </button>
      )}

      {/* Sidebar animado */}
      <div
        ref={sidebarRef}
        className={clsx(
          "fixed top-0 left-0 h-screen w-[235px] z-[99] bg-gradient-to-b from-[#101522] to-[#181c2e] border-r border-cyan-900/40 shadow-xl flex flex-col py-6 select-none transition-all duration-400 ease-[cubic-bezier(.19,1,.22,1)]",
          open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-40 pointer-events-none"
        )}
        style={{ willChange: "transform, opacity" }}
      >
        {/* Botón cerrar */}
        <button
          className="absolute top-5 right-3 p-1 rounded-lg bg-cyan-800/60 hover:bg-cyan-900 transition z-[120]"
          style={{ outline: "none" }}
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        >
          <Menu size={22} className="rotate-90 text-cyan-200" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-7 mb-7">
          <div className="bg-cyan-600 rounded-2xl p-2 shadow-inner shadow-cyan-700/40 flex items-center justify-center animate-spin-logo">
            <Cpu size={25} className="text-white" />
          </div>
          <span className="font-extrabold text-[1.38rem] text-cyan-300 tracking-tight drop-shadow" style={{ letterSpacing: "1.5px" }}>
            EQUIPOS<span className="text-white font-light">AG</span>
          </span>
        </div>

        {/* Menu */}
        <nav className="flex flex-col gap-2 flex-1">
          {items.map((item) => (
            <button
              key={item.key}
              className={clsx(
                "flex items-center gap-3 px-7 py-[15px] font-semibold rounded-xl group relative overflow-hidden transition-all duration-300",
                active === item.key
                  ? "bg-gradient-to-r from-cyan-800/60 to-cyan-900/60 text-cyan-200 shadow-cyan-400/15 shadow-[0_4px_24px_0] scale-[1.02]"
                  : "text-cyan-100/80 hover:bg-cyan-800/20 hover:scale-[1.015] hover:text-cyan-300"
              )}
              onClick={() => { onNavigate(item.key); setOpen(false); }}
            >
              <span className={clsx(
                "transition-all duration-300",
                active === item.key ? "text-cyan-400 scale-110 drop-shadow" : "opacity-70 group-hover:opacity-90"
              )}>
                {item.icon}
              </span>
              <span className={clsx(
                "text-[1.06rem] transition-all duration-300 tracking-wide",
                active === item.key ? "font-bold text-cyan-100 drop-shadow" : ""
              )}>
                {item.label}
              </span>
              <span className={clsx(
                "absolute left-2 top-2 bottom-2 w-2 rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-800 transition-all duration-300",
                active === item.key ? "opacity-100 scale-y-100 shadow-cyan-200/25 shadow-lg" : "opacity-0 scale-y-50"
              )} />
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto px-8 pt-8 pb-4 flex flex-col gap-2">
          <span className="text-xs text-cyan-900/70 font-medium tracking-wide">
            Powered by <span className="text-cyan-500">AG</span> UI
          </span>
          <div className="h-[2px] w-8 rounded bg-cyan-900/60 mb-2" />
          <span className="text-xs text-neutral-700/70">v1.0 - A. Ginez</span>
        </div>
      </div>

      <style>{`
        .animate-fadein-sidebar { animation: sidebarfadein .58s cubic-bezier(.21,1,.21,1); }
        @keyframes sidebarfadein { from { opacity:0; transform: translateX(-42px) scale(.98); } to { opacity:1; transform: none; } }
        .animate-spin-logo { animation: spinlogo 2.5s linear infinite; }
        @keyframes spinlogo { 0% { transform:rotate(0deg);} 100% {transform:rotate(360deg);} }
        .animate-sidebar-btn { animation: sidebarbtnfade .22s cubic-bezier(.3,1.7,.7,1.01); }
        @keyframes sidebarbtnfade { from { opacity:0; transform: scale(.7);} to {opacity:1; transform:scale(1);} }
      `}</style>
    </>
  );
}
