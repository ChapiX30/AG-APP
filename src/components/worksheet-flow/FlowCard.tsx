import React from "react";
import { flowAccents, type FlowAccent } from "./flowTheme";

interface FlowCardProps {
  accent?: FlowAccent;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export const FlowCard: React.FC<FlowCardProps> = ({
  accent = "worksheet",
  title,
  description,
  icon,
  headerRight,
  children,
  className = "",
  bodyClassName = "",
  noPadding = false,
}) => {
  const theme = flowAccents[accent];
  const hasHeader = title || description || icon || headerRight;

  return (
    <div
      className={`bg-white rounded-2xl shadow-xl border border-slate-200/80 ring-1 ${theme.cardRing} overflow-hidden ${className}`}
    >
      {hasHeader && (
        <div
          className={`px-6 py-4 border-b ${theme.softBorder} bg-gradient-to-r from-slate-50 to-white flex items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div
                className={`p-2.5 rounded-xl ${theme.soft} ${theme.highlight} shrink-0`}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-slate-500 mt-0.5">{description}</p>
              )}
            </div>
          </div>
          {headerRight}
        </div>
      )}
      <div className={noPadding ? bodyClassName : `p-6 sm:p-8 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
};

interface FlowSectionProps {
  icon: React.ReactNode;
  title: string;
  accentClass?: string;
  children: React.ReactNode;
  className?: string;
}

export const FlowSection: React.FC<FlowSectionProps> = ({
  icon,
  title,
  accentClass = "text-blue-600",
  children,
  className = "",
}) => (
  <section className={`space-y-4 ${className}`}>
    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
      <span className={accentClass}>{icon}</span>
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</h3>
    </div>
    {children}
  </section>
);
