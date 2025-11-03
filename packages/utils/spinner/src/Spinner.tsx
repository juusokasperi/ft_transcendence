import React from 'react';
import './spinner.css';

export type SpinnerProps = {
  size?: number; // px
  color?: string;
  className?: string;
  'aria-label'?: string;
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 40,
  color = '#A855F7',
  className = '',
  'aria-label': ariaLabel = 'Loading',
}) => {
  const style = {
    // CSS variables for dynamic size/color
    ['--ft-spinner-size' as any]: `${size}px`,
    ['--ft-spinner-color' as any]: color,
  } as React.CSSProperties;

  return (
    <div className={`ft-spinner ${className}`} style={style} role="status" aria-label={ariaLabel}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div className="ft-spinner__dot" key={i}>
          <span className="ft-spinner__dot-inner" />
        </div>
      ))}
    </div>
  );
};

export default Spinner;
