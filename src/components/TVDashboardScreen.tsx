import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
  ResponsiveContainer, CartesianGrid, TooltipProps, LabelList
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Activity, Clock, BarChart3, UserCircle, Briefcase, Building2, CheckCircle, MonitorPlay
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

const SLIDE_DURATION = 12000; // 12 segundos por pantalla para dar tiempo de leer la tabla

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

    // 1. FILTRADO DE PENDIENTES
    const equiposPendientes = hojasDeTrabajo.filter(r => 
        r.lugarCalibracion === 'laboratorio' && 
        r.status_equipo !== 'Calibrado' && r.status_equipo !== 'Entregado' && r.status_equipo !== 'Rechazado'
    );

    const contadoresPendientes: Record<string, number> = { "Mecánica": 0, "Dimensional": 0, "Eléctrica": 0, "Sin Asignar": 0 };
    
    // Procesamiento y SLAs
    const procesados = equiposPendientes.map(r => {
        const dep = r.departamento || "Sin Asignar";
        if (contadoresPendientes[dep] !== undefined) contadoresPendientes[dep]++;
        else contadoresPendientes[dep] = 1;

        let diffDays = 0, daysLabel = "-", statusColor = "text-gray-400";

        if (r.fechaEntrada && r.diasPromesa) {
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
        .sort((a, b) => b.total - a.total); // Mayor a menor

    // 2. DATOS DEL MES ACTUAL
    const validMetrologosNames = new Set(usuarios.filter(u => isMetrologyRole(u)).map(u => cleanName(u.name)));
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
        if (name && validMetrologosNames.has(name)) countsMet[name] = (countsMet[name] || 0) + 1;
        if (h.magnitud) magGlobalMap[h.magnitud] = (magGlobalMap[h.magnitud] || 0) + 1;
    });

    let statsMet = METROLOGOS_ORDER_COLOR.map(m => ({
        name: m.name, total: countsMet[cleanName(m.name)] || 0, color: m.color
    })).filter(item => validMetrologosNames.has(cleanName(item.name)));

    const magStats = Object.entries(magGlobalMap).map(([name, total], i) => ({ name, total, color: MAGNITUDES_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] })).sort((a, b) => b.total - a.total);

    // 3. CONSTRUCCIÓN DE LA SECUENCIA AUTOMÁTICA
    const sequence = [
        ...deptChartData.map(d => ({ type: 'department', id: d.name })), // 1. Ciclo por Departamentos
        ...statsMet.map(m => ({ type: 'user', id: m.name })),            // 2. Ciclo por Metrólogos
        { type: 'global', id: 'magnitudes' }                             // 3. Panorama Global
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

  // --- SCROLL VERTICAL AUTOMÁTICO DE LA TABLA ---
  useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = 0; // Reiniciar scroll al cambiar de slide
      let direction = 1;
      const interval = setInterval(() => {
          if (el.scrollHeight <= el.clientHeight) return;
          el.scrollTop += direction;
          if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1) direction = -1; 
          else if (el.scrollTop <= 0) direction = 1; 
      }, 40); // Velocidad suave
      return () => clearInterval(interval);
  }, [presentationStep]); // Se resetea el efecto al cambiar el paso

  const currentSlide = presentationSequence[presentationStep] || { type: 'global', id: 'magnitudes' };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;

  return (
    <div className={`h-screen ${COLORS.background} text-white font-sans overflow-hidden flex flex-col`}>
      
      {/* HEADER TOP (Resumen permanente) */}
      <header className="bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-6 py-4 flex justify-between items-center shadow-lg z-40 shrink-0 h-[80px]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigateTo("mainmenu")} className="p-2 rounded-full hover:bg-white/10 transition-colors group">
              <ArrowLeft className="w-6 h-6 text-gray-400 group-hover:text-white" />
          </button>
          <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <MonitorPlay className="text-blue-500" /> DASHBOARD LIVE
              </h1>
              <p className="text-xs text-gray-400 uppercase tracking-widest">{currentDate.toLocaleString("es-MX", { month: "long", year: "numeric" })}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-2xl border border-white/10 shadow-inner">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-300 mr-2 px-2"><Clock className="w-4 h-4 text-orange-400" /> Resumen Lab:</div>
            {Object.entries(pendientesLaboratorio).map(([dep, count]) => {
                if (count === 0 && dep === "Sin Asignar") return null;
                return (
                    <div key={dep} className="flex items-center gap-2 bg-slate-900 border border-white/5 px-3 py-1.5 rounded-xl shadow-sm">
                        <div className={clsx("w-2 h-2 rounded-full", count > 0 ? "bg-orange-500 animate-pulse" : "bg-emerald-500")} />
                        <span className="text-xs font-semibold text-gray-400">{dep}</span>
                        <span className={clsx("text-base font-black", count > 0 ? "text-orange-400" : "text-emerald-400")}>{count}</span>
                    </div>
                );
            })}
        </div>
      </header>

      {/* ÁREA PRINCIPAL (PRESENTACIÓN ANIMADA) */}
      <main className="flex-1 relative overflow-hidden flex bg-slate-900">
         <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-progress z-50" style={{ width: '100%', animationDuration: `${SLIDE_DURATION}ms`, animationTimingFunction: 'linear', animationIterationCount: 'infinite' }} />

         <AnimatePresence mode="wait">

            {/* ===== SLIDE TIPO 1: DEPARTAMENTOS MONDAY.COM (50/50) ===== */}
            {currentSlide.type === 'department' && (
                <motion.div key={`dept-${currentSlide.id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }} className="w-full h-full flex gap-8 p-8">
                    
                    {/* IZQUIERDA: GRÁFICO TIPO MONDAY */}
                    <div className="w-[45%] flex flex-col h-full bg-slate-800/40 rounded-3xl border border-white/5 p-6 shadow-xl">
                        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                            <BarChart3 className="text-orange-500"/> Equipos por Departamento
                        </h2>
                        <p className="text-sm text-gray-400 mb-8">Mostrando estado actual de la carga de trabajo en laboratorio.</p>
                        
                        <div className="flex-1 min-h-0 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={activeDeptData} margin={{ top: 30, right: 10, left: -20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={14} axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontWeight: 600}} />
                                    <YAxis stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                                    <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={100}>
                                        {activeDeptData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.name === currentSlide.id ? "#f97316" : "#334155"} className="transition-all duration-500" />
                                        ))}
                                        {/* Etiqueta de número encima de la barra estilo monday */}
                                        <LabelList dataKey="total" position="top" fill="#ffffff" fontSize={18} fontWeight="bold" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center mt-4 items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]"></div>
                            <span className="text-sm font-bold text-gray-300">Equipos en Laboratorio</span>
                        </div>
                    </div>

                    {/* DERECHA: TABLA DE EQUIPOS DEL DEPARTAMENTO ACTIVO */}
                    <div className="w-[55%] flex flex-col h-full bg-slate-800/40 rounded-3xl border border-white/5 shadow-xl overflow-hidden">
                        <div className="bg-slate-800/80 px-6 py-4 border-b border-white/10 flex items-center justify-between shadow-sm">
                            <h3 className="text-lg font-bold text-orange-400 uppercase tracking-wider flex items-center gap-2">
                                <Activity size={18} /> Mostrando: {currentSlide.id}
                            </h3>
                            <span className="bg-white/10 text-white px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                                {flatPendientes.filter(eq => eq.dep === currentSlide.id).length} Equipos
                            </span>
                        </div>
                        
                        {/* Cabecera de Tabla */}
                        <div className="flex text-xs text-gray-400 uppercase font-black tracking-widest bg-slate-900/50 px-6 py-3 border-b border-white/5">
                            <div className="w-[30%]">Cliente</div>
                            <div className="w-[30%]">Equipo / Folio</div>
                            <div className="w-[20%] text-center">Cronograma</div>
                            <div className="w-[20%] text-right">Asignado</div>
                        </div>

                        {/* Cuerpo Auto-Scrolleable */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto hide-scrollbar scroll-smooth p-2">
                            {flatPendientes.filter(eq => eq.dep === currentSlide.id).map((eq, idx) => (
                                <div key={eq.docId || idx} className="flex items-center px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors group">
                                    
                                    {/* Cliente */}
                                    <div className="w-[30%] pr-2">
                                        <div className="text-sm font-bold text-blue-300 truncate" title={eq.cliente}>{eq.cliente || "Sin Cliente"}</div>
                                    </div>

                                    {/* Equipo y Folio */}
                                    <div className="w-[30%] pr-2 flex flex-col justify-center">
                                        <div className="text-[13px] font-bold text-gray-200 truncate" title={eq.equipo}>{eq.equipo || "Sin Equipo"}</div>
                                        <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase mt-0.5">{eq.folio || "S/F"}</div>
                                    </div>

                                    {/* SLA Cronograma */}
                                    <div className="w-[20%] flex justify-center">
                                        <div className={clsx("text-xs px-2.5 py-1 rounded shadow-sm bg-black/40 border border-white/5 truncate", eq.statusColor)}>
                                            {eq.daysLabel}
                                        </div>
                                    </div>

                                    {/* Responsable */}
                                    <div className="w-[20%] flex items-center justify-end gap-2">
                                        <UserCircle size={16} className={eq.nombre ? "text-indigo-400" : "text-gray-600"} />
                                        <span className="text-xs font-medium text-gray-300 truncate" title={eq.nombre || eq.assignedTo}>
                                            {eq.nombre || eq.assignedTo ? (eq.nombre || eq.assignedTo).split(' ')[0] : "S/A"}
                                        </span>
                                    </div>
                                </div>
                            ))}

                            {flatPendientes.filter(eq => eq.dep === currentSlide.id).length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-80 gap-3 pt-20">
                                    <CheckCircle size={40} className="text-emerald-500" />
                                    <p className="font-bold">Departamento al día.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ===== SLIDE TIPO 2: METRÓLOGOS (Estilo Horizontal Original) ===== */}
            {currentSlide.type === 'user' && (() => {
                const currentUserObj = metrologosData.find(m => m.name === currentSlide.id);
                if (!currentUserObj) return null;
                const userHojasMes = hojasDeTrabajo.filter(h => cleanName(h.nombre) === currentSlide.id && h.fecha && new Date(h.fecha + 'T00:00:00').getFullYear() === currentDate.getFullYear() && new Date(h.fecha + 'T00:00:00').getMonth() + 1 === currentDate.getMonth() + 1);
                const magMap: Record<string, number> = {};
                userHojasMes.forEach(h => { if(h.magnitud) magMap[h.magnitud] = (magMap[h.magnitud] || 0) + 1; });
                const userMagnitudes = Object.entries(magMap).map(([k,v], i) => ({ name: k, value: v, color: MAGNITUDES_COLORS[k] || FALLBACK_COLORS[i%5] })).sort((a,b)=>b.value - a.value);

                return (
                    <motion.div key={`user-${currentSlide.id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5 }} className="w-full h-full flex items-center gap-8 px-12 py-6">
                        <div className="w-[30%] flex flex-col items-center justify-center shrink-0">
                            <div className="w-40 h-40 rounded-full border-4 flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.4)] mb-8" style={{ borderColor: currentUserObj.color, backgroundColor: `${currentUserObj.color}20` }}><UserCircle size={80} style={{ color: currentUserObj.color }} /></div>
                            <h2 className="text-5xl font-black tracking-tight text-center mb-6 leading-tight" style={{ color: currentUserObj.color, textShadow: `0 0 20px ${currentUserObj.color}40` }}>{currentUserObj.name}</h2>
                            <div className="px-8 py-4 bg-white/5 rounded-3xl border border-white/10 flex flex-col items-center gap-2 shadow-lg"><span className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><Briefcase size={16}/> Equipos Calibrados</span><span className="text-6xl font-black" style={{ color: currentUserObj.color }}>{currentUserObj.total}</span></div>
                        </div>
                        <div className="w-[70%] grid grid-cols-2 gap-6 h-full pb-4">
                            <div className={`p-6 rounded-3xl border ${COLORS.cardBorder} bg-gray-900/80 backdrop-blur-md flex flex-col h-full shadow-xl`}>
                                <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-blue-400"/> Desempeño vs Equipo</h3>
                                <div className="flex-1 min-h-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={metrologosData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false}/><XAxis type="number" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false}/><YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} width={100} /><Bar dataKey="total" radius={[0, 4, 4, 0]}>{metrologosData.map((e,i) => <Cell key={i} fill={e.name === currentSlide.id ? e.color : '#334155'} />)}</Bar></BarChart></ResponsiveContainer></div>
                            </div>
                            <div className={`p-6 rounded-3xl border ${COLORS.cardBorder} bg-gray-900/80 backdrop-blur-md flex flex-col h-full shadow-xl`}>
                                <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2"><Activity size={20} className="text-purple-400"/> Magnitudes Realizadas</h3>
                                <div className="flex-1 flex flex-col min-h-0">
                                    {userMagnitudes.length > 0 ? (
                                        <><div className="h-[55%] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={userMagnitudes} innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">{userMagnitudes.map((e,i) => <Cell key={i} fill={e.color}/>)}</Pie><Tooltip content={<CustomTooltip/>} /></PieChart></ResponsiveContainer></div><div className="h-[45%] overflow-y-auto pr-2 mt-2 space-y-2 hide-scrollbar">{userMagnitudes.map(m => (<div key={m.name} className="flex justify-between items-center p-2.5 bg-white/5 rounded-xl border border-white/5"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: m.color}}></div><span className="text-[13px] font-medium text-gray-200 truncate">{m.name}</span></div><span className="font-bold text-base text-white">{m.value}</span></div>))}</div></>
                                    ) : (<div className="w-full h-full flex items-center justify-center text-gray-500 font-medium">Sin calibraciones este mes.</div>)}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })()}

            {/* ===== SLIDE TIPO 3: MAGNITUDES GLOBALES ===== */}
            {currentSlide.type === 'global' && (
                <motion.div key="magnitudes-global" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5 }} className="w-full h-full flex flex-col items-center justify-center p-10">
                    <div className="text-center mb-8 shrink-0">
                        <h2 className="text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2">Panorama Global</h2>
                        <p className="text-lg text-gray-400">Total de servicios agrupados por disciplina</p>
                    </div>
                    <div className={`w-full max-w-5xl flex-1 p-8 rounded-3xl border ${COLORS.cardBorder} bg-gray-900/80 backdrop-blur-md shadow-2xl`}>
                        {magnitudesGlobalData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={magnitudesGlobalData} layout="vertical" margin={{ top: 0, right: 50, left: 150, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={true} vertical={false} />
                                    <XAxis type="number" stroke="#9CA3AF" fontSize={14} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="name" type="category" stroke="#E5E7EB" fontSize={14} axisLine={false} tickLine={false} width={180} tick={{fill: '#E5E7EB', fontWeight: 600}} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                                    <Bar dataKey="total" name="Calibraciones" radius={[0, 8, 8, 0]}>{magnitudesGlobalData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}</Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (<div className="w-full h-full flex items-center justify-center text-xl text-gray-500">No hay datos registrados aún.</div>)}
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