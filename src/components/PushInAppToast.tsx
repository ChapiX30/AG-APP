import React from 'react';
import toast from 'react-hot-toast';

/** Toast premium cuando llega un push con la app en primer plano. */
export function showInAppPushToast(title: string, body: string, onOpen?: () => void) {
  toast.custom(
    (t) => (
      <button
        type="button"
        onClick={() => {
          toast.dismiss(t.id);
          onOpen?.();
        }}
        className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] text-left rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: 'var(--surface, #161616)',
          borderColor: 'var(--border-color, rgba(255,255,255,0.12))',
          color: 'var(--text, #f5f5f5)',
        }}
      >
        <div className="flex gap-3 p-3.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
            style={{ background: 'rgba(36,100,163,0.18)', color: 'var(--acc, #2464a3)' }}
            aria-hidden
          >
            AG
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60 mb-0.5">
              Nuevo aviso
            </p>
            <p className="text-sm font-semibold leading-snug truncate">{title}</p>
            {body ? (
              <p className="text-xs opacity-70 mt-1 line-clamp-2 leading-snug">{body}</p>
            ) : null}
            <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--acc, #2464a3)' }}>
              Toca para abrir →
            </p>
          </div>
        </div>
      </button>
    ),
    { duration: 6500, position: 'top-center' },
  );
}
