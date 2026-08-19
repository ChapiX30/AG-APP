import React from 'react';
import { CalendarDays, FileText } from 'lucide-react';
import { describeCarga, type NivelCarga, type TecnicoCarga } from '../utils/tecnicoCarga';

interface NivelStyle {
  label: string;
  barras: number;
  bar: string;
  text: string;
  edge: string;
  chip: string;
}

export const TECNICO_CARGA_STYLES: Record<NivelCarga, NivelStyle> = {
  ligero: {
    label: 'Libre',
    barras: 1,
    bar: 'bg-emerald-500',
    text: 'text-emerald-700',
    edge: 'bg-emerald-400',
    chip: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  normal: {
    label: 'Normal',
    barras: 2,
    bar: 'bg-sky-500',
    text: 'text-sky-700',
    edge: 'bg-sky-400',
    chip: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  cargado: {
    label: 'Cargado',
    barras: 3,
    bar: 'bg-amber-500',
    text: 'text-amber-700',
    edge: 'bg-amber-400',
    chip: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  saturado: {
    label: 'Saturado',
    barras: 4,
    bar: 'bg-rose-500',
    text: 'text-rose-700',
    edge: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

const BAR_HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4'];

export function TecnicoCargaBars({ nivel }: { nivel: NivelCarga }) {
  const style = TECNICO_CARGA_STYLES[nivel];
  return (
    <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={`w-[3.5px] rounded-[1px] ${h} ${i < style.barras ? style.bar : 'bg-slate-200'}`}
        />
      ))}
    </span>
  );
}

export function TecnicoCargaMeter({ carga }: { carga?: TecnicoCarga }) {
  if (!carga) return null;
  const style = TECNICO_CARGA_STYLES[carga.nivel];

  return (
    <div className="mt-1.5 space-y-1" title={describeCarga(carga)}>
      <div className="flex items-center gap-2 min-w-0">
        <TecnicoCargaBars nivel={carga.nivel} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>{style.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${style.chip}`}>
          <FileText className="w-3 h-3" />
          {carga.pendientes} {carga.pendientes === 1 ? 'hoja' : 'hojas'}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
          <CalendarDays className="w-3 h-3" />
          {carga.diasSemana} {carga.diasSemana === 1 ? 'día' : 'días'}
        </span>
      </div>
    </div>
  );
}

export function TecnicoCargaLeyenda({ loading }: { loading?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Carga del equipo</span>
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
        <FileText className="w-3 h-3" /> hojas pendientes
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
        <CalendarDays className="w-3 h-3" /> días fuera esta semana
      </span>
      {loading && (
        <span className="text-[10px] text-slate-400 italic">actualizando hojas…</span>
      )}
      <span className="text-[10px] text-slate-400 ml-auto hidden sm:inline">
        Referencia: puedes asignar a quien quieras
      </span>
    </div>
  );
}
