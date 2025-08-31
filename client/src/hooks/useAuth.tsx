import Cookies from "js-cookie";
import type { User } from "../types";

export const useAuth = () => {
  const getToken = async (): Promise<string | null> => {
    return Cookies.get("token") || null;
  };

  const login = (userData: User, token: string) => {
    Cookies.set("user", JSON.stringify(userData), { expires: 7, sameSite: "Strict" });
    Cookies.set("token", token, { expires: 7, sameSite: "Strict" });
  };

  const logout = () => {
    Cookies.remove("user");
    Cookies.remove("token");
  };

  return { getToken, login, logout };
};
