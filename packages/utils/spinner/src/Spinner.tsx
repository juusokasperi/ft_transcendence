import React, { useEffect } from 'react';

export type SpinnerProps = {
  size?: number; // px
  color?: string;
  className?: string;
  'aria-label'?: string;
};

const DOT_COUNT = 12;
const DOT_ANGLE_STEP = 360 / DOT_COUNT;
const DOT_ANIMATION_DELAY_STEP = 0.1; // seconds
const DOT_ANIMATION_START_DELAY = -1.1; // seconds
const KEYFRAMES_ID = 'ft-spinner-keyframes';

const ensureKeyframes = () => {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(KEYFRAMES_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
@keyframes ft-spinner-fade {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0.25; transform: scale(0.35); }
}
`;
  document.head.appendChild(style);
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 40,
  color = '#A855F7',
  className = '',
  'aria-label': ariaLabel = 'Loading',
}) => {
  useEffect(() => {
    ensureKeyframes();
  }, []);

  const radius = size * 0.45;
  const dotSize = size * 0.16;

  return (
    <span
      className={`relative inline-block align-middle ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label={ariaLabel}
    >
      {Array.from({ length: DOT_COUNT }).map((_, index) => {
        const angle = index * DOT_ANGLE_STEP;
        const animationDelay = DOT_ANIMATION_START_DELAY + index * DOT_ANIMATION_DELAY_STEP;
        return (
          <span
            key={angle}
            className="absolute left-1/2 top-1/2 block"
            style={{
              width: dotSize,
              height: dotSize,
              transform: `translateX(${radius}px) rotate(${angle}deg) translateY(-${radius}px)`,
              transformOrigin: 'center center',
            }}
          >
            <span className="absolute left-1/2 top-1/2 block h-full w-full -translate-x-1/2 -translate-y-1/2">
              <span
                className="block h-full w-full rounded-full"
                style={{
                  backgroundColor: color,
                  opacity: 0.25,
                  transformOrigin: 'center center',
                  animation: 'ft-spinner-fade 1.2s linear infinite',
                  animationDelay: `${animationDelay}s`,
                }}
              />
            </span>
          </span>
        );
      })}
    </span>
  );
};

export default Spinner;
