import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Back affordance for mobile-shell pages that are not a tab root. Bordered
 * pill, 44px tall, chevron + label. Navigates(-1) by default (prototype's
 * .backlink). See docs/features/mobile-build-instructions.md section B.5.
 */
export function BackPill({ label = 'Back', to }: { label?: string; to?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-3 min-h-[44px] text-[13px] font-semibold text-primary active:bg-primary/5 mb-3"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
