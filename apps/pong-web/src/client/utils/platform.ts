// src/client/utils/platform.ts

export function isMobile(): boolean {
  // Guard for SSR/Node/test environments
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const ua: string = navigator.userAgent || "";

  // 1) Classic UA sniffing
  const isMobileUA: boolean = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  // 2) Viewport heuristic (phones + small tablets)
  const isSmallHighDPI: boolean =
    window.innerWidth <= 812 && (window.devicePixelRatio || 1) > 1;

  // 3) Pointer heuristic (covers tablets & hybrids with touch input)
  const isTouchDevice: boolean =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  const result = isMobileUA || isSmallHighDPI || isTouchDevice;

  return result;
}
