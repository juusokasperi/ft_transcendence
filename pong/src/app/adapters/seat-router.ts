// src/app/adapters/seat-router.ts
import type { InputIntent } from "@shared/protocol/input";

/** Player seats are stable “who is P1 vs P2” for the whole match. */
export type PlayerSeat = "P1" | "P2";

/** Reused object to avoid per-frame allocations. */
const MIXED: InputIntent = { leftAxis: 0, rightAxis: 0 };

/**
 * Mix local + remote scalar axes into the P1/P2 channels the core expects.
 * localSeat: which seat you occupy in THIS match ("P1" or "P2").
 * Returns a reused object; consume immediately and don't keep a reference.
 */
export function mixOnlineAxes(
  localSeat: PlayerSeat,
  localAxis: number,
  remoteAxis: number,
): InputIntent {
  if (localSeat === "P1") {
    MIXED.leftAxis = localAxis; // drives P1
    MIXED.rightAxis = remoteAxis; // drives P2
  } else {
    MIXED.leftAxis = remoteAxis; // drives P1
    MIXED.rightAxis = localAxis; // drives P2
  }
  return MIXED;
}
