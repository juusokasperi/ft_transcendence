import type { User } from "../types";

export const useAuth = () => {
  const getToken = async (): Promise<string | null> => {
    return localStorage.getItem("token");
  };

  const login = (userData: User, token: string) => {
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", token);
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  return { getToken, login, logout };
};
