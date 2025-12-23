import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
  ResponsiveContainer, Sector, CartesianGrid, TooltipProps
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, SortDesc, SortAsc, X, Calendar, 
  Trophy, Activity, Target, ChevronLeft, ChevronRight,
  ShieldCheck, Briefcase, Users, AlertCircle, SearchX, Filter,
  CalendarRange, CalendarDays
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import clsx from "clsx";

// --- CONSTANTES ---
const COLORS = {
  background: "bg-slate-900",
  cardBg: "bg-gray-900/60",
  cardBorder: "border-white/10",
};

const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#ef4444" },
  { name: "Dante Hernández", color: "#3b82f6" },
  { name: "Edgar Amador", color: "#22c55e" },
  { name: "Angel Amador", color: "#14b8a6" },
  { name: "Ricardo Domínguez", color: "#d946ef" },
];
const FALLBACK_COLORS = ["#f59e0b", "#6366f1", "#8b5cf6", "#ec4899", "#64748b"];

const MAGNITUDES_COLORS: Record<string, string> = {
  "Acustica": "#b6cfcb", "Dimensional": "#001e78", "Electrica": "#ffee00",
  "Flujo": "#20cde0", "Fuerza": "#835700", "Humedad": "#6f888c",
  "Frecuencia": "#ff9100", "Optica Trazable": "#4a3419", "Par Torsional Trazable": "#00ff2f",
  "Reporte Diagnostico": "#806c54", "Masa": "#028019", "Par Torsional": "#30306D",
  "Presión": "#6c6cfa", "Temperatura": "#bd0101", "Tiempo": "#f33220",
  "Vibracion Trazable": "#49ae9a", "Vacio": "#bebebe",
};

// --- INTERFACES ---
interface Usuario { id: string; name: string; puesto: string; role?: string; }
interface HojaTrabajo { id: string; nombre: string; fecha: string; magnitud: string; } 
interface DriveMetadata { name: string; created: string; completedByName?: string; reviewedByName?: string; magnitud?: string; }

type SortMode = "order" | "asc" | "desc";
type TabMode = "metrologos" | "calidad";
type ViewMode = "month" | "year"; // <--- NUEVO TIPO DE VISTA

// --- HELPERS ---
const cleanName = (name?: string) => {
    if (!name) return "Desconocido";
    return name.trim();
};

const isQualityRole = (user: Usuario) => {
    const p = (user.puesto || user.role || "").toLowerCase();
    return p.includes('calidad') || p.includes('quality') || p.includes('admin') || p.includes('gerente') || p.includes('manager');
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

// --- COMPONENTE PRINCIPAL ---
const CalibrationStatsScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  
  // Datos
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [hojasDeTrabajo, setHojasDeTrabajo] = useState<HojaTrabajo[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  
  // UI
  const [activeTab, setActiveTab] = useState<TabMode>('metrologos');
  const [viewMode, setViewMode] = useState<ViewMode>('month'); // <--- NUEVO ESTADO: VISTA ANUAL O MENSUAL
  const [sortMode, setSortMode] = useState<SortMode>("order");
  
  // Selección de Usuario
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  
  // Holograma
  const [hologramVisible, setHologramVisible] = useState(false);
  const [selectedMagnitud, setSelectedMagnitud] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Fecha
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // --- 1. CARGA DE DATOS ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const usersSnap = await getDocs(collection(db, "usuarios"));
        setUsuarios(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Usuario)));

        const hojasSnap = await getDocs(collection(db, "hojasDeTrabajo"));
        setHojasDeTrabajo(hojasSnap.docs.map(d => ({ id: d.id, ...d.data() } as HojaTrabajo)));

        const driveSnap = await getDocs(collection(db, "fileMetadata"));
        setDriveFiles(driveSnap.docs.map(d => {
            const data = d.data();
            return { 
                name: data.name, 
                created: data.created || new Date().toISOString(),
                completedByName: data.completedByName,
                reviewedByName: data.reviewedByName,
                magnitud: data.magnitud
            } as DriveMetadata;
        }));

      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchData();
  }, []);

  useEffect(() => { setSelectedUser(null); }, [activeTab]);

  // --- 2. CÁLCULOS ---
  const { 
    metrologosData, 
    qualityData, 
    top3, 
    totalFiltered, // Cambio de nombre a Filtered para reflejar si es mes o año
    magnitudesPie, 
    mesesHistory, 
    qualityHistory, 
    individualStats 
  } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    // --- FUNCIÓN HELPER PARA FILTRAR POR FECHA (MÁGICA) ---
    const isDateInRange = (dateStr: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        // Filtro base: Año
        if (d.getFullYear() !== year) return false;
        // Si la vista es "mensual", filtramos también por mes. Si es "anual", ignoramos el mes.
        if (viewMode === 'month') {
            // Manejo especial para fechas "YYYY-MM-DD" de hojasDeTrabajo vs ISO de Drive
            if (dateStr.includes('-') && !dateStr.includes('T')) {
                const parts = dateStr.split('-');
                return Number(parts[1]) === month;
            }
            return (d.getMonth() + 1) === month;
        }
        return true; // Es el mismo año y estamos en modo 'year', así que pasa.
    };

    // --- TAB 1: METRÓLOGOS ---
    const hojasFiltradas = hojasDeTrabajo.filter(h => isDateInRange(h.fecha));

    const counts: Record<string, number> = {};
    hojasFiltradas.forEach(h => { if(h.nombre) counts[cleanName(h.nombre)] = (counts[cleanName(h.nombre)] || 0) + 1; });

    let statsMet = METROLOGOS_ORDER_COLOR.map(m => ({
        name: m.name, total: counts[cleanName(m.name)] || 0, color: m.color
    }));
    
    Object.keys(counts).forEach((name, i) => {
        if (!statsMet.find(s => cleanName(s.name) === name)) {
            statsMet.push({ name, total: counts[name], color: FALLBACK_COLORS[i % FALLBACK_COLORS.length] });
        }
    });
    
    if (sortMode === "asc") statsMet.sort((a, b) => a.total - b.total);
    else if (sortMode === "desc") statsMet.sort((a, b) => b.total - a.total);
    const ranking = [...statsMet].sort((a, b) => b.total - a.total).slice(0, 3);


    // --- TAB 2: CALIDAD ---
    const driveFiltrados = driveFiles.filter(f => isDateInRange(f.created));

    const qualityMap = new Map<string, { realizado: number, revisado: number }>();
    usuarios.filter(u => isQualityRole(u)).forEach(u => qualityMap.set(cleanName(u.name), { realizado: 0, revisado: 0 }));

    driveFiltrados.forEach(f => {
        if (f.reviewedByName) {
            const validador = cleanName(f.reviewedByName);
            const current = qualityMap.get(validador) || { realizado: 0, revisado: 0 };
            qualityMap.set(validador, { ...current, revisado: current.revisado + 1 });
        }
        if (f.completedByName) {
            const realizador = cleanName(f.completedByName);
            if (qualityMap.has(realizador)) { 
                const current = qualityMap.get(realizador)!;
                qualityMap.set(realizador, { ...current, realizado: current.realizado + 1 });
            }
        }
    });

    const statsQual = Array.from(qualityMap.entries()).map(([name, val]) => ({ name, ...val })).filter(item => item.realizado > 0 || item.revisado > 0); 

    // --- INDIVIDUAL STATS ---
    let hist = []; 
    let qHist = []; 
    let pies = [];
    let single = { total: 0, best: "N/A" };

    if (selectedUser) {
        const userName = cleanName(selectedUser.name);

        if (activeTab === 'metrologos') {
            const userHojas = hojasDeTrabajo.filter(h => cleanName(h.nombre) === userName && h.fecha.startsWith(`${year}-`));
            const historyMap: Record<string, number> = {};
            userHojas.forEach(h => {
                const mKey = h.fecha.substring(0, 7);
                historyMap[mKey] = (historyMap[mKey] || 0) + 1;
            });
            hist = Object.entries(historyMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>({
                mes: new Date(`${k}-02`).toLocaleString("es-MX", { month: "short" }), total: v
            }));
            
            const userHojasFiltered = hojasFiltradas.filter(h => cleanName(h.nombre) === userName);
            const magMap: Record<string, number> = {};
            userHojasFiltered.forEach(h => { if(h.magnitud) magMap[h.magnitud] = (magMap[h.magnitud] || 0) + 1; });
            pies = Object.entries(magMap).map(([k,v], i) => ({
                name: k, value: v, color: MAGNITUDES_COLORS[k] || FALLBACK_COLORS[i%5]
            })).sort((a,b)=>b.value - a.value);
            single.total = userHojasFiltered.length;
            single.best = pies.length > 0 ? pies[0].name : "N/A";
        } 
        else if (activeTab === 'calidad') {
             const userDriveYear = driveFiles.filter(f => {
                 if (!f.created) return false;
                 const d = new Date(f.created);
                 return d.getFullYear() === year && (cleanName(f.reviewedByName) === userName || cleanName(f.completedByName) === userName);
             });

             const qHistoryMap = new Map<string, { realizado: number, revisado: number }>();
             userDriveYear.forEach(f => {
                 const d = new Date(f.created);
                 const sortKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; 
                 if (!qHistoryMap.has(sortKey)) qHistoryMap.set(sortKey, { realizado: 0, revisado: 0 });
                 const curr = qHistoryMap.get(sortKey)!;
                 if (cleanName(f.reviewedByName) === userName) curr.revisado++;
                 if (cleanName(f.completedByName) === userName) curr.realizado++;
             });
             qHist = Array.from(qHistoryMap.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([key, val]) => ({
                    mes: new Date(`${key}-02`).toLocaleString("es-MX", { month: "short" }), ...val
             }));
        }
    }

    return {
        metrologosData: statsMet,
        qualityData: statsQual,
        top3: ranking,
        totalFiltered: activeTab === 'metrologos' ? hojasFiltradas.length : driveFiltrados.length,
        magnitudesPie: pies,
        mesesHistory: hist,
        qualityHistory: qHist,
        individualStats: single
    };

  }, [hojasDeTrabajo, driveFiles, currentDate, sortMode, selectedUser, activeTab, usuarios, viewMode]); // Dependencia clave: viewMode

  // --- HANDLERS ---
  const changeDate = (offset: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + offset);
    else newDate.setFullYear(newDate.getFullYear() + offset);
    setCurrentDate(newDate);
  };

  const handlePieClick = (data: any, index: number, e: any) => {
    setSelectedMagnitud({ ...data, position: { x: e.clientX, y: e.clientY } });
    setHologramVisible(true);
  };
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return <g><Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} style={{ filter: `drop-shadow(0 0 10px ${fill})` }} /><Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12} fill={fill} opacity={0.3} /></g>;
  };

  // Label de Fecha
  const dateLabel = useMemo(() => {
      if (viewMode === 'year') return `AÑO ${currentDate.getFullYear()}`;
      return currentDate.toLocaleString("es-MX", { month: "long", year: "numeric" }).toUpperCase();
  }, [currentDate, viewMode]);

  return (
    <div className={`min-h-screen ${COLORS.background} text-white font-sans selection:bg-blue-500/30 pb-12`}>
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button onClick={() => navigateTo("mainmenu")} className="p-2 rounded-full hover:bg-white/10 transition-colors"><ArrowLeft className="w-6 h-6 text-gray-300" /></button>
          <h1 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 hidden sm:block">SISTEMA DE CALIBRACIÓN</h1>
        </div>
        
        {/* CONTROLES DE FECHA Y VISTA */}
        <div className="flex items-center gap-4 bg-slate-800/50 p-1.5 rounded-2xl border border-white/5">
             {/* Selector Mensual/Anual */}
             <div className="flex bg-slate-900 rounded-xl p-1">
                <button onClick={() => setViewMode('month')} className={clsx("p-2 rounded-lg transition-all", viewMode === 'month' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white")} title="Vista Mensual"><CalendarDays size={18}/></button>
                <button onClick={() => setViewMode('year')} className={clsx("p-2 rounded-lg transition-all", viewMode === 'year' ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white")} title="Vista Anual"><CalendarRange size={18}/></button>
             </div>

             <div className="flex items-center">
                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white/10 rounded-full transition"><ChevronLeft size={18}/></button>
                <div className="px-4 font-mono font-bold text-sm min-w-[140px] flex justify-center gap-2 items-center">
                    {viewMode === 'month' ? <Calendar size={14} className="text-blue-400"/> : <CalendarRange size={14} className="text-purple-400"/>} 
                    {dateLabel}
                </div>
                <button onClick={() => changeDate(1)} className="p-2 hover:bg-white/10 rounded-full transition"><ChevronRight size={18}/></button>
             </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* TAB SWITCHER */}
        <div className="flex justify-center">
            <div className="bg-slate-800/80 p-1.5 rounded-xl border border-white/10 flex gap-2">
                <button onClick={() => setActiveTab('metrologos')} className={clsx("px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", activeTab === 'metrologos' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5")}><Briefcase size={16} /> Metrología</button>
                <button onClick={() => setActiveTab('calidad')} className={clsx("px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", activeTab === 'calidad' ? "bg-emerald-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5")}><ShieldCheck size={16} /> Calidad</button>
            </div>
        </div>

        {/* --- PESTAÑA METRÓLOGOS --- */}
        {activeTab === 'metrologos' && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className={`p-5 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 backdrop-blur-md relative overflow-hidden`}><div className="relative z-10"><p className="text-sm text-gray-400">Total {viewMode === 'year' ? 'Anual' : 'Mensual'}</p><h3 className="text-2xl font-bold text-white">{totalFiltered}</h3></div><div className="absolute right-3 top-3 p-3 bg-blue-500/20 rounded-xl text-blue-400"><Activity size={20}/></div></div>
                     <div className={`p-5 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 backdrop-blur-md relative overflow-hidden`}><div className="relative z-10"><p className="text-sm text-gray-400">Mejor Desempeño</p><h3 className="text-2xl font-bold text-white truncate pr-8">{top3[0]?.name || "-"}</h3></div><div className="absolute right-3 top-3 p-3 bg-yellow-500/20 rounded-xl text-yellow-400"><Trophy size={20}/></div></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 space-y-6">
                        <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 backdrop-blur-md`}>
                            <label className="text-sm font-medium text-gray-400 mb-2 block flex items-center gap-2"><Filter size={14}/> Filtrar por Metrólogo</label>
                            <select value={selectedUser?.id || ""} onChange={(e) => setSelectedUser(usuarios.find(u => u.id === e.target.value) || null)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none hover:bg-slate-750">
                                <option value="">Vista General</option>
                                {usuarios.filter(u => (u.puesto||"").includes("Metrólogo")).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 backdrop-blur-md`}>
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Trophy className="text-yellow-500" size={20}/> Top 3 ({viewMode === 'year' ? 'Año' : 'Mes'})</h3>
                            <div className="space-y-4">{top3.map((m, i) => (<div key={m.name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i===0?'bg-yellow-500/20 text-yellow-500':'bg-gray-700 text-gray-400'}`}>#{i+1}</div><span className="text-sm font-medium">{m.name}</span></div><span className="font-mono font-bold">{m.total}</span></div>))}</div>
                        </div>
                    </div>

                    <div className="lg:col-span-8 space-y-6">
                        {selectedUser ? (
                            <div className="grid grid-cols-1 gap-6">
                                <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 h-[300px]`}>
                                    <h3 className="font-bold mb-4">Historial Anual: {selectedUser.name}</h3>
                                    <ResponsiveContainer width="100%" height="100%"><BarChart data={mesesHistory}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false}/><XAxis dataKey="mes" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false}/><YAxis stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false}/><Tooltip content={<CustomTooltip/>}/><Bar dataKey="total" fill={METROLOGOS_ORDER_COLOR.find(m=>m.name===selectedUser?.name)?.color || COLORS.accent} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>
                                </div>
                                {viewMode === 'month' && (
                                    <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 h-[300px] flex items-center`}><ResponsiveContainer width="50%" height="100%"><PieChart><Pie activeIndex={activeIndex} activeShape={renderActiveShape} data={magnitudesPie} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onMouseEnter={(_, index) => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(-1)} onClick={handlePieClick}>{magnitudesPie.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip content={<CustomTooltip/>}/></PieChart></ResponsiveContainer><div className="w-1/2 h-full overflow-y-auto"><h4 className="font-bold mb-2">Magnitudes</h4>{magnitudesPie.map(m=><div key={m.name} className="flex justify-between text-sm p-1 border-b border-white/5"><span>{m.name}</span><span>{m.value}</span></div>)}</div></div>
                                )}
                            </div>
                        ) : (
                            <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 min-h-[500px]`}>
                                <div className="flex justify-between items-center mb-6"><h3 className="font-bold">Comparativa Global {viewMode === 'year' ? '(Anual)' : '(Mensual)'}</h3><div className="flex bg-slate-800 p-1 rounded-lg">{(['order','desc','asc'] as SortMode[]).map(m=><button key={m} onClick={()=>setSortMode(m)} className={`p-2 rounded ${sortMode===m?'bg-blue-600':'text-gray-400'}`}>{m==='order'?<SortDesc className="rotate-90" size={16}/>:m==='desc'?<SortDesc size={16}/>:<SortAsc size={16}/>}</button>)}</div></div>
                                <div className="h-[400px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={metrologosData}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false}/><XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false} tick={{fill: '#9CA3AF'}} interval={0} /><YAxis stroke="#9CA3AF" fontSize={12} axisLine={false} tickLine={false}/><Tooltip content={<CustomTooltip/>}/><Bar dataKey="total" radius={[4,4,0,0]}>{metrologosData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar></BarChart></ResponsiveContainer></div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        )}

        {/* --- PESTAÑA CALIDAD --- */}
        {activeTab === 'calidad' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                 {/* KPIs Calidad */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className={`p-5 rounded-2xl border ${COLORS.cardBorder} bg-emerald-900/20 backdrop-blur-md relative overflow-hidden`}><div className="relative z-10"><p className="text-sm text-emerald-400">Validaciones {viewMode === 'year' ? 'Anuales' : 'Mensuales'}</p><h3 className="text-2xl font-bold text-white">{qualityData.reduce((a,b)=>a+b.revisado,0)}</h3></div><div className="absolute right-3 top-3 p-3 bg-emerald-500/20 rounded-xl text-emerald-400"><ShieldCheck size={20}/></div></div>
                     <div className={`p-5 rounded-2xl border ${COLORS.cardBorder} bg-blue-900/20 backdrop-blur-md relative overflow-hidden`}><div className="relative z-10"><p className="text-sm text-blue-400">Realizados {viewMode === 'year' ? 'Anuales' : 'Mensuales'}</p><h3 className="text-2xl font-bold text-white">{qualityData.reduce((a,b)=>a+b.realizado,0)}</h3></div><div className="absolute right-3 top-3 p-3 bg-blue-500/20 rounded-xl text-blue-400"><Briefcase size={20}/></div></div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* FILTRO CALIDAD */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className={`p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/10 backdrop-blur-md`}>
                            <label className="text-sm font-medium text-emerald-400 mb-2 block flex items-center gap-2"><Filter size={14}/> Filtrar por Usuario</label>
                            <select value={selectedUser?.id || ""} onChange={(e) => setSelectedUser(usuarios.find(u => u.id === e.target.value) || null)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none hover:bg-slate-750 focus:border-emerald-500 transition-colors">
                                <option value="">Vista General del Equipo</option>
                                {usuarios.filter(u => isQualityRole(u)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        {selectedUser && (
                            <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/10 backdrop-blur-md">
                                <h4 className="text-emerald-100 font-bold mb-1">Resumen Anual</h4>
                                <p className="text-xs text-emerald-400/60 mb-4">{selectedUser.name}</p>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm"><span className="text-gray-400">Total Validaciones</span> <span className="text-white font-mono">{qualityHistory.reduce((acc, curr) => acc + curr.revisado, 0)}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-gray-400">Total Realizados</span> <span className="text-white font-mono">{qualityHistory.reduce((acc, curr) => acc + curr.realizado, 0)}</span></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* GRÁFICAS CALIDAD */}
                    <div className="lg:col-span-8">
                        <div className={`p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/10 backdrop-blur-md min-h-[500px]`}>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-emerald-100 flex items-center gap-2">
                                        <ShieldCheck className="text-emerald-400"/> {selectedUser ? `Historial: ${selectedUser.name}` : `Desempeño Global ${viewMode === 'year' ? '(Anual)' : '(Mensual)'}`}
                                    </h3>
                                    <p className="text-sm text-emerald-400/60">
                                        {selectedUser ? "Evolución mensual de validaciones y servicios" : `Datos consolidados ${viewMode === 'year' ? 'de todo el año' : 'del mes actual'}`}
                                    </p>
                                </div>
                                <div className="flex gap-4 text-xs font-bold uppercase">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> Realizados</div>
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full"></div> Validados</div>
                                </div>
                            </div>
                            
                            {selectedUser ? (
                                /* VISTA INDIVIDUAL */
                                qualityHistory.length > 0 ? (
                                    <div className="h-[400px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={qualityHistory} barGap={8}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} /><XAxis dataKey="mes" stroke="#E5E7EB" fontSize={12} tickLine={false} axisLine={false} tick={{fill: '#E5E7EB', fontWeight: 600}} /><YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} /><Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} /><Bar dataKey="realizado" name="Realizados" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={1000} /><Bar dataKey="revisado" name="Validados" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={1000} /></BarChart></ResponsiveContainer></div>
                                ) : (
                                    <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 gap-2"><SearchX size={64} className="opacity-20 mb-2"/><p>Este usuario no tiene actividad registrada este año.</p></div>
                                )
                            ) : (
                                /* VISTA GLOBAL */
                                qualityData.length > 0 ? (
                                    <div className="h-[400px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={qualityData} barGap={8}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} /><XAxis dataKey="name" stroke="#E5E7EB" fontSize={12} tickLine={false} axisLine={false} tick={{fill: '#E5E7EB', fontWeight: 600}} /><YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} /><Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} /><Bar dataKey="realizado" name="Realizados" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={1000} /><Bar dataKey="revisado" name="Validados" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={1000} /></BarChart></ResponsiveContainer></div>
                                ) : (
                                    <div className="h-[300px] flex flex-col items-center justify-center text-gray-400 gap-2"><SearchX size={64} className="opacity-20 mb-2"/><p className="font-medium text-lg">No se encontró actividad de calidad {viewMode === 'year' ? 'en todo el año' : 'este mes'}</p></div>
                                )
                            )}
                        </div>
                    </div>
                 </div>
            </motion.div>
        )}
      </main>

      {/* HOLOGRAM POPUP */}
      {hologramVisible && selectedMagnitud && (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHologramVisible(false)}>
            <motion.div className="relative perspective-1000" initial={{ scale: 0.8, opacity: 0, rotateX: 20 }} animate={{ scale: 1, opacity: 1, rotateX: 0 }} exit={{ scale: 0.8, opacity: 0, rotateX: -20 }} onClick={(e) => e.stopPropagation()}>
                <div className="relative bg-black/80 border border-white/10 rounded-3xl p-8 w-[400px] overflow-hidden" style={{ boxShadow: `0 0 50px ${selectedMagnitud.color}30, inset 0 0 20px ${selectedMagnitud.color}10` }}>
                <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-full w-full animate-scan" style={{ animationDuration: '3s' }} />
                <button onClick={() => setHologramVisible(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"><X size={24} /></button>
                <div className="flex flex-col items-center relative z-10">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.2 }} className="w-32 h-32 rounded-full border-4 border-double flex items-center justify-center mb-6 relative" style={{ borderColor: selectedMagnitud.color }}>
                    <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: selectedMagnitud.color }} /><span className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{selectedMagnitud.value}</span>
                    </motion.div>
                    <h2 className="text-2xl font-bold text-center mb-2" style={{ color: selectedMagnitud.color, textShadow: `0 0 20px ${selectedMagnitud.color}` }}>{selectedMagnitud.name}</h2>
                    <div className="bg-white/5 px-4 py-1 rounded-full border border-white/10 text-xs text-gray-300 tracking-widest uppercase">Magnitud Analizada</div>
                </div>
                </div>
            </motion.div>
            </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default CalibrationStatsScreen;