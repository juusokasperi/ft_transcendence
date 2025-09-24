import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type SnackbarVariant = 'info' | 'success' | 'error' | 'warning';

export interface SnackbarOptions {
  id?: string;
  message: string;
  description?: string;
  variant?: SnackbarVariant;
  duration?: number;
}

interface Snackbar extends Required<Omit<SnackbarOptions, 'duration' | 'variant'>> {
  variant: SnackbarVariant;
  duration: number;
}

interface SnackbarContextValue {
  enqueueSnackbar: (options: SnackbarOptions) => string;
  dismissSnackbar: (id: string) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

const DEFAULT_DURATION = 4000;

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const SnackbarViewport: React.FC<{
  snacks: Snackbar[];
  onDismiss: (id: string) => void;
}> = ({ snacks, onDismiss }) => {
  if (!snacks.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-24 z-[1000] flex flex-col items-center gap-3 px-4 sm:left-auto sm:right-6 sm:w-full sm:max-w-sm sm:items-end sm:px-0"
      aria-live="polite"
      aria-atomic="true"
    >
      {snacks.map((snack) => {
        const isError = snack.variant === 'error';
        const isSuccess = snack.variant === 'success';
        const badgeClass =
          snack.variant === 'warning'
            ? 'text-amber-200'
            : isSuccess
              ? 'text-emerald-200'
              : isError
                ? 'text-rose-200'
                : 'text-indigo-200';

        const borderClass =
          snack.variant === 'warning'
            ? 'border-amber-500/40'
            : isSuccess
              ? 'border-emerald-500/40'
              : isError
                ? 'border-rose-500/40'
                : 'border-indigo-500/40';

        const glowClass =
          snack.variant === 'warning'
            ? 'from-amber-500/40'
            : isSuccess
              ? 'from-emerald-500/40'
              : isError
                ? 'from-rose-500/60'
                : 'from-indigo-500/40';

        return (
          <div
            key={snack.id}
            className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border ${borderClass} bg-slate-900/95 px-5 py-4 shadow-lg shadow-slate-950/40 backdrop-blur`}
            role={isError ? 'alert' : 'status'}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${glowClass} via-transparent to-slate-900/60`}
              aria-hidden
            />
            <div className="relative flex gap-3">
              <div className="mt-1 text-lg" aria-hidden>
                {isError ? '⛔' : isSuccess ? '✨' : snack.variant === 'warning' ? '⚠️' : '🔔'}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${badgeClass}`}>{snack.message}</p>
                {snack.description && (
                  <p className="mt-1 text-sm text-slate-300/80">{snack.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(snack.id)}
                className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-xs font-semibold text-slate-200 transition hover:border-white/30 hover:text-white"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const SnackbarProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snacks, setSnacks] = useState<Snackbar[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissSnackbar = useCallback((id: string) => {
    setSnacks((prev) => prev.filter((snack) => snack.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const enqueueSnackbar = useCallback(
    (options: SnackbarOptions): string => {
      const id = options.id ?? generateId();
      const variant = options.variant ?? 'info';
      const duration = Math.max(options.duration ?? DEFAULT_DURATION, 1000);

      setSnacks((prev) => {
        const withoutExisting = prev.filter((snack) => snack.id !== id);
        return [
          ...withoutExisting,
          {
            id,
            message: options.message,
            description: options.description ?? '',
            variant,
            duration,
          },
        ];
      });

      const previousTimer = timers.current.get(id);
      if (previousTimer) {
        clearTimeout(previousTimer);
      }

      const timer = setTimeout(() => {
        dismissSnackbar(id);
      }, duration);
      timers.current.set(id, timer);

      return id;
    },
    [dismissSnackbar],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      enqueueSnackbar,
      dismissSnackbar,
    }),
    [enqueueSnackbar, dismissSnackbar],
  );

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <SnackbarViewport snacks={snacks} onDismiss={dismissSnackbar} />
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = (): SnackbarContextValue => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within SnackbarProvider');
  }
  return context;
};
