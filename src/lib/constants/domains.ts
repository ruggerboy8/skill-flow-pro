// Domain and driver metadata for the sequencer

export const DOMAIN_META: Record<number, {
  name: string;
  chipClass: string;
}> = {
  1: { name: 'Clinical', chipClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-800' },
  2: { name: 'Clerical', chipClass: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800' },
  3: { name: 'Cultural', chipClass: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900 dark:text-pink-100 dark:border-pink-800' },
  4: { name: 'Case Acceptance', chipClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-800' },
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
