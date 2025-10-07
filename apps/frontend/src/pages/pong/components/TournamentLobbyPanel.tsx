import React from 'react';
import Button from '../../../components/Button';
import type { TournamentSummary } from './types';

export type TournamentLobbyPanelProps = {
  tournamentName: string;
  onTournamentNameChange(value: string): void;
  onCreateTournament(): void;
  connectionReady: boolean;
  availableTournaments: TournamentSummary[];
  activeTournamentId: number | null;
  aliasInput: string;
  onAliasInputChange(value: string): void;
  onJoinTournament(tournamentId: number): void;
};

const TournamentLobbyPanel: React.FC<TournamentLobbyPanelProps> = ({
  tournamentName,
  onTournamentNameChange,
  onCreateTournament,
  connectionReady,
  availableTournaments,
  activeTournamentId,
  aliasInput,
  onAliasInputChange,
  onJoinTournament,
}) => {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
        <h2 className="mb-4 text-lg font-semibold">Create a new tournament</h2>
        <div className="flex flex-col gap-3">
          <input
            value={tournamentName}
            onChange={(event) => onTournamentNameChange(event.target.value)}
            placeholder="Tournament name"
            className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              value={aliasInput}
              onChange={(event) => onAliasInputChange(event.target.value)}
              placeholder="Your alias (optional)"
              className="w-full rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
            />
            <Button variant="primary" onClick={onCreateTournament} disabled={!connectionReady}>
              Create tournament
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
        <h2 className="mb-4 text-lg font-semibold">Open tournaments</h2>
        {availableTournaments.length === 0 ? (
          <p className="text-sm text-white/60">No tournaments available yet. Create one above!</p>
        ) : (
          <ul className="space-y-3">
            {availableTournaments.map((tournament) => {
              const isCurrent = tournament.id === activeTournamentId;
              const canJoin = !isCurrent && tournament.status === 'draft' && connectionReady && activeTournamentId === null;
              return (
                <li
                  key={tournament.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-base font-semibold">{tournament.name}</p>
                      <p className="text-xs uppercase tracking-widest text-white/50">
                        Status: {tournament.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isCurrent ? (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-200">
                          Joined
                        </span>
                      ) : tournament.status !== 'draft' ? (
                        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/60">
                          {tournament.status === 'active' ? 'In progress' : tournament.status}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {canJoin && (
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <input
                        value={aliasInput}
                        onChange={(event) => onAliasInputChange(event.target.value)}
                        placeholder="Your alias (optional)"
                        className="flex-1 rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onJoinTournament(tournament.id)}
                        disabled={!connectionReady || activeTournamentId !== null}
                      >
                        Join
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TournamentLobbyPanel;
