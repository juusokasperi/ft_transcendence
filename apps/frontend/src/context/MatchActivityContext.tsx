import React, { createContext, useContext, useMemo, useState } from 'react';

type MatchActivityContextValue = {
  active: boolean;
  setActive: (active: boolean) => void;
};

const MatchActivityContext = createContext<MatchActivityContextValue | undefined>(undefined);

export const MatchActivityProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [active, setActive] = useState(false);
  const value = useMemo<MatchActivityContextValue>(
    () => ({
      active,
      setActive,
    }),
    [active],
  );

  return <MatchActivityContext.Provider value={value}>{children}</MatchActivityContext.Provider>;
};

function useMatchActivityContext() {
  const ctx = useContext(MatchActivityContext);
  if (!ctx) {
    throw new Error('MatchActivityContext is missing. Wrap your tree with MatchActivityProvider.');
  }
  return ctx;
}

export function useMatchActivity() {
  return useMatchActivityContext().active;
}

export function useSetMatchActivity() {
  return useMatchActivityContext().setActive;
}
