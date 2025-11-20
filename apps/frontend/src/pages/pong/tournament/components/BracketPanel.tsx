import React from 'react';
import type { TournamentMatchState } from '../net/messageTypes';
import SurfaceCard from '../../shared/components/SurfaceCard';
import { participantStatusLabel, stageLabel } from '../utils/utils';

export type TournamentBracketPanelProps = {
  matches: TournamentMatchState[];
  hasActiveTournament: boolean;
  tournamentStatus: string;
  currentParticipantId: number | null;
  forfeitedParticipantIds?: Set<number>;
};

const TournamentBracketPanel: React.FC<TournamentBracketPanelProps> = ({
  matches,
  hasActiveTournament,
  tournamentStatus,
  currentParticipantId,
  forfeitedParticipantIds,
}) => {
  return (
    <SurfaceCard as="section" className="p-6 shadow-2xl">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">Bracket</h2>
        <span className="text-xs uppercase tracking-[0.4em] text-white/40">
          Status: {hasActiveTournament ? tournamentStatus : '—'}
        </span>
      </div>
      {!hasActiveTournament ? (
        <p className="text-sm text-white/60">Join a tournament to see the bracket.</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-white/60">Tournament pending, waiting for all participants.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {matches.map((match) => (
            <div
              key={match.tournamentMatchId}
              className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm"
            >
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/40">
                <span>{stageLabel(match)}</span>
                <span>{match.status}</span>
              </div>
              <ul className="space-y-1">
                {match.players.map((player) => (
                  <li
                    key={`${player.participantId}-${player.teamNumber}`}
                    className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-3 py-2 ${
                      player.participantId === currentParticipantId
                        ? 'bg-indigo-500/10 text-indigo-200'
                        : 'bg-white/5 text-white/80'
                    }`}
                  >
                    <span className="truncate">
                      {player.alias ?? 'TBD'}
                      {(String(player.status).toLowerCase() === 'forfeited' ||
                        forfeitedParticipantIds?.has(player.participantId)) && (
                        <span className="ml-1 text-rose-300/80"> FORFEITED</span>
                      )}
                    </span>
                    <span className="w-8 text-center font-mono text-lg font-bold tabular-nums">
                      {player.score !== null ? player.score : '—'}
                    </span>
                    <span className="w-24 text-right text-[10px] uppercase tracking-[0.3em] text-white/40">
                      {(() => {
                        const tStat = (tournamentStatus ?? '').toLowerCase();
                        const pStat = (player.status ?? '').toLowerCase();
                        if (
                          tStat &&
                          tStat !== 'draft' &&
                          (pStat === 'pending' || pStat === 'accepted')
                        ) {
                          return 'Active';
                        }
                        return participantStatusLabel(player.status);
                      })()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
};

export default TournamentBracketPanel;
