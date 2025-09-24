import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../utils/firebase";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ResponsiveContainer,
  Sector,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, SortDesc, SortAsc, X } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";

// -------- CONFIGURACIÓN --------
const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#aa0000ff" },
  { name: "Dante Hernández", color: "#1411cfff" },
  { name: "Edgar Amador", color: "#028019ff" },
  { name: "Angel Amador", color: "#ffe042ff" },
  { name: "Ricardo Domínguez", color: "#cc08d6ff" },
];

const FALLBACK_COLORS = ["#dbd0d0ff", "#FF5722", "#1B9CFC", "#B10DC9", "#607D8B"];

const MAGNITUDES_COLORS: Record<string, string> = {
  "Acustica": "#00e6bf",
  "Dimensional": "#001e78ff",
  "Electrica": "#ffee00ff",
  "Flujo": "#20cde0ff",
  "Fuerza": "#00e676ff",
  "Masa": "#028019ff",
  "Par Torsional": "#30306D",
  "Presión": "#afafbaff",
  "Temperatura": "#c87705ff",
  "Tiempo": "#f33220ff",
};

function getContrastText(bgColor: string) {
  if (!bgColor) return "#222";
  let hex = bgColor.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a202c" : "#fff";
}

// -------- COMPONENTE HOLOGRAMA TONY STARK --------
const HologramMagnitudPopup = ({ 
  magnitud, 
  valor, 
  color, 
  onClose, 
  position 
}: {
  magnitud: string;
  valor: number;
  color: string;
  onClose: () => void;
  position: { x: number; y: number };
}) => {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Efecto de Escaneo/Grid Holográfico */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            animation: 'holographic-grid 2s linear infinite',
          }}
        />

        {/* Holograma Principal */}
        <motion.div
          className="relative"
          initial={{ 
            scale: 0, 
            rotateY: -180, 
            opacity: 0,
            z: -1000
          }}
          animate={{ 
            scale: 1, 
            rotateY: 0, 
            opacity: 1,
            z: 0
          }}
          exit={{ 
            scale: 0, 
            rotateY: 180, 
            opacity: 0,
            z: -1000
          }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 20,
            duration: 0.8
          }}
          style={{ 
            transformStyle: 'preserve-3d',
            perspective: '1000px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Container del Holograma */}
          <div
            className="relative bg-black/90 border-2 rounded-2xl p-8 min-w-[400px] min-h-[300px] overflow-hidden"
            style={{
              borderColor: color,
              boxShadow: `
                0 0 20px ${color}40,
                0 0 40px ${color}20,
                0 0 60px ${color}10,
                inset 0 0 20px ${color}10
              `,
              transform: 'translateZ(50px)',
            }}
          >
            {/* Líneas de Escaneo Animadas */}
            <div 
              className="absolute top-0 left-0 w-full h-1 opacity-80"
              style={{
                background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                animation: 'scan-line 3s ease-in-out infinite',
              }}
            />
            <div 
              className="absolute bottom-0 left-0 w-full h-1 opacity-60"
              style={{
                background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
                animation: 'scan-line 3s ease-in-out infinite reverse',
              }}
            />

            {/* Efecto de Distorsión Holográfica */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `
                  repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    ${color}05 2px,
                    ${color}05 4px
                  )
                `,
                animation: 'holographic-distortion 4s ease-in-out infinite',
              }}
            />

            {/* Botón Cerrar */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-red-500/20 border border-red-400 hover:bg-red-500/40 transition-all duration-300"
              style={{
                boxShadow: `0 0 10px #ff000040`,
              }}
            >
              <X className="w-6 h-6 text-red-400" />
            </button>

            {/* Contenido Principal */}
            <div className="relative z-10 text-center">
              {/* Título con Efecto Glow */}
              <motion.h2
                className="text-4xl font-bold mb-6"
                style={{ 
                  color: color,
                  textShadow: `
                    0 0 10px ${color},
                    0 0 20px ${color}80,
                    0 0 30px ${color}60
                  `,
                }}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {magnitud}
              </motion.h2>

              {/* Círculo Central con Datos */}
              <motion.div
                className="relative mx-auto mb-8"
                style={{ 
                  width: '200px', 
                  height: '200px',
                }}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              >
                {/* Círculos Concéntricos */}
                <div 
                  className="absolute inset-0 rounded-full border-2 animate-spin"
                  style={{ 
                    borderColor: `${color}60`,
                    animation: 'slow-spin 10s linear infinite',
                  }}
                />
                <div 
                  className="absolute inset-4 rounded-full border border-dashed"
                  style={{ 
                    borderColor: `${color}40`,
                    animation: 'slow-spin-reverse 15s linear infinite',
                  }}
                />

                {/* Centro con Datos */}
                <div className="absolute inset-8 rounded-full bg-black/60 border flex flex-col items-center justify-center"
                     style={{ borderColor: color }}>
                  <motion.div
                    className="text-5xl font-bold"
                    style={{ color: color }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: "spring" }}
                  >
                    {valor}
                  </motion.div>
                  <motion.div
                    className="text-sm opacity-80 mt-2"
                    style={{ color: color }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.8 }}
                    transition={{ delay: 1 }}
                  >
                    CALIBRACIONES
                  </motion.div>
                </div>
              </motion.div>

              {/* Datos Adicionales */}
              <motion.div
                className="grid grid-cols-2 gap-4 text-sm"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1.2 }}
              >
                <div className="border rounded-lg p-3 bg-black/40"
                     style={{ borderColor: `${color}40` }}>
                  <div style={{ color: color }} className="font-semibold">TIPO</div>
                  <div className="text-white/80">Magnitud</div>
                </div>
                <div className="border rounded-lg p-3 bg-black/40"
                     style={{ borderColor: `${color}40` }}>
                  <div style={{ color: color }} className="font-semibold">ESTADO</div>
                  <div className="text-green-400">ACTIVO</div>
                </div>
              </motion.div>

              {/* Mensaje Inferior */}
              <motion.div
                className="mt-6 text-xs opacity-60 text-center"
                style={{ color: color }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ delay: 1.5 }}
              >
                ⚡ SISTEMA DE CALIBRACIÓN HOLOGRÁFICO ⚡
              </motion.div>
            </div>

            {/* Partículas Flotantes */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 4px ${color}`,
                  left: `${20 + (i * 10)}%`,
                  top: `${30 + (i % 3) * 20}%`,
                }}
                animate={{
                  y: [0, -20, 0],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 2 + (i * 0.5),
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* CSS personalizado para animaciones */}
        <style jsx>{`
          @keyframes holographic-grid {
            0%, 100% { transform: translate(0, 0); opacity: 0.3; }
            50% { transform: translate(25px, 25px); opacity: 0.1; }
          }

          @keyframes scan-line {
            0% { transform: translateY(0) scaleX(0); }
            50% { transform: translateY(0) scaleX(1); }
            100% { transform: translateY(300px) scaleX(0); }
          }

          @keyframes holographic-distortion {
            0%, 100% { opacity: 0.05; }
            25% { opacity: 0.1; transform: translateX(1px); }
            50% { opacity: 0.15; transform: translateX(-1px); }
            75% { opacity: 0.1; transform: translateX(0.5px); }
          }

          @keyframes slow-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @keyframes slow-spin-reverse {
            from { transform: rotate(360deg); }
            to { transform: rotate(0deg); }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
};

// -------- PieChart PRO con Hover Holográfico --------
const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx, cy, midAngle, innerRadius, outerRadius,
    startAngle, endAngle, fill, payload, percent, value,
  } = props;

  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 12) * cos;
  const sy = cy + (outerRadius + 12) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        filter="url(#glow)"
        style={{
          filter: `drop-shadow(0 0 10px ${fill}) drop-shadow(0 0 20px ${fill}60)`,
        }}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
        opacity={0.6}
      />
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={fill}
        fill="none"
        strokeWidth={2}
        filter="url(#glow)"
      />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke={fill} strokeWidth={2} />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey - 4}
        textAnchor={textAnchor}
        fill={fill}
        fontWeight={700}
        style={{
          filter: `drop-shadow(0 0 6px ${fill})`,
          fontSize: '14px'
        }}
      >
        {`${payload.name}: ${value}`}
      </text>
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey + 18}
        textAnchor={textAnchor}
        fill="#666"
        fontSize={13}
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  );
};

// -------- Interfaces --------
interface Usuario {
  id: string;
  name: string;
  puesto: string;
}

interface HojaTrabajo {
  id: string;
  nombre: string;
  fecha: string;
  magnitud: string;
}

type SortMode = "order" | "asc" | "desc";

const CalibrationStatsScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [metrologoSeleccionado, setMetrologoSeleccionado] = useState<Usuario | null>(null);
  const [hojas, setHojas] = useState<HojaTrabajo[]>([]);
  const [todasLasHojas, setTodasLasHojas] = useState<HojaTrabajo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("order");

  // Estados para el holograma
  const [hologramVisible, setHologramVisible] = useState(false);
  const [selectedMagnitud, setSelectedMagnitud] = useState<{
    name: string;
    value: number;
    color: string;
    position: { x: number; y: number };
  } | null>(null);

  // Nuevo: estado para el mes seleccionado
  const today = new Date();
  const [mesSeleccionado, setMesSeleccionado] = useState(
    `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`
  );

  // Desglose año/mes
  const [year, month] = mesSeleccionado.split("-").map(Number);
  const mesActualTxt = new Date(year, month-1).toLocaleString("es-MX", { month: "short", year: "numeric" });

  // -------- Fetch Usuarios --------
  useEffect(() => {
    const fetchUsuarios = async () => {
      const q = query(collection(db, "usuarios"), where("puesto", "==", "Metrólogo"));
      const snap = await getDocs(q);
      const lista: Usuario[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setUsuarios(lista);
    };
    fetchUsuarios();
  }, []);

  // -------- Fetch Hojas de Metrologo --------
  useEffect(() => {
    if (!metrologoSeleccionado) {
      setHojas([]);
      return;
    }

    const fetchHojas = async () => {
      setLoading(true);
      const q = query(
        collection(db, "hojasDeTrabajo"),
        where("nombre", "==", metrologoSeleccionado.name)
      );
      const snap = await getDocs(q);
      const lista: HojaTrabajo[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setHojas(lista);
      setLoading(false);
    };
    fetchHojas();
  }, [metrologoSeleccionado]);

  // -------- Fetch Todas las Hojas --------
  useEffect(() => {
    const fetchTodas = async () => {
      const snap = await getDocs(collection(db, "hojasDeTrabajo"));
      const lista: HojaTrabajo[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setTodasLasHojas(lista);
    };
    fetchTodas();
  }, []);

  // ----------- SOLO MES SELECCIONADO PARA GLOBAL -----------
  const hojasGlobalesMes = todasLasHojas.filter((hoja) => {
    if (!hoja.fecha) return false;
    try {
      const [y, m] = hoja.fecha.split("-").map(Number);
      return y === year && m === month;
    } catch {
      return false;
    }
  });

  const calibracionesPorMetrologo: Record<string, number> = {};
  hojasGlobalesMes.forEach((hoja) => {
    if (!hoja.nombre) return;
    calibracionesPorMetrologo[hoja.nombre] = (calibracionesPorMetrologo[hoja.nombre] || 0) + 1;
  });

  let metrologosTotales = METROLOGOS_ORDER_COLOR.map((item, idx) => ({
    name: item.name,
    total: calibracionesPorMetrologo[item.name] || 0,
    color: item.color,
  }));

  Object.keys(calibracionesPorMetrologo).forEach((n, i) => {
    if (!metrologosTotales.find((x) => x.name === n)) {
      metrologosTotales.push({
        name: n,
        total: calibracionesPorMetrologo[n],
        color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      });
    }
  });

  if (sortMode === "asc") {
    metrologosTotales = [...metrologosTotales].sort((a, b) => a.total - b.total);
  } else if (sortMode === "desc") {
    metrologosTotales = [...metrologosTotales].sort((a, b) => b.total - a.total);
  }

  // -------- Top 3 PRO del mes seleccionado
  const top3 = [...metrologosTotales].sort((a, b) => b.total - a.total).slice(0, 3);

  // ----------- POR METROLOGO (filtrando solo por mes seleccionado) -----------
  // Barras por mes: solo del año del selector (para vista historial por mes)
  const hojasPorMes = hojas
    .filter(h => h.fecha && h.fecha.startsWith(`${year}-`))
    .reduce((acc: any, hoja) => {
      let mes = "";
      try {
        mes = new Date(hoja.fecha).toLocaleString("es-MX", { month: "short", year: "numeric" });
      } catch {
        mes = hoja.fecha;
      }
      acc[mes] = (acc[mes] || 0) + 1;
      return acc;
    }, {});

  const dataMeses = Object.entries(hojasPorMes).map(([mes, total]) => ({
    mes,
    total,
  }));

  // --------- MAGNITUDES PRESENTES EN DATA FILTRADA (PieChart + leyenda), ORDENADAS ALFABÉTICO ---------
  const magnitudesPresentes: string[] = Array.from(
    new Set(
      hojas
        .filter(h => {
          if (!h.fecha) return false;
          const [y, m] = h.fecha.split("-").map(Number);
          return y === year && m === month;
        })
        .map(h => h.magnitud)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const dataMagnitudes = magnitudesPresentes.map((magnitud) => ({
    name: magnitud,
    value: hojas.filter((h) => {
      if (!h.fecha) return false;
      const [y, m] = h.fecha.split("-").map(Number);
      return h.magnitud === magnitud && y === year && m === month;
    }).length,
  }));

  function getColorForMagnitud(magnitud: string, i: number) {
    return MAGNITUDES_COLORS[magnitud] || [
      "#FFD600", "#009688", "#FF3D00", "#283593", "#00E676", "#F44336", "#00B8D4"
    ][i % 7];
  }

  // ---- Color barra por metrologo
  const colorBarra = metrologoSeleccionado
    ? (
        METROLOGOS_ORDER_COLOR.find(m => m.name === metrologoSeleccionado.name)?.color ||
        FALLBACK_COLORS[0]
      )
    : "#2096F3";

  // Función para manejar click en magnitud del PieChart
  const handlePieClick = (data: any, index: number, event: any) => {
    const color = getColorForMagnitud(data.name, index);
    setSelectedMagnitud({
      name: data.name,
      value: data.value,
      color: color,
      position: { x: event.clientX, y: event.clientY }
    });
    setHologramVisible(true);
  };

  const closeHologram = () => {
    setHologramVisible(false);
    setSelectedMagnitud(null);
  };

  // -------- UI --------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 p-4 relative">
      {/* Botón regreso */}
      <motion.button
        onClick={() => navigateTo("mainmenu")}
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ scale: 1.1, x: -5 }}
        className="absolute top-4 left-4 z-50 flex items-center px-4 py-2 bg-white/80 rounded-full shadow-md border border-gray-200 hover:bg-blue-100 transition"
      >
        <ArrowLeft className="mr-2 h-5 w-5" />
        Regresar
      </motion.button>

      {/* Título */}
      <h1 className="text-4xl font-bold text-center text-white mb-8 mt-16">
        📊 Estadísticas de Calibración
      </h1>

      {/* Selector de mes */}
      <div className="flex items-center justify-center mb-8">
        <label className="text-white mr-4 font-semibold">Selecciona mes:</label>
        <input
          type="month"
          value={mesSeleccionado}
          onChange={(e) => setMesSeleccionado(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-300 bg-white"
        />
        <button
          onClick={() =>
            setMesSeleccionado(
              `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`
            )
          }
          className="ml-2 px-4 py-2 bg-blue-200 rounded font-semibold hover:bg-blue-300"
        >
          Mes Actual
        </button>
      </div>

      {/* Select metrologo */}
      <div className="max-w-md mx-auto mb-8">
        <select
          value={metrologoSeleccionado?.id || ""}
          onChange={(e) =>
            setMetrologoSeleccionado(
              usuarios.find((u) => u.id === e.target.value) || null
            )
          }
          className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold text-center"
        >
          <option value="">Selecciona un Metrologo</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Estadísticas del metrologo */}
      {metrologoSeleccionado && !loading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-7xl mx-auto mb-12">
          {/* Barras por mes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
              Total por Mes ({metrologoSeleccionado.name})
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dataMeses}>
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill={colorBarra} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* PieChart con efecto Holograma TONY STARK */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 relative overflow-hidden"
          >
            {/* Efectos de fondo futuristas */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />
            
            <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">
              Por Magnitud
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              ({metrologoSeleccionado.name}, {mesActualTxt}) - Toca para ver holograma
            </p>

            {/* SVG Filter para efectos glow */}
            <svg width="0" height="0">
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
            </svg>

            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dataMagnitudes}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(-1)}
                  onClick={handlePieClick}
                  style={{ cursor: 'pointer' }}
                  isAnimationActive
                >
                  {dataMagnitudes.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getColorForMagnitud(entry.name, index)}
                      stroke={getColorForMagnitud(entry.name, index)}
                      strokeWidth={2}
                      style={{
                        filter: `drop-shadow(0 0 6px ${getColorForMagnitud(entry.name, index)}60)`,
                        transition: 'all 0.3s ease',
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Leyenda SOLO de las presentes, ordenada alfa */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {magnitudesPresentes.map((mag, i) => (
                <div key={mag} className="flex items-center text-sm">
                  <div
                    className="w-4 h-4 rounded mr-2"
                    style={{ backgroundColor: getColorForMagnitud(mag, i) }}
                  />
                  <span className="text-gray-700">{mag}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* --- Ranking Top 3 del mes seleccionado --- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 max-w-4xl mx-auto mb-12"
      >
        <h3 className="text-2xl font-bold text-center text-gray-800 mb-6">
          🏆 Top 3 Metrólogos ({mesActualTxt})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {top3.map((m, i) => (
            <div
              key={m.name}
              className="text-center p-6 rounded-xl border-2 bg-gradient-to-br from-white to-gray-50"
              style={{ borderColor: m.color }}
            >
              <div className="text-4xl mb-2">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
              </div>
              <h4 className="font-bold text-lg text-gray-800">{m.name}</h4>
              <p className="text-gray-600">{m.total} calibraciones</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Barra GLOBAL SOLO mes seleccionado */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 max-w-6xl mx-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-800">
            TOTAL GENERAL - Calibraciones por Metrologo (Mes: {mesActualTxt})
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSortMode("order")}
              className={`p-2 rounded ${sortMode === "order" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              📝
            </button>
            <button
              onClick={() => setSortMode("desc")}
              className={`p-2 rounded ${sortMode === "desc" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              <SortDesc size={20} />
            </button>
            <button
              onClick={() => setSortMode("asc")}
              className={`p-2 rounded ${sortMode === "asc" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            >
              <SortAsc size={20} />
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={metrologosTotales} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip labelFormatter={(value) => [`${value} calibraciones`, "Total"]} />
            {metrologosTotales.map((entry) => (
              <Bar
                key={entry.name}
                dataKey="total"
                fill={entry.color}
                radius={[4, 4, 0, 0]}
                name={entry.name}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* Leyenda personalizada */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
          {metrologosTotales.map((met) => (
            <div key={met.name} className="flex items-center text-sm">
              <div
                className="w-4 h-4 rounded mr-3"
                style={{ backgroundColor: met.color }}
              />
              <span className="text-gray-700 font-medium">{met.name}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Holograma Popup */}
      {hologramVisible && selectedMagnitud && (
        <HologramMagnitudPopup
          magnitud={selectedMagnitud.name}
          valor={selectedMagnitud.value}
          color={selectedMagnitud.color}
          onClose={closeHologram}
          position={selectedMagnitud.position}
        />
      )}
    </div>
  );
};

export default CalibrationStatsScreen;
