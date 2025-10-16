import React from 'react';
import SurfaceCard from '../../shared/components/SurfaceCard';
import Button from '../../../../components/Button';
import type { OnlineMatchSummary } from '../../../../games/pong/modes/online/types';

type Props = {
  summary: OnlineMatchSummary;
  onBackToMenu: () => void;
};

const PostMatchOnlineView: React.FC<Props> = ({ summary, onBackToMenu }) => {
  const winnerName = summary.winner === 'east' ? summary.names.east : summary.names.west;

  const SidePanel: React.FC<{ side: 'east' | 'west' }> = ({ side }) => {
    const name = summary.names[side] || (side === 'east' ? 'Player 1' : 'Player 2');
    const before = summary.mmr[side].before;
    const after = summary.mmr[side].after;
    const delta = after - before;
    const arrow = delta >= 0 ? '▲' : '▼';
    const arrowTone =
      delta === 0 ? 'text-white/50' : delta > 0 ? 'text-emerald-400' : 'text-red-400';

    return (
      <div className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-white/80">
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
    <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <SurfaceCard className="space-y-8 p-6 shadow-2xl">
        <header className="text-center">
          <h2 className="text-3xl font-semibold">
            Winner: <span className="text-emerald-400">{winnerName || 'Unknown'}</span>
          </h2>
        </header>

        {/* Scoreboard removed — only MMR panels remain */}
        <section className="grid gap-4 sm:grid-cols-2">
          <SidePanel side="west" />
          <SidePanel side="east" />
        </section>

        <div className="flex justify-center">
          <Button variant="primary" onClick={onBackToMenu}>
            Continue
          </Button>
        </div>
      </SurfaceCard>
    </div>
  );
};

export default PostMatchOnlineView;
