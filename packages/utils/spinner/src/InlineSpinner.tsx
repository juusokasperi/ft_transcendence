import React from 'react';
import { Spinner } from './Spinner';

export type InlineSpinnerProps = {
  label?: string; // optional label to show next to spinner
  size?: number;
  color?: string;
  className?: string;
};

export const InlineSpinner: React.FC<InlineSpinnerProps> = ({
  label,
  size = 16,
  color,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} color={color} aria-label={label ?? 'Loading'} />
      {label ? <span className="text-sm text-gray-700">{label}</span> : null}
    </span>
  );
};

export default InlineSpinner;
