import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { AxiosError } from 'axios';
import { resolveAvatarUrl } from '../utils/avatarUrl';
import Navbar from '../components/Navbar';
import { useSnackbar } from '../context/SnackbarContext';

interface MatchPlayerPublic {
  uuid: string;
  username: string;
  avatar: string | null;
  ranking: number;
  createdAt: string;
  rankingDelta: number;
  stats?: MatchPlayerStats;
}

interface Match {
  id: number;
  team1Score: number;
  team2Score: number;
  players: {
    team1: (MatchPlayerPublic | null)[];
    team2: (MatchPlayerPublic | null)[];
  };
  playedAt: string;
  tournamentId: number | null;
  tournamentStage: string | null;
}

interface MatchPlayerStats {
  uuid?: string;
  pointsScored: number;
  pointsConceded: number;
  gamesWon: number;
  gamesLost: number;
  maxPointLead: number;
  matchesWon?: number;
  matchesLost?: number;
  ranking?: number;
}

const Stats: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<MatchPlayerStats>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const pageSize = 5;
  const { axios, user } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const myUuid = user?.uuid;

  const fetchStats = async () => {
    try {
      const response = await axios.get<MatchPlayerStats>('/api/users/me/stats');
      setStats(response.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to load stats'),
        variant: 'error',
      });
    }
  };

  const fetchMatches = async (isLoadMore = false) => {
    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const currentOffset = isLoadMore ? offset : 0;
      const response = await axios.get<Match[]>(
        `/api/matches?count=${pageSize}&offset=${currentOffset}`,
      );
      const newMatches = response.data;
      if (isLoadMore) setMatches((prev: Match[]) => [...prev, ...newMatches]);
      else setMatches(newMatches);

      setHasMore(response.data.length === pageSize);
      if (isLoadMore) setOffset((prev: number) => prev + pageSize);
      else setOffset(pageSize);

      // Stats are embedded in the match payload (player.stats). No extra fetch.
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to load matches'),
        variant: 'error',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchMatches();
  }, []);

  const loadMore = () => fetchMatches(true);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const rankingDeltaTotal = stats ? stats.ranking! - 1000 : 0;
  const matchesPlayed = stats ? stats.matchesWon! + stats.matchesLost! : 0;
  const avgDelta = matchesPlayed > 0 ? Number((rankingDeltaTotal / matchesPlayed).toFixed(2)) : 0;
  const winRate =
    stats && stats.gamesWon + stats.gamesLost > 0
      ? Math.round((stats.gamesWon / (stats.gamesWon + stats.gamesLost)) * 100)
      : 0;

  const renderTeam = (team: (MatchPlayerPublic | null)[], teamName: string, colorClass: string) => (
    <div className="flex flex-col space-y-1">
      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{teamName}</span>
      {team.map((player, index) => {
        const avatarUrl = resolveAvatarUrl(player?.avatar, axios.defaults.baseURL);
        const pstats = player?.stats;

        return (
          <div key={index} className="flex items-center space-x-2">
            {player && player.username ? (
              <>
                <img src={avatarUrl} alt={player.username} className="h-7 w-7 rounded-full" />
                <div className="flex flex-col">
                  <div>
                    <span className="text-sm font-medium text-white/90">{player.username}</span>
                    <span className="ml-1 text-xs text-slate-400">({player.ranking})</span>
                  </div>
                  <span className={`text-xs font-semibold ${colorClass}`}>
                    {player.rankingDelta > 0 ? `+${player.rankingDelta}` : player.rankingDelta}
                  </span>
                  {pstats && (
                    <span className="text-[10px] text-slate-400">
                      Pts {pstats.pointsScored}-{pstats.pointsConceded} • Games {pstats.gamesWon}-
                      {pstats.gamesLost} • Lead {pstats.maxPointLead}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm text-slate-500">Unknown player</span>
            )}
          </div>
        );
      })}
    </div>
  );

  const getMatchResult = (match: Match) => {
    if (match.team1Score > match.team2Score) return 'win';
    if (match.team1Score < match.team2Score) return 'loss';
    return 'draw';
  };

  const getResultColor = (result: 'win' | 'loss' | 'draw') => {
    switch (result) {
      case 'win':
        return 'text-emerald-400';
      case 'loss':
        return 'text-rose-400';
      case 'draw':
        return 'text-amber-300';
      default:
        return 'text-white';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <div className="relative min-h-[calc(100vh-6rem)] pb-20 pt-28 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-indigo-600/40 via-purple-500/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-36 top-56 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute bottom-12 right-8 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:px-12">
          <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold sm:text-4xl">Performance overview</h1>
              <p className="text-sm text-slate-300/80">
                Match history, rankings, and streaks are updated after every game you play.
              </p>
            </div>
            {stats && (
              <div className="inline-flex items-center gap-3 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">
                <span className="font-semibold">Current rating</span>
                <span className="rounded-full bg-slate-950/50 px-3 py-1 text-white">
                  {stats.ranking}
                </span>
              </div>
            )}
          </header>

          {stats ? (
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-xl shadow-indigo-950/40 backdrop-blur">
              <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />

              <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Matches played" value={matchesPlayed} accent="from-indigo-400 to-purple-500" />
                <StatCard label="Wins" value={stats.matchesWon ?? 0} accent="from-emerald-400 to-teal-500" />
                <StatCard label="Losses" value={stats.matchesLost ?? 0} accent="from-rose-400 to-red-500" />
                <StatCard label="Win rate" value={`${winRate}%`} accent="from-sky-400 to-indigo-500" />

                <StatCard label="Points scored" value={stats.pointsScored} />
                <StatCard label="Points conceded" value={stats.pointsConceded} />
                <StatCard label="Games won" value={stats.gamesWon} />
                <StatCard label="Games lost" value={stats.gamesLost} />

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
          ) : (
            <section className="rounded-3xl border border-dashed border-white/10 bg-slate-900/60 p-10 text-center text-slate-300/70">
              Stats will appear here once you finish your first ranked match.
            </section>
          )}

          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-xl shadow-indigo-950/30 backdrop-blur">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-semibold">Recent matches</h2>
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-300/70">
                Pulling your latest games…
              </div>
            ) : matches.length > 0 ? (
              <div className="divide-y divide-white/5">
                {matches.map((match) => {
                  const result = getMatchResult(match);
                  const colorClass = getResultColor(result);

                  return (
                    <article key={match.id} className="px-6 py-5 transition hover:bg-white/5">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <span className="rounded-full bg-slate-800/80 px-3 py-1 text-sm text-indigo-200">
                            Match #{match.id}
                          </span>
                          {match.tournamentStage && (
                            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-200">
                              {match.tournamentStage}
                            </span>
                          )}
                        </div>
                        <time className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          {formatDate(match.playedAt)}
                        </time>
                      </div>

                      <div className="grid gap-6 sm:grid-cols-[1fr_auto_1fr]">
                        <div>{renderTeam(match.players.team1, 'Team 1', colorClass)}</div>
                        <div className="flex items-center justify-center">
                          <p className={`rounded-full bg-slate-800/80 px-5 py-2 text-lg font-semibold ${colorClass}`}>
                            {match.team1Score} - {match.team2Score}
                          </p>
                        </div>
                        <div>{renderTeam(match.players.team2, 'Team 2', '')}</div>
                      </div>
                    </article>
                  );
                })}

                {hasMore && (
                  <div className="border-t border-white/10 p-6 text-center">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white shadow shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading…' : 'Load more matches'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-10 text-center text-slate-300/70">
                <p className="text-lg font-medium">No matches yet</p>
                <p className="mt-2 text-sm text-slate-400/80">
                  Play your first game to start building your match timeline.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const toneClass = {
  positive: 'text-emerald-400',
  negative: 'text-rose-400',
  neutral: 'text-white',
} as const;

const StatCard: React.FC<{
  label: string;
  value: number | string;
  accent?: string;
  tone?: keyof typeof toneClass;
}> = ({ label, value, accent, tone = 'neutral' }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow shadow-indigo-950/20">
    {accent && (
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} />
    )}
    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</p>
    <p className={`mt-3 text-2xl font-semibold ${toneClass[tone]}`}>{value}</p>
  </div>
);

export default Stats;
