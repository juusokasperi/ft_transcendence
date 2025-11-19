export function isMobile(): boolean {
  // Guard for SSR/Node/test environments
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const ua: string = navigator.userAgent || '';

  // 1) Classic UA sniffing
  const isMobileUA: boolean = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

  // 2) Pointer heuristic (covers tablets & hybrids with touch input)
  const isTouchDevice: boolean =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  const result = isMobileUA && isTouchDevice;

  return result;
}
