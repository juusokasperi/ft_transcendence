import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAppContext } from './AppContext';
import { useRealtimeSocket } from './RealtimeSocketContext';
import { usePresence, type UserItem as UserItemBase } from './PresenceContext';

export type ChatMessage = {
  from?: string;
  fromUuid?: string;
  to?: string;
  toUuid?: string;
  message: string;
  system?: boolean;
  type?: string;
  inviteId?: string;
};

export type UserItem = UserItemBase & {
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
  lastSeenPrivateMessageCountRef: React.MutableRefObject<number>;
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

  const { send, isConnected, subscribe, readyState } = useRealtimeSocket();
  const { users: presenceUsers } = usePresence();

  const cooldownTimeoutRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Map<string, string>>(new Map());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const blockedRef = useRef(blocked);
  const [cooldown, setCooldown] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [inviteAcceptedSignal, setInviteAcceptedSignal] = useState(0);
  const lastSeenPrivateMessageCountRef = useRef(0);
  const acknowledgeInviteAcceptedSignal = useCallback(() => {
    setInviteAcceptedSignal(0);
  }, []);

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  const resetChannelState = useCallback(() => {
    setMessages([]);
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
    if (!channel || !isConnected) return;
    send({ type: 'joinChannel', channel });
  }, [channel, isConnected, send]);

  useEffect(() => {
    return () => {
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
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

  useEffect(() => {
    if (!userUuid || !channel) return;

    const unsubscribe = subscribe((data: any) => {
      if (data.type === 'chat') {
        if (data.fromUuid && blockedRef.current.has(data.fromUuid)) return;
        setMessages((prev) => [...prev, { ...data, type: 'chat' }]);
        return;
      }
      if (data.type === 'blockedList' && Array.isArray(data.uuids)) {
        const newBlocked: Set<string> = new Set<string>(data.uuids);
        blockedRef.current = newBlocked;
        setBlocked(newBlocked);
        return;
      }

      if (data.type === 'privateMessage' || data.type === 'dm') {
        if (data.fromUuid && blockedRef.current.has(data.fromUuid)) return;
        setMessages((prev) => [
          ...prev,
          {
            from: data.from,
            fromUuid: data.fromUuid,
            to: data.to,
            toUuid: data.toUuid,
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
          copy.add(data.uuid);
          return copy;
        });
        addSystemMessage(`You blocked ${data.username}`);
        return;
      }

      if (data.type === 'userUnblocked') {
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.delete(data.uuid);
          return copy;
        });
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
        setPendingInvites((prev) => new Map(prev).set(data.inviteId, data.from));
        addSystemMessage(`Game invite from ${data.from}`, { inviteId: data.inviteId });
        return;
      }

      if (data.type === 'inviteSent') {
        addSystemMessage(`Invite sent to ${data.to}`);
        return;
      }

      if (data.type === 'inviteAccepted') {
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
        if ('reason' in data && typeof data.reason === 'string' && data.reason.length > 0) {
          addSystemMessage(data.reason);
        } else if (data.username) {
          addSystemMessage(`${data.username} left the chat, invite cancelled`);
        } else {
          addSystemMessage(`Invite cancelled`);
        }
        return;
      }

      if (data.type === 'profile') {
        addSystemMessage(`Profile: ${data.username} (id: ${data.userId})`);
        return;
      }

      if (data.type === 'error') {
        addSystemMessage(`${data.message}`);
      }
    });

    return unsubscribe;
  }, [addSystemMessage, channel, chatUsername, subscribe, userUuid]);

  const sendPayload = useCallback(
    (payload: Record<string, unknown>) => {
      return send(payload);
    },
    [send],
  );

  const sendChatMessage = useCallback(
    (message: string, options?: { to?: string }) => {
      const text = message.trim();
      if (!text) return 'empty';

      if (readyState !== WebSocket.OPEN) return 'disconnected';

      if (!tryConsumeSendSlot()) {
        addSystemMessage("Slow down — you're sending messages too fast. Wait 2s.");
        return 'cooldown';
      }

      const payload = options?.to
        ? { type: 'privateMessage', to: options.to, message: text }
        : { type: 'chat', message: text };

      if (!send(payload)) {
        return 'disconnected';
      }

      return 'sent';
    },
    [addSystemMessage, send, tryConsumeSendSlot, readyState],
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

  const users: UserItem[] = useMemo(
    () =>
      presenceUsers.map((u) => ({
        ...u,
        isBlocked: blocked.has(u.userUuid),
      })),
    [blocked, presenceUsers],
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
      lastSeenPrivateMessageCountRef,
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
      lastSeenPrivateMessageCountRef,
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
