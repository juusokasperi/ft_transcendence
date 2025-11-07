import React from 'react';
import { resolveAvatarUrl } from '../utils/avatarUrl';
import Button from './Button';

type ProfileData = {
  avatar?: string | null;
  username?: string | null;
  createdAt?: string | null;
  wins?: number;
  losses?: number;
  rating?: number;
  ranking?: number;
  uuid?: string;
  userId?: string | number;
};

type Props = {
  profileData: ProfileData | null;
  loading: boolean;
  onClose: () => void;
  onOpenFullProfile: (id: string) => void;
};

const ChatProfile: React.FC<Props> = ({ profileData, loading, onClose, onOpenFullProfile }) => {
  const id = (profileData?.uuid ?? profileData?.userId) as string | undefined;

  return (
    <div className="absolute top-14 right-4 z-50 w-80 max-w-[90%] rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img
            src={resolveAvatarUrl(profileData?.avatar)}
            alt={`${profileData?.username ?? 'User'}'s avatar`}
            className="h-12 w-12 rounded-full object-cover"
          />

          <div>
            <div className="font-semibold text-white">{profileData?.username ?? 'Unknown'}</div>
            <div className="text-xs text-slate-400">
              {profileData?.createdAt ? new Date(profileData.createdAt).toLocaleDateString() : ''}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white"
          aria-label="Close profile"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-300">
        <div>
          <div className="text-xs text-slate-400">Wins</div>
          <div className="font-semibold text-white">{profileData?.wins ?? '-'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Losses</div>
          <div className="font-semibold text-white">{profileData?.losses ?? '-'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Rating</div>
          <div className="font-semibold text-white">{profileData?.rating ?? profileData?.ranking ?? '-'}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Win rate</div>
          <div className="font-semibold text-white">
            {(() => {
              const w = Number(profileData?.wins ?? 0);
              const l = Number(profileData?.losses ?? 0);
              const played = w + l;
              if (!played) return '-';
              return `${Math.round((w / played) * 100)}%`;
            })()}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => id && onOpenFullProfile(String(id))}>
          Open full profile
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {loading && <div className="mt-2 text-sm text-slate-400">Loading...</div>}
      {!loading && !profileData && (
        <div className="mt-2 text-sm text-slate-400">No profile data</div>
      )}
    </div>
  );
};

export default ChatProfile;
