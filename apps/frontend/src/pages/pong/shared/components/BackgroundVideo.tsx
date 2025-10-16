// apps/frontend/src/components/media/BackgroundVideo.tsx
import React, { useEffect, useRef } from 'react';

type ObjectFit = 'cover' | 'contain';
type ObjectPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | `${'left' | 'right'}-${'top' | 'bottom'}`;

export type BackgroundVideoProps = {
  src: string;
  type?: string; // default: "video/mp4"
  fit?: ObjectFit; // default: "contain" (keeps your letterbox look)
  position?: ObjectPosition; // default: "center"
  className?: string; // extra classes for the wrapping layer
  zIndexClass?: string; // default: "z-0"
  poster?: string;
  ariaHidden?: boolean; // default: true (decorative)
  pauseOnReducedMotion?: boolean; // default: true
  opacity?: number; // default: 1
};

const posToClass: Record<ObjectPosition, string> = {
  center: 'object-center',
  top: 'object-top',
  bottom: 'object-bottom',
  left: 'object-left',
  right: 'object-right',
  'left-top': 'object-left-top',
  'left-bottom': 'object-left-bottom',
  'right-top': 'object-right-top',
  'right-bottom': 'object-right-bottom',
};

export const BackgroundVideo: React.FC<BackgroundVideoProps> = ({
  src,
  type = 'video/mp4',
  fit = 'contain',
  position = 'center',
  className = '',
  zIndexClass = 'z-0',
  poster,
  ariaHidden = true,
  pauseOnReducedMotion = true,
  opacity,
}) => {
  const ref = useRef<HTMLVideoElement>(null);

  // Respect prefers-reduced-motion
  useEffect(() => {
    if (!pauseOnReducedMotion || !ref.current) return;
    // In test/SSR environments, window.matchMedia may be undefined
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const v = ref.current;

    const apply = () => {
      if (mq.matches) {
        v.pause();
      } else if (v.paused) {
        // Try to play; ignore promise rejections (autoplay policies)
        v.play().catch(() => {});
      }
    };

    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [pauseOnReducedMotion]);

  // Pause when tab is hidden to save CPU
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onVis = () => {
      if (document.hidden) v.pause();
      else v.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain';
  const posClass = posToClass[position] ?? 'object-center';

  return (
    <video
      ref={ref}
      className={`absolute inset-0 ${zIndexClass} h-full w-full ${fitClass} ${posClass} pointer-events-none ${className}`}
      autoPlay
      loop
      muted
      playsInline
      poster={poster}
      aria-hidden={ariaHidden}
      style={opacity !== undefined ? { opacity } : undefined}
    >
      <source src={src} type={type} />
    </video>
  );
};
