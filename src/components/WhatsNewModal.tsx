import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { VernierIcon } from './icons/VernierIcon';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AppUpdate } from '../config/appUpdates';
import { useNavigation } from '../hooks/useNavigation';

const AG_BLUE = '#2464A3';

interface WhatsNewModalProps {
  update: AppUpdate | null;
  onDismiss: () => void;
}

function formatUpdateDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ update, onDismiss }) => {
  const { navigateTo } = useNavigation();

  const handleGoToScreen = () => {
    if (!update) return;
    if (update.screenId) navigateTo(update.screenId);
    onDismiss();
  };

  return (
    <AnimatePresence>
      {update && (
        <motion.div
          key={update.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={onDismiss}
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 py-5 text-white"
              style={{ background: `linear-gradient(135deg, ${AG_BLUE} 0%, #1a4d7a 100%)` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-white/15 shrink-0">
                    <VernierIcon size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-white/75">
                      Novedad · {formatUpdateDate(update.date)}
                    </p>
                    <h2 id="whats-new-title" className="text-lg font-bold leading-snug mt-0.5">
                      {update.title}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="p-1.5 rounded-lg text-white/80 hover:bg-white/15 hover:text-white transition-colors shrink-0"
                  aria-label="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">{update.summary}</p>

              {update.highlights.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2.5">
                    Cómo usarlo
                  </p>
                  <ul className="space-y-2">
                    {update.highlights.map((item) => (
                      <li key={item} className="flex gap-2.5 text-sm text-slate-700 leading-snug">
                        <CheckCircle2
                          size={16}
                          className="shrink-0 mt-0.5"
                          style={{ color: AG_BLUE }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Entendido
              </button>
              {update.screenId && (
                <button
                  type="button"
                  onClick={handleGoToScreen}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:opacity-95 transition-opacity"
                  style={{ backgroundColor: AG_BLUE }}
                >
                  {update.screenLabel ?? 'Ver pantalla'}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
