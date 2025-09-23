import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import SplitButton from './ui/SplitButton';

// WS endpoint (nginx proxy or direct)
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8080/chat`;

type ChatMessage = {
  from?: string;
  message: string;
  system?: boolean;
};

type ChatProps = {
  onClose: () => void;
  username?: string;
  channel: string; //
  size?: 'sm' | 'md' | 'lg'; //
  defaultOpen?: boolean; //
};

const sizeClasses = {
  sm: 'h-64 w-64',
  md: 'h-96 w-80', // your current default
  lg: 'h-[32rem] w-[28rem] bottom-6 right-6',
};

const Chat: React.FC<ChatProps> = ({
  onClose,
  username = 'Player',
  channel,
  size = 'md',
  defaultOpen = true,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const { user } = useAppContext();
  const chatUsername = user?.username || username;

  useEffect(() => {
    if (!defaultOpen) return; // only connect if open by default or later toggled
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Tell server our username
      ws.send(JSON.stringify({ type: 'setName', username: chatUsername }));
      // Join the specific channel
      ws.send(JSON.stringify({ type: 'joinChannel', channel }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat') {
        setMessages((prev) => [...prev, { from: data.from, message: data.message }]);
      } else if (data.type === 'userJoined') {
        setMessages((prev) => [
          ...prev,
          { message: `✅ ${data.username} joined ${channel}`, system: true },
        ]);
      } else if (data.type === 'userLeft') {
        setMessages((prev) => [
          ...prev,
          { message: `❌ ${data.username} left ${channel}`, system: true },
        ]);
      } else if (data.type === 'connected') {
        console.log(`[CHAT] Connected with id: ${data.clientId}`);
      } else if (data.type === 'channelJoined') {
        console.log(`[CHAT] Joined channel: ${data.channel}`);
      }
    };

    ws.onclose = () => {
      setMessages((prev) => [...prev, { message: '⚠️ Disconnected from chat', system: true }]);
    };

    return () => {
      ws.close();
    };
  }, [channel, chatUsername, defaultOpen]);

  const sendMessage = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && input.trim() !== '') {
      wsRef.current.send(JSON.stringify({ type: 'chat', message: input.trim() }));
      setInput('');
    }
  };

  if (!defaultOpen) return null; // don’t render if closed by default

  return (
    <motion.div
      className={`fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-white/30 bg-gray-900/95 text-white shadow-xl backdrop-blur-md ${sizeClasses[size]}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-3 py-2">
        <h3 className="font-semibold">Live Chat ({channel})</h3>
        <button onClick={onClose} className="p-1 hover:text-red-400">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {messages.map((msg, idx) => (
          <div key={idx} className="rounded bg-white/10 px-2 py-1 text-white/90">
            {msg.system ? (
              <span>{msg.message}</span>
            ) : (
              <>
                <span className="font-semibold">{msg.from}</span>
                <SplitButton />
                <span>{msg.message}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex border-t border-white/20">
        <input
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage} className="px-3 text-indigo-400 hover:text-indigo-300">
          Send
        </button>
      </div>
    </motion.div>
  );
};

export default Chat;
