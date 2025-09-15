declare module 'ws' {
  export type RawData = any;
  export class WebSocket {
    send(data: any): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }
  export class WebSocketServer {
    constructor(options: any);
    on(event: string, listener: (...args: any[]) => void): this;
  }
}