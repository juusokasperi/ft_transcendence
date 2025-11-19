import React, { useState, useEffect, useMemo } from 'react';
import { validateEmail, validateUsername } from '../utils/validation';
import { useAppContext } from '../context/AppContext';
import { usePresence } from '../context/PresenceContext';
import { AxiosError } from 'axios';
import { resolveAvatarUrl } from '../utils/avatarUrl';
import { useSnackbar } from '../context/SnackbarContext';
import { Link } from 'react-router-dom';

interface FriendRequest {
  username: string;
  uuid: string;
}
type Friend = {
  username: string;
  uuid: string;
  avatar: string;
  online: boolean;
};
type FriendApi = Omit<Friend, 'online'>;

const tabs = [
  { key: 'all', label: 'All', description: 'Entire roster' },
  { key: 'online', label: 'Online', description: 'Ready to play' },
  { key: 'offline', label: 'Offline', description: 'Away for now' },
  { key: 'pending', label: 'Pending', description: 'Awaiting action' },
  { key: 'add', label: 'Add', description: 'Send invitation' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

const sanitizeFriendIdentifier = (input: string): { value: string; isEmail: boolean } => {
  const raw = String(input).slice(0, 254);
  let cleaned = raw.replace(/\s+/g, '');
  const isEmail = cleaned.includes('@');
  if (isEmail) {
    cleaned = cleaned
      .toLowerCase()
      .replace(/[^a-z0-9.@_%+-]/g, '')
      .slice(0, 254);
  } else {
    cleaned = cleaned.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 254);
  }
  return { value: cleaned, isEmail };
};

const Friends: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('online');
  const [friendName, setFriendName] = useState('');

  const [pendingSent, setPendingSent] = useState<FriendRequest[]>([]);
  const [pendingReceived, setPendingReceived] = useState<FriendRequest[]>([]);

  const [friends, setFriends] = useState<FriendApi[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<Friend[]>([]);
  const [offlineFriends, setOfflineFriends] = useState<Friend[]>([]);

  const { axios } = useAppContext();
  const { users: presenceUsers } = usePresence();
  const { enqueueSnackbar } = useSnackbar();
  const [friendError, setFriendError] = useState<string | null>(null);

  // Derive online status from open chat connection
  const friendsWithOnline: Friend[] = useMemo(() => {
    const onlineUuids = new Set(presenceUsers.map((user) => user.userUuid));
    return friends.map((friend) => ({
      ...friend,
      online: onlineUuids.has(friend.uuid),
    }));
  }, [friends, presenceUsers]);

  // Add friend
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendName.trim()) return;

    const { value: cleaned, isEmail } = sanitizeFriendIdentifier(friendName);
    if (!cleaned) {
      setFriendError('Please enter a username or email.');
      setFriendName(cleaned);
      return;
    }

    if (isEmail) {
      if (!validateEmail(cleaned)) {
        setFriendError('Please enter a valid email address.');
        // ensure UI reflects cleaned value
        setFriendName(cleaned);
        return;
      }
    } else {
      const usernameValidation = validateUsername(cleaned);
      if (usernameValidation.state !== 'valid') {
        setFriendError(usernameValidation.msg || 'Invalid username');
        setFriendName(cleaned);
        return;
      }
    }

    try {
      // Backend schema expects a `username` field which may contain a username, uuid or email.
      const payload = { username: cleaned };
      await axios.post('/api/friends', payload);
      enqueueSnackbar({
        message: `Friend request sent to ${friendName}`,
        variant: 'success',
      });
      setFriendName('');
      setFriendError(null);
      fetchSentPendingFriends();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to send friend request'),
        variant: 'error',
      });
      // if server responds with a validation-like error, show inline as well
      const msg = String(axiosErr?.response?.data?.message ?? 'Failed to send friend request');
      setFriendError(msg);
    }
  };

  const fetchAllFriends = async () => {
    try {
      const res = await axios.get<FriendApi[]>('/api/friends/');
      console.log(res);

      const friendsWithAvatar = res.data.map((f) => ({
        ...f,
        avatar: resolveAvatarUrl(f.avatar, axios.defaults.baseURL),
      }));

      setFriends(friendsWithAvatar);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to load friends'),
        variant: 'error',
      });
    }
  };

  const fetchSentPendingFriends = async () => {
    try {
      const res = await axios.get<FriendRequest[]>('/api/friends/pending/sent');
      setPendingSent(res.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to load sent requests'),
        variant: 'error',
      });
    }
  };

  const fetchReceivedPendingFriends = async () => {
    try {
      const res = await axios.get<FriendRequest[]>('/api/friends/pending/received');
      setPendingReceived(res.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to load received requests'),
        variant: 'error',
      });
    }
  };

  const handleAcceptFriend = async (senderUuid: string) => {
    try {
      await axios.patch(`/api/friends/respond/${senderUuid}`, { accept: true });
      enqueueSnackbar({
        message: 'Friend request accepted!',
        variant: 'success',
      });
      fetchSentPendingFriends();
      fetchReceivedPendingFriends();
      fetchAllFriends();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to accept request'),
        variant: 'error',
      });
    }
  };

  const handleRejectFriend = async (senderUuid: string) => {
    try {
      await axios.patch(`/api/friends/respond/${senderUuid}`, { accept: false });
      enqueueSnackbar({
        message: 'Friend request rejected!',
        variant: 'info',
      });
      fetchReceivedPendingFriends();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(axiosErr?.response?.data?.message ?? 'Failed to reject request'),
        variant: 'error',
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchSentPendingFriends();
      fetchReceivedPendingFriends();
    }
    if (activeTab === 'all' || activeTab === 'online' || activeTab === 'offline') {
      fetchAllFriends();
    }
  }, [activeTab]);

  useEffect(() => {
    setOnlineFriends(friendsWithOnline.filter((f) => f.online));
    setOfflineFriends(friendsWithOnline.filter((f) => !f.online));
  }, [friendsWithOnline]);

  const renderFriendList = (list: Friend[], emptyMessage: string, accent?: string) => (
    <div className="space-y-3">
      {list.length > 0 ? (
        list.map((friend) => (
          <div
            key={friend.username}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-sm shadow-indigo-950/20 backdrop-blur"
          >
            <div className="flex items-center gap-3">
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-white/20 ${accent ?? ''}`}
              >
                <img
                  src={friend.avatar}
                  alt={friend.username}
                  className="h-9 w-9 rounded-full object-cover"
                />
              </span>
              <div>
                <Link to={`/users/${friend.uuid}`} className="text-sm font-medium text-white">
                  {friend.username}
                </Link>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  {friend.online ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
            <span
              className={`h-2 w-2 rounded-full ${friend.online ? 'bg-emerald-400' : 'bg-slate-500'}`}
              aria-hidden
            />
          </div>
        ))
      ) : (
        <p className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-slate-300/70">
          {emptyMessage}
        </p>
      )}
    </div>
  );

  return (
    <div className="relative min-h-[calc(100vh-6rem)] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-600/30 via-purple-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-48 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-52 w-52 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-6 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold sm:text-4xl">Your friends hub</h1>
            <p className="text-sm text-slate-300/80">
              Manage connections, track requests, and invite new players to the arcade.
            </p>
          </div>
          <div className="flex gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-indigo-200">
            <span>Total {friends.length}</span>
            <span>•</span>
            <span>Online {onlineFriends.length}</span>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isActive
                    ? 'border-indigo-300/50 bg-indigo-500/20 text-white shadow shadow-indigo-900/40'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:border-indigo-300/30 hover:bg-indigo-400/10 hover:text-white'
                }`}
                type="button"
                aria-pressed={isActive}
              >
                {tab.label}
                <span className="text-xs font-normal uppercase tracking-[0.3em] text-slate-400 group-hover:text-indigo-200">
                  {tab.description}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl shadow-indigo-950/30 backdrop-blur">
          {activeTab === 'all' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">All friends</h2>
                <p className="text-sm text-slate-300/80">Everyone you follow and play with.</p>
              </div>
              {renderFriendList(
                friendsWithOnline,
                'No friends found yet. Invite someone to start playing!',
              )}
            </div>
          )}

          {activeTab === 'online' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-emerald-300">Online now</h2>
                <p className="text-sm text-slate-300/80">
                  Friends currently available for matches.
                </p>
              </div>
              {renderFriendList(
                onlineFriends,
                'No friends are online right now. Check back soon or send a ping!',
                'ring-emerald-400/40',
              )}
            </div>
          )}

          {activeTab === 'offline' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-300">Offline</h2>
                <p className="text-sm text-slate-300/80">Players who are currently away.</p>
              </div>
              {renderFriendList(
                offlineFriends,
                'No offline friends at the moment. Everyone is online or unadded!',
                'ring-slate-500/30',
              )}
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-amber-300">Pending requests</h2>
                <p className="text-sm text-slate-300/80">
                  Respond to incoming invitations or track requests you&apos;ve sent.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-indigo-200">Sent requests</h3>
                  {pendingSent.length > 0 ? (
                    <ul className="space-y-2 text-sm text-slate-200">
                      {pendingSent.map((f) => (
                        <li
                          key={f.uuid}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2"
                        >
                          <Link to={`/users/${f.uuid}`} className="font-medium">
                            {f.username}
                          </Link>
                          <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                            pending
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-4 text-xs text-slate-300/70">
                      No sent requests.
                    </p>
                  )}
                </div>

                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-sm font-semibold text-indigo-200">Received requests</h3>
                  {pendingReceived.length > 0 ? (
                    <ul className="space-y-3 text-sm text-slate-200">
                      {pendingReceived.map((f) => (
                        <li
                          key={f.uuid}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-3"
                        >
                          <Link to={`/users/${f.uuid}`} className="font-medium">
                            {f.username}
                          </Link>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAcceptFriend(f.uuid)}
                              className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-xs font-semibold text-white shadow shadow-emerald-900/40 transition hover:from-emerald-400 hover:to-teal-400"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectFriend(f.uuid)}
                              className="rounded-full border border-rose-400/60 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300 hover:text-white"
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed border-white/15 bg-white/5 px-3 py-4 text-xs text-slate-300/70">
                      No incoming requests.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-indigo-200">Add a friend</h2>
                <p className="text-sm text-slate-300/80">
                  Invite someone by their username or email address. We&apos;ll send a pending
                  request right away.
                </p>
              </div>
              <form onSubmit={handleAddFriend} className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <input
                    type="text"
                    value={friendName}
                    onChange={(e) => {
                      const { value: cleaned } = sanitizeFriendIdentifier(e.target.value);
                      setFriendName(cleaned);
                      // clear any previous inline error when the user edits the field
                      setFriendError(null);
                    }}
                    maxLength={254}
                    placeholder="Enter username or email"
                    className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
                  />
                  <div className="mt-1 text-xs">
                    {friendError ? (
                      <p className="text-rose-300">{friendError}</p>
                    ) : friendName ? (
                      friendName.includes('@') ? (
                        validateEmail(friendName) ? (
                          <p className="text-emerald-300">Looks like a valid email address.</p>
                        ) : (
                          <p className="text-rose-300">
                            Looks like an email but format seems invalid.
                          </p>
                        )
                      ) : validateUsername(friendName).state === 'valid' ? (
                        <p className="text-emerald-300">Looks like a valid username.</p>
                      ) : (
                        <p className="text-slate-300">
                          Enter a username (3–16 chars) or an email address.
                        </p>
                      )
                    ) : null}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <button
                    type="submit"
                    className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      !friendName.trim() ||
                      (friendName.includes('@')
                        ? !validateEmail(friendName)
                        : validateUsername(friendName).state !== 'valid')
                    }
                  >
                    Send request
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Friends;
