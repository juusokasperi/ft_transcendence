import React from 'react';
import type { GameHistoryEntry } from '@pong/shared';
import type { MatchSummary } from '../types';
import PlayButton from './PlayButton';
import Card from './Card';
import Scoreboard from '../../shared/components/Scoreboard';

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
        <div className="mb-6 shrink-0 items-center justify-center">
          <Scoreboard
            eastName={summary.names.east}
            westName={summary.names.west}
            gamesHistory={summary.gamesHistory}
          />
        </div>
        <div className="flex shrink-0 items-center justify-center gap-4">
          <PlayButton color="cyan" onClick={onPlayAgain}>
            PLAY AGAIN
          </PlayButton>
          <PlayButton color="crimson" onClick={onReturnToMenu}>
            MENU
          </PlayButton>
        </div>
      </Card>
    </div>
  );
};

export default PostMatchView;
