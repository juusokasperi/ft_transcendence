import React from 'react';
import SurfaceCard from '../../shared/components/SurfaceCard';
import Button from '../../../../components/Button';
import Scoreboard from '../../shared/components/Scoreboard';
import type { OnlineMatchSummary } from '../state/types';
import { resolveWinnerSide } from '../utils/winner';

type Props = {
  summary: OnlineMatchSummary;
  onBackToMenu: () => void;
};

const PostMatchOnlineView: React.FC<Props> = ({ summary, onBackToMenu }) => {
  const winnerSide = resolveWinnerSide(summary);
  const winnerName = winnerSide === 'east' ? summary.names.east : summary.names.west;

  const SidePanel: React.FC<{ side: 'east' | 'west' }> = ({ side }) => {
    const name = summary.names[side] || (side === 'east' ? 'Player 1' : 'Player 2');
    const before = summary.mmr[side].before;
    const after = summary.mmr[side].after;
    const delta = after - before;
    const arrow = delta >= 0 ? '▲' : '▼';
    const arrowTone =
      delta === 0 ? 'text-white/50' : delta > 0 ? 'text-emerald-400' : 'text-red-400';

    return (
      <div className="rounded-xl border border-white/10 bg-black/35 p-1 text-sm text-white/80">
        <div className="flex items-baseline justify-between">
          <span className="truncate text-lg font-semibold text-white">{name}</span>
          <span className={`text-xl ${arrowTone}`} aria-hidden>
            {arrow}
          </span>
        </div>
        <div className="mt-1 text-white/70">
          {before} <span className="mx-1 text-white">→</span>
          <span className="font-semibold text-white">{after}</span>
          <span className="ml-2 font-mono text-white/60">
            (Δ {delta >= 0 ? '+' : ''}
            {delta})
          </span>
        </div>
      </div>
    );
  };

  return (
    <SurfaceCard className="space-y-2 p-2 shadow-2xl">
      <div className="text-center text-lg font-semibold">
        Winner: <span className="text-emerald-400">{winnerName}</span>
      </div>
      <div>
        <Scoreboard
          eastName={summary.names.east}
          westName={summary.names.west}
          gamesHistory={summary.gamesHistory}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <SidePanel side="west" />
        <SidePanel side="east" />
      </div>

      <div className="flex justify-center">
        <Button variant="primary" onClick={onBackToMenu}>
          Continue
        </Button>
      </div>
    </SurfaceCard>
  );
};

export default PostMatchOnlineView;
