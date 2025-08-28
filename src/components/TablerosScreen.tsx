// src/screens/TablerosScreen.tsx

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs"; // Usa tu librería de tabs
import FridayScreen from "./FridayScreen"; // Asegúrate que la ruta es correcta
import { DashboardGraficos } from "./DashboardGraficos"; // Crea este archivo con el dashboard de gráficos

export default function TablerosScreen() {
  const [activeTab, setActiveTab] = useState("equipos");

  return (
    <div className="flex flex-col min-h-[95vh] w-full bg-slate-100 dark:bg-slate-900">
      {/* Tabs en la parte superior */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="equipos">Equipos</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
          {/* Agrega más tabs si lo necesitas */}
        </TabsList>
        <div className="p-4">
          <TabsContent value="equipos">
            <FridayScreen />
          </TabsContent>
          <TabsContent value="graficos">
            <DashboardGraficos />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
