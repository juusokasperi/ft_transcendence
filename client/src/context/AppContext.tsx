// src/context/AppContext.tsx
import axios from "axios";
import type { AxiosInstance } from "axios";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../hooks/useUser";
import { useAuth } from "../hooks/useAuth";
import type { User } from "../types";

axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL;

interface AppContextType {
  navigate: ReturnType<typeof useNavigate>;
  user: User | null;
  getToken: () => Promise<string | null>;
  login: (user: User, token: string) => void;
  logout: () => void;
  axios: AxiosInstance;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const { getToken, login: authLogin, logout: authLogout } = useAuth();

  // wrapper: persiste token (authLogin) + actualiza estado in-memory (setUser)
  const login = (userData: User, token: string) => {
    authLogin(userData, token); // guarda en localStorage
    setUser(userData); // actualiza estado react
  };

  const logout = () => {
    authLogout();
    setUser(null);
    navigate("/");
  };

  // Opcional: interceptor para adjuntar token automáticamente
  axios.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return (
    <AppContext.Provider value={{ navigate, user, getToken, login, logout, axios }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppProvider");
  return ctx;
};
