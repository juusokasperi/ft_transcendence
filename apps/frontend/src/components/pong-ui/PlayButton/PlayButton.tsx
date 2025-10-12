import React from 'react';
import styles from './PlayButton.module.css';

type CSSVars = React.CSSProperties & {
  ['--btn-accent']?: string;
  ['--btn-glow']?: string;
};

export interface PlayButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  /** Optional accent color, e.g. "#ec4899" or "rgb(20,156,234)" */
  accent?: string;
  /** Optional separate glow color; defaults to accent */
  glow?: string;
}

const PlayButton: React.FC<PlayButtonProps> = ({
  label = 'Play',
  children,
  className,
  accent,
  glow,
  style,
  ...props
}) => {
  const varStyle: CSSVars = {
    ...style,
    ...(accent ? { ['--btn-accent']: accent } : null),
    ...(glow ? { ['--btn-glow']: glow } : null),
  };

  return (
    <button
      className={[styles.button, className].filter(Boolean).join(' ')}
      style={varStyle}
      {...props}
    >
      {children ?? label}
    </button>
  );
};

export default PlayButton;
