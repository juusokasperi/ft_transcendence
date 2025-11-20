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
  isConnected: boolean;
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
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userUuid) {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setReadyState(ws.readyState);
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        console.warn('[RealtimeSocket] malformed message', ev.data);
        return;
      }

      if (data.type === 'connected') {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'setName', username }));
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
      setReadyState(ws.readyState);
      console.error('[RealtimeSocket] WebSocket error:', err);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
      wsRef.current = null;
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [userUuid, username]);

  const send = useCallback(
    (payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || !isConnected) return false;
      ws.send(JSON.stringify(payload));
      return true;
    },
    [isConnected],
  );

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
      isConnected,
    }),
    [send, subscribe, readyState, isConnected],
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
