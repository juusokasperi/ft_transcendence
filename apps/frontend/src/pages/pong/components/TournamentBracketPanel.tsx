import React from 'react';
import type { TournamentMatchState } from '@pong/shared/protocol/net';
import { participantStatusLabel, stageLabel } from './utils';

export type TournamentBracketPanelProps = {
  matches: TournamentMatchState[];
  hasActiveTournament: boolean;
  tournamentStatus: string;
  currentParticipantId: number | null;
};

const TournamentBracketPanel: React.FC<TournamentBracketPanelProps> = ({
  matches,
  hasActiveTournament,
  tournamentStatus,
  currentParticipantId,
}) => {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">Bracket</h2>
        <span className="text-xs uppercase tracking-[0.4em] text-white/40">
          Status: {hasActiveTournament ? tournamentStatus : '—'}
        </span>
      </div>
      {!hasActiveTournament ? (
        <p className="text-sm text-white/60">Join a tournament to see the bracket.</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-white/60">Bracket pending — waiting for all participants.</p>
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
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      player.participantId === currentParticipantId
                        ? 'bg-indigo-500/10 text-indigo-200'
                        : 'bg-white/5 text-white/80'
                    }`}
                  >
                    <span>
                      {player.teamNumber === 1 ? 'West' : 'East'} · {player.alias ?? 'TBD'}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                      {participantStatusLabel(player.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default TournamentBracketPanel;
