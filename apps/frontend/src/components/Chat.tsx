import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLocation } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import ChatProfile from './chat/ChatProfile';
import SplitButton from './ui/SplitButton';
import Button from './Button';
import type { AxiosInstance } from 'axios';
import { useChatContext } from '../context/ChatContext';

async function fetchUserUuidByUsername(
  axios: AxiosInstance,
  targetUser: string,
): Promise<string | null> {
  try {
    const res = await axios.get('/api/users');
    const users = Array.isArray(res.data) ? res.data : (res.data?.users ?? []);

    const target = users.find((u: any) => u.username?.toLowerCase() === targetUser.toLowerCase());

    if (target?.userId || target?.uuid || target?.id) {
      return target.userId ?? target.uuid ?? target.id;
    }
    return null;
  } catch (err) {
    console.error('Error fetching users:', err);
    return null;
  }
}

type ChatProps = {
  onClose: () => void;
  username?: string;
  channel: string;
  isOpen?: boolean;

  // tournament data passed from TournamentPage
  firstPlayer?: string | null;
  secondPlayer?: string | null;
  stage?: string | null;
};

export default function Chat({
  onClose,
  channel,
  isOpen = true,
  firstPlayer = null,
  secondPlayer = null,
  stage = null,
}: ChatProps) {
  const { navigate, axios: authAxios } = useAppContext();
  const location = useLocation();
  const {
    channel: activeChannel,
    chatUsername,
    messages,
    users,
    blocked,
    pendingInvites,
    cooldown,
    sendChatMessage,
    sendPayload,
    addSystemMessage,
    acceptInvite,
    declineInvite,
    inviteAcceptedSignal,
    acknowledgeInviteAcceptedSignal,
  } = useChatContext();
  const displayChannel = activeChannel || channel;

  const [input, setInput] = useState('');
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  // profile card state
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<any | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  // Track last tournament announce we broadcasted to avoid duplicates
  const lastTournamentSigRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(isOpen);
  const tournamentTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (isOpen) {
      node.removeAttribute('inert');
    } else {
      if (node.contains(document.activeElement)) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
      node.setAttribute('inert', '');
    }
  }, [isOpen]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (wasOpen && !isOpen) {
      if (tournamentTimerRef.current) {
        clearTimeout(tournamentTimerRef.current);
        tournamentTimerRef.current = null;
      }
      setInput('');
      setDmTarget(null);
      lastTournamentSigRef.current = null;
      // close profile card when chat closes
      setProfileOpen(false);
      setProfileData(null);
      setProfileLoading(false);
      setShowConfirmDialog(false);
      setPendingNavId(null);
    }
  }, [isOpen]);

  // ---------- websocket events handled in ChatContext ----------

  // Announce tournament match start when match participants/stage change
  useEffect(() => {
    if (!isOpen) return;
    const sig =
      firstPlayer && secondPlayer && stage ? `${firstPlayer}|${secondPlayer}|${stage}` : null;
    if (!sig) return;
    if (lastTournamentSigRef.current === sig) return;

    if (tournamentTimerRef.current) {
      clearTimeout(tournamentTimerRef.current);
      tournamentTimerRef.current = null;
    }
    tournamentTimerRef.current = window.setTimeout(() => {
      const sent = sendPayload({
        type: 'tournamentMsg',
        message: `Match starting: ${firstPlayer} vs ${secondPlayer} (Stage: ${stage})`,
      });
      if (sent) {
        lastTournamentSigRef.current = sig;
      }
      tournamentTimerRef.current = null;
    }, 5000);

    return () => {
      if (tournamentTimerRef.current) {
        clearTimeout(tournamentTimerRef.current);
        tournamentTimerRef.current = null;
      }
    };
  }, [isOpen, firstPlayer, secondPlayer, stage, sendPayload]);

  // autoscroll
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!inviteAcceptedSignal) return;
    console.debug('[ChatUI] inviteAcceptedSignal detected', { inviteAcceptedSignal });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      console.debug('[ChatUI] navigating to /pong/online after invite acceptance');
      navigate('/pong/online', { state: { timestamp: Date.now() } });
      onClose();
      acknowledgeInviteAcceptedSignal();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [acknowledgeInviteAcceptedSignal, inviteAcceptedSignal, navigate, onClose]);

  // ---------- send message helper ----------
  const sendMessage = () => {
    const text = input.trim();
    if (!text) return;

    const result = sendChatMessage(text, dmTarget ? { to: dmTarget } : undefined);
    if (result === 'sent') {
      if (dmTarget) {
        setDmTarget(null);
      }
      setInput('');
      return;
    }

    if (result === 'disconnected') {
      addSystemMessage('Unable to send message right now. Please try again soon.');
    }
  };

  const handleAcceptInvite = (inviteId: string) => {
    acceptInvite(inviteId);
  };

  const handleDeclineInvite = (inviteId: string) => {
    declineInvite(inviteId);
  };

  const handleAction = async (action: string, targetUser: string) => {
    switch (action) {
      case 'Send private message':
        setDmTarget(targetUser);
        break;
      case 'Block user':
        sendPayload({ type: 'blockUser', username: targetUser });
        break;
      case 'Unblock user':
        sendPayload({ type: 'unblockUser', username: targetUser });
        break;
      case 'Invite to 1v1':
        sendPayload({ type: 'inviteUser', username: targetUser });
        break;
      case 'View profile': {
        (async () => {
          setProfileLoading(true);
          setProfileOpen(true);
          try {
            const uid = await fetchUserUuidByUsername(authAxios, targetUser);
            if (!uid) {
              addSystemMessage(`Invalid or missing profile for ${targetUser}`);
              setProfileData(null);
              setProfileLoading(false);
              return;
            }

            const res = await authAxios.get(`/api/users/${uid}`);
            setProfileData(res.data ?? null);
          } catch (err) {
            console.error('Error fetching profile:', err);
            addSystemMessage(`Failed to load profile for ${targetUser}`);
            setProfileData(null);
          } finally {
            setProfileLoading(false);
          }
        })();
        break;
      }
    }
  };

  const handleOpenFullProfile = (id: string) => {
    if (!id) return;
    const path = location.pathname || '';
    const inOnline = path.startsWith('/pong/online');
    const inTournament = path.startsWith('/pong/tournaments');

    if (inOnline || inTournament) {
      setPendingNavId(id);
      setShowConfirmDialog(true);
      return;
    }

    navigate(`/users/${id}`);
    setProfileOpen(false);
    onClose();
  };

  // ---------- UI render ----------
  const panelStateCls = isOpen
    ? 'pointer-events-auto opacity-100 translate-y-0 scale-100'
    : 'pointer-events-none opacity-0 translate-y-4 scale-[0.98]';

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={`Live Chat (${displayChannel})`}
      aria-hidden={!isOpen}
      data-state={isOpen ? 'open' : 'closed'}
      className={`fixed inset-x-3 bottom-3 z-[70] flex h-[85vh] max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-white/20 text-white shadow-2xl backdrop-blur-md transition duration-200 ease-out sm:inset-auto sm:bottom-6 sm:left-auto sm:right-6 sm:h-[40rem] sm:w-[36rem] ${panelStateCls} border-white/10 bg-gray-900/20`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-3 py-2">
        <h3 className="font-semibold">Live Chat ({displayChannel})</h3>
        <button onClick={onClose} className="p-1 hover:text-red-400">
          <X size={18} />
        </button>
      </div>

      {profileOpen && (
        <ChatProfile
          profileData={profileData}
          loading={profileLoading}
          onClose={() => {
            setProfileOpen(false);
            setProfileData(null);
            setProfileLoading(false);
          }}
          onOpenFullProfile={(id) => handleOpenFullProfile(id)}
        />
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          {messages.map((msg, idx) => {
            if (msg.system) {
              if (msg.inviteId && pendingInvites.has(msg.inviteId)) {
                return (
                  <div key={idx} className="rounded bg-blue-900/10 p-2">
                    <div className="italic text-blue-200">{msg.message}</div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="text-xs"
                        onClick={() => handleAcceptInvite(msg.inviteId!)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleDeclineInvite(msg.inviteId!)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={idx} className="italic text-gray-400">
                  {msg.message}
                </div>
              );
            }

            if (msg.from && blocked.has(msg.from)) return null;

            const isMe = msg.from === chatUsername;
            const isPrivate = msg.type === 'privateMessage' || msg.type === 'dm';
            const containerClass = isPrivate
              ? isMe
                ? 'bg-purple-700/60 text-purple-100'
                : 'bg-pink-700/60 text-pink-100'
              : 'bg-white/10 text-white/90';

            return (
              <div
                key={idx}
                className={`flex items-center justify-between rounded px-2 py-1 ${containerClass}`}
              >
                <div>
                  <span className="font-semibold">{msg.from}</span>
                  <span className="ml-2">{msg.message}</span>
                  {isPrivate && <span className="ml-2 text-xs italic">(DM)</span>}
                </div>

                {msg.from && msg.from !== chatUsername && !isPrivate && (
                  <SplitButton
                    targetUser={msg.from}
                    isBlocked={blocked.has(msg.from)}
                    onAction={handleAction}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="max-h-40 w-full flex-shrink-0 overflow-y-auto border-t border-white/20 bg-black/20 text-sm sm:max-h-none sm:w-28 sm:border-l sm:border-t-0 sm:bg-transparent">
          <div className="border-b border-white/10 p-2 font-semibold">Users</div>
          {users.map((u) => (
            <div
              key={u.username}
              className={`flex items-center justify-between gap-2 px-2 py-1 ${
                u.isBlocked
                  ? 'text-red-400'
                  : u.username === chatUsername
                    ? 'text-green-400'
                    : 'text-white/90'
              }`}
            >
              <span className="truncate">
                {u.username}
                {u.username === chatUsername ? ' (you)' : ''}
              </span>
              {u.username !== chatUsername && (
                <SplitButton
                  targetUser={u.username}
                  isBlocked={!!u.isBlocked}
                  onAction={handleAction}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-white/20 px-2 py-2">
        {dmTarget && (
          <div className="mr-2 flex items-center gap-2 rounded bg-purple-900/40 px-2 py-1 text-xs text-purple-200">
            To {dmTarget}
            <button
              onClick={() => setDmTarget(null)}
              className="ml-1 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        <input
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder={dmTarget ? `Message to ${dmTarget}...` : 'Type a message...'}
          disabled={cooldown}
        />

        <button
          onClick={sendMessage}
          className={`ml-2 px-3 ${cooldown ? 'text-gray-500' : 'text-indigo-400 hover:text-indigo-300'}`}
          disabled={cooldown}
        >
          Send
        </button>
      </div>

      {/* Rate-limit indicator */}
      {cooldown && (
        <div className="border-t border-white/10 bg-black/20 px-3 py-1 text-xs text-yellow-300">
          You're sending messages too fast — please wait a moment.
        </div>
      )}

      <ConfirmDialog
        open={showConfirmDialog}
        title="Leave current session?"
        description="You are currently in a live game or tournament session — opening the full profile will navigate away and you may lose progress. Continue?"
        confirmLabel="Continue"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={() => {
          if (pendingNavId) {
            navigate(`/users/${pendingNavId}`);
            setProfileOpen(false);
            onClose();
          }
          setShowConfirmDialog(false);
          setPendingNavId(null);
        }}
        onCancel={() => {
          setShowConfirmDialog(false);
          setPendingNavId(null);
        }}
      />
    </div>
  );
}
