import React from 'react';
import { MessageCircleMore } from 'lucide-react';

type ChatToggleButtonProps = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

export default function ChatToggleButton({ open, setOpen }: ChatToggleButtonProps) {
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-label="Toggle chat"
      className="fixed bottom-6 right-6 z-[60] flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20 text-white/80 hover:text-white shadow-lg hover:bg-indigo-500"
      title={open ? 'Close chat' : 'Open chat'}
    >
  <MessageCircleMore className="w-10 h-10 text-white/80 hover:text-indigo-200" aria-hidden="true" />
    </button>
  );
}
