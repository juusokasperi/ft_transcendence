import React, { useMemo } from 'react';
import type { ReadyMatch, CountdownSnapshot } from './types';
import { readyStageLabel } from './utils';

export type TournamentDirectedMatchesPanelProps = {
  matches: ReadyMatch[];
  countdowns: Map<number, CountdownSnapshot>;
  pendingMatch: ReadyMatch | null;
  pendingCountdownStatus: CountdownSnapshot['status'] | null;
  pendingCountdownSeconds: number | null;
  currentUserUuid: string | null;
};

const TournamentDirectedMatchesPanel: React.FC<TournamentDirectedMatchesPanelProps> = ({
  matches,
  countdowns,
  pendingMatch,
  pendingCountdownStatus,
  pendingCountdownSeconds,
  currentUserUuid,
}) => {
  const headerSubtitle = useMemo(() => {
    if (!pendingMatch) return null;
    const prefix = `Next: ${readyStageLabel(pendingMatch)}`;
    if (!pendingCountdownStatus) return `${prefix} · Preparing…`;

    switch (pendingCountdownStatus) {
      case 'running':
        return `${prefix} · Auto-start in ${Math.max(pendingCountdownSeconds ?? 0, 0)}s`;
      case 'started':
        return `${prefix} · Launching…`;
      case 'cancelled':
        return `${prefix} · Waiting for players…`;
      default:
        return `${prefix} · Preparing…`;
    }
  }, [pendingCountdownStatus, pendingCountdownSeconds, pendingMatch]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">Directed matches</h2>
        {headerSubtitle && (
          <span className="text-xs uppercase tracking-[0.4em] text-white/60">{headerSubtitle}</span>
        )}
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-white/60">No scheduled matches yet.</p>
      ) : (
        <ul className="space-y-3">
          {matches.map((match) => {
            const isYours = match.participants.some(
              (participant) => participant.userUuid === currentUserUuid,
            );
            const countdownInfo = countdowns.get(match.tournamentMatchId);
            const isPersonalMatch = pendingMatch?.tournamentMatchId === match.tournamentMatchId;
            let countdownText: string | null = null;
            let countdownTone = 'text-white/70';

            if (countdownInfo) {
              if (countdownInfo.status === 'running') {
                const seconds =
                  isPersonalMatch && typeof pendingCountdownSeconds === 'number'
                    ? Math.max(pendingCountdownSeconds, 0)
                    : Math.max(countdownInfo.secondsRemaining, 0);
                countdownText = `Auto-starting in ${seconds}s`;
                countdownTone = 'text-emerald-300';
              } else if (countdownInfo.status === 'started') {
                countdownText = 'Launching match…';
                countdownTone = 'text-sky-300';
              } else if (countdownInfo.status === 'cancelled') {
                countdownText = 'Countdown paused — waiting for players';
                countdownTone = 'text-amber-300';
              }
            }

            if (!countdownText && isPersonalMatch) {
              countdownText = 'As soon as both players are online, the countdown begins.';
              countdownTone = 'text-white/70';
            }

            return (
              <li
                key={match.tournamentMatchId}
                className={`rounded-xl border border-white/10 bg-black/40 p-4 text-sm ${
                  isYours ? 'border-indigo-400/40' : ''
                }`}
              >
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/40">
                  <span>Match #{match.tournamentMatchId}</span>
                  <span>{readyStageLabel(match)}</span>
                </div>
                <ul className="space-y-1">
                  {match.participants.map((participant) => (
                    <li
                      key={participant.participantId}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        participant.userUuid === currentUserUuid
                          ? 'bg-indigo-500/20 text-indigo-100'
                          : 'bg-white/5 text-white/80'
                      }`}
                    >
                      <span>
                        {participant.alias} · {participant.teamNumber === 1 ? 'West' : 'East'}
                      </span>
                    </li>
                  ))}
                </ul>

                {countdownText && (
                  <div className={`mt-3 text-xs font-medium ${countdownTone}`}>{countdownText}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default TournamentDirectedMatchesPanel;
