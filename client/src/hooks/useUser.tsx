import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';

export const useUser = () => {
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    const s = localStorage.getItem('user');
    if (s) {
      try {
        setUserState(JSON.parse(s));
      } catch {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
  }, []);

  return { user, setUser };
};
