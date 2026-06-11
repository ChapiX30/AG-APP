import React from "react";
import { ArrowLeft } from "lucide-react";
import { flowAccents, type FlowAccent } from "./flowTheme";

interface FlowScreenHeaderProps {
  accent?: FlowAccent;
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Logo u otro ícono sobre fondo blanco para que no se pierda en el gradiente */
  iconVariant?: "default" | "brand";
  badge?: React.ReactNode;
  onBack: () => void;
  rightSlot?: React.ReactNode;
  sticky?: boolean;
}

export const FlowScreenHeader: React.FC<FlowScreenHeaderProps> = ({
  accent = "worksheet",
  title,
  subtitle,
  icon,
  iconVariant = "default",
  badge,
  onBack,
  rightSlot,
  sticky = true,
}) => {
  const theme = flowAccents[accent];
  const iconWrapClass =
    iconVariant === "brand"
      ? "w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white shadow-lg ring-2 ring-white/50 p-1.5 flex items-center justify-center shrink-0"
      : `w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBox}`;

  return (
    <header
      className={`relative overflow-hidden text-white shadow-lg ${
        sticky ? "sticky top-0 z-40" : ""
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-r ${theme.header}`} />
      <div
        className={`absolute -top-24 -right-16 h-56 w-56 rounded-full bg-gradient-to-br ${theme.headerGlow} blur-3xl`}
      />
      <div className="absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={onBack}
            className="p-2 sm:p-2.5 rounded-xl hover:bg-white/10 active:scale-95 transition-all shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {icon && <div className={iconWrapClass}>{icon}</div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-bold tracking-tight leading-tight">{title}</h1>
              {badge}
            </div>
            {subtitle && (
              <div className="text-blue-100 text-xs sm:text-sm mt-0.5 flex items-center gap-2 flex-wrap line-clamp-2 sm:line-clamp-none">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {rightSlot && (
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-start sm:justify-end pl-11 sm:pl-0">
            {rightSlot}
          </div>
        )}
      </div>
    </header>
  );
};
