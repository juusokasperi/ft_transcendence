/// <reference types="react" />
import type { CSSProperties, PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';

export type ElectricBorderProps = PropsWithChildren<{
  color?: string;
  speed?: number;
  chaos?: number;
  thickness?: number;
  className?: string;
  style?: CSSProperties;
}>;

function hexToRgba(hex: string, alpha = 1): string {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = parseInt(h, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ElectricBorder: React.FC<ElectricBorderProps> = ({
  children,
  color = '#5227FF',
  speed = 1,
  chaos = 1,
  thickness = 2,
  className = '',
  style,
}) => {
  const rawId = useId().replace(/[:]/g, '');
  const filterId = `turbulent-displace-${rawId}`;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const strokeRef = useRef<HTMLDivElement | null>(null);

  const updateAnim = useCallback(() => {
    const svg = svgRef.current;
    const host = rootRef.current;
    if (!svg || !host) return;

    if (strokeRef.current) {
      strokeRef.current.style.filter = `url(#${filterId})`;
    }

    const width = Math.max(
      1,
      Math.round(host.clientWidth || host.getBoundingClientRect().width || 0),
    );
    const height = Math.max(
      1,
      Math.round(host.clientHeight || host.getBoundingClientRect().height || 0),
    );

    const dyAnims = Array.from(
      svg.querySelectorAll<SVGAnimateElement>('feOffset > animate[attributeName="dy"]'),
    ) as SVGAnimationElement[];
    if (dyAnims.length >= 2) {
      const first = dyAnims[0];
      const second = dyAnims[1];
      if (first) first.setAttribute('values', `${height}; 0`);
      if (second) second.setAttribute('values', `0; -${height}`);
    }

    const dxAnims = Array.from(
      svg.querySelectorAll<SVGAnimateElement>('feOffset > animate[attributeName="dx"]'),
    ) as SVGAnimationElement[];
    if (dxAnims.length >= 2) {
      const first = dxAnims[0];
      const second = dxAnims[1];
      if (first) first.setAttribute('values', `${width}; 0`);
      if (second) second.setAttribute('values', `0; -${width}`);
    }

    const baseDur = 6;
    const anims: SVGAnimationElement[] = [...dyAnims, ...dxAnims];
    const dur = Math.max(0.001, baseDur / (speed || 1));
    anims.forEach((anim) => anim.setAttribute('dur', `${dur}s`));

    const disp = svg.querySelector('feDisplacementMap');
    if (disp) disp.setAttribute('scale', String(30 * (chaos || 1)));

    const filterEl = svg.querySelector<SVGFilterElement>(`#${CSS.escape(filterId)}`);
    if (filterEl) {
      filterEl.setAttribute('x', '-200%');
      filterEl.setAttribute('y', '-200%');
      filterEl.setAttribute('width', '500%');
      filterEl.setAttribute('height', '500%');
    }

    requestAnimationFrame(() => {
      anims.forEach((anim) => {
        if (typeof anim.beginElement === 'function') {
          try {
            anim.beginElement();
          } catch {
            // ignore
          }
        }
      });
    });
  }, [chaos, filterId, speed]);

  useEffect(() => {
    updateAnim();
  }, [updateAnim]);

  // useLayoutEffect inside libraries can warn during SSR because it runs only
  // on the client. Use an isomorphic effect that falls back to useEffect on the
  // server to avoid React warnings when this package is used in SSR builds.
  const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' && typeof document !== 'undefined' ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!rootRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateAnim());
    ro.observe(rootRef.current);
    updateAnim();
    return () => ro.disconnect();
  }, [updateAnim]);

  const inheritRadius: CSSProperties = {
    borderRadius: style?.borderRadius ?? 'inherit',
  };

  const strokeStyle: CSSProperties = {
    ...inheritRadius,
    borderWidth: thickness,
    borderStyle: 'solid',
    borderColor: color,
  };

  const glow1Style: CSSProperties = {
    ...inheritRadius,
    borderWidth: thickness,
    borderStyle: 'solid',
    borderColor: hexToRgba(color, 0.6),
    filter: `blur(${0.5 + thickness * 0.25}px)`,
    opacity: 0.5,
  };

  const glow2Style: CSSProperties = {
    ...inheritRadius,
    borderWidth: thickness,
    borderStyle: 'solid',
    borderColor: color,
    filter: `blur(${2 + thickness * 0.5}px)`,
    opacity: 0.5,
  };

  const bgGlowStyle: CSSProperties = {
    ...inheritRadius,
    transform: 'scale(1.08)',
    filter: 'blur(32px)',
    opacity: 0.3,
    zIndex: -1,
    background: `linear-gradient(-30deg, ${hexToRgba(color, 0.8)}, transparent, ${color})`,
  };

  return (
    <div ref={rootRef} className={`relative isolate ${className}`} style={style}>
      <svg
        ref={svgRef}
        className="pointer-events-none fixed -left-[10000px] -top-[10000px] h-[10px] w-[10px] opacity-[0.001]"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id={filterId}
            colorInterpolationFilters="sRGB"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="6"
              result="noise1"
              seed="1"
            />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate
                attributeName="dy"
                values="700; 0"
                dur="6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="6"
              result="noise2"
              seed="1"
            />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate
                attributeName="dy"
                values="0; -700"
                dur="6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="6"
              result="noise1"
              seed="2"
            />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise3">
              <animate
                attributeName="dx"
                values="490; 0"
                dur="6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.02"
              numOctaves="6"
              result="noise2"
              seed="2"
            />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise4">
              <animate
                attributeName="dx"
                values="0; -490"
                dur="6s"
                repeatCount="indefinite"
                calcMode="linear"
              />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="combinedNoise"
              scale="30"
              xChannelSelector="R"
              yChannelSelector="B"
            />
          </filter>
        </defs>
      </svg>

      <div className="pointer-events-none absolute inset-0" style={inheritRadius}>
        <div ref={strokeRef} className="absolute inset-0 box-border" style={strokeStyle} />
        <div className="absolute inset-0 box-border" style={glow1Style} />
        <div className="absolute inset-0 box-border" style={glow2Style} />
        <div className="absolute inset-0" style={bgGlowStyle} />
      </div>

      <div className="relative" style={inheritRadius}>
        {children}
      </div>
    </div>
  );
};

export default ElectricBorder;
