import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

export interface SimOverrides {
  enabled: boolean;
  nowISO?: string;
  masqueradeStaffId?: string | null;
}

interface SimContextValue {
  overrides: SimOverrides;
  updateOverrides: (updates: Partial<SimOverrides>) => void;
  simulatedTime: Date | undefined;
  resetSimulation: () => void;
}

const SimContext = createContext<SimContextValue | null>(null);

const STORAGE_KEY = 'simtools-overrides';

const defaultOverrides: SimOverrides = {
  enabled: false,
  nowISO: undefined,
  masqueradeStaffId: null,
};

interface SimProviderProps {
  children: ReactNode | ((props: { simulatedTime: Date | undefined }) => ReactNode);
}

export function SimProvider({ children }: SimProviderProps) {
  const [overrides, setOverrides] = useState<SimOverrides>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...defaultOverrides, ...JSON.parse(stored) } : defaultOverrides;
    } catch {
      return defaultOverrides;
    }
  });

  const simulatedTime = overrides.enabled && overrides.nowISO 
    ? new Date(overrides.nowISO) 
    : undefined;

  const updateOverrides = (updates: Partial<SimOverrides>) => {
    const newOverrides = { ...overrides, ...updates };
    setOverrides(newOverrides);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newOverrides));
  };

  const resetSimulation = () => {
    setOverrides(defaultOverrides);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <SimContext.Provider value={{ 
      overrides, 
      updateOverrides, 
      simulatedTime,
      resetSimulation 
    }}>
      {typeof children === 'function' ? children({ simulatedTime }) : children}
    </SimContext.Provider>
  );
}

export function useSim(): SimContextValue {
  const context = useContext(SimContext);
  if (!context) {
    // Return safe defaults if used outside provider (e.g., during SSR or before provider mounts)
    return {
      overrides: defaultOverrides,
      updateOverrides: () => {},
      simulatedTime: undefined,
      resetSimulation: () => {},
    };
  }
  return context;
}
