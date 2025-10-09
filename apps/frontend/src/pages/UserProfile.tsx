import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useAppContext } from "../context/AppContext";
import { AxiosError } from "axios";
import { useSnackbar } from "../context/SnackbarContext";
import { StatsSection } from "../components/StatsOverview";
import { PLACEHOLDER, resolveAvatarUrl } from "../utils/avatarUrl";

interface User {
  username: string;
  uuid: string;
  avatar: string | null;
  online: boolean;
}

const UserProfile: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { axios } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();

  const fetchUser = async () => {
    try {
      const res = await axios.get(`/api/users/${uuid}`);
      setUser(res.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message:
          axiosErr?.response?.data?.message ?? "Failed to load user data",
        variant: "error",
      });
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`/api/users/${uuid}/stats`);
      setStats(res.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message:
          axiosErr?.response?.data?.message ?? "Failed to load user stats",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchStats();
    window.scrollTo(0, 0);
  }, [uuid]);

  if (loading)
    return (
      <div className="min-h-screen bg-slate-950 flex justify-center items-center text-white">
        Loading profile…
      </div>
    );

  if (!stats || !user)
    return (
      <div className="min-h-screen bg-slate-950 flex justify-center items-center text-red-400">
        No stats found.
      </div>
    );

  const avatarUrl = resolveAvatarUrl(user.avatar, axios.defaults.baseURL);

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <div className="pt-28 px-6 text-white">
        <header className="mb-8 flex items-center gap-4">
          <img
            src={avatarUrl ?? PLACEHOLDER}
            alt={user.username}
            className="h-16 w-16 rounded-full border-2 border-indigo-500 object-cover"
          />
          <div className="flex flex-col">
            <h1 className="text-3xl font-semibold">{user.username}</h1>
            <span
              className={`text-sm ${
                user.online ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              {user.online ? "Online" : "Offline"}
            </span>
          </div>
          <button className="ml-auto rounded-full bg-indigo-600/60 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold shadow">
            ➕ Add Friend
          </button>
        </header>

        <StatsSection stats={stats} />
      </div>
    </div>
  );
};

export default UserProfile;
