// src/context/AppContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import type { User } from '../types';

// The baseURL is intentionally not set here because the frontend and backend are served from the same origin during development and production.
// If you need to proxy API requests to a different backend, uncomment the line below and set VITE_DEV_API_PROXY_TARGET in your environment.
//axios.defaults.baseURL = import.meta.env.VITE_DEV_API_PROXY_TARGET;
axios.defaults.withCredentials = true;

type Ctx = {
  navigate: ReturnType<typeof useNavigate>;
  user: User | null;
  login: (user: User) => void;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  axios: AxiosInstance;
  userReady: boolean;
};
const AppContext = createContext<Ctx | undefined>(undefined);

export const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const [userReady, setUserReady] = useState<boolean>(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const performClientLogout = useCallback(() => {
    setUser(null);
    setUserReady(true);
    navigate('/');
  }, [navigate, setUser, setUserReady]);

  const logout = useCallback(async () => {
    try {
      await axios.post('/api/logout');
    } catch (err) {}
    performClientLogout();
  }, [performClientLogout]);

  const buildUser = (payload: unknown): User => {
    const source = (payload ?? {}) as Record<string, unknown>;
    return {
      username: String(source.username ?? ''),
      uuid: String(source.uuid ?? ''),
      avatar: (source.avatar as string | null) ?? null,
      id: Number(source.id ?? 0),
      email: String(source.email ?? ''),
      wins: Number(source.wins ?? 0),
      losses: Number(source.losses ?? 0),
      createdAt: String(source.createdAt ?? ''),
      tfaEnabled: Boolean(source.tfa ?? source.tfaEnabled ?? false),
    };
  };

  useEffect(() => {
    axios
      .get('/api/users/me')
      .then(({ data }) => {
        setUser(buildUser(data));
      })
      .catch((error: AxiosError) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setUser(null);
        }
      })
      .finally(() => setUserReady(true));
  }, []);

  useEffect(() => {
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<{ code?: string }>) => {
        if (!error.response) return Promise.reject(error);

        const { status, data } = error.response;
        if (status !== 401) return Promise.reject(error);

        const originalConfig = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

        if (data?.code === 'token_expired' && originalConfig) {
          if (originalConfig._retry) {
            performClientLogout();
            return Promise.reject(error);
          }

          originalConfig._retry = true;

          if (!refreshPromiseRef.current) {
            refreshPromiseRef.current = axios
              .post('/api/auth/refresh')
              .then(() => {})
              .catch((refreshErr) => {
                performClientLogout();
                throw refreshErr;
              })
              .finally(() => {
                refreshPromiseRef.current = null;
              });
          }

          try {
            await refreshPromiseRef.current;
            return axios(originalConfig);
          } catch (refreshErr) {
            return Promise.reject(refreshErr);
          }
        }

        performClientLogout();
        return Promise.reject(error);
      },
    );

    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [performClientLogout]);

  const login = (data: User) => {
    setUser(buildUser(data));
    setUserReady(true);
  };

  return (
    <AppContext.Provider value={{ navigate, user, login, logout, axios, setUser, userReady }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};
