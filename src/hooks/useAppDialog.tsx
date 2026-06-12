import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

export type DialogVariant = 'default' | 'danger' | 'warning';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
};

export type AlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
  variant?: DialogVariant;
};

type PendingDialog =
  | {
      kind: 'confirm';
      options: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'alert';
      options: AlertOptions;
      resolve: () => void;
    };

interface AppDialogContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const AppDialogContext = createContext<AppDialogContextValue | undefined>(undefined);

const toConfirmOptions = (input: ConfirmOptions | string): ConfirmOptions =>
  typeof input === 'string' ? { message: input } : input;

const toAlertOptions = (input: AlertOptions | string): AlertOptions =>
  typeof input === 'string' ? { message: input } : input;

const variantStyles: Record<
  DialogVariant,
  { icon: typeof Info; iconClass: string; confirmBtn: string }
> = {
  default: {
    icon: Info,
    iconClass: 'text-[#2464A3] bg-blue-50',
    confirmBtn: 'bg-[#2464A3] hover:bg-[#2d72b8] text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 bg-amber-50',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    icon: AlertTriangle,
    iconClass: 'text-red-600 bg-red-50',
    confirmBtn: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

const AppDialogModal: React.FC<{
  dialog: PendingDialog;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ dialog, onConfirm, onCancel }) => {
  const isConfirm = dialog.kind === 'confirm';
  const options = dialog.options;
  const variant = options.variant ?? (isConfirm ? 'default' : 'default');
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  const title =
    options.title ??
    (isConfirm
      ? variant === 'danger'
        ? 'Confirmar acción'
        : variant === 'warning'
          ? 'Atención'
          : 'Confirmar'
      : variant === 'danger'
        ? 'Error'
        : 'Aviso');

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      role="presentation"
      data-ag-no-swipe-back
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex gap-3">
          <div
            className={clsx(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              styles.iconClass,
            )}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="app-dialog-title"
              className="text-base font-semibold text-slate-900 leading-snug"
            >
              {title}
            </h2>
            <p
              id="app-dialog-message"
              className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap"
            >
              {options.message}
            </p>
          </div>
        </div>
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {isConfirm ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/80 transition-colors"
            >
              {dialog.options.cancelLabel ?? 'Cancelar'}
            </button>
          ) : null}
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={clsx(
              'px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm',
              styles.confirmBtn,
            )}
          >
            {isConfirm
              ? dialog.options.confirmLabel ?? 'Confirmar'
              : dialog.options.okLabel ?? 'Entendido'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const AppDialogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const dialogRef = useRef<PendingDialog | null>(null);

  const closeDialog = useCallback((result: boolean) => {
    const current = dialogRef.current;
    if (!current) return;
    dialogRef.current = null;
    setDialog(null);
    if (current.kind === 'confirm') {
      current.resolve(result);
    } else if (result) {
      current.resolve();
    }
  }, []);

  const confirm = useCallback((input: ConfirmOptions | string) => {
    const options = toConfirmOptions(input);
    return new Promise<boolean>((resolve) => {
      const pending: PendingDialog = { kind: 'confirm', options, resolve };
      dialogRef.current = pending;
      setDialog(pending);
    });
  }, []);

  const alert = useCallback((input: AlertOptions | string) => {
    const options = toAlertOptions(input);
    return new Promise<void>((resolve) => {
      const pending: PendingDialog = { kind: 'alert', options, resolve };
      dialogRef.current = pending;
      setDialog(pending);
    });
  }, []);

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {dialog ? (
        <AppDialogModal
          dialog={dialog}
          onConfirm={() => closeDialog(true)}
          onCancel={() => closeDialog(false)}
        />
      ) : null}
    </AppDialogContext.Provider>
  );
};

export const useAppDialog = (): AppDialogContextValue => {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error('useAppDialog debe usarse dentro de AppDialogProvider');
  }
  return ctx;
};
