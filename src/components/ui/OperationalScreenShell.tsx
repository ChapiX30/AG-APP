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

type HeaderMaxWidth = '5xl' | '6xl' | 'full';

const maxWidthClass: Record<HeaderMaxWidth, string> = {
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-none w-full',
};

export interface OperationalScreenHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  /** Ícono junto al título (p. ej. CalendarDays en Control RH). */
  titleIcon?: React.ReactNode;
  /** Badge o meta a la derecha en desktop (p. ej. «Permiso TR»). */
  badge?: React.ReactNode;
  /** Acciones siempre visibles a la derecha (botones, toggles). */
  actions?: React.ReactNode;
  maxWidth?: HeaderMaxWidth;
  compact?: boolean;
  onBack?: () => void;
  backLabel?: string;
}

export const OperationalScreenHeader: React.FC<OperationalScreenHeaderProps> = ({
  title,
  subtitle,
  titleIcon,
  badge,
  actions,
  maxWidth = '6xl',
  compact = false,
  onBack,
  backLabel = 'Volver',
}) => {
  const { goBack } = useNavigation();
  const handleBack = onBack ?? goBack;

  return (
    <div className="bg-white border-b border-slate-200 shadow-sm shrink-0">
      <div
        className={clsx(
          maxWidthClass[maxWidth],
          'mx-auto px-3 sm:px-5 flex flex-wrap items-center gap-x-3 gap-y-2',
          compact ? 'py-2.5' : 'py-3 sm:py-4',
        )}
      >
        <button
          type="button"
          onClick={handleBack}
          className="p-2.5 sm:p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft size={20} />
        </button>
        <img
          src={labLogo}
          alt="Equipos y Servicios AG"
          className={clsx('w-auto object-contain shrink-0', compact ? 'h-8' : 'h-9 sm:h-10')}
          draggable={false}
        />
        <div className="flex-1 min-w-0 border-l border-slate-200 pl-3 sm:pl-4">
          <h1 className={clsx(
            'font-semibold text-slate-900 tracking-tight flex items-center gap-2 min-w-0',
            compact ? 'text-base sm:text-lg' : 'text-base sm:text-xl',
          )}>
            {titleIcon ? <span className="shrink-0">{titleIcon}</span> : null}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle ? (
            <p className={clsx('text-slate-500 truncate', compact ? 'hidden sm:block text-xs' : 'text-xs sm:text-sm')}>{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto shrink-0 order-last sm:order-none">
            {actions}
          </div>
        ) : null}
        {badge ? <div className="hidden sm:flex shrink-0">{badge}</div> : null}
      </div>
    </div>
  );
};
