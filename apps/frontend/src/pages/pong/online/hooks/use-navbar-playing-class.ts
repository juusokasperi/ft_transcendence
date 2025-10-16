import { useEffect } from 'react';
import type { Status } from '../state/types';

const PLAYING_CLASS = 'pong-playing';

export function useNavbarPlayingClass(status: Status) {
  useEffect(() => {
    const shouldAttach = status === 'starting' || status === 'playing';
    if (shouldAttach) {
      document.body.classList.add(PLAYING_CLASS);
    } else {
      document.body.classList.remove(PLAYING_CLASS);
    }
    return () => {
      document.body.classList.remove(PLAYING_CLASS);
    };
  }, [status]);
}
