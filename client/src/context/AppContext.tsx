// src/context/AppContext.tsx
import React, { createContext, useContext, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import { useAuth } from '../hooks/useAuth';
import type { User } from '../types';

axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL;

type Ctx = {
  navigate: ReturnType<typeof useNavigate>;
  user: User | null;
  getToken: () => string | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  axios: typeof axios;
};
const AppContext = createContext<Ctx | undefined>(undefined);

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const { initAuth, login: authLogin, logout: authLogout, getToken } = useAuth();

  // On mount: set Authorization from cookie; if we have a token but no user → fetch /me
  useEffect(() => {
    initAuth();
    if (!localStorage.getItem('user') && getToken()) {
      axios
        .get('/api/users/me')
        .then(({ data }) =>
          setUser({ username: data.username, uuid: data.uuid, avatar: data.avatar ?? null }),
        )
        .catch(() => {});
    }
  }, []);

  // Unified login: got token → save → fetch /me → store user
  const login = async (token: string) => {
    authLogin(token);
    const { data } = await axios.get('/api/users/me');
    setUser({ username: data.username, uuid: data.uuid, avatar: data.avatar ?? null });
  };

  const logout = () => {
    authLogout();
    setUser(null);
    navigate('/');
  };

  return (
    <AppContext.Provider value={{ navigate, user, login, logout, axios, setUser, getToken }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};
