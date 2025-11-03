import React from 'react';
import Button from '../../../../components/Button';
import SurfaceCard from '../../shared/components/SurfaceCard';
import type { TournamentSummary } from '../state/types';
import { ALIAS_MAX_LENGTH, aliasInputAllowedRegex } from '../../../../utils/alias';

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
      <SurfaceCard className="shadow-2xl p-6">
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
              maxLength={ALIAS_MAX_LENGTH}
              onBeforeInput={(event) => {
                const nativeEvent = event.nativeEvent as InputEvent;
                if (
                  nativeEvent.inputType === 'insertText' &&
                  nativeEvent.data &&
                  !aliasInputAllowedRegex.test(nativeEvent.data)
                ) {
                  event.preventDefault();
                }
              }}
            />
            <Button variant="primary" onClick={onCreateTournament} disabled={!connectionReady}>
              Create tournament
            </Button>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="shadow-2xl p-6">
        <h2 className="mb-4 text-lg font-semibold">Open tournaments</h2>
        {availableTournaments.length === 0 ? (
          <p className="text-sm text-white/60">No tournaments available yet. Create one above!</p>
        ) : (
          <ul className="space-y-3">
            {availableTournaments.map((tournament) => {
              const isCurrent = tournament.id === activeTournamentId;
              const canJoin =
                !isCurrent &&
                tournament.status === 'draft' &&
                connectionReady &&
                activeTournamentId === null;
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
                        maxLength={ALIAS_MAX_LENGTH}
                        onBeforeInput={(event) => {
                          const nativeEvent = event.nativeEvent as InputEvent;
                          if (
                            nativeEvent.inputType === 'insertText' &&
                            nativeEvent.data &&
                            !aliasInputAllowedRegex.test(nativeEvent.data)
                          ) {
                            event.preventDefault();
                          }
                        }}
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
      </SurfaceCard>
    </div>
  );
};

export default TournamentLobbyPanel;
