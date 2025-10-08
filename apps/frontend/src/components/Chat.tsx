import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import SplitButton from "./ui/SplitButton";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8080/chat`;

type ChatMessage = {
  from?: string;
  message: string;
  system?: boolean;
  type?: string;
};

type UserItem = {
  userId: string;
  username: string;
  isBlocked?: boolean;
};

type ChatProps = {
  onClose: () => void;
  username?: string;
  channel: string;
  size?: "sm" | "md" | "lg";
  defaultOpen?: boolean;
};

const sizeClasses = {
  sm: "h-64 w-80",
  md: "h-96 w-[36rem]",
  lg: "h-[32rem] w-[48rem] bottom-6 right-6",
};

const Chat: React.FC<ChatProps> = ({
  onClose,
  username = "Player",
  channel,
  size = "md",
  defaultOpen = true,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [input, setInput] = useState("");
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { user } = useAppContext();
  const chatUsername = user?.username || username;

  useEffect(() => {
    if (!defaultOpen) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // announce ourselves and join channel
      ws.send(JSON.stringify({ type: "setName", username: chatUsername }));
      ws.send(JSON.stringify({ type: "joinChannel", channel }));
      // no extra getUsers/requestState — server will emit userList on join
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        console.warn("[CHAT] malformed message", ev.data);
        return;
      }

      // full user list sent by server: normalize shape
      if (data.type === "userList" && Array.isArray(data.users)) {
        const mapped = data.users.map((u: any) =>
          typeof u === "string"
            ? { userId: u, username: u }
            : { userId: u.userId ?? u.username, username: u.username }
        );

        // ensure current user is present
        if (!mapped.some((m: any) => m.username === chatUsername)) {
          mapped.push({ userId: "me", username: chatUsername });
        }

        setUsers(
          mapped.map((m: any) => ({
            userId: m.userId,
            username: m.username,
            isBlocked: blockedRef.current.has(m.username),
          }))
        );
        return;
      }

      // plain chat and direct messages
      if (data.type === "chat" || data.type === "dm") {
        // ignore messages from blocked users
        if (data.from && blockedRef.current.has(data.from)) return;

        setMessages((prev) => [
          ...prev,
          { from: data.from, message: data.message, type: data.type },
        ]);
        return;
      }

      // user join/leave system events — server will also send userList after this
      if (data.type === "userJoined") {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `✅ ${data.username} joined ${channel}` },
        ]);
        // don't manually mutate users; wait for server's userList (keeps master sync)
        return;
      }

      if (data.type === "userLeft") {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `❌ ${data.username} left ${channel}` },
        ]);
        // server should emit userList after a leave — handled above
        return;
      }

      // block/unblock confirmations (from server)
      if (data.type === "userBlocked") {
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.add(data.username);
          return copy;
        });
        setMessages((prev) => [...prev, { system: true, message: `🚫 You blocked ${data.username}` }]);
        // also mark in users array if present
        setUsers((prev) => prev.map(u => u.username === data.username ? { ...u, isBlocked: true } : u));
        return;
      }

      if (data.type === "userUnblocked") {
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.delete(data.username);
          return copy;
        });
        setMessages((prev) => [...prev, { system: true, message: `✅ You unblocked ${data.username}` }]);
        setUsers((prev) => prev.map(u => u.username === data.username ? { ...u, isBlocked: false } : u));
        return;
      }

      // profile / invite / other system messages
      if (data.type === "profile") {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `👤 Profile: ${data.username} (id: ${data.userId})` },
        ]);
        return;
      }
      if (data.type === "inviteGame") {
        setMessages((prev) => [
          ...prev,
          { system: true, message: `🎮 Game invite from ${data.from}` },
        ]);
        return;
      }

      // fallthrough: unknown message type — log
      console.debug("[CHAT] unhandled message", data);
    };

    ws.onclose = () => {
      setMessages((prev) => [...prev, { system: true, message: "⚠️ Disconnected from chat" }]);
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
    // intentionally not including `blocked` in deps — blockedRef used in handler
  }, [channel, chatUsername, defaultOpen]);

  // autoscroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // scroll near bottom smoothly
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const text = input.trim();
    if (!text) return;

    if (dmTarget) {
      // send DM
      wsRef.current.send(JSON.stringify({ type: "dm", to: dmTarget, message: text }));
      // show outgoing DM locally (purple)
      setMessages((prev) => [
        ...prev,
        { from: chatUsername, message: `(DM to ${dmTarget}) ${text}`, type: "dm" },
      ]);
      setDmTarget(null);
    } else {
      // send public chat
      wsRef.current.send(JSON.stringify({ type: "chat", message: text }));
    }

    setInput("");
  };

  const handleAction = (action: string, targetUser: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    switch (action) {
      case "Send private message":
        setDmTarget(targetUser);
        break;

      case "Block user":
        // optimistic local update so UI feels snappy
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.add(targetUser);
          return copy;
        });
        setUsers((prev) => prev.map(u => u.username === targetUser ? { ...u, isBlocked: true } : u));
        ws.send(JSON.stringify({ type: "blockUser", username: targetUser }));
        break;

      case "Unblock user":
        setBlocked((prev) => {
          const copy = new Set(prev);
          copy.delete(targetUser);
          return copy;
        });
        setUsers((prev) => prev.map(u => u.username === targetUser ? { ...u, isBlocked: false } : u));
        ws.send(JSON.stringify({ type: "unblockUser", username: targetUser }));
        break;

      case "Invite to game":
        ws.send(JSON.stringify({ type: "inviteGame", to: targetUser, gameId: Date.now().toString() }));
        setMessages((prev) => [...prev, { system: true, message: `🎮 Invite sent to ${targetUser}` }]);
        break;

      case "View profile":
        ws.send(JSON.stringify({ type: "getProfile", username: targetUser }));
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

      {/* Main: messages + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Messages area (flex-1 makes it wider) */}
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm min-h-0">
          {messages.map((msg, i) => {
            if (msg.from && blocked.has(msg.from)) return null; // hide blocked user's messages

            const isMe = msg.from === chatUsername;
            const isDm = msg.type === "dm";

            const containerClass = msg.system
              ? "bg-transparent text-gray-400 italic"
              : isDm && isMe
              ? "bg-purple-700/60 text-purple-200"
              : isDm && !isMe
              ? "bg-blue-700/60 text-blue-200"
              : "bg-white/10 text-white/90";

            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded px-2 py-1 ${containerClass}`}
              >
                {msg.system ? (
                  <span>{msg.message}</span>
                ) : (
                  <>
                    <span>
                      <span className="font-semibold">{msg.from}</span>: {msg.message}
                    </span>
                    {msg.from && msg.from !== chatUsername && (
                      <SplitButton
                        targetUser={msg.from}
                        isBlocked={blocked.has(msg.from)}
                        onAction={handleAction}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar (narrow) */}
        <div className="w-28 border-l border-white/20 overflow-y-auto text-sm bg-transparent">
          <div className="p-2 font-semibold border-b border-white/10">Users</div>
          {users.map((u) => (
            <div
              key={u.userId}
              className={`flex items-center justify-between gap-2 px-2 py-1 ${
                u.isBlocked ? "text-red-400" : u.username === chatUsername ? "text-green-400" : "text-white/90"
              }`}
            >
              <span className="truncate">{u.username}{u.username === chatUsername ? " (you)" : ""}</span>
              {u.username !== chatUsername && (
                <SplitButton
                  targetUser={u.username}
                  isBlocked={!!u.isBlocked}
                  onAction={handleAction}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex border-t border-white/20 items-center px-2 py-2">
        {dmTarget && (
          <div className="mr-2 flex items-center gap-2 rounded bg-red-900/30 px-2 py-1 text-xs text-red-300">
            To {dmTarget}
            <button
              onClick={() => setDmTarget(null)}
              className="ml-1 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        <input
          className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder={dmTarget ? `Message to ${dmTarget}...` : "Type a message..."}
        />
        <button onClick={sendMessage} className="ml-2 px-3 text-indigo-400 hover:text-indigo-300">
          Send
        </button>
      </div>
    </motion.div>
  );
};

export default Chat;
