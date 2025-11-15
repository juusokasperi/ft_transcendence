import React from 'react';
import { ALIAS_MAX_LENGTH } from '../../../../utils/alias';

type AliasInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  maxLength?: number;
};

const AliasInput: React.FC<AliasInputProps> = ({
  value,
  onChange,
  placeholder = 'Your alias (optional)',
  className,
  inputClassName,
  disabled,
  maxLength = ALIAS_MAX_LENGTH,
}) => {
  return (
    <div className={className}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          inputClassName ??
          'w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none'
        }
        maxLength={maxLength}
        disabled={disabled}
        aria-label="Alias"
      />
    </div>
  );
};

export default AliasInput;
