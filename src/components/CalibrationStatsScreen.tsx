import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
  ResponsiveContainer, Sector, CartesianGrid
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, SortDesc, SortAsc, X, Calendar, 
  Trophy, Activity, ChevronLeft, ChevronRight,
  ShieldCheck, Briefcase, SearchX, Filter,
  CalendarRange, CalendarDays, BarChart3,
  PlayCircle, StopCircle, Monitor
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";
import clsx from "clsx";
import {
  CALIBRATION_COLORS,
  METROLOGOS_ORDER_COLOR,
  FALLBACK_CHART_COLORS,
  MAGNITUDES_COLORS,
  cleanName,
  parseDateRobust,
  isQualityRole,
  isMetrologyRole,
  CalibrationChartTooltip,
  UsuarioRow,
} from "../utils/calibrationShared.tsx";

const COLORS = CALIBRATION_COLORS;
const FALLBACK_COLORS = FALLBACK_CHART_COLORS;

// --- INTERFACES ---
interface HojaTrabajo { id: string; nombre: string; fecha: string; magnitud: string; } 
interface DriveMetadata { name: string; created: string | null; completedByName?: string; reviewedByName?: string; magnitud?: string; }

type SortMode = "order" | "asc" | "desc";
type TabMode = "metrologos" | "calidad" | "magnitudes";
type ViewMode = "month" | "year";

// --- COMPONENTE PRINCIPAL ---
const CalibrationStatsScreen: React.FC = () => {
  const { navigateTo, goBack } = useNavigation();
  
  // Datos
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [hojasDeTrabajo, setHojasDeTrabajo] = useState<HojaTrabajo[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI
  const [activeTab, setActiveTab] = useState<TabMode>('metrologos');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [selectedUserName, setSelectedUserName] = useState<string>("");
  
  // Holograma
  const [hologramVisible, setHologramVisible] = useState(false);
  const [selectedMagnitud, setSelectedMagnitud] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Fecha
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // --- ESTADOS PARA LA PRESENTACIÓN ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [presentationStep, setPresentationStep] = useState(0);
  const SLIDE_DURATION = 10000; // 10 segundos por pantalla

  // --- 1. CARGA DE DATOS ---
  useEffect(() => {
    setLoading(true);
    const unsubUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UsuarioRow));
      setUsuarios(data);
    });

    const unsubHojas = onSnapshot(collection(db, "hojasDeTrabajo"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as HojaTrabajo));
      setHojasDeTrabajo(data);
    });

    const unsubDrive = onSnapshot(collection(db, "fileMetadata"), (snapshot) => {
      const data = snapshot.docs.map(d => {
          const fileData = d.data();
          return { 
              name: fileData.name, 
              created: fileData.created || fileData.updated || null, 
              completedByName: fileData.completedByName,
              reviewedByName: fileData.reviewedByName,
              magnitud: fileData.magnitud
          } as DriveMetadata;
      });
      setDriveFiles(data);
      setLoading(false);
    });

    return () => { unsubUsuarios(); unsubHojas(); unsubDrive(); };
  }, []);

  // Reset selección al cambiar tab manualmente
  useEffect(() => { 
      if (!isPlaying) setSelectedUserName(""); 
  }, [activeTab, isPlaying]);

  // --- 2. CÁLCULOS PRINCIPALES ---
  const { 
    uniqueUserList, 
    metrologosData, 
    qualityData, 
    top3, 
    totalFiltered, 
    magnitudesPie, 
    mesesHistory, 
    qualityHistory, 
    magnitudesGlobalData,
    topMagnitud
  } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    const validMetrologosNames = new Set(usuarios.filter(u => isMetrologyRole(u)).map(u => cleanName(u.name || u.nombre)));
    const validQualityNames = new Set(usuarios.filter(u => isQualityRole(u)).map(u => cleanName(u.name || u.nombre)));

    const isDateInRange = (dateStr: any) => {
        const d = parseDateRobust(dateStr);
        if (!d) return false;
        if (d.getFullYear() !== year) return false;
        if (viewMode === 'month') return (d.getMonth() + 1) === month;
        return true; 
    };

    const hojasFiltradas = hojasDeTrabajo.filter(h => isDateInRange(h.fecha));
    const driveFiltrados = driveFiles.filter(f => isDateInRange(f.created));

    // METRÓLOGOS
    const countsMet: Record<string, number> = {};
    let totalMetCount = 0;
    hojasFiltradas.forEach(h => { 
        const name = cleanName(h.nombre);
        if (name && validMetrologosNames.has(name)) {
            countsMet[name] = (countsMet[name] || 0) + 1;
            totalMetCount++;
        }
    });

    let statsMet = METROLOGOS_ORDER_COLOR.map(m => ({
        name: m.name, total: countsMet[cleanName(m.name)] || 0, color: m.color
    })).filter(item => validMetrologosNames.has(cleanName(item.name)));

    if (sortMode === "asc") statsMet.sort((a, b) => a.total - b.total);
    else if (sortMode === "desc") statsMet.sort((a, b) => b.total - a.total);
    
    const ranking = [...statsMet].sort((a, b) => b.total - a.total).slice(0, 3);

    // CALIDAD
    const qualityMap = new Map<string, { realizado: number, revisado: number }>();
    validQualityNames.forEach(name => qualityMap.set(name, { realizado: 0, revisado: 0 }));

    driveFiltrados.forEach(f => {
        const reviewer = cleanName(f.reviewedByName);
        const completer = cleanName(f.completedByName);
        if (reviewer && validQualityNames.has(reviewer)) {
             const current = qualityMap.get(reviewer)!;
             qualityMap.set(reviewer, { ...current, revisado: current.revisado + 1 });
        }
        if (completer && validQualityNames.has(completer)) {
             const current = qualityMap.get(completer)!;
             qualityMap.set(completer, { ...current, realizado: current.realizado + 1 });
        }
    });
    const statsQual = Array.from(qualityMap.entries()).map(([name, val]) => ({ name, ...val })).filter(item => item.realizado > 0 || item.revisado > 0); 

    // MAGNITUDES
    const magGlobalMap: Record<string, number> = {};
    hojasFiltradas.forEach(h => { if (h.magnitud) magGlobalMap[h.magnitud] = (magGlobalMap[h.magnitud] || 0) + 1; });
    const magnitudesGlobalStats = Object.entries(magGlobalMap).map(([name, total], i) => ({
        name, total, color: MAGNITUDES_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
    })).sort((a, b) => b.total - a.total); 
    const bestMagnitud = magnitudesGlobalStats.length > 0 ? magnitudesGlobalStats[0] : null;

    let dropdownList: string[] = activeTab === 'metrologos' ? statsMet.map(s => s.name) : Array.from(validQualityNames);
    dropdownList.sort();

    // INDIVIDUAL
    let hist = [], qHist = [], pies = [];
    if (selectedUserName) {
        if (activeTab === 'metrologos') {
            const userHojas = hojasDeTrabajo.filter(h => {
                const d = parseDateRobust(h.fecha);
                return d && d.getFullYear() === year && cleanName(h.nombre) === selectedUserName;
            });
            const historyMap: Record<string, number> = {};
            userHojas.forEach(h => {
                const d = parseDateRobust(h.fecha)!;
                const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                historyMap[mKey] = (historyMap[mKey] || 0) + 1;
            });
            hist = Object.entries(historyMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>({
                mes: new Date(`${k}-02`).toLocaleString("es-MX", { month: "short" }), total: v
            }));
            const userHojasFiltered = hojasFiltradas.filter(h => cleanName(h.nombre) === selectedUserName);
            const magMap: Record<string, number> = {};
            userHojasFiltered.forEach(h => { if(h.magnitud) magMap[h.magnitud] = (magMap[h.magnitud] || 0) + 1; });
            pies = Object.entries(magMap).map(([k,v], i) => ({
                name: k, value: v, color: MAGNITUDES_COLORS[k] || FALLBACK_COLORS[i%5]
            })).sort((a,b)=>b.value - a.value);
        } else if (activeTab === 'calidad') {
             const userDriveYear = driveFiles.filter(f => {
                 const d = parseDateRobust(f.created);
                 return d && d.getFullYear() === year && (cleanName(f.reviewedByName) === selectedUserName || cleanName(f.completedByName) === selectedUserName);
             });
             const qHistoryMap = new Map<string, { realizado: number, revisado: number }>();
             userDriveYear.forEach(f => {
                 const d = parseDateRobust(f.created)!; 
                 const sortKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; 
                 if (!qHistoryMap.has(sortKey)) qHistoryMap.set(sortKey, { realizado: 0, revisado: 0 });
                 const curr = qHistoryMap.get(sortKey)!;
                 if (cleanName(f.reviewedByName) === selectedUserName) curr.revisado++;
                 if (cleanName(f.completedByName) === selectedUserName) curr.realizado++;
             });
             qHist = Array.from(qHistoryMap.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([key, val]) => ({
                    mes: new Date(`${key}-02`).toLocaleString("es-MX", { month: "short" }), ...val
             }));
        }
    }

    return {
        uniqueUserList: dropdownList,
        metrologosData: statsMet,
        qualityData: statsQual,
        magnitudesGlobalData: magnitudesGlobalStats,
        topMagnitud: bestMagnitud,
        top3: ranking,
        totalFiltered: activeTab === 'metrologos' ? totalMetCount : statsQual.reduce((acc, curr) => acc + curr.realizado + curr.revisado, 0),
        magnitudesPie: pies,
        mesesHistory: hist,
        qualityHistory: qHist
    };
  }, [hojasDeTrabajo, driveFiles, currentDate, sortMode, selectedUserName, activeTab, usuarios, viewMode]);

  // --- LÓGICA DE LA PRESENTACIÓN ---
  const presentationUsers = useMemo(() => metrologosData.map(m => m.name), [metrologosData]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setTimeout(() => {
        setPresentationStep((prev) => (prev + 1) > presentationUsers.length ? 0 : (prev + 1));
      }, SLIDE_DURATION);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, presentationStep, presentationUsers.length]);

  useEffect(() => {
    if (!isPlaying) return;
    if (presentationStep < presentationUsers.length) {
      setActiveTab('metrologos');
      setSelectedUserName(presentationUsers[presentationStep]);
    } else {
      setActiveTab('magnitudes');
      setSelectedUserName("");
    }
  }, [presentationStep, isPlaying, presentationUsers]);

  // --- HANDLERS ---
  const changeDate = (offset: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + offset);
    else newDate.setFullYear(newDate.getFullYear() + offset);
    setCurrentDate(newDate);
  };

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return <g><Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} style={{ filter: `drop-shadow(0 0 10px ${fill})` }} /><Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12} fill={fill} opacity={0.3} /></g>;
  };

  const dateLabel = useMemo(() => viewMode === 'year' ? `AÑO ${currentDate.getFullYear()}` : currentDate.toLocaleString("es-MX", { month: "long", year: "numeric" }).toUpperCase(), [currentDate, viewMode]);

  return (
    <div className={`min-h-full flex-shrink-0 flex flex-col ${COLORS.background} text-white font-sans selection:bg-blue-500/30 pb-12`}>
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-lg gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button onClick={goBack} className="p-2 rounded-full hover:bg-white/10 transition-colors"><ArrowLeft className="w-6 h-6 text-gray-300" /></button>
          <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 hidden sm:block">SISTEMA DE CALIBRACIÓN</h1>
              <button onClick={() => navigateTo("tvdashboard")} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 hover:bg-indigo-500/20 transition-all text-xs font-bold" title="Abrir Modo TV"><Monitor size={14} /><span className="hidden lg:inline">MODO TV</span></button>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-slate-800/50 p-1.5 rounded-2xl border border-white/5">
             <div className="flex bg-slate-900 rounded-xl p-1">
                <button onClick={() => setViewMode('month')} className={clsx("p-2 rounded-lg transition-all", viewMode === 'month' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white")}><CalendarDays size={18}/></button>
                <button onClick={() => setViewMode('year')} className={clsx("p-2 rounded-lg transition-all", viewMode === 'year' ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white")}><CalendarRange size={18}/></button>
             </div>
             <div className="flex items-center">
                <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white/10 rounded-full transition"><ChevronLeft size={18}/></button>
                <div className="px-4 font-mono font-bold text-sm min-w-[140px] flex justify-center gap-2 items-center">
                    {viewMode === 'month' ? <Calendar size={14} className="text-blue-400"/> : <CalendarRange size={14} className="text-purple-400"/>} {dateLabel}
                </div>
                <button onClick={() => changeDate(1)} className="p-2 hover:bg-white/10 rounded-full transition"><ChevronRight size={18}/></button>
             </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        <div className="flex justify-center">
            <div className="bg-slate-800/80 p-1.5 rounded-xl border border-white/10 flex flex-wrap justify-center gap-2">
                <button onClick={() => { setActiveTab('metrologos'); setIsPlaying(false); }} className={clsx("px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", activeTab === 'metrologos' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5")}><Briefcase size={16} /> Metrología</button>
                <button onClick={() => { setActiveTab('calidad'); setIsPlaying(false); }} className={clsx("px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", activeTab === 'calidad' ? "bg-emerald-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5")}><ShieldCheck size={16} /> Calidad</button>
                <button onClick={() => { setActiveTab('magnitudes'); setIsPlaying(false); }} className={clsx("px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", activeTab === 'magnitudes' ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5")}><BarChart3 size={16} /> Magnitudes</button>
                <div className="w-px bg-white/10 mx-2 hidden sm:block" />
                <button onClick={() => { if (!isPlaying) setPresentationStep(0); setIsPlaying(!isPlaying); }} className={clsx("px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all border", isPlaying ? "bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:bg-red-500/30" : "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 hover:bg-indigo-500/30")}>
                    {isPlaying ? <><StopCircle size={16} /> Detener</> : <><PlayCircle size={16} /> Presentación</>}
                </button>
            </div>
        </div>

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
                            <select value={selectedUserName} onChange={(e) => setSelectedUserName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none hover:bg-slate-750">
                                <option value="">Vista General</option>{uniqueUserList.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </div>
                        <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 backdrop-blur-md`}><h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Trophy className="text-yellow-500" size={20}/> Top 3</h3><div className="space-y-4">{top3.map((m, i) => (<div key={m.name} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i===0?'bg-yellow-500/20 text-yellow-500':'bg-gray-700 text-gray-400'}`}>#{i+1}</div><span className="text-sm font-medium">{m.name}</span></div><span className="font-mono font-bold">{m.total}</span></div>))}</div></div>
                    </div>
                    <div className="lg:col-span-8 space-y-6">
                        {selectedUserName ? (
                            <div className="grid grid-cols-1 gap-6">
                                <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 h-[300px]`}><h3 className="font-bold mb-4">Historial: {selectedUserName}</h3><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={mesesHistory}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false}/><XAxis dataKey="mes" stroke="#94a3b8" fontSize={12}/><YAxis stroke="#94a3b8" fontSize={12}/><Tooltip content={<CalibrationChartTooltip/>}/><Bar dataKey="total" fill={METROLOGOS_ORDER_COLOR.find(m=>m.name===selectedUserName)?.color || "#3b82f6"} radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
                                {viewMode === 'month' && (<div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 h-[300px] flex items-center`}><ResponsiveContainer width="50%" height="100%" minWidth={1} minHeight={1}><PieChart><Pie activeIndex={activeIndex} activeShape={renderActiveShape} data={magnitudesPie} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onMouseEnter={(_, index) => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(-1)} onClick={(e, i) => {setSelectedMagnitud({...e, position:{x:0, y:0}}); setHologramVisible(true);}}>{magnitudesPie.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip content={<CalibrationChartTooltip/>}/></PieChart></ResponsiveContainer><div className="w-1/2 h-full overflow-y-auto"><h4 className="font-bold mb-2">Magnitudes</h4>{magnitudesPie.map(m=><div key={m.name} className="flex justify-between text-sm p-1 border-b border-white/5"><span>{m.name}</span><span>{m.value}</span></div>)}</div></div>)}
                            </div>
                        ) : (
                            <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 min-h-[500px]`}><div className="flex justify-between items-center mb-6"><h3 className="font-bold">Comparativa Global</h3><div className="flex bg-slate-800 p-1 rounded-lg">{(['order','desc','asc'] as SortMode[]).map(m=><button key={m} onClick={()=>setSortMode(m)} className={`p-2 rounded ${sortMode===m?'bg-blue-600':'text-gray-400'}`}>{m==='order'?<SortDesc className="rotate-90" size={16}/>:m==='desc'?<SortDesc size={16}/>:<SortAsc size={16}/>}</button>)}</div></div><div className="h-[400px]"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={metrologosData}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false}/><XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} interval={0} /><YAxis stroke="#9CA3AF" fontSize={12}/><Tooltip content={<CalibrationChartTooltip/>}/><Bar dataKey="total" radius={[4,4,0,0]}>{metrologosData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar></BarChart></ResponsiveContainer></div></div>
                        )}
                    </div>
                </div>
            </motion.div>
        )}

        {activeTab === 'calidad' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className={`p-5 rounded-2xl border ${COLORS.cardBorder} bg-emerald-900/20 backdrop-blur-md relative overflow-hidden`}><div className="relative z-10"><p className="text-sm text-emerald-400">Validaciones</p><h3 className="text-2xl font-bold text-white">{qualityData.reduce((a,b)=>a+b.revisado,0)}</h3></div><div className="absolute right-3 top-3 p-3 bg-emerald-500/20 rounded-xl text-emerald-400"><ShieldCheck size={20}/></div></div>
                 </div>
                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4"><div className={`p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/10`}><label className="text-sm text-emerald-400 mb-2 block">Filtrar por Usuario</label><select value={selectedUserName} onChange={(e) => setSelectedUserName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 outline-none">{uniqueUserList.map(name => <option key={name} value={name}>{name}</option>)}</select></div></div>
                    <div className="lg:col-span-8"><div className={`p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/10 min-h-[500px]`}><div className="h-[400px]"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={selectedUserName ? qualityHistory : qualityData}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} /><XAxis dataKey={selectedUserName ? "mes" : "name"} stroke="#E5E7EB" fontSize={12} /><YAxis stroke="#9CA3AF" fontSize={12} /><Tooltip content={<CalibrationChartTooltip />} /><Bar dataKey="realizado" fill="#3b82f6" radius={[4, 4, 0, 0]} /><Bar dataKey="revisado" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div></div>
                 </div>
            </motion.div>
        )}

        {activeTab === 'magnitudes' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                     <div className={`p-5 rounded-2xl border ${COLORS.cardBorder} bg-purple-900/20 backdrop-blur-md relative overflow-hidden`}><div className="relative z-10"><p className="text-sm text-purple-400">Magnitud Top</p><h3 className="text-2xl font-bold text-white truncate">{topMagnitud?.name || "N/A"}</h3></div><div className="absolute right-3 top-3 p-3 bg-purple-500/20 rounded-xl text-purple-400"><Trophy size={20}/></div></div>
                 </div>
                 <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} bg-gray-900/60 min-h-[500px]`}><div className="h-[600px] w-full"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={magnitudesGlobalData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} /><XAxis type="number" stroke="#9CA3AF" fontSize={12}/><YAxis dataKey="name" type="category" stroke="#E5E7EB" fontSize={12} width={150}/><Tooltip content={<CalibrationChartTooltip />} /><Bar dataKey="total" radius={[0, 4, 4, 0]}>{magnitudesGlobalData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar></BarChart></ResponsiveContainer></div></div>
            </motion.div>
        )}
      </main>

      {/* MODAL HOLOGRAMA */}
      {hologramVisible && selectedMagnitud && (
        <AnimatePresence><motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHologramVisible(false)}><motion.div className="relative bg-black/80 border border-white/10 rounded-3xl p-8 w-[400px]" initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} onClick={(e) => e.stopPropagation()} style={{ boxShadow: `0 0 50px ${selectedMagnitud.color}30` }}><button onClick={() => setHologramVisible(false)} className="absolute top-4 right-4 text-white/50"><X size={24} /></button><div className="flex flex-col items-center"><div className="w-32 h-32 rounded-full border-4 flex items-center justify-center mb-6" style={{ borderColor: selectedMagnitud.color }}><span className="text-4xl font-black text-white">{selectedMagnitud.value || selectedMagnitud.total}</span></div><h2 className="text-2xl font-bold" style={{ color: selectedMagnitud.color }}>{selectedMagnitud.name}</h2></div></motion.div></motion.div></AnimatePresence>
      )}
    </div>
  );
};

export default CalibrationStatsScreen;