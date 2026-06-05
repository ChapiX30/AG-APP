import React, { useMemo, useState } from 'react';
import { ChevronRight, Loader2, PlusCircle, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-toastify';
import type { AppUpdate } from '../config/appUpdates';
import { VernierIcon } from './icons/VernierIcon';
import { deleteAppNovedad, isFirestoreAppNovedad } from '../utils/appNovedades';
import { getSeenUpdateIds, getUnreadUpdateCount } from '../utils/appUpdatesStorage';

const PREVIEW_LIMIT = 3;

function formatShortDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy', { locale: es });
  } catch {
    return dateStr;
  }
}

interface NovedadesWidgetProps {
  uid: string;
  updates: AppUpdate[];
  seenRevision?: number;
  canCreate?: boolean;
  onSelect: (update: AppUpdate) => void;
  onCompose?: () => void;
  onHide: () => void;
  user?: { role?: string; puesto?: string } | null;
}

export const NovedadesWidget: React.FC<NovedadesWidgetProps> = ({
  uid,
  updates,
  seenRevision = 0,
  canCreate = false,
  onSelect,
  onCompose,
  onHide,
  user,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const seenIds = useMemo(
    () => new Set(getSeenUpdateIds(uid)),
    [uid, seenRevision],
  );

  const unreadCount = useMemo(
    () => getUnreadUpdateCount(uid, user, updates),
    [uid, user?.role, user?.puesto, updates, seenRevision],
  );

  const handleDelete = async (update: AppUpdate) => {
    if (!canCreate || !isFirestoreAppNovedad(update.id)) return;
    const ok = window.confirm(
      `¿Eliminar la novedad «${update.title}»?\n\nYa no la verá nadie en la app.`,
    );
    if (!ok) return;

    setDeletingId(update.id);
    try {
      await deleteAppNovedad(update.id);
      toast.success('Novedad eliminada.');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo eliminar la novedad.');
    } finally {
      setDeletingId(null);
    }
  };

  if (updates.length === 0 && !canCreate) return null;

  const visible = expanded ? updates : updates.slice(0, PREVIEW_LIMIT);
  const hasMore = updates.length > PREVIEW_LIMIT;

  return (
    <div className="rounded-2xl border ag-card flex flex-col overflow-hidden">
      <div className="p-3 border-b ag-border flex items-center gap-2">
        <VernierIcon size={16} className="acc-text shrink-0" />
        <span className="font-semibold text-sm ag-text flex-1">Novedades</span>
        {unreadCount > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full acc text-white">
            {unreadCount}
          </span>
        )}
        {canCreate && onCompose && (
          <button
            type="button"
            onClick={onCompose}
            className="p-1.5 rounded-lg acc-soft acc-text transition-all hover:opacity-90"
            title="Publicar novedad"
            aria-label="Publicar novedad"
          >
            <PlusCircle size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onHide}
          className="p-1 rounded-lg ag-muted hover:ag-text transition-colors"
          aria-label="Ocultar panel de novedades"
          title="Ocultar panel"
        >
          <X size={14} />
        </button>
      </div>

      {updates.length === 0 ? (
        <div className="p-4 text-center space-y-2">
          <p className="text-xs ag-muted">Aún no hay novedades publicadas.</p>
          {canCreate && onCompose && (
            <button
              type="button"
              onClick={onCompose}
              className="text-xs font-semibold acc-text hover:underline"
            >
              Crear la primera novedad
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto cs">
            {visible.map((update) => {
              const isUnread = !seenIds.has(update.id);
              const canDelete = canCreate && isFirestoreAppNovedad(update.id);
              const isDeleting = deletingId === update.id;

              return (
                <div
                  key={update.id}
                  className={`relative rounded-xl border ag-border transition-all card-interact group ${
                    isUnread ? 'acc-soft' : 'opacity-90 hover:opacity-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(update)}
                    className="w-full text-left p-3 pr-9"
                  >
                    <div className="flex items-start gap-2">
                      {isUnread ? (
                        <span
                          className="w-2 h-2 rounded-full acc shrink-0 mt-1.5"
                          aria-hidden
                        />
                      ) : (
                        <span className="w-2 shrink-0" aria-hidden />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium ag-text leading-snug line-clamp-2">
                          {update.title}
                        </p>
                        <p className="text-[10px] ag-faint mt-0.5">{formatShortDate(update.date)}</p>
                        <p className="text-xs ag-muted mt-1 line-clamp-2">{update.summary}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 ag-faint group-hover:acc-text transition-colors shrink-0 mt-0.5 opacity-60 group-hover:opacity-100" />
                    </div>
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(update)}
                      disabled={isDeleting}
                      className="absolute top-2 right-2 p-1.5 rounded-lg text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                      title="Eliminar novedad"
                      aria-label={`Eliminar ${update.title}`}
                    >
                      {isDeleting ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full py-2 text-xs font-semibold acc-text hover:underline"
              >
                {expanded ? 'Ver menos' : `Ver todas (${updates.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
