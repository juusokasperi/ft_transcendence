import React from 'react';

type ButtonVariant = 'primary' | 'danger' | 'secondary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  withMinWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 font-semibold',
  danger: 'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500 font-semibold',
  secondary:
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-400 font-semibold',
  ghost:
    'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-300 font-medium',
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  withMinWidth = true,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center rounded px-4 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  const dimensionClass = fullWidth ? 'w-full' : withMinWidth ? 'min-w-[150px]' : '';

  const classes = [baseClasses, variantClasses[variant], dimensionClass, className]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
};

export default Button;
