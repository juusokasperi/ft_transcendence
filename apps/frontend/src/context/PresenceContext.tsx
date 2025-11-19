import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAppContext } from './AppContext';
import { useRealtimeSocket } from './RealtimeSocketContext';

export type UserItem = {
  userId: string;
  userUuid: string;
  username: string;
};

type PresenceContextValue = {
  users: UserItem[];
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

type PresenceProviderProps = {
  children: React.ReactNode;
};

export function PresenceProvider({ children }: PresenceProviderProps) {
  const { user } = useAppContext();
  const userUuid = user?.uuid ?? null;
  const username = user?.username ?? 'Player';
  const { subscribe } = useRealtimeSocket();

  const [users, setUsers] = useState<UserItem[]>([]);

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
        map.set(key, normalized);
      }
      if (!map.has(username)) {
        map.set(username, {
          userId: 'self',
          userUuid: userUuid ?? 'self',
          username: username,
        });
      }
      return Array.from(map.values());
    },
    [username, userUuid],
  );

  useEffect(() => {
    if (!userUuid) {
      setUsers([]);
      return;
    }

    const unsubscribe = subscribe((data: any) => {
      // Handle user list updates
      if (data.type === 'userList' && Array.isArray(data.users)) {
        setUsers(normalizeUsers(data.users));
        return;
      }

      // Handle user joined
      if (data.type === 'userJoined') {
        setUsers((prev) => {
          const exists = prev.some((u) => u.username === data.username);
          if (exists) return prev;
          return [
            ...prev,
            {
              userId: data.userId || data.username,
              userUuid: data.userUuid || data.userId || data.username,
              username: data.username,
            },
          ];
        });
        return;
      }

      // Handle user left
      if (data.type === 'userLeft') {
        setUsers((prev) => prev.filter((u) => u.username !== data.username));
        return;
      }
    });

    return unsubscribe;
  }, [normalizeUsers, subscribe, userUuid]);

  const value = useMemo<PresenceContextValue>(
    () => ({
      users,
    }),
    [users],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return ctx;
}
