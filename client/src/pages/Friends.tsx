import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';

const Friends: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'online' | 'offline' | 'pending' | 'add'>('online');

  const [friendName, setFriendName] = useState('');

  const { axios, getToken } = useAppContext();

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendName.trim()) return;

    const res = await axios.post('/api/friends', {
      username: friendName,
    });

    // 🚀 Replace this with your backend request
    console.log('Sending friend request to:', friendName);

    setFriendName(''); // reset input after submit
  };

  return (
    <div className="p-6">
      {/* Tabs */}
      <div className="mb-6 flex space-x-4 border-b border-gray-300">
        {['online', 'offline', 'pending', 'add'].map((tab) => (
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
        {activeTab === 'online' && (
          <div className="text-green-600">
            <h2 className="mb-4 text-xl font-bold">Online Friends</h2>
            <ul className="list-disc space-y-2 pl-5"></ul>
          </div>
        )}
        {activeTab === 'offline' && (
          <div className="text-gray-600">
            <h2 className="mb-4 text-xl font-bold">Offline Friends</h2>
            <ul className="list-disc space-y-2 pl-5"></ul>
          </div>
        )}
        {activeTab === 'pending' && (
          <div className="text-yellow-600">
            <h2 className="mb-4 text-xl font-bold">Pending Requests</h2>
            <ul className="list-disc space-y-2 pl-5"></ul>
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
