import type { MatchPlayerStats } from '.';
import { StatBarChartCard, PieChartCard, StatCard } from './Cards';
import { formatDate } from '.';

export const StatsSection: React.FC<{ stats: MatchPlayerStats }> = ({ stats }) => {
  const winRate =
    stats && stats.matchesWon! + stats.matchesLost! > 0
      ? Math.round((stats.matchesWon! / (stats.matchesWon! + stats.matchesLost!)) * 100)
      : 0;
  const rankingDeltaTotal = stats ? stats.ranking! - 1000 : 0;
  const matchesPlayed = stats ? stats.matchesWon! + stats.matchesLost! : 0;
  const avgDelta = matchesPlayed > 0 ? Number((rankingDeltaTotal / matchesPlayed).toFixed(2)) : 0;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-xl shadow-indigo-950/40 backdrop-blur">
      <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />
      {stats.createdAt && (
        <p className="mx-auto mb-4 ml-2 text-xs uppercase tracking-[0.25em] text-slate-400">
          Joined on {formatDate(stats.createdAt)}
        </p>
      )}
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-6">
        <StatBarChartCard
          label="Matches Overview"
          accent="from-indigo-400 to-purple-500"
          data={[
            { name: 'Won', value: stats.matchesWon ?? 0 },
            { name: 'Lost', value: stats.matchesLost ?? 0 },
          ]}
          total={true}
        />

        <PieChartCard
          label="Win Rate"
          accent="from-sky-400 to-indigo-500"
          data={[
            { name: 'Won', value: stats.matchesWon ?? 0 },
            { name: 'Lost', value: stats.matchesLost ?? 0 },
          ]}
          total={winRate ?? 0}
        />

        <StatBarChartCard
          label="Points Overview"
          accent="from-indigo-400 to-purple-500"
          data={[
            { name: 'Scored', value: stats.pointsScored },
            { name: 'Conceded', value: stats.pointsConceded },
          ]}
        />

        <StatBarChartCard
          label="Games Overview"
          accent="from-sky-400 to-indigo-500"
          data={[
            { name: 'Won', value: stats.gamesWon ?? 0 },
            { name: 'Lost', value: stats.gamesLost ?? 0 },
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
        <StatCard label="Best point lead" value={stats.maxPointLead} />
      </div>
    </section>
  );
};
