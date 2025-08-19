// src/types.ts
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  wins: number;
  losses: number;
  createdAt: string;
}
