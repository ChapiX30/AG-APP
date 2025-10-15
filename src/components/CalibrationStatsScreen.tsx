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
  ResponsiveContainer,
  Sector,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, SortDesc, SortAsc, X } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";

// ----------- FUNCIÓN UTIL PARA GLOW BLANCO+COLOR ---------
function blendColorWithWhite(hex: string, amount: number = 0.7) {
  let c = hex.replace("#", "").substring(0, 6);
  let r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
  r = Math.round(r + (255 - r) * amount);
  g = Math.round(g + (255 - g) * amount);
  b = Math.round(b + (255 - b) * amount);
  return `rgba(${r},${g},${b},0.8)`;
}

// -------- COLORES --------
const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#ae0303" },
  { name: "Dante Hernández", color: "#060476" },
  { name: "Edgar Amador", color: "#028019" },
  { name: "Angel Amador", color: "#42ffcd" },
  { name: "Ricardo Domínguez", color: "#cc08d6" },
];
const FALLBACK_COLORS = ["#ff9100", "#1b1a1a", "#1B9CFC", "#B10DC9", "#607D8B"];
const MAGNITUDES_COLORS: Record<string, string> = {
  "Acustica": "#00e6bf",
  "Dimensional": "#001e78",
  "Electrica": "#ffee00",
  "Flujo": "#20cde0",
  "Fuerza": "#00e676",
  "Masa": "#028019",
  "Par Torsional": "#30306D",
  "Presión": "#afafba",
  "Temperatura": "#c87705",
  "Tiempo": "#f33220",
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

// -------- COMPONENTE HOLOGRAMA (no cambies esto) --------
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
}) => (
  <AnimatePresence>
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
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
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-red-500/20 border border-red-400 hover:bg-red-500/40 transition-all duration-300"
            style={{
              boxShadow: `0 0 10px #ff000040`,
            }}
          >
            <X className="w-6 h-6 text-red-400" />
          </button>
          <div className="relative z-10 text-center">
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
        </div>
      </motion.div>
    </motion.div>
  </AnimatePresence>
);

// ----------- INTERFACES ---------
interface Usuario { id: string; name: string; puesto: string; }
interface HojaTrabajo { id: string; nombre: string; fecha: string; magnitud: string; }
type SortMode = "order" | "asc" | "desc";

// ----------- COMPONENTE PRINCIPAL -----------
const CalibrationStatsScreen: React.FC = () => {
  const { navigateTo } = useNavigation();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [metrologoSeleccionado, setMetrologoSeleccionado] = useState<Usuario | null>(null);
  const [hojas, setHojas] = useState<HojaTrabajo[]>([]);
  const [todasLasHojas, setTodasLasHojas] = useState<HojaTrabajo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [hologramVisible, setHologramVisible] = useState(false);
  const [selectedMagnitud, setSelectedMagnitud] = useState<any>(null);

  // Mes seleccionado
  const today = new Date();
  const [mesSeleccionado, setMesSeleccionado] = useState(
    `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`
  );
  const [year, month] = mesSeleccionado.split("-").map(Number);
  const mesActualTxt = new Date(year, month-1).toLocaleString("es-MX", { month: "short", year: "numeric" });

  // Usuarios
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

  // Hojas de metrologo seleccionado
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

  // Todas las hojas de trabajo
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

  // ---- SOLO MES SELECCIONADO PARA GLOBAL ----
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

  // Top 3
  const top3 = [...metrologosTotales].sort((a, b) => b.total - a.total).slice(0, 3);

  // Por mes seleccionado para metrólogo individual
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
  const dataMeses = Object.entries(hojasPorMes).map(([mes, total]) => ({ mes, total }));

  // Magnitudes PieChart
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

  // Color barra por metrologo (solo para metrologo individual)
  const colorBarra = metrologoSeleccionado
    ? (
      METROLOGOS_ORDER_COLOR.find(m => m.name === metrologoSeleccionado.name)?.color ||
      FALLBACK_COLORS[0]
    )
    : "#2096F3";

  // Color animado para el selector
  const colorSelector = metrologoSeleccionado
    ? (METROLOGOS_ORDER_COLOR.find(m => m.name === metrologoSeleccionado.name)?.color || "#2096F3")
    : "#1e40af";

  // Función para holograma PieChart
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

  // --------- RENDER UI -----------
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

      {/* ------ SELECTOR DE METROLOGO CON FONDO ANIMADO PRO ------ */}
      <motion.div
        className="max-w-md mx-auto mb-8 relative"
        style={{
          borderRadius: 24,
          overflow: "visible",
        }}
        animate={{
          boxShadow: [
            `0 0 0px ${colorSelector}00, 0 0 16px ${colorSelector}66`,
            `0 0 12px ${colorSelector}80, 0 0 40px ${colorSelector}50`
          ],
        }}
        transition={{
          duration: 0.8,
          type: "spring"
        }}
      >
        {/* Fondo degradado animado tipo aurora */}
        <motion.div
          className="absolute inset-0 -z-10"
          style={{
            borderRadius: 24,
            pointerEvents: "none",
            filter: "blur(16px)",
          }}
          animate={{
            background: [
              `linear-gradient(120deg, ${colorSelector}44 20%, #09f 80%)`,
              `linear-gradient(90deg, #fff0 30%, ${colorSelector}80 100%)`,
              `linear-gradient(100deg, #d1d5db88 0%, ${colorSelector}66 80%)`,
              `linear-gradient(120deg, #6366f144 40%, ${colorSelector}cc 100%)`
            ],
            backgroundPosition: [
              "0% 50%", "100% 60%", "60% 100%", "0% 0%"
            ]
          }}
          transition={{
            repeat: Infinity,
            duration: 8,
            ease: "linear"
          }}
        />
        {/* Halo Glow */}
        <motion.div
          className="absolute inset-0 -z-20"
          style={{
            borderRadius: 24,
            pointerEvents: "none",
            background: `radial-gradient(circle at 70% 40%, ${colorSelector}50 0%, #fff0 80%)`,
            filter: `blur(36px)`,
          }}
          animate={{
            opacity: [0.6, 0.8, 1, 0.7],
            scale: [1, 1.04, 0.96, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 6,
            ease: "easeInOut"
          }}
        />
        {/* El SELECT */}
        <motion.select
          value={metrologoSeleccionado?.id || ""}
          onChange={(e) =>
            setMetrologoSeleccionado(
              usuarios.find((u) => u.id === e.target.value) || null
            )
          }
          className="w-full px-6 py-4 rounded-2xl border-2 font-semibold text-lg text-center backdrop-blur-xl
           shadow-xl transition-all duration-500 cursor-pointer relative z-10"
          style={{
            borderColor: colorSelector,
            background: "rgba(255,255,255,0.72)",
            boxShadow: `0 0 24px 0 ${colorSelector}44, 0 0 0px 0 #fff0`,
            color: "#222",
            textShadow: `0 1px 0 #fff, 0 0 6px ${colorSelector}44`,
            transition: "border-color 0.5s, box-shadow 0.5s, background 0.7s"
          }}
          animate={{
            borderColor: colorSelector,
            boxShadow: [
              `0 0 0px ${colorSelector}00, 0 0 8px ${colorSelector}44`,
              `0 0 8px ${colorSelector}80, 0 0 32px ${colorSelector}33`
            ]
          }}
        >
          <option value="">Selecciona un Metrólogo</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </motion.select>
        {/* Overlay frame */}
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 pointer-events-none"
          style={{
            borderColor: colorSelector,
            borderWidth: 2,
            transition: "border-color 0.5s"
          }}
          animate={{
            opacity: [0.7, 1, 0.9, 1],
            borderColor: colorSelector,
            scale: [1, 1.01, 0.99, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 4,
            ease: "easeInOut"
          }}
        />
      </motion.div>
      {/* ------ FIN SELECTOR ANIMADO ------ */}

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

          {/* PieChart por magnitud */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />
            <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">
              Por Magnitud
            </h3>
            <p className="text-sm text-gray-600 mb-6 text-center">
              ({metrologoSeleccionado.name}, {mesActualTxt}) - Toca para ver holograma
            </p>
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
            <ResponsiveContainer width="100%" height={380}>
              <PieChart>
                <Pie
                  data={dataMagnitudes}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={125}
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

      {/* --- Ranking Top 3 con border y glow SIEMPRE VISIBLE --- */}
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
            <motion.div
              key={m.name}
              className="relative text-center p-6 rounded-xl bg-gradient-to-br from-white to-gray-50 overflow-hidden"
              style={{
                border: `2.5px solid ${m.color}`,
                zIndex: 1,
              }}
              initial={{ boxShadow: `0 0 0px ${m.color}00` }}
              animate={{
                boxShadow: [
                  `0 0 0px ${m.color}00, 0 0 24px ${blendColorWithWhite(m.color,0.7)}`,
                  `0 0 24px ${blendColorWithWhite(m.color,0.7)}, 0 0 48px ${blendColorWithWhite(m.color,0.5)}`,
                  `0 0 0px ${m.color}00, 0 0 32px ${blendColorWithWhite(m.color,0.7)}`
                ],
                borderColor: [m.color, "#fff", m.color],
                scale: [1, 1.025, 1],
                filter: [
                  `drop-shadow(0 0 0px ${blendColorWithWhite(m.color,0.7)})`,
                  `drop-shadow(0 0 16px ${blendColorWithWhite(m.color,0.7)})`,
                  `drop-shadow(0 0 0px ${blendColorWithWhite(m.color,0.7)})`
                ],
              }}
              transition={{
                repeat: Infinity,
                duration: 4,
                ease: "easeInOut",
              }}
            >
              {/* Glow mezclado con blanco para que siempre se note */}
              <motion.div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{
                  zIndex: 0,
                  border: "2.5px solid transparent",
                  background: `radial-gradient(ellipse at 60% 30%, ${blendColorWithWhite(m.color, 0.7)} 0%, #fff0 80%)`,
                  filter: `blur(18px)`,
                }}
                animate={{
                  opacity: [0.8, 1, 0.8, 1],
                  scale: [1, 1.08, 1, 0.97, 1],
                  background: [
                    `radial-gradient(ellipse at 60% 30%, ${blendColorWithWhite(m.color, 0.8)} 0%, #fff0 80%)`,
                    `radial-gradient(ellipse at 20% 80%, ${blendColorWithWhite(m.color, 0.6)} 0%, #fff0 90%)`,
                    `radial-gradient(ellipse at 60% 60%, #fff 0%, ${blendColorWithWhite(m.color, 0.7)} 55%, #fff0 90%)`,
                    `radial-gradient(ellipse at 50% 40%, ${blendColorWithWhite(m.color, 0.7)} 0%, #fff0 90%)`
                  ]
                }}
                transition={{
                  repeat: Infinity,
                  duration: 7,
                  ease: "easeInOut"
                }}
              />
              <div className="relative z-10">
                <div className="text-4xl mb-2">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                </div>
                <h4 className="font-bold text-lg text-gray-800">{m.name}</h4>
                <p className="text-gray-600">{m.total} calibraciones</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* --------- SECCIÓN MEJORADA: Barra GLOBAL --------- */}
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
        <ResponsiveContainer width="100%" height={540}>
          <BarChart 
            data={metrologosTotales} 
            margin={{ top: 40, right: 40, left: 40, bottom: 30 }}
          >
            <XAxis dataKey="name" tick={{ fontSize: 15 }} />
            <YAxis />
            <Tooltip formatter={(value: any) => [`${value} calibraciones`, "Total"]} />
            <Bar dataKey="total" radius={[8, 8, 0, 0]}>
              {metrologosTotales.map((entry, idx) => (
                <Cell 
                  key={`cell-bar-${entry.name}`}
                  fill={entry.color}
                  stroke={entry.color}
                  style={{
                    filter: `drop-shadow(0 0 8px ${entry.color}90)`,
                    transition: 'all 0.3s'
                  }}
                />
              ))}
            </Bar>
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
