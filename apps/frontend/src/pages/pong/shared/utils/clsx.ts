export type ClassValue = string | undefined | null | false;

/** Lightweight classnames joiner used across pong pages. */
export default function clsx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
