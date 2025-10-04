import type { MatchPlayerStats } from '../pages/Stats';
import { StatBarChartCard, PieChartCard, StatCard } from './StatsCards';
import { formatDate } from '../utils/formatDate';

const BASE_RANKING = 1000;

export const StatsSection: React.FC<{ stats: MatchPlayerStats }> = ({ stats }) => {
  const matchesWon = stats?.matchesWon ?? 0;
  const matchesLost = stats.matchesLost ?? 0;
  const winRate =
    matchesWon + matchesLost > 0 ? Math.round((matchesWon / (matchesWon + matchesLost)) * 100) : 0;
  const rankingDeltaTotal = stats?.ranking !== undefined ? stats.ranking - BASE_RANKING : 0;
  const matchesPlayed = matchesWon + matchesLost;
  const avgDelta = matchesPlayed > 0 ? Number((rankingDeltaTotal / matchesPlayed).toFixed(2)) : 0;
  const pointsScored = stats?.pointsScored ?? 0;
  const pointsConceded = stats?.pointsConceded ?? 0;
  const gamesWon = stats?.gamesWon ?? 0;
  const gamesLost = stats?.gamesLost ?? 0;
  const maxPointLead = stats?.maxPointLead ?? 0;
  const createdAt = stats?.createdAt ?? '';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-xl shadow-indigo-950/40 backdrop-blur">
      <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />
      {createdAt && (
        <p className="mx-auto mb-4 ml-2 text-xs uppercase tracking-[0.25em] text-slate-400">
          Joined on {formatDate(createdAt)}
        </p>
      )}
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-6">
        <StatBarChartCard
          label="Matches Overview"
          accent="from-indigo-400 to-purple-500"
          data={[
            { name: 'Won', value: matchesWon },
            { name: 'Lost', value: matchesLost },
          ]}
          total={true}
        />

        <PieChartCard
          label="Win Rate"
          accent="from-sky-400 to-indigo-500"
          data={[
            { name: 'Won', value: matchesWon },
            { name: 'Lost', value: matchesLost },
          ]}
          total={winRate ?? 0}
        />

        <StatBarChartCard
          label="Points Overview"
          accent="from-indigo-400 to-purple-500"
          data={[
            { name: 'Scored', value: pointsScored },
            { name: 'Conceded', value: pointsConceded },
          ]}
        />

        <StatBarChartCard
          label="Games Overview"
          accent="from-sky-400 to-indigo-500"
          data={[
            { name: 'Won', value: gamesWon ?? 0 },
            { name: 'Lost', value: gamesLost ?? 0 },
          ]}
        />

        <StatCard
          label="Net rating change"
          value={rankingDeltaTotal >= 0 ? `+${rankingDeltaTotal}` : rankingDeltaTotal}
          tone={rankingDeltaTotal >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Avg rating change"
          value={avgDelta >= 0 ? `+${avgDelta}` : avgDelta}
          tone={avgDelta >= 0 ? 'positive' : 'negative'}
        />
        <StatCard label="Best point lead" value={maxPointLead} />
      </div>
    </section>
  );
};
