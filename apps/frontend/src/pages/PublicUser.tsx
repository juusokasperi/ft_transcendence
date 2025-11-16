import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useChatContext } from '../context/ChatContext';
import { AxiosError } from 'axios';
import Navbar from '../components/Navbar';
import { useSnackbar } from '../context/SnackbarContext';
import { resolveAvatarUrl } from '../utils/avatarUrl';
import { DesktopMatches, MobileMatches } from '../components/StatsMatches';
import { StatsSection } from '../components/StatsOverview';
import { useRequireAuth } from '../hooks/useRequireAuth';
import FriendshipStatus from '../components/FriendshipStatus';
import { Spinner } from '@ft/spinner';
import type {
  UserStats as UserStatsBase,
  MatchWithPlayers as Match,
  FriendshipStatus as Friendship,
} from '@utils/types';
import type { MatchPlayerStats } from '../types';

interface FriendshipStatus {
  status: Friendship;
}

interface UserStats extends UserStatsBase {
  online?: boolean;
}

const PublicUser: React.FC = () => {
  useRequireAuth();

  const { uuid } = useParams<{ uuid: string }>();
  const [friendship, setFriendship] = useState<Friendship>('none');
  const [profile, setProfile] = useState<UserStats>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<MatchPlayerStats>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const pageSize = 5;
  const { axios, user, navigate } = useAppContext();
  const { users: chatUsers } = useChatContext();
  const { enqueueSnackbar } = useSnackbar();

  const profileWithOnline = useMemo(() => {
    if (!profile) return undefined;
    return {
      ...profile,
      online: !!chatUsers.find((u) => u.userUuid === profile.uuid),
    };
  }, [profile, chatUsers]);

  const fetchFriendship = async () => {
    try {
      const response = await axios.get<FriendshipStatus>(`/api/friends/${uuid}`);
      setFriendship(response.data.status);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to fetch friendship status'),
        variant: 'error',
      });
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await axios.get<UserStats>(`/api/users/${uuid}`);
      const fetchedProfile = response.data;
      fetchedProfile.avatar = resolveAvatarUrl(fetchedProfile.avatar, axios.defaults.baseURL);
      fetchedProfile.online = !!chatUsers.find((u) => u.userUuid === fetchedProfile.uuid);

      setProfile(fetchedProfile);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to load user profile'),
        variant: 'error',
      });
      navigate('/');
      throw err;
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get<MatchPlayerStats>(`/api/users/${uuid}/stats`);
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
        `/api/users/${uuid}/matches?count=${pageSize}&offset=${currentOffset}`,
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
    const fetchData = async () => {
      try {
        await fetchProfile();
        fetchStats();
        fetchMatches();
        fetchFriendship();
      } catch (err) {
        console.log('Failed to fetch user data');
      } finally {
        window.scrollTo(0, 0);
      }
    };
    if (uuid) fetchData();
  }, [uuid]);

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

  const matches1v1 = matches.filter(
    (match: Match) =>
      match.players.team1.length < 2 &&
      match.players.team2.length < 2 &&
      match.players.team1[0] &&
      match.players.team2[0],
  );

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
          {profileWithOnline && (
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div
                key={profileWithOnline.uuid}
                className="flex items-center justify-between rounded-2xl px-4 py-3 shadow-sm shadow-indigo-950/20 backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`relative flex h-20 w-20 items-center justify-center rounded-full ring-2 ring-white/20`}
                  >
                    <img
                      src={profileWithOnline.avatar!}
                      alt={profileWithOnline.username}
                      className="h-full w-full rounded-full object-cover"
                    />
                  </span>
                  <div>
                    <h1 className="text-3xl font-semibold sm:text-4xl">
                      {profileWithOnline.username}
                    </h1>
                    {stats && (
                      <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
                        Rank {stats.ranking}
                      </p>
                    )}
                    <p className="text-sm uppercase tracking-[0.25em] text-slate-400">
                      {profileWithOnline.online ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </div>
              {uuid && user?.uuid !== profileWithOnline.uuid && (
                <FriendshipStatus
                  friendship={friendship}
                  uuid={uuid}
                  onStatusChange={setFriendship}
                  onRefreshFriendship={fetchFriendship}
                />
              )}
            </header>
          )}

          {stats ? (
            <StatsSection stats={stats} />
          ) : (
            <section className="rounded-3xl border border-dashed border-white/10 bg-slate-900/60 p-10 text-center text-slate-300/70">
              No stats to display.
            </section>
          )}

          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-xl shadow-indigo-950/30 backdrop-blur">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-semibold">Recent matches</h2>
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-300/70">
                <span className="inline-flex items-center gap-2">
                  <Spinner size={20} color="#A855F7" aria-label="Loading recent matches" />
                  <span>Pulling user's latest games</span>
                </span>
              </div>
            ) : matches1v1.length > 0 ? (
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
                    {matches1v1.map((match) => {
                      const result = getMatchResult(match);
                      const colorClass = getResultColor(result);

                      return (
                        <article key={match.id}>
                          <DesktopMatches match={match} colorClass={colorClass} />
                          <MobileMatches match={match} colorClass={colorClass} />
                        </article>
                      );
                    })}

                    {hasMore ? (
                      <div className="border-t border-white/10 p-6 text-center">
                        <button
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white shadow shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {loadingMore ? (
                            <Spinner size={20} color="#FFFFFF" aria-label="Loading more matches" />
                          ) : (
                            'Load more matches'
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="p-10 text-center text-slate-300/70">
                        <p className="mt-2 text-sm text-slate-400/80">All matches displayed.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-slate-300/70">
                <p className="text-lg font-medium">No matches to display.</p>
                <p className="mt-2 text-sm text-slate-400/80">
                  User hasn't played any matches yet.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default PublicUser;
