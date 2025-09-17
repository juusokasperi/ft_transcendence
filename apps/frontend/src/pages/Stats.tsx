import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { resolveAvatarUrl } from '../utils/avatarUrl';

interface PublicUser {
  uuid: string;
  username: string;
  avatar: string | null;
  ranking: number;
  createdAt: string;
}

interface Game {
  id: number;
  team1Score: number;
  team2Score: number;
  players: {
    team1: (PublicUser | null)[];
    team2: (PublicUser | null)[];
  };
  playedAt: string;
  tournamentId: number | null;
  tournamentStage: string | null;
}

const Stats: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const pageSize = 5;
  const { axios } = useAppContext();

  const fetchGames = async (isLoadMore = false) => {
    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const currentOffset = isLoadMore ? offset : 0;
      const response = await axios.get<Game[]>(
        `/api/games?count=${pageSize}&offset=${currentOffset}`,
      );
      if (isLoadMore) setGames((prev: Game[]) => [...prev, ...response.data]);
      else setGames(response.data);

      setHasMore(response.data.length === pageSize);
      if (isLoadMore) setOffset((prev: number) => prev + pageSize);
      else setOffset(pageSize);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const loadMore = () => fetchGames(true);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderTeam = (team: (PublicUser | null)[], teamName: string) => (
    <div className="flex flex-col space-y-1">
      <span className="text-sm font-medium text-gray-600">{teamName}</span>
      {team.map((player, index) => {
        const avatarUrl = resolveAvatarUrl(player?.avatar, axios.defaults.baseURL);
        return (
          <div key={index} className="flex items-center space-x-2">
            {player ? (
              <>
                <img src={avatarUrl} alt={player.username} className="h-6 w-6 rounded-full" />
                <span className="text-sm">{player.username}</span>
                <span className="text-xs text-gray-500">({player.ranking})</span>
              </>
            ) : (
              <span className="text-sm text-gray-400">Unknown Player</span>
            )}
          </div>
        );
      })}
    </div>
  );

  const getGameResult = (game: Game) => {
    if (game.team1Score > game.team2Score) return 'win';
    if (game.team1Score < game.team2Score) return 'loss';
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
        <div className="text-lg text-gray-600">Loading games..</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold text-purple-600">Game Statistics</h1>

      {/* Games Summary */}
      <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-bold text-gray-800">Summary</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{games.length}</div>
            <div className="text-gray-600">Total Games</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {games.filter((g) => g.tournamentId !== null && g.tournamentId !== undefined).length}
            </div>
            <div className="text-gray-600">Tournament Games</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {games.filter((g) => g.tournamentId === null || g.tournamentId === undefined).length}
            </div>
            <div className="text-gray-600">Casual Games</div>
          </div>
        </div>
      </div>

      {/* Games List */}
      <div className="rounded-lg bg-white shadow-md">
        <div className="border-b p-6">
          <h2 className="text-xl font-bold text-gray-800">Recent Games</h2>
        </div>

        {games.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {games.map((game) => {
              const result = getGameResult(game);
              const colorClass = getResultColor(result);

              return (
                <div key={game.id} className="p-6 hover:bg-gray-50">
                  <div className="mb-4 flex items-start justify-between">
                   <div className="flex items-center space-x-4">
                      <div className="text-lg font-bold text-gray-800">Game #{game.id}</div>
                      {game.tournamentStage && (
                        <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                          {game.tournamentStage}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{formatDate(game.playedAt)}</div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {/* Team 1 */}
                    <div>{renderTeam(game.players.team1, 'Team 1')}</div>

                    {/* Score */}
                    <div className="flex items-center justify-center">
                      <div className="text-center">
                      <div className={`text-3xl font-bold ${colorClass}`}>
                        {game.team1Score} - {game.team2Score}
                      </div>
                      <div className="text-sm text-gray-500">Final Score</div>
                    </div>
                  </div>

                  {/* Team 2 */}
                  <div>{renderTeam(game.players.team2, 'Team 2')}</div>
                </div>
              </div>
            )})}

            {hasMore && !loading && (
              <div className="border-t p-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More Games'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-lg text-gray-500">No games found</div>
            <div className="mt-2 text-sm text-gray-400">
              Start playing to see your game history here!
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stats;
