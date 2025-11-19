import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { wsUrl } from '../utils/url';
import { useAppContext } from './AppContext';

const WS_URL = wsUrl('/chat');

type RealtimeSocketContextValue = {
  send: (payload: Record<string, unknown>) => boolean;
  subscribe: (handler: (data: any) => void) => () => void;
  readyState: number;
};

const RealtimeSocketContext = createContext<RealtimeSocketContextValue | null>(null);

type RealtimeSocketProviderProps = {
  children: React.ReactNode;
};

export function RealtimeSocketProvider({ children }: RealtimeSocketProviderProps) {
  const { user } = useAppContext();
  const userUuid = user?.uuid ?? null;
  const username = user?.username ?? 'Player';

  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<Set<(data: any) => void>>(new Set());
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);

  useEffect(() => {
    if (!userUuid) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setReadyState(WebSocket.OPEN);
      ws.send(JSON.stringify({ type: 'setName', username }));
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        console.warn('[RealtimeSocket] malformed message', ev.data);
        return;
      }

      // Notify all registered handlers
      messageHandlersRef.current.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error('[RealtimeSocket] handler error:', err);
        }
      });
    };

    ws.onerror = (err) => {
      console.error('[RealtimeSocket] WebSocket error:', err);
    };

    ws.onclose = () => {
      setReadyState(WebSocket.CLOSED);
      wsRef.current = null;
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [userUuid, username]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const subscribe = useCallback((handler: (data: any) => void) => {
    messageHandlersRef.current.add(handler);
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  const value = useMemo<RealtimeSocketContextValue>(
    () => ({
      send,
      subscribe,
      readyState,
    }),
    [send, subscribe, readyState],
  );

  return <RealtimeSocketContext.Provider value={value}>{children}</RealtimeSocketContext.Provider>;
}

export function useRealtimeSocket() {
  const ctx = useContext(RealtimeSocketContext);
  if (!ctx) {
    throw new Error('useRealtimeSocket must be used within a RealtimeSocketProvider');
  }
  return ctx;
}
