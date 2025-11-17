import { createMatchmakingClient } from '../../../../services/matchmaking';
import type { MatchmakingMessage, TournamentSize } from './messageTypes';

type Handlers = {
  onOpen?(): void;
  onMessage?(msg: MatchmakingMessage): void;
  onError?(): void;
  onClose?(event: CloseEvent): void;
};

export class TournamentSocket {
  private client: ReturnType<typeof createMatchmakingClient> | null = null;

  connect(handlers: Handlers) {
    if (this.client) return;
    this.client = createMatchmakingClient((msg) => handlers.onMessage?.(msg), {
      onOpen: () => handlers.onOpen?.(),
      onError: () => handlers.onError?.(),
      onClose: (ev) => handlers.onClose?.(ev),
    });
  }

  close() {
    this.client?.close();
    this.client = null;
  }

  createTournament(size: TournamentSize, name?: string, alias?: string) {
    this.client?.createTournament(size, name, alias);
  }

  joinTournament(id: number | string, alias?: string) {
    this.client?.joinTournament(id, alias);
  }

  leaveTournament(id: number | string) {
    this.client?.leaveTournament(id);
  }
}
