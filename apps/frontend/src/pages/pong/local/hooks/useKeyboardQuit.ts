import { useEffect } from 'react';

export function useKeyboardQuit(active: boolean, onQuit: () => void) {
  useEffect(() => {
    if (!active) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onQuit();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [active, onQuit]);
}
