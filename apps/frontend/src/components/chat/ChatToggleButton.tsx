import React, { useEffect, useState } from 'react';
import { MessageCircleMore } from 'lucide-react';

type ChatToggleButtonProps = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

export default function ChatToggleButton({ open, setOpen }: ChatToggleButtonProps) {
  const [indicatorActive, setIndicatorActive] = useState(false);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const customEvent = ev as CustomEvent<{ active?: boolean }>;
        const detail = customEvent.detail ?? {};
        setIndicatorActive(Boolean(detail.active));
      } catch {
        setIndicatorActive(false);
      }
    };
    window.addEventListener('chat:indicator', handler as EventListener);
    return () => window.removeEventListener('chat:indicator', handler as EventListener);
  }, []);

  const bgClass = open
    ? 'bg-indigo-600'
    : indicatorActive
      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow shadow-indigo-900/40'
      : 'bg-indigo-600/10';

  return (
    <button
      onClick={() => setOpen(!open)}
      aria-label="Toggle chat"
      className={`fixed bottom-6 right-6 z-[60] flex h-16 w-16 cursor-pointer items-center justify-center rounded-full ${bgClass} text-white/80 shadow-lg hover:bg-indigo-600/30 hover:text-white`}
      title={open ? 'Close chat' : 'Open chat'}
    >
      <MessageCircleMore
        className="h-10 w-10 text-white/80 hover:text-indigo-200"
        aria-hidden="true"
      />
    </button>
  );
}
