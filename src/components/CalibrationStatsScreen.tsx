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
import { motion } from "framer-motion";
import { ArrowLeft, SortDesc, SortAsc } from "lucide-react";
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

// -------- PieChart PRO (Iron Man Glow) --------
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
      <defs>
        <radialGradient id={`grad-${payload.name}`} cx="50%" cy="50%" r="100%">
          <stop offset="0%" stopColor={fill} stopOpacity={0.95} />
          <stop offset="100%" stopColor="#0ff" stopOpacity={0.22} />
        </radialGradient>
      </defs>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 12}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={`url(#grad-${payload.name})`}
        stroke="#0ff"
        strokeWidth={2}
        style={{
          filter: "drop-shadow(0 0 16px #0ff)",
          transition: "all 0.3s cubic-bezier(.22,1,.36,1)",
        }}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={3} fill={fill} />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey - 4} textAnchor={textAnchor} fill="#0ff" fontWeight={700}>
        {`${payload.name}: ${value}`}
      </text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey + 18} textAnchor={textAnchor} fill="#666" fontSize={13}>
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

  // -------- UI --------
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

      {/* Selector de mes */}
      <div className="flex justify-center gap-4 mb-4">
        <label className="font-bold text-blue-700 flex items-center gap-2">
          Selecciona mes:&nbsp;
          <input
            type="month"
            className="p-2 rounded border border-blue-300"
            value={mesSeleccionado}
            max={`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`}
            onChange={e => setMesSeleccionado(e.target.value)}
          />
        </label>
        <button
          onClick={()=>setMesSeleccionado(
            `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`
          )}
          className="ml-2 px-4 py-2 bg-blue-200 rounded font-semibold hover:bg-blue-300"
        >
          Mes Actual
        </button>
      </div>

      {/* Select metrologo */}
      <div className="mb-4 flex flex-col md:flex-row items-center justify-center gap-4">
        <select
          className="p-3 border rounded-xl shadow-md min-w-[220px] bg-white text-gray-900"
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
      </div>

      {/* Estadísticas del metrologo */}
      {metrologoSeleccionado && !loading && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "anticipate" }}
        >
          {/* Barras por mes */}
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
                <Bar dataKey="total" fill={colorBarra} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* PieChart con efecto Glow SOLO magnitudes presentes */}
          <div className="bg-white p-4 rounded-xl shadow-lg">
            <h2 className="text-lg font-semibold mb-4 text-center text-gray-700">
              Por Magnitud <span className="text-blue-400">
                ({metrologoSeleccionado.name}, {mesActualTxt})
              </span>
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
                  dataKey="value"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(-1)}
                  isAnimationActive
                >
                  {dataMagnitudes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColorForMagnitud(entry.name, index)} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            {/* Leyenda SOLO de las presentes, ordenada alfa */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {magnitudesPresentes.map((mag, i) => (
                <span key={mag} className="flex items-center gap-1 text-sm font-medium" style={{ color: getColorForMagnitud(mag, i) }}>
                  <span className="w-4 h-4 rounded-sm mr-1 inline-block" style={{ background: getColorForMagnitud(mag, i) }}></span>
                  {mag}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* --- Ranking Top 3 del mes seleccionado --- */}
      <div className="max-w-3xl mx-auto mt-6 mb-10 text-center">
        <h2 className="text-xl font-bold text-blue-600 mb-4">🏆 Top 3 Metrólogos ({mesActualTxt})</h2>
        <div className="flex justify-center gap-6">
          {top3.map((m, i) => (
            <motion.div
              key={m.name}
              className="bg-white border-2 border-blue-400 rounded-xl px-4 py-3 shadow-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.2 }}
            >
              <span className="text-2xl">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
              <p className="text-blue-700 font-bold">{m.name}</p>
              <p className="text-sm text-gray-500">{m.total} calibraciones</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Barra GLOBAL SOLO mes seleccionado */}
      <motion.div
        className="max-w-4xl mx-auto mt-16 mb-8 bg-white rounded-2xl shadow-2xl p-6"
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8, ease: "anticipate" }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-1">
          <h2 className="text-2xl font-bold text-center text-gray-800">
            TOTAL GENERAL - Calibraciones por Metrologo (Mes: {mesActualTxt})
          </h2>
          <div className="flex items-center gap-2">
            <button
              title="Orden personalizado"
              className={`p-2 rounded-full hover:bg-blue-100 ${sortMode==="order" ? "bg-blue-200" : ""}`}
              onClick={()=>setSortMode("order")}
            >
              <SortDesc className="w-4 h-4 text-blue-500" />
            </button>
            <button
              title="Orden descendente"
              className={`p-2 rounded-full hover:bg-blue-100 ${sortMode==="desc" ? "bg-blue-200" : ""}`}
              onClick={()=>setSortMode("desc")}
            >
              <SortDesc className="w-4 h-4 rotate-180 text-blue-500" />
            </button>
            <button
              title="Orden ascendente"
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
              tick={{ fontSize: 12, fontWeight: 600, angle: -25, dy: 10, fill: "#333" }}
              interval={0}
              height={60}
            />
            <YAxis />
            <Tooltip formatter={(value) => [`${value} calibraciones`, "Total"]} />
            <Bar dataKey="total">
              {metrologosTotales.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Leyenda personalizada */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6">
          {metrologosTotales.map((met) => (
            <span
              key={met.name}
              className="flex items-center gap-1 text-sm font-semibold"
              style={{
                color: getContrastText(met.color),
                background: met.color,
                padding: "2px 12px",
                borderRadius: "0.6em",
                opacity: 0.95,
              }}
            >
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
