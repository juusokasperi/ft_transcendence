// src/app/seed.ts
import { deriveSeed32 } from "@shared/utils/random";

const KEY = "babylon-pong/seedCounter";
const BASE = 0x4b1d5eed >>> 0;

// Optional URL override: ?seed=1234
function querySeedOverride(): number | null {
  try {
    const s = new URL(window.location.href).searchParams.get("seed");
    return s ? parseInt(s, 10) >>> 0 : null;
  } catch {
    return null;
  }
}

function readCounter(): number {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (parseInt(v, 10) | 0) >>> 0 : 0;
  } catch {
    return 0;
  }
}

function writeCounter(n: number): void {
  try {
    localStorage.setItem(KEY, String(n >>> 0));
  } catch {}
}

/**
 * Deterministic local match seed.
 * - If ?seed is provided -> use it exactly (replay/debug).
 * - Else use a persistent counter (increments per match).
 *   NOTE: On a totally fresh storage, the first match uses counter=0 (predictable),
 *   subsequent matches differ because the counter persists.
 */
export function nextLocalMatchSeed(
  rulesetCrc: number,
  tableW: number,
  tableH: number,
): number {
  const override = querySeedOverride();
  if (override !== null) return override;

  const counter = readCounter(); // 0 on first ever run
  writeCounter(counter + 1); // persist for next time

  return deriveSeed32(
    BASE,
    counter, // makes matches differ over time
    rulesetCrc,
    (tableW * 1000) | 0,
    (tableH * 1000) | 0,
  );
}
