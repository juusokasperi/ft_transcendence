// src/types.ts
export interface User {
  id: number;
  uuid: string;
  username: string;
  nickname: string;
  wins: number;
  losses: number;
  createdAt: string; // Prisma DateTime llega como string en JSON
}
