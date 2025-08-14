// src/hooks/useUser.ts
import { useState, useEffect } from "react";
import type { User } from "../types";

export const useUser = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // carga inicial desde localStorage (si hay)
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored) as User);
      } catch {
        localStorage.removeItem("user");
      }
    }
  }, []);

  return { user, setUser };
};
