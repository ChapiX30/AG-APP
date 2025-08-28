// src/screens/DashboardGraficos.tsx

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useState } from "react";

export function DashboardGraficos() {
  // Ejemplo de datos, pon aquí tu lógica real o consulta de Firestore
  const dataEquipos = [
    { departamento: "Dimensional", cantidad: 80 },
    { departamento: "Eléctrica", cantidad: 83 },
    { departamento: "Mecánica", cantidad: 30 }
  ];
  const [filtro, setFiltro] = useState("Todos");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <select
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="border px-3 py-1 rounded"
        >
          <option value="Todos">Todos</option>
          <option value="Dimensional">Dimensional</option>
          <option value="Eléctrica">Eléctrica</option>
          <option value="Mecánica">Mecánica</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={dataEquipos.filter(d => filtro === "Todos" || d.departamento === filtro)}>
          <XAxis dataKey="departamento" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="cantidad" fill="#ff7300" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
