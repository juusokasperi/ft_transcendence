import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAppContext } from "../context/AppContext";

const WS_URL = "ws://localhost:8080/chat"; // via nginx proxy


const Chat: React.FC<{ onClose: () => void; username?: string }> = ({
  onClose,
  username = "Player",
}) => {
  const [messages, setMessages] = useState<string[]>([]);
  const [sender, setSender] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const { axios, user } = useAppContext();
  const chatUsername = user?.username || "Player";

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Tell server our username
      ws.send(JSON.stringify({ type: "setName", username: chatUsername }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "chat") {
        setMessages((prev) => [...prev, `${data.message}`]);
        setSender(data.from);
      } else if (data.type === "userJoined") {
        setMessages((prev) => [...prev, `✅ ${data.username} joined the chat`]);
      } else if (data.type === "userLeft") {
        setMessages((prev) => [...prev, `❌ ${data.username} left the chat`]);
      } else if (data.type === "connected") {
        console.log(`[CHAT] Connected with id: ${data.clientId}`);
      }
    };

    ws.onclose = () => {
      setMessages((prev) => [...prev, "⚠️ Disconnected from chat"]);
    };

    return () => {
      ws.close();
    };
  }, [username]);

  const sendMessage = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && input.trim() !== "") {
      wsRef.current.send(JSON.stringify({ type: "chat", message: input.trim() }));
      setInput("");
    }
  };

  return (
    <motion.div
      className="fixed bottom-6 right-6 z-50 flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-white/30 bg-gray-900/95 text-white shadow-xl backdrop-blur-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-3 py-2">
        <h3 className="font-semibold">Live Chat</h3>
        <button onClick={onClose} className="p-1 hover:text-red-400">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {messages.map((msg, idx) => (
          <div key={idx} className="rounded bg-white/10 px-2 py-1 text-white/90">
            {sender}: {msg}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex border-t border-white/20">
        <input
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
        />
        <button
          onClick={sendMessage}
          className="px-3 text-indigo-400 hover:text-indigo-300"
        >
          Send
        </button>
      </div>
    </motion.div>
  );
};

export default Chat;
