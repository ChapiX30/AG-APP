import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
  ResponsiveContainer, CartesianGrid, TooltipProps, LabelList
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Activity, Clock, BarChart3, UserCircle, Briefcase, CheckCircle, MonitorPlay
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import clsx from "clsx";

// --- CONSTANTES ---
const COLORS = { background: "bg-slate-900", cardBorder: "border-white/10" };

const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#ef4444" },
  { name: "Dante Hernández", color: "#3b82f6" },
  { name: "Edgar Amador", color: "#007e2e" },
  { name: "Angel Amador", color: "#14b8a6" },
  { name: "Ricardo Domínguez", color: "#d946ef" },
  { name: "Mario Medina", color: "#ababab" },
  { name: "Daniel Hernández", color: "#8f6a2c" },
];
const FALLBACK_COLORS = ["#f59e0b", "#6366f1", "#8b5cf6", "#ec4899", "#64748b"];

const MAGNITUDES_COLORS: Record<string, string> = {
  "Acustica": "#b6cfcb", "Dimensional": "#001e78", "Electrica": "#ffee00",
  "Flujo": "#20cde0", "Fuerza": "#835700", "Humedad": "#6f888c",
  "Frecuencia": "#ff9100", "Optica Trazable": "#4a3419", "Par Torsional Trazable": "#00ff2f",
  "Reporte Diagnostico": "#9203ff", "Masa": "#06e52f", "Par Torsional": "#30306D",
  "Presión": "#6c6cfa", "Temperatura": "#bd0101", "Tiempo": "#f33220",
  "Vibracion Trazable": "#49ae9a", "Vacio": "#bebebe",
};

const SLIDE_DURATION = 12000;

// --- HELPERS ---
const cleanName = (name?: string) => name && name !== "null" && name !== "undefined" ? name.trim() : "";
const isMetrologyRole = (user: any) => ((user.puesto || "") + " " + (user.role || "")).toLowerCase().includes('metrólogo') || ((user.puesto || "") + " " + (user.role || "")).toLowerCase().includes('tecnico');

const addBusinessDays = (startDate: Date, daysToAdd: number) => {
    let currentDate = new Date(startDate);
    let added = 0;
    while (added < daysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) added++;
    }
    return currentDate;
};

const CustomTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800/95 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md z-50">
        <p className="text-slate-300 text-xs mb-1 font-medium capitalize">{label}</p>
        {payload.map((entry: any, index: number) => (
             <p key={index} className="text-white font-bold text-sm flex items-center gap-2 mb-1">
             <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
             {entry.name}: {entry.value}
           </p>
        ))}
      </div>
    );
  }
  return null;
};

const TVDashboardScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [hojasDeTrabajo, setHojasDeTrabajo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [presentationStep, setPresentationStep] = useState(0);
  const [currentDate, setCurrentDate] = useState(new Date());

  // --- CARGA DE DATOS ---
  useEffect(() => {
    const unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => setUsuarios(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubHojas = onSnapshot(collection(db, "hojasDeTrabajo"), (snapshot) => { setHojasDeTrabajo(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    const timer = setInterval(() => setCurrentDate(new Date()), 60000);
    return () => { unsubUsuarios(); unsubHojas(); clearInterval(timer); };
  }, []);

  // --- CÁLCULOS PRINCIPALES ---
  const { 
      pendientesLaboratorio, flatPendientes, totalPendientes, activeDeptData, 
      metrologosData, magnitudesGlobalData, presentationSequence 
  } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    // 1. FILTRO ROBUSTO: Mostrar TODO lo que siga en el laboratorio HASTA que se marque Realizado en Drive
    const equiposPendientes = hojasDeTrabajo.filter(r => {
        const isLab = (r.lugarCalibracion || '').toLowerCase() === 'laboratorio';
        const isNotRejected = r.status_equipo !== 'Rechazado';
        const isNotDelivered = r.status_equipo !== 'Entregado' && r.ubicacion_real !== 'Entregado';
        
        // REGLA CRÍTICA NUEVA: Si el archivo ya se validó en DriveScreen, desaparece de la TV.
        const isNotRealizado = r.cargado_drive !== 'Realizado';

        return isLab && isNotRejected && isNotDelivered && isNotRealizado;
    });

    const contadoresPendientes: Record<string, number> = { "Mecánica": 0, "Dimensional": 0, "Eléctrica": 0, "Sin Asignar": 0 };
    
    const procesados = equiposPendientes.map(r => {
        let dep = r.departamento || "Sin Asignar";
        
        // Normalización de acentos para evitar que las gráficas se dividan o no cuenten
        if (dep.toLowerCase() === 'mecanica' || dep.toLowerCase() === 'mecánica') dep = 'Mecánica';
        if (dep.toLowerCase() === 'electrica' || dep.toLowerCase() === 'eléctrica') dep = 'Eléctrica';

        if (contadoresPendientes[dep] !== undefined) contadoresPendientes[dep]++;
        else contadoresPendientes[dep] = 1;

        let diffDays = 0, daysLabel = "-", statusColor = "text-gray-400";

        // Si ya está calibrado (pero aún no "Realizado" en Drive), lo mostramos en azul
        if (r.status_equipo === 'Calibrado') {
            statusColor = "text-blue-400 font-bold";
            daysLabel = "Calibrado";
            diffDays = 999; // Mandarlo al final de las urgencias
        } else if (r.fechaEntrada && r.diasPromesa) {
            const start = new Date(r.fechaEntrada + 'T00:00:00');
            const deadline = addBusinessDays(start, Number(r.diasPromesa));
            const now = new Date(); now.setHours(0,0,0,0);
            diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays <= 2 && diffDays > 0) { statusColor = "text-orange-400 font-bold"; daysLabel = `Faltan ${diffDays}d`; } 
            else if (diffDays === 0) { statusColor = "text-red-400 font-bold"; daysLabel = "Vence Hoy"; } 
            else if (diffDays < 0) { statusColor = "text-red-500 font-black"; daysLabel = `Vencido (${Math.abs(diffDays)}d)`; } 
            else { statusColor = "text-emerald-400 font-medium"; daysLabel = `Faltan ${diffDays}d`; }
        }
        return { ...r, diffDays, daysLabel, statusColor, dep };
    }).sort((a, b) => a.diffDays - b.diffDays); 

    const deptChartData = Object.entries(contadoresPendientes)
        .filter(([name, total]) => total > 0)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total); 

    const hojasDelMes = hojasDeTrabajo.filter(h => {
        if (!h.fecha) return false;
        const d = new Date(h.fecha + 'T00:00:00');
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    const countsMet: Record<string, number> = {};
    const magGlobalMap: Record<string, number> = {};

    hojasDelMes.forEach(h => { 
        const name = cleanName(h.nombre);
        if (name) countsMet[name] = (countsMet[name] || 0) + 1;
        if (h.magnitud) magGlobalMap[h.magnitud] = (magGlobalMap[h.magnitud] || 0) + 1;
    });

    // 2. METRÓLOGOS DINÁMICOS
    const validMetrologosNames = new Set(usuarios.filter(u => isMetrologyRole(u)).map(u => cleanName(u.name || u.nombre)));
    let statsMet: any[] = [];
    
    METROLOGOS_ORDER_COLOR.forEach(m => {
        if (validMetrologosNames.has(cleanName(m.name))) {
            statsMet.push({ name: m.name, total: countsMet[cleanName(m.name)] || 0, color: m.color });
        }
    });

    Object.entries(countsMet).forEach(([cName, total]) => {
        if (total > 0 && !statsMet.find(s => cleanName(s.name) === cName)) {
            const dbUser = usuarios.find(u => cleanName(u.name || u.nombre) === cName);
            statsMet.push({
                name: dbUser?.name || dbUser?.nombre || cName,
                total: total,
                color: dbUser?.color || FALLBACK_COLORS[statsMet.length % FALLBACK_COLORS.length]
            });
        }
    });

    statsMet.sort((a, b) => b.total - a.total);

    const magStats = Object.entries(magGlobalMap).map(([name, total], i) => ({ name, total, color: MAGNITUDES_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] })).sort((a, b) => b.total - a.total);

    const sequence = [
        ...deptChartData.map(d => ({ type: 'department', id: d.name })), 
        ...statsMet.map(m => ({ type: 'user', id: m.name })),            
        { type: 'global', id: 'magnitudes' }                             
    ];

    return { 
        pendientesLaboratorio: contadoresPendientes, 
        flatPendientes: procesados, 
        totalPendientes: equiposPendientes.length, 
        activeDeptData: deptChartData,
        metrologosData: statsMet, 
        magnitudesGlobalData: magStats, 
        presentationSequence: sequence 
    };
  }, [hojasDeTrabajo, usuarios, currentDate]);

  // --- ROTACIÓN (PRESENTACIÓN) ---
  useEffect(() => {
    if (loading || presentationSequence.length === 0) return;
    const timer = setInterval(() => { 
        setPresentationStep((prev) => (prev + 1) >= presentationSequence.length ? 0 : (prev + 1)); 
    }, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, [loading, presentationSequence.length]);

  // --- SCROLL VERTICAL AUTOMÁTICO ---
  useEffect(() => {
    let direction = 1;
    const scrollInterval = setInterval(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollHeight <= el.clientHeight) return;

        el.scrollTop += direction;
        
        if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) {
            direction = -1; 
        } else if (el.scrollTop <= 0) {
            direction = 1; 
        }
    }, 30);

    return () => clearInterval(scrollInterval);
  }, []);

  useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [presentationStep]);

  const currentSlide = presentationSequence[presentationStep] || { type: 'global', id: 'magnitudes' };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;

  return (
    <div className={`h-screen ${COLORS.background} text-white font-sans overflow-hidden flex flex-col`}>
      
      {/* HEADER TOP RESPONSIVO */}
      <header className="bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-4 lg:px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-lg z-40 shrink-0 gap-4 h-auto md:h-[80px]">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button onClick={() => navigateTo("mainmenu")} className="p-2 rounded-full hover:bg-white/10 transition-colors group">
              <ArrowLeft className="w-6 h-6 text-gray-400 group-hover:text-white" />
          </button>
          <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <MonitorPlay className="text-blue-500" /> DASHBOARD LIVE
              </h1>
              <p className="text-[10px] md:text-xs text-gray-400 uppercase tracking-widest">{currentDate.toLocaleString("es-MX", { month: "long", year: "numeric" })}</p>
          </div>
        </div>
        
        {/* WIDGET RESUMEN: Permite envolverse (wrap) en celulares */}
        <div className="flex items-center gap-2 lg:gap-3 bg-slate-800/50 p-2 rounded-2xl border border-white/10 shadow-inner flex-wrap justify-center w-full md:w-auto">
            <div className="flex items-center gap-2 text-xs lg:text-sm font-bold text-gray-300 px-1 lg:px-2">
                <Clock className="w-4 h-4 text-orange-400" /> <span className="hidden sm:inline">Resumen Lab:</span>
            </div>
            {Object.entries(pendientesLaboratorio).map(([dep, count]) => {
                if (count === 0 && dep === "Sin Asignar") return null;
                return (
                    <div key={dep} className="flex items-center gap-1.5 lg:gap-2 bg-slate-900 border border-white/5 px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-xl shadow-sm">
                        <div className={clsx("w-2 h-2 rounded-full", count > 0 ? "bg-orange-500 animate-pulse" : "bg-emerald-500")} />
                        <span className="text-[10px] lg:text-xs font-semibold text-gray-400">{dep.substring(0,3)}</span>
                        <span className={clsx("text-sm lg:text-base font-black", count > 0 ? "text-orange-400" : "text-emerald-400")}>{count}</span>
                    </div>
                );
            })}
        </div>
      </header>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 relative overflow-hidden flex bg-slate-900">
         <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-progress z-50" style={{ width: '100%', animationDuration: `${SLIDE_DURATION}ms`, animationTimingFunction: 'linear', animationIterationCount: 'infinite' }} />

         <AnimatePresence mode="wait">

            {/* ===== SLIDE TIPO 1: DEPARTAMENTOS MONDAY.COM ===== */}
            {currentSlide.type === 'department' && (
                <motion.div key={`dept-${currentSlide.id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }} 
                            className="w-full h-full flex flex-col lg:flex-row gap-4 lg:gap-8 p-4 lg:p-8 overflow-y-auto lg:overflow-hidden">
                    
                    {/* IZQUIERDA: GRÁFICO TIPO MONDAY */}
                    <div className="w-full lg:w-[45%] flex flex-col h-[350px] lg:h-full bg-slate-800/40 rounded-3xl border border-white/5 p-4 lg:p-6 shadow-xl shrink-0">
                        <h2 className="text-lg lg:text-2xl font-bold text-white mb-2 flex items-center gap-2 lg:gap-3">
                            <BarChart3 className="text-orange-500 w-5 h-5 lg:w-6 lg:h-6"/> Equipos por Departamento
                        </h2>
                        <p className="text-xs lg:text-sm text-gray-400 mb-4 lg:mb-8">Estado actual de carga de trabajo.</p>
                        
                        <div className="flex-1 min-h-0 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activeDeptData} margin={{ top: 30, right: 10, left: -20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontWeight: 600}} />
                                    <YAxis stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                                    <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={100}>
                                        {activeDeptData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.name === currentSlide.id ? "#f97316" : "#334155"} className="transition-all duration-500" />
                                        ))}
                                        <LabelList dataKey="total" position="top" fill="#ffffff" fontSize={16} fontWeight="bold" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* DERECHA: TABLA DE EQUIPOS */}
                    <div className="w-full lg:w-[55%] flex flex-col h-[400px] lg:h-full bg-slate-800/40 rounded-3xl border border-white/5 shadow-xl overflow-hidden shrink-0">
                        <div className="bg-slate-800/80 px-4 lg:px-6 py-3 lg:py-4 border-b border-white/10 flex items-center justify-between shadow-sm shrink-0">
                            <h3 className="text-base lg:text-lg font-bold text-orange-400 uppercase tracking-wider flex items-center gap-2">
                                <Activity size={18} /> Mostrando: {currentSlide.id}
                            </h3>
                            <span className="bg-white/10 text-white px-2 lg:px-3 py-1 rounded-full text-[10px] lg:text-xs font-bold border border-white/10">
                                {flatPendientes.filter(eq => eq.dep === currentSlide.id).length} Equipos
                            </span>
                        </div>
                        
                        <div className="flex text-[10px] lg:text-xs text-gray-400 uppercase font-black tracking-widest bg-slate-900/50 px-4 lg:px-6 py-2.5 lg:py-3 border-b border-white/5 shrink-0">
                            <div className="w-[30%]">Cliente</div>
                            <div className="w-[35%] lg:w-[30%]">Equipo / Folio</div>
                            <div className="w-[20%] text-center">Cronograma</div>
                            <div className="w-[15%] lg:w-[20%] text-right">Técnico</div>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-y-auto hide-scrollbar p-2">
                            {flatPendientes.filter(eq => eq.dep === currentSlide.id).map((eq, idx) => (
                                <div key={eq.docId || idx} className="flex items-center px-2 lg:px-4 py-2.5 lg:py-3 border-b border-white/5 hover:bg-white/5 transition-colors group">
                                    <div className="w-[30%] pr-2">
                                        <div className="text-xs lg:text-sm font-bold text-blue-300 truncate" title={eq.cliente}>{eq.cliente || "Sin Cliente"}</div>
                                    </div>
                                    <div className="w-[35%] lg:w-[30%] pr-2 flex flex-col justify-center">
                                        <div className="text-[11px] lg:text-[13px] font-bold text-gray-200 truncate" title={eq.equipo}>{eq.equipo || "Sin Equipo"}</div>
                                        <div className="text-[9px] lg:text-[10px] text-gray-500 font-mono tracking-widest uppercase mt-0.5">{eq.folio || "S/F"}</div>
                                    </div>
                                    <div className="w-[20%] flex justify-center">
                                        <div className={clsx("text-[10px] lg:text-xs px-1.5 lg:px-2.5 py-1 rounded shadow-sm bg-black/40 border border-white/5 truncate", eq.statusColor)}>
                                            {eq.daysLabel}
                                        </div>
                                    </div>
                                    <div className="w-[15%] lg:w-[20%] flex items-center justify-end gap-1 lg:gap-2">
                                        <UserCircle size={14} className={clsx("hidden sm:block", eq.nombre ? "text-indigo-400" : "text-gray-600")} />
                                        <span className="text-[10px] lg:text-xs font-medium text-gray-300 truncate" title={eq.nombre || eq.assignedTo}>
                                            {eq.nombre || eq.assignedTo ? (eq.nombre || eq.assignedTo).substring(0,4) : "S/A"}
                                        </span>
                                    </div>
                                </div>
                            ))}

                            {flatPendientes.filter(eq => eq.dep === currentSlide.id).length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-80 gap-3 pt-10">
                                    <CheckCircle size={32} className="text-emerald-500" />
                                    <p className="font-bold text-sm">Departamento al día.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ===== SLIDE TIPO 2: METRÓLOGOS ===== */}
            {currentSlide.type === 'user' && (() => {
                const currentUserObj = metrologosData.find(m => m.name === currentSlide.id);
                if (!currentUserObj) return null;
                const userHojasMes = hojasDeTrabajo.filter(h => cleanName(h.nombre) === currentSlide.id && h.fecha && new Date(h.fecha + 'T00:00:00').getFullYear() === currentDate.getFullYear() && new Date(h.fecha + 'T00:00:00').getMonth() + 1 === currentDate.getMonth() + 1);
                const magMap: Record<string, number> = {};
                userHojasMes.forEach(h => { if(h.magnitud) magMap[h.magnitud] = (magMap[h.magnitud] || 0) + 1; });
                const userMagnitudes = Object.entries(magMap).map(([k,v], i) => ({ name: k, value: v, color: MAGNITUDES_COLORS[k] || FALLBACK_COLORS[i%5] })).sort((a,b)=>b.value - a.value);

                return (
                    <motion.div key={`user-${currentSlide.id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5 }} 
                                className="w-full h-full flex flex-col lg:flex-row items-center gap-6 lg:gap-8 px-4 lg:px-12 py-4 lg:py-6 overflow-y-auto lg:overflow-hidden">
                        
                        <div className="w-full lg:w-[30%] flex flex-col items-center justify-center shrink-0 mt-4 lg:mt-0">
                            <div className="w-24 h-24 lg:w-40 lg:h-40 rounded-full border-4 flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.4)] mb-4 lg:mb-8" style={{ borderColor: currentUserObj.color, backgroundColor: `${currentUserObj.color}20` }}>
                                <UserCircle size={60} className="lg:w-20 lg:h-20" style={{ color: currentUserObj.color }} />
                            </div>
                            <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-center mb-4 lg:mb-6 leading-tight" style={{ color: currentUserObj.color, textShadow: `0 0 20px ${currentUserObj.color}40` }}>{currentUserObj.name}</h2>
                            <div className="px-6 py-3 lg:px-8 lg:py-4 bg-white/5 rounded-3xl border border-white/10 flex flex-col items-center gap-1 lg:gap-2 shadow-lg">
                                <span className="text-xs lg:text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Briefcase size={16}/> Equipos Calibrados</span>
                                <span className="text-4xl lg:text-6xl font-black" style={{ color: currentUserObj.color }}>{currentUserObj.total}</span>
                            </div>
                        </div>
                        
                        <div className="w-full lg:w-[70%] grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 h-auto lg:h-full pb-4 shrink-0">
                            <div className={`p-4 lg:p-6 rounded-3xl border ${COLORS.cardBorder} bg-gray-900/80 backdrop-blur-md flex flex-col h-[300px] lg:h-full shadow-xl`}>
                                <h3 className="text-base lg:text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-blue-400"/> Desempeño vs Equipo</h3>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={metrologosData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false}/>
                                            <XAxis type="number" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false}/>
                                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} width={80} />
                                            <Bar dataKey="total" radius={[0, 4, 4, 0]}>{metrologosData.map((e,i) => <Cell key={i} fill={e.name === currentSlide.id ? e.color : '#334155'} />)}</Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            
                            <div className={`p-4 lg:p-6 rounded-3xl border ${COLORS.cardBorder} bg-gray-900/80 backdrop-blur-md flex flex-col h-[350px] lg:h-full shadow-xl`}>
                                <h3 className="text-base lg:text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><Activity size={20} className="text-purple-400"/> Magnitudes Realizadas</h3>
                                <div className="flex-1 flex flex-col min-h-0">
                                    {userMagnitudes.length > 0 ? (
                                        <>
                                            <div className="h-[55%] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart><Pie data={userMagnitudes} innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">{userMagnitudes.map((e,i) => <Cell key={i} fill={e.color}/>)}</Pie><Tooltip content={<CustomTooltip/>} /></PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="h-[45%] overflow-y-auto pr-1 lg:pr-2 mt-2 space-y-2 hide-scrollbar">
                                                {userMagnitudes.map(m => (
                                                    <div key={m.name} className="flex justify-between items-center p-2 lg:p-2.5 bg-white/5 rounded-xl border border-white/5">
                                                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: m.color}}></div><span className="text-xs lg:text-[13px] font-medium text-gray-200 truncate">{m.name}</span></div>
                                                        <span className="font-bold text-sm lg:text-base text-white">{m.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (<div className="w-full h-full flex items-center justify-center text-gray-500 text-sm lg:text-base font-medium">Sin calibraciones este mes.</div>)}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })()}

            {/* ===== SLIDE TIPO 3: MAGNITUDES GLOBALES ===== */}
            {currentSlide.type === 'global' && (
                <motion.div key="magnitudes-global" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5 }} 
                            className="w-full h-full flex flex-col items-center justify-center p-4 lg:p-10 overflow-y-auto lg:overflow-hidden">
                    <div className="text-center mb-6 lg:mb-8 shrink-0 mt-6 lg:mt-0">
                        <h2 className="text-3xl lg:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">Panorama Global</h2>
                        <p className="text-sm lg:text-lg text-gray-400">Total de servicios agrupados por disciplina</p>
                    </div>
                    <div className={`w-full max-w-5xl h-[400px] lg:h-full lg:flex-1 p-4 lg:p-8 rounded-3xl border ${COLORS.cardBorder} bg-gray-900/80 backdrop-blur-md shadow-2xl shrink-0`}>
                        {magnitudesGlobalData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={magnitudesGlobalData} layout="vertical" margin={{ top: 0, right: 20, left: 90, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false} />
                                    <XAxis type="number" stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" stroke="#E5E7EB" fontSize={10} lg:fontSize={14} axisLine={false} tickLine={false} width={120} tick={{fill: '#E5E7EB', fontWeight: 600}} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                                    <Bar dataKey="total" name="Calibraciones" radius={[0, 8, 8, 0]}>{magnitudesGlobalData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (<div className="w-full h-full flex items-center justify-center text-lg lg:text-xl text-gray-500">No hay datos registrados aún.</div>)}
                    </div>
                </motion.div>
            )}
         </AnimatePresence>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes progress { 0% { width: 0%; opacity: 1; } 95% { width: 100%; opacity: 1; } 100% { width: 100%; opacity: 0; } }
        .animate-progress { animation-name: progress; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

export default TVDashboardScreen;