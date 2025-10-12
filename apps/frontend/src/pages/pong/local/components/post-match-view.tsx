import React, { useEffect, useRef } from 'react';
import type { GameHistoryEntry } from '@pong/shared';
import { createScoreboard } from '@pong/render';
import PlayButton from './PlayButton/PlayButton';
import Card from './Card';

type MatchSummary = {
  winner: 'east' | 'west';
  bestOf: number;
  gamesHistory: GameHistoryEntry[];
  names: { east: string; west: string };
};

type PostMatchViewProps = {
  summary: MatchSummary;
  onPlayAgain: () => void;
  onReturnToMenu: () => void;
};

export const PostMatchView: React.FC<PostMatchViewProps> = ({
  summary,
  onPlayAgain,
  onReturnToMenu,
}) => {
  const hudContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hudContainerRef.current) return;
    const hud = createScoreboard();
    hud.attachToElement(hudContainerRef.current);
    hud.setPlayerNames(summary.names.east, summary.names.west);
    hud.setGames(summary.gamesHistory, summary.bestOf);
    return () => hud.dispose();
  }, [summary]);

  const westName = summary.names.west || 'Player 2';
  const eastName = summary.names.east || 'Player 1';
  const lastGame = summary.gamesHistory?.[summary.gamesHistory.length - 1];
  const winnerRow = (lastGame?.winner ?? summary.winner) as 'east' | 'west';
  const winnerName = winnerRow === 'east' ? eastName : westName;

  return (
    <div className="flex w-full justify-center">
      <Card
        title={
          <span className="block w-full text-center text-2xl font-semibold">
            The winner of this match is{' '}
            <span className="font-bold text-emerald-400">{winnerName}</span>!
          </span>
        }
      >
        <div ref={hudContainerRef} className="w-full z-10" style={{ height: 150 }} />
        <div className="flex w-full items-center justify-center gap-4">
          <PlayButton color="cyan" onClick={onPlayAgain}>PLAY AGAIN</PlayButton>
          <PlayButton color="crimson" onClick={onReturnToMenu}>MENU</PlayButton>
        </div>
      </Card>
    </div>
  );
};

export default PostMatchView;
