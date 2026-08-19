import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Wrench, X } from 'lucide-react';
import {
  CELESTICA_SITIO_CUES_EVENT,
  CELESTICA_SITIO_CUE_META,
  dismissCelesticaSitioCuesToday,
  getPendingCelesticaSitioCues,
  pickCelesticaSitioCueLine,
  type CelesticaSitioCueKey,
} from '../utils/celesticaSitioCues';

const ROTATE_MS = 4200;
const FADE_MS = 280;

function usePendingCelesticaCues(uid: string, enabled: boolean): CelesticaSitioCueKey[] {
  const [pending, setPending] = useState<CelesticaSitioCueKey[]>([]);

  useEffect(() => {
    if (!enabled || !uid) {
      setPending([]);
      return;
    }

    const refresh = () => setPending(getPendingCelesticaSitioCues(uid));
    refresh();
    window.addEventListener(CELESTICA_SITIO_CUES_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CELESTICA_SITIO_CUES_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [uid, enabled]);

  return pending;
}

function useRotatingCue(pending: CelesticaSitioCueKey[]) {
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setTick(0);
    setVisible(true);
  }, [pending.join('|')]);

  useEffect(() => {
    if (pending.length === 0) return undefined;
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setTick((n) => n + 1);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [pending.length]);

  const cue = pending.length > 0 ? pending[tick % pending.length] : null;
  const line = cue ? pickCelesticaSitioCueLine(cue, Math.floor(tick / Math.max(pending.length, 1))) : null;
  return { cue, line, visible };
}

export function CelesticaSitioCueBar({
  uid,
  enabled,
  onOpen,
}: {
  uid: string;
  enabled: boolean;
  onOpen: (screen: string) => void;
}) {
  const pending = usePendingCelesticaCues(uid, enabled);
  const { cue, line, visible } = useRotatingCue(pending);

  if (!enabled || !uid || pending.length === 0 || !cue || !line) return null;

  return (
    <div className="px-4 sm:px-6 py-2 border-t border-amber-100/80 bg-gradient-to-r from-amber-50/90 via-white to-sky-50/80">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>

        <button
          type="button"
          onClick={() => onOpen(CELESTICA_SITIO_CUE_META[cue].screen)}
          className="flex-1 min-w-0 text-left"
        >
          <p
            className="text-[12px] sm:text-[13px] text-slate-700 truncate transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0 }}
          >
            <span className="font-semibold italic text-amber-700">{line.sound}</span>
            <span className="text-slate-300 mx-1.5">·</span>
            <span className="font-medium">{line.line}</span>
          </p>
        </button>

        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          {pending.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onOpen(CELESTICA_SITIO_CUE_META[key].screen)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white border border-amber-200 text-amber-800 hover:border-amber-400 hover:bg-amber-50 transition-colors"
            >
              {key === 'hoja_herramienta' ? <Wrench className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              {CELESTICA_SITIO_CUE_META[key].label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => dismissCelesticaSitioCuesToday(uid)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors flex-shrink-0"
          title="Ocultar por hoy"
          aria-label="Ocultar recordatorio por hoy"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function CelesticaSitioDetailCues({
  uid,
  enabled,
  onOpen,
}: {
  uid: string;
  enabled: boolean;
  onOpen: (screen: string) => void;
}) {
  const pending = usePendingCelesticaCues(uid, enabled);
  const { cue, line, visible } = useRotatingCue(pending);

  if (!enabled || !uid || pending.length === 0 || !cue || !line) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <button type="button" onClick={() => onOpen(CELESTICA_SITIO_CUE_META[cue].screen)} className="flex-1 min-w-0 text-left">
          <p
            className="text-[13px] text-slate-700 truncate transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0 }}
          >
            <span className="font-semibold italic text-amber-700">{line.sound}</span>
            <span className="text-slate-300 mx-1.5">·</span>
            <span className="font-medium">{line.line}</span>
          </p>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {pending.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpen(CELESTICA_SITIO_CUE_META[key].screen)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white border border-amber-200 text-amber-800 hover:border-amber-400 hover:bg-amber-50 transition-colors"
          >
            {key === 'hoja_herramienta' ? <Wrench className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            {CELESTICA_SITIO_CUE_META[key].label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CelesticaSitioCardCues({
  uid,
  enabled,
  onOpen,
  compact = false,
}: {
  uid: string;
  enabled: boolean;
  onOpen: (screen: string) => void;
  compact?: boolean;
}) {
  const pending = usePendingCelesticaCues(uid, enabled);
  const whisper = useMemo(() => {
    if (pending.length === 0) return null;
    return pickCelesticaSitioCueLine(pending[0], 0);
  }, [pending]);

  if (!enabled || pending.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-1.5 min-w-0 ${compact ? 'mt-1' : 'mt-1.5'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
      </span>
      {whisper && (
        <span className="text-[10px] text-amber-700/90 italic truncate">
          {whisper.sound}
        </span>
      )}
      {pending.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onOpen(CELESTICA_SITIO_CUE_META[key].screen)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors"
        >
          {key === 'hoja_herramienta' ? <Wrench className="w-2.5 h-2.5" /> : <ShieldCheck className="w-2.5 h-2.5" />}
          {CELESTICA_SITIO_CUE_META[key].label}
        </button>
      ))}
    </div>
  );
}
