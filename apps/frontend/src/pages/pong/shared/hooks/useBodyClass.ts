import { useEffect } from 'react';

export function useBodyClass(className: string, active: boolean) {
  useEffect(() => {
    if (!className) return;
    if (active) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
    return () => {
      document.body.classList.remove(className);
    };
  }, [className, active]);
}
