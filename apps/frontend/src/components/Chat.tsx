import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import SplitButton from "./ui/SplitButton";

const WS_URL = `${
  window.location.protocol === "https:" ? "wss" : "ws"
}://${window.location.hostname}:8080/chat`;

type ChatMessage = {
  from?: string;
  message: string;
  system?: boolean;
  type?: string;
};

type User = {
  userId: string;
  username: string;
};

type ChatProps = {
  onClose: () => void;
  username?: string;
  channel: string;
  size?: "sm" | "md" | "lg";
  defaultOpen?: boolean;
};

const sizeClasses = {
  sm: "h-64 w-72",
  md: "h-96 w-[28rem]",
  lg: "h-[32rem] w-[36rem] bottom-6 right-6",
};

const Chat: React.FC<ChatProps> = ({
  onClose,
  username = "Player",
  channel,
  size = "md",
  defaultOpen = true,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const { user } = useAppContext();
  const chatUsername = user?.username || username;

  useEffect(() => {
    if (!defaultOpen) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "setName", username: chatUsername }));
      ws.send(JSON.stringify({ type: "joinChannel", channel }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (["chat", "dm"].includes(data.type)) {
        setMessages((prev) => [
          ...prev,
          { from: data.from, message: data.message, type: data.type },
        ]);
      } else if (data.type === "userJoined") {
        setMessages((prev) => [
          ...prev,
          { message: `✅ ${data.username} joined ${channel}`, system: true },
        ]);
      } else if (data.type === "userLeft") {
        setMessages((prev) => [
          ...prev,
          { message: `❌ ${data.username} left ${channel}`, system: true },
        ]);
      } else if (data.type === "connected") {
        console.log(`[CHAT] Connected with id: ${data.clientId}`);
      } else if (data.type === "channelJoined") {
        console.log(`[CHAT] Joined channel: ${data.channel}`);
      } else if (data.type === "inviteGame") {
        setMessages((prev) => [
          ...prev,
          { message: `🎮 Game invite from ${data.from}`, system: true },
        ]);
      } else if (data.type === "profile") {
        setMessages((prev) => [
          ...prev,
          {
            message: `👤 Profile: ${data.username} (id: ${data.userId})`,
            system: true,
          },
        ]);
      } else if (data.type === "userBlocked") {
        setBlocked((prev) => [...prev, data.username]);
        setMessages((prev) => [
          ...prev,
          { message: `🚫 You blocked ${data.username}`, system: true },
        ]);
      } else if (data.type === "userUnblocked") {
        setBlocked((prev) => prev.filter((u) => u !== data.username));
        setMessages((prev) => [
          ...prev,
          { message: `✅ You unblocked ${data.username}`, system: true },
        ]);
      } else if (data.type === "userList") {
        setUsers(data.users);
      }
    };

    ws.onclose = () => {
      setMessages((prev) => [
        ...prev,
        { message: "⚠️ Disconnected from chat", system: true },
      ]);
    };

    return () => {
      ws.close();
    };
  }, [channel, chatUsername, defaultOpen]);

  const sendMessage = () => {
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      input.trim() !== ""
    ) {
      wsRef.current.send(
        JSON.stringify({ type: "chat", message: input.trim() })
      );
      setInput("");
    }
  };

  const handleAction = (action: string, targetUser: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    switch (action) {
      case "Send private message": {
        const dm = prompt(`Message to ${targetUser}:`);
        if (dm) {
          wsRef.current.send(
            JSON.stringify({ type: "dm", to: targetUser, message: dm })
          );
        }
        break;
      }

      case "Block user":
        wsRef.current.send(
          JSON.stringify({ type: "blockUser", username: targetUser })
        );
        break;

      case "Unblock user":
        wsRef.current.send(
          JSON.stringify({ type: "unblockUser", username: targetUser })
        );
        break;

      case "Invite to game":
        wsRef.current.send(
          JSON.stringify({
            type: "inviteGame",
            to: targetUser,
            gameId: Date.now().toString(),
          })
        );
        break;

      case "View profile":
        wsRef.current.send(
          JSON.stringify({ type: "getProfile", username: targetUser })
        );
        break;

      default:
        break;
    }
  };

  if (!defaultOpen) return null;

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

      <div className="flex flex-1">
        {/* Messages */}
        <div className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded bg-white/10 px-2 py-1 text-white/90"
            >
              {msg.system ? (
                <span>{msg.message}</span>
              ) : (
                <>
                  <span>
                    <span className="font-semibold">{msg.from}</span>:{" "}
                    {msg.message}
                  </span>
                  {msg.from && msg.from !== chatUsername && (
                    <SplitButton targetUser={msg.from} 
                    isBlocked={blocked.includes(msg.from)}   // ✅ add this

                    onAction={handleAction} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Users list */}
        <div className="w-40 border-l border-white/20 bg-gray-800/50 p-2 text-sm overflow-y-auto">
          <h4 className="mb-2 font-semibold">Users</h4>
          {users.map((u) => (
            <div
              key={u.userId}
              className={`flex items-center justify-between rounded px-2 py-1 ${
                blocked.includes(u.username) ? "text-red-400" : "text-white/90"
              }`}
            >
              <span>
                {u.username}
                {u.username === chatUsername && " (You)"}
              </span>
              {u.username !== chatUsername && (
                <SplitButton targetUser={u.username} 
                isBlocked={blocked.includes(u.username)}   // ✅ add this
                onAction={handleAction} />
              )}
            </div>
          ))}
        </div>
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
