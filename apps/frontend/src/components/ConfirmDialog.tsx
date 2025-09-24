import React, { useEffect, useMemo, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input[type="text"]:not([disabled])',
  'input[type="radio"]:not([disabled])',
  'input[type="checkbox"]:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusable && focusable.length > 0) {
      (focusable[0] as HTMLElement).focus();
    } else {
      confirmRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableEls = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusableEls.length) {
        event.preventDefault();
        return;
      }

      const first = focusableEls.item(0);
      const last = focusableEls.item(focusableEls.length - 1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const previous = previousActiveElement.current as HTMLElement | null;
      if (previous) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, onCancel]);

  const confirmButtonClasses = useMemo(() => {
    if (tone === 'danger') {
      return 'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-900/40 transition hover:from-rose-400 hover:to-red-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:from-rose-500 disabled:hover:to-red-500';
    }
    return 'inline-flex items-center justify-center rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-indigo-500';
  }, [tone]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === overlayRef.current) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-8 shadow-2xl shadow-indigo-950/40"
      >
        <div
          className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-slate-900/40"
          aria-hidden
        />
        <div className="relative">
          <h2 id="confirm-dialog-title" className="text-xl font-semibold text-white">
            {title}
          </h2>
          {description && (
            <p id="confirm-dialog-description" className="mt-2 text-sm text-slate-300/80">
              {description}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:text-white"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={confirmButtonClasses}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
