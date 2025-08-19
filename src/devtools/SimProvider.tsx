import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

export interface SimOverrides {
  enabled: boolean;
  nowISO?: string;
  forceHasConfidence?: boolean | null;
  forceHasPerformance?: boolean | null;
  forceBacklogCount?: number | null;
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
  forceHasConfidence: null,
  forceHasPerformance: null,
  forceBacklogCount: null,
};

interface SimProviderProps {
  children: ReactNode;
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
      {children}
    </SimContext.Provider>
  );
}

export function useSim(): SimContextValue {
  const context = useContext(SimContext);
  if (!context) {
    throw new Error('useSim must be used within a SimProvider');
  }
  return context;
}