import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { wsUrl } from '../utils/url';
import { useAppContext } from './AppContext';

const WS_URL = wsUrl('/chat');

export type ChatMessage = {
  from?: string;
  to?: string;
  message: string;
  system?: boolean;
  type?: string;
  inviteId?: string;
};

export type UserItem = {
  userId: string;
  userUuid: string;
  username: string;
  isBlocked?: boolean;
};

export type SendMessageResult = 'sent' | 'cooldown' | 'disconnected' | 'empty';

type ChatContextValue = {
  channel: string;
  chatUsername: string;
  messages: ChatMessage[];
  users: UserItem[];
  blocked: Set<string>;
  pendingInvites: Map<string, string>;
  cooldown: boolean;
  sendChatMessage: (message: string, options?: { to?: string }) => SendMessageResult;
  sendPayload: (payload: Record<string, unknown>) => boolean;
  addSystemMessage: (message: string) => void;
  acceptInvite: (inviteId: string) => void;
  declineInvite: (inviteId: string) => void;
  inviteAcceptedSignal: number;
  acknowledgeInviteAcceptedSignal: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

type ChatProviderProps = {
  channel: string;
  children: React.ReactNode;
};

export function ChatProvider({ channel, children }: ChatProviderProps) {
  const { user } = useAppContext();
  const userUuid = user?.uuid ?? null;
  const chatUsername = user?.username ?? 'Player';

  const wsRef = useRef<WebSocket | null>(null);
  const cooldownTimeoutRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Map<string, string>>(new Map());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const blockedRef = useRef(blocked);
  const [cooldown, setCooldown] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [inviteAcceptedSignal, setInviteAcceptedSignal] = useState(0);
  const acknowledgeInviteAcceptedSignal = useCallback(() => {
    setInviteAcceptedSignal(0);
  }, []);

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  const resetChannelState = useCallback(() => {
    setMessages([]);
    setUsers([]);
    setPendingInvites(new Map());
    setBlocked(new Set());
    setSentCount(0);
    setCooldown(false);
  }, []);

  useEffect(() => {
    resetChannelState();
  }, [channel, resetChannelState]);

  useEffect(() => {
    if (!userUuid) {
      resetChannelState();
    }
  }, [resetChannelState, userUuid]);

  useEffect(() => {
    return () => {
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, []);

  const tryConsumeSendSlot = useCallback(() => {
    if (cooldown) return false;
    if (sentCount < 2) {
      setSentCount((prev) => prev + 1);
      return true;
    }

    setSentCount((prev) => prev + 1);
    setCooldown(true);
    cooldownTimeoutRef.current = window.setTimeout(() => {
      setSentCount(0);
      setCooldown(false);
      cooldownTimeoutRef.current = null;
    }, 2000);
    return true;
  }, [cooldown, sentCount]);

  const addSystemMessage = useCallback((message: string, extras?: Partial<ChatMessage>) => {
    setMessages((prev) => [...prev, { system: true, message, ...extras }]);
  }, []);

  const normalizeUsers = useCallback(
    (list: Array<any>): UserItem[] => {
      const map = new Map<string, UserItem>();
      for (const raw of list) {
        if (!raw) continue;
        const normalized =
          typeof raw === 'string'
            ? { userId: raw, userUuid: raw, username: raw }
            : {
                userId: raw.userId ?? String(raw.username ?? Math.random()),
                userUuid: raw.userUuid ?? raw.uuid ?? raw.userId ?? '',
                username: raw.username ?? String(raw.userId ?? ''),
              };
        const key = normalized.username.trim();
        map.set(key, { ...normalized, isBlocked: blockedRef.current.has(key) });
      }
      if (!map.has(chatUsername)) {
        map.set(chatUsername, {
          userId: 'self',
          userUuid: userUuid ?? 'self',
          username: chatUsername,
          isBlocked: blockedRef.current.has(chatUsername),
        });
      }
      return Array.from(map.values());
    },
    [chatUsername],
  );

  useEffect(() => {
    if (!userUuid || !channel) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      //console.debug('[ChatContext] websocket open', { channel });
      ws.send(JSON.stringify({ type: 'setName', username: chatUsername }));
      ws.send(JSON.stringify({ type: 'joinChannel', channel }));
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        console.warn('[CHAT] malformed message', ev.data);
        return;
      }

      if (data.type === 'userList' && Array.isArray(data.users)) {
        setUsers(normalizeUsers(data.users));
        return;
      }

      if (data.type === 'chat') {
        if (data.from && blockedRef.current.has(data.from)) return;
        setMessages((prev) => [...prev, { ...data, type: 'chat' }]);
        return;
      }

      if (data.type === 'privateMessage' || data.type === 'dm') {
        if (data.from && blockedRef.current.has(data.from)) return;
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

      if (data.type === 'userJoined') {
        addSystemMessage(`${data.username} joined the chat ${channel}`);
        return;
      }

      if (data.type === 'userLeft') {
        addSystemMessage(`${data.username} left the chat ${channel}`);
        return;
      }

      if (data.type === 'userBlocked') {
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.add(data.username);
          return copy;
        });
        setUsers((prev) =>
          prev.map((u) => (u.username === data.username ? { ...u, isBlocked: true } : u)),
        );
        addSystemMessage(`You blocked ${data.username}`);
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
        addSystemMessage(`You unblocked ${data.username}`);
        return;
      }

      if (data.type === 'tournamentMsg') {
        const norm = (s: string) => s.replace(/^🏓\s*/, '').trim();
        setMessages((prev) => {
          const messageExists = prev.some((msg) => norm(msg.message) === norm(data.message));
          if (messageExists) return prev;

          const payload: ChatMessage = {
            system: true,
            message: `🏓 ${data.message}`,
            type: 'tournamentMsg',
          };

          return [...prev, payload];
        });
        return;
      }

      if (data.type === 'inviteGame') {
        //console.debug('[ChatContext] inviteGame received', data);
        setPendingInvites((prev) => new Map(prev).set(data.inviteId, data.from));
        addSystemMessage(`Game invite from ${data.from}`, { inviteId: data.inviteId });
        return;
      }

      if (data.type === 'inviteSent') {
        addSystemMessage(`Invite sent to ${data.to}`);
        return;
      }

      if (data.type === 'inviteAccepted') {
        //console.debug('[ChatContext] inviteAccepted received');
        addSystemMessage(`Invite accepted. Joining game.`, { type: 'inviteAccepted' });
        setInviteAcceptedSignal(Date.now());
        return;
      }

      if (data.type === 'inviteDeclined') {
        if (data.to === chatUsername) {
          addSystemMessage(`You declined ${data.from}'s invitation.`);
        } else {
          addSystemMessage(`${data.to} declined your invitation.`);
        }
        return;
      }

      if (data.type === 'inviteExpired') {
        addSystemMessage(`Invite with ${data.username} expired`);
        return;
      }

      if (data.type === 'inviteCancelled') {
        addSystemMessage(`${data.username} left the chat, invite cancelled`);
        return;
      }

      if (data.type === 'profile') {
        addSystemMessage(`Profile: ${data.username} (id: ${data.userId})`);
        return;
      }

      if (data.type === 'error') {
        addSystemMessage(`⚠️ ${data.message}`);
      }
    };

    ws.onclose = () => {
      //console.debug('[ChatContext] websocket closed', { channel });
      wsRef.current = null;
    };

    return () => {
      //console.debug('[ChatContext] cleanup closing websocket', { channel });
      try {
        ws.close();
      } catch {}
    };
  }, [addSystemMessage, channel, chatUsername, normalizeUsers, userUuid]);

  const sendPayload = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    //console.debug('[ChatContext] sendPayload', payload);
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const sendChatMessage = useCallback(
    (message: string, options?: { to?: string }) => {
      const text = message.trim();
      if (!text) return 'empty';
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return 'disconnected';

      if (!tryConsumeSendSlot()) {
        addSystemMessage("Slow down — you're sending messages too fast. Wait 2s.");
        return 'cooldown';
      }

      if (options?.to) {
        ws.send(JSON.stringify({ type: 'privateMessage', to: options.to, message: text }));
      } else {
        ws.send(JSON.stringify({ type: 'chat', message: text }));
      }
      return 'sent';
    },
    [addSystemMessage, tryConsumeSendSlot],
  );

  const acceptInvite = useCallback(
    (inviteId: string) => {
      if (!inviteId) return;
      if (!sendPayload({ type: 'acceptInvite', inviteId })) return;
      setPendingInvites((prev) => {
        const copy = new Map(prev);
        copy.delete(inviteId);
        return copy;
      });
    },
    [sendPayload],
  );

  const declineInvite = useCallback(
    (inviteId: string) => {
      if (!inviteId) return;
      if (!sendPayload({ type: 'declineInvite', inviteId })) return;
      setPendingInvites((prev) => {
        const copy = new Map(prev);
        copy.delete(inviteId);
        return copy;
      });
    },
    [sendPayload],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      channel,
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
    }),
    [
      acceptInvite,
      addSystemMessage,
      blocked,
      channel,
      chatUsername,
      cooldown,
      declineInvite,
      inviteAcceptedSignal,
      acknowledgeInviteAcceptedSignal,
      messages,
      pendingInvites,
      sendChatMessage,
      sendPayload,
      users,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return ctx;
}
