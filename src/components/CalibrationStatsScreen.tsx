import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, XAxis, YAxis,
  ResponsiveContainer, Sector, CartesianGrid, TooltipProps
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, SortDesc, SortAsc, X, Calendar, 
  Trophy, Activity, Target, ChevronLeft, ChevronRight 
} from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";

// --- UTILIDADES ---
function blendColorWithWhite(hex: string, amount: number = 0.7) {
  let c = hex.replace("#", "").substring(0, 6);
  let r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
  r = Math.round(r + (255 - r) * amount);
  g = Math.round(g + (255 - g) * amount);
  b = Math.round(b + (255 - b) * amount);
  return `rgba(${r},${g},${b},0.8)`;
}

// --- CONSTANTES DE DISEÑO ---
const COLORS = {
  background: "bg-slate-900",
  cardBg: "bg-gray-900/60",
  cardBorder: "border-white/10",
  textPrimary: "text-gray-100",
  textSecondary: "text-gray-400",
  accent: "#3B82F6",
};

const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#ef4444" }, // Red-500
  { name: "Dante Hernández", color: "#3b82f6" }, // Blue-500
  { name: "Edgar Amador", color: "#22c55e" }, // Green-500
  { name: "Angel Amador", color: "#14b8a6" }, // Teal-500
  { name: "Ricardo Domínguez", color: "#d946ef" }, // Fuchsia-500
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
interface Usuario { id: string; name: string; puesto: string; }
interface HojaTrabajo { id: string; nombre: string; fecha: string; magnitud: string; }
type SortMode = "order" | "asc" | "desc";

// --- COMPONENTES UI REUTILIZABLES ---

const CustomTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800/95 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md">
        <p className="text-slate-300 text-xs mb-1 font-medium">{label}</p>
        <p className="text-white font-bold text-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].color || payload[0].payload.fill }} />
          {payload[0].value} <span className="text-xs font-normal text-slate-400">calibraciones</span>
        </p>
      </div>
    );
  }
  return null;
};

const KPICard = ({ title, value, icon: Icon, trend, color = "blue" }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`relative overflow-hidden rounded-2xl border ${COLORS.cardBorder} ${COLORS.cardBg} backdrop-blur-md p-5`}
  >
    <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${color}-500/10 rounded-full blur-2xl`} />
    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-sm font-medium text-gray-400 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-white">{value}</h3>
        {trend && <p className="text-xs text-emerald-400 mt-1">{trend}</p>}
      </div>
      <div className={`p-3 rounded-xl bg-${color}-500/20 text-${color}-400`}>
        <Icon size={20} />
      </div>
    </div>
  </motion.div>
);

// --- COMPONENTE HOLOGRAMA (Optimizado) ---
const HologramMagnitudPopup = ({ magnitud, valor, color, onClose }: any) => (
  <AnimatePresence>
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
    >
      <motion.div
        className="relative perspective-1000"
        initial={{ scale: 0.8, opacity: 0, rotateX: 20 }}
        animate={{ scale: 1, opacity: 1, rotateX: 0 }}
        exit={{ scale: 0.8, opacity: 0, rotateX: -20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="relative bg-black/80 border border-white/10 rounded-3xl p-8 w-[400px] overflow-hidden"
          style={{ boxShadow: `0 0 50px ${color}30, inset 0 0 20px ${color}10` }}
        >
          {/* Líneas de escaneo holográfico */}
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-full w-full animate-scan" style={{ animationDuration: '3s' }} />
          
          <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
            <X size={24} />
          </button>

          <div className="flex flex-col items-center relative z-10">
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }} 
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="w-32 h-32 rounded-full border-4 border-double flex items-center justify-center mb-6 relative"
              style={{ borderColor: color }}
            >
              <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: color }} />
              <span className="text-4xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                {valor}
              </span>
            </motion.div>
            
            <h2 className="text-2xl font-bold text-center mb-2" style={{ color: color, textShadow: `0 0 20px ${color}` }}>
              {magnitud}
            </h2>
            <div className="bg-white/5 px-4 py-1 rounded-full border border-white/10 text-xs text-gray-300 tracking-widest uppercase">
              Magnitud Analizada
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  </AnimatePresence>
);

// --- COMPONENTE PRINCIPAL ---
const CalibrationStatsScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  
  // Estados
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [metrologoSeleccionado, setMetrologoSeleccionado] = useState<Usuario | null>(null);
  const [todasLasHojas, setTodasLasHojas] = useState<HojaTrabajo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("order");
  
  // Holograma
  const [hologramVisible, setHologramVisible] = useState(false);
  const [selectedMagnitud, setSelectedMagnitud] = useState<any>(null);

  // Fecha (Controlada con fecha objeto para mejor manipulación)
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // --- EFECTOS DE CARGA ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Usuarios
        const qUsers = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
        const snapUsers = await getDocs(qUsers);
        const listaUsers = snapUsers.docs.map(d => ({ id: d.id, ...d.data() } as Usuario));
        setUsuarios(listaUsers);

        // Todas las hojas (para stats globales)
        const snapHojas = await getDocs(collection(db, "hojasDeTrabajo"));
        const listaHojas = snapHojas.docs.map(d => ({ id: d.id, ...d.data() } as HojaTrabajo));
        setTodasLasHojas(listaHojas);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- MEMOIZED CALCULATIONS (OPTIMIZACIÓN) ---
  const { 
    metrologosTotales, 
    top3, 
    totalMes, 
    dataMagnitudes, 
    dataMesesMetrologo,
    metrologoStats 
  } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1; // 1-12

    // Filtrar hojas del mes seleccionado
    const hojasMes = todasLasHojas.filter(h => {
      if (!h.fecha) return false;
      const [y, m] = h.fecha.split("-").map(Number);
      return y === year && m === month;
    });

    // Stats Globales por Metrólogo
    const counts: Record<string, number> = {};
    hojasMes.forEach(h => { if (h.nombre) counts[h.nombre] = (counts[h.nombre] || 0) + 1; });

    let stats = METROLOGOS_ORDER_COLOR.map((m, i) => ({
      name: m.name,
      total: counts[m.name] || 0,
      color: m.color
    }));

    // Agregar metrólogos fuera de la lista hardcoded
    Object.keys(counts).forEach((name, i) => {
      if (!stats.find(s => s.name === name)) {
        stats.push({ name, total: counts[name], color: FALLBACK_COLORS[i % FALLBACK_COLORS.length] });
      }
    });

    // Ordenamiento
    if (sortMode === "asc") stats.sort((a, b) => a.total - b.total);
    else if (sortMode === "desc") stats.sort((a, b) => b.total - a.total);

    // Top 3
    const ranking = [...stats].sort((a, b) => b.total - a.total).slice(0, 3);

    // Datos Específicos del Metrólogo Seleccionado
    let metrologoHistory: any[] = [];
    let metrologoPies: any[] = [];
    let singleStats = { total: 0, bestMag: "N/A" };

    if (metrologoSeleccionado) {
      // Historial Anual (Barras)
      const hojasUser = todasLasHojas.filter(h => h.nombre === metrologoSeleccionado.name && h.fecha.startsWith(`${year}-`));
      const historyMap: Record<string, number> = {};
      hojasUser.forEach(h => {
        const mKey = h.fecha.substring(0, 7); // YYYY-MM
        historyMap[mKey] = (historyMap[mKey] || 0) + 1;
      });
      metrologoHistory = Object.entries(historyMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => ({ 
          mes: new Date(`${k}-02`).toLocaleString("es-MX", { month: "short" }), 
          total: v,
          fullDate: k 
        }));

      // Pie Chart (Solo mes actual)
      const hojasUserMes = hojasMes.filter(h => h.nombre === metrologoSeleccionado.name);
      const magMap: Record<string, number> = {};
      hojasUserMes.forEach(h => { if(h.magnitud) magMap[h.magnitud] = (magMap[h.magnitud] || 0) + 1; });
      
      metrologoPies = Object.entries(magMap).map(([name, value], i) => ({
        name, value, color: MAGNITUDES_COLORS[name] || FALLBACK_COLORS[i % 5]
      })).sort((a,b) => b.value - a.value);

      singleStats.total = hojasUserMes.length;
      singleStats.bestMag = metrologoPies.length > 0 ? metrologoPies[0].name : "Sin datos";
    }

    return {
      metrologosTotales: stats,
      top3: ranking,
      totalMes: hojasMes.length,
      dataMagnitudes: metrologoPies,
      dataMesesMetrologo: metrologoHistory,
      metrologoStats: singleStats
    };
  }, [todasLasHojas, currentDate, sortMode, metrologoSeleccionado]);

  // --- HANDLERS ---
  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const mesTxt = currentDate.toLocaleString("es-MX", { month: "long", year: "numeric" }).toUpperCase();

  const handlePieClick = (data: any, index: number, e: any) => {
    setSelectedMagnitud({ ...data, position: { x: e.clientX, y: e.clientY } });
    setHologramVisible(true);
  };

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} style={{ filter: `drop-shadow(0 0 10px ${fill})` }} />
        <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12} fill={fill} opacity={0.3} />
      </g>
    );
  };

  return (
    <div className={`min-h-screen ${COLORS.background} text-white font-sans selection:bg-blue-500/30 pb-12`}>
      
      {/* HEADER DE NAVEGACIÓN */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-white/5 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigateTo("mainmenu")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-300" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 hidden sm:block">
            SISTEMA DE CALIBRACIÓN
          </h1>
        </div>

        {/* Selector de Fecha Estilizado */}
        <div className="flex items-center bg-slate-800 rounded-full p-1 border border-white/10">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white/10 rounded-full transition"><ChevronLeft size={18}/></button>
          <div className="px-6 font-mono font-bold text-sm min-w-[160px] text-center flex items-center justify-center gap-2">
            <Calendar size={14} className="text-blue-400"/>
            {mesTxt}
          </div>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white/10 rounded-full transition"><ChevronRight size={18}/></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* KPI CARDS - RESUMEN EJECUTIVO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Calibraciones" value={totalMes} icon={Activity} color="blue" />
          <KPICard title="Metrólogo Líder" value={top3[0]?.name || "-"} icon={Trophy} color="yellow" trend={`${top3[0]?.total || 0} Calibraciones`} />
          <KPICard title="Días Activos" value={loading ? "..." : "22"} icon={Calendar} color="emerald" />
          <KPICard title="Eficiencia Global" value="94.5%" icon={Target} color="purple" />
        </div>

        {/* SECCIÓN PRINCIPAL: SELECTOR Y TOP 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Lado Izquierdo: Configuración y Top 3 (4 columnas) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Selector de Metrólogo */}
            <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} ${COLORS.cardBg} backdrop-blur-md`}>
              <label className="text-sm font-medium text-gray-400 mb-2 block">Filtrar por Metrólogo</label>
              <select
                value={metrologoSeleccionado?.id || ""}
                onChange={(e) => setMetrologoSeleccionado(usuarios.find((u) => u.id === e.target.value) || null)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all cursor-pointer hover:bg-slate-750"
              >
                <option value="">Vista General</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* Ranking Vertical Compacto */}
            <div className={`p-6 rounded-2xl border ${COLORS.cardBorder} ${COLORS.cardBg} backdrop-blur-md h-fit`}>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Trophy className="text-yellow-500" size={20} /> Top Performers
              </h3>
              <div className="space-y-4">
                {top3.map((m, i) => (
                  <motion.div 
                    key={m.name}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i===0 ? 'bg-yellow-500/20 text-yellow-500' : i===1 ? 'bg-gray-400/20 text-gray-400' : 'bg-orange-500/20 text-orange-500'}`}>
                        #{i+1}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-gray-200">{m.name}</p>
                        <div className="w-24 h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(m.total / (top3[0].total || 1)) * 100}%` }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: m.color }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-lg">{m.total}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Lado Derecho: Gráficas (8 columnas) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* SI HAY UN METRÓLOGO SELECCIONADO */}
            {metrologoSeleccionado ? (
              <div className="grid grid-cols-1 gap-6">
                {/* 1. Bar Chart Anual */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-2xl border ${COLORS.cardBorder} ${COLORS.cardBg}`}>
                  <h3 className="text-lg font-bold mb-6 text-gray-200">Tendencia Anual: {metrologoSeleccionado.name}</h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dataMesesMetrologo}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="mes" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                        <Bar 
                          dataKey="total" 
                          fill={METROLOGOS_ORDER_COLOR.find(m => m.name === metrologoSeleccionado.name)?.color || COLORS.accent} 
                          radius={[4, 4, 0, 0]} 
                          animationDuration={1500}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>

                {/* 2. Pie Chart Interactivo */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-2xl border ${COLORS.cardBorder} ${COLORS.cardBg} flex flex-col md:flex-row items-center gap-8`}>
                  <div className="w-full md:w-1/2 h-[300px] relative">
                     <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          activeIndex={activeIndex}
                          activeShape={renderActiveShape}
                          data={dataMagnitudes}
                          cx="50%" cy="50%"
                          innerRadius={60} outerRadius={80}
                          dataKey="value"
                          onMouseEnter={(_, index) => setActiveIndex(index)}
                          onMouseLeave={() => setActiveIndex(-1)}
                          onClick={handlePieClick}
                          paddingAngle={5}
                        >
                          {dataMagnitudes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0)" />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Centro del Pie */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                       <span className="text-3xl font-bold text-white">{metrologoStats.total}</span>
                       <span className="text-xs text-gray-400">Total Mes</span>
                    </div>
                  </div>
                  
                  {/* Leyenda y Detalles */}
                  <div className="w-full md:w-1/2">
                    <h4 className="font-bold text-lg mb-4">Distribución por Magnitud</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                      {dataMagnitudes.map((m) => (
                        <div key={m.name} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition" onClick={(e: any) => handlePieClick(m, 0, { clientX: window.innerWidth/2, clientY: window.innerHeight/2 })}>
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                          <span className="text-gray-300 truncate">{m.name}</span>
                          <span className="text-gray-500 ml-auto">{m.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-blue-400 flex items-center gap-1">
                      <Activity size={12}/> Haz click en la gráfica para ver holograma
                    </p>
                  </div>
                </motion.div>
              </div>
            ) : (
              // VISTA GLOBAL (SI NO HAY SELECCIÓN)
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-6 rounded-2xl border ${COLORS.cardBorder} ${COLORS.cardBg} min-h-[500px]`}>
                 <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-bold text-gray-200">Comparativa Global del Mes</h3>
                   <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
                     {(['order', 'desc', 'asc'] as SortMode[]).map((mode) => (
                       <button
                        key={mode}
                        onClick={() => setSortMode(mode)}
                        className={`p-2 rounded transition-all ${sortMode === mode ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                       >
                         {mode === 'order' ? <SortDesc size={16} className="rotate-90" /> : mode === 'desc' ? <SortDesc size={16}/> : <SortAsc size={16}/>}
                       </button>
                     ))}
                   </div>
                 </div>
                 
                 <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrologosTotales} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} interval={0} tick={{fill: '#94a3b8'}} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                        <Bar dataKey="total" radius={[6, 6, 0, 0]} animationDuration={1000}>
                          {metrologosTotales.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0 0 4px ${entry.color}80)` }} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* HOLOGRAM POPUP */}
      {hologramVisible && selectedMagnitud && (
        <HologramMagnitudPopup
          magnitud={selectedMagnitud.name}
          valor={selectedMagnitud.value}
          color={selectedMagnitud.color}
          onClose={() => setHologramVisible(false)}
        />
      )}
    </div>
  );
};

export default CalibrationStatsScreen;