/**
 * Domain metadata: centralized name + chip styling
 */
export const DOMAIN_META: Record<number, { name: string; chipClass: string }> = {
  1: { name: 'CONVO', chipClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  2: { name: 'DFI', chipClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  3: { name: 'OM', chipClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  4: { name: 'RDA', chipClass: 'bg-amber-100 text-amber-800 border-amber-200' },
};

export const DRIVER_LABELS = {
  C: { label: 'Confidence', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  R: { label: 'Recency', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  E: { label: 'Eval', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  D: { label: 'Domain', color: 'bg-green-100 text-green-800 border-green-200' },
  M: { label: 'Priority', color: 'bg-pink-100 text-pink-800 border-pink-200' },
};
