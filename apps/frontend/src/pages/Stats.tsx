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
  uuid: string;
  pointsScored: number;
  pointsConceded: number;
  gamesWon: number;
  gamesLost: number;
  maxPointLead: number;
}

const Stats: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const pageSize = 5;
  const { axios, user } = useAppContext();
  const myUuid = user?.uuid;

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

  // Aggregate ranked game stats for the current user from loaded matches
  const rankedAgg = React.useMemo(() => {
    let played = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let rankingDeltaTotal = 0;
    let pointsScored = 0;
    let pointsConceded = 0;
    let gamesWon = 0;
    let gamesLost = 0;
    let maxPointLeadBest = 0;

    for (const m of matches) {
      // User's team is normalized to team1 by the backend; still guard by uuid
      const mine = m.players.team1.find((p) => p && p.uuid === myUuid) || null;
      if (!mine) continue;
      played += 1;
      const result = getMatchResult(m);
      if (result === 'win') wins += 1;
      else if (result === 'loss') losses += 1;
      else draws += 1;
      rankingDeltaTotal += mine.rankingDelta;
      if (mine.stats) {
        pointsScored += mine.stats.pointsScored;
        pointsConceded += mine.stats.pointsConceded;
        gamesWon += mine.stats.gamesWon;
        gamesLost += mine.stats.gamesLost;
        if (mine.stats.maxPointLead > maxPointLeadBest) maxPointLeadBest = mine.stats.maxPointLead;
      }
    }
    const avgDelta = played > 0 ? (rankingDeltaTotal / played) : 0;
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;
    return {
      played,
      wins,
      losses,
      draws,
      rankingDeltaTotal,
      avgDelta: Math.round(avgDelta * 10) / 10,
      winRate,
      pointsScored,
      pointsConceded,
      gamesWon,
      gamesLost,
      maxPointLeadBest,
    };
  }, [matches, myUuid]);

  const renderTeam = (
    team: (MatchPlayerPublic | null)[],
    teamName: string,
    colorClass: string,
  ) => (
    <div className="flex flex-col space-y-1">
      <span className="text-sm font-medium text-gray-600">{teamName}</span>
      {team.map((player, index) => {
        const avatarUrl = resolveAvatarUrl(player?.avatar, axios.defaults.baseURL);
        const pstats = player?.stats;
        return (
          <div key={index} className="flex items-center space-x-2">
            {player ? (
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
      <h1 className="mb-8 text-3xl font-bold text-purple-600">Match Statistics</h1>

      {/* Matches Summary */}
      <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-bold text-gray-800">Summary</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{matches.length}</div>
            <div className="text-gray-600">Total Matches</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {
                matches.filter((m) => m.tournamentId !== null && m.tournamentId !== undefined)
                  .length
              }
            </div>
            <div className="text-gray-600">Tournament Matches</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {
                matches.filter((m) => m.tournamentId === null || m.tournamentId === undefined)
                  .length
              }
            </div>
            <div className="text-gray-600">Casual Matches</div>
          </div>
        </div>
      </div>

      {/* Ranked Stats */}
      <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-bold text-gray-800">Ranked Stats</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{rankedAgg.played}</div>
            <div className="text-gray-600">Matches Played</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{rankedAgg.wins}</div>
            <div className="text-gray-600">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{rankedAgg.losses}</div>
            <div className="text-gray-600">Losses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{rankedAgg.winRate}%</div>
            <div className="text-gray-600">Win Rate</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${rankedAgg.rankingDeltaTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rankedAgg.rankingDeltaTotal >= 0 ? `+${rankedAgg.rankingDeltaTotal}` : rankedAgg.rankingDeltaTotal}
            </div>
            <div className="text-gray-600">Net Rating Change</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${rankedAgg.avgDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rankedAgg.avgDelta >= 0 ? `+${rankedAgg.avgDelta}` : rankedAgg.avgDelta}
            </div>
            <div className="text-gray-600">Avg Rating Change</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{rankedAgg.pointsScored}</div>
            <div className="text-gray-600">Points Scored</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{rankedAgg.pointsConceded}</div>
            <div className="text-gray-600">Points Conceded</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{rankedAgg.gamesWon}</div>
            <div className="text-gray-600">Games Won</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{rankedAgg.gamesLost}</div>
            <div className="text-gray-600">Games Lost</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{rankedAgg.maxPointLeadBest}</div>
            <div className="text-gray-600">Best Point Lead</div>
          </div>
        </div>
      </div>

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
