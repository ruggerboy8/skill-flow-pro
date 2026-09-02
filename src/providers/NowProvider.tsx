import React, { createContext, useContext, ReactNode } from 'react';

interface NowContextValue {
  now: () => Date;
}

const NowContext = createContext<NowContextValue | null>(null);

interface NowProviderProps {
  children: ReactNode;
  simulatedTime?: Date;
}

export function NowProvider({ children, simulatedTime }: NowProviderProps) {
  const now = () => simulatedTime || new Date();

  return (
    <NowContext.Provider value={{ now }}>
      {children}
    </NowContext.Provider>
  );
}

export function useNow(): Date {
  const context = useContext(NowContext);
  if (!context) {
    // NowProvider is only mounted when VITE_ENABLE_SIMTOOLS is on
    // (src/main.tsx) -- it exists to inject simulated time. Without it,
    // real time is the correct answer, not a crash: throwing here broke
    // ThisWeekPanel/ConfidenceWizard/PerformanceWizard in any
    // simtools-off build (found 2026-09-02 recording demo clips).
    return new Date();
  }
  return context.now();
}