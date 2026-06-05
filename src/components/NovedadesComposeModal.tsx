import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, PlusCircle, X } from 'lucide-react';
import { VernierIcon } from './icons/VernierIcon';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { APP_SCREEN_OPTIONS, createAppNovedad } from '../utils/appNovedades';

interface NovedadesComposeModalProps {
  open: boolean;
  onClose: () => void;
  autorUid: string;
  autorNombre: string;
}

export const NovedadesComposeModal: React.FC<NovedadesComposeModalProps> = ({
  open,
  onClose,
  autorUid,
  autorNombre,
}) => {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [highlightsText, setHighlightsText] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [screenId, setScreenId] = useState('');
  const [screenLabel, setScreenLabel] = useState('');
  const [rolesText, setRolesText] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setSummary('');
    setHighlightsText('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setScreenId('');
    setScreenLabel('');
    setRolesText('');
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !summary.trim()) {
      toast.error('Completa título y resumen.');
      return;
    }

    const highlights = highlightsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const roles = rolesText
      .split(',')
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);

    setSaving(true);
    try {
      await createAppNovedad({
        title: title.trim(),
        summary: summary.trim(),
        highlights,
        date,
        screenId: screenId || undefined,
        screenLabel: screenLabel.trim() || undefined,
        roles: roles.length > 0 ? roles : undefined,
        autorUid,
        autorNombre,
      });
      toast.success('Novedad publicada. Los usuarios la verán al entrar.');
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo publicar la novedad.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="novedad-compose-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
              <div className="p-2 rounded-xl bg-[#2464A3]/10 text-[#2464A3]">
                <VernierIcon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="novedad-compose-title" className="text-base font-bold text-slate-900">
                  Publicar novedad
                </h2>
                <p className="text-xs text-slate-500">Visible para todos (o por rol si lo indicas).</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              <Field label="Título *">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="compose-input"
                  placeholder="Ej. Nueva pantalla: Vacaciones"
                  maxLength={120}
                />
              </Field>

              <Field label="Resumen *">
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="compose-input min-h-[72px] resize-y"
                  placeholder="Breve descripción de qué cambió o qué hay de nuevo."
                  maxLength={500}
                />
              </Field>

              <Field label="Cómo usarlo (un paso por línea)">
                <textarea
                  value={highlightsText}
                  onChange={(e) => setHighlightsText(e.target.value)}
                  className="compose-input min-h-[96px] resize-y font-mono text-xs"
                  placeholder={'En el menú, abre «Vacaciones».\nCompleta fechas y envía la solicitud.'}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Fecha">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="compose-input"
                  />
                </Field>
                <Field label="Solo para roles (opcional)">
                  <input
                    value={rolesText}
                    onChange={(e) => setRolesText(e.target.value)}
                    className="compose-input"
                    placeholder="calidad, administrativo"
                  />
                </Field>
              </div>

              <Field label="Enlace a pantalla (opcional)">
                <select
                  value={screenId}
                  onChange={(e) => setScreenId(e.target.value)}
                  className="compose-input"
                >
                  {APP_SCREEN_OPTIONS.map((opt) => (
                    <option key={opt.id || 'none'} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>

              {screenId && (
                <Field label="Texto del botón">
                  <input
                    value={screenLabel}
                    onChange={(e) => setScreenLabel(e.target.value)}
                    className="compose-input"
                    placeholder="Ir a Vacaciones"
                  />
                </Field>
              )}
            </form>

            <div className="px-5 pb-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#2464A3] hover:opacity-95 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                Publicar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="text-xs font-semibold text-slate-600 mb-1.5 block">{label}</span>
    {children}
    <style>{`
      .compose-input {
        width: 100%;
        padding: 0.625rem 0.75rem;
        font-size: 0.875rem;
        border-radius: 0.75rem;
        border: 1px solid #e2e8f0;
        color: #0f172a;
        background: #fff;
      }
      .compose-input:focus {
        outline: none;
        border-color: #2464A3;
        box-shadow: 0 0 0 3px rgba(36, 100, 163, 0.15);
      }
    `}</style>
  </label>
);
