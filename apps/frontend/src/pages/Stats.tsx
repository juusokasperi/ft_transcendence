import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { resolveAvatarUrl } from '../utils/avatarUrl';

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
  const myUuid = user?.uuid;

  const fetchStats = async () => {
    try {
      const response = await axios.get<MatchPlayerStats>('/api/users/me/stats');
      setStats(response.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
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
      toast.error(String(axiosErr?.response?.data?.message));
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
      <span className="text-sm font-medium text-gray-600">{teamName}</span>
      {team.map((player, index) => {
        const avatarUrl = resolveAvatarUrl(player?.avatar, axios.defaults.baseURL);
        const pstats = player?.stats;
        
        return (
          <div key={index} className="flex items-center space-x-2">
            {player && player.username ? (
              <>
                <img src={avatarUrl} alt={player.username} className="h-6 w-6 rounded-full" />
                <div className="flex flex-col">
                  <div>
                    <span className="text-sm">{player.username}</span>
                    <span className="ml-1 text-xs text-gray-500">({player.ranking})</span>
                  </div>
                  <span className={`text-xs ${colorClass}`}>
                    {player.rankingDelta > 0 ? `+${player.rankingDelta}` : player.rankingDelta}
                  </span>
                  {pstats && (
                    <span className="text-[10px] text-gray-500">
                      Pts {pstats.pointsScored}-{pstats.pointsConceded} • Games {pstats.gamesWon}-
                      {pstats.gamesLost} • Lead {pstats.maxPointLead}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm text-gray-400">Unknown Player</span>
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
        return 'text-green-600';
      case 'loss':
        return 'text-red-600';
      case 'draw':
        return 'text-yellow-600';
      default:
        return 'text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-lg text-gray-600">Loading matches..</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Ranked Stats */}
      {stats && (
        <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-gray-800">Ranked Stats</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{matchesPlayed}</div>
              <div className="text-gray-600">Matches Played</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.matchesWon}</div>
              <div className="text-gray-600">Wins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.matchesLost}</div>
              <div className="text-gray-600">Losses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{winRate}%</div>
              <div className="text-gray-600">Win Rate</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold`}>{stats.ranking}</div>
              <div className="text-gray-600">Rating</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${rankingDeltaTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {rankingDeltaTotal >= 0 ? `+${rankingDeltaTotal}` : rankingDeltaTotal}
              </div>
              <div className="text-gray-600">Net Rating Change</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${avgDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {avgDelta >= 0 ? `+${avgDelta}` : avgDelta}
              </div>
              <div className="text-gray-600">Avg Rating Change</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{stats.pointsScored}</div>
              <div className="text-gray-600">Points Scored</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{stats.pointsConceded}</div>
              <div className="text-gray-600">Points Conceded</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{stats.gamesWon}</div>
              <div className="text-gray-600">Games Won</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{stats.gamesLost}</div>
              <div className="text-gray-600">Games Lost</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{stats.maxPointLead}</div>
              <div className="text-gray-600">Best Point Lead</div>
            </div>
          </div>
        </div>
      )}

      {/* Matches List */}
      <div className="rounded-lg bg-white shadow-md">
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-gray-800">Recent Matches</h2>
        </div>

        {matches.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {matches.map((match) => {
              const result = getMatchResult(match);
              const colorClass = getResultColor(result);

              return (
                <div key={match.id} className="p-6 hover:bg-gray-50">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-lg font-bold text-gray-800">Match #{match.id}</div>
                      {match.tournamentStage && (
                        <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                          {match.tournamentStage}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{formatDate(match.playedAt)}</div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {/* Team 1 */}
                    <div>{renderTeam(match.players.team1, 'Team 1', colorClass)}</div>

                    {/* Score */}
                    <div className="flex items-center justify-center">
                      <div className="text-center">
                        <div className={`text-3xl font-bold ${colorClass}`}>
                          {match.team1Score} - {match.team2Score}
                        </div>
                      </div>
                    </div>

                    {/* Team 2 */}
                    <div>{renderTeam(match.players.team2, 'Team 2', '')}</div>
                  </div>
                </div>
              );
            })}

            {hasMore && !loading && (
              <div className="border-t p-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More Matches'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-lg text-gray-500">No matches found</div>
            <div className="mt-2 text-sm text-gray-400">
              Start playing to see your match history here!
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stats;
