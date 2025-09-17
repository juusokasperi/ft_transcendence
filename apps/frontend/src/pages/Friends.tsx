import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { resolveAvatarUrl } from '../utils/avatarUrl';

interface FriendRequest {
  username: string;
  uuid: string;
}
type Friend = {
  username: string;
  avatar: string;
  online: boolean;
};

const Friends: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'offline' | 'pending' | 'add'>(
    'online',
  );
  const [friendName, setFriendName] = useState('');

  const [pendingSent, setPendingSent] = useState<FriendRequest[]>([]);
  const [pendingReceived, setPendingReceived] = useState<FriendRequest[]>([]);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<Friend[]>([]);
  const [offlineFriends, setOfflineFriends] = useState<Friend[]>([]);

  const { axios } = useAppContext();

  // Add friend
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendName.trim()) return;

    try {
      await axios.post('/api/friends', { username: friendName });
      toast.success(`Friend request sent to ${friendName}`);
      setFriendName('');
      fetchSentPendingFriends(); // refresh sent pending list
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    }
  };

  const fetchAllFriends = async () => {
    try {
      const res = await axios.get<Friend[]>('/api/friends/');

      const friendsWithAvatar = res.data.map((f) => ({
        ...f,
        avatar: resolveAvatarUrl(f.avatar, axios.defaults.baseURL),
      }));

      // Removed debug logging of avatar URLs
      setFriends(friendsWithAvatar);

      setOnlineFriends(friendsWithAvatar.filter((f) => f.online));
      setOfflineFriends(friendsWithAvatar.filter((f) => !f.online));
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    }
  };

  // Fetch sent pending friend requests
  const fetchSentPendingFriends = async () => {
    try {
      const res = await axios.get<FriendRequest[]>('/api/friends/pending/sent');
      setPendingSent(res.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    }
  };

  // Fetch received pending friend requests
  const fetchReceivedPendingFriends = async () => {
    try {
      const res = await axios.get<FriendRequest[]>('/api/friends/pending/received');
      setPendingReceived(res.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    }
  };

  // Accept a received friend request
  const handleAcceptFriend = async (senderUuid: string) => {
    try {
      await axios.patch(`/api/friends/respond/${senderUuid}`, { accept: true });
      toast.success('Friend request accepted!');
      fetchSentPendingFriends();
      fetchReceivedPendingFriends();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    }
  };

  // Reject a received friend request
  const handleRejectFriend = async (senderUuid: string) => {
    try {
      await axios.patch(`/api/friends/respond/${senderUuid}`, { accept: false });
      toast.success('Friend request rejected!');
      fetchReceivedPendingFriends();
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      toast.error(String(axiosErr?.response?.data?.message));
    }
  };

  // Fetch pending requests when switching to pending tab
  useEffect(() => {
    if (activeTab === 'pending') {
      fetchSentPendingFriends();
      fetchReceivedPendingFriends();
    }
    if (activeTab === 'all' || activeTab === 'online' || activeTab === 'offline') {
      fetchAllFriends();
    }
  }, [activeTab]);

  return (
    <div className="mt-12 p-6">
      {/* Tabs */}
      <div className="mb-6 flex space-x-4 border-b border-gray-300">
        {['all', 'online', 'offline', 'pending', 'add'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 pb-2 capitalize ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 font-semibold text-blue-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'all' && (
          <div className="text-purple-600">
            <h2 className="mb-4 text-xl font-bold">All Friends</h2>
            <ul className="list-disc space-y-2 pl-5">
              {friends.length > 0 ? (
                friends.map((f) => (
                  <li key={f.username} className="flex items-center space-x-2">
                    <img src={f.avatar} alt={f.username} className="h-10 w-10 rounded-full" />
                    <span>{f.username}</span>
                  </li>
                ))
              ) : (
                <li>You have no friends</li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'online' && (
          <div className="text-green-600">
            <h2 className="mb-4 text-xl font-bold">Online Friends</h2>
            <ul className="list-disc space-y-2 pl-5">
              {onlineFriends.length > 0 ? (
                onlineFriends.map((f) => (
                  <li key={f.username} className="flex items-center space-x-2">
                    <img src={f.avatar} alt={f.username} className="h-10 w-10 rounded-full" />
                    <span>{f.username}</span>
                  </li>
                ))
              ) : (
                <li>You have no online friends</li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'offline' && (
          <div className="text-gray-600">
            <h2 className="mb-4 text-xl font-bold">Offline Friends</h2>
            <ul className="list-disc space-y-2 pl-5">
              {offlineFriends.length > 0 ? (
                offlineFriends.map((f) => (
                  <li key={f.username} className="flex items-center space-x-2">
                    <img src={f.avatar} alt={f.username} className="h-10 w-10 rounded-full" />
                    <span>{f.username}</span>
                  </li>
                ))
              ) : (
                <li>You have no offline friends</li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className="text-yellow-600">
            <h2 className="mb-4 text-xl font-bold">Pending Requests</h2>

            <h3 className="mb-2 font-semibold">Sent</h3>
            <ul className="mb-4 list-disc pl-5">
              {pendingSent.length > 0 ? (
                pendingSent.map((f) => <li key={f.uuid}>{f.username}</li>)
              ) : (
                <li>No sent requests</li>
              )}
            </ul>

            <h3 className="mb-2 font-semibold">Received</h3>
            <ul className="list-disc pl-5">
              {pendingReceived.length > 0 ? (
                pendingReceived.map((f) => (
                  <li key={f.uuid} className="flex items-center justify-between">
                    <span>{f.username}</span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleAcceptFriend(f.uuid)}
                        className="rounded bg-green-500 px-2 py-1 text-sm text-white hover:bg-green-600"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRejectFriend(f.uuid)}
                        className="rounded bg-red-500 px-2 py-1 text-sm text-white hover:bg-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))
              ) : (
                <li>No received requests</li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'add' && (
          <div>
            <h2 className="mb-4 text-xl font-bold">Add a Friend</h2>
            <form onSubmit={handleAddFriend} className="flex space-x-2">
              <input
                type="text"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                placeholder="Enter username or email"
                className="flex-1 rounded-lg border px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                Add
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Friends;
