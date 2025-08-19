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
    throw new Error('useNow must be used within a NowProvider');
  }
  return context.now();
}