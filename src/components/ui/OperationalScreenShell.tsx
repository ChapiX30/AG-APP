import React from 'react';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import labLogo from '../../assets/lab_logo.png';

/** Fondo corporativo compartido (Normas, Permisos TR, Vacaciones, Control RH). */
export const OPERATIONAL_SCREEN_BG = 'bg-[#eef2f7]';

export const AG_BRAND_BLUE = '#2464A3';

interface OperationalScreenShellProps {
  children: React.ReactNode;
  className?: string;
}

export const OperationalScreenShell: React.FC<OperationalScreenShellProps> = ({
  children,
  className,
}) => (
  <div
    className={clsx(
      'min-h-full w-full flex-shrink-0 text-slate-800 font-sans',
      OPERATIONAL_SCREEN_BG,
      className,
    )}
  >
    {children}
  </div>
);

type HeaderMaxWidth = '5xl' | '6xl';

const maxWidthClass: Record<HeaderMaxWidth, string> = {
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

export interface OperationalScreenHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  /** Ícono junto al título (p. ej. CalendarDays en Control RH). */
  titleIcon?: React.ReactNode;
  /** Badge o meta a la derecha en desktop (p. ej. «Permiso TR»). */
  badge?: React.ReactNode;
  maxWidth?: HeaderMaxWidth;
  onBack?: () => void;
  backLabel?: string;
}

export const OperationalScreenHeader: React.FC<OperationalScreenHeaderProps> = ({
  title,
  subtitle,
  titleIcon,
  badge,
  maxWidth = '6xl',
  onBack,
  backLabel = 'Volver',
}) => {
  const { goBack } = useNavigation();
  const handleBack = onBack ?? goBack;

  return (
    <div className="bg-white border-b border-slate-200 shadow-sm">
      <div
        className={clsx(
          maxWidthClass[maxWidth],
          'mx-auto px-4 sm:px-6 py-4 flex items-center gap-4',
        )}
      >
        <button
          type="button"
          onClick={handleBack}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft size={20} />
        </button>
        <img
          src={labLogo}
          alt="Equipos y Servicios AG"
          className="h-10 w-auto object-contain shrink-0"
          draggable={false}
        />
        <div className="flex-1 min-w-0 border-l border-slate-200 pl-4">
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            {titleIcon}
            {title}
          </h1>
          {subtitle ? (
            <p className="text-xs sm:text-sm text-slate-500 truncate">{subtitle}</p>
          ) : null}
        </div>
        {badge ? <div className="hidden sm:flex shrink-0">{badge}</div> : null}
      </div>
    </div>
  );
};
