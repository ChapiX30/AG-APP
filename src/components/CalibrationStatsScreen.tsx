import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../utils/firebase"; // Ajusta la ruta si es necesario
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
import { motion } from "framer-motion";
import { ArrowLeft, SortDesc, SortAsc } from "lucide-react";
import { useNavigation } from "../hooks/useNavigation";

// ----------- MAPEA AQUÍ EL COLOR Y ORDEN DE CADA METRÓLOGO -----------
// Puedes personalizar colores y orden SOLO CAMBIA este array:
const METROLOGOS_ORDER_COLOR = [
  { name: "Abraham Ginez", color: "#D32EF2" },
  { name: "Dante Hernández", color: "#11CFC3" },
  { name: "Edgar Amador", color: "#FFC300" },
  { name: "Angel Amador", color: "#FF8C42" },
  { name: "Ricardo Domínguez", color: "#2096F3" },
  // Agrega aquí más metrólogos (usa color HEX válido)
];
// Colores de respaldo si faltan metrólogos nuevos:
const FALLBACK_COLORS = ["#388E3C", "#FF5722", "#1B9CFC", "#B10DC9", "#607D8B"];

const MAGNITUDES_COLORS: Record<string, string> = {
  Dimensional: "#FF8C42",
  Electrica: "#11CFC3",
  Flujo: "#B620E0",
  Presión: "#FFC300",
  Temperatura: "#EC53EC",
  Tiempo: "#2096F3",
};
const MAGNITUDES_ORDEN = [
  "Dimensional",
  "Electrica",
  "Flujo",
  "Presión",
  "Temperatura",
  "Tiempo",
];

// Detecta si el color es "claro" para poner letra negra, si no blanca:
function getContrastText(bgColor: string) {
  if (!bgColor) return "#222";
  let hex = bgColor.replace("#", "");
  if (hex.length === 3)
    hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.substr(0,2),16);
  const g = parseInt(hex.substr(2,2),16);
  const b = parseInt(hex.substr(4,2),16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b)/255;
  return luminance > 0.55 ? "#1a202c" : "#fff";
}

const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value,
  } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
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
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="#333"
        strokeWidth={2}
        style={{
          filter: "drop-shadow(0px 6px 15px rgba(0,0,0,0.28))",
          transition: "all 0.25s cubic-bezier(.41,1.35,.65,1.03)",
        }}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={3} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 10} y={ey - 4} textAnchor={textAnchor} fill="#333" fontWeight={700}>
        {`${payload.name}: ${value}`}
      </text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 10} y={ey + 18} textAnchor={textAnchor} fill="#888" fontSize={13}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    </g>
  );
};

interface Usuario {
  id: string;
  name: string;
  puesto: string;
  position?: string;
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
  const [soloMesActual, setSoloMesActual] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("order");

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

  const now = new Date();
  const mesActual = now.toLocaleString("es-MX", { month: "short", year: "numeric" });
  const [year, month] = [now.getFullYear(), now.getMonth() + 1];

  // === Pie por magnitud (del metrologo seleccionado) ===
  const hojasFiltradas = soloMesActual
    ? hojas.filter((hoja) => {
        if (!hoja.fecha) return false;
        try {
          const [y, m] = hoja.fecha.split("-").map(Number);
          return y === year && m === month;
        } catch {
          return false;
        }
      })
    : hojas;

  const hojasPorMagnitud = hojasFiltradas.reduce((acc: any, hoja) => {
    if (!MAGNITUDES_ORDEN.includes(hoja.magnitud)) return acc;
    acc[hoja.magnitud] = (acc[hoja.magnitud] || 0) + 1;
    return acc;
  }, {});
  const dataMagnitudes = MAGNITUDES_ORDEN.map((magnitud) => ({
    name: magnitud,
    value: hojasPorMagnitud[magnitud] || 0,
  }));

  // === Barra: del metrologo seleccionado (por mes) ===
  const hojasPorMes = hojasFiltradas.reduce((acc: any, hoja) => {
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

  // === Barra FIJA GLOBAL: metrologo por color y orden personalizado ===
  const hojasGlobalesFiltradas = soloMesActual
    ? todasLasHojas.filter((hoja) => {
        if (!hoja.fecha) return false;
        try {
          const [y, m] = hoja.fecha.split("-").map(Number);
          return y === year && m === month;
        } catch {
          return false;
        }
      })
    : todasLasHojas;

  // Agrupar por metrologo (nombre)
  const calibracionesPorMetrologo: Record<string, number> = {};
  hojasGlobalesFiltradas.forEach((hoja) => {
    if (!hoja.nombre) return;
    calibracionesPorMetrologo[hoja.nombre] = (calibracionesPorMetrologo[hoja.nombre] || 0) + 1;
  });

  // Construye la lista en el orden y color que TÚ defines
  let metrologosTotales = METROLOGOS_ORDER_COLOR.map((item, idx) => ({
    name: item.name,
    total: calibracionesPorMetrologo[item.name] || 0,
    color: item.color,
  }));

  // Agrega metrólogos extras nuevos (que no están en tu lista)
  Object.keys(calibracionesPorMetrologo).forEach((n, i) => {
    if (!metrologosTotales.find((x) => x.name === n)) {
      metrologosTotales.push({
        name: n,
        total: calibracionesPorMetrologo[n],
        color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      });
    }
  });

  // Ordenar según sortMode
  if (sortMode === "asc") {
    metrologosTotales = [...metrologosTotales].sort((a, b) => a.total - b.total);
  } else if (sortMode === "desc") {
    metrologosTotales = [...metrologosTotales].sort((a, b) => b.total - a.total);
  } // else, por tu orden

  // --------- UI ------------
  return (
    <div className="relative p-4 md:p-8 min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 overflow-x-hidden">
      {/* Botón regreso */}
      <motion.button
        onClick={() => navigateTo("mainmenu")}
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ scale: 1.1, x: -5 }}
        className="absolute top-4 left-4 z-50 flex items-center px-4 py-2 bg-white/80 rounded-full shadow-md border border-gray-200 hover:bg-blue-100 transition"
      >
        <ArrowLeft className="w-5 h-5 mr-2 text-blue-600" />
        <span className="font-semibold text-blue-700">Regresar</span>
      </motion.button>

      {/* Título */}
      <motion.h1
        className="text-3xl font-black mb-6 text-center text-gray-800 drop-shadow"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
      >
        📊 Estadísticas de Calibración
      </motion.h1>

      {/* Filtros */}
      <div className="mb-4 flex flex-col md:flex-row items-center justify-center gap-4">
        <select
          className="p-3 border rounded-xl shadow-md min-w-[220px] bg-white"
          onChange={(e) =>
            setMetrologoSeleccionado(
              usuarios.find((u) => u.id === e.target.value) || null
            )
          }
        >
          <option value="">Selecciona un Metrologo</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 select-none cursor-pointer">
          <input
            type="checkbox"
            className="form-checkbox rounded accent-blue-600"
            checked={soloMesActual}
            onChange={(e) => setSoloMesActual(e.target.checked)}
          />
          <span className="font-medium text-blue-700">
            Solo mostrar calibrados del <span className="underline">{mesActual}</span>
          </span>
        </label>
      </div>

      {/* Gráficas del metrologo */}
      {metrologoSeleccionado && !loading && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "anticipate" }}
        >
          {/* Gráfico de barras por mes */}
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <h2 className="text-lg font-semibold mb-4 text-center text-gray-700">
              Total por Mes <span className="text-blue-400">({metrologoSeleccionado.name})</span>
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dataMeses}>
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#2096F3" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* PieChart 3D Efecto */}
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <h2 className="text-lg font-semibold mb-4 text-center text-gray-700">
              Por Magnitud <span className="text-blue-400">({metrologoSeleccionado.name})</span>
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  data={dataMagnitudes}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(-1)}
                  isAnimationActive
                >
                  {dataMagnitudes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={MAGNITUDES_COLORS[entry.name] || "#8884d8"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            {/* Leyenda manual con colores igual a tu imagen */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {MAGNITUDES_ORDEN.map((mag, i) => (
                <span key={mag} className="flex items-center gap-1 text-sm font-medium" style={{ color: MAGNITUDES_COLORS[mag] }}>
                  <span className="w-4 h-4 rounded-sm mr-1 inline-block" style={{ background: MAGNITUDES_COLORS[mag] }}></span>
                  {mag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Barra GLOBAL: metrologos, color y orden personalizado */}
      <motion.div
        className="max-w-4xl mx-auto mt-16 mb-8 bg-white rounded-2xl shadow-2xl p-6"
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8, ease: "anticipate" }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-1">
          <h2 className="text-2xl font-bold text-center text-gray-800">
            TOTAL GENERAL - Calibraciones por Metrologo {soloMesActual && `(Mes: ${mesActual})`}
          </h2>
          <div className="flex items-center gap-2">
            <button
              title="Ordenar personalizado"
              className={`p-2 rounded-full hover:bg-blue-100 ${sortMode==="order" ? "bg-blue-200" : ""}`}
              onClick={()=>setSortMode("order")}
            >
              <SortDesc className="w-4 h-4 text-blue-500" />
            </button>
            <button
              title="Ordenar por más calibrados"
              className={`p-2 rounded-full hover:bg-blue-100 ${sortMode==="desc" ? "bg-blue-200" : ""}`}
              onClick={()=>setSortMode("desc")}
            >
              <SortDesc className="w-4 h-4 rotate-180 text-blue-500" />
            </button>
            <button
              title="Ordenar por menos calibrados"
              className={`p-2 rounded-full hover:bg-blue-100 ${sortMode==="asc" ? "bg-blue-200" : ""}`}
              onClick={()=>setSortMode("asc")}
            >
              <SortAsc className="w-4 h-4 text-blue-500" />
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={metrologosTotales}>
            <XAxis
              dataKey="name"
              tick={({x, y, payload, index})=>{
                const entry = metrologosTotales[index];
                const color = entry ? entry.color : "#1a202c";
                const contrast = getContrastText(color);
                return (
                  <g transform={`translate(${x},${y+12})`}>
                    <rect
                      x={-40}
                      y={-18}
                      width={80}
                      height={20}
                      rx={8}
                      fill={color}
                      opacity={0.75}
                    />
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      fill={contrast}
                      fontWeight={700}
                      fontSize={13}
                    >
                      {payload.value}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis />
            <Tooltip
              formatter={(value, name, props) => [`${value} calibraciones`, "Total"]}
              labelFormatter={(label) => `Metrologo: ${label}`}
            />
            <Bar dataKey="total">
              {metrologosTotales.map((entry, i) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6">
          {metrologosTotales.map((met, i) => (
            <span key={met.name} className="flex items-center gap-1 text-sm font-semibold" style={{
              color: getContrastText(met.color),
              background: met.color,
              padding: "2px 12px",
              borderRadius: "0.6em",
              opacity: 0.95
            }}>
              <span className="w-3 h-3 rounded-sm mr-1 inline-block" style={{ background: met.color, border: "1.5px solid #fff" }}></span>
              {met.name}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default CalibrationStatsScreen;
