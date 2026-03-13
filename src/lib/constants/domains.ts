// Domain and driver metadata for the sequencer
import { getDomainColor, getDomainColorRich } from '@/lib/domainColors';

export const DOMAIN_META: Record<number, {
  name: string;
  chipClass: string;
  /** Inline style for token-driven domain coloring */
  chipStyle: () => React.CSSProperties;
}> = {
  1: { 
    name: 'Clinical', 
    chipClass: 'border-transparent text-foreground',
    chipStyle: () => ({ backgroundColor: getDomainColor('Clinical') }),
  },
  2: { 
    name: 'Clerical', 
    chipClass: 'border-transparent text-foreground',
    chipStyle: () => ({ backgroundColor: getDomainColor('Clerical') }),
  },
  3: { 
    name: 'Cultural', 
    chipClass: 'border-transparent text-foreground',
    chipStyle: () => ({ backgroundColor: getDomainColor('Cultural') }),
  },
  4: { 
    name: 'Case Acceptance', 
    chipClass: 'border-transparent text-foreground',
    chipStyle: () => ({ backgroundColor: getDomainColor('Case Acceptance') }),
  },
};

export const DRIVER_LABELS: Record<string, {
  label: string;
  className: string;
}> = {
  C: { label: 'Confidence', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' },
  R: { label: 'Recency', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' },
  E: { label: 'Eval', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100' },
  D: { label: 'Domain', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' },
};
