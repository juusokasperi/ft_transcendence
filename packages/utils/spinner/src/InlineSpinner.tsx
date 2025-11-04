import React from 'react';
import { Spinner } from './Spinner';

export type InlineSpinnerProps = {
  label?: string; // optional label to show next to spinner
  size?: number;
  color?: string;
  className?: string;
  labelClassName?: string;
  ariaLabel?: string;
  spinnerClassName?: string;
};

export const InlineSpinner: React.FC<InlineSpinnerProps> = ({
  label,
  size = 16,
  color,
  className = '',
  labelClassName = 'text-sm text-gray-700',
  ariaLabel,
  spinnerClassName,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner
        size={size}
        color={color}
        className={spinnerClassName}
        aria-label={ariaLabel ?? label ?? 'Loading'}
      />
      {label ? <span className={labelClassName}>{label}</span> : null}
    </span>
  );
};

export default InlineSpinner;
