import React from 'react';

type ChatToggleButtonProps = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

export default function ChatToggleButton({ open, setOpen }: ChatToggleButtonProps) {
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-label="Toggle chat"
      className="z-[60] fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/90 text-white shadow-lg hover:bg-indigo-500"
      title={open ? 'Close chat' : 'Open chat'}
    >
      💬
    </button>
  );
}

