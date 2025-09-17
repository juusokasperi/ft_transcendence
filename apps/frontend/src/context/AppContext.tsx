// src/context/AppContext.tsx
import React, { createContext, useContext, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import type { User } from '../types';

axios.defaults.baseURL = import.meta.env.VITE_DEV_API_PROXY_TARGET;
axios.defaults.withCredentials = true;

type Ctx = {
  navigate: ReturnType<typeof useNavigate>;
  user: User | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  axios: typeof axios;
};
const AppContext = createContext<Ctx | undefined>(undefined);

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate();
  const { user, setUser } = useUser();

  useEffect(() => {
    axios
      .get('/api/users/me')
      .then(({ data }) =>
        setUser({
          username: data.username,
          uuid: data.uuid,
          avatar: data.avatar ?? null,
          id: data.id ?? 0,
          email: data.email ?? '',
          wins: data.wins ?? 0,
          losses: data.losses ?? 0,
          createdAt: data.createdAt ?? '',
        }),
      )
      .catch(() => {});
  }, []);

  const login = (data: User) => {
    setUser({
      username: data.username,
      uuid: data.uuid,
      avatar: data.avatar ?? null,
      id: data.id ?? 0,
      email: data.email ?? '',
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      createdAt: data.createdAt ?? '',
    });
  };

  const logout = async () => {
    try {
      await axios.post('/api/logout');
    } catch (err) {}
    setUser(null);
    navigate('/');
  };

  return (
    <AppContext.Provider value={{ navigate, user, login, logout, axios, setUser }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};
