import { useState, useEffect, useCallback } from "react";
import type { User } from "../types";

export const useUser = () => {
  const [user, setUserState] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUserState(JSON.parse(stored) as User);
      } catch {
        localStorage.removeItem("user");
      }
    }
  }, []);

  const setUser: React.Dispatch<React.SetStateAction<User | null>> = useCallback(
    (value) => {
      // Handle function updater
      if (typeof value === "function") {
        setUserState((prev) => {
          const newUser = (value as (prev: User | null) => User | null)(prev);
          if (newUser) {
            localStorage.setItem("user", JSON.stringify(newUser));
          } else {
            localStorage.removeItem("user");
          }
          return newUser;
        });
      } else {
        // Handle direct object
        setUserState(value);
        if (value) {
          localStorage.setItem("user", JSON.stringify(value));
        } else {
          localStorage.removeItem("user");
        }
      }
    },
    []
  );

  return { user, setUser };
};
// src/hooks/useUser.ts