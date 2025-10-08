// src/types.ts
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  avatar: string | null;
  wins: number;
  losses: number;
  createdAt: string;
  tfaEnabled: boolean;
}

export type Friendship = 'friends' | 'request_sent' | 'request_received' | 'none';
