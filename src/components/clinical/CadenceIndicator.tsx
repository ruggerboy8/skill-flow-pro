import { getCadenceInfo } from '@/lib/coachingCadence';

interface Props {
  lastSessionAt: string | null | undefined;
  className?: string;
}

/**
 * Quiet "time since last coaching session" pulse. Informational only — no
 * gates, no notifications. Fresh renders as plain muted text; drifting and
 * stale escalate through the shared status color tokens (not raw Tailwind
 * colors) so it stays consistent with the rest of the design system.
 */
export function CadenceIndicator({ lastSessionAt, className }: Props) {
  const { tone, label } = getCadenceInfo(lastSessionAt);

  if (tone === 'none' || tone === 'fresh') {
    return <span className={`text-sm text-muted-foreground ${className || ''}`}>{label}</span>;
  }

  const style =
    tone === 'drifting'
      ? { color: 'hsl(var(--status-late))' }
      : { color: 'hsl(var(--status-missing))' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className || ''}`} style={style}>
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: tone === 'drifting' ? 'hsl(var(--status-late))' : 'hsl(var(--status-missing))' }}
      />
      {label}
    </span>
  );
}
