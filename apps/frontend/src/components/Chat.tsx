import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import SplitButton from './ui/SplitButton';
import axios, { type AxiosInstance } from 'axios';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8080/chat`;

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
type ChatMessage = {
  from?: string;
  to?: string;
  message: string;
  system?: boolean;
  type?: string; // "chat" | "privateMessage" | "dm" | undefined
};

type UserItem = {
  userId: string;
  username: string;
  isBlocked?: boolean;
};

type ChatProps = {
  onClose: () => void;
  username?: string;
  channel: string;
  size?: 'sm' | 'md' | 'lg';
  defaultOpen?: boolean;
};

const sizeClasses = {
  sm: 'h-64 w-80',
  md: 'h-96 w-[36rem]',
  lg: 'h-[32rem] w-[48rem] bottom-6 right-6',
};

export default function Chat({
  onClose,
  username = 'Player',
  channel,
  size = 'md',
  defaultOpen = true,
}: ChatProps) {
  const { user, navigate } = useAppContext();

  const chatUsername = user?.username || username;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [input, setInput] = useState('');
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Rate limiter: allow 3 messages, then cooldown for 2000ms
  const [sentCount, setSentCount] = useState(0);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimeoutRef = useRef<number | null>(null);

  // keep blockedRef for handler closures if needed
  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  // normalize server user array -> UserItem[], dedupe by username, ensure self present
  const normalizeUsers = (list: Array<any>): UserItem[] => {
    const map = new Map<string, UserItem>();
    for (const raw of list) {
      if (!raw) continue;
      const normalized =
        typeof raw === 'string'
          ? { userId: raw, username: raw }
          : {
              userId: raw.userId ?? String(raw.username ?? Math.random()),
              username: raw.username ?? String(raw.userId),
            };
      const key = normalized.username.trim();
      map.set(key, { ...normalized, isBlocked: blockedRef.current.has(key) });
    }
    if (!map.has(chatUsername)) {
      map.set(chatUsername, {
        userId: 'self',
        username: chatUsername,
        isBlocked: blockedRef.current.has(chatUsername),
      });
    }
    return Array.from(map.values());
  };

  // establish websocket and handlers
  useEffect(() => {
    if (!defaultOpen) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'setName', username: chatUsername }));
      ws.send(JSON.stringify({ type: 'joinChannel', channel }));
      // server should send 'userList' after join (authoritative)
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        console.warn('[CHAT] malformed message', ev.data);
        return;
      }

      // authoritative user list
      if (data.type === 'userList' && Array.isArray(data.users)) {
        setUsers(normalizeUsers(data.users));
        return;
      }

      // public chat
      if (data.type === 'chat') {
        if (data.from && blockedRef.current.has(data.from)) return;
        setMessages((prev) => [...prev, { ...data, type: 'chat' }]);
        return;
      }

      // private message from server (server uses `privateMessage` in your ws)
      if (data.type === 'privateMessage' || data.type === 'dm') {
        if (data.from && blockedRef.current.has(data.from)) return;
        // server echoes to both sender and receiver — push what server sends
        setMessages((prev) => [
          ...prev,
          {
            from: data.from,
            to: data.to,
            message: data.message,
            type: 'privateMessage',
          },
        ]);
        return;
      }

      // user join/leave: show system message only (userList will update sidebar)
      if (data.type === 'userJoined') {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `✅ ${data.username} joined ${channel}` },
        ]);
        return;
      }
      if (data.type === 'userLeft') {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `❌ ${data.username} left ${channel}` },
        ]);
        return;
      }

      // block/unblock confirmations
      if (data.type === 'userBlocked') {
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.add(data.username);
          return copy;
        });
        setUsers((prev) =>
          prev.map((u) => (u.username === data.username ? { ...u, isBlocked: true } : u)),
        );
        setMessages((prev) => [
          ...prev,
          { system: true, message: `🚫 You blocked ${data.username}` },
        ]);
        return;
      }
      if (data.type === 'userUnblocked') {
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.delete(data.username);
          return copy;
        });
        setUsers((prev) =>
          prev.map((u) => (u.username === data.username ? { ...u, isBlocked: false } : u)),
        );
        setMessages((prev) => [
          ...prev,
          { system: true, message: `✅ You unblocked ${data.username}` },
        ]);
        return;
      }

      // invite/profile/error/system
      if (data.type === 'inviteGame') {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `🎮 Game invite from ${data.from}` },
        ]);
        return;
      }
      if (data.type === 'profile') {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `👤 Profile: ${data.username} (id: ${data.userId})` },
        ]);
        return;
      }
      if (data.type === 'error') {
        setMessages((prev) => [...prev, { system: true, message: `⚠️ ${data.message}` }]);
        return;
      }
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [channel, chatUsername, defaultOpen]);

  // autoscroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // cleanup cooldown timers on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
    };
  }, []);

  // rate limiter: invoked whenever we attempt to send a message
  const tryConsumeSendSlot = (): boolean => {
    if (cooldown) return false;
    if (sentCount < 2) {
      setSentCount((c) => c + 1);
      return true;
    }
    // this is the 3rd send => start cooldown after sending this one
    setSentCount((c) => c + 1);
    setCooldown(true);
    // set a timeout to reset counters after 2000ms
    cooldownTimeoutRef.current = window.setTimeout(() => {
      setSentCount(0);
      setCooldown(false);
      cooldownTimeoutRef.current = null;
    }, 2000);
    return true;
  };

  const sendMessage = () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const text = input.trim();
    if (!text) return;

    // check rate limiting
    if (!tryConsumeSendSlot()) {
      // optionally show a quick system message or toast
      setMessages((prev) => [
        ...prev,
        { system: true, message: "⛔ Slow down — you're sending messages too fast. Wait 2s." },
      ]);
      return;
    }

    if (dmTarget) {
      // send private message to server; do NOT optimistic-add (server will echo)
      ws.send(JSON.stringify({ type: 'privateMessage', to: dmTarget, message: text }));
      // clear target and input
      setDmTarget(null);
    } else {
      // public chat
      ws.send(JSON.stringify({ type: 'chat', message: text }));
    }

    setInput('');
  };

  const handleAction = async (action: string, targetUser: string) => {
    const ws = wsRef.current;
    // actions should be allowed regardless of cooldown (they don't send many messages)
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    switch (action) {
      case 'Send private message':
        setDmTarget(targetUser);
        break;
      case 'Block user':
        ws.send(JSON.stringify({ type: 'blockUser', username: targetUser }));
        break;
      case 'Unblock user':
        ws.send(JSON.stringify({ type: 'unblockUser', username: targetUser }));
        break;
      case 'Invite to game':
        setMessages((prev) => [
          ...prev,
          { system: true, message: `🎮 Invite sent to ${targetUser}` },
        ]);
        break;
      case 'View profile': {
        const uid = await fetchUserUuidByUsername(axios, targetUser);
        if (uid) {
          navigate(`/users/${uid}`);
        } else {
          setMessages((prev) => [
            ...prev,
            { system: true, message: `⚠️ Invalid or missing profile for ${targetUser}` },
          ]);
        }
        break;
      }
    }
  };

  if (!defaultOpen) return null;

  return (
    <motion.div
      className={`fixed bottom-6 right-6 z-50 flex h-[80vh] w-[95vw] flex-col overflow-hidden border border-white/20 bg-gray-900/95 text-white shadow-2xl backdrop-blur-md transition-all duration-300 ease-in-out sm:h-[40rem] sm:w-[36rem] sm:rounded-2xl`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-3 py-2">
        <h3 className="font-semibold">Live Chat ({channel})</h3>
        <button onClick={onClose} className="p-1 hover:text-red-400">
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Messages area */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
          {messages.map((msg, idx) => {
            if (msg.system) {
              return (
                <div key={idx} className="italic text-gray-400">
                  {msg.message}
                </div>
              );
            }

            // hide blocked user's messages
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

                {/* show actions only on public messages from others */}
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
        <div className="w-28 overflow-y-auto border-l border-white/20 bg-transparent text-sm">
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
    </motion.div>
  );
}
