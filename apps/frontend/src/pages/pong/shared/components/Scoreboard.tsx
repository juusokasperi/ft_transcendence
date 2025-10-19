import React from 'react';
import type { GameHistoryEntry } from '@pong/shared';

type Props = {
  eastName: string;
  westName: string;
  gamesHistory: GameHistoryEntry[];
  bestOf: number;
  className?: string;
  style?: React.CSSProperties;
};

function byGameIndexMax(history: GameHistoryEntry[]): number {
  if (!history || history.length === 0) return 0;
  return history.reduce((max, h) => (h.gameIndex > max ? h.gameIndex : max), 0);
}

function CombinedScoreBoxes({ history }: { history: GameHistoryEntry[] }) {
  const maxIndex = byGameIndexMax(history);

  // index → entry map for O(1) lookup
  const map = new Map<number, GameHistoryEntry>();
  for (const h of history) map.set(h.gameIndex, h);

  const mkBox = (i: number, who: 'east' | 'west') => {
    const entry = map.get(i);
    const isWinner = !!entry && entry.winner === who;
    const value = entry ? String(who === 'east' ? entry.east : entry.west) : '';
    const cls = [
      'grid h-9 w-9 select-none place-items-center rounded-md border border-white/10 bg-white/5',
      'tabular-nums text-white/90 font-extrabold text-[13px]',
      entry && !isWinner ? 'opacity-80' : '',
      isWinner
        ? 'bg-white/10 text-[16px] shadow-[0_0_0_1px_rgba(56,189,248,.35),0_0_18px_rgba(56,189,248,.25)] ring-1 ring-cyan-300/70'
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div key={`${who}-${i}`} className={cls}>
        {value}
      </div>
    );
  };

  const eastRow = [];
  const westRow = [];
  for (let i = 1; i <= maxIndex; i++) {
    eastRow.push(mkBox(i, 'east'));
    westRow.push(mkBox(i, 'west'));
  }

  // row-span-2 so it aligns with the two-name column at the left
  return (
    <div className="row-span-2 flex flex-col justify-start gap-1">
      <div className="flex h-10 items-center justify-start gap-1">{eastRow}</div>
      <div className="flex h-10 items-center justify-start gap-1">{westRow}</div>
    </div>
  );
}

const Scoreboard: React.FC<Props> = ({
  eastName,
  westName,
  gamesHistory,
  bestOf,
  className,
  style,
}) => {
  const east = eastName || 'Player 1';
  const west = westName || 'Player 2';

  return (
    <div
      className={['flex w-fit items-center gap-x-2', className].filter(Boolean).join(' ')}
      style={style}
    >
      <div className="border-white/12 row-span-2 rounded-xl border bg-slate-900/60 px-2 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.38)] backdrop-blur-md">
        <div className="grid h-10 items-center gap-x-2">
          <div className="select-none whitespace-nowrap px-[6px] text-[24px] font-semibold leading-[1.05] text-slate-100 md:text-[26px]">
            {east}
          </div>
        </div>
        <div className="my-1 h-[3px] rounded-full bg-gradient-to-r from-cyan-300/80 via-sky-400/80 to-cyan-300/80 shadow-[0_0_12px_rgba(56,189,248,.35)]" />
        <div className="grid h-10 items-center gap-x-2">
          <div className="select-none whitespace-nowrap px-[6px] text-[24px] font-semibold leading-[1.05] text-slate-100 md:text-[26px]">
            {west}
          </div>
        </div>
      </div>

      {/* Single stacked block for both rows */}
      <CombinedScoreBoxes history={gamesHistory} />
    </div>
  );
};

export default Scoreboard;
