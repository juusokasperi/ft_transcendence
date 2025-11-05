export interface Client {
  id: string;
  socket: WebSocket;
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
