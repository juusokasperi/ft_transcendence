import { formatDate } from './';
import type { Match } from './';
import { toneClass } from './Cards';

export const DesktopMatches: React.FC<{ match: Match; colorClass: string }> = ({
  match,
  colorClass,
}) => (
  <div className="hidden grid-cols-7 items-center gap-2 border-b border-white/10 bg-slate-950/70 px-6 py-4 text-xs transition hover:bg-white/5 lg:grid">
    {/* ELO Change */}
    <span
      className={`font-semibold ${
        match.players.team1[0]!.rankingDelta > 0
          ? toneClass.positive
          : match.players.team1[0]!.rankingDelta < 0
            ? toneClass.negative
            : toneClass.neutral
      }`}
    >
      {match.players.team1[0]!.rankingDelta !== undefined
        ? match.players.team1[0]!.rankingDelta > 0
          ? `+${match.players.team1[0]!.rankingDelta}`
          : match.players.team1[0]!.rankingDelta
        : '-'}
    </span>

    {/* Opponent + MMR */}
    <span className="flex items-center gap-2">
      <span className="font-medium text-white">
        {match.players.team2[0]?.username ?? 'Unknown'}
      </span>
      {match.players.team2[0]!.ranking && (
        <span className="text-slate-400">({match.players.team2[0]?.ranking})</span>
      )}
    </span>

    {/* Result */}
    <span className={`font-bold ${colorClass}`}>
      {match.team1Score} - {match.team2Score}
    </span>
    {/* Points scored */}
    <span>{match.players.team1[0]?.stats?.pointsScored ?? '-'}</span>

    {/* Points conceded */}
    <span>{match.players.team1[0]?.stats?.pointsConceded ?? '-'}</span>

    {/* Biggest lead */}
    <span>{match.players.team1[0]?.stats?.maxPointLead ?? '-'}</span>

    {/* Played at */}
    <span className="text-slate-400">{formatDate(match.playedAt, 'short')}</span>
  </div>
);

export const MobileMatches: React.FC<{ match: Match; colorClass: string }> = ({
  match,
  colorClass,
}) => (
  <div className="space-y-3 border-b border-white/10 bg-slate-950/70 px-4 py-4 lg:hidden">
    {/* Top row: Opponent and Result */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">
            {match.players.team2[0]?.username ?? 'Unknown'}
          </span>
          {match.players.team2[0]!.ranking && (
            <span className="text-xs text-slate-400">Rank {match.players.team2[0]?.ranking}</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-lg font-bold ${colorClass}`}>
          {match.team1Score} - {match.team2Score}
        </div>
        <span
          className={`text-xs font-semibold ${
            match.players.team1[0]!.rankingDelta > 0
              ? toneClass.positive
              : match.players.team1[0]!.rankingDelta < 0
                ? toneClass.negative
                : toneClass.neutral
          }`}
        >
          {match.players.team1[0]!.rankingDelta !== undefined
            ? match.players.team1[0]!.rankingDelta > 0
              ? `+${match.players.team1[0]!.rankingDelta}`
              : match.players.team1[0]!.rankingDelta
            : '-'}
        </span>
      </div>
    </div>

    {/* Stats grid */}
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded bg-slate-900/50 px-3 py-2">
        <div className="text-slate-400">Points Scored</div>
        <div className="font-semibold text-white">
          {match.players.team1[0]?.stats?.pointsScored ?? '-'}
        </div>
      </div>
      <div className="rounded bg-slate-900/50 px-3 py-2">
        <div className="text-slate-400">Points Conceded</div>
        <div className="font-semibold text-white">
          {match.players.team1[0]?.stats?.pointsConceded ?? '-'}
        </div>
      </div>
      <div className="rounded bg-slate-900/50 px-3 py-2">
        <div className="text-slate-400">Biggest Lead</div>
        <div className="font-semibold text-white">
          {match.players.team1[0]?.stats?.maxPointLead ?? '-'}
        </div>
      </div>
      <div className="rounded bg-slate-900/50 px-3 py-2">
        <div className="text-slate-400">Played At</div>
        <div className="font-semibold text-white">{formatDate(match.playedAt, 'short')}</div>
      </div>
    </div>
  </div>
);
