import { useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import type { User } from '../types';

export const useUser = () => {
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    // 1) normal path: hydrate from localStorage if present
    let stored = localStorage.getItem('user');

    // 2) fallback: if not in LS but present in cookie (after Google redirect),
    //    use cookie value and copy it to LS so the app behaves "like normal".
    if (!stored) {
      const cookieUser = Cookies.get('user');
      if (cookieUser) stored = cookieUser;
    }

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as User;
        setUserState(parsed);
        // keep LS in sync if we came from cookie
        if (!localStorage.getItem('user')) {
          localStorage.setItem('user', JSON.stringify(parsed));
        }
      } catch {
        // in case the cookie string looks url-encoded (rare; js-cookie usually decodes)
        try {
          const parsed = JSON.parse(decodeURIComponent(stored)) as User;
          setUserState(parsed);
          localStorage.setItem('user', JSON.stringify(parsed));
        } catch {
          localStorage.removeItem('user');
        }
      }
    }

    // 3) set axios Authorization from cookie token (if present)
    const token = Cookies.get('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, []);

  // your existing setUser that also syncs localStorage
  const setUser = useCallback((value: User | null) => {
    setUserState(value);
    if (value) {
      localStorage.setItem('user', JSON.stringify(value));
    } else {
      localStorage.removeItem('user');
    }
  }, []);

  return { user, setUser };
};
// src/hooks/useUser.ts
