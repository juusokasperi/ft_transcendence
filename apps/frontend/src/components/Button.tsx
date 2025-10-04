import React from 'react';

export type ButtonVariant =
  | 'primary'
  | 'danger'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'success'
  | 'successSecondary'
  | 'dangerSecondary';

type ButtonTone = 'default' | 'subtle';

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  fullWidth?: boolean;
  withMinWidth?: boolean;
  iconOnly?: boolean;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

const variantClasses: Record<ButtonVariant, Record<ButtonTone, string>> = {
  primary: {
    default:
      'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow shadow-indigo-900/40 hover:from-indigo-400 hover:to-purple-400 focus-visible:ring-indigo-400/60',
    subtle: 'bg-white/10 text-white hover:bg-white/15 focus-visible:ring-white/30',
  },
  danger: {
    default:
      'bg-gradient-to-r from-rose-500 to-red-500 text-white shadow shadow-rose-900/40 hover:from-rose-400 hover:to-red-400 focus-visible:ring-rose-400/60',
    subtle: 'bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:ring-rose-400/40',
  },
  success: {
    default:
      'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow shadow-emerald-900/40 hover:from-emerald-400 hover:to-teal-400 focus-visible:ring-emerald-400/60',
    subtle:
      'bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 focus-visible:ring-emerald-400/40',
  },
  secondary: {
    default:
      'border border-white/20 bg-white/10 text-white hover:bg-white/15 focus-visible:ring-white/30',
    subtle:
      'border border-white/10 bg-transparent text-white hover:bg-white/10 focus-visible:ring-white/20',
  },
  outline: {
    default:
      'border border-white/20 bg-transparent text-white hover:bg-white/10 focus-visible:ring-white/30',
    subtle:
      'border border-white/10 bg-transparent text-white/80 hover:bg-white/5 focus-visible:ring-white/20',
  },
  ghost: {
    default: 'text-white hover:bg-white/10 focus-visible:ring-white/20',
    subtle: 'text-slate-200 hover:bg-white/5 focus-visible:ring-white/10',
  },
  successSecondary: {
    default:
      'border border-emerald-500/80 bg-gradient-to-r from-emerald-500/60 to-teal-500/60 text-white shadow shadow-emerald-900/30 transition hover:from-emerald-400 hover:to-teal-400 focus-visible:ring-emerald-400/40',
    subtle:
      'border border-emerald-500/20 bg-transparent text-white hover:bg-white/10 focus-visible:ring-white/20',
  },
  dangerSecondary: {
    default:
      'border border-rose-500/60 bg-gradient-to-r from-rose-500/50 to-red-500/50 text-white shadow shadow-rose-900/40 hover:from-rose-400 hover:to-red-400 focus-visible:ring-rose-400/60',
    subtle:
      'border border-rose-500/10 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:ring-rose-400/40',
  },
};

const baseClasses =
  'inline-flex items-center justify-center rounded-full font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50';

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  tone = 'default',
  size = 'md',
  fullWidth = false,
  withMinWidth = true,
  iconOnly = false,
  className,
  ...props
}) => {
  const dimensionClass = iconOnly
    ? size === 'sm'
      ? 'h-8 w-8'
      : size === 'lg'
        ? 'h-12 w-12'
        : 'h-10 w-10'
    : fullWidth
      ? 'w-full'
      : withMinWidth
        ? size === 'lg'
          ? 'min-w-[160px]'
          : size === 'sm'
            ? 'min-w-[110px]'
            : 'min-w-[140px]'
        : '';

  const classes = [
    baseClasses,
    sizeClasses[size],
    variantClasses[variant][tone],
    dimensionClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
};

export default Button;
