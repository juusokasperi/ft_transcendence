import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AxiosError } from 'axios';
import Navbar from '../../components/Navbar';
import { useSnackbar } from '../../context/SnackbarContext';
import { DesktopMatches, MobileMatches } from './Matches';
import { StatsSection } from './StatsOverview';

interface MatchPlayerPublic {
  uuid: string;
  username: string;
  avatar: string | null;
  ranking: number;
  createdAt: string;
  rankingDelta: number;
  stats?: MatchPlayerStats;
}

export interface Match {
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

export interface MatchPlayerStats {
  uuid?: string;
  pointsScored: number;
  pointsConceded: number;
  gamesWon: number;
  gamesLost: number;
  maxPointLead: number;
  matchesWon?: number;
  matchesLost?: number;
  ranking?: number;
  createdAt?: string | null;
}

export const formatDate = (dateString: string, format: 'short' | 'long' = 'long') => {
  let formattedDate;
  if (format === 'short')
    formattedDate = new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  else
    formattedDate = new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return formattedDate;
};

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
            <StatsSection stats={stats} />
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
              <div className="bg-slate-900 p-4">
                <div className="mx-auto max-w-6xl">
                  <div className="divide-y divide-white/5">
                    <div className="hidden grid-cols-7 items-center border-b border-white/10 bg-slate-950/80 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-300 lg:grid">
                      <span>ELO Δ</span>
                      <span>Opponent</span>
                      <span>Result</span>
                      <span>Points Scored</span>
                      <span>Points Conceded</span>
                      <span>Biggest Lead</span>
                      <span>Played At</span>
                    </div>
                    {matches.map((match) => {
                      if (!match.players.team2[0] || !match.players.team1[0]) return '';
                      const result = getMatchResult(match);
                      const colorClass = getResultColor(result);

                      return (
                        <article key={match.id}>
                          <DesktopMatches match={match} colorClass={colorClass} />
                          <MobileMatches match={match} colorClass={colorClass} />
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
                </div>
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

export default Stats;
