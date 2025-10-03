import React from 'react';
import Button from './Button';
import type { ButtonVariant } from './Button';

type ConfirmModalProps = {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: ButtonVariant;
  cancelVariant?: ButtonVariant;
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Yes',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  cancelVariant = 'secondary',
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const buttonStyle = 'text-xs uppercase tracking-[0.25em]';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20"
      onClick={handleOverlayClick}
    >
      <div className="mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-4 text-center shadow-xl shadow-indigo-950/30 backdrop-blur">
        <div className="mb-8 text-base leading-relaxed text-slate-100">{message}</div>
        <div className="flex justify-center gap-4">
          <Button className={buttonStyle} variant={confirmVariant} onClick={onConfirm}>
            {confirmText}
          </Button>
          <Button className={buttonStyle} variant={cancelVariant} onClick={onCancel}>
            {cancelText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
