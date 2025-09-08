// src/shared/protocol/input.ts
export type InputIntent = {
  leftAxis: number; // -1..1 (down/up on Z)
  rightAxis: number; // -1..1
};

export const ZeroIntent: InputIntent = { leftAxis: 0, rightAxis: 0 };
