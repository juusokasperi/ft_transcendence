import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';

export const useUser = () => {
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    const s = localStorage.getItem('user');
    if (s) {
      try {
        const parsed = JSON.parse(s) as User | null;
        if (parsed) {
          setUserState({
            ...parsed,
            tfaEnabled: Boolean((parsed as any).tfaEnabled ?? (parsed as any).tfa ?? false),
          });
        }
      } catch {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const setUser = useCallback<React.Dispatch<React.SetStateAction<User | null>>>((update) => {
    setUserState((prev) => {
      const next =
        typeof update === 'function' ? (update as (p: User | null) => User | null)(prev) : update;

      if (next) localStorage.setItem('user', JSON.stringify(next));
      else localStorage.removeItem('user');

      return next;
    });
  }, []);

  return { user, setUser };
};
