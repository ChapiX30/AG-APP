import React from 'react';
import { useNavigation } from '../../hooks/useNavigation';

export type ScreenSkeletonVariant = 'list' | 'calendar' | 'generic';

/** Pantallas lazy → variante de skeleton (resto usa generic). */
export const SCREEN_SKELETONS: Partial<Record<string, ScreenSkeletonVariant>> = {
  drive: 'list',
  friday: 'list',
  calendario: 'calendar',
  empresas: 'list',
};

export function getScreenSkeletonVariant(screen: string): ScreenSkeletonVariant {
  return SCREEN_SKELETONS[screen] ?? 'generic';
}

const bone = 'bg-slate-200/90 rounded';
const boneMuted = 'bg-slate-100 rounded';

function ListScreenSkeleton() {
  return (
    <div className="w-full p-4 md:p-6 min-h-[12rem]" aria-hidden="true">
      <div className="animate-pulse space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${bone} h-9 w-9 shrink-0`} />
          <div className={`${bone} h-9 flex-1 min-w-[8rem] max-w-md`} />
          <div className={`${bone} h-9 w-20`} />
          <div className={`${bone} h-9 w-20`} />
        </div>
        <div className={`${boneMuted} h-10 w-full rounded-lg`} />
        <div className="rounded-lg border border-slate-200/80 overflow-hidden bg-white/60">
          <div className={`${boneMuted} h-9 w-full border-b border-slate-200/60`} />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-3 border-b border-slate-100 last:border-b-0"
            >
              <div className={`${bone} h-5 w-5 shrink-0 rounded`} />
              <div className={`${bone} h-8 w-8 shrink-0 rounded-full`} />
              <div className="flex-1 space-y-2 min-w-0">
                <div className={`${bone} h-3.5 w-[55%] max-w-xs`} />
                <div className={`${bone} h-2.5 w-[30%] max-w-[8rem]`} />
              </div>
              <div className={`${bone} h-3 w-14 shrink-0 hidden sm:block`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarScreenSkeleton() {
  const weeks = 5;
  const days = 7;

  return (
    <div className="w-full p-4 md:p-6 min-h-[12rem]" aria-hidden="true">
      <div className="animate-pulse space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`${bone} h-9 w-9`} />
            <div className={`${bone} h-7 w-36 md:w-48`} />
          </div>
          <div className="flex gap-2">
            <div className={`${bone} h-9 w-9`} />
            <div className={`${bone} h-9 w-9`} />
            <div className={`${bone} h-9 w-24`} />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5 md:gap-2">
          {Array.from({ length: days }).map((_, i) => (
            <div key={`h-${i}`} className={`${boneMuted} h-6 md:h-7`} />
          ))}
        </div>
        <div className="rounded-lg border border-slate-200/80 overflow-hidden bg-white/60 p-1.5 md:p-2">
          <div className="grid grid-cols-7 gap-1.5 md:gap-2">
            {Array.from({ length: weeks * days }).map((_, i) => (
              <div
                key={i}
                className={`${boneMuted} aspect-square min-h-[2.5rem] md:min-h-[4rem] rounded-md`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericScreenSkeleton() {
  return (
    <div className="w-full p-4 md:p-6 min-h-[12rem]" aria-hidden="true">
      <div className="animate-pulse space-y-5">
        <div className={`${bone} h-8 w-48 max-w-[70%]`} />
        <div className={`${bone} h-4 w-64 max-w-[85%]`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200/80 bg-white/60 p-4 space-y-3"
            >
              <div className={`${bone} h-5 w-2/3`} />
              <div className={`${bone} h-3 w-full`} />
              <div className={`${bone} h-3 w-4/5`} />
              <div className={`${bone} h-9 w-24 mt-2`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const ScreenSkeleton: React.FC<{ variant: ScreenSkeletonVariant }> = ({ variant }) => {
  switch (variant) {
    case 'list':
      return <ListScreenSkeleton />;
    case 'calendar':
      return <CalendarScreenSkeleton />;
    default:
      return <GenericScreenSkeleton />;
  }
};

/** Fallback de Suspense que elige skeleton según pantalla actual. */
export const ScreenSuspenseFallback: React.FC = () => {
  const { currentScreen } = useNavigation();
  return <ScreenSkeleton variant={getScreenSkeletonVariant(currentScreen)} />;
};
