export type ChatSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: any[]) => void | Promise<void>): void;
};

export interface Client {
  id: string;
  socket: ChatSocket;
  username?: string;
  uuid: string;
  channel?: string;
  blocked: Set<string>;
}

export interface PendingInvite {
  fromUserUuid: string;
  fromUsername: string;
  toUserUuid: string;
  toUsername: string;
  createdAt: number;
}
