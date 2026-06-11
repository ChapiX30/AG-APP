import React, { useState } from "react";
import {
  Activity,
  Ruler,
  Zap,
  Waves,
  Radio,
  Dumbbell,
  Droplets,
  Scale,
  Wrench,
  Gauge,
  FlaskConical,
  FileText,
  Thermometer,
  Timer,
  Box,
  Eye,
  Vibrate,
  type LucideIcon,
} from "lucide-react";
import { getMagnitudImageSrc } from "../../utils/magnitudAssets";
import { flowAccents, type FlowAccent } from "./flowTheme";

const ICON_MAP: { test: (id: string) => boolean; Icon: LucideIcon }[] = [
  { test: (id) => id.includes("acustica"), Icon: Activity },
  { test: (id) => id.includes("dimensional"), Icon: Ruler },
  { test: (id) => id.includes("electrica"), Icon: Zap },
  { test: (id) => id.includes("flujo"), Icon: Waves },
  { test: (id) => id.includes("frecuencia"), Icon: Radio },
  { test: (id) => id.includes("fuerza"), Icon: Dumbbell },
  { test: (id) => id.includes("humedad"), Icon: Droplets },
  { test: (id) => id.includes("masa"), Icon: Scale },
  { test: (id) => id.includes("torsional"), Icon: Wrench },
  { test: (id) => id.includes("presion"), Icon: Gauge },
  { test: (id) => id.includes("quimica"), Icon: FlaskConical },
  { test: (id) => id.includes("reporte"), Icon: FileText },
  { test: (id) => id.includes("temperatura"), Icon: Thermometer },
  { test: (id) => id.includes("tiempo"), Icon: Timer },
  { test: (id) => id.includes("volumen"), Icon: Box },
  { test: (id) => id.includes("optica"), Icon: Eye },
  { test: (id) => id.includes("vibracion"), Icon: Vibrate },
  { test: (id) => id.includes("dureza"), Icon: Gauge },
];

function FallbackIcon({ magnitudeId }: { magnitudeId: string }) {
  const normalized = magnitudeId.toLowerCase();
  const match = ICON_MAP.find((m) => m.test(normalized));
  const Icon = match?.Icon ?? Activity;
  return <Icon className="w-8 h-8 sm:w-9 sm:h-9" strokeWidth={1.35} />;
}

interface MagnitudeCardVisualProps {
  magnitudeId: string;
  accent: FlowAccent;
  size?: "sm" | "md";
}

export const MagnitudeCardVisual: React.FC<MagnitudeCardVisualProps> = ({
  magnitudeId,
  accent,
  size = "md",
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = getMagnitudImageSrc(magnitudeId);
  const theme = flowAccents[accent];
  const box =
    size === "sm"
      ? "w-12 h-12 sm:w-14 sm:h-14"
      : "w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem]";

  if (src && !imgFailed) {
    return (
      <div
        className={`${box} shrink-0 rounded-2xl bg-gradient-to-br from-white to-slate-50 border border-slate-200/90 shadow-sm flex items-center justify-center p-2.5 group-hover:shadow-md transition-shadow`}
      >
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain drop-shadow-sm"
          onError={() => setImgFailed(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`${box} shrink-0 rounded-2xl border ${theme.softBorder} bg-gradient-to-br from-white ${theme.soft} flex items-center justify-center ${theme.highlight} shadow-sm`}
    >
      <FallbackIcon magnitudeId={magnitudeId} />
    </div>
  );
};
